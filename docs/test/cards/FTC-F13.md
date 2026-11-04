# Flight test card FTC-F13 — Gear-fairing A/B at 20 m/s

DBF-TP-001 rev B · Test F13 · Review step: not in the review matrix; docs/research/aerodynamics.md M5; protects R10 · Requirements: R10

**Prerequisites (signed in test-matrix.csv):** F08 passed (airspeed calibrated); fairings fitted and taped (cad/README.md gear); spare tape on site

**Configuration:** As F08. Flight A: four printed teardrop leg fairings fitted (CAD model rev D, 170 mm, 3:1, vase-mode PETG, 101.5 g total per cad/verification.txt). Flight B: fairings removed (bare 25.4 mm legs). Same pack state (both flights start at >= 4.15 V/cell), same altitude band 60 m, same ballast.

**Weather limits:** Steady <= 4 m/s EST, gusts <= 6 m/s EST; calm preferred (the power difference is read from reciprocal legs).

**Predicted:** 302 W faired vs 482 W bare at 20 m/s (aero_results.json drag.gear_faired_case / gear_round_case); sizing cruise 337 W with faired legs (results.json sized.P_cruise).

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
1. [ ] Flight A (faired): transition from the upwind edge; climb to 60 m; CRUISE 20 m/s; two reciprocal 60 s legs; log BAT.Curr and Volt; back-transition, QLAND.
2. [ ] Remove the four fairings (tape off, slide off the legs); re-check CG (G01) and weigh the fairings on the kitchen scale.
3. [ ] Flight B (bare): same profile and legs at 20 m/s; log current; land.
4. [ ] Refit the fairings before any further flight; they are part of the F11/F12 configuration.

## Abort criteria (card-specific items first, then the universal list)
- Bare-leg flight: cruise current > 25 A at 20 m/s (predicted 21.7 A = 482 W / 22.2 V): shorten the legs to one reciprocal pair and land.
- Any fairing loosening in flight A (visible flutter): land, re-tape.
Universal (TEST-PLAN.md s5): VIBE > 30 m/s2 or rising clipping; attitude error > 15 deg; any oscillation; sag-compensated voltage < 21.0 V or < 1,950 mAh remaining (firmware low-battery RTL point; critical 19.8 V / 1,300 mAh -> QLAND); motor can > 80 degC EST after landing; wind above the card limit; LQ < 70 % EST or any failsafe message; EKF/GPS/compass warning; people or animals inside the range; manned aircraft converging.

## Data to record
Mean BAT.Curr x BAT.Volt per leg for A and B (log_summary.py per-mode table); airspeed and GPS speed per leg; fairing mass; CTUN.ThrOut per leg.

## Pass criteria
- [ ] Faired cruise electrical power at 20 m/s <= 414 W (R10 threshold, calc TEST-PLAN.md R10 line); predicted 302 W (aero_results drag.gear_faired_case.P_elec_W).
- [ ] Power difference bare - faired >= 100 W EST confirms the fairings carry R10 (predicted 482 - 302 = 180 W, aero_results drag.gear_round_case vs gear_faired_case; bare legs give 8.6 min cruise, mission.round_legs.t_cruise_avail_min).
- [ ] If the difference is < 50 W, the leg drag model (Hoerner cylinder Cd 1.0 vs strut Cd 0.1, both EST) is wrong in a safe direction: record and move on.

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
- [ ] Log copied from the SD card and named `YYYY-MM-DD_F13_r<n>_C0.bin`; run `docs/test/analysis/log_summary.py` on it.
- [ ] Post-flight report filed within 3 business days for on-campus flights (R19).
- [ ] Result: PASS / PASS WITH LIMITS / FAIL. TD ______ SO ______ PIC ______ Date ______
