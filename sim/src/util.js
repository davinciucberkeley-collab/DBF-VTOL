/* Shared helpers. Owned by the integrator (with main.js). Additive changes only. */

export const $ = s => document.querySelector(s);
export const $$ = s => document.querySelectorAll(s);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Deterministic Park–Miller PRNG. Returns () => number in (0,1). */
export function makeRng(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

/** World-space unit vectors for a heading psi (radians, 0 = -Z, positive = turn left). */
export const fwdVec = psi => new THREE.Vector3(-Math.sin(psi), 0, -Math.cos(psi));
export const rightVec = psi => new THREE.Vector3(Math.cos(psi), 0, -Math.sin(psi));

/** Procedural canvas texture. draw(ctx, w, h); rep = [repeatX, repeatY] enables wrapping. */
export function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}

/* Minimal event bus so modules can notify each other without importing each other.
   Known events:
     'toast'  (msg: string)  — show a transient message (handled by ui.js)
     'reset'  ()             — simulation was reset to the pad (world.js clears the trail) */
const handlers = {};
export function on(type, fn) { (handlers[type] || (handlers[type] = [])).push(fn); }
export function emit(type, payload) { (handlers[type] || []).forEach(fn => fn(payload)); }
