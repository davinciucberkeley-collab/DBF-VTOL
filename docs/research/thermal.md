# Heat dissipation: lift units, pod (battery, avionics) and pusher (C0, v0.4 inputs of 2026-10-25)

Baseline: concept C0, 4-lift twin-boom quadplane. Heat sources are the four SunnySky X4110S lift motors with their SoloGood 45 A ESCs on the booms, a fifth X4110S as the pusher in the PA6-CF cup at the pod tail (`docs/purchasing/C0_BOM.csv` "X4110S 400KV (pusher)", `analysis/sizing.mjs` PUSHER = X4110S), the Ovonic 6S 6500 pack in the foam battery bay, and the flight controller in the avionics bay. Loads are taken from `analysis/results.json` (C0 sized, generated 2026-10-25, stall target 11.75 m/s: MTOW 6.55 kg, hover 915.7 W, 228.9 W per lift unit, cruise 337.4 W, transition 1,590 W, pack currents 43.6 / 75.7 / 15.2 A in hover / transition / cruise), geometry from `cad/params.txt` and `docs/research/hardware-spec.md`. Every run is reproducible: `py analysis/thermal/thermal_inputs.py` (loads, film coefficients) → `cad\Thermal.exe cad\params.txt analysis\thermal\thermal_inputs.json cad\sim\thermal` (SOLIDWORKS Simulation) → `py analysis/thermal/thermal_report.py` (renders, findings table, `analysis/thermal/thermal_results.json`).

Verdict first (hot day 35 °C; standard day 20 °C = hot-day value − 15 K because the problem is linear; every temperature is the maximum in the body from `cad/sim/thermal/results.txt`):

| Component | Case | Peak, hot day | Standard day | Limit | Margin | Status |
|---|---|---|---|---|---|---|
| Lift motor can | hover 60 s (flight rule, ≤ 60 s per hover) | **63 °C** | 48 °C | 80 °C EST (test plan) | +17 K | pass |
| Lift motor can | hover 90 s (bench C08) | 74 °C | 59 °C | 80 °C EST | +6 K | at risk |
| Lift motor can | mission peak (end of hover + transition, 80 s) | **78 °C** | 63 °C | 80 °C EST | +2 K | **at risk** |
| Lift motor can | steady hover (upper bound, τ ≈ 300 s, never reached) | 169 °C | 154 °C | 80 °C EST | −89 K | fail (bound only) |
| Lift ESC (boom underside, prop wash) | hover 60 s | 56 °C | 41 °C | 70 °C EST (test plan) | +14 K | pass |
| Lift ESC | hover 90 s (C08) | 63 °C | 48 °C | 70 °C EST | +7 K | at risk |
| Lift ESC | mission peak (80 s) | **66 °C** | 51 °C | 70 °C EST | +4 K | **at risk** |
| Lift ESC | steady hover (bound) | 96 °C | 81 °C | 70 °C EST | −26 K | fail (bound only) |
| PA6-CF motor mount | mission peak | **76 °C** | 61 °C | HDT 173 °C | +97 K | pass |
| PA6-CF motor mount | steady hover (bound) | 169 °C | 154 °C | HDT 173 °C | +4 K | at risk (bound only; a PETG mount, HDT 68 °C, fails from 72 s of hover) |
| 6061 boom at the clamp | any | 36 °C | 21 °C | — | — | the PETG boom clamps never see heat |
| Battery pack (R_pack at the C11 limit) | mission end | **64 °C** | 49 °C | 60 °C (test plan) | **−4 K** | **fail** |
| Flight controller lump (all 3.5 W in the FC block, sealed bay) | mission end | 97 °C | 82 °C | — (not published) | — | hot: vent the bay (§6) |
| XPS pod foam | mission | 35 °C (pod), 62 °C (tail ring at the pusher cup) | 20 / 47 °C | 74 °C max use | +12 K | pass |
| Pusher motor can (X4110S) | after 600 s cruise | **91 °C** | 76 °C | 80 °C EST | **−11 K** | **fail with the estimated loss (§6.3)** |
| PA6-CF pusher cup | steady cruise (bound) | 92 °C | 77 °C | HDT 173 °C | +81 K | pass |

Three things to act on: (1) the battery bay is effectively adiabatic (XPS k 0.029 W/mK), so a pack at the 7.5 mΩ/cell acceptance limit ends a hot-day mission at 64 °C — the pack must be ventilated or the acceptance resistance tightened; (2) the lift motor and its ESC sit 2–4 K under their (estimated) limits at the end of the take-off hover + transition on a 35 °C day, so the 60 s hover rule and the 80 °C / 70 °C IR checks in the test plan are load-bearing and the 20 % loss estimate must be replaced by the C08 measurement; (3) the pusher X4110S in its PA6-CF cup reaches 91 °C in the model with a 38 W loss (15 % of cruise power, 75 % of it in the motor — both estimates); the model already gives the can the full 20 m/s film even inside the cup, so the number is set by the loss estimate, not by the cup: it is a measurement item first (G03 static run, F08 cruise legs, IR check) with the design options of §6.4 item 6 held until the measurement. Printed PA6-CF parts are never within 90 K of their HDT in flight; PETG would not be acceptable for the motor mounts (76 °C peak vs HDT 68 °C) but is fine for the boom clamps (boom at 36 °C).

Images (`analysis/thermal/img/`, thermal-camera style, inferno scale from the ambient to the case maximum, hot spot marked): `lift_unit_hover_30_60_90.png` (a), `lift_unit_mission.png` (a, end of hover / end of transition / end of mission), `lift_unit_steady.png` (a, bound), `pod_mission_end.png` and `pod_end_cruise.png` (b, centreline section through the battery and avionics bays), `pusher_cruise.png`, `thermal_mission_history.png` (c, all components vs limits through the mission), `lift_unit_hover_history.png` (continuous hover). The SOLIDWORKS plots are in `cad/sim/thermal/THERM_*.png`; the studies are saved in `cad/sim/thermal/THERM_*.SLDPRT`.

## 1. Method and tool choice

**Tool.** SOLIDWORKS Simulation 2025 thermal studies (steady state and transient) driven from `cad/Thermal.cs`, the same API pattern as `cad/Sim.cs` (which is unchanged; `analysis/verify.py` still reads `cad/sim/results.txt`). Flow Simulation is not licensed, so convection is applied as film coefficients from textbook correlations on each exposed face (section 3), not computed. Studies build their own simplified multi-body parts from `cad/params.txt` and do not open `cad/model/`:

| Study set | Bodies (material) | Loads | Cases |
|---|---|---|---|
| M motor-only | Ø48 × 32 can (6061 library, then the lumped motor material) | `thermQ` / `thermH` of `cad/Sim.cs`, then this analysis' Q and h | steady (validation), 90 s transient (validation of the lumped 76 °C) |
| L lift unit | motor can on the PA6-CF mount block 70 × 46 × 36 with the Ø25.6 bore (hardware-spec J02), 0.40 m of 6061 boom, ESC lump 55 × 28 × 12 on its 3 mm foam pad under the boom ahead of the mount (J15) | motor + ESC heat | steady hover; continuous hover 0–120 s; the mission chain |
| P pod | Ø160 × 850 XPS cylinder with the battery bay (60 × 60 mm, 60 deep, `BuildVtol.cs Fuselage()`) and the avionics bay (`params.txt bay*`), battery block 155 × 50 × 48, FC block 52 × 32 × 17 | battery I²R per phase, FC 3.5 W | the mission chain |
| K pusher | Ø48 × 32 can (X4110S lump, 165 g) in the PA6-CF cup (Ø55.6 × 30 long, 4.5 floor, 3 wall EST; `cad/mesh/meta.json` Pusher_Cup) in a Ø80 foam ring; the can protrudes 6.5 mm past the cup rim | motor loss in cruise | steady cruise; 600 s cruise transient |

**Mission chain.** The API rejects time curves on loads (`ICWHeatPower::SetTimeCurve` returns error 3 for every array layout tried), so a mission is run as one transient study per phase, each starting from the last saved step of the previous one (`ThermalStudyOptions.UseTemperatureFromThermalStudy2`, `ThermalStudyNameUsedForInitialTemperature`, `TimeSteps` = that step). Phases: hover 60 s → transition 20 s → cruise 600 s → transition 20 s → hover 60 s (`analysis/sizing.mjs` tHover 120 / tTrans 40 / tCruise 600 s, split as the review's duty chart `review/src/app.js drawDuty`; test plan F12 flies ≥ 1 min hover at each end). Time step 5 s (20 s in cruise); the same mesh in every study of a chain so the initial field maps node to node.

**Transient output fix.** `cad/README.md` recorded that the transient thermal API "returned no saved time steps" (2026-10-13). The study then had no initial temperature and the thermostat flag on the heat load was left at its default. With (1) an initial-temperature load on all bodies (`AddTemperature`, `TemperatureType` 0 = initial), (2) `IncludeThermostat2 = false` on every heat-power load of a transient study (the default fails `HeatPowerEndEdit` with error 6 "select vertex for thermostat"), and (3) `StudyResultOptions.SaveResultsForSolutionStepsOption = 0` (all steps), `Results.GetMaximumAvailableSteps()` returns every step (18 for 90 s at 5 s) and `GetMinMaxThermal(0, step, null, 2)` reads each one. `GetTimeOrFrequencyAtEachStep` returns DBNull, so step times are reconstructed from `TimeIncrement`. Probed layouts (2026-10-25): `Mesh.GetNodes()` = [id, x, y, z] per node; `Mesh.GetElements()` = 16 values per element (id, 10 node ids, centroid …); `Results.GetThermalValues(step, null, 2)` = 10 values per node (id, T, three gradients, resultant, three fluxes, resultant); `GetThermalComponentForAllStepsAtNode(0, node, null, 2)` = [step, t, T] per step; `GetThermalForEntities(0, step, null, faces, 2)` = [id, T] for the nodes on the faces.

**Field export.** For each case the surface triangles (tet faces that appear once) and nodal temperatures are written to `cad/sim/thermal/fields/*.json`; `analysis/thermal/thermal_report.py` renders them in a thermal-camera style (inferno palette from the ambient to the case maximum, scale bar in °C, hot-spot marker with the maximum) and decimates them by vertex clustering for the web page (`analysis/thermal/thermal_results.json`, section 7).

## 2. Heat loads (all per `analysis/thermal/thermal_inputs.json`)

| Source | Load | Basis |
|---|---|---|
| Lift motor, hover | **45.8 W** each | EST 20 % of the 228.9 W hover input per unit (`cad/params.mjs` thermQ rule: 80 % motor + ESC efficiency); the same rule gave 44.6 W in `cad/sim/results.txt` on the previous sizing. Conservative: the reseller-listed 112 mΩ winding resistance gives only I²R ≈ 13 W at the 10.9 A hover current (228.9 W / 21 V), so 20 % also covers iron, bearing and ESC-side losses |
| Lift motor, transition | 79.5 W each | the same 20 % of P_trans / 4 (1,590 W / 4; `sizing.mjs` P_trans = P_hover + 2 P_cruise) for 20 s |
| Lift ESC | **9.2 W** hover, 15.9 W transition | EST 4 % of the unit input. SoloGood publishes no efficiency ("—"); FET conduction loss scales as I_rms² R_ds(on) and is 60–80 % of inverter loss (TI SSZTB57). Added on top of the 20 % motor figure, so the unit total (24 %) is conservative |
| Lift motor + ESC, cruise | 0 | lift rotors stopped (R1); cooled by the 20 m/s freestream |
| Battery pack | **85.6 W** hover, **258 W** transition, 10.4 W cruise | I²R with R_pack = 6 × 7.5 mΩ = 45 mΩ, the C11 pass limit of `docs/test/TEST-PLAN.md` when the studies ran (EST; Ovonic publishes no resistance). The re-based test plan now sets 7.3 mΩ/cell (0.30 V / 41.2 A), so the battery results here are 2.7 % conservative: 28.3 K instead of 29.1 K over the mission, 63 °C instead of 64 °C at touchdown *(calc, heat ∝ R)*. I = P / 21 V (`sizing.mjs` line 155): 43.6 / 75.7 / 15.2 A. This is the bounding pack; a pack at half the limit makes half the heat |
| Pusher motor + ESC, cruise | 50.6 W total: **38.0 W** motor, 12.7 W ESC | P_cruise 337.4 W × (1 − η_mec 0.85) (`results.json` base.etaMEc); 75/25 split EST. The pusher is the same X4110S as the lift units; SunnySky publishes no thermal data ("—") |
| Flight controller + RX + GPS + Remote ID + UBEC | 3.5 W | EST (~0.5 A at 5 V plus UBEC loss); CoreWing publishes no figure |

Mission energy check: the battery heat over the mission is 85.6 × 120 + 258 × 40 + 10.4 × 600 = 26.8 kJ *(calc)*, 7.3 % of the 367 kJ the mission draws from the pack (`results.json` sized E_Wh 96.9 Wh × 3600 / η_batt 0.95) — consistent with a pack at its resistance limit.

## 3. Cooling: film coefficients from correlations

Air at ~308 K: ν 1.65 × 10⁻⁵ m²/s, k 0.0268 W/mK, Pr 0.706 (Incropera & DeWitt, *Fundamentals of Heat and Mass Transfer*, 6th ed., Table A.4).

**Prop wash.** Induced velocity at the disc v_i = √(T / 2ρA) with T = 16.06 N per unit (`results.json` sized Tunit_N), A = 0.1464 m² (Ø17 in disc), ρ 1.225 → **v_i = 6.69 m/s** (far wake 13.4 m/s). The motor, mount and ESC sit under the disc, so the near-disc value is used (conservative by up to 2× on velocity, ~1.5× on h).

| Surface | Correlation | Re | Nu | h, W/m²K |
|---|---|---|---|---|
| Lift motor can, hover | Hilpert cylinder in crossflow, D 48 mm, V = v_i (eq. 7.52, Table 7.2) | 19,500 | 76.9 | **42.9** |
| Boom tube, hover | Hilpert, D 25.4 mm | 10,300 | 51.9 | 54.8 |
| Mount block, hover | laminar flat plate, L 70 mm (eq. 7.30) | 28,400 | 99.6 | 38.1 |
| ESC, hover | laminar flat plate, L 55 mm | 22,300 | 88.3 | 43.0 |
| Lift motor / boom / mount / ESC, cruise 20 m/s | the same correlations at V_c | — | — | 91.9 / 107.7 / 65.9 / 74.4 |
| Pod skin, cruise | mixed flat plate, L 0.85 m (eq. 7.38) | 1.03 × 10⁶ | 1,353 | 42.7 |
| Pod skin, hover | Churchill–Chu horizontal cylinder, D 0.16 m, ΔT 10 K (eq. 9.34); wash on the pod neglected | Ra 3.4 × 10⁶ | — | 3.4 |
| Pusher can, cruise | laminar flat plate over the 32 mm can in the axial freestream + prop inflow (EST form) | 38,800 | 116 | 97.5 |
| Cup inner annulus | EST half the can value | — | — | 48.8 |
| Battery and FC faces to bay air | EST free convection in a closed bay (Incropera Table 1.1, gases 2–25) | — | — | 5.0 |
| Radiation, for scale | 4 ε σ T³ at 330 K, ε 0.9 EST; not applied (conservative) | — | — | 7.3 |

The `cad/Sim.cs` value h = 50 W/m²K (EST) sits between the motor-can and boom correlations, which is why the earlier steady result (141 °C) and this one differ only through the smaller h and the contact face.

**Ambient.** Hot day 35 °C (`cad/params.mjs` thermAmbK, EST; no R-number in `docs/DESIGN-BASIS.md` sets an environment). Standard day 20 °C EST. All studies are linear (constant properties, convection only, no radiation), so every standard-day temperature is the hot-day value minus 15 K; the tables quote both.

## 4. Materials

| Material | k, W/mK | c_p, J/kgK | ρ, kg/m³ | Limit | Source |
|---|---|---|---|---|---|
| 6061 boom | 167 | 896 | 2,700 | — | SOLIDWORKS library "6061-T6 (SS)" (`params.txt` matLib) |
| Motor lump (X4110S) | 30 EST | 470 EST (band 385–500) | 165 g / can volume = 2,848 | can 80 °C EST (test plan abort table; SunnySky publishes no limit) | mass `budget-lift.md` A3; c_p mass-weighted Cu/steel/Al (`review/src/app.js` TH) |
| Pusher lump (X4110S) | 30 EST | 470 EST | 165 g / can volume = 2,849 | can 80 °C EST | `cad/params.txt` motorMass, `budget-lift.md` A3; `sizing.mjs` mPusherSet (pusher = lift motor type) |
| PA6-CF mount, cup | 0.35 EST | 1,500 EST | 1,170 | HDT **173 °C** at 1.8 MPa | Polymaker Fiberon PA6-CF20 TDS v1.1 (`airframe-materials.md`) |
| PETG (boom clamps, trays; not a heat path here) | — | — | — | HDT **68 °C** (0.45 and 1.80 MPa), Tg ~80 °C | Prusament PETG TDS v1.1 (2022); MatterHackers PETG sheet (checked 2026-10-25) |
| XPS pod foam | 0.0289 | 1,300 EST | 32 (sizing rhoFoam) | max use **74 °C** (165 °F) | Owens Corning FOAMULAR 150 product data sheet: R-5 per inch at 75 °F mean (ASTM C518) → k = 0.0254 / 0.88 = 0.0289 W/mK *(calc)*; maximum use temperature 165 °F (74 °C) (datasheet PDF cited in `airframe-materials.md`, read 2026-10-25) |
| LiPo pack | 1.0 EST (through-plane 0.5–1, in-plane 20–30) | 1,100 | 0.82 kg / 155 × 50 × 48 box = 2,204 | **60 °C** | c_p: Lin et al., arXiv 2112.09768 (20 Ah pouch, 541 J/K at 0.489 kg) and Chalmers calorimetry (~1,100); mass `results.json` pick.kg; limit `TEST-PLAN.md` C11 / rule 8 |
| ESC / FC lump | 5 EST | 800 EST | 1,500 EST | ESC 70 °C EST (test plan) | — |
| Foam mounting pad | 0.04 EST | 1,300 EST | 40 EST | — | hardware-spec J15 |

## 5. Validation

| Check | FEA | Reference | Δ |
|---|---|---|---|
| Motor-only steady with the `cad/Sim.cs` inputs (Q 44.62 W, h 50, 6061 library) | **141.13 °C** | `cad/sim/results.txt` motor_T_steady 141.13 °C; hand T_amb + Q/(hA) = 140.68 °C (A = 0.008445 m²) | 0.0 % / +0.3 % |
| Motor-only steady with this analysis' inputs (Q 45.8 W, h 42.9 Hilpert, lumped motor k 30) | 163.8 °C | hand 161.3 °C | +1.6 % (internal gradient of the k = 30 lump) |
| Motor-only 90 s transient, c_p 470 J/kgK, `Sim.cs` inputs | **76.2 °C** | lumped capacitance 75.9 °C, τ = m c_p/(hA) = 183.7 s (`review/src/app.js` TH, "≈ 76 °C" in `cad/README.md`) | +0.3 K |
| Lift-unit steady vs motor-only | 168.9 °C | 163.8 °C: the motor base now sits on the PA6-CF floor (k 0.35) instead of convecting, and the boom path carries < 1 W (boom max 36.2 °C) | consistent |
| ESC steady in prop wash | 96.1 °C | hand Q/(hA): 9.16 W / (43.0 × 0.00353 m²) = 60.3 K → 95.3 °C | +0.8 K |
| Pusher steady (X4110S) | 91.9 °C | hand 38.0 W / (97.5 × 0.00664 m²) = 58.7 K → 93.7 °C (the cup wall conducts a little away) | −1.8 K |
| Battery rise over the mission | 29.1 K (35.0 → 64.1 °C) | adiabatic 26.8 kJ / (0.82 kg × 1,100 J/kgK) = 29.7 K | −0.6 K: the foam bay is adiabatic to within 2 % |
| Transient steps saved | 18 of 18 (90 s / 5 s), 24, 12, 4, 30 … per phase | `cad/README.md` 2026-10-13: "returned no saved time steps" | fixed (§1) |

The structural FEA–hand bands of `analysis/verify.py` (15 %) are met by every pair above; the thermal pairs are within 2 %.

## 6. Results

### 6.1 Lift unit (motor + PA6-CF mount + boom + ESC)

Continuous hover from 35 °C (`lift_unit_hover_history.png`): motor can 50 / 63 / 74 / 84 °C at 30 / 60 / 90 / 120 s; ESC 46 / 56 / 63 / 69 °C; mount maximum (the floor under the motor) 49 / 62 / 73 / 83 °C; boom < 36 °C throughout. The can crosses the 80 °C EST limit at about 110 s and the ESC crosses 70 °C at about 125 s of uninterrupted hover. Time constant of the lump in prop wash ≈ 300 s (169 K steady rise), so the steady state is never approached in flight.

Mission (`lift_unit_mission.png`, `thermal_mission_history.png`): 63 °C after the 60 s take-off hover, **78 °C at the end of the 20 s transition** (loads × 1.74 for P_trans), cooling in cruise with the rotors stopped (h 92 W/m²K at 20 m/s) to 37 °C by 680 s, then 77 °C again after the back-transition and landing hover. The ESC peaks at 66 °C and ends at 65 °C. The mount tracks the motor base within 2 K (76 °C peak), 97 K under the PA6-CF HDT. The results for the bench protocol C08 (3 × 90 s with cooling to 45 °C between runs) follow from the single-run curve: each run starts within 10 K of ambient, so the third run peaks ≤ 84 °C — the "3 × 90 s with 30 s rests" worst case of the test plan (never flown) would reach about 95 °C in this model and is correctly labelled a limit-finding run.

Sensitivity: the 20 % loss is the dominant assumption. At the reseller-listed 112 mΩ winding resistance the hover I²R is 13 W; with 10 W of iron and bearing loss (EST) the unit loss would be ~23 W and every rise above ambient halves (mission peak ≈ 57 °C on a hot day). C08 measures this directly (fit the time constant and the steady rise).

### 6.2 Pod: battery and avionics bays (hot day)

`pod_mission_end.png` and `pod_end_cruise.png` are centreline sections. The battery warms 2.1 K in the take-off hover, 6.3 K in the 20 s transition (258 W), 7.6 K over the 600 s cruise, 6.3 K in the back-transition and 2.1 K in the landing hover: **64 °C at touchdown from a 35 °C start**, 4 K over the 60 °C limit. Only 2 % of the heat leaves through the foam (0.029 W/mK) and the 5 W/m²K bay air film, so the pack is adiabatic: the rise is simply Q·t / (m c_p) and scales with the pack resistance. At a measured 4 mΩ/cell (EST, typical of a 100C 6,500 mAh pack) the rise is 15.5 K (50 °C at touchdown). On a 20 °C day with the limit pack: 49 °C.

The flight-controller lump reaches 97 °C with all 3.5 W of avionics power dissipated in the 52 × 32 × 17 mm block under a sealed canopy (h 5, no radiation): a conservative stack of estimates — the F405 board itself draws ~0.5–1 W EST, the GPS, receiver, Remote ID and UBEC are elsewhere, and radiation (≈ 7 W/m²K equivalent at ε 0.9) would more than double the heat loss. It still says the avionics bay must not be sealed; see §6.4.

### 6.3 Pusher (X4110S) in the PA6-CF cup (cruise)

Steady cruise 92 °C can / 92 °C cup floor / 88 °C cup wall / 62 °C foam tail ring; from 35 °C the can is at 43 / 55 / 67 / 77 / 84 °C after 20 / 60 / 120 / 200 / 300 s of cruise and **91 °C after 600 s** (τ ≈ 130 s for the 165 g can, so cruise is quasi-steady after 5 min; `pusher_cruise.png`, `pusher_cruise_history.json`). The cup is 81 K under its HDT and the foam ring 12 K under the XPS maximum-use temperature (74 °C). The can exceeds the 80 °C EST limit by 11 K.

What sets this number: the loss, 38 W = 337.4 W × (1 − 0.85) × 0.75, is an estimate stacked on an estimate (η_mec 0.85 is the sizing assumption for motor + ESC; the 75 % share is EST). The lift units run the same motor at 229 W input with the sizing's 20 % rule; the pusher at 337 W input is 10 % above the hover current, so a loss in the 25–40 W range is plausible and the model is not obviously pessimistic. The film coefficient is not the lever: the FEA applies the free-stream value (97.5 W/m²K) to every exposed face of the can, including the faces inside the cup annulus (only the cup's own inner wall gets half), so no venting of the cup can lower the predicted temperature — it can only make the model's assumption true. Rotor-bell self-pumping and radiation are the two unmodelled effects that help (radiation alone ≈ 7 W/m²K on the 0.0066 m², about 7 % more cooling). At a 20 W loss the steady rise would be 31 K → 66 °C.

### 6.4 Recommendations

1. **Battery bay ventilation (design change, R10/R9 relevant).** Add a ram-air inlet at the nose and an exit slot at the rear of the battery bay (two openings of ~15 × 30 mm EST, through the foam, skinned with the tape covering) so cruise air sweeps the pack. With even 20 W/m²K on the 0.037 m² pack surface (0.74 W/K; pack m c_p 902 J/K, τ ≈ 1,200 s) the 10 K accumulated by the end of the first transition decays by 40 % during the 600 s cruise and the cruise-phase heating (10 W) holds at 14 K instead of 7.6 K of rise, so touchdown is about 56 °C with the limit pack *(calc, EST)*; with a 4 mΩ/cell pack about 47 °C. Keep the C11 IR check and record the actual resistance.
2. **Tighten the pack acceptance.** C11 passes at ≤ 7.5 mΩ/cell; at that limit the hot-day mission fails the 60 °C rule even before any sun load. Record the measured value and treat > 5 mΩ/cell as a hot-day no-go (rise > 20 K, touchdown > 55 °C from 35 °C). Shade the packs before flight: the rise is added to whatever temperature the pack starts at.
3. **Keep the hover limits and the IR checks; measure the loss.** The ≤ 60 s per hover rule (test plan rule 3) leaves 17 K on the can and 14 K on the ESC; the mission's 80 s hover + transition leaves 2 K and 4 K on a 35 °C day with the 20 % loss estimate. C08 must replace the estimate (fit τ and the 90 s rise); if the can is > 70 °C after 90 s on the bench, limit hot-day (> 30 °C) missions to a 45 s take-off hover and abort at 80 °C as the test plan already says.
4. **ESC placement.** The model gives the ESC the full prop-wash film (43 W/m²K) although it sits on the boom underside, in the boom's wake; move it to the boom side or top face ahead of the mount (J15), heat-shrink side to the flow, and keep the 3 mm foam pad (it isolates the ESC from the warm mount, not from the boom, which stays at ambient). An ESC loss of 2 % instead of 4 % halves its rise (mission peak 50 °C).
5. **Vent the avionics bay** (two 8 mm holes in the canopy, forward-facing and aft EST) and mount the FC on 5 mm standoffs; measure the FC current-sensor board in G03 as the test plan already requires (≤ 60 °C).
6. **Pusher: measure first, then decide the cup.** The cup (Ø55.6 × 30) sits entirely inside the Ø56 × 30 tail-ring bore (`cad/mesh/meta.json` Pusher_Cup), so slots in its wall would open into foam, not air; they only work together with matching radial channels through the tail ring to the skin (four Ø10 mm EST, cup wall → foam → outer skin at the boat-tail), and even then they would only realise the free-stream film the model already assumes. So: (a) G03 tied-down run at cruise throttle (14.6–16 A) for 3 min with the IR thermometer on the can every 30 s, and the IR check after F08's 2 × 60 s cruise legs; model predictions to compare against: 55 °C after 60 s, 67 °C after 120 s, 84 °C after 300 s from a 35 °C start (subtract 15 K on a 20 °C day). (b) If the measured can tracks the model (> 65 °C after a 120 s leg on a standard day, i.e. the 38 W loss is real), the loss, not the cup, must come down: check the pusher prop/throttle match (the X4110S at 337 W is 10 % above its hover input) and the ESC timing, and fit an aluminium spider floor (3 mm, four arms to the skin EST) as a conducting path — the PA6-CF floor at k 0.35 W/mK carries < 1 W today. (c) If the measured can stays ≤ 60 °C after 120 s, the loss is ≤ 25 W EST and no change is needed; the cup stays closed. In all cases the XPS tail ring (62 °C bound vs 74 °C max use) and the PA6-CF cup (92 °C vs HDT 173 °C) are not the limiting parts.
7. **Materials confirmed:** PA6-CF for the four motor mounts and the pusher cup (76 °C mission peak / 169 °C hover bound vs HDT 173 °C); PETG only where the model shows ambient (boom clamps, trays, fin shoes). A PETG motor mount would pass its HDT at 72 s of hover.

## 7. Outputs for the review page

`analysis/thermal/thermal_results.json` (compact, < 1 MB):

```
generated, tool, ambient_C {hot, standard, note}
inputs_summary {results_json, loads_W{}, h_W_m2K{}, v_i_mps, mission[{name, dt_s}], limits_C{}}
validation {val_*}                      # motor-only checks of section 5
results {<key>: value}                  # every line of cad/sim/thermal/results.txt
findings [{component, case, peak_C, peak_std_C, limit_C, limit_src, margin_K, status, note}]
histories {lift_unit_mission, pod_mission, pusher_cruise, lift_unit_hover}   # {body: {t[], T[]}} max-in-body vs time, s / °C
images [paths]                          # analysis/thermal/img/*.png
fields {lift_unit{steady_hover, hover_90s, end_hover5}, pod{end_hover5}, pusher{end_cruise}}
       # each: vertices [x,y,z,...] m in the study frame, temps_C per vertex, tris 0-based, cell_m
```

Study frames: lift unit — boom axis X, up Y, motor at the origin on top of the mount; pod — pod axis X (nose +X), up Y, pod local = global − (0.45, yPod, 0); pusher — cup axis X. `status` is pass (margin ≥ 10 K), at risk (0–10 K) or fail (< 0).

## 8. Limitations

1. **Loss fractions are estimates.** Lift motor 20 % of input (the `params.mjs` rule; the bench C08 run replaces it), ESC 4 %, pusher 15 % × 75 %: none is from a datasheet (SunnySky and SoloGood publish none, "—"). Every lift-unit rise scales linearly with them.
2. **Film coefficients are textbook correlations, not CFD.** Prop wash at the disc value v_i (not the 2 v_i far wake), no rotor-bell self-pumping, no boom wake on the ESC, and the pusher in axial flow modelled as a flat plate. Radiation is left out everywhere (ε 0.9 would add ~7 W/m²K to the exposed surfaces, i.e. 15 % more cooling on the motors and more than double on the FC in its bay). Both choices are conservative for every component except the ESC (see §6.4 item 4).
3. **Lumped motor.** The can is one isotropic body (k 30, c_p 470 J/kgK, 165 g) with uniform volumetric heat; winding and magnet temperatures are not resolved, and the test-plan limits are can-surface values measured by IR. The c_p band 385–500 J/kgK moves the 90 s value by about ±4 K (`cad/README.md`).
4. **Geometry simplified.** Cylindrical pod of fusR without the nose ellipse and boat-tail; the printed battery and FC trays are omitted (3 mm PETG between pack and foam adds insulation, already effectively adiabatic); the mount's 1.2 mm split gap and the motor's Ø25 bolt circle are not modelled (uniform contact over the Ø48 floor is optimistic for the mount, pessimistic for the motor); the boom is 0.40 m long with ambient convection at both ends; the ESC size is an estimate.
5. **Bay air at ambient.** The battery and FC faces that see bay air convect to 35 °C air at 5 W/m²K; in a sealed bay the air warms, so those faces are optimistic by up to the full 5 W/m²K (small for the pack, significant for the FC lump).
6. **Chained transients with constant loads per phase.** The API rejects time curves, so the 20 s transitions are rectangular pulses at P_trans; the hover–cruise handovers are instantaneous; cruise cooling of the lift unit uses the 20 m/s film from t = 80 s.
7. **Ambient.** 35 °C hot day is `params.mjs` thermAmbK, not a numbered requirement; solar load on a black pack or motor on the ground before take-off is not included (add it to the start temperature: the IR check before flight).
8. **Not measured yet.** C08 (motor/ESC heat), C11 (pack resistance and temperature), G03/G04 (FC, connectors), F03 (3 × 60 s hovers), F08 (pusher after cruise legs) in `docs/test/TEST-PLAN.md` are the measurements that close every estimate above.

**API notes for the next run** (`cad/Thermal.cs`): the library material "6061-T6 (SS)" raises a modal "Plasticity – von Mises … switching to Linear Elastic" dialog in thermal studies that blocks the API — use a custom material with the library's k / c_p / ρ instead; a body takes the name of the last feature that modifies it, so the last cut on the foam is named `Foam`; `FeatureExtrusion3` direction/offset flags are probed by checking the resulting body box (`Ext`), cuts by the removed volume and the centroid shift (`CutRange`); study names must not contain commas or periods; the solver runs as a separate `hstar` process, so the pod chain took ~50 min while five SU2 jobs shared the cores.
