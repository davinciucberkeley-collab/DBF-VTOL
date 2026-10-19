/* Panel wiring, HUD + primary flight display, annunciators, toasts, rotor schematic, dialogs
   (quick start, pause / crash menu), touch throttle + quick chips, procedural sound, viewer prefs.
   Owned by the UI engineer. Additive changes only to the returned API.

   Principles
   - The DOM is a *view* of S: controls are re-synced from S every frame, so any module may change S.
   - Flight logic lives in physics.js commands; this file calls them and shows their messages.
   - Newer flight fields (S.ias, S.vs, S.warnings, S.apText, S.crash, …) are read defensively: when a field is
     missing the UI falls back to the original fields (S.u, S.w, S.psi, …) so it works with any physics build.
   - Optional exports of other modules are reached through namespace imports and feature-checked, so a
     missing export degrades a feature instead of breaking module linking. */
import { $, $$, on, clamp } from './util.js';
import * as CFG from './config.js';
import * as state from './state.js';
import { CAM_MODES, FOV_DEFAULT } from './camera.js';
import * as cmd from './physics.js';

const { UNITS, ROTOR_X } = CFG;
const RAD2DEG = 180 / Math.PI;
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

const CAM_TOASTS = {
  orbit: 'Orbit camera — drag to rotate, scroll or pinch to zoom',
  chase: 'Chase camera — scroll to change FOV',
  cockpit: 'Cockpit view — scroll to change FOV',
  tower: 'Tower camera',
};

/** PFD speed-tape bands in kt (from config SPEEDS when present). */
const SPD = (() => {
  const s = CFG.SPEEDS || {}, p = CFG.PHYS || {}, k = UNITS.KT_PER_MS;
  return {
    vs: fin(s.vs, 26.3) * k,                          // 1 g wing stall: below this the rotors must carry the load
    vStow: fin(s.vStow, fin(p.stowSpeed, 33)) * k,    // rotors stop & lock above this: wing-borne
    vmo: fin(s.vmo, 72) * k, vne: fin(s.vne, 80) * k,
  };
})();

/* ═══════════════════════════════ Viewer preferences ═══════════════════════════════
   One JSON blob in localStorage, every access in try/catch (private mode, blocked storage, previews).
   Only per-viewer settings are stored — never flight state. */
const PREF_KEY = 'vtol.prefs.v1';
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch (_) { return {}; }
}
function storePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (_) { /* storage unavailable */ } }

/* ═══════════════════════════════ Procedural sound ═══════════════════════════════
   WebAudio graph, created inside the first user gesture (browser autoplay policy):
     lift rotors: two detuned sawtooths at the blade-pass frequency (∝ mean rotor rpm) → lowpass,
                  amplitude-modulated by a slow "beat" LFO (8 rotors never quite in phase) + band-passed wash noise;
     pusher prop: sawtooth at a higher blade-pass frequency (∝ prop rpm) → lowpass;
     chimes: short two-tone sine for new critical warnings.
   Everything ramps to silence while muted, paused or hidden. */
function createAudio() {
  let ctx = null, n = null;
  let muted = false, volume = 0.6, lastChime = -10;

  function ensure() {
    try {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      build();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (_) { ctx = null; n = null; }
  }

  function build() {
    const g = v => { const x = ctx.createGain(); x.gain.value = v; return x; };
    const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
    const filt = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const master = g(0); master.connect(ctx.destination);
    // Lift rotors
    const rLP = filt('lowpass', 300, 0.8), rGain = g(0), chop = g(0.75);
    const r1 = osc('sawtooth', 40), r2 = osc('sawtooth', 40); r2.detune.value = 22;
    r1.connect(rLP); r2.connect(rLP); rLP.connect(chop); chop.connect(rGain); rGain.connect(master);
    const lfo = osc('sine', 7), lfoAmt = g(0.25); lfo.connect(lfoAmt); lfoAmt.connect(chop.gain);
    // Rotor wash noise (2 s looped white noise)
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true; noise.start();
    const nBP = filt('bandpass', 700, 0.6), nGain = g(0); noise.connect(nBP); nBP.connect(nGain); nGain.connect(master);
    // Pusher prop
    const p1 = osc('sawtooth', 60), pLP = filt('lowpass', 500, 0.9), pGain = g(0);
    p1.connect(pLP); pLP.connect(pGain); pGain.connect(master);
    // Chimes
    const chimeBus = g(0.5); chimeBus.connect(master);
    n = { master, rLP, rGain, r1, r2, lfo, nBP, nGain, p1, pLP, pGain, chimeBus };
  }

  /** Per-frame: follow rotor/prop rpm and load. */
  function update(S) {
    if (!ctx || !n) return;
    const t = ctx.currentTime, tc = 0.08;
    let sum = 0, cnt = 0;
    for (const r of S.rotors) { sum += fin(r.rpm); cnt++; }
    const rpm = cnt ? sum / cnt : 0, prop = fin(S.prop && S.prop.rpm);
    const load = clamp(fin(S.rotorLift, rpm), 0, 1.6);
    const silent = muted || S.paused || document.hidden;
    n.master.gain.setTargetAtTime(silent ? 0 : volume * 0.55, t, silent ? 0.05 : 0.15);
    n.r1.frequency.setTargetAtTime(26 + 92 * rpm, t, tc);
    n.r2.frequency.setTargetAtTime(26 + 92 * rpm, t, tc);
    n.rLP.frequency.setTargetAtTime(160 + 1300 * rpm * (0.7 + 0.3 * load), t, tc);
    n.rGain.gain.setTargetAtTime(0.26 * rpm * rpm * (0.55 + 0.45 * Math.min(1, load)), t, tc);
    n.lfo.frequency.setTargetAtTime(3 + 9 * rpm, t, tc);
    n.nBP.frequency.setTargetAtTime(380 + 1400 * rpm, t, tc);
    n.nGain.gain.setTargetAtTime(0.16 * rpm * (0.4 + 0.6 * Math.min(1, load)), t, tc);
    n.p1.frequency.setTargetAtTime(48 + 190 * prop, t, tc);
    n.pLP.frequency.setTargetAtTime(220 + 1500 * prop, t, tc);
    n.pGain.gain.setTargetAtTime(0.16 * prop * prop, t, tc);
  }

  /** Two-tone warning chime (rate limited). */
  function chime() {
    if (!ctx || !n || muted) return;
    const t = ctx.currentTime; if (t - lastChime < 1.2) return; lastChime = t;
    [[880, 0], [660, 0.16]].forEach(([f, dt]) => {
      const o = ctx.createOscillator(), e = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f; e.gain.value = 0;
      e.gain.setTargetAtTime(0.35, t + dt, 0.01); e.gain.setTargetAtTime(0, t + dt + 0.11, 0.03);
      o.connect(e); e.connect(n.chimeBus); o.start(t + dt); o.stop(t + dt + 0.4);
    });
  }

  return {
    ensure, update, chime,
    setMuted(v) { muted = !!v; }, setVolume(v) { volume = clamp(fin(v, 0.6), 0, 1); },
    get muted() { return muted; }, get volume() { return volume; }, get started() { return !!ctx; },
  };
}

/* ═══════════════════════════════ Primary flight display ═══════════════════════════════
   Canvas PFD: attitude indicator (sky/ground, pitch ladder, fixed roll scale with moving sky pointer,
   flight-path marker), airspeed tape with transition bands and 6 s trend vector, altitude tape with
   ground level and autopilot target bug, vertical-speed strip, heading tape with track marker.
   Sign conventions are documented on drawAttitude. Drawn at ~30 Hz from ui.update(). */
const PFD_C = {
  sky0: '#1c4c8c', sky1: '#4f8fd2', gnd0: '#7b5631', gnd1: '#3f2a15', white: '#f2f6fb', tape: 'rgba(8,13,22,.86)',
  amber: '#ffb547', cyan: '#7fd4ff', red: '#ff5d52', green: '#62df8e', magenta: '#ff7be5', sym: '#ffd84a', dim: '#9aa9bc',
};
function createPFD(canvas) {
  const ctx = canvas && canvas.getContext && canvas.getContext('2d');
  if (!ctx) return { draw() {}, resize() {} };
  let W = 0, H = 0, dpr = 1, trend = 0, lastIas = null;

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) { W = 0; return; }
    dpr = Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height;
    const bw = Math.round(W * dpr), bh = Math.round(H * dpr);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(canvas);

  const rr = (x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };
  const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  const font = (px, w = 600) => { ctx.font = `${w} ${px}px "JetBrains Mono", ui-monospace, monospace`; };

  /** Read every value defensively from S (newer fields first, original fields as fallback). */
  function read(S) {
    const ias = Math.max(0, fin(S.ias, fin(S.u)) * UNITS.KT_PER_MS);
    const altFt = fin(S.pos && S.pos.y) * UNITS.FT_PER_M;
    const aglFt = Number.isFinite(S.agl) ? S.agl * UNITS.FT_PER_M : altFt;
    return {
      ias, altFt, groundFt: altFt - aglFt, aglFt,
      pitch: fin(S.pitch) * RAD2DEG, roll: fin(S.roll),
      vs: fin(S.vs, fin(S.w)) * UNITS.FPM_PER_MS,
      hdg: Number.isFinite(S.headingDeg) ? S.headingDeg % 360 : (((-fin(S.psi) * RAD2DEG) % 360) + 360) % 360,
      trk: Number.isFinite(S.trackDeg) && fin(S.gs) > 2 ? S.trackDeg % 360 : null,
      gamma: Number.isFinite(S.gamma) && !S.onGround && ias > 15 ? S.gamma * RAD2DEG : null,
      apFt: S.ap && Number.isFinite(S.apAlt) ? S.apAlt * UNITS.FT_PER_M : null,
    };
  }

  function draw(S, dt) {
    if (!W) resize();
    if (!W) return;
    const d = read(S);
    if (dt > 0 && lastIas !== null && !S.paused) {
      const a = (d.ias - lastIas) / dt;                       // kt/s
      trend += (a * 6 - trend) * Math.min(1, dt * 2.5);     // 6 s prediction, smoothed
    }
    lastIas = d.ias;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const fs = H < 150 ? 9 : 10.5;
    const hdgH = Math.round(clamp(H * 0.12, 15, 21));
    const spdW = Math.round(clamp(W * 0.17, 34, 46));
    const vsW = Math.round(clamp(W * 0.05, 8, 12));
    const altW = Math.round(clamp(W * 0.2, 40, 54));
    const ax0 = spdW + 2, ax1 = W - altW - vsW - 3, ay0 = 0, ay1 = H - hdgH - 2;
    drawAttitude(d, ax0, ay0, ax1, ay1, fs, S);
    drawSpeed(d, 0, ay0, spdW, ay1 - ay0, fs);
    drawAlt(d, ax1 + 2, ay0, altW, ay1 - ay0, fs);
    drawVS(d, W - vsW, ay0, vsW, ay1 - ay0, fs, ax1);
    drawHeading(d, 0, H - hdgH, W, hdgH, fs);
  }

  /* Attitude. three.js YXZ: S.pitch > 0 = nose up → horizon moves down. S.roll > 0 = right wing up (left bank);
     the world then appears rotated clockwise, which is a positive canvas rotation (y axis points down). */
  function drawAttitude(d, x0, y0, x1, y1, fs, S) {
    const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, ppd = h / 38, big = (w + h) * 2;
    ctx.save(); rr(x0, y0, w, h, 5); ctx.clip();
    ctx.translate(cx, cy); ctx.rotate(d.roll);
    ctx.save(); ctx.translate(0, clamp(d.pitch, -80, 80) * ppd);
    let gr = ctx.createLinearGradient(0, -h, 0, 0); gr.addColorStop(0, PFD_C.sky0); gr.addColorStop(1, PFD_C.sky1);
    ctx.fillStyle = gr; ctx.fillRect(-big, -big, big * 2, big);
    gr = ctx.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, PFD_C.gnd0); gr.addColorStop(1, PFD_C.gnd1);
    ctx.fillStyle = gr; ctx.fillRect(-big, 0, big * 2, big);
    ctx.strokeStyle = PFD_C.white; ctx.lineWidth = 1.5; line(-big, 0, big, 0);
    // Pitch ladder: every 5°, labels every 10°, dashed below the horizon
    ctx.lineWidth = 1.2; ctx.fillStyle = PFD_C.white; font(fs - 1); ctx.textBaseline = 'middle';
    for (let a = -60; a <= 60; a += 5) {
      if (!a) continue;
      const y = -a * ppd;
      if (Math.abs(y + d.pitch * ppd) > h * 0.62) continue;
      const major = a % 10 === 0, half = w * (major ? 0.17 : 0.08);
      ctx.setLineDash(a < 0 ? [4, 3] : []);
      line(-half, y, half, y);
      if (major) {
        ctx.setLineDash([]);
        const tk = a > 0 ? 4 : -4; line(-half, y, -half, y + tk); line(half, y, half, y + tk);
        ctx.textAlign = 'right'; ctx.fillText(Math.abs(a), -half - 3, y);
        ctx.textAlign = 'left'; ctx.fillText(Math.abs(a), half + 3, y);
      }
    }
    ctx.setLineDash([]);
    // Flight-path marker (where the aircraft is actually going)
    if (d.gamma !== null) {
      const y = -d.gamma * ppd; ctx.strokeStyle = PFD_C.green; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, y, 4, 0, Math.PI * 2); ctx.stroke(); line(-11, y, -4, y); line(4, y, 11, y); line(0, y - 4, 0, y - 8);
    }
    ctx.restore();                                   // still rolled, no pitch offset
    const R = Math.min(w, h) * 0.43, bankWarn = Math.abs(d.roll) > 35 / RAD2DEG;
    // Sky pointer (moves with the horizon)
    ctx.fillStyle = bankWarn ? PFD_C.amber : PFD_C.white;
    ctx.beginPath(); ctx.moveTo(0, -R + 1); ctx.lineTo(-5, -R + 9); ctx.lineTo(5, -R + 9); ctx.closePath(); ctx.fill();
    ctx.rotate(-d.roll);                             // back to the aircraft frame
    // Fixed roll scale 0/10/20/30/45/60
    ctx.strokeStyle = PFD_C.white; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2 - Math.PI / 3, -Math.PI / 2 + Math.PI / 3); ctx.stroke();
    for (const a of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
      const r = (a - 90) / RAD2DEG, len = Math.abs(a) % 30 === 0 ? 7 : 4;
      line(Math.cos(r) * R, Math.sin(r) * R, Math.cos(r) * (R + len), Math.sin(r) * (R + len));
    }
    ctx.fillStyle = PFD_C.white; ctx.beginPath(); ctx.moveTo(0, -R); ctx.lineTo(-4, -R - 7); ctx.lineTo(4, -R - 7); ctx.closePath(); ctx.fill();
    // Aircraft symbol (fixed)
    const ws = w * 0.2;
    ctx.lineWidth = 4; ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.moveTo(-ws * 1.6, 0); ctx.lineTo(-ws * 0.55, 0); ctx.lineTo(-ws * 0.55, 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ws * 1.6, 0); ctx.lineTo(ws * 0.55, 0); ctx.lineTo(ws * 0.55, 5); ctx.stroke();
    ctx.lineWidth = 2.4; ctx.strokeStyle = PFD_C.sym;
    ctx.beginPath(); ctx.moveTo(-ws * 1.6, 0); ctx.lineTo(-ws * 0.55, 0); ctx.lineTo(-ws * 0.55, 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ws * 1.6, 0); ctx.lineTo(ws * 0.55, 0); ctx.lineTo(ws * 0.55, 5); ctx.stroke();
    ctx.fillStyle = PFD_C.sym; ctx.fillRect(-2.5, -2.5, 5, 5);
    ctx.restore();
    // V/S readout (bottom-right of the attitude area)
    if (Math.abs(d.vs) >= 50) {
      font(fs); ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = PFD_C.white;
      ctx.fillText((d.vs > 0 ? '+' : '') + Math.round(d.vs / 10) * 10, x1 - 4, y1 - 4);
    }
    if (S.paused) {
      font(fs + 1, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = PFD_C.amber;
      ctx.fillText('PAUSED', cx, y0 + 4);
    }
  }

  /** Readout box with a pointer toward the tape centre. dir = 1 points right, -1 points left. */
  function readout(x, y, w, h, dir, text, fs, color) {
    ctx.fillStyle = '#05080e'; ctx.strokeStyle = PFD_C.white; ctx.lineWidth = 1;
    ctx.beginPath();
    if (dir > 0) { ctx.moveTo(x, y - h / 2); ctx.lineTo(x + w - 5, y - h / 2); ctx.lineTo(x + w, y); ctx.lineTo(x + w - 5, y + h / 2); ctx.lineTo(x, y + h / 2); }
    else { ctx.moveTo(x + w, y - h / 2); ctx.lineTo(x + 5, y - h / 2); ctx.lineTo(x, y); ctx.lineTo(x + 5, y + h / 2); ctx.lineTo(x + w, y + h / 2); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    font(fs + 1.5, 600); ctx.fillStyle = color || PFD_C.white; ctx.textBaseline = 'middle';
    ctx.textAlign = dir > 0 ? 'right' : 'left'; ctx.fillText(text, dir > 0 ? x + w - 7 : x + 7, y + 0.5);
  }

  function drawSpeed(d, x, y, w, h, fs) {
    const mid = y + h / 2, ppk = h / 64, Y = v => mid - (v - d.ias) * ppk;
    ctx.save(); ctx.fillStyle = PFD_C.tape; rr(x, y, w, h, 4); ctx.fill(); ctx.clip();
    // Bands on the right edge: rotor-borne (amber), transition (striped), wing-borne (cyan), above VMO (red)
    const band = (lo, hi, col) => { const a = Y(hi), b = Y(lo); if (b < y || a > y + h) return; ctx.fillStyle = col; ctx.fillRect(x + w - 4, a, 3, b - a); };
    band(0, SPD.vs, PFD_C.amber);
    band(SPD.vs, SPD.vStow, 'rgba(242,246,251,.55)');
    band(SPD.vStow, SPD.vmo, PFD_C.cyan);
    band(SPD.vmo, SPD.vmo + 300, PFD_C.red);
    ctx.strokeStyle = PFD_C.white; ctx.fillStyle = PFD_C.white; ctx.lineWidth = 1; font(fs); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = Math.max(0, Math.floor((d.ias - 36) / 10) * 10); v <= d.ias + 36; v += 10) {
      const yy = Y(v); line(x + w - 11, yy, x + w - 5, yy);
      if (v % 20 === 0) ctx.fillText(v, x + w - 13, yy);
    }
    // Trend vector (where the speed will be in 6 s)
    if (Math.abs(trend) > 1.5) {
      const yt = clamp(Y(d.ias + trend), y + 2, y + h - 2);
      ctx.strokeStyle = PFD_C.magenta; ctx.lineWidth = 2; line(x + w - 7, mid, x + w - 7, yt);
      ctx.beginPath(); ctx.moveTo(x + w - 11, yt + (trend > 0 ? 5 : -5)); ctx.lineTo(x + w - 7, yt); ctx.lineTo(x + w - 3, yt + (trend > 0 ? 5 : -5)); ctx.stroke();
    }
    ctx.restore();
    font(fs - 1); ctx.fillStyle = PFD_C.dim; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('KT', x + 3, y + 3);
    readout(x, mid, w - 1, fs + 9, 1, String(Math.round(d.ias)), fs,
      d.ias > SPD.vmo ? PFD_C.red : null);
  }

  function drawAlt(d, x, y, w, h, fs) {
    const mid = y + h / 2, ppf = h / 360, Y = a => mid - (a - d.altFt) * ppf;
    ctx.save(); ctx.fillStyle = PFD_C.tape; rr(x, y, w, h, 4); ctx.fill(); ctx.clip();
    // Ground level (hatched brown)
    const yg = Y(d.groundFt);
    if (yg < y + h) {
      ctx.fillStyle = 'rgba(123,86,49,.75)'; ctx.fillRect(x, yg, w, y + h - yg);
      ctx.strokeStyle = 'rgba(255,200,140,.35)'; ctx.lineWidth = 1;
      for (let i = -h; i < w + h; i += 6) line(x + i, y + h, x + i + (y + h - yg), yg);
      ctx.strokeStyle = PFD_C.amber; ctx.lineWidth = 1.5; line(x, yg, x + w, yg);
    }
    ctx.strokeStyle = PFD_C.white; ctx.fillStyle = PFD_C.white; ctx.lineWidth = 1; font(fs); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (let a = Math.max(Math.floor((d.altFt - 200) / 20) * 20, Math.ceil(d.groundFt / 20) * 20); a <= d.altFt + 200; a += 20) {
      const yy = Y(a); line(x, yy, x + (a % 100 === 0 ? 7 : 4), yy);
      if (a % 100 === 0) ctx.fillText(a, x + 9, yy);
    }
    // Autopilot altitude bug (clamped to the tape edge when off-scale)
    if (d.apFt !== null) {
      const yb = clamp(Y(d.apFt), y + 5, y + h - 5);
      ctx.fillStyle = PFD_C.cyan; ctx.beginPath();
      ctx.moveTo(x, yb - 6); ctx.lineTo(x + 6, yb - 6); ctx.lineTo(x + 6, yb - 2); ctx.lineTo(x + 2, yb); ctx.lineTo(x + 6, yb + 2); ctx.lineTo(x + 6, yb + 6); ctx.lineTo(x, yb + 6);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    font(fs - 1); ctx.textBaseline = 'top'; ctx.textAlign = 'right';
    if (d.apFt !== null) { ctx.fillStyle = PFD_C.cyan; ctx.fillText(Math.round(d.apFt), x + w - 3, y + 3); }
    else { ctx.fillStyle = PFD_C.dim; ctx.fillText('FT', x + w - 3, y + 3); }
    if (d.aglFt < 1000 && d.aglFt > 1) {          // radio altitude near the ground
      ctx.textBaseline = 'bottom'; ctx.fillStyle = PFD_C.green; ctx.fillText('R ' + Math.round(d.aglFt), x + w - 3, y + h - 3);
    }
    readout(x + 1, mid, w - 1, fs + 9, -1, String(Math.round(d.altFt)), fs);
  }

  function drawVS(d, x, y, w, h) {
    const mid = y + h / 2, half = h / 2 - 6;
    ctx.fillStyle = PFD_C.tape; rr(x, y, w, h, 3); ctx.fill();
    const f = v => Math.sign(v) * Math.min(1, Math.sqrt(Math.abs(v) / 2000)) * half;  // ±2000 fpm, sqrt scale
    ctx.strokeStyle = PFD_C.dim; ctx.lineWidth = 1;
    for (const v of [-2000, -1000, -500, 0, 500, 1000, 2000]) line(x + 1, mid - f(v), x + (v ? 4 : w - 1), mid - f(v));
    ctx.strokeStyle = Math.abs(d.vs) > 1500 ? PFD_C.amber : PFD_C.white; ctx.lineWidth = 2;
    line(x + 1, mid, x + w - 1, mid - f(d.vs));
  }

  function drawHeading(d, x, y, w, h, fs) {
    const cx = x + w / 2, ppd = w / 80;
    ctx.save(); ctx.fillStyle = PFD_C.tape; rr(x, y, w, h, 4); ctx.fill(); ctx.clip();
    ctx.strokeStyle = PFD_C.white; ctx.fillStyle = PFD_C.white; ctx.lineWidth = 1; font(fs); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const card = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    for (let a = Math.floor((d.hdg - 45) / 5) * 5; a <= d.hdg + 45; a += 5) {
      const xx = cx + (a - d.hdg) * ppd, n = ((a % 360) + 360) % 360;
      line(xx, y, xx, y + (n % 10 === 0 ? 5 : 3));
      if (n % 30 === 0) { ctx.fillStyle = card[n] ? PFD_C.white : PFD_C.dim; ctx.fillText(card[n] || String(n / 10), xx, y + 6); }
    }
    if (d.trk !== null) {                           // ground track (magenta diamond)
      let dt = ((d.trk - d.hdg + 540) % 360) - 180; dt = clamp(dt, -40, 40);
      const xx = cx + dt * ppd; ctx.fillStyle = PFD_C.magenta;
      ctx.beginPath(); ctx.moveTo(xx, y + 1); ctx.lineTo(xx + 4, y + 5); ctx.lineTo(xx, y + 9); ctx.lineTo(xx - 4, y + 5); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    const bw = fs * 3.2 + 6;
    ctx.fillStyle = '#05080e'; ctx.strokeStyle = PFD_C.white; rr(cx - bw / 2, y, bw, h, 3); ctx.fill(); ctx.stroke();
    font(fs + 1, 600); ctx.fillStyle = PFD_C.white; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(d.hdg) % 360 || 360).padStart(3, '0'), cx, y + h / 2 + 0.5);
  }

  return { draw, resize };
}

/* ═══════════════════════════════ UI ═══════════════════════════════ */

/**
 * @param {{S:object, rig:object}} deps  rig = camera rig from camera.js
 * @returns {{toast(msg), handleKey(code), setCam(mode), update(dt), hud(),
 *            openHelp(), setPaused(on), setMuted(on), prefs:object}}
 */
export function initUI({ S, rig }) {
  const app = $('#app');
  const el = {
    toast: $('#toast'), srAlert: $('#srAlert'), annun: $('#annun'), modeVal: $('#modeVal'), hAp: $('#hAp'),
    hAlt: $('#hAlt'), hSpd: $('#hSpd'), hVs: $('#hVs'), hHdg: $('#hHdg'), hPwr: $('#hPwr'), hThr: $('#hThr'), hEnd: $('#hEnd'),
    hBat: $('#hBat'), batBar: $('#batBar'), splitR: $('#splitR'), splitW: $('#splitW'), hRot: $('#hRot'), hWing: $('#hWing'),
    thr: $('#thr'), thrVal: $('#thrVal'), fov: $('#fov'), fovVal: $('#fovVal'), wind: $('#wind'), windVal: $('#windVal'),
    vol: $('#vol'), volVal: $('#volVal'), autoRot: $('#autoRot'),
    windDir: $('#windDir'), windDirVal: $('#windDirVal'), simSpeed: $('#simSpeed'), hRng: $('#hRng'),
    panel: $('#panel'), panelToggle: $('#panelToggle'), panelClose: $('#panelClose'),
    pauseBtn: $('#pauseBtn'), muteBtn: $('#muteBtn'), touch: $('#touch'), tThr: $('#tThr'),
    tThrFill: $('#tThr .thr-fill'), tThrVal: $('#tThr .thr-val'), holdChip: $('#touch [data-act="hold"]'),
    coach: $('#coach'), coachText: $('#coachText'), coachDo: $('#coachDo'),
    intro: $('#intro'), menu: $('#menu'), menuTitle: $('#menuTitle'), menuSub: $('#menuSub'),
    mResume: $('#mResume'), mHover: $('#mHover'), mSpeed: $('#mSpeed'), gfxNote: $('#gfxNote'),
  };

  /* ---------- Helpers ---------- */
  function setAttr(e, name, val) { val = String(val); if (e && e.getAttribute(name) !== val) e.setAttribute(name, val); }
  function setText(e, t) { t = String(t); if (e && e.textContent !== t) e.textContent = t; }
  const setSw = (sel, v) => setAttr($(sel), 'aria-checked', v ? 'true' : 'false');
  /** Switch button: click flips its aria-checked and calls fn(newValue). */
  function sw(sel, fn) { $(sel).addEventListener('click', () => { const v = $(sel).getAttribute('aria-checked') !== 'true'; fn(v); setSw(sel, v); }); }
  const mql = q => (typeof matchMedia === 'function' ? matchMedia(q) : { matches: false, addEventListener() {} });
  const onMq = (mq, fn) => { if (mq.addEventListener) mq.addEventListener('change', fn); else if (mq.addListener) mq.addListener(fn); };

  /* ---------- Toast + screen-reader alerts ---------- */
  let toastT;
  function toast(msg) {
    if (!msg) return;
    el.toast.textContent = msg; el.toast.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.toast.classList.remove('show'), Math.max(2600, msg.length * 60));
  }
  on('toast', toast);
  function announce(text) { el.srAlert.textContent = ''; setTimeout(() => { el.srAlert.textContent = text; }, 30); }

  /* ---------- Preferences ---------- */
  const prefs = Object.assign({ volume: 0.6, muted: false, touch: 'auto' }, loadPrefs());
  let saveT;
  function savePrefs(patch) { Object.assign(prefs, patch); clearTimeout(saveT); saveT = setTimeout(() => storePrefs(prefs), 250); }

  /* ---------- Sound (started by the first gesture) ---------- */
  const audio = createAudio();
  audio.setMuted(!!prefs.muted); audio.setVolume(prefs.volume);
  const gesture = () => audio.ensure();
  addEventListener('pointerdown', gesture, true); addEventListener('keydown', gesture, true);
  function setMuted(m) { audio.setMuted(m); savePrefs({ muted: !!m }); if (!m) audio.ensure(); syncSettings(); }

  /* ---------- Reduced motion (OS default, overridable in settings) ---------- */
  const mqRM = mql('(prefers-reduced-motion: reduce)');
  const reduceMotion = () => (typeof prefs.reduceMotion === 'boolean' ? prefs.reduceMotion : mqRM.matches);
  let motionMod = null;   // world.js motionPrefs (shared with aircraft.js), loaded lazily — optional
  import('./world.js').then(m => { motionMod = m.motionPrefs || null; applyMotion(); }).catch(() => {});
  function applyMotion() {
    const on = reduceMotion();
    S.reduceMotion = on;
    app.classList.toggle('reduce-motion', on);
    if (rig.setReduceMotion) rig.setReduceMotion(on);
    if (motionMod && typeof motionMod === 'object') motionMod.reduced = on;
    syncSettings();
  }
  onMq(mqRM, applyMotion);

  /* ---------- Touch controls visibility ---------- */
  const mqCoarse = mql('(any-pointer: coarse)');
  const touchCapable = () => ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0 || mqCoarse.matches;
  function applyTouch() {
    const on = prefs.touch === 'on' || (prefs.touch !== 'off' && touchCapable());
    app.classList.toggle('touch-ui', on);
    app.classList.toggle('has-kbd', !on || hadKeyboard);
    measureTouch(); syncSettings();
  }
  let hadKeyboard = false;
  addEventListener('keydown', e => { if (!hadKeyboard && !e.ctrlKey && !e.metaKey && e.key && e.key.length === 1) { hadKeyboard = true; app.classList.add('has-kbd'); } }, true);
  onMq(mqCoarse, applyTouch);
  /** Expose the touch zone height as --touch-h so the toast and coach float above it. */
  function measureTouch() {
    const vis = app.classList.contains('touch-ui') && el.touch.offsetParent !== null;
    app.style.setProperty('--touch-h', vis ? (el.touch.offsetHeight + 8) + 'px' : '0px');
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(measureTouch).observe(el.touch);
  addEventListener('resize', measureTouch);

  /* ---------- Compact layout + control drawer ---------- */
  const mqCompact = mql('(max-width:820px), (max-height:500px)');
  let drawerOpen = false;
  function applyLayout() {
    app.classList.toggle('compact', mqCompact.matches);
    setDrawer(drawerOpen && mqCompact.matches, false);
    measureTouch();
  }
  /** Open/close the drawer (compact only). Closed drawer is inert so Tab never lands in it. */
  function setDrawer(open, moveFocus = true) {
    const compact = mqCompact.matches;
    drawerOpen = compact && open;
    el.panel.classList.toggle('open', drawerOpen);
    el.panel.inert = compact && !drawerOpen;
    if (compact && !drawerOpen) el.panel.setAttribute('aria-hidden', 'true'); else el.panel.removeAttribute('aria-hidden');
    setAttr(el.panelToggle, 'aria-expanded', drawerOpen);
    setAttr(el.panelToggle, 'aria-label', drawerOpen ? 'Close controls' : 'Open controls');
    if (moveFocus && compact) (drawerOpen ? el.panelClose : el.panelToggle).focus({ preventScroll: true });
  }
  el.panelToggle.addEventListener('click', () => setDrawer(!drawerOpen));
  el.panelClose.addEventListener('click', () => setDrawer(false));
  onMq(mqCompact, applyLayout);

  /* ---------- Modal dialogs (intro, pause/crash menu): focus trap, Esc, focus return ---------- */
  const modalStack = [];      // [{el, ret}]
  function openModal(m, focusEl) {
    if (!m.hidden) return;
    modalStack.push({ el: m, ret: document.activeElement });
    m.hidden = false;
    const f = focusEl || focusables(m)[0];
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 0);
  }
  function closeModal(m) {
    if (m.hidden) return;
    m.hidden = true;
    const i = modalStack.findIndex(x => x.el === m);
    const entry = i >= 0 ? modalStack.splice(i, 1)[0] : null;
    const top = modalStack[modalStack.length - 1];
    const back = top ? focusables(top.el)[0] : entry && entry.ret;
    if (back && back.isConnected && back.focus) back.focus({ preventScroll: true });
  }
  const topModal = () => (modalStack.length ? modalStack[modalStack.length - 1].el : null);
  function focusables(root) {
    return [...root.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
      .filter(e => !e.disabled && !e.hidden && e.offsetParent !== null);
  }
  document.addEventListener('keydown', e => {
    const m = topModal(); if (!m || e.key !== 'Tab') return;
    const f = focusables(m); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!m.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* ---------- Pause ---------- */
  function setPaused(on) {
    if (typeof cmd.setPaused === 'function') return cmd.setPaused(S, on);
    S.paused = !!on; S.pauseReason = on ? 'user' : null; return on ? 'Paused' : 'Resumed';
  }
  el.pauseBtn.addEventListener('click', () => { if (!S.crashed) setPaused(!(S.paused && S.pauseReason === 'user')); });

  /* ---------- Camera ---------- */
  function setCam(c) { rig.setMode(c); syncCamera(); toast(CAM_TOASTS[c]); savePrefs({ cam: S.cam }); }
  rig.onFovChange = f => { el.fov.value = f; setText(el.fovVal, Math.round(f) + '°'); savePrefs({ fov: Math.round(f) }); };

  /* ---------- Master power (guarded in flight) ---------- */
  // Cutting power while airborne is almost always fatal, so it takes a second press within 2 s.
  let masterArmT = -1e9;
  function masterPress() {
    const now = performance.now();
    if (S.master && !S.onGround && !S.crashed && now - masterArmT > 2000) {
      masterArmT = now;
      toast(app.classList.contains('touch-ui') ? 'Tap PWR again within 2 s to cut power in flight' : 'Press P again within 2 s to cut power in flight');
      return;
    }
    masterArmT = -1e9;
    toast(cmd.toggleMaster(S));
  }

  /* ---------- One-shot keys (keyboard + touch pads + sticks) ---------- */
  function handleKey(code) {
    if (code === 'Escape') return onEscape();
    if (topModal()) return;
    if (code === 'KeyP') masterPress();
    else if (code === 'KeyV') setCam(CAM_MODES[(CAM_MODES.indexOf(S.cam) + 1) % CAM_MODES.length]);
    else if (code === 'KeyG') toast(cmd.toggleGear(S));
    else if (code === 'KeyL') { S.lights = !S.lights; toast(S.lights ? 'Lights on' : 'Lights off'); }
    else if (code === 'KeyX') toast(cmd.failRandomMotor(S));
    else if (code === 'KeyM') { setMuted(!audio.muted); toast(audio.muted ? 'Sound off' : 'Sound on'); }
    else if (code === 'Space' || code === 'Pause') { if (!S.crashed) setPaused(!(S.paused && S.pauseReason === 'user')); }
    else if (code === 'Help') openHelp();
    else if (code === 'KeyT') cycleSpeed();
    if ((cmd.MANUAL_KEYS || []).includes(code)) toast(cmd.cancelAutopilot(S));
    syncControls();
  }
  /** Esc closes the top-most layer: dialog → drawer → toggles the pause menu. */
  function onEscape() {
    const m = topModal();
    if (m === el.intro) return closeIntro();
    if (m === el.menu) { if (!S.crashed) setPaused(false); return; }
    if (drawerOpen) return setDrawer(false);
    if (!S.crashed) setPaused(true);
  }

  /* ---------- Panel wiring ---------- */
  $('#master').addEventListener('click', () => { masterPress(); syncControls(); });
  sw('#liftSw', v => toast(cmd.setLiftMotors(S, v)));
  sw('#cruiseSw', v => toast(cmd.setCruiseMotor(S, v)));
  $('#gearSw').addEventListener('click', () => { toast(cmd.toggleGear(S)); syncControls(); });
  sw('#lightSw', v => { S.lights = v; });
  sw('#discSw', v => { S.discs = v; savePrefs({ discs: v }); });
  sw('#vecSw', v => { S.vectors = v; savePrefs({ vectors: v }); });
  sw('#trailSw', v => { S.trail = v; savePrefs({ trail: v }); });
  el.thr.addEventListener('input', e => toast(cmd.setThrottle(S, e.target.value / 100)));
  el.fov.addEventListener('input', e => rig.setFov(+e.target.value));
  el.wind.addEventListener('input', e => { S.wind = e.target.value / UNITS.KT_PER_MS; setText(el.windVal, e.target.value + ' kt'); savePrefs({ windKt: +e.target.value }); });
  /* Wind direction: the slider is the meteorological "from" bearing (compass deg); S.windDir is the
     direction the wind blows toward in the sim's heading convention (0 = toward +Z, + = left), i.e. -from. */
  const windFromDeg = () => {
    const wd = Number.isFinite(S.windDir) ? S.windDir : (CFG.WIND_DIR || 0);
    return Math.round((((-wd * RAD2DEG) % 360) + 360) % 360);
  };
  function setWindFrom(deg) {
    deg = ((Math.round(fin(deg)) % 360) + 360) % 360;
    S.windDir = -deg / RAD2DEG; setText(el.windDirVal, String(deg).padStart(3, '0') + '°');
  }
  if (el.windDir) el.windDir.addEventListener('input', e => { setWindFrom(+e.target.value); savePrefs({ windFrom: +e.target.value }); });
  function cycleSpeed() {
    if (typeof cmd.cycleTimeScale === 'function') toast(cmd.cycleTimeScale(S));
    syncControls();
  }
  if (el.simSpeed) el.simSpeed.addEventListener('click', cycleSpeed);
  const doTakeoff = () => toast(cmd.engageTakeoff(S)), doLand = () => toast(cmd.engageLand(S));
  const doHold = () => { toast(cmd.engageHold(S)); syncControls(); };
  $('#apTo').addEventListener('click', doTakeoff);
  $('#apLand').addEventListener('click', doLand);
  $('#apHold').addEventListener('click', doHold);
  function resetToPad() {
    state.resetState(); if (S.paused && S.pauseReason === 'user') setPaused(false);
    syncControls(); toast('Reset to pad · battery recharged · motor faults cleared');
  }
  $('#reset').addEventListener('click', resetToPad);
  $('#failBtn').addEventListener('click', () => toast(cmd.failRandomMotor(S)));
  $('#fixBtn').addEventListener('click', () => toast(cmd.clearFaults(S)));
  $$('#camSeg button').forEach(b => b.addEventListener('click', () => setCam(b.dataset.cam)));
  $$('#todSeg button').forEach(b => b.addEventListener('click', () => { S.tod = b.dataset.tod; savePrefs({ tod: S.tod }); syncControls(); }));
  $('#camReset').addEventListener('click', () => { rig.setFov(FOV_DEFAULT); rig.placeOrbit(); });
  el.autoRot.addEventListener('click', () => {
    if (rig.reduceMotion && !S.autoRot) { toast('Auto-rotate is off while Reduce motion is on'); return; }
    rig.setAutoRotate(!S.autoRot);
    if (S.autoRot && S.cam !== 'orbit') setCam('orbit');
    syncCamera();
  });
  // Sound + accessibility settings (panel and pause menu share the same prefs)
  const toggleSound = () => setMuted(!audio.muted);
  $('#soundSw').addEventListener('click', toggleSound); $('#mSound').addEventListener('click', toggleSound);
  el.muteBtn.addEventListener('click', toggleSound);
  el.vol.addEventListener('input', e => { audio.setVolume(e.target.value / 100); savePrefs({ volume: audio.volume }); syncSettings(); });
  const toggleRM = () => { savePrefs({ reduceMotion: !reduceMotion() }); applyMotion(); };
  $('#rmSw').addEventListener('click', toggleRM); $('#mRm').addEventListener('click', toggleRM);
  $$('#touchSeg button').forEach(b => b.addEventListener('click', () => { savePrefs({ touch: b.dataset.touch }); applyTouch(); }));
  $('#helpBtn').addEventListener('click', () => openHelp());
  $('#helpBtn2').addEventListener('click', () => { setDrawer(false, false); openHelp(); });

  /* ---------- Touch: quick-action chips + vertical throttle ---------- */
  $$('#touch [data-act]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'takeoff') doTakeoff(); else if (a === 'land') doLand(); else if (a === 'hold') doHold();
  }));
  (function bindTouchThrottle() {
    const t = el.tThr; let id = null;
    const fromY = e => { const r = t.getBoundingClientRect(); return clamp(1 - (e.clientY - r.top - 8) / (r.height - 16), 0, 1); };
    const set = f => { toast(cmd.setThrottle(S, Math.round(f * 100) / 100)); syncThrottle(); };
    t.addEventListener('pointerdown', e => { if (id !== null) return; id = e.pointerId; e.preventDefault(); try { t.setPointerCapture(id); } catch (_) {} set(fromY(e)); });
    t.addEventListener('pointermove', e => { if (e.pointerId === id) set(fromY(e)); });
    const end = e => { if (e.pointerId === id) id = null; };
    t.addEventListener('pointerup', end); t.addEventListener('pointercancel', end); t.addEventListener('lostpointercapture', end);
    t.addEventListener('keydown', e => {
      const step = { ArrowUp: .05, ArrowRight: .05, ArrowDown: -.05, ArrowLeft: -.05, PageUp: .2, PageDown: -.2 }[e.key];
      if (step !== undefined) set(clamp(S.thr + step, 0, 1));
      else if (e.key === 'Home') set(0); else if (e.key === 'End') set(1); else return;
      e.preventDefault(); e.stopPropagation();
    });
  })();
  function syncThrottle() {
    const p = Math.round(clamp(fin(S.thr), 0, 1) * 100);
    if (+el.thr.value !== p) el.thr.value = p;
    setText(el.thrVal, p + '%');
    el.tThrFill.style.height = p + '%'; setText(el.tThrVal, p);
    setAttr(el.tThr, 'aria-valuenow', p); setAttr(el.tThr, 'aria-valuetext', p + '%');
  }

  /* ---------- Rotor schematic (mouse, touch and keyboard) ---------- */
  const schem = $('#schem'), NS = 'http://www.w3.org/2000/svg';
  const sx = x => 80 + x * 13.5, sz = z => 48 + z * 12;
  schem.innerHTML = `<g aria-hidden="true"><line x1="80" y1="6" x2="80" y2="88" stroke="rgba(150,180,215,.35)" stroke-width="7" stroke-linecap="round"/>
 <line x1="${sx(-6.5)}" y1="44" x2="${sx(6.5)}" y2="44" stroke="rgba(150,180,215,.25)" stroke-width="5" stroke-linecap="round"/>
 ${ROTOR_X.map(x => `<line x1="${sx(x)}" y1="${sz(-3.4)}" x2="${sx(x)}" y2="${sz(3.4)}" stroke="rgba(150,180,215,.25)" stroke-width="2"/>`).join('')}</g>`;
  const rotorSvg = S.rotors.map(r => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'rot'); g.setAttribute('role', 'button'); g.setAttribute('tabindex', '0');
    g.innerHTML = `<circle cx="${sx(r.x)}" cy="${sz(r.z)}" r="12" fill="rgba(255,181,71,0)" stroke="rgba(150,180,215,.55)" stroke-width="1.2"/><text aria-hidden="true" x="${sx(r.x)}" y="${sz(r.z) + 3.5}" text-anchor="middle" font-size="9.5" font-family="JetBrains Mono, monospace" fill="#e6edf5">${r.idx + 1}</text>`;
    const act = () => { toast(cmd.toggleMotor(S, r.idx)); updateSchematic(); };
    g.addEventListener('click', act);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
    schem.appendChild(g); return { g, c: g.querySelector('circle') };
  });
  const propSvg = document.createElementNS(NS, 'rect');
  [['x', 70], ['y', 88], ['width', 20], ['height', 5], ['rx', 2], ['aria-hidden', 'true']].forEach(([k, v]) => propSvg.setAttribute(k, v));
  schem.appendChild(propSvg);
  function updateSchematic() {
    S.rotors.forEach((r, i) => {
      const { g, c } = rotorSvg[i], h = fin(r.health, 1);
      setAttr(c, 'fill', h <= 0 ? 'rgba(255,93,82,.55)' : `rgba(255,181,71,${(fin(r.rpm) * 0.85).toFixed(2)})`);
      setAttr(c, 'stroke', h <= 0 ? '#ff5d52' : h < 1 ? '#ffb547' : 'rgba(150,180,215,.55)');
      const status = h <= 0 ? 'failed' : h < 1 ? `degraded to ${Math.round(h * 100)}%` : 'healthy';
      setAttr(g, 'aria-label', `Motor ${r.idx + 1}, ${status}. Activate to ${h > 0 ? 'fail' : 'restore'} it.`);
      setAttr(g, 'aria-pressed', h <= 0);
    });
    setAttr(propSvg, 'fill', `rgba(127,212,255,${(0.15 + fin(S.prop.rpm) * 0.85).toFixed(2)})`);
  }

  /* ---------- Sync controls from S ---------- */
  function syncCamera() {
    $$('#camSeg button').forEach(b => setAttr(b, 'aria-pressed', b.dataset.cam === S.cam));
    setAttr(el.autoRot, 'aria-pressed', !!S.autoRot);   // constant name; state is aria-pressed (styled cyan when on)
  }
  function syncSettings() {
    const m = audio.muted, rm = reduceMotion();
    setSw('#soundSw', !m); setSw('#mSound', !m);
    setAttr(el.muteBtn, 'aria-pressed', !m); setAttr(el.muteBtn, 'aria-label', m ? 'Sound off, turn on' : 'Sound on, turn off');
    const v = Math.round(audio.volume * 100); if (+el.vol.value !== v) el.vol.value = v; setText(el.volVal, v + '%');
    setSw('#rmSw', rm); setSw('#mRm', rm);
    $$('#touchSeg button').forEach(b => setAttr(b, 'aria-pressed', b.dataset.touch === (prefs.touch || 'auto')));
  }
  function syncControls() {
    setSw('#master', S.master); setSw('#liftSw', S.liftOn); setSw('#cruiseSw', S.cruiseOn);
    setSw('#gearSw', S.gearDown); setSw('#lightSw', S.lights);
    setSw('#discSw', S.discs); setSw('#vecSw', S.vectors); setSw('#trailSw', S.trail);
    syncThrottle();
    $$('#todSeg button').forEach(b => setAttr(b, 'aria-pressed', b.dataset.tod === S.tod));
    const userPaused = !!(S.paused && S.pauseReason === 'user');
    setAttr(el.pauseBtn, 'aria-pressed', userPaused); setAttr(el.pauseBtn, 'aria-label', userPaused ? 'Resume' : 'Pause');
    setAttr(el.holdChip, 'aria-pressed', S.ap === 'hold');
    if (el.simSpeed) setText(el.simSpeed, '×' + fin(S.timeScale, 1));
    if (el.windDir && document.activeElement !== el.windDir) {
      const f = windFromDeg(), sv = Math.round(f / 10) * 10 % 360;
      if (+el.windDir.value !== sv) el.windDir.value = sv;
      setText(el.windDirVal, String(f).padStart(3, '0') + '°');
    }
    syncCamera();
  }

  /* ---------- Pause menu / crash outcome (a view of S.paused / S.crashed) ---------- */
  let menuMode = null;
  el.mResume.addEventListener('click', () => setPaused(false));
  el.mHover.addEventListener('click', () => {
    if (typeof state.restartFromLastHover === 'function') toast(state.restartFromLastHover()); else state.resetState();
    if (S.paused && S.pauseReason === 'user') setPaused(false);
    syncControls();
  });
  $('#mReset').addEventListener('click', resetToPad);
  $('#mHelp').addEventListener('click', () => openHelp());
  el.mSpeed.addEventListener('click', () => { cycleSpeed(); syncMenu(); });
  function syncMenu() {
    const want = S.crashed ? 'crash' : (S.paused && S.pauseReason === 'user') ? 'pause' : null;
    if (want !== menuMode) {
      menuMode = want;
      if (!want) { closeModal(el.menu); return; }
      if (want === 'crash') {
        const c = S.crash || {};
        setText(el.menuTitle, 'Crashed');
        const bits = [c.cause ? String(c.cause) : null, Number.isFinite(c.fpm) && !/fpm/.test(c.cause || '') ? Math.round(c.fpm) + ' fpm' : null,
          Number.isFinite(c.kt) && !/ kt/.test(c.cause || '') ? Math.round(c.kt) + ' kt' : null, Number.isFinite(c.bankDeg) ? Math.round(c.bankDeg) + '° bank' : null].filter(Boolean);
        setText(el.menuSub, (bits.length ? bits.join(' · ') + '. ' : '') + 'Restart from your last stable hover or reset to the pad.');
        if (c.cause) announce('Crashed: ' + c.cause);
      } else {
        setText(el.menuTitle, 'Paused');
        setText(el.menuSub, 'The simulation is stopped. Press Esc or Resume to continue.');
      }
      el.mResume.hidden = want === 'crash';
      el.mHover.hidden = typeof state.restartFromLastHover !== 'function' ||
        (want === 'crash' && S.crash && S.crash.canRestartHover === false);
      el.mSpeed.closest('.row').hidden = typeof cmd.cycleTimeScale !== 'function';
      if (el.menu.hidden) openModal(el.menu, want === 'crash' ? (el.mHover.hidden ? $('#mReset') : el.mHover) : el.mResume);
    }
    if (menuMode) setText(el.mSpeed, '×' + fin(S.timeScale, 1));
  }

  /* ---------- Quick start + guided-flight coach ---------- */
  let coachOn = false, coachFlown = false, coachAct = null;
  function openHelp() { if (drawerOpen) setDrawer(false, false); openModal(el.intro, $('#introGuide')); }
  function closeIntro() { closeModal(el.intro); savePrefs({ seenIntro: true }); }
  $('#introClose').addEventListener('click', () => { closeIntro(); if (!S.master) toast(app.classList.contains('touch-ui') ? 'Tap PWR to start' : 'Press P (or flip Master power) to start'); });
  $('#introGuide').addEventListener('click', () => { closeIntro(); setCoach(true); });
  el.intro.addEventListener('pointerdown', e => { if (e.target === el.intro) closeIntro(); });
  $('#coachClose').addEventListener('click', () => setCoach(false));
  el.coachDo.addEventListener('click', () => {
    if (coachAct === 'power' && !S.master) toast(cmd.toggleMaster(S));
    else if (coachAct === 'takeoff') doTakeoff();
    else if (coachAct === 'throttle') toast(cmd.setThrottle(S, 1));
    else if (coachAct === 'land') doLand();
    else if (coachAct === 'finish') { setCoach(false); toast('Guide complete — the sky is yours'); }
    syncControls();
  });
  function setCoach(on) { coachOn = !!on; coachFlown = false; el.coach.hidden = !coachOn; if (coachOn) updateCoach(); }
  /** Next step of the guided flight, derived purely from S. */
  function coachStep() {
    const touch = app.classList.contains('touch-ui'), wp = liftShare().wing;
    if (!S.onGround) coachFlown = true;
    if (S.crashed) return ['Crashed. Use the menu to restart.', null];
    if (!S.master) return [`Step 1 of 4 · Turn on master power${touch ? '' : ' (P)'}.`, 'power', 'Power on'];
    if (S.onGround && !S.ap) return coachFlown ? ['Landed. Nice flying! That is the whole lift + cruise cycle.', 'finish', 'Finish']
      : ['Step 2 of 4 · Auto takeoff to a 100 ft hover.', 'takeoff', 'Take off'];
    if (S.ap === 'takeoff') return ['Climbing to a 100 ft hover on the lift rotors…', null];
    if (S.ap === 'land') return ['Auto land: slowing down, restarting the rotors, then descending.', null];
    if (S.mode === 'CRUISE') return ['Cruise: the wing carries everything and the rotors are locked. Step 4 of 4 · Auto land.', 'land', 'Land'];
    if (S.mode === 'TRANSITION' || S.thr >= 0.7) return [`Transition: the wing carries ${wp}% of the lift. Keep accelerating (about 65 kt).`, null];
    return [`Step 3 of 4 · Cruise throttle to 100%${touch ? '' : ' (hold ↑)'}. Watch the Lift bar.`, 'throttle', 'Throttle 100%'];
  }
  function updateCoach() {
    if (!coachOn) return;
    const [text, act, label] = coachStep();
    setText(el.coachText, text); coachAct = act || null;
    el.coachDo.hidden = !act; if (label) setText(el.coachDo, label);
  }

  /* ---------- WebGL context loss: pause and explain ---------- */
  const canvas = (rig.controls && rig.controls.domElement) || $('#stage canvas');
  if (canvas && canvas.addEventListener) {
    canvas.addEventListener('webglcontextlost', () => {
      if (!S.paused) { S.paused = true; S.pauseReason = 'context'; }
      el.gfxNote.hidden = false;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      if (S.pauseReason === 'context') { S.paused = false; S.pauseReason = null; }
      el.gfxNote.hidden = true;
    });
  }

  /* ---------- HUD + annunciators ---------- */
  function liftShare() {
    const r = Math.max(0, fin(S.rotorLift)), w = Math.max(0, fin(S.wingEff)), tot = r + w;
    return tot > 0.02 ? { rotor: Math.round(r / tot * 100), wing: Math.round(w / tot * 100), rp: r / tot * 100, wp: w / tot * 100 } : { rotor: 0, wing: 0, rp: 0, wp: 0 };
  }
  /** Endurance: m:ss below an hour, "1h05" below 10 h, otherwise "--" (idle / unpowered). */
  const fmtTime = s => {
    if (!Number.isFinite(s) || s <= 0 || s >= 36000) return '--';
    const m = Math.floor(s / 60);
    return s < 3600 ? `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
  };
  let prevCrit = new Set(), annKey = '';
  const LEVEL = { crit: 0, warn: 1, info: 2, ok: 3 };

  function annunciators() {
    const a = [], push = (k, t, c) => a.push({ k, t, c });
    const flightWarnings = Array.isArray(S.warnings);
    if (flightWarnings) for (const w of S.warnings) push(w.id, w.text, LEVEL[w.level] !== undefined ? w.level : 'warn');
    if (!S.master) push('MASTER', 'MASTER OFF', 'warn');
    if (S.master && !S.liftOn) push('LIFT_OFF', 'LIFT MOTORS OFF', 'warn');
    if (S.master && !S.cruiseOn) push('CRUISE_OFF', 'CRUISE MOTOR OFF', 'warn');
    S.rotors.forEach(r => {
      const h = fin(r.health, 1);
      if (h <= 0) push('M' + r.idx, `MOTOR ${r.idx + 1} FAIL`, 'crit');
      else if (h < 1) push('M' + r.idx, `MOTOR ${r.idx + 1} ${Math.round(h * 100)}%`, 'warn');
    });
    if (!flightWarnings) {   // legacy physics: derive the flight warnings here
      if (S.battery < 0.2) push('BAT', 'LOW BATTERY', S.battery < 0.08 ? 'crit' : 'warn');
      if (S.hardT > 0) push('HARD', 'HARD LANDING', 'crit');
      if (!S.onGround && S.w < -3 && S.rotorLift + S.wingEff < 0.9 && S.pos.y < 200) push('SINK', 'SINK RATE', 'crit');
      if (!S.onGround && !S.gearDown && S.pos.y < 6 && S.w < -0.3) push('GEARUP', 'GEAR UP', 'crit');
    }
    if (S.stowed) push('STOWED', 'ROTORS LOCKED', 'ok');
    if (S.master && S.spool < 0.98 && S.liftOn && !S.stowed) push('SPOOL', 'SPOOLING', 'info');
    if (S.paused) push('PAUSED', 'PAUSED', 'info');
    if (Number.isFinite(S.timeScale) && S.timeScale !== 1) push('TS', 'SIM ×' + S.timeScale, 'info');
    a.sort((x, y) => LEVEL[x.c] - LEVEL[y.c]);
    return a;
  }

  function apReadout() {
    if (!S.ap) return '';
    if (S.apText) return S.apText;
    const alt = Number.isFinite(S.apAlt) ? ' ' + Math.round(S.apAlt * UNITS.FT_PER_M) + ' FT' : '';
    return ({ takeoff: 'AUTO TAKEOFF', land: 'AUTO LAND', hold: 'HOVER HOLD', alt: 'ALT HOLD' }[S.ap] || String(S.ap).toUpperCase()) + alt;
  }

  function hud() {
    setText(el.modeVal, S.mode);
    el.modeVal.style.color = S.mode === 'OFF' ? 'var(--muted)' : S.mode === 'UNPOWERED' ? 'var(--red)' : S.mode === 'CRUISE' ? 'var(--cyan)' : S.mode === 'GROUND' ? 'var(--ink)' : 'var(--amber)';
    setText(el.hAp, apReadout());
    const ias = Math.max(0, fin(S.ias, fin(S.u)));
    setText(el.hAlt, Math.round(Math.max(0, fin(S.pos.y)) * UNITS.FT_PER_M));
    setText(el.hSpd, Math.round(ias * UNITS.KT_PER_MS));
    setText(el.hVs, Math.round(fin(S.vs, fin(S.w)) * UNITS.FPM_PER_MS / 10) * 10);
    const hdg = Number.isFinite(S.headingDeg) ? Math.round(S.headingDeg) : Math.round(((-S.psi * RAD2DEG) % 360 + 360) % 360);
    setText(el.hHdg, String(hdg % 360 || 360).padStart(3, '0'));
    setText(el.hPwr, Math.round(fin(S.power)));
    setText(el.hThr, Math.round(fin(S.thr) * 100));
    setText(el.hEnd, fmtTime(S.endurance));
    if (el.hRng) setText(el.hRng, Number.isFinite(S.range) && S.range > 50 && S.range < 2e6 ? '· ' + (S.range / 1852).toFixed(S.range < 18520 ? 1 : 0) + ' nm' : '');
    const b = clamp(fin(S.battery, 1), 0, 1) * 100; setText(el.hBat, b.toFixed(1) + '%');
    el.batBar.style.width = b + '%'; el.batBar.style.background = b < 20 ? 'var(--red)' : b < 40 ? 'var(--amber)' : 'var(--green)';
    const ls = liftShare();
    el.splitR.style.width = ls.rp + '%'; el.splitW.style.width = ls.wp + '%';
    setText(el.hRot, ls.rotor + '%'); setText(el.hWing, ls.wing + '%');

    // Annunciators: rewrite only when the list changes (keeps the blink running); announce new critical ones.
    const list = annunciators(), key = list.map(x => x.k + ':' + x.c + ':' + x.t).join('|');
    if (key !== annKey) {
      annKey = key;
      el.annun.replaceChildren(...list.map(x => { const s = document.createElement('span'); s.className = 'ann ' + x.c; s.textContent = x.t; return s; }));
      const crit = new Set(list.filter(x => x.c === 'crit').map(x => x.k));
      const fresh = list.filter(x => x.c === 'crit' && !prevCrit.has(x.k));
      if (fresh.length) { announce('Warning: ' + fresh.map(x => x.t).join(', ')); audio.chime(); }
      prevCrit = crit;
    }
    updateCoach();
  }

  /* ---------- Apply saved prefs (deferred to the first frame, after main.js finished setting up) ---------- */
  function applyPrefs() {
    if (typeof prefs.discs === 'boolean') S.discs = prefs.discs;
    if (typeof prefs.vectors === 'boolean') S.vectors = prefs.vectors;
    if (typeof prefs.trail === 'boolean') S.trail = prefs.trail;
    if (CFG.TOD && CFG.TOD[prefs.tod]) S.tod = prefs.tod;
    if (Number.isFinite(prefs.windKt)) { const k = clamp(Math.round(prefs.windKt), 0, 30); el.wind.value = k; S.wind = k / UNITS.KT_PER_MS; setText(el.windVal, k + ' kt'); }
    if (Number.isFinite(prefs.windFrom)) setWindFrom(prefs.windFrom);
    if (CAM_MODES.includes(prefs.cam) && prefs.cam !== S.cam) rig.setMode(prefs.cam);
    if (Number.isFinite(prefs.fov)) rig.setFov(prefs.fov);
    syncControls();
  }

  /* ---------- Per-frame ---------- */
  const pfd = createPFD($('#pfd'));
  let hudClock = 0, pfdClock = 0, first = true;
  function update(dt) {
    if (first) {
      first = false; applyPrefs();
      document.documentElement.setAttribute('data-vtol-running', '');  // tells the boot guard we're up
    }
    updateSchematic();
    syncControls();
    syncMenu();
    audio.update(S);
    pfdClock += dt; if (pfdClock >= 1 / 30) { pfd.draw(S, pfdClock); pfdClock = 0; }
    hudClock += dt; if (hudClock > 0.1) { hudClock = 0; hud(); }
  }

  /* ---------- Start ---------- */
  applyLayout(); applyTouch(); applyMotion(); syncSettings(); syncControls(); hud();
  const skipIntro = /[?#&]nointro\b/.test(location.search + location.hash);
  if (!prefs.seenIntro && !skipIntro) openHelp();
  else setTimeout(() => { if (!S.master) toast(app.classList.contains('touch-ui') ? 'Tap PWR to start · ? for the quick start guide' : 'Press P to start · ? for the quick start guide'); }, 600);

  return { toast, handleKey, setCam, update, hud, openHelp, setPaused, setMuted, prefs };
}
