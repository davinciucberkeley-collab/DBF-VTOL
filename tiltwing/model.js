/* Tilt-wing VTOL parametric model, after Cakir & Kurtulus, "Design and aerodynamic analysis of a
   VTOL tilt-wing UAV", Turk J Elec Eng & Comp Sci 30 (2022) 767-784, doi:10.3906/elk-2105-59.
   Configuration copied from the paper: tilting main wing with 4 tractor rotors, tilting horizontal
   tail with 2 rotors, no vertical tail, S1223 wing, NACA 0009 tail, wing tilt axis through the wing CG.
   The paper's fixed numbers are NOT hard-coded into the method; they are only the slider defaults
   (PAPER below) so the dashboard can be reset to the paper and compared against it.

   Single source of truth: required by tiltwing/build.mjs (Node) and embedded in the dashboard.
   Units SI. Angles in degrees at the interface, radians inside trig.

   G1  wing area                 S = b^2 / AR
   G2  root / tip chord          c_r = 2S / (b(1+λ)),  c_t = λ c_r
   G3  mean aero chord           c̄ = (2/3) c_r (1+λ+λ²)/(1+λ)
   G4  LE sweep, straight TE     tan Λ_LE = (c_r - c_t) / (b/2)            (paper: TE sweep 0)
   G5  tail area from volume     S_h = V_h S c̄ / l_t                       (paper: V_h = 0.61)
   G6  Reynolds number           Re = ρ V c̄ / μ
   E1  ISA atmosphere            T = 288.15 − 0.0065 h + ΔT,  p = 101325 (1 − 0.0065 h/288.15)^5.2559,  ρ = p / (287.05 T)
   E2  gusts                     first-order (Dryden-type) filtered noise, σ from the slider, L = 150 m; seeded so runs repeat
   M1  mass closure              m = (m_struct + m_elec + m_payload) / (1 - f_prop)   (paper §2.1: prop 40 %)
   M2  battery mass              m_batt = f_batt f_prop m                            (paper §2.1: 50 % of kit)
   P1  hover trim (pitch)        T_rear = W (x_cg - x_w)/(x_t - x_w),  T_front = W - T_rear
   P2  slipstream (paper Eq. 11) V_prop = sqrt(T / (2 ρ A))
   P3  hover power per rotor     P = T^1.5 / sqrt(2ρA) / (FM η_me)              (momentum theory)
   P4  stall speed               V_s = sqrt(2W / (ρ S C_Lmax,3D)),  C_Lmax,3D = k_3D c_lmax(Re)
   P5  cruise drag polar         C_D = C_D0 + C_L² / (π e AR)
   P6  cruise power              P_c = D V / (η_prop η_me)
   P7  endurance                 t = E_usable / P
   A1  slipstream effective flow v_eff = v_air + v_prop, v_prop = -V_prop ĉ (paper Eq. 1, 11); α_eff = atan2(v·n̂, -v·ĉ)
   A2  finite-wing correction    α_2D = α_L0 + κ (α_eff - α_L0), κ = 1 / (1 + a_0 / (π e AR))   (lifting line; blended to 1 past 15–30°)
   A3  section forces            F = q_eff S_i (c_l ê_L + (c_d + C_L²/(π e AR)) ê_D)           (wind → body axes, paper Eq. 2–10)
   A4  downwash at the tail      ε = 2 C_Lw / (π AR), |ε| ≤ 10°;  elevator Δα_t = τ δ_e, τ = 0.45
   A5  fuselage cross-flow       N = q (0.79 L d) C_dc sinθ|sinθ| at 0.5 L, C_dc = 1.2 × 0.65, Munk moment M = q (k₂-k₁) Vol sin2θ
   A6  pitching moment about CG  M = Σ (r_x F_z − r_z F_x) + Σ c_m q_eff S_i c̄_i
   A7  static margin             SM = −dC_m/dC_L at δ_TW = 0
   S1  induced velocity, axial   v = −V_a/2 + sqrt((V_a/2)² + T/(2ρA))      (momentum theory; = paper Eq. 11 at V_a = 0)
   S2  rotor electrical power    P = (T v / FM + T V_a / η_prop) / η_me
   S3  equations of motion       m du/dt = ΣF_x,  m dw/dt = ΣF_z − W   (earth axes, point mass, pitch attitude commanded)
   F1  beam FE (Euler–Bernoulli) K_e = EI/l³ [12 6l −12 6l; 6l 4l² −6l 2l²; …], root clamped at the tilt bearing
   F2  thin-wall tube            I = π/64 (D⁴ − d⁴),  J = 2I,  σ_b = M D/(2I),  τ = T D/(2J),  σ_vm = sqrt(σ² + 3τ²)
   F3  local buckling of tube    σ_cr = 0.3 E t / R   (0.3 = empirical knockdown for thin cylinders, estimate)
   F4  Schrenk lift              l(y) ∝ ½ [c(y)/c̄ + (4/π) sqrt(1 − (2y/b)²)]
   F5  Pratt gust load factor    Δn = ρ V U a K_g / (2 W/S),  K_g = 0.88 μ/(5.3 + μ),  μ = 2 (W/S)/(ρ c̄ a g)
   F6  margin of safety          MS = σ_allow / (FoS σ_limit) − 1,  FoS = 1.5
   F7  modes                     generalized eigenproblem K φ = ω² M φ (lumped masses, inverse iteration)
   F8  plane-stress FE (CST)     tilt-bearing bracket; D = E/(1−ν²)[1 ν 0; ν 1 0; 0 0 (1−ν)/2], K = t A Bᵀ D B; sparse CG solve
   C1  2-D panel method          Hess–Smith: constant source per panel + uniform vortex, Kutta condition; Cp = 1 − (V_t/V∞)²
   S4  transition corridor       level flight at (V, δ_TW): solve T, θ with ΣF = 0, 0 ≤ T ≤ T_max, −10° ≤ θ ≤ 15°
*/
(function (root) {
const G = 9.80665, MU = 1.81e-5, IN = 0.0254;
const d2r = Math.PI / 180;

// Paper values (Table 1, Table 2, §2, §2.1, §3, Fig. 2). Used only as slider defaults and for comparison.
const PAPER = {
  span: 2.0, AR: 6.95, taper: 0.7, Lf: 1.8, df: 0.2, Vh: 0.61, tailTaper: 0.8,
  payload: 2.5, elec: 1.0, structRef: 2.0, fProp: 0.40, fBatt: 0.50,
  Dfront: 14, Drear: 8, Vc: 20, rho: 1.225,
  // outputs reported by the paper, for the comparison table
  out: { S: 0.575, MAC: 0.33, cr: 0.36, sweepLE: 5, tailRootChord: 0.2, mass: 9.5, tailSpan: 0.74,
         ReLevel: 5e5, ReVert: 2.5e5, Vslip: [7, 10], frontShaftW: 363.9, rearShaftW: 122.6,
         flightMin: 60, cruise: [15, 25] }
};

// Slider definitions: [key, label, unit, min, max, step, default, group, note]
const INPUTS = [
  ['span', 'Wing span', 'm', 1.5, 2.6, 0.01, PAPER.span, 'Wing', 'Table 1'],
  ['AR', 'Aspect ratio', '', 5, 8, 0.05, PAPER.AR, 'Wing', 'Table 1; paper trade limits AR to 5–7'],
  ['taper', 'Taper ratio', '', 0.4, 1, 0.01, PAPER.taper, 'Wing', 'Table 1'],
  ['Lf', 'Fuselage length', 'm', 1.3, 2.3, 0.01, PAPER.Lf, 'Fuselage & tail', 'Table 1'],
  ['df', 'Fuselage diameter', 'm', 0.14, 0.28, 0.005, PAPER.df, 'Fuselage & tail', '§2'],
  ['Vh', 'Tail volume coeff.', '', 0.35, 0.9, 0.01, PAPER.Vh, 'Fuselage & tail', '§2'],
  ['hcg', 'CG position', '% MAC', 5, 60, 0.5, 30, 'Fuselage & tail', 'estimate: tilt axis (spar) at 30 % chord, paper Fig. 3'],
  ['payload', 'Payload', 'kg', 0, 5, 0.1, PAPER.payload, 'Mass', '§2'],
  ['elec', 'Electronics', 'kg', 0.3, 2, 0.05, PAPER.elec, 'Mass', '§2.1'],
  ['fProp', 'Propulsion mass fraction', '', 0.25, 0.55, 0.01, PAPER.fProp, 'Mass', '§2.1'],
  ['fBatt', 'Battery share of propulsion', '', 0.3, 0.7, 0.01, PAPER.fBatt, 'Mass', '§2.1'],
  ['Dfront', 'Wing rotor diameter', 'in', 10, 18, 0.5, PAPER.Dfront, 'Propulsion', 'Table 2: APC 14×16'],
  ['Drear', 'Tail rotor diameter', 'in', 6, 12, 0.5, PAPER.Drear, 'Propulsion', 'Table 2: APC 8×10'],
  ['TW', 'Installed thrust / weight', '', 1.2, 2.2, 0.05, 1.5, 'Propulsion', 'estimate'],
  ['ctrlRes', 'Tail-rotor pitch reserve', '% W', 0, 25, 1, 10, 'Propulsion', 'estimate'],
  ['FM', 'Rotor figure of merit', '', 0.45, 0.8, 0.01, 0.65, 'Propulsion', 'estimate; reproduces Table 2 shaft power within 4 %'],
  ['etaMe', 'Motor + ESC efficiency', '', 0.7, 0.95, 0.01, 0.85, 'Propulsion', 'estimate'],
  ['eSpec', 'Battery specific energy', 'Wh/kg', 100, 250, 5, 150, 'Propulsion', 'estimate, LiPo pack level'],
  ['Vc', 'Cruise speed', 'm/s', 12, 28, 0.5, PAPER.Vc, 'Flight', 'paper: 15–25 m/s, CFD at 20'],
  ['CD0', 'Zero-lift drag coeff.', '', 0.02, 0.09, 0.001, 0.045, 'Flight', 'estimate'],
  ['oswald', 'Oswald efficiency', '', 0.6, 0.95, 0.01, 0.8, 'Flight', 'estimate'],
  ['tHover', 'Hover + transition time', 'min', 0, 10, 0.5, 3, 'Flight', 'estimate'],
  ['alt', 'Field altitude', 'm', 0, 3000, 50, 0, 'Environment', 'paper §4: sea level, 101325 Pa'],
  ['dT', 'Temperature vs ISA', '°C', -20, 25, 1, 0, 'Environment', 'ISA +0 = 15 °C at sea level'],
  ['wind', 'Headwind', 'm/s', -10, 12, 0.5, 0, 'Environment', 'negative = tailwind'],
  ['gust', 'Turbulence intensity σ', 'm/s', 0, 4, 0.1, 0, 'Environment', 'Dryden-type gusts in the simulation'],
];
// E1 ISA troposphere: T = T0 − 0.0065 h + ΔT, p = p0 (1 − 0.0065 h / T0)^5.2559, ρ = p / (R T)
function isa(alt, dT) { const T0 = 288.15, Tisa = T0 - 0.0065 * alt, pr = 101325 * Math.pow(1 - 0.0065 * alt / T0, 5.2559), T = Tisa + dT;
  return { T, p: pr, rho: pr / (287.05 * T), mu: 1.458e-6 * Math.pow(T, 1.5) / (T + 110.4), a: Math.sqrt(1.4 * 287.05 * T) }; }
function defaults() { const p = {}; for (const r of INPUTS) p[r[0]] = r[6]; p.rho = isa(p.alt, p.dT).rho; return p; }

// ---------- airfoil polars (data: tiltwing/data/airfoils.json, NeuralFoil) ----------
let AF = null;
function setAirfoils(data) { AF = data; }
function lerp(a, b, t) { return a + (b - a) * t; }
// 2D coefficients at alpha (deg) and Re. Inside the NeuralFoil table range use the table; outside it,
// blend to Viterna–Corrigan flat-plate post-stall so tilt angles up to 90 deg are defined.
function polar2D(name, alphaDeg, Re) {
  const af = AF.airfoils[name], A = af.alpha, keys = Object.keys(af.polars).map(Number).sort((a, b) => a - b);
  let k0 = keys[0], k1 = keys[0];
  for (let i = 0; i < keys.length; i++) { if (Re >= keys[i]) { k0 = keys[i]; k1 = keys[Math.min(i + 1, keys.length - 1)]; } }
  const tRe = k1 === k0 ? 0 : Math.min(1, (Re - k0) / (k1 - k0));
  const at = (key, a) => {
    const i = Math.max(0, Math.min(A.length - 2, Math.floor(a - A[0]))), t = (a - A[i]) / (A[i + 1] - A[i]);
    const P0 = af.polars[String(k0)][key], P1 = af.polars[String(k1)][key];
    return lerp(lerp(P0[i], P0[i + 1], t), lerp(P1[i], P1[i + 1], t), tRe);
  };
  const aLo = A[0], aHi = A[A.length - 1];
  if (alphaDeg >= aLo && alphaDeg <= aHi) return { cl: at('CL', alphaDeg), cd: at('CD', alphaDeg), cm: at('CM', alphaDeg) };
  // Viterna post-stall (AR_eff 10 -> CDmax ≈ 1.29)
  const edge = alphaDeg > aHi ? aHi : aLo, s = Math.sign(alphaDeg) || 1;
  const cdMax = 1.11 + 0.018 * 10, a = Math.abs(alphaDeg) * d2r, aS = Math.abs(edge) * d2r;
  const clS = at('CL', edge), cdS = at('CD', edge);
  const A2 = (Math.abs(clS) - cdMax * Math.sin(aS) * Math.cos(aS)) * Math.sin(aS) / (Math.cos(aS) ** 2);
  const B2 = (cdS - cdMax * Math.sin(aS) ** 2) / Math.cos(aS);
  const aa = Math.min(a, 89.9 * d2r);
  let cl = cdMax / 2 * Math.sin(2 * aa) + A2 * Math.cos(aa) ** 2 / Math.sin(aa);
  const cd = cdMax * Math.sin(aa) ** 2 + B2 * Math.cos(aa);
  if (alphaDeg < 0) cl = -cl;
  return { cl, cd, cm: -0.5 * cl * (0.25 + 0.15 * (aa / (Math.PI / 2))) + at('CM', edge) * (1 - aa / (Math.PI / 2)), post: true, s };
}
const _cm = {};
function clmax2D(name, Re) {
  const key = name + Math.round(Re / 2e4); if (_cm[key]) return _cm[key];
  return (_cm[key] = clmax2Dr(name, Re));
}
function clmax2Dr(name, Re) { let m = -9, am = 0; for (let a = 0; a <= 20; a += 0.5) { const c = polar2D(name, a, Re).cl; if (c > m) { m = c; am = a; } } return { clmax: m, alpha: am }; }

// ---------- sizing ----------
function size(p) {
  const env = isa(p.alt || 0, p.dT || 0); p.rho = env.rho;          // density always follows the environment sliders
  const r = { in: p, env };
  // geometry (G1–G4)
  const S = p.span * p.span / p.AR, cr = 2 * S / (p.span * (1 + p.taper)), ct = p.taper * cr;
  const MAC = 2 / 3 * cr * (1 + p.taper + p.taper ** 2) / (1 + p.taper);
  const sweepLE = Math.atan((cr - ct) / (p.span / 2)) / d2r;
  const yMAC = p.span / 6 * (1 + 2 * p.taper) / (1 + p.taper), xMACoff = yMAC * Math.tan(sweepLE * d2r);
  // layout along the fuselage (x from nose, m). Estimates scaled from paper Fig. 2 (wing ≈ 42 % of length, tail at 92 %).
  const xw = 0.42 * p.Lf;                 // wing tilt axis = spar = 30 % root chord (paper Fig. 3)
  const xLEroot = xw - 0.30 * cr;
  const xLEmac = xLEroot + xMACoff;
  const xt = 0.92 * p.Lf;                 // tail tilt axis
  const lt = xt - (xLEmac + 0.25 * MAC);  // tail arm, wing AC to tail tilt axis
  // tail (G5), paper: NACA 0009, taper 0.8, 5 deg sweep, AR from Fig. 2 (0.74 m span over ~0.133 m²) ≈ 4.1
  const tt = PAPER.tailTaper, Sh = p.Vh * S * MAC / lt, ARh = 4.1, bh = Math.sqrt(ARh * Sh);
  const crh = 2 * Sh / (bh * (1 + tt)), cth = tt * crh;
  const MACh = 2 / 3 * crh * (1 + tt + tt * tt) / (1 + tt);
  Object.assign(r, { S, cr, ct, MAC, sweepLE, yMAC, xMACoff, xw, xLEroot, xLEmac, xt, lt, Sh, ARh, bh, crh, cth, MACh, fineness: p.Lf / p.df });

  // mass (M1, M2). Structure estimate: areal + length densities calibrated so the paper geometry gives the
  // paper's 2.0 kg airframe (§2.1): wing 1.40 kg/m² (incl. tilt mechanism), fuselage 0.55 kg/m at 0.2 m dia,
  // tail 1.0 kg/m², gear/fasteners 0.08 kg.
  const mWing = 1.40 * S, mFus = 0.55 * p.Lf * (p.df / 0.2), mTail = 1.0 * Sh, mMisc = 0.08;
  const mStruct = mWing + mFus + mTail + mMisc;
  const m = (mStruct + p.elec + p.payload) / (1 - p.fProp);
  const mProp = p.fProp * m, mBatt = p.fBatt * mProp, mMotors = mProp - mBatt, W = m * G;
  Object.assign(r, { mWing, mFus, mTail, mMisc, mStruct, m, mProp, mBatt, mMotors, W });

  // CG and hover trim (P1)
  const xcg = xLEmac + p.hcg / 100 * MAC;
  const Trear = W * (xcg - xw) / (xt - xw), Tfront = W - Trear;
  const Df = p.Dfront * IN, Dr = p.Drear * IN, Af = Math.PI * Df * Df / 4, Ar = Math.PI * Dr * Dr / 4;
  const Tf1 = Tfront / 4, Tr1 = Math.max(Trear, 0) / 2;
  const Vslip = Math.sqrt(Tf1 / (2 * p.rho * Af)), VslipR = Math.sqrt(Tr1 / (2 * p.rho * Ar)); // P2
  const Pid = (T, A) => T > 0 ? Math.pow(T, 1.5) / Math.sqrt(2 * p.rho * A) : 0;
  const shaftF = Pid(Tf1, Af) / p.FM, shaftR = Pid(Tr1, Ar) / p.FM;               // P3 shaft
  const Phover = (4 * shaftF + 2 * shaftR) / p.etaMe;                               // electrical
  const TfMax = Tf1 * p.TW, TrMax = Tr1 + p.ctrlRes / 100 * W / 2;
  const PfMax = Pid(TfMax, Af) / p.FM, PrMax = Pid(TrMax, Ar) / p.FM;
  const Pinst = (4 * PfMax + 2 * PrMax) / p.etaMe;
  const blown = Math.min(1, 4 * Df / p.span);                                       // wing span inside front-rotor slipstream
  const DL = Tf1 / Af;                                                              // disk loading N/m²
  Object.assign(r, { xcg, Trear, Tfront, Tf1, Tr1, Df, Dr, Af, Ar, Vslip, VslipR, shaftF, shaftR, Phover, TfMax, TrMax, PfMax, PrMax, Pinst,
    powerLoading: Pinst / m, blown, DL, trimOK: Trear >= -1e-9 });

  // aero, stall, cruise (P4–P6)
  const ReC = p.rho * p.Vc * MAC / env.mu, ReV = p.rho * Vslip * MAC / env.mu;
  const cm2 = clmax2D('s1223', ReC), CLmax = 0.9 * cm2.clmax;                      // k_3D = 0.9 (estimate)
  const Vs = Math.sqrt(2 * W / (p.rho * S * CLmax));
  const q = 0.5 * p.rho * p.Vc * p.Vc, CLc = W / (q * S);
  const k = 1 / (Math.PI * p.oswald * p.AR), CDc = p.CD0 + k * CLc * CLc, LD = CLc / CDc;
  const D = q * S * CDc, etaProp = 0.70;                                            // estimate
  const Pcruise = D * p.Vc / (etaProp * p.etaMe);
  const LDmax = 0.5 / Math.sqrt(p.CD0 * k), VLDmax = Math.sqrt(2 * W / (p.rho * S * Math.sqrt(p.CD0 / k)));
  Object.assign(r, { ReC, ReV, clmax2: cm2.clmax, alphaClmax: cm2.alpha, CLmax, Vs, q, CLc, CDc, LD, D, etaProp, Pcruise, LDmax, VLDmax,
    cruiseMargin: p.Vc / Vs });

  // energy (P7)
  const Euse = mBatt * p.eSpec * 0.8;                                              // Wh, 80 % usable (estimate)
  const tHoverOnly = Euse / Phover * 60, tCruiseOnly = Euse / Pcruise * 60;
  const Ehov = Phover * p.tHover / 60, tCruise = Math.max(0, (Euse - Ehov) / Pcruise * 60);
  const range = p.Vc * tCruise * 60 / 1000;
  Object.assign(r, { Euse, tHoverOnly, tCruiseOnly, Ehov, tCruise, tTotal: tCruise + Math.min(p.tHover, Euse / Phover * 60), range });
  return r;
}

// ---------- aerodynamics (2-D, longitudinal) ----------
// Body axes for this section: x forward, z up, origin at the CG. Angles: θ = angle of the relative wind below the fuselage
// axis (body AoA, nose-up +), δ = wing tilt (chord nose-up from the fuselage axis), δt = tail tilt, δe elevator (TE down +).
// Cdc: 2-D cylinder cross-flow 1.2 times Hoerner's finite-length factor 0.65 (L/d ≈ 9); planform 0.79 L d from the profile.
const AERO = { eSpan: 0.9, kappaBlend: [15, 30], tau: 0.45, etaT: 0.9, Cdc: 1.2 * 0.65, planform: 0.79, k21: 0.85, epsMax: 10 };
const _slope = {};
function liftSlope(name, Re) {           // per radian, from the polar between -4 and +4 deg
  const key = name + Math.round(Re / 5e4); if (_slope[key]) return _slope[key];
  const a = (polar2D(name, 4, Re).cl - polar2D(name, -4, Re).cl) / (8 * d2r);
  let aL0 = 0; for (let x = -15; x <= 5; x += 0.25) { if (polar2D(name, x, Re).cl >= 0) { aL0 = x; break; } }
  return (_slope[key] = { a, aL0 });
}
function surfaceForce(name, st) {        // st: {v:[vx,vz] air velocity incl. slipstream, chordAng(rad), S, AR, c, rho, r:[rx,rz]}
  const V = Math.hypot(st.v[0], st.v[1]); if (V < 1e-6) return { Fx: 0, Fz: 0, M: 0, a: 0, cl: 0, cd: 0, q: 0 };
  const ch = [Math.cos(st.chordAng), Math.sin(st.chordAng)], nh = [-ch[1], ch[0]];
  const u = -(st.v[0] * ch[0] + st.v[1] * ch[1]), w = st.v[0] * nh[0] + st.v[1] * nh[1];
  let aEff = Math.atan2(w, u) / d2r + (st.dAlpha || 0);
  if (aEff > 180) aEff -= 360; if (aEff < -180) aEff += 360;
  const Re = st.rho * V * st.c / MU, sl = liftSlope(name, Math.max(6e4, Re));
  const kap = 1 / (1 + sl.a / (Math.PI * AERO.eSpan * st.AR));
  const A = Math.abs(aEff), [b0, b1] = AERO.kappaBlend, kb = A <= b0 ? kap : A >= b1 ? 1 : kap + (1 - kap) * (A - b0) / (b1 - b0);
  let a2 = A > 90 ? aEff : sl.aL0 + kb * (aEff - sl.aL0);
  let pol;
  if (A > 90) { const back = polar2D(name, Math.sign(aEff) * (180 - A), Re); pol = { cl: -back.cl * 0.8, cd: back.cd, cm: 0 }; }   // reversed flow, rough
  else {
    pol = polar2D(name, a2, Re);
    // 3-D max-lift knockdown (C_Lmax,3D ≈ 0.9 c_lmax, as in P4), faded in over the 4° before section stall
    const as = clmax2D(name, Re).alpha, f = Math.max(0, Math.min(1, (a2 - (as - 4)) / 4));
    if (pol.cl > 0) pol = Object.assign({}, pol, { cl: pol.cl * (1 - 0.1 * f) });
  }
  const q = 0.5 * st.rho * V * V, cdi = pol.cl * pol.cl * kb * (A < b1 ? 1 : 0) / (Math.PI * AERO.eSpan * st.AR);
  const eD = [st.v[0] / V, st.v[1] / V], eL = [st.v[1] / V, -st.v[0] / V];
  const cl = pol.cl, cd = pol.cd + cdi, qS = q * st.S * (st.eta || 1);
  const Fx = qS * (cl * eL[0] + cd * eD[0]), Fz = qS * (cl * eL[1] + cd * eD[1]);
  const M = st.r[0] * Fz - st.r[1] * Fx + pol.cm * qS * st.c;
  return { Fx, Fz, M, a: aEff, a2, cl, cd, q, V };
}
// Full aircraft. o: {V, theta (deg), tilt, tailTilt, de, Vpw, Vpt, rho}. Returns body forces/moment and wind-axis coefficients.
function aero(r, p, o) {
  const rho = o.rho || p.rho, th = o.theta * d2r, V = o.V;
  const vAir = [-V * Math.cos(th), V * Math.sin(th)];            // air relative to the aircraft
  const dW = o.tilt * d2r, dT = (o.tailTilt == null ? o.tilt : o.tailTilt) * d2r;
  const zw = 0.42 * p.df, zt = 0.12 * p.df;
  const pos = (xAft, z) => [r.xcg - xAft, z];                      // forward-positive arm from the CG
  // wing aerodynamic centre: 25 % MAC, rotated with the wing about the tilt axis
  const dac = (r.xLEmac + 0.25 * r.MAC) - r.xw;                    // aft of the axis, along the chord
  const cw = [Math.cos(dW), Math.sin(dW)], ax = pos(r.xw, zw), rW = [ax[0] - dac * cw[0], ax[1] - dac * cw[1]];
  const fb = o.blown == null ? r.blown : o.blown;
  const parts = [];
  const vSlipW = [-(o.Vpw || 0) * cw[0], -(o.Vpw || 0) * cw[1]];
  const wingB = surfaceForce('s1223', { v: [vAir[0] + vSlipW[0], vAir[1] + vSlipW[1]], chordAng: dW, S: r.S * fb, AR: p.AR, c: r.MAC, rho, r: rW });
  const wingU = surfaceForce('s1223', { v: vAir, chordAng: dW, S: r.S * (1 - fb), AR: p.AR, c: r.MAC, rho, r: rW });
  parts.push(['wing', wingB], ['wing', wingU]);
  // downwash from the wing's lift (lift coefficient on its own effective q), clipped
  const qInf = 0.5 * rho * V * V;
  const CLw = (wingU.cl * (1 - fb) + wingB.cl * fb);
  let eps = 2 * CLw / (Math.PI * p.AR) / d2r * Math.cos(Math.min(Math.abs(dW - dT), Math.PI / 2));
  eps = Math.max(-AERO.epsMax, Math.min(AERO.epsMax, eps));
  const ct = [Math.cos(dT), Math.sin(dT)], dacT = 0.25 * r.MACh - 0.3 * r.crh, axT = pos(r.xt, zt), rT = [axT[0] - dacT * ct[0], axT[1] - dacT * ct[1]];
  const vT = [vAir[0] - (o.Vpt || 0) * ct[0], vAir[1] - (o.Vpt || 0) * ct[1]];
  const tail = surfaceForce('naca0009', { v: vT, chordAng: dT, S: r.Sh, AR: r.ARh, c: r.MACh, rho, r: rT, dAlpha: -eps + AERO.tau * (o.de || 0), eta: AERO.etaT });
  parts.push(['tail', tail]);
  // fuselage: cross-flow normal force + friction (rest of C_D0) + Munk moment
  const thF = Math.atan2(vAir[1], -vAir[0]);
  const N = qInf * AERO.planform * p.df * p.Lf * AERO.Cdc * Math.sin(thF) * Math.abs(Math.sin(thF));
  const cdWing0 = polar2D('s1223', 0, Math.max(6e4, r.ReC)).cd, cdTail0 = polar2D('naca0009', 0, Math.max(6e4, r.ReC * r.MACh / r.MAC)).cd;
  const CDmisc = Math.max(0.008, p.CD0 - cdWing0 - cdTail0 * r.Sh / r.S);
  const eD = V > 0 ? [vAir[0] / V, vAir[1] / V] : [0, 0];
  const fF = pos(0.5 * p.Lf, 0);
  const fus = { Fx: qInf * r.S * CDmisc * eD[0], Fz: N + qInf * r.S * CDmisc * eD[1] };
  const vol = 0.6 * Math.PI / 4 * p.df * p.df * p.Lf;
  fus.M = fF[0] * fus.Fz - fF[1] * fus.Fx + qInf * AERO.k21 * vol * Math.sin(2 * thF);
  parts.push(['fuselage', fus]);
  let Fx = 0, Fz = 0, M = 0; for (const [, f] of parts) { Fx += f.Fx; Fz += f.Fz; M += f.M; }
  const eL = V > 0 ? [vAir[1] / V, -vAir[0] / V] : [0, 1];
  const L = Fx * eL[0] + Fz * eL[1], D = Fx * eD[0] + Fz * eD[1];
  const qS = qInf * r.S;
  return { Fx, Fz, M, L, D, CL: qS ? L / qS : 0, CD: qS ? D / qS : 0, Cm: qS ? M / (qS * r.MAC) : 0, eps, CDmisc,
    wing: { alphaB: wingB.a, alphaU: wingU.a, VB: wingB.V, cl: CLw }, tail: { alpha: tail.a, cl: tail.cl }, parts };
}
// wing-coordinate helper (paper §4: α measured from the wing chord): θ = α − δ
function aeroWing(r, p, alphaW, tilt, de, extra) { return aero(r, p, Object.assign({ V: 20, theta: alphaW - tilt, tilt, de }, extra || {})); }
function stability(r, p) {
  const V = p.Vc, f = th => aero(r, p, { V, theta: th, tilt: 0, de: 0 });
  const a = f(0), b = f(2);
  const dCL = (b.CL - a.CL) / 2, dCm = (b.Cm - a.Cm) / 2, SM = -dCm / (dCL || 1e-9);
  // trim at the cruise lift coefficient: solve θ, δe
  let th = 0, de = 0;
  for (let i = 0; i < 40; i++) {
    const s0 = aero(r, p, { V, theta: th, tilt: 0, de });
    const sT = aero(r, p, { V, theta: th + 0.5, tilt: 0, de }), sE = aero(r, p, { V, theta: th, tilt: 0, de: de + 0.5 });
    const J = [[(sT.CL - s0.CL) / 0.5, (sE.CL - s0.CL) / 0.5], [(sT.Cm - s0.Cm) / 0.5, (sE.Cm - s0.Cm) / 0.5]];
    const e = [r.CLc - s0.CL, -s0.Cm], det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    if (Math.abs(det) < 1e-12) break;
    const dth = (e[0] * J[1][1] - J[0][1] * e[1]) / det, dde = (J[0][0] * e[1] - J[1][0] * e[0]) / det;
    th += Math.max(-3, Math.min(3, dth)); de += Math.max(-5, Math.min(5, dde));
    if (Math.abs(dth) < 1e-4 && Math.abs(dde) < 1e-4) break;
  }
  const trim = aero(r, p, { V, theta: th, tilt: 0, de });
  return { CLa: dCL / d2r, Cma: dCm / d2r, SM, hn: p.hcg / 100 + SM, trimTheta: th, trimDe: de, trimCD: trim.CD, trimLD: trim.CL / trim.CD, trimOK: Math.abs(de) <= 20 && Math.abs(trim.CL - r.CLc) < 0.01 };
}

// ---------- flight model (step 4) ----------
function induced(T, A, Va, rho) { if (T <= 0) return 0; return -Va / 2 + Math.sqrt(Va * Va / 4 + T / (2 * rho * A)); }   // S1
// all forces in earth axes (x forward, z up) for body pitch th (rad), tilt d (deg), total thrust T, earth velocity (u, w)
function flightForces(r, p, st) {
  const { u, w, th, d, T } = st, de = st.de || 0, rho = p.rho;
  const xb = [Math.cos(th), Math.sin(th)], zb = [-Math.sin(th), Math.cos(th)];
  const va = [-u, -w], vbx = va[0] * xb[0] + va[1] * xb[1], vbz = va[0] * zb[0] + va[1] * zb[1];
  const V = Math.hypot(vbx, vbz), theta = V > 1e-6 ? Math.atan2(vbz, -vbx) / d2r : 0;
  const sR = Math.max(0, Math.min(0.6, r.Trear / r.W));      // tail-rotor share fixed at the hover trim value
  const Tw = T * (1 - sR), Tt = T * sR, dr = d * d2r, ch = [Math.cos(dr), Math.sin(dr)];
  const Va = -(vbx * ch[0] + vbz * ch[1]);                    // axial inflow along the rotor axis (= chord)
  const vW = induced(Tw / 4, r.Af, Va, rho), vT = induced(Tt / 2, r.Ar, Va, rho);
  const a = aero(r, p, { V, theta, tilt: d, tailTilt: d, de, Vpw: vW, Vpt: vT });
  const Fbx = a.Fx + T * ch[0], Fbz = a.Fz + T * ch[1];
  const Fx = Fbx * xb[0] + Fbz * zb[0], Fz = Fbx * xb[1] + Fbz * zb[1];
  // pitching moment of thrust about the CG: wing rotors act on the tilt axis, tail rotors on the tail axis
  const zw = 0.42 * p.df, zt = 0.12 * p.df, armW = [r.xcg - r.xw, zw], armT = [r.xcg - r.xt, zt];
  const Mt = armW[0] * Tw * ch[1] - armW[1] * Tw * ch[0] + armT[0] * Tt * ch[1] - armT[1] * Tt * ch[0];
  const Pel = ((Tw * vW + Tt * vT) / p.FM + T * Math.max(Va, 0) / r.etaProp) / p.etaMe;   // S2
  return { Fx, Fz, M: a.M + Mt, Ma: a.M, Mt, V, theta, Va, vW, vT, Pel, aero: a,
    Lwing: a.parts[0][1], wingAlphaB: a.wing.alphaB, wingAlphaU: a.wing.alphaU, thrustVert: T * (ch[0] * xb[1] + ch[1] * zb[1]) };
}
function tMax(r, p) { return 4 * r.TfMax + 2 * r.TrMax; }
// pitch authority: tail-rotor reserve on the tail arm + elevator ±20° (A4 slope, τ) on the tail arm
function pitchAuthority(r, p, V) {
  const q = 0.5 * p.rho * V * V, at = 2 * Math.PI * r.ARh / (r.ARh + 2);
  return p.ctrlRes / 100 * r.W * (r.xt - r.xcg) + q * r.Sh * AERO.etaT * at * AERO.tau * 20 * d2r * (r.xt - r.xcg);
}
// S4: level-flight trim at airspeed V and tilt d; unknowns thrust T and pitch θ (deg). Returns null if no solution.
function trimLevel(r, p, V, d, guess) {
  let T = guess ? guess.T : r.W, th = guess ? guess.th : 0;
  for (let i = 0; i < 30; i++) {
    const f = s => flightForces(r, p, { u: V, w: 0, th: s.th * d2r, d, T: s.T });
    const f0 = f({ T, th }), e = [f0.Fx, f0.Fz - r.W];
    if (Math.abs(e[0]) < 0.02 && Math.abs(e[1]) < 0.02) return { T, th, f: f0 };
    const fT = f({ T: T + 0.5, th }), fh = f({ T, th: th + 0.25 });
    const J = [[(fT.Fx - f0.Fx) / 0.5, (fh.Fx - f0.Fx) / 0.25], [(fT.Fz - f0.Fz) / 0.5, (fh.Fz - f0.Fz) / 0.25]];
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0]; if (Math.abs(det) < 1e-9) return null;
    const dT = (-e[0] * J[1][1] + J[0][1] * e[1]) / det, dth = (-J[0][0] * e[1] + J[1][0] * e[0]) / det;
    T += Math.max(-r.W * 0.5, Math.min(r.W * 0.5, dT)); th += Math.max(-4, Math.min(4, dth));
    if (th < -30 || th > 40 || T < -r.W) return null;
  }
  return null;
}
// T for Fx = 0 at fixed θ (secant; F_x is close to linear in T)
// thrust that zeroes one force residual at fixed θ (secant; thrust enters both residuals almost linearly).
// thrust-borne (δ ≥ 45°): T sets ΣF_z = W; wing-borne (δ < 45°): T sets ΣF_x = 0.
function thrustFor(r, p, V, d, thDeg, Tm) {
  const vert = d >= 45, F = T => flightForces(r, p, { u: V, w: 0, th: thDeg * d2r, d, T });
  const res = f => vert ? f.Fz - r.W : f.Fx;
  let T0 = 0, T1 = vert ? r.W : Tm * 0.3, f0 = F(T0), f1 = F(T1);
  for (let k = 0; k < 7; k++) {
    if (Math.abs(res(f1)) < 0.05) break;
    const den = res(f1) - res(f0); if (Math.abs(den) < 1e-9) break;
    const T2 = Math.max(-0.2 * Tm, Math.min(1.8 * Tm, T1 - res(f1) * (T1 - T0) / den));
    T0 = T1; f0 = f1; T1 = T2; f1 = F(T1);
  }
  return { T: T1, f: f1, other: vert ? f1.Fx : f1.Fz - r.W, conv: Math.abs(res(f1)) < 0.5 };
}
// S4 corridor: θ swept from −10° to +15°; a point is flyable if some θ gives ΣF_z = W with ΣF_x = 0 and 0 ≤ T ≤ T_max.
function corridor(r, p, Vs, ds) {
  const Tm = tMax(r, p), cs = clmax2D('s1223', Math.max(6e4, r.ReC)).alpha, ths = [];
  for (let t = -10; t <= 15.01; t += 2.5) ths.push(t);
  const out = [];
  for (const d of ds) for (const V of Vs) {
    let prev = null, best = null;
    for (const th of ths) {
      const s = thrustFor(r, p, V, d, th, Tm);
      const cur = s.conv && s.T >= -0.05 * Tm && s.T <= 1.2 * Tm ? { th, e: s.other } : null;
      if (prev && cur && Math.sign(prev.e) !== Math.sign(cur.e)) {
        // refine θ inside the bracket by regula falsi
        let a = prev, b = cur, thS = a.th;
        for (let k = 0; k < 8; k++) {
          thS = a.th + a.e / (a.e - b.e) * (b.th - a.th);
          const sm = thrustFor(r, p, V, d, thS, Tm); if (!sm.conv) break;
          if (Math.abs(sm.other) < 0.01 * r.W) break;
          if (Math.sign(sm.other) === Math.sign(a.e)) a = { th: thS, e: sm.other }; else b = { th: thS, e: sm.other };
        }
        if (!best || Math.abs(thS) < Math.abs(best.th)) best = { th: thS };
      }
      prev = cur;
    }
    let state = 'none', sol = null;
    if (best) {
      sol = thrustFor(r, p, V, d, best.th, Tm);
      const ok = Math.abs(sol.f.Fx) < 0.03 * r.W && Math.abs(sol.f.Fz - r.W) < 0.03 * r.W && sol.T >= -0.5 && sol.T <= Tm;
      if (ok) state = Math.max(sol.f.wingAlphaB, V > 2 ? sol.f.wingAlphaU : -99) > cs + 2 ? 'stall' : 'ok';
    }
    out.push({ V, d, state, T: sol ? sol.T : null, th: best ? best.th : null, P: sol && state !== 'none' ? sol.f.Pel : null });
  }
  return out;
}
// hover tilt that needs no pitch attitude: the cambered wing in its own slipstream makes a horizontal force at 90°
function hoverTilt(r, p) {
  const Tm = tMax(r, p), Fx = d => { let T = r.W; for (let k = 0; k < 4; k++) { const f = flightForces(r, p, { u: 0, w: 0, th: 0, d, T }); T += (r.W - f.Fz) / Math.max(0.2, Math.sin(d * d2r)); } return flightForces(r, p, { u: 0, w: 0, th: 0, d, T }).Fx; };
  let lo = 60, hi = 90, flo = Fx(lo), fhi = Fx(hi);
  if (Math.sign(flo) === Math.sign(fhi)) return 90;
  for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2, fm = Fx(mid); if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else { hi = mid; fhi = fm; } }
  return (lo + hi) / 2;
}
// S3: time simulation. o: {hTr, tClimb, tHold, tTr, tEnd, shape}
function simulate(r, p, o) {
  const dt = o.dt || 0.05, Tm = tMax(r, p), m = r.m, W = r.W, out = [];
  let x = 0, z = 0, u = 0, w = 0, E = 0, th = 0, iV = 0, T = W, thCmd = 0;
  // E2 gusts: seeded LCG -> Gaussian -> first-order filter with time constant L / max(V, 3)
  let seed = (o.seed || 7) >>> 0; const rnd = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  let ug = 0, wg = 0; const sg = p.gust || 0, Lg = 150, hw = p.wind || 0;
  const t1 = o.tClimb, t2 = t1 + o.tHold, t3 = t2 + o.tTr;
  const hover = o.hoverTilt == null ? hoverTilt(r, p) : o.hoverTilt;
  const tiltAt = t => t < t2 ? hover : t < t3 ? (() => { const s = (t - t2) / o.tTr; const e = o.shape === 'linear' ? s : 0.5 - 0.5 * Math.cos(Math.PI * s); return hover * (1 - e); })() : 0;
  for (let t = 0; t <= o.tEnd + 1e-9; t += dt) {
    const d = tiltAt(t);
    if (sg > 0) { const tau = Lg / Math.max(3, Math.abs(u + hw)), a = Math.exp(-dt / tau), k = sg * Math.sqrt(1 - a * a);
      ug = a * ug + k * gauss(); wg = a * wg + 0.7 * k * gauss(); }
    const ua = u + hw + ug, wa = w - wg;          // air-relative velocity (headwind adds to the airspeed)
    // references
    const zr = t < t1 ? o.hTr * (0.5 - 0.5 * Math.cos(Math.PI * t / t1)) : o.hTr, wr = t < t1 ? o.hTr * Math.PI / (2 * t1) * Math.sin(Math.PI * t / t1) : 0;   // smooth climb
    const Vref = t < t2 ? 0 : p.Vc;
    // blend between thrust-borne (b = 0) and wing-borne (b = 1) control
    const b = Math.max(0, Math.min(1, (40 - d) / 35));
    // wing-borne: pitch holds altitude, thrust holds speed
    // thrust-borne: before the transition, pitch holds zero ground speed (nose down to go forward)
    const thHover = t < t2 ? Math.max(-10, Math.min(10, 4 * u)) : 0;   // holds ground position against wind
    thCmd = ((1 - b) * thHover + b * Math.max(-5, Math.min(10, 2.0 * (zr - z) + 2.5 * (wr - w) + 2))) * d2r;
    th += Math.max(-dt * 20 * d2r, Math.min(dt * 20 * d2r, thCmd - th));          // 20 °/s attitude rate limit
    // thrust for the vertical requirement (thrust-borne part)
    const FzReq = W + m * (1.2 * (zr - z) + 2.2 * (wr - w));
    let Tv = T;
    for (let k = 0; k < 3; k++) { const f = flightForces(r, p, { u: ua, w: wa, th, d, T: Tv }); const s = Math.max(0.05, Math.sin((d * d2r) + th)); Tv = Math.max(0, Tv + (FzReq - f.Fz) / s); Tv = Math.min(Tm, Tv); }
    // speed-hold thrust (wing-borne part)
    const f0 = flightForces(r, p, { u: ua, w: wa, th, d, T });
    const eV = Vref - (u + hw);   // airspeed hold iV += eV * dt; iV = Math.max(-200, Math.min(200, iV));
    const Ts = Math.max(0, Math.min(Tm, T + (m * (0.8 * eV) - f0.Fx) * 0.6 + 0.05 * iV));
    T = (1 - b) * Tv + b * Ts;
    // in the hover/transition phase let excess forward thrust accelerate: thrust-borne part already drives u through T cos δ
    const f = flightForces(r, p, { u: ua, w: wa, th, d, T });
    const onGround = z <= 0 && f.Fz < W;
    const ax = onGround ? 0 : f.Fx / m, az = onGround ? Math.max(0, (f.Fz - W) / m) : (f.Fz - W) / m;
    u += ax * dt; w += az * dt; if (onGround) { u = 0; w = Math.max(0, w); }
    x += u * dt; z = Math.max(0, z + w * dt);
    E += f.Pel * dt / 3600;
    const auth = pitchAuthority(r, p, f.V);
    if (Math.round(t / dt) % Math.max(1, Math.round(0.1 / dt)) === 0)
      out.push({ t: +t.toFixed(3), x, z, u, w, ug, wg, V: f.V, d, th: th / d2r, T, Tpct: T / Tm * 100, P: f.Pel, E, aB: f.wingAlphaB, aU: f.wingAlphaU,
        wingLift: f.aero.parts.filter(q => q[0] === 'wing').reduce((s2, q) => s2 + q[1].Fx * -Math.sin(th) + q[1].Fz * Math.cos(th), 0), thrustVert: f.thrustVert,
        M: f.M, auth, b, ground: onGround, vW: f.vW });
  }
  const tr = out.filter(s => s.t >= t2 && s.t <= t3 + 5);
  const zmin = Math.min(...tr.map(s => s.z)), zmax = Math.max(...tr.map(s => s.z));
  return { trace: out, t1, t2, t3, Tm, hover, summary: { altLoss: Math.max(0, o.hTr - zmin), altGain: Math.max(0, zmax - o.hTr), Vend: out[out.length - 1].V,
    Etr: out.filter(s => s.t <= t3).slice(-1)[0].E, Etot: out[out.length - 1].E, Pmax: Math.max(...out.map(s => s.P)), Tmaxpct: Math.max(...out.map(s => s.Tpct)),
    aMax: Math.max(...tr.map(s => Math.max(s.aB, s.V > 2 ? s.aU : -99))), Mmax: Math.max(...out.filter(s => !s.ground && s.z > 0.5).map(s => Math.abs(s.M) / Math.max(1e-6, s.auth))) } };
}

// ---------- structures (step 5) ----------
// Allowables are estimates for design screening; replace with coupon or supplier data before building.
const MATERIALS = {
  cf_tube:   { name: 'Carbon tube, roll-wrapped', E: 110e9, G: 20e9, sig: 600e6, rho: 1550, src: 'estimate, typical roll-wrapped CF tube (compression-limited)' },
  al6061:    { name: 'Aluminium 6061-T6', E: 68.9e9, G: 26e9, sig: 276e6, rho: 2700, src: 'handbook yield, MIL-HDBK-5 / ASM' },
  al7075:    { name: 'Aluminium 7075-T6', E: 71.7e9, G: 26.9e9, sig: 503e6, rho: 2810, src: 'handbook yield, MIL-HDBK-5 / ASM' },
  gf_tube:   { name: 'Glass-fibre tube', E: 25e9, G: 4e9, sig: 300e6, rho: 1900, src: 'estimate' },
  gf_shell:  { name: 'Glass/epoxy shell', E: 18e9, G: 3.5e9, sig: 200e6, rho: 1850, src: 'estimate, wet layup' },
  cf_shell:  { name: 'Carbon/epoxy shell', E: 50e9, G: 4.5e9, sig: 400e6, rho: 1550, src: 'estimate, quasi-isotropic layup' },
};
const tube = (D, t) => { const d = Math.max(0, D - 2 * t), I = Math.PI / 64 * (D ** 4 - d ** 4); return { D, t, I, J: 2 * I, A: Math.PI / 4 * (D * D - d * d) }; };
function solveDense(A, b) {
  const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
  for (let k = 0; k < n; k++) { let p = k; for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i; [M[k], M[p]] = [M[p], M[k]];
    for (let i = k + 1; i < n; i++) { const f = M[i][k] / M[k][k]; if (f) for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j]; } }
  const x = new Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; } return x;
}
// cantilever beam FE: nodes ys (root at ys[0], clamped), EI per element, nodal forces F (up +) -> deflection, slope
function beamFE(ys, EI, F) {
  const n = ys.length, N = 2 * n, K = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let e = 0; e < n - 1; e++) {
    const l = ys[e + 1] - ys[e], k = EI[e] / l ** 3, ke = [[12, 6 * l, -12, 6 * l], [6 * l, 4 * l * l, -6 * l, 2 * l * l], [-12, -6 * l, 12, -6 * l], [6 * l, 2 * l * l, -6 * l, 4 * l * l]];
    const dof = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[dof[i]][dof[j]] += k * ke[i][j];
  }
  const free = []; for (let i = 2; i < N; i++) free.push(i);
  const Kf = free.map(i => free.map(j => K[i][j])), Ff = free.map(i => i % 2 === 0 ? F[i / 2] : 0);
  const u = solveDense(Kf, Ff), w = [0], th = [0];
  for (let i = 0; i < free.length; i += 2) { w.push(u[i]); th.push(u[i + 1]); }
  return { w, th, K, free };
}
// lowest modes of a cantilever with lumped nodal masses (translational) by inverse iteration with deflation
function beamModes(ys, EI, mNode, nModes = 2) {
  const { K, free } = beamFE(ys, EI, ys.map(() => 0));
  const Kf = free.map(i => free.map(j => K[i][j])), m = free.map(i => i % 2 === 0 ? mNode[i / 2] : 1e-9 * mNode[Math.floor(i / 2)] + 1e-12);
  const modes = [];
  for (let k = 0; k < nModes; k++) {
    let x = free.map((_, i) => (i % 2 === 0 ? 1 : 0) * (1 + i * 0.01 * (k + 1)) * (k % 2 ? Math.sin(i) : 1)), lam = 0;
    for (let it = 0; it < 60; it++) {
      for (const md of modes) { let c = 0; for (let i = 0; i < x.length; i++) c += x[i] * m[i] * md.v[i]; for (let i = 0; i < x.length; i++) x[i] -= c * md.v[i]; }
      const y = solveDense(Kf, x.map((v, i) => m[i] * v));
      let nrm = 0; for (let i = 0; i < y.length; i++) nrm += y[i] * m[i] * y[i]; nrm = Math.sqrt(nrm);
      x = y.map(v => v / nrm);
      let num = 0, den = 0; const Kx = Kf.map(r => r.reduce((s, v, j) => s + v * x[j], 0));
      for (let i = 0; i < x.length; i++) { num += x[i] * Kx[i]; den += x[i] * m[i] * x[i]; } lam = num / den;
    }
    modes.push({ v: x, f: Math.sqrt(Math.max(lam, 0)) / (2 * Math.PI), shape: [0].concat(x.filter((_, i) => i % 2 === 0)) });
  }
  return modes;
}
// statics: shear and bending moment from the tip inward for nodal loads F (up +)
function shearMoment(ys, F) {
  const n = ys.length, V = new Array(n).fill(0), Mb = new Array(n).fill(0);
  for (let i = n - 2; i >= 0; i--) { V[i] = V[i + 1] + F[i + 1]; Mb[i] = Mb[i + 1] + V[i] * (ys[i + 1] - ys[i]); }
  V[0] += F[0] * 0; return { V, M: Mb };
}
function fea(r, p, sp) {
  const W = r.W, n = 61, mat = MATERIALS[sp.sparMat], fm = MATERIALS[sp.fusMat], tm = MATERIALS[sp.tailMat || sp.sparMat];
  const s = tube(sp.sparD / 1000, sp.sparT / 1000), stail = tube(sp.tailD / 1000, sp.tailT / 1000);
  const hb = p.span / 2, y0 = 0.55 * p.df;                                   // wing half starts at the bearing (CAD step 2)
  const ys = []; for (let i = 0; i < n; i++) ys.push(y0 + (hb - y0) * i / (n - 1));
  // put nodes exactly at the rotor stations
  const rotY = [0.2 * p.span, 0.5 * p.span].map(y => Math.min(hb, y));
  const rotIdx = rotY.map(y => { let k = 0; for (let i = 0; i < n; i++) if (Math.abs(ys[i] - y) < Math.abs(ys[k] - y)) k = i; ys[k] = y; return k; });
  const chord = y => r.cr - (r.cr - r.ct) * y / hb;
  const sch = y => 0.5 * (chord(y) / (r.S / p.span) + 4 / Math.PI * Math.sqrt(Math.max(0, 1 - (2 * y / p.span) ** 2)));
  // node tributary widths
  const trib = ys.map((y, i) => ((i < n - 1 ? ys[i + 1] - y : 0) + (i > 0 ? y - ys[i - 1] : 0)) / 2);
  let schTot = 0; for (let i = 0; i < n; i++) schTot += sch(ys[i]) * trib[i];
  let schAll = 0; for (let y = 0; y <= hb; y += hb / 400) schAll += sch(y) * hb / 400;
  const outboard = schTot / schAll;                                          // share of half-wing lift outboard of the bearing
  // masses: wing structure ∝ chord over the half, spar tube, motor+prop per wing rotor (paper Table 2 pack ratio 748 : 460 g)
  const mMotorW = r.mMotors * 0.748 / (4 * 0.748 + 2 * 0.460), mMotorT = r.mMotors * 0.460 / (4 * 0.748 + 2 * 0.460);
  let chordTot = 0; for (let i = 0; i < n; i++) chordTot += chord(ys[i]) * trib[i];
  const mSparHalf = mat.rho * s.A * (hb - y0);
  const mNode = ys.map((y, i) => (r.mWing / 2) * chord(y) * trib[i] / chordTot + mat.rho * s.A * trib[i]);
  rotIdx.forEach(k => mNode[k] += mMotorW);
  // gust load factor (F5)
  const a3 = 2 * Math.PI * p.AR / (p.AR + 2), WS = W / r.S, mu = 2 * WS / (p.rho * r.MAC * a3 * G), Kg = 0.88 * mu / (5.3 + mu);
  const Ug = sp.Ugust, Vd = 1.25 * p.Vc, dnG = p.rho * Vd * Ug * a3 * Kg / (2 * WS);
  const nCruise = Math.max(sp.nManeuver, 1 + dnG);
  const cases = {
    hover: { name: 'Hover, max thrust', n: 1, desc: `wing rotors at T/W ${fmt2(p.TW)} (${fmt2(r.TfMax)} N each), weight 1 g, wing tilted to hover` },
    cruise: { name: 'Cruise gust / manoeuvre', n: nCruise, desc: `n = ${fmt2(nCruise)} (gust ${fmt2(Ug)} m/s at ${fmt2(Vd)} m/s → Δn ${fmt2(dnG)}, manoeuvre ${fmt2(sp.nManeuver)}), Schrenk lift, inertia relief` },
    landing: { name: 'Hard landing', n: sp.nLand, desc: `${fmt2(sp.nLand)} g vertical, rotors idle, wing loads from its own masses` },
  };
  const out = { mat, fm, tube: s, ys, rotIdx, mNode, mSparHalf, outboard, dnG, nCruise, Kg, cases: {} };
  const EIw = new Array(n - 1).fill(mat.E * s.I), sigCr = 0.3 * mat.E * s.t / (s.D / 2);
  for (const [k, c] of Object.entries(cases)) {
    const F = ys.map((y, i) => -c.n * G * mNode[i]);                         // inertia (down)
    if (k === 'cruise') { const Lh = c.n * W / 2 * outboard; for (let i = 0; i < n; i++) F[i] += Lh * sch(ys[i]) * trib[i] / schTot; }
    if (k === 'hover') rotIdx.forEach(j => F[j] += r.TfMax);
    const sm = shearMoment(ys, F), fe = beamFE(ys, EIw, F);
    // torsion about the spar: section pitching moment + lift offset from the spar (cruise) / rotor thrust offset (none, on axis)
    let Tq = new Array(n).fill(0);
    if (k === 'cruise') {
      const q = 0.5 * p.rho * Vd * Vd, cm0 = polar2D('s1223', 0, r.ReC).cm, e = (0.30 - 0.25);   // lift at c/4 is 0.05 c ahead of the spar
      const tq = ys.map((y, i) => (cm0 * q * chord(y) ** 2 + (F[i] + c.n * G * mNode[i]) / Math.max(trib[i], 1e-9) * e * chord(y)) * trib[i]);
      for (let i = n - 2; i >= 0; i--) Tq[i] = Tq[i + 1] + tq[i + 1];
    }
    const sig = sm.M.map(M => Math.abs(M) * s.D / 2 / s.I), tau = Tq.map(T => Math.abs(T) * s.D / 2 / s.J);
    const vm = sig.map((v, i) => Math.sqrt(v * v + 3 * tau[i] * tau[i]));
    const vmax = Math.max(...vm), MS = mat.sig / (sp.FoS * vmax) - 1, MSb = sigCr / (sp.FoS * Math.max(...sig)) - 1;
    out.cases[k] = Object.assign({}, c, { F, V: sm.V, M: sm.M, w: fe.w, T: Tq, sig, tau, vm, vmax, MS, MSb, tip: fe.w[n - 1], rootM: sm.M[0], rootV: sm.V[0] + F[0], rootT: Tq[0] });
  }
  // tilt actuator torque: hinge moment of the wing halves about the spar from the aero model, worst over the transition
  let hinge = 0, hingeAt = null;
  const path = sp.path || [{ d: 0, V: Vd, th: 0 }, { d: 0, V: p.Vc, th: 0 }];
  for (const st of path) {
    const a = aero(r, p, { V: st.V, theta: st.th || 0, tilt: st.d, de: 0, Vpw: st.vW == null ? (st.V > 8 ? 0 : r.Vslip) : st.vW });
    const parts = a.parts.filter(x => x[0] === 'wing');
    // moment about the spar: section c_m on each part's dynamic pressure + resultant force × (AC − spar) lever (0.05 c̄ ahead)
    let hm = 0; parts.forEach(([, f], i) => { const Si = r.S * (i === 0 ? r.blown : 1 - r.blown);
      const cm = polar2D('s1223', Math.max(-15, Math.min(20, f.a2 == null ? f.a : f.a2)), r.ReC).cm;
      hm += cm * (f.q || 0) * Si * r.MAC - Math.hypot(f.Fx, f.Fz) * ((r.xLEmac + 0.25 * r.MAC) - r.xw); });
    if (Math.abs(hm) > Math.abs(hinge)) { hinge = Math.abs(hm); hingeAt = { d: st.d, V: st.V }; }
  }
  out.hinge = { M: hinge, at: hingeAt, servoNm: hinge * sp.FoS };
  // tilt shaft = spar inside the fuselage: bending from both halves' root moments is carried by the bearings (simply supported)
  const shaftM = Math.max(...Object.values(out.cases).map(c => Math.abs(c.rootM))), shaftT = out.hinge.M / 2;
  out.shaft = { M: shaftM, T: shaftT, vm: Math.sqrt((shaftM * s.D / 2 / s.I) ** 2 + 3 * (shaftT * s.D / 2 / s.J) ** 2) };
  out.shaft.MS = mat.sig / (sp.FoS * out.shaft.vm) - 1;
  // modes of one wing half (bending), and rotor excitation
  const modes = beamModes(ys, EIw, mNode, 2);
  const CT = 0.11;                                                          // static thrust coefficient, estimate for APC electric props
  const rps = T => Math.sqrt(Math.max(T, 0) / (CT * p.rho * r.Df ** 4));
  // torsion mode by Rayleigh: φ = sin(π y'/2L); rotors sit ~0.45 c + 0.1 m ahead of the spar
  const L = hb - y0, GJ = mat.G * s.J;
  let num = 0, den = 0; for (let i = 0; i < n; i++) { const yy = ys[i] - y0, ph = Math.sin(Math.PI * yy / (2 * L)), dph = Math.PI / (2 * L) * Math.cos(Math.PI * yy / (2 * L));
    num += GJ * dph * dph * trib[i]; den += (mNode[i] * (0.25 * chord(ys[i])) ** 2) * ph * ph; }
  rotIdx.forEach(k => { const yy = ys[k] - y0, ph = Math.sin(Math.PI * yy / (2 * L)), arm = 0.45 * (0.55 * r.cr + 0.1); den += mMotorW * arm * arm * ph * ph; });
  out.modes = { bend: modes.map(m => m.f), shapes: modes.map(m => m.shape), torsion: Math.sqrt(num / den) / (2 * Math.PI), rpsHover: rps(r.Tf1), rpsMax: rps(r.TfMax), CT };
  // fuselage: thin shell beam from nose to tail, loads = distributed shell mass + point masses, reactions at wing and tail axes (hover)
  // or at the landing legs (landing). Shear/moment by integration (statically determinate).
  const nf = 91, xs = []; for (let i = 0; i < nf; i++) xs.push(p.Lf * i / (nf - 1));
  const prof = xs.map(x => { const t = x / p.Lf; return (p.df / 2) * (t < 0.32 ? Math.sqrt(Math.max(0, 1 - ((0.32 - t) / 0.32) ** 2)) : t < 0.58 ? 1 : 1 - 0.72 * ((t - 0.58) / 0.42) ** 1.3); });
  const tf = sp.fusT / 1000, Iz = prof.map(R => Math.PI * Math.max(R, 0.004) ** 3 * tf);
  const fcase = (kind) => {
    const n2 = kind === 'landing' ? sp.nLand : 1, Fz = new Array(nf).fill(0), dx = p.Lf / (nf - 1);
    const shell = r.mFus;                                                    // fuselage structure spread by surface area
    const areaW = prof.map(R => R), aSum = areaW.reduce((a, b) => a + b, 0);
    for (let i = 0; i < nf; i++) Fz[i] -= n2 * G * shell * areaW[i] / aSum;
    const point = (x, m) => { const i = Math.round(x / dx); Fz[Math.max(0, Math.min(nf - 1, i))] -= n2 * G * m; };
    point(r.xcg - 0.05, r.mBatt); point(r.xcg + 0.02, p.payload); point(0.25 * p.Lf, p.elec); point(r.xw, r.mWing + 4 * mMotorW); point(r.xt, r.mTail + 2 * mMotorT);
    const tot = -Fz.reduce((a, b) => a + b, 0), mom = -Fz.reduce((a, b, i) => a + b * xs[i], 0);
    // two reactions balancing force and moment
    const [xa, xb] = kind === 'landing' ? [0.30 * p.Lf, 0.82 * p.Lf] : [r.xw, r.xt];
    const Rb = (mom - tot * xa) / (xb - xa), Ra = tot - Rb;
    Fz[Math.round(xa / dx)] += Ra; Fz[Math.round(xb / dx)] += Rb;
    const V = new Array(nf).fill(0), M = new Array(nf).fill(0);
    for (let i = 1; i < nf; i++) { V[i] = V[i - 1] + Fz[i - 1]; M[i] = M[i - 1] + V[i] * dx; }
    const sig = M.map((m, i) => Math.abs(m) * Math.max(prof[i], 0.004) / Iz[i]);
    const vmax = Math.max(...sig), MS = fm.sig / (sp.FoS * vmax) - 1;
    const sigCrF = 0.3 * fm.E * tf / (p.df / 2), MSb = sigCrF / (sp.FoS * vmax) - 1;
    return { V, M, sig, vmax, MS, MSb, Ra, Rb, xa, xb, n: n2 };
  };
  out.fus = { xs, prof, hover: fcase('hover'), landing: fcase('landing'), mShell: fm.rho * tf * Math.PI * p.df * p.Lf * 0.78 };
  // tail spar: cantilever from the tail bearing; hover = tail-rotor max thrust, cruise = max elevator lift at Vd
  const hbT = r.bh / 2, y0T = 0.25 * p.df, nt = 31, yt = []; for (let i = 0; i < nt; i++) yt.push(y0T + (hbT - y0T) * i / (nt - 1));
  const qd = 0.5 * p.rho * Vd * Vd, LtMax = qd * r.Sh * 0.9;                // C_L,t ≈ 0.9 at full elevator (NACA 0009 c_lmax, A4)
  const Ft = yt.map((y, i) => i === 0 ? 0 : LtMax / 2 / (nt - 1)); Ft[nt - 1] += Math.max(0, r.TrMax - mMotorT * G);
  const smT = shearMoment(yt, Ft), feT = beamFE(yt, new Array(nt - 1).fill(tm.E * stail.I), Ft);
  const sigT = smT.M.map(M => Math.abs(M) * stail.D / 2 / stail.I), vT = Math.max(...sigT);
  out.tail = { ys: yt, M: smT.M, sig: sigT, vmax: vT, MS: tm.sig / (sp.FoS * vT) - 1, tip: feT.w[nt - 1], LtMax, mat: tm };
  return out;
}
function fmt2(v) { return (Math.round(v * 100) / 100).toString(); }

// ---------- F8: tilt-bearing bracket, plane-stress CST finite elements ----------
// Plate W × H (mm), bearing hole of diameter Dh centred at (W/2, yc); bottom edge bolted (fixed); bearing load F (N)
// applied on the hole edge as a cosine distribution facing the load direction (ang, deg, 90 = up).
function bracketFE(o) {
  const { W, H, Dh, yc, t, E, nu, F, ang } = o, Nth = o.Nth || 64, Ns = o.Ns || 14;
  const cx = W / 2, cy = yc, R = Dh / 2, nodes = [], tri = [];
  // ray from the hole centre to the plate boundary at angle th
  const edge = th => { const dx = Math.cos(th), dy = Math.sin(th); let s = Infinity;
    if (dx > 1e-12) s = Math.min(s, (W - cx) / dx); if (dx < -1e-12) s = Math.min(s, -cx / dx);
    if (dy > 1e-12) s = Math.min(s, (H - cy) / dy); if (dy < -1e-12) s = Math.min(s, -cy / dy); return [cx + s * dx, cy + s * dy]; };
  for (let i = 0; i < Nth; i++) { const th = 2 * Math.PI * i / Nth, h = [cx + R * Math.cos(th), cy + R * Math.sin(th)], e = edge(th);
    for (let j = 0; j <= Ns; j++) { const s2 = Math.pow(j / Ns, 1.35); nodes.push([h[0] + (e[0] - h[0]) * s2, h[1] + (e[1] - h[1]) * s2, th, j]); } }
  const id = (i, j) => (i % Nth) * (Ns + 1) + j;
  for (let i = 0; i < Nth; i++) for (let j = 0; j < Ns; j++) { const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1); tri.push([a, b, c], [a, c, d]); }
  const n = nodes.length, ndof = 2 * n, Dm = E / (1 - nu * nu), D = [[Dm, Dm * nu, 0], [Dm * nu, Dm, 0], [0, 0, Dm * (1 - nu) / 2]];
  const rows = Array.from({ length: ndof }, () => new Map()), Be = [];
  for (const [a, b, c] of tri) {
    const [x1, y1] = nodes[a], [x2, y2] = nodes[b], [x3, y3] = nodes[c], A2 = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1), A = Math.abs(A2) / 2;
    const bb = [y2 - y3, y3 - y1, y1 - y2].map(v => v / A2), cc = [x3 - x2, x1 - x3, x2 - x1].map(v => v / A2);
    const B = [[bb[0], 0, bb[1], 0, bb[2], 0], [0, cc[0], 0, cc[1], 0, cc[2]], [cc[0], bb[0], cc[1], bb[1], cc[2], bb[2]]];
    Be.push({ B, A });
    const DB = D.map(r => B[0].map((_, j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
    const dof = [2 * a, 2 * a + 1, 2 * b, 2 * b + 1, 2 * c, 2 * c + 1];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { const k = t * A * (B[0][i] * DB[0][j] + B[1][i] * DB[1][j] + B[2][i] * DB[2][j]); const m = rows[dof[i]]; m.set(dof[j], (m.get(dof[j]) || 0) + k); }
  }
  // loads on the hole edge (j = 0)
  const f = new Float64Array(ndof), la = ang * d2r; let wsum = 0; const hole = [];
  for (let i = 0; i < Nth; i++) { const k = id(i, 0), w = Math.max(0, Math.cos(nodes[k][2] - la)); hole.push([k, w]); wsum += w; }
  hole.forEach(([k, w]) => { f[2 * k] += F * Math.cos(la) * w / wsum; f[2 * k + 1] += F * Math.sin(la) * w / wsum; });
  // fixed: nodes on the bolted bottom edge
  const fixed = new Uint8Array(ndof); nodes.forEach((p, k) => { if (p[1] < 1e-6) { fixed[2 * k] = 1; fixed[2 * k + 1] = 1; } });
  // CSR + Jacobi-preconditioned CG
  const Ai = [], Aj = [], Av = [], diag = new Float64Array(ndof); Ai.push(0);
  for (let r = 0; r < ndof; r++) { if (!fixed[r]) for (const [c, v] of rows[r]) if (!fixed[c]) { Aj.push(c); Av.push(v); if (c === r) diag[r] = v; } Ai.push(Aj.length); if (fixed[r]) diag[r] = 1; }
  const mul = (x, y) => { for (let r = 0; r < ndof; r++) { let s2 = 0; for (let k = Ai[r]; k < Ai[r + 1]; k++) s2 += Av[k] * x[Aj[k]]; y[r] = fixed[r] ? x[r] : s2; } };
  const u = new Float64Array(ndof), rr = new Float64Array(ndof), z = new Float64Array(ndof), pp = new Float64Array(ndof), Ap = new Float64Array(ndof);
  for (let r = 0; r < ndof; r++) { rr[r] = fixed[r] ? 0 : f[r]; z[r] = rr[r] / diag[r]; pp[r] = z[r]; }
  let rz = 0; for (let r = 0; r < ndof; r++) rz += rr[r] * z[r];
  const r0 = Math.sqrt(rr.reduce((a, v) => a + v * v, 0)); let it = 0;
  for (; it < 4 * ndof; it++) {
    mul(pp, Ap); let pAp = 0; for (let r = 0; r < ndof; r++) pAp += pp[r] * Ap[r]; const al = rz / pAp;
    let rn = 0; for (let r = 0; r < ndof; r++) { u[r] += al * pp[r]; rr[r] -= al * Ap[r]; rn += rr[r] * rr[r]; }
    if (Math.sqrt(rn) < 1e-9 * r0) break;
    let rz2 = 0; for (let r = 0; r < ndof; r++) { z[r] = rr[r] / diag[r]; rz2 += rr[r] * z[r]; } const be = rz2 / rz; rz = rz2;
    for (let r = 0; r < ndof; r++) pp[r] = z[r] + be * pp[r];
  }
  // element stresses (MPa when E in MPa, lengths in mm, F in N)
  const vm = tri.map(([a, b, c], e) => { const uu = [u[2 * a], u[2 * a + 1], u[2 * b], u[2 * b + 1], u[2 * c], u[2 * c + 1]], B = Be[e].B;
    const ex = B[0].reduce((s2, v, i) => s2 + v * uu[i], 0), ey = B[1].reduce((s2, v, i) => s2 + v * uu[i], 0), gxy = B[2].reduce((s2, v, i) => s2 + v * uu[i], 0);
    const sx = D[0][0] * ex + D[0][1] * ey, sy = D[1][0] * ex + D[1][1] * ey, txy = D[2][2] * gxy;
    return Math.sqrt(sx * sx - sx * sy + sy * sy + 3 * txy * txy); });
  const nodal = new Float64Array(n), cnt = new Float64Array(n); tri.forEach((tr, e) => tr.forEach(k => { nodal[k] += vm[e]; cnt[k]++; })); for (let k = 0; k < n; k++) nodal[k] /= cnt[k];
  let umax = 0; for (let k = 0; k < n; k++) umax = Math.max(umax, Math.hypot(u[2 * k], u[2 * k + 1]));
  return { nodes, tri, u, vm, nodal, vmax: Math.max(...vm), umax, iters: it, ndof };
}

// ---------- C1: Hess–Smith panel method on an aerofoil ----------
function panel2D(coords, alphaDeg) {
  // closed, clockwise contour (TE → lower → LE → upper → TE) so the panel's left normal (−sinθ, cosθ) points outward
  let pts = coords.map(q => q.slice());
  if (Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) > 1e-9) {   // open TE: close it at the mid point
    const m = [(pts[0][0] + pts[pts.length - 1][0]) / 2, (pts[0][1] + pts[pts.length - 1][1]) / 2]; pts[0] = m.slice(); pts[pts.length - 1] = m.slice(); }
  let area = 0; for (let i = 0; i < pts.length - 1; i++) area += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  if (area > 0) pts.reverse();
  const n = pts.length - 1, a = alphaDeg * d2r, P = [];
  for (let i = 0; i < n; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[i + 1]; P.push({ x1, y1, l: Math.hypot(x2 - x1, y2 - y1), th: Math.atan2(y2 - y1, x2 - x1), xm: (x1 + x2) / 2, ym: (y1 + y2) / 2 }); }
  // velocity at (px, py) induced by unit-strength constant source and vortex on panel j (Katz & Plotkin §10.2–10.3), global axes
  const ind = (px, py, j, self) => { const p = P[j], c = Math.cos(p.th), s2 = Math.sin(p.th), dx = px - p.x1, dy = py - p.y1, xi = dx * c + dy * s2, eta = -dx * s2 + dy * c;
    let dth, lg; if (self) { dth = Math.PI; lg = 0; } else { dth = Math.atan2(eta, xi - p.l) - Math.atan2(eta, xi); lg = Math.log(Math.hypot(xi, eta) / Math.hypot(xi - p.l, eta)); }
    const us = lg / (2 * Math.PI), ws = dth / (2 * Math.PI), uv = ws, wv = -us;
    return [us * c - ws * s2, us * s2 + ws * c, uv * c - wv * s2, uv * s2 + wv * c]; };
  const Nv = P.map(p => [-Math.sin(p.th), Math.cos(p.th)]), Tv = P.map(p => [Math.cos(p.th), Math.sin(p.th)]), Vi = [Math.cos(a), Math.sin(a)];
  const Sn = [], St = [], Vn = [], Vt = [];
  for (let i = 0; i < n; i++) { Sn.push(new Float64Array(n)); St.push(new Float64Array(n)); Vn.push(new Float64Array(n)); Vt.push(new Float64Array(n));
    for (let j = 0; j < n; j++) { const [su, sv, vu, vv] = ind(P[i].xm, P[i].ym, j, i === j);
      Sn[i][j] = su * Nv[i][0] + sv * Nv[i][1]; St[i][j] = su * Tv[i][0] + sv * Tv[i][1]; Vn[i][j] = vu * Nv[i][0] + vv * Nv[i][1]; Vt[i][j] = vu * Tv[i][0] + vv * Tv[i][1]; } }
  const N1 = n + 1, A = Array.from({ length: N1 }, () => new Array(N1).fill(0)), rhs = new Array(N1).fill(0);
  for (let i = 0; i < n; i++) { let sv = 0; for (let j = 0; j < n; j++) { A[i][j] = Sn[i][j]; sv += Vn[i][j]; } A[i][n] = sv; rhs[i] = -(Nv[i][0] * Vi[0] + Nv[i][1] * Vi[1]); }
  for (const i of [0, n - 1]) { let sv = 0; for (let j = 0; j < n; j++) { A[n][j] += St[i][j]; sv += Vt[i][j]; } A[n][n] += sv; rhs[n] -= Tv[i][0] * Vi[0] + Tv[i][1] * Vi[1]; }
  const sol = solveDense(A, rhs), q = sol.slice(0, n), g = sol[n];
  const cp = P.map((p, i) => { let vt = Tv[i][0] * Vi[0] + Tv[i][1] * Vi[1]; for (let j = 0; j < n; j++) vt += St[i][j] * q[j] + g * Vt[i][j];
    return { x: p.xm, y: p.ym, cp: 1 - vt * vt, vt, upper: Nv[i][1] > 0 }; });
  let fx = 0, fy = 0, m = 0; cp.forEach((c, i) => { const f1 = -c.cp * Nv[i][0] * P[i].l, f2 = -c.cp * Nv[i][1] * P[i].l; fx += f1; fy += f2; m += -(c.x - 0.25) * f2 + c.y * f1; });
  const cl = fy * Math.cos(a) - fx * Math.sin(a);
  const vel = (x, y) => { let u = Vi[0], v = Vi[1]; for (let j = 0; j < n; j++) { const r = ind(x, y, j, false); u += q[j] * r[0] + g * r[2]; v += q[j] * r[1] + g * r[3]; } return [u, v]; };
  const inside = (x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  return { cp, cl, cm: m, gamma: g, vel, inside, n, P, pts };
}

const api = { G, MU, IN, PAPER, INPUTS, AERO, MATERIALS, bracketFE, panel2D, fea, beamFE, beamModes, tube, isa, defaults, induced, flightForces, tMax, pitchAuthority, trimLevel, corridor, simulate, hoverTilt, setAirfoils, polar2D, clmax2D, size, aero, aeroWing, stability, surfaceForce };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TW = api;
})(typeof window !== 'undefined' ? window : globalThis);
