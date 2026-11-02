"""Hardware stage for the Lift + Cruise VTOL Fusion model (task 25).

Run in the Fusion design that already holds the airframe (build_vtol_fusion.py). Reads
hardware_compact.json (a trimmed copy of inventory/hardware/hardware.json, kept next to this file, or in
~/Documents/DBF-Fusion-Export/hw_data.json) and creates root component "Hardware" with one sub-component per joint
("J-01 <name>"). Every hardware instance is a B-rep body built with TemporaryBRepManager directly at its world position
inside one BaseFeature per joint (parametric-safe, no occurrence transforms).

Axis mapping: model (x fwd, y up, z right) metres -> Fusion (z, x, y) * 100 cm (Fusion is Z-up).
Geometry is simplified: no threads, hex recess = round pocket, aerofoil plates = boxes, straps = rings (estimates).
"""
import adsk.core, adsk.fusion, traceback, json, math, os, re

app = adsk.core.Application.get()
P3 = adsk.core.Point3D
V3 = adsk.core.Vector3D
tbm = adsk.fusion.TemporaryBRepManager.get()
BT = adsk.fusion.BooleanTypes


def pt(m):
    return P3.create(m[2] * 100.0, m[0] * 100.0, m[1] * 100.0)


def vec(m):
    v = V3.create(m[2], m[0], m[1])
    v.normalize()
    return v


def add(p, v, d):
    return P3.create(p.x + v.x * d, p.y + v.y * d, p.z + v.z * d)


def frame(a):
    best = None
    for h in ((0, 1, 0), (0, 0, 1), (1, 0, 0)):
        hv = V3.create(*h)
        dp = abs(hv.dotProduct(a))
        if best is None or dp < best[0]:
            best = (dp, hv)
    hv = best[1]
    k = hv.dotProduct(a)
    u = V3.create(hv.x - a.x * k, hv.y - a.y * k, hv.z - a.z * k)
    u.normalize()
    v = a.crossProduct(u)
    v.normalize()
    return u, v


def rot(u, v, ang):
    c, s = math.cos(ang), math.sin(ang)
    r = V3.create(u.x * c + v.x * s, u.y * c + v.y * s, u.z * c + v.z * s)
    r.normalize()
    return r


def cyl(c, a, r, h, off=0.0):
    """cylinder of radius r (cm), height h along a, base at c + a*off."""
    p0 = add(c, a, off)
    return tbm.createCylinderOrCone(p0, r, add(p0, a, h), r)


def cone(c, a, r0, r1, h, off=0.0):
    p0 = add(c, a, off)
    return tbm.createCylinderOrCone(p0, r0, add(p0, a, h), r1)


def box(c, ld, wd, l, w, h):
    """box centred at c: size l along ld, w along wd, h along ld x wd (cm)."""
    obb = adsk.core.OrientedBoundingBox3D.create(c, ld, wd, l, w, h)
    return tbm.createBox(obb)


def bop(a, b, how):
    tbm.booleanOperation(a, b, how)
    return a


def tube(c, a, ro, ri, h, off=0.0):
    o = cyl(c, a, ro, h, off)
    if ri > 0:
        bop(o, cyl(c, a, ri, h + 0.2, off - 0.1), BT.DifferenceBooleanType)
    return o


def hexprism(c, a, s, m, ri=0.0):
    """hex prism, s = across flats (cm), m = height (cm), centred on c; ri = bore radius."""
    u, v = frame(a)
    big = s * 2.2
    body = None
    for k in range(3):
        d = rot(u, v, k * math.pi / 3.0)
        e = a.crossProduct(d)
        e.normalize()
        slab = box(c, d, e, big, s, m)
        # slab: width s along e (flat-to-flat), long along d
        body = slab if body is None else bop(body, slab, BT.IntersectionBooleanType)
    if ri > 0:
        bop(body, cyl(c, a, ri, m + 0.2, -m / 2 - 0.1), BT.DifferenceBooleanType)
    return body


def msize(spec, default=None):
    m = re.search(r'M(\d+(?:\.\d+)?)', spec)
    return float(m.group(1)) if m else default


def union(a, b):
    return bop(a, b, BT.UnionBooleanType)


def build_body(it, ins):
    """Return a temporary B-rep for one instance (None -> marker)."""
    k = it['kind']
    g = it['geom']
    spec = it['spec']
    pm = ins['pos']
    c = pt(pm)
    a = vec(ins['axis'])
    u, v = frame(a)
    mm = 0.1  # mm -> cm

    if k == 'screw':
        d, L, hd, hh = g['d'] * mm, g['L'] * mm, g['head_d'] * mm, g['head_h'] * mm
        sh = cyl(c, a, d / 2, L)
        if g.get('head') == 'socket':
            hdb = cyl(c, a, hd / 2, hh, -hh)
        else:  # button / pan: low dome as truncated cone
            hdb = cone(c, a, hd / 2, hd * 0.36, hh, -hh)
        union(sh, hdb)
        s = g.get('s')
        if s:
            rec = cyl(c, a, s * mm * 0.58, hh * 0.6 + 0.01, -hh - 0.01)
            bop(sh, rec, BT.DifferenceBooleanType)
        return sh
    if k in ('nut', 'nyloc'):
        ms = msize(spec, 3)
        return hexprism(c, a, g['s'] * mm, g['m'] * mm, ms * 0.8 * mm / 2)
    if k in ('washer', 'grommet'):
        return tube(c, a, g['od'] * mm / 2, g['id'] * mm / 2, g['t'] * mm, -g['t'] * mm / 2)
    if k == 'standoff':
        return tube(c, a, g['od'] * mm / 2, g['id'] * mm / 2, g['L'] * mm, -g['L'] * mm / 2)
    if k == 'insert':
        ms = msize(spec, 3)
        return tube(c, a, g['od'] * mm / 2, ms * 0.8 * mm / 2, g['L'] * mm, -g['L'] * mm / 2)
    if k == 'keeper':
        return tube(c, a, (g['id'] + 1.5) * mm / 2, g['id'] * mm / 2, g['L'] * mm, -g['L'] * mm / 2)
    if k == 'axle':
        return cyl(c, a, g['d'] * mm / 2, g['L'] * mm, -g['L'] * mm / 2)
    if k == 'collar':
        return tube(c, a, g['od'] * mm / 2, g['bore'] * mm / 2, g['w'] * mm, -g['w'] * mm / 2)
    if k == 'wheel_hub':
        return tube(c, a, g['od'] * mm / 2, g['bore'] * mm / 2, g['w'] * mm, -g['w'] * mm / 2)
    if k == 'pushrod':
        if 'p1' in ins:
            p1, p2 = pt(ins['p1']), pt(ins['p2'])
            return tbm.createCylinderOrCone(p1, g['d'] * mm / 2, p2, g['d'] * mm / 2)
        return cyl(c, a, g['d'] * mm / 2, g['L_stock'] * mm, -g['L_stock'] * mm / 2)
    if k == 'clevis':
        return box(c, a, u, g['L'] * mm, g['w'] * mm, g['t'] * mm)
    if k == 'horn':
        if 'hole_radius' in g:  # servo arm: arm in the plane perpendicular to a, starts at the shaft
            cc = add(c, u, (g['l'] / 2 - 5) * mm)
            return box(cc, u, v, g['l'] * mm, g['w'] * mm, g['t'] * mm)
        cc = add(c, a, g['l'] / 2 * mm)  # control horn: base at pos, points along a
        return box(cc, u, v, g['w'] * mm, g['t'] * mm, g['l'] * mm) if False else box(cc, u, a, g['w'] * mm, g['l'] * mm, g['t'] * mm)
    if k == 'strap':
        ra = vec([1, 0, 0]) if ins.get('yz') else a
        r = g['L'] / (2 * math.pi)
        return tube(c, ra, (r + g['t'] / 2) * mm, (r - g['t'] / 2) * mm, g['w'] * mm, -g['w'] * mm / 2)
    if k == 'other':
        if 'L_aileron' in g:
            L = g['L_aileron'] if 'Aileron' in ins.get('parent', '') else g['L_elevator']
            t = g['t'] or 0.3
            return box(c, a, u, L * mm, g['w'] * mm, t * mm)
        if 'cross_holes' in g:
            o = cyl(c, a, g['od'] * mm / 2, g['L'] * mm, -g['L'] * mm / 2)
            for off, _ in g['cross_holes']:
                cc = add(c, a, off * mm)
                bop(o, cyl(cc, vec([0, 1, 0]), 1.7 * mm, g['od'] * mm + 0.4, -g['od'] * mm / 2 - 0.2), BT.DifferenceBooleanType)
            return o
        if 'bore' in g:  # prop adapter: base at pos
            return tube(c, a, g['od'] * mm / 2, g['bore'] * mm / 2, g['L'] * mm)
    if k == 'plate':
        t = g.get('t')
        if 'tab_l' in g:
            o = box(c, u, v, g['l'] * mm, g['h'] * mm, t * mm)
            tc = add(add(c, a, (t / 2 + g['tab_l'] / 2) * mm), u, (g['tab_x'] - pm[0] * 1000) * mm)
            return union(o, box(tc, u, v, g['tab_w'] * mm, g['tab_t'] * mm, g['tab_l'] * mm) if False else
                         box(tc, u, a, g['tab_w'] * mm, g['tab_l'] * mm, g['tab_t'] * mm))
        if 'h' in g and 'l' in g:
            return box(c, u, v, g['l'] * mm, g['h'] * mm, t * mm)
        if 'foot_h' in g:  # axle block
            ob = g['outer_d'] * mm
            lg = (g['socket_depth'] + 10) * mm
            o = cyl(c, a, ob / 2, lg, -lg / 2)
            bop(o, cyl(c, a, g['socket_d'] * mm / 2, g['socket_depth'] * mm + 0.1, lg / 2 - g['socket_depth'] * mm), BT.DifferenceBooleanType)
            fc = add(c, a, (-lg / 2 - g['foot_h'] * mm / 2 + 0.1))
            return union(o, box(fc, u, v, g['foot_l_x'] * mm, g['foot_w_z'] * mm, g['foot_h'] * mm) if False else
                         box(fc, u, v, g['foot_l_x'] * mm, g['foot_w_z'] * mm, g['foot_h'] * mm))
        if 'l_rud' in g:  # tail saddle clamshell stub
            ro = g['bore_d'] / 2 + g['wall']
            return tube(c, a, ro * mm, g['bore_d'] * mm / 2, g['l_rud'] * mm, -g['l_rud'] * mm / 2)
        if 'bore_d' in g and 'x' in g:  # pitot clamp post: box in model axes, bore along the axis
            o = box(c, V3.create(0, 1, 0), V3.create(1, 0, 0), g['x'] * mm, g['z'] * mm, g['y'] * mm)
            return bop(o, cyl(c, a, g['bore_d'] * mm / 2, 4.0, -2.0), BT.DifferenceBooleanType)
        if 'x' in g and 'z' in g:  # pads: x along model X, z along model Z, t along a
            return box(c, u, v, g['x'] * mm, g['z'] * mm, t * mm)
        if 'cutout' in g:  # servo tray with window
            o = box(c, u, v, g['l'] * mm, g['w'] * mm, t * mm)
            return bop(o, box(c, u, v, g['cutout'][0] * mm, g['cutout'][1] * mm, t * mm + 0.2), BT.DifferenceBooleanType)
        if 'l' in g and 'w' in g:
            return box(c, u, v, g['l'] * mm, g['w'] * mm, t * mm)
        if isinstance(g.get('od'), list):  # pod former ring (elliptical in CAD, circle of equal area here, est.)
            od = math.sqrt(g['od'][1] * g['od'][2])
            return tube(c, a, od * mm / 2, (od - 2 * g['t']) * mm / 2, g['t'] * mm, -g['t'] * mm / 2)
        if 'id' in g and 'od' in g:
            return tube(c, a, g['od'] * mm / 2, g['id'] * mm / 2, t * mm, -t * mm / 2)
        if 'od' in g and 'L' in g:
            return cyl(c, a, g['od'] * mm / 2, g['L'] * mm, -g['L'] * mm / 2)
        if 'od' in g:
            return cyl(c, a, g['od'] * mm / 2, t * mm, -t * mm / 2)
    return None


# ---------- appearances ----------
_APP = {}
_METAL = {'stainless': 'Stainless Steel - Satin', 'steel': 'Stainless Steel - Satin', 
          'alumin': 'Stainless Steel - Satin'}


def appearance(des, it):
    mat = it['material'].lower()
    col = it['color']
    key = (tuple(round(x, 2) for x in col), next((m for m in _METAL if m in mat), ''))
    ap = _APP.get(key)
    if ap:
        return ap
    nm = 'HWc_%02d%02d%02d_%s' % (tuple(int(round(x * 99)) for x in key[0]) + (key[1] or 'p',))
    ap = des.appearances.itemByName(nm)
    if ap is None:
        lib = app.materialLibraries.itemByName('Fusion Appearance Library')
        base = None
        if key[1]:
            for fb in (_METAL[key[1]], 'Stainless Steel - Satin'):
                try:
                    base = lib.appearances.itemByName(fb)
                except Exception:
                    base = None
                if base:
                    break
        if base is None:
            for bn in ('Plastic - Matte (White)', 'Paint - Enamel Glossy (White)', 'Plastic - Glossy (White)'):
                base = lib.appearances.itemByName(bn)
                if base:
                    break
        ap = des.appearances.addByCopy(base, nm)
        if not key[1]:
            try:
                adsk.core.ColorProperty.cast(ap.appearanceProperties.itemByName('Color')).value = \
                    adsk.core.Color.create(int(col[0] * 255), int(col[1] * 255), int(col[2] * 255), 255)
            except Exception:
                pass
    _APP[key] = ap
    return ap


def load_data():
    here = None
    try:
        here = os.path.dirname(os.path.abspath(__file__))
    except Exception:
        pass
    for p in ((os.path.join(here, 'hardware_compact.json') if here else None),
              os.path.expanduser('~') + '\\Documents\\DBF-Fusion-Export\\hw_data.json'):
        if p and os.path.exists(p):
            return json.load(open(p))
    raise RuntimeError('hardware_compact.json not found')


def build_hardware(ids=None, rebuild=True):
    des = adsk.fusion.Design.cast(app.activeProduct)
    root = des.rootComponent
    data = load_data()
    hwocc = None
    for o in root.occurrences:
        if o.component.name == 'Hardware':
            hwocc = o
    if hwocc is None:
        hwocc = root.occurrences.addNewComponent(adsk.core.Matrix3D.create())
        hwocc.component.name = 'Hardware'
    hw = hwocc.component
    stats = {}
    errs = []
    markers = []
    for j in data['joints']:
        jid = j['id']
        if ids is not None and jid not in ids:
            continue
        items = [i for i in data['items'] if i['joint'] == jid]
        if not items:
            continue
        nm = '%s %s' % (jid, re.sub(r'[^A-Za-z0-9 _+.\-]', '', j['name'])[:48].strip())
        for o in list(hw.occurrences):
            if o.component.name.startswith(jid + ' '):
                if not rebuild:
                    break
                o.deleteMe()
        occ = hw.occurrences.addNewComponent(adsk.core.Matrix3D.create())
        comp = occ.component
        comp.name = nm
        bf = comp.features.baseFeatures.add()
        bf.startEdit()
        made = []
        for it in items:
            for n, ins in enumerate(it['inst'], 1):
                try:
                    b = build_body(it, ins)
                    if b is None:
                        b = tbm.createBox(adsk.core.OrientedBoundingBox3D.create(
                            pt(ins['pos']), V3.create(1, 0, 0), V3.create(0, 1, 0), 0.3, 0.3, 0.3))
                        markers.append('%s_%d' % (it['id'], n))
                    body = comp.bRepBodies.add(b, bf)
                    body.name = ('%s_%d %s' % (it['id'], n, it['spec']))[:70]
                    made.append((body, it))
                except Exception:
                    errs.append('%s_%d: %s' % (it['id'], n, traceback.format_exc().splitlines()[-1]))
        bf.finishEdit()
        for body, it in made:
            try:
                body.appearance = appearance(des, it)
            except Exception:
                errs.append('appearance ' + it['id'])
        stats[jid] = len(made)
    return stats, errs, markers


def run(context):
    try:
        st, errs, mk = build_hardware()
        print(sum(st.values()), st)
        print('errors', len(errs), errs[:20])
        print('markers', mk)
    except Exception:
        print(traceback.format_exc())
