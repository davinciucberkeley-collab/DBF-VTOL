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
- Works in light and dark themes, at desktop and phone widths.
- Interactive content: sortable tables, sensitivity sliders, charts drawn from the live sizing model, a simplified concept viewer, and a rotatable SOLIDWORKS model viewer.
- Terminology: MTOW, T/W, QuadPlane, C0–C3 concepts, R-numbered requirements, M-numbered measurements, EST for estimates.

## Brand Commitments

- Project name: **Design-Build-Fly** (confirmed 2026-10-18). Not yet shown on the page; the page currently titles itself "Lift + Cruise VTOL Review".
- Client-facing: the page must read as a professional engineering document. It must not look like a generic AI-generated web page (user direction, 2026-10-13).
- Voice (REVIEW-STYLE.md): terse and specific, numbers inline with units, present tense, baseline and verdict first, no marketing language.
- No client logo or university branding is required.

## Evidence on Hand

- Sizing and budget: `analysis/results.json` and `docs/purchasing/C0_BOM.csv`, with prices checked 2026-10-13 and cited in `docs/research/`.
- CAD: `cad/model/` (SLDASM, STEP, EASM) and renders in `cad/images/`.
- Simulation: FEA and thermal results in `cad/sim/results.txt`, plus a vortex-lattice aero check in `analysis/aero.json`.
- Independent check: `analysis/verify.py`.
- Audit: a six-reviewer project audit (79 findings) recorded in review §12.
- Absent, and must not be fabricated:
  - flight-test data and measured thrust or temperature (the M-items are still open)
  - photos of hardware (nothing has been built yet)
  - client name, testimonials and logos

## Product Principles

1. **Traceable or absent.** Every figure cites its source; estimates are labelled EST; unknowns show as "—", never invented.
2. **Verdict first.** Each section opens with the baseline and its verdict, then the evidence.
3. **Decisions are visible.** Open and blocking decisions, with a recommendation, sit where the client will see them.
4. **Generated, not hand-maintained.** Change the sources and rebuild; never hand-edit numbers into the page.
5. **Budget is fixed.** Never present more money as an option; trade-offs stay inside $2,000.
