"""2-D flow fields around the NACA 2415 section (SU2 8.5.0 incompressible RANS, SA) for the flow-visualisation page.

Same solver set-up as su2_2d.py (INC_RANS, FDS + MUSCL, Venkatakrishnan limiter, adaptive CFL, SA fully turbulent,
chord 1 in the mesh, Re from common.CONDITIONS["cruise"]) but with the volume solution written as CSV so the whole
field can be resampled.  The cases live in out/su2_flow/<case>/ (git-ignored) so su2_2d.py's matrix is untouched.

Angles 0, 4, 8, 12 and 15 deg (15 deg = just past the SA CL_max on the medium mesh, su2_2d.json) on the fine mesh L3;
a case that diverges on L3 is re-run on the coarse mesh L1 and labelled.  Each converged or last-iterate field is
resampled onto a structured grid in chord units (matplotlib triangular interpolation on the solver's own mesh, so
points inside the aerofoil are masked exactly) and exported as base64 Int16 arrays for the web page.

Outputs
  out/flowviz/flow2d.json     compact fields (schema in the file header "encoding"/"grid" keys)
  plots/flow_<alpha>.png      velocity-magnitude contour + streamlines + aerofoil
  plots/flow_cp_<alpha>.png   Cp contour at one angle
Usage:  py flowfield_2d.py [--mesh 1|3] [--post] [--alphas 0,4,8,12,15]
"""
from __future__ import annotations
import sys, re, time, math, base64, csv
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from common import *
import su2_2d
from su2_2d import parse_case, RE, V, THREADS, N_JOBS, MESH_DIR

FLOW_DIR = OUT / "su2_flow"; FLOW_DIR.mkdir(exist_ok=True)
VIZ = OUT / "flowviz"; VIZ.mkdir(exist_ok=True)
ALPHAS = [0.0, 4.0, 8.0, 12.0, 15.0]
GRID = dict(nx=220, ny=128, x0=-0.6, x1=1.8, y0=-0.7, y1=0.7)   # 220 x 128 keeps flow2d.json under 1.5 MB (240 x 140 was 1.6 MB)
SCALE = dict(u=10000, v=10000, cp=1000)                        # int16 = value * scale
TOOL = "SU2 8.5.0 win64-omp (https://github.com/su2code/SU2/releases/tag/v8.5.0, checked 2026-10-21)"

# ---------------------------------------------------------------- cases
def case_name(level, alpha):
    return su2_2d.case_name(level, alpha, "SA")

def write_case(level, alpha):
    """su2_2d.write_case (SA, su2_2d.numerics for this alpha) with the volume CSV output, in out/su2_flow"""
    return su2_2d.write_case(level, alpha, "SA", **su2_2d.numerics(alpha), out_dir=FLOW_DIR, extra_output=True)

def run_cases(level, alphas):
    dirs = [write_case(level, a) for a in alphas]
    print(f"flowfield_2d: {len(dirs)} cases on L{level}, {min(N_JOBS, len(dirs))} jobs x {THREADS} threads")
    def safe(d):
        try:
            return su2_2d.run_case(d)       # retries once with CFL 0.5 if the first attempt diverges; keeps flow.csv
        except Exception as e:
            print(f"  {d.name}: failed ({e})")
            return {**su2_2d.NAN_RESULT, "dir": d.name, "error": str(e)}
    with ThreadPoolExecutor(max_workers=N_JOBS) as ex:
        res = list(ex.map(safe, dirs))
    return {a: (d, r) for a, d, r in zip(alphas, dirs, res)}

# ---------------------------------------------------------------- mesh + field reading
def read_su2_mesh(path: Path):
    """points (N,2), triangles (M,3) with quads split, airfoil outline polyline (closed, ordered)"""
    lines = path.read_text().splitlines()
    i = 0; tris = []; pts = None; wall_edges = []
    while i < len(lines):
        s = lines[i].strip()
        if s.startswith("NELEM="):
            n = int(s.split("=")[1]); i += 1
            for k in range(n):
                v = lines[i + k].split()
                t = v[0]
                if t == "5":
                    tris.append((int(v[1]), int(v[2]), int(v[3])))
                elif t == "9":
                    a, b, c, dd = (int(x) for x in v[1:5])
                    tris.append((a, b, c)); tris.append((a, c, dd))
            i += n; continue
        if s.startswith("NPOIN="):
            n = int(s.split("=")[1]); i += 1
            pts = np.array([[float(x) for x in lines[i + k].split()[:2]] for k in range(n)])
            i += n; continue
        if s.startswith("MARKER_TAG=") and s.split("=")[1].strip() == "airfoil":
            n = int(lines[i + 1].split("=")[1]); i += 2
            for k in range(n):
                v = lines[i + k].split()
                wall_edges.append((int(v[1]), int(v[2])))
            i += n; continue
        i += 1
    # chain the wall edges into one closed loop starting at the trailing edge (largest x)
    nbr = {}
    for a, b in wall_edges:
        nbr.setdefault(a, []).append(b); nbr.setdefault(b, []).append(a)
    start = max(nbr, key=lambda k: pts[k, 0])
    loop = [start]; prev = None; cur = start
    while True:
        nxt = [k for k in nbr[cur] if k != prev]
        if not nxt:
            break
        nxt = nxt[0]
        if nxt == start:
            break
        loop.append(nxt); prev, cur = cur, nxt
    # go TE -> upper surface first (positive y right after the TE), like the XFOIL ordering
    if pts[loop[1], 1] < pts[loop[-1], 1]:
        loop = [loop[0]] + loop[:0:-1]
    return pts, np.array(tris, dtype=np.int64), np.array(loop, dtype=np.int64)

def read_flow_csv(path: Path):
    with open(path) as f:
        hdr = [h.strip().strip('"') for h in f.readline().split(",")]
    data = np.loadtxt(path, delimiter=",", skiprows=1)
    col = {h: i for i, h in enumerate(hdr)}
    return hdr, data, col

_MESH_CACHE = {}
def mesh_data(level):
    if level not in _MESH_CACHE:
        _MESH_CACHE[level] = read_su2_mesh(MESH_DIR / f"naca2415_L{level}.su2")
    return _MESH_CACHE[level]

def resample(level, d: Path, g=GRID):
    """Field on the structured grid.  Returns dict with u, v, cp (masked arrays, shape (ny, nx)), mask, checks."""
    import matplotlib.tri as mtri
    pts, tris, loop = mesh_data(level)
    hdr, data, col = read_flow_csv(d / "flow.csv")
    pid = data[:, col["PointID"]].astype(int)
    x, y = data[:, col["x"]], data[:, col["y"]]
    # the CSV rows must map onto the mesh nodes (SU2 keeps the mesh numbering on one rank); check, else match by position
    order = np.argsort(pid); pid, x, y, data = pid[order], x[order], y[order], data[order]
    if len(pid) != len(pts) or np.abs(pts[pid] - np.column_stack([x, y])).max() > 1e-8:
        from scipy.spatial import cKDTree
        _, pid = cKDTree(pts).query(np.column_stack([x, y]))
    vx = data[:, col["Velocity_x"]]; vy = data[:, col["Velocity_y"]]; p = data[:, col["Pressure"]]
    # reference speed from the far field (r > 40 c): ~1 if SU2 wrote the non-dimensional solution, ~20 if dimensional
    r = np.hypot(pts[pid, 0] - 0.5, pts[pid, 1])
    far = r > 40
    vinf = float(np.median(np.hypot(vx[far], vy[far])))
    pfar = float(np.median(p[far]))
    if 0.9 < vinf < 1.1:
        cp = 2.0 * (p - pfar)            # INC_NONDIM= INITIAL_VALUES: p / (rho V^2), rho = 1 -> Cp = 2 p (su2_2d.surface_cp)
    else:
        cp = (p - pfar) / (0.5 * RHO * vinf**2)
    u = vx / vinf; v = vy / vinf
    # node arrays in mesh order
    U = np.full(len(pts), np.nan); Vv = np.full(len(pts), np.nan); P = np.full(len(pts), np.nan)
    U[pid] = u; Vv[pid] = v; P[pid] = cp
    # stagnation-point check: largest Cp on the wall nodes
    cp_wall = P[loop]
    i_st = int(np.nanargmax(cp_wall))
    checks = {"V_ref_in_file": vinf, "p_far_in_file": pfar, "Cp_stag_max": float(cp_wall[i_st]),
              "stag_x": float(pts[loop[i_st], 0]), "stag_y": float(pts[loop[i_st], 1])}
    tri = mtri.Triangulation(pts[:, 0], pts[:, 1], tris)
    xs = np.linspace(g["x0"], g["x1"], g["nx"]); ys = np.linspace(g["y0"], g["y1"], g["ny"])
    X, Y = np.meshgrid(xs, ys)                      # shape (ny, nx): row j = y, column i = x
    finder = tri.get_trifinder()
    out = {}
    for name, arr in (("u", U), ("v", Vv), ("cp", P)):
        interp = mtri.LinearTriInterpolator(tri, arr, trifinder=finder)
        out[name] = interp(X, Y)                  # masked where the point is in no triangle (inside the aerofoil)
    mask = np.ma.getmaskarray(out["u"]) | np.ma.getmaskarray(out["v"]) | np.ma.getmaskarray(out["cp"])
    out["mask"] = mask; out["X"] = X; out["Y"] = Y; out["xs"] = xs; out["ys"] = ys
    out["outline"] = pts[loop]; out["checks"] = checks
    out["_tri"] = tri; out["_P"] = P                 # for the Cp figure: contours on the solver mesh itself (exact wall)
    out["_U"] = U; out["_V"] = Vv                    # node velocities / Vinf in mesh order, for the separation estimate
    # wall Cp along the outline for the page (TE -> upper -> LE -> lower)
    out["cp_wall"] = cp_wall
    return out

# ---------------------------------------------------------------- export
def b64_int16(a: np.ndarray, scale: float, mask):
    q = np.where(mask, 0.0, np.ma.filled(a, 0.0)) * scale
    q = np.clip(np.rint(q), -32767, 32767).astype("<i2")
    return base64.b64encode(q.tobytes()).decode("ascii")

def b64_uint8(a: np.ndarray):
    return base64.b64encode(np.asarray(a, dtype=np.uint8).tobytes()).decode("ascii")

def plot_field(f, alpha, r, level, tag):
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Polygon
    X, Y = f["X"], f["Y"]
    speed = np.ma.sqrt(f["u"]**2 + f["v"]**2)
    fig, ax = plt.subplots(figsize=(11, 6.4), dpi=150)
    ax.set_facecolor("#222")                        # cells touching the wall are masked: show them in the aerofoil colour
    cf = ax.pcolormesh(X, Y, np.ma.filled(speed, 0.0), cmap="viridis", vmin=0, vmax=1.8, shading="gouraud")
    from scipy.ndimage import binary_dilation
    m2 = binary_dilation(f["mask"], iterations=2)   # streamplot seeds short stubs in cells touching the mask: widen it by two cells
    uu = np.ma.masked_where(m2, np.ma.filled(f["u"], 0.0)); vv = np.ma.masked_where(m2, np.ma.filled(f["v"], 0.0))
    ax.streamplot(f["xs"], f["ys"], uu, vv, density=2.0, color="w", linewidth=0.6, arrowsize=0.8)
    ax.add_patch(Polygon(f["outline"], closed=True, facecolor="#222", edgecolor="k", lw=0.8, zorder=5))
    cb = fig.colorbar(cf, ax=ax, pad=0.015); cb.set_label("|V| / V∞")
    ax.set_xlim(X.min(), X.max()); ax.set_ylim(Y.min(), Y.max()); ax.set_aspect("equal")
    ax.set_xlabel("x / c"); ax.set_ylabel("y / c")
    conv = "converged (steady forces)" if r["converged"] else "NOT steady: last iterate shown"
    ax.set_title(f"NACA 2415, α = {alpha:g}°, Re = {RE:.2e}, SU2 INC_RANS SA, mesh L{level} — CL {r['CL']:.3f}  CD {r['CD']:.4f}  ({conv})", fontsize=10)
    fig.tight_layout(); fig.savefig(PLOTS / f"flow_{tag}.png"); plt.close(fig)

def plot_cp(f, alpha, r, level, tag):
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Polygon
    X, Y = f["X"], f["Y"]
    fig, ax = plt.subplots(figsize=(11, 6.4), dpi=150)
    from matplotlib.colors import TwoSlopeNorm
    levels = np.concatenate([np.linspace(-2.6, 0.0, 27), np.linspace(0.1, 1.0, 10)])
    Pn = np.clip(np.nan_to_num(f["_P"], nan=0.0), -2.6, 1.0)
    cf = ax.tricontourf(f["_tri"], Pn, levels=levels, cmap="RdBu_r", norm=TwoSlopeNorm(0.0, -2.6, 1.0), extend="min")
    ax.tricontour(f["_tri"], Pn, levels=np.arange(-2.5, 1.01, 0.25), colors="k", linewidths=0.3, alpha=0.6)
    ax.add_patch(Polygon(f["outline"], closed=True, facecolor="#222", edgecolor="k", lw=0.8, zorder=5))
    c = f["checks"]
    ax.plot(c["stag_x"], c["stag_y"], "o", ms=5, mfc="yellow", mec="k", zorder=6, label=f"stagnation point, Cp = {c['Cp_stag_max']:.2f}")
    cb = fig.colorbar(cf, ax=ax, pad=0.015); cb.set_label("Cp = (p − p∞) / (½ ρ V∞²)")
    ax.set_xlim(-0.3, 1.3); ax.set_ylim(-0.45, 0.45); ax.set_aspect("equal")
    ax.set_xlabel("x / c"); ax.set_ylabel("y / c"); ax.legend(loc="lower right", fontsize=8)
    ax.set_title(f"NACA 2415 pressure coefficient, α = {alpha:g}°, Re = {RE:.2e}, SU2 INC_RANS SA, mesh L{level} — CL {r['CL']:.3f}", fontsize=10)
    fig.tight_layout(); fig.savefig(PLOTS / f"flow_cp_{tag}.png"); plt.close(fig)

def separation_point(f):
    """x/c on the upper surface where the near-wall tangential velocity first reverses (sign of u along the outline
    direction at ~0.5 % c off the wall); None if attached to the TE.  Estimate from the interpolated field."""
    import matplotlib.tri as mtri
    o = f["outline"]
    n = len(o); i_le = int(np.argmin(o[:, 0]))
    up = o[: i_le + 1]                        # TE -> LE along the upper surface
    t = np.gradient(up, axis=0); t /= np.linalg.norm(t, axis=1)[:, None]
    nrm = np.column_stack([t[:, 1], -t[:, 0]])   # outward normal: to the right of the TE->LE direction of travel on the upper surface
    probe = up + 0.005 * nrm
    tri = f["_tri"]                           # resample()'s triangulation and node mapping
    uu = mtri.LinearTriInterpolator(tri, f["_U"])(probe[:, 0], probe[:, 1])
    vv = mtri.LinearTriInterpolator(tri, f["_V"])(probe[:, 0], probe[:, 1])
    # flow direction along the surface: from LE to TE is -t (t points TE -> LE)
    s = -(np.ma.filled(uu, 0) * t[:, 0] + np.ma.filled(vv, 0) * t[:, 1])
    rev = np.where((s < 0) & (up[:, 0] > 0.02) & (up[:, 0] < 0.995))[0]
    if len(rev) == 0:
        return None
    return float(np.min(up[rev, 0]))     # most upstream reversed-flow point on the upper surface (estimate)

def post(cases, level_by_alpha):
    mesh_info = json.loads((OUT / "mesh_2d.json").read_text()) if (OUT / "mesh_2d.json").exists() else {}
    g = GRID
    doc = {
        "generated": time.strftime("%Y-%m-%d %H:%M"),
        "tool": TOOL, "script": "analysis/aero/flowfield_2d.py",
        "solver": "INC_RANS, FDS + MUSCL (Venkatakrishnan), implicit Euler, adaptive CFL; SA fully turbulent; steady solver",
        "section": "NACA 2415, chord 1 in the mesh", "Re": RE, "V_mps": V, "Mach": CONDITIONS["cruise"]["M"],
        "frame": "x along the chord from the LE (0) to the TE (1), y normal to the chord (up), chord units. The free stream "
                 "comes in at angle alpha above the +x axis, i.e. (u, v) -> (cos a, sin a) far away; the aerofoil is fixed.",
        "grid": {"nx": g["nx"], "ny": g["ny"], "x0": g["x0"], "x1": g["x1"], "y0": g["y0"], "y1": g["y1"],
                 "x_of_i": "x0 + i * (x1 - x0) / (nx - 1)", "y_of_j": "y0 + j * (y1 - y0) / (ny - 1)",
                 "order": "row-major, y outer, x inner: element k = j * nx + i (j = y index, i = x index)"},
        "encoding": {"u": f"base64 little-endian Int16, u/Vinf = value / {SCALE['u']}",
                     "v": f"base64 little-endian Int16, v/Vinf = value / {SCALE['v']}",
                     "cp": f"base64 little-endian Int16, Cp = value / {SCALE['cp']}; Cp = (p - p_inf) / (0.5 rho Vinf^2) = 2 p in SU2's INC_NONDIM INITIAL_VALUES units",
                     "mask": "base64 Uint8, 1 = inside the aerofoil or no data (u, v, cp stored as 0 there), 0 = fluid",
                     "cp_wall": "Cp at each outline node, same order as outline"},
        "outline_order": "closed polyline of the mesh wall nodes: TE -> upper surface -> LE -> lower surface -> (back to TE)",
        "outline": None, "angles": []}
    outlines = {}
    for alpha in sorted(cases):
        d, r = cases[alpha]; level = level_by_alpha[alpha]
        if not (d / "flow.csv").exists() or not r["usable"]:
            print(f"  alpha {alpha:g}: no usable field ({d.name}: {r.get('reason')})"); continue
        t0 = time.time()
        f = resample(level, d)
        x_sep = separation_point(f)
        tag = f"{alpha:g}"
        plot_field(f, alpha, r, level, tag)
        if alpha == 8.0:
            plot_cp(f, alpha, r, level, tag)
        outline = [[round(float(x), 5), round(float(y), 5)] for x, y in f["outline"]]
        if doc["outline"] is None or level == 3:
            doc["outline"] = outline          # top level: the L3 wall (review/src/flowviz.js reads F2.outline)
        outlines[alpha] = outline
        entry = {"alpha": alpha, "mesh": f"L{level}", "cells": mesh_info.get(f"L{level}", {}).get("cells"), "case_dir": f"out/su2_flow/{d.name}",
                 "converged": bool(r["converged"]),
                 "field_note": "steady converged solution" if r["converged"] else "force history not steady (stalled/oscillating): last iterate of the steady solver",
                 "CL": r["CL"], "CD": r["CD"], "CM": r["CM"], "iters": r["iters"], "CL_std_last300": r["CL_std_last300"], "CD_std_last300": r["CD_std_last300"],
                 "wall_s": r["wall_s"], "Cp_stag_max": f["checks"]["Cp_stag_max"], "stag_xy": [f["checks"]["stag_x"], f["checks"]["stag_y"]],
                 "Cp_min_wall": float(np.nanmin(f["cp_wall"])), "x_sep_upper_est": x_sep,
                 "nx": g["nx"], "ny": g["ny"], "x0": g["x0"], "x1": g["x1"], "y0": g["y0"], "y1": g["y1"],
                 "u_scale": SCALE["u"], "v_scale": SCALE["v"], "cp_scale": SCALE["cp"],
                 "u": b64_int16(f["u"], SCALE["u"], f["mask"]), "v": b64_int16(f["v"], SCALE["v"], f["mask"]),
                 "cp": b64_int16(f["cp"], SCALE["cp"], f["mask"]), "mask": b64_uint8(f["mask"]),
                 "cp_wall": [round(float(c), 4) for c in f["cp_wall"]]}
        doc["angles"].append(entry)
        print(f"  alpha {alpha:g} L{level}: CL {r['CL']:.4f} CD {r['CD']:.5f} conv {r['converged']} | Vref {f['checks']['V_ref_in_file']:.4f} "
              f"Cp_stag {f['checks']['Cp_stag_max']:.3f} Cp_min {np.nanmin(f['cp_wall']):.2f} x_sep {x_sep} | {time.time()-t0:.0f} s")
    # mixed mesh levels (an angle re-run on L1): each angle carries its own wall outline (cp_wall follows it)
    if len({e["mesh"] for e in doc["angles"]}) > 1:
        for e in doc["angles"]:
            e["outline"] = outlines[e["alpha"]]
        doc["outline_note"] = "angles use different mesh levels: angles[i].outline is the wall of that angle's mesh; top-level outline is L3"
    out = VIZ / "flow2d.json"
    out.write_text(json.dumps(doc, separators=(",", ":")))
    print(f"wrote {out} ({out.stat().st_size/1e6:.2f} MB), {len(doc['angles'])} angles")
    return doc

def main():
    args = sys.argv[1:]
    level = 3
    if "--mesh" in args: level = int(args[args.index("--mesh") + 1])
    alphas = ALPHAS
    if "--alphas" in args: alphas = [float(a) for a in args[args.index("--alphas") + 1].split(",")]
    t0 = time.time()
    cases = {}; level_by_alpha = {}
    if "--post" in args:
        for a in alphas:
            for L in (level, 1):
                d = FLOW_DIR / case_name(L, a)
                if (d / "flow.csv").exists():
                    su2_2d.backfill_key(d)      # record the cache key of the case.cfg that produced it (no solve)
                    r = parse_case(d)
                    if r["usable"]:
                        cases[a] = (d, r); level_by_alpha[a] = L; break
    else:
        res = run_cases(level, alphas)
        for a, (d, r) in res.items():
            cases[a] = (d, r); level_by_alpha[a] = level
        bad = [a for a, (d, r) in res.items() if not r["usable"] or not (d / "flow.csv").exists()]
        if bad and level != 1:
            print(f"  diverged on L{level}: {bad} -> re-running on L1")
            res1 = run_cases(1, bad)
            for a, (d, r) in res1.items():
                cases[a] = (d, r); level_by_alpha[a] = 1
    post(cases, level_by_alpha)
    print(f"flowfield_2d total {(time.time()-t0)/60:.1f} min")

if __name__ == "__main__":
    main()
