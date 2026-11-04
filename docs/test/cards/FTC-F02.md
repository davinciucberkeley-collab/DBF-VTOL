# Flight test card FTC-F02 — QHOVER hover-throttle learn and notch-filter log

DBF-TP-001 rev B · Test F02 · Review step: F3; ArduPilot tuning steps 7 and 9 · Requirements: R13

**Prerequisites (signed in test-matrix.csv):** F01 passed; log reviewed; any gain changes recorded

**Configuration:** As F01. Q_M_HOVER_LEARN 2; INS_LOG_BAT_MASK 1, INS_LOG_BAT_OPT 4 (pre- and post-filter; vtol_c0.param s5; firmware.md D13: notch from two 60 s hovers). Mode slots: 1 QSTABILIZE, 2 QHOVER.

**Weather limits:** Steady <= 3 m/s EST, gusts <= 5 m/s EST.

**Predicted:** Learned hover throttle ~0.52; front/rear split ~0 (CG at the thrust centroid x = -0.0796 m from the LE, results.json cg.thrustCentroid).

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
1. [ ] Take off in QSTABILIZE to 2 m, switch to QHOVER (ArduPilot step 7: take off in QSTABILIZE, switch to QHOVER, hover >= 30 s).
2. [ ] Hover hands-off 60 s at 2-3 m AGL for learning and the FFT batch log. Land; cool < 45 degC.
3. [ ] Second 60 s hands-off hover at 2-3 m (second batch log). Land.
4. [ ] Read the learned Q_M_THST_HOVER on the GCS; save it.
5. [ ] Note: the tuning guide asks for one 2-minute hover; firmware decision D13 (docs/research/firmware.md) and the batch-sampling doc accept >= 1 min, so two 60 s hovers are the design's method (TEST-PLAN.md s12 item 2, resolved).

## Abort criteria (card-specific items first, then the universal list)
- Altitude excursion > 1 m in QHOVER; any oscillation; learned value climbing above 0.60.
Universal (TEST-PLAN.md s5): VIBE > 30 m/s2 or rising clipping; attitude error > 15 deg; any oscillation; sag-compensated voltage < 21.0 V or < 1,950 mAh remaining (firmware low-battery RTL point; critical 19.8 V / 1,300 mAh -> QLAND); motor can > 80 degC EST after landing; wind above the card limit; LQ < 70 % EST or any failsafe message; EKF/GPS/compass warning; people or animals inside the range; manned aircraft converging.

## Data to record
Q_M_THST_HOVER before/after; QTUN.ThO mean; ISBH/ISBD batch IMU data for the FFT (Mission Planner FFT tool); RCOU C5-C8 means (front/rear split); VIBE; BAT.

## Pass criteria
- [ ] Learned Q_M_THST_HOVER between 0.30 and 0.60 (ArduPilot tuning step 7 expected 0.3-0.6, checked 2026-10-21) and <= 0.60 (review 8 M2).
- [ ] A dominant FFT peak identified for the throttle-based notch (firmware/README.md 9.4 if present).
- [ ] Front vs rear lift output split <= 15 % (review 9 M2); otherwise move the pack and re-run G01.
- [ ] VIBE < 30 m/s2, clipping 0.

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
- [ ] Log copied from the SD card and named `YYYY-MM-DD_F02_r<n>_C0.bin`; run `docs/test/analysis/log_summary.py` on it.
- [ ] Post-flight report filed within 3 business days for on-campus flights (R19).
- [ ] Result: PASS / PASS WITH LIMITS / FAIL. TD ______ SO ______ PIC ______ Date ______
