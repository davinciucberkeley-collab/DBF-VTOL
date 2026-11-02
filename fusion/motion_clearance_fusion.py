
import adsk.core, adsk.fusion, traceback, math, json, os
exec(open(os.path.expanduser('~')+'\\Documents\\DBF-Fusion-Export\\render_animations_fusion.py').read(), globals())
MOV = {
 'ail_R':['Aileron_R:1','Arm_Aileron_R:1','Pushrod_Aileron_R:1'],
 'ail_L':['Aileron_L:1','Arm_Aileron_L:1','Pushrod_Aileron_L:1'],
 'elev':['Elevator:1','Arm_Elevator:1','Pushrod_Elevator:1'],
 'rud_R':['Rudder_R:1','Arm_Rudder_R:1','Pushrod_Rudder_R:1'],
 'rud_L':['Rudder_L:1','Arm_Rudder_L:1','Pushrod_Rudder_L:1']}
OCC = {o.name:o for o in root.occurrences}
def bb(b):
    x=b.boundingBox; return (x.minPoint.x,x.minPoint.y,x.minPoint.z,x.maxPoint.x,x.maxPoint.y,x.maxPoint.z)
def union(g):
    r=None
    for n in g:
        for b in OCC[n].bRepBodies:
            v=bb(b)
            r=v if r is None else tuple(min(r[i],v[i]) if i<3 else max(r[i],v[i]) for i in range(6))
    return r
def ov(a,b,m=0.0):
    return all(a[i]<=b[i+3]+m and b[i]<=a[i+3]+m for i in range(3))
def near(box, excl, m=0.3):
    out=[]
    for n,o in OCC.items():
        if n in excl: continue
        for b in o.bRepBodies:
            if ov(box,bb(b),m): out.append((n,b))
    return out
def interf(mov_names, nb, vol_min=1e-6):
    col=adsk.core.ObjectCollection.create()
    mb=[]
    for n in mov_names:
        for b in OCC[n].bRepBodies:
            col.add(b); mb.append(b)
    for n,b in nb: col.add(b)
    inp=des.createInterferenceInput(col)
    inp.areCoincidentFacesIncluded=False
    res=des.analyzeInterference(inp)
    out=[]
    mset=set(b.entityToken for b in mb)
    for r in res:
        a=r.entityOne; c=r.entityTwo
        if a.entityToken in mset or c.entityToken in mset:
            out.append((a.assemblyContext.name if a.assemblyContext else '', a.name, c.assemblyContext.name if c.assemblyContext else '', c.name, round(r.interferenceBody.volume*1000,4)))
    return out

LOG = os.path.expanduser('~')+'\\Documents\\DBF-Fusion-Export\\mc_log.jsonl'
def interf2(mov_names, nb):
    col=adsk.core.ObjectCollection.create()
    mtok={}
    for n in mov_names:
        for b in OCC[n].bRepBodies:
            col.add(b); mtok[b.entityToken]=n
    for n,b in nb: col.add(b)
    inp=des.createInterferenceInput(col)
    inp.areCoincidentFacesIncluded=False
    res=des.analyzeInterference(inp)
    out=[]
    for r in res:
        a=r.entityOne; c=r.entityTwo
        mc=set(x.split(':')[0] for x in mtok.values()); ta=a.parentComponent.name in mc; tc=c.parentComponent.name in mc
        if not (ta or tc): continue
        na=a.parentComponent.name
        nc=c.parentComponent.name
        if na==nc or na.startswith('Hinge_') or nc.startswith('Hinge_'): continue
        out.append([na,a.name[:40],nc,c.name[:40],round(r.interferenceBody.volume*1000,3)])
    return out
def sweep(mech, angles, extra=None):
    g=MOV[mech]
    for phi in angles:
        servo(mech,phi); adsk.doEvents()
        nb=near(union(g),set(g),0.3)
        r=interf2(g,nb)
        open(LOG,'a').write(json.dumps({'mech':mech,'servo':phi,'hits':r})+'\n')
        print(mech,phi,r)
    servo(mech,0)

tbm = adsk.fusion.TemporaryBRepManager.get()
def rotM(pt, axis, deg):
    m=adsk.core.Matrix3D.create()
    m.setToRotation(math.radians(deg), adsk.core.Vector3D.create(*axis), adsk.core.Point3D.create(*pt))
    return m
def transM(dx,dy,dz):
    m=adsk.core.Matrix3D.create(); m.translation=adsk.core.Vector3D.create(dx,dy,dz); return m
def box_tool(x0,y0,z0,x1,y1,z1):
    ob=adsk.core.OrientedBoundingBox3D.create(adsk.core.Point3D.create((x0+x1)/2,(y0+y1)/2,(z0+z1)/2), adsk.core.Vector3D.create(1,0,0), adsk.core.Vector3D.create(0,1,0), x1-x0, y1-y0, z1-z0)
    return tbm.createBox(ob)
def occ_body(occname, bname=None, idx=None):
    for b in OCC[occname].bRepBodies:
        if (bname is None or b.name.startswith(bname)): return b
def swept(base, pt, axis, degs, shifts=None):
    tool=None
    for d in degs:
        c=tbm.copy(base)
        tbm.transform(c, rotM(pt,axis,d))
        for s in (shifts or [(0,0,0)]):
            cc=tbm.copy(c) if len(shifts or [])>1 else c
            if s!=(0,0,0): tbm.transform(cc, transM(*s))
            if tool is None: tool=cc
            else: tbm.booleanOperation(tool, cc, adsk.fusion.BooleanTypes.UnionBooleanType)
    return tool
def add_tool(tb, name='TOOL'):
    b=root.bRepBodies.add(tb); b.name=name; return b
def cut(target, toolbody, keep=False):
    col=adsk.core.ObjectCollection.create(); col.add(toolbody)
    inp=root.features.combineFeatures.createInput(target, col)
    inp.operation=adsk.fusion.FeatureOperations.CutFeatureOperation
    inp.isKeepToolBodies=keep
    return root.features.combineFeatures.add(inp)

def inflate(tool, r, dirs=None):
    if dirs is None:
        dirs=[(r,0,0),(-r,0,0)]+[(0,r*math.cos(math.radians(a)),r*math.sin(math.radians(a))) for a in range(0,360,45)]
    base=tbm.copy(tool)
    for d in dirs:
        c=tbm.copy(base); tbm.transform(c, transM(*d))
        tbm.booleanOperation(tool, c, adsk.fusion.BooleanTypes.UnionBooleanType)
    return tool
def mover_union(mech, names, angles):
    """union of the named occurrences' bodies (all) over servo angles; returns temp body"""
    tool=None
    for phi in angles:
        servo(mech,phi); adsk.doEvents()
        for n in names:
            for b in OCC[n].bRepBodies:
                c=tbm.copy(b)
                if tool is None: tool=c
                else: tbm.booleanOperation(tool,c,adsk.fusion.BooleanTypes.UnionBooleanType)
    servo(mech,0)
    return tool
ANG=[-44.99+3*i for i in range(31)]+[44.99]

def acc(pieces, c):
    for i,p in enumerate(pieces):
        try:
            t=tbm.copy(p)
            if tbm.booleanOperation(t,c,adsk.fusion.BooleanTypes.UnionBooleanType):
                pieces[i]=t; return True
        except Exception:
            pass
    pieces.append(c); return False
def mover_pieces(mech, names, angles):
    pcs=[]; fails=0
    for phi in angles:
        servo(mech,phi); adsk.doEvents()
        for n in names:
            for b in OCC[n].bRepBodies:
                if not acc(pcs, tbm.copy(b)): fails+=1
    servo(mech,0)
    return pcs, fails

DIRS8=lambda r:[(r,0,0),(-r,0,0)]+[(0,r*math.cos(math.radians(a)),r*math.sin(math.radians(a))) for a in range(0,360,45)]
def inflate_pieces(pcs, r, dirs=None):
    dirs=dirs or DIRS8(r)
    out=[]
    for p in pcs:
        base=tbm.copy(p); cur=p; extras=[]
        for d in dirs:
            c=tbm.copy(base); tbm.transform(c, transM(*d))
            try:
                t=tbm.copy(cur)
                if tbm.booleanOperation(t,c,adsk.fusion.BooleanTypes.UnionBooleanType): cur=t; continue
            except Exception: pass
            extras.append(c)
        out.append(cur); out+=extras
    return out
def cut_pieces(target, pcs, name):
    col=adsk.core.ObjectCollection.create(); tbs=[]
    for i,p in enumerate(pcs):
        b=root.bRepBodies.add(p); b.name='%s_%d'%(name,i); col.add(b)
    inp=root.features.combineFeatures.createInput(target, col)
    inp.operation=adsk.fusion.FeatureOperations.CutFeatureOperation
    inp.isKeepToolBodies=False
    root.features.combineFeatures.add(inp)

def static_pieces(specs, clip, r):
    """specs: list of (occname, body-name-prefix or None); clip=(x0,y0,z0,x1,y1,z1) cm; returns inflated clipped temp pieces"""
    out=[]
    for occn, pre in specs:
        for b in OCC[occn].bRepBodies:
            if pre and not b.name.startswith(pre): continue
            c=tbm.copy(b)
            try:
                tbm.booleanOperation(c, box_tool(*clip), adsk.fusion.BooleanTypes.IntersectionBooleanType)
            except Exception: continue
            if c.volume<1e-9: continue
            out+=inflate_pieces([c], r) if r>0 else [c]
    return out
def inv_sweep(pieces, pt, axis, degs):
    """union of the static pieces rotated by -deg about the hinge (static seen from the moving frame)"""
    res=[]
    for d in degs:
        for p in pieces:
            c=tbm.copy(p); tbm.transform(c, rotM(pt,axis,-d)); acc(res,c)
    return res

def inv_sweep_sep(pieces, pt, axis, degs):
    res=[]
    for d in degs:
        for p in pieces:
            c=tbm.copy(p); tbm.transform(c, rotM(pt,axis,-d)); res.append(c)
    return res

def cut_multi(targets, pcs, name):
    tb=[]; col=adsk.core.ObjectCollection.create()
    for i,pc in enumerate(pcs):
        b=root.bRepBodies.add(pc); b.name='%s_%d'%(name,i); tb.append(b); col.add(b)
    done=[]
    for t in targets:
        v0=t.volume
        try:
            inp=root.features.combineFeatures.createInput(t, col)
            inp.operation=adsk.fusion.FeatureOperations.CutFeatureOperation
            inp.isKeepToolBodies=True
            root.features.combineFeatures.add(inp)
            done.append((t.name[:14], round((v0-t.volume)*1000,2)))
        except Exception as ex:
            done.append((t.name[:14],'ERR '+str(ex)[:60]))
    for b in tb:
        try: b.deleteMe()
        except Exception: pass
    return done

def annulus(c, axis, ax0, ax1, rin, rout):
    """annulus about axis ('x','y','z') through centre c=(a,b) in the other two coords, spanning ax0..ax1"""
    def P(u,v,w):
        if axis=='z': return adsk.core.Point3D.create(u,v,w)
        if axis=='y': return adsk.core.Point3D.create(u,w,v)   # c=(x,z)
        return adsk.core.Point3D.create(w,u,v)                  # axis x, c=(y,z)
    o=tbm.createCylinderOrCone(P(c[0],c[1],ax0),rout,P(c[0],c[1],ax1),rout)
    i=tbm.createCylinderOrCone(P(c[0],c[1],ax0-0.5),rin,P(c[0],c[1],ax1+0.5),rin)
    tbm.booleanOperation(o,i,adsk.fusion.BooleanTypes.DifferenceBooleanType)
    return o
def near_all(box, excl, m):
    out=[]
    for n,o in OCC.items():
        if n in excl: continue
        for b in o.bRepBodies:
            if ov(box,bb(b),m): out.append((n,b))
    return out
def disc_check(name, c, axis, ax0, ax1, rin, R, excl, margin=1.0):
    """interference of annulus (R+margin) and min distance to static bodies near the disc of radius R"""
    big=annulus(c,axis,ax0,ax1,rin,R+margin)
    bx=big.boundingBox; box=(bx.minPoint.x,bx.minPoint.y,bx.minPoint.z,bx.maxPoint.x,bx.maxPoint.y,bx.maxPoint.z)
    nb=near_all(box,set(excl),0.0)
    d=root.bRepBodies.add(big); d.name='TMP_disc'
    hits=[]; mins=[]
    try:
        col=adsk.core.ObjectCollection.create(); col.add(d)
        for n,b in nb: col.add(b)
        inp=des.createInterferenceInput(col); inp.areCoincidentFacesIncluded=False
        for r_ in des.analyzeInterference(inp):
            a=r_.entityOne; b_=r_.entityTwo
            if 'TMP_disc' in (a.name,b_.name):
                o=b_ if a.name=='TMP_disc' else a
                hits.append([o.parentComponent.name[:40],o.name[:30],round(r_.interferenceBody.volume*1000,3)])
    finally:
        d.deleteMe()
    return hits, len(nb)

def disc_report(name, c, axis, ax0, ax1, rin, R, excl, near_m=6.0):
    big=annulus(c,axis,ax0,ax1,rin,R+1.0); exact=annulus(c,axis,ax0,ax1,rin,R)
    bx=big.boundingBox; box=(bx.minPoint.x,bx.minPoint.y,bx.minPoint.z,bx.maxPoint.x,bx.maxPoint.y,bx.maxPoint.z)
    nb=near_all(box,set(excl),near_m)
    d=root.bRepBodies.add(exact); d.name='TMP_disc'
    ms=[]
    try:
        for n,b in nb:
            try:
                m=app.measureManager.measureMinimumDistance(d,b)
                ms.append((round(m.value*10,2),n[:34],b.name[:26]))
            except Exception as ex:
                ms.append((None,n[:34],b.name[:26]))
    finally:
        d.deleteMe()
    ms.sort(key=lambda x:(x[0] is None, x[0]))
    return ms[:6], len(nb)

def disc_clear(c, axis, ax0, ax1, rin, R, excl, margins=(0.0,0.5,1.0,2.0,3.0,5.0,8.0)):
    """smallest margin (cm) at which the annulus of radius R+margin touches a static body; returns (margin, hits) or (None, []) if clear up to the last margin"""
    for mg in margins:
        big=annulus(c,axis,ax0,ax1,rin,R+mg+0.0001)
        bx=big.boundingBox; box=(bx.minPoint.x,bx.minPoint.y,bx.minPoint.z,bx.maxPoint.x,bx.maxPoint.y,bx.maxPoint.z)
        nb=near_all(box,set(excl),0.0)
        if not nb: continue
        d=root.bRepBodies.add(big); d.name='TMP_disc'
        hits=[]
        try:
            col=adsk.core.ObjectCollection.create(); col.add(d)
            for n,b in nb: col.add(b)
            inp=des.createInterferenceInput(col); inp.areCoincidentFacesIncluded=False
            for r_ in des.analyzeInterference(inp):
                a=r_.entityOne; b_=r_.entityTwo
                if 'TMP_disc' in (a.name,b_.name):
                    o=b_ if a.name=='TMP_disc' else a
                    hits.append([o.parentComponent.name[:40],o.name[:30],round(r_.interferenceBody.volume*1000,2)])
        finally:
            d.deleteMe()
        if hits: return mg,hits
    return None,[]

OUT=os.path.expanduser('~')+'\\Documents\\DBF-Fusion-Export\\mc_out.txt'
def out(*a):
    s=' '.join(str(x) for x in a); open(OUT,'a').write(s+'\n'); print(s)

def sweep_rot(kin, names, angles, margin=0.3, tag=None):
    g=names
    res=[]
    for a in angles:
        rot(kin,a); adsk.doEvents()
        nb=near(union(g),set(g),margin)
        r=interf2(g,nb)
        res.append((a,r)); out(tag or kin,a,r)
    rot(kin,0)
    return res

RG={}
for rg in root.rigidGroups:
    RG[rg.name.split(' ')[0]+' '+rg.name.split(' ')[1]]=[o.name for o in rg.occurrences]
def group_bodies(names):
    return [b for n in names for b in OCC[n].bRepBodies]
def slide_check(kin, mover_names, cm_list, margin=0.0):
    mt=set(mover_names)
    res=[]
    for cm in cm_list:
        slide(kin,cm); adsk.doEvents()
        mb=group_bodies(mover_names)
        sb=[(n,b) for n,o in OCC.items() if n not in mt for b in o.bRepBodies]
        sboxes=[(n,b,bb(b)) for n,b in sb]
        cand_m=[]; cand_s={}
        for b in mb:
            bx=bb(b); hit=False
            for n,s,sbx in sboxes:
                if ov(bx,sbx,margin):
                    hit=True; cand_s[s.entityToken]=(n,s)
            if hit: cand_m.append(b)
        col=adsk.core.ObjectCollection.create()
        for b in cand_m: col.add(b)
        for k,(n,s) in cand_s.items(): col.add(s)
        r=[]
        if col.count>1:
            inp=des.createInterferenceInput(col); inp.areCoincidentFacesIncluded=False
            for r_ in des.analyzeInterference(inp):
                a=r_.entityOne; c=r_.entityTwo
                na=a.parentComponent.name; nc=c.parentComponent.name
                ma=any(na==m.split(':')[0] and a.name==b.name for m in mt for b in [a]) 
                r.append([na[:34],a.name[:24],nc[:34],c.name[:24],round(r_.interferenceBody.volume*1000,2)])
        res.append((cm,len(cand_m),len(cand_s),r)); out(kin,cm,len(cand_m),len(cand_s),r)
    slide(kin,0)
    return res

def pair_check(mover_names, extra_static_excl=()):
    """temp-BRep intersections between every body of the mover occurrences and every non-mover body whose bbox overlaps"""
    mt=set(mover_names); hits=[]; npairs=0
    sb=[(n,s,bb(s)) for n,o in OCC.items() if n not in mt and n not in extra_static_excl for s in o.bRepBodies]
    for m in mover_names:
        for b in OCC[m].bRepBodies:
            bx=bb(b); cb=None
            for n,s,sbx in sb:
                if ov(bx,sbx,0.0):
                    npairs+=1
                    try:
                        if cb is None: cb=tbm.copy(b)
                        c=tbm.copy(s); tbm.booleanOperation(c,cb,adsk.fusion.BooleanTypes.IntersectionBooleanType)
                        v=c.volume*1000 if c else 0
                    except Exception as ex:
                        v=-1
                    if v>1e-4 or v<0: hits.append([m[:30],b.name[:22],n[:30],s.name[:22],round(v,3)])
    return hits,npairs
def slide_pairs(kin, mover_names, cm_list):
    for cm in cm_list:
        t=time.time()
        slide(kin,cm); adsk.doEvents()
        h,n=pair_check(mover_names)
        out(kin,cm,'pairs',n,'hits',len(h),h[:14],round(time.time()-t,1))
    slide(kin,0)

MV=json.load(open(os.path.expanduser('~')+'\\Documents\\DBF-Fusion-Export\\mc_movers.json'))
TAIL=('H_Tail:1','Elevator:1','Hinge_Elevator:1')
def slide_pairs2(kin, movers, cm_list, excl=()):
    for cm in cm_list:
        t=time.time()
        slide(kin,cm); adsk.doEvents()
        h,n=pair_check(movers, excl)
        out(kin,cm,'pairs',n,'hits',len(h),h[:16],round(time.time()-t,1))
    slide(kin,0)

def min_clear(mech, angles, margin=0.2):
    g=MOV[mech]; best={}
    for phi in angles:
        servo(mech,phi); adsk.doEvents()
        nb=near(union(g),set(g),margin)
        for m in g:
            for b in OCC[m].bRepBodies:
                bx=bb(b)
                for n,s in nb:
                    if n.startswith('Hinge_'): continue
                    if not ov(bx,bb(s),margin): continue
                    try:
                        d=app.measureManager.measureMinimumDistance(b,s).value*10
                    except Exception as ex:
                        d=-9
                    k=(m[:22],b.name[:12],n[:22],s.name[:12])
                    if k not in best or d<best[k][0]: best[k]=(round(d,3),phi)
    servo(mech,0)
    return best

def dirs14(r):
    q=r/math.sqrt(2)
    d=[(r,0,0),(-r,0,0),(0,r,0),(0,-r,0),(0,0,r),(0,0,-r)]
    for a in (q,-q):
        for b in (q,-q):
            d+= [(a,b,0),(0,a,b)]
    return d
def clear_test(mech, specs, phi, delta, statics_excl=()):
    """mover bodies (occ,prefix) inflated by delta cm at servo phi; reports static bodies they still intersect"""
    servo(mech,phi); adsk.doEvents()
    g=MOV[mech]; nb=near(union(g),set(g),delta+0.2)
    hits=[]
    for occn,pre in specs:
        for b in OCC[occn].bRepBodies:
            if pre and not b.name.startswith(pre): continue
            c=tbm.copy(b); pcs=inflate_pieces([c],delta,dirs14(delta))
            for n,s in nb:
                if n.startswith('Hinge_') or n in statics_excl: continue
                for pc in pcs:
                    bx=pc.boundingBox
                    if not ov((bx.minPoint.x,bx.minPoint.y,bx.minPoint.z,bx.maxPoint.x,bx.maxPoint.y,bx.maxPoint.z),bb(s),0.0): continue
                    try:
                        x=tbm.copy(s); tbm.booleanOperation(x,pc,adsk.fusion.BooleanTypes.IntersectionBooleanType)
                        v=x.volume*1000
                    except Exception: v=-1
                    if v>1e-3 or v<0: hits.append((occn[:20],b.name[:14],n[:22],s.name[:16],round(v,3)))
    servo(mech,0)
    return hits

def cut_each(target_occ, target_name, pcs, name):
    tot=0; fails=0
    for i,pc in enumerate(pcs):
        t=[b for b in OCC[target_occ].bRepBodies if b.name.startswith(target_name)][0]
        v0=t.volume
        b=root.bRepBodies.add(pc); b.name='%s_%d'%(name,i)
        try:
            col=adsk.core.ObjectCollection.create(); col.add(b)
            inp=root.features.combineFeatures.createInput(t,col)
            inp.operation=adsk.fusion.FeatureOperations.CutFeatureOperation
            inp.isKeepToolBodies=False
            root.features.combineFeatures.add(inp)
            t=[b2 for b2 in OCC[target_occ].bRepBodies if b2.name.startswith(target_name)][0]
            tot+=v0-t.volume
        except Exception as ex:
            fails+=1
            try: b.deleteMe()
            except Exception: pass
    return round(tot*1000,2),fails
