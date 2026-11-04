# Flight test card FTC-F12 — Full mission (R8, R9, R10)

DBF-TP-001 rev B · Test F12 · Review step: F7 · Requirements: R1, R8, R9, R10, R12, R16

**Prerequisites (signed in test-matrix.csv):** F11 passed twice (review F7 entry: F6 twice -> here F11 twice); leg fairings fitted (F13); both packs balanced and >= 4.18 V/cell; I01-I03 closed; date <= 2027-04-30

**Configuration:** As F11 with 0.5 kg ballast. Fresh pack. BATT_CRT_MAH 1300 (20 % reserve, R10), BATT_LOW_MAH 1950.

**Weather limits:** Steady <= 5 m/s, gusts <= 8 m/s (R16). A flight in 3-5 m/s steady wind closes R16 by demonstration.

**Predicted:** Mission energy 96.9 Wh (102.0 Wh from the pack), landing at ~29 % of nameplate (calc; results.json sized.E_Wh v0.4, base.etaBatt, packs[0].Wh); 12.3 min cruise available (sized.t_cruise_avail_min) or 13.7 min with the aero build-up drag (aero_results mission.t_cruise_avail_min). Pack temperature at touchdown = start + 3.9 K per mOhm/cell of the C11 R_cell (adiabatic bay, docs/research/thermal.md 5); fly only if start <= 60 - 3.9 x R_cell degC (TEST-PLAN.md C11, s6).

**Crew:** TD, SO, PIC, GCS · **Duration:** 1 session, 2 packs (one flight per pack)

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
1. [ ] VTOL take-off, hover >= 60 s (climb to 30 m included).
2. [ ] Transition; cruise >= 10 min at 18-22 m/s (20 m/s target) on the racetrack; GCS calls remaining mAh every minute.
3. [ ] Back-transition at home; hover >= 60 s; vertical landing (total hover >= 120 s).
4. [ ] Within 30 s: temperatures; then resting pack voltage and the charge-return mAh.

## Abort criteria (card-specific items first, then the universal list)
- Remaining capacity reaching BATT_LOW_MAH 1950 before 10 min cruise: the autopilot RTLs; the flight is a FAIL for R10 but the aircraft is kept.
- Any failsafe, airspeed fault, or wind above the limit.
Universal (TEST-PLAN.md s5): VIBE > 30 m/s2 or rising clipping; attitude error > 15 deg; any oscillation; sag-compensated voltage < 21.0 V or < 1,950 mAh remaining (firmware low-battery RTL point; critical 19.8 V / 1,300 mAh -> QLAND); motor can > 80 degC EST after landing; wind above the card limit; LQ < 70 % EST or any failsafe message; EKF/GPS/compass warning; people or animals inside the range; manned aircraft converging.

## Data to record
BAT EnrgTot, CurrTot, Volt (min, at landing); MODE timeline (phase durations); ARSP mean/min/max in cruise; RCOU C5-C8 in cruise (R1); VIBE; ATT; post-flight temperatures; charge-return mAh.

## Pass criteria
- [ ] Phases in order: VTOL take-off -> hover -> transition -> cruise -> back-transition -> hover -> vertical land (R9), no failsafe, aircraft undamaged.
- [ ] Cruise >= 600 s at 18-22 m/s calibrated; total hover >= 120 s (R10).
- [ ] Energy remaining at landing >= 20 % of the C11 usable energy, and >= 1,300 mAh remaining by BAT.CurrTot vs the C11 capacity; charge-return mAh <= 0.8 x C11 Ah (R10 reserve).
- [ ] Lift outputs at minimum for >= 95 % of cruise (R1).
- [ ] Cruise electrical power <= 414 W at 20 m/s (R10 threshold; predicted 302-337 W).
- [ ] Date <= 2027-04-30 (R8). Ballast 0.5 kg carried (R12).

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
- [ ] Log copied from the SD card and named `YYYY-MM-DD_F12_r<n>_C0.bin`; run `docs/test/analysis/log_summary.py` on it.
- [ ] Post-flight report filed within 3 business days for on-campus flights (R19).
- [ ] Result: PASS / PASS WITH LIMITS / FAIL. TD ______ SO ______ PIC ______ Date ______
