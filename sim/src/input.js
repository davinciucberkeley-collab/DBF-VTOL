/* Keyboard, touch-pad and virtual-joystick input. Owned by the UI engineer. Additive changes only.

   Produces the `input` object physics.step() reads:
     input.keys  : Set<KeyboardEvent.code> of held keys (W/S A/D Q/E R/F, ArrowUp/Down, …)
     input.axes  : {fwd, yaw, strafe, climb} analog stick values in -1..1, physics sign convention
                   (fwd = W−S, yaw = A−D, strafe = E−Q, climb = R−F). 0 when no stick is held.
   and calls onPress(code) once per fresh key press / pad tap (never on auto-repeat).

   Analog sticks and a keys-only flight model: until physics reads input.axes itself, stick deflection is
   fed through input.keys.has() with a sigma-delta modulator — each call for a stick-driven code returns
   true on a fraction of calls equal to the deflection, so the 120 Hz fixed-step flight model sees a
   proportional average command (fine hover positioning). When physics reads input.axes directly it should
   set `input.analogConsumed = true`; has() then reports only real keys, so nothing is counted twice.

   Keyboard rules (accessibility):
   - Shortcuts never fire with Ctrl / Cmd / Alt held (browser shortcuts keep working).
   - Space / Enter on a focused control activate it natively; Space only reaches the sim (pause) when focus
     is on the page or the 3D canvas.
   - Arrow keys keep their native behaviour on range inputs / sliders, and on any control reached with the
     keyboard (Tab etc.); otherwise (page, canvas, mouse-clicked button) they drive the throttle.
   - While a modal dialog is open only Escape is passed on (to close it). */

const STICK_CODES = { fwd: ['KeyW', 'KeyS'], yaw: ['KeyA', 'KeyD'], strafe: ['KeyE', 'KeyQ'], climb: ['KeyR', 'KeyF'] };
const DEADZONE = 0.12;          // radial dead zone of the sticks (fraction of travel)
const EXPO = 1.35;              // response curve exponent (>1 = finer control near centre)
const AP_CANCEL_DEFLECTION = 0.4; // deliberate stick input that counts as a "press" (cancels the autopilot)

const TYPING_TYPES = /^(text|search|email|url|tel|password|number)$/;
const INTERACTIVE = 'button,a[href],input,select,textarea,summary,[role=switch],[role=slider],[role=button],[contenteditable=""],[contenteditable=true],[tabindex]:not([tabindex="-1"])';

const isTyping = t => !!t && (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' ||
  (t.tagName === 'INPUT' && TYPING_TYPES.test(t.type)));
const interactiveTarget = t => !!(t && t.closest && t !== document.body && t.closest(INTERACTIVE));
const isSlider = t => !!t && ((t.tagName === 'INPUT' && t.type === 'range') || (t.getAttribute && t.getAttribute('role') === 'slider'));
/* How did focus arrive? Chrome makes a mouse-focused control :focus-visible as soon as any key is pressed,
   so we record the modality at focus time instead: keyboard-focused controls keep their arrow keys. */
let lastWasKey = false, focusByKey = false;
addEventListener('keydown', () => { lastWasKey = true; }, true);
addEventListener('pointerdown', () => { lastWasKey = false; }, true);
addEventListener('focusin', () => { focusByKey = lastWasKey; }, true);
const focusedByKeyboard = () => focusByKey;
const modalOpen =() => !!document.querySelector('.modal[aria-modal="true"]:not([hidden])');

/**
 * @param {(code:string)=>void} onPress  one-shot handler (power, camera, gear, pause, …)
 * @returns {{keys:Set<string>, axes:{fwd:number,yaw:number,strafe:number,climb:number}, analogConsumed:boolean, release():void}}
 */
export function initInput(onPress) {
  /** Analog demand per key code (0..1) from the sticks, and the sigma-delta accumulators. */
  const demand = Object.create(null), acc = Object.create(null);

  const input = { keys: null, axes: { fwd: 0, yaw: 0, strafe: 0, climb: 0 }, analogConsumed: false, release };

  /** Set of held keys whose has() also reports modulated stick demand (see header). */
  class InputKeys extends Set {
    has(code) {
      if (super.has(code)) return true;
      const d = demand[code];
      if (!d || input.analogConsumed) return false;
      if (d >= 0.995) return true;
      acc[code] = (acc[code] || 0) + d;
      if (acc[code] >= 1) { acc[code] -= 1; return true; }
      return false;
    }
  }
  const keys = input.keys = new InputKeys();

  /* ---------------- Keyboard ---------------- */
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, code = e.code;
    if (code === 'Escape') { if (!e.repeat) onPress('Escape'); return; }
    if (modalOpen()) return;                       // dialogs own the keyboard (Tab, Enter, Space…)
    if (isTyping(t)) return;
    const inter = interactiveTarget(t);
    const arrow = code.startsWith('Arrow');
    // Arrows: sliders always keep them; other controls only when focused from the keyboard,
    // so clicking a panel button with the mouse doesn't steal the throttle keys.
    if (arrow && (isSlider(t) || (inter && focusedByKeyboard()))) return;
    if ((code === 'Space' || code === 'Enter' || code === 'NumpadEnter') && inter) return; // activate the control
    if (code === 'ArrowUp' || code === 'ArrowDown' || code === 'Space') e.preventDefault(); // no page scroll
    // '?' (Shift+Slash) opens help; report it as a pseudo-code so layouts without a Slash key still work
    const c = e.key === '?' ? 'Help' : code;
    keys.add(code);
    if (!e.repeat) onPress(c);
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });

  /* ---------------- On-screen buttons with a key code (data-k) ----------------
     Held while the pointer is down (pointer capture), one onPress per tap; keyboard activation
     (click with detail 0) also counts as a press. */
  document.querySelectorAll('#touch button[data-k]').forEach(b => {
    const k = b.dataset.k;
    let lastDown = -1e9;
    const down = e => {
      if (e.button > 0) return;
      e.preventDefault(); lastDown = performance.now();
      try { b.setPointerCapture(e.pointerId); } catch (_) { /* element may be detached */ }
      keys.add(k); b.classList.add('on'); onPress(k);
    };
    const up = () => { keys.delete(k); b.classList.remove('on'); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    // Keyboard activation (Enter/Space) arrives as a click with detail 0. Some touch stacks also report taps
    // with detail 0, so ignore any click that follows a pointerdown on this button (already pressed).
    b.addEventListener('click', e => { if (e.detail === 0 && performance.now() - lastDown > 1000) onPress(k); });
    b.addEventListener('contextmenu', e => e.preventDefault());
  });

  /* ---------------- Virtual joysticks (.stick[data-x][data-y]) ---------------- */
  const sticks = [];
  document.querySelectorAll('#touch .stick').forEach(el => sticks.push(bindStick(el)));

  function setAxis(name, v) {
    input.axes[name] = v;
    const [pos, neg] = STICK_CODES[name];
    const prev = Math.max(demand[pos] || 0, demand[neg] || 0);
    demand[pos] = v > 0 ? v : 0; demand[neg] = v < 0 ? -v : 0;
    if (!demand[pos]) acc[pos] = 0;
    if (!demand[neg]) acc[neg] = 0;
    // A deliberate deflection counts as one press of that direction's key (e.g. cancels the autopilot).
    if (Math.abs(v) >= AP_CANCEL_DEFLECTION && prev < AP_CANCEL_DEFLECTION) onPress(v > 0 ? pos : neg);
  }

  function bindStick(el) {
    const ax = el.dataset.x, ay = el.dataset.y, knob = el.querySelector('.knob');
    let id = null;
    function apply(nx, ny) {                       // nx, ny: -1..1, screen axes (y down)
      const r = Math.hypot(nx, ny);
      const k = r > 1 ? 1 / r : 1; nx *= k; ny *= k;
      const travel = el.clientWidth * 0.32;
      knob.style.setProperty('--kx', (nx * travel).toFixed(1) + 'px');
      knob.style.setProperty('--ky', (ny * travel).toFixed(1) + 'px');
      // radial dead zone, then expo curve per axis
      const rr = Math.min(1, r), scale = rr < DEADZONE ? 0 : (rr - DEADZONE) / (1 - DEADZONE) / (rr || 1);
      const curve = v => Math.sign(v) * Math.pow(Math.min(1, Math.abs(v)), EXPO);
      const x = curve(nx * scale), y = curve(-ny * scale);  // y up = positive
      // physics convention: yaw = A−D (left positive), strafe = E−Q (right positive), climb/fwd up positive
      if (ax) setAxis(ax, ax === 'yaw' ? -x : x);
      if (ay) setAxis(ay, y);
    }
    function move(e) {
      const rc = el.getBoundingClientRect(), half = rc.width / 2 * 0.8;
      apply((e.clientX - (rc.left + rc.width / 2)) / half, (e.clientY - (rc.top + rc.height / 2)) / half);
    }
    function end(e) {
      if (id === null || (e && e.pointerId !== undefined && e.pointerId !== id)) return;
      id = null; el.classList.remove('active'); apply(0, 0);
    }
    el.addEventListener('pointerdown', e => {
      if (id !== null || e.button > 0) return;
      id = e.pointerId; e.preventDefault();
      try { el.setPointerCapture(id); } catch (_) { /* ignore */ }
      el.classList.add('active'); move(e);
    });
    el.addEventListener('pointermove', e => { if (e.pointerId === id) move(e); });
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', e => e.preventDefault());
    return { reset: () => end() };
  }

  /** Drop every held key and centre the sticks (window blur, tab hidden, dialogs opening). */
  function release() {
    keys.clear();
    sticks.forEach(s => s.reset());
    document.querySelectorAll('#touch button.on').forEach(b => b.classList.remove('on'));
  }

  return input;
}
