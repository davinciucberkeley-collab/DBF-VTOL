// Assembles Inventory-Overview.html (standalone) and inventory/inventory-overview.html (fragment, for publishing)
// from inventory/inventory.json (built by inventory/build_inventory.mjs) + inventory/src/* + the CAD mesh (review/mesh.mjs).
// Run: node inventory/build_overview.mjs     Every number on the page is read or computed here; none is typed into body.html.
import { readFileSync, writeFileSync } from 'fs';
import { packMesh } from './v031/review/mesh.mjs';
import { buildElectrical } from './build_electrical.mjs';
import { packFusionAll } from './build_fusion.mjs';
import { buildVariants } from './build_variants.mjs';
import { ic, flow } from './visuals.mjs';
const r = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const INV = JSON.parse(r('./inventory.json')), S = INV.summary, ROWS = INV.rows;
const NWA_MD = r('../docs/research/nautical-wings-props.md'), BEN_MD = r('../docs/research/budget-energy-test.md');
const BOM_CSV = r('./v031/docs/purchasing/C0_BOM.csv'), BASIS = r('./v031/docs/DESIGN-BASIS.md');
const mustHave = (txt, s, f) => { if (!txt.includes(s)) throw new Error(`source check failed: "${s}" not found in ${f}`); };

// ---------- helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const usd = (v, d = 2) => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const dash = v => (v === '' || v == null) ? '—' : esc(v);
const round2 = v => Math.round(v * 100) / 100;
const KITS = S.kits, KIT_IDS = Object.keys(KITS);
const scOf = s => /^to source/i.test(s) ? 'bad' : /^to order/i.test(s) ? 'warn' : /^to make/i.test(s) ? 'make' : /^(hold|proposed)/i.test(s) ? 'open' : /^(received|on hand|in stock)/i.test(s) ? 'ok' : 'none';
const chip = s => `<span class="chip ${scOf(s)}">${esc(s)}</span>`;
for (const x of ROWS) x.sc = scOf(x.Status);
const srcOf = x => (x['Made from'] && ROWS.some(y => y.ID === x['Made from'])) ? x['Made from'] : '';   // '—' or blank = no stock line
const buy = ROWS.filter(x => x.Type === 'Buy'), make = ROWS.filter(x => x.Type === 'Make'), nwa = ROWS.filter(x => x.Type === 'NWA');
const byId = Object.fromEntries(ROWS.map(x => [x.ID, x]));
const sum = a => round2(a.reduce((t, v) => t + v, 0));
const bomLine = lbl => { const l = BOM_CSV.split(/\r?\n/).find(l => l.startsWith('"' + lbl)); if (!l) throw new Error('BOM line missing: ' + lbl); return { label: l.match(/^"([^"]*)"/)[1], v: +l.split(',').pop() }; };

// ---------- consistency checks: the sheet snapshot must agree with the summary and the BOM ----------
const goods = sum(buy.map(x => x['Ext USD']));
if (goods !== S.goods) throw new Error(`goods ${goods} != summary ${S.goods}`);
if (round2(S.goods * S.taxRate) !== S.tax) throw new Error('tax mismatch');
if (round2(S.goods + S.tax + S.shipping) !== S.committed) throw new Error('committed mismatch');
if (round2(S.cap - S.committed) !== S.reserve) throw new Error('reserve mismatch');
const holdGoods = sum(['P-14', 'P-16', 'P-23'].map(id => byId[id]['Ext USD']));
if (holdGoods !== S.nwaSwap.retailPropGoods) throw new Error('nwaSwap retail goods mismatch');
if (round2(holdGoods * (1 + S.taxRate)) !== S.nwaSwap.retailPropWithTax) throw new Error('nwaSwap tax mismatch');
if (Math.abs(S.reserve + S.nwaSwap.retailPropWithTax - S.nwaSwap.reserveIfConfirmed) > 0.011) throw new Error('nwaSwap reserve mismatch');
for (const [k, v] of [['Goods subtotal', S.goods], ['Committed spend', S.committed], ['Crash reserve', S.reserve], ['Shipping allowance', S.shipping]]) if (bomLine(k).v !== v) throw new Error('BOM CSV disagrees on ' + k);
const taxLbl = bomLine('Sales/use tax').label, amaFee = bomLine('Fee outside the hardware cap: AMA'), faaFee = bomLine('Fee outside the hardware cap: FAA');
mustHave(NWA_MD, '15.2 N', 'nautical-wings-props.md'); mustHave(NWA_MD, '14–40 in', 'nautical-wings-props.md'); mustHave(NWA_MD, 'G 6.3', 'nautical-wings-props.md');
mustHave(BEN_MD, '283 × 140 × 175 mm', 'budget-energy-test.md'); mustHave(BEN_MD, '98 mm < 140 mm', 'budget-energy-test.md'); mustHave(BEN_MD, '5.95', 'budget-energy-test.md');
const BASIS_VER = (BASIS.match(/\(v(\d+\.\d+(?:\.\d+)?)/) || [])[1] || (BASIS.match(/Status: v(\d+\.\d+(?:\.\d+)?)/) || [])[1];
if (!BASIS_VER) throw new Error('design basis version not found');
const REV = BASIS_VER;   // design revision shown in the title block
const reserveTarget = (BASIS.match(/target ≥ \$(\d+)/) || [])[1]; if (!reserveTarget) throw new Error('R7 target not found');

// ---------- derived numbers ----------
const received = ROWS.filter(x => (+x['Qty on hand'] || 0) > 0).length;
const nwaQty = nwa.reduce((t, x) => t + x['Qty needed'], 0);
const toOrder = ROWS.filter(x => x.Status === 'To order').length, toMake = ROWS.filter(x => x.Status === 'To make').length;
const toSource = ROWS.filter(x => x.sc === 'bad').length, holds = ROWS.filter(x => x.sc === 'open').length;
const hint = 'Open live inventory (Google Sheet)';
const SHEET = JSON.parse(readFileSync(new URL('./sheet.json', import.meta.url), 'utf8')).url;  // live Google Sheet (inventory/sheet.json)
const sheetBtn = cls => `<a class="btnlink ${cls || ''}" href="${SHEET}" target="_blank" rel="noopener">${hint} <span aria-hidden="true">↗</span></a>`;
const findBtn = id => `<button type="button" class="linkbtn" data-find="${esc(id)}" aria-label="Find ${esc(id)} in the inventory table">${esc(id)}</button>`;
const src = t => `<p class="src">${t}</p>`;
const est = '<span class="est">EST</span>';
// M-20 displayed note: the wheel axle block is a proposal (inventory.json is not changed)
byId['M-20'].Process += ' | If wheels are adopted (proposal, §7 Landing gear): printed axle block at the leg tip carrying the 5/32 in axle (G-02) and collars (G-03)';
const proposed = ROWS.filter(x => x.Type === 'Proposed');
// electrical + landing-gear content (reads inventory/electrical/*.json, docs/research/electrical-architecture.md, analysis/results.json)
const ELB = buildElectrical({ esc, usd, round2, chip, findBtn, src, est, ROWS, byId, S, REV, DATE: S.generated, sum, reserveTarget });
const ET = ELB.T;

// ---------- §1 overview ----------
const tile = (icon, l, v, s, cls = '') => `<div class="stile ${cls}"><span class="si">${ic(icon)}</span><div class="sl">${l}</div><div class="sv">${v}</div><div class="ss">${s}</div></div>`;
const kpis = `<div class="stiles">
${tile('coin', 'Committed', usd(S.committed), `of ${usd(S.cap, 0)} cap · ${usd(S.cap - S.committed)} left`, 'ok')}
${tile('clock', 'Crash reserve', usd(S.reserve), `target ≥ $${reserveTarget} · margin ${usd(S.reserve - reserveTarget)}`, 'warn')}
${tile('box', 'Lines to buy', buy.length, `${toOrder} to order · ${buy.length - toOrder} on hold · goods ${usd(S.goods)}`)}
${tile('wrench', 'Parts to make', make.length, `${toMake} in-house · ${toSource} to source (spinner)`)}
${tile('check', 'Items received', `${received} <small>of ${ROWS.length}</small>`, ROWS.some(x => +x['Qty ordered'] > 0) ? `${ROWS.filter(x => +x['Qty ordered'] > 0).length} lines ordered` : 'nothing ordered yet', received ? 'ok' : 'warn')}
${tile('plug', 'Proposed spend', usd(S.proposed.goods), `${proposed.length} lines · ${usd(S.proposed.withTax)} with tax · not committed`, 'open')}
${tile('bolt', 'Worst conflict', `${ET.EL_FULL_A} A`, `vs ${ET.EL_SENSOR_A} A sensor (×${ET.EL_RATIO}) and ${ET.EL_MOTOR_LIM} A motor · <a href="#el-conflicts">§3</a>`, 'bad')}
</div>`;
// budget: one stacked bar against the cap, and the reserve against its target
const pc = v => (v / S.cap * 100).toFixed(2) + '%';
const propTax = S.proposed.withTax, resLeft = round2(S.reserve - propTax);
const budgetBar = `<div class="sbar" role="img" aria-label="Budget against the ${usd(S.cap, 0)} cap: ${usd(S.committed)} committed, ${usd(propTax)} of the reserve used if the proposed lines are adopted, ${usd(resLeft)} reserve left. The target line marks the ${usd(reserveTarget, 0)} reserve target.">
<div class="sb-track"><i class="s-com" style="width:${pc(S.committed)}"></i><i class="s-prop" style="width:${pc(propTax)}"></i><i class="s-res" style="width:${pc(resLeft)}"></i><b class="sb-mark" style="left:${pc(S.cap - reserveTarget)}"><span>$${reserveTarget} reserve target</span></b></div>
<div class="sb-scale"><span>$0</span><span>${usd(S.cap, 0)} cap</span></div>
<ul class="sb-key"><li><i class="s-com"></i>Committed <b>${usd(S.committed)}</b></li><li><i class="s-prop"></i>Proposed, with tax <b>${usd(propTax)}</b></li><li><i class="s-res"></i>Reserve left <b>${usd(resLeft)}</b></li></ul></div>`;
const resRows = [['Reserve today', S.reserve, 'warn'], ['After proposed lines', S.proposed.reserveAfter, 'bad'], ['If NWA props are free', S.nwaSwap.reserveIfConfirmed, 'ok'], ['Proposed and NWA free', S.proposed.reserveAfterWithNwa, 'ok']];
const resMax = Math.max(...resRows.map(r => r[1]), reserveTarget) * 1.12;
const reserveBars = rows => `<div class="hb" role="img" aria-label="Reserve against the ${usd(reserveTarget, 0)} target: ${rows.map(r => r[0] + ' ' + usd(r[1])).join('; ')}">${rows.map(([l, v, c]) => `<div class="hbr"><div class="hbl">${l}</div><div class="hbt"><i class="seg ${v >= reserveTarget ? 'ok' : 'bad'}" style="width:${(v / resMax * 100).toFixed(1)}%"></i><b class="mk" style="left:${(reserveTarget / resMax * 100).toFixed(1)}%"></b></div><div class="hbv">${usd(v)}</div></div>`).join('')}<div class="hbr hbaxis"><div class="hbl"></div><div class="hbt"><span class="mklab" style="left:${(reserveTarget / resMax * 100).toFixed(1)}%">target $${reserveTarget}</span></div><div class="hbv"></div></div></div>`;
const reserveBarsHtml = reserveBars(resRows);
const ladder = ['P-02', 'P-40', 'P-27'].map(id => byId[id]);
const decCard = (cls, icon, tag, title, line, inner, source) => `<details class="dcard ${cls}"><summary><span class="di">${ic(icon)}</span><span class="dt"><span class="dtag">${tag}</span><b>${title}</b><span class="dl">${line}</span></span></summary><div class="dbody">${inner}${source}</div></details>`;
const decisions = [
  decCard('bad', 'block', 'Blocking', 'Confirm Nautical Wings sponsorship in writing', `${nwaQty} NWA props would replace on-hold retail props; reserve ${usd(S.reserve)} → ${usd(S.nwaSwap.reserveIfConfirmed)} ${est}`,
    `<p><b>Recommended:</b> send the drafted message (<a href="#nw-msg">§8</a>); keep the retail lines on hold, not deleted.</p><p><b>Alternative:</b> release the on-hold retail lines (${usd(S.nwaSwap.retailPropGoods)} goods) now; NWA props become an optional upgrade. Reserve stays ${usd(S.reserve)} (${S.bomPricesChecked} prices).</p><p class="meta">Offer is team-reported (Oct 2026). Scope, cost, shipping and import from India, lead time and obligations are not in writing. Nothing public describes a student prop offer.</p>`,
    src('inventory/inventory.json rows P-14, P-16, P-23, N-01, N-02 (notes: sponsorship team-reported) and summary.nwaSwap; docs/research/nautical-wings-props.md §1')),
  decCard('open', 'truck', 'Open', `The ${usd(S.shipping)} shipping allowance is an estimate`, `Any overrun eats the ${usd(S.reserve - reserveTarget)} margin over the $${reserveTarget} target`,
    `<p><b>Recommended:</b> price shipping and tax at each vendor's checkout; write the real figures into the sheet.</p><p><b>If the reserve drops under $${reserveTarget}, cut in order:</b> ${ladder.map(x => `${esc(x.Item.split(' (')[0].split(',')[0])} (${x.ID}, ${usd(x['Ext USD'])})`).join(' → ')}.</p>`,
    src('inventory/inventory.json summary.shipping, reserve; docs/purchasing/C0_BOM.csv (shipping allowance, estimate); README.md "Open items" 4 (fallback order, from review §1)')),
  decCard('open', 'print', 'Open', 'The pusher spinner is not in the BOM', `Line M-19 “${esc(byId['M-19'].Item)}”: to source, cost —`,
    `<p><b>Recommended:</b> print it from budgeted PETG (P-05) or PA6-CF (P-01) and fit-check it on the motor adapter. No new spend ${est}.</p><p><b>Alternative:</b> buy one; price —, look it up first (margin is only ${usd(S.reserve - reserveTarget)}).</p>`,
    src('inventory/inventory.json row M-19 (and P-01, P-05)'))].join('');
const kitTiles = KIT_IDS.map(k => {
  const rs = ROWS.filter(x => x.Kit === k), n = rs.length, o = rs.filter(x => x.Status === 'To order').length, m = rs.filter(x => x.Status === 'To make').length;
  const oh = rs.filter(x => (+x['Qty on hand'] || 0) > 0).length, hold = rs.filter(x => x.sc === 'open').length, bad = rs.filter(x => x.sc === 'bad').length;
  const seg = (c, v) => v ? `<i class="${c}" style="width:${(v / n * 100).toFixed(1)}%"></i>` : '';
  const cnt = (c, v, l) => `<span class="kc ${c}${v ? '' : ' zero'}"><b>${v}</b> ${l}</span>`;
  return `<div class="ktile"><div class="kth"><span class="mono-id">${k}</span><b>${esc(KITS[k])}</b><span class="kn">${n} lines</span></div>
<div class="bar" role="img" aria-label="${k} ${esc(KITS[k])}: ${oh} on hand, ${o} to order, ${m} to make, ${hold} hold or proposed, ${bad} to source">${seg('ok', oh)}${seg('warn', o)}${seg('make', m)}${seg('open', hold)}${seg('bad', bad)}</div>
<div class="kcs">${cnt('ok', oh, 'on hand')}${cnt('warn', o, 'to order')}${cnt('make', m, 'to make')}${cnt('open', hold, 'hold')}${bad ? cnt('bad', bad, 'to source') : ''}</div></div>`;
}).join('');
const kitRows = KIT_IDS.map(k => {
  const rs = ROWS.filter(x => x.Kit === k), o = rs.filter(x => x.Status === 'To order').length, m = rs.filter(x => x.Status === 'To make').length;
  const oth = rs.length - o - m, oh = rs.filter(x => (+x['Qty on hand'] || 0) > 0).length;
  return `<tr><td><span class="mono-id">${k}</span></td><td>${esc(KITS[k])}</td><td class="n">${rs.length}</td><td class="n">${o}</td><td class="n">${m}</td><td class="n">${oth || '—'}</td><td class="n">${oh}</td></tr>`;
}).join('');
const kitTot = `<tr class="total"><td colspan="2">All kits</td><td class="n">${ROWS.length}</td><td class="n">${toOrder}</td><td class="n">${toMake}</td><td class="n">${ROWS.length - toOrder - toMake}</td><td class="n">${received}</td></tr>`;
const kitTable = `<div class="ktiles">${kitTiles}</div>
<div class="keyline"><span class="ok">on hand</span><span class="warn">to order</span><span class="make">to make</span><span class="open">hold / proposed</span><span class="bad">to source</span></div>
<details class="more"><summary>Table</summary><div class="tbl"><table><thead><tr><th>Kit</th><th>Name</th><th class="n">Lines</th><th class="n">To order</th><th class="n">To make</th><th class="n">Hold, proposed, to source</th><th class="n">On hand</th></tr></thead><tbody>${kitRows}${kitTot}</tbody></table></div></details>`;

// ---------- §3 inventory table ----------
const cols = [
  ['ID', 's'], ['Item', 's'], ['Type', 's'], ['Kit', 's'], ['Category', 's'], ['CAD part', 's'], ['Need', 'n'], ['Ordered', 'n'], ['On hand', 'n'], ['Status', 's'], ['Vendor', 's'],
  ['Unit USD', 'n'], ['Ext USD', 'n'], ['Made from', 's'], ['Process', 's'], ['Location', 's'], ['Order date', 's'], ['Received', 's'], ['Inspected', 's'], ['Source', 's'], ['Notes', 's']];
const head = cols.map(([c, t], i) => `<th class="sort${t === 'n' ? ' n' : ''}" data-t="${t}"><button type="button" class="thbtn">${c}</button></th>`).join('');
const numCell = v => v === '' || v == null ? '<td class="n" data-v="-1">—</td>' : `<td class="n" data-v="${v}">${typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(2) : v}</td>`;
const body = ROWS.map(x => {
  const cadBtn = x['CAD part'] ? `<button type="button" class="linkbtn" data-part="${esc(x['CAD part'])}" aria-label="Show ${esc(x['CAD part'].replace(/_/g, ' '))} in the 3D model">${esc(x['CAD part'].replace(/_/g, ' '))}</button>` : '—';
  const money = v => v === '' || v == null ? '<td class="n" data-v="-1">—</td>' : `<td class="n" data-v="${v}">${Number(v).toFixed(2)}</td>`;
  return `<tr data-id="${x.ID}" data-type="${x.Type}" data-kit="${x.Kit}" data-status="${esc(x.Status)}"${x['CAD part'] ? ` data-part="${esc(x['CAD part'])}"` : ''}>
<td data-v="${x.ID}"><span class="mono-id">${x.ID}</span></td><td class="item">${esc(x.Item)}</td><td><span class="chip type">${x.Type}</span></td><td>${x.Kit}</td><td>${esc(x.Category)}</td><td data-v="${esc(x['CAD part'])}">${cadBtn}</td>
${numCell(x['Qty needed'])}${numCell(x['Qty ordered'])}${numCell(x['Qty on hand'])}<td data-v="${esc(x.Status)}">${chip(x.Status)}</td><td>${dash(x.Vendor)}</td>${money(x['Unit USD'])}${money(x['Ext USD'])}
<td>${srcOf(x) ? findBtn(srcOf(x)) : dash(x['Made from'])}</td><td>${dash(x.Process)}</td><td>${dash(x.Location)}</td><td>${dash(x['Order date'])}</td><td>${dash(x['Received date'])}</td><td>${dash(x.Inspected)}</td><td><small>${dash(x.Source)}</small></td><td><small>${dash(x.Notes)}</small></td></tr>`;
}).join('\n');
const opt = (a) => a.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
const statuses = [...new Set(ROWS.map(x => x.Status))];
const invTable = `<div class="toolbar" role="search">
<label>Search<input type="search" id="invQ" placeholder="ID, item, vendor, note" aria-label="Search the inventory table"></label>
<label>Type<select id="invType"><option value="">All</option>${opt(['Buy', 'Make', 'NWA', 'Proposed'])}</select></label>
<label>Kit<select id="invKit"><option value="">All</option>${KIT_IDS.map(k => `<option value="${k}">${k} ${esc(KITS[k])}</option>`).join('')}</select></label>
<label>Status<select id="invStatus"><option value="">All</option>${opt(statuses)}</select></label>
<button type="button" class="themebtn" id="invClear">Clear filters</button>
<button type="button" class="themebtn" id="invCols" aria-pressed="false">Show all columns</button>
<span class="count" id="invCount" aria-live="polite">${ROWS.length} of ${ROWS.length} lines</span></div>
<div class="tbl" id="invWrap" tabindex="0" role="region" aria-label="Inventory table, scrolls sideways"><table id="invTable" class="lesscols"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>
<tfoot><tr class="total"><td colspan="6" id="invTotLbl">Buy lines shown: ${buy.length}</td><td></td><td></td><td></td><td></td><td></td><td></td><td class="n" id="invTot">${goods.toFixed(2)}</td><td colspan="8">goods, before tax and shipping (Make and NWA lines are $0)</td></tr>
<tr class="total"><td colspan="6" id="invPropLbl">Proposed lines shown: ${proposed.length}</td><td></td><td></td><td></td><td></td><td></td><td></td><td class="n" id="invPropTot">${sum(proposed.map(x => x['Ext USD'])).toFixed(2)}</td><td colspan="8">proposed goods, not in committed spend (counted separately)</td></tr></tfoot></table></div>
<p class="tblnote">Click a row with a CAD part to show it in the 3D model. Hidden columns: Category, Made from, Process, Location, dates, Source, Notes. Dates and Location are blank until the sheet is filled in.</p>`;

// ---------- §4 budget ----------
const groupSum = key => { const m = new Map(); for (const x of buy) { const k = (x[key] === '' || x[key] === '—') ? 'Not set (—)' : x[key]; m.set(k, round2((m.get(k) || 0) + x['Ext USD'])); } return [...m].sort((a, b) => b[1] - a[1]); };
function barSvg(data, cls, label) {
  const W = 880, L = 190, R = 90, rh = 26, H = data.length * rh + 12, max = Math.max(...data.map(d => d[1]));
  const bars = data.map(([k, v], i) => { const y = 6 + i * rh, w = Math.max(1, (W - L - R) * v / max);
    return `<text x="${L - 10}" y="${y + 16}" text-anchor="end">${esc(k)}</text><rect class="${cls}" x="${L}" y="${y + 3}" width="${w.toFixed(1)}" height="${rh - 8}"/><text class="val" x="${(L + w + 8).toFixed(1)}" y="${y + 16}">${usd(v)}</text>`; }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title><line class="axis" x1="${L}" y1="2" x2="${L}" y2="${H - 4}"/>${bars}</svg>`;
}
const byVendor = groupSum('Vendor'), byCat = groupSum('Category');
const wf = [['Goods (Buy lines)', 0, S.goods, 'b-goods'], [`Sales tax ${(S.taxRate * 100).toFixed(2)} %`, S.goods, S.goods + S.tax, 'b-tax'], ['Shipping allowance (EST)', S.goods + S.tax, S.committed, 'b-ship'], ['Committed', 0, S.committed, 'b-goods'], ['Reserve to cap', S.committed, S.cap, 'b-res']];
function wfSvg() {
  const W = 880, L = 190, R = 110, rh = 30, H = wf.length * rh + 26, sc = v => L + (W - L - R) * v / S.cap;
  const rows = wf.map(([k, a, b, c], i) => { const y = 6 + i * rh, v = round2(b - a);
    return `<text x="${L - 10}" y="${y + 18}" text-anchor="end">${esc(k)}</text><rect class="${c}" x="${sc(a).toFixed(1)}" y="${y + 3}" width="${Math.max(1, sc(b) - sc(a)).toFixed(1)}" height="${rh - 9}"/><text class="val" x="${(sc(b) + 8).toFixed(1)}" y="${y + 18}">${usd(v)}</text>`; }).join('');
  const cx = sc(S.cap).toFixed(1);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Waterfall from goods to committed spend and the reserve under the $2,000 cap"><title>Goods, tax, shipping, committed, reserve</title>${rows}<line class="b-cap" x1="${cx}" y1="2" x2="${cx}" y2="${H - 16}" stroke="var(--ink)" stroke-dasharray="3 3"/><text x="${cx}" y="${H - 3}" text-anchor="end">cap ${usd(S.cap, 0)}</text></svg>`;
}
const waterTable = `<div class="tbl"><table><thead><tr><th>Step</th><th>Arithmetic</th><th class="n">USD</th></tr></thead><tbody>
<tr><td>Goods</td><td>sum of Ext USD over ${buy.length} Buy lines</td><td class="n">${usd(S.goods)}</td></tr>
<tr><td>Sales tax</td><td>${usd(S.goods)} × ${S.taxRate} <small>(${esc(taxLbl.replace(/^Sales\/use tax /, ''))})</small></td><td class="n">${usd(S.tax)}</td></tr>
<tr><td>Shipping allowance ${est}</td><td>BOM allowance; price at checkout</td><td class="n">${usd(S.shipping)}</td></tr>
<tr class="total"><td>Committed</td><td>${usd(S.goods)} + ${usd(S.tax)} + ${usd(S.shipping)}</td><td class="n">${usd(S.committed)}</td></tr>
<tr><td>Reserve</td><td>${usd(S.cap, 0)} − ${usd(S.committed)}</td><td class="n">${usd(S.reserve)}</td></tr>
<tr><td>Outside the cap</td><td>FAA registration + AMA Full membership (fees, not hardware)</td><td class="n">${usd(faaFee.v)} + ${usd(amaFee.v)}</td></tr></tbody></table></div>`;
const swapTable = `<div class="tbl"><table><thead><tr><th>NWA swap, if props are confirmed free</th><th>Arithmetic</th><th class="n">USD</th></tr></thead><tbody>
<tr><td>Retail prop goods on hold</td><td>${['P-14', 'P-16', 'P-23'].map(id => `${id} ${usd(byId[id]['Ext USD'])}`).join(' + ')}</td><td class="n">${usd(S.nwaSwap.retailPropGoods)}</td></tr>
<tr><td>With tax</td><td>${usd(S.nwaSwap.retailPropGoods)} × ${(1 + S.taxRate).toFixed(4)}</td><td class="n">${usd(S.nwaSwap.retailPropWithTax)}</td></tr>
<tr><td>Reserve today</td><td>${usd(S.cap, 0)} − ${usd(S.committed)}</td><td class="n">${usd(S.reserve)}</td></tr>
<tr class="total"><td>Reserve if confirmed ${est}</td><td>${usd(S.reserve)} + ${usd(S.nwaSwap.retailPropWithTax)}</td><td class="n">${usd(S.nwaSwap.reserveIfConfirmed)}</td></tr><tr><td colspan="3" class="note">Summed before rounding to the cent, so the two parts can differ from the total by $0.01.</td></tr></tbody></table></div>
<p class="meta"><span class="est">EST</span> ${esc(S.nwaSwap.note.replace(/^EST:\s*/, ''))}.</p>`;
const swap = reserveBars([resRows[0], resRows[2]]) + `<details class="more"><summary>Arithmetic</summary>${swapTable}</details>`;
// orders by vendor
const vendors = new Map(); for (const x of buy) { const k = (x.Vendor === '' || x.Vendor === '—') ? 'Vendor not set (—)' : x.Vendor; (vendors.get(k) || vendors.set(k, []).get(k)).push(x); }
const vOrder = [...vendors].map(([k, a]) => [k, a, sum(a.map(x => x['Ext USD']))]).sort((a, b) => b[2] - a[2]);
const vMax = Math.max(...vOrder.map(v => v[2]));
const vCards = vOrder.map(([k, a, sub]) => {
  const hold = sum(a.filter(x => x.sc === 'open').map(x => x['Ext USD']));
  const li = a.map(x => `<li><span class="mono-id">${x.ID}</span><span>${esc(x.Item)}${x.sc === 'open' ? ' ' + chip(x.Status) : ''}</span><span class="q">${x['Qty needed']} × ${Number(x['Unit USD']).toFixed(2)} = <b>${Number(x['Ext USD']).toFixed(2)}</b></span></li>`).join('');
  const foot = hold ? `${usd(hold)} on hold (NWA swap); order the rest now.` : (k.startsWith('Vendor not set') ? 'No vendor named in the BOM: choose one, or borrow (P-02 note).' : 'All lines ready to order.');
  const w = sub / vMax * 100, hw = hold / vMax * 100;
  return `<details class="vbar"><summary><span class="vn">${esc(k)}</span><span class="vt"><i class="seg c1" style="left:0;width:${(w - hw).toFixed(1)}%"></i>${hold ? `<i class="seg open" style="left:${(w - hw).toFixed(1)}%;width:${hw.toFixed(1)}%"></i>` : ''}</span><span class="vs">${usd(sub)}</span></summary><ul>${li}</ul><div class="foot">${a.length} line${a.length > 1 ? 's' : ''} · ${foot}</div></details>`;
}).join('');
const vendorBars = `<div class="vbars">${vCards}</div><div class="keyline"><span class="make">ready to order</span><span class="open">on hold (NWA swap)</span></div>`;
const vSum = sum(vOrder.map(v => v[2])); if (vSum !== goods) throw new Error('vendor subtotals do not add up');

// ---------- §5 fabrication ----------
const makeByKit = KIT_IDS.map(k => [k, make.filter(x => x.Kit === k)]).filter(([, a]) => a.length);
const fabTables = makeByKit.map(([k, a]) => `<h4 class="kh"><span class="mono-id">${k}</span> ${esc(KITS[k])}</h4><div class="tbl"><table><thead><tr><th>ID</th><th>Part</th><th class="n">Qty</th><th>Made from</th><th>Process</th><th>Status</th></tr></thead><tbody>
${a.map(x => `<tr><td><span class="mono-id">${x.ID}</span></td><td>${esc(x.Item)}${x['CAD part'] ? `<br><small>CAD: <button type="button" class="linkbtn" data-part="${esc(x['CAD part'])}">${esc(x['CAD part'].replace(/_/g, ' '))}</button></small>` : ''}</td><td class="n">${x['Qty needed']}</td><td>${srcOf(x) ? findBtn(srcOf(x)) + `<br><small>${esc(byId[srcOf(x)].Item)}</small>` : '— (no stock line)'}</td><td>${dash(x.Process)}</td><td>${chip(x.Status)}</td></tr>`).join('')}</tbody></table></div>`).join('');
const stockIds = [...new Set(make.map(srcOf).filter(Boolean))].sort();
const stockRows = stockIds.map(id => { const st = byId[id], users = make.filter(x => srcOf(x) === id);
  return `<tr><td><span class="mono-id">${id}</span></td><td>${esc(st.Item)}</td><td class="n">${st['Qty needed']}</td><td>${users.map(u => `${u.ID}${u['Qty needed'] > 1 ? ' ×' + u['Qty needed'] : ''}`).join(', ')}</td><td>${st.Notes ? '“' + esc(st.Notes) + '”' : '—'}</td></tr>`; }).join('');
const IN = 0.0254, m3 = v => (Math.round(v * 1000) / 1000).toFixed(3);
const t30 = byId['P-30'], t31 = byId['P-31'], t32 = byId['P-32'];
mustHave(t30.Notes, '0.955 + 0.516', 'P-30 note'); mustHave(t31.Notes, '2 x 0.8 m sockets + 4 x 0.205 m legs', 'P-31 note'); mustHave(t32.Notes, '0.76 m joiner', 'P-32 note');
const L30 = 72 * IN, L31 = 96 * IN, L32 = 36 * IN, used31 = 2 * 0.8 + 4 * 0.205;
const cutRows = `<tr><td>${findBtn('P-30')} booms, ${t30['Qty needed']} × 72 in</td><td>72 in × 0.0254 = ${m3(L30)} m per tube; cut list per tube 0.955 + 0.516 = ${m3(0.955 + 0.516)} m</td><td class="n">${m3(L30 - 0.955 - 0.516)} m</td><td>per tube, before kerf</td></tr>
<tr><td>${findBtn('P-31')} sockets + legs, ${t31['Qty needed']} × 96 in</td><td>96 in × 0.0254 = ${m3(L31)} m; 2 × 0.8 + 4 × 0.205 = ${m3(used31)} m</td><td class="n">${m3(L31 - used31)} m</td><td>left for 5 cuts + squaring the ends: <b>tight</b>; kerf width —</td></tr>
<tr><td>${findBtn('P-32')} joiner, ${t32['Qty needed']} × 36 in</td><td>36 in × 0.0254 = ${m3(L32)} m; joiner 0.76 m</td><td class="n">${m3(L32 - 0.76)} m</td><td>left after one cut, before kerf</td></tr>`;
const tubeData = [[ 'P-30', `booms, ${t30['Qty needed']} × 72 in`, L30, [0.955, 0.516], 'per tube'], ['P-31', `sockets + legs, ${t31['Qty needed']} × 96 in`, L31, [0.8, 0.8, 0.205, 0.205, 0.205, 0.205], 'tight: 5 cuts + squaring, kerf —'], ['P-32', `joiner, ${t32['Qty needed']} × 36 in`, L32, [0.76], 'after one cut']];
const tubeMax = Math.max(...tubeData.map(t => t[2]));
const tubeBars = `<div class="tubes">${tubeData.map(([id, d, L, cuts, remark]) => { const used = cuts.reduce((t, v) => t + v, 0), left = L - used;
  return `<div class="tube"><div class="tl">${findBtn(id)} <small>${d}</small></div><div class="tt" role="img" aria-label="${id}: ${m3(L)} m tube, cuts ${cuts.join(', ')} m, ${m3(left)} m left over" style="width:${(L / tubeMax * 100).toFixed(1)}%">${cuts.map(c => `<i class="cutp" style="width:${(c / L * 100).toFixed(2)}%"></i>`).join('')}<i class="lo" style="width:${(left / L * 100).toFixed(2)}%"></i></div><div class="tv"><b>${m3(used)} m</b> used of ${m3(L)} · <b class="${left < 0.05 ? 'bad' : ''}">${m3(left)} m left</b> <small>${remark}</small></div></div>`; }).join('')}</div><div class="keyline"><span class="make">cut piece</span><span class="lft">left over, before kerf</span></div>
<details class="more"><summary>Table</summary><div class="tbl cuts"><table><thead><tr><th>Stock</th><th>Arithmetic</th><th class="n">Left over</th><th>Remark</th></tr></thead><tbody>${cutRows}</tbody></table></div></details>`;
const kitCards = KIT_IDS.map(k => { const a = ROWS.filter(x => x.Kit === k), b = a.filter(x => x.Type === 'Buy'), m = a.filter(x => x.Type === 'Make' || x.Type === 'NWA'), pp = a.filter(x => x.Type === 'Proposed');
  const li = x => `<li><span class="mono-id">${x.ID}</span><span>${esc(x.Item)}</span><span>${x['Qty needed']}× ${chip(x.Status)}</span></li>`;
  const seg = (c, v) => v ? `<i class="${c}" style="width:${(v / a.length * 100).toFixed(1)}%"></i>` : '';
  const cnt = (c, v, l) => `<span class="kc ${c}${v ? '' : ' zero'}"><b>${v}</b> ${l}</span>`;
  return `<details class="ktile kd"><summary><span class="kth"><span class="mono-id">${k}</span><b>${esc(KITS[k])}</b><span class="kn">${a.length} lines</span></span>
<span class="bar" role="img" aria-label="${k}: ${b.length} bought, ${m.length} made or NWA, ${pp.length} proposed">${seg('warn', b.length)}${seg('make', m.length)}${seg('open', pp.length)}</span>
<span class="kcs">${cnt('warn', b.length, `bought ${usd(sum(b.map(x => x['Ext USD'])))}`)}${cnt('make', m.length, 'made / NWA')}${pp.length ? cnt('open', pp.length, 'proposed') : ''}</span></summary>
<ul>${b.length ? '<li class="lh"><b>Bought, goes in the bin on receipt</b></li>' + b.map(li).join('') : ''}${m.length ? '<li class="lh"><b>Made or supplied, goes in the bin when finished</b></li>' + m.map(li).join('') : ''}${pp.length ? '<li class="lh"><b>Proposed, only if adopted (not in committed spend)</b></li>' + pp.map(li).join('') : ''}</ul></details>`; }).join('');

// ---------- §7 location proposal ----------
const locRows = KIT_IDS.map(k => `<tr><td><span class="mono-id">${k}</span></td><td>${esc(KITS[k])}</td><td class="n">${ROWS.filter(x => x.Kit === k).length}</td><td>${k === 'K6' ? 'also holds the LiPo ammo can (P-26) and bag (P-18)' : k === 'K4' ? 'LiPo packs (P-12) live in the K6 ammo can, not the K4 bin' : k === 'K7' ? 'raw tube stock may be too long for a bin: store flat, label the tube' : '—'}</td></tr>`).join('');

// ---------- 3D model data ----------
const MESH = packMesh();
const { F: FUS, V: VMESH } = packFusionAll();   // C0 pack + the variants' own meshes, on one quantisation grid
const missionMin = (BASIS.match(/≥\s*(\d+)\s*min cruise/) || [])[1]; if (!missionMin) throw new Error('R10 cruise minutes not found');
const ALT = buildVariants({ esc, usd, round2, S, ROWS, reserveTarget, missionMin, c0Pieces: FUS.pieces, VMESH });   // §10 Alternative designs
if (!ALT) throw new Error('no variants found under concepts/variants');
const TOL = JSON.parse(readFileSync(new URL('./hardware/tolerances.json', import.meta.url), 'utf8'));
const tolSc = v => /^fail/.test(v) && !/pass at/.test(v) ? 'bad' : /fail|marginal/.test(v) ? 'warn' : /^open/.test(v) ? 'open' : 'ok';
const tolChip = v => { const w = String(v).split(':')[0]; return `<span class="chip ${tolSc(String(v))}" title="${esc(String(v))}">${esc(w.length > 34 ? w.slice(0, 32) + '…' : w)}</span>`; };
const tdash = v => v === null || v === undefined || v === "" ? "—" : esc(String(v));
const tolFits = TOL.fits.map(f => `<tr><td class="mono">${f.id}</td><td>${esc(f.feature)}${f.note ? `<br><span class="small">${esc(f.note)}</span>` : ''}</td><td>${tdash(f.nominal)}</td><td class="n">${tdash(f.cad)}</td><td class="n">${f.min_clear === null || f.min_clear === undefined ? '—' : esc(f.min_clear + ' to ' + f.max_clear)}</td><td>${tolChip(f.verdict)}</td></tr>`).join('');
const tolStacks = TOL.stackups.map(x => `<tr><td class="mono">${x.id}</td><td>${esc(x.name)}</td><td class="n">${tdash(x.worst)}</td><td class="n">${tdash(x.rss)}</td><td class="n">${tdash(x.limit)}</td><td>${tolChip(x.verdict)}</td></tr>`).join('');
const FX0 = -4, FX1 = 6.5, fpc = v => ((v - FX0) / (FX1 - FX0) * 100).toFixed(2);
const fitOrder = { bad: 0, warn: 1, open: 2, ok: 3 };
const fitStrips = [...TOL.fits].sort((a, b) => fitOrder[tolSc(String(a.verdict))] - fitOrder[tolSc(String(b.verdict))] || a.id.localeCompare(b.id)).map(f => { const c = tolSc(String(f.verdict)), has = f.min_clear != null;
  const bar = has ? (f.max_clear != null ? `<i class="fb ${c}" style="left:${fpc(f.min_clear)}%;width:${Math.max(0.6, fpc(f.max_clear) - fpc(f.min_clear)).toFixed(2)}%"></i>` : `<i class="fb ${c}" style="left:${fpc(f.min_clear)}%;width:0.8%"></i>`) : '';
  const txt = has ? `${f.min_clear} to ${f.max_clear ?? '—'}` : 'no range';
  return `<div class="frow"><div class="fl"><span class="mono-id">${f.id}</span> <span title="${esc(f.feature)}">${esc(f.feature.length > 46 ? f.feature.slice(0, 44) + '…' : f.feature)}</span></div><div class="ftr${has ? '' : ' none'}" role="img" aria-label="${f.id}: clearance ${txt} mm, ${esc(String(f.verdict).split(':')[0])}"><i class="fz" style="left:${fpc(0)}%"></i>${bar}</div><div class="fv">${txt} ${tolChip(f.verdict)}</div></div>`; }).join('');
const fitAxis = [-4, -2, 0, 2, 4, 6].map(v => `<span style="left:${fpc(v)}%">${v}</span>`).join('');
const fitPlot = `<div class="fplot" role="group" aria-label="Clearance range of each fit in millimetres against the zero line; negative is interference"><div class="frow faxis"><div class="fl">Clearance, mm <small>(left of 0 = interference)</small></div><div class="ftr">${fitAxis}</div><div class="fv"></div></div>${fitStrips}</div><div class="keyline"><span class="ok">pass</span><span class="warn">marginal / fail as drawn</span><span class="bad">fail</span><span class="open">open</span></div>`;
const stkRows = TOL.stackups.map(x => { const m = String(x.name).match(/nominal ([\d.]+)/), min = /^minimum/.test(x.limit_kind) && m, nom = m ? +m[1] : 0;
  const w = min ? round2(nom - x.worst) : x.worst, rs = min ? round2(nom - x.rss) : x.rss, lim = x.limit;
  const viol = v => min ? v < lim : v > lim, sw = viol(w), sr = viol(rs), mx = Math.max(w, rs, lim) * 1.15, pc2 = v => (v / mx * 100).toFixed(1);
  const cw = !sw ? 'ok' : sr ? 'bad' : 'warn', cr = sr ? 'bad' : 'ok';
  const txt = min ? `min gap: worst <b>${w}</b>, RSS <b>${rs}</b> · limit ≥ ${lim} ${esc(x.unit)}` : `worst <b>${w}</b>, RSS <b>${rs}</b> · limit ≤ ${lim} ${esc(x.unit)}`;
  return `<div class="frow srow"><div class="fl"><span class="mono-id">${x.id}</span> <span title="${esc(x.name)}">${esc(x.name.replace(/ \(.*$/, '').replace(/, nominal.*$/, ''))}</span></div><div class="ftr stk" role="img" aria-label="${x.id}: worst ${w}, RSS ${rs}, limit ${lim} ${esc(x.unit)}"><i class="fb ${cw}" style="left:0;width:${pc2(w)}%;top:2px;height:9px"></i><i class="fb ${cr}" style="left:0;width:${pc2(rs)}%;top:14px;height:9px"></i><i class="fz lim" style="left:${pc2(lim)}%"></i></div><div class="fv">${txt} ${tolChip(x.verdict)}</div></div>`; }).join('');
const stkPlot = `<div class="fplot">${stkRows}</div><div class="keyline"><span class="ok">within limit</span><span class="warn">worst case over, RSS within</span><span class="bad">over limit</span><span class="ln">limit line; top bar worst case, lower bar RSS</span></div>`;
const tolCoupons = TOL.coupons.map(c => `<li><b>${c.id} ${esc(c.name)}</b> (${esc(c.dims_mm || '—')}): ${esc(c.content || '')}. ${esc(c.measure || '')}</li>`).join('');   // Autodesk Fusion export + hardware schedule (inventory/build_fusion.mjs)
for (const p of Object.values(MESH.parts)) p.d = p.d.replace(/Â§/g, '§');
const INVP = {};
for (const x of ROWS) if (x['CAD part']) {
  const e = INVP[x['CAD part']] || (INVP[x['CAD part']] = { rows: [], kits: [], sc: 'none' });
  e.rows.push({ id: x.ID, item: x.Item, type: x.Type, qty: x['Qty needed'], onhand: x['Qty on hand'], status: x.Status, sc: x.sc, vendor: x.Vendor, madeFrom: x['Made from'], process: x.Process, kit: x.Kit, ext: x['Ext USD'] });
  if (!e.kits.includes(x.Kit)) e.kits.push(x.Kit);
}
const PRI = ['bad', 'warn', 'open', 'make', 'ok'];
for (const e of Object.values(INVP)) e.sc = PRI.find(p => e.rows.some(r => r.type !== 'Proposed' && r.sc === p)) || 'none';   // proposed lines are listed on the card but do not recolour the part
const unmapped = Object.keys(INVP).filter(n => !MESH.parts[n]); if (unmapped.length) throw new Error('inventory CAD part not in mesh: ' + unmapped);
const noRow = Object.keys(MESH.parts).filter(n => !INVP[n]);
const kitBtns = ['All', ...KIT_IDS].map(k => `<button type="button" class="kit" data-kit="${k}" aria-pressed="${k === 'All'}" ${k === 'All' ? 'aria-label="Show all kits"' : `aria-label="Isolate kit ${k}, ${esc(KITS[k])}" title="${esc(KITS[k])}"`}>${k}</button>`).join('');
const partList = Object.keys(MESH.parts).sort().map(n => { const c = MESH.comps.filter(c => c[0] === n).length; return `<li><button type="button" data-partbtn="${n}" title="${esc(MESH.parts[n].d)}">${n.replace(/_/g, ' ')}${c > 1 ? ' ×' + c : ''}</button></li>`; }).join('');

// ---------- date / model facts for text ----------
const DATE = S.generated;
const cadMeta = { parts: Object.keys(MESH.parts).length, comps: MESH.comps.length, tris: MESH.tris.toLocaleString('en-US') };

// ready-to-send message to NWA (plain text; counts come from rows N-01 and N-02)
const spl = () => { const m = byId['N-01'].Item.match(/(\d+) CW \+ (\d+) CCW \+ (\d+) spare/); if (!m) throw new Error('N-01 item wording changed'); return m; };
const [, cw, ccw, spare] = spl();
const NWA_MSG = `Subject: Thank you, and a few questions about the NWA sponsorship (UC Berkeley Design-Build-Fly)

Hello,

I am Tristan Hottier, writing for the UC Berkeley Design-Build-Fly capstone team that is building a lift + cruise VTOL aircraft. Thank you for offering, when we met you recently, to sponsor our team. We are very grateful and want to plan it properly.

Could you please confirm the following in writing?

1. What the sponsorship covers. Could you confirm whether the sponsorship would cover custom carbon propellers: ${byId['N-01']['Qty needed']} lift props of ${byId['N-01'].Item.match(/(\d+) in/)[1]} in (${cw} clockwise, ${ccw} counter-clockwise and ${spare} spares) and ${byId['N-02']['Qty needed']} pusher props of ${byId['N-02'].Item.match(/(\d+) in/)[1]} in? Is anything else included?
2. Cost to the team. Is the sponsorship free of charge to us?
3. Shipping and import. Who pays shipping and import duty from India?
4. Lead time, and how design iteration works (who proposes the pitch, and how many revisions are possible).
5. Design data you need from us. Our spec sheet (motor, prop sizes, rotation, hover design point, balance target) is attached; please tell us what else you need.
6. Balance and test data supplied with the props (for example a balance report).
7. Any obligations on our side: logo placement, acknowledgement, social media posts, data sharing, flight-test footage.
8. Ownership of the prop designs (IP) and any limits on how we may use them.
9. Liability and insurance expectations for flying the props.
10. A named contact for the project.

A short written reply is enough. Thank you again for your support.

Best regards,
Tristan Hottier
UC Berkeley Design-Build-Fly capstone team`;
const T = {
  DATE, REV, DOC: 'DBF-INV-001', SHEET_BTN_HEAD: sheetBtn(), SHEET_URL: SHEET,
  KPIS: kpis, KIT_TABLE: kitTable, BUDGET_BAR: budgetBar, RESERVE_BARS: reserveBarsHtml, DECISIONS: decisions, LINES: ROWS.length, GOODS: usd(S.goods), COMMITTED: usd(S.committed), CAP: usd(S.cap, 0), RESERVE: usd(S.reserve), TARGET: '$' + reserveTarget,
  MARGIN: usd(S.reserve - reserveTarget), SHIP: usd(S.shipping), TAX: usd(S.tax), TAXRATE: (S.taxRate * 100).toFixed(2), PRICES_CHECKED: S.bomPricesChecked,
  LADDER: ladder.map(x => `${x.Item.split(' (')[0].split(',')[0]} (${x.ID}, ${usd(x['Ext USD'])})`).join(', then '),
  NWA_QTY: nwaQty, NWA_LINES: nwa.length, NWA_LIFT: byId['N-01']['Qty needed'], NWA_PUSH: byId['N-02']['Qty needed'],
  HOLD_GOODS: usd(S.nwaSwap.retailPropGoods), HOLD_TAX: usd(S.nwaSwap.retailPropWithTax), RES_IF: usd(S.nwaSwap.reserveIfConfirmed),
  N_BUY: buy.length, N_MAKE: make.length, N_NWA: nwa.length, TO_MAKE: toMake, TO_SOURCE: toSource, HOLDS: holds,
  INV_TABLE: invTable, BY_VENDOR: barSvg(byVendor, 'bar1', 'Goods by vendor, before tax'), BY_CAT: barSvg(byCat, 'bar2', 'Goods by category, before tax'), WATERFALL: wfSvg(), WATER_TABLE: waterTable, SWAP: swap,
  VENDOR_CARDS: vendorBars, N_VENDORS: vOrder.length, FAB_TABLES: fabTables, STOCK_ROWS: stockRows, CUT_BARS: tubeBars, KIT_CARDS: kitCards, LOC_ROWS: locRows,
  KIT_BTNS: kitBtns, PART_LIST: partList, CAD_PARTS: cadMeta.parts, CAD_COMPS: cadMeta.comps, CAD_TRIS: cadMeta.tris, NO_ROW: noRow.length ? noRow.map(n => n.replace(/_/g, ' ')).join(', ') : 'none',
  N_PROP: proposed.length, NWA_MSG: esc(NWA_MSG), RECEIVED: received, LOC_BLANK: ROWS.filter(x => !x.Location || x.Location === '—').length,
  P12_NOTE: esc(byId['P-12'].Notes), M19: esc(byId['M-19'].Item), M19_NOTE: esc(byId['M-19'].Notes),
  TEN: usd(byId['P-02']['Ext USD']), AMA: usd(amaFee.v), FAA: usd(faaFee.v),
  ...ET, ...ALT.T,
  FV_PIECES: FUS.pieces, FV_TRIS: FUS.tris.toLocaleString('en-US'), FV_FILES: FUS.files, FV_DATE: FUS.generated, FV_JOINTS: Object.keys(FUS.joints).length, FV_NMOV: FUS.nMov, FV_NSLIDE: FUS.nSlide, FV_NREV: FUS.nMov - FUS.nSlide,
  FV_GROUPS: Object.entries(FUS.groups).map(([g, n]) => g + ' ' + n).join(', '),
  TOL_FITS: tolFits, TOL_STACKS: tolStacks, FIT_PLOT: fitPlot, STK_PLOT: stkPlot, TOL_COUPONS: tolCoupons, TOL_PRINTER: esc(TOL.process.printer.split(' (')[0].replace(/^ASSUMED /, '') + ' (the repo names no printer), ' + TOL.process.layer_mm + ' mm layers, PETG and PA6-CF'),
  TOL_FAIL: TOL.fits.filter(f => tolSc(String(f.verdict)) === 'bad').length, TOL_MARG: TOL.fits.filter(f => tolSc(String(f.verdict)) === 'warn').length,
  HOVER_N: '15.2', C150_A: (150 / 25.2).toFixed(2), PACK_H: (6.5 / (150 / 25.2)).toFixed(2),
};
// ---------- §8 / §9 flows and tiles ----------
const nwaFlow = flow([
  { n: 1, icon: 'mail', title: 'Send the message', sub: 'Draft below, spec sheet attached' },
  { n: 2, icon: 'docok', title: 'Get it in writing', sub: 'Scope, cost, shipping, lead time' },
  { n: 3, icon: 'swap', title: 'Swap the lines', sub: `P-14, P-16, P-23 → N-01 (${byId['N-01']['Qty needed']}), N-02 (${byId['N-02']['Qty needed']})` },
  { n: 4, icon: 'flask', title: 'Acceptance tests', sub: 'On receipt, below' }], 'Four steps from message to accepted props', 'h');
const swapRows = `<div class="swaps"><div class="swaprow"><div class="sw from"><span class="chip open">on hold</span><b>P-14, P-16</b> JeeFly 1755 pairs (lift)</div><span class="sa">${ic('chevron')}</span><div class="sw to"><span class="chip ok">proposed</span><b>N-01</b> ${byId['N-01']['Qty needed']} carbon 17 in props<small>fit to the X4110S bolt-on adapter</small></div></div>
<div class="swaprow"><div class="sw from"><span class="chip open">on hold</span><b>P-23</b> APC 14x8.5EP, 3 off (pusher)</div><span class="sa">${ic('chevron')}</span><div class="sw to"><span class="chip ok">proposed</span><b>N-02</b> ${byId['N-02']['Qty needed']} carbon 14 in props<small>keep one APC as the thrust-stand baseline (team call)</small></div></div></div>`;
const accepts = [['at1', 'search', 'Visual and tap', 'Threshold —', '', 'Check for delamination, cracks, voids; tap and listen for dull spots. Wear eye protection.'],
  ['at2', 'scale', 'Mass match', 'Tolerance —', '', 'Weigh every prop; pairs matched, reject outliers (designer\'s tolerance).'],
  ['at3', 'balance', 'Static balance', 'No blade drops', 'ok', 'Low-friction balancer: no blade drops in any position.'],
  ['at4', 'wave', 'Dynamic balance', 'Below G 6.3', 'ok', 'Stand with vibration and RPM sensors.'],
  ['at5', 'prop', 'Adapter fit', 'Run-out by eye', '', 'Concentric and straight on the motor.'],
  ['at6', 'gauge', 'Thrust vs baseline', 'Within 26 A / 30 s', 'warn', 'Carbon prop and the APC baseline on the same motor, ESC and battery; compare thrust, current and efficiency at hover and max throttle.'],
  ['at7', 'rotate', 'Max-RPM spin-up', 'Threshold —', '', 'Step up to max RPM behind a shield; watch vibration, flutter and deformation.'],
  ['at8', 'ruler', 'Tip clearance', 'Limit —', '', 'Measure airframe and boom clearance to the disc.']];
const acceptTiles = `<div class="atiles">${accepts.map(([id, i, n, t, c, d]) => `<label class="atile" for="${id}" title="${esc(d)}"><input type="checkbox" id="${id}"><span class="ai">${ic(i)}</span><b>${n}</b><span class="badge ${c}">${t}</span></label>`).join('')}</div>
<details class="more"><summary>What each test checks</summary><ul class="tight">${accepts.map(a => `<li><b>${a[2]}.</b> ${esc(a[5])}</li>`).join('')}</ul></details>`;
const rcFlow = flow([
  { n: 1, icon: 'hash', title: 'Count', sub: 'vs packing slip and Qty needed' },
  { n: 2, icon: 'eye', title: 'Inspect', sub: 'damage, wrong parts; photograph before the return window closes' },
  { n: 3, icon: 'pencil', title: 'Record', sub: 'Received date, Qty on hand, Inspected in the sheet' },
  { n: 4, icon: 'tag', title: 'Label', sub: 'inventory ID (P-xx)' },
  { n: 5, icon: 'bin', title: 'Bin', sub: 'kit bin; write it in Location' }], 'Five receiving steps: count, inspect, record, label, bin', 'h');
const lipoTiles = `<div class="itiles four">
<div class="itile">${ic('bag')}<b>Storage</b><span>LiPo bag (P-18) inside the ammo can (P-26); both packs fit.</span></div>
<div class="itile">${ic('can')}<b>Ammo can</b><span>Slit the gasket so a venting cell can't pressurise it (general practice; check EH&amp;S).</span></div>
<div class="itile">${ic('bolt')}<b>Charging</b><span>HTRC C150 (P-13), ${(150 / 25.2).toFixed(2)} A on 6S, about ${(6.5 / (150 / 25.2)).toFixed(2)} h per pack ${est}</span></div>
<div class="itile warnt">${ic('eyeoff')}<b>Never unattended</b><span>Do not leave packs charged or on the charger. Storage-charge level: —.</span></div></div>
<p class="meta">Flight battery: Ovonic 6S 6500 mAh 2-pack (P-12). Note: ${esc(byId['P-12'].Notes)}.</p>`;
Object.assign(T, { NWA_FLOW: nwaFlow, SWAP_ROWS: swapRows, ACCEPT_TILES: acceptTiles, RC_FLOW: rcFlow, LIPO_TILES: lipoTiles });
let bodyHtml = r('./src/body.html');
bodyHtml = bodyHtml.replace(/\{\{(\w+)\}\}/g, (m, k) => { if (!(k in T)) throw new Error('missing template value ' + k); return T[k]; });
// every citation becomes a one-line disclosure: the Source line stays attached to its claim, one click away
bodyHtml = bodyHtml.replace(/<p class="src">([\s\S]*?)<\/p>/g, '<details class="srcd"><summary>Source</summary><p class="src">$1</p></details>');
const rest = bodyHtml.match(/\{\{/); if (rest) throw new Error('unresolved placeholder');

const FONTS = 'https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600&family=Sofia+Sans+Semi+Condensed:wght@700&family=Red+Hat+Mono:wght@400;500;600&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap';
const json = o => JSON.stringify(o).replace(/</g, '\\u003c');
const html = `<title>DBF Inventory Overview</title>
<meta name="description" content="Inventory and electrical overview: purchasing, stock, fabrication, kits, wiring and Nautical Wings props for a student lift + cruise VTOL">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${r('./src/style.css')}
</style>
${bodyHtml}
<script>const MESH = ${json(MESH)}; const INVP = ${json(INVP)}; const KITS = ${json(KITS)}; const EL = ${json(ELB.EL)};</script>
<script type="application/json" id="fusionData">${json(FUS)}</script>
${ALT.blocks}
<script>const ALTV = ${json(ALT.META)};</script>
<script>
${r('./src/viewer3d.js')}
</script>
<script>
${r('./src/fusionviewer.js')}
</script>
<script>
${r('./src/variantviewer.js')}
</script>
<script>
${r('./src/app.js')}
</script>
`;
const OUT = process.env.OVERVIEW_TEST_OUT;   // tests write elsewhere so the repo files stay clean
if (!OUT) writeFileSync(new URL('./inventory-overview.html', import.meta.url), html);
if (!OUT) console.log('wrote inventory/inventory-overview.html', html.length, 'bytes');
const cut = html.indexOf('</style>') + '</style>'.length;
const local = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n'
  + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  + html.slice(0, cut).replace('<style>', '<style>\n[hidden]{display:none!important}')
  + '\n</head><body>\n' + html.slice(cut) + '</body></html>\n';
writeFileSync(OUT || new URL('../Inventory-Overview.html', import.meta.url), local);
console.log('wrote', OUT || 'Inventory-Overview.html (repo root)', local.length, 'bytes (' + (local.length / 1048576).toFixed(2) + ' MB); 3D variants: ' + (ALT.built.join(', ') || 'none yet') + ' of ' + ALT.ids.join(', '));
