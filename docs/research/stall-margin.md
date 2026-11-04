# Stall-margin policy trade — C0 (v0.4)

Status: trade study 2026-10-25, **adopted the same day**: `analysis/sizing.mjs` BASE.Vs = 11.75 m/s. Iterating sizing and the aero package to convergence moved CL_max 1.121 → 1.114, so the adopted design came out at chord 284.2 mm, S 0.682 m², MTOW 6.552 kg, cruise 12.27 min (`analysis/results.json`), slightly larger than the 11.75 column below, which holds CL_max at 1.121. The tables below are the trade as run on the Vs 12.0 baseline. Script `analysis/stall_margin_trade.mjs` (imports
`analysis/model.js` `size()` unchanged; reads `analysis/results.json` and
`analysis/aero/aero_results.json`; writes only `analysis/stall_margin_trade.json`). The script
re-runs the baseline first and exits 1 unless it matches `results.json` (MTOW 6.4503 kg, cruise 12.92 min,
total $1896.79, SM 11.94 %, battery station, boom length: all match).

Conventions: "EST" = engineering estimate. "—" = unknown. *(calc)* = formula shown.

## 1. Verdict

- **The current wing has no margin.** Predicted stall is 12.00 m/s against the R11 limit of 12 m/s
  (`aero_results.json` stall, `margin_to_R11_pct` 0.0008 %). If the true trimmed CL_max is 5 %
  low, stall is 12.31 m/s; 10 % low gives 12.65 m/s; 15 % low gives 13.02 m/s. R11 fails in all three.
- **Recommended: design stall target 11.75 m/s (CL_max margin 4.1 %), with the measured-stall
  rule in §5 as the backstop.** The change costs $0, keeps the pack and the $103.21 R7 reserve, adds 88 g,
  and cuts cruise time from 12.92 to 12.35 min, still above the 11.5 min floor. All build items still fit,
  and no firmware parameter changes.
- **11.5 m/s is possible but uses up the other margins.** Cruise drops to 11.75 min, 0.25 min above the floor.
  One foam sheet no longer yields a spare panel set. The P13 plate no longer fits a 256 mm bed, even diagonally.
  Aileron hinge moment rises 26 %.
- **11.25 m/s is rejected.** The baseline pack falls to 11.07 min, below the 11.5 min floor. The picker moves
  to the HOOVO 8000 pair, which cuts the reserve to $35.96 and fails R7 ($100). The section is
  49.4 mm thick in 50.8 mm foam.

## 2. Variants (span fixed at 2.4 m; pack re-picked by the sizing rule)

| Design Vs (m/s) | 12.00 (current) | **11.75** | 11.50 | 11.25 |
|---|---:|---:|---:|---:|
| CL_max shortfall tolerated, 1 − (Vs/12)² | 0.0 % | **4.1 %** | 8.2 % | 12.1 % |
| Stall if CL_max is 5 / 10 / 15 % low (m/s) | 12.31 / 12.65 / 13.02 | 12.06 / 12.39 / 12.74 | 11.80 / 12.12 / 12.47 | 11.54 / 11.86 / 12.20 |
| S (m²) | 0.640 | 0.676 | 0.717 | 0.790 |
| Chord (mm) | 266.6 | 281.8 | 298.8 | 329.1 |
| AR | 9.00 | 8.52 | 8.03 | 7.29 |
| MTOW (kg) | 6.450 | 6.538 | 6.639 | 6.999 |
| Wing mass change (g) | 0 | +70 | +152 | +310 |
| Hover power (W) | 892 | 912 | 936 | 1022 |
| Cruise power (W) | 325 | 336 | 348 | 371 |
| Cruise available (min); R10 10, floor 11.5 | 12.92 | 12.35 | 11.75 | 14.47 (11.07 on the baseline pack) |
| Pack | Ovonic 6S 6500 ×2 | same | same | HOOVO 6S 8000 ×2 |
| BOM total incl. tax + shipping ($) | 1896.79 | 1896.79 | 1896.79 | 1964.04 |
| Reserve ($); R7 ≥ 100 | 103.21 | 103.21 | 103.21 | **35.96 (fail)** |
| Half-span / largest piece (m); R4 ≤ 1.5 | 1.2 / 1.2 | 1.2 / 1.2 | 1.2 / 1.2 | 1.2 / 1.2 |
| Boom front segment (m); 72 in tubes | 0.966; 2 | 0.988; 2 | 1.012; 2 | 1.056; 2 |
| Joiner reserve factor (yield, 4.5 g) | 1.77 | 1.75 | 1.72 | 1.63 |
| Boom reserve factor | 8.1 | 7.9 | 7.7 | 7.4 |
| Static margin, 28 % CG / bay empty (sizing NP) | 11.9 / 4.9 % | 11.3 / 4.6 % | 10.6 / 4.2 % | 9.3 / 3.7 % |
| Battery station change for 28 % CG (mm, + fwd) | 0 | +6 | +15 | −19 |
| Aileron hinge-moment ratio (c/c0)² | 1.00 | 1.12 | 1.26 | 1.52 |
| Section thickness 0.15 c (mm) in 50.8 mm foam | 40.0 | 42.3 | 44.8 | 49.4 |
| 4 strips of (c + 20) on the 1219 mm sheet (spare panel set) | 1146 ✓ | 1207 ✓ | 1275 ✗ | 1396 ✗ |
| P13 bed needed, flat / diagonal (mm) | 268.0 / 235.9 | 283.2 / 246.7 | 300.2 / 258.7 | 330.5 / 280.1 |
| Template half sheet (mm; Letter printable ~203 EST) | 171.8 | 179.4 | 187.9 | 203.0 |

Sources and formulas:
- Sizing: `analysis/model.js` F4 S = 2 m g / (ρ Vs² CL_max), CL_max 1.121 (`aero_results.json`
  `CL_max_3D.adopted`) held for every variant. A longer chord raises the stall Re by c/c0 (≤ 7 % here);
  the aerodynamics.md v0.4 note treats a 1.3 % change as negligible, and this study assumes the same up to 7 % (EST).
  CD0 is held as a coefficient while S grows, which over-counts the fixed-CdA share (conservative, `sizing.mjs` BASE note).
- Pack rule, BOM, tax 10.25 % and $110 shipping: `sizing.mjs` `run()`/`bom()` via `results.json`.
- Reserve factors: scaled from `results.json` `C0.struct` (MS_J ∝ 1/(W b); MS_B ∝ 1/Lb with
  Lb = xFront + 0.25 c). FEA not re-run.
- Static margin and battery station: `sizing.mjs` `geometry()` and `cg()`, re-implemented in the script.
  AVL gives 12.3 / 5.2 % at the baseline (`aero_results.json` `neutral_point`). AVL is expected to move
  by the same amount (EST, not re-run).
- Hinge moment at fixed q and deflection ∝ S_a c_a. The aileron is 26 % c over a fixed span, so the ratio is (c/c0)²
  *(calc)*. The absolute moment is — (test S07 limit 4 kg·cm, `docs/test/test-matrix.csv` S07).
- Foam 50.8 mm, sheet 1219 mm, strip = chord + 2 × 10 mm lead-in: `docs/build/BUILD-MANUAL.md` WP4 4.4,
  `cut-list.csv` F01/F02.
- P13 length = chord (`print-list.csv` P13). Plate depth with tabs is 65.1 mm (`cut-list.csv` F02, CAD
  Wing_Saddle 266.6 × 65.1 × 172). Flat needs c + 1.4 mm: K1 asks for a 268 mm bed for the 266.6 mm plate.
  Diagonal needs (c + 65.1)/√2 + 1.4 mm *(calc)*.
- Template sheet width c + 37 mm, split into halves of (c + 37)/2 + 20 mm: `docs/build/templates/make_templates.py`.

## 3. CL_max uncertainty, current wing

| CL_max shortfall | CL_max | Stall (m/s) | R11 | 1.3 Vs (m/s) | AIRSPEED_MIN needed | AIRSPEED_MAX ≥ 1.5 × MIN |
|---|---:|---:|---|---:|---:|---:|
| 0 % | 1.121 | 12.00 | met (0 margin) | 15.60 | 16 (as set) | 24 (25 set) |
| 5 % | 1.065 | 12.31 | fail | 16.01 | 17 | 25.5 |
| 10 % | 1.009 | 12.65 | fail | 16.44 | 17 | 25.5 |
| 15 % | 0.953 | 13.02 | fail | 16.92 | 17 | 25.5 |

Stall = sqrt(2 W / (ρ S CL_max)) at W = 6.4503 kg × g, S = 0.6398 m² (`results.json` C0 sized).
AIRSPEED_MIN 16 and AIRSPEED_MAX 25 are from `firmware/vtol_c0.param`. The 1.5 × AIRSPEED_MIN rule for
AIRSPEED_MAX is from the ArduPilot parameter documentation cached in `firmware/tools/cache/apm.pdef.6c52a25af5.xml`.

How large is the real uncertainty? (`aero_results.json` `CL_max_2D`/`CL_max_3D`; aerodynamics.md §3, §5):
- The 2-D values bracket the adopted 1.30 (tunnel, Re 2×10⁵): XFOIL 1.37 (+5 %), NeuralFoil 1.28 (−1.5 %).
  Fully turbulent SA CFD gives 1.17, but over sparse converged points only.
- The 3-D trimmed estimates are critical-section 1.121 (adopted, the lower one), Raymer 0.9 × 2-D 1.17, and AeroBuildup 1.33 (untrimmed).
- Not modelled: hand-cut foam contour accuracy, tape-skin seams and the build's mass growth. Stall scales as
  √m, so a 4.1 % CL_max margin also covers 4.3 % (0.28 kg) of MTOW growth at a fixed wing *(calc)*.

## 4. Downstream cost of adopting each variant

| Item | 11.75 | 11.50 | 11.25 |
|---|---|---|---|
| Aero loop (`analysis/aero/run_all.py`): AVL 34 s, XFOIL 51 s, AeroSandbox 4 s per pass (`aero_results.json` `timings_s`); 2–3 sizing ↔ aero passes, as for the v0.4 close (aerodynamics.md v0.4 note) | 0.5 h EST | 0.5 h EST | 0.5 h EST |
| SU2 re-run (10,987 s = 3.1 h, `timings_s.su2_total`); optional, since Re rises by c/c0 | skip (+5.7 %) EST | optional (+12 %) | needed (+23 %) EST |
| CAD rev D rebuild (`cad/params.mjs` → `build.ps1`), drawings rev E, FEA re-run (precedent: commits 116ba03, 7a21079) | 3–5 h EST | 3–5 h EST | 4–6 h EST + battery tray for a new pack |
| Docs, templates, test cards and firmware notes re-base: the last re-size touched 267 files (`git show --stat 116ba03`) | 4–8 h EST | 4–8 h EST | 6–10 h EST + BOM, purchasing, R7 |
| **Total** | **1–2 person-days EST** | 1–2 person-days EST | 2–3 person-days EST, and R7 fails |
| Foam / templates | fits, spare panel set kept | spare set needs a 2nd sheet ($59.97 + tax, `C0_BOM`) | as 11.5; 1.4 mm foam left over the section |
| P13 on a 256 mm bed | diagonal (246.7 needed) | **split** (K1 lap-joint fallback) | split |
| P13 on a 268 mm bed | diagonal (283.2 flat needed) | diagonal | split |
| Firmware | none (AIRSPEED_STALL 12, MIN 16 ≥ 1.3 × 12 still valid) | none | none |

The printer model and its bed size are — (BUILD-MANUAL M8). The current 266.6 mm P13 already needs a 268 mm
bed if printed flat. Printed diagonally, it fits a 256 mm bed (235.9 mm needed) *(calc)*. K1 lists only the split as
the fallback.

Schedule: no foam is cut yet. WP4 (foam cores) depends on the templates (BUILD-MANUAL §2 table), so re-sizing now
costs analysis time only. After WP4 it also costs a foam sheet and about 2 × 2 h of cutting (WP4 4.5).

## 5. Recommendation and rationale

**Adopt a design stall target of 11.75 m/s at MTOW (R11 stays ≤ 12 m/s; the design target carries a 4.1 %
CL_max margin). Do it as a single re-base after the running SU2 job finishes and before WP4 foam cutting.**

1. **It buys margin that is otherwise free.** $0 change, the same pack, and the reserve stays at $103.21.
   Cruise drops 0.57 min to 12.35 min (still 0.85 min above the 11.5 floor and 2.35 min above R10). MTOW rises 88 g.
   Every reserve factor stays above 1.7, and the static margin falls 0.6 points (11.3 %). The empty-bay case is 4.6 %,
   and the existing 0.5 kg ballast rule (DESIGN-BASIS stability line) still applies.
2. **It covers the known model spread and some mass growth.** It covers the low 2-D estimate (NeuralFoil −1.5 %)
   with room left for about 0.28 kg of MTOW growth, or a mix of the two. It does not cover a 10–15 % shortfall.
   No stall target in this range covers 15 % without failing R7 or the cruise floor: only 11.25 m/s tolerates
   12.1 %, and it fails R7.
3. **Going further costs more than it returns.** 11.5 m/s spends 0.6 min of the cruise margin (which is itself
   an EST allowance on unmeasured drag) for another 4.1 points of CL_max margin. It also loses the spare panel
   set from one sheet and forces the P13 split on a 256 mm bed.
4. **Measured stall remains the backstop.** Margin beyond 4 % is cheaper to buy in firmware than in wing area.
   The aircraft takes off and lands vertically, so stall speed sets the transition speed and the pusher-only
   emergency landing, not the routine landing. After the stall test (DBF-TP-001 F09), with measured stall Vs_m:
   - Set AIRSPEED_STALL = Vs_m.
   - Set AIRSPEED_MIN = max(16, ⌈1.3 Vs_m⌉).
   - Set AIRSPEED_MAX ≥ 1.5 × AIRSPEED_MIN, with Q_ASSIST_SPEED 3 m/s below AIRSPEED_MIN (`vtol_c0.param` comments).
   - Up to Vs_m = 12.31 m/s, nothing changes (1.3 Vs ≤ 16.0).
   - For 12.31 < Vs_m ≤ 13.08, AIRSPEED_MIN goes to 17 and AIRSPEED_MAX to 26. That needs level speed at full
     throttle ≥ 26 m/s (—, measure in F-series), and the transition must still reach 17 m/s in < 15 s and < 100 m
     (`firmware/checklists.md` E8).
   - Above 13.08 m/s (1.3 Vs > 17), the 18 m/s lower cruise bound is < 1.38 Vs. Treat this as an R11 failure and
     raise it with the owner (wing re-make or R11 change).
5. **Not recommended:** keeping 12.0 m/s and relying on firmware alone. It is permitted, but with zero margin any CL_max
   shortfall or any mass growth fails R11 on paper before the aircraft flies, and the fix costs nothing now.

## 6. What the team must measure

- **M1** Built MTOW on the kitchen/luggage scale (K10) before F09. Stall at the measured mass is
  Vs × sqrt(m/6.538) for the 11.75 wing. The 4.1 % margin is used up at 6.82 kg *(calc: 6.538 / (1 − 0.041))*.
- **M2** Stall speed in flight (F09): airspeed-sensor log per the F09 card (`docs/test/cards/FTC-F09.md`), at MTOW with the
  ballast fitted. R11 fails above 12.0 m/s. The AIRSPEED_MIN change is triggered above 12.31 m/s (§5).
- **M3** Aileron hinge moment (S07) on the built wing. The limit is 4 kg·cm. The 11.75 wing raises the moment by
  12 % against the 266.6 mm wing.
- **M4** Printer bed size (BUILD-MANUAL M8). It decides whether P13 is printed flat, diagonally or split.
