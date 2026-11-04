#!/usr/bin/env python3
"""
thrust_stand.py - reduce a C07/C09 thrust-stand sweep (DBF-TP-001 rev B, test C07).

Input CSV columns (header required, any order): throttle_pct, thrust_g, volt_V, curr_A
Optional: power_W (otherwise power = volt_V * curr_A).

Outputs (stdout, and --json <file>):
  * power-law fit thrust = a * throttle^b  (least squares in log space, points with thrust > 0)
  * Q_M_THST_EXPO estimate: ArduPilot's curve  thrust_norm = (1-expo)*x + expo*x^2  fitted to the
    normalised data (x = throttle fraction, thrust_norm = thrust / thrust at 100 %)
  * throttle, current and electrical power at the hover thrust (default 1637.9 g, results.json
    concepts.C0.sized.Tunit_g, v0.4, 11.75 m/s stall target 2026-10-25), by linear interpolation on the measured points
  * FM*eta at hover = P_ideal / P_elec, with P_ideal = T^1.5 / sqrt(2 rho A) (analysis/sizing.mjs
    hover model; A = 0.14643846 m2 for the 17 in disc, results.json sized.A), compared with the
    sizing value 0.516 (results.json sized.FMeta)
  * pass/fail against the C07 criteria: max thrust >= 2621 g (R13 strict: 1.6 x 6.5515 kg / 4), P_elec at hover <= 300 W,
    max current <= 36 A (EST)
  * comparison with the maker table (SunnySky X4110S 17x5.8, 22.2 V, docs/research/budget-lift.md A3)

Usage:  python thrust_stand.py sample/thrust_sample.csv [--hover-g 1637.9] [--rho 1.225] [--disc-d-m 0.4318] [--json out.json]
Dependencies: numpy (optional; pure-python fallback is used if numpy is missing).
"""
from __future__ import annotations
import argparse, csv, json, math, sys

MAKER_TABLE = [(1250, 6.1, 135), (1500, 8.1, 180), (2000, 13.1, 291), (3130, 27.7, 615)]  # g, A, W (budget-lift.md A3)
FMETA_SIZING = 0.5164014    # results.json concepts.C0.sized.FMeta (v0.4, 11.75 m/s stall target 2026-10-25)
HOVER_G_DEFAULT = 1637.8933 # results.json concepts.C0.sized.Tunit_g (v0.4, 11.75 m/s stall target 2026-10-25)
P_HOVER_MAX_W = 300.0       # TEST-PLAN.md C07: 1202 W / 4 rounded down (calc, v0.4 at 6.55 kg)
T_MAX_PASS_G = 2621.0       # R13 strict at MTOW 6.55 kg: 1.6 x 6551.5 / 4 (TEST-PLAN.md C07); review T2 said 2400
I_MAX_PASS_A = 36.0         # EST, 80 % of the 45 A ESC rating
G = 9.80665


def read_csv(path):
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            try:
                thr = float(r["throttle_pct"]); t = float(r["thrust_g"]); v = float(r["volt_V"]); i = float(r["curr_A"])
            except (KeyError, ValueError) as e:
                raise SystemExit(f"bad row {r}: {e}")
            p = float(r["power_W"]) if r.get("power_W") not in (None, "") else v * i
            rows.append(dict(thr=thr, t=t, v=v, i=i, p=p))
    rows.sort(key=lambda r: r["thr"])
    return rows


def linfit(xs, ys):
    n = len(xs); mx = sum(xs) / n; my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs); sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    b = sxy / sxx if sxx else 0.0
    return my - b * mx, b


def interp(x, xs, ys):
    """Linear interpolation; xs ascending. Returns None outside the range."""
    if x < xs[0] or x > xs[-1]:
        return None
    for k in range(1, len(xs)):
        if xs[k] >= x:
            x0, x1, y0, y1 = xs[k - 1], xs[k], ys[k - 1], ys[k]
            return y0 if x1 == x0 else y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return ys[-1]


def fit_expo(rows):
    """Least-squares expo for ArduPilot thrust curve  y = (1-e) x + e x^2  with y, x normalised."""
    tmax = max(r["t"] for r in rows); thr_max = max(r["thr"] for r in rows)
    num = den = 0.0
    for r in rows:
        if r["t"] <= 0:
            continue
        x = r["thr"] / thr_max; y = r["t"] / tmax
        # y - x = e (x^2 - x)  ->  e = sum((y-x)(x^2-x)) / sum((x^2-x)^2)
        num += (y - x) * (x * x - x); den += (x * x - x) ** 2
    return num / den if den else float("nan")


def reduce(rows, hover_g, rho, disc_d):
    pos = [r for r in rows if r["t"] > 0]
    a0, b = linfit([math.log(r["thr"]) for r in pos], [math.log(r["t"]) for r in pos])
    a = math.exp(a0)
    thr = [r["t"] for r in pos]; thrs = [r["thr"] for r in pos]; curr = [r["i"] for r in pos]; pw = [r["p"] for r in pos]
    # monotone in thrust for interpolation
    order = sorted(range(len(thr)), key=lambda k: thr[k])
    t_s = [thr[k] for k in order]; thr_s = [thrs[k] for k in order]; i_s = [curr[k] for k in order]; p_s = [pw[k] for k in order]
    thr_h = interp(hover_g, t_s, thr_s); i_h = interp(hover_g, t_s, i_s); p_h = interp(hover_g, t_s, p_s)
    A = math.pi * (disc_d / 2) ** 2
    T_N = hover_g / 1000 * G
    p_ideal = T_N ** 1.5 / math.sqrt(2 * rho * A)
    fmeta = p_ideal / p_h if p_h else None
    tmax = max(thr); imax = max(curr)
    maker = []
    for tg, ia, wa in MAKER_TABLE:
        im = interp(tg, t_s, i_s); pm = interp(tg, t_s, p_s)
        maker.append(dict(thrust_g=tg, maker_A=ia, maker_W=wa, meas_A=im, meas_W=pm,
                          dW_pct=(None if pm is None else 100 * (pm - wa) / wa)))
    out = dict(
        n_points=len(rows), fit_a=a, fit_b=b, q_m_thst_expo=fit_expo(pos),
        hover_g=hover_g, hover_throttle_pct=thr_h, hover_curr_A=i_h, hover_P_W=p_h,
        hover_P_ideal_W=p_ideal, FMeta=fmeta, FMeta_sizing=FMETA_SIZING,
        max_thrust_g=tmax, max_curr_A=imax, maker=maker,
        pass_max_thrust=tmax >= T_MAX_PASS_G, pass_hover_power=(p_h is not None and p_h <= P_HOVER_MAX_W),
        pass_max_current=imax <= I_MAX_PASS_A,
    )
    out["pass_all"] = all([out["pass_max_thrust"], out["pass_hover_power"], out["pass_max_current"]])
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv"); ap.add_argument("--hover-g", type=float, default=HOVER_G_DEFAULT)
    ap.add_argument("--rho", type=float, default=1.225); ap.add_argument("--disc-d-m", type=float, default=0.4318)
    ap.add_argument("--json")
    a = ap.parse_args(argv)
    rows = read_csv(a.csv)
    if len(rows) < 4:
        raise SystemExit("need at least 4 points")
    r = reduce(rows, a.hover_g, a.rho, a.disc_d_m)
    f = lambda x, d=1: "-" if x is None else f"{x:.{d}f}"
    print(f"thrust_stand.py  {a.csv}  ({r['n_points']} points)")
    print(f"  fit: thrust_g = {r['fit_a']:.4g} * throttle_pct^{r['fit_b']:.3f};  Q_M_THST_EXPO estimate {r['q_m_thst_expo']:.2f} (param file 0.72)")
    print(f"  hover {a.hover_g:.0f} g: throttle {f(r['hover_throttle_pct'])} %, current {f(r['hover_curr_A'])} A, P_elec {f(r['hover_P_W'],0)} W "
          f"(pass <= {P_HOVER_MAX_W:.0f} W: {'PASS' if r['pass_hover_power'] else 'FAIL'})")
    print(f"  P_ideal {r['hover_P_ideal_W']:.1f} W -> FM*eta {f(r['FMeta'],3)} vs sizing {FMETA_SIZING:.3f} "
          f"({'above' if (r['FMeta'] or 0) >= FMETA_SIZING else 'BELOW'} sizing)")
    print(f"  max thrust {r['max_thrust_g']:.0f} g (pass >= {T_MAX_PASS_G:.0f}: {'PASS' if r['pass_max_thrust'] else 'FAIL'}); "
          f"max current {r['max_curr_A']:.1f} A (pass <= {I_MAX_PASS_A:.0f}: {'PASS' if r['pass_max_current'] else 'FAIL'})")
    print("  vs maker table (17x5.8, 22.2 V): thrust_g  maker_A/W  measured_A/W  dW%")
    for m in r["maker"]:
        print(f"     {m['thrust_g']:5.0f}   {m['maker_A']:5.1f}/{m['maker_W']:4.0f}   {f(m['meas_A'])}/{f(m['meas_W'],0)}   {f(m['dW_pct'])}")
    print(f"  OVERALL: {'PASS' if r['pass_all'] else 'FAIL'}")
    if a.json:
        with open(a.json, "w", encoding="utf-8") as fh:
            json.dump(r, fh, indent=1)
    return 0 if r["pass_all"] else 2


if __name__ == "__main__":
    sys.exit(main())
