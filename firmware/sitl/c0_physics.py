#!/usr/bin/env python3
"""
c0_physics.py - 6-DOF physics model of the C0 lift + cruise VTOL for ArduPilot SITL's JSON
external-physics interface (SITL started with --model JSON:127.0.0.1).

Every number that describes the aircraft is read from the repo at start-up, so the model follows
the design when the analysis is regenerated:
  analysis/results.json                 mass (concepts.C0.sized.m), rotor positions (geo), lift
                                        motor Tmax / maker thrust-power table (params), CG item
                                        list (cg.items, used for the inertia estimate)
  analysis/aero/aero_results.json       wing geometry, AVL stability derivatives, lift-curve, CL_max
                                        (3-D, adopted), drag polar (drag.polar incl. stopped rotors,
                                        booms, faired legs), cruise/stall trims used for validation
  analysis/aero/out/avl/st_pod_trim.txt control derivatives (CLd02, Cmd02, Cld01, Cnd01, CYp, CYr)
  cad/params.txt                        landing-leg contact points, lift-prop and pusher-prop heights
  firmware/vtol_c0.param (+ SITL overrides)  SERVOn_FUNCTION / MIN / MAX / TRIM / REVERSED output map
Items the repo does not contain are estimates, marked EST in the code and listed by --validate.

Frames: body x forward, y right, z down; earth NED, origin at SITL home, ground plane at D = 0.
Interface (ArduPilot libraries/SITL/examples/JSON/readme.md and SIM_JSON.cpp, checked 2026-10-25):
  SITL -> model (UDP to port 9002): uint16 magic 18458, uint16 frame_rate, uint32 frame_count,
  uint16 pwm[16]  (magic 29569 and pwm[32] when SERVO_32_ENABLE=1).
  model -> SITL (reply to the sender): one JSON line with timestamp [s], imu.gyro [rad/s body],
  imu.accel_body [m/s^2 body, specific force], position [m NED], velocity [m/s NED], quaternion,
  airspeed [m/s], battery {voltage, current}.

Usage:
  python c0_physics.py --validate                       # trim checks against the analysis predictions
  python c0_physics.py --params ../vtol_c0.param sitl_c0_overrides.param [--log out.csv] [--wind 3,270]
Pure Python (no numpy) so it runs under any interpreter.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import re
import socket
import struct
import sys
import time

G = 9.80665
RHO = 1.225                      # ISA sea level; aero_results.json conditions.*.rho is also 1.225

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

# ----------------------------------------------------------------------------------------------- data
# APC 14x8.5E propeller performance, 7000 rpm block, columns J, Ct, Cp
# (https://www.apcprop.com/files/PER3_14x85E.dat, header "14x8.5E (14x85E.dat) v2022-0915", checked
# 2026-10-25). Ct and Cp vary < 2 % between the 4000 and 8000 rpm blocks, so one block is used.
# The pusher is the 14x8.5EP (mirror geometry, docs/research/pusher-battery-servo.md section 1c).
APC_14x85E_J_CT_CP = [
    (0.0000, 0.0950, 0.0334), (0.0523, 0.0926, 0.0347), (0.1046, 0.0897, 0.0358), (0.1568, 0.0862, 0.0368),
    (0.2091, 0.0820, 0.0374), (0.2614, 0.0770, 0.0375), (0.3137, 0.0713, 0.0371), (0.3659, 0.0647, 0.0361),
    (0.4182, 0.0573, 0.0342), (0.4705, 0.0492, 0.0316), (0.5228, 0.0405, 0.0283), (0.5751, 0.0316, 0.0243),
    (0.6273, 0.0224, 0.0198), (0.6796, 0.0133, 0.0147), (0.7319, 0.0043, 0.0092), (0.7580, 0.0000, 0.0064),
]

# Range handling of the linear (AVL) aero model (EST, modelled on ArduPilot SIM_Plane's +-0.8 rad alpha clamp):
POST_STALL_RAD = 0.35        # alpha is clamped this far beyond the stall angles inside the linear model
LIN_FADE_START = math.radians(35.0)   # linear model weight 1 below this |alpha| or |beta| ...
LIN_FADE_END = math.radians(70.0)     # ... and 0 above this; flat-plate model takes over in between
BETA_CLAMP = math.radians(30.0)

# Estimates (EST) that no repo file provides. Each is listed by --validate.
EST = dict(
    expo_phys=0.72,          # lift thrust vs PWM: T/Tmax = (1-k)x + k x^2, same k the param file assumes
                             # (vtol_c0.param Q_M_THST_EXPO, from the ArduPilot tuning-process guide)
    lift_motor_tau_s=0.06,   # lift motor+prop thrust lag (first order)
    lift_rpm_max=7100.0,     # 17 in prop at Tmax, 22.2 V: 0.8 x KV 400 x 22.2 V; only sets reaction torque
    pusher_R_ohm=0.08,       # X4110S winding resistance (maker page gives none: "-")
    pusher_I0_A=0.8,         # X4110S no-load current (maker page gives none: "-")
    pusher_tau_s=0.20,       # pusher rpm lag (first order)
    eta_motor=0.85,          # motor+ESC efficiency for the lift power table -> shaft torque (sizing etaMEc)
    de_max_deg=20.0, da_max_deg=20.0, dr_max_deg=20.0,   # surface travel (ArduPilot SIM_Plane.h default 0.3491 rad)
    cg_z_m=0.0,              # CG on the wing chord line, as in AVL (aero_results note_Zref)
    CL_min=-0.8,             # negative-alpha stall
    post_stall_slope=2.5,    # dCL/d(alpha) after stall, per rad (lift collapse)
    flat_plate_CN=1.1,       # normal-force coefficient of the stalled wing at 90 deg
    rudder_tau=0.661,        # thin-airfoil flap effectiveness for a 30 % chord rudder
                             # (1 - (theta - sin theta)/pi, theta = acos(1 - 2*0.3)); AVL's rudder entry
                             # mirrors the two fins antisymmetrically (SgnDup +1 on c0_pod.avl) and gives
                             # Cnd03 = 0, so the rudder is estimated here instead
    fin_z_arm_m=0.10,        # fin centroid above the CG (fin root at boom, height vH 0.195 m / 2)
    ground_k=8000.0, ground_c=250.0, ground_mu=0.6,       # leg contact spring N/m, damper N s/m, friction
    leg_contact_below_ref_m=0.25,  # leg tip 0.25 m below the wing chord line (cad/params.txt Landing_Leg y)
    pack_R_ohm=0.03,         # 6S pack internal resistance (5 mohm/cell)
    pack_cells=6,
    wiring_mass_spread_m=0.6,
)


def _f(x):
    return float(x)


def load_param_files(paths):
    out = {}
    for p in paths:
        for line in open(p, encoding="utf-8"):
            s = line.split("#", 1)[0].strip()
            if not s:
                continue
            parts = re.split(r"[,\s=]+", s)
            if len(parts) >= 2:
                try:
                    out[parts[0]] = float(parts[1])
                except ValueError:
                    pass
    return out


def interp(x, xs, ys):
    """Linear interpolation with linear extrapolation at both ends."""
    if x <= xs[0]:
        i = 0
    elif x >= xs[-1]:
        i = len(xs) - 2
    else:
        i = 0
        while xs[i + 1] < x:
            i += 1
    t = (x - xs[i]) / (xs[i + 1] - xs[i])
    return ys[i] + t * (ys[i + 1] - ys[i])


# ----------------------------------------------------------------------------------------------- vectors
def vadd(a, b): return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
def vsub(a, b): return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
def vscale(a, s): return [a[0] * s, a[1] * s, a[2] * s]
def vdot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def vcross(a, b): return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
def vnorm(a): return math.sqrt(vdot(a, a))


def q_mult(q, r):
    w1, x1, y1, z1 = q
    w2, x2, y2, z2 = r
    return [w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2, w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
            w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2]


def q_normalize(q):
    n = math.sqrt(sum(c * c for c in q))
    return [c / n for c in q]


def q_to_dcm(q):
    """Body -> NED rotation matrix for quaternion [w, x, y, z]."""
    w, x, y, z = q
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
            [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
            [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]]


def m_mul(m, v):
    return [m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
            m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
            m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]]


def m_tmul(m, v):
    return [m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
            m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
            m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2]]


def q_from_euler(roll, pitch, yaw):
    cr, sr = math.cos(roll / 2), math.sin(roll / 2)
    cp, sp = math.cos(pitch / 2), math.sin(pitch / 2)
    cy, sy = math.cos(yaw / 2), math.sin(yaw / 2)
    return [cr * cp * cy + sr * sp * sy, sr * cp * cy - cr * sp * sy,
            cr * sp * cy + sr * cp * sy, cr * cp * sy - sr * sp * cy]


def q_to_euler(q):
    w, x, y, z = q
    roll = math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y))
    s = max(-1.0, min(1.0, 2 * (w * y - z * x)))
    pitch = math.asin(s)
    yaw = math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
    return roll, pitch, yaw


# ----------------------------------------------------------------------------------------------- aircraft data
class C0Data:
    """Everything read from the repo. Attribute names end in the source file in the comments."""

    def __init__(self, repo=REPO, param_files=()):
        self.repo = repo
        self.sources = {}
        rj = json.load(open(os.path.join(repo, "analysis", "results.json"), encoding="utf-8"))
        ar = json.load(open(os.path.join(repo, "analysis", "aero", "aero_results.json"), encoding="utf-8"))
        self.generated = dict(results_json=rj.get("generated"), aero_results_json=ar.get("generated"))
        c0 = rj["concepts"]["C0"]
        sized, geo, prm, cg = c0["sized"], c0["geo"], c0["params"], c0["cg"]

        # mass and geometry
        self.mass = _f(sized["m"])                            # results.json C0.sized.m
        self.S = _f(ar["geometry"]["S_ref_m2"])               # aero_results geometry
        self.b = _f(ar["geometry"]["span_m"])
        self.c = _f(ar["geometry"]["chord_m"])
        self.AR = _f(ar["geometry"]["AR"])
        self.S_h = _f(ar["geometry"]["S_h_m2"])               # H-tail area, aero_results geometry
        self.l_h = _f(ar["geometry"]["l_h_m"])                # tail arm
        self.S_side = _f(ar["geometry"]["S_v_m2"]) + 0.14     # fins + pod side area (pod 0.85 m x 0.16 m EST)
        self.x_cg_le = _f(geo["xLEtoCG"])                     # CG aft of the wing LE (x fwd +), results.json geo
        self.z_cg = EST["cg_z_m"]

        # lift rotors (x fwd, y right, z down, relative to the CG). results.json geo gives x stations from the
        # wing LE and the boom lateral offset yIn; cad/params.txt Lift_Prop y gives the prop-plane height.
        cad = self._read_cad(os.path.join(repo, "cad", "params.txt"))
        z_prop = -(cad.get("lift_prop_up", 0.023) - self.z_cg)
        xf, xr, y = _f(geo["xFront"]) - self.x_cg_le, _f(geo["xRear"]) - self.x_cg_le, _f(geo["yIn"])
        # ArduPilot quad X order (vtol_c0.param section 2 / quadplane-frame-setup): 1 FR CCW, 2 RL CCW, 3 FL CW, 4 RR CW
        self.rotors = [dict(n=1, pos=[xf, +y, z_prop], dir=+1), dict(n=2, pos=[xr, -y, z_prop], dir=+1),
                       dict(n=3, pos=[xf, -y, z_prop], dir=-1), dict(n=4, pos=[xr, +y, z_prop], dir=-1)]
        self.lift_D = _f(prm["liftD"])                        # results.json params.liftD (17 in)
        self.Tmax_g_22V = _f(prm["Tmax_g"])                   # 3130 gf at 22.2 V, docs/research/budget-lift.md A3
        self.Tmax_g_25V = 3600.0                              # 3600 gf at 25 V, same maker table (budget-lift.md A3)
        self.thrust_table = [(_f(t), _f(p)) for t, p in prm["thrustTable"]]  # (gf, W) at 22.2 V, params.thrustTable
        self.lift_rpm_max = EST["lift_rpm_max"]

        # pusher: X4110S KV400 (results.json C0.motor, same motor as lift), APC 14x8.5EP D from cad pushProp
        self.pusher_D = cad.get("pushProp", 0.3556)
        self.pusher_KV = 400.0
        self.pusher_pos = [cad.get("pusher_x", -0.437) - self.x_cg_le, 0.0, -(cad.get("pusher_up", -0.03) - self.z_cg)]

        # aero: AVL derivatives at the cruise trim, aero_results stability_derivatives_AVL_trim (per rad)
        d = ar["stability_derivatives_AVL_trim"]
        self.CLa, self.Cma, self.CLq, self.Cmq = _f(d["CLa"]), _f(d["Cma"]), _f(d["CLq"]), _f(d["Cmq"])
        self.CYb, self.Clb, self.Cnb = _f(d["CYb"]), _f(d["Clb"]), _f(d["Cnb"])
        self.Clp, self.Clr, self.Cnp, self.Cnr = _f(d["Clp"]), _f(d["Clr"]), _f(d["Cnp"]), _f(d["Cnr"])
        self.alpha0 = math.radians(_f(ar["lift_curve"]["alpha_0L_deg_aircraft"]))
        self.Cm0 = _f(ar["lift_curve"]["Cm0_CG28"])
        self.CLmax = _f(ar["CL_max_3D"]["adopted"])
        self.CD0 = _f(ar["drag"]["CD0_total"])                 # incl. 4 stopped rotor units, booms, faired legs
        self.e_fit = _f(ar["drag"]["e_oswald_fit"])
        pol = ar["drag"]["polar"]
        self.polar_CL, self.polar_CD = [_f(v) for v in pol["CL"]], [_f(v) for v in pol["CD"]]
        # control derivatives from the AVL stability file (per degree of surface deflection)
        st = self._read_avl_st(os.path.join(repo, "analysis", "aero", "out", "avl", "st_pod_trim.txt"))
        self.CLde = st["CLd02"]            # elevator, + = TE down
        self.Cmde = st["Cmd02"]
        # aileron: AVL d01 sign is arbitrary (hinge vector); re-sign so + command = roll right and carry the
        # yaw and side-force couplings with the same factor (Cnd01 of the opposite sign to Cld01 = adverse yaw)
        sa = -1.0 if st["Cld01"] < 0 else 1.0
        self.Clda = st["Cld01"] * sa
        self.Cnda = st.get("Cnd01", 0.0) * sa
        self.CYda = st.get("CYd01", 0.0) * sa
        self.CYp, self.CYr = st.get("CYp", 0.0), st.get("CYr", 0.0)
        # rudder: AVL d03 re-signed so + command = nose right (ArduPilot convention), couplings with the same
        # factor. Falls back to thin-airfoil flap theory (EST["rudder_tau"]) only if the st file has no rudder
        # yaw derivative (the pre-2026-10-25 AVL model mirrored the fins antisymmetrically and gave Cnd03 = 0).
        self.rudder_source = "AVL st_pod_trim.txt Cnd03/CYd03/Cld03"
        if abs(st.get("Cnd03", 0.0)) > 1e-6:
            sr = -1.0 if st["Cnd03"] < 0 else 1.0
            self.Cndr = st["Cnd03"] * sr
            self.CYdr = st.get("CYd03", 0.0) * sr
            self.Cldr = st.get("Cld03", 0.0) * sr
        else:
            self.rudder_source = "EST thin-airfoil flap (AVL file has no Cnd03)"
            l_v = _f(ar["geometry"]["l_h_m"])
            cy = abs(self.CYb) * EST["rudder_tau"] * math.pi / 180.0            # per deg
            self.Cndr = cy * l_v / self.b
            self.CYdr = -cy                                                     # nose right <-> side force left
            self.Cldr = -cy * EST["fin_z_arm_m"] / self.b
        # predictions used by --validate
        self.pred = dict(
            trim_cruise=ar["trim_cruise"], V_cruise=_f(ar["conditions"]["cruise"]["V"]),
            P_cruise_W=_f(ar["drag"]["cruise"]["P_elec_W"]), D_cruise_N=_f(ar["drag"]["cruise"]["D_N"]),
            V_stall=_f(ar["stall"]["V_stall_mps"]), trim_stall=ar["stall"]["trim_at_Vstall"],
            hover_T_g=_f(sized["Tunit_g"]), P_hover_W=_f(sized["P_hover"]), I_hover=_f(sized["I_hover"]),
            P_hover_per_motor=_f(sized["P_hover_per_motor"]),
            SM_pct=_f(ar["neutral_point"]["static_margin_pct"]["CG_28pct"]))

        # inertia estimate from the CG item list (results.json C0.cg.items: mass, x station from the LE)
        self.cg_items = cg["items"]
        self.I = self._inertia(cg["items"], geo)

        # landing gear contact points from cad/params.txt (Landing_Leg x stations, boom y, leg tip height)
        zc = EST["leg_contact_below_ref_m"] - self.z_cg
        legs_x = cad.get("leg_x", [0.293, -0.442])
        self.contacts = [[lx - self.x_cg_le, sy * y, zc] for lx in legs_x for sy in (+1, -1)]

        # output map
        self.params = load_param_files([os.path.join(repo, "firmware", "vtol_c0.param")] + list(param_files))
        self.servo = {}
        for ch in range(1, 33):
            fn = int(self.params.get(f"SERVO{ch}_FUNCTION", 0))
            if fn:
                self.servo[ch] = dict(fn=fn, min=self.params.get(f"SERVO{ch}_MIN", 1100),
                                      max=self.params.get(f"SERVO{ch}_MAX", 1900),
                                      trim=self.params.get(f"SERVO{ch}_TRIM", 1500),
                                      rev=int(self.params.get(f"SERVO{ch}_REVERSED", 0)))
        self.cells = EST["pack_cells"]
        self.capacity_Ah = self.params.get("BATT_CAPACITY", 6500) / 1000.0

    @staticmethod
    def _read_cad(path):
        """cad/params.txt: key=value lines and comp=Name|x|y|z|rotation (x fwd, y up, z right, from the wing LE)."""
        out = dict(leg_x=[])
        if not os.path.exists(path):
            return out
        for line in open(path, encoding="utf-8", errors="replace"):
            s = line.strip()
            if s.startswith("comp="):
                f = s[5:].split("|")
                try:
                    x, yup, z = float(f[1]), float(f[2]), float(f[3])
                except (ValueError, IndexError):
                    continue
                if f[0] == "Landing_Leg" and z > 0 and x not in out["leg_x"]:
                    out["leg_x"].append(x)
                elif f[0] == "Lift_Prop":
                    out["lift_prop_up"] = yup
                elif f[0] == "Pusher_Prop_14in":
                    out["pusher_x"], out["pusher_up"] = x, yup
            elif "=" in s and not s.startswith("#"):
                k, v = s.split("=", 1)
                if k in ("pushProp", "legLen", "chord"):
                    out[k] = float(v)
        if not out["leg_x"]:
            del out["leg_x"]
        return out

    @staticmethod
    def _read_avl_st(path):
        out = {}
        for m in re.finditer(r"(C[LYDlmn]d0[123]|CYp|CYr)\s*=\s*([-+0-9.eE]+)", open(path, encoding="utf-8").read()):
            out[m.group(1)] = float(m.group(2))
        return out

    def _inertia(self, items, geo):
        """Point masses at the cg.items stations plus a slender-body/plate term for the spread items (EST)."""
        b, cx, y = self.b, self.c, _f(geo["yIn"])
        xf, xr = _f(geo["xFront"]) - self.x_cg_le, _f(geo["xRear"]) - self.x_cg_le
        boom_len = _f(geo["x1"]) - _f(geo["x0"]) if "x0" in geo else 1.45
        Ixx = Iyy = Izz = 0.0
        for it in items:
            m, x = _f(it["m"]), _f(it["x"]) - self.x_cg_le
            n = it["name"].lower()
            if "lift units, front" in n:
                for sy in (+1, -1):
                    Ixx += m / 2 * y * y; Iyy += m / 2 * xf * xf; Izz += m / 2 * (xf * xf + y * y)
            elif "lift units, rear" in n:
                for sy in (+1, -1):
                    Ixx += m / 2 * y * y; Iyy += m / 2 * xr * xr; Izz += m / 2 * (xr * xr + y * y)
            elif n.startswith("booms"):
                Ixx += m * y * y; Iyy += m * (boom_len ** 2 / 12 + x * x); Izz += m * (boom_len ** 2 / 12 + x * x + y * y)
            elif n.startswith("wing"):
                Ixx += m * b * b / 12; Iyy += m * (cx * cx / 12 + x * x); Izz += m * (b * b / 12 + x * x)
            elif n.startswith("tail"):
                hs = _f(geo["hSpan"])
                Ixx += m * hs * hs / 12; Iyy += m * x * x; Izz += m * (hs * hs / 12 + x * x)
            elif n.startswith("landing gear"):
                zl = EST["leg_contact_below_ref_m"] / 2
                for lx in (xf - 0.09, xr + 0.09):
                    Ixx += m / 2 * (y * y + zl * zl); Iyy += m / 2 * (lx * lx + zl * zl); Izz += m / 2 * (lx * lx + y * y)
            elif n.startswith("fuselage") or n.startswith("wiring"):
                L = EST["wiring_mass_spread_m"] if n.startswith("wiring") else 0.85
                Iyy += m * (L * L / 12 + x * x); Izz += m * (L * L / 12 + x * x); Ixx += m * 0.05 ** 2
            elif n.startswith("servos"):
                Ixx += m * 0.6 * y * y; Iyy += m * x * x; Izz += m * (x * x + 0.6 * y * y)
            else:  # pod-mounted items: battery, payload, avionics, pusher set
                Iyy += m * x * x; Izz += m * x * x; Ixx += m * 0.04 ** 2
        return dict(xx=Ixx, yy=Iyy, zz=Izz)

    # --------------------------------------------------------------------------------------- propulsion
    def Tmax_N(self, volt):
        """Lift motor max thrust at pack voltage: linear between the maker's 22.2 V and 25 V points (EST interp)."""
        g = self.Tmax_g_22V + (volt - 22.2) * (self.Tmax_g_25V - self.Tmax_g_22V) / (25.0 - 22.2)
        return max(0.0, g) / 1000.0 * G

    def lift_thrust_frac(self, x):
        k = EST["expo_phys"]
        return (1 - k) * x + k * x * x

    def lift_power_W(self, T_N):
        """Electrical power for one lift unit at thrust T (maker table, W vs gf at 22.2 V; T^1.5 below the table)."""
        g = T_N / G * 1000.0
        ts, ps = [t for t, _ in self.thrust_table], [p for _, p in self.thrust_table]
        if g <= 0:
            return 0.0
        if g < ts[0]:
            return ps[0] * (g / ts[0]) ** 1.5
        return interp(g, ts, ps)

    def pusher_ct_cp(self, J):
        js = [r[0] for r in APC_14x85E_J_CT_CP]
        ct = interp(J, js, [r[1] for r in APC_14x85E_J_CT_CP])
        cp = interp(J, js, [r[2] for r in APC_14x85E_J_CT_CP])
        return max(ct, -0.03), max(cp, -0.02)     # windmilling clamp beyond the table (EST)

    def pusher_steady(self, x, V_axial, volt):
        """Steady-state pusher rps for throttle x (0-1) at axial inflow V: motor torque = prop torque.
        Motor: I = (x V - w/Kv)/R, Q = (I - I0)/Kv (Kv in rad/s/V). Prop: Q = Cp rho n^2 D^5 / 2 pi."""
        Kv = self.pusher_KV * 2 * math.pi / 60.0
        R, I0, D = EST["pusher_R_ohm"], EST["pusher_I0_A"], self.pusher_D
        Vapp = max(0.0, x) * volt
        n_hi = Vapp * Kv / (2 * math.pi) + 1.0
        if Vapp < 0.3:
            return 0.0, 0.0
        lo, hi = 0.0, n_hi
        for _ in range(40):
            n = 0.5 * (lo + hi)
            J = max(0.0, V_axial) / max(n * D, 1e-6)
            _, cp = self.pusher_ct_cp(J)
            Qp = cp * RHO * n * n * D ** 5 / (2 * math.pi)
            I = (Vapp - 2 * math.pi * n / Kv) / R
            Qm = (I - I0) / Kv
            if Qm > Qp:
                lo = n
            else:
                hi = n
        n = 0.5 * (lo + hi)
        I = max(0.0, (Vapp - 2 * math.pi * n / Kv) / R)
        return n, I

    def pusher_thrust(self, n, V_axial):
        D = self.pusher_D
        if n <= 0:
            return 0.0
        J = max(0.0, V_axial) / (n * D)
        ct, _ = self.pusher_ct_cp(J)
        return ct * RHO * n * n * D ** 4

    # --------------------------------------------------------------------------------------- aero
    def CL_CD_Cm(self, alpha, qhat, de_deg):
        """Longitudinal coefficients of the attached/near-stall regime. Linear AVL model up to the 3-D
        CL_max, then a lift collapse (EST). alpha is clamped to +-POST_STALL_RAD beyond the stall angles;
        outside that range forces() fades this model out and uses the flat-plate model instead, so
        hover-descent and tail-slide attitudes stay bounded (ArduPilot's SIM_Plane clamps alpha the same way)."""
        a0, CLa = self.alpha0, self.CLa
        a_s = a0 + (self.CLmax - self.CLde * de_deg - self.CLq * qhat) / CLa
        a_sn = a0 + (EST["CL_min"] - self.CLde * de_deg - self.CLq * qhat) / CLa
        alpha = max(a_sn - POST_STALL_RAD, min(a_s + POST_STALL_RAD, alpha))
        CL_lin = CLa * (alpha - a0) + self.CLq * qhat + self.CLde * de_deg
        # flat plate at high alpha: CN = CN90 sin(a) -> CL = CN cos(a) = CN90 sin(2a)/2 (EST)
        fp = EST["flat_plate_CN"] * math.sin(2 * alpha) / 2
        if alpha > a_s:
            CL = max(self.CLmax - EST["post_stall_slope"] * (alpha - a_s), fp)
            stalled = 1.0
        elif alpha < a_sn:
            CL = min(EST["CL_min"] + EST["post_stall_slope"] * (a_sn - alpha), fp)
            stalled = 1.0
        else:
            CL, stalled = CL_lin, 0.0
        # drag: build-up polar (CD0 incl. stopped rotors + induced) inside its range, parabola outside
        if self.polar_CL[0] <= CL <= self.polar_CL[-1]:
            CD = interp(CL, self.polar_CL, self.polar_CD)
        else:
            CD = self.CD0 + CL * CL / (math.pi * self.AR * self.e_fit)
        if stalled:
            CD += 1.2 * math.sin(alpha) ** 2 * stalled  # separated-wing drag (EST)
        Cm = self.Cm0 + self.Cma * alpha + self.Cmq * qhat + self.Cmde * de_deg
        if stalled:
            Cm += -0.3 * (alpha - a_s) if alpha > a_s else -0.3 * (alpha - a_sn)  # nose-down post-stall (EST)
        return CL, CD, Cm, stalled


# ----------------------------------------------------------------------------------------------- simulation
class C0Sim:
    def __init__(self, data: C0Data, wind=(0.0, 0.0), substeps=2):
        self.d = data
        self.wind = wind
        self.substeps = substeps
        self.reset()

    def reset(self):
        d = self.d
        self.t = 0.0
        zc = d.contacts[0][2]
        self.pos = [0.0, 0.0, -zc + 0.002]           # resting on the legs, slightly compressed
        self.vel = [0.0, 0.0, 0.0]
        self.q = q_from_euler(0.0, 0.0, 0.0)
        self.w = [0.0, 0.0, 0.0]
        self.lift_frac = [0.0] * 4                   # filtered thrust fraction per rotor
        self.pusher_n = 0.0
        self.soc = 1.0
        self.volt = 4.2 * d.cells
        self.current = 0.0
        self.accel_body = [0.0, 0.0, -G]
        self.airspeed = 0.0
        self.ctrl = dict(da=0.0, de=0.0, dr=0.0, thr=0.0, motors=[0.0] * 4)
        self.info = {}

    # ------------------------------------------------------------------ servo decode
    def decode(self, pwm):
        d = self.d
        c = dict(da=0.0, de=0.0, dr=0.0, thr=0.0, motors=[0.0] * 4)
        nr = {4: 0, 19: 0, 21: 0}
        for ch, s in d.servo.items():
            if ch - 1 >= len(pwm):
                continue
            v = pwm[ch - 1]
            if v <= 0:
                continue
            fn = s["fn"]
            if 33 <= fn <= 36:
                x = (v - 1000.0) / 1000.0            # Q_M_PWM_MIN/MAX 1000/2000 (vtol_c0.param)
                c["motors"][fn - 33] = min(1.0, max(0.0, x))
            elif fn == 70:
                x = (v - s["min"]) / max(1.0, s["max"] - s["min"])
                c["thr"] = min(1.0, max(0.0, x))
            elif fn in (4, 19, 21):
                span = (s["max"] - s["min"]) / 2.0
                u = (v - s["trim"]) / max(1.0, span)
                u = max(-1.0, min(1.0, u)) * (-1 if s["rev"] else 1)
                key = {4: "da", 19: "de", 21: "dr"}[fn]
                c[key] += u
                nr[fn] += 1
        for fn, key in ((4, "da"), (19, "de"), (21, "dr")):
            if nr[fn] > 1:
                c[key] /= nr[fn]
        # ArduPilot output convention (SIM_Plane.h defaults: c_l_deltaa +, c_m_deltae +, c_n_deltar +):
        # PWM above trim = roll right, nose up, nose right. Surface angles in AVL sign (+ = TE down / TE left):
        c["da_deg"] = c["da"] * EST["da_max_deg"]        # + = roll right command
        c["de_deg"] = -c["de"] * EST["de_max_deg"]       # AVL elevator (+ TE down) = -(nose-up command)
        c["dr_deg"] = c["dr"] * EST["dr_max_deg"]        # + = nose right command
        return c

    # ------------------------------------------------------------------ forces
    def forces(self, c, dt):
        d = self.d
        dcm = q_to_dcm(self.q)
        v_air_ned = vsub(self.vel, [self.wind[0], self.wind[1], 0.0])
        va_b = m_tmul(dcm, v_air_ned)
        Va = vnorm(va_b)
        self.airspeed = Va
        F = [0.0, 0.0, 0.0]
        M = [0.0, 0.0, 0.0]
        p, q_, r = self.w
        # ---- aero, attached-flow (linear AVL) model, faded out beyond the post-stall range
        u, v, w_ = va_b
        if Va > 0.3:
            alpha = math.atan2(w_, u)
            beta = math.asin(max(-1.0, min(1.0, v / Va)))
            # weight of the linear model: 1 inside the post-stall range, 0 once the flow is from the side/behind
            wl = min(1.0, max(0.0, (LIN_FADE_END - abs(alpha)) / (LIN_FADE_END - LIN_FADE_START)))
            wl *= min(1.0, max(0.0, (LIN_FADE_END - abs(beta)) / (LIN_FADE_END - LIN_FADE_START)))
            qbar = 0.5 * RHO * Va * Va
            V2 = 2 * Va
            phat, qhat, rhat = p * d.b / V2, q_ * d.c / V2, r * d.b / V2
            # taper the rate terms off at low speed (they blow up as 1/V)
            fade = min(1.0, Va / 4.0)
            phat, qhat, rhat = phat * fade, qhat * fade, rhat * fade
            beta_l = max(-BETA_CLAMP, min(BETA_CLAMP, beta))
            CL, CD, Cm, stalled = d.CL_CD_Cm(alpha, qhat, c["de_deg"])
            CY = d.CYb * beta_l + d.CYp * phat + d.CYr * rhat + d.CYdr * c["dr_deg"] + d.CYda * c["da_deg"]
            Cl = d.Clb * beta_l + d.Clp * phat + d.Clr * rhat + d.Clda * c["da_deg"] + d.Cldr * c["dr_deg"]
            Cn = d.Cnb * beta_l + d.Cnp * phat + d.Cnr * rhat + d.Cnda * c["da_deg"] + d.Cndr * c["dr_deg"]
            L, D, Y = qbar * d.S * CL * wl, qbar * d.S * CD * wl, qbar * d.S * CY * wl
            ca, sa, cb, sb = math.cos(alpha), math.sin(alpha), math.cos(beta), math.sin(beta)
            Fa = [-D * ca * cb + L * sa, -D * sb + Y, -D * sa * cb - L * ca]
            F = vadd(F, Fa)
            M = vadd(M, [qbar * d.S * d.b * Cl * wl, qbar * d.S * d.c * Cm * wl, qbar * d.S * d.b * Cn * wl])
            self.info.update(alpha=math.degrees(alpha), beta=math.degrees(beta), CL=CL, CD=CD, stalled=stalled, wl=wl)
        else:
            wl = 1.0
            self.info.update(alpha=0.0, beta=0.0, CL=0.0, CD=0.0, stalled=0.0, wl=wl)
        # ---- flat-plate model for separated / reversed flow (EST): normal force CN90 * 0.5 rho * w|w| on the
        # wing (at the CG) and on the H-tail (at -l_h, with the pitch-rate contribution, = pitch damping in a
        # hover descent), side force on fins + pod (at -l_h, with the yaw-rate contribution). Weighted (1 - wl).
        wp = 1.0 - wl
        CN = EST["flat_plate_CN"]
        if wp > 0.0:
            Fw = [0.0, 0.0, -0.5 * RHO * d.S * CN * w_ * abs(w_) * wp]
            F = vadd(F, Fw)
        w_t = w_ + q_ * d.l_h
        Ft = [0.0, 0.0, -0.5 * RHO * d.S_h * CN * w_t * abs(w_t) * max(wp, 0.15)]
        v_t = v - r * d.l_h
        Fs = [0.0, -0.5 * RHO * d.S_side * 1.0 * v_t * abs(v_t) * max(wp, 0.15), 0.0]
        tail_pos = [-d.l_h, 0.0, 0.0]
        F = vadd(F, vadd(Ft, Fs))
        M = vadd(M, vcross(tail_pos, vadd(Ft, Fs)))
        # wing roll damping from strip plate drag with no forward flow (EST, tiny in forward flight)
        M[0] += -0.5 * RHO * CN * d.c * p * abs(p) * (d.b / 2) ** 4 / 2
        # ---- lift rotors
        Tmax = d.Tmax_N(self.volt)
        P_lift = 0.0
        a = dt / max(dt, EST["lift_motor_tau_s"])
        for i, rot in enumerate(d.rotors):
            target = d.lift_thrust_frac(c["motors"][i])
            self.lift_frac[i] += a * (target - self.lift_frac[i])
            T = Tmax * self.lift_frac[i]
            P = d.lift_power_W(T) * (Tmax / (d.Tmax_g_22V / 1000 * G))  # table is at 22.2 V; scale with Tmax(V)
            P_lift += P
            rpm = d.lift_rpm_max * math.sqrt(max(self.lift_frac[i], 0.0))
            Q = EST["eta_motor"] * P / max(rpm * 2 * math.pi / 60.0, 50.0)
            Ft = [0.0, 0.0, -T]
            F = vadd(F, Ft)
            M = vadd(M, vcross(rot["pos"], Ft))
            M[2] += rot["dir"] * Q                       # CCW prop (dir +1) -> clockwise (positive) yaw reaction
        # ---- pusher
        n_ss, I_p = d.pusher_steady(c["thr"], va_b[0] if Va > 0.3 else 0.0, self.volt)
        ap = dt / max(dt, EST["pusher_tau_s"])
        self.pusher_n += ap * (n_ss - self.pusher_n)
        Tp = d.pusher_thrust(self.pusher_n, va_b[0] if Va > 0.3 else 0.0)
        Fp = [Tp, 0.0, 0.0]
        F = vadd(F, Fp)
        M = vadd(M, vcross(d.pusher_pos, Fp))
        P_push = c["thr"] * self.volt * I_p
        self.info.update(T_push=Tp, rpm_push=self.pusher_n * 60.0, I_push=I_p, P_lift=P_lift, P_push=P_push)
        # ---- battery
        self.current = (P_lift + P_push) / max(self.volt, 1.0)
        self.soc -= self.current * dt / 3600.0 / d.capacity_Ah
        self.soc = max(0.0, self.soc)
        dod = 1.0 - self.soc
        v_cell = 4.2 - 0.6 * dod if dod < 0.9 else 3.66 - 6.0 * (dod - 0.9)   # LiPo OCV ramp (EST)
        self.volt = max(3.0 * d.cells, v_cell * d.cells - self.current * EST["pack_R_ohm"])
        # ---- gravity
        F = vadd(F, m_tmul(dcm, [0.0, 0.0, d.mass * G]))
        # ---- ground contact (legs)
        onground = False
        for cp in d.contacts:
            p_ned = vadd(self.pos, m_mul(dcm, cp))
            if p_ned[2] > 0.0:
                onground = True
                v_ned = vadd(self.vel, m_mul(dcm, vcross(self.w, cp)))
                pen = p_ned[2]
                Fn = EST["ground_k"] * pen + EST["ground_c"] * max(v_ned[2], -5.0)
                Fn = max(Fn, 0.0)
                vh = [v_ned[0], v_ned[1]]
                sh = math.hypot(*vh)
                mu = EST["ground_mu"] * min(1.0, sh / 0.05)
                Fh = [-mu * Fn * vh[0] / max(sh, 1e-6), -mu * Fn * vh[1] / max(sh, 1e-6)]
                Fg_ned = [Fh[0], Fh[1], -Fn]
                Fg_b = m_tmul(dcm, Fg_ned)
                F = vadd(F, Fg_b)
                M = vadd(M, vcross(cp, Fg_b))
        self.info["onground"] = onground
        return F, M, dcm

    def step(self, pwm, dt):
        c = self.decode(pwm)
        self.ctrl = c
        h = dt / self.substeps
        d = self.d
        for _ in range(self.substeps):
            F, M, dcm = self.forces(c, h)
            # specific force (what the IMU sees): total minus gravity
            grav_b = m_tmul(dcm, [0.0, 0.0, d.mass * G])
            self.accel_body = vscale(vsub(F, grav_b), 1.0 / d.mass)
            acc_ned = vscale(m_mul(dcm, F), 1.0 / d.mass)
            # angular: I w' = M - w x (I w)
            Iw = [d.I["xx"] * self.w[0], d.I["yy"] * self.w[1], d.I["zz"] * self.w[2]]
            gyro = vcross(self.w, Iw)
            wd = [(M[0] - gyro[0]) / d.I["xx"], (M[1] - gyro[1]) / d.I["yy"], (M[2] - gyro[2]) / d.I["zz"]]
            if self.info.get("onground"):
                # extra rotational damping from the legs on the ground (EST), keeps the resting pose quiet
                wd = [wd[i] - 6.0 * self.w[i] for i in range(3)]
            self.w = vadd(self.w, vscale(wd, h))
            self.vel = vadd(self.vel, vscale(acc_ned, h))
            self.pos = vadd(self.pos, vscale(self.vel, h))
            dq = q_mult(self.q, [0.0, self.w[0], self.w[1], self.w[2]])
            self.q = q_normalize([self.q[i] + 0.5 * h * dq[i] for i in range(4)])
            self.t += h

    def json_state(self):
        return ('{"timestamp":%.6f,"imu":{"gyro":[%.6f,%.6f,%.6f],"accel_body":[%.5f,%.5f,%.5f]},'
                '"position":[%.5f,%.5f,%.5f],"velocity":[%.5f,%.5f,%.5f],'
                '"quaternion":[%.7f,%.7f,%.7f,%.7f],"airspeed":%.4f,'
                '"battery":{"voltage":%.3f,"current":%.3f}}\n'
                % (self.t, *self.w, *self.accel_body, *self.pos, *self.vel, *self.q, self.airspeed,
                   self.volt, self.current))


# ----------------------------------------------------------------------------------------------- validation
def validate(d: C0Data, out_json=None):
    rows = []
    print("C0 physics model - trim validation against the analysis predictions")
    print(f"  data: results.json generated {d.generated['results_json']}, aero_results.json generated "
          f"{d.generated['aero_results_json']}")
    print(f"  mass {d.mass:.3f} kg, S {d.S:.4f} m2, b {d.b:.2f} m, c {d.c:.4f} m, AR {d.AR:.2f}")
    print(f"  inertia EST (kg m2): Ixx {d.I['xx']:.3f}  Iyy {d.I['yy']:.3f}  Izz {d.I['zz']:.3f}")
    print(f"  rotors (x fwd, y right, z down, m from CG): " + ", ".join(
        f"M{r['n']} ({r['pos'][0]:+.3f},{r['pos'][1]:+.3f},{r['pos'][2]:+.3f})" for r in d.rotors))
    print(f"  leg contacts: {[[round(v, 3) for v in cpt] for cpt in d.contacts]}")
    print(f"  pusher at {[round(v, 3) for v in d.pusher_pos]} m, D {d.pusher_D:.4f} m, KV {d.pusher_KV:.0f}")
    print(f"  controls per deg (+ = roll right / nose up / nose right command): CLde {d.CLde:.5f} Cmde {d.Cmde:.5f} "
          f"Clda {d.Clda:.5f} Cnda {d.Cnda:.5f} CYda {d.CYda:.5f} CYdr {d.CYdr:.5f} Cndr {d.Cndr:.5f} Cldr {d.Cldr:.6f}")
    print(f"  rudder derivatives: {d.rudder_source}")
    print(f"  output map: " + ", ".join(f"S{ch}={s['fn']}" for ch, s in sorted(d.servo.items())))

    def row(name, model, pred, unit, note=""):
        dev = None if pred in (None, 0) else (model - pred) / abs(pred) * 100.0
        rows.append(dict(check=name, model=model, predicted=pred, unit=unit, dev_pct=dev, note=note))
        ds = "   -" if dev is None else f"{dev:+6.1f} %"
        print(f"  {name:<44s} model {model:9.3f}  predicted {pred if pred is not None else float('nan'):9.3f} {unit:<5s} {ds}  {note}")

    # 1. hover
    W = d.mass * G
    T_req = W / 4
    for volt, label in ((22.2, "22.2 V (maker table voltage, TEST-PLAN C07)"), (25.2, "25.2 V (Q_M_BAT_VOLT_MAX ref.)")):
        Tmax = d.Tmax_N(volt)
        y = T_req / Tmax                      # thrust fraction = what ArduPilot's linearised throttle commands
        k = EST["expo_phys"]
        x = (-(1 - k) + math.sqrt((1 - k) ** 2 + 4 * k * y)) / (2 * k)   # PWM fraction
        print(f"\n hover at {label}: per-motor thrust {T_req:.2f} N ({T_req / G * 1000:.0f} gf), Tmax {Tmax:.2f} N")
        row(f"hover thrust fraction (AP throttle) @{volt}V", y, d.pred["hover_T_g"] / d.Tmax_g_22V if volt == 22.2 else None,
            "-", "TEST-PLAN C07 0.52 = Tunit_g/Tmax_g at 22.2 V" if volt == 22.2 else "what Q_M_THST_HOVER learns at full pack")
        row(f"hover PWM fraction (expo {k}) @{volt}V", x, None, "-", "EST expo")
    P1 = d.lift_power_W(T_req)
    row("hover electrical power, 4 motors", 4 * P1, d.pred["P_hover_W"], "W", "maker table interp vs sizing FM*eta model")
    row("hover current at 22.2 V", 4 * P1 / 22.2, d.pred["I_hover"], "A", "")

    # 2. cruise trim at V_cruise: solve alpha, de for L + T sin(a) = W, Cm = 0 (two-variable Newton)
    V = d.pred["V_cruise"]
    qbar = 0.5 * RHO * V * V
    alpha, de = 0.03, -3.0

    def resid(al, dl):
        CL_, CD_, Cm_, _ = d.CL_CD_Cm(al, 0.0, dl)
        L_, D_ = qbar * d.S * CL_, qbar * d.S * CD_
        return L_ + D_ * math.tan(al) - W, Cm_        # thrust along body x: T = D / cos(a), lift share T sin(a)

    for _ in range(60):
        f1, f2 = resid(alpha, de)
        h = 1e-5
        g1, g2 = resid(alpha + h, de)
        k1, k2 = resid(alpha, de + h)
        j11, j21, j12, j22 = (g1 - f1) / h, (g2 - f2) / h, (k1 - f1) / h, (k2 - f2) / h
        det = j11 * j22 - j12 * j21
        alpha -= (f1 * j22 - f2 * j12) / det
        de -= (j11 * f2 - j21 * f1) / det
    CL, CD, Cm, _ = d.CL_CD_Cm(alpha, 0.0, de)
    D = qbar * d.S * CD
    T = D / math.cos(alpha)
    # pusher throttle for T at V (steady state, 22.2 V nominal)
    lo, hi = 0.0, 1.0
    for _ in range(40):
        x = 0.5 * (lo + hi)
        n, I = d.pusher_steady(x, V, 22.2)
        if d.pusher_thrust(n, V) < T:
            lo = x
        else:
            hi = x
    x = 0.5 * (lo + hi)
    n, I = d.pusher_steady(x, V, 22.2)
    tc = d.pred["trim_cruise"]
    print(f"\n level cruise at {V:.1f} m/s, 22.2 V")
    row("alpha", math.degrees(alpha), tc["alpha_deg"], "deg", "AVL trim")
    row("elevator (AVL sign, + TE down)", de, tc["elevator_deg"], "deg", "AVL trim")
    row("CL", CL, tc["CL"], "-", "")
    row("drag / pusher thrust", T, d.pred["D_cruise_N"], "N", "aero build-up D_N")
    row("pusher throttle (PWM fraction)", x, None, "-", "EST motor model")
    row("pusher rpm", n * 60, None, "rpm", "EST motor model (R, I0)")
    row("pusher electrical power", x * 22.2 * I, d.pred["P_cruise_W"], "W",
        "build-up assumes etaProp 0.60; APC data gives ~0.74 at this J")
    row("pusher current at 22.2 V", I, d.pred["P_cruise_W"] / 22.2, "A", "")
    J = V / (n * d.pusher_D)
    row("pusher advance ratio J", J, None, "-", "")
    # static pusher
    n0, I0_ = d.pusher_steady(1.0, 0.0, 22.2)
    row("pusher static thrust, full throttle 22.2 V", d.pusher_thrust(n0, 0.0) / G * 1000, None, "gf",
        f"{n0 * 60:.0f} rpm, {I0_:.1f} A, {22.2 * I0_:.0f} W (EST); maker motor max 615 W")
    n1, I1_ = d.pusher_steady(1.0, 0.0, 25.2)
    row("pusher static elec. power, full throttle 25.2 V", 25.2 * I1_, None, "W",
        "EST: exceeds the motor's 615 W rating - do not hold full pusher static on a full pack")

    # 3. stall speed: trimmed (Cm = 0) CL_max
    Vs_lo, Vs_hi = 8.0, 20.0
    for _ in range(50):
        Vs = 0.5 * (Vs_lo + Vs_hi)
        qb = 0.5 * RHO * Vs * Vs
        # alpha at CLmax with trimmed elevator: solve Cm=0 for de at alpha just below stall
        a_try = d.alpha0 + d.CLmax / d.CLa
        for _k in range(30):
            de_t = -(d.Cm0 + d.Cma * a_try) / d.Cmde
            a_try = d.alpha0 + (d.CLmax - d.CLde * de_t) / d.CLa
        L = qb * d.S * d.CLmax
        if L < W:
            Vs_lo = Vs
        else:
            Vs_hi = Vs
    print("\n stall (1 g, trimmed)")
    row("stall speed", Vs, d.pred["V_stall"], "m/s", "R11 12.0")
    row("alpha at stall", math.degrees(a_try), d.pred["trim_stall"]["alpha_deg"], "deg", "")
    row("elevator at stall (AVL sign)", de_t, d.pred["trim_stall"]["elevator_deg"], "deg", "")

    # 4. pitch stiffness check: static margin from Cma/CLa
    row("static margin Cma/CLa", -d.Cma / d.CLa * 100, d.pred["SM_pct"], "%MAC", "aero_results static_margin CG_28pct")
    print("\n estimates (EST) used by the model:")
    for k, v in EST.items():
        print(f"  {k:<26s} {v}")
    res = dict(generated=d.generated, mass_kg=d.mass, inertia_kg_m2=d.I, rotors=d.rotors, contacts=d.contacts,
               controls_per_deg=dict(CLde=d.CLde, Cmde=d.Cmde, Clda=d.Clda, Cnda=d.Cnda, CYda=d.CYda, CYdr=d.CYdr,
                                     Cndr=d.Cndr, Cldr=d.Cldr, rudder_source=d.rudder_source),
               pusher_pos=d.pusher_pos, checks=rows, EST=EST)
    if out_json:
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(res, f, indent=2)
        print(f"\n written {out_json}")
    return res


# ----------------------------------------------------------------------------------------------- server
def serve(d: C0Data, port, wind, log_path=None, verbose=False):
    sim = C0Sim(d, wind=wind)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("0.0.0.0", port))
    sock.settimeout(1.0)
    # side channel (UDP port+2): text commands from the test driver, e.g. "reset_battery", "wind 3,270"
    cmd_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    cmd_sock.bind(("127.0.0.1", port + 2))
    cmd_sock.setblocking(False)
    print(f"c0_physics: listening on UDP {port} (commands on {port + 2}); mass {d.mass:.3f} kg; "
          f"start SITL with --model JSON:127.0.0.1")
    fmt16, fmt32 = struct.Struct("<HHI16H"), struct.Struct("<HHI32H")
    last_count = None
    log = None
    if log_path:
        log = csv.writer(open(log_path, "w", newline=""))
        log.writerow(["t", "N", "E", "D", "vN", "vE", "vD", "roll", "pitch", "yaw", "airspeed", "alpha", "volt",
                      "current", "m1", "m2", "m3", "m4", "thr", "da", "de", "dr", "T_push", "rpm_push", "onground"])
    frames, t_wall0, last_print = 0, time.time(), 0.0
    while True:
        try:
            while True:
                cmd = cmd_sock.recv(256).decode(errors="replace").strip()
                if cmd == "reset_battery":
                    sim.soc, sim.volt = 1.0, 4.2 * d.cells
                    print("c0_physics: battery reset to a full pack")
                elif cmd.startswith("wind "):
                    spd, frm = (float(x) for x in cmd[5:].split(","))
                    sim.wind = (-spd * math.cos(math.radians(frm)), -spd * math.sin(math.radians(frm)))
                    print(f"c0_physics: wind {spd} m/s from {frm} deg")
        except (BlockingIOError, OSError, ValueError):
            pass
        try:
            data, addr = sock.recvfrom(1024)
        except socket.timeout:
            continue
        if len(data) == fmt16.size:
            u = fmt16.unpack(data)
        elif len(data) == fmt32.size:
            u = fmt32.unpack(data)
        else:
            continue
        magic, rate, count = u[0], u[1], u[2]
        if magic not in (18458, 29569):
            continue
        pwm = list(u[3:])
        if last_count is not None and count < last_count:
            print("c0_physics: SITL restarted (frame counter reset) - resetting physics")
            sim.reset()
        if last_count is not None and count == last_count:
            # SITL re-sent the last frame (it did not get our reply): answer again without stepping
            sock.sendto(sim.json_state().encode(), addr)
            continue
        last_count = count
        dt = 1.0 / max(50.0, float(rate))
        sim.step(pwm, dt)
        sock.sendto(sim.json_state().encode(), addr)
        frames += 1
        if log and frames % 20 == 0:
            r_, p_, y_ = q_to_euler(sim.q)
            c = sim.ctrl
            log.writerow([round(sim.t, 3)] + [round(v, 3) for v in sim.pos + sim.vel] +
                         [round(math.degrees(a), 2) for a in (r_, p_, y_)] +
                         [round(sim.airspeed, 2), round(sim.info.get("alpha", 0), 2), round(sim.volt, 2),
                          round(sim.current, 1)] + [round(m, 3) for m in c["motors"]] +
                         [round(c["thr"], 3), round(c["da_deg"], 1), round(c["de_deg"], 1), round(c["dr_deg"], 1),
                          round(sim.info.get("T_push", 0), 2), round(sim.info.get("rpm_push", 0)), int(sim.info.get("onground", 0))])
        if verbose and sim.t - last_print >= 2.0:
            last_print = sim.t
            r_, p_, y_ = q_to_euler(sim.q)
            print(f"t {sim.t:7.1f}s alt {-sim.pos[2]:6.1f} m  Va {sim.airspeed:5.1f}  rpy {math.degrees(r_):5.1f} "
                  f"{math.degrees(p_):5.1f} {math.degrees(y_):6.1f}  motors {['%.2f' % m for m in sim.ctrl['motors']]} "
                  f"thr {sim.ctrl['thr']:.2f}  I {sim.current:5.1f} A  V {sim.volt:5.2f}  x{sim.t / max(1e-3, time.time() - t_wall0):.1f}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", default=REPO, help="repo root (default: two levels above this file)")
    ap.add_argument("--params", nargs="*", default=[], help="extra param files after vtol_c0.param (SITL overrides)")
    ap.add_argument("--port", type=int, default=9002)
    ap.add_argument("--wind", default="0,0", help="steady wind 'speed_mps,from_deg' (EST, uniform)")
    ap.add_argument("--log", help="CSV log of the physics state (every 20th frame)")
    ap.add_argument("--validate", action="store_true", help="print trim checks and exit")
    ap.add_argument("--validate-json", help="write the validation table to this JSON file")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args()
    d = C0Data(repo=a.repo, param_files=a.params)
    if a.validate or a.validate_json:
        validate(d, a.validate_json)
        return 0
    spd, frm = (float(v) for v in a.wind.split(","))
    wind = (-spd * math.cos(math.radians(frm)), -spd * math.sin(math.radians(frm)))   # wind FROM frm -> blows to
    serve(d, a.port, wind, a.log, a.verbose)
    return 0


if __name__ == "__main__":
    sys.exit(main())
