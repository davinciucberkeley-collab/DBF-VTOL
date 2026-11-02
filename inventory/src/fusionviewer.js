/* Fusion model viewer: the Autodesk Fusion rebuild of the aircraft with every screw, washer, nut and insert
   (inventory/build_fusion.mjs packs inventory/fusion/stl/*.stl + manifest.json; hardware cards from inventory/hardware/hardware.json).
   Frame: X forward, Y up, Z right, metres (same as the SOLIDWORKS viewer). Positions are Uint16, dequantised with F.lo + q * F.sc.
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
  const objs = F.parts.map((p, n) => {
    const q = dec(p.v, Uint16Array), idx = dec(p.i, p.w === 4 ? Uint32Array : Uint16Array), pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) pos[i] = F.lo[i % 3] + q[i] * F.sc[i % 3];
    const col = new THREE.Color().setRGB(p.c[0], p.c[1], p.c[2]).convertSRGBToLinear();
    const metal = (p.g === 'hardware' && !/nylon|tie|tape/i.test(p.n)) || /^(Boom|Spar|Wing_Joiner|Wing_Bolt|Pitot)/.test(p.n);
    const mat = new THREE.MeshStandardMaterial({color:col, roughness: metal ? 0.35 : 0.62, metalness: metal ? 0.6 : 0.04, side:THREE.DoubleSide});
    const mesh = new THREE.Mesh(creased(pos, idx), mat); mesh.userData.n = n; model.add(mesh);
    return {p, mesh, mat, col, tris: idx.length / 3};
  });
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
  let tween = null, need = true, running = false, interacting = false;
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
  function loop(now){
    if (!canvas.offsetParent){ running = false; return; }
    let active = false;
    if (tween){ active = true;
      const u = Math.min(1, (now - tween.t0) / 450), e = u < 0.5 ? 2*u*u : 1 - Math.pow(-2*u + 2, 2) / 2;
      camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.q0, tween.q1, e);
      if (u >= 1) tween = null; need = true;
    }
    if (controls.update()){ need = true; active = true; }
    if (need){ renderer.render(scene, camera); need = false; }
    if (active || interacting) requestAnimationFrame(loop); else running = false;
  }

  // ---- cards ----
  const txt = (tag, t, cls) => { const e = document.createElement(tag); e.textContent = t; if (cls) e.className = cls; return e; };
  const nice = s => s.replace(/_/g, ' ');
  const GROUP = {airframe:'Airframe', printed:'Printed part', propulsion:'Propulsion', gear:'Landing gear and wheels', electronics:'Electronics (EST envelope)', hardware:'Hardware', mechanisms:'Servos and linkages'};
  const DETAIL = g => g === 'hardware' || g === 'mechanisms';
  function label(p){ return p.j ? p.j + ' ' + (F.joints[p.j] ? F.joints[p.j].name : p.n.replace(/^J-\d+ /, '')) : nice(p.n); }
  function showCard(n){
    if (!card) return; card.replaceChildren();
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
  function select(n){
    S.sel = n; showCard(n); applyStyles();
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
  $$('button[data-fgroup]').forEach(b => b.addEventListener('click', () => { S.groups[b.dataset.fgroup] = !S.groups[b.dataset.fgroup]; applyStyles(); }));
  $$('button[data-fview]').forEach(b => b.addEventListener('click', () => view(b.dataset.fview)));
  wrap.addEventListener('click', e => {
    const b = e.target.closest('button[data-fact]'); if (!b) return;
    if (b.dataset.fact === 'focus'){ S.focus = !S.focus; applyStyles(); }
    if (b.dataset.fact === 'reset'){ S.focus = false; S.sel = null; for (const k in S.groups) S.groups[k] = true; showCard(null); applyStyles(); view('iso'); }
  });
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas); else addEventListener('resize', resize);
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyStyles);
  new MutationObserver(applyStyles).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
  resize(); view('iso', true); showCard(null); applyStyles();
  return { refresh(){ resize(); applyStyles(); }, select, state: S, objs: objs.length };
}
