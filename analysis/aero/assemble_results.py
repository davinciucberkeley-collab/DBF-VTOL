"""Collect every tool's output into the compact analysis/aero/aero_results.json.

Also derives: 3-D CL_max (critical-section method on the AVL span loading, plus Raymer's 0.9 factor as a
second estimate), the stall speed at the sized wing loading, the trim state, static margins for the three CG
cases in results.json, and the CFD-vs-XFOIL-vs-VLM comparison table.
"""
from __future__ import annotations
import json, math, time
import numpy as np
from common import *

def load(name):
    f = OUT / name
    return json.loads(f.read_text()) if f.exists() else None

def interp_sorted(x, xs, ys):
    xs, ys = np.asarray(xs), np.asarray(ys); o = np.argsort(xs); return float(np.interp(x, xs[o], ys[o]))

def main():
    xf, nf, su2, avl, asb, drag, mesh = (load(n) for n in ("xfoil_polars.json", "neuralfoil_polars.json", "su2_2d.json", "avl_results.json", "asb_results.json", "drag_buildup.json", "mesh_2d.json"))
    vlm_repo = json.loads((REPO / "analysis" / "aero.json").read_text())   # analysis/vlm.mjs output
    R = {"generated": time.strftime("%Y-%m-%d"), "aircraft": f"C0 4-lift twin-boom quadplane, {DESIGN_VERSION} (docs/DESIGN-BASIS.md; geometry analysis/results.json)",
         "geometry": {"span_m": SPAN, "chord_m": CHORD, "S_ref_m2": S_REF, "AR": AR, "MTOW_kg": MTOW, "wing_loading_N_m2": W / S_REF,
                      "S_h_m2": S_H, "l_h_m": L_H, "V_h": GEO["Vh"], "S_v_m2": S_V, "V_v": GEO["Vv"], "CG_target_pct_MAC": 100 * CG_FRAC,
                      "CG_no_payload_pct_MAC": CG["pct"]["noPayload"], "CG_range_pct_MAC": [CG["pctFwd"], CG["pctAft"]]},
         "conditions": {k: {**v, "mu": MU, "rho": RHO} for k, v in CONDITIONS.items()},
         "tools": {"XFOIL": xf["tool"], "NeuralFoil": nf["tool"], "SU2": su2["tool"] if su2 else "—", "AVL": avl["tool"], "AeroSandbox": asb["tool"] if asb else "—",
                   "gmsh": f"gmsh {__import__('gmsh').__version__} (PyPI, checked 2026-10-21)"}}
    # ---- section polars (compact tables) ----
    R["section_polars"] = {}
    for k, v in xf["cases"].items():
        R["section_polars"][k] = {"foil": v["foil"], "Re": v["Re"], "Ncrit": v["Ncrit"], "CL_max": v["CL_max"], "alpha_CLmax_deg": v["alpha_CLmax_deg"],
                                  "CL_alpha_per_rad": v["CL_alpha_per_rad"], "alpha_0L_deg": v["alpha_0L_deg"], "Cm_c4": v["Cm_c4_mean_linear"], "Cd_min": v["Cd_min"],
                                  "LD_max_2D": v["LD_max_2D"], "n_points": v["n_points"], "columns": v["columns"],
                                  "table": [[round(x, 5) for x in row] for row in v["table"]],
                                  "neuralfoil_CL_max": nf["cases"][k]["CL_max"] if k in nf["cases"] else None,
                                  "neuralfoil_alpha_CLmax_deg": nf["cases"][k]["alpha_CLmax_deg"] if k in nf["cases"] else None}
    c_cr = xf["cases"]["n2415_cruise_ncrit9"]; c_st = xf["cases"]["n2415_stall_ncrit9"]
    # ---- 2-D CL_max summary ----
    # SU2 polar entries are usable by construction (su2_2d.py drops diverged cases); only converged points are used here
    su2_clmax = None; su2_conv = [r for r in (su2.get("polar_L2_SA", []) if su2 else []) if r["converged"]]
    if su2_conv:
        i = int(np.argmax([r["CL"] for r in su2_conv]))
        su2_clmax = {"CL_max": su2_conv[i]["CL"], "alpha_deg": su2_conv[i]["alpha_deg"], "converged": True,
                     "alphas_converged_deg": [r["alpha_deg"] for r in su2_conv],
                     "note": "fully turbulent SA, medium mesh, max over the converged points only (sparse: see alphas_converged_deg); "
                             "steady RANS near stall is unsteady, values are 300-iteration means"}
    R["CL_max_2D"] = {"xfoil_stall_Re": c_st["CL_max"], "xfoil_cruise_Re": c_cr["CL_max"], "xfoil_cruise_Ncrit5": xf["cases"]["n2415_cruise_ncrit5"]["CL_max"],
                      "neuralfoil_stall_Re": nf["cases"]["n2415_stall_ncrit9"]["CL_max"], "su2_SA_cruise_Re": su2_clmax,
                      "experiment_Genc_Lock_Kaynak_2008_Re2e5": {"CL_max": 1.3, "alpha_stall_deg": 12,
                          "source": "Genc, Lock, Kaynak, AIAA ATIO 2008 (abstract via avesis.erciyes.edu.tr, checked 2026-10-21)"},
                      "adopted_2D": 1.30, "adopted_note": "experiment at Re 2e5 (closest to the 12 m/s stall case, Re 1.96e5); XFOIL 1.36 and NeuralFoil 1.28 bracket it"}
    # ---- 3-D CL_max: critical-section method on AVL span loading ----
    sl = avl["pod"]["span_loading_trim"]; wing_strips = [s for k, v in sl.items() if k.startswith("Wing") for s in v]
    CLt = avl["pod"]["trim_cruise"]["CL"]
    cl_ratio = max(s["cl"] for s in wing_strips) / CLt           # max section cl / aircraft CL at trim (tail download included)
    cl2d = R["CL_max_2D"]["adopted_2D"]
    clmax_crit = cl2d / cl_ratio
    clmax_raymer = 0.9 * cl2d                                       # Raymer eq. 12.15, high-AR unswept wing, minus nothing for tail
    R["CL_max_3D"] = {"critical_section_method": clmax_crit, "max_cl_over_CL_at_trim": cl_ratio, "raymer_0p9": clmax_raymer,
                      "aerobuildup_untrimmed": asb["summary"]["aerobuildup_CL_max_untrimmed_12mps"] if asb else None,
                      "adopted": round(min(clmax_crit, clmax_raymer), 3),
                      "note": "critical-section: aircraft CL at which the most loaded AVL strip reaches the 2-D CL_max (trimmed, tail download included); Raymer eq. 12.15 factor 0.9 for AR 10 unswept"}
    clmax3 = R["CL_max_3D"]["adopted"]
    Vs = math.sqrt(2 * W / (RHO * S_REF * clmax3))
    R["stall"] = {"CL_max_3D": clmax3, "V_stall_mps": Vs, "V_stall_req_mps": V_STALL_REQ, "sizing_CL_max": CL_MAX_SIZING,
                  "V_stall_at_sizing_CLmax": math.sqrt(2 * W / (RHO * S_REF * CL_MAX_SIZING)),
                  "V_1p3_Vs": 1.3 * Vs, "AIRSPEED_MIN_mps": V_TRANS, "margin_to_R11_pct": 100 * (V_STALL_REQ - Vs) / V_STALL_REQ,
                  "trim_at_Vstall": avl["pod"]["trim_Vstall"]}
    # ---- lift curve / stability ----
    pod = avl["pod"]
    R["lift_curve"] = {"CL_alpha_per_rad": {"xfoil_2D_cruise": c_cr["CL_alpha_per_rad"], "AVL_aircraft_pod": pod["CL_alpha_per_rad_fit"], "AVL_aircraft_nopod": avl["nopod"]["CL_alpha_per_rad_fit"],
                                            "AeroSandbox_VLM": asb["summary"]["vlm_CL_alpha_per_rad"] if asb else None,
                                            "repo_vlm_full": vlm_repo["full_CLa_per_rad"], "repo_helmbold_wing": GEO["aw"]},
                       "alpha_0L_deg_aircraft": pod["alpha_0L_deg"], "Cm0_CG28": pod["Cm0"]}
    R["trim_cruise"] = {**pod["trim_cruise"], "Cm_elevator0_at_cruise_CL": pod["cruise_CL_elevator0"]["Cm"]}
    sm_cases = {"CG_28pct": 100 * CG_FRAC, "CG_fwd_batt+30mm": CG["pctFwd"], "CG_aft_batt-30mm": CG["pctAft"], "CG_no_payload": CG["pct"]["noPayload"]}
    R["neutral_point"] = {"AVL_pod_pct_MAC": pod["NP_pct_MAC"], "AVL_nopod_pct_MAC": avl["nopod"]["NP_pct_MAC"], "repo_vlm_pct_MAC": vlm_repo["neutral_point_pct_mac"], "sizing_pct_MAC": GEO["hn"] * 100,
                          "AeroSandbox_VLM_pct_MAC": asb["summary"]["vlm_NP_pct_MAC"] if asb else None,
                          "static_margin_pct": {k: pod["NP_pct_MAC"] - v for k, v in sm_cases.items()},
                          "static_margin_sizing_pct": GEO["SM"] * 100, "pod_shift_pct_MAC": pod["NP_pct_MAC"] - avl["nopod"]["NP_pct_MAC"]}
    R["stability_derivatives_AVL_trim"] = pod["derivatives_trim"]
    R["tail_volumes"] = {"V_h": GEO["Vh"], "V_v": GEO["Vv"], "typical_range_Raymer_tab6.4_homebuilt": {"V_h": "0.50", "V_v": "0.04"}, "typical_range_Raymer_tab6.4_sailplane": {"V_h": "0.50", "V_v": "0.02"},
                         "note": "Raymer 5th ed. table 6.4 (checked from the book, not online)"}
    # ---- drag ----
    R["drag"] = {"CD0_total": drag["CD0_total"], "CD0_clean_airframe": drag["CD0_clean_airframe"], "CD0_rotors_booms": drag["CD0_rotors_booms"],
                 "by_group": drag["by_group_dCD"], "items": [{k: i[k] for k in ("component", "dCD", "CdA_m2", "source")} for i in drag["items"]],
                 "CdA_per_boom": drag["CdA_per_boom_incl_clamps"], "CdA_per_rotor_unit": drag["CdA_per_rotor_unit"],
                 "wing_profile_estimates": drag["wing_profile_estimates"], "e_oswald_fit": drag["polar"]["e_oswald_fit"], "e_inviscid_AVL": drag["polar"]["e_inviscid_AVL"],
                 "cruise": drag["cruise"], "gear_faired_case": drag["gear_faired_case"], "sizing": drag["sizing"],
                 "polar": {"CL": drag["polar"]["CL"], "CD": drag["polar"]["CD"]}}
    # ---- cruise power / endurance implication (model.js F7-F9 with the new L/D) ----
    P = drag["cruise"]["P_elec_W"]; Ph = SIZED["P_hover"]; Eavail = SIZED["Epack_Wh"] * (1 - BASE["reserve"]) * BASE["etaBatt"] * 3600
    t_cr = (Eavail - Ph * (BASE["tHover"] + BASE["tTrans"])) / P / 60
    Pf = drag["gear_faired_case"]["P_elec_W"]; t_cr_f = (Eavail - Ph * (BASE["tHover"] + BASE["tTrans"])) / Pf / 60
    R["mission"] = {"P_cruise_W": P, "P_cruise_sizing_W": SIZED["P_cruise"], "t_cruise_avail_min": t_cr, "t_cruise_sizing_min": SIZED["t_cruise_avail_min"],
                    "R10_req_min": 10, "cruise_margin_min_req": RESULTS["cruiseMarginMin"], "faired_gear": {"P_cruise_W": Pf, "t_cruise_avail_min": t_cr_f},
                    "I_cruise_A": P / BASE["Vpack"], "formula": "model.js F7-F9 with the build-up L/D; hover power and pack unchanged"}
    if drag.get("gear_round_case"):   # v0.4 design is faired: report the bare-leg alternative instead
        Pr = drag["gear_round_case"]["P_elec_W"]
        R["mission"].pop("faired_gear", None)
        R["mission"]["round_legs"] = {"P_cruise_W": Pr, "t_cruise_avail_min": (Eavail - Ph * (BASE["tHover"] + BASE["tTrans"])) / Pr / 60}
        R["drag"]["gear_round_case"] = drag["gear_round_case"]
    # ---- CFD ----
    if su2:
        R["cfd"] = {"solver": su2["solver"], "Re": su2["Re"], "meshes": mesh, "mesh_study": su2["mesh_study"],
                    "polar_L2_SA": su2.get("polar_L2_SA"), "polar_L2_SSTLM": su2.get("polar_L2_SSTLM"),
                    "unusable_cases": {k: v.get("reason") for k, v in su2.get("unusable_cases", {}).items()},
                    "timings": {k: {"iters": v["iters"], "wall_s": v["wall_s"], "converged": bool(v["converged"] and v.get("usable", True)), "usable": v.get("usable", True)}
                                for k, v in sorted({**su2["cases"], **su2.get("unusable_cases", {})}.items())},
                    "wall_s_total": su2["wall_s_total"], "threads_per_case": su2["threads_per_case"], "jobs": su2["jobs"]}
        # comparison table at common alphas
        tbl = []
        xt = np.array(c_cr["table"]); nfc = nf["cases"]["n2415_cruise_ncrit9"]
        for a in (0, 2, 4, 8, 10, 12, 14, 16):
            row = {"alpha_deg": a, "xfoil_CL": interp_sorted(a, xt[:, 0], xt[:, 1]) if xt[:, 0].min() <= a <= xt[:, 0].max() else None,
                   "xfoil_CD": interp_sorted(a, xt[:, 0], xt[:, 2]) if xt[:, 0].min() <= a <= xt[:, 0].max() else None,
                   "neuralfoil_CL": interp_sorted(a, nfc["alpha_deg"], nfc["CL"]), "neuralfoil_CD": interp_sorted(a, nfc["alpha_deg"], nfc["CD"])}
            for m in ("SA", "SSTLM"):
                p = [r for r in su2.get(f"polar_L2_{m}", []) if abs(r["alpha_deg"] - a) < 1e-6 and r["converged"]]   # converged & usable only
                row[f"su2_{m}_CL"] = p[0]["CL"] if p else None; row[f"su2_{m}_CD"] = p[0]["CD"] if p else None
                row[f"su2_{m}_conv"] = p[0]["converged"] if p else None
            # AVL wing section cl at this alpha is not 2-D; VLM 2-D equivalent is 2 pi (alpha - a0L)
            row["thin_airfoil_CL"] = 2 * math.pi * math.radians(a - c_cr["alpha_0L_deg"])
            tbl.append(row)
        R["comparison_2D"] = tbl
    else:
        R["cfd"] = "—"
    # ---- timings ----
    R["timings_s"] = {"xfoil": xf.get("wall_s"), "neuralfoil": nf.get("wall_s"), "avl": avl.get("wall_s"), "aerosandbox": asb.get("wall_s") if asb else None,
                      "su2_total": su2.get("wall_s_total") if su2 else None, "mesh_2d": {k: v["wall_s"] for k, v in mesh.items()} if mesh else None}
    dump_json(HERE / "aero_results.json", R)
    print(f"  CL_max 2D adopted {cl2d} -> 3D {clmax3} (crit-section {clmax_crit:.3f}, Raymer {clmax_raymer:.3f}); Vs {Vs:.2f} m/s (R11 <= 12)")
    print(f"  NP {pod['NP_pct_MAC']:.1f} % MAC (pod), SM at {100*CG_FRAC:.0f} % {pod['NP_pct_MAC']-100*CG_FRAC:.1f} %, no-payload CG {CG['pct']['noPayload']:.1f} % -> SM {pod['NP_pct_MAC']-CG['pct']['noPayload']:.1f} %")
    print(f"  CD0 {drag['CD0_total']:.4f}, L/D cruise {drag['cruise']['LD']:.2f}, P_cruise {P:.0f} W, cruise avail {t_cr:.1f} min (sizing {SIZED['t_cruise_avail_min']:.1f}); faired gear {t_cr_f:.1f} min")

if __name__ == "__main__":
    main()
