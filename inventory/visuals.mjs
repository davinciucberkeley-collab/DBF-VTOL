// Shared visual helpers for the overview page: one icon set (24 px grid, 1.7 stroke, currentColor) and small chart builders.
// Output is plain HTML/SVG strings; colours come from CSS classes (tokens in src/style.css).
const P = {
  alert: '<path d="M12 3.5 22 20.5H2z"/><path d="M12 10v5M12 17.8v.2"/>',
  block: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.2v.2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 17v.2"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M7.7 12.5l3 3 5.6-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.6 9.6c-.5-1-1.4-1.6-2.6-1.6-1.5 0-2.6.8-2.6 2s1 1.7 2.6 2 2.6.8 2.6 2-1.1 2-2.6 2c-1.2 0-2.1-.6-2.6-1.6M12 6v2M12 16v2"/>',
  truck: '<path d="M2 6h12v10H2zM14 10h4l3 3v3h-7z"/><circle cx="6.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
  box: '<path d="M3 7.5l9-4.5 9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/>',
  wrench: '<path d="M14.7 6.3a4.5 4.5 0 0 0 5 5.9l-.2.2L8.8 21a2 2 0 0 1-2.8-2.8l8.8-10.7z"/><path d="M15 4.5l-1.5 3 3 3 3-1.5"/>',
  print: '<path d="M7 9V3h10v6M7 18H4v-8h16v8h-3"/><path d="M7 14h10v7H7z"/>',
  bolt: '<path d="M13 2.5 4.5 14H11l-1 7.5L19.5 10H13z"/>',
  plug: '<path d="M9 2.5V7M15 2.5V7M6 7h12v4a6 6 0 0 1-12 0zM12 17v4.5"/>',
  battery: '<rect x="2" y="7" width="17" height="10" rx="1"/><path d="M22 10.5v3M10.5 8.5l-2.5 3.5h3.5l-2.5 3.5"/>',
  eye: '<path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3.5 3.5l17 17"/>',
  pencil: '<path d="M4 20l1-5L16 4l4 4L9 19z"/><path d="M14 6l4 4"/>',
  tag: '<path d="M3 12.5V4h8.5L21 13.5 13.5 21z"/><circle cx="7.5" cy="8.5" r="1.4"/>',
  hash: '<path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16"/>',
  bin: '<path d="M3 4h18v5H3zM5 9v11h14V9M10 13h4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',
  docok: '<path d="M6 2.5h9l5 5V21.5H6z"/><path d="M14.5 2.5v5.5h5.5M9 15l2.2 2.2L15.5 13"/>',
  swap: '<path d="M4 8h15l-3.5-3.5M20 16H5l3.5 3.5"/>',
  flask: '<path d="M9 3h6M10 3v6L4 20h16l-6-11V3"/>',
  can: '<rect x="3" y="9" width="18" height="11" rx="1"/><path d="M8 9V5.5h8V9M3 14h18"/>',
  bag: '<path d="M5 8h14l1 13H4zM9 8V6a3 3 0 0 1 6 0v2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>',
  scale: '<path d="M12 4v16M6 20h12M4 8h16M4 8l-2.5 6a3 3 0 0 0 5 0zM20 8l-2.5 6a3 3 0 0 0 5 0z"/>',
  balance: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.2"/><path d="M12 3.5v6M12 14.5v6"/>',
  wave: '<path d="M2 12h4l2.5-7 4 14 3-9 1.5 2H22"/>',
  prop: '<circle cx="12" cy="12" r="1.8"/><path d="M12 10.2C12 6 13.5 3.5 16 3.5c1.6 0 2.4 1.6 1.4 3.4L13.8 10.6M13.8 12c4.2 0 6.7 1.5 6.7 4 0 1.6-1.6 2.4-3.4 1.4L13.4 13.8M12 13.8c0 4.2-1.5 6.7-4 6.7-1.6 0-2.4-1.6-1.4-3.4l3.7-3.7M10.2 12C6 12 3.5 10.5 3.5 8c0-1.6 1.6-2.4 3.4-1.4l3.7 3.7"/>',
  gauge: '<path d="M3.5 18a9 9 0 1 1 17 0M12 18l4-6"/><circle cx="12" cy="18" r="1.2"/>',
  ruler: '<rect x="2.5" y="8" width="19" height="8" rx="1"/><path d="M6.5 8v3.5M10.5 8v2.5M14.5 8v3.5M18.5 8v2.5"/>',
  bulb: '<path d="M9 18h6M10 21.5h4M12 2.5a6 6 0 0 0-4 10.5c1 1 1 2 1 3.5h6c0-1.5 0-2.5 1-3.500A6 6 0 0 0 12 2.500z"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9M15 4.500v5M9 14.500v5"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.8-6.100M20.5 3.500v4.500H16"/>',
  pin: '<path d="M12 21.500s-7-6.3-7-11.500a7 7 0 0 1 14 0c0 5.2-7 11.5-7 11.500z"/><circle cx="12" cy="10" r="2.5"/>',
  hot: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4 0 1.5.7 2.5 1.8 2.500C11 9 11 6 12 3z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.700l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.700l1-1"/>',
  dots: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  cut: '<path d="M4 4l12 12M4 20L20 4"/><circle cx="6" cy="6" r="2.2"/><circle cx="6" cy="18" r="2.2"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3v6.500M12 14.500V21M3 12h6.500M14.5 12H21"/>',
  cap: '<path d="M8 4v16M16 4v16M3 12h5M16 12h5"/>',
  ground: '<path d="M12 3v11M7 14h10M8.5 17.500h7M10.5 21h3"/>',
  remote: '<path d="M4.5 15a10 10 0 0 1 15 0M7.5 18a6 6 0 0 1 9 0"/><circle cx="12" cy="20.5" r="1"/><path d="M12 12v.01"/>',
};
export const ic = (name, cls = '') => {
  if (!P[name]) throw new Error('unknown icon ' + name);
  return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name]}</svg>`;
};
// numbered step flow; steps: [{n, icon, title, sub, badge, badgeCls}]
export const flow = (steps, label, cls = '') => `<ol class="flow ${cls}" aria-label="${label}">${steps.map(s => `<li><span class="fn" aria-hidden="true">${s.n}</span><span class="fi">${s.icon ? ic(s.icon) : ''}</span><div class="ft"><b>${s.title}</b>${s.sub ? `<span class="fs">${s.sub}</span>` : ''}${s.badge ? `<span class="badge ${s.badgeCls || ''}">${s.badge}</span>` : ''}</div></li>`).join('')}</ol>`;
// bars drawn as a percentage of a rating: tick at 100 %, the over-limit part in the bad colour.
// rows: [{label, sub, val, rating, valTxt}]
export const ratioBars = (rows, aria, axisLabel = 'rating') => {
  const mx = Math.max(1.6, ...rows.map(r => r.val / r.rating * 1.08)), pc = v => (v / mx * 100).toFixed(2) + '%';
  return `<div class="hb" role="img" aria-label="${aria}">${rows.map(r => { const k = r.val / r.rating, over = k > 1;
    return `<div class="hbr"><div class="hbl">${ic(over ? 'alert' : 'check', over ? 'bad' : 'ok')}<span>${r.label}${r.sub ? `<small>${r.sub}</small>` : ''}</span></div><div class="hbt"><i class="seg ok" style="left:0;width:${pc(Math.min(k, 1))}"></i>${over ? `<i class="seg bad" style="left:${pc(1)};width:${((k - 1) / mx * 100).toFixed(2)}%"></i>` : ''}<b class="mk" style="left:${pc(1)}"></b></div><div class="hbv">${r.valTxt}<small class="${over ? 'bad' : 'ok'}">×${k.toFixed(2)}</small></div></div>`; }).join('')}<div class="hbr hbaxis"><div class="hbl"></div><div class="hbt"><span class="mklab" style="left:${pc(1)}">${axisLabel}</span></div><div class="hbv"></div></div></div>`;
};
// plain horizontal bars: rows [{label, val, txt, cls}]
export const hbars = (rows, aria, max) => { const mx = max || Math.max(...rows.map(r => r.val)) * 1.05;
  return `<div class="hb" role="img" aria-label="${aria}">${rows.map(r => `<div class="hbr"><div class="hbl">${r.label}</div><div class="hbt"><i class="seg ${r.cls || 'c1'}" style="left:0;width:${(r.val / mx * 100).toFixed(2)}%"></i></div><div class="hbv">${r.txt}</div></div>`).join('')}</div>`; };
