"""Trim inventory/hardware/hardware.json (rev 2) + mechanisms.json into fusion/hardware_rev2_compact.json
(embedded data for build_detail_fusion.py). Run on Linux: python3 fusion/make_hardware_rev2_compact.py"""
import json, os
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
h = json.load(open(os.path.join(root, 'inventory/hardware/hardware.json')))
m = json.load(open(os.path.join(root, 'inventory/hardware/mechanisms.json')))
DROP = {'source', 'est', 'note', 'notes', 'desc', 'description', 'frame', 'case_axes', 'heights_from', 'bore_note', 't_note',
        'cut_rule', 'hub', 'material', 'thread', 'head', 'tub', 'alt_ca_hinge', 'cad_note', 'z_from_base_note', 'weight_g',
        'mass_g', 'screw', 'lead', 'bolt_pattern_19sq', 'outline', 'hex_key_in', 'set_screw', 'thread_len_mm', 'ends'}
KEEPSTR = {'head'}
def rnd(o):
    if isinstance(o, float): return round(o, 6)
    if isinstance(o, list): return [rnd(x) for x in o]
    if isinstance(o, dict): return {k: rnd(v) for k, v in o.items()}
    return o
def trim(g, keep_prim):
    out = {}
    for k, v in g.items():
        if k == 'head': out[k] = v if isinstance(v, str) and len(v) < 10 else 'socket'; continue
        if k == 'primitives':
            if keep_prim: out[k] = v
            continue
        if k in DROP: continue
        if k == 'cad_mm' and isinstance(v, dict):
            out[k] = {a: b for a, b in v.items() if a != 'source' and not isinstance(b, str)}; continue
        if isinstance(v, str): continue
        out[k] = v
    return out
items = []
for it in h['items']:
    prim = it['id'] in ('HW-049', 'HW-063', 'HW-129', 'HW-130', 'HW-131', 'HW-132', 'HW-133', 'HW-079', 'HW-086', 'HW-093')
    g = trim(it['geom'], prim)
    if it['id'] in ('HW-054',): g['head'] = 'none'
    if it['id'] in ('HW-137', 'HW-138', 'HW-139'): g['head'] = 'grub'
    inst = []
    for ins in it['instances']:
        d = {'p': ins['pos'], 'a': ins['axis'], 'par': ins['parent']}
        for k_src, k_dst in (('up', 'u'), ('p1', 'p1'), ('p2', 'p2'), ('hole_pos', 'hp'), ('len_mm', 'len'), ('gap_mm', 'gap'), ('hinge_line', 'hl'), ('side', 'side'), ('component', 'comp')):
            if k_src in ins: d[k_dst] = ins[k_src]
        inst.append(d)
    items.append({'id': it['id'], 'j': it['joint'], 'k': it['kind'], 'spec': it['spec'], 'mat': it['material'], 'col': it['color'], 'g': g, 'inst': inst})
surf = []
for s in m['surfaces']:
    surf.append({k: s[k] for k in ('surface', 'servo', 'servo_item', 'arm_item', 'arm_screw_item', 'horn_item', 'backing_item', 'horn_screw_item', 'nut_item', 'clevis_item', 'pushrod_item', 'keeper_item', 'pushrod_instance', 'arm_r_mm', 'horn_h_mm', 'rod_cut_mm', 'p1_m', 'p2_m', 'hinge') if k in s})
out = {'joints': [{'id': j['id'], 'name': j['name'], 'parts': j['parts']} for j in h['joints']], 'items': items, 'surfaces': surf,
       'gear': {k: m['gear'][k] for k in ('stack_u_mm', 'wheel_centre_outboard_of_leg_axis_mm')}}
s = json.dumps(rnd(out), separators=(',', ':'))
open(os.path.join(here, 'hardware_rev2_compact.json'), 'w').write(s)
print(len(s), sum(len(i['inst']) for i in items))
