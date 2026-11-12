// Kezelőfelületi grafika: felülettextúrák, szegélymotívumok, ikonok, címerek, egérmutatók.
import type { FactionIdx } from './api';
import { mk, g2, RGB, shade, hash2, mix } from './pal';
import { Buf, vnoise, unitSprite } from './units';

const cache = new Map<string, HTMLCanvasElement>();
function cached(key: string, f: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = cache.get(key);
  if (!c) { c = f(); cache.set(key, c); }
  return c;
}
const cl = (v: number) => v < 0 ? 0 : v > 255 ? 255 : v;
const mul = (c: RGB, k: number): RGB => [cl(c[0] * k), cl(c[1] * k), cl(c[2] * k)];

// ---------------------------------------------------------------- textúrák
export function uiTexture(kind: 'fa' | 'ko' | 'pergamen' | 'vas', w: number, h: number): HTMLCanvasElement {
  w = Math.max(4, w | 0); h = Math.max(4, h | 0);
  return cached('tx' + kind + w + 'x' + h, () => {
    const b = new Buf(w, h);
    const pn = (x: number, y: number, cw: number, ch: number, s: number) => {
      const nx = Math.max(1, Math.round(w / cw)), ny = Math.max(1, Math.round(h / ch));
      return vnoise(x * nx / w, y * ny / h, nx, ny, s);
    };
    if (kind === 'fa') {
      const np = Math.max(1, Math.round(h / 22)), ph = h / np;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const pi = Math.floor(y / ph), ly = y - pi * ph;
        const g = pn(x + pi * 37, y, 34, 2.2, 3 + pi) * 0.6 + pn(x, y, 9, 1.4, 9) * 0.4;
        let k = 0.78 + g * 0.42 + (hash2(pi, 5, 2) - 0.5) * 0.16;
        const kn = pn(x + pi * 91, y, 16, ph / 2.5, 21 + pi); if (kn > 0.93) k *= 0.7;
        if (ly < 1) k *= 0.5; else if (ly < 2) k *= 1.18; else if (ly >= ph - 1) k *= 0.7;
        const jx = Math.floor(hash2(pi, 8, 4) * w); if (x === jx) k *= 0.55;
        b.set(x, y, mul([96, 66, 40], k));
      }
    } else if (kind === 'ko') {
      const nr = Math.max(1, Math.round(h / 16)), rh = h / nr, nb = Math.max(1, Math.round(w / 30)), bw = w / nb;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const row = Math.floor(y / rh), ly = y - row * rh, xo = (x + (row % 2) * bw / 2) % w, bi = Math.floor(xo / bw), lx = xo - bi * bw;
        let k = 0.86 + (hash2(bi, row, 6) - 0.5) * 0.2 + (pn(x, y, 5, 5, 7) - 0.5) * 0.2 + (hash2(x, y, 3) - 0.5) * 0.07;
        if (ly < 1 || lx < 1) k *= 0.52; else if (ly < 2 || lx < 2) k *= 1.16; else if (ly >= rh - 1 || lx >= bw - 1) k *= 0.76;
        b.set(x, y, mul([122, 118, 110], k));
      }
    } else if (kind === 'pergamen') {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const bl = pn(x, y, 42, 42, 4) * 0.6 + pn(x, y, 14, 14, 8) * 0.4;
        const k = 0.9 + bl * 0.16 + (hash2(x, y, 5) - 0.5) * 0.04;
        const st = pn(x, y, 70, 70, 12) > 0.72 ? 0.95 : 1;
        b.set(x, y, [cl(232 * k * st), cl(212 * k * st), cl(170 * k * st * (0.96 + bl * 0.06))]);
      }
    } else {
      const nx = Math.max(1, Math.round(w / 32)), ny = Math.max(1, Math.round(h / 32)), cw = w / nx, ch = h / ny;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let k = 0.84 + pn(x, y, 6, 6, 3) * 0.26 + (hash2(x, y, 9) - 0.5) * 0.06 + (pn(x, y, 30, 4, 5) - 0.5) * 0.1;
        const lx = (x % cw) - cw / 2, ly = (y % ch) - ch / 2, d = Math.hypot(lx, ly);
        let c: RGB = [72, 74, 84];
        if (d < 2.6) { c = [120, 124, 136]; k = lx + ly < -0.8 ? 1.35 : lx + ly > 1.2 ? 0.6 : 1; }
        else if (d < 3.6) k *= 0.6;
        b.set(x, y, mul(c, k));
      }
    }
    return b.canvas();
  });
}

export function frameMotif(faction: FactionIdx): HTMLCanvasElement {
  return cached('fm' + faction, () => {
    if (faction === 0) { // palánk karósor
      const b = new Buf(48, 16);
      for (let x = 0; x < 48; x++) {
        const i = Math.floor(x / 8), lx = x % 8, tip = Math.abs(lx - 3.5), top = Math.round(tip * 1.1) + (hash2(i, 1, 3) > 0.5 ? 1 : 0);
        const base = mul([138, 100, 60], 0.85 + hash2(i, 2, 3) * 0.3);
        for (let y = 0; y < 16; y++) {
          if (y < top) { b.set(x, y, [38, 28, 24]); continue; }
          let k = lx < 2 ? 1.22 : lx > 5 ? 0.66 : 1; if (lx === 7) k = 0.4;
          k *= 0.92 + hash2(x, y >> 1, 4) * 0.16;
          let c = mul(base, k);
          if (y === 9 || y === 10) c = mul([190, 160, 104], (y === 9 ? 1.05 : 0.8) * (lx % 4 < 2 ? 1 : 0.86));
          if (y === 11) c = mul(c, 0.6);
          b.set(x, y, c);
        }
      }
      return b.canvas();
    }
    if (faction === 1) { // iznik rácsminta
      const b = new Buf(32, 16), W: RGB = [238, 240, 238], CO: RGB = [38, 78, 172], TU: RGB = [36, 168, 170], RD: RGB = [196, 62, 50];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
        const u = (x + y) % 16, v = ((x - y) % 16 + 16) % 16;
        let c = W;
        const cx = x % 16 - 7.5, cy = y - 7.5, m = Math.abs(cx) + Math.abs(cy);
        if (u < 2 || v < 2) c = CO;
        if (m < 2.6) c = TU; if (m < 1.1) c = W;
        const kx = (x + 8) % 16 - 7.5; if (Math.abs(kx) + Math.min(y, 15 - y) < 2.2) c = RD;
        if (y === 0 || y === 15) c = CO; if (y === 1 || y === 14) c = mix(CO, W, 0.75) as RGB;
        b.set(x, y, mul(c, 0.96 + hash2(x, y, 2) * 0.06));
      }
      return b.canvas();
    }
    const b = new Buf(32, 16); // vasalás szegecssorral
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
      let k = 0.9 + vnoise(x / 4, y / 4, 8, 4, 5) * 0.22;
      if (y === 0) k = 1.5; else if (y === 1) k *= 1.2; else if (y === 15) k = 0.42; else if (y === 14) k *= 0.7;
      if (y === 7) k *= 0.62; if (y === 8) k *= 1.18;
      let c: RGB = [80, 82, 94];
      const lx = x % 16 - 7.5, ly = y - 7.5, d = Math.hypot(lx, ly);
      if (d < 3) { c = [132, 136, 150]; k = lx + ly < -1 ? 1.4 : lx + ly > 1.4 ? 0.58 : 1; } else if (d < 4) k = 0.55;
      b.set(x, y, mul(c, k));
    }
    return b.canvas();
  });
}

export function sujtas(): HTMLCanvasElement {
  return cached('sujtas', () => {
    const b = new Buf(24, 10), L: RGB = [236, 150, 104], M: RGB = [186, 88, 58], D: RGB = [116, 48, 30];
    for (let x = 0; x < 24; x++) for (const ph of [0, Math.PI]) {
      const a = x / 12 * Math.PI * 2 + ph, yc = 4.5 + Math.sin(a) * 2.6, front = Math.cos(a) > 0;
      if (!front) for (let dy = -1; dy <= 1; dy++) b.set(x, yc + dy + 0.5, dy < 0 ? M : D);
    }
    for (let x = 0; x < 24; x++) for (const ph of [0, Math.PI]) {
      const a = x / 12 * Math.PI * 2 + ph, yc = 4.5 + Math.sin(a) * 2.6, front = Math.cos(a) > 0;
      if (front) { b.set(x, yc - 1 + 0.5, L); b.set(x, yc + 0.5, M); b.set(x, yc + 1.5, D); }
    }
    return b.canvas();
  });
}

// ---------------------------------------------------------------- jelrajzoló
const ST: RGB = [176, 184, 198], BL: RGB = [228, 232, 238], IR: RGB = [84, 86, 98], WD: RGB = [156, 112, 64], WDD: RGB = [98, 68, 44];
const GD: RGB = [232, 190, 76], RD: RGB = [198, 62, 44], GN: RGB = [104, 160, 76], WH: RGB = [238, 234, 224], SK: RGB = [226, 174, 134];
const LEA: RGB = [160, 108, 64], STO: RGB = [158, 156, 148], OR: RGB = [244, 150, 42], YE: RGB = [252, 220, 96], WA: RGB = [92, 150, 214];
const SIL: RGB = [210, 214, 222], EAR: RGB = [112, 84, 56];

class G {
  b: Buf;
  constructor(public S: number) { this.b = new Buf(S, S); }
  L(x1: number, y1: number, x2: number, y2: number, w: number, c: RGB) { const S = this.S; this.b.cap(x1 * S, y1 * S, x2 * S, y2 * S, Math.max(0.62, w * S / 2), c); return this; }
  D(x: number, y: number, r: number, c: RGB) { const S = this.S; this.b.cap(x * S, y * S, x * S, y * S, Math.max(0.7, r * S), c); return this; }
  E(x: number, y: number, rx: number, ry: number, c: RGB, flat = false) { const S = this.S; this.b.ell(x * S, y * S, rx * S, ry * S, c, flat); return this; }
  P(p: number[], c: RGB) { const S = this.S, q: number[][] = []; for (let i = 0; i < p.length; i += 2) q.push([p[i] * S, p[i + 1] * S]); this.b.poly(q, c); return this; }
  /** Nyíl (x1,y1)-ből (x2,y2)-be. */
  A(x1: number, y1: number, x2: number, y2: number, c: RGB, w = 0.1) {
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, h = 0.2;
    this.L(x1, y1, x2 - ux * h * 0.8, y2 - uy * h * 0.8, w, c);
    return this.P([x2, y2, x2 - ux * h - uy * h * 0.62, y2 - uy * h + ux * h * 0.62, x2 - ux * h + uy * h * 0.62, y2 - uy * h - ux * h * 0.62], c);
  }
  arc(cx: number, cy: number, r: number, a0: number, a1: number, w: number, c: RGB) {
    const n = 10; for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n, b = a0 + (a1 - a0) * (i + 1) / n; this.L(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(b) * r, cy + Math.sin(b) * r, w, c); }
    return this;
  }
  flame(x: number, y: number, s: number) {
    this.P([x, y + 0.2 * s, x - 0.14 * s, y + 0.04 * s, x - 0.1 * s, y - 0.12 * s, x - 0.02 * s, y - 0.04 * s, x + 0.02 * s, y - 0.3 * s, x + 0.15 * s, y - 0.06 * s, x + 0.13 * s, y + 0.1 * s], OR);
    return this.P([x, y + 0.17 * s, x - 0.07 * s, y + 0.06 * s, x, y - 0.1 * s, x + 0.07 * s, y + 0.06 * s], YE);
  }
  coin(x: number, y: number, r: number, c: RGB = GD) { this.E(x, y + r * 0.34, r, r * 0.62, shade(c, 0.55), true); this.E(x, y, r, r * 0.62, c); return this.E(x, y, r * 0.55, r * 0.32, shade(c, 0.8), true); }
  hammer(x: number, y: number, s: number) { this.L(x - 0.25 * s, y + 0.3 * s, x + 0.08 * s, y - 0.08 * s, 0.08, WD); return this.L(x - 0.06 * s, y - 0.24 * s, x + 0.22 * s, y + 0.02 * s, 0.17 * s + 0.02, IR); }
  sabre(x1: number, y1: number, x2: number, y2: number) {
    const mx = (x1 + x2) / 2 + (y2 - y1) * 0.1, my = (y1 + y2) / 2 - (x2 - x1) * 0.1;
    this.L(x1, y1, mx, my, 0.07, BL); this.L(mx, my, x2, y2, 0.06, BL);
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy);
    this.L(x1 - dy / l * 0.08, y1 + dx / l * 0.08, x1 + dy / l * 0.08, y1 - dx / l * 0.08, 0.06, GD);
    return this.L(x1, y1, x1 - dx / l * 0.12, y1 - dy / l * 0.12, 0.07, LEA);
  }
  shield(x: number, y: number, s: number, c: RGB) { this.P([x - 0.26 * s, y - 0.32 * s, x + 0.26 * s, y - 0.32 * s, x + 0.26 * s, y + 0.06 * s, x, y + 0.36 * s, x - 0.26 * s, y + 0.06 * s], c); this.P([x - 0.26 * s, y - 0.32 * s, x, y - 0.32 * s, x, y + 0.36 * s, x - 0.26 * s, y + 0.06 * s], shade(c, 1.18)); return this.D(x, y - 0.06 * s, 0.07 * s, GD); }
  tower(x: number, y: number, s: number) {
    const w = 0.2 * s;
    this.P([x - w, y + 0.4 * s, x - w, y - 0.2 * s, x - w * 1.25, y - 0.2 * s, x - w * 1.25, y - 0.42 * s, x - w * 0.6, y - 0.42 * s, x - w * 0.6, y - 0.32 * s, x - w * 0.2, y - 0.32 * s, x - w * 0.2, y - 0.42 * s, x + w * 0.2, y - 0.42 * s, x + w * 0.2, y - 0.32 * s, x + w * 0.6, y - 0.32 * s, x + w * 0.6, y - 0.42 * s, x + w * 1.25, y - 0.42 * s, x + w * 1.25, y - 0.2 * s, x + w, y - 0.2 * s, x + w, y + 0.4 * s], STO);
    this.P([x, y + 0.4 * s, x, y - 0.2 * s, x + w, y - 0.2 * s, x + w, y + 0.4 * s], shade(STO, 0.72));
    return this.P([x - w * 0.4, y + 0.4 * s, x - w * 0.4, y + 0.12 * s, x, y + 0.02 * s, x + w * 0.4, y + 0.12 * s, x + w * 0.4, y + 0.4 * s], [40, 34, 34]);
  }
  sack(x: number, y: number, s: number) { this.E(x, y + 0.08 * s, 0.24 * s, 0.26 * s, LEA); this.L(x - 0.08 * s, y - 0.2 * s, x + 0.08 * s, y - 0.2 * s, 0.08 * s, shade(LEA, 0.7)); return this.P([x - 0.12 * s, y - 0.34 * s, x + 0.12 * s, y - 0.34 * s, x + 0.06 * s, y - 0.22 * s, x - 0.06 * s, y - 0.22 * s], LEA); }
  dots(p: number[], r: number, c: RGB) { for (let i = 0; i < p.length; i += 2) this.D(p[i], p[i + 1], r, c); return this; }
}

const GLYPH: Record<string, (g: G) => void> = {
  res_e: g => { for (const [x, y] of [[0.22, 0.24], [0.36, 0.16], [0.5, 0.12], [0.64, 0.16], [0.78, 0.24]]) { g.L(0.5, 0.9, x, y + 0.1, 0.07, [214, 170, 66]); g.E(x, y, 0.07, 0.11, [244, 208, 98]); } g.L(0.38, 0.62, 0.62, 0.62, 0.09, RD); },
  res_f: g => { g.L(0.2, 0.36, 0.66, 0.2, 0.22, WDD); g.E(0.68, 0.2, 0.08, 0.11, [196, 156, 100]); g.L(0.18, 0.68, 0.74, 0.46, 0.28, WD); g.E(0.76, 0.45, 0.11, 0.14, [222, 180, 118]); g.E(0.76, 0.45, 0.045, 0.06, WDD, true); },
  res_k: g => { g.P([0.5, 0.16, 0.88, 0.34, 0.5, 0.52, 0.12, 0.34], [204, 202, 194]); g.P([0.12, 0.34, 0.5, 0.52, 0.5, 0.88, 0.12, 0.7], [156, 154, 146]); g.P([0.5, 0.52, 0.88, 0.34, 0.88, 0.7, 0.5, 0.88], [106, 104, 104]); g.L(0.3, 0.52, 0.34, 0.66, 0.03, [110, 108, 104]); },
  res_z: g => { for (let i = 0; i < 4; i++) g.coin(0.36, 0.78 - i * 0.13, 0.24, SIL); for (let i = 0; i < 2; i++) g.coin(0.7, 0.8 - i * 0.13, 0.2, SIL); },
  res_nep: g => { g.E(0.5, 0.92, 0.34, 0.34, [150, 106, 66]); g.D(0.5, 0.4, 0.19, SK); g.E(0.5, 0.26, 0.3, 0.09, [206, 176, 98]); g.E(0.5, 0.2, 0.15, 0.1, [206, 176, 98]); },

  cmd_megy: g => { g.A(0.18, 0.82, 0.84, 0.18, YE, 0.13); g.E(0.3, 0.3, 0.07, 0.1, WH); g.E(0.62, 0.74, 0.07, 0.1, WH); },
  cmd_tamad: g => { g.sabre(0.22, 0.8, 0.8, 0.16); g.sabre(0.78, 0.8, 0.2, 0.16); },
  cmd_orjarat: g => { g.A(0.16, 0.34, 0.84, 0.34, YE, 0.1); g.A(0.84, 0.68, 0.16, 0.68, GN, 0.1); },
  cmd_allj: g => { for (const [x, t] of [[0.34, 0.24], [0.45, 0.16], [0.56, 0.18], [0.67, 0.26]]) g.L(x, 0.5, x, t, 0.1, SK); g.P([0.28, 0.44, 0.73, 0.44, 0.7, 0.8, 0.34, 0.84], SK); g.L(0.3, 0.64, 0.16, 0.48, 0.1, SK); g.L(0.36, 0.86, 0.68, 0.84, 0.1, RD); },
  cmd_helytall: g => { g.tower(0.5, 0.5, 1); g.L(0.12, 0.92, 0.88, 0.92, 0.06, EAR); },
  cmd_vonal: g => { for (let i = 0; i < 5; i++) { const x = 0.16 + i * 0.17; g.L(x + 0.05, 0.6, x + 0.05, 0.14, 0.035, WD); g.D(x + 0.05, 0.13, 0.03, BL); g.D(x, 0.62, 0.075, ST); g.L(x, 0.74, x, 0.84, 0.1, RD); } },
  cmd_ek: g => g.dots([0.5, 0.2, 0.36, 0.42, 0.64, 0.42, 0.22, 0.66, 0.5, 0.66, 0.78, 0.66], 0.085, ST).dots([0.5, 0.2], 0.085, GD),
  cmd_laza: g => g.dots([0.22, 0.26, 0.72, 0.22, 0.48, 0.5, 0.2, 0.74, 0.78, 0.72], 0.085, ST),
  cmd_portya: g => { g.L(0.26, 0.9, 0.44, 0.46, 0.09, WD); g.flame(0.46, 0.3, 1.1); g.coin(0.74, 0.74, 0.14); g.coin(0.64, 0.84, 0.1); },
  cmd_epit: g => { g.P([0.1, 0.9, 0.1, 0.66, 0.5, 0.66, 0.5, 0.9], STO); g.L(0.1, 0.78, 0.5, 0.78, 0.03, [96, 94, 90]); g.L(0.3, 0.66, 0.3, 0.78, 0.03, [96, 94, 90]); g.hammer(0.56, 0.4, 1.15); },
  cmd_javit: g => { g.L(0.1, 0.8, 0.9, 0.8, 0.16, WD); g.L(0.4, 0.72, 0.56, 0.88, 0.04, WDD); g.P([0.42, 0.68, 0.7, 0.68, 0.7, 0.92, 0.42, 0.92], [200, 160, 100]); g.dots([0.47, 0.73, 0.65, 0.73, 0.47, 0.87, 0.65, 0.87], 0.03, IR); g.hammer(0.5, 0.34, 0.95); },
  cmd_bont: g => { g.P([0.5, 0.92, 0.5, 0.6, 0.66, 0.6, 0.66, 0.5, 0.9, 0.5, 0.9, 0.92], STO); g.L(0.66, 0.6, 0.74, 0.74, 0.03, [70, 68, 66]); g.L(0.74, 0.74, 0.7, 0.92, 0.03, [70, 68, 66]); g.dots([0.3, 0.88, 0.4, 0.8], 0.06, shade(STO, 0.8)); g.L(0.14, 0.8, 0.56, 0.3, 0.07, WD); g.arc(0.38, 0.52, 0.34, -1.9, -0.3, 0.08, IR); },
  cmd_kienged: g => { g.P([0.1, 0.9, 0.1, 0.34, 0.3, 0.14, 0.5, 0.34, 0.5, 0.9], STO); g.P([0.18, 0.9, 0.18, 0.42, 0.3, 0.3, 0.42, 0.42, 0.42, 0.9], [38, 32, 32]); g.A(0.3, 0.66, 0.92, 0.66, YE, 0.11); },
  cmd_helyorseg: g => { g.tower(0.68, 0.52, 1); g.A(0.06, 0.62, 0.52, 0.62, YE, 0.11); },
  cmd_gyulekezo: g => { g.E(0.32, 0.86, 0.22, 0.08, YE, true); g.E(0.32, 0.86, 0.15, 0.05, EAR, true); g.L(0.32, 0.86, 0.32, 0.12, 0.06, WD); g.P([0.36, 0.12, 0.86, 0.26, 0.36, 0.46], RD); g.P([0.36, 0.24, 0.6, 0.27, 0.36, 0.33], WH); },
  cmd_vissza: g => { g.arc(0.52, 0.56, 0.26, 1.2, -2.6, 0.11, YE); g.P([0.1, 0.5, 0.42, 0.34, 0.36, 0.66], YE); },
  cmd_felgyujt: g => { g.P([0.16, 0.92, 0.16, 0.62, 0.5, 0.4, 0.84, 0.62, 0.84, 0.92], WD); g.P([0.1, 0.64, 0.5, 0.36, 0.9, 0.64, 0.84, 0.7, 0.5, 0.48, 0.16, 0.7], [196, 166, 96]); g.P([0.42, 0.92, 0.42, 0.72, 0.58, 0.72, 0.58, 0.92], [44, 34, 30]); g.flame(0.5, 0.3, 1.3); },
  cmd_aknaz: g => { g.E(0.5, 0.86, 0.4, 0.14, EAR); g.E(0.5, 0.84, 0.2, 0.07, [36, 28, 26], true); g.L(0.78, 0.1, 0.5, 0.52, 0.07, WD); g.L(0.7, 0.08, 0.86, 0.14, 0.06, WD); g.P([0.4, 0.46, 0.6, 0.56, 0.5, 0.8, 0.34, 0.7], ST); },
  cmd_arat: g => { g.L(0.2, 0.9, 0.36, 0.64, 0.1, WD); g.arc(0.56, 0.46, 0.3, 2.5, -0.5, 0.09, BL); g.arc(0.56, 0.46, 0.3, -0.5, -0.9, 0.05, BL); },
  cmd_vet: g => { g.E(0.5, 0.9, 0.42, 0.12, EAR); g.L(0.5, 0.86, 0.5, 0.56, 0.05, GN); g.E(0.39, 0.56, 0.11, 0.06, GN); g.E(0.61, 0.5, 0.11, 0.06, GN); g.dots([0.2, 0.3, 0.34, 0.18, 0.72, 0.22, 0.82, 0.38, 0.52, 0.28], 0.04, YE); },
  cmd_olt: g => { g.arc(0.5, 0.42, 0.24, Math.PI, Math.PI * 2, 0.05, IR); g.P([0.24, 0.42, 0.76, 0.42, 0.68, 0.88, 0.32, 0.88], WD); g.L(0.26, 0.52, 0.74, 0.52, 0.05, IR); g.L(0.3, 0.76, 0.7, 0.76, 0.05, IR); g.E(0.5, 0.42, 0.24, 0.05, WA, true); g.dots([0.16, 0.2, 0.84, 0.16, 0.9, 0.5], 0.05, WA); },
  cmd_allas_tamado: g => { g.E(0.5, 0.5, 0.4, 0.4, [130, 40, 32], true); g.sabre(0.24, 0.8, 0.78, 0.18); },
  cmd_allas_vedekezo: g => { g.shield(0.5, 0.48, 1.15, ST); },
  cmd_allas_helytallo: g => { g.shield(0.5, 0.4, 0.95, ST); g.L(0.1, 0.9, 0.9, 0.9, 0.08, EAR); g.L(0.26, 0.92, 0.3, 0.66, 0.06, WD); g.L(0.74, 0.92, 0.7, 0.66, 0.06, WD); },
  cmd_allas_tartozkodo: g => { g.L(0.5, 0.36, 0.5, 0.92, 0.12, LEA); g.D(0.5, 0.92, 0.05, GD); g.L(0.34, 0.32, 0.66, 0.32, 0.07, GD); g.L(0.5, 0.3, 0.5, 0.12, 0.08, WDD); g.D(0.5, 0.1, 0.06, GD); },
  cmd_elad: g => { g.sack(0.3, 0.6, 0.9); g.A(0.5, 0.3, 0.86, 0.3, GN, 0.09); g.coin(0.72, 0.68, 0.18); },
  cmd_vesz: g => { g.coin(0.26, 0.66, 0.17); g.A(0.14, 0.3, 0.5, 0.3, GN, 0.09); g.sack(0.7, 0.58, 1); },
  cmd_marha: g => { g.L(0.34, 0.4, 0.14, 0.26, 0.07, WH); g.L(0.14, 0.26, 0.14, 0.1, 0.05, WH); g.L(0.66, 0.4, 0.86, 0.26, 0.07, WH); g.L(0.86, 0.26, 0.86, 0.1, 0.05, WH); g.E(0.5, 0.54, 0.21, 0.26, [214, 208, 196]); g.E(0.5, 0.76, 0.14, 0.1, [156, 136, 126]); g.dots([0.41, 0.48, 0.59, 0.48], 0.035, [40, 34, 34]); g.dots([0.45, 0.77, 0.55, 0.77], 0.025, [60, 44, 44]); },
  cmd_levag: g => { g.P([0.3, 0.16, 0.86, 0.28, 0.8, 0.62, 0.3, 0.5], ST); g.P([0.3, 0.42, 0.8, 0.54, 0.8, 0.62, 0.3, 0.5], BL); g.D(0.72, 0.36, 0.035, IR); g.L(0.32, 0.42, 0.14, 0.86, 0.1, WD); },
  cmd_rang: g => { g.P([0.16, 0.8, 0.16, 0.36, 0.33, 0.54, 0.5, 0.24, 0.67, 0.54, 0.84, 0.36, 0.84, 0.8], GD); g.L(0.16, 0.8, 0.84, 0.8, 0.1, shade(GD, 0.72)); g.dots([0.16, 0.34, 0.5, 0.2, 0.84, 0.34], 0.055, GD); g.dots([0.33, 0.8, 0.67, 0.8], 0.045, RD); g.D(0.5, 0.8, 0.045, WA); },
  cmd_utofizetes: g => { g.sack(0.4, 0.58, 1.05); g.coin(0.76, 0.3, 0.14, SIL); g.coin(0.8, 0.62, 0.11, SIL); },
  cmd_megse: g => { g.L(0.22, 0.22, 0.78, 0.78, 0.15, RD); g.L(0.78, 0.22, 0.22, 0.78, 0.15, RD); },

  tech_vasalt_eke: g => { g.L(0.1, 0.3, 0.84, 0.48, 0.08, WD); g.L(0.12, 0.3, 0.06, 0.12, 0.06, WD); g.P([0.44, 0.44, 0.7, 0.86, 0.34, 0.74], ST); g.P([0.44, 0.44, 0.7, 0.86, 0.5, 0.74], BL); g.D(0.82, 0.62, 0.12, WDD); g.D(0.82, 0.62, 0.05, IR); g.L(0.06, 0.92, 0.94, 0.92, 0.05, EAR); },
  tech_gabonaverem: g => { g.E(0.5, 0.62, 0.32, 0.3, LEA); g.L(0.3, 0.3, 0.7, 0.3, 0.1, shade(LEA, 0.8)); g.E(0.5, 0.3, 0.18, 0.06, [50, 38, 30], true); g.dots([0.42, 0.26, 0.5, 0.22, 0.58, 0.26, 0.5, 0.29], 0.035, YE); g.L(0.24, 0.6, 0.76, 0.6, 0.03, shade(LEA, 0.7)); },
  tech_fureszmalom: g => { g.L(0.14, 0.72, 0.86, 0.3, 0.14, ST); for (let i = 0; i < 7; i++) { const t = 0.08 + i * 0.13, x = 0.14 + 0.72 * t, y = 0.72 - 0.42 * t; g.P([x, y + 0.05, x + 0.09, y + 0.02, x + 0.07, y + 0.16], BL); } g.L(0.08, 0.86, 0.16, 0.6, 0.09, WD); g.L(0.84, 0.44, 0.92, 0.18, 0.09, WD); },
  tech_ekcsakany: g => { g.P([0.5, 0.94, 0.5, 0.56, 0.94, 0.56, 0.94, 0.94], STO); g.P([0.62, 0.4, 0.78, 0.4, 0.7, 0.74], BL); g.L(0.7, 0.74, 0.66, 0.94, 0.03, [70, 68, 66]); g.L(0.1, 0.86, 0.46, 0.3, 0.07, WD); g.arc(0.3, 0.5, 0.3, -2.0, -0.4, 0.08, IR); },
  tech_edzett_penge: g => { g.P([0.5, 0.06, 0.6, 0.2, 0.57, 0.68, 0.43, 0.68, 0.4, 0.2], BL); g.P([0.5, 0.06, 0.6, 0.2, 0.57, 0.68, 0.5, 0.68], ST); g.L(0.28, 0.7, 0.72, 0.7, 0.08, GD); g.L(0.5, 0.76, 0.5, 0.9, 0.09, LEA); g.D(0.5, 0.93, 0.055, GD); g.dots([0.22, 0.2, 0.8, 0.36], 0.035, YE); },
  tech_sodronying: g => { g.P([0.22, 0.16, 0.78, 0.16, 0.94, 0.44, 0.76, 0.52, 0.72, 0.9, 0.28, 0.9, 0.24, 0.52, 0.06, 0.44], [128, 134, 148]); g.E(0.5, 0.17, 0.11, 0.07, [44, 40, 44], true); for (let j = 0; j < 5; j++) for (let i = 0; i < 4; i++) g.D(0.33 + i * 0.115 + (j % 2) * 0.05, 0.33 + j * 0.125, 0.028, [196, 202, 214]); },
  tech_mellvert: g => { g.P([0.26, 0.14, 0.74, 0.14, 0.84, 0.42, 0.68, 0.88, 0.32, 0.88, 0.16, 0.42], ST); g.P([0.5, 0.14, 0.74, 0.14, 0.84, 0.42, 0.68, 0.88, 0.5, 0.88], shade(ST, 0.8)); g.L(0.5, 0.2, 0.5, 0.86, 0.035, BL); g.E(0.5, 0.14, 0.11, 0.07, [44, 40, 44], true); g.L(0.3, 0.88, 0.7, 0.88, 0.06, GD); },
  tech_papirtolteny: g => { g.L(0.24, 0.78, 0.66, 0.36, 0.2, [230, 218, 184]); g.L(0.2, 0.82, 0.12, 0.9, 0.08, [200, 186, 150]); g.L(0.4, 0.7, 0.5, 0.6, 0.03, [150, 136, 110]); g.D(0.74, 0.28, 0.11, IR); g.dots([0.84, 0.6, 0.76, 0.72, 0.88, 0.8, 0.68, 0.86], 0.028, [40, 36, 36]); },
  tech_kereklakat: g => { g.L(0.06, 0.34, 0.94, 0.24, 0.09, IR); g.P([0.06, 0.4, 0.5, 0.36, 0.5, 0.5, 0.2, 0.62, 0.06, 0.6], WD); g.D(0.5, 0.56, 0.19, ST); g.D(0.5, 0.56, 0.07, IR); g.L(0.74, 0.34, 0.62, 0.5, 0.06, IR); g.dots([0.72, 0.62, 0.8, 0.52, 0.82, 0.68], 0.03, YE); },
  tech_tuzes_golyo: g => { g.flame(0.5, 0.36, 1.5); g.D(0.5, 0.64, 0.23, IR); g.D(0.42, 0.56, 0.05, [150, 154, 168]); g.E(0.5, 0.48, 0.12, 0.05, OR, true); },
  tech_fuleskosar: g => { for (const x of [0.28, 0.42, 0.58, 0.72]) g.L(x, 0.9, x, 0.14, 0.045, WDD); g.P([0.2, 0.3, 0.8, 0.3, 0.78, 0.9, 0.22, 0.9], [184, 146, 88]); for (let j = 0; j < 5; j++) g.L(0.22, 0.38 + j * 0.115, 0.78, 0.38 + j * 0.115, 0.03, [124, 94, 56]); g.E(0.5, 0.3, 0.3, 0.07, EAR, true); },
  tech_olasz_bastya: g => { const p: number[] = [], q: number[] = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.22 : 0.44; p.push(0.5 + Math.cos(a) * r, 0.52 + Math.sin(a) * r); q.push(0.5 + Math.cos(a) * r * 0.62, 0.52 + Math.sin(a) * r * 0.62); } g.P(p, STO); g.P(q, [96, 132, 76]); g.D(0.5, 0.52, 0.06, RD); },
};

const PLATE: Record<string, RGB> = { cmd: [70, 66, 64], tech: [214, 194, 150], unit: [50, 54, 66] };

export function icon(id: string, size = 40): HTMLCanvasElement {
  size = Math.max(8, size | 0);
  return cached('ic' + id + '@' + size, () => {
    const kind = id.slice(0, id.indexOf('_'));
    if (kind === 'unit') return portrait(id.slice(5), size);
    const g = new G(size);
    (GLYPH[id] ?? GLYPH.cmd_megse)(g);
    g.b.outline(kind === 'tech' ? 0.34 : 0.26);
    if (kind === 'res') return g.b.canvas();
    const o = plate(size, PLATE[kind] ?? PLATE.cmd, 3);
    const sh = Math.max(1, Math.round(size / 28));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (g.b.a(x, y)) o.blend(x + sh, y + sh, [10, 8, 12], 120);
    o.over(g.b);
    bevel(o);
    return o.canvas();
  });
}

function plate(S: number, c: RGB, seed: number): Buf {
  const o = new Buf(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - S / 2, y - S / 2) / S;
    const k = 1.1 - d * 0.5 + (vnoise(x / 4, y / 4, 64, 64, seed) - 0.5) * 0.18 + (hash2(x, y, seed) - 0.5) * 0.05;
    o.set(x, y, mul(c, k));
  }
  return o;
}
function bevel(o: Buf): void {
  const S = o.w, d = o.d;
  const adj = (x: number, y: number, k: number) => { const i = (y * S + x) * 4; d[i] = cl(d[i] * k); d[i + 1] = cl(d[i + 1] * k); d[i + 2] = cl(d[i + 2] * k); };
  for (let i = 0; i < S; i++) { adj(i, 0, 1.55); adj(0, i, 1.45); adj(i, S - 1, 0.45); adj(S - 1, i, 0.5); }
  for (let i = 1; i < S - 1; i++) { adj(i, 1, 1.25); adj(1, i, 1.2); adj(i, S - 2, 0.68); adj(S - 2, i, 0.72); }
}

function portrait(id: string, S: number): HTMLCanvasElement {
  const sp = unitSprite(id, 0, 3, 'all', 0);
  const big = sp.c.width > 100, ship = sp.c.width > 140, cav = sp.c.height > 80 && !big;
  const sc = ship ? S / 78 : Math.max(1, Math.round(S / (big ? 40 : cav ? 36 : 22)));
  const cx = sp.ax + (cav ? 3 : big ? (ship ? 0 : -2) : 1), cy = sp.ay - (ship ? 24 : big ? 12 : cav ? 24 : 19);
  const o = plate(S, PLATE.unit, 5);
  const c = o.canvas(), g = g2(c);
  if (ship) { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; }
  const win = S / sc;
  g.drawImage(sp.c, cx - win / 2, cy - win / 2, win, win, 0, 0, S, S);
  const id2 = g.getImageData(0, 0, S, S), b = new Buf(S, S);
  b.d.set(id2.data); bevel(b);
  return b.canvas();
}

// ---------------------------------------------------------------- címer, egérmutató
export function crest(faction: FactionIdx, size = 48): HTMLCanvasElement {
  size = Math.max(12, size | 0);
  return cached('cr' + faction + '@' + size, () => {
    const g = new G(size), S = size, b = g.b;
    if (faction === 0) {
      const L: number[][] = [[0.14 * S, 0.08 * S], [0.5 * S, 0.08 * S]], R: number[][] = [[0.5 * S, 0.08 * S], [0.86 * S, 0.08 * S]];
      const arc: number[][] = [];
      for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI; arc.push([(0.5 + 0.36 * Math.cos(a)) * S, (0.54 + 0.4 * Math.sin(a)) * S]); }
      b.poly([...R, ...arc.slice(0, 7)], [244, 240, 230]);
      b.poly([...L, [0.5 * S, 0.94 * S], ...arc.slice(6)], [186, 88, 58]);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (b.a(x, y) && (x + y * 2) / S < 0.62) { const i = (y * S + x) * 4; for (let k = 0; k < 3; k++) b.d[i + k] = cl(b.d[i + k] * 1.1); }
    } else if (faction === 1) {
      g.E(0.5, 0.5, 0.44, 0.44, [58, 150, 70]);
      g.E(0.45, 0.5, 0.27, 0.27, [244, 242, 232], true); g.E(0.55, 0.5, 0.225, 0.225, [58, 150, 70], true);
      const p: number[] = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.035 : 0.085; p.push(0.66 + Math.cos(a) * r, 0.5 + Math.sin(a) * r); }
      g.P(p, [244, 242, 232]);
    } else {
      const K: RGB = [30, 28, 32];
      g.P([0.5, 0.04, 0.96, 0.5, 0.5, 0.96, 0.04, 0.5], [224, 178, 44]); g.P([0.5, 0.04, 0.96, 0.5, 0.5, 0.96], [198, 150, 34]);
      g.P([0.5, 0.36, 0.59, 0.5, 0.5, 0.74, 0.41, 0.5], K);
      for (const s of [-1, 1]) {
        g.P([0.5 + s * 0.05, 0.42, 0.5 + s * 0.3, 0.32, 0.5 + s * 0.24, 0.44, 0.5 + s * 0.3, 0.5, 0.5 + s * 0.22, 0.54, 0.5 + s * 0.26, 0.62, 0.5 + s * 0.07, 0.56], K);
        g.L(0.5 + s * 0.03, 0.38, 0.5 + s * 0.1, 0.25, 0.055, K); g.D(0.5 + s * 0.11, 0.24, 0.04, K); g.L(0.5 + s * 0.12, 0.24, 0.5 + s * 0.2, 0.27, 0.03, K);
        g.L(0.5 + s * 0.04, 0.68, 0.5 + s * 0.13, 0.8, 0.04, K);
      }
      g.P([0.5, 0.7, 0.56, 0.84, 0.5, 0.8, 0.44, 0.84], K);
      g.L(0.43, 0.2, 0.57, 0.2, 0.035, [196, 62, 44]);
    }
    b.outline(0.25);
    return b.canvas();
  });
}

export type CursorKind = 'alap' | 'megy' | 'tamad' | 'gyujt' | 'epit' | 'tilos' | 'beszall';
const curCache = new Map<string, { c: HTMLCanvasElement; hx: number; hy: number }>();
export function cursor(kind: CursorKind): { c: HTMLCanvasElement; hx: number; hy: number } {
  let r = curCache.get(kind);
  if (r) return r;
  const g = new G(32), b = g.b; let hx = 1, hy = 1;
  const arrow = (c: RGB, d: RGB) => { b.poly([[1, 1], [1, 21], [6, 16.5], [10, 26], [14, 24.5], [10, 15.5], [17, 15.5]], c); b.poly([[1, 1], [17, 15.5], [10, 15.5], [14, 24.5], [12, 25.2], [7.5, 14.5]], d); };
  if (kind === 'alap') arrow([226, 230, 238], [150, 158, 174]);
  else if (kind === 'megy') { arrow([250, 214, 96], [200, 150, 50]); g.P([0.6, 0.72, 0.74, 0.86, 0.88, 0.72, 0.88, 0.82, 0.74, 0.96, 0.6, 0.82], GN); }
  else if (kind === 'tamad') { g.L(0.08, 0.08, 0.62, 0.62, 0.1, BL); g.L(0.08, 0.08, 0.3, 0.2, 0.05, ST); g.L(0.52, 0.76, 0.76, 0.52, 0.09, GD); g.L(0.66, 0.66, 0.84, 0.84, 0.11, [150, 44, 36]); g.D(0.88, 0.88, 0.07, GD); hx = 2; hy = 2; }
  else if (kind === 'gyujt') { g.L(0.3, 0.3, 0.86, 0.86, 0.09, WD); g.P([0.1, 0.3, 0.34, 0.08, 0.5, 0.26, 0.3, 0.46], ST); g.P([0.1, 0.3, 0.2, 0.2, 0.36, 0.38, 0.3, 0.46], BL); hx = 4; hy = 6; }
  else if (kind === 'epit') { g.L(0.36, 0.36, 0.88, 0.88, 0.09, WD); g.L(0.14, 0.42, 0.42, 0.14, 0.2, IR); g.L(0.12, 0.36, 0.3, 0.18, 0.05, ST); hx = 5; hy = 5; }
  else if (kind === 'tilos') { g.arc(0.5, 0.5, 0.36, 0, Math.PI * 2, 0.12, RD); g.L(0.26, 0.26, 0.74, 0.74, 0.12, RD); hx = 16; hy = 16; }
  else { g.P([0.14, 0.94, 0.14, 0.5, 0.26, 0.5, 0.26, 0.82, 0.74, 0.82, 0.74, 0.5, 0.86, 0.5, 0.86, 0.94], STO); g.A(0.5, 0.06, 0.5, 0.72, YE, 0.13); hx = 16; hy = 22; }
  b.outline(0.18);
  r = { c: b.canvas(), hx, hy };
  curCache.set(kind, r);
  return r;
}
