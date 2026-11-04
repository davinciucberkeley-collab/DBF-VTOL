# Review platform redesign — design

Date: 2026-10-25 · Status: approved in conversation (site map, layout wireframes, design system, technical behaviour); the owner waived the written-spec review.

## Goal
Turn the Lift + Cruise VTOL design review (review/vtol-review.html, published as the claude.ai artifact) from a report-styled page into an interactive aerospace engineering review platform (inspiration: Onshape for CAD presentation, SimScale for simulation organisation, Linear for typography and navigation), without removing or re-typing any engineering content.

## Hard constraints
- No analysis, equation, number, table, chart or viewer is removed or simplified; numbers stay data-bound to repo files.
- No invented results or status indicators: status chips use only the existing states (met, at risk, fail, open, EST).
- Single self-contained HTML built by `node review/build.mjs`; same artifact URL; standalone root copy keeps working.
- A traditional report remains available (Report view) and printing produces the full report.
- Desktop first, usable at 375 px with no horizontal page scroll; reduced motion respected; keyboard and screen-reader navigable.

## Site map
Overview (home) · Requirements and decisions — Design: CAD model, Drawings, Aerodynamics (tabs: Summary, Drag, Section and stall, CFD, Flow field, Stability), Structures, Mass and power, Propulsion, CG and stability — Verification: Simulation and verification, Test plan, Flight test and operations — Program: Budget and BOM, Design iterations, Schedule and compliance — Build and software: Build, Controls and flight software (links to the companion pages) — Documentation: Report info (revision record, document number/issue/date, approvals, sources), Downloads, Report view.

Blocks move between pages whole: Drawings out of the CAD chapter; decisions, requirement status, measurement list and glossary out of the Overview; revision record and approvals out of the cover.

## Layout
- App shell: top bar (project, version/issue chip, Ctrl-K search, theme toggle, Report view) + persistent left sidebar grouped as above; on phones the sidebar is a focus-trapped drawer.
- Overview: model viewport (the existing SOLIDWORKS three.js viewer) beside the verdict and key numbers; requirement-status chips; entry cards to the analysis areas; then the remaining overview content.
- Analysis pages: breadcrumb + sub-tabs (built from the chapter's own h3 headings for long chapters); visual-first workspace with an inspector column (case controls, results, status, source) where a viewer exists (CAD, Flow field, FEA); full chapter text below.

## Visual system
- Type: IBM Plex Sans (UI and prose, 400/500/600), IBM Plex Mono (numbers, parameters, paths), STIX Two Text italic for equations only.
- Colour: dark graphite default (bg #0E1116, panel #151A21, raised #1C222B, border #262D37, text #E6EAF0 / #9AA4B2 / #6B7685, accent #5B9DFF) and a light theme (bg #F7F8FA, panel #FFFFFF, raised #EEF1F5, border #E3E6EB, text #0F1419 / #4A5361 / #6B7280, accent #2F6FDB); accent for selection, links and focus only; warm/cool reserved for data.
- Status chips: met, at risk, fail, open (pending validation), EST (outline). Result panels name their source file.
- Flat 1 px panels, 8 px radius (chips 5 px), no shadows except popovers; 4 px spacing grid. Charts read theme tokens and redraw on theme change.

## Technical behaviour
- `body.html` chapters remain the single content source; new `review/src/shell.js` + token stylesheet build the shell, move blocks into pages, build sub-tabs and search; `app.js` keeps data binding and charts; viewers are re-hosted, not rewritten.
- Hash routes per page and tab (`#aero/flow`); legacy anchors resolve to their page and tab; Back/forward; focus to the page heading.
- Report view renders cover, revision record, approvals and all chapters in order with disclosures open; print always uses it.
- Theme stored per viewer (try/catch), `[data-theme]` on `<html>`.

## Testing
- Content-preservation script: every chapter's text tokens, numbers and table cells before vs after; any lost number fails.
- Browser checks per step: CAD (orbit, explode, X-ray, part highlight), flow viewer (5 angles, speed/pressure, 3-D views), sliders and live chain, all charts in both themes, drawing lightbox, downloads, deep links, Back, skip link, search, Report view, print.
- 1440 px, 768 px, 375 px; console errors; Impeccable rendered scans; `py analysis/verify.py`.

## Order
Shell and tokens → Overview → CAD and Drawings → Aerodynamics, Structures, Simulation → remaining chapters → Documentation and Report view → companion pages → DESIGN.md / PRODUCT.md, publish, commit.
