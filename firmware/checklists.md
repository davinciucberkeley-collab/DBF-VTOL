# C0 checklists — bench, pre-flight, failsafe test, post-flight log review

Print these and initial each line. Numbers trace to `vtol_c0.param`, analysis/results.json and the review.
(est.) = engineering estimate, to be replaced by measured values. Roles: **PIC** (pilot in command),
**GCS** (laptop operator), **SO** (safety officer), **CREW**.

## A. Bench (after any firmware, wiring or parameter change) — props OFF

- [ ] Firmware: Messages tab shows `ArduPlane V4.7.2`. Board `CoreWingF405WingV2`.
- [ ] `py firmware/tools/check_params.py firmware/vtol_c0.param --corewing --require-every-line-commented` → PASS.
- [ ] Mission Planner "Compare Params" against `vtol_c0.param`: no unexpected differences.
- [ ] Airspeed: Messages shows `MS5525[0]: Found on bus 0 addr 0x77` (or the MS4525 fallback). The baro still reads.
- [ ] Motor test A–D: front-right, rear-right, rear-left, front-left; directions CCW, CW, CCW, CW (README §7).
- [ ] Pusher spins only in fixed-wing modes, and air blows aft.
- [ ] Servo directions and stabilization directions correct (README §7). No binding at full throw.
- [ ] Arm switch CH5 arms only in Q modes; CH7 E-stop stops every motor; CH9 selects RTL.
- [ ] TX off → "RC Short Failsafe" within ~1 s (est.). TX on → cleared.
- [ ] Battery voltage matches a multimeter within 0.05 V (est.).

## B. Field set-up and pre-arm (every flight)

Site and legal
- [ ] Flight approved for this site and date (UC request ≥ 7 business days ahead; review §15). Pilot's TRUST / Part 107 and AMA cards on hand.
- [ ] Wind ≤ 5 m/s, gusts ≤ 8 m/s (R16). Visibility ≥ 3 sm. Spectators behind the safety line.
- [ ] Remote ID module powered and visible in a phone RID app (budget-avionics M6).
- [ ] Fence set for this site: `FENCE_RADIUS` fits inside the field; `FENCE_ALT_MAX` 110 m (10 m for hover-phase sessions).

Airframe
- [ ] Wing joiner fully home, locking pins in; booms clamped; landing gear tight.
- [ ] Props: correct handedness on each motor, tight, no chips. Pusher prop tight.
- [ ] CG at the 28 % MAC mark with this battery (results.json `C0.cg.pct.target`).
- [ ] Pitot clear, tubes on, foam cover on.
- [ ] Pack fully charged: ≥ 25.0 V (est.; arming refuses below 23.4 V, `BATT_ARM_VOLT`). Strapped, XT90-S plugged in **last**.

Power-up
- [ ] Aircraft still and level for the gyro/baro start; airspeed offset calibrated with the cover on; cover removed.
- [ ] GPS 3D fix, ≥ 10 sats (est.), HDOP < 1.5 (est.). EKF green. Home set at the take-off point.
- [ ] Compass heading matches the airframe.
- [ ] Mode = QSTABILIZE (first flights) or QLOITER. Throttle low. E-stop released.
- [ ] Control-surface wiggle in FBWA (disarmed): directions correct.
- [ ] SO calls "clear". PIC arms with CH5. Disarm, re-arm (proves disarm works).

## C. Failsafe tests (once per configuration, before the first transition)

| # | Test | Mode / altitude | Expected | Pass |
|---|---|---|---|---|
| C1 | TX off for 3 s in hover | QLOITER, 5 m | QLAND in place ("RC Short Failsafe: switched to QLand"). PIC restores the TX, retakes control in QLOITER | ☐ |
| C2 | E-stop | QSTABILIZE, on ground at idle | all motors stop | ☐ |
| C3 | Low-battery simulation | QLOITER, 5 m, hover-phase overlay loaded (low → QLAND) | raise `BATT_LOW_VOLT` above the pack voltage from the GCS → QLAND; restore 21.0 | ☐ |
| C4 | RTL switch at altitude (first transition session) | CRUISE, 60 m, ≥ 150 m out | RTL → QRTL inside 100 m → vertical land at home | ☐ |
| C5 | TX off in fixed-wing flight (only after C4 passes) | CRUISE, 60 m | CIRCLE, then RTL at 5 s, then as C4 (SITL scenario B) | ☐ |

## D. Flight-phase gates

| Gate | Do not proceed until |
|---|---|
| Hover → QHOVER/QLOITER | no oscillation at 1 m in QSTABILIZE (tuning-process step 6) |
| QLOITER → notch | learned `Q_M_THST_HOVER` logged; expected about 0.49 (est.), > 0.6 = thrust short |
| Notch → first transition | notch set from two 60 s no-input hover logs that agree (README §9.4); vibration within the limits in E2; C1–C3 passed; airspeed reads 0 ± 1 m/s still |
| First transition → AUTO | 3 clean manual transitions, each < 15 s and < 100 m to AIRSPEED_MIN (review M12.2); C4–C5 passed |

## E. Post-flight log review (every flight; download the .BIN from the SD card or over MAVLink)

Tools: Mission Planner > DataFlash Logs > "Review a Log", or https://plot.ardupilot.org/ ;
notch tool https://firmware.ardupilot.org/Tools/WebTools/FilterReview/.

| # | Look at | Messages / fields | Healthy | Action if not |
|---|---|---|---|---|
| E1 | Hover throttle | `QTUN.ThO` (or `CTUN.ThO`) in steady hover; parameter `Q_M_THST_HOVER` | 0.3–0.6 (tuning-process step 7); expect about 0.49 (est.) | > 0.6: thrust short or overweight; check prop handedness and mass |
| E2 | Vibration | `VIBE.VibeX/Y/Z`, `VIBE.Clip0` | below 30 m/s/s; clipping 0 (common-measuring-vibration.html) | soft-mount the FC; balance props; check boom flex (fn 36 Hz est., results.json `C0.struct.fn`) |
| E3 | Gyro noise and notch | batch-sampler FFT (`ISBH/ISBD`) pre and post filter | one clear peak that tracks throttle; post-filter attenuated | set or adjust `INS_HNTCH_FREQ/BW/REF` (README §9.4) |
| E4 | Attitude tracking | `ATT.DesRoll` vs `ATT.Roll`, `DesPitch` vs `Pitch` | follows within a few degrees; no sustained oscillation | lower `Q_A_RAT_*` P/D 50 % (tuning-process step 6) |
| E5 | Yaw headroom | `RATE.YOut` in no-wind hover | < 0.1 (tuning-process "yaw asymmetry") | tilt the lift motors a few degrees for yaw authority (est.) or fix motor alignment |
| E6 | Battery sag | `BAT.Volt`, `BAT.VoltR`, `BAT.Curr` during hover and transition | hover ≈ 37.5 A (results.json `I_hover`); transition peak vs the 74.4 A estimate (`I_trans`); resting voltage ≥ 3.5 V/cell under load (est.) | if sag hits `BATT_LOW_VOLT` in transition: lower `TKOFF_THR_MAX` and manual transition throttle; check pack C-rating (review M7.4) |
| E7 | Energy used | `BAT.CurrTot` (mAh) at landing | ≤ 5200 mAh for the full mission = 20 % reserve left (R10) | shorten the mission |
| E8 | Transition | `QTUN.TMix` / statustext "Transition airspeed reached", "Transition done"; `CTUN.As`, `GPS.Spd` | AIRSPEED_MIN reached in < 15 s and < 100 m (review M12.2) | more pusher throttle, transition into wind |
| E9 | Airspeed health | `ARSP.Airspeed` vs `GPS.Spd` on reciprocal legs; `ARSP.Offset` | ratio error < 10 % (review M12.1) | `ARSPD_AUTOCAL` loiter (README §9.5) |
| E10 | Motor balance | `RCOU.C5–C8` in hover | outputs within about 10 % of each other (est.) | CG off or a motor/prop weak |
| E11 | Temperatures | IR thermometer on motors and ESCs right after landing | motor case < 80 °C (budget-lift M2 threshold) | shorten hovers; check prop pitch |
| E12 | Events | `ERR`, `EV`, `MSG` | no EKF, GPS-glitch, failsafe or thrust-loss messages | investigate before the next flight |

Log every flight: date, pack ID, flight time, mAh used, `Q_M_THST_HOVER`, peak current, max VIBE, issues.
UC policy: file the post-flight report within 3 business days (review §15).
