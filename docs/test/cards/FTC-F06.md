# Flight test card FTC-F06 — Partial transitions with Q_ASSIST

DBF-TP-001 rev B · Test F06 · Review step: F5 · Requirements: R9, R11

**Prerequisites (signed in test-matrix.csv):** F05 passed; RFS (or another site with >= 30 m ceiling and >= 200 m straight) approved; airspeed calibrated on the bench (E08) and sanity-checked in F04; every pilot passed E06 failed-transition recovery

**Configuration:** As F05 with FENCE_ALT_MAX restored (site ceiling, <= 110). Mode slots 3 QLOITER, 4 FBWA. Q_ASSIST_SPEED 13, Q_ASSIST_ALT 20, Q_TRANS_FAIL 15 (vtol_c0.param s6). TKOFF_THR_MAX 75.

**Weather limits:** Steady <= 5 m/s (R16), gusts <= 8 m/s; into wind only.

**Predicted:** Transition power 1,590 W / 75.7 A at 21 V (results.json sized.P_trans, I_trans v0.4); C0 SITL model (firmware/sitl/README.md C0 section, results_c0.json scenario A): 16 m/s reached 8 s after the start, Transition done at 13 s / 144 m, peak 70.6 A; the generic SITL model reached 16.0 in 5 s.

**Crew:** TD, SO, PIC, GCS · **Duration:** 1 session (3 flights), 2 packs

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
1. [ ] Climb in QLOITER to 30 m AGL (keep the climb <= 60 s), into wind, at the UPWIND edge of the field so the run and the turn stay inside the 300 m fence (firmware/README.md 9.6).
2. [ ] Select FBWA with the throttle at ~60 %; hold wings level; watch airspeed. At 12 m/s (review F5) switch back to QHOVER; the lift motors re-engage (Q_ASSIST holds attitude below 13 m/s throughout).
3. [ ] Land in QLAND. Review the log before the next attempt (airspeed rise time, altitude loss).
4. [ ] Repeat three times (review F6 entry: F5 three times), the last with throttle 75 %.

## Abort criteria (card-specific items first, then the universal list)
- Airspeed not rising within 6 s of selecting FBWA (review F5): back to QHOVER.
- Altitude loss > 10 m EST; pitch > +15 or < -10 deg; Q_TRANS_FAIL message; any yaw departure.
Universal (TEST-PLAN.md s5): VIBE > 30 m/s2 or rising clipping; attitude error > 15 deg; any oscillation; sag-compensated voltage < 21.0 V or < 1,950 mAh remaining (firmware low-battery RTL point; critical 19.8 V / 1,300 mAh -> QLAND); motor can > 80 degC EST after landing; wind above the card limit; LQ < 70 % EST or any failsafe message; EKF/GPS/compass warning; people or animals inside the range; manned aircraft converging.

## Data to record
ARSP.Airspeed and GPS.Spd vs time from mode change; QTUN.TrnMs; ATT; BAT Curr peak; RCOU C9 (pusher) and C5-C8.

## Pass criteria
- [ ] Airspeed rises within 6 s of selecting FBWA (review F5) and reaches 12 m/s.
- [ ] Altitude loss <= 10 m EST; attitude error < 15 deg.
- [ ] Back-transition: lift motors at hover output within 2 s EST of selecting QHOVER; stable hover regained.
- [ ] Peak current <= 85 A (Q_M_BAT_CURR_MAX).

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
- [ ] Log copied from the SD card and named `YYYY-MM-DD_F06_r<n>_C0.bin`; run `docs/test/analysis/log_summary.py` on it.
- [ ] Post-flight report filed within 3 business days for on-campus flights (R19).
- [ ] Result: PASS / PASS WITH LIMITS / FAIL. TD ______ SO ______ PIC ______ Date ______
