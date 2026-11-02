"""Detail stage for the Lift + Cruise VTOL Fusion model (task 28): every fastener, servo, linkage, hinge, wheel and
the toleranced holes of the printed parts.  Rebuilds from fusion/hardware_rev2_compact.json (made by
make_hardware_rev2_compact.py from inventory/hardware/hardware.json rev 2 + mechanisms.json).

Run inside the design that already holds the airframe (build_vtol_fusion.py).  Phases (call phase(name, ...)):
  prep   - delete old Hardware joints / Proposed_Wheels, hide duplicated CAD stand-ins, suppress the leg dome foot
  hw     - Hardware component, one sub per joint (J-14/J-15 go to Wheel_Gear), all pieces as TemporaryBRep bodies in
           one BaseFeature per joint, printed plates with their holes cut in the B-rep stage
  gear   - Wheel_Gear component, one sub per leg (axle block, axle, collars, washers, nyloc, wheel, cross bolts)
  hinge  - hinge gaps (aileron 4.77, elevator 3.5, rudder 4.0) + servo pockets cut in the foam, hinge tape strips
  cuts   - CombineFeature cuts in the airframe components (bore rings 25.0, split gaps, clearance holes, counterbores,
           insert bores 4.2 x 7.5, nut traps, cross holes in tubes)
Axis mapping: model (x fwd, y up, z right) metres -> Fusion (z, x, y) * 100 cm.  Dimensions in the data are mm.
Estimates are marked est in the data; unknowns are not invented (no value is made up beyond the rules in
inventory/hardware/tolerances.json).
"""
import adsk.core, adsk.fusion, traceback, json, math, os, re

app = adsk.core.Application.get()
P3 = adsk.core.Point3D
V3 = adsk.core.Vector3D
M3 = adsk.core.Matrix3D
tbm = adsk.fusion.TemporaryBRepManager.get()
BT = adsk.fusion.BooleanTypes
MM = 0.1  # mm -> cm
EXPORT = r'C:\Users\trist\Documents\DBF-Fusion-Export'
STATS = {}
ERRS = []


def count(k, n=1):
    STATS[k] = STATS.get(k, 0) + n


# ---------------------------------------------------------------- vectors / frames
def pt(m):
    return P3.create(m[2] * 100.0, m[0] * 100.0, m[1] * 100.0)


def vec(m):
    v = V3.create(m[2], m[0], m[1])
    v.normalize()
    return v


def add(p, v, d):
    return P3.create(p.x + v.x * d, p.y + v.y * d, p.z + v.z * d)


def neg(v):
    return V3.create(-v.x, -v.y, -v.z)


def vlin(a, ka, b, kb):
    return V3.create(a.x * ka + b.x * kb, a.y * ka + b.y * kb, a.z * ka + b.z * kb)


EXF, EYF, EZF = vec([1, 0, 0]), vec([0, 1, 0]), vec([0, 0, 1])  # model x/y/z in Fusion space


def basis(a, u=None):
    """(U, V, W): W = a, U = u made perpendicular to a (or an automatic perpendicular), V = W x U."""
    W = V3.create(a.x, a.y, a.z)
    W.normalize()
    if u is not None:
        k = W.dotProduct(u)
        U = V3.create(u.x - W.x * k, u.y - W.y * k, u.z - W.z * k)
        if U.length > 1e-6:
            U.normalize()
        else:
            u = None
    if u is None:
        best = None
        for h in ((0, 1, 0), (0, 0, 1), (1, 0, 0)):
            hv = V3.create(*h)
            dp = abs(hv.dotProduct(W))
            if best is None or dp < best[0]:
                best = (dp, hv)
        hv = best[1]
        k = hv.dotProduct(W)
        U = V3.create(hv.x - W.x * k, hv.y - W.y * k, hv.z - W.z * k)
        U.normalize()
    Vv = W.crossProduct(U)
    Vv.normalize()
    return U, Vv, W


def rot(u, v, ang):
    c, s = math.cos(ang), math.sin(ang)
    r = V3.create(u.x * c + v.x * s, u.y * c + v.y * s, u.z * c + v.z * s)
    r.normalize()
    return r


# ---------------------------------------------------------------- solids (all cm, world space)
def U_(a, b):
    tbm.booleanOperation(a, b, BT.UnionBooleanType)
    return a


def D_(a, b):
    tbm.booleanOperation(a, b, BT.DifferenceBooleanType)
    return a


def I_(a, b):
    tbm.booleanOperation(a, b, BT.IntersectionBooleanType)
    return a


def cyl(c, a, r, h, off=0.0):
    p0 = add(c, a, off)
    return tbm.createCylinderOrCone(p0, r, add(p0, a, h), r)


def cone(c, a, r0, r1, h, off=0.0):
    p0 = add(c, a, off)
    return tbm.createCylinderOrCone(p0, r0, add(p0, a, h), max(r1, 1e-4))


def box(c, d1, d2, l1, l2, l3):
    return tbm.createBox(adsk.core.OrientedBoundingBox3D.create(c, d1, d2, l1, l2, l3))


def mbox(cm, dx, dy, dz):
    """axis aligned box, centre in model metres, sizes in mm along model x, y, z."""
    return box(pt(cm), EXF, EYF, dx * MM, dy * MM, dz * MM)


def mrange(x0, x1, y0, y1, z0, z1):
    x0, x1, y0, y1, z0, z1 = min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1), min(z0, z1), max(z0, z1)
    return mbox([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], (x1 - x0) * 1000, (y1 - y0) * 1000, (z1 - z0) * 1000)


def tube(c, a, ro, ri, h, off=0.0):
    o = cyl(c, a, ro, h, off)
    if ri > 0:
        D_(o, cyl(c, a, ri, h + 0.2, off - 0.1))
    return o


def polyprism(c, a, af, h, n=6, bore=0.0):
    """n-sided prism (n even) centred on c, axis a, across flats af, height h, optional bore radius (cm)."""
    U, Vv, W = basis(a)
    body = None
    for k in range(n // 2):
        d = rot(U, Vv, k * 2 * math.pi / n)
        e = a.crossProduct(d)
        e.normalize()
        slab = box(c, d, e, af * 3.0, af, h)
        body = slab if body is None else I_(body, slab)
    if bore > 0:
        D_(body, cyl(c, a, bore, h + 0.2, -h / 2 - 0.1))
    return body


def rrect(c, d1, d2, A, B, r, h):
    """rounded rectangle prism: size A along d1, B along d2, corner radius r, height h along d1 x d2 (centred)."""
    n = d1.crossProduct(d2)
    n.normalize()
    r = min(r, A / 2 - 0.01, B / 2 - 0.01)
    body = box(c, d1, d2, A - 2 * r, B, h)
    U_(body, box(c, d1, d2, A, B - 2 * r, h))
    for sx in (-1, 1):
        for sy in (-1, 1):
            cc = add(add(c, d1, sx * (A / 2 - r)), d2, sy * (B / 2 - r))
            U_(body, cyl(cc, n, r, h, -h / 2))
    return body


def ring_rect(c, d1, d2, A, B, r, w, t):
    o = rrect(c, d1, d2, A, B, r, w)
    return D_(o, rrect(c, d1, d2, A - 2 * t, B - 2 * t, max(r - t, 0.02), w + 0.2))


def msize(spec, default=3.0):
    m = re.search(r'M(\d+(?:\.\d+)?)', spec)
    return float(m.group(1)) if m else default


def bb_list(b):
    bb = b.boundingBox
    return (bb.minPoint.x, bb.minPoint.y, bb.minPoint.z, bb.maxPoint.x, bb.maxPoint.y, bb.maxPoint.z)


def bb_overlap(a, b, pad=0.0):
    return not (a[3] < b[0] - pad or b[3] < a[0] - pad or a[4] < b[1] - pad or b[4] < a[1] - pad or
                a[5] < b[2] - pad or b[5] < a[2] - pad)


def inside(body, p):
    try:
        return body.pointContainment(p) == adsk.fusion.PointContainment.PointInsidePointContainment
    except Exception:
        return False


# ---------------------------------------------------------------- data
def load_data():
    cands = []
    try:
        cands.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hardware_rev2_compact.json'))
    except Exception:
        pass
    cands.append(os.path.join(EXPORT, 'hardware_rev2_compact.json'))
    for p in cands:
        if os.path.exists(p):
            return json.load(open(p))
    raise RuntimeError('hardware_rev2_compact.json not found')


FOIL_UP = [(-0.2387, 0.000375), (-0.238054, 0.000533), (-0.236122, 0.001001), (-0.232923, 0.001764), (-0.22849, 0.002797),
           (-0.222868, 0.00407), (-0.216116, 0.005543), (-0.208303, 0.007175), (-0.199511, 0.008922), (-0.189833, 0.010736),
           (-0.179373, 0.012571), (-0.168241, 0.01438), (-0.15656, 0.016117), (-0.144455, 0.017736), (-0.132061, 0.01919),
           (-0.119513, 0.020434), (-0.106952, 0.021427), (-0.094509, 0.022129), (-0.082218, 0.022457), (-0.070336, 0.022354)]


def foil_y(x):
    for (x0, y0), (x1, y1) in zip(FOIL_UP, FOIL_UP[1:]):
        if x0 <= x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return FOIL_UP[-1][1]


# ---------------------------------------------------------------- appearances
_APP = {}
_METAL = [('stainless', 'Stainless Steel - Satin'), ('a2', 'Stainless Steel - Satin'), ('steel', 'Stainless Steel - Satin'),
          ('alumin', 'Stainless Steel - Brushed Linear Long'), ('brass', 'Brass - Polished'), ('nickel', 'Brass - Polished')]


def appearance(des, col, mat=''):
    mat = (mat or '').lower()
    metal = next((n for k, n in _METAL if k in mat), '')
    key = (tuple(round(x, 2) for x in col), metal)
    ap = _APP.get(key)
    if ap:
        return ap
    nm = 'HWc_%02d%02d%02d_%s' % (tuple(int(round(x * 99)) for x in key[0]) + (metal.replace(' ', '')[:6] or 'p',))
    ap = des.appearances.itemByName(nm)
    if ap is None:
        lib = app.materialLibraries.itemByName('Fusion Appearance Library')
        base = None
        for bn in ([metal] if metal else []) + ['Plastic - Matte (White)']:
            if bn:
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
    _APP[key] = ap
    return ap


NYLON = (0.93, 0.91, 0.80)

# ---------------------------------------------------------------- context (assembly lookups)


class Ctx:
    def __init__(self, data):
        self.data = data
        self.des = adsk.fusion.Design.cast(app.activeProduct)
        self.root = self.des.rootComponent
        self.items = {i['id']: i for i in data['items']}
        self.occ = {}
        for o in self.root.allOccurrences:
            self.occ.setdefault(o.component.name, []).append(o)
        # arms and servos by parent / component for linkage geometry
        self.arm_by_par = {}
        for iid in ('HW-067', 'HW-072', 'HW-077'):
            for ins in self.items[iid]['inst']:
                self.arm_by_par[ins['par']] = ins
        self.servo_by_comp = {}
        for iid in ('HW-129', 'HW-130', 'HW-131'):
            for ins in self.items[iid]['inst']:
                self.servo_by_comp[ins['comp']] = ins
        self.horn_by_idx = {}
        # fasteners
        self.F = []
        self.W = []
        for it in data['items']:
            if it['k'] in ('screw', 'insert', 'nut', 'nyloc'):
                for i, ins in enumerate(it['inst']):
                    self.F.append({'it': it, 'ins': ins, 'k': it['k'], 'c': pt(ins['p']), 'a': vec(ins['a']), 'n': i})
            if it['k'] == 'washer':
                for ins in it['inst']:
                    self.W.append({'it': it, 'c': pt(ins['p']), 'a': vec(ins['a'])})

    def bbox(self, name):
        """world bbox (list) of the first occurrence body of a component by name."""
        o = self.occ.get(name)
        if not o:
            return None
        bb = o[0].boundingBox
        return (bb.minPoint.x, bb.minPoint.y, bb.minPoint.z, bb.maxPoint.x, bb.maxPoint.y, bb.maxPoint.z)

    def body_world(self, name, idx=0):
        o = self.occ.get(name)
        return tbm.copy(o[idx].bRepBodies.item(0)) if o else None


# ---------------------------------------------------------------- primitive interpreter (hardware.json frames)
def prim_body(origin, B, plist, letters, w_off=0.0):
    def mp(vals):
        p = origin
        for i, (l, v0) in enumerate(zip(letters, vals)):
            p = add(p, B[l], (v0 - (w_off if i == 2 else 0.0)) * MM)
        return p
    body = None
    for p in plist:
        sh = p['shape']
        if sh == 'box':
            rg = [p[l] for l in letters]
            t = box(mp([(r[0] + r[1]) / 2 for r in rg]), B[letters[0]], B[letters[1]],
                    abs(rg[0][1] - rg[0][0]) * MM, abs(rg[1][1] - rg[1][0]) * MM, abs(rg[2][1] - rg[2][0]) * MM)
        elif sh == 'cylinder':
            t = cyl(mp(p['c']), B[p['axis']], p['r'] * MM, p['len'] * MM)
        elif sh == 'hexprism':
            d = B[p['axis']]
            t = polyprism(add(mp(p['c']), d, p['len'] / 2 * MM), d, p['af'] * MM, p['len'] * MM, 6)
        elif sh == 'slot':
            ax = p['axis']
            o1, o2 = [l for l in letters if l != ax][:2]
            d = B[ax]
            t = box(add(mp(p['c']), d, p['len'] / 2 * MM), B[o1], B[o2], p['size_u'] * MM, p['size_v'] * MM, p['len'] * MM)
        else:
            continue
        if p['op'] == 'add':
            body = t if body is None else U_(body, t)
        elif body is not None:
            D_(body, t)
    return body


# ---------------------------------------------------------------- fastener hole tools (world space)
CLEAR = {2: 2.6, 2.5: 3.1, 3: 3.6, 4: 4.7, 5: 5.7}
PATTERN = ('HW-029', 'HW-036', 'HW-112')  # 4-hole patterns: M3 clearance 3.8


def washer_near(ctx, f):
    for w in ctx.W:
        d = V3.create(w['c'].x - f['c'].x, w['c'].y - f['c'].y, w['c'].z - f['c'].z)
        al = d.dotProduct(f['a'])
        lat = math.sqrt(max((d.length * d.length) - al * al, 0.0))
        if lat < 0.1 and abs(al) < 0.13:
            g = w['it']['g']
            return g['od'], g['t']
    return None


def insert_limit(ctx, f):
    """distance (cm) along the screw to the entry face of an insert that receives it, or None."""
    best = None
    for q in ctx.F:
        if q['k'] != 'insert':
            continue
        d = V3.create(q['c'].x - f['c'].x, q['c'].y - f['c'].y, q['c'].z - f['c'].z)
        al = d.dotProduct(f['a'])
        lat = math.sqrt(max((d.length * d.length) - al * al, 0.0))
        if lat < 0.08 and q['a'].dotProduct(f['a']) > 0.99 and 0 < al < f['it']['g']['L'] * MM + 0.3:
            e = al - q['it']['g']['L'] * MM / 2
            if best is None or e < best:
                best = e
    return best


def fast_tools(ctx, f):
    """list of (kind, tool body, test point or None) in world space."""
    it, g, k, c, a = f['it'], f['it']['g'], f['k'], f['c'], f['a']
    na = neg(a)
    out = []
    if k == 'screw':
        if g.get('head') in ('grub',):
            return out
        d = g['d']
        L = g['L'] * MM
        cad = g.get('cad_mm', {}).get('clear_hole')
        clear = cad or CLEAR.get(d, d + 0.6)
        if it['id'] in PATTERN:
            clear = max(clear, 3.8)
        lim = insert_limit(ctx, f)
        end = L + 0.05 if lim is None else max(lim, 0.0)
        out.append(('clear', cyl(add(c, a, -0.03), a, clear * MM / 2, end + 0.03), None))
        wsh = washer_near(ctx, f)
        hd, hh = g.get('head_d', 0), g.get('head_h', 0)
        cb = max(hd + 0.8, (wsh[0] + 0.6) if wsh else 0)
        wt = (wsh[1] * MM) if wsh else 0.0
        tp = add(c, a, wt / 2 if wsh else -hh * MM / 2)
        out.append(('cbore', cyl(add(c, a, wt), na, cb * MM / 2, wt + (hh + 5.0) * MM), tp))
    elif k == 'insert':
        ms = msize(it['spec'])
        if ms < 2.9:
            return out
        L = g['L'] * MM
        cd = g.get('cad_mm', {})
        bd, bdep = cd.get('bore_d', 4.2), cd.get('bore_depth', 7.5)
        entry = add(c, a, -L / 2 - 0.005)
        t = cyl(entry, a, bd * MM / 2, bdep * MM + 0.005)
        U_(t, cone(entry, a, bd * MM / 2 + 0.04, bd * MM / 2, 0.04, 0.0))  # 0.4 x 45 deg lead-in
        out.append(('insert', t, c))
    elif k in ('nut', 'nyloc'):
        cd = g.get('cad_mm', {})
        s = cd.get('pocket_af') or cd.get('nut_pocket_af') or (g['s'] + 0.4)
        dep = cd.get('pocket_depth') or (g['m'] + 0.4)
        floor = add(c, a, -g['m'] * MM / 2)
        out.append(('nut', polyprism(add(floor, a, (dep + 10.0) * MM / 2), a, s * MM, (dep + 10.0) * MM, 6), c))
    return out


# ---------------------------------------------------------------- per-kind builders (world space)
def strap_loop(ctx, it, ins):
    """thin band loop around the actual bundle; returns list of bodies."""
    g = it['g']
    w, t = g['w'] * MM, g['t'] * MM
    p = ins['p']
    iid = it['id']
    par = ins['par']
    sg = 1.0 if p[2] >= 0 else -1.0
    head = None

    def rect_from_ranges(n_axis, r1, r2, centre_n, margin):
        # n_axis: 'x','y','z' (model) normal; r1,r2 = (lo,hi) ranges (cm, Fusion space) along the two other Fusion axes
        mn = (r1[0] - margin, r2[0] - margin)
        mx = (r1[1] + margin, r2[1] + margin)
        return mn, mx

    if iid in ('HW-134', 'HW-135', 'HW-136'):  # servo lead tie through the tray slot, loop round the tray edge
        sv = ctx.servo_by_comp[par]
        bu, bv, bw = basis(vec(sv['a']), vec(sv['u']))
        c = add(add(pt(p), bu, -0.45), bw, 0.05)
        body = ring_rect(c, bu, bw, 0.90 + 2 * t, 1.10 + 2 * t, 0.12, w, t)
        U_(body, box(add(c, bw, 0.55 + t - 0.05), bu, bv, 0.65, w + 0.1, 0.34))
        return [('', body)]
    if iid == 'HW-059':  # boom + saddle: circle in a YZ plane
        c = pt([p[0], -0.03, sg * 0.4337])
        ri = 15.6 * MM
        body = tube(c, EXF, ri + t, ri, w, -w / 2)
        head_c = add(c, EYF, ri + t / 2)
        head_d1, head_d2 = EYF, EZF
    else:
        # loop normal and bundle ranges
        if iid == 'HW-123' and not par.startswith('ESC_P'):
            n = EXF
            bb = ctx.bbox(par)
            lo_y, hi_y = -0.03 * 100 - 1.42, -0.03 * 100 + 1.42  # model y -> Fusion z (cm)
            zb = sg * 0.4337 * 100
            lo = zb - 1.42 * 1.0
            hi = (bb[3] if sg > 0 else bb[0]) if bb else zb + 2.3
            if sg > 0:
                rx = (min(lo, zb - 1.42), max(hi, zb + 1.42))
            else:
                rx = (min(hi, zb - 1.42), max(zb + 1.42, lo))
                rx = (min(hi, zb - 1.42), zb + 1.42)
            fz = (lo_y, hi_y)  # Fusion z range (model y)
            d1, d2 = EZF, EYF  # d1 along Fusion X?  (EZF = model z = Fusion X)
            c = P3.create((rx[0] + rx[1]) / 2, p[0] * 100.0, (fz[0] + fz[1]) / 2)
            A = (rx[1] - rx[0]) + 0.1 + 2 * t
            B = (fz[1] - fz[0]) + 0.1 + 2 * t
            d1, d2 = V3.create(1, 0, 0), V3.create(0, 0, 1)
        else:
            if iid == 'HW-108':
                n = EXF
                bb = ctx.bbox('Battery_6S_LiPo')
                extra_lo = 0.3
            else:
                n = vec(ins['a']) if not par.startswith('ESC_P') else EZF
                bb = ctx.bbox(par)
                extra_lo = 0.0
            if iid in ('HW-122', 'HW-124', 'HW-141', 'HW-140') and bb is None:
                bb = (p[2] * 100 - 1.5, p[0] * 100 - 1.5, p[1] * 100 - 1.5, p[2] * 100 + 1.5, p[0] * 100 + 1.5, p[1] * 100 + 1.5)
            if bb is None:
                bb = (p[2] * 100 - 1.5, p[0] * 100 - 1.5, p[1] * 100 - 1.5, p[2] * 100 + 1.5, p[0] * 100 + 1.5, p[1] * 100 + 1.5)
            ax = max(range(3), key=lambda i: abs([n.x, n.y, n.z][i]))
            others = [i for i in range(3) if i != ax]
            lo = [bb[others[0]], bb[others[1]]]
            hi = [bb[3 + others[0]], bb[3 + others[1]]]
            if iid == 'HW-108':
                lo[1] -= extra_lo  # tray under the pack (Fusion z is model y)
            cen = [0.0, 0.0, 0.0]
            cen[others[0]] = (lo[0] + hi[0]) / 2
            cen[others[1]] = (lo[1] + hi[1]) / 2
            cen[ax] = [p[2], p[0], p[1]][ax] * 100.0
            c = P3.create(*cen)
            A = (hi[0] - lo[0]) + 0.1 + 2 * t
            B = (hi[1] - lo[1]) + 0.1 + 2 * t
            e1 = [V3.create(1, 0, 0), V3.create(0, 1, 0), V3.create(0, 0, 1)]
            d1, d2 = e1[others[0]], e1[others[1]]
        body = ring_rect(c, d1, d2, A, B, 0.9, w, t)
        head_c = add(c, d2, B / 2 - t / 2 + 0.05)
        head_d1, head_d2 = d1, d2
    hb = box(head_c, head_d1, head_d2, 0.65, 0.34 if iid != 'HW-108' else 0.5, w + 0.1)
    U_(body, hb)
    return [('', body)]


def build_servo(ctx, it, ins):
    g = it['g']
    a, u = vec(ins['a']), vec(ins['u'])
    U, Vv, W = basis(a, u)
    c = pt(ins['p'])
    B = {'u': U, 'v': Vv, 'w': W}
    body = prim_body(c, B, g['primitives'], ('u', 'v', 'w'))
    sh = g['shaft']
    wtop = g['case'][2] + sh['boss_h'] + sh['h'] - sh['boss_h']
    sc = add(add(c, U, sh['offset_from_centre_u'] * MM), W, g['case'][2] * MM)
    # 23T spline approximated by a 24-gon, tapped arm-screw hole (M3 tap drill 2.5)
    spl = polyprism(add(sc, W, (sh['boss_h'] + sh['h'] / 2) * MM - 0.0), W, 5.7 * MM, (sh['h'] - 0.0) * MM, 24)
    U_(body, spl)
    D_(body, cyl(sc, W, 1.25 * MM, 6.0 * MM, (sh['boss_h'] + sh['h'] - 6.0) * MM))
    # case split line groove (cosmetic) and rounded vertical case edges by chamfer cuts
    for su in (-1, 1):
        for sv in (-1, 1):
            e = add(add(c, U, su * g['case'][0] / 2 * MM), Vv, sv * g['case'][1] / 2 * MM)
            # 45 deg edge chamfer along w: rotate by cutting a square rotated 45 deg
            dd = rot(U, Vv, math.pi / 4)
            ee = W.crossProduct(dd)
            ee.normalize()
            ch = box(add(e, W, g['case'][2] / 2 * MM), dd, ee, 1.2 * MM, 1.2 * MM, g['case'][2] * MM + 0.2)
            D_(body, ch)
    return [('', body)]


def build_servo_arm(ctx, it, ins):
    g = it['g']
    a, u = vec(ins['a']), vec(ins['u'])
    U, Vv, W = basis(a, u)
    c = pt(ins['p'])
    t, w, l = g['t'] * MM, g['w'] * MM, g['l'] * MM
    body = cyl(c, W, 4.5 * MM, t, -t / 2)
    U_(body, box(add(c, U, (l - 0.3) / 2), U, Vv, l - 0.3, w, t))
    U_(body, cyl(add(c, U, l - 0.3), W, w / 2, t, -t / 2))
    D_(body, cyl(c, W, 2.95 * MM, t + 0.2, -t / 2 - 0.1))  # spline bore 5.8 + 0.1
    for r in g['holes']:
        D_(body, cyl(add(c, U, r * MM), W, g['hole_d'] * MM / 2, t + 0.2, -t / 2 - 0.1))
    return [('', body)]


def build_horn(ctx, it, ins):
    g = it['g']
    a, u = vec(ins['a']), vec(ins['u'])
    U, Vv, W = basis(a, u)
    B = {'u': U, 'v': Vv, 'w': W}
    return [('', prim_body(pt(ins['p']), B, g['primitives'], ('u', 'v', 'w')))]


def build_pushrod(ctx, it, ins):
    g = it['g']
    d = g['d'] * MM
    p1, p2 = pt(ins['p1']), pt(ins['p2'])
    dr = V3.create(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z)
    dr.normalize()
    rod = tbm.createCylinderOrCone(p1, d / 2, add(p1, dr, g['cut_length_mm'] * MM), d / 2)
    U_(rod, tbm.createSphere(p1, d / 2))
    arm = ctx.arm_by_par.get(ins['par'])
    if arm:
        leg = neg(vec(arm['a']))
        U_(rod, tbm.createCylinderOrCone(p1, d / 2, add(p1, leg, 4.7 * MM), d / 2))
    return [('', rod)]


def build_clevis(ctx, it, ins):
    g = it['g']
    a, u = vec(ins['a']), vec(ins['u'])
    U, Vv, W = basis(a, u)  # W = a, U = pin axis (up), V = a x U
    c = pt(ins['p'])
    L, w, t = g['L'] * MM, g['w'] * MM, g['t'] * MM
    body = box(add(c, W, L / 2 - 0.25), U, Vv, w, t, L)  # size w along U (pin axis), t along V, L along a
    D_(body, box(add(c, W, 0.45 - 0.25), U, Vv, 0.24, t + 0.2, 1.1))  # fork slot for the 2 mm stalk (2.4 wide)
    D_(body, cyl(add(c, W, L - 0.25 - 0.9), W, 0.095, 0.95, 0.0))  # rod bore 1.9
    U_(body, cyl(c, U, g['pin_hole_d'] * MM / 2, w + 0.1, -(w + 0.1) / 2))  # pin
    return [('', body)]


def build_wheel(ctx, it, ins):
    g = it['g']
    c = pt(ins['p'])
    a = vec(ins['a'])
    od, wd = g['od'] * MM, g['w'] * MM
    ro = od / 2
    ri = 2.78
    tyre = cyl(c, a, ro, wd * 0.66, -wd * 0.33)
    U_(tyre, cone(c, a, ro, ro - 0.35, wd * 0.17, wd * 0.33))
    U_(tyre, cone(c, neg(a), ro, ro - 0.35, wd * 0.17, wd * 0.33))
    D_(tyre, cyl(c, a, ri, wd + 0.2, -wd / 2 - 0.1))
    hub = tube(c, a, 2.8, 2.55, wd, -wd / 2)  # rim
    U_(hub, tube(c, a, 0.7, g['bore'] * MM / 2, wd, -wd / 2))  # boss with the 4.0 bore (est, not published)
    U, Vv, W = basis(a)
    for k in range(8):
        d = rot(U, Vv, k * math.pi / 4)
        e = a.crossProduct(d)
        e.normalize()
        U_(hub, box(add(c, d, 1.65), d, e, 2.2, 0.3, 0.5))
    D_(hub, cyl(c, a, g['bore'] * MM / 2, wd + 0.2, -wd / 2 - 0.1))
    return [('tyre', tyre), ('hub', hub)]


def plate_slab(ctx, ins, t):
    """thin slab (thickness t mm along z) centred at the instance, big in x/y."""
    p = ins['p']
    return mbox(p, 400.0, 150.0, t)


def build_plate(ctx, it, ins, idx):
    iid, g = it['id'], it['g']
    p, a = ins['p'], vec(ins['a'])
    c = pt(p)
    sg = 1.0 if ins['a'][2] >= 0 else -1.0
    if iid == 'HW-001':
        body = ctx.body_world(ins['par'])
        I_(body, plate_slab(ctx, ins, g['t']))
        face_z = p[2] - sg * g['t'] / 2000.0
        D_(body, mbox([-0.167, 0.0036, p[2]], 14.0, 3.4, g['t'] + 1.0))
        D_(body, cyl(pt([-0.030, 0.00271, face_z]), vec([0, 0, -sg]), 3.1 * MM, 2.4 * MM, -0.05))
        return [('', body)]
    if iid == 'HW-002':
        body = ctx.body_world('Wing_Saddle')
        I_(body, plate_slab(ctx, ins, g['t']))
        D_(body, cyl(pt([-0.0716, 0.00448, p[2]]), EZF, 11.425 * MM, 2.0, -1.0))  # joiner hole 22.85
        face = p[2] + sg * g['t'] / 2000.0
        tab = mbox([g['tab_x'] / 1000.0, 0.0036, face + sg * g['tab_l'] / 2000.0], g['tab_w'], g['tab_t'], g['tab_l'])
        U_(body, tab)
        return [('', body)]
    if iid == 'HW-003':
        return [('', mbox(p, g['x'], g['t'], g['z']))]
    if iid == 'HW-012':
        return [('', mbox(p, g['x'], g['t'], g['z']))]
    if iid == 'HW-034':
        body = cyl(c, a, g['od'] * MM / 2, g['t'] * MM, -g['t'] * MM / 2)
        D_(body, cyl(c, a, 1.0, g['t'] * MM + 0.2, -g['t'] * MM / 2 - 0.1))  # motor wire / shaft clearance, 20 dia (est)
        return [('', body)]
    if iid == 'HW-035':
        return [('', tube(c, a, g['od'] * MM / 2, g['id'] * MM / 2, g['t'] * MM, -g['t'] * MM / 2))]
    if iid == 'HW-104':
        od = g['od'][idx] if idx < len(g['od']) else g['od'][0]
        body = cyl(c, a, od * MM / 2, g['t'] * MM, -g['t'] * MM / 2)
        bu, bv, bw = basis(a)
        for ang in (90, 210, 330):
            d = rot(bu, bv, math.radians(ang))
            D_(body, cyl(add(c, d, od * 0.34 * MM), a, 1.0, g['t'] * MM + 0.2, -g['t'] * MM / 2 - 0.1))
        return [('', body)]
    if iid in ('HW-105', 'HW-109'):
        l, w, t, eb = g['l'], g['w'], g['t'], g['end_block_h']
        body = mbox(p, l, t, w)
        for sx in (-1, 1):
            blk = mbox([p[0] + sx * (l / 2 - 4.0) / 1000.0, p[1] - (eb - t) / 2000.0 * 1.0 - 0.0 + 0.0, p[2]], 8.0, eb, w)
            U_(body, blk)
        return [('', body)]
    if iid == 'HW-117':
        return [('', cyl(c, a, g['od'] * MM / 2, g['L'] * MM, -g['L'] * MM / 2))]
    if iid == 'HW-125':
        body = mbox(p, g['x'], g['y'], g['z'])
        D_(body, cyl(pt([p[0], -0.02, -1.0]), EXF, g['bore_d'] * MM / 2, 3.0, -1.5))
        return [('', body)]
    if iid == 'HW-143':
        body = mrange(p[0] - 0.025, p[0] + 0.025, p[1] - 0.015, p[1] + 0.015, 0.4337 * sg + sg * 0.0, p[2] + sg * 0.00115) \
            if sg > 0 else mrange(p[0] - 0.025, p[0] + 0.025, p[1] - 0.015, p[1] + 0.015, p[2] - 0.00115, -0.4337)
        D_(body, cyl(pt([p[0] - 0.03, p[1], 0.4337 * sg]), EXF, 12.7 * MM, 6.0, 0.0))
        for sx in (-1, 1):
            for sy in (-1, 1):
                D_(body, mbox([p[0] + sx * 0.012, p[1] + sy * 0.0136, p[2]], 4.2, 1.6, 6.0))
        return [('', body)]
    if iid == 'HW-058':
        l = g['l_elev'] if idx < 2 else g['l_rud']
        ro = g['bore_d'] / 2 + g['wall']
        body = tube(c, EXF, ro * MM, g['bore_d'] * MM / 2, l * MM, -l * MM / 2)
        if idx < 2:
            ch = g['cheek']
            zr = ch['z_range_m']
            zz = (zr[0], zr[1]) if sg > 0 else (-zr[1], -zr[0])
            U_(body, mrange(ch['x_range_m'][0], ch['x_range_m'][1], ch['y_range_m'][0], ch['y_range_m'][1], zz[0], zz[1]))
        D_(body, mrange(p[0] - 0.08, p[0] + 0.08, -0.0304, -0.0300, p[2] - 0.03, p[2] + 0.03))  # 0.4 split gap
        return [('', body)]
    if iid == 'HW-049':
        out = sg_vec = vec([0, 0, sg])
        B = {'x': EXF, 'y': EYF, 'z': out}
        body = prim_body(c, B, g['primitives'], ('x', 'y', 'z'))
        return [('', body)]
    if iid in ('HW-063', 'HW-132', 'HW-133'):
        U, Vv, W = basis(a, vec(ins['u']))
        B = {'u': U, 'v': Vv, 'w': W}
        body = prim_body(c, B, g['primitives'], ('u', 'v', 'w'), 25.0)
        return [('', body)]
    if iid in ('HW-080', 'HW-087', 'HW-094'):
        horn_id = 'HW-%03d' % (int(iid[3:]) - 1)
        hins = ctx.items[horn_id]['inst'][idx]
        U, Vv, W = basis(a, vec(hins['u']))
        return [('', box(c, U, Vv, g['l'] * MM, g['w'] * MM, g['t'] * MM))]
    if iid == 'HW-032':
        return [('', tube(c, a, g['od'] * MM / 2, 0.2, g['t'] * MM))]
    # generic discs / boxes
    if 'od' in g and 't' in g:
        return [('', cyl(c, a, g['od'] * MM / 2, g['t'] * MM, -g['t'] * MM / 2))]
    return None


def build_other(ctx, it, ins, idx):
    g = it['g']
    c, a = pt(ins['p']), vec(ins['a'])
    if 'cross_holes' in g:  # splice plug
        o = cyl(c, a, g['od'] * MM / 2, g['L'] * MM, -g['L'] * MM / 2)
        for off, _ in g['cross_holes']:
            D_(o, cyl(add(c, a, off * MM), EYF, 1.8 * MM, g['od'] * MM + 0.4, -g['od'] * MM / 2 - 0.2))
        return [('', o)]
    if 'bore' in g:  # prop adapter, base at pos
        o = tube(c, a, g['od'] * MM / 2, g['bore'] * MM / 2, g['L'] * MM)
        for k in range(4):  # 4 screw holes on 12 mm pitch circle (supplied part: positions est)
            U, Vv, W = basis(a)
            d = rot(U, Vv, k * math.pi / 2 + math.pi / 4)
            D_(o, cyl(add(c, d, 0.85), a, 0.17, g['L'] * MM + 0.2, -0.1))
        return [('', o)]
    return None


def build_item(ctx, it, ins, idx):
    """-> list of (suffix, body); None body = marker."""
    k, g, spec = it['k'], it['g'], it['spec']
    c, a = pt(ins['p']), vec(ins['a'])
    na = neg(a)
    if k == 'screw':
        d, L = g['d'] * MM, g['L'] * MM
        style = g.get('head', 'socket')
        if style == 'grub':
            sh = cyl(c, a, d / 2, L)
            D_(sh, polyprism(add(c, a, 0.06), a, g.get('s', 1.5) * MM, 0.15, 6))
            return [('', sh)]
        hd, hh = g['head_d'] * MM, g['head_h'] * MM
        tipc = min(0.04, L / 4)
        sh = cyl(c, a, d / 2, L - tipc)
        U_(sh, cone(c, a, d / 2, d / 2 - tipc, tipc, L - tipc))
        if style == 'socket':
            U_(sh, cyl(c, na, hd / 2, hh))
            top_ch = 0.03
            rd = min(0.6 * hh, 0.18)
        elif style == 'button':
            U_(sh, cyl(c, na, hd / 2, hh * 0.4))
            U_(sh, cone(c, na, hd / 2, hd / 2 * 0.62, hh * 0.6, hh * 0.4))
            rd = min(0.6 * hh, 0.12)
        else:  # pan
            U_(sh, cyl(c, na, hd / 2, hh * 0.55))
            U_(sh, cone(c, na, hd / 2, hd / 2 * 0.8, hh * 0.45, hh * 0.55))
            rd = min(0.5 * hh, 0.12)
        s = g.get('s')
        if s and style != 'pan':
            D_(sh, polyprism(add(c, na, hh - rd / 2 + 0.005), a, s * MM, rd + 0.01, 6))
        elif style == 'pan':  # cross recess approximated by a slot
            D_(sh, box(add(c, na, hh - 0.04), EXF if abs(a.dotProduct(EXF)) < 0.9 else EYF, a.crossProduct(EXF if abs(a.dotProduct(EXF)) < 0.9 else EYF), 0.3, 0.06, 0.1))
        return [('', sh)]
    if k == 'nut':
        ms = msize(spec, 3)
        return [('', polyprism(c, a, g['s'] * MM, g['m'] * MM, 6, ms * 0.84 * MM / 2))]
    if k == 'nyloc':
        ms = 4.0 if 'axle' in spec.lower() else msize(spec, 3)
        s, m = g['s'] * MM, g['m'] * MM
        hexh = 0.6 * m
        base = add(c, a, -m / 2)
        br = ms * 0.84 * MM / 2
        hx = polyprism(add(base, a, hexh / 2), a, s, hexh, 6, br)
        ring = cone(base, a, s * 0.46, s * 0.34, m - hexh, hexh)
        D_(ring, cyl(base, a, br, m + 0.1, hexh - 0.05))
        return [('', hx), ('nylon', ring)]
    if k in ('washer', 'grommet'):
        return [('', tube(c, a, g['od'] * MM / 2, g['id'] * MM / 2, g['t'] * MM, -g['t'] * MM / 2))]
    if k == 'standoff':
        return [('', polyprism(c, a, g['od'] * MM, g['L'] * MM, 6, g['id'] * MM / 2))]
    if k == 'insert':
        ms = msize(spec, 3)
        od, L = g['od'] * MM, g['L'] * MM
        body = polyprism(c, a, od * 0.966, L, 12, ms * 0.84 * MM / 2)  # 12-gon OD = knurl approximation
        for off in (-0.14, 0.0, 0.14):  # two shallow retention grooves
            if off != 0.0:
                D_(body, tube(c, a, od / 2 + 0.05, od / 2 - 0.02, 0.04, off - 0.02))
        return [('', body)]
    if k == 'keeper':
        return [('', tube(c, a, g['od_shrunk'] * MM / 2, g['id'] * MM / 2, g['L'] * MM, -g['L'] * MM / 2))]
    if k == 'axle':
        o = cyl(c, a, g['d'] * MM / 2, g['L'] * MM, -g['L'] * MM / 2)
        return [('', o)]
    if k == 'collar':
        o = tube(c, a, g['od'] * MM / 2, g['bore'] * MM / 2, g['w'] * MM, -g['w'] * MM / 2)
        return [('', o)]
    if k == 'wheel_hub':
        return build_wheel(ctx, it, ins)
    if k == 'strap':
        return strap_loop(ctx, it, ins)
    if k == 'servo':
        return build_servo(ctx, it, ins)
    if k == 'horn':
        return build_servo_arm(ctx, it, ins) if 'hole_radius' in g else build_horn(ctx, it, ins)
    if k == 'pushrod':
        return build_pushrod(ctx, it, ins)
    if k == 'clevis':
        return build_clevis(ctx, it, ins)
    if k == 'plate':
        r = build_plate(ctx, it, ins, idx)
        return r
    if k == 'other':
        if it['id'] == 'HW-100':
            return build_tape(ctx, it, ins, idx)
        return build_other(ctx, it, ins, idx)
    return None


def build_tape(ctx, it, ins, idx):
    g = it['g']
    t = g['t_cad'] * MM
    w = g['w']
    p = ins['p']
    length = ins['len']
    if idx < 2:  # aileron: follows the upper surface
        xc = p[0]
        x0, x1 = xc - w / 2000.0, xc + w / 2000.0
        y0, y1 = foil_y(x0), foil_y(x1)
        ang = math.atan2(y1 - y0, x1 - x0)
        ch = math.hypot(x1 - x0, y1 - y0) * 1000.0
        sg = 1.0 if p[2] >= 0 else -1.0
        d = vec([math.cos(ang), math.sin(ang), 0.0])
        cy = foil_y(xc) + 0.0001
        body = box(pt([xc, cy, p[2]]), d, EZF, ch * MM, length * MM, t)
        return [('', body)]
    if idx == 2:  # elevator, flat on the upper skin
        return [('', mbox(p, w, g['t_cad'], length))]
    return [('', mbox(p, w, length, g['t_cad']))]  # rudder: strip on the outboard face, length along y


# ---------------------------------------------------------------- helpers: components
def get_comp(root, name):
    for o in root.occurrences:
        if o.component.name == name:
            return o
    return None


def delete_named(root, name):
    o = get_comp(root, name)
    while o is not None:
        o.deleteMe()
        o = get_comp(root, name)


def new_sub(parent_comp, name):
    occ = parent_comp.occurrences.addNewComponent(M3.create())
    occ.component.name = name
    return occ


# ---------------------------------------------------------------- phase: prep
def phase_prep(ctx):
    root = ctx.root
    for o in list(root.occurrences):
        if o.component.name == 'Hardware':
            for s in list(o.component.occurrences):
                s.deleteMe()
    delete_named(root, 'Proposed_Wheels')
    delete_named(root, 'Wheel_Gear')
    # hide duplicated CAD stand-ins: Electronics servo boxes and CAD Wing_Bolt (rebuilt in detail)
    hidden = []
    for o in root.allOccurrences:
        n = o.component.name
        if n.startswith('SRV_') or n == 'Wing_Bolt':
            o.isLightBulbOn = False
            hidden.append(o.name)
    # suppress the dome foot revolve on the landing leg (replaced by the printed axle block)
    for o in root.occurrences:
        if o.component.name == 'Landing_Leg':
            for f in o.component.features:
                if f.name.startswith('Revolve'):
                    f.timelineObject.isSuppressed = True
            break
    return {'hidden': hidden}


# ---------------------------------------------------------------- phase: hardware
LEG_JOINTS = ('J-14', 'J-15')
LEGS = [(0.28092, 0.4337), (0.28092, -0.4337), (-0.41458, 0.4337), (-0.41458, -0.4337)]


def leg_name(ix):
    x, z = LEGS[ix]
    return 'Leg_%s%s' % ('F' if x > 0 else 'R', 'R' if z > 0 else 'L')


def nearest_leg(p):
    return min(range(4), key=lambda i: (p[0] - LEGS[i][0]) ** 2 + (p[2] - LEGS[i][1]) ** 2)


def build_group(ctx, comp, entries, plates_ctx, label):
    """entries: list of (item, ins, idx).  Creates one BaseFeature with all bodies.  Returns made list."""
    des = ctx.des
    bf = comp.features.baseFeatures.add()
    bf.startEdit()
    made = []
    plate_entries = [e for e in entries if e[0]['k'] == 'plate']
    other_entries = [e for e in entries if e[0]['k'] != 'plate']
    jf = {}
    for e in entries:
        pass
    for it, ins, idx in other_entries:
        try:
            res = build_item(ctx, it, ins, idx)
            if res is None:
                res = [('', tbm.createBox(adsk.core.OrientedBoundingBox3D.create(pt(ins['p']), EXF, EYF, 0.3, 0.3, 0.3)))]
                count('marker_bodies')
            for suf, b in res:
                if b is None:
                    continue
                made.append((it, idx, suf, b))
        except Exception:
            ERRS.append('%s_%d: %s' % (it['id'], idx + 1, traceback.format_exc().splitlines()[-1]))
    # set screws drill the tap hole (minor dia 2.8) in the collar / adapter they sit in
    grubs = [(it, ins) for it, ins, idx in entries if it['k'] == 'screw' and it['g'].get('head') == 'grub']
    for git, gins in grubs:
        gp, ga = pt(gins['p']), vec(gins['a'])
        tp = add(gp, ga, 0.05)
        for it2, idx2, suf2, b2 in made:
            if it2['k'] in ('collar', 'other') and suf2 == '' and b2 is not None:
                try:
                    if inside(b2, tp) or (bb_overlap(bb_list(b2), bb_list(cyl(gp, ga, 0.14, 0.34)), 0.0) and inside(b2, add(gp, ga, 0.2))):
                        D_(b2, cyl(add(gp, ga, -0.05), ga, 0.14, 0.40))
                        count('tap_hole_set_screw')
                        break
                except Exception:
                    ERRS.append('tap hole %s' % git['id'])
    # printed plates last: cut the holes of the fasteners of the same joint
    for it, ins, idx in plate_entries:
        try:
            res = build_item(ctx, it, ins, idx)
            if res is None:
                res = [('', tbm.createBox(adsk.core.OrientedBoundingBox3D.create(pt(ins['p']), EXF, EYF, 0.3, 0.3, 0.3)))]
                count('marker_bodies')
            for suf, b in res:
                if it['id'] not in ('HW-049', 'HW-063', 'HW-132', 'HW-133') and it['id'] in plates_ctx['plates_cut']:
                    cut_plate_holes(ctx, b, it, plates_ctx)
                made.append((it, idx, suf, b))
        except Exception:
            ERRS.append('%s_%d: %s' % (it['id'], idx + 1, traceback.format_exc().splitlines()[-1]))
    for it, idx, suf, b in made:
        try:
            body = comp.bRepBodies.add(b, bf)
            nm = '%s_%d %s' % (it['id'], idx + 1, it['spec'])
            if suf:
                nm = '%s_%d %s' % (it['id'], idx + 1, suf)
            body.name = nm[:70]
            made[made.index((it, idx, suf, b))] = (it, idx, suf, body)
        except Exception:
            ERRS.append('add %s_%d: %s' % (it['id'], idx + 1, traceback.format_exc().splitlines()[-1]))
    bf.finishEdit()
    for it, idx, suf, body in made:
        try:
            if not isinstance(body, adsk.fusion.BRepBody):
                continue
            if suf == 'nylon':
                body.appearance = appearance(des, NYLON, '')
            elif suf == 'tyre':
                body.appearance = appearance(des, (0.10, 0.10, 0.10), '')
            elif suf == 'hub':
                body.appearance = appearance(des, (0.90, 0.90, 0.88), '')
            else:
                body.appearance = appearance(des, it['col'], it['mat'])
        except Exception:
            ERRS.append('appearance ' + it['id'])
    return made


def cut_plate_holes(ctx, plate, it, pc):
    """cut clearance holes / counterbores / insert bores / nut traps of the fasteners of the same joint into a plate."""
    pb = bb_list(plate)
    todo = []
    for f in pc['joint_F'].get(it['j'], []):
        try:
            tl = fast_tools(ctx, f)
        except Exception:
            ERRS.append('tools %s: %s' % (f['it']['id'], traceback.format_exc().splitlines()[-1]))
            continue
        for kind, tool, tp in tl:
            try:
                if not bb_overlap(pb, bb_list(tool), 0.02):
                    continue
                if kind != 'clear' and not inside(plate, tp):  # test on the pristine plate
                    continue
                todo.append((kind, tool))
            except Exception:
                ERRS.append('plate test %s %s' % (it['id'], kind))
    for kind, tool in todo:
        try:
            D_(plate, tool)
            count('plate_hole_' + kind)
        except Exception:
            ERRS.append('plate hole %s %s' % (it['id'], kind))


def phase_hw(ctx, joints=None):
    root = ctx.root
    data = ctx.data
    hwocc = get_comp(root, 'Hardware')
    if hwocc is None:
        hwocc = root.occurrences.addNewComponent(M3.create())
        hwocc.component.name = 'Hardware'
    hw = hwocc.component
    plates_cut = ('HW-001', 'HW-002', 'HW-003', 'HW-012', 'HW-034', 'HW-035', 'HW-058', 'HW-080', 'HW-087', 'HW-094',
                  'HW-105', 'HW-109', 'HW-117', 'HW-125', 'HW-104', 'HW-143')
    joint_F = {}
    for f in ctx.F:
        joint_F.setdefault(f['it']['j'], []).append(f)
    pc = {'plates_cut': plates_cut, 'joint_F': joint_F}
    total = 0
    per = {}
    for j in data['joints']:
        jid = j['id']
        if joints is not None and jid not in joints:
            continue
        if jid in LEG_JOINTS:
            continue
        items = [i for i in data['items'] if i['j'] == jid]
        if not items:
            continue
        for o in list(hw.occurrences):
            if o.component.name.startswith(jid + ' '):
                o.deleteMe()
        nm = '%s %s' % (jid, re.sub(r'[^A-Za-z0-9 _+.\-]', '', j['name'])[:46].strip())
        occ = new_sub(hw, nm)
        entries = [(it, ins, n) for it in items for n, ins in enumerate(it['inst'])]
        made = build_group(ctx, occ.component, entries, pc, jid)
        per[jid] = len(made)
        total += len(made)
    return {'bodies': total, 'per_joint': per}


def phase_gear(ctx):
    root = ctx.root
    data = ctx.data
    delete_named(root, 'Wheel_Gear')
    occ = root.occurrences.addNewComponent(M3.create())
    occ.component.name = 'Wheel_Gear'
    wg = occ.component
    plates_cut = ()
    pc = {'plates_cut': plates_cut, 'joint_F': {}}
    groups = [[] for _ in range(4)]
    for it in data['items']:
        if it['j'] in LEG_JOINTS:
            for n, ins in enumerate(it['inst']):
                groups[nearest_leg(ins['p'])].append((it, ins, n))
    res = {}
    for ix in range(4):
        sub = new_sub(wg, leg_name(ix))
        made = build_group(ctx, sub.component, groups[ix], pc, 'gear')
        # collar set-screw tap holes: handled in the B-rep stage below is not possible after add; cut with a combine
        res[leg_name(ix)] = len(made)
    return res



# ---------------------------------------------------------------- component-level cuts (CombineFeature)
def occ_T(o):
    m = o.transform
    return (m.getCell(0, 3), m.getCell(1, 3), m.getCell(2, 3))


def to_local(tool, o):
    t = occ_T(o)
    mat = M3.create()
    mat.translation = V3.create(-t[0], -t[1], -t[2])
    tbm.transform(tool, mat)
    return tool


def touches(world_body, tool):
    try:
        t = tbm.copy(tool)
        b = tbm.copy(world_body)
        tbm.booleanOperation(t, b, BT.IntersectionBooleanType)
        return t.volume > 1e-7
    except Exception:
        return False


def apply_combine(comp, target, tools, join=False, label=''):
    """tools: list of temp bodies in component space. Cut (or join) them into target via a BaseFeature + CombineFeature."""
    bf = comp.features.baseFeatures.add()
    bf.startEdit()
    for t in tools:
        comp.bRepBodies.add(t, bf)
    bf.finishEdit()
    coll = adsk.core.ObjectCollection.create()
    for b in bf.bodies:  # re-fetch after finishEdit (references returned inside the edit go stale)
        coll.add(b)
    ci = comp.features.combineFeatures.createInput(target, coll)
    ci.operation = adsk.fusion.FeatureOperations.JoinFeatureOperation if join else adsk.fusion.FeatureOperations.CutFeatureOperation
    ci.isKeepToolBodies = False
    return comp.features.combineFeatures.add(ci)


def first_occ(ctx, name):
    o = ctx.occ.get(name)
    return o[0] if o else None


def model_to_local_tool(tool, occ):
    return to_local(tool, occ)


def phase_hinge(ctx, wing=True, elevator=True):
    res = {}
    # --- aileron: cut the wing panel behind the hinge line (gap 4.77 centred on x=-0.17424: wing TE part ends x=-0.17186)
    for side, sg in ((('R', 1.0), ('L', -1.0)) if wing else ()):
        occ = first_occ(ctx, 'Wing_Panel_' + side)
        comp = occ.component
        z0, z1 = (0.584, 1.215) if sg > 0 else (-1.215, -0.584)
        tools = [mrange(-0.2400, -0.17186, -0.03, 0.04, z0, z1)]
        # servo pocket (window 39.4 x 19.6, ear plate pocket, tray pocket 62 x 26 x 3, arm / rod slot), servo base z=0.78255
        zb = 0.78255 * sg
        def zr(a, b):
            return (zb + sg * a / 1000.0, zb + sg * b / 1000.0) if sg > 0 else (zb + sg * b / 1000.0, zb + sg * a / 1000.0)
        w0, w1 = zr(-0.6, 35.8)
        tools.append(mrange(-0.1397, -0.1003, -0.0048, 0.0148, w0, w1))
        e0, e1 = zr(23.4, 29.6)
        tools.append(mrange(-0.1475, -0.0925, -0.0048, 0.0148, e0, e1))
        t0, t1 = zr(23.4, 26.6)
        tools.append(mrange(-0.151, -0.089, -0.008, 0.018, t0, t1))
        a0, a1 = zr(35.7, 43.8)
        tools.append(mrange(-0.152, -0.108, -0.03, 0.0098, a0, a1))
        loc = [to_local(t, occ) for t in tools]
        apply_combine(comp, comp.bRepBodies.item(0), loc)
        count('hinge_gap_aileron')
        count('servo_pocket_wing', 4)
        res['Wing_Panel_' + side] = 'ok'
    # --- elevator: LE moved aft to x=-0.82539 (hinge gap 3.5 centred on x=-0.82364)
    if elevator:
        occ = first_occ(ctx, 'Elevator')
        tool = to_local(mrange(-0.8200, -0.82539, -0.03, 0.03, -0.5, 0.5), occ)
        apply_combine(occ.component, occ.component.bRepBodies.item(0), [tool])
        count('hinge_gap_elevator')
    # --- rudder: 4.0 mm slot through the fin at x=-0.87773 (est: the CAD fin has no rudder; the aft part becomes the rudder)
    occ = [o for o in ctx.occ['Fin'] if occ_T(o)[0] > 0][0]  # right fin (z>0); the component is shared with the left one
    tool = to_local(mrange(-0.87973, -0.87573, -0.03, 0.20, 0.40, 0.47), occ)
    apply_combine(occ.component, occ.component.bRepBodies.item(0), [tool])
    count('hinge_gap_rudder')
    comp = occ.component
    for b in comp.bRepBodies:
        bb = b.boundingBox
        b.name = 'Rudder' if (bb.minPoint.y + bb.maxPoint.y) / 2 < -10.9 else 'Fin_fixed'
    res['Fin bodies'] = [b.name for b in comp.bRepBodies]
    return res


TARGETS = ('Wing_Saddle', 'Boom_Clamp_Front', 'Boom_Clamp_Rear', 'Motor_Mount', 'Gear_Clamp', 'Boom_Front',
           'Boom_Rear_Stub', 'Landing_Leg', 'Spar_Tube')
CLAMPS = {'Boom_Clamp_Front': 3.4, 'Boom_Clamp_Rear': 3.4, 'Motor_Mount': 7.0, 'Gear_Clamp': 3.4}


def phase_cuts(ctx, only=None):
    res = {}
    per = {}  # comp name -> {key: tool}
    for f in ctx.F:
        try:
            tl = fast_tools(ctx, f)
        except Exception:
            ERRS.append('tools %s' % f['it']['id'])
            continue
        for kind, tool, tp in tl:
            tb = bb_list(tool)
            for name in TARGETS:
                if only and name not in only:
                    continue
                for o in ctx.occ.get(name, []):
                    if o.assemblyContext is not None:
                        continue
                    if not bb_overlap(tb, (o.boundingBox.minPoint.x, o.boundingBox.minPoint.y, o.boundingBox.minPoint.z,
                                           o.boundingBox.maxPoint.x, o.boundingBox.maxPoint.y, o.boundingBox.maxPoint.z), 0.0):
                        continue
                    hit = False
                    for b in o.bRepBodies:
                        wb = tbm.copy(b)
                        if kind == 'clear':
                            hit = touches(wb, tool)
                        else:
                            hit = inside(wb, tp) and touches(wb, tool)
                        if hit:
                            break
                    if hit:
                        loc = to_local(tbm.copy(tool), o)
                        lb = bb_list(loc)
                        key = (kind,) + tuple(round(v, 2) for v in lb)
                        per.setdefault(name, {})
                        if key not in per[name]:
                            per[name][key] = (kind, loc)
    # apply per component: ring join (clamps), holes, split gap, leg socket
    for name in TARGETS:
        if only and name not in only:
            continue
        occ = first_occ(ctx, name)
        comp = occ.component
        done = {}
        if name in CLAMPS:
            h = CLAMPS[name]
            ring = tube(P3.create(0, 0, 0), V3.create(0, 1, 0), 1.30, 1.25, h, -h / 2)  # bore 25.0 (rule tube_bore_25.4_clamp_default)
            apply_combine(comp, comp.bRepBodies.item(0), [ring], join=True)
            count('clamp_bore_25.0')
            done['ring'] = 1
        tools = [t for k, t in per.get(name, {}).values()]
        extra = []
        if name == 'Gear_Clamp':
            extra.append(cyl(P3.create(0, 0, -3.0), V3.create(0, 0, 1), 1.30, 1.73))  # vertical leg socket 26.0 (epoxy bond rule)
            count('leg_socket_26.0')
        if tools or extra:
            apply_combine(comp, comp.bRepBodies.item(0), tools + extra)
            for k, t in per.get(name, {}).values():
                count('cut_' + k)
        done['holes'] = len(tools)
        if name in CLAMPS:
            zr = (0.0, 0.04) if name == 'Gear_Clamp' else (-0.04, 0.0)  # 0.4 mm split gap at the boom axis plane y=-0.03
            slab = box(P3.create(0, 0, (zr[0] + zr[1]) / 2), V3.create(1, 0, 0), V3.create(0, 1, 0), 6.0, 10.0, 0.04)
            apply_combine(comp, comp.bRepBodies.item(0), [slab])
            count('split_gap_0.4')
            for b in comp.bRepBodies:
                bb = b.boundingBox
                b.name = '%s_%s' % (name, 'upper' if (bb.minPoint.z + bb.maxPoint.z) / 2 > (zr[0] + zr[1]) / 2 else 'lower')
            done['split'] = [b.name for b in comp.bRepBodies]
        res[name] = done
    return res


def run(context):
    try:
        print('build_detail_fusion: call phase(name)')
    except Exception:
        print(traceback.format_exc())


def phase(name, **kw):
    try:
        data = load_data()
        ctx = Ctx(data)
        fn = globals()['phase_' + name]
        r = fn(ctx, **kw)
        print(name, json.dumps(r)[:1500])
        print('STATS', STATS)
        print('ERRS', len(ERRS), ERRS[:25])
    except Exception:
        print(traceback.format_exc())
