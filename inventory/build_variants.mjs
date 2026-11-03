// §10 "Alternative designs": reads concepts/variants/<id>/{metrics.json,inventory.json,design.md} (+ the packed Fusion overlay meshes from build_fusion.mjs)
// and returns the HTML for the comparison, the variant tabs, the inventory tables and the embedded mesh blocks.
// Every number is read from those files (field names differ per variant, see normalise()); nothing is typed in here except labels.
// Re-runnable: variants are discovered by folder, and a variant's 3D appears as soon as its fusion/variant_manifest.json + stl/ exist.
import { readFileSync, existsSync, readdirSync } from 'fs';

const VROOT = () => process.env.VARIANTS_DIR ? process.env.VARIANTS_DIR.replace(/\/?$/, '/') : new URL('../concepts/variants/', import.meta.url).pathname;
const rj = p => JSON.parse(readFileSync(p, 'utf8'));

// ---------- tiny markdown to HTML (headings, lists, tables, code, bold, italic, links); output is escaped, braces are entity-encoded ----------
const E = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function inlineMd(t){
  const codes = [];
  let s = String(t).replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
  s = E(s);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, a, u) => `<a href="${u}" target="_blank" rel="noopener">${a}</a>`);
  s = s.replace(/\[([^\]]+)\]\(([^)]*)\)/g, '$1');                                   // relative links: keep the text only
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>');
  s = s.replace(/(^|[\s(])\*([^\s*][^*\n]*?)\*(?=[\s).,;:]|$)/g, '$1<i>$2</i>');
  s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${E(codes[+i])}</code>`);
  return s;
}
export function mdToHtml(md){
  const L = md.replace(/\r/g, '').split('\n'); let o = '', i = 0;
  const hd = n => Math.min(6, n + 2);
  const isTbl = k => /^\s*\|.*\|\s*$/.test(L[k] || '') && /^\s*\|[\s:|-]+\|\s*$/.test(L[k + 1] || '');
  const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const listRe = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
  while (i < L.length){
    const l = L[i];
    if (/^\s*$/.test(l)){ i++; continue; }
    if (/^```/.test(l)){ const b = []; i++; while (i < L.length && !/^```/.test(L[i])) b.push(L[i++]); i++; o += `<pre class="mdcode"><code>${E(b.join('\n'))}</code></pre>`; continue; }
    const h = l.match(/^(#{1,6})\s+(.*)$/); if (h){ o += `<h${hd(h[1].length)} class="mdh">${inlineMd(h[2])}</h${hd(h[1].length)}>`; i++; continue; }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(l)){ o += '<hr>'; i++; continue; }
    if (isTbl(i)){
      const head = cells(L[i]); i += 2; const rows = [];
      while (i < L.length && /^\s*\|.*\|\s*$/.test(L[i])) rows.push(cells(L[i++]));
      o += `<div class="tbl"><table><thead><tr>${head.map(c => `<th>${inlineMd(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inlineMd(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; continue;
    }
    if (/^>\s?/.test(l)){ const b = []; while (i < L.length && /^>\s?/.test(L[i])) b.push(L[i++].replace(/^>\s?/, '')); o += `<blockquote>${inlineMd(b.join(' '))}</blockquote>`; continue; }
    if (listRe.test(l)){
      const items = []; while (i < L.length && (listRe.test(L[i]) || (/^\s{2,}\S/.test(L[i]) && items.length))){
        const m = L[i].match(listRe); if (m) items.push({ ind: m[1].length, ord: /\d/.test(m[2]), t: m[3] }); else items[items.length - 1].t += ' ' + L[i].trim(); i++; }
      const build = (a, from, ind) => { let h = '', k = from, ord = a[from].ord; h += ord ? '<ol>' : '<ul>';
        while (k < a.length && a[k].ind >= ind){
          if (a[k].ind > ind){ const [sub, nk] = build(a, k, a[k].ind); h = h.replace(/<\/li>$/, '') + sub + '</li>'; k = nk; continue; }
          h += `<li>${inlineMd(a[k].t)}</li>`; k++; }
        return [h + (ord ? '</ol>' : '</ul>'), k]; };
      let k = 0; while (k < items.length){ const [h2, nk] = build(items, k, items[k].ind); o += h2; k = nk; } continue;
    }
    const p = []; while (i < L.length && !/^\s*$/.test(L[i]) && !/^(#{1,6}\s|```|>\s?)/.test(L[i]) && !listRe.test(L[i]) && !isTbl(i)) p.push(L[i++]);
    o += `<p>${inlineMd(p.join(' '))}</p>`;
  }
  return o.replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
}
const plain = md => String(md).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\s+/g, ' ').trim();
// the first paragraph under a heading, or the paragraph that opens with "**Verdict"
function verdictOf(md, m){
  if (typeof m.verdict === 'string') return m.verdict;
  const paras = md.replace(/\r/g, '').split(/\n\s*\n/);
  const bold = paras.find(p => /^\*\*Verdict\.?\*\*/i.test(p.trim())); if (bold) return plain(bold.trim().replace(/^\*\*Verdict\.?\*\*\s*/i, ''));
  for (const re of [/^#+\s*(\d+\.\s*)?verdict/im, /^#+\s*(\d+\.\s*)?recommendation/im]){
    const mm = re.exec(md); if (!mm) continue;
    const after = md.slice(mm.index + mm[0].length).split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    const first = after.find(s => !/^#/.test(s)); if (first) return plain(first);
  }
  return null;
}
const firstSentences = (t, n) => (t.match(/[^.!?]+[.!?]+(\s|$)/g) || [t]).slice(0, n).join('').trim();

// ---------- field-name normalisation (a1: C0 / "Status vs C0" / "A1 note"; a2: c0 / "Variant status"; a3: c0 / "A3 status") ----------
const c0of = o => o && (o.C0 ?? o.c0);
const stKey = r => Object.keys(r).find(k => k !== 'Status' && /status/i.test(k) && !/date/i.test(k));
const ntKey = r => Object.keys(r).find(k => k !== 'Notes' && /note$/i.test(k));
let nameOf = id => id;
function normalise(id, dir){
  const m = rj(dir + 'metrics.json'), inv = rj(dir + 'inventory.json'), md = existsSync(dir + 'design.md') ? readFileSync(dir + 'design.md', 'utf8') : '';
  const sk = stKey(inv.rows[0]), nk = ntKey(inv.rows[0]);
  const rows = inv.rows.map(r => ({ ...r, st: r[sk], note: nk ? r[nk] : '' }));
  for (const r of rows) if (!['same', 'changed', 'removed', 'new'].includes(r.st)) throw new Error(`${id}: row ${r.ID} has status "${r.st}"`);
  const sm = inv.summary, hd = sm.hardware_delta || {};
  const list = a => (a || []).map(x => ({ id: x.id || null, label: x.spec || x.item, qty: x.qty ?? x.pieces ?? null, joint: x.joint || null, change: x.change || null }));
  const add = list(hd.added), rem = list(hd.removed), mod = list(hd.modified);
  const sumQ = a => a.reduce((t, x) => t + (x.qty || 0), 0);
  const hw = { added: add, removed: rem, modified: mod, moved: hd.moved || null,
    nAdd: hd.added_pieces ?? hd.added_total ?? sumQ(add), nRem: hd.removed_pieces ?? hd.removed_total ?? sumQ(rem),
    base: hd.base_pieces ?? hd.baseline_pieces ?? null, after: hd.pieces_after ?? null, printed: hd.printed_parts_added ?? null };
  return { id, ID: id.toUpperCase(), m, sm, rows, md, hw, verdict: verdictOf(md, m), name: m.name || nameOf(id) };
}

export function buildVariants(ctx){
  const { esc, usd, round2, S, ROWS, reserveTarget, missionMin, c0Pieces, VMESH, c0Names } = ctx;
  const root = VROOT();
  let ids = []; try { ids = readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory() && existsSync(root + d.name + '/metrics.json') && existsSync(root + d.name + '/inventory.json')).map(d => d.name).sort(); } catch (e) {}
  if (!ids.length) return null;
  const CON = rj(new URL('../concepts/concepts.json', import.meta.url).pathname), conOf = id => CON.concepts.find(c => c.id === id) || {};
  nameOf = id => conOf(id).name || id;
  const V = ids.map(id => normalise(id, root + id + '/'));
  const grpA = CON.groups.find(g => g.id === 'A');
  const est = '<span class="est">EST</span>';
  const f = (v, d) => Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const sgn = (v, d, u = '') => (v > 0 ? '+' : v < 0 ? '\u2212' : '\u00b1') + f(Math.abs(v), d) + u;
  const tag = (o) => o && o.est === true ? ' ' + est : '';
  const rangeOf = o => o && (o.range || (o.low != null && o.high != null ? [o.low, o.high] : null));
  const c0 = {   // the C0 column: values the variants carry as their C0 reference (they must agree)
    mass: c0of(V[0].m.mass_kg), sm: c0of(V[0].m.static_margin_pct), hover: c0of(V[0].m.hover_power_W), cruise: c0of(V[0].m.cruise_power_W), end: c0of(V[0].m.endurance_min) };
  for (const v of V){ const m = v.m;   // consistency: the same C0 baseline in every variant, and the C0 money equals the C0 inventory summary
    const chk = (a, b, tol, what) => { if (a != null && b != null && Math.abs(a - b) > tol) throw new Error(`${v.id}: C0 ${what} ${a} disagrees with ${b}`); };
    chk(c0of(m.mass_kg), c0.mass, 0.01, 'mass'); chk(c0of(m.static_margin_pct), c0.sm, 0.1, 'static margin'); chk(c0of(m.hover_power_W), c0.hover, 0.6, 'hover');
    chk(c0of(m.cruise_power_W), c0.cruise, 0.5, 'cruise'); chk(c0of(m.endurance_min), c0.end, 0.1, 'endurance');
    chk(v.sm.C0_committed ?? v.sm.c0_committed ?? v.sm.c0_reference?.committed, S.committed, 0.005, 'committed');
    chk(v.sm.committed, m.cost_usd.value, 0.005, 'committed vs metrics cost'); chk(v.sm.reserve, m.reserve_usd.value, 0.005, 'reserve vs metrics');
    // the inventory rows must add up to the summary
    const goods = round2(v.rows.filter(r => r.Type === 'Buy').reduce((t, r) => t + (+r['Ext USD'] || 0), 0));
    if (Math.abs(goods - v.sm.goods) > 0.011) console.warn(`variant ${v.id}: Buy rows sum to ${goods}, summary goods ${v.sm.goods}`);
    if (Math.abs(round2(v.sm.goods + v.sm.tax + v.sm.shipping) - v.sm.committed) > 0.011) console.warn(`variant ${v.id}: goods + tax + shipping != committed`);
    v.counts = Object.fromEntries(['same', 'changed', 'removed', 'new'].map(k => [k, v.rows.filter(r => r.st === k).length]));
    v.hw.base = v.hw.base ?? c0Pieces; if (v.hw.base !== c0Pieces) console.warn(`variant ${v.id}: hardware base ${v.hw.base} != C0 ${c0Pieces}`);
    v.hw.net = v.hw.nAdd - v.hw.nRem; v.hw.after = v.hw.after ?? v.hw.base + v.hw.net;
  }
  const c0w = V.map(x => c0of(x.m.width_m)).find(x => x != null);
  const sgnUsd = d => (d > 0 ? '+' : d < 0 ? '\u2212' : '\u00b1') + usd(Math.abs(d));
  const reserveOk = r => r >= reserveTarget;
  const riskCls = r => /^low/i.test(r) ? 'ok' : /^high/i.test(r) ? 'bad' : 'warn';
  const dcls = (d, dir) => !d || !dir ? '' : (d * dir > 0 ? ' ok' : ' bad');
  const dl = (d, dir, txt) => `<span class="dl${dcls(d, dir)}">${txt}</span>`;
  const cell = (main, sub, title) => `<td class="n"${title ? ` title="${esc(title)}"` : ''}><span class="nw">${main}</span>${sub ? `<br><small>${sub}</small>` : ''}</td>`;

  // ---------- comparison table ----------
  const num = (m, key, d, u, dir, opt = {}) => {
    const o = m[key], v = o.value, base = c0of(o) ?? opt.base, rg = rangeOf(o);
    const delta = base != null ? round2(v - base) : null;
    const sub = [rg ? `range ${f(rg[0], d)}\u2013${f(rg[1], d)}` : '', delta ? dl(delta, dir, sgn(delta, d, u ? ' ' + u : '')) : ''].filter(Boolean).join(' · ');
    return cell(`${f(v, d)} ${u}${tag(o)}`, sub, o.source);
  };
  const c0cell = (v, d, u) => `<td class="n c0col">${v == null ? '—' : f(v, d) + ' ' + u}</td>`;
  const rowsDef = [];
  const row = (label, c0html, fn, note) => rowsDef.push(`<tr><th scope="row">${label}${note ? `<br><small>${note}</small>` : ''}</th>${c0html}${V.map(fn).join('')}</tr>`);
  row('MTOW', c0cell(c0.mass, 2, 'kg'), v => num(v.m, 'mass_kg', 2, 'kg', -1), 'lower is better');
  row('Static margin', c0cell(c0.sm, 1, '% MAC'), v => num(v.m, 'static_margin_pct', 1, '% MAC', 0));
  row('Span / width', `<td class="n c0col">${f(c0of(V.find(x => c0of(x.m.span_m))?.m.span_m) ?? V[0].m.span_m.value, 2)} / ${f(c0w, 2)} m</td>`,
    v => cell(`${f(v.m.span_m.value, 2)} / ${f(v.m.width_m.value, 2)} m${v.m.width_m.est === true ? ' ' + est : ''}`, v.m.width_m.value > 3 ? 'over the 3 m target' : '', v.m.width_m.formula || v.m.width_m.source), 'target 2\u20133 m span');
  row('Motors', `<td class="n c0col">${c0of(V[0].m.motors)}</td>`, v => cell(`${v.m.motors.value}`, v.m.motors.lift ? `${v.m.motors.lift} lift + ${v.m.motors.cruise} cruise` : '4 lift + 1 pusher', v.m.motors.source || v.m.motors.note));
  row('Hover power', c0cell(c0.hover, 0, 'W'), v => num(v.m, 'hover_power_W', 0, 'W', -1), 'lower is better');
  row('Cruise power', c0cell(c0.cruise, 0, 'W'), v => num(v.m, 'cruise_power_W', 0, 'W', -1), 'lower is better');
  row('Cruise endurance', c0cell(c0.end, 1, 'min'), v => num(v.m, 'endurance_min', 1, 'min', +1), `mission needs ${missionMin} min (R10)`);
  row('Committed cost', `<td class="n c0col">${usd(S.committed)}</td>`, v => { const d = round2(v.sm.committed - S.committed); return cell(usd(v.sm.committed), d ? dl(d, -1, sgnUsd(d)) : dl(0, 0, 'same as C0'), v.m.cost_usd.source); }, `cap ${usd(S.cap, 0)}, tax and shipping included`);
  row('Crash reserve', `<td class="n c0col">${usd(S.reserve)}</td>`, v => cell(usd(v.sm.reserve), `<span class="dl ${reserveOk(v.sm.reserve) ? 'ok' : 'bad'}">${reserveOk(v.sm.reserve) ? 'meets' : 'below'} the $${reserveTarget} target</span>`, v.m.reserve_usd.source), `target \u2265 $${reserveTarget} (R7)`);
  row('Inventory lines vs C0', `<td class="n c0col">${ROWS.length} lines</td>`, v => cell(`${v.rows.length} lines`, `${v.counts.same} same · ${v.counts.changed} changed · ${v.counts.new} new${v.counts.removed ? ' · ' + v.counts.removed + ' removed' : ''}`));
  row('New parts', '<td class="n c0col">—</td>', v => cell(`${v.m.parts_new.value}`, esc(v.m.parts_new.detail || (v.m.parts_new.breakdown ? `${v.m.parts_new.breakdown.printed_parts} printed + ${v.m.parts_new.breakdown.hardware_pieces_installed} hardware pieces` : (v.m.parts_new.hardware_pieces_added ? `CAD occurrences; ${v.m.parts_new.hardware_pieces_added} hardware pieces added separately` : ''))), v.m.parts_new.source), 'counting basis differs, see the note below');
  row('Removed parts', '<td class="n c0col">—</td>', v => cell(`${v.m.parts_removed.value}`, esc(v.m.parts_removed.detail || (v.m.parts_removed.hardware_pieces_removed ? `${v.m.parts_removed.hardware_pieces_removed} hardware pieces removed separately` : '')), v.m.parts_removed.source));
  row('Hardware pieces vs C0', `<td class="n c0col">${c0Pieces} pieces</td>`, v => cell(`${sgn(v.hw.net, 0)} <small>net</small>`, `+${v.hw.nAdd} added / \u2212${v.hw.nRem} removed → ${v.hw.after}`, 'summary.hardware_delta in the variant inventory.json'));
  row('Risk', '<td class="c0col">baseline</td>', v => `<td><span class="chip ${riskCls(v.m.risk)}">${esc(v.m.risk)}</span></td>`);
  row('Verdict', '<td class="c0col">reference</td>', v => `<td class="verdictcell">${esc(firstSentences(v.verdict || '—', 2))}</td>`);
  const compare = `<div class="tbl alttbl-cmp" tabindex="0" role="region" aria-label="Comparison of C0 and the three variants, scrolls sideways"><table><thead><tr><th scope="col">Metric</th><th scope="col" class="n c0col">C0 baseline</th>${V.map(v => `<th scope="col" class="n"><span class="mono">${v.ID}</span> ${esc(v.name)}</th>`).join('')}</tr></thead><tbody>${rowsDef.join('')}</tbody></table></div>`;

  // ---------- two small charts: reserve vs target, endurance vs the mission need ----------
  const W = 880, Lm = 270, Rm = 140, rh = 34;
  const series = [{ k: 'C0', name: 'C0 baseline', reserve: S.reserve, end: c0.end, rg: null, committed: S.committed }, ...V.map(v => ({ k: v.ID, name: `${v.ID} ${v.name}`, reserve: v.sm.reserve, end: v.m.endurance_min.value, rg: rangeOf(v.m.endurance_min), committed: v.sm.committed }))];
  const rmax = Math.ceil(Math.max(...series.map(s => s.reserve), reserveTarget) / 20) * 20 + 20, Hc = series.length * rh + 34;
  const sx = v => Lm + (W - Lm - Rm) * v / rmax;
  const resSvg = `<svg viewBox="0 0 ${W} ${Hc}" role="img" aria-label="Crash reserve under the $${S.cap} cap for C0 and the three variants, against the $${reserveTarget} target"><title>Crash reserve (USD)</title>`
    + [0, 20, 40, 60, 80, 100, 120, 140, 160].filter(t => t <= rmax).map(t => `<line class="grid" x1="${sx(t)}" y1="4" x2="${sx(t)}" y2="${Hc - 24}"/><text x="${sx(t)}" y="${Hc - 8}" text-anchor="middle">$${t}</text>`).join('')
    + series.map((s, i) => { const y = 6 + i * rh, ok = reserveOk(s.reserve);
      return `<text x="${Lm - 10}" y="${y + 20}" text-anchor="end">${esc(s.name.length > 40 ? s.name.slice(0, 39) + '…' : s.name)}</text><rect class="${ok ? 'b-res' : 'b-bad'}" x="${Lm}" y="${y + 5}" width="${(sx(s.reserve) - Lm).toFixed(1)}" height="${rh - 14}"/><text class="val" x="${(sx(s.reserve) + 8).toFixed(1)}" y="${y + 20}">${usd(s.reserve)}</text>`; }).join('')
    + `<line x1="${sx(reserveTarget)}" y1="2" x2="${sx(reserveTarget)}" y2="${Hc - 24}" stroke="var(--ink)" stroke-dasharray="3 3"/></svg>`;
  const emax = Math.ceil(Math.max(...series.map(s => (s.rg ? s.rg[1] : s.end)), missionMin) / 2) * 2 + 2, ex = v => Lm + (W - Lm - Rm) * v / emax;
  const endSvg = `<svg viewBox="0 0 ${W} ${Hc}" role="img" aria-label="Cruise endurance in minutes for C0 and the three variants (estimates, with ranges where given), against the ${missionMin} minute need"><title>Cruise endurance (min, EST)</title>`
    + Array.from({ length: emax / 2 + 1 }, (_, k) => k * 2).map(t => `<line class="grid" x1="${ex(t)}" y1="4" x2="${ex(t)}" y2="${Hc - 24}"/><text x="${ex(t)}" y="${Hc - 8}" text-anchor="middle">${t}</text>`).join('')
    + series.map((s, i) => { const y = 6 + i * rh, cy = y + rh / 2 - 1, ok = (s.rg ? s.rg[0] : s.end) >= missionMin;
      return `<text x="${Lm - 10}" y="${y + 20}" text-anchor="end">${esc(s.name.length > 40 ? s.name.slice(0, 39) + '…' : s.name)}</text>`
        + (s.rg ? `<line stroke="var(--fg-2)" stroke-width="2" x1="${ex(s.rg[0]).toFixed(1)}" y1="${cy}" x2="${ex(s.rg[1]).toFixed(1)}" y2="${cy}"/>` : '')
        + `<circle class="${ok ? 'd-ok' : 'd-bad'}" cx="${ex(s.end).toFixed(1)}" cy="${cy}" r="7"/><text class="val" x="${(ex(s.rg ? s.rg[1] : s.end) + 14).toFixed(1)}" y="${y + 20}">${f(s.end, 1)} min${s.rg ? ` (${f(s.rg[0], 1)}\u2013${f(s.rg[1], 1)})` : ''}</text>`; }).join('')
    + `<line x1="${ex(missionMin)}" y1="2" x2="${ex(missionMin)}" y2="${Hc - 24}" stroke="var(--ink)" stroke-dasharray="3 3"/></svg>`;
  const charts = `<figure class="chart"><figcaption>Crash reserve under the ${usd(S.cap, 0)} cap (USD); dashed line = the $${reserveTarget} target (R7)</figcaption><div class="svgwrap">${resSvg}</div></figure>
<figure class="chart"><figcaption>Cruise endurance (minutes, estimates); dashed line = the ${missionMin} min the mission needs (R10)</figcaption><div class="svgwrap">${endSvg}</div></figure>`;

  // ---------- per variant ----------
  const meshInfo = id => VMESH && VMESH[id] ? VMESH[id] : null;
  const matchRows = (v, name) => {   // mesh body name -> inventory rows whose "CAD part" names it (case, underscores and a trailing _L/_R/_Lx/digit ignored)
    const norm = s => s.toLowerCase().replace(/_(l|r|[lr]\d|l\d|[lr]x|\d+|a|b)$/g, '').replace(/[^a-z0-9]/g, '');
    const nm = norm(name), hit = [];
    for (const r of v.rows){ if (r.st === 'same' || !r['CAD part'] || r['CAD part'] === '—') continue;
      for (const t of String(r['CAD part']).split(/\s*[,/]\s*/)){ const nt = norm(t); if (nt.length >= 4 && (nt === nm || (nm.length >= 6 && (nt.startsWith(nm) || nm.startsWith(nt))))){ hit.push(r.ID); break; } } }
    return hit;
  };
  const META = {}, BLOCKS = [], panels = [], tabs = [];
  const kpiTile = (l, val, sub, cls = '') => `<div class="altk"><div class="l">${l}</div><div class="v ${cls}">${val}</div><div class="s">${sub}</div></div>`;
  const statusChip = s => `<span class="chip st-${s}">${s}</span>`;
  V.forEach((v, vi) => {
    const m = v.m, sm = v.sm, con = conOf(v.id), id = v.id, vmesh = meshInfo(id);
    // rows table
    const trs = v.rows.map(r => {
      const unit = r['Unit USD'] === '' || r['Unit USD'] == null ? null : +r['Unit USD'], ext = r['Ext USD'] === '' || r['Ext USD'] == null ? null : +r['Ext USD'];
      const vend = r.URL ? `<a href="${esc(r.URL)}" target="_blank" rel="noopener">${esc(r.Vendor || 'link')}</a>` : esc(r.Vendor || '—');
      const isEst = r.price_is_estimate === true;
      return `<tr data-st="${r.st}" data-id="${esc(r.ID)}" data-type="${esc(r.Type)}" data-ext="${ext ?? 0}"><td><span class="mono-id">${esc(r.ID)}</span></td><td>${esc(r.Item)}</td><td class="n">${esc(r['Qty needed'])}</td><td class="n hide-s">${unit == null ? '—' : f(unit, 2)}${isEst ? ' ' + est : ''}</td><td class="n">${ext == null ? '—' : f(ext, 2)}</td><td>${vend}</td><td class="hide-s">${esc(r.Kit || '—')}</td><td>${statusChip(r.st)}</td><td class="note">${esc(r.note || '') || '—'}</td></tr>`;
    }).join('');
    const nChg = v.rows.length - v.counts.same;
    const invTable = `<div class="altfilt" role="group" aria-label="Which inventory lines to show"><button type="button" data-altfilt="changes" aria-pressed="true">Changes only (${nChg})</button><button type="button" data-altfilt="all" aria-pressed="false">All lines (${v.rows.length})</button><span class="count" aria-live="polite">${nChg} of ${v.rows.length} lines</span></div>
<div class="tbl" tabindex="0" role="region" aria-label="${v.ID} inventory lines, scrolls sideways"><table class="alttbl changes" data-var="${id}"><thead><tr><th>ID</th><th>Item</th><th class="n">Qty</th><th class="n hide-s">Unit USD</th><th class="n">Ext USD</th><th>Vendor</th><th class="hide-s">Kit</th><th>Status vs C0</th><th>Note</th></tr></thead><tbody>${trs}</tbody>
<tfoot><tr class="total"><td colspan="4" class="lbl">Goods, Buy lines shown</td><td class="n shown">0.00</td><td colspan="4">before tax and shipping; Make lines are $0</td></tr>
<tr class="total"><td colspan="4">Goods, all Buy lines of ${v.ID}</td><td class="n">${f(sm.goods, 2)}</td><td colspan="4">C0 goods ${f(S.goods, 2)}; difference ${sgnUsd(round2(sm.goods - S.goods))}</td></tr></tfoot></table></div>`;
    // budget waterfall for this variant (same look as §6)
    const wf = [['Goods (Buy lines)', 0, sm.goods, 'b-goods'], [`Sales tax ${(sm.taxRate * 100).toFixed(2)} %`, sm.goods, sm.goods + sm.tax, 'b-tax'], ['Shipping allowance (EST)', sm.goods + sm.tax, sm.committed, 'b-ship'], ['Committed', 0, sm.committed, 'b-goods'], ['Reserve to cap', sm.committed, sm.cap, reserveOk(sm.reserve) ? 'b-res' : 'b-bad']];
    const WW = 880, WL = 190, WR = 110, wrh = 30, WH = wf.length * wrh + 26, wsc = x => WL + (WW - WL - WR) * x / sm.cap;
    const wfSvg = `<svg viewBox="0 0 ${WW} ${WH}" role="img" aria-label="${v.ID} budget: goods, tax, shipping, committed spend and the reserve under the $${sm.cap} cap"><title>${v.ID}: goods, tax, shipping, committed, reserve</title>`
      + wf.map(([k, a, b, c], i) => { const y = 6 + i * wrh; return `<text x="${WL - 10}" y="${y + 18}" text-anchor="end">${esc(k)}</text><rect class="${c}" x="${wsc(a).toFixed(1)}" y="${y + 3}" width="${Math.max(1, wsc(b) - wsc(a)).toFixed(1)}" height="${wrh - 9}"/><text class="val" x="${(wsc(b) + 8).toFixed(1)}" y="${y + 18}">${usd(round2(b - a))}</text>`; }).join('')
      + `<line x1="${wsc(sm.cap).toFixed(1)}" y1="2" x2="${wsc(sm.cap).toFixed(1)}" y2="${WH - 16}" stroke="var(--ink)" stroke-dasharray="3 3"/><text x="${wsc(sm.cap).toFixed(1)}" y="${WH - 3}" text-anchor="end">cap ${usd(sm.cap, 0)}</text></svg>`;
    // hardware delta
    const hwList = (a, none) => a.length ? `<ul class="tight hwdelta">${a.map(x => `<li>${x.qty != null ? `<b>${x.qty} ×</b> ` : ''}${esc(x.label)}${x.id ? ` <span class="mono-id">${esc(x.id)}</span>` : ''}${x.joint ? ` <small>(joint ${esc(x.joint)})</small>` : ''}</li>`).join('')}</ul>` : `<p class="small">${none}</p>`;
    const hwHtml = `<div class="hwgrid"><div><h5>Added <span class="chip st-new">+${v.hw.nAdd}</span></h5>${hwList(v.hw.added, 'None.')}</div><div><h5>Removed <span class="chip ${v.hw.nRem ? 'st-removed' : 'st-same'}">\u2212${v.hw.nRem}</span></h5>${hwList(v.hw.removed, 'None.')}</div></div>`
      + (v.hw.modified.length ? `<p class="small"><b>Modified:</b> ${v.hw.modified.map(x => `${esc(x.id)}: ${esc(x.change)}`).join('; ')}</p>` : '')
      + (v.hw.moved ? `<p class="small"><b>Moved:</b> ${esc(v.hw.moved)}</p>` : '')
      + `<p class="small">Net ${sgn(v.hw.net, 0)} pieces: ${v.hw.base} in C0 → ${v.hw.after}.${v.hw.printed ? ` Printed parts added: ${v.hw.printed}.` : ''}</p>`;
    // 3D
    let viewer;
    if (vmesh && vmesh.parts.length){
      const names = vmesh.hide, nvar = vmesh.parts.length;
      for (const p of vmesh.parts) p.rw = matchRows(v, p.n);
      BLOCKS.push(`<script type="application/json" id="variantData-${id}">${JSON.stringify(vmesh).replace(/</g, '\\u003c')}</script>`);
      viewer = `<div class="v3dgrid"><div class="viewer cadview fview altviewer" id="av-${id}" data-card="avcard-${id}" data-var="${id}">
  <canvas aria-label="Rotatable Autodesk Fusion model of ${v.ID}: the C0 aircraft with this variant's new and changed parts; drag to orbit, scroll to zoom, click a part for its card"></canvas>
  <span class="lbl">Autodesk Fusion · ${esc(vmesh.doc || id)}</span><div class="tip" hidden></div>
  <div class="fvstart"><p>${nvar} new or changed bod${nvar > 1 ? 'ies' : 'y'} (${vmesh.tris.toLocaleString('en-US')} triangles) on top of the C0 model${names.length ? `, with ${names.length} C0 bod${names.length > 1 ? 'ies' : 'y'} hidden` : ''}. It takes a few seconds to build.</p><button type="button" class="altload" data-var="${id}">Load the 3D model</button></div>
  <div class="fallback" hidden><p>The 3D viewer needs an internet connection to load its graphics library (three.js).</p></div><p class="loadmsg">Building the ${v.ID} model…</p>
  <div class="ctl" role="group" aria-label="${v.ID} model controls" hidden>
    <div class="grp" role="group" aria-label="Changes"><button type="button" data-vact="hl" aria-pressed="true">Highlight changes</button>${names.length ? '<button type="button" data-vact="removed" aria-pressed="false">Show removed C0 parts</button>' : ''}</div>
    <div class="grp" role="group" aria-label="C0 groups"><span class="glabel">C0 groups</span><button type="button" data-vgroup="airframe" aria-pressed="true">Airframe</button><button type="button" data-vgroup="printed" aria-pressed="true">Printed</button><button type="button" data-vgroup="propulsion" aria-pressed="true">Propulsion</button><button type="button" data-vgroup="gear" aria-pressed="true">Gear</button><button type="button" data-vgroup="electronics" aria-pressed="true">Electronics</button><button type="button" data-vgroup="hardware" aria-pressed="false">Hardware</button><button type="button" data-vgroup="mechanisms" aria-pressed="false">Servos</button></div>
    <div class="grp" role="group" aria-label="Camera view"><span class="glabel">View</span><button type="button" data-vview="changes">Zoom to changes</button><button type="button" data-vview="iso">Iso</button><button type="button" data-vview="top">Top</button><button type="button" data-vview="side">Side</button><button type="button" data-vview="front">Front</button><button type="button" data-vact="reset">Reset</button></div>
    <p class="altlegend"><i class="sw sw-acc"></i> new or changed in ${v.ID} <i class="sw sw-c0"></i> C0, unchanged (ghosted while highlighting)${names.length ? ' <i class="sw sw-rm"></i> C0 part removed or replaced' : ''}</p>
  </div></div>
  <aside class="pcard" id="avcard-${id}" aria-live="polite" aria-label="Selected part card"></aside></div>
  <ul class="altparts" aria-label="New and changed bodies in ${v.ID}"></ul>
  <p class="meta">${nvar} new or changed bod${nvar > 1 ? 'ies' : 'y'}; hides ${names.length ? names.map(n => `<code>${esc(n)}</code>`).join(', ') : 'nothing from C0'}. Meshes: <code>concepts/variants/${id}/fusion/stl/</code>, packed on the same grid as C0 (${(vmesh.bytes / 1024).toFixed(0)} KB).${vmesh.missing ? ` ${vmesh.missing} listed STL file(s) were missing and are left out.` : ''}</p>`;
    } else {
      viewer = `<div class="altnomodel" role="status"><b>3D model being built in Fusion</b><p>The ${v.ID} meshes are not in the repo yet (<code>concepts/variants/${id}/fusion/variant_manifest.json</code>). Rebuild the page with <code>node inventory/build_overview.mjs</code> once they land: the viewer appears with no other change. Until then the inventory table, the hardware delta and the design note below carry the geometry.</p></div>`;
    }
    // summary + kpis
    const srcLink = (con.source || []).find(s => /^https?:/.test(s)), srcTxt = (con.source || [])[0];
    const lit = con.claim ? `Literature claim: <i>${esc(con.claim)}</i> ${srcLink ? `<a href="${esc(srcLink)}" target="_blank" rel="noopener">${esc(srcTxt)}</a>` : esc(srcTxt || '')}` : '';
    const dm = round2(m.mass_kg.value - c0.mass), pct = (a, b) => ((a / b - 1) * 100);
    const cr = m.cruise_power_W.value, c0cr = c0of(m.cruise_power_W);
    const sumP = `<p>${esc(con.what || '')} ${esc(con.note || '')} ${lit}</p>
<p><b>On this aircraft</b> ${est}: MTOW ${f(m.mass_kg.value, 2)} kg (${sgn(dm, 2, ' kg')}), hover ${f(m.hover_power_W.value, 0)} W (${sgn(pct(m.hover_power_W.value, c0of(m.hover_power_W)), 0, ' %')}), cruise ${f(cr, 0)} W (${sgn(pct(cr, c0cr), 1, ' %')}), cruise endurance ${f(m.endurance_min.value, 1)} min against ${missionMin} needed, committed ${usd(sm.committed)} and reserve ${usd(sm.reserve)} (${reserveOk(sm.reserve) ? 'meets' : 'below'} the $${reserveTarget} target).</p>`;
    const bl = v.verdict ? `<p class="verdict altbl"><b>Bottom line.</b> ${esc(firstSentences(v.verdict, 3))}</p>` : '';
    const ek = m.endurance_min.value, ekc = ek >= missionMin * 1.1 ? 'ok' : ek >= missionMin ? 'warn' : 'bad';
    const kp = `<div class="altkpis">${[
      kpiTile('MTOW', `${f(m.mass_kg.value, 2)} <small>kg</small>`, `C0 ${f(c0.mass, 2)} · ${sgn(dm, 2, ' kg')}${tag(m.mass_kg)}`),
      kpiTile('Static margin', `${f(m.static_margin_pct.value, 1)} <small>% MAC</small>`, `C0 ${f(c0.sm, 1)}${rangeOf(m.static_margin_pct) ? ` · range ${f(rangeOf(m.static_margin_pct)[0], 1)}\u2013${f(rangeOf(m.static_margin_pct)[1], 1)}` : ''}${tag(m.static_margin_pct)}`),
      kpiTile('Hover power', `${f(m.hover_power_W.value, 0)} <small>W</small>`, `C0 ${f(c0.hover, 0)} · ${sgn(pct(m.hover_power_W.value, c0of(m.hover_power_W)), 0, ' %')}${tag(m.hover_power_W)}`),
      kpiTile('Cruise power', `${f(cr, 0)} <small>W</small>`, `C0 ${f(c0cr, 0)} · ${sgn(pct(cr, c0cr), 1, ' %')}${tag(m.cruise_power_W)}`),
      kpiTile('Cruise endurance', `${f(ek, 1)} <small>min</small>`, `C0 ${f(c0.end, 1)} · need ${missionMin}${tag(m.endurance_min)}`, ekc),
      kpiTile('Committed / reserve', `${usd(sm.committed)}`, `reserve ${usd(sm.reserve)} · ${reserveOk(sm.reserve) ? 'meets' : 'below'} the $${reserveTarget} target`, reserveOk(sm.reserve) ? 'ok' : 'bad'),
      kpiTile('Hardware pieces', `${sgn(v.hw.net, 0)}`, `+${v.hw.nAdd} / \u2212${v.hw.nRem} vs ${v.hw.base}`)].join('')}</div>`;
    const riskP = `<p><span class="chip ${riskCls(m.risk)}">risk: ${esc(m.risk)}</span> ${esc(m.risk_basis || '')} ${m.trl_note ? `<br><small>${esc(m.trl_note)}</small>` : ''}</p>`;
    const mdHtml = v.md ? `<details class="more altnote"><summary>Read the design note</summary><div class="md">${mdToHtml(v.md)}</div><p class="src">concepts/variants/${id}/design.md</p></details>` : '';
    const srcs = `<p class="src">concepts/variants/${id}/metrics.json (every figure; each carries its own source and EST flag, shown on hover in the table), inventory.json (rows, summary: goods ${f(sm.goods, 2)}, tax ${f(sm.tax, 2)}, shipping ${f(sm.shipping, 2)}, committed ${f(sm.committed, 2)}), design.md; concepts/concepts.json ${id} (what, claim, source)</p>`;
    tabs.push(`<button type="button" role="tab" id="tab-${id}" aria-selected="${vi === 0}" aria-controls="alt-${id}" tabindex="${vi === 0 ? 0 : -1}" data-alt="${id}"><span class="mono">${v.ID}</span> ${esc(v.name)}</button>`);
    panels.push(`<div role="tabpanel" id="alt-${id}" class="altpanel" aria-labelledby="tab-${id}" tabindex="0"${vi === 0 ? '' : ' hidden'}>
<h4>${v.ID}: ${esc(v.name)}</h4>${bl}${sumP}${kp}
<h4>3D model</h4>${viewer}
<h4>Inventory lines</h4><p class="small">${v.rows.length} lines: ${v.counts.same} same as C0, ${v.counts.changed} changed, ${v.counts.new} new, ${v.counts.removed} removed.${sm.removed_note ? ' ' + esc(sm.removed_note) : ''}</p>${invTable}
<h4>Budget</h4><figure class="chart"><figcaption>${v.ID}: goods, tax, shipping, committed, reserve (USD)</figcaption><div class="svgwrap">${wfSvg}</div></figure>
<p class="small">${esc(sm.shipping_note || '')}${sm.unquoted ? ' Not yet quoted (—): ' + esc(sm.unquoted.join('; ')) + '.' : ''}</p>
<h4>Hardware delta</h4>${hwHtml}
<h4>Risk and maturity</h4>${riskP}
${mdHtml}${srcs}</div>`);
    META[id] = { name: v.name, built: !!(vmesh && vmesh.parts.length), rows: Object.fromEntries(v.rows.filter(r => r.st !== 'same').map(r => [r.ID, { id: r.ID, item: r.Item, qty: +r['Qty needed'] || 0, unit: r['Unit USD'] === '' || r['Unit USD'] == null ? 0 : +r['Unit USD'], ext: +r['Ext USD'] || 0 }])) };
  });
  const tabsHtml = `<div class="alttabs" role="tablist" aria-label="Alternative designs, one tab each">${tabs.join('')}</div>${panels.join('\n')}`;
  const built = ids.filter(id => META[id].built);

  // ---------- section text ----------
  const lede = `<b>${['Zero','One','Two','Three','Four','Five','Six'][V.length] || V.length} of the group A concepts, built out as full variants of C0.</b> ${V.map(v => `<b>${v.ID}</b> ${esc(v.name.toLowerCase())}: ${esc(firstSentences(v.verdict || '', 1).replace(/\.$/, '').replace(/^./, c => c.toLowerCase()))}`).join('; ')}.`;
  const why = `<p>The concept page (<a href="Concept-Models.html">Concept-Models.html</a>, by James Guymon) sorts literature concepts into three groups. Group A, “${esc(grpA.title)}”, is the least experimental: it keeps the lift rotors for hover and the fixed wing and pusher for cruise, so the lift-and-cruise architecture, the span, the lift motors and the flight controller stay C0's, and each change is one subsystem. Concepts a1, a2 and a3 are the three group A ideas with a published or physical basis for a drag or power gain (Sinnige 2019 for wingtip props, IMAV 2017 for boundary-layer ingestion, the project's own drag estimate for the stopped rotors). Each was then costed line by line against the C0 inventory, sized with the C0 model (analysis/model.js, results.json), and drawn in Fusion on top of the C0 model so the new parts can be checked against the hardware already there.</p>`;
  const notes = `<ul class="tight"><li><b>Everything but cost is an estimate.</b> Mass, power, endurance and static margin come from the C0 sizing model with each variant's changes; cells tagged ${est} say so in their own source field (hover a cell for it). Prices are checked on the date in each design note; an unquoted shipping cost is “—”, not $0.</li>
<li><b>Same C0 baseline everywhere.</b> The C0 column is the reference value carried by every variant's metrics.json (they agree), and its money is the C0 inventory summary: ${usd(S.committed)} committed, ${usd(S.reserve)} reserve.</li>
<li><b>“New parts” is counted three ways.</b> a1 counts CAD occurrences (its hardware pieces are listed separately), a2 counts 3 CAD parts plus 20 hardware pieces, a3 counts 12 printed parts plus 84 hardware pieces. Compare the “Hardware pieces vs C0” row, which uses the hardware schedule's own piece count (${c0Pieces}), not the “New parts” row.</li>
<li><b>Width</b> is the overall width: the span (2.40 m) unless something sticks out further, as a1's tip propeller discs do (2.81 m, under the 3 m limit).</li>
<li><b>Reserve against its target.</b> The R7 target is $${reserveTarget}. A variant below it still fits under the cap but spends the crash reserve first.</li></ul>`;
  const meshNote = built.length === V.length ? `All ${V.length} variants have a 3D model.` : built.length ? `3D models available now: ${built.map(i => i.toUpperCase()).join(', ')}; the others are being built in Fusion and appear on the next page build.` : 'The Fusion exports for the variants are being produced; each 3D viewer appears on the next page build after its files land.';
  return {
    ids, built, META, blocks: BLOCKS.join('\n'), count: V.length,
    T: { ALT_LEDE: lede, ALT_WHY: why, ALT_COMPARE: compare, ALT_CHARTS: charts, ALT_TABS: tabsHtml, ALT_NOTES: notes, ALT_MESHNOTE: esc(meshNote), ALT_N: V.length, ALT_IDS: V.map(v => v.ID).join(', '), ALT_ONELINE: V.map(v => `${v.ID} ${esc(v.name.toLowerCase())}`).join(', ') },
    summary: V.map(v => ({ id: v.id, committed: v.sm.committed, reserve: v.sm.reserve, rows: v.rows.length, counts: v.counts }))
  };
}
