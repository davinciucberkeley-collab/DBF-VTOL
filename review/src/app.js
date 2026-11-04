/* Review page logic. DATA = analysis/results.json (embedded at build). VTOLModel = analysis/model.js. */
(function(){
const D = DATA, $ = s=>document.querySelector(s), $$ = s=>Array.from(document.querySelectorAll(s));
const fmtUSD = v => '$'+Number(v).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
const fmt = (v,d=1) => Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
function get(path){
  let root = D, pth = path;
  if(path.startsWith('V02.')){ root = V02; pth = path.slice(4); }
  else if(path.startsWith('SIM.')) return SIM[path.slice(4)];
  else if(path.startsWith('AEROD.')){ let o=AEROD; for(const k of path.slice(6).split('.')) o = o?.[k]; return o; }
  else if(path.startsWith('AERO.')) return AERO[path.slice(5)];
  else if(path.startsWith('CADP.')) return CADP[path.slice(5)];
  let o = /^C\d/.test(pth) ? root.concepts : root; for(const k of pth.split('.')) o = o?.[k]; return o; }
const set = (id, txt) => { const e=document.getElementById(id); if(e) e.textContent = txt; };
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// ---------- navigation: contents list (the binder below shows one chapter at a time) ----------
const secs = $$('section.sec');
const GROUP_NAMES = {home:'Overview', design:'Design', verify:'Verification', program:'Program', build:'Build and software', doc:'Documentation'};
function buildNav(){
  const box = $('#tocList'); if(!box) return; let cur=null, ol=null;
  secs.forEach(s=>{ const p=s.dataset.group; if(s.dataset.nonum) return;
    if(p!==cur){ cur=p; box.insertAdjacentHTML('beforeend', `<li class="part">${GROUP_NAMES[p]||''}<ol></ol></li>`); ol=box.lastElementChild.querySelector('ol'); }
    ol.insertAdjacentHTML('beforeend', `<li><a href="#${s.id}"><span class="n">${s.dataset.n}</span><span class="t">${s.dataset.title}</span></a></li>`); });
}
// chapter numbers follow page order; "§N" links are filled from their target chapter
function xrefs(){ $$('a.xref').forEach(x=>{ const t=document.getElementById(x.getAttribute('href').slice(1)); const s=t&&t.closest('section.sec'); if(s) x.textContent='§'+s.dataset.n; }); }
const secNo = id => { const s=document.getElementById(id); return s ? s.dataset.n : '—'; };

// ---------- data binding ----------
function fill(){
  $$('[data-k]').forEach(e=>{ let v = get(e.dataset.k); if(v===undefined||v===null||(typeof v==='number'&&isNaN(v))){ e.textContent='—'; return; }
    if(e.dataset.c==='txt'){ e.textContent = String(v); return; }
    if(e.dataset.m) v = v*Number(e.dataset.m);
    e.textContent = e.dataset.c==='usd' ? fmtUSD(v) : e.dataset.c==='int' ? Math.round(v).toLocaleString('en-US') : fmt(v, e.dataset.d!==undefined?Number(e.dataset.d):1); });
}

// ---------- derived numbers used in text ----------
const C0 = D.concepts.C0, s0 = C0.sized, B = D.base;
const cat = (bom, name) => bom.lines.filter(l=>l.cat===name).reduce((a,l)=>a+l.ext,0);
const CATS = ['Lift propulsion','Cruise propulsion','Controls','Energy','Avionics','Airframe','Test & safety','Spares'];
// lumped motor thermal from the steady FEA (section 12): tau = m c / (h A), h A = Q / (T_ss - T_amb)
// c = 470 J/kgK EST mass-weighted (copper 385, steel 460, aluminium 896); band 385-500 J/kgK
const TH = (()=>{ const Q=SIM.motor_Q, Tss=SIM.motor_T_steady, Ta=35, cP=470, mc=0.165*cP;
  if(!(Q>0&&Tss>Ta)) return null; const hA=Q/(Tss-Ta), tau=mc/hA, dT=Tss-Ta, T90=Ta+dT*(1-Math.exp(-90/tau));
  // T3 protocol: 3 x (90 s on, 30 s off), cooling with the same h A (prop wash gone -> conservative)
  let T=Ta; for(let k=0;k<3;k++){ T = Ta + dT + (T-Ta-dT)*Math.exp(-90/tau); if(k<2) T = Ta + (T-Ta)*Math.exp(-30/tau); }
  const lo=Ta+dT*(1-Math.exp(-90/(0.165*500/hA))), hi=Ta+dT*(1-Math.exp(-90/(0.165*385/hA)));
  return {hA, mc, tau, T90, T3: T, lo, hi, cP}; })();
function derived(){
  set('wingT', fmt(s0.chord*0.13,3)); set('segF', fmt(C0.geo.segs[0],2)); set('segR', fmt(C0.geo.segs[1],2));
  set('m3Empty', fmt(s0.m - s0.m_batt - B.mPayload,2));
  const Eus = s0.Epack_Wh*(1-B.reserve)*B.etaBatt;                     // usable Wh within reserve
  const PhLim = (Eus - s0.P_cruise*B.tCruise/3600)/((B.tHover+B.tTrans)/3600);
  set('mHov', fmt(PhLim,0));
  const PcLim = (Eus - s0.P_hover*(B.tHover+B.tTrans)/3600)/(B.tCruise/3600);
  set('mCr', fmt(PcLim,0));
  const CDtot = s0.CD0 + s0.CDi, CD0lim = CDtot*PcLim/s0.P_cruise - s0.CDi;
  set('mCD0', fmt(CD0lim,3));
  set('mPackDel', fmt(s0.E_Wh/(1-B.reserve),0));
  set('iUnit', fmt(s0.P_hover_per_motor/B.Vpack,1));
  const g=C0.geo, cg=C0.cg, L=g.xFront-g.xRear;
  set('smWith', fmt((g.hn-0.28)*100,1)); set('smNo', fmt(cg.SM_noPayload*100,1));
  const xc = cg.cgNoPayload, Tr = (g.xFront-xc)/L, Tf = (xc-g.xRear)/L; set('hoverSplit', fmt((Tr/Tf-1)*100,0));
  set('cgSplit', fmt(0.15*L/4*100,0));

  if(TH){ ['thermLumped','thermLumped2','thermLumped3'].forEach(i=>set(i, fmt(TH.T90,0))); set('thermTau', fmt(TH.tau,0)); set('thermTau2', fmt(TH.tau,0));
    set('thermHA', fmt(TH.hA,3)); set('thermMC', fmt(TH.mc,0)); set('thermT3', fmt(TH.T3,0)); set('thermT3b', fmt(TH.T3,0)); set('thermLumped4', fmt(TH.T90,0)); set('thermBand', fmt(TH.lo,0)+'–'+fmt(TH.hi,0)); }
  // stopped-rotor drag: model baseline and R10 failure level per unit
  const q = 0.5*B.rho*B.Vc*B.Vc, baseD = q*C0.params.CdA_rotor, dCdA = (CD0lim - s0.CD0)*s0.S/C0.params.nLift;
  set('rotorBase', fmt(baseD,2)); set('rotorFail', fmt(baseD + q*dCdA,1));
  set('cgAft', fmt((g.hn-0.08)*100,1)); set('engage', fmt(C0.struct.engage,2)); set('engageD', fmt(C0.struct.engageD,0));
  set('iTrans', fmt(s0.I_trans,0)); set('iHovL', fmt(s0.I_hover_loaded,0));
  set('handRF', fmt(C0.struct.SIG_DESIGN/C0.struct.sigJ,2));
  set('longest', fmt(Math.max(B.span/2-0.08, ...C0.geo.segs),2)); set('longest2', fmt(Math.max(B.span/2-0.08, ...C0.geo.segs),2)); set('carMin', fmt(Math.max(B.span/2-0.08, ...C0.geo.segs)+0.03,2));
  set('r13kgf', fmt(1.6*s0.m/4,2)); $$('.r13kgf').forEach(e=>e.textContent=fmt(1.6*s0.m/4,2));  // R13: 4 motors x T >= 1.6 x MTOW
}

// ---------- drawings ----------
function drawings(){
  const box=$('#drawingsBox'); if(!box) return;
  const t=['General arrangement','Exploded assembly','Parts list','Wing panel, saddle and bolt pillar','Motor mount and splice','Clamps','Tube cut list, leg and fairing','Fastener schedule','Printed hardpoints and trays'].filter((_,i)=>IMG['drw'+(i+1)]);
  t.forEach((title,i)=>{ const k='drw'+(i+1); if(!IMG[k]) return;
    box.insertAdjacentHTML('beforeend', `<figure class="chart sheet"><button type="button" class="sheetbtn" data-k="${k}" data-t="Sheet ${i+1}: ${title}"><img class="cadimg" src="${IMG[k]}" alt="Drawing DBF-DRW-001 sheet ${i+1}, ${title}" loading="lazy"></button><figcaption>Sheet ${i+1} of ${t.length}. ${title}</figcaption></figure>`); });
  const ga=$('#gaFig'); if(ga && IMG.iso) ga.insertAdjacentHTML('afterbegin', `<img class="cadimg render" src="${IMG.iso}" alt="Isometric render of the C0 aircraft: a straight wing on a slim pod, two booms carrying four lift rotors and a twin-fin tail, a pusher prop behind the pod and four faired landing legs">`);
  if(ga && IMG.drw1) ga.insertAdjacentHTML('beforeend', `<p class="cta"><button type="button" class="sheetbtn btnlink quiet" data-k="drw1" data-t="Sheet 1: General arrangement">Open the general-arrangement drawing</button></p>`);
  const lb=$('#lightbox');
  $$('.sheetbtn').forEach(b=>b.addEventListener('click',()=>{ const im=document.createElement('img'); im.src=IMG[b.dataset.k]; im.alt='Drawing DBF-DRW-001, '+b.dataset.t; $('#lbBody').replaceChildren(im); $('#lbTitle').textContent='DBF-DRW-001 · '+b.dataset.t;
    if(lb.showModal) lb.showModal(); else lb.setAttribute('open',''); }));
  $('#lbClose').addEventListener('click',()=>lb.close ? lb.close() : lb.removeAttribute('open'));
  lb.addEventListener('click',e=>{ if(e.target===lb) lb.close(); });
}
// report numbering: subsections n.k and figures n.k, from the section number
function numberHeadings(){
  let i=0; $$('section.sec').forEach(s=>{ const no=s.querySelector('.secno'); if(s.dataset.nonum){ s.dataset.n=''; if(no) no.remove(); return; } s.dataset.n=String(++i); if(no) no.textContent=s.dataset.n; });
  $$('section.sec').forEach(s=>{ const n=s.dataset.n; let k=0; if(!n) return;
    s.querySelectorAll('h3[id]').forEach(h=>{ k++; if(!h.querySelector('.subno')) h.insertAdjacentHTML('afterbegin',`<span class="subno">${n}.${k}</span> `); }); });
}
function numberFigures(){
  $$('section.sec').forEach(s=>{ const n=s.dataset.n; let k=0;
    s.querySelectorAll('figure figcaption').forEach(c=>{ k++; const old=c.querySelector('.figno'); if(old) old.remove(); c.insertAdjacentHTML('afterbegin',`<span class="figno">Figure ${n}.${k}.</span> `); }); });
}

// ---------- tables ----------
function img(id, list){
  const box = $(id); if(!box) return;
  list.forEach(([key, cap])=>{ if(!IMG[key]) return;
    box.insertAdjacentHTML('beforeend', `<figure class="chart" style="margin:0"><figcaption>${cap}</figcaption><img class="cadimg" src="${IMG[key]}" alt="${cap}" loading="lazy"></figure>`); });
}
function tables(){
  img('#simImages', [['fea_boom','Boom arm, von Mises at full thrust'],['fea_spar','Spar + joiner, von Mises at 4.5 g'],['therm_motor','Lift motor, steady-state temperature']]);
  // v0.2 -> v0.3 change table
  const ctb = $('#changeTable tbody'), b2 = V02.concepts.C0.bom, b3 = C0.bom; let t2=0,t3=0;
  CATS.forEach(cn=>{ const v2=cat(b2,cn), v3=cat(b3,cn); t2+=v2; t3+=v3;
    ctb.insertAdjacentHTML('beforeend', `<tr><td>${cn}</td><td class="n">${fmt(v2,2)}</td><td class="n">${fmt(v3,2)}</td><td class="n ${v2-v3>=0?'ok':'bad'}">${fmt(v2-v3,2)}</td></tr>`); });
  ctb.insertAdjacentHTML('beforeend', `<tr><td>Compliance fees</td><td class="n">${fmt(cat(b2,'Compliance'),2)}</td><td class="n">outside cap</td><td class="n">—</td></tr>`);
  ctb.insertAdjacentHTML('beforeend', `<tr class="total"><td>Hardware goods</td><td class="n">${fmt(t2,2)}</td><td class="n">${fmt(t3,2)}</td><td class="n ${t2-t3>=0?'ok':'bad'}">${fmt(t2-t3,2)}</td></tr>`);
  // parts
  const pt = $('#partsTable tbody'); let tot=0;
  C0.cg.items.forEach(i=>{ tot+=i.m; pt.insertAdjacentHTML('beforeend',`<tr><td>${i.name}</td><td class="n">${fmt(i.m,3)}</td><td class="n">${fmt(i.x,3)}</td><td><small>${i.src}</small></td></tr>`); });
  pt.insertAdjacentHTML('beforeend',`<tr class="total"><td>Total (MTOW)</td><td class="n">${fmt(tot,3)}</td><td></td><td><small>matches sized m = ${fmt(s0.m,3)} kg</small></td></tr>`);
  // concept cards
  const cc = $('#conceptCards');
  for(const k of ['C0','C1','C2','C3']){ const c=D.concepts[k], s=c.sized, fits=c.bom.total<=2000;
    cc.insertAdjacentHTML('beforeend',`<div class="card${k==='C0'?' pick':''}"><span class="tag chip ${k==='C0'?'met':fits?'open':'fail'}">${k==='C0'?'baseline':fits?'alternative':'over cap'}</span><h3>${k} · ${c.label}</h3>
      <dl class="kv"><dt>Lift unit</dt><dd>${c.params.nLift} × ${c.motor}</dd><dt>MTOW</dt><dd>${fmt(s.m,2)} kg</dd><dt>Hover / cruise</dt><dd>${fmt(s.P_hover,0)} W / ${fmt(s.P_cruise,0)} W</dd>
      <dt>L/D cruise</dt><dd>${fmt(s.LD,1)}</dd><dt>T/W · motor-out</dt><dd>${fmt(s.TW,2)} · ${s.TW_motorOut?fmt(s.TW_motorOut,2):'none'}</dd><dt>Pack</dt><dd>${c.pick.id}</dd><dt>Committed spend</dt><dd class="${fits?'ok-t':'bad-t'}">${fmtUSD(c.bom.total)}</dd></dl></div>`); }
  // pugh
  const c1=D.concepts.C1.sized, c2=D.concepts.C2.sized, b0=C0.bom.total, bb1=D.concepts.C1.bom.total, bb2=D.concepts.C2.bom.total;
  const rows = [
    ['Spend vs $2,000 cap (R6)', `${fmtUSD(b0)} / ${fmtUSD(bb1)} / ${fmtUSD(bb2)}`, -1, -1],
    ['MTOW', `${fmt(s0.m,2)} / ${fmt(c1.m,2)} / ${fmt(c2.m,2)} kg`, -1, -1],
    ['Hover power', `${fmt(s0.P_hover,0)} / ${fmt(c1.P_hover,0)} / ${fmt(c2.P_hover,0)} W`, c1.P_hover<=s0.P_hover?1:-1, c2.P_hover<=s0.P_hover?1:-1],
    ['Cruise L/D', `${fmt(s0.LD,1)} / ${fmt(c1.LD,1)} / ${fmt(c2.LD,1)}`, c1.LD>s0.LD?1:-1, c2.LD>s0.LD?1:-1],
    ['Hover motor-out (R14)', `none / ${fmt(c1.TW_motorOut,2)} / ${fmt(c2.TW_motorOut,2)} T/W`, 1, 1],
    ['Build effort', '2 / 4 / 2 booms; 5 / 9 / 9 motors', -1, 0],
    ['Flight controller', 'F405 / F405 (ailerons on a Y-lead) / H743 for OctaQuad', 0, -1],
    ['Prop parking in cruise', '4 / 8 / 8 stopped props', -1, -1],
  ];
  const tb = $('#pugh tbody'); let s1=0,s2=0;
  const sym = v => v>0?'<td class="n ok">+</td>':v<0?'<td class="n bad">−</td>':'<td class="n">0</td>';
  rows.forEach(r=>{ s1+=r[2]; s2+=r[3]; tb.insertAdjacentHTML('beforeend',`<tr><td>${r[0]}</td><td><small>${r[1]}</small></td><td class="n">0</td>${sym(r[2])}${sym(r[3])}</tr>`); });
  tb.insertAdjacentHTML('beforeend',`<tr class="total"><td>Net score</td><td></td><td class="n">0</td><td class="n">${s1}</td><td class="n">${s2}</td></tr>`);
  // roll-up
  const groups = [['Lift units','m_lift'],['Booms + clamps','m_booms'],['Wing + spar','m_wing'],['Tail','m_tail'],['Fixed (pod, gear, avionics, pusher, servos, wiring, payload)','m_fixed'],['Battery','m_batt'],['MTOW','m']];
  const ru = $('#rollup tbody');
  groups.forEach(([n,k])=>ru.insertAdjacentHTML('beforeend',`<tr${k==='m'?' class="total"':''}><td>${n}</td><td class="n">${fmt(C0.design[k],2)}</td><td class="n">${fmt(s0[k],2)}</td><td class="n">${fmt(c1[k],2)}</td><td class="n">${fmt(c2[k],2)}</td><td><small>${k==='m_batt'?'design: E/e_spec; real: pack weight':k==='m_wing'?'F11':k==='m'?'F12':'sizing.mjs'}</small></td></tr>`));
  // calibration from the concepts' own thrust tables
  const ct = $('#calib tbody');
  [['X4110S 17 in (C0)', D.concepts.C0.params], ['X3515S 16 in (C3)', D.concepts.C3.params], ['V3508 15 in (C1/C2)', D.concepts.C1.params]].forEach(([n,pp])=>{
    pp.thrustTable.forEach(([T,P])=>{ const f=VTOLModel.calibFMeta(T,P,pp.liftD,1.225); ct.insertAdjacentHTML('beforeend',`<tr><td>${n}</td><td class="n">${T}</td><td class="n">${fmt(P,1)}</td><td class="n">${fmt(f*P,1)}</td><td class="n">${fmt(f,3)}</td></tr>`); }); });
  // packs
  const pk = $('#packTable tbody');
  D.packs.forEach((p,i)=>{ const sw=D.sweepC0[i]; pk.insertAdjacentHTML('beforeend',`<tr${p.id===C0.pick.id?' class="chosen"':''}><td>${p.id}</td><td>${p.chem}</td><td class="n">${fmt(p.Wh,1)}</td><td class="n">${fmt(p.kg,3)}</td><td class="n">${fmt(p.Wh/p.kg,0)}</td><td class="n">${p.contA}</td><td class="n">${fmt(p.usd,2)}</td><td class="n">${fmt(sw.m,2)}</td><td class="n ${sw.cruise_min>=D.cruiseMarginMin?'ok':'warn'}">${fmt(sw.cruise_min,1)}${sw.cruise_min<D.cruiseMarginMin?' <small>below margin</small>':''}</td></tr>`); });
  // landing
  const lt = $('#landTable tbody');
  C0.struct.strokes.forEach(s=>{ const ns=s.nSpring||2*s.n, cls = ns>10?'bad':ns>8?'warn':'ok'; lt.insertAdjacentHTML('beforeend',`<tr><td class="n">${s.stroke*1000}</td><td class="n">${fmt(s.n,1)}</td><td class="n">${fmt(ns,1)}</td><td class="${cls}">${ns>10?'damages mounts/booms':ns>8?'marginal':'acceptable'}</td></tr>`); });
  // BOM side by side
  const bs = $('#bomSide tbody'), bm = k=>D.concepts[k].bom;
  CATS.forEach(cn=>bs.insertAdjacentHTML('beforeend',`<tr><td>${cn}</td>${['C0','C1','C2'].map(k=>`<td class="n">${fmt(cat(bm(k),cn),2)}</td>`).join('')}</tr>`));
  [['Goods subtotal','goods'],['Sales/use tax 10.25 %','tax'],['Shipping allowance (est.)','shipping']].forEach(([n,k])=>
    bs.insertAdjacentHTML('beforeend',`<tr><td>${n}</td>${['C0','C1','C2'].map(c=>`<td class="n">${fmt(bm(c)[k],2)}</td>`).join('')}</tr>`));
  bs.insertAdjacentHTML('beforeend',`<tr class="total"><td>Committed spend</td>${['C0','C1','C2'].map(c=>`<td class="n ${bm(c).total<=2000?'ok':'bad'}">${fmt(bm(c).total,2)}</td>`).join('')}</tr>`);
  bs.insertAdjacentHTML('beforeend',`<tr><td>Reserve left under $2,000</td>${['C0','C1','C2'].map(c=>`<td class="n ${bm(c).crash>=100?'ok':'bad'}">${fmt(bm(c).crash,2)}</td>`).join('')}</tr>`);
  // BOM full
  const bt = $('#bomTable tbody');
  C0.bom.lines.forEach(l=>bt.insertAdjacentHTML('beforeend',`<tr><td>${l.cat}</td><td>${l.item}</td><td class="n">${l.qty}</td><td class="n">${fmt(l.unit,2)}</td><td class="n">${fmt(l.ext,2)}</td><td><small>${l.src}${l.note?' · '+l.note:''}</small></td></tr>`));
  bt.insertAdjacentHTML('beforeend',`<tr class="total"><td colspan="4">Goods</td><td class="n">${fmt(C0.bom.goods,2)}</td><td><small>sum of lines</small></td></tr>`);
  (C0.bom.fees||[]).forEach(f=>bt.insertAdjacentHTML('beforeend',`<tr><td>Fees (outside cap)</td><td>${f.item}</td><td class="n">1</td><td class="n">${fmt(f.usd,2)}</td><td class="n">—</td><td><small>${f.src}</small></td></tr>`));
  // CG table
  const cgt = $('#cgTable tbody'); let mm=0,mo=0;
  C0.cg.items.forEach(i=>{ mm+=i.m; mo+=i.m*i.x; cgt.insertAdjacentHTML('beforeend',`<tr><td>${i.name}</td><td class="n">${fmt(i.m,3)}</td><td class="n">${fmt(i.x,3)}</td><td class="n">${fmt(i.m*i.x,4)}</td></tr>`); });
  cgt.insertAdjacentHTML('beforeend',`<tr class="total"><td>Total · CG = Σmx/Σm</td><td class="n">${fmt(mm,3)}</td><td class="n">${fmt(mo/mm,3)}</td><td class="n">${fmt(mo,4)}</td></tr>`);
  const st = $('#stabTable tbody'), G3 = ()=>['C0','C1','C2'].map(c=>D.concepts[c]);
  [['Wing lift slope a_w (/rad)', c=>c.geo.aw, 2, 'Helmbold: 2πA/(2+√(A²+4))'],
   ['Tail volume V_h', c=>c.geo.Vh, 2, 'S_h l_h /(S c), target 0.35 est.'],
   ['Fin volume V_v', c=>c.geo.Vv, 3, 'S_v l_h /(S b), target 0.030 est.'],
   ['Downwash dε/dα', c=>c.geo.deda, 3, '2 a_w/(π A)'],
   ['Neutral point, % MAC', c=>c.geo.hn*100, 1, '0.25 + η V_h (a_t/a_w)(1−dε/dα)'],
   ['Static margin at 28 % CG, % MAC', c=>c.geo.SM*100, 1, 'h_n − h_cg'],
   ['Static margin, no payload, % MAC', c=>c.cg.SM_noPayload*100, 1, 'CG aft without 0.5 kg'],
   ['Thrust centroid, % MAC', c=>c.cg.pct.thrust, 1, '(x_front + x_rear)/2'],
   ['Tail arm l_h, m', c=>c.geo.lh, 2, 'wing AC to tail AC']].forEach(([n,f,d,fx])=>
     st.insertAdjacentHTML('beforeend',`<tr><td>${n}</td>${G3().map(c=>`<td class="n">${fmt(f(c),d)}</td>`).join('')}<td><small>${fx}</small></td></tr>`));
  // simulation vs hand
  const sm = $('#simTable tbody'), pct=(a,b)=>((a-b)/b*100);
  [['Boom static (1.5 mm mesh)','von Mises max, MPa', SIM.boom_vm_max_fine, SIM.boom_hand_sigma, 'RF '+fmt(275/SIM.boom_vm_max_fine,1)+' on yield'],
   ['Boom static (3 mm mesh)','von Mises max, MPa', SIM.boom_vm_max, SIM.boom_hand_sigma, 'mesh change '+fmt((SIM.boom_vm_max_fine/SIM.boom_vm_max-1)*100,0)+' %'],
   ['Boom static','tip deflection, mm', SIM.boom_disp_max, SIM.boom_hand_defl, '—'],
   ['Boom modal','first mode, Hz', SIM.boom_f1, SIM.boom_hand_fn, 'tap test §'+secNo('structures')+' M2'],
   ['Spar + joiner static, 2 mm mesh (idealised OD)','von Mises max, MPa', SIM.spar_vm_max_fine, SIM.spar_hand_sigJ, 'hand calc governs: RF '+fmt(C0.struct.SIG_DESIGN/C0.struct.sigJ,2)],
   ['Spar + joiner static, 3 mm mesh','von Mises max, MPa', SIM.spar_vm_max, SIM.spar_hand_sigJ, 'mesh change '+fmt((SIM.spar_vm_max_fine/SIM.spar_vm_max-1)*100,0)+' %'],
   ['Lift motor thermal','steady temperature, °C', SIM.motor_T_steady, SIM.motor_T_steady_hand, TH?('90 s ≈ '+fmt(TH.T90,0)+' °C; 3 back-to-back ≈ '+fmt(TH.T3,0)+' °C'):'—']]
   .forEach(([a,q,f,h,m])=>{ if(f===undefined||h===undefined) return; const d=pct(f,h); sm.insertAdjacentHTML('beforeend',`<tr><td>${a}</td><td>${q}</td><td class="n">${fmt(f,1)}</td><td class="n">${fmt(h,1)}</td><td class="n ${Math.abs(d)<=15?'ok':'warn'}">${d>0?'+':''}${fmt(d,1)} % <small>${Math.abs(d)<=15?'within ±15 %':'outside ±15 %'}</small></td><td>${m}</td></tr>`); });
  const at = $('#aeroTable tbody');
  [['Wing lift slope, /rad', AERO.wing_CLa_per_rad, AERO.helmbold_CLa_per_rad, 2, 'Helmbold estimate used in the sizing'],
   ['Aircraft lift slope (wing + tail), /rad', AERO.full_CLa_per_rad, null, 2, '—'],
   ['Neutral point, % MAC', AERO.neutral_point_pct_mac, AERO.sizing_neutral_point_pct_mac, 1, 'tail-volume formula'],
   ['Static margin at 28 % CG, % MAC', AERO.static_margin_pct_at_28, C0.geo.SM*100, 1, '—'],
   ['Span efficiency (wing, inviscid)', AERO.wing_span_efficiency_inviscid, AERO.sizing_e, 3, 'sizing uses Oswald e = 0.80 (includes viscous and interference losses)']]
   .forEach(([q,v,e,d,cmt])=>at.insertAdjacentHTML('beforeend',`<tr><td>${q}</td><td class="n">${fmt(v,d)}</td><td class="n">${e===null?'—':fmt(e,d)}</td><td><small>${cmt}</small></td></tr>`));
}

// ---------- sortable ----------
function sortable(){
  $$('th.sort').forEach(th=>{ const btn=document.createElement('button'); btn.type='button'; btn.className='thbtn';
    while(th.firstChild) btn.appendChild(th.firstChild); th.appendChild(btn); th.setAttribute('aria-sort','none');
    const go=()=>{
    const table=th.closest('table'), i=[...th.parentNode.children].indexOf(th), body=table.tBodies[0];
    const rows=[...body.rows].filter(r=>!r.classList.contains('total')), totals=[...body.rows].filter(r=>r.classList.contains('total'));
    const dir = th.getAttribute('aria-sort')==='ascending'?-1:1;
    table.querySelectorAll('th.sort').forEach(x=>x.setAttribute('aria-sort','none'));
    th.setAttribute('aria-sort', dir===1?'ascending':'descending');
    const val = r=>{ const t=r.cells[i]?.textContent.trim()||''; const n=parseFloat(t.replace(/[$,≈+]/g,'')); return isNaN(n)?t.toLowerCase():n; };
    rows.sort((a,b)=>{ const x=val(a), y=val(b); return (x>y?1:x<y?-1:0)*dir; });
    rows.concat(totals).forEach(r=>body.appendChild(r)); };
    btn.addEventListener('click',go); });
}

// ---------- SVG helpers ----------
const NS='http://www.w3.org/2000/svg';
function el(tag, attrs, parent, text){ const e=document.createElementNS(NS,tag); for(const k in attrs) e.setAttribute(k,attrs[k]); if(text!==undefined) e.textContent=text; if(parent) parent.appendChild(e); return e; }
function clear(svg){ while(svg.firstChild) svg.removeChild(svg.firstChild); }
function describe(svg, text){ svg.setAttribute('aria-label', text); }
const sgn = v => (v>0?'+':v<0?'−':'')+fmt(Math.abs(v),2);

// ---------- live chain + sliders ----------
const SL = [
  {k:'Vc', l:'Cruise speed Vc', u:'m/s', min:16, max:26, st:0.5, src:'R11'},
  {k:'Vs', l:'Stall speed Vs', u:'m/s', min:9, max:15, st:0.5, src:'R11'},
  {k:'CLmax', l:'CLmax', u:'', min:0.9, max:1.5, st:0.05, est:1},
  {k:'span', l:'Span b', u:'m', min:2.0, max:3.0, st:0.1, src:'R3'},
  {k:'tCruise', l:'Cruise time', u:'min', min:5, max:30, st:1, scale:60, src:'R10'},
  {k:'tHover', l:'Hover time', u:'s', min:60, max:300, st:10, src:'R10'},
  {k:'reserve', l:'Energy reserve', u:'%', min:10, max:35, st:1, scale:0.01, src:'R10'},
  {k:'CD0_clean', l:'CD0 clean', u:'', min:0.020, max:0.060, st:0.002, est:1},
  {k:'CdA_rotor', l:'Stopped-rotor CdA', u:'m²', min:0.001, max:0.010, st:0.0005, est:1},
  {k:'eSpec', l:'Pack specific energy', u:'Wh/kg', min:150, max:260, st:5, src:'PB §2'},
  {k:'mPayload', l:'Payload allowance', u:'kg', min:0, max:2, st:0.1, src:'R12'},
  {k:'kCtrl', l:'Hover control margin', u:'×', min:1.0, max:1.3, st:0.01, est:1},
];
let chainKey='C0', P={};
function resetParams(){ const c=D.concepts[chainKey].params; P = {...c}; delete P.mBattFixed; delete P.EBattFixed; P.Vpack=22.2; }
function buildSliders(){
  const box=$('#sliders'); box.innerHTML='';
  SL.forEach(s=>{ const raw = P[s.k]/(s.scale||1);
    box.insertAdjacentHTML('beforeend',`<div class="sl"><label for="sl_${s.k}"><span>${s.l} ${s.est?'<span class="est">est</span>':`<small>${s.src}</small>`}</span><output id="o_${s.k}">${fmt(raw, s.st<0.01?4:s.st<1?2:0)} ${s.u}</output></label><input type="range" id="sl_${s.k}" min="${s.min}" max="${s.max}" step="${s.st}" value="${raw}" aria-valuetext="${fmt(raw, s.st<0.01?4:s.st<1?2:0)} ${s.u}"></div>`); });
  box.insertAdjacentHTML('beforeend',`<div class="sl" style="align-self:end"><button type="button" class="themebtn" id="slReset">Reset to review values</button></div>`);
  SL.forEach(s=>$('#sl_'+s.k).addEventListener('input',e=>{ const v=Number(e.target.value); P[s.k]=v*(s.scale||1); const vt=`${fmt(v, s.st<0.01?4:s.st<1?2:0)} ${s.u}`; $('#o_'+s.k).textContent=vt; e.target.setAttribute('aria-valuetext',vt); renderChain(); drawTornado(); announceChain(); }));
  $('#slReset').addEventListener('click',()=>{ resetParams(); buildSliders(); renderChain(); drawTornado(); });
}
let announceT=0;
function announceChain(){ clearTimeout(announceT); announceT=setTimeout(()=>{ const r=VTOLModel.size(P); $('#chainLive').textContent=`MTOW ${fmt(r.m,2)} kg, hover power ${fmt(r.P_hover,0)} W, cruise power ${fmt(r.P_cruise,0)} W, hover thrust-to-weight ${fmt(r.TW,2)}.`; }, 600); }
function renderChain(){
  const r = VTOLModel.size(P), c=$('#chain');
  const box=(l,v,f,cls='')=>`<div class="box"><div class="l">${l}</div><div class="v ${cls}">${v}</div><div class="f">${f}</div></div>`;
  const ar='<span class="arr" aria-hidden="true">→</span>';
  c.innerHTML = [
    box('MTOW (closed)', fmt(r.m,2)+' kg', `F12, ${r.iter} iterations`, r.m<25?'ok-t':'bad-t'),
    box('Thrust per unit', fmt(r.Tunit_g,0)+' g', `F1: m g / ${r.nUnits}`),
    box('FM·η at hover', fmt(r.FMeta,3), 'maker table, interpolated'),
    box('Hover power', fmt(r.P_hover,0)+' W', `F2–F3: n T^1.5/√(2ρA)${P.coax?' × '+P.kCoax:''} × ${P.kCtrl}/FMη`),
    box('Wing area', fmt(r.S,3)+' m²', `F4: 2mg/(ρ Vs² CLmax); AR ${fmt(r.AR,1)}`),
    box('Cruise CL / CD0', fmt(r.CL,3)+' / '+fmt(r.CD0,4), `F5–F6: CD0 + ΣCdA/S = ${fmt(P.CD0_clean,3)} + ${fmt(r.CdA_extra,4)}/S`),
    box('L/D', fmt(r.LD,2), 'F6: CL/(CD0 + CL²/(π e AR))'),
    box('Cruise power', fmt(r.P_cruise,0)+' W', `F7: (W/(L/D)) V/(${P.etaProp}×${P.etaMEc})`),
    box('Mission energy', fmt(r.E_Wh,0)+' Wh', `F8: P_h(${P.tHover}+${P.tTrans}s) + P_c·${P.tCruise/60} min`),
    box('Pack energy', fmt(r.Epack_req_Wh,0)+' Wh', `F9: E/((1−${fmt(P.reserve,2)})×${P.etaBatt})`),
    box('Battery mass', fmt(r.m_batt,2)+' kg', `F10: E_pack / ${P.eSpec} Wh/kg`),
    box('Hover T/W', fmt(r.TW,2), 'n T_max / m g (R13 ≥ 1.6)', r.TW>=1.6?'ok-t':'bad-t'),
  ].join(ar);
}
function drawTornado(){
  const svg=$('#tornado'); if(!svg) return; clear(svg);
  const base = VTOLModel.size(P).m, keys=['Vc','Vs','CLmax','span','tCruise','tHover','reserve','CD0_clean','CdA_rotor','eSpec','mPayload','kCtrl'];
  const res = keys.map(k=>{ const lo=VTOLModel.size({...P,[k]:P[k]*0.8}).m-base, hi=VTOLModel.size({...P,[k]:P[k]*1.2}).m-base; return {k, lo, hi, span:Math.abs(hi-lo)}; }).sort((a,b)=>b.span-a.span);
  const narrow=svg.closest('.svgwrap').clientWidth<560, W=narrow?Math.max(260,svg.closest('.svgwrap').clientWidth):640;
  const x0=narrow?8:190, x1=W-(narrow?8:20), mid=(x0+x1)/2, maxA=Math.max(...res.map(r=>Math.max(Math.abs(r.lo),Math.abs(r.hi))))||1;
  const sx = v=>mid + v/maxA*(x1-mid), rowH=narrow?34:20, top=26;
  svg.setAttribute('viewBox',`0 0 ${W} ${top+res.length*rowH+40}`); svg.classList.toggle('fitw', narrow);
  el('text',{x:mid,y:14,'text-anchor':'middle'},svg,`Δ MTOW, kg (base ${fmt(base,2)} kg)`);
  [-maxA,-maxA/2,0,maxA/2,maxA].forEach((t,k)=>{ el('line',{x1:sx(t),x2:sx(t),y1:top-4,y2:top+res.length*rowH,class:t?'grid':'axis'},svg); el('text',{x:sx(t),y:top+res.length*rowH+14,'text-anchor':k===0?'start':k===4?'end':'middle'},svg,(t>0?'+':'')+fmt(t,2)); });
  const lab = Object.fromEntries(SL.map(s=>[s.k,s.l]));
  res.forEach((r,i)=>{ const y=top+i*rowH, by=narrow?y+15:y+3;
    if(narrow) el('text',{x:x0,y:y+11},svg,lab[r.k]); else el('text',{x:x0-8,y:y+13,'text-anchor':'end'},svg,lab[r.k]);
    el('rect',{x:Math.min(sx(r.lo),mid),y:by,width:Math.abs(sx(r.lo)-mid),height:13,fill:css('--c1'),'fill-opacity':0.35,stroke:css('--c1'),'stroke-width':1,rx:2},svg);
    el('rect',{x:Math.min(sx(r.hi),mid),y:by,width:Math.abs(sx(r.hi)-mid),height:13,fill:css('--c1'),rx:2},svg); });
  el('rect',{x:x0,y:top+res.length*rowH+20,width:10,height:10,fill:css('--c1'),'fill-opacity':0.35,stroke:css('--c1')},svg); el('text',{x:x0+14,y:top+res.length*rowH+29},svg,'input −20 %');
  el('rect',{x:x0+100,y:top+res.length*rowH+20,width:10,height:10,fill:css('--c1')},svg); el('text',{x:x0+114,y:top+res.length*rowH+29},svg,'input +20 %');
  describe(svg, `Tornado chart: change in MTOW from a base of ${fmt(base,2)} kg when each input moves ±20 %, largest first. `+res.map(r=>`${lab[r.k]}: ${sgn(r.lo)} kg at −20 %, ${sgn(r.hi)} kg at +20 %`).join('; ')+'.');
}
function drawPack(){
  // two single-axis panels on shared pack columns: cruise minutes (the R10 question) on top, MTOW below
  const svg=$('#packChart'); if(!svg) return; clear(svg);
  const data=D.sweepC0, W=640, l=56, r=20, t=26, ph=120, gap=46, lab=44, H=t+ph+gap+ph+lab;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const xs = i=> l + (i+0.5)*(W-l-r)/data.length, bw=(W-l-r)/data.length*0.5;
  const cMax=Math.ceil(Math.max(...data.map(d=>d.cruise_min))/5)*5+5;
  const yc = v=> t+ph*(1-v/cMax);
  el('text',{x:l,y:t-10,class:'phead'},svg,'Cruise available, min');
  for(let v=0; v<=cMax; v+=5){ el('line',{x1:l,x2:W-r,y1:yc(v),y2:yc(v),class:'grid'},svg); el('text',{x:l-6,y:yc(v)+4,'text-anchor':'end'},svg,v); }
  el('line',{x1:l,x2:W-r,y1:yc(10),y2:yc(10),stroke:css('--bad'),'stroke-dasharray':'5 4'},svg); el('line',{x1:W-r-250,x2:W-r-226,y1:t-14,y2:t-14,stroke:css('--bad'),'stroke-dasharray':'5 4'},svg); el('text',{x:W-r-220,y:t-10},svg,'R10 minimum, 10 min');
  const mg=D.cruiseMarginMin; el('line',{x1:l,x2:W-r,y1:yc(mg),y2:yc(mg),stroke:css('--ok'),'stroke-dasharray':'2 3'},svg); el('line',{x1:W-r-104,x2:W-r-80,y1:t-14,y2:t-14,stroke:css('--ok'),'stroke-dasharray':'2 3'},svg); el('text',{x:W-r-74,y:t-10},svg,`margin ${fmt(mg,1)} min`);
  data.forEach((d,i)=>{ el('rect',{x:xs(i)-bw/2,y:yc(d.cruise_min),width:bw,height:yc(0)-yc(d.cruise_min),fill:css(i===0?'--accent':'--c2'),rx:2},svg);
    el('text',{x:xs(i),y:yc(d.cruise_min)-5,'text-anchor':'middle'},svg,fmt(d.cruise_min,1)); });
  const y0=t+ph+gap, ms=data.map(d=>d.m), mMin=Math.floor((Math.min(...ms)-0.1)*2)/2, mMax=Math.ceil((Math.max(...ms)+0.1)*2)/2;
  const ym = v=> y0+ph*(1-(v-mMin)/(mMax-mMin));
  el('text',{x:l,y:y0-10,class:'phead'},svg,'Take-off mass, kg');
  for(let v=mMin; v<=mMax+1e-9; v+=0.5){ el('line',{x1:l,x2:W-r,y1:ym(v),y2:ym(v),class:'grid'},svg); el('text',{x:l-6,y:ym(v)+4,'text-anchor':'end'},svg,fmt(v,1)); }
  let pth=''; data.forEach((d,i)=>pth+=(i?'L':'M')+xs(i)+' '+ym(d.m)); el('path',{d:pth,fill:'none',stroke:css('--c3'),'stroke-width':2},svg);
  data.forEach((d,i)=>{ el('circle',{cx:xs(i),cy:ym(d.m),r:4,fill:css(i===0?'--accent':'--c3'),stroke:css('--surface'),'stroke-width':2},svg); el('text',{x:xs(i),y:ym(d.m)-9,'text-anchor':'middle'},svg,fmt(d.m,2)); });
  if(mMax>=8){ el('line',{x1:l,x2:W-r,y1:ym(8),y2:ym(8),stroke:css('--warn'),'stroke-dasharray':'2 3'},svg); el('text',{x:W-r-4,y:ym(8)-4,'text-anchor':'end',fill:css('--warn')},svg,'R2: 8 kg target floor'); }
  data.forEach((d,i)=>{ const nm=d.pack.replace(' flight pack','').replace('WREKD ','').replace(/\s*\(2-pack\)/,' ×2').replace(/\b6S\s+/,''); const k=nm.search(/\d{4,5}/); const l1=(k>0?nm.slice(0,k):nm).trim(), l2=k>0?nm.slice(k).trim():'';
    el('text',{x:xs(i),y:y0+ph+18,'text-anchor':'middle'},svg,l1); if(l2) el('text',{x:xs(i),y:y0+ph+32,'text-anchor':'middle'},svg,l2); });
  describe(svg, 'Battery packs on C0, cruise minutes available (R10 needs 10 min; design margin '+fmt(D.cruiseMarginMin,1)+' min) and take-off mass. '+data.map(d=>`${d.pack}: ${fmt(d.cruise_min,1)} min, ${fmt(d.m,2)} kg`).join('; ')+'. The chosen pack is highlighted.');
}
function drawCap(){
  const svg=$('#capChart'); if(!svg) return; clear(svg);
  // phones: drawn at the container width so the reserve and the cap line stay on screen
  const narrow=svg.closest('.svgwrap').clientWidth<560, W=narrow?Math.max(260,svg.closest('.svgwrap').clientWidth):640;
  const b=C0.bom, l=narrow?4:20, r=narrow?4:20, y0=40, h=46, total=2000, x=v=>l+(W-l-r)*v/total; svg.classList.toggle('fitw', narrow);
  const cols=['--c1','--c2','--c3','--c4','--c5','--c6','--c1','--c2'];
  const parts = CATS.map((cn,i)=>({n:cn, v:cat(b,cn), col:cols[i], op:i>=6?0.55:0.9}));
  parts.push({n:'Tax', v:b.tax, col:'--fg-3', op:0.7}, {n:'Shipping (est.)', v:b.shipping, col:'--line-2', op:0.9});
  let acc=0;
  parts.forEach(p=>{ el('rect',{x:x(acc),y:y0,width:Math.max(0.5,x(acc+p.v)-x(acc)),height:h,fill:css(p.col),opacity:p.op},svg);
    if(x(acc+p.v)-x(acc)>34) el('text',{x:(x(acc)+x(acc+p.v))/2,y:y0+h+14,'text-anchor':'middle',fill:css('--fg-2')},svg,fmtUSD(p.v)); acc+=p.v; });
  el('rect',{x:x(acc),y:y0,width:Math.max(0,x(total)-x(acc)),height:h,fill:'none',stroke:css('--ok'),'stroke-dasharray':'5 4'},svg);
  if(total>acc){ const inside=x(total)-x(acc)>100; el('text',inside?{x:(x(acc)+x(total))/2,y:y0+h/2+4,'text-anchor':'middle',fill:css('--ok'),'font-weight':'700'}:{x:x(total),y:y0+h+30,'text-anchor':'end',fill:css('--ok'),'font-weight':'700'},svg,'reserve '+fmtUSD(total-acc)); }
  el('line',{x1:x(total),x2:x(total),y1:y0-14,y2:y0+h+10,stroke:css('--bad'),'stroke-width':2},svg);
  el('text',{x:x(total),y:y0-18,'text-anchor':'end',fill:css('--bad')},svg,'$2,000 cap');
  el('text',{x:l,y:y0-18},svg,'committed '+fmtUSD(acc));
  let lx=l, ly=y0+h+(narrow?56:40);
  parts.forEach(p=>{ const w=16+p.n.length*6.2+16; if(lx+w>W-r){ lx=l; ly+=18; }
    el('rect',{x:lx,y:ly-9,width:10,height:10,fill:css(p.col),opacity:p.op},svg); el('text',{x:lx+14,y:ly},svg,p.n); lx+=w; });
  svg.setAttribute('viewBox', `0 0 ${W} ${ly+14}`);
  describe(svg, `C0 committed spend ${fmtUSD(acc)} against the $2,000 cap, leaving ${fmtUSD(total-acc)} reserve. `+parts.map(p=>`${p.n} ${fmtUSD(p.v)}`).join('; ')+'.');
}

function drawDuty(){
  const svg=$('#dutyChart'); if(!svg) return; clear(svg);
  const Ph=s0.P_hover, Pc=s0.P_cruise, ph=[['hover',60,Ph],['trans',20,Ph],['cruise',600,Pc],['trans',20,Ph],['hover',60,Ph]];
  const T=ph.reduce((a,p)=>a+p[1],0), W=640,H=240,l=56,r=16,t=16,b=40, pmax=1000;
  const x=s=>l+(W-l-r)*s/T, y=p=>t+(H-t-b)*(1-p/pmax);
  for(let p=0;p<=pmax;p+=250){ el('line',{x1:l,x2:W-r,y1:y(p),y2:y(p),class:'grid'},svg); el('text',{x:l-6,y:y(p)+4,'text-anchor':'end'},svg,p+' W'); }
  let s=0, d=`M${x(0)} ${y(0)}`; ph.forEach(([n,dt,p])=>{ d+=`L${x(s)} ${y(p)}L${x(s+dt)} ${y(p)}`; s+=dt; }); d+=`L${x(T)} ${y(0)}Z`;
  el('path',{d,fill:css('--c1'),opacity:0.18,stroke:css('--c1'),'stroke-width':2},svg);
  s=0; ph.forEach(([n,dt,p])=>{ el('text',{x:x(s+dt/2),y:y(p)-6,'text-anchor':'middle'},svg,n==='cruise'?`cruise ${fmt(p,0)} W × 10 min`:n==='hover'?`${fmt(p,0)} W`:''); s+=dt; });
  [0,120,240,360,480,600,760].forEach((v,k,arr)=>el('text',{x:x(v),y:H-b+16,'text-anchor':k===arr.length-1?'end':k===0?'start':'middle'},svg,Math.round(v/60)+' min'));
  el('text',{x:W-r,y:H-6,'text-anchor':'end'},svg,`mission ${fmt(s0.E_Wh,0)} Wh of ${fmt(s0.Epack_Wh,0)} Wh pack`);
  describe(svg, `Electrical power through one mission: hover ${fmt(Ph,0)} W for 60 s, transition at ${fmt(Ph,0)} W for 20 s, cruise ${fmt(Pc,0)} W for 10 min, transition 20 s, hover 60 s. Mission energy ${fmt(s0.E_Wh,0)} Wh of a ${fmt(s0.Epack_Wh,0)} Wh pack.`);
}
function drawCG(){
  const svg=$('#cgChart'); if(!svg) return; clear(svg);
  const cg=C0.cg, g=C0.geo, W=640,l=30,r=30, x=p=>l+(W-l-r)*p/60, yb=70;
  for(let p=0;p<=60;p+=10){ el('line',{x1:x(p),x2:x(p),y1:30,y2:120,class:'grid'},svg); el('text',{x:x(p),y:140,'text-anchor':'middle'},svg,p+' %'); }
  el('rect',{x:x(0),y:yb-6,width:x(60)-x(0),height:12,fill:css('--surface-2'),stroke:css('--line-2')},svg);
  el('rect',{x:x(Math.min(cg.pctFwd,cg.pct.noPayload)),y:yb-14,width:x(Math.max(cg.pctAft,cg.pct.noPayload))-x(Math.min(cg.pctFwd,cg.pct.noPayload)),height:28,fill:css('--ok'),opacity:0.35,rx:2},svg);
  el('text',{x:x((cg.pctFwd+cg.pct.noPayload)/2),y:yb+30,'text-anchor':'middle'},svg,`CG envelope ${fmt(cg.pctFwd,1)}–${fmt(cg.pct.noPayload,1)} %`);
  const mark=(p,lab,col,dy)=>{ el('line',{x1:x(p),x2:x(p),y1:yb-24,y2:yb+14,stroke:css(col),'stroke-width':2.5},svg); el('text',{x:x(p),y:yb-28+dy,'text-anchor':'middle',fill:css(col)},svg,lab); };
  mark(cg.pct.target,'CG target / thrust centroid 28 %','--accent',-6);
  mark(g.hn*100,`NP ${fmt(g.hn*100,1)} %`,'--bad',0);
  describe(svg, `C0 CG envelope from ${fmt(cg.pctFwd,1)} % to ${fmt(cg.pct.noPayload,1)} % MAC, against a CG target and thrust centroid of 28 % and a neutral point of ${fmt(g.hn*100,1)} % MAC.`);
}
function drawState(){
  const svg=$('#stateSvg'); if(!svg) return; clear(svg);
  const defs=el('defs',{},svg), mk=el('marker',{id:'arr',viewBox:'0 0 10 10',refX:'9',refY:'5',markerWidth:'7',markerHeight:'7',orient:'auto-start-reverse'},defs);
  el('path',{d:'M0 0L10 5L0 10z',fill:css('--fg-2')},mk);
  const N={ DIS:[70,60,110,'Disarmed'], QH:[235,60,150,'QHOVER / QLOITER'], TR:[425,60,120,'Transition'], FW:[610,60,130,'Fixed-wing cruise'],
            QL:[235,200,120,'QLAND'], BT:[425,200,150,'Back-transition'], AS:[610,200,130,'Q_ASSIST'] };
  const E=(x1,y1,x2,y2,lab,lx,ly,anchor='middle')=>{ el('line',{x1,y1,x2,y2,stroke:css('--fg-2'),'stroke-width':1.5,'marker-end':'url(#arr)'},svg); if(lab) el('text',{x:lx,y:ly,'text-anchor':anchor},svg,lab); };
  const R=k=>N[k][0]+N[k][2]/2, L=k=>N[k][0]-N[k][2]/2;
  E(R('DIS'),60,L('QH'),60,'arm',(R('DIS')+L('QH'))/2,34);
  E(R('QH'),60,L('TR'),60,'≥ 30 m AGL',(R('QH')+L('TR'))/2,34);
  E(R('TR'),60,L('FW'),60,'≥ 16 m/s',(R('TR')+L('FW'))/2,34);
  E(595,77,595,183,'< 13 m/s',588,110,'end');
  E(625,183,625,77,'recovered',632,134,'start');
  E(555,77,470,183,'Q mode',500,140,'end');
  E(L('BT'),200,R('QL'),200,'speed ≈ 0',(L('BT')+R('QL'))/2,176);
  E(190,183,100,77,'landed → disarm',135,140,'end');
  Object.entries(N).forEach(([k,[x,y,w,lab]])=>{
    el('rect',{x:x-w/2,y:y-17,width:w,height:34,rx:2,fill:css(k==='FW'?'--accent-soft':k==='QL'?'--warn-soft':'--surface-2'),stroke:css(k==='FW'?'--accent':'--line-2')},svg);
    el('text',{x,y:y+4,'text-anchor':'middle','font-weight':'600',fill:css('--fg')},svg,lab); });
  const fy=258; el('rect',{x:20,y:fy,width:660,height:58,rx:2,fill:'none',stroke:css('--line-2'),'stroke-dasharray':'4 3'},svg);
  el('text',{x:32,y:fy+18,'font-weight':'600',fill:css('--fg')},svg,'From any flying mode (failsafes)');
  el('text',{x:32,y:fy+36},svg,'Transition longer than 15 s (Q_TRANS_FAIL) → QRTL · RC link loss → RTL, then QLAND (R20)');
  el('text',{x:32,y:fy+52},svg,'Low battery → RTL, critical → QLAND · Geofence breach at 110 m AGL → RTL · Pilot can select QHOVER at any time');
  describe(svg, 'QuadPlane flight modes for C0. Disarmed to QHOVER or QLOITER on arm. QHOVER to Transition at 30 m AGL or higher. Transition to fixed-wing cruise at 16 m/s or more. Fixed-wing cruise to Q_ASSIST below 13 m/s, and back to cruise once recovered. Cruise to Back-transition on selecting a Q mode. Back-transition to QLAND at about zero airspeed. QLAND to Disarmed when landed. Failsafes from any flying mode: transition longer than 15 s (Q_TRANS_FAIL) goes to QRTL; RC link loss in fixed-wing modes goes to RTL then a vertical landing, and in hover modes to QLAND; low battery goes to RTL, critical battery to QLAND; geofence breach at 110 m AGL goes to RTL; the pilot can select QHOVER at any time.');
}
function drawGantt(){
  const svg=$('#gantt'); if(!svg) return; clear(svg);
  const d0=Date.UTC(2026,9,13), d1=Date.UTC(2027,4,7), W=700, l=210, r=14, t=28;
  const x=d=>l+(W-l-r)*(d-d0)/(d1-d0), D_=(y,m,d)=>Date.UTC(y,m-1,d);
  const rows=[
    ['Design basis sign-off',D_(2026,10,13),D_(2026,10,27),'c1'],
    ['Site / legal path decision',D_(2026,10,13),D_(2026,11,6),'bad'],
    ['Order A: test parts + packs + charger',D_(2026,11,2),D_(2026,11,9),'c3'],
    ['Thrust stand T1–T5',D_(2026,11,16),D_(2026,12,4),'c2'],
    ['CAD + design freeze',D_(2026,11,2),D_(2026,12,4),'c1'],
    ['Order B: airframe, propulsion, avionics',D_(2026,12,7),D_(2026,12,14),'c3'],
    ['ArduPilot SITL rehearsal (§'+secNo('controls')+')',D_(2027,1,11),D_(2027,2,19),'c5'],
    ['Airframe build',D_(2027,1,4),D_(2027,2,19),'c1'],
    ['Proof load, drop test, CG',D_(2027,2,19),D_(2027,2,26),'c2'],
    ['Avionics integration + bench',D_(2027,2,22),D_(2027,3,12),'c5'],
    ['Flight request ≥ 7 business days',D_(2027,3,3),D_(2027,3,12),'warn'],
    ['Hover tests',D_(2027,3,13),D_(2027,3,31),'c4'],
    ['Transition tests',D_(2027,4,3),D_(2027,4,17),'c4'],
    ['Full mission (R9/R10)',D_(2027,4,17),D_(2027,4,18),'ok'],
    ['Buffer: repair / weather / re-fly',D_(2027,4,18),D_(2027,4,30),'c6'],
  ];
  const rh=24; svg.setAttribute('viewBox',`0 0 ${W} ${t+rows.length*rh+30}`);
  for(let m=0;m<8;m++){ const dd=Date.UTC(2026,9+m,1); if(dd<d0) continue; el('line',{x1:x(dd),x2:x(dd),y1:t-6,y2:t+rows.length*rh,class:'grid'},svg);
    el('text',{x:x(dd)+3,y:t-10},svg,new Date(dd).toLocaleString('en-US',{month:'short',timeZone:'UTC'})+(m===3?' 27':'')); }
  rows.forEach(([n,a,b,c],i)=>{ const y=t+i*rh; el('text',{x:l-8,y:y+15,'text-anchor':'end'},svg,n);
    el('rect',{x:x(a),y:y+4,width:Math.max(4,x(b)-x(a)),height:15,rx:2,fill:css('--'+c),opacity:0.85},svg); });
  const dl=D_(2027,4,30); el('line',{x1:x(dl),x2:x(dl),y1:t-6,y2:t+rows.length*rh,stroke:css('--bad'),'stroke-width':2},svg);
  el('text',{x:x(dl)-4,y:t+rows.length*rh+16,'text-anchor':'end',fill:css('--bad')},svg,'deadline 2027-04-30');
  const iso=d=>new Date(d).toISOString().slice(0,10);
  describe(svg, 'Schedule to the 2027-04-30 deadline. '+rows.map(([n,a,b])=>`${n}: ${iso(a)}${b-a>86400000?' to '+iso(b):''}`).join('; ')+'.');
}

// ---------- viewer ----------
// ---------- SOLIDWORKS model viewer ----------
let CV=null;
const THREE_SRC=['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js','https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'];
const THREE_SRI=['sha384-CI3ELBVUz9XQO+97x6nwMDPosPR5XvsxW2ua7N1Xeygeh1IxtgqtCkGfQY9WWdHu','sha384-wagZhIFgY4hD+7awjQjR4e2E294y6J2HSnd8eTNc15ZubTeQeVRZwhQJ+W6hnBsf'];
const loadScript = src => new Promise((ok,fail)=>{ const s=document.createElement('script'); s.src=src; const k=THREE_SRC.indexOf(src); if(k>=0){ s.integrity=THREE_SRI[k]; s.crossOrigin='anonymous'; } s.onload=ok; s.onerror=fail; document.head.appendChild(s); });
function initCad(){ if(CV!==null) { CV && CV.refresh && CV.refresh(); return; }
  CV='loading';
  const view=$('#cadView'); view.classList.add('loading');
  (window.THREE && THREE.OrbitControls ? Promise.resolve() : loadScript(THREE_SRC[0]).then(()=>loadScript(THREE_SRC[1])))
    .catch(()=>{}).then(()=>{ view.classList.remove('loading'); startCad(); }); }
function startCad(){
  const view=$('#cadView'), parts=$('.cadparts');
  if(!MESH) MESH = JSON.parse(document.getElementById('meshData').textContent);
  try{ CV = CadViewer(view, MESH) || false; }catch(e){ CV = false; const fb=view.querySelector('.fallback'); if(fb){ fb.hidden=false; fb.querySelector('p').textContent='The 3D model could not start: this browser or device did not provide WebGL. The drawings in §'+secNo('model3d')+'.1 show the same model.'; } view.querySelector('canvas').hidden=true; }
  view.classList.toggle('offline', !CV); parts.hidden = !CV;
  if(!CV){ const r=$('#cadRetry'); if(!r.dataset.bound){ r.dataset.bound=1; r.addEventListener('click',()=>{ CV=null; view.querySelector('.fallback').hidden=true; $('#cadCanvas').hidden=false; initCad(); }); } return; }
  touchGate($('#cadView'));
  const base=n=>n.split('~')[0], counts={}; MESH.comps.forEach(c=>{ const k=base(c[0]); counts[k]=(counts[k]||0)+1; });
  const FAST=/^[FNWI]\d\d_/, names=[...new Set(Object.keys(MESH.parts).map(base))].sort();
  const list=$('#cadParts'), flist=document.createElement('ul'); flist.id='cadFasteners';
  list.insertAdjacentElement('afterend', flist); list.insertAdjacentHTML('afterend', '<p class="meta grp">Fasteners and inserts</p>');
  names.forEach(n=>{ const li=document.createElement('li'), b=document.createElement('button'), key=Object.keys(MESH.parts).find(k=>base(k)===n);
    b.type='button'; b.textContent=n.replace(/^([FNWI]\d\d)_/,'$1 ').replace(/_/g,' ')+(counts[n]>1?' ×'+counts[n]:''); b.title=MESH.parts[key].d;
    const on=()=>CV.highlight(n), off=()=>CV.highlight(null);
    b.addEventListener('focus',on); b.addEventListener('mouseenter',on); b.addEventListener('blur',off); b.addEventListener('mouseleave',off); b.addEventListener('click',on);
    li.appendChild(b); (FAST.test(n)?flist:list).appendChild(li); });
  $$('#cadView [data-cview]').forEach(b=>b.addEventListener('click',()=>CV.view(b.dataset.cview)));
  $('#cadXray').addEventListener('click',e=>e.currentTarget.setAttribute('aria-pressed',CV.toggleXray()));
  $('#cadExplode').addEventListener('click',e=>e.currentTarget.setAttribute('aria-pressed',CV.toggleExplode()));
  $('#cadEdges').addEventListener('click',e=>e.currentTarget.setAttribute('aria-pressed',CV.toggleEdges())); }

// touch screens: a viewer canvas takes gestures only after a tap, so swipes over it scroll the page
function touchGate(view){
  if(!view || !window.matchMedia || !matchMedia('(pointer: coarse)').matches || view.querySelector('.gate')) return;
  const c=view.querySelector('canvas'), g=document.createElement('button');
  g.type='button'; g.className='gate'; g.innerHTML='<span>Tap to rotate the model</span>'; view.appendChild(g);
  const size=()=>{ g.style.height=c.offsetHeight+'px'; }; size(); if(window.ResizeObserver) new ResizeObserver(size).observe(c);
  const arm=on=>{ view.classList.toggle('armed',on); g.hidden=on; };
  g.addEventListener('click',()=>{ arm(true); c.setAttribute('tabindex','-1'); c.focus({preventScroll:true}); });
  document.addEventListener('pointerdown',e=>{ if(view.classList.contains('armed') && !view.contains(e.target)) arm(false); });
  if(window.IntersectionObserver) new IntersectionObserver(es=>es.forEach(en=>{ if(!en.isIntersecting) arm(false); })).observe(view);
}

const CHARTS = {tradeChart:()=>drawTrade(), dragChart:()=>drawDrag(), polarChart:()=>drawPolar(), tornado:()=>drawTornado(), packChart:()=>drawPack(), capChart:()=>drawCap(), dutyChart:()=>drawDuty(), cgChart:()=>drawCG(), stateSvg:()=>drawState(), gantt:()=>drawGantt()};
// charts in a hidden chapter measure zero width, so only the visible chapter's charts are drawn; print draws all
// a chart in a hidden tab is skipped here and draws when its tab opens
function redrawIn(sec){ for(const id in CHARTS){ const e=document.getElementById(id); if(e && (!sec || sec.contains(e)) && !e.closest('[hidden]')) CHARTS[id](); } if(CV && CV.refresh && (!sec || sec.contains($('#cadView')))) CV.refresh(); FlowViz.redraw(); if(!sec || sec.contains($('#thermViz'))) ThermViz.redraw(); }
function redrawAll(){ redrawIn(null); }
function lazyCad(){ const v=$('#cadView'); if(!v) return;
  if(!('IntersectionObserver' in window)){ initCad(); return; }
  const io=new IntersectionObserver(es=>{ if(es.some(x=>x.isIntersecting)){ io.disconnect(); initCad(); } }, {rootMargin:'600px 0px'}); io.observe(v); }
// summary first: decision facts and long tables sit behind disclosures; requirement status as a grid
function summarise(){
  $$('.decision').forEach(d=>{ const q=d.querySelector('b.q'), rec=d.querySelector('.rec'); if(!q||!rec) return;
    const rest=[...d.children].filter(c=>c!==q && c!==rec); if(!rest.length) return;
    const det=document.createElement('details'); det.className='more facts'; det.innerHTML=`<summary>Facts and sources<span class="sr-only">: ${q.textContent.slice(0,80)}</span></summary>`;
    rest.forEach(c=>det.appendChild(c)); d.appendChild(det); });
  const rq=$('#reqTable');
  if(rq){ const rows=[...rq.tBodies[0].rows], count={met:0,risk:0,fail:0,open:0};
    const grid=document.createElement('div'); grid.className='reqgrid';
    const ord={fail:0,risk:1,open:2,met:3}, stOf=r=>{ const c=r.cells[2].querySelector('.chip'); return c?[...c.classList].find(x=>x in ord):'open'; };
    rows.slice().sort((p,q)=>ord[stOf(p)]-ord[stOf(q)]).forEach(r=>{ const chip=r.cells[2].querySelector('.chip'); const st=chip?[...chip.classList].find(c=>c in count):'open'; if(st) count[st]++;
      grid.insertAdjacentHTML('beforeend', `<div class="rq ${st}"><span class="rid">${r.cells[0].textContent}</span><span class="rtx">${r.cells[1].textContent}</span>${chip?chip.outerHTML:''}</div>`); });
    const sum=document.createElement('p'); sum.className='reqsum';
    sum.innerHTML=`<b>${count.met}</b> met · <b>${count.risk}</b> at risk · <b>${count.open}</b> open${count.fail?` · <b>${count.fail}</b> failed`:''} of ${rows.length} requirements`;
    const wrap=rq.closest('.tbl'); wrap.before(sum, grid); }
  $$('.tbl').forEach(t=>{ if(t.closest('details')||t.closest('.doccontrol')||t.classList.contains('nofold')) return; const tb=t.querySelector('tbody'); const n=tb?tb.rows.length:0; if(n<=10) return;
    const det=document.createElement('details'); det.className='more tablefold';
    const h=t.closest('section.sec')&&[...t.closest('section.sec').querySelectorAll('h3')].filter(x=>x.compareDocumentPosition(t)&Node.DOCUMENT_POSITION_FOLLOWING).pop();
    const what=h?h.textContent.replace(/^\s*\d+\.\d+\s*/,''):'the table';
    det.innerHTML=`<summary>${t.querySelector('#reqTable')?`Show all ${n} requirements as a table`:`Show all ${n} rows: ${what}`}</summary>`;
    t.before(det); det.appendChild(t); });
}

// ---------- fasteners and fits (cad/hardware.json) ----------
function hardware(){
  const f=HW.fasteners||[], n=k=>(HW[k]||[]).reduce((s,x)=>s+(x.qty||0),0);
  const fit=f.filter(x=>x.length_mm!=null), sup=f.filter(x=>x.length_mm==null), screws=fit.reduce((s,x)=>s+(x.qty||0),0), bySize={}; fit.forEach(x=>{ const m=String(x.thread).split('x')[0]; bySize[m]=(bySize[m]||0)+(x.qty||0); });
  set('hwSummary', `The aircraft uses ${screws} screws in ${fit.length} types${sup.length?`, plus ${sup.reduce((s,x)=>s+(x.qty||0),0)} prop screws that come with the motors`:''} (${Object.entries(bySize).map(([k,v])=>v+' × '+k).join(', ')}), ${n('inserts')} heat-set inserts, ${n('nuts')} nuts and ${n('washers')} washers, nearly all A2 stainless M3 socket heads into brass inserts. Each has a clearance or insert hole, a torque and a threadlocker rule; threadlocker goes only on metal-to-metal threads, because it attacks printed plastic.`);
  const tb=$('#hwTable tbody'); if(tb) f.forEach(x=>tb.insertAdjacentHTML('beforeend', `<tr><td>${x.id}</td><td>${String(x.thread).replace(/x[0-9.]+$/,'')} × ${x.length_mm??'—'}</td><td>${x.standard}</td><td class="n">${x.qty??'—'}</td><td class="n">${x.torque_Nm!=null?fmt(x.torque_Nm,2):'—'}</td><td>${(x.joints||[]).join('; ')}</td></tr>`));
  const ft=$('#fitTable tbody'); if(ft) (HW.fits||[]).forEach(x=>ft.insertAdjacentHTML('beforeend', `<tr><td>${x.id}</td><td>${x.joint}</td><td class="n">${x.min_clearance_mm!=null?fmt(x.min_clearance_mm,3):'—'}</td><td class="n">${x.max_clearance_mm!=null?fmt(x.max_clearance_mm,3):'—'}</td></tr>`));
}

// ---------- design iterations (analysis/tradestudy.json) ----------
const TV = TRADE.variants, TCRIT = TRADE.criteria;
const tClass = v => !v.feasible ? 'out' : v.meetsR1 ? 'r1' : 'nor1';
const tTotal = v => (TRADE.ranking.all.find(x=>x.id===v.id)||{}).total;
const tLabel = v => v.id==='C0' ? 'C0 baseline (4-lift twin boom)' : String(v.label||v.id).split(/\s+[\u2014\u2013]\s+|:\s|\s\(/)[0].trim();
function tradeText(){
  const ranked = TRADE.ranking.all.map(r=>({...r, v:TV.find(v=>v.id===r.id)}));
  const r1 = ranked.filter(r=>r.feasible&&r.meetsR1), top = ranked.filter(r=>r.feasible)[0];
  const out = ranked.filter(r=>!r.feasible).length, c0 = ranked.find(r=>r.id==='C0');
  const best = r1[0];
  const el_ = $('#tradeVerdict'); if(!el_) return;
  el_.innerHTML = `<b>Of ${TV.length} configurations sized and priced the same way, the C0 family is the best that keeps the lift rotors stopped in cruise (R1).</b> `
    + `The baseline C0 scores ${fmt(c0.total,2)} of 10. ` + r1.filter(r=>r.total>c0.total && r.id.startsWith('C0-')).slice(0,3).map(r=>{
        const why = /lean/.test(r.id) ? 'saves money by dropping parts the design keeps, such as the airspeed sensor used for transitions'
          : /^C0-b/.test(r.id) ? 'gains cruise time from a longer wing, but puts each wing half at or near the 1.5 m car limit (R4) and lowers the spar reserve factor'
          : /^C0-pk/.test(r.id) ? 'carries a bigger pack, which leaves less than the $100 crash reserve (R7)' : 'differs only in detail';
        return `${tLabel(r.v)} (${fmt(r.total,2)}) ${why}`; }).join('; ').replace(/^./,c=>c.toUpperCase()) + (r1.some(r=>r.total>c0.total) ? '. The baseline keeps the margins those variants spend. ' : '')
    + (top && !top.meetsR1 ? `A ${tLabel(top.v).toLowerCase()} scores higher (${fmt(top.total,2)}) because it drops the pusher, booms, tail and gear, but it breaks R1, needs about 30° of tilt to hold an 8 m/s gust in hover, and cannot survive a motor failure. ` : '')
    + (()=>{ const o=ranked.filter(r=>!r.feasible), cap=o.filter(r=>(r.v.flags||[]).some(f=>/^R6/.test(f))).length, FAM={'Lift+cruise 8-lift':'the 8-lift','Lift+cruise coaxial X8':'the coaxial X8','Tiltrotor':'the tilt-rotors','Tilt-wing':'the tilt-wing','Box / joined wing':'the box wing','Tandem wing':'the tandem wing','C0 variant':'C0 with folding props'};
      const fams=[...new Set(o.filter(r=>!/pack sweep/i.test(r.v.family||'')).map(r=>FAM[r.v.family]||String(r.v.family||'').toLowerCase()))], packs=o.filter(r=>/pack sweep/i.test(r.v.family||'')).length;
      const list=fams.length>1?fams.slice(0,-1).join(', ')+' and '+fams[fams.length-1]:fams.join('');
      return `${out} variants are ranked out, ${cap} of them for exceeding the $2,000 cap: ${list}${packs?`, and ${packs} of the larger packs`:''}.`; })();
  const sens = TRADE.sensitivity, changed = sens.cases.filter(c=>c.winnerFeasibleR1!==sens.baseWinnerFeasibleR1).length, allC0 = sens.cases.every(c=>String(c.winnerFeasibleR1).startsWith('C0'));
  set('tradeSens', `Sensitivity: each weight moved ±30 % in turn (${sens.cases.length} cases). The top R1-compliant variant ${changed? 'swapped in '+changed+' cases' : 'never changed'}${allC0? ', and it was a C0 variant in every case' : ''}.`);
  const tb = $('#tradeCriteria tbody'); if(tb) TCRIT.forEach(c=>tb.insertAdjacentHTML('beforeend', `<tr><td>${c.name}</td><td class="n">${fmt(c.weight*100,0)} %</td><td>${c.anchor||'—'}</td></tr>`));
  const tt = $('#tradeTable tbody'); if(tt) ranked.forEach(r=>{ const m=r.v.metrics||{};
    const st = !r.feasible ? `<span class="chip fail">ranked out</span> ${(r.v.flags||[]).join('; ')}` : r.meetsR1 ? '<span class="chip met">meets R1</span>' : '<span class="chip risk">breaks R1</span>';
    tt.insertAdjacentHTML('beforeend', `<tr><td>${tLabel(r.v)}</td><td class="n">${fmt(r.total,2)}</td><td class="n">${m.MTOW_kg!=null?fmt(m.MTOW_kg,2):'—'}</td><td class="n">${m.cruise_avail_min!=null?fmt(m.cruise_avail_min,1):'—'}</td><td class="n">${m.reserve_usd!=null?fmt(m.reserve_usd,0):'—'}</td><td>${st}</td></tr>`); });
}
function drawTrade(){
  const svg=$('#tradeChart'); if(!svg) return; clear(svg);
  const all = TRADE.ranking.all.map(r=>({...r, v:TV.find(v=>v.id===r.id)}));
  // three blocks, each ranked: what can be built as specified, what breaks R1, what is ranked out
  const groups=[['r1','Meets every requirement','Meets every requirement'],['nor1','Feasible, but breaks R1 (rotors stopped in cruise)','Breaks R1'],['out','Ranked out: over the cap or short of a requirement','Ranked out']]
    .map(([c,n,short])=>({c,n,short,rows:all.filter(r=>tClass(r.v)===c).sort((p,q)=>q.total-p.total)})).filter(g=>g.rows.length);
  const narrow = svg.closest('.svgwrap').clientWidth < 560;
  const W=narrow?Math.max(260,svg.closest('.svgwrap').clientWidth):640, l=narrow?8:236, r=narrow?44:46, t=16, rh=narrow?36:22, gh=30, n=all.length, H=t+n*rh+groups.length*gh+28, x=v=>l+(W-l-r)*v/10;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.classList.toggle('fitw', narrow);
  for(let v=0; v<=10; v+=2){ el('line',{x1:x(v),x2:x(v),y1:t,y2:H-26,class:'grid'},svg); el('text',{x:x(v),y:H-10,'text-anchor':'middle'},svg,v); }
  let y=t;
  groups.forEach(g=>{
    el('rect',{x:8,y:y+gh-18,width:12,height:12,rx:2,class:'tb '+g.c},svg);
    el('text',{x:26,y:y+gh-8,class:'ghead'},svg,`${narrow?g.short:g.n} · ${g.rows.length}`); y+=gh;
    g.rows.forEach(row=>{ const gg=el('g',{class:'trow'},svg);
      el('title',{},gg,`${tLabel(row.v)}: ${fmt(row.total,2)} of 10${row.feasible?'':' — '+(row.v.flags||[]).join('; ')}`);
      if(narrow){ el('text',{x:l,y:y+13,class:row.id==='C0'?'lab sel':'lab'},gg,(t=>t.length>42?t.slice(0,41).replace(/\s+\S*$/,'')+'…':t)(tLabel(row.v))); el('rect',{x:l,y:y+18,width:Math.max(1,x(row.total)-l),height:12,rx:2,class:'tb '+g.c},gg); el('text',{x:x(row.total)+6,y:y+29},gg,fmt(row.total,2)); }
      else { el('text',{x:l-10,y:y+rh/2+4,'text-anchor':'end',class:row.id==='C0'?'lab sel':'lab'},gg,tLabel(row.v).slice(0,40));
      el('rect',{x:l,y:y+4,width:Math.max(1,x(row.total)-l),height:rh-8,rx:2,class:'tb '+g.c},gg);
      el('text',{x:x(row.total)+6,y:y+rh/2+4},gg,fmt(row.total,2)); }
      if(row.id==='C0' && !narrow) el('rect',{x:l-6,y:y+4,width:3,height:rh-8,fill:css('--accent')},gg);
      y+=rh; }); });
  describe(svg, 'Weighted scores out of 10. '+groups.map(g=>g.n+': '+g.rows.map(r=>`${tLabel(r.v)} ${fmt(r.total,2)}`).join('; ')).join('. ')+'.');
}

// ---------- aerodynamics (analysis/aero/aero_results.json) ----------
const AD = AEROD;
function aeroText(){
  const mis=AD.mission||{}, dr=AD.drag||{}, np=AD.neutral_point||{}, sm=np.static_margin_pct||{}, st=AD.stall||{};
  const faired = mis.faired_gear || null, round = mis.round_legs || null;
  const tDesign = mis.t_cruise_avail_min, tAlt = (faired||round||{}).t_cruise_avail_min;
  const v=$('#aeroVerdict'); if(v) v.innerHTML =
    (dr.gear_round_case
      ? `<b>The aerodynamic package (XFOIL, NeuralFoil, AVL, a component drag build-up and 2-D RANS CFD) found that bare round landing legs would add ${fmt(100*(dr.gear_round_case.CdA_legs_round-dr.gear_round_case.CdA_legs_faired)/AD.geometry.S_ref_m2/(dr.CD0_total||1),0)} % to the zero-lift drag, so the legs now carry printed teardrop fairings.</b> `
      : `<b>The aerodynamic package (XFOIL, NeuralFoil, AVL, a component drag build-up and 2-D RANS CFD) found the sizing's drag too low: bare round landing legs alone were ${fmt(100*(dr.by_group&&dr.by_group.gear||0)/(dr.CD0_total||1),0)} % of zero-lift drag.</b> `)
    + (faired ? `With round legs the aircraft has ${fmt(tDesign,1)} min of cruise, short of R10's 10 min; teardrop leg fairings, now part of the design, raise that to ${fmt(faired.t_cruise_avail_min,1)} min. ` : round ? `With the teardrop leg fairings now in the design the build-up gives ${fmt(tDesign,1)} min of cruise, against the ${fmt(s0.t_cruise_avail_min,1)} min the sizing uses as the design value (R10 needs 10); with bare round legs it would be ${fmt(round.t_cruise_avail_min,1)}. ` : '')
    + (Math.abs(B.CLmax-AD.CL_max_3D.adopted)<5e-4
      ? `The wing is sized on the trimmed CL_max of the aerodynamic package, ${fmt(AD.CL_max_3D.adopted,3)}, to a design stall of ${fmt(AD.stall.V_stall_mps,2)} m/s, ${AD.stall.V_stall_mps>12+1e-9?'over':fmt(AD.stall.margin_to_R11_pct,1)+' % under'} R11's 12 m/s, which covers a ${fmt(100*(1-Math.pow(AD.stall.V_stall_mps/12,2)),0)} % shortfall in CL_max. `
      : `The wing is sized on a CL_max of ${fmt(B.CLmax,3)}; the trimmed analysis of the resized wing gives ${fmt(AD.CL_max_3D.adopted,3)}, which puts stall at ${fmt(AD.stall.V_stall_mps,2)} m/s, ${AD.stall.V_stall_mps>12+1e-9?'just over':'within'} R11's 12 m/s. `)
    + `With the pod included, the neutral point sits at ${fmt(np.AVL_pod_pct_MAC,1)} % MAC: ${fmt(sm.CG_28pct,1)} % static margin at the design CG and ${fmt(sm.CG_no_payload,1)} % with an empty payload bay, so the bay carries ballast when flown empty.`;
  const k=$('#aeroKpis'); if(k){ const rows=[
      ['CL_max, section (adopted)', fmt(AD.CL_max_2D.adopted_2D,2), 'XFOIL '+fmt(AD.CL_max_2D.xfoil_stall_Re,2)+', NeuralFoil '+fmt(AD.CL_max_2D.neuralfoil_stall_Re,2)+', wind tunnel 1.30'],
      ['CL_max, aircraft trimmed', fmt(AD.CL_max_3D.adopted,2), 'critical-section method on the AVL span loading'],
      ['Stall speed at MTOW', fmt(st.V_stall_mps,2)+' m/s', 'R11 needs ≤ 12 m/s'],
      ['Zero-lift drag CD0', fmt(dr.CD0_total,4), 'component build-up'],
      ['Cruise L/D at 20 m/s', fmt(dr.cruise&&dr.cruise.LD,2), 'max '+fmt(dr.cruise&&dr.cruise.LD_max,1)+' at '+fmt(dr.cruise&&dr.cruise.V_at_LDmax_mps,1)+' m/s'],
      ['Cruise electrical power', fmt(mis.P_cruise_W,0)+' W', 'cross-check; the design value is the sizing\'s '+fmt(s0.P_cruise,0)+' W, the more cautious'],
      ['Neutral point, with pod', fmt(np.AVL_pod_pct_MAC,1)+' % MAC', 'AVL; '+fmt(np.pod_shift_pct_MAC,1)+' % MAC from the pod'],
      ['Trim at cruise', 'α '+fmt(AD.trim_cruise.alpha_deg,1)+'°, elevator '+fmt(AD.trim_cruise.elevator_deg,1)+'°', 'AVL'] ];
    k.innerHTML = rows.map(([l,v,s])=>`<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join(''); }
  const cf=AD.cfd, note=$('#cfdNote');
  // a CFD value counts only if it is physical for this section (|CL| < 2.5, CD > 0); diverged runs read "—"
  const phys=(cl,cd)=>cl!=null&&cd!=null&&isFinite(cl)&&isFinite(cd)&&Math.abs(cl)<2.5&&cd>0;
  if(note){ const ok = cf && cf!=='—' && cf.mesh_study;
    if(ok){ const m10=cf.mesh_study.alpha_10, m2=cf.mesh_study.alpha_2;
      const good=(m,L)=>m&&phys(m.CL[L],m.CD[L]), dl=m=>good(m,'L1')&&good(m,'L3')?100*Math.abs(m.CL.L3-m.CL.L1)/Math.abs(m.CL.L3):null;
      const d10=dl(m10), d2=dl(m2), x10=(AD.comparison_2D||[]).find(r=>r.alpha_deg===10), x2=(AD.comparison_2D||[]).find(r=>r.alpha_deg===2);
      const conv=Object.values(cf.timings||{}).filter(t=>t.converged).length, tot=Object.keys(cf.timings||{}).length;
      note.innerHTML = `SU2 incompressible RANS on the NACA 2415 section at Re ${fmt((cf.Re||0)/1e5,2)}×10⁵, the cruise condition, with the Spalart–Allmaras turbulence model on three gmsh meshes (first cell at y⁺ below 1). `
        + (d10!=null?`From the coarse to the fine mesh, lift at 10° changes ${fmt(d10,1)} %${d2!=null?` and at 2° ${fmt(d2,1)} %`:''}, so the fine mesh is the reference. `:'')
        + (good(m10,'L3')&&x10?`On it, CL is ${fmt(m10.CL.L3,3)} at 10° against XFOIL's ${fmt(x10.xfoil_CL,3)}${good(m2,'L3')&&x2?`, and ${fmt(m2.CL.L3,3)} at 2° against ${fmt(x2.xfoil_CL,3)}`:''}: within about 10 %, with RANS lower because it treats the boundary layer as turbulent from the leading edge, where the real flow at this Reynolds number stays laminar over much of the chord. `:'')
        + `The medium mesh and the transition-model runs did not converge reliably with these numerics (${conv} of ${tot} runs settled), so their values are left out (—). The section CL_max used in the design therefore rests on XFOIL, NeuralFoil and wind-tunnel data, with the fine-mesh CFD as a cross-check.`;
      const mt=$('#meshTable tbody'), ms=m10;
      if(mt && ms) ['L1','L2','L3'].forEach((L,i)=>{ const g=good(ms,L); mt.insertAdjacentHTML('beforeend', `<tr><td>${['Coarse','Medium','Fine'][i]} (${L})</td><td class="n">${ms.cells&&ms.cells[L]?Math.round(ms.cells[L]/1000)+'k':'—'}</td><td class="n">${g?fmt(ms.CL[L],3):'—'}</td><td class="n">${g?fmt(ms.CD[L],4):'—'}</td></tr>`); });
      const tb=$('#cfdTable tbody'), f=(v,d)=>v!=null?fmt(v,d):'—';
      if(tb) (AD.comparison_2D||[]).forEach(r=>{ const sa=phys(r.su2_SA_CL,r.su2_SA_CD)&&r.su2_SA_conv, sst=phys(r.su2_SSTLM_CL,r.su2_SSTLM_CD)&&r.su2_SSTLM_conv;
        tb.insertAdjacentHTML('beforeend', `<tr><td class="n">${r.alpha_deg}°</td><td class="n">${f(r.xfoil_CL,3)}</td><td class="n">${sa?f(r.su2_SA_CL,3):'—'}</td><td class="n">${sst?f(r.su2_SSTLM_CL,3):'—'}</td><td class="n">${f(r.xfoil_CD,4)}</td><td class="n">${sa?f(r.su2_SA_CD,4):'—'}</td><td class="n">${sst?f(r.su2_SSTLM_CD,4):'—'}</td></tr>`); }); }
    else { note.textContent='CFD results are not in this build (—).'; ['#meshTable','#cfdTable'].forEach(id=>{ const t=$(id); if(t) (t.closest('details')||t.closest('.tbl')).hidden=true; }); } }
  const sn=$('#stabNote'); if(sn) sn.textContent = `Pitch: Cm_α ${fmt(AD.stability_derivatives_AVL_trim.Cma,2)} per radian, stable. Directional: Cn_β ${fmt(AD.stability_derivatives_AVL_trim.Cnb,4)}, stable. Dihedral effect: Cl_β ${fmt(AD.stability_derivatives_AVL_trim.Clb,4)}, weakly stable with a flat wing. The horizontal-tail volume is ${fmt(AD.tail_volumes.V_h,2)}, under the 0.50 typical of light aircraft, which is why the pod's shift matters.`;
  const sd=AD.stability_derivatives_AVL_trim, meaning={CLa:'lift-curve slope, per rad',Cma:'pitch stiffness (negative = stable)',Cmq:'pitch damping',CYb:'side force with sideslip',Clb:'roll with sideslip (negative = stable)',Cnb:'yaw with sideslip (positive = stable)',Clp:'roll damping',Cnr:'yaw damping',Clr:'roll due to yaw rate',Cnp:'yaw due to roll rate'};
  const stb=$('#aeroStabTable tbody'); if(stb) Object.keys(meaning).forEach(kk=>{ if(sd[kk]!=null) stb.insertAdjacentHTML('beforeend', `<tr><td>${kk.replace(/^C(.)(.*)$/,'C<sub>$1$2</sub>')}</td><td class="n">${fmt(sd[kk],4)}</td><td>${meaning[kk]}</td></tr>`); });
}
const DRAG_NAMES = {wing:'Wing',tail:'Tail and fins',pod:'Pod and canopy',booms:'Booms and clamps',rotors:'Stopped lift rotors',gear:'Landing legs and feet',misc:'Leakage, hinges, pitot'};
function drawDrag(){
  const svg=$('#dragChart'); if(!svg) return; clear(svg);
  const g=(AD.drag&&AD.drag.by_group)||{}, tot=AD.drag.CD0_total, rows=Object.keys(DRAG_NAMES).filter(k=>g[k]!=null).map(k=>({k, n:DRAG_NAMES[k], v:g[k]})).sort((p,q)=>q.v-p.v);
  const narrow = svg.closest('.svgwrap').clientWidth < 560;
  const W=narrow?Math.max(260,svg.closest('.svgwrap').clientWidth):640, l=narrow?8:170, r=narrow?110:90, t=14, rh=narrow?44:34, H=t+rows.length*rh+26, mx=Math.max(...rows.map(x=>x.v)), x=v=>l+(W-l-r)*v/mx;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.classList.toggle('fitw', narrow);
  rows.forEach((row,i)=>{ const y=t+i*rh;
    if(narrow){ el('text',{x:l,y:y+14},svg,row.n); el('rect',{x:l,y:y+20,width:Math.max(1,x(row.v)-l),height:14,rx:2,fill:css(row.k==='gear'||row.k==='rotors'?'--c3':'--c1')},svg); el('text',{x:x(row.v)+6,y:y+32},svg,`${fmt(100*row.v/tot,0)} %`); }
    else { el('text',{x:l-10,y:y+rh/2+4,'text-anchor':'end'},svg,row.n);
    el('rect',{x:l,y:y+7,width:Math.max(1,x(row.v)-l),height:rh-14,rx:2,fill:css(row.k==='gear'||row.k==='rotors'?'--c3':'--c1')},svg);
    el('text',{x:x(row.v)+6,y:y+rh/2+4},svg,`${fmt(100*row.v/tot,0)} % · ${fmt(row.v,4)}`); } });
  el('text',{x:l,y:H-6},svg,`Total CD0 ${fmt(tot,4)} on the ${fmt(AD.geometry.S_ref_m2,3)} m² wing`);
  describe(svg, 'Zero-lift drag by group: '+rows.map(x=>`${x.n} ${fmt(100*x.v/tot,0)} percent`).join('; ')+'.');
}
function drawPolar(){
  const svg=$('#polarChart'); if(!svg) return; clear(svg);
  const sp=AD.section_polars.n2415_cruise_ncrit9, xf=(sp.table||[]).map(r=>[r[0],r[1]]);
  const nfc=(AD.neuralfoil||[]).find(c=>c.name==='n2415_cruise_ncrit9'); const nf=nfc?nfc.alpha.map((al,i)=>[al,nfc.CL[i]]):[];
  const physOK=r=>r&&isFinite(r.CL)&&isFinite(r.CD)&&Math.abs(r.CL)<2.5&&r.CD>0;
  const msF=(AD.cfd&&AD.cfd.mesh_study)||{}, su2=[...((AD.cfd&&AD.cfd.polar_L2_SA)||[]).filter(r=>r.converged&&physOK(r)).map(r=>[r.alpha_deg,r.CL]), ...[['alpha_2',2],['alpha_10',10]].filter(([k])=>msF[k]&&physOK({CL:msF[k].CL.L3,CD:msF[k].CD.L3})).map(([k,al])=>[al,msF[k].CL.L3])];
  const W=640,H=320,l=52,r=20,t=30,b=40, a0=-6,a1=20, c0=-0.6,c1=1.6;
  const x=v=>l+(W-l-r)*(v-a0)/(a1-a0), y=v=>t+(H-t-b)*(1-(v-c0)/(c1-c0));
  for(let v=-0.4; v<=1.6+1e-9; v+=0.4){ el('line',{x1:l,x2:W-r,y1:y(v),y2:y(v),class:'grid'},svg); el('text',{x:l-6,y:y(v)+4,'text-anchor':'end'},svg,fmt(v,1)); }
  for(let v=-5; v<=20; v+=5){ el('text',{x:x(v),y:H-b+16,'text-anchor':'middle'},svg,v+'°'); }
  el('text',{x:(l+W-r)/2,y:H-6,'text-anchor':'middle'},svg,'angle of attack');
  el('text',{x:14,y:t+110,transform:`rotate(-90 14 ${t+110})`,'text-anchor':'middle'},svg,'section CL');
  const line=(pts,col,dash)=>{ const p=pts.filter(q=>q[0]>=a0&&q[0]<=a1).map((q,i)=>(i?'L':'M')+x(q[0]).toFixed(1)+' '+y(q[1]).toFixed(1)).join(''); if(p) el('path',{d:p,fill:'none',stroke:css(col),'stroke-width':2,'stroke-dasharray':dash||''},svg); };
  line(xf,'--c1'); line(nf,'--c2','6 4');
  su2.forEach(q=>el('circle',{cx:x(q[0]),cy:y(q[1]),r:5,fill:css('--c4'),stroke:css('--surface'),'stroke-width':2},svg));
  el('line',{x1:x(12)-10,x2:x(12)+10,y1:y(1.30),y2:y(1.30),stroke:css('--fg'),'stroke-width':2},svg); el('line',{x1:x(12),x2:x(12),y1:y(1.30)-10,y2:y(1.30)+10,stroke:css('--fg'),'stroke-width':2},svg);
  el('line',{x1:l,x2:W-r,y1:y(AD.CL_max_3D.adopted),y2:y(AD.CL_max_3D.adopted),stroke:css('--warn'),'stroke-dasharray':'2 3'},svg);
  el('text',{x:W-r-4,y:y(AD.CL_max_3D.adopted)+14,'text-anchor':'end',fill:css('--warn')},svg,'aircraft CL_max '+fmt(AD.CL_max_3D.adopted,2));
  const key=[['--c1','XFOIL',''],['--c2','NeuralFoil','6 4']]; let kx=l+4;
  key.forEach(([c,n,d])=>{ el('line',{x1:kx,x2:kx+22,y1:t-14,y2:t-14,stroke:css(c),'stroke-width':2,'stroke-dasharray':d},svg); el('text',{x:kx+28,y:t-10},svg,n); kx+=n.length*7+48; });
  if(su2.length){ el('circle',{cx:kx+5,cy:t-14,r:5,fill:css('--c4')},svg); el('text',{x:kx+14,y:t-10},svg,'SU2 RANS'); kx+=90; }
  el('text',{x:kx,y:t-10},svg,'+ wind tunnel, Re 2×10⁵');
  describe(svg, `NACA 2415 section lift curve at Re ${Math.round(sp.Re/1000)} thousand. XFOIL CL max ${fmt(sp.CL_max,2)} at ${sp.alpha_CLmax_deg} degrees; NeuralFoil ${fmt(sp.neuralfoil_CL_max,2)}; wind tunnel 1.30 at 12 degrees; aircraft trimmed CL max ${fmt(AD.CL_max_3D.adopted,2)}.${su2.length?' SU2 points: '+su2.map(q=>fmt(q[1],2)+' at '+q[0]+' degrees').join(', ')+'.':''}`);
}

// ---------- build and test summaries (docs/build, docs/test) ----------
function buildText(){
  const v=$('#buildVerdict'); if(v) v.innerHTML = `<b>The build is written down to the screw: ${BUILD.wps.length} work packages, ${BUILD.steps} numbered steps, about ${BUILD.total} person-hours of labour and ${BUILD.machine} hours of printer and oven time.</b> Every step lists its parts, fasteners with torque, tools, a measurable check and a time estimate. The printer is the critical path, so printing starts the week Order B arrives. A drill press, soldering station, torque driver and filament dryer are assumed from a campus makerspace; each has a zero-cost fallback in the manual except the soldering station.`;
  $$('.printHours').forEach(e=>e.textContent=BUILD.machine||'—');
  const tb=$('#wpTable tbody'); if(tb) BUILD.wps.forEach(w=>tb.insertAdjacentHTML('beforeend', `<tr><td class="n">${w.wp}</td><td>${w.title}</td><td class="n">${fmt(w.labour,0)}</td><td>${w.machine&&w.machine!=='—'?w.machine+' h':'—'}</td></tr>`));
}
const SERIES = {C:'Components and coupons: inserts, tube fit, thrust stand, battery, servos, wiring', S:'Structure: wing proof load, boom stiffness and tap test, drop test, mount pull', E:'Electrical and avionics bench: power-up, ESCs, failsafes, telemetry, vibration', G:'Ground: tethered hover, weight and balance, pusher run, assembly time', F:'Flight: hover build-up, transition, cruise performance, failsafes, full mission', I:'Inspection: documents, compliance, configuration'};
function testText(){
  const n={}; TESTS.forEach(t=>{ n[t.Series]=(n[t.Series]||0)+1; });
  const reqs=new Set(); TESTS.forEach(t=>String(t.Requirements||'').split(/[,;\s]+/).forEach(x=>{ if(/^R\d+$/.test(x)) reqs.add(x); }));
  const v=$('#testVerdict'); if(v) v.innerHTML = `<b>${TESTS.length} tests take the aircraft from incoming parts to the full mission, and every requirement from R1 to R20 has at least one (${reqs.size} covered).</b> Each test states its prediction from the analysis, a numeric pass mark and its prerequisites. ${n.F||0} flight-test cards carry the weather limits, build-up points and abort criteria. R14 (hover motor-out) and R16 (8 m/s gusts) close by analysis and a limited demonstration only.`;
  const tb=$('#testSeries tbody'); if(tb) Object.keys(SERIES).forEach(k=>{ if(n[k]) tb.insertAdjacentHTML('beforeend', `<tr><td>${k}</td><td class="n">${n[k]}</td><td>${SERIES[k]}</td></tr>`); });
}

// ---------- measurements: IDs scoped to their chapter (M5.1), plus one list in the overview ----------
function measurements(){
  const list=$('#measureList'); let total=0;
  $$('section.sec').forEach(s=>{ const n=s.dataset.n;
    s.querySelectorAll('.measure li').forEach((li,k)=>{ const id=li.querySelector('.id'); if(!id) return; const old=id.textContent.trim(); id.textContent='M'+n+'.'+(k+1); li.dataset.old=old; total++;
      if(list){ const b=li.querySelector('b'); list.insertAdjacentHTML('beforeend', `<li><span class="mid">${id.textContent}</span> <a href="#${s.id}">${b?b.textContent.replace(/\.$/,''):'—'}</a> <span class="mch">${s.dataset.title}</span></li>`); } }); });
  // "§5 M3" in running text becomes a single "M5.3"
  $$('a.xref').forEach(x=>{ const nx=x.nextSibling; if(!nx||nx.nodeType!==3) return; const mm=nx.textContent.match(/^\s+M(\d+)/); if(!mm) return;
    x.textContent='M'+x.textContent.replace('§','')+'.'+mm[1]; nx.textContent=nx.textContent.replace(/^\s+M\d+/,''); });
  set('measureSum', `${total} measurements are still open. Each sits in the chapter it affects, with how to make it and what result would change the design; the list below gathers them in one place.`);
}
// scroll regions and tables get names, so keyboard and screen-reader users can reach and identify them
function a11yNames(scope){
  (scope ? [scope] : $$('section.sec')).forEach(s=>{ s.querySelectorAll('.tbl, .svgwrap').forEach(w=>{
    const h=[...s.querySelectorAll('h3, .sechead h2')].filter(x=>x.compareDocumentPosition(w)&Node.DOCUMENT_POSITION_FOLLOWING).pop();
    const cap=w.closest('figure')&&w.closest('figure').querySelector('figcaption');
    const name=(cap?cap.textContent:(h?h.textContent:s.dataset.title)).trim();
    if(w.scrollWidth>w.clientWidth+1){ w.setAttribute('role','region'); w.setAttribute('tabindex','0'); w.setAttribute('aria-label', name); }
    const t=w.querySelector('table'); if(t && !t.querySelector('caption') && !t.getAttribute('aria-label')) t.setAttribute('aria-label', name); }); });
}

// charts redraw at the container width (the bar charts change layout at phone width)
let rzT=0; window.addEventListener('resize', ()=>{ clearTimeout(rzT); rzT=setTimeout(()=>redrawIn(curSec), 150); });

// printing: shell.js enters report view (every page, disclosures open, paper palette) and calls onShow(null)

// ---------- shop files: inside the claude.ai viewer, plain download links do nothing ----------
// so links marked data-dl are fetched and offered through the downloads capability (the viewer confirms each save);
// in the standalone copy, or a viewer without the capability, they stay ordinary links
(async()=>{ const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; if(!dl) return;
  document.addEventListener('click', async e=>{ const link=e.target.closest('a[data-dl]'); if(!link) return; e.preventDefault();
    try{ const res=await fetch(link.getAttribute('href')); if(!res.ok) throw new Error('fetch '+res.status); await dl.save({filename:link.dataset.dl, data:await res.blob()}); }
    catch(err){ if(err && err.code==='declined') return; link.removeAttribute('data-dl'); } }); })();

let curSec=null;


// ---------- boot ----------
numberHeadings(); buildNav(); xrefs(); fill(); derived(); tables(); hardware(); tradeText(); aeroText(); buildText(); testText(); drawings(); numberFigures(); sortable(); summarise(); measurements(); a11yNames();
set('cadTris', MESH_META.tris.toLocaleString('en-US')); set('cadComps', MESH_META.comps); set('escHoverA', fmt(s0.I_hover/4,1));
$$('[data-cad="parts"]').forEach(e=>e.textContent=MESH_META.files); $$('[data-cad="comps"]').forEach(e=>e.textContent=MESH_META.comps);
$$('main a[href^="#"]').forEach(a=>{ const t=a.textContent.trim(); if(!/^§\s?\d+$/.test(t)) return; const sec=document.getElementById(a.getAttribute('href').slice(1)); const s=sec&&(sec.closest('section.sec')); if(s) a.setAttribute('aria-label', `${t} ${s.dataset.title}`); });
resetParams(); buildSliders(); renderChain();
$$('#chainConcept button').forEach(b=>b.addEventListener('click',()=>{ chainKey=b.dataset.c; $$('#chainConcept button').forEach(x=>x.setAttribute('aria-pressed',x===b)); resetParams(); buildSliders(); renderChain(); drawTornado(); }));
Shell.init({ onShow: sec=>{ curSec=sec; redrawIn(sec); a11yNames(sec||undefined); } }); lazyCad(); FlowViz.lazy();
})();
