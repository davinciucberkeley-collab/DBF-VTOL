/* Inventory 3D model: extends review/src/cadviewer.js (same SOLIDWORKS part meshes, three.js r128 + OrbitControls).
   Added: colour by inventory status, click-a-part inventory card, kit isolation, smooth 0-100 % explode slider.
   Electrical layers (EL = components, wires, gear from inventory/electrical/*.json, all EST, not in the SOLIDWORKS model):
   component envelopes that follow their parent CAD part when exploded, wire tubes (hidden while exploded), and proposed wheels.
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
  const grid = new THREE.GridHelper(3.2, 16); const gridY0 = box.min.y - 0.002; grid.position.set(centre.x, gridY0, centre.z); scene.add(grid);

  // ---- electrical layer: one envelope per component, attached to the nearest instance of its parent CAD part ----
  const E = (typeof EL !== 'undefined' && EL) || {comps:[], wires:[], wcats:[], ccats:[], gear:null};
  const CC_VAR = {power:'--c3', fc:'--c1', esc:'--c4', servo:'--c2', conn:'--c6'};
  const WC_VAR = {pwr:'--w-pos', gnd:'--w-gnd', phase:'--c6', dshot:'--c1', pwm:'--c3', i2c:'--c2', uart:'--c4', air:'--c5'};
  const parentItem = (p) => {
    const v = new THREE.Vector3(p.x, p.y, p.z);
    for (const n of [p.parent, p.parent.replace(/_[LR]$/, '')]){
      const c = items.filter(i => i.name === n);
      if (c.length) return c.reduce((a, b) => a.home.distanceToSquared(v) <= b.home.distanceToSquared(v) ? a : b);
    }
    return null;
  };
  const elObjs = [], elGroup = new THREE.Group(); scene.add(elGroup);
  for (const c of E.comps){
    const d = c.dims; let g;
    if (d && d.length === 3) g = new THREE.BoxGeometry(d[0]/1000, d[2]/1000, d[1]/1000);
    else if (d && d.length === 2){ g = new THREE.CylinderGeometry(d[0]/2000, d[0]/2000, d[1]/1000, 20); g.rotateZ(Math.PI / 2); }
    else if (c.cat === 'power') g = new THREE.BoxGeometry(0.012, 0.012, 0.012);   // capacitor marker (no dimensions in the data)
    else g = new THREE.BoxGeometry(0.024, 0.024, 0.024);                          // joint marker
    const grp = new THREE.Group(), m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({color:0x888888, roughness:0.55, metalness:0.1})); m.userData = {kind:'el', id:c.id}; grp.add(m);
    const ln = new THREE.LineSegments(new THREE.EdgesGeometry(g), lineMat); grp.add(ln);
    const it = parentItem(c.pl), rel = new THREE.Vector3(c.pl.x, c.pl.y, c.pl.z);
    if (it) rel.sub(it.home);
    grp.position.set(c.pl.x, c.pl.y, c.pl.z); elGroup.add(grp);
    elObjs.push({id:c.id, c, g:grp, mesh:m, ln, it, rel, own:new THREE.Vector3(c.pl.x, c.pl.y, c.pl.z)});
  }

  // ---- wires: thin tubes through the route points; power pairs are two tubes (red above, gray below) ----
  const wireGroup = new THREE.Group(); scene.add(wireGroup); const wireObjs = [];
  const tube = (pts, r, cat, id, key) => {
    const path = new THREE.CurvePath();
    for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i-1], pts[i]));
    const g = new THREE.TubeGeometry(path, Math.max(8, pts.length * 6), r, 5, false);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color:0x888888})); m.userData = {kind:'wire', id, key, cat}; wireGroup.add(m);
    // invisible fatter tube so a 2 mm wire is clickable: materials with visible=false are not drawn but are still raycast
    const pk = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(8, pts.length * 6), 0.007, 4, false), new THREE.MeshBasicMaterial({visible:false})); pk.userData = {kind:'wire', id}; wireGroup.add(pk); m.userData.pk = pk; return m;
  };
  for (const w of E.wires){
    const pts = []; for (const q of w.route){ const v = new THREE.Vector3(q[0], q[1], q[2]); if (!pts.length || v.distanceTo(pts[pts.length-1]) > 1e-6) pts.push(v); }
    if (pts.length < 2) continue;
    const ms = w.pair ? [tube(pts.map(p => p.clone().add(new THREE.Vector3(0, 0.0025, 0))), 0.0022, 'pwr', w.id, 'pwr'), tube(pts.map(p => p.clone().add(new THREE.Vector3(0, -0.0025, 0))), 0.0022, 'gnd', w.id, 'gnd')]
      : [tube(pts, w.cat === 'phase' ? 0.0026 : 0.0017, w.cat, w.id, w.cat)];
    wireObjs.push({id:w.id, w, ms});
  }

  // ---- proposed wheels: one per Landing_Leg, axis along Z (rolls along X); follow the leg when exploded ----
  const G = E.gear, wheelGroup = new THREE.Group(); scene.add(wheelGroup); const wheelObjs = [];
  const wheelMat = new THREE.MeshStandardMaterial({color:0x6a5acd, roughness:0.7, metalness:0.05}), axleMat = new THREE.MeshStandardMaterial({color:0x999999, roughness:0.4, metalness:0.6});
  if (G) for (const leg of items.filter(i => i.name === 'Landing_Leg')){
    const wg = new THREE.Group();
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(G.D / 2, G.D / 2, G.widthDraw, 40), wheelMat); wheel.rotation.x = Math.PI / 2; wheel.userData = {kind:'wheel', id:'wheel'};
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.0020, 0.0020, G.axleL, 12), axleMat); axle.rotation.x = Math.PI / 2; axle.userData = {kind:'wheel', id:'wheel'};
    const blk = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.016, 0.03), wheelMat); blk.position.y = (G.D / 2 - G.drop) / 2 + 0.004; blk.userData = {kind:'wheel', id:'wheel'};
    wg.add(wheel, axle, blk);
    const rel = new THREE.Vector3(0, -G.drop + G.D / 2, 0); wg.position.copy(leg.home).add(rel); wheelGroup.add(wg);
    wheelObjs.push({g:wg, it:leg, rel, parts:[wheel, axle, blk]});
  }

  // ---- state ----
  const S = {colour:'cad', xray:false, edges:true, kit:'All', sel:null, ex:0, exTo:0, el:true, wires:true, gear:'wheels', selEl:null, selWire:null, selWheel:false};
  const SC_VAR = {ok:'--ok', warn:'--warn', make:'--c1', open:'--open', bad:'--bad', none:'--line-3'};
  const SC_LABEL = {warn:'To order', make:'To make', open:'Hold / proposed (NWA)', bad:'To source', ok:'On hand', none:'No inventory row'};
  const partSC = n => (INVP[n] && INVP[n].sc) || 'none';
  const inKit = n => S.kit === 'All' || (INVP[n] && INVP[n].kits.includes(S.kit));
  const faded = n => (S.xray && SHELL.test(n)) || !inKit(n);   // not pickable, not outlined
  const elFaded = e => !inKitEl(e);
  const inKitEl = e => S.kit === 'All' || e.c.kit === S.kit;
  const seeThrough = () => S.el || S.wires;

  function applyStyles(){
    const acc = css('--accent') || '#b8481b';
    for (const [n, m] of Object.entries(mats)){
      if (S.colour === 'inv') m.color.set(css(SC_VAR[partSC(n)]) || '#888888').convertSRGBToLinear(); else m.color.copy(cadCol[n]);
      let op = 1;
      if (S.xray && SHELL.test(n)) op = Math.min(op, 0.16);
      else if (seeThrough() && SHELL.test(n)) op = Math.min(op, 0.3);   // shells see-through so the electronics inside show
      if (!inKit(n)) op = Math.min(op, 0.1);
      if (S.sel && S.sel !== n) op = Math.min(op, 0.25);
      else if (!S.sel && (S.selEl || S.selWire || S.selWheel)) op = Math.min(op, 0.55);
      const sel = S.sel === n;
      m.transparent = op < 1; m.opacity = op; m.depthWrite = op >= 0.99;
      m.emissive.set(sel ? acc : '#000000'); m.emissiveIntensity = sel ? 0.5 : 0;
      m.needsUpdate = true;
    }
    for (const it of items) it.ln.visible = S.edges && !faded(it.name);
    legend && (legend.hidden = S.colour !== 'inv');
    for (const e of elObjs){
      const f = elFaded(e), sel = S.selEl === e.id, m = e.mesh.material;
      e.g.visible = S.el; e.ln.visible = S.edges && !f;
      m.color.set(css(CC_VAR[e.c.cat]) || '#888888').convertSRGBToLinear();
      m.transparent = f; m.opacity = f ? 0.1 : 1; m.depthWrite = !f;
      m.emissive.set(sel ? acc : '#000000'); m.emissiveIntensity = sel ? 0.6 : 0;
    }
    for (const w of wireObjs) for (const m of w.ms){
      m.material.color.set(css(WC_VAR[m.userData.key]) || '#888888').convertSRGBToLinear();
      if (S.selWire === w.id) m.material.color.set(acc).convertSRGBToLinear();
    }
    wheelMat.color.set(css('--open') || '#6a5acd').convertSRGBToLinear(); axleMat.color.set(css('--line-3') || '#999999').convertSRGBToLinear();
    wheelMat.emissive.set(S.selWheel ? acc : '#000000'); wheelMat.emissiveIntensity = S.selWheel ? 0.5 : 0;
    wireGroup.visible = S.wires && S.ex < 0.004;
    wheelGroup.visible = S.gear === 'wheels';
    grid.position.y = gridY0 - (S.gear === 'wheels' && G ? G.drop : 0);
    renderLegend();
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
  function followParents(){
    for (const e of elObjs){ if (e.it) e.g.position.copy(e.it.g.position).add(e.rel); }
    for (const w of wheelObjs) w.g.position.copy(w.it.g.position).add(w.rel);
  }
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
      followParents();
      wireGroup.visible = S.wires && S.ex < 0.004;
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
      card.appendChild(txt('p', 'Click or tap a part to see its inventory line: IDs, type, quantities, status, vendor or stock, process and kit. Click an electronic component, a wire or a wheel for its details. Hover shows the name. Parts of other kits fade when a kit is isolated.', 'small'));
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
      t.appendChild(txt('b', r.id, 'mono')); t.appendChild(txt('span', r.type === 'NWA' ? 'NWA (sponsor offer, verbal)' : r.type === 'Proposed' ? 'Proposed (not committed)' : r.type)); t.appendChild(chip(r)); b.appendChild(t);
      b.appendChild(txt('p', r.item, 'pi'));
      const dl = document.createElement('dl'); dl.className = 'kv';
      const add = (k, v) => { dl.appendChild(txt('dt', k)); dl.appendChild(txt('dd', v)); };
      add('Kit', r.kit + (KITS[r.kit] ? ' ' + KITS[r.kit] : ''));
      add('Qty needed / on hand', r.qty + ' / ' + r.onhand);
      if (r.type === 'Make'){ add('Made from', r.madeFrom || '—'); add('Process', r.process || '—'); }
      else { add('Vendor', r.vendor || '—'); add('Ext. cost', r.type === 'NWA' ? '$0.00 (EST: if free)' : r.type === 'Proposed' ? money(r.ext) + ' (not in committed spend)' : money(r.ext)); }
      b.appendChild(dl);
      const go = txt('button', 'Find in inventory table'); go.type = 'button'; go.className = 'linkbtn'; go.dataset.find = r.id; b.appendChild(go);
      card.appendChild(b);
    }
  }

  const kvCard = (title, est, rowsKv, extra) => {
    card.replaceChildren();
    const head = document.createElement('div'); head.className = 'ph'; const h3 = txt('h3', title); if (est){ h3.appendChild(txt('span', 'EST', 'est')); } head.appendChild(h3);
    const x = txt('button', 'Clear'); x.type = 'button'; x.setAttribute('aria-label', 'Clear selection'); x.addEventListener('click', () => api.clear()); head.appendChild(x); card.appendChild(head);
    const dl = document.createElement('dl'); dl.className = 'kv';
    for (const [k, v] of rowsKv){ dl.appendChild(txt('dt', k)); dl.appendChild(txt('dd', v === null || v === undefined || v === '' ? '—' : String(v))); }
    card.appendChild(dl); if (extra) extra(card);
  };
  const findBtn = (id, label) => { const b = txt('button', label || 'Find in inventory table'); b.type = 'button'; b.className = 'linkbtn'; b.dataset.find = id; return b; };
  function showEl(id){
    const e = elObjs.find(o => o.id === id); if (!e) return; const c = e.c;
    kvCard(c.id + ' ' + c.name.split(/[,(:]/)[0], c.est, [
      ['Component', c.name], ['Inventory line', c.bom ? c.bom + (c.hasRow ? '' : ' (not in the sheet snapshot)') : '— (no inventory line)'], ['Qty', c.qty],
      ['Dimensions', c.dims ? (c.dims.length === 3 ? c.dims.join(' × ') + ' mm (L × W × H, EST box)' : 'Ø ' + c.dims[0] + ' × ' + c.dims[1] + ' mm') : '— (drawn as a marker)'],
      ['Mass', c.mass === null || c.mass === undefined ? '—' : c.mass + ' g'], ['Supply', c.supply], ['Interfaces', c.ifc],
      ['Placement', c.pl.x.toFixed(3) + ', ' + c.pl.y.toFixed(3) + ', ' + c.pl.z.toFixed(3) + ' m on ' + c.pl.parent.replace(/_/g, ' ') + ' (EST)'], ['Placement note', c.pl.note],
      ['Dimension note', c.dn], ['Mass note', c.mn], ['Source', c.srcTxt]],
    k => { const row = document.createElement('div'); row.className = 'pbtns'; if (c.bom && c.hasRow) row.appendChild(findBtn(c.bom, 'Find ' + c.bom + ' in inventory table')); k.appendChild(row); });
  }
  function showWire(id){
    const w = (E.wires.find(o => o.id === id)); if (!w) return;
    kvCard(w.id + ' ' + w.fn.split(/[(;]/)[0].trim(), true, [
      ['Function', w.fn], ['From → to', w.from + ' → ' + w.to], ['Gauge', w.gauge ? w.gauge + ' AWG' : '—'], ['Colour', w.colour], ['Connectors', w.conn],
      ['Joints', w.joint.length ? w.joint.join(', ') : '—'], ['Length (EST)', w.len + ' m'], ['Current max', w.cur === null || w.cur === undefined ? '—' : w.cur + ' A'], ['Zone', w.zone], ['Source', w.source]]);
  }
  function showWheel(){
    kvCard('Proposed wheel', true, [
      ['Status', 'a proposal, not in the SOLIDWORKS model'], ['Wheel', G.wheelItem], ['Diameter', (G.D * 1000).toFixed(1) + ' mm'], ['Width', '— (not published on the pages read; drawn at ' + (G.widthDraw * 1000) + ' mm for display only)'],
      ['Axle length', (G.axleL * 1000).toFixed(1) + ' mm'], ['Mass per wheel', G.mass_g + ' g'], ['Ground plane', '+' + (G.drop * 1000).toFixed(0) + ' mm lower (grid moves down)']].concat(G.rows.map(r => [r.q, r.before + ' → ' + r.after])),
    k => { const row = document.createElement('div'); row.className = 'pbtns'; for (const id of G.wheelRowIds) row.appendChild(findBtn(id, id)); k.appendChild(row); });
  }

  // ---- part names on hover / picking ----
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let downAt = null, hoverT = 0;
  function pickables(){
    const l = items.filter(i => !faded(i.name)).map(i => i.mesh);
    if (S.el) for (const e of elObjs) if (!elFaded(e)) l.push(e.mesh);
    if (S.wires && wireGroup.visible) for (const w of wireObjs) for (const m of w.ms) l.push(m.userData.pk);
    if (S.gear === 'wheels') for (const w of wheelObjs) l.push(...w.parts);
    return l;
  }
  // returns {kind:'part'|'el'|'wire'|'wheel', id}; a see-through shell never hides an electronic part or wire behind it
  function hit(e){
    const r = canvas.getBoundingClientRect(); ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hs = ray.intersectObjects(pickables(), false); if (!hs.length) return null;
    const kindOf = h => h.object.userData.kind || 'part';
    let h = hs[0];
    if (kindOf(h) === 'part' && SHELL.test(h.object.userData.part)){ const o = hs.find(x => kindOf(x) !== 'part'); if (o) h = o; }
    const d = h.object.userData; return d.part ? {kind:'part', id:d.part} : {kind:d.kind, id:d.id};
  }
  function hover(e){
    const n = hit(e); if (!n){ tip.hidden = true; return; }
    if (n.kind === 'part') tip.replaceChildren(txt('b', nice(n.id)), txt('span', M.parts[n.id].d + ' · ' + SC_LABEL[partSC(n.id)]));
    else if (n.kind === 'el'){ const c = elObjs.find(o => o.id === n.id).c; tip.replaceChildren(txt('b', c.id), txt('span', c.name.split(/[,(:]/)[0] + ' · EST envelope, not in the CAD model')); }
    else if (n.kind === 'wire'){ const w = E.wires.find(o => o.id === n.id); tip.replaceChildren(txt('b', w.id + ' · ' + (w.gauge ? w.gauge + ' AWG' : 'gauge —') + ' · ' + w.colour), txt('span', w.from + ' → ' + w.to + ' · ' + w.len + ' m EST · ' + (w.cur === null || w.cur === undefined ? '— A' : w.cur + ' A max'))); }
    else tip.replaceChildren(txt('b', 'Proposed wheel'), txt('span', 'a proposal, not in the SOLIDWORKS model'));
    tip.hidden = false;
  }
  canvas.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse' || e.buttons) return; const t = performance.now(); if (t - hoverT < 60) return; hoverT = t; hover(e); });
  canvas.addEventListener('pointerleave', () => tip.hidden = true);
  canvas.addEventListener('pointerdown', e => downAt = [e.clientX, e.clientY]);
  canvas.addEventListener('pointerup', e => {
    if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5){ const n = hit(e); api.pick(n); tip.hidden = true; }
    downAt = null; });

  // ---- UI wiring: every control lives in the .ctl bar; state is mirrored with aria-pressed ----
  const lgEl = document.getElementById('v3dEl');
  const press = (b, on) => b.setAttribute('aria-pressed', on ? 'true' : 'false');
  const sync = () => {
    $$('[data-layer]').forEach(b => press(b, b.dataset.layer === 'el' ? S.el : S.wires));
    $$('[data-gear]').forEach(b => press(b, b.dataset.gear === S.gear));
    $$('[data-colour]').forEach(b => press(b, b.dataset.colour === S.colour));
    $$('[data-kit]').forEach(b => press(b, b.dataset.kit === S.kit));
    const x = $('[data-act="xray"]'), e = $('[data-act="edges"]'); x && press(x, S.xray); e && press(e, S.edges);
    const sl = $('input[data-explode]'), out = $('output[data-explode]');
    if (sl){ sl.value = Math.round(S.exTo * 100); sl.setAttribute('aria-valuetext', sl.value + ' %'); } if (out) out.textContent = Math.round(S.exTo * 100) + ' %';
  };
  $$('[data-colour]').forEach(b => b.addEventListener('click', () => { S.colour = b.dataset.colour; sync(); applyStyles(); }));
  $$('[data-kit]').forEach(b => b.addEventListener('click', () => { S.kit = b.dataset.kit; if (S.sel && !inKit(S.sel)) api.selectPart(null); sync(); applyStyles(); }));
  $$('[data-layer]').forEach(b => b.addEventListener('click', () => { if (b.dataset.layer === 'el'){ S.el = !S.el; if (!S.el && S.selEl) api.clear(); } else { S.wires = !S.wires; if (!S.wires && S.selWire) api.clear(); } sync(); applyStyles(); }));
  $$('[data-gear]').forEach(b => b.addEventListener('click', () => { S.gear = b.dataset.gear; if (S.gear === 'feet' && S.selWheel) api.clear(); sync(); applyStyles(); }));
  $$('[data-cview]').forEach(b => b.addEventListener('click', () => view(b.dataset.cview)));
  $('[data-act="xray"]').addEventListener('click', () => { S.xray = !S.xray; sync(); applyStyles(); });
  $('[data-act="edges"]').addEventListener('click', () => { S.edges = !S.edges; sync(); applyStyles(); });
  $('[data-act="reset"]').addEventListener('click', () => { S.colour = 'cad'; S.xray = false; S.edges = true; S.kit = 'All'; S.exTo = 0; S.el = true; S.wires = true; S.gear = 'wheels'; api.selectPart(null); sync(); applyStyles(); view('iso'); kick(); });
  $('input[data-explode]').addEventListener('input', e => { S.exTo = e.target.value / 100; sync(); kick(); });
  if (legend){
    const cnt = {}; Object.keys(M.parts).forEach(n => cnt[partSC(n)] = (cnt[partSC(n)] || 0) + 1);
    ['warn','make','open','bad','ok','none'].forEach(k => { const li = document.createElement('span'); li.className = 'lg';
      const sw = document.createElement('i'); sw.className = 'sw ' + k; li.appendChild(sw); li.appendChild(document.createTextNode(SC_LABEL[k] + ' (' + (cnt[k] || 0) + ')')); legend.appendChild(li); });
  }

  function renderLegend(){
    if (!lgEl) return; lgEl.replaceChildren();
    const sw = (cls, v, t, n) => { const s = document.createElement('span'); s.className = 'eg'; const i = document.createElement('i'); i.className = cls; i.style.background = cls === 'sw' ? 'var(' + v + ')' : ''; if (cls === 'ln') i.style.borderTopColor = 'var(' + v + ')'; s.appendChild(i); s.appendChild(document.createTextNode(t + (n !== undefined ? ' (' + n + ')' : ''))); lgEl.appendChild(s); };
    const lab = t => { const sp = document.createElement('span'); sp.className = 'eg'; sp.appendChild(txt('b', t)); lgEl.appendChild(sp); };
    if (S.el){ lab('Parts'); for (const [k, n] of E.ccats) sw('sw', CC_VAR[k], n, elObjs.filter(e => e.c.cat === k).length); }
    if (S.wires){ lab('Wires'); for (const [k, n] of E.wcats) sw('ln', WC_VAR[k], n, E.wires.filter(w => w.cat === k).length); if (S.exTo > 0.002) lgEl.appendChild(txt('span', 'Wires hidden while exploded', 'eg warn')); }
    if (S.gear === 'wheels' && G){ sw('sw', '--open', 'Wheels: proposal, not in the SOLIDWORKS model'); }
    if (S.el || S.wires) lgEl.appendChild(txt('span', 'EST placements and routes, not in the SOLIDWORKS model', 'eg warn'));
  }
  const api = {
    view: n => view(n),
    pick(n){ if (!n){ api.clear(); return; } if (n.kind === 'part') api.selectPart(n.id === S.sel ? null : n.id); else api.selectItem(n.kind, n.id); },
    selectItem(kind, id){
      S.sel = null; S.selEl = kind === 'el' ? id : null; S.selWire = kind === 'wire' ? id : null; S.selWheel = kind === 'wheel';
      if (kind === 'el') showEl(id); else if (kind === 'wire') showWire(id); else showWheel();
      wrap.dispatchEvent(new CustomEvent('partselect', {detail: null})); applyStyles();
    },
    clear(){ S.selEl = S.selWire = null; S.selWheel = false; api.selectPart(null); },
    stats: () => ({elObjects: elObjs.length, elVisible: elObjs.filter(e => e.g.visible).length, wires: wireObjs.length, wireMeshes: wireObjs.reduce((n, w) => n + w.ms.length, 0), wireVisible: wireGroup.visible,
      wheels: wheelObjs.length, wheelsVisible: wheelGroup.visible, gridY: grid.position.y, gridY0, sel: S.sel, selEl: S.selEl, selWire: S.selWire, selWheel: S.selWheel, shellsSeeThrough: seeThrough()}),
    project(kind, id){   // client coordinates of an electronic part or wire midpoint (used by the tests)
      let v = null;
      if (kind === 'el'){ const e = elObjs.find(o => o.id === id); if (e) v = e.g.getWorldPosition(new THREE.Vector3()); }
      else if (kind === 'wire'){ const w = wireObjs.find(o => o.id === id); if (w){ const pts = w.ms[0].userData.pk.geometry.parameters.path; v = pts.getPointAt(0.5); } }
      if (!v) return null; v.project(camera); const r = canvas.getBoundingClientRect(); return {x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height};
    },
    setLayers(o){ if ('el' in o) S.el = !!o.el; if ('wires' in o) S.wires = !!o.wires; if ('gear' in o) S.gear = o.gear; sync(); applyStyles(); },
    selectPart(name){
      S.selEl = S.selWire = null; S.selWheel = false;
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
