# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: an external client/sponsor** of a UC Berkeley capstone project. They read the engineering design review to decide whether to approve the design and the $2,000 hardware spend before parts are ordered. They are technically literate but were not in the team's working sessions, so the page has to stand on its own.
- **Secondary: the four-person build team.** They use the same page, plus the repo it is built from, as the working reference for purchasing, fabrication and flight testing.

## Product Purpose

Design-Build-Fly is a student capstone: design, build and flight-test a hybrid lift + cruise VTOL. Vertical lift rotors handle takeoff and landing, and a pusher prop with a fixed wing handles cruise, with the lift rotors stopped. The deliverable this record covers is the **engineering design review**, a single self-contained web page generated from the repo. It states the baseline design, checks it against numbered requirements (R1–R20 in `docs/DESIGN-BASIS.md`), shows the analysis, CAD and simulation, and names what the team must still measure.

Success means the client can approve the design and budget on the page's evidence alone, and every number they see traces to a source.

## Positioning

The review is generated from the project's own analysis, CAD and simulation outputs (`analysis/`, `cad/`, `review/build.mjs`), not written by hand. Re-running the sizing, the CAD build and the page build regenerates every figure, table, render and the interactive 3D model, so the document cannot drift from the engineering. Every number cites a repo file, a shown formula, or a URL with the date it was checked.

## Operating Context

- Delivered as a **shared link**: the published page, or the standalone `VTOL-Review.html` opened from File Explorer. Clients read it on their own screens.
- Read alongside the GitHub repo `davinciucberkeley-collab/DBF-VTOL`, which holds the sources (moved from `Dalcouffe1/Design-Build-Fly` on 2026-10-19).
- The review is regenerated whenever the design changes: sizing (`analysis/sizing.mjs`), then the CAD (`cad/build.ps1`, SOLIDWORKS 2025 via its API), then the simulation (`cad/Sim.exe`), then `node review/build.mjs`.
- The house structure for the document is set in `docs/reference/REVIEW-STYLE.md`: numbered sections, KPI strip, requirement status chips, source citations, open and blocking decision cards, and a "What the team must measure" box in each technical section.

## Capabilities and Constraints

- Hard project constraints (CLAUDE.md, `docs/DESIGN-BASIS.md`):
  - $2,000 total physical budget, fixed, including tax and shipping.
  - Built and flight-tested by 2027-04-30.
  - MTOW under 25 kg; 2–3 m span; breaks down to fit a standard car.
- One self-contained HTML page. CSS, JS, data and images are inline. The only external loads are web fonts and the three.js library for the 3D viewer, so the 3D viewer needs a connection; the rest of the page works offline.
- Presented as an interactive engineering review platform (redesign 2026-10-25; inspiration Onshape, SimScale, Linear): persistent sidebar navigation, one page per chapter with sub-tabs, visual-first CAD, drawing and CFD workspaces, Ctrl-K search. Dark graphite by default with a light theme (stored per viewer), at desktop and phone widths. A Report view renders the traditional document (cover, revision record, approvals, every chapter in order), and printing always uses it with a white-paper palette.
- Interactive content: sortable tables, sensitivity sliders, charts drawn from the live sizing model, the trade-study chart, and a rotatable SOLIDWORKS model viewer with every part and fastener.
- Companion pages in the same style, generated from the repo Markdown: the build manual (DBF-MAN-001, `build-manual.html`) and the test plan (DBF-TP-001, `test-plan.html`). The review links to them and to the shop files (cut, print and wiring lists, templates, parameter file).
- Terminology: MTOW, T/W, QuadPlane, C0–C3 concepts, R-numbered requirements, M-numbered measurements, EST for estimates.
- Sibling pages built from the same repo, each with its own audience (listed with their published links in the README under "Published versions"):
  - **Inventory & Electrical Overview** (DBF-INV-001, `Inventory-Overview.html`, built by `inventory/build_overview.mjs`): for the build team. Purchasing, stock, kits, fabrication, electrical architecture and wiring blueprint DBF-ELE-001, print tolerances, the Autodesk Fusion model with every fastener and live joint animations, and the alternative designs A1–A3. It is pinned to the v0.3.1 inputs in `inventory/v031/` until the inventory and the Fusion model are migrated to v0.4.0.
  - **Concept Models** (`Concept-Models.html`, built by `concepts/build.mjs`): eleven literature concepts as illustrative 3D models on the C0 envelope; not CAD.
  - **Browser flight sim** (`sim/`): a demonstration only, outside the engineering scope.

## Brand Commitments

- Project name: **Design-Build-Fly** (confirmed 2026-10-18), shown on the cover mast line.
- Client-facing: the page must read as professional aerospace engineering software that industry engineers, professors and employers would take seriously, while keeping the rigour of an engineering report. It must not look like a generic AI-generated web page or dashboard (user direction, 2026-10-13 and 2026-10-25).
- Voice (REVIEW-STYLE.md): terse and specific, numbers inline with units, present tense, baseline and verdict first, no marketing language.
- No client logo or university branding is required.

## Evidence on Hand

- Sizing and budget: `analysis/results.json` and `docs/purchasing/C0_BOM.csv`, with prices checked 2026-10-13 and cited in `docs/research/`.
- CAD: `cad/model/` (SLDASM, STEP, EASM) and renders in `cad/images/`.
- Simulation: FEA and thermal results in `cad/sim/results.txt`; vortex lattice in `analysis/aero.json`; the aerodynamic package (XFOIL, NeuralFoil, AVL, drag build-up, SU2 2-D RANS CFD) in `analysis/aero/aero_results.json`.
- Hardware and fits: `docs/research/hardware-spec.md`, `cad/hardware.json`; CAD rev B with every fastener and the nine-sheet drawing set DBF-DRW-001.
- Build, test and flight software: `docs/build/`, `docs/test/`, `firmware/` (parameter file checked; SITL scenarios run).
- Configuration trade study: `analysis/tradestudy.json`, `docs/research/configurations.md`.
- Independent check: `analysis/verify.py`.
- Inventory and electrical: `inventory/inventory.json` (master list, live copy in the team Google Sheet), `inventory/electrical/` (components, wiring), `docs/research/electrical-architecture.md`.
- Fusion model (v0.3.1 geometry): `fusion/` build scripts, `inventory/fusion/` (STEP, .f3d, meshes, kinematics, animations), `inventory/hardware/` (hardware schedule of 613 pieces, mechanisms, print tolerances), `docs/research/hardware-schedule.md`, `docs/research/tolerance-analysis.md`, `fusion/interference_report.json`, `fusion/motion_clearance.md`.
- Alternative designs: `concepts/variants/a1`, `a2`, `a3` (design notes, inventories, metrics, Fusion models).
- Audit: a six-reviewer project audit (79 findings) recorded in review §12.
- Absent, and must not be fabricated:
  - flight-test data and measured thrust, drag or temperature (the M-items are still open); SITL runs use ArduPilot's generic QuadPlane, not this airframe
  - photos of hardware (nothing has been built yet)
  - client name, testimonials and logos

## Product Principles

1. **Traceable or absent.** Every figure cites its source; estimates are labelled EST; unknowns show as "—", never invented.
2. **Verdict first.** Each section opens with the baseline and its verdict, then the evidence.
3. **Decisions are visible.** Open and blocking decisions, with a recommendation, sit where the client will see them.
4. **Generated, not hand-maintained.** Change the sources and rebuild; never hand-edit numbers into the page.
5. **Budget is fixed.** Never present more money as an option; trade-offs stay inside $2,000.
