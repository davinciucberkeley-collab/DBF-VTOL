/* Tilt-Wing Designer dashboard. Model: tiltwing/model.js (window.TW). Data: tiltwing/data/*.json (window.DATA). */
(function () {
'use strict';
const M = window.TW; M.setAirfoils(window.DATA.airfoils);
const $ = (s, el = document) => el.querySelector(s);
const h = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (html) e.innerHTML = html; return e; };
const fmt = (v, d = 2) => (v == null || !isFinite(v)) ? '—' : Number(v).toFixed(d);
const fmtk = v => !isFinite(v) ? '—' : v >= 1e5 ? (v / 1e5).toFixed(2) + '×10⁵' : fmt(v, 0);
const NS = 'http://www.w3.org/2000/svg';

// ---------- state ----------
const P = M.defaults();
try { const s = JSON.parse(localStorage.getItem('tw-inputs') || 'null'); if (s) for (const k in s) if (k in P) P[k] = s[k]; } catch (e) {}
const save = () => { try { localStorage.setItem('tw-inputs', JSON.stringify(P)); } catch (e) {} };

// ---------- panes (each step of the work adds one) ----------
const PANES = [];
const STEPS = window.STEPS || [];
function pane(def) { PANES.push(def); }
window.TWUI = { pane, h, fmt, fmtk, P, lineChart: null, NS };

// ---------- sliders ----------
function buildSliders() {
  const host = $('#sliders'), groups = {};
  for (const [key, label, unit, min, max, step, def, group, note] of M.INPUTS) {
    if (!groups[group]) { const d = h('details', { class: 'grp' }); d.open = group !== 'Flight'; d.appendChild(h('summary', {}, group)); host.appendChild(d); groups[group] = d; }
    const id = 'in-' + key, row = h('div', { class: 'sl' });
    row.innerHTML = `<label for="${id}">${label}</label><output id="${id}-o" for="${id}"></output>
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${P[key]}">
      <span class="note">${unit ? unit + ' · ' : ''}${note}</span>`;
    groups[group].appendChild(row);
    const inp = $('input', row), out = $('output', row);
    const show = () => { out.textContent = fmt(P[key], step < 0.01 ? 3 : step < 1 ? 2 : 0) + (unit && unit.length < 6 ? ' ' + unit : ''); out.classList.toggle('changed', Math.abs(P[key] - def) > 1e-9); };
    inp.addEventListener('input', () => { P[key] = +inp.value; show(); schedule(); });
    row._sync = () => { inp.value = P[key]; show(); };
    show();
  }
  $('#reset').addEventListener('click', () => { Object.assign(P, M.defaults()); document.querySelectorAll('.sl').forEach(r => r._sync && r._sync()); schedule(); });
}
let raf = 0; function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); save(); }); }

// ---------- tabs ----------
let current = 'overview';
function buildTabs() {
  const tabs = $('#tabs'), panes = $('#panes');
  PANES.forEach((p, i) => {
    const b = h('button', { class: 'tab', role: 'tab', type: 'button', id: 'tab-' + p.id, 'aria-controls': 'pane-' + p.id }, `<span class="n">${p.n}</span>${p.name}`);
    if (p.locked) { b.disabled = true; b.title = 'Arrives in ' + p.locked; }
    b.addEventListener('click', () => select(p.id));
    tabs.appendChild(b);
    const el = h('section', { class: 'pane', id: 'pane-' + p.id, role: 'tabpanel', 'aria-labelledby': 'tab-' + p.id });
    panes.appendChild(el); p.el = el; if (p.build) p.build(el);
  });
  const hash = (location.hash || '').slice(1);
  try { current = PANES.find(p => p.id === hash && !p.locked) ? hash : (localStorage.getItem('tw-tab') || 'overview'); } catch (e) {}
  if (!PANES.find(p => p.id === current && !p.locked)) current = 'overview';
  select(current);
}
function select(id) {
  current = id; try { localStorage.setItem('tw-tab', id); } catch (e) {}
  PANES.forEach(p => { p.el.hidden = p.id !== id; $('#tab-' + p.id).setAttribute('aria-selected', p.id === id); });
  update();
  const p = PANES.find(q => q.id === id); if (p && p.shown) p.shown();
}
window.TWUI.select = select;

let R = null;
function update() { R = M.size(P); window.TWUI.R = R; for (const p of PANES) if (!p.el.hidden && p.render) p.render(p.el, R, P); }

// ---------- theme ----------
function theme() {
  const b = $('#theme'), root = document.documentElement;
  try { const t = localStorage.getItem('tw-theme'); if (t) root.setAttribute('data-theme', t); } catch (e) {}
  b.addEventListener('click', () => {
    const dark = root.getAttribute('data-theme') ? root.getAttribute('data-theme') === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const t = dark ? 'light' : 'dark'; root.setAttribute('data-theme', t); try { localStorage.setItem('tw-theme', t); } catch (e) {}
    const p = PANES.find(q => q.id === current); if (p && p.themed) p.themed();
  });
}

// ---------- SVG line chart ----------
function nice(min, max, n = 5) {
  const span = max - min || 1, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, t = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) t.push(+v.toFixed(10));
  return { lo, hi, t };
}
function lineChart(svg, o) {
  const W = o.w || 560, H = o.h || 300, L = 52, Rr = o.legendRight ? 110 : 14, T = 14, B = 40;
  const allX = [], allY = [];
  o.series.forEach(s => s.pts.forEach(([x, y]) => { if (isFinite(x) && isFinite(y)) { allX.push(x); allY.push(y); } }));
  (o.hlines || []).forEach(l => allY.push(l.y)); if (o.marker && isFinite(o.marker.y)) { allX.push(o.marker.x); allY.push(o.marker.y); }
  const xs = nice(o.x.min ?? Math.min(...allX), o.x.max ?? Math.max(...allX), o.x.n || 6);
  const ys = nice(o.y.min ?? Math.min(...allY), o.y.max ?? Math.max(...allY), o.y.n || 5);
  if (o.x.min != null) xs.lo = o.x.min; if (o.x.max != null) xs.hi = o.x.max;
  xs.t = xs.t.filter(v => v >= xs.lo - 1e-9 && v <= xs.hi + 1e-9);
  const X = x => L + (x - xs.lo) / (xs.hi - xs.lo) * (W - L - Rr), Y = y => H - B - (y - ys.lo) / (ys.hi - ys.lo) * (H - T - B);
  let g = `<g class="grid">${ys.t.map(v => `<line x1="${L}" x2="${W - Rr}" y1="${Y(v)}" y2="${Y(v)}"/>`).join('')}${xs.t.map(v => `<line y1="${T}" y2="${H - B}" x1="${X(v)}" x2="${X(v)}"/>`).join('')}</g>`;
  g += `<g class="axis"><line x1="${L}" x2="${W - Rr}" y1="${H - B}" y2="${H - B}"/><line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}"/></g>`;
  g += ys.t.map(v => `<text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${+v.toFixed(4)}</text>`).join('');
  g += xs.t.map(v => `<text x="${X(v)}" y="${H - B + 15}" text-anchor="middle">${+v.toFixed(4)}</text>`).join('');
  g += `<text x="${(L + W - Rr) / 2}" y="${H - 6}" text-anchor="middle" class="t-3">${o.x.label}</text>`;
  g += `<text transform="translate(12 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle" class="t-3">${o.y.label}</text>`;
  (o.hlines || []).forEach(l => { if (l.y < ys.lo || l.y > ys.hi) return; g += `<line x1="${L}" x2="${W - Rr}" y1="${Y(l.y)}" y2="${Y(l.y)}" stroke="var(${l.color || '--bad'})" stroke-dasharray="5 4"/><text x="${W - Rr - 4}" y="${Y(l.y) - 5}" text-anchor="end" style="fill:var(${l.color || '--bad'})">${l.label}</text>`; });
  (o.vlines || []).forEach(l => { if (l.x < xs.lo || l.x > xs.hi) return; g += `<line y1="${T}" y2="${H - B}" x1="${X(l.x)}" x2="${X(l.x)}" stroke="var(${l.color || '--bad'})" stroke-dasharray="5 4"/><text x="${X(l.x) + 4}" y="${T + 10}" style="fill:var(${l.color || '--bad'})">${l.label}</text>`; });
  const clip = 'c' + Math.random().toString(36).slice(2, 8);
  g += `<clipPath id="${clip}"><rect x="${L}" y="${T}" width="${W - L - Rr}" height="${H - T - B}"/></clipPath><g clip-path="url(#${clip})">`;
  o.series.forEach(s => {
    const pts = s.pts.filter(([x, y]) => isFinite(x) && isFinite(y));
    if (!pts.length) return;
    if (s.dots) g += pts.map(([x, y]) => `<circle cx="${X(x)}" cy="${Y(y)}" r="2.6" fill="var(${s.color})"/>`).join('');
    else g += `<polyline fill="none" stroke="var(${s.color})" stroke-width="${s.width || 2}" ${s.dash ? 'stroke-dasharray="' + s.dash + '"' : ''} points="${pts.map(([x, y]) => X(x).toFixed(1) + ',' + Y(y).toFixed(1)).join(' ')}"/>`;
  });
  g += '</g>';
  if (o.marker && isFinite(o.marker.y) && o.marker.y >= ys.lo && o.marker.y <= ys.hi) {
    const mx = X(o.marker.x), my = Y(o.marker.y), right = mx > (W - Rr) * 0.7;
    g += `<circle cx="${mx}" cy="${my}" r="5" fill="var(--accent)" stroke="var(--sheet)" stroke-width="2"/><text x="${mx + (right ? -9 : 9)}" y="${my - 8}" text-anchor="${right ? 'end' : 'start'}" class="t-acc">${o.marker.label}</text>`;
  }
  if (o.legendRight) o.series.forEach((s, i) => {
    const pts = s.pts.filter(([x, y]) => isFinite(x) && isFinite(y)); if (!pts.length || s.noLegend) return;
    const ly = T + 8 + i * 17;
    g += `<line x1="${W - Rr + 10}" x2="${W - Rr + 26}" y1="${ly}" y2="${ly}" stroke="var(${s.color})" stroke-width="2" ${s.dash ? 'stroke-dasharray="' + s.dash + '"' : ''}/><text x="${W - Rr + 31}" y="${ly + 4}">${s.name}</text>`;
  });
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = g;
}
window.TWUI.lineChart = lineChart;

// ---------- plan-view drawing (paper Fig. 2 style) ----------
function rotorY(r, p) { const b = p.span; return [-0.5 * b, -0.2 * b, 0.2 * b, 0.5 * b]; }   // estimate from Fig. 2: 799 mm inner, 1982 mm outer spacing
function fuselageProfile(Lf, R, n = 48) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = t * Lf;
    let r;
    if (t < 0.32) r = R * Math.sqrt(1 - Math.pow((0.32 - t) / 0.32, 2));
    else if (t < 0.58) r = R;
    else r = R * (1 - 0.72 * Math.pow((t - 0.58) / 0.42, 1.3));
    pts.push([x, Math.max(r, 0)]);
  }
  return pts;
}
window.TWUI.fuselageProfile = fuselageProfile; window.TWUI.rotorY = rotorY;
function planView(svg, r, p) {
  const mm = 1000, b = p.span * mm, Lf = p.Lf * mm, pad = 0.12 * b, fs = b / 62;
  const W = b + 2 * pad, Hh = Lf + 2 * pad + 0.06 * b;
  const ox = W / 2, oy = pad + 0.03 * b;            // nose at top, x down the page
  const Xp = (y) => ox + y * mm, Yp = (x) => oy + x * mm;
  let g = '';
  const stroke = `stroke="var(--ink)" stroke-width="${b / 450}" fill="var(--tint)"`;
  // fuselage
  const prof = fuselageProfile(p.Lf, p.df / 2);
  g += `<path ${stroke} d="M${prof.map(([x, rr]) => Xp(rr) + ',' + Yp(x)).join(' L')} L${prof.slice().reverse().map(([x, rr]) => Xp(-rr) + ',' + Yp(x)).join(' L')}Z"/>`;
  // wing (straight TE, LE swept)
  const sw = Math.tan(r.sweepLE * Math.PI / 180), xr = r.xLEroot, hb = p.span / 2;
  for (const s of [-1, 1]) {
    g += `<path ${stroke} d="M${Xp(0)},${Yp(xr)} L${Xp(s * hb)},${Yp(xr + hb * sw)} L${Xp(s * hb)},${Yp(xr + r.cr)} L${Xp(0)},${Yp(xr + r.cr)}Z"/>`;
    // aileron (outer 45 % span, 25 % chord) — layout estimate
    const y0 = 0.5 * hb, y1 = 0.95 * hb, c0 = r.cr - (r.cr - r.ct) * 0.5, c1 = r.cr - (r.cr - r.ct) * 0.95;
    g += `<path stroke="var(--ink-3)" stroke-width="${b / 900}" fill="none" d="M${Xp(s * y0)},${Yp(xr + r.cr - 0.25 * c0)} L${Xp(s * y1)},${Yp(xr + r.cr - 0.25 * c1)}"/>`;
  }
  // tail
  const tsw = Math.tan(5 * Math.PI / 180), xth = r.xt - 0.3 * r.crh, hbh = r.bh / 2;
  for (const s of [-1, 1]) g += `<path ${stroke} d="M${Xp(0)},${Yp(xth)} L${Xp(s * hbh)},${Yp(xth + hbh * tsw)} L${Xp(s * hbh)},${Yp(xth + hbh * tsw + r.cth)} L${Xp(0)},${Yp(xth + r.crh)}Z"/>`;
  // tilt axes
  g += `<line x1="${Xp(-hb - 0.03)}" x2="${Xp(hb + 0.03)}" y1="${Yp(r.xw)}" y2="${Yp(r.xw)}" stroke="var(--accent)" stroke-dasharray="${b / 90} ${b / 160}" stroke-width="${b / 700}"/>`;
  g += `<line x1="${Xp(-hbh - 0.03)}" x2="${Xp(hbh + 0.03)}" y1="${Yp(r.xt)}" y2="${Yp(r.xt)}" stroke="var(--accent)" stroke-dasharray="${b / 90} ${b / 160}" stroke-width="${b / 700}"/>`;
  // rotors: nacelle + disk edge-on, ahead of LE
  const nac = (y, xLE, D, len) => {
    const xn = xLE - 0.55 * len;
    return `<rect x="${Xp(y) - 0.022 * mm}" y="${Yp(xn)}" width="${0.044 * mm}" height="${len * mm * 1.25}" ${stroke}/>` +
      `<line x1="${Xp(y - D / 2)}" x2="${Xp(y + D / 2)}" y1="${Yp(xn)}" y2="${Yp(xn)}" stroke="var(--ink)" stroke-width="${b / 260}" stroke-linecap="round"/>` +
      `<ellipse cx="${Xp(y)}" cy="${Yp(xn)}" rx="${D / 2 * mm}" ry="${D * mm * 0.06}" fill="none" stroke="var(--construct)" stroke-dasharray="${b / 200} ${b / 260}" stroke-width="${b / 1200}"/>`;
  };
  for (const y of rotorY(r, p)) g += nac(y, xr + Math.abs(y) * sw, r.Df, 0.6 * r.cr + 0.12);
  for (const y of [-hbh, hbh]) g += nac(y, xth + hbh * tsw, r.Dr, 0.6 * r.crh + 0.08);
  // CG
  const cx = Xp(0), cy = Yp(r.xcg), cr = b / 110;
  g += `<circle cx="${cx}" cy="${cy}" r="${cr}" fill="var(--sheet)" stroke="var(--ink)" stroke-width="${b / 700}"/><path d="M${cx},${cy - cr} A${cr},${cr} 0 0 1 ${cx + cr},${cy} L${cx},${cy}Z M${cx},${cy + cr} A${cr},${cr} 0 0 1 ${cx - cr},${cy} L${cx},${cy}Z" fill="var(--ink)"/>`;
  g += `<text x="${cx + cr * 1.6}" y="${cy + fs * 1.4}" font-size="${fs}" class="t-ink">CG</text>`;
  g += `<text x="${Xp(hb) + fs * 0.3}" y="${Yp(r.xw) - fs * 0.5}" font-size="${fs * 0.9}" class="t-acc" text-anchor="end">wing tilt axis</text>`;
  // dimensions
  const dim = (x1, y1, x2, y2, label, off, vertical) => {
    const t = b / 700, a = fs * 0.5;
    if (!vertical) {
      const yy = y1 + off;
      return `<line x1="${x1}" x2="${x1}" y1="${y1}" y2="${yy + a}" stroke="var(--construct)" stroke-width="${t}"/><line x1="${x2}" x2="${x2}" y1="${y2}" y2="${yy + a}" stroke="var(--construct)" stroke-width="${t}"/>` +
        `<line x1="${x1}" x2="${x2}" y1="${yy}" y2="${yy}" stroke="var(--ink-3)" stroke-width="${t}" marker-start="url(#ar)" marker-end="url(#ar)"/>` +
        `<text x="${(x1 + x2) / 2}" y="${yy - fs * 0.4}" font-size="${fs * 1.15}" text-anchor="middle" class="t-ink">${label}</text>`;
    }
    const xx = x1 + off;
    return `<line y1="${y1}" y2="${y1}" x1="${x1}" x2="${xx + a}" stroke="var(--construct)" stroke-width="${t}"/><line y1="${y2}" y2="${y2}" x1="${x2}" x2="${xx + a}" stroke="var(--construct)" stroke-width="${t}"/>` +
      `<line y1="${y1}" y2="${y2}" x1="${xx}" x2="${xx}" stroke="var(--ink-3)" stroke-width="${t}" marker-start="url(#ar)" marker-end="url(#ar)"/>` +
      `<text transform="translate(${xx - fs * 0.5} ${(y1 + y2) / 2}) rotate(-90)" font-size="${fs * 1.15}" text-anchor="middle" class="t-ink">${label}</text>`;
  };
  const yb = Yp(r.xLEroot + r.cr + 0.06);
  g += dim(Xp(-hb), Yp(r.xLEroot + hb * sw + r.ct), Xp(hb), Yp(r.xLEroot + hb * sw + r.ct), `${fmt(b, 0)} span`, (yb - Yp(r.xLEroot + hb * sw + r.ct)) + 0.12 * mm);
  g += dim(Xp(-0.2 * p.span), Yp(xr), Xp(0.2 * p.span), Yp(xr), `${fmt(0.4 * b, 0)}`, -0.30 * mm);
  g += dim(Xp(-hbh), Yp(r.xt), Xp(hbh), Yp(r.xt), `${fmt(r.bh * mm, 0)}`, 0.22 * mm);
  g += dim(Xp(-0.5 * p.span) - 0.05 * mm, Yp(0), Xp(-0.5 * p.span) - 0.05 * mm, Yp(p.Lf), `${fmt(Lf, 0)} length`, 0, true);
  g += `<text x="${Xp(hb)}" y="${Yp(p.Lf) + fs * 1.6}" font-size="${fs}" text-anchor="end">dimensions in mm · nose up · rotor disks dashed</text>`;
  const defs = `<defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="${6}" markerHeight="${6}" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9" fill="none" stroke="var(--ink-3)" stroke-width="1.4"/></marker></defs>`;
  svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`); svg.innerHTML = defs + g;
}
window.TWUI.planView = planView;

// ---------- checks ----------
function checks(r, p) {
  const c = [];
  c.push({ name: 'Power loading', val: fmt(r.powerLoading, 0) + ' W/kg', need: '≥ 300 W/kg', s: r.powerLoading >= 300 ? 'ok' : 'bad', src: 'paper §2.1, ref [18]' });
  c.push({ name: 'Hover pitch trim', val: r.trimOK ? fmt(r.Trear, 1) + ' N on tail rotors' : 'needs reverse tail thrust', need: 'CG on or aft of tilt axis', s: r.trimOK ? 'ok' : 'bad', src: 'formula P1' });
  c.push({ name: 'Cruise vs stall', val: fmt(r.cruiseMargin, 2) + ' × Vs', need: '≥ 1.3 × Vs', s: r.cruiseMargin >= 1.3 ? 'ok' : r.cruiseMargin >= 1.15 ? 'warn' : 'bad', src: 'formula P4, common margin' });
  c.push({ name: 'MTOW', val: fmt(r.m, 2) + ' kg', need: '8–15 kg', s: r.m >= 8 && r.m <= 15 ? 'ok' : r.m < 25 ? 'warn' : 'bad', src: 'CLAUDE.md portability target' });
  c.push({ name: 'Span', val: fmt(p.span, 2) + ' m', need: '2–3 m', s: p.span >= 2 && p.span <= 3 ? 'ok' : 'warn', src: 'CLAUDE.md; paper Fig. 1 limit 2 m' });
  c.push({ name: 'Flight time', val: fmt(r.tTotal, 0) + ' min', need: '60 min', s: r.tTotal >= 60 ? 'ok' : r.tTotal >= 40 ? 'warn' : 'bad', src: 'paper §1 mission goal' });
  if (M.stability) { const st = M.stability(r, p), sm = st.SM * 100;
    c.push({ name: 'Static margin (cruise)', val: fmt(sm, 1) + ' % MAC', need: '5–25 % MAC', s: sm >= 5 && sm <= 25 ? 'ok' : sm > 0 ? 'warn' : 'bad', src: 'formula A7; paper: stable except in hover' }); }
  c.push({ name: 'Slipstream on wing', val: fmt(r.Vslip, 1) + ' m/s', need: '7–10 m/s', s: r.Vslip >= 7 && r.Vslip <= 10.5 ? 'ok' : 'warn', src: 'paper §4, ref [22]' });
  return c;
}
window.TWUI.checks = checks;

// ---------- OVERVIEW ----------
pane({ id: 'overview', n: '01', name: 'Overview',
  build(el) {
    el.innerHTML = `<div class="main-in">
      <div class="sec"><div class="sec-h"><h2>Tilt-wing baseline</h2><span class="lbl" id="ov-tag"></span></div>
      <p class="lede" id="ov-lede"></p></div>
      <div class="kpis" id="ov-kpi"></div>
      <div class="cols">
        <div class="panel"><div class="panel-h"><h3>Plan view</h3><span class="lbl">rebuilds from the sliders</span></div>
          <div class="panel-b"><svg id="ov-plan" class="dwg" role="img" aria-label="Plan view drawing of the tilt-wing aircraft"></svg></div></div>
        <div class="panel"><div class="panel-h"><h3>Design checks</h3><span class="lbl">live</span></div>
          <div class="tw"><table><thead><tr><th>Check</th><th>Now</th><th>Need</th><th>Status</th></tr></thead><tbody id="ov-checks"></tbody></table></div>
          <div class="panel-b"><p class="src">Checks are recomputed from tiltwing/model.js on every slider move.</p></div></div>
      </div></div>`;
  },
  render(el, r, p) {
    $('#ov-lede', el).innerHTML = `A ${fmt(p.span, 2)} m span tilt-wing UAV after Çakır &amp; Kurtuluş: four ${fmt(p.Dfront, 1)} in rotors on a wing that tilts 0–90°, two ${fmt(p.Drear, 1)} in rotors on a tilting tail, no vertical fin. The S1223 wing has ${fmt(r.S, 3)} m² area at AR ${fmt(p.AR, 2)}; the aircraft closes at <b>${fmt(r.m, 2)} kg</b> carrying ${fmt(p.payload, 1)} kg payload. Hover takes ${fmt(r.Phover, 0)} W; cruise at ${fmt(p.Vc, 1)} m/s takes ${fmt(r.Pcruise, 0)} W.`;
    $('#ov-tag', el).textContent = `S1223 · NACA 0009 tail · 4 + 2 rotors`;
    const k = [
      ['Takeoff mass', fmt(r.m, 2), 'kg', `structure ${fmt(r.mStruct, 2)} · battery ${fmt(r.mBatt, 2)}`, r.m <= 15 ? '' : 'warn'],
      ['Power loading', fmt(r.powerLoading, 0), 'W/kg', `installed ${fmt(r.Pinst, 0)} W · need ≥ 300`, r.powerLoading >= 300 ? 'ok' : 'bad'],
      ['Stall speed', fmt(r.Vs, 1), 'm/s', `C<sub>L,max</sub> ${fmt(r.CLmax, 2)} · cruise ${fmt(r.cruiseMargin, 2)}× V<sub>s</sub>`, r.cruiseMargin >= 1.3 ? 'ok' : 'warn'],
      ['Flight time', fmt(r.tTotal, 0), 'min', `${fmt(p.tHover, 1)} min hover + cruise · range ${fmt(r.range, 1)} km`, r.tTotal >= 60 ? 'ok' : r.tTotal >= 40 ? 'warn' : 'bad'],
    ];
    $('#ov-kpi', el).innerHTML = k.map(([l, v, u, s, c]) => `<div class="kpi ${c}"><span class="lbl">${l}</span><span class="v">${v}<small>${u}</small></span><span class="sub">${s}</span></div>`).join('');
    planView($('#ov-plan', el), r, p);
    $('#ov-checks', el).innerHTML = checks(r, p).map(c => `<tr><td>${c.name}<span class="f">${c.src}</span></td><td class="n">${c.val}</td><td class="n">${c.need}</td><td><span class="chip ${c.s}">${{ ok: 'met', warn: 'risk', bad: 'fail' }[c.s]}</span></td></tr>`).join('');
  }
});

// ---------- SIZING ----------
pane({ id: 'sizing', n: '02', name: 'Sizing',
  build(el) {
    el.innerHTML = `<div class="main-in">
      <div class="sec"><div class="sec-h"><h2>Geometry, mass and propulsion</h2><span class="lbl">formulas G1–G6, M1–M2, P1–P7</span></div>
      <p class="lede">Same method as the paper's §2: wing from span and aspect ratio, tail from the volume coefficient, mass from the paper's 40 % propulsion and 50 % battery fractions, rotors sized by momentum theory. Formulas are listed in the header of tiltwing/model.js.</p></div>
      <div class="panel"><div class="panel-h"><h3>Mass build-up</h3><span class="lbl" id="sz-m"></span></div><div class="panel-b"><div class="mbar" id="sz-bar"></div><div class="legend" id="sz-leg"></div>
        <p class="src" style="margin-top:8px">Structure densities are estimates calibrated so the paper geometry returns the paper's 2.0 kg airframe (§2.1).</p></div></div>
      <div class="cols3">
        <div class="panel"><div class="panel-h"><h3>Wing &amp; tail</h3></div><div class="tw"><table><tbody id="sz-geo"></tbody></table></div></div>
        <div class="panel"><div class="panel-h"><h3>Rotors in hover</h3></div><div class="tw"><table><tbody id="sz-prop"></tbody></table></div></div>
        <div class="panel"><div class="panel-h"><h3>Cruise &amp; energy</h3></div><div class="tw"><table><tbody id="sz-cru"></tbody></table></div></div>
      </div>
      <div class="cols">
        <div class="panel"><div class="panel-h"><h3>Wing trade: stall speed vs span</h3><span class="lbl">cf. paper Fig. 1</span></div><div class="panel-b"><svg id="sz-trade" role="img" aria-label="Stall speed versus span for several aspect ratios"></svg>
          <p class="src">Each line holds AR fixed and re-closes the mass for every span. The paper caps span at 2 m and AR at 5–7.</p></div></div>
        <div class="panel"><div class="panel-h"><h3>Flight time vs payload</h3><span class="lbl">hover time held</span></div><div class="panel-b"><svg id="sz-pay" role="img" aria-label="Flight time versus payload"></svg>
          <p class="src">Battery mass rises with payload through the mass fractions, so flight time falls slowly.</p></div></div>
      </div></div>`;
  },
  render(el, r, p) {
    const parts = [['Wing', r.mWing, '--s1'], ['Fuselage', r.mFus, '--s5'], ['Tail', r.mTail + r.mMisc, '--s2'], ['Electronics', p.elec, '--s6'], ['Payload', p.payload, '--s4'], ['Motors, ESCs, props', r.mMotors, '--s3'], ['Battery', r.mBatt, '--accent']];
    $('#sz-m', el).textContent = `total ${fmt(r.m, 2)} kg`;
    $('#sz-bar', el).innerHTML = parts.map(([n, v, c]) => `<div style="flex:${v};background:var(${c})" title="${n} ${fmt(v, 2)} kg">${v / r.m > 0.08 ? fmt(v, 2) : ''}</div>`).join('');
    $('#sz-leg', el).innerHTML = parts.map(([n, v, c]) => `<span><i style="background:var(${c})"></i>${n} ${fmt(v, 2)} kg</span>`).join('');
    const rows = a => a.map(([l, v, f]) => `<tr><td>${l}${f ? `<span class="f">${f}</span>` : ''}</td><td class="n">${v}</td></tr>`).join('');
    $('#sz-geo', el).innerHTML = rows([
      ['Wing area', fmt(r.S, 3) + ' m²', 'G1 b²/AR'], ['Root / tip chord', fmt(r.cr, 3) + ' / ' + fmt(r.ct, 3) + ' m', 'G2'], ['Mean aero chord', fmt(r.MAC, 3) + ' m', 'G3'],
      ['LE sweep (TE straight)', fmt(r.sweepLE, 1) + '°', 'G4'], ['Tail arm', fmt(r.lt, 3) + ' m', 'wing AC → tail axis'], ['Tail area', fmt(r.Sh, 3) + ' m²', 'G5 V_h S c̄ / l_t'],
      ['Tail span / root chord', fmt(r.bh, 3) + ' / ' + fmt(r.crh, 3) + ' m', 'AR_h 4.1, λ 0.8'], ['Fineness ratio', fmt(r.fineness, 2), 'L_f / d_f'],
      ['Re, cruise / hover slipstream', fmtk(r.ReC) + ' / ' + fmtk(r.ReV), 'G6'], ['CG', fmt(r.xcg, 3) + ' m from nose', `tilt axis at ${fmt(r.xw, 3)} m`]]);
    $('#sz-prop', el).innerHTML = rows([
      ['Wing rotor thrust, each', fmt(r.Tf1, 1) + ' N', 'P1 (W − T_rear)/4'], ['Tail rotor thrust, each', fmt(r.Tr1, 1) + ' N', 'P1 trim share'],
      ['Wing rotor shaft power', fmt(r.shaftF, 0) + ' W', 'P3; paper 363.9 W'], ['Tail rotor shaft power', fmt(r.shaftR, 1) + ' W', 'P3 at trim'],
      ['Hover electrical power', fmt(r.Phover, 0) + ' W', 'all six rotors'], ['Installed electrical power', fmt(r.Pinst, 0) + ' W', `T/W ${fmt(p.TW, 2)} + ${fmt(p.ctrlRes, 0)} % pitch reserve`],
      ['Disk loading', fmt(r.DL, 0) + ' N/m²', 'wing rotors'], ['Slipstream speed', fmt(r.Vslip, 2) + ' m/s', 'P2 = paper Eq. 11'], ['Wing span in slipstream', fmt(r.blown * 100, 0) + ' %', '4D / b']]);
    $('#sz-cru', el).innerHTML = rows([
      ['Cruise C<sub>L</sub>', fmt(r.CLc, 3), 'W / qS'], ['Cruise C<sub>D</sub>', fmt(r.CDc, 4), 'P5'], ['Cruise L/D', fmt(r.LD, 2), `max ${fmt(r.LDmax, 2)} at ${fmt(r.VLDmax, 1)} m/s`],
      ['S1223 c<sub>l,max</sub> (2D)', fmt(r.clmax2, 3), `NeuralFoil at Re ${fmtk(r.ReC)}`], ['C<sub>L,max</sub> (3D)', fmt(r.CLmax, 3), '0.9 × c_l,max (estimate)'],
      ['Cruise power', fmt(r.Pcruise, 0) + ' W', 'P6, η_prop 0.70'], ['Usable energy', fmt(r.Euse, 0) + ' Wh', '80 % of pack'],
      ['Hover-only endurance', fmt(r.tHoverOnly, 1) + ' min', 'P7'], ['Cruise-only endurance', fmt(r.tCruiseOnly, 1) + ' min', 'P7'], ['Range after hover', fmt(r.range, 1) + ' km', '']]);
    // trade
    const ARs = [5, 5.5, 6, 6.5, 7], cols = ['--s1', '--s2', '--s3', '--s4', '--s5'], series = [];
    ARs.forEach((AR, i) => { const pts = []; for (let b = 1.5; b <= 2.601; b += 0.05) { const q = M.size(Object.assign({}, p, { span: b, AR })); pts.push([b, q.Vs]); } series.push({ name: 'AR ' + AR, color: cols[i], pts }); });
    lineChart($('#sz-trade', el), { series, legendRight: true, x: { min: 1.5, max: 2.6, label: 'span b [m]' }, y: { label: 'stall speed Vs [m/s]' }, vlines: [{ x: 2.0, label: 'paper span limit' }], marker: { x: p.span, y: r.Vs, label: `now ${fmt(r.Vs, 1)}` } });
    const pts = [], ptsC = []; for (let m = 0; m <= 5.001; m += 0.25) { const q = M.size(Object.assign({}, p, { payload: m })); pts.push([m, q.tTotal]); ptsC.push([m, q.tCruiseOnly]); }
    lineChart($('#sz-pay', el), { series: [{ name: 'with hover', color: '--s1', pts }, { name: 'cruise only', color: '--s2', pts: ptsC, dash: '5 4' }], legendRight: true, x: { min: 0, max: 5, label: 'payload [kg]' }, y: { min: 0, label: 'flight time [min]' }, hlines: [{ y: 60, label: 'paper goal 60 min' }], marker: { x: p.payload, y: r.tTotal, label: fmt(r.tTotal, 0) + ' min' } });
  }
});

// ---------- later steps (registered by step files) ----------
(window.STEP_PANES || []).forEach(fn => fn(window.TWUI, M));
(window.LOCKED || []).forEach(d => pane(Object.assign({ build() {} }, d)));

// ---------- PAPER vs MODEL ----------
pane({ id: 'paper', n: 'P', name: 'Paper vs model',
  build(el) {
    el.innerHTML = `<div class="main-in"><div class="sec"><div class="sec-h"><h2>Reproducing the paper</h2><span class="lbl">model at the current sliders</span></div>
      <p class="lede">Press <b>Reset to paper</b> to set every slider to the paper's value; the model column then shows how close the method gets to the paper's published numbers.</p></div>
      <div class="panel"><div class="tw"><table><thead><tr><th>Quantity</th><th class="n">Paper</th><th class="n">Model now</th><th class="n">Δ</th><th>Where in paper / note</th></tr></thead><tbody id="pp-t"></tbody></table></div></div>
      <div class="note-box"><b>Paper inconsistency.</b> Table 1 lists MAC 0.33 m with root chord 0.36 m, taper 0.7 and area 0.575 m² on a 2 m span. Those three fix the MAC at 0.29 m (G3); a 0.33 m MAC would need about 0.65 m². The model keeps the area, span and taper and reports the MAC they imply.</div></div>`;
  },
  render(el, r, p) {
    const O = M.PAPER.out;
    const row = (q, a, b, u, d, note) => { const dd = (typeof a === 'number') ? (b - a) / a * 100 : null; const cls = dd == null ? '' : Math.abs(dd) <= 5 ? 'ok' : Math.abs(dd) <= 15 ? 'warn' : 'bad'; return `<tr><td>${q}</td><td class="n">${typeof a === 'number' ? fmt(a, d) : a} ${u}</td><td class="n">${fmt(b, d)} ${u}</td><td class="n ${cls}">${dd == null ? '—' : (dd >= 0 ? '+' : '') + fmt(dd, 1) + ' %'}</td><td>${note}</td></tr>`; };
    $('#pp-t', el).innerHTML = [
      row('Wing area', O.S, r.S, 'm²', 3, 'Table 1'), row('Root chord', O.cr, r.cr, 'm', 3, 'Table 1'), row('MAC', O.MAC, r.MAC, 'm', 3, 'Table 1 — see note below'),
      row('LE sweep', O.sweepLE, r.sweepLE, '°', 1, 'Table 1; model assumes straight TE as in §2'), row('Tail span', O.tailSpan, r.bh, 'm', 3, 'Fig. 2 (740 mm)'),
      row('Tail root chord', O.tailRootChord, r.crh, 'm', 3, 'Table 1'), row('Takeoff mass', O.mass, r.m, 'kg', 2, '§2 target 9.5 kg; mass closure gives (2+1+2.5)/0.6'),
      row('Re, level flight', O.ReLevel, r.ReC, '', 0, '§4; paper uses MAC 0.33 m'), row('Re, vertical flight', O.ReVert, r.ReV, '', 0, '§4'),
      row('Slipstream on wing', '7–10', r.Vslip, 'm/s', 2, '§4 (Eq. 11)'), row('Wing rotor shaft power', O.frontShaftW, r.shaftF, 'W', 1, 'Table 2 (hover, model FM 0.65)'),
      row('Tail rotor shaft power', O.rearShaftW, r.shaftR, 'W', 1, 'Table 2; paper sizes tail rotors for control, model shows trim only'),
      row('Flight time', O.flightMin, r.tTotal, 'min', 0, '§1 goal; model uses 150 Wh/kg packs'),
    ].join('');
  }
});

// ---------- ROADMAP ----------
pane({ id: 'steps', n: '✓', name: 'Steps',
  build(el) { el.innerHTML = `<div class="main-in"><div class="sec"><div class="sec-h"><h2>Work plan</h2><span class="lbl">nothing is committed to GitHub without approval</span></div>
    <p class="lede">The work runs in steps. Each finished step adds its own tab to this dashboard. Files live in <code>tiltwing/</code> on the local <b>design2</b> working copy and stay uncommitted.</p></div>
    <div class="steps" id="st-l"></div>
    <div class="panel"><div class="panel-h"><h3>Verification</h3><span class="lbl" id="st-vn"></span></div><div class="tw"><table><thead><tr><th>Check</th><th class="n">Model</th><th class="n">Independent</th><th class="n">Δ</th><th>Reference</th><th>Result</th></tr></thead><tbody id="st-v"></tbody></table></div>
    <div class="panel-b"><p class="src">tools/verify.py re-implements the formulas in Python, compares the FE solver with closed-form cantilever results, the ISA model with AeroSandbox, and the outputs with the paper. Values at the paper's slider settings.</p></div></div></div>`; },
  render(el) {
    $('#st-l', el).innerHTML = STEPS.map(s => `<div class="step ${s.done ? 'done' : ''}"><span class="no">${s.n}</span><div><h3>${s.title}</h3><p>${s.text}</p></div><span class="chip ${s.done ? 'ok' : 'open'}">${s.done ? 'done' : 'next'}</span></div>`).join('');
    const V = window.DATA.verify;
    if (V) { $('#st-vn', el).textContent = `${V.rows.filter(x => x.pass).length} of ${V.rows.length} pass`;
      $('#st-v', el).innerHTML = V.rows.map(x => `<tr><td>${x.check}</td><td class="n">${(+x.model).toPrecision(5)}</td><td class="n">${(+x.independent).toPrecision(5)}</td><td class="n">${(x.diff * 100 >= 0 ? '+' : '') + (x.diff * 100).toFixed(2)} %</td><td>${x.src}</td><td><span class="chip ${x.pass ? 'ok' : 'bad'}">${x.pass ? 'pass' : 'fail'}</span></td></tr>`).join(''); }
    else $('#st-v', el).innerHTML = '<tr><td colspan="6">—</td></tr>';
  }
});

// order: overview, sizing, step panes, paper, steps
buildSliders(); theme(); buildTabs();
})();
