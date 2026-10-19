# Tilt-wing design study (branch `design2`)

Parametric tilt-wing VTOL after Çakır & Kurtuluş, "Design and aerodynamic analysis of a VTOL tilt-wing UAV",
Turk J Elec Eng & Comp Sci 30 (2022) 767–784, doi:10.3906/elk-2105-59. The paper's values are only the slider
defaults; every result is recomputed from the sliders.

Status: design study, uncommitted work on `design2`. Nothing here replaces the C0 lift + cruise baseline.

## Open
`dashboard.html` — one self-contained page (three.js r128 from cdnjs, Google Fonts). Tabs:

| Tab | Content | Formulas (model.js header) |
|---|---|---|
| Overview | KPIs, plan-view drawing, live design checks | — |
| Sizing | geometry, mass build-up, rotors, cruise, energy, trade charts | G1–G6, M1–M2, P1–P7 |
| 3D CAD | lofted S1223 wing / NACA 0009 tail, tilt animation, slipstream tubes | — |
| Aero | C_L, C_D, C_m vs α for tilt 0–90°, elevator, effective-velocity diagram | A1–A7 |
| Transition | take-off → hover → transition → cruise simulation, corridor map | S1–S4, E2 |
| Structures | beam FE of spars, tilt shaft, fuselage; modes vs rotor speed | F1–F7 |
| CFD | ISA environment, live 2-D lattice-Boltzmann flow, 3-D vortex-lattice ΔC_p | E1, — |
| Paper vs model, Steps | comparison with the paper, verification table | — |

## Files
- `model.js` — the whole model (sizing, aero, flight sim, FEA, ISA). Runs in Node and the browser.
- `src/` — dashboard source; `build.mjs` assembles `dashboard.html` (`node tiltwing/build.mjs`).
- `data/airfoils.json` — S1223 / NACA 0009 coordinates and NeuralFoil polars (`tools/polars.py`).
- `data/aero.json` — AeroSandbox AeroBuildup reference sweep (`tools/aero_ref.py`).
- `data/vlm.json` — 3-D vortex-lattice panels and ΔC_p (`tools/vlm_cp.py`).
- `data/verify.json` — independent checks (`tools/verify.py`, 27 of 27 pass).
- `cad/` — STEP assemblies and per-part STL at 0° and 90° tilt (`tools/cad_export.py`, inputs in `cad/params.json`).

Python tools need `pip install aerosandbox cadquery`.

## Estimates to replace with measurements
Rotor figure of merit 0.65, C_T 0.11, motor/ESC efficiency 0.85, 150 Wh/kg pack, structure densities, spar and shell
sizes, material allowables, C_D0 0.045. Each is labelled "estimate" next to its slider or in the formula header.
