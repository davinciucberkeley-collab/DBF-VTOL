#!/usr/bin/env python3
"""
mission_test.py - scripted ArduPilot SITL rehearsal for the C0 QuadPlane parameter set.

What it does (each scenario starts from the ground, disarmed, at home):
  A  nominal : QLOITER take-off to 35 m -> AUTO loop (forward transition, 4 waypoints at 60 m)
               -> NAV_VTOL_LAND at home (back-transition + vertical land)
  B  rc_cruise : forward transition in FBWA, fixed-wing LOITER, then RC link lost -> expect RTL -> QRTL -> land
  C  rc_hover  : RC link lost while hovering in QLOITER at 15 m  -> expect QLAND
  D  trans_fail: FBWA selected with the throttle stick low, so the pusher never builds AIRSPEED_MIN
               -> expect QRTL after Q_TRANS_FAIL (15 s)
  E  batt_low  : fixed-wing LOITER, low-battery failsafe forced (BATT_LOW_MAH raised) -> expect RTL -> QRTL -> land
  F  fence     : climb in QLOITER through FENCE_ALT_MAX -> expect fence breach action (RTL)
  G  elrs_mav  : ELRS MAVLink-mode emulation. Receiver RC removed (SIM_RC_FAIL=1); RC arrives only as
               RC_CHANNELS_OVERRIDE, as the ELRS RX sends it (ExpressLRS src/src/rx-serial/SerialMavlink.cpp).
               Overrides stop in a 15 m hover (= link loss) -> expect QLAND after ~RC_OVERRIDE_TIME + RC_FS_TIMEOUT

It records mode, altitude, airspeed, groundspeed, throttle and status text, writes one CSV per scenario
and a summary (JSON + Markdown) to the output directory, and checks every parameter of the loaded files
against what the running firmware reports.

Usage (SITL already running, e.g. sim_vehicle.py -v ArduPlane -f quadplane in WSL/Linux):
  python mission_test.py --connect tcp:127.0.0.1:5760 --params ../vtol_c0.param sitl_overrides.param
Usage (launch the Windows SITL binary that Mission Planner uses, generic quadplane model):
  python mission_test.py --sitl-exe C:/path/ArduPlane.exe --defaults-base quadplane.parm \
         --params ../vtol_c0.param sitl_overrides.param --out results
Usage (C0 airframe model, ArduPilot JSON physics interface, firmware/sitl/c0_physics.py):
  python mission_test.py --sitl-exe C:/path/ArduPlane.exe --model JSON:127.0.0.1 --physics c0_physics.py \
         --defaults-base sitl_c0_defaults.parm --params ../vtol_c0.param sitl_c0_overrides.param \
         --out results_c0 --summary results_c0.json
Needs: pymavlink (pip install pymavlink).
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import re
import subprocess
import sys
import time

os.environ.setdefault("MAVLINK20", "1")   # 18-channel RC_CHANNELS_OVERRIDE needs the MAVLink 2 dialect
from pymavlink import mavutil

HOME = (37.9156, -122.3366, 5.0, 0.0)  # placeholder field location (lat, lon, alt m, heading); not the real site
MODE = {0: "MANUAL", 1: "CIRCLE", 2: "STABILIZE", 5: "FBWA", 6: "FBWB", 7: "CRUISE", 10: "AUTO", 11: "RTL",
        12: "LOITER", 17: "QSTABILIZE", 18: "QHOVER", 19: "QLOITER", 20: "QLAND", 21: "QRTL", 25: "LOITER_TO_QLAND"}
MODE_ID = {v: k for k, v in MODE.items()}
PHYSICS_CMD_PORT = 0   # set when an external physics model is launched (c0_physics.py listens on 9004)
RC_NEUTRAL = {1: 1500, 2: 1500, 3: 1000, 4: 1500, 5: 1500, 6: 1425, 7: 1000, 8: 1500}  # ch6 1425 = mode slot 3 (QLOITER)


def parse_param_file(path):
    out = {}
    for line in open(path, encoding="utf-8"):
        s = line.split("#", 1)[0].strip()
        if not s:
            continue
        parts = re.split(r"[,\s=]+", s)
        out[parts[0]] = float(parts[1])
    return out


class Sitl:
    def __init__(self, conn, out_dir):
        self.m = mavutil.mavlink_connection(conn, retries=120, source_system=255)
        self.m.wait_heartbeat(timeout=120)
        self.out_dir = out_dir
        self.rc = dict(RC_NEUTRAL)
        self.rc_enabled = True
        self.state = dict(mode="?", armed=False, alt=0.0, aspd=0.0, gspd=0.0, thr=0, lat=0.0, lon=0.0,
                          volt=0.0, curr=0.0, wp=0)
        self.rows, self.texts = [], []
        self.t0 = time.time()
        self.last_rc = 0.0
        self.sim_t = 0.0

    # -------------------------------------------------------------- low level
    def send_rc(self):
        if not self.rc_enabled:
            return
        ch = [self.rc.get(i, 0) for i in range(1, 19)]
        self.m.mav.rc_channels_override_send(self.m.target_system, self.m.target_component, *ch)

    def pump(self, seconds):
        end = time.time() + seconds
        while time.time() < end:
            if time.time() - self.last_rc > 0.04:  # 0.2 s sim at speedup 5; well inside RC_FS_TIMEOUT (1 s)
                self.send_rc()
                self.last_rc = time.time()
            msg = self.m.recv_match(blocking=True, timeout=0.02)
            if msg is None:
                continue
            t = msg.get_type()
            st = self.state
            if t == "HEARTBEAT" and msg.get_srcComponent() == 1 and msg.type != mavutil.mavlink.MAV_TYPE_GCS:
                st["mode"] = MODE.get(msg.custom_mode, str(msg.custom_mode))
                st["armed"] = bool(msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED)
            elif t == "GLOBAL_POSITION_INT":
                st["alt"] = msg.relative_alt / 1000.0
                st["lat"], st["lon"] = msg.lat / 1e7, msg.lon / 1e7
                self.sim_t = msg.time_boot_ms / 1000.0
                n, e = self.ne_home()
                self.rows.append(dict(t=round(self.sim_t, 2), mode=st["mode"], armed=int(st["armed"]),
                                      alt=round(st["alt"], 2), aspd=round(st["aspd"], 2), gspd=round(st["gspd"], 2),
                                      thr=st["thr"], volt=round(st["volt"], 2), curr=round(st["curr"], 1),
                                      dist=round(self.dist_home(), 1), wp=st["wp"], n=round(n, 1), e=round(e, 1)))
            elif t == "VFR_HUD":
                st["aspd"], st["gspd"], st["thr"] = msg.airspeed, msg.groundspeed, msg.throttle
            elif t == "SYS_STATUS":
                st["volt"], st["curr"] = msg.voltage_battery / 1000.0, msg.current_battery / 100.0
            elif t == "MISSION_CURRENT":
                st["wp"] = msg.seq
            elif t == "STATUSTEXT":
                self.texts.append((round(self.sim_t, 2), msg.text))
                print(f"  [{self.sim_t:7.1f}] {msg.text}")

    def ne_home(self):
        la, lo = self.state["lat"], self.state["lon"]
        if la == 0:
            return 0.0, 0.0
        dn = (la - HOME[0]) * 111320.0
        de = (lo - HOME[1]) * 111320.0 * math.cos(math.radians(HOME[0]))
        return dn, de

    def dist_home(self):
        return math.hypot(*self.ne_home())

    def wait(self, cond, timeout, step=0.2):
        end = time.time() + timeout
        while time.time() < end:
            self.pump(step)
            if cond(self.state):
                return True
        return False

    def set_param(self, name, value):
        for _ in range(5):
            self.m.mav.param_set_send(self.m.target_system, self.m.target_component, name.encode(), float(value),
                                      mavutil.mavlink.MAV_PARAM_TYPE_REAL32)
            end = time.time() + 2
            while time.time() < end:
                msg = self.m.recv_match(type="PARAM_VALUE", blocking=True, timeout=0.5)
                if msg and msg.param_id == name:
                    return abs(msg.param_value - value) < 1e-3 * max(1, abs(value))
        return False

    def get_param(self, name):
        for _ in range(3):
            self.m.mav.param_request_read_send(self.m.target_system, self.m.target_component, name.encode(), -1)
            end = time.time() + 2
            while time.time() < end:
                msg = self.m.recv_match(type="PARAM_VALUE", blocking=True, timeout=0.5)
                if msg and msg.param_id == name:
                    return msg.param_value
        return None

    def set_mode(self, name):
        self.m.mav.command_long_send(self.m.target_system, self.m.target_component,
                                     mavutil.mavlink.MAV_CMD_DO_SET_MODE, 0,
                                     mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, MODE_ID[name], 0, 0, 0, 0, 0)
        return self.wait(lambda s: s["mode"] == name, 10)

    def arm(self, timeout=120):
        end = time.time() + timeout
        while time.time() < end:
            self.m.mav.command_long_send(self.m.target_system, self.m.target_component,
                                         mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 1, 0, 0, 0, 0, 0, 0)
            if self.wait(lambda s: s["armed"], 4):
                return True
        return False

    def upload_mission(self, items):
        m = self.m
        m.mav.mission_clear_all_send(m.target_system, m.target_component)
        self.pump(1)
        m.mav.mission_count_send(m.target_system, m.target_component, len(items))
        sent = set()
        end = time.time() + 30
        while time.time() < end:
            msg = m.recv_match(type=["MISSION_REQUEST", "MISSION_REQUEST_INT", "MISSION_ACK"], blocking=True, timeout=1)
            if msg is None:
                continue
            if msg.get_type() == "MISSION_ACK":
                return msg.type == 0 and len(sent) == len(items)
            seq = msg.seq
            cmd, frame, p1, lat, lon, alt = items[seq]
            m.mav.mission_item_int_send(m.target_system, m.target_component, seq, frame, cmd, 0, 1,
                                        p1, 0, 0, 0, int(lat * 1e7), int(lon * 1e7), alt)
            sent.add(seq)
        return False

    def reset_scenario(self, name):
        self.rows, self.texts = [], []
        self.scenario = name
        self.rc = dict(RC_NEUTRAL)
        self.rc_enabled = True

    def save_csv(self):
        path = os.path.join(self.out_dir, f"scenario_{self.scenario}.csv")
        if self.rows:
            with open(path, "w", newline="") as f:
                w = csv.DictWriter(f, fieldnames=list(self.rows[0].keys()))
                w.writeheader()
                w.writerows(self.rows)
        return path


# ------------------------------------------------------------------ helpers
def offset(dn, de):
    lat = HOME[0] + dn / 111320.0
    lon = HOME[1] + de / (111320.0 * math.cos(math.radians(HOME[0])))
    return lat, lon


def summarize(s: Sitl, expect: str, ok: bool, extra=None):
    rows = s.rows
    modes = []
    for r in rows:
        if not modes or modes[-1] != r["mode"]:
            modes.append(r["mode"])
    trans = [t for t in s.texts if re.search(r"[Tt]ransition|QAssist|Failsafe|failsafe|Fence|fence|Battery|battery|Land|land|RTL", t[1])]
    res = dict(scenario=s.scenario, expected=expect, passed=bool(ok), mode_sequence=modes,
               max_alt_m=max((r["alt"] for r in rows), default=0), max_airspeed_ms=max((r["aspd"] for r in rows), default=0),
               max_dist_home_m=max((r["dist"] for r in rows), default=0),
               final_dist_home_m=rows[-1]["dist"] if rows else None,
               sim_duration_s=round(rows[-1]["t"] - rows[0]["t"], 1) if rows else 0,
               key_messages=[f"{t:.1f}s {m}" for t, m in trans][:40])
    res.update(flight_metrics(s))
    if extra:
        res.update(extra)
    s.save_csv()
    print(f"==> {s.scenario}: {'PASS' if ok else 'FAIL'}  modes={modes}")
    return res


def _window(rows, t0, t1):
    return [r for r in rows if t0 <= r["t"] <= t1]


def _path_m(rows):
    d = 0.0
    for a, b in zip(rows, rows[1:]):
        d += math.hypot(b["n"] - a["n"], b["e"] - a["e"])
    return round(d, 1)


def flight_metrics(s: Sitl):
    """Peak current / lowest voltage, forward-transition and back-transition metrics from the recorded rows
    and the autopilot's status text."""
    rows = s.rows
    m = dict(peak_current_A=max((r["curr"] for r in rows), default=None),
             min_voltage_V=min((r["volt"] for r in rows if r["volt"] > 0), default=None))
    if not rows:
        return m
    t_start = [t for t, x in s.texts if "Transition started" in x]
    t_done = [t for t, x in s.texts if "ransition done" in x]
    if t_start and not (t_done and t_done[0] > t_start[0]):
        m["forward_transition"] = dict(t_start_s=t_start[0], t_done_s=None,
                                       note="transition started but never completed (expected in D and in the fence RTL of F)")
    elif t_start:
        t0 = t_start[0]
        t1 = t_done[0]
        w = _window(rows, t0, t1)
        if w:
            alt0 = w[0]["alt"]
            m["forward_transition"] = dict(
                t_start_s=t0, t_done_s=t1 if t_done else None, duration_s=round(t1 - t0, 1),
                distance_m=_path_m(w), alt_start_m=alt0, alt_min_m=min(r["alt"] for r in w),
                alt_loss_m=round(alt0 - min(r["alt"] for r in w), 1),
                alt_gain_m=round(max(r["alt"] for r in w) - alt0, 1),
                peak_current_A=max(r["curr"] for r in w), airspeed_at_done_mps=w[-1]["aspd"])
    # back-transition: from the last row faster than 14 m/s in a fixed-wing mode (before a VTOL mode) until
    # ground speed drops below 3 m/s
    fw = {"FBWA", "FBWB", "CRUISE", "AUTO", "RTL", "LOITER", "CIRCLE", "MANUAL", "STABILIZE"}
    i0 = None
    for i, r in enumerate(rows):
        if r["aspd"] > 14 and r["mode"] in fw:
            i0 = i
    if i0 is not None:
        tail = rows[i0:]
        slow = [r for r in tail if r["gspd"] < 3.0]
        if slow:
            w = _window(rows, rows[i0]["t"], slow[0]["t"])
            m["back_transition"] = dict(t_start_s=rows[i0]["t"], t_hover_s=slow[0]["t"],
                                        duration_s=round(slow[0]["t"] - rows[i0]["t"], 1), distance_m=_path_m(w),
                                        alt_start_m=w[0]["alt"], alt_min_m=min(r["alt"] for r in w),
                                        alt_loss_m=round(w[0]["alt"] - min(r["alt"] for r in w), 1),
                                        peak_current_A=max(r["curr"] for r in w),
                                        modes=sorted({r["mode"] for r in w}))
    return m


def take_off_qloiter(s: Sitl, alt):
    assert s.set_mode("QLOITER"), "could not enter QLOITER"
    s.rc[3] = 1000
    if not s.arm():
        raise RuntimeError("arming failed")
    s.rc[3] = 1850  # climb
    ok = s.wait(lambda st: st["alt"] >= alt, 90)
    s.rc[3] = 1500  # hold altitude
    s.pump(3)
    return ok


def reset_battery(s: Sitl):
    """Fresh 6S pack between scenarios: re-seed the SITL battery model (or the external physics model's
    pack through its command port) and the FC mAh counter."""
    if PHYSICS_CMD_PORT:
        import socket
        socket.socket(socket.AF_INET, socket.SOCK_DGRAM).sendto(b"reset_battery", ("127.0.0.1", PHYSICS_CMD_PORT))
    v = s.get_param("SIM_BATT_VOLTAGE") or 25.2
    s.set_param("SIM_BATT_VOLTAGE", v - 0.01)
    s.pump(1)
    s.set_param("SIM_BATT_VOLTAGE", v)
    s.m.mav.command_long_send(s.m.target_system, s.m.target_component, mavutil.mavlink.MAV_CMD_BATTERY_RESET,
                              0, 1, 100, 0, 0, 0, 0, 0)
    s.pump(3)


def wait_landed(s: Sitl, timeout):
    return s.wait(lambda st: not st["armed"], timeout)


def transition_fbwa(s: Sitl, timeout=60):
    s.rc[3] = 1500
    s.set_mode("FBWA")
    s.rc[3] = 1700  # pusher throttle in FBWA
    ok = s.wait(lambda st: any("Transition done" in t for _, t in s.texts) or
                any("transition done" in t.lower() for _, t in s.texts), timeout)
    s.rc[3] = 1550
    if ok:
        s.set_mode("LOITER")   # fixed-wing loiter: stay inside the 300 m fence circle
    return ok


# ------------------------------------------------------------------ scenarios
def scenario_A(s: Sitl):
    s.reset_scenario("A_nominal_mission")
    hlat, hlon = HOME[0], HOME[1]
    REL = mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT
    pts = [(200, 0), (200, 200), (-150, 200), (-150, -150), (200, -150), (200, 0)]
    items = [(mavutil.mavlink.MAV_CMD_NAV_WAYPOINT, mavutil.mavlink.MAV_FRAME_GLOBAL_INT, 0, hlat, hlon, 0)]
    for dn, de in pts:
        la, lo = offset(dn, de)
        items.append((mavutil.mavlink.MAV_CMD_NAV_WAYPOINT, REL, 0, la, lo, 60))
    items.append((mavutil.mavlink.MAV_CMD_NAV_VTOL_LAND, REL, 0, hlat, hlon, 0))
    assert s.upload_mission(items), "mission upload failed"
    take_off_qloiter(s, 35)
    t_auto = s.sim_t
    s.set_mode("AUTO")
    s.rc[3] = 1500
    landed = wait_landed(s, 600)
    tdone = [t for t, m in s.texts if "ransition done" in m]
    hover_learned = s.get_param("Q_M_THST_HOVER")
    ok = landed and bool(tdone) and s.rows[-1]["dist"] < 15
    return summarize(s, "QLOITER -> AUTO (transition, loop) -> VTOL land at home, disarm", ok,
                     dict(forward_transition_s=round(tdone[0] - t_auto, 1) if tdone else None,
                          learned_Q_M_THST_HOVER_sitl_model=hover_learned))


def scenario_B(s: Sitl):
    s.reset_scenario("B_rc_loss_cruise")
    take_off_qloiter(s, 40)
    tr = transition_fbwa(s)
    s.pump(12)
    s.set_param("SIM_RC_FAIL", 1)
    s.rc_enabled = False
    s.m.mav.rc_channels_override_send(s.m.target_system, s.m.target_component, *([0] * 18))
    landed = wait_landed(s, 400)
    s.set_param("SIM_RC_FAIL", 0)
    modes = [r["mode"] for r in s.rows]
    fence = any("fence" in m.lower() for _, m in s.texts)
    ok = tr and landed and "RTL" in modes and "QRTL" in modes and s.rows[-1]["dist"] < 15 and not fence
    return summarize(s, "fixed-wing LOITER, RC lost -> RTL -> QRTL -> vertical land at home (no fence involvement)", ok)


def scenario_C(s: Sitl):
    s.reset_scenario("C_rc_loss_hover")
    take_off_qloiter(s, 15)
    s.set_param("SIM_RC_FAIL", 1)
    s.rc_enabled = False
    s.m.mav.rc_channels_override_send(s.m.target_system, s.m.target_component, *([0] * 18))
    landed = wait_landed(s, 120)
    s.set_param("SIM_RC_FAIL", 0)
    modes = [r["mode"] for r in s.rows]
    ok = landed and "QLAND" in modes and "RTL" not in modes
    return summarize(s, "QLOITER hover, RC lost -> QLAND in place", ok)


def scenario_D(s: Sitl):
    s.reset_scenario("D_transition_timeout")
    take_off_qloiter(s, 40)
    s.rc[3] = 1000          # FBWA transition: low stick = no pusher thrust [quadplane-transitions.html]
    t0 = s.sim_t
    s.set_mode("FBWA")
    got = s.wait(lambda st: st["mode"] == "QRTL", 90)
    t_qrtl = s.sim_t
    s.rc[3] = 1500
    landed = wait_landed(s, 180)
    tfail = any("ransition failed" in m or "TRANS_FAIL" in m or "timeout" in m.lower() for _, m in s.texts)
    ok = got and landed and 13 <= (t_qrtl - t0) <= 25
    return summarize(s, "FBWA with no pusher -> Q_TRANS_FAIL 15 s -> QRTL -> land", ok,
                     dict(time_to_QRTL_s=round(t_qrtl - t0, 1), timeout_message_seen=tfail))


def scenario_E(s: Sitl):
    s.reset_scenario("E_battery_low_cruise")
    take_off_qloiter(s, 40)
    tr = transition_fbwa(s)
    s.pump(10)
    s.set_param("BATT_LOW_MAH", 6400)
    landed = wait_landed(s, 400)
    s.set_param("BATT_LOW_MAH", 1950)
    modes = [r["mode"] for r in s.rows]
    fence = any("fence" in m.lower() for _, m in s.texts)
    batt = any("attery" in m and "low" in m for _, m in s.texts)
    ok = tr and landed and batt and "RTL" in modes and "QRTL" in modes and not fence
    return summarize(s, "fixed-wing LOITER, low battery -> RTL -> QRTL -> land at home (no fence involvement)", ok)


def scenario_F(s: Sitl):
    s.reset_scenario("F_fence_ceiling")
    fence = s.get_param("FENCE_ALT_MAX")
    assert s.set_mode("QLOITER")
    s.rc[3] = 1000
    s.arm()
    s.rc[3] = 2000
    breach = s.wait(lambda st: st["mode"] not in ("QLOITER",) and st["alt"] > 20, 150)
    s.rc[3] = 1500
    s.pump(5)
    alt_at_breach = max(r["alt"] for r in s.rows)
    # bring it home if it entered a fixed-wing RTL
    landed = wait_landed(s, 400)
    if not landed:
        s.set_mode("QLAND")
        landed = wait_landed(s, 200)
    ok = breach and any("fence" in m.lower() for _, m in s.texts) and alt_at_breach < 121.9
    return summarize(s, f"QLOITER climb through FENCE_ALT_MAX={fence} -> breach action RTL; peak < 121.9 m", ok,
                     dict(peak_alt_m=alt_at_breach))


def scenario_G(s: Sitl):
    s.reset_scenario("G_elrs_mavlink_override_loss")
    s.set_param("SIM_RC_FAIL", 1)        # no receiver RC; only MAVLink overrides (sent every 0.2 s wall)
    s.pump(5)
    take_off_qloiter(s, 15)
    t_stop = s.sim_t
    s.rc_enabled = False                 # link lost: ELRS RX stops sending RC_CHANNELS_OVERRIDE
    got = s.wait(lambda st: st["mode"] == "QLAND", 60)
    t_fs = s.sim_t
    landed = wait_landed(s, 120)
    s.set_param("SIM_RC_FAIL", 0)
    s.rc_enabled = True
    ovr = s.get_param("RC_OVERRIDE_TIME")
    fst = s.get_param("RC_FS_TIMEOUT")
    ok = got and landed
    return summarize(s, "RC only via MAVLink overrides; overrides stop in hover -> QLAND", ok,
                     dict(failsafe_delay_s=round(t_fs - t_stop, 1), RC_OVERRIDE_TIME=ovr, RC_FS_TIMEOUT=fst))


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--connect", default="tcp:127.0.0.1:5760")
    ap.add_argument("--sitl-exe", help="launch this SITL binary (e.g. Mission Planner's ArduPlane.exe)")
    ap.add_argument("--defaults-base", help="SITL model defaults (Tools/autotest/default_params/quadplane.parm)")
    ap.add_argument("--params", nargs="+", required=True, help="param files, applied in order")
    ap.add_argument("--speedup", type=int, default=5)
    ap.add_argument("--out", default="results")
    ap.add_argument("--summary", help="also write the summary JSON to this path (default: <out>/summary.json only)")
    ap.add_argument("--scenarios", default="ABCDEFG")
    ap.add_argument("--model", default="quadplane",
                    help="SITL model: quadplane (ArduPilot generic) or JSON:127.0.0.1 (c0_physics.py)")
    ap.add_argument("--physics", help="external physics script to launch first (firmware/sitl/c0_physics.py)")
    ap.add_argument("--physics-args", default="", help="extra arguments for the physics script, e.g. '--wind 3,270'")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    proc = phys = None
    global PHYSICS_CMD_PORT
    if a.physics:
        PHYSICS_CMD_PORT = 9004
        pcmd = [sys.executable, os.path.abspath(a.physics), "--params"] + [os.path.abspath(p) for p in a.params] + \
               ["--log", os.path.join(os.path.abspath(a.out), "physics_log.csv")] + a.physics_args.split()
        print("physics:", " ".join(pcmd))
        phys = subprocess.Popen(pcmd, stdout=open(os.path.join(a.out, "physics_stdout.log"), "w"),
                                stderr=subprocess.STDOUT)
        time.sleep(2)
    if a.sitl_exe:
        defaults = ",".join(os.path.abspath(p) for p in ([a.defaults_base] if a.defaults_base else []) + a.params)
        cmd = [a.sitl_exe, "--model", a.model, "--speedup", str(a.speedup), "-w",
               "--home", ",".join(str(x) for x in HOME), "--defaults", defaults]
        print("launch:", " ".join(cmd))
        proc = subprocess.Popen(cmd, cwd=a.out, stdout=open(os.path.join(a.out, "sitl_stdout.log"), "w"),
                                stderr=subprocess.STDOUT)
        time.sleep(2)

    s = Sitl(a.connect, a.out)
    print("connected; waiting for EKF/GPS")
    s.pump(25)
    # parameter verification against the running firmware
    want = {}
    for p in a.params:
        want.update(parse_param_file(p))
    missing, mismatch = [], []
    for k, v in want.items():
        got = s.get_param(k)
        if got is None:
            missing.append(k)
        elif abs(got - v) > 1e-3 * max(1.0, abs(v)):
            mismatch.append((k, v, got))
    s.m.mav.command_long_send(s.m.target_system, s.m.target_component, mavutil.mavlink.MAV_CMD_REQUEST_MESSAGE,
                              0, 148, 0, 0, 0, 0, 0, 0)
    ver = None
    end = time.time() + 5
    while time.time() < end and ver is None:
        msg = s.m.recv_match(type="AUTOPILOT_VERSION", blocking=True, timeout=1)
        if msg:
            v = msg.flight_sw_version
            ver = f"{v >> 24}.{(v >> 16) & 255}.{(v >> 8) & 255}"
    results = dict(firmware=ver, model=a.model, physics=os.path.basename(a.physics) if a.physics else None,
                   speedup=a.speedup, param_files=[os.path.basename(p) for p in a.params],
                   defaults_base=os.path.basename(a.defaults_base) if a.defaults_base else None,
                   params_checked=len(want), params_missing_in_sitl=missing,
                   params_mismatch=[dict(name=k, file=v, sitl=g) for k, v, g in mismatch], scenarios=[])
    print(f"params: {len(want)} checked, {len(missing)} not present in SITL, {len(mismatch)} mismatched")

    funcs = dict(A=scenario_A, B=scenario_B, C=scenario_C, D=scenario_D, E=scenario_E, F=scenario_F, G=scenario_G)
    for key in a.scenarios:
        try:
            results["scenarios"].append(funcs[key](s))
        except Exception as e:  # noqa: BLE001
            print(f"scenario {key} error: {e}")
            results["scenarios"].append(dict(scenario=key, passed=False, error=str(e)))
            s.save_csv()
        # make sure we are on the ground and disarmed before the next one
        if s.state["armed"]:
            s.set_mode("QLAND")
            wait_landed(s, 300)
        reset_battery(s)
        s.pump(5)

    results["hover_throttle_learned_Q_M_THST_HOVER"] = s.get_param("Q_M_THST_HOVER")
    with open(os.path.join(a.out, "summary.json"), "w") as f:
        json.dump(results, f, indent=2)
    if a.summary:
        with open(a.summary, "w") as f:
            json.dump(results, f, indent=2)
    if proc:
        proc.terminate()
    if phys:
        phys.terminate()
    npass = sum(1 for r in results["scenarios"] if r.get("passed"))
    print(f"\n{npass}/{len(results['scenarios'])} scenarios passed")
    return 0 if npass == len(results["scenarios"]) else 1


if __name__ == "__main__":
    sys.exit(main())
