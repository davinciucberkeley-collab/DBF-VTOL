# Electrical architecture (C0 lift + cruise)

Date checked: 2026-10-19. Baseline is docs/purchasing/C0_BOM.csv; the BOM is not edited. Data files: inventory/electrical/components.json (36 parts), wiring.json (30 wires, connectors, nets), proposed_lines.json (new purchases). Placements and wire lengths are EST (route length x 1.10). "—" = not found on any page read.

## 1. Power tree
Ovonic 6S pack (22.2 V nominal, 25.2 V full; analysis/results.json base.Vpack) -> XT90S anti-spark plug (CN01, the R20 physical disconnect) -> FC PDB (CoreWing F405 Wing APP V2, input 10-28 V, 90 A continuous / 215 A peak sensor) -> BUS1 solder splice (star point) -> five 12 AWG ESC branches + one 14 AWG branch to the Remote ID UBEC (5 V 5 A).
- FC 5.2 V peripheral rail (4 A): GPS, receiver, airspeed module.
- FC servo rail, set to 7.2 V (5/6/7.2 V selectable, 8 A continuous / 14 A peak): five servos.
- Remote ID (BeeID, 5 V and GND only) has its own UBEC so a servo brownout cannot drop the FAA broadcast.
- Fit a 470 uF 35 V capacitor at the FC battery pads and at each of the five ESCs (6 parts, proposed_lines.json).
Sources: FC1 entry in inventory/electrical/components.json (source_url_or_file); ArduPilot pages cited in section 3.

## 2. Signal tree
FC -> five DShot lines (4 lift, 1 pusher) -> ESCs; FC -> five servo PWM lines; GPS (UART5 + I2C compass) on a mast at (0.20, 0.088, 0) m; CRSF receiver on UART6; airspeed module on the single I2C port with a pitot pair of silicone tubes (W32/W33); MAVLink on SERIAL1 (wireless board).

## 3. FC output map and UART map
Source: https://ardupilot.org/plane/docs/quadplane-frame-setup.html and https://ardupilot.org/plane/docs/common-rcoutput-mapping.html (2026-10-19).

| Output | Function | SERVOn_FUNCTION | Note |
|---|---|---|---|
| S1 | Lift motor 1 front right, CCW | 33 | DShot |
| S2 | Lift motor 2 rear left, CCW | 34 | DShot |
| S3 | Lift motor 3 front left, CW | 35 | DShot |
| S4 | Lift motor 4 rear right, CW | 36 | DShot |
| S5 | Pusher throttle | 70 | DShot; see risk R-A |
| S8 | Left aileron | 4 | |
| S9 | Right aileron | 4 | reverse as needed |
| S10 | Elevator | 19 | |
| S11 | Rudder left | 21 | |
| S12 | Rudder right | 21 | |
| S6, S7 | spare | — | |

Timer groups are 1-2, 3-4, 5-7, 8-10, 11-12; the lift ESCs (1-4) and pusher (5) are DShot (outputs 1-10 only); servos sit on groups 8-12 so analog PWM rates never share a timer with DShot. Set Q_M_PWM_TYPE 4-7 (DShot150 first). ArduPilot QuadPlane defaults the lift motors to outputs 5-8, so SERVO1-4_FUNCTION = 33-36 is set explicitly and the default motor outputs on SERVO5-8 must be reassigned (SERVO5 = 70 above) rather than left to the default (https://ardupilot.org/plane/docs/quadplane-frame-setup.html, 2026-10-19).

UARTs: SERIAL5 = GPS (UART5); SERIAL6 = RCIN, protocol 23 (CRSF, UART6); SERIAL1 = wireless MAVLink2; SERIAL2/3/4 free. One I2C port (GPS/airspeed connector); MS5525 airspeed at 0x76.

Risks and conflicts (flagged, not resolved):
- R-A. DShot on the function-70 pusher uses SERVO_BLH_MASK; this comes from forum sources and must be bench-verified. Fallback: PWM throttle plus ESC calibration.
- R-B. S12 (PWM12) conflicts with the LED function on this board (the PWM12 = LED pad is from the V1 board page, https://oscarliang.com/speedybee-f405-wing-app/; V2 to confirm); fallback is a Y-lead from S11 for both rudders.
- R-C. FC input range 10-28 V (vendor page) vs 7-36 V (another listing); 6S full is 25.2 V, so both pass. Unresolved which is right.
- R-D. XT90S rating: 50 A continuous / 90 A peak (https://www.makerstore.com.au/product/mb-elc-con-xt90s-mf-as/) vs 90 A continuous (esk8 wiki). Transition is 74.4 A, so the lower figure is exceeded (x1.49).
- R-E. Servo V+ on the S-pad header: the servos are assumed to take V+ from the S-pad header on the 7.2 V servo rail; to confirm on the bench (pages read do not show the header pinout).
- R-F. Servo power passes through up to three JR 3-pin connectors (J1, J2, J3, W28 to W30) at 3.2 A stall per servo (16 A / 5 servos, section 4); JR contacts are small and the rating is not on the pages read (—). Check contact heating at a stall test.

## 4. Power budget
Formulas use analysis/results.json (P_hover_total 831.98 W, P_hover_per_motor 207.99 W, transition 1562.45 W at 21.0 V).

| Branch | Hover | Cruise | Formula |
|---|---|---|---|
| 4 lift ESCs | 37.48 A | 0 (stopped) | 831.98 W / 22.2 V; 9.37 A each = 207.99 / 22.2 |
| Pusher | 0 | 16.45 A | results.json cruise power / 22.2 V |
| Transition peak | 74.4 A | | 1562.45 W / 21.0 V |
| Full throttle, 4 lift, nominal 22.2 V (lower bound) | 110.8 A | | 4 x 27.7 A (docs/research/budget-lift.md line 42, A3, 17x5.8 at 22.2 V) |
| Full throttle, 4 lift, full pack 25 V (worst case) | 133.2 A | | 4 x 33.3 A (docs/research/budget-lift.md line 42, A3: 3600 gf at 33.3 A, 25 V) |
| Pusher at full throttle | — | | not in the sources read; lift plus pusher together is not evaluated and would add to the lift figure |
| Servos | 2.25 A at 6 V running | same | 5 servos; stall 12.5 A at 6 V, 16 A at 7.4 V |
| Peripheral rail | — | — | GPS, receiver current — |
| Remote ID UBEC | — | — | module current not on page read |

Margin: the worst case is 133.2 A (4 x 33.3 A at 25 V), with 110.8 A at nominal as the lower bound. Both exceed the 90 A sensor continuous rating (133.2 / 90 = x1.48), and each motor current (27.7 A nominal, 33.3 A at full pack) exceeds the X4110S limit of 26 A for 30 s (https://www.readymaderc.com/products/details/86945-sunnysky-xs-high-power-x4110s-brushless-motor-400kv, as cited in docs/research/nautical-wings-props.md section 3). Recommended: set the QuadPlane motor output maximum so each lift motor stays at or below 26 A on the thrust stand; the parameter is to be confirmed against the ArduPilot QuadPlane docs (not named here). Servo stall (12.5 to 16 A) exceeds the BEC's 8 A continuous / 14 A peak at 7.2 V; running 2.25 A is safe. The stall test is M3 of budget-avionics.md.

## 5. Wire gauge
Ampacity source: Engineering Toolbox AWG table (https://www.engineeringtoolbox.com/wire-gauges-d_419.html, 2026-10-19): 10 AWG 52 A, 12 AWG 34 A, 14 AWG 24 A. Trunk 10 AWG (W02, W03; 0.29 m of conductor) sees 74.4 A at transition and up to 133.2 A at full lift throttle: it exceeds the table value. Decision: keep 10 AWG because the run is 0.14 m and the high current is intermittent, and cap lift throttle (section 4); if the cap is not enforced, move the trunk to 8 AWG (8 AWG ampacity not looked up, —). ESC branches 12 AWG (10.56 m of conductor): 27.7 A is within 34 A, 33.3 A is at 98 % of it. 14 AWG (0.13 m) feeds only the Remote ID UBEC (0.5 A); a 14 AWG branch must not carry a motor current (27.7 A exceeds 24 A), so use 12 AWG for any motor branch. Total harness 21.75 m EST; total wire mass about 390 g EST for the 12 AWG branches (copper x 1.25 insulation factor, EST). Dropping the four lift-ESC feeds from 12 to 14 AWG would save about 126 g EST but exceeds the 24 A table value; kept at 12 AWG. Motor lead gauge and bullet size: —. Servo lead gauge: —.

## 6. Connectors
XT90S at the battery (CN01); XT60H at J1 and J2 on each lift-ESC power feed (two pairs per side; 60 A rated per esk8 wiki, https://forum.esk8.news/t/wiki-connectors-and-plug-types/2021, 2026-10-19; a forum claim of 30 A continuous is unverified, hover branch is 9.9 A); JR 3-pin on all servo and DShot signals at J1, J2, J3; JST-GH 4-pin I2C (airspeed). GPS and receiver pinouts: —.

## 7. Arming, kill (R20) and failsafe
- Physical: pulling the XT90S removes all propulsion power (R20).
- Software: arm switch via RC aux option 153; emergency stop via aux 31 (motor kill; 165 is the second emergency-stop option); Q_Assist switch via aux 82.
- Failsafe: CRSF link loss triggers the ArduPilot RC failsafe (action settings to be chosen at commissioning, —); the Remote ID is on its own UBEC and keeps broadcasting if the servo rail browns out.

## 8. Harness segmentation (R4)
Six joint boxes: J1 wing root at (-0.12, 0, +/-0.09), J2 rear boom clamp at (-0.19094, -0.03, +/-0.4337), J3 rear motor mount splice at (-0.505, -0.03, +/-0.4337). Each joint carries a JR/XT60H pair so wing, boom and pod separate without cutting wire. Ailerons and the airspeed lead break at J1; the elevator and rudder leads break at J1, J2, J3 (W28 to W30); lift ESC power and DShot lines break at J1 and J2. Elevator and rudder servos sit in printed saddles on the boom stubs because the stabiliser is 6.8 mm and the fin 13.4 mm thick at the root.

## 9. Grounding and noise
Single star ground at BUS1; the Remote ID UBEC ground returns to the same star. GPS on a 0.088 m mast. Twisted power pairs for each ESC feed. The power trunk passes 0.100 m (W02) and 0.106 m (W03) from the GPS placement (closest approach computed from the wiring.json routes; 0.148 m is only the ESC-branch distance). EST single-wire field at 74.4 A: B = mu0 I / 2 pi r = 2e-7 x 74.4 / 0.1005 = 148 uT, above a typical Earth field of about 50 uT (general figure, source not looked up). Recommended: raise the GPS on a mast so it is at least 0.15 m from the trunk, and twist the battery + and - pair (W01 to W03). Compass chip type: —; compass-motor interference calibration at commissioning.

## 10. Electrical test plan
1. Continuity and short check on every wire (wiring.json) before any pack is connected.
2. Polarity check at XT90S, XT60H joints and ESC pads.
3. Smoke stopper (bulb in series) on first power-up of the pack side.
4. ESC and motor direction check, props off: motors 1/2 CCW, 3/4 CW per the quad-X order above.
5. Current-sensor calibration: BATT_MONITOR 4, BATT_VOLT_MULT 11.05, BATT_AMP_PERVLT 64 (vendor defaults); trim against a clamp meter at a known load.
6. DShot bench check (R-A): confirm the function-70 output on the pusher.
7. Servo-rail stall current, budget-avionics.md M3: stall each servo with a clamp meter at 7.2 V; pass if total stays under 14 A peak.
8. Throttle-cap test: on the thrust stand, lift full-throttle current per motor against the 26 A / 30 s motor limit and the total against the 90 A sensor limit (worst case 133.2 A uncapped).

## 11. Landing gear
Proposal: Du-Bro Super Lite 3.00 in wheels (SKU 300SL, 16.8 g per wheel, https://www.gator-rc.com/products/dubro-super-lite-wheels) on the four existing 0.205 m legs, 5/32 in axles (DUB248) and collars (DUB140). Stock: Gator RC page read 2026-10-19 shows $6.75 per pair and "Only 1 left"; two pairs are needed (four wheels), so one pair must come from another vendor (—). Alternatives: DUB300T treaded (58 g per wheel, $7.10), DUB350T (99 g per wheel, $8.00).

Geometry (SolidWorks frame, X forward, Y up, Z right; calc scripts in scratchpad gear.py). The axle offset e = 10 mm below the tube end is EST (axle block design: —); the 0.048 m drop (wheel radius 0.0381 m + e) and every clearance and angle derived from it are EST:

| Quantity | Before | With wheels |
|---|---|---|
| Ground y | -0.2437 m | -0.2918 m (+0.048 m) |
| Pusher disc clearance | 36 mm | 84 mm |
| Lift prop clearance | 0.273 m | 0.321 m |
| CG height | 0.218 m | 0.266 m |
| Tip-back angle | 57.9 deg | 52.6 deg |
| Pusher strike pitch | 56.9 deg | 74.4 deg |

Roll over angle 58.5 deg. The governing nose-up pitch limits are the boom end (23 deg) and the stabiliser (34 deg), not the pusher disc. Leg length does not change (tube slack 18.4 mm, 10.4 mm after five kerfs). Added mass about 124 g EST. A VTOL lands vertically by default; a rolling landing is a fallback only. Fallback rollout at 12 m/s (EST, friction values assumed): 103 m at mu 0.05, 187 m at mu 0.02, 14 m with braking at mu 0.5; brakes are not evaluated and this is not a finding that none are needed. Cost: see proposed_lines.json ($6.75 per pair, stock note above).

## 12. Unknowns ("—")
ESC dimensions, mass, leads and BEC (Amazon page blocked); motor lead gauge and bullet size; GPS compass chip and connector pinouts; receiver current; pack balance lead and dimensions; axle thread size; firmware target beta status not rechecked; servo extension price; shipping for new lines.
