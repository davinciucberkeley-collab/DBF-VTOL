# Data sheet DS-S01 — Wing static proof load (limit 3.0 g)
DBF-TP-001 rev B data sheet · Test S01 · Date ____ · Operator ____ · Witness ____ · Article/serials ____

Article: complete wing on saddle + slip-fit joiner captured by the stop discs (C17 passed), M5 × 20 wing bolts 1.0 N·m EST (hardware-spec J10). Inverted on padded supports at ±0.10 m from centre. Tip gauges zeroed.

## Load schedule (TEST-PLAN.md S01; total 15.5 kg = 3.0 × (6.55 − 1.39) kg, results.json sized.m / m_wing v0.4, elliptic; bags at 30 % chord of the 284 mm chord)
| Station from centre (m) | 0.1 | 0.3 | 0.5 | 0.7 | 0.9 | 1.1 | per side |
|---|---|---|---|---|---|---|---|
| Mass per side at 100 % (kg) | 1.64 | 1.59 | 1.49 | 1.33 | 1.08 | 0.62 | 7.74 |
| at 25 % | 0.41 | 0.40 | 0.37 | 0.33 | 0.27 | 0.15 | 1.94 |
| at 50 % | 0.82 | 0.79 | 0.75 | 0.67 | 0.54 | 0.31 | 3.87 |
| at 75 % | 1.23 | 1.19 | 1.12 | 1.00 | 0.81 | 0.46 | 5.81 |

Actual bag masses used (kitchen scale): ____ (attach list)

## Deflection log
| Step | Left tip (mm) | Right tip (mm) | Sounds / observations | Socket foam cover ok? | Saddle bolts ok? |
|---|---|---|---|---|---|
| 0 % | 0 | 0 | | | |
| 25 % | | | | | |
| 50 % | | | | | |
| 75 % | | | | | |
| 100 % (start of 30 s hold) | | | | | |
| 100 % (end of hold) | | | | | |
| 75 % | | | | | |
| 50 % | | | | | |
| 25 % | | | | | |
| 0 % immediately | | | | | |
| 0 % after 5 min (residual) | | | | | |

Pass: tip at 100 % ≤ 120 mm; residual ≤ 2 mm EST; joiner straight ≤ 0.5 mm over 0.76 m; no crush; no loosening.
Predicted: 15.5 mm (FEA idealised joiner, CAD rev D, cad/sim/results.txt spar_tip_disp 23.2 mm × 3/4.5); real 15–60 mm EST. Joiner (slip fit, rev B) slid out post-test: straightness ____ mm; stop discs intact: Y / N.

## Result
PASS / FAIL · Deviations: ____ · Signed (TD) ______ Date ______
