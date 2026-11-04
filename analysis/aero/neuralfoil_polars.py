"""NeuralFoil cross-check of the XFOIL polars (NACA 2415 at the three wing Reynolds numbers, NACA 0009 at tail Re).

NeuralFoil (Sharpe, 2024, https://github.com/peterdsharpe/NeuralFoil, PyPI `neuralfoil`) is a neural surrogate trained on
XFOIL; it gives a smooth polar through stall where XFOIL stops converging, plus an "analysis_confidence" metric.
Output: out/neuralfoil_polars.json
"""
from __future__ import annotations
import time
import numpy as np
import aerosandbox as asb
import neuralfoil as nf
from common import *

def polar(code: str, Re: float, M: float, ncrit: float, alphas):
    af = asb.Airfoil(name=f"naca{code}", coordinates=naca4(code, 100))
    r = nf.get_aero_from_airfoil(af, alpha=alphas, Re=Re, n_crit=ncrit, model_size="xxxlarge")
    return {"alpha_deg": alphas.tolist(), "CL": r["CL"].tolist(), "CD": r["CD"].tolist(), "CM": r["CM"].tolist(),
            "confidence": r["analysis_confidence"].tolist()}

def main():
    t0 = time.time()
    alphas = np.arange(-8, 24.01, 0.5)
    res = {"tool": f"NeuralFoil {nf.__version__} xxxlarge (PyPI, checked 2026-10-21), via AeroSandbox {asb.__version__}", "cases": {}}
    for name, c in CONDITIONS.items():
        p = polar("2415", c["Re"], c["M"], 9, alphas)
        cl = np.array(p["CL"]); i = int(np.argmax(cl))
        lin = (alphas >= -2) & (alphas <= 6)
        slope, icpt = np.polyfit(np.radians(alphas[lin]), cl[lin], 1)
        res["cases"][f"n2415_{name}_ncrit9"] = {"foil": "NACA 2415", "Re": c["Re"], "Ncrit": 9, "CL_max": float(cl[i]),
            "alpha_CLmax_deg": float(alphas[i]), "CL_alpha_per_rad": float(slope), "alpha_0L_deg": float(np.degrees(-icpt / slope)),
            "confidence_at_CLmax": p["confidence"][i], **p}
    c = CONDITIONS["cruise"]
    p = polar("2415", c["Re"], c["M"], 5, alphas); cl = np.array(p["CL"]); i = int(np.argmax(cl))
    res["cases"]["n2415_cruise_ncrit5"] = {"foil": "NACA 2415", "Re": c["Re"], "Ncrit": 5, "CL_max": float(cl[i]), "alpha_CLmax_deg": float(alphas[i]), **p}
    for name, c in TAIL_CONDITIONS.items():
        a2 = np.arange(-16, 16.01, 0.5)
        p = polar("0009", c["Re"], mach(c["V"]), 9, a2); cl = np.array(p["CL"]); i = int(np.argmax(cl))
        lin = (a2 >= -3) & (a2 <= 3); slope, _ = np.polyfit(np.radians(a2[lin]), cl[lin], 1)
        res["cases"][f"n0009_tail_{name}_ncrit9"] = {"foil": "NACA 0009", "Re": c["Re"], "Ncrit": 9, "CL_max": float(cl[i]),
            "alpha_CLmax_deg": float(a2[i]), "CL_alpha_per_rad": float(slope), **p}
    res["wall_s"] = time.time() - t0
    dump_json(OUT / "neuralfoil_polars.json", res)
    for k, v in res["cases"].items():
        print(f"  {k:28s} CLmax {v['CL_max']:.3f} @ {v['alpha_CLmax_deg']:.1f} deg")
    print(f"NeuralFoil total {res['wall_s']:.1f} s")

if __name__ == "__main__":
    main()
