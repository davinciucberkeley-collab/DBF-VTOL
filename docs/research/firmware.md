# Flight software — sources, design decisions, and changes the review must take

Avionics and flight-software research for the C0 lift + cruise VTOL. The package itself is in `firmware/`
(start at [firmware/README.md](../../firmware/README.md)). All web sources were checked **2026-10-21** unless a
line says otherwise. (est.) = engineering estimate. — = unknown.

## 1. Summary

- **Board and target confirmed.** The CoreWing F405 Wing APP V2 (BOM) maps to the ArduPilot target `CoreWingF405WingV2`.
  The hwdef exists on master. **ArduPlane 4.7.2 stable** (version commit 2026-10-11) includes it, so the
  "beta-only" risk in review §10 and DESIGN-BASIS R17 is closed.
- **DShot: yes** on outputs 1–10. Bi-directional DShot only on 1–4; 11–12 PWM only. The SoloGood BLHeli_S ESCs
  list DShot150/300/600. Chosen: **DShot150** for lift and pusher.
- **Lua: no.** `!AP_SCRIPTING_ENABLED` in the F405 build.
- **Parameter checker:** `firmware/tools/check_params.py` → PASS (0 errors) on `vtol_c0.param` and both overlays,
  against the current ArduPlane metadata and the versioned 4.7.1 stable metadata (4.7.2 has no versioned list yet).
- **SITL ran**: ArduPlane V4.7.2 SITL (Mission Planner's Windows build), 7/7 scripted scenarios passed (§5).

## 2. Sources

### ArduPilot firmware and hardware definition
| Key | Source |
|---|---|
| HW | https://github.com/ArduPilot/ardupilot/tree/master/libraries/AP_HAL_ChibiOS/hwdef/CoreWingF405WingV2 — `hwdef.dat`, `README.md`, `defaults.parm` (raw files via raw.githubusercontent.com) |
| HW-inc | same tree, `hwdef/include/minimize_fpv_osd.inc`, `minimize_common.inc`, `no_bootloader_DFU.inc` |
| FWS | https://firmware.ardupilot.org/Plane/stable/CoreWingF405WingV2/ — `firmware-version.txt` (4.7.2-OFFICIAL), `git-version.txt` (commit fb773567, "Plane: version to 4.7.2", 2026-10-11), `features.txt` |
| FWB / FWL | same under `/Plane/beta/` (4.7.2) and `/Plane/latest/` (4.8.0-DEV) |
| PD | https://autotest.ardupilot.org/Parameters/ArduPlane/apm.pdef.xml (5,871 parameters) |
| PD471 | https://autotest.ardupilot.org/Parameters/versioned/Plane/stable-4.7.1/apm.pdef.xml (5,722 parameters) |
| SITLBIN | https://firmware.ardupilot.org/Tools/MissionPlanner/sitl/PlaneStable/ — `ArduPlane.elf` + cygwin DLLs (reports "ArduPlane V4.7.2 (fbd0a316)") |
| SITLSRC | https://github.com/ArduPilot/ardupilot — `libraries/SITL/SIM_Plane.cpp`, `SIM_QuadPlane.cpp`; `Tools/autotest/default_params/quadplane.parm`; `Tools/autotest/pysim/vehicleinfo.json` |
| ASPDRV | https://github.com/ArduPilot/ardupilot — `libraries/AP_Airspeed/AP_Airspeed_MS5525.cpp` (addresses 0x76, 0x77) |

### ArduPilot documentation (https://ardupilot.org/plane/docs/…)
| Key | Page |
|---|---|
| BP | common-CoreWingF405WingV2.html |
| DFU | common-loading-firmware-onto-chibios-only-boards.html |
| LIM | common-limited-firmware.html |
| FR | quadplane-frame-setup.html (motor order, outputs 5–8) |
| MT | https://ardupilot.org/copter/docs/connect-escs-and-motors.html (motor-test letters, clockwise from front-right) |
| TR | quadplane-transitions.html |
| TP | quadplane-vtol-tuning-process.html (expo, filter, accel limits by prop size; first-flight values; 50 % rule; hover learning) |
| DS | common-dshot-escs.html (DShot150 for long leads; MIN/MAX ignored; no calibration) |
| BL | common-blheli32-passthru.html |
| ESC | quadplane-esc-calibration.html |
| FS | apms-failsafe-function.html (Q-mode RC failsafe → QLAND; two-stage battery; "no pulses") |
| NF | common-imu-notch-filtering.html; common-throttle-based-notch.html |
| BS | common-imu-batchsampling.html ("at least 1 minute"; OPT = 4; hover learning "at least 10 seconds") |
| ASP | calibrating-an-airspeed-sensor.html; airspeed.html |
| CRSF | common-crsf-telemetry.html; common-tbs-rc.html; common-rc-systems.html |
| CAL | common-accelerometer-calibration.html; common-compass-calibration-in-mission-planner.html; common-radio-control-calibration.html |
| VIB | common-measuring-vibration.html |
| QAT | qautotune-mode.html; automatic-tuning-with-autotune.html |

### Vendors and other projects
| Key | Source |
|---|---|
| HOLY | https://holybro.com/products/digital-air-speed-sensor-standard (spec table: MS5525DSO address 0x76, MS4525DO 0x28) and `.js` product JSON (prices/stock: MS5525DSO/PT40 $59.99; MS4525DO sensor-only $46.59 SKU 19007; PT40 pitot-only $7.99 SKU 32022) |
| TE | MS5525DSO datasheet, https://www.farnell.com/datasheets/2722597.pdf: "MS5525DSO address is 111011Cx, where C is the complementary value of the pin CSB" |
| ESCL | https://www.amazon.com/dp/B0DJQVGSBC — title "SoloGood … 45A … BLHeli_S … Support D-Shot 150/300/600"; MCU and firmware version not shown |
| RP3 | https://www.radiomasterrc.com/products/rp3-expresslrs-2-4ghz-nano-receiver — ESP8285, CRSF, ELRS v3.0 pre-installed, bind phrase, WiFi update |
| GPS | https://www.racedayquads.com/products/hglrc-m100-5883-gps-module-10th-gen — M10, 115200, UBX 10 Hz; compass chip not stated |
| ELRS | https://www.expresslrs.org/software/mavlink/ — MAVLink mode settings, ≥ 3.5.0, ESP only, 1:2 ratio, UDP 14550, bandwidth; https://www.expresslrs.org/quick-start/binding/ |
| ELRSSRC | https://github.com/ExpressLRS/ExpressLRS — `src/src/rx-serial/SerialMavlink.cpp` (RX sends RC_CHANNELS_OVERRIDE; nothing when no frame) |
| BJ | https://github.com/bird-sanctuary/bluejay — BB21/BB51, DShot 300/600, bidirectional, 24/48/96 kHz |
| TOOLS | Mission Planner https://firmware.ardupilot.org/Tools/MissionPlanner/MissionPlanner-latest.msi; QGC https://docs.qgroundcontrol.com/master/en/qgc-user-guide/getting_started/download_and_install.html; STM32CubeProgrammer https://www.st.com/en/development-tools/stm32cubeprog.html (did not answer a scripted request on 2026-10-21; URL from the ArduPilot DFU page); ESC Configurator https://esc-configurator.com/; ELRS Configurator https://github.com/ExpressLRS/ExpressLRS-Configurator/releases; FilterReview https://firmware.ardupilot.org/Tools/WebTools/FilterReview/ |

### Repo files
`docs/purchasing/C0_BOM.csv`; `analysis/results.json` (C0.sized: m 6.18 kg, Tunit_g 1545.6, I_hover 37.5 A, I_trans 74.4 A,
E_Wh 97.85; params Tmax_g 3130; base Vs 12, Vc 20, etaBatt 0.95; pick 144.3 Wh); `docs/DESIGN-BASIS.md` (R10, R11, R14,
R16, R18, R20); `docs/research/budget-avionics.md`; `docs/research/avionics-autopilot.md`; `docs/research/budget-lift.md`;
`review/src/body.html` §10 and `review/src/app.js` `drawState()`.

## 3. Design decisions (Dn keys are cited from `vtol_c0.param`)

**D1 — Firmware: ArduPlane 4.7.2 stable, target CoreWingF405WingV2.** It is stable as of 2026-10-11 (FWS). Pin
4.7.2 for the season and retest in SITL before any upgrade. Alternative not needed: Matek F405-WMO fallback (review).

**D2 — Frame: Quad X (`Q_FRAME_CLASS,1`, `Q_FRAME_TYPE,1`).** The rotor rectangle is 0.876 m × 0.867 m
(results.json geo: xFront − xRear; 2 × yIn), nearly square. Quad is compiled in (HW-inc).

**D3 — Output map: lift S5–S8, pusher S9, ailerons S1–S2, elevator S3, rudders S4 + S11.** Timer groups are
S1-2 / S3-4 / S5-7 / S8-10 / S11-12, and DShot forces a whole group (HW README). The review map puts the lift motors
on S7–S10 and the rudders on S5–S6, so DShot on S7 would force the rudders into DShot. The new map keeps every servo
out of a DShot group and matches ArduPilot's lift-motors-on-5–8 convention (FR). The checker's `--corewing` option
enforces this.

**D4 — Airspeed: the BOM's MS5525DSO at I²C 0x77 (`ARSPD_TYPE,5`, `ARSPD_BUS,0`).** Holybro ships it at 0x76 (HOLY).
The board's SPL06 baro is at 0x76 on the only I²C bus (HW). The MS5525 LSB is the complement of CSB (TE), so CSB → GND
gives 0x77. Type 5 also stops the driver probing 0x76 (ASPDRV). The rework is a hardware step. Whether the Holybro PCB
has a jumper: —. Bench proof: "MS5525[0]: Found on bus 0 addr 0x77". Fallback: MS4525DO sensor-only + PT40 = $54.58
(address 0x28, `ARSPD_TYPE,1`), $5.41 cheaper than the MS5525 kit (HOLY).

**D5 — ESC protocol: DShot150 on lift (`Q_M_PWM_TYPE,4`) and pusher (`SERVO_BLH_MASK,256`, `SERVO_BLH_OTYPE,4`).**
DShot150 is "recommended for larger aircraft with long signal lead runs" (DS). The ESCs are on the booms. DShot
needs no ESC calibration and gives a hard zero when disarmed (DS). `SERVO_DSHOT_ESC,2` = BLHeli_S/BlueJay command set (PD).
Bluejay is optional; it has no DShot150 (BJ), so moving to it means DShot300.

**D6 — VTOL tuning: starting values scaled to 17-inch props.** Interpolated from TP step 3 between the 10 in and
20 in values: `Q_M_THST_EXPO` 0.72, `INS_GYRO_FILTER` 26 Hz, `Q_A_ACC_P/R_MAX` 680 deg/s², `Q_A_ACC_Y_MAX` 50,
`Q_A_RAT_YAW_P` 0.56, FLTD/FLTT 13 Hz. Rate P/I/D stay at the firmware defaults; TP step 6 halves them on oscillation.
`Q_M_THST_HOVER` starts at 0.25 (TP step 4). Expected learned value about 0.49 (est.) = 1545.6/3130 g (results.json).

**D7 — Current limiting.** Review §10 asks for a battery current limit ≤ 60 A with the parameter name "—".
`BATT_WATT_MAX` is compiled out (FWS features). The only in-build limiter, `Q_M_BAT_CURR_MAX`, cuts **lift-motor**
throttle only. In a transition, hover needs about 37.5 A of the 74.4 A estimate (results.json), so a 60 A cap would
take lift away exactly when it is needed. Chosen: 85 A as a fault guard, under the board sensor's 90 A continuous (BP).
Transition current is trimmed with `TKOFF_THR_MAX,75` (AUTO transitions use it, TR) and the pilot's throttle in FBWA.
Pack burst test (review §5 M4) decides the final numbers.

**D8 — RC link: CRSF on UART6, `RC_OPTIONS` 8736.** That is the default bit 5 plus bit 9 (suppress the ELRS mode
message) and bit 13 (420 kbaud, BP and CRSF pages). Arm on CH5 (ELRS AUX1), six modes on CH6, E-stop CH7, QAssist CH8,
RTL CH9. `ARMING_RUDDER,0`; `Q_OPTIONS` bit 18 = arm only in VTOL modes.

**D9 — Two-stage battery failsafe.** Low = 1950 mAh (30 %) or 21.0 V sag-compensated → **RTL**, which ends in QRTL and a
vertical landing at home (`Q_RTL_MODE,1`). Critical = 1300 mAh (20 % = R10 reserve) or 19.8 V → **QLAND** in place.
FS: "A reasonable setup would be to have BATT_FS_LOW_ACT = 1 (RTL) and BATT_FS_CRT_ACT = 2 (Land)". 4 (QLand) is used
for an explicit VTOL landing. FS also suggests 20 % for `BATT_LOW_MAH`; 30 % is used because the planned R10 mission
already ends near 29 % left (1 − 97.85/0.95/144.3, results.json), and the low stage must leave room to fly home.
Volts per cell (3.5/3.3) are estimates. `BATT_FS_VOLTSRC,1` uses sag-compensated voltage so transition sag does not
trip it. The hover-phase overlay uses low → QLAND, since RTL would start a fixed-wing return. The parameter is
`BATT_FS_LOW_ACT`; there is no `BATT_FS_LLOW_ACT`.

**D10 — Geofence: 110 m above home + 300 m circle, action RTL.** 110 m is 12 m below the 400 ft (121.9 m) limit
(DESIGN-BASIS R18), so the overshoot after a breach stays legal. SITL scenario F peaked at 113.1 m. Radius 300 m is the
firmware default; set it per site. Hover sessions: 10 m / 30 m (firmware minimums, PD), action report-only.

**D11 — RC-loss behaviour.** In QSTABILIZE, QHOVER and QLOITER, ArduPilot forces **QLAND** (or QRTL / RTL via
`Q_OPTIONS` bits 5/20) (FS). QLAND is kept for the ≤ 5 m hover phase. In fixed-wing modes: short failsafe → CIRCLE, long
(5 s) → RTL → QRTL → land. Receiver failsafe = no pulses (FS).

**D12 — Telemetry at $0.** No radio in the BOM. A SiK radio costs $58.99 ($65.04 with 10.25 % tax), more than the $60.04 crash reserve in the current BOM (results.json `C0.bom.crash`). Options
(peripherals.md §2.3): (A) CRSF telemetry to the Pocket Crush, plus Yaapu with `RC_OPTIONS` bit 8; (B) ELRS MAVLink
mode via the Pocket Crush backpack WiFi to Mission Planner (overlay `vtol_c0_elrs_mavlink.param`); (C) CoreWing WiFi
module on the ground. In (B) the RX sends RC as `RC_CHANNELS_OVERRIDE` (ELRSSRC). SITL scenario G showed RC-loss
failsafe 1–2 s after the overrides stop. One RX cannot run CRSF and MAVLink at once, which corrects the review's
"CRSF + MAVLink" row.

**D13 — Notch with 60 s hovers.** TP asks for 2 minutes. BS asks for "at least 1 minute" of flight for batch FFT, and
hover-thrust learning needs ≥ 10 s with no stick input. So: two separate 60 s no-input QHOVER flights with batch logging
(`INS_LOG_BAT_MASK,1`, `INS_LOG_BAT_OPT,4` pre + post filter). Accept the noise peak if the flights agree. Then use the
throttle-based notch (`INS_HNTCH_MODE,1`, REF = learned hover thrust, FREQ = peak, BW = FREQ/2; NF). The in-flight FFT is
compiled out. A third 60 s hover confirms the attenuation.

**D14 — No Lua scripts.** Not compiled in (FWS; firmware/scripts/README.md).

## 4. Review §10 (and related) — exact changes needed to match the firmware

| # | Review location | Review says | Firmware / correct value | Why |
|---|---|---|---|---|
| R1 | §10 "Outputs and wiring", S1–S2 | Aileron L, R | **same** (S1, S2 = 4 Aileron) | — |
| R2 | §10 outputs, S3 | Pusher ESC | **S3 = Elevator** (19) | DShot pusher cannot share group S3-4 with a servo (D3) |
| R3 | §10 outputs, S4 | Elevator | **S4 = Rudder L** (21) | D3 |
| R4 | §10 outputs, S5–S6 | Rudder L, R | **S5, S6 = Motor1 (front-right CCW), Motor2 (rear-left CCW)** | S5-7 is one timer group with a lift motor (D3) |
| R5 | §10 outputs, S7–S10 | Lift motors 1–4 | **S7 = Motor3 (front-left CW), S8 = Motor4 (rear-right CW), S9 = pusher (Throttle 70, DShot150), S10 = unused** | D3, D5 |
| R6 | §10 outputs, S11–S12 | Spare | **S11 = Rudder R (21)**; S12 (LED pad) spare | S11-12 are PWM-only; rudder 2 fits there |
| R7 | §10 outputs, receiver row | "RP3 V2 ELRS receiver (CRSF + MAVLink)" | **CRSF (SERIAL6 = 23) baseline; MAVLink mode is a switchable overlay, not simultaneous** | D12 |
| R8 | §10 outputs, airspeed row | "MS5525DSO airspeed … (wing tip)" | add: **must be strapped to I²C 0x77 (`ARSPD_TYPE` 5); ships at 0x76 = baro address** (or MS4525DO fallback) | D4 |
| R9 | §10 verdict | "Telemetry runs over ELRS MAVLink, so no separate radio is needed" | "No separate radio: CRSF telemetry on the handset, or ELRS MAVLink mode (switch overlay) for a GCS" | D12 |
| R10 | §10 FC table, ArduPilot target | "4.7.2-beta only" (warn) | **4.7.2 stable** (ok) | D1 |
| R11 | §10 threshold table, Battery current limit | "set ≤ 60 A; parameter name (—)" | **`Q_M_BAT_CURR_MAX` = 85 A (lift motors only) + `TKOFF_THR_MAX` 75 %; `BATT_WATT_MAX` not in this build** | D7 |
| R12 | §10 threshold table, Geofence ceiling | 120 m AGL | **110 m above home (`FENCE_ALT_MAX`), 12 m below the 400 ft limit** | D10 |
| R13 | §10 state diagram (app.js), Transition → cruise label | "≥ 15 m/s" | **≥ 16 m/s** (`AIRSPEED_MIN`) | matches the review's own table |
| R14 | §10 state diagram, cruise → Q_ASSIST label | "< 12 m/s" | **< 13 m/s** (`Q_ASSIST_SPEED`) | matches the review's own table |
| R15 | §10 state diagram footer, RC link loss | "RC link loss → RTL, then QLAND" | "**Fixed-wing:** RTL → QRTL → vertical land; **Q modes:** QLAND in place" | D11; SITL B, C |
| R16 | §10 state diagram footer, low battery | "Low battery → QLAND" | "**Low → RTL (→ QRTL land at home); critical → QLAND**" | D9; SITL E |
| R17 | §10 state diagram footer, geofence | "Geofence breach at 120 m AGL → RTL" | "**at 110 m** → RTL (→ QRTL near home)" | D10; SITL F |
| R18 | §10 threshold table, Q_TRANS_FAIL / ACT | 15 s / QRTL (est) | **same**; SITL D confirmed "Transition failed, exceeded time limit" → QRTL at 15 s | — |
| R19 | §10 verdict / M-items, hover notch | (not stated) | add: notch from two 60 s hovers (D13) | 60 s hover limit vs 2-min guidance |
| R20 | §12 decision card "FC target is beta-only" and DESIGN-BASIS R17 go/no-go 2027-02-22 | open risk | **closed: stable 4.7.2 includes the target** | D1 |

## 5. SITL results (2026-10-21)

ArduPlane V4.7.2 SITL, model `quadplane`, defaults = ArduPilot `quadplane.parm` → `vtol_c0.param` →
`firmware/sitl/sitl_overrides.param`. 133 parameters read back from the running firmware. All match, except the 3
`SERVO_BLH_*` parameters, which SITL lacks because it has no BLHeli. Results are in `firmware/sitl/results/`.

| Scenario | Result |
|---|---|
| A nominal: QLOITER take-off → AUTO loop → NAV_VTOL_LAND | PASS. AIRSPEED_MIN reached 5 s after transition start; "Transition done" 10–11 s after AUTO; landed 0.1 m from home |
| B RC loss in fixed-wing loiter | PASS: RTL → QRTL → landed at home |
| C RC loss in QLOITER hover | PASS: QLAND in place |
| D forward transition with no pusher | PASS: "Transition failed, exceeded time limit" at 15 s → QRTL → land |
| E low battery in fixed-wing loiter | PASS: RTL → QRTL → land at home |
| F climb through fence ceiling | PASS: breach at 110 m → RTL → QRTL; peak 113.1 m |
| G ELRS-MAVLink-style RC (overrides only), link lost in hover | PASS: QLAND 1–2 s after overrides stop |

Limits: the SITL airframe is ArduPilot's generic QuadPlane, not C0 (learned hover throttle 0.15 vs about 0.49 est.
for C0). The results validate mode logic, thresholds, failsafes, fence and the mission sequence. They do **not**
validate gains, power or endurance. First SITL run finding: a straight FBWA transition reached the 300 m fence circle
about 6 s after "Transition done". Start transitions from the upwind field edge and turn at once (README §9.6).
