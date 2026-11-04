"""Shared geometry, flight conditions and tool paths for the C0 aerodynamic data package.

Every geometric number is read from analysis/results.json (sizing output) or cad/params.txt
(SolidWorks build parameters derived from results.json by cad/params.mjs).  Nothing is typed in here
except the atmosphere (ISA sea level) and the tool locations.  params.txt is read, and the NACA section
and pod profile are implemented, in ONE place: analysis/geom.py (re-exported here, so `from common import *`
gives naca4 and pod_radius).
"""
from __future__ import annotations
import json, os, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / "analysis"))
import geom
from geom import read_params, pod_radius, naca4_outline, naca4_code, TE_CAD, TE_AERO
OUT = HERE / "out"; OUT.mkdir(exist_ok=True)
PLOTS = HERE / "plots"; PLOTS.mkdir(exist_ok=True)

# ---------- tools (outside the repo, C:\Users\dillo\tools) ----------
TOOLS = Path(os.environ.get("AERO_TOOLS", r"C:\Users\dillo\tools"))
XFOIL = TOOLS / "xfoil" / "xfoil.exe"          # XFOIL 6.99, https://web.mit.edu/drela/Public/web/xfoil/XFOIL6.99.zip (checked 2026-10-21)
AVL = TOOLS / "avl" / "avl352.exe"             # AVL 3.52,   https://web.mit.edu/drela/Public/web/avl/avl352.exe      (checked 2026-10-21)
SU2_CFD = TOOLS / "su2" / "bin" / "bin" / "SU2_CFD.exe"  # SU2 8.5.0 win64-omp, https://github.com/su2code/SU2/releases/download/v8.5.0/SU2-v8.5.0-win64-omp.zip (checked 2026-10-21)

# ---------- repo inputs ----------
RESULTS = json.loads((REPO / "analysis" / "results.json").read_text())
C0 = RESULTS["concepts"]["C0"]
BASE = RESULTS["base"]
SIZED = C0["sized"]
GEO = C0["geo"]
CG = C0["cg"]

PARAMS = geom.PARAMS                                   # cad/params.txt scalars (geom.read_params: the one reader)

def _design_version() -> str:
    """design version from the first line of docs/DESIGN-BASIS.md ('# Design basis ... (v0.4.0, 2026-10-21)')"""
    f = REPO / "docs" / "DESIGN-BASIS.md"
    if not f.exists():
        return "—"
    m = re.search(r"\((v\d+\.\d+(?:\.\d+)?)", f.read_text(encoding="utf-8").splitlines()[0])
    return m.group(1) if m else "—"
DESIGN_VERSION = _design_version()

# ---------- atmosphere (ISA sea level) ----------
RHO = BASE["rho"]                 # 1.225 kg/m^3  (results.json base.rho)
MU = 1.789e-5                     # Pa s, ISA sea level 15 C (Anderson, Fundamentals of Aerodynamics, App. A / ISA)
A_SOUND = 340.3                   # m/s, ISA sea level
NU = MU / RHO

# ---------- aircraft ----------
SPAN = BASE["span"]               # m   (results.json base.span)
CHORD = SIZED["chord"]            # m   (results.json concepts.C0.sized.chord)
S_REF = SIZED["S"]                # m^2 (results.json concepts.C0.sized.S)
AR = SIZED["AR"]
MTOW = SIZED["m"]                 # kg  (results.json concepts.C0.sized.m)
W = SIZED["W"]                    # N
G = 9.80665
V_STALL_REQ = 12.0               # R11 limit, m/s (docs/DESIGN-BASIS.md); stall Re and trim are evaluated here
V_STALL_DESIGN = BASE["Vs"]      # the sizing's design stall target (11.75 m/s: R11 less a 4 % CL_max margin, docs/research/stall-margin.md)
V_CRUISE = BASE["Vc"]             # 20 m/s (R11 midpoint)
V_TRANS = 16.0                    # m/s, AIRSPEED_MIN per DESIGN-BASIS.md R11
CL_MAX_SIZING = BASE["CLmax"]     # sizing CL_max (results.json base.CLmax)
CD0_CLEAN_SIZING = BASE["CD0_clean"]
CDA_BOOM_SIZING = BASE["CdA_boom"]
CDA_ROTOR_SIZING = C0["params"]["CdA_rotor"]
E_SIZING = BASE["e"]
CD0_TOTAL_SIZING = SIZED["CD0"]
CL_CRUISE_SIZING = SIZED["CL"]
LD_SIZING = SIZED["LD"]

# tail (results.json geo; CAD adds one boom OD to the stabiliser span)
H_SPAN = GEO["hSpan"]; H_CHORD = GEO["hC"]; S_H = GEO["Sh"]
V_H = GEO["vH"]; V_C = GEO["vC"]; S_V = GEO["Sv"]
L_H = GEO["lh"]
X_TAIL_LE = GEO["xRear"] - GEO["D"] / 2 - 0.05       # sizing.mjs: lh_tailLE (x fwd from wing LE, so negative = aft)
X_FRONT_ROTOR = GEO["xFront"]; X_REAR_ROTOR = GEO["xRear"]; Y_BOOM = GEO["yIn"]
D_LIFT_PROP = GEO["D"]
X_CG = GEO["xLEtoCG"]                                  # target CG, m (x fwd from wing LE, so negative = aft)
CG_FRAC = -X_CG / CHORD                                # target CG as a fraction of MAC aft of the LE
X_CG_NO_PAYLOAD = CG["cgNoPayload"]
NP_SIZING_FRAC = GEO["hn"]
Z_BOOM = PARAMS["yB"]                                  # boom axis height vs the wing LE datum, m (CAD Y up)
# H-tail mid-plane height: cad/params.mjs places comp H_Tail at yStabMid = (yStabBot + yStabTop) / 2 (= params.txt comp=H_Tail Y)
Z_HTAIL = 0.5 * (PARAMS["yStabBot"] + PARAMS["yStabTop"])

# pod: body of revolution, profile constants from params.txt podProfile (analysis/geometry.mjs POD); radius: geom.pod_radius(s)
POD_L = geom.POD_L; POD_R = geom.POD_R; POD_TAIL_R = geom.POD_TAIL_R; POD_NOSE_X = geom.POD_NOSE_X
CANOPY_L, CANOPY_R = 0.26, 0.055                       # cad/BuildVtol.cs Canopy()
BOOM_OD = PARAMS["boomOD"]; BOOM_SEGS = [PARAMS["segF"], PARAMS["segR"]]
MOTOR_D = PARAMS["motorD"]; MOTOR_H = PARAMS["motorH"]
PROP_W = PARAMS["propW"]; PROP_T = PARAMS["propT"]
LEG_OD = PARAMS["legOD"]; LEG_LEN = PARAMS["legLen"]
PITOT_D = PARAMS["pitotD"]; PITOT_L = PARAMS["pitotL"]
T_C_WING = PARAMS["tc"]
H_TAIL_T = PARAMS["tailT"]

def reynolds(V: float, L: float) -> float:
    return RHO * V * L / MU

def mach(V: float) -> float:
    return V / A_SOUND

CONDITIONS = {
    "stall": {"V": V_STALL_REQ, "Re": reynolds(V_STALL_REQ, CHORD), "M": mach(V_STALL_REQ)},
    "transition": {"V": V_TRANS, "Re": reynolds(V_TRANS, CHORD), "M": mach(V_TRANS)},
    "cruise": {"V": V_CRUISE, "Re": reynolds(V_CRUISE, CHORD), "M": mach(V_CRUISE)},
}
TAIL_CONDITIONS = {
    "stall": {"V": V_STALL_REQ, "Re": reynolds(V_STALL_REQ, H_CHORD)},
    "cruise": {"V": V_CRUISE, "Re": reynolds(V_CRUISE, H_CHORD)},
}

def naca4(code: str, n: int = 160, closed_te: bool = True):
    """NACA 4-digit coordinates, cosine spaced (n points per surface), TE->upper->LE->lower->TE (XFOIL order).
    Implementation: analysis/geom.py naca4_outline.  closed_te selects the TE coefficient: True = TE_AERO (-0.1036,
    closed, the aero package's section), False = TE_CAD (-0.1015, open, the CAD section) - see analysis/geometry.mjs."""
    m, p, t = naca4_code(code)
    return naca4_outline(m, p, t, n, TE_AERO if closed_te else TE_CAD)

def dump_json(path: Path, obj):
    def rnd(o):
        if isinstance(o, float):
            return float(f"{o:.6g}")
        if isinstance(o, dict):
            return {k: rnd(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)):
            return [rnd(v) for v in o]
        return o
    path.write_text(json.dumps(rnd(obj), indent=1))

if __name__ == "__main__":
    print(f"chord {CHORD:.4f} m  span {SPAN} m  S {S_REF:.4f} m2  AR {AR:.3f}  MTOW {MTOW:.3f} kg  W/S {W/S_REF:.1f} N/m2")
    for k, v in CONDITIONS.items():
        print(f"{k:11s} V={v['V']:5.1f} m/s  Re={v['Re']:.3e}  M={v['M']:.3f}")
    for k, v in TAIL_CONDITIONS.items():
        print(f"tail {k:6s} V={v['V']:5.1f} m/s  Re={v['Re']:.3e}")
    print("tail LE x", X_TAIL_LE, "CG x", X_CG, "NP sizing", NP_SIZING_FRAC)
    print("tools:", XFOIL.exists(), AVL.exists(), SU2_CFD.exists())
