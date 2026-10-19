/* Inventory overview page logic: theme, section navigation, inventory table (search, filters, sort), 3D model wiring. */
(function(){
const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));

// ---------- theme (same modes and storage key as the review) ----------
const modes = ['system','light','dark']; let mi = 0;
try{ const s = localStorage.getItem('vtolTheme'); if(s) mi = Math.max(0, modes.indexOf(s)); }catch(e){}
function applyTheme(){ const m = modes[mi]; if(m === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', m);
  $('#themeBtn').textContent = 'Theme: ' + m; try{ localStorage.setItem('vtolTheme', m); }catch(e){} }
$('#themeBtn').addEventListener('click', () => { mi = (mi + 1) % 3; applyTheme(); });

// ---------- navigation (same structure as the review: side index >= 1100 px, tab strip below, one section at a time) ----------
const secs = $$('section.sec');
function buildNav(){
  const side = document.createElement('ol'), tabs = $('#tabs');
  secs.forEach(s => {
    const li = document.createElement('li'); li.dataset.id = s.id;
    li.innerHTML = `<a href="#${s.id}"><span class="n">${s.dataset.n}</span> ${s.dataset.title}</a>`;
    const subs = s.querySelectorAll('h3[id]');
    if(subs.length){ const ol = document.createElement('ol'); ol.className = 'sub';
      subs.forEach(h => ol.insertAdjacentHTML('beforeend', `<li><a href="#${h.id}" data-sec="${s.id}">${h.textContent}</a></li>`)); li.appendChild(ol); }
    side.appendChild(li);
    tabs.insertAdjacentHTML('beforeend', `<a href="#${s.id}" data-id="${s.id}"><span class="mono">${s.dataset.n}</span> ${s.dataset.title}</a>`);
    const i = secs.indexOf(s), prev = secs[i-1], next = secs[i+1];
    let h = `<div class="secidx"><div class="eyebrow">In this section</div><ol>`;
    subs.forEach(x => h += `<li><a href="#${x.id}" data-sec="${s.id}">${x.textContent}</a></li>`);
    h += `</ol><div class="pn">`;
    h += prev ? `<a class="prev" href="#${prev.id}"><span class="eyebrow">← Previous · ${prev.dataset.n}</span> ${prev.dataset.title}</a>` : '<span></span>';
    h += next ? `<a class="next" href="#${next.id}"><span class="eyebrow">Next · ${next.dataset.n} →</span> ${next.dataset.title}</a>` : '<span></span>';
    s.insertAdjacentHTML('beforeend', h + '</div></div>');
  });
  $('#side').appendChild(side);
}
function show(id, sub, focus){
  const target = secs.find(s => s.id === id) || secs[0];
  secs.forEach(s => s.classList.toggle('cur', s === target));
  const mark = (a, on) => { a.classList.toggle('cur', on); if(on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); };
  $$('#side li[data-id]').forEach(li => { const on = li.dataset.id === target.id; li.classList.toggle('cur', on); mark(li.querySelector('a'), on); });
  $$('#tabs a').forEach(a => { const on = a.dataset.id === target.id; mark(a, on); if(on) a.scrollIntoView({block:'nearest', inline:'center'}); });
  try{ localStorage.setItem('invSec', target.id); }catch(e){}
  if(target.id === 'model3d') initModel();
  const dest = sub ? document.getElementById(sub) : null;
  if(dest) dest.scrollIntoView(); else window.scrollTo(0, 0);
  if(focus){ const f = dest || target.querySelector('h2'); if(f){ if(!f.hasAttribute('tabindex')) f.setAttribute('tabindex', '-1'); f.focus({preventScroll:true}); } }
}
function route(hash, focus){
  const h = (hash !== undefined ? hash : location.hash).replace(/^#/, '');
  if(!h){ let s = null; try{ s = localStorage.getItem('invSec'); }catch(e){} show(s || 'overview'); return; }
  const el = document.getElementById(h); if(!el) return show('overview');
  const sec = el.closest('section.sec'); if(!sec) return show((secs.find(s => s.classList.contains('cur')) || {}).id || 'overview');
  show(sec.id, el === sec ? null : h, focus);
}
function go(id){ try{ history.pushState(null, '', '#' + id); }catch(e){} route(id, false); }
window.addEventListener('hashchange', () => route(undefined, true));
document.addEventListener('click', e => { const a = e.target.closest('a[href^="#"]'); if(!a) return; const h = a.getAttribute('href');
  if(a.classList.contains('skip')){ e.preventDefault(); const t = $('section.sec.cur h2') || $('#main'); t.setAttribute('tabindex', '-1'); t.focus(); return; }
  if(!document.getElementById(h.slice(1))) return; e.preventDefault(); try{ history.pushState(null, '', h); }catch(err){} route(h, true); });

// ---------- inventory table: search, filters, sort ----------
const tbl = $('#invTable'), tb = tbl.tBodies[0], rows = Array.from(tb.rows);
const q = $('#invQ'), fT = $('#invType'), fK = $('#invKit'), fS = $('#invStatus');
const fmt2 = v => v.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
rows.forEach(r => r._txt = r.textContent.toLowerCase().replace(/\s+/g, ' '));
function filter(){
  const s = q.value.trim().toLowerCase(); let n = 0, buys = 0, tot = 0, props = 0, ptot = 0;
  rows.forEach(r => {
    const ok = (!s || r._txt.includes(s)) && (!fT.value || r.dataset.type === fT.value) && (!fK.value || r.dataset.kit === fK.value) && (!fS.value || r.dataset.status === fS.value);
    r.hidden = !ok; if(ok){ n++; if(r.dataset.type === 'Buy'){ buys++; tot += parseFloat(r.cells[12].dataset.v) || 0; } else if(r.dataset.type === 'Proposed'){ props++; ptot += parseFloat(r.cells[12].dataset.v) || 0; } }
  });
  $('#invCount').textContent = n + ' of ' + rows.length + ' lines';
  $('#invTotLbl').textContent = 'Buy lines shown: ' + buys; $('#invTot').textContent = fmt2(Math.round(tot * 100) / 100);
  $('#invPropLbl').textContent = 'Proposed lines shown: ' + props; $('#invPropTot').textContent = fmt2(Math.round(ptot * 100) / 100);
}
[q, fT, fK, fS].forEach(e => e.addEventListener('input', filter));
$('#invClear').addEventListener('click', () => { q.value = ''; fT.value = fK.value = fS.value = ''; filter(); });
$$('#invTable thead th.sort').forEach((th, i) => {
  const numeric = th.dataset.t === 'n';
  th.querySelector('button').addEventListener('click', () => {
    const asc = th.getAttribute('aria-sort') !== 'ascending';
    $$('#invTable thead th.sort').forEach(x => x.removeAttribute('aria-sort')); th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
    const val = r => { const c = r.cells[i]; return c.dataset.v !== undefined ? c.dataset.v : c.textContent.trim(); };
    const sorted = rows.slice().sort((a, b) => { const x = val(a), y = val(b);
      const d = numeric ? (parseFloat(x) - parseFloat(y)) : String(x).localeCompare(String(y), undefined, {numeric:true});
      return (asc ? d : -d) || rows.indexOf(a) - rows.indexOf(b); });
    sorted.forEach(r => tb.appendChild(r));
  });
});
function findRow(id){
  q.value = id; fT.value = fK.value = fS.value = ''; filter(); go('inventory');
  const hit = rows.find(r => r.dataset.id === id && !r.hidden);
  if(hit){ rows.forEach(r => r.classList.toggle('hit', r === hit)); setTimeout(() => hit.scrollIntoView({block:'center'}), 30); }
}
document.addEventListener('click', e => { const f = e.target.closest('button[data-find]'); if(f) findRow(f.dataset.find); });
// a row with a CAD part opens that part in the 3D model; buttons and links inside the row keep their own action
tb.addEventListener('click', e => { if(e.target.closest('a, button[data-find]')) return; const r = e.target.closest('tr[data-part]'); if(r) showPart(r.dataset.part); });
$$('button[data-part]').forEach(b => b.addEventListener('click', e => { if(b.closest('#invTable')) return; e.stopPropagation(); showPart(b.dataset.part); }));

// ---------- 3D model ----------
let CV = null, pending = null;
const THREE_SRC = ['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'];
const loadScript = src => new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
function initModel(){
  if(CV){ CV.refresh(); return; }
  if(CV === 'loading') return;
  CV = 'loading'; const view = $('#v3d'); view.classList.add('loading');
  (window.THREE && THREE.OrbitControls ? Promise.resolve() : loadScript(THREE_SRC[0]).then(() => loadScript(THREE_SRC[1])))
    .catch(() => {}).then(() => { view.classList.remove('loading'); startModel(); });
}
function startModel(){
  const view = $('#v3d'), parts = $('.cadparts');
  CV = Viewer3D(view, MESH, INVP, KITS) || false;
  view.classList.toggle('offline', !CV); parts.hidden = !CV;
  if(!CV){ const r = $('#v3dRetry'); if(!r.dataset.bound){ r.dataset.bound = 1; r.addEventListener('click', () => { CV = null; view.querySelector('.fallback').hidden = true; $('#v3dCanvas').hidden = false; initModel(); }); } return; }
  window.__inv3d = CV;   // test hook: layer and selection state
  touchGate(view);
  $$('#v3dParts button').forEach(b => b.addEventListener('click', () => CV.selectPart(b.dataset.partbtn)));
  view.addEventListener('findrow', e => findRow(e.detail));
  if(pending){ CV.selectPart(pending); pending = null; }
}
function showPart(name){ pending = name; if($('#model3d').classList.contains('cur') && CV && CV.selectPart){ CV.selectPart(name); pending = null; } else go('model3d'); }

// touch screens: the canvas takes gestures only after a tap, so swipes over it scroll the page
function touchGate(view){
  if(!window.matchMedia || !matchMedia('(pointer: coarse)').matches || view.querySelector('.gate')) return;
  const c = view.querySelector('canvas'), g = document.createElement('button');
  g.type = 'button'; g.className = 'gate'; g.innerHTML = '<span>Tap to rotate the model</span>'; view.appendChild(g);
  const size = () => { g.style.height = c.offsetHeight + 'px'; }; size(); if(window.ResizeObserver) new ResizeObserver(size).observe(c);
  const arm = on => { view.classList.toggle('armed', on); g.hidden = on; };
  g.addEventListener('click', () => arm(true));
  document.addEventListener('pointerdown', e => { if(view.classList.contains('armed') && !view.contains(e.target)) arm(false); });
  if(window.IntersectionObserver) new IntersectionObserver(es => es.forEach(en => { if(!en.isIntersecting) arm(false); })).observe(view);
}

// ---------- generic sortable tables (wire schedule) and its filters ----------
$$('table.sortable').forEach(t => {
  const b = t.tBodies[0], rs = Array.from(b.rows);
  $$('#' + t.id + ' thead th.sort').forEach((th, i) => {
    const numeric = th.dataset.t === 'n';
    th.querySelector('button').addEventListener('click', () => {
      const asc = th.getAttribute('aria-sort') !== 'ascending';
      t.querySelectorAll('thead th.sort').forEach(x => x.removeAttribute('aria-sort')); th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
      const val = r => { const c = r.cells[i]; return c.dataset.v !== undefined ? c.dataset.v : c.textContent.trim(); };
      rs.slice().sort((a, c) => { const x = val(a), y = val(c); const d = numeric ? (parseFloat(x) - parseFloat(y)) : String(x).localeCompare(String(y), undefined, {numeric:true}); return (asc ? d : -d) || rs.indexOf(a) - rs.indexOf(c); }).forEach(r => b.appendChild(r));
    });
  });
});
(function(){
  const t = $('#wTable'); if(!t) return; const z = $('#wZone'), f = $('#wFn'), rs = Array.from(t.tBodies[0].rows);
  function fw(){ let n = 0, len = 0; rs.forEach(r => { const ok = (!z.value || r.dataset.zone === z.value) && (!f.value || r.dataset.cat === f.value); r.hidden = !ok; if(ok){ n++; len += parseFloat(r.cells[8].dataset.v) || 0; } });
    $('#wCount').textContent = n + ' of ' + rs.length + ' wires'; $('#wTotLbl').textContent = 'Route length shown (' + n + ' wires)'; $('#wTot').textContent = (Math.round(len * 1000) / 1000).toFixed(3); }
  [z, f].forEach(e => e.addEventListener('input', fw)); $('#wClear').addEventListener('click', () => { z.value = f.value = ''; fw(); });
})();

// ---------- NWA message: copy button (clipboard API, falls back to selecting the text) ----------
(function(){
  const btn = $('#nwaCopy'), pre = $('#nwaMsg'), out = $('#nwaCopyMsg'); if(!btn) return;
  const select = () => { const r = document.createRange(); r.selectNodeContents(pre); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); };
  btn.addEventListener('click', () => {
    const done = m => { out.textContent = m; setTimeout(() => { out.textContent = ''; }, 5000); };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(pre.textContent).then(() => done('Copied to the clipboard.'), () => { select(); done('Copy was blocked: the text is selected, press Ctrl+C (Cmd+C on a Mac).'); });
    } else { select(); done('Text selected: press Ctrl+C (Cmd+C on a Mac).'); }
  });
})();

buildNav(); applyTheme(); route();
})();
