# SITL rehearsal — C0 parameter set on ArduPlane 4.7.2

**Executed 2026-10-21 on Windows. 7/7 scenarios passed.** Results are in `results/`: `summary.json`, one CSV per
scenario, and `console.log` with the autopilot's status text.

## What was run

| Item | Value |
|---|---|
| SITL binary | ArduPlane **V4.7.2** (fbd0a316), the Windows/cygwin build Mission Planner uses: https://firmware.ardupilot.org/Tools/MissionPlanner/sitl/PlaneStable/ (`ArduPlane.elf` + `cyg*.dll`, run as `ArduPlane.exe`) |
| Model | `quadplane`: ArduPilot's generic QuadPlane. Lift motors on outputs 5–8; aileron/elevator/throttle/rudder on 1–4 (`libraries/SITL/SIM_QuadPlane.cpp`, `SIM_Plane.cpp`) |
| Defaults chain | `Tools/autotest/default_params/quadplane.parm` (ArduPilot's SITL model tune and sensor cal) → `../vtol_c0.param` → `sitl_overrides.param` |
| Overrides | output remap to the SITL model, PWM instead of DShot, SITL airspeed (type 100), SITL battery pins, simulated 6S 6500 mAh pack, SITL serial ports |
| Driver | `mission_test.py` (pymavlink 2.4.50), speed-up 5×, home 37.9156, −122.3366 (placeholder, not the real field) |
| Parameter read-back | 133 parameters from the files read back from the running firmware: all equal. 3 absent in SITL: `SERVO_BLH_AUTO/MASK/OTYPE` (no BLHeli in SITL) |

WSL is not installed on this PC (`wsl -l -v` → "not installed"), so the Linux `sim_vehicle.py` route was not used.
The Mission Planner SITL binary gives the same firmware without WSL.

## Scenarios and results

| # | Scenario | Expected | Result |
|---|---|---|---|
| A | QLOITER take-off to 35 m → AUTO: 6 waypoints at 60 m → NAV_VTOL_LAND at home | transition, loop, back-transition, vertical landing, disarm | PASS. "Transition airspeed reached 16.0" 5 s after the transition started; "Transition done" 10–11 s after AUTO; landed 0.1 m from home |
| B | FBWA transition → fixed-wing LOITER → RC lost (`SIM_RC_FAIL=1`) | RTL → QRTL → land at home, no fence involvement | PASS ("RC Long Failsafe On: switched to RTL") |
| C | QLOITER hover at 15 m → RC lost | QLAND in place | PASS ("RC Short Failsafe: switched to QLand") |
| D | FBWA selected with the throttle low (no pusher thrust) | `Q_TRANS_FAIL` 15 s → QRTL → land | PASS ("Transition failed, exceeded time limit" 15 s after the transition started) |
| E | fixed-wing LOITER → `BATT_LOW_MAH` raised to 6400 | low-battery RTL → QRTL → land at home | PASS ("Battery 1 is low") |
| F | QLOITER full-throttle climb | "Max Alt fence breached" at 110 m → RTL → QRTL; peak < 121.9 m | PASS, peak 113.1 m |
| G | receiver RC removed; RC only as `RC_CHANNELS_OVERRIDE` (how an ELRS RX in MAVLink mode sends it); overrides stop in hover | RC failsafe → QLAND | PASS, failsafe 1–2 s after the overrides stopped (`RC_FS_TIMEOUT` 1 s) |

Log-derived (dataflash log of an earlier full run): attitude-tracking error RMS 0.67° roll / 0.62° pitch in VTOL
modes, 4.5° / 1.7° in fixed-wing modes.

## What SITL does and does not prove

- **Proves** (for firmware 4.7.2): every parameter name and value is accepted. Modes, transition thresholds,
  `Q_TRANS_FAIL`, `Q_RTL_MODE` landing, RC/battery/fence failsafes and the AUTO VTOL mission all behave as intended.
- **Does not prove**: the C0 gains, hover throttle, power or endurance. The SITL model is a generic QuadPlane
  (learned `Q_M_THST_HOVER` 0.15, against about 0.49 est. for C0). Board items — DShot, BLHeli passthrough, the
  CoreWing UART/ADC map, the airspeed I²C address — are replaced by SITL equivalents.
- **Finding from the first run:** a straight FBWA transition left the 300 m fence circle about 6 s after
  "Transition done". The scenarios now go into fixed-wing LOITER right after the transition. Pilots must start the
  turn at once (README §9.6).

## Re-running it

### Windows (as executed)
```powershell
py -m venv venv; .\venv\Scripts\python -m pip install pymavlink
# get ArduPlane.elf + all cyg*.dll from https://firmware.ardupilot.org/Tools/MissionPlanner/sitl/PlaneStable/
# into one folder, copy ArduPlane.elf to ArduPlane.exe
# get quadplane.parm from https://github.com/ArduPilot/ardupilot/blob/master/Tools/autotest/default_params/quadplane.parm
.\venv\Scripts\python firmware\sitl\mission_test.py --sitl-exe C:\sitl\ArduPlane.exe `
    --defaults-base C:\sitl\quadplane.parm `
    --params firmware\vtol_c0.param firmware\sitl\sitl_overrides.param --out sitl_out
```
A full run (A–G) takes about 25 minutes at 5×. `--scenarios AC` runs a subset.

### Linux / WSL (sim_vehicle.py)
```bash
git clone --recurse-submodules https://github.com/ArduPilot/ardupilot && cd ardupilot
git checkout Plane-4.7.2   # tag name per the releases page
Tools/environment_install/install-prereqs-ubuntu.sh -y && . ~/.profile
sim_vehicle.py -v ArduPlane -f quadplane -w --add-param-file=../firmware/vtol_c0.param \
   --add-param-file=../firmware/sitl/sitl_overrides.param --no-mavproxy
python3 firmware/sitl/mission_test.py --connect tcp:127.0.0.1:5760 \
   --params firmware/vtol_c0.param firmware/sitl/sitl_overrides.param --out sitl_out
```
(Linux route not executed here. `--add-param-file` per `sim_vehicle.py --help`; check against your checkout.)

### Hand-flying practice
Mission Planner > Simulation > Plane > QuadPlane, then load `vtol_c0.param` and `sitl_overrides.param`. Fly with
the Pocket Crush as a USB joystick (https://ardupilot.org/planner/docs/mission-planner-simulation.html).


---

# C0 airframe model — SITL with the aircraft's own physics (2026-10-25)

The run above flies ArduPilot's generic QuadPlane. This section replaces it with a 6-DOF model of C0 itself,
connected through ArduPilot SITL's JSON external-physics interface, so transitions can be rehearsed and gains
pre-tuned on this airframe. **Executed 2026-10-25 on Windows: 7/7 scenarios passed** on the C0 model with
`vtol_c0.param` unchanged. Results: `results_c0.json` (summary), `results_c0/` (one CSV per scenario, the
autopilot console, the trim validation), `validation_c0.json`.

## Approach

| Item | Choice | Why |
|---|---|---|
| Interface | ArduPilot SITL `--model JSON:127.0.0.1` (libraries/SITL/SIM_JSON.cpp; spec in libraries/SITL/examples/JSON/readme.md, github.com/ArduPilot/ardupilot, checked 2026-10-25) | Works with the same ArduPlane 4.7.2 Windows binary already used (no WSL on this PC, no rebuild); the physics is a plain Python file the team can read and change; SITL stays lock-stepped to it (SITL sends 16 PWM values per frame, the model answers with IMU, position, velocity, quaternion, airspeed and battery). JSBSim was the alternative: it needs a JSBSim install plus an FDM-format airframe and a separate rotor model; the JSON route needs nothing new. |
| Physics | `c0_physics.py`, pure Python, 400 Hz (SITL's frame rate), 2 substeps | Rigid body, quaternion attitude; wing+tail linear aero from the AVL run (lift, drag polar, Cm, all stability and control derivatives), 3-D CL_max stall with a post-stall lift collapse, flat-plate forces when the flow is from the side or behind (hover descent, tail slide); 4 lift rotors (thrust-vs-PWM with the maker thrust/power table, reaction torque); pusher (APC 14x8.5E Ct/Cp vs advance ratio + DC-motor model); 4-point landing-gear contact; 6S pack with sag and state of charge. |
| Data | Read at start-up from `analysis/results.json`, `analysis/aero/aero_results.json`, `analysis/aero/out/avl/st_pod_trim.txt`, `cad/params.txt`, the parameter files | Follows the design automatically (the stall-target change of 2026-10-25 flowed through without editing the model). Items the repo does not give are estimates, listed by `--validate` and in `validation_c0.json` (`EST`). |
| Output map | The model reads `SERVOn_FUNCTION/MIN/MAX/TRIM/REVERSED` | The real map of `vtol_c0.param` section 2 is flown (S1-S2 ailerons, S3 elevator, S4+S11 rudders, S5-S8 lift motors, S9 pusher). No remap file as the generic model needed. |
| Parameters | `sitl_c0_defaults.parm` → `../vtol_c0.param` → `sitl_c0_overrides.param` | The defaults file keeps only the simulator sensor calibration from ArduPilot's `quadplane.parm`; its tuning gains (made for the generic SITL model) are left out, so the firmware defaults + `vtol_c0.param` are what flies, as on the real board. The overrides replace board-only items (DShot, BLHeli, ADC pins, UARTs, the MS5525 driver). |

Data versions used for the numbers below (final for this iteration): `results.json` generated 2026-10-25
(MTOW 6.552 kg, chord 0.2842 m, S 0.682 m²), `aero_results.json` generated 2026-10-25 with the corrected AVL
model (rudder derivatives now non-zero: Cnδr +0.000736/deg, CYδr −0.002116, Clδr −0.000056; aileron Clδa
−0.006722 with adverse yaw Cnδa +0.000287; elevator CLδe 0.007386, Cmδe −0.018412, all read from
`analysis/aero/out/avl/st_pod_trim.txt`), `cad/params.txt` rev D of 2026-10-25 (leg stations ±0.381 m from the
CG, prop heights). The model re-signs the AVL derivatives so that a positive command is roll right / nose up /
nose right (ArduPilot's output convention) and carries the couplings with the same factor. The thin-airfoil
rudder estimate is kept only as a fallback for an st file without Cnd03.

## Trim validation (`python c0_physics.py --validate`, full table in `results_c0/validation.txt`)

| Check | Model | Analysis prediction | Source of the prediction |
|---|---|---|---|
| Hover thrust fraction per motor at 22.2 V | 0.523 | 0.52 | TEST-PLAN C07: `sized.Tunit_g` / `params.Tmax_g` (same formula: a consistency check) |
| Hover thrust fraction at 25.2 V (what `Q_M_THST_HOVER` learns on a full pack: ArduPilot scales thrust to `Q_M_BAT_VOLT_MAX`) | 0.451 | — (SITL learned 0.44 by the end of the run) | maker 3600 gf at 25 V, 3130 gf at 22.2 V, linear in between (EST) |
| Hover PWM fraction (physical, expo 0.72 EST) | 0.62 at 25.2 V / 0.68 at 22.2 V | — (SITL flew 0.62–0.66, 0.64 in the final run) | |
| Hover electrical power, 4 motors | 842 W | 916 W (−8 %) | maker thrust/power table vs the sizing's FM·η model (`sized.P_hover`) |
| Cruise 20 m/s: α | 2.84° | 2.86° | `aero_results.trim_cruise` |
| Cruise: elevator | −3.45° | −3.45° | AVL trim |
| Cruise: CL | 0.382 | 0.385 | |
| Cruise: drag = pusher thrust | 7.69 N | 7.70 N | `drag.cruise.D_N` |
| Cruise: pusher electrical power | 233 W (6200 rpm, 14.0 A, J 0.54) | 302 W (−23 %) | `drag.cruise.P_elec_W` assumes η_prop 0.60; the APC data give η ≈ 0.74 at this J. The −23 % is the η assumption, not the drag. The SITL cruise current was 10.2 A mean. |
| Pusher static thrust, full throttle, 22.2 V | 3.35 kgf at 626 W, 28 A (EST motor R, I0) | — (no vendor data for the 14x8.5 on this motor) | at 25.2 V the model gives 890 W static: above the motor's 615 W rating. Do not hold full pusher throttle static on a full pack (bench test M1). |
| Stall speed, 1 g, trimmed | 11.75 m/s | 11.75 m/s | `stall.V_stall_mps` |
| α / elevator at stall | 11.2° / −8.4° | 10.8° / −8.2° | `stall.trim_at_Vstall` |
| Static margin −Cmα/CLα | 11.8 % MAC | 12.3 % | `neutral_point.static_margin_pct.CG_28pct` |

## Scenario results on the C0 model (`results_c0.json`; final data, speed-up 5, 5.6 min wall for 1290 s of flight)

| # | Scenario | Result | Transition / key numbers |
|---|---|---|---|
| A | QLOITER take-off → AUTO loop (6 WPs at 60 m) → NAV_VTOL_LAND | PASS, landed 0.0 m from home | Forward transition 13 s, 140 m, no altitude loss (+4.7 m), 17.5 m/s at "Transition done", peak 69.5 A. Back-transition (airbrake → position1 → position2) 7 s, 35 m, 1.6 m altitude loss, 88 A peak for a moment, pitch excursion −17°/+33° while stopping (see Gains). Learned `Q_M_THST_HOVER` 0.33 after this first flight, 0.44 by the end of the run (model prediction 0.45 on a full pack). |
| B | FBWA transition → LOITER → RC lost | PASS (RTL → QRTL → land, no fence) | Transition 14 s, 154 m, 1.5 m loss, 18.7 m/s at done. QRTL stop 10 s, 126 m, 0 m loss, peak 58.5 A. |
| C | QLOITER hover 15 m → RC lost | PASS (QLAND) | Hover: motors 0.64 PWM fraction, 37.8 A mean at 23.7–24.4 V, attitude within ±0.2°. |
| D | FBWA with throttle low | PASS | "Transition failed, exceeded time limit" 15 s after start; QRTL after 16 s; landed. |
| E | LOITER, `BATT_LOW_MAH` raised | PASS | "Battery 1 is low" → RTL → QRTL → land, 0 m loss in the stop, peak 74.8 A. |
| F | QLOITER full-throttle climb | PASS, peak 112.9 m < 121.9 m | Breach at 111 m. |
| G | RC only via MAVLink overrides, overrides stop in hover | PASS | QLAND 2.0 s after the overrides stopped (`RC_OVERRIDE_TIME` 3 s is the window that must expire; the previous run saw 1 s). |

Cruise in A (70 s at 19.9 m/s): α 3.1°, elevator −3.5°, pusher 0.68, 10.1 A mean, pitch sd 1.5°, lift motors
off. This matches the trim table above. Compared with the run on the pre-fix AVL file (estimated rudder, CAD
rev C legs) every scenario result is within the run-to-run scatter: transition times unchanged (13/14 s),
distances within 10 m, altitude losses within 0.3 m, peak currents within 17 A (B's back-transition peak fell
from 75 to 59 A).

## Gains

No gain change was needed for the C0 model to fly all seven scenarios stably with `vtol_c0.param` as it stands
(VTOL rate/angle gains at the firmware defaults plus the section-5 filter and accel values, fixed-wing gains at the
defaults). `vtol_c0_sitl_tuned.param` was therefore **not** created. Two behaviours to watch in flight, not
tuned here because the model's estimates (inertia, expo, surface travel) are what sets them:
1. The back-transition stop pitches to the 30° VTOL angle limit with the lift motors near idle (ArduPilot's
   "airbrake" phase), which stalls the C0 wing (α_stall 11°): position2 then recovers with a −17°/+33° pitch
   swing and an 89 A peak. Altitude loss stayed under 2 m. If the real aircraft does the same, lower
   `Q_TRANS_DECEL` (longer, gentler stop) or `Q_ANGLE_MAX` before changing attitude gains.
2. QLOITER climbs overshoot the target by 3–5 m with the default `Q_P_*` position gains at the first-flight
   `Q_M_THST_HOVER` 0.25 (hover learn then corrects it). Expected; set `Q_P_D_ACC_*` from the learned value
   per README §9.4.

## Known limitations of the model

- No propeller slipstream over the wing or tail (pusher wash on the tail, lift-rotor downwash on the wing/tail).
  Elevator authority at low speed is therefore the bare AVL value.
- Lift-rotor thrust does not change with airspeed or climb rate (no inflow/momentum correction) and the
  rotors have no in-plane (H-force) drag; stopped-rotor drag is in `CD0_total` from the drag build-up.
- Linear AVL aero is clamped 20° beyond stall and faded out between 35° and 70° of α or β; beyond that a
  flat-plate model (CN 1.1, EST) carries the wing, tail and fins. Reversed-flow behaviour is an estimate.
- Control derivatives are the AVL values (per degree, linear); no hinge-moment or servo-rate limits, and no
  loss of effectiveness beyond stall other than the overall fade of the linear model. The thin-airfoil rudder
  estimate (EST, within 7 % of the AVL value) is used only if the st file lacks Cnd03.
- Inertia is a point-mass/rod estimate from `cg.items` (Ixx 1.10, Iyy 0.77, Izz 1.83 kg m² EST); CG on the chord
  line (as in AVL). Surface travel ±20° (SIM_Plane default), lift thrust expo 0.72, pusher motor R 0.08 Ω and
  I0 0.8 A, pack resistance 0.03 Ω are estimates.
- Ground: four spring-damper-friction points at the leg tips on a flat plane; no leg flex; no wind gusts
  (steady wind only, `--wind speed,from_deg`).
- Sensors are SITL's own (noise-free IMU from the model, SITL GPS/baro/compass); the airspeed field is the
  model's true airspeed.
- Speed: about 4–5× real time on this PC with the pure-Python model (speed-up 5 requested).

## Re-running it

```powershell
# scripted scenarios (results to firmware/sitl/results_c0 and results_c0.json)
.\venv\Scripts\python firmware\sitl\mission_test.py --sitl-exe C:\sitl\ArduPlane.exe `
    --model JSON:127.0.0.1 --physics firmware\sitl\c0_physics.py `
    --defaults-base firmware\sitl\sitl_c0_defaults.parm `
    --params firmware\vtol_c0.param firmware\sitl\sitl_c0_overrides.param `
    --out firmware\sitl\results_c0 --summary firmware\sitl\results_c0.json
# trim checks only
py firmware\sitl\c0_physics.py --validate --params firmware\sitl\sitl_c0_overrides.param
# hand-flying: physics + SITL, connect Mission Planner to TCP 127.0.0.1:5760
.\firmware\sitl\run_c0_sitl.ps1 -SitlExe C:\sitl\ArduPlane.exe -Speedup 1 [-Wind "3,270"]
```
`c0_physics.py` needs only the Python standard library; `mission_test.py` needs pymavlink (it sets
`MAVLINK20=1` itself). The physics writes `physics_log.csv` (true state, controls, currents) next to the results.
