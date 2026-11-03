#!/usr/bin/env python3
"""A1 wingtip cruise propellers: every number in design.md / metrics.json comes from this script.
Run: python3 -I calc.py   (reads ../../../analysis/results.json; writes calc_out.json)
Frame: model X fwd (from wing LE), Y up, Z right, metres. EST = estimate, not a measurement.
"""
import json, math, os
import numpy as np
from scipy.linalg import eigh

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, '../../../analysis/results.json')))
C0 = R['concepts']['C0']
S0 = C0['sized']; P = C0['params']; CG0 = C0['cg']
g = 9.80665
out = {}

# ---------------------------------------------------------------- geometry of the tip installation (design choices, EST)
Z_AX = 1.228          # nacelle / prop axis, spanwise (panel tip face z=1.200 + nacelle radius 0.029 - 0.001)
Y_AX = 0.012          # axis height above chord line
X_PROP = 0.077        # prop plane ahead of wing LE (mirror of C0 pusher offsets: motor base 0.039, motor 0.032, prop +0.006)
D_PROP = 0.3556       # APC 14x8.5 (cad/params.txt pushProp)
R_PROP = D_PROP / 2
out['width_m'] = 2 * (Z_AX + R_PROP)
out['disk_outer_z'] = Z_AX + R_PROP
out['margin_to_3m_m'] = 3.0 - out['width_m']
out['span_m'] = P['span']

# ---------------------------------------------------------------- mass of one tip assembly (g) and its centroid
# (name, mass_g, x, z_for_inertia, source/basis)
tip = [
 ('motor X4110S 400KV',            165.0,  0.055, Z_AX, 'sunnyskyusa.com X4110S page 165 g (2026-11-02)'),
 ('ESC SoloGood 45A',               15.0, -0.015, Z_AX, 'inventory/electrical/components.json ESC_P mass_g 15 (EST)'),
 ('capacitor 470uF',                 4.0, -0.045, Z_AX, 'EST'),
 ('prop APC 14x8.5E/EP',            37.1,  0.077, Z_AX, 'apcprop.com 1.31 oz x 28.35 (2026-11-02)'),
 ('prop adapter+plate+screws',      12.0,  0.079, Z_AX, 'EST (supplied with motor; mass not on page)'),
 ('spinner 42 mm printed',           8.0,  0.100, Z_AX, 'EST'),
 ('spinner screws+washers',          2.0,  0.082, Z_AX, 'EST'),
 ('nacelle shell PETG 0.5 mm',      28.0, -0.060, Z_AX, 'EST: Swet 0.0384 m2 x 0.5 mm x 1.27 g/cc = 24 g + 4 g'),
 ('nacelle mount PA6-CF (block+keel+ring)', 45.0, -0.030, Z_AX, 'EST from volumes x 1.2 g/cc x infill'),
 ('epoxy / fillets',                 8.0, -0.060, Z_AX, 'EST'),
]
tube = [  # spanwise stiffener, mean z ~ 1.04
 ('Al tube ext 25.4x0.889x342',     63.2, -0.0716, 1.05, 'area 68.48 mm2 x 342 mm x 2.7 g/cc (cad/params.txt matRho)'),
 ('splice sleeve 22.225x1.473x74',  19.2, -0.0716, 0.88, 'area 96.0 mm2 x 74 mm x 2.7 g/cc'),
]
wire = [
 ('12 AWG BUS1->J1 leg 2 x 0.415 m',  29.9, 0.00, 0.05, '36 g/m EST (Cu 29.65 g/m + silicone); from P-06 12 AWG stock left after W08 is deleted'),
 ('14 AWG J1->ESC 2 x 1.30 m',        62.4, -0.06, 0.70, '24 g/m EST (Cu 18.64 g/m + silicone); P-07 14 AWG stock'),
 ('DShot lead 1.9 m',                  3.0, -0.06, 0.70, 'EST'),
 ('XT60H + JR pair at J1',            10.0, -0.12, 0.09, 'EST'),
]
def msum(l): return sum(a[1] for a in l)
tip_g = msum(tip) + msum(tube) + msum(wire)
out['tip_mass_g_each'] = round(tip_g, 1)
out['tip_total_kg'] = round(2 * tip_g / 1000, 4)
nac_g = msum(tip)
out['nacelle_group_g_each'] = round(nac_g, 1)

# removed with the pusher (g)
rem = [
 ('pusher set motor+ESC+prop (results.json mPusherSet)', 227.0, -0.418),
 ('pusher adapter+plate (EST, as tip)',                   12.0, -0.435),
 ('pusher spinner (EST)',                                  8.0, -0.460),
 ('firewall PA6-CF (HW-034, EST)',                        14.0, -0.397),
 ('W08 12 AWG pair 0.613 m x2 x 37 g/m (EST)',            45.4, -0.20),
 ('W15 phase+W25 DShot (EST)',                             5.0, -0.36),
 ('CAP_P (EST)',                                           4.0, -0.34),
 ('pusher screws/washers/inserts (23 pcs, EST)',           8.0, -0.395),
]
rem_g = sum(r[1] for r in rem)
out['removed_g'] = rem_g
extra_g = 16.0 + 12.0   # battery trunk extension + tray rails (EST)
dm = (2 * tip_g - rem_g + extra_g) / 1000
out['extra_g_battery_move'] = extra_g
out['delta_mass_kg'] = round(dm, 4)
m0 = S0['m']; m1 = m0 + dm
out['mass_C0_kg'] = m0; out['mass_kg'] = round(m1, 4)

# ---------------------------------------------------------------- CG (battery re-placed to hold CG at the C0 target, as sizing.mjs does)
items = {i['name']: [i['m'], i['x']] for i in CG0['items']}
target = CG0['target']
def cg_with(items):
    # solve battery x so total CG = target
    others = {k: v for k, v in items.items() if not k.startswith('Battery')}
    M = sum(v[0] for v in others.values()) + items['Battery (placed for CG)'][0]
    mom = sum(v[0] * v[1] for v in others.values())
    mb = items['Battery (placed for CG)'][0]
    xb = (target * M - mom) / mb
    return M, xb
M0, xb0 = cg_with(items)
out['C0_cg_check'] = {'M': round(M0, 4), 'xb': round(xb0, 4), 'xb_listed': CG0['xb']}
it1 = {k: list(v) for k, v in items.items()}
it1.pop('Pusher set')
it1['Wiring'][0] += 0.016   # battery trunk W02 +0.165 m x2 10 AWG (EST)
it1['Battery tray extension'] = [0.012, -0.10]   # PETG rails (EST)
# wiring: C0 wiring item stays (it includes W08 etc.; we subtract removal below)
it1['Wiring'][0] -= (45.4 + 5.0) / 1000
it1['Tip nacelle groups (2)'] = [2 * nac_g / 1000, sum(a[1] * a[2] for a in tip) / nac_g]
it1['Tip spar extensions + sleeves (2)'] = [2 * msum(tube) / 1000, -0.0716]
it1['Tip wiring + connectors (2)'] = [2 * msum(wire) / 1000, sum(a[1] * a[2] for a in wire) / msum(wire)]
it1['Fuselage pod'][0] -= (14 + 4 + 8 + 12 + 8) / 1000 * 0  # pod mass stays; firewall etc are inside the removed list below
# remaining removed items (adapter, spinner, firewall, cap, screws) were not separate lines in the CG list: take them from the pod line
it1['Fuselage pod'][0] -= (12 + 8 + 14 + 4 + 8) / 1000
M1, xb1 = cg_with(it1)
out['mass_cg_list_kg'] = round(M1, 4)
out['battery_x_C0'] = round(xb0, 4); out['battery_x_A1'] = round(xb1, 4)
out['battery_shift_aft_m'] = round(xb0 - xb1, 4)
# CG if battery were NOT moved
mom1 = sum(v[0] * v[1] for k, v in it1.items())
out['cg_x_battery_not_moved_m'] = round(mom1 / M1, 4)
mac = C0['sized']['chord']
out['cg_target_m'] = target
out['cg_pct_mac'] = round(-target / mac * 100, 2)

# ---------------------------------------------------------------- roll inertia about the x axis through CG (EST, lumped)
def Ixx_c0():
    lift = 0.968 * 0.4337**2
    booms = 0.602 * 0.4337**2
    wing = 1.19 * ((1.2**3 - 0.08**3) / (3 * 1.12))
    tail = 0.114 * 0.4337**2 * 0.6
    gear = 0.325 * 0.4337**2
    servos = 2 * 0.054 * 0.8**2 + 2 * 0.054 * 0.42**2
    wiring = 0.37 * 0.15
    centre = (m0 - (0.968 + 0.602 + 1.19 + 0.114 + 0.325 + 0.216 + 0.37)) * 0.05**2
    return lift + booms + wing + tail + gear + servos + wiring + centre
I0 = Ixx_c0()
dI = 0.0
for a in tip:  dI += 2 * a[1] / 1000 * Z_AX**2
for a in tube: dI += 2 * a[1] / 1000 * a[3]**2
# wire runs along the wing: mean z^2 of uniform run 0.09..1.2
zz = (1.2**3 - 0.09**3) / (3 * 1.11)
for a in wire[1:3]: dI += 2 * a[1] / 1000 * zz
dI += 2 * (wire[0][1]+wire[3][1]) / 1000 * 0.09**2
out['Ixx_C0_kgm2'] = round(I0, 3); out['Ixx_A1_kgm2'] = round(I0 + dI, 3); out['Ixx_ratio'] = round((I0 + dI) / I0, 2)

# ---------------------------------------------------------------- hover / endurance (sizing model F3, F8, F9; thrust table in params)
tab = P['thrustTable']  # [thrust g, electrical W per motor]
def pel(Tg):
    xs = [t[0] for t in tab]; ys = [t[1] for t in tab]
    return float(np.interp(Tg, xs, ys))
def hover(m):
    Tg = m / 4 * 1000
    return 4 * pel(Tg) * P['kCtrl'], Tg
Ph0, Tg0 = hover(m0); Ph1, Tg1 = hover(m1)
scale = S0['P_hover'] / Ph0              # calibrate to the repo's 831.98 W
Ph1c = Ph1 * scale
out['hover_W_C0'] = S0['P_hover']; out['hover_W'] = round(Ph1c, 1)
out['hover_ratio'] = round(Ph1c / S0['P_hover'], 3)
out['TW_C0'] = round(4 * P['Tmax_g'] / (m0 * 1000), 3); out['TW'] = round(4 * P['Tmax_g'] / (m1 * 1000), 3)
out['hover_per_motor_g'] = round(Tg1, 0)
# cruise: drag polar F6 with fixed wing S, e, CD0; nacelle CdA; tip-vortex benefit
rho = 1.225; V = 20.0; q = 0.5 * rho * V**2
S = S0['S']; AR = S0['AR']
CD0_C0 = S0['CD0']
def polar(m, e, dCdA=0.0, dCD0=0.0):
    W = m * g
    CL = W / (q * S)
    CDi = CL**2 / (math.pi * e * AR)
    CD = CD0_C0 + dCdA / S + dCD0 + CDi
    return CL, CDi, CD, CD * q * S
CL0, CDi0, CDc0, D0 = polar(m0, P['e'])
out['C0_polar'] = {'CL': round(CL0, 4), 'CDi': round(CDi0, 5), 'CD': round(CDc0, 5), 'D_N': round(D0, 3), 'repo_D': round(S0['D_cruise'], 3)}
# Sinnige 2019 benefit scaled by thrust coefficient
J = 0.60
T_each = None
def prop_ct(T):
    n = V / (J * D_PROP)
    return T / (rho * n**2 * D_PROP**4), n * 60
# nacelle drag
def nacelle_cdA():
    L_cyl = 0.033 + 0.10; L_tail = 0.12
    Swet = math.pi * 0.058 * L_cyl + math.pi * (0.029 + 0.008) * math.hypot(L_tail, 0.021)
    Lt = L_cyl + L_tail
    Re = V * Lt / 1.5e-5
    cf = 0.0035
    ff = 1 + 60 / (Lt / 0.058)**3 + 0.0025 * (Lt / 0.058)
    cdA = cf * ff * Swet * 1.10 * 1.15   # x1.10 junction interference, x1.15 slipstream wash
    return Swet, Re, ff, cdA
Swet, Re, ff, cdA_n = nacelle_cdA()
out['nacelle'] = {'Swet_m2': round(Swet, 4), 'Re_L': round(Re), 'FF': round(ff, 3), 'CdA_each_m2': round(cdA_n, 6)}
cdA_total = 2 * cdA_n
# thrust per prop at cruise (A1) -> CT
CL1_0, CDi1_0, CD1_0, D1_noe = polar(m1, P['e'], cdA_total)
T_each = D1_noe / 2
ct, rpm = prop_ct(T_each)
out['prop_each'] = {'T_N': round(T_each, 2), 'J_assumed': J, 'rpm_est': round(rpm), 'CT': round(ct, 4), 'CT_Sinnige': 0.12,
                    'CT_ratio': round(ct / 0.12, 3)}
ratio = ct / 0.12
res = {}
for label, de in (('low', 0.20), ('central', 0.30), ('high', 0.40)):
    gain = de * ratio                       # Delta e / e, linear in CT (EST)
    e1 = P['e'] * (1 + gain)
    CL, CDi, CD, D = polar(m1, e1, cdA_total)
    res[label] = {'de_pct': round(gain * 100, 2), 'e': round(e1, 4), 'CL': round(CL, 4), 'CDi': round(CDi, 5), 'CD': round(CD, 5), 'D_N': round(D, 3),
                  'LD': round(CL / CD, 3)}
out['cruise'] = res
# benefit alone (same mass): induced-drag term
gain_c = 0.30 * ratio
CLm, CDi_m, CD_m, D_m = polar(m1, P['e'])
CLm2, CDi_m2, CD_m2, D_m2 = polar(m1, P['e'] * (1 + gain_c))
out['tipvortex_benefit_N'] = round(D_m - D_m2, 3)
out['tipvortex_benefit_pct_of_D0'] = round((D_m - D_m2) / D0 * 100, 2)
out['nacelle_drag_N'] = round(cdA_total * q, 3)
out['mass_induced_penalty_N'] = round(D_m - D0 - 0, 3)
etaP = P['etaProp']; etaM = P['etaMEc']
def Pcr(D, eta=etaP): return D * V / (eta * etaM)
Pc0 = S0['P_cruise']
out['cruise_W_C0'] = round(Pc0, 1)
for k in res: res[k]['P_cruise_W'] = round(Pcr(res[k]['D_N']), 1)
# ideal-actuator-disc upside of two lightly loaded props (not in central case)
def eta_i(T, n_props):
    A = math.pi * R_PROP**2
    CTs = (T / n_props) / (0.5 * rho * V**2 * A)
    return 2 / (1 + math.sqrt(1 + CTs))
out['eta_ideal_1prop'] = round(eta_i(D0, 1), 4); out['eta_ideal_2prop'] = round(eta_i(D0, 2), 4)
out['eta_ideal_gain_pct'] = round((out['eta_ideal_2prop'] / out['eta_ideal_1prop'] - 1) * 100, 2)
Pcen = res['central']['P_cruise_W']
# endurance
E_pack = 144.3; Eus = E_pack * P['etaBatt'] * (1 - P['reserve'])
def endur(Ph, Pc):
    return (Eus - Ph * (P['tHover'] + P['tTrans']) / 3600) / Pc * 60
out['E_usable_Wh'] = round(Eus, 2)
out['endurance_C0_min'] = round(endur(S0['P_hover'], Pc0), 2)
for k in res: res[k]['endurance_min'] = round(endur(Ph1c, res[k]['P_cruise_W']), 2)
out['endurance_min'] = res['central']['endurance_min']
# ---- stability: prop normal force (EST) on the CLa/NP of the aircraft
CLa = 5.33062  # aero.json full_CLa_per_rad
qS = q * S
A_disk = math.pi * R_PROP**2
arm_np = X_PROP - target       # prop plane ahead of CG (CG is at x = target)
for cn in (0.25, 0.5, 0.75):
    dNp = 2 * cn * q * A_disk                   # N per rad, both props
    dxnp = dNp * (arm_np + 0 * target) / (CLa * qS)   # NP shift forward, m (lift-slope-weighted)
    out.setdefault('np_shift', {})[str(cn)] = {'dNp_N_per_rad': round(dNp, 2), 'NP_shift_m': round(-dxnp, 4), 'dSM_pct_MAC': round(-dxnp / mac * 100, 2)}
SM0 = 19.632
dsm = out['np_shift']['0.5']['dSM_pct_MAC']
out['SM_pct_C0'] = SM0
out['SM_pct'] = round(SM0 + dsm, 1)
out['SM_pct_range'] = [round(SM0 + out['np_shift']['0.75']['dSM_pct_MAC'], 1), round(SM0 + out['np_shift']['0.25']['dSM_pct_MAC'], 1)]
# directional: prop side force on both tips (ahead of CG) vs fins
Sv = C0['geo']['Sv']; lh = 0.73
av = 2 * math.pi * 1.25 / (2 + math.sqrt(4 + 1.25**2))   # Helmbold fin, AR 1.25
Nb_fin = q * Sv * av * lh
Nb_prop = 2 * 0.5 * q * A_disk * arm_np
out['yaw'] = {'a_fin_per_rad': round(av, 3), 'Nbeta_fins_Nm_per_rad': round(Nb_fin, 2), 'Nbeta_props_Nm_per_rad': round(-Nb_prop, 2),
              'loss_pct': round(Nb_prop / Nb_fin * 100, 1)}
# rudder authority and one-motor-out
tau = 0.55; dr = math.radians(22.9)
Frud = q * Sv * av * tau * dr
Nrud = Frud * lh
out['yaw']['rudder_force_N'] = round(Frud, 2); out['yaw']['rudder_moment_Nm'] = round(Nrud, 2)
beta = math.radians(8)
Nbeta = (Nb_fin - Nb_prop) * beta
out['yaw']['sideslip8_moment_Nm'] = round(Nbeta, 2)
Tmax_balanced = (Nrud + Nbeta) / Z_AX
out['yaw']['one_motor_T_balanced_N'] = round(Tmax_balanced, 2)
out['yaw']['one_motor_T_needed_N'] = round(res['central']['D_N'], 2)
out['yaw']['yaw_moment_at_cruise_T_Nm'] = round(res['central']['D_N'] * Z_AX, 2)
out['yaw']['diff_thrust_moment_per_N_diff'] = Z_AX
out['yaw']['DT_moment_pm1N'] = round(2 * 1.0 * Z_AX, 2)  # +1 N on one tip, -1 N on the other
# best L/D level-flight thrust requirement
LDmax = 0.5 * math.sqrt(math.pi * P['e'] * AR / (CD0_C0 + cdA_total / S))
out['LDmax_A1'] = round(LDmax, 2); out['Dmin_A1_N'] = round(m1 * g / LDmax, 2)

# ---------------------------------------------------------------- wiring: voltage drop, power, mass
def awg_area(n): return math.pi / 4 * (0.127 * 92**((36 - n) / 39))**2   # mm2
rho_cu = 1.68e-8
route = [(0.2, -0.06, 0), (0.12, -0.09, 0.02), (-0.02, -0.09, 0.04), (-0.09, -0.05, 0.065), (-0.12, 0, 0.09), (-0.04, 0.0, 0.25), (-0.04, 0.004, 1.2), (-0.03, 0.012, 1.215)]
Lgeom = sum(math.dist(route[i], route[i + 1]) for i in range(len(route) - 1))
Lest = 1.10 * Lgeom
out['wire'] = {'L_geom_m': round(Lgeom, 3), 'L_est_m': round(Lest, 3)}
for n in (12, 14, 16):
    A = awg_area(n)
    Rloop = 2 * Lest * rho_cu / (A * 1e-6)
    out['wire'][f'awg{n}'] = {'area_mm2': round(A, 3), 'R_loop_mOhm': round(Rloop * 1000, 1),
                              'V_drop_at_8.4A': round(Rloop * 8.4, 3), 'P_at_8.4A_W': round(Rloop * 8.4**2, 2),
                              'V_drop_at_20A': round(Rloop * 20, 3), 'pct_of_22.2V_at_20A': round(Rloop * 20 / 22.2 * 100, 2),
                              'P_at_20A_W': round(Rloop * 400, 1), 'cu_g_per_m': round(A * 8.96, 2)}
L12 = 0.415; L14 = Lest - L12
Rmix = 2 * (L12 * rho_cu / (awg_area(12) * 1e-6) + L14 * rho_cu / (awg_area(14) * 1e-6))
out['wire']['mixed'] = {'L12_m': L12, 'L14_m': round(L14, 3), 'R_loop_mOhm': round(Rmix * 1000, 1), 'V_drop_8.5A': round(Rmix * 8.5, 3), 'P_8.5A_W': round(Rmix * 8.5**2, 2),
                        'V_drop_20A': round(Rmix * 20, 3), 'pct_22.2V_20A': round(Rmix * 20 / 22.2 * 100, 2), 'P_20A_W': round(Rmix * 400, 1)}
out['wire']['conductor_m_needed_both_tips'] = round(4 * Lest, 2)
out['wire']['conductor_m_in_14AWG_pack_P07'] = round(2 * 3.048, 2)
out['wire']['conductor_m_in_14AWG_used_by_C0'] = 0.134
# ---------------------------------------------------------------- structure: tip beam, loads, frequency
E = 69e9
def I_tube(od, idd): return math.pi / 64 * (od**4 - idd**4) * 1e-12
Is = I_tube(25.4e0, 22.454); Ij = I_tube(22.225, 19.279); Ie = I_tube(25.4, 23.622)
Isl = Ij
out['I_mm4'] = {'socket': round(Is * 1e12, 1), 'joiner_or_sleeve': round(Ij * 1e12, 1), 'tip_ext': round(Ie * 1e12, 1)}
out['EI_Nm2'] = {'socket': round(E * Is, 1), 'socket+joiner': round(E * (Is + Ij), 1), 'tip_ext': round(E * Ie, 1)}
def EI_of(z, a1=True):
    if z < 0.38: ei = E * (Is + Ij)
    elif z < 0.843: ei = E * Is
    elif z < 0.88: ei = E * (Is + Isl)
    elif z < 0.917 and a1: ei = E * (Ie + Isl)
    elif z <= 0.88 : ei = E * Is
    else: ei = E * Ie if a1 else 1e-9
    return ei
# static: ultimate load on tip beam at 4.5 g
n_ult = C0['struct']['nUlt']
mass_tip_nac = nac_g / 1000
Fn = mass_tip_nac * g * n_ult
arm = Z_AX - 0.88
Mn = Fn * arm
# outboard wing lift (elliptic) beyond z=0.88
W_ult = m1 * g * n_ult
eta0 = 0.88 / 1.2
def ell_frac(e0):
    f = lambda x: 0.5 * (x * math.sqrt(1 - x * x) + math.asin(x))
    return (f(1) - f(e0)) / (math.pi / 4)
fr = ell_frac(eta0)
Fl = W_ult / 2 * fr
# centroid of elliptic load outboard
xs = np.linspace(eta0, 1, 2001); w = np.sqrt(1 - xs**2); xc = float((xs * w).sum() / w.sum())
Ml = Fl * (xc * 1.2 - 0.88)
Mt = Mn + Ml
sig = Mt * (25.4e-3 / 2) / Ie
out['tipbeam'] = {'F_nacelle_ult_N': round(Fn, 1), 'M_nacelle_Nm': round(Mn, 2), 'F_outer_lift_ult_N': round(Fl, 1), 'M_outer_lift_Nm': round(Ml, 2),
                  'M_total_Nm': round(Mt, 2), 'sigma_MPa': round(sig / 1e6, 1), 'RF_vs_275MPa': round(275e6 / sig, 1)}
# wing root bending with the heavier tip: root moment at 4.5 g, A1 vs C0
out['root_moment_scale'] = round(m1 / m0, 3)
out['joiner_RF_C0'] = C0['struct']['MS_J']
# joiner RF scales with load: sigma ~ M; MS = allow/sig - 1 with factor; use RF=1+MS ; scale
RF0 = C0['struct']['MS_J']
out['joiner_RF_A1_est'] = round(RF0 / (m1 / m0), 2)
# the tip nacelle outboard also adds a root moment relief (its weight is outboard of lift centroid): net effect on the root 4.5 g moment
Mroot_extra = 2 * 0 + (mass_tip_nac * g * n_ult) * (Z_AX - 0.08)  # inertial relief is opposite to lift: wing lift is carried at the root, nacelle weight acts at tip
out['joiner_note'] = 'Aircraft weight is carried at the booms (z=0.43) and fuselage; the tip nacelle weight (outboard of the lift centroid at about z=0.5) adds root moment. See tip_moment_at_root.'
Fnac = 2 * 0  # unused
Mroot_tip = (tip_g / 1000) * g * n_ult * (Z_AX - 0.08)  # per side, upper bound (wire/tube lumped at the tip)
# C0 root moment 69.47 Nm is lift-up minus structure/wing weight-relief; adding tip weight reduces net wing bending only if lift were unchanged.
# Gravity relief: at 4.5 g the tip mass inertia opposes the lift (the wing lift is balanced by aircraft inertia). Total lift is 4.5*W; booms+fuselage hold it.
# Net root moment = sum lift*arm - sum(wing mass inertia*arm). Adding tip mass raises both lift (heavier aircraft) and inertia relief at the tip.
liftdist_arm = xc * 1.2
dM_lift = (dm * g * n_ult / 2) * 0.5          # extra lift per panel is distributed ~ elliptic: mean arm ~0.5 m
dM_inertia = (tip_g / 1000) * g * n_ult * (Z_AX - 0.08) - (rem_g / 1000 / 2) * 0
out['root_moment_change_per_panel_Nm'] = {'extra_lift_moment': round(dM_lift, 2), 'tip_inertia_relief': round(-dM_inertia, 2), 'net': round(dM_lift - dM_inertia, 2)}
# frequency: FE of one panel as cantilever from z=0.08 with lumped masses
def fe(a1, tipmass=True, nel=120):
    zs = np.linspace(0.08, 1.222 if a1 else 1.2, nel + 1)
    n = len(zs); ndof = 2 * n
    K = np.zeros((ndof, ndof)); M = np.zeros((ndof, ndof))
    for e in range(nel):
        L = zs[e + 1] - zs[e]; zm = 0.5 * (zs[e] + zs[e + 1])
        EI = EI_of(zm, a1) if (a1 or zm < 0.88) else 1e-9
        if (not a1) and zm >= 0.88: EI = E * 0.002 * Is   # foam-only outboard of the socket: ~0.2 % of socket (EST)
        k = EI / L**3 * np.array([[12, 6 * L, -12, 6 * L], [6 * L, 4 * L * L, -6 * L, 2 * L * L], [-12, -6 * L, 12, -6 * L], [6 * L, 2 * L * L, -6 * L, 4 * L * L]])
        # consistent mass for distributed lineal density
        zmid = zm
        lin = 0.2296   # foam+skin kg/m (0.257 kg / 1.12 m)
        if zmid < 0.88: lin += 0.2995 * 1.0  # socket 0.2995 kg/m
        if zmid < 0.38: lin += 0.2595       # joiner half ... 0.2595 kg/m
        if a1 and zmid >= 0.88: lin += 0.1848  # tip ext 0.1848 kg/m
        mm = lin * L / 420 * np.array([[156, 22 * L, 54, -13 * L], [22 * L, 4 * L * L, 13 * L, -3 * L * L], [54, 13 * L, 156, -22 * L], [-13 * L, -3 * L * L, -22 * L, 4 * L * L]])
        idx = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3]
        for a in range(4):
            for b in range(4):
                K[idx[a], idx[b]] += k[a, b]; M[idx[a], idx[b]] += mm[a, b]
    def addm(z, mass):
        i = int(np.argmin(abs(zs - z))); M[2 * i, 2 * i] += mass
    # boom assembly per side (lift units 0.484 + booms 0.301 + gear 0.1625 + tail 0.057)
    addm(0.4337, 1.0045); addm(0.8, 0.054)
    if a1 and tipmass: addm(Z_AX if Z_AX <= zs[-1] else zs[-1], nac_g / 1000)
    # clamp root dofs
    keep = list(range(2, ndof))
    Kr = K[np.ix_(keep, keep)]; Mr = M[np.ix_(keep, keep)]
    w2, v = eigh(Kr, Mr)
    f = np.sqrt(np.abs(w2[:3])) / (2 * math.pi)
    return f
fC0 = fe(False); fA1 = fe(True)
out['freq_Hz'] = {'C0_first3_clamped': [round(x, 2) for x in fC0], 'A1_first3_clamped': [round(x, 2) for x in fA1]}
# wing foam-only outboard note: C0 outboard 0.32 m has no spar; A1 spans it with the 25.4 mm tube
# torsion of the tip beam under the nacelle weight (CG ahead of the tube axis)
Gal = 26e9
J_ext = 2 * Ie
GJ_ext = Gal * J_ext
d_cg = (-0.0716) - sum(a[1] * a[2] for a in tip) / nac_g
tw = Fn / n_ult * g * 0 + mass_tip_nac * g * abs(d_cg) * (Z_AX - 0.88) / GJ_ext
out['torsion'] = {'nacelle_cg_ahead_of_tube_m': round(abs(d_cg), 3), 'GJ_ext_Nm2': round(GJ_ext, 1), 'twist_1g_deg': round(math.degrees(tw), 3)}
# tip deflection at 1 g with the nacelle weight
def defl(a1=True):
    zs = np.linspace(0.08, 1.222, 400); P_ = mass_tip_nac * g
    # M(z) = P*(Z_AX - z) ; delta = int M * m(z) / EI dz with unit load at tip: m(z) = (Z_AX - z)
    d = 0
    for i in range(len(zs) - 1):
        z = 0.5 * (zs[i] + zs[i + 1]); dz = zs[i + 1] - zs[i]
        d += P_ * (Z_AX - z) * (Z_AX - z) / EI_of(z, True) * dz if z < Z_AX else 0
    return d
dd = defl()
out['tip_deflection_1g_nacelle_mm'] = round(dd * 1000, 2)
out['tip_deflection_1g_nacelle_pct_semispan'] = round(dd / 1.2 * 100, 3)
# gyro / propeller data (EST)
m_prop = 0.0371; Ip = m_prop * D_PROP**2 / 12
om = rpm * 2 * math.pi / 60
out['prop_gyro'] = {'Ip_kgm2': round(Ip, 6), 'omega_rad_s': round(om, 0), 'Ip_omega_Nms': round(Ip * om, 3),
                    'torque_at_cruise_Nm': round(Pcr(res['central']['D_N']) * etaM * etaP / 2 / om, 3)}
# pitch/yaw rate gyro moment at 1 rad/s
# ground clearance and tip-over
leg_bottom = -0.2437; wheel_gain = 0.048
def strike_angle(extra):
    zc = Z_AX - 0.4337; yc = (Y_AX - leg_bottom) + extra
    for th in np.arange(0, 30, 0.05):
        t = math.radians(th)
        if yc * math.cos(t) - zc * math.sin(t) <= R_PROP: return round(float(th), 1)
out['ground'] = {'disc_bottom_above_ground_mm_noWheels': round((Y_AX - R_PROP - leg_bottom) * 1000, 1),
                 'roll_to_strike_deg_noWheels': strike_angle(0.0), 'roll_to_strike_deg_wheels': strike_angle(wheel_gain),
                 'C0_pusher_clearance_mm': round((-0.03 - R_PROP - leg_bottom) * -1000 * -1, 1)}
# power budget at cruise per motor
out['cruise_per_motor'] = {'shaft_W_est': round(res['central']['D_N'] * V / etaP / 2 * etaP, 1), 'electrical_W': round(res['central']['P_cruise_W'] / 2, 1),
                           'I_A_at_22.2V': round(res['central']['P_cruise_W'] / 2 / 22.2, 2)}
# static thrust (EST) 14x8.5 on X4110S
rho0 = 1.225
for ct0, cp0, nm in ((0.10, 0.045, 'CT0.10/CP0.045'), (0.11, 0.06, 'CT0.11/CP0.06')):
    n = 6500 / 60
    T = ct0 * rho0 * n**2 * D_PROP**4; Pw = cp0 * rho0 * n**3 * D_PROP**5
    out.setdefault('static_est', {})[nm] = {'T_N': round(T, 1), 'P_shaft_W': round(Pw), 'I_A': round(Pw / 0.85 / 22.2, 1)}
json.dump(out, open(os.path.join(HERE, 'calc_out.json'), 'w'), indent=1)
print(json.dumps(out, indent=1))
