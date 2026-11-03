"""Builds ../geometry.json, ../inventory.json, ../metrics.json. Run: python3 -I build_a3_json.py (from this folder)."""
import json, math, copy
ROOT='/home/claude/design-build-fly/'
fr=json.load(open('final_runs.json'))
R4=lambda v: round(v,5)
# ---------------- rotor table (model frame) ----------------
ROT=[dict(id='L1',x=0.37092,z=0.4337,mount='Motor_Mount_3',prop='Lift_Prop_L1',side='front right',spin='CCW'),
     dict(id='L3',x=0.37092,z=-0.4337,mount='Motor_Mount_1',prop='Lift_Prop_L3',side='front left',spin='CW'),
     dict(id='L4',x=-0.50458,z=0.4337,mount='Motor_Mount_4',prop='Lift_Prop_L4',side='rear right',spin='CW'),
     dict(id='L2',x=-0.50458,z=-0.4337,mount='Motor_Mount_2',prop='Lift_Prop_L2',side='rear left',spin='CCW')]
# nacelle plan section
c=0.26; tc=0.22; xle=0.082
def half(xi): return 5*tc*(0.2969*math.sqrt(xi)-0.1260*xi-0.3516*xi**2+0.2843*xi**3-0.1036*xi**4)*c
xis=[0.06,0.08,0.10,0.15,0.20,0.25,0.30,0.40,0.50,0.60,0.70,0.75]
prof=[[round((xle-xi*c)*1000,1),round(half(xi)*1000,1)] for xi in xis]
ORANGE=[0.96,0.50,0.12]; STEEL=[0.75,0.75,0.77]; MAG=[0.62,0.64,0.68]
def at(x,y,z): return [R4(x),R4(y),R4(z)]
geom={"base":"VTOL C0 full","variant":"a3","frame":"model X fwd, Y up, Z right, m (Fusion: model (x,y,z) m -> Fusion (z,x,y)*100 cm)",
 "notes":["All new dimensions in mm unless a key says m. Local sketch frame for rotor parts: origin on the rotor axis (x_m, z_m), local x = model X, local z = model Z, local y = model Y absolute.",
  "Rotor axes: L1 (0.37092, 0.4337) front right; L3 (0.37092,-0.4337) front left; L4 (-0.50458, 0.4337) rear right; L2 (-0.50458,-0.4337) rear left. Mount components in manifest.json: Motor_Mount_3=L1, _1=L3, _4=L4, _2=L2.",
  "Reference heights (model y, m): boom axis -0.0300; Motor_Mount -0.0450..-0.0090; motor base -0.0090; bell top 0.0230; prop adapter 0.0230..0.0290; prop hub 0.0290..0.0378; holding plate 0.0378..0.0398 (all from inventory/hardware/hardware.json J-09, J-10).",
  "Dimensions marked est are placeholders until the real X4110S and JeeFly 1755 are measured (bell skirt gap, bolt pattern, hub OD).",
  "Parked blade azimuth: blades lie along local X (as in the C0 Lift_Prop STL). Detent pocket angles are measured from +X toward +Z."],
 "remove":[{"target":"HW-033 Prop adapter screw M3x12 (supplied), 16 instances (4 on each Lift_Prop_L1..L4)","reason":"replaced by M3x16 that also clamp the Lift_Cap top plate (HW-A3-03)"}],
 "modify":[],"add":[],"hardware":[],"moving":[],"joints":[]}
# ---- modify
for r in ROT:
    geom["modify"].append({"target":r['mount'],"change":"add 4 M3 heat-set insert bores in the side faces (2 per side), no change to outer envelope",
     "params":{"bore_d_mm":4.2,"bore_depth_mm":7.5,"lead_in":"0.4 x 45 deg","rule":"tolerances.json insert_bore_M3 / insert_depth_M3",
      "positions_m":[at(r['x']+dx,-0.0225,r['z']+s*0.023) for dx in (0.027,-0.027) for s in (1,-1)],
      "axes":"normal to the side face, pointing into the mount (-Z on the +Z face, +Z on the -Z face)",
      "clearance_check":"min 11 mm from J-08 pinch bolts (x_m+/-0.016, z_m+/-0.01785), min 18.9 mm from boom axis"}})
    geom["modify"].append({"target":r['prop'],"change":"rotating group gains Lift_Cap_%s and Magnet_Rot_%s_A/B as children (same revolute joint, axis +Y through the rotor centre); 4 supplied M3x12 holding-plate screws replaced by M3x16"%(r['id'],r['id']),
     "params":{"pivot_m":at(r['x'],0.030,r['z']),"axis":[0,1,0],"added_rotating_mass_g":round(9.4+1.5+0.5,1)}})
geom["modify"].append({"target":"inventory/fusion/kinematics/kinematics.json groups prop_L1..prop_L4","change":"add stl names Lift_Cap_Lx.stl to 'stl' and extend 'contains'","params":{}})
geom["modify"].append({"target":"ESC_L1..ESC_L4 (firmware only, no CAD change)","change":"BLHeli_S 'Brake on stop' = ON via ArduPilot pass-through","params":{}})
# ---- add: nacelle
for r in ROT:
    geom["add"].append({"name":"Lift_Nacelle_%s"%r['id'],"kind":"part","count":1,
     "shape":{"summary":"Streamlined fairing around motor mount + motor bell, below the prop disc. Plan section = NACA 0022 (symmetric), chord 260 mm, truncated at x/c 0.06 (nose) and 0.75 (tail); extruded in Y from -0.0455 to +0.0170 (62.5 mm); shelled 0.8 mm; open bottom; 1.2 mm lid with a 51.0 mm hole on the rotor axis; modelled as two clamshell halves split on the plane z = z_m.",
      "ops":[
       "1 Sketch on plane y=-0.0455 (local frame origin on rotor axis): closed spline through the upper half-thickness table below, mirrored about local x axis; close nose (x=+66.4) and tail (x=-113.0) with straight lines.",
       "2 Extrude +Y 62.5 mm (to y=+0.0170).",
       "3 Fillet top outer edge R4, bottom outer edge R2.",
       "4 Shell inwards 0.8 mm, remove the bottom face. Lid (top face) thickness 1.2 mm.",
       "5 Cut lid hole D51.0 centred on the rotor axis (bell D47.5 + 1.75 radial clearance; bell top y=0.023 stands proud of the lid).",
       "6 Cut boom bore D25.8 along X at y=-0.0300, local z=0, through nose and tail faces.",
       "7 Add 4 inner standoff bosses (D8 outer, D3.4 hole axis Z) at local x=+27 and x=-27, y=-0.0225, on each half's inner wall, height to reach the mount face at |z|=23 mm (about 4 mm).",
       "8 Add 2 seam bosses on the inboard half at local x=+58 and x=-95, y=-0.015: D4.2 x 7.5 insert bore (axis Z); matching D3.4 through holes with 6.2 x 1.8 counterbore on the outboard half.",
       "9 Lid underside boss 4 mm thick (y 0.013..0.017), 18 mm wide arc at r=31 on the +X side: 5 magnet pockets D6.5 x 3.3 deep from the top face at azimuth -30,-15,0,+15,+30 deg, r=31 (pocket floor 0.6 mm above boss underside).",
       "10 Lid underside boss at azimuth 180 deg, r=31: reed pocket 2.6 x 16 slot, axis tangential (Z), centre y=0.015 (phase 2).",
       "11 Cooling: exit slot 40 x 30 mm opening in the bottom (rib 3 mm left each side of the boom bore) and a 8 x 5 mm wire slot on the face nearest the ESC (tail for front rotors, nose for rear rotors) at y=-0.038.",
       "12 Split on z=z_m into two halves (names Lift_Nacelle_%s_In, _Out)."%r['id']],
      "plan_half_thickness_table_mm":{"columns":["x_local_mm (fwd +)","half_thickness_mm"],"rows":prof,"formula":"y = 5 t c (0.2969 sqrt(xi) - 0.1260 xi - 0.3516 xi^2 + 0.2843 xi^3 - 0.1036 xi^4), t=0.22, c=260 mm, x_local = 82 - xi*260 mm"},
      "envelope_m":{"x":[R4(r['x']-0.1130),R4(r['x']+0.0664)],"y":[-0.0455,0.0170],"z":[R4(r['z']-0.0286),R4(r['z']+0.0286)]},
      "clearances_checked_mm":{"ESC_L1/L3 tail":"front tail ends x=0.2579 vs ESC inner end 0.2225: 35","gear clamp front (0.2639..0.2979)":"tail at x=0.2579: 6 (tail ends before the clamp)","gear clamp rear (-0.4316..-0.3976)":"nose at x=-0.4382: 6.6","prop blade underside y=0.025 vs lid top 0.017":"8","bell OD 47.5 vs lid hole 51.0":"1.75 radial","Motor_Mount 46 wide vs inner wall at x=+/-36":">=26 half-thickness vs 23 needed"}},
     "material":"PETG (HDT 68 C: keep >= 3 mm air gap to the bell; PA6-CF if thermal test T-A3-5 fails)","color":ORANGE,
     "placements":[{"pos":at(r['x'],0.0,r['z']),"axis":[0,1,0],"up":[1,0,0]}],"mass_g":37.5,"source":"analysis/a3_effect.py (nacelle.json); NACA 4-digit thickness formula, Abbott & von Doenhoff; PETG density 1.27 g/cm3 (EST, not in repo)"})
# ---- add: cap
for r in ROT:
    geom["add"].append({"name":"Lift_Cap_%s"%r['id'],"kind":"part","count":1,
     "shape":{"summary":"Rotating hub fairing (spinner-style cover over bell top, adapter, prop hub and holding plate) with two magnet ears. Solid of revolution about the rotor axis; blade slots at azimuth 0 and 180 deg.",
      "ops":[
       "1 Revolve outer profile (r mm, y mm absolute): (26.5,18.5) -> (26.5,24.0) -> (14.0,39.8) -> (14.0,42.8) -> (0,42.8); inner offset 1.2 mm: skirt inner radius 25.3 (clears bell R23.75 by 1.55), inner shoulder parallel, plate underside y=39.8.",
       "2 Fillet outer shoulder and top edge R5/R2.",
       "3 Top plate y 39.8..42.8: 4 holes D3.4 on a D16 circle at 45,135,225,315 deg (same est pattern as HW-033, 'est pattern 4 on dia 16'), counterbore D6.2 x 1.8 from the top face.",
       "4 Blade slots through the shoulder at azimuth 0 and 180 deg: 24 mm wide (Z), y 0.0215..0.0365 (blade 8 mm + 3.5 mm each side), from r=14 outwards.",
       "5 Cooling inlets: 4 slots 4 x 10 mm through the shoulder at azimuth 45,135,225,315 deg, centred y=0.030.",
       "6 Two ears at azimuth 0 and 180 deg: 16 mm wide tangential, radial r=26.5..34.5, y 18.5..22.7; in each ear a pocket D6.5 x 3.3 deep from the lower face at r=31 (magnet recessed 0.5 mm; face-to-face gap to the lid magnet 2.5 mm).",
       "7 Wall 1.2 mm everywhere except the plate (3.0) and ears (4.2)."],
      "dims_mm":{"skirt_outer_r":26.5,"skirt_inner_r":25.3,"overall_height":24.3,"bottom_y_m":0.0185,"top_y_m":0.0428,"axial_gap_to_lid":1.5}},
     "material":"PETG","color":ORANGE,"placements":[{"pos":at(r['x'],0.0,r['z']),"axis":[0,1,0],"up":[1,0,0]}],"mass_g":9.4,
     "source":"analysis/a3_effect.py (nacelle.json mass_cap_g); hub and holding-plate heights hardware.json HW-031/032"})
# magnets
for r in ROT:
    for lab,az in (('A',0),('B',180)):
        sgn=1 if az==0 else -1
        geom["add"].append({"name":"Magnet_Rot_%s_%s"%(r['id'],lab),"kind":"purchased","count":1,
          "shape":{"summary":"K&J D42SH disc magnet D6.35 x 3.17 mm N42SH, axially magnetised, pole facing down = S (same on A and B)","ops":["cylinder D6.35 x 3.17 along Y"]},
          "material":"N42SH NdFeB","color":MAG,"placements":[{"pos":at(r['x']+sgn*0.031,0.0190,r['z']),"axis":[0,1,0],"up":[1,0,0]}],"mass_g":0.75,
          "source":"https://www.kjmagnetics.com/proddetail.asp?prod=D42SH (2026-11-02): 6.35 x 3.17 mm, 150 C, 0.75 g, pull 2.3 lb to steel"})
    geom["add"].append({"name":"Magnet_Fix_%s"%r['id'],"kind":"purchased","count":1,
          "shape":{"summary":"K&J D42SH D6.35 x 3.17 mm, pole facing up = N, in the lid pocket at azimuth 0 deg (default; pockets at -30..+30 deg every 15 deg)","ops":["cylinder D6.35 x 3.17 along Y"]},
          "material":"N42SH NdFeB","color":MAG,"placements":[{"pos":at(r['x']+0.031,0.0133,r['z']),"axis":[0,1,0],"up":[1,0,0]}],"mass_g":0.75,
          "source":"same as above"})
    geom["add"].append({"name":"Reed_%s"%r['id'],"kind":"purchased","count":1,"phase":2,
          "shape":{"summary":"SparkFun COM-08642 glass reed switch, body D2.28 x 15.24 mm, leads 1.59 in overall; axis tangential (Z) at azimuth 180 deg, r=31","ops":["cylinder D2.28 x 15.24 along Z"]},
          "material":"glass / Fe-Ni","color":[0.85,0.9,0.95],"placements":[{"pos":at(r['x']-0.031,0.0150,r['z']-0.00762),"axis":[0,0,1],"up":[0,1,0]}],"mass_g":0.3,
          "source":"https://www.sparkfun.com/reed-switch.html (2026-11-02)"})
# ladder resistors on pod
for k,(rv,rid) in enumerate((("2.2k","L1"),("4.7k","L2"),("10k","L3"),("22k","L4"))):
    geom["add"].append({"name":"Ladder_R_%s"%rid,"kind":"purchased","count":1,"phase":2,"shape":{"summary":"axial 1/4 W resistor %s ohm (D2.5 x 6.3 body) on a 20 x 10 mm perfboard strip next to FC1, in parallel with that rotor's reed leads"%rv,"ops":["cylinder D2.5 x 6.3"]},
      "material":"carbon film","color":[0.82,0.7,0.5],"placements":[{"pos":at(0.250,-0.018,0.010+0.008*k),"axis":[1,0,0],"up":[0,1,0]}],"mass_g":0.25,"source":"design choice (analysis/a3_park.lua RK table); position EST"})
# hardware
def hw(id_,kind,spec,standard,g,mat,inst,src,joint,est=False,cov=None):
    return {"id":id_,"joint":joint,"kind":kind,"spec":spec,"standard":standard,"geom":g,"material":mat,"color":STEEL,"instances":inst,"qty_total":len(inst),"covered_by":cov,"est":est,"source":src}
def sidepos(r,dx,s):
    xi=(xle-dx)/ (c)  # dx is local x of screw relative to rotor axis; xle-local = 0.082 - xi*c => xi=(0.082-dx)/c
    xi=(0.082-dx)/c
    return half(xi)
i_m3x10=[];i_ins_mount=[];i_ins_nac=[];i_seam=[]
for r in ROT:
    for dx in (0.027,-0.027):
        for s in (1,-1):
            hth=sidepos(r,dx,s)
            i_m3x10.append({"pos":at(r['x']+dx,-0.0225,r['z']+s*(hth)),"axis":[0,0,-s],"parent":"Lift_Nacelle_%s"%r['id'],"note":"head bearing on the outer wall, wall 0.8 + standoff boss to mount face z_m%+.3f, engages insert in Motor_Mount (5 mm)"%(s*0.023)})
            i_ins_mount.append({"pos":at(r['x']+dx,-0.0225,r['z']+s*0.023),"axis":[0,0,-s],"parent":r['mount'],"note":"insert body 5.7 mm into the mount side face"})
    for dx in (0.058,-0.095):
        xi=(0.082-dx)/c; hth=half(xi)
        i_seam.append({"pos":at(r['x']+dx,-0.015,r['z']+hth-0.0008),"axis":[0,0,-1],"parent":"Lift_Nacelle_%s"%r['id'],"note":"seam screw from the outboard (+Z) half into the insert in the inboard half; for z_m<0 mirror: pos z = z_m - (half-0.0008), axis +Z"} if r['z']>0 else {"pos":at(r['x']+dx,-0.015,r['z']-hth+0.0008),"axis":[0,0,1],"parent":"Lift_Nacelle_%s"%r['id'],"note":"seam screw, mirrored side"})
        i_ins_nac.append({"pos":at(r['x']+dx,-0.015,r['z']+(0.0 if True else 0)),"axis":[0,0,-1] if r['z']>0 else [0,0,1],"parent":"Lift_Nacelle_%s"%r['id'],"note":"insert in the inboard-half seam boss at the split plane z=z_m"})
geom["hardware"].append(hw("HW-A3-01","screw","ISO 7380-1 M3x10 A2 (nacelle: 4 to mount + 2 seam per rotor)","ISO 7380-1",{"d":3,"L":10,"head":"button","head_d":5.7,"head_h":1.65,"s":2.0},"A2 stainless (304)",i_m3x10+i_seam,"https://www.zoro.com/ M3 button 18-8 listing family (price est); geometry as HW-036","J-A3-01",False,"new line P-A3-03"))
geom["hardware"].append(hw("HW-A3-02","insert","Ruthex-type M3x5.7 brass heat-set insert (16 in Motor_Mount sides, 8 in nacelle seam bosses)","n/a (Ruthex RX-M3x5.7)",{"od":4.6,"L":5.7,"hole_d":4.0,"hole_depth_min":7.3,"cad_mm":{"bore_d":4.2,"bore_depth":7.5,"lead_in":"0.4 x 45 deg"}},"brass",i_ins_mount+i_ins_nac,"geometry copied from HW-028 (hardware.json)","J-A3-01",False,"new line P-A3-04"))
i16=[]
for r in ROT:
    for a in (45,135,225,315):
        px=r['x']+0.008*math.cos(math.radians(a)); pz=r['z']+0.008*math.sin(math.radians(a))
        i16.append({"pos":at(px,0.0410,pz),"axis":[0,-1,0],"parent":"Lift_Cap_%s"%r['id'],"note":"replaces HW-033 at the same xz (est pattern 4 on dia 16); head bearing on the counterbore floor y=0.0410, tip y=0.0250"})
geom["hardware"].append(hw("HW-A3-03","screw","ISO 7380-1 M3x16 A2 (replaces supplied M3x12 holding-plate screw)","ISO 7380-1",{"d":3,"L":16,"head":"button","head_d":5.7,"head_h":1.65,"s":2.0},"A2 stainless (304)",i16,"https://www.zoro.com/zoro-select-m3-050-socket-head-cap-screw-button-plain-18-8-stainless-steel-16-mm-length-50-pk-m510300300016/i/G1723099/ (2026-11-02)","J-A3-02",False,"new line P-A3-02"))
geom["joints"]=[{"id":"J-A3-01","name":"Lift_Nacelle <-> Motor_Mount (4 x M3x10 into inserts) + halves joined by 2 seam screws","parts":["Lift_Nacelle_L1..L4","Motor_Mount_1..4"],"removable":True,"tool":"2.5 mm hex key","assembly_order":11,"notes":"Assemble after the motor and prop are fitted and tested; halves close around the mount and boom from the sides, no removal of boom or mount. Nacelle can be left on when the aircraft is broken down for transport (nacelle is wing-side of the boom splice only for rear rotors: check the rear nacelle does not cover the J-07 splice screws, tolerances.json)."},
 {"id":"J-A3-02","name":"Lift_Cap <-> prop holding plate (4 x M3x16 through the cap top plate into the adapter)","parts":["Lift_Cap_L1..L4","Lift_Prop_L1..L4"],"removable":True,"tool":"2.0 mm hex key (est)","assembly_order":12,"notes":"Cap is lowered over the hub with the blade slots on the blades; balance each prop+cap on a nail balancer before first spin (cap adds 9.4 g at r<=34 mm)."}]
geom["moving"]=[{"id":"cap_%s"%r['id'],"kind":"revolute","parent":"slide_panel_%s"%('R' if r['z']>0 else 'L'),"pivot":at(r['x'],0.030,r['z']),"axis":[0,1,0],"limits_deg":None,"note":"rides on the existing prop_%s group (same axis); the 2 rotating magnets and the cap turn with the prop; nacelle, fixed magnet and reed do not"%r['id']} for r in ROT]
geom["fusion_hints"]=["Copy 'VTOL C0 full', remove 16 HW-033 screws, add the parts above in assembly_order 11-12, extend the existing prop_Lx revolute groups.","Interference check expected: Lift_Cap skirt vs bell (1.55 mm), Lift_Nacelle lid vs prop hub (8 mm), tail vs ESC (35 mm); the rear nacelle nose is 6.6 mm from the rear gear clamp.","Parked-state render: blades along X; magnets A/B at x_m+/-0.031 over the fixed magnet and reed."]
json.dump(geom,open('../geometry.json','w'),indent=1)
# ---------------- inventory ----------------
base=json.load(open(ROOT+'inventory/inventory.json'))
rows=copy.deepcopy(base['rows'])
for x in rows:
    x['A3 status']='same'; x['A3 note']=''
def setr(id_,st,note):
    for x in rows:
        if x['ID']==id_: x['A3 status']=st; x['A3 note']=note
setr('M-13','changed','4 M3 insert bores added in each mount side face (16 inserts total); no change to qty or material')
setr('P-14','same','prop unchanged; the 4 supplied M3x12 holding-plate screws per prop are replaced by M3x16 (P-A3-02)')
setr('P-16','same','spare prop pair, unchanged')
setr('P-15','changed','no new hardware: firmware setting only, BLHeli_S Brake on stop = ON for the 4 lift ESCs (ArduPilot pass-through)')
setr('P-05','same','a3 prints about 0.30 kg of PETG (4 x 37.5 g nacelles, 4 x 9.4 g caps, reprint allowance 50 %) from the existing 2 kg')
setr('P-04','same','kit insert count (100) is exhausted by C0 (75 inserts) plus a3 (24): second pack P-A3-04')
setr('P-21','same','load cell + HX711 reused for the car-top drag rig (T-A3-8)')
setr('P-20','same','IR thermometer reused for nacelle/motor temperature test T-A3-5')
setr('N-01','same','NWA carbon props: the cap blade slots (24 mm wide, 15 mm tall) and hole pattern must be re-checked against the NWA hub drawing')
def newrow(id_,item,typ,cat,kit,cad,qty,vendor,unit,url,checked,src,notes,status='New: a3',est=False,phase=1,mk='Buy'):
    return {"ID":id_,"Item":item,"Type":typ,"Category":cat,"Kit":kit,"CAD part":cad,"Qty needed":qty,"Qty ordered":0,"Qty on hand":0,"Status":status,"Vendor":vendor,
     "Unit USD":unit,"Ext USD":round(unit*qty,2),"Made from":"","Process":"","Location":"—","Order date":"","Received date":"","Inspected":"","Source":src,"Notes":notes,
     "A3 status":"new","A3 note":("phase %d; "%phase)+notes,"URL":url,"Date checked":checked,"Make/Buy":mk,"price_is_estimate":est}
new=[
 newrow('P-A3-01','K&J Magnetics D42SH neodymium disc magnet 1/4 x 1/8 in (6.35 x 3.17 mm) N42SH, 150 C','Buy','Lift propulsion','K2','Magnet_Rot_Lx_A/B, Magnet_Fix_Lx',14,'K&J Magnetics',0.60,'https://www.kjmagnetics.com/proddetail.asp?prod=D42SH','2026-11-02','kjmagnetics.com D42SH page: $0.60 each (1-49), in stock','12 installed (8 rotating, 4 fixed) + 2 spare; standard N42 is only 80 C, the bell can reach 73 C (lumped est) to 134 C (upper bound), so SH grade',phase=1),
 newrow('P-A3-02','ISO 7380-1 M3x16 A2 button-head screws, pack of 50 (Zoro Select)','Buy','Hardware','K2','HW-A3-03',1,'Zoro',3.69,'https://www.zoro.com/zoro-select-m3-050-socket-head-cap-screw-button-plain-18-8-stainless-steel-16-mm-length-50-pk-m510300300016/i/G1723099/','2026-11-02','Zoro page: $3.69 per pack of 50, stock not shown','16 installed; pack covers spares',phase=1),
 newrow('P-A3-03','ISO 7380-1 M3x10 A2 button-head screws, pack of 50','Buy','Hardware','K2','HW-A3-01',1,'Zoro',3.69,'https://www.zoro.com/','2026-11-02','EST: same Zoro Select 50-pack price class as P-A3-02; the M3x10 listing itself was not opened','24 installed; if the C0 kit P-04 already holds >= 24 spare M3x10, delete this line',est=True,phase=1),
 newrow('P-A3-04','Ruthex-type M3x5.7 brass heat-set inserts, 100 pcs','Buy','Hardware','K7','HW-A3-02',1,'Amazon',5.99,'https://www.amazon.com/dp/B0BVMMBG2N','2026-10-13','docs/research/budget-airframe.md line 287 (price checked 2026-10-13; Amazon page not fetchable on 2026-11-02)','24 installed; C0 uses 75 of the 100 in P-04',phase=1),
 newrow('P-A3-05','SparkFun COM-08642 glass reed switch, SPST-NO, D2.28 x 15.24 mm, 12-23 AT','Buy','Electronics','K4','Reed_Lx',5,'SparkFun',2.25,'https://www.sparkfun.com/reed-switch.html','2026-11-02','sparkfun.com page: $2.25, in stock','4 installed + 1 spare (park-confirm ladder)',phase=2),
 newrow('P-A3-06','Adafruit 1877 silicone-cover stranded wire 2 m 26 AWG (red)','Buy','Electronics','K7','W-A3-01..04',6,'Mouser (Adafruit 485-1877)',0.95,'https://www.mouser.com/ProductDetail/485-1877','2026-11-02','mouser.com 485-1877: $0.95 each, 28 in stock','about 10 m of 2-conductor reed leads (5 m per pair of rotors); colour-code with heat-shrink',phase=2),
 newrow('P-A3-07','1/4 W through-hole resistors 2.2k, 4.7k, 10k, 22k, 10k pull-up: 5 packs of 25','Buy','Electronics','K7','Ladder_R_Lx',5,'Adafruit',0.60,'https://www.adafruit.com/product/2780','2026-11-02','EST: Adafruit 2780 (220 ohm 25-pack) is $0.75; the other values were not opened; $0.60 is the 100+ price tier, shown as an estimate','5 values (4 ladder + 1 pull-up)',est=True,phase=2),
]
newm=[
 newrow('M-A3-01','Lift nacelle, PETG, NACA 0022 plan section, 2 clamshell halves per rotor','Make','Lift propulsion','K2','Lift_Nacelle_Lx',4,'In-house',0,'','2026-11-02','geometry.json','about 37.5 g each; 0.8 mm walls; 0.3 kg PETG incl. reprints from P-05',status='New: a3 (to make)',mk='Make',phase=1),
 newrow('M-A3-02','Lift cap (rotating hub fairing with 2 magnet ears), PETG','Make','Lift propulsion','K2','Lift_Cap_Lx',4,'In-house',0,'','2026-11-02','geometry.json','about 9.4 g each; balance on a nail balancer',status='New: a3 (to make)',mk='Make',phase=1),
 newrow('M-A3-03','Reed ladder harness: 4 reed leads + 4 resistors on a perfboard strip beside FC1, to one ADC pin','Make','Electronics','K4','Reed_Lx, Ladder_R_Lx',1,'In-house',0,'','2026-11-02','geometry.json; analysis/a3_park.lua RK table','spare ADC pin and 3.3 V pad not yet identified (—)',status='New: a3 (to make)',mk='Make',phase=2),
 newrow('M-A3-04','Car-top single-rotor drag rig: motor + mount + boom stub + nacelle/cap variants on a P-21 load-cell mast','Make','Test','K6','—',1,'In-house',0,'','2026-11-02','design.md T-A3-8','mast material and fasteners not priced (—)',status='New: a3 (to make)',mk='Make',phase=1)]
rows+=new+newm
rows_buy=[x for x in rows if x['Type']=='Buy']
goods=round(sum(x['Ext USD'] for x in rows_buy),2)
tax_rate=0.1025
goods0=1630.77
newgoods=round(sum(x['Ext USD'] for x in new),2)
p1=round(sum(x['Ext USD'] for x in new if x['A3 note'].startswith('phase 1')),2)
p2=round(newgoods-p1,2)
tax=round(goods*tax_rate,2)
committed=round(goods*(1+tax_rate)+100,2)
summary={"generated":"2026-11-02","variant":"a3","basis":"inventory/inventory.json (C0, 67 rows, generated 2026-10-19); a3 status per row; new lines priced live 2026-11-02 except where est",
 "goods_c0":goods0,"goods_new_phase1":p1,"goods_new_phase2":p2,"goods_new":newgoods,"goods":goods,"taxRate":tax_rate,"tax":tax,
 "shipping":100,"shipping_note":"C0 allowance kept; the 5 new vendors (K&J, Zoro, SparkFun, Mouser, Adafruit) are not quoted (—): EST $25-40 extra, not included in the totals below",
 "committed":committed,"cap":2000,"reserve":round(2000-committed,2),"delta_vs_c0_committed":round(committed-1897.92,2),
 "phase1_only":{"goods":round(goods0+p1,2),"committed":round((goods0+p1)*(1+tax_rate)+100,2),"reserve":round(2000-((goods0+p1)*(1+tax_rate)+100),2)},
 "c0_reference":{"committed":1897.92,"reserve":102.08},
 "mass_delta_kg":{"phase1":round(fr['dm_phase1_kg'],3),"phase2":round(fr['dm_phase2_kg'],3),"basis":"per rotor %.1f g x 4 = nacelle 37.5 + cap 9.4 + 3 magnets 2.25 + glue 1 + 6 M3x10 2.7 + 4 net M3x16 3.2 + 6 inserts 0.9; phase 2 adds ~22 g (reeds, 10 m wire, resistors) EST"%fr['per_rotor_added_g']},
 "c0_lines":{"same":sum(1 for x in rows if x['A3 status']=='same'),"changed":sum(1 for x in rows if x['A3 status']=='changed'),"removed":0,"new":len(new)+len(newm)},
 "hardware_delta":{"added":[{"item":"ISO 7380-1 M3x10 A2","pieces":24},{"item":"M3x5.7 heat-set insert","pieces":24},{"item":"ISO 7380-1 M3x16 A2","pieces":16},{"item":"K&J D42SH magnet (installed)","pieces":12},{"item":"reed switch (installed)","pieces":4},{"item":"ladder resistor","pieces":4}],
   "removed":[{"item":"supplied M3x12 holding-plate screw (HW-033)","pieces":16}],"net_pieces_vs_613":84-16,"added_total":84,"removed_total":16,"printed_parts_added":12},
 "unquoted":["shipping on new vendors","mast and fasteners for M-A3-04","M3x10 listing price (est)","resistor values other than 220 ohm (est)"]}
cols=base['columns']+['A3 status','A3 note','URL','Date checked','Make/Buy','price_is_estimate']
for x in rows:
    for k in ('URL','Date checked','Make/Buy','price_is_estimate'): x.setdefault(k,'' if k!='price_is_estimate' else False)
json.dump({"summary":summary,"columns":cols,"rows":rows},open('../inventory.json','w'),indent=1)
# ---------------- metrics ----------------
cen=fr['a3_central (1.1e-3) phase2']; lo=fr['a3_low (0.7e-3) phase2']; hi=fr['a3_high (1.7e-3) phase2']
met={"variant":"a3","basis":"C0: MTOW 6.18 kg, hover 832 W, cruise 365 W, 11.9 min, committed $1,897.92, reserve $102.08, NP 47.6 % MAC, SM 19.6 %",
 "mass_kg":{"value":cen['m'],"c0":6.182,"source":"C0 6.1822 kg (results.json concepts.C0.sized.m) + 0.250 kg (4 x 56.9 g + 22 g phase-2 wiring); wing not re-sized","est":True},
 "cg_x_m":{"value":-0.06683,"c0":-0.06683,"source":"moment balance: front pair +0.37092 m, rear pair -0.50458 m, equal masses; shift %.5f mm (analysis/final_runs.json)"%fr['cg_shift_mm'],"est":True},
 "static_margin_pct":{"value":19.6,"c0":19.6,"source":"aero.json static_margin_pct_at_28; CG shift 0.00003 mm; nacelle side area is symmetric about the CG (front pair +0.44 m, rear pair -0.44 m) so net weathercock effect ~0 (not modelled)","est":True},
 "span_m":{"value":2.4,"c0":2.4,"source":"cad/params.txt; nacelles inside the 0.65 m rotor disc half-width"},
 "width_m":{"value":2.4,"c0":2.4,"source":"span governs; nacelles add 0.057 m width at each boom, inside the lift prop discs"},
 "motors":{"value":5,"c0":5,"source":"4 lift + 1 pusher, no change"},
 "hover_power_W":{"value":cen['P_hover'],"low":cen['P_hover'],"high":round(832*(cen['m']/6.1822)**1.5*1.015,1),"c0":832,"source":"F3: P scales as m^1.5 (832 x (6.432/6.1822)^1.5 = 883) x 1.0075 nacelle download (EST range 1.005-1.015)","est":True},
 "cruise_power_W":{"value":cen['P_cruise'],"low":lo['P_cruise'],"high":hi['P_cruise'],"c0":365.2,"source":"F6/F7 with CdA_rotor 1.1e-3 (0.7e-3..1.7e-3) per rotor, fixed wing; analysis/a3_effect.py","est":True},
 "endurance_min":{"value":cen['t_cruise_min'],"low":hi['t_cruise_min'],"high":lo['t_cruise_min'],"c0":11.94,"source":"t = (144.3 Wh x 0.8 x 0.95 - P_hover x 160 s)/P_cruise (model.js t_cruise_avail); same fixed 2 x 6500 mAh pack","est":True},
 "cost_usd":{"value":committed,"c0":1897.92,"source":"inventory.json summary: goods %.2f x 1.1025 + $100 shipping; excludes extra shipping on new vendors (—, EST $25-40)"%goods,"phase1_only":summary['phase1_only']['committed']},
 "reserve_usd":{"value":summary['reserve'],"c0":102.08,"phase1_only":summary['phase1_only']['reserve'],"source":"2000 - committed; before extra shipping"},
 "parts_new":{"value":96,"breakdown":{"printed_parts":12,"hardware_pieces_installed":84,"note":"printed: 4 nacelles x 2 halves + 4 caps"},"source":"inventory.json summary.hardware_delta"},
 "parts_removed":{"value":16,"source":"HW-033 supplied M3x12 screws"},
 "risk":"medium",
 "trl_note":"Fairing: TRL 3-4 (concept, bottom-up drag EST, nothing printed or tested). Detent + brake: TRL 2-3 (physics model only, capture 36-56 % per attempt from analysis/mc.py; needs the bench test). Reed/Lua nudge loop: TRL 2 (needs scripting in the CoreWing F405 build, not verified; STM32F405RGT6 flash-limited per ArduPilot board page 2026-11-02)."}
met["drag_cases_per_rotor_CdA_m2"]={"C0 random unfaired (repo EST)":0.0034,"aligned unfaired":0.00286,"random faired":0.00155,"a3 aligned faired":0.0011,"windmilling brake off":"0.0146 (CD_disc 0.10 EST)"}
met["effect_vs_c0"]={"cruise_power_pct":round((cen['P_cruise']/365.2-1)*100,1),"hover_power_pct":round((cen['P_hover']/832-1)*100,1),"endurance_pct":round((cen['t_cruise_min']/11.94-1)*100,1),"breakeven_CdA_per_rotor":fr['breakeven_CdA_per_rotor']}
json.dump(met,open('../metrics.json','w'),indent=1)
print(json.dumps(summary,indent=1)); print(json.dumps(met['effect_vs_c0']))
