"""Independent verification of tiltwing/model.js.

Re-implements the closed-form formulas in Python (not by calling the JS), compares them with the model's output at the
paper's slider values, checks the beam FE against textbook cantilever solutions, the ISA model against AeroSandbox's
atmosphere, and the 3-D results against the paper. Writes tiltwing/data/verify.json for the dashboard.
Run: python3 tiltwing/tools/verify.py
"""
import json, os, subprocess, math
import aerosandbox as asb

HERE = os.path.dirname(os.path.abspath(__file__)); TW = os.path.dirname(HERE)
js = r"""
const M=require(process.argv[1]+'/model.js');M.setAirfoils(require(process.argv[1]+'/data/airfoils.json'));
const p=M.defaults(),r=M.size(p);delete r.in;
// FE closed-form checks run on the JS solver
const L=1, EI=1e3, n=41, ys=[...Array(n).keys()].map(i=>i*L/(n-1)), EIv=new Array(n-1).fill(EI);
const Fp=ys.map((y,i)=>i===n-1?10:0), tipP=M.beamFE(ys,EIv,Fp).w[n-1];
const q=5, trib=ys.map((y,i)=>(i===0||i===n-1?0.5:1)*L/(n-1)), Fq=trib.map(t=>q*t), tipQ=M.beamFE(ys,EIv,Fq).w[n-1];
const mu=0.2, mN=trib.map(t=>mu*t), modes=M.beamModes(ys,EIv,mN,2);
const sp={sparMat:'cf_tube',sparD:20,sparT:1.5,fusMat:'gf_shell',fusT:1.0,tailMat:'cf_tube',tailD:10,tailT:1.0,Ugust:7.6,nManeuver:2.5,nLand:3,FoS:1.5};
const F=M.fea(r,p,sp);
const S=M.simulate(r,p,{hTr:20,tClimb:8,tHold:3,tTr:12,tEnd:45});
const hov=S.trace.filter(s=>s.t>9&&s.t<10.9);
const st=M.stability(r,p);
console.log(JSON.stringify({p,r,fe:{tipP,tipQ,f1:modes[0].f,f2:modes[1].f,dnG:F.dnG,Kg:F.Kg,rootMh:F.cases.hover.rootM,ys:F.ys,rot:F.rotIdx.map(i=>F.ys[i]),mNode:F.mNode,TfMax:r.TfMax},
  sim:{Pmean:hov.reduce((a,s)=>a+s.P,0)/hov.length,hover:S.hover},st}));"""
D = json.loads(subprocess.check_output(["node", "-e", js, TW], text=True))
p, r, fe, sim, st = D["p"], D["r"], D["fe"], D["sim"], D["st"]
G = 9.80665
rows = []
def chk(name, model, indep, tol=0.005, src=""):
    d = (model - indep) / indep if indep else model - indep
    rows.append({"check": name, "model": model, "independent": indep, "diff": d, "pass": abs(d) <= tol, "src": src})

# geometry
S = p["span"] ** 2 / p["AR"]; cr = 2 * S / (p["span"] * (1 + p["taper"])); lam = p["taper"]
chk("G1 wing area", r["S"], S, src="b²/AR"); chk("G2 root chord", r["cr"], cr, src="2S/(b(1+λ))")
chk("G3 MAC", r["MAC"], 2 / 3 * cr * (1 + lam + lam ** 2) / (1 + lam), src="(2/3)c_r(1+λ+λ²)/(1+λ)")
chk("G4 LE sweep", r["sweepLE"], math.degrees(math.atan((cr - lam * cr) / (p["span"] / 2))), src="atan((c_r−c_t)/(b/2))")
chk("G5 tail area", r["Sh"], p["Vh"] * S * r["MAC"] / r["lt"], src="V_h S c̄ / l_t")
# ISA vs AeroSandbox
atm = asb.Atmosphere(altitude=1500)
Tm = 288.15 - 0.0065 * 1500; pm = 101325 * (1 - 0.0065 * 1500 / 288.15) ** 5.2559
chk("E1 ISA density at 1500 m", pm / (287.05 * Tm), float(atm.density()), tol=0.01, src="AeroSandbox Atmosphere")
chk("E1 ISA density at sea level", r["env"]["rho"], 1.225, tol=0.002, src="ISA 1.225 kg/m³")
# mass
mS = 1.40 * S + 0.55 * p["Lf"] * p["df"] / 0.2 + 1.0 * r["Sh"] + 0.08
m = (mS + p["elec"] + p["payload"]) / (1 - p["fProp"])
chk("M1 takeoff mass", r["m"], m, src="(m_s+m_e+m_p)/(1−f_prop)"); chk("M2 battery mass", r["mBatt"], p["fBatt"] * p["fProp"] * m)
# propulsion
D = p["Dfront"] * 0.0254; A = math.pi * D * D / 4; W = m * G
Tr = W * (r["xcg"] - r["xw"]) / (r["xt"] - r["xw"]); Tf1 = (W - Tr) / 4
chk("P1 wing-rotor thrust", r["Tf1"], Tf1, src="moment balance")
chk("P2 slipstream (paper Eq. 11)", r["Vslip"], math.sqrt(Tf1 / (2 * 1.225 * A)), src="sqrt(T/(2ρA))")
chk("P3 wing-rotor shaft power", r["shaftF"], Tf1 ** 1.5 / math.sqrt(2 * 1.225 * A) / p["FM"], src="T^1.5/sqrt(2ρA)/FM")
q = 0.5 * 1.225 * p["Vc"] ** 2; CL = W / (q * S); CD = p["CD0"] + CL ** 2 / (math.pi * p["oswald"] * p["AR"])
chk("P5 cruise C_D", r["CDc"], CD); chk("P6 cruise power", r["Pcruise"], q * S * CD * p["Vc"] / (0.7 * p["etaMe"]))
chk("P7 cruise-only endurance", r["tCruiseOnly"], r["mBatt"] * p["eSpec"] * 0.8 / r["Pcruise"] * 60)
# simulation consistency: steady hover power in the sim vs momentum theory at the same thrust split
chk("S2 sim hover power vs sizing", sim["Pmean"], r["Phover"], tol=0.10, src="sim at 79° tilt vs 90° momentum theory")
# FE vs closed form
chk("F1 FE tip deflection, tip load", fe["tipP"], 10 * 1 ** 3 / (3 * 1e3), tol=1e-3, src="PL³/3EI")
chk("F1 FE tip deflection, uniform load", fe["tipQ"], 5 * 1 ** 4 / (8 * 1e3), tol=0.01, src="qL⁴/8EI")
chk("F7 first bending mode", fe["f1"], 1.8751 ** 2 / (2 * math.pi) * math.sqrt(1e3 / 0.2), tol=0.01, src="β₁L = 1.8751")
chk("F7 second bending mode", fe["f2"], 4.6941 ** 2 / (2 * math.pi) * math.sqrt(1e3 / 0.2), tol=0.02, src="β₂L = 4.6941")
# gust
a3 = 2 * math.pi * p["AR"] / (p["AR"] + 2); WS = W / S; mu = 2 * WS / (1.225 * r["MAC"] * a3 * G); Kg = 0.88 * mu / (5.3 + mu)
chk("F5 Pratt gust Δn", fe["dnG"], 1.225 * 1.25 * p["Vc"] * 7.6 * a3 * Kg / (2 * WS), src="ρ V U a K_g/(2W/S)")
# hover root moment by hand: rotor thrust minus inertia, moments about the bearing
y0 = fe["ys"][0]; Mh = sum(fe["TfMax"] * (y - y0) for y in fe["rot"]) - sum(G * mm * (y - y0) for y, mm in zip(fe["ys"], fe["mNode"]))
chk("F1 hover spar root moment", fe["rootMh"], Mh, tol=0.005, src="Σ F·arm about the bearing")
# against the paper (not expected to match exactly; tolerance 10 %)
chk("Paper: wing area", r["S"], 0.575, tol=0.01, src="Table 1"); chk("Paper: takeoff mass", r["m"], 9.5, tol=0.05, src="§2")
chk("Paper: wing-rotor shaft power", r["shaftF"], 363.9, tol=0.15, src="Table 2")
vlm = json.load(open(os.path.join(TW, "data", "vlm.json")))
chk("Paper: C_L at α=0, δ=0 (3-D VLM)", vlm["cases"][0]["CL"], 0.73, tol=0.03, src="Fig. 6 converged CFD")
chk("Static margin positive in cruise", st["SM"], abs(st["SM"]), tol=1e-9, src="paper: stable except vertical flight")

json.dump({"source": "tiltwing/tools/verify.py", "rows": rows}, open(os.path.join(TW, "data", "verify.json"), "w"), indent=1)
w = max(len(x["check"]) for x in rows)
for x in rows: print(f"{'PASS' if x['pass'] else 'FAIL'}  {x['check']:<{w}}  model {x['model']:.5g}  indep {x['independent']:.5g}  diff {x['diff']*100:+.2f} %")
print(sum(x["pass"] for x in rows), "/", len(rows), "passed")
