# Motion clearance (Fusion, 2026-11-02)

Document `VTOL C0 full`, saved as "Motion clearance fixes". Full numbers: `motion_clearance_report.json`. Script: `motion_clearance_fusion.py` (runs inside Fusion).

## What collided (before)
- **Ailerons (R and L):** TE-down, the lower edges closed the 4.77 mm hinge gap from servo +25 (surface about 15 deg): 240 mm3 at +25, 13 100 mm3 at +45. TE-up, the pushrod and its heat-shrink bead cut into the pocket wall (52 mm3 at -45).
- **Elevator:** from servo +15 it hit the tail saddle HW-058 (16-93 mm3), the rudder servo case HW-131 (19-79 mm3), the rear boom stub (up to 12 mm3) and the fin (0.5 mm3).
- **Rudders:** rudder skin, horn and backing plate touched saddle HW-058 at every deflection (1-4 mm3); the horn also hit the Kwik-Link and rod at servo -30 or beyond (rudder R) and +30 or beyond (rudder L), up to 1.9 mm3.
- **Battery slider (+-30 mm):** zero play in the pod pocket, blocked by pod formers from 3 mm.
- **Props, pusher, wheels, canopy, H-tail lift:** no collision.
- **Wing panels sliding off the joiner:** clear, but only if the H-tail is removed first (it rides on the right panel chain in the joint tree).

## What was changed
- Wing_Panel_R/L: cove in the trailing edge swept by the aileron leading edge to throw+2.4 deg, offset 0.8 mm (about -24 cm3 each); pushrod and bead exit slots (1.5-2 mm offset); servo-arm relief (13 mm3).
- Elevator: end-corner reliefs swept from fin, boom stub, saddle and servo (offset 1.0 mm, -0.58 cm3).
- Saddle HW-058_3/_4: rudder envelope (offset 1.0 mm, -363 mm3 each). Rudder horn HW-093: relief for clevis and rod (-23 mm3 each).
- Fuselage_Pod: battery pocket extended -5/+8 mm (-31 cm3).
- Limit change: battery slide -30..+30 mm became -4..+7 mm (formers). Updated in kinematics.json, make_kinematics.py, joints_spec.json and the Fusion joint. No surface throw was reduced.

## After
Full sweep, 19 servo steps per mechanism (-44.99..+44.99): 0 rigid collisions (the 7.89 mm3 arm Z-bend in the arm hole is the intended contact; hinge tape and LiPo straps are flexible).
Minimum clearances (approximate, offset by shifted-copy union): aileron to wing >= 0.65 mm; pushrod to slot wall >= 0.9 mm; arms >= 1.0 mm; elevator and rudder to saddle, fin, boom, servo >= 1.0 mm; clevis to horn >= 0.5 mm; lift props >= 30 mm (L1 > 80 mm); pusher > 40 mm.

## Breakdown order
Canopy up 100 mm, then H-tail up 150 mm (remove its screws), then both wing panels outboard 300 mm (booms, motors, props, gear, fins and servos go with them).

## Open issue
The battery cannot be lifted out in this CAD: the pod is solid above it (z -2..5), the wing saddle covers its rear 17 mm and the canopy only covers y 10-31 cm. It needs a hatch or a pod change; not done.
