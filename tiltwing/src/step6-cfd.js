/* Step 6 — CFD in a simulation environment.
   (a) live 2-D lattice-Boltzmann (D2Q9, BGK + Smagorinsky LES) flow around the S1223 section at the flight condition's
       effective angle of attack, with environment gusts on the inlet;
   (b) 3-D vortex-lattice ΔCp on wing + tail from tools/vlm_cp.py (paper Figs. 13, 14, 18 analogue);
   (c) the ISA environment that every tab now uses (E1). */
window.STEP_PANES.push(function (UI, M) {
const { fmt, pane } = UI;
const $ = (s, el = document) => el.querySelector(s);
const VLM = window.DATA.vlm;

// ---------------- 2-D LBM ----------------
const NX = 300, NY = 120, N = NX * NY, CH = 78, EX = [0, 1, 0, -1, 0, 1, -1, -1, 1], EY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
const WQ = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36], OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];
const L = { f: new Float32Array(9 * N), g: new Float32Array(9 * N), solid: new Uint8Array(N), rho: new Float32Array(N), ux: new Float32Array(N), uy: new Float32Array(N),
  u0: 0.09, ReL: 1500, alpha: 6, gustA: 0, run: true, field: 'vort', Fx: 0, Fy: 0, avg: { cl: 0, cd: 0, n: 0 }, steps: 0, img: null, ctx: null, cmap: null };
const co = { mode: 'transition', tilt: 45, Vb: 8 };
const FE = new Float64Array(9);
function feq(i, r, ux, uy) { const eu = EX[i] * ux + EY[i] * uy, uu = ux * ux + uy * uy; return WQ[i] * r * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * uu); }
function inletVel() { const a = L.gustA * Math.PI / 180; return [L.u0 * Math.cos(a), L.u0 * Math.sin(a)]; }
function rasterAirfoil(alphaDeg) {
  const pts = window.DATA.airfoils.airfoils.s1223.coords, a = -alphaDeg * Math.PI / 180, cx = 80, cy = NY / 2 + 6, piv = 0.3;
  const poly = pts.map(([x, y]) => { const X = (x - piv) * CH, Y = y * CH; return [cx + X * Math.cos(a) - Y * Math.sin(a), cy + X * Math.sin(a) + Y * Math.cos(a)]; });
  L.solid.fill(0);
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; }
    if (inside) L.solid[y * NX + x] = 1;
  }
}
function lbmInit() {
  const [ux, uy] = inletVel();
  for (let c = 0; c < N; c++) for (let i = 0; i < 9; i++) L.f[i * N + c] = feq(i, 1, ux, uy);
  L.avg = { cl: 0, cd: 0, n: 0 }; L.steps = 0;
}
function lbmStep() {
  const nu = L.u0 * CH / L.ReL, tau0 = 3 * nu + 0.5, K = 18 * Math.SQRT2 * 0.01, f = L.f, g = L.g, sol = L.solid, R = L.rho, UX = L.ux, UY = L.uy;
  const a = L.gustA * Math.PI / 180, uxi = L.u0 * Math.cos(a), uyi = L.u0 * Math.sin(a);
  const N1 = N, N2 = 2 * N, N3 = 3 * N, N4 = 4 * N, N5 = 5 * N, N6 = 6 * N, N7 = 7 * N, N8 = 8 * N;
  // collide (BGK + Smagorinsky), D2Q9 written out for speed
  for (let c = 0; c < N; c++) {
    if (sol[c]) continue;
    let f0 = f[c], f1 = f[N1 + c], f2 = f[N2 + c], f3 = f[N3 + c], f4 = f[N4 + c], f5 = f[N5 + c], f6 = f[N6 + c], f7 = f[N7 + c], f8 = f[N8 + c];
    let r = f0 + f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8, ux = (f1 - f3 + f5 - f6 - f7 + f8) / r, uy = (f2 - f4 + f5 + f6 - f7 - f8) / r;
    const x = c % NX, y = (c / NX) | 0, edge = x === 0 || y === 0 || y === NY - 1;
    if (edge) { ux = uxi; uy = uyi; r = 1; }
    const uu = 1.5 * (ux * ux + uy * uy), w0 = 4 / 9 * r, w1 = r / 9, w2 = r / 36;
    const e1 = ux, e2 = uy, e5 = ux + uy, e6 = uy - ux;
    const q0 = w0 * (1 - uu), q1 = w1 * (1 + 3 * e1 + 4.5 * e1 * e1 - uu), q2 = w1 * (1 + 3 * e2 + 4.5 * e2 * e2 - uu), q3 = w1 * (1 - 3 * e1 + 4.5 * e1 * e1 - uu), q4 = w1 * (1 - 3 * e2 + 4.5 * e2 * e2 - uu);
    const q5 = w2 * (1 + 3 * e5 + 4.5 * e5 * e5 - uu), q6 = w2 * (1 + 3 * e6 + 4.5 * e6 * e6 - uu), q7 = w2 * (1 - 3 * e5 + 4.5 * e5 * e5 - uu), q8 = w2 * (1 - 3 * e6 + 4.5 * e6 * e6 - uu);
    if (edge) { f[c] = q0; f[N1 + c] = q1; f[N2 + c] = q2; f[N3 + c] = q3; f[N4 + c] = q4; f[N5 + c] = q5; f[N6 + c] = q6; f[N7 + c] = q7; f[N8 + c] = q8; R[c] = r; UX[c] = ux; UY[c] = uy; continue; }
    const d1 = f1 - q1, d2 = f2 - q2, d3 = f3 - q3, d4 = f4 - q4, d5 = f5 - q5, d6 = f6 - q6, d7 = f7 - q7, d8 = f8 - q8;
    const Pxx = d1 + d3 + d5 + d6 + d7 + d8, Pyy = d2 + d4 + d5 + d6 + d7 + d8, Pxy = d5 - d6 + d7 - d8;
    const Q = Math.sqrt(Pxx * Pxx + Pyy * Pyy + 2 * Pxy * Pxy), tau = 0.5 * (tau0 + Math.sqrt(tau0 * tau0 + K * Q / r)), om = 1 / tau;
    f[c] = f0 + (q0 - f0) * om; f[N1 + c] = f1 - d1 * om; f[N2 + c] = f2 - d2 * om; f[N3 + c] = f3 - d3 * om; f[N4 + c] = f4 - d4 * om;
    f[N5 + c] = f5 - d5 * om; f[N6 + c] = f6 - d6 * om; f[N7 + c] = f7 - d7 * om; f[N8 + c] = f8 - d8 * om;
    R[c] = r; UX[c] = ux; UY[c] = uy;
  }
  // stream (pull) with halfway bounce-back; momentum exchange gives the force on the aerofoil
  let Fx = 0, Fy = 0;
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    const c = y * NX + x; if (sol[c]) continue;
    g[c] = f[c];
    for (let i = 1; i < 9; i++) {
      const ys = y - EY[i]; let xs = x - EX[i];
      if (xs < 0 || ys < 0 || ys >= NY) { g[i * N + c] = f[i * N + c]; continue; }
      if (xs >= NX) xs = NX - 1;
      const s = ys * NX + xs;
      if (sol[s]) { const o = OPP[i], v = f[o * N + c]; g[i * N + c] = v; Fx += 2 * v * EX[o]; Fy += 2 * v * EY[o]; }
      else g[i * N + c] = f[i * N + s];
    }
  }
  for (let y = 0; y < NY; y++) for (let i = 0; i < 9; i++) g[i * N + y * NX + NX - 1] = g[i * N + y * NX + NX - 2];
  L.f = g; L.g = f; L.Fx = Fx; L.Fy = Fy; L.steps++;
  if (L.steps > 1500) { const q = 0.5 * L.u0 * L.u0 * CH;
    const D = (Fx * Math.cos(a) + Fy * Math.sin(a)) / q, Lf = (-Fx * Math.sin(a) + Fy * Math.cos(a)) / q;
    L.avg.n++; L.avg.cl += (Lf - L.avg.cl) / Math.min(L.avg.n, 600); L.avg.cd += (D - L.avg.cd) / Math.min(L.avg.n, 600); }
}
function cmapFn() {
  const cs = getComputedStyle(document.documentElement), hx = n => { const h = (cs.getPropertyValue(n).trim() || '#888888').replace('#', ''); return h.length === 3 ? h.split('').map(c => parseInt(c + c, 16)) : [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const div = [hx('--s1'), hx('--sheet'), hx('--bad')], seq = [hx('--sheet'), hx('--s2'), hx('--s1'), hx('--ink')], ink = hx('--ink-2');
  const lerp3 = (st, t) => { t = Math.max(0, Math.min(1, t)) * (st.length - 1); const i = Math.min(st.length - 2, Math.floor(t)), f = t - i; return st[i].map((v, k) => v + (st[i + 1][k] - v) * f); };
  return { div: t => lerp3(div, (t + 1) / 2), seq: t => lerp3(seq, t), ink };
}
function lbmDraw() {
  if (!L.ctx) return; const d = L.img.data, cm = L.cmap, ux = L.ux, uy = L.uy;
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    const c = y * NX + x, p = ((NY - 1 - y) * NX + x) * 4; let col;
    if (L.solid[c]) col = cm.ink;
    else if (L.field === 'vort') { const xm = Math.max(0, x - 1), xp = Math.min(NX - 1, x + 1), ym = Math.max(0, y - 1), yp = Math.min(NY - 1, y + 1);
      const w = (uy[y * NX + xp] - uy[y * NX + xm]) / 2 - (ux[yp * NX + x] - ux[ym * NX + x]) / 2; col = cm.div(w / (L.u0 * 0.25)); }
    else if (L.field === 'speed') col = cm.seq(Math.hypot(ux[c], uy[c]) / (L.u0 * 1.6));
    else col = cm.div(-(L.rho[c] - 1) * 3 / (0.5 * L.u0 * L.u0) / 2.5);
    d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
  }
  L.ctx.putImageData(L.img, 0, 0);
}
let gustState = 0, raf = 0, seedG = 11;
const rndG = () => (seedG = (1664525 * seedG + 1013904223) >>> 0) / 4294967296;
function loop(el) {
  cancelAnimationFrame(raf);
  const tick = () => {
    if (el.hidden) { raf = requestAnimationFrame(tick); return; }
    if (L.run) {
      const sg = UI.P.gust || 0, Vref = Math.max(3, co.Vb + 0.01);
      if (sg > 0) { gustState = 0.995 * gustState + Math.sqrt(1 - 0.995 ** 2) * (Math.sqrt(-2 * Math.log(rndG() + 1e-9)) * Math.cos(2 * Math.PI * rndG())); L.gustA = Math.atan(sg * gustState / Vref) * 180 / Math.PI * 0.7; }
      else L.gustA = 0;
      for (let k = 0; k < 6; k++) lbmStep();
      lbmDraw();
      if (L.steps % 30 < 6) readouts(el);
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
// flight condition -> effective angle on the (blown) wing via the aero model (A1)
function condition(r, p) {
  const tilt = co.mode === 'hover' ? M.hoverTilt(r, p) : co.mode === 'cruise' ? 0 : co.tilt;
  const Vb = co.mode === 'hover' ? 0 : co.mode === 'cruise' ? p.Vc : co.Vb;
  const vp = co.mode === 'cruise' ? 0 : r.Vslip, d = tilt * Math.PI / 180, hw = p.wind || 0;
  const sf = M.surfaceForce('s1223', { v: [-(Vb + hw) - vp * Math.cos(d), -vp * Math.sin(d)], chordAng: d, S: 1, AR: p.AR, c: r.MAC, rho: p.rho, r: [0, 0] });
  return { tilt, Vb, vp, a: sf.a, V: sf.V, Re: p.rho * sf.V * r.MAC / r.env.mu };
}
function readouts(el) {
  const c = L.cond; if (!c) return;
  $('#cf-read', el).innerHTML = `<tr><td>Flight condition</td><td class="n">δ ${fmt(c.tilt, 0)}° · body ${fmt(c.Vb, 1)} m/s · slipstream ${fmt(c.vp, 1)} m/s</td></tr>
    <tr><td>Effective flow on the blown wing (A1)</td><td class="n">${fmt(c.V, 1)} m/s at α ${fmt(c.a, 1)}°</td></tr>
    <tr><td>Real Reynolds number</td><td class="n">${UI.fmtk(c.Re)}</td></tr>
    <tr><td>Lattice Reynolds number</td><td class="n">${fmt(L.ReL, 0)} (u₀ ${L.u0}, chord ${CH} cells)</td></tr>
    <tr><td>Gust angle on the inlet now</td><td class="n">${fmt(L.gustA, 1)}°</td></tr>
    <tr><td>Section c<sub>l</sub> / c<sub>d</sub>, LBM time-average</td><td class="n">${L.avg.n ? fmt(L.avg.cl, 2) + ' / ' + fmt(L.avg.cd, 3) : 'settling…'}</td></tr>
    <tr><td>Section c<sub>l</sub> / c<sub>d</sub>, NeuralFoil at real Re</td><td class="n">${fmt(M.polar2D('s1223', c.a, c.Re).cl, 2)} / ${fmt(M.polar2D('s1223', c.a, c.Re).cd, 3)}</td></tr>`;
}
function setupFlow(el, r, p) {
  L.cond = condition(r, p);
  const a = Math.max(-20, Math.min(45, L.cond.a));
  rasterAirfoil(a); lbmInit(); readouts(el);
  $('#cf-alpha', el).textContent = `aerofoil at α ${fmt(a, 1)}°${a !== L.cond.a ? ' (clipped for the grid)' : ''}`;
  panelViews(el);
}

// ---------------- 3-D VLM ΔCp ----------------
let V3 = null, vcase = 0;
function v3init(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 0.9)); const sun = new THREE.DirectionalLight(0xffffff, 0.5); sun.position.set(-2, 4, 3); scene.add(sun);
  V3 = { renderer, scene, cam, host, grp: null, o: { th: -2.3, ph: 0.55, d: 4.4 } };
  const el = renderer.domElement; let last = null; el.style.touchAction = 'none';
  el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); last = [e.clientX, e.clientY]; });
  el.addEventListener('pointermove', e => { if (!last) return; V3.o.th -= (e.clientX - last[0]) * 0.008; V3.o.ph = Math.max(-1.4, Math.min(1.4, V3.o.ph + (e.clientY - last[1]) * 0.008)); last = [e.clientX, e.clientY]; v3draw(); });
  el.addEventListener('pointerup', () => last = null); el.addEventListener('pointercancel', () => last = null);
  el.addEventListener('wheel', e => { e.preventDefault(); V3.o.d = Math.min(12, Math.max(1.5, V3.o.d * Math.exp(e.deltaY * 0.001))); v3draw(); }, { passive: false });
  new ResizeObserver(() => { const w = host.clientWidth, h = Math.max(260, Math.min(460, w * 0.55)); if (!w) return; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); v3draw(); }).observe(host);
}
function v3build() {
  if (!V3 || !VLM) return; const cs = VLM.cases[vcase], cm = L.cmap || cmapFn();
  if (V3.grp) { V3.scene.remove(V3.grp); V3.grp.traverse(o => o.geometry && o.geometry.dispose()); }
  const grp = new THREE.Group(), pos = [], col = [], lim = Math.max(1, ...cs.dcp.map(Math.abs));
  cs.panels.forEach((q, i) => { const c = cm.div(cs.dcp[i] / lim).map(v => v / 255), P = q.map(([x, y, z]) => [x, z, y]);
    for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...P[k]); col.push(...c); } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  grp.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  const prof = UI.fuselageProfile(UI.P.Lf, UI.P.df / 2, 48).map(([x, rr]) => new THREE.Vector2(Math.max(rr, 1e-4), x)), fg = new THREE.LatheGeometry(prof, 32); fg.rotateZ(-Math.PI / 2);
  const cssc = getComputedStyle(document.documentElement);
  grp.add(new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ color: new THREE.Color(cssc.getPropertyValue('--tint-2').trim() || '#cccccc'), roughness: 0.7, transparent: true, opacity: 0.85 })));
  V3.scene.background = new THREE.Color(cssc.getPropertyValue('--sheet').trim() || '#ffffff');
  V3.grp = grp; V3.scene.add(grp); V3.lim = lim; v3draw();
}
function v3draw() { if (!V3) return; const o = V3.o, tx = UI.P.Lf / 2; V3.cam.position.set(tx + o.d * Math.cos(o.ph) * Math.cos(o.th), o.d * Math.sin(o.ph), o.d * Math.cos(o.ph) * Math.sin(o.th)); V3.cam.lookAt(tx, 0, 0); V3.renderer.render(V3.scene, V3.cam); }

// ---------------- C1: panel-method pressure field + Cp ----------------
function panelViews(el) {
  const c = L.cond; if (!c) return;
  const a = Math.max(-15, Math.min(25, c.a)), pm = M.panel2D(window.DATA.airfoils.airfoils.s1223.coords, a);
  // Cp distribution (−Cp up, aerodynamic convention)
  const up = pm.cp.filter(q => q.upper).sort((x, y) => x.x - y.x), lo = pm.cp.filter(q => !q.upper).sort((x, y) => x.x - y.x);
  UI.lineChart($('#cf-cp', el), { series: [{ name: 'upper', color: '--s1', pts: up.map(q => [q.x, -q.cp]) }, { name: 'lower', color: '--accent', pts: lo.map(q => [q.x, -q.cp]) }], legendRight: true,
    x: { min: 0, max: 1, label: 'x / c' }, y: { label: '−C_p' }, hlines: [{ y: 0, label: '', color: '--construct' }] });
  $('#cf-cp-l', el).textContent = `α ${fmt(a, 1)}° · inviscid c_l ${fmt(pm.cl, 2)} · c_m,¼ ${fmt(pm.cm, 3)} · NeuralFoil (viscous) c_l ${fmt(M.polar2D('s1223', a, c.Re).cl, 2)}${a > 12 ? ' · past stall: the inviscid result is not physical' : ''}`;
  // pressure-coefficient field with streamlines on a canvas
  const cv = $('#cf-pf', el); let ctx = null; try { ctx = cv.getContext('2d'); } catch (e) {} if (!ctx) return;
  const GW = 200, GH = 100, x0 = -0.6, x1 = 1.6, y0 = -0.55, y1 = 0.55, img = ctx.createImageData(GW, GH), cm = L.cmap || cmapFn();
  const field = new Float32Array(GW * GH), vx = new Float32Array(GW * GH), vy = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const x = x0 + (x1 - x0) * (i + 0.5) / GW, y = y1 - (y1 - y0) * (j + 0.5) / GH, k = j * GW + i;
    if (pm.inside(x, y)) { field[k] = NaN; continue; } const [u, v] = pm.vel(x, y); vx[k] = u; vy[k] = v; field[k] = 1 - (u * u + v * v); }
  for (let k = 0; k < GW * GH; k++) { const col = isNaN(field[k]) ? cm.ink : cm.div(Math.max(-1, Math.min(1, -field[k] / 1.5)) * -1); img.data.set([col[0], col[1], col[2], 255], 4 * k); }
  const off = document.createElement('canvas'); off.width = GW; off.height = GH; off.getContext('2d').putImageData(img, 0, 0);
  cv.width = 800; cv.height = 400; ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, 800, 400);
  // streamlines: RK2 from upstream seeds, in grid units
  const sx = 800 / (x1 - x0), sy = 400 / (y1 - y0), tok = getComputedStyle(document.documentElement);
  ctx.strokeStyle = tok.getPropertyValue('--ink').trim() || '#222'; ctx.globalAlpha = 0.55; ctx.lineWidth = 1;
  const at = (x, y) => { const i = Math.floor((x - x0) / (x1 - x0) * GW), j = Math.floor((y1 - y) / (y1 - y0) * GH); if (i < 0 || j < 0 || i >= GW || j >= GH) return null; const k = j * GW + i; return isNaN(field[k]) ? null : [vx[k], vy[k]]; };
  for (let sIdx = 0; sIdx < 22; sIdx++) { let x = x0 + 0.01, y = y0 + 0.02 + (y1 - y0 - 0.04) * sIdx / 21; ctx.beginPath(); ctx.moveTo((x - x0) * sx, (y1 - y) * sy);
    for (let st = 0; st < 600; st++) { const v1 = at(x, y); if (!v1) break; const h = 0.006 / Math.max(0.2, Math.hypot(...v1)), xm = x + v1[0] * h / 2, ym = y + v1[1] * h / 2, v2 = at(xm, ym); if (!v2) break; x += v2[0] * h; y += v2[1] * h; if (x > x1) break; ctx.lineTo((x - x0) * sx, (y1 - y) * sy); }
    ctx.stroke(); }
  ctx.globalAlpha = 1;
  // airfoil outline
  ctx.beginPath(); pm.pts.forEach(([x, y], i) => { const X = (x - x0) * sx, Y = (y1 - y) * sy; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.closePath();
  ctx.fillStyle = `rgb(${cm.ink.join(',')})`; ctx.fill();
  ctx.fillStyle = tok.getPropertyValue('--ink').trim() || '#222'; ctx.font = '13px ' + (tok.getPropertyValue('--f-mono').trim() || 'monospace');
  ctx.fillText(`C_p field, potential flow at α ${fmt(a, 1)}° (flow left to right, freestream rotated by α)`, 10, 18);
}
// ---------------- VLM planform contour + spanwise loading ----------------
function vlmViews(el) {
  if (!VLM) return; const cs = VLM.cases[vcase], cm = L.cmap || cmapFn(), lim = Math.max(1, ...cs.dcp.map(Math.abs));
  const svg = $('#cf-plan', el), W = 640, H = 330; let xs = [], ys = [];
  cs.panels.forEach(q => q.forEach(([x, y]) => { xs.push(x); ys.push(y); }));
  const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys), k = Math.min((W - 40) / (ymax - ymin), (H - 70) / (xmax - xmin));
  const P = (x, y) => `${(20 + (y - ymin) * k).toFixed(1)},${(40 + (x - xmin) * k).toFixed(1)}`;
  let g = cs.panels.map((q, i) => { const c = cm.div(cs.dcp[i] / lim); const col = `rgb(${c.map(Math.round).join(',')})`; return `<path d="M${q.map(([x, y]) => P(x, y)).join(' L')}Z" fill="${col}" stroke="${col}" stroke-width="0.4"><title>ΔCp ${cs.dcp[i]}</title></path>`; }).join('');
  for (let i = 0; i < 100; i++) { const c = cm.div(-1 + 2 * i / 99); g += `<rect x="${W - 230 + i * 2}" y="10" width="2.3" height="9" fill="rgb(${c.map(Math.round).join(',')})"/>`; }
  g += `<text x="${W - 230}" y="32">${fmt(-lim, 1)}</text><text x="${W - 30}" y="32" text-anchor="end">${fmt(lim, 1)} ΔC_p</text><text x="12" y="20" class="t-ink">Top view (projected), nose up · δ ${cs.tilt}°, α ${cs.alpha_w}°</text>`;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = g;
  // spanwise loading: strip ΔCp·area / (strip width · c̄) for the wing panels (|y| > tail span)
  const strips = new Map(); cs.panels.forEach((q, i) => { const ym = (q[0][1] + q[3][1]) / 2, xm = q.reduce((a, b) => a + b[0], 0) / 4, wid = Math.abs(q[3][1] - q[0][1]); const area = 0.5 * Math.abs((q[2][0] - q[0][0]) * (q[3][1] - q[1][1]) - (q[3][0] - q[1][0]) * (q[2][1] - q[0][1]));
    const key = (xm < UI.R.xt - 0.2 ? 'w' : 't') + ym.toFixed(3); const s2 = strips.get(key) || { y: ym, L: 0, w: wid, wing: xm < UI.R.xt - 0.2 }; s2.L += cs.dcp[i] * area; strips.set(key, s2); });
  const arr = [...strips.values()].sort((a, b) => a.y - b.y), cbar = UI.R.MAC;
  const ell = arr.filter(s2 => s2.wing).map(s2 => [s2.y, 4 / Math.PI * cs.CL * Math.sqrt(Math.max(0, 1 - (2 * s2.y / UI.P.span) ** 2))]);
  UI.lineChart($('#cf-span', el), { series: [{ name: 'wing', color: '--s1', pts: arr.filter(s2 => s2.wing).map(s2 => [s2.y, s2.L / (s2.w * cbar)]) }, { name: 'tail', color: '--s3', pts: arr.filter(s2 => !s2.wing).map(s2 => [s2.y, s2.L / (s2.w * cbar)]) }, { name: 'elliptic', color: '--construct', dash: '5 4', pts: ell }],
    legendRight: true, x: { label: 'spanwise y [m]' }, y: { label: 'c_l c / c̄' } });
}
function envTable(el, r, p) {
  const e = r.env, nu = e.mu / e.rho, dAlt = e.rho < 1.225 ? (1 - Math.pow(e.rho / 1.225, 1 / 4.2559)) * 288.15 / 0.0065 : 0;
  $('#cf-env', el).innerHTML = [
    ['Altitude / ISA offset', `${fmt(p.alt, 0)} m · ${p.dT >= 0 ? '+' : ''}${fmt(p.dT, 0)} °C`], ['Temperature', `${fmt(e.T - 273.15, 1)} °C`], ['Pressure', `${fmt(e.p / 100, 1)} hPa`],
    ['Density', `${fmt(e.rho, 4)} kg/m³`], ['Density altitude', `${fmt(dAlt, 0)} m`], ['Dynamic viscosity', `${(e.mu * 1e5).toFixed(3)}×10⁻⁵ Pa·s`], ['Kinematic viscosity', `${(nu * 1e5).toFixed(3)}×10⁻⁵ m²/s`],
    ['Speed of sound / cruise Mach', `${fmt(e.a, 1)} m/s · M ${fmt(p.Vc / e.a, 3)}`], ['Re, cruise / hover slipstream', `${UI.fmtk(r.ReC)} / ${UI.fmtk(r.ReV)}`],
    ['Wind / turbulence σ', `${p.wind >= 0 ? 'head' : 'tail'} ${fmt(Math.abs(p.wind), 1)} m/s · σ ${fmt(p.gust, 1)} m/s`],
  ].map(([a, b]) => `<tr><td>${a}</td><td class="n">${b}</td></tr>`).join('');
}

pane({ id: 'cfd', n: '07', name: 'CFD',
  build(el) {
    el.innerHTML = `<div class="main-in">
      <div class="sec"><div class="sec-h"><h2>CFD in the simulation environment</h2><span class="lbl">environment E1–E2 · LBM · vortex lattice</span></div>
      <p class="lede">The paper used Fluent on 63 meshes of about 4 million cells each. That cannot run in a browser, so this tab uses two lighter solvers. A live 2-D lattice-Boltzmann simulation shows the flow around the tilted S1223 section at the effective angle the aero model predicts for the chosen flight condition, with gusts from the Environment sliders. A 3-D vortex-lattice solution shows how the pressure load spreads over the wing and tail.</p></div>
      <div class="cols">
        <div class="panel"><div class="panel-h"><h3>Simulation environment</h3><span class="lbl">ISA, used by every tab</span></div><div class="tw"><table><tbody id="cf-env"></tbody></table></div>
          <div class="panel-b"><p class="src">Change altitude, temperature, wind and turbulence in the Environment group on the left. Density feeds sizing, aero, the simulation and the structural loads.</p></div></div>
        <div class="panel"><div class="panel-h"><h3>2-D flow readouts</h3></div><div class="tw"><table><tbody id="cf-read"></tbody></table></div>
          <div class="panel-b"><p class="src">Lattice Re is far below the real Re (a browser grid cannot resolve 10⁵), so the LBM shows separation and wake patterns qualitatively; the NeuralFoil row gives the quantitative section coefficients.</p></div></div>
      </div>
      <div class="panel"><div class="panel-h"><h3>Live 2-D flow around the wing section</h3><span class="lbl" id="cf-alpha"></span></div>
        <div style="background:var(--sheet)"><canvas id="cf-cv" width="${NX}" height="${NY}" style="width:100%;height:auto;display:block;image-rendering:auto" role="img" aria-label="Animated flow field around the aerofoil"></canvas></div>
        <div class="panel-b" style="display:grid;gap:10px;border-top:1px solid var(--hair)">
          <div class="chips" style="gap:8px">
            ${[['hover', 'Hover in slipstream'], ['transition', 'Transition'], ['cruise', 'Cruise']].map(([k, t]) => `<label class="btn" style="display:inline-flex;gap:6px;align-items:center"><input type="radio" name="cf-mode" value="${k}" ${k === co.mode ? 'checked' : ''}> ${t}</label>`).join('')}
            <span style="width:12px"></span>
            ${[['vort', 'Vorticity'], ['speed', 'Speed'], ['press', 'Pressure']].map(([k, t]) => `<label class="btn" style="display:inline-flex;gap:6px;align-items:center"><input type="radio" name="cf-field" value="${k}" ${k === L.field ? 'checked' : ''}> ${t}</label>`).join('')}
            <button class="btn primary" type="button" id="cf-run">Pause</button><button class="btn" type="button" id="cf-reset">Restart flow</button>
          </div>
          <div class="cols3" style="gap:10px 18px">
            <div class="sl"><label for="cf-tilt">Transition tilt</label><output id="cf-tilt-o">${co.tilt}°</output><input type="range" id="cf-tilt" min="0" max="90" step="1" value="${co.tilt}"></div>
            <div class="sl"><label for="cf-vb">Transition body speed</label><output id="cf-vb-o">${co.Vb} m/s</output><input type="range" id="cf-vb" min="0" max="25" step="0.5" value="${co.Vb}"></div>
            <div class="sl"><label for="cf-re">Lattice Reynolds number</label><output id="cf-re-o">${L.ReL}</output><input type="range" id="cf-re" min="200" max="2500" step="50" value="${L.ReL}"></div>
          </div>
          <p class="src">D2Q9 lattice, ${NX} × ${NY} cells, BGK collision with Smagorinsky LES (C<sub>s</sub> 0.1), halfway bounce-back on the aerofoil, forces by momentum exchange. Flow left to right; blue/red = clockwise/anticlockwise vorticity, or low/high pressure.</p>
        </div></div>
      <div class="cols">
        <div class="panel"><div class="panel-h"><h3>Pressure field and streamlines</h3><span class="lbl">panel method C1 · contour</span></div>
          <div style="background:var(--sheet)"><canvas id="cf-pf" width="800" height="400" style="width:100%;height:auto;display:block" role="img" aria-label="Pressure coefficient contour and streamlines around the aerofoil"></canvas></div>
          <div class="panel-b"><p class="src">Hess–Smith panel method (78 panels on the S1223) at the same effective angle as the flow simulation above. Red = high pressure (C<sub>p</sub> → 1 at stagnation), blue = suction. Inviscid: valid below stall.</p></div></div>
        <div class="panel"><div class="panel-h"><h3>Surface pressure distribution</h3><span class="lbl" id="cf-cp-l"></span></div><div class="panel-b"><svg id="cf-cp" role="img" aria-label="Pressure coefficient along the upper and lower surface"></svg>
          <p class="src">Validated: the same code gives c<sub>l</sub> 0.613 for NACA 0009 at 5° (thin-aerofoil theory with thickness ≈ 0.59) and 1.52 for the S1223 at 0°.</p></div></div>
      </div>
      <div class="cols">
        <div class="panel"><div class="panel-h"><h3>Pressure-load contour, top view</h3><span class="lbl">vortex lattice</span></div><div class="panel-b"><svg id="cf-plan" role="img" aria-label="Plan view of wing and tail coloured by pressure difference"></svg></div></div>
        <div class="panel"><div class="panel-h"><h3>Spanwise loading</h3><span class="lbl">vortex lattice vs elliptic</span></div><div class="panel-b"><svg id="cf-span" role="img" aria-label="Spanwise lift distribution"></svg>
          <p class="src">Section load c<sub>l</sub>c/c̄ summed per strip; the dashed curve is the elliptic loading with the same C<sub>L</sub>. The dip near the root is where the wing passes the fuselage gap.</p></div></div>
      </div>
      <div class="panel"><div class="panel-h"><h3>3-D pressure load (ΔC<sub>p</sub>) on wing and tail</h3><span class="lbl" id="cf-vlm-l"></span></div>
        <div id="cf-3d" style="background:var(--sheet);min-height:260px"></div>
        <div class="panel-b" style="display:grid;gap:8px;border-top:1px solid var(--hair)">
          <div class="chips" style="gap:8px" id="cf-cases"></div>
          <p class="src">Vortex lattice (AeroSandbox), 240 panels on the cambered S1223 and NACA 0009 mean lines, 20 m/s, paper geometry. Colour: ΔC<sub>p</sub> between lower and upper surface, blue low to red high. Inviscid: it shows the load distribution (cf. paper Figs. 13, 14, 18), not stall. Drag to rotate.</p>
        </div></div>
      </div>`;
    el.querySelectorAll('input[name=cf-mode]').forEach(i => i.addEventListener('change', () => { co.mode = i.value; setupFlow(el, UI.R, UI.P); }));
    el.querySelectorAll('input[name=cf-field]').forEach(i => i.addEventListener('change', () => { L.field = i.value; lbmDraw(); }));
    const b = (id, k, obj, suf, after) => { const i = $('#' + id, el), o = $('#' + id + '-o', el); i.addEventListener('input', () => { obj[k] = +i.value; o.textContent = i.value + suf; after(); }); };
    b('cf-tilt', 'tilt', co, '°', () => { if (co.mode !== 'transition') { co.mode = 'transition'; el.querySelector('input[name=cf-mode][value=transition]').checked = true; } setupFlow(el, UI.R, UI.P); });
    b('cf-vb', 'Vb', co, ' m/s', () => { if (co.mode !== 'transition') { co.mode = 'transition'; el.querySelector('input[name=cf-mode][value=transition]').checked = true; } setupFlow(el, UI.R, UI.P); });
    b('cf-re', 'ReL', L, '', () => { L.avg = { cl: 0, cd: 0, n: 0 }; L.steps = 0; });
    $('#cf-run', el).addEventListener('click', e => { L.run = !L.run; e.target.textContent = L.run ? 'Pause' : 'Run'; });
    $('#cf-reset', el).addEventListener('click', () => setupFlow(el, UI.R, UI.P));
    const cases = VLM ? VLM.cases : [];
    $('#cf-cases', el).innerHTML = cases.map((c, i) => `<label class="btn" style="display:inline-flex;gap:6px;align-items:center"><input type="radio" name="cf-vc" value="${i}" ${i === vcase ? 'checked' : ''}> δ ${c.tilt}° · α ${c.alpha_w}°</label>`).join('');
    el.querySelectorAll('input[name=cf-vc]').forEach(i => i.addEventListener('change', () => { vcase = +i.value; v3build(); vlmLabel(el); vlmViews(el); }));
    const cv = $('#cf-cv', el); L.ctx = cv.getContext && cv.getContext('2d'); if (L.ctx) L.img = L.ctx.createImageData(NX, NY);
  },
  shown() {
    const el = $('#pane-cfd'); L.cmap = cmapFn();
    if (!V3 && window.THREE) { try { v3init($('#cf-3d', el)); v3build(); } catch (e) { $('#cf-3d', el).innerHTML = '<p class="lede" style="padding:16px">WebGL is not available in this browser, so the 3-D pressure view is off.</p>'; } }
    loop(el);
  },
  themed() { L.cmap = cmapFn(); lbmDraw(); v3build(); const el = $('#pane-cfd'); panelViews(el); vlmViews(el); },
  render(el, r, p) { envTable(el, r, p); L.cmap = L.cmap || cmapFn(); setupFlow(el, r, p); vlmLabel(el); vlmViews(el); }
});
function vlmLabel(el) { if (!VLM) return; const c = VLM.cases[vcase]; $('#cf-vlm-l', el).textContent = `δ ${c.tilt}°, α ${c.alpha_w}° (wing axes) · C_L ${c.CL.toFixed(3)} · C_Di ${c.CDi.toFixed(4)}${c.tilt === 0 && c.alpha_w === 0 ? ' · paper CFD 0.73' : ''}`; }
});
