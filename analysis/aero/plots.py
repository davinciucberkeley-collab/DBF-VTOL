"""PNG plots for the aerodynamic data package -> analysis/aero/plots/.  Reads only the out/*.json files."""
from __future__ import annotations
import json, csv, math
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from common import *
from su2_2d import read_history

plt.rcParams.update({"font.size": 10, "axes.grid": True, "grid.alpha": 0.3, "figure.dpi": 120, "savefig.bbox": "tight"})
C = {"xfoil": "#1f77b4", "nf": "#2ca02c", "su2": "#d62728", "su2lm": "#ff7f0e", "avl": "#9467bd", "asb": "#8c564b", "exp": "k", "sizing": "#7f7f7f"}

def load(name):
    f = OUT / name
    return json.loads(f.read_text()) if f.exists() else None

def polars():
    xf, nf, su2 = load("xfoil_polars.json"), load("neuralfoil_polars.json"), load("su2_2d.json")
    fig, ax = plt.subplots(1, 3, figsize=(15, 4.6))
    for name, ls in (("stall", ":"), ("transition", "--"), ("cruise", "-")):
        k = f"n2415_{name}_ncrit9"
        t = np.array(xf["cases"][k]["table"]); Re = xf["cases"][k]["Re"]
        ax[0].plot(t[:, 0], t[:, 1], ls, color=C["xfoil"], label=f"XFOIL Re {Re:.2g}")
        ax[1].plot(t[:, 2], t[:, 1], ls, color=C["xfoil"], label=f"XFOIL Re {Re:.2g}")
        ax[2].plot(t[:, 0], t[:, 4], ls, color=C["xfoil"], label=f"XFOIL Re {Re:.2g}")
        n = nf["cases"][k]
        ax[0].plot(n["alpha_deg"], n["CL"], ls, color=C["nf"], alpha=0.8, label=f"NeuralFoil Re {Re:.2g}")
        ax[1].plot(n["CD"], n["CL"], ls, color=C["nf"], alpha=0.8)
    k5 = xf["cases"]["n2415_cruise_ncrit5"]; t5 = np.array(k5["table"])
    ax[0].plot(t5[:, 0], t5[:, 1], "-", color="#17becf", lw=1, label="XFOIL cruise Ncrit 5")
    ax[1].plot(t5[:, 2], t5[:, 1], "-", color="#17becf", lw=1)
    if su2:
        for m, col, lab in (("SA", C["su2"], "SU2 RANS SA (fully turb.)"), ("SSTLM", C["su2lm"], "SU2 RANS SST-LM (transition)")):
            p = su2.get(f"polar_L2_{m}", [])
            if p:
                a = np.array([[r["alpha_deg"], r["CL"], r["CD"], r["CM"], r["converged"]] for r in p])
                ok = a[:, 4] > 0.5
                ax[0].plot(a[:, 0], a[:, 1], "o-", color=col, ms=4, label=lab)
                ax[0].plot(a[~ok, 0], a[~ok, 1], "x", color=col, ms=9, mew=2, label=f"{m}: unsteady/unconverged" if (~ok).any() else None)
                ax[1].plot(a[:, 2], a[:, 1], "o-", color=col, ms=4, label=lab)
                ax[2].plot(a[:, 0], a[:, 3], "o-", color=col, ms=4, label=lab)
    ax[0].plot([12], [1.3], "*", color=C["exp"], ms=12, label="Exp. Genc et al. 2008, Re 2e5 (CLmax 1.3 @ 12 deg)")
    ax[0].axhline(CL_MAX_SIZING, color=C["sizing"], ls="-.", label=f"sizing CLmax {CL_MAX_SIZING}")
    ax[0].set(xlabel="alpha [deg]", ylabel="section CL", title="NACA 2415 lift curve", xlim=(-9, 23), ylim=(-0.9, 1.6))
    ax[1].set(xlabel="section CD", ylabel="section CL", title="Drag polar", xlim=(0, 0.06), ylim=(-0.9, 1.6))
    ax[2].set(xlabel="alpha [deg]", ylabel="Cm c/4", title="Pitching moment", xlim=(-9, 23))
    ax[0].legend(fontsize=7, loc="lower right"); ax[1].legend(fontsize=7, loc="lower right"); ax[2].legend(fontsize=7)
    speeds = ", ".join(f"{k} {v['V']:g}" for k, v in CONDITIONS.items())
    fig.suptitle(f"Wing section polars: XFOIL 6.99 vs NeuralFoil vs SU2 8.5.0 RANS (chord {CHORD:.3f} m; {speeds} m/s)")
    fig.savefig(PLOTS / "section_polars.png"); plt.close(fig)

def tail_polar():
    xf, nf = load("xfoil_polars.json"), load("neuralfoil_polars.json")
    fig, ax = plt.subplots(1, 2, figsize=(10, 4.2))
    for name, ls in (("stall", ":"), ("cruise", "-")):
        k = f"n0009_tail_{name}_ncrit9"
        if k in xf["cases"]:
            t = np.array(xf["cases"][k]["table"]); Re = xf["cases"][k]["Re"]
            ax[0].plot(t[:, 0], t[:, 1], ls, color=C["xfoil"], label=f"XFOIL Re {Re:.2g}"); ax[1].plot(t[:, 2], t[:, 1], ls, color=C["xfoil"], label=f"XFOIL Re {Re:.2g}")
        n = nf["cases"][k]
        ax[0].plot(n["alpha_deg"], n["CL"], ls, color=C["nf"], label=f"NeuralFoil Re {n['Re']:.2g}"); ax[1].plot(n["CD"], n["CL"], ls, color=C["nf"])
    ax[0].set(xlabel="alpha [deg]", ylabel="CL", title=f"NACA 0009 tail section (chord {H_CHORD*1e3:.0f} mm)"); ax[1].set(xlabel="CD", ylabel="CL", title="Tail section drag polar", xlim=(0, 0.08))
    ax[0].legend(fontsize=8); ax[1].legend(fontsize=8)
    fig.savefig(PLOTS / "tail_section_polars.png"); plt.close(fig)

def cp():
    su2 = load("su2_2d.json")
    fig, axes = plt.subplots(1, 3, figsize=(15, 4.4))
    for ax, a in zip(axes, (2, 8, 12)):
        f = OUT / f"xfoil_cp_n2415_cruise_ncrit9_a{a}.txt"
        if f.exists():
            d = np.loadtxt(f, skiprows=3)   # XFOIL CPWR: 2 header lines + '#    x        y        Cp'
            ax.plot(d[:, 0], d[:, 2], "-", color=C["xfoil"], label="XFOIL (transitional, Ncrit 9)")
        if su2:
            # medium mesh if that case is usable, else the fine mesh (su2_2d.json cp holds usable cases only)
            for k, lab in ((f"L2_SA_a{a}", "SU2 RANS SA (medium mesh)"), (f"L3_SA_a{a}", "SU2 RANS SA (fine mesh)")):
                if k in su2.get("cp", {}):
                    c = su2["cp"][k]; x, y, cpv = np.array(c["x"]), np.array(c["y"]), np.array(c["Cp"])
                    o = np.argsort(np.arctan2(y - 0.0, x - 0.5)); ax.plot(x[o], cpv[o], ".", color=C["su2"], ms=2.5, label=lab)
                    break
            k = f"L2_SSTLM_a{a}"
            if k in su2.get("cp", {}):
                c = su2["cp"][k]; x, y, cpv = np.array(c["x"]), np.array(c["y"]), np.array(c["Cp"])
                o = np.argsort(np.arctan2(y, x - 0.5)); ax.plot(x[o], cpv[o], ".", color=C["su2lm"], ms=2.5, label="SU2 RANS SST-LM")
        ax.invert_yaxis(); ax.set(xlabel="x/c", ylabel="Cp", title=f"alpha = {a} deg, Re {CONDITIONS['cruise']['Re']/1e5:.2f}e5"); ax.legend(fontsize=7)
    fig.suptitle("NACA 2415 surface pressure: XFOIL vs SU2")
    fig.savefig(PLOTS / "cp_distributions.png"); plt.close(fig)

def convergence():
    su2 = load("su2_2d.json")
    if not su2: return
    fig, ax = plt.subplots(1, 2, figsize=(12, 4.2))
    for name in ("L2_SA_ap02.0", "L3_SA_ap02.0", "L2_SA_ap10.0", "L2_SA_ap14.0", "L2_SA_ap16.0", "L2_SSTLM_ap02.0"):
        h = OUT / "su2" / name / "history.csv"
        if not h.exists(): continue
        hdr, d = read_history(h)         # tolerant of MSVC '-nan(ind)' / 'inf' text
        it = d[:, hdr.index("Inner_Iter")]
        tag = "" if name in su2.get("cases", {}) else " (unusable)"
        ax[0].plot(it, d[:, hdr.index("rms[P]")], label=name + tag); ax[1].plot(it, d[:, hdr.index("CL")], label=name + tag)
    ax[0].set(xlabel="iteration", ylabel="log10 rms(P)", title="SU2 residual history"); ax[1].set(xlabel="iteration", ylabel="CL", title="Lift history", ylim=(-0.5, 1.8))
    ax[0].legend(fontsize=7); ax[1].legend(fontsize=7)
    fig.savefig(PLOTS / "su2_convergence.png"); plt.close(fig)

def mesh_study():
    su2 = load("su2_2d.json")
    if not su2 or not su2.get("mesh_study"): return
    fig, ax = plt.subplots(1, 2, figsize=(11, 4.2))
    for key, ms in su2["mesh_study"].items():
        Ls = [L for L in (1, 2, 3) if ms["CL"][f"L{L}"] is not None]     # unusable levels are null in su2_2d.json
        N = np.array([ms["cells"][f"L{L}"] for L in Ls], float); h = 1 / np.sqrt(N)
        cl = [ms["CL"][f"L{L}"] for L in Ls]; cd = [ms["CD"][f"L{L}"] for L in Ls]
        miss = [L for L in (1, 2, 3) if L not in Ls]
        lab = f"{key.replace('_', ' ')} deg" + (f" (L{', L'.join(map(str, miss))} unusable)" if miss else "")
        ax[0].plot(h, cl, "o-", label=lab); ax[1].plot(h, cd, "o-", label=lab)
        for i, L in enumerate(Ls):
            ax[0].annotate(f"L{L}", (h[i], cl[i]), fontsize=7, xytext=(3, 3), textcoords="offset points")
        if ms["GCI_CL"].get("f_ext") is not None: ax[0].plot(0, ms["GCI_CL"]["f_ext"], "k*", ms=8)
        if ms["GCI_CD"].get("f_ext") is not None: ax[1].plot(0, ms["GCI_CD"]["f_ext"], "k*", ms=8)
    ax[0].set(xlabel="h ~ 1/sqrt(N cells)", ylabel="CL", title="Mesh study, CL (star: Richardson extrapolation)"); ax[1].set(xlabel="h ~ 1/sqrt(N cells)", ylabel="CD", title="Mesh study, CD")
    ax[0].legend(fontsize=8); ax[1].legend(fontsize=8); ax[0].set_xlim(left=0); ax[1].set_xlim(left=0)
    fig.savefig(PLOTS / "su2_mesh_study.png"); plt.close(fig)

def span_loading():
    avl = load("avl_results.json")
    fig, ax = plt.subplots(figsize=(8, 4.2))
    for tag, col in (("pod", C["avl"]), ("nopod", "#c5b0d5")):
        sl = avl[tag]["span_loading_trim"]
        for sname, strips in sl.items():
            if not sname.startswith("Wing"): continue
            y = np.array([s["y"] for s in strips]); cl = np.array([s["cl"] for s in strips]); ccl = np.array([s["c_cl"] for s in strips])
            o = np.argsort(y)
            ax.plot(y[o] / (SPAN / 2), cl[o], "-", color=col, label=f"AVL section cl, trim at cruise ({'with pod' if tag=='pod' else 'no pod'})")
            if tag == "pod": ax.plot(y[o] / (SPAN / 2), ccl[o] / CHORD, "--", color=col, label="AVL c·cl / c (loading)")
    CLt = avl["pod"]["trim_cruise"]["CL"]
    eta = np.linspace(-1, 1, 200); ax.plot(eta, CLt * 4 / math.pi * np.sqrt(1 - eta**2), ":", color="k", label="elliptic, same CL")
    ax.set(xlabel="2y/b", ylabel="cl", title=f"Wing span loading at trimmed cruise CL {CLt:.3f} (AVL)"); ax.legend(fontsize=8)
    fig.savefig(PLOTS / "span_loading.png"); plt.close(fig)

def drag_breakdown():
    d = load("drag_buildup.json")
    items = sorted(d["items"], key=lambda i: -i["dCD"])
    fig, ax = plt.subplots(figsize=(10, 5.2))
    names = [i["component"][:52] for i in items]; vals = [i["dCD"] for i in items]
    cols = {"wing": "#1f77b4", "tail": "#17becf", "pod": "#2ca02c", "booms": "#bcbd22", "rotors": "#ff7f0e", "gear": "#d62728", "misc": "#7f7f7f"}
    ax.barh(names[::-1], vals[::-1], color=[cols[i["group"]] for i in items][::-1])
    for i, v in enumerate(vals[::-1]): ax.text(v + 0.0005, i, f"{v:.4f}", va="center", fontsize=7)
    ax.axvline(0, color="k", lw=0.5)
    ax.set(xlabel=f"ΔCD0 on S_ref = {d['conditions']['S_ref_m2']:.3f} m²", title=f"Cruise parasite drag build-up: CD0 = {d['CD0_total']:.4f} (sizing assumed {d['sizing']['CD0_total']:.4f})")
    ax.tick_params(axis="y", labelsize=7)
    fig.savefig(PLOTS / "drag_breakdown.png"); plt.close(fig)
    # pie by group
    fig, ax = plt.subplots(figsize=(5.5, 5.5))
    g = d["by_group_dCD"]; ax.pie(g.values(), labels=[f"{k} {v:.4f}" for k, v in g.items()], colors=[cols[k] for k in g], startangle=90, textprops={"fontsize": 8})
    ax.set_title("CD0 by group"); fig.savefig(PLOTS / "drag_pie.png"); plt.close(fig)

def aircraft_polar():
    d = load("drag_buildup.json"); p = d["polar"]
    CL = np.array(p["CL"]); CD = np.array(p["CD"]); LD = np.array(p["LD"])
    V = np.sqrt(2 * W / (RHO * S_REF * CL))
    fig, ax = plt.subplots(1, 2, figsize=(11, 4.2))
    ax[0].plot(CD, CL, "-", color=C["avl"], label="build-up (XFOIL profile + AVL induced + components)")
    CDs = d["sizing"]["CD0_total"] + CL**2 / (math.pi * AR * d["sizing"]["e"])
    ax[0].plot(CDs, CL, "--", color=C["sizing"], label=f"sizing.mjs polar (CD0 {d['sizing']['CD0_total']:.3f}, e {d['sizing']['e']:.2f})")
    # the alternative gear: bare round legs when the design case is faired (drag_buildup gear_round_case), else faired legs
    gf = d["gear_faired_case"]; dleg = (gf["CdA_legs_round"] - gf["CdA_legs_faired"]) / S_REF
    dgear, glab = (dleg, "round gear legs") if d.get("gear_round_case") else (-dleg, "faired gear legs")
    ax[0].plot(CD + dgear, CL, ":", color="#2ca02c", label=f"with {glab}")
    ax[0].axhline(CL_CRUISE_SIZING, color="k", lw=0.5); ax[0].text(0.01, CL_CRUISE_SIZING + 0.02, f"cruise CL {CL_CRUISE_SIZING:.3f}", fontsize=7, transform=ax[0].get_yaxis_transform())
    ax[0].set(xlabel="CD", ylabel="CL", title="Whole-aircraft drag polar (trimmed, stopped rotors)"); ax[0].legend(fontsize=7)
    ax[1].plot(V, LD, "-", color=C["avl"], label="build-up"); ax[1].plot(V, CL / CDs, "--", color=C["sizing"], label="sizing polar")
    ax[1].plot(V, CL / (CD + dgear), ":", color="#2ca02c", label=glab)
    ax[1].axvline(V_CRUISE, color="k", lw=0.5); ax[1].axvline(V_STALL_REQ, color="r", lw=0.5); ax[1].text(V_STALL_REQ + 0.2, 1, f"R11 Vs {V_STALL_REQ:g}", fontsize=7, color="r")
    ax[1].set(xlabel=f"V [m/s] at MTOW {MTOW:.2f} kg", ylabel="L/D", title="L/D vs speed", xlim=(10, 28)); ax[1].legend(fontsize=7)
    fig.savefig(PLOTS / "aircraft_polar.png"); plt.close(fig)

def stability():
    avl = load("avl_results.json"); asb = load("asb_results.json")
    fig, ax = plt.subplots(1, 2, figsize=(11, 4.2))
    for tag, col, lab in (("pod", C["avl"], "AVL with pod"), ("nopod", "#c5b0d5", "AVL no pod")):
        s = avl[tag]["sweep"]; a = [r["Alpha"] for r in s]; cl = [r["CLtot"] for r in s]; cm = [r["Cmtot"] for r in s]
        ax[0].plot(a, cl, "o-", color=col, ms=3, label=lab); ax[1].plot(cl, cm, "o-", color=col, ms=3, label=lab)
    if asb:
        v = asb["vlm"]; ax[0].plot([r["alpha_deg"] for r in v], [r["CL"] for r in v], "s--", color=C["asb"], ms=3, label="AeroSandbox VLM (no pod)")
        ax[1].plot([r["CL"] for r in v], [r["Cm"] for r in v], "s--", color=C["asb"], ms=3, label="AeroSandbox VLM")
        b = asb["aerobuildup"]; ax[0].plot([r["alpha_deg"] for r in b], [r["CL"] for r in b], "^:", color="#e377c2", ms=3, label="AeroSandbox AeroBuildup (viscous, 12 m/s)")
    ax[0].set(xlabel="alpha [deg]", ylabel="CL (aircraft)", title="Aircraft lift curve, elevator 0"); ax[0].legend(fontsize=7)
    ax[1].axhline(0, color="k", lw=0.5); ax[1].set(xlabel="CL", ylabel=f"Cm about CG ({100*CG_FRAC:.0f} % MAC)", title=f"Pitch stiffness about the {100*CG_FRAC:.0f} % CG"); ax[1].legend(fontsize=7)
    fig.savefig(PLOTS / "stability.png"); plt.close(fig)
    # NP / CG bar
    fig, ax = plt.subplots(figsize=(9, 2.6))
    pts = [("CG fwd (batt +30 mm)", CG["pctFwd"], "#2ca02c"), ("CG target", 100 * CG_FRAC, "#2ca02c"), ("CG aft (batt -30 mm)", CG["pctAft"], "#2ca02c"),
           ("CG no payload", CG["pct"]["noPayload"], "#ff7f0e"), ("NP sizing (Helmbold)", GEO["hn"] * 100, C["sizing"]),
           ("NP repo VLM", json.loads((REPO / "analysis" / "aero.json").read_text())["neutral_point_pct_mac"], C["sizing"]), ("NP AVL no pod", avl["nopod"]["NP_pct_MAC"], "#c5b0d5"), ("NP AVL with pod", avl["pod"]["NP_pct_MAC"], C["avl"])]
    if asb: pts.append(("NP AeroSandbox VLM", asb["summary"]["vlm_NP_pct_MAC"], C["asb"]))
    pts.sort(key=lambda p: p[1]); offs = [16, -34, 44, -62]
    for i, (n, x, c) in enumerate(pts):
        ax.plot([x], [0], "|", color=c, ms=22, mew=3); ax.annotate(f"{n}\n{x:.1f} %", (x, 0), xytext=(0, offs[i % 4]), textcoords="offset points", ha="center", fontsize=6.5, color=c)
    ax.set(xlim=(20, 56), ylim=(-1, 1), yticks=[], xlabel="% MAC aft of wing LE", title="CG range and neutral point estimates")
    fig.savefig(PLOTS / "cg_np.png"); plt.close(fig)

if __name__ == "__main__":
    for fn in (polars, tail_polar, cp, convergence, mesh_study, span_loading, drag_breakdown, aircraft_polar, stability):
        try:
            fn(); print(f"  plot {fn.__name__} ok")
        except Exception as e:
            print(f"  plot {fn.__name__} FAILED: {e!r}")
