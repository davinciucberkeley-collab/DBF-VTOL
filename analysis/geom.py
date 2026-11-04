"""Shared geometry for the Python side: the ONE reader of cad/params.txt and the ONE implementation of the NACA 4-digit
section and the fuselage-pod profile.  Used by analysis/aero/common.py (and through it every aero script) and by
docs/build/templates/make_templates.py.  The definitions themselves live in analysis/geometry.mjs; cad/params.mjs writes
them into cad/params.txt (keys foilWing, foilTail, foilTE, podProfile), and this module reads them back, so no geometric
constant is typed here.  The C# twin is cad/Shared.cs.

params.txt format (written by cad/params.mjs):
  key=value          scalar: a number (6 decimals) or a text record; a text record is label|name=value|name=value...
  comp=...|...       assembly placement record (one per component), xcomp=... the same in the exploded assembly
Parsing rules (identical in cad/Shared.cs ParamsFile):
  - lines are trimmed; blank lines are ignored; a line without '=' is an error (the file is generated);
  - key = text before the first '=', value = text after it (trimmed);
  - comp= and xcomp= lines are records (lists of '|' fields) and never scalars; every other key is a scalar,
    stored as float when the value parses as one, else as the value text; a repeated scalar key is an error.
"""
from __future__ import annotations
import math
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PARAMS_TXT = REPO / "cad" / "params.txt"


def read_params(path: Path = PARAMS_TXT) -> dict:
    """scalar keys of params.txt -> {key: float | str} (comp=/xcomp= records excluded; see read_records)"""
    d = {}
    for n, raw in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line:
            continue
        if "=" not in line:
            raise ValueError(f"{path}:{n}: no '=' in line {line!r}")
        k, v = line.split("=", 1)
        v = v.strip()
        if k in ("comp", "xcomp"):
            continue
        if k in d:
            raise ValueError(f"{path}:{n}: repeated key {k!r}")
        try:
            d[k] = float(v)
        except ValueError:
            d[k] = v
    return d


def read_records(kind: str, path: Path = PARAMS_TXT) -> list[list[str]]:
    """the '|' fields of every kind= line (kind 'comp' or 'xcomp'), in file order"""
    out = []
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line.startswith(kind + "="):
            out.append(line[len(kind) + 1:].split("|"))
    return out


def record(text: str) -> dict:
    """'label|a=1|b=2' -> {'': 'label', 'a': 1.0, 'b': 2.0} (fields without '=' go under '')"""
    d = {}
    for f in text.split("|"):
        if "=" in f:
            k, v = f.split("=", 1)
            try:
                d[k] = float(v)
            except ValueError:
                d[k] = v
        else:
            d[""] = f
    return d


PARAMS = read_params()
_wing = record(PARAMS["foilWing"]); _tail = record(PARAMS["foilTail"]); _te = record(PARAMS["foilTE"]); _pod = record(PARAMS["podProfile"])
WING_NAME = _wing[""]; WING_M = _wing["m"]; WING_P = _wing["p"]; WING_T = PARAMS["tc"]          # NACA 2415 at the sizing's t/c
TAIL_NAME = _tail[""]; TAIL_M = _tail["m"]; TAIL_P = _tail["p"]; TAIL_T = _tail["t"]           # NACA 0009
TE_CAD = _te["cad"]       # -0.1015 open TE: the CAD section (cad/params.mjs, BuildVtol.cs, Drawings.cs)
TE_AERO = _te["aero"]     # -0.1036 closed TE: aero package (SU2 meshes, NeuralFoil) and the hot-wire templates; see geometry.mjs
POD_L = PARAMS["fusL"]; POD_R = PARAMS["fusR"]; POD_TAIL_R = PARAMS["tailR"]
POD_NOSE_X = _pod["noseX"]; POD_NOSE_A = _pod["noseA"]; POD_PARALLEL_TO = _pod["parallelTo"]; POD_PROFILE = _pod[""]


def naca4_surfaces(m: float, p: float, t: float, n: int, a4: float):
    """NACA 4-digit section (Abbott & von Doenhoff, Theory of Wing Sections, §6.4), chord 1, cosine spaced with n points
    per surface from the LE to the TE; returns numpy arrays (xu, yu, xl, yl).  a4 is the trailing-edge coefficient of the
    thickness polynomial: TE_CAD (open) or TE_AERO (closed), never a literal.  Vectorised with numpy; the point ordering and
    arithmetic are those of the original analysis/aero/common.py naca4 (bit-identical), the per-point formula is the one
    in analysis/geometry.mjs."""
    import numpy as np
    beta = np.linspace(0, np.pi, n)
    x = 0.5 * (1 - np.cos(beta))
    yt = 5 * t * (0.2969 * np.sqrt(x) - 0.1260 * x - 0.3516 * x**2 + 0.2843 * x**3 + a4 * x**4)
    if m > 0:
        yc = np.where(x < p, m / p**2 * (2 * p * x - x**2), m / (1 - p)**2 * ((1 - 2 * p) + 2 * p * x - x**2))
        dyc = np.where(x < p, 2 * m / p**2 * (p - x), 2 * m / (1 - p)**2 * (p - x))
    else:
        yc = np.zeros_like(x); dyc = np.zeros_like(x)
    th = np.arctan(dyc)
    return x - yt * np.sin(th), yc + yt * np.cos(th), x + yt * np.sin(th), yc - yt * np.cos(th)


def naca4_outline(m: float, p: float, t: float, n: int, a4: float):
    """closed outline TE -> upper -> LE -> lower -> TE (XFOIL order), 2n-1 points, as an (N, 2) numpy array"""
    import numpy as np
    xu, yu, xl, yl = naca4_surfaces(m, p, t, n, a4)
    return np.column_stack([np.concatenate([xu[::-1], xl[1:]]), np.concatenate([yu[::-1], yl[1:]])])


def naca4_code(code: str):
    """'2415' -> (m, p, t) = (0.02, 0.4, 0.15)"""
    return int(code[0]) / 100, int(code[1]) / 10, int(code[2:]) / 100


def pod_radius(s, L: float = POD_L, R: float = POD_R, rt: float = POD_TAIL_R):
    """pod radius at distance s (m) from the nose: elliptic nose of semi-axis POD_NOSE_A, parallel mid-body to
    POD_PARALLEL_TO, smooth-step boat-tail to rt at L (cad/BuildVtol.cs Fuselage(), analysis/geometry.mjs podRadius)"""
    a = POD_NOSE_A; x1 = POD_PARALLEL_TO
    if s < a:
        return R * math.sqrt(max(0.0, 1 - ((s - a) / a) ** 2))
    if s < x1:
        return R
    u = (s - x1) / (L - x1)
    return rt + (R - rt) * (1 - u * u * (3 - 2 * u))


if __name__ == "__main__":
    print(f"{WING_NAME} m {WING_M} p {WING_P} t {WING_T}; {TAIL_NAME} t {TAIL_T}; TE cad {TE_CAD} aero {TE_AERO}")
    print(f"pod {POD_PROFILE}: noseX {POD_NOSE_X} L {POD_L} R {POD_R} tailR {POD_TAIL_R} noseA {POD_NOSE_A} parallelTo {POD_PARALLEL_TO}")
    print("scalar keys:", len(PARAMS), " comp records:", len(read_records("comp")), " xcomp:", len(read_records("xcomp")))
