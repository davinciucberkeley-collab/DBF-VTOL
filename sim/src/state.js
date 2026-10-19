/* Shared simulation state. Owned by the flight engineer. Additive changes only:
   never rename/remove a field of S or change its units — every module reads it.

   Layout
   - Public fields on S (pos, psi, u, v, w, pitch, roll, ias, warnings, …) are what other modules read.
     S.pos / S.psi / S.pitch / S.roll are the *render pose*: physics interpolates them between the last two
     fixed simulation steps every frame, so visuals are smooth at any frame rate.
   - S.sim holds the integrator's internal state (true position, inertial velocity, attitude, controller
     integrators, …). Only physics.js and this file touch it.
   - Initial values come from one place, initialFlightState(), so reset can never drift from start-up. */
import { ROTOR_LAYOUT, PACK, SIM } from './config.js';
import { emit } from './util.js';
import { rotorCapacityG } from './physics.js';

/** The single shared state object. See ARCHITECTURE.md for the field list. */
export const S = {
  // Rotor & prop simulation state (visual objects live in aircraft.js)
  rotors: ROTOR_LAYOUT.map(r => ({ ...r, rpm: 0, health: 1, thrust: 0 })),
  prop: { rpm: 0, thrust: 0 },
  // Switches / viewer settings (survive reset)
  master: false, liftOn: true, cruiseOn: true, gearDown: true, lights: true,
  discs: true, vectors: false, trail: true, wind: 0, cam: 'orbit', autoRot: false, tod: 'day',
  // Simulation control (survive reset; UI may write these)
  paused: false, pauseReason: null, timeScale: 1,
  windDir: undefined, // radians the wind blows toward; undefined => config WIND_DIR
};

/** Fresh internal integrator state (plain data + vectors). */
function initialSim() {
  return {
    pos: new THREE.Vector3(0, 0, 0),   // true position (wheels), m
    prevPos: new THREE.Vector3(0, 0, 0),
    vel: new THREE.Vector3(0, 0, 0),   // inertial (ground-relative) velocity, m/s
    psi: 0, prevPsi: 0,                // heading
    theta: 0, prevTheta: 0,            // pitch
    phi: 0, prevPhi: 0,                // roll
    acc: 0,                            // accumulator of unsimulated time, s
    gust: new THREE.Vector3(),         // turbulence velocity, m/s (world)
    rngState: SIM.seed,
    vsI: 0,                            // vertical-speed loop integrator, m/s^2
    trcIx: 0, trcIy: 0,                // hover translational-rate loop integrators, m/s^2 (body x/y)
    aeroAccel: new THREE.Vector3(),    // last step's aerodynamic acceleration (FCS feed-forward)
    fcsHealth: ROTOR_LAYOUT.map(() => 1), // rotor health as known to the FCS (lags real health)
    unlockT: 0,                        // s remaining until unstowed rotors may spin
    sinceStowChange: 99,               // s since last stow/unstow
    emergT: 0,                         // s of low-energy condition while stowed
    wasOnGround: true,
    contactT: 0,                       // s on ground since last touchdown
    apT: 0,                            // s in the current AP mode/phase
    powerAvg: 0,                       // kW, slow average for endurance
    warnHold: {},                      // id -> sim time last active (warning hysteresis)
    toastFlags: {},                    // one-shot advisories already shown
    hoverSnapT: 0,                     // s of stable hover (for restart snapshot)
    lastHover: null,                   // snapshot for restartFromLastHover()
    groundH: 0,                        // ground/roof height under the aircraft, m
  };
}

/** Single source of truth for every per-flight field of S. */
function initialFlightState() {
  return {
    pos: new THREE.Vector3(0, 0, 0), psi: 0, u: 0, v: 0, w: 0, pitch: 0, roll: 0,
    thr: 0, battery: 1, spool: 0, rotorLift: 0, wingEff: 0, wingLift: 0,
    stowed: false, stowT: 0, ap: null, apAlt: undefined, hardT: 0, power: 0,
    onGround: true, gearDown: true, gearAnim: 1, mode: 'OFF',
    // ---- Flight additions (see ARCHITECTURE.md "Flight additions") ----
    t: 0, frameSimDt: 0, interp: 0,
    ias: 0, tas: 0, gs: 0, vs: 0, uAir: 0, vAir: 0, alpha: 0, beta: 0, gamma: 0, nz: 1,
    headingDeg: 360, trackDeg: 360, agl: 0, rho: 1.225, windVec: { x: 0, y: 0, z: 0 },
    phase: 'GROUND', wingLiftRaw: 0, rotorAvail: 0, rotorCmd: 0, vrs: 0, altLimited: false, stallMargin: 0.23,
    warnings: [],
    crashed: false, crash: null, damage: { gear: false, belly: false },
    lastTouchdown: null,
    apPhase: null, apTarget: null, apText: '',
    powerAvail: 0, powerLimited: false, packV: PACK.vMax, packI: 0, batTemp: PACK.tempAmbient,
    endurance: Infinity, range: Infinity, powerAvg: 0,
    sim: initialSim(),
  };
}

/** Reset the flight to the pad: zero motion, recharge battery, gear down, autopilot off, crash cleared.
    Motor faults are cleared too unless `opts.keepFaults` is true.
    Keeps switches, viewer settings and pause/time-scale. Emits 'reset'. */
export function resetState(opts = {}) {
  Object.assign(S, initialFlightState());
  S.rotors.forEach(r => { r.rpm = 0; r.thrust = 0; if (!opts.keepFaults) r.health = 1; });
  S.prop.rpm = 0; S.prop.thrust = 0;
  if (S.pauseReason !== 'user') { S.paused = false; S.pauseReason = null; }
  emit('reset');
}

/** Put the aircraft back at the last stable hover point (recorded by physics), in hover hold.
    Keeps motor faults and the snapshot's charge when the aircraft can still hover with them; otherwise
    clears the faults (too little lift) and/or tops the battery up to the reserve (too little charge) so the
    restart is flyable, and says so. Returns a toast message. */
export function restartFromLastHover() {
  const snap = S.sim && S.sim.lastHover;
  if (!snap) { resetState({ keepFaults: true }); return 'No hover recorded — reset to pad'; }
  resetState({ keepFaults: true });
  const m = S.sim;
  m.pos.set(snap.x, snap.y, snap.z); m.prevPos.copy(m.pos); S.pos.copy(m.pos);
  m.psi = m.prevPsi = S.psi = snap.psi;
  const fixes = [];
  if (rotorCapacityG(S) < 1.05) { S.rotors.forEach(r => { r.health = 1; }); fixes.push('motor faults cleared'); }
  S.battery = snap.battery; S.batTemp = snap.batTemp;
  const topUp = PACK.reserve + 0.05;   // a little above the reserve, so there is time to land
  if (!(S.battery >= PACK.reserve)) { S.battery = topUp; S.batTemp = Math.min(S.batTemp, PACK.tempWarn - 5); fixes.push(`battery topped up to ${Math.round(topUp * 100)} %`); }
  S.master = true; S.liftOn = true; S.spool = 1; S.gearDown = snap.gearDown; S.gearAnim = snap.gearDown ? 1 : 0;
  S.onGround = false; m.wasOnGround = false;
  S.rotors.forEach(r => { r.rpm = r.health > 0 ? 0.85 : 0; });
  m.fcsHealth = S.rotors.map(r => r.health);
  m.lastHover = snap;
  S.ap = 'hold'; S.apAlt = snap.y; S.apPhase = 'HOLD'; S.apTarget = { x: snap.x, z: snap.z, alt: snap.y };
  return 'Restarted from last hover — hover hold' + (fixes.length ? ' (' + fixes.join(', ') + ')' : '');
}

/* Auto-pause while the tab is hidden; resume automatically when it becomes visible again
   (a pause the user chose is never overridden). */
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (!S.paused) { S.paused = true; S.pauseReason = 'hidden'; } }
    else if (S.pauseReason === 'hidden') { S.paused = false; S.pauseReason = null; }
  });
}

resetState();
