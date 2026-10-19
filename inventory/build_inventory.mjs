// Builds the Inventory Czar's master list from the purchasing BOM and the CAD assembly.
//   in:  docs/purchasing/C0_BOM.csv (analysis/export_bom.mjs), cad/params.txt (comp= lines), cad/mesh/meta.json
//   out: inventory/inventory.csv  (one row per stock line; the Google Sheet is seeded from it)
//        inventory/inventory.json (same rows + budget summary + NWA prop proposal, read by the overview page)
// Nothing has been bought or built yet (BOM "Ordered" column is empty), so every on-hand quantity starts at 0.
// Re-run after the BOM changes: node inventory/build_inventory.mjs
import { readFileSync, writeFileSync } from 'fs';
const r = p => readFileSync(new URL(p, import.meta.url), 'utf8');

// ---------- CSV ----------
function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const esc = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

const bomRows = parseCsv(r('../docs/purchasing/C0_BOM.csv'));
const H = bomRows[0];
const col = n => H.indexOf(n);
const items = bomRows.slice(1).filter(x => x.length >= 6 && x[col('Item')] && x[col('Qty')]);
const totals = {};
for (const x of bomRows.slice(1)) if (x[0] && !x[col('Item')] && x[5]) totals[x[0]] = +x[5];

// ---------- kit (subassembly) for each purchased line, by keyword ----------
const KITS = {
  K1: 'Wing', K2: 'Booms & lift', K3: 'Tail', K4: 'Pod, avionics & pusher', K5: 'Landing gear',
  K6: 'Ground support & test', K7: 'Raw stock & consumables',
};
function kitFor(cat, item) {
  const s = item.toLowerCase();
  if (/filament|pa6-cf|petg|foamular|tube|tape|glue|wire|connector|hardware kit|straps|pushrod|extension lead|hot-wire/.test(s)) return 'K7';
  if (cat === 'Test & safety' || /charger|transmitter|pocket/.test(s)) return 'K6';
  if (cat === 'Energy') return 'K4';
  if (cat === 'Avionics' || /receiver/.test(s)) return 'K4';
  if (/servo/.test(s)) return 'K1';               // 2 aileron + elevator + 2 rudder servos; issued from K1 stores
  if (cat === 'Cruise propulsion') return 'K4';
  if (cat === 'Lift propulsion') return 'K2';
  if (/prop|motor|jeefly/.test(s)) return /pusher|apc/.test(s) ? 'K4' : 'K2';
  return 'K7';
}

const out = [];
let n = 0;
// ---------- purchased lines ----------
for (const x of items) {
  const cat = x[col('Category')], item = x[col('Item')], qty = +x[col('Qty')];
  const isProp = /JeeFly 1755|APC 14x8\.5EP/.test(item);
  out.push({
    ID: 'P-' + String(++n).padStart(2, '0'), Item: item, Type: 'Buy', Category: cat, Kit: kitFor(cat, item),
    'CAD part': /X4110S/.test(item) ? (/spare/i.test(item) ? '' : /pusher/i.test(item) ? 'Pusher_Motor' : 'Lift_Motor')
      : /JeeFly 1755 carbon prop/.test(item) ? 'Lift_Prop' : /APC 14x8\.5EP/.test(item) ? 'Pusher_Prop_14in'
      : /Ovonic/.test(item) ? 'Battery_6S_LiPo' : /MS5525/.test(item) ? 'Pitot_Tube' : '',
    'Qty needed': qty, 'Qty ordered': 0, 'Qty on hand': 0,
    Status: isProp ? 'Hold: NWA swap pending' : 'To order',
    Vendor: x[col('Vendor')], 'Unit USD': +x[col('Unit USD')], 'Ext USD': +x[col('Ext USD')],
    'Made from': '', Process: '', Location: '—', 'Order date': '', 'Received date': '', Inspected: '',
    Source: 'C0_BOM.csv: ' + x[col('Source (research file §)')],
    Notes: [x[col('Note')], isProp ? 'Retail fallback if the Nautical Wings carbon props are not confirmed' : ''].filter(Boolean).join('; '),
  });
}
const pid = re => { const row = out.find(o => re.test(o.Item)); if (!row) throw new Error('BOM line not found: ' + re); return row.ID; };

// ---------- fabricated parts (one row per CAD part type; qty = assembly instances) ----------
const comps = {};
for (const l of r('../cad/params.txt').split(/\r?\n/)) if (l.startsWith('comp=')) { const p = l.slice(5).split('|')[0]; comps[p] = (comps[p] || 0) + 1; }
const meta = JSON.parse(r('../cad/mesh/meta.json'));
const MAKE = [
  // part, kit, made from (BOM line), process
  ['Wing_Panel_L', 'K1', /F-250 2 in/, 'Hot-wire XPS core, packing-tape skin'],
  ['Wing_Panel_R', 'K1', /F-250 2 in/, 'Hot-wire XPS core, packing-tape skin'],
  ['Aileron_L', 'K1', /F-250 2 in/, 'Cut from wing panel trailing edge, tape hinge'],
  ['Aileron_R', 'K1', /F-250 2 in/, 'Cut from wing panel trailing edge, tape hinge'],
  ['Wing_Saddle', 'K1', /F-250 2 in/, 'XPS block, taped; printed PETG root plates; bore for joiner'],
  ['Spar_Tube', 'K1', /0\.058 in x 96/, 'Cut 0.8 m from 96 in tube'],
  ['Wing_Joiner', 'K1', /0\.875 x 0\.058/, 'Cut 0.76 m from 36 in tube'],
  ['Wing_Bolt', 'K1', /Hardware kit/, 'M5 x 30 from hardware kit, captive nut in saddle'],
  ['Boom_Front', 'K2', /0\.035 in x 72/, 'Cut 0.955 m from 72 in tube'],
  ['Boom_Rear_Stub', 'K2', /0\.035 in x 72/, 'Cut 0.516 m from 72 in tube'],
  ['Boom_Clamp_Front', 'K2', /PETG/, '3D print, PETG'],
  ['Boom_Clamp_Rear', 'K2', /PETG/, '3D print, PETG'],
  ['Motor_Mount', 'K2', /PA6-CF20/, '3D print, PA6-CF (motor heat)'],
  ['H_Tail', 'K3', /FOAMULAR 150/, 'Hot-wire or sand XPS, tape skin'],
  ['Elevator', 'K3', /FOAMULAR 150/, 'Cut XPS, tape hinge'],
  ['Fin', 'K3', /FOAMULAR 150/, 'Cut XPS, tape skin'],
  ['Fuselage_Pod', 'K4', /FOAMULAR 150/, 'XPS shell on printed PETG frames, taped'],
  ['Canopy', 'K4', /PETG/, '3D print or foam blister (EST)'],
  ['Spinner', 'K4', null, 'Not in the BOM: buy or print (—)'],
  ['Landing_Leg', 'K5', /0\.058 in x 96/, 'Cut 0.205 m from socket-tube offcut; printed TPU/PETG foot'],
  ['Gear_Clamp', 'K5', /PETG/, '3D print, PETG'],
];
let m = 0;
for (const [part, kit, from, proc] of MAKE) {
  if (!comps[part]) throw new Error('not in assembly: ' + part);
  out.push({
    ID: 'M-' + String(++m).padStart(2, '0'), Item: (meta[part] ? meta[part].d.replace(/Â§/g, '§').replace(/; shown dark to mark the interface$/, '') : part), Type: 'Make', Category: 'Fabricated part', Kit: kit,
    'CAD part': part, 'Qty needed': comps[part], 'Qty ordered': '', 'Qty on hand': 0,
    Status: from ? 'To make' : 'To source', Vendor: from ? 'In-house' : '—', 'Unit USD': 0, 'Ext USD': 0,
    'Made from': from ? pid(from) : '—', Process: proc, Location: '—', 'Order date': '', 'Received date': '', Inspected: '',
    Source: 'cad/params.txt comp= count; cad/mesh/meta.json', Notes: '',
  });
}

// ---------- Nautical Wings Aerospace carbon props (proposed, free) ----------
const NWA_SRC = 'docs/research/nautical-wings-props.md; sponsorship: team-reported (founders, in person, Oct 2026)';
const NWA_NOTE = 'NWA founders offered to sponsor the team (met in person; team-reported, Oct 2026). Sponsorship rules not yet confirmed in writing. ';
out.push({
  ID: 'N-01', Item: 'Carbon lift prop 17 in (design on demand, 2 CW + 2 CCW + 2 spare)', Type: 'NWA', Category: 'Lift propulsion', Kit: 'K2',
  'CAD part': 'Lift_Prop', 'Qty needed': 6, 'Qty ordered': 0, 'Qty on hand': 0, Status: 'Proposed: NWA sponsor offer (verbal)',
  Vendor: 'Nautical Wings Aerospace', 'Unit USD': 0, 'Ext USD': 0, 'Made from': '', Process: 'Send spec sheet; designer proposes pitch',
  Location: '—', 'Order date': '', 'Received date': '', Inspected: '', Source: NWA_SRC,
  Notes: NWA_NOTE + 'Replaces JeeFly 1755 x 6 if confirmed. Fit to X4110S bolt-on adapter (4 mm shaft); hover point 15.2 N per rotor',
});
out.push({
  ID: 'N-02', Item: 'Carbon pusher prop 14 in (design on demand)', Type: 'NWA', Category: 'Cruise propulsion', Kit: 'K4',
  'CAD part': 'Pusher_Prop_14in', 'Qty needed': 2, 'Qty ordered': 0, 'Qty on hand': 0, Status: 'Proposed: NWA sponsor offer (verbal)',
  Vendor: 'Nautical Wings Aerospace', 'Unit USD': 0, 'Ext USD': 0, 'Made from': '', Process: 'Send spec sheet; APC 14x8.5EP is the baseline',
  Location: '—', 'Order date': '', 'Received date': '', Inspected: '', Source: NWA_SRC,
  Notes: NWA_NOTE + 'Replaces APC 14x8.5EP x 3 if confirmed; keep one APC as thrust-stand baseline (team call)',
});

// ---------- proposed additions (not in the committed BOM): wheeled gear + electrical ----------
// in: inventory/electrical/proposed_lines.json (docs/research/electrical-architecture.md)
const prop = JSON.parse(r('./electrical/proposed_lines.json'));
let g = 0;
for (const l of prop.lines) {
  if (l.unit_usd == null || l.qty == null) continue;          // unpriced optional lines stay in the research file
  const isCap = /capacitor/i.test(l.item);
  out.push({
    ID: 'G-' + String(++g).padStart(2, '0'), Item: l.item, Type: 'Proposed', Category: isCap ? 'Electrical' : 'Landing gear',
    Kit: isCap ? 'K2' : l.kit, 'CAD part': isCap ? '' : 'Landing_Leg', 'Qty needed': l.qty, 'Qty ordered': 0, 'Qty on hand': 0,
    Status: isCap ? 'Proposed: electrical' : 'Proposed: wheeled gear', Vendor: l.vendor, 'Unit USD': l.unit_usd, 'Ext USD': l.ext_usd,
    'Made from': '', Process: '', Location: '—', 'Order date': '', 'Received date': '', Inspected: '',
    Source: `inventory/electrical/proposed_lines.json: ${l.url} (checked ${l.checked})`, Notes: l.why,
  });
}

// ---------- budget summary + swap arithmetic ----------
const goods = out.filter(o => o.Type === 'Buy').reduce((s, o) => s + o['Ext USD'], 0);
const taxRate = 0.1025;
const propRetail = out.filter(o => o.Status.startsWith('Hold')).reduce((s, o) => s + o['Ext USD'], 0);
const round = v => Math.round(v * 100) / 100;
const summary = {
  generated: new Date().toISOString().slice(0, 10),
  bomPricesChecked: '2026-10-13',
  cap: 2000, goods: round(goods), tax: totals['Sales/use tax 10.25 % (Berkeley, CDTFA 2026-10-01)'],
  shipping: totals['Shipping allowance (estimate)'], committed: totals['Committed spend'], reserve: totals['Crash reserve left under $2,000'],
  taxRate,
  nwaSwap: {
    retailPropGoods: round(propRetail), retailPropWithTax: round(propRetail * (1 + taxRate)),
    reserveIfConfirmed: round(2000 - (goods * (1 + taxRate) + totals['Shipping allowance (estimate)']) + propRetail * (1 + taxRate)),
    note: 'EST: assumes NWA props are free with no shipping or import cost to the team; shipping allowance left unchanged',
  },
  proposed: (() => { const pg = out.filter(o => o.Type === 'Proposed').reduce((t, o) => t + o['Ext USD'], 0);
    return { goods: round(pg), withTax: round(pg * (1 + taxRate)),
      reserveAfter: round(2000 - (goods * (1 + taxRate) + totals['Shipping allowance (estimate)']) - pg * (1 + taxRate)),
      reserveAfterWithNwa: round(2000 - (goods * (1 + taxRate) + totals['Shipping allowance (estimate)']) - pg * (1 + taxRate) + propRetail * (1 + taxRate)),
      note: 'EST: proposed lines are not in the committed BOM; shipping for them not quoted (—); wheel price conflict noted in proposed_lines.json' }; })(),
  kits: KITS,
  counts: { proposed: out.filter(o => o.Type === 'Proposed').length, buy: out.filter(o => o.Type === 'Buy').length, make: out.filter(o => o.Type === 'Make').length, nwa: out.filter(o => o.Type === 'NWA').length },
};
if (Math.abs(summary.goods - totals['Goods subtotal']) > 0.01) throw new Error(`goods ${summary.goods} != BOM subtotal ${totals['Goods subtotal']}`);

const cols = Object.keys(out[0]);
writeFileSync(new URL('./inventory.csv', import.meta.url), [cols.map(esc).join(','), ...out.map(o => cols.map(c => esc(o[c])).join(','))].join('\n') + '\n');
writeFileSync(new URL('./inventory.json', import.meta.url), JSON.stringify({ summary, columns: cols, rows: out }, null, 1));
console.log(`inventory: ${summary.counts.buy} buy, ${summary.counts.make} make, ${summary.counts.nwa} NWA; goods $${summary.goods}; NWA swap frees $${summary.nwaSwap.retailPropWithTax} -> reserve $${summary.nwaSwap.reserveIfConfirmed} (EST)`);
