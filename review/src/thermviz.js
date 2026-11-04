// ---------- heat dissipation: SOLIDWORKS Simulation thermal fields as rotatable thermal-camera views, mission history, findings ----------
// Data: analysis/thermal/thermal_results.json (cad/Thermal.cs + analysis/thermal/thermal_report.py), embedded by build.mjs as an inert JSON block.
const ThermViz = (()=>{
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  let D=null, cv, ctx, W=0, H=0, dpr=1, cam={yaw:-0.7, pitch:0.45}, drag=null, cur=null, started=false, T={};
  const CASES = [
    {key:'lift_unit/hover_90s', label:'Lift unit, 90 s hover', note:'bench test C08 holds hover thrust 90 s'},
    {key:'lift_unit/end_hover5', label:'Lift unit, end of mission', note:'hover, transition, 600 s cruise, transition, hover'},
    {key:'lift_unit/steady_hover', label:'Lift unit, steady bound', note:'continuous hover; never reached in flight'},
    {key:'pod/end_hover5', label:'Pod, end of mission', note:'battery and flight controller in the foam bays, cut at the centreline', img:'analysis/thermal/img/pod_mission_end.png'},
    {key:'pusher/end_cruise', label:'Pusher, after cruise', note:'600 s cruise at 20 m/s', img:'analysis/thermal/img/pusher_cruise.png'}];
  // inferno-like ramp (thermal camera): black → purple → orange → pale yellow
  const STOPS=[[0,[0,0,4]],[0.25,[87,16,110]],[0.5,[188,55,84]],[0.75,[249,142,9]],[1,[252,255,164]]];
  const ramp = t => { t=Math.max(0,Math.min(1,t)); for(let i=1;i<STOPS.length;i++){ const [t1,c1]=STOPS[i], [t0,c0]=STOPS[i-1]; if(t<=t1){ const k=(t-t0)/(t1-t0); return c0.map((v,j)=>v+(c1[j]-v)*k); } } return STOPS[STOPS.length-1][1]; };
  const rgbS = (c,s=1) => `rgb(${Math.round(c[0]*s)},${Math.round(c[1]*s)},${Math.round(c[2]*s)})`;
  const tok = () => { const cs=getComputedStyle(document.documentElement), g=n=>cs.getPropertyValue(n).trim(); T={bg:'#2a2f36',   // fixed thermal-camera field in both themes; lifted off black so ambient (black) parts still read
     fg:g('--fg'), fg2:g('--fg-2'), fg3:g('--fg-3'), line:g('--line-2'), font:g('--f-body'), mono:g('--f-mono'), c:[g('--c1'),g('--c2'),g('--c3'),g('--c4'),g('--c5'),g('--c6')], bad:g('--bad')}; };
  const field = key => { const [a,b]=key.split('/'); return D.fields[a] && D.fields[a][b]; };

  function prep(f){ if(f._p) return f._p; const v=f.vertices, n=v.length/3; let cx=0,cy=0,cz=0; for(let i=0;i<n;i++){ cx+=v[i*3]; cy+=v[i*3+1]; cz+=v[i*3+2]; } cx/=n; cy/=n; cz/=n;
    let r=0; for(let i=0;i<n;i++) r=Math.max(r, Math.hypot(v[i*3]-cx, v[i*3+1]-cy, v[i*3+2]-cz));
    let tmin=Infinity,tmax=-Infinity,imax=0; f.temps_C.forEach((t,i)=>{ if(t<tmin) tmin=t; if(t>tmax){ tmax=t; imax=i; } });
    // frame on the warm parts (more than 15 % of the range above ambient) so small hot items are not lost in a large shell
    const cut=tmin+0.15*(tmax-tmin); let hx=0,hy=0,hz=0,hn=0; f.temps_C.forEach((t,i)=>{ if(t>cut){ hx+=v[i*3]; hy+=v[i*3+1]; hz+=v[i*3+2]; hn++; } });
    let hr=0; if(hn){ hx/=hn; hy/=hn; hz/=hn; f.temps_C.forEach((t,i)=>{ if(t>cut) hr=Math.max(hr, Math.hypot(v[i*3]-hx, v[i*3+1]-hy, v[i*3+2]-hz)); }); }
    return f._p={cx,cy,cz,r,tmin,tmax,imax, hot: hn ? {cx:hx, cy:hy, cz:hz, r:hr*1.5} : null}; }
  function draw(){
    if(!ctx || !cur) return; const f=field(cur.key); if(!f) return; const P=prep(f), v=f.vertices, tr=f.tris, tc=f.temps_C;
    ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
    const F = cur.section && P.hot ? P.hot : P;   // section views frame the warm parts
    const cy=Math.cos(cam.yaw), sy=Math.sin(cam.yaw), cp=Math.cos(cam.pitch), sp=Math.sin(cam.pitch), sc=Math.min(W*0.78,H*1.15)/(2.2*F.r), ox=W*0.44, oy=H*0.52;
    const n=v.length/3, X=new Float32Array(n), Y=new Float32Array(n), Z=new Float32Array(n);
    for(let i=0;i<n;i++){ const x=v[i*3]-F.cx, y=v[i*3+1]-F.cy, z=v[i*3+2]-F.cz; const xr=cy*x+sy*z, zr=-sy*x+cy*z; const yr=cp*y-sp*zr, d=sp*y+cp*zr; X[i]=ox+xr*sc; Y[i]=oy-yr*sc; Z[i]=d; }
    // section views drop the near half (study z > centre) so the bays inside the pod show, as in the static render
    const cut = cur.section ? k=>((v[tr[k*3]*3+2]+v[tr[k*3+1]*3+2]+v[tr[k*3+2]*3+2])/3 > P.cz) : null;
    const order=[]; for(let k=0;k<tr.length/3;k++) if(!cut || !cut(k)) order.push(k);
    const depth=k=>Z[tr[k*3]]+Z[tr[k*3+1]]+Z[tr[k*3+2]]; order.sort((a,b)=>depth(a)-depth(b));
    const span=Math.max(1e-6,P.tmax-P.tmin);
    for(const k of order){ const a=tr[k*3], b=tr[k*3+1], c=tr[k*3+2];
      // screen-space normal for a soft shade, so the form reads without changing the temperature colour much
      const nx=(Y[b]-Y[a])*(Z[c]-Z[a])-(Z[b]-Z[a])*(Y[c]-Y[a]), ny=(Z[b]-Z[a])*(X[c]-X[a])-(X[b]-X[a])*(Z[c]-Z[a]), nz=(X[b]-X[a])*(Y[c]-Y[a])-(Y[b]-Y[a])*(X[c]-X[a]);
      const shade=0.72+0.28*Math.abs(nz)/(Math.hypot(nx,ny,nz)||1);
      const col=ramp(((tc[a]+tc[b]+tc[c])/3-P.tmin)/span);
      ctx.beginPath(); ctx.moveTo(X[a],Y[a]); ctx.lineTo(X[b],Y[b]); ctx.lineTo(X[c],Y[c]); ctx.closePath(); ctx.fillStyle=ctx.strokeStyle=rgbS(col,shade); ctx.fill(); ctx.lineWidth=0.6; ctx.stroke(); }
    // hot spot
    const hx=X[P.imax], hy=Y[P.imax]; ctx.strokeStyle='#ffffff'; ctx.lineWidth=1.5*dpr; ctx.beginPath(); ctx.moveTo(hx-9*dpr,hy); ctx.lineTo(hx+9*dpr,hy); ctx.moveTo(hx,hy-9*dpr); ctx.lineTo(hx,hy+9*dpr); ctx.stroke();
    ctx.font=`600 ${13*dpr}px ${T.font}`; ctx.textBaseline='middle'; const lab=`max ${P.tmax.toFixed(0)} °C`, lw=ctx.measureText(lab).width+12*dpr, lx=Math.min(W-lw-90*dpr, hx+12*dpr), ly=Math.max(14*dpr, hy-16*dpr);
    ctx.fillStyle='rgba(14,17,22,.82)'; ctx.fillRect(lx,ly-11*dpr,lw,22*dpr); ctx.fillStyle='#ffffff'; ctx.fillText(lab, lx+6*dpr, ly);
    // scale bar
    const bx=W-46*dpr, by=22*dpr, bh=H-60*dpr, bw=14*dpr; for(let i=0;i<bh;i++){ ctx.fillStyle=rgbS(ramp(1-i/bh)); ctx.fillRect(bx,by+i,bw,1.5); }
    ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=1; ctx.strokeRect(bx,by,bw,bh);
    ctx.font=`${11.5*dpr}px ${T.mono}`; ctx.fillStyle='#e6eaf0'; ctx.textAlign='right';
    const ticks=5; for(let i=0;i<=ticks;i++){ const t=P.tmin+span*(i/ticks), y=by+bh-bh*(i/ticks); ctx.fillText(t.toFixed(0), bx-5*dpr, y); }
    ctx.textAlign='left'; ctx.fillText('°C', bx, by+bh+14*dpr);
    ctx.fillStyle='rgba(230,234,240,.8)'; ctx.font=`${12*dpr}px ${T.font}`; ctx.fillText(`${cur.label} · ${D.ambient_C.hot} °C ambient · drag to turn`, 12*dpr, 16*dpr);
  }
  function size(){ if(!cv) return; const r=cv.getBoundingClientRect(); dpr=Math.min(2,devicePixelRatio||1); W=Math.max(1,Math.round(r.width*dpr)); H=Math.max(1,Math.round(r.height*dpr)); cv.width=W; cv.height=H; draw(); }
  function pick(i){ cur=CASES[i]; const im=$('#thImg'); if(im){ im.hidden=!cur.img; if(cur.img){ im.src=cur.img; im.alt='Thermal render: '+cur.label+' (SOLIDWORKS Simulation field, rendered by analysis/thermal/thermal_report.py)'; } } cv.hidden=!!cur.img; if(cur.cam){ cam.yaw=cur.cam.yaw; cam.pitch=cur.cam.pitch; } else { cam.yaw=-0.7; cam.pitch=0.45; } $$('#thCases button').forEach((b,k)=>b.setAttribute('aria-pressed',String(k===i)));
    const f=field(cur.key), P=f&&prep(f); $('#thNote').textContent = P ? `${cur.note}. Peak ${P.tmax.toFixed(1)} °C at the marked node; colour scale ${P.tmin.toFixed(0)}–${P.tmax.toFixed(0)} °C for this case.` : '—';
    cv.setAttribute('aria-label', `Thermal field: ${cur.label}, peak ${P?P.tmax.toFixed(0):'—'} °C`); draw(); }

  // mission temperature history against the limits (SVG, theme tokens)
  function history(){ const svg=$('#thHist'); if(!svg) return; const H0=D.histories.lift_unit_mission, P0=D.histories.pod_mission, U0=D.histories.pusher_cruise; if(!H0) return;
    const series=[['Lift motor can',H0.Motor,0],['Lift ESC',H0.ESC,1],['Battery',P0&&P0.Battery,2],['Pusher motor',U0&&U0.Motor,3],['Motor mount',H0.Mount,4]].filter(s=>s[1]);
    const L=D.inputs_summary.limits_C, w=Math.max(320, svg.closest('.svgwrap').clientWidth||640), h=300, m={l:44,r:120,t:14,b:36};
    const tmax=Math.max(...series.map(s=>s[1].t[s[1].t.length-1])), ymax=Math.ceil(Math.max(L.motor_can_C, ...series.map(s=>Math.max(...s[1].T)))/10)*10+5, ymin=30;
    const X=t=>m.l+(w-m.l-m.r)*t/tmax, Y=T_=>h-m.b-(h-m.t-m.b)*(T_-ymin)/(ymax-ymin);
    let g=`<line class="axis" x1="${m.l}" y1="${h-m.b}" x2="${w-m.r}" y2="${h-m.b}"/><line class="axis" x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${h-m.b}"/>`;
    for(let T_=Math.ceil(ymin/10)*10;T_<=ymax;T_+=10) g+=`<line class="grid" x1="${m.l}" y1="${Y(T_)}" x2="${w-m.r}" y2="${Y(T_)}"/><text x="${m.l-6}" y="${Y(T_)+4}" text-anchor="end">${T_}</text>`;
    for(let t=0;t<=tmax;t+=120) g+=`<text x="${X(t)}" y="${h-m.b+16}" text-anchor="middle">${t}</text>`;
    g+=`<text x="${(m.l+w-m.r)/2}" y="${h-4}" text-anchor="middle">mission time, s (hover, transition, cruise, transition, hover)</text><text x="12" y="${m.t+8}">°C</text>`;
    [['motor/ESC limit '+L.motor_can_C+' / '+L.esc_C, L.motor_can_C],['LiPo limit '+L.lipo_C, L.lipo_C]].forEach(([lab,v])=>{ g+=`<line x1="${m.l}" y1="${Y(v)}" x2="${w-m.r}" y2="${Y(v)}" stroke="${T.bad}" stroke-dasharray="5 4" stroke-width="1.2"/><text x="${w-m.r+6}" y="${Y(v)+4}" fill="${T.bad}">${lab} °C</text>`; });
    series.forEach(([lab,s,i])=>{ const d=s.t.map((t,k)=>(k?'L':'M')+X(t).toFixed(1)+' '+Y(s.T[k]).toFixed(1)).join(''); const pk=Math.max(...s.T);
      g+=`<path d="${d}" fill="none" stroke="${T.c[i]}" stroke-width="2"/>`;
      const k=s.T.indexOf(pk); g+=`<circle cx="${X(s.t[k])}" cy="${Y(pk)}" r="3" fill="${T.c[i]}"/>`; });
    // legend at the right, in series colours
    series.forEach(([lab,s,i],k)=>{ const y=m.t+40+k*18; g+=`<line x1="${w-m.r+6}" y1="${y}" x2="${w-m.r+20}" y2="${y}" stroke="${T.c[i]}" stroke-width="2.5"/><text x="${w-m.r+24}" y="${y+4}">${lab}</text>`; });
    svg.setAttribute('viewBox',`0 0 ${w} ${h}`); svg.innerHTML=g; }
  function findings(){ const tb=$('#thFind tbody'); if(!tb) return; const chip={pass:'met','at risk':'risk',fail:'fail'};
    const esc=t=>String(t==null?'—':t).replace(/[&<]/g,c=>c==='&'?'&amp;':'&lt;');
    tb.innerHTML=D.findings.map(f=>`<tr><td>${esc(f.component)}</td><td>${esc(f.case)}</td><td class="n">${f.peak_C!=null?f.peak_C.toFixed(0):'—'}</td><td class="n">${f.peak_std_C!=null?f.peak_std_C.toFixed(0):'—'}</td><td class="n">${f.limit_C!=null?f.limit_C.toFixed(0):'—'}</td><td class="n">${f.margin_K!=null?(f.margin_K>0?'+':'')+f.margin_K.toFixed(0):'—'}</td><td>${chip[f.status]?`<span class="chip ${chip[f.status]}">${esc(f.status)}</span>`:esc(f.status)}</td><td><small>${esc(f.limit_src)}${f.note?'; '+esc(f.note):''}</small></td></tr>`).join(''); }

  function init(){ const e=document.getElementById('thermData'); if(!e) return; try{ D=JSON.parse(e.textContent); }catch(err){ return; }
    tok(); cv=$('#thCanvas'); ctx=cv&&cv.getContext&&cv.getContext('2d'); if(!ctx){ return; }
    $('#thCases').innerHTML=CASES.filter(c=>field(c.key)).map((c,i)=>`<button type="button" data-i="${i}">${c.label}</button>`).join('');
    $$('#thCases button').forEach(b=>b.addEventListener('click',()=>pick(+b.dataset.i)));
    cv.addEventListener('pointerdown',e=>{ drag={x:e.clientX,y:e.clientY}; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove',e=>{ if(!drag) return; cam.yaw+=(e.clientX-drag.x)*0.01; cam.pitch=Math.max(-1.4,Math.min(1.4,cam.pitch+(e.clientY-drag.y)*0.01)); drag={x:e.clientX,y:e.clientY}; draw(); });
    const end=()=>{ drag=null; }; cv.addEventListener('pointerup',end); cv.addEventListener('pointercancel',end);
    cv.addEventListener('keydown',e=>{ const k={ArrowLeft:[-.1,0],ArrowRight:[.1,0],ArrowUp:[0,-.1],ArrowDown:[0,.1]}[e.key]; if(!k) return; e.preventDefault(); cam.yaw+=k[0]; cam.pitch=Math.max(-1.4,Math.min(1.4,cam.pitch+k[1])); draw(); });
    if(window.ResizeObserver) new ResizeObserver(()=>size()).observe(cv);
    findings(); pick(0); size(); history(); started=true; }
  return { redraw(){ if(!document.getElementById('thermData')) return; if(!started){ const v=$('#thermViz'); if(v && !v.closest('[hidden]')) init(); return; } tok(); size(); history(); } };
})();
