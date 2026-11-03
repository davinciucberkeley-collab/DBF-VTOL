import numpy as np, json
rng=np.random.default_rng(7)
I=5.3e-4          # kg m^2 prop 32 g rod 0.4318 m + bell ~ (EST)
c=4.8e-3          # N m s/rad shorted-phase brake: Kt^2/R, Kt=60/(2 pi 400)=0.02387, R=0.12 ohm
def sim(theta,om,Tpk,Tcog=3e-3,Tf=1.0e-3,Tmotor=0.0,tmax=3.0,dt=1e-4,phiw=0.21):
    # detent: 2 wells at 0, pi ; torque = -dU/dtheta, U = -U0*exp(-d^2/2phiw^2)
    t=0.0
    n=int(tmax/dt)
    for i in range(n):
        # nearest well offset
        d=((theta+np.pi/2)%np.pi)-np.pi/2
        Tdet=-Tpk*(d/phiw)*np.exp(0.5-0.5*(d/phiw)**2)
        T=Tdet - Tcog*np.sin(84*theta) - c*om - Tf*np.sign(om)*(abs(om)>1e-3) + Tmotor
        # stiction
        if abs(om)<1e-3 and abs(T)<Tf: T=0; om=0
        om+=T/I*dt; theta+=om*dt
        if abs(om)<1e-3 and abs(Tdet - Tcog*np.sin(84*theta))<Tf and Tmotor==0 and i>2000: break
    return theta,om
def offs(theta): return abs(((theta+np.pi/2)%np.pi)-np.pi/2)
out={}
for Tpk in (0.010,0.020,0.040):
    N=400
    cap=0; cap_wide=0
    for k in range(N):
        th=rng.uniform(0,2*np.pi); om=300.0
        th,om=sim(th,om,Tpk)
        if offs(th)<np.radians(5): cap+=1
        if offs(th)<np.radians(25): cap_wide+=1
    # nudge loop
    tries=[]
    for k in range(200):
        th=rng.uniform(0,2*np.pi); om=300.0
        th,om=sim(th,om,Tpk)
        n=0
        while offs(th)>=np.radians(25) and n<12:
            n+=1
            # nudge: motor torque 0.04 N m for 0.12 s with random start-up variation then brake
            Tm=rng.uniform(0.02,0.06)
            th,om=sim(th,0.0,Tpk,Tmotor=Tm,tmax=0.12)
            th,om=sim(th,om,Tpk)
        tries.append(n if offs(th)<np.radians(25) else 99)
    tries=np.array(tries)
    out[Tpk]={'single_within5deg':cap/N,'single_within25deg':cap_wide/N,'nudge_mean':float(tries[tries<99].mean()),'nudge_fail_after12':float((tries==99).mean()),'nudge_p90':float(np.percentile(tries[tries<99],90))}
print(json.dumps(out,indent=1))
json.dump(out,open('mc_result.json','w'),indent=1)
