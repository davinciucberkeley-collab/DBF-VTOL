"""SU2 8.5.0 2-D incompressible RANS of the NACA 2415 section at the cruise Reynolds number.

Solver: INC_RANS (pressure-based, FDS, implicit Euler), turbulence SA (fully turbulent, Spalart-Allmaras) and,
as a transition-sensitivity set, SST with the Langtry-Menter LM model.  Chord = 1 in the mesh; the Reynolds number
is set through the constant viscosity MU = rho V c / Re with rho 1.225, V 20 m/s (common.CONDITIONS["cruise"]).
Angle of attack: the free-stream velocity vector is rotated (INC_VELOCITY_INIT) and AOA is set so SU2 reports
lift/drag in wind axes.

Study matrix (see MATRIX below):
  mesh study : L1, L2, L3 at alpha 2 and 10 deg (SA)        -> GCI (Roache 1994 / Celik et al. 2008)
  alpha sweep: L2, SA,  alpha -4 .. 20 deg                  -> lift curve, drag polar, CL_max
  transition : L2, SST-LM, alpha 0 .. 16                    -> effect of laminar-turbulent transition
Runs are executed in parallel (N_JOBS concurrent SU2 processes x THREADS OpenMP threads each).
Outputs: out/su2/<case>/history.csv, surface_flow.csv; out/su2_2d.json (forces, convergence, timings).
Usage: py su2_2d.py [--quick] [--parse-only]
  --quick: mesh study + reduced sweep, for smoke testing
  --parse-only: re-read the existing out/su2/<case> outputs and rebuild out/su2_2d.json without running SU2
Cache: done.txt stores a hash of the case.cfg that produced history.csv and the source-mesh size/mtime; a case is
re-run only when either changed.
"""
from __future__ import annotations
import os, sys, re, time, subprocess, csv, math, shutil, hashlib
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from common import *

SU2_DIR = OUT / "su2"; SU2_DIR.mkdir(exist_ok=True)
MESH_DIR = HERE / "mesh"
NCPU = os.cpu_count() or 4
THREADS = 4
N_JOBS = max(1, NCPU // THREADS)
RE = CONDITIONS["cruise"]["Re"]
V = CONDITIONS["cruise"]["V"]
MU_C = RHO * V * 1.0 / RE     # chord 1 in the mesh

CFG = """% SU2 8.5.0 incompressible RANS, NACA 2415, chord 1, Re {Re:.0f} (analysis/aero/su2_2d.py)
SOLVER= INC_RANS
KIND_TURB_MODEL= {turb}
{trans}
MATH_PROBLEM= DIRECT
RESTART_SOL= NO
INC_DENSITY_MODEL= CONSTANT
INC_DENSITY_INIT= {rho}
INC_VELOCITY_INIT= ( {vx:.6f}, {vy:.6f}, 0.0 )
INC_NONDIM= INITIAL_VALUES
VISCOSITY_MODEL= CONSTANT_VISCOSITY
MU_CONSTANT= {mu:.8e}
FREESTREAM_TURBULENCEINTENSITY= {ti}
FREESTREAM_TURB2LAMVISCRATIO= {tlr}
AOA= {alpha}
REF_ORIGIN_MOMENT_X= 0.25
REF_ORIGIN_MOMENT_Y= 0.0
REF_ORIGIN_MOMENT_Z= 0.0
REF_LENGTH= 1.0
REF_AREA= 1.0
MARKER_HEATFLUX= ( airfoil, 0.0 )
MARKER_FAR= ( farfield )
MARKER_PLOTTING= ( airfoil )
MARKER_MONITORING= ( airfoil )
NUM_METHOD_GRAD= WEIGHTED_LEAST_SQUARES
CFL_NUMBER= {cfl}
CFL_ADAPT= YES
CFL_ADAPT_PARAM= ( 0.5, 1.2, 1.0, {cflmax} )
ITER= {iters}
LINEAR_SOLVER= FGMRES
LINEAR_SOLVER_PREC= LU_SGS
LINEAR_SOLVER_ERROR= 1E-5
LINEAR_SOLVER_ITER= 10
CONV_NUM_METHOD_FLOW= FDS
MUSCL_FLOW= YES
SLOPE_LIMITER_FLOW= VENKATAKRISHNAN
VENKAT_LIMITER_COEFF= 0.05
LIMITER_ITER= {limfreeze}
TIME_DISCRE_FLOW= EULER_IMPLICIT
CONV_NUM_METHOD_TURB= SCALAR_UPWIND
MUSCL_TURB= NO
TIME_DISCRE_TURB= EULER_IMPLICIT
CONV_FIELD= ( RMS_PRESSURE, LIFT, DRAG )
CONV_RESIDUAL_MINVAL= -9
CONV_STARTITER= 200
CONV_CAUCHY_ELEMS= 200
CONV_CAUCHY_EPS= 2E-6
MESH_FILENAME= {mesh}
MESH_FORMAT= SU2
TABULAR_FORMAT= CSV
CONV_FILENAME= history
SURFACE_FILENAME= surface_flow
OUTPUT_FILES= ( SURFACE_CSV )
OUTPUT_WRT_FREQ= 100000
HISTORY_OUTPUT= ( ITER, RMS_RES, AERO_COEFF, CAUCHY, LINSOL )
SCREEN_OUTPUT= ( INNER_ITER, RMS_PRESSURE, RMS_VELOCITY-X, LIFT, DRAG, CAUCHY_DRAG )
SCREEN_WRT_FREQ_INNER= 100
WRT_RESTART_OVERWRITE= YES
"""

def case_name(level, alpha, model):
    return f"L{level}_{model}_a{alpha:+05.1f}".replace("+", "p").replace("-", "m")

# volume solution as CSV (flowfield_2d.py): SU2 8.5 writes the "CSV" entry of OUTPUT_FILES as the ASCII restart (PointID, x, y,
# Pressure, Velocity_x, Velocity_y, Nu_Tilde) under RESTART_FILENAME; named flow.csv so run_case's restart* clean-up leaves it
OUTPUT_LINE = "OUTPUT_FILES= ( SURFACE_CSV )"
OUTPUT_LINE_VOLUME = "OUTPUT_FILES= ( SURFACE_CSV, CSV )\nRESTART_FILENAME= flow"

def case_cfg(level, alpha, model, iters=4000, cfl=2.0, cflmax=50.0, limfreeze=300, extra_output=False):
    """case.cfg text of one case (first-attempt numerics)"""
    a = math.radians(alpha)
    if model == "SA":
        turb, trans, ti, tlr = "SA", "", 0.001, 10.0
    elif model == "SSTLM":
        turb, trans, ti, tlr = "SST", "KIND_TRANS_MODEL= LM", 0.0007, 1.0   # Ncrit 9 ~ Tu 0.07 % (Mack 1977: N = -8.43 - 2.4 ln Tu)
    else:
        raise ValueError(model)
    mesh = MESH_DIR / f"naca2415_L{level}.su2"
    cfg = CFG.format(Re=RE, turb=turb, trans=trans, rho=RHO, vx=V * math.cos(a), vy=V * math.sin(a), mu=MU_C,
                     ti=ti, tlr=tlr, alpha=alpha, cfl=cfl, cflmax=cflmax, iters=iters, mesh=mesh.name, limfreeze=limfreeze)
    if extra_output:
        new = cfg.replace(OUTPUT_LINE, OUTPUT_LINE_VOLUME)
        assert new != cfg, f"'{OUTPUT_LINE}' not found in CFG: the volume CSV would not be written"
        cfg = new
    return cfg

SAFE = dict(cfl=0.5, cflmax=10.0, limfreeze=1500)   # retry settings if a case diverges

def retry_cfg(cfg: str) -> str:
    """the same case with the safer numerics (SAFE, 8000 iterations); idempotent"""
    cfg = re.sub(r"CFL_NUMBER= [0-9.]+", f"CFL_NUMBER= {SAFE['cfl']}", cfg)
    cfg = re.sub(r"CFL_ADAPT_PARAM= \(.*\)", f"CFL_ADAPT_PARAM= ( 0.5, 1.1, 0.1, {SAFE['cflmax']} )", cfg)
    # the limiter freeze only ever moves later (an L2 case that never freezes it keeps that; see numerics)
    cfg = re.sub(r"LIMITER_ITER= (\d+)", lambda m: f"LIMITER_ITER= {max(int(m.group(1)), SAFE['limfreeze'])}", cfg)
    cfg = re.sub(r"(?m)^ITER= \d+", "ITER= 8000", cfg)   # only the main count, never LINEAR_SOLVER_ITER / LIMITER_ITER / CONV_STARTITER
    return cfg

def write_case(level, alpha, model, iters=4000, cfl=2.0, cflmax=50.0, limfreeze=300, out_dir=None, extra_output=False):
    d = (out_dir or SU2_DIR) / case_name(level, alpha, model); d.mkdir(parents=True, exist_ok=True)
    mesh = MESH_DIR / f"naca2415_L{level}.su2"
    if not mesh.exists():
        raise FileNotFoundError(f"{mesh} missing: run mesh_2d.py {level}")
    cfg = case_cfg(level, alpha, model, iters, cfl, cflmax, limfreeze, extra_output)
    f = d / "case.cfg"
    old = f.read_text() if f.exists() else None
    # an existing case.cfg that is this config or its safe-numerics retry is kept, so it stays the config that produced
    # history.csv (run_case's cache key); any other change overwrites it, which invalidates the cache and re-runs the case
    if old not in (cfg, retry_cfg(cfg)):
        f.write_text(cfg)
    return d

# ---------------------------------------------------------------- cache key (done.txt)
def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]

def _mesh_sig(cfg: str) -> str:
    """source mesh (mesh/<name>) name:size:mtime; the per-case copy is deleted after each run"""
    name = re.search(r"MESH_FILENAME= (\S+)", cfg).group(1)
    m = MESH_DIR / name
    return f"{name}:{m.stat().st_size}:{int(m.stat().st_mtime)}" if m.exists() else f"{name}:missing"

def cache_key(cfg: str) -> dict:
    return {"cfg_sha": _sha(cfg), "mesh": _mesh_sig(cfg)}

def read_done(d: Path) -> dict:
    f = d / "done.txt"
    if not f.exists():
        return {}
    return dict(tok.split("=", 1) for tok in f.read_text().split() if "=" in tok)

def write_done(d: Path, done: dict):
    (d / "done.txt").write_text(" ".join(f"{k}={v}" for k, v in done.items()) + "\n")

def backfill_key(d: Path) -> dict:
    """done.txt written before the cache key existed: record the key of the case.cfg on disk if that file is evidently the
    one that produced history.csv (attempt 2 <=> retry numerics in the file, iterations <= its ITER), never re-run"""
    done = read_done(d)
    if "cfg_sha" in done or not (d / "history.csv").exists() or not (d / "case.cfg").exists() or "attempt" not in done:
        return done
    cfg = (d / "case.cfg").read_text()
    is_retry = retry_cfg(cfg) == cfg
    n_iter = len(read_history(d / "history.csv")[1])
    max_iter = int(re.search(r"(?m)^ITER= (\d+)", cfg).group(1))
    if is_retry == (done["attempt"] == "2") and n_iter <= max_iter:
        done.update(cache_key(cfg)); write_done(d, done)
        print(f"  {d.name}: cache key backfilled from the case.cfg on disk")
    else:
        print(f"  {d.name}: case.cfg does not match the history (attempt {done['attempt']}, retry cfg {is_retry}, {n_iter} > {max_iter} it?): not backfilled")
    return done

def run_case(d: Path, threads=THREADS, force=False):
    """run (or reuse) one case.  Reused only when done.txt carries the key of the case.cfg on disk and the source mesh.
    An unusable first attempt is retried once with the SAFE numerics; the config that ran stays on disk as case.cfg."""
    cfg0 = (d / "case.cfg").read_text()
    plans = [cfg0]
    if (d / "history.csv").exists() and not force:
        done = backfill_key(d)
        if done.get("cfg_sha") == _sha(cfg0) and done.get("mesh") == _mesh_sig(cfg0):
            r = parse_case(d)
            if (done.get("rc") == "0" and r["usable"]) or retry_cfg(cfg0) == cfg0:
                return r          # usable, or the safe-numerics retry already ran: a re-run would reproduce it
            plans = []            # first attempt is on disk and unusable: go straight to the retry
    if retry_cfg(cfg0) != cfg0:
        plans.append(retry_cfg(cfg0))
    for cfg in plans:
        attempt = 2 if retry_cfg(cfg) == cfg else 1
        (d / "case.cfg").write_text(cfg)
        mesh = MESH_DIR / re.search(r"MESH_FILENAME= (\S+)", cfg).group(1)
        if not (d / mesh.name).exists():
            shutil.copy(mesh, d / mesh.name)
        t0 = time.time()
        with open(d / ("su2.log" if attempt == 1 else "su2_retry.log"), "w") as log:
            p = subprocess.run([str(SU2_CFD), "-t", str(threads), "case.cfg"], cwd=str(d), stdout=log, stderr=subprocess.STDOUT, text=True)
        wall = time.time() - t0
        write_done(d, {"rc": p.returncode, "wall_s": f"{wall:.1f}", "attempt": attempt, **cache_key(cfg)})
        for f in d.glob("*.su2"):
            f.unlink()          # mesh copy, keep the folder small
        for f in d.glob("restart*"):
            f.unlink()
        r = parse_case(d)
        if p.returncode == 0 and r["usable"]:
            break
        print(f"  {d.name}: unusable on attempt {attempt} ({r['reason']})" + (", retrying with CFL 0.5" if attempt == 1 and cfg is not plans[-1] else ""))
    print(f"  {d.name}: CL {r['CL']:.4f} CD {r['CD']:.5f} CM {r['CM']:.4f}  iters {r['iters']}  conv {r['converged']}  usable {r['usable']}  {wall:.0f} s")
    return r

# ---------------------------------------------------------------- parsing
NAN_RESULT = {"CL": float("nan"), "CD": float("nan"), "CM": float("nan"), "CL_final": float("nan"), "CD_final": float("nan"),
              "CL_std_last300": None, "CD_std_last300": None, "rmsP_final": None, "rmsP_drop": None, "iters": 0, "converged": False,
              "usable": False, "reason": "no history", "wall_s": None}
CL_PHYS_MAX = 2.5     # |CL| above this is not a physical 2-D value for a 15 % section (the review applies the same limit)

def _num(v: str) -> float:
    """tolerant float: MSVC writes NaN/Inf as '-nan(ind)', 'nan(ind)', '-1.#IND', 'inf'; anything unreadable -> NaN"""
    try:
        return float(v)
    except ValueError:
        return float("nan")

def read_history(path: Path):
    """SU2 history.csv -> (header list, float array rows x columns); unreadable values become NaN"""
    with open(path) as f:
        rows = list(csv.reader(f))
    if not rows:
        return [], np.empty((0, 0))
    hdr = [h.strip().strip('"') for h in rows[0]]
    data = np.array([[_num(v) for v in r] for r in rows[1:] if len(r) == len(hdr)], dtype=float)
    return hdr, data.reshape(-1, len(hdr))

def parse_case(d: Path):
    # a crashed run can leave no history, or only a header: report it as not usable (the caller retries it)
    hist = d / "history.csv"
    if not hist.exists():
        return {**NAN_RESULT, "dir": d.name}
    hdr, data = read_history(hist)
    if len(data) < 2:
        return {**NAN_RESULT, "dir": d.name, "reason": "history has fewer than 2 rows"}
    col = {h: i for i, h in enumerate(hdr)}
    cl, cd, cm = data[:, col["CL"]], data[:, col["CD"]], data[:, col["CMz"]]
    rp = data[:, col["rms[P]"]]
    n = len(cl); tail = slice(max(0, n - 300), n)
    done = read_done(d)
    wall = float(done["wall_s"]) if "wall_s" in done else None
    # converged = force history steady over the last 300 iterations (std CL < 2e-3, std CD < 2e-4).  It says nothing about
    # the residual: a diverged run can also sit still.  The residual-drop and physical-range checks are the `usable` flag.
    cl_std, cd_std = float(cl[tail].std()), float(cd[tail].std())
    steady = cl_std < 2e-3 and cd_std < 2e-4
    CL, CD, CM = float(cl[tail].mean()), float(cd[tail].mean()), float(cm[tail].mean())
    drop = float(rp[0] - rp[-1])
    if not all(math.isfinite(x) for x in (CL, CD, CM)):
        reason = "non-finite forces"
    elif not math.isfinite(drop) or drop <= 0:
        reason = f"pressure residual did not drop (log10 rms[P] {rp[0]:.2f} -> {rp[-1]:.2f})"
    elif CD <= 0:
        reason = f"CD {CD:.4g} <= 0"
    elif abs(CL) > CL_PHYS_MAX:
        reason = f"|CL| {abs(CL):.4g} > {CL_PHYS_MAX}"
    else:
        reason = None
    return {"CL": CL, "CD": CD, "CM": CM,
            "CL_final": float(cl[-1]), "CD_final": float(cd[-1]),
            "CL_std_last300": cl_std, "CD_std_last300": cd_std, "rmsP_final": float(rp[-1]), "rmsP_drop": drop,
            "iters": int(n), "converged": bool(steady) and reason is None, "usable": reason is None, "reason": reason,
            "wall_s": wall, "dir": d.name}

def surface_cp(d: Path):
    f = d / "surface_flow.csv"
    if not f.exists():
        return None
    hdr, data = read_history(f)
    ix, iy = hdr.index("x"), hdr.index("y")
    if "Pressure_Coefficient" in hdr:
        cp = data[:, hdr.index("Pressure_Coefficient")]
    elif "Pressure" in hdr:
        # INC_NONDIM= INITIAL_VALUES: gauge pressure scaled by rho V^2 (freestream 0), so Cp = p / (0.5) = 2 p;
        # check: the stagnation point reads 0.50, i.e. Cp = 1.0
        cp = 2.0 * data[:, hdr.index("Pressure")]
    else:
        return None
    icf = hdr.index("Skin_Friction_Coefficient_x") if "Skin_Friction_Coefficient_x" in hdr else None
    out = {"x": data[:, ix].tolist(), "y": data[:, iy].tolist(), "Cp": cp.tolist()}
    if icf is not None:
        out["Cfx"] = data[:, icf].tolist()
    return out

def gci(f1, f2, f3, r=math.sqrt(2.0), Fs=1.25):
    """Celik et al., J. Fluids Eng. 130 (2008) 078001: f1 fine, f2 medium, f3 coarse, constant ratio r."""
    e32, e21 = f3 - f2, f2 - f1
    if abs(e21) < 1e-12 or abs(e32) < 1e-12 or e32 / e21 <= 0:
        return {"p": None, "GCI_fine_pct": None, "f_ext": None, "note": "oscillatory or converged to round-off; GCI undefined"}
    p = abs(math.log(abs(e32 / e21))) / math.log(r)
    f_ext = (r**p * f1 - f2) / (r**p - 1)
    ea = abs((f1 - f2) / f1) if f1 else float("nan")
    return {"p": p, "GCI_fine_pct": 100 * Fs * ea / (r**p - 1), "f_ext": f_ext, "e21_pct": 100 * ea}

def _clean(o):
    """non-finite floats -> None (NaN/Inf are not valid JSON)"""
    if isinstance(o, float):
        return o if math.isfinite(o) else None
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    return o

# ---------------------------------------------------------------- study
def matrix(quick=False):
    """(level, alpha, model, numerics) of every case"""
    sweep = [0, 2, 8, 14] if quick else [-4, -2, 0, 2, 4, 6, 8, 10, 12, 13, 14, 15, 16, 17, 18, 20]
    m = [(L, a, "SA") for L in (1, 2, 3) for a in (2.0, 10.0)]
    m += [(2, float(a), "SA") for a in sweep if (2, float(a), "SA") not in m]
    m += [(2, float(a), "SSTLM") for a in ([2, 10] if quick else [0, 2, 4, 6, 8, 10, 12, 14, 16])]
    return [(L, a, mod, numerics(a, L)) for L, a, mod in m]

L2_NUMERICS = dict(iters=6000, cfl=1.0, cflmax=20.0, limfreeze=999999)

def numerics(alpha, level=None):
    """first-attempt numerics: CFL 2 adaptive to 50, limiter frozen after 300 it; gentler for alpha >= 13 deg.
    Medium mesh L2 (every alpha, SA and SST-LM): CFL 1 adaptive to 20 and the limiter never frozen (999999 = the SU2
    default).  In the run at Re 3.60e5 (2026-10-21/22) 13 of the 25 L2 cases ended unusable, and in almost every L2
    attempt the pressure residual started to grow 100-600 iterations after the limiter freeze (iteration 300, 800 or
    1500 on the CFL-0.5 retry; out/su2/L2_*/su2*.log), while L1 and L3 converged with the same settings.  Changed
    2026-10-25."""
    if level == 2:
        return dict(L2_NUMERICS)
    high = alpha >= 13
    return dict(iters=6000 if high else 4000, cfl=1.0 if high else 2.0, cflmax=20.0 if high else 50.0, limfreeze=800 if high else 300)

def assemble(parsed: dict, wall_s_total, extra=None):
    """parsed: case name -> parse_case result for every case of the matrix.  Unusable cases are kept out of the polars,
    the mesh study and the Cp output and listed with the reason under unusable_cases."""
    usable = {k: r for k, r in parsed.items() if r["usable"]}
    unusable = {k: _clean(r) for k, r in parsed.items() if not r["usable"]}
    if unusable:
        print(f"  {len(unusable)} cases without a usable result: " + "; ".join(f"{k} ({r['reason']})" for k, r in unusable.items()))
    res = {"tool": "SU2 8.5.0 win64-omp (https://github.com/su2code/SU2/releases/tag/v8.5.0, checked 2026-10-21)",
           "solver": "INC_RANS, FDS + MUSCL, implicit Euler; SA fully turbulent; SST + Langtry-Menter LM transition",
           "Re": RE, "V_mps": V, "mu_model": MU_C, "threads_per_case": THREADS, "jobs": N_JOBS,
           "usable_rule": f"usable = finite forces, log10 rms[P] lower at the end than at the start, CD > 0, |CL| <= {CL_PHYS_MAX}; "
                          "converged = usable and force history steady over the last 300 iterations (std CL < 2e-3, std CD < 2e-4)",
           "cases": usable, "failed_cases": list(unusable), "unusable_cases": unusable}
    mesh_info = json.loads((OUT / "mesh_2d.json").read_text()) if (OUT / "mesh_2d.json").exists() else {}
    res["mesh_study"] = {}
    for a in (2.0, 10.0):
        ran = {L: parsed.get(case_name(L, a, "SA")) for L in (1, 2, 3)}
        ok = {L: (r if r and r["usable"] else None) for L, r in ran.items()}
        if not any(ok.values()):
            continue
        excluded = {f"L{L}": (ran[L]["reason"] if ran[L] else "not run") for L in (1, 2, 3) if not ok[L]}
        val = lambda L, k: ok[L][k] if ok[L] else None
        if all(ok.values()):
            g_cl, g_cd = gci(ok[3]["CL"], ok[2]["CL"], ok[1]["CL"]), gci(ok[3]["CD"], ok[2]["CD"], ok[1]["CD"])
        else:
            g_cl = g_cd = {"p": None, "GCI_fine_pct": None, "f_ext": None,
                           "note": "GCI needs all three meshes usable; excluded: " + ", ".join(excluded)}
        res["mesh_study"][f"alpha_{a:g}"] = {
            "cells": {f"L{L}": mesh_info.get(f"L{L}", {}).get("cells") for L in (1, 2, 3)},
            "CL": {f"L{L}": val(L, "CL") for L in (1, 2, 3)}, "CD": {f"L{L}": val(L, "CD") for L in (1, 2, 3)},
            "converged": {f"L{L}": val(L, "converged") for L in (1, 2, 3)}, "excluded": excluded,
            "GCI_CL": g_cl, "GCI_CD": g_cd,
            "pct_change_CL_L2_L3": 100 * (ok[3]["CL"] - ok[2]["CL"]) / ok[3]["CL"] if ok[2] and ok[3] else None,
            "pct_change_CD_L2_L3": 100 * (ok[3]["CD"] - ok[2]["CD"]) / ok[3]["CD"] if ok[2] and ok[3] else None,
            "pct_change_CL_L1_L3": 100 * (ok[3]["CL"] - ok[1]["CL"]) / ok[3]["CL"] if ok[1] and ok[3] else None,
            "pct_change_CD_L1_L3": 100 * (ok[3]["CD"] - ok[1]["CD"]) / ok[3]["CD"] if ok[1] and ok[3] else None}
    for m in ("SA", "SSTLM"):
        pol = sorted((float(k.split("_a")[1].replace("p", "+").replace("m", "-")), r) for k, r in usable.items() if k.startswith(f"L2_{m}_"))
        res[f"polar_L2_{m}"] = [{"alpha_deg": a, "CL": r["CL"], "CD": r["CD"], "CM": r["CM"], "converged": r["converged"],
                                 "CL_std": r["CL_std_last300"]} for a, r in pol]
    res["cp"] = {}
    for L, m, a in [(2, "SA", 2.0), (2, "SA", 8.0), (2, "SA", 12.0), (2, "SSTLM", 2.0), (3, "SA", 2.0), (3, "SA", 10.0)]:
        name = case_name(L, a, m)
        if name in usable:
            cp = surface_cp(SU2_DIR / name)
            if cp: res["cp"][f"L{L}_{m}_a{a:g}"] = cp
    res["wall_s_total"] = wall_s_total
    res.update(extra or {})
    dump_json(OUT / "su2_2d.json", res)
    return res

def main():
    quick = "--quick" in sys.argv
    t0 = time.time()
    cases = matrix(quick)
    if "--parse-only" in sys.argv:
        # re-read the existing case outputs, no solver run and no case.cfg rewrite
        parsed = {}
        for L, a, m, _ in cases:
            d = SU2_DIR / case_name(L, a, m)
            if (d / "history.csv").exists():
                backfill_key(d)
                parsed[d.name] = parse_case(d)
            else:
                parsed[d.name] = {**NAN_RESULT, "dir": d.name}
        old = json.loads((OUT / "su2_2d.json").read_text()) if (OUT / "su2_2d.json").exists() else {}
        assemble(parsed, old.get("wall_s_total"), {"parsed_only": time.strftime("%Y-%m-%d %H:%M"),
                                                   "wall_s_total_note": "solver wall time of the last full run (su2_2d.py without --parse-only)"})
        print(f"SU2 2-D: re-parsed {len(parsed)} cases")
        return
    dirs = [write_case(L, a, m, **num) for L, a, m, num in cases]
    print(f"SU2 2-D: {len(dirs)} cases, {N_JOBS} jobs x {THREADS} threads on {NCPU} CPUs")
    def safe_run(d):   # one broken case must never stop the batch
        try:
            return run_case(d)
        except Exception as e:
            print(f"  {d.name}: failed ({e})")
            return {**NAN_RESULT, "dir": d.name, "reason": f"error: {e}"}
    with ThreadPoolExecutor(max_workers=N_JOBS) as ex:
        parsed = {d.name: r for d, r in zip(dirs, ex.map(safe_run, dirs))}
    res = assemble(parsed, time.time() - t0)
    print(f"SU2 2-D total {res['wall_s_total']/60:.1f} min")

if __name__ == "__main__":
    main()
