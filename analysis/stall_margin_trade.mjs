// Stall-margin policy trade for C0 (2026-10-25).
// Run: node analysis/stall_margin_trade.mjs  -> writes analysis/stall_margin_trade.json and prints the table.
// Read-only on the rest of the repo: it reads analysis/results.json and analysis/aero/aero_results.json and writes ONLY
// analysis/stall_margin_trade.json. Deterministic (no random numbers, no clock reads).
//
// PHYSICS REUSE (same pattern as analysis/tradestudy.mjs)
//  - Sizing loop: analysis/model.js size() imported unchanged (F1–F12). F4: S = 2 m g / (rho Vs^2 CLmax).
//  - Baseline inputs: results.json concepts.C0.params (written by sizing.mjs BASE + X4110S). sizing.mjs is NOT imported
//    (importing it re-runs it and rewrites results.json).
//  - geometry() and cg() are RE-IMPLEMENTED verbatim from sizing.mjs (twin-boom branch) so the neutral point, static margin,
//    boom cut list and battery station follow the chord. A reproduction check at Vs = 12 compares MTOW, cruise time, total
//    cost, boomTotal, SM and battery station with results.json and exits 1 on a mismatch.
//  - Pack picker re-implements sizing.mjs run(): cheapest pack meeting energy, the 11.5 min cruise floor and 60 A hover current.
//  - BOM: results.json concepts.C0.bom.lines with the boom-tube quantity and the pack line re-derived (tradestudy.mjs bomFrom()).
//  - Joiner reserve factor: MS_J(v) = MS_J(C0) (W0 b0)/(W b)   (Mroot = nUlt W b/(3 pi), sizing.mjs structures()).
//    Boom reserve factor: MS_B(v) = MS_B(C0) Lb0/Lb, Lb = xFront + 0.25 c (sizing.mjs structures(): sigma_B = Tmax Lb c/I, Tmax fixed).
//  - CL_max held at results.json params.CLmax (= aero_results.json CL_max_3D.adopted 1.121) for every variant: the larger chord
//    raises the stall Re by c/c0 (<= 7 %), which aerodynamics.md v0.4 note treats as too small to move the section result (EST).
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
const M = require('./model.js');
const R = JSON.parse(readFileSync(new URL('./results.json', import.meta.url)));
const AE = JSON.parse(readFileSync(new URL('./aero/aero_results.json', import.meta.url)));
const G = M.G;

const C0 = R.concepts.C0;
const BASEP = { ...C0.params }; delete BASEP.mBattFixed; delete BASEP.EBattFixed; BASEP.Vpack = 22.2;
const R11_VS = 12.0;                       // DESIGN-BASIS R11: stall <= 12 m/s at MTOW
const R10_MIN = 10;                        // DESIGN-BASIS R10
const CRUISE_FLOOR = R.cruiseMarginMin;    // 11.5 min (sizing.mjs CRUISE_MARGIN_MIN)
const R7_TARGET = 100;                     // DESIGN-BASIS R7 reserve target, $
const R4_MAX = 1.5;                        // DESIGN-BASIS R4 largest piece, m
const AIRSPEED_MIN = 16;                   // firmware/vtol_c0.param AIRSPEED_MIN; DESIGN-BASIS R11
const POD_NP_SHIFT = AE.neutral_point.pod_shift_pct_MAC/100;   // sizing.mjs POD_NP_SHIFT
const POD = { noseX: 0.45, L: 0.85, motorL: 0.032, pushD: 14*0.0254 };   // sizing.mjs POD
POD.pushX = POD.noseX - POD.L - POD.motorL - 0.006;
const PACKS = R.packs;                     // sizing.mjs PACKS (BE §1)

// ---------------------------------------------------------------- geometry (verbatim from sizing.mjs geometry(), twin boom)
function geometry(p, r){
  const chord = r.chord, D = p.liftD, clr = 0.05, fusHalf = 0.08, pushR = POD.pushD/2;
  const xLEtoCG = -0.28*chord, xRear = -(chord + D/2 + clr), xFront = 2*xLEtoCG - xRear, lh_tailLE = xRear - D/2 - clr, S = r.S;
  const yIn = Math.max(D/2 + fusHalf + clr, D/2 + pushR + 0.04);
  const hSpan0 = 2*yIn; let hC0 = 0.2, Sh, lh0;
  for(let k=0;k<6;k++){ lh0 = (-0.25*chord) - (lh_tailLE - 0.25*hC0); Sh = p.VhTarget*S*chord/lh0; hC0 = Sh/hSpan0; }
  const Sv = p.VvTarget*S*p.span/lh0;
  const x0 = lh_tailLE - 0.22, x1 = xFront + 0.05;
  const booms = [{ y:-yIn, x0, x1 }, { y:yIn, x0, x1 }];
  const hSpan = 2*yIn, hC = Sh/hSpan, xTailAC = lh_tailLE - 0.25*hC, lh = (-0.25*chord) - xTailAC;
  const Vh = Sh*lh/(S*chord), Vv = Sv*lh/(S*p.span);
  const aw = 2*Math.PI*r.AR/(2+Math.sqrt(r.AR*r.AR+4)), ARt = hSpan*hSpan/Sh, at = 2*Math.PI*ARt/(2+Math.sqrt(ARt*ARt+4));
  const deda = 2*aw/(Math.PI*r.AR), etaT = 0.9;
  const hn = 0.25 + etaT*Vh*(at/aw)*(1-deda) + POD_NP_SHIFT, SM = hn - 0.28;
  const segs = []; booms.forEach(b => { segs.push(+(b.x1-xRear).toFixed(4)); segs.push(+(xRear-b.x0).toFixed(4)); });
  const boomTotal = booms.reduce((a,b)=>a+(b.x1-b.x0),0);
  return { D, xFront, xRear, xLEtoCG, booms, segs, boomTotal, hSpan, hC, Sh, Sv, lh, Vh, Vv, hn, SM, yIn, longestPiece: Math.max(...segs, p.span/2) };
}

// ---------------------------------------------------------------- CG build-up (verbatim from sizing.mjs cg())
function cg(p, s, g){
  const c = s.chord, items = []; const add = (name,m,x) => items.push({ name, m, x });
  const nPer = p.nLift/2, unit = p.mMotor+p.mEsc+p.mProp+p.mMount;
  add('Lift units, front', nPer*unit, g.xFront); add('Lift units, rear', nPer*unit, g.xRear);
  const bx = g.booms.reduce((a,b)=>a+(b.x1-b.x0)*(b.x0+b.x1)/2,0)/g.boomTotal;
  add('Booms + clamps', s.m_booms, bx); add('Wing', s.m_wing, -0.40*c); add('Tail', s.m_tail, g.xRear - g.D/2 - 0.05 - 0.4*g.hC);
  add('Fuselage pod', p.mFus, POD.noseX - POD.L/2); add('Landing gear', p.mGear, -0.25*c); add('Avionics', p.mAvionics, 0.25);
  add('Pusher set', p.mPusherSet, POD.pushX + 0.02);
  const xTailServo = g.xRear - g.D/2 - 0.05 - 0.026; add('Servos (5)', p.mServos, (2*(-0.55*c) + 3*xTailServo)/5);
  add('Wiring', p.mWiring + p.nLift*p.mWirePerLift, -0.10);
  const target = g.xLEtoCG, mNo = items.reduce((a,i)=>a+i.m,0), momNo = items.reduce((a,i)=>a+i.m*i.x,0);
  const mb = s.m_batt, mp = p.mPayload, xPay = 0.15;
  const xb = (target*(mNo+mb+mp) - momNo - mp*xPay)/mb;
  const cgNoPayload = (momNo + mb*xb)/(mNo+mb);
  return { xb, cgNoPayload_pctMAC: -cgNoPayload/c*100, SM_noPayload: g.hn - (-cgNoPayload/c) };
}

// ---------------------------------------------------------------- closure + pack pick (re-implements sizing.mjs run())
function close(over){
  let p = { ...BASEP, ...over }, r, g;
  for(let k=0;k<6;k++){ r = M.size(p); g = geometry(p, r); p.boomTotalLen = g.boomTotal; p.tailAreaRatio = (g.Sh+g.Sv)/r.S; }
  let pick = null, picked = null;
  for(const pk of [...PACKS].sort((a,b)=>a.usd-b.usd)){
    const pp = { ...p, mBattFixed:pk.kg, EBattFixed:pk.Wh, Vpack: pk.chem==='LiPo'?22.2:21.6 };
    const rr = M.size(pp);
    if(rr.endurance_ok && rr.t_cruise_avail_min >= CRUISE_FLOOR && rr.I_hover <= pk.contA){ pick = pk; picked = rr; p = pp; break; }
  }
  if(!pick) return { p, r, g, pick:null };
  for(let k=0;k<4;k++){ g = geometry(p, picked); p.boomTotalLen = g.boomTotal; p.tailAreaRatio = (g.Sh+g.Sv)/picked.S; picked = M.size(p); }
  g = geometry(p, picked);
  return { p, r:picked, g, pick };
}

// ---------------------------------------------------------------- BOM (tradestudy.mjs bomFrom() pattern on the C0 lines)
const tubesFor = segs => Math.ceil(segs.reduce((a,b)=>a+b,0)/1.80);   // sizing.mjs bom(): 72 in (1.80 m usable EST) boom tubes
function bom(segs, pick){
  const L = C0.bom.lines.map(l => ({ ...l }));
  const tube = L.find(l => /6061-T6 tube 1\.000 x 0\.035/.test(l.item)); tube.qty = tubesFor(segs); tube.ext = +(tube.qty*tube.unit).toFixed(2);
  if(pick.id !== C0.pick.id){
    const pi = L.findIndex(l => l.cat==='Energy' && /2-pack listing|flight pack/.test(l.item)); L.splice(pi, 1);
    if(pick.pair) L.push({ cat:'Energy', item:pick.id.replace(' (2-pack)','')+' — 2-pack listing (2 packs)', qty:1, unit:+(2*pick.usd).toFixed(2), ext:+(2*pick.usd).toFixed(2), src:'BE §1' });
    else L.push({ cat:'Energy', item:pick.id+' flight pack', qty:2, unit:pick.usd, ext:+(2*pick.usd).toFixed(2), src:'BE §1' });
  }
  const goods = L.reduce((a,l)=>a+l.ext,0), shipping = C0.bom.shipping, tax = 0.1025*goods, total = goods + tax + shipping;
  return { goods:+goods.toFixed(2), tax:+tax.toFixed(2), shipping, total:+total.toFixed(2), reserve:+(2000-total).toFixed(2), tubes:tube.qty };
}

// ---------------------------------------------------------------- downstream fit checks (docs/build)
// Foam: FOAMULAR NGX 2 in = 50.8 mm thick, sheet 2438 x 1219 (BUILD-MANUAL WP4 4.4). Section thickness t = tc x c (NACA 2415).
// Panel blocks are cut in strips of (c + 2 x 10 mm lead-in) across the 1219 mm width (cut-list F01): 1 strip panels, 1 strip saddle + scrap,
// so 4 strips (one spare panel set from the same sheet) need 4 (c + 20) <= 1219.
// Printer: P13 saddle root plate length = chord (BUILD-MANUAL K1, print-list P13). The plate with its 6 mm side tabs is 65.1 mm deep
// (cut-list F02 / cad Wing_Saddle 266.6 x 65.1 x 172). Flat on a square bed of side a: c + K1_CLR <= a, with K1_CLR = 268 - 266.6 = 1.4 mm
// (the clearance implied by BUILD-MANUAL K1 "bed >= 268 for the 266.6 mm P13"); diagonal: (c + 65.1)/sqrt 2 + K1_CLR <= a
// (calc, rectangle at 45 deg in a square).
// Templates: make_templates.py writes half sheets when the full sheet (c + 37 mm) is wider than 270 mm; each half is (c+37)/2 + 20 wide
// (40 mm overlap) and must print on Letter (215.9 mm, ~6.4 mm printer margins each side EST -> 203 mm printable).
const FOAM_T = 50.8, SHEET_W = 1219, P13_DEPTH = 65.1, K1_CLR = 268 - 266.6, LETTER_PRINTABLE = 215.9 - 2*6.4;
function fits(chord_m, tc){
  const c = chord_m*1000;
  const bedFlat = a => c + K1_CLR <= a, bedDiag = a => (c + P13_DEPTH)/Math.SQRT2 + K1_CLR <= a;
  return { chord_mm:+c.toFixed(1), section_t_mm:+(tc*c).toFixed(1), foam_ok: tc*c <= FOAM_T, foam_strip_mm:+(c+20).toFixed(1),
    foam_4strips_mm:+(4*(c+20)).toFixed(0), foam_spare_set_ok: 4*(c+20) <= SHEET_W, P13_bed_flat_needed_mm:+(c + K1_CLR).toFixed(1), P13_bed_diag_needed_mm:+((c + P13_DEPTH)/Math.SQRT2 + K1_CLR).toFixed(1),
    P13_bed256_flat: bedFlat(256), P13_bed256_diag: bedDiag(256), P13_bed268_flat: bedFlat(268), P13_bed268_diag: bedDiag(268),
    template_half_mm:+((c+37)/2 + 20).toFixed(1), template_half_letter_ok: (c+37)/2 + 20 <= LETTER_PRINTABLE };
}

// ---------------------------------------------------------------- evaluate one design-stall target
const base = close({});
function evaluate(Vs){
  const o = close({ Vs }), r = o.r, g = o.g, p = o.p, b = bom(g.segs, o.pick), cgr = cg(p, r, g);
  const Lb = g.xFront + 0.25*r.chord, Lb0 = C0.struct.Lb;
  // cruise time if the baseline pack (results.json C0 pick) were kept on this wing (pack re-closed, geometry fixed at the picked result)
  const pk0 = C0.pick, r0 = M.size({ ...p, mBattFixed:pk0.kg, EBattFixed:pk0.Wh, Vpack:22.2 });
  const tol = 1 - (Vs/R11_VS)**2;          // CL_max shortfall this wing tolerates and still meets R11:  Vs_true = Vs / sqrt(1 - k) <= 12
  const vsAt = k => Vs/Math.sqrt(1-k);
  return {
    Vs_design:Vs, S_m2:r.S, chord_m:r.chord, span_m:p.span, AR:r.AR, MTOW_kg:r.m, m_wing_kg:r.m_wing, d_wing_kg:r.m_wing - C0.sized.m_wing,
    d_MTOW_kg:r.m - C0.sized.m, m_tail_kg:r.m_tail, m_booms_kg:r.m_booms, wingLoading_Nm2:r.wingLoading, CL_cruise:r.CL, LD:r.LD,
    cruise_with_baseline_pack_min:r0.t_cruise_avail_min, MTOW_with_baseline_pack_kg:r0.m,
    P_hover_W:r.P_hover, I_hover_A:r.I_hover, P_cruise_W:r.P_cruise, cruise_avail_min:r.t_cruise_avail_min,
    meets_R10:r.t_cruise_avail_min >= R10_MIN, meets_cruise_floor:r.t_cruise_avail_min >= CRUISE_FLOOR, TW:r.TW,
    pack:o.pick.id, bom_total_usd:b.total, reserve_usd:b.reserve, meets_R7:b.reserve >= R7_TARGET, boom_tubes:b.tubes,
    boom_segs_m:g.segs, half_span_m:p.span/2, longest_piece_m:Math.max(g.longestPiece, POD.L), meets_R4:Math.max(g.longestPiece, POD.L) <= R4_MAX,
    MS_joiner:C0.struct.MS_J*(C0.sized.W*R.base.span)/(r.W*p.span), boom_Lb_m:Lb, MS_boom:C0.struct.MS_B*Lb0/Lb,
    np_pctMAC:g.hn*100, SM_pct:g.SM*100, SM_noPayload_pct:cgr.SM_noPayload*100, batt_x_m:cgr.xb, d_batt_x_mm:(cgr.xb - C0.cg.xb)*1000,
    Vh:g.Vh, S_htail_m2:g.Sh, S_vtail_m2:g.Sv,
    CLmax_tolerance_pct:tol*100, Vs_if_CLmax_minus5:vsAt(0.05), Vs_if_CLmax_minus10:vsAt(0.10), Vs_if_CLmax_minus15:vsAt(0.15),
    V_1p3Vs_design:1.3*Vs, fits:fits(r.chord, p.tc),
    // aileron hinge moment at fixed q and deflection scales with S_a c_a; aileron chord 26 % c over a fixed span -> (c/c0)^2 (test S07 limit 4 kg.cm)
    hinge_moment_ratio:(r.chord/C0.sized.chord)**2,
  };
}
const VARIANTS = [12.0, 11.75, 11.5, 11.25].map(evaluate);

// ---------------------------------------------------------------- CL_max uncertainty view on the CURRENT wing (Vs design 12.0)
const uncertainty = [0, 0.05, 0.10, 0.15].map(k => {
  const CL = BASEP.CLmax*(1-k), Vs = Math.sqrt(2*C0.sized.W/(BASEP.rho*C0.sized.S*CL));
  const Vmin13 = 1.3*Vs, Vmin125 = 1.25*Vs;
  return { CLmax_shortfall_pct:k*100, CLmax_true:CL, Vs_true_mps:Vs, meets_R11:Vs <= R11_VS + 1e-9,
    V_1p3Vs:Vmin13, AIRSPEED_MIN_needed_1p3:Math.ceil(Vmin13), AIRSPEED_MIN_ARM_P_STALL_1p25:Vmin125, AIRSPEED_MIN16_margin_over_1p3Vs:AIRSPEED_MIN - Vmin13,
    AIRSPEED_MAX_needed_1p5xMIN:1.5*Math.ceil(Vmin13), cruise_lower_band_over_Vs:18/Vs };
});
// Stall without payload (0.5 kg R12 allowance removed; DESIGN-BASIS says fly 0.5 kg ballast instead, so this is NOT the flight case)
const Vs_noPayload = R11_VS*Math.sqrt((C0.sized.m - BASEP.mPayload)/C0.sized.m);

// ---------------------------------------------------------------- reproduction check (the adopted design Vs, results.json params.Vs, through this script vs results.json)
const rep = VARIANTS.find(v => Math.abs(v.Vs_design - C0.params.Vs) < 1e-9);
if(!rep){ console.error('reproduction check: results.json Vs', C0.params.Vs, 'is not one of the variants'); process.exit(1); }
const check = { results_json:{ MTOW:C0.sized.m, cruise_min:C0.sized.t_cruise_avail_min, total:C0.bom.total, boomTotal:C0.geo.boomTotal, SM:C0.geo.SM, batt_x:C0.cg.xb, S:C0.sized.S },
  this_script:{ MTOW:rep.MTOW_kg, cruise_min:rep.cruise_avail_min, total:rep.bom_total_usd, boomTotal:base.g.boomTotal, SM:rep.SM_pct/100, batt_x:rep.batt_x_m, S:rep.S_m2 } };
{ const a = check.results_json, b = check.this_script, bad = Object.keys(a).filter(k => Math.abs(a[k]-b[k]) > 1e-3*Math.max(1,Math.abs(a[k])));
  if(bad.length){ console.error('reproduction check FAILED:', bad.map(k=>`${k} ${a[k]} vs ${b[k]}`).join('; ')); process.exit(1); } }

const out = {
  generated:'2026-10-25', script:'analysis/stall_margin_trade.mjs', model:'analysis/model.js size() (unchanged)',
  inputs:'analysis/results.json concepts.C0 (sizing.mjs v0.4), analysis/aero/aero_results.json (CL_max_3D, neutral_point)',
  requirements:{ R11_Vs_max:R11_VS, R10_min:R10_MIN, cruise_floor_min:CRUISE_FLOOR, R7_reserve_target_usd:R7_TARGET, R4_largest_piece_m:R4_MAX, AIRSPEED_MIN },
  CLmax_adopted:BASEP.CLmax, CLmax_evidence:{ critical_section:AE.CL_max_3D.critical_section_method, raymer_0p9:AE.CL_max_3D.raymer_0p9,
    aerobuildup_untrimmed:AE.CL_max_3D.aerobuildup_untrimmed, xfoil_2D_stall_Re:AE.CL_max_2D.xfoil_stall_Re, neuralfoil_2D_stall_Re:AE.CL_max_2D.neuralfoil_stall_Re,
    tunnel_2D_Re2e5:AE.CL_max_2D.experiment_Genc_Lock_Kaynak_2008_Re2e5.CL_max, su2_SA_2D:AE.CL_max_2D.su2_SA_cruise_Re.CL_max, adopted_2D:AE.CL_max_2D.adopted_2D },
  notes:[ 'Span held at 2.4 m (R3; 1.2 m halves inside R4). Larger S at fixed span lowers AR.',
    'CD0_clean held as a coefficient when S grows (sizing.mjs BASE note): the fixed-CdA share is then over-counted, conservative.',
    'CL_max held at 1.121 for every variant (stall Re rises by c/c0 <= 7 %; EST negligible, aerodynamics.md v0.4 note).',
    'MS_joiner / MS_boom are scaled hand-calc reserve factors on yield at 4.5 g (sizing.mjs structures()); FEA not re-run.',
    'Fit checks: foam 50.8 mm, sheet 1219 mm (BUILD-MANUAL WP4 4.4, cut-list F01/F02); P13 = chord long, 65.1 mm deep incl. tabs; flat clearance 1.4 mm from K1 (268 bed for 266.6 plate); Letter printable 203 mm EST.' ],
  variants:VARIANTS, uncertaintyCurrentWing:uncertainty, Vs_noPayload_mps:Vs_noPayload, reproductionCheck:check,
};
writeFileSync(new URL('./stall_margin_trade.json', import.meta.url), JSON.stringify(out, (k,v)=> typeof v==='number' ? +v.toPrecision(6) : v, 1));

// ---------------------------------------------------------------- console
const f = (x,d=2) => x.toFixed(d);
console.log('Reproduction (Vs '+C0.params.Vs+'): results.json MTOW', f(check.results_json.MTOW,4), 'cruise', f(check.results_json.cruise_min), 'total', check.results_json.total, 'SM', f(check.results_json.SM*100,2),
  '| script MTOW', f(rep.MTOW_kg,4), 'cruise', f(rep.cruise_avail_min), 'total', rep.bom_total_usd, 'SM', f(rep.SM_pct,2));
console.log('\nVs    S      c mm   AR    MTOW   dWing  Ph   Pc    cruise pack                         total    reserve tubes  MS_J  MS_B  SM%   SMnp% dBatt mm tolCL%  P13 256f/d 268f/d  t mm foam4');
for(const v of VARIANTS){ const F = v.fits;
  console.log(`${f(v.Vs_design)} ${f(v.S_m2,3)} ${f(v.chord_m*1000,1)} ${f(v.AR)} ${f(v.MTOW_kg,3)} ${f(v.d_wing_kg*1000,0).padStart(4)}g ${f(v.P_hover_W,0)} ${f(v.P_cruise_W,0)} ${f(v.cruise_avail_min,2).padStart(6)} ${v.pack.padEnd(28)} ${f(v.bom_total_usd).padStart(8)} ${f(v.reserve_usd).padStart(7)} ${v.boom_tubes}     ${f(v.MS_joiner)}  ${f(v.MS_boom,1)}  ${f(v.SM_pct,1)}  ${f(v.SM_noPayload_pct,1)}  ${f(v.d_batt_x_mm,1).padStart(5)}  ${f(v.CLmax_tolerance_pct,1).padStart(5)}  ${F.P13_bed256_flat?'Y':'n'}/${F.P13_bed256_diag?'Y':'n'}  ${F.P13_bed268_flat?'Y':'n'}/${F.P13_bed268_diag?'Y':'n'}  ${f(F.section_t_mm,1)} ${F.foam_spare_set_ok?'Y':'n'}`); }
console.log('\nCurrent wing, CL_max shortfall -> true stall:');
for(const u of uncertainty) console.log(`  -${f(u.CLmax_shortfall_pct,0)} %: CL ${f(u.CLmax_true,3)} Vs ${f(u.Vs_true_mps)} m/s  R11 ${u.meets_R11?'met':'FAIL'}  1.3Vs ${f(u.V_1p3Vs)} -> AIRSPEED_MIN ${u.AIRSPEED_MIN_needed_1p3}, AIRSPEED_MAX >= ${f(u.AIRSPEED_MAX_needed_1p5xMIN,1)}, 18/Vs ${f(u.cruise_lower_band_over_Vs)}`);
console.log('Variant stall if CL_max is 5/10/15 % low:', VARIANTS.map(v=>`${f(v.Vs_design)}: ${f(v.Vs_if_CLmax_minus5)}/${f(v.Vs_if_CLmax_minus10)}/${f(v.Vs_if_CLmax_minus15)}`).join(' | '));
console.log('Stall without payload (not the flight case; ballast rule):', f(Vs_noPayload), 'm/s');
