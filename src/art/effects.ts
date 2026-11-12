// Effektek (tűz, füst, robbanás, torkolatfüst, lövedék, por, csobbanás, találat) és zászló.
import type { Sprite, FxKind, Team } from './api';
import { RGB, TEAM, hash2, shade } from './pal';
import { Buf, vnoise } from './units';

export const FX_FRAMES: Record<FxKind, number> = { tuz: 8, fust: 8, robbanas: 10, loves: 6, golyo: 1, por: 6, csobbanas: 6, talalat: 4 };

const cache = new Map<string, Sprite>();

/** Zajos szélű pamacs; alpha ≤ 255, a széle felé lépcsősen halványul. */
function puff(b: Buf, cx: number, cy: number, r: number, c: RGB, alpha: number, seed: number): void {
  const lt = shade(c, 1.2), dk = shade(c, 0.7);
  for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const n = vnoise(x / 3.2, y / 3.2, 16, 16, seed);
    const d = Math.hypot(dx, dy) / (r * (0.7 + 0.6 * n));
    if (d > 1) continue;
    const s = (-dx * 0.7 - dy * 0.75) / r + (n - 0.5) * 0.5;
    const a = alpha * (d < 0.55 ? 1 : d < 0.8 ? 0.7 : 0.4);
    b.blend(x, y, s > 0.25 ? lt : s < -0.3 ? dk : c, Math.min(255, a));
  }
}

function make(kind: FxKind, f: number): Sprite {
  switch (kind) {
    case 'tuz': {
      const W = 20, H = 28, b = new Buf(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = (x + 0.5 - 10) / 10, v = (27.5 - y) / 28;
        const base = 1.05 - v * 1.1 - Math.pow(Math.abs(u) / (1.0 - 0.72 * v), 2) * 0.85;
        const n = vnoise(x / 4, (y + f * 3) / 4, 5, 6, 3);
        const I = base + (n - 0.5) * 0.95 * (0.3 + v);
        const c: RGB | null = I > 0.78 ? [255, 246, 196] : I > 0.58 ? [255, 212, 84] : I > 0.4 ? [246, 144, 38] : I > 0.24 ? [208, 72, 26] : I > 0.14 ? [132, 38, 22] : null;
        if (c) b.set(x, y, c);
      }
      return { c: b.canvas(), ax: 10, ay: 27 };
    }
    case 'fust': {
      const b = new Buf(32, 44), t = f / 8;
      puff(b, 16 + Math.sin(f * 0.9) * 2, 38 - f * 3.6, 4 + f * 1.25, [92, 88, 86], 210 * (1 - t * 0.85), 11 + f);
      puff(b, 14 + Math.cos(f * 0.7) * 2, 41 - f * 2.6, 3 + f * 0.9, [70, 66, 66], 190 * (1 - t), 31 + f);
      return { c: b.canvas(), ax: 16, ay: 42 };
    }
    case 'robbanas': {
      const b = new Buf(64, 64), t = f / 9, cx = 32, cy = 46;
      if (f >= 2) {
        puff(b, cx, cy - 4 - f * 2.4, 7 + f * 2, [74, 68, 64], 235 * Math.pow(1 - t, 1.1), 50 + f);
        puff(b, cx - 6 + f * 0.4, cy - 2 - f * 1.4, 5 + f * 1.3, [98, 90, 84], 215 * Math.pow(1 - t, 1.2), 70 + f);
        puff(b, cx + 7, cy - 3 - f * 1.7, 4 + f * 1.2, [60, 56, 56], 215 * Math.pow(1 - t, 1.2), 90 + f);
      }
      const fr = [6, 11, 14, 13, 10, 6, 3, 0, 0, 0][f], fy = cy - 3 - f * 0.9;
      if (fr > 0) for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - fy) * 1.15) / fr + (vnoise(x / 3, y / 3, 20, 20, 5 + f) - 0.5) * 0.55;
        const hot = f < 2 ? 0.25 : 0;
        const c: RGB | null = d < 0.35 + hot ? [255, 250, 214] : d < 0.6 + hot ? [255, 214, 90] : d < 0.85 ? [244, 140, 40] : d < 1 ? [196, 64, 26] : null;
        if (c) b.set(x, y, c);
      }
      for (let i = 0; i < 14; i++) {
        const a = hash2(i, 1, 9) * Math.PI - Math.PI, sp = 2.2 + hash2(i, 2, 9) * 3.2;
        const px = cx + Math.cos(a) * sp * f * 1.3, py = cy - 2 + Math.sin(a) * sp * f * 1.5 + 0.55 * f * f;
        if (f >= 1 && f <= 7 && py < cy + 3) { const c: RGB = hash2(i, 3, 9) > 0.5 ? [84, 60, 40] : [52, 40, 34]; b.set(px, py, c); if (hash2(i, 4, 9) > 0.4) b.set(px + 1, py, c); if (hash2(i, 5, 9) > 0.6) b.set(px, py + 1, c); }
      }
      return { c: b.canvas(), ax: 32, ay: 48 };
    }
    case 'loves': {
      const b = new Buf(24, 24);
      if (f === 0) { b.ell(12, 13, 3.6, 3.2, [255, 222, 110], true); b.ell(12, 13, 1.8, 1.6, [255, 252, 226], true); }
      else puff(b, 12 + f * 0.3, 13 - f * 1.3, 2.6 + f * 1.25, [222, 220, 212], 230 * (1 - (f - 1) / 5.5), 20 + f);
      return { c: b.canvas(), ax: 12, ay: 13 };
    }
    case 'golyo': {
      const b = new Buf(7, 7); b.ell(3.5, 3.5, 2.6, 2.6, [70, 72, 84]); b.set(2, 2, [190, 194, 206]); b.outline(0.35);
      return { c: b.canvas(), ax: 3, ay: 3 };
    }
    case 'por': {
      const b = new Buf(36, 24), t = f / 6;
      puff(b, 14 - f, 18 - f * 1.2, 3 + f * 1.3, [176, 152, 112], 200 * (1 - t), 40 + f);
      puff(b, 22 + f, 19 - f * 0.9, 2.5 + f * 1.1, [160, 136, 100], 180 * (1 - t), 44 + f);
      return { c: b.canvas(), ax: 18, ay: 20 };
    }
    case 'csobbanas': {
      const b = new Buf(36, 40), cx = 18, cy = 32, h = [6, 15, 21, 16, 8, 2][f], a = f >= 4 ? 170 : 255;
      const W1: RGB = [240, 248, 252], W2: RGB = [176, 212, 236];
      const rx = 4 + f * 2.1, ry = rx * 0.45;
      for (let i = 0; i < 48; i++) { const an = i / 48 * Math.PI * 2; if (hash2(i, f, 2) > 0.25) b.blend(cx + Math.cos(an) * rx, cy + Math.sin(an) * ry, an > 0 && an < Math.PI ? W1 : W2, a); }
      for (let y = 0; y < h; y++) {
        const k = y / Math.max(1, h), w = (1 - k * k) * (2.6 + f * 0.5) + 0.4;
        for (let x = -Math.ceil(w); x <= w; x++) if (Math.abs(x) <= w && hash2(x + 9, y, f) > 0.18 * k * 3) b.blend(cx + x, cy - y, x < 0 ? W1 : W2, a);
      }
      for (let i = 0; i < 9; i++) {
        const vx = (hash2(i, 5, 4) - 0.5) * 3.4, vy = 3 + hash2(i, 6, 4) * 2.4;
        const px = cx + vx * f, py = cy - 2 - vy * f + 0.62 * f * f;
        if (f >= 1 && py < cy) b.blend(px, py, W1, a);
      }
      return { c: b.canvas(), ax: 18, ay: 32 };
    }
    case 'talalat': {
      const b = new Buf(14, 14), r = [1.5, 3, 4.8, 5.6][f];
      if (f === 0) { b.ell(7, 7, 2.2, 2.2, [255, 244, 190], true); }
      for (let i = 0; i < 9; i++) {
        const an = i / 9 * Math.PI * 2 + 0.4, rr = r * (0.6 + hash2(i, f, 6) * 0.5);
        if (f > 0 && hash2(i, 9, f) > f * 0.2) b.set(7 + Math.cos(an) * rr, 7 + Math.sin(an) * rr, i % 3 === 0 ? [255, 226, 120] : i % 3 === 1 ? [196, 44, 36] : [140, 28, 28]);
      }
      return { c: b.canvas(), ax: 7, ay: 7 };
    }
  }
}

export function fxSprite(kind: FxKind, frame: number): Sprite {
  const n = FX_FRAMES[kind];
  frame = ((frame % n) + n) % n;
  const key = kind + frame;
  let s = cache.get(key);
  if (!s) { s = make(kind, frame); cache.set(key, s); }
  return s;
}

/** Kis lobogó zászló rúdon; horgony a rúd töve. */
export function flagSprite(team: Team, frame: number): Sprite {
  frame &= 3;
  const key = 'flag' + team + frame;
  let s = cache.get(key);
  if (!s) {
    const T = TEAM[team], b = new Buf(26, 32);
    for (let y = 4; y <= 30; y++) { b.set(3, y, [164, 122, 76]); b.set(4, y, [96, 68, 44]); }
    b.ell(4, 3, 1.6, 1.6, [226, 186, 74], true);
    for (let x = 0; x < 16; x++) {
      const k = x / 15, ph = k * Math.PI * 2 - frame * Math.PI / 2;
      const top = 5 + Math.round(Math.sin(ph) * 1.6 * k), sl = Math.cos(ph);
      for (let y = 0; y < 10; y++) {
        if (x > 11 && Math.abs(y - 4.5) < (x - 11) * 0.9) continue; // fecskefarok
        const c = y >= 4 && y <= 5 ? T.l : sl > 0.4 ? shade(T.m, 1.15) : sl < -0.4 ? T.d : T.m;
        b.set(5 + x, top + y, c);
      }
    }
    b.outline(0.35);
    s = { c: b.canvas(), ax: 4, ay: 31 };
    cache.set(key, s);
  }
  return s;
}
