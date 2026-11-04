// ---------- flow visualisation: 2-D SU2 field over the NACA 2415 and 3-D VLM streamlines over the aircraft ----------
// Data: analysis/aero/out/flowviz/flow2d.json (flowfield_2d.py) and flow3d.json (flowfield_3d.py), embedded by build.mjs
// as inert JSON blocks and parsed the first time the viewer scrolls into view.
const FlowViz = (()=>{
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let F2=null, F3=null, DEC=[], mode='2d', field='speed', ai=0, paused=RM, running=false, visible=false, raf=0;
  let cv, ctx, W=0, H=0, dpr=1, fieldImg=null, dec=null, parts=null, last=0;
  let cam={yaw:-0.75, pitch:0.42, zoom:1}, drag=null, seg3=null, clock=0;
  let T={};
  const readTok = () => { const cs=getComputedStyle(document.documentElement), g=n=>cs.getPropertyValue(n).trim();
    T={surface:g('--surface'), surface3:g('--surface-3'), fg:g('--fg'), fg2:g('--fg-2'), line3:g('--line-3'), font:g('--f-body')}; };

  // diverging ramp on the dark ground: cool below the reference, neutral at it, warm above
  const LO=[111,159,208], MID=[50,55,61], HI=[224,154,92];
  const ramp = t => { t=Math.max(-1,Math.min(1,t)); const a=t<0?LO:HI, k=Math.abs(t); return [MID[0]+(a[0]-MID[0])*k, MID[1]+(a[1]-MID[1])*k, MID[2]+(a[2]-MID[2])*k]; };
  // streamlines in 3-D need a visible neutral, so their ramp runs through a mid grey instead of the ground colour
  const LMID=[92,100,110], lramp = t => { t=Math.max(-1,Math.min(1,t)); const a=t<0?LO:HI, k=Math.abs(t); return [LMID[0]+(a[0]-LMID[0])*k, LMID[1]+(a[1]-LMID[1])*k, LMID[2]+(a[2]-LMID[2])*k]; };
  const rgb = c => `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;
  // speed |V|/V∞: 0 → full cool, 1 → neutral, 1.6 → full warm.  Cp: −2.5 (suction) → cool, 0 → neutral, +1 (stagnation) → warm
  const SPEED = {lo:0, mid:1, hi:1.6, ticks:[0,0.5,1,1.3,1.6], label:'Local speed / free-stream speed, |V| / V∞'};
  const CP = {lo:-2.5, mid:0, hi:1, ticks:[-2.5,-1.5,-0.5,0,0.5,1], label:'Pressure coefficient Cp (negative = suction; below −2.5 shown at the end colour)'};
  const tmap = (v,s) => v<s.mid ? (v-s.mid)/(s.mid-s.lo) : (v-s.mid)/(s.hi-s.mid);

  function b64(s, T){ const bin=atob(s), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return T===Uint8Array?u:T===Int8Array?new Int8Array(u.buffer):new Int16Array(u.buffer); }
  function decode(a){
    const T=a.int8?Int8Array:Int16Array, n=a.nx*a.ny, u=b64(a.u,T), v=b64(a.v,T), cp=b64(a.cp,T), m=b64(a.mask,Uint8Array);
    const U=new Float32Array(n), V=new Float32Array(n), C=new Float32Array(n);
    for(let k=0;k<n;k++){ U[k]=u[k]/a.u_scale; V[k]=v[k]/a.v_scale; C[k]=cp[k]/a.cp_scale; }
    return {a, U, V, C, M:m, nx:a.nx, ny:a.ny, x0:a.x0, x1:a.x1, y0:a.y0, y1:a.y1, dx:(a.x1-a.x0)/(a.nx-1), dy:(a.y1-a.y0)/(a.ny-1)};
  }
  // bilinear sample in chord units; returns null inside the aerofoil or outside the grid
  function samp(d, x, y){
    const fx=(x-d.x0)/d.dx, fy=(y-d.y0)/d.dy, i=Math.floor(fx), j=Math.floor(fy);
    if(i<0||j<0||i>=d.nx-1||j>=d.ny-1) return null;
    const k=j*d.nx+i; if(d.M[k]||d.M[k+1]||d.M[k+d.nx]||d.M[k+d.nx+1]) return null;
    const tx=fx-i, ty=fy-j, w00=(1-tx)*(1-ty), w10=tx*(1-ty), w01=(1-tx)*ty, w11=tx*ty;
    return [d.U[k]*w00+d.U[k+1]*w10+d.U[k+d.nx]*w01+d.U[k+d.nx+1]*w11, d.V[k]*w00+d.V[k+1]*w10+d.V[k+d.nx]*w01+d.V[k+d.nx+1]*w11];
  }
  function buildFieldImg(){
    const d=dec, s=field==='cp'?CP:SPEED, c=document.createElement('canvas'); c.width=d.nx; c.height=d.ny;
    const g=c.getContext('2d'), im=g.createImageData(d.nx,d.ny);
    for(let j=0;j<d.ny;j++) for(let i=0;i<d.nx;i++){
      const k=j*d.nx+i, o=((d.ny-1-j)*d.nx+i)*4; // image row 0 = top (y1)
      const val = field==='cp' ? d.C[k] : Math.hypot(d.U[k],d.V[k]);
      const col = d.M[k] ? MID : ramp(tmap(val,s));
      im.data[o]=col[0]; im.data[o+1]=col[1]; im.data[o+2]=col[2]; im.data[o+3]=255; }
    g.putImageData(im,0,0); fieldImg=c;
  }
  // view window in the wind frame (free stream left to right), chord units; the aerofoil is pitched up by alpha
  function win(){ const narrow=W/dpr<560; return narrow ? {cx:0.55, hx:0.8, hy:0.45} : {cx:0.6, hx:1.0, hy:0.45}; }
  const alpha = () => dec.a.alpha*Math.PI/180;
  const toWind = (x,y,w,a) => { const px=x-w.cx, c=Math.cos(a), s=Math.sin(a); return [c*px+s*y, -s*px+c*y]; };
  const toChord = (X,Y,w,a) => { const c=Math.cos(a), s=Math.sin(a); return [c*X-s*Y+w.cx, s*X+c*Y]; };

  const NTR=10;
  function spawn(p, anywhere){ const w=win(), a=alpha();
    const X = anywhere ? -w.hx+Math.random()*2*w.hx : -w.hx-Math.random()*0.05, Y=-w.hy+Math.random()*2*w.hy;
    const q=toChord(X,Y,w,a); p.x=q[0]; p.y=q[1]; p.age=0; p.life=4+Math.random()*4; p.n=0; p.tr.fill(0); }
  function initParticles(){ const n = Math.round(Math.min(900, Math.max(300, W*H/(dpr*dpr)/520)));
    parts=[]; for(let i=0;i<n;i++){ const p={tr:new Float32Array(NTR*2)}; spawn(p,true); parts.push(p); } }

  function step2d(dt){ const w=win(), a=alpha(), rate=0.55; // free stream moves 0.55 chord per second on screen
    for(const p of parts){
      const v=samp(dec,p.x,p.y); if(!v){ spawn(p,false); continue; }
      const mx=p.x+v[0]*rate*dt*0.5, my=p.y+v[1]*rate*dt*0.5, v2=samp(dec,mx,my); if(!v2){ spawn(p,false); continue; }
      p.tr.copyWithin(2,0,NTR*2-2); p.tr[0]=p.x; p.tr[1]=p.y; p.n=Math.min(NTR,p.n+1);
      p.x+=v2[0]*rate*dt; p.y+=v2[1]*rate*dt; p.age+=dt;
      const q=toWind(p.x,p.y,w,a); if(q[0]>w.hx||Math.abs(q[1])>w.hy||p.age>p.life) spawn(p,false); }
  }
  function frame2d(){
    const w=win(), a=alpha(), k=Math.min(W/(2*w.hx), H/(2*w.hy));
    ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle=T.surface; ctx.fillRect(0,0,W,H);
    ctx.save(); ctx.translate(W/2,H/2); ctx.scale(k,-k); ctx.rotate(-a); ctx.translate(-w.cx,0);
    ctx.imageSmoothingEnabled=true; ctx.save(); ctx.translate(dec.x0,dec.y1); ctx.scale(1,-1); ctx.drawImage(fieldImg,0,0,dec.x1-dec.x0,dec.y1-dec.y0); ctx.restore();
    // particles: trails fade with age, drawn in age buckets
    const lw=1.1*dpr/k; ctx.lineWidth=lw; ctx.lineCap='round'; ctx.strokeStyle='#f1f3f5';
    if(parts) for(let b=0;b<NTR-1;b++){ ctx.globalAlpha=0.75*(1-b/(NTR-1)); ctx.beginPath();
      for(const p of parts){ if(p.n<=b) continue; const ax=b?p.tr[(b-1)*2]:p.x, ay=b?p.tr[(b-1)*2+1]:p.y; ctx.moveTo(ax,ay); ctx.lineTo(p.tr[b*2],p.tr[b*2+1]); }
      ctx.stroke(); }
    ctx.globalAlpha=1;
    if(!parts){ drawStreamlines(w,a,k); }
    // aerofoil
    const o=F2.outline; ctx.beginPath(); o.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1])); ctx.closePath();
    ctx.fillStyle=T.surface3; ctx.fill(); ctx.lineWidth=1.2*dpr/k; ctx.strokeStyle=T.fg2; ctx.stroke();
    // stagnation point and estimated separation on the upper surface
    const marks=[]; const st=dec.a.stag_xy; if(st) marks.push({x:st[0],y:st[1],t:'stagnation point'});
    if(dec.sep) marks.push({x:dec.sep[0],y:dec.sep[1],t:'flow separates (est.)'});
    const pix=marks.map(m=>{ ctx.beginPath(); ctx.arc(m.x,m.y,4*dpr/k,0,7); ctx.fillStyle=T.fg; ctx.fill(); const t=ctx.getTransform(); const P=t.transformPoint(new DOMPoint(m.x,m.y)); return {X:P.x,Y:P.y,t:m.t}; });
    ctx.restore();
    // labels in screen space, each on a plate so it reads over the moving traces
    const plate=(txt,x,y,al)=>{ const m=ctx.measureText(txt), w=m.width+10*dpr, h=20*dpr; let lx=al==='right'?x-w+5*dpr:x-5*dpr; lx=Math.max(4*dpr,Math.min(W-w-4*dpr,lx)); // kept inside the canvas
      ctx.save(); ctx.globalAlpha=0.88; ctx.fillStyle=T.surface; ctx.fillRect(lx,y-h/2,w,h); ctx.restore(); ctx.fillStyle=T.fg; ctx.textAlign='left'; ctx.fillText(txt,lx+5*dpr,y); };
    ctx.font=`${13*dpr}px ${T.font}`; ctx.fillStyle=T.fg; ctx.textBaseline='middle';
    pix.forEach(m=>{ const up=m.t.startsWith('flow'); ctx.textAlign=up?'left':'right'; const dx=up?8*dpr:-8*dpr, dy=up?-16*dpr:14*dpr;
      ctx.strokeStyle=T.fg2; ctx.lineWidth=dpr; ctx.beginPath(); ctx.moveTo(m.X,m.Y); ctx.lineTo(m.X+dx*0.7,m.Y+dy*0.8); ctx.stroke(); plate(m.t,m.X+dx,m.Y+dy,up?'left':'right'); });
    // free-stream arrow and chord scale
    ctx.strokeStyle=T.fg; ctx.lineWidth=1.5*dpr; const y0=20*dpr, x0=19*dpr;
    plate(`→  free stream, ${F2.V_mps} m/s, α = ${dec.a.alpha}°`, x0, y0, 'left');
    const cmm=Math.round(AEROD.geometry.chord_m*1000), sx=W-14*dpr-k*0.5, sy=H-16*dpr;
    ctx.beginPath(); ctx.moveTo(sx,sy-4*dpr); ctx.lineTo(sx,sy); ctx.lineTo(sx+k*0.5,sy); ctx.lineTo(sx+k*0.5,sy-4*dpr); ctx.stroke();
    plate(`half chord, ${Math.round(cmm/2)} mm`, sx-6*dpr, sy-2*dpr, 'right');
  }
  // reduced motion: static streamlines from seeds across the inlet (midpoint integration)
  function drawStreamlines(w,a,k){ ctx.lineWidth=1.1*dpr/k; ctx.strokeStyle='rgba(241,243,245,.8)'; ctx.beginPath();
    for(let s=0;s<34;s++){ const Y=-w.hy+(s+0.5)*(2*w.hy/34); let q=toChord(-w.hx,Y,w,a), x=q[0], y=q[1]; ctx.moveTo(x,y);
      for(let i=0;i<900;i++){ const v=samp(dec,x,y); if(!v) break; const m=Math.hypot(v[0],v[1])||1e-6, h=0.004; const v2=samp(dec,x+v[0]/m*h/2,y+v[1]/m*h/2); if(!v2) break; const m2=Math.hypot(v2[0],v2[1])||1e-6;
        x+=v2[0]/m2*h; y+=v2[1]/m2*h; ctx.lineTo(x,y); const r=toWind(x,y,w,a); if(r[0]>w.hx||Math.abs(r[1])>w.hy) break; } }
    ctx.stroke(); }

  // ---------- 3-D: painter-sorted panels and streamline segments, particles riding the lines ----------
  function build3(){ seg3={panels:[], lines:[]};
    ['wing','htail','fin'].forEach(g=>{ const P=F3.panels[g]; if(!P) return; P.quads.forEach(q=>seg3.panels.push(q)); });
    const all=[]; F3.streamlines.forEach(l=>l.s.forEach(v=>all.push(v))); all.sort((a,b)=>a-b);
    const lo=all[Math.floor(all.length*0.02)], hi=all[Math.floor(all.length*0.98)], span=Math.max(1-lo,hi-1,0.01);
    seg3.span=span; seg3.lines=F3.streamlines.map(l=>({xyz:l.xyz, s:l.s, ph:Math.random(), c:l.s.map(v=>rgb(lramp((v-1)/span)))})); seg3.key=''; }
  function project3(){ const key=[cam.yaw,cam.pitch,cam.zoom,W,H].join(); if(seg3.key===key) return; seg3.key=key;
    const cy=Math.cos(cam.yaw), sy=Math.sin(cam.yaw), cp=Math.cos(cam.pitch), sp=Math.sin(cam.pitch), sc=Math.min(W,H*1.6)/2.9*cam.zoom;
    // CAD frame X fwd, Y up, Z right; camera orbits the wing centre (X −0.6); screen x negated so starboard is on the right seen from behind
    const pr=(X,Y,Z)=>{ const x=X+0.6, xr=cy*Z-sy*x, zr=sy*Z+cy*x; return [W/2-xr*sc, H/2-(cp*Y-sp*zr)*sc, sp*Y+cp*zr]; };
    const prims=[];
    seg3.panels.forEach(q=>{ const a=pr(q[0],q[1],q[2]), b=pr(q[3],q[4],q[5]), c=pr(q[6],q[7],q[8]), d=pr(q[9],q[10],q[11]); prims.push({d:(a[2]+b[2]+c[2]+d[2])/4, k:0, p:[a,b,c,d]}); });
    seg3.lines.forEach(l=>{ const n=l.s.length, P=l.P=new Array(n); for(let i=0;i<n;i++) P[i]=pr(l.xyz[i*3],l.xyz[i*3+1],l.xyz[i*3+2]);
      for(let i=0;i<n-1;i++) prims.push({d:(P[i][2]+P[i+1][2])/2, k:1, a:P[i], b:P[i+1], c:l.c[i]}); });
    seg3.prims=prims.sort((a,b)=>a.d-b.d); }
  function frame3d(){
    project3();
    ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle=T.surface; ctx.fillRect(0,0,W,H); ctx.lineCap='round';
    const sf=T.line3, lw=1.1*dpr;
    for(const p of seg3.prims){
      if(p.k===0){ ctx.beginPath(); ctx.moveTo(p.p[0][0],p.p[0][1]); for(let i=1;i<4;i++) ctx.lineTo(p.p[i][0],p.p[i][1]); ctx.closePath(); ctx.fillStyle=sf; ctx.fill(); ctx.lineWidth=0.8*dpr; ctx.strokeStyle=sf; ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(p.a[0],p.a[1]); ctx.lineTo(p.b[0],p.b[1]); ctx.lineWidth=lw; ctx.strokeStyle=p.c; ctx.stroke(); } }
    // particles ride the cached projected lines; drawn last (on top) so the sort is not redone every frame
    if(!RM || !paused){ const ph=(clock*0.25)%1; ctx.fillStyle='#f1f3f5'; ctx.beginPath();
      seg3.lines.forEach(l=>{ const P=l.P, n=P.length; for(let m=0;m<2;m++){ const f=((ph+l.ph+m/2)%1)*(n-1), i=Math.floor(f), u=f-i; if(i>=n-1) continue;
        const x=P[i][0]+(P[i+1][0]-P[i][0])*u, y=P[i][1]+(P[i+1][1]-P[i][1])*u; ctx.moveTo(x+1.8*dpr,y); ctx.arc(x,y,1.8*dpr,0,7); } });
      ctx.fill(); }
    ctx.font=`${13*dpr}px ${T.font}`; ctx.fillStyle=T.fg; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(`cruise ${F3.condition.V_mps} m/s, α = ${F3.condition.alpha_deg.toFixed(2)}° (trim) · drag to turn`, 14*dpr, 18*dpr);
  }

  // ---------- shell ----------
  function size(){ const r=cv.getBoundingClientRect(); dpr=Math.min(2,window.devicePixelRatio||1);
    W=Math.max(1,Math.round(r.width*dpr)); H=Math.max(1,Math.round(r.height*dpr)); cv.width=W; cv.height=H;
    if(mode==='2d' && dec && (!RM || !paused)) initParticles(); draw(performance.now()); }
  function draw(t){ if(!ctx) return; if(mode==='2d'){ if(dec) frame2d(); } else if(seg3) frame3d(t); }
  function loop(t){ raf=0; if(!running) return; const dt=Math.min(0.05,(t-(last||t))/1000); last=t;
    if(!paused){ clock+=dt; if(mode==='2d' && parts) step2d(dt); } draw(t); raf=requestAnimationFrame(loop); }
  function setRun(){ const want=visible && (!paused || drag); if(want && !running){ running=true; last=0; raf=requestAnimationFrame(loop); } else if(!want){ running=false; if(raf) cancelAnimationFrame(raf); raf=0; draw(0); } }

  function legend(){ const el=$('#fvLegend'); if(!el) return;
    if(mode==='3d'){ const sp=seg3?seg3.span:0.06, lo=(1-sp).toFixed(2), hi=(1+sp).toFixed(2);
      el.innerHTML=`<span class="fvl-t">Speed along each streamline, |V| / V∞</span><span class="fvl-bar" style="background:linear-gradient(90deg,${rgb(LO)},${rgb(LMID)},${rgb(HI)})"></span><span class="fvl-k"><span>${lo}</span><span>1.00</span><span>${hi}</span></span>`; return; }
    const s=field==='cp'?CP:SPEED, pos=v=>((tmap(v,s)+1)/2*100).toFixed(1);
    el.innerHTML=`<span class="fvl-t">${s.label}</span><span class="fvl-bar" style="background:linear-gradient(90deg,${rgb(LO)},${rgb(MID)},${rgb(HI)})"></span><span class="fvl-k fvl-abs">${s.ticks.map(v=>`<span style="left:${pos(v)}%">${v.toLocaleString('en-US')}</span>`).join('')}</span>`; }
  function readout(){ const el=$('#fvRead'); if(!el) return;
    if(mode==='3d'){ const c=F3.condition, dw=F3.downwash_at_htail;
      el.innerHTML=`Vortex-lattice model at cruise trim: CL ${c.CL_vlm.toFixed(3)}, induced drag CDi ${c.CDi_vlm.toFixed(4)}. The streamlines bend down behind the wing (downwash ${Math.abs(dw.epsilon_deg_mean).toFixed(1)}° at the tail) and curl round the tips into the tip vortices. Inviscid: no boundary layer, no stall, pod not modelled.`; return; }
    const a=dec.a, conv=a.converged?'converged':'not steady (last iterate shown)';
    const sep = a.x_sep_upper_est==null || a.x_sep_upper_est>=0.99 ? 'stays attached to the trailing edge' : `separates from about ${Math.round(a.x_sep_upper_est*100)} % chord (est.). Fully turbulent SA stalls later and more gently than the tunnel section, which stalls at ${AEROD.CL_max_2D.experiment_Genc_Lock_Kaynak_2008_Re2e5.alpha_stall_deg}°`;
    el.innerHTML=`α ${a.alpha}°: CL ${a.CL.toFixed(3)}, CD ${a.CD.toFixed(4)}, ${a.mesh} mesh, ${conv}. Lowest wall Cp ${a.Cp_min_wall.toFixed(2).replace('-','−')}; probed 0.5 % chord off the wall (flowfield_2d.py), the upper-surface flow ${sep}.`; }
  function syncUI(){
    $$('#flowViz [data-fv]').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.fv===mode)));
    $$('#fvAlpha button').forEach((b,i)=>b.setAttribute('aria-pressed', String(i===ai)));
    $$('#flowViz [data-ff]').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.ff===field)));
    $$('#flowViz .fv-2d').forEach(e=>e.hidden = mode!=='2d'); $$('#flowViz .fv-3d').forEach(e=>e.hidden = mode!=='3d');
    const pb=$('#fvPause'); if(pb){ pb.setAttribute('aria-pressed',String(paused)); pb.textContent=paused?'Play':'Pause'; }
    cv.setAttribute('aria-label', mode==='2d' ? `Animated flow field around the NACA 2415 section at ${dec?dec.a.alpha:''} degrees angle of attack, coloured by ${field==='cp'?'pressure coefficient':'local speed'}` : 'Streamlines over the wing, tail and fins at cruise, coloured by local speed; drag to rotate');
    cv.classList.toggle('grab', mode==='3d'); legend(); readout(); }
  function pickAngle(i){ ai=i; dec = DEC[i] || (DEC[i]=withSep(decode(F2.angles[i]))); buildFieldImg(); if(!RM || !paused) initParticles(); else parts=null; syncUI(); draw(performance.now()); }
  // outline node nearest the estimated upper-surface separation (flowfield_2d.py x_sep_upper_est), or null when attached
  function withSep(d){ const xs=d.a.x_sep_upper_est; d.sep=null;
    if(xs!=null && xs<0.99) F2.outline.forEach(q=>{ if(q[1]>0 && (!d.sep || Math.abs(q[0]-xs)<Math.abs(d.sep[0]-xs))) d.sep=q; });
    return d; }

  function init(){
    const root=$('#flowViz'); if(!root) return;
    const e2=document.getElementById('flow2dData'), e3=document.getElementById('flow3dData');
    try{ F2=e2?JSON.parse(e2.textContent):null; }catch(e){ F2=null; } try{ F3=e3?JSON.parse(e3.textContent):null; }catch(e){ F3=null; }
    if(F2 && !(F2.angles||[]).length) F2=null;
    if(!F2 && !F3){ root.hidden=true; return; }
    if(!F2){ mode='3d'; $$('#flowViz [data-fv="2d"]').forEach(b=>b.hidden=true); }
    if(!F3) $$('#flowViz [data-fv="3d"]').forEach(b=>b.hidden=true);
    cv=$('#fvCanvas'); ctx=cv.getContext && cv.getContext('2d'); if(!ctx){ root.hidden=true; return; }
    if(F2){ const al=$('#fvAlpha'); al.innerHTML=F2.angles.map(a=>`<button type="button">${a.alpha}°</button>`).join('');
      $$('#fvAlpha button').forEach((b,i)=>b.addEventListener('click',()=>pickAngle(i)));
      const i8=F2.angles.findIndex(a=>a.alpha===8); pickAngle(i8>=0?i8:0); }
    if(F3) build3();
    $$('#flowViz [data-fv]').forEach(b=>b.addEventListener('click',()=>{ mode=b.dataset.fv; root.dataset.mode=mode; syncUI(); size(); }));
    $$('#flowViz [data-ff]').forEach(b=>b.addEventListener('click',()=>{ field=b.dataset.ff; buildFieldImg(); syncUI(); draw(performance.now()); }));
    $('#fvPause').addEventListener('click',()=>{ paused=!paused; if(!paused && !parts && dec && mode==='2d') initParticles(); syncUI(); setRun(); });
    // orbit in 3-D: pointer drag and arrow keys
    cv.addEventListener('pointerdown',e=>{ if(mode!=='3d') return; drag={x:e.clientX,y:e.clientY}; cv.setPointerCapture(e.pointerId); setRun(); });
    cv.addEventListener('pointermove',e=>{ if(!drag) return; cam.yaw+=(e.clientX-drag.x)*0.008; cam.pitch=Math.max(-1.4,Math.min(1.4,cam.pitch+(e.clientY-drag.y)*0.008)); drag={x:e.clientX,y:e.clientY}; if(!running) draw(performance.now()); });
    const end=()=>{ drag=null; setRun(); }; cv.addEventListener('pointerup',end); cv.addEventListener('pointercancel',end);
    cv.addEventListener('keydown',e=>{ if(mode!=='3d') return; const k={ArrowLeft:[-.1,0],ArrowRight:[.1,0],ArrowUp:[0,-.1],ArrowDown:[0,.1]}[e.key]; if(!k) return; e.preventDefault(); cam.yaw+=k[0]; cam.pitch=Math.max(-1.4,Math.min(1.4,cam.pitch+k[1])); draw(performance.now()); });
    $$('#flowViz [data-fcam]').forEach(b=>b.addEventListener('click',()=>{ const v={iso:[-0.75,0.42,1],rear:[Math.PI,0.12,1.5],top:[Math.PI,1.35,1]}[b.dataset.fcam]; cam.yaw=v[0]; cam.pitch=v[1]; cam.zoom=v[2]; draw(performance.now()); }));
    readTok(); root.dataset.mode=mode; syncUI();
    if(window.ResizeObserver) new ResizeObserver(()=>size()).observe(cv); else addEventListener('resize',size);
    if(window.IntersectionObserver) new IntersectionObserver(es=>{ visible=es.some(x=>x.isIntersecting); setRun(); }).observe(cv); else { visible=true; }
    visible=inView(cv); size(); setRun();
  }
  let started=false, go=()=>{};
  const inView = el => { const r=el.getBoundingClientRect(); return r.width>0 && r.bottom>-400 && r.top<innerHeight+400; };
  function lazy(){ const v=$('#flowViz'); if(!v) return;
    go=()=>{ started=true; try{ init(); }catch(e){ console.error('flow viewer:', e); const r=$('#flowViz'); if(r) r.hidden=true; } };
    if(!('IntersectionObserver' in window)){ setTimeout(go,0); return; }
    const io=new IntersectionObserver(es=>{ if(es.some(x=>x.isIntersecting) && !started){ io.disconnect(); go(); } }, {rootMargin:'400px 0px'}); io.observe(v); }
  // the chapter router shows the figure without a scroll, which IntersectionObserver may not report until the next scroll
  return {lazy, redraw:()=>{ setTimeout(()=>{ const v=$('#flowViz'); if(!v) return; if(!started){ if(inView(v)) go(); } else if(ctx){ readTok(); visible=inView(cv); if(visible) size(); setRun(); } }, 60); }};   // after the router has scrolled to its target
})();
