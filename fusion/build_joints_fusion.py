"""Joints and motion for the Lift + Cruise VTOL Fusion model (task 31).

Runs INSIDE Fusion (Python add-in API, Fusion 2706).  The MCP stub is

    def run(context):
        exec(open(r'C:\\Users\\trist\\Documents\\DBF-Fusion-Export\\build_joints_fusion.py').read(), globals())
        phase_restructure()        # then phase_joints(), phase_verify(), phase_export()

Frame: model (x fwd, y up, z right) m  ->  Fusion (z, x, y) * 100 cm  (X right, Y fwd, Z up).
The document is a DIRECT-modelling design, so AsBuiltJoints are not available (API: "AsBuiltJointInput is only
supported in parametric"); the rig uses (a) rigid groups for the static structure and (b) Joints created from
construction points placed exactly on the pivots (no repositioning), with revolute / slider motion + motion links.
Data: fusion/joints_spec.json (made by fusion/make_kinematics.py from inventory/hardware/*.json).
"""
import adsk.core, adsk.fusion, traceback, math, json, re, os

app = adsk.core.Application.get()
des = adsk.fusion.Design.cast(app.activeProduct)
root = des.rootComponent
EXPORT = os.path.expanduser('~') + '\\Documents\\DBF-Fusion-Export'
ATTR = 'DBF'


# ------------------------------------------------------------------ helpers
def center(b):
    bb = b.boundingBox
    return ((bb.minPoint.x + bb.maxPoint.x) / 2, (bb.minPoint.y + bb.maxPoint.y) / 2, (bb.minPoint.z + bb.maxPoint.z) / 2)


def side(cx, thr=5.0):
    return 'R' if cx > thr else ('L' if cx < -thr else 'C')


def item_of(bname):
    m = re.match(r'(HW-\d+)', bname)
    return m.group(1) if m else None


def new_comp(name):
    o = root.occurrences.addNewComponent(adsk.core.Matrix3D.create())
    o.component.name = name
    return o


def set_key(occ, key, grp=None):
    """occurrence-level attributes: key = logical name used by the joint spec, grp = rigid-group code."""
    for k, v in (('key', key), ('grp', grp)):
        if v is None:
            continue
        a = occ.attributes.itemByName(ATTR, k)
        if a:
            a.value = v
        else:
            occ.attributes.add(ATTR, k, v)


def get_attr(occ, k):
    a = occ.attributes.itemByName(ATTR, k)
    return a.value if a else None


def census():
    n = 0
    v = 0.0
    for o in root.allOccurrences:
        for b in o.bRepBodies:
            n += 1
            v += b.volume
    for b in root.bRepBodies:
        n += 1
        v += b.volume
    return n, round(v, 4)


def occ_by_key(key):
    for o in root.occurrences:
        if get_attr(o, 'key') == key:
            return o
    return None


# ------------------------------------------------------------------ classification of the merged hardware bodies
LIFT = {'L1': (43.4, 37.1), 'L2': (-43.4, -50.5), 'L3': (-43.4, 37.1), 'L4': (43.4, -50.5)}   # Fusion cm; ESC_Lk naming


def nearest_lift(cx, cy):
    return min(LIFT, key=lambda k: (cx - LIFT[k][0]) ** 2 + (cy - LIFT[k][1]) ** 2)


def classify(jid, bname, c):
    it = item_of(bname)
    cx, cy, cz = c
    sd = side(cx)
    if jid == 'J-17':
        return ('ARM:Aileron_' + sd) if it in ('HW-067', 'HW-068') else 'STAT:' + sd
    if jid == 'J-18':
        return 'ARM:Elevator' if it in ('HW-072', 'HW-073') else 'STAT:' + sd
    if jid == 'J-19':
        return ('ARM:Rudder_' + sd) if it in ('HW-077', 'HW-078') else 'STAT:' + sd
    if jid == 'J-20':
        return ('SURF:Aileron_' + sd) if it in ('HW-079', 'HW-080', 'HW-081', 'HW-082') else 'ROD:Aileron_' + sd
    if jid == 'J-21':
        return 'SURF:Elevator' if it in ('HW-086', 'HW-087', 'HW-088', 'HW-089') else 'ROD:Elevator'
    if jid == 'J-22':
        return ('SURF:Rudder_' + sd) if it in ('HW-093', 'HW-094', 'HW-095', 'HW-096') else 'ROD:Rudder_' + sd
    if jid == 'J-23':
        n = int(re.search(r'_(\d+)', bname).group(1))
        return {1: 'TAPE:Aileron_R', 2: 'TAPE:Aileron_L', 3: 'TAPE:Elevator', 4: 'TAPE:Rudder_R', 5: 'TAPE:Rudder_L'}[n]
    if jid == 'J-10':
        return 'PROP:' + nearest_lift(cx, cy)
    if jid == 'J-12':
        return 'PROP:P'
    if jid in ('J-24', 'J-27'):
        return 'CAN'
    return 'STAT:' + sd


def split_name(full):
    """'J-17 Aileron servo - servo tray R and L arm ...' -> ('J-17', rest)"""
    p = full.split(' ', 1)
    return p[0], (p[1] if len(p) > 1 else '')


# ------------------------------------------------------------------ phase 1: restructure
def phase_restructure():
    pre = census()
    print('before', pre, 'occ', root.occurrences.count)
    reg = {}          # key -> occurrence (root level) for targets
    moved = {'n': 0, 'fail': []}

    def target(key):
        if key in reg:
            return reg[key]
        kind, _, nm = key.partition(':')
        if kind == 'SURF':
            cn = {'Aileron_R': 'Aileron_R', 'Aileron_L': 'Aileron_L', 'Elevator': 'Elevator'}.get(nm)
            if cn:
                o = [x for x in root.occurrences if x.component.name == cn][0]
            else:
                o = new_comp(nm)            # Rudder_R / Rudder_L
        elif kind == 'ARM':
            o = new_comp('Arm_' + nm)
        elif kind == 'ROD':
            o = new_comp('Pushrod_' + nm)
        elif kind == 'TAPE':
            o = new_comp('Hinge_' + nm)
        elif kind == 'PROP':
            o = new_comp('Pusher_Prop_Set' if nm == 'P' else 'Lift_Prop_' + nm)
        elif kind == 'CAN':
            o = new_comp('J-24+27 Canopy screws and GPS mast')
        else:
            raise Exception('bad key ' + key)
        reg[key] = o
        grp = {'Aileron_R': 'WR', 'Aileron_L': 'WL', 'Elevator': 'TAIL', 'Rudder_R': 'WR', 'Rudder_L': 'WL'}.get(nm)
        if kind == 'SURF':
            set_key(o, 'surf:' + nm)
        elif kind == 'ARM':
            set_key(o, 'arm:' + nm)
        elif kind == 'ROD':
            set_key(o, 'rod:' + nm)
        elif kind == 'TAPE':
            set_key(o, 'tape:' + nm, grp)
        elif kind == 'PROP':
            set_key(o, 'prop:' + nm)
        elif kind == 'CAN':
            set_key(o, 'canhw', 'CAN')
        return o

    def move(body, occ_target, copy=False):
        try:
            r = body.copyToComponent(occ_target) if copy else body.moveToComponent(occ_target)
            if r is None:
                moved['fail'].append(body.name)
            else:
                moved['n'] += 1
            return r
        except Exception:
            moved['fail'].append(body.name + ' ' + traceback.format_exc().splitlines()[-1])
            return None

    # ---- A. hardware J components -> classified root components
    hw = [o for o in root.occurrences if o.component.name == 'Hardware'][0]
    subs = list(hw.childOccurrences)
    for s in subs:
        full = s.component.name
        jid, rest = split_name(full)
        groups = {}
        for b in list(s.bRepBodies):
            groups.setdefault(classify(jid, b.name, center(b)), []).append(b)
        for key, bl in groups.items():
            if key.startswith('STAT:'):
                sd = key[5:]
                nsd = len([k for k in groups if k.startswith('STAT:')])
                nm = full if (sd == 'C' and nsd == 1) else '%s [%s]' % (full, sd)
                o = new_comp(nm)
                set_key(o, 'hw:%s:%s' % (jid, sd), {'R': 'WR', 'L': 'WL', 'C': 'POD'}[sd])
            else:
                o = target(key)
            for b in bl:
                move(b, o)
        print(jid, {k: len(v) for k, v in groups.items()})

    # ---- B. propulsion sets: lift prop + motor (bell) + J-10 adapters; pusher prop + spinner + motor + J-12
    lp = [o for o in root.occurrences if o.component.name == 'Lift_Prop']
    lm = [o for o in root.occurrences if o.component.name == 'Lift_Motor']
    for k, (x, y) in LIFT.items():
        o = target('PROP:' + k)
        for lst in (lp, lm):
            m = min(lst, key=lambda q: (center(q.bRepBodies.item(0))[0] - x) ** 2 + (center(q.bRepBodies.item(0))[1] - y) ** 2)
            for b in list(m.bRepBodies):
                move(b, o, copy=True)
    po = target('PROP:P')
    for cn in ('Pusher_Prop_14in', 'Spinner', 'Pusher_Motor'):
        for q in [x for x in root.occurrences if x.component.name == cn]:
            for b in list(q.bRepBodies):
                move(b, po)

    # ---- C. rudders: copy the Rudder body of each Fin occurrence into Rudder_R / Rudder_L
    fins = [o for o in root.occurrences if o.component.name == 'Fin']
    for f in fins:
        for b in list(f.bRepBodies):
            if b.name == 'Rudder':
                sd = 'R' if center(b)[0] > 0 else 'L'
                move(b, target('SURF:Rudder_' + sd), copy=True)
    nat = fins[0].component
    for b in list(nat.bRepBodies):
        if b.name == 'Rudder':
            b.deleteMe()

    # ---- D. electronics: one root component per sub (single body each)
    el = [o for o in root.occurrences if o.component.name == 'Electronics'][0]
    for s in list(el.childOccurrences):
        o = new_comp(s.component.name)
        for b in list(s.bRepBodies):
            move(b, o)
        c = center(o.bRepBodies.item(0)) if o.bRepBodies.count else (0, 0, 0)
        if s.component.name == 'GPS1':
            set_key(o, 'gps', 'CAN')
        else:
            set_key(o, 'el:' + s.component.name, {'R': 'WR', 'L': 'WL', 'C': 'POD'}[side(c[0])])

    # ---- E. wheel legs: wheel (tyre+hub, HW-053) -> Wheel_xx, rest -> Leg_xx hardware
    wg = [o for o in root.occurrences if o.component.name == 'Wheel_Gear'][0]
    for s in list(wg.childOccurrences):
        nm = s.component.name            # Leg_FR ...
        wheel = new_comp('Wheel_' + nm.split('_')[1])
        leg = new_comp(nm)
        for b in list(s.bRepBodies):
            if item_of(b.name) == 'HW-053':
                move(b, wheel)
            else:
                move(b, leg)
        c = center(leg.bRepBodies.item(0))
        set_key(leg, 'leg:' + nm.split('_')[1], 'WR' if c[0] > 0 else 'WL')
        set_key(wheel, 'wheel:' + nm.split('_')[1])

    # ---- F. delete emptied occurrences (containers, drained comps)
    def tree_bodies(o):
        return o.component.bRepBodies.count + sum(tree_bodies(k) for k in o.childOccurrences)
    gone = []
    for cn in ('Lift_Prop', 'Lift_Motor'):          # copied (shared comps), originals removed wholesale
        for o in [x for x in root.occurrences if x.component.name == cn]:
            gone.append(o.name)
            o.deleteMe()
    for o in list(root.occurrences):
        if tree_bodies(o) == 0:
            gone.append(o.name)
            o.deleteMe()
    print('deleted', gone)

    post = census()
    print('after', post, 'occ', root.occurrences.count, 'moved', moved['n'], 'fail', moved['fail'])
    print('bodies delta (expect -0 net after dedupe: copies of 8 lift bodies... )', post[0] - pre[0], 'vol delta', round(post[1] - pre[1], 4))
    return post


# ------------------------------------------------------------------ phase 2: ground, rigid groups, joints, motion links
SIDE_GRP = {'R': 'WR', 'L': 'WL', 'C': 'POD'}


def key_existing():
    """keys and rigid-group codes for the pre-existing (unmoved) root components"""
    lift_mount = {}
    for o in root.occurrences:
        cn = o.component.name
        c = center(o.bRepBodies.item(0)) if o.bRepBodies.count else (0, 0, 0)
        if cn == 'Fuselage_Pod':
            set_key(o, 'pod', 'POD')
        elif cn == 'Wing_Saddle':
            set_key(o, 'saddle', 'POD')
        elif cn == 'Wing_Joiner':
            set_key(o, 'joiner', 'POD')
        elif cn in ('Wing_Panel_R', 'Wing_Panel_L'):
            set_key(o, 'panel:' + cn[-1], SIDE_GRP[cn[-1]])
        elif cn == 'H_Tail':
            set_key(o, 'htail', 'TAIL')
        elif cn == 'Canopy':
            set_key(o, 'canopy', 'CAN')
        elif cn == 'Battery_6S_LiPo':
            set_key(o, 'battery')
        elif cn == 'Motor_Mount':
            k = nearest_lift(c[0], c[1])
            set_key(o, 'mount:' + k, SIDE_GRP[side(c[0])])
        elif cn == 'Boom_Rear_Stub':
            set_key(o, 'stub:' + side(c[0]), SIDE_GRP[side(c[0])])
        elif cn == 'Fin':
            set_key(o, 'fin:' + side(c[0]), SIDE_GRP[side(c[0])])
        elif cn in ('Spar_Tube (1)', 'Spar_Tube (2)', 'Boom_Front', 'Boom_Clamp_Front', 'Boom_Clamp_Rear', 'Gear_Clamp',
                    'Landing_Leg', 'Pitot_Tube'):
            set_key(o, 'st:' + o.name, SIDE_GRP[side(c[0])])


def world_point_proxy(occ, w):
    """construction point in occ's component at WORLD position w (the API takes world coordinates here), returned as an
    assembly-context proxy; corrects the offset when the component is shared by several occurrences."""
    comp = occ.component
    inp_w = list(w)
    for _ in range(3):
        inp = comp.constructionPoints.createInput()
        inp.setByPoint(adsk.core.Point3D.create(*inp_w))
        n = comp.constructionPoints.add(inp)
        px = n.createForAssemblyContext(occ)
        g = px.geometry.asArray()
        d = [w[i] - g[i] for i in range(3)]
        if max(abs(v) for v in d) < 1e-6:
            return px
        n.deleteMe()
        inp_w = [inp_w[i] + d[i] for i in range(3)]
    raise Exception('point placement failed for ' + occ.name)


AXIS = {'X': adsk.fusion.JointDirections.XAxisJointDirection, 'Y': adsk.fusion.JointDirections.YAxisJointDirection,
        'Z': adsk.fusion.JointDirections.ZAxisJointDirection}


def phase_names():
    """strip the ' (1)' Fusion added when the emptied original components were still present"""
    n = 0
    for o in root.occurrences:
        if get_attr(o, 'key') and o.component.name.endswith(' (1)') and not o.component.name.startswith('Spar_Tube'):
            o.component.name = o.component.name[:-4]
            n += 1
    print('renamed', n)


def phase_joints(spec_path=None):
    spec = json.load(open(spec_path or (EXPORT + '\\joints_spec.json')))
    phase_names()
    key_existing()
    for o in root.occurrences:
        if o.isGroundToParent and o.component.name != 'Fuselage_Pod':
            o.isGroundToParent = False      # the first root occurrence is ground-to-parent by default; it blocked the right wing slider
    # J-02 (wing bolt) belongs to the pod/saddle group, not to the wings
    for o in root.occurrences:
        if get_attr(o, 'key') in ('hw:J-02:R', 'hw:J-02:L'):
            set_key(o, get_attr(o, 'key'), 'POD')
    for o in root.occurrences:                       # kinematic id on moving occurrences
        k = get_attr(o, 'key')
        if k in spec['kin_of_key']:
            a = o.attributes.itemByName(ATTR, 'kin')
            if a:
                a.value = spec['kin_of_key'][k]
            else:
                o.attributes.add(ATTR, 'kin', spec['kin_of_key'][k])
    for o in root.occurrences:
        if o.component.name == 'Fuselage_Pod':
            o.isGrounded = True
    # snapshot to detect any repositioning
    snap = {o.name: o.boundingBox.minPoint.asArray() for o in root.occurrences}
    # rigid groups
    groups = {}
    for o in root.occurrences:
        g = get_attr(o, 'grp')
        if g:
            groups.setdefault(g, []).append(o)
    gnames = {'POD': 'RG Pod + saddle + joiner + centre hardware + avionics', 'WR': 'RG Right wing structure (panel, booms, mounts, gear, tail stub, fin, hardware)',
              'WL': 'RG Left wing structure (panel, booms, mounts, gear, tail stub, fin, pitot, hardware)', 'TAIL': 'RG H-tail + elevator hinge tape',
              'CAN': 'RG Canopy + screws + GPS mast + GPS'}
    for g, lst in groups.items():
        coll = adsk.core.ObjectCollection.create()
        for o in lst:
            coll.add(o)
        rg = root.rigidGroups.add(coll, False)
        rg.name = gnames[g]
        print('rigid group', g, len(lst), rg.name)
    # joints
    byk = {}
    for o in root.occurrences:
        k = get_attr(o, 'key')
        if k:
            byk[k] = o
    jobj = {}
    created = []
    for js in spec['joints']:
        try:
            a, b = byk[js['one']], byk[js['two']]
            g1 = adsk.fusion.JointGeometry.createByPoint(world_point_proxy(a, js['pt']))
            g2 = adsk.fusion.JointGeometry.createByPoint(world_point_proxy(b, js['pt']))
            ji = root.joints.createInput(g1, g2)
            if js['type'] == 'revolute':
                ji.setAsRevoluteJointMotion(AXIS[js['axis']])
            else:
                ji.setAsSliderJointMotion(AXIS[js['axis']])
            j = root.joints.add(ji)
            j.name = js['name']
            m = j.jointMotion
            if js['type'] == 'revolute':
                if js['lo'] is not None:
                    L = m.rotationLimits
                    L.isMinimumValueEnabled = True
                    L.minimumValue = math.radians(js['lo'] - 0.1)   # a value exactly at the limit is rejected by the solver
                    L.isMaximumValueEnabled = True
                    L.maximumValue = math.radians(js['hi'] + 0.1)
                    L.isRestValueEnabled = True
                    L.restValue = 0.0
                ax = m.rotationAxisVector.asArray()
            else:
                L = m.slideLimits
                L.isMinimumValueEnabled = True
                L.minimumValue = js['lo']
                L.isMaximumValueEnabled = True
                L.maximumValue = js['hi']
                L.isRestValueEnabled = True
                L.restValue = 0.0
                ax = m.slideDirectionVector.asArray() if hasattr(m, 'slideDirectionVector') else None
            jobj[js['name']] = j
            created.append((js['name'], js['type'], [round(v, 3) for v in ax] if ax else None))
        except Exception:
            created.append((js['name'], 'FAILED', traceback.format_exc().splitlines()[-1]))
    for c in created:
        print(c)
    # motion links: servo arm revolute <-> surface revolute
    links = []
    for js in spec['joints']:
        lk = js.get('link')
        if not lk or js['name'] not in jobj or lk['to'] not in jobj:
            continue
        try:
            inp = root.motionLinks.createInput(jobj[js['name']], jobj[lk['to']])
            inp.valueOne = adsk.core.ValueInput.createByReal(math.radians(45.0))
            inp.valueTwo = adsk.core.ValueInput.createByReal(math.radians(abs(lk['ratio_other_per_this']) * 45.0))
            inp.isReversed = lk['ratio_other_per_this'] < 0
            ml = root.motionLinks.add(inp)
            ml.name = 'Link %s -> %s (ratio %.4f)' % (js['name'], lk['to'], lk['ratio_other_per_this'])
            links.append(ml.name)
        except Exception:
            links.append('FAILED ' + js['name'] + ' ' + traceback.format_exc().splitlines()[-1])
    for l in links:
        print(l)
    # no repositioning?
    worst = 0.0
    for o in root.occurrences:
        if o.name in snap:
            a = o.boundingBox.minPoint.asArray()
            worst = max(worst, max(abs(a[i] - snap[o.name][i]) for i in range(3)))
    print('joints', root.joints.count, 'rigid groups', root.rigidGroups.count, 'motion links', root.motionLinks.count, 'max shift cm', round(worst, 6))


# ------------------------------------------------------------------ phase 3: drive every joint, verify the four-bar rod lengths
def _joint(name):
    for j in root.joints:
        if j.name == name:
            return j
    return None


def _occ_by_kin(kin):
    for o in root.occurrences:
        if get_attr(o, 'kin') == kin:
            return o
    return None


def _cen(o):
    """pose of the occurrence (transform entries; the bounding box is cached and can be stale after a joint change)"""
    return list(o.transform2.asArray())[:12]


def phase_drive(spec_path=None):
    """drive each joint to its limits (or 90 deg / 5 cm when free) and back to 0; report how far the moving occurrence went"""
    spec = json.load(open(spec_path or (EXPORT + '\\joints_spec.json')))
    for ml in root.motionLinks:
        ml.isSuppressed = True
    res = []
    for js in spec['joints']:
        j = _joint(js['name'])
        o = _occ_by_kin(js['kin'])
        if j is None or o is None:
            res.append((js['name'], 'MISSING'))
            continue
        m = j.jointMotion
        c0 = _cen(o)
        if js['type'] == 'revolute':
            hi = math.radians(js['hi']) if js['hi'] is not None else math.radians(90)
            lo = math.radians(js['lo']) if js['lo'] is not None else -math.radians(90)
            m.rotationValue = hi
            c1 = _cen(o)
            m.rotationValue = lo
            c2 = _cen(o)
            m.rotationValue = 0.0
        else:
            hi = js['hi'] if js['hi'] else js['lo']
            lo = js['lo'] if js['lo'] else js['hi']
            m.slideValue = js['hi']
            c1 = _cen(o)
            m.slideValue = js['lo']
            c2 = _cen(o)
            m.slideValue = 0.0
        c3 = _cen(o)
        d = lambda a, b: round(max(abs(a[i] - b[i]) for i in range(len(a))), 4)
        res.append((js['name'], 'hi/lo move cm', d(c0, c1), d(c0, c2), 'back err', d(c0, c3)))
    for ml in root.motionLinks:
        ml.isSuppressed = False
    for r in res:
        print(r)
    return res


def phase_rods(samples=(-45, 25, 45)):
    """rod-length check: arm and surface set to the table angles (links suppressed), pushrod turned about the arm hole;
    measures (a) |arm hole - horn hole| - L and (b) the pushrod's far end vs the horn hole."""
    kin = json.load(open(EXPORT + '\\kinematics_base.json'))
    spec = json.load(open(EXPORT + '\\joints_spec.json'))
    for ml in root.motionLinks:
        ml.isSuppressed = True
    out = []
    for g in kin['groups']:
        if g['kind'] != 'surface':
            continue
        sid = g['id']
        sj = [j for j in spec['joints'] if j['kin'] == sid][0]
        aj = [j for j in spec['joints'] if j['kin'] == 'arm_' + sid][0]
        rj = [j for j in spec['joints'] if j['kin'] == 'rod_' + sid][0]
        so, ao, ro = _occ_by_kin(sid), _occ_by_kin('arm_' + sid), _occ_by_kin('rod_' + sid)
        P1 = aj['pt']                       # placeholder; real hole = rj['pt']
        hole = rj['pt']
        horn = rj['rod_p2_cm']
        L = rj['rod_len_mm'] / 10.0
        pa = world_point_proxy(ao, hole)        # follows the arm
        ps = world_point_proxy(so, horn)        # follows the surface
        pr = world_point_proxy(ro, horn)        # follows the pushrod (far end)
        ja, js_, jr = _joint(aj['name']), _joint(sj['name']), _joint(rj['name'])
        table = {int(k): v for k, v in g['servo_to_surface_deg'].items()}
        rod = [x for x in kin['groups'] if x['id'] == 'rod_' + sid][0]
        psi = {r['servo_deg']: r['rod_angle_deg'] for r in rod['pose_table']}
        for phi in samples:
            ja.jointMotion.rotationValue = math.radians(phi)
            js_.jointMotion.rotationValue = math.radians(table[phi])
            jr.jointMotion.rotationValue = math.radians(psi[phi] - phi)
            A, S_, R_ = pa.geometry.asArray(), ps.geometry.asArray(), pr.geometry.asArray()
            dist = math.sqrt(sum((A[i] - S_[i]) ** 2 for i in range(3)))
            end = math.sqrt(sum((R_[i] - S_[i]) ** 2 for i in range(3)))
            out.append((sid, phi, 'surf_deg', table[phi], 'rod len err mm', round((dist - L) * 10, 3), 'rod end vs horn hole mm', round(end * 10, 3)))
        ja.jointMotion.rotationValue = 0
        js_.jointMotion.rotationValue = 0
        jr.jointMotion.rotationValue = 0
        for p in (pa, ps, pr):
            p.nativeObject.deleteMe()
    for ml in root.motionLinks:
        ml.isSuppressed = False
    for r in out:
        print(r)
    return out


# ------------------------------------------------------------------ phase 4: STL export (world cm, Z-up, binary) + manifest
import struct, time
Q = adsk.fusion.TriangleMeshQualityOptions
AIR = ('Wing_Panel_R', 'Wing_Panel_L', 'Aileron_R', 'Aileron_L', 'Spar_Tube', 'Wing_Joiner', 'Wing_Bolt', 'Boom_Front', 'Boom_Rear_Stub', 'H_Tail',
       'Elevator', 'Fin', 'Fuselage_Pod', 'Canopy', 'Pitot_Tube', 'Rudder_R', 'Rudder_L')
PRINTED = ('Wing_Saddle', 'Boom_Clamp_Front', 'Boom_Clamp_Rear', 'Motor_Mount', 'Gear_Clamp')
MECH = ('J-17', 'J-18', 'J-19', 'J-20', 'J-21', 'J-22', 'J-23')


def color_of(bodies):
    for b in bodies:
        try:
            ap = b.appearance
            if ap is None:
                continue
            c = adsk.core.ColorProperty.cast(ap.appearanceProperties.itemByName('Color'))
            if c:
                return [round(c.value.red / 255.0, 3), round(c.value.green / 255.0, 3), round(c.value.blue / 255.0, 3)]
        except Exception:
            pass
    return [0.6, 0.6, 0.6]


def write_stl(path, bodies, q):
    mn = [1e9] * 3
    mx = [-1e9] * 3
    chunks = []
    for b in bodies:
        mc = b.meshManager.createMeshCalculator()
        mc.setQuality(q)
        m = mc.calculate()
        xs = m.nodeCoordinatesAsDouble
        idx = m.nodeIndices
        for i in range(0, len(xs), 3):
            for k in range(3):
                v = xs[i + k]
                if v < mn[k]:
                    mn[k] = v
                if v > mx[k]:
                    mx[k] = v
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


def safe(s):
    return re.sub(r'[^A-Za-z0-9_\-]', '_', s)


def export_units():
    """one unit per root occurrence: (display name, group, bodies, joint id, file path under the export dir, moving id, rig code)"""
    counts = {}
    for o in root.occurrences:
        counts[o.component.name] = counts.get(o.component.name, 0) + 1
    units = []
    for o in root.occurrences:
        cn = o.component.name
        idx = o.name.rsplit(':', 1)[1]
        nm = cn if counts[cn] == 1 else '%s_%s' % (cn, idx)
        nm = re.sub(r'\s*\((\d+)\)$', r'_\1', nm) if cn.startswith('Spar_Tube') else nm
        kin = get_attr(o, 'kin')
        key = get_attr(o, 'key') or ''
        jid = None
        base = cn
        if re.match(r'J-\d\d', cn):
            jid = cn[:4]
            m = re.match(r'(.*?) \[([RLC])\]$', cn)
            rest = (m.group(1) if m else cn).split(' ', 1)[1]
            words = re.sub(r'[^A-Za-z0-9 ]', '', rest).split()[:3]
            fn = safe(jid + '_' + '_'.join(words) + ('_' + m.group(2) if m else ''))
            g = 'mechanisms' if jid in MECH else 'hardware'
            nm = cn
            if cn.startswith('J-24+27'):
                jid, g, fn = 'J-24', 'hardware', 'J-24_27_Canopy_screws_GPS_mast'
        elif cn.startswith(('Arm_', 'Pushrod_', 'Hinge_')):
            g, fn = 'mechanisms', safe(cn)
        elif cn.startswith('Lift_Prop_L') or cn == 'Pusher_Prop_Set':
            g, fn = 'propulsion', safe(cn)
        elif cn.startswith('Wheel_'):
            g, fn = 'gear', safe(cn)
        elif cn.startswith('Leg_'):
            g, fn = 'gear', 'Wheel_' + safe(re.sub(r'\s*\(\d+\)$', '', cn))
            nm = re.sub(r'\s*\(\d+\)$', '', cn)
        elif key.startswith('el:') or key == 'gps':
            g, fn = 'electronics', safe(re.sub(r'\s*\(\d+\)$', '', cn))
            nm = re.sub(r'\s*\(\d+\)$', '', cn)
        elif cn == 'Battery_6S_LiPo':
            g, fn = 'electronics', safe(nm)
        elif cn in AIR or cn.startswith('Spar_Tube'):
            g, fn = 'airframe', safe(nm)
        elif cn in PRINTED:
            g, fn = 'printed', safe(nm)
        elif cn == 'Landing_Leg':
            g, fn = 'gear', safe(nm)
        else:
            g, fn = 'airframe', safe(nm)
        moving_set = kin and not kin.startswith('slide_') or cn in ('Aileron_R', 'Aileron_L', 'Elevator')
        folder = 'kinematics/' if (kin and not kin.startswith('slide_')) else 'stl/'
        units.append({'o': o, 'name': nm, 'group': g, 'joint': jid, 'file': folder + fn + '.stl', 'moving': kin, 'rig': get_attr(o, 'grp')})
    return units


def phase_export(start=0, end=10 ** 6):
    os.makedirs(EXPORT + '\\stl', exist_ok=True)
    os.makedirs(EXPORT + '\\kinematics', exist_ok=True)
    units = export_units()
    entries = []
    bad = []
    t0 = time.time()
    for u in units[start:end]:
        o = u['o']
        bodies = list(o.bRepBodies)
        if not bodies:
            continue
        q = Q.LowQualityTriangleMesh if u['group'] in ('hardware', 'mechanisms', 'electronics') else Q.NormalQualityTriangleMesh
        path = EXPORT + '\\' + u['file'].replace('/', '\\')
        n, mn, mx = write_stl(path, bodies, q)
        lo = [1e9] * 3
        hi = [-1e9] * 3
        for b in bodies:
            bb = b.boundingBox
            for i in range(3):
                lo[i] = min(lo[i], bb.minPoint.asArray()[i])
                hi[i] = max(hi[i], bb.maxPoint.asArray()[i])
        err = max(max(abs(mn[i] - lo[i]), abs(mx[i] - hi[i])) for i in range(3))
        if err > 0.02:
            bad.append((u['name'], round(err, 3)))
        e = {'file': u['file'], 'name': u['name'], 'group': u['group'], 'color': color_of(bodies), 'count': len(bodies),
             'bbox_cm': [mn, mx], 'size': os.path.getsize(path), 'triangles': n}
        if u['joint']:
            e['joint'] = u['joint']
        if u['moving']:
            e['moving'] = u['moving']
        if u['rig']:
            e['rig'] = u['rig']
        entries.append(e)
    json.dump(entries, open(EXPORT + '\\manifest_part_%d.json' % start, 'w'))
    print('units', len(units), 'exported', len(entries), 'bytes', sum(e['size'] for e in entries), 'bbox mismatch>0.02cm', bad, round(time.time() - t0, 1), 's')
