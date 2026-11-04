"""AeroSandbox cross-check of the AVL model: VLM (inviscid) and AeroBuildup (NeuralFoil section polars + fuselage).

AeroSandbox 4.2.10 (PyPI, https://github.com/peterdsharpe/AeroSandbox, checked 2026-10-21).
Same geometry as avl_run.py (AeroSandbox frame: x aft, y right, z up).  AeroBuildup gives a nonlinear 3-D lift
curve through stall from the NeuralFoil polars at the local Re, so it is used for the 3-D CL_max estimate and as
an independent neutral point.  Output: out/asb_results.json
"""
from __future__ import annotations
import time
import numpy as np
import aerosandbox as asb
import aerosandbox.numpy as anp
from common import *

def airplane():
    c = CHORD; b2 = SPAN / 2
    naca2415 = asb.Airfoil("naca2415"); naca0009 = asb.Airfoil("naca0009")
    xt = -X_TAIL_LE; zt = Z_HTAIL; zfin0 = Z_BOOM + BOOM_OD / 2
    wing = asb.Wing(name="Wing", symmetric=True, xsecs=[
        asb.WingXSec(xyz_le=[0, 0, 0], chord=c, airfoil=naca2415),
        asb.WingXSec(xyz_le=[0, b2, 0], chord=c, airfoil=naca2415)])
    htail = asb.Wing(name="Htail", symmetric=True, xsecs=[
        asb.WingXSec(xyz_le=[xt, 0, zt], chord=H_CHORD, airfoil=naca0009),
        asb.WingXSec(xyz_le=[xt, H_SPAN / 2, zt], chord=H_CHORD, airfoil=naca0009)])
    fin = asb.Wing(name="Fin", symmetric=True, xsecs=[
        asb.WingXSec(xyz_le=[xt, Y_BOOM, zfin0], chord=V_C, airfoil=naca0009),
        asb.WingXSec(xyz_le=[xt, Y_BOOM, zfin0 + V_H], chord=V_C, airfoil=naca0009)])
    # pod: body of revolution (geom.pod_radius, the profile of cad/BuildVtol.cs Fuselage()), 25 stations
    xs = np.linspace(0, POD_L, 25); fx = []
    for s in xs:
        fx.append(asb.FuselageXSec(xyz_c=[-POD_NOSE_X + s, 0, Z_BOOM], radius=max(pod_radius(s), 1e-4)))
    pod = asb.Fuselage(name="Pod", xsecs=fx)
    return asb.Airplane(name="C0", xyz_ref=[-X_CG, 0, 0], s_ref=S_REF, c_ref=CHORD, b_ref=SPAN,
                        wings=[wing, htail, fin], fuselages=[pod])

sc = lambda x: float(np.asarray(x).ravel()[0])

def main():
    t0 = time.time()
    ap = airplane()
    res = {"tool": f"AeroSandbox {asb.__version__} VLM + AeroBuildup (NeuralFoil section polars)", "vlm": [], "aerobuildup": []}
    for a in [-4, -2, 0, 2, 4, 6, 8, 10]:
        op = asb.OperatingPoint(velocity=V_CRUISE, alpha=a, atmosphere=asb.Atmosphere(altitude=0))
        v = asb.VortexLatticeMethod(airplane=ap, op_point=op, spanwise_resolution=12, chordwise_resolution=8).run()
        res["vlm"].append({"alpha_deg": a, "CL": sc(v["CL"]), "CD_induced": sc(v["CD"]), "Cm": sc(v["Cm"])})
    alphas = list(range(-6, 25, 1))
    for a in alphas:
        op = asb.OperatingPoint(velocity=V_STALL_REQ, alpha=a, atmosphere=asb.Atmosphere(altitude=0))
        ab = asb.AeroBuildup(airplane=ap, op_point=op).run()
        res["aerobuildup"].append({"alpha_deg": a, "CL": sc(ab["CL"]), "CD": sc(ab["CD"]), "Cm": sc(ab["Cm"])})
    # AeroBuildup at cruise speed for the drag comparison
    res["aerobuildup_cruise"] = []
    for a in [0, 2, 3, 4, 6]:
        op = asb.OperatingPoint(velocity=V_CRUISE, alpha=a, atmosphere=asb.Atmosphere(altitude=0))
        ab = asb.AeroBuildup(airplane=ap, op_point=op).run()
        res["aerobuildup_cruise"].append({"alpha_deg": a, "CL": sc(ab["CL"]), "CD": sc(ab["CD"]), "Cm": sc(ab["Cm"])})
    V = np.array([[r["alpha_deg"], r["CL"], r["Cm"]] for r in res["vlm"]])
    cla = np.polyfit(np.radians(V[:, 0]), V[:, 1], 1); cma = np.polyfit(np.radians(V[:, 0]), V[:, 2], 1)
    hn_vlm = CG_FRAC - cma[0] / cla[0]          # Cm taken about xyz_ref = the target CG
    B = np.array([[r["alpha_deg"], r["CL"], r["Cm"]] for r in res["aerobuildup"]])
    lin = (B[:, 0] >= -2) & (B[:, 0] <= 6)
    clb = np.polyfit(np.radians(B[lin, 0]), B[lin, 1], 1); cmb = np.polyfit(np.radians(B[lin, 0]), B[lin, 2], 1)
    i = int(np.argmax(B[:, 1]))
    res["summary"] = {
        "vlm_CL_alpha_per_rad": float(cla[0]), "vlm_Cm_alpha_per_rad": float(cma[0]), "vlm_NP_pct_MAC": 100 * float(hn_vlm),
        "aerobuildup_CL_alpha_per_rad": float(clb[0]), "aerobuildup_Cm_alpha_per_rad": float(cmb[0]),
        "aerobuildup_NP_pct_MAC": 100 * (CG_FRAC - float(cmb[0] / clb[0])),
        "aerobuildup_CL_max_untrimmed_12mps": float(B[i, 1]), "aerobuildup_alpha_CLmax_deg": float(B[i, 0]),
        "note": "AeroBuildup CL_max is for the whole aircraft at elevator 0 (untrimmed), V = 12 m/s; the wing-alone 3-D value is in aero_results.json"}
    res["wall_s"] = time.time() - t0
    dump_json(OUT / "asb_results.json", res)
    s = res["summary"]
    print(f"  VLM: CLa {s['vlm_CL_alpha_per_rad']:.3f}/rad  NP {s['vlm_NP_pct_MAC']:.1f} % MAC | AeroBuildup: CLa {s['aerobuildup_CL_alpha_per_rad']:.3f}  NP {s['aerobuildup_NP_pct_MAC']:.1f} %  CLmax {s['aerobuildup_CL_max_untrimmed_12mps']:.3f} @ {s['aerobuildup_alpha_CLmax_deg']:.0f} deg")
    print(f"AeroSandbox total {res['wall_s']:.1f} s")

if __name__ == "__main__":
    main()
