"""Task 31 finalize: merge the exported manifest (from Fusion, build_joints_fusion.phase_export) with kinematics.json.
Usage: python3 finalize_kinematics.py <extracted export dir>.  Writes inventory/fusion/{manifest.json,stl/,kinematics/} and
fills kinematics.json 'stl' (own files) and 'carries' (transitive riders of each slider)."""
import json, os, sys, shutil, struct
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[1]
man = json.load(open(src + '/manifest.json'))
kin = json.load(open(R + '/inventory/fusion/kinematics/kinematics.json'))
spec = json.load(open(R + '/fusion/joints_spec.json'))
G = {g['id']: g for g in kin['groups']}
rides_rig = spec['rides']
for e in man['entries']:
    sz = os.path.getsize(src + '/' + e['file'])
    assert sz == 84 + 50 * e['triangles'] == e['size'], e['file']
    n = struct.unpack('<I', open(src + '/' + e['file'], 'rb').read(84)[80:84])[0]
    assert n == e['triangles']
    mv = e.get('moving')
    rig = e.pop('rig', None)
    if mv:
        par = G[mv].get('parent')
        if par:
            e['rides'] = par
    elif rig in rides_rig:
        e['rides'] = rides_rig[rig]
# carries: transitive
def riders(sid):
    files, ids = [], []
    for e in man['entries']:
        if e.get('rides') == sid:
            files.append(e['file'])
            if e.get('moving'):
                ids.append(e['moving'])
    for g in kin['groups']:
        if g.get('parent') == sid and g['id'] not in ids:
            ids.append(g['id'])
    for i in list(ids):
        if i.startswith('slide_'):
            f2, i2 = riders(i)
            files += f2
            ids += i2
    return sorted(set(files)), sorted(set(ids))
for g in kin['groups']:
    if g['kind'] == 'slider':
        f, i = riders(g['id'])
        g['carries'] = {'stl': f, 'groups': i}
    else:
        g['stl'] = [e['file'] for e in man['entries'] if e.get('moving') == g['id']]
        assert g['stl'], g['id']
    if g['kind'] == 'slider':
        g['stl'] = [e['file'] for e in man['entries'] if e.get('moving') == g['id']]
for d in ('stl', 'kinematics'):
    p = R + '/inventory/fusion/' + d
    if os.path.isdir(p):
        shutil.rmtree(p) if d == 'stl' else [os.remove(p + '/' + f) for f in os.listdir(p) if f.endswith('.stl')]
    os.makedirs(p, exist_ok=True)
    for f in os.listdir(src + '/' + d):
        shutil.copy(src + '/' + d + '/' + f, p + '/' + f)
json.dump(man, open(R + '/inventory/fusion/manifest.json', 'w'), indent=1)
json.dump(kin, open(R + '/inventory/fusion/kinematics/kinematics.json', 'w'), indent=1)
print('entries', len(man['entries']), 'moving', sum(1 for e in man['entries'] if e.get('moving')), 'rides', sum(1 for e in man['entries'] if e.get('rides')))
