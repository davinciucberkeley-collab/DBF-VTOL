// Electrical + landing-gear content for the inventory overview: reads inventory/electrical/*.json, docs/research/electrical-architecture.md
// and analysis/results.json at build time and returns HTML strings (placeholders for body.html) plus the data the 3D viewer needs.
// Nothing here is typed into the page by hand except wording; every number is read, parsed or computed.
import { readFileSync } from 'fs';
const rd = p => readFileSync(new URL(p, import.meta.url), 'utf8');

export function buildElectrical(h) {
  const { esc, usd, round2, chip, findBtn, src, est, ROWS, byId, S, REV, DATE, sum } = h;
  const MD = rd('../docs/research/electrical-architecture.md');
  const COMPS = JSON.parse(rd('./electrical/components.json'));
  const WIR = JSON.parse(rd('./electrical/wiring.json'));
  const PROP = JSON.parse(rd('./electrical/proposed_lines.json'));
  const RES = JSON.parse(rd('../analysis/results.json'));
  const cby = Object.fromEntries(COMPS.map(c => [c.id, c]));
  const WIRES = WIR.wires, wby = Object.fromEntries(WIRES.map(w => [w.id, w]));
  const num = (v, d = 2) => Number(v).toFixed(d);
  const chk0 = (a, b, w) => { if (num(a) !== num(parseFloat(b))) throw new Error(`budget ${w}: computed ${a} vs research file ${b}`); };
  const mustHave1 = (t, x) => { if (!t.includes(x)) throw new Error('missing ' + x); };
  const need = (re, txt, what) => { const m = txt.match(re); if (!m) throw new Error('electrical source check failed: ' + what); return m; };
  const dashv = v => (v === null || v === undefined || v === '') ? '—' : esc(v);

  // ---------- data integrity ----------
  for (const w of WIRES) {
    for (const e of [w.from, w.to]) if (!cby[e.component]) throw new Error(`wire ${w.id} names unknown component ${e.component}`);
    if (!Array.isArray(w.route) || w.route.length < 2) throw new Error('wire route too short: ' + w.id);
  }
  const lenTotal = round2(sum(WIRES.map(w => w.length_m_est)));
  need(/Total harness ([\d.]+) m EST/, MD, 'total harness length');
  if (num(lenTotal) !== need(/Total harness ([\d.]+) m EST/, MD, 'total harness length')[1]) throw new Error(`harness length ${lenTotal} != research file`);
  const P = S.proposed, propRows = ROWS.filter(x => x.Type === 'Proposed');
  const propGoods = round2(sum(propRows.map(x => x['Ext USD'])));
  if (propGoods !== P.goods) throw new Error(`proposed goods ${propGoods} != summary.proposed.goods ${P.goods}`);
  if (round2(P.goods * (1 + S.taxRate)) !== P.withTax) throw new Error('proposed withTax mismatch');
  if (round2(S.reserve - P.withTax) !== P.reserveAfter) throw new Error('proposed reserveAfter mismatch');
  if (Math.abs(P.reserveAfter + S.nwaSwap.retailPropWithTax - P.reserveAfterWithNwa) > 0.011) throw new Error('proposed reserveAfterWithNwa mismatch');
  if (PROP.totals.goods_usd !== P.goods) throw new Error('proposed_lines.json totals disagree with the summary');

  // ---------- markdown helpers ----------
  const sec = n => need(new RegExp('^## ' + n + '\\. [^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))', 'm'), MD, 'section ' + n)[1];
  const tableOf = txt => txt.split('\n').filter(l => l.startsWith('|')).map(l => l.split('|').slice(1, -1).map(c => c.trim())).filter(r => !r.every(c => /^-+$/.test(c)));
  const S3 = sec(3), S4 = sec(4), S10 = sec(10), S11 = sec(11), S12 = sec(12), S8 = sec(8);

  // ---------- classification (this page's grouping, not a source claim) ----------
  const wcat = w => w.signal_or_power === 'pneumatic' ? 'air' : w.signal_or_power === 'power' ? (/Motor phase/i.test(w.function) ? 'phase' : 'pwr')
    : /DShot/i.test(w.function) ? 'dshot' : /I2C/i.test(w.function) ? 'i2c' : /GPS|CRSF|UART|SERIAL/i.test(w.function) ? 'uart' : 'pwm';
  const WCATS = [['pwr', 'Power (+ red, − gray)'], ['phase', 'Motor phase'], ['dshot', 'DShot'], ['pwm', 'Servo PWM'], ['i2c', 'I2C'], ['uart', 'UART (GPS, CRSF)'], ['air', 'Pneumatic hose']];
  const ccat = id => /^(BAT|XT90S|BUS|UBEC|CAP)/.test(id) ? 'power' : /^ESC/.test(id) ? 'esc' : /^SRV/.test(id) ? 'servo' : /^JB_/.test(id) ? 'conn' : /^MOT/.test(id) ? 'motor' : 'fc';
  const CCATS = [['power', 'Power'], ['fc', 'Flight control, sensors'], ['esc', 'ESC'], ['servo', 'Servo'], ['conn', 'Joint (connector)']];
  const zoneOfComp = c => { const p = c.placement; return p.x < -0.7 ? 'tail' : p.parent === 'Fuselage_Pod' ? 'pod' : p.z < 0 ? 'left' : 'right'; };
  const ZN = { pod: 'Pod', right: 'Right wing / boom', left: 'Left wing / boom', tail: 'Tail' };
  const joints = w => !w.joint ? [] : Array.isArray(w.joint) ? w.joint : String(w.joint).split(/,\s*/);
  for (const w of WIRES) { w.cat = wcat(w); w.zone = zoneOfComp(cby[w.to.component]); w.js = joints(w); }

  // ---------- numbers from the research file and analysis ----------
  const Vp = RES.base.Vpack, C0 = RES.concepts.C0.sized;
  const Vtr = +need(/transition [\d.]+ W at ([\d.]+) V/, S4, 'transition voltage')[1];
  const bt = tableOf(S4); const row = k => bt.find(r => r[0].startsWith(k)) || (() => { throw new Error('budget row ' + k); })();
  const fullRow = row('Full throttle, 4 lift, nominal'), fm = need(/(\d+) x ([\d.]+) A/, fullRow[3], 'full-throttle formula');
  const nFull = +fm[1], aFull = +fm[2], iFull = round2(nFull * aFull);
  const worstRow = row('Full throttle, 4 lift, full pack'), wm = need(/(\d+) x ([\d.]+) A/, worstRow[3], 'worst-case formula');
  const aWorst = +wm[2], iWorst = round2(+wm[1] * aWorst); chk0(iWorst, worstRow[1], 'worst-case full throttle');
  const motorLim = +need(/X4110S limit of (\d+) A for 30 s/, S4, 'motor limit')[1];
  const amp = need(/10 AWG (\d+) A, 12 AWG (\d+) A, 14 AWG (\d+) A/, sec(5), 'ampacity table'); const AMP = { 10: +amp[1], 12: +amp[2], 14: +amp[3] };
  const sv = row('Servos'), svRun = need(/([\d.]+) A at ([\d.]+) V running/, sv[1], 'servo running'), svStall = need(/stall ([\d.]+) A at ([\d.]+) V, ([\d.]+) A at ([\d.]+) V/, sv[3], 'servo stall');
  const fcI = need(/current sensor (\d+) A cont\/(\d+) A peak/, cby.FC1.interfaces, 'FC current sensor'), sensorC = +fcI[1], sensorP = +fcI[2];
  const bec = need(/servo 5\/6\/7\.2 V (\d+) A cont (\d+) A peak/, cby.FC1.supply, 'servo BEC'), becC = +bec[1], becP = +bec[2];
  const xt = need(/(\d+) A continuous \/ (\d+) A peak/, S3, 'XT90S rating'), xtC = +xt[1], xtP = +xt[2];
  const Ih = round2(C0.P_hover / Vp), Ihm = round2(C0.P_hover_per_motor / Vp), It = round2(C0.P_trans / Vtr), Ic = round2(C0.P_cruise / Vp);
  const chk = (a, b, w) => { if (num(a) !== num(parseFloat(b))) throw new Error(`budget ${w}: computed ${a} vs research file ${b}`); };
  chk(Ih, row('4 lift')[1], 'hover'); chk(Ic, row('Pusher')[2], 'cruise'); chk(It, row('Transition')[1], 'transition'); chk(iFull, fullRow[1], 'full throttle');
  chk(Ihm, need(/([\d.]+) A each/, row('4 lift')[3], 'per-motor')[1], 'per motor');
  const ratioSensor = round2(iWorst / sensorC), ratioXt = round2(It / xtC);
  const gpsPl = cby.GPS1.placement;
  const segD = (p, a, b) => { const ab = [0, 1, 2].map(i => b[i] - a[i]), ap = [0, 1, 2].map(i => p[i] - a[i]); const t = Math.max(0, Math.min(1, ab.reduce((s, v, i) => s + v * ap[i], 0) / ab.reduce((s, v) => s + v * v, 0))); return Math.hypot(...[0, 1, 2].map(i => p[i] - (a[i] + t * ab[i]))); };
  const gpsD = id => { const r = wby[id].route, p = [gpsPl.x, gpsPl.y, gpsPl.z]; return Math.min(...r.slice(1).map((q, i) => segD(p, r[i], q))); };
  const gpsD2 = gpsD('W02'), gpsD3 = gpsD('W03'), trunkI = wby.W02.current_A_max, bField = round2(2e-7 * trunkI / gpsD2 * 1e6);
  need(/0\.100 m \(W02\) and 0\.106 m \(W03\)/, sec(9), 'GPS trunk distance'); if (num(gpsD2, 3) !== '0.100' || num(gpsD3, 3) !== '0.106') throw new Error('GPS distance disagrees with the research file');
  const sel = (s, re) => need(re, s, String(re))[1];
  const geo = tableOf(S11), geoRow = k => geo.find(r => r[0].startsWith(k)) || (() => { throw new Error('geometry row ' + k); })();
  const dropM = +need(/\(\+([\d.]+) m\)/, geoRow('Ground y')[2], 'ground change')[1];
  const gearMass = need(/Added mass about (\d+) g EST/, S11, 'gear mass')[1];
  const limitsTxt = need(/governing nose-up pitch limits are the boom end \((\d+) deg\) and the stabiliser \((\d+) deg\)/, S11, 'pitch limits');
  const rollover = need(/Roll over angle ([\d.]+) deg/, S11, 'rollover')[1];
  const slack = need(/tube slack ([\d.]+) mm, ([\d.]+) mm after five kerfs/, S11, 'leg slack');
  const wheelItem = byId['G-01'].Item, wheelD_in = +need(/(\d+\.\d+) in wheel/, wheelItem, 'wheel diameter')[1];
  const axleItem = byId['G-02'].Item, axleL_in = +need(/x (\d+) in \(DUB248\)/, axleItem, 'axle length')[1];
  const wheelG = +need(/([\d.]+) g\/wheel/, wheelItem, 'wheel mass')[1];
  need(/"Only 1 left"; two pairs are needed/, S11, 'wheel stock note'); mustHave1(PROP.lines[0].why, 'Only 1 left');
  const wheelPrice = need(/\$([\d.]+) per pair/, S11, 'wheel price')[1]; if (+wheelPrice !== byId['G-01']['Unit USD']) throw new Error('wheel price in the research file disagrees with G-01');
  const axleOffset = need(/e = (\d+) mm below the tube end is EST/, S11, 'axle offset')[1];
  const gear = { D: round2(wheelD_in * 25.4) / 1000, axleL: round2(axleL_in * 25.4) / 1000, drop: dropM, widthKnown: false, widthDraw: 0.02, mass_g: wheelG,
    rows: geo.slice(1).map(r => ({ q: r[0], before: r[1], after: r[2] })), legX: [], note: 'proposal, not in the SOLIDWORKS model' };

  // ---------- diagram helpers (SVG, themed by CSS classes) ----------
  const T = (x, y, t, cls = '', anchor = '') => `<text x="${x}" y="${y}"${cls ? ` class="${cls}"` : ''}${anchor ? ` text-anchor="${anchor}"` : ''}>${esc(t)}</text>`;
  const cut = (s, px, cw = 5.6) => { s = String(s); const n = Math.max(4, Math.floor(px / cw)); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const shortName = n => n.split(/[,(:]/)[0].trim();

  // ===================== §3 block diagram (power tree + signal tree) =====================
  const idsOf = f => WIRES.filter(f).map(w => w.id);
  const rng = ids => ids.length > 1 ? ids[0] + '–' + ids[ids.length - 1] : ids[0] || '—';
  const dshotL = idsOf(w => w.cat === 'dshot' && /ESC_L/.test(w.to.component)), dshotP = idsOf(w => w.cat === 'dshot' && w.to.component === 'ESC_P');
  const pwmIds = idsOf(w => w.cat === 'pwm');
  const bx = (x, y, w, hgt, lines, cls = '') => `<g class="bxg"><rect class="bx ${cls}" x="${x}" y="${y}" width="${w}" height="${hgt}"/>${lines.map((l, i) => T(x + 10, y + 19 + i * 15, cut(l, w - 18), i === 0 ? 't' : '')).join('')}</g>`;
  const arw = (pts, lab = '', lx = 0, ly = 0, cls = '') => `<polyline class="ar ${cls}" points="${pts.map(p => p.join(',')).join(' ')}" marker-end="url(#ah)"/>${lab ? T(lx, ly, lab, 'al', 'middle') : ''}`;
  const dgW = 1200, dgH = 700;
  const powerSvg = (() => {
    const o = [];
    o.push(T(20, 22, 'POWER TREE', 'cap'));
    o.push(bx(20, 40, 170, 64, ['Ovonic 6S pack', `${Vp} V nominal`, `${num(Vp * 4.2 / 3.7, 1)} V full`], 'pw'));
    o.push(bx(225, 40, 140, 64, ['XT90S plug (CN01)', 'physical disconnect', 'R20'], 'pw'));
    o.push(bx(400, 40, 190, 64, ['FC PDB (FC1)', `current sensor ${sensorC} A cont`, `${sensorP} A peak · input 10–28 V`], 'pw'));
    o.push(bx(625, 100, 130, 64, ['BUS1 star splice', '10 AWG trunk in', 'single star ground'], 'pw'));
    o.push(arw([[190, 72], [225, 72]], 'W01', 207, 64)); o.push(arw([[365, 72], [400, 72]], 'W02', 382, 64));
    o.push(arw([[590, 72], [608, 72], [608, 132], [625, 132]], 'W03', 608, 62));
    const br = [[26, 'Lift ESCs L1–L4 (12 AWG)', `${rng(idsOf(w => /^BUS1/.test(w.from.component) && /ESC_L/.test(w.to.component)))} · 470 µF each`, 'Lift motors ×4', `${rng(idsOf(w => w.cat === 'phase' && /MOT_L/.test(w.to.component)))} phase leads`],
      [106, 'Pusher ESC (12 AWG)', `${idsOf(w => /^BUS1/.test(w.from.component) && w.to.component === 'ESC_P')[0]} · 470 µF`, 'Pusher motor', `${idsOf(w => w.cat === 'phase' && w.to.component === 'MOT_P')[0]} phase leads`],
      [186, 'UBEC 5 V 5 A (14 AWG)', `${idsOf(w => w.to.component === 'UBEC1')[0]} · own supply`, 'Remote ID (BeeID)', `${idsOf(w => w.to.component === 'RID1')[0]} 5 V + GND only`]];
    br.forEach(([y, a, a2, m, m2], i) => { o.push(bx(800, y, 200, 56, [a, a2], 'pw')); o.push(bx(1040, y, 140, 56, [m, m2], i === 2 ? 'sg' : 'pw'));
      o.push(arw([[755, 132], [778, 132], [778, y + 28], [800, y + 28]])); o.push(arw([[1000, y + 28], [1040, y + 28]])); });
    o.push(arw([[495, 104], [495, 200], [330, 200], [330, 226]], '', 0, 0)); o.push(arw([[495, 200], [650, 200], [650, 226]]));
    o.push(bx(210, 228, 240, 62, ['FC 5.2 V peripheral rail', `4 A rated`, 'GPS · receiver · airspeed'], 'rail'));
    o.push(bx(530, 228, 250, 62, ['FC servo rail, set to 7.2 V', `${becC} A cont / ${becP} A peak`, `5 servos · stall ${svStall[1]}–${svStall[3]} A`], 'rail'));
    return o.join('');
  })();
  const sigSvg = (() => {
    const o = [T(20, 330, 'SIGNAL TREE', 'cap')];
    const rows = [
      [`S1–S4 · DShot · SERVO1–4_FUNCTION 33–36 · ${rng(dshotL)}`, 'Lift ESCs L1–L4 (BLHeli_S 45 A)', 'sg'],
      [`S5 · DShot · SERVO5_FUNCTION 70 · ${dshotP[0]} (R-A)`, 'Pusher ESC', 'sg'],
      [`S8–S12 · PWM · functions 4, 4, 19, 21, 21 · ${rng(pwmIds)}`, 'Servos: 2 aileron, elevator, 2 rudder', 'sg'],
      [`UART5 = SERIAL5 · ${WIRES.find(w => /SERIAL5/.test(w.function)).id}`, 'GPS + compass (u-blox M10)', 'sg'],
      [`UART6 = SERIAL6, CRSF (protocol 23) · ${WIRES.find(w => /SERIAL6/.test(w.function)).id}`, 'Receiver (RadioMaster RP3 V2)', 'sg'],
      ['SERIAL1 · MAVLink2', 'Wireless board (on the FC stack)', 'sg'],
      [`I2C (single port) · ${WIRES.find(w => w.cat === 'i2c').id} · MS5525 at 0x76`, 'Airspeed module + GPS compass', 'sg']];
    o.push(bx(20, 350, 150, 330, ['FC1', 'CoreWing F405', 'Wing APP V2', '12 outputs', 'timer groups', '1-2 3-4 5-7 8-10 11-12'], 'pw'));
    rows.forEach(([l, d, c], i) => { const y = 356 + i * 46; o.push(arw([[170, y + 18], [700, y + 18]], l, 435, y + 10)); o.push(bx(700, y, 300, 36, [d], c)); });
    return o.join('');
  })();
  const dgSvg = `<svg viewBox="0 0 ${dgW} ${dgH}" class="dg" style="min-width:1000px" role="img" aria-label="Block diagram: power tree from the battery pack through the XT90S, the flight controller current sensor and star splice to five ESCs and a UBEC, with the FC servo and peripheral rails; and the signal tree of FC outputs, UARTs and I2C"><title>Power tree and signal tree</title>
<defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="ahead"/></marker></defs>${powerSvg}${sigSvg}</svg>`;

  // ===================== FC output map, UART map =====================
  const outMap = tableOf(S3.split('Timer groups')[0]).slice(1);
  const fcRows = outMap.map(([o, fn, sf, note]) => {
    const n = o.match(/^S(\d+)$/); const w = n ? WIRES.find(x => x.from.component === 'FC1' && new RegExp('^S' + n[1] + ' ').test(x.from.pin)) : null;
    if (w && sf !== '—') { const m = w.function.match(new RegExp('SERVO' + n[1] + '_FUNCTION (\\d+)')); if (!m || m[1] !== sf) throw new Error(`FC map ${o}: SERVO${n[1]}_FUNCTION ${sf} vs wire ${w.id}`); }
    return `<tr><td><span class="mono-id">${esc(o)}</span></td><td>${esc(fn)}</td><td class="n">${esc(sf)}</td><td>${w ? esc(w.to.component) : '—'}</td><td>${w ? `<span class="mono-id">${w.id}</span>` : '—'}</td><td>${note ? esc(note) : '—'}</td></tr>`; }).join('');
  const fcTable = `<div class="tbl"><table><thead><tr><th>Output</th><th>Function</th><th class="n">SERVOn_FUNCTION</th><th>Device</th><th>Wire</th><th>Note</th></tr></thead><tbody>${fcRows}</tbody></table></div>`;
  const uartLine = need(/UARTs: ([^\n]*)/, S3, 'UART line')[1];
  const wireFor = re => { const w = WIRES.find(x => re.test(x.function)); return w ? `<span class="mono-id">${w.id}</span>` : '—'; };
  const uartRows = [['SERIAL5', 'GPS (UART5)', wireFor(/SERIAL5/)], ['SERIAL6', 'RCIN, protocol 23 (CRSF, UART6)', wireFor(/SERIAL6/)], ['SERIAL1', 'wireless MAVLink2', '—'], ['SERIAL2/3/4', 'free', '—'],
    ['I2C (one port, GPS/airspeed connector)', 'GPS compass and MS5525 airspeed at 0x76', wireFor(/I2C/) + ' ' + wireFor(/SERIAL5/)]];
  for (const [k] of uartRows.slice(0, 4)) if (!uartLine.includes(k.replace('SERIAL', 'SERIAL'))) throw new Error('UART line missing ' + k);
  need(/MS5525 airspeed at (0x76)/, S3, 'I2C address');
  const uartTable = `<div class="tbl"><table><thead><tr><th>Port</th><th>Assignment</th><th>Wire</th></tr></thead><tbody>${uartRows.map(([a, b, c]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td><td>${c}</td></tr>`).join('')}</tbody></table></div>`;

  // ===================== power budget =====================
  const dlim = (v, lim) => v > lim ? 'bad' : v > 0.8 * lim ? 'warn' : 'ok';
  const budgetRows = [
    ['4 lift ESCs, hover', num(Ih) + ' A', '0 (stopped)', `${num(C0.P_hover)} W / ${Vp} V = ${num(Ih)} A; each ${num(C0.P_hover_per_motor)} W / ${Vp} V = ${num(Ihm)} A`, 'analysis/results.json C0.sized.P_hover, P_hover_per_motor; base.Vpack'],
    ['Transition peak', num(It) + ' A', '', `${num(C0.P_trans)} W / ${Vtr} V = ${num(It)} A`, 'analysis/results.json C0.sized.P_trans; voltage from the research file §4'],
    ['Pusher, cruise', '0', num(Ic) + ' A', `${num(C0.P_cruise)} W / ${Vp} V = ${num(Ic)} A`, 'analysis/results.json C0.sized.P_cruise'],
    [`Full throttle, ${nFull} lift ESCs, nominal ${Vp} V (lower bound)`, num(iFull, 1) + ' A', '', `${nFull} × ${aFull} A = ${num(iFull, 1)} A (17×5.8 prop)`, 'docs/research/budget-lift.md line 42, A3'],
    [`Full throttle, ${nFull} lift ESCs, full pack 25 V (worst case)`, num(iWorst, 1) + ' A', '', `${nFull} × ${aWorst} A = ${num(iWorst, 1)} A`, 'docs/research/budget-lift.md line 42, A3 (3600 gf at 33.3 A, 25 V)'],
    ['Pusher at full throttle; lift + pusher together', '—', '—', 'not in the sources read; would add to the lift figure', 'research file §4'],
    ['Servos (5)', `${svRun[1]} A running at ${svRun[2]} V`, 'same', `stall ${svStall[1]} A at ${svStall[2]} V, ${svStall[3]} A at ${svStall[4]} V`, 'research file §4'],
    ['Peripheral rail', '—', '—', 'GPS, receiver current —', 'research file §4'],
    ['Remote ID UBEC', '—', '—', 'module current not on page read', 'research file §4']];
  const budgetTable = `<div class="tbl"><table><thead><tr><th>Branch</th><th class="n">Hover</th><th class="n">Cruise</th><th>Formula</th></tr></thead><tbody>${budgetRows.map(r => `<tr><td>${esc(r[0])}</td><td class="n">${esc(r[1])}</td><td class="n">${esc(r[2] || '—')}</td><td>${esc(r[3])}</td></tr>`).join('')}</tbody></table></div>`;
  const lim = (name, rating, worst, wl, b) => { const r = round2(worst / b), bad = worst > b;
    return `<tr><td>${esc(name)}</td><td class="n">${esc(rating)}</td><td>${esc(wl)}</td><td class="n">${num(worst, 1)} A</td><td class="n">×${num(r)}</td><td><span class="chip ${bad ? 'bad' : 'ok'}">${bad ? 'exceeds' : 'within'}</span></td></tr>`; };
  const limRows = [
    lim('FC current sensor (continuous)', `${sensorC} A`, iWorst, `full throttle, full pack: ${nFull} × ${aWorst} A`, sensorC),
    lim('FC current sensor (continuous)', `${sensorC} A`, iFull, `full throttle, nominal: ${nFull} × ${aFull} A`, sensorC),
    lim('FC current sensor (continuous)', `${sensorC} A`, It, 'transition peak', sensorC),
    lim('XT90S, lower listing (continuous)', `${xtC} A`, It, 'transition peak', xtC),
    lim('XT90S, lower listing (continuous)', `${xtC} A`, Ih, 'hover', xtC),
    lim('Lift motor X4110S (30 s)', `${motorLim} A`, aWorst, 'full throttle per motor, full pack', motorLim),
    lim('Lift motor X4110S (30 s)', `${motorLim} A`, aFull, 'full throttle per motor, nominal', motorLim),
    lim('Servo rail (peak)', `${becP} A`, +svStall[3], `stall at ${svStall[4]} V`, becP),
    lim('Servo rail (continuous)', `${becC} A`, +svRun[1], `5 servos running at ${svRun[2]} V`, becC)];
  const limTable = `<div class="tbl"><table><thead><tr><th>Limit</th><th class="n">Rating</th><th>Worst case</th><th class="n">Current</th><th class="n">Ratio</th><th>Verdict</th></tr></thead><tbody>${limRows.join('')}</tbody></table></div>`;

  // ===================== conflicts =====================
  const rbul = Object.fromEntries([...S3.matchAll(/^- (R-[A-F])\. (.*)$/gm)].map(m => [m[1], m[2]]));
  for (const k of ['R-A', 'R-B', 'R-C', 'R-D', 'R-E', 'R-F']) if (!rbul[k]) throw new Error('missing ' + k);
  const test7 = sel(S10, /^7\. (.*)$/m);
  const clean = t => t.replace(/\s*\(https?:[^)]*\)/g, '').replace(/\s*https?:\/\/\S+/g, '');
  const conflicts = [
    ['bad', 'Exceeds rating', `Lift full-throttle current up to ${num(iWorst, 1)} A (${nFull} × ${aWorst} A at 25 V; ${num(iFull, 1)} A at nominal) against the ${sensorC} A sensor (×${num(ratioSensor)}); each motor ${aWorst} A (${aFull} A nominal) exceeds the ${motorLim} A / 30 s limit`, `Set the QuadPlane motor output maximum so each lift motor stays at or below ${motorLim} A on the thrust stand; parameter to confirm against the ArduPilot QuadPlane docs. Then bench-verify (test 8).`, 'Margin paragraph §4; test 8 §10; budget-lift.md line 42'],
    ['bad', 'Exceeds rating', clean(rbul['R-D']).replace(/\s*Transition is.*$/, '') + ` Transition ${num(It, 1)} A exceeds the ${xtC} A continuous rating (×${num(ratioXt)}).`, '— (no action in the research file; plan against the lower rating, and the throttle cap in the first row also reduces this current)', 'R-D, §3'],
    ['warn', 'Exceeds rating', `Servo stall (${svStall[1]} to ${svStall[3]} A) against the servo rail's ${becC} A continuous / ${becP} A peak`, `Run test 7: ${test7.replace(/\.$/, '')}.`, 'Margin paragraph §4; test 7 §10'],
    ['warn', 'Interference', `The power trunk passes the GPS at ${num(gpsD2, 3)} m (W02) and ${num(gpsD3, 3)} m (W03), not 0.15 m; single-wire field at ${trunkI} A is about ${Math.round(bField)} µT (EST), above a typical Earth field of about 50 µT`, 'Raise the GPS on a mast so it is at least 0.15 m from the trunk; twist the battery + and − pair.', '§9, computed from wiring.json routes'],
    ['warn', 'Unverified', clean(rbul['R-A']).replace(/;.*$/, ''), need(/Fallback: ([^.]*)\./, rbul['R-A'], 'R-A fallback')[0], 'R-A, §3'],
    ['warn', 'Board conflict', clean(rbul['R-B']).replace(/\(the PWM12.*?confirm\);/, '').replace(/;.*$/, '') + ' (PWM12 = LED pad is from the V1 board page; V2 to confirm)', `Fallback: ${need(/fallback is (a Y-lead from S11 for both rudders)/, rbul['R-B'], 'R-B fallback')[1]}.`, 'R-B, §3 (oscarliang.com/speedybee-f405-wing-app/)'],
    ['warn', 'To confirm', clean(rbul['R-E']).replace(/^Servo V\+ on the S-pad header: /, 'Servo V+ on the S-pad header: '), 'Confirm on the bench before connecting servos.', 'R-E, §3'],
    ['warn', 'Risk', clean(rbul['R-F']), 'Measure contact heating at the stall test; the stall test is test 7.', 'R-F, §3'],
    ['open', 'Unresolved', clean(rbul['R-C']).replace(/\s*Unresolved which is right\.?/, ''), '— (both ranges pass at full pack voltage; which listing is right is unresolved)', 'R-C, §3'],
    ['open', 'Setup', 'ArduPilot QuadPlane defaults the lift motors to outputs 5–8; this design uses outputs 1–4 (functions 33–36) and the pusher on S5', 'Set SERVO1–4_FUNCTION = 33–36 and set SERVO5–8 explicitly (S5 = 70; S6, S7 spare).', '§3 (ardupilot.org/plane/docs/quadplane-frame-setup.html)']];
  const confTable = `<div class="tbl"><table><thead><tr><th>Severity</th><th>Conflict</th><th>Recommended action</th><th>Source</th></tr></thead><tbody>${conflicts.map(c => `<tr><td><span class="chip ${c[0]}">${c[1]}</span></td><td>${esc(c[2])}</td><td>${esc(c[3])}</td><td><small>${esc(c[4])}</small></td></tr>`).join('')}</tbody></table></div>`;

  // ===================== wiring blueprint (SVG generated from wiring.json) =====================
  const ENDP = /^(ESC|MOT|SRV|ASPD|PITOT)/, isEnd = id => ENDP.test(id);
  const ROW = 36, HDR = 26, TROW = 20, X = { loop0: 96, tx: 112, tw: 300, x0: 500, J: { 1: 700, 2: 830, 3: 980 }, xp: { 0: 770, 1: 770, 2: 900, 3: 1050 }, pw: 200, gap: 160, mw: 170 };
  const connFor = (w, j) => { const m = WIR.connectors.filter(c => c.joint === j && c.wires.includes(w.id)); return m.length ? m[m.length - 1] : null; };
  const connShort = c => c ? c.type.replace(/ pair( x\d)?/, '').replace('JST-GH 4-pin', 'JST-GH 4P') : '';
  const primaries = {}, trunk = [...new Set(WIRES.flatMap(w => [w.from.component, w.to.component]))].filter(id => !isEnd(id));
  for (const w of WIRES) { const a = isEnd(w.from.component), b = isEnd(w.to.component);
    if (!a && b) { (primaries[w.to.component] = primaries[w.to.component] || { id: w.to.component, rails: [], chains: [] }).rails.push(w); }
    else if (a && b) { (primaries[w.from.component] = primaries[w.from.component] || { id: w.from.component, rails: [], chains: [] }).chains.push(w); }
    else if (!(a || b)) w.loop = true; else throw new Error('wire from an endpoint to a trunk component: ' + w.id); }
  const prim = Object.values(primaries);
  for (const p of prim) { const all = p.rails.flatMap(w => w.js.map(j => +j[1])); p.stage = Math.max(0, ...all); p.zone = zoneOfComp(cby[p.id]); p.rails.sort((a, b) => a.id.localeCompare(b.id)); p.chains.sort((a, b) => a.id.localeCompare(b.id)); }
  const ZORD = ['pod', 'right', 'left', 'tail'];
  prim.sort((a, b) => ZORD.indexOf(a.zone) - ZORD.indexOf(b.zone) || a.stage - b.stage || a.id.localeCompare(b.id));
  const capOf = id => cby['CAP_' + id.slice(4)];
  let y = 64; const blocks = [], railRows = [], zoneMarks = []; let lastZone = null;
  for (const p of prim) {
    if (p.zone !== lastZone) { zoneMarks.push({ y, zone: p.zone }); y += 26; lastZone = p.zone; }
    const top = y, n = p.rails.length + p.chains.length, cap = capOf(p.id); const x = X.xp[p.stage];
    p.top = top; p.x = x; p.h = HDR + n * ROW + (cap ? 22 : 0) - 4;
    [...p.rails, ...p.chains].forEach((w, i) => { w.ry = top + HDR + ROW * (i + 0.5); w.prim = p; });
    blocks.push({ kind: 'prim', id: p.id, x, w: X.pw, top, h: p.h, rails: p.rails, chains: p.chains, cap });
    for (const w of p.chains) { const to = cby[w.to.component]; const mx = x + X.pw + X.gap; blocks.push({ kind: 'sec', id: to.id, x: mx, w: X.mw, top: w.ry - ROW / 2 - HDR, h: HDR + ROW - 4, wires: [w] }); }
    y = top + p.h + 14;
  }
  // secondary blocks sharing a component (PITOT1 has two wires) merge
  const secs = {}; for (const b of blocks.filter(b => b.kind === 'sec')) { if (secs[b.id]) { secs[b.id].wires.push(...b.wires); secs[b.id].h = Math.max(...secs[b.id].wires.map(w => w.ry)) + ROW / 2 - 4 - secs[b.id].top; b.drop = true; } else secs[b.id] = b; }
  const blocksOut = blocks.filter(b => !b.drop);
  const railBottom = y;
  // trunk column: stacked blocks with left pins (loop wires) and right pins (rail sources)
  const TORD = ['BAT1', 'XT90S_1', 'FC1', 'BUS1', 'UBEC1', 'RID1', 'GPS1', 'RX1']; if (TORD.length !== trunk.length || trunk.some(t => !TORD.includes(t))) throw new Error('trunk components changed: ' + trunk);
  const pinKey = (c, p) => c + '|' + p, pins = {};
  const addPin = (c, p, side, w) => { const k = pinKey(c, p); const e = pins[k] || (pins[k] = { c, p, side, wires: [] }); e.wires.push(w); return e; };
  for (const w of WIRES) { if (w.loop) { addPin(w.from.component, w.from.pin, 'L', w); addPin(w.to.component, w.to.pin, 'L', w); } else if (!isEnd(w.from.component)) addPin(w.from.component, w.from.pin, 'R', w); }
  const tb = []; let ty = 64;
  for (const id of TORD) {
    const ps = Object.values(pins).filter(p => p.c === id); const L = ps.filter(p => p.side === 'L'), Rr = ps.filter(p => p.side === 'R').sort((a, b) => Math.min(...a.wires.map(w => w.ry)) - Math.min(...b.wires.map(w => w.ry)));
    const top = ty; const ordered = [...L, ...Rr]; ordered.forEach((p, i) => { p.y = top + HDR + TROW * (i + 0.5); });
    const hh = HDR + Math.max(1, ordered.length) * TROW; tb.push({ id, top, h: hh, pins: ordered }); ty = top + hh + 16;
  }
  const trunkBottom = ty;
  // loop lanes (interval colouring), nearest lane to the blocks for the shortest spans
  const loops = WIRES.filter(w => w.loop).map(w => ({ w, a: pins[pinKey(w.from.component, w.from.pin)].y, b: pins[pinKey(w.to.component, w.to.pin)].y })).sort((p, q) => Math.abs(p.a - p.b) - Math.abs(q.a - q.b));
  const lanes = []; for (const l of loops) { const lo = Math.min(l.a, l.b) - 4, hi = Math.max(l.a, l.b) + 4; let k = lanes.findIndex(L => L.every(([a, b]) => hi < a || lo > b)); if (k < 0) { k = lanes.length; lanes.push([]); } lanes[k].push([lo, hi]); l.lane = k; }
  const loopX = k => X.tx - 12 - k * 9;
  // rail lanes in gutter A: downward wires first (higher source gets the outer lane), then upward
  const rails = WIRES.filter(w => !w.loop && !isEnd(w.from.component)).map(w => ({ w, ys: pins[pinKey(w.from.component, w.from.pin)].y, yt: w.ry }));
  const down = rails.filter(r => r.yt >= r.ys).sort((p, q) => p.ys - q.ys), up = rails.filter(r => r.yt < r.ys).sort((p, q) => q.ys - p.ys);
  const gx0 = X.tx + X.tw + 14, gStep = Math.min(9, (X.x0 - 14 - gx0) / Math.max(1, rails.length));
  [...down, ...up].forEach((r, i) => { r.lx = gx0 + gStep * (i + 0.5); });
  const H = Math.max(railBottom, trunkBottom) + 100, W = 1500;
  const wClass = w => 'w-' + w.cat, wTitle = w => `${w.id}: ${w.function}; ${w.from.component} ${w.from.pin} → ${w.to.component} ${w.to.pin}; ${w.gauge_awg ? w.gauge_awg + ' AWG' : 'gauge —'}; ${w.colour}; ${w.length_m_est} m EST${w.js.length ? '; joints ' + w.js.join(', ') : ''}`;
  const isPair = w => w.cat === 'pwr' && /red/.test(w.colour) && /black/.test(w.colour);
  const wirePath = (d, w) => `<g class="wire"><title>${esc(wTitle(w))}</title><path d="${d}" class="${wClass(w)}${isPair(w) ? ' pair' : ''}"/>${isPair(w) ? `<path d="${d}" class="w-gnd"/>` : ''}</g>`;
  const lab = w => `${w.id} · ${w.gauge_awg ? w.gauge_awg + ' AWG' : '— AWG'} · ${String(w.colour).replace(/\s*\(.*$/, '')}`;
  const bp = [];
  bp.push(`<rect class="frame" x="4" y="4" width="${W - 8}" height="${H - 8}"/>`);
  bp.push(T(20, 30, 'WIRING BLUEPRINT · lift + cruise VTOL (C0)', 'cap')); bp.push(T(20, 46, 'Orthogonal wires pin to pin; connector symbols mark the breakdown joints; lengths are EST route lengths', 'sm'));
  // trunk blocks
  for (const b of tb) { const c = cby[b.id];
    bp.push(`<g class="blk"><title>${esc(b.id + ': ' + c.name)}</title><rect class="bk" x="${X.tx}" y="${b.top}" width="${X.tw}" height="${b.h}"/><rect class="bkh" x="${X.tx}" y="${b.top}" width="${X.tw}" height="${HDR - 4}"/>${T(X.tx + 8, b.top + 15, b.id, 'idt')}${T(X.tx + 8 + 8 * b.id.length + 8, b.top + 15, cut(shortName(c.name), X.tw - 24 - 8 * b.id.length), 'sm')}`);
    for (const p of b.pins) { const left = p.side === 'L'; bp.push(`<circle class="pin" cx="${left ? X.tx : X.tx + X.tw}" cy="${p.y}" r="3"/>${T(left ? X.tx + 9 : X.tx + X.tw - 9, p.y + 4, cut(p.p, X.tw - 26, 6.4), 'pn', left ? '' : 'end')}`); }
    bp.push('</g>'); }
  // loop wires (left lanes)
  for (const l of loops) { const w = l.w, lx = loopX(l.lane); bp.push(wirePath(`M${X.tx},${l.a} H${lx} V${l.b} H${X.tx}`, w)); bp.push(T(lx - 3, Math.min(l.a, l.b) + 12, w.id, 'wl', 'end')); }
  // zone bands
  const zEnd = (z, i) => (zoneMarks[i + 1] ? zoneMarks[i + 1].y : railBottom) - 8;
  zoneMarks.forEach((z, i) => { bp.push(`<line class="zl" x1="${X.x0 - 6}" y1="${z.y}" x2="${W - 14}" y2="${z.y}"/>${T(X.x0, z.y + 17, ZN[z.zone].toUpperCase(), 'cap')}`); });
  // rail wires
  for (const r of rails) { const w = r.w, p = w.prim, yt = w.ry;
    const d = `M${X.tx + X.tw},${r.ys} H${r.lx} V${yt} H${p.x}`; bp.push(wirePath(d, w));
    bp.push(T(X.x0 + 6, yt - 9, cut(lab(w), X.J[1] - 24 - X.x0 - 6, 6.4), 'wl')); }
  // chained wires (ESC -> motor, ASPD -> pitot)
  for (const p of prim) for (const w of p.chains) { const x1 = p.x + X.pw, x2 = x1 + X.gap; bp.push(wirePath(`M${x1},${w.ry} H${x2}`, w)); bp.push(T(x1 + 6, w.ry - 9, cut(lab(w), X.gap - 10, 6.4), 'wl')); }
  // joints: per joint id, runs of consecutive rail rows
  const jr = {}; for (const w of WIRES) for (const j of w.js) (jr[j] = jr[j] || []).push(w);
  const rowOrder = prim.flatMap(p => p.rails).map(w => w.id);
  for (const [j, ws] of Object.entries(jr)) { const xj = X.J[+j[1]]; const idx = ws.map(w => rowOrder.indexOf(w.id)).sort((a, b) => a - b); const runs = []; for (const i of idx) { const last = runs[runs.length - 1]; if (last && i === last[last.length - 1] + 1) last.push(i); else runs.push([i]); }
    for (const run of runs) { const wsr = run.map(i => wby[rowOrder[i]]); const y1 = Math.min(...wsr.map(w => w.ry)) - 24, y2 = Math.max(...wsr.map(w => w.ry)) + 14;
      bp.push(`<rect class="jband" x="${xj - 18}" y="${y1}" width="36" height="${y2 - y1}"/>${T(xj, y1 + 10, j.replace('_', ' '), 'jl', 'middle')}`);
      for (const w of wsr) { const c = connFor(w, j); bp.push(`<g class="jsym"><title>${esc(j + ': ' + (c ? c.id + ' ' + c.type : 'connector —') + ' (' + w.id + ')')}</title><rect x="${xj - 9}" y="${w.ry - 6}" width="18" height="12"/><line x1="${xj}" y1="${w.ry - 6}" x2="${xj}" y2="${w.ry + 6}"/></g>${T(xj, w.ry + 18, connShort(c), 'ct', 'middle')}`); } } }
  // endpoint blocks
  for (const b of blocksOut) { const c = cby[b.id], isP = b.kind === 'prim';
    bp.push(`<g class="blk"><title>${esc(b.id + ': ' + c.name)}</title><rect class="bk" x="${b.x}" y="${b.top}" width="${b.w}" height="${b.h}"/><rect class="bkh" x="${b.x}" y="${b.top}" width="${b.w}" height="${HDR - 4}"/>${T(b.x + 8, b.top + 15, b.id, 'idt')}${T(b.x + 14 + 8 * b.id.length, b.top + 15, cut(shortName(c.name), b.w - 22 - 8 * b.id.length), 'sm')}`);
    if (isP) { for (const w of b.rails) bp.push(`<circle class="pin" cx="${b.x}" cy="${w.ry}" r="3"/>${T(b.x + 9, w.ry + 4, cut(w.to.pin, b.w - 20, 6.4), 'pn')}`);
      for (const w of b.chains) bp.push(`<circle class="pin" cx="${b.x + b.w}" cy="${w.ry}" r="3"/>${T(b.x + b.w - 9, w.ry + 4, cut(w.from.pin, b.w - 20, 6.4), 'pn', 'end')}`);
      if (b.cap) { const cy = b.top + b.h - 8, m = b.cap.name.match(/(\d+) uF (\d+) V/); bp.push(`<line class="cpl" x1="${b.x}" y1="${cy - 12}" x2="${b.x + b.w}" y2="${cy - 12}"/>${T(b.x + 8, cy, cut(`+ ${b.cap.id} ${m[1]} µF ${m[2]} V (EST)`, b.w - 14, 5.6), 'sm')}`); } }
    else for (const w of b.wires) bp.push(`<circle class="pin" cx="${b.x}" cy="${w.ry}" r="3"/>${T(b.x + 9, w.ry + 4, cut(w.to.pin, b.w - 20, 6.4), 'pn')}`);
    bp.push('</g>'); }
  // title block
  const tx0 = W - 456, ty0 = H - 84;
  bp.push(`<g class="tblk"><rect x="${tx0}" y="${ty0}" width="440" height="72"/><line x1="${tx0}" y1="${ty0 + 24}" x2="${tx0 + 440}" y2="${ty0 + 24}"/><line x1="${tx0 + 150}" y1="${ty0 + 24}" x2="${tx0 + 150}" y2="${ty0 + 72}"/><line x1="${tx0 + 250}" y1="${ty0 + 24}" x2="${tx0 + 250}" y2="${ty0 + 72}"/><line x1="${tx0 + 340}" y1="${ty0 + 24}" x2="${tx0 + 340}" y2="${ty0 + 72}"/>
${T(tx0 + 8, ty0 + 17, 'DBF-ELE-001 · Wiring blueprint', 'idt')}${T(tx0 + 8, ty0 + 44, 'Sheet 1 of 1', 'sm')}${T(tx0 + 8, ty0 + 62, 'Lengths: EST (route × 1.10)', 'sm')}${T(tx0 + 158, ty0 + 44, 'Rev ' + REV, 'sm')}${T(tx0 + 158, ty0 + 62, DATE, 'sm')}${T(tx0 + 258, ty0 + 44, 'Owner', 'sm')}${T(tx0 + 258, ty0 + 62, 'T. Hottier', 'sm')}${T(tx0 + 348, ty0 + 44, 'Wires', 'sm')}${T(tx0 + 348, ty0 + 62, String(WIRES.length), 'sm')}</g>`);
  const bpSvg = `<svg viewBox="0 0 ${W} ${H}" class="dg bp" style="min-width:${W}px" role="img" aria-label="Wiring blueprint: ${WIRES.length} wires drawn pin to pin between the components, grouped by pod, right wing and boom, left wing and boom and tail, with the breakdown joints J1 to J3 shown as connector symbols"><title>Wiring blueprint DBF-ELE-001</title>${bp.join('')}</svg>`;
  const wLegend = `<div class="keyline wkey">${WCATS.map(([k, n]) => `<span class="wk"><svg width="26" height="10" aria-hidden="true"><path d="M0,5 H26" class="w-${k}${k === 'pwr' ? ' pair' : ''}"/>${k === 'pwr' ? '<path d="M0,5 H26" class="w-gnd"/>' : ''}</svg>${esc(n)}</span>`).join('')}<span class="wk"><svg width="26" height="14" aria-hidden="true"><rect class="jsymk" x="4" y="1" width="18" height="12"/><line class="jsymk" x1="13" y1="1" x2="13" y2="13"/></svg>Breakdown joint (connector pair)</span></div>`;

  // ===================== wire schedule =====================
  const lenBy = (f) => round2(sum(WIRES.filter(f).map(w => w.length_m_est)));
  const condBy = f => round2(sum(WIRES.filter(f).map(w => w.length_m_est * w.conductors)));
  const gauges = [10, 12, 14]; const gRows = [];
  for (const g of gauges) gRows.push([`${g} AWG`, WIRES.filter(w => w.gauge_awg === g), 'cut and buy (conductor metres)']);
  const noG = WIRES.filter(w => w.gauge_awg == null);
  gRows.push(['— · power/phase leads', noG.filter(w => w.signal_or_power === 'power'), 'gauge not on any page read; leads supplied with the part']);
  gRows.push(['— · signal and servo leads', noG.filter(w => w.signal_or_power === 'signal'), 'kit servo leads and extensions; gauge —']);
  gRows.push(['— · pneumatic hose', noG.filter(w => w.signal_or_power === 'pneumatic'), 'silicone tube (conductors column = 1 tube)']);
  const gaugeTable = `<div class="tbl"><table><thead><tr><th>Gauge</th><th class="n">Wires</th><th class="n">Route length EST</th><th class="n">Conductor length EST</th><th>Note</th></tr></thead><tbody>${gRows.map(([n, ws, note]) => `<tr><td>${esc(n)}</td><td class="n">${ws.length}</td><td class="n">${num(round2(sum(ws.map(w => w.length_m_est))))} m</td><td class="n">${num(round2(sum(ws.map(w => w.length_m_est * w.conductors))))} m</td><td>${esc(note)}</td></tr>`).join('')}<tr class="total"><td>All wires</td><td class="n">${WIRES.length}</td><td class="n">${num(lenTotal)} m</td><td class="n">${num(condBy(() => true))} m</td><td>route length matches the research file §5 (${num(lenTotal)} m EST); conductor length = route length × conductors</td></tr></tbody></table></div>`;
  const ampRows = [10, 12, 14].map(g => { const ws = WIRES.filter(w => w.gauge_awg === g); const peak = w => (w.id === 'W02' || w.id === 'W03') ? iWorst : /^W0[4-7]$/.test(w.id) ? aWorst : w.current_A_max; const worst = Math.max(...ws.map(peak)), nom = Math.max(...ws.map(w => w.current_A_max));
    const ex = worst > AMP[g]; return `<tr><td>${g} AWG</td><td class="n">${AMP[g]} A</td><td>${ws.map(w => w.id).join(', ')}</td><td class="n">${nom} A</td><td class="n">${num(worst, 1)} A</td><td><span class="chip ${ex ? 'bad' : 'ok'}">${ex ? 'exceeds' : 'within'}</span></td></tr>`; }).join('');
  const ampTable = `<div class="tbl"><table><thead><tr><th>Gauge</th><th class="n">Table ampacity</th><th>Wires</th><th class="n">I max in wiring.json</th><th class="n">Worst case</th><th>Verdict</th></tr></thead><tbody>${ampRows}</tbody></table></div>
<p>Worst case = ${nFull} × ${aWorst} A = ${num(iWorst, 1)} A at the 10 AWG trunk and ${aWorst} A per 12 AWG lift branch (full pack, uncapped). The 10 AWG trunk exceeds its table value: keep it only because it is ${num(round2(sum(WIRES.filter(w => w.gauge_awg === 10).map(w => w.length_m_est))), 2)} m long and the high current is intermittent, and cap the lift throttle; if the cap is not enforced, use 8 AWG (ampacity not looked up, —). A 14 AWG wire must not carry a motor current (${aFull} A exceeds ${AMP[14]} A): use 12 AWG. The 14 AWG wire here feeds only the UBEC.</p>`;
  const fnOpts = WCATS.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join(''), znOpts = ZORD.map(z => `<option value="${z}">${ZN[z]}</option>`).join('');
  const ep = e => `${esc(e.component)}.${esc(e.pin)}`;
  const wcols = [['ID', 's'], ['Function', 's'], ['From', 's'], ['To', 's'], ['Gauge AWG', 'n'], ['Colour', 's'], ['Connectors', 's'], ['Joint', 's'], ['Length m EST', 'n'], ['I max A', 'n'], ['Source', 's']];
  const wrows = WIRES.map(w => `<tr data-zone="${w.zone}" data-cat="${w.cat}"><td data-v="${w.id}"><span class="mono-id">${w.id}</span></td><td>${esc(w.function)}</td><td>${ep(w.from)}</td><td>${ep(w.to)}</td><td class="n" data-v="${w.gauge_awg ?? -1}">${w.gauge_awg ?? '—'}</td><td>${esc(w.colour)}</td><td><small>${esc(w.connector_from)} → ${esc(w.connector_to)}</small></td><td>${w.js.length ? w.js.join(', ') : '—'}</td><td class="n" data-v="${w.length_m_est}">${num(w.length_m_est, 3)}</td><td class="n" data-v="${w.current_A_max ?? -1}">${w.current_A_max ?? '—'}</td><td class="srcc"><small>${esc(w.source)}</small></td></tr>`).join('');
  const wsched = `<div class="toolbar"><label>Zone<select id="wZone"><option value="">All</option>${znOpts}</select></label><label>Function<select id="wFn"><option value="">All</option>${fnOpts}</select></label><button type="button" class="themebtn" id="wClear">Clear filters</button><span class="count" id="wCount" aria-live="polite">${WIRES.length} of ${WIRES.length} wires</span></div>
<div class="tbl" tabindex="0" role="region" aria-label="Wire schedule, scrolls sideways"><table id="wTable" class="sortable" style="min-width:1200px"><thead><tr>${wcols.map(([c, t]) => `<th class="sort${t === 'n' ? ' n' : ''}" data-t="${t}"><button type="button" class="thbtn">${c}</button></th>`).join('')}</tr></thead><tbody>${wrows}</tbody>
<tfoot><tr class="total"><td colspan="8" id="wTotLbl">Route length shown (${WIRES.length} wires)</td><td class="n" id="wTot">${num(lenTotal, 3)}</td><td colspan="2">m EST</td></tr></tfoot></table></div>`;

  // ===================== harness by joint =====================
  const jointIds = [...new Set(WIR.connectors.map(c => c.joint).filter(Boolean))].sort((a, b) => a[1] - b[1] || b[3].localeCompare(a[3]));
  const jcards = jointIds.map(j => { const cs = WIR.connectors.filter(c => c.joint === j), ws = [...new Set(cs.flatMap(c => c.wires))].sort();
    const side = j.endsWith('R') ? 'right' : 'left';
    return `<div class="card jcard"><h3><span class="mono-id">${j.replace('_', ' ')}</span> ${side} · ${esc(cs[0].location)}</h3><p class="meta">${sum(cs.map(c => c.mated_pairs))} mated pairs · ${ws.length} wire${ws.length > 1 ? 's' : ''} cross</p><ul>${cs.map(c => `<li><span class="mono-id">${c.id}</span><span>${esc(c.type)}: ${c.wires.map(id => `${id} <small>${esc(shortName(wby[id].function))}</small>`).join(', ')}</span><span class="q">${c.mated_pairs}×</span></li>`).join('')}</ul></div>`; }).join('');
  const fixed = WIR.connectors.filter(c => !c.joint).map(c => `<li><span class="mono-id">${c.id}</span> ${esc(c.type)} (${esc(c.location)}): ${c.wires.join(', ')}</li>`).join('');
  need(/Harness segmentation \(R4\)/, MD, 'R4 harness heading');

  // ===================== tests and measurements =====================
  const tests = [...S10.matchAll(/^(\d+)\. (.*)$/gm)].map(m => m[2]); if (tests.length < 6) throw new Error('test plan items');
  const checklist = `<ul class="check">${tests.map((t, i) => `<li><input type="checkbox" id="et${i + 1}"><label for="et${i + 1}"><b>${i + 1}.</b> ${esc(t)}</label></li>`).join('')}</ul>`;
  const measure = `<div class="measure"><h4>What the team must measure</h4><ol>
<li><span class="id">E1</span><div><b>Continuity and polarity on all ${WIRES.length} wires.</b> <span class="how">Before any pack is connected: every wire in the schedule, then XT90S, XT60H and ESC pads.</span> <span class="fail">Any short or reversed pole fails. Numeric threshold: —.</span></div></li>
<li><span class="id">E2</span><div><b>Smoke-stopper first power-up.</b> <span class="how">A bulb in series on the pack side.</span> <span class="fail">Pass or fail threshold: —.</span></div></li>
<li><span class="id">E3</span><div><b>Current-sensor calibration.</b> <span class="how">Start from BATT_VOLT_MULT ${esc(sel(S10, /BATT_VOLT_MULT ([\d.]+)/))} and BATT_AMP_PERVLT ${esc(sel(S10, /BATT_AMP_PERVLT (\d+)/))} (vendor defaults); trim against a clamp meter at a known load.</span> <span class="fail">Tolerance: —.</span></div></li>
<li><span class="id">E4</span><div><b>Servo-rail stall current</b> (M3 of budget-avionics.md). <span class="how">Stall each servo with a clamp meter at 7.2 V.</span> <span class="fail">Fails if the total exceeds ${becP} A peak; the rail is ${becC} A continuous.</span></div></li>
<li><span class="id">E5</span><div><b>Lift throttle-cap current.</b> <span class="how">On the thrust stand, full-throttle current per lift motor and the total against the current sensor, with the QuadPlane motor output maximum set (parameter to confirm).</span> <span class="fail">Fails at or above ${sensorC} A total or above ${motorLim} A (30 s) per lift motor; the budget predicts up to ${num(iWorst, 1)} A uncapped.</span></div></li>
<li><span class="id">E6</span><div><b>DShot on the pusher output (R-A).</b> <span class="how">Confirm the function-70 output drives the pusher ESC.</span> <span class="fail">If it does not, fall back to PWM throttle plus ESC calibration. Threshold: —.</span></div></li>
<li><span class="id">E7</span><div><b>Motor direction, props off.</b> <span class="how">Motors 1 and 2 CCW, 3 and 4 CW (quad-X order).</span> <span class="fail">Any reversed motor fails. Threshold: —.</span></div></li>
</ol></div>`;
  const unknowns = S12.trim().replace(/\.$/, '');

  // ===================== landing gear =====================
  const gearLines = propRows.filter(x => x.Kit === 'K5'), gearGoods = round2(sum(gearLines.map(x => x['Ext USD']))), capGoods = round2(sum(propRows.filter(x => x.Category === 'Electrical').map(x => x['Ext USD'])));
  const geoTable = `<div class="tbl"><table><thead><tr><th>Quantity</th><th>Before</th><th>With wheels ${est}</th></tr></thead><tbody>${geo.slice(1).map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td><b>${esc(r[2])}</b></td></tr>`).join('')}</tbody></table></div>`;
  const gearCost = `<div class="tbl"><table><thead><tr><th>Step</th><th>Arithmetic</th><th class="n">USD</th></tr></thead><tbody>
${gearLines.map(x => `<tr><td>${findBtn(x.ID)} ${esc(x.Item.split(' (')[0])}</td><td>${x['Qty needed']} × ${usd(x['Unit USD'])}</td><td class="n">${usd(x['Ext USD'])}</td></tr>`).join('')}
<tr><td>Wheel gear subtotal</td><td>${gearLines.map(x => x.ID).join(' + ')}</td><td class="n">${usd(gearGoods)}</td></tr>
<tr><td>Capacitors (electrical, not gear)</td><td>${propRows.filter(x => x.Category === 'Electrical').map(x => findBtn(x.ID) + ' ' + x['Qty needed'] + ' × ' + usd(x['Unit USD'])).join(', ')}</td><td class="n">${usd(capGoods)}</td></tr>
<tr class="total"><td>Proposed goods</td><td>${usd(gearGoods)} + ${usd(capGoods)}</td><td class="n">${usd(P.goods)}</td></tr>
<tr><td>With tax</td><td>${usd(P.goods)} × ${(1 + S.taxRate).toFixed(4)}</td><td class="n">${usd(P.withTax)}</td></tr>
<tr><td>Reserve after ${est}</td><td>${usd(S.reserve)} − ${usd(P.withTax)} (shipping not quoted, —)</td><td class="n">${usd(P.reserveAfter)}</td></tr>
<tr><td>Reserve after, with NWA sponsorship ${est}</td><td>${usd(P.reserveAfter)} + ${usd(S.nwaSwap.retailPropWithTax)}</td><td class="n">${usd(P.reserveAfterWithNwa)}</td></tr></tbody></table></div>`;
  const reserveTgt = h.reserveTarget;

  // ===================== client data (3D viewer) =====================
  const rowKit = id => (byId[id] || {}).Kit || '';
  const clientComps = COMPS.filter(c => !/^(MOT_|PITOT|BAT)/.test(c.id)).map(c => ({ id: c.id, name: c.name, bom: c.bom_ref, qty: c.qty, dims: c.dims_mm, mass: c.mass_g, supply: c.supply, ifc: c.interfaces, srcTxt: c.source_url_or_file,
    est: !!c.est, pl: c.placement, dn: c.dims_note || '', mn: c.mass_note || '', cat: ccat(c.id), kit: rowKit(c.bom_ref), hasRow: !!byId[c.bom_ref] }));
  const clientWires = WIRES.map(w => ({ id: w.id, fn: w.function, from: w.from.component + '.' + w.from.pin, to: w.to.component + '.' + w.to.pin, gauge: w.gauge_awg, colour: w.colour, conn: w.connector_from + ' → ' + w.connector_to,
    len: w.length_m_est, cur: w.current_A_max, joint: w.js, cat: w.cat, pair: isPair(w), route: w.route, zone: w.zone, source: w.source }));
  const EL = { comps: clientComps, wires: clientWires, wcats: WCATS, ccats: CCATS, gear: Object.assign(gear, { wheelItem: byId['G-01'].Item, wheelRowIds: gearLines.map(x => x.ID), limits: { boom: limitsTxt[1], stab: limitsTxt[2] }, price: wheelPrice }), date: WIR.date_checked };

  // ---------- placeholders ----------
  const T2 = {
    EL_N_COMP: COMPS.length, EL_N_WIRE: WIRES.length, EL_LEN: num(lenTotal), EL_N_RENDER: clientComps.length, EL_N_JOINT: jointIds.length,
    EL_DIAGRAM: dgSvg, EL_FCMAP: fcTable, EL_UART: uartTable, EL_BUDGET: budgetTable, EL_LIMITS: limTable, EL_CONFLICTS: confTable,
    EL_FULL_A: num(iWorst, 1), EL_FULL_NOM: num(iFull, 1), EL_A_WORST: aWorst, EL_A_NOM: aFull, EL_MOTOR_LIM: motorLim, EL_XT_RATIO: num(ratioXt), EL_GPS_D: num(gpsD2, 3), EL_GPS_D3: num(gpsD3, 3), EL_BFIELD: Math.round(bField), EL_TRUNK_A: trunkI, EL_SENSOR_A: sensorC, EL_RATIO: num(ratioSensor), EL_TRANS_A: num(It, 1), EL_HOVER_A: num(Ih, 1), EL_XT_C: xtC, EL_BEC_C: becC, EL_BEC_P: becP, EL_STALL_LO: svStall[1], EL_STALL_HI: svStall[3], EL_VP: Vp,
    EL_BLUEPRINT: bpSvg, EL_WKEY: wLegend, EL_WSCHED: wsched, EL_GAUGE: gaugeTable + ampTable, EL_JOINTS: jcards, EL_FIXED: fixed, EL_TESTS: checklist, EL_MEASURE: measure, EL_UNKNOWNS: esc(unknowns),
    GEAR_GEO: geoTable, GEAR_COST: gearCost, GEAR_MASS: gearMass, GEAR_DROP_MM: Math.round(dropM * 1000), GEAR_BOOM: limitsTxt[1], GEAR_STAB: limitsTxt[2], GEAR_ROLL: rollover, GEAR_SLACK1: slack[1], GEAR_SLACK2: slack[2],
    GEAR_D_IN: wheelD_in.toFixed(2), GEAR_G: wheelG, GEAR_PRICE: wheelPrice, GEAR_E: axleOffset, GEAR_PUSH_BEFORE: need(/(\d+)\s*mm/, geoRow('Pusher disc')[1], 'pusher clearance')[1], GEAR_PUSH_AFTER: need(/(\d+)\s*mm/, geoRow('Pusher disc')[2], 'pusher clearance')[1],
    GEAR_GOODS: usd(gearGoods), PROP_GOODS: usd(P.goods), PROP_TAX_TOTAL: usd(P.withTax), PROP_AFTER: usd(P.reserveAfter), PROP_AFTER_NWA: usd(P.reserveAfterWithNwa), PROP_N: propRows.length,
    GEAR_TIPBACK: geoRow('Tip-back')[2], GEAR_TIPBACK0: geoRow('Tip-back')[1], GEAR_PUSHSTRIKE: geoRow('Pusher strike')[2], GEAR_CG: geoRow('CG height')[2], GEAR_CG0: geoRow('CG height')[1], GEAR_LIFTCLR: geoRow('Lift prop')[2], GEAR_LIFTCLR0: geoRow('Lift prop')[1],
    GEAR_ALT1: need(/DUB300T treaded \(([\d.]+) g per wheel, \$([\d.]+)\)/, S11, 'alt wheel')[1], GEAR_ALT1P: need(/DUB300T treaded \(([\d.]+) g per wheel, \$([\d.]+)\)/, S11, 'alt wheel')[2],
    GEAR_ROLLOUT: need(/Fallback rollout at 12 m\/s \(EST, friction values assumed\): ([^\n]*?); brakes are not evaluated/, S11, 'rollout')[1].replace(/\bmu\b/g, 'μ'),
  };
  return { T: T2, EL };
}
