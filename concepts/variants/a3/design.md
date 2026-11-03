# a3 — Aligned, faired stopped rotors (variant of C0)

Date: 2026-11-02. Status: concept, nothing printed or bench-tested. Every drag number below is EST until the car-top test (T-A3-8). Files: `geometry.json`, `inventory.json`, `metrics.json`, `a3_park.lua` (DRAFT), `analysis/` (scripts and results).

## 1. Summary

**Change vs C0.** Same airframe, same 4 x SunnySky X4110S 400 KV lift motors on 6S, same SoloGood 45 A BLHeli_S ESCs, same CoreWing F405. Added per rotor: a printed NACA 0022 nacelle around the motor mount and bell, a rotating printed cap over bell, adapter and hub, a passive magnetic detent that parks the two-blade prop fore-aft, and (phase 2) a reed switch so the flight controller can confirm the park and nudge.

**Result (EST).** Cruise power 365 W -> 280 W (range 265-303 W), cruise endurance 11.9 -> 15.0 min (13.9-15.9), hover 832 -> 890 W, mass 6.182 -> 6.432 kg, committed cost $1,897.92 -> $1,943.92, reserve $102.08 -> $56.08 (before extra shipping, section 8). Source: `analysis/final_runs.json`, produced by `analysis/a3_effect.py` using the C0 sizing model (`analysis/model.js`).

**Verdict.** Build the fairing and the detent in phase 1 (about $22 of goods). Build the reed ladder and Lua nudge in phase 2 only after the scripting go/no-go check (section 6). Do not buy position-stop ESCs.

## 2. Why: the drag case

C0 has four stopped lift rotors in cruise. The repo's own estimate is CdA about 0.0034 m2 per rotor, which is 35.8 % of C0 cruise drag (`analysis/final_runs.json`, `C0_rotor_share_of_cruise_drag`; the 0.0034 is a C0 estimate in `analysis/aero.json`, not measured).

Formulas (all shown):
- q = 0.5 rho V^2 = 245 Pa at the cruise point used by C0 (`final_runs.json` q_Pa).
- dD = q dCdA. Cruise power P = D V / (eta_p eta_me), eta values as in `analysis/model.js`.
- Endurance t = (E_pack x 0.8 x 0.95 - P_hover x 160 s) / P_cruise, E_pack = 144.3 Wh.

Per-rotor CdA cases (EST):

| Case | CdA (m2) | Basis |
|---|---|---|
| Random parked, unfaired (C0) | 0.0034 | C0 aero.json (EST) |
| Aligned, unfaired | 0.00286 | 16 % cut, see below |
| Random, faired | 0.00155 | fairing only |
| a3: aligned and faired | 0.0011 (0.0007-0.0017) | EST |
| Windmilling, brake off | 0.0146 | disc CD 0.10 EST |

Literature, put in context:
- Marepally and Baeder (VFS 2025) report that a locked, aligned rotor has the least drag and that a hub fairing reduces it further. This is the claim the concept rests on. It is full-scale CFD.
- Westcott 2023: the best lock angle can be near 150 deg at positive alpha, and a perpendicular blade is up to 30 % worse. So "fore-aft" is a good default, not a proven optimum.
- Bacchini 2021: stopped rotors are about 38 % of parasitic drag, consistent with our 35.8 %.
- Zhang and Barakos 2024: windmilling is about 1.9 x a locked rotor.
- Reynolds caveat: our blade chord is about 25 mm, Re about 3e4, against 1e6-1e7 in the CFD. At low Re the drag is dominated by pressure drag of the bluff hub and motor stack, which a fairing attacks, and less by blade profile drag, which alignment attacks. Hence we weight the fairing most and alignment second. Alignment alone gives 344.7 W and 12.6 min; the fairing is the larger part of the gain.

Break-even: the fairing plus cap pays back its own weight as long as CdA per rotor is below 0.00298 m2 (`final_runs.json`). Mass-only case (no drag gain at all, CdA 0.0034): 368.6 W, 11.4 min, so the downside is small (-0.5 min).

## 3. Chosen parking method

Compared options (live-priced where noted, 2026-11-02):

| Option | Verdict | Reason |
|---|---|---|
| Position-stop ESC (T-Motor V60A+VL, Hobbywing IPC, VESC, Zubax) | Rejected | Cost, 12S or availability; 4 ESCs would not fit the $56 reserve |
| AM32 or BLHeli_S firmware | Cannot | No stop-at-position function (checked 2026-11-02) |
| Servo pawl / indexing pin | Fallback | Reliable but adds 4 servos, moving parts, release failure mode |
| Magnetic detent on the bell plus "Brake on stop" | **Chosen** | $0.60 magnets, no moving parts, no release step |
| Hall sensor and slow-spin routine | Rejected | Needs sensing and ESC speed control BLHeli_S does not provide |

ArduPilot has no native rotor-alignment feature (checked 2026-11-02), so the sequence is done by a Lua script or not at all.

**Detent.** Two K&J D42SH magnets (6.35 x 3.17 mm, N42SH, 150 C, $0.60 each; kjmagnetics.com 2026-11-02) ride in the cap ears at r = 31 mm, 180 deg apart, same pole down. A fixed magnet in the nacelle lid at r = 31 mm attracts them to azimuth 0 (blades fore-aft). Five lid pockets at -30...+30 deg allow tuning the park angle. Holding torque is about 22 mN.m (EST, from magnet pull and arm; to be measured).

**Brake.** BLHeli_S "Brake on stop" shorts the motor on stop. Motor constant c = Kt^2 / R = 4.8e-3 N.m.s/rad, rotor inertia time constant tau about 0.11 s (EST, `analysis/mc.py`). Brake peak current about 62 A at 3000 rpm (EST) exceeds the 45 A ESC rating only briefly; keep spin-down below 3000 rpm at the stop command.

**Capture statistics** (Monte Carlo, `analysis/mc_result.json`): a passive detent alone captures a decaying rotor in the aligned well on 36 % / 39 % / 56 % of stops for 10 / 20 / 40 mN.m detents. Passive detent alone is therefore only a bias. A sensed nudge loop (reed reads parked or not; Lua pulses the motor at low throttle for 150 ms) reaches about 100 % within 2-3 tries (p90 = 2 tries). Without the Lua loop, EXPECT about half of the alignment benefit; the fairing benefit is unaffected.

**Important C0 risk found.** Without "Brake on stop" a C0 rotor windmills in cruise: 797 W and 5.5 min (EST, disc CD 0.10). Brake-on-stop must be set in C0 whether or not a3 is built.

## 4. Fairings

Nacelle: NACA 0022 plan section, chord 260 mm, x/c 0.06-0.75 (truncated), 62.5 mm tall (y -0.0455 to +0.0170), 0.8 mm walls, 1.2 mm lid with a 51 mm hole (bell OD 47.5), open bottom, two clamshell halves split at z = z_m, 4 M3x10 screws into 4 inserts in the Motor_Mount sides, 2 seam screws. 37.5 g each. Fit conflicts found and resolved in the model: mount corners need t/c 0.22; the front gear clamp (x 0.2639-0.2979) needs the tail cut at x/c 0.75 (6 mm clearance); rear nose is 6.6 mm from the rear clamp. Full table: `geometry.json`.

Cap: spinner-style revolve, skirt r = 26.5 mm, shoulder to r = 14 mm, top at y = 0.0428, blade slots 24 mm wide, 4 cooling inlet slots, 2 magnet ears, 9.4 g. Skirt clears the bell by 1.55 mm radially and sits 1.5 mm above the lid. Held by 4 M3x16 on the supplied hub pattern (est Ø16, to be confirmed on the real adapter).

Cooling: air enters through the cap slots (hover downwash and prop swirl) and exits through a 40 x 30 mm bottom opening in the nacelle. In cruise the airflow is aft and the rotor is stopped; the motor is unpowered, so cooling matters only in hover and the first seconds after transition. Concern: PETG HDT 68 C against a bell estimated at 73 C (lumped) to 134 C (upper bound). Mitigation: keep a 3 mm air gap, test T-A3-5, switch to PA6-CF if the IR reading exceeds 60 C at the nacelle wall.

## 5. Mass, CG, stability, flight effects

- Added per rotor 56.9 g: nacelle 37.5, cap 9.4, 3 magnets 2.25, glue 1, 6 M3x10 2.7, net 4 M3x16 3.2, 6 inserts 0.9. Four rotors 0.228 kg phase 1, 0.250 kg with phase-2 wiring (about 22 g EST). Wing not resized.
- CG: front pair at x = +0.37092, rear at -0.50458 with equal masses; shift -3.4e-5 mm, i.e. none. CG x stays -0.0668 m.
- Static margin 19.6 % unchanged (aero.json). Nacelle side area is symmetric about the CG, so the net weathercock effect is about zero (not modelled).
- Hover power: m^1.5 scaling gives 883 W, plus 0.75 % nacelle download in the downwash (EST 0.5-1.5 %): 889.5 W (+6.9 %). Thrust-to-weight 2.025 -> 1.947, still above the 1.8 gate used in C0 (check in `analysis/model.js`).
- Stall speed rises 12.0 -> 12.24 m/s because of mass. Q_ASSIST_SPEED must stay at or above 14 m/s (MIN_AS in the script).
- Transition: the rotors are spun up from the parked state; magnets add negligible drag torque. Motor start from a held detent needs the usual spin-min; set Q_M_SPIN_MIN to C0 value.

**Unparked rotor.** One blade crosswise adds dD = 0.22 N, yaw 0.096 N.m and a roll coupling 0.172 N.m (`final_runs.json`, EST). Cruise power with one rotor crosswise: 288.8 W, 14.6 min. That is within the roll and yaw authority of the control surfaces at 15+ m/s and not a safety issue; it is a performance loss only.

## 6. ArduPilot and wiring

Parameters (names from ArduPilot Plane QuadPlane docs, to be verified against the installed firmware): Q_ENABLE=1, Q_FRAME_CLASS=1, Q_FRAME_TYPE=1, Q_M_PWM_TYPE=4 (DShot), Q_M_SPIN_MIN and Q_M_SPIN_ARM as C0, Q_ASSIST_SPEED >= 14, SERVO_BLH_AUTO=1 and SERVO_BLH_MASK for the 4 lift outputs, SCR_ENABLE=1 for the script, A3P_* parameters (table key 73: ENABLE, ADC_PIN, NUDGE_PWM 1100, NUDGE_MS 150, MAX_TRY 3, MIN_AS 14) declared in `a3_park.lua`. In BLHeli_S set "Brake on stop" ON through pass-through.

**Script `a3_park.lua` is a DRAFT, not bench-tested.** It decodes the four reeds on one ADC pin through a resistor ladder (Rtop 10k, 2.2k/4.7k/10k/22k each in parallel with its reed, VREF 3.3 V; V below 0.15 means all parked; a single unparked rotor is matched within 0.18 V), runs only in cruise (not a Q mode 17-23, interlock off, airspeed above MIN_AS), and nudges a given motor via `SRV_Channels:set_output_pwm_chan_timeout` in a WAIT -> CHECK -> PARKED / GAVEUP state machine.

**Go/no-go checks before phase 2** (all unverified, listed as unknowns): (1) Lua scripting is present in the CoreWing F405 firmware build (the STM32F405RGT6 board is flash-limited); (2) a spare ADC pin and 3.3 V pad exist on the board; (3) a DShot output can be overridden from Lua; (4) the BLHeli_S creeps at the nudge throttle without a desync. If any fails, stay in phase 1: the detent and fairing still give most of the gain.

Wiring changes (W-A3-01..04): one 2-conductor pair per reed from the nacelle lid to a ladder strip beside FC1, 26 AWG silicone wire about 10 m total, routed in the boom beside the motor leads. No ESC replacement. No new power loads.

## 7. Failure modes

| Failure | Effect | Mitigation |
|---|---|---|
| Prop parks crosswise | +0.22 N drag, yaw 0.096 N.m; 288.8 W (14.6 min) | Nudge loop; accept if it gives up (GAVEUP) |
| Magnet detent too strong to spin up | Motor stall or ESC desync at transition | Keep detent at or below 22 mN.m; bench test T-A3-2; spin-min margin |
| Magnet debonds in flight | Out-of-balance cap, vibration | Pocket plus epoxy plus 0.5 mm recess; balance after assembly |
| Cap loosens | Blade strike on skirt | M3x16 with thread-lock; pre-flight check |
| Nacelle heat softens PETG | Distortion near bell | 3 mm gap; test T-A3-5; PA6-CF alternate |
| Brake peak current | ESC stress | Stop below 3000 rpm; measure on bench |
| Reed or ladder fault | False unparked reading, endless nudge | MAX_TRY 3, then GAVEUP |
| Latch-style release failure | Not applicable (no latch) | Servo pawl rejected for this reason |

## 8. Cost and mass tables

Goods +$41.72 (phase 1 +$21.77, phase 2 +$19.95): 14 magnets $8.40 (K&J), M3x16 pack $3.69 (Zoro), M3x10 pack $3.69 (EST), inserts $5.99 (budget-airframe.md, 2026-10-13), 5 reeds $11.25 (SparkFun), wire $5.70 (Mouser), resistors $3.00 (EST). Tax at 10.25 % and C0's $100 shipping allowance give $1,943.92, reserve $56.08. Phase 1 only: $1,921.93, reserve $78.07. Not included (—): extra shipping from five new vendors, EST $25-40; the mast and fasteners for the car-top rig. With that shipping the reserve is about $16-31. This is thin; phase 2 should be dropped first if the budget tightens. Hardware: 84 pieces added, 16 removed; 12 printed parts. Details: `inventory.json`.

## 9. Test plan with thresholds

| ID | Test | Pass |
|---|---|---|
| T-A3-1 | Print one nacelle and one cap; fit check on the real motor and mount | Clearances >= 1.5 mm; confirm Ø16 pattern and bell gap |
| T-A3-2 | Bench parking repeatability: spin to 1500 rpm, stop with brake, 100 stops | Capture rate recorded (model predicts 36-56 %); detent torque measured, 10-40 mN.m |
| T-A3-3 | Balance prop plus cap on nail balancer | Residual under 0.1 g.cm (EST threshold) |
| T-A3-4 | Brake current and spin-down on the bench | Peak at or below 45 A; stop in under 0.5 s |
| T-A3-5 | Hover-equivalent heating: 5 min static at hover thrust with nacelle on | Nacelle wall under 60 C, bell under 100 C |
| T-A3-6 | Reed ladder read-out: all 16 park states | Each state decoded within 0.18 V |
| T-A3-7 | Lua nudge on the bench (props off first) | Parked in 3 tries or fewer, p90 |
| T-A3-8 | Car-top single-rotor drag rig on the P-21 load cell, 15 m/s car speed: bare, faired random, faired aligned, crosswise | Drag per rotor measured; faired aligned under 0.0017 m2 CdA, else drop to mass-only case |
| T-A3-9 | Flight: cruise power logged vs C0 | Cruise power at or below 330 W |

## 10. Risks and open unknowns

Risk: medium. TRL: fairing 3-4, detent plus brake 2-3, reed and Lua loop 2 (`metrics.json`).

Open unknowns (—): Lua in the F405 build; spare ADC pin and 3.3 V pad; DShot override from Lua; real motor and adapter geometry (bolt pattern, bell gap); detent torque and capture rate; ESC minimum creep speed and brake current; cooling under the cap; all drag numbers until T-A3-8; extra shipping.

## 11. Recommendation

Build phase 1 now: print and test one nacelle and cap (T-A3-1 to T-A3-5) before committing prints for all four. Run T-A3-8 before flight: if the measured CdA is not below 0.00298 m2, leave the rotors bare and keep the $22. Decide phase 2 once the Lua check passes. Regardless of a3, set "Brake on stop" in C0.
