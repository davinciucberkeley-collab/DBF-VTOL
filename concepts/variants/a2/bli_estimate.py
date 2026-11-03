#!/usr/bin/env python3
"""a2 BLI pusher: boundary-layer, drag, actuator-disc BLI power, CG, ground-clearance estimates.

Every output is an ESTIMATE (est:true).  Inputs come from the repo (cited inline) or are labelled.
Run:  python3 -I concepts/variants/a2/bli_estimate.py  ->  writes bli_estimate.json next to it.

Methods (formulas, all textbook):
  Edge velocity   : axial line-source distribution, q(xi) = V dS/dxi, S = pi r^2 (slender-body potential flow),
                    Ue = sqrt((V+u')^2 + v'^2) at the surface.  Prop suction NOT included (prop-off = conservative: thicker BL).
  Boundary layer  : axisymmetric momentum integral + Head entrainment
                    d(theta)/ds = Cf/2 - (H+2) theta/Ue dUe/ds - theta/r dr/ds
                    d(Ue r theta H1)/ds = Ue r 0.0306 (H1-3)^-0.6169
                    H1 = 3.3 + 0.8234 (H-1.1)^-1.287 (H<=1.6) else 3.3 + 1.5501 (H-0.6778)^-3.064
                    Cf = 0.246 10^(-0.678 H) Re_theta^-0.268 (Ludwieg-Tillmann);  delta = theta (H1 + H)
  Body drag       : Squire-Young for a body of revolution, D = 2 pi r_e theta_e rho V^2 (Ue/V)^((H+5)/2) at the pod end
  BLI power       : ideal actuator disc, uniform total-pressure rise dp, u_j = sqrt(u^2 + 2 dp/rho)
                    thrust balance  integral rho u (u_j - V) dA = D_total - M_def   (M_def = ingested momentum deficit)
                    P = dp * integral u dA ;  PSC = (P_noBLI - P_BLI)/P_noBLI
"""
import json, math
import numpy as np

RHO, V, NU = 1.225, 20.0, 1.460e-5          # ISA sea level; V = results.json base.Vc
S_REF, D_TOT_C0 = 0.57282037, 9.3135837     # analysis/results.json concepts.C0.sized (S, D_cruise)
ETA_P, ETA_ME = 0.6, 0.85                   # results.json base etaProp, etaMEc
R_POD, R_END, L_NOSE, S_CYL = 0.08, 0.03, 0.22, 0.50   # cad/params.txt fusR, tailR; fusion/build_vtol_fusion.py fuselage()


def body(L_tail):
    """C0 pod profile with a tail of length L_tail starting at s=0.50 (C0: L_tail 0.35)."""
    L = S_CYL + L_tail
    def r(s):
        if s < L_NOSE:
            return R_POD * math.sqrt(max(0.0, 1 - ((s - L_NOSE) / L_NOSE) ** 2))
        if s < S_CYL:
            return R_POD
        if s < L:
            u = (s - S_CYL) / L_tail
            return R_END + (R_POD - R_END) * (1 - u * u * (3 - 2 * u))
        return R_END
    return L, r


def hub(s_end, r_end_body):
    """Motor bell + spinner continuation behind the pod end (cad/params.txt pushMotorD 0.048, pushMotorL 0.032; spinner EST 0.04 ogive)."""
    pts = []
    sb = 0.006                                   # firewall/bulkhead step
    return pts


def full_profile(L_tail, n=2400):
    L, r = body(L_tail)
    s_prop = L + 0.038                           # prop hub plane 38 mm aft of pod end (C0: -0.438 vs -0.400)
    s = np.linspace(0, s_prop, n)
    rr = np.array([r(x) if x <= L else (0.024 if x < s_prop else 0.024) for x in s])
    return L, s_prop, s, rr


def edge_velocity(s, rr, nsrc=1200):
    xi = np.linspace(0, s[-1], nsrc)
    S = math.pi * np.interp(xi, s, rr) ** 2
    q = V * np.gradient(S, xi)
    dxi = xi[1] - xi[0]
    Ue = np.zeros_like(s)
    for i, (x, r0) in enumerate(zip(s, rr)):
        r0 = max(r0, 1e-3)
        d3 = ((x - xi) ** 2 + r0 ** 2) ** 1.5
        # soften the self-point (source blob of radius ~ r0)
        u = np.sum(q * (x - xi) / (4 * math.pi * d3)) * dxi
        v = np.sum(q * r0 / (4 * math.pi * d3)) * dxi
        Ue[i] = math.hypot(V + u, v)
    return Ue


def head(s, rr, Ue, s_trip=0.10):
    """Axisymmetric Head method from a tripped turbulent start at s_trip."""
    i0 = int(np.searchsorted(s, s_trip))
    th = 0.664 * math.sqrt(NU * s[i0] / Ue[i0]) * 1.8 + 1e-5      # turbulent start: laminar theta inflated x1.8 (EST)
    H = 1.4
    def H1f(H):
        return 3.3 + 0.8234 * (H - 1.1) ** -1.287 if H <= 1.6 else 3.3 + 1.5501 * (H - 0.6778) ** -3.064
    def Hf(H1):
        # invert H1(H)
        if H1 >= 3.3 + 0.8234 * (1.6 - 1.1) ** -1.287:
            return 1.1 + ((H1 - 3.3) / 0.8234) ** (-1 / 1.287)
        return 0.6778 + ((H1 - 3.3) / 1.5501) ** (-1 / 3.064)
    H1 = H1f(H)
    out = {k: np.zeros_like(s) for k in ("theta", "H", "Cf", "delta", "dstar")}
    dUe = np.gradient(Ue, s); dr = np.gradient(rr, s)
    for i in range(i0, len(s)):
        ds = s[i] - s[i - 1] if i > i0 else 1e-6
        Ret = Ue[i] * th / NU
        Cf = 0.246 * 10 ** (-0.678 * H) * Ret ** -0.268
        if i > i0:
            dth = Cf / 2 - (H + 2) * th / Ue[i] * dUe[i] - th / max(rr[i], 1e-3) * dr[i]
            th = max(th + dth * ds, 1e-6)
            Z = Ue[i] * rr[i] * th * H1                       # entrainment variable
            F = 0.0306 * max(H1 - 3.0, 0.05) ** -0.6169
            Zn = Z + Ue[i] * rr[i] * F * ds
            H1 = Zn / (Ue[i] * rr[i] * th)
            H = min(max(Hf(max(H1, 3.05)), 1.15), 3.2)
        out["theta"][i], out["H"][i], out["Cf"][i] = th, H, Cf
        out["dstar"][i] = H * th
        out["delta"][i] = th * (H1 + H)
    return out, i0


def pod_drag(s, rr, Ue, bl, L_idx):
    """Skin friction integral (to the pod end) and Squire-Young total at the pod end."""
    q = 0.5 * RHO
    i0 = int(np.searchsorted(s, 0.10))
    fr = 0.0
    for i in range(max(i0, 1), L_idx):
        ds = s[i] - s[i - 1]
        dr = rr[i] - rr[i - 1]
        fr += q * Ue[i] ** 2 * bl["Cf"][i] * 2 * math.pi * rr[i] * math.hypot(ds, dr) * (ds / math.hypot(ds, dr))  # axial projection
    # laminar+nose part (0..0.10): flat-plate laminar Cf = 1.328/sqrt(Re) on the nose
    nose_area = 2 * math.pi * float(np.trapezoid(rr[:i0 + 1], s[:i0 + 1]))
    fr += q * V ** 2 * 1.328 / math.sqrt(V * 0.10 / NU) * nose_area * 0.5
    r_e, th_e, H_e, Ue_e = rr[L_idx], bl["theta"][L_idx], bl["H"][L_idx], Ue[L_idx]
    sy = 2 * math.pi * r_e * th_e * RHO * V ** 2 * (Ue_e / V) ** ((H_e + 5) / 2)
    return fr, sy


def swet_vol(L_tail):
    L, r = body(L_tail)
    s = np.linspace(0, L, 4000)
    rr = np.array([r(x) for x in s])
    ds = s[1] - s[0]
    dr = np.gradient(rr, s)
    S = float(np.sum(2 * math.pi * rr * np.sqrt(1 + dr ** 2)) * ds)
    Vol = float(np.sum(math.pi * rr ** 2) * ds)
    slope = np.degrees(np.arctan(np.abs(dr[s > S_CYL])))
    return dict(L=L, fineness=L / (2 * R_POD), S_wet=S, vol=Vol, max_halfangle_deg=float(slope.max()),
                mean_halfangle_deg=math.degrees(math.atan((R_POD - R_END) / L_tail)))


def swirl_free_disc(D, r_hub, delta, H, r_body_edge, T_total, M_def_frac=1.0, D_pod=None):
    """Ideal actuator-disc power with and without BLI.  Profile u/Ue = (y/delta)^(1/n), n = 2/(H-1)."""
    n = max(2.0 / (H - 1.0), 2.5)
    Rp = D / 2
    A = math.pi * (Rp ** 2 - r_hub ** 2)
    # radial grid
    r = np.linspace(r_hub, Rp, 4000)
    dA = 2 * math.pi * r * (r[1] - r[0])
    y = r - r_hub
    u = np.where(y < delta, V * (np.clip(y, 1e-9, None) / delta) ** (1 / n), V)
    M_def = float(np.sum(RHO * u * (V - u) * dA))               # momentum deficit inside the disc (N)
    # non-BLI: uniform inflow, T = T_total
    # rho V A (uj - V) = T -> uj
    uj = V + T_total / (RHO * V * A)
    P_non = 0.5 * RHO * V * A * (uj ** 2 - V ** 2)
    # BLI: required momentum excess = T_total - M_def  (pod drag recovered by the deficit already in the flow)
    Treq = T_total - M_def_frac * M_def
    # find dp s.t. integral rho u (sqrt(u^2+2dp/rho) - V) dA = Treq
    lo, hi = 0.0, 5000.0
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        Tm = float(np.sum(RHO * u * (np.sqrt(u ** 2 + 2 * mid / RHO) - V) * dA))
        lo, hi = (mid, hi) if Tm < Treq else (lo, mid)
    dp = 0.5 * (lo + hi)
    P_bli = dp * float(np.sum(u * dA))
    ing_area = float(np.sum(np.where(y < delta, dA, 0.0)))
    w_mean = float(np.sum((1 - u / V) * dA) / A)                 # area-mean wake fraction
    return dict(D_m=D, disc_area_m2=A, delta_m=delta, n_profile=n, ingested_area_frac=ing_area / A,
                mean_wake_fraction=w_mean, M_def_N=M_def, T_total_N=T_total,
                P_ideal_noBLI_W=P_non, P_ideal_BLI_W=P_bli, PSC=(P_non - P_bli) / P_non,
                eta_froude_noBLI=T_total * V / P_non)


def solve_delta(M, n, r_hub=0.024, Rp=0.1778):
    """Wake depth delta such that the power-law wake (u/V=(y/delta)^(1/n)) carries momentum deficit M (N)."""
    r = np.linspace(r_hub, Rp, 6000); dA = 2 * math.pi * r * (r[1] - r[0]); y = r - r_hub
    def Md(d):
        u = np.where(y < d, V * (np.clip(y, 1e-9, None) / d) ** (1 / n), V)
        return float(np.sum(RHO * u * (V - u) * dA))
    lo, hi = 1e-4, 0.5
    for _ in range(60):
        m = 0.5 * (lo + hi)
        lo, hi = (m, hi) if Md(m) < M else (lo, m)
    return 0.5 * (lo + hi)


def main():
    out = {"est": True, "inputs": dict(rho=RHO, V=V, nu=NU, D_total_C0_N=D_TOT_C0)}
    cases = {}
    for name, Lt in (("C0_tail_0.35", 0.35), ("a2_tail_0.45", 0.45), ("tail_0.60_sensitivity", 0.60)):
        L, s_prop, s, rr = full_profile(Lt)
        Ue = edge_velocity(s, rr)
        bl, i0 = head(s, rr, Ue)
        L_idx = int(np.searchsorted(s, L)) - 1
        P_idx = len(s) - 1
        fr, sy = pod_drag(s, rr, Ue, bl, L_idx)
        g = swet_vol(Lt)
        dpl = dict(
            geometry=g, Ue_over_V_at_pod_end=float(Ue[L_idx] / V), theta_end_mm=float(bl["theta"][L_idx] * 1e3),
            H_end_prop_off=float(bl["H"][L_idx]), H_max_prop_off=float(bl["H"][i0:].max()),
            delta_flat_plate_at_pod_end_mm=float(0.37 * L * (V * L / NU) ** -0.2 * 1e3),
            Re_L=V * L / NU, friction_drag_N=float(fr), squire_young_total_N=float(sy),
            Cf_turb=0.455 / math.log10(V * L / NU) ** 2.58)
        dpl["FF_raymer"] = 1 + 60 / g["fineness"] ** 3 + g["fineness"] / 400
        dpl["D_raymer_N"] = float(dpl["Cf_turb"] * g["S_wet"] * dpl["FF_raymer"] * 0.5 * RHO * V ** 2)
        dpl["phi_pod_over_D_total"] = float(sy / D_TOT_C0)
        # wake depth at the prop plane from momentum conservation (Head delta is unreliable: delta/r >> 1 on the tail)
        dpl["delta_wake_mm"] = {f"n={n}": solve_delta(sy, n) * 1e3 for n in (4, 5, 7)}
        dpl["bli_sweep"] = []
        for n in (4, 5, 7):
            d = solve_delta(sy, n)
            for D in (0.3556, 0.3048, 0.254):
                r_ = swirl_free_disc(D, 0.024, d, 1 + 2 / n, None, D_TOT_C0)
                r_.update(n=n, eta_F_loss_vs_14in=None)
                dpl["bli_sweep"].append({k: (float(v) if isinstance(v, (np.floating, float)) else v) for k, v in r_.items()})
        cases[name] = dpl
    out["cases"] = cases

    # ------------------------------------------------------------ aircraft-level deltas (a2 = tail 0.45 m)
    c0, a2 = cases["C0_tail_0.35"], cases["a2_tail_0.45"]
    q = 0.5 * RHO * V ** 2
    W0, m0 = 60.626382, 6.1821705                       # results.json sized.W, sized.m
    CDi0, hov0, Pc0 = 0.0073845426, 831.97545, 365.23858
    pack_Wh, t_hover, t_trans = 144.3, 120.0, 40.0
    # structure: printed PETG single-wall cone (0.5 mm wall EST, rho 1270 kg/m^3 EST) + 2 joint rings (EST 9 g each)
    # minus the C0 XPS cone shell it replaces (5 mm XPS at rhoFoam 32 kg/m^3 + tape, EST 0.29 kg/m^2 over the C0 cone area)
    S_cone_a2, S_cone_c0 = 0.15669, 0.12245            # integrated 0.50 -> end, see main(); m^2
    m_cone, m_rings, m_old = S_cone_a2 * 0.5e-3 * 1270, 0.018, S_cone_c0 * 0.29
    d_struct = m_cone + m_rings - m_old
    d_wire = 0.018                                    # 0.30 m of 14 AWG phase extension (EST 8 g) + 2 XT60H pairs + 1 JR pair at the tail joint (EST 10 g)
    dm = d_struct + d_wire
    m1 = m0 + dm
    dm_motor = 0.165 + 0.037                              # motor + APC 14x8.5EP (results.json mMotor; pusher-battery-servo.md 1c)
    shift = 0.10                                          # aft move of motor and prop
    x_cg0 = -0.066829043
    dMx = -dm_motor * shift + (m_cone + m_rings) * -0.26 - m_old * -0.22 + d_wire * -0.30
    x_cg_noFix = (m0 * x_cg0 + dMx) / m1
    M_pod = 0.6 + 0.25 + 0.227 + 0.82 + 0.5 + dm          # pod-fixed group: pod, avionics, pusher set, battery, payload, new
    d_pod = (m1 * x_cg0 - (m0 * x_cg0 + dMx)) / M_pod     # forward slide of the pod group on the wing saddle
    chord = 0.238675
    hov1 = hov0 * (m1 / m0) ** 1.5
    CDi1 = CDi0 * ((m1 / m0)) ** 2
    dD_induced = (CDi1 - CDi0) * q * S_REF
    dD_pod_lo, dD_pod_hi = 0.0, a2["squire_young_total_N"] - c0["squire_young_total_N"]
    dD = dD_induced + 0.5 * (dD_pod_lo + dD_pod_hi)
    Pc1 = Pc0 + dD * V / (ETA_P * ETA_ME)
    t_c0 = (pack_Wh * 0.8 * 0.95 * 3600 - hov0 * (t_hover + t_trans)) / Pc0 / 60
    t_c1 = (pack_Wh * 0.8 * 0.95 * 3600 - hov1 * (t_hover + t_trans)) / Pc1 / 60
    # ground / tail-strike (rear gear at x=-0.41458; prop tip y=-0.208; leg bottom y=-0.2437; wheels +0.048)
    def strike(dx_tip, h0):
        return math.degrees(math.atan2(h0, dx_tip))
    x_leg_r = -0.41458
    x_prop_c0 = -0.438
    x_prop_a2 = -0.438 - shift + d_pod
    air = dict(
        m_cone_kg=m_cone, m_rings_kg=m_rings, m_old_cone_kg=m_old, d_struct_kg=d_struct, d_wire_kg=d_wire, dm_kg=dm, m1_kg=m1, x_cg_unfixed_m=x_cg_noFix,
        cg_pct_mac_unfixed=28.0 + 100 * (x_cg0 - x_cg_noFix) / chord, pod_slide_fwd_m=d_pod, M_pod_group_kg=M_pod,
        hover_W=hov1, dD_induced_N=dD_induced, dD_pod_N_range=[dD_pod_lo, dD_pod_hi], dD_total_N=dD, P_cruise_W=Pc1,
        t_cruise_min_C0=t_c0, t_cruise_min_a2=t_c1,
        tail_strike_deg=dict(
            C0_no_wheels=strike(x_leg_r - x_prop_c0 if False else abs(x_prop_c0 - x_leg_r), 0.0357),
            C0_wheels=strike(abs(x_prop_c0 - x_leg_r), 0.0837),
            a2_no_wheels=strike(abs(x_prop_a2 - x_leg_r), 0.0357),
            a2_wheels=strike(abs(x_prop_a2 - x_leg_r), 0.0837)),
        prop_plane_x_m=x_prop_a2, gap_prop_to_Htail_LE_m=x_prop_a2 + 0.77048 if False else abs(x_prop_a2 - (-0.77048)),
        lift_disc_lateral_gap_m=0.4337 - 0.2159 - 0.1778)
    out["aircraft"] = air
    json.dump(out, open("concepts/variants/a2/bli_estimate.json", "w"), indent=1, default=float)
    for k, v in cases.items():
        print(k, {a: (round(b, 4) if isinstance(b, float) else b) for a, b in v.items() if a not in ("geometry", "bli_sweep", "delta_wake_mm")})
        print("   geo", {a: round(b, 4) for a, b in v["geometry"].items()}, "delta_wake", {a: round(b, 1) for a, b in v["delta_wake_mm"].items()})
        for r_ in v["bli_sweep"]:
            if r_["n"] == 5: print("    n5 D", r_["D_m"], "ing%", round(100 * r_["ingested_area_frac"], 1), "w%", round(100 * r_["mean_wake_fraction"], 2), "PSC%", round(100 * r_["PSC"], 2), "Pid", round(r_["P_ideal_noBLI_W"], 1), "etaF", round(r_["eta_froude_noBLI"], 3))
    print(json.dumps(air, indent=1, default=float))


if __name__ == "__main__":
    main()
