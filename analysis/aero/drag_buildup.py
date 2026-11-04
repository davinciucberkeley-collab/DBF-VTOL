"""Component drag build-up of C0 at cruise (20 m/s, ISA sea level) and the resulting trimmed drag polar.

Method: skin-friction x form factor x interference x wetted area (Raymer, Aircraft Design: A Conceptual Approach,
5th ed., 2012, ch. 12.5 eqs 12.27-12.31) for the streamlined parts; bluff-body drag coefficients from Hoerner,
Fluid-Dynamic Drag (1965) for cylinders in cross-flow, protuberances and the stopped rotors.  The wing and tail
profile drag is ALSO taken from the XFOIL polars (transitional boundary layer at the actual Re) and from the SU2
RANS result (fully turbulent), so three wing estimates are shown.  Induced drag uses the AVL inviscid span
efficiency; the viscous Oswald factor is recovered by fitting CD = CD0 + CL^2/(pi AR e) to the summed polar.

Every coefficient has a source tag: R = Raymer eq., H = Hoerner chapter/figure, XF = XFOIL output file,
AVL = out/avl_results.json, SU2 = out/su2_2d.json, EST = engineering estimate (not measured).
Output: out/drag_buildup.json
"""
from __future__ import annotations
import math, json
import numpy as np
from common import *

Q_CRUISE = 0.5 * RHO * V_CRUISE**2

def cf_turb(Re):   # Raymer eq. 12.27 (Prandtl-Schlichting), fully turbulent flat plate
    return 0.455 / (math.log10(Re) ** 2.58)

def cf_lam(Re):    # Raymer eq. 12.25 (Blasius)
    return 1.328 / math.sqrt(Re)

def cf_mixed(Re, x_tr):
    """flat-plate Cf with transition at x_tr (fraction of length), laminar ahead, turbulent behind
    (Schlichting/Raymer 12.5.2 'laminar run' correction, simple composite)"""
    return x_tr * cf_lam(max(Re * x_tr, 1e3)) + (1 - x_tr) * cf_turb(Re) if x_tr > 0 else cf_turb(Re)

def ff_wing(tc, xc_max=0.3, M=0.06, sweep=0.0):   # Raymer eq. 12.30
    return (1 + 0.6 / xc_max * tc + 100 * tc**4) * (1.34 * M**0.18 * math.cos(sweep) ** 0.28)

def ff_body(f):                                     # Raymer eq. 12.31, f = L/D
    return 1 + 60 / f**3 + f / 400

def pod_wetted():
    """wetted area of the revolved pod (geom.pod_radius, the profile of cad/BuildVtol.cs Fuselage()) by numerical integration"""
    rt = POD_TAIL_R
    xs = np.linspace(0, POD_L, 2001); rs = np.empty_like(xs)
    for i, s in enumerate(xs):
        rs[i] = pod_radius(s)
    dr = np.gradient(rs, xs)
    return float(np.trapezoid(2 * math.pi * rs * np.sqrt(1 + dr**2), xs)), float(math.pi * rt**2)

def xfoil_cd_at_cl(path: Path, cl):
    a = np.loadtxt(path); imax = int(np.argmax(a[:, 1])); b = a[: imax + 1]; b = b[np.argsort(b[:, 1])]
    return float(np.interp(cl, b[:, 1], b[:, 2]))

def main():
    xf = json.loads((OUT / "xfoil_polars.json").read_text())
    avl = json.loads((OUT / "avl_results.json").read_text())
    su2 = json.loads((OUT / "su2_2d.json").read_text()) if (OUT / "su2_2d.json").exists() else None
    trim = avl["pod"]["trim_cruise"]
    e_inv = trim["e_AVL"]
    cl_cruise = CL_CRUISE_SIZING
    items = []
    def add(name, cda, src, note="", group="airframe"):
        items.append({"component": name, "CdA_m2": cda, "dCD": cda / S_REF, "source": src, "note": note, "group": group})

    # ---- wing (three estimates; the XFOIL one is carried into the polar) ----
    Re_w = CONDITIONS["cruise"]["Re"]
    S_exp = S_REF - 2 * POD_R * CHORD                  # exposed wing (the pod covers 2 x POD_R of span)
    Swet_w = S_exp * (1.977 + 0.52 * T_C_WING)         # Raymer eq. 7.12
    cd_wing_ff = cf_turb(Re_w) * ff_wing(T_C_WING, 0.3, CONDITIONS["cruise"]["M"]) * 1.0 * Swet_w / S_REF
    cd_wing_xf = xfoil_cd_at_cl(OUT / "xfoil_n2415_cruise_ncrit9.txt", cl_cruise) * S_exp / S_REF
    cd_wing_xf5 = xfoil_cd_at_cl(OUT / "xfoil_n2415_cruise_ncrit5.txt", cl_cruise) * S_exp / S_REF
    # SU2: converged points only (the polar holds only usable cases, see su2_2d.py); None unless they bracket the cruise CL
    cd_wing_su2 = None; su2_pts = []
    if su2 and su2.get("polar_L2_SA"):
        p = [r for r in su2["polar_L2_SA"] if r["converged"]]
        cl = np.array([r["CL"] for r in p]); cd = np.array([r["CD"] for r in p])
        if len(p) >= 2 and cl.min() <= cl_cruise <= cl.max():
            k = np.argsort(cl); cd_wing_su2 = float(np.interp(cl_cruise, cl[k], cd[k])) * S_exp / S_REF
            i = int(np.searchsorted(cl[k], cl_cruise))
            su2_pts = [p[k[max(i - 1, 0)]]["alpha_deg"], p[k[min(i, len(p) - 1)]]["alpha_deg"]]
    add("Wing profile (XFOIL Ncrit 9, transitional, at section cl = CL cruise)", cd_wing_xf * S_REF, "XF out/xfoil_n2415_cruise_ncrit9.txt", "carried into the polar", "wing")
    # ---- tails ----
    tail_file = OUT / "xfoil_n0009_tail_cruise_ncrit9.txt"
    if not tail_file.exists(): tail_file = OUT / "xfoil_n0009_tail_stall_ncrit9.txt"
    cd_h = xfoil_cd_at_cl(tail_file, 0.0)
    Re_h_file = TAIL_CONDITIONS["cruise" if "cruise" in tail_file.name else "stall"]["Re"]
    add(f"H-tail profile (XFOIL NACA 0009, Re {Re_h_file/1e5:.1f}e5, cl ~ 0)", cd_h * S_H, f"XF {tail_file.name}", "", "tail")
    Re_v = reynolds(V_CRUISE, V_C)
    cd_v = cf_turb(Re_v) * ff_wing(0.09, 0.3) * 1.05 * (2 * S_V * (1.977 + 0.52 * 0.09)) / (2 * S_V)   # per unit planform, Q 1.05 fin-boom junction (R: 1.04-1.05 for tails)
    add("Fins (2), Raymer FF, Q 1.05", cd_v * S_V, f"R 12.27/12.30, Re {Re_v:.2e}", "fully turbulent; XFOIL at this Re gives ~0.012-0.014", "tail")
    # ---- pod ----
    Swet_pod, A_base = pod_wetted()
    f_pod = POD_L / (2 * POD_R); Re_pod = reynolds(V_CRUISE, POD_L)
    cda_pod = cf_turb(Re_pod) * ff_body(f_pod) * 1.0 * Swet_pod
    add("Pod (body of revolution, Raymer FF, Q 1.0)", cda_pod, f"R 12.27/12.31, Swet {Swet_pod:.3f} m2, f {f_pod:.2f}, Re {Re_pod:.2e}", "", "pod")
    # base drag of the truncated tail cone is covered by the spinner/pusher prop: pusher prop slipstream fills it (EST 0)
    canopy_frontal = math.pi * CANOPY_R**2 / 2
    add("Canopy blister", 0.10 * canopy_frontal, "H ch. XIII, faired canopy Cd(frontal) ~0.10 (EST)", f"frontal {canopy_frontal*1e4:.1f} cm2", "pod")
    add("Wing-pod junctions (2)", 2 * max(0.8 * T_C_WING**3 - 0.0003, 0) * CHORD**2, "H ch. VIII wing-fuselage junction, dD/(q c^2) = 0.8 (t/c)^3 - 0.0003", "", "pod")
    # ---- booms ----
    L_boom = sum(BOOM_SEGS); Swet_boom = math.pi * BOOM_OD * L_boom; Re_boom = reynolds(V_CRUISE, L_boom)
    f_boom = L_boom / BOOM_OD
    cda_boom = cf_turb(Re_boom) * ff_body(f_boom) * 1.0 * Swet_boom
    add("Booms (2), skin friction, axial cylinder", 2 * cda_boom, f"R 12.27/12.31, L {L_boom:.3f} m, OD {BOOM_OD*1e3:.1f} mm", "", "booms")
    add("Boom clamps on wing (4) + gear clamps (4)", 8 * 0.8 * 0.030 * 0.012, "H ch. V protuberance Cd 0.8 on 30 x 12 mm frontal beyond the boom (EST)", "printed PETG clamps, cad/params.txt", "booms")
    # ---- stopped lift rotors ----
    A_motor = MOTOR_D * MOTOR_H
    add("Lift motors (4), stopped, cylinder in cross-flow L/D 0.67", 4 * 0.63 * A_motor, "H fig. 3-12 short cylinder Cd 0.63; frontal 48 x 32 mm (cad/params.txt)", "", "rotors")
    add("Motor mounts (4)", 4 * 0.8 * 0.050 * 0.012, "H protuberance Cd 0.8 on 50 x 12 mm (EST)", "", "rotors")
    r_tip = D_LIFT_PROP / 2; A_blade_plan = 2 * 0.85 * r_tip * PROP_W      # two blades, 85 % of radius bladed (EST), width 35 mm
    pitch_in, dia_in = 5.5, 17.0
    beta75 = math.degrees(math.atan(pitch_in / (math.pi * 0.75 * dia_in)))
    cd_blade_plan = 0.06   # EST: blade at 90 deg azimuth meets the flow at its pitch angle (~8 deg): Cl ~0.5 at AR ~5 -> Cdi ~0.02 + Cf 0.015 + bluntness; parallel blades see ~Cf only. Average over random stop azimuth ~0.06
    add("Lift props (4), stopped, random azimuth", 4 * cd_blade_plan * A_blade_plan, f"EST Cd(planform) {cd_blade_plan}; blade pitch at 0.75R {beta75:.1f} deg (17x5.5)", "ArduPilot does not park props at a fixed azimuth without a sensor", "rotors")
    # ---- landing gear ----
    A_leg = LEG_OD * LEG_LEN; Re_leg = reynolds(V_CRUISE, LEG_OD)
    cd_leg = 1.0    # H ch. III: 2-D circular cylinder Cd 1.2 at subcritical Re (1e4-2e5); finite-length factor ~0.8 for L/D 8 (H fig. 3-12), one end on the boom, foot on the other -> 1.0 (EST)
    # v0.4: the CAD carries printed teardrop fairings on the legs (comp Gear_Fairing in cad/params.txt) -> they are the design case
    FAIRED = "comp=Gear_Fairing" in (REPO / "cad" / "params.txt").read_text()
    if FAIRED:
        add("Landing legs (4), teardrop fairings over the 25.4 mm tube", 4 * 0.10 * A_leg, "H ch. VI streamline strut Cd(frontal) ~0.1 (EST), frontal = tube OD x leg length", "printed PETG fairings (cad/params.txt Gear_Fairing)", "gear")
    else:
        add("Landing legs (4), round tube 25.4 mm x 205 mm in cross-flow", 4 * cd_leg * A_leg, f"H ch. III circular cylinder, subcritical Re {Re_leg:.1e}: 2-D Cd 1.2 x finite-length 0.8 (L/D 8) = 1.0 (EST)", "LARGEST SINGLE ITEM; a streamlined fairing (Cd ~0.1) removes ~90 %", "gear")
    add("Feet (4), TPU/foam pads", 4 * 0.8 * 0.030 * 0.015, "H protuberance Cd 0.8 on 30 x 15 mm (EST)", "", "gear")
    # ---- misc ----
    add("Pitot tube + boom", cf_turb(reynolds(V_CRUISE, PITOT_L)) * math.pi * PITOT_D * PITOT_L * 1.2 + 0.8 * 0.010 * 0.010, "R 12.27 axial cylinder + mount (EST)", "", "misc")
    sub = sum(i["CdA_m2"] for i in items)
    add("Leakage, hinges, horns, wires, antennas", 0.05 * sub, "R 12.5.6 leakage and protuberance 2-5 % (5 % EST for a taped foam build)", "", "misc")
    cda_total = sum(i["CdA_m2"] for i in items)
    cd0_total = cda_total / S_REF
    cd0_clean = sum(i["CdA_m2"] for i in items if i["group"] in ("wing", "tail", "pod", "gear", "misc")) / S_REF
    by_group = {}
    for i in items: by_group[i["group"]] = by_group.get(i["group"], 0) + i["dCD"]
    # ---- trimmed polar: fixed items + wing profile vs CL (XFOIL) + induced (AVL e) ----
    cd_fixed = (cda_total - cd_wing_xf * S_REF) / S_REF
    wing_pol = np.loadtxt(OUT / "xfoil_n2415_cruise_ncrit9.txt"); imax = int(np.argmax(wing_pol[:, 1])); wp = wing_pol[: imax + 1]; wp = wp[np.argsort(wp[:, 1])]
    CLs = np.linspace(0.1, 1.2, 45)
    CDs = np.array([cd_fixed + np.interp(c, wp[:, 1], wp[:, 2]) * S_exp / S_REF + c**2 / (math.pi * AR * e_inv) for c in CLs])
    LD = CLs / CDs
    k = (CLs >= 0.2) & (CLs <= 0.9)
    K, cd0_fit = np.polyfit(CLs[k] ** 2, CDs[k], 1)
    e_visc = 1 / (math.pi * AR * K)
    cd_cruise = float(np.interp(cl_cruise, CLs, CDs)); ld_cruise = cl_cruise / cd_cruise
    i_ld = int(np.argmax(LD))
    D_cruise = cd_cruise * Q_CRUISE * S_REF
    P_cruise = D_cruise * V_CRUISE / (BASE["etaProp"] * BASE["etaMEc"])
    # sizing comparison: same formula chain (model.js F6, F7)
    res = {
        "conditions": {"V_mps": V_CRUISE, "q_Pa": Q_CRUISE, "rho": RHO, "mu": MU, "S_ref_m2": S_REF, "AR": AR},
        "items": items, "by_group_dCD": by_group,
        "CdA_total_m2": cda_total, "CD0_total": cd0_total, "CD0_clean_airframe": cd0_clean,
        "CD0_rotors_booms": (cda_total - cd0_clean * S_REF) / S_REF,
        "CdA_per_boom_incl_clamps": sum(i["CdA_m2"] for i in items if i["group"] == "booms") / 2,
        "CdA_per_rotor_unit": sum(i["CdA_m2"] for i in items if i["group"] == "rotors") / 4,
        "wing_profile_estimates": {"raymer_FF_fully_turbulent": cd_wing_ff, "xfoil_ncrit9": cd_wing_xf, "xfoil_ncrit5": cd_wing_xf5, "su2_SA_fully_turbulent": cd_wing_su2,
                                   "su2_interpolated_between_alpha_deg": su2_pts or None,
                                   "note": "dCD on S_ref at section cl = cruise CL; exposed wing only; SU2 from converged medium-mesh points only (linear in CL between the two listed angles)"},
        "sizing": {"CD0_clean": CD0_CLEAN_SIZING, "CdA_boom": CDA_BOOM_SIZING, "CdA_rotor": CDA_ROTOR_SIZING, "CD0_total": CD0_TOTAL_SIZING, "e": E_SIZING,
                   "CL_cruise": cl_cruise, "LD_cruise": LD_SIZING, "P_cruise_W": SIZED["P_cruise"], "D_cruise_N": SIZED["D_cruise"]},
        "polar": {"CL": CLs.tolist(), "CD": CDs.tolist(), "LD": LD.tolist(), "e_inviscid_AVL": e_inv, "e_oswald_fit": float(e_visc), "CD0_fit": float(cd0_fit), "K_fit": float(K)},
        "cruise": {"CL": cl_cruise, "CD": cd_cruise, "LD": ld_cruise, "D_N": D_cruise, "P_elec_W": P_cruise, "etaProp": BASE["etaProp"], "etaMEc": BASE["etaMEc"],
                   "LD_max": float(LD[i_ld]), "CL_at_LDmax": float(CLs[i_ld]), "V_at_LDmax_mps": float(math.sqrt(2 * W / (RHO * S_REF * CLs[i_ld])))},
        "gear_faired_case": None,
    }
    # what-if: streamlined gear legs (Cd 0.1 on frontal, H ch. VI strut fairing t/c 0.3 ~ 0.06-0.1)
    cda_legs = 4 * cd_leg * A_leg; cda_faired = 4 * 0.10 * A_leg
    if FAIRED:   # the alternative is now the bare round legs
        cd_cruise_r = cd_cruise + (cda_legs - cda_faired) / S_REF
        res["gear_round_case"] = {"CdA_legs_round": cda_legs, "CdA_legs_faired": cda_faired, "CD_cruise": cd_cruise_r, "LD_cruise": cl_cruise / cd_cruise_r,
                                  "P_elec_W": cd_cruise_r * Q_CRUISE * S_REF * V_CRUISE / (BASE["etaProp"] * BASE["etaMEc"]),
                                  "source": "H ch. III circular cylinder Cd 1.0 (EST)"}
    cd_cruise_f = cd_cruise - (cda_legs - cda_faired) / S_REF * (0 if FAIRED else 1)
    res["gear_faired_case"] = {"CdA_legs_round": cda_legs, "CdA_legs_faired": cda_faired, "CD_cruise": cd_cruise_f, "LD_cruise": cl_cruise / cd_cruise_f,
                               "P_elec_W": cd_cruise_f * Q_CRUISE * S_REF * V_CRUISE / (BASE["etaProp"] * BASE["etaMEc"]),
                               "source": "H ch. VI streamline strut Cd(frontal) ~0.1 (EST)"}
    dump_json(OUT / "drag_buildup.json", res)
    print(f"  CD0 total {cd0_total:.4f} (sizing {CD0_TOTAL_SIZING:.4f}); clean airframe {cd0_clean:.4f} (sizing {CD0_CLEAN_SIZING}); rotors+booms {res['CD0_rotors_booms']:.4f}")
    print(f"  per boom CdA {res['CdA_per_boom_incl_clamps']*1e3:.2f}e-3 (sizing {CDA_BOOM_SIZING*1e3:.2f}e-3); per rotor unit {res['CdA_per_rotor_unit']*1e3:.2f}e-3 (sizing {CDA_ROTOR_SIZING*1e3:.2f}e-3)")
    print(f"  wing dCD: Raymer FF {cd_wing_ff:.4f}  XFOIL n9 {cd_wing_xf:.4f}  n5 {cd_wing_xf5:.4f}  SU2 SA {cd_wing_su2}")
    print(f"  cruise CL {cl_cruise:.3f}: CD {cd_cruise:.4f}  L/D {ld_cruise:.2f} (sizing {LD_SIZING:.2f})  D {D_cruise:.2f} N  P_elec {P_cruise:.0f} W (sizing {SIZED['P_cruise']:.0f} W)")
    print(f"  L/D max {LD[i_ld]:.2f} at CL {CLs[i_ld]:.2f} ({res['cruise']['V_at_LDmax_mps']:.1f} m/s); Oswald e fit {e_visc:.3f} (inviscid {e_inv:.3f}, sizing {E_SIZING})")
    print(f"  gear faired: L/D {res['gear_faired_case']['LD_cruise']:.2f}, P {res['gear_faired_case']['P_elec_W']:.0f} W")
    for g, v in by_group.items(): print(f"    {g:8s} dCD {v:.4f}")

if __name__ == "__main__":
    main()
