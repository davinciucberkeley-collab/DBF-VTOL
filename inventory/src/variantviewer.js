/* Variant viewer: the C0 Fusion meshes (shared with the Fusion model viewer: the same #fusionData, decoded here with fvDec / fvCreased from fusionviewer.js)
   minus the variant's `hide` list (C0 bodies it removes or replaces), plus the variant's own meshes (concepts/variants/<id>/fusion, packed by
   inventory/build_fusion.mjs on the same Uint16 grid as C0, so one dequantisation rule serves both: F.lo + q * F.sc).
   Frame: X forward, Y up, Z right, metres. Static (neutral pose); the joint animations stay in the C0 viewer.
   "Highlight changes": the variant's new and changed parts take the accent colour, the unchanged C0 parts are ghosted.
   three.js r128 + OrbitControls. */
function VariantViewer(wrap, F, VP, M){
  const $ = s => wrap.querySelector(s), $$ = s => Array.from(wrap.querySelectorAll(s));
  const panel = wrap.closest('.altpanel') || wrap, canvas = $('canvas'), tip = $('.tip'), card = document.getElementById(wrap.dataset.card);
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

  const S = {hl:true, removed:false, groups:{airframe:true, printed:true, propulsion:true, gear:true, electronics:true, hardware:false, mechanisms:false}, sel:null};
  const GROUP = {airframe:'Airframe', printed:'Printed part', propulsion:'Propulsion', gear:'Landing gear and wheels', electronics:'Electronics (EST envelope)', hardware:'Hardware', mechanisms:'Servos and linkages'};
  const model = new THREE.Group(); scene.add(model);
  const hide = new Set(VP.hide || []);
  // geometry of the C0 parts is decoded once per page and shared between variant viewers
  const GC = (VariantViewer.cache = VariantViewer.cache || new Map());
  const geo = (key, p) => {
    let g = GC.get(key); if (g) return g;
    const q = fvDec(p.v, Uint16Array), idx = fvDec(p.i, p.w === 4 ? Uint32Array : Uint16Array), pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) pos[i] = F.lo[i % 3] + q[i] * F.sc[i % 3];
    g = fvCreased(pos, idx); GC.set(key, g); return g;
  };
  const objs = [];
  const add = (p, kind, g) => {
    const col = new THREE.Color().setRGB(p.c[0], p.c[1], p.c[2]).convertSRGBToLinear();
    const metal = (p.g === 'hardware' && !/nylon|tie|tape/i.test(p.n)) || /^(Boom|Spar|Wing_Joiner|Wing_Bolt|Pitot)/.test(p.n);
    const mat = new THREE.MeshStandardMaterial({color:col, roughness: metal ? 0.35 : 0.62, metalness: metal ? 0.6 : 0.04, side:THREE.DoubleSide});
    const mesh = new THREE.Mesh(g, mat); mesh.userData.n = objs.length; model.add(mesh);
    objs.push({p, kind, mesh, mat, col, tris: g.attributes.position.count / 3});
  };
  F.parts.forEach((p, n) => add(p, hide.has(p.n) ? 'removed' : 'c0', geo(n, p)));
  VP.parts.forEach(p => {
    const q = fvDec(p.v, Uint16Array), idx = fvDec(p.i, p.w === 4 ? Uint32Array : Uint16Array), pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) pos[i] = F.lo[i % 3] + q[i] * F.sc[i % 3];
    add(p, p.s === 'changed' ? 'changed' : 'new', fvCreased(pos, idx));
  });
  model.updateMatrixWorld(true);
  const isVar = o => o.kind === 'new' || o.kind === 'changed';
  const boxOf = list => { const b = new THREE.Box3(); list.forEach(o => b.expandByObject(o.mesh)); return b; };
  const full = boxOf(objs.filter(o => o.kind !== 'removed'));
  const centre = full.getCenter(new THREE.Vector3()), radius = full.getSize(new THREE.Vector3()).length() / 2;
  const chg = boxOf(objs.filter(isVar));
  const hasChg = !chg.isEmpty();
  const grid = new THREE.GridHelper(3.6, 18); grid.position.set(centre.x, full.min.y - 0.002, centre.z); scene.add(grid);

  function applyStyles(){
    const acc = new THREE.Color(css('--accent') || '#b8481b'), bad = new THREE.Color(css('--bad') || '#ad2a1f');
    for (const o of objs){
      const m = o.mat; let op = 1, vis = true;
      if (o.kind === 'c0'){ vis = S.groups[o.p.g]; if (S.hl) op = 0.12; }
      else if (o.kind === 'removed'){ vis = S.removed && S.groups[o.p.g]; op = 0.5; }
      if (S.sel !== null && S.sel !== o.mesh.userData.n && o.kind !== 'removed') op = Math.min(op, isVar(o) ? 0.45 : 0.1);
      o.mesh.visible = vis;
      const sel = S.sel === o.mesh.userData.n;
      if (o.kind === 'removed') m.color.copy(bad).convertSRGBToLinear();
      else if (isVar(o) && S.hl) m.color.copy(acc).convertSRGBToLinear();
      else m.color.copy(o.col);
      m.transparent = op < 1; m.opacity = op; m.depthWrite = op >= 0.99;
      m.emissive.copy(sel ? acc : new THREE.Color(0, 0, 0)); m.emissiveIntensity = sel ? 0.55 : 0; m.needsUpdate = true;
    }
    const gm = Array.isArray(grid.material) ? grid.material : [grid.material];
    gm.forEach(m => { m.color.set(css('--line-2') || '#cbcfd4'); m.transparent = true; m.opacity = 0.45; });
    $$('button[data-vgroup]').forEach(b => b.setAttribute('aria-pressed', S.groups[b.dataset.vgroup]));
    const h = $('button[data-vact="hl"]'); h && h.setAttribute('aria-pressed', S.hl);
    const r = $('button[data-vact="removed"]'); r && r.setAttribute('aria-pressed', S.removed);
    Array.from(panel.querySelectorAll('.altparts button')).forEach(b => b.setAttribute('aria-pressed', String(S.sel === +b.dataset.vpart)));
    wrap.dataset.hl = S.hl;
    kick();
  }

  // ---- camera, render on demand ----
  const VIEWS = { iso:[0.95, 0.62, 1.0], top:[-0.001, 1, 0], side:[0, 0.02, 1], front:[1, 0.06, 0] };
  let tween = null, need = true, running = false, interacting = false, last = 0, onscreen = true;
  function kick(){ need = true; if (!running){ running = true; requestAnimationFrame(loop); } }
  function view(name, instant, box){
    const b = box || full, c = b.getCenter(new THREE.Vector3()), r = Math.max(b.getSize(new THREE.Vector3()).length() / 2, 0.05);
    const d = new THREE.Vector3(...VIEWS[name]).normalize();
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
    if (!canvas.offsetParent || !onscreen){ running = false; last = 0; return; }
    last = now; let active = false;
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

  // ---- card ----
  const txt = (tag, t, cls) => { const e = document.createElement(tag); e.textContent = t; if (cls) e.className = cls; return e; };
  const nice = s => s.replace(/_/g, ' ');
  const KIND = {new:'New in ' + M.name, changed:'Changed vs C0 (replaces the C0 body of the same name)', c0:'C0 part, unchanged', removed:'C0 part removed or replaced by this variant'};
  function showCard(n){
    if (!card) return; card.replaceChildren();
    if (n === null){
      card.appendChild(txt('h4', 'Part card'));
      card.appendChild(txt('p', 'Click a part, or pick one from the list under the model. New and changed bodies carry their inventory line. "Highlight changes" tints them with the accent colour and ghosts the unchanged C0 parts; "Show removed C0 parts" draws what this variant takes out.', 'small'));
      return;
    }
    const o = objs[n], p = o.p;
    const head = document.createElement('div'); head.className = 'ph'; head.appendChild(txt('h4', nice(p.n)));
    const x = txt('button', 'Clear'); x.type = 'button'; x.setAttribute('aria-label', 'Clear selection'); x.addEventListener('click', () => select(null)); head.appendChild(x); card.appendChild(head);
    const dl = document.createElement('dl'); dl.className = 'kv'; const kv = (k, v) => { dl.appendChild(txt('dt', k)); dl.appendChild(txt('dd', v === null || v === undefined || v === '' ? '—' : String(v))); };
    kv('Status', KIND[o.kind]); kv('Group', GROUP[p.g] || p.g); kv('Instances', p.k); kv('Triangles', o.tris.toLocaleString('en-US')); card.appendChild(dl);
    const rows = (p.rw || []).map(id => M.rows[id]).filter(Boolean);
    if (isVar(o)){
      if (rows.length){
        const wrapr = document.createElement('div'); wrapr.className = 'pbtns';
        rows.forEach(r => { const d = document.createElement('div'); d.className = 'altline';
          d.appendChild(txt('span', r.id, 'mono-id')); d.appendChild(txt('span', r.item));
          d.appendChild(txt('span', r.unit ? r.qty + ' × $' + r.unit.toFixed(2) + ' = $' + r.ext.toFixed(2) : r.qty + ' × $0.00 (no purchase: made in-house or already held)', 'q'));
          const b = txt('button', 'Show ' + r.id + ' in the table'); b.type = 'button'; b.className = 'linkbtn'; b.dataset.altfind = r.id; d.appendChild(b); wrapr.appendChild(d); });
        card.appendChild(wrapr);
      } else card.appendChild(txt('p', 'No inventory line is mapped to this body (the variant inventory\'s CAD part column does not name it).', 'small'));
    }
  }
  function select(n){ S.sel = n; showCard(n); applyStyles(); }

  // ---- hover and pick ----
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let downAt = null, hoverT = 0;
  function hit(e){
    const r = canvas.getBoundingClientRect(); ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ptr, camera);
    // a ghosted C0 part cannot hide a change behind it: while highlighting, only the variant's own bodies are pickable
    const vis = objs.filter(o => o.mesh.visible && (!S.hl || isVar(o) || o.kind === 'removed')).map(o => o.mesh);
    const hs = ray.intersectObjects(vis, false); return hs.length ? hs[0].object.userData.n : null;
  }
  canvas.addEventListener('pointermove', e => {
    if (e.buttons || performance.now() - hoverT < 40) return; hoverT = performance.now();
    const n = hit(e); if (n === null){ tip.hidden = true; return; }
    tip.replaceChildren(txt('b', nice(objs[n].p.n)), txt('span', KIND[objs[n].kind].split(' (')[0])); tip.hidden = false;
  });
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
  canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return; downAt = null;
    const n = hit(e); select(n === S.sel ? null : n);
  });

  // ---- list of the variant's own bodies (keyboard route to the same cards) ----
  const list = panel.querySelector('.altparts');
  if (list){
    list.replaceChildren();
    objs.forEach((o, n) => { if (!isVar(o)) return;
      const li = document.createElement('li'), b = txt('button', nice(o.p.n) + (o.p.k > 1 ? ' ×' + o.p.k : '') + (o.kind === 'changed' ? ' (changed)' : ''));
      b.type = 'button'; b.dataset.vpart = n; b.setAttribute('aria-pressed', 'false'); b.addEventListener('click', () => { select(S.sel === n ? null : n); if (S.sel === n) view('iso', false, boxOf([o])); });
      li.appendChild(b); list.appendChild(li); });
  }

  // ---- controls ----
  $$('button[data-vgroup]').forEach(b => b.addEventListener('click', () => { S.groups[b.dataset.vgroup] = !S.groups[b.dataset.vgroup]; applyStyles(); }));
  $$('button[data-vview]').forEach(b => b.addEventListener('click', () => view(b.dataset.vview === 'changes' ? 'iso' : b.dataset.vview, false, b.dataset.vview === 'changes' && hasChg ? chg : null)));
  wrap.addEventListener('click', e => {
    const b = e.target.closest('button[data-vact]'); if (!b) return;
    const a = b.dataset.vact;
    if (a === 'hl'){ S.hl = !S.hl; applyStyles(); }
    if (a === 'removed'){ S.removed = !S.removed; applyStyles(); }
    if (a === 'reset'){ S.hl = true; S.removed = false; S.sel = null; S.groups = {airframe:true, printed:true, propulsion:true, gear:true, electronics:true, hardware:false, mechanisms:false}; showCard(null); applyStyles(); view('iso'); }
  });
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas); else addEventListener('resize', resize);
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyStyles);
  new MutationObserver(applyStyles).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
  resize(); view('iso', true); showCard(null); applyStyles();
  const test = { cam(pos, tgt){ camera.position.set(...pos); controls.target.set(...tgt); controls.update(); kick(); }, view, chg, full, boxOf, objs };
  return { refresh(){ resize(); applyStyles(); kick(); }, select, state: S, objs: objs.length, nvar: objs.filter(isVar).length, nremoved: objs.filter(o => o.kind === 'removed').length, test };
}
