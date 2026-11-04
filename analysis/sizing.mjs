// Concept sizing, geometry, CG and BOM for the lift + cruise VTOL review.
// Run: node analysis/sizing.mjs   -> writes analysis/results.json and prints a summary.
// Every input carries a source tag: R = docs/DESIGN-BASIS.md, LP = docs/research/lift-propulsion.md,
// PB = docs/research/pusher-battery-servo.md, AV = docs/research/avionics-autopilot.md,
// AM = docs/research/airframe-materials.md, EST = engineering estimate (labelled in the review).
// v0.3 (2026-10-13) budget redesign tags: BL = budget-lift.md, BA = budget-avionics.md,
// BE = budget-energy-test.md, BF = budget-airframe.md. v0.2 results kept in results_v0.2_baseline.json.
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { POD as GEOM_POD } from './geometry.mjs';   // pod envelope: the single source shared with cad/params.mjs and analysis/tradestudy.mjs
const require = createRequire(import.meta.url);
const M = require('./model.js');
// aero package (analysis/aero/run_all.py): read, not copied, so the sizing loop closes on the current values
const AEROR = require('./aero/aero_results.json');
const IN = 0.0254;

// ---------- shared inputs ----------
const BASE = {
  rho: 1.225,            // ISA sea level, kg/m^3 (EST: hot day lowers it; slider)
  Vs: 11.75, Vc: 20,     // design stall target 11.75 m/s = R11 limit 12 m/s less a 4 % CL_max margin (docs/research/stall-margin.md, adopted 2026-10-25); cruise 18–22 m/s midpoint
  CLmax: AEROR.CL_max_3D.adopted,   // AERO: aero_results.json CL_max_3D.adopted (critical-section method, trimmed); was 1.2 EST
  span: 2.4,             // R3 (2–3 m); 1.2 m halves fit R4 1.5 m envelope
  e: 0.80,               // EST Oswald factor
  CD0_clean: 0.0266,     // AERO: drag.CD0_clean_airframe 0.059359 - round legs 0.03636 + faired legs 0.003636 (Hoerner ch. VI, Cd_frontal 0.1 EST), on S_ref 0.5728 m2;
                         //       held as a coefficient when S changes (F6 form; the wing profile share scales with S, the fixed-CdA share is then over-counted by the S ratio: conservative)
  CdA_boom: AEROR.drag.CdA_per_boom,   // AERO: aero_results.json drag.CdA_per_boom m^2 (skin friction + clamps)
  etaProp: 0.60, etaMEc: 0.85,   // EST; PB §0 uses the same values
  kCtrl: 1.10,           // EST hover control/gust margin on power
  kCoax: 1.282,          // 1/(1-0.22): 22 % efficiency loss, torque-balanced coaxial, z/D>0.25 — MDPI Aerospace 3(4):32 (2016), abstract, checked 2026-10-13
  tHover: 120, tCruise: 600, // R10
  tTrans: 40,            // EST: 2 transitions x 20 s at hover power
  reserve: 0.20,         // R10
  etaBatt: 0.95,         // EST usable fraction under load
  rhoFoam: 32,           // AM §2a 2 lb/ft^3 XPS = 32 kg/m^3 (BF FOAMULAR NGX density not published: same value assumed, EST)
  tc: 0.15,              // NACA 2415 (EST): 15 % gives ~4.6 mm of foam over the 1 in spar socket at 30 % chord (review finding engineering-10)
  wGlass: 0.06,          // EST packing-tape skin areal mass per side, kg/m^2 (BF: not published; weigh-a-sample M-item)
  rResin: 0.0,           // tape skin: no resin
  sigmaTail: 0.93,       // F11 form for 1 in foam slab + tape: 32*0.0254 + 2*0.06 = 0.93 kg/m^2
  tailAreaRatio: 0.25,   // start value; re-set each pass from tail-volume targets below
  VhTarget: 0.35, VvTarget: 0.030, // EST tail volume coefficients (typical light-aircraft range)
  boomLin: 0.185,        // BF: 6061-T6 1.000 x 0.035 in tube, 185 g/m
  boomClamp: 0.020,      // EST printed PETG clamp
  m_spar: 1.6*0.299 + 0.76*0.259, // BF: 1.000 x 0.058 in socket 299 g/m x 2 x 0.8 m + 0.875 x 0.058 in joiner 259 g/m x 0.76 m (0.30 m engagement per side)
  mFus: 0.60,            // EST foam + PETG + tape pod
  mGear: 0.82*0.299 + 0.08 + 0.118, // BF: 4 x 0.205 m legs from the socket-tube offcut + printed gear clamps and TPU/foam feet 80 g (EST)
                         //     + 4 printed PETG leg fairings 118 g EST (3:1 teardrop, chord 81.6, 170 long, 0.8 mm vase-mode wall: perimeter 2.1 c x 0.8 x 170 = 23.3 cm3 x 1.27 g/cm3 = 29.6 g each; cad/BuildVtol.cs Gear_Fairing)
  mAvionics: 0.25,       // EST FC+GPS+RID+RX+airspeed (weights not all published)
  mPusherSet: 0.165+0.025+0.037, // BL: X4110S 165 g (pusher = lift motor type) + ESC 25 g EST + APC 14x8.5EP 37 g (PB)
  mServos: 5*0.0432,     // BA: EMAX ES3005HV 43.2 g x 5 (2 ailerons, elevator, 2 rudders)
  mWiring: 0.25, mWirePerLift: 0.03, // EST
  mPayload: 0.5,         // R12 allowance
  eSpec: 176,            // BE: Ovonic 6S 6500 144.3 Wh / 0.820 kg
  Vpack: 22.2,           // 6S LiPo nominal (BE)
  m_guess: 7,
};

const X6SE = { // LP A1 Hobbywing XRotor X6 SE 280KV, MFP 22x7, 6S
  name:'Hobbywing X6 SE 280KV + MFP2270', liftD:22*IN, Tmax_g:6058, mMotor:0.373, mEsc:0, mProp:0, mMount:0.026,
  thrustTable:[[2013,193.5],[2449,256.3],[3132,366.6],[4306,597.9],[6058,1051.6]], ratedCont_W:187, CdA_rotor:0.0040 };
const MN5008 = { // LP B1 T-Motor MN5008 KV340 + P17x5.8 + Hobbywing XRotor 40A
  name:'T-Motor MN5008 KV340 + P17x5.8 + XRotor 40A', liftD:17*IN, Tmax_g:3556, mMotor:0.135, mEsc:0.030, mProp:0.030, mMount:0.026,
  thrustTable:[[1224,125],[1697,199],[1936,241],[3556,600]], ratedCont_W:null, CdA_rotor:0.0030 };
// mEsc 30 g, mProp 30 g: EST (not on the pages read)

// ---- v0.3 budget propulsion (BL, checked 2026-10-13). ESC/prop masses EST (not on pages read) ----
const X3515S = { name:'SunnySky X3515S 400KV + SoloGood 45A + APC 16x5.5MR', liftD:16*IN, Tmax_g:3360, mMotor:0.170, mEsc:0.025, mProp:0.030, mMount:0.020,
  thrustTable:[[1250,153.18],[1500,199.8],[2000,293.04],[3360,634.92]], ratedCont_W:null, CdA_rotor:0.0032, station:63.72 };
const X4110S = { name:'SunnySky X4110S 400KV + SoloGood 45A + 17x5.5 prop', liftD:17*IN, Tmax_g:3130, mMotor:0.165, mEsc:0.025, mProp:0.032, mMount:0.020,
  thrustTable:[[1250,135],[1500,180],[2000,291],[3130,615]], ratedCont_W:null, CdA_rotor:AEROR.drag.CdA_per_rotor_unit, station:66.29 };   // CdA_rotor: AERO aero_results.json drag.CdA_per_rotor_unit (stopped motor + mount + prop); was 0.0034 EST
const V3508 = { name:'SunnySky V3508 KV380 + LANRC 35A + Eolo CN15x5.5', liftD:15*IN, Tmax_g:1840, mMotor:0.097, mEsc:0.015, mProp:0.020, mMount:0.015,
  thrustTable:[[700,64],[800,78],[900,95],[1840,297]], ratedCont_W:null, CdA_rotor:0.0028, station:59.12 };

const CONCEPTS = {
  C0: { label:'4-lift twin boom (Alia-style)', nLift:4, nBooms:2, coax:false, motor:X4110S },
  C1: { label:'8-lift, four booms', nLift:8, nBooms:4, coax:false, motor:V3508 },
  C2: { label:'Coaxial X8, twin boom', nLift:8, nBooms:2, coax:true, motor:V3508 },
  C3: { label:'4-lift, X3515S 16 in (alternative motor)', nLift:4, nBooms:2, coax:false, motor:X3515S },
};
const PUSHER = X4110S;
const POD_NP_SHIFT = AEROR.neutral_point.pod_shift_pct_MAC / 100;   // AERO: AVL neutral point with pod vs without (aero_results.json neutral_point)
// pod and pusher stations (x from wing LE, + forward); nose station, length and radius from analysis/geometry.mjs (also used by cad/params.mjs)
const POD = { noseX: GEOM_POD.noseX, L: GEOM_POD.L, R: GEOM_POD.R, motorL: 0.032, pushD: 14*0.0254 };
POD.pushX = POD.noseX - POD.L - POD.motorL - 0.006;   // pusher prop plane   // pusher = X4110S on every concept (commonality; one spare covers lift and pusher)
const CRUISE_MARGIN_MIN = 11.5; // R10 10 min x 1.15 design margin on unmeasured drag/efficiency (EST), on top of the 20 % energy reserve

const PACKS = [ // BE §1 (price per pack; 2-packs halved). LiPo C ratings not credible: 60 A continuous assumed (EST, M-item)
  {id:'Ovonic 6S 6500 100C (2-pack)', chem:'LiPo', Wh:144.3, kg:0.820, usd:69.495, contA:60, pair:true},
  {id:'Ovonic Roam 6S 6500 150C', chem:'LiPo', Wh:144.3, kg:0.777, usd:71.99, contA:60},
  {id:'HOOVO 6S 8000 100C (2-pack)', chem:'LiPo', Wh:177.6, kg:0.9863, usd:99.995, contA:60, pair:true},
  {id:'Zeee 6S 9000 100C (2-pack)', chem:'LiPo', Wh:199.8, kg:1.136, usd:121.045, contA:60, pair:true},
  {id:'iFlight Fullsend E 6S 8000 60C', chem:'LiPo', Wh:177.6, kg:0.990, usd:122.99, contA:60},
  {id:'Zeee 6S 10000 120C (2-pack)', chem:'LiPo', Wh:222.0, kg:1.150, usd:137.695, contA:60, pair:true},
];

// ---------- geometry (x forward from wing LE, y right, z up; metres) ----------
function geometry(c, r, chord){
  const D = c.motor.liftD, clr = 0.05, fusHalf = POD.R, pushR = POD.pushD/2;
  const xLEtoCG = -0.28*chord;                     // CG target 28 % MAC (EST, gives ~10–15 % SM; checked below)
  const xRear = -(chord + D/2 + clr);              // rear rotor centre behind TE
  const xFront = 2*xLEtoCG - xRear;                // thrust centroid on the CG
  const lh_tailLE = xRear - D/2 - clr;             // tail LE clears rear disc
  const S = r.S;
  let booms = [];
  // lift discs must clear the pusher disc laterally (review finding cad_sim-1): inboard disc edge >= pusher radius + 40 mm
  const yIn = Math.max(D/2 + fusHalf + clr, D/2 + pushR + 0.04);
  // tail sized from volume coefficients; moment arm from geometry (H-tail chord iterated)
  const hSpan0 = 2*yIn; let hC0 = 0.2, Sh, Sv, lh0;
  for(let k=0;k<6;k++){ lh0 = (-0.25*chord) - (lh_tailLE - 0.25*hC0); Sh = BASE.VhTarget*S*chord/lh0; hC0 = Sh/hSpan0; }
  Sv = BASE.VvTarget*S*BASE.span/lh0;
  if(c.nBooms===2){
    booms.push({y:-yIn, x0:lh_tailLE - 0.22, x1:xFront + 0.05, tail:true, rotors:[{x:xFront,coax:c.coax},{x:xRear,coax:c.coax}]});
    booms.push({y: yIn, x0:lh_tailLE - 0.22, x1:xFront + 0.05, tail:true, rotors:[{x:xFront,coax:c.coax},{x:xRear,coax:c.coax}]});
  } else {
    const yOut = yIn + D + clr;
    for(const y of [-yIn, yIn]) booms.push({y, x0:lh_tailLE - 0.22, x1:xFront+0.05, tail:true, rotors:[{x:xFront},{x:xRear}]});
    for(const y of [-yOut, yOut]) booms.push({y, x0:xRear - 0.05, x1:xFront+0.05, tail:false, rotors:[{x:xFront},{x:xRear}]});
  }
  // tail: H-tail spans between the tail-carrying booms
  const hSpan = 2*yIn, hC = Sh/hSpan, vH = Math.sqrt(Sv/2/0.8), vC = Sv/2/vH;
  const xTailAC = lh_tailLE - 0.25*hC;
  const lh = (-0.25*chord) - xTailAC;
  const Vh = Sh*lh/(S*chord), Vv = Sv*lh/(S*BASE.span);
  // neutral point (Helmbold lift slope, classical downwash)
  const aw = 2*Math.PI*r.AR/(2+Math.sqrt(r.AR*r.AR+4));
  const ARt = hSpan*hSpan/Sh, at = 2*Math.PI*ARt/(2+Math.sqrt(ARt*ARt+4));
  const deda = 2*aw/(Math.PI*r.AR), etaT = 0.9;   // etaT EST
  const hn_nopod = 0.25 + etaT*Vh*(at/aw)*(1-deda);   // wing + tail only (what the VLM in analysis/vlm.mjs reproduces)
  const hn = hn_nopod + POD_NP_SHIFT;                   // pod destabilising shift, AVL with vs without pod (aero_results.json neutral_point.pod_shift_pct_MAC)
  const SM = hn - 0.28;
  // boom cut list (front segment = front rotor to the rear rotor centre; rear stub = rear rotor centre to the tail): the two tubes butt at xRear
  // inside the rear motor mount over a printed splice plug (hardware-spec.md C2/J04); no overlap
  const segs = [];
  booms.forEach(b=>{ if(b.tail){ segs.push(+(b.x1-xRear).toFixed(4)); segs.push(+(xRear-b.x0).toFixed(4)); } else segs.push(+(b.x1-b.x0).toFixed(4)); });
  const boomTotal = booms.reduce((a,b)=>a+(b.x1-b.x0),0);
  return { D, xFront, xRear, xLEtoCG, booms, segs, boomTotal, hSpan, hC, vH, vC, Sh, Sv, lh, Vh, Vv, aw, at, deda, hn, hn_nopod, SM, yIn,
           longestPiece: Math.max(...segs, BASE.span/2) };
}

// ---------- sizing per concept ----------
function run(cKey, overrides={}){
  const c = CONCEPTS[cKey];
  let p = { ...BASE, ...c.motor, nLift:c.nLift, nBooms:c.nBooms, coax:c.coax, boomTotalLen: c.nBooms===2?3.4:5.0, ...overrides };
  // boom length depends on chord -> iterate twice with geometry
  let r, g;
  for(let k=0;k<6;k++){ r = M.size(p); g = geometry(c, r, r.chord); p.boomTotalLen = g.boomTotal; p.tailAreaRatio = (g.Sh+g.Sv)/r.S; }
  // pick the cheapest real pack that meets energy and hover current; re-close with its fixed mass
  let pick = null, picked = null;
  for(const pk of [...PACKS].sort((a,b)=>a.usd-b.usd)){
    const pp = {...p, mBattFixed:pk.kg, EBattFixed:pk.Wh, Vpack: pk.chem==='LiPo'?22.2:21.6};
    const rr = M.size(pp);
    if(rr.endurance_ok && rr.t_cruise_avail_min >= CRUISE_MARGIN_MIN && rr.I_hover <= pk.contA){ pick = pk; picked = rr; p = pp; break; }
  }
  for(let k=0;k<4;k++){ g = geometry(c, picked, picked.chord); p.boomTotalLen=g.boomTotal; p.tailAreaRatio=(g.Sh+g.Sv)/picked.S; picked = M.size(p); }
  g = geometry(c, picked, picked.chord);
  // transition current at a loaded 3.5 V/cell (21.0 V): hover power + pusher at 2 x cruise power (EST accel case)
  picked.P_trans = picked.P_hover + 2*picked.P_cruise; picked.I_trans = picked.P_trans/21.0; picked.I_hover_loaded = picked.P_hover/21.0;
  // design-output MTOW re-run with the final geometry inputs and a continuous battery (what the page chain reproduces)
  const pc = {...p}; delete pc.mBattFixed; delete pc.EBattFixed; pc.Vpack = 22.2;
  const design2 = M.size(pc);
  return { key:cKey, label:c.label, motor:c.motor.name, params:p, design:design2, pick, sized:picked, geo:g };
}

// ---------- BOM ----------
function bom(res, lean=false){
  // v0.3 budget BOM. R6: everything physical + tax + shipping <= $2,000; fees (FAA/AMA) outside the cap.
  // reserve = 2000 - (goods x 1.1025 + shipping). lean = no airspeed sensor, minimum hardware kit, no spare servo.
  const c = CONCEPTS[res.key], L = [];
  const add = (cat, item, qty, unit, src, note='') => L.push({cat, item, qty, unit, ext:+(qty*unit).toFixed(2), src, note});
  const m = c.motor;
  if(m===X3515S){
    add('Lift propulsion','SunnySky X3515S 400KV',4,44.99,'BL A2 sunnyskyusa.com');
    add('Lift propulsion','APC 16x5.5MR prop',4,8.73,'BL A2','adapter rings not included (—)');
  } else if(m===X4110S){
    add('Lift propulsion','SunnySky X4110S 400KV',4,46.99,'BL A3 sunnyskyusa.com');
    add('Lift propulsion','JeeFly 1755 carbon prop (pair)',2,18.60,'BL props amazon.com/dp/B0FJ21V736','$4.99 delivery, likely CN');
  } else {
    add('Lift propulsion','SunnySky V3508 KV380',8,42.99,'BL B3 sunnyskyusa.com');
    add('Lift propulsion','LANRC BLHeli_S 35A ESC (4-pack)',3,28.50,'BL ESCs amazon.com/dp/B0D2HQPNG9','8 lift + 4 spare');
    add('Lift propulsion','Eolo CN15x5.5 prop (pair)',4,17.99,'BL B3');
  }
  add('Lift propulsion', m===V3508?'SoloGood 45A ESC (4-pack), pusher + spares':'SoloGood 45A ESC (4-pack)', m===V3508?1:2, 39.99,'BL ESCs amazon.com', m===V3508?'':'4 lift + pusher + 3 spare; low stock: fallback LANRC 35A');
  add('Cruise propulsion','SunnySky X4110S 400KV (pusher)',1,46.99,'BL A3', m===X4110S?'same motor as lift: one spare covers both':'');
  add('Cruise propulsion','APC 14x8.5EP pusher prop',3,6.79,'PB 1c');
  add('Controls','EMAX ES3005HV servo',5,19.99,'BA §6 shop.emax-usa.com','2 ailerons, elevator, 2 rudders');
  if(c.coax) add('Avionics','Holybro Kakute H743-Wing (OctaQuad needs H7 build)',1,105.00,'BA §2 holybro.com','ships CN, duty —');
  else add('Avionics','CoreWing F405 Wing APP V2 (12 out, 90 A sensor)',1,67.26,'BA §2 readymaderc.com','ArduPilot target beta-only (4.7.2-beta); fallback Matek F405-WMO $69.99');
  add('Avionics','HGLRC M100-5883 GPS + compass',1,20.49,'BA §2 racedayquads.com');
  add('Avionics','NewBeeDrone BeeID v1.1 Remote ID (FAA DoC RID000001995)',1,36.99,'BA §4 racedayquads.com');
  add('Avionics','RadioMaster Pocket Crush ELRS',1,64.99,'BA §5 radiomasterrc.com');
  add('Avionics','RadioMaster RP3 V2 ELRS receiver',1,19.99,'BA §5');
  if(!lean) add('Avionics','Holybro MS5525DSO + PT40 airspeed',1,59.99,'BA §3 holybro.com','ships CN');
  const pk = res.pick;
  if(pk.pair) add('Energy', pk.id.replace(' (2-pack)','')+' — 2-pack listing (2 packs)', 1, +(2*pk.usd).toFixed(2), 'BE §1 amazon.com', 'second pack per R7; EC5 leads: re-terminate to XT90S');
  else add('Energy', pk.id+' flight pack', 2, pk.usd, 'BE §1', 'second pack per R7');
  add('Energy','HTRC C150 charger (150 W, ~6 A on 6S)',1,56.99,'BE §2 amazon.com/dp/B0H4QLJYHY');
  const tubes = Math.ceil(res.geo.segs.reduce((a,b)=>a+b,0)/1.80);
  add('Airframe','6061-T6 tube 1.000 x 0.035 in x 72 in (booms)',tubes,26.20,'BF §1 onlinemetals.com', 'cut list '+res.geo.segs.join(' + ')+' m');
  add('Airframe','6061-T6 tube 1.000 x 0.058 in x 96 in (spar sockets + gear legs)',1,53.97,'BF §1','2 x 0.8 m sockets + 4 x 0.205 m legs + kerf');
  add('Airframe','6061-T6 tube 0.875 x 0.058 in x 36 in (joiner)',1,18.45,'BF §1','0.76 m joiner, 0.30 m engagement per side; 0.23 mm clearance');
  add('Airframe','FOAMULAR NGX F-250 2 in x 4 x 8 ft (wing cores)',1,59.97,'BF §2 homedepot.com');
  add('Airframe','FOAMULAR 150 1 in x 4 x 8 ft (tail, pod)',1,30.97,'BF §2 homedepot.com');
  add('Airframe','Scotch heavy-duty packing tape, 6 rolls (skin)',1,19.98,'BF §2 amazon.com');
  // hardware kit itemised (HS = docs/research/hardware-spec.md §7, 2026-10-21): the Mywish screw kit and generic inserts are replaced by the
  // Bolt Depot order, ruthex inserts and Loctite 242; the other kit items are kept at their 2026-10-13 prices (budget-airframe.md §3a)
  add('Airframe','FLY RC Amass XT90S anti-spark, 5 pairs (B0893CGLP7)',1,13.99,'BF §3a item 1 amazon.com');
  add('Airframe','10 AWG silicone wire 5 ft red + 5 ft black (B0D968WN4W)',1,8.98,'BF §3a item 2 amazon.com');
  add('Airframe','BNTECHGO 12 AWG silicone wire 10+10 ft (B01ABOPMEI)',1,14.98,'BF §3a item 3 amazon.com');
  add('Airframe','300 mm servo extension leads, 10 (B0FYCJLY1V)',1,6.99,'BF §3a item 4 amazon.com');
  add('Airframe','Nylon control horns 12 sets, M2x14 screws (B0B58ZSC8J)',1,8.98,'BF §3a item 7 amazon.com','HS J17');
  add('Airframe','Du-Bro 230 Kwik-Link 2-56 pushrods, 5 (B0006O8TAI)',1,12.48,'BF §3a item 8 amazon.com');
  // v0.4 (2026-10-21): dropped to hold the R7 crash reserve >= $100 after the hardware itemisation and the larger wing; cash in reserve covers any crash part, a pre-bought spare covers one
  // add('Airframe','Andibro hinge tape 1 in x 10 yd, 2 rolls (B0H7J994N4)',1,6.69,...)  -> hinges are the packing-tape skin (HS §7)
  add('Airframe','Heat-shrink kit 2:1, 900 pcs (B0BG6V4HV4)',1,6.99,'BF §3a item 10 amazon.com');
  add('Airframe','Zip ties 4/6/8/12 in, 200 (B0CSXGZXM8)',1,3.99,'BF §3a item 11 amazon.com');
  add('Airframe','ZORZA UBEC 5 V 5 A, 2 pcs (B0CQ1R55BV)',1,9.99,'BF §3a item 12 amazon.com');
  add('Airframe','Gorilla 5-min epoxy 0.85 oz (B001Z3C3AG)',1,5.97,'BF §3a item 13 amazon.com');
  add('Airframe','ruthex RX-M3x5.7 heat-set inserts, 100 (B08BCRZZS3)',1,9.99,'HS §2c amazon.com','replaces generic M3 inserts');
  add('Airframe','Loctite 242 threadlocker 6 ml (B000I1RSNS)',1,7.03,'HS §2d amazon.com','metal-to-metal threads only');
  add('Airframe','A2 metric fasteners per HS §6 (14 lines: M2/M3/M5 screws, nylocks, nuts, washers)',1,22.04,'HS §6 boltdepot.com','replaces Mywish kit B0CQWYFTXC');
  // build-manual gap G2 (docs/build/BUILD-MANUAL.md §8): harness needs ~11.8 m of servo/signal lead, the kit pack gives 6 m -> 2 more packs
  add('Airframe','300 mm servo extension leads, 10 (B0FYCJLY1V), 2 more packs for the 11.8 m harness',2,6.99,'BF §3a item 4 amazon.com','BUILD-MANUAL G2: price of 2026-10-13');
  add('Airframe','ELEGOO PETG 1 kg (clamps, pod frames, gear clamps)',2,12.99,'BF §5');
  add('Airframe','Polymaker PA6-CF20 500 g (motor mounts: HDT 173 °C)',1,39.99,'AM §2d','PETG too close to motor heat (sec. 12)');
  add('Airframe','BNTECHGO 12 AWG silicone wire, 2nd pack (ESC feeds)',1,14.98,'BF §3a item 3 amazon.com');
  add('Airframe','14 AWG silicone wire (pusher / BEC feeds)',1,9.99,'BF §3b amazon.com');
  add('Airframe','XT60H connectors 12 pairs (boom harness disconnects)',1,6.99,'BF §3b amazon.com');
  add('Airframe','300 mm servo extension leads, 2nd pack',1,6.99,'BF §3a item 4 amazon.com');
  add('Airframe','Foam-safe glue 4 oz',1,12.99,'BF §3b amazon.com');
  add('Airframe','ShareGoo LiPo battery straps (10)',1,7.99,'BF §3b amazon.com');
  add('Airframe','Hot-wire bow, nichrome + bench supply (wing cores)',1,40.00,'EST allowance','not priced; borrow if a makerspace has one');
  add('Test & safety','Tenergy LiPo bag',1,8.99,'BE §3');
  add('Test & safety','Harbor Freight 0.50 cal ammo can (pack storage)',1,19.99,'BE §3');
  add('Test & safety','Watt meter 150 A / 60 V',1,12.99,'BE §3');
  add('Test & safety','IR thermometer',1,8.98,'BE §3');
  add('Test & safety','20 kg load cell + HX711 kit (thrust stand)',1,8.98,'BE §4');
  add('Test & safety','Arduino Nano clone (thrust stand)',1,8.99,'BE §4');
  add('Spares', m===V3508?'V3508 spare motor':m===X4110S?'X4110S spare motor (lift or pusher)':'X3515S spare motor',1, m===V3508?42.99:m===X4110S?46.99:44.99, 'BL');
  add('Spares', m===V3508?'Eolo CN15x5.5 spare pair':m===X4110S?'JeeFly 1755 spare pair (amazon.com)':'APC 16x5.5MR spare props', m===X3515S?2:1, m===V3508?17.99:m===X4110S?18.60:8.73, 'BL');
  // add('Spares','EMAX ES3005HV spare servo',1,19.99,'BA §6');  -> v0.4: reserve cash instead (see above)
  // add('Spares','Du-Bro 230 pushrod 5-pack (spares)',1,12.48,...)  -> v0.4: reserve cash instead (see above)
  const goods = L.reduce((a,l)=>a+l.ext,0);
  const shipping = 110;                  // EST allowance: Amazon free; JeeFly $4.99; OnlineMetals UPS, SunnySky USA, Holybro (CN) shipping and duty not shown; +$10 EST Bolt Depot (HS §7, shown only at checkout)
  const tax = 0.1025*goods;              // AV §5 / BF: Berkeley 10.25 % (CDTFA, 2026-10-01)
  const total = goods + tax + shipping;  // committed spend inside the R6 cap
  const crash = 2000 - total;            // R7: reserve = what remains under the cap
  const fees = [{item:'FAA registration', usd:5.00, src:'AV §5'}, {item:'AMA Full membership (1 pilot; $2.5M liability covers UC $1M rule)', usd:89.00, src:'AV §5'}];
  return { lines:L, goods:+goods.toFixed(2), shipping, tax:+tax.toFixed(2), crash:+crash.toFixed(2), total:+total.toFixed(2), tubes25:tubes, fees, cap:2000 };
}

const out = { generated:'2026-10-25', base:BASE, cruiseMarginMin:CRUISE_MARGIN_MIN, packs:PACKS, concepts:{} };
for(const k of Object.keys(CONCEPTS)){
  const res = run(k);
  res.bom = bom(res); res.bomLean = bom(res, true);
  out.concepts[k] = res;
}
// MTOW-vs-pack sweep for C0 (design-output chart)
out.sweepC0 = PACKS.map(pk=>{ const c=out.concepts.C0; const r=M.size({...c.params, mBattFixed:pk.kg, EBattFixed:pk.Wh});
  return {pack:pk.id, Wh:pk.Wh, usd:pk.usd, m:+r.m.toFixed(3), cruise_min:+r.t_cruise_avail_min.toFixed(2), ok:r.endurance_ok}; });
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, (k,v)=> typeof v==='number'? +v.toPrecision(8): v, 1));

for(const k of Object.keys(out.concepts)){
  const c = out.concepts[k], s = c.sized, d = c.design, g = c.geo;
  console.log(`\n== ${k} ${c.label} | ${c.motor}`);
  console.log(` design MTOW (continuous batt) ${d.m.toFixed(2)} kg, Epack_req ${d.Epack_req_Wh.toFixed(0)} Wh, m_batt ${d.m_batt.toFixed(2)}`);
  console.log(` pick ${c.pick.id}: MTOW ${s.m.toFixed(2)} kg  S ${s.S.toFixed(3)} m2  AR ${s.AR.toFixed(2)} c ${s.chord.toFixed(3)}  L/D ${s.LD.toFixed(2)}`);
  console.log(` P_hover ${s.P_hover.toFixed(0)} W (${s.P_hover_per_motor.toFixed(0)} W/motor, FMeta ${s.FMeta.toFixed(3)}), I_hover ${s.I_hover.toFixed(1)} A, P_cruise ${s.P_cruise.toFixed(0)} W, I_cr ${s.I_cruise.toFixed(1)} A`);
  console.log(` E_mission ${s.E_Wh.toFixed(0)} Wh, cruise avail ${s.t_cruise_avail_min.toFixed(1)} min, T/W ${s.TW.toFixed(2)}, T/W motor-out ${s.TW_motorOut.toFixed(2)}`);
  console.log(` masses: lift ${s.m_lift.toFixed(2)} booms ${s.m_booms.toFixed(2)} wing ${s.m_wing.toFixed(2)} tail ${s.m_tail.toFixed(2)} fixed ${s.m_fixed.toFixed(2)} batt ${s.m_batt.toFixed(2)}`);
  console.log(` geo: xF ${g.xFront.toFixed(3)} xR ${g.xRear.toFixed(3)} boomTot ${g.boomTotal.toFixed(2)} segs ${g.segs} Vh ${g.Vh.toFixed(2)} Vv ${g.Vv.toFixed(3)} hn ${g.hn.toFixed(3)} SM ${g.SM.toFixed(3)} longest ${g.longestPiece.toFixed(2)}`);
  console.log(` BOM goods ${c.bom.goods} ship ${c.bom.shipping} tax ${c.bom.tax} crash ${c.bom.crash} TOTAL ${c.bom.total} | lean TOTAL ${c.bomLean.total} (tubes25 ${c.bom.tubes25})`);
}
console.log('\nsweep C0', out.sweepC0);

// ---------- structures (hand calcs, chosen concept C0 and C1 for comparison) ----------
function tubeI(Do, Di){ return Math.PI/64*(Do**4-Di**4); }
const TUBE = { joiner:{name:'6061-T6 0.875 x 0.058 in', Do:0.875*IN, Di:(0.875-2*0.058)*IN}, spar:{name:'6061-T6 1.000 x 0.058 in', Do:1.000*IN, Di:(1.000-2*0.058)*IN},
               boom:{name:'6061-T6 1.000 x 0.035 in', Do:1.000*IN, Di:(1.000-2*0.035)*IN} };
const E_DESIGN = 69.0e9, SIG_DESIGN = 275e6; // SOLIDWORKS material library 6061-T6 (SS): E 69 GPa, yield 275 MPa (used in cad/Sim.cs)
function structures(res){
  const s = res.sized, g = res.geo, p = res.params;
  const nLimit = 3.0, FS = 1.5, nUlt = nLimit*FS;            // EST limit load factor; 1.5 factor of safety
  const W = s.m*M.G, b = BASE.span;
  const Mroot = nUlt*W*b/(3*Math.PI);                         // elliptic lift, half-wing root moment
  const Ij = tubeI(TUBE.joiner.Do, TUBE.joiner.Di), cj = TUBE.joiner.Do/2;
  const sigJ = Mroot*cj/Ij;
  const Is = tubeI(TUBE.spar.Do, TUBE.spar.Di);
  const sigS = Mroot*TUBE.spar.Do/2/Is;
  // hover root moment: half the thrust at boom station, gust/control factor 2 (EST)
  const Mhover = 2.0*(W/2)*g.yIn;
  // boom cantilever: front rotor at max thrust, root at spar (0.25 c behind LE)
  const Lb = g.xFront - (-0.25*s.chord);
  const Tmax = p.Tmax_g/1000*M.G*(p.coax?2/p.kCoax:1);
  const Ib = tubeI(TUBE.boom.Do, TUBE.boom.Di), cb = TUBE.boom.Do/2, Mb = Tmax*Lb, sigB = Mb*cb/Ib;
  const defl_max = Tmax*Lb**3/(3*E_DESIGN*Ib), defl_hover = (s.Tunit_N)*Lb**3/(3*E_DESIGN*Ib);
  const mTip = p.mMotor+p.mEsc+p.mProp+p.mMount, k = 3*E_DESIGN*Ib/Lb**3;
  const mBoomArm = p.boomLin*Lb, mEff = mTip + 0.236*mBoomArm;          // Rayleigh: cantilever adds 0.236 of its own mass at the tip
  const fn = Math.sqrt(k/mEff)/(2*Math.PI);   // rigid root; clamp compliance lowers it (tap test)
  // landing: energy method n = 1 + h/s
  const h = 0.30, strokes = [0.02,0.05,0.10,0.15].map(st=>({stroke:st, n:1+h/st, nSpring:2*(1+h/st)}));   // damped (constant force) and linear-spring bounds
  // boom-root torsion: one front motor at full thrust, rear at idle -> moment into the clamps and the spar socket
  const Mclamp = Tmax*Lb, Jsock = 2*Is, tauSock = Mclamp*(TUBE.spar.Do/2)/Jsock;
  const engage = 0.76/2 - 0.08;   // joiner half-length minus pod half-width
  return { nLimit, FS, nUlt, Mroot, sigJ, MS_J: SIG_DESIGN/sigJ, sigS, Mhover, Lb, Tmax, Mb, sigB, MS_B: SIG_DESIGN/sigB,
           defl_max, defl_hover, fn, mTip, mEff, Ij_mm4:Ij*1e12, Is_mm4:Is*1e12, Ib_mm4:Ib*1e12, h, strokes, Mclamp, tauSock, engage, engageD: engage/TUBE.joiner.Do, E_DESIGN, SIG_DESIGN };
}
// ---------- CG build-up for each concept (x from wing LE, + forward) ----------
function cg(res){
  const s=res.sized, g=res.geo, p=res.params, c=s.chord, items=[];
  const add=(name,m,x,src)=>items.push({name,m:+m.toFixed(3),x:+x.toFixed(3),src});
  const nPer = p.nLift/2;
  add('Lift units, front', nPer*(p.mMotor+p.mEsc+p.mProp+p.mMount), g.xFront,'LP');
  add('Lift units, rear', nPer*(p.mMotor+p.mEsc+p.mProp+p.mMount), g.xRear,'LP');
  const bx = g.booms.reduce((a,b)=>a+(b.x1-b.x0)*(b.x0+b.x1)/2,0)/g.boomTotal;
  add('Booms + clamps', s.m_booms, bx,'AM');
  add('Wing (foam/glass + spar)', s.m_wing, -0.40*c,'F11; centroid 40 % c EST');
  add('Tail', s.m_tail, g.xRear - g.D/2 - 0.05 - 0.4*g.hC,'geometry');
  add('Fuselage pod', p.mFus, POD.noseX - POD.L/2,'EST; centroid at mid-pod');
  add('Landing gear', p.mGear, -0.25*c,'EST');
  add('Avionics', p.mAvionics, 0.25,'EST');
  add('Pusher set', p.mPusherSet, POD.pushX + 0.02,'BL; at pod tail (same station as CAD)');
  // 5 servos (BA §6, same count as mServos and the BOM): 2 aileron servos in the wing at 55 % c, elevator + 2 rudder servos on the stabiliser
  // top 26 mm behind its LE (cad/params.mjs stations); mass-weighted mean station
  const xTailServo = g.xRear - g.D/2 - 0.05 - 0.026;
  add('Servos (5)', p.mServos, (2*(-0.55*c) + 3*xTailServo)/5,'BA; 2 wing (-0.55 c) + 3 tail (cad/params.mjs), mass-weighted mean');
  add('Wiring', p.mWiring + p.nLift*p.mWirePerLift, -0.10,'EST');
  const target = g.xLEtoCG;
  const mNoBatt = items.reduce((a,i)=>a+i.m,0), momNoBatt = items.reduce((a,i)=>a+i.m*i.x,0);
  const mb = s.m_batt, mp = p.mPayload;
  // battery placed so that CG at target with payload allowance at the CG
  const xPay = 0.15; // EST forward payload bay
  const xb = (target*(mNoBatt+mb+mp) - momNoBatt - mp*xPay)/mb;
  add('Battery (placed for CG)', mb, xb,'PB');
  add('Payload allowance (bay)', mp, xPay,'R12; bay x EST');
  const cgNoPayload = (momNoBatt + mb*xb)/(mNoBatt+mb);
  const thrustCentroid = (g.xFront+g.xRear)/2;
  const toPct = x => -x/c*100;
  const cgBattFwd = (momNoBatt + mb*(xb+0.03) + mp*xPay)/(mNoBatt+mb+mp), cgBattAft=(momNoBatt + mb*(xb-0.03) + mp*xPay)/(mNoBatt+mb+mp);
  return { items, target, xb, cgBattFwd, cgBattAft, pctFwd:toPct(cgBattFwd), pctAft:toPct(cgBattAft), cgNoPayload, thrustCentroid, pct:{ target:toPct(target), noPayload:toPct(cgNoPayload), np:g.hn*100, thrust:toPct(thrustCentroid) },
           SM_noPayload: g.hn - (-cgNoPayload/c) };
}
for(const k of Object.keys(out.concepts)){ out.concepts[k].struct = structures(out.concepts[k]); out.concepts[k].cg = cg(out.concepts[k]); }
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, (k,v)=> typeof v==='number'? +v.toPrecision(8): v, 1));
for(const k of Object.keys(out.concepts)){ const st=out.concepts[k].struct, c=out.concepts[k].cg;
  console.log(`\n${k} struct: Mroot ${st.Mroot.toFixed(1)} Nm sigJ ${(st.sigJ/1e6).toFixed(0)} MPa MS ${st.MS_J.toFixed(2)} | sigSpar ${(st.sigS/1e6).toFixed(0)} | Mhover ${st.Mhover.toFixed(1)} | boom L ${st.Lb.toFixed(3)} M ${st.Mb.toFixed(1)} sig ${(st.sigB/1e6).toFixed(0)} MS ${st.MS_B.toFixed(1)} defl ${ (st.defl_max*1000).toFixed(1)}/${(st.defl_hover*1000).toFixed(1)} mm fn ${st.fn.toFixed(1)} Hz`);
  console.log(` cg: battery x ${c.xb.toFixed(3)} cgNoPayload ${c.pct.noPayload.toFixed(1)}% target ${c.pct.target.toFixed(1)}% NP ${c.pct.np.toFixed(1)}% thrust ${c.pct.thrust.toFixed(1)}% SMnoPay ${(c.SM_noPayload*100).toFixed(1)}%`); }
