"""Heat-dissipation inputs for the C0 lift + cruise VTOL.

Reads analysis/results.json (C0 sized, base) and cad/params.txt (geometry) at run time and writes
analysis/thermal/thermal_inputs.json: heat loads per component and mission phase, convection film
coefficients from textbook correlations, material thermal data, mission profile and limits. Every value
carries its source in the "src" strings. Estimates are tagged EST. Consumed by cad/Thermal.cs and
analysis/thermal/thermal_model.py.

Run:  py analysis/thermal/thermal_inputs.py
"""
import json, math, os, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RES = json.load(open(os.path.join(ROOT, 'analysis', 'results.json')))
C0 = RES['concepts']['C0']; S = C0['sized']; B = RES['base']
P = {}
for line in open(os.path.join(ROOT, 'cad', 'params.txt')):
    line = line.strip()
    if not line or line.startswith('comp='): continue
    k, v = line.split('=', 1)
    try: P[k] = float(v)
    except ValueError: P[k] = v

# ---------------- air properties at ~35 C (Incropera, Table A.4, 300-310 K) ----------------
AIR = dict(nu=1.65e-5, k=0.0268, Pr=0.706, src='Incropera & DeWitt, Fundamentals of Heat and Mass Transfer, Table A.4 at ~308 K')
rho = B['rho']

# ---------------- mission (analysis/results.json base + review duty chart) ----------------
t_hover1 = B['tHover'] / 2; t_trans = B['tTrans'] / 2; t_cruise = B['tCruise']
# sizing uses tHover 120 s total and tTrans 40 s total at hover power (sizing.mjs lines 29-30); the review duty
# chart (review/src/app.js drawDuty) splits them 60 / 20 / 600 / 20 / 60 s; test plan F12 requires >= 1 min hover each end
phases = [('hover', t_hover1), ('transition', t_trans), ('cruise', t_cruise), ('transition', t_trans), ('hover', t_hover1)]
t_end = []; t = 0
for n, dt in phases: t += dt; t_end.append(t)
total = t

# ---------------- currents and losses ----------------
V_bus = 21.0  # sizing.mjs line 155: I = P / 21.0 V (loaded 6S)
I_hover = S['I_hover_loaded']; I_trans = S['I_trans']; I_cruise = S['I_cruise']
P_motor_hover = S['P_hover_per_motor']
Q_motor = 0.20 * P_motor_hover      # cad/params.mjs line 62: EST 20 % of hover input per unit -> heat (motor+ESC 80 % eff.)
esc_loss_frac = 0.04                # EST: BLHeli_S 45 A ESC loss at ~10 A (SoloGood publishes no efficiency; dyno studies show a wide range)
Q_esc = esc_loss_frac * P_motor_hover
Q_esc_trans = esc_loss_frac * S['P_trans'] / 4   # transition: P_trans spread over the 4 lift units (sizing: P_hover + 2 P_cruise)
Q_motor_trans = 0.20 * S['P_trans'] / 4
R_cell = 7.5e-3                      # docs/test/TEST-PLAN.md C11 pass limit was 7.5 mOhm/cell when the studies ran; the re-based plan gives 7.3 mOhm (0.30 V / 41.2 A), so the FEA pack is 2.7 % conservative (heat scales linearly with R)
R_pack = 6 * R_cell
Q_batt = {ph: I * I * R_pack for ph, I in (('hover', I_hover), ('transition', I_trans), ('cruise', I_cruise))}
eta_mec = B['etaMEc']
Q_pusher_total = S['P_cruise'] * (1 - eta_mec)   # motor + ESC loss in cruise (sizing etaMEc 0.85)
Q_pusher_motor = 0.75 * Q_pusher_total           # EST split 75 % motor / 25 % ESC
Q_pusher_esc = 0.25 * Q_pusher_total
Q_fc = 3.5                                       # EST: FC + RX + GPS + Remote ID ~0.5 A at 5 V plus UBEC loss ~1 W

# ---------------- prop-wash and cruise velocities ----------------
T_unit = S['Tunit_N']; A_disc = S['A']
v_i = math.sqrt(T_unit / (2 * rho * A_disc))     # momentum theory induced velocity at the disc
V_c = B['Vc']

def hilpert(V, D):
    """Cylinder in crossflow, Hilpert correlation (Incropera eq. 7.52, Table 7.2), air."""
    Re = V * D / AIR['nu']
    if Re < 4: C, m = 0.989, 0.330
    elif Re < 40: C, m = 0.911, 0.385
    elif Re < 4000: C, m = 0.683, 0.466
    elif Re < 40000: C, m = 0.193, 0.618
    else: C, m = 0.027, 0.805
    Nu = C * Re ** m * AIR['Pr'] ** (1 / 3)
    return Nu * AIR['k'] / D, Re, Nu

def plate(V, L):
    """Flat plate, average Nu: laminar 0.664 Re^0.5 Pr^1/3 (Re < 5e5) else mixed 0.037 Re^0.8 - 871 (Incropera eq. 7.30/7.38)."""
    Re = V * L / AIR['nu']
    Nu = 0.664 * Re ** 0.5 * AIR['Pr'] ** (1 / 3) if Re < 5e5 else (0.037 * Re ** 0.8 - 871) * AIR['Pr'] ** (1 / 3)
    return Nu * AIR['k'] / L, Re, Nu

def natural_cyl(D, dT):
    """Horizontal cylinder, Churchill-Chu (Incropera eq. 9.34), air at ~308 K."""
    g = 9.81; beta = 1 / 308.15; alpha = AIR['nu'] / AIR['Pr']
    Ra = g * beta * dT * D ** 3 / (AIR['nu'] * alpha)
    Nu = (0.60 + 0.387 * Ra ** (1 / 6) / (1 + (0.559 / AIR['Pr']) ** (9 / 16)) ** (8 / 27)) ** 2
    return Nu * AIR['k'] / D, Ra, Nu

motorD, motorH = P['motorD'], P['motorH']
boomOD = P['boomOD']
mount = dict(len_m=0.070, width_m=0.046, top_m=0.021, bot_m=0.015, bore_m=0.0256,
             src='docs/research/hardware-spec.md J02: block 70 x 46, cap y -15.0..-0.6, upper +0.6..+21.0, bore 25.6')
esc = dict(len_m=0.055, width_m=0.028, height_m=0.012, pad_m=0.003, x_m=0.075,
           src='EST dims (SoloGood listing gives none, hardware-spec J15 "—"); 3 mm foam pad on the boom underside ahead of the mount (J15)')
fc = dict(len_m=0.052, width_m=0.032, height_m=0.017, src='hardware-spec.md J15: CoreWing F405 Wing V2 52 x 32 x 17 mm')
cup = dict(od_m=0.0556, floor_m=0.0045, wall_m=0.003, len_m=0.030, ring_od_m=0.080,
           src='cad/mesh/meta.json Pusher_Cup: PA6-CF cup dia 55.6 x 30 long with a 4.5 mm floor, inside the 56 pod tail ring (hardware-spec J12); wall 3.0 and foam ring OD 80 EST; the 32 mm can protrudes 6.5 mm past the cup rim')

h_motor_hover, Re_m, Nu_m = hilpert(v_i, motorD)
h_boom_hover, Re_b, Nu_b = hilpert(v_i, boomOD)
h_mount_hover, Re_mt, Nu_mt = plate(v_i, mount['len_m'])
h_esc_hover, Re_e, Nu_e = plate(v_i, esc['len_m'])
h_motor_cruise, _, _ = hilpert(V_c, motorD)
h_boom_cruise, _, _ = hilpert(V_c, boomOD)
h_pod_cruise, Re_p, Nu_p = plate(V_c, P['fusL'])
h_pod_hover, Ra_p, _ = natural_cyl(2 * P['fusR'], 10.0)
h_pusher_motor_cruise, Re_pm, Nu_pm = plate(V_c, P['pushMotorL'])
h_mount_cruise, _, _ = plate(V_c, mount['len_m'])
h_esc_cruise, _, _ = plate(V_c, esc['len_m'])
motor_vol = math.pi * (motorD / 2) ** 2 * motorH
h_bay_natural = 5.0   # EST: natural convection in a closed bay, ~5 W/m2K (Incropera Table 1.1 free convection gases 2-25)
h_pod_mission_avg = (h_pod_hover * (2 * t_hover1 + 2 * t_trans) + h_pod_cruise * t_cruise) / total

# battery heat time curve (factor on the hover value) for the SOLIDWORKS transient
ref = Q_batt['hover']
curve = []
t0 = 0
for n, dt in phases:
    f = Q_batt[n] / ref
    curve.append(dict(t=round(t0, 2), f=round(f, 5))); curve.append(dict(t=round(t0 + dt - 0.01, 2), f=round(f, 5)))
    t0 += dt
# lift-unit heat curve (factor on the hover motor value): hover 1, transition P_trans/4 / P_hover_per_motor, cruise 0 (lift motors stopped)
curve_lift = []
t0 = 0
for n, dt in phases:
    f = {'hover': 1.0, 'transition': (S['P_trans'] / 4) / P_motor_hover, 'cruise': 0.0}[n]
    curve_lift.append(dict(t=round(t0, 2), f=round(f, 5))); curve_lift.append(dict(t=round(t0 + dt - 0.01, 2), f=round(f, 5)))
    t0 += dt

out = {
  'generated': datetime.date.today().isoformat(),
  'sources': {
    'results': 'analysis/results.json generated ' + RES['generated'] + ' (C0 sized: P_hover %.1f W, P_hover_per_motor %.1f W, P_cruise %.1f W, P_trans %.0f W, I_hover_loaded %.1f A, I_trans %.1f A, I_cruise %.1f A, Tunit %.2f N, A %.4f m2, MTOW %.2f kg)' % (S['P_hover'], P_motor_hover, S['P_cruise'], S['P_trans'], I_hover, I_trans, I_cruise, T_unit, A_disc, S['m']),
    'params': 'cad/params.txt (motorD, motorH, boomOD, boomID, battL/H/W, fusL, fusR, pushMotorD/L, bay*, batt*)',
    'air': AIR['src'],
  },
  'ambient': {'hot_C': 35.0, 'hot_K': 308.15, 'std_C': 20.0, 'std_K': 293.15,
              'src': 'hot day 35 C = cad/params.mjs thermAmbK (EST, no R-number); standard 20 C EST (ISA +5, Berkeley spring)'},
  'mission': {
    'phases': [dict(name=n, dt_s=dt) for n, dt in phases], 'total_s': total,
    't_end_hover1_s': t_end[0], 't_end_trans1_s': t_end[1], 't_end_cruise_s': t_end[2], 't_end_trans2_s': t_end[3],
    'cruise_s': t_cruise, 'hover_transient_s': 120.0, 'pod_dt_s': 10.0,
    'cruise_avail_min': S['t_cruise_avail_min'],
    'batt_curve': curve, 'lift_curve': curve_lift,
    'src': 'analysis/sizing.mjs tHover 120 s / tTrans 40 s / tCruise 600 s (R10) split as review/src/app.js drawDuty: 60-20-600-20-60 s; F12 (docs/test/TEST-PLAN.md) >= 1 min hover each end; hover-only flights <= 60 s per hover (test plan rule 3), bench C08 90 s',
  },
  'loads': {
    'lift_motor_W': Q_motor, 'lift_motor_trans_W': Q_motor_trans, 'lift_esc_W': Q_esc, 'lift_esc_trans_W': Q_esc_trans,
    'batt_hover_W': Q_batt['hover'], 'batt_trans_W': Q_batt['transition'], 'batt_cruise_W': Q_batt['cruise'], 'batt_curve_ref_W': ref,
    'pusher_motor_W': Q_pusher_motor, 'pusher_esc_W': Q_pusher_esc, 'fc_W': Q_fc,
    'R_pack_ohm': R_pack, 'R_cell_test_plan_now_ohm': 7.3e-3, 'V_bus': V_bus,
    'src': {
      'lift_motor': 'EST 20 %% of P_hover_per_motor %.1f W (cad/params.mjs thermQ rule, 80 %% motor+ESC efficiency); the same figure cad/sim/results.txt motor_Q uses' % P_motor_hover,
      'lift_esc': 'EST 4 % of unit input (no SoloGood efficiency published; TI SSZTB57: FET conduction loss = I_rms^2 R_ds(on), 60-80 % of inverter loss)',
      'battery': 'I^2 R with R_pack = 6 x 7.5 mOhm (docs/test/TEST-PLAN.md C11 pass limit at run time; now 7.3 mOhm, so the result is 2.7 % conservative); I from results.json sized I_hover_loaded / I_trans / I_cruise (P / 21 V, sizing.mjs line 155)',
      'pusher': 'P_cruise x (1 - etaMEc 0.85) = %.1f W (results.json base.etaMEc), split 75/25 motor/ESC EST; the pusher is a SunnySky X4110S 400KV, the same motor as the lift units (docs/purchasing/C0_BOM.csv line "X4110S 400KV (pusher)", analysis/sizing.mjs PUSHER = X4110S); SunnySky publishes no thermal data (—)' % Q_pusher_total,
      'fc': 'EST 3.5 W: CoreWing F405 + RP3 + M100 GPS + BeeID ~0.5 A at 5 V plus ZORZA UBEC loss',
    },
  },
  'flow': {'v_i_mps': v_i, 'v_wake_mps': 2 * v_i, 'V_cruise_mps': V_c,
           'src': 'v_i = sqrt(T / (2 rho A)) with T = sized.Tunit_N %.2f N, A = sized.A %.4f m2, rho %.3f (momentum theory); far wake 2 v_i' % (T_unit, A_disc, rho)},
  'h': {
    'motor_hover': h_motor_hover, 'boom_hover': h_boom_hover, 'mount_hover': h_mount_hover, 'esc_hover': h_esc_hover,
    'motor_cruise': h_motor_cruise, 'boom_cruise': h_boom_cruise, 'mount_cruise': h_mount_cruise, 'esc_cruise': h_esc_cruise, 'pod_cruise': h_pod_cruise, 'pod_hover': h_pod_hover,
    'pod_mission_avg': h_pod_mission_avg, 'pusher_motor_cruise': h_pusher_motor_cruise, 'cup_inner_cruise': 0.5 * h_pusher_motor_cruise,
    'bay_natural': h_bay_natural, 'radiation_equiv': 4 * 0.9 * 5.67e-8 * 330 ** 3,
    'detail': {
      'motor_hover': 'Hilpert cylinder crossflow at v_i, D %.3f m: Re %.0f, Nu %.1f' % (motorD, Re_m, Nu_m),
      'boom_hover': 'Hilpert at v_i, D %.4f m: Re %.0f, Nu %.1f' % (boomOD, Re_b, Nu_b),
      'mount_hover': 'laminar flat plate at v_i, L %.3f m: Re %.0f, Nu %.1f' % (mount['len_m'], Re_mt, Nu_mt),
      'esc_hover': 'laminar flat plate at v_i, L %.3f m: Re %.0f, Nu %.1f' % (esc['len_m'], Re_e, Nu_e),
      'pod_cruise': 'mixed flat plate at V_c, L %.2f m: Re %.3g, Nu %.0f' % (P['fusL'], Re_p, Nu_p),
      'pod_hover': 'Churchill-Chu horizontal cylinder D %.2f m, dT 10 K: Ra %.3g (pod sits between the rotors, wash on the pod neglected)' % (2 * P['fusR'], Ra_p),
      'pusher_motor_cruise': 'laminar flat plate at V_c over the can length %.3f m: Re %.0f, Nu %.1f (axial flow + prop inflow, EST)' % (P['pushMotorL'], Re_pm, Nu_pm),
      'cup_inner': 'EST half the motor value (sheltered annulus)',
      'bay_natural': 'EST 5 W/m2K (closed bay, free convection in gases 2-25 W/m2K, Incropera Table 1.1)',
      'radiation_equiv': 'linearised 4 eps sigma T^3 at 330 K, eps 0.9 EST (black heat-shrink / anodised); not applied in the FEA (conservative), shown for scale',
    },
    'src': 'Incropera & DeWitt, Fundamentals of Heat and Mass Transfer, 6th ed.: eq. 7.52 + Table 7.2 (Hilpert), eq. 7.30 / 7.38 (flat plate), eq. 9.34 (Churchill-Chu)',
  },
  'materials': {
    'motor': {'k': 30.0, 'cp': 470.0, 'rho': P['motorMass'] / motor_vol, 'cp_lo': 385.0, 'cp_hi': 500.0,
              'src': 'lumped motor: mass 0.165 kg (params.txt motorMass, SunnySky X4110S 165 g, budget-lift.md A3) over the modelled can volume %.1f cm3; cp 470 J/kgK EST mass-weighted copper 385 / steel 460 / aluminium 896 (review/src/app.js TH, band 385-500); k 30 W/mK EST (laminated steel + copper + air gaps, well below solid aluminium)' % (motor_vol * 1e6)},
    'pusher': {'rho': P['motorMass'] / (math.pi * (P['pushMotorD'] / 2) ** 2 * P['pushMotorL']), 'src': 'SunnySky X4110S 165 g (cad/params.txt motorMass, budget-lift.md A3; sizing.mjs mPusherSet: pusher = lift motor type) over the modelled can volume (params.txt pushMotorD/L = motorD/H)'},
    'al6061': {'k': 167.0, 'cp': 896.0, 'rho': 2700.0, 'src': 'SOLIDWORKS material library "6061-T6 (SS)" (cad/params.txt matLib): k 167 W/mK, c 896 J/kgK, rho 2700'},
    'pa6cf': {'k': 0.35, 'cp': 1500.0, 'rho': 1170.0, 'HDT_C': 173.0,
              'src': 'density 1.17 g/cm3 and HDT 173 C at 1.8 MPa: Polymaker Fiberon PA6-CF20 TDS v1.1 (docs/research/airframe-materials.md); k 0.35 W/mK and cp 1500 J/kgK EST (unfilled PA6 ~0.25 W/mK, 1600 J/kgK; CF raises k)'},
    'petg': {'HDT_C': 68.0, 'Tg_C': 80.0, 'src': 'Prusament PETG TDS v1.1 (2022): HDT 68 C at 0.45 and 1.80 MPa; Tg ~80 C (MatterHackers PETG sheet), checked 2026-10-25'},
    'xps': {'k': 0.0289, 'cp': 1300.0, 'rho': B['rhoFoam'], 'max_use_C': 74.0,
            'src': 'Owens Corning FOAMULAR 150: R-5 per inch (RSI 0.88 m2K/W per 25.4 mm -> k = 0.0254/0.88 = 0.0289 W/mK), max use 165 F = 74 C (product data sheet, checked 2026-10-25); cp 1300 J/kgK EST (polystyrene); rho 32 kg/m3 = sizing rhoFoam'},
    'lipo': {'k': 1.0, 'cp': 1100.0, 'rho': S['m_batt'] / (P['battL'] * P['battH'] * P['battW']), 'limit_C': 60.0,
             'src': 'cp ~1100 J/kgK: Lin et al., arXiv 2112.09768 (20 Ah LFP pouch, 541 J/K / 0.489 kg) and Chalmers calorimetry; k 1.0 W/mK EST (through-plane 0.5-1, in-plane 20-30); rho = pack mass 0.82 kg (results.json pick.kg) / box 155 x 50 x 48 (params.mjs EST); 60 C limit docs/test/TEST-PLAN.md C11 / post-flight rule 8'},
    'foam': {'k': 0.04, 'cp': 1300.0, 'rho': 40.0, 'src': 'EST: 3 mm foam mounting pad (hardware-spec J15)'},
    'esc': {'k': 5.0, 'cp': 800.0, 'rho': 1500.0, 'src': 'EST lump: FR4 + FETs + heat-shrink'},
  },
  'limits': {
    'motor_can_C': 80.0, 'esc_C': 70.0, 'lipo_C': 60.0, 'pa6cf_HDT_C': 173.0, 'petg_HDT_C': 68.0, 'xps_C': 74.0, 'wire_connector_C': 60.0,
    'src': 'motor can 80 C EST and ESC 70 C EST: docs/test/TEST-PLAN.md abort table and C08 (X4110S and SoloGood publish no limit, "—"); LiPo 60 C: TEST-PLAN rule 8 / C11; connectors 60 C: G04; PA6-CF HDT 173 C: Polymaker TDS; PETG HDT 68 C: Prusament TDS; XPS 74 C: FOAMULAR data sheet',
  },
  'mount': mount, 'esc': esc, 'fc': fc, 'cup': cup,
  'boom': {'segment_m': 0.40, 'src': 'modelled boom segment 0.40 m centred on the mount (EST; front boom 0.966 m, params.txt segF)'},
  'geometry_src': 'cad/params.txt: motorD %.3f, motorH %.3f, boomOD %.4f, boomID %.4f, battL/H/W %.3f/%.3f/%.3f, fusL %.2f, fusR %.2f, pushMotorD/L %.3f/%.3f' % (motorD, motorH, boomOD, P['boomID'], P['battL'], P['battH'], P['battW'], P['fusL'], P['fusR'], P['pushMotorD'], P['pushMotorL']),
}
path = os.path.join(ROOT, 'analysis', 'thermal', 'thermal_inputs.json')
json.dump(out, open(path, 'w'), indent=1)
print('wrote', path)
print('v_i %.2f m/s; h motor %.1f boom %.1f mount %.1f esc %.1f pod cruise %.1f pod hover %.1f pusher %.1f W/m2K' % (v_i, h_motor_hover, h_boom_hover, h_mount_hover, h_esc_hover, h_pod_cruise, h_pod_hover, h_pusher_motor_cruise))
print('Q motor %.1f W, esc %.1f W, batt hover/trans/cruise %.1f/%.1f/%.1f W, pusher motor %.1f W, fc %.1f W' % (Q_motor, Q_esc, Q_batt['hover'], Q_batt['transition'], Q_batt['cruise'], Q_pusher_motor, Q_fc))
