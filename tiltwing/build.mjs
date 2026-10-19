// Builds tiltwing/dashboard.html from src/ + model.js + data/. Run: node tiltwing/build.mjs
import { readFileSync, writeFileSync, existsSync } from 'fs';
const here = p => new URL(p, import.meta.url);
const rd = p => readFileSync(here(p), 'utf8');
const STEPS = [
  { n: '1', title: 'Parametric sizing model and dashboard', text: 'Paper method as formulas G1–P7, sliders for every basic input, plan-view drawing, mass, propulsion, energy, paper comparison.', done: true },
  { n: '2', title: 'Parametric 3D CAD', text: 'Tilting wing and tail with S1223 / NACA 0009 sections, rotors and fuselage, rebuilt from the sliders; STL export.', done: false, tab: { id: 'cad', n: '03', name: '3D CAD' } },
  { n: '3', title: 'Aerodynamic analysis', text: 'C_L, C_D and C_m against angle of attack and tilt angle with propeller slipstream (paper Eq. 11), elevator effect, static margin.', done: false, tab: { id: 'aero', n: '04', name: 'Aero' } },
  { n: '4', title: 'Transition and mission simulation', text: 'Time simulation from hover through transition to cruise with a tilt schedule; power, battery and the transition corridor.', done: false, tab: { id: 'sim', n: '05', name: 'Transition' } },
  { n: '5', title: 'Structural FEA', text: 'Beam finite elements for the wing spar, tilt shaft, tail spar and fuselage shell under hover, gust and landing loads; margins of safety, deflection, tilt-servo torque, natural frequencies against rotor excitation.', done: false, tab: { id: 'fea', n: '06', name: 'Structures' } },
  { n: '6', title: 'CFD in a simulation environment', text: 'Environment sliders (altitude, temperature, wind, gusts) shared by every tab; live 2-D lattice-Boltzmann flow around the tilting wing section; 3-D vortex-lattice pressure on the whole aircraft.', done: false, tab: { id: 'cfd', n: '07', name: 'CFD' } },
  { n: '7', title: 'Verification', text: 'Formulas re-run by an independent script, FE checked against closed-form beam solutions, results compared with the paper.', done: false },
];
const stepFiles = ['src/step2-cad.js', 'src/step3-aero.js', 'src/step4-sim.js', 'src/step5-fea.js', 'src/step6-cfd.js'].filter(f => existsSync(here(f)));
const done = new Set(stepFiles.map(f => f.match(/step(\d)/)[1]));
if (existsSync(here('data/verify.json'))) done.add('7');
STEPS.forEach(s => { if (done.has(s.n)) s.done = true; });
const locked = STEPS.filter(s => s.tab && !s.done).map(s => Object.assign({}, s.tab, { locked: 'step ' + s.n }));
const data = { airfoils: JSON.parse(rd('data/airfoils.json')) };
for (const extra of ['data/aero.json', 'data/vlm.json', 'data/verify.json']) if (existsSync(here(extra))) data[extra.slice(5, -5)] = JSON.parse(rd(extra));
if (existsSync(here('cad/manifest.json'))) {
  const man = JSON.parse(rd('cad/manifest.json'));
  data.cadFiles = Object.entries(man.configs).flatMap(([k, c]) => [[`cad/${k}/${c.step}`, `STEP assembly, ${c.stl.length} parts, wing and tail at ${c.tilt_deg}°`], [`cad/${k}/*.stl`, `one STL per part at ${c.tilt_deg}° (${c.stl.slice(0, 3).join(', ')} …)`]]);
  data.cadFiles.push(['cad/manifest.json', `slider values and derived geometry the files were built from (MTOW ${man.derived.m.toFixed(2)} kg)`]);
}
const libs = stepFiles.includes('src/step2-cad.js') ? '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n' : '';
const html = `<title>Tilt-Wing Designer</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700&family=Red+Hat+Mono:wght@400;500&family=Source+Sans+3:wght@400;600&display=swap">
<style>${rd('src/style.css')}</style>
${rd('src/body.html')}
${libs}<script>window.DATA=${JSON.stringify(data)};window.STEPS=${JSON.stringify(STEPS)};window.LOCKED=${JSON.stringify(locked)};window.STEP_PANES=[];</script>
<script>${rd('model.js')}</script>
${stepFiles.map(f => `<script>${rd(f)}</script>`).join('\n')}
<script>${rd('src/app.js')}</script>
`;
writeFileSync(here('dashboard.html'), html);
console.log('dashboard.html', (html.length / 1024).toFixed(0), 'KB; steps', [...done].join(',') || 'none');
