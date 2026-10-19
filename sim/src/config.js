/* Constants. Owned by the flight engineer (geometry consumers: aircraft.js, ui.js schematic).
   Additive changes only: do not rename or remove exports, and do not change ROTOR_LAYOUT order.
   Every object exported here is frozen; consumers must treat them as read-only. */

const deepFreeze = o => { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };

/* ---------- Units ---------- */
export const G = 9.81;
export const UNITS = deepFreeze({
  FT_PER_M: 3.281,
  KT_PER_MS: 1.944,
  FPM_PER_MS: 196.85,
});

/* ---------- Aircraft geometry (metres, aircraft frame: -Z forward, +Y up, +X right) ---------- */
export const ROTOR_X = Object.freeze([-4.8, -2.4, 2.4, 4.8]);   // boom x positions
export const ROTOR_Z = Object.freeze([-3.0, 3.0]);              // fore / aft rotor stations
export const ROTOR_ARM_MAX = 4.8;                // |x| of outermost rotor (normalises roll moment)
/** 8 lift rotors in index order (idx 0..7 => "Motor 1..8"); dir = spin direction (+1 / -1). */
export const ROTOR_LAYOUT = deepFreeze(ROTOR_Z.flatMap((z, zi) => ROTOR_X.map((x, xi) => ({
  idx: zi * ROTOR_X.length + xi, x, z, dir: ((xi + zi) % 2) ? 1 : -1,
}))));
export const BODY_HEIGHT = 1.35;                 // body group height above aircraft origin (wheels on ground)
export const WING_SPAN = 13;
export const COCKPIT_EYE = Object.freeze([0, 1.9, -2.55]); // cockpit camera position in aircraft frame

/* ---------- Battery / power ---------- */
export const BATTERY_KWH = 200;
/** Legacy coarse power coefficients (kW). No longer used by physics (see PACK/ROTOR/PROP); kept for compatibility. */
export const POWER = deepFreeze({ base: 4, rotor: 330, prop: 170, spool: 6 });

/* ---------- Legacy flight-model coefficients ----------
   main.js reads `substeps` and `maxDt`: physics.step() now runs its own fixed-step accumulator, so main
   should hand it the whole (lightly clamped) frame time in one call. aircraft.js reads `rotorMaxLift`. */
export const PHYS = deepFreeze({
  substeps: 1, maxDt: 0.25,     // one step() call per frame with up to 0.25 s of real time
  throttleRate: 0.45,           // throttle fraction per second from arrow keys
  climbRate: 5,                 // m/s commanded by R/F
  wingRefSpeed: 30, wingMaxLift: 1.8, // (legacy) cap for S.wingLift, in g
  rotorMaxLift: 1.6,            // total rotor lift (in g, sea level) with all 8 rotors healthy
  spoolUp: 0.5, spoolDown: 2.0, // lift-motor enable ramp (1/s)
  vsGain: 0.25,                 // (legacy) lift command per m/s vertical-speed error
  rotorLiftLag: 4,
  stowSpeed: 33, stowDemand: 0.05, stowDelay: 1.5, // stop & lock lift rotors (IAS m/s, g, s)
  unstowSpeed: 29.5, unstowDemand: 0.06,           // restart lift rotors below this IAS
  propIdle: 0.12, propSpool: 1.6, propThrust: 10,
  hoverAccel: 2.2,              // m/s^2 translational authority in hover
  dragLin: 0.12, dragQuad: 0.0019, gearDrag: 0.0006, latDrag: 0.6,
  hoverYawRate: 0.7, maxBank: 0.45,
  ceiling: 1500,                // m: soft altitude limit (FCS stops commanding climb above it)
  hardLandingVs: 1.524,         // m/s sink (300 fpm) above which a touchdown is "hard"
  hardLandingShow: 4,           // seconds the HARD LANDING annunciator stays on
  gearUpSink: 0.47,             // how much lower the belly sits with gear retracted
  gearRate: 0.6,
});

/* ---------- Simulation clock ---------- */
export const SIM = deepFreeze({
  hz: 120,                       // fixed integration rate
  maxStepsPerFrame: 40,          // spiral-of-death guard (excess time is dropped)
  maxFrameDt: 0.25,              // s of real time accepted per frame
  timeScales: [0.25, 0.5, 1, 2, 4],
  seed: 1234567,                 // turbulence RNG seed (deterministic replay)
});

/* ---------- Airframe ---------- */
export const AIRFRAME = deepFreeze({
  mass: 2200,                    // kg
  wingArea: 34,                  // m^2
  cl0: 0.35, clAlpha: 5.0,       // per rad
  clMax: 1.5,                    // stall at alpha = (clMax - cl0) / clAlpha ≈ 13°
  clMin: -0.8,
  cd0: 0.030, k: 0.049,          // parasite + induced-drag factor (L/D max ≈ 13)
  cdGear: 0.015, cdRotorsOut: 0.012, // extra CD with gear down / lift rotors unlocked
  cdReverse: 0.09,               // CD for reverse airflow (tail first)
  sideCdA: 14,                   // m^2 side area (sideslip / crosswind)
  alphaProtFrac: 0.92,           // FCS limits CL to this fraction of clMax
  pitchRate: 0.6,                // rad/s attitude rate limit
  attTau: 0.4,                   // s attitude response time constant
  maxBank: 0.45,                 // rad: bank command at full A/D in wing-borne flight
  bankLimit: 0.6,                // rad: bank protection
  pitchMin: -0.26, pitchMax: 0.35,
  hoverTiltMax: 0.22,            // rad
  rotation: 0.14,                // rad pitch for a conventional (wheeled) take-off above Vr
});

/* ---------- Lift rotors ---------- */
export const ROTOR = deepFreeze({
  diameter: 3.0,
  figureOfMerit: 0.76,
  profileKw: 3,                  // kW per rotor at full rpm (∝ rpm^3)
  idleRpm: 0.28,                 // normalised rpm at zero collective
  rpmUp: 2.2, rpmDown: 1.2,      // 1/s rpm response, powered
  rpmDecay: 0.5,                 // 1/s rpm decay unpowered / failed (rotor inertia)
  windmillThrust: 0.06,          // fraction of thrust an unpowered, windmilling rotor still makes
  unlockDelay: 0.6,              // s between "unstow" and the motors being allowed to spin
  ramDrag: 0.03,                 // 1/s per g of rotor lift: H-force on air-relative horizontal velocity
  faultDetect: 0.3,              // s for the FCS to detect a failed motor (thrust transient)
  maxDeploySpeed: 41,            // m/s IAS (≈80 kt) above which the rotors may not be deployed
  restowHold: 3,                 // s minimum between stow and unstow (chatter guard)
});

/* ---------- Cruise (pusher) propeller ---------- */
export const PROP = deepFreeze({
  diameter: 2.4,
  maxShaftKw: 260,
  staticThrust: 7000,            // N
  eta: 0.85,                     // propulsive efficiency on ideal momentum power
  brakeThrust: 0.08,             // g of windmill/regen braking available (S key or AP decel)
});

/* ---------- Battery pack ---------- */
export const PACK = deepFreeze({
  vMax: 720, vMin: 520,          // open-circuit voltage range (V)
  rInt: 0.08,                    // ohm
  iMax: 900,                     // A continuous
  vCut: 450,                     // V minimum terminal voltage
  motorEff: 0.92,                // electrical->shaft
  baseKw: 4,                     // avionics, cooling
  reserve: 0.20,                 // SOC reserve: RESERVE annunciation, land-now advisory
  low: 0.08,                     // SOC: critical
  cutoffSoc: 0.02,               // below this, available power is cut progressively to 0
  emptySoc: 0.015,               // at or below this the BMS disconnects: battery reads 0, power lost
  tempAmbient: 25, heatCap: 1.0e6, coolW: 600, // °C, J/K, W/K
  tempWarn: 55, tempLimit: 60, tempMax: 75,   // °C: derate linearly from limit to 50 % at max
});

/* ---------- Airspeed limits (IAS, m/s) — for the PFD speed tape ---------- */
export const SPEEDS = deepFreeze({
  vs: 26.3,          // 1 g stall, clean (≈51 kt)
  vr: 28,            // rotation speed for wheeled take-off
  vStow: PHYS.stowSpeed,
  vUnstow: PHYS.unstowSpeed,
  vDeployMax: ROTOR.maxDeploySpeed,
  vlo: 41,           // gear operating (≈80 kt)
  vle: 51,           // gear extended (≈100 kt)
  vmo: 72,           // max operating (≈140 kt)
  vne: 80,           // never exceed (≈155 kt)
  hoverMax: 12,      // m/s ground speed commanded at full W/S/Q/E in hover
  rearMax: 7,        // m/s rearward airspeed protection (≈14 kt)
  vrsSpeed: 12.9,    // m/s (25 kt): below this, rotor-borne descent is limited
  vrsSinkLimit: 2.54,// m/s (500 fpm)
});

/* ---------- Touchdown / crash classification ---------- */
export const CRASH = deepFreeze({
  firmFpm: 120,      // above: firm
  hardFpm: 300,      // above: hard (gear damage flag)
  crashFpm: 600,     // above: crash
  bellyKt: 20,       // gear-up touchdown faster than this: crash
  wheelsMaxKt: 90,   // wheeled touchdown faster than this: crash
  bankDeg: 15,       // wing-tip strike
  pitchDeg: 20,      // tail / nose strike
  bodyRadius: 3,     // m: margin around the fuselage for building collision
  edgeKt: 5,         // climbing into a roof edge faster than this: building collision
});

/* ---------- Environment ---------- */
export const WIND_DIR = 0.9; // radians; default direction the wind blows toward (windsock points this way)
export const ATMOS = deepFreeze({
  rho0: 1.225,
  windRefHeight: 10,           // m: S.wind is the speed at this height
  windShearExp: 1 / 7,         // power-law profile
  gustScale: 50,               // m (Dryden length scale, low altitude)
  gustIntensity: 0.15,         // sigma as a fraction of the mean wind
});

/* ---------- Time-of-day presets ----------
   top/hor: sky gradient, fog: fog colour, hs/hg/hi: hemisphere sky/ground/intensity,
   sc/si: sun colour/intensity, dir: sun direction, win: city window emissive, exp: reserved */
export const TOD = deepFreeze({
  day:  {top:0x4a8fd6, hor:0xcfe3f2, fog:0xbdd6ea, hs:0xdbeeff, hg:0x6b7a4a, hi:.95, sc:0xffffff, si:1.7, dir:[.5,1,.35], win:0, exp:1},
  dusk: {top:0x2d3f73, hor:0xf2a274, fog:0xd99a7c, hs:0xffcfa8, hg:0x3e3540, hi:.6, sc:0xffa060, si:1.2, dir:[-.9,.22,.25], win:.6, exp:1},
  night:{top:0x02050d, hor:0x15223a, fog:0x0d1626, hs:0x324a78, hg:0x0b0c12, hi:.35, sc:0x9fb4ff, si:.28, dir:[.3,1,.5], win:1.2, exp:1},
});
