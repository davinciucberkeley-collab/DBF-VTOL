/* Step 3 — aerodynamic analysis: CL, CD, Cm against angle of attack and tilt angle (paper §3–4, Figs. 5, 8–10). */
window.STEP_PANES.push(function (UI, M) {
const { fmt, pane, lineChart } = UI;
const $ = (s, el = document) => el.querySelector(s);
const TILTS = [0, 15, 30, 45, 60, 75, 90], COL = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--accent'];
const REF = window.DATA.aero;                       // AeroBuildup reference at the params.json geometry (paper values)
const ALPHA = []; for (let a = -15; a <= 20; a += 1) ALPHA.push(a);
const opt = { V: 20, slip: false, frame: 'wing', vdTilt: 45, vdU: 8 };

function sweep(r, p, tilt, de, key) {
  return ALPHA.map(a => {
    const th = opt.frame === 'wing' ? a - tilt : a;
    const x = M.aero(r, p, { V: opt.V, theta: th, tilt, de, Vpw: opt.slip ? r.Vslip : 0, Vpt: opt.slip ? r.VslipR : 0 });
    return [a, x[key]];
  });
}
function refPts(t, key, set = 'tilt') {
  if (!REF || !REF[set] || !REF[set][String(t)]) return [];
  const d = REF[set][String(t)][key]; return REF.alpha_wing.map((a, i) => [set === 'tilt' && opt.frame === 'body' ? a - t : a, d[i]]);
}
// paper Fig. 5 style vector diagram for one tilt angle and body speed
function velDiagram(svg, r, p) {
  const d = opt.vdTilt * Math.PI / 180, u = opt.vdU, vp = r.Vslip;
  const vEff = [u + vp * Math.cos(d), vp * Math.sin(d)];        // "flight-direction" components seen by the blown wing (x fwd, z up)
  // α_eff from the model (A1) for consistency
  const sf = M.surfaceForce('s1223', { v: [-u - vp * Math.cos(d), -vp * Math.sin(d)], chordAng: d, S: 1, AR: p.AR, c: r.MAC, rho: p.rho, r: [0, 0] });
  const W = 520, H = 300, ox = 150, oy = 200, k = 9;
  const arrow = (x, y, color, label, dy = 0) => `<line x1="${ox}" y1="${oy}" x2="${ox + x * k}" y2="${oy - y * k}" stroke="var(${color})" stroke-width="2.5" marker-end="url(#va-${color.slice(2)})"/><text x="${ox + x * k + 6}" y="${oy - y * k + dy}" style="fill:var(${color})">${label}</text>`;
  const mk = c => `<marker id="va-${c.slice(2)}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10z" fill="var(${c})"/></marker>`;
  const L = 120, chord = `<line x1="${ox - L * Math.cos(d) * 0.3}" y1="${oy + L * Math.sin(d) * 0.3}" x2="${ox + L * Math.cos(d)}" y2="${oy - L * Math.sin(d)}" stroke="var(--ink)" stroke-width="7" stroke-linecap="round" opacity="0.18"/>`;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `<defs>${mk('--s6')}${mk('--s4')}${mk('--bad')}</defs>${chord}
    <line x1="20" x2="${W - 20}" y1="${oy}" y2="${oy}" stroke="var(--hair)"/>
    ${arrow(u, 0, '--s6', 'u body ' + fmt(u, 1), 16)}${arrow(vp * Math.cos(d), vp * Math.sin(d), '--s4', 'V prop ' + fmt(vp, 1), -4)}${arrow(vEff[0], vEff[1], '--bad', 'V eff ' + fmt(Math.hypot(...vEff), 1), -4)}
    <text x="20" y="24" class="t-ink">δ_TW ${fmt(opt.vdTilt, 0)}°  ·  α_eff on the blown wing ${fmt(sf.a, 1)}°  ·  section c_l ${fmt(sf.cl, 2)}</text>
    <text x="20" y="${H - 12}" class="t-3">grey bar: wing chord · speeds in m/s · V_prop from paper Eq. 11 at hover thrust</text>`;
}

pane({ id: 'aero', n: '04', name: 'Aero',
  build(el) {
    el.innerHTML = `<div class="main-in">
      <div class="sec"><div class="sec-h"><h2>Aerodynamic analysis</h2><span class="lbl">component build-up · formulas A1–A7</span></div>
      <p class="lede">Lift, drag and pitching moment of the whole aircraft as the wing tilts, built from the S1223 and NACA 0009 polars, a lifting-line correction, tail downwash and fuselage cross-flow. The paper ran 63 CFD geometries in Fluent at 20 m/s; this model runs every curve live from the sliders. Dots are an independent AeroSandbox AeroBuildup run on the same geometry at the paper's values.</p></div>
      <div class="kpis" id="ae-kpi"></div>
      <div class="panel"><div class="panel-b" style="display:flex;flex-wrap:wrap;gap:10px 22px;align-items:center">
        <span class="lbl">Angle of attack measured from</span>
        <label class="btn" style="display:inline-flex;gap:6px;align-items:center"><input type="radio" name="ae-frame" id="ae-fw" value="wing" checked> wing chord (paper)</label>
        <label class="btn" style="display:inline-flex;gap:6px;align-items:center"><input type="radio" name="ae-frame" id="ae-fb" value="body"> fuselage axis</label>
        <label class="btn" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="ae-slip"> Add propeller slipstream</label>
        <div class="sl" style="min-width:220px;flex:1;max-width:340px"><label for="ae-V">Airspeed</label><output id="ae-V-o">20 m/s</output><input type="range" id="ae-V" min="8" max="30" step="1" value="20"></div>
      </div></div>
      <div class="cols">
        <div class="panel"><div class="panel-h"><h3>C<sub>L</sub> vs α by tilt angle</h3><span class="lbl">cf. paper Fig. 8a</span></div><div class="panel-b"><svg id="ae-cl" role="img" aria-label="Lift coefficient against angle of attack for seven tilt angles"></svg></div></div>
        <div class="panel"><div class="panel-h"><h3>C<sub>D</sub> vs α by tilt angle</h3><span class="lbl">cf. paper Fig. 9a</span></div><div class="panel-b"><svg id="ae-cd" role="img" aria-label="Drag coefficient against angle of attack for seven tilt angles"></svg></div></div>
        <div class="panel"><div class="panel-h"><h3>C<sub>m</sub> about the CG vs α</h3><span class="lbl">cf. paper Fig. 10a</span></div><div class="panel-b"><svg id="ae-cm" role="img" aria-label="Pitching moment coefficient against angle of attack for seven tilt angles"></svg></div></div>
        <div class="panel"><div class="panel-h"><h3>Elevator effect at δ<sub>TW</sub> = 0°</h3><span class="lbl">cf. paper Fig. 10b</span></div><div class="panel-b"><svg id="ae-de" role="img" aria-label="Pitching moment against angle of attack for three elevator deflections"></svg></div></div>
      </div>
      <p class="src">Lines: live model. Dots: AeroBuildup (tilt 0° and 90°, and elevator ±20°) at the paper geometry, from tools/aero_ref.py. Orange square: the paper's converged CFD point at α = 0, δ = 0 (Fig. 6: C<sub>L</sub> ≈ 0.73, C<sub>D</sub> ≈ 0.088).</p>
      <div class="cols">
        <div class="panel"><div class="panel-h"><h3>Effective velocity on the wing</h3><span class="lbl">cf. paper Fig. 5</span></div><div class="panel-b" style="display:grid;gap:8px">
          <svg id="ae-vd" role="img" aria-label="Velocity vectors on the tilted wing"></svg>
          <div class="cols"><div class="sl"><label for="ae-vt">Tilt angle</label><output id="ae-vt-o">45°</output><input type="range" id="ae-vt" min="0" max="90" step="1" value="45"></div>
          <div class="sl"><label for="ae-vu">Body speed</label><output id="ae-vu-o">8 m/s</output><input type="range" id="ae-vu" min="0" max="25" step="0.5" value="8"></div></div>
          <p class="src">Below 45° tilt the body speed dominates the effective velocity; above 45° the slipstream does (paper §3).</p></div></div>
        <div class="panel"><div class="panel-h"><h3>Model vs AeroBuildup at α = 0</h3><span class="lbl">wing coordinates, 20 m/s</span></div>
          <div class="tw"><table><thead><tr><th class="n">δ<sub>TW</sub></th><th class="n">C<sub>L</sub> model</th><th class="n">C<sub>L</sub> AB</th><th class="n">C<sub>D</sub> model</th><th class="n">C<sub>D</sub> AB</th><th class="n">C<sub>m</sub> model</th><th class="n">C<sub>m</sub> AB</th></tr></thead><tbody id="ae-tab"></tbody></table></div>
          <div class="panel-b"><p class="src">AeroBuildup is evaluated once at the paper's values; the model column follows the sliders. AeroBuildup keeps more of the S1223's 2-D zero-α lift (C<sub>l</sub> 1.23) than the lifting-line model, which lands nearer the paper's CFD value of 0.73.</p></div></div>
      </div></div>`;
    el.querySelectorAll('input[name=ae-frame]').forEach(i => i.addEventListener('change', () => { opt.frame = i.value; UI.select('aero'); }));
    $('#ae-slip', el).addEventListener('change', e => { opt.slip = e.target.checked; UI.select('aero'); });
    const v = $('#ae-V', el); v.addEventListener('input', () => { opt.V = +v.value; $('#ae-V-o', el).textContent = v.value + ' m/s'; UI.select('aero'); });
    const vt = $('#ae-vt', el), vu = $('#ae-vu', el);
    const vd = () => { opt.vdTilt = +vt.value; opt.vdU = +vu.value; $('#ae-vt-o', el).textContent = vt.value + '°'; $('#ae-vu-o', el).textContent = vu.value + ' m/s'; velDiagram($('#ae-vd', el), UI.R, UI.P); };
    vt.addEventListener('input', vd); vu.addEventListener('input', vd);
  },
  render(el, r, p) {
    const st = M.stability(r, p);
    const sm = st.SM * 100, smc = sm >= 5 && sm <= 25 ? 'ok' : sm > 0 ? 'warn' : 'bad';
    $('#ae-kpi', el).innerHTML = [
      ['Static margin', fmt(sm, 1), '% MAC', `neutral point at ${fmt(st.hn * 100, 1)} % MAC · CG ${fmt(p.hcg, 1)} %`, smc],
      ['Lift slope', fmt(st.CLa * Math.PI / 180, 3), '/deg', `${fmt(st.CLa, 2)} /rad at δ_TW 0°`, ''],
      ['Trim elevator', fmt(st.trimDe, 1), '°', `cruise C_L ${fmt(r.CLc, 3)} at ${fmt(p.Vc, 1)} m/s · body α ${fmt(st.trimTheta, 1)}°`, st.trimOK ? 'ok' : 'bad'],
      ['Trimmed L/D', fmt(st.trimLD, 2), '', `C_D ${fmt(st.trimCD, 4)} incl. trim and tail`, st.trimLD >= 8 ? 'ok' : 'warn'],
    ].map(([l, v, u, s, c]) => `<div class="kpi ${c}"><span class="lbl">${l}</span><span class="v">${v}<small>${u}</small></span><span class="sub">${s}</span></div>`).join('');
    const xl = opt.frame === 'wing' ? 'α from wing chord [deg]' : 'α from fuselage axis [deg]';
    const ser = key => TILTS.map((t, i) => ({ name: t + '°', color: COL[i], pts: sweep(r, p, t, 0, key) }));
    const dots = key => [0, 90].map(t => ({ name: 'AB ' + t + '°', color: t ? '--accent' : '--s1', dots: true, noLegend: true, pts: opt.slip || opt.V !== 20 ? [] : refPts(t, key) }));
    const paperPt = (y) => opt.frame === 'wing' && !opt.slip && opt.V === 20 ? { x: 0, y, label: 'paper CFD' } : null;
    lineChart($('#ae-cl', el), { series: ser('CL').concat(dots('CL')), legendRight: true, x: { min: -15, max: 20, label: xl }, y: { label: 'C_L' }, marker: paperPt(0.73) });
    lineChart($('#ae-cd', el), { series: ser('CD').concat(dots('CD')), legendRight: true, x: { min: -15, max: 20, label: xl }, y: { min: 0, label: 'C_D' }, marker: paperPt(0.088) });
    lineChart($('#ae-cm', el), { series: ser('Cm').concat(dots('Cm')), legendRight: true, x: { min: -15, max: 20, label: xl }, y: { label: 'C_m about CG' }, hlines: [{ y: 0, label: '', color: '--construct' }] });
    const des = [-20, 0, 20], dc = ['--s2', '--s1', '--s4'];
    lineChart($('#ae-de', el), {
      series: des.map((d, i) => ({ name: 'δe ' + (d > 0 ? '+' : '') + d + '°', color: dc[i], pts: sweep(r, p, 0, d, 'Cm') }))
        .concat(des.map((d, i) => ({ name: 'AB', color: dc[i], dots: true, noLegend: true, pts: opt.slip || opt.V !== 20 ? [] : refPts(d, 'Cm', 'elevator') }))),
      legendRight: true, x: { min: -15, max: 20, label: xl }, y: { label: 'C_m about CG' }, hlines: [{ y: 0, label: '', color: '--construct' }] });
    $('#ae-tab', el).innerHTML = TILTS.map(t => {
      const x = M.aeroWing(r, p, 0, t, 0), i = REF ? REF.alpha_wing.indexOf(0) : -1, R0 = REF && REF.tilt[String(t)];
      const g = k => R0 && i >= 0 ? fmt(R0[k][i], 3) : '—';
      return `<tr><td class="n">${t}°</td><td class="n">${fmt(x.CL, 3)}</td><td class="n">${g('CL')}</td><td class="n">${fmt(x.CD, 3)}</td><td class="n">${g('CD')}</td><td class="n">${fmt(x.Cm, 3)}</td><td class="n">${g('Cm')}</td></tr>`;
    }).join('');
    velDiagram($('#ae-vd', el), r, p);
  }
});
});
