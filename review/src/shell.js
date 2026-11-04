// ---------- application shell: sidebar, routing, sub-tabs, shared model viewport, drawing viewer, search, theme, drawer, report view ----------
// The chapters in body.html are the content; this file only arranges them. app.js calls Shell.init({onShow}) at boot,
// and onShow(section) redraws what that section holds (onShow(null) = everything, for report view and print).
const Shell = (()=>{
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const root = document.documentElement;
  const GROUPS = {home:'', design:'Design', verify:'Verification', program:'Program', build:'Build and software', doc:'Documentation'};
  const ICON = {overview:'space_dashboard', requirements:'fact_check', model3d:'view_in_ar', drawings:'design_services', aero:'air', structures:'architecture',
    mass:'scale', propulsion:'toys_fan', cg:'center_focus_strong', simulation:'query_stats', testing:'science', flighttest:'flight_takeoff', budget:'payments',
    iterations:'compare', schedule:'event', build:'handyman', controls:'memory', docinfo:'info', downloads:'download'};
  const DEFAULT_TAB = {model3d:'m3-cad'};          // visual first: the CAD page opens on the model
  const TAB_MIN = 4;                               // chapters with at least this many sub-sections get tabs
  const store = { get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} } };
  const icon = n => `<span class="msym" aria-hidden="true">${n}</span>`;
  let secs=[], cur=null, onShow=()=>{}, report=false, printReport=false, openedForReport=[];

  // ---------- sidebar ----------
  function buildSidebar(){
    const nav=$('#sidebar'); let g=null, html=''; const order=Object.keys(GROUPS);
    // sidebar runs by group (Documentation last); the page order itself puts Report info first for the report view
    [...secs].sort((x,y)=>order.indexOf(x.dataset.group||'home')-order.indexOf(y.dataset.group||'home')).forEach(s=>{ const grp=s.dataset.group||'home';
      if(grp!==g){ if(g!==null) html+='</ul>'; g=grp; html+=(GROUPS[grp]?`<p class="sb-group" id="sbg-${grp}">${GROUPS[grp]}</p>`:'')+`<ul${GROUPS[grp]?` aria-labelledby="sbg-${grp}"`:''}>`; }
      html+=`<li><a href="#${s.id}" data-sec="${s.id}">${icon(ICON[s.id]||'article')}<span class="sb-t">${s.dataset.title}</span></a></li>`; });
    nav.innerHTML = html+'</ul>';
  }
  // ---------- sub-tabs: one panel per h3; content before the first h3 is the Summary panel ----------
  function buildTabs(s){
    const hs=[...s.querySelectorAll(':scope > h3[id]')]; if(hs.length<TAB_MIN || s.dataset.nonum) return;
    const head=s.querySelector(':scope > .sechead'); const tabs=[{id:s.id+'-summary', label:'Summary'}];
    const summary=document.createElement('div'); summary.className='tabpanel'; summary.dataset.tab=tabs[0].id;
    let panel=summary; const panels=[summary], measures=[];
    [...s.children].forEach(el=>{ if(el===head) return;
      if(el.matches('h3[id]')){ panel=document.createElement('div'); panel.className='tabpanel'; panel.dataset.tab=el.id; panels.push(panel);
        tabs.push({id:el.id, label:el.textContent.replace(/^\s*\d+\.\d+\s*/,'').trim()}); }
      if(el.matches('.measure')) measures.push(el); else panel.appendChild(el); });
    measures.forEach(m=>summary.appendChild(m));     // the chapter's "what the team must measure" box belongs to the chapter, not to its last tab
    if(!summary.children.length){ panels.shift(); tabs.shift(); }   // a chapter with no lead-in opens on its first sub-section
    const bar=document.createElement('div'); bar.className='tabbar'; bar.setAttribute('role','tablist'); bar.setAttribute('aria-label', s.dataset.title+' views');
    bar.innerHTML=tabs.map(t=>`<a role="tab" href="#${s.id}/${t.id}" data-tab="${t.id}" id="tab-${t.id}" aria-controls="panel-${t.id}">${t.label}</a>`).join('');
    head.after(bar); let at=bar; panels.forEach(pn=>{ pn.setAttribute('role','tabpanel'); pn.id='panel-'+pn.dataset.tab; pn.setAttribute('aria-labelledby','tab-'+pn.dataset.tab); at.after(pn); at=pn; });
    s.classList.add('has-tabs');
  }
  // ---------- drawing sheets: one large sheet with a rail of the nine ----------
  function buildSheets(){
    const box=$('#drawingsBox'); if(!box) return; const figs=[...box.querySelectorAll('figure.sheet')]; if(!figs.length) return;
    box.classList.add('sheetview');
    const rail=document.createElement('div'); rail.className='sheetrail'; rail.setAttribute('role','group'); rail.setAttribute('aria-label','Drawing sheets');
    rail.innerHTML=figs.map((f,i)=>{ const t=(f.querySelector('.sheetbtn')||{}).dataset; return `<button type="button" data-i="${i}" aria-pressed="${i===0}"><span class="sr-n">${i+1}</span><span class="sr-t">${t&&t.t?t.t.replace(/^Sheet \d+:\s*/,''):'Sheet '+(i+1)}</span></button>`; }).join('');
    box.prepend(rail);
    const pick=i=>{ figs.forEach((f,k)=>f.classList.toggle('cur',k===i)); rail.querySelectorAll('button').forEach((b,k)=>b.setAttribute('aria-pressed',String(k===i))); };
    rail.addEventListener('click',e=>{ const b=e.target.closest('button[data-i]'); if(b) pick(+b.dataset.i); });
    pick(0);
  }
  // ---------- routing ----------
  function resolve(hash){
    let [a,b]=(hash||'').replace(/^#/,'').split('/');
    if(!a || a==='contents') return {sec:$('#overview')};
    if(a==='main') return {sec:cur||$('#overview'), focusHead:true};
    const el=document.getElementById(a); if(!el) return {sec:$('#overview')};
    const sec=el.matches('section.sec')?el:el.closest('section.sec'); if(!sec) return {sec:$('#overview')};
    let tab=b||null, target=null;
    if(el!==sec){ const pn=el.closest('.tabpanel'); tab=pn?pn.dataset.tab:null; target=el; }
    return {sec, tab, target};
  }
  function showTab(sec, tab){
    const bar=sec.querySelector(':scope > .tabbar'); if(!bar) return;
    const ids=[...bar.querySelectorAll('a')].map(a=>a.dataset.tab);
    if(!ids.includes(tab)) tab = DEFAULT_TAB[sec.id] && ids.includes(DEFAULT_TAB[sec.id]) ? DEFAULT_TAB[sec.id] : ids[0];
    sec.querySelectorAll(':scope > .tabpanel').forEach(p=>{ p.hidden = p.dataset.tab!==tab; });
    bar.querySelectorAll('a').forEach(a=>{ const on=a.dataset.tab===tab; a.setAttribute('aria-selected',String(on)); a.tabIndex=on?0:-1; });
    return tab;
  }
  const currentTab = sec => { const a=sec.querySelector(':scope > .tabbar a[aria-selected="true"]'); return a?a.dataset.tab:null; };
  // a target inside a closed disclosure (search hit, deep link) opens it first
  function openDetails(el){ for(let d=el.closest('details'); d; d=d.parentElement && d.parentElement.closest('details')) d.open=true; }
  // keep the selected tab visible in a tab strip that scrolls sideways (phones)
  function revealTab(sec){ const bar=sec.querySelector(':scope > .tabbar'), a=bar&&bar.querySelector('a[aria-selected="true"]'); if(!a) return;
    const l=a.offsetLeft-bar.offsetLeft, r=l+a.offsetWidth; if(l<bar.scrollLeft) bar.scrollLeft=l-16; else if(r>bar.scrollLeft+bar.clientWidth) bar.scrollLeft=r-bar.clientWidth+16; }
  function placeModel(sec){
    const v=$('#cadView'); if(!v) return;
    const slot=[...sec.querySelectorAll('.model-slot')].find(x=>!x.closest('[hidden]')); if(slot && v.parentElement!==slot) slot.appendChild(v);
  }
  function go(hash, focus){
    const r=resolve(hash); const sec=r.sec; if(!sec) return;
    if(report){ const t=r.target||sec; openDetails(t); t.scrollIntoView({block:'start'}); return; }   // report view keeps every page and panel open
    const prevTab = cur===sec ? currentTab(sec) : undefined;
    secs.forEach(s=>{ s.hidden = s!==sec; });
    const tab=showTab(sec, r.tab);
    placeModel(sec);
    $$('#sidebar a').forEach(a=>{ const on=a.dataset.sec===sec.id; if(on) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
    root.classList.toggle('on-home', sec.id==='overview');
    const changed = cur!==sec; cur=sec;
    document.title = (sec.id==='overview'?'':sec.dataset.title+' · ')+'Lift + Cruise VTOL Review';
    if(changed || tab!==prevTab) onShow(sec);
    closeDrawer();
    if(r.target) openDetails(r.target);
    requestAnimationFrame(()=>{
      if(r.target){ r.target.scrollIntoView({block:'start'}); } else if(changed) window.scrollTo(0,0);
      if(focus || r.focusHead){ const f = r.target || sec.querySelector('.sechead h2'); if(f){ if(!f.hasAttribute('tabindex')) f.setAttribute('tabindex','-1'); f.focus({preventScroll:true}); } }
      revealTab(sec);
    });
  }
  // history: a new page pushes an entry; a tab or heading in the same page, and the skip link, replace it
  function navigate(hash, focus){ const r=resolve(hash), same = r.sec===cur, skip = hash==='#main';
    if(!skip && location.hash!==hash){ try{ history[same?'replaceState':'pushState'](null,'',hash); }catch(e){} }
    go(hash, focus); }
  // tab keyboard: arrow keys move between tabs (roving tabindex)
  function tabKeys(e){ const a=e.target.closest('.tabbar a'); if(!a) return; const list=[...a.parentElement.querySelectorAll('a')], i=list.indexOf(a);
    const n={ArrowRight:i+1, ArrowLeft:i-1, Home:0, End:list.length-1}[e.key]; if(n===undefined) return; e.preventDefault();
    const t=list[(n+list.length)%list.length]; t.focus(); navigate(t.getAttribute('href')); }

  // ---------- theme ----------
  function applyTheme(t){ root.dataset.theme=t; const b=$('#themeBtn'); if(b){ b.setAttribute('aria-label', t==='dark'?'Switch to light theme':'Switch to dark theme'); b.querySelector('.msym').textContent = t==='dark'?'light_mode':'dark_mode'; }
    const mc=document.querySelector('meta[name="theme-color"]'); if(mc) mc.content = t==='dark'?'#0E1116':'#F7F8FA'; }
  function toggleTheme(){ const t=root.dataset.theme==='light'?'dark':'light'; applyTheme(t); store.set('vtol-theme',t); onShow(report?null:cur); }

  // ---------- drawer (narrow screens) ----------
  const narrow = () => window.matchMedia('(max-width: 899px)').matches;
  function openDrawer(){ if(!narrow()) return; root.classList.add('drawer-open'); $('#scrim').hidden=false; $('#navBtn').setAttribute('aria-expanded','true'); const a=$('#sidebar a[aria-current]')||$('#sidebar a'); if(a) a.focus(); }
  function closeDrawer(){ if(!root.classList.contains('drawer-open')) return; root.classList.remove('drawer-open'); $('#scrim').hidden=true; $('#navBtn').setAttribute('aria-expanded','false'); }
  function trapDrawer(e){ if(!root.classList.contains('drawer-open') || e.key!=='Tab') return; const f=[...$('#sidebar').querySelectorAll('a')]; if(!f.length) return;
    const first=f[0], last=f[f.length-1]; if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); } else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); } }

  // ---------- report view: the traditional document from the same content ----------
  function setReport(on, forPrint){
    if(on===report) return; report=on; root.classList.toggle('report', on);
    const b=$('#reportBtn'); if(b){ b.setAttribute('aria-pressed',String(on)); b.querySelector('.rb-t').textContent = on?'Exit report view':'Report view'; }
    if(on){ secs.forEach(s=>{ s.hidden=false; s.querySelectorAll(':scope > .tabpanel').forEach(p=>p.hidden=false); });
      openedForReport=$$('main details:not([open])'); openedForReport.forEach(d=>d.open=true);
      if(forPrint) root.classList.add('printing');
      onShow(null); if(!forPrint) window.scrollTo(0,0);
    } else { root.classList.remove('printing'); openedForReport.forEach(d=>d.open=false); openedForReport=[]; go(location.hash); }
  }

  // ---------- search palette ----------
  let index=null;
  function buildIndex(){ index=[];
    secs.forEach(s=>{ index.push({t:s.dataset.title, sub:GROUPS[s.dataset.group]||'Home', h:'#'+s.id, k:'page'});
      s.querySelectorAll('h3[id], h4[id], figure[id]').forEach(h=>{ const t=(h.matches('figure')?(h.querySelector('figcaption')||h):h).textContent.replace(/^\s*(Figure\s+)?[\d.]+\s*/,'').trim();
        if(t) index.push({t, sub:s.dataset.title, h:'#'+h.id, k:'section'}); }); }); }
  function openPalette(){ if(!index) buildIndex(); const d=$('#palette'); if(d.showModal) d.showModal(); else d.setAttribute('open',''); const i=$('#palQ'); i.value=''; renderPal(''); i.focus(); }
  function closePalette(){ const d=$('#palette'); if(d.close) d.close(); else d.removeAttribute('open'); }
  let palSel=0, palHits=[];
  function renderPal(q){ const toks=q.toLowerCase().split(/\s+/).filter(Boolean);
    palHits = (toks.length? index.filter(x=>toks.every(t=>(x.t+' '+x.sub).toLowerCase().includes(t))) : index.filter(x=>x.k==='page')).slice(0,40); palSel=0;
    const esc = t => String(t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
    $('#palList').innerHTML = palHits.map((x,i)=>`<li role="option" id="po-${i}" aria-selected="${i===0}" data-i="${i}">${icon(x.k==='page'?'article':'subdirectory_arrow_right')}<span class="po-t">${esc(x.t)}</span><span class="po-s">${esc(x.sub)}</span></li>`).join('');
    $('#palEmpty').textContent = palHits.length ? '' : `No section matches “${q}”. Try a part name, a quantity or a chapter.`;
    const qi=$('#palQ'); qi.setAttribute('aria-expanded', String(!!palHits.length)); if(palHits.length) qi.setAttribute('aria-activedescendant','po-0'); else qi.removeAttribute('aria-activedescendant'); }
  function palMove(d){ if(!palHits.length) return; palSel=(palSel+d+palHits.length)%palHits.length; $$('#palList li[role=option]').forEach((li,i)=>li.setAttribute('aria-selected',String(i===palSel)));
    const li=$('#po-'+palSel); if(li){ li.scrollIntoView({block:'nearest'}); $('#palQ').setAttribute('aria-activedescendant','po-'+palSel); } }
  function palGo(i){ const x=palHits[i]; if(!x) return; closePalette(); if(report) setReport(false); navigate(x.h, true); }

  // ---------- init ----------
  function init(opts){
    onShow = opts && opts.onShow || onShow;
    secs = $$('section.sec');
    applyTheme(store.get('vtol-theme')==='light'?'light':'dark');
    buildSidebar(); secs.forEach(buildTabs); buildSheets();
    const issue=$('.cover .mast .org:last-child'); if(issue && $('#issueChip')) $('#issueChip').textContent = issue.textContent.replace(/\s+/g,' ').trim();
    // every in-page link goes through the router
    document.addEventListener('click', e=>{ const l=e.target.closest('a[href^="#"]'); if(!l || e.defaultPrevented || e.button!==0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const h=l.getAttribute('href'); if(h.length<2) return; const id=h.slice(1).split('/')[0]; if(!document.getElementById(id) && id!=='main') return;
      e.preventDefault(); navigate(h, !l.closest('.tabbar')); });
    document.addEventListener('keydown', e=>{
      if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); openPalette(); return; }
      if(e.key==='Escape' && root.classList.contains('drawer-open')){ closeDrawer(); $('#navBtn').focus(); }
      trapDrawer(e); tabKeys(e); });
    addEventListener('popstate', ()=>go(location.hash));
    $('#themeBtn').addEventListener('click', toggleTheme);
    $('#reportBtn').addEventListener('click', ()=>setReport(!report));
    $('#searchBtn').addEventListener('click', openPalette);
    $('#navBtn').addEventListener('click', ()=>root.classList.contains('drawer-open')?closeDrawer():openDrawer());
    $('#scrim').addEventListener('click', ()=>{ closeDrawer(); $('#navBtn').focus(); });
    const q=$('#palQ'); q.addEventListener('input',()=>renderPal(q.value));
    q.addEventListener('keydown',e=>{ if(e.key==='ArrowDown'){ e.preventDefault(); palMove(1); } else if(e.key==='ArrowUp'){ e.preventDefault(); palMove(-1); } else if(e.key==='Enter'){ e.preventDefault(); palGo(palSel); } });
    $('#palList').addEventListener('click',e=>{ const li=e.target.closest('li[data-i]'); if(li) palGo(+li.dataset.i); });
    $('#palette').addEventListener('click',e=>{ if(e.target.id==='palette') closePalette(); });
    // printing always produces the full report
    addEventListener('beforeprint', ()=>{ if(!report){ printReport=true; setReport(true, true); } else { root.classList.add('printing'); onShow(null); } });
    addEventListener('afterprint', ()=>{ if(printReport){ printReport=false; setReport(false); } else { root.classList.remove('printing'); onShow(null); } });
    addEventListener('resize', ()=>{ if(!narrow()) closeDrawer(); });
    go(location.hash);
  }
  return {init, go:navigate};
})();
