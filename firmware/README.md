# C0 flight software package — from a blank flight controller to the first transition

ArduPlane QuadPlane on the CoreWing F405 Wing APP V2. This package holds everything the team needs to
program and configure each programmable part of the C0 lift + cruise VTOL, in the order the work is done.
Every number has a source key; the full source list with check dates is in
[docs/research/firmware.md](../docs/research/firmware.md). Values marked (est.) are engineering estimates.
"—" means the value is unknown.

**Status, 2026-10-21.** The parameter file passes the checker against the current ArduPlane metadata and the
4.7.1 stable metadata. All seven SITL scenarios passed on ArduPlane 4.7.2 (§11). Nothing here has run on the
real board yet. Treat every gain as a starting value.

| File | What it is |
|---|---|
| `vtol_c0.param` | Full parameter set for the aircraft, with a comment and source on every line |
| `vtol_c0_hover_phase.param` | Overlay for hover-only sessions: 10 m fence, no fixed-wing modes on the switch |
| `vtol_c0_elrs_mavlink.param` | Overlay: switch the ELRS receiver from CRSF to MAVLink mode for a $0 Mission Planner link |
| `tools/check_params.py` | Validator: syntax, names, ranges and the CoreWing DShot timer groups |
| `sitl/` | SITL overrides, the scripted mission `mission_test.py`, results from 2026-10-21 (generic QuadPlane model) and 2026-10-25 (`results_c0/`, C0 airframe model) |
| `sitl/c0_physics.py` | 6-DOF physics model of C0 for ArduPilot SITL's JSON interface (reads mass, geometry and aero from `analysis/` and `cad/`); `--validate` prints the trim checks |
| `sitl/run_c0_sitl.ps1` | Starts the C0 model + SITL for hand-flying from Mission Planner (TCP 127.0.0.1:5760) |
| `peripherals.md` | ESCs (BLHeli_S / Bluejay), ELRS receiver and transmitter, GPS/compass, airspeed, Remote ID, telemetry |
| `checklists.md` | Bench, pre-flight, failsafe-test and post-flight log-review checklists |
| `scripts/README.md` | Why there are no Lua scripts: this firmware build does not include scripting |

## 0. Verified facts this package relies on

| Fact | Value | Source (checked 2026-10-21) |
|---|---|---|
| Board | CoreWing F405 Wing APP V2, STM32F405 with 1 MB flash | BOM; hwdef `FLASH_SIZE_KB 1024` |
| ArduPilot target | `CoreWingF405WingV2` (hwdef folder exists on ArduPilot master) | github.com/ArduPilot/ardupilot `libraries/AP_HAL_ChibiOS/hwdef/CoreWingF405WingV2` |
| Stable firmware | **ArduPlane 4.7.2 stable now includes this target.** It was beta-only in the review; that risk is closed | firmware.ardupilot.org/Plane/stable/CoreWingF405WingV2/firmware-version.txt and git-version.txt ("Plane: version to 4.7.2", 2026-10-11) |
| QuadPlane in the build | yes (`HAL_QUADPLANE_ENABLED`); Quad, Hexa and Octa frames | features.txt (stable); hwdef include `minimize_fpv_osd.inc` |
| Lua scripting | **not in the build** (`!AP_SCRIPTING_ENABLED`) | features.txt (stable) |
| DShot | outputs 1–10. Bi-directional DShot only on 1–4. Outputs 11–12 are PWM only | hwdef PWM lines; board README; ardupilot.org board page |
| Output groups | S1-2, S3-4, S5-7, S8-10, S11-12. "If any DShot-capable output in a group uses DShot then all DShot-capable outputs in that group need to use DShot" | hwdef README |
| Battery-power limiter `BATT_WATT_MAX` | **not in the build** (`!AP_BATTERY_WATT_MAX_ENABLED`) | features.txt (stable) |
| MAVLink-radio RC input (`RADIO_RC_CHANNELS`) | not in the build (`!AP_RCPROTOCOL_MAVLINK_RADIO_ENABLED`) | features.txt (stable) |
| Gyro FFT | not in the build (`!HAL_GYROFFT_ENABLED`). Use the throttle-based notch | features.txt |
| QAUTOTUNE / QuickTune | both in the build | hwdef (`QAUTOTUNE_ENABLED 1`); features.txt `AP_QUICKTUNE_ENABLED` |
| Barometer | SPL06 at I²C bus 0, address 0x76 — the **only** I²C bus, shared with the external I²C/airspeed connector | hwdef `BARO SPL06 I2C:0:0x76`, `I2C_ORDER I2C1` |
| Lift/pusher ESCs | SoloGood 45A BLHeli_S, "Support D-Shot 150/300/600". ESC MCU: — | BOM; amazon.com/dp/B0DJQVGSBC listing title |
| RC receiver | RadioMaster RP3 V2, ESP8285, CRSF output, ships with ELRS 3.0 | BOM; radiomasterrc.com product page |

## 1. Install the tools (Windows)

1. **Mission Planner** (primary ground station; parameter files, motor test, logs):
   installer https://firmware.ardupilot.org/Tools/MissionPlanner/MissionPlanner-latest.msi,
   guide https://ardupilot.org/planner/docs/mission-planner-installation.html.
2. **QGroundControl** (optional second ground station):
   https://docs.qgroundcontrol.com/master/en/qgc-user-guide/getting_started/download_and_install.html.
   This package's parameter files use the Mission Planner/MAVProxy `NAME,VALUE` format. Load them with Mission Planner.
3. **STM32CubeProgrammer** (needed once, for the first DFU flash): https://www.st.com/en/development-tools/stm32cubeprog.html.
   The ArduPilot page says it installs the DFU driver and may need Java
   (https://ardupilot.org/plane/docs/common-loading-firmware-onto-chibios-only-boards.html).
4. **ESC Configurator** (web, Chrome/Edge): https://esc-configurator.com/ — BLHeli_S/Bluejay settings through the FC.
5. **ExpressLRS Configurator**: https://github.com/ExpressLRS/ExpressLRS-Configurator/releases — receiver firmware and bind phrase.
6. **Python 3 + pymavlink** for the tools in this folder: `py -m pip install pymavlink`. The checker uses only the standard library.

## 2. Firmware target and files

- Target folder: https://firmware.ardupilot.org/Plane/stable/CoreWingF405WingV2/
  - `arduplane_with_bl.hex` — bootloader plus firmware. **First flash only, over DFU.**
  - `arduplane.apj` — later updates from Mission Planner ("Install Firmware" > "Load custom firmware").
- Do **not** use `CoreWingF405WMiniV2`. That target is for the Wing Mini V2, which has a different current-sensor scale (`BATT_AMP_PERVLT` 51 vs 64, board page).
- Pin the firmware version for the season. Record `ArduPlane V4.7.2 (git hash)` from the Mission Planner Messages tab in the build log. Retest in SITL before any upgrade.

## 3. First flash (DFU)

The board ships without an ArduPilot bootloader (hwdef README "Loading Firmware").

1. Remove the props. Unplug the flight battery. Leave only USB connected.
2. Enter DFU mode. The board has **no boot button**. The hwdef README says to "pull the `BOOT0` pin on the USB
   extender connector low while powering the board over USB, or hold the BOOT button on the wireless USB extender
   module if one is fitted". The included wireless module has that BOOT button, so use it.
   (On STM32 parts, BOOT0 is normally pulled *high* for DFU. The extender may invert it. Check the CoreWing
   Wing V2 user manual linked from the ArduPilot board page before bridging any pin.)
3. In Device Manager, check for "STM32 BOOTLOADER" under Universal Serial Bus devices.
4. STM32CubeProgrammer: connection **USB** > Connect > Open file `arduplane_with_bl.hex` > Download.
5. Power-cycle. In Mission Planner, connect over USB (COM port, 115200, or auto). Messages should show
   `ArduPlane V4.7.2` and the board name.
6. Later updates: Mission Planner > Setup > Install Firmware > "Load custom firmware" > `arduplane.apj`
   (or pick Plane from the list once the board is detected).

## 4. Wiring (FC pad → device)

Pad names come from the hwdef README and the ArduPilot board page. Before soldering, check every pad on the
board's own pinout images: the GPS pads and the GPS connector use different pin orders (hwdef README).

### 4.1 Signal and power

| FC pad / connector | Device | Notes |
|---|---|---|
| BAT+/BAT− (board power input, through the 90 A sensor) | 6S pack via XT90-S anti-spark | Board input 3–6S, 10–28 V. Fit the included 35 V 470 µF capacitor on the input (board page) |
| S1 header | Aileron servo, left | Servo rail powered by the onboard servo BEC (8 A cont / 14 A peak). **Set the rail to 6 V**: the ES3005HV has no 5 V rating (budget-avionics §6) |
| S2 header | Aileron servo, right | |
| S3 header | Elevator servo | |
| S4 header | Rudder servo, left boom | |
| S5 header | Lift ESC 1 — front-right, CCW (signal + GND only) | DShot150. Do **not** connect an ESC BEC red wire to the servo rail (board page) |
| S6 header | Lift ESC 2 — rear-left, CCW | |
| S7 header | Lift ESC 3 — front-left, CW | |
| S8 header | Lift ESC 4 — rear-right, CW | |
| S9 header | Pusher ESC (SoloGood 45A) | DShot150 via `SERVO_BLH_MASK`/`OTYPE` |
| S10 header | — leave empty | In the DShot group with S8–S9 |
| S11 header | Rudder servo, right boom | PWM-only output |
| LED pad (PWM12) | spare | PWM only; no serial LED (no DMA, hwdef README) |
| TX6 / RX6 (+5 V, GND) | RP3 V2 ELRS receiver: RX6 ← receiver TX, TX6 → receiver RX | SERIAL6 = CRSF (default) |
| GPS connector (UART5 + I²C + 4V5) | HGLRC M100-5883: GPS TX → R5, GPS RX → T5, SDA/SCL → I²C | 4V5 is also live on USB, which makes bench work easier |
| I²C airspeed connector | Airspeed sensor (see §4.3) | Same bus as the barometer |
| 5 V pad (FC BEC, 5.2 V / 4 A) | NewBeeDrone BeeID Remote ID module | Power only; BeeID uses its own GPS. Do not use the 4V5 USB rail |
| TELEM2/4 (GH1.25 6-pin: GND RX2 TX2 RX4 TX4 4V5) or pads T4/R4 | spare, reserved for a SiK telemetry radio | SERIAL4 = MAVLink2 |
| USB extender connector | CoreWing BLE/WiFi module | SERIAL1 = MAVLink2 at 115200 (bench and field laptop link) |

### 4.2 UART assignments

| SERIALn | UART | Pads | Protocol in `vtol_c0.param` | Device |
|---|---|---|---|---|
| 0 | USB | USB-C | MAVLink2 (fixed) | Laptop |
| 1 | USART1 | extender connector / T1, R1 | 2 = MAVLink2, 115200 | CoreWing WiFi/BLE module |
| 2 | USART2 | SBUS pad (inverted RX) | — (unused) | — |
| 3 | USART3 | VTX connectors | −1 = none | — |
| 4 | UART4 | TELEM2/4, T4/R4 | 2 = MAVLink2 | spare (SiK radio) |
| 5 | UART5 | GPS connector | 5 = GPS | HGLRC M100-5883 |
| 6 | USART6 | TX6/RX6 | 23 = RCIN | RP3 V2 (CRSF) |

### 4.3 Airspeed sensor: I²C address — MS5525DSO must run at 0x77

The BOM buys the **Holybro MS5525DSO + PT40** (BOM line "Holybro MS5525DSO + PT40 airspeed"). Holybro's product page
gives its I²C address as **0x76** (holybro.com/products/digital-air-speed-sensor-standard, 2026-10-21). That is the
address of this board's SPL06 barometer, which sits on the **same and only** I²C bus (hwdef `BARO SPL06 I2C:0:0x76`,
`I2C_ORDER I2C1`). Two devices cannot share an address on one bus.

The MS5525DSO has two addresses. The TE datasheet says "MS5525DSO address is 111011Cx, where C is the complementary
value of the pin CSB" (farnell.com/datasheets/2722597.pdf, checked 2026-10-21): CSB high → 0x76, CSB low → **0x77**.
The ArduPilot driver probes both (`AP_Airspeed_MS5525.cpp`: `0x76`, `0x77`), and `ARSPD_TYPE` can pin one:
3 = auto, 4 = 0x76, 5 = 0x77 (apm.pdef.xml).

**Setting used: `ARSPD_TYPE,5` (MS5525 at 0x77), `ARSPD_BUS,0`.** Forcing 0x77 also stops the driver from probing
0x76, where it would find the barometer. Hardware step required:

1. On the Holybro breakout, find the MS5525DSO CSB pin (pin assignment in the TE datasheet). Re-strap it from
   VDD to GND: lift the pull-up or cut the trace, then bridge to GND. Whether the Holybro PCB has a jumper or
   solder bridge for this: — (inspect the board when it arrives; photograph it for the build log).
2. Bench check: power the FC on USB with only the airspeed sensor on I²C. Mission Planner Messages must show
   `MS5525[0]: Found on bus 0 addr 0x77` (driver text). The barometer must still read altitude (HUD).
   If the message shows 0x76, or the baro reads nonsense, the strap is wrong. Do not fly.
3. Blow gently into the pitot: airspeed must rise. Then do the offset calibration (§6.8).

**Fallback if the re-strap is not practical:** buy Holybro MS4525DO sensor-only (SKU 19007, $46.59) + PT40
pitot-only (SKU 32022, $7.99) = $54.58, address 0x28, and set `ARSPD_TYPE,1`. That is $5.41 below the
MS5525DSO/PT40 kit at $59.99 (holybro.com product JSON, 2026-10-21). Whether the sensor-only kit includes
cable and tubing: —.

### 4.4 Output map (SERVOn_FUNCTION) and why it differs from the review

| Output | Group | Function | Value |
|---|---|---|---|
| S1, S2 | 1 (TIM4) | Aileron L, R | 4 |
| S3 | 2 (TIM3) | Elevator | 19 |
| S4 | 2 | Rudder L | 21 |
| S5, S6, S7 | 3 (TIM8) | Motor1, Motor2, Motor3 (DShot150) | 33, 34, 35 |
| S8 | 4 (TIM2) | Motor4 (DShot150) | 36 |
| S9 | 4 | Throttle / pusher (DShot150) | 70 |
| S10 | 4 | unused | 0 |
| S11 | 5 (TIM1) | Rudder R | 21 |
| S12 (LED) | 5 | unused | 0 |

The review (§[controls] "Outputs and wiring") puts the lift motors on S7–S10 and the rudders on S5–S6. S7 shares timer
group S5–S7 with S5 and S6, so DShot on S7 would force both rudder outputs into DShot. The map above keeps
every servo out of a DShot group. It also matches ArduPilot's QuadPlane convention of lift motors on outputs 5–8
(quadplane-frame-setup.html). `tools/check_params.py --corewing` checks this automatically.

## 5. Load the parameters

1. Validate first: `py firmware/tools/check_params.py firmware/vtol_c0.param --corewing --require-every-line-commented`.
2. Mission Planner > Config > Full Parameter List > **Load from file** > `vtol_c0.param` > Write Params.
3. **Reboot.** `Q_ENABLE` and the DShot settings (`Q_M_PWM_TYPE`, `SERVO_BLH_*`) take effect only after a reboot,
   and the `Q_` parameters do not exist until then.
4. Load the same file **a second time**, Write Params, and reboot again. Then use "Compare Params" against the
   file: every row should match.
5. Hover-only sessions: also load `vtol_c0_hover_phase.param`. Reload `vtol_c0.param` before the first transition session.
6. Save the full parameter list (`Save to file`) after each session as `params_<date>.param` in the team log.

## 6. Calibrations (props off, battery on only where stated)

| # | Step | How | Pass condition |
|---|---|---|---|
| 6.1 | Board orientation | FC arrow forward, top up → `AHRS_ORIENTATION,0` | HUD horizon matches the airframe |
| 6.2 | Accelerometer | Setup > Mandatory Hardware > Accel Calibration (6 positions), then "Calibrate Level" with the wing at cruise attitude (common-accelerometer-calibration.html) | "Calibration successful" |
| 6.3 | Compass | Setup > Compass > Start, rotate the assembled airframe on all axes. On a 2.4 m aircraft, use "Large Vehicle MagCal" with GPS lock and the nose pointed at a known heading (common-compass-calibration-in-mission-planner.html). `COMPASS_AUTO_ROT,2` detects the module orientation | Fitness passes; the heading matches a phone compass within about 10° (est.) |
| 6.4 | Radio | Setup > Radio Calibration: move all sticks and switches to their ends (common-radio-control-calibration.html). Check CH5 arm, CH6 six modes, CH7 E-stop, CH8 QAssist, CH9 RTL | Modes 1–6 show QSTABILIZE, QHOVER, QLOITER, FBWA, CRUISE, QLAND |
| 6.5 | ESCs | **No throttle calibration under DShot**. DShot always uses 1000–2000 (common-dshot-escs.html). Configure ESC settings via passthrough, `peripherals.md` §1 | All 5 ESCs read and save in ESC Configurator |
| 6.6 | Battery voltage | Measure the pack with a multimeter and adjust `BATT_VOLT_MULT` until the GCS matches within 0.05 V (est.) | — |
| 6.7 | Battery current | Watt meter in series. Hold one lift motor at a steady load (props on, aircraft tethered) and adjust `BATT_AMP_PERVLT` | GCS current within 5 % of the watt meter (est.) |
| 6.8 | Airspeed offset | Cover the pitot loosely (foam) during boot or press "Calibrate Airspeed" (calibrating-an-airspeed-sensor.html) | Reads 0 ± 1 m/s (est.) still air |

## 7. Motor order, direction and servo checks

**Motor test (props OFF, battery ON, aircraft restrained).** Mission Planner > Setup > Optional Hardware > Motor
Test, 5–10 % throttle, 2 s. Buttons go clockwise from front-right
(copter/docs/connect-escs-and-motors.html):

| Button | Must spin | Output | Direction (seen from above) |
|---|---|---|---|
| A | Front-right | S5 (Motor1) | CCW |
| B | Rear-right | S8 (Motor4) | CW |
| C | Rear-left | S6 (Motor2) | CCW |
| D | Front-left | S7 (Motor3) | CW |

- Wrong motor spins: fix the signal wire at the header, not the parameters.
- Wrong direction: swap two of the three motor phase wires, or reverse it in ESC Configurator (`peripherals.md` §1).
- With the props on and the aircraft tethered, find the lowest test % that spins all four cleanly → `Q_M_SPIN_ARM`.
  The lowest that gives a little thrust → `Q_M_SPIN_MIN` (quadplane-vtol-tuning-process.html step 4).
- Props: check CW/CCW prop handedness against motor direction. Air must blow **down**.

**Servo direction checks** (FBWA or MANUAL, disarmed, rail at 6 V):

| Input | Correct surface motion | If wrong |
|---|---|---|
| Right roll stick | right aileron up, left aileron down | `SERVO1_REVERSED` / `SERVO2_REVERSED` |
| Pull back (pitch up) | elevator trailing edge up | `SERVO3_REVERSED` |
| Right yaw stick | both rudders trailing edge right | `SERVO4_REVERSED` / `SERVO11_REVERSED` |
| Stabilization (FBWA, sticks centered): roll the airframe right | ailerons command a roll left | Fix the reversals above, never `RLL2SRV` signs |
| Pitch the nose down | elevator moves up | as above |

Then set throws: `SERVOn_MIN/MAX/TRIM` so that no linkage binds at full stick. Check that the 5 servos together
stay under the 8 A servo BEC (budget-avionics M3).

**Pusher check:** QSTABILIZE, armed, props on, tethered. The pusher must stay **stopped** in Q modes. In FBWA the
throttle stick drives it. Air must blow aft.

## 8. Failsafe configuration and bench tests

| Event | Mode on event | Parameters | Bench test (props off) |
|---|---|---|---|
| RC loss in a Q mode | **QLAND** in place (ArduPilot forces this in QSTABILIZE, QHOVER, QLOITER) | `THR_FAILSAFE,1`; `Q_OPTIONS` bit 5 clear (apms-failsafe-function.html) | Arm in QLOITER, switch the TX off → GCS shows "RC Short Failsafe: switched to QLand" |
| RC loss in fixed-wing modes | CIRCLE (short), then **RTL** at 5 s, then QRTL inside `RTL_RADIUS` 100 m, then vertical land | `FS_SHORT_ACTN,0`; `FS_LONG_ACTN,1`; `FS_LONG_TIMEOUT,5`; `Q_RTL_MODE,1` | SITL scenario B |
| Battery low (30 %, or 21.0 V sag-compensated) | RTL → QRTL | `BATT_LOW_MAH,1950`; `BATT_LOW_VOLT,21.0`; `BATT_FS_LOW_ACT,1` | Set `BATT_LOW_VOLT` above pack voltage → warning + mode change; restore |
| Battery critical (20 %, or 19.8 V) | QLAND | `BATT_CRT_MAH,1300`; `BATT_FS_CRT_ACT,4` | as above |
| Forward transition not done in 15 s | QRTL | `Q_TRANS_FAIL,15`; `Q_TRANS_FAIL_ACT,1` | SITL scenario D |
| Geofence: 110 m above home or 300 m radius | RTL (→ QRTL near home) | `FENCE_*` | SITL scenario F; on the bench, `FENCE_RADIUS` shows on the map |
| Motor emergency stop | Lift motors and pusher stop at once | `RC7_OPTION,31` | Arm, flip CH7 → all motors stop |
| Arming | Only from the CH5 switch, only in VTOL modes, only with a charged pack (≥ 23.4 V) | `RC5_OPTION,153`; `ARMING_RUDDER,0`; `Q_OPTIONS,262144`; `BATT_ARM_VOLT,23.4` | Try to arm in FBWA → refused |

**Receiver failsafe setting:** set the receiver to output **no pulses** on link loss. ArduPilot recommends this over a
preset failsafe throttle (apms-failsafe-function.html). Check the RP3 V2 failsafe option in its WiFi/Lua
settings (`peripherals.md` §2). Do not set a failsafe position on the handset.

## 9. First-flight build-up

Fly at a site that allows the test (review §[schedule]). Hover tests: ≤ 5 m AGL, ≤ 60 s per hover (review §[controls], R14).
Transitions: ≥ 30 m AGL, into wind. Wind ≤ 5 m/s, gusts ≤ 8 m/s (R16). The full checklists are in `checklists.md`.

### 9.1 SITL rehearsal (every pilot, before any flight)
Use the **C0 airframe model**, not the generic QuadPlane: `sitl\run_c0_sitl.ps1 -SitlExe <ArduPlane.exe>` starts
`sitl/c0_physics.py` (a 6-DOF model built from the repo's mass, geometry, AVL aero, motor and prop data) and
ArduPlane 4.7.2 SITL on its JSON physics interface; connect Mission Planner to TCP 127.0.0.1:5760 and fly with the
Pocket Crush as a USB joystick: QSTABILIZE take-off, QLOITER, FBWA transition, CRUISE, QLOITER back-transition,
QLAND. Practise the E-stop and RTL switches. Expect what the model shows (`sitl/README.md`, C0 section): hover at
about 0.62–0.66 output, 37–38 A; forward transition 13–15 s and 140–170 m; a 30° nose-up, stalled-wing
"airbrake" phase at the start of every back-transition; cruise at 20 m/s with the pusher at about 0.7.
`sitl/mission_test.py --model JSON:127.0.0.1 --physics sitl/c0_physics.py ...` runs the seven scripted scenarios
(§11). Add `-Wind "5,270"` (5 m/s from the west) to rehearse the R16 wind limit.

### 9.2 Tethered bench run
Props on, aircraft tied down to a heavy base, battery on, `vtol_c0_hover_phase.param` loaded. QSTABILIZE, arm,
raise throttle to light the skids. Check for oscillation, vibration and current (≈ 41.2 A hover at full weight;
results.json `C0.sized.I_hover`).

### 9.3 First lift-off (QSTABILIZE) — tuning-process steps 5–6
1. Arm, disarm at once (proves the disarm path), arm again.
2. Raise the throttle slowly. At lift-off, set it straight back down. Disarm and look for oscillation.
3. If it oscillated: reduce `Q_A_RAT_RLL_P/I/D` and `Q_A_RAT_PIT_P/I/D` by 50 % and repeat (tuning-process step 6).
4. Hover at about 1 m and give 5° roll/pitch inputs. Land at any oscillation.

### 9.4 QHOVER, hover throttle, notch
1. Take off in QSTABILIZE to 5 m, switch to QHOVER for ≥ 30 s with no inputs. `Q_M_HOVER_LEARN,2` saves the hover
   throttle. Expect about 0.52 (est.) from 1637.9 g needed / 3130 g max per motor (results.json `C0.sized.Tunit_g`, `params.Tmax_g`). Above 0.6 means
   the thrust margin is short (tuning-process step 7, "should be ~0.3–0.6").
2. Then set `Q_P_D_ACC_P = 0.1 × Q_M_THST_HOVER` and `Q_P_D_ACC_I = 0.2 × Q_M_THST_HOVER` (tuning-process step 7).
3. **Notch setup within the 60 s hover limit.** The tuning-process page asks for a 2-minute no-input hover.
   The review limits test hovers to 60 s (R14 mitigation). Two other ArduPilot sources cover the shorter hover:
   - The batch-sampler page asks for "a regular flight (not just a gentle hover) of at least 1 minute"
     (common-imu-batchsampling.html). One 60 s QHOVER with `INS_LOG_BAT_MASK,1` and `INS_LOG_BAT_OPT,4`
     (pre + post filter, both already set) meets that.
   - Throttle-based notch tracking needs only the hover noise frequency and the hover thrust. Hover-thrust
     learning needs "no pilot stick input for at least 10 seconds" (same page; `Q_M_HOVER_LEARN,2`).
   - Procedure: fly two separate 60 s no-input QHOVER flights on a calm day. Open each .BIN in
     https://firmware.ardupilot.org/Tools/WebTools/FilterReview/ (or Mission Planner > Setup > Advanced > FFT >
     "IMU Batch Sample"). Accept the peak only if both flights agree within about 10 % (est.); the average is
     `hover_freq`. More batches per flight are available by lowering `INS_LOG_BAT_LGIN` (batch page: "can be
     lowered to increase accuracy").
   - Set the throttle-based notch (common-throttle-based-notch.html): `INS_HNTCH_ENABLE,1`, reboot,
     `INS_HNTCH_MODE,1`, `INS_HNTCH_FREQ` = hover_freq, `INS_HNTCH_BW` = hover_freq/2, `INS_HNTCH_REF` = learned
     `Q_M_THST_HOVER`. Leave `INS_HNTCH_HMNCS` at its default 3 (1st + 2nd harmonic). The in-flight FFT
     auto-setup is not available (`!HAL_GYROFFT_ENABLED`).
   - Fly one more 60 s hover and check that the post-filter spectrum shows the peak attenuated. Then set
     `INS_LOG_BAT_MASK,0` to free RAM (batch page note).
4. Then QLOITER: position hold within about 2 m in light wind (est.).
5. Manual roll/pitch tune, then QAUTOTUNE (in the build) per tuning-process steps 10+ and qautotune-mode.html.

### 9.5 Fixed-wing preparation
- Airspeed ratio: `ARSPD_AUTOCAL,1` for a 5-minute loiter, then back to 0 (calibrating-an-airspeed-sensor.html).
  Review M[controls].1 failure threshold: > 10 % error puts the real transition speed under R11's 15.6 m/s.
- Fixed-wing gains start at firmware defaults. Run AUTOTUNE in FBWA after the first transitions
  (automatic-tuning-with-autotune.html).

### 9.6 First transitions
1. Load `vtol_c0.param` again (removes the hover-phase overlay). Check `Q_ASSIST_SPEED` = 13.
2. QLOITER to ≥ 30 m, nose into wind, with the longest clear line ahead.
3. Switch to **FBWA** and push the throttle to about 70 %. The lift motors hold height. At `AIRSPEED_MIN` 16 m/s
   they taper out over 5 s. In SITL this took 10–11 s from mode change to "Transition done" on the generic model (sitl/results) and 13–15 s, 140–170 m on the C0 airframe model (sitl/results_c0.json).
4. **Start the turn as soon as "Transition done" appears.** In SITL, a straight FBWA transition reached the 300 m
   fence circle about 6 s after transition end (first SITL run, scenario B, 2026-10-21). Start transitions from
   the upwind edge of the field.
5. Back-transition: select QLOITER (or QHOVER). The pusher stops at once and the lift motors brake the aircraft
   (quadplane-transitions.html). Allow about 100 m stopping distance at 20 m/s (2 m/s² decel). In the C0 airframe model the airbrake phase pitches to the 30° VTOL limit and briefly stalls the wing (−17°/+33° swing, ≤ 2 m altitude loss, sitl/README.md Gains item 1); if the aircraft does this, lower `Q_TRANS_DECEL` first (gentler, longer stop), then `Q_ANGLE_MAX`, before any attitude gain. The test cards F06–F13 carry this as a watch item.
6. Check in the log: the transition current peak against the 75.7 A estimate (results.json `C0.sized.I_trans`),
   battery sag, and time to `AIRSPEED_MIN`. Review M[controls].2 failure threshold: > 15 s or > 100 m.
7. Only then: CRUISE circuits, RTL test at altitude, and the full R9 mission in AUTO (`sitl/mission_test.py`
   scenario A is the template: NAV_WAYPOINTs then NAV_VTOL_LAND).

## 10. Decisions that changed the review's controls chapter

Details and rationale are in docs/research/firmware.md. They should be folded into the review:

1. **Output map**: lift on S5–S8, pusher S9, rudder 2 on S11 (DShot timer-group conflict in the review map).
2. **Airspeed sensor**: the MS5525DSO ships at 0x76, the onboard baro's address. Run it at 0x77 (CSB strapped low, `ARSPD_TYPE,5`) or swap to MS4525DO (§4.3). The review row "I²C MS5525DSO airspeed" needs this note.
3. **Telemetry (no radio in the BOM, $0)**: one RP3 V2 runs either CRSF or ELRS-MAVLink, not both (review row "CRSF + MAVLink"). Baseline for hover phases: CRSF (`SERIAL6_PROTOCOL,23`), with telemetry on the Pocket Crush. GCS link for transition flights: ELRS MAVLink mode (`SERIAL6_PROTOCOL,2`, `SERIAL6_BAUD,460`, `RSSI_TYPE,5`, ELRS ≥ 3.5 on TX and RX, Mission Planner on UDP 14550 via the Pocket Crush backpack WiFi). The RX then sends RC as RC_CHANNELS_OVERRIDE; SITL scenario G showed RC-loss failsafe 1 s after the overrides stop. Details and limits: peripherals.md §2.3–2.4.
4. **Transition threshold**: the state diagram labels say "≥ 15 m/s" and "< 12 m/s". The table says AIRSPEED_MIN 16 and Q_ASSIST_SPEED 13. The parameters use 16 and 13.
5. **Battery current limit**: `BATT_WATT_MAX` is not in this build. `Q_M_BAT_CURR_MAX` limits only the lift motors, so it is set to 85 A as a fault guard, not 60 A. Transition current is managed with `TKOFF_THR_MAX` 75 % and the pilot's throttle. Bench test M4 decides. **`THR_MAX` 85** caps the pusher in every fixed-wing mode: the C0 SITL model gives about 890 W at 100 % throttle on a full 25.2 V pack (`sitl/validation_c0.json`, estimated motor model) against the X4110S 615 W rating; power scales roughly as throttle³, so 85 % is about 0.85³ × 890 = 547 W (est.). Cruise needs 233–302 W (SITL model / aero build-up). Bench test M1 (pusher power at full pack, TEST-PLAN C09) re-sets it; if `THR_MAX` is lowered, re-check that level speed at full throttle still exceeds `AIRSPEED_MAX` 25 m/s.
6. **Low-battery action, two stages**: low (30 % / 1950 mAh, or 21.0 V sag-compensated) → RTL, which ends in QRTL and a vertical landing at home (`Q_RTL_MODE,1`). Critical (20 % / 1300 mAh, or 19.8 V) → QLAND in place. ArduPilot's failsafe page calls "BATT_FS_LOW_ACT = 1 (RTL) and BATT_FS_CRT_ACT = 2 (Land)" a reasonable setup. 4 = QLand is used for the explicit VTOL landing. The review had low = QLAND. The hover-phase overlay sets low → QLAND, because RTL would start a fixed-wing return. (Note: the parameter is `BATT_FS_LOW_ACT`; `BATT_FS_LLOW_ACT` does not exist.)
7. **Fence ceiling**: 110 m above home, 12 m below the 400 ft (121.9 m) limit, so the climb overshoot after a breach stays legal. SITL peaked at 113.1 m, 3.1 m over the fence. Review wording: "fence 110 m, 12 m below the 400 ft limit".
8. **RC loss in hover**: QLAND in place (ArduPilot behaviour in Q modes). The review's "RC loss → RTL then QLAND" applies to fixed-wing modes only.
9. **Firmware**: stable 4.7.2 now covers the CoreWing. The 2027-02-22 go/no-go can close early.

## 11. SITL validation summary (2026-10-21)

ArduPlane **V4.7.2** SITL (the Windows build Mission Planner uses, from firmware.ardupilot.org/Tools/MissionPlanner/sitl/PlaneStable),
model `quadplane`, `vtol_c0.param` + `sitl/sitl_overrides.param`. 133 parameters read back. All match. Only the
3 BLHeli passthrough parameters (`SERVO_BLH_*`) are absent, because SITL has no BLHeli support. **7/7 scenarios passed.**
Results and limits are in `sitl/README.md`. The SITL airframe is ArduPilot's generic QuadPlane model, not C0.
Its learned hover throttle was 0.15, against about 0.52 (est.) for C0. So SITL validates modes, thresholds,
failsafes and the fence. It does not validate gains or performance.

**Update 2026-10-25 — C0 airframe model.** The same seven scenarios were re-run on `sitl/c0_physics.py`, a 6-DOF
model of C0 itself (SITL `--model JSON`; mass, geometry, AVL derivatives, CL_max, drag polar, motor thrust/power
table, APC 14x8.5 prop data and the output map all read from the repo files). **7/7 passed with `vtol_c0.param`
unchanged**; no `vtol_c0_sitl_tuned.param` was needed. Trims match the analysis: hover 0.523 thrust fraction at
22.2 V (TEST-PLAN 0.52), cruise α 2.84° / elevator −3.45° / 7.69 N (AVL 2.86° / −3.45° / 7.70 N), stall 11.75 m/s
(target 11.75). SITL learned `Q_M_THST_HOVER` 0.44 on a full pack (the model predicts 0.45 at 25.2 V, because
ArduPilot references thrust to `Q_M_BAT_VOLT_MAX`; 0.52 is the 22.2 V figure). Forward transition 13–15 s and
140–170 m with ≤ 2 m altitude loss, peak 71–75 A; back-transition ≤ 2 m loss with a −17°/+33° pitch swing during
ArduPilot's airbrake stop (the C0 wing stalls at the 30° VTOL pitch limit). Model limitations (no prop wash, no
rotor inflow, estimated inertia, reversed-flow aero) are listed in `sitl/README.md`. Re-run 2026-10-25 on the final data
(results.json MTOW 6.552 kg, chord 0.2842 m; corrected AVL model with rudder derivatives Cnδr +0.000736/deg; CAD rev D):
7/7 again, same transition times (13–14 s), losses ≤ 2 m, peak 69–75 A; the model now takes all control derivatives from
the AVL st file.
