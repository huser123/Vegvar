// Egység- és állatsprite-ok: paraméteres, 3D-s pontokból vetített pixelfigurák.
// Minden figura (jobb, előre, fel) helyi koordinátákban épül fel, a nézési irány szerint
// vetül a képernyőre, a részek mélység szerint rendezve rajzolódnak ki (kapszulák, vonalak, lapok).
import type { Sprite, Team, UnitAnim, UnitSpriteOpts } from './api';
import { mk, g2, RGB, shade, TEAM, hash2 } from './pal';

export const UNIT_FRAMES: Record<UnitAnim, number> = { all: 2, megy: 6, tamad: 5, munka: 5, hal: 5 };

// ---------------------------------------------------------------- pixelpuffer
export class Buf {
  d: Uint8ClampedArray;
  constructor(public w: number, public h: number) { this.d = new Uint8ClampedArray(w * h * 4); }
  set(x: number, y: number, c: RGB, a = 255): void {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const k = (y * this.w + x) * 4, d = this.d;
    d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = a;
  }
  blend(x: number, y: number, c: RGB, a: number): void {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const k = (y * this.w + x) * 4, d = this.d, da = d[k + 3] / 255, sa = a / 255, oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    for (let i = 0; i < 3; i++) d[k + i] = (c[i] * sa + d[k + i] * da * (1 - sa)) / oa;
    d[k + 3] = oa * 255;
  }
  clear(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[(y * this.w + x) * 4 + 3] = 0;
  }
  a(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[(y * this.w + x) * 4 + 3];
  }
  /** Árnyalt kapszula (bal-felső fény). flat: egyszínű. */
  cap(x1: number, y1: number, x2: number, y2: number, r: number, c: RGB, flat = false): void {
    const lt = flat ? c : shade(c, 1.22), dk = flat ? c : shade(c, 0.6);
    const x0 = Math.floor(Math.min(x1, x2) - r), xe = Math.ceil(Math.max(x1, x2) + r);
    const y0 = Math.floor(Math.min(y1, y2) - r), ye = Math.ceil(Math.max(y1, y2) + r);
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy, r2 = r * r;
    for (let py = y0; py <= ye; py++) for (let px = x0; px <= xe; px++) {
      const cx = px + 0.5 - x1, cy = py + 0.5 - y1;
      let t = l2 > 0 ? (cx * dx + cy * dy) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = cx - t * dx, ey = cy - t * dy;
      if (ex * ex + ey * ey > r2) continue;
      const s = (-ex * 0.7 - ey * 0.75) / r;
      this.set(px, py, s > 0.3 ? lt : s < -0.35 ? dk : c);
    }
  }
  ell(cx: number, cy: number, rx: number, ry: number, c: RGB, flat = false): void {
    const lt = flat ? c : shade(c, 1.22), dk = flat ? c : shade(c, 0.6);
    for (let py = Math.floor(cy - ry); py <= Math.ceil(cy + ry); py++)
      for (let px = Math.floor(cx - rx); px <= Math.ceil(cx + rx); px++) {
        const nx = (px + 0.5 - cx) / rx, ny = (py + 0.5 - cy) / ry;
        if (nx * nx + ny * ny > 1) continue;
        const s = -nx * 0.7 - ny * 0.75;
        this.set(px, py, s > 0.3 ? lt : s < -0.35 ? dk : c);
      }
  }
  line(x1: number, y1: number, x2: number, y2: number, c: RGB): void {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))));
    for (let i = 0; i <= n; i++) this.set(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n, c);
  }
  poly(p: number[][], c: RGB, a = 255): void {
    let y0 = 1e9, y1 = -1e9;
    for (const q of p) { y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.h - 1, Math.ceil(y1)); y++) {
      const sy = y + 0.5, xs: number[] = [];
      for (let i = 0; i < p.length; i++) {
        const A = p[i], B = p[(i + 1) % p.length];
        if ((A[1] <= sy && B[1] > sy) || (B[1] <= sy && A[1] > sy)) xs.push(A[0] + (sy - A[1]) / (B[1] - A[1]) * (B[0] - A[0]));
      }
      xs.sort((u, v) => u - v);
      for (let i = 0; i + 1 < xs.length; i += 2)
        for (let x = Math.ceil(xs[i] - 0.5); x <= Math.floor(xs[i + 1] - 0.5); x++)
          a >= 255 ? this.set(x, y, c) : this.blend(x, y, c, a);
    }
  }
  /** Sötét kontúr az átlátszatlan pixelek köré; a szín a szomszéd sötétített árnyalata. */
  outline(k = 0.3): void {
    const w = this.w, h = this.h, d = this.d, add: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3]) continue;
      let n = -1;
      if (y + 1 < h && d[((y + 1) * w + x) * 4 + 3] === 255) n = (y + 1) * w + x;
      else if (x + 1 < w && d[(y * w + x + 1) * 4 + 3] === 255) n = y * w + x + 1;
      else if (x > 0 && d[(y * w + x - 1) * 4 + 3] === 255) n = y * w + x - 1;
      else if (y > 0 && d[((y - 1) * w + x) * 4 + 3] === 255) n = (y - 1) * w + x;
      if (n >= 0) add.push(x, y, n);
    }
    for (let i = 0; i < add.length; i += 3) {
      const n = add[i + 2] * 4;
      this.set(add[i], add[i + 1], shade([d[n], d[n + 1], d[n + 2]], k));
    }
  }
  over(o: Buf, mul = 1): void {
    const s = o.d, d = this.d;
    for (let k = 0; k < s.length; k += 4) if (s[k + 3]) {
      if (s[k + 3] === 255) { d[k] = s[k] * mul; d[k + 1] = s[k + 1] * mul; d[k + 2] = s[k + 2] * mul; d[k + 3] = 255; }
      else this.blend((k >> 2) % this.w, Math.floor((k >> 2) / this.w), [s[k] * mul, s[k + 1] * mul, s[k + 2] * mul], s[k + 3]);
    }
  }
  canvas(): HTMLCanvasElement {
    const c = mk(this.w, this.h);
    g2(c).putImageData(new ImageData(this.d as any, this.w, this.h), 0, 0);
    return c;
  }
}

/** Periodikus (nx×ny rácson ismétlődő) simított értékzaj, 0..1. */
export function vnoise(x: number, y: number, nx: number, ny: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const h = (i: number, j: number) => hash2(((i % nx) + nx) % nx, ((j % ny) + ny) % ny, seed);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ---------------------------------------------------------------- jelenet
type V3 = [number, number, number];
class Scene {
  it: { d: number; fn: (b: Buf) => void }[] = [];
  pre: V3 = [0, 0, 0]; off: V3 = [0, 0, 0];
  fall = 0; side = false; fr = 4;
  rx: number; ry: number; fx: number; fy: number;
  constructor(dir: number, public ax: number, public ay: number) {
    const t = dir * Math.PI / 4;
    this.rx = Math.cos(t); this.ry = Math.sin(t); this.fx = Math.sin(t); this.fy = -Math.cos(t);
  }
  pr(p: V3): V3 {
    let r = p[0] + this.pre[0], f = p[1] + this.pre[1], z = p[2] + this.pre[2];
    if (this.fall > 0) {
      const a = this.fall * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
      if (this.side) { const r2 = r * c + z * s; z = Math.max(0.6, z * c - r * s + this.fr * s); r = r2; }
      else { const f2 = f * c - z * s; z = Math.max(0.6, z * c + f * s * 0.4 + 1.6 * s); f = f2; }
    }
    r += this.off[0]; f += this.off[1]; z += this.off[2];
    const gy = r * this.ry + f * this.fy;
    return [this.ax + r * this.rx + f * this.fx, this.ay + gy * 0.5 - z, gy + z * 0.02];
  }
  cap(a: V3, b: V3, r: number, c: RGB, bias = 0): void {
    const A = this.pr(a), B = this.pr(b);
    this.it.push({ d: (A[2] + B[2]) / 2 + bias, fn: bf => bf.cap(A[0], A[1], B[0], B[1], r, c) });
  }
  line(a: V3, b: V3, c: RGB, bias = 0): void {
    const A = this.pr(a), B = this.pr(b);
    this.it.push({ d: (A[2] + B[2]) / 2 + bias, fn: bf => bf.line(A[0], A[1], B[0], B[1], c) });
  }
  ell(p: V3, rx: number, ry: number, c: RGB, bias = 0, flat = false): void {
    const P = this.pr(p);
    this.it.push({ d: P[2] + bias, fn: bf => bf.ell(P[0], P[1], rx, ry, c, flat) });
  }
  poly(pts: V3[], c: RGB, bias = 0): void {
    const P = pts.map(p => this.pr(p));
    let d = 0; for (const q of P) d += q[2];
    this.it.push({ d: d / P.length + bias, fn: bf => bf.poly(P, c) });
  }
  custom(d: number, fn: (b: Buf) => void): void { this.it.push({ d, fn }); }
  render(b: Buf): void {
    const it = this.it.map((v, i) => ({ v, i })).sort((p, q) => p.v.d - q.v.d || p.i - q.i);
    for (const e of it) e.v.fn(b);
  }
}
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
function dirv(d: number[], len: number): V3 {
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return [d[0] / l * len, d[1] / l * len, d[2] / l * len];
}

function finish(b: Buf, ax: number, ay: number, sh: [number, number] | null, dark = 1, shFn?: (o: Buf) => void): Sprite {
  const o = new Buf(b.w, b.h);
  if (shFn) shFn(o);
  if (sh) {
    const [rx, ry] = sh, cx = ax + 1.5, cy = ay + 0.5;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) o.set(x, y, [12, 14, 22], 90);
    }
  }
  o.over(b, dark);
  return { c: o.canvas(), ax, ay };
}

// ---------------------------------------------------------------- anyagszínek
const SKIN: RGB = [224, 172, 132], SKIN2: RGB = [200, 150, 108];
const STEEL: RGB = [170, 178, 192], IRON: RGB = [78, 80, 92], BLADE: RGB = [228, 232, 238];
const WOOD: RGB = [150, 108, 62], WOODD: RGB = [92, 64, 42], BRONZE: RGB = [188, 140, 66], GOLD: RGB = [226, 186, 74];
const WHITE: RGB = [238, 234, 224], LINEN: RGB = [226, 214, 188];

type Col = RGB | 't' | 'td' | 'tl';
interface Look {
  coat: Col; sleeve?: Col; tro: RGB; boot?: RGB; skin?: RGB; hair?: RGB;
  hat: string; hatc?: RGB; feather?: RGB;
  weapon: string | null; tool?: string;
  len?: number; armor?: RGB; sash?: boolean; apron?: RGB; cape?: Col; shield?: Col;
  legR?: number; armR?: number; stache?: boolean; bow?: boolean; flag?: boolean;
}
interface HorseLook { col: RGB; mane: RGB; heavy?: boolean }
interface Spec { k: 'f' | 'l' | 's' | 'h'; L?: Look; horse?: HorseLook; gun?: { wr: number; bl: number; br: number; col: RGB; mortar?: boolean }; crew?: Look[] }

const hajduLook: Look = { coat: 't', len: 8, tro: [104, 94, 86], boot: [70, 50, 36], hat: 'suveg', hatc: [38, 36, 44], feather: WHITE, weapon: 'puska', stache: true };
const azabLook: Look = { coat: 't', tro: [224, 214, 192], legR: 1.8, boot: [124, 72, 50], hat: 'turban', weapon: 'szablya', skin: SKIN2, stache: true };
const muskLook: Look = { coat: 't', tro: [86, 78, 72], boot: [60, 48, 40], hat: 'szeles', hatc: [46, 42, 44], feather: [232, 222, 200], weapon: 'musketa', stache: true };

const SPECS: Record<string, Spec> = {
  jobbagy: { k: 'f', L: { coat: 't', sleeve: LINEN, tro: [124, 100, 72], hat: 'kalap', hatc: [208, 178, 98], weapon: null, tool: 'fejsze', stache: true } },
  kapitany: { k: 'l', horse: { col: [232, 228, 220], mane: [186, 180, 172] },
    L: { coat: 'td', cape: 't', tro: [64, 54, 64], boot: [200, 160, 60], hat: 'suveg', hatc: [52, 42, 62], feather: WHITE, weapon: 'szablya', flag: true, stache: true, sash: true } },
  darabont: { k: 'f', L: { coat: 't', tro: [114, 106, 98], boot: [62, 48, 38], hat: 'suveg', hatc: [70, 56, 48], weapon: 'pika', stache: true } },
  hajdu: { k: 'f', L: hajduLook },
  huszar: { k: 'l', horse: { col: [136, 86, 50], mane: [52, 38, 32] },
    L: { coat: 't', tro: [94, 84, 78], boot: [196, 156, 64], hat: 'suveg', hatc: [64, 44, 44], feather: WHITE, weapon: 'szablya', shield: 'tl', stache: true } },
  vitez: { k: 'f', L: { coat: 't', armor: STEEL, len: 7.5, tro: [92, 86, 82], boot: [62, 48, 38], hat: 'sisak', weapon: 'szablya', stache: true } },
  tarack: { k: 's', gun: { wr: 4.2, bl: 12, br: 1.8, col: BRONZE }, crew: [{ ...hajduLook, weapon: null, len: undefined }] },
  azab: { k: 'f', L: azabLook },
  akindzsi: { k: 'l', horse: { col: [182, 146, 96], mane: [64, 46, 38] },
    L: { coat: 't', tro: [204, 194, 174], boot: [110, 70, 50], hat: 'hegyes', hatc: [176, 136, 62], weapon: 'szablya', bow: true, skin: SKIN2, stache: true } },
  janicsar: { k: 'f', L: { coat: 't', len: 4.5, tro: [150, 70, 56], boot: [178, 92, 52], hat: 'kece', weapon: 'puska', skin: SKIN2, stache: true } },
  szpahi: { k: 'l', horse: { col: [58, 52, 54], mane: [30, 26, 30], heavy: true },
    L: { coat: 't', armor: [150, 156, 170], tro: [124, 64, 52], boot: [70, 50, 44], hat: 'sisak', feather: [220, 60, 50], weapon: 'lancsa', shield: 'tl', skin: SKIN2, stache: true } },
  lagumdzsi: { k: 'f', L: { coat: 't', sleeve: LINEN, tro: [132, 110, 86], legR: 1.8, hat: 'sapka', hatc: [156, 100, 62], weapon: 'csakany', skin: SKIN2, stache: true } },
  agyu: { k: 's', gun: { wr: 6.5, bl: 20, br: 2.9, col: BRONZE }, crew: [{ ...azabLook, weapon: null }, { ...azabLook, weapon: null }] },
  landsknecht: { k: 'f', L: { coat: 't', sleeve: 'tl', armR: 1.9, tro: [216, 182, 72], legR: 2.0, boot: [84, 62, 52], hat: 'barett', hatc: [74, 46, 74], feather: WHITE, weapon: 'pika' } },
  musketas: { k: 'f', L: muskLook },
  vertes: { k: 'l', horse: { col: [92, 60, 42], mane: [40, 30, 28], heavy: true },
    L: { coat: [112, 118, 132], armor: [132, 138, 152], sleeve: 't', sash: true, tro: [72, 68, 72], boot: [42, 38, 38], hat: 'zart', weapon: 'kard' } },
  hadmernok: { k: 'f', L: { coat: 't', apron: [146, 100, 62], tro: [98, 88, 78], boot: [60, 46, 38], hat: 'kalap', hatc: [54, 48, 46], weapon: null, tool: 'kalapacs', stache: true } },
  mozsar: { k: 's', gun: { wr: 3, bl: 6, br: 3.5, col: BRONZE, mortar: true }, crew: [{ ...muskLook, weapon: null }] },
  naszad: { k: 'h' },
};

// ---------------------------------------------------------------- póz
interface Pose { fl: [number, number]; fr: [number, number]; hr: V3; hl: V3; lean: number; bob: number; fall: number; wk: string | null; wa: V3 | null; wb: V3 | null; flash: number; act: boolean }
const WLEN: Record<string, number> = { szablya: 8, kard: 9.5, fejsze: 8, kalapacs: 7, csakany: 8.5 };

function humanPose(L: Look, anim: UnitAnim, frame: number, mounted: boolean): Pose {
  const act = anim === 'tamad' || anim === 'munka';
  const wk = act ? (anim === 'munka' || !L.weapon ? (L.tool ?? L.weapon) : L.weapon) : L.weapon;
  const P: Pose = { fl: [0, 0], fr: [0, 0], hr: [4.2, 0.6, 12.6], hl: [-4.2, 0.6, 12.6], lean: 0, bob: 0, fall: 0, wk, wa: null, wb: null, flash: 0, act };
  if (anim === 'megy') {
    const ph = frame / 6 * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
    if (!mounted) {
      P.fl = [3.5 * s, Math.max(0, c) * 1.6]; P.fr = [-3.5 * s, Math.max(0, -c) * 1.6];
      P.bob = Math.abs(c) * 0.8 - 0.4;
      P.hl = [-4.2, 0.6 - 2.6 * s, 12.8];
      if (!wk) P.hr = [4.2, 0.6 + 2.6 * s, 12.8];
    }
  }
  if (anim === 'all' && frame === 1) { P.hr[2] += 0.5; P.hl[2] += 0.5; P.bob = 0.25; }
  if (anim === 'hal') {
    P.fall = [0.22, 0.55, 0.9, 1, 1][frame];
    P.hr = [5.5, -1, 20]; P.hl = [-5.5, -1, 20];
    if (frame > 0) P.wk = null;
  }
  const w = P.wk;
  if (!w) {
    if (act) { // puszta kézzel (kezelő az ágyúnál)
      P.hr = [3.5, 5, 16]; P.lean = [0.5, 1, -0.6, -1, 0][frame];
    }
    return P;
  }
  if (w === 'pika' || w === 'lancsa') {
    const len = w === 'pika' ? 34 : 27;
    if (act) {
      const o = [0, -3, 6, 7, 2][frame], z = mounted ? 13.5 : 15.2, r = mounted ? 4.3 : 2.8;
      P.wa = [r, -12 + o, z]; P.wb = [r, len - 12 + o, z + 0.6];
      P.hr = [r + 0.4, -3 + o, z]; if (!mounted) P.hl = [-0.5, 4.5 + o * 0.6, z - 0.4];
      P.lean = o * 0.25;
    } else {
      const z0 = mounted ? 5 : 0.6;
      P.wa = [4.7, 1, z0]; P.wb = [4.5, anim === 'megy' && !mounted ? -1.5 : 0.6, z0 + len];
      P.hr = [4.5, 1, 14];
    }
  } else if (w === 'puska' || w === 'musketa') {
    if (act) {
      const S: V3[] = [[2.6, 1, 16.5], [2.4, 1.5, 19.6], [2.4, 1.5, 19.6], [2.4, 0.4, 19.9], [3, 1, 15.5]];
      const M: V3[] = [[2.6, 11.5, 20.5], [2.4, 15, 20], [2.4, 15, 20], [2.4, 13.6, 21.4], [3, 11, 19.5]];
      P.wa = S[frame]; P.wb = M[frame];
      P.hr = add(S[frame], [0.6, 2.5, -0.6]); P.hl = add(lerp(S[frame], M[frame], 0.55), [-0.6, 0, -0.9]);
      P.flash = frame === 2 ? 1 : frame === 3 ? 2 : 0;
      P.lean = frame === 3 ? -0.8 : 0.5;
    } else { P.wa = [3.8, 1.6, 12.6]; P.wb = [3.3, -2.8, 28]; P.hr = [3.8, 1.6, 13.4]; }
  } else {
    const len = WLEN[w] ?? 8;
    if (act) {
      const HR: V3[] = [[4.6, -1.5, 23], [4, 0.5, 26], [3.4, 6, 19.5], [2.6, 6.5, 13.5], [4, 2.5, 13]];
      const D = [[0, -4, 6], [0, -2, 7], [0, 6.5, 3], [0, 6, -3.5], [0, 5.5, 1.5]];
      P.hr = HR[frame]; P.wa = P.hr; P.wb = add(P.hr, dirv(D[frame], len));
      P.lean = [-0.5, 0, 1.6, 2, 0.6][frame];
    } else if (w === 'szablya' || w === 'kard') {
      if (mounted) { P.hr = [4.6, 1, 15]; P.wa = P.hr; P.wb = add(P.hr, dirv([0.6, 1, 4], len)); }
      else { P.wa = P.hr; P.wb = add(P.hr, dirv([0.3, 5, -1.6], len)); }
    } else { P.wa = [3.9, 1.6, 13.2]; P.wb = [3.4, -2.6, 13.2 + len + 3]; P.hr = [3.9, 1.6, 13.6]; }
  }
  return P;
}

function drawWeapon(S: Scene, k: string, a: V3, b: V3, flash: number, T: typeof TEAM[0], act: boolean): void {
  const d = dirv([b[0] - a[0], b[1] - a[1], b[2] - a[2]], 1);
  if (k === 'szablya' || k === 'kard') {
    const m = add(lerp(a, b, 0.55), k === 'szablya' ? [0, -0.5, 0.9] : [0, 0, 0]);
    S.line(a, m, BLADE, 0.3); S.line(m, b, BLADE, 0.3);
    S.ell(a, 1, 1, GOLD, 0.35, true);
  } else if (k === 'pika' || k === 'lancsa') {
    const t = lerp(a, b, 0.91);
    S.line(a, t, WOOD, 0.3); S.line(t, b, BLADE, 0.3);
    if (k === 'lancsa') { const p1 = lerp(a, b, 0.88), p2 = lerp(a, b, 0.74); S.poly([p1, p2, add(lerp(a, b, 0.8), act ? [0, 0, 3.5] : [0, -4.5, -0.5])], T.m, 0.32); }
  } else if (k === 'puska' || k === 'musketa') {
    S.cap(a, lerp(a, b, 0.34), 1, WOODD, 0.3);
    S.line(lerp(a, b, 0.3), b, [112, 114, 126], 0.3);
    if (k === 'musketa' && act) { const p = lerp(a, b, 0.72); S.line(p, [p[0] - 1, p[1], 0.5], WOOD, 0.28); }
    if (flash === 1) { S.ell(add(b, dirv(d, 2.2)), 2.4, 2.4, [255, 226, 120], 0.6, true); S.ell(add(b, dirv(d, 4.5)), 1.4, 1.4, [255, 250, 220], 0.62, true); }
    if (flash === 2) S.ell(add(b, dirv(d, 3.4)), 2.8, 2.6, [218, 216, 208], 0.6);
  } else {
    S.line(a, b, WOOD, 0.3);
    if (k === 'fejsze') S.cap(add(b, [0, 0.4, -0.6]), add(b, [0, 2.2, -1]), 1.5, STEEL, 0.32);
    else if (k === 'kalapacs') S.cap(add(b, [0, -1.5, 0]), add(b, [0, 1.5, 0]), 1.3, IRON, 0.32);
    else S.cap(add(b, [0, -2.6, -0.9]), add(b, [0, 2.6, -0.9]), 0.8, [120, 124, 136], 0.32);
  }
}

function hat(S: Scene, L: Look, hc: V3, T: typeof TEAM[0]): void {
  const z = hc[2] + 2.3, f = hc[1], c = L.hatc ?? [70, 56, 48];
  const p = (r: number, df: number, dz: number): V3 => [r, f + df, z + dz];
  const feather = (h: number) => { if (!L.feather) return; S.line(p(1.2, -0.5, 1.5), p(1.8, -2.4, h), L.feather, 1); S.line(p(0.4, -0.6, 1.5), p(1, -2.6, h - 1), L.feather, 1); };
  switch (L.hat) {
    case 'kalap': S.ell(p(0, 0, -0.3), 4.9, 2.4, shade(c, 0.85), 0.7); S.cap(p(0, 0, 0.4), p(0, 0, 1.8), 2.1, c, 0.75); break;
    case 'szeles': S.ell(p(0, 0, -0.3), 5.8, 2.8, c, 0.7); S.cap(p(0, 0, 0.5), p(0, 0, 2.4), 2.2, shade(c, 1.15), 0.75); feather(6.5); break;
    case 'suveg': S.cap(p(0, 0, -0.9), p(0, 0, -0.4), 2.9, [84, 60, 44], 0.7); S.cap(p(0, 0, 0.3), p(0, -0.6, 2.4), 2.4, c, 0.75); feather(7.5); break;
    case 'sapka': S.cap(p(0, 0, -0.6), p(0, 0, 0.8), 2.6, c, 0.7); break;
    case 'turban': S.cap(p(-1, 0, 0.2), p(1, 0, 0.2), 2.9, [240, 236, 226], 0.7); S.ell(p(0, 0, 2.8), 1.1, 1.1, [196, 60, 48], 0.8, true); break;
    case 'kece': S.cap(p(0, 0, -0.2), p(0, -0.3, 5), 2.2, [244, 240, 230], 0.72); S.cap(p(0, -1, 5.4), p(0, -4.4, -1.5), 1.5, [226, 222, 210], 0.7); S.ell(p(0, 2.1, 0.6), 0.9, 0.9, GOLD, 0.9, true); break;
    case 'sisak': S.ell(p(0, 0, -0.9), 3, 2.6, L.armor ?? STEEL, 0.7); S.line(p(0, 0, 1.4), p(0, 0, 4), BLADE, 0.8);
      if (L.feather) S.cap(p(0, -0.5, 4), p(0, -1.5, 6), 1.1, L.feather, 0.82); break;
    case 'barett': S.ell(p(0, 0, 0.2), 5.2, 2.7, c, 0.7); S.ell(p(-0.6, 0, 0.9), 3, 1.6, shade(c, 1.2), 0.72); feather(6.5); break;
    case 'hegyes': S.cap(p(0, 0, -0.9), p(0, 0, -0.4), 2.9, [70, 50, 40], 0.7); S.cap(p(0, 0, 0.2), p(0, -0.4, 2.6), 2, c, 0.75); S.cap(p(0, -0.4, 2.8), p(0, -1.2, 5.4), 1, c, 0.78); break;
    case 'zart': S.ell([hc[0], hc[1] + 0.4, hc[2]], 3.1, 3.1, L.armor ?? STEEL, 0.75);
      if (S.fy > -0.3) S.line([-1.6, hc[1] + 2.9, hc[2] + 0.2], [1.6, hc[1] + 2.9, hc[2] + 0.2], [40, 40, 50], 0.95);
      S.cap(p(0, -0.6, 0.8), p(0, -2.2, 3.6), 1.4, T.m, 0.8); break;
  }
}

function human(S: Scene, L: Look, P: Pose, team: Team, mounted: boolean, carry: string): void {
  const T = TEAM[team];
  const col = (c: Col): RGB => c === 't' ? T.m : c === 'td' ? T.d : c === 'tl' ? T.l : c;
  const coat = col(L.coat), sleeve = col(L.sleeve ?? L.coat), tro = L.tro, boot = L.boot ?? shade(tro, 0.72), skin = L.skin ?? SKIN;
  const hz = 11 + P.bob, sz = 19.5 + P.bob, ln = P.lean;
  for (const sd of [-1, 1]) {
    const ft = sd < 0 ? P.fl : P.fr, hip: V3 = [sd * 1.7, 0, hz];
    let knee: V3, foot: V3;
    if (mounted) { knee = [sd * 3.5, 2.6, hz - 3.2]; foot = [sd * 3.8, 1.4, hz - 7]; }
    else { foot = [sd * 1.8, ft[0], ft[1] + 1]; knee = [sd * 1.8, ft[0] * 0.5 + 1, (hz + ft[1]) / 2 + 0.6]; }
    S.cap(hip, knee, L.legR ?? 1.5, tro); S.cap(knee, foot, 1.25, boot);
    if (!mounted) S.cap(foot, [foot[0], foot[1] + 1.3, foot[2] - 0.2], 1.1, shade(boot, 0.8));
  }
  if (L.len !== undefined && !mounted) S.cap([0, 0, L.len + 2], [0, ln * 0.3, hz + 2], 3.6, shade(coat, 0.88), 0.05);
  S.cap([0, 0, hz + 1.6], [0, ln, sz - 1.2], 3.1, L.armor ?? coat, 0.1);
  if (L.sash) S.cap([0, 0, hz + 1.1], [0, 0, hz + 2], 3.35, L.coat === 'td' ? GOLD : T.m, 0.12);
  if (L.apron) S.cap([0, 1.9, hz - 3], [0, 1.9 + ln * 0.5, sz - 4], 2.3, L.apron, 0.3);
  if (L.cape) S.cap([0, -2.8 + ln, sz + 0.6], [0, -4.6, hz - (mounted ? 0.5 : 4)], 3.3, col(L.cape), 0);
  for (const sd of [-1, 1]) {
    const sh: V3 = [sd * 3.7, ln, sz], hand = sd < 0 ? P.hl : P.hr;
    const el = add(lerp(sh, hand, 0.5), [sd * 0.9, -1, -0.9]);
    S.cap(sh, el, L.armR ?? 1.4, sleeve, 0.15); S.cap(el, hand, 1.2, sleeve, 0.15);
    S.ell(hand, 1.1, 1.1, skin, 0.2, true);
  }
  const hc: V3 = [0, ln * 1.15, 23.7 + P.bob];
  S.ell(hc, 2.7, 2.7, L.hair ?? [72, 50, 36], 0.3);
  if (L.hat !== 'zart' && S.fy > -0.35) {
    S.ell([0, hc[1] + 1.3, hc[2] - 0.3], 2.1, 2.1, skin, 0.5);
    if (L.stache && S.fy > 0.2) S.line([-1.4, hc[1] + 2.7, hc[2] - 1.4], [1.4, hc[1] + 2.7, hc[2] - 1.4], [64, 42, 30], 0.8);
  }
  hat(S, L, hc, T);
  if (L.shield) { const p: V3 = [-4.9, 1.2, 15.5 + P.bob]; S.ell(p, 3.4, 3.4, col(L.shield), 0.2); S.ell(p, 1.2, 1.2, GOLD, 0.25, true); }
  if (L.bow) { S.line([-1, -3.2, 13.5], [1.6, -3.5, 19.5], WOOD, 0.1); S.line([1.6, -3.5, 19.5], [-0.6, -3.2, 25.5], WOOD, 0.1); }
  if (L.flag) {
    const w = Math.sin(P.bob * 3 + P.fl[0]) * 0.8;
    S.cap([-4.6, -1, 8], [-4.6, -1, 40], 0.7, WOODD, 0.1);
    S.poly([[-4.6, -1.5, 39.5], [-6.5, -10, 38.5 + w], [-6.5, -10, 32.5 + w], [-4.6, -1.5, 33]], T.m, 0.12);
    S.poly([[-4.6, -1.5, 37.5], [-6.5, -10, 36.5 + w], [-6.5, -10, 34.8 + w], [-4.6, -1.5, 35.3]], T.l, 0.13);
    S.ell([-4.6, -1, 40.8], 1, 1, GOLD, 0.2, true);
  }
  if (carry === 'e') S.cap([-1.4, -3.2, 16.5], [1.4, -3.2, 19.5], 2.7, [208, 186, 132], 0.1);
  else if (carry === 'f') { S.cap([-2.6, -5.5, 21.6], [-2.6, 6, 21.6], 1.6, [130, 90, 54], 0.4); S.ell([-2.6, 6.4, 21.6], 1.3, 1.3, [206, 168, 112], 0.45, true); }
  else if (carry === 'k') S.cap([0, -3.4, 16.8], [0, -3.4, 18.4], 2.6, [152, 152, 148], 0.1);
  if (P.wk && P.wa && P.wb) drawWeapon(S, P.wk, P.wa, P.wb, P.flash, T, P.act);
}

// ---------------------------------------------------------------- négylábú
interface Quad { s: number; br: number; col: RGB; leg: RGB; mane: RGB; neck: [number, number, number]; head: [number, number, number]; tail: 'lo' | 'marha' | 'oz'; lh?: number; horns?: 'szarv' | 'agancs'; capa?: RGB; capaD?: RGB }
function quad(S: Scene, q: Quad, ph: number | null, gait: 'vagta' | 'lepes', bob: number): void {
  const s = q.s, br = q.br, lh = (q.lh ?? 11) * s, bz = lh + br * 0.6 + bob;
  const sn = ph === null ? 0 : Math.sin(ph), cs = ph === null ? 0 : Math.cos(ph), amp = gait === 'vagta' ? 4.6 * s : 2.6 * s;
  S.cap([0, -5.5 * s, bz], [0, 5 * s, bz + 0.5 * s], br, q.col);
  if (q.capa) {
    S.cap([0, -5.2 * s, bz + 0.3], [0, -0.3 * s, bz + 0.5], br + 0.3, q.capa, 0.05);
    S.cap([0, -0.2 * s, bz + 0.5], [0, 2.2 * s, bz + 0.6], br + 0.25, q.capaD ?? shade(q.capa, 0.7), 0.06);
  }
  for (const fb of [-1, 1]) for (const sd of [-1, 1]) {
    const k = gait === 'vagta' ? fb : fb * sd;
    const sw = amp * sn * k, lift = Math.max(0, cs * k) * 1.7 * s;
    const top: V3 = [sd * br * 0.55, fb * 4.6 * s, bz - br * 0.4], hoof: V3 = [sd * br * 0.55, fb * 4.6 * s + sw, 0.8 + lift];
    const knee = add(lerp(top, hoof, 0.5), [0, fb > 0 ? 0.9 : -0.9, 0.3]);
    S.cap(top, knee, 1.25 * Math.max(0.8, s), q.col); S.cap(knee, hoof, 0.95, q.leg);
  }
  const nb: V3 = [0, 5.2 * s, bz + 1.2 * s], nt: V3 = [0, q.neck[0] * s, bz + q.neck[1] * s], hd: V3 = [0, q.head[0] * s, bz + q.head[1] * s];
  S.cap(nb, nt, q.neck[2], q.col, 0.02);
  S.cap(add(nt, [0, 0.3, 0.4]), hd, q.head[2], q.col, 0.04);
  S.ell(add(hd, [0, 0.6, -0.2]), q.head[2] * 0.75, q.head[2] * 0.75, shade(q.col, 0.7), 0.05);
  if (q.tail === 'lo') {
    S.cap(add(nb, [0, -0.8, 2]), add(nt, [0, -1.4, 1.2]), 1, q.mane, 0.03);
    S.cap([0, -5.5 * s - br * 0.8, bz + 1], [0, -5.5 * s - br * 0.8 - 1.6 - sn, bz - 6.5], 1.25, q.mane);
    for (const sd of [-1, 1]) S.ell(add(nt, [sd * 0.9, -0.4, 2.4]), 0.7, 0.9, q.col, 0.06, true);
  } else if (q.tail === 'marha') {
    S.line([0, -5.5 * s - br * 0.8, bz + 1], [0, -5.5 * s - br - 0.6, bz - 7], shade(q.col, 0.75));
  } else S.ell([0, -5.5 * s - br * 0.7, bz + 0.8], 1.1, 1.1, WHITE, 0, true);
  if (q.horns === 'szarv') for (const sd of [-1, 1]) {
    const a: V3 = add(nt, [sd * 1.2, 1, 1.6]), b = add(a, [sd * 3.6, 0.4, 2.4]), c = add(b, [sd * 0.8, 0.2, 3.4]);
    S.line(a, b, [234, 228, 204], 0.07); S.line(b, c, [234, 228, 204], 0.07); S.ell(c, 0.6, 0.6, [60, 52, 48], 0.08, true);
  } else if (q.horns === 'agancs') for (const sd of [-1, 1]) {
    const a: V3 = add(nt, [sd * 0.7, 0, 1.8]), b = add(a, [sd * 2, -1.4, 4.5]);
    S.line(a, b, [164, 132, 92], 0.07); S.line(lerp(a, b, 0.5), add(a, [sd * 2.6, 1.4, 3.4]), [164, 132, 92], 0.07); S.line(b, add(b, [sd * 1.2, 0.8, 1.6]), [164, 132, 92], 0.07);
  }
}

// ---------------------------------------------------------------- építők
function buildFoot(L: Look, team: Team, dir: number, anim: UnitAnim, frame: number, carry: string): Sprite {
  const W = 96, H = 72, ax = 48, ay = 54, S = new Scene(dir, ax, ay), P = humanPose(L, anim, frame, false);
  S.fall = P.fall;
  if (carry === 'f') P.hl = [-3.2, 1.5, 20];
  human(S, L, P, team, false, carry);
  const b = new Buf(W, H); S.render(b); b.outline();
  const dead = anim === 'hal' && frame >= 3;
  return finish(b, ax, ay, dead ? null : [5.5, 2.6], anim === 'hal' && frame === 4 ? 0.8 : 1);
}

function buildCav(sp: Spec, team: Team, dir: number, anim: UnitAnim, frame: number): Sprite {
  const W = 96, H = 100, ax = 48, ay = 74, S = new Scene(dir, ax, ay), L = sp.L!, hl = sp.horse!, T = TEAM[team];
  const P = humanPose(L, anim, frame, true);
  const ph = anim === 'megy' ? frame / 6 * Math.PI * 2 : null, bob = ph === null ? 0 : Math.sin(ph + 0.6) * 0.9;
  if (anim === 'hal') { S.side = true; S.fall = P.fall; S.fr = 4.5; P.fall = 0; }
  const hs = hl.heavy ? 1.27 : 1.18;
  quad(S, { s: hs, br: hl.heavy ? 5.1 : 4.7, col: hl.col, leg: shade(hl.col, 0.62), mane: hl.mane, neck: [8.5, 7.5, 2.3], head: [12.5, 4.8, 1.75], tail: 'lo', lh: 9.6, capa: T.m, capaD: T.d }, ph, 'vagta', bob);
  S.pre = [0, -0.8, 5.5 * hs + bob];
  if (anim === 'megy') { P.lean = 0.8; }
  human(S, L, P, team, true, '');
  const b = new Buf(W, H); S.render(b); b.outline();
  const dead = anim === 'hal' && frame >= 3;
  return finish(b, ax, ay, dead ? null : [11, 4.8], anim === 'hal' && frame === 4 ? 0.8 : 1);
}

function wheel(S: Scene, r0: number, f0: number, R: number, rot: number): void {
  const N = 16, pts: V3[] = [], sp: V3[][] = [];
  for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; pts.push(S.pr([r0, f0 + R * Math.cos(a), R + R * Math.sin(a)])); }
  for (let k = 0; k < 4; k++) { const a = rot + k * Math.PI / 4; sp.push([S.pr([r0, f0 + R * Math.cos(a), R + R * Math.sin(a)]), S.pr([r0, f0 - R * Math.cos(a), R - R * Math.sin(a)])]); }
  const c = S.pr([r0, f0, R]);
  S.custom(c[2], b => {
    for (const q of sp) b.line(q[0][0], q[0][1], q[1][0], q[1][1], [128, 92, 56]);
    for (let i = 0; i < N; i++) { const p = pts[i], q = pts[(i + 1) % N]; b.line(p[0], p[1], q[0], q[1], [78, 56, 40]); b.line(p[0], p[1] + 1, q[0], q[1] + 1, [78, 56, 40]); }
    b.cap(c[0], c[1], c[0], c[1], 1.1, IRON, true);
  });
}

function buildSiege(sp: Spec, team: Team, dir: number, anim: UnitAnim, frame: number): Sprite {
  const W = 128, H = 104, ax = 64, ay = 72, S = new Scene(dir, ax, ay), G = sp.gun!, T = TEAM[team];
  const act = anim === 'tamad' || anim === 'munka';
  const rc = act ? [0, -3.2, -2.2, -1, 0][frame] * (G.mortar ? 0.4 : 1) : 0;
  const rot = anim === 'megy' ? frame * Math.PI / 12 : 0;
  const fall = anim === 'hal' ? [0.2, 0.5, 0.8, 1, 1][frame] : 0;
  S.side = true; S.fall = fall * 0.5; S.fr = 2;
  const wr = G.wr, wx = G.br + 2.6;
  let tip: V3, fd: V3;
  if (G.mortar) {
    S.cap([0, -4.5 + rc, 3.4], [0, 4.5 + rc, 3.4], 3.3, WOODD);
    S.cap([0, -4.5 + rc, 5.2], [0, 4.5 + rc, 5.2], 2.4, WOOD, 0.02);
    wheel(S, -wx - 0.6, -3 + rc, wr, rot); wheel(S, wx + 0.6, -3 + rc, wr, rot);
    wheel(S, -wx - 0.6, 3.4 + rc, wr, rot); wheel(S, wx + 0.6, 3.4 + rc, wr, rot);
    const a: V3 = [0, -1.2 + rc, 6.5]; tip = [0, 3.4 + rc, 13.5];
    S.cap(a, tip, G.br, G.col, 0.1);
    S.cap(lerp(a, tip, 0.3), lerp(a, tip, 0.42), G.br + 0.5, T.m, 0.12);
    S.ell(add(tip, [0, 0.6, 1.1]), G.br - 0.6, (G.br - 0.6) * 0.7, [36, 30, 30], 0.2, true);
    fd = dirv([0, 4.6, 7], 1);
  } else {
    wheel(S, -wx, rc, wr, rot); wheel(S, wx, rc, wr, rot);
    S.line([-wx, rc, wr], [wx, rc, wr], IRON, -0.05);
    S.cap([0, -3 + rc, wr + 0.2], [0, 4 + rc, wr + 1], G.br + 0.7, WOODD);
    S.cap([0, -4 + rc, wr - 0.5], [0, -wr * 2 - 4 + rc, 1.2], 1.4, WOOD);
    const a: V3 = [0, -3.2 + rc, wr + 2.4]; tip = [0, G.bl - 3.2 + rc, wr + 3.6];
    S.cap(a, tip, G.br, G.col, 0.1);
    S.cap(lerp(a, tip, 0.12), lerp(a, tip, 0.24), G.br + 0.45, T.m, 0.12);
    S.cap(lerp(a, tip, 0.93), tip, G.br + 0.5, shade(G.col, 0.8), 0.12);
    S.ell(add(a, [0, -1, 0]), G.br * 0.6, G.br * 0.6, shade(G.col, 0.7), 0.05);
    if (S.fy > 0.2) S.ell(add(tip, [0, 0.8, 0]), G.br * 0.55, G.br * 0.55, [30, 26, 28], 0.3, true);
    fd = dirv([0, G.bl, 1.2], 1);
  }
  if (act && frame === 1) { S.ell(add(tip, dirv(fd, G.br + 3)), G.br + 3, G.br + 2.6, [255, 220, 110], 0.6, true); S.ell(add(tip, dirv(fd, G.br + 6.5)), G.br + 1, G.br + 0.8, [255, 250, 224], 0.62, true); }
  if (act && (frame === 2 || frame === 3)) { const k = frame === 2 ? 1 : 1.35; S.ell(add(tip, dirv(fd, 5 * k)), (G.br + 3) * k, (G.br + 2.4) * k, frame === 2 ? [226, 222, 212] : [196, 194, 188], 0.6); S.ell(add(tip, [fd[0] * 8 * k, fd[1] * 8 * k, fd[2] * 8 * k + 2]), (G.br + 1.6) * k, (G.br + 1.2) * k, [208, 206, 198], 0.61); }
  const crew = sp.crew ?? [];
  crew.forEach((L, i) => {
    const P = humanPose(L, anim === 'munka' ? 'tamad' : anim, frame, false);
    S.side = false; S.fall = P.fall; S.pre = [0, 0, 0];
    S.off = [i === 0 ? -(wx + 6.5) : wx + 6.5, i === 0 ? -5 : -8, 0];
    human(S, L, P, team, false, '');
  });
  S.off = [0, 0, 0];
  const b = new Buf(W, H); S.render(b); b.outline();
  const dead = anim === 'hal' && frame >= 3;
  return finish(b, ax, ay, dead ? null : [wx + 5, Math.max(4, wx * 0.6 + 2)], anim === 'hal' ? 1 - fall * 0.28 : 1);
}

const HULL_O = [[0, 33], [4.2, 25], [6.5, 12], [6.8, -8], [5.4, -22], [2.5, -27], [-2.5, -27], [-5.4, -22], [-6.8, -8], [-6.5, 12], [-4.2, 25]];
function buildShip(team: Team, dir: number, anim: UnitAnim, frame: number): Sprite {
  const W = 152, H = 132, ax = 76, ay = 94, S = new Scene(dir, ax, ay), T = TEAM[team];
  const sink = anim === 'hal' ? [0.15, 0.4, 0.65, 0.85, 1][frame] : 0;
  const water = HULL_O.map(p => S.pr([p[0] * 0.85, p[1], 0]));
  S.off = [0, 0, -sink * 15];
  const HULL: RGB = [92, 64, 44], DECK: RGB = [158, 124, 82], SAIL: RGB = [230, 220, 194];
  const n = HULL_O.length;
  for (let i = 0; i < n; i++) {
    const A = HULL_O[i], B = HULL_O[(i + 1) % n];
    const nr = B[1] - A[1], nf = -(B[0] - A[0]), nx = (nr * S.rx + nf * S.fx) / (Math.hypot(nr, nf) || 1);
    const k = 1 - nx * 0.22;
    S.poly([[A[0], A[1], 6.5], [B[0], B[1], 6.5], [B[0] * 0.8, B[1] * 0.98, 0], [A[0] * 0.8, A[1] * 0.98, 0]], shade(HULL, k));
    S.poly([[A[0], A[1], 6.6], [B[0], B[1], 6.6], [B[0], B[1], 4.4], [A[0], A[1], 4.4]], shade(T.m, k), 0.01);
  }
  S.poly(HULL_O.map(p => [p[0] * 0.93, p[1] * 0.97, 5] as V3), DECK, 0.02);
  for (const f of [-15, -5, 13]) S.line([-6, f, 5.3], [6, f, 5.3], WOODD, 0.04);
  const ph = anim === 'megy' ? frame / 6 * Math.PI * 2 : null;
  if (anim !== 'hal') for (const f of [-17, -8, 1, 10]) for (const sd of [-1, 1]) {
    const sw = ph === null ? 0 : Math.sin(ph) * 4.5, lift = ph === null ? 0 : Math.max(0, Math.cos(ph)) * 2.5;
    S.line([sd * 6.6, f, 5.6], [sd * 14.5, f - 2 + sw, 0.4 + lift], [178, 140, 88], 0.05);
  }
  S.cap([0, 4, 5], [0, 4, 47], 0.9, WOOD, 0.3);
  const E1: V3 = [9.2, 7.8, 41], E2: V3 = [-9.2, 0.2, 41], F1: V3 = [8.4, 7.5, 17], F2: V3 = [-8.4, 0.5, 17];
  S.poly([E1, E2, F2, F1], SAIL, 0.32);
  S.poly([lerp(E1, E2, 0.36), lerp(E1, E2, 0.64), lerp(F1, F2, 0.64), lerp(F1, F2, 0.36)], T.m, 0.33);
  for (const t of [0.33, 0.66]) S.line(lerp(E1, F1, t), lerp(E2, F2, t), shade(SAIL, 0.82), 0.34);
  S.line(E1, E2, WOODD, 0.35); S.line(F1, F2, shade(SAIL, 0.7), 0.35);
  const w = ph === null ? 0 : Math.sin(ph) * 0.8;
  S.poly([[0, 4, 51], [0, -4.5, 49.5 + w], [0, 4, 48]], T.m, 0.4);
  [[2.6, -18], [-2.6, -9], [2.6, 0], [-2.6, 9], [0, -24]].forEach(([r, f]) => {
    S.cap([r, f, 6.2], [r, f, 9.2], 1.9, T.m, 0.1); S.ell([r, f, 11.4], 1.7, 1.7, SKIN, 0.12); S.ell([r, f, 12.9], 1.9, 1.1, [64, 48, 42], 0.14);
  });
  S.cap([0, 21, 8], [0, 29.5, 8.6], 1.5, IRON, 0.2);
  S.cap([0, 20, 6.6], [0, 24, 6.6], 1.6, WOODD, 0.15);
  const act = anim === 'tamad' || anim === 'munka';
  if (act && frame === 1) { S.ell([0, 33.5, 9], 3.6, 3.2, [255, 222, 112], 0.6, true); S.ell([0, 37, 9], 1.8, 1.6, [255, 250, 224], 0.62, true); }
  if (act && (frame === 2 || frame === 3)) S.ell([0, 34 + frame, 9.5 + frame], 3 + frame, 2.6 + frame * 0.8, [218, 216, 208], 0.6);
  if (anim === 'megy') { S.ell([0, 33.5, 0.2], 3, 1.4, [232, 242, 248], 0.5, true); if (frame % 2) S.ell([0, -28, 0.2], 3.4, 1.5, [214, 230, 240], -0.5, true); }
  const b = new Buf(W, H); S.render(b); b.outline();
  if (sink > 0) {
    let xmin = 1e9, xmax = -1e9; for (const p of water) { xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]); }
    for (let x = 0; x < W; x++) {
      let ym = -1e9; const sx = x + 0.5;
      if (sx >= xmin && sx <= xmax) for (let i = 0; i < n; i++) {
        const A = water[i], B = water[(i + 1) % n];
        if ((A[0] <= sx && B[0] >= sx) || (B[0] <= sx && A[0] >= sx)) { const t = B[0] === A[0] ? 0 : (sx - A[0]) / (B[0] - A[0]); ym = Math.max(ym, A[1] + t * (B[1] - A[1])); }
      } else ym = ay - 2;
      for (let y = Math.max(0, Math.ceil(ym)); y < H; y++) b.clear(x, y);
      if (sx >= xmin && sx <= xmax && hash2(x, frame, 7) > 0.45 && b.a(x, Math.ceil(ym) - 1)) b.set(x, Math.ceil(ym) - 1, [232, 242, 248]);
    }
  }
  return finish(b, ax, ay, null, 1, o => { if (sink < 0.6) o.poly(water.map(p => [p[0] + 3, p[1] + 2.5]), [8, 20, 36], 80); });
}

// ---------------------------------------------------------------- nyilvános felület
const cache = new Map<string, Sprite>();

export function unitSprite(id: string, team: Team, dir: number, anim: UnitAnim, frame: number, opts?: UnitSpriteOpts): Sprite {
  const sp = SPECS[id] ?? SPECS.darabont;
  const n = UNIT_FRAMES[anim];
  frame = ((frame % n) + n) % n; dir = ((dir % 8) + 8) % 8;
  const carry = sp.k === 'f' && sp.L!.tool && opts?.carry ? opts.carry : '';
  const key = id + '|' + team + '|' + dir + '|' + anim + '|' + frame + '|' + carry;
  let s = cache.get(key);
  if (!s) {
    s = sp.k === 'f' ? buildFoot(sp.L!, team, dir, anim, frame, carry)
      : sp.k === 'l' ? buildCav(sp, team, dir, anim, frame)
        : sp.k === 's' ? buildSiege(sp, team, dir, anim, frame) : buildShip(team, dir, anim, frame);
    cache.set(key, s);
  }
  return s;
}

const DEER: Quad = { s: 0.95, br: 3.3, col: [176, 124, 74], leg: [120, 84, 54], mane: [120, 84, 54], neck: [7.2, 8.4, 1.8], head: [10.6, 8, 1.55], tail: 'oz', horns: 'agancs' };
const COW: Quad = { s: 1.08, br: 5.3, lh: 8, col: [212, 206, 194], leg: [150, 144, 138], mane: [150, 144, 138], neck: [8.2, 3.6, 3.2], head: [11.8, 1.6, 2.4], tail: 'marha', horns: 'szarv' };

export function animalSprite(kind: 'szarvas' | 'marha', dir: number, frame: number): Sprite {
  frame = ((frame % 4) + 4) % 4; dir = ((dir % 8) + 8) % 8;
  const key = 'a|' + kind + '|' + dir + '|' + frame;
  let s = cache.get(key);
  if (!s) {
    const W = 72, H = 64, ax = 36, ay = 46, S = new Scene(dir, ax, ay);
    quad(S, kind === 'szarvas' ? DEER : COW, frame === 0 ? null : (frame - 1) / 3 * Math.PI * 2, 'lepes', 0);
    const b = new Buf(W, H); S.render(b); b.outline();
    s = finish(b, ax, ay, kind === 'szarvas' ? [8, 3.6] : [10.5, 4.6]);
    cache.set(key, s);
  }
  return s;
}
