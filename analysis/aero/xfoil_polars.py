"""XFOIL 6.99 polars for the wing section (NACA 2415) and tail section (NACA 0009).

Runs XFOIL non-interactively (commands on stdin).  Cases:
  NACA 2415  Re = stall / transition / cruise (common.CONDITIONS), Ncrit 9 (smooth, XFOIL default e^9)
  NACA 2415  Re = cruise, Ncrit 5  (sensitivity: taped XPS skin, outdoor turbulence; Drela's xfoil_doc.txt
             lists Ncrit 4-8 for "dirty wind tunnel" and 9 for "average wind tunnel")
  NACA 0009  Re = tail stall / cruise, Ncrit 9
Outputs: out/xfoil_<case>.txt (raw polar), out/xfoil_polars.json, out/xfoil_cp_cruise_a<alpha>.txt (Cp at cruise).
"""
from __future__ import annotations
import subprocess, sys, time, re
import numpy as np
from common import *

def run_xfoil(commands: str, cwd: Path, timeout=300) -> str:
    """XFOIL can loop forever on a low-Re separation-bubble case; on timeout the process is killed and the
    points already written to the polar save file are kept (the file is appended point by point)."""
    try:
        p = subprocess.run([str(XFOIL)], input=commands, text=True, capture_output=True, cwd=str(cwd), timeout=timeout)
        return p.stdout
    except subprocess.TimeoutExpired as e:
        print(f"  (XFOIL timed out after {timeout} s; keeping the converged points so far)")
        so = e.stdout.decode(errors="replace") if isinstance(e.stdout, bytes) else (e.stdout or "")
        return so + "\n*** TIMEOUT ***\n"

def parse_polar(path: Path):
    rows = []
    if not path.exists():
        return np.zeros((0, 7))
    started = False
    for line in path.read_text().splitlines():
        if re.match(r"\s*-+\s+-+", line):
            started = True; continue
        if not started: continue
        parts = line.split()
        if len(parts) >= 7:
            try:
                rows.append([float(v) for v in parts[:7]])
            except ValueError:
                pass
    arr = np.array(rows) if rows else np.zeros((0, 7))
    # columns: alpha CL CD CDp CM Top_Xtr Bot_Xtr
    if len(arr):
        arr = arr[np.argsort(arr[:, 0])]
        _, idx = np.unique(arr[:, 0], return_index=True); arr = arr[idx]
    return arr

FORCE = "--force" in sys.argv

def polar(foil: str, Re: float, M: float, ncrit: float, tag: str, amin=-8.0, amax=22.0, da=0.5, cp_alphas=()):
    out = OUT / f"xfoil_{tag}.txt"; outp = OUT / f"xfoil_{tag}_pos.txt"; outn = OUT / f"xfoil_{tag}_neg.txt"
    key = OUT / f"xfoil_{tag}.key"; want = f"Re={Re:.0f} M={M:.4f} ncrit={ncrit}"   # cache is valid only for the same flow condition
    if out.exists() and not FORCE and key.exists() and key.read_text().strip() == want:
        arr = np.loadtxt(out); print(f"  {tag}: cached ({len(arr)} points, {want})"); return arr
    for f in (out, outp, outn):
        if f.exists(): f.unlink()
    pre = f"PLOP\nG\n\nNACA {foil}\nPPAR\nN 240\n\n\n"
    oper = f"OPER\nVISC {Re:.0f}\nMACH {M:.4f}\nITER 200\nVPAR\nN {ncrit}\n\n"
    # two sweeps from alpha=0 so the post-stall side does not poison the pre-stall side
    # positive and negative sweeps are separate XFOIL processes so a hang on one side keeps the other
    NL = "\n"
    cmd_pos = pre + oper + f"PACC{NL}{outp.name}{NL}{NL}ASEQ 0 {amax} {da}{NL}PACC{NL}"
    for a in cp_alphas:
        cmd_pos += f"INIT{NL}ALFA {a}{NL}CPWR xfoil_cp_{tag}_a{a:g}.txt{NL}"
    cmd_pos += NL + "QUIT" + NL
    cmd_neg = pre + oper + f"PACC{NL}{outn.name}{NL}{NL}ASEQ 0 {amin} {-da}{NL}PACC{NL}{NL}QUIT{NL}"
    t0 = time.time()
    log = run_xfoil(cmd_pos, OUT) + NL + NL + "===== negative sweep =====" + NL + run_xfoil(cmd_neg, OUT)
    (OUT / f"xfoil_{tag}.log").write_text(log)
    arr = np.vstack([parse_polar(outp), parse_polar(outn)])
    if len(arr):
        arr = arr[np.argsort(arr[:, 0])]; _, idx = np.unique(arr[:, 0], return_index=True); arr = arr[idx]
    hdr = "# XFOIL 6.99 merged +/- sweeps: alpha CL CD CDp Cm xtr_top xtr_bot\n"
    out.write_text(hdr + "\n".join(" ".join(f"{v:10.5f}" for v in r) for r in arr) + "\n")
    key.write_text(want + "\n")
    print(f"  {tag}: {len(arr)} converged points in {time.time()-t0:.1f} s, "
          f"CLmax {arr[:,1].max():.3f} at a={arr[np.argmax(arr[:,1]),0]:.1f}" if len(arr) else f"  {tag}: no points")
    return arr

def summarize(arr, label):
    a, cl, cd, cdp, cm = arr[:, 0], arr[:, 1], arr[:, 2], arr[:, 3], arr[:, 4]
    i = np.argmax(cl)
    lin = (a >= -2) & (a <= 6)
    slope, icpt = np.polyfit(np.radians(a[lin]), cl[lin], 1)
    ld = cl / cd
    j = np.argmax(ld)
    return {
        "label": label, "n_points": int(len(a)),
        "CL_max": float(cl[i]), "alpha_CLmax_deg": float(a[i]),
        "CL_alpha_per_rad": float(slope), "alpha_0L_deg": float(np.degrees(-icpt / slope)),
        "Cm_c4_mean_linear": float(cm[lin].mean()),
        "Cd_min": float(cd.min()), "alpha_Cdmin_deg": float(a[np.argmin(cd)]),
        "LD_max_2D": float(ld[j]), "alpha_LDmax_deg": float(a[j]), "CL_at_LDmax": float(cl[j]),
        "table": [[float(v) for v in row] for row in arr],
        "columns": ["alpha_deg", "CL", "CD", "CDp", "Cm", "xtr_top", "xtr_bot"],
    }

def main():
    t0 = time.time()
    res = {"tool": "XFOIL 6.99 (MIT, https://web.mit.edu/drela/Public/web/xfoil/XFOIL6.99.zip, checked 2026-10-21)",
           "panels": 240, "iter": 200, "cases": {}}
    cp_cruise = (0.0, 2.0, 4.0, 8.0, 12.0)
    for name, c in CONDITIONS.items():
        tag = f"n2415_{name}_ncrit9"
        arr = polar("2415", c["Re"], c["M"], 9, tag, cp_alphas=cp_cruise if name == "cruise" else ())
        res["cases"][tag] = {"foil": "NACA 2415", "Re": c["Re"], "Mach": c["M"], "Ncrit": 9, "V_mps": c["V"], **summarize(arr, name)}
    c = CONDITIONS["cruise"]
    arr = polar("2415", c["Re"], c["M"], 5, "n2415_cruise_ncrit5")
    res["cases"]["n2415_cruise_ncrit5"] = {"foil": "NACA 2415", "Re": c["Re"], "Mach": c["M"], "Ncrit": 5, "V_mps": c["V"], **summarize(arr, "cruise, Ncrit 5")}
    # high-Re check against Abbott & von Doenhoff (Re 3e6) for validation of the XFOIL set-up itself
    arr = polar("2415", 3.0e6, 0.1, 9, "n2415_Re3e6_ncrit9", amax=20)
    res["cases"]["n2415_Re3e6_ncrit9"] = {"foil": "NACA 2415", "Re": 3.0e6, "Mach": 0.1, "Ncrit": 9, "V_mps": None, **summarize(arr, "Re 3e6 (A&vD comparison)")}
    for name, c in TAIL_CONDITIONS.items():
        tag = f"n0009_tail_{name}_ncrit9"
        arr = polar("0009", c["Re"], mach(c["V"]), 9, tag, amin=-12, amax=12)
        res["cases"][tag] = {"foil": "NACA 0009", "Re": c["Re"], "Mach": mach(c["V"]), "Ncrit": 9, "V_mps": c["V"], **summarize(arr, f"tail {name}")}
    res["wall_s"] = time.time() - t0
    dump_json(OUT / "xfoil_polars.json", res)
    print(f"XFOIL total {res['wall_s']:.1f} s")

if __name__ == "__main__":
    main()
