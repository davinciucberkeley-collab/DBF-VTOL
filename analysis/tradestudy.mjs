// Configuration trade study for the lift + cruise VTOL (2026-10-21).
// Run: node analysis/tradestudy.mjs  -> writes analysis/tradestudy.json and prints the ranking.
// Deterministic: no random numbers, no clock reads; same inputs give the same file.
//
// PHYSICS REUSE
//  - Sizing loop: analysis/model.js size() is imported unchanged (F1–F12, model.js lines 1–18, size() at line 34).
//  - Baseline inputs: read from analysis/results.json concepts.C0.params (written by analysis/sizing.mjs BASE, line 15).
//    sizing.mjs is NOT imported because importing it re-runs it and rewrites results.json.
//  - Twin-boom geometry (boom length, tail areas, segments) is RE-IMPLEMENTED below from sizing.mjs geometry();
//    the reproduction check at the end compares MTOW, cruise time, cost and boomTotal with results.json and exits 1 on a mismatch.
//  - Pack picker re-implements sizing.mjs run() (cheapest pack meeting energy, the cruise-margin floor and the current limit).
//  - BOM starts from results.json concepts.C0.bom.lines (sizing.mjs bom()); tax and the shipping allowance come from
//    results.json concepts.C0.bom. Variant edits use prices in docs/research/configurations.md §6.
//  - Joiner reserve factor scales from results.json concepts.C0.struct.MS_J with Mroot = nUlt W b / (3 pi)
//    (sizing.mjs line 257): MS_J(variant) = MS_J(C0) * (W0 b0) / (W b).
// Every estimate is tagged EST. Sources tagged [S#] are listed in SOURCES and in docs/research/configurations.md.
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
import { POD } from './geometry.mjs';   // pod envelope (noseX, L, R): the single source shared with sizing.mjs and cad/params.mjs
const require = createRequire(import.meta.url);
const M = require('./model.js');
const R = JSON.parse(readFileSync(new URL('./results.json', import.meta.url)));
const G = M.G, IN = 0.0254;

// ---------------------------------------------------------------- sources
const SOURCES = {
  S1: 'Brazinskas, Prior, Scanlan, Aerospace 3(4):32 (2016) https://mdpi-res.com/d_attachment/aerospace/aerospace-03-00032/article_deploy/aerospace-03-00032.pdf (checked 2026-10-21)',
  S2: 'UIUC Propeller Data Site vol. 1, APC SF 10x4.7 @4014 rpm and APC E 10x7 @4007 rpm https://m-selig.ae.illinois.edu/props/volume-1/propDB-volume-1.html (checked 2026-10-21)',
  S3: 'Schiktanz & Scholz, CEAS 2011, box-wing induced drag (Rizzo eq. 3) https://www.fzt.haw-hamburg.de/pers/Scholz/Airport2030/Airport2030_PUB_CEAS_11-10-24.pdf (checked 2026-10-21)',
  S4: 'Larrabee, "Trim drag in the light of Munk\'s stagger theorem", NASA NTRS 19760003933 https://ntrs.nasa.gov/api/citations/19760003933/downloads/19760003933.pdf (checked 2026-10-21)',
  S5: 'NASA Glenn, Shape effects on drag, flat plate Cd 1.28 https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/shape-effects-on-drag/ (checked 2026-10-21)',
  S6: 'SunnySky X4120 V3 480KV thrust tables (EOLO 15x8, 22.2 V) https://www.sunnyskyusa.com/products/sunnysky-x4120 (checked 2026-10-21); price $105.99 from sunnyskyusa search listing',
  S7: 'goBILDA 2000-25-2 servo $36.99, 60 g, 21.6 kg-cm @6 V https://www.servocity.com/2000-series-dual-mode-servo-25-2/ (checked 2026-10-21)',
  S8: 'ServoCity Compact ServoBlock H25T $29.99, 44 g https://www.servocity.com/compact-servoblock-43mm-width-for-standard-size-h25t-spline-servo-hub-shaft/ (checked 2026-10-21)',
  S9: 'Holybro Kakute H743-Wing $105.00, 14 PWM, 28 g https://holybro.com/products/kakute-h743-wing (checked 2026-10-21)',
  S10: 'Hobbywing Skywalker 100A V2 $49.99 https://www.hobbywingdirect.com/products/skywalker-esc-100a (checked 2026-10-21); 92 g from search summary of readymaderc.com (unverified)',
  S11: 'APC 15x8E $8.05, 44 g https://www.apcprop.com/product/15x8e/ (checked 2026-10-21)',
  S12: 'Eolo foldable CN 17x6.2 pair $49.99 https://www.sunnyskyusa.com/products/eolo-cn17-6-2-prop (checked 2026-10-21)',
  S13: 'RobopowerUA 15000 mAh 6S Li-ion (P50B 6S3P) $275.00, 1350 g, 180 A max https://www.racedayquads.com/products/robopowerua-15000mah-6s-li-ion-battery-xt60 (checked 2026-10-21)',
  S14: 'Auline 18650 V45 6S2P 6000 mAh $164.99, 594 g, 90 A https://www.racedayquads.com/products/auline-18650-v45-6s2p-6000mah-22-2v-90a-li-ion-battery-xt60 (checked 2026-10-21)',
  S15: 'ArduPilot tilt-rotor guide https://ardupilot.org/plane/docs/guide-tilt-rotor.html (checked 2026-10-21)',
  S16: 'ArduPilot tailsitter guide https://ardupilot.org/plane/docs/guide-tailsitter.html (checked 2026-10-21)',
  S17: 'ArduPilot QuadPlane frame setup https://ardupilot.org/plane/docs/quadplane-frame-setup.html (checked 2026-10-21)',
  S18: 'ArduPilot weathervaning ("Tailsitters do not have these options") https://ardupilot.org/plane/docs/quadplane-weathervaning.html (checked 2026-10-21)',
  S19: 'PX4 VTOL overview https://docs.px4.io/main/en/frames_vtol/ (checked 2026-10-21)',
  S20: 'Bacchini, Cestino, Van Magill, Verstraete, Aerosp. Sci. Tech. 109:106429 (2021), abstract https://api.semanticscholar.org/graph/v1/paper/DOI:10.1016/j.ast.2020.106429?fields=title,abstract (checked 2026-10-21)',
  S21: 'Saha, arXiv:2112.02872v2, box vs mono wing small UAV https://arxiv.org/html/2112.02872v2 (checked 2026-10-21)',
  S22: 'ArduPilot forum: bicopter Q_TILT_TYPE problems https://discuss.ardupilot.org/t/parameter-setting-for-bicopter-with-tilt-rotors/91020 (checked 2026-10-21)',
  S23: 'ArduPilot forum: quad tilt (all four) builder moved to Copter https://discuss.ardupilot.org/t/arduplane-tilt-quadplanes-with-all-four-motors-tilting/23794 (checked 2026-10-21)',
  S24: 'ArduPilot forum: CL-84 tilt-wing https://discuss.ardupilot.org/t/ardupilot-flying-on-the-cl84-tiltwing-vtol-aircraft/14353 (checked 2026-10-21)',
  S25: 'ArduPilot forum: dual-motor tailsitter weathervaning https://discuss.ardupilot.org/t/dual-motor-tailsitters/15302?page=53 (checked 2026-10-21)',
  S26: 'ArduPilot forum: tilt servos failing https://discuss.ardupilot.org/t/tilt-servos-failing-frequently/68185 (checked 2026-10-21)',
  S27: 'ArduPilot forum: quad with 3 motors not flyable https://discuss.ardupilot.org/t/would-it-be-possible-for-arducopter-to-recover-from-losing-a-motor/114978 (checked 2026-10-21)',
  S28: 'ArduPilot QuadPlane thrust loss (warn only) https://ardupilot.org/plane/docs/quadplane-thrust-loss.html (checked 2026-10-21)',
  S29: 'Mousaei et al., tilt-rotor VTOL, arXiv:2205.05533 (4 x MG996R tilt servos, 4.6 kg, 2.0 m) https://arxiv.org/pdf/2205.05533 (checked 2026-10-21)',
  S30: 'Liang, Guo, Lyu, arXiv:2511.04251 (tailsitter gust deviation 0.820 m wings out vs 0.081 m retracted at ~5 m/s) https://arxiv.org/pdf/2511.04251 (checked 2026-10-21)',
  REPO: 'analysis/results.json, analysis/sizing.mjs, analysis/model.js, docs/research/*.md, docs/DESIGN-BASIS.md',
};

// ---------------------------------------------------------------- baseline inputs from the repo
const C0 = R.concepts.C0;
const BASEP = { ...C0.params }; delete BASEP.mBattFixed; delete BASEP.EBattFixed;
const TS_CLMAX_RATIO = 1.0/1.2, TS_DCD0 = 0.004;   // tailsitter deltas against the C0 baseline (EST, see the TS variants)
const X4110S = { name:BASEP.name, liftD:BASEP.liftD, Tmax_g:BASEP.Tmax_g, mMotor:BASEP.mMotor, mEsc:BASEP.mEsc, mProp:BASEP.mProp,
  mMount:BASEP.mMount, thrustTable:BASEP.thrustTable, CdA_rotor:BASEP.CdA_rotor };
// X4120 V3 480KV + EOLO 15x8 on 22.2 V (S6). Hover table points from S6; ESC Skywalker 100A (S10, mass unverified);
// prop priced as APC 15x8E (S11) while the table is EOLO 15x8 (mismatch, as flagged for C0 in budget-lift.md).
const X4120 = { name:'SunnySky X4120 V3 480KV + Skywalker 100A + 15x8', liftD:15*IN, Tmax_g:5800, mMotor:0.292, mEsc:0.092, mProp:0.044,
  mMount:0.030, thrustTable:[[1000,117.66],[1500,202.02],[2000,297.48],[2500,405.15],[3000,528.36],[3500,661.56],[4000,821.4],[5800,1469.64]],
  CdA_rotor:0.0034 };   // mMount EST (heavier motor); CdA_rotor only used where the rotor is stopped
const CRUISE_MARGIN_MIN = R.cruiseMarginMin;   // 11.5 min (sizing.mjs line 78)
const R10_MIN = 10;                            // DESIGN-BASIS R10
const POD_PUSH_D = 14*IN;                      // sizing.mjs line 76

// Packs: repo packs (BE §1, results.json packs) + Li-ion packs read 2026-10-21 (S13, S14)
const PACKS = [
  ...R.packs.map(p => ({ ...p, src:'results.json packs (BE §1, 2026-10-13)' })),
  { id:'RobopowerUA 6S3P 15000 Li-ion (P50B)', chem:'Li-ion', Wh:324.0, kg:1.350, usd:275.00, contA:180, src:'S13 (contA = listed max)' },
  { id:'Auline 6S2P 6000 Li-ion (V45)', chem:'Li-ion', Wh:129.6, kg:0.594, usd:164.99, contA:90, src:'S14' },
];

// Cruise efficiency of a hover (low-pitch) prop used for cruise: peak eta ratio of APC SF 10x4.7 (0.624 @ J 0.438)
// to APC E 10x7 (0.680 @ J 0.575) from S2, applied to the repo's EST 0.60. Best case for the hover prop (it runs at its peak J).
const ETA_HOVERPROP_CRUISE = +(BASEP.etaProp * 0.624/0.680).toFixed(4);   // 0.5506 EST from S2 ratio
// Low-Re penalty for halved chord (box, tandem): turbulent flat-plate Cf ~ Re^-0.2, halving Re -> x2^0.2 = 1.149 on an
// assumed wing profile share of CD0 of 0.012 (EST) -> dCD0 = 0.012*(2^0.2-1) = 0.0018. Direction confirmed by S21
// (mono L/D 14.98 at Re 1.5e5 vs box 13.40 at Re 0.75e5).
const DCD0_LOWRE = +(0.012*(Math.pow(2,0.2)-1)).toFixed(5);
// Box wing induced-drag ratio at h/b = 0.2, Rizzo (conservative) eq. from S3: (0.44+0.9594 h/b)/(0.44+2.219 h/b),
// times 1.034 for the stability lift split CL1/CL2 = 1.74 (S3).
const HB = 0.2, BOX_DI = (0.44+0.9594*HB)/(0.44+2.219*HB)*1.034;
// Tandem, equal spans, ~zero gap: Munk stagger theorem -> biplane of zero gap, sigma -> 1 -> induced drag of a
// monoplane of the same span (S4). So e is unchanged.

// ---------------------------------------------------------------- geometry: twin boom (re-implemented, sizing.mjs 90–128)
function twinBoomGeo(p, r){
  const D = p.liftD, clr = 0.05, fusHalf = POD.R, chord = r.chord, S = r.S;
  const pushR = p.noPusher ? 0 : POD_PUSH_D/2;
  const xLEtoCG = -0.28*chord, xRear = -(chord + D/2 + clr), xFront = 2*xLEtoCG - xRear, lh_tailLE = xRear - D/2 - clr;
  const yIn = Math.max(D/2 + fusHalf + clr, D/2 + pushR + 0.04);
  const hSpan0 = 2*yIn; let hC0 = 0.2, Sh, lh0;
  for(let k=0;k<6;k++){ lh0 = (-0.25*chord) - (lh_tailLE - 0.25*hC0); Sh = p.VhTarget*S*chord/lh0; hC0 = Sh/hSpan0; }
  const Sv = p.VvTarget*S*p.span/lh0;
  const boomLen = (xFront + 0.05) - (lh_tailLE - 0.22);
  const segFront = (xFront + 0.05) - xRear, segRear = xRear - (lh_tailLE - 0.22);   // butt at xRear, no overlap (sizing.mjs geometry())
  return { boomTotal: 2*boomLen, tailRatio: (Sh+Sv)/S, Sh, Sv, segs:[segFront, segRear, segFront, segRear], yIn };
}

// ---------------------------------------------------------------- closure + pack pick (re-implements sizing.mjs run())
function close(p, geoMode){
  const geo = (q, r) => {
    if(geoMode==='twin'){ const g = twinBoomGeo(q, r); q.boomTotalLen = g.boomTotal; q.tailAreaRatio = g.tailRatio; return g; }
    return null;  // fixed boomTotalLen / tailAreaRatio supplied by the variant
  };
  let r, g;
  for(let k=0;k<6;k++){ r = M.size(p); g = geo(p, r); }
  const design = M.size({ ...p });                      // continuous-battery design point
  const tryPack = pk => { const pp = { ...p, mBattFixed:pk.kg, EBattFixed:pk.Wh, Vpack: pk.chem==='LiPo'?22.2:21.6 };
    let rr = M.size(pp); for(let k=0;k<4;k++){ g = geo(pp, rr); rr = M.size(pp); } return { pp, rr, g }; };
  let chosen = null, packNote = '';
  const list = p.forcePack ? PACKS.filter(x=>x.id===p.forcePack) : [...PACKS].sort((a,b)=>a.usd-b.usd);
  for(const pk of list){ const t = tryPack(pk);
    if(p.forcePack || (t.rr.endurance_ok && t.rr.t_cruise_avail_min >= CRUISE_MARGIN_MIN && t.rr.I_hover <= pk.contA)){ chosen = { pk, ...t }; break; } }
  if(!chosen){ // fall back: cheapest pack meeting R10 (10 min) and current, else the largest-energy pack (flagged)
    for(const pk of list){ const t = tryPack(pk); if(t.rr.t_cruise_avail_min >= R10_MIN && t.rr.I_hover <= pk.contA){ chosen = { pk, ...t }; packNote='below 11.5 min design margin'; break; } }
    if(!chosen){ const pk = [...PACKS].sort((a,b)=>b.Wh-a.Wh)[0]; chosen = { pk, ...tryPack(pk) }; packNote = 'no pack meets R10'; }
  }
  return { p: chosen.pp, r: chosen.rr, g: chosen.g || g, pack: chosen.pk, packNote, design };
}

// ---------------------------------------------------------------- BOM edits on the C0 BOM
function bomFrom(baseLines, edits, packPick){
  let L = baseLines.map(l => ({ ...l }));
  const find = re => L.findIndex(l => re.test(l.item));
  const api = {
    qty(re, q){ const i = find(re); if(i<0) throw new Error('BOM item not found '+re); L[i].qty = q; L[i].ext = +(q*L[i].unit).toFixed(2); if(q===0) L.splice(i,1); },
    remove(re){ const i = find(re); if(i<0) throw new Error('BOM item not found '+re); L.splice(i,1); },
    add(cat, item, qty, unit, src, note=''){ L.push({ cat, item, qty, unit, ext:+(qty*unit).toFixed(2), src, note }); },
  };
  if(packPick){ api.remove(/Ovonic 6S 6500 100C/);
    if(packPick.pair) api.add('Energy', packPick.id.replace(' (2-pack)','')+' — 2-pack listing (2 packs)', 1, +(2*packPick.usd).toFixed(2), packPick.src);
    else api.add('Energy', packPick.id+' flight pack', 2, packPick.usd, packPick.src, 'second pack per R7'); }
  edits && edits(api);
  const goods = L.reduce((a,l)=>a+l.ext,0);
  const extraVendors = new Set(L.filter(l=>l.newVendor).map(l=>l.newVendor)).size;
  const shipping = R.concepts.C0.bom.shipping + 15*extraVendors;    // sizing.mjs bom() shipping allowance (results.json) + $15 per added vendor (EST)
  const tax = 0.1025*goods, total = goods + tax + shipping;
  return { lines:L, goods:+goods.toFixed(2), tax:+tax.toFixed(2), shipping, total:+total.toFixed(2), reserve:+(2000-total).toFixed(2) };
}
const tubesFor = segs => Math.ceil(segs.reduce((a,b)=>a+b,0)/1.80);   // sizing.mjs line 188

// tilt axis hardware (per axis): goBILDA 2000-25-2 servo 60 g (S7) + Compact ServoBlock 44 g (S8) + printed PA6-CF yoke 30 g (EST)
const TILT_AXIS_KG = 0.060 + 0.044 + 0.030;

// ---------------------------------------------------------------- variant definitions
// common fields: id, label, family, meetsR1, geo ('twin' or fixed), p (model overrides), extras [{item,kg,src}],
// bom(api, ctx) edits, pieces, longest(), ctl (0–10 risk, higher worse), sched (0–10), evidence strings,
// motorOut {hover:fn(r)->0..6, cruise:0..4, why}, exposure ('wing-edge' | 'planform'), build counts.
const quadMO = { hover: () => 0, cruise: 4, why:'4 lift rotors: a quad with one motor out is not flyable (S27); QuadPlane thrust-loss is warn-only (S28). Pusher-out: separate lift system lets QAssist/VTOL recovery land it (R15).' };
const C0BUILD = { motors:5, servos:5, tiltAxes:0, wingPivot:0, wingPanels:2, boomSegs:4, special:0 };
const C0CTL = { ctl:2, ctlWhy:'QuadPlane Q_FRAME_CLASS 1: the main documented ArduPilot path (S17); PX4 "Standard VTOL" easiest to control (S19).' };

const V = [];
// --- repo concepts reused exactly (results.json) ---
for(const k of ['C0','C1','C2','C3']){
  const c = R.concepts[k];
  V.push({ id:k, label:c.label+(k==='C0'?' — baseline v0.3.1':''), family: k==='C0'||k==='C3' ? 'Lift+cruise 4-lift (Alia-style)' : k==='C1' ? 'Lift+cruise 8-lift' : 'Lift+cruise coaxial X8',
    meetsR1:true, repo:k, pieces: k==='C1'?8:6,
    build: k==='C1' ? { motors:9, servos:5, tiltAxes:0, wingPivot:0, wingPanels:2, boomSegs:6, special:0 } : k==='C2' ? { motors:9, servos:5, tiltAxes:0, wingPivot:0, wingPanels:2, boomSegs:4, special:0 } : C0BUILD,
    ctl: k==='C1'?3 : k==='C2'?3 : 2,
    ctlWhy: k==='C1' ? 'Octa (Q_FRAME_CLASS 3) listed but no motor-order table in the frame page (S17); 9 ESCs to tune.' :
            k==='C2' ? 'OctaQuad (class 4) has a documented X8 output map (S17); needs H7 board (Kakute H743-Wing) per BOM.' : C0CTL.ctlWhy,
    sched: k==='C0'?1 : k==='C3'?1.5 : 4,
    schedWhy: k==='C0' ? 'v0.3.1 design, CAD, BOM and analysis exist (DESIGN-BASIS.md "Design outcomes").' : k==='C3' ? 'Motor swap only.' : 'Layout analysed in sizing.mjs but no CAD/structure check; 8 lift stations to build.',
    motorOut: k==='C1'||k==='C2' ? { hover: r => r.TW_motorOut>=1.2 ? 6 : r.TW_motorOut>=1.0 ? 3 : 0, cruise:4,
      why:'8 lift rotors: T/W with the opposite pair shut (sizing convention (n-2)/n) — survival depends on headroom and tuning; forum evidence only (S28).' } : quadMO,
    exposure:'wing-edge' });
}
V.push({ id:'C0-lean', label:'C0 with lean BOM (no airspeed sensor, minimum hardware kit, no spare servo)', family:'Lift+cruise 4-lift (Alia-style)',
  meetsR1:true, repo:'C0', lean:true, pieces:6, build:C0BUILD, ...C0CTL, ctl:3, ctlWhy:'As C0, but no airspeed sensor: transition completes on synthetic airspeed (ArduPilot docs advise 5 m/s more margin on Q_ASSIST_SPEED without a sensor, avionics-autopilot.md §1.2).',
  sched:1, schedWhy:'Same design as C0.', motorOut:quadMO, exposure:'wing-edge' });

// --- C0 parametric family (re-closed with the re-implemented twin-boom geometry) ---
for(const span of [2.0, 2.2, 2.4, 2.6, 2.8, 3.0]){
  V.push({ id:`C0-b${span.toFixed(1)}`, label:`C0 4-lift, span ${span.toFixed(1)} m (pack re-picked)`, family:'C0 span sweep', meetsR1:true,
    geo:'twin', p:{ span }, pieces:6, build:C0BUILD, ...C0CTL, sched: span===2.4?1:2, schedWhy: span===2.4?'Reproduction of C0 through this script (check vs results.json).':'Re-cut wing cores and re-run CAD/structures; same parts.',
    motorOut:quadMO, exposure:'wing-edge' });
}
for(const pk of PACKS.filter(x=>!/Ovonic 6S 6500 100C/.test(x.id))){
  V.push({ id:'C0-pk-'+pk.id.split(' ').slice(0,3).join('').replace(/[^A-Za-z0-9]/g,''), label:`C0 4-lift with ${pk.id}`, family:'C0 pack sweep', meetsR1:true,
    geo:'twin', p:{ forcePack: pk.id }, pieces:6, build:C0BUILD, ...C0CTL, sched: pk.chem==='Li-ion'?2:1.5,
    schedWhy: pk.chem==='Li-ion' ? 'New chemistry: different charger profile and sag behaviour to characterise.' : 'Pack swap; CG re-check.', motorOut:quadMO, exposure:'wing-edge' });
}
V.push({ id:'C0-fold', label:'C0 with Eolo foldable 17x6.2 lift props', family:'C0 variant', meetsR1:true, geo:'twin',
  p:{ CdA_rotor: BASEP.CdA_rotor*0.5, mProp: BASEP.mProp + 0.010 }, // EST: folded-prop CdA 50 % of a parked 2-blade (no source; S20 shows full retraction cuts parasite drag 38 % on a larger eVTOL); +10 g/prop EST (mass unit unclear on S12)
  bom: api => { api.remove(/JeeFly 1755 carbon prop/); api.remove(/JeeFly 1755 spare/);
    api.add('Lift propulsion','Eolo foldable CN 17x6.2 (pair)', 3, 49.99, 'S12 sunnyskyusa.com', '2 pairs + 1 spare pair'); },
  pieces:6, build:C0BUILD, ...C0CTL, sched:2, schedWhy:'Hub fit on X4110S not stated (—); whether stopped folding blades trail or windmill is unknown (lift-propulsion.md note 2).',
  motorOut:quadMO, exposure:'wing-edge' });
V.push({ id:'C0-lean-fold', label:'C0 lean BOM + Eolo foldable 17x6.2 lift props', family:'C0 variant', meetsR1:true, geo:'twin', leanBase:true,
  p:{ CdA_rotor: BASEP.CdA_rotor*0.5, mProp: BASEP.mProp + 0.010 },   // same EST as C0-fold
  bom: api => { api.remove(/JeeFly 1755 carbon prop/); api.remove(/JeeFly 1755 spare/);
    api.add('Lift propulsion','Eolo foldable CN 17x6.2 (pair)', 3, 49.99, 'S12 sunnyskyusa.com', '2 pairs + 1 spare pair'); },
  pieces:6, build:C0BUILD, ...C0CTL, ctl:3, ctlWhy:'As C0-lean (no airspeed sensor).', sched:2, schedWhy:'As C0-fold.',
  motorOut:quadMO, exposure:'wing-edge' });

// --- tilt-rotor family (front pair on the C0 booms tilts; no pusher; R1 departure) ---
const tiltCommon = (nTilt, nLift, nStoppedInCruise) => ({
  noPusher:true, mPusherSet:0, nLift, etaProp: ETA_HOVERPROP_CRUISE,
  CdA_rotor: BASEP.CdA_rotor*nStoppedInCruise/nLift,       // only stopped rotors keep the parked-prop drag
});
V.push({ id:'TR-tri', label:'Tilt-tricopter: 2 front tilting X4110S + 1 rear fixed (stopped in cruise), twin boom, no pusher', family:'Tiltrotor', meetsR1:false, geo:'twin',
  p:{ ...tiltCommon(2,3,1), mWirePerLift:0.03 }, extras:[{ item:'2 tilt axes (servo+ServoBlock+yoke)', kg:2*TILT_AXIS_KG, src:'S7, S8, yoke EST' }],
  bom: api => { api.qty(/^SunnySky X4110S 400KV$/, 3); api.remove(/X4110S 400KV \(pusher\)/); api.remove(/APC 14x8.5EP/); api.qty(/SoloGood 45A/, 1);
    api.add('Tilt','goBILDA 2000-25-2 servo (tilt), +1 spare', 3, 36.99, 'S7'); api.add('Tilt','ServoCity Compact ServoBlock H25T', 2, 29.99, 'S8');},
  newVendors:1, pieces:6, build:{ motors:3, servos:7, tiltAxes:2, wingPivot:0, wingPanels:2, boomSegs:4, special:0 },
  ctl:5, ctlWhy:'Supported (Q_TILT_TYPE/Q_TILT_MASK, vectored yaw; PX4 reference E-flite Convergence) (S15, S19); forum crashes from Q_TILT_MASK errors and tilt-servo stripping (S26).',
  sched:6, schedWhy:'New tilt mechanism, new yaw scheme, new CG/thrust split (rear motor carries more), CAD/structure redo.',
  motorOut:{ hover:()=>0, cruise:1, why:'3 rotors: no hover motor-out. A front-motor loss in cruise leaves asymmetric thrust and no separate VTOL system.' }, exposure:'wing-edge' });
V.push({ id:'TR-quadF', label:'Tilt-quad, front pair tilts, rear pair stopped in cruise (no pusher)', family:'Tiltrotor', meetsR1:false, geo:'twin',
  p:{ ...tiltCommon(2,4,2) }, extras:[{ item:'2 tilt axes', kg:2*TILT_AXIS_KG, src:'S7, S8, yoke EST' }],
  bom: api => { api.remove(/X4110S 400KV \(pusher\)/); api.remove(/APC 14x8.5EP/);
    api.add('Tilt','goBILDA 2000-25-2 servo (tilt), +1 spare', 3, 36.99, 'S7'); api.add('Tilt','ServoCity Compact ServoBlock H25T', 2, 29.99, 'S8'); },
  newVendors:1, pieces:6, build:{ motors:4, servos:7, tiltAxes:2, wingPivot:0, wingPanels:2, boomSegs:4, special:0 },
  ctl:5.5, ctlWhy:'Tilt-quadplane with Q_TILT_MASK on the front pair is covered by the generic tilt-rotor page (S15); few documented builds.',
  sched:6, schedWhy:'Tilt mechanism and transition tuning on top of the C0 airframe.',
  motorOut:{ hover:()=>0, cruise:2, why:'4 lift rotors: no hover motor-out (S27). Cruise: one front-motor loss -> asymmetric thrust; rear pair can still restart for VTOL landing.' }, exposure:'wing-edge' });
V.push({ id:'TR-quadA', label:'Tilt-quad, all four rotors tilt and drive cruise (no pusher)', family:'Tiltrotor', meetsR1:false, geo:'twin',
  p:{ ...tiltCommon(4,4,0) }, extras:[{ item:'4 tilt axes', kg:4*TILT_AXIS_KG, src:'S7, S8, yoke EST' }, { item:'Kakute H743-Wing vs CoreWing (28 g vs —)', kg:0, src:'S9' }],
  bom: api => { api.remove(/X4110S 400KV \(pusher\)/); api.remove(/APC 14x8.5EP/); api.remove(/CoreWing F405/);
    api.add('Avionics','Holybro Kakute H743-Wing (14 PWM: 4 motors + 4 tilt + 5 surfaces)', 1, 105.00, 'S9 holybro.com', 'ships CN');
    api.add('Tilt','goBILDA 2000-25-2 servo (tilt), +1 spare', 5, 36.99, 'S7'); api.add('Tilt','ServoCity Compact ServoBlock H25T', 4, 29.99, 'S8'); },
  newVendors:1, pieces:6, build:{ motors:4, servos:9, tiltAxes:4, wingPivot:0, wingPanels:2, boomSegs:4, special:0 },
  ctl:7, ctlWhy:'Thin evidence: an all-four-tilting builder hit inverted roll/yaw after transition and moved to Copter (S23). Mousaei et al. fly one with custom control (S29).',
  sched:7, schedWhy:'Four tilt mechanisms, 13 outputs (new FC), rear rotors in the wing wake in cruise.',
  motorOut:{ hover:()=>0, cruise:2, why:'4 rotors: no hover motor-out (S27). Cruise: 3 remaining rotors can still provide thrust.' }, exposure:'wing-edge' });
V.push({ id:'TR-bi', label:'Bicopter tiltrotor: 2 x X4120 15x8 on wing nacelles, single tail boom', family:'Tiltrotor', meetsR1:false, geo:'fixed',
  p:{ ...X4120, noPusher:true, mPusherSet:0, nLift:2, nBooms:1, boomTotalLen:1.6, tailAreaRatio:BASEP.tailAreaRatio, CdA_rotor:0, mGear: BASEP.mGear },
  extras:[{ item:'2 tilt axes (pitch control by tilt: must be fast)', kg:2*TILT_AXIS_KG, src:'S7, S8, yoke EST' }],
  bom: api => { api.remove(/^SunnySky X4110S 400KV$/); api.remove(/X4110S 400KV \(pusher\)/); api.remove(/APC 14x8.5EP/); api.remove(/JeeFly 1755 carbon prop/); api.remove(/JeeFly 1755 spare/);
    api.remove(/SoloGood 45A/); api.remove(/X4110S spare motor/);
    api.add('Lift propulsion','SunnySky X4120 V3 480KV', 3, 105.99, 'S6', '2 + 1 spare'); api.add('Lift propulsion','Hobbywing Skywalker 100A V2 ESC', 3, 49.99, 'S10', '2 + 1 spare');
    api.add('Lift propulsion','APC 15x8E prop', 4, 8.05, 'S11', 'needs CW/CCW pair: APC E props are one rotation (check) — —');
    api.qty(/6061-T6 tube 1.000 x 0.035/, 1);
    api.add('Tilt','goBILDA 2000-25-2 servo (tilt), +1 spare', 3, 36.99, 'S7'); api.add('Tilt','ServoCity Compact ServoBlock H25T', 2, 29.99, 'S8'); },
  newVendors:2, pieces:4, build:{ motors:2, servos:7, tiltAxes:2, wingPivot:0, wingPanels:2, boomSegs:1, special:0 },
  ctl:9, ctlWhy:'Least mature: Q_TILT_TYPE 3 needs Q_FRAME_CLASS 10; a 2022 builder gave up on ArduPilot for a bicopter (S22).',
  sched:8.5, schedWhy:'Pitch in hover by tilt servos only; new motors/ESCs; no reference build in class.',
  motorOut:{ hover:()=>0, cruise:0, why:'2 rotors: any motor loss is unrecoverable in hover or cruise.' }, exposure:'wing-edge' });
V.push({ id:'TW-4', label:'Tilt-wing: 4 x X4110S on the wing, wing pivots, tail pitch fan (V3508), single tail boom', family:'Tilt-wing', meetsR1:false, geo:'fixed',
  p:{ noPusher:true, mPusherSet:0, nLift:4, nBooms:1, boomTotalLen:1.2+4*0.25, tailAreaRatio:BASEP.tailAreaRatio, CdA_rotor: 0.0028/4, etaProp:ETA_HOVERPROP_CRUISE },
  extras:[{ item:'wing pivot: 2 goBILDA + 2 ServoBlock + 2 FR82RS bearings + yoke', kg:2*(0.060+0.044+0.023)+0.030, src:'S7, S8, andymark FR82RS 23 g (configurations.md §6), yoke EST' },
          { item:'pivot/fuselage reinforcement', kg:0.150, src:'EST (GL-10 TM reports tilt actuator mass only qualitatively)' },
          { item:'tail pitch fan V3508 + LANRC 35A + CN15x5.5 + mount', kg:0.097+0.015+0.020+0.015, src:'budget-lift.md B3; mount EST' }],
  bom: api => { api.remove(/X4110S 400KV \(pusher\)/); api.remove(/APC 14x8.5EP/); api.qty(/6061-T6 tube 1.000 x 0.035/, 2);
    api.add('Tilt','goBILDA 2000-25-2 servo (wing pivot), +1 spare', 3, 36.99, 'S7'); api.add('Tilt','ServoCity Compact ServoBlock H25T', 2, 29.99, 'S8');
    api.add('Tilt','AndyMark FR82RS flanged bearing', 2, 3.60, 'configurations.md §6 andymark.com');
    api.add('Lift propulsion','SunnySky V3508 KV380 (tail pitch fan)', 1, 42.99, 'budget-lift.md B3'); api.add('Lift propulsion','Eolo CN15x5.5 prop pair (tail fan)', 1, 17.99, 'budget-lift.md');
    api.add('Lift propulsion','LANRC 35A ESC 4-pack (tail fan)', 1, 28.50, 'budget-lift.md'); },
  newVendors:2, pieces:4, build:{ motors:5, servos:5, tiltAxes:2, wingPivot:1, wingPanels:2, boomSegs:1, special:1 },
  ctl:8, ctlWhy:'Only a passing mention in the tilt-rotor page (Q_TILT_WING_FLAP) (S15); one documented ArduPilot build (CL-84, 2017) with transition trouble (S24).',
  sched:9, schedWhy:'Wing pivot through the joiner, hover pitch fan, wing-stall management in transition; no repo analysis.',
  motorOut:{ hover:()=>0, cruise:2, why:'4 wing rotors: no hover motor-out; cruise motor-out leaves 3 rotors.' }, exposure:'planform' });
V.push({ id:'TS-quad', label:'Quad tailsitter: 4 x X4110S on 2 wing pylons, elevons, fins as gear, no tail', family:'Tailsitter', meetsR1:false, geo:'fixed',
  p:{ noPusher:true, mPusherSet:0, nLift:4, nBooms:2, boomTotalLen:2*0.55, tailAreaRatio:0.06, CdA_rotor:0, etaProp:ETA_HOVERPROP_CRUISE,
      CLmax:BASEP.CLmax*TS_CLMAX_RATIO, CD0_clean:BASEP.CD0_clean-TS_DCD0, mGear:0.08, mServos:2*0.0432 },
  // CLmax = baseline x 1.0/1.2 EST (reflexed flying-wing section; the ratio of the original 1.0 EST to the then-baseline 1.2);
  // CD0 = baseline - 0.004 EST (tail + gear removed; the original 0.030 -> 0.026 EST step);
  // fins/feet 80 g EST (same allowance as the repo's printed feet); tailAreaRatio 0.06 EST (fins only)
  extras:[],
  bom: api => { api.remove(/X4110S 400KV \(pusher\)/); api.remove(/APC 14x8.5EP/); api.qty(/EMAX ES3005HV servo$/, 2); api.qty(/6061-T6 tube 1.000 x 0.035/, 1); },
  pieces:3, build:{ motors:4, servos:2, tiltAxes:0, wingPivot:0, wingPanels:2, boomSegs:2, special:0 },
  ctl:6, ctlWhy:'Copter-motor tailsitter supported (Q_TAILSIT_ENABLE 2) (S16) but no weathervane assist for tailsitters (S18); PX4: harder to control in wind (S19); gust drift 10x with wing exposed (S30).',
  sched:6.5, schedWhy:'Whole airframe new; hover in R16 wind is the gating test; landing on fins.',
  motorOut:{ hover:()=>0, cruise:2, why:'4 rotors: no hover motor-out (S27); in cruise 3 rotors keep it flying but it cannot hover to land.' }, exposure:'planform' });
V.push({ id:'TS-duo', label:'Twin-motor tailsitter: 2 x X4120 15x8 on the wing, elevons in slipstream', family:'Tailsitter', meetsR1:false, geo:'fixed',
  p:{ ...X4120, noPusher:true, mPusherSet:0, nLift:2, nBooms:0, boomTotalLen:0, tailAreaRatio:0.06, CdA_rotor:0, CLmax:BASEP.CLmax*TS_CLMAX_RATIO, CD0_clean:BASEP.CD0_clean-TS_DCD0, mGear:0.08, mServos:2*0.0432 },
  extras:[],
  bom: api => { api.remove(/^SunnySky X4110S 400KV$/); api.remove(/X4110S 400KV \(pusher\)/); api.remove(/APC 14x8.5EP/); api.remove(/JeeFly 1755 carbon prop/); api.remove(/JeeFly 1755 spare/);
    api.remove(/SoloGood 45A/); api.remove(/X4110S spare motor/); api.remove(/6061-T6 tube 1.000 x 0.035/); api.qty(/EMAX ES3005HV servo$/, 2);
    api.add('Lift propulsion','SunnySky X4120 V3 480KV', 3, 105.99, 'S6', '2 + 1 spare'); api.add('Lift propulsion','Hobbywing Skywalker 100A V2 ESC', 3, 49.99, 'S10', '2 + 1 spare');
    api.add('Lift propulsion','APC 15x8E prop', 4, 8.05, 'S11'); },
  newVendors:1, pieces:3, build:{ motors:2, servos:2, tiltAxes:0, wingPivot:0, wingPanels:2, boomSegs:0, special:0 },
  ctl:7, ctlWhy:'Dual-motor tailsitter supported (S16); PX4 "harder to fly and tune ... especially in wind" (S19); ArduPilot builders report weathervaning losses (S25).',
  sched:7, schedWhy:'Pitch/yaw in hover only from elevons in the slipstream; whole airframe new.',
  motorOut:{ hover:()=>0, cruise:0, why:'2 rotors: any motor loss is unrecoverable.' }, exposure:'planform' });
// --- wing-planform variants that keep R1 (lift + cruise) ---
V.push({ id:'BW-qp', label:'Box-wing quadplane: C0 lift system + 2 wings joined by tip plates (h/b 0.2), H-tail kept', family:'Box / joined wing', meetsR1:true, geo:'twin',
  p:{ e: BASEP.e/BOX_DI, CD0_clean: BASEP.CD0_clean + DCD0_LOWRE, rhoFoam: BASEP.rhoFoam/2, m_spar: 2*0.75*BASEP.m_spar },
  // rhoFoam/2 reproduces two wings of S/2 at chord c/2 in model.js F11 (foam term ~ S*c); skins unchanged (same total area).
  // m_spar x2 x0.75 EST: two spars each carrying half the root moment, limited by the thinner section.
  extras:[{ item:'2 tip plates, h = 0.2 b, chord ~0.12 m, 1 in foam + tape (0.93 kg/m2)', kg:2*0.48*0.12*0.93, src:'sizing.mjs sigmaTail; geometry EST' }],
  bom: api => { api.add('Airframe','6061-T6 tube 1.000 x 0.058 in x 96 in (2nd spar set)', 1, 53.97, 'BF §1 (repo price)'); api.add('Airframe','6061-T6 tube 0.875 x 0.058 in x 36 in (2nd joiner)', 1, 18.45, 'BF §1');
    api.add('Airframe','FOAMULAR NGX F-250 2 in sheet (2nd wing cores)', 1, 59.97, 'BF §2'); },
  pieces:10, build:{ motors:5, servos:7, tiltAxes:0, wingPivot:0, wingPanels:4, boomSegs:4, special:4 },
  ctl:3, ctlWhy:'Controls identical to C0 (QuadPlane, S17); untested aero/stability coupling of front/rear wings (S3).',
  sched:8, schedWhy:'Four wing panels, tip-plate joints, second spar set that does not fit the half-chord section (t = 18 mm < 25.4 mm tube).',
  motorOut:quadMO, exposure:'wing-edge' });
V.push({ id:'TA-qp', label:'Tandem-wing quadplane: 2 wings of 2.4 m, rotors on short nacelles, pusher kept, no H-tail', family:'Tandem wing', meetsR1:true, geo:'fixed',
  p:{ CD0_clean: BASEP.CD0_clean + DCD0_LOWRE, rhoFoam: BASEP.rhoFoam/2, m_spar: 2*0.75*BASEP.m_spar, nBooms:4, boomTotalLen:4*0.33,
      CdA_boom: BASEP.CdA_boom*0.33/1.41, tailAreaRatio: 0.10, mFus: BASEP.mFus*(1.2/0.85) },
  // e unchanged (Munk/Larrabee, S4); nacelle 0.33 m = D/2 + clr + c/2 EST; CdA per nacelle scaled by length EST; fins-only tail 0.10 EST;
  // pod stretched 0.85 -> 1.2 m so the wings clear the rotor discs (mass scaled by length, EST).
  extras:[],
  bom: api => { api.qty(/6061-T6 tube 1.000 x 0.035/, 1); api.add('Airframe','6061-T6 tube 1.000 x 0.058 in x 96 in (2nd spar set)', 1, 53.97, 'BF §1');
    api.add('Airframe','6061-T6 tube 0.875 x 0.058 in x 36 in (2nd joiner)', 1, 18.45, 'BF §1'); api.add('Airframe','FOAMULAR NGX F-250 2 in sheet (2nd wing cores)', 1, 59.97, 'BF §2'); },
  pieces:5, build:{ motors:5, servos:5, tiltAxes:0, wingPivot:0, wingPanels:4, boomSegs:0, special:2 },
  ctl:3.5, ctlWhy:'QuadPlane controls (S17); pitch stability from the wing pair (no tail) is CG-sensitive and unanalysed.',
  sched:6.5, schedWhy:'New fuselage, four wing panels, second spar does not fit the half-chord section; new stability analysis.',
  motorOut:quadMO, exposure:'wing-edge' });

// ---------------------------------------------------------------- evaluate
function evaluate(v){
  let r, p, pack, g, packNote = '', bom, segs, design;
  if(v.repo){
    const c = R.concepts[v.repo]; p = c.params; r = M.size(p); pack = c.pick; g = c.geo; segs = c.geo.segs; design = c.design;
    const b = v.lean ? c.bomLean : c.bom;
    bom = { lines:b.lines, goods:b.goods, tax:b.tax, shipping:b.shipping, total:b.total, reserve:b.crash };
  } else {
    p = { ...BASEP, ...v.p };
    const extraKg = (v.extras||[]).reduce((a,x)=>a+x.kg,0);
    p.mFus = (v.p.mFus ?? BASEP.mFus) + extraKg;                       // config extras carried in the fixed mass (F12)
    const out = close(p, v.geo); r = out.r; p = out.p; pack = out.pack; g = out.g; packNote = out.packNote; design = out.design;
    segs = v.geo==='twin' ? g.segs : [];
    bom = bomFrom(v.leanBase ? C0.bomLean.lines : C0.bom.lines, api => {
      if(v.geo==='twin') api.qty(/6061-T6 tube 1.000 x 0.035/, tubesFor(segs));
      v.bom && v.bom(api);
    }, pack.id === C0.pick.id ? null : pack);
    if(v.newVendors){ bom.shipping += 15*v.newVendors; bom.total = +(bom.total + 15*v.newVendors).toFixed(2); bom.reserve = +(2000-bom.total).toFixed(2); }
  }
  const span = p.span, half = span/2;
  const longest = Math.max(half, ...(segs.length?segs:[0]), v.id==='TA-qp'?1.2:0, POD.L);   // pod length (geometry.mjs POD.L)
  // hover gust exposure at the R16 8 m/s gust: F = 0.5 rho V^2 A Cd, Cd 1.28 flat plate (S5); tilt to hold = atan(F/W)
  const tWing = p.tc*r.chord;
  const A = v.exposure==='planform' ? r.S : Math.max(span*tWing + (2*POD.R)*(2*POD.R), POD.L*(2*POD.R) + (g&&g.Sv?g.Sv:0.057));   // pod frontal 2R x 2R, side L x 2R
  const Fg = 0.5*p.rho*8*8*A*1.28, gustTilt = Math.atan(Fg/r.W)*180/Math.PI;
  const MS_J = R.concepts.C0.struct.MS_J * (R.concepts.C0.sized.W*R.base.span)/(r.W*span);
  const TmaxTot_kg = p.nLift*p.Tmax_g/1000/(p.coax?p.kCoax:1);
  const growth = TmaxTot_kg/1.6 - r.m;                                  // payload growth before R13 T/W 1.6 is lost
  const b = v.build, buildIdx = b.motors + b.servos + 3*b.tiltAxes + 6*b.wingPivot + b.wingPanels + b.boomSegs + 2*b.special;
  const mo = v.motorOut, moHover = mo.hover(r), moScore = moHover + mo.cruise;
  const metrics = {
    MTOW_kg:r.m, empty_kg_noBatt_noPayload: r.m - r.m_batt - p.mPayload, battery_kg:r.m_batt, pack:pack.id, packNote,
    S_m2:r.S, AR:r.AR, chord_m:r.chord, LD:r.LD, CD0:r.CD0, diskLoading_Nm2:r.diskLoading, wingLoading_Nm2:r.wingLoading,
    P_hover_W:r.P_hover, P_cruise_W:r.P_cruise, I_hover_A:r.I_hover, E_mission_Wh:r.E_Wh, E_pack_Wh:r.Epack_Wh,
    E_usable_Wh: r.Epack_Wh*(1-p.reserve)*p.etaBatt, cruise_avail_min:r.t_cruise_avail_min,
    cruise_margin_pct:(r.t_cruise_avail_min/R10_MIN-1)*100, TW:r.TW, TW_motorOut:r.TW_motorOut, growth_kg:growth,
    m_lift:r.m_lift, m_booms:r.m_booms, m_wing:r.m_wing, m_tail:r.m_tail, m_fixed:r.m_fixed, extras:v.extras||[],
    cost_total_usd:bom.total, reserve_usd:bom.reserve, goods_usd:bom.goods, tax_usd:bom.tax, shipping_usd:bom.shipping,
    span_m:span, longestPiece_m:longest, pieces:v.pieces, gustForce_N:Fg, gustTilt_deg:gustTilt, exposedArea_m2:A,
    joinerMS_scaled:MS_J, buildIndex:buildIdx, controlRisk:v.ctl, scheduleRisk:v.sched, motorOutPoints:moScore,
  };
  // feasibility (hard constraints) and warnings
  const flags = [], warns = [];
  if(bom.total > 2000) flags.push(`R6: total $${bom.total.toFixed(2)} > $2,000 cap`);
  if(r.t_cruise_avail_min < R10_MIN) flags.push(`R10: ${r.t_cruise_avail_min.toFixed(1)} min cruise after hover + 20 % reserve < 10 min`);
  if(r.TW < 1.6) flags.push(`R13: T/W ${r.TW.toFixed(2)} < 1.6`);
  if(r.I_hover > pack.contA) flags.push(`Pack: hover current ${r.I_hover.toFixed(1)} A > ${pack.contA} A`);
  if(span < 2 || span > 3) flags.push('R3: span outside 2–3 m');
  if(longest > 1.5 + 1e-9) flags.push(`R4: longest piece ${longest.toFixed(2)} m > 1.5 m`);
  if(r.m >= 25) flags.push('R2: MTOW >= 25 kg');
  if(MS_J < 1.0 && !/BW|TA/.test(v.id)) flags.push(`Structure: scaled joiner reserve ${MS_J.toFixed(2)} < 1.0`);
  if(!r.converged) flags.push('sizing did not converge');
  if(bom.reserve < 100 && bom.total <= 2000) warns.push(`R7: crash reserve $${bom.reserve.toFixed(0)} < $100 target`);
  if(r.t_cruise_avail_min < CRUISE_MARGIN_MIN && r.t_cruise_avail_min >= R10_MIN) warns.push('R10 met but below the 11.5 min design margin');
  if(gustTilt > 15) warns.push(`R16: ${gustTilt.toFixed(0)}° tilt needed to hold against an 8 m/s gust in hover (planform exposed)`);
  if(!v.meetsR1) warns.push('R1 (Given): not lift + cruise with stopped lift rotors — needs the team to change the project definition');
  if(/BW|TA/.test(v.id)) warns.push('Spar: half-chord wing (t ≈ 18 mm) does not fit the 25.4 mm socket tube; spar redesign —');
  if(r.m < 8) warns.push(`R2: MTOW ${r.m.toFixed(2)} kg below the 8–15 kg working target (accepted for C0 pending sign-off)`);
  return { id:v.id, label:v.label, family:v.family, meetsR1:v.meetsR1, inputs:{ overrides:v.p||{repoConcept:v.repo}, extras:v.extras||[], build:v.build,
    pieces:v.pieces, controlRiskWhy:v.ctlWhy, scheduleRiskWhy:v.schedWhy, motorOutWhy:mo.why }, metrics, bom:bom.lines,
    feasible: flags.length===0, flags, warnings:warns };
}

// ---------------------------------------------------------------- criteria, weights, scoring
const clamp = x => Math.max(0, Math.min(10, x));
const CRITERIA = [
  { key:'cost', w:0.15, name:'Cost margin under the $2,000 cap', score: m => clamp(m.reserve_usd/300*10),
    anchor:'0 at $0 reserve, 10 at >= $300 reserve (3x the R7 $100 target)', why:'R6 is fixed and R7 needs a crash reserve; a student first build usually crashes at least once, so reserve buys a second chance. Feasibility already removes over-cap designs, so this weighs margin only.' },
  { key:'energy', w:0.15, name:'Mission energy margin', score: m => clamp(m.cruise_margin_pct/100*10),
    anchor:'0 at 10 min (R10 exactly), 10 at 20 min cruise available after 2 min hover and 20 % reserve', why:'Drag, prop efficiency and Oswald e are estimates (sizing.mjs EST tags); margin absorbs model error before R10 fails.' },
  { key:'portability', w:0.10, name:'MTOW / portability', score: m => 0.7*clamp((15-m.MTOW_kg)/10*10) + 0.3*clamp(10-2*(m.pieces-3)),
    anchor:'mass part: 10 at 5 kg, 0 at 15 kg; pieces part: 10 at 3 pieces, -2 per extra piece', why:'R4/R5: two people carry it, four handle it, <= 15 min assembly. R4 envelope failures are hard flags; this ranks ease within the envelope.' },
  { key:'build', w:0.15, name:'Build complexity (student team, FDM printer, hand tools)', score: m => clamp(10*(32-m.buildIndex)/20),
    anchor:'index = motors + servos + 3 x tilt axes + 6 x wing pivot + wing panels + boom segments + 2 x special joints; 10 at index 12, 0 at 32', why:'R8: four students, printer and hand tools only; every actuator and joint is build, wiring and test time.' },
  { key:'control', w:0.15, name:'Control / transition risk (autopilot maturity)', score: m => 10 - m.controlRisk,
    anchor:'10 - rubric risk (0 = documented reference path, 10 = no working reference); evidence per variant', why:'Transition and hover tuning is where small VTOL projects fail (forum crash reports in configurations.md); R17 asks for maintained support.' },
  { key:'schedule', w:0.10, name:'Schedule risk to 2027-04-30', score: m => 10 - m.scheduleRisk,
    anchor:'10 - rubric risk (redesign scope from the v0.3.1 baseline, new mechanisms, lead time)', why:'R8: about 6 months remain; C0 already has CAD, BOM and analysis, so redesign scope is a real cost.' },
  { key:'motorOut', w:0.10, name:'Robustness to motor-out', score: m => clamp(m.motorOutPoints),
    anchor:'hover motor-out 0–6 (6 if T/W with a pair out >= 1.2) + cruise propulsion-out recovery 0–4', why:'R14 (desired) and R15. Weighted below cost/controls because R14 was accepted with hover limits (DESIGN-BASIS R14).' },
  { key:'growth', w:0.10, name:'Growth / payload margin', score: m => clamp(m.growth_kg/3*10),
    anchor:'kg of extra mass before T/W falls to 1.6 (R13); 10 at >= 3 kg', why:'R12 reserves 0.5 kg; mass growth during the build is normal and must not break R13.' },
];
const Wsum = CRITERIA.reduce((a,c)=>a+c.w,0);
if(Math.abs(Wsum-1) > 1e-9) throw new Error('weights must sum to 1');

const results = V.map(evaluate);
for(const v of results){
  v.scores = Object.fromEntries(CRITERIA.map(c => [c.key, +c.score(v.metrics).toFixed(3)]));
  v.total = +CRITERIA.reduce((a,c)=>a + c.w*v.scores[c.key], 0).toFixed(4);
}
const rank = (list, weights) => [...list].sort((a,b)=>tot(b,weights)-tot(a,weights) || a.id.localeCompare(b.id));
const tot = (v, w) => CRITERIA.reduce((a,c,i)=>a + w[i]*v.scores[c.key], 0);
const W0 = CRITERIA.map(c=>c.w);
const feasible = results.filter(v=>v.feasible), feasR1 = feasible.filter(v=>v.meetsR1);
const ranked = rank(results, W0);
const rankedFeas = rank(feasible, W0), rankedR1 = rank(feasR1, W0);

// sensitivity: each weight x0.7 and x1.3, others rescaled proportionally to keep the sum at 1
const sens = [];
for(let i=0;i<CRITERIA.length;i++) for(const f of [0.7, 1.3]){
  const wi = W0[i]*f, rest = 1 - W0[i], w = W0.map((x,j)=> j===i ? wi : x*(1-wi)/rest);
  const rf = rank(feasible, w), rr = rank(feasR1, w);
  sens.push({ criterion:CRITERIA[i].key, factor:f, weight:+wi.toFixed(4), winnerFeasible:rf[0].id, top3Feasible:rf.slice(0,3).map(x=>x.id),
    winnerFeasibleR1:rr[0].id, winnerChanged: rf[0].id!==rankedFeas[0].id || rr[0].id!==rankedR1[0].id });
}
// physics sensitivity on the most uncertain config factor: hover-prop cruise efficiency (no penalty, eta 0.60)
// and pessimistic: hover prop run off its peak, eta 0.398 at J 0.577 on APC SF 10x4.7 (S2) -> 0.60 x 0.398/0.680 = 0.351 EST
const ETA_PESS = +(BASEP.etaProp*0.398/0.680).toFixed(4);
const scoreOf = v => { v.scores = Object.fromEntries(CRITERIA.map(c => [c.key, +c.score(v.metrics).toFixed(3)])); v.total = +CRITERIA.reduce((a,c)=>a + c.w*v.scores[c.key], 0).toFixed(4); return v; };
const physSens = V.filter(v=>v.p && v.p.etaProp===ETA_HOVERPROP_CRUISE).map(v=>{
  const best = scoreOf(evaluate({ ...v, p:{ ...v.p, etaProp:BASEP.etaProp } }));
  const pess = scoreOf(evaluate({ ...v, p:{ ...v.p, etaProp:ETA_PESS } }));
  const base = results.find(x=>x.id===v.id);
  const feasWith = alt => rank(results.filter(x=>x.feasible && x.id!==v.id).concat(alt.feasible?[alt]:[]), W0)[0].id;
  return { id:v.id, eta_base:ETA_HOVERPROP_CRUISE, eta_best:BASEP.etaProp, eta_pess:ETA_PESS,
    cruise_min:{ base:base.metrics.cruise_avail_min, best:best.metrics.cruise_avail_min, pess:pess.metrics.cruise_avail_min },
    MTOW:{ base:base.metrics.MTOW_kg, best:best.metrics.MTOW_kg, pess:pess.metrics.MTOW_kg },
    total:{ base:base.total, best:best.total, pess:pess.total }, feasible:{ base:base.feasible, best:best.feasible, pess:pess.feasible },
    pessFlags:pess.flags, feasibleWinnerIfPess: feasWith(pess) };
});
// stopped-lift-prop drag (CdA_rotor 0.0034 m^2 is EST in sizing.mjs): C0 cruise time at x0.5 and x2
const cdaSens = [0.5, 1, 2].map(k => { const e = evaluate({ ...V.find(v=>v.id==='C0-b2.4'), p:{ span:2.4, CdA_rotor:BASEP.CdA_rotor*k } });
  return { CdA_rotor_factor:k, MTOW:e.metrics.MTOW_kg, LD:e.metrics.LD, P_cruise_W:e.metrics.P_cruise_W, cruise_min:e.metrics.cruise_avail_min, pack:e.metrics.pack, total:e.metrics.cost_total_usd }; });

// reproduction check: C0 through this script vs results.json
const rep = results.find(x=>x.id==='C0-b2.4');
const check = { C0_results_json:{ MTOW:R.concepts.C0.sized.m, cruise_min:R.concepts.C0.sized.t_cruise_avail_min, total:R.concepts.C0.bom.total, boomTotal:R.concepts.C0.geo.boomTotal },
  C0_this_script:{ MTOW:rep.metrics.MTOW_kg, cruise_min:rep.metrics.cruise_avail_min, total:rep.metrics.cost_total_usd, boomTotal:twinBoomGeo({ ...BASEP }, R.concepts.C0.sized).boomTotal } };
{ const a=check.C0_results_json, b=check.C0_this_script, bad=['MTOW','cruise_min','total','boomTotal'].filter(k=>Math.abs(a[k]-b[k]) > 1e-3*Math.max(1,Math.abs(a[k])));
  if(bad.length){ console.error('tradestudy reproduction check FAILED:', bad.map(k=>`${k} ${a[k]} vs ${b[k]}`).join('; ')); process.exit(1); } }

const out = {
  generated:'2026-10-25', script:'analysis/tradestudy.mjs', model:'analysis/model.js size() (unchanged)', inputs:'analysis/results.json (sizing.mjs v0.4 outputs)',
  notes:[ 'All costs include 10.25 % tax and the sizing shipping allowance (results.json C0 bom.shipping) plus $15 per added vendor (EST); fees outside the cap excluded (R6).',
    'Rubric scores (controlRisk, scheduleRisk, motor-out cruise points) are engineering judgements (EST) with the evidence quoted per variant.',
    'Non-R1 variants (tiltrotor, tilt-wing, tailsitter) are scored for comparison; R1 is a Given requirement, so they are ranked separately.',
    `Hover-prop cruise efficiency ${ETA_HOVERPROP_CRUISE} EST (S2 ratio); low-Re dCD0 ${DCD0_LOWRE} EST; box-wing Di ratio ${BOX_DI.toFixed(3)} (S3).` ],
  criteria: CRITERIA.map(c=>({ key:c.key, name:c.name, weight:c.w, anchor:c.anchor, rationale:c.why })), weightSum:Wsum,
  ranking:{ all: ranked.map((v,i)=>({ rank:i+1, id:v.id, total:v.total, feasible:v.feasible, meetsR1:v.meetsR1 })),
            feasible: rankedFeas.map((v,i)=>({ rank:i+1, id:v.id, total:v.total, meetsR1:v.meetsR1 })),
            feasibleR1: rankedR1.map((v,i)=>({ rank:i+1, id:v.id, total:v.total })) },
  sensitivity:{ method:'each weight x0.7 and x1.3 one at a time, other weights rescaled proportionally to sum 1', baseWinnerFeasible:rankedFeas[0].id,
    baseWinnerFeasibleR1:rankedR1[0].id, cases:sens, winnerEverChanges: sens.some(s=>s.winnerChanged), physicsHoverPropEta:physSens, physicsStoppedPropDrag:cdaSens },
  reproductionCheck: check, sources: SOURCES, variants: results,
};
writeFileSync(new URL('./tradestudy.json', import.meta.url), JSON.stringify(out, (k,v)=> typeof v==='number' ? +v.toPrecision(6) : v, 1));

// ---------------------------------------------------------------- console summary
const f = (x,d=2)=> (typeof x==='number'? x.toFixed(d):x);
console.log('Reproduction C0: results.json MTOW', f(check.C0_results_json.MTOW,3), 'cruise', f(check.C0_results_json.cruise_min), 'total', check.C0_results_json.total,
  '| this script MTOW', f(check.C0_this_script.MTOW,3), 'cruise', f(check.C0_this_script.cruise_min), 'total', check.C0_this_script.total);
console.log('\nrank id            total feas R1  MTOW  Ph   Pc   L/D  cruise  T/W  cost     reserve  flags');
ranked.forEach((v,i)=>{ const m=v.metrics; console.log(`${String(i+1).padStart(2)}  ${v.id.padEnd(14)} ${f(v.total)}  ${v.feasible?'Y':'n'}   ${v.meetsR1?'Y':'n'}  ${f(m.MTOW_kg)} ${f(m.P_hover_W,0).padStart(4)} ${f(m.P_cruise_W,0).padStart(4)} ${f(m.LD).padStart(5)} ${f(m.cruise_avail_min,1).padStart(5)} ${f(m.TW).padStart(5)} ${f(m.cost_total_usd).padStart(8)} ${f(m.reserve_usd).padStart(8)}  ${v.flags.join('; ')}`); });
console.log('\nFeasible winner:', rankedFeas[0].id, '| feasible + R1 winner:', rankedR1[0].id, '| winner changes under ±30 % weights:', out.sensitivity.winnerEverChanges);
for(const s of sens) if(s.winnerChanged) console.log('  changes:', s.criterion, s.factor, '->', s.winnerFeasible, '/', s.winnerFeasibleR1);
console.log('Hover-prop eta sensitivity (pess/base/best cruise min, total):'); physSens.forEach(x=>console.log(`  ${x.id}: ${f(x.cruise_min.pess,1)}/${f(x.cruise_min.base,1)}/${f(x.cruise_min.best,1)} min; total ${f(x.total.pess)}/${f(x.total.base)}/${f(x.total.best)}; feasible pess ${x.feasible.pess}; feasible winner if pess ${x.feasibleWinnerIfPess} ${x.pessFlags.join('; ')}`));
console.log('Stopped-prop CdA sensitivity (C0):', cdaSens.map(x=>`x${x.CdA_rotor_factor}: L/D ${f(x.LD)} cruise ${f(x.cruise_min,1)} min ${x.pack} $${f(x.total)}`).join(' | '));
