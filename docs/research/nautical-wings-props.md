# Nautical Wings Aerospace and custom carbon props

All sources checked 2026-10-19. "—" = not found.

## 1. Who is Nautical Wings Aerospace
- **Most likely match:** Nautical Wings Aerospace, Bengaluru, India (only company found under this exact name). Location: [idrw.org](https://idrw.org/bengaluru-based-nautical-wings-aerospace-plans-1mw-electric-motor-for-future-vtol-platforms/).
- Founded 2020 by Shiv Varun Singh Rajput, Praveen T, Vikas Kamath; pre-Series A (amount undisclosed) reported 5 Sep 2024; B2B hardware to aircraft OEMs; flagship is an "Integrated Electric Propulsion Unit" ([Entrackr](https://entrackr.com/2024/09/venture-catalysts-and-1crowd-back-nautical-wings-aerospace)).
- Makes mainly electric motors: axial-flux drone motors, 30–40 kW motors, 1 MW-class VTOL motor planned ([Tyto customer story, 16 Apr 2026](https://www.tytorobotics.com/blogs/customer-stories/nautical-wings-aerospace); [idrw.org](https://idrw.org/bengaluru-based-nautical-wings-aerospace-plans-1mw-electric-motor-for-future-vtol-platforms/)).
- Propellers: the Tyto page lists "standard series propellers from 14 to 40 inches" and a 30 in fixed prop from a "high thrust series" ([Tyto](https://www.tytorobotics.com/blogs/customer-stories/nautical-wings-aerospace)). idrw says "optimized propeller systems" are planned and does not say they make props ([idrw.org](https://idrw.org/bengaluru-based-nautical-wings-aerospace-plans-1mw-electric-motor-for-future-vtol-platforms/)).
- Company website: — (none found in any source; a search did not surface one). UC Berkeley or student connection: — (none in any source read).
- Caution: nothing found links this India-based firm to free or on-demand student prop design. Ask the team for the contact and offer terms in writing.

## 2. Their propeller products
- Sizes: 14–40 in standard series; 30 in fixed high-thrust prop ([Tyto](https://www.tytorobotics.com/blogs/customer-stories/nautical-wings-aerospace)).
- Carbon layup, hub/bore/mounting, folding vs fixed (other than the 30 in being fixed), CW/CCW, balancing, published thrust or efficiency data, lead time, ordering process, prices: — (not in any source found). The Tyto page says they test on Tyto Flight Stand 15 and 50 but publishes no data I could read.

## 3. Spec sheet to send the prop designer
Motor facts: SunnySky X4110S 400KV, 4 mm shaft, bolt-on prop adapter with holding plate and screws, not collet mount, 48.2 mm OD, 149 g, 6S max, 577 W max continuous, 26 A/30 s ([ReadymadeRC](https://www.readymaderc.com/products/details/86945-sunnysky-xs-high-power-x4110s-brushless-motor-400kv); [GetFPV](https://www.getfpv.com/sunnysky-x4110s-400kv.html)). Adapter bolt pattern: —; measure the actual adapter. Retailer-recommended props are only 12–15 in ([GetFPV](https://www.getfpv.com/sunnysky-x4110s-400kv.html)), so 17 in is beyond that list; confirm current limit with the designer (see max RPM).

| Item | Lift (x4 + 1 spare) | Pusher (x1 + spare) |
|---|---|---|
| Diameter | 17 in (432 mm; repo calls it a "17 in lift prop"); confirm | 14 in (APC 14x8.5EP baseline) |
| Pitch | — (designer to propose from design point) | 8.5 in baseline ([APC 14x8.5E](https://www.readymaderc.com/products/details/apc-14x8-5e-prop)) |
| Blades | 2 (assumption, estimate) | 2 |
| Rotation | 2 CW + 2 CCW, plus a spare of each (5 motors: tell the designer which direction the spare is) | one direction, matching motor |
| Hub thickness | — (set by adapter stack; measure) | APC baseline hub 11.2 mm thick, 20.3 mm dia. |
| Bore / interface | Adapter-mount; ask for bore matched to adapter, not 4 mm shaft direct | APC baseline bore 6.35 mm (0.25 in) with adapter rings |
| Max RPM | — ; compute: 400 KV x ~25.2 V (6S full) = ~10,000 RPM no-load (estimate, formula KV x V); tip speed must stay well below Mach. Designer to state max safe RPM | same |
| Design point | Hover thrust per rotor = 6.18 kg / 4 = 1.545 kg (15.2 N) (arithmetic from [DESIGN-BASIS.md](../DESIGN-BASIS.md)); ask for peak thrust margin (e.g. +50%, estimate) for control | Cruise at 20 m/s; thrust required = drag, — (take from repo aero estimate) |
| Material | Carbon fiber layup and finish: designer to propose; ask for UV clear coat | same |
| Balance | Request ISO 21940-11 grade, typically G 6.3 or better ([UST](https://www.unmannedsystemstechnology.com/feature/two-methods-for-balancing-drone-propellers-to-boost-uav-performance/)); factory static plus dynamic balance report | same |
| Quantity | 6 min (2 per direction pair + spares) | 2 |

- **Stop-in-cruise note:** lift props stop and must hold fore-aft in cruise; ESCs cannot park them. Prefer fixed (not folding) blades and plan a mechanical parking method (mechanical lock or brake), —; repo notes fixed props hold whatever angle the hub stops at and folding blades may swing or windmill, unverified ([lift-propulsion.md](../research/lift-propulsion.md)). Also state blades should be thin in the drag direction.

## 4. Acceptance tests on received props
1. **Visual and tap test:** check for delamination, cracks, voids, resin-starved areas; tap blades and listen for dull spots (method is standard practice; no single source found, —). Carbon props are rigid and sharp: wear eye protection ([ArduPilot](https://ardupilot.org/copter/docs/common-vibration-damping.html)).
2. **Mass check:** weigh every prop; matched pairs within the designer's tolerance, —. Reject outliers.
3. **Static balance** on a low-friction balancer: no blade drops in any position ([UST](https://www.unmannedsystemstechnology.com/feature/two-methods-for-balancing-drone-propellers-to-boost-uav-performance/)). ArduPilot advises full balance with a good manual balancer ([ArduPilot](https://ardupilot.org/copter/docs/common-vibration-damping.html)).
4. **Dynamic balance** on a stand with vibration and RPM sensors, target below G 6.3 ([UST](https://www.unmannedsystemstechnology.com/feature/two-methods-for-balancing-drone-propellers-to-boost-uav-performance/)). Fixed props with small hubs balance more repeatably than folding ones; place correction mass near the tip ([Tyto](https://www.tytorobotics.com/blogs/articles/propeller-balancing-troubleshooting-guide)).
5. **Adapter fit:** adapters should be concentric and straight ([ArduPilot](https://ardupilot.org/copter/docs/common-vibration-damping.html)); check runout by eye on the motor.
6. **Thrust-stand test vs baseline:** run the carbon prop and the APC baseline on the same motor, ESC and battery; compare thrust, current and efficiency at hover and max throttle; stay inside the 26 A/30 s motor limit ([GetFPV](https://www.getfpv.com/sunnysky-x4110s-400kv.html)). A Tyto-class stand is the tool named in [Tyto](https://www.tytorobotics.com/blogs/customer-stories/nautical-wings-aerospace).
7. **RPM limit:** step up to max RPM behind a shield, check vibration and look for blade flutter or deformation; acceptance threshold —.
8. **Tip clearance:** measure airframe and boom clearance to the disc; numeric limit —.
