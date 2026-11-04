# Data sheet DS-G03 — Full-system tied-down run (includes C13 and E09)
DBF-TP-001 rev B data sheet · Test G03 / C13 / E09 · Date ____ · Operator ____ · Witness ____ · Article/serials ____

Restraint: ____ ties, rated ____ kg each, to the leg clamps (total > 12.5 kgf). Crew ≥ 5 m behind a barrier. Watt meter in line. Logging on.

| Step | Command | Duration | Pack V (W-meter) | I (A) W-meter | I (A) FC log | V/cell min | VIBE X/Y/Z max | Clip | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | QSTABILIZE hover throttle (~52 %) | 60 s | | | | ≥ 3.4 | < 30 | 0 | |
| 2 | 100 % all four (burst) | 3 s | | | | ≥ 3.2 | | | |
| 3 | FBWA pusher 100 % | 10 s | | | | | | | |
| 4 | hover + pusher 75 % (transition) | 10 s | | | | | ≤ 85 A total | | |

Predicted: 41.2 A hover at 22.2 V, 43.6 A at 21 V, 75.7 A transition (results.json sized v0.4).

## Temperatures within 30 s (IR)
| M1 | M2 | M3 | M4 | pusher | ESC1 | ESC2 | ESC3 | ESC4 | ESC pusher | XT90-S | XT60H max | pack lead | FC board | pack |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | | |
Pass: motors ≤ 80 °C EST; ESC ≤ 70 °C EST; connectors/wire ≤ 60 °C EST; no discolouration; no desync; witness marks unmoved after.
Compassmot interference (G04): ____ % (≤ 30 % EST) · heading change idle→hover: ____ ° (< 10°).

## Result
PASS / FAIL · Deviations: ____ · Signed (TD) ______ Date ______
