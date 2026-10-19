/* Flight model + flight-control system + autopilot + flight commands. Owned by the flight engineer.
   Pure simulation: never touches the DOM or three.js scene objects (THREE is used for vector maths only).
   Talks to the rest of the app via S (state.js) and the event bus: emit('toast'|'crash'|'touchdown').
   Additive changes only to the exported API.

   ── Model overview ─────────────────────────────────────────────────────────────────────────────
   Time      step(frameDt) feeds a fixed-step accumulator (SIM.hz = 120 Hz). Each simStep() is
             deterministic given S + input; pause / time-scale are S.paused / S.timeScale. After the
             loop, the render pose (S.pos/psi/pitch/roll) is interpolated between the last two steps.
   Body      Point mass with attitude (psi, theta, phi). Forces in world frame: gravity, wing lift and
             drag from a CL(alpha) polar (stall + post-stall), induced drag, side force, rotor thrust along
             body-up, pusher thrust along body-forward, rotor ram drag, ground reaction / friction.
   Air       Air-relative velocity = inertial velocity − (wind(h) + Dryden-style gusts on the sim clock).
             Density lapses with altitude (ISA troposphere). IAS = TAS·sqrt(rho/rho0).
   Rotors    8 rotors, thrust ∝ rpm² capped by health, gated on electrical power each step. The FCS
             allocates collective + zero roll/pitch/yaw moment over the rotors it *believes* are healthy
             (belief lags a failure by ROTOR.faultDetect); leftover moments become attitude excursions.
             Induced power from momentum theory (Glauert inflow) / figure of merit + profile power.
   Battery   Open-circuit voltage vs SOC, internal resistance, current limit, thermal derate and a
             progressive cut-off near empty → available power. Demand above it is shed (prop first).
   FCS       Vertical-speed command → collective (fast) + wing alpha via pitch (slow, alpha-protected).
             Hover: translational-rate command (ground velocity) with integrator → tilt. Wing-borne:
             bank-to-turn with coordinated yaw. A transition corridor limits pitch/alpha by wing fraction.
   Stow      HOVER→TRANSITION→CRUISE→RECONVERSION with airspeed-only hysteresis, unlock + spin-up delay,
             deployment speed limit and a low-energy emergency deploy.
   Contact   Each touchdown is classified (normal/firm/hard/crash) from sink rate, ground speed,
             attitude and gear; buildings and hills (from the 'colliders' event) are collidable;
             roofs are landable. A crash freezes the sim until reset. */
import {
  G, UNITS, PHYS as P, WIND_DIR, BATTERY_KWH, SIM, AIRFRAME as AF, ROTOR as RT, PROP as PR,
  PACK, SPEEDS as V, CRASH, ATMOS, BODY_HEIGHT,
} from './config.js';
import { clamp, lerp, emit, on } from './util.js';

const V3 = THREE.Vector3;
const H = 1 / SIM.hz;
const MASS = AF.mass, WEIGHT = MASS * G;
const T_ROTOR_SL = P.rotorMaxLift * WEIGHT / 8;           // N per healthy rotor at sea level, full rpm
const ROTOR_AREA = Math.PI * (RT.diameter / 2) ** 2;
const PROP_AREA = Math.PI * (PR.diameter / 2) ** 2;
const ALPHA_STALL = (AF.clMax - AF.cl0) / AF.clAlpha;      // ≈ 0.23 rad
const ALPHA_NEG_STALL = (AF.clMin - AF.cl0) / AF.clAlpha;
const ALPHA_PROT = (AF.alphaProtFrac * AF.clMax - AF.cl0) / AF.clAlpha;
const DEG = 180 / Math.PI;

const toast = msg => { if (msg) emit('toast', msg); };
const smooth01 = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Manual-flight keys; pressing any of them disengages the autopilot. */
export const MANUAL_KEYS = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF'];

/* Scratch objects (no per-step allocation). */
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const fb = new V3(), ub = new V3(), rb = new V3();          // body forward / up / right (world)
const wind = new V3(), va = new V3(), vaXZ = new V3(), tmp = new V3(), acc = new V3();
const liftA = new V3(), dragA = new V3();
const caps = new Float64Array(8), tCmd = new Float64Array(8), tAct = new Float64Array(8);

/* ═════════════════════════════ Collision world ═════════════════════════════
   boxes: [{x, z, hw, hd, rot, h}] — building footprints (half-widths along local x/z, yaw rot, height).
   cones: [{x, z, r, h}]           — hills (radius at ground, apex height).
   Provided by world.js via emit('colliders', {boxes, cones}) or setColliders(). Until then: flat ground. */
let colliders = { boxes: [], cones: [] };
export function setColliders(c = {}) {
  colliders = { boxes: Array.isArray(c.boxes) ? c.boxes : [], cones: Array.isArray(c.cones) ? c.cones : [] };
}
on('colliders', setColliders);

/** Helper for world.js / main.js: read collider data from an InstancedMesh whose unit geometry spans
    x,z ∈ [-0.5,0.5], y ∈ [0,1] ('box') or a unit cone with base radius 1, height 1 ('cone').
    Reads instance matrices only; does not modify the mesh. */
export function collidersFromInstances(mesh, kind) {
  const out = [], m = new THREE.Matrix4(), p = new V3(), q = new THREE.Quaternion(), s = new V3(), e = new THREE.Euler(0, 0, 0, 'YXZ');
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m); m.decompose(p, q, s); e.setFromQuaternion(q, 'YXZ');
    if (kind === 'cone') out.push({ x: p.x, z: p.z, r: s.x, h: s.y });
    else out.push({ x: p.x, z: p.z, hw: s.x / 2, hd: s.z / 2, rot: e.y, h: s.y });
  }
  return out;
}

/** Is (x,z) inside box b's footprint grown by `margin`? */
function inFootprint(b, x, z, margin) {
  const dx = x - b.x, dz = z - b.z;
  if (Math.abs(dx) > b.hw + b.hd + margin || Math.abs(dz) > b.hw + b.hd + margin) return false;
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= b.hw + margin && Math.abs(lz) <= b.hd + margin;
}

/** Surface height under (x,z) for an aircraft whose wheels are at height y: ground plane, hills, or a
    roof the aircraft is above. Returns {h, kind: 'ground'|'roof'|'terrain'}. */
export function groundHeightAt(x, z, y = Infinity) {
  let h = 0, kind = 'ground';
  for (const c of colliders.cones) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < c.r) { const ch = c.h * (1 - d / c.r); if (ch > h) { h = ch; kind = 'terrain'; } }
  }
  for (const b of colliders.boxes) {
    if (b.h > h && y >= b.h - 0.6 && inFootprint(b, x, z, 0)) { h = b.h; kind = 'roof'; }
  }
  return { h, kind };
}

/** True if the airframe (centre + CRASH.bodyRadius) intersects a building below its roof line. */
function hitsBuilding(x, y, z) {
  const yc = y + BODY_HEIGHT * 0.5;
  for (const b of colliders.boxes) {
    if (yc < b.h - 0.3 && inFootprint(b, x, z, CRASH.bodyRadius)) return true;
  }
  return false;
}

/* ═════════════════════════════ Small helpers ═════════════════════════════ */

/** ISA troposphere density, kg/m^3. */
const densityAt = h => ATMOS.rho0 * Math.pow(clamp(1 - 2.2558e-5 * Math.max(0, h), 0.2, 1), 4.256);

/** Seeded standard normal from the sim's own Park–Miller stream (deterministic replay). */
function gauss(m) {
  const u1 = (m.rngState = (m.rngState * 16807) % 2147483647) / 2147483647;
  const u2 = (m.rngState = (m.rngState * 16807) % 2147483647) / 2147483647;
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-12))) * Math.cos(2 * Math.PI * u2);
}

/** Lift coefficient: linear to ±stall, then a post-stall drop blending into flat-plate behaviour. */
function clOf(a) {
  const pre = clamp(AF.cl0 + AF.clAlpha * a, AF.clMin, AF.clMax);
  const sig = a >= 0 ? smooth01(ALPHA_STALL, ALPHA_STALL + 0.15, a) : smooth01(-ALPHA_NEG_STALL, -ALPHA_NEG_STALL + 0.15, -a);
  return (1 - sig) * pre + sig * 1.05 * Math.sin(2 * a);
}
function cdOf(a, cl, extra) {
  const sig = a >= 0 ? smooth01(ALPHA_STALL, ALPHA_STALL + 0.15, a) : smooth01(-ALPHA_NEG_STALL, -ALPHA_NEG_STALL + 0.15, -a);
  const pre = AF.cd0 + AF.k * cl * cl, fp = AF.cd0 + 1.2 * Math.sin(a) ** 2;
  const rev = Math.abs(a) > Math.PI / 2 ? AF.cdReverse : 0;
  return (1 - sig) * pre + sig * fp + extra + rev;
}

/** Pack open-circuit voltage vs state of charge (knee near empty). */
const packVoc = soc => PACK.vMax - 120 * (1 - soc) - 80 * Math.exp(-Math.max(soc, 0) / 0.04);

/** Max electrical power (kW) the pack can deliver now: current limit, cut-off voltage, thermal derate,
    progressive cut near empty. */
function packPowerAvail(S) {
  if (S.battery <= 0) return 0;
  const voc = packVoc(S.battery);
  let p = Math.min(PACK.iMax * (voc - PACK.iMax * PACK.rInt), PACK.vCut * (voc - PACK.vCut) / PACK.rInt) / 1000;
  p *= 1 - 0.5 * clamp((S.batTemp - PACK.tempLimit) / (PACK.tempMax - PACK.tempLimit), 0, 1);
  if (S.battery < PACK.cutoffSoc) p *= S.battery / PACK.cutoffSoc;
  return Math.max(0, p);
}

/** Ideal induced velocity of a rotor/prop disc (Glauert), m/s. vPlane = edgewise airspeed, vAxial = climb. */
function inducedVel(T, rho, area, vPlane, vAxial) {
  if (T <= 0) return 0;
  const vh2 = T / (2 * rho * area), vh = Math.sqrt(vh2);
  const vc = Math.max(vAxial, -0.9 * vh);    // momentum theory is invalid deep in VRS: clamp
  let vi = vh;
  for (let i = 0; i < 4; i++) vi = 0.5 * vi + 0.5 * vh2 / Math.max(0.1, Math.hypot(vPlane, vc + vi));
  return vi;
}

/** Electrical power (kW) needed to hover out of ground effect with the healthy rotors at the current
    density: momentum-theory induced power / figure of merit + profile + base load. */
export function hoverPowerKw(S) {
  const rho = densityAt(S.pos.y), alive = S.rotors.filter(r => r.health > 0).length;
  if (!alive) return Infinity;
  const tI = WEIGHT / alive, vh = Math.sqrt(tI / (2 * rho * ROTOR_AREA));
  const rpm = RT.idleRpm + (1 - RT.idleRpm) * Math.sqrt(clamp(tI / (T_ROTOR_SL * rho / ATMOS.rho0), 0, 1));
  return (WEIGHT * vh / RT.figureOfMerit + alive * RT.profileKw * 1000 * rpm ** 3) / PACK.motorEff / 1000 + PACK.baseKw;
}

/** Total lift (g) the healthy rotors could make at the current density (ignores spool / power). */
export function rotorCapacityG(S) {
  const sig = densityAt(S.pos.y) / ATMOS.rho0;
  return S.rotors.reduce((a, r) => a + Math.max(0, r.health), 0) * T_ROTOR_SL * sig / WEIGHT;
}

/* Small 4x4 linear solve (Gaussian elimination, partial pivoting). A is a flat 16-array; b length 4. */
function solve4(A, b) {
  for (let c = 0; c < 4; c++) {
    let p = c; for (let r = c + 1; r < 4; r++) if (Math.abs(A[r * 4 + c]) > Math.abs(A[p * 4 + c])) p = r;
    if (p !== c) { for (let k = 0; k < 4; k++) { const t = A[c * 4 + k]; A[c * 4 + k] = A[p * 4 + k]; A[p * 4 + k] = t; } const t = b[c]; b[c] = b[p]; b[p] = t; }
    const d = A[c * 4 + c] || 1e-9;
    for (let r = c + 1; r < 4; r++) { const f = A[r * 4 + c] / d; for (let k = c; k < 4; k++) A[r * 4 + k] -= f * A[c * 4 + k]; b[r] -= f * b[c]; }
  }
  for (let r = 3; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < 4; k++) s -= A[r * 4 + k] * b[k]; b[r] = s / (A[r * 4 + r] || 1e-9); }
  return b;
}

/** Control allocation: distribute `total` N over rotors with per-rotor limits `cap`, with zero roll,
    pitch and yaw moment where feasible (min-norm deviation from proportional sharing, saturation by
    active-set iteration). Rows: Σt, Σt·x, Σt·z, Σt·dir (normalised). Result in `out`. */
const _A = new Float64Array(16), _b = new Float64Array(4), _row = new Float64Array(32), _fixed = new Uint8Array(8);
function allocate(rotors, total, cap, out) {
  let capSum = 0; for (let i = 0; i < 8; i++) capSum += cap[i];
  total = Math.min(total, capSum);
  if (total <= 0 || capSum <= 0) { out.fill(0); return; }
  for (let i = 0; i < 8; i++) {
    out[i] = total * cap[i] / capSum; _fixed[i] = cap[i] <= 0 ? 1 : 0;
    const r = rotors[i];
    _row[i] = 1; _row[8 + i] = r.x / 4.8; _row[16 + i] = r.z / 3; _row[24 + i] = r.dir * 0.5;
  }
  for (let iter = 0; iter < 5; iter++) {
    // residual b − B·t
    _b[0] = total; _b[1] = 0; _b[2] = 0; _b[3] = 0;
    for (let i = 0; i < 8; i++) for (let k = 0; k < 4; k++) _b[k] -= _row[k * 8 + i] * out[i];
    // (B_F B_Fᵀ + εI) λ = residual
    for (let a = 0; a < 4; a++) for (let c = 0; c < 4; c++) {
      let s = a === c ? 1e-3 : 0;
      for (let i = 0; i < 8; i++) if (!_fixed[i]) s += _row[a * 8 + i] * _row[c * 8 + i];
      _A[a * 4 + c] = s;
    }
    const lam = solve4(_A, _b);
    let clampedNew = false;
    for (let i = 0; i < 8; i++) {
      if (_fixed[i]) continue;
      let d = 0; for (let k = 0; k < 4; k++) d += _row[k * 8 + i] * lam[k];
      out[i] += d;
      if (out[i] < 0) { out[i] = 0; _fixed[i] = 1; clampedNew = true; }
      else if (out[i] > cap[i]) { out[i] = cap[i]; _fixed[i] = 1; clampedNew = true; }
    }
    if (!clampedNew) break;
  }
}

/* ═════════════════════════════ Frame entry point ═════════════════════════════ */

/**
 * Advance the simulation by one *frame* of real time. Runs as many fixed 1/SIM.hz steps as the
 * accumulator allows (scaled by S.timeScale, nothing while S.paused or S.crashed), then interpolates the
 * render pose and refreshes S.warnings. Safe to call with any dt (negative/NaN treated as 0).
 * @param {number} dt  real seconds since the last call
 * @param {object} S   shared state (state.js)
 * @param {{keys:Set<string>}} input  held KeyboardEvent.code values (input.js)
 */
export function step(dt, S, input) {
  const m = S.sim;
  S.frameSimDt = 0;
  dt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, SIM.maxFrameDt) : 0;
  if (!S.paused && !S.crashed) {
    const ts = Number.isFinite(S.timeScale) ? clamp(S.timeScale, 0.05, 8) : 1;
    m.acc += dt * ts;
    let n = 0;
    while (m.acc >= H) {
      if (n >= SIM.maxStepsPerFrame) { m.acc = 0; break; } // can't keep up: drop the backlog
      savePrev(m);
      simStep(H, S, input || { keys: new Set() });
      m.acc -= H; n++; S.frameSimDt += H;
      if (S.crashed) { m.acc = 0; break; }
    }
  }
  if (S.crashed) { S.u = S.v = S.w = S.vs = 0; S.ias = S.tas = S.gs = 0; S.gamma = 0; }   // frozen wreck reads zero
  S.interp = S.crashed ? 1 : clamp(m.acc / H, 0, 1);
  writeRenderPose(S, S.interp);
  updateWarnings(S);
}
/** Alias of step() with a clearer name for the integrator. */
export const advance = step;

function savePrev(m) { m.prevPos.copy(m.pos); m.prevPsi = m.psi; m.prevTheta = m.theta; m.prevPhi = m.phi; }
function writeRenderPose(S, a) {
  const m = S.sim;
  S.pos.lerpVectors(m.prevPos, m.pos, a);
  S.psi = lerp(m.prevPsi, m.psi, a); S.pitch = lerp(m.prevTheta, m.theta, a); S.roll = lerp(m.prevPhi, m.phi, a);
}

/* ═════════════════════════════ One fixed step ═════════════════════════════ */

/**
 * One deterministic fixed step of the flight model (exported for tests; the app uses step()).
 * Writes the true state in S.sim and the derived public fields of S. Never touches the DOM.
 */
export function simStep(h, S, input) {
  const m = S.sim;
  S.t += h; m.apT += h; m.sinceStowChange += h;

  /* ---------- Pilot input ---------- */
  // Analog sticks (input.axes, -1..1) are read directly; claim them so input.keys.has() reports real keys only.
  const ax = input.axes;
  if (ax && 'analogConsumed' in input) input.analogConsumed = true;
  const k = c => (input.keys.has(c) ? 1 : 0);
  const an = n => (ax && Number.isFinite(ax[n]) ? ax[n] : 0);
  const pil = {
    fwd: clamp(k('KeyW') - k('KeyS') + an('fwd'), -1, 1), yaw: clamp(k('KeyA') - k('KeyD') + an('yaw'), -1, 1),
    strafe: clamp(k('KeyE') - k('KeyQ') + an('strafe'), -1, 1), climb: clamp(k('KeyR') - k('KeyF') + an('climb'), -1, 1),
  };
  const td = (k('ArrowUp') - k('ArrowDown')) * P.throttleRate * h;
  if (td) { S.thr = clamp(S.thr + td, 0, 1); toast(pilotThrottleOverride(S)); }

  const powered = S.master && S.battery > 0;
  const pos = m.pos, vel = m.vel;

  /* ---------- Atmosphere, wind, gusts ---------- */
  const gnd = groundHeightAt(pos.x, pos.z, pos.y);
  m.groundH = gnd.h;
  const agl = Math.max(0, pos.y - gnd.h);
  const rho = densityAt(pos.y), sig = rho / ATMOS.rho0;
  const wdir = Number.isFinite(S.windDir) ? S.windDir : WIND_DIR;
  const wMean = Math.max(0, S.wind || 0) * clamp(Math.pow(Math.max(agl, 1) / ATMOS.windRefHeight, ATMOS.windShearExp), 0.5, 1.4);
  updateGusts(m, h, Math.max(0, S.wind || 0), Math.max(5, S.tas || 0), agl);
  wind.set(Math.sin(wdir) * wMean, 0, Math.cos(wdir) * wMean).add(m.gust);
  if (S.onGround) wind.y = 0;

  /* ---------- Body axes & air data ---------- */
  _e.set(m.theta, m.psi, m.phi, 'YXZ'); _q.setFromEuler(_e);
  fb.set(0, 0, -1).applyQuaternion(_q); ub.set(0, 1, 0).applyQuaternion(_q); rb.set(1, 0, 0).applyQuaternion(_q);
  const sp = Math.sin(m.psi), cp = Math.cos(m.psi);
  const fhx = -sp, fhz = -cp, rhx = cp, rhz = -sp;            // horizontal heading frame
  va.copy(vel).sub(wind);
  const axb = va.dot(fb), ayb = va.dot(rb), azb = va.dot(ub);
  const tas = va.length(), ias = tas * Math.sqrt(sig);
  const vxz2 = axb * axb + azb * azb, vxz = Math.sqrt(vxz2);
  const alpha = vxz > 0.5 ? Math.atan2(-azb, axb) : 0;
  const beta = Math.atan2(ayb, Math.max(Math.abs(axb), 1));
  const vaH = Math.hypot(va.x, va.z);
  const gammaAir = Math.atan2(va.y, Math.max(vaH, 1));
  const ug = vel.x * fhx + vel.z * fhz, vg = vel.x * rhx + vel.z * rhz; // body-frame ground velocity
  const uAirH = va.x * fhx + va.z * fhz;

  /* ---------- Aerodynamics (with the current attitude) ---------- */
  const qbar = 0.5 * rho * vxz2;
  const cl = clOf(alpha);
  const cd = cdOf(alpha, cl, AF.cdGear * S.gearAnim + (S.stowed ? 0 : AF.cdRotorsOut));
  liftA.set(0, 0, 0); dragA.set(0, 0, 0);
  if (vxz > 0.3) {
    vaXZ.copy(fb).multiplyScalar(axb).addScaledVector(ub, azb);
    tmp.crossVectors(rb, vaXZ).normalize();                       // lift ⟂ airflow, in the symmetry plane
    liftA.copy(tmp).multiplyScalar(qbar * AF.wingArea * cl / MASS);
    dragA.copy(vaXZ).multiplyScalar(-qbar * AF.wingArea * cd / MASS / vxz);
  }
  dragA.addScaledVector(rb, -0.5 * rho * Math.abs(ayb) * ayb * AF.sideCdA / MASS);   // side force
  // Rotor H-force / ram drag on the in-plane air velocity (uses last step's rotor lift)
  tmp.copy(va).addScaledVector(ub, -azb);
  dragA.addScaledVector(tmp, -RT.ramDrag * S.rotorLift);

  /* ---------- Wing fraction & rotor availability ---------- */
  const wf = smooth01(10, V.vUnstow, ias);
  const capG = rotorCapacityG(S);
  const rotorsUsable = powered && S.liftOn && !S.stowed && m.unlockT <= 0;
  const wfEff = (rotorsUsable || S.stowed) ? wf : (ias > 8 ? 1 : wf); // without rotors the wing does all it can

  /* ---------- Guidance: pilot or autopilot → targets ---------- */
  const gd = {
    vsT: pil.climb * P.climbRate,
    trcX: S.thr > 0.1 ? null : pil.fwd * V.hoverMax,     // ground-velocity command (hover TRC) or null
    accX: pil.fwd * P.hoverAccel,                        // acceleration command when TRC is off
    trcY: pil.strafe * V.hoverMax * 0.6,
    yaw: pil.yaw, bank: pil.yaw * AF.maxBank,
    thr: S.thr, brake: pil.fwd < 0 && wf > 0.5, rotate: pil.climb > 0,
  };
  autopilot(S, h, gd, { agl, ias, wf, capG, powered, ug, vg });

  // Envelope protection on the vertical command
  if (wf < 0.5 && vaH < V.vrsSpeed && !S.stowed) gd.vsT = Math.max(gd.vsT, -V.vrsSinkLimit);   // VRS
  if (pos.y > P.ceiling) gd.vsT = Math.min(gd.vsT, 0.5 * (P.ceiling - pos.y));                // soft ceiling
  S.altLimited = pos.y > P.ceiling - 5 && gd.vsT <= 0 && pil.climb > 0;

  /* ---------- Vertical channel ---------- */
  if (S.onGround) m.vsI = 0;
  else m.vsI = clamp(m.vsI + 0.6 * (gd.vsT - vel.y) * h, -1.5, 1.5);
  const aZcmd = clamp(2.45 * (gd.vsT - vel.y) + m.vsI, -4, 4);

  /* ---------- Prop (pusher) thrust request ---------- */
  const propTarget = (powered && S.cruiseOn) ? P.propIdle + (1 - P.propIdle) * clamp(gd.thr, 0, 1) : 0;
  S.prop.rpm = lerp(S.prop.rpm, propTarget, Math.min(1, h * P.propSpool));
  const vAx = Math.max(0, axb);
  let tProp = 0;
  if (powered && S.cruiseOn) {
    const tAvail = Math.min(PR.staticThrust * sig, PR.eta * PR.maxShaftKw * 1000 / Math.max(vAx, 1));
    tProp = tAvail * clamp((S.prop.rpm - P.propIdle) / (1 - P.propIdle), 0, 1);
    if (gd.brake && tProp < 1 && vAx > 15) tProp = -PR.brakeThrust * WEIGHT * sig;     // windmill / regen braking
  }

  /* ---------- Attitude targets (FCS) ---------- */
  // Hover: translational-rate command → acceleration → tilt (with aero feed-forward and integrator)
  const hb = 1 - wfEff;
  let aX, aY;
  if (gd.trcX !== null) {
    const e = gd.trcX - ug;
    m.trcIx = clamp(m.trcIx + 0.35 * e * h * hb, -2.5, 2.5);
    aX = 0.8 * e + m.trcIx;
  } else { aX = gd.accX; m.trcIx *= 1 - h; }
  { const e = gd.trcY - vg; m.trcIy = clamp(m.trcIy + 0.35 * e * h * hb, -2.5, 2.5); aY = 0.8 * e + m.trcIy; }
  if (uAirH < -V.rearMax) aX = Math.max(aX, 1.5 * (-V.rearMax - uAirH));            // rearward-speed protection
  aX = clamp(aX, -P.hoverAccel, P.hoverAccel); aY = clamp(aY, -P.hoverAccel, P.hoverAccel);
  if (S.onGround || wfEff > 0.9) { m.trcIx *= 1 - 2 * h; m.trcIy *= 1 - 2 * h; }
  const aeroX = (m.aeroAccel.x * fhx + m.aeroAccel.z * fhz), aeroY = (m.aeroAccel.x * rhx + m.aeroAccel.z * rhz);
  const thHover = -Math.atan((aX - aeroX * (gd.trcX !== null ? 1 : 0)) / G);
  const phHover = -Math.atan((aY - aeroY) / G);

  // Wing: alpha needed for the vertical command, alpha-protected and limited by the transition corridor
  const qS = qbar * AF.wingArea / MASS;
  const propVert = tProp / MASS * fb.y;
  const needVert = G + aZcmd - propVert - dragA.y;
  const cosBank = Math.max(0.5, Math.cos(m.phi)), cosGam = Math.max(0.5, Math.cos(gammaAir));
  const clReq = qS > 0.05 ? needVert / (qS * cosBank * cosGam) : AF.clMax;
  const alphaCap = rotorsUsable ? lerp(0.04, ALPHA_PROT, wf) : ALPHA_PROT;
  const alphaCmd = clamp((clReq - AF.cl0) / AF.clAlpha, ALPHA_NEG_STALL * 0.8, alphaCap);
  const thWing = (wfEff > 0.8 ? gammaAir : clamp(gammaAir, -0.35, 0.35)) + alphaCmd;  // alpha = theta - gamma

  let thT = clamp(hb * thHover + wfEff * thWing,
    lerp(-AF.hoverTiltMax, AF.pitchMin, wfEff), lerp(0.12, AF.pitchMax, wfEff));
  let phT = clamp(hb * clamp(phHover, -AF.hoverTiltMax, AF.hoverTiltMax) + wfEff * gd.bank, -AF.bankLimit, AF.bankLimit);
  thT = clamp(thT, -AF.hoverTiltMax - 0.05, AF.pitchMax);
  if (S.onGround) { phT = 0; thT = (ias > V.vr && gd.rotate) ? AF.rotation : 0; }

  /* ---------- Lift rotors: collective, allocation, rpm, thrust ---------- */
  const tNom = T_ROTOR_SL * sig;
  S.spool = clamp(S.spool + ((powered && S.liftOn) ? P.spoolUp : -P.spoolDown) * h, 0, 1);
  if (m.unlockT > 0) m.unlockT -= h;
  // FCS fault detection lags real health
  for (let i = 0; i < 8; i++) {
    const real = S.rotors[i].health;
    m.fcsHealth[i] = real > m.fcsHealth[i] ? real : lerp(m.fcsHealth[i], real, Math.min(1, h / RT.faultDetect));
    if (m.fcsHealth[i] - real < 0.02) m.fcsHealth[i] = real;
  }
  const tiltCos = Math.max(0.5, Math.cos(m.theta) * Math.cos(m.phi));
  let collG = (G + aZcmd - liftA.y - dragA.y - propVert) / (G * tiltCos);
  if (S.onGround && gd.vsT <= 0) collG = 0;
  collG = clamp(collG, 0, P.rotorMaxLift * sig);
  S.rotorCmd = collG;
  for (let i = 0; i < 8; i++) caps[i] = rotorsUsable ? tNom * m.fcsHealth[i] * S.spool * S.spool : 0;
  allocate(S.rotors, collG * WEIGHT, caps, tCmd);

  // VRS: thrust loss in a steep descent through the rotor's own wake at low edgewise speed
  const vh0 = Math.sqrt(Math.max(S.rotorLift, 0.2) * WEIGHT / 8 / (2 * rho * ROTOR_AREA));
  const sinkAir = -va.y;
  S.vrs = (S.rotorLift > 0.25 && !S.stowed) ? smooth01(0.35 * vh0, 0.7 * vh0, sinkAir) * (1 - smooth01(0.6 * V.vrsSpeed, V.vrsSpeed, vaH)) : 0;

  let tSum = 0;
  for (let i = 0; i < 8; i++) {
    const r = S.rotors[i];
    const alive = r.health > 0;
    let target = 0, rate = RT.rpmDecay;
    if (rotorsUsable && alive) {
      target = S.spool * (RT.idleRpm + (1 - RT.idleRpm) * Math.sqrt(clamp(tCmd[i] / tNom, 0, 1)));
      rate = target > r.rpm ? RT.rpmUp : RT.rpmDown;
    } else if (S.stowed) rate = RT.rpmDown * 1.5;   // braked to a stop, then locked
    r.rpm = lerp(r.rpm, target, Math.min(1, rate * h));
    if (r.rpm < 1e-4) r.rpm = 0;
    let t;
    if (rotorsUsable && alive) t = Math.min(tCmd[i], tNom * r.health, tNom * r.rpm * r.rpm);
    else t = S.stowed ? 0 : RT.windmillThrust * tNom * r.rpm * r.rpm;   // unpowered / dead: residual only
    tAct[i] = t * (1 - 0.3 * S.vrs);
    tSum += tAct[i];
  }

  /* ---------- Power & battery (shed load above what the pack can deliver) ---------- */
  const vPlane = Math.hypot(axb, ayb);
  let pRot = 0;
  for (let i = 0; i < 8; i++) {
    const t = tAct[i];
    const vi = inducedVel(t, rho, ROTOR_AREA, vPlane, azb);
    pRot += t * Math.max(0.2 * vi, azb + vi) / RT.figureOfMerit + RT.profileKw * 1000 * S.rotors[i].rpm ** 3 * (S.rotors[i].health > 0 && rotorsUsable ? 1 : 0);
  }
  let pProp = 0;
  if (tProp > 0) pProp = tProp * (vAx + inducedVel(tProp, rho, PROP_AREA, 0, vAx)) / PR.eta;
  let pElec = powered ? ((pRot + pProp) / PACK.motorEff) / 1000 + PACK.baseKw : 0;   // kW
  const pAvail = powered ? packPowerAvail(S) : 0;
  S.powerAvail = pAvail; S.powerLimited = false;
  if (powered && pElec > pAvail) {
    S.powerLimited = true;
    let over = pElec - pAvail;
    const propKw = pProp / PACK.motorEff / 1000, rotKw = pRot / PACK.motorEff / 1000;
    if (propKw > 0) { const cut = Math.min(over, propKw); tProp *= (propKw - cut) / propKw; over -= cut; }
    if (over > 0 && rotKw > 0) {
      const f = Math.pow(clamp((rotKw - over) / rotKw, 0, 1), 2 / 3);
      for (let i = 0; i < 8; i++) tAct[i] *= f;
      tSum *= f;
    }
    pElec = pAvail;
  }
  S.prop.thrust = tProp / (PR.staticThrust || 1);
  for (let i = 0; i < 8; i++) S.rotors[i].thrust = tAct[i] / T_ROTOR_SL;
  S.power = pElec;
  if (powered) {
    const voc = packVoc(S.battery), disc = voc * voc - 4 * PACK.rInt * pElec * 1000;
    S.packI = disc > 0 ? (voc - Math.sqrt(disc)) / (2 * PACK.rInt) : PACK.iMax;
    S.packV = voc - S.packI * PACK.rInt;
  } else { S.packI = 0; S.packV = packVoc(S.battery); }
  S.batTemp += ((S.packI * S.packI * PACK.rInt) - PACK.coolW * (S.batTemp - PACK.tempAmbient)) / PACK.heatCap * h;
  const wasCharged = S.battery > 0;
  S.battery = Math.max(0, S.battery - pElec * h / 3600 / BATTERY_KWH);
  // Below PACK.emptySoc the pack can no longer hold the cut-off voltage under any load: the BMS disconnects.
  if (S.battery <= PACK.emptySoc) S.battery = 0;
  if (wasCharged && S.battery <= 0) toast('Battery depleted — power lost');
  m.powerAvg = lerp(m.powerAvg || pElec, pElec, Math.min(1, h / 20));
  S.powerAvg = m.powerAvg;

  /* ---------- Residual moments → attitude disturbance (failures, saturation) ---------- */
  let mRoll = 0, mPitch = 0, mYaw = 0;
  for (let i = 0; i < 8; i++) { const r = S.rotors[i]; mRoll += tAct[i] * r.x; mPitch -= tAct[i] * r.z; mYaw -= tAct[i] * r.dir; }
  const tNorm = tSum + 0.05 * WEIGHT;
  const rollDist = 1.5 * mRoll / (tNorm * 4.8), pitchDist = 1.5 * mPitch / (tNorm * 3), yawDist = 0.2 * mYaw / tNorm;

  /* ---------- Forces → acceleration ---------- */
  acc.set(0, -G, 0).add(liftA).add(dragA)
    .addScaledVector(ub, tSum / MASS).addScaledVector(fb, tProp / MASS);
  m.aeroAccel.copy(liftA).add(dragA);

  // Ground reaction & friction (wheels or belly)
  const gearY = -P.gearUpSink * (1 - S.gearAnim);
  const contactY = gnd.h + gearY;
  if (pos.y <= contactY + 0.02 && vel.y <= 0.01) {
    const nAcc = Math.max(0, -acc.y);              // normal force per unit mass
    acc.y += nAcc;
    const onWheels = S.gearAnim > 0.95;
    const brakes = onWheels && (!powered || (gd.thr < 0.05 && pil.fwd <= 0 && S.rotorLift < 0.6) || S.ap === 'land');
    const muLong = onWheels ? (brakes ? 0.5 : 0.02) : 0.4, muLat = onWheels ? 0.8 : 0.4;
    const fl = muLong * nAcc, fs = muLat * nAcc;
    const ugr = vel.x * fhx + vel.z * fhz, vgr = vel.x * rhx + vel.z * rhz;
    const dl = -Math.sign(ugr) * Math.min(fl, Math.abs(ugr) / h), ds = -Math.sign(vgr) * Math.min(fs, Math.abs(vgr) / h);
    acc.x += dl * fhx + ds * rhx; acc.z += dl * fhz + ds * rhz;
  }

  /* ---------- Integrate (semi-implicit Euler) ---------- */
  vel.addScaledVector(acc, h);
  pos.addScaledVector(vel, h);

  /* ---------- Attitude & heading ---------- */
  const dist = S.onGround ? 0 : 1;
  const thGoal = thT + pitchDist * dist, phGoal = phT + rollDist * dist;
  m.theta += clamp((thGoal - m.theta) / AF.attTau, -AF.pitchRate, AF.pitchRate) * h;
  m.phi += clamp((phGoal - m.phi) / AF.attTau, -AF.pitchRate * 1.5, AF.pitchRate * 1.5) * h;
  // Alpha protection acts on the actual angle of attack, not just the target: if gusts or a fast
  // change of flight path push alpha past the protection limit, pitch the nose down at once.
  if (!S.onGround && wfEff > 0.5 && vxz > 10 && alpha > ALPHA_PROT) m.theta -= Math.min(alpha - ALPHA_PROT, 0.1) * 4 * h;
  const auth = clamp(S.rotorLift / 0.5, 0, 1);
  let yawRate;
  if (S.onGround) yawRate = powered ? gd.yaw * 0.5 * clamp(Math.abs(ug) / 3 + S.spool, 0, 1) : 0;
  else {
    const hoverYaw = gd.yaw * P.hoverYawRate * auth * hb;
    const coord = wfEff * G * Math.tan(m.phi) / Math.max(vaH, 10);
    const vane = -wfEff * 1.5 * beta;
    yawRate = hoverYaw + coord + vane + yawDist * auth;
  }
  m.psi += yawRate * h;

  /* ---------- Gear ---------- */
  S.gearAnim = clamp(S.gearAnim + (S.gearDown ? 1 : -1) * h * P.gearRate, 0, 1);

  /* ---------- Ground contact, touchdown classification, collisions ---------- */
  const gnd2 = groundHeightAt(pos.x, pos.z, pos.y);
  const contact2 = gnd2.h - P.gearUpSink * (1 - S.gearAnim);
  const contactNow = pos.y <= contact2 + 0.02 && vel.y <= 0.05;
  if (contactNow && !m.wasOnGround) touchdown(S, gnd2.kind, Math.max(-vel.y, 0));   // once per contact event
  else if (!contactNow && !m.wasOnGround && pos.y < contact2 - 0.05 && S.t - (m.strikeT ?? -9) > 1) {
    // The surface rose above an airborne, climbing aircraft (flying up a hillside, or into a roof edge):
    // this is an impact driven by the horizontal closing speed, not a landing.
    m.strikeT = S.t;
    const kt = Math.hypot(vel.x, vel.z) * UNITS.KT_PER_MS;
    if (gnd2.kind === 'roof' && kt > CRASH.edgeKt) crash(S, 'Collision with a building', 0);
    else touchdown(S, gnd2.kind, Math.max(-vel.y, 0));
  }
  if (pos.y < contact2) { pos.y = contact2; if (vel.y < 0) vel.y = 0; if (S.crashed) m.prevPos.copy(pos); }
  if (!S.crashed && colliders.boxes.length && hitsBuilding(pos.x, pos.y, pos.z)) crash(S, 'Collision with a building', -vel.y);
  S.onGround = contactNow;
  m.contactT = S.onGround ? m.contactT + h : 0;
  m.wasOnGround = S.onGround;
  if (S.hardT > 0) S.hardT = Math.max(0, S.hardT - h);

  /* ---------- Stow state machine (airspeed hysteresis only) ---------- */
  stowLogic(S, h, { ias, wf, collG, alpha, gdVsT: gd.vsT, powered });

  /* ---------- Public outputs ---------- */
  S.rotorLift = tSum / WEIGHT;
  S.rotorAvail = rotorsUsable ? capG * Math.min(1, S.spool) : 0;
  S.wingLiftRaw = liftA.y / G;
  S.wingEff = Math.max(0, liftA.y / G);
  S.wingLift = clamp(qS * AF.alphaProtFrac * AF.clMax / G, 0, P.wingMaxLift);
  S.u = vel.x * fhx + vel.z * fhz; S.v = vel.x * rhx + vel.z * rhz; S.w = vel.y; S.vs = vel.y;
  S.gs = Math.hypot(vel.x, vel.z); S.tas = tas; S.ias = ias; S.uAir = axb; S.vAir = ayb;
  S.alpha = vxz > 5 ? alpha : 0; S.beta = vxz > 5 ? beta : 0;   // undefined at very low airspeed
  S.gamma = Math.atan2(vel.y, Math.max(S.gs, 0.5));
  S.rho = rho; S.agl = Math.max(0, pos.y - gnd2.h);
  S.windVec.x = wind.x; S.windVec.y = wind.y; S.windVec.z = wind.z;
  tmp.copy(acc).y += G; S.nz = tmp.dot(ub) / G;
  S.headingDeg = (((-m.psi * DEG) % 360) + 360) % 360 || 360;
  S.trackDeg = S.gs > 1 ? ((Math.atan2(vel.x, -vel.z) * DEG) + 360) % 360 || 360 : S.headingDeg;
  S.endurance = powered && m.powerAvg > 1 ? S.battery * BATTERY_KWH * 3600 / m.powerAvg : Infinity;
  S.range = Number.isFinite(S.endurance) ? S.endurance * S.gs : Infinity;
  S.mode = !powered ? (S.onGround ? 'OFF' : 'UNPOWERED') : S.onGround ? 'GROUND' : S.stowed ? 'CRUISE' : wf < 0.15 ? 'HOVER' : 'TRANSITION';
  if (S.onGround || S.stowed || wf < 0.15) m.reconv = false;
  S.phase = S.onGround ? 'GROUND' : S.stowed ? 'CRUISE' : wf < 0.15 ? 'HOVER' : m.reconv ? 'RECONVERSION' : 'TRANSITION';
  S.stallMargin = ALPHA_STALL - alpha;

  // Advisories (one-shot per flight)
  if (!S.onGround && S.battery < PACK.reserve && !m.toastFlags.reserve) { m.toastFlags.reserve = true; toast('Battery at reserve — land now'); }

  // Snapshot for "restart from last hover"
  if (!S.onGround && !S.stowed && powered && S.gs < 3 && Math.abs(vel.y) < 1 && S.agl > 5 && !S.crashed) {
    m.hoverSnapT += h;
    if (m.hoverSnapT > 1) {
      m.hoverSnapT = 0;
      m.lastHover = { x: pos.x, y: pos.y, z: pos.z, psi: m.psi, battery: S.battery, batTemp: S.batTemp, gearDown: S.gearDown };
    }
  } else m.hoverSnapT = 0;
}

/* ═════════════════════════════ Sub-models ═════════════════════════════ */

/** First-order (Dryden-like) gust filter on the sim clock, seeded. Intensity scales with mean wind. */
function updateGusts(m, h, wMean, V, agl) {
  const sigma = ATMOS.gustIntensity * wMean * (agl < 2 ? 0.3 : 1);
  if (sigma < 1e-3) { m.gust.multiplyScalar(1 - Math.min(1, h)); return; }
  const tau = ATMOS.gustScale / V, a = Math.min(1, h / tau), b = Math.sqrt(2 * h / tau);
  m.gust.x += -m.gust.x * a + sigma * b * gauss(m);
  m.gust.z += -m.gust.z * a + sigma * b * gauss(m);
  m.gust.y += -m.gust.y * a + 0.6 * sigma * b * gauss(m);
}

/** HOVER → TRANSITION → CRUISE → RECONVERSION. Unstow only on airspeed (or low-energy emergency),
    never on pilot vertical demand; minimum dwell between changes; spin-up from 0 rpm after unlocking. */
function stowLogic(S, h, { ias, wf, collG, alpha, gdVsT, powered }) {
  const m = S.sim;
  if (!S.stowed) {
    const ok = !S.onGround && ias > P.stowSpeed && wf >= 0.999 && collG < P.stowDemand && m.sinceStowChange > RT.restowHold;
    S.stowT = ok ? S.stowT + h : 0;
    if (S.stowT > P.stowDelay) {
      S.stowed = true; S.stowT = 0; m.sinceStowChange = 0; m.reconv = false;
      toast('Wing-borne — lift rotors stopped and locked');
    }
    return;
  }
  S.stowT = 0;
  const canDeploy = powered && S.liftOn && ias < RT.maxDeploySpeed;
  const lowEnergy = !S.onGround && alpha > ALPHA_PROT - 0.01 && S.sim.vel.y < gdVsT - 2;
  m.emergT = lowEnergy ? m.emergT + h : 0;
  const normal = ias < P.unstowSpeed && m.sinceStowChange > RT.restowHold;
  const emergency = ias < V.vs * 1.05 || m.emergT > 1;
  if (canDeploy && (normal || emergency)) {
    S.stowed = false; m.unlockT = RT.unlockDelay; m.sinceStowChange = 0; m.reconv = true; m.emergT = 0;
    toast(emergency && !normal ? 'Low energy — lift rotors deploying' : 'Lift rotors restarting');
  }
}

/** Classify a touchdown; may crash. sink in m/s (positive down). */
function touchdown(S, kind, sink) {
  const m = S.sim;
  const fpm = sink * UNITS.FPM_PER_MS;
  const kt = Math.hypot(m.vel.x, m.vel.z) * UNITS.KT_PER_MS;
  const bank = Math.abs(m.phi * DEG), pitch = m.theta * DEG;
  const wheels = S.gearAnim > 0.95;
  const rec = { fpm: Math.round(fpm), kt: Math.round(kt), bankDeg: +bank.toFixed(1), pitchDeg: +pitch.toFixed(1), gear: wheels, surface: kind, t: +S.t.toFixed(2), cls: 'normal' };
  let cause = null;
  if (kind === 'terrain' && (kt > 10 || fpm > CRASH.hardFpm)) cause = 'Terrain impact';
  else if (fpm > CRASH.crashFpm) cause = `Impact at ${rec.fpm} fpm`;
  else if (!wheels && kt > CRASH.bellyKt) cause = `Gear-up landing at ${rec.kt} kt`;
  else if (wheels && kt > CRASH.wheelsMaxKt) cause = `Touchdown at ${rec.kt} kt — gear failure`;
  else if (bank > CRASH.bankDeg) cause = `Wing-tip strike (bank ${Math.round(bank)}°)`;
  else if (pitch > CRASH.pitchDeg || pitch < -10) cause = pitch > 0 ? 'Tail strike' : 'Nose-gear collapse';
  if (cause) { rec.cls = 'crash'; S.lastTouchdown = rec; crash(S, cause, sink); emit('touchdown', rec); return; }
  if (!wheels) {
    rec.cls = 'hard'; S.damage.belly = true; S.hardT = P.hardLandingShow;
    toast('Belly touchdown — airframe damage');
  } else if (fpm > CRASH.hardFpm) {
    rec.cls = 'hard'; S.damage.gear = true; S.hardT = P.hardLandingShow;
    toast(`Hard landing: ${rec.fpm} fpm — gear inspection required`);
  } else if (fpm > CRASH.firmFpm) rec.cls = 'firm';
  S.lastTouchdown = rec;
  emit('touchdown', rec);
}

/** Enter the crashed state: freeze the sim, stop rotors, record the cause, notify. */
function crash(S, cause, sink) {
  if (S.crashed) return;
  const m = S.sim;
  S.crashed = true;
  S.crash = {
    cause, fpm: Math.round(Math.max(0, sink) * UNITS.FPM_PER_MS), kt: Math.round(Math.hypot(m.vel.x, m.vel.z) * UNITS.KT_PER_MS),
    bankDeg: Math.round(Math.abs(m.phi * DEG)), altFt: Math.round(m.pos.y * UNITS.FT_PER_M), t: +S.t.toFixed(2),
    canRestartHover: !!m.lastHover,
  };
  m.vel.set(0, 0, 0); m.prevPos.copy(m.pos);
  S.ap = null; S.apAlt = undefined; S.apPhase = null; S.apTarget = null; S.apText = '';
  S.rotors.forEach(r => { r.rpm = 0; r.thrust = 0; }); S.prop.rpm = 0; S.prop.thrust = 0;
  S.u = S.v = S.w = S.vs = 0; S.ias = S.tas = S.gs = 0; S.gamma = 0;
  toast(`Crashed — ${cause}`);
  emit('crash', S.crash);
}

/* ═════════════════════════════ Autopilot ═════════════════════════════ */

function apFail(S, why) {
  S.ap = null; S.apAlt = undefined; S.apPhase = null; S.apTarget = null; S.apText = '';
  S.sim.apFailT = S.t; toast(`AP FAIL — ${why}`);
}
function setPhase(S, p) { if (S.apPhase !== p) { S.apPhase = p; S.sim.apT = 0; } }

/** Position-hold guidance: ground-velocity command toward (x,z) in the body frame. */
function trcTo(S, gd, x, z, vmax = 6) {
  const m = S.sim, sp = Math.sin(m.psi), cp = Math.cos(m.psi);
  const dx = x - m.pos.x, dz = z - m.pos.z;
  let ex = dx * -sp + dz * -cp, ey = dx * cp + dz * -sp;   // error along heading / right
  const d = Math.hypot(ex, ey), lim = Math.min(vmax, 0.4 * d);
  if (d > 1e-6) { ex *= lim / d; ey *= lim / d; }
  gd.trcX = ex; gd.trcY = ey;
  return d;
}

/** In a steady wind, turn the nose into it (least drag, most margin). Uses the yaw-rate channel. */
function headIntoWind(S, gd) {
  if ((S.wind || 0) < 3) return;
  const wdir = Number.isFinite(S.windDir) ? S.windDir : WIND_DIR;   // heading whose forward vector points upwind
  let d = (wdir - S.sim.psi) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
  gd.yaw = clamp(d * 1.5, -0.6, 0.6);
}

/** Wing-borne → hover: kill thrust, prop braking, hold altitude; rotors redeploy by airspeed. Returns true when slow. */
function decelerate(S, h, gd, ias) {
  S.thr = 0; gd.thr = 0; gd.brake = true; gd.trcX = 0; gd.trcY = 0; gd.bank = 0; gd.yaw = 0;
  gd.vsT = clamp((S.apAlt - S.sim.pos.y) * 0.5, -2, 2);
  setPhase(S, S.stowed ? 'DECEL' : 'RECONVERT');
  if (S.sim.apT > 120 && S.apPhase === 'DECEL') apFail(S, 'unable to decelerate');
  return !S.stowed && ias < 14 && S.gs < 4;
}

function autopilot(S, h, gd, c) {
  const m = S.sim;
  if (!S.ap) { S.apAlt = undefined; S.apPhase = null; S.apTarget = null; S.apText = ''; return; }
  const alt = m.pos.y, ft = v => Math.round(v * UNITS.FT_PER_M);
  const needsRotors = S.ap === 'takeoff' || ((S.ap === 'hold' || S.ap === 'land') && S.apPhase !== 'DECEL');
  if (!c.powered) { apFail(S, 'no electrical power'); return; }
  // Rotor-borne and the pack can no longer supply hover power: the AP cannot hold height — say so.
  // (Power-limited, sinking, and the pack is below the estimated hover power — not just a transient climb limit.)
  const starved = !S.stowed && !S.onGround && c.wf < 0.5 && S.powerLimited && m.vel.y < -0.3 && S.powerAvail < hoverPowerKw(S);
  m.lowPowerT = starved ? (m.lowPowerT || 0) + h : 0;
  if (m.lowPowerT > 1.5) { m.lowPowerT = 0; apFail(S, 'no electrical power for hover'); return; }
  if (needsRotors && (!S.liftOn || c.capG < 0.9)) { apFail(S, 'lift unavailable'); return; }

  if (S.ap === 'takeoff') {
    setPhase(S, 'CLIMB');
    gd.vsT = clamp((S.apAlt - alt) * 0.35, -1.5, 4); gd.trcX = 0; gd.trcY = 0;
    if (Math.abs(S.apAlt - alt) < 0.6 && !S.onGround) {
      S.ap = 'alt'; setPhase(S, 'ALT');
      toast(`Holding ${ft(S.apAlt)} ft — push cruise throttle to transition`);
    } else if (S.onGround && m.apT > 10) apFail(S, 'no lift-off (insufficient thrust)');
  } else if (S.ap === 'alt') {
    setPhase(S, 'ALT');
    gd.vsT = clamp((S.apAlt - alt) * 0.6, -3, 3);
  } else if (S.ap === 'hold') {
    if (S.apPhase !== 'HOLD') {
      if (decelerate(S, h, gd, c.ias) || (S.apPhase === 'RECONVERT' && c.wf < 0.05 && S.gs < 4)) {
        setPhase(S, 'HOLD'); S.apTarget = { x: m.pos.x, z: m.pos.z, alt: S.apAlt };
      }
    } else {
      gd.vsT = clamp((S.apAlt - alt) * 0.6, -2, 2);
      if (!S.apTarget) S.apTarget = { x: m.pos.x, z: m.pos.z, alt: S.apAlt };
      trcTo(S, gd, S.apTarget.x, S.apTarget.z);
      headIntoWind(S, gd);
      if (S.thr > 0.1) { S.thr = Math.max(0, S.thr - h * 0.5); }
    }
  } else if (S.ap === 'land') {
    S.thr = Math.max(0, S.thr - h * 0.5); gd.thr = S.thr;
    if (S.apPhase === 'DECEL' || S.apPhase === 'RECONVERT' || !S.apPhase) {
      if (!S.apPhase) setPhase(S, S.stowed || c.wf > 0.5 ? 'DECEL' : 'APPROACH');
      if (S.apPhase !== 'APPROACH' && decelerate(S, h, gd, c.ias)) setPhase(S, 'APPROACH');
    }
    if (S.apPhase === 'APPROACH' || S.apPhase === 'DESCENT' || S.apPhase === 'FLARE') {
      if (!S.apTarget) {
        const nearPad = Math.hypot(m.pos.x, m.pos.z) < 300;
        S.apTarget = nearPad ? { x: 0, z: 0, pad: true } : { x: m.pos.x, z: m.pos.z, pad: false };
      }
      const d = trcTo(S, gd, S.apTarget.x, S.apTarget.z, 8);
      if (S.apPhase === 'APPROACH') {
        gd.vsT = c.agl > 60 ? -V.vrsSinkLimit : 0;
        if (d < 4 && S.gs < 1.5) setPhase(S, 'DESCENT');
      } else {
        gd.vsT = c.agl > 15 ? -V.vrsSinkLimit : c.agl > 3 ? -1.2 : -0.6;
        if (c.agl <= 3) setPhase(S, 'FLARE');
        if (d > 10) setPhase(S, 'APPROACH');
      }
      // Gear: extend below 150 ft; never descend the last few metres with the gear up
      if (!S.gearDown && c.agl < 46 && c.ias < V.vlo) { S.gearDown = true; toast('Auto land — gear extending'); }
      if (S.gearAnim < 0.95 && c.agl < 5) gd.vsT = Math.max(gd.vsT, 0);
    }
    if (S.onGround && S.gs < 0.6) {
      S.ap = null; S.thr = 0; S.apPhase = null; S.apTarget = null;
      toast(S.lastTouchdown && S.lastTouchdown.cls === 'hard' ? 'Touchdown — hard landing' : 'Touchdown — landed');
    }
  }
  if (S.ap) S.apText = apReadout(S);
  else { S.apAlt = undefined; S.apText = ''; }
}

function apReadout(S) {
  const ft = v => Math.round(v * UNITS.FT_PER_M);
  const name = { takeoff: 'TAKEOFF', alt: 'ALT HOLD', hold: 'HOVER HOLD', land: 'AUTO LAND' }[S.ap] || S.ap.toUpperCase();
  const tgt = S.ap === 'land' ? (S.apTarget && S.apTarget.pad ? 'PAD' : '') : Number.isFinite(S.apAlt) ? ft(S.apAlt) + ' FT' : '';
  return [name, S.apPhase && S.apPhase !== 'ALT' ? S.apPhase : '', tgt].filter(Boolean).join(' · ');
}

/** Pilot moved the throttle: hover-hold → altitude hold, auto-land → cancelled to altitude hold. */
function pilotThrottleOverride(S) {
  if (S.ap === 'hold') { S.ap = 'alt'; if (!Number.isFinite(S.apAlt)) S.apAlt = S.sim.pos.y; S.apPhase = 'ALT'; S.apTarget = null; S.apText = apReadout(S); return null; }
  if (S.ap === 'land') { S.ap = 'alt'; S.apAlt = S.sim.pos.y; S.apPhase = 'ALT'; S.apTarget = null; S.apText = apReadout(S); return 'Auto land cancelled — altitude hold'; }
  return null;
}

/* ═════════════════════════════ Warnings ═════════════════════════════ */

/** Look-ahead along the current ground track (up to ~12 s / 900 m, from the aircraft itself): does the path
    pass through a building or hill above the current altitude minus a small margin? Buildings are tested
    exactly (2-D segment vs. grown footprint, slab method); hills are sampled every ≤ 15 m. */
function obstacleAhead(S) {
  const m = S.sim, v = m.vel, gs = Math.hypot(v.x, v.z);
  if (gs < 8 || (!colliders.boxes.length && !colliders.cones.length)) return false;
  const T = Math.min(12, 900 / gs), L = gs * T, x0 = m.pos.x, z0 = m.pos.z, sink = Math.min(0, v.y);
  const yAt = t => m.pos.y + sink * t;
  const yEnd = yAt(T), mx = x0 + v.x * T / 2, mz = z0 + v.z * T / 2;
  for (const b of colliders.boxes) {
    if (b.h <= yEnd - 8) continue;
    const g = CRASH.bodyRadius + 4, R = b.hw + b.hd + g;
    if (Math.abs(b.x - mx) > L / 2 + R || Math.abs(b.z - mz) > L / 2 + R) continue;   // broad phase
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const dx = x0 - b.x, dz = z0 - b.z;
    const px = dx * c - dz * s, pz = dx * s + dz * c, ux = v.x * c - v.z * s, uz = v.x * s + v.z * c;
    let t0 = 0, t1 = T;
    for (const [p, u, e] of [[px, ux, b.hw + g], [pz, uz, b.hd + g]]) {
      if (Math.abs(u) < 1e-9) { if (Math.abs(p) > e) { t0 = 1; t1 = 0; } continue; }
      let a = (-e - p) / u, d = (e - p) / u; if (a > d) { const k = a; a = d; d = k; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, d);
    }
    if (t0 <= t1 && b.h > yAt(t1) - 8) return true;
  }
  if (colliders.cones.length) {
    const n = Math.max(1, Math.ceil(L / 15));
    for (const c of colliders.cones) {
      const R = c.r + 15;
      if (Math.abs(c.x - mx) > L / 2 + R || Math.abs(c.z - mz) > L / 2 + R) continue;
      for (let i = 0; i <= n; i++) {
        const t = T * i / n, d = Math.hypot(x0 + v.x * t - c.x, z0 + v.z * t - c.z);
        if (d < c.r && c.h * (1 - d / c.r) > yAt(t) - 15) return true;
      }
    }
  }
  return false;
}

const LEVEL_ORDER = { crit: 0, warn: 1, info: 2, ok: 3 };
/** Rebuild S.warnings = [{id, level:'crit'|'warn'|'info', text}] (crit first). Each warning stays at
    least 1 s of sim time after its condition clears (no flicker). Called once per frame by step(). */
function updateWarnings(S) {
  const m = S.sim, now = S.t, air = !S.onGround && !S.crashed;
  const list = [];
  const hold = (id, cond, level, text, keep = 1.0) => {
    if (cond) m.warnHold[id] = now;
    if (m.warnHold[id] !== undefined && now - m.warnHold[id] < keep) list.push({ id, level, text });
  };
  const noRotors = S.stowed || !(S.master && S.liftOn && S.battery > 0);
  const kt = v => Math.round(v * UNITS.KT_PER_MS);
  if (S.crashed && S.crash) list.push({ id: 'CRASH', level: 'crit', text: 'CRASH — ' + S.crash.cause.toUpperCase() });
  if (S.crashed) {   // sim time is frozen: other warnings would never time out, so show only the crash
    if (!(S.warnings.length === list.length && S.warnings.every((w, i) => w.id === list[i].id))) S.warnings = list;
    return;
  }
  // STALL only matters when the wing is carrying the aircraft, and only for forward airflow: a rotor-borne
  // hover in a tailwind sees reverse flow (|alpha| near 180°), which is TAILWIND, not a stall.
  const wingBorne = noRotors || S.stowed || smooth01(10, V.vUnstow, S.ias) > 0.5;
  const fwdFlow = Math.abs(S.alpha) < Math.PI / 2;
  hold('STALL', air && S.ias > 8 && fwdFlow && wingBorne && (S.alpha > ALPHA_STALL * 0.97 || (noRotors && S.ias < V.vs * Math.sqrt(Math.max(1, S.nz)) * 0.98)), 'crit', 'STALL');
  hold('TAILWIND', air && !S.stowed && !wingBorne && S.uAir < -4, 'info', 'TAILWIND');
  hold('LOW_SPEED', air && noRotors && S.ias < V.vs * 1.1, 'warn', 'LOW SPEED');
  hold('OVERSPEED', S.ias > V.vne, 'crit', 'OVERSPEED');
  hold('VMO', S.ias > V.vmo && S.ias <= V.vne, 'warn', `VMO ${kt(V.vmo)} KT`);
  hold('GEAR_SPEED', S.gearAnim > 0.02 && (S.ias > V.vle || (S.gearAnim < 0.98 && S.ias > V.vlo)), 'warn', 'GEAR SPEED');
  hold('VRS', air && S.vrs > 0.2, 'crit', 'VORTEX RING');
  hold('SINK_RATE', air && S.agl < 150 && S.w < -3.05 && S.agl / -S.w < 15, 'crit', 'SINK RATE');
  hold('GEAR_UP', air && S.gearAnim < 0.95 && S.agl < 30 && S.w < -0.3, 'crit', 'GEAR UP');
  hold('BANK', air && Math.abs(S.roll) > 0.61, 'warn', 'BANK ANGLE');
  hold('LIFT_LIMIT', air && !S.stowed && S.rotorCmd > S.rotorAvail * 0.98 && S.rotorCmd > 0.3, 'warn', 'LIFT LIMIT');
  hold('POWER_LIMIT', S.powerLimited, 'warn', 'POWER LIMIT');
  hold('BATT_EMPTY', S.battery <= 0, 'crit', 'BATTERY EMPTY');
  hold('RESERVE', S.battery < PACK.reserve && S.battery > 0, S.battery < PACK.low ? 'crit' : 'warn', 'RESERVE — LAND NOW');
  hold('BATT_TEMP', S.batTemp > PACK.tempWarn, S.batTemp > PACK.tempLimit ? 'crit' : 'warn', `BATT TEMP ${Math.round(S.batTemp)}°C`);
  hold('ALT_LIMIT', !!S.altLimited, 'info', 'ALT LIMIT');
  hold('HARD_LANDING', S.hardT > 0, 'crit', 'HARD LANDING');
  hold('OBSTACLE', air && obstacleAhead(S), 'crit', 'OBSTACLE — CLIMB', 3.0);   // latched 3 s: no flicker
  hold('GEAR_DAMAGE', S.damage && S.damage.gear, 'warn', 'GEAR DAMAGE');
  hold('AIRFRAME_DAMAGE', S.damage && S.damage.belly, 'warn', 'AIRFRAME DAMAGE');
  hold('AP_FAIL', m.apFailT !== undefined && now - m.apFailT < 5, 'crit', 'AP FAIL');
  list.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  // Keep the same array identity when nothing changed (cheap equality for the UI)
  const same = list.length === S.warnings.length && list.every((w, i) => w.id === S.warnings[i].id && w.level === S.warnings[i].level && w.text === S.warnings[i].text);
  if (!same) S.warnings = list;
}

/* ═════════════════════════════ Flight commands ═════════════════════════════
   Each mutates S and returns a toast message for the UI to show (or null). */

export function toggleMaster(S) {
  S.master = !S.master;
  if (S.master && S.battery <= 0) return 'Battery depleted — reset to pad to recharge';
  return S.master ? 'Master power ON — motors spooling' : 'Master power OFF';
}
export function setLiftMotors(S, on) { S.liftOn = on; return on ? 'Lift motors enabled' : 'Lift motors disabled'; }
export function setCruiseMotor(S, on) { S.cruiseOn = on; return on ? 'Cruise motor enabled' : 'Cruise motor disabled'; }
export function toggleGear(S) {
  if (S.gearDown && S.onGround) return 'Gear cannot retract on the ground';
  if (S.ias > V.vlo) return `Gear limited to ${Math.round(V.vlo * UNITS.KT_PER_MS)} kt`;
  S.gearDown = !S.gearDown; return S.gearDown ? 'Gear down' : 'Gear up';
}
/** Throttle from the slider (0..1). Moving it cancels hover-hold/auto-land to altitude hold. */
export function setThrottle(S, frac) {
  S.thr = clamp(Number(frac) || 0, 0, 1);
  return pilotThrottleOverride(S);
}

/** Common engage preconditions for modes that need the lift rotors. */
function liftPrecheck(S, minG) {
  if (S.crashed) return 'Reset after the crash first';
  if (!S.master) return 'Turn on master power first';
  if (S.battery <= 0) return 'Battery depleted';
  if (!S.liftOn) return 'Enable lift motors first';
  const cap = rotorCapacityG(S);
  if (cap < minG) return `Insufficient lift (${S.rotors.filter(r => r.health > 0).length} of 8 motors) — inhibited`;
  return null;
}
export function engageTakeoff(S) {
  const why = liftPrecheck(S, 1.1); if (why) return why;
  if (S.onGround && S.battery < PACK.reserve) return 'Battery below reserve — takeoff inhibited';
  const gh = S.sim.groundH || 0;
  S.ap = 'takeoff'; S.apAlt = Math.max(gh + 100 / UNITS.FT_PER_M, S.sim.pos.y); S.apPhase = null; S.apTarget = null; S.sim.apT = 0;
  return S.onGround ? `Auto takeoff — climbing to ${Math.round((S.apAlt) * UNITS.FT_PER_M)} ft hover`
    : `Auto takeoff — holding ${Math.round(S.apAlt * UNITS.FT_PER_M)} ft`;
}
export function engageLand(S) {
  if (S.onGround) return 'Already on the ground';
  const why = liftPrecheck(S, 1.0); if (why) return 'Auto land unavailable: ' + why.charAt(0).toLowerCase() + why.slice(1);
  S.ap = 'land'; S.apAlt = S.sim.pos.y; S.apPhase = null; S.apTarget = null; S.sim.apT = 0;
  const wingBorne = S.stowed || S.ias > 18;
  const nearPad = Math.hypot(S.sim.pos.x, S.sim.pos.z) < 300;
  return wingBorne ? 'Auto land — decelerating, then vertical descent'
    : nearPad ? 'Auto land — to the pad, then vertical descent' : 'Auto land — vertical descent here';
}
export function engageHold(S) {
  if (S.onGround) return 'Take off first';
  const why = liftPrecheck(S, 1.0); if (why) return 'Hover hold unavailable: ' + why.charAt(0).toLowerCase() + why.slice(1);
  const wingBorne = S.stowed || S.ias > 18;
  S.ap = 'hold'; S.thr = 0; S.apAlt = S.sim.pos.y; S.sim.apT = 0;
  S.apPhase = wingBorne ? null : 'HOLD';
  S.apTarget = wingBorne ? null : { x: S.sim.pos.x, z: S.sim.pos.z, alt: S.apAlt };
  return wingBorne ? 'Hover hold — decelerating to hover' : `Hover hold — holding position at ${Math.round(S.apAlt * UNITS.FT_PER_M)} ft`;
}
/** Called when a manual flight key is pressed. */
export function cancelAutopilot(S) {
  if (!S.ap) return null;
  S.ap = null; S.apAlt = undefined; S.apPhase = null; S.apTarget = null; S.apText = '';
  return 'Autopilot off — manual control';
}

export function failRandomMotor(S) {
  const ok = S.rotors.filter(r => r.health > 0);
  if (ok.length <= 1) return 'No more motors to fail';
  const r = ok[Math.floor(Math.random() * ok.length)]; r.health = 0;
  return `Motor ${r.idx + 1} failed — flight computer redistributing thrust`;
}
export function toggleMotor(S, idx) {
  const r = S.rotors[idx]; if (!r) return null;
  r.health = r.health > 0 ? 0 : 1;
  return r.health ? `Motor ${r.idx + 1} restored` : `Motor ${r.idx + 1} failed`;
}
/** Partial failure: set a motor's health 0..1 (1 = healthy). */
export function setMotorHealth(S, idx, health) {
  const r = S.rotors[idx]; if (!r) return null;
  r.health = clamp(Number(health) || 0, 0, 1);
  return r.health >= 1 ? `Motor ${idx + 1} restored` : r.health <= 0 ? `Motor ${idx + 1} failed` : `Motor ${idx + 1} degraded to ${Math.round(r.health * 100)}%`;
}
export function clearFaults(S) { S.rotors.forEach(r => { r.health = 1; }); return 'All motor faults cleared'; }

/* ---------- Simulation control (pause / time scale) ---------- */
export function setPaused(S, on) {
  S.paused = !!on; S.pauseReason = on ? 'user' : null;
  return on ? 'Paused' : 'Resumed';
}
export function togglePause(S) { return setPaused(S, !S.paused); }
/** Set the time scale; snaps to the nearest of SIM.timeScales. Returns a toast. */
export function setTimeScale(S, x) {
  const v = Number(x);
  const best = SIM.timeScales.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), 1);
  S.timeScale = Number.isFinite(v) ? best : 1;
  return `Time ×${S.timeScale}`;
}
/** Cycle 0.25 → 0.5 → 1 → 2 → 4 → 0.25. */
export function cycleTimeScale(S) {
  const i = SIM.timeScales.indexOf(S.timeScale);
  return setTimeScale(S, SIM.timeScales[(i + 1) % SIM.timeScales.length]);
}

/** QA / scenario helper: place the aircraft (true + render state) airborne or on the ground.
    opts: {x, y, z, psi, speed (m/s along heading), stowed, gearDown, master}. Returns null. */
export function teleport(S, opts = {}) {
  const m = S.sim;
  const x = opts.x ?? m.pos.x, y = opts.y ?? m.pos.y, z = opts.z ?? m.pos.z, psi = opts.psi ?? m.psi, spd = opts.speed ?? 0;
  m.pos.set(x, y, z); m.prevPos.copy(m.pos); S.pos.copy(m.pos);
  m.psi = m.prevPsi = S.psi = psi;
  m.vel.set(-Math.sin(psi) * spd, 0, -Math.cos(psi) * spd);
  m.theta = m.prevTheta = 0; m.phi = m.prevPhi = 0;
  if (opts.master !== undefined) S.master = !!opts.master;
  if (opts.gearDown !== undefined) { S.gearDown = !!opts.gearDown; S.gearAnim = S.gearDown ? 1 : 0; }
  if (opts.stowed !== undefined) { S.stowed = !!opts.stowed; m.sinceStowChange = 99; }
  if (S.master && S.liftOn) S.spool = 1;
  S.onGround = m.wasOnGround = y <= 0.02;
  m.vsI = m.trcIx = m.trcIy = 0;
  return null;
}
