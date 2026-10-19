/* Inventory 3D model: extends review/src/cadviewer.js (same SOLIDWORKS part meshes, three.js r128 + OrbitControls).
   Added: colour by inventory status, click-a-part inventory card, kit isolation, smooth 0-100 % explode slider.
   Frame is the SOLIDWORKS one: X forward, Y up, Z right; metres.
   M = MESH (review/mesh.mjs); INVP = { PartName: {sc, kits, rows:[inventory rows]} } built from inventory/inventory.json. */
function Viewer3D(wrap, M, INVP, KITS){
  const $ = s => wrap.querySelector(s), $$ = s => Array.from(wrap.querySelectorAll(s));
  const canvas = $('canvas'), tip = $('.tip');
  const card = document.getElementById(wrap.dataset.card), legend = $('.legend');
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof THREE === 'undefined' || !THREE.OrbitControls){
    $('.fallback').hidden = false; canvas.hidden = true; return null;
  }
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.12; controls.screenSpacePanning = true;
  controls.minDistance = 0.4; controls.maxDistance = 12;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9099, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.75); key.position.set(2.5, 4, 3); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.3); fill.position.set(-3, 1.5, -2.5); scene.add(fill);

  const dec = (s, T) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new T(u.buffer); };
  // normals averaged only across faces within 30 deg, so aerofoils shade smoothly and edges stay crisp
  function creased(pos, idx){
    const nt = idx.length / 3, fn = new Float32Array(nt * 3), adj = Array.from({length: pos.length / 3}, () => []);
    for (let t = 0; t < nt; t++){
      const a = idx[3*t]*3, b = idx[3*t+1]*3, c = idx[3*t+2]*3;
      const ux = pos[b]-pos[a], uy = pos[b+1]-pos[a+1], uz = pos[b+2]-pos[a+2], vx = pos[c]-pos[a], vy = pos[c+1]-pos[a+1], vz = pos[c+2]-pos[a+2];
      fn[3*t] = uy*vz-uz*vy; fn[3*t+1] = uz*vx-ux*vz; fn[3*t+2] = ux*vy-uy*vx;
      for (let k = 0; k < 3; k++) adj[idx[3*t+k]].push(t);
    }
    const unit = new Float32Array(nt * 3);
    for (let t = 0; t < nt; t++){ const l = Math.hypot(fn[3*t], fn[3*t+1], fn[3*t+2]) || 1; unit[3*t] = fn[3*t]/l; unit[3*t+1] = fn[3*t+1]/l; unit[3*t+2] = fn[3*t+2]/l; }
    const P = new Float32Array(nt * 9), N = new Float32Array(nt * 9), cosA = Math.cos(30 * Math.PI / 180);
    for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++){
      const v = idx[3*t+k]; let x = 0, y = 0, z = 0;
      for (const f of adj[v]) if (unit[3*f]*unit[3*t] + unit[3*f+1]*unit[3*t+1] + unit[3*f+2]*unit[3*t+2] > cosA){ x += fn[3*f]; y += fn[3*f+1]; z += fn[3*f+2]; }
      const l = Math.hypot(x, y, z) || 1, o = 9*t + 3*k;
      P[o] = pos[3*v]; P[o+1] = pos[3*v+1]; P[o+2] = pos[3*v+2]; N[o] = x/l; N[o+1] = y/l; N[o+2] = z/l;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    return g;
  }

  const SHELL = /^(Wing_Panel|Aileron|Wing_Saddle|Fuselage_Pod|Canopy|H_Tail|Elevator|Fin)/;   // foam and skin, faded in X-ray
  const METAL = /^(Boom|Spar|Wing_Joiner|Wing_Bolt|Pitot)/;
  const lineMat = new THREE.LineBasicMaterial({transparent:true, opacity:0.3});
  const geo = {}, mats = {}, edges = {}, cadCol = {};
  for (const [name, p] of Object.entries(M.parts)){
    const pos = dec(p.v, Float32Array), idx = dec(p.i, p.w === 4 ? Uint32Array : Uint16Array);
    geo[name] = creased(pos, idx);
    const ig = new THREE.BufferGeometry(); ig.setAttribute('position', new THREE.BufferAttribute(pos, 3)); ig.setIndex(new THREE.BufferAttribute(idx, 1));
    edges[name] = new THREE.EdgesGeometry(ig, 28);
    cadCol[name] = new THREE.Color().setRGB(p.c[0], p.c[1], p.c[2]).convertSRGBToLinear();
    mats[name] = new THREE.MeshStandardMaterial({color:cadCol[name].clone(), roughness: METAL.test(name) ? 0.38 : 0.62, metalness: METAL.test(name) ? 0.55 : 0.04,
      side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:1, polygonOffsetUnits:1});
  }
  const model = new THREE.Group(); scene.add(model);
  const items = [];
  for (const [name, x, y, z] of M.comps){
    const g = new THREE.Group(); g.position.set(x, y, z);
    const mesh = new THREE.Mesh(geo[name], mats[name]); mesh.userData.part = name; g.add(mesh);
    const ln = new THREE.LineSegments(edges[name], lineMat); g.add(ln);
    model.add(g); items.push({g, mesh, ln, home: new THREE.Vector3(x, y, z), name});
  }
  const box = new THREE.Box3().setFromObject(model), centre = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const radius = size.length() / 2;
  // exploded offsets: each part moves away from the assembly centre along its own centre direction (vertical spread exaggerated)
  for (const it of items){
    const c = new THREE.Box3().setFromObject(it.g).getCenter(new THREE.Vector3()).sub(centre);
    c.y *= 2.4; c.x *= 0.5; c.z *= 0.45; it.dir = c;
  }
  const grid = new THREE.GridHelper(3.2, 16); grid.position.set(centre.x, box.min.y - 0.002, centre.z); scene.add(grid);

  // ---- state ----
  const S = {colour:'cad', xray:false, edges:true, kit:'All', sel:null, ex:0, exTo:0};
  const SC_VAR = {ok:'--ok', warn:'--warn', make:'--c1', open:'--open', bad:'--bad', none:'--line-3'};
  const SC_LABEL = {warn:'To order', make:'To make', open:'Hold / proposed (NWA)', bad:'To source', ok:'On hand', none:'No inventory row'};
  const partSC = n => (INVP[n] && INVP[n].sc) || 'none';
  const inKit = n => S.kit === 'All' || (INVP[n] && INVP[n].kits.includes(S.kit));
  const faded = n => (S.xray && SHELL.test(n)) || !inKit(n);   // not pickable, not outlined

  function applyStyles(){
    const acc = css('--accent') || '#b8481b';
    for (const [n, m] of Object.entries(mats)){
      if (S.colour === 'inv') m.color.set(css(SC_VAR[partSC(n)]) || '#888888').convertSRGBToLinear(); else m.color.copy(cadCol[n]);
      let op = 1;
      if (S.xray && SHELL.test(n)) op = Math.min(op, 0.16);
      if (!inKit(n)) op = Math.min(op, 0.1);
      if (S.sel && S.sel !== n) op = Math.min(op, 0.25);
      const sel = S.sel === n;
      m.transparent = op < 1; m.opacity = op; m.depthWrite = op >= 0.99;
      m.emissive.set(sel ? acc : '#000000'); m.emissiveIntensity = sel ? 0.5 : 0;
      m.needsUpdate = true;
    }
    for (const it of items) it.ln.visible = S.edges && !faded(it.name);
    legend && (legend.hidden = S.colour !== 'inv');
    kick();
  }
  function theme(){
    lineMat.color.set(css('--fg') || '#16191d');
    const gm = Array.isArray(grid.material) ? grid.material : [grid.material];
    gm.forEach(m => { m.color.set(css('--line-2') || '#cbcfd4'); m.transparent = true; m.opacity = 0.45; });
    applyStyles();
  }

  // ---- views and animation ----
  const VIEWS = { iso:[0.95, 0.62, 1.0], top:[-0.001, 1, 0], side:[0, 0.02, 1], front:[1, 0.06, 0] };
  let tween = null, need = true, running = false, interacting = false;
  function kick(){ need = true; if (!running){ running = true; requestAnimationFrame(loop); } }
  function view(name, instant){
    const d = new THREE.Vector3(...VIEWS[name]).normalize();
    const v = camera.fov * Math.PI / 360, h = Math.atan(Math.tan(v) * camera.aspect);
    const fovFit = radius / Math.sin(Math.min(v, h)) * 0.7;
    const to = centre.clone().add(d.multiplyScalar(fovFit));
    if (instant || reduce()){ camera.position.copy(to); controls.target.copy(centre); controls.update(); kick(); return; }
    tween = {t0: performance.now(), p0: camera.position.clone(), q0: controls.target.clone(), p1: to, q1: centre.clone()}; kick();
  }
  function resize(){
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); kick();
  }
  controls.addEventListener('change', kick);
  controls.addEventListener('start', () => { interacting = true; kick(); });
  controls.addEventListener('end', () => { interacting = false; kick(); });
  // renders on demand: the loop stops when nothing moves and restarts on input (kick)
  function loop(now){
    if (!canvas.offsetParent){ running = false; return; }   // section hidden
    let active = false;
    if (tween){ active = true;
      const u = Math.min(1, (now - tween.t0) / 450), e = u < 0.5 ? 2*u*u : 1 - Math.pow(-2*u + 2, 2) / 2;
      camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.q0, tween.q1, e);
      if (u >= 1) tween = null; need = true;
    }
    if (S.ex !== S.exTo){
      // critically damped approach: smooth for both slider drags and button resets, snaps when close or when motion is reduced
      S.ex = reduce() || Math.abs(S.exTo - S.ex) < 0.0015 ? S.exTo : S.ex + (S.exTo - S.ex) * 0.18;
      const e = S.ex * S.ex * (3 - 2 * S.ex), f = e * 0.6;
      for (const it of items) it.g.position.copy(it.home).addScaledVector(it.dir, f);
      need = true; active = true;
    }
    if (controls.update()){ need = true; active = true; }
    if (need){ renderer.render(scene, camera); need = false; }
    if (active || interacting) requestAnimationFrame(loop); else running = false;
  }

  // ---- inventory card ----
  const txt = (tag, t, cls) => { const e = document.createElement(tag); e.textContent = t; if (cls) e.className = cls; return e; };
  const nice = n => n.replace(/_/g, ' ');
  const money = v => '$' + Number(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  function chip(r){ return txt('span', r.status, 'chip ' + r.sc); }
  function showCard(name){
    if (!card) return;
    card.replaceChildren();
    if (!name){
      card.appendChild(txt('h3', 'Part card'));
      card.appendChild(txt('p', 'Click or tap a part to see its inventory line: IDs, type, quantities, status, vendor or stock, process and kit. Hover shows the name. Parts of other kits fade when a kit is isolated.', 'small'));
      return;
    }
    const p = M.parts[name], inv = INVP[name];
    const head = document.createElement('div'); head.className = 'ph';
    head.appendChild(txt('h3', nice(name)));
    const x = txt('button', 'Clear'); x.type = 'button'; x.setAttribute('aria-label', 'Clear selected part'); x.addEventListener('click', () => api.selectPart(null));
    head.appendChild(x); card.appendChild(head);
    card.appendChild(txt('p', p.d, 'small'));
    const inst = items.filter(i => i.name === name).length;
    card.appendChild(txt('p', 'Instances in the model: ' + inst, 'small'));
    if (!inv){ card.appendChild(txt('p', 'No inventory row maps to this part: it is not tracked as a stock line.', 'small')); return; }
    for (const r of inv.rows){
      const b = document.createElement('div'); b.className = 'pr';
      const t = document.createElement('div'); t.className = 'pt';
      t.appendChild(txt('b', r.id, 'mono')); t.appendChild(txt('span', r.type === 'NWA' ? 'NWA (free, proposed)' : r.type)); t.appendChild(chip(r)); b.appendChild(t);
      b.appendChild(txt('p', r.item, 'pi'));
      const dl = document.createElement('dl'); dl.className = 'kv';
      const add = (k, v) => { dl.appendChild(txt('dt', k)); dl.appendChild(txt('dd', v)); };
      add('Kit', r.kit + (KITS[r.kit] ? ' ' + KITS[r.kit] : ''));
      add('Qty needed / on hand', r.qty + ' / ' + r.onhand);
      if (r.type === 'Make'){ add('Made from', r.madeFrom || '—'); add('Process', r.process || '—'); }
      else { add('Vendor', r.vendor || '—'); add('Ext. cost', r.type === 'NWA' ? '$0.00 (EST: if free)' : money(r.ext)); }
      b.appendChild(dl);
      const go = txt('button', 'Find in inventory table'); go.type = 'button'; go.className = 'linkbtn'; go.dataset.find = r.id; b.appendChild(go);
      card.appendChild(b);
    }
  }

  // ---- part names on hover / picking ----
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let downAt = null, hoverT = 0;
  const meshes = items.map(i => i.mesh);
  function hit(e){
    const r = canvas.getBoundingClientRect(); ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const h = ray.intersectObjects(meshes, false).find(h => !faded(h.object.userData.part));
    return h ? h.object.userData.part : null;
  }
  function hover(e){
    const n = hit(e); if (!n){ tip.hidden = true; return; }
    tip.replaceChildren(txt('b', nice(n)), txt('span', M.parts[n].d + ' · ' + SC_LABEL[partSC(n)]));
    tip.hidden = false;
  }
  canvas.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse' || e.buttons) return; const t = performance.now(); if (t - hoverT < 60) return; hoverT = t; hover(e); });
  canvas.addEventListener('pointerleave', () => tip.hidden = true);
  canvas.addEventListener('pointerdown', e => downAt = [e.clientX, e.clientY]);
  canvas.addEventListener('pointerup', e => {
    if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5){ const n = hit(e); api.selectPart(n === S.sel ? null : n); tip.hidden = true; }
    downAt = null; });

  // ---- UI wiring: every control lives in the .ctl bar; state is mirrored with aria-pressed ----
  const press = (b, on) => b.setAttribute('aria-pressed', on ? 'true' : 'false');
  const sync = () => {
    $$('[data-colour]').forEach(b => press(b, b.dataset.colour === S.colour));
    $$('[data-kit]').forEach(b => press(b, b.dataset.kit === S.kit));
    const x = $('[data-act="xray"]'), e = $('[data-act="edges"]'); x && press(x, S.xray); e && press(e, S.edges);
    const sl = $('input[data-explode]'), out = $('output[data-explode]');
    if (sl){ sl.value = Math.round(S.exTo * 100); sl.setAttribute('aria-valuetext', sl.value + ' %'); } if (out) out.textContent = Math.round(S.exTo * 100) + ' %';
  };
  $$('[data-colour]').forEach(b => b.addEventListener('click', () => { S.colour = b.dataset.colour; sync(); applyStyles(); }));
  $$('[data-kit]').forEach(b => b.addEventListener('click', () => { S.kit = b.dataset.kit; if (S.sel && !inKit(S.sel)) api.selectPart(null); sync(); applyStyles(); }));
  $$('[data-cview]').forEach(b => b.addEventListener('click', () => view(b.dataset.cview)));
  $('[data-act="xray"]').addEventListener('click', () => { S.xray = !S.xray; sync(); applyStyles(); });
  $('[data-act="edges"]').addEventListener('click', () => { S.edges = !S.edges; sync(); applyStyles(); });
  $('[data-act="reset"]').addEventListener('click', () => { S.colour = 'cad'; S.xray = false; S.edges = true; S.kit = 'All'; S.exTo = 0; api.selectPart(null); sync(); applyStyles(); view('iso'); kick(); });
  $('input[data-explode]').addEventListener('input', e => { S.exTo = e.target.value / 100; sync(); kick(); });
  if (legend){
    const cnt = {}; Object.keys(M.parts).forEach(n => cnt[partSC(n)] = (cnt[partSC(n)] || 0) + 1);
    ['warn','make','open','bad','ok','none'].forEach(k => { const li = document.createElement('span'); li.className = 'lg';
      const sw = document.createElement('i'); sw.className = 'sw ' + k; li.appendChild(sw); li.appendChild(document.createTextNode(SC_LABEL[k] + ' (' + (cnt[k] || 0) + ')')); legend.appendChild(li); });
  }

  const api = {
    view: n => view(n),
    selectPart(name){
      S.sel = name && M.parts[name] ? name : null;
      if (S.sel && !inKit(S.sel)){ S.kit = 'All'; sync(); }
      showCard(S.sel);
      wrap.dispatchEvent(new CustomEvent('partselect', {detail: S.sel}));
      applyStyles();
    },
    refresh(){ resize(); kick(); }
  };
  new ResizeObserver(resize).observe(canvas);
  new MutationObserver(theme).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme);
  card && card.addEventListener('click', e => { const f = e.target.closest('[data-find]'); if (f) wrap.dispatchEvent(new CustomEvent('findrow', {detail: f.dataset.find})); });
  showCard(null); sync(); theme(); resize(); view('iso', true); kick();
  return api;
}
