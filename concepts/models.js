/* Concept models: one illustrative 3D model per literature concept, built on the C0 envelope.
 * Inlined into Concept-Models.html by concepts/build.mjs. Needs three.js r147 + OrbitControls (UMD build).
 * Frame: x = span (right +), y = up, z = forward. That is the SOLIDWORKS frame of cad/params.txt with
 * three.z = CAD X (wing LE at 0, forward +) and three.x = CAD Z. Metres.
 */
(function () {
  "use strict";
  const DATA = window.CONCEPT_MODELS;
  const G = DATA.geo;
  const canvas = document.getElementById("cv");
  const stage = document.getElementById("stage");
  function fail(msg) { stage.classList.add("failed"); document.getElementById("fallback").textContent = msg; }
  if (!window.THREE || !THREE.OrbitControls) { fail("The 3D library did not load. Check the connection and reload."); return; }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
  catch (err) { fail("This browser cannot show WebGL."); return; }

  const css = getComputedStyle(document.documentElement);
  const cssColor = (v, d) => new THREE.Color((css.getPropertyValue(v) || "").trim() || d);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.minDistance = 1.0; controls.maxDistance = 10;
  controls.maxPolarAngle = Math.PI * 0.49;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8792, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 1.15); sun.position.set(2.5, 4, 3); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xe4e8ee, 0.35); fill.position.set(-3, 1.5, -2); scene.add(fill);
  const GROUND = G.ground_y;
  let grid;
  function theme() {   // scene colours follow the page theme tokens
    const c2 = getComputedStyle(document.documentElement);
    scene.background = new THREE.Color((c2.getPropertyValue("--stage") || "").trim() || "#f4f5f6");
    if (grid) scene.remove(grid);
    const dark = scene.background.getHSL({}).l < 0.4;
    grid = new THREE.GridHelper(7, 35, dark ? 0x23282d : 0xbfc4ca, dark ? 0x1f2327 : 0xdfe2e6);
    grid.position.y = GROUND; scene.add(grid);
  }
  theme();
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", theme);

  const std = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.55, metalness: 0.05 }, o || {}));
  const FEAT = cssColor("--feature", "#2f5d8a");
  const M = {
    body: std(0xe8ebee), pod: std(0xe8ebee), alu: std(0xb4bac1, { metalness: 0.55, roughness: 0.35 }),
    feat: std(FEAT, { roughness: 0.4 }), // light theme: a pale tint of the feature blue; dark theme (already light blue): a slightly deeper shade
    featSoft: std(FEAT.getHSL({}).l > 0.5 ? FEAT.clone().multiplyScalar(0.72) : FEAT.clone().lerp(new THREE.Color(0xffffff), 0.4), { roughness: 0.5 }),
    motor: std(0x575e66, { metalness: 0.5, roughness: 0.35 }), blade: std(0x1c2026, { roughness: 0.5 }),
    surf: std(0xc9ced4), joint: std(0x7d848c), batt: std(0x6c737c),
    disk: new THREE.MeshBasicMaterial({ color: FEAT, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
    env: new THREE.LineDashedMaterial({ color: 0x6c737c, dashSize: 0.05, gapSize: 0.035 }),
  };
  [M.body, M.pod, M.featSoft, M.feat, M.surf].forEach(m => { m.side = THREE.DoubleSide; });

  // ---------------------------------------------------------------- geometry helpers
  function mesh(geo, mat, p, r) { const m = new THREE.Mesh(geo, mat); if (p) m.position.set(p[0], p[1], p[2]); if (r) m.rotation.set(r[0], r[1], r[2]); return m; }
  function tube(r, len, axis, mat, p) {
    const m = mesh(new THREE.CylinderGeometry(r, r, len, 18), mat, p);
    if (axis === "z") m.rotation.x = Math.PI / 2; if (axis === "x") m.rotation.z = Math.PI / 2; return m;
  }
  function airfoil(t, camber) {  // NACA 4-digit style section, unit chord, camber peak at 40 % (C0 uses NACA 2415)
    const s = new THREE.Shape(), N = 26, up = [], lo = [], p = 0.4;
    for (let i = 0; i <= N; i++) {
      const x = (1 - Math.cos(Math.PI * i / N)) / 2;
      const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4);
      const yc = x < p ? camber / (p * p) * (2 * p * x - x * x) : camber / ((1 - p) ** 2) * ((1 - 2 * p) + 2 * p * x - x * x);
      up.push([x, yc + yt]); lo.push([x, yc - yt]);
    }
    s.moveTo(up[N][0], up[N][1]);
    for (let i = N - 1; i >= 0; i--) s.lineTo(up[i][0], up[i][1]);
    for (let i = 1; i <= N; i++) s.lineTo(lo[i][0], lo[i][1]);
    return s;
  }
  // A panel spanning +x from 0 to `span`, LE at z = 0, TE at z = -chord (tipChord tapers linearly).
  function panel(span, chord, t, mat, tipChord, camber) {
    const geo = new THREE.ExtrudeGeometry(airfoil(t, camber == null ? G.camber : camber), { depth: span, bevelEnabled: false, steps: 1 });
    geo.rotateY(Math.PI / 2);
    const tc = tipChord == null ? chord : tipChord, pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const f = pos.getX(i) / span, c = chord + (tc - chord) * f;
      pos.setY(i, pos.getY(i) * c); pos.setZ(i, pos.getZ(i) * c);
    }
    geo.computeVertexNormals();
    return mesh(geo, mat);
  }
  function lathe(profile, mat) {  // profile [[r, z]] along +z (nose +)
    const geo = new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])), 36);
    geo.rotateX(Math.PI / 2);
    return mesh(geo, mat);
  }

  // ---------------------------------------------------------------- rotors
  function rotor(d, o) {
    o = o || {};
    const g = new THREE.Group();
    g.add(tube(0.024, 0.032, "y", M.motor, [0, 0.016, 0]));
    const blades = new THREE.Group(); blades.position.y = 0.038;
    const nb = o.blades || 2, bm = o.feature ? M.feat : M.blade;
    for (let i = 0; i < nb; i++) {
      const arm = new THREE.Group();
      arm.add(mesh(new THREE.BoxGeometry(d * 0.47, 0.004, Math.max(0.02, d * 0.08)), bm, [d * 0.25, 0, 0], [0.18, 0, 0]));
      arm.rotation.y = (i * 2 * Math.PI) / nb; blades.add(arm);
    }
    blades.add(tube(0.011, 0.014, "y", M.motor));
    if (o.fairing) blades.add(mesh(new THREE.SphereGeometry(1, 20, 12).scale(0.03, 0.022, 0.06).rotateY(Math.PI / 2), M.feat));
    const park = o.park == null ? 0.6 : o.park;
    blades.rotation.y = park;
    g.add(blades);
    const disk = mesh(new THREE.CircleGeometry(d / 2, 48), M.disk, [0, 0.038, 0], [-Math.PI / 2, 0, 0]);
    g.add(disk);
    g.userData.rotor = { blades, disk, spin: o.spin || (() => 1), park, angle: park };
    return g;
  }
  const HOVER = t => Math.max(0, 1 - t * 1.4);
  const CRUISE = t => Math.min(1, t * 1.6);
  const ALWAYS = () => 1;

  // ---------------------------------------------------------------- C0 parts (cad/params.txt placements)
  const HALF = G.half_span, C = G.chord, BY = G.boom_x, YB = G.boom_y;
  function pod(c, o) {   // body of revolution: elliptic nose, parallel section, boat-tail, canopy blister
    o = o || {};
    const n = G.pod_nose, len = o.len || G.pod_len, r = G.pod_r, t = n - len, y = G.pod_y;
    const p = lathe([[0, t], [r * 0.32, t + 0.02], [r * 0.7, t + len * 0.16], [r, t + len * 0.42], [r, t + len * 0.7],
      [r * 0.86, t + len * 0.86], [r * 0.5, t + len * 0.96], [0, n]], o.mat || M.pod);
    p.position.y = y; c.add(p);
    c.add(mesh(new THREE.SphereGeometry(1, 24, 12).scale(r * 0.6, r * 0.55, 0.17), M.pod, [0, y + r * 0.62, G.canopy_x]));
  }
  function wing(c, o) {
    o = o || {};
    const chord = o.chord || C, y = o.y == null ? 0 : o.y, le = o.le == null ? 0 : o.le, mat = o.mat || M.body, t = o.t || G.tc;
    const w = new THREE.Group(); w.position.set(0, y, le); c.add(w);
    const saddle = panel(2 * G.saddle_half, chord, t, mat); saddle.position.x = -G.saddle_half; w.add(saddle);
    [1, -1].forEach(s => {
      const holder = new THREE.Group(); holder.position.x = s * G.saddle_half; holder.scale.x = s; w.add(holder);
      holder.add(panel(HALF - G.saddle_half, chord, t, mat));
      if (!o.noAilerons) {
        const a0 = G.aileron_in - G.saddle_half, a1 = HALF - G.saddle_half - 0.02;
        holder.add(mesh(new THREE.BoxGeometry(a1 - a0, 0.006, chord * 0.26), M.surf, [(a0 + a1) / 2, -0.004, -chord * 0.87]));
      }
      w.add(mesh(new THREE.BoxGeometry(0.006, chord * 0.17, chord * 1.02), M.joint, [s * G.saddle_half, 0.004, -chord / 2]));
    });
    return w;
  }
  function booms(c, o) {
    o = o || {};
    const z0 = o.z0 == null ? G.boom_x0 : o.z0, z1 = G.boom_x1;
    [BY, -BY].forEach(x => c.add(tube(G.boom_r, z1 - z0, "z", M.alu, [x, YB, (z0 + z1) / 2])));
  }
  function quad(c, ctx, o) {
    o = o || {};
    [[BY, G.rotor_front], [-BY, G.rotor_front], [BY, G.rotor_rear], [-BY, G.rotor_rear]].forEach(([x, z]) => {
      const r = rotor(G.lift_d, Object.assign({ spin: HOVER, park: 0.6 }, o)); r.position.set(x, G.prop_y - 0.038, z);
      c.add(r); ctx.rotors.push(r);
    });
  }
  function pusher(c, ctx, o) {
    o = o || {};
    const r = rotor(G.push_d, Object.assign({ spin: CRUISE }, o));
    r.rotation.x = -Math.PI / 2; r.position.set(0, G.pod_y, o.z == null ? G.push_x + 0.03 : o.z); c.add(r); ctx.rotors.push(r);
  }
  function hTail(c) {   // stabiliser across the booms plus a fin on each boom
    const ht = panel(G.h_span, G.h_chord, 0.09, M.body, null, 0); ht.position.set(-G.h_span / 2, G.h_y, G.tail_x); c.add(ht);
    [BY, -BY].forEach(x => {
      const v = panel(G.v_h, G.v_c, 0.09, M.body, G.v_c * 0.65, 0); v.rotation.z = Math.PI / 2; v.position.set(x, YB, G.tail_x + 0.02); c.add(v);
    });
  }
  function gear(c) {
    [BY, -BY].forEach(x => G.leg_x.forEach(z => {
      c.add(tube(G.leg_r, G.leg_len, "y", M.alu, [x, GROUND + G.leg_len / 2, z]));
      c.add(mesh(new THREE.SphereGeometry(G.leg_r * 1.4, 12, 8), M.motor, [x, GROUND + 0.01, z]));
    }));
  }
  function base(c, ctx, o) {
    o = o || {};
    if (!o.noPod) pod(c);
    if (!o.noWing) wing(c, o.wing);
    if (!o.noBooms) booms(c);
    if (!o.noQuad) quad(c, ctx, o.quad);
    if (!o.noPusher) pusher(c, ctx);
    if (!o.noTail) hTail(c);
    if (!o.noGear) gear(c);
  }
  function tilter(c, ctx, p, from, to) {
    const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]); c.add(g);
    ctx.tilts.push({ obj: g, from, to }); return g;
  }

  // ---------------------------------------------------------------- the eleven concepts
  const BUILD = {
    a0(c, ctx) { base(c, ctx); },
    a1(c, ctx) {
      base(c, ctx, { noPusher: true });
      [1, -1].forEach(s => {
        c.add(tube(0.026, 0.26, "z", M.feat, [s * HALF, 0.01, -0.09]));
        const r = rotor(G.push_d, { spin: CRUISE, feature: true }); r.rotation.x = Math.PI / 2;
        r.position.set(s * HALF, 0.01, 0.02); c.add(r); ctx.rotors.push(r);
      });
    },
    a2(c, ctx) {
      base(c, ctx, { noPod: true, noPusher: true });
      const n = G.pod_nose, t = G.push_x - 0.05, r = G.pod_r;
      const p = lathe([[0, t], [0.03, t + 0.02], [r * 0.55, t + 0.18], [r * 0.9, t + 0.42], [r, n - 0.42], [r, n - 0.25],
        [r * 0.62, n - 0.08], [r * 0.25, n - 0.015], [0, n]], M.pod);
      p.position.y = G.pod_y; c.add(p);
      c.add(mesh(new THREE.SphereGeometry(1, 24, 12).scale(r * 0.6, r * 0.55, 0.17), M.pod, [0, G.pod_y + r * 0.62, G.canopy_x]));
      const wake = lathe([[0.001, t + 0.03], [r * 1.12, t + 0.2], [r * 1.25, t + 0.4]], M.disk); wake.position.y = G.pod_y; c.add(wake);
      pusher(c, ctx, { feature: true, z: t - 0.005 });
    },
    a3(c, ctx) { base(c, ctx, { quad: { feature: true, fairing: true, park: Math.PI / 2 } }); },
    b1(c, ctx) {
      base(c, ctx, { noPusher: true, noQuad: true });
      [BY, -BY].forEach(x => {
        const piv = tilter(c, ctx, [x, G.prop_y - 0.038, G.rotor_front], 0, Math.PI / 2);
        piv.add(mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), M.feat));
        const r = rotor(G.lift_d, { spin: ALWAYS, feature: true }); piv.add(r); ctx.rotors.push(r);
        const rr = rotor(G.lift_d, { spin: HOVER }); rr.position.set(x, G.prop_y - 0.038, G.rotor_rear); c.add(rr); ctx.rotors.push(rr);
      });
    },
    b2(c, ctx) {
      c.add(mesh(new THREE.SphereGeometry(1, 40, 20).scale(0.32, 0.09, 0.6), M.featSoft, [0, 0, -0.05]));
      [1, -1].forEach(s => {
        const h = new THREE.Group(); h.position.set(s * 0.18, 0, 0.22); h.rotation.y = s * 0.42; h.scale.x = s; c.add(h);
        h.add(panel((HALF - 0.18) / Math.cos(0.42), 0.44, 0.1, M.featSoft, 0.2));
        c.add(tube(G.boom_r, 1.05, "z", M.alu, [s * 0.6, -0.01, -0.06]));
        [0.46, -0.58].forEach(z => {
          const piv = tilter(c, ctx, [s * 0.6, 0.03, z], 0, Math.PI / 2);
          piv.add(mesh(new THREE.BoxGeometry(0.045, 0.03, 0.045), M.feat));
          const r = rotor(G.lift_d * 0.85, { spin: ALWAYS, feature: true }); piv.add(r); ctx.rotors.push(r);
        });
      });
      [0.6, -0.6].forEach(x => [0.25, -0.4].forEach(z => c.add(tube(G.leg_r, -GROUND - 0.03, "y", M.alu, [x, (GROUND - 0.03) / 2, z]))));
    },
    b3(c, ctx) {
      pod(c, { len: G.pod_len });
      const zt = G.tail_x - G.h_chord - 0.15;
      c.add(tube(0.014, (G.pod_nose - G.pod_len + 0.05) - zt, "z", M.alu, [0, G.pod_y, (G.pod_nose - G.pod_len + 0.05 + zt) / 2]));
      const ht = panel(0.6, 0.13, 0.09, M.body, null, 0); ht.position.set(-0.3, G.pod_y, zt + 0.13); c.add(ht);
      const vt = panel(0.2, 0.15, 0.09, M.body, 0.1, 0); vt.rotation.z = Math.PI / 2; vt.position.set(0, G.pod_y, zt + 0.15); c.add(vt);
      [0.35, -0.35].forEach(x => [0.25, -0.35].forEach(z => c.add(tube(G.leg_r, -GROUND + G.pod_y, "y", M.alu, [x * 0.5, (GROUND + G.pod_y) / 2, z]))));
      const piv = tilter(c, ctx, [0, 0, -C * 0.4], -Math.PI / 2 * 0.95, 0);
      const w = wing(piv, { y: 0, le: C * 0.4, mat: M.featSoft });
      [0.42, 0.9, -0.42, -0.9].forEach(x => {
        w.add(tube(0.018, 0.12, "z", M.motor, [x, 0, 0.06]));
        const r = rotor(G.push_d, { spin: ALWAYS }); r.rotation.x = Math.PI / 2; r.position.set(x, 0, 0.12); w.add(r); ctx.rotors.push(r);
      });
      const tf = rotor(0.16, { spin: HOVER, feature: true }); tf.position.set(0, G.pod_y, zt + 0.32); c.add(tf); ctx.rotors.push(tf);
    },
    b4(c, ctx) {
      const air = tilter(c, ctx, [0, 0, 0], -Math.PI / 2, 0);
      ctx.lift = { obj: air, hover: 0 };
      pod(air, { len: 0.62 });
      [1, -1].forEach(s => {
        const h = new THREE.Group(); h.position.set(s * 0.07, 0, 0.14); h.rotation.y = s * 0.44; h.scale.x = s; air.add(h);
        h.add(panel((HALF - 0.07) / Math.cos(0.44), 0.36, 0.12, M.body, 0.2));
        const fin = panel(0.24, 0.2, 0.08, M.feat, 0.16, 0); fin.rotation.z = -Math.PI / 2;
        fin.position.set((HALF - 0.1) / Math.cos(0.44), 0, -0.13); h.add(fin);
        const r = rotor(G.push_d, { spin: ALWAYS }); r.rotation.x = Math.PI / 2;
        r.position.set(s * 0.5, 0, 0.14 - 0.43 * Math.tan(0.44) + 0.07); air.add(r); ctx.rotors.push(r);
      });
    },
    c1(c, ctx) {
      base(c, ctx, { noWing: true, noTail: true });
      const a = 12 * Math.PI / 180, ch = 0.2, ft = 0.2 - Math.tan(a) * HALF, b = Math.atan((ft + 0.36) / HALF);
      [1, -1].forEach(s => {
        const f = new THREE.Group(); f.position.set(0, 0.02, 0.2); f.rotation.y = s * a; f.scale.x = s; c.add(f);
        f.add(panel(HALF / Math.cos(a), ch, G.tc, M.featSoft));
        const r = new THREE.Group(); r.position.set(0, 0.24, -0.36); r.rotation.y = -s * b; r.scale.x = s; c.add(r);
        r.add(panel(HALF / Math.cos(b), ch, G.tc, M.featSoft));
        const fin = panel(0.22, ch, 0.09, M.featSoft, null, 0); fin.rotation.z = Math.PI / 2; fin.position.set(s * HALF, 0.02, ft); c.add(fin);
      });
      c.add(mesh(new THREE.BoxGeometry(0.03, 0.2, 0.12), M.body, [0, 0.14, -0.43]));
      [BY, -BY].forEach(x => {
        const v = panel(G.v_h, G.v_c, 0.09, M.body, G.v_c * 0.65, 0); v.rotation.z = Math.PI / 2; v.position.set(x, YB, G.tail_x + 0.02); c.add(v);
      });
    },
    c2(c, ctx) {
      base(c, ctx, { noWing: true, noQuad: true });
      const ch = 0.42, le = 0.08, zc = le - ch / 2;
      wing(c, { chord: ch, t: 0.17, le, noAilerons: true });
      [0.62, -0.62].forEach(x => {
        c.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.09, 40, 1, true), M.feat, [x, 0.012, zc]));
        c.add(mesh(new THREE.CircleGeometry(0.168, 40), M.motor, [x, 0.058, zc], [-Math.PI / 2, 0, 0]));
        const r = rotor(0.32, { spin: HOVER, feature: true, blades: 5 }); r.position.set(x, 0.02, zc); c.add(r); ctx.rotors.push(r);
      });
      const tf = rotor(0.16, { spin: HOVER, feature: true, blades: 4 }); tf.position.set(0, G.h_y + 0.01, G.tail_x + 0.2); c.add(tf); ctx.rotors.push(tf);
      c.add(mesh(new THREE.BoxGeometry(0.2, 0.01, 0.2), M.body, [0, G.h_y, G.tail_x + 0.2]));
    },
    c3(c, ctx) {
      base(c, ctx, { noWing: true, noQuad: true, noPusher: true });
      wing(c, { chord: 0.34, t: 0.12, le: 0.04, noAilerons: true });
      [1, -1].forEach(s => {
        const len = HALF - 0.12, drum = new THREE.Group(); drum.position.set(s * (0.08 + len / 2), 0.06, 0.0); c.add(drum);
        drum.add(tube(0.012, len, "x", M.motor));
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          drum.add(mesh(new THREE.BoxGeometry(len, 0.003, 0.03), M.feat, [0, Math.sin(a) * 0.05, Math.cos(a) * 0.05], [a, 0, 0]));
        }
        ctx.drums.push(drum);
      });
    },
  };

  // ---------------------------------------------------------------- scene state
  let current = null, ctx = null, t = 0, playing = false, dir = 1;
  const root = new THREE.Group(); scene.add(root);
  const batt = mesh(new THREE.BoxGeometry(G.batt[2], G.batt[1], G.batt[0]), M.batt, [0, G.batt_y, G.batt_x]);
  const spanEnv = (() => {
    const w = G.span_max / 2, pts = [[-w, 0.95], [-w, -1.4], [w, -1.4], [w, 0.95]];
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p[0], GROUND + 0.002, p[1]))), M.env);
    l.computeLineDistances(); return l;
  })();
  scene.add(spanEnv);

  function select(id) {
    if (!BUILD[id]) id = DATA.concepts[0].id;
    current = id;
    root.clear(); root.position.set(0, 0, 0);
    ctx = { rotors: [], tilts: [], drums: [], lift: null };
    BUILD[id](root, ctx);
    if (id === "b4") { batt.position.set(0, 0, 0.12); ctx.tilts[0].obj.add(batt); }
    else if (id === "b2") { batt.position.set(0, 0, 0.0); root.add(batt); }
    else { batt.position.set(0, G.batt_y, G.batt_x); root.add(batt); }
    if (ctx.lift) {   // rest the tail-sitting attitude on the ground plane
      const keep = t; t = 0; apply(); root.updateMatrixWorld(true);
      ctx.lift.hover = GROUND - new THREE.Box3().setFromObject(root).min.y; t = keep;
    }
    apply(); stats();
    document.querySelectorAll("[data-concept]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.concept === id)));
    const info = DATA.concepts.find(c => c.id === id);
    document.getElementById("m-name").textContent = info.code + "  " + info.name;
    document.getElementById("m-what").textContent = info.what;
    document.getElementById("m-note").textContent = info.note;
    document.getElementById("m-claim").textContent = info.claim;
    const src = document.getElementById("m-src");
    src.textContent = info.source[0]; src.href = info.source[1].startsWith("http") ? info.source[1] : "#";
    try { history.replaceState(null, "", "#" + id); } catch (e) { /* the hash is only a convenience */ }
  }

  function apply() {
    ctx.tilts.forEach(k => { k.obj.rotation.x = k.from + (k.to - k.from) * t; });
    if (ctx.lift) ctx.lift.obj.position.y = ctx.lift.hover * (1 - t);
    const show = document.getElementById("t-batt").checked;
    batt.visible = show;
    M.pod.transparent = show; M.pod.opacity = show ? 0.45 : 1; M.pod.depthWrite = !show; M.pod.needsUpdate = true;
    spanEnv.visible = document.getElementById("t-env").checked;
    document.getElementById("mode-val").textContent = t < 0.02 ? "Hover" : t > 0.98 ? "Cruise" : "Transition " + Math.round(t * 100) + " %";
    document.getElementById("mode").value = Math.round(t * 100);
  }

  function stats() {
    root.updateMatrixWorld(true);
    const size = new THREE.Vector3(); new THREE.Box3().setFromObject(root).getSize(size);
    const info = DATA.concepts.find(c => c.id === current);
    const set = (k, v) => { document.getElementById(k).textContent = v; };
    set("s-span", (2 * HALF).toFixed(2) + " m");
    set("s-width", size.x.toFixed(2) + " m");
    set("s-len", size.z.toFixed(2) + " m");
    set("s-motors", String(ctx.rotors.length + ctx.drums.length));
    set("s-tilt", String(ctx.tilts.filter(k => !ctx.lift || k.obj !== ctx.lift.obj).length));
    set("s-part", info.largest_part);
    const ok = size.x <= G.span_max + 0.005, chip = document.getElementById("c-width");
    chip.className = "chip " + (ok ? "chip-met" : "chip-risk");
    chip.textContent = ok ? "Overall width within " + G.span_max.toFixed(1) + " m" : "Overall width over " + G.span_max.toFixed(1) + " m";
  }

  function frame() {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root), c = new THREE.Vector3(), s = new THREE.Vector3();
    box.getCenter(c); box.getSize(s);
    controls.target.copy(c);
    const d = (Math.max(s.x, s.z, s.y) * 1.05 + 0.45) * Math.max(1, 1.15 / camera.aspect);   // back off on tall, narrow stages
    camera.position.set(c.x + d * 0.62, c.y + d * 0.5, c.z + d * 0.72);
  }

  // ---------------------------------------------------------------- UI
  document.querySelectorAll("[data-concept]").forEach(b => b.addEventListener("click", () => { select(b.dataset.concept); frame(); }));
  const slider = document.getElementById("mode"), playBtn = document.getElementById("play");
  function setPlay() { playBtn.textContent = playing ? "Pause" : "Play transition"; playBtn.setAttribute("aria-pressed", String(playing)); }
  slider.addEventListener("input", () => { playing = false; setPlay(); t = slider.value / 100; apply(); });
  document.getElementById("hover").addEventListener("click", () => { playing = false; setPlay(); t = 0; apply(); });
  document.getElementById("cruise").addEventListener("click", () => { playing = false; setPlay(); t = 1; apply(); });
  playBtn.addEventListener("click", () => { playing = !playing; if (playing && t >= 1) dir = -1; if (playing && t <= 0) dir = 1; setPlay(); });
  ["t-batt", "t-env"].forEach(id => document.getElementById(id).addEventListener("change", apply));
  document.getElementById("reset").addEventListener("click", frame);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (playing) {
      t += dir * dt / 3.5;
      if (t >= 1) { t = 1; dir = -1; playing = false; setPlay(); }
      if (t <= 0) { t = 0; dir = 1; playing = false; setPlay(); }
      apply();
    }
    ctx.rotors.forEach(r => {
      const u = r.userData.rotor, sp = u.spin(t);
      if (sp > 0.02 && !reduce) { u.angle += sp * dt * 38; u.blades.rotation.y = u.angle; }
      else if (sp <= 0.02) {   // settle to the nearest parked position (two-blade props repeat every 180°)
        const target = u.park + Math.round((u.blades.rotation.y - u.park) / Math.PI) * Math.PI;
        u.blades.rotation.y += (target - u.blades.rotation.y) * Math.min(1, dt * 6); u.angle = u.blades.rotation.y;
      }
      u.disk.visible = sp > 0.15;
    });
    if (!reduce) ctx.drums.forEach(d => { d.rotation.x -= dt * 14; });
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  resize();
  const start = (location.hash || "").replace("#", "");
  select(BUILD[start] ? start : "a0");
  frame();
  const qt = parseFloat(new URLSearchParams(location.search).get("t"));   // ?t=1 opens in cruise (local checks)
  if (qt >= 0 && qt <= 1) { t = qt; apply(); }
  requestAnimationFrame(loop);
})();
