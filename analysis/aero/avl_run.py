"""AVL 3.52 whole-aircraft vortex-lattice model of C0 (wing + H-tail + twin fins + pod body).

Geometry from analysis/results.json / cad/params.txt via common.py.  AVL frame: X aft, Y right, Z up; the repo
frame has x forward from the wing LE, so X_avl = -x.  Profile drag enters through per-section CDCL polars taken
from the XFOIL results (wing: NACA 2415 at cruise Re; tail: NACA 0009 at tail cruise Re), so AVL's CDtot is
induced + section-profile drag of the lifting surfaces only; pod, booms, rotors and gear come from drag_buildup.py.

Runs:
  sweep : alpha -4..14 deg, controls zero       -> CL(alpha), CD, Cm, span loading, e
  trim  : CL = cruise CL with elevator trimming Cm = 0 -> alpha_trim, elevator, full derivative set (ST)
  np    : neutral point X_np from the ST output
Outputs: out/avl/*.txt (raw AVL output), out/avl_results.json
"""
from __future__ import annotations
import subprocess, time, re, sys
import numpy as np
from common import *

AVL_DIR = OUT / "avl"; AVL_DIR.mkdir(exist_ok=True)
X_REF = -X_CG            # CG target (CG_FRAC of the MAC aft of the LE)
Z_REF = 0.0              # CG height not in results.json; wing chord line assumed (EST, affects Cm_alpha weakly)

def cdcl_from_polar(path: Path, cl_pts):
    """three (CL, CD) pairs for AVL's CDCL from a merged XFOIL polar file"""
    a = np.loadtxt(path)
    # restrict to the attached branch (rows in alpha order up to CL_max), then sort by CL for the interpolation
    b = a[: int(np.argmax(a[:, 1])) + 1]
    b = b[np.argsort(b[:, 1])]
    out = []
    for c in cl_pts:
        c = float(np.clip(c, b[:, 1].min(), b[:, 1].max()))
        out.append((c, float(np.interp(c, b[:, 1], b[:, 2]))))
    return out

def pod_body_file(path: Path):
    """body of revolution (geom.pod_radius: elliptic nose, parallel mid-body, smooth-step boat-tail to tailR, the
    profile of cad/BuildVtol.cs Fuselage()); written as an AVL BFILE (x from nose, radius), 41 stations."""
    xs = np.linspace(0, POD_L, 41)
    rs = np.array([pod_radius(s) for s in xs])
    # AVL body file: like an airfoil file, upper surface nose->tail then lower surface tail->nose
    lines = ["C0 pod"]
    for x, r in zip(xs[::-1], rs[::-1]): lines.append(f"{x:.5f} {r:.5f}")
    for x, r in zip(xs[1:], rs[1:]): lines.append(f"{x:.5f} {-r:.5f}")
    path.write_text("\n".join(lines) + "\n")

def write_avl(path: Path, with_pod=True):
    wing_cdcl = cdcl_from_polar(OUT / "xfoil_n2415_cruise_ncrit9.txt", (-0.3, 0.4, 1.1))
    tail_polar = OUT / "xfoil_n0009_tail_cruise_ncrit9.txt"
    if not tail_polar.exists(): tail_polar = OUT / "xfoil_n0009_tail_stall_ncrit9.txt"
    tail_cdcl = cdcl_from_polar(tail_polar, (-0.5, 0.0, 0.5))
    cd = lambda p: " ".join(f"{c:.4f} {d:.5f}" for c, d in p)
    c = CHORD; b2 = SPAN / 2
    y_ail = POD_R + 0.45 * (b2 - POD_R)       # aileron starts at 45 % of the panel (cad/BuildVtol.cs Aileron: outer 55 %)
    xt = -X_TAIL_LE; zt = Z_HTAIL              # H_Tail mid-plane, cad/params.txt (common.Z_HTAIL)
    zfin0 = Z_BOOM + BOOM_OD / 2               # fin root on the boom top
    # Rudder SgnDup = -1: on the Y-duplicated twin fin AVL mirrors the hinge vector, so SgnDup +1 deflects the two
    # rudders in opposite senses (toe-in: CL/Cm from the rudder, Cn_dr = 0).  -1 gives both trailing edges the same
    # way (verified by the result: non-zero Cnd03, CLd03 = Cmd03 = 0 in st_*.txt).
    s = f"""C0 lift+cruise VTOL (analysis/aero/avl_run.py from results.json, {DESIGN_VERSION})
0.0                      | Mach
0 0 0.0                  | iYsym iZsym Zsym
{S_REF:.5f} {c:.5f} {SPAN:.4f}   | Sref Cref Bref
{X_REF:.5f} 0.0 {Z_REF:.4f}     | Xref Yref Zref (CG, {100*CG_FRAC:.0f} % MAC)
0.0                      | CDp of non-lifting parts: added in drag_buildup.py, not here
#
SURFACE
Wing
16 1.0  30 -1.3          | Nchord Cspace Nspan Sspace (cosine chordwise, tip-clustered spanwise)
YDUPLICATE
0.0
ANGLE
0.0
CDCL
{cd(wing_cdcl)}
SECTION
0.0 0.0 0.0 {c:.5f} 0.0  12 1.0
NACA
2415
SECTION
0.0 {POD_R:.4f} 0.0 {c:.5f} 0.0  6 1.0
NACA
2415
SECTION
0.0 {y_ail:.4f} 0.0 {c:.5f} 0.0  14 1.0
NACA
2415
CONTROL
aileron 1.0 0.74 0 0 0 -1.0
SECTION
0.0 {b2:.4f} 0.0 {c:.5f} 0.0
NACA
2415
CONTROL
aileron 1.0 0.74 0 0 0 -1.0
#
SURFACE
Htail
10 1.0  16 -1.3
YDUPLICATE
0.0
CDCL
{cd(tail_cdcl)}
SECTION
{xt:.5f} 0.0 {zt:.4f} {H_CHORD:.5f} 0.0
NACA
0009
CONTROL
elevator 1.0 0.70 0 0 0 1.0
SECTION
{xt:.5f} {H_SPAN/2:.4f} {zt:.4f} {H_CHORD:.5f} 0.0
NACA
0009
CONTROL
elevator 1.0 0.70 0 0 0 1.0
#
SURFACE
Fin
8 1.0  10 1.0
YDUPLICATE
0.0
CDCL
{cd(tail_cdcl)}
SECTION
{xt:.5f} {Y_BOOM:.4f} {zfin0:.4f} {V_C:.5f} 0.0
NACA
0009
CONTROL
rudder 1.0 0.70 0 0 0 -1.0
SECTION
{xt:.5f} {Y_BOOM:.4f} {zfin0 + V_H:.4f} {V_C:.5f} 0.0
NACA
0009
CONTROL
rudder 1.0 0.70 0 0 0 -1.0
"""
    if with_pod:
        pod_body_file(AVL_DIR / "pod.dat")
        s += f"""#
BODY
Pod
24 1.0
BFILE
pod.dat
TRANSLATE
{-POD_NOSE_X:.4f} 0.0 {Z_BOOM:.4f}
"""
    path.write_text(s)

def run_avl(cmds: str, timeout=300):
    p = subprocess.run([str(AVL)], input=cmds, text=True, capture_output=True, cwd=str(AVL_DIR), timeout=timeout)
    return p.stdout

def grab(txt, key):
    # the key must not be the tail of a longer name (e.g. "e" inside "...e =", "Cla" inside "CYCla"): no word char or ' before it
    m = re.search(rf"(?<![\w']){re.escape(key)}\s*=\s*([-+0-9.Ee]+)", txt)
    return float(m.group(1)) if m else None

def parse_ft(path: Path):
    t = path.read_text()
    keys = ["Alpha", "CLtot", "CDtot", "CDind", "CDvis", "Cmtot", "Cntot", "Cltot", "e", "Xnp"]
    d = {k: grab(t, k) for k in keys}
    m = re.search(r"elevator\s*=\s*([-+0-9.Ee]+)", t); d["elevator"] = float(m.group(1)) if m else None
    return d

def parse_st(path: Path):
    t = path.read_text()
    keys = ["Alpha", "CLtot", "CDtot", "Cmtot", "CLa", "CYa", "Cla", "Cma", "Cna", "CLb", "CYb", "Clb", "Cmb", "Cnb",
            "CLp", "CLq", "CLr", "Clp", "Clq", "Clr", "Cmp", "Cmq", "Cmr", "Cnp", "Cnq", "Cnr", "Xnp",
            # control derivatives: AVL 3.52 prints them as d01 (aileron), d02 (elevator), d03 (rudder)
            "CLd01", "CLd02", "CLd03", "Cmd01", "Cmd02", "Cmd03", "Cld01", "Cnd01", "CYd03", "Cld03", "Cnd03", "e"]
    d = {k: grab(t, k) for k in keys}
    m = re.search(r"Clb Cnr / Clr Cnb\s*=\s*([-+0-9.Ee]+)", t); d["spiral_param"] = float(m.group(1)) if m else None
    m = re.search(r"elevator\s*=\s*([-+0-9.Ee]+)", t); d["elevator"] = float(m.group(1)) if m else None
    return d

def parse_fs(path: Path):
    """strip forces: returns per-surface list of (y, chord, cl, cl_norm)"""
    t = path.read_text()
    surfs = {}
    cur = None
    for line in t.splitlines():
        m = re.match(r"\s*Surface #\s*(\d+)\s+(\S+)", line)
        if m: cur = m.group(2) + "_" + m.group(1); surfs[cur] = []; continue
        if cur and re.match(r"\s*\d+\s+[-+0-9.]", line):
            v = line.split()
            try:   # AVL 3.52 columns: j Xle Yle Zle Chord Area c_cl ai cl_norm cl cd cdv cm_c/4 cm_LE C.P.x/c
                j, xle, yle, zle, chord, area, c_cl, ai, cl_norm, cl, cd, cdv = [float(x) for x in v[:12]]
                surfs[cur].append({"y": yle, "chord": chord, "cl": cl, "c_cl": c_cl, "cd": cd, "ai": ai})
            except ValueError:
                pass
    return surfs

def main():
    t0 = time.time()
    for f in AVL_DIR.glob("*.txt"): f.unlink()
    res = {"tool": "AVL 3.52 (MIT, https://web.mit.edu/drela/Public/web/avl/avl352.exe, checked 2026-10-21)",
           "Xref_m_aft_of_LE": X_REF, "Zref": Z_REF, "note_Zref": "CG height not in results.json; 0 assumed (EST)"}
    for tag, with_pod in (("pod", True), ("nopod", False)):
        avl_file = AVL_DIR / f"c0_{tag}.avl"; write_avl(avl_file, with_pod)
        # alpha sweep
        alphas = [-4, -2, 0, 2, 4, 6, 8, 10, 12, 14]
        cmd = f"PLOP\nG\n\nLOAD {avl_file.name}\nOPER\n"
        for a in alphas:
            cmd += f"a a {a}\nx\nft\nft_{tag}_a{a}.txt\n"
            if a in (2, 4): cmd += f"fs\nfs_{tag}_a{a}.txt\nst\nst_{tag}_a{a}.txt\n"
        # trim at cruise CL with elevator, then derivatives
        cmd += f"a c {CL_CRUISE_SIZING:.4f}\nd2 pm 0\nx\nst\nst_{tag}_trim.txt\nft\nft_{tag}_trim.txt\nfs\nfs_{tag}_trim.txt\n"
        # elevator held zero at cruise CL (untrimmed Cm)
        cmd += f"d2 d2 0\nx\nft\nft_{tag}_cruiseCL_e0.txt\n"
        # stall-speed CL (CL at 12 m/s) trimmed, for the elevator-to-trim check
        cl_stall = W / (0.5 * RHO * V_STALL_REQ**2 * S_REF)
        cmd += f"a c {cl_stall:.4f}\nd2 pm 0\nx\nst\nst_{tag}_Vstall.txt\nft\nft_{tag}_Vstall.txt\n"
        cmd += "\nQUIT\n"
        log = run_avl(cmd)
        (AVL_DIR / f"avl_{tag}.log").write_text(log)
        sweep = []
        for a in alphas:
            f = AVL_DIR / f"ft_{tag}_a{a}.txt"
            if f.exists(): sweep.append(parse_ft(f))
        trim = parse_st(AVL_DIR / f"st_{tag}_trim.txt")
        trim_ft = parse_ft(AVL_DIR / f"ft_{tag}_trim.txt")
        st2 = parse_st(AVL_DIR / f"st_{tag}_a2.txt")
        vs = parse_st(AVL_DIR / f"st_{tag}_Vstall.txt")
        e0 = parse_ft(AVL_DIR / f"ft_{tag}_cruiseCL_e0.txt")
        A = np.array([[s["Alpha"], s["CLtot"], s["Cmtot"]] for s in sweep])
        lin = (A[:, 0] >= -2) & (A[:, 0] <= 8)
        cla = np.polyfit(np.radians(A[lin, 0]), A[lin, 1], 1)
        cma = np.polyfit(np.radians(A[lin, 0]), A[lin, 2], 1)
        xnp = trim["Xnp"]
        res[tag] = {
            "sweep": sweep, "CL_alpha_per_rad_fit": float(cla[0]), "alpha_0L_deg": float(np.degrees(-cla[1] / cla[0])),
            "Cm_alpha_per_rad_fit": float(cma[0]), "Cm0": float(cma[1]),
            "trim_cruise": {"alpha_deg": trim["Alpha"], "elevator_deg": trim["elevator"], "CL": trim["CLtot"], "CD_lifting_surfaces": trim["CDtot"],
                            "CDind": trim_ft["CDind"], "CDvis_sections": trim_ft["CDvis"], "e_AVL": trim_ft["e"]},
            "cruise_CL_elevator0": {"Cm": e0["Cmtot"], "alpha_deg": e0["Alpha"]},
            "trim_Vstall": {"CL": vs["CLtot"], "alpha_deg": vs["Alpha"], "elevator_deg": vs["elevator"]},
            "derivatives_trim": {k: trim[k] for k in trim if k not in ("Alpha", "CLtot", "CDtot", "Cmtot", "elevator")},
            "Xnp_m_aft_LE": xnp, "NP_pct_MAC": 100 * xnp / CHORD,
            "static_margin_pct_CG28": 100 * (xnp / CHORD - CG_FRAC),
            "static_margin_pct_CG_noPayload": 100 * (xnp / CHORD - (-X_CG_NO_PAYLOAD / CHORD)),
            "span_loading_a2": parse_fs(AVL_DIR / f"fs_{tag}_a2.txt"), "span_loading_trim": parse_fs(AVL_DIR / f"fs_{tag}_trim.txt"),
            "e_sweep": {str(s["Alpha"]): s["e"] for s in sweep},
        }
        print(f"  {tag:6s}: CLa {cla[0]:.3f}/rad  Cma {cma[0]:.3f}/rad  Xnp {xnp:.4f} m = {100*xnp/CHORD:.1f} % MAC  SM({100*CG_FRAC:.0f}%) {100*(xnp/CHORD-CG_FRAC):.1f} %  "
              f"trim a {trim['Alpha']:.2f} deg, elev {trim['elevator']:.2f} deg, e {trim_ft['e']:.3f}  Cnb {trim['Cnb']:.4f} Clb {trim['Clb']:.4f}")
    res["wall_s"] = time.time() - t0
    dump_json(OUT / "avl_results.json", res)
    print(f"AVL total {res['wall_s']:.1f} s")

if __name__ == "__main__":
    main()
