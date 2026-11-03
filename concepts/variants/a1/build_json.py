#!/usr/bin/env python3
"""Builds geometry.json, inventory.json and metrics.json for variant a1 from calc_out.json + the C0 repo files.
Run after calc.py:  python3 -I build_json.py
"""
import json, os, copy, math
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '../../..')
calc = json.load(open(os.path.join(HERE, 'calc_out.json')))
hw = json.load(open(os.path.join(ROOT, 'inventory/hardware/hardware.json')))
inv = json.load(open(os.path.join(ROOT, 'inventory/inventory.json')))
HW_BY_ID = {i['id']: i for i in hw['items']}

ZA = 1.228; YA = 0.012; XA = 0.039   # nacelle axis z, y; motor base x
XT, YT = -0.0716, 0.00448            # spar axis
def r3(v): return round(v, 5)

# ------------------------------------------------------------------ hardware: map C0 pusher items onto the tip nacelles
# C0 pusher axis points -X from the pod; tip nacelle axis points +X.  Map x' = -0.361 - x ; y' = YA + (y + 0.03) ; z' = s*ZA + z ; axes: x flips
def mapinst(inst, s):
    p = inst['pos']; a = inst['axis']
    return {'pos': [r3(-0.361 - p[0]), r3(YA + (p[1] + 0.03)), r3(s * ZA + p[2])],
            'axis': [-a[0], a[1], a[2]], 'parent': 'Tip_Motor_' + ('R' if s > 0 else 'L'),
            'note': inst.get('note', '') + ' [mapped from C0 pusher pattern, x -> -0.361 - x]'}
new_items = []
nid = [0]
def add_item(**k):
    nid[0] += 1
    k['id'] = 'HW-A1-%03d' % nid[0]
    new_items.append(k); return k
def base_from(c0id, joint, extra=None):
    c = copy.deepcopy(HW_BY_ID[c0id])
    d = {k: c[k] for k in ('kind', 'spec', 'thread', 'standard', 'geom', 'material', 'color', 'covered_by', 'est', 'source', 'rationale')}
    d['joint'] = joint; d['c0_template'] = c0id
    if extra: d.update(extra)
    return d
for c0id, joint in (('HW-036', 'J-A1-3'), ('HW-037', 'J-A1-3'), ('HW-041', 'J-A1-4'), ('HW-042', 'J-A1-4'), ('HW-043', 'J-A1-4'),
                    ('HW-139', 'J-A1-4'), ('HW-044', 'J-A1-4'), ('HW-045', 'J-A1-4')):
    d = base_from(c0id, joint)
    ins = []
    for s in (1, -1):
        for i in HW_BY_ID[c0id]['instances']: ins.append(mapinst(i, s))
    d['instances'] = ins; d['qty_total'] = len(ins)
    add_item(**d)
# new fasteners
def mk(joint, kind, spec, thread, standard, geom, material, color, instances_R, covered, est, source, rationale):
    ins = []
    for (pos, axis, parent, note) in instances_R:
        ins.append({'pos': pos, 'axis': axis, 'parent': parent + '_R', 'note': note})
        ins.append({'pos': [pos[0], pos[1], -pos[2]], 'axis': [axis[0], axis[1], -axis[2]], 'parent': parent + '_L', 'note': note + ' (mirror)'})
    add_item(joint=joint, kind=kind, spec=spec, thread=thread, standard=standard, geom=geom, material=material, color=color,
             instances=ins, qty_total=len(ins), covered_by=covered, est=est, source=source, rationale=rationale)
SS = [0.75, 0.75, 0.77]
rt = r3(XT + 0.019)
mk('J-A1-2', 'insert', 'Ruthex-type M3x5.7 brass heat-set insert (tube retention)', 'M3', 'n/a (Ruthex RX-M3x5.7)',
   {'od': 4.6, 'L': 5.7, 'hole_d': 4.0, 'hole_depth_min': 7.3, 'cad_mm': {'bore_d': 4.2, 'bore_depth': 7.5, 'lead_in': '0.4 x 45 deg'}},
   'brass', [0.8, 0.65, 0.3],
   [([XT, YT + 0.019, 1.2125], [0, -1, 0], 'Nacelle_Mount', 'radial, top of the tube barrel, 90 deg from the next; barrel OD 38, wall 6.2'),
    ([XT + 0.019, YT, 1.2125], [-1, 0, 0], 'Nacelle_Mount', 'radial, front of the tube barrel')],
   'P-04 (item 6)', False, 'inventory/hardware/hardware.json HW-040 (insert spec, tolerances.json insert_bore_M3)', 'Thread for the grub screws that pin the Al tube end in the barrel.')
mk('J-A1-2', 'screw', 'ISO 4027 M3x6 A2 grub screw, flat point (tube retention)', 'M3', 'ISO 4027',
   {'d': 3, 'L': 6, 'head': 'grub', 'head_d': 3.0, 'head_h': 0.1, 's': 1.5}, 'A2 stainless', SS,
   [([XT, YT + 0.019, 1.2125], [0, -1, 0], 'Nacelle_Mount', 'seat on barrel outer face, drives inward on the Al tube'),
    ([XT + 0.019, YT, 1.2125], [-1, 0, 0], 'Nacelle_Mount', 'seat on barrel outer face')],
   'P-04 (item 5; M3 grub screws are in the 1290-pc assortment: count to confirm, —)', True,
   'est: grub screw not in hardware.json; HW-139 is the C0 precedent (M3x4 grub)', 'Axial and torque retention of the tube end in the printed barrel (also epoxied).')
mk('J-A1-3', 'strap', 'Cable tie 100 x 2.5 mm (ESC to keel, 2 loops)', '', 'kit item 11', {'w': 2.5, 't': 1.0, 'L': 100.0}, 'nylon', [0.9, 0.9, 0.9],
   [([-0.0275, 0.012, 1.2405], [0, 1, 0], 'ESC_T', 'loop around ESC and keel through slots 4.2 x 1.6 at y -0.0035 and 0.0275'),
    ([-0.0025, 0.012, 1.2405], [0, 1, 0], 'ESC_T', 'second loop')],
   'P-04 (item 11)', True, 'HW-141 precedent (100 x 2.5 tie)', 'Holds the ESC flat on the keel.')
mk('J-A1-3', 'strap', 'Cable tie 100 x 2.5 mm (capacitor to keel)', '', 'kit item 11', {'w': 2.5, 't': 1.0, 'L': 100.0}, 'nylon', [0.9, 0.9, 0.9],
   [([-0.0525, 0.012, 1.2415], [0, 1, 0], 'CAP_T', 'loop through slots at y 0.0015 and 0.0225')],
   'P-04 (item 11)', True, 'HW-141 precedent', 'Holds the 470 uF capacitor.')
mk('J-A1-5', 'insert', 'Ruthex-type M3x5.7 brass heat-set insert (shell screw)', 'M3', 'n/a (Ruthex RX-M3x5.7)',
   {'od': 4.6, 'L': 5.7, 'hole_d': 4.0, 'hole_depth_min': 7.3}, 'brass', [0.8, 0.65, 0.3],
   [([0.036, YA + 0.026, ZA], [0, -1, 0], 'Nacelle_Mount', 'ring rim, top; insert top at r = 26 mm'),
    ([0.036, YA, ZA + 0.026], [0, 0, -1], 'Nacelle_Mount', 'ring rim, outboard side; insert top at r = 26 mm')],
   'P-04 (item 6)', False, 'HW-040 precedent', 'Retains the nacelle shell.')
mk('J-A1-5', 'screw', 'ISO 7380-1 M3x8 A2', 'M3', 'ISO 7380-1', {'d': 3, 'L': 8, 'head': 'button', 'head_d': 5.7, 'head_h': 1.65, 's': 2.0}, 'A2 stainless (304)', SS,
   [([0.036, YA + 0.0295, ZA], [0, -1, 0], 'Nacelle_Shell', 'head seat on washer, radial through shell pad (2.5 mm doubler)'),
    ([0.036, YA, ZA + 0.0295], [0, 0, -1], 'Nacelle_Shell', 'head seat on washer')],
   'P-04 (item 5)', False, 'HW-036 precedent (ISO 7380-1, P-04)', 'Retains the nacelle shell: removable for ESC access.')
mk('J-A1-5', 'washer', 'ISO 7089 M3 A2', 'M3', 'ISO 7089', {'id': 3.2, 'od': 7.0, 't': 0.5}, 'A2 stainless', SS,
   [([0.036, YA + 0.02925, ZA], [0, -1, 0], 'Nacelle_Shell', ''), ([0.036, YA, ZA + 0.02925], [0, 0, -1], 'Nacelle_Shell', '')],
   'P-04 (item 5)', False, 'HW-037 precedent', 'Under head on 0.5 mm shell.')
mk('J-A1-6', 'strap', 'Cable tie 100 x 2.5 mm (XT60H mated-pair retention, tip feed)', '', 'kit item 11', {'w': 2.5, 't': 1.0, 'L': 100.0}, 'nylon', [0.9, 0.9, 0.9],
   [([-0.115, 0.0, 0.095], [0, 0, 1], 'JB_J1', 'at JB_J1 box; one tie per mated pair')],
   'P-04 (item 11)', True, 'HW-141 precedent', 'Pair takes no cable load.')
# pieces removed vs C0
removed_hw = ['HW-034'] + ['HW-036', 'HW-037', 'HW-038', 'HW-039', 'HW-040', 'HW-041', 'HW-042', 'HW-043', 'HW-044', 'HW-045', 'HW-139']
rem_pieces = sum(len(HW_BY_ID[i]['instances']) for i in removed_hw)
rem_pieces += 2   # two ESC_P cable ties from HW-123
add_pieces = sum(i['qty_total'] for i in new_items)
hw_delta = {
    'base_pieces': 613, 'removed_pieces': rem_pieces, 'added_pieces': add_pieces, 'pieces_after': 613 - rem_pieces + add_pieces,
    'removed': [{'id': i, 'spec': HW_BY_ID[i]['spec'], 'qty': len(HW_BY_ID[i]['instances'])} for i in removed_hw] +
               [{'id': 'HW-123 (ESC_P ties)', 'spec': 'Cable tie 200 x 3.6, the two ESC_P loops', 'qty': 2}],
    'modified': [{'id': 'HW-035', 'change': 'pod aft bulkhead ring becomes a solid aft cap: id 30 -> 0 mm, shift aft 6.3 mm to x -0.4000..-0.3935, still PETG, still bonded'}],
    'added': [{'id': i['id'], 'spec': i['spec'], 'qty': i['qty_total'], 'joint': i['joint']} for i in new_items],
}

# ------------------------------------------------------------------ geometry.json
def lr(name, d_r, d_l=None):
    return d_r
parts = []
def part(name, kind, shape, material, color, placements, mass_g, source, **extra):
    d = {'name': name, 'kind': kind, 'shape': shape, 'material': material, 'color': color, 'placements': placements, 'mass_g': mass_g, 'source': source}
    d.update(extra); parts.append(d)
def pl(pos, axis, up=(0, 1, 0)): return {'pos': [r3(v) for v in pos], 'axis': list(axis), 'up': list(up)}
def mirror(placements):
    out = []
    for p in placements:
        out.append({'pos': [p['pos'][0], p['pos'][1], -p['pos'][2]], 'axis': [p['axis'][0], p['axis'][1], -p['axis'][2]], 'up': p['up'], **({'tag': p['tag']} if 'tag' in p else {})})
    return out
SIDES = (('R', 1), ('L', -1))

part('Tip_Tube_Ext', 'part',
     {'type': 'hollow cylinder along model Z', 'OD_mm': 25.4, 'ID_mm': 23.622, 'length_mm': 342.0, 'ops': 'extrude annulus 342 mm along Z; no other features',
      'note': 'cut from the 358 mm offcut of one P-30 boom tube; z 0.880 -> 1.222 (R), mirror for L; butts against the socket end at z = +/-0.880'},
     '6061-T6', [0.718, 0.737, 0.776],
     [dict(pl([XT, YT, 1.051], [0, 0, 1]), tag='R'), dict(pl([XT, YT, -1.051], [0, 0, -1]), tag='L')],
     calc['tip_mass_g_each'] and 63.2, 'cad/params.txt boomOD/boomID (0.0254/0.023622) x 342 mm x matRho 2700; calc.py tube list')
part('Tip_Splice_Sleeve', 'part',
     {'type': 'hollow cylinder along model Z', 'OD_mm': 22.225, 'ID_mm': 19.279, 'length_mm': 74.0, 'ops': 'extrude annulus 74 mm; centred on the socket end (z = +/-0.880) so 37 mm sits in the socket and 37 mm in the tip tube',
      'note': 'cut from the 154 mm offcut of P-32 (two sleeves + kerf); same section as Wing_Joiner'},
     '6061-T6', [0.8, 0.82, 0.86],
     [dict(pl([XT, YT, 0.880], [0, 0, 1]), tag='R'), dict(pl([XT, YT, -0.880], [0, 0, -1]), tag='L')],
     19.2, 'cad/params.txt joinOD/joinID x 74 mm x 2700; calc.py')
part('Nacelle_Mount', 'part',
     {'type': 'one printed body, three features',
      'axis_note': 'nacelle axis A = line along X through (y 0.012, z +/-1.228); tube axis T = line along Z through (x -0.0716, y 0.00448)',
      'ring': {'OD_mm': 57.0, 'thickness_mm': 6.0, 'x_range_m': [0.033, 0.039], 'centre_hole_dia_mm': 20.0,
               'vent_holes': '4 x dia 8 mm on a 38 mm dia circle at 45/135/225/315 deg', 'motor_holes': '4 x dia 3.2 mm on a 19 x 19 mm square about A (as HW-036 pattern), through',
               'shell_pockets': '2 x dia 10 mm x 2.5 mm radial pockets in the rim at the top (+Y) and outboard (+Z for R, -Z for L) positions, x = 0.036; insert bore dia 4.2 x 7.5 in the pocket floor (r 26 -> 20.3 mm)',
               'note': 'replaces C0 firewall HW-034 (58 dia x 6.1 PA6-CF) with the same 19 mm hole square'},
      'keel': {'plate_mm': {'x': 128.0, 'y': 44.0, 'z': 4.0}, 'x_range_m': [-0.095, 0.033], 'y_range_m': [-0.010, 0.034], 'z_range_R_m': [1.226, 1.230],
               'lightening': '3 x dia 14 mm at x -0.060, -0.020, +0.010 (y 0.012), 2 mm fillet to the ring and the barrel',
               'tie_slots': '4.2 x 1.6 mm: ESC loops at x -0.0275 and -0.0025, y -0.0035 and 0.0275; cap loop at x -0.0525, y 0.0015 and 0.0225',
               'note': 'carries motor thrust, torque and weight into the barrel; ESC on its outboard face (z 1.231..1.239), 470 uF capacitor aft of the ESC'},
      'barrel': {'OD_mm': 38.0, 'z_range_R_m': [1.200, 1.236], 'bore_dia_mm': 25.6, 'bore_depth_mm': 24.0, 'bore_from': 'inboard face z = 1.200',
                 'end_cap_mm': 12.0, 'inserts': '2 x M3x5.7 radial at z 1.2125, at +Y and +X, bores dia 4.2 x 7.5',
                 'wire_hole': 'dia 10 mm through the keel at x -0.040, y 0.004 for the power pair and DShot lead',
                 'note': 'inboard face is bonded (epoxy) to the foam tip face and the 25.4 mm tube end; the barrel is the only structural tie from nacelle to wing'}},
     'PA6-CF (Polymaker PA6-CF20, P-01)', [0.118, 0.129, 0.157],
     [dict(pl([0.0, YA, ZA], [1, 0, 0]), tag='R'), dict(pl([0.0, YA, -ZA], [1, 0, 0]), tag='L')], 45.0,
     'calc.py: ring 14 cm3 x 0.7 + keel 11.5 cm3 x 0.8 + barrel 30.5 cm3 x 0.6 fill, x 1.2 g/cc (EST); firewall precedent HW-034')
part('Nacelle_Shell', 'part',
     {'type': 'revolve about A (y 0.012, z +/-1.228), wall 0.5 mm, open both ends',
      'profile_x_vs_radius_mm': [[0.039, 29.0], [-0.100, 29.0], [-0.160, 19.0], [-0.220, 8.0]],
      'profile_note': 'cylinder dia 58 from x 0.039 to -0.100, then a cone (spline, tangent-continuous) to dia 16 at x -0.220; open tail dia 15 mm is the cooling exit',
      'cutouts': ['barrel clearance dia 38.6 mm through the inboard wall centred (x -0.0716, y 0.00448) axis Z',
                  'wire slot 12 x 6 mm at x -0.040, y 0.004 in the inboard wall',
                  '2 x dia 3.4 mm radial holes at x 0.036, top and outboard, each in a dia 9 mm x 2.5 mm internal doubler pad'],
      'swet_m2': calc['nacelle']['Swet_m2']},
     'PETG 0.5 mm vase print (P-05)', [0.929, 0.937, 0.957],
     [dict(pl([0.0, YA, ZA], [1, 0, 0]), tag='R'), dict(pl([0.0, YA, -ZA], [1, 0, 0]), tag='L')], 28.0,
     'calc.py: Swet 0.0384 m2 x 0.5 mm x 1.27 g/cc = 24 g + pads/lip (EST)')
part('Tip_Motor', 'purchased',
     {'copy_of': 'C0 occurrence Pusher_Motor (fusion/build_vtol_fusion.py motor_profile(X))', 'transform': 'rotate 180 deg about model Y so the body extends toward +X; rotor dia 47.5 mm, body length 32 mm; shaft dia 4 mm to x 0.0858',
      'x_range_m': [0.039, 0.071], 'axis': 'A'},
     'SunnySky X4110S 400KV (P-38 / P-40)', [0.176, 0.188, 0.22],
     [dict(pl([0.039, YA, ZA], [1, 0, 0]), tag='R'), dict(pl([0.039, YA, -ZA], [1, 0, 0]), tag='L')], 165.0,
     'https://sunnyskyusa.com/collections/multirotor-motors/products/sunnysky-x4110s-motors (165 g, 2026-11-02)')
part('Tip_Prop_R', 'purchased',
     {'copy_of': 'C0 occurrence Pusher_Prop_14in (APC 14x8.5EP envelope, dia 355.6 mm)', 'transform': 'rotate 180 deg about model Y, translate to x 0.077; mirror the blade pair about the plane containing A and Y (z -> -z in prop-local) to make the standard-rotation (right-hand) APC LP14085E',
      'disc': 'dia 355.6 mm in the Y-Z plane at x 0.077', 'rotation': 'clockwise seen from behind (from -X): +X right-hand rotation, inboard blade moves UP'},
     'APC 14x8.5E (standard rotation)', [0.059, 0.059, 0.067], [pl([0.077, YA, ZA], [1, 0, 0])], 37.1,
     'https://www.apcprop.com/product/14x8-5e/ (1.31 oz, 2026-11-02)')
part('Tip_Prop_L', 'purchased',
     {'copy_of': 'C0 occurrence Pusher_Prop_14in (APC 14x8.5EP, reverse rotation)', 'transform': 'rotate 180 deg about model Y, translate to x 0.077 (no mirror: the EP is the left-hand part)',
      'disc': 'dia 355.6 mm in the Y-Z plane at x 0.077', 'rotation': 'counter-clockwise seen from behind: -X rotation, inboard blade moves UP'},
     'APC 14x8.5EP (reverse rotation)', [0.059, 0.059, 0.067], [pl([0.077, YA, -ZA], [1, 0, 0])], 37.1,
     'https://www.apcprop.com/product/14x8-5ep/ (1.31 oz, "Left Hand Rotation", 2026-11-02)')
part('Tip_Spinner', 'part',
     {'copy_of': 'C0 occurrence Spinner (revolve profile (0,0),(0,.021),(-.012,.019),(-.026,.012),(-.038,0) about X)', 'transform': 'mirror the profile to +X: base r 21 mm at x 0.081, tip at x 0.119',
      'base_dia_mm': 42.0, 'length_mm': 38.0},
     'PETG / TPU printed (M-19)', [0.949, 0.957, 0.969],
     [dict(pl([0.081, YA, ZA], [1, 0, 0]), tag='R'), dict(pl([0.081, YA, -ZA], [1, 0, 0]), tag='L')], 8.0, 'EST; C0 Spinner row M-19 has no mass')
part('ESC_T', 'purchased',
     {'type': 'box', 'size_mm': {'x': 45, 'y': 25, 'z': 8}, 'note': 'same envelope as ESC_P (components.json); lies flat on the outboard keel face, long edge along X'},
     'SoloGood 45A BLHeli_S (P-15)', [0.1, 0.35, 0.2],
     [dict(pl([-0.015, YA, ZA + 0.011], [1, 0, 0]), tag='R'), dict(pl([-0.015, YA, -(ZA + 0.011)], [1, 0, 0]), tag='L')], 15.0,
     'inventory/electrical/components.json ESC_P mass_g 15 (EST)')
part('CAP_T', 'purchased', {'type': 'cylinder along X', 'dia_mm': 10.0, 'length_mm': 20.0, 'note': '470 uF 35 V radial can, leads to the ESC input pads'},
     'Panasonic 470 uF 35 V (G-04)', [0.1, 0.1, 0.45],
     [dict(pl([-0.0525, YA, ZA + 0.0055], [1, 0, 0]), tag='R'), dict(pl([-0.0525, YA, -(ZA + 0.0055)], [1, 0, 0]), tag='L')], 4.0, 'EST; dims not in components.json (CAP_*: —)')
part('Battery_Tray_Ext', 'part',
     {'type': 'two printed rails, each 170 mm x 14 mm x 8 mm L-section', 'x_range_m': [-0.205, -0.035], 'z': [-0.035, 0.035],
      'note': 'extends the C0 battery tray (J-25) aft so the pack slides rearward to x -0.1137; bonded to the aft formers'},
     'PETG (P-05)', [0.118, 0.129, 0.157], [pl([-0.12, -0.075, 0.0], [1, 0, 0])], 12.0, 'EST')
part('Pod_Aft_Cap', 'part', {'type': 'see modify HW-035 (solid disc dia 58 x 6.5 mm at x -0.4000..-0.3935)'}, 'PETG', [0.118, 0.129, 0.157], [pl([-0.39675, -0.03, 0.0], [1, 0, 0])], 0.0,
     'same part as HW-035, no new mass', note='listed so the Fusion agent finds it; geometry in the modify list')
# wires
wires = []
for nm, s in SIDES:
    wires.append({'name': 'W_TIP_PWR_' + nm, 'kind': 'wire', 'gauge': '12 AWG (0.415 m per conductor, BUS1 to J1) then 14 AWG (1.263 m per conductor, J1 to ESC_T); red + black',
                  'route_m': [[0.2, -0.06, 0.0], [0.12, -0.09, s * 0.02], [-0.02, -0.09, s * 0.04], [-0.09, -0.05, s * 0.065], [-0.12, 0.0, s * 0.09],
                              [-0.04, 0.0, s * 0.25], [-0.04, 0.004, s * 1.20], [-0.03, 0.012, s * 1.215]],
                  'joint_at': 'J1 (XT60H pair at z +/-0.095)', 'mass_g': 92.3, 'length_est_m': calc['wire']['L_est_m'],
                  'source': 'calc.py wire block (route length x 1.10 slack; 36 / 24 g/m EST)'})
    wires.append({'name': 'W_TIP_SIG_' + nm, 'kind': 'wire', 'gauge': 'JR 3-pin lead, DShot (white + black), 1.9 m', 'route_m': 'same path as W_TIP_PWR, in the same groove',
                  'joint_at': 'J1 (JR pair)', 'mass_g': 3.0, 'source': 'EST'})
wires.append({'name': 'W02_ext', 'kind': 'wire', 'gauge': '10 AWG pair, +0.174 m (battery moved aft)', 'route_m': 'XT90S moves aft with the pack: trunk W02 gains 0.174 m each conductor', 'mass_g': 16.0, 'source': 'EST 47 g/m'})
parts_all = parts + wires

geometry = {
    'base': 'VTOL C0 full', 'frame': 'model X fwd, Y up, Z right, m', 'variant': 'a1 Wingtip cruise propellers', 'date': '2026-11-02',
    'conventions': 'R parts at +Z; mirror to L at -Z (z -> -z, axis z flips). Nacelle axis A = line along X through (y 0.012, z = +/-1.228). Fusion cm Z-up: model (x,y,z) m -> Fusion (z,x,y) x 100.',
    'remove': [
        {'name': 'Pusher_Prop_Set', 'why': 'merged pusher motor + 14x8.5EP + spinner + J-10/J-12 adapter hardware (16 pieces); comp= lines Pusher_Motor, Pusher_Prop_14in, Spinner in cad/params.txt', 'joint_removed': 'prop_P'},
        {'name': 'J-11 Pusher motor - firewall - pod aft bulkhead', 'why': '22 pieces; firewall HW-034, motor screws HW-036/037, firewall screws HW-038/039, inserts HW-040. The bulkhead HW-035 stays, modified (see modify).'},
        {'name': 'ESC_P', 'why': 'pusher ESC in the pod boat-tail'}, {'name': 'CAP_P', 'why': 'pusher ESC capacitor'},
        {'name': 'J-29 ESC mounting ... [C]', 'why': 'the two cable ties that held ESC_P to the pod former'},
        {'name': 'W08 / W15 / W25', 'why': 'pusher ESC power feed, phase leads and DShot lead (inventory/electrical/wiring.json); delete if modelled as wire bodies'},
    ],
    'modify': [
        {'target': 'Battery_6S_LiPo', 'change': 'move aft to hold the CG at -0.0668 m', 'params': {'from_pos_m': [0.0605, -0.05, 0.0], 'to_pos_m': [calc['battery_x_A1'], -0.05, 0.0], 'shift_m': -calc['battery_shift_aft_m'],
                                                                                         'new_extent_x_m': [round(calc['battery_x_A1'] - 0.0775, 4), round(calc['battery_x_A1'] + 0.0775, 4)]},
         'note': 'pack now sits under the wing saddle (saddle y -0.0136..0.0225, pack top y -0.025): 11 mm clearance'},
        {'target': 'J-25 Pod formers battery tray straps / Fuselage_Pod', 'change': 'extend the tray aft with Battery_Tray_Ext and cut a bottom battery slot hatch 170 x 60 mm in the pod skin at x -0.205..-0.035', 'params': {'hatch_mm': [170, 60], 'x_range_m': [-0.205, -0.035]}},
        {'target': 'XT90S_1 and W01/W02', 'change': 'XT90S pull-to-disconnect moves with the pack front', 'params': {'from_pos_m': [0.165, -0.05, 0.0], 'to_pos_m': [round(0.165 - calc['battery_shift_aft_m'], 4), -0.05, 0.0]}},
        {'target': 'HW-035 Pod aft bulkhead ring', 'change': 'becomes a solid aft cap (the firewall is gone)', 'params': {'id_mm': 0, 'od_mm': 58, 't_mm': 6.5, 'new_pos_m': [-0.39675, -0.03, 0.0], 'x_range_m': [-0.4, -0.3935]}},
        {'target': 'Wing_Panel_R / Wing_Panel_L', 'change': 'tip bore for the Al extension, upper-skin wire groove, notch none',
         'params': {'bore': 'dia 25.6 mm along Z through (x -0.0716, y 0.00448) from z +/-0.880 (socket end) to +/-1.200 (tip face)',
                    'groove': 'upper-skin groove 7 mm wide x 4 mm deep, polyline (x,z): (-0.12,0.09) -> (-0.04,0.25) -> (-0.04,1.200); mirror for L',
                    'tip_face': 'flat at z +/-1.200, unchanged'}},
        {'target': 'Aileron_R / Aileron_L', 'change': 'none; check only', 'params': {'clearance_to_nacelle_mm': 14, 'at': 'x -0.1766 (hinge), shell radius 15.6 mm at that station, aileron end z 1.198 vs shell surface z 1.2124'}},
        {'target': 'Pitot_Tube and J-31 clamp (left)', 'change': 'move inboard 0.10 m out of the left prop induction field', 'params': {'from_z_m': -1.0, 'to_z_m': -0.9, 'note': 'prop disc inner edge at z -1.050; hose W32/W33 shortens by 0.1 m'}},
        {'target': 'JB_J1_R / JB_J1_L', 'change': 'box carries a third XT60H pair and a sixth JR pair per side', 'params': {'new_pairs': {'XT60H': 1, 'JR_3pin': 1}}},
        {'target': 'mass / CG / SM', 'change': 'results only (no geometry)', 'params': {'mass_kg': calc['mass_kg'], 'cg_x_m': calc['cg_target_m'], 'static_margin_pct_est': calc['SM_pct']}},
    ],
    'add': parts_all,
    'hardware': new_items,
    'hardware_removed': [{'id': i, 'spec': HW_BY_ID[i]['spec'], 'pieces': len(HW_BY_ID[i]['instances'])} for i in removed_hw],
    'moving': [
        {'name': 'prop_TR', 'kind': 'revolute', 'parent': 'Nacelle_Mount_R', 'pivot': [0.077, YA, ZA], 'axis': [1, 0, 0], 'limits': 'continuous', 'note': 'cruise direction +X right-hand = clockwise seen from behind; contains Tip_Prop_R + Tip_Spinner_R + Tip_Motor_R can + adapter hardware'},
        {'name': 'prop_TL', 'kind': 'revolute', 'parent': 'Nacelle_Mount_L', 'pivot': [0.077, YA, -ZA], 'axis': [-1, 0, 0], 'limits': 'continuous', 'note': 'cruise direction -X right-hand = counter-clockwise seen from behind'},
        {'name': 'prop_P', 'kind': 'remove', 'note': 'delete the C0 pusher revolute and its kinematics group'},
        {'name': 'slide_panel_R / slide_panel_L', 'kind': 'slider', 'note': 'unchanged slide; Tip_Tube_Ext, Tip_Splice_Sleeve, Nacelle_*, Tip_Motor, ESC_T, CAP_T, wires ride the panel group. Extent grows from z 1.200 to 1.257 (shell outer face).'},
    ],
    'checks': {
        'width_over_disks_m': round(calc['width_m'], 3), 'margin_to_3m_m': round(calc['margin_to_3m_m'], 3), 'span_m': 2.4,
        'prop_disc_to_wing_LE_m': 0.077, 'disc_inner_edge_z_m': round(ZA - 0.1778, 3), 'disc_bottom_above_leg_foot_mm': calc['ground']['disc_bottom_above_ground_mm_noWheels'],
        'roll_to_prop_strike_deg': {'no_wheels': calc['ground']['roll_to_strike_deg_noWheels'], 'wheels_G01': calc['ground']['roll_to_strike_deg_wheels']},
        'interference_to_run': ['shell vs Aileron end (expect 14 mm)', 'prop disc vs Wing LE and pitot (disc inner edge z 1.050 vs pitot at 0.90)', 'battery top vs Wing_Saddle underside (expect 11 mm)', 'tube end 1.222 vs barrel bore end 1.224', 'wire groove vs aileron servo bay (servo at x -0.151..-0.082, groove at x -0.04)'],
    },
}
json.dump(geometry, open(os.path.join(HERE, 'geometry.json'), 'w'), indent=1)

# ------------------------------------------------------------------ inventory.json
rows = copy.deepcopy(inv['rows'])
CH = {
 'P-04': ('same', 'Net M3x10 button +7, M3 washers +7, M3x8 button +4, grub M3x6 +4, M3 inserts +8, ties +7 vs C0: confirm the 1290-pc assortment (P-04 item 5) and 100 inserts (item 6) cover them; epoxy see A1-B2'),
 'P-06': ('same', 'W08 (1.23 conductor-m of 12 AWG) is freed; 1.66 conductor-m of the 2.85 free in the two packs go to the BUS1->J1 legs of the tip feeds'),
 'P-07': ('same', 'Now used: 5.05 of 6.1 conductor-m for the J1->ESC_T runs (C0 used 0.134)'),
 'P-08': ('same', '10 of 12 pairs used (C0: 8): +1 pair per side at J1 for the tip feed'),
 'P-09': ('same', '+1 JR pair per side at J1 for the tip DShot lead'),
 'P-01': ('same', 'Print use: +2 Nacelle_Mount (90 g) - firewall (14 g) = +76 g of the 500 g spool; C0 spool use is — (not tabulated)'),
 'P-05': ('same', 'Print use: +2 Nacelle_Shell 56 g, +2 spinner 16 g, tray rails 12 g, aft cap, = +84 g of 2 kg PETG'),
 'P-15': ('changed', 'Role: 6 of 8 ESCs fly (4 lift + 2 tip); spares fall from 3 to 2. Qty unchanged'),
 'P-23': ('changed', 'Role: left-tip prop (APC reverse rotation) = 1 flying + 2 spares; right tip needs the standard-rotation LP14085E (new line A1-B1)'),
 'P-30': ('changed', 'Offcut use: the 358 mm remainder of each 72 in tube becomes a 342 mm tip extension (Tip_Tube_Ext) -> zero spare length'),
 'P-32': ('changed', 'Offcut use: the 154 mm remainder is cut into two 74 mm splice sleeves'),
 'P-38': ('changed', 'Role: right tip motor (was pusher). Qty unchanged; mounts to Nacelle_Mount_R'),
 'P-40': ('changed', 'Role: left tip motor (was the single spare). No spare motor remains: optional line A1-O1 restores one'),
 'M-01': ('changed', 'Left panel: add dia 25.6 mm tip bore z -0.880..-1.200 and the 7 x 4 mm upper-skin wire groove'),
 'M-02': ('changed', 'Right panel: same as M-01, mirrored'),
 'M-17': ('changed', 'Pod: bottom battery slot 170 x 60 mm, tray rails extended aft (A1-M5), aft end closed by the solid cap (A1-M6)'),
 'M-19': ('changed', 'Spinner qty 1 -> 2 (one per tip); still "to source" (print)'),
 'N-02': ('changed', 'Carbon 14 in pusher prop on demand: qty 2 -> 4 (1 clockwise + 1 counter-clockwise flying pair + a spare pair), tractor-mounted at the tips'),
 'G-04': ('changed', 'Proposed capacitor qty 6 -> 7: 6 ESCs fly (4 lift + 2 tip) + 1 spare (C0: 5 + 1). +$2.49, not in committed spend'),
}
ids_removed = {}  # none of the C0 inventory rows disappears (the pusher parts are re-used at the tips)
for r in rows:
    st, note = CH.get(r['ID'], ('same', ''))
    r['Status vs C0'] = st; r['A1 note'] = note
    if r['ID'] == 'M-19': r['Qty needed'] = 2
    if r['ID'] == 'N-02': r['Qty needed'] = 4
    if r['ID'] == 'G-04': r['Qty needed'] = 7; r['Ext USD'] = round(7 * r['Unit USD'], 2)
    if r['ID'] == 'P-38': r['Item'] = 'SunnySky X4110S 400KV (RIGHT TIP motor; was pusher)'; r['CAD part'] = 'Tip_Motor_R'
    if r['ID'] == 'P-40': r['Item'] = 'X4110S (LEFT TIP motor; was the spare)'; r['CAD part'] = 'Tip_Motor_L'
    if r['ID'] == 'P-23': r['Item'] = 'APC 14x8.5EP reverse-rotation prop (LEFT tip: 1 flying + 2 spare)'; r['CAD part'] = 'Tip_Prop_L'
    if r['ID'] == 'N-02': r['CAD part'] = 'Tip_Prop_R / Tip_Prop_L'
    if r['ID'] == 'M-19': r['CAD part'] = 'Tip_Spinner_R / Tip_Spinner_L'
    if r['ID'] == 'P-12': r['Notes'] = (r['Notes'] + ' ').strip();
base_cols = inv['columns']
def newrow(id_, item, typ, cat, kit, cad, qty, status, vendor, unit, made, proc, source, notes, url='', checked='', mb='', stat='new'):
    r = {c: '' for c in base_cols}
    r.update({'ID': id_, 'Item': item, 'Type': typ, 'Category': cat, 'Kit': kit, 'CAD part': cad, 'Qty needed': qty, 'Qty ordered': 0, 'Qty on hand': 0, 'Status': status,
              'Vendor': vendor, 'Unit USD': unit, 'Ext USD': round(unit * qty, 2), 'Made from': made, 'Process': proc, 'Location': '—', 'Source': source, 'Notes': notes})
    r['Status vs C0'] = stat; r['A1 note'] = ''; r['URL'] = url; r['Date checked'] = checked; r['Make/Buy'] = mb
    return r
new_rows = [
 newrow('A1-B1', 'APC 14x8.5E propeller LP14085E (standard rotation, clockwise from behind) for the RIGHT tip: 1 flying + 1 spare', 'Buy', 'Cruise propulsion', 'K4', 'Tip_Prop_R', 2, 'To order',
        'APC Propellers', 6.79, '', '', 'https://www.apcprop.com/product/14x8-5e/ (price 2026-11-02; shipping —)', 'Left tip uses P-23 (EP, left-hand). Hold while the NWA carbon props are unconfirmed (N-02).',
        'https://www.apcprop.com/product/14x8-5e/', '2026-11-02', 'buy'),
 newrow('A1-B2', 'Gorilla 2-part epoxy 5 min 0.85 oz (second pack: tube splices, barrel bond, nacelle bond)', 'Buy', 'Airframe', 'K7', '', 1, 'To order', 'Amazon', 5.97, '', '',
        'docs/research/budget-airframe.md §3a item 13 (price 2026-10-13; Amazon page blocked to the fetcher by robots.txt on 2026-11-02, so not re-read)', 'EST need: about 25 g per tip. The C0 kit has one pack.',
        'https://www.amazon.com/dp/B001Z3C3AG', '2026-10-13 (repo)', 'buy'),
 newrow('A1-M1', 'Tip extension tube R/L, 6061-T6 1.000 x 0.035 in x 342 mm (z 0.880..1.222)', 'Make', 'Airframe', 'K1', 'Tip_Tube_Ext', 2, 'To make', 'In-house', 0, 'P-30', 'Saw + deburr', 'concepts/variants/a1/calc.py', '63.2 g each', mb='make'),
 newrow('A1-M2', 'Splice sleeve R/L, 6061-T6 0.875 x 0.058 in x 74 mm', 'Make', 'Airframe', 'K1', 'Tip_Splice_Sleeve', 2, 'To make', 'In-house', 0, 'P-32', 'Saw + deburr', 'concepts/variants/a1/calc.py', '19.2 g each', mb='make'),
 newrow('A1-M3', 'Nacelle mount R/L (ring + keel + tube barrel, one print)', 'Make', 'Airframe', 'K4', 'Nacelle_Mount', 2, 'To make', 'In-house', 0, 'P-01', 'FDM PA6-CF', 'geometry.json', 'EST 45 g each', mb='make'),
 newrow('A1-M4', 'Nacelle shell R/L, 0.5 mm vase print, dia 58 x 259 mm', 'Make', 'Airframe', 'K4', 'Nacelle_Shell', 2, 'To make', 'In-house', 0, 'P-05', 'FDM PETG', 'geometry.json', 'EST 28 g each', mb='make'),
 newrow('A1-M5', 'Battery tray rail extension (2 rails)', 'Make', 'Airframe', 'K4', 'Battery_Tray_Ext', 1, 'To make', 'In-house', 0, 'P-05', 'FDM PETG', 'geometry.json', 'EST 12 g', mb='make'),
 newrow('A1-M6', 'Pod aft cap (HW-035 as a solid disc)', 'Make', 'Airframe', 'K4', 'Pod_Aft_Cap', 1, 'To make', 'In-house', 0, 'P-05', 'FDM PETG', 'geometry.json', 'replaces the ring', mb='make'),
 newrow('A1-M7', 'Tip feed harness R/L (12 AWG 0.83 m + 14 AWG 2.6 m, XT60H + JR at J1)', 'Make', 'Electrical', 'K4', 'W_TIP_PWR_R / W_TIP_PWR_L', 2, 'To make', 'In-house', 0, 'P-06, P-07, P-08, P-09', 'Solder + heat shrink', 'wire.json route in geometry.json', 'EST 105 g each incl. connectors', mb='make'),
 newrow('A1-O1', 'OPTIONAL (not in committed spend): spare X4110S 400KV to restore the spare motor', 'Optional', 'Spares', 'K4', '', 1, 'Optional', 'SunnySky USA', 46.99, '', '',
        'https://sunnyskyusa.com/collections/multirotor-motors/products/sunnysky-x4110s-motors (2026-11-02, 60 in stock)', 'Take from the reserve only if the thrust-stand tests T1-T6 pass', 'https://sunnyskyusa.com/collections/multirotor-motors/products/sunnysky-x4110s-motors', '2026-11-02', 'buy'),
]
rows += new_rows
goods = sum(r['Ext USD'] for r in rows if r['Type'] == 'Buy')
tax_rate = 0.1025
tax = round(goods * tax_rate, 2); shipping = 100
committed = round(goods + tax + shipping, 2); reserve = round(2000 - committed, 2)
c0 = inv['summary']
prop_goods = sum(r['Ext USD'] for r in rows if r['Type'] == 'Proposed')
summary = {
    'generated': '2026-11-02', 'variant': 'a1', 'cap': 2000, 'goods': round(goods, 2), 'tax': tax, 'shipping': shipping, 'shipping_note': 'C0 EST allowance $100 unchanged; APC and SunnySky shipping not quoted (—)',
    'taxRate': tax_rate, 'tax_rule': 'goods (Type = Buy) x 10.25 %, as inventory/build_inventory.mjs; Proposed lines are outside committed spend',
    'committed': committed, 'reserve': reserve,
    'C0_committed': c0['committed'], 'C0_reserve': c0['reserve'], 'delta_vs_C0_committed': round(committed - c0['committed'], 2),
    'delta_goods': round(goods - c0['goods'], 2),
    'proposed': {'goods': round(prop_goods, 2), 'withTax': round(prop_goods * (1 + tax_rate), 2), 'reserveAfter': round(2000 - committed - prop_goods * (1 + tax_rate), 2),
                 'C0_reserveAfter': c0['proposed']['reserveAfter']},
    'optional_spare_motor': {'goods': 46.99, 'withTax': round(46.99 * (1 + tax_rate), 2), 'reserveAfterIfBought': round(reserve - 46.99 * (1 + tax_rate), 2)},
    'counts': {'rows': len(rows), 'C0_rows': len(inv['rows']), 'same': sum(1 for r in rows if r['Status vs C0'] == 'same'), 'changed': sum(1 for r in rows if r['Status vs C0'] == 'changed'),
               'removed': 0, 'new': sum(1 for r in rows if r['Status vs C0'] == 'new')},
    'removed_note': 'No C0 inventory row is removed: the pusher motor (P-38), the spare motor (P-40), the EP props (P-23) and the spinner row (M-19) are re-used at the tips. Removed items are the CAD/hardware pieces listed in hardware_delta.',
    'mass_delta_kg': calc['delta_mass_kg'], 'mass_kg': calc['mass_kg'], 'hardware_delta': hw_delta,
    'NWA_note': 'If NWA carbon props arrive free, N-02 (qty 4) replaces A1-B1 and P-23: freed goods = 2 x 6.79 + 3 x 6.79 = $33.95 (+ tax $3.48)',
}
inventory = {'base': 'inventory/inventory.json (C0, 67 rows)', 'variant': 'a1', 'status_key': {'same': 'unchanged', 'changed': 'qty/spec/role change (see A1 note)', 'removed': 'deleted', 'new': 'added by A1'},
             'summary': summary, 'columns': base_cols + ['Status vs C0', 'A1 note', 'URL', 'Date checked', 'Make/Buy'], 'rows': rows}
json.dump(inventory, open(os.path.join(HERE, 'inventory.json'), 'w'), indent=1)

# ------------------------------------------------------------------ metrics.json
cr = calc['cruise']['central']
# range: nacelle CdA x0.5 .. x2 and Sinnige delta-e 40 % .. 20 % (calc.py sensitivities, recomputed here)
q_ = 0.5 * 1.225 * 400
def _D(cda_scale, de):
    import math
    S_ = 0.57282037; AR_ = 10.055508; W_ = calc['mass_kg'] * 9.80665
    CL_ = W_ / (q_ * S_); e_ = 0.8 * (1 + de * calc['prop_each']['CT_ratio'])
    return (0.058979417 + calc['nacelle']['CdA_each_m2'] * 2 * cda_scale / S_ + CL_**2 / (math.pi * e_ * AR_)) * q_ * S_
RNG_P = [round(_D(0.5, 0.40) * 20 / 0.51, 1), round(_D(2.0, 0.20) * 20 / 0.51, 1)]
RNG_E = [round((144.3 * 0.95 * 0.8 - calc['hover_W'] * 160 / 3600) / RNG_P[1] * 60, 2), round((144.3 * 0.95 * 0.8 - calc['hover_W'] * 160 / 3600) / RNG_P[0] * 60, 2)]
print('ranges', RNG_P, RNG_E)
metrics = {
 'variant': 'a1', 'name': 'Wingtip cruise propellers', 'date': '2026-11-02',
 'mass_kg': {'value': calc['mass_kg'], 'C0': calc['mass_C0_kg'], 'est': True, 'source': 'calc.py: C0 6.182 kg (analysis/results.json sized.m) + 2 tip assemblies 1.024 kg - removed pusher gear 0.323 kg + battery-move wiring and rails 0.028 kg'},
 'cg_x_m': {'value': calc['cg_target_m'], 'est': True, 'source': 'held at the C0 target (analysis/results.json cg.target, 28 pct MAC) by moving the battery from x 0.0605 to {} m; unmoved CG would be {} m'.format(calc['battery_x_A1'], calc['cg_x_battery_not_moved_m'])},
 'static_margin_pct': {'value': calc['SM_pct'], 'range': calc['SM_pct_range'], 'C0': 19.6, 'est': True, 'source': 'C0 19.632 pct (analysis/aero.json) minus 2.0 points for prop normal force: dNp = 2 CNa q A_disk (CNa 0.25-0.75 /rad, EST), arm 0.144 m, NP shift = dNp arm / (CLa q S); calc.py np_shift'},
 'span_m': {'value': 2.4, 'source': 'cad/params.txt panelLen 1.12 x 2 + 0.16 saddle; unchanged'},
 'width_m': {'value': round(calc['width_m'], 3), 'source': '2 x (nacelle axis 1.228 + prop radius 0.1778); 3 m limit margin {:.3f} m'.format(calc['margin_to_3m_m']), 'est': False},
 'motors': {'value': 6, 'lift': 4, 'cruise': 2, 'C0': 5, 'source': '4 x X4110S lift (P-39) + 2 x X4110S tip (P-38, P-40)'},
 'hover_power_W': {'value': calc['hover_W'], 'C0': 832, 'est': True, 'source': 'sizing F3 as P_hover = 4 x interp(thrust table, m g / 4) x kCtrl 1.1, calibrated to 831.98 W at 6.182 kg (calc.py); ratio {:.3f}'.format(calc['hover_ratio'])},
 'cruise_power_W': {'value': cr['P_cruise_W'], 'range': RNG_P, 'C0': 365, 'est': True,
                    'source': 'P = D V / (eta_prop 0.6 x eta_me 0.85) with D = CD q S; CD0 C0 + 2 nacelles CdA {:.2e} m2 + CDi at m {:.3f} kg, e x (1 + 0.30 x CT/0.12) (Sinnige); calc.py cruise'.format(calc['nacelle']['CdA_each_m2'] * 2, calc['mass_kg'])},
 'endurance_min': {'value': calc['endurance_min'], 'range': RNG_E, 'C0': 11.9, 'est': True,
                   'source': '(144.3 Wh x 0.95 x 0.8 - P_hover x 160 s) / P_cruise (sizing F8-F9); mission needs 10.0 min'},
 'cost_usd': {'value': committed, 'C0': c0['committed'], 'delta': round(committed - c0['committed'], 2), 'source': 'inventory.json summary (goods {:.2f} + tax {:.2f} + shipping 100)'.format(goods, tax)},
 'reserve_usd': {'value': reserve, 'C0': c0['reserve'], 'source': '2000 - committed'},
 'parts_new': {'value': 14, 'source': 'CAD occurrences: Tip_Tube_Ext 2, Tip_Splice_Sleeve 2, Nacelle_Mount 2, Nacelle_Shell 2, Battery_Tray_Ext 1, Tip_Prop_R 1 (new hand), harness 2, ESC_T/CAP_T/motor/spinner/prop relocated (not counted)', 'hardware_pieces_added': add_pieces},
 'parts_removed': {'value': 3, 'source': 'Pusher_Prop_Set, ESC_P, CAP_P as components (+ J-11 22 pieces, J-29 2 ties); hardware pieces removed {}'.format(rem_pieces), 'hardware_pieces_removed': rem_pieces},
 'risk': 'medium', 'risk_basis': 'structure and drag are low risk; roll inertia x{:.2f}, one-motor-out yaw, prop-ground clearance, thin reserve and a non-Q_ ArduPilot parameter set bring it to medium'.format(calc['Ixx_ratio']),
 'trl_note': 'Layout TRL 4-5: a tip propeller is flown on small aircraft and tunnel-tested at CT 0.12 (Sinnige 2019), but at this aircraft CT 0.028 the drag benefit is unmeasured; ArduPilot twin-throttle/RUDD_DT_GAIN is documented for QuadPlane fixed-wing modes (ardupilot.org/plane/docs/yaw-in-plane.html, 2026-11-02); no flight data for this airframe.',
 'drag_delta': {'tip_vortex_benefit_N': -calc['tipvortex_benefit_N'], 'nacelles_N': calc['nacelle_drag_N'], 'mass_induced_N': round(calc['cruise']['central']['D_N'] - calc['C0_polar']['D_N'] + calc['tipvortex_benefit_N'] - calc['nacelle_drag_N'], 3),
                'net_N': round(cr['D_N'] - calc['C0_polar']['D_N'], 3), 'D_C0_N': calc['C0_polar']['D_N'], 'D_A1_N': cr['D_N']},
 'roll_inertia_kgm2': {'C0': calc['Ixx_C0_kgm2'], 'A1': calc['Ixx_A1_kgm2'], 'ratio': calc['Ixx_ratio'], 'est': True},
 'hover_TW': {'C0': calc['TW_C0'], 'A1': calc['TW']},
 'verdict': 'Do not build as the first aircraft; keep as a later experiment on the C0 wing (tip bore and wire groove are cheap to add during panel cutting).'
}
json.dump(metrics, open(os.path.join(HERE, 'metrics.json'), 'w'), indent=1)
print('ok', len(rows), 'rows; goods', round(goods, 2), 'tax', tax, 'committed', committed, 'reserve', reserve, 'hw', rem_pieces, add_pieces, 613 - rem_pieces + add_pieces)
