"""Variant a2 (Boundary-layer-ingesting pusher, 0.45 m tail cone module) built in Autodesk Fusion on a copy of "VTOL C0 full".

Document: "VTOL A2 BLI pusher" (saveAs copy of C0, never edit C0).  Spec: concepts/variants/a2/{design,geometry,inventory,metrics}.
Axis mapping: model (x fwd, y up, z right) m -> Fusion (z, x, y) * 100 cm.  Direct-modelling design: temp B-reps are added straight to components.
Run each step from a short Fusion script on the PC:  exec(open(PATH).read(), globals()); step_xxx()
Order: step_move, step_pod, step_cone, step_cone_details, step_joint_parts, step_hw, step_wires, step_groups, step_joints,
       step_check, step_sweep, step_export, step_cad_files, step_render(view).
"""
import adsk.core, adsk.fusion, traceback, math, re, os, json, struct

app = adsk.core.Application.get()
P3 = adsk.core.Point3D
V3 = adsk.core.Vector3D
M3 = adsk.core.Matrix3D
VI = adsk.core.ValueInput
tbm = adsk.fusion.TemporaryBRepManager.get()
BT = adsk.fusion.BooleanTypes
DOC = 'VTOL A2 BLI pusher'
BASE = 'C:/Users/trist/Documents/DBF-Fusion-Export/variants/a2/'
STATE = BASE + 'state.json'

DX = 1.67            # pod slide, Fusion cm along +Y (model +X)   geometry.json constants.DX_pod_slide_m
DXT = DX - 10.0      # pusher set: DX - 0.100 m tail stretch
YC = -3.33           # start of the spec 0.45 m cone (rev 1 joint plane), Fusion y
S0 = 22.67           # cm of the spec cone that belongs to the pod forebody (joint plane moved aft of the wing, rev 2)
YJ = YC - S0         # joint plane, Fusion y = -26.00 (model x = -0.2600 m)
SPL = [S0, 34.0, 39.5, 45.0]    # tail module segment splits, cm aft of YC
RSL_O, RSL_I, RT_O, RT_I, RB_O = 5.03, 4.63, 4.59, 3.70, 5.00     # sleeve OD/ID (at the aft end), tongue OD/ID, spigot body OD (cm)
YE = -48.33          # pod end, Fusion y
AXZ = -3.0           # pod axis, Fusion z (model y = -0.03 m)
CONE_L = 45.0
WHITE = [0.949, 0.957, 0.969]
DARK = [0.12, 0.13, 0.16]
STEEL = [0.72, 0.74, 0.78]
BRASS = [0.85, 0.65, 0.2]
C0MAP = {"Fuselage_Pod": {"file": "stl/Fuselage_Pod.stl", "group": "airframe", "color": [0.945, 0.957, 0.969]}, "Canopy": {"file": "stl/Canopy.stl", "group": "airframe", "color": [0.094, 0.157, 0.259], "moving": "slide_canopy"}, "Battery_6S_LiPo": {"file": "stl/Battery_6S_LiPo.stl", "group": "electronics", "color": [0.2, 0.443, 0.843], "moving": "slide_battery"}, "J-11 Pusher motor - firewall - pod aft bulkhead": {"file": "stl/J-11_Pusher_motor_firewall.stl", "group": "hardware", "color": [1.0, 1.0, 1.0], "joint": "J-11"}, "Pusher_Prop_Set": {"file": "kinematics/Pusher_Prop_Set.stl", "group": "propulsion", "color": [0.059, 0.059, 0.067], "moving": "prop_P", "color_note": "prop + motor can merged on export; colour set to the prop colour (cad/mesh/meta.json Lift_Prop)"}, "J-24+27 Canopy screws and GPS mast": {"file": "stl/J-24_27_Canopy_screws_GPS_mast.stl", "group": "hardware", "color": [1.0, 1.0, 1.0], "rides": "slide_canopy", "joint": "J-24"}, "J-25 Pod formers battery tray straps": {"file": "stl/J-25_Pod_formers_battery.stl", "group": "hardware", "color": [1.0, 1.0, 1.0], "joint": "J-25"}, "J-26 FC stack on avionics deck deck on formers": {"file": "stl/J-26_FC_stack_on.stl", "group": "hardware", "color": [1.0, 1.0, 1.0], "joint": "J-26"}, "J-28 RX Remote ID UBEC BUS1 XT90S airspeed module c [C]": {"file": "stl/J-28_RX_Remote_ID_C.stl", "group": "hardware", "color": [0.929, 0.929, 0.898], "joint": "J-28"}, "J-29 ESC mounting lift ESCs on boom outboard faces [C]": {"file": "stl/J-29_ESC_mounting_lift_C.stl", "group": "hardware", "color": [0.929, 0.929, 0.898], "joint": "J-29"}, "XT90S_1": {"file": "stl/XT90S_1.stl", "group": "electronics", "color": [0.447, 0.498, 0.549]}, "FC1": {"file": "stl/FC1.stl", "group": "electronics", "color": [0.149, 0.647, 0.349]}, "BUS1": {"file": "stl/BUS1.stl", "group": "electronics", "color": [0.447, 0.498, 0.549]}, "UBEC1": {"file": "stl/UBEC1.stl", "group": "electronics", "color": [0.447, 0.498, 0.549]}, "GPS1": {"file": "stl/GPS1.stl", "group": "electronics", "color": [0.447, 0.498, 0.549], "rides": "slide_canopy"}, "RX1": {"file": "stl/RX1.stl", "group": "electronics", "color": [0.447, 0.498, 0.549]}, "ESC_P": {"file": "stl/ESC_P.stl", "group": "electronics", "color": [0.859, 0.376, 0.098]}, "CAP_P": {"file": "stl/CAP_P.stl", "group": "electronics", "color": [0.949, 0.8, 0.149]}, "RID1": {"file": "stl/RID1.stl", "group": "electronics", "color": [0.447, 0.498, 0.549]}}

MOVE_FWD_PRE = ('Fuselage_Pod', 'Canopy', 'Battery_6S_LiPo', 'XT90S_1', 'FC1', 'BUS1', 'UBEC1', 'GPS1', 'RX1', 'RID1', 'ESC_P', 'CAP_P',
                'J-24+27', 'J-25 ', 'J-26 ')
MOVE_TAIL_PRE = ('J-11 ', 'Pusher_Prop_Set')


def is_fwd(o):
    n = o.name
    return n.startswith(MOVE_FWD_PRE) or (n.startswith('J-28') and '[C]' in n) or (n.startswith('J-29') and '[C]' in n)


def is_tail(o):
    return o.name.startswith(MOVE_TAIL_PRE)


def design():
    return adsk.fusion.Design.cast(app.activeProduct)


def root():
    return design().rootComponent


def guard():
    if app.activeDocument.name != DOC:
        raise Exception('wrong document: ' + app.activeDocument.name)


def load_state():
    try:
        return json.load(open(STATE))
    except Exception:
        return {}


def save_state(s):
    json.dump(s, open(STATE, 'w'))


def mp(x, y, z):
    return P3.create(z * 100.0, x * 100.0, y * 100.0)


def add(p, v, d):
    return P3.create(p.x + v.x * d, p.y + v.y * d, p.z + v.z * d)


def vv(x, y, z):
    v = V3.create(x, y, z)
    v.normalize()
    return v


AX_X, AX_NX = vv(1, 0, 0), vv(-1, 0, 0)
AX_Y_, AX_NY = vv(0, 1, 0), vv(0, -1, 0)
AX_Z_, AX_NZ = vv(0, 0, 1), vv(0, 0, -1)


def cyl(c, a, r, h, off=0.0):
    p0 = add(c, a, off)
    return tbm.createCylinderOrCone(p0, r, add(p0, a, h), r)


def cone(c, a, r0, r1, h, off=0.0):
    p0 = add(c, a, off)
    return tbm.createCylinderOrCone(p0, r0, add(p0, a, h), r1)


def U(a, b):
    tbm.booleanOperation(a, b, BT.UnionBooleanType)
    return a


def D(a, b):
    tbm.booleanOperation(a, b, BT.DifferenceBooleanType)
    return a


def tube(c, a, ro, ri, h, off=0.0):
    o = cyl(c, a, ro, h, off)
    if ri > 0:
        D(o, cyl(c, a, ri, h + 0.2, off - 0.1))
    return o


def box(cx, cy, cz, dx, dy, dz):
    """Fusion cm centre and full sizes along Fusion X, Y, Z"""
    obb = adsk.core.OrientedBoundingBox3D.create(P3.create(cx, cy, cz), V3.create(1, 0, 0), V3.create(0, 1, 0), dx, dy, dz)
    return tbm.createBox(obb)


_AP = {}


def appearance(col, metal=False):
    key = (tuple(round(x, 2) for x in col), metal)
    if key in _AP:
        return _AP[key]
    des = design()
    nm = 'A2c_%02d%02d%02d_%s' % (tuple(int(round(x * 99)) for x in key[0]) + ('m' if metal else 'p',))
    ap = des.appearances.itemByName(nm)
    if ap is None:
        lib = app.materialLibraries.itemByName('Fusion Appearance Library')
        base = None
        names = ('Stainless Steel - Satin',) if metal else ('Plastic - Matte (White)', 'Paint - Enamel Glossy (White)', 'Plastic - Glossy (White)')
        for bn in names:
            base = lib.appearances.itemByName(bn)
            if base:
                break
        ap = des.appearances.addByCopy(base, nm)
        if not metal:
            try:
                adsk.core.ColorProperty.cast(ap.appearanceProperties.itemByName('Color')).value = \
                    adsk.core.Color.create(int(col[0] * 255), int(col[1] * 255), int(col[2] * 255), 255)
            except Exception:
                pass
    _AP[key] = ap
    return ap


def paint(b, col, metal=False):
    try:
        b.appearance = appearance(col, metal)
    except Exception:
        pass


def new_body(comp, temp, name, col, metal=False):
    b = comp.bRepBodies.add(temp)
    b.name = name
    paint(b, col, metal)
    return b


def new_comp(name):
    occ = root().occurrences.addNewComponent(M3.create())
    occ.component.name = name
    return occ, occ.component


def occ_named(prefix):
    for o in root().occurrences:
        if o.name.startswith(prefix):
            return o
    return None


def comp_occ(cn):
    for o in root().occurrences:
        if o.component.name == cn:
            return o
    return None


def cut_bodies(comp, target, tools, join=False):
    coll = adsk.core.ObjectCollection.create()
    for t in tools:
        coll.add(comp.bRepBodies.add(t))
    ci = comp.features.combineFeatures.createInput(target, coll)
    ci.operation = adsk.fusion.FeatureOperations.JoinFeatureOperation if join else adsk.fusion.FeatureOperations.CutFeatureOperation
    ci.isKeepToolBodies = False
    return comp.features.combineFeatures.add(ci)


def bbm(b):
    a, z = b.boundingBox.minPoint.asArray(), b.boundingBox.maxPoint.asArray()
    return 'x %.4f..%.4f y %.4f..%.4f z %.4f..%.4f' % (a[1] / 100, z[1] / 100, a[2] / 100, z[2] / 100, a[0] / 100, z[0] / 100)


def r_out(s):
    """Fusion cm radius of the tail cone at s cm aft of the joint plane: r = 0.030 + 0.050 (1 - u^2 (3 - 2u)), u = s / 0.450 m"""
    u = s / CONE_L
    return 3.0 + 5.0 * (1.0 - u * u * (3.0 - 2.0 * u))


WALL = 0.05          # cm, 0.5 mm printed wall (EST)
R_END_IN = 2.94      # cm, inner dia 58.8 mm at the aft end (geometry.json)


def r_in(s):
    return R_END_IN if s >= CONE_L - 1e-9 else r_out(s) - WALL


# ================================================================ STEP 1: move the pod group and the pusher set
def step_move():
    guard()
    r = root()
    st = {'rg': {g.name: [o.name for o in g.occurrences] for g in r.rigidGroups}}
    st['joints_before'] = [(j.name, j.jointMotion.jointType) for j in r.joints]
    save_state(st)
    for g in list(r.rigidGroups):
        if g.name.startswith(('RG Pod', 'RG Canopy')):
            g.deleteMe()
    for j in list(r.joints):
        if j.name in ('Rev Pusher_Prop motor axis', 'Slide Canopy lift-off', 'Slide Battery tray'):
            j.deleteMe()
    pod = occ_named('Fuselage_Pod')
    pod.isGrounded = False
    moved = []
    for o in r.occurrences:
        dy = DX if is_fwd(o) else (DXT if is_tail(o) else 0.0)
        if dy == 0.0:
            continue
        try:
            o.isGrounded = False
        except Exception:
            pass
        m = o.transform2
        t = m.translation
        t.y = t.y + dy
        m.translation = t
        o.transform2 = m
        moved.append((o.name[:34], dy))
    print('moved', len(moved))
    for x in moved:
        print('  ', x)
    print('pod', bbm(pod.bRepBodies.item(0)))
    print('rg', r.rigidGroups.count, 'joints', r.joints.count)


# ================================================================ STEP 0 (rev 2): remove the rev 1 tail module before rebuilding
def step_teardown():
    guard()
    r = root()
    for g in list(r.rigidGroups):
        if g.name.startswith(('RG Pod', 'RG Tail module')):
            g.deleteMe()
    for j in list(r.joints):
        if j.name in ('Slide Tail_Cone module', 'Rev Pusher_Prop motor axis'):
            j.deleteMe()
    gone = []
    for o in list(r.occurrences):
        cn = o.component.name
        if cn in ('Tail_Cone', 'Tail_Joint_Spigot', 'Tail_Joint_Sleeve', 'Tail connectors') or cn.startswith('J-A2-01'):
            gone.append(cn[:30])
            o.deleteMe()
    print('removed', gone, 'occ', r.occurrences.count, 'rg', r.rigidGroups.count, 'joints', r.joints.count)


# ================================================================ STEP 2: Fuselage_Pod -> forebody = C0 nose + cylinder to s = 0.50 m + the first 0.2267 m of the spec cone, to the joint plane
def step_pod():
    guard()
    occ = occ_named('Fuselage_Pod')
    c = occ.component
    old = c.bRepBodies.item(0)
    ap = old.appearance
    for k_ in list(c.sketches):
        k_.deleteMe()
    sk = c.sketches.add(c.xYConstructionPlane)
    sk.name = 'forebody profile'

    def S(rr, s):
        return sk.modelToSketchSpace(P3.create(rr, -s, 0.0))
    R, a = 8.0, 22.0
    co = adsk.core.ObjectCollection.create()
    for i in range(0, 15):
        th = (math.pi / 2.0) * i / 14.0
        s = a * (1.0 - math.cos(th))
        co.add(S(R * math.sin(th), s))        # elliptic nose a = 0.22 m, R = 0.08 m
    nose = sk.sketchCurves.sketchFittedSplines.add(co)
    ln = sk.sketchCurves.sketchLines
    cc = adsk.core.ObjectCollection.create()
    cc.add(S(R, 50.0))
    for i in range(1, 11):
        s = S0 * i / 10.0
        cc.add(S(r_out(s), 50.0 + s))
    tail = sk.sketchCurves.sketchFittedSplines.add(cc)
    ln.addByTwoPoints(nose.endSketchPoint, tail.startSketchPoint)
    endl = ln.addByTwoPoints(tail.endSketchPoint, S(0.0, 50.0 + S0))
    ax = ln.addByTwoPoints(endl.endSketchPoint, nose.startSketchPoint)
    prof = sk.profiles.item(0)
    ri = c.features.revolveFeatures.createInput(prof, ax, adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
    ri.setAngleExtent(False, VI.createByReal(2 * math.pi))
    f = c.features.revolveFeatures.add(ri)
    nb = f.bodies.item(0)
    old.deleteMe()
    nb.name = 'Fuselage_Pod'
    nb.appearance = ap
    # 8 mm seat for the spigot body (OD 100) at the joint plane (component-local frame: nose at y = 0)
    yl = -(50.0 + S0)
    cut_bodies(c, nb, [tbm.createCylinderOrCone(P3.create(0, yl - 0.1, 0), RB_O, P3.create(0, yl + 0.8, 0), RB_O)])
    b = c.bRepBodies.item(0)
    print('forebody vol', round(b.volume, 1), 'bodies', c.bRepBodies.count, 'local bbox y', round(b.boundingBox.minPoint.y, 2), round(b.boundingBox.maxPoint.y, 2),
          'r_end', round(r_out(S0), 3))


# ================================================================ STEP 3: Tail_Cone (3 printed PETG segments, hollow 0.5 mm wall), by revolve
def seg_revolve(c, name, s0, s1, col):
    pi = c.constructionPlanes.createInput()
    pi.setByOffset(c.xYConstructionPlane, VI.createByReal(AXZ))
    pl = c.constructionPlanes.add(pi)
    sk = c.sketches.add(pl)
    sk.name = 'profile ' + name

    def S(rr, s):
        return sk.modelToSketchSpace(P3.create(rr, YC - s, AXZ))
    n = 10
    ss = [s0 + (s1 - s0) * i / float(n) for i in range(n + 1)]
    co = adsk.core.ObjectCollection.create()
    for s in ss:
        co.add(S(r_out(s), s))
    outer = sk.sketchCurves.sketchFittedSplines.add(co)
    ci = adsk.core.ObjectCollection.create()
    for s in reversed(ss):
        ci.add(S(r_in(s), s))
    inner = sk.sketchCurves.sketchFittedSplines.add(ci)
    ln = sk.sketchCurves.sketchLines
    ln.addByTwoPoints(outer.endSketchPoint, inner.startSketchPoint)
    ln.addByTwoPoints(inner.endSketchPoint, outer.startSketchPoint)
    ax = ln.addByTwoPoints(S(0.0, s0 - 1.0), S(0.0, s1 + 1.0))
    ax.isConstruction = True
    prof = None
    for p in sk.profiles:
        prof = p if prof is None or p.areaProperties().area < prof.areaProperties().area else prof
    ri = c.features.revolveFeatures.createInput(prof, ax, adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
    ri.setAngleExtent(False, VI.createByReal(2 * math.pi))
    f = c.features.revolveFeatures.add(ri)
    b = f.bodies.item(0)
    b.name = name
    paint(b, col)
    return b


def step_cone():
    guard()
    occ, c = new_comp('Tail_Cone')
    c.description = 'a2 rev 2 printed PETG tail module cone, 0.2233 m (spec cone 0.2267..0.45 m), 3 segments split at 0.34 / 0.395 m of the spec cone, wall 0.5 mm EST'
    for i in range(3):
        b = seg_revolve(c, 'Tail_Cone_seg%d' % (i + 1), SPL[i], SPL[i + 1], WHITE)
        print(b.name, bbm(b), 'vol cm3', round(b.volume, 2))
    print('total cm3', round(sum(b.volume for b in c.bRepBodies), 2))


# ================================================================ STEP 4: radial holes, ESC ribs, ESC vent, lap rings
def step_cone_details():
    guard()
    c = comp_occ('Tail_Cone').component
    seg = {b.name: b for b in c.bRepBodies}
    s1 = seg['Tail_Cone_seg1']
    yh = YJ - 1.1
    t2 = [tbm.createCylinderOrCone(P3.create(4.5, yh, AXZ), 0.18, P3.create(6.6, yh, AXZ), 0.18),
          tbm.createCylinderOrCone(P3.create(-4.5, yh, AXZ), 0.18, P3.create(-6.6, yh, AXZ), 0.18),
          tbm.createCylinderOrCone(P3.create(0, yh, AXZ - 4.5), 0.18, P3.create(0, yh, AXZ - 6.6), 0.18)]
    cut_bodies(c, s1, t2)
    sv = YC - (-32.33)
    rv = r_out(sv)
    cut_bodies(c, s1, [box(0, -32.33, AXZ - rv, 0.8, 1.5, 1.2)])
    print('holes + vent cut; s_vent', round(sv, 2), 'r', round(rv, 3))
    for xm in (-0.3008, -0.3458):
        y = xm * 100.0
        s = YC - y
        rr = r_in(s) + 0.03
        rib = tbm.createCylinderOrCone(P3.create(0, y - 0.1, AXZ), rr, P3.create(0, y + 0.1, AXZ), rr)
        D(rib, box(0, y, AXZ, 2.6, 0.5, 0.9))
        D(rib, box(0, y, AXZ + 6.0, 12.0, 0.5, 10.0))       # half-ring: lower part + bridge above the slot (z < axis + 10 mm)
        for sx in (1, -1):
            D(rib, box(sx * 1.2, y, AXZ + 0.7, 0.3, 0.5, 0.15))
        cut_bodies(c, s1, [rib], join=True)
        print('rib at', xm, 's', round(s, 2), 'r', round(rr, 3))
    for i, sp in enumerate((SPL[1], SPL[2])):
        ya, yb = YC - (sp - 1.0), YC - (sp + 1.0)
        ra, rb = r_in(sp - 1.0) - 0.02, r_in(sp + 1.0) - 0.02
        t = tbm.createCylinderOrCone(P3.create(0, ya, AXZ), ra, P3.create(0, yb, AXZ), rb)
        D(t, tbm.createCylinderOrCone(P3.create(0, ya + 0.1, AXZ), ra - 0.1, P3.create(0, yb - 0.1, AXZ), rb - 0.1))
        new_body(c, t, 'Tail_Lap_Ring_%d' % (i + 1), WHITE)
    for b in c.bRepBodies:
        print(' ', b.name, round(b.volume, 3), bbm(b))


# ================================================================ STEP 5: Tail_Joint_Spigot and Tail_Joint_Sleeve (printed PETG rings)
def step_joint_parts():
    guard()
    yh = YJ - 1.1
    # spigot: body OD 100 / ID 74 x 8 mm forward of the joint plane (seated in the forebody), tongue OD 91.8 / ID 74 x 22 mm aft of it
    occ, c = new_comp('Tail_Joint_Spigot')
    body = tube(P3.create(0, YJ + 0.8, AXZ), AX_NY, RB_O, RT_I, 0.8)
    tongue = tube(P3.create(0, YJ, AXZ), AX_NY, RT_O, RT_I, 2.2)
    U(body, tongue)
    for p0, a in ((P3.create(RT_O, yh, AXZ), AX_NX), (P3.create(-RT_O, yh, AXZ), AX_X), (P3.create(0, yh, AXZ - RT_O), AX_Z_)):
        p_out = add(p0, a, -0.1)
        D(body, tbm.createCylinderOrCone(p_out, 0.21, add(p0, a, 0.75), 0.21))
        D(body, tbm.createCylinderOrCone(p_out, 0.26, add(p0, a, 0.0), 0.21))
    b = new_body(c, body, 'Tail_Joint_Spigot', DARK)
    print(b.name, bbm(b), round(b.volume, 3))
    # sleeve: 22 mm, ID 92.6 (0.4 mm radial slip fit on the tongue), outer frustum bonded inside the cone forward end, 3 radial 3.6 mm holes
    occ2, c2 = new_comp('Tail_Joint_Sleeve')
    ro0, ro1 = r_in(S0) - 0.02, r_in(S0 + 2.2) - 0.02
    sl = tbm.createCylinderOrCone(P3.create(0, YJ, AXZ), ro0, P3.create(0, YJ - 2.2, AXZ), ro1)
    D(sl, cyl(P3.create(0, YJ + 0.1, AXZ), AX_NY, RSL_I, 2.4))
    p = P3.create(0, yh, AXZ)
    for a in (AX_X, AX_NX, AX_NZ):
        D(sl, tbm.createCylinderOrCone(add(p, a, 4.4), 0.18, add(p, a, 6.2), 0.18))
    b2 = new_body(c2, sl, 'Tail_Joint_Sleeve', DARK)
    print(b2.name, bbm(b2), round(b2.volume, 3), 'ro', round(ro0, 3), round(ro1, 3))


# ================================================================ STEP 6: J-A2-01 hardware (3 x M3x20 ISO 7380 + ISO 7089 washer + brass insert)
def screw(c, a, d, L, hd, hh, s):
    """c = head underside, a = axis along the shank; ISO 7380 button head, hex socket as a round pocket (same as the C0 / a3 hardware)."""
    sh = cyl(c, a, d / 2, L)
    hdb = tbm.createCylinderOrCone(c, hd / 2, add(c, a, -hh), hd * 0.36)
    U(sh, hdb)
    D(sh, cyl(c, a, s * 0.058, hh * 0.6 + 0.01, -hh - 0.01))
    return sh


def step_hw():
    guard()
    yh = YJ - 1.1
    occ, c = new_comp('J-A2-01 Tail cone module - pod forebody spigot sleeve screws and washers')
    occ2, c2 = new_comp('J-A2-01 Tail joint heat-set inserts in spigot')
    rw = round(r_out(S0 + 1.1), 3)      # washer seats on the cone outer surface at the screw station
    rh = rw + 0.05                      # head underside on the washer
    ri_ = RT_O
    sites = [('bottom', P3.create(0, yh, AXZ - rh), P3.create(0, yh, AXZ - rw), P3.create(0, yh, AXZ - ri_), AX_Z_, AX_NZ),
             ('+Z', P3.create(rh, yh, AXZ), P3.create(rw, yh, AXZ), P3.create(ri_, yh, AXZ), AX_NX, AX_X),
             ('-Z', P3.create(-rh, yh, AXZ), P3.create(-rw, yh, AXZ), P3.create(-ri_, yh, AXZ), AX_X, AX_NX)]
    for i, (nm, ph, pw, pi_, a_in, a_out) in enumerate(sites):
        k = i + 1
        new_body(c, screw(ph, a_in, 0.3, 1.6, 0.57, 0.165, 2.0), 'HW-A2-01_%d ISO 7380-1 M3x16 A2 (%s)' % (k, nm), STEEL, True)
        new_body(c, tube(pw, a_out, 0.35, 0.16, 0.05), 'HW-A2-02_%d ISO 7089 M3 A2 (%s)' % (k, nm), STEEL, True)
        new_body(c2, tube(pi_, a_in, 0.23, 0.12, 0.57), 'HW-A2-03_%d Ruthex-type M3x5.7 brass heat-set insert (%s)' % (k, nm), BRASS, True)
    for cc in (c, c2):
        for b in cc.bRepBodies:
            print(' ', b.name[:52], bbm(b))


# ================================================================ STEP 7: W15x phase extension, tail connectors, firewall wire pass-throughs
def step_wires():
    guard()
    if comp_occ('W15x phase extension') is None:
        _wires_w15x()
    _connectors()


def _wires_w15x():
    occ, c = new_comp('W15x phase extension')
    x0, x1 = -0.3458, -0.4833
    for i, zl in enumerate((-0.6, 0.0, 0.6)):
        p0, p1 = P3.create(zl, x0 * 100, AXZ), P3.create(zl, x1 * 100, AXZ)
        new_body(c, tbm.createCylinderOrCone(p0, 0.15, p1, 0.15), 'W15x_lead_%d 14 AWG silicone' % (i + 1), [0.1, 0.1, 0.1])
        new_body(c, tbm.createCylinderOrCone(P3.create(zl, x0 * 100 - 0.2, AXZ), 0.2, P3.create(zl, x0 * 100 - 2.7, AXZ), 0.2),
                 'W15x_heatshrink_%d' % (i + 1), [0.55, 0.1, 0.1])


def _connectors():
    c = comp_occ('W15x phase extension').component
    # firewall (HW-034) and bulkhead ring (HW-035): the C0 parts already have a central opening that the three leads pass through (a 3 x d4 cut was a no-op)
    # connectors in the spigot bore (r < 37 mm), aft of the joint plane: 2 x XT60H pair (W08), 1 x JR pair (W25)
    occ3, c3 = new_comp('Tail connectors')
    cx = YJ - 1.7
    for i, zl in enumerate((-1.3, 1.3)):
        new_body(c3, box(zl, cx, AXZ - 2.2, 0.8, 3.0, 1.6), 'CN_W08_XT60H_pair_%d' % (i + 1), [0.9, 0.7, 0.1])
    new_body(c3, box(0, cx, AXZ - 0.6, 0.8, 2.5, 0.3), 'CN_W25_JR_pair', [0.9, 0.7, 0.1])
    for cc in (c, c3):
        for b in cc.bRepBodies:
            print(' ', b.name, bbm(b))


# ================================================================ STEP 8: rigid groups (pod group, tail module, canopy)
TAIL_MEMBERS = ('Tail_Cone', 'Tail_Joint_Sleeve', 'J-A2-01 Tail cone module', 'W15x phase extension', 'Tail connectors', 'ESC_P', 'CAP_P', 'J-11 ',
                'J-29 ESC mounting lift ESCs on boom outboard faces [C]')


def step_groups():
    guard()
    r = root()
    st = load_state()
    before = st['rg']
    byname = {o.name: o for o in r.occurrences}
    snap = {o.name: o.boundingBox.minPoint.asArray() for o in r.occurrences}
    podg = [k for k in before if k.startswith('RG Pod')][0]
    cang = [k for k in before if k.startswith('RG Canopy')][0]
    tail_names = set()
    for o in r.occurrences:
        if o.name.startswith(TAIL_MEMBERS):
            tail_names.add(o.name)
    pod_list = [n for n in before[podg] if n in byname and n not in tail_names]
    pod_list += [o.name for o in r.occurrences if o.component.name in ('Tail_Joint_Spigot', 'J-A2-01 Tail joint heat-set inserts in spigot')]
    specs = [(podg + ' (forebody, spigot)', pod_list), ('RG Tail module (cone, sleeve, ESC, firewall, W15x, screws)', sorted(tail_names)),
             (cang, [n for n in before[cang] if n in byname])]
    for gname, lst in specs:
        if any(g_.name == gname for g_ in r.rigidGroups):
            continue            # (rev 2 re-run: the canopy group is untouched)
        coll = adsk.core.ObjectCollection.create()
        for n in lst:
            coll.add(byname[n])
        rg = r.rigidGroups.add(coll, False)
        rg.name = gname
        print(gname[:40], rg.occurrences.count, 'of', len(lst))
    pod = occ_named('Fuselage_Pod')
    pod.isGrounded = True
    worst = 0.0
    for o in r.occurrences:
        if o.name in snap:
            a = o.boundingBox.minPoint.asArray()
            worst = max(worst, max(abs(a[i] - snap[o.name][i]) for i in range(3)))
    print('max shift cm', round(worst, 6), 'groups', r.rigidGroups.count)


# ================================================================ STEP 9: joints (pusher prop on the cone module, canopy, battery, tail-cone slider)
def world_point_proxy(occ, w):
    comp = occ.component
    inp_w = list(w)
    for _ in range(3):
        inp = comp.constructionPoints.createInput()
        inp.setByPoint(P3.create(*inp_w))
        npnt = comp.constructionPoints.add(inp)
        px = npnt.createForAssemblyContext(occ)
        g = px.geometry.asArray()
        d = [w[i] - g[i] for i in range(3)]
        if max(abs(v) for v in d) < 1e-6:
            return px
        npnt.deleteMe()
        inp_w = [inp_w[i] + d[i] for i in range(3)]
    raise Exception('point placement failed for ' + occ.name)


JAX = {'X': adsk.fusion.JointDirections.XAxisJointDirection, 'Y': adsk.fusion.JointDirections.YAxisJointDirection,
       'Z': adsk.fusion.JointDirections.ZAxisJointDirection}


def mk_joint(name, a, b, pt, axis, kind, lo=None, hi=None):
    r = root()
    g1 = adsk.fusion.JointGeometry.createByPoint(world_point_proxy(a, pt))
    g2 = adsk.fusion.JointGeometry.createByPoint(world_point_proxy(b, pt))
    ji = r.joints.createInput(g1, g2)
    if kind == 'rev':
        ji.setAsRevoluteJointMotion(JAX[axis])
    else:
        ji.setAsSliderJointMotion(JAX[axis])
    j = r.joints.add(ji)
    j.name = name
    if kind == 'slide':
        L = j.jointMotion.slideLimits
        L.isMinimumValueEnabled = True
        L.minimumValue = lo
        L.isMaximumValueEnabled = True
        L.maximumValue = hi
        L.isRestValueEnabled = True
        L.restValue = 0.0
    return j


def step_joints(which='all'):
    guard()
    r = root()
    pod = occ_named('Fuselage_Pod')
    cone_o = comp_occ('Tail_Cone')
    if which in ('all', 'prop'):
        j = mk_joint('Rev Pusher_Prop motor axis', occ_named('Pusher_Prop_Set'), cone_o, [0.0, -42.3 + DXT, AXZ], 'Y', 'rev')
        print(j.name, [round(v, 3) for v in j.jointMotion.rotationAxisVector.asArray()])
    if which in ('all', 'canopy'):
        j = mk_joint('Slide Canopy lift-off', occ_named('Canopy'), pod, [0.0, 20.5 + DX, 4.6], 'Z', 'slide', 0.0, 10.0)
        print(j.name, [round(v, 3) for v in j.jointMotion.slideDirectionVector.asArray()])
    if which in ('all', 'battery'):
        j = mk_joint('Slide Battery tray', occ_named('Battery_6S_LiPo'), pod, [0.0, 6.1 + DX, -5.0], 'Y', 'slide', -0.4, 0.7)
        print(j.name, [round(v, 3) for v in j.jointMotion.slideDirectionVector.asArray()])
    if which in ('all', 'tail'):
        j = mk_joint('Slide Tail_Cone module', cone_o, pod, [0.0, YJ, AXZ], 'Y', 'slide', -30.0, 0.0)
        print(j.name, [round(v, 3) for v in j.jointMotion.slideDirectionVector.asArray()])
    print('joints', r.joints.count, 'groups', r.rigidGroups.count)


# ================================================================ STEP 10: interference (new / changed vs neighbours) and prop sweep
NEWC = ('Tail_Cone', 'Tail_Joint', 'J-A2', 'W15x', 'Tail connectors')
CHGC = ('Fuselage_Pod', 'Pusher_Prop_Set', 'J-11 ', 'ESC_P', 'CAP_P')


def cname(b):
    ctx = b.assemblyContext
    return ctx.component.name if ctx is not None else b.parentComponent.name


def boxed_bodies(lo_m, hi_m):
    r = root()
    flo = [lo_m[2] * 100, lo_m[0] * 100, lo_m[1] * 100]
    fhi = [hi_m[2] * 100, hi_m[0] * 100, hi_m[1] * 100]
    out = []
    for o in r.allOccurrences:
        for b in o.bRepBodies:
            bb = b.boundingBox
            a, z = bb.minPoint.asArray(), bb.maxPoint.asArray()
            if all(z[i] >= flo[i] and a[i] <= fhi[i] for i in range(3)):
                out.append(b)
    return out


def step_check(lo=(-0.60, -0.14, -0.13), hi=(-0.02, 0.06, 0.13), vmin=1e-4, only_new=True, maxrows=60):
    guard()
    des = design()
    bodies = boxed_bodies(lo, hi)
    col = adsk.core.ObjectCollection.create()
    for b in bodies:
        col.add(b)
    res = des.analyzeInterference(des.createInterferenceInput(col))
    agg = {}
    for x in res:
        v = x.interferenceBody.volume
        if v < vmin:
            continue
        a, b = x.entityOne, x.entityTwo
        ca, cb = cname(a), cname(b)
        new = ca.startswith(NEWC + CHGC) or cb.startswith(NEWC + CHGC)
        if only_new and not new:
            continue
        key = (ca[:30] + '|' + a.name[:26], cb[:30] + '|' + b.name[:26])
        agg[key] = agg.get(key, 0.0) + v
    rows = sorted(agg.items(), key=lambda t: -t[1])
    print('bodies', len(bodies), 'interfering pairs', len(rows))
    for k, v in rows[:maxrows]:
        print('  %.4f' % v, k[0], '<>', k[1])


def step_sweep(step=30, vmin=2e-4):
    """pusher prop revolute joint through 360 deg: rotating set vs everything static (box around the aft end)"""
    guard()
    r = root()
    des = design()
    j = [x for x in r.joints if x.name == 'Rev Pusher_Prop motor axis'][0]
    m = j.jointMotion
    a0 = m.rotationValue
    worst = {}
    for deg in range(0, 360, step):
        m.rotationValue = math.radians(deg)
        bodies = boxed_bodies((-0.70, -0.25, -0.50), (-0.30, 0.20, 0.50))
        col = adsk.core.ObjectCollection.create()
        for b in bodies:
            col.add(b)
        res = des.analyzeInterference(des.createInterferenceInput(col))
        for x in res:
            v = x.interferenceBody.volume
            if v < vmin:
                continue
            a, b = x.entityOne, x.entityTwo
            ra = cname(a).startswith('Pusher_Prop_Set')
            rb = cname(b).startswith('Pusher_Prop_Set')
            if ra == rb:
                continue
            key = (cname(a)[:30] + '|' + a.name[:24], cname(b)[:30] + '|' + b.name[:24])
            worst[key] = max(worst.get(key, (0, 0)), (round(v, 5), deg))
    m.rotationValue = a0
    print('sweep', step, 'deg steps; rotating-vs-static overlaps', len(worst))
    for kk, vv_ in sorted(worst.items(), key=lambda t: -t[1][0])[:25]:
        print('  ', kk, vv_)


def step_slide_test(vals=(0.0, -10.0, -22.0, -30.0)):
    guard()
    r = root()
    j = [x for x in r.joints if x.name == 'Slide Tail_Cone module'][0]
    m = j.jointMotion
    cone_o = comp_occ('Tail_Cone')
    for v in vals:
        m.slideValue = v
        print('slide', v, 'cone', bbm(cone_o.bRepBodies.item(0)), 'prop set', bbm(occ_named('Pusher_Prop_Set').bRepBodies.item(0)))
    m.slideValue = 0.0


# ================================================================ STEP 11: export
Q = adsk.fusion.TriangleMeshQualityOptions


def write_stl(path, bodies, q):
    chunks = []
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for b in bodies:
        mc = b.meshManager.createMeshCalculator()
        mc.setQuality(q)
        m = mc.calculate()
        xs = m.nodeCoordinatesAsDouble
        idx = m.nodeIndices
        for i in range(0, len(xs), 3):
            for kk in range(3):
                v = xs[i + kk]
                mn[kk] = min(mn[kk], v)
                mx[kk] = max(mx[kk], v)
        chunks.append((xs, idx))
    n = sum(len(i) // 3 for _, i in chunks)
    out = bytearray(b'DBF-VTOL Fusion world cm Z-up'.ljust(80, b' '))
    out += struct.pack('<I', n)
    pk = struct.Struct('<12fH')
    for xs, idx in chunks:
        for t in range(0, len(idx), 3):
            a, b_, c = idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3
            ax, ay, az = xs[a], xs[a + 1], xs[a + 2]
            bx, by, bz = xs[b_], xs[b_ + 1], xs[b_ + 2]
            cx, cy, cz = xs[c], xs[c + 1], xs[c + 2]
            ux, uy, uz = bx - ax, by - ay, bz - az
            vx, vy, vz = cx - ax, cy - ay, cz - az
            nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
            l = (nx * nx + ny * ny + nz * nz) ** 0.5 or 1.0
            out += pk.pack(nx / l, ny / l, nz / l, ax, ay, az, bx, by, bz, cx, cy, cz, 0)
    open(path, 'wb').write(bytes(out))
    return n, [round(v, 3) for v in mn], [round(v, 3) for v in mx]


def export_units():
    """(name, group, bodies, colour, extra) for every new or changed occurrence"""
    r = root()
    U_ = []
    newcol = {'Tail_Cone': ('printed', WHITE, 'slide_tail_cone'), 'Tail_Joint_Spigot': ('printed', DARK, None), 'Tail_Joint_Sleeve': ('printed', DARK, 'slide_tail_cone'),
              'W15x phase extension': ('electronics', [0.1, 0.1, 0.1], 'slide_tail_cone'), 'Tail connectors': ('electronics', [0.9, 0.7, 0.1], 'slide_tail_cone')}
    for o in r.occurrences:
        cn = o.component.name
        bl = list(o.bRepBodies)
        if cn in C0MAP:
            e = C0MAP[cn]
            ex = {}
            if 'moving' in e:
                ex['moving'] = e['moving']
            if 'rides' in e:
                ex['rides'] = e['rides']
            if 'joint' in e:
                ex['joint'] = e['joint']
            if cn.startswith(('Pusher_Prop_Set', 'J-11 ', 'ESC_P', 'CAP_P', 'J-29')):
                ex['rides'] = 'slide_tail_cone'
            ex['changed'] = 'moved +16.7 mm fwd with the pod' if not cn.startswith(('Pusher_Prop_Set', 'J-11 ')) else 'moved aft 83.3 mm (pod slide 16.7 mm fwd - 100 mm tail stretch)'
            if cn == 'Fuselage_Pod':
                ex['changed'] = 'rev 2: rebuilt as the forebody to the joint plane x=-0.26 m (C0 nose + cylinder + first 0.2267 m of the spec cone), 8 mm spigot seat, slid 16.7 mm fwd'
            if cn.startswith('J-11 '):
                ex['changed'] += ''
            U_.append((cn, e['group'], bl, e['color'], ex))
        elif cn in newcol:
            g, col, rides = newcol[cn]
            ex = {'rides': rides} if rides else {}
            ex['new'] = True
            U_.append((cn, g, bl, col, ex))
        elif cn.startswith('J-A2-01 Tail cone module'):
            U_.append(('J-A2-01_Tail_cone_screws_washers', 'hardware', bl, STEEL, {'joint': 'J-A2-01', 'rides': 'slide_tail_cone', 'new': True}))
        elif cn.startswith('J-A2-01 Tail joint heat-set'):
            U_.append(('J-A2-01_Tail_joint_inserts', 'hardware', bl, BRASS, {'joint': 'J-A2-01', 'new': True}))
    return U_


def step_export():
    guard()
    os.makedirs(BASE + 'stl', exist_ok=True)
    os.makedirs(BASE + 'kinematics', exist_ok=True)
    ents = []
    bad = []
    hide = []
    for nm, g, bl, col, ex in export_units():
        if not bl:
            continue
        if nm in C0MAP:
            hide.append(nm)
        sub = 'kinematics' if ex.get('moving') else 'stl'
        fn = re.sub(r'[^A-Za-z0-9_\-]', '_', nm)[:60]
        path = '%s/%s.stl' % (sub, fn)
        q = Q.LowQualityTriangleMesh if g in ('hardware', 'electronics') else Q.NormalQualityTriangleMesh
        n, mn, mx = write_stl(BASE + path, bl, q)
        lo = [1e9] * 3
        hi = [-1e9] * 3
        for b in bl:
            bb = b.boundingBox
            for i in range(3):
                lo[i] = min(lo[i], bb.minPoint.asArray()[i])
                hi[i] = max(hi[i], bb.maxPoint.asArray()[i])
        err = max(max(abs(mn[i] - lo[i]), abs(mx[i] - hi[i])) for i in range(3))
        if err > 0.02:
            bad.append((nm, round(err, 3)))
        sz = os.path.getsize(BASE + path)
        if sz != 84 + 50 * n:
            bad.append((nm, 'size', sz, 84 + 50 * n))
        e = {'file': path, 'name': nm, 'group': g, 'color': [round(c, 3) for c in col], 'count': len(bl), 'bbox_cm': [mn, mx], 'size': sz, 'triangles': n}
        e.update(ex)
        ents.append(e)
    moving = [
        {'id': 'slide_tail_cone', 'kind': 'slider', 'new': True, 'parent': 'Fuselage_Pod', 'pivot_m': [-0.26, -0.03, 0.0], 'axis_m': [-1, 0, 0], 'limits': [0.0, 0.3], 'unit': 'm',
         'note': 'cone module (Tail_Cone, sleeve, pusher set, ESC_P, CAP_P, J-11, screws, W15x, connectors) slides aft 22 mm off the spigot, then lifts away'},
        {'id': 'prop_P', 'kind': 'revolute', 'parent': 'Tail_Cone', 'pivot_m': [-0.5213, -0.03, 0.0], 'axis_m': [1, 0, 0], 'limits': None, 'note': 'C0 joint, new position (now on the cone module)'},
        {'id': 'slide_canopy', 'kind': 'slider', 'parent': 'Fuselage_Pod', 'pivot_m': [0.2217, 0.046, 0.0], 'axis_m': [0, 1, 0], 'limits': [0, 0.1], 'unit': 'm', 'note': 'C0 joint shifted +16.7 mm with the pod'},
        {'id': 'slide_battery', 'kind': 'slider', 'parent': 'Fuselage_Pod', 'pivot_m': [0.0777, -0.05, 0.0], 'axis_m': [1, 0, 0], 'limits': [-0.004, 0.007], 'unit': 'm', 'note': 'C0 joint shifted +16.7 mm with the pod'}]
    man = {'id': 'a2', 'doc': DOC,
           'axis_note': 'STL coordinates are Fusion world cm, Z-up (world-transformed, written from the B-rep mesh calculator; no further transform needed). Model X fwd = Fusion +Y, model Y up = Fusion +Z, model Z right = Fusion +X. i.e. model (x,y,z) m -> Fusion (z,x,y)*100 cm.',
           'units': 'cm', 'hide': hide, 'entries': ents, 'moving': moving}
    json.dump(man, open(BASE + 'variant_manifest.json', 'w'), indent=1)
    print(len(ents), 'entries', sum(e['size'] for e in ents), 'bytes', sum(e['count'] for e in ents), 'bodies; bad', bad)
    print('hide', hide)


def step_cad_files():
    guard()
    em = design().exportManager
    em.execute(em.createSTEPExportOptions(BASE + 'a2.step'))
    em.execute(em.createFusionArchiveExportOptions(BASE + 'a2.f3d'))
    print('step', os.path.getsize(BASE + 'a2.step'), 'f3d', os.path.getsize(BASE + 'a2.f3d'))


# ================================================================ STEP 12: renders (construction points / joint origins hidden)
def hide_points():
    d = design()
    for c in d.allComponents:
        for p in c.constructionPoints:
            p.isLightBulbOn = False
        for pl in c.constructionPlanes:
            pl.isLightBulbOn = False
        for s in c.sketches:
            s.isLightBulbOn = False
    r = root()
    for a in ('isJointOriginsFolderLightBulbOn', 'isJointsFolderLightBulbOn', 'isOriginFolderLightBulbOn', 'isConstructionFolderLightBulbOn', 'isSketchFolderLightBulbOn'):
        try:
            setattr(r, a, False)
        except Exception:
            pass


VIEWS = {'view_iso': ((210, -230, 160), (0, -25, 0), (0, 0, 1)),
         'view_side': ((330, -25, 12), (0, -25, 12), (0, 0, 1)),
         'view_top': ((0, -25, 330), (0, -25, 0), (0, 1, 0)),
         'detail_tail_cone': ((34.0, -84.0, 36.0), (0.0, -38.0, -4.0), (0, 0, 1))}


def step_render(name, w=1600, h=1000):
    guard()
    hide_points()
    eye, tgt, up = VIEWS[name]
    eye, tgt, up = VIEWS[name]
    vp = app.activeViewport
    c = vp.camera
    c.cameraType = adsk.core.CameraTypes.PerspectiveCameraType
    vp.camera = c
    vp.fit()                        # resets a stale camera (extents / eye) left by an earlier view or a re-opened document
    adsk.doEvents()
    c = vp.camera
    ortho = name in ('view_side', 'view_top')
    c.cameraType = adsk.core.CameraTypes.OrthographicCameraType if ortho else adsk.core.CameraTypes.PerspectiveCameraType
    if not ortho:
        c.perspectiveAngle = 0.6
    c.eye = P3.create(*eye)
    c.target = P3.create(*tgt)
    c.upVector = V3.create(*up)
    c.isSmoothTransition = False
    vp.camera = c
    if ortho:
        vp.fit()
        adsk.doEvents()
        c = vp.camera
        c.viewExtents = c.viewExtents * 1.08
        c.isSmoothTransition = False
        vp.camera = c
    for _ in range(3):
        adsk.doEvents()
        vp.refresh()
    o = adsk.core.SaveImageFileOptions.create(BASE + name + '.png')
    o.width = w
    o.height = h
    o.isBackgroundTransparent = False
    o.isAntiAliased = True
    vp.saveAsImageFileWithOptions(o)
    print(name, os.path.getsize(BASE + name + '.png'))


def run(context):
    try:
        print('a2 build module loaded; call step_* functions')
    except Exception:
        print(traceback.format_exc())
