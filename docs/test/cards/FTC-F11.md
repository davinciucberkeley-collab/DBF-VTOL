# Flight test card FTC-F11 — Mission dress rehearsal (half duration)

DBF-TP-001 rev B · Test F11 · Review step: F7 preparation · Requirements: R9, R10

**Prerequisites (signed in test-matrix.csv):** F10 and F13 passed (fairings on); C11 usable energy known; BATT_CAPACITY confirmed against C11; mission uploaded (AUTO with NAV_VTOL_TAKEOFF, waypoints, NAV_VTOL_LAND) and flown in SITL (E06 A)

**Configuration:** As F10, with 0.5 kg ballast (R12). AUTO mission or pilot-flown by mode switches (TD choice; AUTO transitions use TKOFF_THR_MAX 75).

**Weather limits:** Steady <= 5 m/s, gusts <= 8 m/s.

**Predicted:** 58.6 Wh for the half mission; full mission 96.9 Wh delivered = 102.0 Wh from the pack at 95 % efficiency (results.json sized.E_Wh v0.4, base.etaBatt).

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

## Back-transition watch (C0 SITL model; firmware/sitl/README.md 'Gains' item 1)
In the C0 airframe model the back-transition airbrake pitches the nose to the 30 deg VTOL angle limit with the lift motors near idle, which briefly stalls the wing (alpha_stall ~11 deg); position2 then recovers with a -17/+33 deg pitch swing and an 89 A peak; altitude loss stayed under 2 m (1.7 m in scenario A, firmware/sitl/results_c0.json). Back-transition only at >= 30 m AGL, wings level, into wind. Watch for pitch-up past 30 deg, a wing drop, sink > 2 m or current > 85 A. If seen: land, review ATT / QTUN / BAT, and lower Q_TRANS_DECEL first (2.0 now; a gentler, longer stop: v^2 / 2a = 133 m at 1.5 m/s2 from 20 m/s, calc) before Q_ANGLE_MAX or any attitude gain.

## Build-up points (in order; stop and review the log between points when the card says so)
1. [ ] VTOL take-off to 30 m, hover 60 s total (take-off + climb).
2. [ ] Transition; cruise 5 min at 20 m/s on a racetrack inside the fence; log current.
3. [ ] Back-transition at home; hover 60 s; vertical landing.
4. [ ] Read BAT.CurrTot / EnrgTot: compute the energy fraction used against C11 usable.

## Abort criteria (card-specific items first, then the universal list)
- Remaining mAh below BATT_LOW_MAH 1950 at any point (the failsafe will RTL anyway).
- Any failsafe, EKF or airspeed fault.
Universal (TEST-PLAN.md s5): VIBE > 30 m/s2 or rising clipping; attitude error > 15 deg; any oscillation; sag-compensated voltage < 21.0 V or < 1,950 mAh remaining (firmware low-battery RTL point; critical 19.8 V / 1,300 mAh -> QLAND); motor can > 80 degC EST after landing; wind above the card limit; LQ < 70 % EST or any failsafe message; EKF/GPS/compass warning; people or animals inside the range; manned aircraft converging.

## Data to record
BAT EnrgTot/CurrTot per phase (log_summary.py phase table); MODE timeline; ARSP mean in cruise; QTUN.ThO means in the hover phases.

## Pass criteria
- [ ] All phases present in the MODE timeline in order; no failsafe.
- [ ] Energy used <= 60 % of C11 usable Wh (half mission 58.6 Wh = (916 x 120 + 337 x 300)/3600 Wh, calc from results.json v0.4 P_hover, P_cruise; 58.6/109.7 = 53 %, with 60 % as the limit EST).
- [ ] Hover and cruise currents within +-15 % of F03/F08 values.

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
- [ ] Log copied from the SD card and named `YYYY-MM-DD_F11_r<n>_C0.bin`; run `docs/test/analysis/log_summary.py` on it.
- [ ] Post-flight report filed within 3 business days for on-campus flights (R19).
- [ ] Result: PASS / PASS WITH LIMITS / FAIL. TD ______ SO ______ PIC ______ Date ______
