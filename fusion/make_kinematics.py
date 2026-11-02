"""Task 31: derive the kinematics of the VTOL control surfaces and write
   fusion/joints_spec.json                            (read by build_joints_fusion.py inside Fusion)
   inventory/fusion/kinematics/kinematics.json        (for the web viewer animation; stl lists merged later by finalize)
Pure python + numpy.  Sources (all repo files): inventory/hardware/mechanisms.json (arm r, throws, rod p1/p2, rod length),
inventory/hardware/hardware.json (servo shaft 'pos' of HW-067/072/077, hinge_line of HW-100, wheel pos of HW-053).
Model frame m: X fwd, Y up, Z right.  Fusion cm: (z, x, y) * 100  (X right, Y fwd, Z up).
"""
import json, math, os
import numpy as np

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
mech = json.load(open(R + '/inventory/hardware/mechanisms.json'))
hw = json.load(open(R + '/inventory/hardware/hardware.json'))
items = {i['id']: i for i in hw['items']}


def F(v):                       # model m -> Fusion cm
    return [round(v[2] * 100, 4), round(v[0] * 100, 4), round(v[1] * 100, 4)]


def FA(a):                      # model axis -> Fusion axis (no scale)
    return [a[2], a[0], a[1]]


def rot(ax, a):
    ax = np.array(ax, float)
    ax /= np.linalg.norm(ax)
    K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]])
    return np.eye(3) + math.sin(a) * K + (1 - math.cos(a)) * K @ K


def solve_curve(S, ax_s, P1, H, ax_h, P2, phis_deg):
    """4-bar: servo arm hole P1 turns about (S, ax_s) by phi; horn hole P2 turns about (H, ax_h) by theta; the rod length
    |P1-P2| is constant.  Continuation from phi=0 (theta=0 is the neutral solution)."""
    S, P1, H, P2 = map(lambda v: np.array(v, float), (S, P1, H, P2))
    L = np.linalg.norm(P1 - P2)
    out = {}

    def f(th, p1):
        return np.linalg.norm(p1 - (H + rot(ax_h, th) @ (P2 - H))) - L
    for sgn in (1, -1):
        th_prev = 0.0
        for phi in sorted([p for p in phis_deg if p * sgn > 0], key=lambda p: abs(p)):
            p1 = S + rot(ax_s, math.radians(phi)) @ (P1 - S)
            # bracket around previous theta, then bisect
            lo, hi = th_prev - 0.05, th_prev + 0.05
            # widen until sign change
            for _ in range(60):
                if f(lo, p1) * f(hi, p1) < 0:
                    break
                lo -= 0.02
                hi += 0.02
            a, b = lo, hi
            for _ in range(80):
                m = 0.5 * (a + b)
                if f(a, p1) * f(m, p1) <= 0:
                    b = m
                else:
                    a = m
            th_prev = 0.5 * (a + b)
            out[phi] = th_prev
    out[0] = 0.0
    return out, L


SURFACES = ['aileron_R', 'aileron_L', 'elevator', 'rudder_R', 'rudder_L']
ID = {'aileron_R': 'ail_R', 'aileron_L': 'ail_L', 'elevator': 'elev', 'rudder_R': 'rud_R', 'rudder_L': 'rud_L'}
COMP = {'aileron_R': 'Aileron_R', 'aileron_L': 'Aileron_L', 'elevator': 'Elevator', 'rudder_R': 'Rudder_R', 'rudder_L': 'Rudder_L'}
SERVO_PARENT = {'aileron_R': 'hw:J-17:R', 'aileron_L': 'hw:J-17:L', 'elevator': 'hw:J-18:R', 'rudder_R': 'hw:J-19:R', 'rudder_L': 'hw:J-19:L'}
SURF_PARENT = {'aileron_R': 'panel:R', 'aileron_L': 'panel:L', 'elevator': 'htail', 'rudder_R': 'fin:R', 'rudder_L': 'fin:L'}
RIDES = {'aileron_R': 'slide_panel_R', 'aileron_L': 'slide_panel_L', 'elevator': 'slide_htail', 'rudder_R': 'slide_panel_R', 'rudder_L': 'slide_panel_L'}
STEPS = list(range(-45, 46, 5))

arm_inst = {'aileron_R': items['HW-067']['instances'][0], 'aileron_L': items['HW-067']['instances'][1],
            'elevator': items['HW-072']['instances'][0], 'rudder_R': items['HW-077']['instances'][0],
            'rudder_L': items['HW-077']['instances'][1]}
hinge_inst = items['HW-100']['instances']      # order: aileron_R, aileron_L, elevator, rudder_R, rudder_L (= mechanisms hinge.instance 0..4)

groups = []
joints = []
tables = {}
for s_i, sname in enumerate(SURFACES):
    m = [x for x in mech['surfaces'] if x['surface'] == sname][0]
    sid = ID[sname]
    rudder = sname.startswith('rudder')
    ax_m = [0, 1, 0] if rudder else [0, 0, 1]            # shaft axis and hinge axis (model), + sense used for both
    S = arm_inst[sname]['pos']
    P1, P2 = m['p1_m'], m['p2_m']
    hl = hinge_inst[s_i]['hinge_line']
    H = [(hl[0][k] + hl[1][k]) / 2 for k in range(3)]     # mid-span point of the hinge line
    if sname == 'elevator':
        H[2] = P1[2]                                      # elevator hinge is one line across the tail; pivot drawn in the rod plane
    curve, L = solve_curve(S, ax_m, P1, H, ax_m, P2, STEPS)
    # tables
    d0 = np.array(P2, float) - np.array(P1, float)
    rows = []
    maxerr = 0.0
    for phi in STEPS:
        th = curve[phi]
        p1 = np.array(S) + rot(ax_m, math.radians(phi)) @ (np.array(P1) - np.array(S))
        p2 = np.array(H) + rot(ax_m, th) @ (np.array(P2) - np.array(H))
        d = p2 - p1
        err = (np.linalg.norm(d) - L) * 1000
        maxerr = max(maxerr, abs(err))
        # rod rotation about the axis relative to neutral (signed, right-hand about ax_m)
        ax = np.array(ax_m, float)
        u0 = d0 - ax * (d0 @ ax)
        u1 = d - ax * (d @ ax)
        psi = math.degrees(math.atan2(np.cross(u0, u1) @ ax, u0 @ u1))
        rows.append({'servo_deg': phi, 'surface_deg': round(math.degrees(th), 3), 'rod_angle_deg': round(psi, 3),
                     'p1_m': [round(v, 6) for v in p1], 'p2_m': [round(v, 6) for v in p2],
                     'p1_cm': F(p1), 'p2_cm': F(p2), 'rod_len_err_mm': round(err, 5)})
    tables[sid] = rows
    th45 = math.degrees(curve[45])
    thm45 = math.degrees(curve[-45])
    ratio = th45 / 45.0
    plus_sense = 'TE down' if (not rudder and th45 > 0) else ('TE up' if not rudder else ('TE toward +Z (right)' if th45 > 0 else 'TE toward -Z (left)'))
    thr = m['throw_deg']['servo_+45']
    ax_f = FA(ax_m)
    hinge_f = [F(hl[0]), F(hl[1])]
    surf_lim = round(abs(th45) if abs(th45) >= abs(thm45) else abs(thm45), 2)
    # surface group
    groups.append({'id': sid, 'name': COMP[sname], 'kind': 'surface', 'parent': RIDES[sname],
                   'stl': ['kinematics/%s.stl' % COMP[sname]],
                   'contains': 'surface body + control horn + backing plate + 2 horn screws + 2 nuts',
                   'pivot_m': [round(v, 6) for v in H], 'pivot_cm': F(H), 'axis_m': ax_m, 'axis_cm': ax_f,
                   'hinge_line_m': hl, 'hinge_line_cm': hinge_f,
                   'limits_deg': [-surf_lim, surf_lim], 'limits_source': 'mechanisms.json throw_deg at servo +-45 deg: +-%s (solver here: %.2f / %.2f)' % (thr, th45, thm45),
                   'positive': 'rotation about +axis (right-hand): ' + ('trailing edge down' if not rudder else 'trailing edge toward +Z model (right)'),
                   'driver': {'group': 'arm_' + sid, 'relation': 'four_bar', 'secant_ratio_surface_per_servo': round(ratio, 5),
                              'note': 'surface_deg = f(servo_deg), table below; the linear motion link in Fusion uses the secant ratio (error up to ~0.8 deg mid-range)'},
                   'servo_plus_gives': plus_sense,
                   'servo_to_surface_deg': {str(r['servo_deg']): r['surface_deg'] for r in rows},
                   'neutral_lookup_rod_len_mm': round(L * 1000, 3), 'max_rod_len_err_mm': round(maxerr, 5)})
    # arm group
    ax_n = np.array(ax_m, float)
    u_ = np.array([0, 0, 1.0]) if rudder else np.array([1.0, 0, 0])      # right-handed plane basis (u, v) with u x v = axis
    v_ = np.cross(ax_n, u_)
    dd = np.array(P1) - np.array(S)
    neutral_ang = round(math.degrees(math.atan2(dd @ v_, dd @ u_)), 2)
    groups.append({'id': 'arm_' + sid, 'name': 'Arm_' + COMP[sname], 'kind': 'servo_arm', 'parent': 'slide_panel_R' if sname == 'elevator' else RIDES[sname],
                   'stl': ['kinematics/Arm_%s.stl' % COMP[sname]], 'contains': 'servo output arm (23T) + arm screw',
                   'pivot_m': S, 'pivot_cm': F(S), 'axis_m': ax_m, 'axis_cm': ax_f,
                   'arm_hole_m': P1, 'arm_hole_cm': F(P1), 'arm_r_mm': m['arm_r_mm'],
                   'neutral_arm_angle_deg_about_axis': neutral_ang, 'neutral_arm_angle_basis': 'angle of (hole - shaft) in the plane normal to axis_m, u = model %s, v = axis x u' % ('Z' if rudder else 'X'),
                   'limits_deg': [-45, 45],
                   'positive': 'rotation about +axis (right-hand) = servo angle in this file; %s on %s' % (plus_sense, COMP[sname]),
                   'physical_axis_in_hardware_json_m': arm_inst[sname]['axis'],
                   'note': 'for the surfaces whose servo shaft axis in hardware.json is -Z (aileron_L, elevator) the command sign is the opposite of the angle here; geometry is identical'})
    # pushrod group
    groups.append({'id': 'rod_' + sid, 'name': 'Pushrod_' + COMP[sname], 'kind': 'pushrod', 'parent': 'arm_' + sid,
                   'stl': ['kinematics/Pushrod_%s.stl' % COMP[sname]], 'contains': 'rod with Z-bend + Kwik-Link clevis + keeper bead',
                   'pivot_m': P1, 'pivot_cm': F(P1), 'axis_m': ax_m, 'axis_cm': ax_f,
                   'p1_neutral_m': P1, 'p2_neutral_m': P2, 'p1_neutral_cm': F(P1), 'p2_neutral_cm': F(P2),
                   'rod_len_pin_to_hole_mm': m['rod_len_pin_to_hole_mm'], 'rod_cut_mm': m['rod_cut_mm'],
                   'driver': {'group': 'arm_' + sid, 'relation': 'rod pose per servo step: p1 = arm hole, p2 = horn hole (rows below)'},
                   'transform_rule': 'M = T(p1_step) * Rot(axis_cm, rod_angle_deg) * T(-p1_neutral)  applied to the neutral STL',
                   'pose_table': [{k: r[k] for k in ('servo_deg', 'rod_angle_deg', 'p1_m', 'p2_m', 'p1_cm', 'p2_cm', 'rod_len_err_mm')} for r in rows]})
    # joints spec (Fusion)
    arm_hole_f = F(P1)
    joints.append({'name': 'Rev %s hinge' % COMP[sname], 'type': 'revolute', 'one': 'surf:' + COMP[sname], 'two': SURF_PARENT[sname],
                   'axis': 'Z' if rudder else 'X', 'pt': F(H), 'lo': -surf_lim, 'hi': surf_lim, 'unit': 'deg', 'kin': sid})
    joints.append({'name': 'Rev Arm_%s servo shaft' % COMP[sname], 'type': 'revolute', 'one': 'arm:' + COMP[sname], 'two': SERVO_PARENT[sname],
                   'axis': 'Z' if rudder else 'X', 'pt': F(S), 'lo': -45, 'hi': 45, 'unit': 'deg', 'kin': 'arm_' + sid,
                   'link': {'to': 'Rev %s hinge' % COMP[sname], 'ratio_other_per_this': round(ratio, 5)}})
    joints.append({'name': 'Rev Pushrod_%s arm hole' % COMP[sname], 'type': 'revolute', 'one': 'rod:' + COMP[sname], 'two': 'arm:' + COMP[sname],
                   'axis': 'Z' if rudder else 'X', 'pt': F(P1), 'lo': None, 'hi': None, 'unit': 'deg', 'kin': 'rod_' + sid,
                   'rod_p2_cm': F(P2), 'rod_len_mm': round(L * 1000, 4)})

# ---- propellers and wheels
LIFT = {'L1': (43.4, 37.1), 'L2': (-43.4, -50.5), 'L3': (-43.4, 37.1), 'L4': (43.4, -50.5)}   # Fusion cm (x right, y fwd); ESC_Lk naming
PROP_RIDES = {'L1': 'slide_panel_R', 'L4': 'slide_panel_R', 'L2': 'slide_panel_L', 'L3': 'slide_panel_L'}
for k, (x, y) in LIFT.items():
    pc = [x, y, 3.0]
    groups.append({'id': 'prop_' + k, 'name': 'Lift_Prop_' + k, 'kind': 'prop', 'parent': PROP_RIDES[k],
                   'stl': ['kinematics/Lift_Prop_%s.stl' % k], 'contains': 'lift prop + motor can (bell; one body in the model) + prop adapter, holding plate, 4 screws (J-10)',
                   'pivot_cm': pc, 'pivot_m': [round(pc[1] / 100, 6), round(pc[2] / 100, 6), round(pc[0] / 100, 6)],
                   'axis_cm': [0, 0, 1], 'axis_m': [0, 1, 0], 'limits_deg': None,
                   'positive': 'rotation about +Z (up), counter-clockwise seen from above; the real rotation direction of each motor is - (not in the data)'})
    joints.append({'name': 'Rev Lift_Prop_%s motor axis' % k, 'type': 'revolute', 'one': 'prop:' + k, 'two': 'mount:' + k, 'axis': 'Z',
                   'pt': pc, 'lo': None, 'hi': None, 'unit': 'deg', 'kin': 'prop_' + k})
pp = [0.0, -42.3, -3.0]
groups.append({'id': 'prop_P', 'name': 'Pusher_Prop_Set', 'kind': 'prop', 'parent': None,
               'stl': ['kinematics/Pusher_Prop_Set.stl'], 'contains': 'pusher prop 14x8.5 + spinner + motor can + prop adapter hardware (J-12)',
               'pivot_cm': pp, 'pivot_m': [pp[1] / 100, pp[2] / 100, pp[0] / 100], 'axis_cm': [0, 1, 0], 'axis_m': [1, 0, 0], 'limits_deg': None,
               'positive': 'rotation about +Y (forward, Fusion) = +X model, right-hand; real direction - (not in the data)'})
joints.append({'name': 'Rev Pusher_Prop motor axis', 'type': 'revolute', 'one': 'prop:P', 'two': 'pod', 'axis': 'Y', 'pt': pp,
               'lo': None, 'hi': None, 'unit': 'deg', 'kin': 'prop_P'})
wheel_pos = items['HW-053']['instances']             # FR, FL, RR, RL
for nm, w in zip(('FR', 'FL', 'RR', 'RL'), wheel_pos):
    pm = w['pos']
    pcm = F(pm)
    groups.append({'id': 'wheel_' + nm, 'name': 'Wheel_' + nm, 'kind': 'wheel', 'parent': 'slide_panel_R' if nm.endswith('R') and nm in ('FR', 'RR') else 'slide_panel_L',
                   'stl': ['kinematics/Wheel_%s.stl' % nm], 'contains': 'Du-Bro 300SL wheel: tyre + hub (HW-053)',
                   'pivot_m': pm, 'pivot_cm': pcm, 'axis_m': [0, 0, 1], 'axis_cm': [1, 0, 0], 'limits_deg': None,
                   'positive': 'rotation about +X (right) = +Z model, right-hand; rolling forward = positive rotation about -X... sign: positive about +X rolls the top toward the rear? see note',
                   'note': 'positive about +X: the wheel top moves toward -Y (aft) i.e. the aircraft rolls rearward; use negative for forward roll. Wheel OD 76.2 mm: forward distance = angle(rad) * 38.1 mm'})
    joints.append({'name': 'Rev Wheel_%s axle' % nm, 'type': 'revolute', 'one': 'wheel:' + nm, 'two': 'leg:' + nm, 'axis': 'X', 'pt': pcm,
                   'lo': None, 'hi': None, 'unit': 'deg', 'kin': 'wheel_' + nm})

# ---- sliders (limits in cm)
joiner_pt = [8.0, -7.16, 0.45]
groups.append({'id': 'slide_panel_R', 'name': 'Wing_Panel_R slide on the joiner', 'kind': 'slider', 'parent': None, 'stl': ['stl/Wing_Panel_R.stl'], 'carries': [],
               'pivot_cm': joiner_pt, 'axis_cm': [1, 0, 0], 'axis_m': [0, 0, 1], 'limits_mm': [0, 300],
               'positive': 'panel moves outboard (+X)', 'limit_source': 'joiner insertion 300 mm (Wing_Joiner 8..38 cm from the centre line in the CAD); the brief said ~120 mm, 300 mm fully clears the joiner',
               'note': 'carries the whole right wing group: spar tube, booms, clamps, mounts, motors, props, gear, ESCs, aileron, rudder, elevator servo and tail stub, H-tail seat'})
groups.append({'id': 'slide_panel_L', 'name': 'Wing_Panel_L slide on the joiner', 'kind': 'slider', 'parent': None, 'stl': ['stl/Wing_Panel_L.stl'], 'carries': [],
               'pivot_cm': [-8.0, -7.16, 0.45], 'axis_cm': [-1, 0, 0], 'axis_m': [0, 0, -1], 'limits_mm': [0, 300],
               'positive': 'panel moves outboard (-X)', 'limit_source': 'as slide_panel_R', 'note': 'carries the left wing group (incl. pitot, airspeed module)'})
groups.append({'id': 'slide_htail', 'name': 'H_Tail lift-off the boom stubs', 'kind': 'slider', 'parent': 'slide_panel_R', 'stl': ['stl/H_Tail.stl'], 'carries': [],
               'pivot_cm': [0.0, -79.7, -1.4], 'axis_cm': [0, 0, 1], 'axis_m': [0, 1, 0], 'limits_mm': [0, 150],
               'positive': 'up (+Z)', 'limit_source': 'estimate - the seat height / screw length from J-16 is not turned into a travel in the data (-)',
               'note': 'jointed to the right stub only so that the joint graph stays a tree (the H-tail spans both stubs)'})
groups.append({'id': 'slide_canopy', 'name': 'Canopy lift-off', 'kind': 'slider', 'parent': None, 'stl': ['stl/Canopy.stl'], 'carries': [],
               'pivot_cm': [0.0, 20.5, 4.6], 'axis_cm': [0, 0, 1], 'axis_m': [0, 1, 0], 'limits_mm': [0, 100],
               'positive': 'up (+Z)', 'limit_source': 'estimate (-)', 'note': 'carries canopy screws, GPS mast and GPS'})
groups.append({'id': 'slide_battery', 'name': 'Battery along its tray', 'kind': 'slider', 'parent': None, 'stl': ['stl/Battery_6S_LiPo.stl'], 'carries': [],
               'pivot_cm': [0.0, 6.1, -5.0], 'axis_cm': [0, 1, 0], 'axis_m': [1, 0, 0], 'limits_mm': [-4, 7],
               'positive': 'forward (+Y)', 'limit_source': 'Fusion motion-clearance sweep 2026-11-02 (fusion/motion_clearance.md): pod pocket extended -5/+8 mm, formers limit free travel to -4/+7 mm', 'note': 'CG trim travel only 11 mm; battery cannot be lifted out in this CAD (see motion_clearance.md)'})
joints += [
    {'name': 'Slide Wing_Panel_R on joiner', 'type': 'slider', 'one': 'panel:R', 'two': 'saddle', 'axis': 'X', 'pt': joiner_pt, 'lo': 0, 'hi': 30, 'unit': 'cm', 'kin': 'slide_panel_R'},
    {'name': 'Slide Wing_Panel_L on joiner', 'type': 'slider', 'one': 'panel:L', 'two': 'saddle', 'axis': 'X', 'pt': [-8.0, -7.16, 0.45], 'lo': -30, 'hi': 0, 'unit': 'cm', 'kin': 'slide_panel_L'},
    {'name': 'Slide H_Tail lift-off', 'type': 'slider', 'one': 'htail', 'two': 'stub:R', 'axis': 'Z', 'pt': [0.0, -79.7, -1.4], 'lo': 0, 'hi': 15, 'unit': 'cm', 'kin': 'slide_htail'},
    {'name': 'Slide Canopy lift-off', 'type': 'slider', 'one': 'canopy', 'two': 'pod', 'axis': 'Z', 'pt': [0.0, 20.5, 4.6], 'lo': 0, 'hi': 10, 'unit': 'cm', 'kin': 'slide_canopy'},
    {'name': 'Slide Battery tray', 'type': 'slider', 'one': 'battery', 'two': 'pod', 'axis': 'Y', 'pt': [0.0, 6.1, -5.0], 'lo': -0.4, 'hi': 0.7, 'unit': 'cm', 'kin': 'slide_battery'},
]
for g in groups:
    if g['kind'] == 'wheel':
        g['parent'] = 'slide_panel_R' if g['id'][-2:] in ('FR', 'RR') else 'slide_panel_L'
# key -> kinematic id map for the manifest ('moving' / 'rides')
kin_of_key = {}
for j in joints:
    kin_of_key[j['one']] = j['kin']
spec = {'joints': joints, 'kin_of_key': kin_of_key,
        'rides': {'WR': 'slide_panel_R', 'WL': 'slide_panel_L', 'TAIL': 'slide_htail', 'CAN': 'slide_canopy'}}
json.dump(spec, open(R + '/fusion/joints_spec.json', 'w'), indent=1)

kin = {'generated': '2026-11-02',
       'task': 'Fusion joints and motion (task 31)',
       'frames': {'model': 'X fwd, Y up, Z right, metres', 'fusion': 'X right, Y fwd, Z up, cm; model (x,y,z) m -> Fusion (z,x,y)*100',
                  'stl': 'STL files are Fusion world cm, Z-up, binary, exactly like stl/ in manifest.json (paths here are relative to inventory/fusion/)'},
       'conventions': {'servo_deg': 'rotation of the servo arm about +axis (right-hand), 0 = CAD neutral arm angle; arm limits +-45 deg',
                       'surface_deg': 'rotation of the surface about +axis (right-hand): ailerons/elevator positive = trailing edge down; rudders positive = trailing edge toward +Z model (right)',
                       'ail_L/ail_R': 'same sign relation: servo +deg -> TE down on both sides (the servo shaft axis in hardware.json is mirrored but the planar geometry is identical)',
                       'rod_angle_deg': 'rotation of the pushrod line about +axis relative to neutral'},
       'sources': ['inventory/hardware/mechanisms.json (arm_r_mm, p1_m, p2_m, throw_deg, rod_len_pin_to_hole_mm)',
                   'inventory/hardware/hardware.json (servo shaft pos HW-067/072/077, hinge_line HW-100, wheel pos HW-053)'],
       'four_bar_method': 'servo arm hole P1 rotates about the shaft S by the servo angle; the horn hole P2 rotates about the hinge H by the surface angle; |P1-P2| = rod length (neutral value); solved by bisection with continuation from neutral (fusion/make_kinematics.py)',
       'groups': groups}
os.makedirs(R + '/inventory/fusion/kinematics', exist_ok=True)
json.dump(kin, open(R + '/inventory/fusion/kinematics/kinematics.json', 'w'), indent=1)
for g in groups:
    if g['kind'] == 'surface':
        print(g['id'], 'limits', g['limits_deg'], 'servo+ ->', g['servo_plus_gives'], 'ratio', g['driver']['secant_ratio_surface_per_servo'],
              'throw(mech)', g['limits_source'], 'maxroderr_mm', g['max_rod_len_err_mm'], '-45/-30/30/45:', [g['servo_to_surface_deg'][k] for k in ('-45', '-30', '30', '45')])
