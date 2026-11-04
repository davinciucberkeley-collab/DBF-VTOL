// Assembles review/vtol-review.html from review/src/* + analysis/model.js + analysis/results.json
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync } from 'fs';

// Windows can hold an output file open for a moment (preview browser, virus scan): retry a few times
// JSON for inline <script>: '<' escaped so no data string can close the tag or open a comment
const js = v => JSON.stringify(v).replace(/</g, '\\u003c');
function writeSafe(u, data) {
  for (let k = 0; ; k++) {
    try { writeFileSync(u, data); return; }
    catch (e) { if (k >= 6 || !['EBUSY', 'EPERM', 'EACCES', 'UNKNOWN'].includes(e.code)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250); }
  }
}

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { packMesh } from './mesh.mjs';
const r = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const data = JSON.parse(r('../analysis/results.json'));
const v02 = JSON.parse(r('../analysis/results_v0.2_baseline.json'));
const aero = JSON.parse(r('../analysis/aero.json'));
// full engineering draft: trade study, aerodynamic package, build manual and test plan summaries
const tradeAll = JSON.parse(r('../analysis/tradestudy.json'));
// only what the page draws: ranking, criteria, sensitivity cases, and each variant's label, family, flags and headline metrics
const TRADE = { ranking: tradeAll.ranking, criteria: tradeAll.criteria, sensitivity: { baseWinnerFeasibleR1: tradeAll.sensitivity.baseWinnerFeasibleR1, cases: tradeAll.sensitivity.cases.map(({ criterion, factor, winnerFeasibleR1 }) => ({ criterion, factor, winnerFeasibleR1 })) },
  variants: tradeAll.variants.map(({ id, label, family, meetsR1, feasible, flags, metrics }) => ({ id, label, family, meetsR1, feasible, flags, metrics: { MTOW_kg: metrics.MTOW_kg, cruise_avail_min: metrics.cruise_avail_min, reserve_usd: metrics.reserve_usd } })) };
const hwAll = JSON.parse(r('../cad/hardware.json'));
const HW = { fasteners: hwAll.fasteners.map(({ id, standard, thread, length_mm, qty, torque_Nm, joints }) => ({ id, standard, thread, length_mm, qty, torque_Nm, joints })), inserts: hwAll.inserts.map(({ id, qty }) => ({ id, qty })), nuts: hwAll.nuts.map(({ id, qty }) => ({ id, qty })), washers: hwAll.washers.map(({ id, qty }) => ({ id, qty })), fits: hwAll.fits.map(({ id, joint, min_clearance_mm, max_clearance_mm }) => ({ id, joint, min_clearance_mm, max_clearance_mm })) };
const aeroFull = JSON.parse(r('../analysis/aero/aero_results.json'));
let nf = {}; try { nf = JSON.parse(r('../analysis/aero/out/neuralfoil_polars.json')); } catch (e) { console.log('no neuralfoil polars'); }
// trim the aero package to what the page draws (section tables are large)
const AEROD = { ...aeroFull, section_polars: Object.fromEntries(Object.entries(aeroFull.section_polars).map(([k, v]) => [k, (k === 'n2415_stall_ncrit9' || k === 'n2415_cruise_ncrit9') ? v : { ...v, table: undefined }])),
  neuralfoil: Object.entries(nf.cases || {}).filter(([k]) => k === 'n2415_stall_ncrit9' || k === 'n2415_cruise_ncrit9').map(([k, c]) => ({ name: k, Re: c.Re, alpha: c.alpha_deg, CL: c.CL, CD: c.CD })) };
const csvRows = s => { const out = []; let row = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) { const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(f); f = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(f); if (row.some(x => x !== '')) out.push(row); row = []; f = ''; } else f += ch; }
  if (f || row.length) { row.push(f); out.push(row); } return out; };
const tm = csvRows(r('../docs/test/test-matrix.csv')); const TESTS = tm.slice(1).map(c => Object.fromEntries(tm[0].map((h, i) => [h, c[i]])));
const manual = r('../docs/build/BUILD-MANUAL.md');
const WPS = [...manual.matchAll(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([\d.]+)[^|]*\|\s*([^|]*?)\s*\|/gm)].map(m => ({ wp: +m[1], title: m[2], labour: +m[3], machine: m[4] }));
const BUILD = { wps: WPS, steps: (manual.match(/^\*\*\d+\.\d+[a-z]?\s/gm) || []).length,
  total: (manual.match(/\*\*Total\*\*\s*\|\s*\*\*([\d.]+)\s*person-h/) || [])[1], machine: (manual.match(/\*\*Total\*\*[^\n]*?[~≈]\s*([\d.]+)\s*h machine/) || [])[1] };
// SOLIDWORKS Simulation results: key=value|unit|note
const sim = {};
for (const line of r('../cad/sim/results.txt').split(String.fromCharCode(10)).map(x => x.trim())) { if (!line || line.startsWith('#')) continue; const i = line.indexOf('='); sim[line.slice(0, i)] = parseFloat(line.slice(i + 1)); }
// CAD build parameters (numeric only)
const cadp = {};
for (const line of r('../cad/params.txt').split(String.fromCharCode(10)).map(x => x.trim())) { if (!line || line.startsWith('comp=')) continue; const i = line.indexOf('='); const v = parseFloat(line.slice(i + 1)); if (!isNaN(v) && !line.startsWith('foil=')) cadp[line.slice(0, i)] = v; }
// images embedded as data URIs (page stays self-contained)
// renders are embedded as JPEG (review/tojpeg.ps1, regenerated on Windows when the PNG is newer); elsewhere the committed JPEG is used,
// since checkout times say nothing about which file is newer; the PNG only when no JPEG exists
const IMGDIR = new URL('./img/', import.meta.url); mkdirSync(IMGDIR, { recursive: true });
function b64(f) {
  const png = new URL(f, import.meta.url), jpg = new URL(f.split('/').pop().replace(/.png$/i, '.jpg'), IMGDIR);
  if (process.platform === 'win32' && (!existsSync(jpg) || statSync(jpg).mtimeMs < statSync(png).mtimeMs))
    spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./tojpeg.ps1', import.meta.url)), fileURLToPath(png), fileURLToPath(jpg)]);
  if (existsSync(jpg) && (process.platform !== 'win32' || statSync(jpg).mtimeMs >= statSync(png).mtimeMs)) return 'data:image/jpeg;base64,' + readFileSync(jpg).toString('base64');
  return 'data:image/png;base64,' + readFileSync(png).toString('base64');
}
const imgs = { iso:'../cad/images/VTOL_Concept_iso.png', fea_boom:'../cad/sim/FEA_Boom_vonMises.png', fea_spar:'../cad/sim/FEA_Spar_vonMises.png', therm_motor:'../cad/sim/THERM_Motor_steady.png' };
const IMG = {}; for (const [k, f] of Object.entries(imgs)) { try { IMG[k] = b64(f); } catch (e) { console.log('missing image', f); } }
// SOLIDWORKS drawing sheets (cad/Drawings.cs) stay PNG: crisp line art at ~20 KB a sheet
for (let i = 1; i <= 12; i++) { try { IMG['drw' + i] = 'data:image/png;base64,' + readFileSync(new URL(`../cad/drawings/DBF-DRW-001_sheet${i}.png`, import.meta.url)).toString('base64'); } catch (e) { if (i <= 5) console.log('missing drawing sheet', i); } }
const BASIS_VER = (r('../docs/DESIGN-BASIS.md').match(/\(v(\d+\.\d+(?:\.\d+)?)/) || [])[1];
if (!BASIS_VER) throw new Error('design-basis version not found');
// flow visualisation data (analysis/aero/flowfield_2d.py, flowfield_3d.py); 3-D trimmed to 4 decimals
const FLOW2 = (() => { const f = new URL('../analysis/aero/out/flowviz/flow2d.json', import.meta.url); if (!existsSync(f)) { console.log('flow2d.json missing'); return null; } const d = JSON.parse(readFileSync(f, 'utf8'));
  // repack the Int16 fields as Int8 for the page (u, v to 1/64 of V∞, Cp to 1/24): finer than the colour ramp resolves, and half the bytes
  const i8 = (b64, from, to) => { const s16 = new Int16Array(Uint8Array.from(Buffer.from(b64, 'base64')).buffer); const o = new Int8Array(s16.length); for (let k = 0; k < s16.length; k++) o[k] = Math.max(-127, Math.min(127, Math.round(s16[k] / from * to))); return Buffer.from(o.buffer).toString('base64'); };
  d.angles.forEach(a => { delete a.cp_wall; a.u = i8(a.u, a.u_scale, 64); a.v = i8(a.v, a.v_scale, 64); a.cp = i8(a.cp, a.cp_scale, 24); a.u_scale = 64; a.v_scale = 64; a.cp_scale = 24; a.int8 = true; });
  return d; })();
const FLOW3 = (() => { const f = new URL('../analysis/aero/out/flowviz/flow3d.json', import.meta.url); if (!existsSync(f)) { console.log('flow3d.json missing'); return null; } const d = JSON.parse(readFileSync(f, 'utf8')); const q = v => Math.round(v * 1e4) / 1e4;
  d.streamlines = d.streamlines.map(l => ({ xyz: l.xyz.map(q), s: l.s.map(v => Math.round(v * 1e3) / 1e3) })); for (const g of Object.values(d.panels)) if (g && g.quads) { g.quads = g.quads.map(qq => qq.map(q)); delete g.gamma; } return d; })();
// thermal fields and findings (cad/Thermal.cs → analysis/thermal/thermal_report.py)
const THERM = (() => { const f = new URL('../analysis/thermal/thermal_results.json', import.meta.url); if (!existsSync(f)) { console.log('thermal_results.json missing'); return null; } return JSON.parse(readFileSync(f, 'utf8')); })();
const MESH = packMesh(); console.log('CAD mesh:', Object.keys(MESH.parts).length, 'parts,', MESH.comps.length, 'components,', MESH.tris, 'triangles');
const html = `<title>Lift + Cruise VTOL Review</title>
<script>try{if(localStorage.getItem('vtol-theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}</script>
<meta name="description" content="Concept-stage engineering design review of a student lift + cruise VTOL">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<meta name="theme-color" content="#0E1116">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=STIX+Two+Text:ital@1&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..24,300,0,0&icon_names=air,architecture,arrow_forward,article,center_focus_strong,compare,dark_mode,description,design_services,download,event,fact_check,flight,flight_takeoff,handyman,info,light_mode,memory,menu,payments,query_stats,scale,science,search,space_dashboard,subdirectory_arrow_right,toys_fan,view_in_ar&display=block">
<style>
${r('./src/style.css')}
</style>
${FLOW2 ? `<script type="application/json" id="flow2dData">${JSON.stringify(FLOW2).replace(/</g, '\\u003c')}</script>` : ''}
${FLOW3 ? `<script type="application/json" id="flow3dData">${JSON.stringify(FLOW3).replace(/</g, '\\u003c')}</script>` : ''}
${THERM ? `<script type="application/json" id="thermData">${js(THERM)}</script>` : ''}
<script type="application/json" id="meshData">${JSON.stringify(MESH).replace(/</g, '\\u003c')}</script>
${r('./src/body.html').replace(/DESIGN-BASIS\.md v\d+\.\d+(?:\.\d+)?/g, 'DESIGN-BASIS.md v' + BASIS_VER).split('{{BASIS_VER}}').join(BASIS_VER)}
<script>const DATA = ${js(data)}; const V02 = ${js(v02)}; const SIM = ${js(sim)}; const AERO = ${js(aero)}; const IMG = ${js(IMG)}; const CADP = ${js(cadp)}; let MESH = null; const MESH_META = ${JSON.stringify({ tris: MESH.tris, comps: MESH.comps.length, files: new Set(Object.keys(MESH.parts).map(k => k.split('~')[0])).size })}; const TRADE = ${js(TRADE)}; const AEROD = ${js(AEROD)}; const TESTS = ${js(TESTS)}; const BUILD = ${js(BUILD)}; const HW = ${js(HW)};</script>
<script>
${r('../analysis/model.js')}
</script>
<script>
${r('./src/cadviewer.js')}
</script>
<script>
${r('./src/flowviz.js')}
${r('./src/shell.js')}
${r('./src/thermviz.js')}
${r('./src/app.js')}
</script>
`;
writeSafe(new URL('./vtol-review.html', import.meta.url), html);
console.log('wrote review/vtol-review.html', html.length, 'bytes');
// Standalone copy for double-click opening from File Explorer (full document skeleton, viewport meta)
const cut = html.indexOf('</style>') + '</style>'.length;
const local = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n'
  + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  + html.slice(0, cut).replace('<style>', '<style>\n[hidden]{display:none!important}')
  + '\n</head><body>\n' + html.slice(cut) + '</body></html>\n';
writeSafe(new URL('../VTOL-Review.html', import.meta.url), local);
console.log('wrote VTOL-Review.html (project root)');

// ---------- companion pages: build manual and test plan, in the review's house style ----------
// Written twice: next to the artifact page (review/, back link "./") and at the project root beside VTOL-Review.html.
const { docPage } = await import('./docpage.mjs');
// numbered review chapters in page order (Report info and Downloads carry data-nonum), for the companion pages' §[id] references
const CHAPTERS = [...r('./src/body.html').matchAll(/<section class="sec" id="([a-z0-9]+)"([^>]*)>/g)].filter(m => !/data-nonum/.test(m[2])).map(m => m[1]);
const fontLink = (html.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/) || [''])[0];
const pages = [['../docs/build/BUILD-MANUAL.md', 'build-manual.html', 'DBF-MAN-001', 'Work instructions'],
               ['../docs/test/TEST-PLAN.md', 'test-plan.html', 'DBF-TP-001', 'Test and evaluation plan'],
               ['../firmware/README.md', 'flight-software.html', 'DBF-SW-001', 'Flight software setup']];
for (const [src, out, docNo, kicker] of pages) {
  const md = r(src), rev = (md.match(/\|\s*Revision\s*\|\s*([A-Z])\b/) || [])[1];
  const no = docNo + (rev ? ' · Rev ' + rev : '');
  // figures embedded as data URIs (the companion pages stay self-contained); paths are relative to the Markdown file
  const img = p => { const f = new URL(p, new URL(src, import.meta.url)); if (!existsSync(f)) return null; const ext = p.split('.').pop().toLowerCase(); return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,` + readFileSync(f).toString('base64'); };
  writeSafe(new URL('./' + out, import.meta.url), docPage({ md, css: r('./src/style.css'), fontLink, docNo: no, kicker, back: './', chapters: CHAPTERS, img }));
  writeSafe(new URL('../' + out, import.meta.url), docPage({ md, css: r('./src/style.css'), fontLink, docNo: no, kicker, back: 'VTOL-Review.html', chapters: CHAPTERS, img }));
  console.log('wrote', out);
}

// ---------- hot-wire template index: the SVGs are 1:1 shop drawings, listed with a preview each ----------
{
  const tdir = new URL('../docs/build/templates/', import.meta.url);
  const svgs = readdirSync(tdir).filter(f => f.endsWith('.svg')).sort();
  const css = r('./src/style.css');
  const nice = f => { const w = f.replace('.svg', '').split('_'); const out = [], name = [];
    for (const t of w) { const n = t.match(/^naca(\d{4})$/i); if (n) out.push('NACA ' + n[1]); else if (/^[AB]$/.test(t)) out.push('half ' + t); else name.push(t); }
    const head = name.join(' '); return [head.charAt(0).toUpperCase() + head.slice(1), ...out].join(', '); };
  const item = (f, pre) => `<li><a href="${pre}${f}"><img src="${pre}${f}" alt="Hot-wire template: ${nice(f)}" loading="lazy"><span>${nice(f)}</span></a></li>`;
  const page = (pre, back) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hot-wire templates</title>
${fontLink}
<style>
${css}
ul.tpl{list-style:none;margin:16px 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(16rem,1fr));gap:16px;max-width:none}
ul.tpl li{max-width:none}
ul.tpl a{display:flex;flex-direction:column;gap:8px;padding:10px;background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);color:var(--fg);text-decoration:none}
ul.tpl a:hover{border-color:var(--fg-2)}
ul.tpl img{display:block;width:100%;height:auto;background:#fff;border-radius:var(--r-s)}
</style></head>
<body><div class="wrap">
<header class="top"><div class="mast"><span class="org"><a class="backlink" href="${back}">← Build manual DBF-MAN-001</a></span><span class="org">WP4, WP6</span></div>
<h1>Hot-wire templates</h1>
<p class="subtitle">Print at 100 % (no fit-to-page), check the 10 mm scale bar and the 100 mm check line, then bond to backing. Sheets wider than the paper come as A and B halves with a 40 mm overlap and registration crosses.</p></header>
<main><ul class="tpl">${svgs.map(f => item(f, pre)).join('')}</ul>
<p class="src">docs/build/templates/make_templates.py, from the chords in cad/params.txt; coordinates in docs/build/templates/section_coordinates.csv</p></main>
</div></body></html>`;
  writeSafe(new URL('./templates.html', import.meta.url), page('docs/build/templates/', 'build-manual.html'));
  writeSafe(new URL('../templates.html', import.meta.url), page('docs/build/templates/', 'build-manual.html'));
  console.log('wrote templates.html', svgs.length, 'templates');
}
