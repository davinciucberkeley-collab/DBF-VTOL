# Peripheral configuration — ESCs, RC link, telemetry, GPS/compass, airspeed, Remote ID

These are the C0 components that have their own firmware or settings. Sources are in
[docs/research/firmware.md](../docs/research/firmware.md) (checked 2026-10-21). (est.) = engineering estimate. — = unknown.

## 1. ESCs — 5 × SoloGood 45A BLHeli_S (4 lift + 1 pusher) [BOM]

| Item | Value | Source |
|---|---|---|
| Firmware family | BLHeli_S. Factory version not stated (BLHeli_S 16.7 is the usual factory load, per ArduPilot) | Amazon listing title; common-blheli32-passthru.html |
| Protocols | DShot150/300/600 | Amazon listing title |
| ESC MCU (EFM8BB21/BB51…) | — (ESC Configurator shows it when it reads the ESC) | — |
| FC protocol | **DShot150** (`Q_M_PWM_TYPE,4`, `SERVO_BLH_OTYPE,4`) | vtol_c0.param; common-dshot-escs.html |
| Calibration | none. DShot ignores SERVOx_MIN/MAX and needs no ESC calibration | common-dshot-escs.html |

### 1.1 Configure through the flight controller (passthrough)
1. Props off. Battery on (the ESCs need power). USB to the laptop. Close Mission Planner's connection.
2. `SERVO_BLH_AUTO,1` (lift motors) and `SERVO_BLH_MASK,256` (pusher, S9) are already in `vtol_c0.param` (common-blheli32-passthru.html).
3. Open https://esc-configurator.com/ in Chrome or Edge, select the FC's COM port, "Connect", "Read settings".
   ArduPilot 4.5+ is required for this tool. The ArduPilot page warns that the connection "is variable" because
   the tool runs from the internet. If it fails, use BLHeliSuite (BLHeli_S) on Windows, also via passthrough.
4. If the `SERVO_BLH_*` parameters are missing after a reboot, passthrough is not compiled in: —. SITL lacked them,
   but SITL has no BLHeli at all. Fallback: a USB-to-ESC programming linker on each ESC signal lead.

### 1.2 Settings (all 5 ESCs unless stated)

| Setting | Value | Why |
|---|---|---|
| Motor direction | Set per the motor test (README §7): M1 front-right CCW, M2 rear-left CCW, M3 front-left CW, M4 rear-right CW; pusher so air blows aft | quadplane-frame-setup.html. Swapping two phase wires does the same thing (connect-escs-and-motors.html) |
| Bidirectional / 3D | **off** | the lift motors are not reversible; `SERVO_BLH_3DMASK` stays 0 |
| Motor timing, startup power, demag compensation | leave at BLHeli_S defaults for the first runs. If a 17-inch prop stutters or desyncs on fast throttle steps in the thrust-stand test (T2), raise demag compensation one step (est.) | no source gives values for X4110S + 17×5.5; tune from measured behaviour |
| Beacon / beep strength | defaults | — |
| Throttle range (PWM) | not used under DShot | common-dshot-escs.html |

Write the settings, then read them back and confirm all 5 ESCs match except direction.

### 1.3 Bluejay — optional, not baseline
- Bluejay (open source, for BLHeli_S hardware) supports EFM8 **BB21 and BB51** MCUs, **DShot 300/600 only**,
  bidirectional DShot with RPM telemetry, and PWM frequency 24/48/96 kHz (github.com/bird-sanctuary/bluejay).
- On this board it brings little benefit: bidirectional DShot (RPM telemetry for an RPM notch) works only on
  outputs S1–S4 (hwdef `BIDIR` / README), and the lift motors are on S5–S8.
- If the team flashes Bluejay anyway: change `Q_M_PWM_TYPE` and `SERVO_BLH_OTYPE` to **5 (DShot300)**, because
  Bluejay has no DShot150, and set `SERVO_DSHOT_ESC,2` (already set). Flash with ESC Configurator. First confirm
  the MCU type it reports.

## 2. RC link — RadioMaster Pocket Crush (ELRS) + RP3 V2 receiver [BOM]

| Item | Value | Source |
|---|---|---|
| RX MCU / RF | ESP8285 / SX1281 (the page also names SX1280) | radiomasterrc.com RP3 page |
| RX factory firmware | ExpressLRS v3.0, target "RadioMaster RP3 Diversity 2400 RX" | same |
| RX output | CRSF | same |
| FC port | UART6 (TX6/RX6), `SERIAL6_PROTOCOL,23` (board default) | hwdef; board page |
| RC_OPTIONS | 8736 = bit 5 (default) + bit 9 (suppress CRSF mode/rate message for ELRS) + bit 13 (420 kbaud for ELRS) | apm.pdef.xml; board page "Set bit 13 of RC_OPTIONS if required" |
| RSSI | `RSSI_TYPE,3` (from the receiver protocol) | apm.pdef.xml |

### 2.1 Firmware and binding
1. Update the Pocket Crush internal ELRS module and the RP3 V2 to the **same** ELRS major version with ExpressLRS
   Configurator (github.com/ExpressLRS/ExpressLRS-Configurator/releases). The RP3 V2 updates over its own WiFi
   (RadioMaster page). Use ≥ 3.5.0 on both if MAVLink mode (§2.4) may be tried later (expresslrs.org/software/mavlink).
2. Set the same **binding phrase** on both. The RP3 V2 "uses a bind phrase, so no bind plug or button press is
   needed" (RadioMaster page; procedure at https://www.expresslrs.org/quick-start/binding/).
3. Receiver failsafe: **No Pulses** (ArduPilot recommends it, apms-failsafe-function.html).
4. Packet rate for flight: a long-range rate such as 333 Hz Full (expresslrs.org/software/mavlink recommends
   it "for flying"). Telemetry ratio: default.

### 2.2 EdgeTX model on the Pocket Crush (channel map = `vtol_c0.param`)

| CH | Function | Switch / control | ArduPilot |
|---|---|---|---|
| 1 | Roll (aileron) | right stick X | RCMAP_ROLL 1 |
| 2 | Pitch (elevator) | right stick Y | RCMAP_PITCH 2 |
| 3 | Throttle | left stick Y | RCMAP_THROTTLE 3 |
| 4 | Yaw (rudder) | left stick X | RCMAP_YAW 4 |
| 5 | **Arm/Disarm** | 2-position switch (ELRS AUX1 is the arm channel) | `RC5_OPTION,153` |
| 6 | Flight mode, 6 positions | 3-pos switch + 2-pos switch mixed to 6 PWM bands: 1165, 1295, 1425, 1555, 1685, 1815 µs (FLTMODE band centres) | `FLTMODE_CH,6`; modes QSTABILIZE, QHOVER, QLOITER, FBWA, CRUISE, QLAND |
| 7 | Motor emergency stop | 2-position, guarded switch | `RC7_OPTION,31` |
| 8 | QAssist force off / auto / on | 3-position | `RC8_OPTION,82` |
| 9 | RTL | 2-position (momentary not needed) | `RC9_OPTION,4` |

Bands from apm.pdef.xml FLTMODE1–6: 910–1230, 1231–1360, 1361–1490, 1491–1620, 1621–1749, 1750–2049 µs.
The target PWM values above sit near the band centres. Check every position on the Mission Planner HUD during
radio calibration (README §6.4).

### 2.3 Zero-cost telemetry options (no telemetry radio in the BOM)

The BOM has no SiK radio. One at $58.99 (avionics-autopilot.md §3.5), $65.04 with tax, is more than the
$60.04 crash reserve left in the BOM (C0_BOM.csv, as updated 2026-10-21). The RC link is ExpressLRS (Pocket Crush ELRS + RP3 V2), so three links cost $0:

| Option | Where telemetry shows | FC settings | Use it for | Limits |
|---|---|---|---|---|
| **A. CRSF telemetry (baseline, hover phases)** | Pocket Crush screen (EdgeTX telemetry page) | `SERIAL6_PROTOCOL,23`; `RC_OPTIONS` 8736. For the Yaapu script add bit 8 (passthrough): `RC_OPTIONS,8992` (common-crsf-telemetry.html: "by setting RC_OPTIONS bit 8, additional ArduPilot telemetry items are transferred which allows use of the Yaapu … Script") | battery, mode, GPS, alerts at the pilot's hand | no laptop GCS; no parameter or mission upload in flight. With bit 8, no SERIAL port may use protocol 10 (same page) |
| **B. ELRS MAVLink mode (GCS link, transition flights)** | Mission Planner on a laptop/phone by WiFi from the Pocket Crush's built-in backpack (UDP 14550; backpack AP 10.0.0.1, password "expresslrs"), or USB at 460800 to the TX module | `SERIAL6_PROTOCOL,2`, `SERIAL6_BAUD,460`, `RSSI_TYPE,5`, all `MAV6_*` stream rates 1 except ADSB, PARAMS and RAW_CTRL at 0 (expresslrs.org/software/mavlink). ArduPilot's CRSF/ELRS page gives `SERIALx_BAUD = 115` for the same mode (common-tbs-rc.html). Use the ELRS value, 460 | full MAVLink: map, parameters, mission upload, log of flight data | ELRS ≥ 3.5.0 on TX and RX. Both must be ESP-based: the RP3 V2 is ESP8285; the Pocket Crush states a built-in backpack. Forces telemetry ratio 1:2 and Hybrid or 16ch/2 switch mode. Downlink about 2375 B/s at F1000 (ELRS page). Yaapu does not work with ELRS MAVLink in v3.x, only v4.x (ELRS page) |
| **C. CoreWing WiFi module** | Mission Planner over WiFi: TCP 4278 / UDP 14550, AP 192.168.1.1 (board page) | `SERIAL1_PROTOCOL,2` (default) | bench, pits, pre-flight parameter checks | range: — (treat as ground-only). **Change the default password `88888888`** in the CoreWing app |

### 2.4 ELRS MAVLink mode — how RC and failsafe work, and how to switch

- In MAVLink mode the RP3 V2 sends the sticks to the FC as **`RC_CHANNELS_OVERRIDE`** messages, sysid 255 by default
  (ExpressLRS source `src/src/rx-serial/SerialMavlink.cpp`, master, checked 2026-10-21). It sends nothing when no RC
  frame arrives, i.e. on link loss. ArduPilot accepts overrides only from `MAV_GCS_SYSID` (default 255; apm.pdef.xml),
  so the defaults match. The build excludes the newer `RADIO_RC_CHANNELS` input (`!AP_RCPROTOCOL_MAVLINK_RADIO_ENABLED`),
  which ELRS does not use.
- **SITL check (scenario G, 2026-10-21):** receiver RC removed, RC sent only as overrides, overrides stopped in a 15 m
  hover → "RC Short Failsafe: switched to QLand" 1–2 s later (`RC_FS_TIMEOUT` 1 s), then a normal QLAND.
  Failsafe behaviour in Q modes and fixed-wing modes is the same as with CRSF.
- Hardware check before relying on it: bench, props off, ELRS in MAVLink mode. Switch the TX off → "RC Short Failsafe"
  within about 1 s. Then fly one hover session in MAVLink mode before the first transition in it.
- Keep Mission Planner's joystick **off** while in MAVLink mode, so the GCS does not send its own overrides as sysid 255.
- Switching modes: TX module "Link Mode" Normal → MAVLink (ELRS Lua). On ELRS v3 RX, set the RX serial protocol to
  MAVLink in the Lua "Other Devices" menu; on v4 it follows the TX (ELRS page). Then load on the FC:
  `SERIAL6_PROTOCOL,2`, `SERIAL6_BAUD,460`, `RSSI_TYPE,5`, reboot. To go back: Link Mode Normal, `SERIAL6_PROTOCOL,23`,
  `RSSI_TYPE,3`, reboot. These three lines are the only difference. `vtol_c0.param` ships in CRSF mode.

## 3. GPS / compass — HGLRC M100-5883 [BOM]

| Item | Value | Source |
|---|---|---|
| GNSS | u-blox M10, UBX, 10 Hz, 115200 default | racedayquads.com product page |
| Compass chip | not stated ("5883" in the name). QMC5883L and QMC5883P drivers are both in the build | RDQ page; features.txt |
| Port | GPS connector: UART5 = GPS1, I²C for the compass, 4V5 power | hwdef README |
| ArduPilot setup | `SERIAL5_PROTOCOL,5`; GPS type auto (default); `GPS_AUTO_CONFIG` default configures the u-blox | vtol_c0.param |
| Orientation | Mount on a mast ≥ 10 cm (est.) above the ESC/battery wiring, arrow forward. `COMPASS_AUTO_ROT,2` detects the rotation during compass calibration | hwdef default |
| Check | Mission Planner > Setup > Compass: one external compass detected and "Use" ticked; heading tracks a phone compass | README §6.3 |

## 4. Airspeed — Holybro MS5525DSO + PT40 [BOM]
- I²C address must be 0x77 (CSB strapped low). The board baro uses 0x76 on the same bus. `ARSPD_TYPE,5`,
  `ARSPD_BUS,0`. Full procedure and fallback (MS4525DO, `ARSPD_TYPE,1`) are in README §4.3.
- Pitot at the wing tip per the review (§12 wiring table), outside the prop wash. Tubes: `ARSPD_TUBE_ORDR,2` auto-detects.

## 5. Remote ID — NewBeeDrone BeeID v1.1 [BOM]
- Standalone broadcast module with its own GNSS. FAA DoC RID000001995 (budget-avionics.md §4).
- Power from an FC 5 V pad. No FC configuration (`!AP_OPENDRONEID_ENABLED` in the build, features.txt).
- Before the first outdoor flight, check the unit's serial on uasdoc.faa.gov. Confirm the broadcast with a phone
  RID app (budget-avionics.md M6).

## 6. CoreWing wireless module
- CoreWing app (https://www.corewing.com/en/app/) can set parameters and flash firmware wirelessly (board page).
  Use Mission Planner + this package as the source of truth. Do not keep two parameter sets.
- Security: change the WiFi AP password from `88888888` (board page default).
