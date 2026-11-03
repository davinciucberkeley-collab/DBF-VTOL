"""a3 effect on C0 cruise/hover. Run: python3 -I a3_effect.py  -> final_runs.json, nacelle.json
Formulas follow analysis/model.js F5-F8 with the C0 wing held fixed (airframe not re-sized).
Inputs: analysis/results.json concepts.C0.sized (S, P_hover), CdA_rotor 0.0034 (EST, analysis/sizing.mjs), CD0_clean 0.03, CdA_boom 0.0015, e 0.8."""
import json, math
import numpy as np
G=9.80665; rho=1.225; Vc=20; S=0.57282037; span=2.4; e=0.8; AR=span**2/S
CD0clean=0.03; CdAboom=2*0.0015; etaP=0.6; etaM=0.85; Epack=144.3; reserve=0.2; etaB=0.95
Ph0=831.97545; m0=6.1821705
def run(cdarot, dm, khov=1.0):
    m=m0+dm; W=m*G; Ph=Ph0*(m/m0)**1.5*khov
    CL=2*W/(rho*Vc**2*S); CD0=CD0clean+(4*cdarot+CdAboom)/S; CDi=CL**2/(math.pi*e*AR)
    LD=CL/(CD0+CDi); D=W/LD; Pc=D*Vc/(etaP*etaM)
    t=((Epack*(1-reserve)*etaB)*3600-Ph*160)/Pc/60
    return dict(m=round(m,3),P_hover=round(Ph,1),P_cruise=round(Pc,1),D=round(D,3),LD=round(LD,3),t_cruise_min=round(t,2),stall_speed=round(math.sqrt(2*W/(rho*S*1.2)),2),TW=round(2.0251787*m0/m,3))
# ---- nacelle plan section: NACA 00xx, c=0.26, t/c=0.22, LE at x_m+0.082, truncated xi 0.06..0.75
c=0.26; tc=0.22; xle=0.082; xi0=0.06; xi1=0.75; Hn=0.0625
xi=np.linspace(xi0,xi1,3001)
yt=5*tc*(0.2969*np.sqrt(xi)-0.1260*xi-0.3516*xi**2+0.2843*xi**3-0.1036*xi**4)
area=2*np.trapezoid(yt,xi)*c*c
x=xi*c; y=yt*c
per=2*np.sum(np.hypot(np.diff(x),np.diff(y)))+2*(y[0]+y[-1])
rhoP=1270.0
m_nac=rhoP*(per*Hn*0.8e-3 + (area-math.pi*0.0255**2)*1.2e-3)   # 0.8 mm walls, 1.2 mm lid with 51 mm hole, open bottom
cap_area=2*math.pi*0.0265*0.006+math.pi*(0.0265+0.014)*math.hypot(0.020,0.0265-0.014)
m_cap=rhoP*(cap_area*1.2e-3+math.pi*0.014**2*3e-3)+0.001
tab=[]
for s in (0.06,0.1,0.15,0.2,0.3,0.4,0.5,0.6,0.7,0.75):
    yy=5*tc*(0.2969*math.sqrt(s)-0.1260*s-0.3516*s**2+0.2843*s**3-0.1036*s**4)*c
    tab.append(dict(xi=s,x_local_mm=round((xle-s*c)*1000,1),half_thickness_mm=round(yy*1000,1)))
json.dump(dict(area_m2=area,perimeter_m=per,mass_nacelle_g=m_nac*1000,mass_cap_g=m_cap*1000,frontal_tH_m2=2*yt.max()*c*Hn,table=tab),open('nacelle.json','w'),indent=1)
print('nacelle',round(m_nac*1000,1),'g cap',round(m_cap*1000,1),'g area',area,'per',per)
R={'C0':run(0.0034,0)}
R['brake_off_windmill (CD_disc 0.10 EST)']=run(0.10*math.pi*0.4318**2/4,0)
R['aligned_only_unfaired (+0.02 kg)']=run(2.86e-3,0.02)
dm1=4*(m_nac+m_cap)+0.0   # placeholder replaced below
per_rotor_g=m_nac*1000+m_cap*1000+2.25+1.0+6*0.45+4*0.8+6*0.15   # nacelle+cap+magnets+glue+6 M3x10+4 net M3x16+6 inserts
dm_p1=4*per_rotor_g/1000
dm_p2=dm_p1+0.022
print('per rotor g',round(per_rotor_g,1),'dm phase1',round(dm_p1,3),'phase2',round(dm_p2,3))
kh=1.0075
R['faired_random (1.55e-3), phase1']=run(1.55e-3,dm_p1,kh)
for k,cda in (('a3_low (0.7e-3)',0.7e-3),('a3_central (1.1e-3)',1.1e-3),('a3_high (1.7e-3)',1.7e-3),('a3_mean_with_one_rotor_crosswise (1.325e-3)',1.325e-3),('a3_mass_only_no_drag_gain (3.4e-3)',3.4e-3)):
    R[k+' phase2']=run(cda,dm_p2,kh)
R['a3_central phase1']=run(1.1e-3,dm_p1,kh)
lo,hi=0.5e-3,3.4e-3
for i in range(60):
    mid=(lo+hi)/2
    if run(mid,dm_p2,kh)['t_cruise_min']>R['C0']['t_cruise_min']: lo=mid
    else: hi=mid
R['breakeven_CdA_per_rotor']=(lo+hi)/2
q=0.5*rho*Vc**2
R['q_Pa']=q; R['C0_rotor_share_of_cruise_drag']=4*0.0034*q/9.3135837
R['dm_phase1_kg']=dm_p1; R['dm_phase2_kg']=dm_p2; R['per_rotor_added_g']=per_rotor_g
mf=[(0.37092,per_rotor_g),(0.37092,per_rotor_g),(-0.50458,per_rotor_g),(-0.50458,per_rotor_g)]
mm=m0*1000; xcg=-0.066829043
mom=sum(xx*g for xx,g in mf); dmg=sum(g for _,g in mf)
R['cg_shift_mm']=((mm*xcg+mom)/(mm+dmg)-xcg)*1000
# asymmetry of one crosswise rotor (EST): extra drag 9e-4 m2, couple from opposed blade lift
R['one_rotor_crosswise']=dict(dD_N=q*9e-4, yaw_Nm=q*9e-4*0.4337, roll_couple_Nm=2*q*6.5e-3*0.5*0.108)
print(json.dumps(R,indent=1)); json.dump(R,open('final_runs.json','w'),indent=1)
