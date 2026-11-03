# a2: Boundary-layer-ingesting pusher (stretched boat-tail)

Variant of C0 (task 38). URLs checked 2026-11-02. EST = estimate; "—" = unknown. Method and code: `bli_estimate.py`, `bli_estimate.json` (formulas in the file header).

## Verdict

Do not build a2 as a performance upgrade. Adopt only two pieces of it if C0 flight data call for them.
C0 already puts the pusher at the end of a tapered pod, 38 mm behind the cone end, so it already ingests the pod wake. Stretching the cone from 0.35 m to 0.45 m changes the BLI saving by +0.07 percentage points of ideal disc power (1.15 % to 1.22 %, EST), about 0.3 W of 367 W. Against that, a2 adds 0.100 kg, moves the pusher 83 mm aft, cuts the tail-strike pitch limit from 56.7 to 18.5 degrees, and needs the pod re-registered 16.7 mm forward to restore the CG. Cruise endurance falls 11.94 to 11.74 min (EST). Cost is $0: the committed spend stays $1,897.92 and the reserve $102.08.

Worth keeping: the gentler cone (max half-angle 12.1 degrees in C0, 9.5 in a2) as insurance against separation, and the removable tail module for an A/B test. Build it only after C0 is flying (target 2027-04-30), and only if tufts show separation or the cone vibrates.

## What changes vs C0

| Item | C0 | a2 | Source |
|---|---|---|---|
| Pod length / tail cone length | 0.850 / 0.350 m | 0.950 / 0.450 m | cad/params.txt fusL; `fuselage()` in fusion/build_vtol_fusion.py |
| Cone profile | r = 0.03 + 0.05 (1 - u^2 (3 - 2u)), u over the tail | same law over 0.45 m, end radius 0.030 m kept | same |
| Cone half-angle, mean / max | 8.1 / 12.1 deg | 6.3 / 9.5 deg | bli_estimate.json |
| Fineness L/d | 5.31 | 5.94 | |
| Wetted area / volume | 0.354 m^2 / 0.0122 m^3 | 0.389 m^2 / 0.0133 m^3 | |
| Pusher motor, ESC, prop | X4110S 400KV, SoloGood 45A, APC 14x8.5EP | same parts (P-38, P-15, P-23) | inventory.json |
| Prop plane x | -0.438 m | -0.521 m (cone 0.100 m longer, pod slid 0.0167 m forward) | geometry.json constants |
| Cone construction | XPS shell on PETG frames, taped | printed PETG shell in 3 segments, removable at a spigot joint | |
| Pod position on the wing saddle | x_nose = 0.450 m | 0.4667 m | CG fix, below |

No shaft extension, no motor inside the cone: the motor stays behind the cone end as in C0, so the C0 motor, ESC, prop, firewall and J-11 hardware are all reused.

## Engineering case

### Boundary layer at the prop plane

Re_L = V L / nu, with V = 20 m/s (results.json base.Vc), nu = 1.46e-5 m^2/s (ISA sea level, EST): 1.16e6 (C0) and 1.30e6 (a2). Flat-plate turbulent thickness delta = 0.37 L Re_L^-0.2 gives 19 mm (C0) and 21 mm (a2) at the pod end. That is the wrong number for the prop, because the tail converges (r falls from 0.08 to 0.03 m) and r*theta stays roughly constant, so theta grows 2.7x. Axisymmetric Head method with a slender-body potential edge velocity gives theta = 7.2 mm at r = 0.030 m (theta/r = 0.24) for both cones. The thin-boundary-layer assumption then fails, so the thickness is taken from momentum instead: Squire-Young gives the pod drag D_pod = 2 pi r theta rho V^2 (Ue/V)^((H+5)/2) = 0.556 N (C0) and 0.587 N (a2). A 1/n power-law wake (n = 4 to 7) that carries that momentum deficit has depth 37 to 50 mm at the hub, 41 mm (C0) and 43 mm (a2) for n = 5. The wake depth is 28 % of the 14 in blade length (hub r = 0.024 m to tip 0.178 m) and covers 12.5 % of the disc area. Raymer (FF = 1 + 60/f^3 + f/400) gives 0.533 and 0.528 N, so the sign of the pod drag change is unresolved: +0.031 or -0.005 N, midpoint +0.015 N used.

Separation: Head's H never rises above its start value 1.4 (1.24 at the cone end) for either cone, so none is predicted. The edge velocity is inviscid and prop suction is ignored, so this is optimistic. No attached-flow angle limit was found in the sources read, so the 12.1 degree maximum slope of C0's cone is flagged, not failed.

### The literature claims in context

- 21.7 % (IMAV 2017, TsAGI). The paper is a CFD study of a single axisymmetric body (NACA 0024 section, 0.5 m long; body diameter not given, 0.12 m EST) with an active-disk prop of 0.1 m diameter. "Backward" and "forward" mean prop behind or ahead of the body. Table 2 power is 0.799 W vs 1.021 W, so (fwd - back)/fwd = 21.7 %. The paper's own Eq. 15 definition, (P_noBLI - P_BLI)/P_BLI, gives 27.8 % on the same table. The body is the whole drag (phi = 1), the prop is smaller than the body, no wing, tail or booms exist, and Re is not stated. It is a tractor-versus-pusher comparison on a lone body, not a pusher-versus-C0-pusher one. Source: https://www.imavs.org/papers/2017/42.pdf.
- 3.95 %. This figure is not in the TsAGI paper. It comes from Drones 2023, 7(12), 686: a blended-wing-body UAV based on the NASA X-48B at 8.5 % scale (181 kg), distributed embedded-duct fans against a podded baseline, power saving coefficient (PSC) 3.95 %. A different architecture at 30x our mass. Source: https://www.mdpi.com/2504-446X/7/12/686.
- Bounds: D8 CFD about 9 % for boundary-layer ingestion, 0.8 % for wake ingestion (https://ntrs.nasa.gov/api/citations/20190001979/downloads/20190001979.pdf); body-of-revolution experiments 20 to 25 % (TU Delft thesis review, https://repository.tudelft.nl/file/File_801d78cd-0355-45c8-bcef-834c941def31).

### Our estimate

Actuator disc with uniform total-pressure rise and u_j = sqrt(u^2 + 2 dp/rho). Non-BLI: rho V A (u_j - V) = D_total. BLI: integral rho u (u_j - V) dA = D_total - M_def, M_def = ingested momentum deficit. P = dp * integral u dA. T = D_total = 9.31 N (results.json C0.sized.D_cruise), hub radius 0.024 m.

| Prop | Froude efficiency 2/(1 + sqrt(1 + C_T)) | PSC, C0 cone | PSC, a2 cone | Net vs 14 in (a2) |
|---|---|---|---|---|
| 14 in (0.356 m), kept | 0.911 | 1.15 % | 1.22 % | 0 |
| 12 in | 0.882 | 1.43 % | 1.51 % | -1.8 % |
| 10 in | 0.837 | 1.77 % | 1.86 % | -6.5 % |

A smaller prop ingests more but loses more in disc loading; keep 14 in. Ideal power at 14 in is 204 W, so a2 saves 2.5 W ideal, 4.5 W electrical (divide by eta_p/eta_F x eta_ME = 0.6/0.911 x 0.85 = 0.560). C0 already saves 4.2 W of it. The scaling is PSC ~ 0.19 phi, where phi = D_ingested/D_total: C0 phi = 6.0 %, a2 6.3 %. At phi = 1 the same formula gives 19 %, the range of the lone-body experiments above.

Distortion costs: the wake sits at r/R < 0.38, the lightly loaded inboard blade, with a mean wake fraction of 1.6 %. A wing-root wake and the canopy wake add a 1/rev term at the top of the disc. Published warnings run the other way: pusher efficiency may fall up to 15 % behind a nacelle (Ruchala, https://yadda.icm.edu.pl/baztech/element/bwmeta1.element.baztech-43d0c096-6060-4b09-9b76-272335ed8886/c/ruchala_An_Influence_of_Pusher_Propeller.pdf); fuselage blanketing was "significantly detrimental" for small-UAV pushers (MIT, https://dspace.mit.edu/handle/1721.1/68926); prop operation raised aft-cone drag in a 2026 TU Delft test (https://repository.tudelft.nl/record/uuid:6bcc2969-b89b-4c24-be04-b8a73b684d82). I carry 0 to +2 points of eta_p as a range (0 to +12 W, EST), not in the point value.

### Mass, CG, static margin

Added mass (EST): printed cone 0.1567 m^2 x 0.5 mm x 1270 kg/m^3 = 99.5 g; two joint rings 18 g; minus the C0 XPS cone shell it replaces, 0.1224 m^2 x 0.29 kg/m^2 = 35.5 g; phase-lead extension and connectors 18 g. Total +0.100 kg, MTOW 6.182 to 6.282 kg (EST). The pusher motor and prop (0.202 kg) move aft 0.100 m.

CG before any fix: (m0 x0 + dM_x)/m1 = -0.0735 m, 30.8 % MAC against 28.0 % (x0 = -0.0668 m, results.json cg.target; chord 0.2387 m). The battery cannot absorb it: it sits in a 175 mm gap between formers PF_A (x = -0.025) and PF_B (0.150) with 20 mm slack (hardware.json J-25), with the XT90S and BUS1 ahead of it. Fix: slide the pod group (pod, canopy, battery, avionics, pusher set, payload, 2.497 kg) forward by DX = ((m1 x0) - (m0 x0 + dM_x)) / 2.497 = 0.0167 m on the wing saddle. The wing, booms, lift motors and tail do not move. Hover thrust centroid and CG stay at -0.0668 m.

Static margin: NP 47.63 % MAC (aero.json). The extra 0.0011 m^3 of tail volume moves it forward by 0.27 % MAC (Munk term 2 (k2 - k1) V/(S c CLa), k2 - k1 = 0.9 EST). The prop normal force acts 0.083 m further aft and takes 0.1 to 0.4 % MAC (N_alpha = 0.3 to 1.0 T per rad, EST bounds). SM = 19.1 % (18.8 to 19.3) against C0 19.6 %.

### Performance deltas (EST)

| Quantity | C0 | a2 | Formula |
|---|---|---|---|
| MTOW | 6.182 kg | 6.282 kg | above |
| Hover power | 832.0 W | 852.2 W | P x (m1/m0)^1.5 |
| Induced drag change | 0 | +0.034 N | CDi x (W1/W0)^2, q S = 140.3 N |
| Pod drag change | 0 | +0.015 N (-0.005 to +0.031) | Squire-Young, Raymer |
| Cruise power | 365.2 W | 366.9 W | dD V/(0.6 x 0.85) - 0.26 W BLI credit |
| Cruise minutes after 2 min hover + 40 s transition + 20 % reserve | 11.94 | 11.74 | analysis/model.js line 78, pack 144.3 Wh |

Hover T/W falls from 2.03 to 1.99 (EST, motor thrust fixed); the C0 requirement it must meet is — here, so check it before accepting the mass.

Controllability: the prop plane is 0.249 m (0.70 D) ahead of the H-tail leading edge, C0 0.332 m. More slipstream on the central 0.36 m of the elevator, a little more throttle-to-pitch coupling, more low-speed elevator authority. Transition is unchanged: the pusher is off in hover and the BL is thin at low speed.

### Structure

The cone is a cantilever carrying 0.202 kg of motor and prop 0.45 m aft of the joint. Ultimate load factor 4.5 (cad/params.txt feaNult): M = 0.202 x 9.81 x 4.5 x 0.45 = 4.0 N m at the joint, 182 N across the 22 mm spigot (couple). First bending mode f_n = (1/2 pi) sqrt(3 EI/(m L^3)). I set f_n >= 40 Hz (EST design rule, away from the rate-loop band): EI >= 388 N m^2, so E t >= 5.7e5 N/m at r = 0.06 m (EI = E pi r^3 t). A 5 mm XPS shell gives it only if E is above 114 MPa; the XPS modulus is — in the repo, so the C0 foam cone carries the same unknown (M2 applies to it too). PETG modulus is also — in the repo; at a typical 2 GPa (EST), a 0.5 mm wall gives EI = 680 N m^2 and f_n = 53 Hz. That is why the cone is printed.

### Motor and ESC cooling

Motor stays outside the cone, in the wake and prop wash, as in C0. Burying it: heat 41.6 W (cad/params.txt thermQ) into a sealed cone with h = 5 to 10 W/m^2K over about 0.06 m^2 (EST) gives 70 to 140 K rise, so it is rejected. The ESC stays at the C0 station (x = -0.340 + 0.0167 m); the cone is wider there (r = 0.044 m against 0.034 m), so it fits with more room; ESC losses are — (not published). A 15 x 8 mm bottom vent is included (EST, set by M4).

## Integration

- Structure: forebody 0.50 m (XPS on PF_A/B/C) ends at a joint plane x = -0.0333 m. Tail_Joint_Spigot (PETG, OD 140/130, ID 112, 30 mm) is epoxied in; Tail_Joint_Sleeve (OD 158, ID 130.8, 22 mm) is bonded in the cone. Slip fit 0.4 mm radial (EST). Three radial M3x20 screws (bottom, +Z, -Z) into M3 heat-set inserts (bore 4.2 x 7.5 mm, tolerances.json), 2.0 mm hex key. Screws sit at y = -0.03 m, 16 mm below the saddle.
- Pusher mount: C0 firewall and aft bulkhead (J-11) move aft with the cone; no change to them.
- Wiring: W15 (ESC to motor, 0.039 m) becomes 0.138 m geometric, 0.151 m EST, with 0.10 m of 14 AWG added per phase. Ringing risk from longer phase leads: no data (—); the 470 uF capacitor CAP_P stays at the ESC. W08 gets two XT60H pairs and W25 one JR pair at the joint, from stock.
- ArduPilot: no new parameter. SERVO5_FUNCTION = 70 and the DShot output unchanged. Re-learn the hover throttle (Q_M_THST_HOVER), re-check the CG and `Q_` trim; watch VIBE and Clip in the first ground run.
- Ground clearance (rear gear at x = -0.4146 m, prop tip y = -0.208 m, leg bottom -0.2437 m):

| Case | Prop plane behind rear gear | Tail-strike pitch | Check |
|---|---|---|---|
| C0, no wheels | 0.024 m | 56.7 deg | matches electrical-architecture.md 56.9 deg |
| C0, wheels | 0.024 m | 74.4 deg | 74.4 deg |
| a2, no wheels | 0.107 m | 18.5 deg | below the 23 deg boom-end limit: the pusher governs |
| a2, wheels | 0.107 m | 38.1 deg | boom end (23 deg) governs again |

Tip height is 36 mm without wheels, 84 mm with. A 10 degree landing tilt leaves 0.0357 cos 10 - 0.107 sin 10 = 16 mm. Recommend the proposed wheels (G-01 to G-03, $37.50 goods, $41.34 with tax, not committed; reserve then $60.74) before any rolling landing. They add 0.124 kg EST and drag not counted in C0 (wheel CdA —).
- Clearances: pusher disc to rear lift-disc inner edge 0.040 m laterally (0.2178 - 0.1778), unchanged from C0 because x does not enter; to boom axis 0.257 m; the lift props are stopped in cruise.

## Manufacturing

Print the cone upright in PETG (P-05): 1 perimeter at 0.5 mm, 0 top and bottom layers, 0 infill, three 0.15 m segments with 10 mm lap lips, epoxy joints. Bed at least 170 x 170 mm (printer assumed, tolerance-analysis.md; print time —). Print the rings after the tolerance coupons. Optionally print a 0.35 m C0-length cone (about 80 g EST) for the A/B test. No purchase needed.

## Risks

1. Benefit is below measurement noise (1 to 4 W). Low consequence.
2. Tail strike at 18.5 degrees without wheels. Medium.
3. Printed cantilever stiffness and 1/rev vibration, unmeasured. Medium.
4. Pod re-registration: the saddle pocket moves 16.7 mm; the R12 payload bay shifts with the pod. Low.
5. Thin-boundary-layer model on a converging tail (delta/r above 1): the BLI figure is order-of-magnitude.
6. +0.100 kg costs 2.4 % hover power. Low.

## What the team must measure

- M1. Cone flow attachment: wool tufts on the C0 cone in glide and cruise. If reversed flow in the last 0.1 m, build the a2 cone (fails nothing named; it is the trigger).
- M2. Cone stiffness: hang 0.2 kg at the motor station, measure deflection and ring-down frequency. Below 40 Hz, add ribs or a wall of 0.8 mm.
- M3. A/B cruise power at 20 m/s, same mass and CG, alternate legs: a2 stays out unless it saves 5 % (18 W) or more.
- M4. Motor and ESC temperature after 5 min cruise (IR thermometer P-20); open or close the vent accordingly, same limit as the C0 motor test.
- M5. CG: balance on two knife edges with a scale, within 3 mm of -0.0668 m.
- M6. Tail-strike angle with the built aircraft on its gear: 15 degrees or more without wheels.
- M7. VIBE below 30 m/s/s and Clip near 0 (https://ardupilot.org/plane/docs/common-measuring-vibration.html, 2026-11-02) on the ground run and first cruise.

Sources: repo files analysis/results.json, aero.json, model.js, cad/params.txt, fusion/build_vtol_fusion.py, inventory/*.json, tolerances.json, docs/research/electrical-architecture.md, budget-airframe.md; URLs above, all checked 2026-11-02.

## Rev 2: joint plane moved aft of the wing (2026-11-03)

Rev 1 put the forebody/tail-module joint at x = -0.0333 m. The Fusion build showed that plane lies inside the wing chord: the saddle, spar joiner and J-01 root plates (aft extent x = -0.239 m, measured in Fusion) pass through the first 0.2 m of the cone shell and through the spigot and sleeve rings. A notch cut left roof fragments, so rev 1 was replaced.

- Joint plane is now x = -0.2600 m (21 mm aft of the saddle trailing edge, pod slide included). The forebody (Fuselage_Pod) is the C0 nose and cylinder plus the first 0.2267 m of the same cone law, so it keeps C0's shape over the saddle. No wing, saddle, joiner, root-plate or J-02 body is cut or changed.
- The printed tail module is the last 0.2233 m of the cone: 3 segments (0.113, 0.055 and 0.055 m; splits at 0.34 and 0.395 m of the spec cone), shell radius 54.7 mm at the plane down to 30.0 mm. Outer profile, half-angles (mean 6.3, max 9.5 deg), cone end x = -0.4833 m and pusher plane x = -0.5213 m are unchanged.
- Spigot and sleeve are re-sized to the smaller radius (tongue OD 91.8, sleeve ID 92.6, slip fit 0.4 mm radial). Screws are M3x16 at x = -0.2710 m (M3x20 would reach the bore).
- Mass (EST): +0.059 kg against C0 (rev 1: +0.100): +0.0353 printed cone, +0.0293 XPS extension on the forebody (C0 areal mass 0.29 kg/m^2), +0.012 rings, -0.0355 C0 foam cone, +0.018 wiring. MTOW 6.241 kg, hover power 843.9 W, cruise power 366.4 W, cruise endurance 11.82 min (all EST, see metrics.json). The ESC ribs and lap rings are not in the mass (as in rev 1).
- CG (EST): the pod slide for rev 2 masses is 13.8 mm; the model keeps 16.7 mm, so the CG sits about 1.2 mm forward of -0.0668 m, inside the M5 tolerance of 3 mm. Set the slide to 13.8 mm if M5 weighing agrees.
- Checks in Fusion: pusher sweep (360 deg, 45 deg steps) shows only the C0 motor / J-11 screw artefact; tail-module slider drives 0 to 0.30 m aft; no a2 part overlaps the wing, saddle or boom bodies. Tail-strike pitch 18.6 deg without wheels, 38.3 deg with (unchanged).
