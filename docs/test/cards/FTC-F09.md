# Flight test card FTC-F09 — Stall-speed determination in fixed-wing mode

DBF-TP-001 rev B · Test F09 · Review step: not in the review matrix; docs/research/aerodynamics.md M2; decides R11 · Requirements: R11

**Prerequisites (signed in test-matrix.csv):** F08 passed (airspeed calibrated, ARSPD_RATIO 1.5-3.0); pilot rehearsed Q_ASSIST force-off, stall and recovery in SITL

**Configuration:** As F08 with 0.5 kg ballast (CG 28 % MAC; the stall must be measured at the mission CG). CH8 Q_ASSIST 3-position (RC8_OPTION 82): auto for points 1-2, force-off for point 3 only. AIRSPEED_STALL 12 (vtol_c0.param).

**Weather limits:** Steady <= 4 m/s EST, gusts <= 6 m/s EST; smooth air; morning preferred.

**Predicted:** Vs 11.75 m/s at 6.55 kg with CL_max,3D 1.114 (aero_results stall.V_stall_mps; critical-section method on the AVL loading; 2-D CL_max 1.30 adopted from experiment at Re 2e5); the sizing uses the same CL_max at the 11.75 m/s design stall target (results.json base.Vs, sized.S 0.682 m2, W 64.2 N; docs/research/stall-margin.md); margin to R11 2.1 % on speed, 4.1 % on CL_max. Pitch at the break ~10.8 deg (stall.trim_at_Vstall.alpha_deg). C0 SITL model: 11.75 m/s, alpha 11.2 deg / elevator -8.4 deg at the break (firmware/sitl/README.md).

**Crew:** TD, SO, PIC, GCS · **Duration:** 1 session (3 runs), 2 packs

## Pre-flight (every flight)
- [ ] Flight request approved for today and site (R19); Remote ID powered, broadcast seen (E12); registration mark on the pod; PIC TRUST/AMA documents on site (R18).
- [ ] Weather recorded: wind steady ____ m/s, gusts ____ m/s (limit on this card), temp ____ degC, visibility >= 3 sm, no precipitation.
- [ ] Weight and CG per G01: take-off mass ____ kg (<= 7.53 kg), CG ____ % MAC (28 +-2, never aft of 31.8), 0.5 kg ballast fitted (mandatory without payload; GA sheet note 5): Y / N; leg fairings on: Y / N.
- [ ] Props: correct rotation, screws witness-marked, no nicks; pusher spin check.
- [ ] Witness lines on boom clamps, gear clamps, wing bolts unmoved.
- [ ] Packs >= 4.15 V/cell; pack strapped (J18); plugged in LAST through the XT90-S.
- [ ] GCS: firmware hash ____; parameters checked with check_params.py; FENCE_ALT_MAX = site ceiling; FENCE_RADIUS = ____ m; EKF/GPS ok (sats >= 10, HDOP <= 1.5); compass consistent; airspeed 0 +-1 m/s, blow test >= 6 m/s.
- [ ] RC: arm switch CH5 off, mode CH6 in slot for this card, E-stop CH7 off, Q_ASSIST CH8 auto, RTL CH9 off; LQ >= 90 %.
- [ ] Range: crew line 30 m upwind, fire bag + extinguisher + first aid at the line, spectators behind, no people downrange, sky scan.
- [ ] Crew brief: TD states the build-up points, abort word "ABORT", who calls what. Timer ready.

## Hover limits on this aircraft (R14 accepted limitation, DESIGN-BASIS.md)
Hover-only flights: <= 5 m AGL and <= 60 s per hover; cool motors < 45 degC between hovers. C0 cannot survive a lift-motor failure in hover.

## Transition rule (firmware/README.md 9.6; SITL finding)
Start every transition at the upwind field edge and turn as soon as 'Transition done' appears: a straight transition reached the 300 m fence circle ~6 s after transition end in SITL. Telemetry: CRSF on the handset (or the ELRS MAVLink overlay); no separate radio.

## Back-transition watch (C0 SITL model; firmware/sitl/README.md 'Gains' item 1)
In the C0 airframe model the back-transition airbrake pitches the nose to the 30 deg VTOL angle limit with the lift motors near idle, which briefly stalls the wing (alpha_stall ~11 deg); position2 then recovers with a -17/+33 deg pitch swing and an 89 A peak; altitude loss stayed under 2 m (1.7 m in scenario A, firmware/sitl/results_c0.json). Back-transition only at >= 30 m AGL, wings level, into wind. Watch for pitch-up past 30 deg, a wing drop, sink > 2 m or current > 85 A. If seen: land, review ATT / QTUN / BAT, and lower Q_TRANS_DECEL first (2.0 now; a gentler, longer stop: v^2 / 2a = 133 m at 1.5 m/s2 from 20 m/s, calc) before Q_ANGLE_MAX or any attitude gain.

## Build-up points (in order; stop and review the log between points when the card says so)
1. [ ] Transition from the upwind edge; climb to 80 m AGL EST (margin for a 30 m loss plus the 20 m Q_ASSIST_ALT floor) into wind, inside the fence circle.
2. [ ] Q_ASSIST auto: in FBWA reduce throttle slowly, hold altitude; note the airspeed at which the lift motors engage (expect 13 m/s). Recover with throttle.
3. [ ] Q_ASSIST forced off (CH8): throttle to idle, hold altitude with elevator, decelerate at <= 0.3 m/s2 EST, wings level with small aileron inputs, until the pitch break (nose drop or wing drop) or the elevator stop; the GCS calls the indicated airspeed at the break; recover (nose down, throttle up, CH8 to auto if needed). Three runs, each starting at >= 80 m.
4. [ ] Set CH8 back to auto. Back-transition and QLAND.

## Abort criteria (card-specific items first, then the universal list)
- Roll departure > 45 deg, spin tendency, or altitude < 50 m during a run: throttle up, nose down, CH8 to auto, level the wings.
- Elevator at the stop with no break: end the run and record the speed as 'no break at ____ m/s'.
- Any Q_ASSIST engagement with CH8 forced off (configuration error).
Universal (TEST-PLAN.md s5): VIBE > 30 m/s2 or rising clipping; attitude error > 15 deg; any oscillation; sag-compensated voltage < 21.0 V or < 1,950 mAh remaining (firmware low-battery RTL point; critical 19.8 V / 1,300 mAh -> QLAND); motor can > 80 degC EST after landing; wind above the card limit; LQ < 70 % EST or any failsafe message; EKF/GPS/compass warning; people or animals inside the range; manned aircraft converging.

## Data to record
ARSP.Airspeed (calibrated) and CTUN.As at the pitch break for each run; ATT pitch/roll time history; RCOU elevator (C3) at the break vs the throw limit; BARO/GPS altitude loss per run; MSG (assist engage in point 2); wind at the time.

## Pass criteria
- [ ] Measured Vs (mean of three runs, calibrated airspeed, corrected to MTOW 6.55 kg by Vs_MTOW = Vs_test x sqrt(6.55 / m_test)) <= 12.0 m/s = PASS (R11). Record the margin used against the 11.75 m/s design target; set AIRSPEED_STALL = measured Vs and AIRSPEED_MIN = max(16, 1.3 x Vs rounded up) (docs/research/stall-margin.md 5).
- [ ] 12.0 < Vs <= 12.5 m/s = team decision: accept (R11 is an assumed value) or add 5 % wing area (docs/research/aerodynamics.md 9 item 3); > 12.5 m/s = FAIL (aerodynamics.md M2).
- [ ] AIRSPEED_MIN 16 >= 1.3 x measured Vs, i.e. Vs <= 12.3 m/s; otherwise raise AIRSPEED_MIN to 1.3 x Vs and Q_ASSIST_SPEED to AIRSPEED_MIN - 3.
- [ ] Elevator at the break < the full throw (reserve present; prediction -8.2 deg at Vs, aero_results stall.trim_at_Vstall.elevator_deg; the tail section stalls near 8 deg local incidence, aerodynamics.md 5).
- [ ] Altitude loss per run <= 30 m EST; no roll departure > 45 deg (root-first stall predicted: critical section inboard, aerodynamics.md 4).
- [ ] Q_ASSIST engagement observed at 13 +-1 m/s with assist in auto (Q_ASSIST_SPEED 13).

## Run log

| Run | Time | Pack V/cell start | Wind | Point reached | Result | Notes |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |

## Post-flight (every flight)
- [ ] IR temperatures within 30 s: M1 ____ M2 ____ M3 ____ M4 ____ pusher ____ ESC max ____ pack ____ degC (any unit 15 degC hotter than its neighbours or pack > 60 degC EST grounds the aircraft).
- [ ] Pack: resting V/cell ____; mAh returned on charge ____.
- [ ] Airframe walk-round: witness lines, prop nicks, foam skin, gear.
- [ ] Log copied from the SD card and named `YYYY-MM-DD_F09_r<n>_C0.bin`; run `docs/test/analysis/log_summary.py` on it.
- [ ] Post-flight report filed within 3 business days for on-campus flights (R19).
- [ ] Result: PASS / PASS WITH LIMITS / FAIL. TD ______ SO ______ PIC ______ Date ______
