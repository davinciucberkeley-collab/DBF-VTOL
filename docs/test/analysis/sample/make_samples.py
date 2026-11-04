#!/usr/bin/env python3
"""
make_samples.py - writes the three SYNTHETIC sample datasets used to prove the reduction scripts run.
Nothing here is measured. Shapes come from the maker table (budget-lift.md A3) and results.json;
noise is deterministic (fixed seed). Re-run to regenerate:  python make_samples.py
"""
import math, os, random
random.seed(7)
HERE = os.path.dirname(os.path.abspath(__file__))

# ---- thrust_sample.csv: X4110S-like curve, 20..100 % in 10 % steps, 22.2 V nominal with sag
with open(os.path.join(HERE, "thrust_sample.csv"), "w", encoding="utf-8") as f:
    f.write("throttle_pct,thrust_g,volt_V,curr_A\n")
    for thr in range(20, 101, 10):
        x = thr / 100
        t = 3130 * (0.28 * x + 0.72 * x * x)           # ArduPilot expo 0.72 shape, max = maker 3130 g
        i = 27.7 * (t / 3130) ** 1.5 * (1 + random.uniform(-0.02, 0.02))   # current ~ T^1.5 (ideal power law)
        v = 22.8 - 0.03 * i
        t *= 1 + random.uniform(-0.015, 0.015)
        f.write(f"{thr},{t:.0f},{v:.2f},{i:.2f}\n")

# ---- battery_sample.csv: 16 A discharge from 25.0 V with a hover step and a transition step at ~50 %
rows = []
t = 0.0; ah = 0.0; cap_ah = 6.3; r_pack = 0.034  # 5.7 mOhm/cell (the step also sees OCV droop)
def ocv(soc):  # rough 6S OCV curve 4.15..3.55 V/cell
    return 6 * (3.55 + 0.60 * soc ** 1.3 if soc > 0.08 else 3.55 - (0.08 - soc) * 8)
step_hover = (600, 610); step_trans = (730, 733)   # near 50 % delivered at 16 A (6.3 Ah -> ~1,400 s)
while t < 7200:
    if step_hover[0] <= t < step_hover[1]:
        i, step = 40.0, "hover"
    elif step_trans[0] <= t < step_trans[1]:
        i, step = 73.0, "transition"
    else:
        i, step = 16.0, ""
    dt = 1.0 if step else 30.0
    soc = 1 - ah / cap_ah
    v = ocv(soc) - i * r_pack
    rows.append((t, v, i, step))
    if v <= 20.0 and not step:   # step pulses sag below the cut-off briefly; only the steady discharge ends the log
        break
    ah += i * dt / 3600; t += dt
with open(os.path.join(HERE, "battery_sample.csv"), "w", encoding="utf-8") as f:
    f.write("t_s,volt_V,curr_A,step\n")
    for t, v, i, s in rows:
        f.write(f"{t:.0f},{v:.3f},{i:.1f},{s}\n")

# ---- flight_sample.log: Mission Planner-style text export of a short synthetic mission
#      QLOITER 70 s -> FBWA transition 12 s -> CRUISE 620 s -> QLOITER 60 s -> QLAND 20 s
L = []
L.append("FMT, 128, 89, FMT, BBnNZ, Type,Length,Name,Format,Columns")
L.append("FMT, 1, 20, MODE, QMBB, TimeUS,Mode,ModeNum,Rsn")
L.append("FMT, 2, 40, QTUN, Qffffff, TimeUS,ThI,ThO,DAlt,Alt,CRt,TrnMs")
L.append("FMT, 3, 40, RCOU, QHHHHHHHHHHHH, TimeUS,C1,C2,C3,C4,C5,C6,C7,C8,C9,C10,C11,C12")
L.append("FMT, 4, 32, VIBE, QfffIII, TimeUS,VibeX,VibeY,VibeZ,Clip0,Clip1,Clip2")
L.append("FMT, 5, 40, BAT, QBfffffff, TimeUS,Inst,Volt,VoltR,Curr,CurrTot,EnrgTot,Temp,Res")
L.append("FMT, 6, 30, ARSP, Qffffff, TimeUS,Airspeed,DiffPress,Temp,RawPress,Offset,Ratio")
L.append("FMT, 7, 30, GPS, QBfffff, TimeUS,Status,NSats,HDop,Spd,GCrs,VZ")
L.append("FMT, 8, 40, ATT, Qffffff, TimeUS,DesRoll,Roll,DesPitch,Pitch,DesYaw,Yaw")
phases = [(19, "QLOITER", 70), (5, "FBWA", 12), (7, "CRUISE", 620), (19, "QLOITER", 60), (20, "QLAND", 20)]
t = 0.0; mah = 0.0; wh = 0.0; vmin = 25.0
for modenum, name, dur in phases:
    L.append(f"MODE, {int(t*1e6)}, {name}, {modenum}, 1")
    t_end = t + dur; tp0 = t
    while t < t_end:
        us = int(t * 1e6)
        q = modenum in (19, 20)
        if q:
            tho = 0.51 + random.uniform(-0.02, 0.02) if modenum == 19 else 0.44
            lift = [int(1000 + 1000 * (tho + d)) for d in (0.01, -0.01, 0.0, 0.0)]
            cur = 40.0 * tho / 0.51 + random.uniform(-1, 1); asp = 0.0; gs = 0.5; pit = 0.0
            L.append(f"QTUN, {us}, {tho:.3f}, {tho:.3f}, 5.0, 5.0, 0.0, 0")
        elif modenum == 5:
            frac = (t - tp0) / dur
            asp = 2 + 16 * frac; gs = asp - 2.0; lift = [int(1000 + 1000 * max(0.0, 0.51 - 0.5 * frac))] * 4
            cur = 70 - 40 * frac; pit = 3.0
            L.append(f"QTUN, {us}, 0.4, 0.4, 30.0, 30.0, 0.0, {int(1000 * (t - tp0))}")
        else:
            asp = 20 + random.uniform(-0.8, 0.8); gs = asp - 2.0 + random.uniform(-0.3, 0.3); lift = [1000] * 4
            cur = 14.5 + random.uniform(-1, 1); pit = 2.0
        v = 25.0 - 0.0007 * mah - 0.03 * cur
        vmin = min(vmin, v)
        L.append(f"RCOU, {us}, 1500, 1500, 1500, 1500, {lift[0]}, {lift[1]}, {lift[2]}, {lift[3]}, {int(1000 + 10 * cur)}, 1000, 1500, 1000")
        L.append(f"VIBE, {us}, {8 + 4*random.random():.2f}, {7 + 4*random.random():.2f}, {12 + 5*random.random():.2f}, 0, 0, 0")
        L.append(f"BAT, {us}, 0, {v:.2f}, {v + 0.03*cur:.2f}, {cur:.2f}, {mah:.1f}, {wh:.2f}, 30.0, 0.04")
        L.append(f"ARSP, {us}, {asp:.2f}, {0.5*1.225*asp*asp:.1f}, 20.0, 0.0, 0.0, 2.0")
        L.append(f"GPS, {us}, 3, 14, 0.8, {gs:.2f}, 90.0, 0.0")
        L.append(f"ATT, {us}, 0.0, {random.uniform(-3,3):.2f}, {pit:.1f}, {pit + random.uniform(-2,2):.2f}, 90.0, 90.0")
        mah += cur * 1.0 / 3.6; wh += v * cur / 3600; t += 1.0
with open(os.path.join(HERE, "flight_sample.log"), "w", encoding="utf-8") as f:
    f.write("\n".join(L) + "\n")
print("wrote thrust_sample.csv, battery_sample.csv, flight_sample.log (synthetic)")
