# Aerodynamics: section polars, whole-aircraft VLM, drag build-up and 2-D RANS CFD (C0, v0.3.1 analysis, updated for v0.4)

Baseline: concept C0, 4-lift twin-boom quadplane, NACA 2415 XPS wing (span 2.4 m, chord
0.2387 m, S 0.5728 m², AR 10.06), NACA 0009 H-tail and fins on the boom tops, 0.85 × 0.16 m
pod, stopped 17 in lift rotors, 14 in pusher. MTOW 6.182 kg, W/S 105.8 N/m² (analysis/results.json
v0.3.1). All runs are reproducible from `analysis/aero/run_all.py`; every number below is in
`analysis/aero/aero_results.json` or the `analysis/aero/out/*.json` it is built from.

Verdict first:

| Sizing assumption (sizing.mjs / model.js) | This package | Status |
|---|---|---|
| CL_max 1.2 → Vs 12.0 m/s (R11 ≤ 12) | 2-D CL_max 1.30 (exp. Re 2e5; XFOIL 1.36, NeuralFoil 1.28); 3-D trimmed **1.13** → **Vs 12.4 m/s** | **R11 at risk** (3 % over) |
| CD0 total 0.059 (clean 0.030 + rotors/booms) | **0.081** (clean airframe 0.059, of which round gear legs 0.036; rotors + booms 0.021) | **fails** |
| L/D cruise 6.5, P_cruise 365 W, 11.9 min cruise | **L/D 5.0, 479 W, 9.1 min** at 20 m/s | **R10 (≥ 10 min) fails** |
| same, with faired gear legs (EST Cd 0.1) | L/D 8.0, 299 W, 14.6 min | R10 met |
| Oswald e 0.80 | 0.835 (fit; inviscid 0.927 AVL) | holds |
| Neutral point 46.7 % MAC, SM 18.7 % at the 28 % CG | NP **41.1 %** with the pod (47.3 % without); SM **13.1 %** at 28 %, **5.2 %** at the no-payload CG (36 %) | holds at 28 %; **no-payload case at risk** |
| Cruise trim | α 3.2°, elevator −3.8° (AVL); at 12 m/s: α 11.7°, elevator −9.4° | holds |

## Design v0.4 update (2026-10-25)

Sections 3 to 9 record the analysis of the v0.3.1 geometry (chord 239 mm, bare round landing legs), which drove the redesign: printed teardrop fairings on the legs, the wing sized on the trimmed CL_max, the pod's neutral-point shift added to the sizing, and a ballast rule when flying without payload. Every script was then re-run on the v0.4 geometry. On 2026-10-25 the sizing was changed to read CL_max, boom and rotor drag areas and the pod neutral-point shift from `analysis/aero/aero_results.json` instead of hand-copied values, and the sizing → aero loop was iterated to convergence (CL_max 1.132 → 1.122 → 1.121), which closed R11. `analysis/aero/aero_results.json` holds the current values, and the review reads them from there:

| Quantity | v0.4 value |
|---|---|
| Wing | S 0.682 m², chord 284.2 mm, AR 8.45, MTOW 6.552 kg |
| Cruise Reynolds number | 3.89×10⁵ |
| CL_max, aircraft trimmed | 1.114 (section 1.30 adopted from wind-tunnel data) |
| Stall speed at MTOW | 11.75 m/s (design target 11.75, results.json base.Vs; R11: ≤ 12, margin 2.1 %) |
| CD0, with faired legs | 0.0400 |
| Cruise L/D at 20 m/s | 8.35 |
| Cruise electrical power | 302 W (sizing design value 337 W) |
| Cruise available | 13.7 min (sizing 12.3 min); bare round legs 8.6 min |
| Neutral point, AVL with pod | 39.8 % MAC; static margin 11.8 % at the 28 % CG, 5.1 % with the bay empty |
| CFD | §6 and §11, re-run 2026-10-25 on the final chord (284 mm, Re 3.89×10⁵): all 29 SU2 cases usable, 23 converged, three-mesh GCI now defined; SU2 is a cross-check and feeds no sizing number (CL_max and stall above unchanged by the re-run) |

Rows generated from `analysis/aero/aero_results.json` (generated 2026-10-25) and `analysis/results.json` `base.Vs`. The 2026-10-25 iteration re-sized the wing to the 11.75 m/s design stall target (`docs/research/stall-margin.md`), which gives 2.1 % margin to the R11 limit of 12 m/s.

## 1. Tools and versions (all checked 2026-10-21)

| Tool | Version | Source | Used for |
|---|---|---|---|
| XFOIL | 6.99 Windows binary | https://web.mit.edu/drela/Public/web/xfoil/XFOIL6.99.zip | section polars, Cp (transitional e^N, Ncrit 9 and 5) |
| NeuralFoil / AeroSandbox | 0.3.3 / 4.2.10 (PyPI) | https://github.com/peterdsharpe/NeuralFoil, https://github.com/peterdsharpe/AeroSandbox | polar cross-check through stall; VLM and AeroBuildup cross-check |
| AVL | 3.52 Windows binary | https://web.mit.edu/drela/Public/web/avl/avl352.exe | whole-aircraft VLM + slender body: lift curve, NP, derivatives, trim, span loading |
| SU2 | 8.5.0 win64-omp | https://github.com/su2code/SU2/releases/download/v8.5.0/SU2-v8.5.0-win64-omp.zip | 2-D incompressible RANS (SA; SST + LM transition) |
| gmsh | 4.15.2 (PyPI) | https://pypi.org/project/gmsh/ | unstructured hybrid meshes (quad boundary layer + triangles) |
| numpy / scipy / matplotlib | 2.5.4 / 1.18.1 / 3.11.2 (PyPI) | | post-processing, plots |

Tools live in `C:\Users\dillo\tools\` (outside the repo). SOLIDWORKS Flow Simulation was not used
(add-in does not load on this licence). No WSL/OpenFOAM on this machine (`wsl -l -v`: not installed).

Scripts (`analysis/aero/`): `common.py` (geometry and conditions read from results.json and
cad/params.txt), `xfoil_polars.py`, `neuralfoil_polars.py`, `avl_run.py`, `asb_model.py`,
`mesh_2d.py`, `su2_2d.py`, `drag_buildup.py`, `plots.py`, `assemble_results.py`, `run_all.py`.
Meshes and solver volume files are git-ignored (`analysis/aero/.gitignore`); `mesh_2d.py` regenerates
them in about a minute.

## 2. Flight conditions

ISA sea level, ρ 1.225 kg/m³ (results.json base.rho), μ 1.789e-5 Pa s. Re = ρ V c / μ.

| Case | V (m/s) | Wing Re (c 0.2387 m) | Mach | Tail Re (c 0.0756 m) |
|---|---|---|---|---|
| stall (R11) | 12 | 1.96e5 | 0.035 | 6.2e4 |
| transition (AIRSPEED_MIN) | 16 | 2.61e5 | 0.047 | — |
| cruise (R11 mid) | 20 | 3.27e5 | 0.059 | 1.04e5 |

Cruise CL = 2W/(ρ V² S) = 0.432 (model.js F5).

## 3. Section polars (XFOIL, NeuralFoil) and validation

`analysis/aero/out/xfoil_polars.json`, `neuralfoil_polars.json`; plot `plots/section_polars.png`,
`plots/tail_section_polars.png`. XFOIL: 240 panels, 200 iterations, ±sweeps from α 0 in 0.5° steps.

| Case | Re | Ncrit | CL_max (α) XFOIL | CL_max (α) NeuralFoil | CLα /rad | α0L | Cm c/4 | Cd min |
|---|---|---|---|---|---|---|---|---|
| NACA 2415 stall | 1.96e5 | 9 | 1.362 (18.0°) | 1.282 (17.0°) | 6.89 | −2.11° | −0.057 | 0.0109 |
| NACA 2415 transition | 2.61e5 | 9 | 1.361 (18.5°) | 1.274 (18.0°) | 6.87 | −2.05° | −0.055 | 0.0094 |
| NACA 2415 cruise | 3.27e5 | 9 | 1.360 (18.5°) | 1.275 (17.5°) | 6.84 | −2.02° | −0.054 | 0.0086 |
| NACA 2415 cruise, dirty | 3.27e5 | 5 | 1.360 (15.0°) | 1.278 (16.0°) | 6.45 | −2.04° | −0.049 | 0.0093 |
| NACA 2415, high Re check | 3.0e6 | 9 | 1.739 (18.5°) | — | 6.36 | −2.20° | −0.051 | 0.0058 |
| NACA 0009 tail stall | 6.2e4 | 9 | 0.779 (8.0°) | 0.765 (8.0°) | 5.96 | −0.2° | −0.002 | 0.0148 |
| NACA 0009 tail cruise | 1.04e5 | 9 | 0.827 (8.5°) | 0.802 (8.0°) | 6.48 | −0.1° | −0.002 | 0.0119 |

Published data at the relevant Re: Genç, Lock and Kaynak (AIAA ATIO 2008, abstract at
https://avesis.erciyes.edu.tr/yayin/0e967406-3720-4460-b125-1dec2b27685c, checked 2026-10-21)
measured a NACA 2415 at Re 2e5 with **CL_max 1.3 at a 12° stall**; Genç, Karasu and Açıkel
(Exp. Thermal Fluid Sci. 39 (2012) 252–264, DOI 10.1016/j.expthermflusci.2012.01.029, abstract
only read) report mild stall at the upper end of Re 0.5–3e5 and abrupt stall at the lower end.
XFOIL's 1.36 is 5 % above the experiment and NeuralFoil's 1.28 is 1.5 % below; both over-predict
the stall angle (XFOIL 18° vs 12°), which is the usual e^N behaviour on a thick cambered section
with a separation bubble. **Adopted 2-D CL_max = 1.30** (experiment). The NACA Report 824 values at
Re 3e6 were not retrieved online on 2026-10-21 (—); the Re 3e6 XFOIL case is only a self-check
that the panelling and Ncrit are sane (XFOIL is known to over-predict CL_max at high Re).

Ncrit 5 (taped XPS skin, outdoor turbulence) does not change CL_max but brings the stall angle
down to 15° and raises the drag at cruise CL by 1 % (0.00880 vs 0.00875 on S_ref). The low-Re tail
(Re 6e4–1e5) stalls at only 8–8.5° with CL_max 0.78–0.83: the elevator authority margin at 12 m/s
(see §5) must respect this.

## 4. Whole-aircraft VLM (AVL) and comparison with the repo VLM

`analysis/aero/out/avl_results.json`, model file `out/avl/c0_pod.avl`. Wing 16 × 30 panels per
half, tail 10 × 16, fins 8 × 10, pod as an AVL BODY from the CAD revolve profile; section CDCL
polars from XFOIL (wing at Re 3.27e5, tail at 1.04e5). Reference point: CG at 28 % MAC
(x = −0.0668 m), Z_ref 0 (CG height is not in results.json; EST).

| Quantity | AVL with pod | AVL no pod | repo vlm.mjs (aero.json) | sizing.mjs | AeroSandbox VLM (no pod) |
|---|---|---|---|---|---|
| CLα aircraft /rad | 5.48 | 5.23 | 5.33 | 5.16 (Helmbold wing) | 5.39 |
| Cmα /rad about 28 % | −0.72 | −1.00 | — | — | −1.15 |
| Neutral point % MAC | **41.1** | 47.3 | 47.6 | 46.7 | 49.4 |
| Static margin at 28 % CG | 13.1 % | 19.3 % | 19.6 % | 18.7 % | 21.4 % |
| Span efficiency e (inviscid) | 0.927 | 0.940 | 0.974 (wing alone) | 0.80 (Oswald, EST) | — |
| Trim at CL 0.432 | α 3.16°, elevator −3.75° | α 3.14°, −4.11° | — | — | — |
| Cm at CL 0.432, elevator 0 | −0.069 | | | | |

Without the pod AVL reproduces the repo VLM and sizing neutral point within 1 % MAC, so the repo
model is consistent. **The pod moves the neutral point forward by 6.2 % MAC** (slender-body
destabilising moment, Munk; the 0.85 m pod with its nose 0.45 m ahead of the LE sits mostly ahead
of the CG), which the sizing and vlm.mjs both note they omit. Static margin by CG case
(results.json cg): 28 % target 13.1 %; battery +30 mm forward 14.8 %; −30 mm aft 11.5 %;
**no-payload CG 36.0 % → 5.2 %**. Raymer (5th ed. §16.4) suggests 5–10 % for a conventional
aircraft; ArduPilot will fly 5 %, but gust response and the tail stall at 8° make the no-payload
case marginal. Tail volumes V_h 0.35, V_v 0.030 (results.json) are at the low end of Raymer
table 6.4 (homebuilt 0.50/0.04, sailplane 0.50/0.02).

Stability derivatives at cruise trim (AVL, per rad, body axes, Xref 28 % MAC):
CLα 5.49, Cmα −0.72, CLq 8.17, Cmq −11.6, CYβ −0.198, Clβ −0.0097, Cnβ 0.0385, Clp −0.579,
Clr 0.120, Cnp −0.033, Cnr −0.048; spiral parameter Clβ Cnr/(Clr Cnβ) = 0.10 (< 1: spiral mode
divergent, slow; normal for a low-dihedral, twin-fin layout; the autopilot holds it). Cnβ 0.0385
is adequate (Raymer typical 0.04–0.08 per rad is not quoted here; Nelson, Flight Stability and
Automatic Control, table 2.1 lists 0.05–0.1 for light aircraft; EST that 0.0385 is on the low side
and the fins should not be reduced).

Control derivatives (v0.4 geometry, cruise trim with pod, `out/avl_results.json` `pod.derivatives_trim`, AVL 3.52
names d01 aileron, d02 elevator, d03 rudder; per degree, stability axes): CLδe 0.00739, Cmδe −0.0184; Clδa −0.00672,
Cnδa +0.00029 (adverse: roll left, nose right); CYδr −0.00212, Cnδr **+0.00074**, Clδr −0.00006. Fix 2026-10-25: the twin-fin rudder
used SgnDup +1 on the Y-duplicated fin, which AVL applies to the mirrored hinge vector, so the two rudders toed in
(CLδr +0.00029, Cmδr −0.00068, Cnδr 0); `avl_run.py` now uses SgnDup −1 and the parser reads the d01–d03 names.
Positive rudder (right-hand rule about the upward hinge, trailing edge to the right) gives side force to the left
and nose-right yaw. Check by thin-airfoil theory (EST): Cnδr ≈ (S_v/S)(l_v/b) a_v τ = (0.0637/0.682)(0.776/2.4)
× 1.80 /rad (Helmbold, AR_v 1.25) × 0.661 (30 % flap) = 0.036 /rad = 0.00063 /deg; AVL's 0.00074 is 17 % higher
(end-plating of the fins by the boom and H-tail is not in the estimate). Trim, neutral point and static margin
are unchanged by the fix (the rudder is zero in the symmetric trims).

Span loading (`plots/span_loading.png`): the rectangular wing peaks at 2y/b ≈ 0.2 with
max cl / CL = 1.148 at trim, so the critical section (first to reach the 2-D CL_max) is inboard,
which gives benign root-first stall but costs 13 % of CL_max compared with an elliptic wing.

## 5. CL_max, stall speed and elevator at stall

3-D CL_max (trimmed, tail download included): critical-section method on the AVL loading,
CL_max,3D = 1.30 / 1.148 = **1.13**; Raymer eq. 12.15 (0.9 × 2-D for an unswept high-AR wing) gives
1.17; AeroSandbox AeroBuildup (NeuralFoil sections, untrimmed, elevator 0) gives 1.33 at 17°. Adopted
**1.13** (the lower of the two trimmed estimates).

Stall speed at the sized wing loading: Vs = sqrt(2 W / (ρ S CL_max)) = **12.36 m/s** vs the R11
limit of 12.0 (sizing used 1.2 → 12.0 exactly). 1.3 Vs = 16.1 m/s, i.e. the transition AIRSPEED_MIN
of 16 m/s (DESIGN-BASIS R11) no longer carries any margin. AVL trim at CL 1.20 (12 m/s): α 11.7°,
elevator −9.4°; the tail section at Re 6e4 stalls at about 8° of local incidence, so the elevator
is within authority but with modest margin (the trim at CL 1.13 is ~−8.5°, EST by interpolation).

## 6. 2-D RANS CFD (SU2) — mesh study and validation

See §6 details below (filled from `out/su2_2d.json`; `plots/su2_mesh_study.png`,
`plots/su2_convergence.png`, `plots/cp_distributions.png`).

**Status 2026-10-25, design v0.4 final wing (chord 284.2 mm, Re 3.89×10⁵): complete, all three meshes converged.** Set-up: incompressible RANS (SU2 INC_RANS, FDS + MUSCL, Venkatakrishnan limiter, adaptive CFL), SA fully turbulent, SST + Langtry–Menter transition as a sensitivity set, gmsh hybrid meshes with a quad boundary layer: L1 55,384 cells, L2 130,792, L3 267,902 (`out/mesh_2d.json`). The meshes are in chord units and Re enters through the viscosity, so they were not regenerated; first-cell y⁺ ≈ (h₁/c) Re √(Cf/2) with Cf 0.0045 gives 1.85 / 0.92 / 0.46 on L1 / L2 / L3 at Re 3.89×10⁵ (`mesh_2d.py` docstring). Medium-mesh numerics (all L2 cases, `su2_2d.numerics`): CFL 1 adaptive to 20, limiter never frozen, 6,000 iterations; L1 and L3 keep CFL 2 → 50 with the limiter frozen after 300 iterations. The 2026-10-23 matrix at the 263 mm chord (Re 3.60×10⁵) left 13 of 29 cases unusable, including both L2 mesh-study points; with the L2 numerics above every case converged or stayed usable on its first attempt, so no safe-numerics retry ran.

| Case | CL | CD | Status |
|---|---|---|---|
| L1 SA α 10° | 1.047 | 0.0440 | converged |
| L2 SA α 10° | 1.121 | 0.0327 | converged |
| L3 SA α 10° | 1.172 | 0.0278 | converged |
| L1 SA α 2° | 0.403 | 0.0160 | usable, force history not steady (4,000 iterations) |
| L2 SA α 2° | 0.407 | 0.0151 | converged |
| L3 SA α 2° | 0.414 | 0.0147 | converged |
| L2 SST-LM α 10° / 2° | 1.066 / 0.458 | 0.0327 / 0.0115 | converged |
| XFOIL (Ncrit 9, Re 3.89×10⁵), α 10° / 2° | 1.207 / 0.447 | 0.0182 / 0.0088 | transitional |

Source: `out/su2_2d.json` `mesh_study`, `polar_L2_SSTLM`; XFOIL from `aero_results.json` `section_polars.n2415_cruise_ncrit9.table`.

**Mesh study.** L2 → L3 changes lift by 1.5 % at 2° and 4.4 % at 10°, drag by 3.2 % and 17.7 %; L1 → L3 by 2.6 % / 10.7 % in lift. Grid convergence index (Celik et al. 2008, r = √2, Fs 1.25) on the fine mesh: CL 6.0 % at 2° (observed order p 0.77, extrapolated 0.434) and 12.5 % at 10° (p 1.05, extrapolated 1.290); CD 4.8 % at 2° (p 1.73, 0.0141) and 16.7 % at 10° (p 2.43, 0.0240). The observed orders below 2 and the non-uniform refinement (surface ×√2, wall-normal ×2 per level) make the GCI indicative only (EST): the fine mesh is not mesh-independent at 10°, where lift is still rising and drag falling with refinement.

**Validation.** On L3, SA lift is 2.9 % below XFOIL at 10° and 7.4 % below at 2°, and SA drag is 1.5–1.7 times XFOIL's (0.0147 vs 0.0088 at 2°): the signature of a fully turbulent model at a Reynolds number where the real boundary layer stays laminar over much of the chord. The SST-LM transition model on L2 brings the 2° point to within 2.6 % of XFOIL in lift and to 0.0115 in drag. Section CL_max: SA on L2, converged points only, **1.210 at 13°** (falling to 1.073 at 16°); SST-LM 1.066 at 10° (12° is 1.068 but not steady); XFOIL 1.363 at 16.5°, Genç, Lock and Kaynak (2008) 1.30 at 12° (`aero_results.json` `CL_max_2D`). The RANS CL_max sits 7 % below the adopted tunnel value, the expected low bias of steady RANS near stall at low Re.

**Convergence.** All 29 cases usable (finite forces, falling pressure residual, CD > 0, |CL| ≤ 2.5); 23 have a steady force history over the last 300 iterations. Not steady: L1 SA 2°, L2 SA 17°, 18° and 20° (post-stall; 20° reads CL 1.156 with CD 0.287, an unsteady mean, not a lift recovery), and L2 SST-LM 12° and 16°. The L2 SA sweep is now converged at every angle from −4° to 16° (13 of 16 points; 3 of 16 before). **Conclusion for the design:** the section CL_max and drag used in the sizing rest on XFOIL, NeuralFoil and the wind-tunnel data; the CFD agrees with them within about 3–7 % in lift below stall and is a cross-check, not a source. `aero_results.json` `CL_max_3D.adopted` (1.114) and the 11.75 m/s stall speed are unchanged by the re-run. The SU2 fully turbulent wing profile drag estimate at cruise (`drag.wing_profile_estimates.su2_SA_fully_turbulent`) is 0.0140 on S_ref against XFOIL's 0.0079 used in the build-up.

Wall-clock (`out/su2_2d.json` per-case `wall_s`, 4 threads per case, 5 cases sharing 20 logical CPUs while a SOLIDWORKS job also ran): L1 10–13 min, L2 SA 24–42 min, L2 SST-LM 36–50 min, L3 37–40 min per case; 230 min for the full matrix.

Flow-field pictures of these cases (0° to 15°, fine mesh) and 3-D streamlines over the aircraft: §11.

## 7. Drag build-up at cruise

`analysis/aero/out/drag_buildup.json`; `plots/drag_breakdown.png`, `plots/drag_pie.png`,
`plots/aircraft_polar.png`. q = 245 Pa, S_ref 0.5728 m². Method: Raymer 5th ed. ch. 12.5 (Cf
eq. 12.27, wing FF eq. 12.30, body FF eq. 12.31, wetted areas eq. 7.12) for streamlined parts;
Hoerner, *Fluid-Dynamic Drag* (1965) ch. III (cylinders), V (protuberances), VIII (junctions) for
bluff parts; XFOIL section drag for the wing and tail. Items tagged EST are engineering estimates
of frontal areas of printed parts that are not dimensioned in cad/params.txt.

| Component | ΔCD0 | Basis |
|---|---|---|
| **Landing legs (4), round 25.4 mm × 205 mm tubes in cross-flow** | **0.0364** | Hoerner ch. III: 2-D Cd 1.2 at subcritical Re 3.5e4 × 0.8 finite-length (L/D 8) = 1.0 |
| Wing profile (XFOIL, Ncrit 9, exposed span, section cl = 0.43) | 0.0088 | out/xfoil_n2415_cruise_ncrit9.txt (Raymer fully-turbulent FF method: 0.0116) |
| Lift motors (4), stopped, 48 × 32 mm cylinders in cross-flow | 0.0068 | Hoerner ch. III short cylinder Cd 0.63 |
| Lift props (4), stopped at random azimuth | 0.0054 | EST Cd 0.06 on blade planform (pitch angle 7.8° at 0.75 R for 17×5.5) |
| Boom and gear clamps (8) | 0.0040 | EST Cd 0.8 on 30 × 12 mm each beyond the boom |
| Leakage, hinges, horns, wires | 0.0038 | Raymer §12.5.6: 5 % of the rest (EST, taped foam build) |
| Pod (body of revolution, Swet 0.37 m², f 5.3) | 0.0038 | Raymer FF 1.41, Cf at Re 1.16e6 |
| Motor mounts (4) | 0.0034 | EST Cd 0.8 on 50 × 12 mm |
| Feet (4) | 0.0025 | EST Cd 0.8 on 30 × 15 mm |
| Booms (2), 1.47 m axial cylinders | 0.0018 | Raymer Cf × FF 1.145 × Swet 0.117 m² each |
| H-tail (XFOIL NACA 0009, Re 1.0e5) | 0.0014 | out/xfoil_n0009_tail_cruise_ncrit9.txt |
| Fins (2) | 0.0012 | Raymer FF, Q 1.05 |
| Canopy blister, wing-pod junctions, pitot | 0.0015 | Hoerner (EST) |
| **Total CD0** | **0.0806** | sizing: 0.0590 |

By group: wing 0.0088, tail 0.0026, pod 0.0051, booms 0.0058, rotors 0.0155, gear 0.0389,
misc 0.0040. Against the sizing inputs: clean airframe (wing + tail + pod + gear + misc)
**0.059 vs 0.030 assumed** — the whole excess is the bare round gear legs; the clean airframe
without gear is 0.020 (better than assumed). Per boom incl. clamps 1.7e-3 m² vs 1.5e-3 assumed
(holds); per stopped rotor unit (motor + mount + prop) 2.2e-3 m² vs 3.4e-3 assumed (conservative in
the sizing, but the prop term is a rough EST — see M3).

Trimmed polar: CD = CD0,fixed + Cd,wing(CL) (XFOIL) + CL²/(π AR e_inv) with e_inv 0.927 from AVL;
a parabola fit over CL 0.2–0.9 returns **Oswald e = 0.835** (sizing 0.80 holds) and K 0.0379. At
cruise CL 0.432: **CD 0.0870, L/D 4.96**, D 12.2 N, P_elec = D V/(0.60 × 0.85) = **479 W** (sizing
365 W, +31 %). L/D_max 8.7 at CL 1.15, i.e. at 12.3 m/s — essentially the stall speed, which means
the aircraft is flown far above its best L/D speed and the drag is dominated by parasite drag.
With streamlined gear legs (Hoerner ch. VI strut fairing, Cd ≈ 0.1 on frontal, EST): CD 0.0515, L/D 7.96, 299 W.

Wing profile drag, three ways (ΔCD on S_ref at section cl 0.43): XFOIL transitional 0.0088,
Raymer fully-turbulent 0.0116, SU2 SA fully-turbulent see §6. The transitional value is used
because the taped XPS skin is smooth; if the skin is rough (tape ridges, dents) the turbulent
value applies (+0.003 CD, +4 % cruise power).

## 8. Mission implication (model.js F7–F9 with the new drag)

Hover power and the pack are unchanged (832 W, Ovonic 6S 6500, 144.3 Wh; results.json). Cruise
time available after 2 min hover + 40 s transitions and the 20 % reserve:

| Case | P_cruise (W) | I_cruise (A) | Cruise available (min) | R10 ≥ 10 min | Sizing margin ≥ 11.5 min |
|---|---|---|---|---|---|
| sizing.mjs (CD0 0.059, e 0.80) | 365 | 16.5 | 11.9 | met | met |
| this build-up, round gear legs | **479** | 21.6 | **9.1** | **fails** | fails |
| this build-up, faired gear legs (EST) | 299 | 13.5 | 14.6 | met | met |

Flying at 18 m/s instead of 20 (R11 lower bound) with round legs: CL 0.533, CD 0.0908,
P = 0.5 ρ V³ S CD /(0.60 × 0.85) = 364 W → 12.0 min (calc, same formula): R10 met, but only
0.5 min above the 11.5 min design margin and the drag-count is itself ±20 % (EST items). At 22 m/s:
620 W, 7.0 min. Fairing the legs is the cheapest fix (balsa or printed PETG teardrop sleeves; no
BOM line yet, EST < $10). The 10 min floor corresponds to ≤ 436 W electrical cruise power.

## 9. Implications for the design

1. **CD0 does not hold.** 0.081 vs 0.059. The bare 1 in round gear legs are 45 % of the
   total drag (ΔCD 0.036); the sizing's "clean airframe incl. gear 0.030" implicitly assumed
   faired or absent gear. Action: add teardrop fairings to the four legs (or retractable/
   removable legs) and carry CD0 ≈ 0.052–0.055 in sizing.mjs; re-check the pusher at 20 m/s
   (APC 14×8.5 at 479 W electrical is near the X4110S continuous rating, —, not on the page read).
2. **R10 endurance fails with round legs** (9.1 min < 10); met with fairings (14.6 min).
3. **Stall speed 12.4 m/s vs R11 ≤ 12.** CL_max,3D 1.13 (sizing 1.2). Options: accept 12.4 (R11 is
   an assumed value), add 5 % wing area (chord 0.251 m → Vs 12.0 at the same CL_max), or allow 2°
   of washout-free aileron droop (not modelled). Transition AIRSPEED_MIN 16 m/s equals 1.3 Vs
   exactly; set AIRSPEED_MIN to 17 m/s if R11 is kept.
4. **Static margin holds at the 28 % CG (13 %) but the pod cuts it from the 18.7 % the sizing
   expected; the no-payload CG (36 % MAC) leaves 5 %.** Action: keep the payload allowance mass
   or a ballast at the bay when no payload flies; do not move the battery aft of the sized station;
   update sizing.mjs `hn` with a pod term (ΔNP −6 % MAC) so the CG target can move to ~25 % if desired.
5. **Oswald e 0.835 holds** (sizing 0.80 slightly conservative).
6. **Cruise power** 479 W → I 21.6 A continuous from the 6S pack (sizing 16.5 A); within the 60 A
   assumed pack limit but changes the cruise motor thermal case (pusher at 479/0.85 ≈ 560 W shaft-in,
   X4110S 400 KV; maker max 615 W at 3130 g static, budget-lift.md A3) — the pusher is near its
   limit with round legs.
7. The CFD confirms the XFOIL lift curve and Cp to within the limits in §6; it does not change the
   above conclusions, which are driven by the gear and rotor bluff-body drag, not by the wing.

## 10. What the team must measure

- M1 Glide/power test: at 20 m/s level flight read the watt-meter; > 420 W electrical confirms the
  high-drag case and fails R10 (threshold from §8: 10 min requires ≤ 436 W).
- M2 Stall test at altitude at MTOW: airspeed at the pitch break; > 12.5 m/s fails R11 even with
  the 3 % relaxation; also confirms the elevator reserve (expect −9° at 12 m/s).
- M3 Stopped-rotor drag: fly the same speed with props removed vs fitted; ΔP > 60 W means the
  prop EST (Cd 0.06) is low and a prop-parking (azimuth) scheme is needed.
- M4 CG and static margin: weigh at the two legs, confirm 28 % ± 2 % MAC with and without the
  payload allowance; fly a trim-speed sweep to check dδe/dCL is negative (positive = unstable).
- M5 Gear fairing A/B: time-to-climb or watt-meter at 20 m/s with and without the fairings.

## 11. Flow visualisation (2026-10-24, re-run 2026-10-25 on the final chord)

The client asked to see the air move, not only the coefficients. Two data sets feed the review page's
animated flow views; both are produced by scripts in `analysis/aero/` and written to
`analysis/aero/out/flowviz/` (compact JSON, tracked) with reference images in `analysis/aero/plots/`.
Raw solver volume files (about 30 MB per case) stay in `out/su2_flow/` and are git-ignored.

### 11.1 2-D section flow, NACA 2415 at the cruise Reynolds number (`flowfield_2d.py`)

**Method.** Same solver and numerics as the converged cases of §6 (SU2 8.5.0 win64-omp, INC_RANS,
FDS + MUSCL with the Venkatakrishnan limiter frozen after 300 iterations, implicit Euler, CFL 2
adaptive to 50; Spalart–Allmaras, fully turbulent; chord 1, Re 3.89×10⁵ (chord 284.2 mm, 20 m/s) through the constant
viscosity), with the volume solution written as the ASCII restart (`OUTPUT_FILES= (SURFACE_CSV, CSV)`),
which SU2 8.5 writes with PointID, x, y, pressure and velocity. All five angles ran on the fine gmsh
4.15.2 mesh L3 (267,902 cells, 143,665 nodes, quad boundary layer y⁺ < 1), five concurrent cases at
4 OpenMP threads each on 20 logical CPUs; the 15° case used the high-angle settings of `su2_2d.py`
(CFL 1 adaptive to 20, limiter frozen after 800 iterations, 6,000 iterations). The field is
resampled onto a 220 × 128 grid in chord units (x −0.6 to 1.8, y −0.7 to 0.7, spacing 0.011 c) by
linear interpolation on the solver's own triangulation (quads split), so grid points inside the
aerofoil fall in no triangle and are masked exactly; the aerofoil outline is the chained wall-node
loop of the mesh (478 nodes). SU2 writes the incompressible solution non-dimensionally (far-field
speed in the file 1.0000 at every angle), so u/V∞ and v/V∞ are read directly and Cp = 2 (p − p∞).

| α | CL | CD | CM c/4 | Iterations | Force history | Cp at stagnation | Cp min (wall) | Upper-surface separation (est.) | Wall-clock |
|---|---|---|---|---|---|---|---|---|---|
| 0° | 0.203 | 0.0140 | 0.043 | 2,789 (Cauchy stop) | steady, σ(CL) 6×10⁻⁶ | 1.03 | −0.65 | none | 42 min |
| 4° | 0.622 | 0.0162 | 0.039 | 2,384 (Cauchy stop) | steady, σ(CL) 1×10⁻⁵ | 1.02 | −1.22 | none | 37 min |
| 8° | 1.012 | 0.0223 | 0.034 | 2,246 (Cauchy stop) | steady, σ(CL) 2×10⁻⁴ | 1.01 | −2.52 | none | 34 min |
| 12° | 1.282 | 0.0362 | 0.021 | 3,913 (Cauchy stop) | steady, σ(CL) 2×10⁻⁴ | 1.00 | −4.28 | x/c ≈ 0.88 | 50 min |
| 15° | 1.304 | 0.0658 | 0.020 | 6,000 (full count) | steady, σ(CL) 1×10⁻³ | 1.01 | −5.18 | x/c ≈ 0.60 | 62 min |

Source: `out/flowviz/flow2d.json` (per-angle `CL`, `CD`, `CM`, `iters`, `CL_std_last300`,
`Cp_stag_max`, `Cp_min_wall`, `x_sep_upper_est`, `wall_s`); σ(CL) is the standard deviation over the
last 300 iterations, the steady criterion of `su2_2d.parse_case` (< 2×10⁻³). The five cases ran
together on 20 logical CPUs while a SOLIDWORKS job shared the machine. Change from the 263 mm chord
run (Re 3.60×10⁵, 2026-10-24): CL +0.2 to +0.8 %, CD −1.3 to −1.7 %, wall Cp minima within 0.05.

**Convergence.** All five cases converged on L3: four stopped on the Cauchy criterion, the 15° case ran
its full 6,000 iterations with the force history steady over the last 300 (σ(CL) 1.0×10⁻³, inside the
criterion). No case fell back to the coarse mesh, so no field is a time average or a labelled last
iterate; the `converged` flag and `field_note` in the JSON record this per angle. The new points sit
on the §6 fine-mesh curve: L3 gave CL 0.414 at 2° and 1.172 at 10° (`out/su2_2d.json`), and the new
0°–12° values interpolate them with a slope of 0.10 per degree. Stagnation Cp reads 1.00–1.03 at every
angle, which checks the Cp = 2 p convention at the stagnation point (1.03 at 0° is the limiter
overshoot on the coarsest surface spacing at the leading edge).

**What the images show** (`plots/flow_0.png` … `flow_15.png`, `flow_cp_8.png`).
- *Stagnation point*: the yellow marker in `flow_cp_8.png` sits just below the leading edge on the
  lower surface (x/c 0.01, y/c −0.02 at 8°) and walks further aft on the lower surface as α rises;
  the velocity-magnitude field is dark there and in the no-slip layer along the wall.
- *Suction peak*: the bright band over the leading edge is the upper-surface acceleration; the
  grid maximum of |V|/V∞ (unmasked points of `flow2d.json`) is 1.27 at 0°, 1.79 at 8° and 2.37 at 15°
  (the wall Cp minimum −5.18 at 15° corresponds to |V|/V∞ = √(1 − Cp) ≈ 2.49 at the boundary-layer
  edge, closer to the wall than the 0.011 c grid spacing).
- *Separation onset*: at 0°, 4° and 8° the near-wall flow (probed 0.5 % c off the upper surface) runs
  from leading to trailing edge without reversing. At 12° a reversed-flow pocket appears at the
  trailing edge (from x/c ≈ 0.88); at 15° it has grown into a closed recirculation bubble from
  x/c ≈ 0.60 to about 0.2 c behind the trailing edge, visible as the closed streamline loop in
  `flow_15.png`. SA fully turbulent still gives a small lift increase from 12° to 15° (1.282 →
  1.304) with drag almost doubling (0.036 → 0.066): the model is at the top of its lift curve, not past
  it. (The L2 sweep of §6 peaks earlier, 1.210 at 13°: the fine mesh carries the attached flow further.)
  XFOIL (transitional, Ncrit 9, Re 3.89×10⁵) puts CL_max at 1.363 and the Genç, Lock and Kaynak (2008) tunnel
  data at 1.30 with stall at 12° (`aero_results.json` `CL_max_2D`), so the pictures show the SA
  trailing-edge-separation route to stall, which is later and softer than the laminar-separation route
  the real wing at Re 2–4×10⁵ is likely to take.
- *Wake*: the low-speed wake thickens from a thin sheet at 0° to a 0.15 c deficit at 15°, deflected
  downward by the circulation.

**Web export** `out/flowviz/flow2d.json` (1.35 MB): header keys `tool`, `solver`, `Re`, `V_mps`,
`frame`, `grid` (nx 220, ny 128, x0/x1/y0/y1, element k = j·nx + i with j the y index), `encoding`,
`outline` (478 [x, y] pairs, TE → upper → LE → lower), and `angles[]` with `alpha`, `mesh`,
`converged`, `field_note`, forces, and the fields `u`, `v`, `cp` as base64 little-endian Int16
(u/V∞ and v/V∞ ×10⁴, Cp ×10³), `mask` as base64 Uint8 (1 = inside the aerofoil or no data) and
`cp_wall` along the outline. 240 × 140 points took the file to 1.6 MB, so the grid was reduced to
220 × 128.

### 11.2 3-D streamlines over the lifting surfaces (`flowfield_3d.py`)

**Method.** AeroSandbox 4.2.10 `VortexLatticeMethod` on the v0.4 wing, H-tail and twin fins of
`asb_model.airplane()` (results.json span 2.4 m and chord 0.284 m; tail from cad/params.txt), 24
spanwise × 8 chordwise panels per surface half (1,152 panels), cruise 20 m/s at the AVL-trimmed
α = 2.86° (`aero_results.json` `trim_cruise`); the elevator deflection and the pod are not in the
lattice. The VLM gives CL 0.411 and CDi 0.0064 against AVL's trimmed 0.385 (with −3.45° elevator)
and 0.0060 (`out/flow3d_summary.json`, `aero_results.json` `trim_cruise`; re-run 2026-10-25). Streamlines are integrated with fourth-order Runge–Kutta along the unit velocity
direction (free stream + horseshoe-vortex induced velocity from `get_velocity_at_points`, vortex core
regularised to 4 mm for the field evaluation only), 5 mm step, 400 steps (2.0 m of path), from 120
seeds on a plane 0.4 m ahead of the wing: three rows across the span at ±60 mm about the chord
line, dense rows from 0.95 to 1.12 semi-spans at both tips, and a row at the tailplane height.

**What the image shows** (`plots/flow_3d.png`). Over the wing the streamlines speed up on the upper
surface (|V|/V∞ up to 1.08, red) and slow underneath (0.94, blue), and leave the trailing edge
deflected downward; the rear projection shows the sheet behind the wing displaced down by the
downwash and, outboard of each tip, the lines curling up and inboard around the tip vortex. A
wing-only lattice evaluated at the tailplane quarter chord gives a downwash of −1.7° across the
tail span (`out/flow3d_summary.json` `downwash_at_htail`, mean −1.67°), i.e. ε/α ≈ 0.6 at this lift
(2.86° of free-stream incidence, VLM CL ≈ 0.41), the order AVL's tail contribution to Cmα in §4 implies.

**Web export** `out/flowviz/flow3d.json` (354 KB), CAD / review-viewer frame (X forward from the
wing leading edge, Y up, Z right, metres): `panels.{wing,htail,fin}.quads` as flat 12-value corner
lists (front-left, back-left, back-right, front-right) with the bound-vortex strength `gamma`, and
`streamlines[]` with `seed_cad`, `xyz` (flat [X,Y,Z,…], 80 points per line) and `s` (|V|/V∞ per
point for colouring).

### 11.3 Limits

- 2-D RANS, Spalart–Allmaras fully turbulent, steady solver: no laminar separation bubble and no
  transition, so stall is the trailing-edge type and arrives later than XFOIL or the tunnel data
  suggest; the 15° field is a converged steady solution of a flow that is probably unsteady in
  reality. Section only: no tip, sweep or fuselage effects.
- VLM is inviscid potential flow with the wake fixed in the x direction: no boundary layer, no
  separation, no profile drag, no pod or boom interference; the tip-vortex roll-up is the induced
  field of the discrete horseshoe trailing legs, regularised with a 4 mm core, not a resolved vortex.
- Both are illustrations of the converged models already used in §3–§6; they add no design number.

Tools: SU2 8.5.0 win64-omp, gmsh 4.15.2, AeroSandbox 4.2.10, numpy 2.5.4, scipy 1.18.1, matplotlib
3.11.2 (all as in §1, checked 2026-10-21).
