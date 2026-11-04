#!/usr/bin/env python3
"""
log_summary.py - summarise an ArduPilot flight log for the DBF-TP-001 flight cards.

Reads either
  * a DataFlash binary .bin (needs pymavlink: pip install pymavlink), or
  * a Mission Planner / MAVExplorer text export .log (comma-separated lines starting with the message
    name; FMT lines give the column names; this parser needs no extra package).
If pymavlink is missing and a .bin is given, the script says so and exits 3 with the text-export hint.

Reports (per flight and per flight mode):
  * mode timeline (MODE messages) and phase durations: hover (Q modes), transition (QTUN.TrnMs or the
    FBWA/CRUISE segment until airspeed >= AIRSPEED_MIN), cruise (fixed-wing modes), with R10 checks
  * hover throttle: mean QTUN.ThO (fallback: mean of RCOU C5..C8 normalised 1000-2000) in Q modes
  * front/rear and left/right lift output split (RCOU C5..C8, ArduPilot quad X order from
    firmware/vtol_c0.param: C5 front-right, C6 rear-left, C7 front-left, C8 rear-right)
  * lift outputs in fixed-wing modes: fraction of samples at <= 1050 us (R1 'stopped in cruise')
  * VIBE: max VibeX/Y/Z, final clip counts (pass < 30 m/s2, clip 0; ardupilot.org measuring vibration)
  * BAT: min Volt, mean/max Curr per mode, CurrTot and EnrgTot at the end (R10 reserve check)
  * ARSP/CTUN airspeed: mean/min/max per fixed-wing mode and airspeed-vs-GPS ground speed ratio
  * ATT: max |Roll-DesRoll|, |Pitch-DesPitch| per mode (abort criterion 15 deg)

Usage:  python log_summary.py flight.log [--airspeed-min 16] [--capacity-mah 6500] [--json out.json]
        python log_summary.py flight.bin  (pymavlink)
"""
from __future__ import annotations
import argparse, json, os, sys
from collections import defaultdict

Q_MODES = {17: "QSTABILIZE", 18: "QHOVER", 19: "QLOITER", 20: "QLAND", 21: "QRTL", 22: "QAUTOTUNE", 23: "QACRO", 25: "LOITER_TO_QLAND"}
FW_MODES = {0: "MANUAL", 1: "CIRCLE", 2: "STABILIZE", 3: "TRAINING", 4: "ACRO", 5: "FBWA", 6: "FBWB", 7: "CRUISE", 8: "AUTOTUNE",
            10: "AUTO", 11: "RTL", 12: "LOITER", 15: "GUIDED", 24: "THERMAL"}
MODE_NAMES = {**Q_MODES, **FW_MODES}
VIBE_PASS = 30.0
ATT_ERR_PASS = 15.0


# ---------------------------------------------------------------- readers
def read_text_log(path):
    """Mission Planner text export: 'FMT, Type, Length, Name, Format, Columns' then 'NAME, v1, v2, ...'."""
    fmt = {}; msgs = defaultdict(list)
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            parts = [p.strip() for p in line.rstrip("\n").split(",")]
            if len(parts) < 2:
                continue
            name = parts[0]
            if name == "FMT" and len(parts) >= 6:
                fmt[parts[3]] = parts[5:]
                continue
            cols = fmt.get(name)
            if not cols:
                continue
            vals = {}
            for c, v in zip(cols, parts[1:]):
                try:
                    vals[c] = float(v)
                except ValueError:
                    vals[c] = v
            msgs[name].append(vals)
    return msgs


def read_bin_log(path):
    try:
        from pymavlink import mavutil  # type: ignore
    except ImportError:
        print("pymavlink is not installed: 'pip install pymavlink', or export the .bin as a text .log from "
              "Mission Planner (DataFlash Logs > Create Matlab/Text file) and run this script on the .log.", file=sys.stderr)
        sys.exit(3)
    m = mavutil.mavlink_connection(path)
    msgs = defaultdict(list)
    want = {"MODE", "QTUN", "RCOU", "VIBE", "BAT", "ARSP", "CTUN", "GPS", "ATT", "MSG", "EV"}
    while True:
        msg = m.recv_match(type=list(want), blocking=False)
        if msg is None:
            break
        d = msg.to_dict(); d.pop("mavpackettype", None)
        msgs[msg.get_type()].append(d)
    return msgs


# ---------------------------------------------------------------- helpers
def t_of(r):
    for k in ("TimeUS", "TimeMS"):
        if k in r:
            return r[k] / (1e6 if k == "TimeUS" else 1e3)
    return None


def mode_segments(msgs):
    """List of (t0, t1, mode_num, name) from MODE messages; t1 of the last = last timestamp seen."""
    modes = msgs.get("MODE", [])
    t_end = 0.0
    for name, rows in msgs.items():
        for r in rows[-1:]:
            tt = t_of(r)
            if tt:
                t_end = max(t_end, tt)
    segs = []
    for k, r in enumerate(modes):
        t0 = t_of(r); mn = int(r.get("ModeNum", r.get("Mode", -1)))
        t1 = t_of(modes[k + 1]) if k + 1 < len(modes) else t_end
        segs.append((t0, t1, mn, MODE_NAMES.get(mn, str(mn))))
    return segs


def in_seg(rows, seg):
    return [r for r in rows if seg[0] <= (t_of(r) or -1) < seg[1]]


def stats(vals):
    vals = [v for v in vals if isinstance(v, (int, float))]
    if not vals:
        return dict(n=0, mean=None, min=None, max=None)
    return dict(n=len(vals), mean=sum(vals) / len(vals), min=min(vals), max=max(vals))


# ---------------------------------------------------------------- reduce
def reduce(msgs, airspeed_min, capacity_mah):
    segs = mode_segments(msgs)
    out = dict(modes=[], hover=dict(), cruise=dict(), vibe=dict(), battery=dict(), airspeed=dict(), attitude=dict(), r10=dict())
    hover_s = 0.0; fw_s = 0.0; trans_s = None
    rcou = msgs.get("RCOU", []); qtun = msgs.get("QTUN", []); att = msgs.get("ATT", []); bat = msgs.get("BAT", [])
    arsp = msgs.get("ARSP", []); ctun = msgs.get("CTUN", []); gps = msgs.get("GPS", [])
    lift_cols = ["C5", "C6", "C7", "C8"]
    for seg in segs:
        t0, t1, mn, name = seg
        d = dict(mode=name, t0=t0, t1=t1, dur_s=t1 - t0)
        rc = in_seg(rcou, seg)
        if rc:
            means = {c: stats([r.get(c) for r in rc])["mean"] for c in lift_cols}
            d["lift_pwm_mean"] = means
            d["lift_norm_mean"] = sum((means[c] - 1000) / 1000 for c in lift_cols) / 4 if all(means[c] is not None for c in lift_cols) else None
            front = (means["C5"] + means["C7"]) / 2; rear = (means["C6"] + means["C8"]) / 2
            left = (means["C6"] + means["C7"]) / 2; right = (means["C5"] + means["C8"]) / 2
            d["front_rear_split_pct"] = 100 * (front - rear) / ((front + rear) / 2 - 1000) if (front + rear) / 2 > 1000 else None
            d["left_right_split_pct"] = 100 * (left - right) / ((left + right) / 2 - 1000) if (left + right) / 2 > 1000 else None
            d["lift_stopped_frac"] = sum(1 for r in rc if all(r.get(c, 2000) <= 1050 for c in lift_cols)) / len(rc)
        q = in_seg(qtun, seg)
        if q:
            d["qtun_ThO_mean"] = stats([r.get("ThO") for r in q])["mean"]
            trn = [r.get("TrnMs") for r in q if isinstance(r.get("TrnMs"), (int, float))]
            if trn and max(trn) > 0:
                d["transition_ms_max"] = max(trn); trans_s = max(trans_s or 0, max(trn) / 1000)
        b = in_seg(bat, seg)
        if b:
            d["bat_volt_min"] = stats([r.get("Volt") for r in b])["min"]
            cs = stats([r.get("Curr") for r in b]); d["bat_curr_mean"] = cs["mean"]; d["bat_curr_max"] = cs["max"]
        a = in_seg(att, seg)
        if a:
            d["roll_err_max"] = max((abs(r.get("Roll", 0) - r.get("DesRoll", 0)) for r in a), default=None)
            d["pitch_err_max"] = max((abs(r.get("Pitch", 0) - r.get("DesPitch", 0)) for r in a), default=None)
        if mn in FW_MODES:
            asp = [r.get("Airspeed") for r in in_seg(arsp, seg)] or [r.get("As") for r in in_seg(ctun, seg)]
            d["airspeed"] = stats(asp)
            g = stats([r.get("Spd") for r in in_seg(gps, seg)])
            d["groundspeed"] = g
            if d["airspeed"]["mean"] and g["mean"]:
                d["airspeed_over_gps"] = d["airspeed"]["mean"] / g["mean"]
            # transition time from segment start until airspeed >= airspeed_min (first FW segment only)
            if trans_s is None and asp:
                rows = in_seg(arsp, seg) or in_seg(ctun, seg)
                key = "Airspeed" if rows and "Airspeed" in rows[0] else "As"
                for r in rows:
                    if (r.get(key) or 0) >= airspeed_min:
                        trans_s = t_of(r) - t0; break
            fw_s += d["dur_s"]
        elif mn in Q_MODES:
            hover_s += d["dur_s"]
        out["modes"].append(d)
    # hover summary across Q modes
    qsegs = [m for m in out["modes"] if m["mode"] in Q_MODES.values()]
    tho = [m["qtun_ThO_mean"] for m in qsegs if m.get("qtun_ThO_mean") is not None]
    lift = [m["lift_norm_mean"] for m in qsegs if m.get("lift_norm_mean") is not None]
    out["hover"] = dict(total_s=hover_s, ThO_mean=(sum(tho) / len(tho) if tho else None),
                        lift_norm_mean=(sum(lift) / len(lift) if lift else None),
                        front_rear_split_pct=max((abs(m["front_rear_split_pct"]) for m in qsegs if m.get("front_rear_split_pct") is not None), default=None))
    fwsegs = [m for m in out["modes"] if m["mode"] in FW_MODES.values()]
    # the first fixed-wing segment holds the forward transition (lift motors still running), so the
    # R1 "stopped in cruise" check and the cruise current use the later fixed-wing segments only
    cruise_segs = fwsegs[1:] if len(fwsegs) > 1 else fwsegs
    wsum = sum(m["dur_s"] for m in cruise_segs if m.get("bat_curr_mean") is not None)
    out["cruise"] = dict(total_s=fw_s, transition_s=trans_s,
                         transition_seg=(fwsegs[0]["mode"] if fwsegs else None),
                         lift_stopped_frac_min=min((m["lift_stopped_frac"] for m in cruise_segs if "lift_stopped_frac" in m), default=None),
                         curr_mean=(sum(m["bat_curr_mean"] * m["dur_s"] for m in cruise_segs if m.get("bat_curr_mean") is not None) / wsum) if wsum else None)
    vibe = msgs.get("VIBE", [])
    if vibe:
        out["vibe"] = dict(x_max=stats([r.get("VibeX") for r in vibe])["max"], y_max=stats([r.get("VibeY") for r in vibe])["max"],
                           z_max=stats([r.get("VibeZ") for r in vibe])["max"],
                           clip_final=[vibe[-1].get(k) for k in ("Clip0", "Clip1", "Clip2")])
        vmax = max(v for v in (out["vibe"]["x_max"], out["vibe"]["y_max"], out["vibe"]["z_max"]) if v is not None)
        out["vibe"]["pass"] = vmax < VIBE_PASS and all((c or 0) == 0 for c in out["vibe"]["clip_final"])
    if bat:
        last = bat[-1]
        out["battery"] = dict(volt_min=stats([r.get("Volt") for r in bat])["min"], curr_max=stats([r.get("Curr") for r in bat])["max"],
                              currtot_mah=last.get("CurrTot"), enrgtot_wh=last.get("EnrgTot"))
        if last.get("CurrTot") is not None:
            out["battery"]["remaining_frac"] = 1 - last["CurrTot"] / capacity_mah
    att_err = [max(m.get("roll_err_max") or 0, m.get("pitch_err_max") or 0) for m in out["modes"]]
    out["attitude"] = dict(err_max=max(att_err) if att_err else None, pass_=(max(att_err) < ATT_ERR_PASS) if att_err else None)
    out["r10"] = dict(hover_ge_120s=hover_s >= 120, cruise_ge_600s=fw_s >= 600,
                      reserve_ge_20pct=(out["battery"].get("remaining_frac") or 0) >= 0.20 if bat else None)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("log"); ap.add_argument("--airspeed-min", type=float, default=16.0)
    ap.add_argument("--capacity-mah", type=float, default=6500.0); ap.add_argument("--json")
    a = ap.parse_args(argv)
    ext = os.path.splitext(a.log)[1].lower()
    msgs = read_bin_log(a.log) if ext == ".bin" else read_text_log(a.log)
    if not msgs:
        raise SystemExit("no messages parsed (text logs need FMT lines; see --help)")
    r = reduce(msgs, a.airspeed_min, a.capacity_mah)
    f = lambda x, d=2: "-" if x is None else (f"{x:.{d}f}" if isinstance(x, (int, float)) else str(x))
    print(f"log_summary.py  {a.log}  messages: " + ", ".join(f"{k}:{len(v)}" for k, v in sorted(msgs.items())))
    print("  mode timeline:")
    for m in r["modes"]:
        extra = []
        if m.get("qtun_ThO_mean") is not None: extra.append(f"ThO {m['qtun_ThO_mean']:.3f}")
        if m.get("lift_norm_mean") is not None: extra.append(f"lift {m['lift_norm_mean']:.3f}")
        if m.get("front_rear_split_pct") is not None: extra.append(f"F/R split {m['front_rear_split_pct']:+.1f}%")
        if m.get("lift_stopped_frac") is not None and m["mode"] in FW_MODES.values(): extra.append(f"lift stopped {100*m['lift_stopped_frac']:.0f}%")
        if m.get("bat_curr_mean") is not None: extra.append(f"I {m['bat_curr_mean']:.1f}/{m['bat_curr_max']:.1f} A, Vmin {m['bat_volt_min']:.2f}")
        if m.get("airspeed", {}).get("mean"): extra.append(f"AS {m['airspeed']['mean']:.1f} [{m['airspeed']['min']:.1f}-{m['airspeed']['max']:.1f}] m/s")
        if m.get("airspeed_over_gps"): extra.append(f"AS/GS {m['airspeed_over_gps']:.2f}")
        if m.get("roll_err_max") is not None: extra.append(f"att err {max(m['roll_err_max'], m['pitch_err_max']):.1f} deg")
        print(f"    {m['t0']:8.1f}-{m['t1']:8.1f}s {m['mode']:<12} {m['dur_s']:6.1f}s  " + "; ".join(extra))
    h = r["hover"]; c = r["cruise"]
    print(f"  hover: total {h['total_s']:.0f} s; QTUN.ThO mean {f(h['ThO_mean'],3)}; lift output mean {f(h['lift_norm_mean'],3)} "
          f"(pass < 0.60 review F2); F/R split max {f(h['front_rear_split_pct'],1)} % (pass <= 15 review 9 M2)")
    print(f"  cruise: total {c['total_s']:.0f} s; transition to {a.airspeed_min:.0f} m/s {f(c['transition_s'],1)} s (pass <= 15 review 10 M2); "
          f"lift stopped fraction min {f(c['lift_stopped_frac_min'],2)} (pass >= 0.95 R1); mean current {f(c['curr_mean'],1)} A (pass <= 18.6 A at 20 m/s, TEST-PLAN.md F08)")
    if r["vibe"]:
        v = r["vibe"]; print(f"  VIBE max X/Y/Z {f(v['x_max'],1)}/{f(v['y_max'],1)}/{f(v['z_max'],1)} m/s2, clip {v['clip_final']} -> {'PASS' if v['pass'] else 'FAIL'} (< 30, clip 0)")
    if r["battery"]:
        b = r["battery"]; print(f"  BAT: Vmin {f(b['volt_min'])} V, Imax {f(b['curr_max'],1)} A, used {f(b['currtot_mah'],0)} mAh / {f(b['enrgtot_wh'],1)} Wh, "
                                f"remaining {f(100*(b.get('remaining_frac') or 0),1)} % of {a.capacity_mah:.0f} mAh")
    print(f"  attitude error max {f(r['attitude']['err_max'],1)} deg -> {'PASS' if r['attitude']['pass_'] else 'FAIL'} (< 15)")
    r10 = r["r10"]; print(f"  R10: hover >= 120 s {r10['hover_ge_120s']}; cruise >= 600 s {r10['cruise_ge_600s']}; reserve >= 20 % {r10['reserve_ge_20pct']}")
    if a.json:
        with open(a.json, "w", encoding="utf-8") as fh:
            json.dump(r, fh, indent=1, default=str)
    return 0


if __name__ == "__main__":
    sys.exit(main())
