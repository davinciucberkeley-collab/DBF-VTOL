import adsk.core, adsk.fusion, traceback, json, time, re
CHUNK=CHUNK_OVERRIDE
KIND={"HW-001": "plate", "HW-002": "plate", "HW-003": "plate", "HW-004": "screw", "HW-005": "insert", "HW-006": "screw", "HW-007": "washer", "HW-008": "insert", "HW-009": "screw", "HW-010": "washer", "HW-011": "nut", "HW-012": "plate", "HW-013": "screw", "HW-014": "washer", "HW-015": "insert", "HW-016": "screw", "HW-017": "washer", "HW-018": "insert", "HW-019": "screw", "HW-020": "washer", "HW-021": "insert", "HW-022": "other", "HW-023": "screw", "HW-024": "washer", "HW-025": "nyloc", "HW-026": "screw", "HW-027": "washer", "HW-028": "insert", "HW-029": "screw", "HW-030": "washer", "HW-031": "other", "HW-032": "plate", "HW-033": "screw", "HW-034": "plate", "HW-035": "plate", "HW-036": "screw", "HW-037": "washer", "HW-038": "screw", "HW-039": "washer", "HW-040": "insert", "HW-041": "other", "HW-042": "plate", "HW-043": "screw", "HW-044": "screw", "HW-045": "washer", "HW-046": "screw", "HW-047": "washer", "HW-048": "insert", "HW-049": "plate", "HW-050": "screw", "HW-051": "washer", "HW-052": "nyloc", "HW-053": "wheel_hub", "HW-054": "axle", "HW-055": "collar", "HW-056": "washer", "HW-057": "nyloc", "HW-058": "plate", "HW-059": "strap", "HW-060": "screw", "HW-061": "washer", "HW-062": "insert", "HW-063": "plate", "HW-064": "screw", "HW-065": "washer", "HW-066": "nyloc", "HW-067": "horn", "HW-068": "screw", "HW-069": "screw", "HW-070": "washer", "HW-071": "nyloc", "HW-072": "horn", "HW-073": "screw", "HW-074": "screw", "HW-075": "washer", "HW-076": "nyloc", "HW-077": "horn", "HW-078": "screw", "HW-079": "horn", "HW-080": "plate", "HW-081": "screw", "HW-082": "nut", "HW-083": "clevis", "HW-084": "pushrod", "HW-085": "keeper", "HW-086": "horn", "HW-087": "plate", "HW-088": "screw", "HW-089": "nut", "HW-090": "clevis", "HW-091": "pushrod", "HW-092": "keeper", "HW-093": "horn", "HW-094": "plate", "HW-095": "screw", "HW-096": "nut", "HW-097": "clevis", "HW-098": "pushrod", "HW-099": "keeper", "HW-100": "other", "HW-101": "screw", "HW-102": "washer", "HW-103": "insert", "HW-104": "plate", "HW-105": "plate", "HW-106": "screw", "HW-107": "insert", "HW-108": "strap", "HW-109": "plate", "HW-110": "screw", "HW-111": "insert", "HW-112": "screw", "HW-113": "standoff", "HW-114": "grommet", "HW-115": "washer", "HW-116": "nyloc", "HW-117": "plate", "HW-118": "screw", "HW-119": "washer", "HW-120": "insert", "HW-121": "screw", "HW-122": "strap", "HW-123": "strap", "HW-124": "strap", "HW-125": "plate", "HW-126": "screw", "HW-127": "washer", "HW-128": "insert", "HW-129": "servo", "HW-130": "servo", "HW-131": "servo", "HW-132": "plate", "HW-133": "plate", "HW-137": "screw", "HW-138": "screw", "HW-139": "screw", "HW-140": "strap", "HW-141": "strap", "HW-142": "washer", "HW-143": "plate", "HW-134": "strap", "HW-135": "strap", "HW-136": "strap"}
def hk(n):
    m=re.match(r'(HW-\d+)_',n)
    return KIND.get(m.group(1),'?') if m else None
FITPARTS=('Boom_Front','Boom_Rear_Stub','Motor_Mount','Gear_Clamp','Boom_Clamp_Front','Boom_Clamp_Rear')
def base(n): return re.sub(r'_(upper|lower)$','',n)
def run(context):
    try:
        app=adsk.core.Application.get()
        des=adsk.fusion.Design.cast(app.activeProduct)
        root=des.rootComponent
        tbm=adsk.fusion.TemporaryBRepManager.get()
        t0=time.time()
        parts=[];groups={}
        for p in root.allOccurrences:
            top=p.fullPathName.split(':')[0]; nested=(0 if p.assemblyContext is None else (1 if p.assemblyContext.assemblyContext is None else 2))
            for b in p.bRepBodies:
                if top=='Hardware' and nested==1: groups.setdefault(p.name,[]).append(b)
                elif top=='Wheel_Gear' and nested==1: groups.setdefault('WG '+p.name,[]).append(b)
                elif top not in ('Hardware','Wheel_Gear'): parts.append(b)
        names=sorted(groups.keys())[CHUNK[0]:CHUNK[1]]
        log=[]
        for g in names:
            bodies=groups[g]
            lo=[1e9]*3;hi=[-1e9]*3
            for b in bodies:
                bb=b.boundingBox
                for i in range(3):
                    lo[i]=min(lo[i],bb.minPoint.asArray()[i]); hi[i]=max(hi[i],bb.maxPoint.asArray()[i])
            col=adsk.core.ObjectCollection.create()
            for b in bodies: col.add(b)
            for b in parts:
                bb=b.boundingBox
                if all(bb.maxPoint.asArray()[i]>=lo[i]-0.05 and bb.minPoint.asArray()[i]<=hi[i]+0.05 for i in range(3)): col.add(b)
            res=des.analyzeInterference(des.createInterferenceInput(col))
            plan={}
            for r in res:
                v=r.interferenceBody.volume
                if v<0.02: continue
                a,b=r.entityOne,r.entityTwo
                ka,kb=hk(a.name),hk(b.name)
                kinds={ka,kb}
                if ka is None and kb is None: continue
                if ka is not None and kb is not None:
                    if kinds in ({'insert','screw'},{'nyloc','screw'},{'nut','screw'},{'screw','washer'},{'wheel_hub'},{'clevis','pushrod'}) or 'axle' in kinds or 'insert' in kinds: continue
                    # both HW: host = plate/servo else later name
                    if ka in ('plate','servo') and kb not in ('plate','servo'): host=a
                    elif kb in ('plate','servo') and ka not in ('plate','servo'): host=b
                    else:
                        HN={'plate':9,'servo':9,'other':8,'standoff':7,'grommet':7,'horn':6,'pushrod':5,'clevis':5,'keeper':4,'collar':3,'strap':2,'washer':1,'nut':1,'nyloc':1,'screw':0}
                        ha,hb=HN.get(ka,5),HN.get(kb,5)
                        if ha>hb: host=a
                        elif hb>ha: host=b
                        else: host=a if a.name>b.name else b
                        if min(ha,hb)==0 and max(ha,hb)==0: continue
                else:
                    pn,h=(a,b) if ka is None else (b,a)  # h = HW body, pn part body
                    hkind=hk(h.name)
                    if hkind=='insert': continue
                    if base(pn.name) in FITPARTS: continue
                    host=pn
                    if hkind=='wheel_hub': continue
                key=host.entityToken
                plan.setdefault(key,[host,[]])[1].append(r.interferenceBody)
            for key,(host,tools) in plan.items():
                try: hn=host.name
                except: hn='?'
                try:
                    added=[]
                    comp=host.parentComponent
                    occs=root.allOccurrencesByComponent(comp)
                    # group tools by occurrence
                    byocc={}
                    for t in tools:
                        c=t.boundingBox.minPoint.asArray(); d=t.boundingBox.maxPoint.asArray()
                        ctr=[(c[i]+d[i])/2 for i in range(3)]
                        sel=0
                        for k in range(occs.count):
                            bb=occs.item(k).boundingBox
                            if all(bb.minPoint.asArray()[i]-0.05<=ctr[i]<=bb.maxPoint.asArray()[i]+0.05 for i in range(3)): sel=k;break
                        byocc.setdefault(sel,[]).append(t)
                    added=[]
                    for k,ts in byocc.items():
                        m=occs.item(k).transform2; m.invert()
                        for t in ts:
                            c=tbm.copy(t); tbm.transform(c,m); added.append(comp.bRepBodies.add(c))
                    coll=adsk.core.ObjectCollection.create()
                    for bb in added: coll.add(bb)
                    hv=host.volume
                    if sum(q.volume for q in added)>0.9*hv:
                        for q in added: q.deleteMe()
                        log.append((g[:6],hn[:28],'SKIP fully embedded')); continue
                    tg=[x for x in comp.bRepBodies if x.name==hn and x.entityToken not in [q.entityToken for q in added]]
                    ci=comp.features.combineFeatures.createInput(tg[0],coll); ci.operation=adsk.fusion.FeatureOperations.CutFeatureOperation; ci.isKeepToolBodies=False
                    comp.features.combineFeatures.add(ci)
                    log.append((g[:6],hn[:28],len(tools)))
                except:
                    log.append((g[:6],hn[:28],'ERR '+traceback.format_exc().splitlines()[-1]))
                    try:
                        for q in added: q.deleteMe()
                    except: pass
            print(g[:6],'res',res.count,'hosts',len(plan),round(time.time()-t0,1))
        print([l for l in log if 'ERR' in str(l[2]) or 'SKIP' in str(l[2])])
        json.dump(log,open('C:/Users/trist/Documents/DBF-Fusion-Export/pocket_log.json','a'))
        print(len(log))
    except:
        print(traceback.format_exc())
