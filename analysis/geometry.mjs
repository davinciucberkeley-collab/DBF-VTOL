// Shared geometry definitions: the ONE place where the wing/tail section family and the fuselage-pod profile are defined.
// Imported by analysis/sizing.mjs, analysis/tradestudy.mjs and cad/params.mjs; params.mjs writes the constants into
// cad/params.txt (keys foilWing, foilTail, foilTE, podProfile), from which the Python side (analysis/geom.py) and the C# side
// (cad/Shared.cs) read them. Nothing else may re-type these numbers. No imports: sizing.mjs must not depend on params.txt
// (params.txt is generated from the sizing), so this module is a leaf.
//
// Section: NACA 4-digit (Abbott & von Doenhoff, Theory of Wing Sections, §6.4; https://en.wikipedia.org/wiki/NACA_airfoil,
// checked 2026-10-21). Wing NACA 24xx: 2 % camber at 40 % chord (EST airfoil choice, docs/research/aerodynamics.md); the
// thickness ratio is a sizing input (analysis/sizing.mjs BASE.tc -> results.json base.tc -> params.txt tc), so the full
// designation (NACA 2415 at tc 0.15) is composed, not stored. Tail/fins NACA 0009.
//
// Trailing-edge coefficient a4 of the thickness polynomial: two values are in use, on purpose, and both are named here:
//   teCad  = -0.1015  the original NACA polynomial (open TE, thickness 0.0021 c = 0.6 mm at the 284 mm chord). Used by the
//                     CAD (cad/params.mjs stations and foil=, cad/BuildVtol.cs, cad/Drawings.cs). A hot-wired XPS core with a
//                     tape skin cannot hold a sharp TE, so the open polynomial is the better model of the built wing.
//   teAero = -0.1036  the closed-TE modification (y = 0 at x = 1). Used by the aero package (analysis/aero/common.py naca4:
//                     SU2 meshes, NeuralFoil) and the hot-wire templates (docs/build/templates/make_templates.py), where a
//                     closed contour is needed for meshing and a clean wire exit. Difference < 0.05 mm forward of 70 % chord.
//   Unifying the two would change the CAD coordinates or the aero/template outputs (code review 2026-10-25); it is therefore
//   left as a recommendation, see cad/README.md "Single sources".
export const FOIL = { m: 0.02, p: 0.4, teCad: -0.1015, teAero: -0.1036 };
export const TAIL_FOIL = { m: 0, p: 0, t: 0.09 };
export const nacaName = (m, p, t) => `NACA ${Math.round(m*100)}${Math.round(p*10)}${String(Math.round(t*100)).padStart(2, '0')}`;

// Fuselage pod: body of revolution, x from the nose (m). Elliptic nose of semi-axis noseA, parallel mid-body to parallelTo,
// smooth-step boat-tail from radius R to tailR at L. noseX is the nose station forward of the wing LE (x fwd); L, R, tailR are
// the pod length, mid-body radius and tail-ring radius (params.txt fusL, fusR, tailR). EST envelope: 0.85 x 0.16 m holds the
// 6S 6500 pack, the avionics bay and the pusher cup (cad/BuildVtol.cs Fuselage()).
export const POD = { noseX: 0.45, L: 0.85, R: 0.08, tailR: 0.03, noseA: 0.22, parallelTo: 0.50 };

// ---- reference implementations (the Python and C# copies in analysis/geom.py and cad/Shared.cs follow these line by line) ----
// half-thickness of a NACA 4-digit section at chord fraction x, thickness ratio t, TE coefficient a4
export const nacaYt = (x, t, a4) => 5*t*(0.2969*Math.sqrt(x) - 0.1260*x - 0.3516*x*x + 0.2843*x**3 + a4*x**4);
// camber line of a NACA 4-digit section (m = 0: straight)
export const nacaYc = (x, m, p) => m === 0 ? 0 : x < p ? m/p**2*(2*p*x - x*x) : m/(1-p)**2*((1-2*p) + 2*p*x - x*x);
export const nacaDyc = (x, m, p) => m === 0 ? 0 : x < p ? 2*m/p**2*(p - x) : 2*m/(1-p)**2*(p - x);
// section outline, cosine spaced with N+1 points per surface, TE(upper) -> LE -> TE(lower), chord 1: [[x, y], ...]
export function nacaSection(m, p, t, N, a4) {
  const up = [], lo = [];
  for (let i = 0; i <= N; i++) {
    const x = (1 - Math.cos(Math.PI * i / N)) / 2;
    const yt = nacaYt(x, t, a4), yc = nacaYc(x, m, p), th = Math.atan(nacaDyc(x, m, p));
    up.push([x - yt*Math.sin(th), yc + yt*Math.cos(th)]); lo.push([x + yt*Math.sin(th), yc - yt*Math.cos(th)]);
  }
  return [...up.slice().reverse(), ...lo.slice(1)];
}
// pod radius at distance s from the nose (L, R, tailR default to POD)
export function podRadius(s, L = POD.L, R = POD.R, rt = POD.tailR) {
  const a = POD.noseA, x1 = POD.parallelTo;
  if (s < a) return R*Math.sqrt(Math.max(0, 1 - ((s - a)/a)**2));
  if (s < x1) return R;
  const u = (s - x1)/(L - x1); return rt + (R - rt)*(1 - u*u*(3 - 2*u));
}
