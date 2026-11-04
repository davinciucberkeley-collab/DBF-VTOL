"""Independent check of analysis/results.json. Re-derives each formula from the stored inputs
without importing analysis/model.js. Run: python analysis/verify.py"""
import json, math, os, sys
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))   # paths below are repo-relative
R = json.load(open('analysis/results.json'))
G = 9.80665
bad = []
def chk(name, got, want, tol=1e-3):
    ok = abs(got - want) <= tol * max(1, abs(want))
    print(f"{'OK ' if ok else 'BAD'} {name:38s} stored {want:12.5f}  recomputed {got:12.5f}")
    if not ok: bad.append(name)

for k, c in R['concepts'].items():
    p, s = c['params'], c['sized']
    print(f"\n== {k} {c['label']}")
    m = s['m']; W = m * G
    coax = p['coax']; n_units = p['nLift'] // 2 if coax else p['nLift']
    A = math.pi * p['liftD']**2 / 4
    T = W / n_units
    chk('F1 thrust per unit N', T, s['Tunit_N'])
    # FM*eta interpolation from maker table, independently
    tab = p['thrustTable']; Tq = T / G * 1000 / (2 if coax else 1)
    def fme(tg, pw): t = tg/1000*G; return (t**1.5 / math.sqrt(2*p['rho']*A)) / pw
    pts = [(t, fme(t, pw)) for t, pw in tab]
    if Tq <= pts[0][0]: f = pts[0][1]
    else:
        f = pts[-1][1]
        for (t0, f0), (t1, f1) in zip(pts, pts[1:]):
            if Tq <= t1: f = f0 + (f1 - f0) * (Tq - t0) / (t1 - t0); break
    chk('F3 FM*eta', f, s['FMeta'])
    # coax pair baseline: two isolated rotors at T/2 each (MDPI 22 % loss is measured against that)
    Pi = (2 * (T / 2)**1.5 if coax else T**1.5) / math.sqrt(2 * p['rho'] * A)
    chk('F2 ideal power per unit W', Pi, s['Pi_unit'])
    Ph = n_units * Pi * (p['kCoax'] if coax else 1) * p['kCtrl'] / f
    chk('F3 hover power W', Ph, s['P_hover'])
    S = 2 * W / (p['rho'] * p['Vs']**2 * p['CLmax']); chk('F4 wing area m2', S, s['S'])
    AR = p['span']**2 / S; CL = 2 * W / (p['rho'] * p['Vc']**2 * S); chk('F5 CL', CL, s['CL'])
    CdA = (p['nLift'] / (2 if coax else 1)) * p['CdA_rotor'] + p['nBooms'] * p['CdA_boom']
    CD0 = p['CD0_clean'] + CdA / S; CDi = CL**2 / (math.pi * p['e'] * AR)
    LD = CL / (CD0 + CDi); chk('F6 L/D', LD, s['LD'])
    Pc = (W / LD) * p['Vc'] / (p['etaProp'] * p['etaMEc']); chk('F7 cruise power W', Pc, s['P_cruise'])
    E = (Ph * (p['tHover'] + p['tTrans']) + Pc * p['tCruise']) / 3600; chk('F8 mission energy Wh', E, s['E_Wh'])
    Ereq = E / ((1 - p['reserve']) * p['etaBatt']); chk('F9 pack energy needed Wh', Ereq, s['Epack_req_Wh'])
    chord = S / p['span']
    sig = p['rhoFoam'] * 0.68 * p['tc'] * chord + 2 * p['wGlass'] * (1 + p['rResin'])
    mw = S * sig + p['m_spar']; chk('F11 wing mass kg', mw, s['m_wing'])
    mt = p['tailAreaRatio'] * S * p['sigmaTail']
    mb = p['boomTotalLen'] * p['boomLin'] + p['nBooms'] * 2 * p['boomClamp']
    ml = p['nLift'] * (p['mMotor'] + p['mEsc'] + p['mProp'] + p['mMount'])
    mf = (p['mFus'] + p['mGear'] + p['mAvionics'] + p['mPusherSet'] + p['mServos'] + p['mWiring']
          + p['nLift'] * p['mWirePerLift'] + p['mPayload'])
    mtot = mf + ml + mb + mw + mt + p['mBattFixed']
    chk('F12 MTOW closure kg', mtot, m, 2e-4)
    chk('Pack meets mission (usable >= E)', float(p['EBattFixed'] * (1 - p['reserve']) * p['etaBatt'] >= E), 1.0)
    TW = p['nLift'] * p['Tmax_g'] / 1000 / (p['kCoax'] if coax else 1) / m; chk('R13 T/W', TW, s['TW'])
    # BOM. v0.3 rule (R6): goods + 10.25 % tax + shipping allowance <= $2,000; reserve = what remains; fees outside the cap
    b = c['bom']; goods = sum(l['qty'] * l['unit'] for l in b['lines'])
    chk('BOM goods $', goods, b['goods'], 1e-6)
    chk('BOM tax $', 0.1025 * goods, b['tax'], 1e-4)
    total = goods * 1.1025 + b['shipping']
    chk('BOM committed total $', total, b['total'], 1e-4)
    chk('BOM reserve $ (2000 - total)', 2000 - total, b['crash'], 1e-4)
    print(f"    within $2,000 cap? {'yes' if total <= 2000 else 'NO'} (spend {total:.2f}, reserve {2000 - total:.2f})")
    st = c['struct']
    Mroot = st['nUlt'] * W * p['span'] / (3 * math.pi); chk('Spar root moment N m', Mroot, st['Mroot'])
    # v0.3 tubes, 6061-T6 (docs/research/budget-airframe.md): joiner 0.875 x 0.058 in, boom 1.000 x 0.035 in; E = 69 GPa
    Do, Di = 0.875 * 0.0254, (0.875 - 0.116) * 0.0254; I = math.pi / 64 * (Do**4 - Di**4)  # joiner
    chk('Joiner stress MPa', Mroot * Do / 2 / I / 1e6, st['sigJ'] / 1e6)
    Bo, Bi = 1.000 * 0.0254, (1.000 - 0.070) * 0.0254; Ib = math.pi / 64 * (Bo**4 - Bi**4)
    chk('Boom deflection mm', st['Tmax'] * st['Lb']**3 / (3 * 69.0e9 * Ib) * 1000, st['defl_max'] * 1000)

# ---- SOLIDWORKS Simulation vs hand calcs (cad/sim/results.txt): must agree within 15 % ----
import os
simf = 'cad/sim/results.txt'
if os.path.exists(simf):
    S = {}
    for line in open(simf):
        if line.startswith('#') or '=' not in line: continue
        k, rest = line.split('=', 1); S[k] = float(rest.split('|')[0])
    print('\n== FEA vs hand calc (C0)')
    for fea, hand in [('boom_vm_max_fine', 'boom_hand_sigma'), ('spar_vm_max_fine', 'spar_hand_sigJ'), ('boom_vm_max', 'boom_hand_sigma'), ('boom_disp_max', 'boom_hand_defl'), ('boom_f1', 'boom_hand_fn'),
                      ('spar_vm_max', 'spar_hand_sigJ'), ('motor_T_steady', 'motor_T_steady_hand')]:
        if fea in S and hand in S: chk(f'{fea} vs {hand}', S[fea], S[hand], 0.15)
    if 'spar_RF_yield' in S: chk('spar RF on yield >= 1.0 at ultimate (1 = pass)', float(S['spar_RF_yield'] >= 1.0), 1.0)
# ---- vortex lattice vs sizing estimates (analysis/aero.json) ----
if os.path.exists('analysis/aero.json'):
    A = json.load(open('analysis/aero.json'))
    print('\n== VLM vs sizing')
    chk('Neutral point %MAC: VLM vs sizing (10 %)', A['neutral_point_pct_mac'], A['sizing_neutral_point_pct_mac'], 0.10)
    chk('Wing lift slope: VLM vs Helmbold (10 %)', A['wing_CLa_per_rad'], A['helmbold_CLa_per_rad'], 0.10)
    chk('Sizing e (0.80) below inviscid VLM e (1 = pass)', float(A['sizing_e'] <= A['wing_span_efficiency_inviscid']), 1.0)
# ---- hand-copied inputs vs their source (sizing.mjs BASE <- analysis/aero/aero_results.json): the loop must be closed ----
AR_ = 'analysis/aero/aero_results.json'
if os.path.exists(AR_):
    AE = json.load(open(AR_)); p0 = R['concepts']['C0']['params']
    print('\n== Sizing inputs vs aero package')
    chk('CLmax: sizing vs aero CL_max_3D adopted (1 %)', p0['CLmax'], AE['CL_max_3D']['adopted'], 0.01)
    if 'stall' in AE:
        chk('R11 stall <= 12 m/s at the adopted CL_max (1 = pass)', float(AE['stall']['V_stall_mps'] <= 12.0 + 1e-9), 1.0)
    if 'CD0_clean' in p0 and 'CD0_clean_airframe' in AE.get('drag', {}):
        chk('CD0_clean: sizing >= aero airframe (conservative; 1 = pass)', float(p0['CD0_clean'] >= AE['drag']['CD0_clean_airframe']), 1.0)
print('\nFAILED CHECKS:', bad if bad else 'none')
sys.exit(1 if bad else 0)
