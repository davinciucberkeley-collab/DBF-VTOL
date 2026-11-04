# Flight test card FTC-F03 — QLOITER free hover, 3 x 60 s, thermal and endurance point

DBF-TP-001 rev B · Test F03 · Review step: F3 · Requirements: R9, R13

**Prerequisites (signed in test-matrix.csv):** F02 passed; notch filter set from the F02 FFT (INS_HNTCH_ENABLE 1) and verified on a short hover

**Configuration:** As F02 with the notch enabled. Mode slot 3 QLOITER. GPS lock with sats >= 10.

**Weather limits:** Steady <= 3 m/s EST, gusts <= 5 m/s EST.

**Predicted:** Hover electrical power 916 W total (results.json sized.P_hover v0.4); lift-unit thermal model (docs/research/thermal.md 6.1, 20 % loss EST): motor can +28 K and ESC +21 K over ambient after a 60 s hover (63 / 56 degC on a 35 degC day), 74 / 63 degC at 90 s; motor-only lumped check 76 degC at 90 s (cad/README.md). Hot day (ambient >= 25 degC EST): TEST-PLAN.md s6 hot-day rules apply; the 60 s hover limit stays.

**Crew:** TD, SO, PIC, GCS · **Duration:** 1 session, 2 packs

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

## Build-up points (in order; stop and review the log between points when the card says so)
1. [ ] Take off in QHOVER to 3 m, switch to QLOITER, hands off 60 s. Land; cool < 45 degC (IR every 30 s, record the cooling curve).
2. [ ] Second 60 s QLOITER hover at <= 5 m: 1 m/s translations fore/aft and left/right, return to the pad.
3. [ ] Third 60 s QLOITER hover: yaw 90 deg left and right; land.
4. [ ] Record motor temperatures after each hover within 30 s.

## Abort criteria (card-specific items first, then the universal list)
- Position drift > 3 m in QLOITER (EKF/GPS issue); toilet-bowling (compass); motor > 80 degC after any hover.
Universal (TEST-PLAN.md s5): VIBE > 30 m/s2 or rising clipping; attitude error > 15 deg; any oscillation; sag-compensated voltage < 21.0 V or < 1,950 mAh remaining (firmware low-battery RTL point; critical 19.8 V / 1,300 mAh -> QLAND); motor can > 80 degC EST after landing; wind above the card limit; LQ < 70 % EST or any failsafe message; EKF/GPS/compass warning; people or animals inside the range; manned aircraft converging.

## Data to record
QTUN.ThO; POS/GPS position hold error; BAT Curr mean per hover; IR temperatures vs time; VIBE; RCOU.

## Pass criteria
- [ ] 3 x 60 s at <= 5 m AGL with motors cooled below 45 degC between (review F3).
- [ ] Position held within 2 m EST in QLOITER; attitude error < 15 deg.
- [ ] Motors <= 80 degC EST after each hover (review F3 abort; C08 prediction 74 degC at 90 s on a 35 degC day, thermal.md 6.1).
- [ ] Hover current 41.2 A +-15 % EST (results.json sized.I_hover); sag-compensated voltage >= 21.0 V.

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
- [ ] Log copied from the SD card and named `YYYY-MM-DD_F03_r<n>_C0.bin`; run `docs/test/analysis/log_summary.py` on it.
- [ ] Post-flight report filed within 3 business days for on-campus flights (R19).
- [ ] Result: PASS / PASS WITH LIMITS / FAIL. TD ______ SO ______ PIC ______ Date ______
