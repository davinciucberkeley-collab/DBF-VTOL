// Companion pages for the review (build manual, test plan): renders the repo Markdown into the report's house style.
// Small dependency-free Markdown subset: headings, paragraphs, nested lists, task lists, tables, code blocks,
// blockquotes, rules, figures (a line holding only ![caption](path)), and inline code / bold / italic / links. Raw HTML in the source is escaped, never passed through.
// where "review §N" links point: set by docPage for each output (artifact vs project-root copy)
let REVIEW = { base: './', no: {} };
// figure sources: set by docPage; maps a path relative to the Markdown file to an img src (null = file missing)
let IMG = () => null;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slug = s => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function inline(t) {
  const codes = [];
  t = t.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
  t = esc(t);
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|[^)\s]+\.(?:html|md|csv|svg|param|py|pdf)[^)\s]*)\)/g, (_, txt, url) => {
    const ext = /^https?:/.test(url);
    return `<a href="${url}"${ext ? ' rel="noopener" target="_blank"' : ''}>${txt}</a>`;
  });
  t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:])/g, (_, pre, url) => `${pre}<a href="${url}" rel="noopener" target="_blank">${url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<i>$2</i>');
  t = t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
  // "§[flighttest]" and "M[structures].2" name a review chapter by its stable id; they render as its current number, linked
  t = t.replace(/§\[([a-z0-9]+)\]/g, (all, id) => REVIEW.no[id] ? `<a class="rref" href="${REVIEW.base}#${id}">§${REVIEW.no[id]}</a>` : all);
  t = t.replace(/M\[([a-z0-9]+)\]\.(\d+)/g, (all, id, k) => REVIEW.no[id] ? `<a class="rref" href="${REVIEW.base}#${id}">M${REVIEW.no[id]}.${k}</a>` : all);
  return t;
}

// A work-instruction step ("**7.1 Title.** Parts: … Fasteners: … Check: … Time: …") as a heading and a field list;
// the procedure's semicolon-separated actions become a numbered list.
const FIELD = /(?:^|\s)(Parts|Fasteners|Tools|Procedure|Position|Rotation|Settings|Material|Check(?: \([^)]*\))?|Time|Safety|Note|Record|Data|Pass|Abort):\s/g;
function stepBlock(no, title, rest, given) {
  const parts = given ? given.slice() : []; let m, last = null, lastEnd = 0;
  const lead = [];
  FIELD.lastIndex = 0;
  while (!given && (m = FIELD.exec(rest))) {
    const start = m.index + (m[0].startsWith(' ') ? 1 : 0);
    if (last) parts.push([last, rest.slice(lastEnd, start).trim()]); else if (start > 0) lead.push(rest.slice(0, start).trim());
    last = m[1]; lastEnd = m.index + m[0].length;
  }
  if (last) parts.push([last, rest.slice(lastEnd).trim()]); else if (!given && rest.trim()) lead.push(rest.trim());
  const dd = (k, v) => {
    if (/^Procedure/.test(k) && v.split(/;\s+/).length > 2) return `<ol class="proc">${v.replace(/\.$/, '').split(/;\s+/).map(a => `<li>${inline(a)}</li>`).join('')}</ol>`;
    return inline(v);
  };
  const cls = k => /^Check/.test(k) ? ' class="chk"' : /^(Safety|Abort)$/.test(k) ? ' class="warn"' : '';
  return `<div class="step"><h4 id="step-${no.replace('.', '-')}"><span class="sno">${no}</span> ${inline(title.replace(/\.$/, ''))}</h4>`
    + (lead.length ? `<p>${inline(lead.join(' '))}</p>` : '')
    + (parts.length ? `<dl class="stepf">${parts.map(([k, v]) => `<div${cls(k)}><dt>${esc(k)}</dt><dd>${dd(k, v)}</dd></div>`).join('')}</dl>` : '')
    + `</div>`;
}

const isTableSep =l => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);
const cells = l => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));

export function renderMarkdown(md) {
  const L = md.replace(/\r\n/g, '\n').split('\n');
  let out = [];
  const front = out, sections = [];
  let i = 0, title = '', wp = null;
  const dash = t => t.replace(/\s+[—–]\s+/g, ': ');
  const APPX = /inconsisten|resolved in rev|changelog/i;
  const numLike = c => /^[\s−+\-–~≈≤≥<>±$]*\d[\d.,\s×/%°–\-]*\s*(kg|g|mm|m|min|s|h|W|Wh|V|A|N·m|Nm|kgf|USD|\$|%|°C|Hz)?\s*$/.test(c);
  while (i < L.length) {
    const l = L[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,6})\s+(.*)$/))) {
      const lv = m[1].length, txt = inline(dash(m[2].trim())), id = slug(m[2]);
      if (lv === 1 && !title) { title = dash(m[2].trim()); i++; continue; }
      // the page builds its own contents list: drop a hand-written one
      if (lv === 2 && /^(\d+\.?\s*)?contents$/i.test(m[2].trim())) { i++; while (i < L.length && !/^#{1,2}\s/.test(L[i])) i++; continue; }
      const tag = 'h' + Math.min(lv, 4);
      if (lv === 2) { const sec = { id, txt, html: [], subs: [], appendix: APPX.test(m[2]) }; sections.push(sec); out = sec.html; wp = null; }
      if (lv === 3 && sections.length) { sections[sections.length - 1].subs.push({ id, txt }); const w = m[2].match(/^WP(\d+)\b/); wp = w ? w[1] : null; }
      out.push(`<${tag} id="${id}">${txt}</${tag}>`); i++; continue;
    }
    if (/^```/.test(l)) {
      const buf = []; i++;
      while (i < L.length && !/^```/.test(L[i])) buf.push(L[i++]);
      i++; out.push(`<pre class="code"><code>${esc(buf.join('\n'))}</code></pre>`); continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { i++; continue; }
    if ((m = l.match(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/))) {
      const src = IMG(m[2]); i++;
      if (src) out.push(`<figure class="docfig"><img src="${src}" alt="${esc(m[1].replace(/[*`]/g, ''))}"><figcaption>${inline(m[1])}</figcaption></figure>`);
      else console.log('missing figure', m[2]);
      continue;
    }
    if (/^\s*\|/.test(l) && i + 1 < L.length && isTableSep(L[i + 1])) {
      const head = cells(l); i += 2; const rows = [];
      while (i < L.length && /^\s*\|/.test(L[i])) rows.push(cells(L[i++]));
      const nCol = head.length;
      const numeric = head.map((_, c) => rows.length > 0 && rows.filter(r => r[c] && r[c] !== '—').every(r => numLike(r[c])) && rows.some(r => r[c] && r[c] !== '—'));
      const th = head.map((h, c) => `<th${numeric[c] ? ' class="n"' : ''}>${inline(h)}</th>`).join('');
      const tb = rows.map(r => '<tr>' + Array.from({ length: nCol }, (_, c) => `<td${numeric[c] ? ' class="n"' : ''}>${inline(r[c] || '')}</td>`).join('') + '</tr>').join('\n');
      out.push(`<div class="tbl"><table><thead><tr>${th}</tr></thead><tbody>\n${tb}\n</tbody></table></div>`); continue;
    }
    if (/^>\s?/.test(l)) {
      const buf = [];
      while (i < L.length && /^>\s?/.test(L[i])) buf.push(L[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`); continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      // nested lists by indentation
      const items = [];
      while (i < L.length && (/^\s*([-*+]|\d+[.)])\s+/.test(L[i]) || (/^\s{2,}\S/.test(L[i]) && items.length))) {
        const mm = L[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (mm) items.push({ ind: mm[1].length, ord: /\d/.test(mm[2]), txt: mm[3] });
        else items[items.length - 1].txt += ' ' + L[i].trim();
        i++;
      }
      let html = '', stack = [];
      for (const it of items) {
        while (stack.length && it.ind < stack[stack.length - 1].ind) { html += `</li></${stack.pop().tag}>`; }
        if (!stack.length || it.ind > stack[stack.length - 1].ind) { const tag = it.ord ? 'ol' : 'ul'; stack.push({ ind: it.ind, tag }); html += `<${tag}>`; }
        else html += '</li>';
        let t = it.txt, box = '';
        const tm = t.match(/^\[( |x|X)\]\s+(.*)$/);
        if (tm) { box = `<span class="box${tm[1] !== ' ' ? ' on' : ''}" aria-hidden="true"></span>`; t = tm[2]; }
        html += `<li${box ? ' class="task"' : ''}>${box}${inline(t)}`;
      }
      while (stack.length) html += `</li></${stack.pop().tag}>`;
      out.push(html); continue;
    }
    const buf = [l.trim()]; i++;
    while (i < L.length && L[i].trim() && !/^(#{1,6}\s|```|\s*\||>|\s*([-*+]|\d+[.)])\s+|-{3,}\s*$|!\[)/.test(L[i])) buf.push(L[i++].trim());
    const para = buf.join(' ');
    const st = para.match(/^\*\*(\d+\.\d+[a-z]?)\s+(.+?)\*\*\s*(.*)$/);
    if (st) {
      const no = (wp && st[1].split('.')[0] === wp) ? 'WP' + st[1] : st[1];
      // rev B writes the fields as a list under the title ("- Parts: …"): pull that list into the step card
      let j = i; while (j < L.length && !L[j].trim()) j++;
      const FL = /^\s*[-*]\s+([A-Z][A-Za-z0-9 ()/.,&+-]{0,40}?):\s+(.*)$/;
      if (!st[3].trim() && j < L.length && FL.test(L[j])) {
        const pairs = [];
        while (j < L.length && (FL.test(L[j]) || (/^\s{2,}\S/.test(L[j]) && pairs.length))) {
          const fm = L[j].match(FL);
          if (fm) pairs.push([fm[1], fm[2].trim()]); else pairs[pairs.length - 1][1] += ' ' + L[j].trim();
          j++;
        }
        i = j; out.push(stepBlock(no, st[2], '', pairs)); continue;
      }
      out.push(stepBlock(no, st[2], st[3])); continue;
    }
    // revision notes belong with the appendix, not on the first screen
    if (!sections.length && /^Rev [A-Z] changes/.test(para)) { (front.revNotes = front.revNotes || []).push(`<p>${inline(para)}</p>`); continue; }
    out.push(`<p>${inline(para)}</p>`);
  }
  const main = sections.filter(x => !x.appendix), appx = sections.filter(x => x.appendix);
  if (front.revNotes) appx.unshift({ id: 'revision-notes', txt: 'Revision notes', subs: [], html: ['<h2 id="revision-notes">Revision notes</h2>', ...front.revNotes], appendix: true });
  appx.forEach((x, k) => { const A = String.fromCharCode(65 + k); x.html[0] = x.html[0].replace(/<h2 id="([^"]+)">(?:\d+\.\s*)?/, `<h2 id="$1">Appendix ${A}. `); x.txt = `Appendix ${A}. ` + x.txt.replace(/^\d+\.\s*/, ''); });
  const html = [...front, ...main.flatMap(x => x.html), ...appx.flatMap(x => x.html)].join('\n');
  return { title, toc: [...main, ...appx], html, front, parts: [...main, ...appx] };
}

// Pages for the reader: the front matter, then one page per section; a section whose subsections are work packages
// (WP1, WP2, ...) or that runs long is split so each subsection is its own page, after a short section intro.
const strip = t => t.replace(/<[^>]+>/g, '');
function paginate(front, parts) {
  const pages = [];
  if (front.length) pages.push({ id: 'about', title: 'About this document', html: [...front] });
  for (const x of parts) {
    const split = x.subs.some(t => /^WP\d/.test(strip(t.txt))) || x.html.join('').length > 60000;
    if (!split || !x.subs.length) { pages.push({ id: x.id, title: x.txt, html: [...x.html] }); continue; }
    const intro = { id: x.id, title: x.txt, html: [], kids: [] }; pages.push(intro); let cur = intro;
    for (const h of x.html) {
      const m = h.match(/^<h3 id="([^"]+)">([\s\S]*)<\/h3>$/);
      if (m) { cur = { id: m[1], title: m[2], parent: x.id, html: [] }; intro.kids.push(cur); pages.push(cur); }
      cur.html.push(h);
    }
    intro.html.push(`<ol class="pglist">${intro.kids.map(k => `<li><a href="#${k.id}">${k.title}</a></li>`).join('')}</ol>`);
  }
  return pages;
}

// A full page in the report style: masthead, title, contents, body. `back` links to the review.
export function docPage({ md, css, fontLink, docNo, kicker, back = 'vtol-review.html', chapters = [], img = () => null }) {
  REVIEW = { base: back, no: Object.fromEntries(chapters.map((id, i) => [id, i + 1])) }; IMG = img;
  const { title, toc, front, parts } = renderMarkdown(md);
  const pages = paginate(front, parts);
  const num = t => { const m = strip(t).match(/^(\d+)\.\s/); return m ? m[1] : ''; };
  const plain = t => t.replace(/^\d+(\.\d+)*\.?\s*/, '');
  const body = pages.map((pg, k) => {
    const prev = pages[k - 1], next = pages[k + 1];
    const pager = `<nav class="pager" aria-label="Previous and next section">${prev ? `<a class="pv" href="#${prev.id}"><span>Previous</span>${plain(prev.title)}</a>` : '<span></span>'}${next ? `<a class="nx" href="#${next.id}"><span>Next</span>${plain(next.title)}</a>` : ''}</nav>`;
    return `<section class="pg" id="pg-${pg.id}" data-id="${pg.id}">\n${pg.html.join('\n')}\n${pager}</section>`;
  }).join('\n');
  const side = pages.filter(pg => !pg.parent).map(pg => `<li><a href="#${pg.id}" data-pg="${pg.id}"><span class="n">${num(pg.title)}</span><span class="t">${plain(pg.title)}</span><span class="cnt" aria-hidden="true"></span></a>${pg.kids ? `<ol>${pg.kids.map(c => `<li><a href="#${c.id}" data-pg="${c.id}"><span class="t">${c.title}</span><span class="cnt" aria-hidden="true"></span></a></li>`).join('')}</ol>` : ''}</li>`).join('\n');
  const opts = pages.map(pg => `<option value="${pg.id}">${pg.parent ? '\u2003' : ''}${esc(strip(pg.parent ? pg.title : (num(pg.title) ? num(pg.title) + '. ' : '') + plain(pg.title)))}</option>`).join('');
  const name = title.replace(/^DBF-[A-Z]+-\d+\s*[—:-]\s*/, '');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)}</title>
<script>try{if(localStorage.getItem('vtol-theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}</script>
<script>try{if(sessionStorage.getItem('dbf-full')!=='1')document.documentElement.classList.add('paged')}catch(e){document.documentElement.classList.add('paged')}</script>
${fontLink}
<style>
${css}
/* ---------- companion document page ---------- */
/* reader: one section (or work package) at a time; side contents on wide screens, a section menu on narrow ones.
   Without the script, in "Full document" mode and in print every section shows. */
.reader{display:block}
.side h2{font:600 .75rem/1.3 var(--f-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--fg-3);margin:0 0 10px;border:0;padding:0}
.side ol{list-style:none;margin:0;padding:0}
.side ol ol{margin:2px 0 6px 1.9rem}
.side a{display:flex;align-items:baseline;gap:8px;min-height:36px;padding:7px 10px;border-radius:var(--r-s);color:var(--fg-2);text-decoration:none;font-size:.875rem;line-height:1.35}
.side ol ol a{min-height:32px;padding:5px 10px;font-size:.8125rem}
.side a:hover{background:var(--surface-2);color:var(--fg)}
.side a[aria-current="page"]{background:var(--accent-soft,var(--surface-2));color:var(--fg);font-weight:600}
.side .n{flex:none;min-width:1.2rem;font-variant-numeric:tabular-nums;color:var(--fg-3)}
.side .t{flex:1}
.side .cnt{flex:none;font:500 .75rem var(--f-mono);color:var(--fg-3)}
.side .cnt.all{color:var(--ok)}
.pgbar{display:none}
.pager{display:none}
.pglist{margin:16px 0;padding-left:1.4em}
.pglist li{margin:.35em 0}
html.paged .pg{display:none}
html.paged .pg.on{display:block}
html.paged .pg>h2:first-child,html.paged .pg>h3:first-child{margin-top:8px;padding-top:0;border-top:0}
html.paged .pager{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:40px 0 8px;padding-top:18px;border-top:1px solid var(--line)}
.pager a{display:flex;flex-direction:column;gap:2px;padding:12px 14px;border:1px solid var(--line-2);border-radius:var(--r);color:var(--fg);text-decoration:none;font-size:.9375rem;line-height:1.35}
.pager a span{font:500 .75rem var(--f-mono);color:var(--fg-3);text-transform:uppercase;letter-spacing:.05em}
.pager a:hover{border-color:var(--accent)}
.pager .nx{text-align:right;grid-column:2}
@media (min-width:1100px){
  html.paged .reader{display:grid;grid-template-columns:16.5rem minmax(0,1fr);gap:40px;align-items:start}
  html.paged .side{position:sticky;top:12px;max-height:calc(100vh - 24px);overflow:auto;padding:4px 4px 16px 0;border-right:1px solid var(--line)}
}
@media (max-width:1099px){
  html.paged .side{display:none}
  html.paged .pgbar{display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:5;margin:0 0 16px;padding:10px 0;background:var(--bg);border-bottom:1px solid var(--line)}
  .pgbar label{font:600 .8125rem var(--f-body);color:var(--fg-2)}
  .pgbar select{flex:1;min-width:0;min-height:44px;padding:0 10px;border:1px solid var(--line-3);border-radius:var(--r-s);background:var(--surface);color:var(--fg);font:inherit;font-size:.9375rem}
}
html:not(.paged) .side{margin:0 0 32px}
html:not(.paged) .side ol ol{display:flex;flex-wrap:wrap;gap:0 6px}
@media print{html.paged .pg{display:block}.side,.pgbar,.pager,#allBtn{display:none!important}}
/* figures: CAD renders on white in both themes, so the frame stays light */
.docfig{margin:4px 0 24px;max-width:46rem}
.docfig img{display:block;width:100%;height:auto;background:#fff;border:1px solid var(--line);border-radius:6px}
.docfig figcaption{margin-top:6px;font-size:.8125rem;line-height:1.45;color:var(--fg-2);max-width:62ch}
.doc h2{margin-top:64px;padding-top:18px;border-top:1px solid var(--line);font-size:1.5rem;letter-spacing:-.02em}
.doc h3{margin-top:40px;padding-top:12px;border-top:1px solid var(--line-2);font-size:1.25rem}
.doc h4{margin-top:28px;font-size:1.125rem}
.doc p,.doc li{max-width:58ch;text-wrap:pretty}
.doc td{text-wrap:pretty}
.doc table{width:auto;max-width:100%}
.doc td:not(.n){max-width:60ch}
.doc p,.doc li,.doc dd,.doc td,.doc blockquote{overflow-wrap:break-word}
.doc ul,.doc ol{padding-left:1.4em}
.doc li{margin:.25em 0}
.doc li.task{list-style:none;margin-left:-1.4em;display:flex;gap:10px;align-items:baseline}
.doc .box{flex:none;width:14px;height:14px;border:1px solid var(--fg-2);border-radius:var(--r-s);transform:translateY(2px)}
.doc .box.on{background:var(--ink)}
.doc blockquote{margin:16px 0;padding:10px 14px;background:var(--surface-2);border-left:0;border-radius:var(--r-s);color:var(--fg)}
.doc code{font-size:.92em}
.doc pre.code{background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r-s);padding:12px 14px;overflow:auto;font-size:.875rem;line-height:1.5}
.doc .tbl{margin:14px 0 18px}
.doc td{vertical-align:top}
.doc a{color:var(--accent);text-underline-offset:2px}
.doc h3{border-top:0;padding-top:0}
header.top{border-bottom:1px solid var(--line);padding-block:20px 28px}
header.top h1{font:600 2rem/1.15 var(--f-display);letter-spacing:-.025em;max-width:24ch}
.mast{border-bottom:1px solid var(--line);margin-bottom:28px}
.mast .org{font:500 .8125rem/1.3 var(--f-mono);color:var(--fg-3)}
.mast .tbbtn{margin-left:12px}
.doc a:hover{text-decoration-color:var(--accent)}
.backlink{color:var(--fg-2)}
.doc .step{margin:22px 0 0;padding:14px 16px 6px;background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r)}
.doc .step h4{margin:0 0 8px;font-size:1.125rem;line-height:1.35}
.doc .step .sno{margin-right:.35em;color:var(--accent);font-variant-numeric:tabular-nums}
.doc dl.stepf{margin:0;display:grid;gap:0}
.doc dl.stepf>div{display:grid;grid-template-columns:7.5rem minmax(0,1fr);gap:12px;padding:8px 0;border-top:1px solid var(--line)}
.doc dl.stepf dt{font-weight:600;font-size:.875rem;color:var(--fg-2);padding-top:2px}
.doc dl.stepf dd{margin:0;max-width:58ch;text-wrap:pretty}
.doc dl.stepf .chk dt{color:var(--ok)}
.doc dl.stepf .warn dt{color:var(--warn)}
.doc ol.proc{margin:0;padding-left:1.3em}
.doc ol.proc li{margin:.15em 0}
@media (max-width:560px){.doc dl.stepf>div{grid-template-columns:minmax(0,1fr);gap:2px}.doc .step{padding:12px 12px 4px}}
.doctoc ol.sub{columns:auto;margin:2px 0 10px 2.2em;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:4px 14px}
.doctoc ol.sub li{max-width:none}
.doctoc ol.sub a{display:inline-flex;align-items:center;min-height:44px;font-size:.875rem;color:var(--fg-2);text-decoration:underline;text-decoration-color:var(--line-3);text-underline-offset:2px}
.doc .step{position:relative}
.doc .stepchk{min-height:44px;padding:0 14px;margin:0 0 8px;border:1px solid var(--line-3);border-radius:var(--r-s);background:transparent;color:var(--fg-2);font:600 .875rem var(--f-body);cursor:pointer}
.doc .stepchk:hover{color:var(--fg);border-color:var(--fg-2)}
.doc .stepchk[aria-pressed="true"]{background:var(--ok-soft);border-color:var(--ok);color:var(--ok)}
.doc .step.isdone{border-color:var(--ok)}
.doc h2,.doc h3,.doc h4{scroll-margin-top:64px}
</style></head>
<body>
<a class="skip" href="#doc">Skip to content</a>
<div class="wrap">
<header class="top">
  <div class="mast"><span class="org"><a class="backlink" href="${back}">← Design review DBF-RPT-001</a></span><span class="org">${esc(docNo)} <button type="button" class="tbbtn" id="allBtn" aria-pressed="false">Full document</button><button type="button" class="tbbtn" id="themeBtn"></button></span></div>
  <h1>${inline(name)}</h1>
</header>
<div class="runhead" id="runhead" aria-hidden="true"><span class="rh-doc">${esc(docNo)}</span><span class="rh-sec" id="rhSec"></span><a class="rh-toc" href="#contents" tabindex="-1">Contents</a></div>
<div class="reader">
<nav class="side" id="contents" aria-label="Contents"><h2 id="tocTitle">Contents</h2><ol>
${side}
</ol></nav>
<div class="readmain">
<div class="pgbar"><label for="pgSel">Section</label><select id="pgSel">${opts}</select></div>
<main id="doc" class="doc">
${body}
</main>
</div>
</div>
</div>
<script>
// theme: shared with the design review (same storage key)
(()=>{ const b=document.getElementById('themeBtn'), r=document.documentElement; const lab=()=>{ b.textContent = r.dataset.theme==='light'?'Dark theme':'Light theme'; };
  lab(); b.addEventListener('click',()=>{ r.dataset.theme = r.dataset.theme==='light'?'dark':'light'; try{ localStorage.setItem('vtol-theme', r.dataset.theme); }catch(e){} lab(); }); })();
// reader: show the page holding the target of the address (a section, work package, step or any anchor)
(()=>{ const R=document.documentElement, pgs=[...document.querySelectorAll('.pg')]; if(!pgs.length) return;
  const sel=document.getElementById('pgSel'), all=document.getElementById('allBtn');
  const links=[...document.querySelectorAll('.side a[data-pg]')];
  let full=false; try{ full=sessionStorage.getItem('dbf-full')==='1'; }catch(e){}
  const pageOf=el=>el?el.closest('.pg'):null;
  function show(hash, scroll){
    const id=decodeURIComponent((hash||'').replace(/^#/,'')); const el=id?document.getElementById(id):null;
    const pg=pageOf(el)||pgs[0];
    pgs.forEach(p=>p.classList.toggle('on', p===pg));
    const pid=pg.dataset.id; sel.value=pid;
    links.forEach(a=>{ if(a.dataset.pg===pid) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
    if(scroll){ const first=pg.firstElementChild; if(!el || el===first || el.id===pid) scrollTo(0,0); else el.scrollIntoView(); }
  }
  function setFull(on){ full=on; R.classList.toggle('paged', !on); all.setAttribute('aria-pressed', on?'true':'false'); try{ sessionStorage.setItem('dbf-full', on?'1':'0'); }catch(e){} }
  setFull(full); show(location.hash, !!location.hash);
  addEventListener('hashchange',()=>show(location.hash, true));
  sel.addEventListener('change',()=>{ location.hash=sel.value; });
  all.addEventListener('click',()=>{ setFull(!full); show(location.hash, false); });
  // per-page count of steps marked Done (from the check-off below); refreshed on every change
  window.dbfCounts=()=>{ links.forEach(a=>{ const p=document.getElementById('pg-'+a.dataset.pg); if(!p) return; const st=p.querySelectorAll('.step'); const c=a.querySelector('.cnt'); if(!st.length){ c.textContent=''; return; } const d=p.querySelectorAll('.step.isdone').length; c.textContent=d+'/'+st.length; c.classList.toggle('all', d===st.length); }); };
})();
// running head: the section being read; step check-off kept in this browser only (a shop convenience, not a record)
(()=>{ const rh=document.getElementById('runhead'), sec=document.getElementById('rhSec'), toc=document.getElementById('contents');
  const hs=[...document.querySelectorAll('.doc h2, .doc h3')]; let raf=0;
  const up=()=>{ raf=0; rh.classList.toggle('on', !document.documentElement.classList.contains('paged') && toc.getBoundingClientRect().bottom<0); let cur=null; for(const h of hs){ if(h.getBoundingClientRect().top<90) cur=h; } const t=cur?cur.textContent:''; if(sec.textContent!==t) sec.textContent=t; };
  addEventListener('scroll',()=>{ if(!raf) raf=requestAnimationFrame(up); },{passive:true}); up();
  const KEY='dbf-done-${esc(docNo).replace(/[^A-Za-z0-9-]/g, '')}'; let done={}; try{ done=JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){}
  // wide tables scroll inside their own frame: give the frames a name and a tab stop when they actually scroll
  document.querySelectorAll('.doc .tbl').forEach(w=>{ if(w.scrollWidth<=w.clientWidth+1) return; let h=w.previousElementSibling; while(h && !/^H[2-4]$/.test(h.tagName)) h=h.previousElementSibling; w.setAttribute('role','region'); w.setAttribute('tabindex','0'); w.setAttribute('aria-label', h?h.textContent.trim():'Table'); });
  document.querySelectorAll('.doc .step').forEach(st=>{ const h=st.querySelector('h4'); if(!h) return; const id=h.id;
    const b=document.createElement('button'); b.type='button'; b.className='stepchk'; b.setAttribute('aria-pressed', done[id]?'true':'false'); b.textContent='Done';
    b.setAttribute('aria-label', 'Done: '+h.textContent.trim()); st.classList.toggle('isdone', !!done[id]);
    b.addEventListener('click',()=>{ done[id]=!done[id]; if(!done[id]) delete done[id]; try{ localStorage.setItem(KEY, JSON.stringify(done)); }catch(e){}
      b.setAttribute('aria-pressed', done[id]?'true':'false'); b.textContent='Done'; b.setAttribute('aria-label', 'Done: '+h.textContent.trim()); st.classList.toggle('isdone', !!done[id]); });
    h.after(b); });
  if(window.dbfCounts){ dbfCounts(); document.addEventListener('click',e=>{ if(e.target.closest('.stepchk')) dbfCounts(); }); }
})();
</script>
</body></html>`;
}
