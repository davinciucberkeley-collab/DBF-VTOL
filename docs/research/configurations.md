# VTOL configuration survey and trade study

**Date checked: 2026-10-21.** Every source below was read that day (WebFetch, or a PDF converted with pdftotext). A value seen only in a search-engine summary is marked *snippet, unverified*. "—" = not found. "EST" = engineering estimate, not published. Model numbers come from `analysis/tradestudy.mjs` → `analysis/tradestudy.json`, which imports `analysis/model.js` unchanged and starts from the v0.3.1 inputs in `analysis/results.json`.

## Current results (v0.4 inputs, regenerated 2026-10-25)

The sections below record the first run of this study, on the v0.3.1 inputs; their tables are kept for the reasoning. `analysis/tradestudy.json` holds the current run, which the review reads. Current figures:

| Variant (feasible, meets R1) | Score /10 | MTOW kg | Cruise min | Total | Reserve |
|---|---|---|---|---|---|
| C0-lean | 6.04 | 6.43 | 13.1 | $1,830.65 | $169.35 |
| C0-b3.0 | 6.01 | 6.27 | 14.3 | $1,896.79 | $103.21 |
| C0-pk-HOOVO6S8000 | 5.96 | 6.65 | 16.9 | $1,964.04 | $35.96 |
| C0-b2.8 | 5.94 | 6.32 | 14.0 | $1,896.79 | $103.21 |
| C3 | 5.89 | 6.65 | 14.7 | $1,949.25 | $50.75 |
| C0 | 5.86 | 6.43 | 13.1 | $1,896.79 | $103.21 |

- **Top lift + cruise variant: C0-lean**, 6.04/10, first in 12 of 16 weight-sensitivity cases (it loses first place in: cost ×0.7 → C0-pk-HOOVO6S8000; energy ×1.3 → C0-pk-HOOVO6S8000; control ×1.3 → C0-b3.0; schedule ×0.7 → C0-b3.0). The margin over the next variant is 0.03 points.
- **The design carried forward is C0 as specified in v0.4**, not C0-lean: C0-lean's lead comes mainly from dropping the airspeed sensor, which the stall test (R11) and transition margins need. v0.4 already dropped the other optional spares.
- **Tailsitters** (break R1, ranked separately): TS-quad 7.35, TS-duo 6.30.

## Verdict (first run, v0.3.1 inputs)

- **C0 (4-lift twin boom, Alia-style) is still the recommendation among configurations that satisfy R1.** It scores highest of the R1-compliant layouts, and that holds in all 16 weight-sensitivity cases (each weight ×0.7 and ×1.3). The best-scoring C0 variant is **C0-lean: 6.18/10**. It saves $109 by dropping the airspeed sensor, the spare servo and part of the hardware kit, which raises the reserve to $211.39. That comes at a transition-risk cost: control is scored 3 instead of 2.
- **Only one configuration scores higher: the quad tailsitter (TS-quad, 7.37/10).** The twin-motor tailsitter is second (6.31).
  - Both drop the pusher, booms, tail and gear, so empty mass falls and parked-prop drag goes away. TS-quad gives MTOW 5.19 kg, 22.3 min cruise available, $271 reserve and T/W 2.41.
  - Both break R1, a Given requirement that specifies stopped lift rotors.
  - Both need about 30° of tilt to hold position in hover against the R16 8 m/s gust, against 9° for C0.
  - Neither has hover motor-out tolerance or ArduPilot weathervane assist ([S18]).
  - TS-quad still wins if its cruise prop efficiency is pessimistic (0.351: 14.2 min, score 6.51).
  - The tailsitter wins only if the team decides to change R1. This study does not make that decision.
- **Every other alternative is infeasible under the $2,000 cap with today's prices:** 8-lift, coaxial X8, box wing, tandem wing, tilt-quad, bicopter, tilt-wing and all large packs. The tilt-tricopter is within the cap but fails R13 (T/W 1.59 < 1.6).
- **The finding that should change the design:** parked lift-prop drag is the largest single term in C0's drag. It is 0.0237 of CD0 = 0.059, i.e. 40 %, using CdA_rotor = 0.0034 m² EST from `sizing.mjs`.
  - If the true value is ≥ 1.5× that estimate, C0 on the Ovonic 6500 pack falls to 10.1 min and is right at the R10 limit. At 2× it falls to 8.8 min and fails R10.
  - With folding lift props (CdA assumed halved, EST), cruise rises to 14.3 min. That fits under the cap only with the lean BOM (C0-lean-fold: $1,892.43, reserve $107.57).
  - **Measure stopped-prop drag (budget-lift.md M3) before the pack and prop order is frozen.**

---

## 1. Scope and method

1. **Survey.** The survey covered small electric VTOL configurations: research papers, NASA/AIAA reports, theses and preprints, ArduPilot and PX4 documentation, and ArduPilot forum build logs. Section 3 summarises the findings per configuration, and section 8 lists the full citations.
2. **Trade study.** 29 variants were evaluated with the project's sizing physics:
   - the 4 repo concepts C0–C3, reproduced exactly from `results.json`;
   - C0-lean;
   - a span sweep from 2.0 to 3.0 m in 0.2 m steps;
   - 7 forced packs, including 2 Li-ion;
   - folding props, and folding props with the lean BOM;
   - 4 tiltrotors, 1 tilt-wing, 2 tailsitters;
   - box-wing and tandem-wing quadplanes.
3. **Physics reuse** (detail in the header comment of `tradestudy.mjs`):
   - `model.js size()` is imported unchanged.
   - `sizing.mjs` cannot be imported, because importing it re-runs the script and rewrites `results.json`.
   - The twin-boom geometry (`sizing.mjs` lines 90–128) and the pack picker (lines 138–145) are re-implemented. The BOM starts from the C0 BOM lines in `results.json`.
   - **Reproduction check:** the script gives C0 MTOW 6.182 kg, 11.94 min and $1,897.92. That matches `results.json` exactly (`tradestudy.json reproductionCheck`).
4. **Configuration-specific physics** is in section 4. Each factor is either sourced or tagged EST.
5. **Scoring:**
   - Each criterion is mapped to 0–10 against fixed anchors rather than the min–max of the set, so scores do not move when variants are added. Section 6 gives the anchors.
   - The weighted total uses weights that sum to 1.00.
   - Feasibility flags, listed below, remove a variant from the ranking but keep it in the table.
6. **Feasibility, hard:**
   - R6: total ≤ $2,000, including 10.25 % tax and shipping.
   - R10: ≥ 10 min cruise after 2 min hover plus transitions, with a 20 % reserve.
   - R13: T/W ≥ 1.6.
   - Hover current ≤ the pack's continuous rating.
   - R3: span 2–3 m.
   - R4: longest piece ≤ 1.5 m.
   - R2: MTOW < 25 kg.
   - Scaled joiner reserve factor ≥ 1.0.
7. **Warnings, soft:**
   - R7: reserve < $100.
   - Below the 11.5 min design margin.
   - R16: gust tilt > 15°.
   - R1 departure.
   - Spar fit.
   - MTOW below the 8–15 kg working band.

## 2. Results

### 2.1 Ranking, feasible and R1-compliant (lift + cruise)

| Rank | Variant | Score | MTOW kg | Cruise min | T/W | Total $ | Reserve $ | Note |
|---|---|---|---|---|---|---|---|---|
| 1 | C0-lean | 6.18 | 6.18 | 11.9 | 2.03 | 1,788.61 | 211.39 | No airspeed sensor; control risk 3 |
| 2 | C3 (X3515S 16 in) | 5.95 | 6.18 | 11.6 | 2.17 | 1,883.13 | 116.87 | Hover 916 W vs 832 W; motor heat not modelled (the review dropped C3 on heat) |
| 3 | C0-lean-fold | 5.91 | 6.23 | 14.3 | 2.01 | 1,892.43 | 107.57 | Folding-prop CdA EST |
| 4 | C0-b3.0 (3.0 m span) | 5.87 | 6.05 | 12.8 | 2.07 | 1,897.92 | 102.08 | Joiner RF 1.85 → 1.51 (scaled); wing half 1.50 m = R4 limit |
| 5 | C0-pk-HOOVO 8000 | 5.84 | 6.39 | 15.4 | 1.96 | 1,965.18 | 34.82 | R7 reserve below $100 |
| 6 | C0-b2.8 | 5.82 | 6.09 | 12.6 | 2.06 | 1,897.92 | 102.08 | |
| 7 | C0 (baseline v0.3.1) | 5.79 | 6.18 | 11.9 | 2.03 | 1,897.92 | 102.08 | |

### 2.2 Ranking, feasible including R1 departures

| Rank | Variant | Score | MTOW kg | Cruise min | T/W | Total $ | Reserve $ | Main risk |
|---|---|---|---|---|---|---|---|---|
| 1 | TS-quad (quad tailsitter) | 7.37 | 5.19 | 22.3 | 2.41 | 1,728.66 | 271.34 | R1; hover in wind (30° gust tilt); no motor-out |
| 2 | TS-duo (twin-motor tailsitter) | 6.31 | 4.70 | 28.5 | 2.47 | 1,857.45 | 142.55 | R1; weathervaning crashes reported [S25]; any motor-out is fatal |
| 3 | C0-lean | 6.18 | 6.18 | 11.9 | 2.03 | 1,788.61 | 211.39 | — |
| 4 | C3 | 5.95 | 6.18 | 11.6 | 2.17 | 1,883.13 | 116.87 | — |
| 5 | C0-lean-fold | 5.91 | 6.23 | 14.3 | 2.01 | 1,892.43 | 107.57 | — |

### 2.3 All variants (from `tradestudy.json`)

- Empty frac = (MTOW − battery − 0.5 kg payload allowance) / MTOW.
- Disk = disk loading T/A.

| # | Variant | Feasible | R1 | MTOW kg | Empty frac | Disk N/m² | P_hover W | P_cruise W | L/D | Cruise min | T/W | Total $ | Reserve $ | Score | Flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | TS-quad | yes | no | 5.19 | 0.75 | 87 | 629 | 220 | 9.90 | 22.3 | 2.41 | 1728.66 | 271.34 | 7.37 | — |
| 2 | TS-duo | yes | no | 4.70 | 0.72 | 202 | 819 | 154 | 11.73 | 28.5 | 2.47 | 1857.45 | 142.55 | 6.31 | — |
| 3 | C0-pk-Zeee6S10000 | **no** | yes | 6.60 | 0.75 | 110 | 926 | 382 | 6.64 | 20.0 | 1.90 | 2048.30 | -48.30 | 6.27 | R6 over cap |
| 4 | C0-lean | yes | yes | 6.18 | 0.79 | 104 | 832 | 365 | 6.51 | 11.9 | 2.03 | 1788.61 | 211.39 | 6.18 | — |
| 5 | C0-pk-RobopowerUA 15000 Li-ion | **no** | yes | 6.85 | 0.73 | 115 | 986 | 392 | 6.71 | 31.0 | 1.83 | 2351.06 | -351.06 | 6.12 | R6 over cap |
| 6 | C3 | yes | yes | 6.18 | 0.79 | 117 | 916 | 358 | 6.65 | 11.6 | 2.17 | 1883.13 | 116.87 | 5.95 | — |
| 7 | C0-lean-fold | yes | yes | 6.23 | 0.79 | 104 | 843 | 302 | 7.94 | 14.3 | 2.01 | 1892.43 | 107.57 | 5.91 | — |
| 8 | C0-pk-Zeee6S9000 | **no** | yes | 6.58 | 0.75 | 110 | 922 | 381 | 6.64 | 17.4 | 1.90 | 2011.59 | -11.59 | 5.89 | R6 over cap |
| 9 | C0-b3.0 | yes | yes | 6.05 | 0.78 | 101 | 804 | 346 | 6.73 | 12.8 | 2.07 | 1897.92 | 102.08 | 5.87 | — |
| 10 | C0-pk-HOOVO6S8000 | yes | yes | 6.39 | 0.77 | 107 | 879 | 374 | 6.58 | 15.4 | 1.96 | 1965.18 | 34.82 | 5.84 | — |
| 11 | C0-b2.8 | yes | yes | 6.09 | 0.78 | 102 | 811 | 351 | 6.67 | 12.6 | 2.06 | 1897.92 | 102.08 | 5.82 | — |
| 12 | C0 | yes | yes | 6.18 | 0.79 | 104 | 832 | 365 | 6.51 | 11.9 | 2.03 | 1897.92 | 102.08 | 5.79 | — |
| 13 | C0-b2.4 (reproduction) | yes | yes | 6.18 | 0.79 | 104 | 832 | 365 | 6.51 | 11.9 | 2.03 | 1897.92 | 102.08 | 5.79 | — |
| 14 | C0-b2.6 | yes | yes | 6.13 | 0.78 | 103 | 821 | 357 | 6.60 | 12.3 | 2.04 | 1897.92 | 102.08 | 5.76 | — |
| 15 | C0-pk-OvonicRoam6S | yes | yes | 6.13 | 0.79 | 103 | 820 | 363 | 6.49 | 12.1 | 2.04 | 1903.43 | 96.57 | 5.75 | — |
| 16 | C0-pk-iFlightFullsendE | **no** | yes | 6.40 | 0.77 | 107 | 880 | 374 | 6.58 | 15.4 | 1.96 | 2015.88 | -15.88 | 5.66 | R6 over cap |
| 17 | C0-b2.2 | yes | yes | 6.25 | 0.79 | 105 | 846 | 376 | 6.39 | 11.5 | 2.00 | 1897.92 | 102.08 | 5.60 | — |
| 18 | C0-b2.0 | yes | yes | 6.55 | 0.77 | 110 | 915 | 400 | 6.30 | 14.1 | 1.91 | 1965.18 | 34.82 | 5.53 | — |
| 19 | C0-fold | **no** | yes | 6.23 | 0.79 | 104 | 843 | 302 | 7.94 | 14.3 | 2.01 | 2001.75 | -1.75 | 5.52 | R6 over cap by $1.75 |
| 20 | C0-pk-Auline 6S2P Li-ion | **no** | yes | 5.90 | 0.81 | 99 | 771 | 354 | 6.41 | 10.9 | 2.12 | 2108.49 | -108.49 | 5.13 | R6 over cap |
| 21 | C1 8-lift | **no** | yes | 7.55 | 0.78 | 81 | 901 | 535 | 5.43 | 12.5 | 1.95 | 2295.84 | -295.84 | 4.85 | R6 over cap |
| 22 | C2 coax X8 | **no** | yes | 6.57 | 0.80 | 141 | 919 | 358 | 7.06 | 11.5 | 1.75 | 2194.89 | -194.89 | 4.69 | R6 over cap |
| 23 | TA-qp tandem | **no** | yes | 6.30 | 0.79 | 105 | 857 | 364 | 6.64 | 11.8 | 1.99 | 2015.00 | -15.00 | 4.34 | R6 over cap |
| 24 | TR-bi bicopter | **no** | no | 5.78 | 0.77 | 248 | 1100 | 204 | 10.88 | 17.9 | 2.01 | 2155.92 | -155.92 | 3.91 | R6 over cap |
| 25 | TR-tri tilt-tricopter | **no** | no | 5.89 | 0.78 | 132 | 932 | 279 | 8.86 | 14.7 | 1.59 | 1931.24 | 68.76 | 3.80 | R13 T/W 1.59 |
| 26 | TR-quadF tilt-quad (front pair) | **no** | no | 6.23 | 0.79 | 104 | 843 | 329 | 7.94 | 13.2 | 2.01 | 2027.13 | -27.13 | 3.69 | R6 over cap |
| 27 | BW-qp box wing | **no** | yes | 6.63 | 0.78 | 111 | 934 | 382 | 6.68 | 14.7 | 1.89 | 2111.14 | -111.14 | 3.64 | R6 over cap |
| 28 | TW-4 tilt-wing | **no** | no | 6.42 | 0.79 | 108 | 886 | 280 | 9.62 | 15.1 | 1.95 | 2148.72 | -148.72 | 3.04 | R6 over cap |
| 29 | TR-quadA tilt-quad (all four) | **no** | no | 6.57 | 0.80 | 110 | 920 | 273 | 10.10 | 15.1 | 1.91 | 2216.43 | -216.43 | 2.92 | R6 over cap |

Criterion scores, the gust tilt and the scaled joiner reserve for each variant are in `tradestudy.json variants[].scores` and `.metrics`.

### 2.4 Sensitivity

- **Weights.** Each of the 8 weights was set to ×0.7 and ×1.3, with the other weights rescaled proportionally so the sum stays 1.0. That gives 16 cases.
  - The feasible winner stays TS-quad in all 16.
  - The feasible R1-compliant winner stays C0-lean in all 16.
  - C0-lean is in the feasible top 3 in every case (`sensitivity.cases`).
- **Hover-prop cruise efficiency.** This is the most uncertain configuration-specific factor (§4.3). The base case is 0.551; the best case is 0.60, with no penalty; the pessimistic case is 0.351.

  | Variant | Cruise min, pessimistic | Cruise min, base | Cruise min, best | Score, pessimistic | Score, base | Score, best | Feasible if pessimistic? |
  |---|---|---|---|---|---|---|---|
  | TS-quad | 14.2 | 22.3 | 24.3 | 6.51 | 7.37 | 7.37 | yes |
  | TR-tri | 12.1 | 14.7 | 16.0 | — | — | — | no (T/W 1.54) |
  | TR-quadF | 12.2 | 13.2 | 14.3 | — | — | — | no (over cap) |
  | TR-quadA | 12.5 | 15.1 | 16.5 | — | — | — | no (over cap) |
  | TW-4 | 12.4 | 15.1 | 16.4 | — | — | — | no (over cap) |

  The tilt designs stay infeasible in every case.
- **Stopped lift-prop drag on C0** (CdA_rotor = 0.0034 m² EST):

  | CdA_rotor factor | L/D | Cruise min | Pack the picker chooses | Total |
  |---|---|---|---|---|
  | ×0.5 | 7.93 | 14.5 | Ovonic 6500 | $1,897.92 |
  | ×1 | 6.51 | 11.9 | Ovonic 6500 | $1,897.92 |
  | ×2 | 4.94 | 13.0 | Zeee 9000 | $2,011.59 (**over cap**) |

  With the Ovonic pack fixed (direct `model.js` run): ×1.5 gives 10.13 min and ×2 gives 8.79 min, which fails R10.

### 2.5 Findings that bear on the design
1. **Parked-prop drag.** See the verdict. It is the largest lever on R10 and the least-known input. Folding props help if the 50 % CdA estimate holds, but they cost +$94.17 before tax (3 Eolo pairs at $49.99 replace 3 JeeFly pairs at $18.60), which only fits with the lean BOM.
2. **Span.** Going to 2.8–3.0 m is free in cost and adds 0.7–0.9 min of cruise.
   - It lowers the scaled joiner reserve factor from 1.85 to 1.61 (2.8 m) and 1.51 (3.0 m).
   - At 3.0 m the wing halves are 1.50 m, exactly at the R4 working envelope.
   - At 2.0 m span C0 no longer meets the 11.5 min margin on the 6500 pack. It needs the HOOVO 8000, and the reserve falls to $34.82.
3. **Packs.** No pack above 8000 mAh fits under the cap with the C0 BOM. The Li-ion packs ([S13], [S14]) are over the cap. The 6S3P 15000 Li-ion would give 31 min, but costs $550 for two packs.
4. **8-lift and coaxial X8** stay over the cap, by $295.84 and $194.89. Their only advantage is hover motor-out tolerance (score 10 vs 4).
5. **Tilt-tricopter.** This is the cheapest R1 departure at $1,931.24, but 3 × X4110S gives T/W 1.59, which fails R13 (needs ≥ 1.6). It would need a bigger front motor, and those cost more (X4120 at $105.99 [S6]).
6. **Tailsitter.** Its numbers come from removing the pusher, booms, H-tail, gear and parked-prop drag. The penalties:
   - hover exposure: the planform faces the wind, so it needs 30° of tilt at 8 m/s gust [S5 Cd], and gust drift is 10× with the wing exposed [S30];
   - no weathervane assist in ArduPilot [S18];
   - no motor-out tolerance;
   - landing on fins.
   - Its CLmax of 1.0 and CD0 of 0.026 are EST.

## 3. Per-configuration findings (literature)

Abbreviations: AP = ArduPilot, MO = motor-out, FM = figure of merit.

| Configuration | Hover efficiency / disk loading | Cruise L/D | Empty-weight fraction | Transition risk | Control complexity | Failure modes | ArduPilot support | Small-UAV examples |
|---|---|---|---|---|---|---|---|---|
| **Lift+cruise 4-lift (C0, Alia-style)** | Separate lift rotors, low disk loading: C0 104 N/m² (model). NASA L+C concept: aircraft FM 0.74, highest of the concepts, "due to low download" [S31] | NASA L+C L/De 7.2–8.5 [S31]; C0 6.51 (model). Lift props cost about 25 % cruise power on a 3DR Aero quadplane [S33] | NASA L+C battery: empty 7001 lb / gross 8210 lb [S31]; C0 0.79 (excl. battery and payload) | Low: lift motors taper off over Q_TRANSITION_MS once AIRSPEED_MIN is reached (avionics-autopilot.md §1.2) | Lowest; PX4 calls Standard VTOL the "easiest to control" [S19] | No hover MO: one AP developer said a quad with one motor out "is not flyable" [S27]; QuadPlane thrust-loss detection only warns [S28]; motor saturation crashes [S34]; transition thrust-loss crash [S35] | Full, Q_FRAME_CLASS 1, documented path [S17] | DeltaQuad Evo: 10 kg MTOW, 2.69 m span, 4.8 kg empty [S36]; Skywalker X8 quadplane 5.1 kg [S33] |
| **8-lift (C1)** | 81 N/m² (model); C1 needs a bigger pack | 5.43 (model; 8 parked props + 4 booms) | 0.78 (model) | As C0 | Octa class 3 listed, no ordering table [S17] | MO survivable only with headroom, forum evidence only [S28] | Supported (class 3) | Porter OctaQuadPlane (AP building guide) [S37]; specs — |
| **Coaxial X8 (C2)** | Coax pair costs 22 % more power at z/D > 0.25, 26–27 % at z/D 0.05, vs two isolated rotors; T-Motor 16×5.4 in tests [S1]. Mach-scale: +33 % induced power vs isolated [S2b] | 7.06 (model; 4 parked stacks) | 0.80 (model) | As C0 | OctaQuad class 4 has a documented X8 output map [S17]; needs an H7 board | Lower rotor carries less; MO yaw coupling (forum *snippet, unverified*) | Supported (class 4) | Porter OctaQuadPlane [S37] |
| **Tilt-tricopter** | Tilting front rotors hover as C0; rear rotor carries the CG-dependent share | Cruise on hover props: peak η 0.624 vs 0.680 for a cruise prop [S2] | 0.78 (model) | Medium: tilt-rate and Q_TILT_MASK errors cause crashes (*snippet, unverified*) [S15] | Tilt servos plus vectored yaw; servos "must move fast under load" [S26] | Tilt-servo gear stripping [S26]; no hover MO | Supported (Q_TILT_TYPE 0/1/2, Q_TILT_MASK) [S15]; PX4 reference is E-flite Convergence [S19] | E-flite Convergence: 650 mm, 771 g [S38]; HEE WING T1: 730 mm, 600–750 g [S39]; Foxtech Nimbus, 1.8 m (*snippet*); Trinity class, 5.75 kg / 2.39 m (*snippet, unverified*) |
| **Quad tilt** | As C0 | All rotors in the cruise stream: no parked-prop drag but hover-prop η | 0.79–0.80 (model) | High: an all-four-tilt builder hit inverted roll/yaw after transition and moved to Copter [S23] | 4 tilt actuators, 13 outputs | 4 servo single points | Generic tilt page covers it [S15]; thin community evidence | Mousaei et al.: 4.6 kg, 2.0 m, 4 × MG996R tilt servos [S29]; Wingcopter 198: 25 kg, 8 motors [S40] |
| **Bicopter tiltrotor** | 2 large rotors: disk loading 248 N/m² (model) | 10.88 (model; no parked rotors) | 0.77 (model) | Very high | Pitch in hover only by tilting | Any MO is fatal | Q_TILT_TYPE 3 with class 10; a 2022 builder gave up on AP [S22] | None credible in class (—) |
| **Tilt-wing** | Wing aligned with the slipstream in hover (no download) | GL-10 designed to L/D about 20 [S41]; Kasliwal tilt-rotor/wing model L/D 17 (13–20), DL 450 N/m² [S42] | Historical tilt-wings had a low useful-load fraction [S43] | High: GL-10 flights exceeded the tilt-actuator design load [S43] | Wing pivot plus pitch fan; Q_TILT_WING_FLAP only [S15] | Wing stall in transition; actuator overload [S43] | Mentioned only; CL-84 is the only documented build [S24] | NASA GL-10: 10 ft span, 62 lb [S43]; Unique Models CL-84: 1.7 kg [S24] |
| **Quad tailsitter** | Wing in the slipstream; 87 N/m² (model, 17 in props) | 9.90 (model); a VFS 2024 paper reports up to 28 % lower minimum power (*snippet, unverified*) | 0.75 (model): no pusher, booms or gear | Medium-high in wind: PX4 "harder to control, especially in wind" [S19] | No tilt hardware; Q_TAILSIT_* tuning | Gust drift 0.820 m with wing extended vs 0.081 m retracted at about 5 m/s [S30]; no weathervane assist [S18]; no MO | Supported (Q_TAILSIT_ENABLE 2, copter-motor) [S16] | PX4 references Skypull SP-1 and VALAQ Patrol [S44]; AP copter-tailsitter thread: 170 cm, 2.75 kg [S45] |
| **Twin-motor tailsitter** | 2 rotors: 202 N/m² (model) | 11.73 (model) | 0.72 (model) | High in wind: weathervaning destroyed one AP build [S25] | Elevons in the slipstream for hover control | Weathervaning, back-transition in headwind [S25]; any MO is fatal | Supported (class 10) [S16] | WingtraOne GEN II: 4.8 kg MTOW, 59 min, ground wind limit 8 m/s [S46] |
| **Alia-style** | = C0 (C0 is labelled "Alia-style" in sizing.mjs) | BETA ALIA: 4 lift props + 1 cruise prop, 50 ft span; L/D — [S47] | — | As C0 | As C0 | As C0 | As C0 | BETA ALIA (full scale) [S47] |
| **Box / joined wing** | Lift system as C0 | Same-span box wing at h/b 0.2: induced drag 0.680 (Prandtl) to 0.715 (Rizzo) of the reference [S3]; +3.4 % for stability split [S3]. At the same speed each panel runs at half the Re, so mono L/D 14.98 vs box 13.40 at α 5° [S21] | Mass penalty — (no source) | As C0 | QuadPlane controls; front/rear wing stability conflict [S3] | — (none documented) | No dedicated support; configured as a quadplane | Atmos Marlyn (*snippet, unverified*) |
| **Tandem wing** | Rotors on wing nacelles, no booms | Equal-span, zero-gap tandem ≈ monoplane of the same span (Munk stagger theorem: σ → span ratio as gap → 0) [S4] | — | As C0 | QuadPlane controls; pitch stability without a tail is CG-sensitive | — (none documented) | No dedicated support; a Vahana-like attempt moved to Copter [S23] | FAU 2020 senior design (goal only) [S48] |

## 4. Configuration-specific physics in `tradestudy.mjs`

| Factor | Value used | Source / derivation |
|---|---|---|
| Coaxial loss | kCoax 1.282 (22 %), already in sizing.mjs | [S1]: 22 % at z/D > 0.25; 26–27 % at z/D 0.05 |
| Hover-prop cruise efficiency (tiltrotor, tilt-wing, quad tailsitter) | η 0.60 × 0.624/0.680 = **0.551** (base); 0.351 pessimistic; 0.60 best | [S2] UIUC: APC SF 10×4.7 peak 0.624 at J 0.438, 0.398 at J 0.577; APC E 10×7 peak 0.680. Base = hover prop at its own peak (EST) |
| Stopped-rotor drag | Only stopped rotors keep CdA_rotor (scaled by n_stopped/n_lift) | sizing.mjs CdA_rotor 0.0034 EST; Bacchini 2021: retracting lift props cut parasite drag 38 % [S20] |
| Folding lift props | CdA_rotor × 0.5 (EST), +10 g/prop (EST) | No measured value found; mass unit unclear on [S12] |
| Tilt axis mass | 60 g servo + 44 g ServoBlock + 30 g yoke (EST) = 134 g per axis | [S7], [S8]. Mousaei et al. use 4 × MG996R (55 g each, about 4.8 % of 4.6 kg, servos only) [S29], [S49] |
| Tilt-wing pivot | 2 axes + 2 bearings (23 g each) + 30 g yoke + 150 g reinforcement (EST) + V3508 tail fan set | GL-10 gives actuator mass only qualitatively [S43]; bearing mass from the AndyMark FR82RS page; V3508 from budget-lift.md B3 |
| Box wing | e / (0.715 × 1.034) = e / 0.739; foam density halved (two half-chord wings in F11); spar mass × 1.5 (EST); 2 tip plates 0.107 kg | [S3] Rizzo eq. 3 at h/b 0.2 plus the stability split; F11 form from model.js |
| Tandem wing | e unchanged; foam density halved; spar × 1.5 (EST); 4 × 0.33 m nacelles; pod 0.85 → 1.2 m (mass × length, EST) | [S4] Munk stagger theorem (Larrabee) |
| Low-Re penalty (half chord) | ΔCD0 = 0.012 × (2^0.2 − 1) = 0.0018 (EST) | Turbulent Cf ∝ Re^−0.2; direction confirmed by [S21] |
| Tailsitter airframe | CLmax 1.0, CD0 0.026, fins 80 g, tail-area ratio 0.06 (all EST) | Tail and gear removed from the repo's 0.030 EST |
| Hover gust exposure | F = ½ρV²A·1.28 at V = 8 m/s (R16); tilt = atan(F/W) | Flat-plate Cd 1.28 [S5]. A = planform S for tailsitter/tilt-wing; side or frontal area otherwise |
| Joiner reserve | MS_J(C0) × (W₀b₀)/(Wb) | sizing.mjs line 257 (M_root = n_ult W b / 3π) |
| X4120 V3 480KV (2-rotor designs) | EOLO 15×8 table at 22.2 V, T_max 5800 gf, 292 g | [S6] |

## 5. Weighted criteria and rationale

Weights sum to 1.00. The anchors are fixed (`tradestudy.json criteria`).

| Criterion | Weight | 0–10 mapping | Why this weight |
|---|---|---|---|
| Cost margin under the cap | 0.15 | Reserve: $0 → 0, ≥ $300 → 10 | R6 is fixed, and R7 needs a crash reserve. A first build usually crashes at least once. Over-cap designs are already removed, so this weighs margin only. |
| Mission energy margin | 0.15 | 10 min → 0, 20 min → 10 | Drag, η and e are estimates (EST tags in sizing.mjs). Margin is what absorbs model error before R10 fails; the CdA sensitivity in §2.4 shows how fast it goes. |
| MTOW / portability | 0.10 | 0.7 × (5 kg → 10, 15 kg → 0) + 0.3 × (3 pieces → 10, −2 per extra piece) | R4/R5. Envelope failures are hard flags; this ranks ease of carrying within the envelope. Lighter scores higher because the 8–15 kg band is a portability limit. |
| Build complexity | 0.15 | Index = motors + servos + 3 × tilt axes + 6 × wing pivot + wing panels + boom segments + 2 × special joints; 12 → 10, 32 → 0 | R8. Four students with a printer and hand tools; every actuator and joint is build, wiring and test time. |
| Control / transition risk | 0.15 | 10 − rubric (0 = documented reference path, 10 = no working reference) | Most small-VTOL losses in the forum record happen in hover tuning or transition (§3). R17 requires maintained support. |
| Schedule risk | 0.10 | 10 − rubric (redesign scope from v0.3.1, new mechanisms, lead time) | About 6 months remain to 2027-04-30. C0 already has CAD, BOM and analysis. |
| Robustness to motor-out | 0.10 | Hover MO 0–6 (6 if T/W with a pair out ≥ 1.2) + cruise propulsion-out recovery 0–4 | R14 is desired and R15 assumed. Weighted below cost and controls because R14 was accepted with hover limits. |
| Growth / payload margin | 0.10 | kg before T/W reaches 1.6: 0 → 0, ≥ 3 kg → 10 | Mass growth during a build is normal and must not break R13. R12 holds 0.5 kg. |

Control and schedule rubric values are engineering judgements (EST). The evidence for each variant is in `tradestudy.json variants[].inputs.controlRiskWhy` and `scheduleRiskWhy`.

## 6. Component prices added for this study (read 2026-10-21)

| Item | Price | Mass | Source |
|---|---|---|---|
| goBILDA 2000-25-2 servo (21.6 kg·cm at 6 V, steel gear) | $36.99 | 60 g | [S7] |
| ServoCity Compact ServoBlock H25T | $29.99 | 44 g | [S8] |
| AndyMark FR82RS flanged bearing, ½ in bore | $3.60 | about 23 g | https://www.andymark.com/products/1-2-in-id-1-1-8-in-od-sealed-flanged-bearing-fr82rs |
| Holybro Kakute H743-Wing (14 PWM) | $105.00 | 28 g | [S9] |
| SunnySky X4120 V3 480KV | $105.99 (search listing) | 292 g | [S6] |
| Hobbywing Skywalker 100A V2 ESC | $49.99 | 92 g (*snippet, unverified*) | [S10] |
| APC 15x8E | $8.05 | 44 g | [S11] |
| Eolo foldable CN 17x6.2 (pair) | $49.99 | — (page shows "354", unit unclear) | [S12] |
| RobopowerUA 6S3P 15000 Li-ion (324 Wh, 180 A max) | $275.00 | 1350 g | [S13] |
| Auline 6S2P 6000 Li-ion (130 Wh, 90 A) | $164.99 | 594 g | [S14] |
| EMAX ES3005HV: 8–11 kg·cm, **too weak for tilt** | €23.79 (EU) | 43 g | https://www.rotorama.com/product/emax-es3005hv |

Not used in the scoring (reference only):
- Zeee 6S 10000 2-pack on zeeebattery.com is $305.99 versus $275.39 in results.json from 2026-10-13. The repo price was kept for consistency; the newer price makes that variant further over the cap.
- Freeman 2100 kit (2.1 m, 6.5 kg max takeoff mass): 6,500 PLN excl. VAT, airframe only. https://bzbuas.com/shop/236004352-freeman-2100-diy-kit-467
- No VTOL kit in the 2–3 m class came close to the scratch-build cost.

## 7. Limits and what the team must measure

Model limits:
- Rubric scores are judgement.
- Tailsitter and tilt-wing aerodynamics (CLmax, CD0, transition stall margin) are EST.
- Motor heat, tilt-servo loads and CG/stability are not modelled for the alternatives.
- Joiner reserves for box and tandem are not computed, because their second spar does not fit (flagged).

Measurements:
- **M1. Stopped-prop drag.**
  - What: drag of one parked 17×5.5 prop plus motor at 20 m/s.
  - How: car-top balance or a hanging-scale drag rig.
  - Threshold: above 0.0051 m² CdA (1.5× EST), C0 on the 6500 pack falls to 10.1 min and is at the R10 limit.
- **M2. Folded-prop behaviour.**
  - What: whether the Eolo 17×6.2 folds and trails, or windmills, when the motor is stopped at 20 m/s.
  - How: car-top test.
  - Threshold: if it windmills, C0-lean-fold loses its gain. It falls back to roughly C0-lean's 11.9 min while holding $103.82 less reserve, so the folding props are not worth buying.
- **M3. Wing-half length versus the car.**
  - What: the 1.5 m length limit, if a 2.8–3.0 m span is adopted.
  - How: tape measure in the team's car.
  - Threshold: a clear length under 1.40 m (2.8 m span) or 1.50 m (3.0 m span) fails R4.

## 8. References (all checked 2026-10-21)

Physics and configuration literature
- [S1] Brazinskas, M.; Prior, S.D.; Scanlan, J.P. "An Empirical Study of Overlapping Rotor Interference for a Small Unmanned Aircraft Propulsion System." *Aerospace* 3(4):32, 2016. https://mdpi-res.com/d_attachment/aerospace/aerospace-03-00032/article_deploy/aerospace-03-00032.pdf
- [S2] Brandt, J.B.; Deters, R.W.; Ananda, G.K.; Selig, M.S. UIUC Propeller Data Site, Vol. 1: APC SF 10×4.7 (4014 rpm) and APC E 10×7 (4007 rpm). https://m-selig.ae.illinois.edu/props/volume-1/propDB-volume-1.html; data files https://m-selig.ae.illinois.edu/props/volume-1/data/apcsf_10x4.7_kt0836_4014.txt and https://m-selig.ae.illinois.edu/props/volume-1/data/apce_10x7_pg0812_4007.txt
- [S2b] Cameron, C.G.; Karpatne, A.; Sirohi, J. "Performance of a Mach-Scale Coaxial Counter-Rotating Rotor in Hover." *J. Aircraft* 53(3), 2016, doi:10.2514/1.C033442. https://sites.utexas.edu/sirohi/files/2017/07/031_cameron16_joa.pdf
- [S3] Schiktanz, D.; Scholz, D. "The Conflict of Aerodynamic Efficiency and Static Longitudinal Stability of Box Wing Aircraft." CEAS 2011. https://www.fzt.haw-hamburg.de/pers/Scholz/Airport2030/Airport2030_PUB_CEAS_11-10-24.pdf
- [S4] Larrabee, E.E. "Trim Drag in the Light of Munk's Stagger Theorem." NASA NTRS 19760003933. https://ntrs.nasa.gov/api/citations/19760003933/downloads/19760003933.pdf
- [S5] NASA Glenn Research Center. "Shape Effects on Drag" (flat plate Cd = 1.28). https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/shape-effects-on-drag/
- [S20] Bacchini, A.; Cestino, E.; Van Magill, B.; Verstraete, D. "Impact of lift propeller drag on the performance of eVTOL lift+cruise aircraft." *Aerospace Science and Technology* 109:106429, 2021 (abstract). https://api.semanticscholar.org/graph/v1/paper/DOI:10.1016/j.ast.2020.106429?fields=title,abstract,authors,year,venue
- [S21] Saha, S. "Investigation of Flight Conditions where Box-Wing Outperforms Mono-Wing Configurations for Small UAVs." arXiv:2112.02872v2, 2024. https://arxiv.org/html/2112.02872v2
- [S29] Mousaei, M.; Geng, J.; Keipour, A.; Bai, D.; Scherer, S. "Design, Modeling and Control for a Tilt-rotor VTOL UAV in the Presence of Actuator Failure." arXiv:2205.05533v2, 2023. https://arxiv.org/pdf/2205.05533
- [S30] Liang, J.; Guo, H.; Lyu, X. "Design and Control of a Coaxial Dual-rotor Reconfigurable Tailsitter UAV Based on Swashplateless Mechanism." arXiv:2511.04251v1, 2025. https://arxiv.org/pdf/2511.04251
- [S31] Silva, C.; Johnson, W.; Antcliff, K.R.; Patterson, M.D. "VTOL Urban Air Mobility Concept Vehicles for Technology Development." AIAA Aviation 2018. https://rotorcraft.arc.nasa.gov/Publications/files/vtol-urban-air-2.pdf
- [S32] Bacchini, A.; Cestino, E. "Electric VTOL Configurations Comparison." *Aerospace* 6(3):26, 2019. Table 16 disk loading: E-Hang 440 N/m², Cora 880 N/m², Lilium 7500 N/m²; Cora max L/D 13.9. https://mdpi-res.com/d_attachment/aerospace/aerospace-06-00026/article_deploy/aerospace-06-00026.pdf
- [S41] Fredericks, W.J.; Moore, M.D.; Busan, R.C. Greased Lightning (GL-10) design, NTRS 20140001088 (abstract: L/D about 20). https://ntrs.nasa.gov/citations/20140001088
- [S42] Kasliwal, A. et al. "Role of flying cars in sustainable mobility." *Nature Communications* 10:1555, 2019. https://pmc.ncbi.nlm.nih.gov/articles/PMC6456499/
- [S43] Fredericks, W.J.; McSwain, R.G.; Beaton, B.F.; Klassman, D.W.; Theodore, C.R. "Greased Lightning (GL-10) Flight Testing Campaign." NASA/TM-2017-219643. https://ntrs.nasa.gov/api/citations/20170007194/downloads/20170007194.pdf
- [S49] Tower Pro MG996R product page (55 g). https://www.towerpro.com.tw/product/mg996r/
- Mathur, A.; Atkins, E. "Wind Tunnel Testing and Aerodynamic Characterization of a QuadPlane Uncrewed Aircraft System." arXiv:2301.12316, 2023. https://arxiv.org/html/2301.12316. Hybrid mode had the highest drag; rotor drag not isolated.
- Martinez, M.; Cuerno, C. "Preliminary Aerodynamic Investigation of an Unmanned Box-Wing Aircraft." ICAS 2012 paper 438. https://icas.org/ICAS_ARCHIVE/ICAS2012/PAPERS/438.PDF
- Not retrieved (paywalled or blocked), so not used for numbers: Ramasamy, AHS Forum 69 (2013); Lyu et al., ICRA 2017 (abstract only, via https://api.openalex.org/works/doi:10.1109%2FICRA.2017.7989452); Misra et al. 2022 (abstract only); Ducard & Allenspach 2021; Saeed et al. 2018.

Autopilot documentation
- [S15] ArduPilot Plane, Tilt-rotor guide. https://ardupilot.org/plane/docs/guide-tilt-rotor.html
- [S16] ArduPilot Plane, Tailsitter guide. https://ardupilot.org/plane/docs/guide-tailsitter.html
- [S17] ArduPilot Plane, QuadPlane frame setup. https://ardupilot.org/plane/docs/quadplane-frame-setup.html
- [S18] ArduPilot Plane, QuadPlane weathervaning. https://ardupilot.org/plane/docs/quadplane-weathervaning.html
- [S19] PX4 User Guide, VTOL frames overview. https://docs.px4.io/main/en/frames_vtol/
- [S28] ArduPilot Plane, QuadPlane thrust loss. https://ardupilot.org/plane/docs/quadplane-thrust-loss.html
- [S37] ArduPilot Plane, QuadPlane building guide. https://ardupilot.org/plane/docs/quadplane-building.html
- [S44] PX4 User Guide, Tailsitter. https://docs.px4.io/main/en/frames_vtol/tailsitter.html
- ArduPilot Plane, QuadPlane reliability. https://ardupilot.org/plane/docs/quadplane-reliability.html
- ArduPilot Plane, QuadPlane tips. https://ardupilot.org/plane/docs/quadplane-tips.html

Build logs and forum evidence (credible but anecdotal)
- [S22] https://discuss.ardupilot.org/t/parameter-setting-for-bicopter-with-tilt-rotors/91020
- [S23] https://discuss.ardupilot.org/t/arduplane-tilt-quadplanes-with-all-four-motors-tilting/23794
- [S24] https://discuss.ardupilot.org/t/ardupilot-flying-on-the-cl84-tiltwing-vtol-aircraft/14353
- [S25] https://discuss.ardupilot.org/t/dual-motor-tailsitters/15302?page=53 and https://discuss.ardupilot.org/t/tailsitter-struggling-to-go-back-to-hover-in-windy-conditions/74586
- [S26] https://discuss.ardupilot.org/t/tilt-servos-failing-frequently/68185
- [S27] https://discuss.ardupilot.org/t/would-it-be-possible-for-arducopter-to-recover-from-losing-a-motor/114978
- [S33] https://discuss.ardupilot.org/t/a-tale-of-two-quadplanes/18856 and https://discuss.ardupilot.org/t/questions-and-observations-from-my-quadplane-maiden/10035
- [S34] https://discuss.ardupilot.org/t/quadplane-ranger-fell-out-of-sky/63807
- [S35] https://discuss.ardupilot.org/t/quadplane-failed-to-complete-transition-and-motors-then-turned-off-causing-crash/140907
- [S45] https://discuss.ardupilot.org/t/copter-tailsitters/45514

Vehicles and makers
- [S36] DeltaQuad Evo specifications. https://docs.deltaquad.com/evo/vehicle-specifications. Spec values only. The page also contains embedded instructions aimed at automated agents; they were ignored.
- [S38] E-flite Convergence. https://www.skyraccoon.com/aircraft/E-flite_Convergence_EFL11075
- [S39] HEE WING T1 Ranger VTOL. https://www.fpvfaster.com.au/products/hee-wing-t1-ranger-twin-motor-wing-vtol-pnp-w-fc
- [S40] Wingcopter 198. https://wingcopter.com/wingcopter-198
- [S46] WingtraOne GEN II. https://wingtra.com/wingtraone-gen-ii-drone/
- [S47] BETA Technologies, ALIA. https://www.beta.team/aircraft/. Also AOPA, 2024-04-24: https://aopa.org/news-and-media/all-news/2024/april/24/beta-achieves-manned-evtol-transition
- [S48] FAU senior design, Fall 2020. https://www.fau.edu/engineering/senior-design/projects/fall2020/hybrid-fixed-wing-quad-rotor-drone/

Component pages: [S6]–[S14] as listed in §6 and in `tradestudy.mjs SOURCES`.
