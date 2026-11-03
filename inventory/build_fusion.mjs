// Packs the Autodesk Fusion export (inventory/fusion/manifest.json + stl/*.stl, written by fusion/export_stl_fusion.py)
// into a compact object for the inventory page's Fusion viewer, joined with the hardware schedule (inventory/hardware/hardware.json).
// STL frame (manifest axis_note): Fusion world cm, Z-up; model X fwd = Fusion +Y, model Y up = Fusion +Z, model Z right = Fusion +X.
// Output frame: the page's model frame, X forward, Y up, Z right, metres -> (x, y, z) = (Fy, Fz, Fx) / 100 (a cyclic swap, so winding is kept).
// Positions are quantised to Uint16 over the whole model's bounding box (about 37 µm on a 2.4 m span) and welded at that grid.
import { readFileSync, existsSync, readdirSync } from 'fs';
const url = p => new URL(p, import.meta.url);
const b64 = ta => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString('base64');

function readStl(buf){
  const n = buf.readUInt32LE(80), out = new Float32Array(n * 9);
  if (84 + n * 50 !== buf.length) throw new Error('bad binary STL size');
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++){
    const o = 84 + t * 50 + 12 + k * 12, X = buf.readFloatLE(o), Y = buf.readFloatLE(o + 4), Z = buf.readFloatLE(o + 8);
    out.set([Y / 100, Z / 100, X / 100], t * 9 + k * 3);
  }
  return out;
}

// Variant overlays: concepts/variants/<id>/fusion/variant_manifest.json + stl/*.stl (only the new or changed bodies, same frame as C0).
// VARIANTS_DIR overrides the folder (used by the headless tests). A variant with no manifest or no readable STL is "not built yet".
const VDIR = () => process.env.VARIANTS_DIR ? new URL('file://' + process.env.VARIANTS_DIR.replace(/\/?$/, '/')) : url('../concepts/variants/');
export function loadVariantMeshes(){
  const out = {}, root = VDIR();
  let ids = []; try { ids = readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort(); } catch (e) { return out; }
  for (const id of ids){
    const mp = new URL(id + '/fusion/variant_manifest.json', root); if (!existsSync(mp)) continue;
    let man; try { man = JSON.parse(readFileSync(mp, 'utf8')); } catch (e) { console.warn('variant ' + id + ': manifest unreadable (' + e.message + ')'); continue; }
    const raw = [];
    for (const e of man.entries || []){
      const fp = new URL(id + '/fusion/' + e.file, root);
      try { raw.push({ e, tri: readStl(readFileSync(fp)) }); } catch (err) { console.warn('variant ' + id + ': skipped ' + e.file + ' (' + err.message + ')'); }
    }
    if (raw.length) out[id] = { id, man, raw };
  }
  return out;
}
const quant = (tri, lo, sc) => {
  const map = new Map(), q = [], idx = new Array(tri.length / 3);
  for (let v = 0; v < tri.length / 3; v++){
    const k0 = Math.round((tri[3*v] - lo[0]) / sc[0]), k1 = Math.round((tri[3*v+1] - lo[1]) / sc[1]), k2 = Math.round((tri[3*v+2] - lo[2]) / sc[2]);
    const key = k0 * 4294967296 + k1 * 65536 + k2;   // < 2^48, exact in a double
    let i = map.get(key); if (i === undefined){ i = q.length / 3; map.set(key, i); q.push(k0, k1, k2); } idx[v] = i;
  }
  const big = q.length / 3 > 65535, v = new Uint16Array(q), ix = big ? new Uint32Array(idx) : new Uint16Array(idx);
  return { v: b64(v), i: b64(ix), w: big ? 4 : 2, bytes: v.byteLength + ix.byteLength };
};

export function packFusion(){ return packFusionAll().F; }
// packFusionAll(): { F: C0 pack (embedded as #fusionData), V: { id: variant pack } } on ONE quantisation grid (the bbox over C0 and every built variant)
export function packFusionAll(){
  const man = JSON.parse(readFileSync(url('./fusion/manifest.json'), 'utf8'));
  const hw = JSON.parse(readFileSync(url('./hardware/hardware.json'), 'utf8'));
  const raw = man.entries.map(e => ({ e, tri: readStl(readFileSync(url('./fusion/' + e.file))) }));
  const VM = loadVariantMeshes();
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const { tri } of [...raw, ...Object.values(VM).flatMap(v => v.raw)]) for (let i = 0; i < tri.length; i++){ const a = i % 3; if (tri[i] < lo[a]) lo[a] = tri[i]; if (tri[i] > hi[a]) hi[a] = tri[i]; }
  const sc = hi.map((h, a) => (h - lo[a]) / 65535);
  let tris = 0, bytes = 0;
  const parts = raw.map(({ e, tri }) => {
    const Q = quant(tri, lo, sc);
    tris += tri.length / 9; bytes += Q.bytes;
    return { n: e.name, g: e.group, c: e.color, j: e.joint || null, k: e.count, m: e.moving || null, r: e.rides || null, v: Q.v, i: Q.i, w: Q.w };
  });
  // hardware cards: one per joint, with its item list
  const joints = {};
  for (const j of hw.joints) joints[j.id] = { name: j.name, tool: j.tool, removable: j.removable, order: j.assembly_order, notes: j.notes, source: j.source, items: [] };
  let pieces = 0;
  for (const it of hw.items){ pieces += it.qty_total; joints[it.joint] && joints[it.joint].items.push([it.id, it.kind, it.spec, it.qty_total, it.covered_by, !!it.est]); }
  // joints and motion (inventory/fusion/kinematics/kinematics.json): model-frame (m) vectors are used as they are; Fusion-frame (cm) pivots are kept for the card
  const kin = JSON.parse(readFileSync(url('./fusion/kinematics/kinematics.json'), 'utf8'));
  const r4 = v => Array.isArray(v) ? v.map(r4) : (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
  const STEPS = [], tbl = o => { const k = Object.keys(o).map(Number).sort((a, b) => a - b); if (!STEPS.length) STEPS.push(...k); return k.map(x => o[String(x)]); };
  const cm2m = v => v && [v[1] / 100, v[2] / 100, v[0] / 100];
  const KG = {};
  for (const g of kin.groups){
    const o = { id: g.id, name: g.name, kind: g.kind, parent: g.parent, contains: g.contains || g.note || null, positive: g.positive || null, note: g.note || null,
      pivot: r4(g.pivot_m || cm2m(g.pivot_cm)), pivotCm: g.pivot_cm, axis: g.axis_m, axisCm: g.axis_cm };
    if (g.limits_deg) o.limDeg = g.limits_deg; if (g.limits_mm) o.limMm = g.limits_mm; if (g.limit_source) o.limSrc = g.limit_source; if (g.limits_source) o.limSrc = g.limits_source;
    if (g.kind === 'surface'){ o.driver = g.driver.group; o.ratio = g.driver.secant_ratio_surface_per_servo; o.tbl = tbl(g.servo_to_surface_deg); o.plus = g.servo_plus_gives; o.hinge = g.hinge_line_m; }
    if (g.kind === 'servo_arm'){ o.hole = g.arm_hole_m; o.armR = g.arm_r_mm; o.neutralDeg = g.neutral_arm_angle_deg_about_axis; }
    if (g.kind === 'pushrod'){ o.p1 = g.p1_neutral_m; o.p2 = g.p2_neutral_m; o.len = g.rod_len_pin_to_hole_mm; o.cut = g.rod_cut_mm; o.rod = g.pose_table.map(t => t.rod_angle_deg); o.p1t = g.pose_table.map(t => r4(t.p1_m)); if (g.pose_table.length !== 19 || g.pose_table[0].servo_deg !== -45) throw new Error('pose table steps'); }
    if (g.kind === 'slider') o.carries = g.carries ? g.carries.groups : [];
    KG[g.id] = o;
  }
  if (STEPS.join() !== '-45,-40,-35,-30,-25,-20,-15,-10,-5,0,5,10,15,20,25,30,35,40,45') throw new Error('servo table steps');
  const K = { g: KG, order: kin.groups.map(g => g.id), method: kin.four_bar_method, src: 'inventory/fusion/kinematics/kinematics.json (' + kin.generated + ')' };
  const nMov = Object.keys(KG).length, nSlide = Object.values(KG).filter(g => g.kind === 'slider').length;
  for (const p of parts){ if (p.m && !KG[p.m]) throw new Error('unknown moving id ' + p.m); if (p.r && !KG[p.r]) throw new Error('unknown rides id ' + p.r); }
  const groups = {}; for (const p of parts) groups[p.g] = (groups[p.g] || 0) + 1;
  const c0Names = new Set(man.entries.map(e => e.name)), V = {};
  for (const [id, { man: vm, raw: vr }] of Object.entries(VM)){
    let vt = 0, vb = 0;
    const vparts = vr.map(({ e, tri }) => { const Q = quant(tri, lo, sc); vt += tri.length / 9; vb += Q.bytes;
      return { n: e.name, g: e.group, c: e.color, k: e.count, s: c0Names.has(e.name) ? 'changed' : 'new', v: Q.v, i: Q.i, w: Q.w }; });
    const hide = (vm.hide || []).filter(n => c0Names.has(n)), badHide = (vm.hide || []).filter(n => !c0Names.has(n));
    if (badHide.length) console.warn('variant ' + id + ': hide names not in the C0 manifest: ' + badHide.join(', '));
    V[id] = { id, doc: vm.doc || null, axis_note: vm.axis_note || null, generated: vm.generated || null, hide, parts: vparts, tris: vt, bytes: vb, files: vparts.length, missing: (vm.entries || []).length - vparts.length };
  }
  return { F: { lo, sc, parts, joints, K, nMov, nSlide, tris, pieces, files: parts.length, groups, bytes, generated: man.generated }, V };
}
