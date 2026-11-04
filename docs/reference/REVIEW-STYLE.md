# Review style reference (from "Cloth-Feed Gripper Review")

This spec describes the house style of the gripper engineering review so a new
review (the lift + cruise VTOL) can match it. Copy the **form**, never the
gripper's content, numbers or conclusions.

## What kind of document it is
An engineering design review "binder" built from the project repo: design-basis
docs, concept docs, CAD outputs, analysis scripts and firmware. It states what
the design is, checks it against numbered requirements, shows the math, and
ends every technical section with what the team still has to measure. It is
not a narrative essay and not a line-by-line code walkthrough.

## Format and layout
- One self-contained HTML page. Inline CSS and JS; any 3D model and data are
  embedded in the page.
- Layout (VTOL revision 2026-10-21, client-facing): one continuous report.
  Cover with title block and document control, a numbered contents page, and
  a thin running head naming the current section once the contents scroll
  away. Sections follow in order as chapters; each leads with its verdict,
  key figures and charts, and long tables or supporting facts fold behind
  labelled disclosures. (The original gripper spec used a sticky left index
  and one section at a time.)
- Light and dark themes via CSS tokens on `:root`, dark under
  `prefers-color-scheme` plus `[data-theme]` overrides.
- Palette (VTOL revision 2026-10-13, client-facing): ink on near-white paper, cool-neutral
  grays, one high-visibility orange accent used sparingly. Semantic colors: ok (green),
  warn (amber), bad (red), open (violet). Six categorical chart colors.
- Type: condensed technical grotesk for headings (Barlow Semi Condensed), humanist sans
  body (Source Sans 3, 16 px, line-height 1.6), mono (Red Hat Mono) for labels, data and code;
  square hairline geometry, no drop shadows or pill badges. Original gripper spec: display grotesk,
  mono for code. Tabular numbers everywhere. Paragraphs capped at ~72 ch.
- 44 px minimum touch targets; works at phone width.

## Section skeleton (gripper version)
1. **Overview** — 1 paragraph stating the baseline design with its key specs
   inline, then: Open decisions, lane/workstream status, Requirement status.
2. **3D model** — interactive viewer, parts and mass table, fit checks.
3. **Concepts** — design spaces with alternatives, concept combinations,
   morphological chart, Pugh matrix against a datum (C0 = 0).
4. **Mass & torque** — live back-calculation chain (boxes joined by arrows,
   each box: label, value, formula), sensitivity sliders using the same
   formulas as the repo script, budget per scenario, mass roll-up
   (design-basis estimate vs CAD).
5. **Actuators** — full trade table.
6. **Finger FEA** — structural check.
7. **Gears** — safety factor and sweep per material, printed vs CNC.
8. **Dyno & fatigue** — duty cycle for one operating cycle, thermal,
   weakest-link ranking, shock events.
9. **Tolerances** — datum scheme, GD&T callouts, fixes the stacks support.
10. **Controls** — state diagram, event and transition table, thresholds
    (from config.h), pins and host protocol.
11. **Camera** — chosen mount, top placements by score.

## Recurring components (use them the same way)
- **KPI strip**: 4-up tiles (label / value / sub-line), value colored ok /
  warn / bad.
- **Status chips** on requirements: `met`, `risk`, `fail`, `open`.
- **Source citations**: a small gray line under each claim block naming the
  repo files it came from, e.g. `DESIGN-BASIS.md R1, R2; torque_and_actuator.md`
  or `cad/.../fitcheck.json mass`. Every number traces to a file.
- **Open decision cards** (violet, red when blocking): bold title as a
  question or problem, the facts, then "Recommended:" and the alternative,
  then the citation and a link to the section with the evidence.
- **Blocked banner** (red-soft): what is blocked, by what, what exists, what
  does not.
- **"What the team must measure" box** at the end of nearly every technical
  section: numbered items (M1, M2 ...), each says what to measure, how
  (cheap method: spring scale, incline test, kitchen scale) and the
  threshold at which the design fails a named requirement.
- **Tables**: sortable headers, sticky header row, right-aligned numbers,
  highlighted chosen row, cells colored ok / warn / bad.
- **Charts**: inline SVG, titled, themed by CSS tokens; interactive controls
  (range sliders, checkboxes) where a parameter sweep matters.
- **Cards** for options, the picked one outlined in the accent color.

## Tone
Terse, specific, numbers inline with units. Present tense. States the
baseline and the verdict first, then the evidence. Names failure thresholds
explicitly ("Below 0.386 the servo fails R16"). Flags unknowns with an em
dash placeholder rather than inventing values. No marketing language.
