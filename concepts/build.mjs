// Builds Concept-Models.html: the eleven literature VTOL concepts as interactive 3D models on the C0 envelope.
// Geometry comes from cad/params.txt (written by cad/params.mjs from analysis/results.json) and analysis/results.json;
// concept text and sources from concepts/concepts.json; the 3D builders are concepts/models.js.
// Run: node concepts/build.mjs   ->   Concept-Models.html
import { readFileSync, writeFileSync } from 'fs';

const here = new URL('./', import.meta.url), root = new URL('../', import.meta.url);
const R = JSON.parse(readFileSync(new URL('analysis/results.json', root)));
const P = {}, comp = {};
for (const line of readFileSync(new URL('cad/params.txt', root), 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i < 0) continue;
  const k = line.slice(0, i), v = line.slice(i + 1);
  if (k === 'comp') { const [n, x, y, z] = v.split('|'); (comp[n] ||= []).push([+x, +y, +z]); }
  else P[k] = Number.isNaN(+v) ? v : +v;
}
const c0 = R.concepts.C0, g = c0.geo, first = n => comp[n][0];
const SPAN_MAX = 3.0;   // CLAUDE.md: target 2–3 m span
const geo = {
  half_span: R.base.span / 2, chord: P.chord, tc: P.tc, camber: 0.02,           // NACA 2415 (cad/params.mjs)
  saddle_half: P.fusR, aileron_in: first('Aileron_R')[2],
  boom_x: Math.abs(first('Boom_Front')[2]), boom_y: P.yB, boom_r: P.boomOD / 2, boom_x0: g.booms[0].x0, boom_x1: g.booms[0].x1,
  rotor_front: g.xFront, rotor_rear: g.xRear, lift_d: g.D, prop_y: first('Lift_Prop')[1],
  push_d: P.pushProp, push_x: first('Pusher_Prop_14in')[0],
  pod_nose: first('Fuselage_Pod')[0], pod_len: P.fusL, pod_r: P.fusR, pod_y: first('Fuselage_Pod')[1], canopy_x: first('Canopy')[0],
  tail_x: first('H_Tail')[0], h_y: first('H_Tail')[1], h_span: P.hSpan, h_chord: P.hC, v_h: P.vH, v_c: P.vC,
  leg_x: [...new Set(comp.Landing_Leg.map(p => p[0]))], leg_len: P.legLen, leg_r: P.legOD / 2, ground_y: first('Landing_Leg')[1],
  batt: [P.battL, P.battH, P.battW], batt_x: first('Battery_6S_LiPo')[0], batt_y: first('Battery_6S_LiPo')[1],
  span_max: SPAN_MAX,
};
const data = JSON.parse(readFileSync(new URL('concepts.json', here)));
const SIZED = new Set(['a0', 'a1', 'a2', 'a3', 'b1', 'b3', 'c2', 'c3']);   // concepts that keep the C0 two-panel wing
const part = `Wing panels ${P.panelLen.toFixed(2)} m, front booms ${P.segF.toFixed(3)} m (longest piece ${g.longestPiece} m)`;
const concepts = data.concepts.map(c => ({ ...c, code: c.id.toUpperCase(),
  largest_part: SIZED.has(c.id) ? part : 'Not sized for this concept' }));
const js = readFileSync(new URL('models.js', here), 'utf8');
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const payload = JSON.stringify({ geo, concepts }).replace(/</g, '\\u003c');
const picker = data.groups.map(gr => `<div class="pick-g"><span class="lbl">${esc(gr.id)} · ${esc(gr.title)}</span>` +
  data.concepts.filter(c => c.group === gr.id).map(c =>
    `<button type="button" data-concept="${c.id}" aria-pressed="false"><b>${c.id.toUpperCase()}</b>${esc(c.name)}</button>`).join('') +
  '</div>').join('');
const m = c0.sized.m;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Concept Models</title>
<meta name="description" content="Eleven literature VTOL concepts as interactive 3D models on the C0 envelope">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600&family=Red+Hat+Mono:wght@400;500&family=Sofia+Sans+Semi+Condensed:wght@700&family=Source+Sans+3:wght@400;600&display=swap">
<style>
:root{
  --orange:#b8481b;--ink:#16191d;--graphite:#474e57;--pencil:#6c737c;--vellum:#fbfbfa;--sheet:#ffffff;
  --tint:#f4f5f6;--tint2:#eceef0;--hairline:#e3e5e8;--frame:#cbcfd4;--met:#23744a;--met-wash:#e7f2ec;
  --risk:#94600a;--risk-wash:#f6efe1;--feature:#2f5d8a;--stage:#f4f5f6;
  --f-display:"Sofia Sans Semi Condensed","Barlow Semi Condensed","Arial Narrow",sans-serif;
  --f-head:"Barlow Semi Condensed","Arial Narrow","Helvetica Neue",Arial,sans-serif;
  --f-body:"Source Sans 3","Segoe UI",system-ui,-apple-system,sans-serif;
  --f-mono:"Red Hat Mono",ui-monospace,Consolas,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --orange:#ec8a58;--ink:#e6e8ea;--graphite:#b2b8bf;--pencil:#89909a;--vellum:#111315;--sheet:#16191c;
  --tint:#1c2024;--tint2:#23282d;--hairline:#2a2f35;--frame:#3a4048;--met:#6cc595;--met-wash:#15261d;
  --risk:#dcae5a;--risk-wash:#2a2213;--feature:#7fa8d1;--stage:#1c2024;color-scheme:dark}}
:root[data-theme="dark"]{
  --orange:#ec8a58;--ink:#e6e8ea;--graphite:#b2b8bf;--pencil:#89909a;--vellum:#111315;--sheet:#16191c;
  --tint:#1c2024;--tint2:#23282d;--hairline:#2a2f35;--frame:#3a4048;--met:#6cc595;--met-wash:#15261d;
  --risk:#dcae5a;--risk-wash:#2a2213;--feature:#7fa8d1;--stage:#1c2024;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--vellum);color:var(--ink);font:16px/1.6 var(--f-body);font-variant-numeric:tabular-nums}
::selection{background:#f7ece6;color:#16191d}
a{color:inherit;text-decoration-color:var(--orange);text-underline-offset:3px}
a:hover{color:var(--orange)}
:focus-visible{outline:2px solid var(--orange);outline-offset:2px}
.wrap{max-width:1360px;margin:0 auto;padding-block:24px 56px;padding-left:max(24px,env(safe-area-inset-left,0px));padding-right:max(24px,env(safe-area-inset-right,0px));display:grid;gap:26px}
.lbl{font:500 12px/1.3 var(--f-mono);letter-spacing:.07em;text-transform:uppercase;color:var(--pencil)}
.tb{border-top:2px solid var(--ink);display:grid;grid-template-columns:2fr repeat(4,minmax(0,1fr));border-bottom:1px solid var(--frame)}
.tb>div{padding:10px 14px 12px;border-left:1px solid var(--hairline);min-width:0}
.tb>div:first-child{border-left:0;padding-left:0}
.tb h1{margin:2px 0 0;font:700 42px/1.05 var(--f-display);letter-spacing:-.01em}
.tb .v{display:block;font:600 18px/1.25 var(--f-head);margin-top:4px;overflow-wrap:anywhere}
.tb .v code{font:400 13px var(--f-mono)}
.lede{margin:0;max-width:75ch;font-size:18px;line-height:1.62;color:var(--graphite)}
.picker{display:grid;gap:10px}
.pick-g{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.pick-g .lbl{min-width:220px}
.pick-g button{height:44px;padding:0 14px;font:600 16px var(--f-head);color:var(--graphite);background:var(--sheet);border:1px solid var(--frame);border-radius:2px;cursor:pointer}
.pick-g button b{font:500 12px var(--f-mono);letter-spacing:.07em;color:var(--pencil);margin-right:6px}
.pick-g button:hover{border-color:var(--ink);color:var(--ink)}
.pick-g button[aria-pressed=true]{background:var(--ink);border-color:var(--ink);color:var(--sheet)}
.pick-g button[aria-pressed=true] b{color:var(--sheet)}
.view{border-top:2px solid var(--ink);padding-top:18px;display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:22px;align-items:start}
.stage{position:relative;height:clamp(380px,64vh,680px);border:1px solid var(--frame);border-radius:2px;overflow:hidden;background:var(--stage)}
.stage canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}
.stage canvas:active{cursor:grabbing}
.stage .fallback{display:none}
.stage.failed canvas{display:none}
.stage.failed .fallback{display:block;margin:0;padding:24px}
.hint{position:absolute;left:10px;bottom:10px;margin:0;padding:3px 8px;background:var(--sheet);border:1px solid var(--hairline);border-radius:2px;font:400 12px var(--f-mono);color:var(--pencil)}
.btn{height:44px;padding:0 16px;font:600 15px var(--f-head);background:var(--sheet);color:var(--graphite);border:1px solid var(--frame);border-radius:2px;cursor:pointer}
.btn:hover{border-color:var(--ink);color:var(--ink)}
.btn.ink{background:var(--ink);color:var(--sheet);border-color:var(--ink)}
#reset{position:absolute;right:10px;bottom:10px;height:36px}
.side{display:grid;gap:16px;min-width:0}
.side h2{margin:0;font:600 30px/1.15 var(--f-head);letter-spacing:-.005em;text-wrap:balance}
.side p{margin:0}
#m-what{font:600 18px/1.35 var(--f-head)}
#m-note{color:var(--graphite)}
.claim{border-top:1px solid var(--hairline);padding-top:10px;font-size:14px;color:var(--graphite)}
.claim a{font:400 13px var(--f-mono)}
.modes{border-top:2px solid var(--ink);padding-top:10px;display:grid;gap:10px}
.modes .row{display:flex;gap:6px;flex-wrap:wrap}
.modes label{display:flex;justify-content:space-between}
#mode-val{font:600 15px var(--f-head);color:var(--ink);text-transform:none;letter-spacing:0}
input[type=range]{width:100%;accent-color:var(--orange)}
.toggles{display:grid;gap:4px;font-size:15px}
.toggles input{accent-color:var(--orange);margin-right:8px}
.stats{border-top:2px solid var(--ink);margin:0;display:grid;grid-template-columns:auto minmax(0,1fr)}
.stats dt,.stats dd{margin:0;padding:7px 0;border-bottom:1px solid var(--hairline)}
.stats dt{font:500 12px/1.9 var(--f-mono);letter-spacing:.07em;text-transform:uppercase;color:var(--pencil);padding-right:14px}
.stats dd{font-weight:600}
.checks{display:grid;gap:6px;justify-items:start}
.chip{font:500 12px/1.3 var(--f-mono);letter-spacing:.07em;text-transform:uppercase;padding:4px 6px;border-radius:2px}
.chip-met{color:var(--met)}.chip-risk{color:var(--risk);background:var(--risk-wash)}
.key{display:flex;flex-wrap:wrap;gap:4px 18px;margin:0;padding:0;list-style:none;font-size:14px;color:var(--graphite)}
.key i{display:inline-block;width:12px;height:12px;margin-right:6px;vertical-align:-1px;border:1px solid var(--frame)}
.foot{border-top:1px solid var(--frame);padding-top:12px;font-size:14px;color:var(--graphite);display:grid;gap:4px}
.foot p{margin:0;max-width:110ch}
.foot code{font:400 13px var(--f-mono)}
@media (max-width:1000px){.view{grid-template-columns:minmax(0,1fr)}.tb{grid-template-columns:repeat(2,minmax(0,1fr))}.tb>div:first-child{grid-column:1/-1}.tb>div:nth-child(2){border-left:0;padding-left:0}}
@media (max-width:600px){.wrap{padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}.tb h1{font-size:32px}.pick-g .lbl{min-width:0;width:100%}.stage{height:clamp(320px,56vh,480px)}.hint{display:none}}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style>
</head>
<body>
<div class="wrap">
  <header class="tb">
    <div><span class="lbl">Interactive 3D</span><h1>Concept Models</h1></div>
    <div><span class="lbl">Baseline</span><span class="v">C0 v0.3.1, ${m.toFixed(2)} kg</span></div>
    <div><span class="lbl">Geometry</span><span class="v"><code>cad/params.txt</code> · <code>analysis/results.json</code></span></div>
    <div><span class="lbl">Literature checked</span><span class="v">${esc(data.checked)}</span></div>
    <div><span class="lbl">Scope</span><span class="v">Illustrative, not CAD</span></div>
  </header>
  <p class="lede">Eleven VTOL concepts from the literature, each built on the C0 envelope: the same ${(2 * geo.half_span).toFixed(1)} m wing, pod, twin booms at ±${geo.boom_x.toFixed(3)} m, ${(geo.lift_d / 0.0254).toFixed(0)} in lift props and ${(geo.push_d / 0.0254).toFixed(0)} in pusher, so they compare like for like. A0 is C0 as placed in the CAD parameters. Orbit, scrub from hover to cruise, and read the checks.</p>
  <nav class="picker" aria-label="Concepts">${picker}</nav>
  <section class="view" aria-labelledby="m-name">
    <div class="stage" id="stage">
      <canvas id="cv" aria-label="3D model of the selected concept; drag to orbit, scroll to zoom"></canvas>
      <p class="fallback" id="fallback"></p>
      <p class="hint">Drag to orbit · scroll or pinch to zoom · right-drag to pan</p>
      <button type="button" class="btn" id="reset">Reset view</button>
    </div>
    <div class="side">
      <h2 id="m-name">Loading…</h2>
      <p id="m-what"></p>
      <p id="m-note"></p>
      <p class="claim"><span id="m-claim"></span><br><a id="m-src" href="#"></a></p>
      <div class="modes">
        <label for="mode" class="lbl">Flight mode <span id="mode-val">Hover</span></label>
        <input type="range" id="mode" min="0" max="100" value="0">
        <div class="row"><button type="button" class="btn" id="hover">Hover</button><button type="button" class="btn" id="cruise">Cruise</button><button type="button" class="btn ink" id="play" aria-pressed="false">Play transition</button></div>
      </div>
      <div class="toggles">
        <label><input type="checkbox" id="t-batt" checked>Battery, 6S 6500 pack (box size EST)</label>
        <label><input type="checkbox" id="t-env" checked>${SPAN_MAX.toFixed(1)} m span limit on the ground (CLAUDE.md 2–3 m)</label>
      </div>
      <dl class="stats">
        <dt>Wingspan</dt><dd id="s-span">—</dd>
        <dt>Overall width</dt><dd id="s-width">—</dd>
        <dt>Overall length</dt><dd id="s-len">—</dd>
        <dt>Motors and fans</dt><dd id="s-motors">—</dd>
        <dt>Tilt mechanisms</dt><dd id="s-tilt">—</dd>
        <dt>Largest part</dt><dd id="s-part">—</dd>
      </dl>
      <div class="checks"><span class="chip chip-met">Wingspan within 2–3 m</span><span class="chip chip-met" id="c-width">—</span></div>
      <ul class="key"><li><i style="background:var(--feature)"></i>What makes this concept different</li><li><i style="background:#e8ebee"></i>Shared with C0</li></ul>
    </div>
  </section>
  <footer class="foot">
    <p>A0 uses the C0 placements in <code>cad/params.txt</code> (wing, pod, booms, rotor stations, H-tail, pusher, gear) and the sizing in <code>analysis/results.json</code>. The other ten concepts reuse those parts and change only what the concept changes; their own proportions are estimates (EST), and none of them is sized. Overall width includes the rotor disks.</p>
    <p>Claims are quoted from each source's abstract or summary, checked ${esc(data.checked)}. They show each concept's potential, not a prediction for this aircraft.</p>
    <p>Rebuild with <code>node concepts/build.mjs</code> (sources in <code>concepts/</code>).</p>
  </footer>
</div>
<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js"></script>
<script>window.CONCEPT_MODELS = ${payload};</script>
<script>
${js}
</script>
</body>
</html>
`;
writeFileSync(new URL('Concept-Models.html', root), html);
console.log(`Concept-Models.html written (${concepts.length} concepts, span ${(2 * geo.half_span).toFixed(1)} m)`);
