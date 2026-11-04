# Hardware and tolerance specification — C0 (v0.3.1)

Status: draft for CAD, 2026-10-21. Scope: every joint and attached component in
`cad/BuildVtol.cs` / `cad/params.txt`, plus the joints the CAD implies but does not yet
model (marked **CAD change**). Machine-readable twin: `cad/hardware.json` (same IDs).

Conventions. Prices and specs were read live on **2026-10-21** from the URL given.
"EST" = engineering estimate. "—" = not published or not found. *(calc)* = derived
here with the formula shown. Part-local coordinates: boom axis = local x, split plane of
a clamp = local y 0, boom centre at the origin (CAD frame otherwise as `cad/params.txt`).

---

## 1. Verdict

- **One thread size does almost everything.** 103 M3 A2 stainless screws in 9 lengths,
  67 ruthex M3 heat-set inserts, 8 M3 nylocks. Two M5 × 20 wing bolts. M2 only at servos
  and horns. No tapped holes anywhere: metal threads exist only in the motors.
- **The motor drawing sets the critical numbers.** SunnySky X4110S base: 4 × M3 × 0.5 on
  a Ø25 circle, **max thread depth 3.3 mm**. Hub: 4 × M3 on Ø12, depth 8.0. Shaft Ø4
  (0/−0.03). M6 × 1.0 bolt-on adapter for the pusher. Source: SunnySky drawing
  https://cdn.shopify.com/s/files/1/2024/0305/files/X4110S.jpg?v=1553581346 (linked from
  https://sunnyskyusa.com/collections/multirotor-motors/products/sunnysky-x4110s-motors).
  The motor plate floor is therefore 4.5 mm + 0.5 mm washer, so an M3 × 8 engages
  **3.0 mm** (2.8–3.2 over tolerances), under the 3.3 mm limit.
- **The existing hardware kit does not fit the design.** The Mywish kit (B0CQWYFTXC) is
  button heads in 8/12/16/20 mm only, with plain nuts. It has no 25–40 mm screws and no
  nylocks, and the CAD's M5 × 30 wing bolt is not in it (and is 8 mm too long, §4 J10).
  **Replace it and the generic inserts with a $22.04 Bolt Depot order, ruthex inserts and
  a threadlocker.** Goods +$15.08. New committed spend **$1,924.55** with a $10 EST
  shipping charge. Reserve **$75.45**, below the R7 $100 target (§7).
- **Six CAD changes** are needed before the model is "down to the screw" (§3). The
  largest: the motor mount must split in two (the boom blocks screw access to the motor
  base), and the CAD overlaps the front boom and rear stub by 60 mm.
- **The joiner fit can bind.** Vendor tube tolerances give −0.08 to +0.53 mm diametral
  clearance on the 0.23 mm nominal joiner fit (FT01). Measure on receipt (M1).

---

## 2. Reference data used throughout

### 2a. Fastener heads (vendor maxima, Bolt Depot "Product details", checked 2026-10-21)

| Type | Standard (vendor) | dk max | k max | Drive | Page |
|---|---|---|---|---|---|
| M2 socket cap | DIN 912 / ISO 4762 | 3.98 | 2.00 | 1.5 hex | https://boltdepot.com/Product-Details?product=6365 |
| M3 socket cap | DIN 912 / ISO 4762 | 5.68 | 3.00 | 2.5 hex | https://boltdepot.com/Product-Details?product=6379 |
| M3 button | — (dims match ISO 7380-1) | 5.70 | 1.65 | 2.0 hex | https://boltdepot.com/Product-Details?product=7219 |
| M5 button | — (dims match ISO 7380-1) | 9.50 | 2.75 | 3.0 hex | https://boltdepot.com/Product-Details?product=6635 |
| M3 nylon-insert lock nut | — (DIN 985 dims) | s 5.5 | m 4.0 | — | https://boltdepot.com/Product-Details?product=4792 |
| M5 nylon-insert lock nut | — (DIN 985 dims) | s 8.0 | m 5.0 | — | https://boltdepot.com/Product-Details?product=4794 |
| M2 hex nut | DIN 934 | s 4.0 | m 1.6 | — | https://boltdepot.com/Product-Details?product=7362 |
| M3 flat washer | DIN 125 | OD 7.0 | t 0.45–0.55 | ID 3.20–3.38 | https://boltdepot.com/Product-Details?product=4513 |

All A2 (18-8) stainless. Bolt Depot sells singles with no minimum order
(https://boltdepot.com/Service, FAQ "Do you have a minimum order?").

### 2b. Hole geometry

| Size | ISO 273 close (H12) | **normal (H13)** | loose (H14) | Printed model value *(normal + 0.2)* | Tap drill (not used) |
|---|---|---|---|---|---|
| M2 | 2.2 | **2.4** | 2.6 | 2.6 | 1.6 |
| M3 | 3.2 | **3.4** | 3.6 | 3.6 | 2.5 |
| M5 | 5.3 | **5.5** | 5.8 | 5.7 | 4.2 |

- ISO 273 values: Albany County Fasteners chart "Metric Series Clearance Holes (ISO 273)",
  https://www.albanycountyfasteners.com/media/6b/b8/g0/1764944339/clearance-hole-chart.pdf
  (checked 2026-10-21).
- Tap drills: Fractory / AmesWeb metric charts (search 2026-10-21). Listed for
  completeness: the design has no tapped holes.
- FDM compensation: vertical holes print undersized; add about 0.2 mm on a 4 mm hole and
  confirm with a test print (https://pollen.am/design_for_3d_printing_holes, checked
  2026-10-21). Horizontal holes (cross-bolts): model as a teardrop with the point up
  (same source), print at the model value, then drill to the ISO 273 normal size.
- Counterbore rule *(calc)*: Ø = dk max + 0.8 mm (M3 cap 6.5; M3 cap + washer 7.5;
  M5 button 10.3). Depth per joint below.
- Captive nut pocket *(calc)*: across-flats = s max + 0.2 (M3 nylock 5.7, M5 nylock 8.2,
  M2 nut 4.2), depth per joint.

### 2c. Heat-set inserts (ruthex)

| Model | Thread | OD | Length | Hole Ø | Min hole depth (EST) | Min wall | Source |
|---|---|---|---|---|---|---|---|
| RX-M3x5.7 | M3 | 4.6 | 5.7 | 4.0 | 7.0, or screw tip + 1.0 | 1.6 (boss Ø ≥ 8.0) | Hole and length: ruthex table on https://www.amazon.com/dp/B08K1BVGN9; OD and wall: https://3djake.com/ruthex/threaded-insert-m3-100-pieces (search snippet) |

Hole depth rule is EST, consistent with JLC3DP's M4 × 8 insert → 10 mm hole
(https://jlc3dp.com/help/article/threaded-insert-service). Install with a soldering iron
about 20 °C above the print temperature (https://cnckitchen.com/blog/how-to-use-our-threaded-insert-removal-tool).
PA6-CF prints hotter than PETG, so set the iron per material.

### 2d. Torque

| Case | Torque (N·m) | Basis |
|---|---|---|
| M3 A2 into steel nut, max | 0.81 lubricated / 0.95 dry | Fastenal "Torque Values for A2-70 or A4-70", Feb 2016, T = K D F, K 0.16 / 0.35 (https://crafter.fastenal.com/static-assets/pdfs/technical-resources/Torque-Tension-Relationship-for-Metric-Stainless-Steel-Fasteners-A2-and-A4-70-Feb-2016.pdf) |
| M5 A2 into steel nut, max | 3.83 lubricated / 4.47 dry | same |
| M3 into motor base (Al), through PA6-CF floor + washer | **0.6 EST** | Preload F = T/(K d) = 0.6/(0.16 × 0.003) = 1,250 N; washer bearing area π/4(7.0² − 3.2²) = 30.4 mm² → 41 MPa on the printed floor *(calc)*. PA6-CF compressive strength —, so check for crush (M3). |
| M3 prop-plate screws into motor hub | **0.8** | Fastenal lubricated M3 0.81 (threadlocker acts as lubricant) |
| M3 into ruthex insert (PETG / PA6-CF) | **0.5 EST** (0.4 on 2 mm flanges) | Insert torque-out in these plastics not published (—). Confirm ≥ 2 × working torque on a coupon (M3). |
| M3 cross-bolt + nylock through printed block | **0.5 EST** | Clamp passes through plastic and a printed crush plug |
| M5 wing bolt + nylock in PETG pillar | **1.0 EST** | F = 1.0/(0.16 × 0.005) = 1,250 N on the button-head bearing area π/4(9.5² − 5.5²) = 47 mm² → 27 MPa *(calc)* |
| M2 servo / horn screws | **0.15 EST** | Snug. No published value (Fastenal table starts at M3) |
| M6 pusher prop nut | — | Not published. Tighten with a 3 mm rod through the nut cross-hole until the prop cannot slip by hand; check before each flight |

**Torque without a torque driver.** None is on hand (R6: printer and hand tools only).
A makerspace torque screwdriver is an *assumption*. Fallback at $0: hang a known mass from
the long arm of the hex key, T = m g L. Example: 0.6 N·m at L = 60 mm needs
0.6 / (9.81 × 0.060) = 1.02 kg (a 1 L water bottle) *(calc)*; 0.5 N·m needs 0.85 kg.

**Threadlocker.** Loctite 242/243 data sheets: not normally recommended on plastics,
particularly thermoplastics (stress cracking) (search of Henkel TDS revisions 2008, 2012,
2020; e.g. https://assets.testequity.com/te1/Documents/pdf/loctite/Loctite_1329505_243_Technical-Datasheet_0125.pdf).
Use it **only on metal-to-metal threads** (motor base screws, prop-plate screws), one drop
on the last 2–3 threads, kept off PA6-CF. Never on nylock or nylon parts. Screws in brass
inserts get no threadlocker: torque, then a paint witness mark checked pre-flight.

---

## 3. CAD changes required

| # | Part / file | Change | Why |
|---|---|---|---|
| C1 | `Motor_Mount` | Split at the boom centreline into an upper half (motor plate + saddle) and a lower cap, 1.2 mm total split gap. Floor under the motor 4.5 mm. Four Ø6.5 counterbores from the bore up to the floor at (±8.84, ±8.84). Centre relief Ø8 × 2.0 deep. Wire slot 6 mm wide on the 45° wire-exit line | The Ø25 bolt circle sits over the boom (screws at z = ±8.84 mm hit a 12.7 mm-radius tube), so screws must go in from inside the bore before the halves close. Drawing shows a Ø5 × 0.9 boss at the base centre. |
| C2 | `params.mjs` boom cut | Butt the front boom and stub at x = xRear instead of overlapping 60 mm. Front boom 0.42092 − (−0.50458) = **0.9255 m**; stub −0.50458 − (−0.99048) = **0.4859 m** *(calc from results.json geo)* | Two 1.000 in tubes cannot overlap. Current segF 0.955 and segR 0.516 overlap from x = −0.5346 to −0.4745 *(calc)*. |
| C3 | `Boom_Clamp_Front/Rear`, `Gear_Clamp` | Width 40 → 46 mm | An M3 insert boss beside a 25.4 mm bore needs its centre at ≥ 12.7 + 1.6 + 2.3 = 16.6 mm and ≤ 23 − 3.5 = 19.5 mm: 17.5 mm fits only at 46 mm width *(calc)* |
| C4 | `Wing_Bolt` | M5 × 30 → **M5 × 20**; head in a Ø10.3 × 1.0 spot-face at the upper surface | Section thickness at 70 % chord = 2 × 5 t c × 0.0610 = 21.8 mm for NACA 2415, c 238.7 mm *(calc)*. A 30 mm screw protrudes 8 mm below the wing. |
| C5 | New parts | Tail clamps (2), fin root shoes (2), splice plugs (2), spar collars (2), rear wing hardpoints (2), pusher motor cup, panel root tongues and saddle bolt pillars (2 each), aileron horn hardpoints (2), FC tray, pitot clamp, servo trays (5) | Joints exist on the aircraft but have no geometry in `BuildVtol.cs` |
| C6 | `Fin` | Split a rudder (BOM has 2 rudder servos) | Fin is a single solid; J17 rudder horn has no surface to attach to |

---

## 4. Joint-by-joint specification

IDs match `cad/hardware.json`. Engagement e = screw length − grip *(calc)*.

### J01 — Lift motor to motor plate (×4 motors)
- **Fastener:** F01, 4 per motor, ISO 4762 M3 × 8 A2, dk 5.68, k 3.00, + W01 DIN 125
  M3 washer. Bolt Depot 6379, $0.06; 4513 washer.
- **Pattern:** 4 × M3 on Ø25, at 45° to the wire exit (drawing). Holes Ø3.4 (drill after
  printing), counterbore Ø6.5 from the bore side.
- **Stack:** washer 0.5 + floor 4.5 = 5.0 grip → **e = 3.0 mm**. Limit 3.3 mm (drawing).
  Floor tolerance ±0.15 → e 2.8–3.2.
- **Fit/position:** motor pilot not used; holes located Ø0.2 to the bore axis (fixed
  fastener T = (H − F)/2 = (3.4 − 3.0)/2) *(calc)*.
- **Torque 0.6 N·m EST. Loctite 242** on threads only.
- **Check before fitting the motor:** screw tip must stand ≤ 3.2 mm proud of the floor
  (calipers).

### J02 — Motor mount halves clamp the boom (×4)
- **Fastener:** F02, 4 per mount, ISO 4762 M3 × 16, at local (x ±28, z ±17.5), from below
  into I01 ruthex inserts in the upper half.
- **Block:** 70 × 46 mm; lower cap y −15.0 to −0.6, upper half +0.6 to +21.0.
- **Holes:** cap Ø3.4 with counterbore Ø6.5 × 5.6 deep; upper half insert hole Ø4.0 ×
  7.5 deep. Grip 14.4 − 5.6 + 1.2 gap = 10.0 → e = 6.0 *(calc)*.
- **Fit:** bore Ø25.60, split gap 1.2 (FT02). **Torque 0.5 N·m EST**, no threadlocker.
- **Material:** PA6-CF (BOM; HDT 173 °C) for all four mounts.

### J03 — Lift prop to motor (×4)
- JeeFly 1755: 4 mm centre hole + 2 × 3 mm holes on 12 mm spacing
  (https://www.amazon.com/dp/B0FJ21V736). This matches the X4110S prop holding plate
  (2 × Ø3.2 on 12 mm, Ø20 × 2.5, drawing View B-B). Use 2 of the 4 hub holes on Ø12.
- **Fastener:** F12, ISO 4762 M3, length = 2.5 (plate) + hub thickness (—) + 5.0 target
  engagement, max 8.0 (drawing). Provisional M3 × 16 (from F02 stock); M3 × 12 from F08
  stock if the hub is thin. Use the motor-supplied screws if their length fits.
- Holes Ø3.2 (plate). **Torque 0.8 N·m, Loctite 242.**

### J03b — Pusher prop (APC 14 × 8.5EP) on the bolt-on adapter
- Adapter: M6 × 1.0, Ø6 (0/−0.03) pilot, 14 mm thread, held to the hub by 4 × M3
  through Ø3.2/Ø5.7 counterbores on Ø12 (drawing View A-A). **Use the supplied screws**,
  Loctite 242, 0.8 N·m.
- Prop bore 6.35 mm with APC adapter rings (5 supplied, sizes —; Motion RC LP14085EP
  listing). Washer Ø17.8 × 2.5 (Ø6.1 bore) and M6 bullet nut (supplied, N04).
  Hub thickness — . Torque — (see §2d).

### J04 — Boom splice inside the rear motor mount (×2)
- Front boom and stub butt at the motor centre (C2). Printed splice plug Ø23.2 × 80 mm
  (FT04) inside both tubes.
- **Fastener:** F04, ISO 4762 M3 × 40 + W01 under the head + N01 nylock, 2 per mount,
  horizontal (local z) at x = ±18, y 0. Both tube walls and the plug drilled Ø3.4 on the
  boom neutral axis for vertical bending.
- **Stack:** block width 46. Head counterbore Ø7.5 × 5.0; head seats at 5.5. Nut pocket
  5.7 AF × 8.0 from the far face; nut bears at 38.0. Screw end at 45.5: 3.5 mm past the
  nut (7 pitches), 0.5 mm inside the face *(calc)*.
- Clearance to clamp inserts at x ±28: 28 − 2.3 − (18 + 1.7) = 6.0 mm *(calc)*.
- **Torque 0.5 N·m EST.** Replace the nylock if it turns by hand.
- No cross-bolts at the front mounts, boom clamps or tail clamps: clamp friction plus a
  paint witness line. Friction capacity EST: 4 × M3 at 0.5 N·m gives about 4 × 1,040 N;
  μ 0.3 × 4,160 N × r 0.0127 m ≈ 16 N·m about the boom axis (μ EST).

### J05 — Booms to wing (front clamp at the spar, rear clamp at 80 % chord)
- **Hardpoints (C5):** front = PETG spar collar bonded around the spar socket at the
  boom station (spar bottom is 5.2 mm above the lower surface at 30 % chord *(calc from
  params: sparY 4.475, lower surface −13.43)*). Two bosses at z ±17.5 reach the lower
  surface, each with an I01 insert facing down. Rear = PETG plate 60 × 46 × 10 bonded
  flush into the lower surface, 2 × I01.
- **Clamp:** split at the boom centreline, 46 wide (C3). The upper half is bonded to the
  hardpoint. The bolts clamp the boom and hold it to the wing in one action.
- **J05a front, F06:** ISO 4762 M3 × 35, 2 per side, counterbore Ø6.5 × 4.3. Grip
  (16.1 − 4.3) + 1.2 + 15.97 = 28.97 → e = 6.0 *(calc; clampTopF 16.57 mm)*.
- **J05b rear, F04:** ISO 4762 M3 × 40, 2 per side, counterbore Ø6.5 × 7.5. Grip
  (16.1 − 7.5) + 1.2 + 24.23 = 34.03 → e = 6.0 *(calc; clampTopR 24.83 mm)*.
- **Load check (calc):** one lift motor at Tmax 30.69 N (results.json struct.Tmax).
  Front motor x 0.3709, clamps at x −0.0716 and −0.1909 (params.txt), so the arm from
  the front clamp is 0.4425 m and the clamp spacing 0.1194 m. Worst case is a single
  motor (differential thrust): rear clamp tension = 30.69 × 0.4425 / 0.1194 ≈ 114 N,
  i.e. 57 N per screw. With both
  motors at Tmax both clamps are in compression (front 63.8 N, rear −2.4 N).
- **Torque 0.5 N·m EST.** These 4 screws per boom are the field breakdown joint.

### J06 — Gear clamps on the booms (×4)
- **Fastener:** F03, ISO 4762 M3 × 20, 4 per clamp at local (x ±12, z ±17.5), clear of
  the vertical leg socket (centre distance 21.2 vs 3.25 + 12.85 *(calc)*).
- Lower part y −28.7 to −0.6; counterbore Ø6.5 × 15.3 → e = 6.0. Inserts in the upper
  half, hole Ø4.0 × 7.5. Width 46 (C3). **0.5 N·m EST.**

### J07 — Landing legs in gear clamps (×4)
- Leg 1.000 × 0.058 in × 205 mm in a blind socket Ø25.7 × 14.0 deep (FT03), 2 mm of
  material left above the boom bore.
- **Fastener:** F05, ISO 4762 M3 × 25 + W01 + N01, along local x at y −21.7.
  Counterbore Ø7.5 × 6.0; nut pocket 5.7 AF × 8.0 in the 34 mm block. Screw end 1.5 mm
  past the nut, 2.5 mm inside the face *(calc)*. Leg drilled Ø3.4. **0.5 N·m EST.**
- Dome foot: printed, bonded with epoxy (kit item 13). No fastener.

### J08 — Tail clamps on the rear stubs (×2, C5)
- Same section as the motor mount (46 wide, cap y −15.0 to −0.6), 50 mm long, flat top
  at the boom top for the stabiliser.
- **Fastener:** F02, ISO 4762 M3 × 16, 4 per clamp, counterbore Ø6.5 × 5.6, I01 inserts.
  **0.5 N·m EST.**

### J09 — Stabiliser and fins to the tail clamps
- Fin bonded (foam-safe glue, BOM) into a printed root shoe. The shoe flange (3.0 mm)
  sits on the stabiliser top over the clamp.
- **Fastener:** F02, ISO 4762 M3 × 16, 2 per side, through the flange, a printed crush
  sleeve (Ø7 × Ø3.4 × 6.8 mm through the 6.8 mm stabiliser, params tailT 0.006804) and
  into I01 inserts in the clamp top. e = 16 − 9.8 = 6.2 *(calc)*. **0.5 N·m EST.**
- These 4 screws remove the whole tail for transport (R4).

### J10 — Wing panels to the saddle (×2)
- **Fastener:** F09, ISO 7380 M5 × 20 A2 + N02 M5 nylock, 1 per side, vertical, at
  70 % chord, z ±65 mm (params boltZ).
- **Geometry (C4, C5):** a PETG panel root tongue (6.4 mm thick, 20 mm wide) projects
  25 mm inboard into a slot in a PETG bolt pillar (Ø16, full section height 21.8 mm) in
  the saddle. Hole Ø5.5. Head in a Ø10.3 × 1.0 spot-face. Nut pocket 8.2 AF × 8.0 deep
  from the lower surface; nut bears at 13.8 below the upper surface. Screw end at 21.0:
  2.2 mm past the nut, 0.8 mm inside the lower surface *(calc)*.
- Bending is carried by the joiner (RF 1.75 at the 6.55 kg MTOW, analysis/results.json struct.MS_J; 1.77 at 6.45 kg, 1.85 at v0.3.1). The bolt only stops the
  panel sliding off and rotating. **1.0 N·m EST.**

### J11 — Joiner and saddle to pod
- Joiner bonded into the saddle root-plate bores with epoxy (FT06). Saddle + joiner
  (0.76 m) stays on the pod and the panels slide on.
- **Fastener:** F08, ISO 4762 M3 × 12, 4 per aircraft, through a 6.0 mm PETG saddle
  flange into I01 inserts in the pod's top frame rails. e = 6.0. **0.5 N·m EST.**

### J12 — Pusher motor mount
- Printed PA6-CF cup Ø55.6 (FT11) with a 4.5 mm floor, centre relief Ø8 × 2.0, wire slot.
- Motor to cup: F01 + W01 × 4, as J01 (e = 3.0, Loctite 242, 0.6 N·m EST). Screws go in
  from inside the cup before it is fitted.
- Cup to pod tail ring: F07 ISO 7380 M3 × 8 × 4, radial, through the 2.0 mm ring wall
  into I01 inserts in solid cup bosses (hole Ø4.0 × 7.0). **0.4 N·m EST.**

### J13 — Canopy hatch
- Front tongue under the pod skin; rear 2 × F07 M3 × 8 through a 2.0 mm hatch flange
  into I01 inserts in the pod frame. **0.4 N·m EST.**

### J14 — Servos (5: 2 ailerons, elevator, 2 rudders)
- EMAX ES3005HV, 38.6 × 18.8 × 34.9 mm, 23T spline
  (https://readymaderc.com/products/details/85971-emax-es3005-analog-waterproof-servo).
  Tab hole size and spacing — ; screws in the box not confirmed (—).
- **Provisional:** F10 ISO 4762 M2 × 10 + N03 DIN 934 M2 captive under a printed tray
  (hole Ø2.6 model / 2.4 printed, nut pocket 4.2 AF × 2.0). 4 per servo. **0.15 N·m EST.**
  Measure the tabs on arrival (M6) and change the length if needed.

### J15 — FC, receiver, GPS, Remote ID, ESCs
- **FC (CoreWing F405 Wing V2):** 52 × 32 × 17 mm, 40 g
  (https://ardupilot.org/plane/docs/common-CoreWingF405WingV2.html). GetFPV gives
  "Mounting Pattern 30x30mm" (https://www.getfpv.com/corewing-f405-wing-v2-flight-controller-stack.html),
  which a 32 mm-wide board cannot carry as an M3 square. Pattern —. Provisional: printed
  tray with 4 × I01 bosses and F07 M3 × 8; fallback vibration foam tape.
- **RP3 receiver, BeeID:** double-sided foam tape; no fasteners.
- **GPS HGLRC M100-5883:** 21 × 21 × 8 mm, 7.7 g (GetFPV, FPV24 listings). Foam tape on
  a printed pad on the canopy top.
- **ESCs (SoloGood 45A):** heat-shrunk, 2 zip ties (kit item 11) each, on a 3 mm foam
  pad on the boom underside ahead of each motor mount. Dimensions — (listing).

### J16 — Pitot (Holybro MS5525DSO + PT40)
- Sensor board 20 × 22 × 11.4 mm with M3 / 6-32 holes (spacing —)
  (https://holybro.com/products/digital-air-speed-sensor). PT40 OD and length — (shown
  only in an image).
- Printed clamp bonded into the left wing tip; tube held by one F07 M3 × 8 pinch screw
  into an I01 insert. Bore = measured tube OD + 0.2.

### J17 — Control surfaces
- **Hinges:** tape (kit item 9, or packing tape, §7 option).
- **Horns:** 12-set nylon horns, 11 × 11 × 20 mm, with M2 × 14 screws (24 supplied)
  (https://www.amazon.com/dp/B0B58ZSC8J).
  - Ailerons: surface is about 16.9 mm thick at 78 % chord *(calc, NACA 2415)*, too
    thick for M2 × 14 through-bolting. Bond a PETG hardpoint (20 × 12 × 10) flush into
    the lower surface; screw the horn base to it with the supplied M2 × 14 into N03 nuts
    captive in 4.2 AF pockets.
  - Elevator (about 4.2 mm thick at 70 % chord, *calc*) and rudders (about 7.4 mm at the
    root, *calc*): through-bolt with the supplied M2 × 14, the kit backplate and N03 nuts.
- **Pushrods:** Du-Bro 230, 2-56 × 12 in rod with nylon Kwik-Link (kit item 8). 2-56 UNC
  is an inch thread; it is used only here. Servo end: Z-bend (no part).
- **Servo arm screw:** supplied with the servo lever set (Rotorama listing: "1x Lever
  Set"). Spline 23T.

### J18 — Battery retention
- 2 × ShareGoo straps 20 × 250 mm (BOM) through 22 × 3 mm slots in a printed tray.
  No fasteners.

### J19 — Power connectors
- XT90-S battery disconnect (kit item 1), XT60H boom-harness disconnects at the wing root
  (BOM): soldered, heat-shrunk, zip-tied to printed anchors. No fasteners. Motor leads
  soldered direct to the ESCs (no bullet connectors in the BOM).

### J20 — Spar sockets in the wing panels
- 1.000 × 0.058 in × 0.8 m bonded in a Ø26.0 channel (FT05) with foam-safe glue.
  Note: the BOM's 0.85 oz (25 ml) epoxy cannot fill both bond lines,
  2 × π/4 × (26.0² − 25.4²) × 800 = 38.8 cm³ *(calc)*. Use the 4 oz foam-safe glue line.

---

## 5. Fits and tolerances

### 5a. Tube tolerances
- 1.000 × 0.035 in 6061-T6 drawn: OD ±0.004 in, wall ±0.002 in (Zoro listing found by
  search, 2026-10-21; the page itself returned 403). One supplier lists ±0.008 in for
  5/8–1 in OD (https://alcobrametals.com/?p=91925). OnlineMetals states only "ASTM-B210"
  (pid 1211 page, checked 2026-10-21). The ASTM B210 table was not accessed (—).
- Used here: OD ±0.102 mm, wall ±0.051 mm, so ID ±0.203 mm *(calc)*, applied to all
  three tube sizes (EST for 0.875 in and the 0.058 wall).

### 5b. Fit table (diametral, mm)

| ID | Fit | Hole | Shaft | Min | Max | Action |
|---|---|---|---|---|---|---|
| FT01 | Joiner in spar socket | 22.454 ±0.203 | 22.225 ±0.102 | **−0.076** | 0.534 | Measure (M1). Lap if tight; one tape wrap if > 0.30 |
| FT02 | Boom in split clamp | 25.60 ±0.20 | 25.40 ±0.102 | −0.102 | 0.502 | 1.2 mm split gap clamps before the halves touch |
| FT03 | Leg in gear socket | 25.70 ±0.20 | 25.40 ±0.102 | −0.002 | 0.602 | Ream if tight; F05 retains |
| FT04 | Splice plug in boom | 23.622 ±0.203 | 23.20 ±0.20 | 0.019 | 0.825 | Plug only aligns and backs the cross-bolts |
| FT05 | Spar socket in foam | 26.0 ±0.5 (EST) | 25.40 ±0.102 | 0.098 | 1.202 | Bonded |
| FT06 | Joiner in saddle | 22.455 ±0.20 | 22.225 ±0.102 | −0.072 | 0.532 | Bonded; drill 22.6 if tight |
| FT07 | M3 clearance, printed | 3.4 ±0.2 as printed | 3.0 | 0.2 | 0.6 | Hole coupon (M2) |
| FT08 | M3 insert hole | 4.0 ±0.1 | 4.6 knurl | −0.7 | −0.5 | Interference intended |
| FT09 | Lift prop on Ø4 shaft | 4.0 (tol —) | 4.0 0/−0.03 | — | — | Must slide by hand |
| FT10 | Pusher prop ring on Ø6 | ring — | 6.0 0/−0.03 | — | — | Spin-check runout |
| FT11 | Pusher cup in pod ring | 56.0 ±0.2 | 55.6 ±0.2 | 0.0 | 0.8 | Radial screws locate |

FDM bore tolerance ±0.2 is EST. Published desktop FDM capability is ±0.5 %, lower limit
±0.5 mm (https://xometry.pro/en/articles/3d-printing-tolerances/, checked 2026-10-21).
So every bore and insert hole is set by a first-article coupon (M2), not by the default.

### 5c. General tolerances
- **Printed parts, uncontrolled features:** ±0.5 % of size, lower limit ±0.5 mm
  (Xometry desktop FDM, above).
- **Printed parts, controlled features:** bores and insert holes per §5b. Motor floor
  4.50 ±0.15. Motor bolt circle position Ø0.2. Other holes Ø0.4 (floating fastener
  T = H − F = 3.4 − 3.0).
- **Cut tubes:** ISO 2768-m: ±0.8 mm for 400–1000 mm lengths (boom 925.5, stub 485.9,
  sockets 800, joiner 760), ±0.5 mm for 120–400 mm (legs 205)
  (https://amesweb.info/fits-tolerances/iso-2768-linear-dimensions-tolerances.aspx,
  checked 2026-10-21). End squareness 0.5 mm (EST). Cross-hole position from the tube
  end ±0.3 mm (ISO 2768-m, 30–120 band); drill through the printed clamp as a jig.

---

## 6. Order list (per aircraft, with spares)

| Line | Item | Need | Order | Unit | Ext | URL |
|---|---|---|---|---|---|---|
| BD-1 | Bolt Depot 6379 M3 × 8 socket cap | 20 | 30 | 0.06 | 1.80 | https://boltdepot.com/Product-Details?product=6379 |
| BD-2 | Bolt Depot 6381 M3 × 12 socket cap | 4 | 12 | 0.06 | 0.72 | https://boltdepot.com/Product-Details?product=6381 |
| BD-3 | Bolt Depot 6382 M3 × 16 socket cap | 36 | 50 | 0.06 | 3.00 | https://boltdepot.com/Product-Details?product=6382 |
| BD-4 | Bolt Depot 6383 M3 × 20 socket cap | 16 | 24 | 0.07 | 1.68 | https://boltdepot.com/Product-Details?product=6383 |
| BD-5 | Bolt Depot 6384 M3 × 25 socket cap | 4 | 8 | 0.08 | 0.64 | https://boltdepot.com/Product-Details?product=6384 |
| BD-6 | Bolt Depot 6386 M3 × 35 socket cap | 4 | 8 | 0.15 | 1.20 | https://boltdepot.com/Product-Details?product=6386 |
| BD-7 | Bolt Depot 6387 M3 × 40 socket cap | 8 | 12 | 0.15 | 1.80 | https://boltdepot.com/Product-Details?product=6387 |
| BD-8 | Bolt Depot 7219 M3 × 8 button | 11 | 20 | 0.06 | 1.20 | https://boltdepot.com/Product-Details?product=7219 |
| BD-9 | Bolt Depot 6635 M5 × 20 button | 2 | 6 | 0.18 | 1.08 | https://boltdepot.com/Product-Details?product=6635 |
| BD-10 | Bolt Depot 6365 M2 × 10 socket cap | 20 | 30 | 0.12 | 3.60 | https://boltdepot.com/Product-Details?product=6365 |
| BD-11 | Bolt Depot 4792 M3 nylock | 8 | 16 | 0.07 | 1.12 | https://boltdepot.com/Product-Details?product=4792 |
| BD-12 | Bolt Depot 4794 M5 nylock | 2 | 6 | 0.09 | 0.54 | https://boltdepot.com/Product-Details?product=4794 |
| BD-13 | Bolt Depot 7362 M2 hex nut | 30 | bag 100 | — | 2.21 | https://boltdepot.com/Product-Details?product=7362 |
| BD-14 | Bolt Depot 4513 M3 washer | 28 | bag 100 | — | 1.45 | https://boltdepot.com/Product-Details?product=4513 |
| | **Bolt Depot subtotal** | | | | **22.04** | shipping shown only at checkout (—); $10.00 EST used below |
| AZ-1 | ruthex RX-M3x5.7 inserts, 100 | 67 | 100 | — | 9.99 | https://www.amazon.com/dp/B08BCRZZS3 |
| AZ-2 | Loctite 242 threadlocker 6 ml | — | 1 | — | 7.03 | https://www.amazon.com/dp/B000I1RSNS |

Fastener count per aircraft by size: **M2** 30 screws (10 supplied with the horns +
20 BD-10) and 30 nuts. **M3** 103 screws (F01 20, F02 36 incl. 8 provisional prop
screws, F03 16, F04 8, F05 4, F06 4, F07 11, F08 4), 8 nylocks, 28 washers, 67 inserts.
**M5** 2 screws, 2 nylocks. **M6** 1 prop nut (supplied).

---

## 7. Proposed BOM changes

`docs/purchasing/C0_BOM.csv` is generated by `analysis/export_bom.mjs` from
`analysis/results.json`. Make the edit there and regenerate; the CSV lines below show the
result. Not applied here.

**Delete** (1 line):
```
"Amazon","Airframe","Hardware kit: XT90S, wire, extensions, screws, inserts, horns, pushrods, hinge tape, heat shrink, UBEC, epoxy","1","124.01","124.01","BF §3 amazon.com (itemised in file)","","","",""
```

**Add** (kit items kept, itemised from budget-airframe.md §3a, prices as checked
2026-10-13; re-check before ordering):
```
"Amazon","Airframe","FLY RC Amass XT90S anti-spark, 5 pairs (B0893CGLP7)","1","13.99","13.99","BF §3a item 1","","","",""
"Amazon","Airframe","10 AWG silicone wire 5 ft red + 5 ft black (B0D968WN4W)","1","8.98","8.98","BF §3a item 2","","","",""
"Amazon","Airframe","BNTECHGO 12 AWG silicone wire 10+10 ft (B01ABOPMEI)","1","14.98","14.98","BF §3a item 3","","","",""
"Amazon","Airframe","300 mm servo extension leads, 10 (B0FYCJLY1V)","1","6.99","6.99","BF §3a item 4","","","",""
"Amazon","Airframe","Nylon control horns 12 sets, M2x14 screws (B0B58ZSC8J)","1","8.98","8.98","BF §3a item 7; HS J17","","","",""
"Amazon","Airframe","Du-Bro 230 Kwik-Link 2-56 pushrods, 5 (B0006O8TAI)","1","12.48","12.48","BF §3a item 8","","","",""
"Amazon","Airframe","Andibro hinge tape 1 in x 10 yd, 2 rolls (B0H7J994N4)","1","6.69","6.69","BF §3a item 9 (optional, see HS §7)","","","",""
"Amazon","Airframe","Heat-shrink kit 2:1, 900 pcs (B0BG6V4HV4)","1","6.99","6.99","BF §3a item 10","","","",""
"Amazon","Airframe","Zip ties 4/6/8/12 in, 200 (B0CSXGZXM8)","1","3.99","3.99","BF §3a item 11","","","",""
"Amazon","Airframe","ZORZA UBEC 5 V 5 A, 2 pcs (B0CQ1R55BV)","1","9.99","9.99","BF §3a item 12","","","",""
"Amazon","Airframe","Gorilla 5-min epoxy 0.85 oz (B001Z3C3AG)","1","5.97","5.97","BF §3a item 13","","","",""
```
(These 11 lines total $100.03 = $124.01 − $17.99 Mywish − $5.99 generic inserts *(calc)*.)

**Add** (new, checked 2026-10-21; "HS" = this file):
```
"Amazon","Airframe","ruthex RX-M3x5.7 heat-set inserts, 100 (B08BCRZZS3)","1","9.99","9.99","HS §2c amazon.com","replaces generic M3 inserts","","",""
"Amazon","Airframe","Loctite 242 threadlocker 6 ml (B000I1RSNS)","1","7.03","7.03","HS §2d amazon.com","metal-to-metal threads only","","",""
"Bolt Depot","Airframe","A2 metric fasteners per HS §6 (14 lines: M2/M3/M5 screws, nylocks, nuts, washers)","1","22.04","22.04","HS §6 boltdepot.com","replaces Mywish kit B0CQWYFTXC","","",""
```
**Change** (summary block, not a goods line, so it is not taxed):
```
"Shipping allowance (estimate)",,,,,110.00      (was 100.00; +10.00 EST Bolt Depot, charge shown only at checkout)
```
If the generator needs one line per SKU, expand the Bolt Depot line into BD-1 … BD-14
from §6. Ext values are unchanged.

**Totals** *(calc; tax 10.25 % on goods as in the current BOM; Bolt Depot shipping kept
outside the goods subtotal like the existing allowance)*:

| | Current | Proposed | Proposed, hinge tape dropped |
|---|---|---|---|
| Goods subtotal | 1,630.77 | 1,630.77 + 22.04 + 9.99 + 7.03 − 17.99 − 5.99 = **1,645.85** | 1,639.16 |
| Tax 10.25 % | 167.15 | **168.70** | 168.01 |
| Shipping | 100.00 (allowance) | 100.00 + 10.00 EST = **110.00** | 110.00 |
| **Committed spend** | 1,897.92 | **1,924.55** | **1,917.17** |
| **Reserve under $2,000** | 102.08 | **75.45** | **82.83** |
| Delta vs current | — | **+26.63** | +19.25 |

The cap holds with either option. The reserve falls below the R7 target of $100 (EST
target, DESIGN-BASIS R7) by $24.55, or $17.17 with the hinge tape dropped
(budget-airframe.md §3a notes that packing tape can serve as hinge tape). Further
offsets are possible, but they belong to the team and are not assumed here:
- drop BD-10 (−$3.60) if the servos ship with screws (M6);
- keep the generic inserts (−$4.00) and size their holes by coupon. This gives up the
  published hole geometry.

---

## 8. Tools and assumptions
- On hand (R6): FDM printer, hand tools. Assumed available, at $0, at a makerspace:
  soldering iron (needed anyway for the XT90/XT60 wiring) with a conical tip for inserts,
  hand drill or drill press with Ø2.5/3.4/4.0/5.5 bits, hacksaw or tube cutter, file,
  calipers, torque screwdriver (fallback: hanging-mass method, §2d).
- Hot-wire bow: budgeted (BOM, $40 EST).
- No tapping, no machining, no welding.

---

## What the team must measure

- **M1 — Tube fits on receipt.** Calipers on every tube: OD at 3 points, wall at the
  ends. Slide the joiner into both sockets. **Fails FT01** if it will not enter by hand
  (lap it) or if wingtip play exceeds 5 mm at 1.2 m (budget-airframe.md M4 threshold):
  shim it.
- **M2 — Hole coupon (first article).** Print in PETG and PA6-CF: M3 clearance holes at
  3.4/3.6, insert holes at 3.8/3.9/4.0/4.1, and a 25.4 bore ring at 25.5/25.6/25.7.
  Choose model values that give as-printed 3.4, 4.0 and 25.6 ±0.1. Everything in §5b
  depends on this.
- **M3 — Insert torque-out and floor crush.** Install 3 inserts per material in the
  coupon. Torque each to spin-out by the hanging-mass method. **Fails** the 0.5 N·m
  working torque if any spins below 1.0 N·m: lower the torque or use a longer insert.
  Torque an M3 × 8 with a washer to 0.6 N·m through a 4.5 mm PA6-CF floor into an
  aluminium nut plate, wait 24 h, re-check. **Fails** if it turns more than 30° (crush).
- **M4 — Motor screw depth.** Before every motor install: screw tip ≤ 3.2 mm proud of the
  floor. Above 3.3 mm it can reach the windings (drawing).
- **M5 — Prop hubs.** Measure the JeeFly 1755 hub thickness t. Prop screw length =
  2.5 + t + 5.0 (round to 12/16/20). **Fails** if engagement > 8.0 mm or < 4.5 mm.
  Measure the APC 14 × 8.5EP hub and pick the 6 mm adapter ring.
- **M6 — Servo tabs and FC holes.** Measure the ES3005HV tab hole size and spacing, and
  the CoreWing hole pattern. Update F10 and J15 before printing the trays.
- **M7 — Splice and clamp slip.** With a boom assembled, hang 2 kg on a 0.25 m lever
  (4.9 N·m about the boom axis, *calc*) from a motor mount and from the tail clamp.
  **Fails** if the witness line moves: add a cross-bolt at that clamp (F04 type).

## Unknowns (—)
JeeFly 1755 hub thickness; APC 14 × 8.5EP hub thickness and ring sizes; ES3005HV tab
holes and whether screws are included; CoreWing F405 Wing V2 hole pattern (sources
conflict); PT40 tube OD and MS5525 hole spacing; insert torque-out in PETG/PA6-CF;
PA6-CF compressive strength; ASTM B210 tolerance table; Bolt Depot shipping charge; SoloGood ESC
dimensions.

Sources not otherwise linked: motor data, SunnySky drawing above; BOM and budget,
`docs/purchasing/C0_BOM.csv`, `docs/research/budget-airframe.md` §3; geometry,
`cad/params.txt`, `cad/params.mjs`, `analysis/results.json` (concepts.C0.geo, struct).

---

## CAD implementation notes (rev B, 2026-10-21)

Applied in `cad/params.mjs`, `cad/BuildVtol.cs`, `cad/Drawings.cs` (drawing DBF-DRW-001 rev B). Deviations from the
sections above are listed so the spec and the model agree:

- **C1–C6 implemented.** Motor mount split (upper half +0.6..+21.0 with the 4.5 floor, cap −15.0..−0.6), boom butt
  joint with splice plug and 2 × F04, all clamps 46 wide and split, M5 × 20 wing bolts, rudders on both fins
  (30 % of the local chord, 2 % hinge gap, from 22 mm above the fin root to clear the shoe wall), and the new parts of C5
  plus crush sleeves, a bolt pillar, a battery tray, an FC envelope, servo trays, horns, backplates, pushrods and
  joiner stops.
- **Aero re-sizing (2026-10-21, `analysis/aero/aero_results.json`).** CL_max 1.132 and the drag build-up grow the wing
  to 0.632 m² (chord 263 mm, MTOW 6.43 kg). Consequences for this spec: the front boom is **960.8 mm** (rear stub 485.9
  unchanged) because the front rotor moves forward with the chord; the wing section at 70 % chord is 24.1 mm instead of
  21.8, so the M5 × 20 keeps the 1.0 spot-face and the nut pocket is **8.5 deep** from the lower surface (screw end 3.0
  above the lower surface, 0.5 past the nut). Tail chords grow in proportion (stabiliser 89.3 mm, fin root 155.6 mm).
- **R11 wing re-size (2026-10-25, CAD rev C, drawing DBF-DRW-001 rev D).** CL_max 1.121 (`analysis/aero/aero_results.json`)
  closes stall <= 12 m/s with chord 266.6 mm, S 0.640 m², MTOW 6.45 kg (`analysis/results.json`). Front boom **965.7 mm**
  (rear stub 485.9 unchanged). The section at 70 % chord is 24.4 mm, so the J10 nut pocket is **9.0 deep** (`cad/params.mjs`
  pillarNutDepth, same rule: screw end 0.5 past the nut); its ceiling now reaches the tongue slot floor (8.8), so the
  nylock bears on the root tongue. Tail chords: stabiliser 91.2 mm, fin root 156.3 mm. All of these sizes are read from
  `cad/params.txt` by the model, the drawings and the foam templates.
- **Stall-target re-base (2026-10-25, CAD rev D, drawing DBF-DRW-001 rev E).** Design stall target 11.75 m/s
  (`docs/research/stall-margin.md`), CL_max 1.114 (`analysis/aero/aero_results.json`): chord 284.2 mm, S 0.682 m²,
  MTOW 6.55 kg (`analysis/results.json`). Front boom **991.0 mm** (rear stub 485.9 unchanged). The section at 70 % chord
  is 26.0 mm (`cad/params.txt` pillarH), so the J10 head now sits in a **Ø10.3 × 2.0 spot-face** (pillarSpot; the
  2.75 mm button head is near-flush, 0.75 proud *(calc)*) and the nut pocket is **9.6 deep** from the lower surface
  (pillarNutDepth; the pocket ceiling meets the tongue-slot floor at 9.6, pillarSlotFloor, so the nylock still bears on
  the root tongue). Screw end 22.0 below the top vs the nut's outer face at 21.4 *(calc: 26.0 − 9.6 + 5.0)*: 0.6 mm
  past the nut (the CAD rule targets 0.5), so the nylon insert is engaged, and 4.0 mm inside the lower surface. Tail chords: stabiliser
  101.5 mm (9.1 thick), fin root 159.7 mm. Pushrods 48.4 / 39.6 / 102.4 mm (`cad/params.txt` rodAileron / rodElevator /
  rodRudder). Battery station x = 0.189.
- **J05 clamp screws: 2 per clamp on a diagonal** (x ±12, z ±17.5 opposite corners) so the spar-collar insert bosses
  sit beside the spar tube, not under it (an insert hole on the spar axis would break into the tube).
- **J09.** The tail clamp is 50 long, centred 33.9 mm behind the fin LE (fin 22.5 % chord) so the shoe flange (32 × 46)
  stays inside the fixed 68 % of the stabiliser chord and clear of the elevator; the tail-clamp top is at boom centre
  +15.7 (2.9 mm wall over the bore) and the stabiliser span is the boom spacing + 50 mm to carry the flanges.
- **J11 / FT06 (changed): the joiner is NOT bonded.** It is a slip fit in the saddle bores (same tolerance band as
  FT01) and is captured by two printed `Joiner_Stop` discs (Ø22.4 × 10, PETG) bonded 300 mm inside the spar sockets:
  with both panels bolted on (F09) the joiner cannot migrate, and for transport it slides out so the pod piece stays
  within the R4 0.5 m width. The saddle is fixed to the pod by 2 × F08 per side through 6 mm side tabs (horizontal, at
  −0.10 c and −0.30 c where the pod is still parallel) into inserts that the model places in the pod body (frame rails
  in reality).
- **J12 pusher stack.** Cup floor 4.5, F01 heads inside the cup; the adapter flange is 5.0 thick (EST) with Ø5.7 × 3.0
  counterbores and its four screws are modelled as **F13** (M3 × 8 EST, supplied with the motor, added to
  `cad/hardware.json`); the APC hub is 8 mm (EST). The rev A spinner is removed (the bullet nut N04 is the real part).
- **J13.** The canopy carries a 2 mm rear flange (2 × F07 into inserts) and a 2 mm front tongue; pockets in the pod.
- **J14.** One printed L-tray for all five servos; aileron servos lie on their side in a wing pocket with the arm
  through the open lower surface; elevator and rudder servos stand on the stabiliser top (foot down, arm up). The
  elevator pushrod is 21 mm and inclined about 18° (rev B; at CAD rev D the cut length is 40 mm, `cad/params.txt`
  rodElevator 39.6; inclination not re-checked); the horn is on the elevator top surface.
- **J16.** Pitot tube centre 9.5 mm below the wing lower surface at 50 mm aft of the LE (21 % chord at rev B; 18 % of the 284.2 mm chord at CAD rev D); the pinch screw stops 0.9 mm short of
  the tube in the model (it bears on the tube when tightened).
- **Leg fairings (new, aero).** `Gear_Fairing`: 3:1 teardrop (NACA 0033 section, chord 81.6, 170 long) in PETG,
  vase-mode 0.8 mm wall (EST, 29.6 g each), slipped over each leg, trailing edge aft, clocked against the gear clamp and
  taped. No fasteners. Mass is in `mGear` (`analysis/sizing.mjs`).
- **Not modelled (no fasteners or dimensions unknown):** ESCs and their foam pads, receiver, Remote ID, GPS pad, straps,
  wiring and zip-tie anchors, XT60/XT90 connectors, tape hinges, the PETG pod frames and rails (the pod is one solid).
- **Interference and masses:** `cad/verification.txt` (generated by each build).
- **J07 (changed by the CAD): F05 is M3 × 30, not M3 × 25.** In the 34 mm gear-clamp block the spec's 8.0 nut pocket
  and 6.0 counterbore reach x ±9 and ±11, inside the Ø25.4 leg tube that sits in the socket. The model puts the nut
  pocket 4.3 deep (nut bearing at −12.7, just outside the tube) and the counterbore 4.0 deep (head seat at +13.0, washer
  to 13.5), so the screw must be 30 long (end 0.2 inside the nut's outer face). Order line BD-5 becomes M3 × 30 (Bolt
  Depot socket cap; product number 6385 and price EST $0.10, not verified). `cad/hardware.json` F05 carries the change.
- **J15.** The avionics bay floor is at y −20 (7 mm above the battery top at the battery station x = 0.189, CAD rev D; 0.181 at rev C, 0.179 at rev B; `cad/params.txt` bayY0, battY, battH), so the
  FC tray, the CoreWing envelope and the four F07 tray screws clear the battery.
- **Interference detection (SOLIDWORKS InterferenceDetectionMgr, `cad/verification.txt`):** the 67 heat-set inserts are
  reported as intended press fits (Ø4.6 in Ø4.0); the remaining reported volumes are listed in the file with their cause.
- **J01 counterbore Ø7.5, not Ø6.5.** The spec's Ø6.5 counterbore cannot take the Ø7.0 W01 washer under the M3 × 8
  head (its own rule: cap + washer = 7.5). The motor-mount counterbores are Ø7.5 from the bore to the floor.
