// Assembles Inventory-Overview.html (standalone) and inventory/inventory-overview.html (fragment, for publishing)
// from inventory/inventory.json (built by inventory/build_inventory.mjs) + inventory/src/* + the CAD mesh (review/mesh.mjs).
// Run: node inventory/build_overview.mjs     Every number on the page is read or computed here; none is typed into body.html.
import { readFileSync, writeFileSync } from 'fs';
import { packMesh } from '../review/mesh.mjs';
const r = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const INV = JSON.parse(r('./inventory.json')), S = INV.summary, ROWS = INV.rows;
const NWA_MD = r('../docs/research/nautical-wings-props.md'), BEN_MD = r('../docs/research/budget-energy-test.md');
const BOM_CSV = r('../docs/purchasing/C0_BOM.csv'), BASIS = r('../docs/DESIGN-BASIS.md');
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

// ---------- §1 overview ----------
const kpi = (l, v, s, cls = '') => `<div class="kpi"><div class="l">${l}</div><div class="v ${cls}">${v}</div><div class="s">${s}</div></div>`;
const kpis = `<div class="kpis two">
${kpi('Committed spend vs cap (R6)', usd(S.committed), `of ${usd(S.cap, 0)} cap incl. tax and shipping; ${usd(S.cap - S.committed)} left`, 'ok')}
${kpi('Crash reserve (R7)', usd(S.reserve), `target ≥ $${reserveTarget}: met, thin (margin ${usd(S.reserve - reserveTarget)})`, 'warn')}
${kpi('Lines to buy', buy.length, `${toOrder} to order, ${buy.length - toOrder} on hold (NWA swap) · goods ${usd(S.goods)}`)}
${kpi('Parts to make', make.length, `${toMake} to make in-house, ${toSource} to source (spinner)`)}
${kpi('Items received', `${received} <small>of ${ROWS.length} lines</small>`, (ROWS.some(x => +x['Qty ordered'] > 0) ? `${ROWS.filter(x => +x['Qty ordered'] > 0).length} lines ordered` : 'nothing ordered yet; every on-hand quantity is 0'), received ? 'ok' : 'warn')}
${kpi('NWA props', `${nwaQty} <small>proposed</small>`, `${nwa.length} lines, not confirmed: terms in writing first`, 'warn')}
</div>`;
const kitRows = KIT_IDS.map(k => {
  const rs = ROWS.filter(x => x.Kit === k), o = rs.filter(x => x.Status === 'To order').length, m = rs.filter(x => x.Status === 'To make').length;
  const oth = rs.length - o - m, oh = rs.filter(x => (+x['Qty on hand'] || 0) > 0).length;
  const seg = (n, c) => n ? `<i class="${c}" style="width:${(n / rs.length * 100).toFixed(1)}%"></i>` : '';
  const hold = rs.filter(x => x.sc === 'open').length, bad = rs.filter(x => x.sc === 'bad').length;
  return `<tr><td><span class="mono-id">${k}</span></td><td>${esc(KITS[k])}</td><td class="n">${rs.length}</td><td class="n">${o}</td><td class="n">${m}</td><td class="n">${oth || '—'}</td><td class="n">${oh}</td>
<td><div class="bar" role="img" aria-label="${k}: ${o} to order, ${m} to make, ${hold} hold or proposed, ${bad} to source, ${oh} on hand">${seg(oh, 'ok')}${seg(o, 'warn')}${seg(m, 'make')}${seg(hold, 'open')}${seg(bad, 'bad')}</div></td></tr>`;
}).join('');
const kitTot = `<tr class="total"><td colspan="2">All kits</td><td class="n">${ROWS.length}</td><td class="n">${toOrder}</td><td class="n">${toMake}</td><td class="n">${ROWS.length - toOrder - toMake}</td><td class="n">${received}</td><td></td></tr>`;
const kitTable = `<div class="tbl"><table><thead><tr><th>Kit</th><th>Name</th><th class="n">Lines</th><th class="n">To order</th><th class="n">To make</th><th class="n">Hold, proposed, to source</th><th class="n">On hand</th><th>Status</th></tr></thead><tbody>${kitRows}${kitTot}</tbody></table></div>
<div class="keyline"><span class="ok">on hand</span><span class="warn">to order</span><span class="make">to make</span><span class="open">hold / proposed</span><span class="bad">to source</span></div>`;
const unitOf = id => byId[id];
const ladder = ['P-02', 'P-40', 'P-27'].map(unitOf);

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
<label>Type<select id="invType"><option value="">All</option>${opt(['Buy', 'Make', 'NWA'])}</select></label>
<label>Kit<select id="invKit"><option value="">All</option>${KIT_IDS.map(k => `<option value="${k}">${k} ${esc(KITS[k])}</option>`).join('')}</select></label>
<label>Status<select id="invStatus"><option value="">All</option>${opt(statuses)}</select></label>
<button type="button" class="themebtn" id="invClear">Clear filters</button>
<span class="count" id="invCount" aria-live="polite">${ROWS.length} of ${ROWS.length} lines</span></div>
<div class="tbl" id="invWrap" tabindex="0" role="region" aria-label="Inventory table, scrolls sideways"><table id="invTable"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>
<tfoot><tr class="total"><td colspan="6" id="invTotLbl">Buy lines shown: ${buy.length}</td><td></td><td></td><td></td><td></td><td></td><td></td><td class="n" id="invTot">${goods.toFixed(2)}</td><td colspan="8">goods, before tax and shipping (Make and NWA lines are $0)</td></tr></tfoot></table></div>
<p class="tblnote">Click a row with a CAD part to show it in the 3D model. Dates and Location are blank until the sheet is filled in.</p>`;

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
const swap = `<div class="tbl"><table><thead><tr><th>NWA swap, if props are confirmed free</th><th>Arithmetic</th><th class="n">USD</th></tr></thead><tbody>
<tr><td>Retail prop goods on hold</td><td>${['P-14', 'P-16', 'P-23'].map(id => `${id} ${usd(byId[id]['Ext USD'])}`).join(' + ')}</td><td class="n">${usd(S.nwaSwap.retailPropGoods)}</td></tr>
<tr><td>With tax</td><td>${usd(S.nwaSwap.retailPropGoods)} × ${(1 + S.taxRate).toFixed(4)}</td><td class="n">${usd(S.nwaSwap.retailPropWithTax)}</td></tr>
<tr><td>Reserve today</td><td>${usd(S.cap, 0)} − ${usd(S.committed)}</td><td class="n">${usd(S.reserve)}</td></tr>
<tr class="total"><td>Reserve if confirmed ${est}</td><td>${usd(S.reserve)} + ${usd(S.nwaSwap.retailPropWithTax)}</td><td class="n">${usd(S.nwaSwap.reserveIfConfirmed)}</td></tr><tr><td colspan="3" class="note">Summed before rounding to the cent, so the two parts can differ from the total by $0.01.</td></tr></tbody></table></div>
<p class="meta"><span class="est">EST</span> ${esc(S.nwaSwap.note.replace(/^EST:\s*/, ''))}.</p>`;
// orders by vendor
const vendors = new Map(); for (const x of buy) { const k = (x.Vendor === '' || x.Vendor === '—') ? 'Vendor not set (—)' : x.Vendor; (vendors.get(k) || vendors.set(k, []).get(k)).push(x); }
const vOrder = [...vendors].map(([k, a]) => [k, a, sum(a.map(x => x['Ext USD']))]).sort((a, b) => b[2] - a[2]);
const vCards = vOrder.map(([k, a, sub]) => {
  const hold = sum(a.filter(x => x.sc === 'open').map(x => x['Ext USD']));
  const li = a.map(x => `<li><span class="mono-id">${x.ID}</span><span>${esc(x.Item)}${x.sc === 'open' ? ' ' + chip(x.Status) : ''}</span><span class="q">${x['Qty needed']} × ${Number(x['Unit USD']).toFixed(2)} = <b>${Number(x['Ext USD']).toFixed(2)}</b></span></li>`).join('');
  const foot = hold ? `Of this, ${usd(hold)} is on hold (NWA swap); order the rest now.` : (k.startsWith('Vendor not set') ? 'No vendor named in the BOM: choose one, or borrow (P-02 note).' : 'All lines ready to order.');
  return `<div class="card vcard"><div class="vh"><h3>${esc(k)}</h3><span class="sub">${usd(sub)}</span></div><ul>${li}</ul><div class="foot">${a.length} line${a.length > 1 ? 's' : ''} · ${foot}</div></div>`;
}).join('');
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
const kitCards = KIT_IDS.map(k => { const a = ROWS.filter(x => x.Kit === k), b = a.filter(x => x.Type === 'Buy'), m = a.filter(x => x.Type !== 'Buy');
  const li = x => `<li><span class="mono-id">${x.ID}</span><span>${esc(x.Item)}</span><span>${x['Qty needed']}× ${chip(x.Status)}</span></li>`;
  return `<div class="card kitcard"><h3><span class="mono-id">${k}</span> ${esc(KITS[k])}</h3><p class="meta">${a.length} lines: ${b.length} bought (${usd(sum(b.map(x => x['Ext USD'])))} goods), ${m.length} made or NWA. Bin ${k}.</p>
<ul>${b.length ? '<li style="display:block"><b>Bought, goes in the bin on receipt</b></li>' + b.map(li).join('') : ''}${m.length ? '<li style="display:block"><b>Made or supplied, goes in the bin when finished</b></li>' + m.map(li).join('') : ''}</ul></div>`; }).join('');

// ---------- §7 location proposal ----------
const locRows = KIT_IDS.map(k => `<tr><td><span class="mono-id">${k}</span></td><td>${esc(KITS[k])}</td><td class="n">${ROWS.filter(x => x.Kit === k).length}</td><td>${k === 'K6' ? 'also holds the LiPo ammo can (P-26) and bag (P-18)' : k === 'K4' ? 'LiPo packs (P-12) live in the K6 ammo can, not the K4 bin' : k === 'K7' ? 'raw tube stock may be too long for a bin: store flat, label the tube' : '—'}</td></tr>`).join('');

// ---------- 3D model data ----------
const MESH = packMesh();
for (const p of Object.values(MESH.parts)) p.d = p.d.replace(/Â§/g, '§');
const INVP = {};
for (const x of ROWS) if (x['CAD part']) {
  const e = INVP[x['CAD part']] || (INVP[x['CAD part']] = { rows: [], kits: [], sc: 'none' });
  e.rows.push({ id: x.ID, item: x.Item, type: x.Type, qty: x['Qty needed'], onhand: x['Qty on hand'], status: x.Status, sc: x.sc, vendor: x.Vendor, madeFrom: x['Made from'], process: x.Process, kit: x.Kit, ext: x['Ext USD'] });
  if (!e.kits.includes(x.Kit)) e.kits.push(x.Kit);
}
const PRI = ['bad', 'warn', 'open', 'make', 'ok'];
for (const e of Object.values(INVP)) e.sc = PRI.find(p => e.rows.some(r => r.sc === p)) || 'none';
const unmapped = Object.keys(INVP).filter(n => !MESH.parts[n]); if (unmapped.length) throw new Error('inventory CAD part not in mesh: ' + unmapped);
const noRow = Object.keys(MESH.parts).filter(n => !INVP[n]);
const kitBtns = ['All', ...KIT_IDS].map(k => `<button type="button" class="kit" data-kit="${k}" aria-pressed="${k === 'All'}" ${k === 'All' ? 'aria-label="Show all kits"' : `aria-label="Isolate kit ${k}, ${esc(KITS[k])}" title="${esc(KITS[k])}"`}>${k}</button>`).join('');
const partList = Object.keys(MESH.parts).sort().map(n => { const c = MESH.comps.filter(c => c[0] === n).length; return `<li><button type="button" data-partbtn="${n}" title="${esc(MESH.parts[n].d)}">${n.replace(/_/g, ' ')}${c > 1 ? ' ×' + c : ''}</button></li>`; }).join('');

// ---------- date / model facts for text ----------
const DATE = S.generated;
const cadMeta = { parts: Object.keys(MESH.parts).length, comps: MESH.comps.length, tris: MESH.tris.toLocaleString('en-US') };

const T = {
  DATE, REV, DOC: 'DBF-INV-001', SHEET_BTN_HEAD: sheetBtn(), SHEET_BTN_INV: sheetBtn(), SHEET_BTN_INV2: sheetBtn('ghost'),
  KPIS: kpis, KIT_TABLE: kitTable, LINES: ROWS.length, GOODS: usd(S.goods), COMMITTED: usd(S.committed), CAP: usd(S.cap, 0), RESERVE: usd(S.reserve), TARGET: '$' + reserveTarget,
  MARGIN: usd(S.reserve - reserveTarget), SHIP: usd(S.shipping), TAX: usd(S.tax), TAXRATE: (S.taxRate * 100).toFixed(2), PRICES_CHECKED: S.bomPricesChecked,
  LADDER: ladder.map(x => `${x.Item.split(' (')[0].split(',')[0]} (${x.ID}, ${usd(x['Ext USD'])})`).join(', then '),
  NWA_QTY: nwaQty, NWA_LINES: nwa.length, NWA_LIFT: byId['N-01']['Qty needed'], NWA_PUSH: byId['N-02']['Qty needed'],
  HOLD_GOODS: usd(S.nwaSwap.retailPropGoods), HOLD_TAX: usd(S.nwaSwap.retailPropWithTax), RES_IF: usd(S.nwaSwap.reserveIfConfirmed),
  N_BUY: buy.length, N_MAKE: make.length, N_NWA: nwa.length, TO_MAKE: toMake, TO_SOURCE: toSource, HOLDS: holds,
  INV_TABLE: invTable, BY_VENDOR: barSvg(byVendor, 'bar1', 'Goods by vendor, before tax'), BY_CAT: barSvg(byCat, 'bar2', 'Goods by category, before tax'), WATERFALL: wfSvg(), WATER_TABLE: waterTable, SWAP: swap,
  VENDOR_CARDS: vCards, N_VENDORS: vOrder.length, FAB_TABLES: fabTables, STOCK_ROWS: stockRows, CUT_ROWS: cutRows, KIT_CARDS: kitCards, LOC_ROWS: locRows,
  KIT_BTNS: kitBtns, PART_LIST: partList, CAD_PARTS: cadMeta.parts, CAD_COMPS: cadMeta.comps, CAD_TRIS: cadMeta.tris, NO_ROW: noRow.length ? noRow.map(n => n.replace(/_/g, ' ')).join(', ') : 'none',
  RECEIVED: received, LOC_BLANK: ROWS.filter(x => !x.Location || x.Location === '—').length,
  P12_NOTE: esc(byId['P-12'].Notes), M19: esc(byId['M-19'].Item), M19_NOTE: esc(byId['M-19'].Notes),
  TEN: usd(byId['P-02']['Ext USD']), AMA: usd(amaFee.v), FAA: usd(faaFee.v),
  HOVER_N: '15.2', C150_A: (150 / 25.2).toFixed(2), PACK_H: (6.5 / (150 / 25.2)).toFixed(2),
};
let bodyHtml = r('./src/body.html');
bodyHtml = bodyHtml.replace(/\{\{(\w+)\}\}/g, (m, k) => { if (!(k in T)) throw new Error('missing template value ' + k); return T[k]; });
const rest = bodyHtml.match(/\{\{/); if (rest) throw new Error('unresolved placeholder');

const FONTS = 'https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600&family=Sofia+Sans+Semi+Condensed:wght@700&family=Red+Hat+Mono:wght@400;500;600&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap';
const json = o => JSON.stringify(o).replace(/</g, '\\u003c');
const html = `<title>DBF Inventory Overview</title>
<meta name="description" content="Inventory Czar project overview: purchasing, stock, fabrication, kits and Nautical Wings props for a student lift + cruise VTOL">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${r('./src/style.css')}
</style>
${bodyHtml}
<script>const MESH = ${json(MESH)}; const INVP = ${json(INVP)}; const KITS = ${json(KITS)};</script>
<script>
${r('./src/viewer3d.js')}
</script>
<script>
${r('./src/app.js')}
</script>
`;
writeFileSync(new URL('./inventory-overview.html', import.meta.url), html);
console.log('wrote inventory/inventory-overview.html', html.length, 'bytes');
const cut = html.indexOf('</style>') + '</style>'.length;
const local = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n'
  + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  + html.slice(0, cut).replace('<style>', '<style>\n[hidden]{display:none!important}')
  + '\n</head><body>\n' + html.slice(cut) + '</body></html>\n';
writeFileSync(new URL('../Inventory-Overview.html', import.meta.url), local);
console.log('wrote Inventory-Overview.html (repo root)', local.length, 'bytes');
