# Flight test card FTC-F10 — Fixed-wing failsafes: pusher-out (R15) and RC loss in cruise (R20)

DBF-TP-001 rev B · Test F10 · Review step: not in the review matrix; review 8 'Motor-out behaviour' · Requirements: R15, R20

**Prerequisites (signed in test-matrix.csv):** F09 passed; E06 scenario B rehearsed by the PIC

**Configuration:** As F09. Flight 1 pusher-out; flight 2 RC loss. RTL_ALTITUDE 60, RTL_RADIUS 100, Q_RTL_MODE 1, FS_LONG_ACTN 1 (vtol_c0.param s7-8).

**Weather limits:** Steady <= 4 m/s EST, gusts <= 6 m/s EST.

**Predicted:** Review 8: pusher out in cruise -> Q_ASSIST below 13 m/s -> QLAND; stopping distance 100 m from 20 m/s at 2 m/s2 (vtol_c0.param). SITL B (RC loss cruise -> RTL -> QRTL) and D (transition timeout -> QRTL) PASS 2026-10-21.

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
1. [ ] Flight 1: transition; climb to 60 m AGL EST upwind of the pad; CRUISE at 20 m/s; pusher throttle to idle (FBWA, stick low) and hold the nose level: expect airspeed to decay, Q_ASSIST to engage below 13 m/s (lift motors) with attitude held; then select QLAND over open ground. Record altitude lost from throttle cut to stable hover.
2. [ ] Flight 2: transition; climb to 60 m; CRUISE 300 m from home; transmitter off: expect FS short (CIRCLE) then after FS_LONG_TIMEOUT 5 s RTL -> fixed-wing return at RTL_ALTITUDE 60 m -> QRTL inside RTL_RADIUS 100 m -> vertical landing at Q_RTL_ALT 15 m -> touchdown. Transmitter on only after touchdown (or at once if ABORT).

## Abort criteria (card-specific items first, then the universal list)
- Flight 1: altitude < 30 m before the lift motors engage; any departure -> throttle up, QHOVER.
- Flight 2: aircraft not turning toward home within 10 s of the long failsafe; fence margin; any sign of EKF failure -> transmitter on, QHOVER/QLAND.
Universal (TEST-PLAN.md s5): VIBE > 30 m/s2 or rising clipping; attitude error > 15 deg; any oscillation; sag-compensated voltage < 21.0 V or < 1,950 mAh remaining (firmware low-battery RTL point; critical 19.8 V / 1,300 mAh -> QLAND); motor can > 80 degC EST after landing; wind above the card limit; LQ < 70 % EST or any failsafe message; EKF/GPS/compass warning; people or animals inside the range; manned aircraft converging.

## Data to record
MODE/EV timeline; ARSP; altitude; RCOU C5-C8 (assist engage) and C9; GPS track; touchdown position vs home.

## Pass criteria
- [ ] R15: after pusher idle, hover is re-entered with the lift motors and the aircraft lands vertically; altitude loss from throttle cut to stable hover <= 30 m EST; no attitude excursion > 30 deg.
- [ ] R20: RC loss -> RTL within 5 s + short-failsafe time; QRTL switch inside 100 m; touchdown within 10 m EST of home; no pilot input until touchdown.
- [ ] Peak current during assist engagement <= 85 A.

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
- [ ] Log copied from the SD card and named `YYYY-MM-DD_F10_r<n>_C0.bin`; run `docs/test/analysis/log_summary.py` on it.
- [ ] Post-flight report filed within 3 business days for on-campus flights (R19).
- [ ] Result: PASS / PASS WITH LIMITS / FAIL. TD ______ SO ______ PIC ______ Date ______
