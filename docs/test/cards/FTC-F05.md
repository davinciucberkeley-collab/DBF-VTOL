# Flight test card FTC-F05 — Hover failsafes and R20 demonstration

DBF-TP-001 rev B · Test F05 · Review step: not in the review matrix; required by R20 · Requirements: R20

**Prerequisites (signed in test-matrix.csv):** F04 passed; E05 bench failsafes passed; both pilots rehearsed these in SITL (E06 C, F)

**Configuration:** As F04. Temporary parameters for this card only, restored and checked with check_params.py after: FENCE_ALT_MAX 25 (for the fence point), BATT_LOW_MAH raised for the battery point. Home set on the pad.

**Weather limits:** Steady <= 3 m/s EST, gusts <= 5 m/s EST.

**Predicted:** Behaviour per firmware/vtol_c0.param s7-10; SITL scenarios C (RC loss hover -> QLAND), E (low battery -> RTL -> QRTL), F (fence 110 m -> RTL, peak 113.1 m) all PASS 2026-10-21 (firmware/sitl/results/summary.json) and again on the C0 airframe model 2026-10-25 (firmware/sitl/results_c0.json).

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
1. [ ] RC loss in hover: QLOITER at 20 m AGL EST over the pad (accepted exposure, TEST-PLAN.md s12 item 3); transmitter power off; expect QLAND and touchdown; transmitter back on after touchdown.
2. [ ] Fence: QLOITER, climb through 25 m; expect fence breach -> RTL (FENCE_ACTION 1), which in Q modes lands via QRTL/QLAND; take control after the action is seen.
3. [ ] Battery low: with BATT_LOW_MAH set above the remaining mAh, arm and hover at 10 m; expect the RTL action (BATT_FS_LOW_ACT 1; SITL E) then vertical landing. Restore BATT_LOW_MAH 1950. Then raise BATT_CRT_MAH the same way at 5 m: expect QLAND in place (BATT_FS_CRT_ACT 4). Restore 1300.
4. [ ] E-stop: on the ground armed at idle, CH7 -> all motors stop.
5. [ ] XT90-S: after disarm, pull the plug under the idle load; no arc.

## Abort criteria (card-specific items first, then the universal list)
- Failsafe action not seen within 10 s: PIC retakes control (transmitter on / mode switch) and lands; card fails.
- Aircraft drifting beyond 10 m from the pad during a failsafe descent.
Universal (TEST-PLAN.md s5): VIBE > 30 m/s2 or rising clipping; attitude error > 15 deg; any oscillation; sag-compensated voltage < 21.0 V or < 1,950 mAh remaining (firmware low-battery RTL point; critical 19.8 V / 1,300 mAh -> QLAND); motor can > 80 degC EST after landing; wind above the card limit; LQ < 70 % EST or any failsafe message; EKF/GPS/compass warning; people or animals inside the range; manned aircraft converging.

## Data to record
MODE and EV messages with timestamps; descent rate in QLAND (QTUN.CRt); touchdown position vs home (GPS); BAT.

## Pass criteria
- [ ] RC loss -> QLAND within FS_LONG_TIMEOUT 5 s + 1.5 s short EST; touchdown within 5 m of the pad EST.
- [ ] Fence breach at 25 m -> RTL action logged within 3 s EST of crossing (FENCE_MARGIN 2 m).
- [ ] Battery low -> RTL action and landing (21.0 V / 1,950 mAh thresholds); critical -> QLAND (19.8 V / 1,300 mAh).
- [ ] E-stop stops all motors < 1 s; XT90-S disconnect clean.
- [ ] All temporary parameters restored (check_params.py zero mismatches).

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
- [ ] Log copied from the SD card and named `YYYY-MM-DD_F05_r<n>_C0.bin`; run `docs/test/analysis/log_summary.py` on it.
- [ ] Post-flight report filed within 3 business days for on-campus flights (R19).
- [ ] Result: PASS / PASS WITH LIMITS / FAIL. TD ______ SO ______ PIC ______ Date ______
