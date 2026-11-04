"""3-D streamlines over the v0.4 lifting surfaces (wing, H-tail, twin fins) from the AeroSandbox vortex-lattice model.

AeroSandbox 4.2.10 (PyPI, https://github.com/peterdsharpe/AeroSandbox, checked 2026-10-21) VortexLatticeMethod,
same geometry as asb_model.airplane() (results.json v0.4 span/chord, cad/params.txt tail), cruise 20 m/s at the AVL
trimmed angle of attack (aero_results.json trim_cruise.alpha_deg; elevator not modelled, control surfaces are not
part of the VLM geometry; the pod is ignored by the VLM).  Streamlines are integrated with RK4 (fixed spatial step)
through the free-stream + horseshoe-vortex induced velocity field (VortexLatticeMethod.get_velocity_at_points),
seeded on a plane ahead of the wing across the span and just outboard of the tips so the tip vortices roll up.
Inviscid potential flow: no boundary layer, no separation.

Output frame: the CAD / review-viewer frame (cad/params.txt, review/src/cadviewer.js): X forward from the wing LE,
Y up, Z right, metres.  AeroSandbox geometry axes are x aft, y right, z up, so X = -x, Y = z, Z = y.
Outputs: out/flowviz/flow3d.json, plots/flow_3d.png, out/flow3d_summary.json
"""
from __future__ import annotations
import sys, time
import numpy as np
import aerosandbox as asb
from common import *
from asb_model import airplane

VIZ = OUT / "flowviz"; VIZ.mkdir(exist_ok=True)
AERO = json.loads((HERE / "aero_results.json").read_text())
ALPHA = AERO["trim_cruise"]["alpha_deg"]
V_INF = V_CRUISE
SPAN_RES, CHORD_RES = 24, 8
CORE = 0.004        # vortex core radius, m (~1.5 % chord): regularises the induced velocity near the filaments
STEP = 0.005        # streamline spatial step, m
N_STEPS = 400       # 2.0 m of path: from 0.4 m ahead of the wing to ~0.6 m behind the tail
THIN = 5            # keep every 5th point for the JSON (points 25 mm apart on straight runs)

def to_cad(p):
    """AeroSandbox geometry axes (x aft, y right, z up) -> CAD frame (X fwd, Y up, Z right)"""
    p = np.asarray(p)
    return np.stack([-p[..., 0], p[..., 2], p[..., 1]], axis=-1)

def build():
    ap = airplane()
    op = asb.OperatingPoint(velocity=V_INF, alpha=ALPHA, atmosphere=asb.Atmosphere(altitude=0))
    vlm = asb.VortexLatticeMethod(airplane=ap, op_point=op, spanwise_resolution=SPAN_RES, chordwise_resolution=CHORD_RES)
    res = vlm.run()                      # solved with the default core (1e-8 m), as in asb_model.py
    vlm.vortex_core_radius = CORE        # regularised core only for the field evaluation along the streamlines
    return ap, op, vlm, res

def seeds():
    """seed points in AeroSandbox axes: a plane 0.4 m ahead of the wing LE"""
    x0 = -0.4
    b2 = SPAN / 2
    pts = []
    # main sheet: across the span to 0.10 m beyond each tip, 0.10 m apart, three heights around the wing
    half = b2 + 0.10
    for z in (-0.06, 0.0, 0.06):
        for y in np.linspace(-half, half, int(round(2 * half / 0.10)) + 1):
            pts.append([x0, y, z])
    # dense rows at both tips (inboard 0.95..1.00 b/2, outboard to 1.12 b/2) at the chord-line height
    for s in (-1, 1):
        for y in np.arange(0.95 * b2, 1.12 * b2 + 1e-9, 0.03):
            for z in (-0.03, 0.03):
                pts.append([x0, s * y, z])
    # a row at the H-tail height through the wing wake (downwash at the tail)
    for y in np.arange(-0.45, 0.451, 0.09):
        pts.append([x0, y, Z_HTAIL - 0.02])
    return np.array(pts)

def trace(vlm, seed, n_steps=N_STEPS, ds=STEP):
    """RK4 along the unit-velocity direction field; returns points (N, n_steps, 3) and |V|/V_inf (N, n_steps)"""
    def dirn(p):
        v = np.asarray(vlm.get_velocity_at_points(p))
        n = np.linalg.norm(v, axis=1, keepdims=True)
        return v / np.maximum(n, 1e-9), n[:, 0]
    P = np.empty((len(seed), n_steps, 3)); S = np.empty((len(seed), n_steps))
    p = seed.astype(float)
    for i in range(n_steps):
        k1, n1 = dirn(p); P[:, i] = p; S[:, i] = n1 / V_INF
        k2, _ = dirn(p + 0.5 * ds * k1)
        k3, _ = dirn(p + 0.5 * ds * k2)
        k4, _ = dirn(p + ds * k3)
        p = p + ds / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
    return P, S

def panels(vlm):
    """per surface: list of panel quads (front-left, back-left, back-right, front-right) in CAD frame"""
    fl, bl, br, fr = (to_cad(np.asarray(getattr(vlm, k))) for k in ("front_left_vertices", "back_left_vertices", "back_right_vertices", "front_right_vertices"))
    gamma = np.asarray(vlm.vortex_strengths).ravel()
    # assign panels to surfaces: wing panels sit at X in [-c, 0]; of the tail panels, a fin panel's spanwise
    # (front-left -> front-right) edge is vertical, an H-tail panel's is horizontal
    names = []
    for k in range(len(fl)):
        if fl[k, 0] > -0.5:
            names.append("wing")
        elif abs(fl[k, 1] - fr[k, 1]) > 1e-6:
            names.append("fin")
        else:
            names.append("htail")
    out = {}
    for n in ("wing", "htail", "fin"):
        idx = [k for k in range(len(fl)) if names[k] == n]
        out[n] = {"n": len(idx),
                  "quads": [[round(float(c), 4) for c in np.concatenate([fl[k], bl[k], br[k], fr[k]])] for k in idx],
                  "gamma": [round(float(gamma[k]), 4) for k in idx]}
    return out

def plot(P, S, pan, res):
    """P in the CAD frame (X fwd, Y up, Z right).  Left: 3-D three-quarter view; right: rear projection (Z, Y)."""
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection, Line3DCollection
    from matplotlib.collections import LineCollection, PolyCollection
    from matplotlib import cm, colors
    fig = plt.figure(figsize=(12, 10.5), dpi=150)
    gs = fig.add_gridspec(2, 1, height_ratios=[2.3, 1.0], hspace=0.02)
    norm = colors.Normalize(0.94, 1.06); cmap = matplotlib.colormaps["coolwarm"]
    ax = fig.add_subplot(gs[0], projection="3d")
    for name, sfc in pan.items():
        q = np.array(sfc["quads"]).reshape(-1, 4, 3)[:, :, [2, 0, 1]]      # (Z, X, Y) so Y is vertical
        ax.add_collection3d(Poly3DCollection(q, facecolor="#c8c8c8", edgecolor="#777777", linewidths=0.15, alpha=0.95))
    segs = []; cols = []
    for k in range(len(P)):
        pts = P[k][:, [2, 0, 1]]
        segs.append(np.stack([pts[:-1], pts[1:]], axis=1)); cols.append(cmap(norm(0.5 * (S[k][:-1] + S[k][1:]))))
    ax.add_collection3d(Line3DCollection(np.concatenate(segs), colors=np.concatenate(cols), linewidths=0.9))
    ax.set_xlim(-1.4, 1.4); ax.set_ylim(-1.5, 0.45); ax.set_zlim(-0.3, 0.3); ax.set_box_aspect((2.8, 1.95, 0.6), zoom=1.5)
    ax.set_xlabel("Z right (m)"); ax.set_ylabel("X forward (m)"); ax.set_zlabel("Y up (m)")
    ax.view_init(elev=22, azim=-35); ax.set_title("three-quarter view from the front-right", fontsize=10)
    # rear projection: streamlines that start outboard of 0.8 b/2 or at the tail row, seen from behind (Z right, Y up)
    ax2 = fig.add_subplot(gs[1])
    for name, sfc in pan.items():
        q = np.array(sfc["quads"]).reshape(-1, 4, 3)
        ax2.add_collection(PolyCollection(q[:, :, [2, 1]], facecolor="#dddddd", edgecolor="#999999", linewidths=0.2, zorder=1))
    segs = []; cols = []
    for k in range(len(P)):
        pts = P[k][:, [2, 1]]
        segs.append(np.stack([pts[:-1], pts[1:]], axis=1)); cols.append(cmap(norm(0.5 * (S[k][:-1] + S[k][1:]))))
    ax2.add_collection(LineCollection(np.concatenate(segs), colors=np.concatenate(cols), linewidths=1.4, zorder=2))
    ax2.set_xlim(-1.45, 1.45); ax2.set_ylim(-0.3, 0.3); ax2.set_aspect("equal")
    ax2.set_xlabel("Z right (m)"); ax2.set_ylabel("Y up (m)"); ax2.grid(alpha=0.3)
    ax2.set_title("rear projection (Z, Y): downwash behind the wing, roll-up around the tips", fontsize=10)
    sm = cm.ScalarMappable(norm=norm, cmap=cmap); sm.set_array([])
    cb = fig.colorbar(sm, ax=ax2, shrink=0.95, pad=0.015); cb.set_label("|V| / V∞ along the streamline")
    fig.suptitle(f"Streamlines over the v0.4 lifting surfaces — AeroSandbox {asb.__version__} VLM, cruise 20 m/s, α = {ALPHA:.2f}° (AVL trim), "
                 f"CL {float(res['CL']):.3f}; inviscid potential flow, pod not modelled", fontsize=10)
    fig.savefig(PLOTS / "flow_3d.png", bbox_inches="tight"); plt.close(fig)

def replot():
    """redraw plots/flow_3d.png from out/flowviz/flow3d.json without re-tracing"""
    doc = json.loads((VIZ / "flow3d.json").read_text())
    P = np.array([np.array(l["xyz"]).reshape(-1, 3) for l in doc["streamlines"]])
    S = np.array([l["s"] for l in doc["streamlines"]])
    pan = {k: v for k, v in doc["panels"].items() if k != "note"}
    plot(P, S, pan, {"CL": doc["condition"]["CL_vlm"]})

def main():
    if "--plot" in sys.argv:
        replot(); return
    t0 = time.time()
    ap, op, vlm, res = build()
    print(f"VLM: {len(vlm.vortex_strengths)} panels, CL {float(res['CL']):.4f} CDi {float(res['CD']):.5f} Cm {float(res['Cm']):.4f}  alpha {ALPHA:.3f}")
    seed = seeds()
    t1 = time.time()
    P, S = trace(vlm, seed)
    print(f"  {len(seed)} streamlines x {N_STEPS} RK4 steps in {time.time()-t1:.0f} s")
    # wing-induced downwash at the H-tail quarter chord for the documentation: a wing-only lattice at the same alpha,
    # so the tail's own bound vortices do not pollute the sample points
    xt = -X_TAIL_LE + 0.25 * H_CHORD
    tail_pts = np.array([[xt, y, Z_HTAIL] for y in np.linspace(0.05, H_SPAN / 2 - 0.02, 8)])
    wing_only = asb.Airplane(name="wing", xyz_ref=ap.xyz_ref, s_ref=S_REF, c_ref=CHORD, b_ref=SPAN, wings=[ap.wings[0]])
    vw = asb.VortexLatticeMethod(airplane=wing_only, op_point=op, spanwise_resolution=SPAN_RES, chordwise_resolution=CHORD_RES); vw.run()
    vt = np.asarray(vw.get_velocity_at_points(tail_pts))
    vinf = np.asarray(vw.steady_freestream_velocity).ravel()
    eps = np.degrees(np.arctan2(vt[:, 2], vt[:, 0])) - np.degrees(np.arctan2(vinf[2], vinf[0]))   # local flow angle minus free stream (deg)
    pan = panels(vlm)
    Pc = to_cad(P)
    keep = slice(0, N_STEPS, THIN)
    lines = []
    for k in range(len(P)):
        pts = Pc[k, keep]; sp = S[k, keep]
        lines.append({"seed_cad": [round(float(c), 4) for c in Pc[k, 0]],
                      "xyz": [round(float(c), 3) for c in pts.ravel()], "s": [round(float(c), 3) for c in sp]})
    doc = {"generated": time.strftime("%Y-%m-%d %H:%M"), "tool": f"AeroSandbox {asb.__version__} VortexLatticeMethod (PyPI, checked 2026-10-21)",
           "script": "analysis/aero/flowfield_3d.py",
           "model": "wing + H-tail + twin fins from asb_model.airplane(); pod ignored by the VLM; no control-surface deflection; inviscid potential flow (no separation)",
           "condition": {"V_mps": V_INF, "alpha_deg": ALPHA, "alpha_source": "aero_results.json trim_cruise.alpha_deg (AVL trim at cruise CL)",
                         "CL_vlm": float(res["CL"]), "CDi_vlm": float(res["CD"]), "Cm_vlm": float(res["Cm"])},
           "frame": "CAD / review viewer frame: X forward from the wing leading edge, Y up, Z right (starboard), metres",
           "lattice": {"spanwise_per_side": SPAN_RES, "chordwise": CHORD_RES, "vortex_core_radius_m": CORE},
           "streamlines_note": f"RK4 along the unit velocity direction, step {STEP} m, {N_STEPS} steps, every {THIN}th point kept; "
                               "xyz is a flat list [X0,Y0,Z0, X1,Y1,Z1, ...]; s is |V|/Vinf at each kept point",
           "downwash_at_htail": {"x_cad": -xt, "epsilon_deg_mean": float(np.mean(eps)), "epsilon_deg_by_y": [round(float(e), 3) for e in eps],
                                 "y_stations_m": [round(float(y), 3) for y in tail_pts[:, 1]],
                                 "note": "wing-only lattice: local flow-angle change at the H-tail quarter chord relative to the free stream (negative = downwash)"},
           "panels": {"note": "quads as flat [Xfl,Yfl,Zfl, Xbl,Ybl,Zbl, Xbr,Ybr,Zbr, Xfr,Yfr,Zfr] (front-left, back-left, back-right, front-right); gamma = bound vortex strength (m^2/s)",
                      **pan},
           "streamlines": lines}
    out = VIZ / "flow3d.json"
    out.write_text(json.dumps(doc, separators=(",", ":")))
    plot(Pc, S, pan, res)
    summ = {k: v for k, v in doc.items() if k not in ("streamlines", "panels")}
    summ["n_streamlines"] = len(lines); summ["panels_per_surface"] = {k: v["n"] for k, v in pan.items()}
    summ["speed_ratio_range"] = [float(S.min()), float(S.max())]
    dump_json(OUT / "flow3d_summary.json", summ)
    print(f"  downwash at tail: mean {np.mean(eps):.2f} deg  (by y: {np.round(eps, 2)})")
    print(f"wrote {out} ({out.stat().st_size/1e3:.0f} KB), {len(lines)} lines; panels {summ['panels_per_surface']}; {time.time()-t0:.0f} s")

if __name__ == "__main__":
    main()
