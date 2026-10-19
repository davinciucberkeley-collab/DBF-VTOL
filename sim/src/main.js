/* Bootstrap + main loop. Owned by the integrator. THREE is a global from the UMD <script>.
   Per frame: physics.advance(real dt) runs fixed 120 Hz steps (scaled by S.timeScale, nothing while paused or
   crashed) and interpolates the render pose; visuals then animate with S.frameSimDt (sim seconds). */
import { S } from './state.js';
import { createWorld } from './world.js';
import { buildAircraft } from './aircraft.js';
import * as physics from './physics.js';
import { initInput } from './input.js';
import { createCameraRig } from './camera.js';
import { initUI } from './ui.js';
import { on } from './util.js';

const stage = document.getElementById('stage');
const world = createWorld(stage);
world.setTod(S.tod);

// Collision world: buildings (boxes) and hills (cones) from the instanced meshes. They are never moved.
if (world.city && world.hills) {
  physics.setColliders({
    boxes: physics.collidersFromInstances(world.city, 'box'),
    cones: physics.collidersFromInstances(world.hills, 'cone'),
  });
}

const craft = buildAircraft(world.scene);
const rig = createCameraRig(world.renderer, S);
const ui = initUI({ S, rig });
const input = initInput(code => ui.handleKey(code));

// After a reset / restart-from-hover the aircraft jumps: snap the camera instead of sweeping across the map.
on('reset', () => { if (rig.snap) rig.snap(); else if (S.cam === 'orbit') rig.placeOrbit(); });
// A crash freezes the sim: release held keys and centre the sticks so nothing carries into the restart.
on('crash', () => { if (input.release) input.release(); });

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  world.renderer.setSize(w, h, false); rig.resize(w, h);
}
new ResizeObserver(resize).observe(stage); resize();
rig.setFov(60); rig.setMode(S.cam); rig.placeOrbit();

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, Math.max(0, (now - last) / 1000)); last = now;
  if (world.isContextLost && world.isContextLost()) { ui.update(dt); return; }   // nothing can be drawn
  physics.advance(dt, S, input);
  craft.update(dt, S);
  world.update(dt, S);
  rig.update(dt, S, craft.aircraft);
  ui.update(dt);
  world.renderer.render(world.scene, rig.camera);
}
requestAnimationFrame(frame);

// Debug/QA handle only (no feature may depend on it).
window.__vtol = { S, world, craft, rig, ui, input, physics };
