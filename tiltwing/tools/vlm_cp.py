"""3-D vortex-lattice pressure distribution on the tilt-wing (wing + horizontal tail), for the CFD tab.

AeroSandbox VortexLatticeMethod on the same geometry as tools/aero_ref.py, at 20 m/s (paper CFD speed),
for tilt 0/45/90 deg and wing-coordinate alpha 0/10 deg (paper Figs. 13, 14, 18). Exports every panel's four corners
and its pressure jump delta-Cp so the dashboard can draw a coloured 3-D surface. Inviscid, thin surfaces, no fuselage
or propellers: it shows the load distribution, not separation.
Writes tiltwing/data/vlm.json. Run: python3 tiltwing/tools/vlm_cp.py
"""
import json, os, math
import numpy as np
import aerosandbox as asb
import importlib.util

HERE = os.path.dirname(os.path.abspath(__file__)); TW = os.path.dirname(HERE)
spec = importlib.util.spec_from_file_location("aero_ref_geom", os.path.join(HERE, "aero_ref.py"))
src = open(os.path.join(HERE, "aero_ref.py")).read().split("alphas = np.arange")[0]   # reuse geometry builders only
g = {"__file__": os.path.join(HERE, "aero_ref.py")}; exec(compile(src, "aero_ref_geom", "exec"), g)
airplane, p, r = g["airplane"], g["p"], g["r"]

out = {"source": "AeroSandbox 4.2.10 VortexLatticeMethod, tools/vlm_cp.py", "V": 20, "cases": []}
for tilt in (0, 45, 90):
    for aw in (0, 10):
        ap = airplane(tilt)
        ap = asb.Airplane(name=ap.name, xyz_ref=ap.xyz_ref, s_ref=ap.s_ref, c_ref=ap.c_ref, b_ref=ap.b_ref, wings=ap.wings)  # no fuselage in VLM
        op = asb.OperatingPoint(velocity=20, alpha=aw - tilt)
        vlm = asb.VortexLatticeMethod(airplane=ap, op_point=op, spanwise_resolution=10, chordwise_resolution=6,
                                      spanwise_spacing_function=np.linspace, chordwise_spacing_function=np.linspace)
        res = vlm.run()
        # delta-Cp from vortex strength: dCp = 2 Γ |V × dl| ... AeroSandbox exposes forces per panel
        F = np.array(vlm.forces_geometry)                       # N, geometry axes
        nrm = np.array(vlm.normal_directions)
        A = np.array(vlm.areas)
        q = 0.5 * op.atmosphere.density() * 20 ** 2
        dcp = np.sum(F * nrm, axis=1) / (q * A)
        corners = np.stack([vlm.front_left_vertices, vlm.back_left_vertices, vlm.back_right_vertices, vlm.front_right_vertices], axis=1)
        out["cases"].append({"tilt": tilt, "alpha_w": aw, "CL": round(float(res["CL"]), 4), "CDi": round(float(res["CD"]), 4),
                             "panels": np.round(corners, 4).tolist(), "dcp": np.round(dcp, 3).tolist()})
        print(f"tilt {tilt:2d} alpha_w {aw:2d}: CL {res['CL']:.3f}  panels {len(dcp)}  dCp {dcp.min():.2f}..{dcp.max():.2f}")
json.dump(out, open(os.path.join(TW, "data", "vlm.json"), "w"))
