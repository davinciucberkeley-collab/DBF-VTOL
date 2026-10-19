# Lift + Cruise VTOL Sim (browser flight game)

A three.js flight game of a lift + cruise eVTOL. Eight lift rotors carry it in hover; a pusher prop accelerates it until the wing takes the load, then the rotors stop and lock. Published version: https://claude.ai/artifact/221H8qjqH89NDempeZCqnT

> **Not an engineering tool.** The simulated aircraft is a notional full-scale eVTOL (`src/config.js`: 2,200 kg, 13 m span, 8 × 3.0 m rotors, 200 kWh pack). It is **not** the capstone's C0 aircraft (6.18 kg, 2.4 m, 4 lift rotors), and nothing in `analysis/`, `cad/` or the design review uses it. Per `CLAUDE.md`, engineering work ignores this folder.

## Run it

The page loads ES modules, so it needs a local web server (opening `index.html` from disk will not work):

```bash
cd sim
python -m http.server 8000      # then open http://localhost:8000
```

It needs an internet connection for three.js r128 (cdnjs / jsDelivr) and the web fonts, and a browser with WebGL.

## Controls

Power **P**, climb/descend **R/F**, forward/back **W/S**, yaw **A/D**, slide **Q/E**, cruise throttle **↑/↓**, camera **V**, gear **G**, lights **L**, fail a motor **X**, sim speed **T**, pause **Esc**, help **?**. Touch sticks appear on phones. The panel has auto takeoff, auto land, hover hold, wind, time of day and four camera modes; the quick-start guide walks through a first transition.

## Files

| File | Role |
|---|---|
| `index.html` | Page, HUD, panel, dialogs and the boot guard (loads three.js, checks WebGL, then `src/main.js`) |
| `src/main.js` | Bootstrap and the render loop |
| `src/state.js` | Shared simulation state and reset / restart-from-hover |
| `src/config.js` | Aircraft, rotor, prop, battery, speed-limit, crash and environment constants |
| `src/physics.js` | Fixed-step (120 Hz) flight model, flight control and autopilot, battery, warnings, collisions |
| `src/aircraft.js` | Aircraft 3D model and rotor/prop animation |
| `src/world.js` | Terrain, city, sky, lighting and the flight-path trail |
| `src/camera.js` | Orbit, chase, cockpit and tower cameras |
| `src/input.js` | Keyboard, touch buttons and virtual joysticks |
| `src/ui.js` | HUD and flight display, panel, guided flight, annunciators, sound |
| `src/util.js`, `src/styles.css` | Helpers, event bus and styles |

The source comments mention an `ARCHITECTURE.md`; it was not part of the published artifact and is not in this repo.
