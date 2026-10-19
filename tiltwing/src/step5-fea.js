/* Step 5 — structural FEA of the primary structure (formulas F1–F7). */
window.STEP_PANES.push(function (UI, M) {
const { fmt, pane, lineChart } = UI;
const $ = (s, el = document) => el.querySelector(s);
const sp = { sparMat: 'cf_tube', sparD: 20, sparT: 1.5, fusMat: 'gf_shell', fusT: 1.0, tailMat: 'cf_tube', tailD: 10, tailT: 1.0, Ugust: 7.6, nManeuver: 2.5, nLand: 3, FoS: 1.5 };
let lc = 'hover', F = null;
const br = { W: 90, H: 70, t: 4, mat: 'al6061', B: null };
const SL = [
  ['sparD', 'Wing spar outer diameter', 'mm', 10, 40, 0.5], ['sparT', 'Wing spar wall', 'mm', 0.5, 4, 0.1],
  ['tailD', 'Tail spar outer diameter', 'mm', 6, 25, 0.5], ['tailT', 'Tail spar wall', 'mm', 0.4, 3, 0.1],
  ['fusT', 'Fuselage shell thickness', 'mm', 0.3, 3, 0.1], ['Ugust', 'Design gust', 'm/s', 3, 15, 0.1],
  ['nManeuver', 'Manoeuvre load factor', 'g', 1.5, 4.5, 0.1], ['nLand', 'Landing load factor', 'g', 1.5, 6, 0.1], ['FoS', 'Factor of safety', '', 1.2, 2.5, 0.05],
];
// colour map from theme tokens (resolved at draw time so both themes work)
function cmap() {
  const cs = getComputedStyle(document.documentElement), hex = n => cs.getPropertyValue(n).trim() || '#888888';
  const stops = ['--s1', '--s2', '--s6', '--warn', '--bad'].map(hex).map(h => { const m = h.replace('#', ''); const v = m.length === 3 ? m.split('').map(c => parseInt(c + c, 16)) : [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16)); return v; });
  return t => { t = Math.max(0, Math.min(1, t)) * (stops.length - 1); const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i; const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f)); return `rgb(${c.join(',')})`; };
}
function colorbar(x, y, w, cm, lo, hi, unit) {
  let g = ''; for (let i = 0; i < 100; i++) g += `<rect x="${x + i * w / 100}" y="${y}" width="${w / 100 + 0.4}" height="9" fill="${cm(i / 99)}"/>`;
  [0, 0.5, 1].forEach(t => { g += `<text x="${x + t * w}" y="${y + 21}" text-anchor="${t === 0 ? 'start' : t === 1 ? 'end' : 'middle'}">${fmt(lo + (hi - lo) * t, Math.abs(hi) < 10 ? 1 : 0)}${t === 1 ? ' ' + unit : ''}</text>`; });
  return g;
}
// signed colour map for tension/compression: blue (−) → sheet → red (+)
function cmapDiv() {
  const cs = getComputedStyle(document.documentElement), hx = n => { const h = (cs.getPropertyValue(n).trim() || '#888888').replace('#', ''); return h.length === 3 ? h.split('').map(c => parseInt(c + c, 16)) : [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const st = [hx('--s1'), hx('--tint'), hx('--bad')];
  return t => { t = Math.max(0, Math.min(1, t)) * 2; const i = Math.min(1, Math.floor(t)), f = t - i; return `rgb(${st[i].map((v, k) => Math.round(v + (st[i + 1][k] - v) * f)).join(',')})`; };
}
// spar tube surface, unrolled: spanwise station × angle round the tube (0° = top). σ = M (D/2) cosφ / I (tension +)
function sparMap(svg) {
  const c = F.cases[lc], cm = cmapDiv(), W = 620, H = 250, L = 56, R = 16, T = 30, B = 40, nphi = 36, ny = F.ys.length;
  const smax = Math.max(...c.sig) || 1, X = i => L + i / (ny - 1) * (W - L - R), Y = k => T + k / nphi * (H - T - B);
  let g = '';
  for (let i = 0; i < ny - 1; i++) for (let k = 0; k < nphi; k++) {
    const phi = (k + 0.5) / nphi * 2 * Math.PI, sgn = Math.sign(c.M[i]) || 1, v = sgn * c.sig[i] * Math.cos(phi);
    g += `<rect x="${X(i)}" y="${Y(k)}" width="${X(i + 1) - X(i) + 0.5}" height="${Y(k + 1) - Y(k) + 0.5}" fill="${cm(0.5 + 0.5 * v / smax)}"/>`;
  }
  [0, 90, 180, 270, 360].forEach(d => { g += `<text x="${L - 6}" y="${Y(d / 360 * nphi) + 4}" text-anchor="end">${d}°</text>`; });
  for (let i = 0; i < ny; i += 15) g += `<text x="${X(i)}" y="${H - B + 15}" text-anchor="middle">${fmt(F.ys[i], 2)}</text>`;
  g += `<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle" class="t-3">spanwise station y [m] · angle round the tube from the top (0° = top in cruise, leading edge in hover)</text>`;
  g += `<text x="${L}" y="16" class="t-ink">Spar surface bending stress · ${c.name}</text>` + colorbar(W - 230, 6, 210, cm, -smax / 1e6, smax / 1e6, 'MPa');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = g;
}
// root cross-section of the spar: σ(φ) with torsion shear folded into von Mises, drawn as a ring
function sparSection(svg) {
  const c = F.cases[lc], cm = cmapDiv(), W = 300, H = 250, cx = 150, cy = 120, Ro = 90, Ri = Math.max(20, 90 * (1 - 2 * F.tube.t / F.tube.D)), sm = c.sig[0] || 1, n = 72;
  let g = '';
  for (let k = 0; k < n; k++) { const a0 = k / n * 2 * Math.PI, a1 = (k + 1) / n * 2 * Math.PI, v = (Math.sign(c.M[0]) || 1) * Math.cos((a0 + a1) / 2);
    const p = (r, a) => `${cx + r * Math.sin(a)},${cy - r * Math.cos(a)}`;
    g += `<path d="M${p(Ri, a0)} L${p(Ro, a0)} A${Ro},${Ro} 0 0 1 ${p(Ro, a1)} L${p(Ri, a1)} A${Ri},${Ri} 0 0 0 ${p(Ri, a0)}Z" fill="${cm(0.5 + 0.5 * v)}" stroke="${cm(0.5 + 0.5 * v)}" stroke-width="0.5"/>`; }
  g += `<line x1="${cx - Ro - 10}" x2="${cx + Ro + 10}" y1="${cy}" y2="${cy}" stroke="var(--ink-3)" stroke-dasharray="4 3"/><text x="${cx + Ro + 8}" y="${cy - 5}" text-anchor="end" class="t-3">neutral axis</text>`;
  g += `<text x="${cx}" y="${cy - Ro - 10}" text-anchor="middle">${fmt((Math.sign(c.M[0]) || 1) * sm / 1e6, 0)} MPa</text><text x="${cx}" y="${cy + Ro + 20}" text-anchor="middle">${fmt(-(Math.sign(c.M[0]) || 1) * sm / 1e6, 0)} MPa</text>`;
  g += `<text x="10" y="${H - 6}" class="t-3">root, ${fmt(F.tube.D * 1000, 1)} × ${fmt(F.tube.t * 1000, 1)} mm · τ torsion ${fmt(c.tau[0] / 1e6, 1)} MPa</text>`;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = g;
}
// fuselage shell, unrolled: x × angle; σ = M R cosφ / I, shear τ = V sinφ / (π R t) → von Mises
function fusMap(svg) {
  const fc = lc === 'landing' ? F.fus.landing : F.fus.hover, cm = cmapDiv(), W = 620, H = 230, L = 56, R = 16, T = 30, B = 40, nphi = 36, nx = F.fus.xs.length, t = sp.fusT / 1000;
  const vals = []; let vmax = 1e-9;
  for (let i = 0; i < nx; i++) { const Rr = Math.max(F.fus.prof[i], 0.004), I = Math.PI * Rr ** 3 * t; vals.push([]);
    for (let k = 0; k < nphi; k++) { const ph = (k + 0.5) / nphi * 2 * Math.PI, sg = -fc.M[i] * Rr * Math.cos(ph) / I, ta = fc.V[i] * Math.sin(ph) / (Math.PI * Rr * t);
      const v = Math.sign(sg || 1) * Math.sqrt(sg * sg + 3 * ta * ta); vals[i].push(v); vmax = Math.max(vmax, Math.abs(v)); } }
  const X = i => L + i / (nx - 1) * (W - L - R), Y = k => T + k / nphi * (H - T - B);
  let g = '';
  for (let i = 0; i < nx - 1; i++) for (let k = 0; k < nphi; k++) g += `<rect x="${X(i)}" y="${Y(k)}" width="${X(i + 1) - X(i) + 0.5}" height="${Y(k + 1) - Y(k) + 0.5}" fill="${cm(0.5 + 0.5 * vals[i][k] / vmax)}"/>`;
  [0, 90, 180, 270, 360].forEach(d => { g += `<text x="${L - 6}" y="${Y(d / 360 * nphi) + 4}" text-anchor="end">${d}°</text>`; });
  for (let x = 0; x <= UI.P.Lf + 1e-6; x += 0.3) g += `<text x="${X(x / UI.P.Lf * (nx - 1))}" y="${H - B + 15}" text-anchor="middle">${fmt(x, 1)}</text>`;
  [fc.xa, fc.xb].forEach(x => { const xx = X(x / UI.P.Lf * (nx - 1)); g += `<line x1="${xx}" x2="${xx}" y1="${T}" y2="${H - B}" stroke="var(--ink)" stroke-dasharray="3 3"/>`; });
  g += `<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle" class="t-3">station from the nose x [m] · angle round the shell (0° = top) · dashed = ${lc === 'landing' ? 'landing legs' : 'wing and tail axes'}</text>`;
  g += `<text x="${L}" y="16" class="t-ink">Fuselage shell von Mises (signed by bending) · ${lc === 'landing' ? 'hard landing' : 'hover'}</text>` + colorbar(W - 230, 6, 210, cm, -vmax / 1e6, vmax / 1e6, 'MPa');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = g;
}
// F8: tilt-bearing bracket plane-stress FE
function bracket(el) {
  const c = F.cases[lc], m = M.MATERIALS[br.mat], sb = 0.8 * UI.P.df;      // two bearing plates 0.8 d_f apart (layout estimate)
  const Fload = Math.abs(c.rootM) / sb + Math.abs(c.rootV) / 2, ang = lc === 'landing' ? -90 : 90;
  const Dh = F.tube.D * 1000 + 12;                                          // flanged bearing OD ≈ shaft + 12 mm (estimate)
  const b = M.bracketFE({ W: br.W, H: br.H, Dh, yc: br.H * 0.58, t: br.t, E: m.E / 1e6, nu: 0.33, F: Fload, ang });
  br.B = b; const cm = cmap(), allow = m.sig / 1e6 / sp.FoS, svg = $('#fe-br', el), Wv = 420, Hv = 330, s = Math.min((Wv - 40) / br.W, (Hv - 80) / br.H), ox = 20, oy = Hv - 50;
  const P = (x, y) => [ox + x * s, oy - y * s], sc = b.umax > 0 ? 6 / (b.umax * s) : 0;      // deformation drawn so the largest move is 6 px
  let g = '';
  b.tri.forEach((t, e) => { const pts = t.map(k => P(b.nodes[k][0], b.nodes[k][1])); const col = cm(b.vm[e] / allow); g += `<path d="M${pts.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' L')}Z" fill="${col}" stroke="${col}" stroke-width="0.4"/>`; });
  // deformed outer boundary + hole
  const ring = j => { let d = ''; const Nth = 64; for (let i = 0; i <= Nth; i++) { const k = (i % Nth) * 15 + j; const [x, y] = P(b.nodes[k][0] + sc * b.u[2 * k], b.nodes[k][1] + sc * b.u[2 * k + 1]); d += (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1); } return d; };
  g += `<path d="${ring(14)}" fill="none" stroke="var(--ink)" stroke-dasharray="4 3" stroke-width="1"/><path d="${ring(0)}" fill="var(--sheet)" stroke="var(--ink)" stroke-width="1"/>`;
  const [hx, hy] = P(br.W / 2, br.H * 0.58), dir = ang > 0 ? -1 : 1;
  g += `<line x1="${hx}" x2="${hx}" y1="${hy}" y2="${hy + dir * 38}" stroke="var(--accent)" stroke-width="3" marker-end="url(#bra)"/><text x="${hx + 8}" y="${hy + dir * 30}" class="t-acc">${fmt(Fload, 0)} N</text>`;
  for (let x = 0; x <= br.W; x += 6) { const [a1, a2] = P(x, 0); g += `<line x1="${a1}" x2="${a1 - 5}" y1="${a2 + 1}" y2="${a2 + 7}" stroke="var(--ink-3)"/>`; }
  g += `<defs><marker id="bra" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10z" fill="var(--accent)"/></marker></defs>`;
  g += colorbar(Wv - 220, 10, 200, cm, 0, allow, 'MPa');
  g += `<text x="10" y="${Hv - 8}" class="t-3">${br.W} × ${br.H} × ${br.t} mm ${m.name}, Ø${fmt(Dh, 0)} bearing bore, bottom edge bolted · dashed = deformed ×${fmt(sc, 0)}</text>`;
  svg.setAttribute('viewBox', `0 0 ${Wv} ${Hv}`); svg.innerHTML = g;
  const MS = allow / b.vmax - 1;
  $('#fe-br-r', el).innerHTML = [['Bearing load per plate', fmt(Fload, 0) + ' N', `root moment ${fmt(Math.abs(c.rootM), 1)} N·m over ${fmt(sb * 1000, 0)} mm plate spacing + half the root shear`],
    ['Peak von Mises', fmt(b.vmax, 1) + ' MPa', `${b.tri.length} elements, ${b.ndof} DOF, CG converged in ${b.iters} iterations`],
    ['Allowable / FoS', fmt(allow, 0) + ' MPa', `${m.name}`], ['Margin of safety', `<span class="chip ${MS >= 0.25 ? 'ok' : MS >= 0 ? 'warn' : 'bad'}">${MS > 10 ? '> +10' : (MS >= 0 ? '+' : '') + fmt(MS, 2)}</span>`, 'F6'],
    ['Peak displacement', fmt(b.umax * 1000, 2) + ' µm', 'in-plane']].map(([a, v, n]) => `<tr><td>${a}<span class="f">${n}</span></td><td class="n">${v}</td></tr>`).join('');
}
function path() {
  const S = M.simulate(UI.R, UI.P, { hTr: 20, tClimb: 8, tHold: 3, tTr: 12, tEnd: 45, dt: 0.1 });
  const pth = S.trace.filter((q, i) => i % 3 === 0 && q.z > 1).map(q => ({ d: q.d, V: q.V, th: q.th, vW: q.vW }));
  pth.push({ d: 0, V: 1.25 * UI.P.Vc, th: 0 }); return pth;
}
// contour drawing: plan view of wing + tail coloured by spar von Mises / allowable, side view of fuselage
function contour(svg, r, p) {
  const c = F.cases[lc], cm = cmap(), allow = F.mat.sig / sp.FoS, W = 640, Hh = 330, k = (W - 60) / p.span, ox = W / 2, oy = 40;
  const X = y => ox + y * k, Y = x => oy + (x - r.xLEroot + 0.05) * k;
  let g = '';
  const tw = Math.tan(r.sweepLE * Math.PI / 180);
  for (const sgn of [-1, 1]) for (let i = 0; i < F.ys.length - 1; i++) {
    const y0 = F.ys[i], y1 = F.ys[i + 1], ch = y => r.cr - (r.cr - r.ct) * y / (p.span / 2);
    const v = Math.max(c.vm[i], c.vm[i + 1]) / allow;
    g += `<path d="M${X(sgn * y0)},${Y(r.xLEroot + y0 * tw)} L${X(sgn * y1)},${Y(r.xLEroot + y1 * tw)} L${X(sgn * y1)},${Y(r.xLEroot + ch(y1))} L${X(sgn * y0)},${Y(r.xLEroot + ch(y0))}Z" fill="${cm(v)}" stroke="${cm(v)}" stroke-width="0.6"><title>y ${fmt(sgn * y0, 3)} m: σ_vm ${fmt(c.vm[i] / 1e6, 1)} MPa</title></path>`;
  }
  // spar line + rotor stations
  g += `<line x1="${X(-p.span / 2)}" x2="${X(p.span / 2)}" y1="${Y(r.xw)}" y2="${Y(r.xw)}" stroke="var(--ink)" stroke-width="1" stroke-dasharray="6 4"/>`;
  F.rotIdx.forEach(j => [-1, 1].forEach(sgn => { g += `<circle cx="${X(sgn * F.ys[j])}" cy="${Y(r.xLEroot + F.ys[j] * tw) - 8}" r="5" fill="var(--sheet)" stroke="var(--ink)"/>`; }));
  // fuselage (side strip) coloured by its stress, below
  const fc = lc === 'landing' ? F.fus.landing : F.fus.hover, fa = F.fm.sig / sp.FoS, fy = Hh - 70, fk = (W - 60) / p.Lf;
  for (let i = 0; i < F.fus.xs.length - 1; i++) { const x0 = 30 + F.fus.xs[i] * fk, x1 = 30 + F.fus.xs[i + 1] * fk, R0 = F.fus.prof[i] * fk, R1 = F.fus.prof[i + 1] * fk, v = Math.max(fc.sig[i], fc.sig[i + 1]) / fa;
    g += `<path d="M${x0},${fy - R0} L${x1},${fy - R1} L${x1},${fy + R1} L${x0},${fy + R0}Z" fill="${cm(v * 20)}" stroke="none"/>`; }
  g += `<text x="30" y="${fy - p.df / 2 * fk - 8}" class="t-3">fuselage shell, side view (colour ×20 so it is visible: peak ${fmt(fc.vmax / 1e6, 2)} MPa)</text>`;
  [fc.xa, fc.xb].forEach(x => { g += `<path d="M${30 + x * fk},${fy + p.df / 2 * fk + 4} l-6,10 h12z" fill="var(--ink)"/>`; });
  // colour bar
  const bx = W - 220, by = 16; for (let i = 0; i < 100; i++) g += `<rect x="${bx + i * 2}" y="${by}" width="2.2" height="10" fill="${cm(i / 99)}"/>`;
  g += `<text x="${bx}" y="${by + 24}">0</text><text x="${bx + 100}" y="${by + 24}" text-anchor="middle">½</text><text x="${bx + 200}" y="${by + 24}" text-anchor="end">σ_vm = allowable / FoS</text>`;
  g += `<text x="12" y="20" class="t-ink">${c.name} · wing spar von Mises</text>`;
  svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`); svg.innerHTML = g;
}
function campbell(svg, r, p) {
  const W = 560, H = 200, L = 120, R = 16, fmax = Math.max(2.4 * F.modes.rpsMax, ...F.modes.bend) * 1.05, X = f => L + f / fmax * (W - L - R);
  let g = '';
  for (let f = 0; f <= fmax; f += 50) g += `<line x1="${X(f)}" x2="${X(f)}" y1="20" y2="${H - 30}" stroke="var(--hair)"/><text x="${X(f)}" y="${H - 14}" text-anchor="middle">${f}</text>`;
  const band = (lo, hi, y, label, col) => `<rect x="${X(lo)}" y="${y - 9}" width="${Math.max(2, X(hi) - X(lo))}" height="18" fill="var(${col})" opacity="0.35"/><text x="${L - 8}" y="${y + 4}" text-anchor="end">${label}</text>`;
  g += band(F.modes.rpsHover, F.modes.rpsMax, 40, 'rotor 1P', '--accent') + band(2 * F.modes.rpsHover, 2 * F.modes.rpsMax, 70, 'blade pass 2P', '--accent');
  const modes = [['bending 1', F.modes.bend[0]], ['torsion 1', F.modes.torsion], ['bending 2', F.modes.bend[1]]];
  modes.forEach(([n, f], i) => { const y = 110 + i * 26, hit = [[F.modes.rpsHover, F.modes.rpsMax], [2 * F.modes.rpsHover, 2 * F.modes.rpsMax]].some(([a, b]) => f > 0.85 * a && f < 1.15 * b);
    g += `<line x1="${X(f)}" x2="${X(f)}" y1="${y - 9}" y2="${y + 9}" stroke="var(${hit ? '--bad' : '--s1'})" stroke-width="4"/><text x="${L - 8}" y="${y + 4}" text-anchor="end">${n}</text><text x="${X(f) + 8}" y="${y + 4}" style="fill:var(${hit ? '--bad' : '--ink-2'})">${fmt(f, 1)} Hz${hit ? ' · within 15 % of excitation' : ''}</text>`; });
  g += `<text x="${(L + W - R) / 2}" y="${H - 1}" text-anchor="middle" class="t-3">frequency [Hz]</text>`;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = g;
}
function render(el, r, p) {
  sp.path = path(); F = M.fea(r, p, sp);
  const c = F.cases[lc], allow = F.mat.sig / sp.FoS;
  const minMS = Math.min(...Object.values(F.cases).map(x => x.MS)), worst = Object.values(F.cases).find(x => x.MS === minMS);
  const fmin = Math.min(F.modes.bend[0], F.modes.torsion), hit = [F.modes.bend[0], F.modes.torsion, F.modes.bend[1]].some(f => (f > 0.85 * F.modes.rpsHover && f < 1.15 * F.modes.rpsMax) || (f > 1.7 * F.modes.rpsHover && f < 2.3 * F.modes.rpsMax));
  $('#fe-kpi', el).innerHTML = [
    ['Wing spar margin', (minMS >= 0 ? '+' : '') + fmt(minMS, 2), '', `worst case: ${worst.name} · ${fmt(worst.vmax / 1e6, 0)} MPa`, minMS >= 0.25 ? 'ok' : minMS >= 0 ? 'warn' : 'bad'],
    ['Tip deflection', fmt(Math.max(...Object.values(F.cases).map(x => Math.abs(x.tip))) * 1000, 0), 'mm', `${fmt(Math.max(...Object.values(F.cases).map(x => Math.abs(x.tip))) / (p.span / 2) * 100, 1)} % of semispan`, Math.max(...Object.values(F.cases).map(x => Math.abs(x.tip))) / (p.span / 2) < 0.05 ? 'ok' : 'warn'],
    ['Tilt servo torque', fmt(F.hinge.servoNm, 1), 'N·m', `both halves, × FoS; worst at δ ${fmt(F.hinge.at.d, 0)}°, ${fmt(F.hinge.at.V, 1)} m/s`, ''],
    ['First mode', fmt(fmin, 1), 'Hz', `rotor 1P ${fmt(F.modes.rpsHover, 0)}–${fmt(F.modes.rpsMax, 0)} Hz`, hit ? 'bad' : 'ok'],
  ].map(([l, v, u, s, k]) => `<div class="kpi ${k}"><span class="lbl">${l}</span><span class="v">${v}<small>${u}</small></span><span class="sub">${s}</span></div>`).join('');
  $('#fe-desc', el).textContent = c.desc;
  const yy = F.ys.map(y => +(y).toFixed(4));
  lineChart($('#fe-vm', el), { series: [{ name: 'σ bending', color: '--s1', pts: yy.map((y, i) => [y, c.sig[i] / 1e6]) }, { name: 'von Mises', color: '--accent', pts: yy.map((y, i) => [y, c.vm[i] / 1e6]) }], legendRight: true, x: { label: 'spanwise station y [m]' }, y: { min: 0, label: 'stress [MPa]' }, hlines: [{ y: allow / 1e6, label: `allowable / FoS ${fmt(allow / 1e6, 0)}` }] });
  lineChart($('#fe-vmom', el), { series: [{ name: 'moment N·m', color: '--s4', pts: yy.map((y, i) => [y, c.M[i]]) }, { name: 'shear N', color: '--s2', pts: yy.map((y, i) => [y, c.V[i]]), dash: '5 4' }, { name: 'torque N·m', color: '--s3', pts: yy.map((y, i) => [y, c.T[i]]) }], legendRight: true, x: { label: 'spanwise station y [m]' }, y: { label: 'N·m  ·  N' } });
  lineChart($('#fe-defl', el), { series: Object.entries(F.cases).map(([k, x], i) => ({ name: x.name.split(',')[0].split(' /')[0], color: ['--s1', '--s4', '--s3'][i], width: k === lc ? 3 : 1.5, pts: yy.map((y, j) => [y, x.w[j] * 1000]) })), legendRight: true, x: { label: 'spanwise station y [m]' }, y: { label: 'deflection [mm]' } });
  lineChart($('#fe-modes', el), { series: F.modes.shapes.map((s, i) => { const mx = Math.max(...s.map(Math.abs)) || 1; return { name: `bending ${i + 1} · ${fmt(F.modes.bend[i], 1)} Hz`, color: i ? '--s4' : '--s1', pts: yy.map((y, j) => [y, s[j] / mx]) }; }), legendRight: true, x: { label: 'spanwise station y [m]' }, y: { min: -1.1, max: 1.1, label: 'normalised shape' } });
  contour($('#fe-con', el), r, p); campbell($('#fe-camp', el), r, p);
  sparMap($('#fe-map', el)); sparSection($('#fe-sec', el)); fusMap($('#fe-fus', el)); bracket(el);
  const st = ms => ms >= 0.25 ? 'ok' : ms >= 0 ? 'warn' : 'bad';
  const msTxt = ms => ms > 10 ? '> +10' : (ms >= 0 ? '+' : '') + fmt(ms, 2);
  const rows = [
    ...Object.values(F.cases).map(x => [`Wing spar · ${x.name}`, x.vmax, F.mat.sig, x.MS, `${fmt(x.tip * 1000, 1)} mm tip`, `buckling MS ${msTxt(x.MSb)}`]),
    ['Tilt shaft (spar in fuselage)', F.shaft.vm, F.mat.sig, F.shaft.MS, `root M ${fmt(F.shaft.M, 1)} N·m`, `torque ${fmt(F.shaft.T, 1)} N·m per side`],
    ['Tail spar · elevator max / tail-rotor max', F.tail.vmax, F.tail.mat.sig, F.tail.MS, `${fmt(F.tail.tip * 1000, 1)} mm tip`, `tail lift ${fmt(F.tail.LtMax, 0)} N at 1.25 V_c`],
    ['Fuselage shell · hover', F.fus.hover.vmax, F.fm.sig, F.fus.hover.MS, `reactions ${fmt(F.fus.hover.Ra, 0)} / ${fmt(F.fus.hover.Rb, 0)} N`, `buckling MS ${msTxt(F.fus.hover.MSb)}`],
    ['Fuselage shell · hard landing', F.fus.landing.vmax, F.fm.sig, F.fus.landing.MS, `gear ${fmt(F.fus.landing.Ra, 0)} / ${fmt(F.fus.landing.Rb, 0)} N`, `buckling MS ${msTxt(F.fus.landing.MSb)}`],
  ];
  $('#fe-tab', el).innerHTML = rows.map(([n, v, a, ms, d1, d2]) => `<tr><td>${n}</td><td class="n">${fmt(v / 1e6, 1)}</td><td class="n">${fmt(a / 1e6, 0)}</td><td class="n ${st(ms)}">${msTxt(ms)}</td><td>${d1}</td><td>${d2}</td></tr>`).join('');
  $('#fe-mass', el).textContent = `Spar mass ${fmt(2 * F.mSparHalf * 1000, 0)} g for both halves (${F.mat.name}). Gust Δn ${fmt(F.dnG, 2)} (K_g ${fmt(F.Kg, 2)}); design n = ${fmt(F.nCruise, 2)}. ${fmt(F.outboard * 100, 0)} % of the half-wing lift acts outboard of the bearing.`;
}

pane({ id: 'fea', n: '06', name: 'Structures',
  build(el) {
    const opt = (keys, cur) => keys.map(k => `<option value="${k}" ${k === cur ? 'selected' : ''}>${M.MATERIALS[k].name}</option>`).join('');
    el.innerHTML = `<div class="main-in">
      <div class="sec"><div class="sec-h"><h2>Structural FEA</h2><span class="lbl">beam finite elements · formulas F1–F7</span></div>
      <p class="lede">Euler–Bernoulli beam elements for each wing-half spar (clamped at the tilt bearing), the tail spar and the fuselage shell, under three load cases. Loads come from the sizing, aero and transition models, so every slider on the left changes them. Stresses are checked against the material allowable divided by the factor of safety; modes are checked against rotor excitation.</p></div>
      <div class="kpis" id="fe-kpi"></div>
      <div class="panel"><div class="panel-b" style="display:grid;gap:12px">
        <div class="cols3" style="gap:10px 18px">
          <label class="sl" style="display:grid"><span>Wing spar material</span><select id="fe-sparMat" class="btn">${opt(['cf_tube', 'al6061', 'al7075', 'gf_tube'], sp.sparMat)}</select></label>
          <label class="sl" style="display:grid"><span>Tail spar material</span><select id="fe-tailMat" class="btn">${opt(['cf_tube', 'al6061', 'al7075', 'gf_tube'], sp.tailMat)}</select></label>
          <label class="sl" style="display:grid"><span>Fuselage shell material</span><select id="fe-fusMat" class="btn">${opt(['gf_shell', 'cf_shell'], sp.fusMat)}</select></label>
          ${SL.map(([k, l, u, a, b, st]) => `<div class="sl"><label for="fe-${k}">${l}</label><output id="fe-${k}-o"></output><input type="range" id="fe-${k}" min="${a}" max="${b}" step="${st}" value="${sp[k]}"><span class="note">${u}</span></div>`).join('')}
        </div>
        <p class="src">Spar and shell sizes are starting estimates for this design, not values from the paper (it does not give a structure). Allowables: ${Object.values(M.MATERIALS).map(m => m.name + ' ' + fmt(m.sig / 1e6, 0) + ' MPa (' + m.src + ')').join('; ')}.</p>
      </div></div>
      <div class="panel"><div class="panel-h"><h3>Stress contour</h3>
        <div class="chips" role="radiogroup" aria-label="Load case">${['hover', 'cruise', 'landing'].map(k => `<label class="btn" style="display:inline-flex;gap:6px;align-items:center"><input type="radio" name="fe-lc" value="${k}" ${k === lc ? 'checked' : ''}> ${{ hover: 'Hover max thrust', cruise: 'Cruise gust', landing: 'Hard landing' }[k]}</label>`).join('')}</div></div>
        <div class="panel-b"><svg id="fe-con" role="img" aria-label="Plan view of the wing coloured by spar stress"></svg><p class="src" id="fe-desc"></p></div></div>
      <div class="cols" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)">
        <div class="panel"><div class="panel-h"><h3>Spar surface stress map</h3><span class="lbl">contour, unrolled tube</span></div><div class="panel-b"><svg id="fe-map" role="img" aria-label="Contour of bending stress over the spar surface"></svg></div></div>
        <div class="panel"><div class="panel-h"><h3>Root cross-section</h3><span class="lbl">contour</span></div><div class="panel-b"><svg id="fe-sec" role="img" aria-label="Stress around the spar root cross-section"></svg></div></div>
      </div>
      <div class="panel"><div class="panel-h"><h3>Fuselage shell stress map</h3><span class="lbl">contour, unrolled shell</span></div><div class="panel-b"><svg id="fe-fus" role="img" aria-label="Contour of stress over the fuselage shell"></svg>
        <p class="src">Thin-shell beam theory: σ = M R cosφ / (π R³ t), τ = V sinφ / (π R t). Blue compression, red tension. Local loads at the wing bearing and gear mounts are not included here.</p></div></div>
      <div class="panel"><div class="panel-h"><h3>Tilt-bearing bracket · 2-D plane-stress FE</h3><span class="lbl">formula F8 · contour + deformed shape</span></div>
        <div class="panel-b cols" style="align-items:start"><svg id="fe-br" role="img" aria-label="Von Mises stress contour on the tilt-bearing bracket plate"></svg>
          <div style="display:grid;gap:10px">
            <div class="cols" style="gap:8px 14px">
              <div class="sl"><label for="fe-brt">Plate thickness</label><output id="fe-brt-o">${br.t} mm</output><input type="range" id="fe-brt" min="1.5" max="8" step="0.5" value="${br.t}"></div>
              <div class="sl"><label for="fe-brw">Plate width</label><output id="fe-brw-o">${br.W} mm</output><input type="range" id="fe-brw" min="50" max="140" step="5" value="${br.W}"></div>
              <div class="sl"><label for="fe-brh">Plate height</label><output id="fe-brh-o">${br.H} mm</output><input type="range" id="fe-brh" min="50" max="120" step="5" value="${br.H}"></div>
              <label class="sl" style="display:grid"><span>Plate material</span><select id="fe-brm" class="btn">${['al6061', 'al7075', 'cf_shell', 'gf_shell'].map(k => `<option value="${k}" ${k === br.mat ? 'selected' : ''}>${M.MATERIALS[k].name}</option>`).join('')}</select></label>
            </div>
            <div class="tw"><table><tbody id="fe-br-r"></tbody></table></div>
            <p class="src">Each wing half's spar root sits in a flanged ball bearing held by two plates. Constant-strain triangles on a mesh graded towards the bore; the bearing load is spread over the half of the bore facing the load (cosine), the bottom edge is fixed. Mesh refinement 48 → 96 elements around the bore changes the peak stress by 5 %.</p>
          </div></div></div>
      <div class="cols">
        <div class="panel"><div class="panel-h"><h3>Spar stress along the span</h3></div><div class="panel-b"><svg id="fe-vm"></svg></div></div>
        <div class="panel"><div class="panel-h"><h3>Shear, bending and torsion</h3></div><div class="panel-b"><svg id="fe-vmom"></svg></div></div>
        <div class="panel"><div class="panel-h"><h3>Deflection, all load cases</h3></div><div class="panel-b"><svg id="fe-defl"></svg></div></div>
        <div class="panel"><div class="panel-h"><h3>Bending mode shapes</h3><span class="lbl">one wing half</span></div><div class="panel-b"><svg id="fe-modes"></svg></div></div>
      </div>
      <div class="panel"><div class="panel-h"><h3>Frequency placement</h3><span class="lbl">modes vs rotor excitation</span></div><div class="panel-b"><svg id="fe-camp" role="img" aria-label="Natural frequencies compared with rotor excitation bands"></svg>
        <p class="src">Rotor speed from T = C<sub>T</sub> ρ n² D⁴ with C<sub>T</sub> 0.11 (estimate), hover to maximum thrust. Torsion by Rayleigh's method with the rotor masses ahead of the spar.</p></div></div>
      <div class="panel"><div class="panel-h"><h3>Component summary</h3><span class="lbl" id="fe-mass"></span></div><div class="tw"><table><thead><tr><th>Component · load case</th><th class="n">σ max MPa</th><th class="n">allowable MPa</th><th class="n">MS</th><th>Deflection / reactions</th><th>Notes</th></tr></thead><tbody id="fe-tab"></tbody></table></div>
        <div class="panel-b"><p class="src">MS = allowable / (FoS × σ) − 1 (F6). Fuselage stresses are global bending only; cut-outs, the wing bearing and gear mounts need local analysis.</p></div></div>
      </div>`;
    SL.forEach(([k, , u, , , st]) => { const i = $('#fe-' + k, el), o = $('#fe-' + k + '-o', el); const show = () => o.textContent = fmt(sp[k], st < 0.1 ? 2 : st < 1 ? 1 : 0) + (u ? ' ' + u : ''); show(); i.addEventListener('input', () => { sp[k] = +i.value; show(); render(el, UI.R, UI.P); }); });
    ['sparMat', 'tailMat', 'fusMat'].forEach(k => $('#fe-' + k, el).addEventListener('change', e => { sp[k] = e.target.value; render(el, UI.R, UI.P); }));
    el.querySelectorAll('input[name=fe-lc]').forEach(i => i.addEventListener('change', () => { lc = i.value; render(el, UI.R, UI.P); }));
    [['fe-brt', 't', ' mm'], ['fe-brw', 'W', ' mm'], ['fe-brh', 'H', ' mm']].forEach(([id, k, u]) => { const i = $('#' + id, el); i.addEventListener('input', () => { br[k] = +i.value; $('#' + id + '-o', el).textContent = i.value + u; bracket(el); }); });
    $('#fe-brm', el).addEventListener('change', e => { br.mat = e.target.value; bracket(el); });
  },
  render, themed() { const el = $('#pane-fea'); if (el && !el.hidden) render(el, UI.R, UI.P); }
});
});
