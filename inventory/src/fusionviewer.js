/* Fusion model viewer: the Autodesk Fusion rebuild of the aircraft with every screw, washer, nut and insert
   (inventory/build_fusion.mjs packs inventory/fusion/stl/*.stl + manifest.json; hardware cards from inventory/hardware/hardware.json).
   Frame: X forward, Y up, Z right, metres (same as the SOLIDWORKS viewer). Positions are Uint16, dequantised with F.lo + q * F.sc.
   Motion: 29 joints from inventory/fusion/kinematics/kinematics.json (F.K): 24 revolute (surface, servo arm, pushrod, prop, wheel), 5 slider.
   Each moving mesh sits in a Group at its pivot (geometry shifted by -pivot) and turns about the axis with a quaternion; a slider offset is added through the parent chain.
   Groups: airframe, propulsion, gear, electronics, hardware (one mesh per joint), proposed (wheels). three.js r128 + OrbitControls. */
function FusionViewer(wrap, F, INVP){
  const $ = s => wrap.querySelector(s), $$ = s => Array.from(wrap.querySelectorAll(s));
  const canvas = $('canvas'), tip = $('.tip'), card = document.getElementById(wrap.dataset.card);
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof THREE === 'undefined' || !THREE.OrbitControls) return null;

  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(28, 1, 0.005, 50);
  const controls = new THREE.OrbitControls(camera, canvas); controls.enableDamping = true; controls.dampingFactor = 0.12;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9099, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.75); key.position.set(2.5, 4, 3); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.3); fill.position.set(-3, 1.5, -2.5); scene.add(fill);

  const dec = (s, T) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new T(u.buffer); };
  // flat-ish shading: normals averaged only across faces within 30 deg (same rule as the SOLIDWORKS viewer)
  function creased(pos, idx){
    const nt = idx.length / 3, fn = new Float32Array(nt * 3), nv = pos.length / 3, cnt = new Uint32Array(nv + 1);
    for (let t = 0; t < nt; t++){
      const a = idx[3*t]*3, b = idx[3*t+1]*3, c = idx[3*t+2]*3;
      const ux = pos[b]-pos[a], uy = pos[b+1]-pos[a+1], uz = pos[b+2]-pos[a+2], vx = pos[c]-pos[a], vy = pos[c+1]-pos[a+1], vz = pos[c+2]-pos[a+2];
      fn[3*t] = uy*vz-uz*vy; fn[3*t+1] = uz*vx-ux*vz; fn[3*t+2] = ux*vy-uy*vx;
      for (let k = 0; k < 3; k++) cnt[idx[3*t+k] + 1]++;
    }
    for (let v = 0; v < nv; v++) cnt[v + 1] += cnt[v];
    const adj = new Uint32Array(nt * 3), fillp = cnt.slice(0, nv);
    for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) adj[fillp[idx[3*t+k]]++] = t;
    const unit = new Float32Array(nt * 3);
    for (let t = 0; t < nt; t++){ const l = Math.hypot(fn[3*t], fn[3*t+1], fn[3*t+2]) || 1; unit[3*t] = fn[3*t]/l; unit[3*t+1] = fn[3*t+1]/l; unit[3*t+2] = fn[3*t+2]/l; }
    const P = new Float32Array(nt * 9), N = new Float32Array(nt * 9), cosA = Math.cos(30 * Math.PI / 180);
    for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++){
      const v = idx[3*t+k]; let x = 0, y = 0, z = 0;
      for (let q = cnt[v]; q < cnt[v + 1]; q++){ const f = adj[q]; if (unit[3*f]*unit[3*t] + unit[3*f+1]*unit[3*t+1] + unit[3*f+2]*unit[3*t+2] > cosA){ x += fn[3*f]; y += fn[3*f+1]; z += fn[3*f+2]; } }
      const l = Math.hypot(x, y, z) || 1, o = 9*t + 3*k;
      P[o] = pos[3*v]; P[o+1] = pos[3*v+1]; P[o+2] = pos[3*v+2]; N[o] = x/l; N[o+1] = y/l; N[o+2] = z/l;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    return g;
  }

  const SHELL = /^(Wing_Panel|Aileron|Wing_Saddle|Fuselage_Pod|Canopy|H_Tail|Elevator|Fin)/;
  const S = {groups:{airframe:true, printed:true, propulsion:true, gear:true, electronics:true, hardware:true, mechanisms:true}, focus:false, sel:null};
  const model = new THREE.Group(); scene.add(model);
  const K = F.K, KG = K.g, V3 = a => new THREE.Vector3(a[0], a[1], a[2]);
  const D2R = Math.PI / 180, STEP = 5, rad = d => d * D2R;
  const pivotOf = g => !g || g.kind === 'slider' ? null : (g.kind === 'pushrod' ? g.p1 : g.pivot);
  const objs = F.parts.map((p, n) => {
    const q = dec(p.v, Uint16Array), idx = dec(p.i, p.w === 4 ? Uint32Array : Uint16Array), pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) pos[i] = F.lo[i % 3] + q[i] * F.sc[i % 3];
    const kg = p.m ? KG[p.m] : null, pv = pivotOf(kg);
    if (pv) for (let i = 0; i < pos.length; i++) pos[i] -= pv[i % 3];   // geometry about its pivot, so the Group at the pivot turns it
    const col = new THREE.Color().setRGB(p.c[0], p.c[1], p.c[2]).convertSRGBToLinear();
    const metal = (p.g === 'hardware' && !/nylon|tie|tape/i.test(p.n)) || /^(Boom|Spar|Wing_Joiner|Wing_Bolt|Pitot)/.test(p.n);
    const mat = new THREE.MeshStandardMaterial({color:col, roughness: metal ? 0.35 : 0.62, metalness: metal ? 0.6 : 0.04, side:THREE.DoubleSide});
    const mesh = new THREE.Mesh(creased(pos, idx), mat); mesh.userData.n = n;
    const grp = new THREE.Group(); grp.add(mesh); model.add(grp);
    return {p, mesh, mat, col, tris: idx.length / 3, grp, kg, pv, start: p.m || p.r || null};
  });
  const byMoving = {}; objs.forEach(o => { if (o.p.m) byMoving[o.p.m] = o; });

  // ---- joint state (servo degrees, slider mm, spin radians) ----
  const P = {roll:0, pitch:0, yaw:0, slide:{}, spin:0, wheel:0, bd:0};
  for (const id of K.order) if (KG[id].kind === 'slider') P.slide[id] = 0;
  const lerpTbl = (t, s) => { const u = Math.max(-45, Math.min(45, s)) / STEP + 9, i = Math.min(17, Math.floor(u)), f = u - i; return t[i] + (t[i + 1] - t[i]) * f; };
  const servoOf = id => ({ail_R: -P.roll, ail_L: P.roll, elev: P.pitch, rud_R: P.yaw, rud_L: P.yaw})[id];
  const surfOf = {}; for (const id of K.order){ const g = KG[id]; if (g.kind === 'surface') surfOf[g.driver] = id; }
  for (const id of K.order){ const g = KG[id]; if (g.kind === 'pushrod') surfOf[id] = surfOf[g.parent]; }
  const surfId = id => KG[id].kind === 'surface' ? id : surfOf[id];
  const offset = (id, out) => { out.set(0, 0, 0); for (let g = id && KG[id]; g; g = g.parent && KG[g.parent]) if (g.kind === 'slider'){ const m = (P.slide[g.id] || 0) / 1000; out.x += g.axis[0] * m; out.y += g.axis[1] * m; out.z += g.axis[2] * m; } return out; };
  const _o = new THREE.Vector3(), _a = new THREE.Vector3(), _h = new THREE.Vector3(), _q = new THREE.Quaternion();
  // the surface angle and the pushrod pose come from the exact four-bar table (19 steps of 5 deg), not a constant ratio
  const surfaceDeg = id => lerpTbl(KG[id].tbl, servoOf(id));
  function poseCore(){
    for (const o of objs){
      const g = o.kg, p = o.p; offset(o.start, _o);
      if (!g){ o.grp.position.copy(_o); continue; }
      if (g.kind === 'slider'){ o.grp.position.copy(_o); continue; }
      _a.set(g.axis[0], g.axis[1], g.axis[2]);
      if (g.kind === 'surface'){ _q.setFromAxisAngle(_a, rad(surfaceDeg(g.id))); o.grp.quaternion.copy(_q); o.grp.position.copy(V3(g.pivot)).add(_o); }
      else if (g.kind === 'servo_arm'){ _q.setFromAxisAngle(_a, rad(Math.max(-45, Math.min(45, servoOf(surfOf[g.id]))))); o.grp.quaternion.copy(_q); o.grp.position.copy(V3(g.pivot)).add(_o); }
      else if (g.kind === 'pushrod'){
        const arm = KG[g.parent], s = servoOf(surfOf[g.id]);
        _q.setFromAxisAngle(_a, rad(lerpTbl(g.rod, s))); o.grp.quaternion.copy(_q);
        _h.copy(V3(arm.hole)).sub(V3(arm.pivot)).applyAxisAngle(_a, rad(Math.max(-45, Math.min(45, s)))).add(V3(arm.pivot));   // arm hole about the shaft
        o.grp.position.copy(_h).add(_o);
      } else if (g.kind === 'prop'){ _q.setFromAxisAngle(_a, P.spin); o.grp.quaternion.copy(_q); o.grp.position.copy(V3(g.pivot)).add(_o); }
      else if (g.kind === 'wheel'){ _q.setFromAxisAngle(_a, -P.wheel); o.grp.quaternion.copy(_q); o.grp.position.copy(V3(g.pivot)).add(_o); }   // negative about +Z(right) = rolling forward
    }
    model.updateMatrixWorld(true);
  }
  function poseAll(){ poseCore(); readout(); nowCard(); kick(); }
  poseCore();
  const box = new THREE.Box3().setFromObject(model), centre = box.getCenter(new THREE.Vector3()), radius = box.getSize(new THREE.Vector3()).length() / 2;
  const grid = new THREE.GridHelper(3.2, 16); grid.position.set(centre.x, box.min.y - 0.002, centre.z); scene.add(grid);

  function applyStyles(){
    const acc = css('--accent') || '#b8481b';
    for (const o of objs){
      const g = o.p.g; o.mesh.visible = S.groups[g];
      let op = 1;
      if (S.focus && !DETAIL(g)) op = SHELL.test(o.p.n) ? 0.07 : 0.18;
      if (S.sel !== null && S.sel !== o.mesh.userData.n) op = Math.min(op, 0.22);
      const sel = S.sel === o.mesh.userData.n;
      o.mat.transparent = op < 1; o.mat.opacity = op; o.mat.depthWrite = op >= 0.99;
      o.mat.emissive.set(sel ? acc : '#000000'); o.mat.emissiveIntensity = sel ? 0.55 : 0; o.mat.needsUpdate = true;
    }
    const gm = Array.isArray(grid.material) ? grid.material : [grid.material];
    gm.forEach(m => { m.color.set(css('--line-2') || '#cbcfd4'); m.transparent = true; m.opacity = 0.45; });
    $$('button[data-fgroup]').forEach(b => b.setAttribute('aria-pressed', S.groups[b.dataset.fgroup]));
    const fb = $('button[data-fact="focus"]'); fb && fb.setAttribute('aria-pressed', S.focus);
    kick();
  }

  // ---- camera, render on demand ----
  const VIEWS = { iso:[0.95, 0.62, 1.0], top:[-0.001, 1, 0], side:[0, 0.02, 1], front:[1, 0.06, 0] };
  let tween = null, need = true, running = false, interacting = false, last = 0, onscreen = true;
  function kick(){ need = true; if (!running){ running = true; requestAnimationFrame(loop); } }
  function view(name, instant, target, rad){
    const d = new THREE.Vector3(...VIEWS[name]).normalize(), c = target || centre, r = rad || radius;
    const v = camera.fov * Math.PI / 360, h = Math.atan(Math.tan(v) * camera.aspect);
    const to = c.clone().add(d.multiplyScalar(r / Math.sin(Math.min(v, h)) * 0.7));
    if (instant || reduce()){ camera.position.copy(to); controls.target.copy(c); controls.update(); kick(); return; }
    tween = {t0: performance.now(), p0: camera.position.clone(), q0: controls.target.clone(), p1: to, q1: c.clone()}; kick();
  }
  function resize(){ const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); kick(); }
  controls.addEventListener('change', kick);
  controls.addEventListener('start', () => { interacting = true; kick(); });
  controls.addEventListener('end', () => { interacting = false; kick(); });
  // ---- live animations (only while on screen; render on demand otherwise) ----
  const A = {demo:false, spin:false, wheels:false, demoT:0, bdTo:0};
  const anyAnim = () => A.demo || A.spin || A.wheels || P.bd !== A.bdTo;
  const ease = u => u < 0.5 ? 2*u*u : 1 - Math.pow(-2*u + 2, 2) / 2, clamp01 = u => Math.max(0, Math.min(1, u));
  const DEMO_S = 4;   // seconds per axis; roll, then pitch, then yaw, looping
  // breakdown: canopy up, battery slides, H-tail up, wing panels slide off the joiner; slider ranges from kinematics.json (limits_mm; some are estimates)
  const BD = [['slide_canopy', 0, 0.3], ['slide_battery', 0.15, 0.4], ['slide_htail', 0.3, 0.55], ['slide_panel_R', 0.5, 1], ['slide_panel_L', 0.5, 1]];
  function setBreakdown(t){
    P.bd = t;
    for (const [id, a, b] of BD) P.slide[id] = KG[id].limMm[1] * ease(clamp01((t - a) / (b - a)));   // 0 = assembled, up to the limit (battery +30 mm forward)
    syncUI(); poseAll();
  }
  function step(dt){
    let ch = false;
    if (A.demo){ A.demoT = (A.demoT + dt) % (3 * DEMO_S); const k = Math.floor(A.demoT / DEMO_S), v = Math.round(45 * Math.sin(2 * Math.PI * (A.demoT / DEMO_S - k)) * 10) / 10;
      P.roll = k === 0 ? v : 0; P.pitch = k === 1 ? v : 0; P.yaw = k === 2 ? v : 0; ch = true; }
    if (A.spin){ P.spin = (P.spin + 38 * dt) % (2 * Math.PI); ch = true; }   // 38 rad/s is for show; it is not a real rpm
    if (A.wheels){ P.wheel = (P.wheel + 6 * dt) % (2 * Math.PI); ch = true; }
    if (P.bd !== A.bdTo){ const d = Math.sign(A.bdTo - P.bd) * dt / 9; let t = P.bd + d; if ((d > 0 && t >= A.bdTo) || (d < 0 && t <= A.bdTo)) t = A.bdTo; setBreakdown(t); ch = false; }
    if (ch){ syncUI(); poseAll(); }
  }
  function loop(now){
    if (!canvas.offsetParent || !onscreen){ running = false; last = 0; return; }
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
    let active = false;
    if (anyAnim()){ active = true; step(dt); }
    if (tween){ active = true;
      const u = Math.min(1, (now - tween.t0) / 450), e = u < 0.5 ? 2*u*u : 1 - Math.pow(-2*u + 2, 2) / 2;
      camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.q0, tween.q1, e);
      if (u >= 1) tween = null; need = true;
    }
    if (controls.update()){ need = true; active = true; }
    if (need){ renderer.render(scene, camera); need = false; }
    if (active || interacting) requestAnimationFrame(loop); else { running = false; last = 0; }
  }
  if (window.IntersectionObserver) new IntersectionObserver(es => { onscreen = es[es.length - 1].isIntersecting; if (onscreen) kick(); }).observe(canvas);

  // ---- cards ----
  const txt = (tag, t, cls) => { const e = document.createElement(tag); e.textContent = t; if (cls) e.className = cls; return e; };
  const nice = s => s.replace(/_/g, ' ');
  const GROUP = {airframe:'Airframe', printed:'Printed part', propulsion:'Propulsion', gear:'Landing gear and wheels', electronics:'Electronics (EST envelope)', hardware:'Hardware', mechanisms:'Servos and linkages'};
  const DETAIL = g => g === 'hardware' || g === 'mechanisms';
  function label(p){ return p.j ? p.j + ' ' + (F.joints[p.j] ? F.joints[p.j].name : p.n.replace(/^J-\d+ /, '')) : nice(p.n); }
  function showCard(n){
    if (!card) return; nowEl = null; card.replaceChildren();
    if (n === null){
      card.appendChild(txt('h3', 'Joint card'));
      card.appendChild(txt('p', 'Click a fastener group for its joint: what it holds, the tool, every screw, washer, nut and insert in it, and whether the hardware kit covers it. Hardware focus ghosts the airframe so the fasteners inside the foam show. Click a part for its name and inventory line.', 'small'));
      return;
    }
    const o = objs[n], p = o.p;
    const head = document.createElement('div'); head.className = 'ph'; head.appendChild(txt('h3', label(p)));
    const x = txt('button', 'Clear'); x.type = 'button'; x.setAttribute('aria-label', 'Clear selection'); x.addEventListener('click', () => select(null)); head.appendChild(x); card.appendChild(head);
    const dl = document.createElement('dl'); dl.className = 'kv'; const add = (k, v) => { dl.appendChild(txt('dt', k)); dl.appendChild(txt('dd', v === null || v === undefined || v === '' ? '—' : String(v))); };
    add('Group', GROUP[p.g] || p.g); add('Triangles', o.tris.toLocaleString('en-US'));
    const J = p.j && F.joints[p.j];
    if (o.kg) kinRows(o, add, dl);
    if (J){
      add('Pieces', p.k); add('Tool', J.tool); add('Removable', J.removable ? 'yes (field joint)' : 'no'); add('Assembly order', J.order); card.appendChild(dl);
      card.appendChild(txt('p', J.notes, 'small'));
      const t = document.createElement('table'); t.className = 'hwlist';
      const hr = document.createElement('tr'); ['Item', 'Spec', 'Qty', 'Covered by'].forEach(h => hr.appendChild(txt('th', h))); t.appendChild(hr);
      for (const [id, kind, spec, qty, cov, est] of J.items){
        const tr = document.createElement('tr'); tr.appendChild(txt('td', id, 'mono'));
        const sp = txt('td', spec); if (est) sp.appendChild(txt('span', 'EST', 'est')); tr.appendChild(sp);
        tr.appendChild(txt('td', qty, 'num')); const cs = (cov || '—').split(/ \(|; /)[0]; const ct = txt('td', cs.length > 44 ? cs.slice(0, 42) + '…' : cs); ct.title = cov || ''; tr.appendChild(ct); t.appendChild(tr);
      }
      const w = document.createElement('div'); w.className = 'hwwrap'; w.appendChild(t); card.appendChild(w);
      card.appendChild(txt('p', 'Source: ' + J.source, 'src'));
    } else {
      add('Instances', p.k); card.appendChild(dl);
      const inv = INVP && INVP[p.n.replace(/_\d+$/, '')];
      if (inv){ const row = document.createElement('div'); row.className = 'pbtns';
        for (const r of inv.rows){ const b = txt('button', 'Find ' + r.id + ' in inventory table'); b.type = 'button'; b.className = 'linkbtn'; b.dataset.find = r.id; row.appendChild(b); }
        card.appendChild(row); }
      else card.appendChild(txt('p', p.g === 'electronics' ? 'An electronics envelope; its line is in the Electrical section (§3).' : 'No inventory row maps to this part name.', 'small'));
    }
  }
  // ---- readouts and kinematics card ----
  const sg = (v, d) => (v >= 0 ? '+' : '\u2212') + Math.abs(v).toFixed(d === undefined ? 1 : d);
  const SURF = {ail_L:'aileron L', ail_R:'aileron R', elev:'elevator', rud_L:'rudder L', rud_R:'rudder R'};
  const dirOf = (id, a) => KG[id].plus && /down/.test(KG[id].plus) ? (a >= 0 ? 'TE down' : 'TE up') : (a >= 0 ? 'TE right' : 'TE left');
  const surfTxt = id => { const s = servoOf(id), a = surfaceDeg(id); return SURF[id] + ' ' + sg(a) + '\u00b0 ' + dirOf(id, a) + ' (servo ' + sg(s, 0) + '\u00b0)'; };
  const readLines = () => [
    'Roll ' + sg(P.roll, 0) + '\u00b0: ' + surfTxt('ail_L') + '; ' + surfTxt('ail_R') + '.',
    'Pitch ' + sg(P.pitch, 0) + '\u00b0: ' + surfTxt('elev') + '.',
    'Yaw ' + sg(P.yaw, 0) + '\u00b0: ' + surfTxt('rud_L') + '; ' + surfTxt('rud_R') + '.'];
  function readout(){
    const r = $('.fvread'), L = readLines(); if (r) r.querySelectorAll('span').forEach((e, i) => { if (L[i] && e.textContent !== L[i]) e.textContent = L[i]; });
    [['roll', 'Roll'], ['pitch', 'Pitch'], ['yaw', 'Yaw']].forEach(([k, lab], i) => { const o = $('output[data-pose="' + k + '"]'); if (o){ o.textContent = sg(P[k], 0) + '\u00b0'; const inp = $('input[data-fpose="' + k + '"]'); inp && inp.setAttribute('aria-valuetext', L[i]); } });
  }
  function syncUI(){ $$('input[data-fpose]').forEach(i => { if (+i.value !== P[i.dataset.fpose]) i.value = P[i.dataset.fpose]; }); }
  const mm = v => v.map(x => Math.round(x * 10000) / 10).join(', ');
  const nowText = g => {
    if (g.kind === 'surface') return surfTxt(g.id);
    if (g.kind === 'servo_arm'){ const s = servoOf(surfOf[g.id]); return 'servo ' + sg(Math.max(-45, Math.min(45, s)), 1) + '\u00b0'; }
    if (g.kind === 'pushrod') return 'rod ' + sg(lerpTbl(g.rod, servoOf(surfOf[g.id])), 2) + '\u00b0 at servo ' + sg(servoOf(surfOf[g.id]), 0) + '\u00b0';
    if (g.kind === 'slider') return (P.slide[g.id] || 0).toFixed(0) + ' mm';
    if (g.kind === 'prop') return (P.spin / D2R).toFixed(0) + '\u00b0 spin';
    return (P.wheel / D2R).toFixed(0) + '\u00b0 roll';
  };
  let nowEl = null;
  function nowCard(){ if (nowEl && S.sel !== null && objs[S.sel].kg) nowEl.textContent = nowText(objs[S.sel].kg); }
  function kinRows(o, add, dl){
    const g = o.kg, ax = g.axis;
    add('Joint', g.id + ' (' + g.kind.replace('servo_arm', 'servo arm') + (g.parent ? ', rides ' + g.parent : ', root') + ')');
    add('Pivot (model, mm X, Y, Z)', mm(g.pivot)); add('Pivot (Fusion cm X, Y, Z)', g.pivotCm.join(', '));
    add('Axis (model)', ax.join(', ') + (g.kind === 'slider' ? '' : '  (right-hand)'));
    if (g.limDeg) add('Limits', g.limDeg[0] + ' to ' + g.limDeg[1] + '\u00b0 (throw at servo \u00b145)');
    if (g.limMm) add('Travel', g.limMm[0] + ' to ' + g.limMm[1] + ' mm' + (/estimate/.test(g.limSrc || '') ? ' (estimate)' : ''));
    if (g.kind === 'surface'){ add('Ratio (secant, per servo deg)', g.ratio); add('Throw rule', 'exact four-bar table, not the ratio'); add('Positive', g.plus); add('Driven by', g.driver); }
    if (g.kind === 'servo_arm'){ add('Arm length', g.armR + ' mm'); add('Neutral arm angle', g.neutralDeg + '\u00b0'); add('Positive', g.positive); }
    if (g.kind === 'pushrod'){ add('Rod pin to hole', g.len + ' mm (cut ' + g.cut + ' mm)'); add('Pose', 'arm hole about the shaft; angle from the table at \u00b145: ' + g.rod[0].toFixed(2) + '\u00b0 / ' + g.rod[18].toFixed(2) + '\u00b0'); }
    if (g.kind === 'prop' || g.kind === 'wheel'){ add('Positive', g.positive); if (g.note) add('Note', g.note); }
    if (g.kind === 'slider' && g.positive) add('Positive', g.positive);
    add('Now', nowText(g));
    nowEl = dl.querySelectorAll('dd'); nowEl = nowEl[nowEl.length - 1];
  }
  function select(n){
    nowEl = null; S.sel = n; showCard(n); applyStyles();
  }

  // ---- hover and pick ----
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let downAt = null, hoverT = 0;
  function hit(e){
    const r = canvas.getBoundingClientRect(); ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const vis = objs.filter(o => o.mesh.visible && !(S.focus && !DETAIL(o.p.g))).map(o => o.mesh);
    const hs = ray.intersectObjects(vis, false); return hs.length ? hs[0].object.userData.n : null;
  }
  canvas.addEventListener('pointermove', e => {
    if (e.buttons || performance.now() - hoverT < 40) return; hoverT = performance.now();
    const n = hit(e); if (n === null){ tip.hidden = true; return; }
    tip.replaceChildren(txt('b', label(objs[n].p)), txt('span', GROUP[objs[n].p.g] || '')); tip.hidden = false;
  });
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
  canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return; downAt = null;
    const n = hit(e); select(n === S.sel ? null : n);
  });

  // ---- controls ----
  function stopAll(){ A.demo = A.spin = A.wheels = false; A.demoT = 0; A.bdTo = P.bd; }
  function syncBtns(){
    const set = (k, v) => { const b = $('button[data-fanim="' + k + '"]'); if (b) b.setAttribute('aria-pressed', v); };
    set('demo', A.demo); set('spin', A.spin); set('wheels', A.wheels); set('breakdown', A.bdTo === 1);
  }
  $$('input[data-fpose]').forEach(i => i.addEventListener('input', () => { A.demo = false; P[i.dataset.fpose] = +i.value; syncBtns(); poseAll(); }));
  const STEPS_REDUCED = [[0,0,0],[45,0,0],[-45,0,0],[0,45,0],[0,-45,0],[0,0,45],[0,0,-45]]; let rstep = 0;
  $$('button[data-fanim]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.fanim, red = reduce();
    if (k === 'demo'){
      if (red){ rstep = (rstep + 1) % STEPS_REDUCED.length; [P.roll, P.pitch, P.yaw] = STEPS_REDUCED[rstep]; syncUI(); poseAll(); return; }   // reduced motion: one pose per press
      A.demo = !A.demo; if (A.demo){ A.demoT = 0; } else { P.roll = P.pitch = P.yaw = 0; syncUI(); poseAll(); }
    } else if (k === 'spin'){ if (red){ P.spin = (P.spin + rad(30)) % (2 * Math.PI); poseAll(); return; } A.spin = !A.spin; }
    else if (k === 'wheels'){ if (red){ P.wheel = (P.wheel + rad(30)) % (2 * Math.PI); poseAll(); return; } A.wheels = !A.wheels; }
    else if (k === 'breakdown'){ A.bdTo = A.bdTo === 1 ? 0 : 1; if (red){ setBreakdown(A.bdTo); } }
    syncBtns(); kick();
  }));
  if (reduce()) $$('button[data-fanim]').forEach(b => { const t = {demo:'Demo controls: next pose', spin:'Turn props 30\u00b0', wheels:'Turn wheels 30\u00b0'}[b.dataset.fanim]; if (t) b.textContent = t; b.removeAttribute('aria-pressed'); });
  $$('button[data-fgroup]').forEach(b => b.addEventListener('click', () => { S.groups[b.dataset.fgroup] = !S.groups[b.dataset.fgroup]; applyStyles(); }));
  $$('button[data-fview]').forEach(b => b.addEventListener('click', () => view(b.dataset.fview)));
  wrap.addEventListener('click', e => {
    const b = e.target.closest('button[data-fact]'); if (!b) return;
    if (b.dataset.fact === 'focus'){ S.focus = !S.focus; applyStyles(); }
    if (b.dataset.fact === 'reset'){ stopAll(); P.roll = P.pitch = P.yaw = 0; P.spin = P.wheel = 0; P.bd = 0; A.bdTo = 0; for (const k in P.slide) P.slide[k] = 0; syncUI(); poseAll(); syncBtns();
      S.focus = false; S.sel = null; for (const k in S.groups) S.groups[k] = true; showCard(null); applyStyles(); view('iso'); }
  });
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas); else addEventListener('resize', resize);
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyStyles);
  new MutationObserver(applyStyles).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
  resize(); view('iso', true); showCard(null); applyStyles(); poseAll(); syncBtns();
  // test hook: set joints and the camera from a script (used by the headless screenshots)
  const test = {
    pose(o){ stopAll(); P.roll = P.pitch = P.yaw = P.spin = P.wheel = 0; for (const k of ['roll', 'pitch', 'yaw', 'spin', 'wheel']) if (o[k] !== undefined) P[k] = o[k]; for (const k in (o.slide || {})) P.slide[k] = o.slide[k]; syncUI(); poseAll(); syncBtns(); },
    breakdown(t){ stopAll(); setBreakdown(t); A.bdTo = t; syncBtns(); },
    cam(pos, tgt){ camera.position.set(...pos); controls.target.set(...tgt); controls.update(); kick(); },
    focus(id, dist){ const o = byMoving[id]; if (!o) return; o.grp.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(o.mesh), c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() / 2; const d = new THREE.Vector3(...(dist || [-0.6, 0.8, 0.9])).normalize().multiplyScalar(r * 3.2); camera.position.copy(c).add(d); controls.target.copy(c); controls.update(); kick(); },
    P, A, byMoving, anyAnim,
    world(id){ const o = byMoving[id]; o.grp.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(o.mesh); return [b.min.toArray(), b.max.toArray()]; }
  };
  return { refresh(){ resize(); applyStyles(); kick(); }, select, state: S, objs: objs.length, test };
}
