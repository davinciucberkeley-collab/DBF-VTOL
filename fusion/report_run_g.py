import adsk.core, adsk.fusion, traceback, json, time, re
KIND={"HW-001": "plate", "HW-002": "plate", "HW-003": "plate", "HW-004": "screw", "HW-005": "insert", "HW-006": "screw", "HW-007": "washer", "HW-008": "insert", "HW-009": "screw", "HW-010": "washer", "HW-011": "nut", "HW-012": "plate", "HW-013": "screw", "HW-014": "washer", "HW-015": "insert", "HW-016": "screw", "HW-017": "washer", "HW-018": "insert", "HW-019": "screw", "HW-020": "washer", "HW-021": "insert", "HW-022": "other", "HW-023": "screw", "HW-024": "washer", "HW-025": "nyloc", "HW-026": "screw", "HW-027": "washer", "HW-028": "insert", "HW-029": "screw", "HW-030": "washer", "HW-031": "other", "HW-032": "plate", "HW-033": "screw", "HW-034": "plate", "HW-035": "plate", "HW-036": "screw", "HW-037": "washer", "HW-038": "screw", "HW-039": "washer", "HW-040": "insert", "HW-041": "other", "HW-042": "plate", "HW-043": "screw", "HW-044": "screw", "HW-045": "washer", "HW-046": "screw", "HW-047": "washer", "HW-048": "insert", "HW-049": "plate", "HW-050": "screw", "HW-051": "washer", "HW-052": "nyloc", "HW-053": "wheel_hub", "HW-054": "axle", "HW-055": "collar", "HW-056": "washer", "HW-057": "nyloc", "HW-058": "plate", "HW-059": "strap", "HW-060": "screw", "HW-061": "washer", "HW-062": "insert", "HW-063": "plate", "HW-064": "screw", "HW-065": "washer", "HW-066": "nyloc", "HW-067": "horn", "HW-068": "screw", "HW-069": "screw", "HW-070": "washer", "HW-071": "nyloc", "HW-072": "horn", "HW-073": "screw", "HW-074": "screw", "HW-075": "washer", "HW-076": "nyloc", "HW-077": "horn", "HW-078": "screw", "HW-079": "horn", "HW-080": "plate", "HW-081": "screw", "HW-082": "nut", "HW-083": "clevis", "HW-084": "pushrod", "HW-085": "keeper", "HW-086": "horn", "HW-087": "plate", "HW-088": "screw", "HW-089": "nut", "HW-090": "clevis", "HW-091": "pushrod", "HW-092": "keeper", "HW-093": "horn", "HW-094": "plate", "HW-095": "screw", "HW-096": "nut", "HW-097": "clevis", "HW-098": "pushrod", "HW-099": "keeper", "HW-100": "other", "HW-101": "screw", "HW-102": "washer", "HW-103": "insert", "HW-104": "plate", "HW-105": "plate", "HW-106": "screw", "HW-107": "insert", "HW-108": "strap", "HW-109": "plate", "HW-110": "screw", "HW-111": "insert", "HW-112": "screw", "HW-113": "standoff", "HW-114": "grommet", "HW-115": "washer", "HW-116": "nyloc", "HW-117": "plate", "HW-118": "screw", "HW-119": "washer", "HW-120": "insert", "HW-121": "screw", "HW-122": "strap", "HW-123": "strap", "HW-124": "strap", "HW-125": "plate", "HW-126": "screw", "HW-127": "washer", "HW-128": "insert", "HW-129": "servo", "HW-130": "servo", "HW-131": "servo", "HW-132": "plate", "HW-133": "plate", "HW-137": "screw", "HW-138": "screw", "HW-139": "screw", "HW-140": "strap", "HW-141": "strap", "HW-142": "washer", "HW-143": "plate", "HW-134": "strap", "HW-135": "strap", "HW-136": "strap"}
def hk(n):
    m=re.match(r'(HW-\d+)_',n)
    return KIND.get(m.group(1),'?') if m else None
def stem(n): return re.sub(r'\s*\(\d+\)$','',n)[:40]
def run(context):
    try:
        app=adsk.core.Application.get(); des=adsk.fusion.Design.cast(app.activeProduct); root=des.rootComponent
        out=[]
        # 1 airframe set
        col=adsk.core.ObjectCollection.create(); parts=[]; groups={}
        for p in root.allOccurrences:
            top=p.fullPathName.split(':')[0]; nested=(0 if p.assemblyContext is None else (1 if p.assemblyContext.assemblyContext is None else 2))
            for b in p.bRepBodies:
                if top=='Hardware' and nested==1: groups.setdefault(p.name,[]).append(b)
                elif top=='Wheel_Gear' and nested==1: groups.setdefault('WG '+p.name,[]).append(b)
                elif top not in ('Hardware','Wheel_Gear'): parts.append(b); col.add(b)
        res=des.analyzeInterference(des.createInterferenceInput(col))
        for r in res:
            out.append(['airframe',r.entityOne.name,r.entityTwo.name,r.interferenceBody.volume])
        # prop discs
        tbm=adsk.fusion.TemporaryBRepManager.get()
        disc=[]
        for o in root.occurrences:
            if o.component.name in ('Lift_Prop','Pusher_Prop_14in'):
                bb=o.boundingBox
                cx=(bb.minPoint.x+bb.maxPoint.x)/2; cy=(bb.minPoint.y+bb.maxPoint.y)/2
                R=max(bb.maxPoint.x-bb.minPoint.x,bb.maxPoint.y-bb.minPoint.y)/2
                disc.append((o.name,cx,cy,R,bb.minPoint.z,bb.maxPoint.z,o.component.name))
        out.append(['propdisc_info',json.dumps([[d[0],round(d[1],2),round(d[2],2),round(d[3],2),round(d[4],2),round(d[5],2)] for d in disc]),'',0])
        # swept disc as a temp component
        tocc=root.occurrences.addNewComponent(adsk.core.Matrix3D.create()); tcomp=tocc.component; tcomp.name='TMP_DISC'
        P=adsk.core.Point3D.create
        dcol=adsk.core.ObjectCollection.create()
        for d in disc:
            nm,cx,cy,R,z0,z1,cn=d
            if cn=='Pusher_Prop_14in':
                # pusher disc axis along Y
                bb=[o for o in root.occurrences if o.name==nm][0].boundingBox
                cz=(bb.minPoint.z+bb.maxPoint.z)/2; cxx=(bb.minPoint.x+bb.maxPoint.x)/2
                Rp=max(bb.maxPoint.x-bb.minPoint.x,bb.maxPoint.z-bb.minPoint.z)/2
                t=tbm.createCylinderOrCone(P(cxx,bb.minPoint.y,cz),Rp,P(cxx,bb.maxPoint.y,cz),Rp)
            else:
                t=tbm.createCylinderOrCone(P(cx,cy,z0-0.05),R+0.0,P(cx,cy,z1+0.05),R+0.0)
            b=tcomp.bRepBodies.add(t); b.name='DISC_'+nm; dcol.add(b)
        allcol=adsk.core.ObjectCollection.create()
        for b in parts: 
            if not b.name.startswith('Lift_Prop') and not b.name.startswith('Pusher_Prop'): allcol.add(b)
        for b in tcomp.bRepBodies: allcol.add(b)
        res=des.analyzeInterference(des.createInterferenceInput(allcol))
        for r in res:
            if r.entityOne.name.startswith('DISC_') or r.entityTwo.name.startswith('DISC_'):
                out.append(['propdisc',r.entityOne.name,r.entityTwo.name,r.interferenceBody.volume])
        tocc.deleteMe()
        # 2 joints
        for g,bodies in groups.items():
            lo=[1e9]*3;hi=[-1e9]*3
            for b in bodies:
                bb=b.boundingBox
                for i in range(3):
                    lo[i]=min(lo[i],bb.minPoint.asArray()[i]); hi[i]=max(hi[i],bb.maxPoint.asArray()[i])
            c2=adsk.core.ObjectCollection.create()
            for b in bodies: c2.add(b)
            for b in parts:
                bb=b.boundingBox
                if all(bb.maxPoint.asArray()[i]>=lo[i]-0.05 and bb.minPoint.asArray()[i]<=hi[i]+0.05 for i in range(3)): c2.add(b)
            res=des.analyzeInterference(des.createInterferenceInput(c2))
            for r in res: out.append([g[:5],r.entityOne.name,r.entityTwo.name,r.interferenceBody.volume])
        open('C:/Users/trist/Documents/DBF-Fusion-Export/intf_final.json','w').write(json.dumps(out))
        print(len(out))
    except:
        print(traceback.format_exc())
