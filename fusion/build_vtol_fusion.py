"""Lift + Cruise VTOL quadplane, student concept C0, design v0.3.1 -- parametric Autodesk Fusion model.

Run via Utilities -> Scripts and Add-Ins (Add-Ins/Scripts dialog -> "+" -> pick this file -> Run) in an EMPTY
design. Embeds cad/params.txt, the NACA 2415 foil=, cad/mesh/meta.json colours and
inventory/electrical/components.json; reads no external files. Port of cad/BuildVtol.cs (SOLIDWORKS).
Does not export and does not save. Units: params in m, Fusion API in cm.
Components: one per part type (sketch + extrude/revolve/loft features), occurrences at every comp= position,
plus Electronics (envelopes) and Proposed_Wheels. Fasteners other than Wing_Bolt are intentionally not modelled.
"""
import adsk.core, adsk.fusion, math, traceback

# ---- embedded params (cad/params.txt, units m) ----
P = {'chord': 0.238675, 'panelLen': 1.12, 'tc': 0.15, 'sparXfrac': 0.3, 'sparX': -0.071603, 'sparY': 0.004475, 'sparOD': 0.0254, 'sparID': 0.022454, 'sparLen': 0.8, 'joinOD': 0.022225, 'joinID': 0.019279, 'joinLen': 0.76, 'boomOD': 0.0254, 'boomID': 0.023622, 'segF': 0.955, 'segR': 0.516, 'fusL': 0.85, 'fusR': 0.08, 'tailR': 0.03, 'motorD': 0.048, 'motorH': 0.032, 'liftProp': 0.4318, 'propW': 0.035, 'propT': 0.008, 'pushMotorD': 0.048, 'pushMotorL': 0.032, 'pushProp': 0.3556, 'hC': 0.075601, 'hSpan': 0.8928, 'vH': 0.18795, 'vC': 0.15036, 'elevSpan': 0.8554, 'battL': 0.155, 'battH': 0.05, 'battW': 0.048, 'legOD': 0.0254, 'legID': 0.022454, 'legLen': 0.205, 'pitotD': 0.006, 'pitotL': 0.25, 'feaBoomL': 0.430586, 'feaTipForce': 30.694814, 'feaTipMass': 0.242, 'feaNult': 4.5, 'feaWingForce': 144.734826, 'feaRootMomentTarget': 69.472717, 'feaHandSigJ': 148577790.0, 'feaHandSigB': 32607149.0, 'feaHandDefl': 0.0023, 'feaHandFn': 36.005614, 'thermQ': 41.598772, 'thermH': 50.0, 'thermAmbK': 308.15, 'thermTime': 90.0, 'matE': 69000000000.0, 'matNu': 0.33, 'matRho': 2700.0, 'matSig': 275000000.0, 'motorMass': 0.165, 'motorCp': 896.0, 'clampTopF': 0.016569, 'clampTopR': 0.024826, 'yB': -0.03, 'tailT': 0.006804, 'boltZ': 0.065, 'discClear': 0.060595}
FOIL_FILE = [(-0.2387, 0.000375), (-0.238054, 0.000533), (-0.236122, 0.001001), (-0.232923, 0.001764), (-0.22849, 0.002797), (-0.222868, 0.00407), (-0.216116, 0.005543), (-0.208303, 0.007175), (-0.199511, 0.008922), (-0.189833, 0.010736), (-0.179373, 0.012571), (-0.168241, 0.01438), (-0.15656, 0.016117), (-0.144455, 0.017736), (-0.132061, 0.01919), (-0.119513, 0.020434), (-0.106952, 0.021427), (-0.094509, 0.022129), (-0.082218, 0.022457), (-0.070336, 0.022354), (-0.059005, 0.021815), (-0.048359, 0.02085), (-0.038526, 0.019484), (-0.029622, 0.017753), (-0.021749, 0.015706), (-0.014995, 0.013401), (-0.009432, 0.010898), (-0.005119, 0.008258), (-0.002095, 0.005534), (-0.000385, 0.002771), (0.0, 0.0), (-0.000922, -0.002641), (-0.003121, -0.005019), (-0.006563, -0.007125), (-0.011202, -0.008946), (-0.016982, -0.010471), (-0.023834, -0.011692), (-0.031683, -0.012606), (-0.040444, -0.01322), (-0.050026, -0.013547), (-0.060333, -0.013611), (-0.071261, -0.013444), (-0.082702, -0.013087), (-0.094543, -0.012583), (-0.106775, -0.011941), (-0.119162, -0.011153), (-0.131563, -0.010257), (-0.143843, -0.009292), (-0.15587, -0.008288), (-0.167512, -0.007274), (-0.17864, -0.006272), (-0.189131, -0.005303), (-0.198869, -0.004383), (-0.207742, -0.003526), (-0.215651, -0.002746), (-0.222506, -0.002057), (-0.228226, -0.001471), (-0.232746, -0.001001), (-0.236013, -0.000656), (-0.237989, -0.000446), (-0.23865, -0.000375)]
COMPS = [('Fuselage_Pod', 0.45, -0.03, 0.0), ('Canopy', 0.33, 0.015, 0.0), ('Wing_Panel_R', 0.0, 0.0, 0.08), ('Wing_Panel_L', 0.0, 0.0, -0.08), ('Aileron_R', 0.0, 0.0, 0.586), ('Aileron_L', 0.0, 0.0, -0.586), ('Spar_Tube', -0.0716, 0.00448, 0.08), ('Spar_Tube', -0.0716, 0.00448, -0.88), ('Wing_Joiner', -0.0716, 0.00448, -0.38), ('Wing_Saddle', 0.0, 0.0, 0.0), ('Wing_Bolt', -0.16707, 0.01451, -0.065), ('Wing_Bolt', -0.16707, 0.01451, 0.065), ('Battery_6S_LiPo', 0.061, -0.05, 0.0), ('Boom_Front', -0.53458, -0.03, -0.4337), ('Boom_Rear_Stub', -0.99048, -0.03, -0.4337), ('Motor_Mount', 0.37092, -0.03, -0.4337), ('Lift_Motor', 0.37092, -0.009, -0.4337), ('Lift_Prop', 0.37092, 0.029, -0.4337), ('Motor_Mount', -0.50458, -0.03, -0.4337), ('Lift_Motor', -0.50458, -0.009, -0.4337), ('Lift_Prop', -0.50458, 0.029, -0.4337), ('Boom_Clamp_Front', -0.0716, -0.03, -0.4337), ('Boom_Clamp_Rear', -0.19094, -0.03, -0.4337), ('Fin', -0.77048, -0.0173, -0.4337), ('Gear_Clamp', 0.28092, -0.03, -0.4337), ('Landing_Leg', 0.28092, -0.2437, -0.4337), ('Gear_Clamp', -0.41458, -0.03, -0.4337), ('Landing_Leg', -0.41458, -0.2437, -0.4337), ('Boom_Front', -0.53458, -0.03, 0.4337), ('Boom_Rear_Stub', -0.99048, -0.03, 0.4337), ('Motor_Mount', 0.37092, -0.03, 0.4337), ('Lift_Motor', 0.37092, -0.009, 0.4337), ('Lift_Prop', 0.37092, 0.029, 0.4337), ('Motor_Mount', -0.50458, -0.03, 0.4337), ('Lift_Motor', -0.50458, -0.009, 0.4337), ('Lift_Prop', -0.50458, 0.029, 0.4337), ('Boom_Clamp_Front', -0.0716, -0.03, 0.4337), ('Boom_Clamp_Rear', -0.19094, -0.03, 0.4337), ('Fin', -0.77048, -0.0173, 0.4337), ('Gear_Clamp', 0.28092, -0.03, 0.4337), ('Landing_Leg', 0.28092, -0.2437, 0.4337), ('Gear_Clamp', -0.41458, -0.03, 0.4337), ('Landing_Leg', -0.41458, -0.2437, 0.4337), ('H_Tail', -0.77048, -0.0139, 0.0), ('Elevator', -0.77048, -0.0139, 0.0), ('Pusher_Motor', -0.4, -0.03, 0.0), ('Pusher_Prop_14in', -0.438, -0.03, 0.0), ('Spinner', -0.442, -0.03, 0.0), ('Pitot_Tube', -0.05, -0.02, -1.0)]
COLORS = {'Aileron_L': [0.8, 0.82, 0.859], 'Aileron_R': [0.8, 0.82, 0.859], 'Battery_6S_LiPo': [0.2, 0.447, 0.847], 'Boom_Clamp_Front': [0.118, 0.129, 0.157], 'Boom_Clamp_Rear': [0.118, 0.129, 0.157], 'Boom_Front': [0.718, 0.737, 0.776], 'Boom_Rear_Stub': [0.718, 0.737, 0.776], 'Canopy': [0.098, 0.157, 0.259], 'Elevator': [0.8, 0.82, 0.859], 'Fin': [0.929, 0.937, 0.957], 'Fuselage_Pod': [0.949, 0.957, 0.969], 'Gear_Clamp': [0.118, 0.129, 0.157], 'H_Tail': [0.929, 0.937, 0.957], 'Landing_Leg': [0.078, 0.078, 0.078], 'Lift_Motor': [0.176, 0.188, 0.22], 'Lift_Prop': [0.059, 0.059, 0.067], 'Motor_Mount': [0.118, 0.129, 0.157], 'Pitot_Tube': [0.718, 0.737, 0.776], 'Pusher_Motor': [0.176, 0.188, 0.22], 'Pusher_Prop_14in': [0.059, 0.059, 0.067], 'Spar_Tube': [0.718, 0.737, 0.776], 'Spinner': [0.949, 0.957, 0.969], 'Wing_Bolt': [0.718, 0.737, 0.776], 'Wing_Joiner': [0.718, 0.737, 0.776], 'Wing_Panel_L': [0.929, 0.937, 0.957], 'Wing_Panel_R': [0.929, 0.937, 0.957], 'Wing_Saddle': [0.118, 0.129, 0.157]}
DESC = {'Aileron_L': 'Left aileron, 26 % chord, 55 % of panel span', 'Aileron_R': 'Right aileron, 26 % chord, 55 % of panel span', 'Battery_6S_LiPo': '6S 6500 mAh LiPo envelope (dims EST)', 'Boom_Clamp_Front': 'Printed PETG boom-to-wing clamp at the spar; top meets the wing lower surface', 'Boom_Clamp_Rear': 'Printed PETG boom-to-wing clamp at 80 % chord; top meets the wing lower surface', 'Boom_Front': 'Front boom, 6061-T6 1.000 x 0.035 in', 'Boom_Rear_Stub': 'Rear boom stub carrying the tail, 6061-T6', 'Canopy': 'Avionics hatch blister (EST)', 'Elevator': 'Elevator, 30 % chord, NACA 0009', 'Fin': 'Vertical fin, NACA 0009, lofted taper 65 % tip chord', 'Fuselage_Pod': 'Fuselage pod, 0.85 m x 0.16 m, foam + PETG frames + tape (EST)', 'Gear_Clamp': 'Printed PETG gear socket clamp under the boom', 'H_Tail': 'Horizontal stabiliser, NACA 0009 (EST), area from V_h = 0.35', 'Landing_Leg': 'Gear leg: 6061 1.000 x 0.058 in offcut + printed TPU/PETG foot (EST)', 'Lift_Motor': 'SunnySky X4110S lift motor envelope (EST proportions)', 'Lift_Prop': 'Lift prop 17 in, shown parked fore-aft (notional: BLHeli_S ESCs cannot park props; planform EST)', 'Motor_Mount': 'Printed PA6-CF motor mount on boom, covers the boom splice at the rear station (EST)', 'Pitot_Tube': 'Pitot probe on wing tip (MS5525 + PT40)', 'Pusher_Motor': 'SunnySky X4110S pusher motor envelope (EST proportions)', 'Pusher_Prop_14in': 'Pusher prop APC 14 x 8.5EP envelope (planform EST)', 'Spar_Tube': '6061-T6 1.000 x 0.058 in spar socket, 0.8 m', 'Spinner': 'Pusher spinner 42 mm (EST)', 'Wing_Bolt': 'M5 x 30 stainless button screw into a captive nut in the saddle (hardware kit, budget-airframe.md Â§3a item 5)', 'Wing_Joiner': '6061-T6 0.875 x 0.058 in joiner, 0.76 m', 'Wing_Panel_L': 'Left wing panel, NACA 2415 (EST), XPS core + tape skin, chord 239 mm', 'Wing_Panel_R': 'Right wing panel, NACA 2415 (EST), XPS core + tape skin, chord 239 mm', 'Wing_Saddle': 'Wing centre-section saddle over the joiner: XPS block from the budgeted FOAMULAR sheet, taped, with printed PETG root plates (EST); shown dark to mark the interface'}
ELEC = [('BAT1', [155, 48, 50], 0.0605, -0.05, 0.0, 'Fuselage_Pod'), ('XT90S_1', [20, 20, 20], 0.165, -0.05, 0.0, 'Fuselage_Pod'), ('FC1', [52, 32, 17], 0.21, 0.0, 0.0, 'Fuselage_Pod'), ('BUS1', [40, 25, 15], 0.2, -0.06, 0.0, 'Fuselage_Pod'), ('UBEC1', [40, 20, 10], 0.26, -0.055, 0.0, 'Fuselage_Pod'), ('GPS1', [21, 21, 8.02], 0.2, 0.088, 0.0, 'Fuselage_Pod'), ('RX1', [22, 13, 4], 0.3, 0.03, -0.03, 'Fuselage_Pod'), ('RID1', [22, 15.6, 8], 0.12, 0.045, 0.04, 'Fuselage_Pod'), ('ASPD1', [20, 22, 11.4], -0.13, 0.005, -0.11, 'Wing_Panel_L'), ('PITOT1', [250, 6], -0.05, -0.02, -1.0, 'Wing_Panel_L'), ('ESC_L1', [45, 25, 8], 0.2, -0.03, 0.4527, 'Boom_Front_R'), ('ESC_L2', [45, 25, 8], -0.36, -0.03, -0.4527, 'Boom_Front_L'), ('ESC_L3', [45, 25, 8], 0.2, -0.03, -0.4527, 'Boom_Front_L'), ('ESC_L4', [45, 25, 8], -0.36, -0.03, 0.4527, 'Boom_Front_R'), ('ESC_P', [45, 25, 8], -0.34, -0.03, 0.0, 'Fuselage_Pod'), ('MOT_L1', [47.5, 32], 0.37092, -0.009, 0.4337, 'Boom_Front_R'), ('MOT_L2', [47.5, 32], -0.50458, -0.009, -0.4337, 'Boom_Front_L'), ('MOT_L3', [47.5, 32], 0.37092, -0.009, -0.4337, 'Boom_Front_L'), ('MOT_L4', [47.5, 32], -0.50458, -0.009, 0.4337, 'Boom_Front_R'), ('MOT_P', [47.5, 32], -0.4, -0.03, 0.0, 'Fuselage_Pod'), ('SRV_AIL_L', [38.6, 18.8, 34.9], -0.12, 0.005, -0.8, 'Wing_Panel_L'), ('SRV_AIL_R', [38.6, 18.8, 34.9], -0.12, 0.005, 0.8, 'Wing_Panel_R'), ('SRV_ELEV', [38.6, 18.8, 34.9], -0.79, -0.03, 0.4, 'Boom_Rear_Stub'), ('SRV_RUD_L', [38.6, 18.8, 34.9], -0.85, -0.03, -0.4116, 'Boom_Rear_Stub'), ('SRV_RUD_R', [38.6, 18.8, 34.9], -0.85, -0.03, 0.4116, 'Boom_Rear_Stub'), ('CAP_L1', None, 0.2, -0.03, 0.4647, 'Boom_Front_R'), ('CAP_L2', None, -0.36, -0.03, -0.4647, 'Boom_Front_L'), ('CAP_L3', None, 0.2, -0.03, -0.4647, 'Boom_Front_L'), ('CAP_L4', None, -0.36, -0.03, 0.4647, 'Boom_Front_R'), ('CAP_P', None, -0.34, -0.05, 0.0, 'Fuselage_Pod'), ('JB_J1_R', None, -0.12, 0.0, 0.09, 'Wing_Panel_R'), ('JB_J2_R', None, -0.19094, -0.03, 0.4337, 'Boom_Front_R'), ('JB_J3_R', None, -0.505, -0.03, 0.4337, 'Boom_Rear_Stub'), ('JB_J1_L', None, -0.12, 0.0, -0.09, 'Wing_Panel_L'), ('JB_J2_L', None, -0.19094, -0.03, -0.4337, 'Boom_Front_L'), ('JB_J3_L', None, -0.505, -0.03, -0.4337, 'Boom_Rear_Stub')]

# ---------------------------------------------------------------------------
# Frame: X forward, Y up, Z right (metres). Fusion document is Z-up, so a model
# point (x, y, z) is drawn at Fusion (X', Y', Z') = (z, x, y) -- a proper rotation
# (aircraft nose toward +Y', right wing toward +X', up toward +Z').
# ---------------------------------------------------------------------------
app = adsk.core.Application.get()
V = adsk.core.ValueInput
P3 = adsk.core.Point3D.create
DIR = {'X': (0, 1, 0), 'Y': (0, 0, 1), 'Z': (1, 0, 0)}     # model axis -> Fusion direction
NEW = adsk.fusion.FeatureOperations.NewBodyFeatureOperation
JOIN = adsk.fusion.FeatureOperations.JoinFeatureOperation
CUT = adsk.fusion.FeatureOperations.CutFeatureOperation


def design():
    return adsk.fusion.Design.cast(app.activeProduct)


def root():
    return design().rootComponent


def W(x, y, z):
    return P3(z * 100.0, x * 100.0, y * 100.0)


# ---------- generic geometry helpers ----------
def plane(comp, axis, w=0.0):
    """Construction plane perpendicular to model axis at model coordinate w (m)."""
    base = {'Z': comp.yZConstructionPlane, 'X': comp.xZConstructionPlane, 'Y': comp.xYConstructionPlane}[axis]
    if abs(w) < 1e-12:
        return base
    n = base.geometry.normal
    d = DIR[axis]
    s = 1.0 if (n.x * d[0] + n.y * d[1] + n.z * d[2]) > 0 else -1.0
    inp = comp.constructionPlanes.createInput()
    inp.setByOffset(base, V.createByReal(w * 100.0 * s))
    pl = comp.constructionPlanes.add(inp)
    pl.isLightBulbOn = False
    return pl


def sketch(comp, axis, w=0.0, name=None):
    sk = comp.sketches.add(plane(comp, axis, w))
    if name:
        sk.name = name
    return sk


def SP(sk, p):
    return sk.modelToSketchSpace(W(*p))


def line(sk, a, b):
    return sk.sketchCurves.sketchLines.addByTwoPoints(SP(sk, a), SP(sk, b))


def poly(sk, pts, close=True):
    n = len(pts)
    for i in range(n - 1):
        line(sk, pts[i], pts[i + 1])
    if close:
        line(sk, pts[-1], pts[0])


def spline(sk, pts):
    coll = adsk.core.ObjectCollection.create()
    for p in pts:
        coll.add(SP(sk, p))
    return sk.sketchCurves.sketchFittedSplines.add(coll)


def circle(sk, c, r):
    return sk.sketchCurves.sketchCircles.addByCenterRadius(SP(sk, c), r * 100.0)


def arc3(sk, a, m, b):
    return sk.sketchCurves.sketchArcs.addByThreePoints(SP(sk, a), SP(sk, m), b and SP(sk, b))


def prof(sk, ring=False):
    """Largest profile, or (ring=True) the profile that has an inner loop."""
    best, ba = None, -1.0
    for p in sk.profiles:
        if ring:
            if p.profileLoops.count > 1:
                return p
        else:
            a = p.areaProperties().area
            if a > ba:
                best, ba = p, a
    if ring:
        raise Exception('no ring profile in ' + sk.name)
    return best


def all_profiles(sk):
    coll = adsk.core.ObjectCollection.create()
    for p in sk.profiles:
        coll.add(p)
    return coll


def extrude(comp, sk, p, axis, dist, op=NEW, sym=False):
    """Extrude along model axis by signed dist (m) from the sketch plane; sym = total length centred."""
    nrm = sk.xDirection.crossProduct(sk.yDirection)
    d = DIR[axis]
    s = 1.0 if (nrm.x * d[0] + nrm.y * d[1] + nrm.z * d[2]) > 0 else -1.0
    inp = comp.features.extrudeFeatures.createInput(p, op)
    if sym:
        inp.setSymmetricExtent(V.createByReal(abs(dist) * 100.0), True)
    else:
        inp.setDistanceExtent(False, V.createByReal(dist * 100.0 * s))
    return comp.features.extrudeFeatures.add(inp)


def revolve(comp, sk, p, axis_entity, op=NEW):
    inp = comp.features.revolveFeatures.createInput(p, axis_entity, op)
    inp.setAngleExtent(False, V.createByReal(2.0 * math.pi))
    return comp.features.revolveFeatures.add(inp)


# ---------- appearances ----------
_APP = {}


def paint(body, rgb):
    key = tuple(round(v, 3) for v in rgb)
    ap = _APP.get(key)
    if ap is None:
        des = design()
        nm = 'VTOLc_%02d%02d%02d' % tuple(int(round(v * 99)) for v in key)
        ap = des.appearances.itemByName(nm)
        if ap is None:
            base = None
            lib = app.materialLibraries.itemByName('Fusion Appearance Library')
            for bn in ('Plastic - Matte (White)', 'Paint - Enamel Glossy (White)', 'Plastic - Glossy (White)'):
                base = lib.appearances.itemByName(bn)
                if base is not None:
                    break
            ap = des.appearances.addByCopy(base, nm)
            adsk.core.ColorProperty.cast(ap.appearanceProperties.itemByName('Color')).value = \
                adsk.core.Color.create(int(key[0] * 255), int(key[1] * 255), int(key[2] * 255), 255)
        _APP[key] = ap
    body.appearance = ap


# ---------- airfoils ----------
def naca(m, p, t, N):
    up, lo = [], []
    for i in range(N + 1):
        x = (1 - math.cos(math.pi * i / N)) / 2
        yt = 5 * t * (0.2969 * math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4)
        yc = dy = 0.0
        if m > 0:
            if x < p:
                yc = m / (p * p) * (2 * p * x - x * x)
                dy = 2 * m / (p * p) * (p - x)
            else:
                yc = m / ((1 - p) ** 2) * ((1 - 2 * p) + 2 * p * x - x * x)
                dy = 2 * m / ((1 - p) ** 2) * (p - x)
        th = math.atan(dy)
        up.append((x - yt * math.sin(th), yc + yt * math.cos(th)))
        lo.append((x + yt * math.sin(th), yc - yt * math.cos(th)))
    up.reverse()
    return up + lo[1:]          # TE(upper) -> LE -> TE(lower), x/c in [0,1]


def foil_wing():
    """NACA 2415 section from params foil= (x negative, metres), normalised to chord fractions."""
    xmax = max(-p[0] for p in FOIL_FILE)
    return [(-p[0] / xmax, p[1] / xmax) for p in FOIL_FILE]


def draw_section(sk, foil, c, x0, x1, z=0.0):
    """Closed outline of the part of the section between chord fractions x0..x1 (model X = -x*c)."""
    le = min(range(len(foil)), key=lambda i: foil[i][0])
    top = [foil[i] for i in range(le, -1, -1)]      # LE -> TE upper
    bot = foil[le:]                                 # LE -> TE lower

    def yat(s, x):
        for i in range(1, len(s)):
            if s[i][0] >= x:
                f = (x - s[i - 1][0]) / (s[i][0] - s[i - 1][0])
                return s[i - 1][1] + f * (s[i][1] - s[i - 1][1])
        return s[-1][1]

    def side(s):
        r = []
        if x0 > 0:
            r.append((x0, yat(s, x0)))
        r += [q for q in s if x0 + 1e-6 < q[0] < x1 - 1e-6]
        r.append((x1, yat(s, x1)))
        return r

    up, lo = side(top), side(bot)
    pt = lambda q: (-q[0] * c, q[1] * c, z)
    if x0 <= 0:
        nose = [pt(q) for q in reversed(up)] + [pt((0.0, foil[le][1]))] + [pt(q) for q in lo]
        spline(sk, nose)
    else:
        spline(sk, [pt(q) for q in up])
        spline(sk, [pt(q) for q in lo])
        line(sk, pt(up[0]), pt(lo[0]))
    line(sk, pt(up[-1]), pt(lo[-1]))


def rround(sk, uv, cu, cv, w, h, r):
    """Rounded rectangle; uv(u, v) maps sketch (u, v) to a model point."""
    x0, x1, y0, y1 = cu - w / 2, cu + w / 2, cv - h / 2, cv + h / 2
    L = lambda a, b: line(sk, uv(*a), uv(*b))
    L((x0 + r, y0), (x1 - r, y0)); L((x1, y0 + r), (x1, y1 - r))
    L((x1 - r, y1), (x0 + r, y1)); L((x0, y1 - r), (x0, y0 + r))
    k = r * (1 - math.sqrt(0.5))
    A = lambda a, m, b: sk.sketchCurves.sketchArcs.addByThreePoints(SP(sk, uv(*a)), SP(sk, uv(*m)), SP(sk, uv(*b)))
    A((x1 - r, y0), (x1 - k, y0 + k), (x1, y0 + r))
    A((x1, y1 - r), (x1 - k, y1 - k), (x1 - r, y1))
    A((x0 + r, y1), (x0 + k, y1 - k), (x0, y1 - r))
    A((x0, y0 + r), (x0 + k, y0 + k), (x0 + r, y0))


# ---------- component bookkeeping ----------
def find_comp(name):
    for o in root().occurrences:
        if o.component.name == name:
            return o
    return None


def make(name, fn, rgb=None, at=(0, 0, 0)):
    """Create component `name` at identity, run fn(comp) to build its bodies; delete it on failure."""
    r = root()
    occ = r.occurrences.addNewComponent(T(*at))
    occ.component.name = name
    comp = occ.component
    try:
        fn(comp)
        n = comp.bRepBodies.count
        if n < 1:
            raise Exception('no body produced for ' + name)
        col = rgb or COLORS.get(name)
        for i in range(n):
            b = comp.bRepBodies.item(i)
            b.name = name if n == 1 else '%s_%d' % (name, i + 1)
            if col:
                paint(b, col)
        try:
            comp.description = DESC.get(name, '')
        except Exception:
            pass
        for sk in comp.sketches:
            sk.isLightBulbOn = False
        print('built', name, 'bodies', n, 'vol_cm3 %.3f' % sum(comp.bRepBodies.item(i).volume for i in range(n)))
    except Exception:
        occ.deleteMe()
        raise
    return occ


def T(x, y, z):
    m = adsk.core.Matrix3D.create()
    m.translation = adsk.core.Vector3D.create(z * 100.0, x * 100.0, y * 100.0)
    return m


def placements(name):
    return [(c[1], c[2], c[3]) for c in COMPS if c[0] == name]


def build_and_place(name, fn, rgb=None):
    if find_comp(name) is not None:
        print('skip existing', name)
        return
    pts = placements(name)
    occ0 = make(name, fn, rgb, at=pts[0])
    for p in pts[1:]:
        root().occurrences.addExistingComponent(occ0.component, T(*p))


def bbox_sw(occ):
    """World bbox in the model frame (m): body boxes (component space) + occurrence translation (no rotations used)."""
    t = occ.transform2.translation
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for i in range(occ.component.bRepBodies.count):
        bb = occ.component.bRepBodies.item(i).boundingBox
        a, c = bb.minPoint, bb.maxPoint
        for k, (vl, vh, tt) in enumerate(((a.y, c.y, t.y), (a.z, c.z, t.z), (a.x, c.x, t.x))):
            lo[k] = min(lo[k], (vl + tt) / 100.0)
            hi[k] = max(hi[k], (vh + tt) / 100.0)
    return lo, hi


def report(names=None):
    design().activateRootComponent()
    """Print each root occurrence: translation vs nearest params target (mm) and world bbox in the model frame (m)."""
    for o in root().occurrences:
        nm = o.component.name
        if names and nm not in names:
            continue
        t = o.transform2.translation
        got = (t.y / 100, t.z / 100, t.x / 100)
        tg = [(c[1], c[2], c[3]) for c in COMPS if c[0] == nm]
        dev = min(max(abs(got[i] - g[i]) for i in range(3)) for g in tg) * 1000 if tg else float('nan')
        if o.component.bRepBodies.count:
            lo, hi = bbox_sw(o)
            print('%-24s dev %.3f mm  bbox X[%.4f,%.4f] Y[%.4f,%.4f] Z[%.4f,%.4f]' %
                  (o.name, dev, lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]))
        else:
            print('%-24s (assembly) %d sub-components' % (o.name, o.component.occurrences.count))


# ---------- part builders ----------
def tube(axis, od, id_, ln):
    def f(comp):
        sk = sketch(comp, axis, 0)
        circle(sk, (0, 0, 0), od / 2)
        circle(sk, (0, 0, 0), id_ / 2)
        extrude(comp, sk, prof(sk, ring=True), axis, ln)
    return f


def revolved(axis, ar, close=True):
    """Revolve the (axial, radial) polyline about the model X or Y axis through the origin."""
    def f(comp):
        sk = sketch(comp, 'Z', 0)
        if axis == 'X':
            pts = [(a, r, 0) for a, r in ar]
            ax = comp.yConstructionAxis
        else:
            pts = [(r, a, 0) for a, r in ar]
            ax = comp.zConstructionAxis
        poly(sk, pts, close)
        revolve(comp, sk, prof(sk), ax)
    return f


def wing_panel(left):
    def f(comp):
        c, L = P['chord'], P['panelLen']
        Lin = L - L * 0.55
        sg = -1 if left else 1
        foil = foil_wing()
        sk = sketch(comp, 'Z', 0, 'Section_0_72')
        draw_section(sk, foil, c, 0.0, 0.72)
        extrude(comp, sk, prof(sk), 'Z', sg * L)
        sk = sketch(comp, 'Z', 0, 'Section_72_100')
        draw_section(sk, foil, c, 0.72, 1.0)
        extrude(comp, sk, prof(sk), 'Z', sg * Lin, JOIN)
        sk = sketch(comp, 'Z', 0, 'Spar_Socket')
        circle(sk, (P['sparX'], P['sparY'], 0), P['sparOD'] / 2)
        extrude(comp, sk, prof(sk), 'Z', sg * P['sparLen'], CUT)
    return f


def aileron(left):
    def f(comp):
        c, L = P['chord'], P['panelLen']
        sk = sketch(comp, 'Z', 0, 'Aileron_Section')
        draw_section(sk, foil_wing(), c, 0.74, 1.0)
        extrude(comp, sk, prof(sk), 'Z', (-1 if left else 1) * (L * 0.55 - 0.004))
    return f


def wing_saddle(comp):
    c, fr = P['chord'], P['fusR']
    sk = sketch(comp, 'Z', 0, 'Root_Section')
    draw_section(sk, foil_wing(), c, 0.0, 1.0)
    extrude(comp, sk, prof(sk), 'Z', 2 * fr, NEW, sym=True)
    sk = sketch(comp, 'Z', 0, 'Joiner_Bore')
    circle(sk, (P['sparX'], P['sparY'], 0), P['joinOD'] / 2 + 0.000115)
    extrude(comp, sk, prof(sk), 'Z', 2 * fr + 0.002, CUT, sym=True)


def saddle_sec(lx, top, bottom, w, tube_d, r):
    """Printed block around a boom (axis X at origin): rounded section (Z wide, Y tall) extruded symmetric lx."""
    def f(comp):
        sk = sketch(comp, 'X', 0)
        rround(sk, lambda u, v: (0, v, u), 0, (top + bottom) / 2, w, top - bottom, r)
        circle(sk, (0, 0, 0), tube_d / 2)
        extrude(comp, sk, prof(sk, ring=True), 'X', lx, NEW, sym=True)
    return f


def tailplane(elevator):
    def f(comp):
        c, span = P['hC'], P['hSpan']
        sk = sketch(comp, 'Z', 0)
        if elevator:
            draw_section(sk, naca(0, 0.4, 0.09, 30), c, 0.70, 1.0)
        else:
            draw_section(sk, naca(0, 0.4, 0.09, 30), c, 0.0, 0.68)
        extrude(comp, sk, prof(sk), 'Z', P['elevSpan'] if elevator else span, NEW, sym=True)
    return f


def fin(comp):
    c, h = P['vC'], P['vH']
    foil = naca(0, 0.4, 0.09, 30)

    def sec(sk, y, scale, xoff):
        pts = [(-f[0] * c * scale - xoff, y, f[1] * c * scale) for f in foil]
        spline(sk, pts)
        line(sk, pts[0], pts[-1])
    s1 = sketch(comp, 'Y', 0, 'Fin_Root')
    sec(s1, 0.0, 1.0, 0.0)
    s2 = sketch(comp, 'Y', h, 'Fin_Tip')
    sec(s2, h, 0.65, 0.35 * c)
    li = comp.features.loftFeatures.createInput(NEW)
    li.loftSections.add(prof(s1))
    li.loftSections.add(prof(s2))
    li.isSolid = True
    comp.features.loftFeatures.add(li)


def fuselage(comp):
    L, R, rt, a = P['fusL'], P['fusR'], P['tailR'], 0.22
    sk = sketch(comp, 'Z', 0)
    pts, N = [], 30
    for i in range(N + 1):
        s = L * i / N
        if s < a:
            r = R * math.sqrt(max(0.0, 1 - ((s - a) / a) ** 2))
        elif s < 0.50:
            r = R
        else:
            u = (s - 0.50) / (L - 0.50)
            r = rt + (R - rt) * (1 - u * u * (3 - 2 * u))
        pts.append((-s, 0.0 if i == 0 else r, 0))
    spline(sk, pts)
    line(sk, (-L, rt, 0), (-L, 0, 0))
    line(sk, (-L, 0, 0), (0, 0, 0))
    revolve(comp, sk, prof(sk), comp.yConstructionAxis)


def canopy(comp):
    N, L, r = 20, 0.26, 0.055
    sk = sketch(comp, 'Z', 0)
    pts = []
    for i in range(N + 1):
        s = L * i / N
        pts.append((-s, r * math.sqrt(max(0.0, 1 - ((2 * s - L) / L) ** 2)), 0))
    spline(sk, pts)
    line(sk, (-L, 0, 0), (0, 0, 0))
    revolve(comp, sk, prof(sk), comp.yConstructionAxis)


def roundbox(lx, ly, lz, r):
    def f(comp):
        sk = sketch(comp, 'Z', 0)
        rround(sk, lambda u, v: (u, v, 0), 0, 0, lx, ly, r)
        extrude(comp, sk, prof(sk), 'Z', lz, NEW, sym=True)
    return f


def prop(pusher, dia):
    def f(comp):
        Rt, t = dia / 2, P['propT']
        # lift: blade radial along X, chord along Z, thickness along Y.  pusher: radial along Y, chord along Z, thickness along X
        mp = (lambda rad, ch: (0, rad, ch)) if pusher else (lambda rad, ch: (rad, 0, ch))
        ax = 'X' if pusher else 'Y'
        sk = sketch(comp, ax, 0)
        for s in (1.0, -1.0):
            r0, cr, cm, ct = 0.012, dia * 0.045, dia * 0.075, dia * 0.035
            pts = [(s * r0, -cr / 2), (s * Rt * .30, -cm * .55), (s * Rt * .85, -ct * .55), (s * Rt * .98, -ct * .20),
                   (s * Rt, 0), (s * Rt * .98, ct * .30), (s * Rt * .85, ct * .45), (s * Rt * .30, cm * .45), (s * r0, cr / 2)]
            poly(sk, [mp(*q) for q in pts], True)
        extrude(comp, sk, all_profiles(sk), ax, t, NEW, sym=True)
        sk = sketch(comp, ax, 0)
        circle(sk, (0, 0, 0), 0.014)
        extrude(comp, sk, prof(sk), ax, t * 2.2, JOIN, sym=True)
    return f


def motor_profile(axis):
    R, H = P['motorD'] / 2, P['motorH']
    pr = [(0, 0), (0, R * .92), (.004, R * .92), (.004, R * .70), (.007, R * .70), (.007, R), (H - .004, R), (H, R - .004),
          (H, .009), (H + .010, .009), (H + .010, .004), (H + .018, .004), (H + .018, 0)]
    if axis == 'X':
        pr = [(-a, r) for a, r in pr]
    return pr


def leg(comp):
    R = P['legOD'] / 2
    sk = sketch(comp, 'Y', 0)
    circle(sk, (0, 0, 0), R)
    circle(sk, (0, 0, 0), P['legID'] / 2)
    extrude(comp, sk, prof(sk, ring=True), 'Y', P['legLen'])
    fr, fh = 0.020, 0.018
    sk = sketch(comp, 'Z', 0, 'Foot')
    poly(sk, [(0, 0, 0), (fr * .85, 0, 0), (fr, .004, 0), (fr, fh * .55, 0), (R * 1.15, fh, 0), (0, fh, 0)], True)
    revolve(comp, sk, prof(sk), comp.zConstructionAxis, JOIN)


def box_part(dims):
    """dims (L along X, W along Z, H along Y) in m, centred on the origin."""
    L, Wd, H = dims

    def f(comp):
        sk = sketch(comp, 'Y', -H / 2)
        poly(sk, [(-L / 2, -H / 2, -Wd / 2), (L / 2, -H / 2, -Wd / 2), (L / 2, -H / 2, Wd / 2), (-L / 2, -H / 2, Wd / 2)], True)
        extrude(comp, sk, prof(sk), 'Y', H)
    return f


def wheel(comp):
    R, Wd, rb, ch = 0.0381, 0.020, 0.003970 / 2, 0.0015
    sk = sketch(comp, 'Y', 0)
    # (radial along X, axial along Z); axle bore 3.97 mm, 1.5 mm chamfered rim
    poly(sk, [(rb, 0, -Wd / 2), (R - ch, 0, -Wd / 2), (R, 0, -Wd / 2 + ch), (R, 0, Wd / 2 - ch), (R - ch, 0, Wd / 2), (rb, 0, Wd / 2)], True)
    # profile points use (x=radial, y=0, z=axial): sketch plane is Fusion XY (model Y), axis = Fusion X' (model Z)
    revolve(comp, sk, prof(sk), comp.xConstructionAxis)


def recolor_all():
    """Re-apply the meta.json colour to every body of every root component (idempotent)."""
    for o in root().occurrences:
        col = COLORS.get(o.component.name)
        if col:
            for i in range(o.component.bRepBodies.count):
                paint(o.component.bRepBodies.item(i), col)


# ---------- parameters ----------
def add_user_params():
    ups = design().userParameters
    for k in ('chord', 'panelLen', 'tc', 'sparOD', 'sparID', 'sparLen', 'joinOD', 'joinID', 'joinLen', 'boomOD', 'boomID',
              'segF', 'segR', 'fusL', 'fusR', 'tailR', 'motorD', 'motorH', 'liftProp', 'pushProp', 'hC', 'hSpan', 'vH', 'vC',
              'elevSpan', 'battL', 'battH', 'battW', 'legOD', 'legID', 'legLen'):
        if ups.itemByName(k) is None:
            ups.add(k, V.createByReal(P[k] * 100.0), 'cm' if k != 'tc' else '', 'cad/params.txt (reference; features use these values)')


# ---------- stages ----------
def stage15():
    build_and_place('Wing_Panel_R', wing_panel(False))
    build_and_place('Wing_Panel_L', wing_panel(True))
    build_and_place('Aileron_R', aileron(False))
    build_and_place('Aileron_L', aileron(True))
    build_and_place('Spar_Tube', tube('Z', P['sparOD'], P['sparID'], P['sparLen']))
    build_and_place('Wing_Joiner', tube('Z', P['joinOD'], P['joinID'], P['joinLen']))
    build_and_place('Wing_Saddle', wing_saddle)
    build_and_place('Wing_Bolt', revolved('Y', [(-0.030, 0), (-0.030, 0.0025), (0, 0.0025), (0, 0.00475), (0.0028, 0.00475), (0.0028, 0)]))


def stage16():
    bOD, bID = P['boomOD'], P['boomID']
    build_and_place('Boom_Front', tube('X', bOD, bID, P['segF']))
    build_and_place('Boom_Rear_Stub', tube('X', bOD, bID, P['segR']))
    build_and_place('Boom_Clamp_Front', saddle_sec(0.034, P['clampTopF'], -(bOD / 2 + 0.004), 0.040, bOD, 0.005))
    build_and_place('Boom_Clamp_Rear', saddle_sec(0.034, P['clampTopR'], -(bOD / 2 + 0.004), 0.040, bOD, 0.005))
    # motor mount: Saddle(lx .070, h .036, w .046, flatTop) -> section centred 3 mm above the boom axis
    build_and_place('Motor_Mount', saddle_sec(0.070, 0.003 + 0.018, 0.003 - 0.018, 0.046, bOD, 0.006))


def stage17():
    build_and_place('H_Tail', tailplane(False))
    build_and_place('Elevator', tailplane(True))
    build_and_place('Fin', fin)


def stage18():
    build_and_place('Fuselage_Pod', fuselage)
    build_and_place('Canopy', canopy)
    build_and_place('Battery_6S_LiPo', roundbox(P['battL'], P['battH'], P['battW'], 0.006))
    build_and_place('Pitot_Tube', revolved('X', [(0, 0), (0, .003), (.22, .003), (.245, .0012), (.25, 0)]))


def stage19():
    build_and_place('Lift_Motor', revolved('Y', motor_profile('Y')))
    build_and_place('Pusher_Motor', revolved('X', motor_profile('X')))
    build_and_place('Lift_Prop', prop(False, P['liftProp']))
    build_and_place('Pusher_Prop_14in', prop(True, P['pushProp']))
    build_and_place('Spinner', revolved('X', [(0, 0), (0, .021), (-.012, .019), (-.026, .012), (-.038, 0)]))


def stage20():
    bOD = P['boomOD']
    build_and_place('Gear_Clamp', saddle_sec(0.034, bOD / 2 + 0.004, -(bOD / 2 + 0.016), 0.040, bOD, 0.005))
    build_and_place('Landing_Leg', leg)
    # proposed wheels: one sub-component per Landing_Leg, axle 10 mm below the tube end (EST)
    if find_comp('Proposed_Wheels') is None:
        r = root()
        po = r.occurrences.addNewComponent(adsk.core.Matrix3D.create())
        po.component.name = 'Proposed_Wheels'
        po.component.description = 'Du-Bro 300SL 3.00 in wheels (76.2 mm dia, 20 mm wide EST, 3.97 mm axle), axle 10 mm below leg tube end (EST); docs/research/electrical-architecture.md s11'
        legs = placements('Landing_Leg')
        for (x, y, z) in legs:
            nm = 'Wheel_%s_%s' % ('Fwd' if x > 0 else 'Aft', 'R' if z > 0 else 'L')
            so = po.component.occurrences.addNewComponent(T(x, y - 0.010, z))
            so.component.name = nm
            try:
                wheel(so.component)
                b = so.component.bRepBodies.item(0)
                b.name = nm
                paint(b, COLORS['Landing_Leg'])
                for sk in so.component.sketches:
                    sk.isLightBulbOn = False
            except Exception:
                so.deleteMe()
                raise
            print('wheel', nm, (x, y - 0.010, z))
        design().activateRootComponent()


def stage21():
    if find_comp('Electronics') is not None:
        print('skip existing Electronics')
        return
    r = root()
    eo = r.occurrences.addNewComponent(adsk.core.Matrix3D.create())
    eo.component.name = 'Electronics'
    eo.component.description = 'Envelopes from inventory/electrical/components.json: box L along X, W along Z, H along Y, centred on the placement; null dims = 10 mm marker cube'
    pal = {'ESC': (0.86, 0.38, 0.10), 'SRV': (0.35, 0.60, 0.85), 'FC1': (0.15, 0.65, 0.35), 'CAP': (0.95, 0.80, 0.15),
           'JB_': (0.95, 0.80, 0.15)}
    for (cid, dims, x, y, z, parent) in ELEC:
        if cid.startswith('MOT_') or cid in ('BAT1', 'PITOT1'):
            continue
        if dims is None or len(dims) < 3:
            d = (0.010, 0.010, 0.010)
        else:
            d = (dims[0] / 1000.0, dims[1] / 1000.0, dims[2] / 1000.0)      # L (X), W (Z), H (Y)
        so = eo.component.occurrences.addNewComponent(T(x, y, z))
        so.component.name = cid
        so.component.description = 'parent %s; dims_mm %s' % (parent, dims)
        try:
            box_part(d)(so.component)
            b = so.component.bRepBodies.item(0)
            b.name = cid
            paint(b, pal.get(cid[:3], (0.45, 0.50, 0.55)))
            for sk in so.component.sketches:
                sk.isLightBulbOn = False
        except Exception:
            so.deleteMe()
            raise
    print('electronics sub-components', eo.component.occurrences.count)
    design().activateRootComponent()


def run(context):
    try:
        add_user_params()
        stage15(); stage16(); stage17(); stage18(); stage19(); stage20(); stage21()
        report()
        try:
            adsk.core.Application.get().activeViewport.fit()
        except Exception:
            pass
    except Exception:
        print(traceback.format_exc())
