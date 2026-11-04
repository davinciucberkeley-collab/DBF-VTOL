// Derives SolidWorks build parameters for concept C0 from analysis/results.json and cad/hardware.json.
// SolidWorks frame: X forward (wing LE at X=0), Y up, Z right.  Review frame: x fwd, y right, z up.
// Writes cad/params.txt read by cad/BuildVtol.cs, cad/Drawings.cs and review/mesh.mjs:
//   key=value              geometry parameters (metres unless stated)
//   fast=ID|Name|Type|d|L|dk|k|af|material|description        fastener part definitions (from cad/hardware.json, mm)
//   sched=ID|standard|size|qty|order|joints|torque|threadlocker|vendor|partno|unit   fastener schedule rows
//   comp=Part|X|Y|Z|r11,r12,r13,r21,r22,r23,r31,r32,r33       assembly placement (rotation rows = images of the part axes)
//   xcomp=Part|X|Y|Z|matrix                                   same component in the exploded assembly (VTOL_Exploded.SLDASM)
//   foil=x,y;x,y;...       the CAD wing section (NACA 24xx at tc, teCad, 61 points, chord scale, model X = -x c), reference only
//   foilWing=NACA 2415|m=..|p=..   foilTail=NACA 0009|m=0|p=0|t=..   foilTE=cad=..|aero=..   podProfile=..|noseX=..|noseA=..|parallelTo=..
//                          geometry definitions from analysis/geometry.mjs (the single source), as name=value records; read by
//                          analysis/geom.py (Python) and cad/Shared.cs (C#). Record values are text: review/build.mjs skips them.
// v0.4 (CAD rev D) + hardware spec 2026-10-21 (docs/research/hardware-spec.md, HS): every joint carries its real fasteners.
import { readFileSync, writeFileSync } from 'fs';
import { FOIL, TAIL_FOIL, POD, nacaName, nacaYt, nacaYc, nacaSection } from '../analysis/geometry.mjs';
const R = JSON.parse(readFileSync(new URL('../analysis/results.json', import.meta.url)));
const HW = JSON.parse(readFileSync(new URL('./hardware.json', import.meta.url)));
const c = R.concepts.C0, s = c.sized, g = c.geo, IN = 0.0254;
const P = {}, comps = [];
const chord = s.chord, half = R.base.span/2, fusR = POD.R, fusL = POD.L;
// NACA 24xx, t/c from the sizing (v0.3.1: 0.15); camber and TE coefficient from analysis/geometry.mjs
const m = FOIL.m, pp = FOIL.p, t = R.base.tc, N = 30, te = FOIL.teCad;
// one spline TE(upper) -> LE -> TE(lower), model X = -x c
const foil = nacaSection(m, pp, t, N, te).map(([x, y]) => [-x*chord, y*chord]);
P.foil = foil.map(p => p.map(v => v.toFixed(6)).join(',')).join(';');
P.foilWing = `${nacaName(m, pp, t)}|m=${m}|p=${pp}`;                                   // t = key tc
P.foilTail = `${nacaName(TAIL_FOIL.m, TAIL_FOIL.p, TAIL_FOIL.t)}|m=${TAIL_FOIL.m}|p=${TAIL_FOIL.p}|t=${TAIL_FOIL.t}`;
P.foilTE = `cad=${FOIL.teCad}|aero=${FOIL.teAero}`;
P.podProfile = `ellipse-parallel-smoothstep|noseX=${POD.noseX}|noseA=${POD.noseA}|parallelTo=${POD.parallelTo}`;   // L, R, tail radius = keys fusL, fusR, tailR
P.chord = chord; P.panelLen = half - fusR;
const xSp = 0.30;                                                    // spar at max thickness (~30 % c) for foam cover
const xs = -xSp*chord, ys = nacaYc(xSp, m, pp)*chord;               // on the camber line
// surface heights of the wing section at chord fraction x (for seating clamps, hardpoints and servos)
const ytAt = x => nacaYt(x, t, te);
const ycAt = x => nacaYc(x, m, pp);
const yLower = x => (ycAt(x) - ytAt(x))*chord, yUpper = x => (ycAt(x) + ytAt(x))*chord;
// NACA 0009 half-thickness (tail surfaces) at chord fraction x for chord cc
const yt09 = (x, cc) => nacaYt(x, TAIL_FOIL.t, te)*cc;
P.tc = t; P.sparXfrac = xSp;
// v0.3 tubes: 6061-T6 (docs/research/budget-airframe.md §1)
// C2 (HS §3): front boom and rear stub butt at the rear motor centre; no overlap
const segF = g.booms[0].x1 - g.xRear, segR = g.xRear - g.booms[0].x0;
Object.assign(P, { sparX: xs, sparY: ys, sparOD: 1.000*IN, sparID: (1.000-2*0.058)*IN, sparLen: 0.8,
  joinOD: 0.875*IN, joinID: (0.875-2*0.058)*IN, joinLen: 0.76,   // 0.30 m engagement per side (review finding citations-2)
  boomOD: 1.000*IN, boomID: (1.000-2*0.035)*IN,
  segF, segR, fusL, fusR, tailR: POD.tailR,
  motorD: 0.048, motorH: 0.032, liftProp: g.D, propW: 0.035, propT: 0.008,   // X4110S envelope EST (41 mm stator class); prop from sizing
  pushMotorD: 0.048, pushMotorL: 0.032, pushProp: 14*IN,
  hC: g.hC, hSpan: g.hSpan + 0.050,   // stabiliser spans boom centre to centre plus 2 x 25 mm: covers the 46 mm fin-shoe flanges (HS J09) with 2 mm margin
  vH: g.vH, vC: g.vC,
  elevSpan: 2*g.yIn - 0.0216,                                 // elevator between the fins: 10.8 mm from each boom centre = fin half-thickness 6.5 (NACA 0009 at 35-50 % c) + 4 mm gap
  battL: 0.155, battH: 0.050, battW: 0.048,            // 6S 6500 LiPo box EST (pack dims not published)
  legOD: 1.000*IN, legID: (1.000-2*0.058)*IN, legLen: 0.205,  // 4 legs from the 96 in socket tube: 2 x 0.8 + 4 x 0.205 = 2.42 m < 2.438 m incl. kerf
  pitotD: 0.006, pitotL: 0.25,
  xFront: g.xFront, xRear: g.xRear, xStub0: g.booms[0].x0, yIn: g.yIn });
// ---- FEA / thermal load cases (analysis/sizing.mjs structures()) ----
const st = c.struct, half_ = R.base.span/2;
const Fhalf = st.nUlt*s.m*9.80665/2;                 // half-wing lift at ultimate load factor
const zc = 4*half_/(3*Math.PI);                      // elliptic-lift centroid from centreline
const zSparMid = fusR + P.sparLen/2;                 // uniform load on the spar outer face acts here
Object.assign(P, { feaBoomL: st.Lb, feaTipForce: st.Tmax, feaTipMass: st.mTip, feaNult: st.nUlt,
  feaWingForce: Fhalf*zc/zSparMid,                   // scaled so root moment = n W b/(3 pi)
  feaRootMomentTarget: st.Mroot, feaHandSigJ: st.sigJ, feaHandSigB: st.sigB, feaHandDefl: st.defl_max, feaHandFn: st.fn,
  thermQ: 0.20*s.P_hover_per_motor,   // EST: 80 % motor+ESC efficiency -> 20 % of hover input becomes heat in the unit
  thermH: 50, thermAmbK: 308.15, thermTime: 90,   // EST: prop-wash convection 50 W/m2K, 35 C hot day, 90 s hover (test plan T3)
  matLib: '6061-T6 (SS)', matE: 69.0e9, matNu: 0.33, matRho: 2700, matSig: 275e6,   // SOLIDWORKS library 6061-T6 (SS)
  motorMass: 0.165, motorCp: 896 });   // X4110S 165 g (budget-lift.md A3); 6061 c_p from SW library, lumped thermal check

// ---------------- stations (HS §4) ----------------
const yB = -0.03, rB = P.boomOD/2;
const yMotor = yB + 0.021;                       // motor base on the mount top: boom centre + 21.0 (HS J02 block, upper half +0.6..+21.0)
const yPropHub = yMotor + P.motorH;              // lift prop hub sits on the bell top (HS J03); hub 8 mm EST, prop plate 2.5 above it
const yPlate = yPropHub + 0.008;
// gear clamp lower half -28.7..-0.6 below the boom centre, blind leg socket 14.0 deep (FT03), F05 cross-bolt at -21.7 (HS J06/J07)
const gearClampBot = -0.0287, legSocketDepth = 0.014, legBoltY = -0.0217;   // socket depth: hardware.json FT03 "blind, 14.0 deep"
const yLegTop = yB + gearClampBot + legSocketDepth, yGround = yLegTop - P.legLen;   // leg top at the socket floor
// AERO leg fairing (3:1 teardrop, NACA 0033): bore 25.6 over the 25.4 leg, 0.8 vase wall EST; chord = 3 x outer thickness;
// length from 20 mm above the leg bottom (dome foot 18 + 2) to 1 mm under the gear clamp
const fairBore = 0.0256, fairWall = 0.0008, fairChord = 3*(fairBore + 2*fairWall);
const fairY0 = 0.020, fairLen = (P.legLen - legSocketDepth) - fairY0 - 0.001;
Object.assign(P, { gearClampBot, legSocketDepth, legBoltY, fairBore, fairWall, fairChord, fairLen, fairY0 });
P.clampTopF = yLower(xSp) - yB; P.clampTopR = yLower(0.80) - yB;   // clamp tops meet the wing lower surface (review finding cad_sim-7)
P.yB = yB; P.tailT = TAIL_FOIL.t*g.hC; P.yMotor = yMotor; P.yProp = yPropHub + 0.004; P.yGround = yGround;
const xFinLE = g.xRear - g.D/2 - 0.05;
const yStabBot = yB + 0.0157;                    // tail clamp upper half 0.6..15.7: 2.9 mm wall over the 25.6 bore (HS J08, flat top for the stabiliser)
const yStabMid = yStabBot + P.tailT/2, yStabTop = yStabBot + P.tailT, yFin = yStabTop + 0.003;   // fin shoe flange 3.0 (HS J09)
const xTC = xFinLE - 0.0339;                     // tail clamp / fin shoe screw station: fin 22.5 % chord, 50 mm clamp inside the 51.4 mm fixed stab chord
Object.assign(P, { xFinLE, yStabBot, yStabTop, yFin, xTC, finRootBlock: 0.021, rudderY0: 0.022, shoeWall: 0.020, shoeFloor: 0.003, shoeFlangeX: 0.032 });
const cg = c.cg.items.find(i => i.name.startsWith('Battery'));
const L = P.panelLen, Lin = 0.45*L, Lail = 0.55*L, tailX = POD.noseX - fusL, yPod = -0.03;
// wing hardpoints (HS J05, J10, J14, J16, J17)
const zBoomPanel = g.yIn - fusR;                 // boom station measured from the panel root face
const yL30 = yLower(0.30), yL80 = yLower(0.80), yL55 = yLower(0.55), yL78 = yLower(0.78), yL21 = yLower(0.21);
const boltX = -0.70*chord, yU70 = yUpper(0.70), yL70 = yLower(0.70), yMid70 = (yU70 + yL70)/2;
const zHornPanel = Lin + 0.15*Lail;              // aileron horn / servo arm plane, 15 % along the aileron from its inboard end
const SERVO = { L: 0.0386, W: 0.0188, H: 0.0349, tabZ: 0.024, tabT: 0.0025, tabX: 0.023, tabY: 0.005, shaftX: 0.0095, armZ: 0.0399, armLen: 0.020 };   // EMAX ES3005HV 38.6 x 18.8 x 34.9 (HS J14); tab geometry EST (not published)
const TRAY = { bodyY: -0.0109, plateZ: 0.021, plateT: 0.003 };   // servo body centre 10.9 below the foot; plate sits at servo z 21..24
const zServoPanel = zHornPanel - SERVO.armZ;     // servo origin so that the arm plane is at the horn station
const xServo = -0.55*chord, yServo = yL55 + 0.012;   // body bottom 2.6 mm above the lower surface; foot top 3.6 mm under the upper surface (section 29.5 thick at 55 % c)
Object.assign(P, { boltZ: fusR - 0.015, boltX, yU70, yL70, yMid70, zBoomPanel, yL30, yL80, yL55, yL78, yL21, zHornPanel, zServoPanel, xServo, yServo,
  servoL: SERVO.L, servoW: SERVO.W, servoH: SERVO.H, servoTabZ: SERVO.tabZ, servoTabT: SERVO.tabT, servoTabX: SERVO.tabX, servoTabY: SERVO.tabY, servoShaftX: SERVO.shaftX, servoArmLen: SERVO.armLen,
  trayBodyY: TRAY.bodyY, trayPlateZ: TRAY.plateZ, trayPlateT: TRAY.plateT,
  pitotX: -0.05, pitotY: yL21 - 0.0095, pitotZ: -1.0, hornHpX: -0.75*chord, tailX, yPod, battX: cg.x, battY: -0.052,
  bayX0: 0.15, bayX1: 0.30, bayY0: -0.020, bayY1: 0.015, bayZ: 0.04, canopyX0: 0.07, canopyX1: 0.33, canopyR: 0.055, canopyY: 0.015 });
// sizes that follow the wing section and stations (read by BuildVtol.cs, Drawings.cs and docs/build/templates/make_templates.py)
const FT06 = HW.fits.find(f => f.id === 'FT06'), N02 = HW.nuts.find(n => n.id === 'N02');
const pillarH = yU70 - yL70;
// J10 nut pocket from the lower surface: M5 x 20 head on the spot-face, screw end 0.5 past the nylock (HS CAD notes), 0.1 mm steps.
// Spot-face depth (CAD rev D): 1.0 deepened in 0.5 steps until the pocket ceiling stays at or below the tongue-slot floor
// (slot 6.8 centred on the section mid-line), so the nylock never sits above the tongue's lower face (rev C: 9.0 vs floor 8.8).
const slotFloor = (yMid70 - yL70) - 0.0034;
const nutDepthFor = sf => Math.ceil(((pillarH - sf - 0.020) + 0.0005 + N02.h_mm/1000)*1e4 - 1e-6)/1e4;
let pillarSpot = 0.001;
while (nutDepthFor(pillarSpot) > slotFloor + 1e-9) pillarSpot += 0.0005;
if (pillarSpot > 0.0025) throw new Error('J10: M5 x 20 needs a spot-face deeper than 2.5 mm; re-select the wing bolt length');
const pillarNutDepth = nutDepthFor(pillarSpot);
Object.assign(P, { mtow: s.m, ailFrac: 0.55, ailSpan: Lail, thick30: yUpper(0.30) - yLower(0.30), pillarH,
  pillarD: 0.016, pillarBoreD: 0.0164, pillarNutDepth, pillarSpot, pillarSlotFloor: slotFloor, joinBoreD: FT06.hole.nominal_mm/1000,
  legStock: 96*IN });

// ---------------- rotation matrices (rows = images of the part axes X, Y, Z; SOLIDWORKS MathTransform convention, probed 2026-10-21) ----------------
const ID = [[1,0,0],[0,1,0],[0,0,1]];
const YFLIP = [[1,0,0],[0,-1,0],[0,0,-1]];   // part -Y -> +Y   (screw pointing up)
const YtoZ  = [[1,0,0],[0,0,1],[0,-1,0]];    // part -Y -> -Z
const YtoNZ = [[1,0,0],[0,0,-1],[0,1,0]];    // part -Y -> +Z
const YtoX  = [[0,-1,0],[1,0,0],[0,0,1]];    // part -Y -> -X
const YtoNX = [[0,1,0],[-1,0,0],[0,0,1]];    // part -Y -> +X
const YAW180 = [[-1,0,0],[0,1,0],[0,0,-1]];
const ROLL180 = [[-1,0,0],[0,-1,0],[0,0,1]];
const mul = (A, B) => A.map((row, i) => [0,1,2].map(j => row[0]*B[0][j] + row[1]*B[1][j] + row[2]*B[2][j]));
const apply = (v, Rm) => [0,1,2].map(j => v[0]*Rm[0][j] + v[1]*Rm[1][j] + v[2]*Rm[2][j]);
const addv = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, k) => a.map(v => v*k);
const dirOf = Rm => scale(Rm[1], -1);        // where the part's -Y axis points (screw insertion direction)
// rotation that maps the part's +X axis onto unit vector u (pushrods)
function alongX(u) { const n = Math.hypot(...u); u = scale(u, 1/n); let w = Math.abs(u[1]) < 0.9 ? [0,1,0] : [0,0,1];
  const cr = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  let Z = cr(u, w); const nz = Math.hypot(...Z); Z = scale(Z, 1/nz); const Y = cr(Z, u); return [u, Y, Z]; }

// ---------------- fastener parts from hardware.json ----------------
// part name, geometry type and dimensions (mm). Head and nut dimensions are the vendor maxima quoted in the spec.
const fastDefs = [], sched = [];
const fName = {};
for (const f of HW.fasteners) {
  const size = f.thread.split('x')[0];
  const len = f.length_mm || f.length_provisional_mm;
  let type = 'SHCS', dk = f.head_d_mm, k = f.head_h_mm, af = { M2: 1.5, M3: 2.5, M5: 3.0 }[size];
  if (/7380/.test(f.standard)) { type = 'BHCS'; af = { M3: 2.0, M5: 3.0 }[size]; }
  if (f.id === 'F11') { type = 'PAN'; dk = 3.8; k = 1.5; af = 0; }   // kit horn screws: head not published; pan head EST
  if (f.id === 'F12' && f.length_mm == null) { fName[f.id] = 'F02_M3x16_SHCS'; continue; }   // provisional prop screws come from F02 stock: same part
  const d = +size.slice(1), name = `${f.id}_${size}x${len}_${type}`;
  fName[f.id] = name;
  fastDefs.push([f.id, name, type, d, len, dk, k, af, f.material, `${f.standard.replace(/\s*\(.*$/, '')} ${f.thread} x ${len} ${f.material}: ${f.description}`.replace(/\|/g, '/')]);
}
for (const n of HW.nuts) {
  const size = n.thread.split('x')[0], d = +size.slice(1);
  if (n.id === 'N04') { fastDefs.push([n.id, 'N04_M6_Bullet_Nut', 'BULLET', 6, 19.5, 10, 12, 0, 'steel (supplied with motor)', 'M6 x 1.0 bullet prop nut, supplied with the X4110S (height 19.5 from the maker drawing; across-flats EST 10)']); fName[n.id] = 'N04_M6_Bullet_Nut'; continue; }
  const type = /985/.test(n.standard) ? 'NYLOCK' : 'HEXNUT', name = `${n.id}_${size}_${type === 'NYLOCK' ? 'Nylock' : 'Hex_Nut'}`;
  fName[n.id] = name;
  fastDefs.push([n.id, name, type, d, n.h_mm, n.af_mm, 0, 0, n.material, `${n.standard.replace(/\s*\(.*$/, '')} ${n.thread}, s ${n.af_mm} h ${n.h_mm}`]);
}
for (const w of HW.washers) { fName[w.id] = `${w.id}_${w.size}_Washer`; fastDefs.push([w.id, fName[w.id], 'WASHER', w.id_mm, w.t_mm, w.od_mm, 0, 0, w.material, `${w.standard} ${w.size} flat washer OD ${w.od_mm} ID ${w.id_mm} t ${w.t_mm}`]); }
for (const i of HW.inserts) { fName[i.id] = `${i.id}_M3_Insert`; fastDefs.push([i.id, fName[i.id], 'INSERT', 3.0, i.length_mm, i.od_mm, 0, 0, i.material, `${i.model} heat-set insert OD ${i.od_mm} x ${i.length_mm}, hole ${i.hole_d_mm} (knurl shown as two bands)`]); }
for (const d of fastDefs) P['fast_' + d[0]] = d.slice(1).join('|');
const schedRows = [...HW.fasteners, ...HW.nuts, ...HW.washers, ...HW.inserts].map(f => [f.id, (f.standard || f.model || '').replace(/\|/g, '/'),
  f.thread ? `${f.thread} x ${f.length_mm || f.length_provisional_mm || f.h_mm}` : f.size ? `${f.size} ${f.od_mm} x ${f.t_mm}` : `${f.thread || 'M3'} OD ${f.od_mm} x ${f.length_mm}`,
  f.qty, f.order_qty, (f.joints || []).join('; ').replace(/\|/g, '/'), f.torque_Nm == null ? '—' : f.torque_Nm, (f.threadlocker || '—').replace(/\|/g, '/'), f.vendor, f.part_no, f.unit_usd == null ? '—' : f.unit_usd]);
for (const r of schedRows) P['sched_' + r[0]] = r.join('|');

// ---------------- assembly ----------------
// add(part, [x,y,z], rotation, group) -> exploded offset from the group table below
const add = (part, pos, rot = ID, grp = 'frame', kind = 'part') => comps.push({ part, pos, rot, grp, kind });
// fastener helper: screw at point p pointing along dir(rot); optional washer under the head; nut or insert at distance `far` along the direction
const screw = (id, pos, rot, grp, opts = {}) => {
  add(fName[id], pos, rot, grp, 'screw');
  if (opts.washer) add(fName.W01, pos, rot, grp, 'washer');
  if (opts.nut != null) add(fName[opts.nutId || 'N01'], addv(pos, scale(dirOf(rot), opts.nut)), rot, grp, 'nut');
  if (opts.insert != null) add(fName.I01, addv(pos, scale(dirOf(rot), opts.insert)), rot, grp, 'insert');
};
const tailX2 = tailX;
add('Fuselage_Pod', [POD.noseX, yPod, 0], ID, 'pod');
add('Canopy', [0.33, 0.015, 0], ID, 'canopy');
for (const sz of [1, -1]) screw('F07', [0.06, 0.017, sz*0.015], ID, 'canopy', { insert: 0.002 });   // J13 hatch flange 2.0 to inserts in the pod (frame rail in reality)
add('Battery_Tray', [cg.x, -0.080, 0], ID, 'batt');
add('Battery_6S_LiPo', [cg.x, -0.052, 0], ID, 'batt');
add('FC_Tray', [0.225, -0.020, 0], ID, 'fc');   // avionics bay floor 7 mm above the battery
add('Flight_Controller', [0.225, -0.009, 0], ID, 'fc');
for (const sx of [1, -1]) for (const sz of [1, -1]) screw('F07', [0.225 + sx*0.0225, -0.0074, sz*0.0125], ID, 'fc', { insert: 0.0016 });   // J15 provisional 45 x 25 pattern (EST)
add('Wing_Panel_R', [0, 0, fusR], ID, 'wingR'); add('Wing_Panel_L', [0, 0, -fusR], ID, 'wingL');
add('Aileron_R', [0, 0, fusR + Lin + 0.002], ID, 'ailR'); add('Aileron_L', [0, 0, -(fusR + Lin + 0.002)], ID, 'ailL');
add('Spar_Tube', [xs, ys, fusR], ID, 'wingR'); add('Spar_Tube', [xs, ys, -fusR - P.sparLen], ID, 'wingL');
add('Wing_Joiner', [xs, ys, -P.joinLen/2], ID, 'saddle');
// joiner is a slip fit in the saddle (not bonded: the pod transport piece must stay inside the R4 envelope). With both panels bolted on it is
// captured between two printed stops bonded in the spar sockets at 300 mm (joiner half-length 380 - saddle half-width 80 = 300 engagement)
for (const sz of [1, -1]) add('Joiner_Stop', [xs, ys, sz*(fusR + 0.300)], sz > 0 ? ID : YAW180, sz > 0 ? 'wingR' : 'wingL');
// wing centre-section saddle: root section across the pod, bored for the joiner; panels butt onto its faces; one M5 bolt pillar per side (J10)
add('Wing_Saddle', [0, 0, 0], ID, 'saddle');
for (const sz of [1, -1]) {
  const z = sz*P.boltZ, zr = sz*fusR;
  add('Bolt_Pillar', [boltX, yL70, z], ID, 'saddle');
  add('Root_Tongue', [boltX, yMid70, sz*0.055], sz > 0 ? ID : YAW180, sz > 0 ? 'wingR' : 'wingL');   // 50 long, 25 in the panel, 25 in the pillar slot
  screw('F09', [boltX, yU70 - P.pillarSpot, z], ID, 'saddle', { nut: yU70 - P.pillarSpot - (yL70 + pillarNutDepth), nutId: 'N02' });   // head in the pillarSpot spot-face; nut pocket ceiling pillarNutDepth above the lower surface
  // J11 saddle tabs to the pod: 2 x F08 per side along Z into inserts in the pod side at the parallel section
  for (const xx of [-0.10*chord, -0.30*chord]) screw('F08', [xx, -0.030, sz*0.086], sz > 0 ? YtoZ : YtoNZ, 'saddle', { insert: 0.006 });
}
for (const sz of [1, -1]) {
  const z = sz*g.yIn, rotUp = YFLIP;
  // booms: butt joint at xRear inside the rear motor mount (C2), splice plug and 2 x F04 cross-bolts (J04)
  add('Boom_Front', [g.xRear, yB, z], ID, 'boomF'); add('Boom_Rear_Stub', [g.booms[0].x0, yB, z], ID, 'boomR');
  add('Splice_Plug', [g.xRear, yB, z], ID, 'mountR');
  for (const xx of [-0.018, 0.018]) screw('F04', [g.xRear + xx, yB, z + 0.0185], YtoZ, 'mountR', { washer: true, nut: 0.0335 });   // head seat at z +18 (+0.5 washer), nut pocket ceiling at z -15
  for (const xr of [g.xFront, g.xRear]) {
    const grp = xr === g.xFront ? 'mountF' : 'mountR';
    add('Motor_Mount_Upper', [xr, yB, z], ID, grp); add('Motor_Mount_Cap', [xr, yB, z], ID, grp + 'cap');
    add('Lift_Motor', [xr, yMotor, z], ID, grp + 'motor'); add('Lift_Prop', [xr, yPropHub, z], ID, grp + 'prop'); add('Prop_Plate', [xr, yPlate, z], ID, grp + 'plate');
    for (const sx of [1, -1]) screw('F12', [xr + sx*0.006, yPlate + 0.0025, z], ID, grp + 'plate');          // J03 prop plate screws into the hub (2 of 4 holes on dia 12)
    for (const sx of [1, -1]) for (const sz2 of [1, -1]) screw('F01', [xr + sx*0.00884, yMotor - 0.005, z + sz2*0.00884], rotUp, grp + 'cap', { washer: true });   // J01 from inside the bore, washer + 4.5 floor
    for (const sx of [1, -1]) for (const sz2 of [1, -1]) screw('F02', [xr + sx*0.028, yB - 0.0094, z + sz2*0.0175], rotUp, grp + 'cap', { insert: 0.010 });   // J02 cap counterbore 5.6 deep; insert mouth at the split face +0.6
  }
  // J05 boom clamps: lower halves bolt through the upper halves into inserts in the wing hardpoints
  add('Boom_Clamp_F_Upper', [xs, yB, z], ID, 'clampF'); add('Boom_Clamp_F_Lower', [xs, yB, z], ID, 'clampFlow');
  add('Boom_Clamp_R_Upper', [-0.8*chord, yB, z], ID, 'clampR'); add('Boom_Clamp_R_Lower', [-0.8*chord, yB, z], ID, 'clampRlow');
  add('Spar_Collar', [xs, ys, z], ID, sz > 0 ? 'wingR' : 'wingL'); add('Rear_Hardpoint', [-0.8*chord, yL80, z], ID, sz > 0 ? 'wingR' : 'wingL');
  // 2 screws per clamp (HS J05a/J05b), on a diagonal at (x +-12, z +-17.5) so the collar insert bosses sit beside the spar tube, not under it
  for (const sx of [1, -1]) {
    screw('F06', [xs + sx*0.012, yB - 0.0167 + 0.0043, z + sx*0.0175], rotUp, 'clampFlow', { insert: yL30 - (yB - 0.0167 + 0.0043) });
    screw('F04', [-0.8*chord + sx*0.012, yB - 0.0167 + 0.0075, z + sx*0.0175], rotUp, 'clampRlow', { insert: yL80 - (yB - 0.0167 + 0.0075) });
  }
  // J06/J07 gear clamps and legs
  for (const xl of [g.xFront - 0.09, g.xRear + 0.09]) {
    add('Gear_Clamp_Upper', [xl, yB, z], ID, 'gear'); add('Gear_Clamp_Lower', [xl, yB, z], ID, 'gearlow'); add('Landing_Leg', [xl, yGround, z], ID, 'leg');
    add('Gear_Fairing', [xl, yGround + fairY0, z], ID, 'leg');   // AERO leg fairing: from above the dome foot (18) to 1 mm under the gear clamp (fairLen)
    for (const sx of [1, -1]) for (const sz2 of [1, -1]) screw('F03', [xl + sx*0.012, yB + gearClampBot + 0.0153, z + sz2*0.0175], rotUp, 'gearlow', { insert: 0.014 });
    screw('F05', [xl + 0.0135, yB + legBoltY, z], YtoX, 'leg', { washer: true, nut: 0.0262 });   // along -X: head seat x +13 (+0.5 washer), nut bears at x -12.7 just outside the leg tube (M3 x 30)
  }
  // J08 tail clamps, J09 fin shoes + crush sleeves, fins and rudders (C6)
  add('Tail_Clamp_Upper', [xTC, yB, z], ID, 'tail'); add('Tail_Clamp_Cap', [xTC, yB, z], ID, 'tailcap');
  for (const sx of [1, -1]) for (const sz2 of [1, -1]) screw('F02', [xTC + sx*0.018, yB - 0.0094, z + sz2*0.0175], rotUp, 'tailcap', { insert: 0.010 });
  add('Fin_Shoe', [xFinLE, yStabTop, z], ID, 'fin'); add('Fin', [xFinLE, yFin, z], ID, 'fin'); add('Rudder', [xFinLE, yFin, z], ID, 'rudder');
  for (const sz2 of [1, -1]) { add('Crush_Sleeve', [xTC, yStabBot, z + sz2*0.0175], ID, 'stab'); screw('F02', [xTC, yStabTop + 0.003, z + sz2*0.0175], ID, 'fin', { insert: 0.0098 }); }
  // J14/J17 rudder servo on the stabiliser top (shaft outboard, arm up) and horn on the rudder's inboard face
  {
    const rotT = sz > 0 ? ROLL180 : YFLIP, trayPos = [xFinLE - 0.026, yStabTop + 0.003, sz*(g.yIn - 0.0521)];   // foot (3) bonded on the stabiliser top
    const servoPos = addv(trayPos, apply([0, TRAY.bodyY, -TRAY.plateZ], rotT));
    add('Servo_Tray', trayPos, rotT, 'stab'); add('Servo', servoPos, rotT, 'stab');
    for (const sx of [1, -1]) for (const sy of [1, -1]) {
      const pin = [sx*SERVO.tabX, sy*SERVO.tabY, SERVO.tabZ + SERVO.tabT];
      screw('F10', addv(servoPos, apply(pin, rotT)), mul(YtoZ, rotT), 'stab', { nut: SERVO.tabT + TRAY.plateT - 0.002, nutId: 'N03' });
    }
    const arm = addv(servoPos, apply([SERVO.shaftX, -0.018, SERVO.armZ + 0.0022], rotT));   // arm hole at r 18; rod runs beside the arm (Z-bend)
    const hornRot = sz > 0 ? YtoZ : YtoNZ, zFace = sz*(g.yIn - 0.0040);           // rudder half-thickness 3.9 at the hinge (NACA 0009 at 70 % of the local chord); the base floats 1 mm at its rear
    const cLoc = P.vC*(1 - 0.35*(arm[1] - yFin)/P.vH), xHinge = xFinLE - 0.35*P.vC*(arm[1] - yFin)/P.vH - 0.70*cLoc;
    const hornPos = [xHinge - 0.002, arm[1], zFace];
    add('Control_Horn', hornPos, hornRot, 'rudder'); add('Horn_Backplate', [hornPos[0], hornPos[1], sz*(g.yIn + 0.0040)], sz > 0 ? YtoNZ : YtoZ, 'rudder');
    for (const xx of [-0.006, -0.014]) screw('F11', [hornPos[0] + xx, hornPos[1], zFace - sz*0.002], sz > 0 ? YtoNZ : YtoZ, 'rudder', { nut: 0.002 + 0.0080 + 0.0015, nutId: 'N03' });
    const pinPt = addv(hornPos, apply([-0.001, -0.0085, 0], hornRot));
    add('Pushrod_Rudder', arm, alongX(addv(pinPt, scale(arm, -1))), 'stab'); P.rodRudder = Math.hypot(...addv(pinPt, scale(arm, -1)));
  }
  // J14 aileron servo in the wing (foot on the pocket roof, arm down through the open pocket), horn on a bonded hardpoint (J17)
  {
    const rotS = sz > 0 ? ID : YAW180, trayPos = [xServo, yServo - TRAY.bodyY, sz*(fusR + zServoPanel) + (sz > 0 ? TRAY.plateZ : -TRAY.plateZ)];
    const servoPos = addv(trayPos, apply([0, TRAY.bodyY, -TRAY.plateZ], rotS));
    const grp = sz > 0 ? 'wingR' : 'wingL';
    add('Servo_Tray', trayPos, rotS, grp); add('Servo', servoPos, rotS, grp);
    for (const sx of [1, -1]) for (const sy of [1, -1]) {
      const pin = [sx*SERVO.tabX, sy*SERVO.tabY, SERVO.tabZ + SERVO.tabT];
      screw('F10', addv(servoPos, apply(pin, rotS)), mul(YtoZ, rotS), grp, { nut: SERVO.tabT + TRAY.plateT - 0.002, nutId: 'N03' });
    }
    const arm = addv(servoPos, apply([SERVO.shaftX, -0.015, SERVO.armZ + 0.0022], rotS));   // arm hole at r 15; rod beside the arm
    const zH = sz*(fusR + zHornPanel), hornPos = [P.hornHpX, yL78, zH], grpA = sz > 0 ? 'ailR' : 'ailL';
    add('Horn_Hardpoint', [P.hornHpX - 0.010, yL78, zH], ID, grpA); add('Control_Horn', hornPos, ID, grpA);
    for (const xx of [-0.006, -0.014]) screw('F11', [P.hornHpX + xx, yL78 - 0.002, zH], YFLIP, grpA, { nut: 0.010, nutId: 'N03' });   // nut pocket ceiling 8.0 above the hardpoint bottom
    const pinPt = addv(hornPos, [-0.001, -0.0085, 0]);
    add('Pushrod_Aileron', arm, alongX(addv(pinPt, scale(arm, -1))), grp); P.rodAileron = Math.hypot(...addv(pinPt, scale(arm, -1)));
  }
}
add('H_Tail', [xFinLE, yStabMid, 0], ID, 'stab');      // seated on the tail clamp tops
add('Elevator', [xFinLE, yStabMid, 0], ID, 'elev');
// J14 elevator servo on the stabiliser top at the centreline (arm up); horn on the elevator top surface
{
  const trayPos = [xFinLE - 0.026, yStabTop + 0.003, 0], servoPos = addv(trayPos, apply([0, TRAY.bodyY, -TRAY.plateZ], ROLL180));
  add('Servo_Tray', trayPos, ROLL180, 'stab'); add('Servo', servoPos, ROLL180, 'stab');
  for (const sx of [1, -1]) for (const sy of [1, -1]) {
    const pin = [sx*SERVO.tabX, sy*SERVO.tabY, SERVO.tabZ + SERVO.tabT];
    screw('F10', addv(servoPos, apply(pin, ROLL180)), mul(YtoZ, ROLL180), 'stab', { nut: SERVO.tabT + TRAY.plateT - 0.002, nutId: 'N03' });
  }
  const arm = addv(servoPos, apply([SERVO.shaftX, -0.005, SERVO.armZ + 0.0022], ROLL180));   // arm hole at r 5; rod beside the arm
  const xH = xFinLE - 0.70*P.hC - 0.001, yTop = yStabMid + yt09(0.76, P.hC), yBot = yStabMid - yt09(0.76, P.hC);   // elevator surfaces at the horn (mean over its 20 mm base)
  const hornPos = [xH, yTop, arm[2]];
  add('Control_Horn', hornPos, YFLIP, 'elev'); add('Horn_Backplate', [xH, yBot, arm[2]], ID, 'elev');
  for (const xx of [-0.006, -0.014]) screw('F11', [xH + xx, yTop + 0.002, arm[2]], ID, 'elev', { nut: 0.002 + (yTop - yBot) + 0.0015, nutId: 'N03' });
  const pinPt = addv(hornPos, apply([-0.001, -0.0085, 0], YFLIP));
  add('Pushrod_Elevator', arm, alongX(addv(pinPt, scale(arm, -1))), 'stab'); P.rodElevator = Math.hypot(...addv(pinPt, scale(arm, -1)));
}
// J12 pusher: cup in the pod tail ring (4 radial F07 into inserts), motor on the cup floor (4 x F01 + washers from inside), bolt-on M6 adapter, prop, washer, bullet nut
add('Pusher_Cup', [tailX, yPod, 0], ID, 'cup');
for (const [dy, dz, rot] of [[1, 0, ID], [-1, 0, YFLIP], [0, 1, YtoZ], [0, -1, YtoNZ]]) screw('F07', [tailX + 0.015, yPod + dy*0.030, dz*0.030], rot, 'cup', { insert: 0.0022 });   // insert mouth on the cup OD (r 27.8)
add('Pusher_Motor', [tailX, yPod, 0], ID, 'pmotor');
for (const sy of [1, -1]) for (const sz of [1, -1]) screw('F01', [tailX + 0.005, yPod + sy*0.00884, sz*0.00884], YtoX, 'cup', { washer: true });
const xHub = tailX - P.pushMotorL;
add('Pusher_Adapter', [xHub, yPod, 0], ID, 'padapt');
for (const [dy, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) screw('F13', [xHub - 0.002, yPod + dy*0.006, dz*0.006], YtoNX, 'padapt');   // supplied adapter screws pointing +X into the hub, heads in the flange counterbores
add('Pusher_Prop_14in', [xHub - 0.005, yPod, 0], ID, 'pprop');
add('Prop_Washer', [xHub - 0.013, yPod, 0], ID, 'pnut');
add(fName.N04, [xHub - 0.0155, yPod, 0], YtoX, 'pnut');
// J16 pitot under the left wing: printed clamp bonded into the lower surface, one F07 pinch screw from below into an insert
add('Pitot_Tube', [P.pitotX, P.pitotY, P.pitotZ], ID, 'wingL');
add('Pitot_Clamp', [P.pitotX, yL21, P.pitotZ], ID, 'wingL');
screw('F07', [P.pitotX, yL21 - 0.0215, P.pitotZ], YFLIP, 'wingL', { insert: 0.0005 });
{ const pushX = tailX - P.pushMotorL - 0.005 - 0.004, pr = P.pushProp/2, lr = P.liftProp/2, dy = P.yProp - yPod;
  const pushReach = Math.sqrt(Math.max(0, pr*pr - dy*dy)), dx = Math.abs(pushX - g.xRear), liftIn = g.yIn - Math.sqrt(Math.max(0, lr*lr - dx*dx));
  P.discClear = liftIn - pushReach; P.pushX = pushX; if (P.discClear < 0.02) throw new Error('pusher/lift disc clearance ' + P.discClear.toFixed(3) + ' m < 20 mm'); }

// ---------------- exploded layout (VTOL_Exploded.SLDASM, drawing sheet 2) ----------------
// group offsets (m); fasteners are then pulled a further 0.05 m out along their own axis, nuts and inserts 0.05 m on
const XO = { frame: [0,0,0], pod: [0,0,0], canopy: [0,0.22,0], batt: [0.32,0,0], fc: [0,0.30,0], wingR: [0,0,0.30], wingL: [0,0,-0.30], ailR: [-0.08,0,0.42], ailL: [-0.08,0,-0.42],
  saddle: [0,0.16,0], boomF: [0.14,0,0], boomR: [-0.14,0,0], mountF: [0,0,0], mountR: [0,0,0], mountFcap: [0,-0.07,0], mountRcap: [0,-0.07,0],
  mountFmotor: [0,0.10,0], mountRmotor: [0,0.10,0], mountFprop: [0,0.20,0], mountRprop: [0,0.20,0], mountFplate: [0,0.25,0], mountRplate: [0,0.25,0],
  clampF: [0,0,0], clampR: [0,0,0], clampFlow: [0,-0.07,0], clampRlow: [0,-0.07,0], gear: [0,0,0], gearlow: [0,-0.07,0], leg: [0,-0.22,0],
  tail: [0,0,0], tailcap: [0,-0.07,0], stab: [0,0.06,0], elev: [-0.07,0.06,0], fin: [0,0.17,0], rudder: [-0.06,0.17,0],
  cup: [-0.08,0,0], pmotor: [-0.18,0,0], padapt: [-0.26,0,0], pprop: [-0.36,0,0], pnut: [-0.44,0,0] };
const xcomps = comps.map(cc => {
  let off = XO[cc.grp] || [0,0,0];
  if (cc.kind === 'screw' || cc.kind === 'washer') off = addv(off, scale(dirOf(cc.rot), -0.05));
  if (cc.kind === 'nut' || cc.kind === 'insert') off = addv(off, scale(dirOf(cc.rot), 0.05));
  return { ...cc, pos: addv(cc.pos, off) };
});
const fmt = (k, cc) => k + '=' + [cc.part, ...cc.pos.map(v => v.toFixed(5)), cc.rot.flat().map(v => (+v.toFixed(6)).toString()).join(',')].join('|');
const lines = Object.entries(P).map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(6) : v}`)
  .concat(comps.map(cc => fmt('comp', cc))).concat(xcomps.map(cc => fmt('xcomp', cc)));
writeFileSync(new URL('./params.txt', import.meta.url), lines.join('\n') + '\n');
const byKind = {}; for (const cc of comps) byKind[cc.kind] = (byKind[cc.kind] || 0) + 1;
const byPart = {}; for (const cc of comps) byPart[cc.part] = (byPart[cc.part] || 0) + 1;
const fastCount = Object.entries(byPart).filter(([k]) => /^[FNWI]\d\d_/.test(k)).map(([k, v]) => `${k} ${v}`).join(', ');
console.log('params:', Object.keys(P).length, 'components:', comps.length, byKind, '\nfasteners:', fastCount,
  '\nground Y', yGround.toFixed(4), 'pusher tip Y', (yPod - P.pushProp/2).toFixed(3), 'clearance m', (yPod - P.pushProp/2 - yGround).toFixed(3),
  'prop disc Y', P.yProp.toFixed(3), 'pusher-lift disc clearance m', P.discClear.toFixed(3), 'booms', segF.toFixed(4), segR.toFixed(4),
  'pushrods mm', (P.rodAileron*1000).toFixed(1), (P.rodElevator*1000).toFixed(1), (P.rodRudder*1000).toFixed(1));
