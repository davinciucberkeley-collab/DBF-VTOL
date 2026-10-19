"""Export the tilt-wing CAD model (STEP assembly + per-part STL) from the same parametric model as the dashboard.

Geometry comes from tiltwing/model.js (run through Node) so the files match the dashboard exactly.
Inputs: tiltwing/cad/params.json (any subset of the dashboard slider keys; missing keys use the paper defaults).
Outputs: tiltwing/cad/<config>/TiltWing_<config>.step and <part>.stl for tilt 0 deg (cruise) and 90 deg (hover).
CAD axes: X aft from the nose, Y to starboard, Z up. Units mm.
Run: python3 tiltwing/tools/cad_export.py
"""
import json, os, subprocess, math
import cadquery as cq

HERE = os.path.dirname(os.path.abspath(__file__))
TW = os.path.dirname(HERE)
CAD = os.path.join(TW, "cad")
os.makedirs(CAD, exist_ok=True)
params_path = os.path.join(CAD, "params.json")
if not os.path.exists(params_path):
    json.dump({}, open(params_path, "w"))

js = """
const M=require(process.argv[1]+'/model.js');M.setAirfoils(require(process.argv[1]+'/data/airfoils.json'));
const p=Object.assign(M.defaults(), require(process.argv[2]));const r=M.size(p);delete r.in;
console.log(JSON.stringify({p, r}));"""
out = subprocess.check_output(["node", "-e", js, TW, params_path], text=True)
D = json.loads(out); p, r = D["p"], D["r"]
AF = json.load(open(os.path.join(TW, "data", "airfoils.json")))["airfoils"]
MM = 1000.0

def loop(name):
    c = AF[name]["coords"]
    if math.dist(c[0], c[-1]) < 1e-6: c = c[:-1]
    return c

def section(name, x_le, chord, y, z0):
    """Closed airfoil wire in the XZ plane at span station y (mm)."""
    pts = [cq.Vector((x_le + chord * xa) * MM, y * MM, (z0 + chord * za) * MM) for xa, za in loop(name)]
    return cq.Wire.makePolygon(pts, close=True)

def surface(name, half, x_le_root, cr, ct, sweep_deg, z0, y_in=0.0, n=6):
    """Lofted lifting surface as two halves from y_in (fuselage side, so the halves can tilt clear of it) to the tips.
    Planform is the full trapezoid of the sizing model; only the part inside the fuselage is left out."""
    t = math.tan(math.radians(sweep_deg))
    solids = []
    for s in (-1, 1):
        ys = [s * (y_in + (half - y_in) * i / n) for i in range(n + 1)]
        wires = [section(name, x_le_root + abs(y) * t, cr - (cr - ct) * abs(y) / half, y, z0) for y in ys]
        solids.append(cq.Solid.makeLoft(wires, True))
    return cq.Workplane().add(solids[0]).union(cq.Workplane().add(solids[1]))

def fuselage(Lf, R, n=64):
    prof = []
    for i in range(n + 1):
        tt = i / n
        if tt < 0.32: rr = R * math.sqrt(max(0, 1 - ((0.32 - tt) / 0.32) ** 2))
        elif tt < 0.58: rr = R
        else: rr = R * (1 - 0.72 * ((tt - 0.58) / 0.42) ** 1.3)
        prof.append((tt * Lf * MM, max(rr, 0) * MM))
    pts = []
    for q in [(0.0, 0.0)] + prof + [(prof[-1][0], 0.0)]:
        if not pts or math.dist(pts[-1], q) > 1e-6: pts.append(q)
    # revolve the half-profile (local x = global X, local y = global Z) about the X axis
    return cq.Workplane("XZ").polyline(pts).close().revolve(360, (0, 0, 0), (1, 0, 0))

def rotor(x_le, y, z, D, length, rad):
    """Nacelle (cylinder) + spinner + 2-blade prop, axis along X, prop ahead of the LE."""
    xn0 = x_le - 0.45 * length
    nac = cq.Workplane("YZ", origin=(xn0 * MM, y * MM, z * MM)).circle(rad * MM).extrude(length * MM)
    spin = cq.Workplane("YZ", origin=((xn0 - 2.2 * rad) * MM, y * MM, z * MM)).circle(0.2).workplane(offset=2.2 * rad * MM).circle(rad * MM).loft()
    blade_w = 0.045 * D / 0.36
    prop = (cq.Workplane("YZ", origin=((xn0 - 0.6 * rad) * MM, y * MM, z * MM))
            .rect(D * 0.95 * MM, blade_w * MM).extrude(6).rotate((0, y * MM, z * MM), (1, y * MM, z * MM), 20))
    return nac.union(spin), prop

def build(tilt_deg):
    hb = p["span"] / 2
    zw, zt = 0.42 * p["df"], 0.12 * p["df"]
    parts = {}
    parts["Fuselage"] = fuselage(p["Lf"], p["df"] / 2)
    wing = surface("s1223", hb, r["xLEroot"], r["cr"], r["ct"], r["sweepLE"], zw, y_in=0.55 * p["df"])
    xth = r["xt"] - 0.3 * r["crh"]
    tail = surface("naca0009", r["bh"] / 2, xth, r["crh"], r["cth"], 5.0, zt, y_in=0.25 * p["df"])
    spar = cq.Workplane("XZ", origin=(r["xw"] * MM, 0.6 * p["df"] * MM, zw * MM)).circle(0.012 * MM).extrude(1.2 * p["df"] * MM)
    tspar = cq.Workplane("XZ", origin=(r["xt"] * MM, 0.3 * p["df"] * MM, zt * MM)).circle(0.008 * MM).extrude(0.6 * p["df"] * MM)
    tw = math.tan(math.radians(r["sweepLE"]))
    wing_rot = []
    for y in (-0.5 * p["span"], -0.2 * p["span"], 0.2 * p["span"], 0.5 * p["span"]):
        n, pr = rotor(r["xLEroot"] + abs(y) * tw, y, zw, r["Df"], 0.55 * r["cr"] + 0.1, 0.028)
        wing_rot.append((n, pr))
    tail_rot = []
    for y in (-r["bh"] / 2, r["bh"] / 2):
        n, pr = rotor(xth + r["bh"] / 2 * math.tan(math.radians(5)), y, zt, r["Dr"], 0.55 * r["crh"] + 0.06, 0.02)
        tail_rot.append((n, pr))
    rot = lambda w, x, z: w.rotate((x * MM, 0, z * MM), (x * MM, 1, z * MM), tilt_deg) if tilt_deg else w
    parts["Wing_S1223"] = rot(wing, r["xw"], zw)
    parts["H_Tail_NACA0009"] = rot(tail, r["xt"], zt)
    parts["Wing_Tilt_Spar"] = spar
    parts["Tail_Tilt_Spar"] = tspar
    for i, (n, pr) in enumerate(wing_rot):
        parts[f"Wing_Nacelle_{i+1}"] = rot(n, r["xw"], zw); parts[f"Wing_Prop_{i+1}"] = rot(pr, r["xw"], zw)
    for i, (n, pr) in enumerate(tail_rot):
        parts[f"Tail_Nacelle_{i+1}"] = rot(n, r["xt"], zt); parts[f"Tail_Prop_{i+1}"] = rot(pr, r["xt"], zt)
    return parts

COLORS = {"Fuselage": (0.80, 0.82, 0.84), "Wing_S1223": (0.95, 0.95, 0.95), "H_Tail_NACA0009": (0.95, 0.95, 0.95)}
manifest = {"params": p, "derived": {k: r[k] for k in ("S", "cr", "ct", "MAC", "sweepLE", "Sh", "bh", "crh", "xw", "xt", "xcg", "m")}, "configs": {}}
for name, tilt in (("cruise_tilt0", 0), ("hover_tilt90", 90)):
    d = os.path.join(CAD, name); os.makedirs(d, exist_ok=True)
    parts = build(tilt)
    asm = cq.Assembly(name=f"TiltWing_{name}")
    files = []
    for pn, wp in parts.items():
        col = COLORS.get(pn, (0.28, 0.31, 0.34))
        asm.add(wp, name=pn, color=cq.Color(*col))
        f = os.path.join(d, pn + ".stl"); cq.exporters.export(wp, f, tolerance=0.2, angularTolerance=0.2); files.append(os.path.basename(f))
    step = os.path.join(d, f"TiltWing_{name}.step"); asm.save(step)
    manifest["configs"][name] = {"tilt_deg": tilt, "step": os.path.basename(step), "stl": files}
    print(name, "parts", len(parts), "step", os.path.getsize(step) // 1024, "KB")
json.dump(manifest, open(os.path.join(CAD, "manifest.json"), "w"), indent=1)
