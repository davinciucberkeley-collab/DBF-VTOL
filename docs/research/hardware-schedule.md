# Hardware schedule: every fastener and small mechanical part

Date checked 2026-11-01. Data: `inventory/hardware/hardware.json` (31 joints, 128 items, 563 pieces, frame X fwd / Y up / Z right, metres), `inventory/hardware/new_lines.json` (5 purchase lines). Positions come from `cad/params.txt` and `cad/BuildVtol.cs`; fastener dimensions from the ISO tables cited per item. Every instance carries a position (head contact point) and a head-to-tip axis. Estimates are `est:true`; unknowns are "—".

## 1. Coverage

| Source | Pieces |
|---|---|
| Kit P-04 (Mywish M2-M5 screws/nuts/washers, M3 inserts, zip ties, hinge tape, heat-shrink, horns, Du-Bro 230) | 386 |
| Supplied with parts (prop adapters, plates, servo arms, arm screws) | 44 |
| Printed parts (filament already budgeted) | 33 |
| Wheels, axles, collars (proposed_lines.json, K5) | 16 |
| NEW lines N-01..N-04 | 82 |
| NEW optional N-05 (battery straps) | 2 |

By kind: 173 screws, 138 washers, 75 M3 inserts (kit has 100), 52 nuts and nylocs, 33 ties, 37 printed plates/blocks.

**Kit caveat.** The Amazon kit page is closed to robots, so the screw lengths in P-04 are unknown (—). Every length is listed with its stack-up; the lengths 20, 30 and 40 mm M3 plus nylocs are bought as NEW rather than assumed.

## 2. Joint schedule (tool, field vs shop)

Order 1-13 are shop joints (built once); 14-29 are field or electronics joints.

| Joint | What | Pieces | Tool |
|---|---|---|---|
| J-01 | Panel root plates, LE head-pin, TE tab screw | 16 | 2.5 hex |
| J-02 | M5 Wing_Bolt, washer, captive nut, hard-point plate | 8 | 3 hex + 8 AF |
| J-03 | Joiner and sockets: epoxy only | 0 | none |
| J-04, J-05 | Front (M3x40) and rear (M3x30) clamp top screws | 24 | 2.5 hex |
| J-06 | Clamp lower halves, 16 pinch bolts | 48 | 2.5 hex |
| J-07 | Boom splice plug, 4 cross bolts | 14 | 2.5 hex + 5.5 AF |
| J-08, J-09 | Motor mount pinch (16), lift motor screws (16) | 80 | 2.5 hex |
| J-10, J-12 | Prop adapters (supplied), spinner | 36 | 2 hex (est) |
| J-11 | Pusher firewall, bulkhead, 8 screws | 22 | 2.5 hex |
| J-13, J-14, J-15 | Gear clamp caps, leg cross bolts, axle block, wheels | 80 | 2.5 hex, 5.5 AF |
| J-16 | Tail saddles, 8 ties, H_Tail screws | 24 | 2.5 hex |
| J-17..J-19 | 5 servos: 20 ear screws, nuts, arms | 72 | 1.3 hex |
| J-20..J-23 | 5 horns, clevises, rods, hinge tape | 48 | 1.3 hex |
| J-24..J-31 | Canopy, tray/formers, FC deck, GPS mast, ties, pitot | 91 | 2 hex, cutters |

## 3. Assembly order for transport (R4, R5)

Transport pieces (largest dimension vs the 1.5 x 0.5 x 0.4 m working envelope in DESIGN-BASIS.md R4): pod + saddle + pusher (0.85 m); two wing panels with ailerons and servos (1.12 m); two boom assemblies with gear, motors and props (1.41 m long, x extent -0.99..+0.42 *(calc from params)*); the H_Tail (0.893 m span). The H_Tail is 0.893 m wide, so it fails the 0.5 m side and **must be removable**: the CAD gives no joint for it, so J-16 adds 2 M3x12 per side into inserts in the saddle cheeks.

Field build, flight-ready:
1. Pod + saddle on the stand; canopy off (4 screws, J-24).
2. Slide each panel onto the joiner (z=+/-0.08 root plates meet); drop the TE tab screw (J-01, 2 screws).
3. Offer each boom up from below into the clamp upper halves; close the lower halves, front then rear (J-06, 4 bolts per clamp, 16 total).
4. Seat the H_Tail on both saddles; 4 screws (J-16); clip the elevator Kwik-Link (J-21).
5. Plug the six joint boxes (JB_J1/J2/J3, three per side), XT90S last (R20).
6. Canopy on; 4 screws.

That is 26 hex-key fasteners plus 6 joint boxes. At 20 s per screw and 30 s per box *(est, not timed)* the total is about 12 min against the 15 min target in R5. Dropping to 2 pinch bolts per clamp would save about 2.7 min *(calc)*. Time it on the first build.

Shop order: joiner bond (1), saddle-to-pod (5), pusher mount (3), gear clamps (6), legs (7), wheels (4), motor mounts (8), motors (9), props (10), splice (11).

## 4. Motor screw length check

The boom top (y=-0.0173) lies directly under any 4 x M3 pattern at the motor (CAD: mount top y=-0.009, mount block 36 mm tall, boom bore at y=-0.03), so screws cannot enter from below the boom. They enter from the bore side, with the head and a 0.5 mm washer in a 6.0 dia x 4.5 mm pocket cut into the bore ceiling; motor and mount are assembled off the boom.

Engagement = L - washer - mount thickness *(shown formula)*, with mount thickness = (y_top - y_bore) - pocket depth, y_bore at dz=9.5 mm = -0.03 + sqrt(12.7^2 - 9.5^2) = -0.02157 m.

| Joint | L | Washer | Mount | Engagement | CAD base (est) |
|---|---|---|---|---|---|
| Lift motor, J-09 | 12 | 0.5 | (-0.009 + 0.02157) - 4.5 = 8.07 | **3.43 mm** (1.14 d) | 4.0 mm (BuildVtol.Motor flange 0..0.004) |
| Pusher, J-11 | 10 | 0.5 | firewall 6.1 | **3.4 mm** | 4.0 mm |

The motor stator is 41 mm dia x 10 mm and sits above the base (readymaderc X4110S page, 2026-11-01), so the tip must stay within the base plate. The real base thickness and thread depth are not published (—), and neither is the 4 x M3 pattern: the 19 mm square is a placeholder (est). Margin to the CAD flange is 0.57 mm. **Measure the blind thread depth with a depth gauge before assembly**; if it is under 3.5 mm, use M3x10 and thin the pocket by 2 mm. Never fit a longer screw to "make it bite".

## 5. Linkage geometry (est)

Servo ES3005HV body 38.6 x 18.8 x 34.9 mm (components.json). Shaft is spanwise (Z) for ailerons and elevator, vertical (Y) for rudders. Ear spacing (48 mm), ear thickness and arm length are est.

| Surface | Arm | Horn radius from hinge | Rod cut length | Surface for servo +/-45 deg | Neutral |
|---|---|---|---|---|---|
| Aileron (z=+/-0.8195 plane) | 20 mm | 39.1 mm | 53.5 mm | -34 / +26 deg | arm down |
| Elevator (z=0.3796) | 18 mm | 19.1 mm | 20.4 mm | -43 / +30 deg | arm down |
| Rudder (y=-0.01055) | 18 mm | 25.5 mm | 25.5 mm | -33 / +22 deg | arm inboard |

Rod cut length excludes the 17 mm Kwik-Link (est). Throws are asymmetric because the rod is not perpendicular to the horn at neutral; the numbers come from a planar solve in the generator (aileron hinge on the upper skin x=-0.1766, elevator hinge x=-0.8234, rudder hinge x=-0.8757). The elevator rod is only 20 mm of bare wire: confirm with a bench mock-up. The 12 in Du-Bro 230 rods are far longer than needed; the pack of 5 has no spare.

## 6. Findings that change the design

1. **No panel retention in the CAD.** Wing_Bolt is at z=+/-0.065, inside the saddle (z<=0.08), so it cannot hold a panel. J-02 keeps it as the saddle-to-pod screw; J-01 adds a saddle tab with one M3x20 and an LE head-pin per side (est).
2. **Splice overlap.** Boom_Front ends at x=-0.53458 and the stub starts at -0.47448: 60 mm of same-OD tube overlap. Treated as a butt joint at x=-0.50458 with an internal plug. The joiner offcut (0.154 m, inventory P-32) fits only one aluminium insert, not two, so a printed PA6-CF plug is assumed (est).
3. **Leg overlaps the boom** by 4 mm (leg top y=-0.0387, boom bottom y=-0.0427).
4. **Rudder servo envelope** touches the boom (z 0.4210) and intrudes about 2.5 mm into the elevator underside (x -0.8234..-0.8461): lower it 3 mm or move it aft 25 mm.
5. **Rear clamp is foam-only.** Boom tip force 30.69 N x 0.4306 m / 0.11934 m clamp spacing = 111 N couple per boom *(calc from params feaTipForce, feaBoomL)*, ignoring the second motor. Front clamp passes M3x40 through the spar (3.4 mm insert engagement, marginal; M3x50 316 SS is $17.39/50). Needs a check before flight; epoxy + large washers assumed.
6. **One servo on a 0.855 m elevator** with no torque rod: twist is uncomputed.
7. **Wheel stack** (J-15): nyloc 5 | block foot 16 | M4 washer 0.8 | wheel 23.0 | collar 5.6 uses 50.4 of the 50.8 mm axle. If DUB248 has a head, flip the layout.

## 7. New lines (new_lines.json)

| ID | Item | Pack | Price | Need |
|---|---|---|---|---|
| N-01 | M3x20 socket A2 | 50 | $3.49 | 42 |
| N-02 | M3x30 socket A2 | 50 | $2.19 | 12 |
| N-03 | M3x40 button A2 | 25 | $4.59 | 12 |
| N-04 | M3 nyloc DIN 985 A2 | 50 | $3.35 | 16 |
| N-05 | LiPo straps (optional) | 10 | $7.99 | 2 |

Required goods $13.62 + 10.25 % tax $1.40 = **$15.02** ex shipping (—). Reserve left $44.26 becomes $29.24; with the optional straps $20.43. Zoro prices read 2026-11-01; stock not stated on the pages. If the kit turns out to hold 20/30/40 mm M3, N-01..N-03 drop by $10.27 *(calc)*.

## 8. Unknowns ("—")

X4110S bolt pattern, base thickness, thread depth, prop-adapter size and screws; ES3005HV ear holes, ear thickness, arm and horn-screw size; kit screw lengths; DUB248 thread and head; Kwik-Link and control-horn dimensions (horn sets may include backing plates); CoreWing hole diameter and board outline; GPS hole pattern; pod former positions and shell thickness; hinge tape thickness; spinner mounting; Zoro shipping; real Amazon stock.

## 9. Mechanisms and gear (rev 2)

Data: `inventory/hardware/hardware.json` (143 items, 613 pieces, was 128 items), `inventory/hardware/mechanisms.json`. Frame X fwd, Y up, Z right, metres. Web values checked 2026-11-01. Everything marked est is an estimate; "-" is unknown.

### Servos (HW-129 aileron x2, HW-130 elevator, HW-131 rudder x2)
EMAX ES3005HV case 38.6 x 18.8 x 34.9 mm (inventory/electrical/components.json). Ears, shaft boss, spline and arm are est: ear span 53.4, ear thickness 2.5, hole pitch 48.4 x 10.2, 23T spline (flymod.net, 3dxr), arm thickness 3.0. Ear hole size and lead exit are on no page read (-). Ear screws changed from M2 to M3x12 with ISO 7089 M3 washers and DIN 985 nylocs, because an M2 washer (OD 5) cannot bridge the 4.4 mm ear hole. Printed bays: aileron frame HW-063 (window 39.4 x 19.6 cad), elevator bay HW-132, rudder bays HW-133, all part of the saddle prints. Servos moved from the first placement to clear the elevator and H_Tail insert bosses.

### Linkages (per surface)
| Surface | Arm hole / trim | Horn hole | Ratio | Rod pin-to-hole | Throw at servo +/-45 deg | Horn screws |
|---|---|---|---|---|---|---|
| Aileron R/L | 20 / 25 mm | 14 mm | 0.70 | 59.9 mm | +/-26.1 deg | 2 x M2x20, foam 14.52, protrusion 0.38 |
| Elevator | 14 / 18 mm | 18 mm | 1.29 | 33.1 mm | +/-24.2 deg | 2 x M2x8, foam 2.13, protrusion 0.77 |
| Rudder R/L | 14 / 18 mm | 14 mm | 1.00 | 32.0 mm | +/-22.9 deg | 2 x M2x12, foam 5.5, protrusion 1.4 |

Method: planar four-bar solve with the real foil from cad/params.txt (scratchpad geo.py and mech.py), arm at the exact neutral that makes the throw symmetric. Sign: positive is trailing edge down. The real arm sits on a 15.65 deg spline tooth, so the remainder is set by sub-trim. The aileron horn moved from x=-0.186 to x=-0.195 so an M2x20 fits the stack (horn base 2.0 + foam + plate 1.5 + nut 1.6). Each linkage now has horn, backing plate, two horn screws, two nuts, Kwik-Link (DUB228, 22.86 mm, est width and thickness), pushrod with a Z-bend at p1, and a heat-shrink keeper bead. Pushrod stock is the 12 in Du-Bro 2-56 assembly (0.072 in rod, 3/4 in thread). Cut length = pin-to-hole - 14 + 8 mm (both est). Kit horn dimensions are not published (-): base 16 x 8 x 2, stalk 22, hole rows 6/10/14/18 are est. Rod endpoints land within 2.5 mm of the arm and horn holes (validator).

### Hinges (HW-100)
Tape 25.4 mm. Aileron gap 4.77 mm (cad 4.8), 612 mm each. Elevator gap raised from 1.51 to 3.5 mm (tolerances.json F-33), 855.4 mm. Rudders 4.0 mm gap (est, no rudder in the CAD), 188 mm, tape on the outboard face. Tape thickness is not published (-), 0.2 mm drawn (est). Aileron TE-down travel is limited to about 14.7 deg by gap closure (est) unless the lower edges are chamfered.

### Landing gear fork (HW-049, 053-057, 137)
The dome foot is replaced by a single-sided offset axle block. Socket bore 26.0 x 25 deep, OD 32.0 (was 34); foot 24 x 8 x 16 offset 3.3 mm outboard; axle bore 4.2 then reamed 4.10, 10 mm below the tube end; M3x40 cross bolt 12 mm above the tube end with washers and nyloc (3.0 mm thread left). Stack along the axle from the leg axis: nyloc -1.7..3.3, foot 3.3..11.3, inner collar 11.3..16.9, M4 washer, wheel 17.7..40.7 (300SL, 76.2 x 23.0), M4 washer, outer collar 41.5..47.1. Axle DUB248 uses 50.8 of 50.8 mm (-2.7 to 48.1), so a head on the axle would not fit (-). Eight DUB140 collars with eight 6-32 set screws. Clearances: wheel face to block OD 1.7 mm, to tube 5.0 mm. Track 908 to 925.8 mm, wheelbase 695.5 mm. Axle height unchanged, so the pusher prop tip clearance stays 84.0 mm nominal (S-07). Lift prop clearance not computed (-).

### Fasteners added
Set screws on lift and pusher adapter hubs (HW-138, 139, est M3x4: the adapter is described only as "adapter + holding plate + screws"); cable ties for XT90S (HW-140) and XT60H pairs (HW-141); M2 washers under GPS screws (HW-142); ESC tie pads (HW-143); servo lead ties (HW-134..136). cad_mm sizes from tolerances.json sit beside nominal on inserts (bore 4.2 x 7.5), nut traps (M2 4.4 x 2.0, M3 5.9, M5 8.4 x 5.1) and clearance holes.

### Cost and unknowns
Nylocs rise from 16 to 36 pieces (N-04, one 50-pack, no change). No new purchase: new cost $0, required total stays $15.02 ex shipping. Open: gear clamp roll moment (outboard axle), axle bending margin, hinge TE-down limit, X4110S bolt pattern, ES3005HV ears and leads, kit horn and screw dimensions, DUB248 thread, 300SL bore and width, tape thickness.
