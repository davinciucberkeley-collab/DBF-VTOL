/* Aircraft model and its visual animation. Owned by the visuals engineer.
   Reads S; never writes it. Additive changes only to the returned API.

   The aircraft is a generic, original lift+cruise design (not a replica of any real type):
   lathe fuselage with a procedural livery texture (windows, door, cheat line, panel lines,
   fictional registration), straight centre wing with dihedral outer panels and canted winglets,
   four booms carrying eight lift rotors in faired nacelles, a tapered V-tail and a pusher prop.

   Coordinate frame (same as config.js): -Z forward, +Y up, +X right; `body` sits BODY_HEIGHT
   above the aircraft origin (origin = wheels on the ground with gear down).

   Performance: update() allocates nothing. All per-frame work is plain number writes. */
import { ROTOR_X, ROTOR_LAYOUT, BODY_HEIGHT, PHYS } from './config.js';
import { clamp, lerp, canvasTex } from './util.js';
import { motionPrefs } from './world.js';

const V3 = THREE.Vector3;
const DEG = Math.PI / 180;

/* ------------------------------------------------------------------------------------------
   Geometry helpers
   ------------------------------------------------------------------------------------------ */

/** Hex colour authored in sRGB -> THREE.Color in linear space (r128 has no colour management). */
const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

/**
 * Closed NACA-4-style section loop, chord 0..1 (0 = leading edge), cosine spaced.
 * Order: trailing edge -> upper surface -> leading edge -> lower surface (TE not duplicated).
 * @param {number} t thickness ratio  @param {number} camber max camber ratio  @param {number} n points per surface
 * @returns {number[][]} [[x, y], ...]
 */
function sectionLoop(t, camber = 0, n = 12) {
  const yt = x => 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4);
  const yc = x => camber * 4 * x * (1 - x);
  const pts = [];
  for (let i = n; i >= 0; i--) { const x = (1 - Math.cos(Math.PI * i / n)) / 2; pts.push([x, yc(x) + yt(x)]); }
  for (let i = 1; i < n; i++) { const x = (1 - Math.cos(Math.PI * i / n)) / 2; pts.push([x, yc(x) - yt(x)]); }
  return pts;
}

/**
 * Loft a lifting surface through span stations. Local frame: span along +X, thickness +Y,
 * chord along +Z with the leading edge at the smaller Z (i.e. forward in aircraft axes).
 * Station: {s: span pos, y: vertical offset, z: leading-edge z, c: chord, tw: twist rad (+ = LE up), th: thickness scale}.
 * Twist rotates each section about its quarter-chord point. Both ends are capped.
 * @param {object[]} st stations  @param {number[][]} loop from sectionLoop()  @param {{mirrorX?:boolean, mirrorZ?:boolean}} [o]
 */
function loft(st, loop, o = {}) {
  const L = loop.length, pos = [], idx = [];
  const sx = o.mirrorX ? -1 : 1, sz = o.mirrorZ ? -1 : 1;
  for (const k of st) {
    const cs = Math.cos(k.tw || 0), sn = Math.sin(k.tw || 0), th = k.th == null ? 1 : k.th;
    for (const [x, y] of loop) {
      const zc = (x - 0.25) * k.c, yc = y * k.c * th;
      pos.push(sx * k.s, k.y + yc * cs - zc * sn, sz * (k.z + 0.25 * k.c + zc * cs + yc * sn));
    }
  }
  for (let i = 0; i < st.length - 1; i++) for (let j = 0; j < L; j++) {
    const a = i * L + j, b = i * L + (j + 1) % L, c = (i + 1) * L + (j + 1) % L, d = (i + 1) * L + j;
    idx.push(a, d, b, b, d, c);
  }
  // End caps: fan around each end section's centroid
  for (const [i, flip] of [[0, true], [st.length - 1, false]]) {
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < L; j++) { cx += pos[(i * L + j) * 3]; cy += pos[(i * L + j) * 3 + 1]; cz += pos[(i * L + j) * 3 + 2]; }
    const ci = pos.length / 3; pos.push(cx / L, cy / L, cz / L);
    for (let j = 0; j < L; j++) { const a = i * L + j, b = i * L + (j + 1) % L; flip ? idx.push(ci, b, a) : idx.push(ci, a, b); }
  }
  // A single mirror flips handedness: reverse winding so faces stay outward.
  if ((sx * sz) < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

/** Fuselage radius profile r(t), t = 0 (nose) .. 1 (tail); shared by the lathe and the livery painter. */
function fuseR(t) {
  if (t < .22) return .82 * Math.pow(Math.sin((t / .22) * Math.PI / 2), .6);
  if (t < .58) return .82;
  return .82 - (.82 - .2) * Math.pow((t - .58) / .42, 1.2);
}
const FUSE_Z0 = -4.6, FUSE_LEN = 9.2;

/**
 * Procedural livery for the fuselage lathe UVs.
 * Lathe UV mapping after rotateX(90°): v = (z - FUSE_Z0) / FUSE_LEN (nose at v=0);
 * u = phi / 2pi with phi = 0 at the belly, .25 right side, .5 top, .75 left side.
 * Returns {map, rough} canvases painted with identical layout (rough: dark = glossy).
 */
function makeLivery() {
  const W = 512, H = 1024;
  const P = (u, v) => [u * W, (1 - v) * H];
  const vOf = z => (z - FUSE_Z0) / FUSE_LEN;
  /* u of a point at height y on the right side for fuselage station v (left side is 1 - u) */
  const uOf = (y, v) => { const r = Math.max(fuseR(clamp(v, 0, 1)), .05); return Math.acos(clamp(-y / r, -1, 1)) / (2 * Math.PI); };

  function paint(g, rough) {
    const C = rough
      ? { base: '#787878', blue: '#6c6c6c', stripe: '#5a5a5a', win: '#101010', line: 'rgba(255,255,255,.25)', text: '#585858' }
      : { base: '#eef1f4', blue: '#1f5fbf', stripe: '#f0a531', win: '#0f1b28', line: 'rgba(20,30,45,.22)', text: '#1f2b3a' };
    g.fillStyle = C.base; g.fillRect(0, 0, W, H);

    // Belly colour + cheat-line, both sweeping up toward the tail. Drawn per side as a polygon in (u, v).
    const yBlue = v => -0.16 + Math.max(0, v - .5) * 0.75;
    for (const side of [1, -1]) {
      const U = (y, v) => side > 0 ? uOf(y, v) : 1 - uOf(y, v);
      const band = (yLo, yHi, colour) => {
        g.fillStyle = colour; g.beginPath();
        for (let i = 0; i <= 60; i++) { const v = i / 60, [x, y] = P(U(yHi(v), v), v); i ? g.lineTo(x, y) : g.moveTo(x, y); }
        for (let i = 60; i >= 0; i--) { const v = i / 60, [x, y] = P(U(yLo(v), v), v); g.lineTo(x, y); }
        g.closePath(); g.fill();
      };
      band(() => -2, yBlue, C.blue);                                   // belly up to the blue line
      band(v => yBlue(v) + 0.03, v => yBlue(v) + 0.085, C.stripe);     // accent cheat-line
    }

    // Panel lines (constant-z rings) and a nose cone seam
    g.strokeStyle = C.line; g.lineWidth = 2;
    for (const z of [-3.95, -1.55, 1.75, 2.75, 3.6]) { const y = P(0, vOf(z))[1]; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

    // Rounded-rect helper in (z, y) on a given side
    const rrect = (side, z0, z1, y0, y1, rad, fill, strokeW) => {
      const pts = [];
      const add = (z, y) => { const v = vOf(z), u = side > 0 ? uOf(y, v) : 1 - uOf(y, v); pts.push(P(u, v)); };
      const N = 6;
      // corners go around: (z0,y1) -> (z1,y1) -> (z1,y0) -> (z0,y0), each rounded
      const corners = [[z0 + rad, y1 - rad, Math.PI, Math.PI / 2], [z1 - rad, y1 - rad, Math.PI / 2, 0], [z1 - rad, y0 + rad, 0, -Math.PI / 2], [z0 + rad, y0 + rad, -Math.PI / 2, -Math.PI]];
      for (const [cz, cy, a0, a1] of corners) for (let i = 0; i <= N; i++) { const a = lerp(a0, a1, i / N); add(cz + Math.cos(a) * rad, cy + Math.sin(a) * rad); }
      g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
      if (strokeW) { g.lineWidth = strokeW; g.strokeStyle = fill; g.stroke(); } else { g.fillStyle = fill; g.fill(); }
    };
    for (const side of [1, -1]) {
      for (const z of [-1.2, -0.55, 0.1]) rrect(side, z - .2, z + .2, .05, .38, .08, C.win);       // cabin windows
      rrect(side, .55, 1.4, -.5, .5, .1, C.line, 2.5);                                            // door outline
      rrect(side, .78, 1.17, .08, .36, .08, C.win);                                               // door window
    }

    // Fictional registration on the aft fuselage, both sides, reading nose -> tail on the right
    // side and tail -> nose on the left, as viewed from outside (see header for the u/v maths).
    g.fillStyle = C.text; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const side of [1, -1]) {
      const v = vOf(2.3), u = side > 0 ? uOf(0.12, v) : 1 - uOf(0.12, v), [x, y] = P(u, v);
      g.save(); g.translate(x, y); g.rotate(side > 0 ? Math.PI / 2 : -Math.PI / 2); g.fillText('LC-08X', 0, 0); g.restore();
    }
  }
  return {
    map: canvasTex(W, H, g => paint(g, false)),
    rough: canvasTex(W, H, g => paint(g, true)),
  };
}

/** Rotor blur disc texture: alpha falls off toward the hub, darker radial blade-path streaks, bright tip ring. */
function makeDiscTexture() {
  return canvasTex(256, 256, (g, w) => {
    const c = w / 2, img = g.createImageData(w, w), d = img.data;
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const dx = (x - c + .5) / c, dy = (y - c + .5) / c, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      let alpha = 0, lum = 205;
      if (r <= 1 && r > .1) {
        alpha = .55 * Math.pow((r - .1) / .9, .7);                            // denser toward the tips
        const streak = .5 + .5 * Math.sin(a * 2 + r * 2.4);                   // two-blade path banding
        lum -= 55 * streak * (1 - r * .4); alpha *= .75 + .25 * streak;
        const tip = Math.exp(-Math.pow((r - .93) / .035, 2));                 // tip-vortex ring
        lum += 45 * tip; alpha = Math.min(1, alpha + .35 * tip);
        if (r > .985) alpha *= (1 - r) / .015;                                // anti-aliased rim
      }
      const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = clamp(lum, 0, 255); d[i + 3] = clamp(alpha * 255, 0, 255);
    }
    g.putImageData(img, 0, 0);
  });
}

/* ------------------------------------------------------------------------------------------
   Build
   ------------------------------------------------------------------------------------------ */

/**
 * Build the aircraft and add it to `scene`.
 * @returns {{aircraft:THREE.Group, body:THREE.Group, rotors:object[], prop:object, gears:THREE.Group[],
 *            lights:object, landingLight:THREE.SpotLight, gearDoors:object[], update(dt:number, S:object):void}}
 */
export function buildAircraft(scene) {
  const livery = makeLivery();
  const M = {
    hull:  new THREE.MeshStandardMaterial({ color: 0xffffff, map: livery.map, roughnessMap: livery.rough, roughness: 1, metalness: .25, envMapIntensity: 1.1 }),
    paint: new THREE.MeshStandardMaterial({ color: lin(0x1f5fbf), metalness: .35, roughness: .38 }),
    white: new THREE.MeshStandardMaterial({ color: lin(0xeef1f4), metalness: .15, roughness: .42 }),
    grey:  new THREE.MeshStandardMaterial({ color: lin(0xb9c2cc), metalness: .45, roughness: .42 }),
    dark:  new THREE.MeshStandardMaterial({ color: lin(0x262d36), metalness: .5, roughness: .5 }),
    glass: new THREE.MeshStandardMaterial({ color: lin(0x0b1622), metalness: .2, roughness: .05, envMapIntensity: 1.6 }),
    tire:  new THREE.MeshStandardMaterial({ color: lin(0x141414), roughness: .9 }),
    panel: new THREE.MeshStandardMaterial({ color: lin(0x15191f), roughness: .8 }),
    screen: new THREE.MeshBasicMaterial({ color: lin(0x2a8fd8) }),
  };
  const aircraft = new THREE.Group(); aircraft.rotation.order = 'YXZ'; scene.add(aircraft);
  const body = new THREE.Group(); body.position.y = BODY_HEIGHT; aircraft.add(body);
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  /* ---------- Fuselage: lathe + livery, canopy, cockpit glareshield, sponsons ---------- */
  {
    const pts = [];
    for (let i = 0; i <= 44; i++) { const t = i / 44; pts.push(new THREE.Vector2(Math.max(fuseR(t), 0.001), FUSE_Z0 + FUSE_LEN * t)); }
    const g = new THREE.LatheGeometry(pts, 48); g.rotateX(Math.PI / 2); g.scale(.92, 1, 1);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z > 1) p.setY(i, p.getY(i) + (z - 1) * .12); }
    g.computeVertexNormals(); add(g, M.hull);

    const canopy = add(new THREE.SphereGeometry(1, 32, 20), M.glass, 0, .36, -2.75); canopy.scale.set(.64, .52, 1.35);
    // Glareshield + two instrument screens: only seen from the cockpit camera (the hull hides them outside).
    // Cockpit eye is at body (0, .55, -2.55): the shield top sits ~20° below the horizon line.
    // A dark cockpit floor/tub hides the ground otherwise visible through the (back-face culled) hull.
    add(new THREE.BoxGeometry(.8, .06, .3), M.panel, 0, .09, -3.6);
    for (const sx of [-.17, .17]) { const s = add(new THREE.PlaneGeometry(.24, .12), M.screen, sx, .01, -3.44); s.rotation.x = -.3; }
    add(new THREE.BoxGeometry(.8, .3, .04), M.panel, 0, -.06, -3.46);             // instrument panel face
    add(new THREE.BoxGeometry(1.2, .03, 2.4), M.panel, 0, -.3, -2.9);             // floor

    // Gear sponsons: hold the main wheels when retracted
    for (const sx of [-1, 1]) add(new THREE.SphereGeometry(1, 20, 12).scale(.25, .3, 1.0), M.paint, sx * .74, -.55, .45);
  }

  /* ---------- Wing: flat centre section across the booms, dihedral tapered outer panels, winglets ---------- */
  const WING_Y = .72, WING_LE = -1.05, ROOT_C = 1.5;
  const TIP = { s: 6.45, c: 1.0 };            // outer-panel tip station (per side)
  const OUT_S = 5.25, DIHEDRAL = 6 * DEG;     // dihedral break just outboard of the outer booms
  const tipY = WING_Y + (TIP.s - OUT_S) * Math.tan(DIHEDRAL);
  const tipLE = WING_LE + (ROOT_C - TIP.c) * 0.35;  // slight LE sweep from taper (TE stays straighter)
  {
    const wingLoop = sectionLoop(.14, .03, 14);
    const centre = loft([
      { s: -OUT_S, y: WING_Y, z: WING_LE, c: ROOT_C }, { s: OUT_S, y: WING_Y, z: WING_LE, c: ROOT_C },
    ], wingLoop);
    add(centre, M.white);
    for (const mirrorX of [false, true]) {
      add(loft([
        { s: OUT_S - .02, y: WING_Y, z: WING_LE, c: ROOT_C },
        { s: TIP.s, y: tipY, z: tipLE, c: TIP.c, tw: -2 * DEG },          // 2° washout at the tip
      ], wingLoop, { mirrorX }), M.white);
      // Winglet: canted 72° up, tapered and swept, in the belly blue
      const wl = loft([
        { s: 0, y: 0, z: 0, c: TIP.c * .92, th: .9 }, { s: .62, y: 0, z: .42, c: .42, th: .9 }, { s: .68, y: 0, z: .5, c: .3, th: .8 },
      ], sectionLoop(.1, 0, 10), { mirrorX });
      const m = add(wl, M.paint, (mirrorX ? -1 : 1) * (TIP.s - .03), tipY, tipLE + .04);
      m.rotation.z = (mirrorX ? -1 : 1) * 72 * DEG;
    }
  }

  /* ---------- V-tail: tapered, swept surfaces with ~38° dihedral ---------- */
  for (const mirrorX of [false, true]) {
    const tl = loft([
      { s: 0, y: 0, z: 0, c: 1.25 }, { s: 2.25, y: 0, z: .55, c: .62 },
    ], sectionLoop(.11, 0, 10), { mirrorX });
    const m = add(tl, M.paint, 0, .66, 3.2); m.rotation.z = (mirrorX ? -1 : 1) * 0.66;
  }

  /* ---------- Booms with wing fairings and tapered tail cones ---------- */
  for (const x of ROTOR_X) {
    add(new THREE.CylinderGeometry(.11, .11, 6.0, 16).rotateX(Math.PI / 2), M.grey, x, .52, 0);
    add(new THREE.SphereGeometry(.11, 14, 8).scale(1, 1, 2.6), M.grey, x, .52, -3.0);          // front cap
    add(new THREE.ConeGeometry(.11, .7, 14).rotateX(Math.PI / 2), M.grey, x, .52, 3.35);      // tail cone
    add(new THREE.SphereGeometry(1, 16, 10).scale(.13, .15, 1.0), M.white, x, .63, -.3);       // boom-to-wing fairing
  }

  /* ---------- Lift rotors (index order matches S.rotors / ROTOR_LAYOUT) ---------- */
  // Tapered, twisted two-blade planform with a rounded tip; mirrored for the opposite spin direction.
  const bladeStations = [];
  for (const s of [.12, .3, .5, .7, .86, .95, .985, 1.0]) {
    const f = (s - .12) / .88; let c = lerp(.17, .09, f);
    if (s > .9) c *= Math.sqrt(Math.max(0, 1 - Math.pow((s - .9) / .1, 2))) * .9 + .1;   // elliptical tip
    bladeStations.push({ s, y: 0, z: -.25 * c, c, tw: lerp(14, 6, f) * DEG, th: lerp(1.2, .8, f) });
  }
  const bladeLoop = sectionLoop(.11, .04, 8);
  const bladeGeo = { 1: loft(bladeStations, bladeLoop), [-1]: loft(bladeStations, bladeLoop, { mirrorZ: true }) };
  const nacelleGeo = new THREE.LatheGeometry([[0, -.36], [.1, -.34], [.15, -.22], [.17, -.05], [.165, .02], [.12, .06], [0, .07]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
  const finGeo = new THREE.TorusGeometry(.172, .012, 6, 24).rotateX(Math.PI / 2);
  const hubGeo = new THREE.SphereGeometry(.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const discGeo = new THREE.RingGeometry(.12, 1.0, 64, 1).rotateX(-Math.PI / 2);
  const discTex = makeDiscTexture();
  // One shared material for every blur disc: Lambert so it is lit and fogged (dark at night).
  const discMatProto = new THREE.MeshLambertMaterial({ map: discTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });

  const rotors = ROTOR_LAYOUT.map(({ idx, x, z, dir }) => {
    const pivot = new THREE.Group(); pivot.position.set(x, .92, z); body.add(pivot);
    add(new THREE.CylinderGeometry(.06, .09, .3, 10), M.grey, 0, -.25, 0, pivot);   // pylon down to the boom
    add(nacelleGeo, M.dark, 0, 0, 0, pivot);
    add(finGeo, M.grey, 0, -.1, 0, pivot);                                           // cooling ring
    const spin = new THREE.Group(); spin.position.y = .05; pivot.add(spin);
    const bladeMat = new THREE.MeshStandardMaterial({ color: lin(0x1d232b), roughness: .45, metalness: .25, transparent: false });
    const blades = [];
    for (const ry of [0, Math.PI]) { const b = new THREE.Mesh(bladeGeo[dir], bladeMat); b.rotation.y = ry; spin.add(b); blades.push(b); }
    add(hubGeo, M.white, 0, 0, 0, spin).scale.y = .7;
    const discMat = discMatProto.clone();
    const disc = new THREE.Mesh(discGeo, discMat); disc.position.y = .05; disc.renderOrder = 2; pivot.add(disc);
    const arrow = new THREE.ArrowHelper(new V3(0, 1, 0), new V3(0, .1, 0), 1, 0xffb547, .3, .2); arrow.visible = false; pivot.add(arrow);
    return { idx, x, z, dir, pivot, spin, bladeMat, discMat, disc, arrow, angle: Math.PI / 2, blades };
  });

  /* ---------- Pusher prop (3 blades, spins about the body Z axis) ---------- */
  const prop = { angle: 0 };
  {
    const pv = new THREE.Group(); pv.position.set(0, .43, 4.66); body.add(pv); prop.pivot = pv;
    add(new THREE.ConeGeometry(.22, .55, 24).rotateX(Math.PI / 2).translate(0, 0, .28), M.white, 0, 0, 0, pv);
    prop.spin = new THREE.Group(); prop.spin.position.z = .12; pv.add(prop.spin);
    prop.bladeMat = new THREE.MeshStandardMaterial({ color: lin(0x1d232b), roughness: .45, metalness: .25 });
    const st = [];
    for (const s of [.15, .35, .6, .8, .92, .975, 1.0]) {
      const f = (s - .15) / .85; let c = lerp(.15, .08, f); if (s > .88) c *= Math.sqrt(Math.max(0, 1 - Math.pow((s - .88) / .12, 2))) * .9 + .1;
      st.push({ s, y: 0, z: -.25 * c, c, tw: -lerp(40, 18, f) * DEG, th: lerp(1.3, .8, f) });
    }
    // Loft frame (span X, thickness Y, chord Z) -> prop frame (span Y, chord X, thickness Z): cyclic, keeps winding.
    const pg = loft(st, sectionLoop(.1, .03, 8)).applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
    prop.blades = [];
    for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(pg, prop.bladeMat); b.rotation.z = k * Math.PI * 2 / 3; prop.spin.add(b); prop.blades.push(b); }
    prop.discMat = discMatProto.clone();
    const d = new THREE.Mesh(new THREE.RingGeometry(.2, .98, 64, 1), prop.discMat); d.position.z = .12; d.renderOrder = 2; pv.add(d); prop.disc = d;
    prop.arrow = new THREE.ArrowHelper(new V3(0, 0, -1), new V3(0, 0, -.3), 1, 0x7fd4ff, .35, .22); prop.arrow.visible = false; pv.add(prop.arrow);
  }

  /* ---------- Landing gear (index 0 = nose) + clamshell doors ---------- */
  // Pivots sit just inside the hull/sponsons so the folded wheels are hidden; strut length keeps
  // the wheel bottoms exactly at the aircraft origin (y = 0) when extended.
  const gears = [], gearDoors = [];
  function addGear(x, z, pivotY, doorLen) {
    const len = BODY_HEIGHT + pivotY - .23;
    const pv = new THREE.Group(); pv.position.set(x, pivotY, z); body.add(pv);
    add(new THREE.CylinderGeometry(.045, .045, len, 8).translate(0, -len / 2, 0), M.grey, 0, 0, 0, pv);
    add(new THREE.CylinderGeometry(.23, .23, .16, 20).rotateZ(Math.PI / 2), M.tire, 0, -len, 0, pv);
    add(new THREE.CylinderGeometry(.12, .12, .17, 12).rotateZ(Math.PI / 2), M.grey, 0, -len, 0, pv);   // hub
    gears.push(pv);
    // Two doors hinged along the outer edges of the well, under the pivot
    const zc = z + (gears.length === 1 ? .25 : -.25);  // centred on where the folded leg lies
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group(); hinge.position.set(x + side * .17, pivotY - .3, zc); body.add(hinge);
      add(new THREE.BoxGeometry(.17, .02, doorLen).translate(-side * .085, 0, 0), M.paint, 0, 0, 0, hinge);
      gearDoors.push({ hinge, side });
    }
  }
  addGear(0, -3.0, -.55, .7); addGear(-.74, .55, -.55, .75); addGear(.74, .55, -.55, .75);

  /* ---------- Shadows: everything casts/receives except discs, glass interior and blades (managed per frame) ---------- */
  body.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  rotors.forEach(r => { r.disc.castShadow = r.disc.receiveShadow = false; });
  prop.disc.castShadow = prop.disc.receiveShadow = false;

  /* ---------- Lights: nav/strobe/beacon sprites + landing spotlight ---------- */
  const glowTex = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  function glow(color, pos, scale) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: lin(color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    s.position.copy(pos); s.scale.setScalar(scale); body.add(s); return s;
  }
  const wingTipZ = tipLE + TIP.c * .1;
  const lights = {
    left: glow(0xff3030, new V3(-TIP.s - .1, tipY, wingTipZ), .9), right: glow(0x30ff60, new V3(TIP.s + .1, tipY, wingTipZ), .9), tail: glow(0xffffff, new V3(0, .6, 4.4), .7),
    strobeL: glow(0xffffff, new V3(-TIP.s - .1, tipY, wingTipZ + .4), 1.8), strobeR: glow(0xffffff, new V3(TIP.s + .1, tipY, wingTipZ + .4), 1.8), beacon: glow(0xff2222, new V3(0, .86, .6), 1.1),
    landing: glow(0xfff4e0, new V3(0, -.5, -3.9), .9),
  };
  // Landing light: always in the scene (toggling a light's presence would recompile every material); intensity 0 = off.
  const landingLight = new THREE.SpotLight(lin(0xfff4e0), 0, 160, 0.42, 0.55, 1.2);
  landingLight.position.set(0, -.5, -3.9); landingLight.target.position.set(0, -6, -30);
  landingLight.castShadow = false; body.add(landingLight, landingLight.target);

  /* ---------- Per-frame visual sync from S (allocation-free) ---------- */
  const BLADE_STEP_MAX = 0.5;   // rad/frame visual cap on blade rotation: avoids wagon-wheel strobing

  /** Fade blades, toggle transparency only when needed, and stop blades casting shadows once spinning. */
  function setBladeLook(mat, blades, rpm, discsOn) {
    // With blur discs shown the solid blades fade out quickly; without them they stay readable.
    const opacity = 1 - clamp((rpm - 0.15) * 1.3, 0, discsOn ? 0.85 : 0.6);
    mat.opacity = opacity;
    const wantTransparent = opacity < 0.99;
    if (mat.transparent !== wantTransparent) { mat.transparent = wantTransparent; mat.needsUpdate = true; }
    const cast = rpm < 0.25;
    if (blades[0].castShadow !== cast) for (let i = 0; i < blades.length; i++) blades[i].castShadow = cast;
  }

  function update(dt, S) {
    const t = performance.now() / 1000;          // wall clock: light flashing only
    const st = Number.isFinite(S.t) ? S.t : t;   // sim clock: anything that should freeze when paused
    const sdt = Number.isFinite(S.frameSimDt) ? S.frameSimDt : dt;   // sim seconds this frame (0 when paused)
    const reduced = motionPrefs.reduced;

    // Pose (+ small wind-turbulence wobble on the sim clock; none under reduced motion).
    // Pitch/roll are physical now, so the extra wobble is kept very small.
    const turb = S.onGround || reduced || S.crashed ? 0 : S.wind * 0.0015;
    aircraft.position.copy(S.pos);
    aircraft.rotation.set(S.pitch + turb * Math.sin(st * 3.1) * 0.5, S.psi, S.roll + turb * Math.sin(st * 2.3 + 1));

    // Gear (nose folds aft, mains fold forward) and doors (open while the gear is out)
    const ga = S.gearAnim;
    for (let i = 0; i < gears.length; i++) gears[i].rotation.x = -(1 - ga) * 1.5 * (i === 0 ? 1 : -1);
    const doorOpen = clamp(ga * 3, 0, 1) * 1.45;   // fully open by 1/3 extension, closed when stowed
    for (let i = 0; i < gearDoors.length; i++) gearDoors[i].hinge.rotation.z = gearDoors[i].side * doorOpen;

    // Healthy-rotor count once per frame (no array allocation)
    let healthy = 0; for (let i = 0; i < S.rotors.length; i++) if (S.rotors[i].health > 0) healthy++;
    healthy = Math.max(1, healthy);

    // Lift rotors
    for (let i = 0; i < rotors.length; i++) {
      const r = rotors[i], sim = S.rotors[i];
      r.angle += r.dir * Math.min(sim.rpm * 48 * sdt, BLADE_STEP_MAX);
      if (S.stowed && sim.rpm < 0.03) { // lock blades fore-and-aft
        const tgt = Math.round((r.angle - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
        r.angle = lerp(r.angle, tgt, Math.min(1, dt * 3));
      }
      r.angle %= Math.PI * 4;   // keep precision bounded on long sessions (period-safe for a 2-blade rotor)
      r.spin.rotation.y = r.angle;
      setBladeLook(r.bladeMat, r.blades, sim.rpm, S.discs);
      r.discMat.opacity = S.discs ? clamp(sim.rpm * 0.6, 0, 0.55) : 0;
      r.disc.visible = r.discMat.opacity > 0.005;
      if (r.disc.visible) r.disc.rotation.y = r.angle * 0.03;    // slow shimmer of the streak pattern
      const thr = Number.isFinite(sim.thrust) ? Math.max(0, sim.thrust)
        : (sim.health > 0 && !S.stowed ? S.rotorLift / PHYS.rotorMaxLift * 8 / healthy : 0);
      r.arrow.visible = S.vectors && thr > 0.03; if (r.arrow.visible) r.arrow.setLength(0.4 + thr * 2.6, .3, .2);
    }

    // Pusher prop
    const prpm = S.prop.rpm;
    prop.angle = (prop.angle + Math.min(prpm * 60 * sdt, BLADE_STEP_MAX)) % (Math.PI * 2);
    prop.spin.rotation.z = prop.angle;
    setBladeLook(prop.bladeMat, prop.blades, prpm, S.discs);
    prop.discMat.opacity = S.discs ? clamp(prpm * 0.6, 0, 0.5) : 0;
    prop.disc.visible = prop.discMat.opacity > 0.005;
    const pth = Number.isFinite(S.prop.thrust) ? Math.max(0, S.prop.thrust) : (prpm > 0.15 ? prpm : 0);
    prop.arrow.visible = S.vectors && pth > 0.03; if (prop.arrow.visible) prop.arrow.setLength(0.5 + pth * 3, .35, .22);

    // Lights. Under reduced motion strobes/beacon become a steady dim glow instead of hard flashes.
    const on = S.lights && S.master;
    lights.left.visible = lights.right.visible = lights.tail.visible = on;
    if (reduced) {
      lights.strobeL.visible = lights.strobeR.visible = lights.beacon.visible = on;
      lights.strobeL.material.opacity = lights.strobeR.material.opacity = .25; lights.beacon.material.opacity = .45;
    } else {
      lights.strobeL.material.opacity = lights.strobeR.material.opacity = lights.beacon.material.opacity = 1;
      lights.strobeL.visible = lights.strobeR.visible = on && (t % 1.2) < 0.06;
      lights.beacon.visible = on && (t % 1.0) < 0.5;
    }
    const ls = S.tod === 'night' ? 1.4 : 1; lights.left.scale.setScalar(.9 * ls); lights.right.scale.setScalar(.9 * ls);

    // Landing light: on with the lights switch below ~150 m; strongest at night.
    const ll = on && S.pos.y < 150;
    landingLight.intensity = ll ? (S.tod === 'day' ? 0.6 : 3.2) : 0;
    lights.landing.visible = ll;
  }

  return { aircraft, body, rotors, prop, gears, lights, landingLight, gearDoors, update };
}
