"""Variant a3 (Aligned, faired stopped rotors) built in Autodesk Fusion on a copy of "VTOL C0 full".

Document: "VTOL A3 faired parked rotors" (saveAs copy of C0, never edit C0).  Spec: concepts/variants/a3/{design,geometry,inventory,metrics}.
Axis mapping: model (x fwd, y up, z right) m -> Fusion (z, x, y) * 100 cm.  The document is a DIRECT-modelling design:
sketch/extrude/revolve/fillet/shell/combine work, BaseFeature does not, so temporary B-reps are added straight to the component.

Run each step from a short script:   exec(open(PATH).read()); step_xxx(...)    (PATH = this file on the Windows PC)
Steps (in order): step_mount, step_nacelle(k) k in L1 L3 L4 L2, step_fasteners(side), step_cap(k), step_reed(k), step_ladder,
step_groups, step_check.
"""
import adsk.core, adsk.fusion, traceback, math, re, os, json, struct

app = adsk.core.Application.get()
P3 = adsk.core.Point3D
V3 = adsk.core.Vector3D
M3 = adsk.core.Matrix3D
VI = adsk.core.ValueInput
tbm = adsk.fusion.TemporaryBRepManager.get()
BT = adsk.fusion.BooleanTypes
DOC = 'VTOL A3 faired parked rotors'
BASE = 'C:/Users/trist/Documents/DBF-Fusion-Export/variants/a3/'

# rotor id -> (x_m, z_m, front?, sign of +Z side)    (geometry.json notes)
ROT = {'L1': (0.37092, 0.4337, True, 1), 'L3': (0.37092, -0.4337, True, -1),
       'L4': (-0.50458, 0.4337, False, 1), 'L2': (-0.50458, -0.4337, False, -1)}
ORANGE = [0.96, 0.5, 0.12]
STEEL = [0.75, 0.75, 0.77]
MAGC = [0.62, 0.64, 0.68]
GLASS = [0.85, 0.9, 0.95]
XS = [66.4, 61.2, 56.0, 43.0, 30.0, 17.0, 4.0, -22.0, -48.0, -74.0, -100.0, -113.0]   # NACA table x_local (mm)
# DEVIATION: the C0 front Gear_Clamp (x 0.2639..0.2979) lies INSIDE the spec'd front nacelle footprint (tail x=0.2579), so the two front
# nacelles are cut at x_local = -66.5 (x/c 0.571, tail face x=0.3043, 6.4 mm ahead of the clamp) instead of -113 (x/c 0.75).
XS_FRONT = [66.4, 61.2, 56.0, 43.0, 30.0, 17.0, 4.0, -22.0, -48.0, -66.5]
TAIL = {True: -66.5, False: -113.0}
SEAM2 = {True: -52.0, False: -95.0}


def design():
    return adsk.fusion.Design.cast(app.activeProduct)


def root():
    d = design()
    return d.rootComponent


def guard():
    if app.activeDocument.name != DOC:
        raise Exception('wrong document: ' + app.activeDocument.name)


def ht(lx):
    """NACA 0022 half thickness (mm) at local x (mm, fwd +): chord 260, x_local = 82 - xi*260 (geometry.json)."""
    xi = (82.0 - lx) / 260.0
    return 5 * 0.22 * 260 * (0.2969 * math.sqrt(xi) - 0.1260 * xi - 0.3516 * xi ** 2 + 0.2843 * xi ** 3 - 0.1036 * xi ** 4)


def pt(m):
    return P3.create(m[2] * 100.0, m[0] * 100.0, m[1] * 100.0)


def vec(m):
    v = V3.create(m[2], m[0], m[1])
    v.normalize()
    return v


def add(p, v, d):
    return P3.create(p.x + v.x * d, p.y + v.y * d, p.z + v.z * d)


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


def I(a, b):
    tbm.booleanOperation(a, b, BT.IntersectionBooleanType)
    return a


def tube(c, a, ro, ri, h, off=0.0):
    o = cyl(c, a, ro, h, off)
    if ri > 0:
        D(o, cyl(c, a, ri, h + 0.2, off - 0.1))
    return o


def seg(p, q, r):
    return tbm.createCylinderOrCone(p, r, q, r)


# ---------------------------------------------------------------- appearances
_AP = {}


def appearance(col, metal=False):
    key = (tuple(round(x, 2) for x in col), metal)
    if key in _AP:
        return _AP[key]
    des = design()
    nm = 'A3c_%02d%02d%02d_%s' % (tuple(int(round(x * 99)) for x in key[0]) + ('m' if metal else 'p',))
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


def new_comp(name, parent=None):
    r = parent or root()
    occ = r.occurrences.addNewComponent(M3.create())
    occ.component.name = name
    return occ, occ.component


def occ_named(prefix):
    for o in root().occurrences:
        if o.name.startswith(prefix):
            return o
    return None


def set_key(o, key, grp=None):
    try:
        o.attributes.add('DBF', 'key', key)
        if grp:
            o.attributes.add('DBF', 'grp', grp)
    except Exception:
        pass


def cut_bodies(comp, target, tools, join=False):
    """tools: temporary B-reps in the component's space."""
    coll = adsk.core.ObjectCollection.create()
    for t in tools:
        coll.add(comp.bRepBodies.add(t))
    ci = comp.features.combineFeatures.createInput(target, coll)
    ci.operation = adsk.fusion.FeatureOperations.JoinFeatureOperation if join else adsk.fusion.FeatureOperations.CutFeatureOperation
    ci.isKeepToolBodies = False
    return comp.features.combineFeatures.add(ci)


# ---------------------------------------------------------------- fasteners (same look as fusion/build_hardware_fusion.py)
def screw(c, a, d, L, hd, hh, s):
    """c = head underside, a = axis along the shank (into the joint).  ISO 7380 button head, hex socket as a round pocket."""
    sh = cyl(c, a, d / 2, L)
    hdb = tbm.createCylinderOrCone(c, hd / 2, add(c, a, -hh), hd * 0.36)    # low dome, wide at the seat (C0 builds it mirrored)
    U(sh, hdb)
    D(sh, cyl(c, a, s * 0.058, hh * 0.6 + 0.01, -hh - 0.01))
    return sh


def insert_tube(p0, a, od=0.46, L=0.57, ri=0.12):
    return tube(p0, a, od / 2, ri, L)


# ================================================================ STEP 1: Motor_Mount insert bores (shared component, all 4 mounts)
def step_mount():
    guard()
    occ = [o for o in root().occurrences if o.component.name == 'Motor_Mount'][0]
    comp = occ.component
    up = [b for b in comp.bRepBodies if b.name == 'Motor_Mount_upper'][0]
    tools = []
    for fx in (2.3, -2.3):
        for fy in (2.7, -2.7):
            sgn = 1 if fx > 0 else -1
            ax = V3.create(-sgn, 0, 0)
            c = P3.create(fx + sgn * 0.01, fy, 0.75)       # local z 7.5 mm above the boom axis (model y = -0.0225)
            t = cyl(c, ax, 0.21, 0.75 + 0.01)
            lead = tbm.createCylinderOrCone(P3.create(fx + sgn * 0.01, fy, 0.75), 0.26, P3.create(fx - sgn * 0.04, fy, 0.75), 0.21)
            U(t, lead)
            tools.append(t)
    cut_bodies(comp, up, tools)
    print('mount bores cut', len(tools), 'vol', round(comp.bRepBodies.item(0).volume, 3))


# ================================================================ STEP 2: printed NACA 0022 nacelle (two clamshell halves) per rotor
class NC(object):
    """local nacelle frame: lx mm fwd (model X) from the rotor axis, y mm absolute (model Y), lz mm right (model Z) from the axis"""
    def __init__(s, k):
        s.k = k
        s.xm, s.zm, s.front, s.sg = ROT[k]
        s.si = -s.sg          # inboard side (towards the fuselage) in lz sign
        s.so = s.sg

    def p(s, lx, y, lz):
        return P3.create(s.zm * 100.0 + lz / 10.0, s.xm * 100.0 + lx / 10.0, y / 10.0)

    def cylz(s, lx, y, lz0, lz1, r):
        return tbm.createCylinderOrCone(s.p(lx, y, lz0), r / 10.0, s.p(lx, y, lz1), r / 10.0)

    def cylx(s, y, lz, lx0, lx1, r):
        return tbm.createCylinderOrCone(s.p(lx0, y, lz), r / 10.0, s.p(lx1, y, lz), r / 10.0)

    def cyly(s, lx, lz, y0, y1, r, r1=None):
        return tbm.createCylinderOrCone(s.p(lx, y0, lz), r / 10.0, s.p(lx, y1, lz), (r if r1 is None else r1) / 10.0)

    def bx(s, lx0, lx1, y0, y1, lz0, lz1):
        c = s.p((lx0 + lx1) / 2.0, (y0 + y1) / 2.0, (lz0 + lz1) / 2.0)
        obb = adsk.core.OrientedBoundingBox3D.create(c, V3.create(1, 0, 0), V3.create(0, 1, 0),
                                                     abs(lz1 - lz0) / 10.0, abs(lx1 - lx0) / 10.0, abs(y1 - y0) / 10.0)
        return tbm.createBox(obb)


def step_nacelle(k):
    guard()
    nc = NC(k)
    xm, zm, si, so = nc.xm, nc.zm, nc.si, nc.so
    occ, c = new_comp('Lift_Nacelle_' + k)
    occ.component.description = 'a3 printed PETG NACA 0022 nacelle (chord 260, truncated 0.06..0.75), two clamshell halves split at the rotor plane z=z_m'
    pi = c.constructionPlanes.createInput()
    pi.setByOffset(c.xYConstructionPlane, VI.createByReal(-4.55))
    pl = c.constructionPlanes.add(pi)
    sk = c.sketches.add(pl)
    sk.name = 'plan NACA0022'

    def spl(sgn):
        col = adsk.core.ObjectCollection.create()
        for lx in (XS_FRONT if nc.front else XS):
            col.add(sk.modelToSketchSpace(P3.create(zm * 100 + sgn * ht(lx) / 10.0, xm * 100 + lx / 10.0, -4.55)))
        return sk.sketchCurves.sketchFittedSplines.add(col)
    up = spl(1)
    lo = spl(-1)
    ln = sk.sketchCurves.sketchLines
    ln.addByTwoPoints(up.startSketchPoint, lo.startSketchPoint)
    ln.addByTwoPoints(up.endSketchPoint, lo.endSketchPoint)
    ei = c.features.extrudeFeatures.createInput(sk.profiles.item(0), adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
    ei.setDistanceExtent(False, VI.createByReal(6.25))
    ex = c.features.extrudeFeatures.add(ei)
    body = ex.bodies.item(0)
    bb = body.boundingBox
    print('extrude bbox', [round(v, 3) for v in bb.minPoint.asArray()], [round(v, 3) for v in bb.maxPoint.asArray()])
    # top outer edge R4
    topf = [f for f in body.faces if f.geometry.surfaceType == adsk.core.SurfaceTypes.PlaneSurfaceType and
            abs(f.boundingBox.minPoint.z - 1.7) < 1e-3 and abs(f.boundingBox.maxPoint.z - 1.7) < 1e-3][0]
    ec = adsk.core.ObjectCollection.create()
    for e in topf.edges:
        ec.add(e)
    fi = c.features.filletFeatures.createInput()
    fi.addConstantRadiusEdgeSet(ec, VI.createByReal(0.4), True)
    c.features.filletFeatures.add(fi)
    body = c.bRepBodies.item(0)
    env = tbm.copy(body)                                  # outer envelope (for clipping bosses)
    botf = [f for f in body.faces if f.geometry.surfaceType == adsk.core.SurfaceTypes.PlaneSurfaceType and
            abs(f.boundingBox.minPoint.z + 4.55) < 1e-3 and abs(f.boundingBox.maxPoint.z + 4.55) < 1e-3][0]
    oc = adsk.core.ObjectCollection.create()
    oc.add(botf)
    si_ = c.features.shellFeatures.createInput(oc, False)
    si_.insideThickness = VI.createByReal(0.08)
    c.features.shellFeatures.add(si_)
    body = c.bRepBodies.item(0)
    tb = tbm.copy(body)
    body.deleteMe()
    print('shell vol cm3', round(tb.volume, 2))

    def clip(t):
        return I(t, tbm.copy(env))
    # --- standoff bosses to the mount faces (4 per half-pair): D8, from |lz|=23 to the outer wall
    holes = []
    for sx in (27.0, -27.0):
        for s in (1, -1):
            U(tb, clip(nc.cylz(sx, -22.5, s * 23.0, s * (ht(sx) + 1.5), 4.0)))
            holes.append(nc.cylz(sx, -22.5, s * 22.0, s * (ht(sx) + 2.0), 1.7))
    # --- seam posts (inboard half carries the insert, outboard half the deep counterbore), at y=-15
    for sx in (58.0, SEAM2[nc.front]):
        U(tb, clip(nc.cylz(sx, -15.0, 0.0, si * (ht(sx) + 1.5), 4.0)))
        U(tb, clip(nc.cylz(sx, -15.0, 0.0, so * (ht(sx) + 1.5), 4.5)))
        holes.append(nc.cylz(sx, -15.0, 0.0, si * 7.5, 2.1))                    # D4.2 x 7.5 insert bore from the split plane
        holes.append(nc.cylz(sx, -15.0, 0.0, so * (ht(sx) + 2.0), 1.7))         # D3.4 through
        holes.append(nc.cylz(sx, -15.0, so * 5.0, so * (ht(sx) + 2.0), 3.1))    # D6.2 deep counterbore, head seat at 5 mm
    # --- lid underside boss with 5 magnet pockets (az -30..30 step 15, r=31) and the reed slot at az 180
    ring = D(nc.cyly(0, 0, 12.4, 16.6, 36.5), nc.cyly(0, 0, 12.0, 17.0, 26.5))
    U(tb, clip(I(tbm.copy(ring), nc.bx(15, 45, 12.0, 17.0, -20, 20))))
    U(tb, clip(I(ring, nc.bx(-45, -15, 12.0, 17.0, -11, 11))))
    for az in (-30, -15, 0, 15, 30):
        a = math.radians(az)
        holes.append(nc.cyly(31.0 * math.cos(a), 31.0 * math.sin(a), 13.3, 17.5, 3.25))
    holes.append(nc.bx(-32.3, -29.7, 12.3, 16.2, -8.0, 8.0))                    # reed slot 2.6 x 16, open underneath
    # --- lid hole, boom bore, cooling exit and wire slot
    holes.append(nc.cyly(0, 0, 12.0, 18.0, 25.5))
    holes.append(nc.cylx(-30.0, 0, -130.0, 80.0, 12.9))
    tl = TAIL[nc.front]
    holes.append(nc.bx(tl - 2.0, tl + 2.0, -13.0, 12.0, -12.0, 12.0))               # cooling exit in the tail end
    holes.append(nc.bx(tl - 2.0, tl + 2.0, -40.5, -35.5, si * 7.0, si * 14.9))      # 8 x 5 wire slot (tail, all four rotors)
    for h in holes:
        D(tb, h)
    print('features done vol cm3', round(tb.volume, 2))
    # --- split on the rotor plane
    for nm, s in (('In', si), ('Out', so)):
        half = I(tbm.copy(tb), nc.bx(-140.0, 100.0, -60.0, 30.0, 0.0, s * 40.0))
        new_body(c, half, 'Lift_Nacelle_%s_%s' % (k, nm), ORANGE)
    sk.isVisible = False
    pl.isLightBulbOn = False
    for b in c.bRepBodies:
        bb = b.boundingBox
        print(b.name, round(b.volume, 2), [round(v * 10, 1) for v in bb.minPoint.asArray()], [round(v * 10, 1) for v in bb.maxPoint.asArray()], 'solid', b.isSolid)


# ================================================================ STEP 3: nacelle fasteners HW-A3-01 (ISO 7380 M3x10) + HW-A3-02 (heat-set inserts) per side
BRASS = [0.80, 0.62, 0.25]


def step_fasteners(side):
    guard()
    ks = ('L1', 'L4') if side == 'R' else ('L3', 'L2')
    occ, c = new_comp('J-A3-01 Lift_Nacelle - Motor_Mount 4 x M3x10 into inserts + 2 seam screws per rotor [%s]' % side)
    n1 = n2 = 0
    for k in ks:
        nc = NC(k)
        si, so = nc.si, nc.so
        for sx in (27.0, -27.0):
            for s in (1, -1):
                a = V3.create(-s, 0, 0)
                n1 += 1
                new_body(c, screw(nc.p(sx, -22.5, s * ht(sx)), a, 0.3, 1.0, 0.57, 0.165, 2.0), 'HW-A3-01_%d ISO 7380-1 M3x10 A2 (%s mount %+d)' % (n1, k, s), STEEL, True)
                n2 += 1
                new_body(c, insert_tube(nc.p(sx, -22.5, s * 23.0), a), 'HW-A3-02_%d M3x5.7 brass heat-set insert (%s Motor_Mount)' % (n2, k), BRASS)
        for sx in (58.0, SEAM2[nc.front]):
            n1 += 1
            new_body(c, screw(nc.p(sx, -15.0, so * 5.0), V3.create(-so, 0, 0), 0.3, 1.0, 0.57, 0.165, 2.0), 'HW-A3-01_%d ISO 7380-1 M3x10 A2 (%s seam)' % (n1, k), STEEL, True)
            n2 += 1
            new_body(c, insert_tube(nc.p(sx, -15.0, 0.0), V3.create(si, 0, 0)), 'HW-A3-02_%d M3x5.7 brass heat-set insert (%s nacelle seam)' % (n2, k), BRASS)
    print(side, 'screws', n1, 'inserts', n2)


# ================================================================ STEP 4: rotating hub cap + 2 rotating magnets + 4 M3x16 screws, inside the existing Lift_Prop_Lk component
def circ_edges(body, r_cm, z_cm, tol=0.004):
    out = []
    for e in body.edges:
        try:
            g = adsk.core.Circle3D.cast(e.geometry)
            if g and abs(g.radius - r_cm) < tol and abs(g.center.z - z_cm) < tol:
                out.append(e)
        except Exception:
            pass
    return out


def step_cap(k):
    guard()
    nc = NC(k)
    xm, zm = nc.xm, nc.zm
    po = occ_named('Lift_Prop_%s:' % k)
    c = po.component
    # 1 remove the supplied HW-033 M3x12 holding-plate screws (replaced by M3x16)
    gone = 0
    for b in list(c.bRepBodies):
        if b.name.startswith('HW-033'):
            b.deleteMe()
            gone += 1
    # 2 revolve the cap profile (r mm, y mm abs) about the rotor axis
    pi = c.constructionPlanes.createInput()
    pi.setByOffset(c.yZConstructionPlane, VI.createByReal(zm * 100.0))
    pl = c.constructionPlanes.add(pi)
    sk = c.sketches.add(pl)
    sk.name = 'cap profile'

    def sp(r, y):
        return sk.modelToSketchSpace(P3.create(zm * 100.0, xm * 100.0 + r / 10.0, y / 10.0))
    # DEVIATION: neck radius 16.0 (spec 14.0): the D28 holding plate (r=14, y 37.8..39.8) cannot sit inside a 1.2 mm wall on r=14
    prof = [(26.5, 18.5), (26.5, 24.0), (16.0, 39.8), (16.0, 42.8), (0.0, 42.8), (0.0, 39.8), (14.56, 39.8), (25.3, 23.64), (25.3, 18.5)]
    ln = sk.sketchCurves.sketchLines
    prev = None
    first = None
    for i in range(len(prof)):
        a = prof[i]
        b = prof[(i + 1) % len(prof)]
        if i == 0:
            l = ln.addByTwoPoints(sp(*a), sp(*b))
            first = l
        elif i == len(prof) - 1:
            l = ln.addByTwoPoints(prev.endSketchPoint, first.startSketchPoint)
        else:
            l = ln.addByTwoPoints(prev.endSketchPoint, sp(*b))
        prev = l
    axis = ln.addByTwoPoints(sp(0.0, 17.0), sp(0.0, 44.0))
    axis.isConstruction = True
    rp = None
    for p in sk.profiles:
        rp = p if rp is None or p.areaProperties().area > rp.areaProperties().area else rp
    ri = c.features.revolveFeatures.createInput(rp, axis, adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
    ri.setAngleExtent(False, VI.createByString('360 deg'))
    rv = c.features.revolveFeatures.add(ri)
    cap = rv.bodies.item(0)
    cap.name = 'Lift_Cap_' + k
    capname = cap.name
    # 3 fillets R5 (shoulder) and R2 (top edge)
    for r, y, fr in ((26.5, 24.0, 0.5), (16.0, 42.8, 0.2)):
        try:
            cap = [b for b in c.bRepBodies if b.name == capname][0]
            es = circ_edges(cap, r / 10.0, y / 10.0)
            ec = adsk.core.ObjectCollection.create()
            for e in es:
                ec.add(e)
            fi = c.features.filletFeatures.createInput()
            fi.addConstantRadiusEdgeSet(ec, VI.createByReal(fr), True)
            c.features.filletFeatures.add(fi)
        except Exception:
            print('fillet R%s skipped: %s' % (fr, traceback.format_exc().splitlines()[-1]))
    cap = [b for b in c.bRepBodies if b.name == capname][0]
    # 4 ears (join), then slots / inlets / holes / pockets (cut)
    ears = []
    for s in (1, -1):
        e = I(nc.bx(s * 25.9 if s > 0 else -34.5, 34.5 if s > 0 else -25.9, 18.5, 22.7, -8.0, 8.0), nc.cyly(0, 0, 18.0, 23.0, 34.5))
        ears.append(e)
    cut_bodies(c, cap, ears, join=True)
    cap = [b for b in c.bRepBodies if b.name == capname][0]
    tools = [nc.bx(14.0, 45.0, 22.8, 36.5, -12.0, 12.0), nc.bx(-45.0, -14.0, 22.8, 36.5, -12.0, 12.0)]       # blade slots
    for az in (45, 135, 225, 315):                                                                           # cooling inlets
        a = math.radians(az)
        cen = nc.p(22.5 * math.cos(a), 30.0, 22.5 * math.sin(a))
        tools.append(tbm.createBox(adsk.core.OrientedBoundingBox3D.create(cen, V3.create(math.sin(a), math.cos(a), 0), V3.create(math.cos(a), -math.sin(a), 0), 1.4, 0.4, 1.0)))
    for sx in (5.657, -5.657):                                                                               # plate holes D3.4, cbore D6.2 x 1.8
        for sz in (5.657, -5.657):
            tools.append(nc.cyly(sx, sz, 39.0, 43.5, 1.7))
            tools.append(nc.cyly(sx, sz, 41.0, 43.5, 3.1))
    tools.append(nc.cyly(0, 0, 39.7, 41.3, 4.8))                                                             # relief for the motor shaft end (r=4, y to 41.0)
    tools.append(nc.cyly(31.0, 0, 18.4, 22.7 - 0.5, 3.25))                                                   # ear magnet pockets (3.7 deep: magnet 3.17 + 0.5 recess)
    tools.append(nc.cyly(-31.0, 0, 18.4, 22.7 - 0.5, 3.25))
    cut_bodies(c, cap, tools)
    cap = [b for b in c.bRepBodies if b.name == capname][0]
    cap.appearance = appearance(ORANGE)
    # 5 rotating magnets (pole down = S), 6 M3x16
    new_body(c, nc.cyly(31.0, 0, 19.0, 22.175, 3.175), 'Magnet_Rot_%s_A' % k, MAGC)
    new_body(c, nc.cyly(-31.0, 0, 19.0, 22.175, 3.175), 'Magnet_Rot_%s_B' % k, MAGC)
    n = 0
    for sx in (5.657, -5.657):
        for sz in (5.657, -5.657):
            n += 1
            new_body(c, screw(nc.p(sx, 41.0, sz), V3.create(0, 0, -1), 0.3, 1.6, 0.57, 0.165, 2.0), 'HW-A3-03_%d ISO 7380-1 M3x16 A2 (%s cap)' % (n, k), STEEL, True)
    sk.isVisible = False
    pl.isLightBulbOn = False
    bb = cap.boundingBox
    print(k, 'removed HW-033', gone, 'cap vol', round(cap.volume, 3), [round(v * 10, 1) for v in bb.minPoint.asArray()], [round(v * 10, 1) for v in bb.maxPoint.asArray()], cap.isSolid)


# ================================================================ STEP 5: phase-2 reed switch + fixed detent magnet + wiring (ride with the nacelle), ladder resistors
def polyline(pts, r):
    body = None
    for i in range(len(pts) - 1):
        s = seg(pts[i], pts[i + 1], r)
        body = s if body is None else U(body, s)
    for p in pts[1:-1]:
        U(body, tbm.createSphere(p, r))
    return body


def step_reed(k):
    guard()
    nc = NC(k)
    si, so = nc.si, nc.so
    occ = [o for o in root().occurrences if o.component.name == 'Lift_Nacelle_' + k][0]
    c = occ.component
    # fixed detent magnet (pole up = N) in the lid pocket at azimuth 0, base y=13.3
    new_body(c, nc.cyly(31.0, 0, 13.3, 16.475, 3.175), 'Magnet_Fix_' + k, MAGC)
    # reed: glass body D2.28 x 15.24 along Z at az 180, plus two 12.6 mm leads (1.59 in overall incl. leads is EST)
    r = nc.cylz(-31.0, 15.0, -7.62, 7.62, 1.14)
    U(r, nc.cylz(-31.0, 15.0, 7.62, 20.22, 0.25))
    U(r, nc.cylz(-31.0, 15.0, -7.62, -20.22, 0.25))
    new_body(c, r, 'Reed_' + k, GLASS)
    # 26 AWG silicone pair (D1.0 mm): both leave through the 8 x 5 wire slot at the tail on the inboard side
    def P(lx, y, lz):
        return nc.p(lx, y, lz)
    if nc.front:      # tail at -66.5, Gear_Clamp starts at -73: wires stop 4.5 mm past the tail (service loop to the harness not modelled)
        wa = [P(-31, 15, si * 20.2), P(-45, 15, si * 20.2), P(-45, -38, si * 20.2), P(-56, -38, si * 17.0), P(-66.5, -38, si * 13.6), P(-71, -38, si * 13.6)]
        wb = [P(-31, 15, so * 20.2), P(-45, 15, so * 20.2), P(-45, 15, si * 16.0), P(-45, -38, si * 16.0), P(-56, -38, si * 14.0), P(-66.5, -38, si * 11.6), P(-71, -38, si * 11.6)]
    else:
        wa = [P(-31, 15, si * 20.2), P(-45, 15, si * 20.2), P(-45, -38, si * 20.2), P(-70, -38, si * 17.6), P(-100, -38, si * 13.6), P(-150, -38, si * 13.6)]
        wb = [P(-31, 15, so * 20.2), P(-45, 15, so * 20.2), P(-45, 15, si * 16.0), P(-45, -38, si * 16.0), P(-70, -38, si * 14.0), P(-100, -38, si * 11.6), P(-150, -38, si * 11.6)]
    new_body(c, polyline(wa, 0.05), 'Reed_Wire_%s_A' % k, [0.85, 0.1, 0.1])
    new_body(c, polyline(wb, 0.05), 'Reed_Wire_%s_B' % k, [0.12, 0.12, 0.12])
    print(k, 'reed + magnet + wires', [b.name for b in c.bRepBodies])


def step_ladder():
    guard()
    occ, c = new_comp('Reed_Ladder_R')
    # one 40 x 10 x 1.6 perfboard strip (EST) below the FC stack with the four 2.2 k resistors of the reed ladder (geometry.json Ladder_R_L1..4)
    ctr = pt((0.25, -0.0201 - 0.0, 0.022))
    obb = adsk.core.OrientedBoundingBox3D.create(ctr, V3.create(1, 0, 0), V3.create(0, 1, 0), 4.0, 1.0, 0.16)
    new_body(c, tbm.createBox(obb), 'Perfboard_strip 40x10x1.6 (EST)', [0.12, 0.35, 0.2])
    for i, k in enumerate(('L1', 'L2', 'L3', 'L4')):
        z = 0.010 + 0.008 * i
        a = V3.create(0, 1, 0)       # model X
        p0 = pt((0.25 - 0.0063 / 2, -0.018, z))
        new_body(c, cyl(p0, a, 0.125, 0.63), 'Ladder_R_%s 2.2k 1/4 W' % k, [0.82, 0.7, 0.5])
    print('ladder bodies', c.bRepBodies.count)


# ================================================================ STEP 6: add the new fixed occurrences to the existing rigid groups (right wing, left wing, pod)
def step_groups():
    guard()
    r = root()
    nj, nrg = r.joints.count, r.rigidGroups.count
    new = {'WR': [], 'WL': [], 'POD': []}
    for o in r.occurrences:
        n = o.component.name
        if n in ('Lift_Nacelle_L1', 'Lift_Nacelle_L4') or n.startswith('J-A3-01') and n.endswith('[R]'):
            new['WR'].append(o)
        elif n in ('Lift_Nacelle_L3', 'Lift_Nacelle_L2') or n.startswith('J-A3-01') and n.endswith('[L]'):
            new['WL'].append(o)
        elif n == 'Reed_Ladder_R':
            new['POD'].append(o)
    pick = {'WR': 'RG Right wing', 'WL': 'RG Left wing', 'POD': 'RG Pod'}
    for g, lst in new.items():
        rg = [x for x in r.rigidGroups if x.name.startswith(pick[g])][0]
        have = [o for o in rg.occurrences]
        names = set(o.name for o in have)
        coll = adsk.core.ObjectCollection.create()
        for o in have:
            coll.add(o)
        for o in lst:
            if o.name not in names:
                coll.add(o)
            set_key(o, 'a3:' + o.component.name, g)
        nm = rg.name
        snap = {o.name: o.boundingBox.minPoint.asArray() for o in r.occurrences}
        rg.deleteMe()
        ng = r.rigidGroups.add(coll, False)
        ng.name = nm
        worst = 0.0
        for o in r.occurrences:
            a = o.boundingBox.minPoint.asArray()
            if o.name in snap:
                worst = max(worst, max(abs(a[i] - snap[o.name][i]) for i in range(3)))
        print(g, 'group now', ng.occurrences.count, 'added', len(lst), 'max shift cm', round(worst, 6))
    print('joints', nj, '->', r.joints.count, 'rigid groups', nrg, '->', r.rigidGroups.count)


# ================================================================ STEP 7: static interference of new/changed bodies vs their neighbours (per rotor)
NEWP = ('Lift_Nacelle', 'Lift_Cap', 'Magnet_', 'Reed_', 'HW-A3', 'Perfboard', 'Ladder_R')


def is_new(b):
    return b.name.startswith(NEWP)


def step_check(k, vmin=1e-4):
    guard()
    nc = NC(k)
    r = root()
    des = design()
    lo = [nc.zm * 100 - 6.5, nc.xm * 100 - 13.0, -6.0]
    hi = [nc.zm * 100 + 6.5, nc.xm * 100 + 9.0, 5.0]
    bodies = []
    for o in r.allOccurrences:
        for b in o.bRepBodies:
            bb = b.boundingBox
            a, z = bb.minPoint.asArray(), bb.maxPoint.asArray()
            if all(z[i] >= lo[i] and a[i] <= hi[i] for i in range(3)):
                bodies.append(b)
    col = adsk.core.ObjectCollection.create()
    for b in bodies:
        col.add(b)
    inp = des.createInterferenceInput(col)
    res = des.analyzeInterference(inp)
    out = []
    for x in res:
        v = x.interferenceBody.volume
        if v < vmin:
            continue
        a, b = x.entityOne, x.entityTwo
        if not (is_new(a) or is_new(b)):
            continue
        na, nb = a.name, b.name
        # intentional overlaps: heat-set inserts press into their bores / screw threads; M3x16 shanks pass through the (unmodelled) holes of the plate, adapter and motor-boss envelope
        if na.startswith('HW-A3-02') or nb.startswith('HW-A3-02'):
            continue
        if (na.startswith('HW-A3-03') and nb.startswith(('HW-032', 'HW-031', 'Lift_Motor', 'Lift_Prop'))) or (nb.startswith('HW-A3-03') and na.startswith(('HW-032', 'HW-031', 'Lift_Motor', 'Lift_Prop'))):
            continue
        out.append((round(v, 5), na[:44], nb[:44]))
    out.sort(reverse=True)
    print(k, 'bodies', len(bodies), 'interferences involving new parts', len(out))
    for o in out[:40]:
        print('  ', o)


# ================================================================ STEP 8: sweep the prop/cap revolute joint through 360 deg and check rotating vs static interference
def step_sweep(k, step=30, vmin=2e-4):
    guard()
    nc = NC(k)
    r = root()
    des = design()
    jn = 'Rev Lift_Prop_%s motor axis' % k
    j = [x for x in r.joints if x.name == jn][0]
    m = j.jointMotion
    lo = [nc.zm * 100 - 6.5, nc.xm * 100 - 13.0, -6.0]
    hi = [nc.zm * 100 + 6.5, nc.xm * 100 + 9.0, 5.0]
    worst = {}
    a0 = m.rotationValue
    for deg in range(0, 360, step):
        m.rotationValue = math.radians(deg)
        bodies = []
        for o in r.allOccurrences:
            for b in o.bRepBodies:
                bb = b.boundingBox
                a, z = bb.minPoint.asArray(), bb.maxPoint.asArray()
                if all(z[i] >= lo[i] and a[i] <= hi[i] for i in range(3)):
                    bodies.append(b)
        col = adsk.core.ObjectCollection.create()
        for b in bodies:
            col.add(b)
        res = des.analyzeInterference(des.createInterferenceInput(col))
        for x in res:
            v = x.interferenceBody.volume
            if v < vmin:
                continue
            a, b = x.entityOne, x.entityTwo
            ra = a.assemblyContext is not None and a.assemblyContext.name.startswith('Lift_Prop_' + k)
            rb = b.assemblyContext is not None and b.assemblyContext.name.startswith('Lift_Prop_' + k)
            if ra == rb:
                continue
            if not (is_new(a) or is_new(b)):
                continue
            na, nb = a.name, b.name
            if na.startswith('HW-A3-02') or nb.startswith('HW-A3-02'):
                continue
            key = (na[:40], nb[:40])
            worst[key] = max(worst.get(key, (0, 0)), (round(v, 5), deg))
    m.rotationValue = a0
    print(k, 'sweep', step, 'deg steps; rotating-vs-static overlaps:', len(worst))
    for kk, vv in sorted(worst.items(), key=lambda t: -t[1][0])[:25]:
        print('  ', kk, vv)


# ================================================================ STEP 9: export new / changed bodies as world-Fusion-cm Z-up binary STL + variant_manifest.json
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
    r = root()
    U_ = []      # (name, group, bodies, color, extra)
    ridesR = 'slide_panel_R'
    ridesL = 'slide_panel_L'

    def rides(bodies):
        cx = sum((b.boundingBox.minPoint.x + b.boundingBox.maxPoint.x) / 2 for b in bodies) / len(bodies)
        return ridesR if cx > 0 else ridesL
    mm = 0
    for o in r.occurrences:
        cn = o.component.name
        if cn == 'Motor_Mount':
            mm += 1
            bl = list(o.bRepBodies)
            U_.append(('Motor_Mount_%d' % mm, 'printed', bl, [0.118, 0.125, 0.157], {'rides': rides(bl), 'changed': 'insert bores'}))
        elif cn.startswith('Lift_Nacelle_L'):
            k = cn[-2:]
            bl = list(o.bRepBodies)
            sel = lambda pre: [b for b in bl if b.name.startswith(pre)]
            rd = rides(bl)
            U_.append((cn, 'printed', sel('Lift_Nacelle_'), ORANGE, {'rides': rd}))
            U_.append(('Magnet_Fix_' + k, 'hardware', sel('Magnet_Fix'), MAGC, {'rides': rd}))
            U_.append(('Reed_' + k, 'electronics', sel('Reed_' + k), GLASS, {'rides': rd}))
            U_.append(('Reed_Wire_' + k, 'electronics', sel('Reed_Wire'), [0.85, 0.1, 0.1], {'rides': rd}))
        elif cn.startswith('J-A3-01'):
            side = cn[-2]
            bl = list(o.bRepBodies)
            U_.append(('J-A3-01_Lift_Nacelle_Motor_Mount_' + side, 'hardware', bl, STEEL, {'joint': 'J-A3-01', 'rides': rides(bl)}))
        elif cn.startswith('Lift_Prop_L'):
            k = cn[-2:]
            bl = list(o.bRepBodies)
            sel = lambda pre: [b for b in bl if b.name.startswith(pre)]
            newn = ('Lift_Cap', 'Magnet_Rot', 'HW-A3-03')
            base = [b for b in bl if not b.name.startswith(newn)]
            rd = rides(bl)
            U_.append((cn, 'propulsion', base, [0.059, 0.059, 0.067], {'moving': 'prop_' + k, 'rides': rd, 'changed': 'HW-033 M3x12 removed'}))
            U_.append(('Lift_Cap_' + k, 'printed', sel('Lift_Cap'), ORANGE, {'moving': 'cap_' + k, 'rides': rd}))
            U_.append(('Magnet_Rot_' + k, 'hardware', sel('Magnet_Rot'), MAGC, {'moving': 'cap_' + k, 'rides': rd}))
            U_.append(('HW-A3-03_Cap_screws_' + k, 'hardware', sel('HW-A3-03'), STEEL, {'joint': 'J-A3-02', 'moving': 'cap_' + k, 'rides': rd}))
        elif cn == 'Reed_Ladder_R':
            U_.append((cn, 'electronics', list(o.bRepBodies), [0.82, 0.7, 0.5], {}))
    return U_


def step_export():
    guard()
    os.makedirs(BASE + 'stl', exist_ok=True)
    os.makedirs(BASE + 'kinematics', exist_ok=True)
    ents = []
    bad = []
    for nm, g, bl, col, ex in export_units():
        if not bl:
            continue
        sub = 'kinematics' if ex.get('moving') else 'stl'
        fn = re.sub(r'[^A-Za-z0-9_\-]', '_', nm)
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
    hide = ['Motor_Mount_%d' % i for i in (1, 2, 3, 4)] + ['Lift_Prop_L%d' % i for i in (1, 2, 3, 4)]
    moving = []
    for k in ('L1', 'L3', 'L4', 'L2'):
        xm, zm, f, sg = ROT[k]
        moving.append({'id': 'cap_' + k, 'kind': 'revolute', 'parent': 'slide_panel_R' if zm > 0 else 'slide_panel_L',
                       'pivot_m': [xm, 0.03, zm], 'axis_m': [0, 1, 0], 'limits': None,
                       'note': 'same physical axis as prop_%s: cap, 2 rotating magnets and 4 M3x16 screws turn with the prop' % k})
    man = {'id': 'a3', 'doc': DOC,
           'axis_note': 'STL coordinates are Fusion world cm, Z-up (world-transformed, written from the B-rep mesh calculator; no further transform needed). Model X fwd = Fusion +Y, model Y up = Fusion +Z, model Z right = Fusion +X. i.e. model (x,y,z) m -> Fusion (z,x,y)*100 cm.',
           'units': 'cm', 'hide': hide, 'entries': ents, 'moving': moving}
    json.dump(man, open(BASE + 'variant_manifest.json', 'w'), indent=1)
    print(len(ents), 'entries', sum(e['size'] for e in ents), 'bytes', sum(e['count'] for e in ents), 'bodies; bad', bad)


def step_cad_files():
    guard()
    des = design()
    em = des.exportManager
    so = em.createSTEPExportOptions(BASE + 'a3.step')
    em.execute(so)
    fo = em.createFusionArchiveExportOptions(BASE + 'a3.f3d')
    em.execute(fo)
    print('step', os.path.getsize(BASE + 'a3.step'), 'f3d', os.path.getsize(BASE + 'a3.f3d'))


# ================================================================ STEP 10: renders (construction points / joint origins hidden)
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
         'detail_nacelle': ((70.0, 8.0, 16.0), (40.5, 33.0, -2.0), (0, 0, 1))}


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


# ================================================================ driver (each step is run in its own short script in practice)
def build_all():
    """Order used for the delivered model.  Run on a copy of C0 saved as DOC (never on C0)."""
    step_mount()
    for k in ('L1', 'L3', 'L4', 'L2'):
        step_nacelle(k)
        step_reed(k)
    step_fasteners('R')
    step_fasteners('L')
    for k in ('L1', 'L3', 'L4', 'L2'):
        step_cap(k)
    step_ladder()
    step_groups()
    # checks / outputs: step_check(k), step_sweep(k, 45), step_export(), step_cad_files(), step_render(view)


def run(context):
    try:
        build_all()
    except Exception:
        print(traceback.format_exc())
