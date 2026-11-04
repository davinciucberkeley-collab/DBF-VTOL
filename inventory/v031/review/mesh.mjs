// Packs the SOLIDWORKS part meshes (cad/mesh/*.stl from cad/ExportMesh.exe) and the assembly placements
// (comp= lines of cad/params.txt) into a compact object for the review page's CAD viewer.
// Vertices are welded at 10 µm and stored as base64 Float32 positions + Uint16/Uint32 indices.
import { readFileSync, readdirSync } from 'fs';
const url = p => new URL(p, import.meta.url);

function readStl(buf) {
  const n = buf.readUInt32LE(80), pos = [], idx = [], map = new Map();
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50 + 12;
    for (let k = 0; k < 3; k++) {
      const x = buf.readFloatLE(o + k * 12), y = buf.readFloatLE(o + k * 12 + 4), z = buf.readFloatLE(o + k * 12 + 8);
      const key = Math.round(x * 1e5) + ',' + Math.round(y * 1e5) + ',' + Math.round(z * 1e5);
      let i = map.get(key);
      if (i === undefined) { i = pos.length / 3; map.set(key, i); pos.push(x, y, z); }
      idx.push(i);
    }
  }
  return { pos, idx, tris: n };
}
const b64 = ta => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString('base64');

export function packMesh() {
  const dir = url('../cad/mesh/');
  const meta = JSON.parse(readFileSync(new URL('meta.json', dir), 'utf8'));
  const parts = {}; let tris = 0;
  for (const f of readdirSync(dir).filter(f => /\.stl$/i.test(f))) {
    const name = f.slice(0, -4); if (!meta[name]) continue;
    const m = readStl(readFileSync(new URL(f, dir)));
    const big = m.pos.length / 3 > 65535;
    parts[name] = { c: meta[name].c, d: meta[name].d, v: b64(new Float32Array(m.pos)), i: b64(big ? new Uint32Array(m.idx) : new Uint16Array(m.idx)), w: big ? 4 : 2 };
    tris += m.tris;
  }
  const comps = readFileSync(url('../cad/params.txt'), 'utf8').split(/\r?\n/).filter(l => l.startsWith('comp='))
    .map(l => { const [p, x, y, z] = l.slice(5).split('|'); return [p, +x, +y, +z]; });
  const missing = comps.filter(c => !parts[c[0]]).map(c => c[0]);
  if (missing.length) throw new Error('mesh missing for ' + [...new Set(missing)].join(', '));
  return { parts, comps, tris };
}
