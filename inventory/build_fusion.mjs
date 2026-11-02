// Packs the Autodesk Fusion export (inventory/fusion/manifest.json + stl/*.stl, written by fusion/export_stl_fusion.py)
// into a compact object for the inventory page's Fusion viewer, joined with the hardware schedule (inventory/hardware/hardware.json).
// STL frame (manifest axis_note): Fusion world cm, Z-up; model X fwd = Fusion +Y, model Y up = Fusion +Z, model Z right = Fusion +X.
// Output frame: the page's model frame, X forward, Y up, Z right, metres -> (x, y, z) = (Fy, Fz, Fx) / 100 (a cyclic swap, so winding is kept).
// Positions are quantised to Uint16 over the whole model's bounding box (about 37 µm on a 2.4 m span) and welded at that grid.
import { readFileSync } from 'fs';
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

export function packFusion(){
  const man = JSON.parse(readFileSync(url('./fusion/manifest.json'), 'utf8'));
  const hw = JSON.parse(readFileSync(url('./hardware/hardware.json'), 'utf8'));
  const raw = man.entries.map(e => ({ e, tri: readStl(readFileSync(url('./fusion/' + e.file))) }));
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const { tri } of raw) for (let i = 0; i < tri.length; i++){ const a = i % 3; if (tri[i] < lo[a]) lo[a] = tri[i]; if (tri[i] > hi[a]) hi[a] = tri[i]; }
  const sc = hi.map((h, a) => (h - lo[a]) / 65535);
  let tris = 0, bytes = 0;
  const parts = raw.map(({ e, tri }) => {
    const map = new Map(), q = [], idx = new Array(tri.length / 3);
    for (let v = 0; v < tri.length / 3; v++){
      const k0 = Math.round((tri[3*v] - lo[0]) / sc[0]), k1 = Math.round((tri[3*v+1] - lo[1]) / sc[1]), k2 = Math.round((tri[3*v+2] - lo[2]) / sc[2]);
      const key = k0 * 4294967296 + k1 * 65536 + k2;   // < 2^48, exact in a double
      let i = map.get(key); if (i === undefined){ i = q.length / 3; map.set(key, i); q.push(k0, k1, k2); } idx[v] = i;
    }
    const big = q.length / 3 > 65535, v = new Uint16Array(q), ix = big ? new Uint32Array(idx) : new Uint16Array(idx);
    tris += tri.length / 9; bytes += v.byteLength + ix.byteLength;
    return { n: e.name, g: e.group, c: e.color, j: e.joint || null, k: e.count, v: b64(v), i: b64(ix), w: big ? 4 : 2 };
  });
  // hardware cards: one per joint, with its item list
  const joints = {};
  for (const j of hw.joints) joints[j.id] = { name: j.name, tool: j.tool, removable: j.removable, order: j.assembly_order, notes: j.notes, source: j.source, items: [] };
  let pieces = 0;
  for (const it of hw.items){ pieces += it.qty_total; joints[it.joint] && joints[it.joint].items.push([it.id, it.kind, it.spec, it.qty_total, it.covered_by, !!it.est]); }
  const groups = {}; for (const p of parts) groups[p.g] = (groups[p.g] || 0) + 1;
  return { lo, sc, parts, joints, tris, pieces, files: parts.length, groups, bytes, generated: man.generated };
}
