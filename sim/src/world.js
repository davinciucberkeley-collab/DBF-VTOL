/* Renderer, scene, sky, ground, city, windsock, lighting, time of day, flight-path trail,
   downwash dust, pad/runway lights, render-quality governor and WebGL context-loss handling.
   Owned by the visuals engineer. Reads S; never writes it. Additive changes only to the API.

   Colour pipeline (three r128 has no colour management):
   - renderer: ACES Filmic tone mapping + sRGB output; exposure per time of day.
   - Lit material / light colours are authored as sRGB hex and converted to linear with lin().
   - Fog is applied AFTER tone mapping/encoding in r128 shaders, so the fog colour is effectively an
     output-space (sRGB) colour. The sky shader therefore writes raw sRGB too, and the fog colour is
     set to exactly the sky horizon colour: fogged terrain melts into the sky with no seam.

   Performance: update() allocates nothing (scratch vectors are module-level). */
import { TOD, WIND_DIR } from './config.js';
import { clamp, makeRng, canvasTex, on, emit } from './util.js';

const V3 = THREE.Vector3;
export const TRAIL_N = 900;

/** sRGB hex -> linear THREE.Color. */
const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

/* ------------------------------------------------------------------------------------------
   Reduced-motion preference (shared with aircraft.js). Live: follows OS setting changes.
   ------------------------------------------------------------------------------------------ */
export const motionPrefs = { reduced: false };
{
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  if (mq) {
    motionPrefs.reduced = mq.matches;
    const fn = e => { motionPrefs.reduced = e.matches; };
    if (mq.addEventListener) mq.addEventListener('change', fn); else if (mq.addListener) mq.addListener(fn);
  }
}

/* Per-time-of-day render tuning layered on top of config TOD presets (which the flight track owns).
   sunK/hemiK rescale TOD intensities for ACES; exp multiplies TOD.exp. Sky fx: sun/moon disc + glow + stars. */
const LOOK = {
  day:   { exp: 1.0,  sunK: 1.65, hemiK: .55, env: 1.0, disc: 1.6, glow: .30, size: 1.3, stars: 0, sunCol: 0xfff3dc, padLights: .3, glows: false, shadows: true },
  dusk:  { exp: .95,  sunK: 1.9,  hemiK: .7,  env: .8,  disc: 1.4, glow: .85, size: 2.0, stars: .25, sunCol: 0xffb36b, padLights: 1.2, glows: true, shadows: true },
  night: { exp: .85,  sunK: 1.6,  hemiK: 1.0, env: .5,  disc: .9,  glow: .10, size: 1.1, stars: 1, sunCol: 0xd6e0ff, padLights: 2.6, glows: true, shadows: false },
};

/* ------------------------------------------------------------------------------------------
   Shaders
   ------------------------------------------------------------------------------------------ */
const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    #ifdef FOLLOW_CAMERA
      // Dome is always centred on the camera, so the sky can never be flown out of.
      gl_Position = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
    #else
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #endif
  }`;
const SKY_FRAG = /* glsl */`
  uniform vec3 uTop, uHor, uGround, uSunDir, uSunCol;
  uniform float uDisc, uGlow, uSize, uStars, uGroundMix;
  varying vec3 vDir;
  float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float hash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    // 3-stop gradient: horizon -> mid (blend) -> zenith; below the horizon fade to uGround (env map only).
    vec3 col = mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.45));
    col = mix(col, mix(uHor, uGround, uGroundMix), smoothstep(0.0, -0.08, h));
    // Sun/moon: broad Mie-ish glow + tight halo + disc
    float sd = max(dot(d, uSunDir), 0.0);
    col += uSunCol * uGlow * (0.35 * pow(sd, 6.0) + 0.6 * pow(sd, 90.0));
    col += uSunCol * uDisc * smoothstep(1.0 - uSize, 1.0 - uSize * 0.55, sd) * step(-0.02, h);
    // Stars: one candidate per angular cell, round, twinkle-free (no motion), faded at the horizon
    if (uStars > 0.0 && h > 0.0) {
      vec3 g = d * 220.0, cell = floor(g);
      float s = hash13(cell);
      float r = length(fract(g) - 0.5);
      col += vec3(step(0.996, s) * smoothstep(0.32, 0.0, r) * uStars * smoothstep(0.0, 0.25, h) * (0.5 + 0.5 * fract(s * 97.0)));
    }
    // Dither to kill gradient banding
    col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(col, 1.0);
    #ifndef FOLLOW_CAMERA
      // Env-map pass: PMREM targets in r128 are RGBE-encoded, so encode to the target's format.
      #include <encodings_fragment>
    #endif
  }`;

/* Shared GLSL value noise, used by the ground shader. */
const NOISE_GLSL = /* glsl */`
  float gHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float gNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y);
  }`;

const DUST_VERT = /* glsl */`
  attribute float aLife;   // 0..1 normalised age; >= 1 means dead
  attribute float aSeed;
  uniform float uScale, uSize;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float alive = step(aLife, 0.999);
    vAlpha = alive * (1.0 - aLife) * smoothstep(0.0, 0.08, aLife);
    gl_PointSize = alive * uSize * (0.5 + 1.8 * aLife) * (0.7 + 0.6 * aSeed) * uScale / max(-mv.z, 0.1);
  }`;
const DUST_FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uOpacity;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, r); a *= a * (0.6 + 0.4 * a);   // soft puff, no hard rim
    gl_FragColor = vec4(uColor, a * vAlpha * uOpacity);
  }`;

/* ------------------------------------------------------------------------------------------
   Module-level scratch objects (no per-frame allocation)
   ------------------------------------------------------------------------------------------ */
const _p = new V3(), _lx = new V3(), _ly = new V3(), _up = new V3(0, 1, 0), _v2 = new THREE.Vector2();

/**
 * Create renderer + scene and append the canvas to `stage`.
 * @returns {{renderer, scene, hemi, sun, sky, cityMaterial, trail, setTod(k:string), update(dt:number, S:object),
 *            clearTrail(), quality:{pixelRatio:number, maxPixelRatio:number, shadowSize:number, auto:boolean},
 *            isContextLost():boolean, dust:THREE.Points}}
 */
export function createWorld(stage) {
  const rnd = makeRng(7); // seeded: city layout and textures are identical every load

  /* ---------- Renderer / quality ---------- */
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const quality = { pixelRatio: 1, maxPixelRatio: 1, shadowSize: 2048, baseShadowSize: 2048, auto: true };
  function readDpr() {
    const dpr = window.devicePixelRatio || 1;
    quality.maxPixelRatio = Math.min(dpr, coarse ? 1.5 : 2);
    quality.baseShadowSize = (coarse || dpr > 1.5) ? 1024 : 2048;
    return dpr;
  }
  readDpr();
  quality.pixelRatio = quality.maxPixelRatio; quality.shadowSize = quality.baseShadowSize;
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  stage.appendChild(renderer.domElement);

  // Re-read devicePixelRatio when the page moves to another monitor or the user zooms.
  (function watchDpr() {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    const fn = () => {
      if (mq.removeEventListener) mq.removeEventListener('change', fn); else if (mq.removeListener) mq.removeListener(fn);
      readDpr(); quality.pixelRatio = quality.maxPixelRatio; renderer.setPixelRatio(quality.pixelRatio); watchDpr();
    };
    if (mq.addEventListener) mq.addEventListener('change', fn); else if (mq.addListener) mq.addListener(fn);
  })();

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe3f2, 400, 3800);

  /* ---------- Lights ---------- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.8);
  sun.castShadow = true; sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
  const SHADOW_HALF = 22;
  Object.assign(sun.shadow.camera, { left: -SHADOW_HALF, right: SHADOW_HALF, top: SHADOW_HALF, bottom: -SHADOW_HALF, near: 1, far: 200 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const sunDir = new V3(0.5, 1, 0.35).normalize();

  function setShadowSize(n) {
    if (sun.shadow.mapSize.x === n) return;
    sun.shadow.mapSize.set(n, n);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }  // re-created at the new size next render
  }

  /* ---------- Sky: camera-following shader dome ---------- */
  const skyUniforms = {
    uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
    uSunDir: { value: sunDir }, uSunCol: { value: new THREE.Color() },
    uDisc: { value: 1 }, uGlow: { value: .3 }, uSize: { value: 2e-4 }, uStars: { value: 0 }, uGroundMix: { value: 0 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), new THREE.ShaderMaterial({
    uniforms: skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, defines: { FOLLOW_CAMERA: '' },
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
  }));
  sky.frustumCulled = false; sky.renderOrder = -1000; scene.add(sky);

  /* ---------- Environment map (PMREM of a gradient sky + sun blob) for reflections ---------- */
  const envUniforms = {
    uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
    uSunDir: { value: sunDir }, uSunCol: { value: new THREE.Color() },
    uDisc: { value: 0 }, uGlow: { value: 1 }, uSize: { value: 0 }, uStars: { value: 0 }, uGroundMix: { value: 1 },
  };
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    uniforms: envUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
  })));
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  function buildEnv() {
    try {
      const rt = pmrem.fromScene(envScene, 0.04);
      if (envRT) envRT.dispose();
      envRT = rt; scene.environment = rt.texture;
    } catch (e) { console.warn('Environment map unavailable:', e); scene.environment = null; }
  }

  /* ---------- Ground: camera-following plane, world-space UVs, two-scale grass + macro variation ---------- */
  function noise(g, w, h, base, amp, n) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) { const v = (rnd() - .5) * amp; g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
  }
  const grassTex = canvasTex(256, 256, (g, w, h) => {
    noise(g, w, h, '#5f7c40', .16, 9000);
    // soft clumps (no hard grid lines: they read as tiling from altitude)
    for (let i = 0; i < 70; i++) {
      const x = rnd() * w, y = rnd() * h, r = 6 + rnd() * 18, dark = rnd() < .5;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, dark ? 'rgba(30,50,15,.18)' : 'rgba(150,160,80,.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.save(); g.translate(ox, oy); g.fillRect(x - r, y - r, 2 * r, 2 * r); g.restore(); } // wraps seamlessly
    }
  }, [1, 1]);
  const groundMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1, envMapIntensity: .6 });
  groundMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;\n' + NOISE_GLSL)
      .replace('#include <map_fragment>', /* glsl */`
        vec2 wp = vGW.xz;
        vec4 tA = texture2D(map, wp / 23.0);
        vec4 tB = texture2D(map, (mat2(0.8, 0.6, -0.6, 0.8) * wp) / 97.0);
        vec4 texelColor = mapTexelToLinear(mix(tA, tB, 0.45));
        float n = gNoise(wp / 310.0) * 0.6 + gNoise(wp / 75.0) * 0.3 + gNoise(wp / 19.0) * 0.1;
        texelColor.rgb *= mix(vec3(0.78, 0.88, 0.66), vec3(1.15, 1.07, 0.82), n);   // green vs dry patches
        diffuseColor *= texelColor;`);
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000).rotateX(-Math.PI / 2), groundMat);
  ground.receiveShadow = true; scene.add(ground);

  /* ---------- Apron, pad, runway (static overlays, polygon offset + small height) ---------- */
  const concreteTex = canvasTex(256, 256, (g, w, h) => { noise(g, w, h, '#7d8286', .12, 7000); g.fillStyle = 'rgba(40,40,40,.35)'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h); }, [14, 14]);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(140, 140).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: concreteTex, roughness: .95, envMapIntensity: .5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  apron.position.y = 0.02; apron.receiveShadow = true; scene.add(apron);

  const padTex = canvasTex(1024, 1024, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#3a3f45'; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 22; g.beginPath(); g.arc(c, c, c - 30, 0, 7); g.stroke();
    g.strokeStyle = '#ffcc33'; g.lineWidth = 16; g.setLineDash([60, 40]); g.beginPath(); g.arc(c, c, c - 90, 0, 7); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#f2f2f2'; g.fillRect(c - 180, c - 230, 70, 460); g.fillRect(c + 110, c - 230, 70, 460); g.fillRect(c - 110, c - 35, 220, 70);
    g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.fillText('VTOL 1', c, c + 330); g.fillText('8.5 T', c, c - 290);
  });
  const pad = new THREE.Mesh(new THREE.CircleGeometry(12, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: padTex, roughness: .9, envMapIntensity: .5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  pad.position.y = 0.035; pad.receiveShadow = true; scene.add(pad);

  const rwyTex = canvasTex(128, 512, (g, w, h) => { noise(g, w, h, '#34373b', .10, 4000); g.fillStyle = '#e9e9e9'; g.fillRect(5, 0, 3, h); g.fillRect(w - 8, 0, 3, h); g.fillRect(62, 0, 4, h / 2); }, [1, 1400 / 60]);
  const runway = new THREE.Mesh(new THREE.PlaneGeometry(30, 1400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: rwyTex, roughness: .9, envMapIntensity: .5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  runway.position.set(0, 0.025, -770); runway.receiveShadow = true; scene.add(runway);

  /* ---------- Pad perimeter + runway edge lights (emissive pucks; additive glow points at dusk/night) ---------- */
  const lightSpots = [];   // [x, z, r, g, b] (sRGB 0..1)
  for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; lightSpots.push([Math.cos(a) * 12.4, Math.sin(a) * 12.4, .55, 1, .45]); }
  for (let z = -70; z >= -1470; z -= 50) for (const x of [-15.6, 15.6]) lightSpots.push([x, z, 1, .93, .75]);
  const padLightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: .3, roughness: .4 });
  const pucks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.13, .15, .1, 10).translate(0, .05, 0), padLightMat, lightSpots.length);
  const glowPos = new Float32Array(lightSpots.length * 3), glowCol = new Float32Array(lightSpots.length * 3);
  {
    const m = new THREE.Matrix4(), c = new THREE.Color();
    lightSpots.forEach(([x, z, r, g, b], i) => {
      m.makeTranslation(x, 0, z); pucks.setMatrixAt(i, m);
      c.setRGB(r, g, b).convertSRGBToLinear(); pucks.setColorAt(i, c);
      glowPos.set([x, .25, z], i * 3); glowCol.set([c.r, c.g, c.b], i * 3);
    });
  }
  scene.add(pucks);
  const glowSprite = canvasTex(64, 64, g => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3)); glowGeo.setAttribute('color', new THREE.BufferAttribute(glowCol, 3));
  const lightGlows = new THREE.Points(glowGeo, new THREE.PointsMaterial({ map: glowSprite, size: 2.2, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  lightGlows.visible = false; scene.add(lightGlows);

  /* ---------- City: instanced buildings; facade UVs scaled by each instance's real size; plain roofs ---------- */
  const facade = canvasTex(128, 256, (g, w, h) => { g.fillStyle = '#8d959f'; g.fillRect(0, 0, w, h); g.fillStyle = '#4b5560'; for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) g.fillRect(x, y, 9, 9); }, [1, 1]);
  const windowsLit = canvasTex(128, 256, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) if (rnd() < .45) { g.fillStyle = rnd() < .7 ? '#ffd58a' : '#cfe6ff'; g.fillRect(x, y, 9, 9); } }, [1, 1]);
  const cityMaterial = new THREE.MeshStandardMaterial({ map: facade, emissiveMap: windowsLit, emissive: 0xffffff, emissiveIntensity: 0, roughness: .8, envMapIntensity: .6 });
  // One texture tile = 8 x 16 window cells; aim for ~3.5 m per cell regardless of building size.
  cityMaterial.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vRoof;')
      .replace('#include <uv_vertex>', /* glsl */`#include <uv_vertex>
        #ifdef USE_INSTANCING
          float sxW = length(instanceMatrix[0].xyz), syH = length(instanceMatrix[1].xyz), szD = length(instanceMatrix[2].xyz);
          float faceW = abs(normal.x) > 0.5 ? szD : sxW;
          vUv = uv * vec2(faceW / 28.0, syH / 56.0);
        #endif
        vRoof = step(0.5, abs(normal.y));`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRoof;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, diffuse * 0.35, vRoof);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1.0 - vRoof;');
  };
  const bGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0);
  const city = new THREE.InstancedMesh(bGeo, cityMaterial, 320); city.castShadow = false; city.receiveShadow = true;
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), p = new V3(), s = new V3();
    let n = 0, tries = 0;
    while (n < 320 && tries < 5000) {
      tries++; const r = 260 + Math.pow(rnd(), .8) * 1500, a = rnd() * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 70 && z < 120 && z > -1600) continue; // keep the pad and runway corridor clear
      const w = 14 + rnd() * 26, d = 14 + rnd() * 26, h = 10 + Math.pow(rnd(), 2) * 110;
      q.setFromAxisAngle(_up, rnd() * Math.PI); m.compose(p.set(x, 0, z), q, s.set(w, h, d)); city.setMatrixAt(n, m);
      col.setHSL(.58 + rnd() * .08, .08 + rnd() * .1, .55 + rnd() * .3).convertSRGBToLinear(); city.setColorAt(n, col); n++;
    }
    city.count = n;
  }
  scene.add(city);

  /* ---------- Distant hills ---------- */
  const hills = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7).translate(0, .5, 0), new THREE.MeshStandardMaterial({ color: lin(0x6d7f5a), flatShading: true, roughness: 1, envMapIntensity: .4 }), 46);
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new V3(), s = new V3();
    for (let i = 0; i < 46; i++) {
      const a = i / 46 * Math.PI * 2 + rnd() * .1, r = 2700 + rnd() * 700; const sc = 300 + rnd() * 500;
      m.compose(p.set(Math.cos(a) * r, 0, Math.sin(a) * r), q, s.set(sc * 1.6, 120 + rnd() * 380, sc * 1.6)); hills.setMatrixAt(i, m);
    }
  }
  scene.add(hills);

  /* ---------- Windsock ---------- */
  const sockPivot = new THREE.Group(); sockPivot.rotation.order = 'YXZ';
  {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.06, .08, 6, 8).translate(0, 3, 0), new THREE.MeshStandardMaterial({ color: lin(0xdddddd) }));
    pole.position.set(22, 0, -20); pole.castShadow = true; scene.add(pole);
    sockPivot.position.set(22, 5.9, -20); scene.add(sockPivot);
    const stripes = canvasTex(64, 8, (g) => { for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#f4f4f4' : '#ff5a1f'; g.fillRect(i * 12.8, 0, 12.8, 8); } });
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(.18, .45, 2.6, 16, 1, true).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 0, 1.3), new THREE.MeshStandardMaterial({ map: stripes, side: THREE.DoubleSide }));
    sock.castShadow = true; sockPivot.add(sock);
  }

  /* ---------- Blob shadow (used when the sun casts no shadow, i.e. at night) ---------- */
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(13, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
    map: canvasTex(128, 128, g => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.5, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }),
    color: 0x000000, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  }));
  blob.position.y = .05; blob.visible = false; blob.renderOrder = 1; scene.add(blob);

  /* ---------- Downwash dust: pooled particles, one preallocated geometry, recycled by index ---------- */
  const DUST_N = 480, DUST_LIFE = 1.5;
  const dPos = new Float32Array(DUST_N * 3), dVel = new Float32Array(DUST_N * 3), dLife = new Float32Array(DUST_N).fill(1), dSeed = new Float32Array(DUST_N);
  for (let i = 0; i < DUST_N; i++) dSeed[i] = rnd();
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3).setUsage(THREE.DynamicDrawUsage));
  dustGeo.setAttribute('aLife', new THREE.BufferAttribute(dLife, 1).setUsage(THREE.DynamicDrawUsage));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dSeed, 1));
  const dustUniforms = { uScale: { value: 500 }, uSize: { value: 2.6 }, uColor: { value: new THREE.Color(0xc9b58c) }, uOpacity: { value: .4 } };
  const dust = new THREE.Points(dustGeo, new THREE.ShaderMaterial({
    uniforms: dustUniforms, vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, transparent: true, depthWrite: false,
  }));
  dust.frustumCulled = false; dust.renderOrder = 3; scene.add(dust);
  // Point size needs the camera's projection scale: set it just before drawing.
  dust.onBeforeRender = (r, s, cam) => {
    r.getDrawingBufferSize(_v2);
    dustUniforms.uScale.value = _v2.y / (2 * Math.tan((cam.fov || 60) * Math.PI / 360));
  };
  let dustNext = 0, dustAcc = 0, dustAlive = 0;

  function updateDust(dt, S) {
    // Emission strength: rotors loaded (rotorLift > 0.3 g) within 12 m of the ground.
    const alt = Math.max(0, Number.isFinite(S.agl) ? S.agl : S.pos.y);
    let k = alt < 12 && !S.stowed ? clamp((S.rotorLift - 0.3) / 0.7, 0, 1) * (1 - alt / 12) : 0;
    if (motionPrefs.reduced) k *= 0.3;
    dustAcc += k * 320 * dt;
    const wv = S.windVec, wd = Number.isFinite(S.windDir) ? S.windDir : WIND_DIR;
    const wx = wv ? wv.x : Math.sin(wd) * S.wind * 0.6, wz = wv ? wv.z : Math.cos(wd) * S.wind * 0.6;   // physics wind vector
    while (dustAcc >= 1) {
      dustAcc -= 1;
      const i = dustNext; dustNext = (dustNext + 1) % DUST_N;
      const a = rnd() * Math.PI * 2, r = 1.5 + rnd() * 5, ca = Math.cos(a), sa = Math.sin(a);
      dPos[i * 3] = S.pos.x + ca * r; dPos[i * 3 + 1] = .15 + rnd() * .3; dPos[i * 3 + 2] = S.pos.z + sa * r;
      const sp = (6 + rnd() * 7) * (0.5 + 0.5 * k);
      dVel[i * 3] = ca * sp; dVel[i * 3 + 1] = .4 + rnd() * 1.4; dVel[i * 3 + 2] = sa * sp;
      dLife[i] = 0;
    }
    if (dustAlive === 0 && k === 0) return;   // idle: nothing to simulate or upload
    const drag = Math.exp(-1.6 * dt); let alive = 0;
    for (let i = 0; i < DUST_N; i++) {
      if (dLife[i] >= 1) continue;
      dLife[i] = Math.min(1, dLife[i] + dt / (DUST_LIFE * (0.7 + 0.6 * dSeed[i])));
      const j = i * 3;
      dVel[j] = dVel[j] * drag + wx * (1 - drag); dVel[j + 2] = dVel[j + 2] * drag + wz * (1 - drag);
      dVel[j + 1] = dVel[j + 1] * drag - 0.25 * dt;
      dPos[j] += dVel[j] * dt; dPos[j + 1] = Math.max(.05, dPos[j + 1] + dVel[j + 1] * dt); dPos[j + 2] += dVel[j + 2] * dt;
      if (dLife[i] < 1) alive++;
    }
    dustAlive = alive;
    dustGeo.attributes.position.needsUpdate = true; dustGeo.attributes.aLife.needsUpdate = true;
  }
  function clearDust() { dLife.fill(1); dustAlive = 0; dustAcc = 0; dustGeo.attributes.aLife.needsUpdate = true; }

  /* ---------- Flight-path trail ---------- */
  const trailPos = new Float32Array(TRAIL_N * 3); let trailCount = 0, trailClock = 0;
  const trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3)); trailGeo.setDrawRange(0, 0);
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: lin(0xffb547), transparent: true, opacity: .85 }));
  trail.frustumCulled = false; scene.add(trail);   // culling disabled, so no bounding sphere upkeep is needed
  function clearTrail() { trailCount = 0; trailGeo.setDrawRange(0, 0); }
  on('reset', () => { clearTrail(); clearDust(); });

  /* ---------- Time of day ---------- */
  let currentTod = null;
  // Light-space basis for shadow texel snapping (depends on sun direction only).
  function updateLightBasis() { _lx.crossVectors(_up, sunDir).normalize(); _ly.crossVectors(sunDir, _lx).normalize(); }

  /** Apply a TOD preset immediately: sky, fog, lights, exposure, env map, city windows, shadows. */
  function setTod(k) {
    const t = TOD[k], L = LOOK[k] || LOOK.day; if (!t) return; currentTod = k;
    sunDir.set(t.dir[0], t.dir[1], t.dir[2]).normalize(); updateLightBasis();
    // Sky + fog in output (sRGB) space; fog == horizon so the seam disappears.
    skyUniforms.uTop.value.setHex(t.top); skyUniforms.uHor.value.setHex(t.hor);
    skyUniforms.uSunCol.value.setHex(L.sunCol); skyUniforms.uDisc.value = L.disc; skyUniforms.uGlow.value = L.glow;
    skyUniforms.uSize.value = 1 - Math.cos(L.size * Math.PI / 180); skyUniforms.uStars.value = L.stars;
    scene.fog.color.setHex(t.hor);
    renderer.setClearColor(scene.fog.color, 1);   // fallback if anything ever shows the clear colour
    // Lights in linear space, retuned for ACES
    hemi.color.setHex(t.hs).convertSRGBToLinear(); hemi.groundColor.setHex(t.hg).convertSRGBToLinear(); hemi.intensity = t.hi * L.hemiK;
    sun.color.setHex(t.sc).convertSRGBToLinear(); sun.intensity = t.si * L.sunK;
    renderer.toneMappingExposure = L.exp * (t.exp || 1);
    cityMaterial.emissiveIntensity = t.win;
    padLightMat.emissiveIntensity = L.padLights; lightGlows.visible = L.glows;
    // Shadows: off at night (barely visible, full cost); a blob shadow stands in.
    sun.castShadow = L.shadows;
    // Environment: linear colours, ground below the horizon, sun blob for highlights
    envUniforms.uTop.value.setHex(t.top).convertSRGBToLinear().multiplyScalar(L.env);
    envUniforms.uHor.value.setHex(t.hor).convertSRGBToLinear().multiplyScalar(L.env);
    envUniforms.uGround.value.setHex(t.hg).convertSRGBToLinear().multiplyScalar(L.env * .8);
    envUniforms.uSunCol.value.setHex(L.sunCol).convertSRGBToLinear().multiplyScalar(L.env * 1.5);
    buildEnv();
  }

  /* ---------- Render-quality governor: adapts pixel ratio, then shadow resolution, to frame time ---------- */
  let qT = 0, qN = 0, qFast = 0, lastNow = 0;
  function govern() {
    const now = performance.now(), ft = lastNow ? now - lastNow : 16; lastNow = now;
    if (!quality.auto || ft > 250) return;               // ignore hitches from tab switches etc.
    qT += ft; qN++;
    if (qT < 2000) return;
    const avg = qT / qN; qT = 0; qN = 0;
    if (avg > 22) {
      qFast = 0;
      if (quality.pixelRatio > 1) { quality.pixelRatio = Math.max(1, quality.pixelRatio - .25); renderer.setPixelRatio(quality.pixelRatio); }
      else if (quality.shadowSize > 1024) { quality.shadowSize = 1024; setShadowSize(1024); }
    } else if (avg < 12 && ++qFast >= 2) {           // two fast windows in a row before stepping back up
      qFast = 0;
      if (quality.shadowSize < quality.baseShadowSize) { quality.shadowSize = quality.baseShadowSize; setShadowSize(quality.shadowSize); }
      else if (quality.pixelRatio < quality.maxPixelRatio) { quality.pixelRatio = Math.min(quality.maxPixelRatio, quality.pixelRatio + .25); renderer.setPixelRatio(quality.pixelRatio); }
    } else if (avg >= 12) qFast = 0;
  }

  /* ---------- WebGL context loss ---------- */
  let contextLost = false;
  const canvas = renderer.domElement;
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault();   // required for the browser to attempt a restore (three also does this)
    contextLost = true; emit('toast', 'Graphics context lost — restoring…');
  }, false);
  canvas.addEventListener('webglcontextrestored', () => {
    // three re-initialises its GL state in its own listener (registered first); re-upload our content.
    contextLost = false;
    scene.traverse(o => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        for (const key of ['map', 'emissiveMap', 'roughnessMap', 'alphaMap']) if (m[key] && m[key].image) m[key].needsUpdate = true;
        m.needsUpdate = true;
      }
    });
    // Old GL objects died with the context: drop the env target without dispose() and rebuild it.
    envRT = null; buildEnv();
    emit('toast', 'Graphics restored');
  }, false);

  /** Per-frame: apply S.tod, ground follow, sun/shadow (texel-snapped), windsock, dust, blob shadow, trail, quality. */
  function update(dt, S) {
    if (S.tod !== currentTod && TOD[S.tod]) setTod(S.tod);
    govern();
    const tt = performance.now() / 1000;
    const p = S.pos;

    // Ground follows the aircraft (UVs are world-space, so the texture never swims)
    ground.position.set(Math.round(p.x), 0, Math.round(p.z));

    // Sun follows the aircraft; target snapped to whole shadow texels in light space to stop edge shimmer.
    if (sun.castShadow) {
      const texel = (2 * SHADOW_HALF) / sun.shadow.mapSize.x;
      const a = p.dot(_lx), b = p.dot(_ly);
      _p.copy(p).addScaledVector(_lx, Math.round(a / texel) * texel - a).addScaledVector(_ly, Math.round(b / texel) * texel - b);
    } else _p.copy(p);
    sun.target.position.copy(_p); sun.position.copy(_p).addScaledVector(sunDir, 80);

    // Blob shadow when the sun casts none
    blob.visible = !sun.castShadow && p.y < 60;
    if (blob.visible) {
      blob.position.set(p.x, .05, p.z); blob.rotation.y = S.psi;
      blob.material.opacity = .5 * (1 - p.y / 60); const s = 1 + p.y / 40; blob.scale.set(s, 1, s);
    }

    // Windsock
    const ws = clamp(S.wind / 8, 0, 1);
    sockPivot.rotation.y = (Number.isFinite(S.windDir) ? S.windDir : WIND_DIR) + Math.sin(tt * 1.7) * 0.08 * ws;
    sockPivot.rotation.x = (1 - ws) * 1.25 + Math.sin(tt * 3) * 0.04 * ws;

    // Downwash dust (dimmer at night: the shader is unlit)
    dustUniforms.uOpacity.value = currentTod === 'night' ? .2 : currentTod === 'dusk' ? .38 : .5;
    updateDust(Number.isFinite(S.frameSimDt) ? S.frameSimDt : dt, S);   // sim time: dust freezes while paused

    // Trail: sample every 0.1 s while airborne (written in place, no temporary arrays)
    trail.visible = S.trail;
    trailClock += Number.isFinite(S.frameSimDt) ? S.frameSimDt : dt;   // sim time: no samples while paused
    if (trailClock > 0.1 && !S.onGround && !S.paused) {
      trailClock = 0;
      let o;
      if (trailCount < TRAIL_N) { o = trailCount * 3; trailCount++; }
      else { trailPos.copyWithin(0, 3); o = (TRAIL_N - 1) * 3; }
      trailPos[o] = p.x; trailPos[o + 1] = p.y + 1.2; trailPos[o + 2] = p.z;
      trailGeo.attributes.position.needsUpdate = true; trailGeo.setDrawRange(0, trailCount);
    }
  }

  return {
    renderer, scene, hemi, sun, sky, cityMaterial, trail, setTod, update, clearTrail,
    quality, dust, isContextLost: () => contextLost,
    city, hills,   // collider sources (instance matrices are never moved after creation)
  };
}
