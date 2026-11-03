# A1 Wingtip cruise propellers: variant design (2026-11-02)

**Verdict first.** Buildable, but it does not pay on this aircraft. Moving the cruise thrust to two tip propellers adds 0.73 kg (6.18 to 6.91 kg), raises hover power 21 % and cruise power 3 % (est), cuts the cruise window from 11.9 to 10.3 min against a 10.0 min mission, doubles roll inertia, and takes the reserve from $102.08 to $80.52. The tip-vortex benefit (Sinnige 2019) is 0.9 % of drag here, not 15 %. Recommendation: keep C0 for the first aircraft; revisit after C0 has flown. Numbers are estimates unless they cite a file or URL; arithmetic is in `calc.py`.

## 1. What changes versus C0

| | C0 | A1 |
|---|---|---|
| Cruise thrust | 1 pusher on the pod aft end (x -0.43) | 2 tractor props on wingtip nacelles, prop plane x +0.077, axis z = ±1.228 m, y +0.012 |
| Motor / ESC / prop | X4110S 400KV, SoloGood 45 A, APC 14x8.5EP | same motor and ESC; right prop APC 14x8.5E, left prop 14x8.5EP |
| Span / width over disks | 2.40 m / 2.40 m | 2.40 m / 2.812 m (0.188 m under the 3 m limit) |
| Rotation | n/a | right tip clockwise seen from behind, left counter-clockwise: the inboard blade rises (against the tip vortex) |
| Wing | spar sockets end at z 0.88; foam only outboard | 25.4 mm Al tube bonded into each socket end, through the foam, into the nacelle mount |
| Battery | x 0.0605 | x -0.1137 (CG held at -0.0668 m, 28 % MAC) |

Removed: Pusher_Prop_Set, ESC_P, CAP_P, firewall J-11 (36 hardware pieces). Added: 70; 613 becomes 647. Six motors (4 lift + 2 tip): the pusher motor and the spare become the tip motors, so no spare remains.

## 2. Engineering case

**Literature in context.** Sinnige et al. (J. Aircraft 56(1), 2019) measured about 15 % less drag than an inboard-tractor layout at CL 0.5 and thrust coefficient CT 0.12; the benefit grows with CL and thrust and exists only for inboard-up rotation (swirl -2.9 deg prop-off, +0.7 deg at J 0.7). Their tunnel ran Re_c ≈ 650,000 (40 m/s, c 0.24 m), D/semispan 0.32. Source: https://repository.tudelft.nl/file/File_1f520977-0e88-4460-b74c-80c5adfe1ad3 (read 2026-11-02). Three differences hit us:

1. Our CT per prop is 0.028 (4.9 N each at an assumed J 0.6, 5,600 rpm, est), 0.24 of theirs. Span-efficiency gain was +20 to +40 % over prop-off at their CT; scaled linearly with CT (est, linear scaling is an assumption) it is +4.7 to +9.4 %, central +7.1 %.
2. Their baseline is an inboard wing prop; ours is a pod pusher, so 15 % does not apply.
3. Our Re_c is 3.2e5 (20 m/s, nu 1.5e-5, est), half theirs; tip separation may eat part of the gain.

**Drag at 20 m/s** (`calc.py`, F6 polar, S 0.5728 m², AR 10.06, q 245 Pa, CD0 and e from `analysis/results.json`):

| Term | N | Basis |
|---|---|---|
| C0 drag | 9.314 | results.json D_cruise |
| Mass +0.728 kg: CL 0.432 to 0.483, induced drag up | +0.258 | CDi = CL²/(pi e AR) |
| Two nacelles, CdA 2.95e-4 m² each | +0.144 | Swet 0.0384 m², Cf 0.0035, FF 1.73, x1.1 junction, x1.15 wash (est) |
| Tip-vortex benefit, e 0.80 to 0.857 | -0.085 | Sinnige scaled by CT |
| A1 drag | 9.631 (+3.4 %) | |

Cruise power P = D V/(0.6 x 0.85) = **377.7 W** (C0 365.2 W); range 374 to 384 W for nacelle CdA x0.5 to x2 and benefit 20 to 40 %. An ideal actuator disc gives two half-loaded props +4 % efficiency (0.956 vs 0.919); real APC 14x8.5 efficiency at J 0.6 is unknown (—), so eta stays 0.6.

**Hover and endurance.** Hover power scales with the repo thrust table at m g/4 (1,716 g per motor): 4 x interp x 1.1, calibrated to 831.98 W: **1,009 W (+21 %)**. T/W falls from 2.03 to 1.81 (4 x 3,130 g / 6.91 kg). Usable energy 144.3 Wh x 0.95 x 0.8 = 109.67 Wh; minus 160 s hover and transition (44.8 Wh) leaves 64.8 Wh: **10.3 min** cruise (10.1 to 10.4), versus 11.9 min. It still meets 600 s, but under the repo's 11.5 min margin line (results.json cruiseMarginMin). Alternative packs are listed in results.json (for example HOOVO 6S 8000: 177.6 Wh, 0.986 kg); their mass and price effect on this variant is not evaluated (—).

**Mass (est).** Per tip 511.8 g: motor 165 (vendor), ESC 15, cap 4, prop 37.1 (apcprop.com 1.31 oz), adapter 12, spinner 8 plus screws 2, shell 28, PA6-CF mount 45, epoxy 8, tube 63.2, sleeve 19.2, wiring 105. Removed: pusher set 227 (results.json mPusherSet) plus adapter, spinner, firewall, wires, cap, screws = 323 g. Battery move: +16 g trunk, +12 g tray rails.

**CG, stability.** Tip mass sits 0.1 m ahead of the CG, so the unmoved CG would be at -0.0462 m, 0.021 m forward of the rotor thrust centroid. Hover trim would then cost about 1.4 Nm of front/rear thrust bias. Fix: battery 0.174 m aft (pack x -0.191 to -0.036, 11 mm under the saddle), which needs a belly slot hatch and tray rails. Static margin: C0 19.6 % (aero.json); a tractor prop's normal force moves the neutral point forward, -2.0 points (-1.0 to -2.9; normal-force slope 0.25 to 0.75 per rad is an assumption) giving **17.7 %**. Directional stiffness falls 19 % (props -3.5 Nm/rad against fins 18.2).

**Roll inertia.** C0 1.13 kg m² (lumped, est); A1 2.35 (x2.07): two 324 g nacelle groups at z 1.228 add 0.98, tubes 0.18, wire 0.10. At ±25 % thrust differential on the four lift motors (7.3 Nm, est) roll acceleration drops from 6.5 to 3.1 rad/s². Autotune must be redone.

**Elevator wash.** In C0 the pusher wash covers about 41 % of the H-tail span; A1 loses it in transition, where pitch is carried by the lift rotors (effect on transition pitch authority: —). The tip wash instead covers the outer 0.15 m of each aileron: roll authority at low speed rises.

## 3. Structure

Load path: nacelle mount barrel (PA6-CF, bore 25.6 mm) on the end of a 342 mm tube cut from the P-30 boom offcut, spliced to the socket end at z ±0.880 by a 74 mm sleeve cut from the P-32 joiner offcut. Both offcuts exist in C0 stock (358 mm and 154 mm), so no purchase; the offcut is fully used.

- Section: tube I 5,148 mm⁴, EI 355 N m² (E 69 GPa, cad/params.txt matE); socket 549; socket+joiner 907.
- 4.5 g ultimate (repo nUlt): nacelle 14.3 N at 0.348 m = 4.98 Nm, plus elliptic outer lift 24.0 N at 0.18 m = 3.11 Nm; total 8.1 Nm; bending stress 20 MPa (reserve factor 13.8 on 275 MPa yield).
- Root joiner: C0 hand-calc root moment scales with m, reserve factor 1.85 to 1.66 (method of analysis/sizing.mjs, which ignores tip inertia relief).
- Tip deflection under the nacelle weight at 1 g: 2.25 mm; twist 0.024 deg (nacelle CG 0.102 m ahead of the tube, GJ 268 N m²).
- Wing bending mode with boom masses (FE of one panel, clamped at the saddle, est): **11.3 Hz in C0, 9.0 Hz in A1**. Clamped overstates both; the change (-20 %) is what matters. This is close to a rate-loop bandwidth: a ground tap test decides (M3).
- Flutter and whirl flutter: mass ahead of the elastic axis is the favourable direction, but no analysis exists here (—). Propeller Ip Ω is 0.23 N m s (est). Handle by test (M3, M8).

## 4. Wiring and breakdown

No panel-to-panel joint lies between fuselage and tip: the only breakdown joint on the route is J1 at the wing root (z ±0.095), so each side adds **one XT60H pair and one JR pair** (10 of 12 XT60H pairs used; JR leads from P-09). The nacelle is permanently on the panel; the power pair runs in a 7 x 4 mm upper-skin groove at x -0.04 (the lower skin has the left pitot clamp at x -0.046..-0.024; the aileron servo bay is at x -0.151..-0.082).

Run length: 1.526 m geometric, 1.678 m with 10 % slack (route in `geometry.json`). 12 AWG for the 0.415 m BUS1 to J1 leg (stock freed by deleting W08), 14 AWG for the 1.263 m J1 to ESC leg (P-07 stock: 5.05 of 6.1 conductor-m). Loop resistance 24.6 mΩ (Cu 1.68e-8 Ω m, AWG areas): 8.5 A cruise drops 0.21 V (1.8 W); 20 A drops 0.49 V (2.2 % of 22.2 V, 9.8 W). Cap one tip motor at 20 A and both together at the C0 pusher allowance of 30 A. The ESC sits in the nacelle with a 470 uF cap; a root ESC would need three long phase leads per side. Static thrust 23 to 25 N per motor at 21 to 28 A is an estimate from assumed APC static CT/CP (—, measure).

## 5. Yaw control and one motor out

Arm 1.228 m. Rudders: S_v 0.0565 m² (results.json), fin CLa 1.80 per rad (Helmbold, AR 1.25), rudder effectiveness 0.55 (est), throw ±22.9 deg (hardware-schedule.md): 5.5 N, **4.0 Nm** at 20 m/s. Differential thrust of ±1 N gives 2.5 Nm, and works at transition speed (q 88 Pa at 12 m/s gives 1.4 Nm of rudder).

One motor out at cruise thrust would need 11.8 Nm. Rudder plus 8 deg sideslip supply 6.1 Nm, so the remaining motor can be balanced at only **4.9 N, about half of the 9.6 N required**; minimum drag is 6.6 N (L/D max 10.3), so level flight cannot hold. The response is Q_ASSIST/VTOL recovery. C0 loses all thrust at a pusher failure but has no yaw upset; A1 has partial redundancy and a yaw hazard. ESCs here have no telemetry, so ArduPilot does not detect the failure (—); a dead prop's windmilling drag is unknown (—).

## 6. ArduPilot parameters

Differential thrust is **not** a Q_ parameter. In Plane it uses the throttle-left and throttle-right outputs and RUDD_DT_GAIN, active in QuadPlane fixed-wing modes (https://ardupilot.org/plane/docs/yaw-in-plane.html, 2026-11-02; function numbers from https://ardupilot.org/plane/docs/common-rcoutput-mapping.html, 2026-11-02).

| Parameter | Value | Note |
|---|---|---|
| SERVO5_FUNCTION | 73 (Throttle Left) | was 70 |
| SERVO6_FUNCTION | 74 (Throttle Right) | S6 is spare; S5-S7 share a timer group, so both stay DShot (electrical-architecture.md) |
| RUDD_DT_GAIN | 0 first, then about 20 (est) | bench-check that right rudder speeds the left motor |
| SERVO_BLH_MASK / DShot type | bits for outputs 5 and 6 | risk R-A of C0 now covers 2 outputs; verify on bench |
| THR_MAX | set from the stand so each motor is at most 20 A | value — until test |
| Q_M_PWM_TYPE, Q_ASSIST_SPEED | unchanged from C0 | Q_ASSIST is the one-motor-out net |
| ARSPD_RATIO | recalibrate | left pitot moved to z -0.90 (disc inner edge -1.05) |

Left motor direction: swap two phase leads or reverse in the ESC; the prop on the right is standard (E), on the left reverse (EP). Standard APC E turning clockwise seen from behind is the usual convention; confirm on the bench (apcprop.com pages do not state it, —). 
## 7. Ground, hand and transport

- Prop disc bottom is 78 mm above the leg-foot plane. The tip strikes the ground at **5.6 deg roll (8.9 deg with the proposed wheels G-01)**, against 36 mm clearance for the C0 pusher.
- Disc inner edge (z 1.050) is 0.62 m outboard of the boom; people carry at the pod, with props off.
- Transport: panel plus nacelle is 1.18 m long and 0.36 m in x (spinner to shell tail), with props off; C0's longest piece is 1.2 m. With props on, the disc adds 0.36 m in y and z.
- Nacelle shell to aileron: 14 mm gap at full throw (hinge station, shell radius 15.6 mm).

## 8. Manufacturing

Panels: add the 25.6 mm bore (z 0.88 to 1.2) and the groove; how C0 cores are cut is — in the repo, so use a heated tube or a hot-wire half-cut. Print the mount in PA6-CF (one 140 mm part) and the shell in PETG vase mode. Order: sleeve and tube bonded into the socket, foam bonded over, barrel epoxied and pinned with 2 grub screws, then motor, ESC, wiring, shell.

## 9. Cost (inventory.json)

Goods +$19.55: 2 x APC LP14085E at $6.79 (apcprop.com 2026-11-02), one epoxy pack $5.97 (repo price 2026-10-13; the Amazon page could not be re-read, robots.txt). Tax +$2.00 at 10.25 %. Committed $1,919.48 (+$21.56), reserve $80.52. With the proposed wheel and capacitor lines the reserve is $19.96 (C0: $44.26). An optional spare motor ($51.81 with tax) would leave $28.71. If NWA props are free, $33.95 returns.

## 10. Risks

Benefit not measurable (0.9 % of drag against 1.5 % nacelles and 2.8 % mass); hover power +21 % and T/W 1.81; roll inertia x2.07; one-motor-out yaw 11.8 Nm; wing mode 9 Hz near the rate loop; prop strike at 5.6 deg roll; whirl flutter unanalysed; reserve $80.52.

## 11. Test plan (what the team must measure)

- M1 Weigh one tip group. Over 0.55 kg each, the aircraft exceeds 7.0 kg and the endurance drops under 10.0 min.
- M2 Thrust stand: X4110S + 14x8.5 static thrust and current at 50 % and 100 %. Fail: under 12 N at 20 A.
- M3 Tap test on the finished wing: f1 under 7 Hz or a second peak near 20 Hz fails.
- M4 Voltage at ESC input at 20 A: drop over 0.8 V means 12 AWG throughout.
- M5 Roll inertia (bifilar swing) and a hover roll step: roll rate loop must settle in under 1.5 s.
- M6 Airspeed vs GPS wind triangle: over 3 % error moves the pitot.
- M7 SITL one-motor-out with Q_ASSIST, then at altitude with the other motor idled by script: yaw rate over 30 deg/s fails.
- M8 Stepped-speed flutter climb to 1.2 x planned maximum, with a video of the tips.

## 12. Verdict

Do not build A1 first. Revisit it after C0 has flown, and only if the reserve allows or the sponsor supplies the props. It gets better at the project's 8 to 15 kg target: thrust per prop scales with weight, so at 12 kg CT per prop is about 0.05 (est: drag scales with weight at constant L/D), roughly double the benefit, while the nacelle drag stays fixed. At zero cost, the team can keep the retrofit option: cut the 25.6 mm bore and the groove when the C0 panels are cut (removes about 5 g of foam per panel).

**Sources.** `analysis/results.json`, `aero.json`, `sizing.mjs`, `cad/params.txt`, `inventory/` files, `docs/research/electrical-architecture.md`, `hardware-schedule.md`; sunnyskyusa.com X4110S (165 g, $46.99) and apcprop.com 14x8-5e/ep ($6.79), all 2026-11-02.
