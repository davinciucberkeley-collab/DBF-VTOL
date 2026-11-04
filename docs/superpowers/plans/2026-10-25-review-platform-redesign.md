# Review platform redesign — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-present the VTOL design review as an interactive engineering platform (sidebar app shell, visual-first pages, dark/light, Report view) with every piece of existing content, number and viewer preserved.

**Architecture:** `review/src/body.html` stays the single content source (sections regrouped into platform pages); a new `review/src/shell.js` (global `Shell`) owns navigation, routing, sub-tabs, search, theme, drawer and Report view; `app.js` keeps data binding, charts and viewers and hands the shell an `onShow(section)` hook; `style.css` is re-tokened to the new design system and component rules are restyled in place, so class names used by generated markup keep working.

**Tech Stack:** plain HTML/CSS/JS inlined by `node review/build.mjs`; three.js r128 (existing CAD viewer); Google Fonts IBM Plex Sans/Mono + STIX Two Text.

**Spec:** docs/superpowers/specs/2026-10-25-review-platform-redesign-design.md

## Global Constraints
- No content, number, equation, table, chart or viewer removed; numbers stay data-bound (`data-k`, generated tables).
- Status chips only: met, at risk (`risk`/`warn`), fail, open, EST — no new states.
- Dark default: bg #0E1116, panel #151A21, raised #1C222B, border #262D37, text #E6EAF0/#9AA4B2/#6B7685, accent #5B9DFF; light: bg #F7F8FA, panel #FFFFFF, raised #EEF1F5, border #E3E6EB, text #0F1419/#4A5361/#6B7280, accent #2F6FDB.
- Type: IBM Plex Sans 400/500/600, IBM Plex Mono for numbers/paths, STIX Two Text italic for equations only.
- 8 px panel radius, 5 px chips, 1 px borders, no shadows except popovers.
- Single self-contained page; works at 375 px with no horizontal page scroll; reduced motion respected; `localStorage` wrapped in try/catch.
- Report view and print show cover, revision record, approvals and every page in order with disclosures open.

## Review Focus
- Legacy deep links (`#ae-polar`, `#cg`, `#main`, `#contents`) from xrefs and companion pages must land on the right page and tab — test: navigate to each legacy id after Task 4 and assert the visible page/tab contains it.
- A page whose viewer is moved by the shell (CAD viewport shared by Overview and CAD) must keep working after repeated navigation — test: Overview → CAD → Overview → CAD, orbit and explode still respond and the canvas is non-blank.
- Theme toggle while a chart page is open must recolour charts without reload — test: toggle on Budget and CG, assert chart text fill equals the new `--fg-2`.
- Print from any page must include every page — test: in Report view count visible `section.sec` = total.
- Storage unavailable (private mode) must not break boot — test: run with `localStorage` throwing (override in console), page still routes and theme defaults to dark.

---

### Task 1: Content baseline and preservation check
**Files:** Create `review/test/content-check.js` (browser snippet, read from the page via a `?check=1` hook in shell.js)
**Interfaces:** Produces `window.__contentCheck(): {missingNums:[{n,count}], missingHeads:[], tables, cells, figures, svgs, details}` comparing against `localStorage.vtol_baseline` (captured 2026-10-25 before any change: 3000 numbers, 93 headings, 42 tables, 1979 cells, 24 figures, 10 svgs, 26 details).
- [ ] Baseline captured (done before Task 2).
- [ ] After each task: run the check; expected `missingNums` empty except values the concurrent re-size legitimately changed (listed and explained), `missingHeads` empty, counts ≥ baseline.

### Task 2: Design tokens, fonts and component restyle
**Files:** Modify `review/src/style.css` (`:root`, new `:root[data-theme="light"]`, typography, components), `review/build.mjs` (font link), `review/docpage.mjs` (font link)
- [ ] Replace `:root` palette with the dark tokens above (keep existing token names: `--bg --surface --surface-2 --surface-3 --line --line-2 --line-3 --fg --fg-2 --fg-3 --accent ...`), add the light block, `--f-body`/`--f-display` = IBM Plex Sans, `--f-mono` = IBM Plex Mono, `--f-math` = STIX Two Text.
- [ ] Restyle headings (600, tight tracking), panels (8 px radius), chips (5 px), numbers in `.kpi .v`, `td.n`, `code` to mono; status chip colours from the specimen.
- [ ] Verify: page builds, detector URL scan 0, charts readable in both themes.

### Task 3: App shell (sidebar, top bar, router) — `shell.js`
**Files:** Create `review/src/shell.js`; modify `review/src/body.html` (shell markup, remove binder), `review/src/app.js` (remove `buildBinder`/`route`, call `Shell.init`), `review/build.mjs` (inline shell.js before app.js)
**Interfaces:** `Shell.init({ onShow(section: HTMLElement): void })`; `Shell.go(hash: string, focus?: boolean)`; pages from a `PAGES` array `{id, label, group, icon}` matching section ids; routes `#<page>` and `#<page>/<tab>`; legacy element ids resolve to their page/tab.
- [ ] Sidebar groups: Overview, Requirements and decisions | Design | Verification | Program | Build and software | Documentation (per spec).
- [ ] Top bar: project name, version/issue chip (from the existing docref data), search button, theme toggle, Report view button.
- [ ] Verify Review Focus deep links; Back/forward; skip link.

### Task 4: Page regrouping and sub-tabs
**Files:** `review/src/body.html`, `review/src/shell.js`
- [ ] New sections: `requirements` (decision cards, requirement status, measurement list, glossary moved from overview), `drawings` (drawing block moved from model3d), `docinfo` (docref, revision record, approval sign-off moved from the cover, plus sources note), `downloads` (shop-file list moved whole).
- [ ] Sub-tabs for sections with ≥ 4 h3: panel per h3 (first panel "Summary" holds pre-h3 content); tab ids = h3 ids.
- [ ] Verify content check and every h3 reachable.

### Task 5: Overview workspace and shared model viewport
**Files:** `review/src/body.html`, `review/src/shell.js`, `review/src/style.css`
- [ ] Hero grid: `#modelSlot` (viewer) + verdict + KPI tiles (data-k bound: MTOW, BOM total, cruise available, stall speed, plus existing overview KPIs) + requirement chips (counts of existing chips in the requirement-status table) + entry cards (CAD and drawings, Aero and CFD, Structures and FEA, Test and flight).
- [ ] Shell re-parents `#cadView` into the visible page's slot (`#modelSlot` or the CAD page slot) and calls the `onShow` hook so the viewer refreshes.
- [ ] Verify Review Focus viewer re-parenting.

### Task 6: Viewport + inspector layouts (CAD, Flow field, FEA)
**Files:** `review/src/style.css` (grid layouts), `review/src/body.html` (wrapper classes only)
- [ ] CAD: viewport left, parts/fasteners list and controls as inspector right (stack < 900 px).
- [ ] Flow field: canvas left; controls, legend, readout as inspector right.
- [ ] Simulation: result figures left, numeric results/agreement table right.
- [ ] Verify all viewer controls and keyboard paths.

### Task 7: Search, theme, drawer, Report view and print
**Files:** `review/src/shell.js`, `review/src/style.css`
- [ ] Ctrl-K / button palette indexing pages + h3/h4 headings; arrow keys + Enter; Esc closes.
- [ ] Theme toggle persists (try/catch), sets `data-theme`, calls charts redraw via `onShow`.
- [ ] Phone (< 900 px): sidebar becomes a focus-trapped drawer.
- [ ] Report view: `html.report` shows docinfo cover first then every section in sidebar order, panels expanded, disclosures open; `beforeprint` enters it, `afterprint` restores.
- [ ] Verify Review Focus print count and storage-off boot.

### Task 8: Companion pages
**Files:** `review/docpage.mjs`
- [ ] New tokens/fonts; top bar with "← Design review" and theme toggle; keep their contents and runhead behaviour.
- [ ] Verify build manual, test plan, flight software, templates render; detector 0.

### Task 9: Documentation and release
**Files:** `DESIGN.md`, `.impeccable/design.json`, `PRODUCT.md` (if register changes), artifact publish, git
- [ ] Rewrite DESIGN.md for the platform system (impeccable documenter).
- [ ] Full test pass (content check, interactive checks, 1440/768/375, both themes, console, detector all pages, verify.py).
- [ ] Publish artifact (same URL, companion files), commit, push.
