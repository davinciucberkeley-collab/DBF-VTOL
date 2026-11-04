#!/usr/bin/env python3
"""
battery_test.py - reduce a C11 discharge log (DBF-TP-001 rev B, test C11).

Input CSV columns (header required): t_s, volt_V, curr_A   (pack voltage under load, discharge current)
Optional column: step (any text) marking rows that belong to a step-load pulse; if absent, steps are
detected automatically as rows where current exceeds 1.5x the median discharge current.

Outputs:
  * delivered Ah and Wh (trapezoidal integration) down to the cut-off voltage (default 21.0 V = 3.50 V/cell)
  * time and energy at which the pack first crossed 3.50 V/cell
  * for each step load: V before, V during (min), dI, pack resistance R = dV/dI and per-cell R = R/6
  * minimum V/cell at the hover step (~41 A) and the transition step (~76 A)
  * pass/fail against C11: Wh >= 110 (0.8 x 144.3 x 0.95, calc), V/cell >= 3.4 at the 41 A hover step,
    V/cell >= 3.2 at the 76 A transition step, R_cell <= 7.3 mOhm (EST, (3.70-3.40)/41.2 A)
  * hot-day flag: R_cell > 5 mOhm = hot-day no-go (docs/research/thermal.md 6.4 item 2; TEST-PLAN.md C11, s6);
    not part of the C11 pass, printed with the max pack start temperature 60 - 3.9 x R_cell degC

Usage:  python battery_test.py sample/battery_sample.csv [--cells 6] [--cutoff-v 21.0] [--json out.json]
"""
from __future__ import annotations
import argparse, csv, json, statistics, sys

WH_PASS = 110.0       # TEST-PLAN.md C11 (calc)
V_HOVER_PASS = 3.40   # review 5 M4
V_TRANS_PASS = 3.20   # review 5 M4
R_CELL_PASS_MOHM = 7.3  # EST (calc (3.70-3.40)/41.25 A = 7.27, v0.4 at 6.55 kg)
R_CELL_HOTDAY_MOHM = 5.0  # docs/research/thermal.md 6.4 item 2: above this a pack is a hot-day no-go
K_PER_MOHM = 3.9      # mission pack rise per mOhm/cell (calc: 29.1 K at 7.5 mOhm/cell, thermal.md 5)
NAMEPLATE_WH = 144.3  # results.json packs[0].Wh
I_HOVER = 41.249      # results.json sized.I_hover (v0.4, 11.75 m/s stall target 2026-10-25)
I_TRANS = 75.737      # results.json sized.I_trans (v0.4, 11.75 m/s stall target 2026-10-25)


def read_csv(path):
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append(dict(t=float(r["t_s"]), v=float(r["volt_V"]), i=float(r["curr_A"]), step=(r.get("step") or "").strip()))
    rows.sort(key=lambda r: r["t"])
    return rows


def integrate(rows, cutoff_v):
    ah = wh = 0.0; t_cut = None; wh_cut = None; ah_cut = None
    for k in range(1, len(rows)):
        a, b = rows[k - 1], rows[k]
        dt_h = (b["t"] - a["t"]) / 3600.0
        ah += 0.5 * (a["i"] + b["i"]) * dt_h
        wh += 0.5 * (a["i"] * a["v"] + b["i"] * b["v"]) * dt_h
        if t_cut is None and b["v"] <= cutoff_v and b["step"] == "" and not b.get("auto_step"):
            t_cut, wh_cut, ah_cut = b["t"], wh, ah
    return ah, wh, t_cut, ah_cut, wh_cut


def find_steps(rows):
    """Group consecutive step rows; return list of (label, rows_in_step, row_before)."""
    base = [r["i"] for r in rows if r["step"] == "" and r["i"] > 0]
    med = statistics.median(base) if base else 0.0
    for r in rows:
        r["auto_step"] = (r["step"] == "" and med > 0 and r["i"] > 1.5 * med)
    steps = []; k = 0
    while k < len(rows):
        if rows[k]["step"] or rows[k]["auto_step"]:
            j = k; label = rows[k]["step"] or "auto"
            while j < len(rows) and (rows[j]["step"] == rows[k]["step"] if rows[k]["step"] else rows[j]["auto_step"]):
                j += 1
            before = rows[k - 1] if k > 0 else None
            steps.append((label, rows[k:j], before)); k = j
        else:
            k += 1
    return steps


def reduce(rows, cells, cutoff_v):
    ah, wh, t_cut, ah_cut, wh_cut = integrate(rows, cutoff_v)
    steps_out = []
    v_hover = v_trans = None
    for label, srows, before in find_steps(rows):
        i_step = max(r["i"] for r in srows); v_min = min(r["v"] for r in srows)
        v0 = before["v"] if before else None; i0 = before["i"] if before else 0.0
        di = i_step - i0
        r_pack = (v0 - v_min) / di if (v0 is not None and di > 0) else None
        d = dict(label=label, t0=srows[0]["t"], dur_s=srows[-1]["t"] - srows[0]["t"], I_A=i_step, V_before=v0, V_min=v_min,
                 Vcell_min=v_min / cells, dI_A=di, R_pack_mohm=(None if r_pack is None else 1000 * r_pack),
                 R_cell_mohm=(None if r_pack is None else 1000 * r_pack / cells))
        steps_out.append(d)
        if abs(i_step - I_HOVER) <= 0.35 * I_HOVER and (v_hover is None or d["Vcell_min"] < v_hover):
            v_hover = d["Vcell_min"]
        if abs(i_step - I_TRANS) <= 0.35 * I_TRANS and (v_trans is None or d["Vcell_min"] < v_trans):
            v_trans = d["Vcell_min"]
    r_cells = [s["R_cell_mohm"] for s in steps_out if s["R_cell_mohm"] is not None]
    r_cell = max(r_cells) if r_cells else None
    out = dict(points=len(rows), Ah_total=ah, Wh_total=wh, t_cutoff_s=t_cut, Ah_at_cutoff=ah_cut, Wh_at_cutoff=wh_cut,
               Wh_nameplate=NAMEPLATE_WH, usable_fraction=(None if wh_cut is None else wh_cut / NAMEPLATE_WH),
               steps=steps_out, Vcell_min_hover=v_hover, Vcell_min_trans=v_trans, R_cell_mohm_max=r_cell,
               pass_Wh=(wh_cut is not None and wh_cut >= WH_PASS),
               pass_hover_sag=(v_hover is not None and v_hover >= V_HOVER_PASS),
               pass_trans_sag=(v_trans is not None and v_trans >= V_TRANS_PASS),
               pass_R=(r_cell is not None and r_cell <= R_CELL_PASS_MOHM),
               hot_day_ok=(r_cell is not None and r_cell <= R_CELL_HOTDAY_MOHM),
               max_start_C_full_mission=(None if r_cell is None else 60.0 - K_PER_MOHM * r_cell))
    out["pass_all"] = all([out["pass_Wh"], out["pass_hover_sag"], out["pass_trans_sag"], out["pass_R"]])
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv"); ap.add_argument("--cells", type=int, default=6); ap.add_argument("--cutoff-v", type=float, default=21.0)
    ap.add_argument("--json")
    a = ap.parse_args(argv)
    rows = read_csv(a.csv)
    if len(rows) < 3:
        raise SystemExit("need at least 3 rows")
    r = reduce(rows, a.cells, a.cutoff_v)
    f = lambda x, d=2: "-" if x is None else f"{x:.{d}f}"
    pf = lambda b: "PASS" if b else "FAIL"
    print(f"battery_test.py  {a.csv}  ({r['points']} rows, {a.cells}S, cut-off {a.cutoff_v:.1f} V)")
    print(f"  delivered to cut-off: {f(r['Ah_at_cutoff'],3)} Ah, {f(r['Wh_at_cutoff'],1)} Wh at t = {f(r['t_cutoff_s'],0)} s "
          f"({f(100*(r['usable_fraction'] or 0),1)} % of nameplate {NAMEPLATE_WH} Wh); pass >= {WH_PASS:.0f} Wh: {pf(r['pass_Wh'])}")
    print(f"  whole log: {r['Ah_total']:.3f} Ah, {r['Wh_total']:.1f} Wh")
    for s in r["steps"]:
        print(f"  step '{s['label']}' at t={s['t0']:.0f}s {s['dur_s']:.0f}s: I {s['I_A']:.1f} A (dI {s['dI_A']:.1f}), V {f(s['V_before'])} -> {s['V_min']:.2f} V "
              f"= {s['Vcell_min']:.3f} V/cell; R_pack {f(s['R_pack_mohm'],1)} mOhm, R_cell {f(s['R_cell_mohm'],2)} mOhm")
    print(f"  hover step min V/cell {f(r['Vcell_min_hover'],3)} (pass >= {V_HOVER_PASS}): {pf(r['pass_hover_sag'])}")
    print(f"  transition step min V/cell {f(r['Vcell_min_trans'],3)} (pass >= {V_TRANS_PASS}): {pf(r['pass_trans_sag'])}")
    print(f"  R_cell max {f(r['R_cell_mohm_max'],2)} mOhm (pass <= {R_CELL_PASS_MOHM} EST): {pf(r['pass_R'])}")
    print(f"  hot day (R_cell <= {R_CELL_HOTDAY_MOHM} mOhm): {'OK' if r['hot_day_ok'] else 'NO-GO'}; max pack start temp for a full mission {f(r['max_start_C_full_mission'],1)} degC")
    print(f"  OVERALL: {pf(r['pass_all'])}")
    if a.json:
        with open(a.json, "w", encoding="utf-8") as fh:
            json.dump(r, fh, indent=1)
    return 0 if r["pass_all"] else 2


if __name__ == "__main__":
    sys.exit(main())
