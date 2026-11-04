# Flight test card FTC-F04 — Q-mode handling at low forward speed

DBF-TP-001 rev B · Test F04 · Review step: F4 · Requirements: R9

**Prerequisites (signed in test-matrix.csv):** F03 passed; QAUTOTUNE or manual tune completed and logged

**Configuration:** As F03. Airspeed sensor fitted and zeroed (E08). Mode slots 2 QHOVER, 3 QLOITER.

**Weather limits:** Steady <= 4 m/s EST, gusts <= 6 m/s EST, into-wind legs.

**Predicted:** - (no low-speed handling prediction in the repo).

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
1. [ ] QLOITER at 5 m: fly a 30 m box at 3 m/s groundspeed; land; cool.
2. [ ] QLOITER at 8-10 m AGL: box at 5-8 m/s (review F4) with the long legs into and down wind; note the airspeed reading on the upwind leg.
3. [ ] QHOVER at 8-10 m: same box flown by stick; check pitch attitude needed (expect nose-down ~10 deg EST).
4. [ ] Land; total hover time per flight <= 60 s per climb (two flights if needed).

## Abort criteria (card-specific items first, then the universal list)
- Q_ASSIST triggered unexpectedly (review F4); pitch attitude > 20 deg to hold speed; airspeed reading diverging from GPS by > 3 m/s on the upwind leg.
Universal (TEST-PLAN.md s5): VIBE > 30 m/s2 or rising clipping; attitude error > 15 deg; any oscillation; sag-compensated voltage < 21.0 V or < 1,950 mAh remaining (firmware low-battery RTL point; critical 19.8 V / 1,300 mAh -> QLAND); motor can > 80 degC EST after landing; wind above the card limit; LQ < 70 % EST or any failsafe message; EKF/GPS/compass warning; people or animals inside the range; manned aircraft converging.

## Data to record
ARSP.Airspeed vs GPS.Spd on the upwind/downwind legs; ATT; QTUN; RCOU; MSG (assist events).

## Pass criteria
- [ ] Box pattern flown at 5-8 m/s (review F4) with attitude error < 15 deg.
- [ ] No unexpected Q_ASSIST activation (MSG).
- [ ] Airspeed sensor reads the upwind-leg speed within +-2 m/s of GPS speed + wind EST (sanity check before F06).

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
- [ ] Log copied from the SD card and named `YYYY-MM-DD_F04_r<n>_C0.bin`; run `docs/test/analysis/log_summary.py` on it.
- [ ] Post-flight report filed within 3 business days for on-campus flights (R19).
- [ ] Result: PASS / PASS WITH LIMITS / FAIL. TD ______ SO ______ PIC ______ Date ______
