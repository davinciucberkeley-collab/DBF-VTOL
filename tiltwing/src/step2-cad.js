/* Step 2 — parametric 3D CAD of the tilt-wing aircraft (three.js r128).
   Axes: X aft along the fuselage (nose at 0), Y up, Z to starboard. Lengths in metres.
   The same construction is mirrored in tiltwing/tools/cad_export.py, which writes the STL / STEP files. */
window.STEP_PANES.push(function (UI, M) {
const { h, fmt, pane } = UI;
const $ = (s, el = document) => el.querySelector(s);

// ---- geometry helpers ----
function airfoilLoop(name) {                 // closed loop, TE -> upper -> LE -> lower -> TE, no duplicate end point
  const c = window.DATA.airfoils.airfoils[name].coords.slice();
  if (Math.hypot(c[0][0] - c[c.length - 1][0], c[0][1] - c[c.length - 1][1]) < 1e-6) c.pop();
  return c;
}
// loft a lifting surface between stations [{z, xLE, c}] using a 2D section; frame origin = tilt-axis point
function loft(sec, st, ox, oy, twistTE) {
  const K = sec.length, pos = [], idx = [];
  st.forEach(s => sec.forEach(([xa, ya]) => pos.push(s.xLE - ox + s.c * xa, s.c * ya - oy, s.z)));
  for (let j = 0; j < st.length - 1; j++) for (let i = 0; i < K; i++) {
    const a = j * K + i, b = j * K + (i + 1) % K, c = (j + 1) * K + i, d = (j + 1) * K + (i + 1) % K;
    idx.push(a, c, b, b, c, d);
  }
  // end caps by ear clipping
  const contour = sec.map(([x, y]) => new THREE.Vector2(x, y));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const n = st.length - 1;
  tris.forEach(([a, b, c]) => { idx.push(a, b, c); idx.push(n * K + a, n * K + c, n * K + b); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// stations for one half from the fuselage side (zIn) to the tip; side = ±1. The halves tilt clear of the fuselage (paper Fig. 3).
function wingStations(halfSpan, xLEroot, cr, ct, sweepDeg, n, zIn, side) {
  const st = [], t = Math.tan(sweepDeg * Math.PI / 180);
  for (let i = 0; i <= n; i++) { const a = (zIn + (halfSpan - zIn) * i / n), z = side * a; st.push({ z, xLE: xLEroot + a * t, c: cr - (cr - ct) * a / halfSpan }); }
  if (side < 0) st.reverse();
  return st;
}

// ---- aircraft builder ----
function buildAircraft(r, p, mats) {
  const root = new THREE.Group();
  const prof = UI.fuselageProfile(p.Lf, p.df / 2, 64).map(([x, rr]) => new THREE.Vector2(Math.max(rr, 1e-4), x));
  const fg = new THREE.LatheGeometry(prof, 40); fg.rotateZ(-Math.PI / 2);
  const fus = new THREE.Mesh(fg, mats.body); fus.name = 'Fuselage'; root.add(fus);
  // canopy blister (estimate, for orientation only)
  const can = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.glass);
  can.scale.set(0.16 * p.Lf, 0.32 * p.df, 0.32 * p.df); can.position.set(0.24 * p.Lf, 0.36 * p.df, 0); root.add(can);

  // wing group, pivot on the tilt axis (spar, 30 % root chord), mounted on top of the fuselage (paper Fig. 2/4)
  const yw = 0.42 * p.df, wing = new THREE.Group(); wing.name = 'Wing'; wing.position.set(r.xw, yw, 0); root.add(wing);
  for (const s of [-1, 1]) wing.add(new THREE.Mesh(loft(airfoilLoop('s1223'), wingStations(p.span / 2, r.xLEroot, r.cr, r.ct, r.sweepLE, 16, 0.55 * p.df, s), r.xw, 0), mats.wing));
  const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.2 * p.df, 16), mats.dark); spar.rotation.x = Math.PI / 2; wing.add(spar);
  // control-surface hinge lines (aileron outer 50–95 % semispan, 75 % chord) — layout estimate
  const hb = p.span / 2, tw = Math.tan(r.sweepLE * Math.PI / 180);
  for (const s of [-1, 1]) {
    const pts = [0.5, 0.95].map(f => { const z = s * f * hb, c = r.cr - (r.cr - r.ct) * f; return new THREE.Vector3(r.xLEroot + f * hb * tw + 0.75 * c - r.xw, 0.035 * c, z); });
    wing.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mats.line));
  }
  // tail group
  const xth = r.xt - 0.3 * r.crh, yt = 0.12 * p.df;
  const tail = new THREE.Group(); tail.name = 'Tail'; tail.position.set(r.xt, yt, 0); root.add(tail);
  for (const s of [-1, 1]) tail.add(new THREE.Mesh(loft(airfoilLoop('naca0009'), wingStations(r.bh / 2, xth, r.crh, r.cth, 5, 8, 0.25 * p.df, s), r.xt, 0), mats.tail));
  const tspar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.6 * p.df, 12), mats.dark); tspar.rotation.x = Math.PI / 2; tail.add(tspar);

  // nacelles + rotors (pointing forward along -X in the surface's local frame)
  const rotors = [];
  const addRotor = (grp, z, xLE, c, D, ox, len, rad) => {
    const xn0 = xLE - ox - 0.45 * len;               // spinner end, ahead of LE
    const cyl = new THREE.CylinderGeometry(rad, rad * 0.8, len, 16); cyl.rotateZ(Math.PI / 2);
    const nac = new THREE.Mesh(cyl, mats.body); nac.position.set(xn0 + len / 2, 0, z); grp.add(nac);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(rad, rad * 2.2, 16), mats.dark); sp.rotation.z = Math.PI / 2; sp.position.set(xn0 - rad * 1.1, 0, z); grp.add(sp);
    const hub = new THREE.Group(); hub.position.set(xn0 - rad * 0.4, 0, z); grp.add(hub);
    const disk = new THREE.Mesh(new THREE.CircleGeometry(D / 2, 48), mats.disk); disk.rotation.y = Math.PI / 2; hub.add(disk);
    const blades = new THREE.Group(); hub.add(blades);
    for (const s of [0, Math.PI]) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.006, D / 2 * 0.95, 0.045 * D / 0.36), mats.dark); bl.position.y = D / 4 * 0.95; const arm = new THREE.Group(); arm.rotation.x = s; arm.add(bl); bl.rotation.y = 0.35; blades.add(arm); }
    // slipstream tube, length ∝ V_prop (paper Eq. 11): 0.1 s of travel
    const vs = grp === wing ? r.Vslip : r.VslipR, tl = Math.max(0.05, vs * 0.1);
    const tg = new THREE.CylinderGeometry(D / 2 * 0.71, D / 2, tl, 32, 1, true); tg.rotateZ(Math.PI / 2);
    const tube = new THREE.Mesh(tg, mats.slip); tube.position.set(xn0 + tl / 2, 0, z); tube.userData.slip = true; grp.add(tube);
    rotors.push({ blades, dir: z > 0 ? 1 : -1, tube });
  };
  for (const z of UI.rotorY(r, p)) { const f = Math.abs(z) / hb, c = r.cr - (r.cr - r.ct) * f; addRotor(wing, z, r.xLEroot + Math.abs(z) * tw, c, r.Df, r.xw, 0.55 * r.cr + 0.1, 0.028); }
  for (const z of [-r.bh / 2, r.bh / 2]) addRotor(tail, z, xth + r.bh / 2 * Math.tan(5 * Math.PI / 180), r.cth, r.Dr, r.xt, 0.55 * r.crh + 0.06, 0.02);

  // CG marker
  const cg = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), mats.accent); cg.position.set(r.xcg, 0, 0); cg.renderOrder = 2; cg.material.depthTest = false; root.add(cg);
  // tilt axes
  for (const [x, y, half] of [[r.xw, yw, hb + 0.06], [r.xt, yt, r.bh / 2 + 0.06]]) {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y, -half), new THREE.Vector3(x, y, half)]), mats.axis); l.computeLineDistances(); root.add(l);
  }
  // simple landing legs (estimate, not in the paper drawings)
  const legH = 0.55 * p.df + 0.1;
  for (const [x, z] of [[0.3 * p.Lf, 0.18], [0.3 * p.Lf, -0.18], [0.82 * p.Lf, 0]]) {
    const g = new THREE.CylinderGeometry(0.006, 0.006, legH, 8), m = new THREE.Mesh(g, mats.dark);
    m.position.set(x, -p.df / 2 - legH / 2 + 0.05, z); root.add(m);
  }
  root.userData = { wing, tail, rotors, groundY: -p.df / 2 - legH + 0.05 };
  return root;
}

// ---- viewer ----
let V = null;
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888'; }
function makeMats() {
  const std = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color(c), roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide }, o));
  return {
    body: std(cssVar('--tint-2')), wing: std(cssVar('--sheet')), tail: std(cssVar('--sheet')), dark: std(cssVar('--ink-2')),
    glass: std(cssVar('--s1'), { transparent: true, opacity: 0.55 }), accent: new THREE.MeshBasicMaterial({ color: new THREE.Color(cssVar('--accent')) }),
    disk: new THREE.MeshBasicMaterial({ color: new THREE.Color(cssVar('--ink-3')), transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
    slip: new THREE.MeshBasicMaterial({ color: new THREE.Color(cssVar('--s1')), transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
    line: new THREE.LineBasicMaterial({ color: new THREE.Color(cssVar('--ink-3')) }),
    axis: new THREE.LineDashedMaterial({ color: new THREE.Color(cssVar('--accent')), dashSize: 0.04, gapSize: 0.025 }),
  };
}
function initViewer(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 0.75), sun = new THREE.DirectionalLight(0xffffff, 0.75); sun.position.set(-2, 4, 3);
  scene.add(hemi, sun);
  const grid = new THREE.GridHelper(6, 30); scene.add(grid);
  V = { renderer, scene, cam, grid, host, ac: null, mats: makeMats(), orbit: { th: -2.35, ph: 0.42, d: 4.6, tx: 0.9, ty: 0, tz: 0 }, spin: true, slip: false, tilt: 0, tailTilt: 0, link: true, anim: null, t0: performance.now() };
  // orbit controls (drag rotate, wheel/pinch zoom, shift/two-finger pan)
  const el = renderer.domElement, ptr = new Map(); let last = null, pinch = null;
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); ptr.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY, e.shiftKey || e.button === 2]; });
  el.addEventListener('pointermove', e => {
    if (!ptr.has(e.pointerId)) return; ptr.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptr.size === 2) { const [a, b] = [...ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) V.orbit.d = Math.min(14, Math.max(1.2, V.orbit.d * pinch / d)); pinch = d; draw(); return; }
    const dx = e.clientX - last[0], dy = e.clientY - last[1]; last = [e.clientX, e.clientY, last[2]];
    if (last[2]) { const s = V.orbit.d * 0.0016; V.orbit.tx -= dx * s * Math.cos(V.orbit.th) ; V.orbit.tz += dx * s * Math.sin(V.orbit.th); V.orbit.ty += dy * s; }
    else { V.orbit.th -= dx * 0.008; V.orbit.ph = Math.max(-1.45, Math.min(1.45, V.orbit.ph + dy * 0.008)); }
    draw();
  });
  const up = e => { ptr.delete(e.pointerId); if (ptr.size < 2) pinch = null; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('wheel', e => { e.preventDefault(); V.orbit.d = Math.min(14, Math.max(1.2, V.orbit.d * Math.exp(e.deltaY * 0.001))); draw(); }, { passive: false });
  new ResizeObserver(() => resize()).observe(host);
  loop();
}
function resize() {
  if (!V) return; const w = V.host.clientWidth, hh = Math.max(280, Math.min(560, Math.round(w * 0.62)));
  if (!w) return; V.renderer.setSize(w, hh); V.cam.aspect = w / hh; V.cam.updateProjectionMatrix(); draw();
}
function setBg() { if (!V) return; V.scene.background = new THREE.Color(cssVar('--sheet')); V.grid.material.color = new THREE.Color(cssVar('--hair')); }
function rebuild(r, p) {
  if (!V) return;
  if (V.ac) { V.scene.remove(V.ac); V.ac.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  V.ac = buildAircraft(r, p, V.mats); V.scene.add(V.ac);
  V.grid.position.y = V.ac.userData.groundY; V.orbit.tx = V.orbit.tx ?? p.Lf / 2;
  applyTilt(); draw();
}
function applyTilt() {
  if (!V || !V.ac) return; const u = V.ac.userData;
  u.wing.rotation.z = -V.tilt * Math.PI / 180; u.tail.rotation.z = -(V.link ? V.tilt : V.tailTilt) * Math.PI / 180;
  u.rotors.forEach(r => r.tube.visible = V.slip);
}
function draw() {
  if (!V) return; const o = V.orbit;
  V.cam.position.set(o.tx + o.d * Math.cos(o.ph) * Math.cos(o.th), o.ty + o.d * Math.sin(o.ph), o.tz + o.d * Math.cos(o.ph) * Math.sin(o.th));
  V.cam.lookAt(o.tx, o.ty, o.tz); V.renderer.render(V.scene, V.cam);
}
function loop() {
  requestAnimationFrame(loop);
  if (!V || !V.ac || V.host.offsetParent === null) return;
  const now = performance.now(), dt = (now - V.t0) / 1000; V.t0 = now;
  let dirty = false;
  if (V.anim) { const a = V.anim, t = Math.min(1, (now - a.start) / a.dur); V.tilt = a.from + (a.to - a.from) * (0.5 - 0.5 * Math.cos(Math.PI * t)); syncTilt(); applyTilt(); dirty = true; if (t >= 1) V.anim = null; }
  if (V.spin && !matchMedia('(prefers-reduced-motion: reduce)').matches) { V.ac.userData.rotors.forEach(r => r.blades.rotation.x += r.dir * dt * 40); dirty = true; }
  if (dirty) draw();
}
function syncTilt() { const s = $('#cad-tilt'), o = $('#cad-tilt-o'); if (s) { s.value = V.tilt; o.textContent = fmt(V.tilt, 0) + '°'; } }
const views = { iso: [-2.35, 0.42, 4.6], top: [-Math.PI / 2, 1.45, 4.4], side: [-Math.PI / 2, 0.02, 4.2], front: [Math.PI, 0.05, 4.0] };

pane({ id: 'cad', n: '03', name: '3D CAD',
  build(el) {
    el.innerHTML = `<div class="main-in">
      <div class="sec"><div class="sec-h"><h2>Parametric 3D model</h2><span class="lbl">three.js · rebuilds from the sliders</span></div>
      <p class="lede">Lofted S1223 wing and NACA 0009 tail from the real airfoil coordinates, lathe-turned fuselage, four wing rotors and two tail rotors on nacelles. The wing and tail pivot about their spars like the paper's Fig. 3. Drag to orbit, scroll or pinch to zoom, shift-drag to pan.</p></div>
      <div class="panel"><div class="panel-h"><h3>Model</h3><span class="lbl" id="cad-dims"></span></div>
        <div id="cad-view" style="position:relative;background:var(--sheet);min-height:280px"></div>
        <div class="panel-b" style="display:grid;gap:10px;border-top:1px solid var(--hair)">
          <div class="sl" style="max-width:520px"><label for="cad-tilt">Wing tilt angle δ<sub>TW</sub> (0° cruise, 90° hover)</label><output id="cad-tilt-o">0°</output>
            <input type="range" id="cad-tilt" min="0" max="90" step="1" value="0"></div>
          <div class="chips" style="gap:8px">
            <button class="btn" type="button" id="cad-anim">Play transition 90° → 0°</button>
            <button class="btn" type="button" data-v="iso">Iso</button><button class="btn" type="button" data-v="top">Top</button>
            <button class="btn" type="button" data-v="side">Side</button><button class="btn" type="button" data-v="front">Front</button>
            <label class="btn" style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" id="cad-spin" checked> Spin rotors</label>
            <label class="btn" style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" id="cad-slip"> Show slipstream</label>
            <label class="btn" style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" id="cad-link" checked> Tail follows wing</label>
          </div>
          <p class="src">Orange dot: CG from the CG slider. Dashed orange lines: tilt axes. Blue tubes: slipstream from paper Eq. 11, drawn 0.1 s long and contracting to 0.71 D. Canopy and landing legs are placeholders, not from the paper.</p>
        </div></div>
      <div class="cols">
        <div class="panel"><div class="panel-h"><h3>Parts</h3><span class="lbl">mass from the sizing model</span></div><div class="tw"><table><thead><tr><th>Part</th><th class="n">Qty</th><th>Key dimensions</th><th class="n">Mass</th></tr></thead><tbody id="cad-parts"></tbody></table></div></div>
        <div class="panel"><div class="panel-h"><h3>CAD files</h3><span class="lbl">tools/cad_export.py</span></div><div class="panel-b" style="display:grid;gap:8px">
          <p class="lede" style="font-size:14.5px">The same geometry is exported offline as STL meshes and a STEP assembly at the paper's values, in cruise (0°) and hover (90°). Those files are sent in the chat and saved in <code>tiltwing/cad/</code>. To export another configuration, run <code>python3 tiltwing/tools/cad_export.py</code> with the slider values in <code>tiltwing/cad/params.json</code>.</p>
          <div class="tw"><table><thead><tr><th>File</th><th>Contents</th></tr></thead><tbody id="cad-files"></tbody></table></div></div></div>
      </div></div>`;
    const t = $('#cad-tilt', el);
    t.addEventListener('input', () => { V.anim = null; V.tilt = +t.value; $('#cad-tilt-o', el).textContent = t.value + '°'; applyTilt(); draw(); });
    $('#cad-anim', el).addEventListener('click', () => { V.anim = { from: 90, to: 0, start: performance.now(), dur: 6000 }; });
    el.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { const [th, ph, d] = views[b.dataset.v]; Object.assign(V.orbit, { th, ph, d, ty: 0, tz: 0, tx: UI.P.Lf / 2 }); draw(); }));
    $('#cad-spin', el).addEventListener('change', e => { V.spin = e.target.checked; });
    $('#cad-slip', el).addEventListener('change', e => { V.slip = e.target.checked; applyTilt(); draw(); });
    $('#cad-link', el).addEventListener('change', e => { V.link = e.target.checked; applyTilt(); draw(); });
  },
  shown() {
    if (!V) { try { initViewer($('#cad-view')); } catch (e) { $('#cad-view').innerHTML = '<p class="lede" style="padding:16px">This browser could not start WebGL, so the 3D view is off. The STEP and STL files below hold the same model.</p>'; return; } setBg(); V.orbit.tx = UI.P.Lf / 2; rebuild(UI.R, UI.P); }
    resize();
  },
  themed() { if (V) { V.mats = makeMats(); setBg(); rebuild(UI.R, UI.P); } },
  render(el, r, p) {
    if (V) rebuild(r, p);
    $('#cad-dims', el).textContent = `span ${fmt(p.span * 1000, 0)} · length ${fmt(p.Lf * 1000, 0)} · tail ${fmt(r.bh * 1000, 0)} mm`;
    const rows = [
      ['Wing (S1223, tilting)', 1, `b ${fmt(p.span, 2)} m · c<sub>r</sub> ${fmt(r.cr * 1000, 0)} / c<sub>t</sub> ${fmt(r.ct * 1000, 0)} mm · Λ<sub>LE</sub> ${fmt(r.sweepLE, 1)}°`, r.mWing],
      ['Fuselage', 1, `L ${fmt(p.Lf * 1000, 0)} mm · Ø ${fmt(p.df * 1000, 0)} mm`, r.mFus],
      ['Horizontal tail (NACA 0009, tilting)', 1, `b<sub>h</sub> ${fmt(r.bh * 1000, 0)} mm · c<sub>r</sub> ${fmt(r.crh * 1000, 0)} mm · S<sub>h</sub> ${fmt(r.Sh, 3)} m²`, r.mTail],
      ['Wing rotor + motor', 4, `${fmt(p.Dfront, 1)} in prop at ${fmt(0.2 * p.span * 1000, 0)} / ${fmt(0.5 * p.span * 1000, 0)} mm from centre`, null],
      ['Tail rotor + motor', 2, `${fmt(p.Drear, 1)} in prop at tail tips`, null],
      ['Propulsion kit (motors, ESCs, props)', 1, `${fmt(p.fProp * 100, 0)} % of MTOW less battery`, r.mMotors],
      ['Battery', 1, `${fmt(r.Euse / 0.8, 0)} Wh at ${fmt(p.eSpec, 0)} Wh/kg`, r.mBatt],
      ['Payload bay', 1, 'fuselage centre section', p.payload],
    ];
    $('#cad-parts', el).innerHTML = rows.map(([n, q, d, m]) => `<tr><td>${n}</td><td class="n">${q}</td><td>${d}</td><td class="n">${m == null ? 'in kit' : fmt(m, 2) + ' kg'}</td></tr>`).join('');
    const files = (window.DATA.cadFiles || []);
    $('#cad-files', el).innerHTML = files.length ? files.map(f => `<tr><td><code>${f[0]}</code></td><td>${f[1]}</td></tr>`).join('') : '<tr><td colspan="2">—</td></tr>';
  }
});
});
