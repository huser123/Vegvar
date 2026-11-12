// Térképgenerálás (14. fejezet): átlós, kanyargó folyó gázlókkal, pontszimmetrikus pálya két játékosra.
// A generátor lebegőpontos zajt használ; a kész térkép egész tömbökben él, a szimuláció már csak azt látja.
import { T } from './data';
import { RU } from './types';
import { xs32 } from './rules';

export interface GenMap {
  W: number; H: number; base: Uint8Array; hgt: Uint8Array; rdist: Uint8Array; wood: Int32Array; stone: Int32Array;
  villages: { x: number; y: number }[]; herds: { x: number; y: number }[]; starts: { x: number; y: number }[];
  fords: { x: number; y: number }[];
}

function lattice(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 362437) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = lattice(xi, yi, s), b = lattice(xi + 1, yi, s), c = lattice(xi, yi + 1, s), d = lattice(xi + 1, yi + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x: number, y: number, s: number): number {
  return vnoise(x, y, s) * 0.6 + vnoise(x * 2.1, y * 2.1, s + 7) * 0.28 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.12;
}

export function generateMap(W: number, seed: number): GenMap {
  const H = W, N = W * H, sc = W / 96;
  let rs = (seed | 0) || 1;
  const rnd = () => { rs = xs32(rs); return rs / 4294967296; };
  const base = new Uint8Array(N), hgt = new Uint8Array(N), rdist = new Uint8Array(N).fill(99);
  const wood = new Int32Array(N), stone = new Int32Array(N);

  // Folyó: a = x − y (folyásirány), b = x + y − (W−1) (keresztirány), átlós egységben
  const A1 = (6 + rnd() * 5) * sc, k1 = 2 * Math.PI / ((70 + rnd() * 40) * sc);
  const A2 = (2 + rnd() * 2.5) * sc, k2 = 2 * Math.PI / ((27 + rnd() * 16) * sc);
  const k3 = 2 * Math.PI / ((40 + rnd() * 30) * sc);
  const off = (a: number) => A1 * Math.sin(a * k1) + A2 * Math.sin(a * k2);
  const hw = (a: number) => 2.7 + 0.75 * Math.cos(a * k3);
  const fordA = [0, Math.round(54 * sc), -Math.round(54 * sc)];
  const isRiver = (x: number, y: number) => { const a = x - y, b = x + y - (W - 1); return Math.abs(b - off(a)) <= hw(a); };
  const mir = (i: number) => N - 1 - i;
  const xyOf = (a: number, b: number) => ({ x: Math.round((a + b + W - 1) / 2), y: Math.round((b - a + W - 1) / 2) });
  const clampXY = (p: { x: number; y: number }, m: number) => ({ x: Math.max(m, Math.min(W - 1 - m, p.x)), y: Math.max(m, Math.min(H - 1 - m, p.y)) });

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (isRiver(x, y)) {
      const a = x - y;
      base[y * W + x] = fordA.some(f => Math.abs(a - f) <= 2) ? T.GAZLO : T.FOLYO;
    }
  }
  // Folyótávolság (Csebisev), BFS
  let q: number[] = [];
  for (let i = 0; i < N; i++) if (base[i] === T.FOLYO || base[i] === T.GAZLO) { rdist[i] = 0; q.push(i); }
  while (q.length) {
    const nq: number[] = [];
    for (const i of q) {
      const x = i % W, y = (i / W) | 0, d = rdist[i] + 1;
      if (d > 40) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (rdist[j] > d) { rdist[j] = d; nq.push(j); }
      }
    }
    q = nq;
  }

  // Az 1. játékos oldala: b < 0. Indulóhely a folyótól 8–12 csempére.
  const aP = -Math.round(36 * sc);
  let st = clampXY(xyOf(aP, off(aP) - 16), 8);
  for (let k = 0; k < 12 && rdist[st.y * W + st.x] < 9; k++) st = { x: st.x - 1, y: st.y - 1 };
  for (let k = 0; k < 12 && rdist[st.y * W + st.x] > 11; k++) st = { x: st.x + 1, y: st.y + 1 };
  st = clampXY(st, 8);
  const vdefs: [number, number][] = [[-57, -11], [-11, -32], [15, -14], [-38, -40]];
  const vil = vdefs.map(([a, b]) => {
    let p = clampXY(xyOf(a * sc, off(a * sc) + b * sc), 5);
    for (let k = 0; k < 10 && rdist[p.y * W + p.x] < 5; k++) p = clampXY({ x: p.x - 1, y: p.y - 1 }, 5);
    return p;
  });
  const blobs = [{ x: st.x - 7, y: st.y - 6, r: 4.6 }, { x: st.x + 8, y: st.y - 8, r: 3.4 }];
  const stoneAt = { x: st.x - 6, y: st.y + 4 };
  const herds = [{ x: st.x + 6, y: st.y - 3 }, { x: st.x - 1, y: st.y - 10 }].map(p => clampXY(p, 3));
  const s1 = (rs & 0xffff), s2 = s1 + 101, s3 = s1 + 211;

  const gen = (x: number, y: number): number => {
    const i = y * W + x;
    if (base[i] === T.FOLYO || base[i] === T.GAZLO) return base[i];
    const ds = Math.hypot(x - st.x, y - st.y);
    if (x >= stoneAt.x && x <= stoneAt.x + 1 && y >= stoneAt.y && y <= stoneAt.y + 1) return T.KO;
    if (ds < 6.6) return T.RET;
    for (const v of vil) if (Math.abs(x - v.x) <= 3 && Math.abs(y - v.y) <= 3) return T.RET;
    for (const h of herds) if (Math.hypot(x - h.x, y - h.y) < 2.6) return T.RET;
    for (const bl of blobs) if (Math.hypot(x - bl.x, y - bl.y) + (lattice(x, y, s1) - 0.5) * 1.6 < bl.r && rdist[i] > 2) return T.ERDO;
    const rd = rdist[i];
    if (rd <= 3) {
      if (fbm(x / 5, y / 5, s3) > 0.64 && rd >= 1) return T.MOCSAR;
      return fbm(x / 6, y / 6, s1) > 0.7 && rd >= 2 ? T.ERDO : T.RET;
    }
    if (ds > 10 && fbm(x / 9, y / 9, s2) > 0.615) return T.DOMB;
    if (fbm(x / 7, y / 7, s1) > 0.555) return T.ERDO;
    return T.RET;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const b = x + y - (W - 1), a = x - y;
    if (!(b < 0 || (b === 0 && a <= 0))) continue;
    const i = y * W + x, t = gen(x, y);
    base[i] = t; base[mir(i)] = t;
  }

  // Utak: indulóhely → legközelebbi gázló és falu, falvak → gázló
  const fords = fordA.map(a => xyOf(a, off(a)));
  const road = (p: { x: number; y: number }, to: { x: number; y: number }) => {
    let x = p.x, y = p.y, guard = 400;
    while ((x !== to.x || y !== to.y) && guard-- > 0) {
      const dx = to.x - x, dy = to.y - y;
      if (Math.abs(dx) > Math.abs(dy)) x += Math.sign(dx); else y += Math.sign(dy);
      const i = y * W + x, t = base[i];
      if (t === T.FOLYO || t === T.GAZLO) break;
      if (t === T.RET || t === T.ERDO || t === T.MOCSAR) { base[i] = T.UT; base[mir(i)] = T.UT; }
    }
  };
  const nearest = (p: { x: number; y: number }, list: { x: number; y: number }[]) =>
    list.slice().sort((u, v) => Math.hypot(u.x - p.x, u.y - p.y) - Math.hypot(v.x - p.x, v.y - p.y))[0];
  road({ x: st.x, y: st.y + 3 }, nearest(st, fords));
  road({ x: st.x, y: st.y + 3 }, { x: nearest(st, vil).x + 2, y: nearest(st, vil).y });
  for (const v of vil) road({ x: v.x + 2, y: v.y }, nearest(v, fords));
  road({ x: vil[1].x - 2, y: vil[1].y }, { x: vil[3].x + 2, y: vil[3].y });

  for (let i = 0; i < N; i++) {
    if (base[i] === T.DOMB) hgt[i] = 1;
    if (base[i] === T.ERDO) wood[i] = 150 * RU;
    if (base[i] === T.KO) stone[i] = 1000 * RU;
  }
  const m = (p: { x: number; y: number }) => ({ x: W - 1 - p.x, y: H - 1 - p.y });
  return {
    W, H, base, hgt, rdist, wood, stone,
    villages: [...vil, ...vil.map(m)],
    herds: [...herds, ...herds.map(m)],
    starts: [st, m(st)],
    fords,
  };
}
