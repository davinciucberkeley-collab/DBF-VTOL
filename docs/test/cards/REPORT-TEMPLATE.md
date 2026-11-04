# Test report — DBF-TR-___ (one per test or session)

| Field | Entry |
|---|---|
| Test ID(s) and title | |
| Plan revision | DBF-TP-001 rev B |
| Date, start–end time | |
| Site (and flight request number for on-campus) | |
| Crew: TD / SO / PIC / GCS / VO | |
| Article: airframe build state, motor/ESC/prop/servo serials, pack A/B | |
| Firmware version and hash; parameter file commit | |
| Weather: wind steady/gust (m/s), temp (°C), pressure, visibility | |
| Take-off mass (kg), CG (% MAC), ballast | |

## 1. Objective (copy from TEST-PLAN.md)

## 2. Configuration and deviations from the card
List every parameter changed for the test and confirm restoration (check_params.py output attached).

## 3. Run table
| Run | Time | Point reached | Condition | Result | Notes / anomalies |
|---|---|---|---|---|---|

## 4. Measured vs predicted
| Quantity | Predicted (source) | Pass criterion (source) | Measured | Pass / fail |
|---|---|---|---|---|

## 5. Anomalies and actions
Each anomaly: what, when (log time), suspected cause, action, owner, due date.

## 6. Data files
Log names per TEST-PLAN.md §10 (`YYYY-MM-DD_<TestID>_r<n>_C0.<ext>`), script outputs attached (thrust_stand.py / battery_test.py / log_summary.py).

## 7. Decision
PASS / PASS WITH LIMITS (state them) / FAIL (state the re-test condition). Requirement(s) closed: ____ . Update test-matrix.csv status.

Signed: TD ______ SO ______ Date ______
