/* Camera modes (orbit / chase / cockpit / tower) + OrbitControls. Owned by the UI engineer.
   Writes S.cam and S.autoRot; reads S.pos, S.psi, S.pitch, S.roll. Additive changes only to the rig API.

   Reduced motion (rig.setReduceMotion(true), driven by ui.js from the OS setting / in-app switch):
   - orbit: no inertial damping, auto-rotate refused;
   - chase: much snappier follow (less swaying);
   - cockpit: the view uses the smooth flight attitude (S.pitch/S.roll/S.psi) instead of the aircraft
     group's quaternion, so the visual turbulence wobble added by aircraft.js never shakes the camera. */
import { COCKPIT_EYE } from './config.js';
import { clamp, fwdVec } from './util.js';

const V3 = THREE.Vector3;
export const CAM_MODES = ['orbit', 'chase', 'cockpit', 'tower'];
export const FOV_MIN = 25, FOV_MAX = 110, FOV_DEFAULT = 60;

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {object} S shared state
 * @returns {{camera, controls, setMode(m), setFov(f):number, setAutoRotate(on), placeOrbit(), resize(w,h),
 *            update(dt, S, aircraft:THREE.Object3D), onFovChange:null|((f:number)=>void),
 *            setReduceMotion(on), reduceMotion:boolean}}
 */
export function createCameraRig(renderer, S) {
  const camera = new THREE.PerspectiveCamera(FOV_DEFAULT, 1, 0.5, 7000);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .08; controls.minDistance = 5; controls.maxDistance = 600;
  controls.maxPolarAngle = Math.PI * 0.495; controls.autoRotateSpeed = 1.2;

  const lastPos = new V3(), chasePos = new V3(), delta = new V3(), want = new V3(), eye = new V3();
  const eyeLocal = new V3(...COCKPIT_EYE), euler = new THREE.Euler(0, 0, 0, 'YXZ'), quat = new THREE.Quaternion();
  let chaseInit = false;

  const rig = {
    camera, controls, onFovChange: null, reduceMotion: false,
    setMode, setFov, setAutoRotate, placeOrbit, resize, update, setReduceMotion, snap,
  };

  function placeOrbit() {
    const p = S.pos, f = fwdVec(S.psi);
    camera.position.set(p.x - f.x * 16 - 12 * Math.cos(S.psi), p.y + 7, p.z - f.z * 16 + 12 * Math.sin(S.psi));
    controls.target.set(p.x, p.y + 1.4, p.z); controls.update(); lastPos.copy(p);
  }
  /** Depth range per mode: a tight near plane only in the cockpit (better depth precision elsewhere). */
  function setClip(c) {
    const near = c === 'cockpit' ? 0.1 : 0.5;
    if (camera.near !== near || camera.far !== 7000) { camera.near = near; camera.far = 7000; camera.updateProjectionMatrix(); }
  }
  /** Snap the current view to the aircraft (after a reset / teleport): no long chase lerp, orbit re-placed. */
  function snap() {
    if (S.cam === 'orbit') placeOrbit();
    else if (S.cam === 'chase') chaseInit = true;
    lastPos.copy(S.pos);
  }
  function setMode(c) {
    if (!CAM_MODES.includes(c)) return;
    S.cam = c; controls.enabled = c === 'orbit'; setClip(c);
    if (c === 'orbit') placeOrbit();
    if (c === 'chase') chaseInit = true;
    if (c !== 'orbit') { S.autoRot = false; controls.autoRotate = false; }
  }
  /** Auto-rotate the orbit camera. Refused (stays off) while reduced motion is on. */
  function setAutoRotate(on) { on = !!on && !rig.reduceMotion; S.autoRot = on; controls.autoRotate = on; }
  function setFov(f) {
    f = clamp(Number.isFinite(f) ? f : FOV_DEFAULT, FOV_MIN, FOV_MAX); camera.fov = f; camera.updateProjectionMatrix();
    if (rig.onFovChange) rig.onFovChange(f);
    return f;
  }
  function resize(w, h) { if (w > 0 && h > 0) { camera.aspect = w / h; camera.updateProjectionMatrix(); } }
  function setReduceMotion(on) {
    rig.reduceMotion = !!on;
    controls.enableDamping = !on;
    controls.autoRotateSpeed = on ? 0.4 : 1.2;
    if (on) setAutoRotate(false);
  }

  // Scroll changes FOV in the non-orbit modes (orbit uses OrbitControls zoom)
  renderer.domElement.addEventListener('wheel', e => {
    if (S.cam !== 'orbit') { e.preventDefault(); setFov(camera.fov + e.deltaY * 0.04); }
  }, { passive: false });

  function update(dt, S, aircraft) {
    const p = S.pos;
    if (S.cam === 'orbit') {
      delta.subVectors(p, lastPos); camera.position.add(delta);
      controls.target.set(p.x, p.y + 1.4, p.z); controls.update();
    } else if (S.cam === 'chase') {
      const f = fwdVec(S.psi); want.set(p.x - f.x * 20, p.y + 6.5, p.z - f.z * 20);
      if (chaseInit) { chasePos.copy(want); chaseInit = false; }
      chasePos.lerp(want, 1 - Math.exp(-dt * (rig.reduceMotion ? 10 : 3)));
      camera.position.copy(chasePos); camera.position.y = Math.max(camera.position.y, .8);
      camera.lookAt(p.x + f.x * 6, p.y + 1.6, p.z + f.z * 6);
    } else if (S.cam === 'cockpit') {
      if (rig.reduceMotion || !aircraft) {
        euler.set(S.pitch || 0, S.psi || 0, S.roll || 0, 'YXZ'); quat.setFromEuler(euler);
        camera.position.copy(eye.copy(eyeLocal).applyQuaternion(quat).add(p));
        camera.quaternion.copy(quat);
      } else {
        aircraft.updateMatrixWorld();
        camera.position.copy(aircraft.localToWorld(eye.copy(eyeLocal)));
        camera.quaternion.copy(aircraft.quaternion);
      }
      camera.rotateX(-0.06);
    } else if (S.cam === 'tower') {
      camera.position.set(48, 16, 46); camera.lookAt(p.x, p.y + 1.4, p.z);
    }
    lastPos.copy(p);
  }

  return rig;
}
