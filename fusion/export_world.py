import adsk.core, adsk.fusion, traceback, os, json, re, struct, time
BASE='C:/Users/trist/Documents/DBF-Fusion-Export/'
Q=adsk.fusion.TriangleMeshQualityOptions
AIR=('Wing_Panel_R','Wing_Panel_L','Aileron_R','Aileron_L','Spar_Tube','Wing_Joiner','Wing_Bolt','Boom_Front','Boom_Rear_Stub','H_Tail','Elevator','Fin','Fuselage_Pod','Canopy','Pitot_Tube')
PRINTED=('Wing_Saddle','Boom_Clamp_Front','Boom_Clamp_Rear','Motor_Mount','Gear_Clamp')
PROP=('Lift_Motor','Pusher_Motor','Lift_Prop','Pusher_Prop_14in','Spinner')
GEAR=('Landing_Leg',)
MECH=('J-17','J-18','J-19','J-20','J-21','J-22','J-23')
def color_of(bodies):
    for b in bodies:
        try:
            ap=b.appearance
            if ap is None: continue
            c=adsk.core.ColorProperty.cast(ap.appearanceProperties.itemByName('Color'))
            if c: return [round(c.value.red/255.0,3),round(c.value.green/255.0,3),round(c.value.blue/255.0,3)]
        except Exception: pass
    return [0.6,0.6,0.6]
def write_stl(path,bodies,q):
    tris=[]; mn=[1e9]*3; mx=[-1e9]*3
    chunks=[]
    for b in bodies:
        mc=b.meshManager.createMeshCalculator(); mc.setQuality(q)
        m=mc.calculate()
        xs=m.nodeCoordinatesAsDouble; idx=m.nodeIndices
        for i in range(0,len(xs),3):
            for k in range(3):
                v=xs[i+k]
                if v<mn[k]: mn[k]=v
                if v>mx[k]: mx[k]=v
        chunks.append((xs,idx))
    n=sum(len(i)//3 for _,i in chunks)
    out=bytearray(b'DBF-VTOL Fusion world cm Z-up'.ljust(80,b' '))
    out+=struct.pack('<I',n)
    pk=struct.Struct('<12fH')
    for xs,idx in chunks:
        for t in range(0,len(idx),3):
            a,b_,c=idx[t]*3,idx[t+1]*3,idx[t+2]*3
            ax,ay,az=xs[a],xs[a+1],xs[a+2]; bx,by,bz=xs[b_],xs[b_+1],xs[b_+2]; cx,cy,cz=xs[c],xs[c+1],xs[c+2]
            ux,uy,uz=bx-ax,by-ay,bz-az; vx,vy,vz=cx-ax,cy-ay,cz-az
            nx,ny,nz=uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx
            l=(nx*nx+ny*ny+nz*nz)**0.5 or 1.0
            out+=pk.pack(nx/l,ny/l,nz/l,ax,ay,az,bx,by,bz,cx,cy,cz,0)
    open(path,'wb').write(bytes(out))
    return n,[round(v,3) for v in mn],[round(v,3) for v in mx]
def safe(s): return re.sub(r'[^A-Za-z0-9_\-]','_',s)
def run(context):
    try:
        app=adsk.core.Application.get(); des=adsk.fusion.Design.cast(app.activeProduct); root=des.rootComponent
        os.makedirs(BASE+'stl',exist_ok=True)
        counts={}
        for o in root.occurrences: counts[o.component.name]=counts.get(o.component.name,0)+1
        seen={}
        units=[]
        for o in root.occurrences:
            cn=o.component.name
            if cn in ('Hardware','Electronics','Wheel_Gear'): continue
            seen[cn]=seen.get(cn,0)+1
            nm=cn if counts[cn]==1 else '%s_%d'%(cn,seen[cn])
            if cn in AIR: g='airframe'
            elif cn in PRINTED: g='printed'
            elif cn in PROP: g='propulsion'
            elif cn in GEAR: g='gear'
            elif cn=='Battery_6S_LiPo': g='electronics'
            else: g='airframe'
            units.append((nm,g,list(o.bRepBodies),None,safe(nm)))
        for o in root.occurrences:
            cn=o.component.name
            if cn=='Electronics':
                for s in o.component.occurrences:
                    # proxy through root
                    pass
        # nested via allOccurrences proxies
        for p in root.allOccurrences:
            ctx=p.assemblyContext
            if ctx is None or ctx.assemblyContext is not None: continue
            top=ctx.component.name
            if top=='Electronics':
                units.append((p.component.name,'electronics',list(p.bRepBodies),None,safe(p.component.name)))
            elif top=='Hardware':
                jid=p.name.split(' ')[0]
                g='mechanisms' if jid in MECH else 'hardware'
                nm=p.name.rsplit(':',1)[0]
                words=re.sub(r'[^A-Za-z0-9 ]','',nm.split(' ',1)[1] if ' ' in nm else '').split()[:3]
                units.append((nm,g,list(p.bRepBodies),jid,safe(jid+'_'+'_'.join(words))))
            elif top=='Wheel_Gear':
                units.append((p.component.name,'gear',list(p.bRepBodies),None,safe('Wheel_'+p.component.name)))
        entries=[]; bad=[]; t0=time.time()
        for nm,g,bodies,jid,fn in units:
            if not bodies: continue
            q=Q.LowQualityTriangleMesh if g in ('hardware','mechanisms','electronics') else Q.NormalQualityTriangleMesh
            path='stl/'+fn+'.stl'
            n,mn,mx=write_stl(BASE+path,bodies,q)
            lo=[1e9]*3;hi=[-1e9]*3
            for b in bodies:
                bb=b.boundingBox
                for i in range(3):
                    lo[i]=min(lo[i],bb.minPoint.asArray()[i]); hi[i]=max(hi[i],bb.maxPoint.asArray()[i])
            err=max(max(abs(mn[i]-lo[i]),abs(mx[i]-hi[i])) for i in range(3))
            if err>0.02: bad.append((nm,round(err,3)))
            e={'file':path,'name':nm,'group':g,'color':color_of(bodies),'count':len(bodies),'bbox_cm':[mn,mx],'size':os.path.getsize(BASE+path),'triangles':n}
            if jid: e['joint']=jid
            entries.append(e)
        man={'axis_note':'STL coordinates are Fusion world cm, Z-up (world-transformed, written from the B-rep mesh calculator; no further transform needed). Model X fwd = Fusion +Y, model Y up = Fusion +Z, model Z right = Fusion +X. i.e. model (x,y,z) m -> Fusion (z,x,y)*100 cm.','units':'cm','generated':'2026-11-01','entries':entries}
        json.dump(man,open(BASE+'manifest.json','w'),indent=1)
        print(len(entries),sum(e['size'] for e in entries),sum(e['count'] for e in entries),'bad bbox',bad,round(time.time()-t0,1))
    except:
        print(traceback.format_exc())
