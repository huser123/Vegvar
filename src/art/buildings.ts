// Épület-sprite-ok: minden épület 3D-s primitívekből (objects.ts raszterező) épül fel, kulcs szerint gyorsítótárazva.
import { BUILDINGS } from '../sim/data';
import { BuildingSpriteOpts, Sprite } from './api';
import { Buf, M, Mat, V3 } from './objects';
import { g2, hash2, mk, RGB, rng, TEAM } from './pal';

interface C {
  b: Buf; id: string; f: number; T: { d: RGB; m: RGB; l: RGB }; win: boolean; stage: number; det: boolean; o: BuildingSpriteOpts;
  R(m: Mat, trim?: boolean): Mat; // tetőanyag: kész = hó + csapatszín-szegély, 2. fázis = szarufák, előtte semmi
}
const NONE: Mat = () => null;
const WOOD: RGB = [120, 90, 58], WOODD: RGB = [78, 58, 42], GOLD: RGB = [226, 190, 80];
const STONEC: RGB = [170, 164, 152];

const plinth = (m: Mat, h = 5): Mat => { const st = M.stone([150, 146, 138], 3, 7); return (s, t) => (t < h ? st(s, t) : m(s, t)); };
const wallMain = (c: C, H: number): Mat => c.f === 0 ? M.timber(H, 13) : c.f === 1 ? M.timber(H, 17, [226, 204, 166], [112, 78, 52]) : plinth(M.timber(H, 15, [222, 218, 208], [84, 72, 64]));
const roofMain = (c: C): Mat => c.f === 0 ? M.shingle() : c.f === 1 ? M.tile() : M.shingle([94, 104, 120]);
const roofPoor = (c: C): Mat => c.f === 0 ? M.thatch() : c.f === 1 ? M.thatch([176, 150, 96]) : M.shingle([120, 102, 86]);
const arch = (w: number, h: number, col: RGB = [36, 28, 28]): Mat => (s, t) => {
  const x = s - w / 2, r = w / 2;
  if (Math.abs(x) > r) return null;
  if (t < h - r) return col;
  const dy = t - (h - r);
  return x * x + dy * dy < r * r ? col : null;
};
const crenel = (m: Mat, H: number, period = 9, gap = 4): Mat => (s, t) => (t > H && (s % period) < gap ? null : m(s, t));

function hall(c: C, u0: number, v0: number, u1: number, v1: number, hW: number, hR: number, axis: 'u' | 'v', wallM: Mat, roofM: Mat, ov = 0.1): void {
  c.b.box(u0, v0, u1, v1, 0, hW, wallM, M.dark());
  c.b.gable(u0, v0, u1, v1, hW, hW + hR, axis, c.stage >= 3 ? ov : 0.02, c.R(roofM), wallM);
}
const DOORM = M.planksV([84, 60, 40], 3);
function doorU(c: C, u: number, v: number, w: number, h: number, m: Mat = DOORM): void { c.b.wall(u, v, u + w, v, 0, h, m, undefined, 0.012); }
function doorV(c: C, u: number, v: number, w: number, h: number, m: Mat = DOORM): void { c.b.wall(u, v, u, v + w, 0, h, m, undefined, 0.012); }
function winU(c: C, u: number, v: number, z: number, w = 0.1, h = 5): void { c.b.wall(u, v, u + w, v, z, z + h, M.dark(), undefined, 0.012); }
function winV(c: C, u: number, v: number, z: number, w = 0.1, h = 5): void { c.b.wall(u, v, u, v + w, z, z + h, M.dark(), undefined, 0.012); }

function flag(c: C, u: number, v: number, z0: number, len: number, size = 10): void {
  if (!c.det) return;
  const b = c.b, T = c.T, top: V3 = [u, v, z0 + len];
  b.line([u, v, z0], top, [74, 56, 44]);
  const w = size, h = Math.max(4, Math.round(size * 0.62)), cxm = Math.floor(w * 0.42), cym = (h - 1) >> 1;
  b.decal(top, 1, 0, w, h + 4, (i, j) => {
    const wave = Math.round(Math.sin(i * 0.8 + 0.6) * 1.2 + 1.2), jj = j - wave;
    if (jj < 0 || jj >= h) return null;
    if (c.f === 0 && i >= w - 3 && Math.abs(jj - (h - 1) / 2) < (i - (w - 3)) * 0.9) return null;
    const sh = Math.sin(i * 0.8 + 2.2);
    let col = sh > 0.4 ? T.l : sh < -0.4 ? T.d : T.m;
    if (jj === h - 1) col = T.d;
    if (c.f === 0 && jj === cym && i > 0) col = [240, 232, 214];
    if (c.f === 1 && ((i === cxm && Math.abs(jj - cym) <= 1) || (i === cxm + 1 && Math.abs(jj - cym) === 1 && h > 5))) col = [246, 240, 224];
    if (c.f === 2 && Math.abs(i - cxm) <= 1 && Math.abs(jj - cym) <= (h > 6 ? 1 : 0)) col = [40, 36, 40];
    return col;
  });
  if (c.f === 1) b.decal(top, -1, -3, 3, 3, (i, j) => ((i === 1 && j === 1) || (j === 0 && i === 1) ? null : GOLD));
  else b.decal(top, 0, -1, 1, 1, () => GOLD);
}
function banner(c: C, u0: number, v0: number, u1: number, v1: number, z0: number, z1: number): void {
  if (!c.det) return;
  const T = c.T, H = z1 - z0;
  c.b.wall(u0, v0, u1, v1, z0, z1, (s, t) => (t < 2 && (Math.floor(s) & 1) ? null : t > H - 1.5 ? T.d : (s % 4) < 1.2 ? T.l : T.m), undefined, 0.02);
}
function pix(c: C, p: V3, map: string[], pal: Record<string, RGB>, flip = false): void {
  const w = map[0].length, h = map.length;
  c.b.decal(p, -(w >> 1), -h + 1, w, h, (i, j) => pal[map[j][flip ? w - 1 - i : i]] ?? null, 0.06);
}
const COW = ['............H.H', '.............hh', '.BBBBBBBBBB.hhh', 'tBBBBBBBBBBBhhn', 'tBBBBBBBBBBB...', '.bbbbbbbbbbb...', '.L.L.....L.L...', '.L.L.....L.L...'];
const COWP: Record<string, RGB> = { B: [224, 220, 210], b: [158, 154, 150], h: [196, 192, 184], H: [250, 246, 230], n: [50, 44, 46], t: [110, 106, 102], L: [72, 66, 64] };
const HORSE = ['..........hh.', '.........hhhn', 'tBBBBBBBBhh..', 'tBBBBBBBBB...', '.bbbbbbbbb...', '.L..L.L..L...', '.L..L.L..L...'];
const HORSEP: Record<string, RGB> = { B: [132, 90, 56], b: [100, 66, 42], h: [124, 84, 52], n: [50, 40, 36], t: [56, 42, 34], L: [72, 52, 38] };
const CANNON = ['BBBBBBBBBB.', 'bbbbbbbbbbB', '..wOw......', '..OwO......', '..wOw......'];
const CANNONP: Record<string, RGB> = { B: [176, 146, 76], b: [122, 98, 52], w: [70, 54, 42], O: [104, 80, 58] };

function barrel(c: C, u: number, v: number, z = 0): void {
  if (!c.det) return;
  c.b.cyl(u, v, 0.09, z, z + 8, (s, t) => (Math.floor(t) === 2 || Math.floor(t) === 6 ? [70, 62, 58] : [140, 104, 64]), M.flat([104, 78, 50]), 8);
}
function crate(c: C, u: number, v: number, s = 0.16, z = 0, h = 6): void {
  if (!c.det) return;
  c.b.box(u, v, u + s, v + s, z, z + h, M.planksV([150, 118, 76], 3), M.flat([172, 138, 92]));
}
function fence(c: C, pts: [number, number][], h = 9, closed = true): void {
  const b = c.b, col: RGB = [134, 104, 68];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], q = pts[(i + 1) % pts.length], L = Math.hypot(q[0] - a[0], q[1] - a[1]), k = Math.max(1, Math.round(L / 0.42));
    for (let j = 0; j <= k; j++) { const u = a[0] + (q[0] - a[0]) * j / k, v = a[1] + (q[1] - a[1]) * j / k; b.line([u, v, 0], [u, v, h + 1], [96, 72, 48]); }
    b.line([a[0], a[1], h - 1], [q[0], q[1], h - 1], col); b.line([a[0], a[1], h - 5], [q[0], q[1], h - 5], col);
  }
}
function yard(c: C, u0: number, v0: number, u1: number, v1: number, base: RGB = [150, 126, 90]): void {
  const W = (u1 - u0) * 36, H = (v1 - v0) * 36, win = c.win;
  c.b.top(u0, v0, u1, v1, 0, (s, t) => {
    const e = Math.min(s, t, W - s, H - t), n = hash2(s | 0, t | 0, 60);
    if (e < 9 && n > e / 9) return null;
    const k = 0.86 + hash2(s >> 1, t >> 1, 61) * 0.2 + (n - 0.5) * 0.1;
    return win ? [216 * k + 20, 222 * k + 18, 236] : [base[0] * k, base[1] * k, base[2] * k];
  }, 1, -0.6);
}
function tent(c: C, cu: number, cv: number, r: number, hw: number, ht: number, base: RGB, stripe: RGB | null): void {
  const b = c.b, cm = M.canvas(base, stripe, 6), rm = c.stage >= 3 ? M.snow(cm, c.win, 0.35) : c.stage === 2 ? M.rafters(6) : NONE;
  if (hw > 0) b.cyl(cu, cv, r * 0.94, 0, hw, c.stage >= 3 ? M.canvas(base, null) : M.rafters(7), null, 12);
  b.spire(b.ngon(cu, cv, r, 12), hw, cu, cv, ht, rm);
  if (c.det) {
    if (hw > 0) b.cyl(cu, cv, r * 0.96, hw - 3, hw, M.flat(c.T.m), null, 12);
    b.decal([cu + r * 0.7, cv + r * 0.7, 0], -2, -Math.max(8, hw), 4, Math.max(8, hw), (i, j) => (i === 0 || i === 3) && j < 2 ? null : [44, 34, 34], 0.03);
    b.line([cu, cv, ht], [cu, cv, ht + 5], [74, 56, 44]);
    b.decal([cu, cv, ht + 5], -1, -3, 3, 3, (i, j) => ((i === 1 && j === 1) || (j === 0 && i === 1) ? null : GOLD));
  }
}

// ---------------------------------------------------------------- receptek
type Recipe = (c: C) => void;
const R: Record<string, Recipe> = {
  haz(c) {
    const wm = c.f === 0 ? M.plaster() : wallMain(c, 15);
    hall(c, 0.28, 0.5, 1.72, 1.5, 15, 19, 'u', wm, roofPoor(c), 0.12);
    doorU(c, 0.85, 1.5, 0.17, 10); winU(c, 0.45, 1.5, 6, 0.12, 5); winU(c, 1.3, 1.5, 6, 0.12, 5); winV(c, 1.72, 0.9, 6, 0.14, 5);
    if (c.det) {
      c.b.box(1.2, 0.86, 1.36, 1.02, 22, 40, M.plaster([206, 196, 180]), M.dark(), false);
      if (c.f === 0) c.b.wall(0.1, 1.88, 0.75, 1.88, 0, 6, M.wattle());
      else if (c.f === 2) c.b.wall(0.1, 1.88, 0.75, 1.88, 0, 5, M.stone([150, 146, 138], 3, 6));
      barrel(c, 1.5, 1.62);
      banner(c, 1.06, 1.5, 1.2, 1.5, 6, 13);
    }
  },
  malom(c) {
    const b = c.b;
    b.cyl(0.85, 0.82, 0.6, 0, 15, c.f === 2 ? plinth(M.planksV()) : M.wattle([162, 132, 86]), M.dark(), 14);
    b.spire(b.ngon(0.85, 0.82, 0.74, 14), 13, 0.85, 0.82, 47, c.R(roofMain(c)));
    hall(c, 1.2, 1.05, 1.9, 1.72, 12, 12, 'u', wallMain(c, 12), roofMain(c), 0.08);
    doorU(c, 1.42, 1.72, 0.16, 9);
    if (c.det) {
      b.cyl(0.85, 0.82, 0.07, 47, 51, M.flat(WOODD), M.flat(WOODD), 6);
      b.cyl(0.5, 1.72, 0.17, 0, 3, M.stone([176, 172, 164], 2, 4), M.flat([190, 186, 176]), 10);
      for (const [u, v] of [[1.05, 1.86], [1.2, 1.9], [1.12, 1.78]]) b.cyl(u, v, 0.07, 0, 6, M.flat([214, 200, 168]), M.flat([228, 216, 186]), 6);
      doorU(c, 0.72, 1.4, 0.2, 10, M.dark());
      flag(c, 0.85, 0.82, 51, 12, 8);
    }
  },
  fatelep(c) {
    const b = c.b, post: RGB = [110, 82, 54];
    for (const [u, v] of [[0.3, 0.35], [1.25, 0.35], [0.3, 1.45], [1.25, 1.45]]) b.line([u, v, 0], [u, v, 17], post, 2);
    b.gable(0.3, 0.35, 1.25, 1.45, 16, 28, 'v', 0.1, c.R(roofPoor(c)), null);
    const logs = M.logs([140, 104, 64], 4), ends: Mat = (s, t) => { const x = (s % 4) - 2, y = (t % 4) - 2; return x * x + y * y < 3.4 ? [208, 174, 120] : [96, 70, 46]; };
    if (c.stage >= 2) {
      b.wall(0.45, 1.3, 1.1, 1.3, 0, 10, logs); b.wall(1.1, 0.5, 1.1, 1.3, 0, 10, ends); b.top(0.45, 0.5, 1.1, 1.3, 10, M.logs([150, 114, 72], 4));
    }
    if (c.det) {
      b.wall(1.4, 1.75, 1.9, 1.75, 0, 12, ends); b.wall(1.9, 0.6, 1.9, 1.75, 0, 12, M.logs([134, 98, 60], 4)); b.top(1.4, 0.6, 1.9, 1.75, 12, M.logs([154, 118, 74], 4));
      b.shadow([[1.4, 0.6], [1.9, 0.6], [1.9, 1.75], [1.4, 1.75]], 12);
      b.box(0.3, 1.62, 1.1, 1.86, 0, 5, M.planksH([176, 142, 92], 2), M.planksV([190, 156, 104], 3));
      b.line([0.5, 1.95, 0], [0.62, 1.95, 7], WOODD); b.line([0.74, 1.95, 0], [0.62, 1.95, 7], WOODD);
      b.line([0.95, 1.95, 0], [1.07, 1.95, 7], WOODD); b.line([1.19, 1.95, 0], [1.07, 1.95, 7], WOODD);
      b.line([0.5, 1.95, 7], [1.2, 1.95, 7], [150, 114, 72], 2);
      flag(c, 0.3, 0.35, 17, 16, 8);
    }
  },
  kobanya(c) {
    const b = c.b;
    hall(c, 0.3, 0.3, 1.15, 1.0, 12, 10, 'u', c.f === 2 ? plinth(M.planksV()) : M.planksV(), roofPoor(c), 0.08);
    doorU(c, 0.6, 1.0, 0.16, 9, M.dark());
    if (c.stage >= 2) {
      const sm = M.stone([186, 182, 172], 5, 9), tm = M.flat([204, 200, 190], 0.1);
      b.box(1.35, 0.35, 1.85, 0.8, 0, 9, sm, tm); b.box(1.45, 0.42, 1.8, 0.75, 9, 15, sm, tm, false);
      b.box(0.35, 1.3, 0.75, 1.65, 0, 7, sm, tm); b.box(0.95, 1.45, 1.25, 1.75, 0, 6, sm, tm);
    }
    if (c.det) {
      b.line([1.25, 1.15, 0], [1.5, 1.3, 34], WOODD, 2); b.line([1.75, 1.45, 0], [1.5, 1.3, 34], WOODD, 2);
      b.line([1.5, 1.3, 34], [1.5, 1.72, 27], WOOD, 2); b.line([1.5, 1.72, 27], [1.5, 1.72, 9], [60, 52, 46]);
      b.box(1.4, 1.62, 1.6, 1.82, 3, 9, M.stone([190, 186, 176], 6, 8), M.flat([208, 204, 194]));
      flag(c, 0.72, 0.65, 22, 12, 8);
    }
  },
  karam(c) {
    const b = c.b;
    yard(c, 0.1, 0.1, 2.9, 2.9, [138, 120, 82]);
    hall(c, 0.3, 0.3, 1.4, 0.95, 10, 9, 'u', M.planksV([126, 96, 62]), roofPoor(c), 0.08);
    doorU(c, 0.6, 0.95, 0.4, 8, M.dark());
    if (c.stage >= 2) fence(c, [[0.2, 0.2], [2.8, 0.2], [2.8, 2.8], [0.2, 2.8]], c.stage === 2 ? 6 : 9);
    if (c.det) {
      b.spire(b.ngon(2.35, 0.65, 0.3, 10), 0, 2.35, 0.65, 20, M.snow(M.hay(), c.win, 0.4));
      b.box(1.7, 0.42, 2.0, 0.56, 0, 4, M.planksH(), M.flat([70, 96, 120]));
      const pos: [number, number, boolean][] = [[1.0, 1.7, false], [1.9, 1.45, true], [1.55, 2.3, false], [2.35, 2.1, true]];
      for (let i = 0; i < Math.min(4, c.o.cattle ?? 0); i++) pix(c, [pos[i][0], pos[i][1], 0], COW, COWP, pos[i][2]);
      flag(c, 0.2, 2.8, 0, 22, 8);
    }
  },
  kaszarnya(c) {
    const b = c.b, wm = wallMain(c, 20);
    yard(c, 1.2, 1.3, 2.9, 2.9);
    hall(c, 0.3, 0.3, 2.7, 1.35, 20, 18, 'u', wm, roofMain(c), 0.1);
    hall(c, 0.3, 1.35, 1.25, 2.6, 17, 15, 'v', wallMain(c, 17), roofMain(c), 0.08);
    doorU(c, 1.75, 1.35, 0.24, 13); for (const u of [1.45, 2.15, 2.45]) winU(c, u, 1.35, 9, 0.1, 6);
    doorV(c, 1.25, 1.75, 0.2, 11); winV(c, 1.25, 2.2, 8); winV(c, 2.7, 0.55, 9, 0.12, 6); winV(c, 2.7, 0.95, 9, 0.12, 6);
    if (c.det) {
      banner(c, 1.5, 1.35, 1.68, 1.35, 8, 18); banner(c, 2.02, 1.35, 2.2, 1.35, 8, 18);
      // pikaállvány, gyakorlóbábu
      for (let i = 0; i < 5; i++) b.line([2.2 + i * 0.07, 2.3, 0], [2.35, 2.3 - 0.1, 26], [150, 122, 84]);
      b.line([1.75, 2.45, 0], [1.75, 2.45, 16], WOODD, 2); b.line([1.6, 2.45, 12], [1.9, 2.45, 12], WOODD, 2);
      b.decal([1.75, 2.45, 16], -2, -3, 4, 4, () => [200, 176, 110]);
      crate(c, 2.45, 1.5); barrel(c, 2.72, 1.55);
      flag(c, 1.5, 0.82, 38, 18, 13);
    }
  },
  ortorony(c) {
    const b = c.b, st = c.f === 2;
    b.box(0.22, 0.22, 0.78, 0.78, 0, 42, st ? M.stone(STONEC) : M.palisade(46, true), null);
    b.box(0.12, 0.12, 0.88, 0.88, 42, 54, (s, t) => (t > 4 && t < 10 && (s % 9) > 3 && (s % 9) < 7 ? [40, 32, 30] : M.planksV([124, 92, 58], 3)(s, t)), M.dark());
    b.pyramid(0.12, 0.12, 0.88, 0.88, 54, 76, c.R(roofMain(c)), 0.08);
    doorU(c, 0.42, 0.78, 0.16, 10, M.dark());
    if (c.det) { for (const [u, v] of [[0.88, 0.12], [0.88, 0.88], [0.12, 0.88]]) b.line([u - 0.1, v - 0.1, 34], [u, v, 42], WOODD); flag(c, 0.5, 0.5, 76, 12, 9); }
  },
  strazsa(c) {
    const b = c.b, L: [number, number][] = [[0.25, 0.25], [0.7, 0.25], [0.7, 0.7], [0.25, 0.7]];
    for (const [u, v] of L) b.line([u, v, 0], [u + (0.475 - u) * 0.25, v + (0.475 - v) * 0.25, 36], WOODD, 2);
    b.line([0.25, 0.7, 4], [0.66, 0.67, 30], WOOD); b.line([0.7, 0.7, 4], [0.68, 0.3, 30], WOOD);
    b.box(0.2, 0.2, 0.75, 0.75, 36, 39, M.planksH(), M.planksV([150, 118, 78], 3));
    if (c.stage >= 2) {
      for (const [u, v] of L) b.line([u, v, 39], [u, v, 56], WOODD);
      b.line([0.2, 0.75, 46], [0.75, 0.75, 46], WOOD); b.line([0.75, 0.2, 46], [0.75, 0.75, 46], WOOD);
      for (let i = 0; i < 8; i++) b.line([0.2, 0.86, i * 4.5], [0.3, 0.86, i * 4.5], WOOD);
      b.line([0.2, 0.86, 0], [0.2, 0.8, 38], WOODD); b.line([0.3, 0.86, 0], [0.3, 0.8, 38], WOODD);
    }
    b.pyramid(0.2, 0.2, 0.75, 0.75, 56, 68, c.R(M.thatch()), 0.08);
    if (c.det) {
      // lármafa: szurkos szalmával tekert rúd
      b.line([0.9, 0.42, 0], [0.9, 0.42, 58], WOODD, 2);
      b.cyl(0.9, 0.42, 0.09, 48, 60, M.hay([196, 164, 84]), M.flat([60, 48, 40]), 8);
      b.cyl(0.9, 0.42, 0.1, 52, 54, M.flat([70, 54, 44]), null, 8);
      flag(c, 0.475, 0.475, 68, 10, 8);
    }
  },
  palank(c) { wallPiece(c, false); },
  kofal(c) { wallPiece(c, true); },
  palank_kapu(c) { gate(c, false); },
  ko_kapu(c) { gate(c, true); },
  rev(c) {
    const b = c.b, deck = M.planksV([150, 120, 80], 4);
    b.box(0.1, 0.15, 1.9, 2.85, 0, 4, M.planksH([110, 84, 56], 2), deck);
    hall(c, 0.25, 0.3, 1.25, 1.2, 15, 12, 'u', M.planksV([134, 102, 66]), roofPoor(c), 0.08);
    doorU(c, 0.6, 1.2, 0.18, 12, M.dark()); winV(c, 1.25, 0.65, 9, 0.14, 5);
    if (c.stage >= 2) for (const [u, v] of [[0.1, 2.85], [1.9, 2.85], [1.9, 0.15], [1.0, 2.85], [1.9, 1.5]]) b.line([u, v, 0], [u, v, 12], WOODD, 2);
    if (c.det) {
      // csónak a pallón
      const hull: [number, number][] = [[0.45, 1.75], [0.62, 1.6], [1.25, 1.6], [1.45, 1.75], [1.25, 1.9], [0.62, 1.9]];
      b.prism(hull, 4, 9, M.planksH([116, 82, 50], 2), M.flat([70, 50, 36]), 0.12);
      // száradó háló
      b.line([0.4, 2.55, 4], [0.4, 2.55, 20], WOODD); b.line([1.3, 2.55, 4], [1.3, 2.55, 20], WOODD);
      b.wall(0.4, 2.55, 1.3, 2.55, 9, 19, (s, t) => ((Math.floor(s) + Math.floor(t)) % 3 === 0 ? [196, 186, 160] : null), 1, 0.02);
      barrel(c, 1.55, 0.5, 4); barrel(c, 1.7, 0.72, 4); crate(c, 1.5, 2.3, 0.18, 4);
      flag(c, 0.75, 0.75, 27, 14, 9);
    }
  },
  satortabor(c) {
    const b = c.b, T = c.T;
    yard(c, 0.2, 0.2, 2.8, 2.8, [150, 130, 94]);
    tent(c, 1.1, 1.05, 0.72, 14, 46, [232, 222, 196], T.m);
    tent(c, 2.35, 0.8, 0.45, 0, 28, [226, 214, 186], null);
    tent(c, 0.75, 2.35, 0.45, 0, 28, [226, 214, 186], null);
    tent(c, 2.3, 2.25, 0.4, 6, 26, [232, 222, 196], T.m);
    if (c.det) {
      for (const [cu, cv] of [[2.35, 0.8], [0.75, 2.35]]) b.cyl(cu, cv, 0.46, 0, 4, M.flat(T.m), null, 12);
      b.cyl(1.72, 1.82, 0.12, 0, 2, M.stone([130, 126, 118], 2, 3), M.flat([50, 40, 36]), 8);
      b.decal([1.72, 1.82, 2], -2, -5, 5, 6, (i, j) => { const d = Math.abs(i - 2); return j < d * 2 ? null : j > 3 ? [240, 150, 40] : d === 0 ? [255, 226, 110] : [244, 180, 60]; });
      // lófarkas zászló (tug)
      b.line([1.55, 2.6, 0], [1.55, 2.6, 40], WOODD); b.decal([1.55, 2.6, 40], -1, -2, 3, 3, () => GOLD);
      b.decal([1.55, 2.6, 38], -2, 0, 5, 9, (i, j) => ((i + j) % 2 === 0 && j < 6 + (i % 3) ? [120, 40, 36] : null));
      flag(c, 1.1, 1.05, 51, 12, 12);
    }
  },
  vasarter(c) {
    const b = c.b, T = c.T;
    yard(c, 0.1, 0.1, 2.9, 2.9, [164, 146, 112]);
    const stall = (u0: number, v0: number, u1: number, v1: number, stripe: RGB, alongU: boolean): void => {
      for (const [u, v] of [[u0, v0], [u1, v0], [u0, v1], [u1, v1]]) b.line([u, v, 0], [u, v, 16], WOODD);
      const cm = c.stage >= 3 ? M.snow(M.canvas([236, 226, 200], stripe, 5), c.win, 0.3) : c.stage === 2 ? M.rafters(6) : NONE;
      if (alongU) b.quad([u0 - 0.06, v1 + 0.1, 12], [u1 - u0 + 0.12, 0, 0], [0, -(v1 - v0) - 0.16, 8], (u1 - u0) * 36, 20, cm);
      else b.quad([u1 + 0.1, v0 - 0.06, 12], [0, v1 - v0 + 0.12, 0], [-(u1 - u0) - 0.16, 0, 8], (v1 - v0) * 36, 20, cm);
      if (c.stage >= 2) b.box(u0 + 0.04, v0 + 0.04, u1 - 0.04, v1 - 0.04, 0, 6, M.planksV(), (s, t) => {
        const h = hash2(s / 3 | 0, t / 3 | 0, 44); return h < 0.25 ? [196, 70, 50] : h < 0.5 ? [220, 190, 90] : h < 0.7 ? [110, 150, 70] : [176, 142, 96];
      }, false);
      b.shadow([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], 16);
    };
    stall(0.35, 0.4, 1.25, 0.85, T.m, true); stall(1.65, 0.4, 2.55, 0.85, [214, 190, 110], true);
    stall(0.4, 1.35, 0.85, 2.3, [120, 150, 190], false); stall(2.1, 1.9, 2.7, 2.6, T.m, true);
    b.cyl(1.55, 1.6, 0.2, 0, 7, M.stone([160, 156, 146], 3, 5), M.dark(), 10);
    if (c.det) {
      b.line([1.37, 1.6, 0], [1.37, 1.6, 20], WOODD); b.line([1.73, 1.6, 0], [1.73, 1.6, 20], WOODD);
      b.gable(1.3, 1.45, 1.8, 1.75, 20, 27, 'u', 0.03, c.R(M.shingle(), false), null, false);
      barrel(c, 1.1, 2.55); barrel(c, 1.25, 2.68); crate(c, 1.45, 2.5, 0.2); crate(c, 2.6, 1.3, 0.18);
      // kordé
      b.box(1.2, 1.05, 1.75, 1.3, 4, 9, M.planksH([140, 108, 70], 2), M.hay(), false);
      b.decal([1.3, 1.3, 0], -3, -6, 6, 6, (i, j) => { const d = Math.hypot(i - 2.5, j - 2.5); return d < 3 && d > 1.4 ? [64, 50, 40] : d <= 1.4 ? [120, 96, 66] : null; });
      b.decal([1.68, 1.3, 0], -3, -6, 6, 6, (i, j) => { const d = Math.hypot(i - 2.5, j - 2.5); return d < 3 && d > 1.4 ? [64, 50, 40] : d <= 1.4 ? [120, 96, 66] : null; });
      flag(c, 2.75, 2.75, 0, 30, 12);
    }
  },
  istallo(c) {
    const b = c.b, wm = c.f === 2 ? plinth(M.planksV([128, 98, 64])) : c.f === 1 ? wallMain(c, 16) : M.planksV([128, 98, 64]);
    yard(c, 0.2, 1.3, 2.9, 2.9, [146, 126, 88]);
    hall(c, 0.3, 0.3, 2.7, 1.3, 16, 17, 'u', wm, roofPoor(c), 0.1);
    for (const u of [0.55, 1.3, 2.05]) { doorU(c, u, 1.3, 0.4, 12, M.dark()); c.b.wall(u, 1.3, u + 0.4, 1.3, 0, 6, DOORM, undefined, 0.015); }
    winV(c, 2.7, 0.7, 9, 0.2, 5);
    if (c.stage >= 2) fence(c, [[0.3, 1.45], [0.3, 2.75], [2.75, 2.75], [2.75, 1.45]], c.stage === 2 ? 6 : 9, false);
    if (c.det) {
      pix(c, [1.2, 2.15, 0], HORSE, HORSEP); pix(c, [2.2, 1.9, 0], HORSE, { ...HORSEP, B: [70, 56, 50], b: [52, 42, 40], h: [66, 52, 48] }, true);
      b.spire(b.ngon(0.7, 2.3, 0.3, 10), 0, 0.7, 2.3, 20, M.snow(M.hay(), c.win, 0.4));
      b.box(1.6, 2.5, 2.1, 2.64, 0, 4, M.planksH(), M.flat([70, 96, 120]));
      banner(c, 1.02, 1.3, 1.22, 1.3, 6, 15); flag(c, 2.7, 0.8, 24, 16, 11);
    }
  },
  kovacs(c) {
    const b = c.b, sm = M.stone(c.f === 1 ? [186, 170, 140] : STONEC, 5, 9);
    hall(c, 0.3, 0.3, 1.25, 1.65, 16, 13, 'v', sm, roofMain(c), 0.08);
    // nyitott szín elöl
    for (const [u, v] of [[1.85, 0.5], [1.85, 1.55]]) b.line([u, v, 0], [u, v, 13], WOODD, 2);
    b.quad([1.25, 0.42, 17], [0, 1.2, 0], [0.7, 0, -5], 43, 26, c.R(roofPoor(c)));
    b.shadow([[1.25, 0.42], [1.95, 0.42], [1.95, 1.62], [1.25, 1.62]], 14);
    doorV(c, 1.25, 0.8, 0.45, 12, (s, t) => (t < 5 && s > 4 && s < 12 ? (hash2(s | 0, t | 0, 3) < 0.5 ? [255, 190, 70] : [236, 120, 40]) : [34, 26, 26]));
    b.box(0.45, 0.5, 0.8, 0.85, 16, 46, sm, M.dark(), false);
    if (c.det) {
      b.decal([1.58, 1.05, 0], -3, -6, 7, 7, (i, j) => (j < 2 ? [84, 84, 92] : j < 3 ? (i > 0 && i < 6 ? [60, 60, 68] : null) : i > 1 && i < 5 ? [92, 70, 50] : null));
      barrel(c, 1.6, 1.42); crate(c, 1.45, 0.52, 0.14);
      b.decal([0.62, 0.68, 46], -2, -7, 6, 7, (i, j) => (hash2(i, j, 9) < 0.55 && Math.abs(i - 2 - (6 - j) * 0.3) < 2.4 ? [150, 146, 146] : null));
      flag(c, 0.78, 1.65, 29, 12, 9);
    }
  },
  dzsami(c) {
    const b = c.b, T = c.T, sc: RGB = [214, 202, 176], sm = M.stone(sc, 6, 11), lead = M.flat([122, 142, 136], 0.1);
    const leadR = c.stage >= 3 ? M.snow(lead, c.win, 0.45) : c.stage === 2 ? M.rafters(5) : NONE;
    yard(c, 0.15, 0.15, 2.9, 2.9, [176, 164, 136]);
    const win: Mat = (s, t) => { const p = (s + 9) % 20 - 10, a = arch(7, 13)(p + 3.5, t - 8); return a ?? sm(s, t); };
    b.box(0.45, 0.45, 2.15, 2.15, 0, 32, win, M.flat([186, 176, 152]));
    b.cyl(1.3, 1.3, 0.72, 32, 38, c.det ? M.flat(T.m, 0.1) : sm, M.flat([170, 162, 140]), 16);
    b.dome(1.3, 1.3, 0.7, 38, 26, leadR, 16, 6);
    // oszlopos előcsarnok
    const por: Mat = (s, t) => { const p = (s % 15) - 7.5, a = arch(11, 12)(p + 5.5, t); return a ?? sm(s, t); };
    b.box(0.45, 2.15, 2.15, 2.6, 0, 14, por, null);
    b.quad([0.42, 2.66, 13], [1.76, 0, 0], [0, -0.52, 6], 64, 20, leadR);
    // minaret
    b.cyl(2.5, 0.62, 0.15, 0, 72, M.stone([224, 214, 190], 6, 7), null, 10);
    b.cyl(2.5, 0.62, 0.23, 50, 54, M.flat([196, 186, 160]), M.flat([180, 170, 146]), 10);
    b.spire(b.ngon(2.5, 0.62, 0.17, 10), 72, 2.5, 0.62, 92, leadR);
    if (c.det) {
      for (const [u, v, z] of [[1.3, 1.3, 64], [2.5, 0.62, 92]] as V3[]) { b.line([u, v, z], [u, v, z + 5], GOLD); b.decal([u, v, z + 5], -1, -3, 3, 3, (i, j) => ((i === 1 && j === 1) || (j === 0 && i === 1) ? null : GOLD)); }
      banner(c, 0.62, 2.6, 0.8, 2.6, 2, 13); banner(c, 1.8, 2.6, 1.98, 2.6, 2, 13);
    }
  },
  toborzo(c) {
    const b = c.b;
    yard(c, 0.2, 1.3, 1.95, 1.95);
    hall(c, 0.3, 0.3, 1.65, 1.35, 18, 15, 'u', wallMain(c, 18), roofMain(c), 0.1);
    doorU(c, 0.85, 1.35, 0.2, 12); winU(c, 0.5, 1.35, 8, 0.12, 6); winU(c, 1.3, 1.35, 8, 0.12, 6); winV(c, 1.65, 0.7, 8, 0.14, 6);
    if (c.det) {
      b.box(0.45, 1.58, 1.15, 1.8, 0, 6, M.planksV([120, 90, 58], 3), M.flat([160, 126, 82]));
      b.box(0.55, 1.62, 0.75, 1.76, 6, 10, M.flat([150, 104, 50]), M.flat(GOLD), false);
      b.cyl(1.0, 1.69, 0.07, 6, 11, M.flat(c.T.m), M.flat([236, 226, 200]), 8);
      banner(c, 1.1, 1.35, 1.26, 1.35, 6, 17);
      flag(c, 1.72, 1.72, 0, 46, 17);
    }
  },
  agyuonto(c) {
    const b = c.b, sm = M.stone(STONEC, 6, 10), brick = M.stone([158, 96, 74], 3, 6);
    yard(c, 0.2, 1.5, 2.9, 2.9, [140, 124, 100]);
    hall(c, 0.3, 0.3, 2.05, 1.6, 22, 15, 'u', sm, roofMain(c), 0.08);
    doorU(c, 0.9, 1.6, 0.5, 16, arch(18, 16)); winU(c, 0.5, 1.6, 10, 0.12, 6); winU(c, 1.65, 1.6, 10, 0.12, 6);
    doorV(c, 2.05, 0.7, 0.4, 14, (s, t) => (t < 6 && s > 3 && s < 11 ? (hash2(s | 0, t | 0, 3) < 0.5 ? [255, 200, 80] : [240, 124, 40]) : [34, 26, 26]));
    b.prism([[2.2, 0.4], [2.75, 0.4], [2.75, 0.95], [2.2, 0.95]], 0, 62, brick, M.dark(), 0.35);
    if (c.det) {
      b.decal([2.47, 0.67, 62], -3, -9, 8, 9, (i, j) => (hash2(i, j, 11) < 0.55 && Math.abs(i - 3 - (8 - j) * 0.3) < 2.6 ? [130, 126, 128] : null));
      // elkészült csövek gerendákon
      b.box(0.5, 2.1, 1.5, 2.2, 0, 3, M.flat(WOODD), M.flat(WOOD), false); b.box(0.5, 2.5, 1.5, 2.6, 0, 3, M.flat(WOODD), M.flat(WOOD), false);
      for (const u of [0.65, 0.95, 1.25]) { b.line([u, 2.0, 5], [u, 2.72, 5], [186, 152, 78], 3); b.line([u, 2.0, 4], [u, 2.72, 4], [112, 90, 48], 3, 0.02); }
      pix(c, [2.3, 2.3, 0], CANNON, CANNONP);
      for (let i = 0; i < 6; i++) b.decal([2.0 + (i % 3) * 0.08, 2.72, 0], 0, -2 - (i > 2 ? 2 : 0), 2, 2, () => [48, 46, 52]);
      b.line([1.7, 1.75, 0], [1.9, 1.9, 30], WOODD, 2); b.line([2.1, 2.05, 0], [1.9, 1.9, 30], WOODD, 2); b.line([1.9, 1.9, 30], [1.9, 2.25, 24], WOOD, 2);
      flag(c, 1.17, 0.95, 37, 16, 12);
    }
  },
  bastya(c) {
    const b = c.b, sc: RGB = [176, 170, 156];
    const H = 34, sm = M.stone(sc, 6, 12), cord: Mat = (s, t) => (t > H - 6 && t < H - 2 ? [212, 206, 192] : t < 4 ? [128, 124, 116] : sm(s, t));
    const pts: [number, number][] = [[0.95, 0.2], [1.95, 0.2], [2.9, 2.9], [0.2, 1.95], [0.2, 0.95]];
    b.prism(pts, 0, H, cord, c.win ? M.flat([226, 232, 240], 0.05) : M.earth([132, 116, 84]), 0.13);
    const cxp = 1.24, cyp = 1.24, tp = pts.map(p => [p[0] + (cxp - p[0]) * 0.13, p[1] + (cyp - p[1]) * 0.13] as [number, number]);
    if (c.stage >= 2) b.prism(tp, H, H + 7, crenel(M.stone([188, 182, 168], 3, 8), 3, 12, 4), null, 0, false);
    if (c.det) {
      // ágyúk a lőréseknél, csövük a mellvéd fölé nyúlik
      const gun = (u: number, v: number, du: number, dv: number): void => {
        b.box(u - 0.09, v - 0.09, u + 0.09, v + 0.09, H, H + 5, M.flat(WOODD), M.flat(WOOD), false);
        b.line([u, v, H + 7], [u + du, v + dv, H + 8], [190, 158, 84], 3, 0.2); b.line([u, v, H + 6], [u + du, v + dv, H + 7], [118, 94, 50], 3, 0.19);
      };
      gun(1.75, 2.0, 0.1, 0.5); gun(0.9, 1.6, 0.0, 0.42); gun(2.0, 1.75, 0.5, 0.1); gun(1.6, 0.9, 0.42, 0.0);
      // figyelőtornyocska a csúcson
      b.cyl(2.5, 2.5, 0.13, H, H + 15, M.stone([196, 190, 176], 4, 6), null, 8);
      b.spire(b.ngon(2.5, 2.5, 0.17, 8), H + 14, 2.5, 2.5, H + 26, c.R(M.shingle([94, 104, 120]), false), false);
      b.decal([2.5, 2.5, H + 8], 2, -3, 2, 4, () => [36, 30, 32], 0.3);
      // lőporos ház a toroknál
      b.box(0.6, 0.6, 1.15, 1.15, H, H + 10, M.stone([190, 184, 170], 4, 8), M.dark(), false);
      b.pyramid(0.6, 0.6, 1.15, 1.15, H + 10, H + 22, c.R(M.shingle([94, 104, 120])), 0.06, false);
      b.wall(0.8, 1.15, 0.94, 1.15, H, H + 8, M.dark(), undefined, 0.012);
      flag(c, 1.35, 1.35, H, 36, 16);
    }
  },
  szanto(c) {
    const b = c.b, st = c.o.farm ?? 0, se = c.o.season, W = 2.84 * 36;
    const soil: RGB[] = se === 3 ? [[214, 220, 230], [236, 240, 246]] : [[104, 78, 52], [132, 102, 70]];
    const done = c.stage >= 3;
    b.top(0.08, 0.08, 2.92, 2.92, 0, (s, t) => {
      const e = Math.min(s, t, W - s, W - t), n = hash2(s | 0, t | 0, 70);
      if (e < 4 && n > e / 4) return null;
      const row = Math.floor(t / 3) & 1, k = 0.9 + n * 0.2;
      if (!done) { if (c.stage === 0 || (c.stage === 1 && s > W * 0.45) || (c.stage === 2 && s > W * 0.8)) return n < 0.5 ? null : [soil[0][0] * k, soil[0][1] * k, soil[0][2] * k]; }
      const base = soil[row];
      if (done && st === 1 && se !== 3 && row && hash2(s / 2 | 0, t | 0, 71) < 0.8) return [86 * k, 150 * k, 60 * k];
      if (done && st === 0 && se !== 3 && hash2(s | 0, t | 0, 72) < 0.05) return [176, 152, 96];
      return [base[0] * k, base[1] * k, base[2] * k];
    }, 1, -0.6);
    if (done && st === 2) {
      const wheat: Mat = (s, t) => { const n = hash2(s | 0, t / 2 | 0, 73); return se === 3 ? [220 + n * 20, 222 + n * 16, 214] : [200 + n * 44, 160 + n * 44, 56 + n * 30]; };
      const side: Mat = (s, t) => (hash2(s | 0, 0, 74) < 0.2 && t > 3 ? null : wheat(s, t * 3));
      b.wall(0.2, 2.8, 2.8, 2.8, 0, 6, side, 0.92); b.wall(2.8, 0.2, 2.8, 2.8, 0, 6, side, 0.7);
      b.top(0.2, 0.2, 2.8, 2.8, 6, (s, t) => { const n = hash2(s | 0, t | 0, 75), r = Math.floor(t / 3) & 1; const k = (r ? 1.04 : 0.9) + n * 0.12; return se === 3 ? [226 * k, 228 * k, 220 * k] : [214 * k, 176 * k, 66 * k]; }, 1);
    }
    if (c.stage >= 1) for (const [u, v] of [[0.1, 0.1], [2.9, 0.1], [2.9, 2.9], [0.1, 2.9]]) { b.line([u, v, 0], [u, v, 8], WOODD, 2); if (done) b.decal([u, v, 8], 0, -2, 2, 3, () => c.T.m); }
    if (done && st > 0 && se !== 3) { // madárijesztő
      b.line([1.5, 1.5, 0], [1.5, 1.5, 20], WOODD); b.line([1.32, 1.5, 15], [1.68, 1.5, 15], WOODD);
      b.decal([1.5, 1.5, 20], -1, -3, 3, 3, () => [214, 186, 120]); b.decal([1.5, 1.5, 14], -2, 0, 5, 6, (i, j) => (j > 3 && i === 2 ? null : [150, 90, 60]));
    }
  },
  var(c) {
    const b = c.b, H = 22, pal = M.palisade(H + 5, true, [126, 94, 58], c.f === 1 ? [196, 170, 124] : c.f === 2 ? [190, 180, 160] : [186, 160, 116]);
    const walk = c.win ? M.flat([222, 228, 238], 0.05) : M.planksV([150, 120, 82], 3);
    yard(c, 0.25, 0.25, 3.75, 3.75, [150, 128, 92]);
    const run = (u0: number, v0: number, u1: number, v1: number): void => {
      b.wall(u0, v0, u1, v0, H, H + 5, pal); b.wall(u0, v0, u0, v1, H, H + 5, pal);
      b.box(u0, v0, u1, v1, 0, H + 5, pal, null); b.top(u0, v0, u1, v1, H, walk);
    };
    run(0.6, 0.38, 3.4, 0.66); run(0.38, 0.6, 0.66, 3.4); // hátsó falak
    // öregtorony (kő)
    const km = M.stone(c.f === 1 ? [190, 178, 150] : STONEC, 6, 11), KH = 62;
    const kwin: Mat = (s, t) => ((t > 22 && t < 30 || t > 44 && t < 52) && Math.abs((s % 20) - 10) < 1.6 ? [34, 28, 30] : km(s, t));
    b.box(1.0, 0.95, 2.05, 2.0, 0, KH, kwin, M.dark());
    b.box(0.9, 0.85, 2.15, 2.1, KH, KH + 10, (s, t) => (t > 3 && t < 8 && (s % 8) > 2.5 && (s % 8) < 5.5 ? [38, 30, 30] : M.planksV([118, 86, 54], 3)(s, t)), M.dark());
    if (c.f === 1) b.spire(b.ngon(1.525, 1.475, 0.86, 12, Math.PI / 4), KH + 9, 1.525, 1.475, KH + 40, c.R(M.flat([122, 142, 136], 0.1), false));
    else b.pyramid(0.9, 0.85, 2.15, 2.1, KH + 10, KH + 38, c.R(roofMain(c)), 0.08);
    doorU(c, 1.4, 2.0, 0.22, 13, arch(8, 13));
    // palota-szárny és istálló
    hall(c, 2.3, 0.95, 3.15, 2.3, 16, 14, 'v', wallMain(c, 16), roofMain(c), 0.08);
    doorU(c, 2.62, 2.3, 0.18, 11); winV(c, 3.15, 1.3, 7, 0.12, 5); winV(c, 3.15, 1.75, 7, 0.12, 5);
    if (c.f === 1) tent(c, 1.3, 2.75, 0.4, 5, 24, [232, 222, 196], c.T.m);
    else { hall(c, 0.9, 2.4, 1.7, 3.0, 11, 10, 'u', M.planksV([128, 98, 64]), roofPoor(c), 0.06); doorU(c, 1.15, 3.0, 0.3, 8, M.dark()); }
    if (c.det) {
      b.cyl(2.45, 2.85, 0.15, 0, 6, M.stone([150, 146, 136], 3, 5), M.dark(), 8);
      b.line([2.3, 2.85, 0], [2.3, 2.85, 17], WOODD); b.line([2.3, 2.85, 17], [2.62, 2.85, 14], WOODD);
      crate(c, 2.95, 2.75); barrel(c, 3.05, 2.5); barrel(c, 1.95, 2.95);
    }
    // elülső falak és kaputorony
    run(3.34, 0.6, 3.62, 3.4);
    run(0.6, 3.34, 1.55, 3.62); run(2.45, 3.34, 3.4, 3.62);
    const GH = 34;
    b.box(1.55, 3.2, 2.45, 3.78, 0, GH, M.palisade(GH + 4, true, [122, 90, 56]), null);
    b.wall(1.78, 3.78, 2.22, 3.78, 0, 20, arch(16, 20), undefined, 0.012);
    b.box(1.47, 3.12, 2.53, 3.86, GH, GH + 10, (s, t) => (t > 3 && t < 8 && (s % 9) > 3 && (s % 9) < 6.5 ? [38, 30, 30] : M.planksV([124, 92, 58], 3)(s, t)), M.dark());
    b.gable(1.47, 3.12, 2.53, 3.86, GH + 10, GH + 26, 'u', 0.08, c.R(roofMain(c)), M.planksV([118, 88, 56], 3));
    if (c.det) {
      b.top(1.8, 3.78, 2.2, 4.0, 1, M.planksH([140, 108, 70], 3), 1, 0.01);
      b.wall(1.72, 3.78, 1.8, 3.9, 0, 18, DOORM); b.wall(2.2, 3.78, 2.28, 3.9, 0, 18, DOORM);
      banner(c, 1.86, 3.86, 2.14, 3.86, GH - 11, GH + 3);
    }
    // sarokrondellák
    const rond = (cu: number, cv: number, cap: boolean): void => {
      b.cyl(cu, cv, 0.5, 0, H + 8, M.palisade(H + 8, true, [124, 92, 56]), null, 14);
      b.cyl(cu, cv, 0.47, 0, H + 3, NONE, c.win ? M.flat([222, 228, 238], 0.05) : M.earth(), 14);
      if (cap) b.spire(b.ngon(cu, cv, 0.58, 14), H + 7, cu, cv, H + 32, c.R(roofMain(c)));
      else if (c.det) { pix(c, [cu, cv, H + 3], CANNON, CANNONP); }
    };
    rond(0.6, 0.6, true); rond(3.4, 0.6, true); rond(0.6, 3.4, true); rond(3.4, 3.4, false);
    if (c.det) {
      flag(c, 1.525, 1.475, KH + (c.f === 1 ? 40 : 38), 22, 18);
      flag(c, 3.4, 0.6, H + 32, 10, 9); flag(c, 0.6, 3.4, H + 32, 10, 9);
      flag(c, 3.25, 3.25, H + 3, 20, 11);
    }
  },
};

function wallPiece(c: C, stone: boolean): void {
  const b = c.b, m = c.o.mask ?? 0, H = Math.round((stone ? 26 : 21) * (c.stage === 1 ? 0.4 : c.stage === 2 ? 0.72 : 1)), th = stone ? 0.22 : 0.17, lo = 0.5 - th, hi = 0.5 + th, X = stone ? 5 : 5;
  const sm = stone ? crenel(M.stone(c.f === 1 ? [186, 176, 152] : STONEC, 6, 11), H, 9, 4) : M.palisade(H + X, true);
  const topM = c.win ? M.flat([224, 230, 240], 0.05) : stone ? M.flat([150, 146, 138], 0.1) : M.earth([138, 112, 78]);
  const seg = (u0: number, v0: number, u1: number, v1: number, h: number): void => {
    b.wall(u0, v0, u1, v0, h, h + X, sm); b.wall(u0, v0, u0, v1, h, h + X, sm);
    b.wall(u0, v1, u1, v1, 0, h + X, sm); b.wall(u1, v0, u1, v1, 0, h + X, sm);
    b.top(u0, v0, u1, v1, h, topM);
    b.shadow([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], h);
  };
  const N = m & 1, E = m & 2, S = m & 4, Wb = m & 8;
  const straight = (N && S && !E && !Wb) || (E && Wb && !N && !S);
  if (straight) { if (N) seg(lo, 0, hi, 1, H); else seg(0, lo, 1, hi, H); return; }
  if (N) seg(lo, 0, hi, lo, H);
  if (Wb) seg(0, lo, lo, hi, H);
  if (S) seg(lo, hi, hi, 1, H);
  if (E) seg(hi, lo, 1, hi, H);
  // csomópont: vastagabb, kissé magasabb pillér
  const e = 0.04;
  if (stone) seg(lo - e, lo - e, hi + e, hi + e, H + 4);
  else {
    b.cyl(0.5, 0.5, th + 0.08, 0, H + X + 3, M.palisade(H + X + 3, true), null, 10);
    b.cyl(0.5, 0.5, th + 0.05, 0, H + 2, NONE, topM, 10);
  }
}

function gate(c: C, stone: boolean): void {
  // lábnyom 1×2: a falvonal a v tengely mentén fut, az átjáró az u tengely irányú
  const b = c.b, H = stone ? 34 : 30, th = stone ? 0.24 : 0.2, lo = 0.5 - th, hi = 0.5 + th;
  const sm: Mat = stone ? M.stone(c.f === 1 ? [186, 176, 152] : STONEC, 6, 11) : M.palisade(H + 3, true);
  const up = stone ? crenel(M.stone(STONEC, 6, 11), 5, 9, 4) : M.planksV([124, 92, 58], 3);
  for (const v0 of [0, 1.48]) b.box(lo - 0.06, v0, hi + 0.06, v0 + 0.52, 0, H, sm, M.dark());
  // áthidalás a nyílás fölött
  b.box(lo, 0.52, hi, 1.48, 20, H, stone ? M.stone(STONEC, 6, 11) : M.planksH([118, 88, 56], 4), M.dark(), false);
  b.wall(hi, 0.52, hi, 1.48, 0, 20, M.dark(), 1, -0.3);
  if (stone) b.wall(hi, 0.52, hi, 1.48, 14, 20, (s, t) => { const x = s - 17.3; return x * x / 300 + (t + 2) * (t + 2) / 50 < 1 ? null : M.stone(STONEC, 6, 11)(s, t + 14); }, undefined, 0.01);
  if (stone) {
    b.box(lo - 0.1, -0.02, hi + 0.1, 2.02, H, H + 9, up, M.flat([150, 146, 138], 0.1), false);
    if (c.stage >= 3) b.pyramid(lo, 0.55, hi, 1.45, H + 5, H + 18, c.R(roofMain(c)), 0.04, false);
  } else {
    b.box(lo - 0.1, -0.02, hi + 0.1, 2.02, H, H + 8, (s, t) => (t > 2.5 && t < 6.5 && (s % 9) > 3 && (s % 9) < 6.5 ? [38, 30, 30] : up(s, t)), M.dark(), false);
    b.gable(lo - 0.1, -0.02, hi + 0.1, 2.02, H + 8, H + 20, 'v', 0.08, c.R(roofMain(c)), M.planksV([118, 88, 56], 3), false);
  }
  b.shadow([[lo, 0], [hi, 0], [hi, 2], [lo, 2]], H + 6);
  if (c.det) {
    b.wall(hi, 0.52, hi + 0.2, 0.62, 0, 19, DOORM); b.wall(hi, 1.48, hi + 0.2, 1.38, 0, 19, DOORM);
    banner(c, hi + 0.1, 0.82, hi + 0.1, 1.18, H - 9, H + 5);
    flag(c, 0.5, 1.0, H + (stone ? 18 : 20), 10, 9);
  }
}

const ZMAX: Record<string, number> = {
  var: 136, haz: 52, szanto: 26, malom: 68, fatelep: 44, kobanya: 46, karam: 34, kaszarnya: 66, ortorony: 96, palank: 36, palank_kapu: 66,
  rev: 48, strazsa: 84, satortabor: 70, vasarter: 50, istallo: 50, kovacs: 60, dzsami: 104, toborzo: 66, kofal: 40, ko_kapu: 70, agyuonto: 80, bastya: 84,
};
// az 1. építési fázis falmagassága
const CUT: Record<string, number> = {
  var: 20, haz: 10, malom: 10, fatelep: 11, kobanya: 8, karam: 7, kaszarnya: 13, ortorony: 28, palank: 13, palank_kapu: 18, rev: 10, strazsa: 25,
  satortabor: 10, vasarter: 11, istallo: 10, kovacs: 11, dzsami: 21, toborzo: 11, kofal: 15, ko_kapu: 21, agyuonto: 14, bastya: 18, szanto: 99,
};
const FULLH: Record<string, number> = { var: 34, ortorony: 54, strazsa: 40, dzsami: 34, bastya: 38, agyuonto: 24, palank_kapu: 32, ko_kapu: 36 };

function foundation(c: C, w: number, h: number): void {
  const b = c.b;
  yard(c, 0.06, 0.06, w - 0.06, h - 0.06, [134, 108, 76]);
  const peg: RGB = [196, 168, 116];
  for (const [u, v] of [[0.1, 0.1], [w - 0.1, 0.1], [w - 0.1, h - 0.1], [0.1, h - 0.1]]) b.line([u, v, 0], [u, v, 7], peg, 2);
  if (c.stage === 0) {
    const cord: RGB = [226, 214, 180];
    b.line([0.1, h - 0.1, 5], [w - 0.1, h - 0.1, 5], cord); b.line([w - 0.1, 0.1, 5], [w - 0.1, h - 0.1, 5], cord);
    b.line([0.1, 0.1, 5], [w - 0.1, 0.1, 5], cord, 1, -0.5); b.line([0.1, 0.1, 5], [0.1, h - 0.1, 5], cord, 1, -0.5);
    if (w + h > 2) {
      const lm = M.logs([146, 110, 68], 3);
      b.box(w * 0.3, h * 0.42, w * 0.3 + 0.55, h * 0.42 + 0.3, 0, 6, lm, M.logs([158, 122, 78], 3));
      b.box(w * 0.62, h * 0.6, w * 0.62 + 0.3, h * 0.6 + 0.26, 0, 5, M.stone([176, 172, 162], 3, 5), M.flat([196, 192, 182], 0.1));
    }
  }
}
function scaffold(c: C, w: number, h: number, top: number): void {
  const b = c.b, col: RGB = [176, 142, 94], dk: RGB = [128, 100, 66], m = 0.1;
  const side = (u0: number, v0: number, u1: number, v1: number): void => {
    const L = Math.hypot(u1 - u0, v1 - v0), n = Math.max(1, Math.round(L / 0.55));
    for (let i = 0; i <= n; i++) { const u = u0 + (u1 - u0) * i / n, v = v0 + (v1 - v0) * i / n; b.line([u, v, 0], [u, v, top + 4], dk, 1, 0.3); }
    for (let z = 9; z <= top; z += 10) b.line([u0, v0, z], [u1, v1, z], col, 1, 0.3);
    b.line([u0, v0, 0], [u0 + (u1 - u0) / n, v0 + (v1 - v0) / n, Math.min(top, 19)], dk, 1, 0.3);
  };
  side(m, h - m, w - m, h - m); side(w - m, m, w - m, h - m);
}

const cache = new Map<string, Sprite>();
export function buildingSprite(id: string, opts: BuildingSpriteOpts): Sprite {
  const def = BUILDINGS[id];
  const win = opts.season === 3, isWall = id === 'palank' || id === 'kofal';
  const key = [id, opts.faction, opts.team, id === 'szanto' ? opts.season : win ? 3 : 0, opts.stage, opts.rot ?? 0, isWall ? opts.mask ?? 0 : 0,
    id === 'szanto' ? opts.farm ?? 0 : 0, id === 'karam' ? opts.cattle ?? 0 : 0].join('|');
  let sp = cache.get(key);
  if (sp) return sp;
  const w = def ? def.w : 1, h = def ? def.h : 1, rec = R[id] ?? R.haz;
  const b = Buf.forFoot(w, h, ZMAX[id] ?? 60);
  const T = TEAM[opts.team] ?? TEAM[4], stage = opts.stage;
  const c: C = {
    b, id, f: opts.faction, T, win, stage, det: stage >= 3, o: opts,
    R: (m, trim = true) => stage >= 3 ? M.snow(trim ? M.trim(m, T.m, 2.2) : m, win) : stage === 2 ? M.rafters(5) : NONE,
  };
  if (id === 'szanto') rec(c);
  else if (stage === 0) foundation(c, w, h);
  else {
    if (stage < 3 && !isWall) foundation(c, w, h);
    if (stage === 1 && !isWall) b.clipZ = CUT[id] ?? 8;
    rec(c);
    b.clipZ = Infinity;
    if (stage < 3 && !isWall && id !== 'karam') scaffold(c, w, h, stage === 1 ? (CUT[id] ?? 8) + 6 : (FULLH[id] ?? 20));
  }
  sp = b.finish(w / 2, h / 2);
  if (opts.rot) {
    const f = mk(sp.c.width, sp.c.height), g = g2(f);
    g.translate(sp.c.width, 0); g.scale(-1, 1); g.drawImage(sp.c, 0, 0);
    sp = { c: f, ax: sp.c.width - sp.ax, ay: sp.ay };
  }
  cache.set(key, sp);
  return sp;
}

const rubbleCache = new Map<number, Sprite>();
export function rubbleSprite(w: number, h: number): Sprite {
  const key = w * 8 + h;
  let sp = rubbleCache.get(key);
  if (sp) return sp;
  const b = Buf.forFoot(w, h, 16), r = rng(900 + key);
  const W = (w - 0.12) * 36, H = (h - 0.12) * 36;
  b.top(0.06, 0.06, w - 0.06, h - 0.06, 0, (s, t) => {
    const e = Math.min(s, t, W - s, H - t), n = hash2(s | 0, t | 0, 90);
    if (e < 10 && n > e / 10) return null;
    const k = 0.8 + hash2(s >> 1, t >> 1, 91) * 0.3;
    return hash2(s >> 2, t >> 2, 92) < 0.3 ? [70 * k, 62 * k, 58 * k] : [128 * k, 108 * k, 82 * k];
  }, 1, -0.6);
  const n = Math.round(w * h * 5) + 2;
  for (let i = 0; i < n; i++) {
    const u = 0.2 + r() * (w - 0.6), v = 0.2 + r() * (h - 0.6), s = 0.1 + r() * 0.22, k = r();
    if (k < 0.5) b.box(u, v, u + s, v + s * (0.6 + r() * 0.6), 0, 2 + r() * 6, M.stone([118 + r() * 30, 114 + r() * 26, 108 + r() * 20], 3, 5), M.flat([146, 142, 134], 0.12));
    else if (k < 0.8) b.line([u, v, 0], [u + (r() - 0.3) * 0.6, v + (r() - 0.3) * 0.6, 2 + r() * 10], [56, 44, 38], 2);
    else b.box(u, v, u + s * 2, v + 0.07, 0, 3, M.flat([74, 58, 46]), M.flat([92, 72, 54]), false);
  }
  sp = b.finish(w / 2, h / 2);
  rubbleCache.set(key, sp);
  return sp;
}
