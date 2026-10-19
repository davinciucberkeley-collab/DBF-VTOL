/* Step 4 — transition and mission simulation (formulas S1–S4, E1–E2). */
window.STEP_PANES.push(function (UI, M) {
const { fmt, pane, lineChart } = UI;
const $ = (s, el = document) => el.querySelector(s);
const so = { tTr: 12, hTr: 20, tEnd: 45, shape: 'cosine', seed: 7, tClimb: 8, tHold: 3 };
let SIM = null, COR = null, corKey = '', play = null, tCur = 0;

function corridorGrid(r, p) {
  const Vs = [], ds = []; for (let v = 0; v <= 26; v += 1) Vs.push(v); for (let d = 0; d <= 90; d += 5) ds.push(d);
  return { Vs, ds, pts: M.corridor(r, p, Vs, ds) };
}
function drawCorridor(svg, r, p) {
  const W = 560, H = 330, L = 48, R = 14, T = 12, B = 40, c = COR;
  const X = v => L + v / 26 * (W - L - R), Y = d => H - B - d / 90 * (H - T - B);
  const cw = (W - L - R) / 26, chh = (H - T - B) / 18;
  let g = '';
  c.pts.forEach(q => { if (q.state === 'none') return; g += `<rect x="${X(q.V) - cw / 2}" y="${Y(q.d) - chh / 2}" width="${cw}" height="${chh}" fill="var(${q.state === 'ok' ? '--ok' : '--warn'})" opacity="${q.state === 'ok' ? 0.55 : 0.4}"><title>V ${q.V} m/s, δ ${q.d}°: ${q.state === 'ok' ? 'steady level flight' : 'level but wing stalled'}, pitch ${fmt(q.th, 1)}°, ${fmt(q.P, 0)} W</title></rect>`; });
  for (let v = 0; v <= 26; v += 2) g += `<text x="${X(v)}" y="${H - B + 15}" text-anchor="middle">${v}</text>`;
  for (let d = 0; d <= 90; d += 15) g += `<line x1="${L}" x2="${W - R}" y1="${Y(d)}" y2="${Y(d)}" stroke="var(--hair)"/><text x="${L - 6}" y="${Y(d) + 4}" text-anchor="end">${d}</text>`;
  g += `<line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" stroke="var(--construct)"/><line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="var(--construct)"/>`;
  g += `<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle" class="t-3">airspeed V [m/s]</text><text transform="translate(12 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle" class="t-3">wing tilt δ_TW [deg]</text>`;
  if (SIM) {
    const tr = SIM.trace.filter(s => s.t >= SIM.t2 - 0.5);
    g += `<polyline fill="none" stroke="var(--accent)" stroke-width="2.5" points="${tr.map(s => X(Math.min(26, s.V)).toFixed(1) + ',' + Y(s.d).toFixed(1)).join(' ')}"/>`;
    const cur = SIM.trace.reduce((a, s) => Math.abs(s.t - tCur) < Math.abs(a.t - tCur) ? s : a, SIM.trace[0]);
    g += `<circle cx="${X(Math.min(26, cur.V))}" cy="${Y(cur.d)}" r="6" fill="var(--accent)" stroke="var(--sheet)" stroke-width="2"/>`;
    g += `<text x="${X(Math.min(26, cur.V)) + 9}" y="${Y(cur.d) - 8}" class="t-acc">t ${fmt(cur.t, 1)} s</text>`;
  }
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = g;
}
// side view of the aircraft at the current sample
function drawSide(svg, r, p) {
  if (!SIM) return;
  const W = 640, H = 230, tr = SIM.trace, cur = tr.reduce((a, s) => Math.abs(s.t - tCur) < Math.abs(a.t - tCur) ? s : a, tr[0]);
  const xMax = Math.max(60, tr[tr.length - 1].x), zMax = Math.max(30, ...tr.map(s => s.z)) * 1.25;
  const X = x => 20 + x / xMax * (W - 40), Z = z => H - 24 - z / zMax * (H - 50);
  let g = `<line x1="0" x2="${W}" y1="${Z(0)}" y2="${Z(0)}" stroke="var(--construct)"/>`;
  g += `<polyline fill="none" stroke="var(--s1)" stroke-dasharray="4 4" stroke-width="1.5" points="${tr.map(s => X(s.x).toFixed(1) + ',' + Z(s.z).toFixed(1)).join(' ')}"/>`;
  // aircraft glyph, 1.8 m drawn at 26 px per metre, independent of the trajectory scale
  const k = 26, cx = X(cur.x), cz = Z(cur.z), th = cur.th * Math.PI / 180, d = cur.d * Math.PI / 180;
  const rot = (x, z, a) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];
  const P = (x, z) => { const [a, b] = rot(x, z, th); return [cx + a * k, cz - b * k]; };
  const fus = UI.fuselageProfile(p.Lf, p.df / 2, 24), xo = r.xcg;
  const top = fus.map(([x, rr]) => P(xo - x, rr)), bot = fus.slice().reverse().map(([x, rr]) => P(xo - x, -rr));
  g += `<path d="M${top.concat(bot).map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' L')}Z" fill="var(--tint-2)" stroke="var(--ink)" stroke-width="1"/>`;
  const surf = (xa, za, c, ang, col) => { const [a1, b1] = rot(0.3 * c, 0, ang), [a2, b2] = rot(-0.7 * c, 0, ang); const A = P(xa + a1, za + b1), B = P(xa + a2, za + b2); return `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" stroke="var(${col})" stroke-width="4" stroke-linecap="round"/>`; };
  g += surf(xo - r.xw, 0.42 * p.df, r.cr, d, '--ink') + surf(xo - r.xt, 0.12 * p.df, r.crh, d, '--ink-2');
  // rotor disks + thrust arrows
  const rotor = (xa, za, c, D, sc) => { const [a, b] = rot(0.3 * c + 0.12, 0, d); const C = [xa + a, za + b]; const [n1, n2] = rot(0, D / 2, d); const A = P(C[0] + n1, C[1] + n2), B = P(C[0] - n1, C[1] - n2); const [t1, t2] = rot(0.6 * sc, 0, d), Tt = P(C[0] + t1, C[1] + t2), Cc = P(C[0], C[1]);
    return `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" stroke="var(--ink-3)" stroke-width="2"/><line x1="${Cc[0]}" y1="${Cc[1]}" x2="${Tt[0]}" y2="${Tt[1]}" stroke="var(--accent)" stroke-width="2.5"/>`; };
  g += rotor(xo - r.xw, 0.42 * p.df, r.cr, r.Df, cur.Tpct / 100) + rotor(xo - r.xt, 0.12 * p.df, r.crh, r.Dr, cur.Tpct / 200);
  g += `<text x="12" y="18" class="t-ink">t ${fmt(cur.t, 1)} s · alt ${fmt(cur.z, 1)} m · airspeed ${fmt(cur.V, 1)} m/s · tilt ${fmt(cur.d, 0)}° · pitch ${fmt(cur.th, 1)}° · thrust ${fmt(cur.Tpct, 0)} % · ${fmt(cur.P, 0)} W</text>`;
  g += `<text x="${W - 12}" y="${H - 6}" text-anchor="end" class="t-3">trajectory to scale (${fmt(xMax, 0)} m across) · aircraft glyph enlarged · orange = thrust</text>`;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = g;
}
function charts(el, r, p) {
  const tr = SIM.trace, pick = k => tr.map(s => [s.t, s[k]]);
  const vl = [{ x: SIM.t2, label: 'start', color: '--construct' }, { x: SIM.t3, label: 'end', color: '--construct' }];
  const mk = (k) => { const c = tr.reduce((a, s) => Math.abs(s.t - tCur) < Math.abs(a.t - tCur) ? s : a, tr[0]); return { x: c.t, y: c[k], label: fmt(c[k], 1) }; };
  lineChart($('#sm-alt', el), { series: [{ name: 'altitude', color: '--s1', pts: pick('z') }, { name: 'airspeed', color: '--s3', pts: pick('V') }], legendRight: true, x: { min: 0, max: so.tEnd, label: 'time [s]' }, y: { min: 0, label: 'm  ·  m/s' }, vlines: vl, marker: mk('z') });
  lineChart($('#sm-ang', el), { series: [{ name: 'tilt δ', color: '--accent', pts: pick('d') }, { name: 'pitch θ', color: '--s2', pts: pick('th') }], legendRight: true, x: { min: 0, max: so.tEnd, label: 'time [s]' }, y: { label: 'deg' }, vlines: vl, marker: mk('d') });
  lineChart($('#sm-pow', el), { series: [{ name: 'electric W', color: '--s4', pts: pick('P') }], legendRight: true, x: { min: 0, max: so.tEnd, label: 'time [s]' }, y: { min: 0, label: 'power [W]' }, vlines: vl, hlines: [{ y: r.Pinst, label: 'installed ' + fmt(r.Pinst, 0) + ' W' }], marker: mk('P') });
  const cs = M.clmax2D('s1223', r.ReV).alpha;
  lineChart($('#sm-aoa', el), { series: [{ name: 'blown', color: '--s1', pts: tr.filter(s => s.z > 0.3).map(s => [s.t, s.aB]) }, { name: 'unblown', color: '--s5', pts: tr.filter(s => s.z > 0.3 && s.V > 2).map(s => [s.t, s.aU]) }], legendRight: true, x: { min: 0, max: so.tEnd, label: 'time [s]' }, y: { min: -10, max: 90, label: 'wing α_eff [deg]' }, vlines: vl, hlines: [{ y: cs, label: 'section stall ' + fmt(cs, 0) + '°' }] });
  lineChart($('#sm-lift', el), { series: [{ name: 'wing lift', color: '--s2', pts: pick('wingLift') }, { name: 'thrust, vertical', color: '--accent', pts: pick('thrustVert') }], legendRight: true, x: { min: 0, max: so.tEnd, label: 'time [s]' }, y: { label: 'N' }, vlines: vl, hlines: [{ y: r.W, label: 'weight', color: '--construct' }] });
  lineChart($('#sm-mom', el), { series: [{ name: '|M| / authority', color: '--s6', pts: tr.filter(s => !s.ground && s.z > 0.5).map(s => [s.t, Math.abs(s.M) / s.auth]) }], legendRight: true, x: { min: 0, max: so.tEnd, label: 'time [s]' }, y: { min: 0, label: 'pitch moment used' }, vlines: vl, hlines: [{ y: 1, label: 'limit' }] });
}
function kpis(el, r, p) {
  const s = SIM.summary, cs = M.clmax2D('s1223', r.ReV).alpha;
  $('#sm-kpi', el).innerHTML = [
    ['Altitude change', '−' + fmt(s.altLoss, 1) + ' / +' + fmt(s.altGain, 1), 'm', 'during the transition and 5 s after', s.altLoss < 2 ? 'ok' : s.altLoss < 5 ? 'warn' : 'bad'],
    ['Peak wing α', fmt(s.aMax, 0), '°', `section stall ${fmt(cs, 0)}°; brief stall is expected at mid tilt`, s.aMax < cs + 2 ? 'ok' : 'warn'],
    ['Peak thrust / power', fmt(s.Tmaxpct, 0) + ' %', '', `${fmt(s.Pmax, 0)} W of ${fmt(r.Pinst, 0)} W installed`, s.Tmaxpct < 95 ? 'ok' : s.Tmaxpct <= 100 ? 'warn' : 'bad'],
    ['Pitch authority used', fmt(s.Mmax * 100, 0), '%', `energy to end of transition ${fmt(s.Etr, 1)} Wh`, s.Mmax <= 0.8 ? 'ok' : s.Mmax <= 1 ? 'warn' : 'bad'],
  ].map(([l, v, u, sub, c]) => `<div class="kpi ${c}"><span class="lbl">${l}</span><span class="v">${v}<small>${u}</small></span><span class="sub">${sub}</span></div>`).join('');
}
function run(el, r, p) {
  SIM = M.simulate(r, p, Object.assign({}, so, { dt: 0.05 }));
  const sc = $('#sm-t', el); sc.max = so.tEnd; if (tCur > so.tEnd) tCur = so.tEnd; sc.value = tCur;
  $('#sm-hover', el).textContent = `Hover tilt for zero drift: ${fmt(SIM.hover, 1)}° (the cambered wing in its own slipstream pushes the aircraft aft at 90°).`;
  kpis(el, r, p); charts(el, r, p); drawSide($('#sm-side', el), r, p);
  const key = JSON.stringify(p);
  if (key !== corKey) { corKey = key; $('#sm-cor-busy', el).hidden = false; setTimeout(() => { COR = corridorGrid(UI.R, UI.P); $('#sm-cor-busy', el).hidden = true; drawCorridor($('#sm-cor', el), UI.R, UI.P); }, 30); }
  else if (COR) drawCorridor($('#sm-cor', el), r, p);
}

pane({ id: 'sim', n: '05', name: 'Transition',
  build(el) {
    el.innerHTML = `<div class="main-in">
      <div class="sec"><div class="sec-h"><h2>Transition and mission simulation</h2><span class="lbl">point-mass, 20 Hz · formulas S1–S4, E1–E2</span></div>
      <p class="lede">Vertical take-off, hover, then the wing tilts from the hover angle to 0° on a schedule while a controller holds altitude, first with thrust and then with pitch, and finally holds cruise airspeed. Forces come from the Aero model with rotor slipstream on the wing; wind and gusts come from the Environment sliders.</p></div>
      <div class="kpis" id="sm-kpi"></div>
      <div class="panel"><div class="panel-h"><h3>Flight</h3><span class="lbl" id="sm-hover"></span></div>
        <div class="panel-b" style="display:grid;gap:10px"><svg id="sm-side" role="img" aria-label="Side view of the trajectory and aircraft attitude"></svg>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn primary" id="sm-play" type="button">Play</button>
          <div class="sl" style="flex:1;min-width:220px"><label for="sm-t">Time</label><output id="sm-t-o">0 s</output><input type="range" id="sm-t" min="0" max="45" step="0.1" value="0"></div></div></div></div>
      <div class="panel"><div class="panel-b cols3" style="gap:12px 18px">
        <div class="sl"><label for="sm-tTr">Transition time</label><output id="sm-tTr-o"></output><input type="range" id="sm-tTr" min="4" max="40" step="0.5" value="${so.tTr}"></div>
        <div class="sl"><label for="sm-hTr">Transition altitude</label><output id="sm-hTr-o"></output><input type="range" id="sm-hTr" min="5" max="60" step="1" value="${so.hTr}"></div>
        <div class="sl"><label for="sm-tEnd">Simulated time</label><output id="sm-tEnd-o"></output><input type="range" id="sm-tEnd" min="30" max="120" step="5" value="${so.tEnd}"></div>
        <label class="btn" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="sm-lin"> Linear tilt ramp (default cosine)</label>
        <div class="sl"><label for="sm-seed">Gust seed</label><output id="sm-seed-o"></output><input type="range" id="sm-seed" min="1" max="50" step="1" value="${so.seed}"></div>
        <p class="src" style="align-self:center">Wind, gusts, altitude and temperature are in the Environment group of the left rail.</p>
      </div></div>
      <div class="cols">
        <div class="panel"><div class="panel-h"><h3>Altitude and airspeed</h3></div><div class="panel-b"><svg id="sm-alt"></svg></div></div>
        <div class="panel"><div class="panel-h"><h3>Tilt and pitch</h3></div><div class="panel-b"><svg id="sm-ang"></svg></div></div>
        <div class="panel"><div class="panel-h"><h3>Electrical power</h3><span class="lbl">S2</span></div><div class="panel-b"><svg id="sm-pow"></svg></div></div>
        <div class="panel"><div class="panel-h"><h3>Wing angle of attack</h3><span class="lbl">blown and unblown span</span></div><div class="panel-b"><svg id="sm-aoa"></svg></div></div>
        <div class="panel"><div class="panel-h"><h3>Who carries the weight</h3></div><div class="panel-b"><svg id="sm-lift"></svg></div></div>
        <div class="panel"><div class="panel-h"><h3>Pitch control margin</h3><span class="lbl">tail rotors + elevator</span></div><div class="panel-b"><svg id="sm-mom"></svg>
          <p class="src">Authority = tail-rotor pitch reserve × tail arm + elevator ±20° at the current dynamic pressure. Above 1 the aircraft cannot hold pitch.</p></div></div>
      </div>
      <div class="panel"><div class="panel-h"><h3>Transition corridor</h3><span class="lbl" id="sm-cor-busy" hidden>computing…</span></div>
        <div class="panel-b cols" style="align-items:start"><svg id="sm-cor" role="img" aria-label="Map of airspeed and tilt angle where steady level flight is possible"></svg>
        <div style="display:grid;gap:8px"><p class="lede" style="font-size:14.5px">Green cells: steady level flight possible with 0 ≤ T ≤ T<sub>max</sub> and pitch between −10° and +15° (S4). Amber: possible, but the wing is past section stall. Blank: no steady solution. The orange line is the simulated transition; it may cross blank cells because the aircraft is accelerating there, not flying steadily.</p>
        <div class="legend"><span><i style="background:var(--ok);opacity:.55"></i>steady, attached flow</span><span><i style="background:var(--warn);opacity:.4"></i>steady, wing stalled</span><span><i style="background:var(--accent)"></i>simulated path</span></div></div></div></div>
      </div>`;
    const bind = (id, key, fmtf) => { const i = $('#' + id, el), o = $('#' + id + '-o', el); const show = () => o.textContent = fmtf(so[key]); show(); i.addEventListener('input', () => { so[key] = +i.value; show(); run(el, UI.R, UI.P); }); };
    bind('sm-tTr', 'tTr', v => v + ' s'); bind('sm-hTr', 'hTr', v => v + ' m'); bind('sm-tEnd', 'tEnd', v => v + ' s'); bind('sm-seed', 'seed', v => String(v));
    $('#sm-lin', el).addEventListener('change', e => { so.shape = e.target.checked ? 'linear' : 'cosine'; run(el, UI.R, UI.P); });
    const sc = $('#sm-t', el);
    const scrub = () => { tCur = +sc.value; $('#sm-t-o', el).textContent = fmt(tCur, 1) + ' s'; drawSide($('#sm-side', el), UI.R, UI.P); charts(el, UI.R, UI.P); if (COR) drawCorridor($('#sm-cor', el), UI.R, UI.P); };
    sc.addEventListener('input', () => { play = null; $('#sm-play', el).textContent = 'Play'; scrub(); });
    $('#sm-play', el).addEventListener('click', e => {
      if (play) { play = null; e.target.textContent = 'Play'; return; }
      if (tCur >= so.tEnd - 0.1) tCur = 0;
      e.target.textContent = 'Pause'; let last = performance.now();
      play = () => { if (!play || el.hidden) return; const now = performance.now(); tCur = Math.min(so.tEnd, tCur + (now - last) / 1000 * 2); last = now; sc.value = tCur; scrub(); if (tCur < so.tEnd) requestAnimationFrame(play); else { play = null; e.target.textContent = 'Play'; } };
      requestAnimationFrame(play);
    });
  },
  render(el, r, p) { run(el, r, p); }
});
});
