# Data sheet DS-C11 — Battery capacity, sag and internal resistance
DBF-TP-001 rev B data sheet · Test C11 · Date ____ · Operator ____ · Witness ____ · Article/serials ____

Pack: Ovonic 6S 6500 100C s/n ____ (A / B) · nameplate 144.3 Wh (results.json packs[0]) · charger HTRC C150 · load: ____ · watt meter s/n ____ · LiPo bag under the pack.

Full charge: resting ____ V (≥ 25.1) · cells (balance readout) ____ / ____ / ____ / ____ / ____ / ____ · pack temp start ____ °C

## Discharge log at 15 ± 2 A (cruise current 15.2 A, results.json sized.I_cruise) (every 30 s; or film the watt meter and transcribe). Save as CSV `t_s,volt_V,curr_A` for battery_test.py.
| t (s) | V (V) | I (A) | Ah | Wh | Note |
|---|---|---|---|---|---|
| 0 | | | | | |
| … | | | | | |
| end (21.0 V under load) | | | | | |

## Step loads at ~50 % delivered Ah
| Step | I before (A) | V before (V) | I during (A) | V during (V) | ΔV (V) | R_pack = ΔV/ΔI (mΩ) | R_cell = R_pack / 6 (mΩ) |
|---|---|---|---|---|---|---|---|
| 10 s at 41.2 A (hover, results.json sized.I_hover) | | | | | | | |
| 3 s at ~76 A (transition, sized.I_trans 75.7 A) | | | | | | | |

Pass: delivered ≥ 110 Wh to 3.50 V/cell under load; V/cell ≥ 3.4 at 41 A, ≥ 3.2 at 76 A; R_cell ≤ 7.3 mΩ EST ((3.70 − 3.40) / 41.2 A); pack ≤ 60 °C EST; packs within 3 %. **Hot-day acceptance:** R_cell > 5 mΩ = hot-day no-go (docs/research/thermal.md 6.4 item 2; TEST-PLAN §6).
Delivered Wh ____ · Ah ____ · min V/cell at 41 A ____ · at 76 A ____ · R_cell ____ mΩ (≤ 5 for hot days: Y / N; written on the pack label ☐) · max pack start temperature for a full mission 60 − 3.9 × R_cell = ____ °C (TEST-PLAN C11, §6) · temp end ____ °C · recovery V after 30 min ____ · mAh returned on charge ____

## Result
PASS / FAIL · Deviations: ____ · Signed (TD) ______ Date ______
