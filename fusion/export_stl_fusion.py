import adsk.core, adsk.fusion, traceback, os, json, time, re
app = adsk.core.Application.get()
GROUPS = {}
for n in ('Wing_Panel_R','Wing_Panel_L','Aileron_R','Aileron_L','Spar_Tube','Wing_Joiner','Wing_Saddle','Wing_Bolt','Boom_Front','Boom_Rear_Stub','Boom_Clamp_Front','Boom_Clamp_Rear','Motor_Mount','H_Tail','Elevator','Fin','Fuselage_Pod','Canopy','Pitot_Tube'): GROUPS[n]='airframe'
for n in ('Lift_Motor','Pusher_Motor','Lift_Prop','Pusher_Prop_14in','Spinner'): GROUPS[n]='propulsion'
for n in ('Gear_Clamp','Landing_Leg'): GROUPS[n]='gear'
GROUPS['Battery_6S_LiPo']='electronics'; GROUPS['Proposed_Wheels']='proposed'

def color_of(occ):
    try:
        for b in occ.component.bRepBodies:
            ap = b.appearance
            if ap is None: continue
            c = adsk.core.ColorProperty.cast(ap.appearanceProperties.itemByName('Color'))
            if c: return [round(c.value.red/255.0,3), round(c.value.green/255.0,3), round(c.value.blue/255.0,3)]
    except Exception: pass
    return [0.6,0.6,0.6]

def nbodies(occ):
    n = occ.component.bRepBodies.count
    for o in occ.component.allOccurrences: n += o.component.bRepBodies.count
    return n

def export(des, geom, path, refine):
    em = des.exportManager
    o = em.createSTLExportOptions(geom, path)
    o.isBinaryFormat = True
    o.sendToPrintUtility = False
    o.meshRefinement = refine
    em.execute(o)

def run_group(which):
    des = adsk.fusion.Design.cast(app.activeProduct)
    root = des.rootComponent
    base = os.path.expanduser('~') + '\\Documents\\DBF-Fusion-Export'
    os.makedirs(base + '\\stl', exist_ok=True)
    R = adsk.fusion.MeshRefinementSettings
    out = []; t = time.time()
    # collect work
    work = []
    counts = {}
    for o in root.occurrences: counts[o.component.name] = counts.get(o.component.name, 0) + 1
    seen = {}
    for o in root.occurrences:
        cn = o.component.name
        if cn == 'Hardware':
            if which == 'hardware':
                for s in o.component.occurrences:
                    work.append(('hardware', s.component.name, None, s))
            continue
        if cn == 'Electronics':
            if which == 'electronics':
                for s in o.component.occurrences:
                    work.append(('electronics', s.component.name, None, s))
            continue
        g = GROUPS.get(cn)
        if g != which: continue
        seen[cn] = seen.get(cn, 0) + 1
        nm = cn if counts[cn] == 1 else '%s_%d' % (cn, seen[cn])
        work.append((g, nm, None, o))
    # root-level proxies for hardware / electronics sub occurrences
    proxies = {}
    if which in ('hardware','electronics'):
        for p in root.allOccurrences:
            proxies[p.fullPathName] = p
    for g, nm, _, o in work:
        try:
            occ = o
            if g in ('hardware','electronics'):
                pre = 'Hardware:1+' if g=='hardware' else 'Electronics:1+'
                cand = [p for k, p in proxies.items() if k.startswith(pre) and p.component.name == nm]
                occ = cand[0]
            fn = re.sub(r'[^A-Za-z0-9_\-]', '_', nm if g != 'hardware' else nm.split(' ')[0] + '_' + '_'.join(nm.split(' ')[1:4])) + '.stl'
            path = base + '\\stl\\' + fn
            ref = R.MeshRefinementLow if g in ('hardware','electronics') else R.MeshRefinementMedium
            export(des, occ, path, ref)
            bb = occ.boundingBox
            e = {'file': 'stl/' + fn, 'name': nm, 'group': g, 'color': color_of(occ), 'count': nbodies(occ),
                 'bbox_cm': [[round(v,3) for v in bb.minPoint.asArray()], [round(v,3) for v in bb.maxPoint.asArray()]],
                 'size': os.path.getsize(path)}
            if g == 'hardware': e['joint'] = nm.split(' ')[0]
            out.append(e)
        except Exception:
            out.append({'name': nm, 'error': traceback.format_exc().splitlines()[-1]})
    pf = base + '\\manifest_part_%s.json' % which
    json.dump(out, open(pf, 'w'))
    print(which, len(out), sum(e.get('size', 0) for e in out), 'errors', [e for e in out if 'error' in e], round(time.time()-t,1))
