# Tolerance analysis: 3D-printed parts and every fit they take part in

Date checked 2026-11-01. Data: `inventory/hardware/tolerances.json` (rules, fits, stack-ups, coupons for the CAD agent). Source keys S1..S13 and R1..R8 are listed in §9. Negative clearance is interference.

## 1. Verdict

The printed hardware as drawn does not fit first time. Six fits fail, five are marginal, and three stack-ups need action. The printer is not named in the repo (—); this analysis assumes a Prusa MK4S-class machine (S5) and the measured behaviour of that class (S1). The tubes in the BOM are drawn 6061-T6 aluminium, not carbon (R7, inventory M-06..M-10).

| # | Finding | Number |
|---|---|---|
| 1 | Joiner in spar socket (F-04) interferes at worst case | -0.43 / +0.88 mm vs the CAD 0.229 mm |
| 2 | Printed holes come out small; the saddle bore (+0.23) and the 4.0 insert bores are wrong | F-05a -0.27, F-14 |
| 3 | Elevator hinge gap is 1.51 mm in CAD against ±1.5 mm process error (S-09) | worst 0.01 mm |
| 4 | Wheel inner face is 3.9 mm inside the leg tube radius; axle stack overruns 0.75 mm worst case | F-26, F-27 |
| 5 | PETG clamp preload relaxes about 12 % in a day, 30 % in a week (EST) | §6 |

## 2. Process capability (assumed)

| Item | Value | Source |
|---|---|---|
| Printer | Prusa MK4S class, 250 x 210 x 220 mm, 0.4 mm nozzle, 0.20 mm layer | S5; assumed (—) |
| Materials | ELEGOO PETG (clamps, plates, pod parts); Polymaker PA6-CF20 (motor mounts, firewall, splice plug) | R5 sec. 5; inventory P-01, P-05 |
| Holes (XY) | printed 0.10 to 0.20 mm small (PETG, MK4S); 0.25 mm small (PLA) | S1; S2 |
| Outside XY | -0.3 % on 110 mm, about 0 on 22 mm | S1 |
| Z | +0.2 % (near caliper resolution) | S1 |
| Position error | ±0.15 mm within 50 mm | EST |
| Model used | printed hole = CAD - (0.10 to 0.25) ± 0.05 (EST); external = CAD x 0.997 ± 0.10 (EST) | S1, S2 |
| PA6-CF20 | test block 10 mm printed 9.73 (-2.7 %, axis unclear); XY ±0.25 %; absorbs 3.3 % water | S7 |
| Elephant foot | about 0.2 mm squish; chamfer first-layer edges 0.4 x 45 deg | S4 |
| Tubes (drawn 6061-T6) | OD ±0.008 in (±0.203 mm) for 5/8..1 in; wall ±0.0049 in (±0.124 mm). ID = OD - 2 wall | S6 |

Resulting tube ranges (calc): 25.4 tube OD 25.197..25.603; spar ID 22.001..22.906 (nominal 22.454); joiner OD 22.022..22.428; boom ID 23.170..24.074 (nominal 23.622). Tube tolerance is far coarser than ISO 286 grade 7 (21 µm at 22 mm); it is IT13 class (330 µm, S13). **Measure the real tubes and size to them.** S6 is a reseller's statement; OnlineMetals states none.

## 3. Fit table

CAD = dimension to model. Clear = min / max clearance in mm from the ranges above. Screw shanks and nut flats use nominal ISO values (S9, S10); nut minimum AF is EST (s - 0.2).

| ID | Fit (nominal) | CAD | Clear min / max | Verdict |
|---|---|---|---|---|
| F-01 | boom tube 25.4 in split-clamp bore (25.4 +-0.203) | 25 | -0.90 / -0.25 | pass |
| F-02 | boom tube in PA6-CF motor-mount clamshell bore (25.4 +-0.203) | d_meas-0.08 | -0.90 / -0.25 | marginal |
| F-03 | leg tube in gear clamp socket (25.4 +-0.203) | 25 | -0.90 / -0.25 | pass |
| F-04 | 0.875 joiner sliding in 1.000x0.058 spar ID (0.229 diametral) | 22.225 / 22.454 | -0.43 / +0.88 | fail |
| F-05a | joiner through saddle root-plate hole (22.225 +0.23) | 22.455 | -0.27 / +0.38 | fail |
| F-05b | same (22.225) | 22.85 | +0.12 / +0.78 | pass |
| F-06 | spar tube in foam socket (25.4) | 25.4 now -> 26.0 | — / — | marginal |
| F-07 | plug in boom ID 23.17..24.07 (23.622 nominal ID) | 23.2 -> 23.0 | -0.13 / +1.04 | marginal |
| F-08 | clearance hole M2 (2) | 2.6 | +0.30 / +0.55 | pass |
| F-09 | clearance hole M2.5 (2.5) | 3.1 | +0.30 / +0.55 | pass |
| F-10 | clearance hole M3 (3) | 3.6 | +0.30 / +0.55 | pass |
| F-11 | clearance hole M3 (3) | 3.8 | +0.50 / +0.75 | pass |
| F-12 | clearance hole M4 (4) | 4.7 | +0.40 / +0.65 | pass |
| F-13 | clearance hole M5 (5) | 5.7 | +0.40 / +0.65 | pass |
| F-14 | heat-set insert bore (OD 4.6) | 4.0 -> 4.2 | -0.70 / -0.45 | pass |
| F-15 | M3 nut trap across flats (5.5) | 5.9 | +0.10 / +0.55 | pass |
| F-16a | M5 nut pocket as drawn (8.0) | 8.0 | -0.30 / +0.15 | fail |
| F-16b | M5 nut pocket compensated (8.0) | 8.4 | +0.10 / +0.55 | pass |
| F-17 | M2 nut trap AF 4.0 (4.0, m 1.6) | 4.4 x 2.0 deep | +0.10 / +0.55 | fail |
| F-18a | head pocket as drawn (5.5 / 7.0) | 6.0 | -1.30 / +0.45 | fail |
| F-18b | pocket for head + ISO 7089 washer (7.0) | 7.6 | +0.30 / +0.55 | pass |
| F-19 | LE head-pin pocket (5.7) | 6.2 | +0.20 / +0.45 | pass |
| F-20a | TE tab 3.0 in slot 3.4 as drawn (3.0 / 3.4) | 3.4 | 0.00 / +0.46 | marginal |
| F-20b | same (3.0 / 3.6) | 3.6 | +0.20 / +0.66 | pass |
| F-21a | servo cut-out as drawn 39 x 19 (18.8) | 19.0 | -0.10 / +0.15 | fail |
| F-21b | servo cut-out 39.4 x 19.6 (38.6 x 18.8) | 39.4 x 19.6 | +0.50 / +0.75 | pass |
| F-22 | ear holes: pitch 48 x 10 is EST (—) | slots 2.6 x 4.0 until  | — / — | open |
| F-23a | axle bore as drawn (3.97) | 4.2 | -0.07 / +0.18 | marginal |
| F-23b | bore printed 4.2 then reamed with a 4.1 mm drill (3.97) | 4.2 + ream 4.10 | +0.08 / +0.18 | pass |
| F-24 | wheel hub bore on axle (3.97) | — | — / — | open |
| F-25 | leg tube in block socket 25.6 as drawn -> 26.0 (25.4 +-0.203) | 25.6 -> 26.0 | -0.30 / +0.35 | marginal |
| F-26 | wheel inner face (—) | offset axle 5 mm outbo | -3.90 / — | fail |
| F-27 | axle stack 50.4 on 50.8 axle (nominal margin 0.4) | move nyloc inboard | -0.75 / +0.40 | marginal |
| F-28 | saddle bore 25.5 -> 25.0 (25.4 +-0.203) | 25.5 -> 25.0 | -0.40 / +0.25 | marginal |
| F-29 | bore 6.1 split at z=-1.0 (6.0 (OD tolerance —)) | 6.1 -> 5.8 | -0.20 / +0.05 | open |
| F-30 | battery pocket (EST) | inside length = pack + | — / — | open |
| F-31 | canopy lip gap (—) | 1.0 mm gap under tape | — / — | open |
| F-32 | aileron hinge gap (4.77) | 4.8 | +3.27 / +6.27 | pass |
| F-33 | elevator hinge gap (1.51) | 3.5 | +2.00 / +5.00 | fail as drawn |

Notes. F-01..F-03: the bore is an interference by design; the halves leave a free gap to close with the bolts. F-04: nothing slides at 0.229 mm when the tubes vary by ±0.2; the panels are also meant to come off the joiner (R4 J-01) while R3 J-03 says bonded: bond the joiner into the saddle only and keep the spar sockets as sliding fits sorted by measurement. F-26 is calc from R3 J-15 (wheel r 38.1, axle 10 mm below the tube end, inner face 8.8 vs tube r 12.7).

## 4. Stack-ups

Worst = sum, RSS = root of summed squares; mm rows are ± on the nominal, tested against the min (nominal - worst) or margin limit. Angle limits are EST (none in DESIGN-BASIS.md).

| ID | Stack | Worst | RSS | Limit | Verdict |
|---|---|---|---|---|---|
| S-01 | Wing incidence error, panel to saddle to pod | 0.59 | 0.297 | max 0.5 | marginal |
| S-02 | Boom clamp pair to boom tilt, i.e. lift-motor axis tilt | 1.354 | 0.522 | max 1 | marginal |
| S-03 | Rear lift prop tip to wing trailing edge | 5.6 | 2.698 | min 20 | pass |
| S-04 | Rear lift prop tip to pusher disc | 4.8 | 2.267 | min 20 | pass |
| S-05 | Lift motor mount: face perpendicularity to thrust line | 0.766 | 0.419 | max 1 | pass |
| S-06 | Pusher thrust-line tilt | 1.09 | 0.615 | max 1 | marginal |
| S-07 | Pusher prop tip ground clearance on wheels | 3.8 | 1.849 | min 50 | pass |
| S-08 | Aileron hinge gap | 1.5 | 0.866 | min 2 | pass |
| S-09 | Elevator hinge gap | 1.5 | 0.866 | min 2 | fail as drawn |
| S-10 | Wheel track half-width error | 2.43 | 1.606 | max 10 | pass |
| S-11 | Wheel axle stack on DUB248 | 1.15 | 0.62 | max 0.4 | marginal |

Key inputs. **S-01** lever from spar (x -71.6 mm) to TE tab (x -167.1 mm) is 95.5 mm; tab play ±0.325 mm gives 0.195 deg, the pod seat (formers —) gives 0.19 deg (EST). **S-02** clamp spacing 119.34 mm (R1: x -71.60 and -190.94); 1 mm height difference tilts the boom 0.48 deg. **S-03** nominal gap: wing TE x -238.7 mm to rear disc edge x -288.7 mm = 50.0 mm; front-to-rear tip gap 443.7 mm and front disc to wing LE 155 mm do not govern (calc from R1). **S-04** nominal 60.6 mm is R7 discClear. **S-07** pusher tip y -207.8 mm, ground y -291.8 mm (R6) = 84.0 mm; leg mismatch ±2.3 mm over 695.5 mm = 0.38 deg. **S-10** track 908 mm (calc).

## 5. Clamp design check

**Gap needed.** Free gap g = tube OD - printed bore. For the clamp to grip at the smallest tube (25.197 mm) the halves must not touch: g_min = 25.197 - printed bore max > 0. Defaults: a CAD bore of 25.4 + 0.2 as in R4 J-06 prints at 25.30..25.55, so g_min = -0.35: the halves bottom out and the tube is loose. At CAD 25.0 the printed bore is 24.70..24.95 and g = 0.25..0.90 (default for unmeasured tubes). Closing 0.9 mm on PETG (E 1486 MPa, from D0 in S8) needs above 0.5 kN per ear (EST: 8 mm cantilever ear, 4 x 34 mm section), too high. **Rule: caliper the real boom at three places and model bore = d_meas - 0.22**, giving g = 0.24..0.55 mm (about 170..330 N, EST). PA6-CF mounts use d_meas - 0.08 (stiffer, g 0.25).

**Preload.** Torque 0.25 N m, K = 0.2 (EST), M3: F = T/(K d) = 417 N per bolt. Under an ISO 7089 washer (OD 7, ID 3.2, area 30.4 mm²) bearing stress is 13.7 MPa. At 0.4 N m it is 21.9 MPa. Insert pull-out in printed PLA is about 1400 N (S2).

**Does PETG loosen? Yes.** With the creep law of S8 at 23 °C (D0 6.73e-4, D1 1.24e-7, m 0.582 per MPa; time unit assumed seconds, EST) and relaxation = 1/(1 + D1 t^m / D0): 2 % at 1 h, 12 % at 1 day, 30 % at 1 week, 50 % at 30 days. The paper tested 22 h; beyond that is extrapolation. Time shift factors a(T): 1.83 at 45 °C, 4.59 at 55 °C, 53 at 60 °C, and the PETG HDT is 68 °C (R5): a hot car or a sun-baked trailer accelerates loss by 2 to 50 times. Recommend: (1) re-torque 24 h after assembly, then before every flight day; paint a torque stripe; (2) steel washers under every head and heat-set inserts in the upper halves only; (3) never leave the aircraft in a closed car; (4) decision for the team: the four boom clamps and gear clamps carry the 111 N boom couple (R4 sec. 6) in bearing, not friction, so creep reduces squeeze rather than strength, but a PA6-CF print of the front clamps (E 8637 MPa dry, 2508 wet, S7) cuts relaxation about 3 to 6 times; filament cost and mass for it are —.

## 6. Print orientation and post-processing

| Part | Orientation | Post |
|---|---|---|
| Clamp halves, gear clamp, tail saddles, motor mount halves | split face up (trough open, no overhang); bolt and insert holes vertical | check bore on C-04; no sanding below 25.0 |
| Motor mount | each half split-face up; motor face is a bed-side face on the upper half | drill pattern holes to 3.4 only if coupon C-01 prints under 3.4 |
| Splice plug (PA6-CF) | lying flat (layers along the axis, 109 vs 54 MPa, S7) | sand to the ring gauge; match-drill cross holes through the assembled boom |
| Axle block | axle hole vertical, leg socket horizontal with teardrop | ream the axle bore with a 4.1 mm drill; epoxy the leg |
| Root plates | saddle plate on edge so the tab lies in the layer plane; panel plate flat with brim | file the slot to the C-07 result |
| Battery tray, deck, former rings | flat on the bed; chamfer 0.4 | none |
| Canopy (260 mm) | diagonal on the bed or split in two (bed is 250 mm) | trim lip to 1.0 mm gap |

## 7. What the CAD must change

1. Boom, leg and tail clamp bores: 25.0 default or d_meas - 0.22, split plane up; remove the 0.2 oversize.
2. Wing_Saddle root-plate hole: 22.455 to 22.85 (R2 adds only +0.000115 radius). Joiner bonded into the saddle, sliding in the spars.
3. All insert bores 4.0 to 4.2, depth 7.5, boss OD 7.4 (R3 hardware.json hole_d 4).
4. M5 nut pocket 8.0 to 8.4 x 5.1; M2 nut pockets 4.4 x 2.0 (R3 HW-012, HW-066).
5. Motor-mount screw pockets 6.0 to 7.6 dia if the ISO 7089 washer stays, else delete the washer.
6. TE tab slot 3.4 to 3.6; servo cut-out 39.4 x 19.6.
7. Elevator hinge gap 1.51 to 3.5 mm (elevator LE at 72.6 % chord).
8. Axle block: offset the axle 5 mm outboard (wheel clears the tube by 1.1 mm); bore 4.2 then ream; socket 26.0; free the axle stack by 1 mm (shorten the block foot to 15 mm).
9. Splice plug 23.2 to 23.0 (or measured ID - 0.25), epoxy bonded; battery tray inside length = pack + 10.
10. Motor 19 mm square pattern and servo ear pitch are placeholders (—): measure before cutting.

## 8. Calibration coupons (print first)

| ID | Coupon | Content | Measure |
|---|---|---|---|
| C-01 | Hole ladder | 60 x 40 x 6 | go/no-go with drill shanks and M2..M5 screws |
| C-02 | Insert coupon | 50 x 20 x 10 | install Ruthex M3x5.7 at 220 C PETG / 280 C PA6-CF (EST), then pull wi |
| C-03 | Nut trap coupon | 60 x 30 x 8 | smallest AF where the nut seats by hand without a tool |
| C-04 | Clamp slice | 34 axial x 40 x 30 | free gap with tube seated (feeler), torque 0.25 N m closes it, hold by |
| C-05 | Ring gauge set | 10 mm wide rings | slide on the real joiner |
| C-06 | Axle ladder | 16 x 24 x 18 blocks | DUB248 axle slides without rocking |
| C-07 | Slot and tab | 40 x 25 x 8 | insertion by hand, rock by feeler |
| C-08 | Scale and foot square | 100 x 100 x 36 with 40 mm bore | calipers: set XY scale (S1 suggests 1.003), check PA6-CF Z |

Order: C-08, C-01, C-02, C-03 in PETG (about 90 min total, EST), then C-04, C-05, C-06 on the real tubes, then repeat C-01, C-02, C-08 in PA6-CF. Feed the results into `rules[]` before the CAD is cut.

**What the team must measure.**
M1. Caliper every tube lot at three places (OD, and ID with inside jaws): if joiner OD exceeds spar ID minus 0.15, the pair fails F-04; sort or sand.
M2. Clamp free gap with feeler gauges; below 0.15 mm the clamp does not grip (fails S-02).
M3. Re-measure bolt torque after 24 h and 7 d; if it fell more than 30 %, move to PA6-CF clamps.
M4. Measure wheel hub bore, motor and servo hole patterns on receipt (F-22, F-24, F-11).

## 9. Sources

S1 https://rsmith.home.xs4all.nl/3d-printing/dimensional-accuracy-of-3d-prints.html; S2 https://cnckitchen.com/blog/are-our-heat-set-insert-datasheets-wrong; S3 https://makerspace.uflib.ufl.edu/services/3dprocess/recommended-software-for-3d-printing/designing-for-3d-printing-tolerances-on-the-mk4-and-xl/; S4 https://help.prusa3d.com/article/elephant-foot-compensation_114487; S5 https://www.prusa3d.com/product/original-prusa-mk4s-3d-printer-5/; S6 https://alcobrametals.com/?p=68918; S7 https://fiberon.polymaker.com/wp-content/uploads/TDS_FIBERON-PA6-CF20_V1.1_EN.pdf; S8 https://opus.cloud1.lib.uts.edu.au/bitstream/10453/166023/2/Binder1.pdf; S9 https://amesweb.info/Screws/Metric-Clearance-Hole-Chart.aspx; S10 https://royasutton.github.io/omdl-snapshot/docs/html/omdl-v1.0/group__database__component__fastener__iso__4032.html; S11 https://www.3djake.ch/en-CH/ruthex/threaded-insert-m3-100-pieces; S12 https://www.gator-rc.com/products/dubro-super-lite-wheels; S13 https://en.wikipedia.org/wiki/IT_Grade; R1 cad/params.txt; R2 cad/BuildVtol.cs; R3 inventory/hardware/hardware.json; R4 docs/research/hardware-schedule.md; R5 docs/research/budget-airframe.md; R6 docs/research/electrical-architecture.md sec. 11; R7 cad/params.mjs; R8 inventory/electrical/components.json. All web pages checked 2026-11-01. S9 labels its table ASME B18.2.8; its M2..M5 values equal the ISO 273 medium series.
