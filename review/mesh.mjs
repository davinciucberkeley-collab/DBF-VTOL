// Packs the SOLIDWORKS part meshes (cad/mesh/*.stl from cad/ExportMesh.exe) and the assembly placements
// (comp= lines of cad/params.txt) into a compact object for the review page's CAD viewer.
// Vertices are welded at 10 µm and stored as base64 Float32 positions + Uint16/Uint32 indices.
// Rev B: comp lines carry a rotation matrix (rows = images of the part axes). The viewer places parts by translation
// only, so each distinct rotation of a part becomes its own pre-rotated mesh variant ("Part~k"); fasteners are tiny,
// so the duplicates cost little. Fastener instances are kept (the CAD has every one).
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
const ID = '1,0,0,0,1,0,0,0,1';
// v' = v . R  (row-vector convention, rows of R are the images of the part axes)
function rotate(pos, R) {
  const out = new Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    out[i] = x * R[0] + y * R[3] + z * R[6]; out[i + 1] = x * R[1] + y * R[4] + z * R[7]; out[i + 2] = x * R[2] + y * R[5] + z * R[8];
  }
  return out;
}
export function packMesh() {
  const dir = url('../cad/mesh/');
  const meta = JSON.parse(readFileSync(new URL('meta.json', dir), 'utf8'));
  const raw = {};
  for (const f of readdirSync(dir).filter(f => /\.stl$/i.test(f))) {
    const name = f.slice(0, -4); if (!meta[name]) continue;
    raw[name] = readStl(readFileSync(new URL(f, dir)));
  }
  const lines = readFileSync(url('../cad/params.txt'), 'utf8').split(/\r?\n/).filter(l => l.startsWith('comp='))
    .map(l => { const [p, x, y, z, r] = l.slice(5).split('|'); return { p, x: +x, y: +y, z: +z, r: r && r.length ? r : ID }; });
  const missing = lines.filter(c => !raw[c.p]).map(c => c.p);
  // VTOL_MESH_LENIENT=1 previews the page while a CAD export is in progress; normal builds stay strict
  if (missing.length && process.env.VTOL_MESH_LENIENT !== '1') throw new Error('mesh missing for ' + [...new Set(missing)].join(', '));
  if (missing.length) { console.log('WARNING lenient mesh: skipping', new Set(missing).size, 'parts'); lines.splice(0, lines.length, ...lines.filter(c => raw[c.p])); }
  // one mesh per (part, rotation)
  const variants = new Map(), parts = {}; let tris = 0;
  const comps = lines.map(c => {
    const key = c.p + '|' + c.r;
    let name = variants.get(key);
    if (!name) {
      const rots = [...variants.keys()].filter(k => k.startsWith(c.p + '|')).length;
      name = c.r === ID ? c.p : c.p + '~' + rots;
      variants.set(key, name);
      const m = raw[c.p], pos = c.r === ID ? m.pos : rotate(m.pos, c.r.split(',').map(Number));
      const big = pos.length / 3 > 65535;
      parts[name] = { c: meta[c.p].c, d: meta[c.p].d, v: b64(new Float32Array(pos)), i: b64(big ? new Uint32Array(m.idx) : new Uint16Array(m.idx)), w: big ? 4 : 2 };
      tris += m.tris;
    }
    return [name, c.x, c.y, c.z];
  });
  return { parts, comps, tris };
}
