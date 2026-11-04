// Vortex-lattice aerodynamic model of the C0 wing + horizontal tail (flat lifting surfaces, no thickness).
// Checks three sizing estimates: wing lift slope a_w (Helmbold), Oswald/span efficiency e (EST 0.80),
// and the neutral point h_n (classical formula with eta_t, d eps/d alpha).
// Run: node analysis/vlm.mjs -> analysis/aero.json.  Method: horseshoe vortices, bound vortex at panel 1/4 chord,
// control point at 3/4 chord, trailing legs to x = -infinity (Katz & Plotkin, Low-Speed Aerodynamics, 2nd ed., ch. 12).
// Stopped rotors, booms, fuselage and viscous drag are NOT modelled; they remain in CD0 + sum(CdA).
import { readFileSync, writeFileSync } from 'fs';
const R = JSON.parse(readFileSync(new URL('./results.json', import.meta.url)));
const c0 = R.concepts.C0, s = c0.sized, g = c0.geo, b = R.base.span, c = s.chord;

// x positive forward (wing LE at 0), y right, z up. Free stream comes from +x toward -x (aircraft flies +x).
function surface(xLE, span, chord, ny, nx, z = 0) {
  const P = [];
  for (let j = 0; j < ny; j++) {
    // cosine spanwise spacing for accuracy near the tips
    const t0 = j / ny, t1 = (j + 1) / ny;
    const y0 = -span / 2 * Math.cos(Math.PI * t0), y1 = -span / 2 * Math.cos(Math.PI * t1);
    for (let i = 0; i < nx; i++) {
      const xa = xLE - chord * i / nx, xb = xLE - chord * (i + 1) / nx, dx = xa - xb;
      P.push({ xb: xa - 0.25 * dx, xc: xa - 0.75 * dx, y0, y1, yc: (y0 + y1) / 2, z, dy: y1 - y0, area: dx * (y1 - y0) });
    }
  }
  return P;
}
// induced vertical velocity at (x,y,z) of a horseshoe (bound segment A->B at x = xb, trailing to -inf), unit circulation
function seg(x, y, z, x1, y1, z1, x2, y2, z2) {   // Biot-Savart for a finite segment, returns w (z-component) only
  const r1 = [x - x1, y - y1, z - z1], r2 = [x - x2, y - y2, z - z2], r0 = [x2 - x1, y2 - y1, z2 - z1];
  const cx = r1[1] * r2[2] - r1[2] * r2[1], cy = r1[2] * r2[0] - r1[0] * r2[2], cz = r1[0] * r2[1] - r1[1] * r2[0];
  const c2 = cx * cx + cy * cy + cz * cz; if (c2 < 1e-12) return 0;
  const n1 = Math.hypot(...r1), n2 = Math.hypot(...r2);
  const k = (r0[0] * r1[0] + r0[1] * r1[1] + r0[2] * r1[2]) / n1 - (r0[0] * r2[0] + r0[1] * r2[1] + r0[2] * r2[2]) / n2;
  return cz * k / (4 * Math.PI * c2);
}
function horseshoe(x, y, z, p) {
  const far = -1e3;   // trailing legs go downstream (-x)
  return seg(x, y, z, far, p.y0, p.z, p.xb, p.y0, p.z) + seg(x, y, z, p.xb, p.y0, p.z, p.xb, p.y1, p.z) + seg(x, y, z, p.xb, p.y1, p.z, far, p.y1, p.z);
}
function solve(A, rhs) {   // Gaussian elimination with partial pivoting
  const n = rhs.length, M = A.map((r, i) => [...r, rhs[i]]);
  for (let k = 0; k < n; k++) {
    let p = k; for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    [M[k], M[p]] = [M[p], M[k]];
    for (let i = k + 1; i < n; i++) { const f = M[i][k] / M[k][k]; for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let sum = M[i][n]; for (let j = i + 1; j < n; j++) sum -= M[i][j] * x[j]; x[i] = sum / M[i][i]; }
  return x;
}
function run(panels, alpha, Sref) {
  const n = panels.length, A = [], rhs = [];
  for (let i = 0; i < n; i++) { const pi = panels[i]; A.push(panels.map(pj => horseshoe(pi.xc, pi.yc, pi.z, pj))); rhs.push(Math.sin(alpha)); }
  const G = solve(A, rhs);   // V_inf = 1
  let L = 0, M = 0;          // lift (rho = 1, V = 1), pitching moment about wing LE (nose-up +)
  panels.forEach((p, k) => { const dL = G[k] * p.dy; L += dL; M += dL * p.xb; });
  // Trefftz-plane induced drag from the wake circulation distribution of each spanwise strip
  const strips = new Map(); panels.forEach((p, k) => { const key = p.yc.toFixed(6) + '|' + p.z; strips.set(key, (strips.get(key) || 0) + G[k]); });
  const CL = 2 * L / Sref, Cm = 2 * M / (Sref * c);
  return { CL, Cm, G };
}
function analyse(withTail) {
  const ny = 48, nx = 4;
  let P = surface(0, b, c, ny, nx);
  if (withTail) { const tLE = g.xRear - g.D / 2 - 0.05; P = P.concat(surface(tLE, g.hSpan, g.hC, 16, 2, 0.0)); }
  const S = s.S, a1 = 2 * Math.PI / 180;
  const r0 = run(P, 0.0001, S), r1 = run(P, a1, S);
  const CLa = (r1.CL - r0.CL) / (a1 - 0.0001), Cma = (r1.Cm - r0.Cm) / (a1 - 0.0001);
  const hn = -Cma / CLa;   // neutral point as fraction of chord aft of the wing LE (x measured forward => sign)
  return { CLa, Cma, hn, panels: P.length, r1 };
}
// span efficiency of the wing alone from the lift distribution (Trefftz: CDi = CL^2/(pi e AR))
function spanEff() {
  const ny = 64, nx = 4, P = surface(0, b, c, ny, nx), a = 4 * Math.PI / 180, r = run(P, a, s.S);
  // strip circulations -> induced drag via discrete Trefftz integral with downwash from trailing vortices
  const strips = []; for (let j = 0; j < ny; j++) { let G = 0; for (let i = 0; i < nx; i++) G += r.G[j * nx + i]; strips.push({ y0: P[j * nx].y0, y1: P[j * nx].y1, G }); }
  let Di = 0;
  for (const si of strips) {
    const yc = (si.y0 + si.y1) / 2; let w = 0;
    for (const sj of strips) { w += sj.G / (2 * Math.PI) * (1 / (yc - sj.y0) - 1 / (yc - sj.y1)); }   // 2-D trailing pair in Trefftz plane
    Di += 0.5 * si.G * w * (si.y1 - si.y0);   // w here is upwash-positive from the pair convention above
  }
  const CDi = 2 * Di / s.S, AR = b * b / s.S, e = r.CL * r.CL / (Math.PI * AR * CDi);
  return { e, CL: r.CL, CDi, AR };
}
const wing = analyse(false), full = analyse(true), se = spanEff();
const helmbold = 2 * Math.PI * s.AR / (2 + Math.sqrt(s.AR * s.AR + 4));
const out = {
  generated: '2026-10-25', method: 'vortex lattice, horseshoe vortices, wing 48x4 + tail 16x2 panels (analysis/vlm.mjs)',
  wing_CLa_per_rad: wing.CLa, helmbold_CLa_per_rad: helmbold,
  full_CLa_per_rad: full.CLa, neutral_point_pct_mac: full.hn * 100, sizing_neutral_point_pct_mac: (g.hn_nopod != null ? g.hn_nopod : g.hn) * 100, sizing_neutral_point_with_pod_pct_mac: g.hn * 100,
  static_margin_pct_at_28: (full.hn - 0.28) * 100, wing_span_efficiency_inviscid: se.e, sizing_e: R.base.e, AR: se.AR,
  notes: 'Inviscid span efficiency; real Oswald e is lower (viscous + fuselage + boom interference). Fuselage destabilising moment not modelled.'
};
writeFileSync(new URL('./aero.json', import.meta.url), JSON.stringify(out, (k, v) => typeof v === 'number' ? +v.toPrecision(6) : v, 1));
console.log(out);
