# Flight test card FTC-F07 — Full transition, fixed-wing circuit, back-transition, QLAND

DBF-TP-001 rev B · Test F07 · Review step: F6 · Requirements: R1, R9, R11, R14 (cruise part), R16

**Prerequisites (signed in test-matrix.csv):** F06 passed three times; logs reviewed; both packs charged; spare props on site

**Configuration:** As F06. Mode slots 4 FBWA, 5 CRUISE, 6 QLAND. AIRSPEED_MIN 16, AIRSPEED_CRUISE 20, Q_TRANSITION_MS 5000.

**Weather limits:** Steady <= 5 m/s, gusts <= 8 m/s; into wind; one flight in 3-5 m/s steady wind if available counts for R16.

**Predicted:** Cruise thrust 8.6 N at L/D 7.5 (results.json sized.D_cruise, LD v0.4) or 7.7 N at L/D 8.3 (aero_results drag.cruise); cruise power 337 W sizing / 302 W aero (15.2 / 13.6 A at 22.2 V); C0 SITL model 233 W, 10.2 A mean in cruise (eta_prop ~0.74 from the APC data vs 0.60 assumed; firmware/sitl/README.md); back-transition stop distance 100 m (vtol_c0.param Q_TRANS_DECEL comment).

**Crew:** TD, SO, PIC, GCS · **Duration:** 1 session (2 flights), 2 packs

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
1. [ ] Climb QLOITER to 30 m AGL into wind at the upwind field edge; FBWA, throttle 70-75 %; hold level; transition completes at AIRSPEED_MIN 16 m/s and the lift motors taper over 5 s (Q_TRANSITION_MS). START THE TURN as soon as 'Transition done' appears (SITL: a straight run reaches the 300 m fence ~6 s later).
2. [ ] Climb to 50 m AGL at 18 m/s; one left-hand circuit (~300 m legs) in FBWA; note trim and the throttle for level flight.
3. [ ] Second circuit in CRUISE at 20 m/s if FBWA was clean.
4. [ ] Turn final into wind at 50 m; select QHOVER at the pad (back-transition: Q_TRANS_DECEL 2 m/s2, ~100 m stopping distance from 20 m/s), then QLAND.
5. [ ] Repeat on the second pack (review F7 entry: F6 twice).

## Abort criteria (card-specific items first, then the universal list)
- Q_TRANS_FAIL at 15 s (review F6) -> the autopilot goes QRTL; PIC monitors.
- Airspeed stuck below 14 m/s with pusher at 100 %; pitch oscillation in FBWA; roll rate > 90 deg/s uncommanded; altitude < 20 m in fixed-wing flight (Q_ASSIST_ALT).
Universal (TEST-PLAN.md s5): VIBE > 30 m/s2 or rising clipping; attitude error > 15 deg; any oscillation; sag-compensated voltage < 21.0 V or < 1,950 mAh remaining (firmware low-battery RTL point; critical 19.8 V / 1,300 mAh -> QLAND); motor can > 80 degC EST after landing; wind above the card limit; LQ < 70 % EST or any failsafe message; EKF/GPS/compass warning; people or animals inside the range; manned aircraft converging.

## Data to record
QTUN.TrnMs; ARSP; GPS track (transition distance from mode change to AIRSPEED_MIN); CTUN.ThrOut in level flight; RCOU C5-C8 during cruise; BAT; ATT in the 3-5 m/s wind case.

## Pass criteria
- [ ] Transition time <= 15 s and distance <= 100 m (review 10 M2); SITL 10-11 s on the generic model, 13-14 s on the C0 airframe model (firmware/sitl/results_c0.json). Turn started <= 3 s after Transition done (log: roll command vs the message time).
- [ ] Lift outputs RCOU C5-C8 at Q_M_PWM_MIN (1000) for >= 95 % of the fixed-wing segment (R1 'lift rotors stopped in cruise').
- [ ] Level flight at 18-20 m/s with pusher throttle <= 70 % EST; cruise current near 13.6-15.2 A (aero 302 W / sizing 337 W).
- [ ] Back-transition and QLAND with touchdown <= 1 m/s EST and no yaw departure.
- [ ] If flown in 3-5 m/s wind: attitude error < 15 deg throughout (R16).

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
- [ ] Log copied from the SD card and named `YYYY-MM-DD_F07_r<n>_C0.bin`; run `docs/test/analysis/log_summary.py` on it.
- [ ] Post-flight report filed within 3 business days for on-campus flights (R19).
- [ ] Result: PASS / PASS WITH LIMITS / FAIL. TD ______ SO ______ PIC ______ Date ______
