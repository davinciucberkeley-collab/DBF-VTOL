/* SOLIDWORKS model viewer: real part meshes (MESH, from review/mesh.mjs) rendered with three.js r128 + OrbitControls.
   Frame is the SOLIDWORKS one: X forward, Y up, Z right; metres. */
function CadViewer(wrap, M){
  const canvas = wrap.querySelector('canvas'), tip = wrap.querySelector('.tip');
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  if (typeof THREE === 'undefined' || !THREE.OrbitControls){
    wrap.querySelector('.fallback').hidden = false; canvas.hidden = true; return null;
  }
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});   // throws without WebGL: startCad() shows the fallback
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
  const geo = {}, mats = {}, edges = {};
  for (const [name, p] of Object.entries(M.parts)){
    const pos = dec(p.v, Float32Array), idx = dec(p.i, p.w === 4 ? Uint32Array : Uint16Array);
    geo[name] = creased(pos, idx);
    const ig = new THREE.BufferGeometry(); ig.setAttribute('position', new THREE.BufferAttribute(pos, 3)); ig.setIndex(new THREE.BufferAttribute(idx, 1));
    edges[name] = new THREE.EdgesGeometry(ig, 28);
    const col = new THREE.Color().setRGB(p.c[0], p.c[1], p.c[2]).convertSRGBToLinear();
    mats[name] = new THREE.MeshStandardMaterial({color:col, roughness: METAL.test(name) ? 0.38 : 0.62, metalness: METAL.test(name) ? 0.55 : 0.04,
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
  // exploded offsets: each part moves away from the assembly centre along its own centre direction
  for (const it of items){
    const c = new THREE.Box3().setFromObject(it.g).getCenter(new THREE.Vector3()).sub(centre);
    c.y *= 2.2; it.dir = c.multiplyScalar(0.3);
  }
  const grid = new THREE.GridHelper(3.2, 16); grid.position.set(centre.x, box.min.y - 0.002, centre.z); scene.add(grid);

  function theme(){
    lineMat.color.set(css('--fg') || '#16191d');
    const gm = Array.isArray(grid.material) ? grid.material : [grid.material];
    gm.forEach(m => { m.color.set(css('--stage-grid') || '#76818d'); m.transparent = true; m.opacity = 0.55; });
    kick();
  }

  // ---- views and animation ----
  const VIEWS = { iso:[0.95, 0.62, 1.0], top:[-0.001, 1, 0], side:[0, 0.02, 1], front:[1, 0.06, 0] };
  let tween = null, need = true, explodeT = 0, explodeTo = 0, xray = false, running = false, interacting = false;
  function kick(){ need = true; if (!running){ running = true; requestAnimationFrame(loop); } }
  function view(name, instant){
    const d = new THREE.Vector3(...VIEWS[name]).normalize();
    const v = camera.fov * Math.PI / 360, h = Math.atan(Math.tan(v) * camera.aspect);
    const fovFit = radius / Math.sin(Math.min(v, h)) * 0.7;
    const to = centre.clone().add(d.multiplyScalar(fovFit));
    if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches){ camera.position.copy(to); controls.target.copy(centre); controls.update(); kick(); return; }
    tween = {t0: performance.now(), p0: camera.position.clone(), q0: controls.target.clone(), p1: to, q1: centre.clone()}; kick();
  }
  function setXray(on){
    xray = on;
    for (const it of items){ const m = it.mesh.material;
      if (SHELL.test(it.name)){ m.transparent = on; m.opacity = on ? 0.16 : 1; m.depthWrite = !on; }
    }
    kick();
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
    if (explodeT !== explodeTo){
      explodeT += Math.sign(explodeTo - explodeT) * Math.min(Math.abs(explodeTo - explodeT), matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0.06);
      const e = explodeT < 0.5 ? 2*explodeT*explodeT : 1 - Math.pow(-2*explodeT + 2, 2) / 2;
      for (const it of items) it.g.position.copy(it.home).addScaledVector(it.dir, e);
      need = true; active = true;
    }
    if (controls.update()){ need = true; active = true; }
    if (need){ renderer.render(scene, camera); need = false; }
    if (active || interacting) requestAnimationFrame(loop); else running = false;
  }

  // ---- part names on hover / tap ----
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let downAt = null, hoverT = 0;
  const meshes = items.map(i => i.mesh);
  function pick(e){
    const r = canvas.getBoundingClientRect(); ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(meshes, false).find(h => !(xray && SHELL.test(h.object.userData.part)));
    if (!hit){ tip.hidden = true; return; }
    const n = hit.object.userData.part, p = M.parts[n];
    tip.innerHTML = '<b></b><span></span>'; tip.firstChild.textContent = n.split('~')[0].replace(/_/g, ' '); tip.lastChild.textContent = p.d;
    tip.hidden = false;
  }
  canvas.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse' || e.buttons) return; const t = performance.now(); if (t - hoverT < 60) return; hoverT = t; pick(e); });
  canvas.addEventListener('pointerleave', () => tip.hidden = true);
  canvas.addEventListener('pointerdown', e => downAt = [e.clientX, e.clientY]);
  canvas.addEventListener('pointerup', e => { if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5 && e.pointerType !== 'mouse') pick(e); downAt = null; });

  new ResizeObserver(resize).observe(canvas);
  theme(); resize(); view('iso', true); kick();
  return {
    view: n => view(n),
    toggleExplode(){ explodeTo = explodeTo ? 0 : 1; kick(); return !!explodeTo; },
    toggleXray(){ setXray(!xray); return xray; },
    toggleEdges(){ items.forEach(i => i.ln.visible = !i.ln.visible); kick(); return items[0].ln.visible; },
    highlight(name){
      // a part file can have several mesh variants ("Name~k", one per placement rotation): light them all
      const is = n => name && (n === name || n.split('~')[0] === name);
      for (const [n, m] of Object.entries(mats)) { m.emissive.set(is(n) ? (css('--accent') || '#b8481b') : '#000000'); m.emissiveIntensity = is(n) ? 0.55 : 0; }
      const key = name && Object.keys(M.parts).find(is);
      if (key){ tip.innerHTML = '<b></b><span></span>'; tip.firstChild.textContent = name.replace(/_/g, ' '); tip.lastChild.textContent = M.parts[key].d; tip.hidden = false; } else tip.hidden = true;
      kick();
    },
    refresh(){ theme(); resize(); }   // theme() re-reads the palette (theme toggle, print) and redraws
  };
}
