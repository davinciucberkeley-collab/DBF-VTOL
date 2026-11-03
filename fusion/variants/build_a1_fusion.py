"""Variant a1 (Wingtip cruise propellers) built in Autodesk Fusion on a copy of "VTOL C0 full".

Document: "VTOL A1 wingtip props" (saveAs copy of C0, never edit C0).  Spec: concepts/variants/a1/{design,geometry,inventory,metrics}.
Axis mapping: model (x fwd, y up, z right) m -> Fusion (z, x, y) * 100 cm.  Direct-modelling design: temp B-reps are added straight to components.
Run each step from a short script:   exec(open(PATH).read()); step_xxx(...)    (PATH = this file on the Windows PC)
Order: step_remove, step_wings, step_battery, step_tubes, step_mount(sg), step_shell(sg), step_props(sg), step_esc(sg), step_hw(sg),
       step_wires(sg), step_groups, step_joints, checks, step_export, step_cad_files, step_render.
"""
import adsk.core, adsk.fusion, traceback, math, re, os, json, struct

app = adsk.core.Application.get()
P3 = adsk.core.Point3D
V3 = adsk.core.Vector3D
M3 = adsk.core.Matrix3D
VI = adsk.core.ValueInput
tbm = adsk.fusion.TemporaryBRepManager.get()
BT = adsk.fusion.BooleanTypes
DOC = 'VTOL A1 wingtip props'
BASE = 'C:/Users/trist/Documents/DBF-Fusion-Export/variants/a1/'
STATE = BASE + 'state.json'

# geometry constants (model metres), geometry.json
AX_Y, AX_Z = 0.012, 1.228            # nacelle axis (y, |z|)
TUBE_X, TUBE_Y = -0.0716, 0.00448    # tube axis along Z
X_RING0, X_RING1 = 0.033, 0.039
STEEL = [0.75, 0.75, 0.77]
BRASS = [0.80, 0.62, 0.25]
PA6 = [0.118, 0.129, 0.157]
SHELLC = [0.929, 0.937, 0.957]
ALU = [0.718, 0.737, 0.776]


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


# ---------------------------------------------------------------- geometry helpers (model metres in, Fusion cm out)
def mp(x, y, z):
    return P3.create(z * 100.0, x * 100.0, y * 100.0)


def dirv(s):
    sg = -1 if s[0] == '-' else 1
    k = s[-1]
    return {'x': V3.create(0, sg, 0), 'y': V3.create(0, 0, sg), 'z': V3.create(sg, 0, 0)}[k]


def add(p, v, d):
    return P3.create(p.x + v.x * d, p.y + v.y * d, p.z + v.z * d)


def cy(x, y, z, ax, r, h, off=0.0):
    """cylinder centre-line start (x,y,z metres), axis ax ('x','-z',.. or Vector3D), r,h,off in mm (base at start + ax*off)."""
    a = dirv(ax) if isinstance(ax, str) else ax
    p0 = add(mp(x, y, z), a, off / 10.0)
    return tbm.createCylinderOrCone(p0, r / 10.0, add(p0, a, h / 10.0), r / 10.0)


def cone(x, y, z, ax, r0, r1, h, off=0.0):
    a = dirv(ax) if isinstance(ax, str) else ax
    p0 = add(mp(x, y, z), a, off / 10.0)
    return tbm.createCylinderOrCone(p0, r0 / 10.0, add(p0, a, h / 10.0), r1 / 10.0)


def bx(x0, x1, y0, y1, z0, z1):
    c = mp((x0 + x1) / 2.0, (y0 + y1) / 2.0, (z0 + z1) / 2.0)
    obb = adsk.core.OrientedBoundingBox3D.create(c, V3.create(0, 1, 0), V3.create(0, 0, 1), abs(x1 - x0) * 100.0, abs(y1 - y0) * 100.0, abs(z1 - z0) * 100.0)
    return tbm.createBox(obb)


def U(a, b):
    tbm.booleanOperation(a, b, BT.UnionBooleanType)
    return a


def D(a, b):
    tbm.booleanOperation(a, b, BT.DifferenceBooleanType)
    return a


def I(a, b):
    tbm.booleanOperation(a, b, BT.IntersectionBooleanType)
    return a


def tube(x, y, z, ax, ro, ri, h, off=0.0):
    o = cy(x, y, z, ax, ro, h, off)
    if ri > 0:
        D(o, cy(x, y, z, ax, ri, h + 0.2, off - 0.1))
    return o


def seg(p, q, r):
    return tbm.createCylinderOrCone(p, r / 10.0, q, r / 10.0)


def polyline(pts_m, r_mm, off=(0, 0, 0)):
    """swept wire of radius r (mm) through model-metre points, offset (dx,dy,dz) m"""
    ps = [mp(p[0] + off[0], p[1] + off[1], p[2] + off[2]) for p in pts_m]
    body = None
    for i in range(len(ps) - 1):
        s = seg(ps[i], ps[i + 1], r_mm)
        body = s if body is None else U(body, s)
    for p in ps[1:-1]:
        U(body, tbm.createSphere(p, r_mm / 10.0))
    return body


# ---------------------------------------------------------------- appearances / components
_AP = {}


def appearance(col, metal=False):
    key = (tuple(round(x, 2) for x in col), metal)
    if key in _AP:
        return _AP[key]
    des = design()
    nm = 'A1c_%02d%02d%02d_%s' % (tuple(int(round(x * 99)) for x in key[0]) + ('m' if metal else 'p',))
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


def new_body(comp, temp, name, col, metal=False):
    b = comp.bRepBodies.add(temp)
    b.name = name
    try:
        b.appearance = appearance(col, metal)
    except Exception:
        pass
    return b


def new_comp(name):
    occ = root().occurrences.addNewComponent(M3.create())
    occ.component.name = name
    return occ, occ.component


def occ_named(prefix, exact=False):
    for o in root().occurrences:
        if (o.name == prefix) if exact else o.name.startswith(prefix):
            return o
    return None


def comp_occ(cname):
    for o in root().occurrences:
        if o.component.name == cname:
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


def cut_world(occ, target, tools, join=False):
    """tools are built in WORLD coordinates; the component may sit at a non-identity occurrence transform (wing panels, pod, battery), so map them to local first."""
    m = occ.transform2.copy()
    m.invert()
    loc = []
    for t in tools:
        tbm.transform(t, m)
        loc.append(t)
    return cut_bodies(occ.component, target, loc, join)


def bb_m(b):
    a, z = b.boundingBox.minPoint.asArray(), b.boundingBox.maxPoint.asArray()
    return [round(a[1] / 100, 4), round(z[1] / 100, 4), round(a[2] / 100, 4), round(z[2] / 100, 4), round(a[0] / 100, 4), round(z[0] / 100, 4)]


def set_key(o, key, grp=None):
    try:
        o.attributes.add('DBF', 'key', key)
        if grp:
            o.attributes.add('DBF', 'grp', grp)
    except Exception:
        pass


# ================================================================ STEP 1: remove the pusher
def step_remove():
    guard()
    r = root()
    st = load_state()
    rg_names = {}
    for g in list(r.rigidGroups):
        rg_names[g.name] = [o.name for o in g.occurrences]
    st['rg_before'] = rg_names
    save_state(st)
    # delete the pod group, pusher joint, then the pusher occurrences
    for g in list(r.rigidGroups):
        if g.name.startswith('RG Pod'):
            g.deleteMe()
    for j in list(r.joints):
        if 'Pusher' in j.name:
            j.deleteMe()
    gone = []
    for pre in ('J-11 Pusher motor', 'Pusher_Prop_Set', 'ESC_P', 'CAP_P', 'J-29 ESC mounting lift ESCs on boom outboard faces [C]'):
        o = occ_named(pre)
        if o:
            gone.append((o.name[:40], o.bRepBodies.count))
            o.deleteMe()
    print('removed', gone)
    # solid aft cap replaces the HW-035 ring (disc dia 58 x 6.5, x -0.4000..-0.3935, centre y -0.03)
    occ, c = new_comp('Pod_Aft_Cap')
    new_body(c, cy(-0.4, -0.03, 0.0, 'x', 29.0, 6.5), 'HW-035 Pod aft cap (PETG, solid disc 58 x 6.5)', PA6)
    print('occ', r.occurrences.count, 'joints', r.joints.count, 'rg', r.rigidGroups.count)


# ================================================================ STEP 2: wing panels - tip bore + upper-skin wire groove
def ytop_table(wing_body):
    out = {}
    for xi in range(-135, -25, 5):
        x = xi / 1000.0
        lo, hi = 0.005, 0.035
        for _ in range(14):
            m = (lo + hi) / 2
            if wing_body.pointContainment(mp(x, m, 0.5)) == adsk.fusion.PointContainment.PointInsidePointContainment:
                lo = m
            else:
                hi = m
        out[str(xi)] = round(lo, 5)
    return out


GROOVE = [(-0.12, 0.09), (-0.04, 0.25), (-0.04, 1.2)]       # (x, |z|)


def ytop(tab, x):
    k = max(-135, min(-30, round(x * 1000 / 5.0) * 5))
    return tab[str(int(k))]


def step_wings(sg):
    guard()
    occ = comp_occ('Wing_Panel_R' if sg > 0 else 'Wing_Panel_L')
    c = occ.component
    w = occ.bRepBodies.item(0)
    st = load_state()
    if 'ytop' not in st:
        st['ytop'] = ytop_table(w)
        save_state(st)
    tab = st['ytop']
    v0 = w.volume
    tools = [cy(TUBE_X, TUBE_Y, sg * 0.879, '-z' if sg < 0 else 'z', 12.8, 322.0)]
    # groove: boxes along the polyline, 7 mm wide, bottom 4 mm below the upper surface
    pts = []
    for (xa, za), (xb, zb) in zip(GROOVE[:-1], GROOVE[1:]):
        L = math.hypot(xb - xa, zb - za)
        n = max(1, int(math.ceil(L / 0.03)))
        for i in range(n + 1):
            t = i / float(n)
            pts.append((xa + (xb - xa) * t, za + (zb - za) * t))
    for (xa, za), (xb, zb) in zip(pts[:-1], pts[1:]):
        xm, zm = (xa + xb) / 2.0, (za + zb) / 2.0
        yt = ytop(tab, xm)
        dx, dz = xb - xa, (zb - za) * sg
        L = math.hypot(dx, dz) + 0.004
        ld = V3.create(dz / math.hypot(dx, dz), dx / math.hypot(dx, dz), 0)       # model dir (dx,0,dz) -> Fusion (dz,dx,0)
        wd = V3.create(0, 0, 1)
        cen = mp(xm, yt - 0.004 + 0.007, zm * sg)
        obb = adsk.core.OrientedBoundingBox3D.create(cen, ld, wd, L * 100.0, 1.4, 0.7)
        tools.append(tbm.createBox(obb))
    cut_world(occ, c.bRepBodies.item(0), tools)
    w = c.bRepBodies.item(0)
    print('wing', sg, 'tools', len(tools), 'vol', round(v0, 2), '->', round(w.volume, 2), 'solid', w.isSolid, 'bodies', c.bRepBodies.count)


# ================================================================ STEP 3: battery 0.174 m aft, tray extension, pod hatch, XT90S, pitot
SHIFT = -0.1742


def translate_occ(o, dx=0.0, dy=0.0, dz=0.0):
    """model metres"""
    m = o.transform2
    t = m.translation
    t.x += dz * 100.0
    t.y += dx * 100.0
    t.z += dy * 100.0
    m.translation = t
    o.transform2 = m


def step_battery():
    guard()
    r = root()
    for g in list(r.rigidGroups):
        if g.name.startswith('RG Left wing'):
            g.deleteMe()
    # battery along its slider joint
    j = [x for x in r.joints if 'Battery tray' in x.name][0]
    m = j.jointMotion
    lim = m.slideLimits
    print('limits', lim.isMinimumValueEnabled, lim.minimumValue, lim.isMaximumValueEnabled, lim.maximumValue)
    lim.isMinimumValueEnabled = True
    lim.minimumValue = SHIFT * 100.0 - 5.0
    m.slideValue = SHIFT * 100.0
    print('battery', bb_m(comp_occ('Battery_6S_LiPo').bRepBodies.item(0)))
    # XT90S moves with the pack front
    translate_occ(comp_occ('XT90S_1'), dx=SHIFT)
    print('xt90s', bb_m(comp_occ('XT90S_1').bRepBodies.item(0)))
    # pitot + clamp move inboard 0.10 m (z -1.0 -> -0.9)
    for o in (comp_occ('Pitot_Tube'), occ_named('J-31 Pitot clamp')):
        translate_occ(o, dz=0.10)
        print(o.name[:20], bb_m(o.bRepBodies.item(0)))
    # pod hatch: 170 x 60 mm bottom slot, x -0.205..-0.035, up to the pack top (y -0.0245)
    pod = comp_occ('Fuselage_Pod')
    b = pod.component.bRepBodies.item(0)
    v0 = b.volume
    cut_world(pod, b, [bx(-0.205, -0.035, -0.13, -0.0245, -0.03, 0.03)])
    print('pod vol', round(v0, 1), '->', round(pod.component.bRepBodies.item(0).volume, 1))
    # battery tray extension: two L rails
    occ, c = new_comp('Battery_Tray_Ext')
    for sgn, nm in ((1, 'R'), (-1, 'L')):
        t = bx(-0.205, -0.035, -0.078, -0.075, sgn * 0.0215, sgn * 0.0350)
        U(t, bx(-0.205, -0.035, -0.075, -0.067, sgn * 0.0245, sgn * 0.0275))
        new_body(c, t, 'Battery_Tray_Ext_%s (PETG L rail 170 x 14 x 8)' % nm, PA6)
    print('rails', [bb_m(x) for x in c.bRepBodies])


# ================================================================ STEP 4: aluminium tip tube + splice sleeve
def side_name(sg):
    return 'R' if sg > 0 else 'L'


def zax(sg):
    return 'z' if sg > 0 else '-z'


def step_tubes(sg):
    guard()
    n = side_name(sg)
    occ, c = new_comp('Tip_Tube_Ext_' + n)
    new_body(c, tube(TUBE_X, TUBE_Y, sg * 0.880, zax(sg), 12.7, 11.811, 342.0), 'Tip_Tube_Ext_%s 25.4x1.78 6061-T6 x 342' % n, ALU, True)
    occ2, c2 = new_comp('Tip_Splice_Sleeve_' + n)
    new_body(c2, tube(TUBE_X, TUBE_Y, sg * 0.843, zax(sg), 11.1125, 9.6395, 74.0), 'Tip_Splice_Sleeve_%s 22.2x19.3 x 74' % n, [0.8, 0.82, 0.86], True)
    print(n, bb_m(c.bRepBodies.item(0)), bb_m(c2.bRepBodies.item(0)))


# ================================================================ STEP 5: printed PA6-CF nacelle mount (ring + keel + barrel)
def outward(sg):
    return 'z' if sg > 0 else '-z'


def inward(sg):
    return '-z' if sg > 0 else 'z'


def step_mount(sg):
    guard()
    n = side_name(sg)
    zc = sg * AX_Z
    ring = cy(X_RING0, AX_Y, zc, 'x', 28.5, 6.0)
    D(ring, cy(X_RING0, AX_Y, zc, 'x', 10.0, 6.4, -0.2))
    for az in (45, 135, 225, 315):
        a = math.radians(az)
        D(ring, cy(X_RING0, AX_Y + 0.019 * math.sin(a), zc + 0.019 * math.cos(a), 'x', 4.0, 6.4, -0.2))
    for sy in (-9.5, 9.5):
        for sz in (-9.5, 9.5):
            D(ring, cy(X_RING0, AX_Y + sy / 1000.0, zc + sz / 1000.0, 'x', 1.6, 6.4, -0.2))
    # shell screw pockets (d10 x 2.5 from r 28.5 to 26) + insert bores d4.2 x 7.5, top (+Y) and outboard
    D(ring, cy(0.036, AX_Y, zc, 'y', 5.0, 3.5, 26.0))
    D(ring, cy(0.036, AX_Y, zc, '-y', 2.1, 7.5, -26.0))
    D(ring, cy(0.036, AX_Y, zc, outward(sg), 5.0, 3.5, 26.0))
    D(ring, cy(0.036, AX_Y, zc, inward(sg), 2.1, 7.5, -26.0))
    # keel plate with lightening holes and the wire hole
    keel = bx(-0.095, 0.034, -0.010, 0.034, sg * 1.226, sg * 1.230)
    for xh in (-0.060, -0.020, 0.010):
        D(keel, cy(xh, AX_Y, sg * 1.224, outward(sg), 7.0, 8.0))
    D(keel, cy(-0.040, 0.004, sg * 1.224, outward(sg), 5.0, 8.0))
    U(ring, keel)
    # barrel (OD 38, z 1.200..1.236, bore 25.6 x 24 from the inboard face)
    U(ring, cy(TUBE_X, TUBE_Y, sg * 1.200, outward(sg), 19.0, 36.0))
    D(ring, cy(TUBE_X, TUBE_Y, sg * 1.1995, outward(sg), 12.8, 24.5))
    D(ring, cy(TUBE_X, TUBE_Y, sg * 1.2125, '-y', 2.1, 7.5, -19.0))
    D(ring, cy(TUBE_X, TUBE_Y, sg * 1.2125, '-x', 2.1, 7.5, -19.0))
    # cable-tie slots 4.2 x 1.6
    for (xs, ys) in ((-0.0275, -0.0035), (-0.0275, 0.0275), (-0.0025, -0.0035), (-0.0025, 0.0275), (-0.0525, 0.0015), (-0.0525, 0.0225)):
        D(ring, bx(xs - 0.0021, xs + 0.0021, ys - 0.0008, ys + 0.0008, sg * 1.224, sg * 1.232))
    occ, c = new_comp('Nacelle_Mount_' + n)
    b = new_body(c, ring, 'Nacelle_Mount_%s (PA6-CF ring + keel + barrel)' % n, PA6)
    print(n, 'mount', bb_m(b), round(b.volume, 2), b.isSolid)


# ================================================================ STEP 6: PETG vase-print nacelle shell (revolve about the nacelle axis)
SHELL_O = [(-100.0, 29.0), (-130.0, 25.5), (-160.0, 19.0), (-190.0, 12.5), (-220.0, 8.0)]


def step_shell(sg):
    guard()
    n = side_name(sg)
    zc = sg * AX_Z
    old = comp_occ('Nacelle_Shell_' + n)
    if old:
        old.deleteMe()
    occ, c = new_comp('Nacelle_Shell_' + n)
    pi = c.constructionPlanes.createInput()
    pi.setByOffset(c.xYConstructionPlane, VI.createByReal(AX_Y * 100.0))
    pl = c.constructionPlanes.add(pi)
    sk = c.sketches.add(pl)
    sk.name = 'shell profile'

    def sp(xmm, r):
        return sk.modelToSketchSpace(P3.create(zc * 100.0 + r / 10.0, xmm / 10.0, AX_Y * 100.0))
    ln = sk.sketchCurves.sketchLines
    sps = sk.sketchCurves.sketchFittedSplines
    col = adsk.core.ObjectCollection.create()
    for (x, r) in SHELL_O:
        col.add(sp(x, r))
    s1 = sps.add(col)
    col = adsk.core.ObjectCollection.create()
    for (x, r) in reversed(SHELL_O):
        col.add(sp(x, r - 0.5))
    s2 = sps.add(col)
    l1 = ln.addByTwoPoints(sp(39.0, 29.0), s1.startSketchPoint)
    l2 = ln.addByTwoPoints(s1.endSketchPoint, s2.startSketchPoint)
    l3 = ln.addByTwoPoints(s2.endSketchPoint, sp(39.0, 28.5))
    l4 = ln.addByTwoPoints(l3.endSketchPoint, l1.startSketchPoint)
    axis = ln.addByTwoPoints(sp(50.0, 0.0), sp(-230.0, 0.0))
    axis.isConstruction = True
    prof = None
    for p in sk.profiles:
        prof = p if prof is None or p.areaProperties().area > prof.areaProperties().area else prof
    ri = c.features.revolveFeatures.createInput(prof, axis, adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
    ri.setAngleExtent(False, VI.createByString('360 deg'))
    rv = c.features.revolveFeatures.add(ri)
    body = rv.bodies.item(0)
    tb = tbm.copy(body)
    body.deleteMe()
    print('revolved vol', round(tb.volume, 3))
    # doubler pads (d9 x 2.5, inside the shell at r 26..28.5) then holes d3.4
    U(tb, cy(0.036, AX_Y, zc, 'y', 4.5, 2.6, 26.0))
    U(tb, cy(0.036, AX_Y, zc, outward(sg), 4.5, 2.6, 26.0))
    D(tb, cy(0.036, AX_Y, zc, 'y', 1.7, 7.0, 24.0))
    D(tb, cy(0.036, AX_Y, zc, outward(sg), 1.7, 7.0, 24.0))
    # inboard wall: barrel clearance and wire slot; flat trim at the wing tip face |z| = 1.200
    D(tb, cy(TUBE_X, TUBE_Y, sg * 1.19, outward(sg), 19.3, 30.0))
    D(tb, bx(-0.046, -0.034, 0.001, 0.007, sg * 1.19, sg * 1.21))
    D(tb, bx(-0.30, 0.10, -0.10, 0.10, sg * 1.0, sg * 1.2))
    b = new_body(c, tb, 'Nacelle_Shell_%s (PETG 0.5 mm vase)' % n, SHELLC)
    sk.isVisible = False
    pl.isLightBulbOn = False
    print(n, 'shell', bb_m(b), round(b.volume, 2), b.isSolid)


# ================================================================ STEP 7: tip prop set (copy of the C0 Pusher_Prop_Set rotating group, turned to face +X)
HWMAP = {'HW-041': 'HW-A1-003', 'HW-042': 'HW-A1-004', 'HW-043': 'HW-A1-005', 'HW-139': 'HW-A1-006', 'HW-044': 'HW-A1-007', 'HW-045': 'HW-A1-008'}


def step_props(sg):
    """needs pusher_set.smt/.json (exported from C0 'Pusher_Prop_Set' occurrence before the pusher was removed)"""
    guard()
    n = side_name(sg)
    bs = tbm.createFromFile(BASE + 'pusher_set.smt')
    meta = json.load(open(BASE + 'pusher_set.json'))
    zc = sg * AX_Z * 100.0
    rot = M3.create()
    rot.setWithArray([-1, 0, 0, zc, 0, -1, 0, -36.1, 0, 0, 1, 4.2, 0, 0, 0, 1])
    refl = M3.create()
    refl.setWithArray([1, 0, 0, zc, 0, -1, 0, -36.1, 0, 0, 1, 4.2, 0, 0, 0, 1])
    occ, c = new_comp('Tip_Prop_Set_' + n)
    mirrored = None
    for b, m in zip(bs, meta):
        nm = m['name']
        isprop = nm.startswith('Pusher_Prop')
        ok = False
        if isprop and sg > 0:
            try:
                ok = b.transform(refl) if hasattr(b, 'transform') else tbm.transform(b, refl)
            except Exception:
                ok = False
            mirrored = ok
        if not ok:
            ok = tbm.transform(b, rot)
        key = nm.split('_')[0]
        if isprop:
            newn = 'Tip_Prop_%s APC 14x8.5%s' % (n, 'E (standard rotation)' if sg > 0 else 'EP (reverse rotation)')
            col, metal = [0.059, 0.059, 0.067], False
        elif nm.startswith('Spinner'):
            newn, col, metal = 'Tip_Spinner_%s (printed)' % n, [0.949, 0.957, 0.969], False
        elif nm.startswith('Pusher_Motor'):
            newn, col, metal = 'Tip_Motor_%s SunnySky X4110S 400KV (can)' % n, [0.173, 0.184, 0.22], False
        else:
            pre = nm[:6]
            newn = nm.replace(pre, HWMAP.get(pre, pre), 1).replace('Pusher adapter', 'Tip adapter').replace(', pusher', '')
            metal = pre in ('HW-043', 'HW-044', 'HW-045', 'HW-139')
            col = STEEL if metal else [0.55, 0.57, 0.62]
        new_body(c, b, newn, col, metal)
    print(n, 'prop set', c.bRepBodies.count, 'mirrored prop', mirrored)
    for b in c.bRepBodies:
        if b.name.startswith(('Tip_Prop', 'Tip_Motor', 'Tip_Spinner')):
            print('  ', b.name[:40], bb_m(b))


# ================================================================ STEP 8: ESC_T + CAP_T (+ capacitor seat pocket in the barrel end cap)
def step_esc(sg):
    guard()
    n = side_name(sg)
    mo = comp_occ('Nacelle_Mount_' + n)
    mb = mo.component.bRepBodies.item(0)
    # DEVIATION: the 470 uF can (x -0.0625..-0.0425, z 1.230..1.240) overlaps the barrel end cap (z to 1.236); cut a 6 mm seat in the barrel end face
    cut_bodies(mo.component, mb, [bx(-0.0640, -0.0500, 0.0065, 0.0175, sg * 1.230, sg * 1.2370)])
    occ, c = new_comp('ESC_T_' + n)
    new_body(c, bx(-0.0375, 0.0075, AX_Y - 0.0125, AX_Y + 0.0125, sg * 1.231, sg * 1.239), 'ESC_T_%s SoloGood 45A BLHeli_S (45x25x8)' % n, [0.10, 0.35, 0.20])
    occ2, c2 = new_comp('CAP_T_' + n)
    new_body(c2, cy(-0.0625, AX_Y, sg * 1.235, 'x', 5.0, 20.0), 'CAP_T_%s Panasonic 470uF 35V (D10x20)' % n, [0.10, 0.10, 0.45])
    print(n, 'esc', bb_m(c.bRepBodies.item(0)), 'cap', bb_m(c2.bRepBodies.item(0)), 'mount vol', round(mo.component.bRepBodies.item(0).volume, 2))


# ================================================================ STEP 9: hardware (screws, washers, inserts, cable ties)
def screw(x, y, z, ax, d, L, hd, hh, s, grub=False):
    """pos = head underside, shank along ax (into the joint): C0 hardware convention"""
    a = dirv(ax)
    c = mp(x, y, z)
    sh = tbm.createCylinderOrCone(c, d / 20.0, add(c, a, L / 10.0), d / 20.0)
    if not grub:
        hdb = tbm.createCylinderOrCone(c, hd / 20.0, add(c, a, -hh / 10.0), hd * 0.36 / 20.0)
        U(sh, hdb)
        if s:
            D(sh, cy(x, y, z, ax, s * 0.58, hh * 0.6 + 0.1, -hh - 0.1))
    else:
        D(sh, cy(x, y, z, ax, s * 0.58, 1.2, -0.1))
    return sh


def washer(x, y, z, ax, od=7.0, idd=3.2, t=0.5):
    return tube(x, y, z, ax, od / 2, idd / 2, t, -t / 2)


def insert(x, y, z, ax, od=4.6, L=5.7, ri=1.2):
    return tube(x, y, z, ax, od / 2, ri, L, 0.0)


def band(xc, y0, y1, z0, z1, w=0.0025, t=0.001, sg=1):
    """rectangular cable-tie loop (band width w m along x) round the rectangle y0..y1, z0..z1 (z already signed)"""
    o = bx(xc - w / 2, xc + w / 2, y0 - t, y1 + t, z0 - sg * t, z1 + sg * t)
    D(o, bx(xc - w / 2 - 0.001, xc + w / 2 + 0.001, y0, y1, z0, z1))
    return o


def step_hw(sg):
    guard()
    n = side_name(sg)
    zc = sg * AX_Z
    # J-A1-3 tip motor on the nacelle mount ring: 4 x ISO 7380 M3x10 + 4 washers; ESC and capacitor cable ties
    occ, c = new_comp('J-A1-3 Tip motor - nacelle mount 4 x M3x10 + washers, ESC and cap cable ties [%s]' % n)
    k = 0
    for sy in (-9.5, 9.5):
        for sz in (-9.5, 9.5):
            k += 1
            y, z = AX_Y + sy / 1000.0, zc + sz / 1000.0
            new_body(c, screw(0.0324, y, z, 'x', 3.0, 10.0, 5.7, 1.65, 2.0), 'HW-A1-001_%d ISO 7380-1 M3x10 A2 (%s motor)' % (k, n), STEEL, True)
            new_body(c, washer(0.03265, y, z, 'x'), 'HW-A1-002_%d ISO 7089 M3 A2 (%s motor)' % (k, n), STEEL, True)
    for i, xc in enumerate((-0.0275, -0.0025)):
        new_body(c, band(xc, -0.003, 0.027, sg * 1.226, sg * 1.2395, sg=sg), 'HW-A1-011_%d Cable tie 100x2.5 (ESC_T_%s loop %d)' % (i + 1, n, i + 1), [0.9, 0.9, 0.88])
    new_body(c, band(-0.0515, 0.002, 0.022, sg * 1.226, sg * 1.2400, sg=sg), 'HW-A1-012_1 Cable tie 100x2.5 (CAP_T_%s loop)' % n, [0.9, 0.9, 0.88])
    # J-A1-2 tube retention: 2 inserts M3x5.7 + 2 grub screws M3x6 per barrel (+Y and +X)
    occ2, c2 = new_comp('J-A1-2 Tip tube - nacelle mount barrel 2 x M3x5.7 inserts + 2 x M3x6 grub [%s]' % n)
    pos = [(TUBE_X, TUBE_Y + 0.019, sg * 1.2125, '-y'), (TUBE_X + 0.019, TUBE_Y, sg * 1.2125, '-x')]
    for i, (x, y, z, a) in enumerate(pos):
        new_body(c2, insert(x, y, z, a), 'HW-A1-009_%d Ruthex-type M3x5.7 brass heat-set insert (%s tube)' % (i + 1, n), BRASS)
        new_body(c2, screw(x, y, z, a, 3.0, 6.0, 3.0, 0.1, 1.5, grub=True), 'HW-A1-010_%d ISO 4027 M3x6 A2 grub (%s tube)' % (i + 1, n), STEEL, True)
    # J-A1-5 shell screws: 2 inserts in the ring rim, 2 x ISO 7380 M3x8 + washers through the shell pads
    occ3, c3 = new_comp('J-A1-5 Nacelle shell - mount ring 2 x M3x8 + washers into inserts [%s]' % n)
    pos = [(0.036, AX_Y + 0.026, zc, '-y', 0.0415, 0.04125), (0.036, AX_Y, zc + sg * 0.026, inward(sg), None, None)]
    new_body(c3, insert(0.036, AX_Y + 0.026, zc, '-y'), 'HW-A1-013_1 Ruthex-type M3x5.7 insert (%s shell top)' % n, BRASS)
    new_body(c3, insert(0.036, AX_Y, zc + sg * 0.026, inward(sg)), 'HW-A1-013_2 Ruthex-type M3x5.7 insert (%s shell outboard)' % n, BRASS)
    new_body(c3, screw(0.036, AX_Y + 0.0295, zc, '-y', 3.0, 8.0, 5.7, 1.65, 2.0), 'HW-A1-014_1 ISO 7380-1 M3x8 A2 (%s shell top)' % n, STEEL, True)
    new_body(c3, screw(0.036, AX_Y, zc + sg * 0.0295, inward(sg), 3.0, 8.0, 5.7, 1.65, 2.0), 'HW-A1-014_2 ISO 7380-1 M3x8 A2 (%s shell outboard)' % n, STEEL, True)
    new_body(c3, washer(0.036, AX_Y + 0.02925, zc, 'y'), 'HW-A1-015_1 ISO 7089 M3 A2 (%s shell top)' % n, STEEL, True)
    new_body(c3, washer(0.036, AX_Y, zc + sg * 0.02925, outward(sg)), 'HW-A1-015_2 ISO 7089 M3 A2 (%s shell outboard)' % n, STEEL, True)
    for cc in (c, c2, c3):
        print(n, cc.name[:30], cc.bRepBodies.count)


# ================================================================ STEP 10: breakdown-joint connectors (J1) and the tip feed wiring
YEL = [0.95, 0.80, 0.10]
BLK = [0.10, 0.10, 0.10]


def step_conn(sg):
    guard()
    n = side_name(sg)
    occ, c = new_comp('Tip_Connectors_' + n)
    zs = lambda a, b: (sg * a, sg * b)
    z0, z1 = zs(0.0955, 0.1075)
    new_body(c, bx(-0.1125, -0.1045, -0.0078, 0.0078, z0, z1), 'XT60H_tip_%s male housing (J1)' % n, YEL)
    z0, z1 = zs(0.1075, 0.1195)
    new_body(c, bx(-0.1125, -0.1045, -0.0078, 0.0078, z0, z1), 'XT60H_tip_%s female housing (J1)' % n, YEL)
    z0, z1 = zs(0.0955, 0.1035)
    new_body(c, bx(-0.1030, -0.0990, -0.0038, 0.0038, z0, z1), 'JR3_tip_%s plug housing (J1)' % n, BLK)
    z0, z1 = zs(0.1035, 0.1115)
    new_body(c, bx(-0.1030, -0.0990, -0.0038, 0.0038, z0, z1), 'JR3_tip_%s socket housing (J1)' % n, BLK)
    occ2, c2 = new_comp('J-A1-6 XT60H mated-pair retention cable tie [%s]' % n)
    new_body(c2, band_z(-0.1085, 0.0, 0.0079, 0.0041, sg * 0.1075, sg), 'HW-A1-016_1 Cable tie 100x2.5 (XT60H tip pair %s)' % n, [0.9, 0.9, 0.88])
    print(n, 'connectors', c.bRepBodies.count, c2.bRepBodies.count)


def band_z(xc, yc, hy, hx, zc, sg, w=0.0025, t=0.001):
    """loop round the XT60H pair (half sizes hx, hy), band width w along z"""
    o = bx(xc - hx - t, xc + hx + t, yc - hy - t, yc + hy + t, zc - w / 2, zc + w / 2)
    D(o, bx(xc - hx - 0.0001, xc + hx + 0.0001, yc - hy - 0.0001, yc + hy + 0.0001, zc - w, zc + w))
    return o


def step_wires(sg):
    guard()
    n = side_name(sg)
    tab = load_state()['ytop']
    yt = lambda x: ytop(tab, x) - 0.0023
    xg = lambda z: -0.12 + 0.08 * (z - 0.09) / 0.16
    zz = lambda z: sg * z
    B = [(-0.1085, 0.0, zz(0.1195)), (xg(0.13), yt(xg(0.13)), zz(0.13)), (-0.04, yt(-0.04), zz(0.25)), (-0.04, yt(-0.04), zz(1.199)),
         (-0.04, 0.010, zz(1.204)), (-0.04, 0.004, zz(1.214)), (-0.04, 0.004, zz(1.233)), (-0.0420, 0.004, zz(1.235))]
    A = [(0.2, -0.06, zz(0.004)), (0.12, -0.09, zz(0.02)), (-0.02, -0.09, zz(0.04)), (-0.09, -0.05, zz(0.065)), (-0.1085, 0.0, zz(0.0955))]
    occ = comp_occ('W_TIP_%s_pod' % n)
    if occ:
        c = occ.component
        c2 = comp_occ('W_TIP_%s_wing' % n).component
        for cc in (c, c2):
            for b in list(cc.bRepBodies):
                b.deleteMe()
    else:
        occ, c = new_comp('W_TIP_%s_pod' % n)
        occ2, c2 = new_comp('W_TIP_%s_wing' % n)
    new_body(c, polyline(A, 2.0, (0, 0.0021, 0)), 'W_TIP_PWR_%s_pod red 12 AWG (BUS1 to J1, 0.415 m)' % n, [0.85, 0.1, 0.1])
    new_body(c, polyline(A, 2.0, (0, -0.0021, 0)), 'W_TIP_PWR_%s_pod black 12 AWG' % n, BLK)
    new_body(c, polyline(A, 0.7, (0, 0.0050, 0)), 'W_TIP_SIG_%s_pod JR DShot lead (white)' % n, [0.95, 0.95, 0.95])
    new_body(c2, polyline(B, 1.65, (0.0017, 0, 0)), 'W_TIP_PWR_%s_wing red 14 AWG (J1 to ESC_T, groove)' % n, [0.85, 0.1, 0.1])
    new_body(c2, polyline(B, 1.65, (-0.0017, 0, 0)), 'W_TIP_PWR_%s_wing black 14 AWG' % n, BLK)
    new_body(c2, polyline(B, 0.7, (0, 0.0020, 0)), 'W_TIP_SIG_%s_wing JR DShot lead (white)' % n, [0.95, 0.95, 0.95])
    print(n, 'wires', [round(b.volume, 3) for b in c.bRepBodies], [round(b.volume, 3) for b in c2.bRepBodies])


def step_fix1(sg):
    """post-check fixes: cap-tie slot + tie position, wider shell wire slot, foam wire channel"""
    guard()
    n = side_name(sg)
    mo = comp_occ('Nacelle_Mount_' + n)
    cut_bodies(mo.component, mo.component.bRepBodies.item(0), [bx(-0.0508, -0.0491, yy - 0.0008, yy + 0.0008, sg * 1.224, sg * 1.232) for yy in (0.0015, 0.0225)])
    so = comp_occ('Nacelle_Shell_' + n)
    cut_bodies(so.component, so.component.bRepBodies.item(0), [bx(-0.048, -0.032, -0.001, 0.020, sg * 1.19, sg * 1.21)])
    hw = [o for o in root().occurrences if o.component.name.startswith('J-A1-3') and o.component.name.endswith('[%s]' % n)][0]
    for b in list(hw.component.bRepBodies):
        if b.name.startswith('HW-A1-012'):
            b.deleteMe()
    new_body(hw.component, band(-0.0512, 0.002, 0.022, sg * 1.226, sg * 1.2400, sg=sg), 'HW-A1-012_1 Cable tie 100x2.5 (CAP_T_%s loop)' % n, [0.9, 0.9, 0.88])
    print(n, 'fix1 done')


def step_channel(sg):
    """cut the wire channel + connector pocket in the foam panel with copies of the wires and connector housings"""
    guard()
    n = side_name(sg)
    wo = comp_occ('Wing_Panel_' + n)
    tools = []
    for cn in ('W_TIP_%s_wing' % n, 'Tip_Connectors_' + n):
        o = comp_occ(cn)
        for b in o.bRepBodies:
            tools.append(tbm.copy(b))
    v0 = wo.component.bRepBodies.item(0).volume
    cut_world(wo, wo.component.bRepBodies.item(0), tools)
    print(n, 'channel', round(v0, 2), '->', round(wo.component.bRepBodies.item(0).volume, 2), 'solid', wo.component.bRepBodies.item(0).isSolid)


# ================================================================ STEP 11: rigid groups (new parts ride the wing panels / the pod) and revolute joints for the tip props
def new_occs(sg):
    n = side_name(sg)
    names = ['Tip_Tube_Ext_', 'Tip_Splice_Sleeve_', 'Nacelle_Mount_', 'Nacelle_Shell_', 'ESC_T_', 'CAP_T_', 'Tip_Connectors_']
    out = []
    for o in root().occurrences:
        cn = o.component.name
        if any(cn == p + n for p in names) or cn == 'W_TIP_%s_wing' % n or (cn.startswith('J-A1-') and cn.endswith('[%s]' % n)):
            out.append(o)
    return out


def step_groups():
    guard()
    r = root()
    st = load_state()
    before = st['rg_before']
    for g in list(r.rigidGroups):
        if g.name.startswith(('RG Right wing', 'RG Left wing', 'RG Pod')):
            g.deleteMe()
    byname = {o.name: o for o in r.occurrences}
    spec = {'RG Right wing': ('R', 1), 'RG Left wing': ('L', -1), 'RG Pod': ('P', 0)}
    for gname, lst in before.items():
        key = [k for k in spec if gname.startswith(k)]
        if not key:
            continue
        side, sg = spec[key[0]]
        coll = adsk.core.ObjectCollection.create()
        added = 0
        for nm in lst:
            if nm in byname:
                coll.add(byname[nm])
                added += 1
        extra = []
        if sg != 0:
            extra = new_occs(sg)
        else:
            for o in r.occurrences:
                cn = o.component.name
                if cn in ('Pod_Aft_Cap', 'Battery_Tray_Ext', 'W_TIP_R_pod', 'W_TIP_L_pod'):
                    extra.append(o)
        for o in extra:
            coll.add(o)
            set_key(o, 'a1:' + o.component.name, side)
        snap = {o.name: o.boundingBox.minPoint.asArray() for o in r.occurrences}
        rg = r.rigidGroups.add(coll, False)
        rg.name = gname
        worst = 0.0
        for o in r.occurrences:
            if o.name in snap:
                a = o.boundingBox.minPoint.asArray()
                worst = max(worst, max(abs(a[i] - snap[o.name][i]) for i in range(3)))
        print(gname[:30], 'members', rg.occurrences.count, 'old', added, 'of', len(lst), 'new', len(extra), 'max shift', round(worst, 6))


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


def step_joints():
    guard()
    r = root()
    for sg in (1, -1):
        n = side_name(sg)
        a = comp_occ('Tip_Prop_Set_' + n)
        b = comp_occ('Nacelle_Mount_' + n)
        w = [sg * AX_Z * 100.0, 7.7, AX_Y * 100.0]
        g1 = adsk.fusion.JointGeometry.createByPoint(world_point_proxy(a, w))
        g2 = adsk.fusion.JointGeometry.createByPoint(world_point_proxy(b, w))
        ji = r.joints.createInput(g1, g2)
        ji.setAsRevoluteJointMotion(adsk.fusion.JointDirections.YAxisJointDirection)
        j = r.joints.add(ji)
        j.name = 'Rev Tip_Prop_%s motor axis' % n
        if sg < 0:
            try:
                j.isFlipped = True
            except Exception:
                pass
        print(j.name, [round(v, 3) for v in j.jointMotion.rotationAxisVector.asArray()])
    print('joints', r.joints.count, 'groups', r.rigidGroups.count)


# ================================================================ STEP 12: static interference of new / changed bodies vs neighbours
NEWC = ('Tip_Tube_Ext', 'Tip_Splice', 'Nacelle_', 'ESC_T', 'CAP_T', 'Tip_Prop_Set', 'J-A1', 'Tip_Connectors', 'W_TIP', 'Pod_Aft_Cap', 'Battery_Tray_Ext')
CHG = ('Wing_Panel_', 'Fuselage_Pod', 'Battery_6S', 'XT90S_1', 'Pitot_Tube', 'J-31')


def cname(b):
    ctx = b.assemblyContext
    return ctx.component.name if ctx is not None else b.parentComponent.name


def step_check(lo, hi, vmin=1e-4, only_new=True, maxrows=60):
    """lo/hi: model-metre box (x,y,z)"""
    guard()
    des = design()
    r = root()
    flo = [lo[2] * 100, lo[0] * 100, lo[1] * 100]
    fhi = [hi[2] * 100, hi[0] * 100, hi[1] * 100]
    bodies = []
    for o in r.allOccurrences:
        for b in o.bRepBodies:
            bb = b.boundingBox
            a, z = bb.minPoint.asArray(), bb.maxPoint.asArray()
            if all(z[i] >= flo[i] and a[i] <= fhi[i] for i in range(3)):
                bodies.append(b)
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
        na = ca.startswith(NEWC) or ca.startswith(CHG)
        nb = cb.startswith(NEWC) or cb.startswith(CHG)
        if only_new and not (ca.startswith(NEWC) or cb.startswith(NEWC) or ((ca.startswith(CHG) or cb.startswith(CHG)))):
            continue
        key = (ca[:34] + '|' + a.name[:26], cb[:34] + '|' + b.name[:26])
        agg[key] = agg.get(key, 0.0) + v
    rows = sorted(agg.items(), key=lambda t: -t[1])
    print('bodies', len(bodies), 'interfering pairs involving new/changed', len(rows))
    for k, v in rows[:maxrows]:
        print('  %.4f' % v, k[0], '<>', k[1])


def occ_bodies_copy(cn):
    o = comp_occ(cn) or occ_named(cn)
    return [tbm.copy(b) for b in o.bRepBodies]


def step_fix2():
    """seats and wire pass-throughs for the new parts in the solid pod, the J-25 former/tray and the wing roots"""
    guard()
    pod = comp_occ('Fuselage_Pod')
    tools = []
    for cn in ('W_TIP_R_pod', 'W_TIP_L_pod', 'Battery_Tray_Ext', 'Pod_Aft_Cap'):
        tools += occ_bodies_copy(cn)
    v0 = pod.component.bRepBodies.item(0).volume
    cut_world(pod, pod.component.bRepBodies.item(0), tools)
    print('pod', round(v0, 2), '->', round(pod.component.bRepBodies.item(0).volume, 2))
    j25 = occ_named('J-25 Pod formers')
    for nm in ('HW-104_1', 'HW-105_1'):
        b = [x for x in j25.component.bRepBodies if x.name.startswith(nm)][0]
        t = occ_bodies_copy('W_TIP_R_pod') + occ_bodies_copy('W_TIP_L_pod')
        v = b.volume
        cut_world(j25, b, t)
        b = [x for x in j25.component.bRepBodies if x.name.startswith(nm)][0]
        print(nm, round(v, 3), '->', round(b.volume, 3))
    for sg in (1, -1):
        n = side_name(sg)
        wo = comp_occ('Wing_Panel_' + n)
        t = occ_bodies_copy('W_TIP_%s_pod' % n) + [tbm.copy(b) for b in occ_named('J-A1-6').bRepBodies if True] if False else occ_bodies_copy('W_TIP_%s_pod' % n)
        for o in root().occurrences:
            if o.component.name.startswith('J-A1-6') and o.component.name.endswith('[%s]' % n):
                t += [tbm.copy(b) for b in o.bRepBodies]
        v = wo.component.bRepBodies.item(0).volume
        cut_world(wo, wo.component.bRepBodies.item(0), t)
        print(n, 'wing root', round(v, 2), '->', round(wo.component.bRepBodies.item(0).volume, 2))


# ================================================================ STEP 13: sweeps - tip prop through 360 deg, aileron through its throw, wing slider
def region_bodies(lo, hi):
    flo = [lo[2] * 100, lo[0] * 100, lo[1] * 100]
    fhi = [hi[2] * 100, hi[0] * 100, hi[1] * 100]
    out = []
    for o in root().allOccurrences:
        for b in o.bRepBodies:
            a, z = b.boundingBox.minPoint.asArray(), b.boundingBox.maxPoint.asArray()
            if all(z[i] >= flo[i] and a[i] <= fhi[i] for i in range(3)):
                out.append(b)
    return out


def hits(bodies, vmin, pred):
    des = design()
    col = adsk.core.ObjectCollection.create()
    for b in bodies:
        col.add(b)
    res = des.analyzeInterference(des.createInterferenceInput(col))
    out = {}
    for x in res:
        v = x.interferenceBody.volume
        if v < vmin:
            continue
        a, b = x.entityOne, x.entityTwo
        if pred(a, b):
            k = (cname(a)[:30] + '|' + a.name[:22], cname(b)[:30] + '|' + b.name[:22])
            out[k] = max(out.get(k, 0), v)
    return out


def step_sweep(sg, step=30):
    guard()
    n = side_name(sg)
    r = root()
    lo, hi = (-0.25, -0.2, sg * 1.0 if sg > 0 else -1.5), (0.15, 0.25, 1.5 if sg > 0 else -1.0)
    j = [x for x in r.joints if x.name == 'Rev Tip_Prop_%s motor axis' % n][0]
    m = j.jointMotion
    worst = {}
    for deg in range(0, 360, step):
        m.rotationValue = math.radians(deg)
        bodies = region_bodies(lo, hi)
        h = hits(bodies, 1e-4, lambda a, b: (cname(a) == 'Tip_Prop_Set_' + n) != (cname(b) == 'Tip_Prop_Set_' + n))
        for k, v in h.items():
            if v > worst.get(k, (0, 0))[0]:
                worst[k] = (round(v, 5), deg)
    m.rotationValue = 0.0
    print(n, 'prop sweep', step, 'deg; rotating-vs-static overlaps', len(worst))
    for k, v in sorted(worst.items(), key=lambda t: -t[1][0])[:15]:
        print('  ', k, v)
    # aileron through its limits
    aj = [x for x in r.joints if x.name == 'Rev Aileron_%s hinge' % n][0]
    am = aj.jointMotion
    lim = am.rotationLimits
    print(' aileron limits deg', round(math.degrees(lim.minimumValue), 1), round(math.degrees(lim.maximumValue), 1))
    for val in (lim.minimumValue * 0.999, lim.maximumValue * 0.999):
        am.rotationValue = val
        bodies = region_bodies((-0.25, -0.05, sg * 1.0 if sg > 0 else -1.4), (0.0, 0.06, 1.4 if sg > 0 else -1.0))
        h = hits(bodies, 1e-5, lambda a, b: (cname(a).startswith('Aileron') and cname(b).startswith(('Nacelle', 'Tip_', 'W_TIP', 'ESC_T', 'CAP_T'))) or (cname(b).startswith('Aileron') and cname(a).startswith(('Nacelle', 'Tip_', 'W_TIP', 'ESC_T', 'CAP_T'))))
        print('  aileron at', round(math.degrees(val), 1), 'deg: overlaps with new parts', len(h), list(h.items())[:3])
        # min distance aileron body to shell
        al = [b for b in comp_occ('Aileron_' + n).bRepBodies if b.name.startswith('Aileron')][0]
        sh = comp_occ('Nacelle_Shell_' + n).bRepBodies.item(0)
        md = app.measureManager.measureMinimumDistance(al, sh)
        print('  min distance aileron-shell mm', round(md.value * 10, 2))
    am.rotationValue = 0.0
    md = app.measureManager.measureMinimumDistance([b for b in comp_occ('Aileron_' + n).bRepBodies if b.name.startswith('Aileron')][0], comp_occ('Nacelle_Shell_' + n).bRepBodies.item(0))
    print('  rest min distance aileron-shell mm', round(md.value * 10, 2))


# ================================================================ STEP 14: export new / changed bodies (world Fusion cm, Z-up, binary STL) + variant_manifest.json
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
            bx_, by, bz = xs[b_], xs[b_ + 1], xs[b_ + 2]
            cx, cy_, cz = xs[c], xs[c + 1], xs[c + 2]
            ux, uy, uz = bx_ - ax, by - ay, bz - az
            vx, vy, vz = cx - ax, cy_ - ay, cz - az
            nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
            l = (nx * nx + ny * ny + nz * nz) ** 0.5 or 1.0
            out += pk.pack(nx / l, ny / l, nz / l, ax, ay, az, bx_, by, bz, cx, cy_, cz, 0)
    open(path, 'wb').write(bytes(out))
    return n, [round(v, 3) for v in mn], [round(v, 3) for v in mx]


def color_of(bodies):
    for b in bodies:
        try:
            cp = adsk.core.ColorProperty.cast(b.appearance.appearanceProperties.itemByName('Color'))
            if cp:
                return [round(cp.value.red / 255.0, 3), round(cp.value.green / 255.0, 3), round(cp.value.blue / 255.0, 3)]
        except Exception:
            pass
    return [0.6, 0.6, 0.6]


def export_units():
    """(name, group, bodies, fixed colour or None, extra)"""
    r = root()
    U_ = []

    def rides(cn, bl):
        if 'R' == cn[-1] or cn.endswith('[R]'):
            return 'slide_panel_R'
        if 'L' == cn[-1] or cn.endswith('[L]'):
            return 'slide_panel_L'
        return None
    for o in r.occurrences:
        cn = o.component.name
        bl = list(o.bRepBodies)
        if cn in ('Wing_Panel_R', 'Wing_Panel_L'):
            U_.append((cn, 'airframe', bl, None, {'rides': 'slide_panel_' + cn[-1], 'changed': 'tip bore d25.6 + upper-skin wire groove + J1 wire channel'}))
        elif cn == 'Fuselage_Pod':
            U_.append((cn, 'airframe', bl, None, {'changed': 'bottom battery hatch 170 x 60, wire channels, tray and aft-cap seats'}))
        elif cn == 'Battery_6S_LiPo':
            U_.append((cn, 'electronics', bl, None, {'changed': 'moved 0.1742 m aft'}))
        elif cn == 'XT90S_1':
            U_.append((cn, 'electronics', bl, None, {'changed': 'moved 0.1742 m aft'}))
        elif cn == 'Pitot_Tube':
            U_.append((cn, 'airframe', bl, None, {'rides': 'slide_panel_L', 'changed': 'moved to z -0.90'}))
        elif cn.startswith('J-31'):
            U_.append((o.name.rsplit(':', 1)[0], 'hardware', bl, None, {'joint': 'J-31', 'rides': 'slide_panel_L', 'changed': 'moved to z -0.90'}))
        elif cn.startswith('J-25 '):
            U_.append((o.name.rsplit(':', 1)[0], 'hardware', bl, None, {'joint': 'J-25', 'changed': 'former HW-104_1 and tray HW-105_1 notched for the tip wires'}))
        elif cn == 'Pod_Aft_Cap':
            U_.append((cn, 'printed', bl, None, {}))
        elif cn == 'Battery_Tray_Ext':
            U_.append((cn, 'printed', bl, None, {}))
        elif cn.startswith(('Tip_Tube_Ext', 'Tip_Splice_Sleeve')):
            U_.append((cn, 'airframe', bl, None, {'rides': rides(cn, bl)}))
        elif cn.startswith(('Nacelle_Mount', 'Nacelle_Shell')):
            U_.append((cn, 'printed', bl, None, {'rides': rides(cn, bl)}))
        elif cn.startswith('Tip_Prop_Set'):
            U_.append((cn, 'propulsion', bl, None, {'moving': 'prop_T' + cn[-1], 'rides': rides(cn, bl)}))
        elif cn.startswith(('ESC_T', 'CAP_T', 'Tip_Connectors')):
            U_.append((cn, 'electronics', bl, None, {'rides': rides(cn, bl)}))
        elif cn.startswith('W_TIP'):
            ex = {'rides': 'slide_panel_' + cn.split('_')[2]} if cn.endswith('wing') else {}
            U_.append((cn, 'electronics', bl, None, ex))
        elif cn.startswith('J-A1-'):
            U_.append((o.name.rsplit(':', 1)[0], 'hardware', bl, None, {'joint': cn[:6], 'rides': rides(cn, bl)}))
    return U_


def step_export(i0=0, i1=999):
    guard()
    os.makedirs(BASE + 'stl', exist_ok=True)
    os.makedirs(BASE + 'kinematics', exist_ok=True)
    ents = json.load(open(BASE + 'entries.json')) if (i0 > 0 and os.path.exists(BASE + 'entries.json')) else []
    units = export_units()
    print('units', len(units))
    bad = []
    for idx, (nm, g, bl, col, ex) in enumerate(units):
        if idx < i0 or idx >= i1 or not bl:
            continue
        sub = 'kinematics' if ex.get('moving') else 'stl'
        fn = re.sub(r'[^A-Za-z0-9_\-]', '_', nm)[:90]
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
        sz = os.path.getsize(BASE + path)
        if err > 0.02 or sz != 84 + 50 * n:
            bad.append((nm, round(err, 3), sz, 84 + 50 * n))
        e = {'file': path, 'name': nm, 'group': g, 'color': col or color_of(bl), 'count': len(bl), 'bbox_cm': [mn, mx], 'size': sz, 'triangles': n}
        e.update(ex)
        ents.append(e)
    json.dump(ents, open(BASE + 'entries.json', 'w'))
    print('exported', i0, i1, 'entries so far', len(ents), 'bad', bad)


HIDE = ['Wing_Panel_R', 'Wing_Panel_L', 'Fuselage_Pod', 'Battery_6S_LiPo', 'XT90S_1', 'Pitot_Tube', 'J-31 Pitot clamp on left wing lower skin [L]',
        'J-25 Pod formers battery tray straps', 'J-11 Pusher motor - firewall - pod aft bulkhead', 'Pusher_Prop_Set', 'ESC_P', 'CAP_P',
        'J-29 ESC mounting lift ESCs on boom outboard faces [C]']


def step_manifest():
    ents = json.load(open(BASE + 'entries.json'))
    moving = []
    for sg in (1, -1):
        n = side_name(sg)
        moving.append({'id': 'prop_T' + n, 'kind': 'revolute', 'parent': 'slide_panel_' + n, 'pivot_m': [0.077, AX_Y, sg * AX_Z],
                       'axis_m': [sg * 1.0, 0, 0], 'limits': None,
                       'note': ('right-hand about +X = clockwise seen from behind, APC 14x8.5E, inboard blade up' if sg > 0 else
                                'right-hand about -X = counter-clockwise seen from behind, APC 14x8.5EP, inboard blade up') +
                               '; set contains prop, spinner, motor can and prop-adapter hardware; rides slide_panel_' + n}),
    man = {'id': 'a1', 'doc': DOC,
           'axis_note': 'STL coordinates are Fusion world cm, Z-up (world-transformed, written from the B-rep mesh calculator; no further transform needed). Model X fwd = Fusion +Y, model Y up = Fusion +Z, model Z right = Fusion +X. i.e. model (x,y,z) m -> Fusion (z,x,y)*100 cm.',
           'units': 'cm', 'hide': HIDE, 'entries': ents, 'moving': moving}
    json.dump(man, open(BASE + 'variant_manifest.json', 'w'), indent=1)
    print(len(ents), 'entries', sum(e['size'] for e in ents), 'bytes', sum(e['count'] for e in ents), 'bodies')


def step_cad_files():
    guard()
    em = design().exportManager
    em.execute(em.createSTEPExportOptions(BASE + 'a1.step'))
    em.execute(em.createFusionArchiveExportOptions(BASE + 'a1.f3d'))
    print('step', os.path.getsize(BASE + 'a1.step'), 'f3d', os.path.getsize(BASE + 'a1.f3d'))


# ================================================================ STEP 15: renders
def hide_points():
    d = design()
    for c in d.allComponents:
        for p in c.constructionPoints:
            p.isLightBulbOn = False
    r = root()
    for a in ('isJointOriginsFolderLightBulbOn', 'isJointsFolderLightBulbOn', 'isOriginFolderLightBulbOn', 'isConstructionFolderLightBulbOn', 'isSketchFolderLightBulbOn'):
        try:
            setattr(r, a, False)
        except Exception:
            pass


VIEWS = {'view_iso': ((210, -230, 160), (0, -25, 0), (0, 0, 1)),
         'view_side': ((520, -25, 12), (0, -25, 12), (0, 0, 1)),
         'view_top': ((0, -25, 520), (0, -25, 0), (0, 1, 0)),
         'detail_tip_nacelle': ((165.0, -45.0, 30.0), (122.8, -4.0, 1.2), (0, 0, 1))}


def step_render(name, w=1600, h=1000):
    guard()
    hide_points()
    eye, tgt, up = VIEWS[name]
    vp = app.activeViewport
    c = vp.camera
    c.cameraType = adsk.core.CameraTypes.PerspectiveCameraType
    c.eye = P3.create(*eye)
    c.target = P3.create(*tgt)
    c.upVector = V3.create(*up)
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


# ================================================================ cache of the C0 pusher set (run BEFORE step_remove; used by step_props)
def step_cache():
    """open C0 read-only, export the 16 bodies of its 'Pusher_Prop_Set' occurrence to pusher_set.smt/.json, close C0 without saving."""
    a1 = app.activeDocument
    a1.save('before pusher cache')
    proj = a1.dataFile.parentProject
    df = [f for f in proj.rootFolder.dataFiles if f.name == 'VTOL C0 full'][0]
    c0 = app.documents.open(df)
    des = adsk.fusion.Design.cast(c0.products.itemByProductType('DesignProductType'))
    occ = [o for o in des.rootComponent.occurrences if o.name.startswith('Pusher_Prop_Set')][0]
    temps, meta = [], []
    for b in occ.bRepBodies:
        temps.append(tbm.copy(b))
        col = None
        try:
            cp = adsk.core.ColorProperty.cast(b.appearance.appearanceProperties.itemByName('Color'))
            col = [cp.value.red / 255.0, cp.value.green / 255.0, cp.value.blue / 255.0]
        except Exception:
            pass
        meta.append({'name': b.name, 'color': col})
    tbm.exportToFile(temps, BASE + 'pusher_set.smt')
    json.dump(meta, open(BASE + 'pusher_set.json', 'w'))
    c0.close(False)


# Build order used (each in its own short script):  step_cache(); step_remove(); step_wings(1); step_wings(-1); step_battery(); step_tubes(+-1);
# step_mount(+-1); step_shell(+-1); step_props(+-1); step_esc(+-1); step_hw(+-1); step_conn(+-1); step_wires(+-1); step_groups(); step_joints();
# step_fix1(+-1) (cap-tie slot, wider shell wire slot); step_channel(+-1) (wire channel in foam); step_fix2() (seats/pass-throughs in pod, J-25, wing roots);
# step_check(lo, hi); step_sweep(+-1); step_export(i0, i1); step_manifest(); step_cad_files(); step_render(view).
# NOTE: occurrence transforms are non-identity for Wing_Panel_*, Fuselage_Pod, Battery: always cut with cut_world().
