// Kis szoftveres izometrikus raszterező (mélységpufferrel), anyagok, valamint a térképobjektumok:
// fák, tuskó, kőlelőhely, falu. A buildings.ts ugyanezt a magot használja.
import { Season, Sprite } from './api';
import { g2, hash2, mk, RGB, rng } from './pal';

export type V3 = [number, number, number];
export type Mat = (s: number, t: number) => RGB | null;

const SHU = 0.013, SHV = -0.004; // árnyékvetés: csempe / magasság-pixel
const DARK: RGB = [20, 16, 34], WARM: RGB = [255, 244, 214];

export function mul(c: RGB, f: number): RGB {
  return f <= 1 ? [DARK[0] + (c[0] - DARK[0]) * f, DARK[1] + (c[1] - DARK[1]) * f, DARK[2] + (c[2] - DARK[2]) * f]
    : [c[0] + (WARM[0] - c[0]) * Math.min(1, f - 1), c[1] + (WARM[1] - c[1]) * Math.min(1, f - 1), c[2] + (WARM[2] - c[2]) * Math.min(1, f - 1)];
}
function litOf(a: V3, b: V3, c: V3): number {
  const e1 = [(b[0] - a[0]) * 40, (b[1] - a[1]) * 40, b[2] - a[2]], e2 = [(c[0] - a[0]) * 40, (c[1] - a[1]) * 40, c[2] - a[2]];
  let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
  const l = Math.hypot(nx, ny, nz);
  if (l < 1e-9) return 1;
  if (nx + ny + 0.8 * nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
  return 0.78 + 0.26 * (ny - nx) / l + 0.30 * nz / l;
}

export class Buf {
  d: Uint8ClampedArray; z: Float32Array;
  clipZ = Infinity;
  private sh: { pts: [number, number][]; z: number }[] = [];
  constructor(public w: number, public h: number, public ox: number, public oy: number) {
    this.d = new Uint8ClampedArray(w * h * 4); this.z = new Float32Array(w * h).fill(-1e9);
  }
  /** Lábnyomhoz és magassághoz méretezett puffer; az origó a lábnyom (0,0) sarka. */
  static forFoot(fw: number, fh: number, zmax: number): Buf {
    const ml = 28, mr = 28 + zmax * 0.7, mt = zmax + 20, mb = 24 + zmax * 0.2;
    return new Buf(Math.ceil(fh * 32 + fw * 32 + ml + mr), Math.ceil((fw + fh) * 16 + mt + mb), Math.ceil(fh * 32 + ml), Math.ceil(mt));
  }
  sx(p: V3): number { return this.ox + (p[0] - p[1]) * 32; }
  sy(p: V3): number { return this.oy + (p[0] + p[1]) * 16 - p[2]; }

  tri(a: V3, b: V3, c: V3, ta: [number, number], tb: [number, number], tc: [number, number], mat: Mat, lit?: number, bias = 0): void {
    const ax = this.sx(a), ay = this.sy(a), bx = this.sx(b), by = this.sy(b), cx = this.sx(c), cy = this.sy(c);
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-6) return;
    if (lit === undefined) lit = litOf(a, b, c);
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(this.w - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(this.h - 1, Math.ceil(Math.max(ay, by, cy)));
    const da = a[0] + a[1], db = b[0] + b[1], dc = c[0] + c[1], E = 1e-4;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
      const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -E || w1 < -E || w2 < -E) continue;
      if (w0 * a[2] + w1 * b[2] + w2 * c[2] > this.clipZ) continue;
      const depth = w0 * da + w1 * db + w2 * dc + bias, i = y * this.w + x;
      if (depth <= this.z[i]) continue;
      const col = mat(w0 * ta[0] + w1 * tb[0] + w2 * tc[0], w0 * ta[1] + w1 * tb[1] + w2 * tc[1]);
      if (!col) continue;
      const m = lit === 1 ? col : mul(col, lit);
      this.z[i] = depth; this.d[i * 4] = m[0]; this.d[i * 4 + 1] = m[1]; this.d[i * 4 + 2] = m[2]; this.d[i * 4 + 3] = 255;
    }
  }
  /** Paralelogramma: O, O+A, O+B, O+A+B; a textúra s ∈ [0,La], t ∈ [0,Lb]. */
  quad(O: V3, A: V3, B: V3, La: number, Lb: number, mat: Mat, lit?: number, bias = 0): void {
    const p1: V3 = [O[0] + A[0], O[1] + A[1], O[2] + A[2]], p2: V3 = [O[0] + B[0], O[1] + B[1], O[2] + B[2]];
    const p3: V3 = [p1[0] + B[0], p1[1] + B[1], p1[2] + B[2]];
    if (lit === undefined) lit = litOf(O, p1, p2);
    this.tri(O, p1, p2, [0, 0], [La, 0], [0, Lb], mat, lit, bias);
    this.tri(p1, p3, p2, [La, 0], [La, Lb], [0, Lb], mat, lit, bias);
  }
  /** Függőleges fal (u0,v0)→(u1,v1) között; t alulról mér. */
  wall(u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, mat: Mat, lit?: number, bias = 0): void {
    this.quad([u0, v0, z0], [u1 - u0, v1 - v0, 0], [0, 0, z1 - z0], Math.hypot(u1 - u0, v1 - v0) * 36, z1 - z0, mat, lit, bias);
  }
  top(u0: number, v0: number, u1: number, v1: number, z: number, mat: Mat, lit?: number, bias = 0): void {
    this.quad([u0, v0, z], [u1 - u0, 0, 0], [0, v1 - v0, 0], (u1 - u0) * 36, (v1 - v0) * 36, mat, lit, bias);
  }
  shadow(pts: [number, number][], z: number): void { this.sh.push({ pts, z }); }
  box(u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, side: Mat, topM: Mat | null, shadow = true): void {
    this.wall(u0, v1, u1, v1, z0, z1, side);
    this.wall(u1, v0, u1, v1, z0, z1, side);
    if (topM) this.top(u0, v0, u1, v1, z1, topM);
    if (shadow) this.shadow([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], z1);
  }
  /** Sokszög alapú hasáb; a fal anyaga s mentén folytonos. inset: a tető befelé húzása (rézsű). */
  prism(pts: [number, number][], z0: number, z1: number, side: Mat, topM: Mat | null, inset = 0, shadow = true): void {
    let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
    const tp = pts.map(p => [p[0] + (cx - p[0]) * inset, p[1] + (cy - p[1]) * inset] as [number, number]);
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], ta = tp[i], tb = tp[(i + 1) % pts.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) * 36, H = z1 - z0;
      const A: V3 = [a[0], a[1], z0], B: V3 = [b[0], b[1], z0], C: V3 = [ta[0], ta[1], z1], D: V3 = [tb[0], tb[1], z1];
      const lit = litOf(A, B, C);
      this.tri(A, B, C, [s, 0], [s + L, 0], [s, H], side, lit);
      this.tri(B, D, C, [s + L, 0], [s + L, H], [s, H], side, lit);
      s += L;
    }
    if (topM) for (let i = 1; i < tp.length - 1; i++) {
      const a = tp[0], b = tp[i], c = tp[i + 1];
      this.tri([a[0], a[1], z1], [b[0], b[1], z1], [c[0], c[1], z1], [a[0] * 36, a[1] * 36], [b[0] * 36, b[1] * 36], [c[0] * 36, c[1] * 36], topM, 1.08);
    }
    if (shadow) this.shadow(pts, z1);
  }
  ngon(cu: number, cv: number, r: number, n = 14, rot = 0): [number, number][] {
    const p: [number, number][] = [];
    for (let i = 0; i < n; i++) { const a = rot + i / n * Math.PI * 2; p.push([cu + Math.cos(a) * r, cv + Math.sin(a) * r]); }
    return p;
  }
  cyl(cu: number, cv: number, r: number, z0: number, z1: number, side: Mat, topM: Mat | null, n = 14, inset = 0): void {
    this.prism(this.ngon(cu, cv, r, n), z0, z1, side, topM, inset);
  }
  /** Gúla/kúp tetszőleges alapra, csúcs (au,av,za). */
  spire(pts: [number, number][], z0: number, au: number, av: number, za: number, mat: Mat, shadow = true): void {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) * 36;
      const mu = (a[0] + b[0]) / 2, mv = (a[1] + b[1]) / 2, H = Math.hypot((au - mu) * 36, (av - mv) * 36, za - z0);
      this.tri([a[0], a[1], z0], [b[0], b[1], z0], [au, av, za], [s, 0], [s + L, 0], [s + L / 2, H], mat);
      s += L;
    }
    if (shadow) this.shadow(pts, (z0 + za) / 2);
  }
  /** Félgömb-kupola. */
  dome(cu: number, cv: number, r: number, z0: number, hz: number, mat: Mat, n = 16, rings = 5): void {
    for (let k = 0; k < rings; k++) {
      const a0 = k / rings * Math.PI / 2, a1 = (k + 1) / rings * Math.PI / 2;
      const r0 = r * Math.cos(a0), r1 = r * Math.cos(a1), h0 = z0 + hz * Math.sin(a0), h1 = z0 + hz * Math.sin(a1);
      for (let i = 0; i < n; i++) {
        const b0 = i / n * Math.PI * 2, b1 = (i + 1) / n * Math.PI * 2;
        const A: V3 = [cu + Math.cos(b0) * r0, cv + Math.sin(b0) * r0, h0], B: V3 = [cu + Math.cos(b1) * r0, cv + Math.sin(b1) * r0, h0];
        const C: V3 = [cu + Math.cos(b0) * r1, cv + Math.sin(b0) * r1, h1], D: V3 = [cu + Math.cos(b1) * r1, cv + Math.sin(b1) * r1, h1];
        const s0 = i * r * 16 / n * 6, s1 = (i + 1) * r * 16 / n * 6, t0 = k * 5, t1 = k * 5 + 5;
        const lit = litOf(A, B, C);
        this.tri(A, B, C, [s0, t0], [s1, t0], [s0, t1], mat, lit);
        if (r1 > 1e-3) this.tri(B, D, C, [s1, t0], [s1, t1], [s0, t1], mat, lit);
      }
    }
    this.shadow(this.ngon(cu, cv, r, 10), z0 + hz * 0.6);
  }
  /**
   * Nyeregtető. axis 'u': gerinc az u tengely mentén; ov: túlnyúlás csempében. A tető t koordinátája az ereszről indul.
   * gableM: az oromfal anyaga (null: nincs oromfal).
   */
  gable(u0: number, v0: number, u1: number, v1: number, z0: number, zr: number, axis: 'u' | 'v', ov: number, roof: Mat, gableM: Mat | null, shadow = true): void {
    if (axis === 'u') {
      const vm = (v0 + v1) / 2, half = (v1 - v0) / 2, k = (zr - z0) / half, ze = z0 - ov * k;
      const L = (u1 - u0 + 2 * ov) * 36, S = Math.hypot((half + ov) * 36, zr - ze);
      this.quad([u0 - ov, v1 + ov, ze], [u1 - u0 + 2 * ov, 0, 0], [0, -(half + ov), zr - ze], L, S, roof);
      this.quad([u0 - ov, v0 - ov, ze], [u1 - u0 + 2 * ov, 0, 0], [0, half + ov, zr - ze], L, S, roof);
      if (gableM) this.tri([u1, v0, z0], [u1, v1, z0], [u1, vm, zr], [0, 0], [half * 72, 0], [half * 36, zr - z0], gableM, 0.56);
    } else {
      const um = (u0 + u1) / 2, half = (u1 - u0) / 2, k = (zr - z0) / half, ze = z0 - ov * k;
      const L = (v1 - v0 + 2 * ov) * 36, S = Math.hypot((half + ov) * 36, zr - ze);
      this.quad([u1 + ov, v0 - ov, ze], [0, v1 - v0 + 2 * ov, 0], [-(half + ov), 0, zr - ze], L, S, roof);
      this.quad([u0 - ov, v0 - ov, ze], [0, v1 - v0 + 2 * ov, 0], [half + ov, 0, zr - ze], L, S, roof);
      if (gableM) this.tri([u0, v1, z0], [u1, v1, z0], [um, v1, zr], [0, 0], [half * 72, 0], [half * 36, zr - z0], gableM, 1.0);
    }
    if (shadow) this.shadow([[u0 - ov, v0 - ov], [u1 + ov, v0 - ov], [u1 + ov, v1 + ov], [u0 - ov, v1 + ov]], (z0 + zr) / 2);
  }
  pyramid(u0: number, v0: number, u1: number, v1: number, z0: number, za: number, mat: Mat, ov = 0, shadow = true): void {
    const k = ov ? (za - z0) / ((u1 - u0) / 2) * ov : 0;
    this.spire([[u0 - ov, v0 - ov], [u1 + ov, v0 - ov], [u1 + ov, v1 + ov], [u0 - ov, v1 + ov]], z0 - k, (u0 + u1) / 2, (v0 + v1) / 2, za, mat, shadow);
  }
  /** Vékony 3D vonal (rúd, kötél, állvány). */
  line(a: V3, b: V3, col: RGB, thick = 1, bias = 0.03): void {
    const ax = this.sx(a), ay = this.sy(a), bx = this.sx(b), by = this.sy(b);
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
    for (let i = 0; i <= n; i++) {
      const t = i / n, z = a[2] + (b[2] - a[2]) * t;
      if (z > this.clipZ) continue;
      const x = Math.round(ax + (bx - ax) * t - 0.5), y = Math.round(ay + (by - ay) * t - 0.5);
      const depth = a[0] + a[1] + (b[0] + b[1] - a[0] - a[1]) * t + bias;
      for (let k = 0; k < thick; k++) this.put(x + k, y, k ? mul(col, 0.7) : col, depth);
    }
  }
  put(x: number, y: number, col: RGB, depth: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (depth <= this.z[i]) return;
    this.z[i] = depth; this.d[i * 4] = col[0]; this.d[i * 4 + 1] = col[1]; this.d[i * 4 + 2] = col[2]; this.d[i * 4 + 3] = 255;
  }
  /** Képernyőtérbeli folt egy 3D pont köré (zászló, apró kellék). f(i,j) → szín vagy null. */
  decal(p: V3, dx: number, dy: number, w: number, h: number, f: (i: number, j: number) => RGB | null, bias = 0.05): void {
    if (p[2] > this.clipZ) return;
    const X = Math.round(this.sx(p)) + dx, Y = Math.round(this.sy(p)) + dy, depth = p[0] + p[1] + bias;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = f(i, j); if (c) this.put(X + i, Y + j, c, depth); }
  }

  /** Kontúr, árnyék, vágás. anchor: a horgony talajpontja (u,v). */
  finish(au: number, av: number, outline = true): Sprite {
    const { w, h, d, z } = this;
    if (outline) {
      const f = new Float32Array(w * h).fill(1);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!d[i * 4 + 3]) continue;
        const r = x + 1 < w ? i + 1 : -1, b = y + 1 < h ? i + w : -1, l = x > 0 ? i - 1 : -1, t = y > 0 ? i - w : -1;
        const er = r < 0 || !d[r * 4 + 3], eb = b < 0 || !d[b * 4 + 3], el = l < 0 || !d[l * 4 + 3], et = t < 0 || !d[t * 4 + 3];
        if (er || eb) f[i] = 0.5;
        else if (el || et) f[i] = 0.72;
        else {
          const zi = z[i];
          if (z[r] - zi > 0.16 || z[b] - zi > 0.16 || z[l] - zi > 0.16 || z[t] - zi > 0.16) f[i] = 0.7;
        }
      }
      for (let i = 0; i < w * h; i++) if (f[i] < 1) {
        d[i * 4] = DARK[0] + (d[i * 4] - DARK[0]) * f[i]; d[i * 4 + 1] = DARK[1] + (d[i * 4 + 1] - DARK[1]) * f[i]; d[i * 4 + 2] = DARK[2] + (d[i * 4 + 2] - DARK[2]) * f[i];
      }
    }
    const sc = mk(w, h), sg = sc.getContext('2d')!;
    sg.fillStyle = '#000';
    const P = (u: number, v: number): [number, number] => [this.ox + (u - v) * 32, this.oy + (u + v) * 16];
    const poly = (ps: [number, number][]): void => { sg.beginPath(); ps.forEach((p, i) => i ? sg.lineTo(p[0], p[1]) : sg.moveTo(p[0], p[1])); sg.closePath(); sg.fill(); };
    for (const s of this.sh) {
      const base = s.pts.map(p => P(p[0], p[1])), far = s.pts.map(p => P(p[0] + s.z * SHU, p[1] + s.z * SHV));
      poly(base); poly(far);
      for (let i = 0; i < base.length; i++) { const j = (i + 1) % base.length; poly([base[i], base[j], far[j], far[i]]); }
    }
    const bc = mk(w, h), bg = g2(bc);
    bg.putImageData(new ImageData(d as unknown as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
    const full = mk(w, h), fg = g2(full);
    fg.globalAlpha = 0.34; fg.drawImage(sc, 0, 0); fg.globalAlpha = 1; fg.drawImage(bc, 0, 0);
    return crop(full, this.ox + (au - av) * 32, this.oy + (au + av) * 16);
  }
}

export function crop(c: HTMLCanvasElement, ax: number, ay: number): Sprite {
  const g = g2(c), w = c.width, h = c.height, d = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return { c: mk(1, 1), ax: 0, ay: 0 };
  const o = mk(x1 - x0 + 1, y1 - y0 + 1);
  g2(o).drawImage(c, -x0, -y0);
  return { c: o, ax: Math.round(ax) - x0, ay: Math.round(ay) - y0 };
}

// ---------------------------------------------------------------- anyagok
const n1 = (s: number, t: number, seed: number): number => hash2(Math.floor(s), Math.floor(t), seed);
const sc = (c: RGB, f: number): RGB => [c[0] * f, c[1] * f, c[2] * f];

export const M = {
  flat: (c: RGB, amp = 0.06): Mat => (s, t) => sc(c, 1 + (n1(s, t, 1) - 0.5) * amp),
  plaster: (base: RGB = [228, 218, 198]): Mat => (s, t) => {
    let f = 1 + (n1(s / 3, t / 3, 2) - 0.5) * 0.09 + (n1(s, t, 3) - 0.5) * 0.05;
    if (t < 3) f *= 0.8; else if (t < 6 && n1(s / 2, 0, 4) < 0.5) f *= 0.88;
    return sc(base, f);
  },
  /** Vakolt fal favázzal: oszlopok `every` pixelenként, felső gerenda H magasságban. */
  timber: (H: number, every = 13, base: RGB = [228, 218, 198], wood: RGB = [96, 70, 48]): Mat => {
    const p = M.plaster(base);
    return (s, t) => ((s % every) < 2 || t > H - 2.5) ? sc(wood, 0.9 + n1(s, t, 5) * 0.2) : p(s, t);
  },
  wattle: (base: RGB = [156, 124, 78]): Mat => (s, t) => {
    if ((s % 11) < 1.5) return sc(base, 0.62);
    const row = Math.floor(t / 2), ph = (Math.floor((s + (row & 1) * 3) / 6) & 1);
    return sc(base, (ph ? 1.08 : 0.84) + (n1(s, t, 6) - 0.5) * 0.1);
  },
  planksV: (base: RGB = [132, 100, 64], pw = 4): Mat => (s, t) => {
    const i = Math.floor(s / pw);
    if (s - i * pw < 1) return sc(base, 0.66);
    return sc(base, 0.88 + n1(i, 0, 7) * 0.22 + (n1(s, t / 3, 8) - 0.5) * 0.07);
  },
  planksH: (base: RGB = [132, 100, 64], ph = 4): Mat => (s, t) => {
    const i = Math.floor(t / ph);
    if (t - i * ph < 1) return sc(base, 0.66);
    return sc(base, 0.88 + n1(0, i, 9) * 0.22 + (n1(s / 3, t, 10) - 0.5) * 0.07);
  },
  logs: (base: RGB = [126, 94, 60], lh = 5): Mat => (s, t) => {
    const x = (t % lh) / lh;
    return sc(base, (x < 0.2 ? 0.62 : x < 0.5 ? 0.95 : x < 0.8 ? 1.12 : 0.9) + (n1(s / 4, t, 11) - 0.5) * 0.1);
  },
  /** Palánk: hegyezett karósor, alul agyagtapasztással. H: a fal magassága pixelben. */
  palisade: (H: number, clay = true, wood: RGB = [128, 96, 60], daub: RGB = [188, 164, 122]): Mat => (s, t) => {
    const i = Math.floor(s / 5), x = s - i * 5, topH = H - 1 - n1(i, 0, 12) * 3;
    if (t > topH) return null;
    if (t > topH - 3 && Math.abs(x - 2.5) > (topH - t) * 0.9 + 0.4) return null;
    const round = x < 1 ? 0.62 : x < 2 ? 0.95 : x < 3.5 ? 1.1 : x < 4.4 ? 0.92 : 0.7;
    if (clay && t < H * 0.6 + (n1(s / 7, 0, 13) - 0.5) * 6) {
      const hole = n1(s / 6, t / 5, 14);
      if (hole > 0.14) {
        let f = 1 + (n1(s / 3, t / 3, 15) - 0.5) * 0.12 + (n1(s, t, 16) - 0.5) * 0.06;
        if (t < 3) f *= 0.78;
        if (n1(s / 2, t / 2, 17) < 0.03) f *= 0.8;
        return sc(daub, f);
      }
    }
    return sc(wood, round * (0.9 + n1(i, t / 6, 18) * 0.2));
  },
  stone: (base: RGB = [168, 162, 150], bh = 6, bw = 11): Mat => (s, t) => {
    const row = Math.floor(t / bh), off = (row & 1) ? bw / 2 : 0, col = Math.floor((s + off) / bw);
    if (t - row * bh < 1 || (s + off) - col * bw < 1) return sc(base, 0.68);
    return sc(base, 0.86 + n1(col, row, 19) * 0.24 + (n1(s, t, 20) - 0.5) * 0.07);
  },
  thatch: (base: RGB = [188, 158, 90]): Mat => (s, t) => {
    let f = 0.84 + n1(s, t / 4, 21) * 0.3 + (n1(s / 5, t / 9, 22) - 0.5) * 0.12;
    if ((t % 8) < 1.2) f *= 0.76;
    return sc(base, f);
  },
  shingle: (base: RGB = [124, 96, 72], rh = 4, cw = 5): Mat => (s, t) => {
    const row = Math.floor(t / rh), off = (row & 1) ? cw / 2 : 0, col = Math.floor((s + off) / cw);
    if (t - row * rh < 1) return sc(base, 0.64);
    if ((s + off) - col * cw < 1) return sc(base, 0.8);
    return sc(base, 0.85 + n1(col, row, 23) * 0.3);
  },
  tile: (base: RGB = [182, 100, 64]): Mat => (s, t) => {
    const x = s % 4;
    let f = x < 1 ? 0.7 : x < 2 ? 1.0 : x < 3 ? 1.12 : 0.92;
    if ((t % 6) < 1) f *= 0.8;
    return sc(base, f * (0.92 + n1(s / 4, t / 6, 24) * 0.16));
  },
  canvas: (base: RGB = [230, 218, 190], stripe: RGB | null = null, sw = 7): Mat => (s, t) => {
    const fold = 1 + Math.sin(s / 2.6) * 0.07 + (n1(s, t, 25) - 0.5) * 0.04;
    if (stripe && (Math.floor(s / sw) & 1)) return sc(stripe, fold);
    return sc(base, fold);
  },
  earth: (base: RGB = [128, 104, 72]): Mat => (s, t) => sc(base, 0.86 + n1(s / 2, t / 2, 26) * 0.2 + (n1(s, t, 27) - 0.5) * 0.12),
  hay: (base: RGB = [204, 176, 96]): Mat => (s, t) => sc(base, 0.8 + n1(s, t / 3, 28) * 0.36),
  dark: (): Mat => () => [38, 30, 30],
  /** Csak minden `every`-edik sávot rajzolja (szarufák, lécváz). */
  rafters: (every = 6, wood: RGB = [110, 82, 54], alongT = false): Mat => (s, t) => (((alongT ? t : s) % every) < 1.6 ? sc(wood, 0.9 + n1(s, t, 29) * 0.2) : null),
  /** Havas változat: a felület foltokban hóval fedett. */
  snow: (m: Mat, on: boolean, cover = 0.62): Mat => !on ? m : (s, t) => {
    const c = m(s, t);
    if (!c) return null;
    const X = s / 7, Y = t / 6, xi = Math.floor(X), yi = Math.floor(Y), fx = X - xi, fy = Y - yi;
    const sm = n1(xi, yi, 30) * (1 - fx) * (1 - fy) + n1(xi + 1, yi, 30) * fx * (1 - fy) + n1(xi, yi + 1, 30) * (1 - fx) * fy + n1(xi + 1, yi + 1, 30) * fx * fy;
    const n = 0.8 * sm + 0.2 * n1(s / 2, t / 2, 31) - (t < 2.5 ? -0.3 : 0);
    const k = n1(s, t, 32);
    return n < cover + 0.12 ? [228 + k * 20, 234 + k * 16, 246] : c;
  },
  /** Alsó `h` pixelnyi sáv csapatszínnel (tetőszegély). */
  trim: (m: Mat, col: RGB, h = 2): Mat => (s, t) => (t < h ? (m(s, t) ? sc(col, 0.92 + n1(s, 0, 33) * 0.16) : null) : m(s, t)),
};

// ---------------------------------------------------------------- gömbhalmaz-rajzoló (lomb, szikla)
interface Blob { x: number; y: number; r: number; z?: number; ramp?: RGB[] }
function blobs(d: Uint8ClampedArray, w: number, h: number, list: Blob[], ramp: RGB[], seed: number, rough: number, facet = 0): void {
  const Lx = -0.52, Ly = -0.62, Lz = 0.58;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = -1e9, bn = 0, bb: Blob | null = null;
    for (const b of list) {
      const dx = x + 0.5 - b.x, dy = y + 0.5 - b.y, q = b.r * b.r - dx * dx - dy * dy;
      if (q <= 0) continue;
      const zs = Math.sqrt(q), zz = (b.z ?? 0) + zs;
      if (zz > best) {
        best = zz; bb = b;
        let nx = dx / b.r, ny = dy / b.r, nz = zs / b.r;
        if (facet) { nx = Math.round(nx * facet) / facet; ny = Math.round(ny * facet) / facet; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
        bn = nx * Lx + ny * Ly + nz * Lz;
      }
    }
    if (!bb) continue;
    const rp = bb.ramp ?? ramp;
    const v = 0.5 + 0.5 * bn + (hash2(x >> 1, y >> 1, seed) - 0.5) * rough + (hash2(x, y, seed + 1) - 0.5) * rough * 0.6;
    const idx = Math.max(0, Math.min(rp.length - 1, Math.floor(v * rp.length)));
    const c = rp[idx], i = (y * w + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
}
function inkEdge(d: Uint8ClampedArray, w: number, h: number, fBR = 0.5, fTL = 0.78): void {
  const mark = new Float32Array(w * h).fill(1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!d[i * 4 + 3]) continue;
    const er = x + 1 >= w || !d[(i + 1) * 4 + 3], eb = y + 1 >= h || !d[(i + w) * 4 + 3];
    const el = x === 0 || !d[(i - 1) * 4 + 3], et = y === 0 || !d[(i - w) * 4 + 3];
    if (er || eb) mark[i] = fBR; else if (el || et) mark[i] = fTL;
  }
  for (let i = 0; i < w * h; i++) if (mark[i] < 1) for (let k = 0; k < 3; k++) d[i * 4 + k] = DARK[k] + (d[i * 4 + k] - DARK[k]) * mark[i];
}
function compose(w: number, h: number, d: Uint8ClampedArray, shadow: (g: CanvasRenderingContext2D) => void, ax: number, ay: number): Sprite {
  const body = mk(w, h); g2(body).putImageData(new ImageData(d as unknown as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  const out = mk(w, h), g = g2(out);
  g.fillStyle = 'rgba(0,0,0,0.3)'; shadow(g);
  g.drawImage(body, 0, 0);
  return crop(out, ax, ay);
}

// ---------------------------------------------------------------- fák
const hx = (h: string): RGB => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rampOf = (...h: string[]): RGB[] => h.map(hx);
// [évszak][fafajta: 0 tölgy, 1 nyár, 2 fűz, 3 nyír/vadgyümölcs]
const LEAF: RGB[][][] = [
  [rampOf('#2c5a26', '#3f7a30', '#5a9a3c', '#7ab84c', '#a2d268'), rampOf('#3a6a2a', '#52882e', '#74a83a', '#98c84c', '#bfe070'),
    rampOf('#48703c', '#628c48', '#80a858', '#a0c470', '#c2dc94'), rampOf('#5a7a3c', '#7c9c54', '#b4c898', '#e8e4d8', '#fff4f2')],
  [rampOf('#1e4420', '#2c5c26', '#40782e', '#5a943a', '#80b04c'), rampOf('#2c5422', '#40702a', '#5a8c32', '#7ca83e', '#a4c456'),
    rampOf('#3a5c38', '#507644', '#6a9052', '#8aaa68', '#aec488'), rampOf('#2a5626', '#3e742e', '#589238', '#78ae48', '#9cc864')],
  [rampOf('#5c2a14', '#84401a', '#b05e22', '#d48a30', '#eeb650'), rampOf('#7a5a14', '#a47e1c', '#cca428', '#e8c840', '#f8e478'),
    rampOf('#5c5a26', '#7c7830', '#9e963c', '#beb250', '#d8cc74'), rampOf('#6c2c18', '#983c1c', '#c05a24', '#dc8438', '#f0b05c')],
];
const BARK: RGB[] = rampOf('#3c2c24', '#54402f', '#705640', '#8c7054');

function bareTree(d: Uint8ClampedArray, w: number, h: number, cx: number, base: number, height: number, spread: number, seed: number, snow: boolean, birch = false): void {
  const r = rng(seed);
  const put = (x: number, y: number, c: RGB): void => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; };
  const bark = birch ? rampOf('#5a5650', '#a8a49c', '#d8d6cc', '#f0eee6') : BARK;
  const branch = (x: number, y: number, ang: number, len: number, th: number, depth: number): void => {
    const n = Math.ceil(len);
    for (let i = 0; i <= n; i++) {
      const px = x + Math.cos(ang) * i, py = y - Math.sin(ang) * i, t = Math.max(1, Math.round(th * (1 - i / n * 0.4)));
      for (let k = 0; k < t; k++) put(px + k - (t >> 1), py, bark[k === 0 && t > 1 ? 2 : t > 2 && k === t - 1 ? 0 : 1]);
      if (snow && th <= 2 && Math.abs(Math.sin(ang)) < 0.8 && r() < 0.55) put(px, py - 1, [240, 244, 250]);
    }
    if (depth <= 0) return;
    const ex = x + Math.cos(ang) * len, ey = y - Math.sin(ang) * len, k = depth > 2 ? 2 : 2 + (r() < 0.4 ? 1 : 0);
    for (let i = 0; i < k; i++) branch(ex, ey, ang + (i - (k - 1) / 2) * spread * (0.8 + r() * 0.5) + (r() - 0.5) * 0.3, len * (0.62 + r() * 0.16), Math.max(1, th - 1), depth - 1);
    if (depth > 1 && r() < 0.7) branch(x + Math.cos(ang) * len * 0.55, y - Math.sin(ang) * len * 0.55, ang + (r() < 0.5 ? 1 : -1) * spread * 1.3, len * 0.5, Math.max(1, th - 1), depth - 2);
  };
  branch(cx, base, Math.PI / 2 + (r() - 0.5) * 0.12, height * 0.36, 4, 4);
}

const treeCache = new Map<number, Sprite>();
export function treeSprite(season: Season, variant: number): Sprite {
  variant = ((variant % 8) + 8) % 8;
  const key = season * 8 + variant;
  let sp = treeCache.get(key);
  if (sp) return sp;
  const W = 72, H = 84, cx = 32, base = 74;
  const d = new Uint8ClampedArray(W * H * 4), r = rng(1000 + variant * 77);
  const kind = [0, 0, 0, 1, 1, 2, 2, 3][variant];
  const size = [1, 0.86, 1.1, 1, 0.84, 1, 0.85, 0.8][variant];
  const trunkH = kind === 1 ? 14 : kind === 2 ? 14 : 18, trunkW = kind === 0 ? 5 : kind === 2 ? 5 : 3;
  let shr = 16, shy = 0;
  if (season === 3) {
    bareTree(d, W, H, cx, base, (kind === 1 ? 66 : kind === 2 ? 46 : 58) * size, kind === 1 ? 0.3 : kind === 2 ? 0.78 : 0.56, 500 + variant, true, kind === 3);
    shr = 9;
  } else {
    const bark = kind === 3 ? rampOf('#5a5650', '#a8a49c', '#d8d6cc', '#f0eee6') : BARK;
    for (let y = base - trunkH * size - 8; y <= base; y++) {
      const flare = y > base - 3 ? 1 : 0;
      for (let x = -((trunkW >> 1) + flare); x <= (trunkW >> 1) + flare; x++) {
        const i = ((y | 0) * W + cx + x) * 4, t = (x + (trunkW >> 1) + flare) / (trunkW + 2 * flare);
        let c = bark[t < 0.34 ? 2 : t < 0.7 ? 1 : 0];
        if (kind === 3 && hash2(x, y | 0, 5) < 0.15) c = [50, 46, 44];
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
    }
    const list: Blob[] = [];
    const ramp = LEAF[season][kind];
    if (kind === 0 || kind === 3) {
      const R = (kind === 0 ? 22 : 16) * size, cy = base - trunkH * size - R * 0.75;
      list.push({ x: cx, y: cy, r: R * 0.74, z: 2 });
      const n = kind === 0 ? 8 : 6;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + r() * 0.5, rr = R * (0.5 + r() * 0.2);
        list.push({ x: cx + Math.cos(a) * R * 0.62, y: cy + Math.sin(a) * R * 0.46 + 1, r: rr * 0.78, z: -Math.sin(a) * -3 });
      }
      list.push({ x: cx - R * 0.2, y: cy - R * 0.5, r: R * 0.5, z: 4 });
      shr = R * 0.95; shy = 0;
    } else if (kind === 1) {
      const Ht = 54 * size, top = base - trunkH * size * 0.6 - Ht;
      for (let i = 0; i < 7; i++) {
        const t = i / 6, rr = (4.5 + Math.sin(t * Math.PI * 0.9 + 0.25) * 6) * size;
        list.push({ x: cx + (r() - 0.5) * 3, y: top + rr + t * (Ht - rr * 1.4), r: rr, z: i });
      }
      shr = 9 * size;
    } else {
      const R = 21 * size, cy = base - trunkH * size - R * 0.42;
      list.push({ x: cx, y: cy - 2, r: R * 0.66, z: 3 });
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2 + r() * 0.4;
        list.push({ x: cx + Math.cos(a) * R * 0.74, y: cy + Math.sin(a) * R * 0.3 + 3, r: R * (0.36 + r() * 0.12), z: Math.sin(a) * 3 });
      }
      shr = R; shy = 0;
    }
    blobs(d, W, H, list, ramp, 40 + variant, 0.34);
    if (kind === 2) { // fűz: lecsüngő ágfüzérek
      for (let x = 4; x < W - 4; x++) {
        const seedv = hash2(x, variant, 61);
        if (seedv < 0.55) continue;
        let y0 = -1;
        for (let y = H - 1; y >= 0; y--) if (d[(y * W + x) * 4 + 3] && y < base - 10) { y0 = y; break; }
        if (y0 < 0 || y0 > base - 12) continue;
        const len = 4 + ((seedv * 97) % 1) * 9;
        for (let k = 1; k <= len && y0 + k < base - 2; k++) {
          const i = ((y0 + k) * W + x) * 4, c = ramp[k < 3 ? 2 : (k & 1) ? 1 : 3];
          d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
        }
      }
    }
  }
  if (season !== 3) inkEdge(d, W, H, 0.55, 0.85);
  sp = compose(W, H, d, g => { g.beginPath(); g.ellipse(cx + shr * 0.55, base + 1 + shy, shr * (season === 3 ? 0.9 : 1.05), shr * (season === 3 ? 0.3 : 0.48), 0, 0, Math.PI * 2); g.fill(); }, cx, base);
  treeCache.set(key, sp);
  return sp;
}

let stump: Sprite | null = null;
export function stumpSprite(): Sprite {
  if (stump) return stump;
  const W = 20, H = 16, d = new Uint8ClampedArray(W * H * 4);
  const put = (x: number, y: number, c: RGB): void => { const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; };
  for (let y = 6; y <= 12; y++) for (let x = 5; x <= 11; x++) {
    if (y === 12 && (x === 5 || x === 11)) continue;
    put(x, y, BARK[x < 7 ? 2 : x < 10 ? 1 : 0]);
  }
  for (let y = 4; y <= 7; y++) for (let x = 5; x <= 11; x++) {
    const dx = (x - 8) / 3.6, dy = (y - 5.5) / 1.9;
    if (dx * dx + dy * dy <= 1) put(x, y, dx * dx + dy * dy < 0.25 ? [196, 160, 108] : [222, 190, 136]);
  }
  put(4, 12, BARK[1]); put(12, 12, BARK[0]);
  inkEdge(d, W, H, 0.6, 0.85);
  stump = compose(W, H, d, g => { g.beginPath(); g.ellipse(11, 12, 6, 2.5, 0, 0, Math.PI * 2); g.fill(); }, 8, 11);
  return stump;
}

// ---------------------------------------------------------------- kőlelőhely
const ROCK: RGB[] = rampOf('#3c3a38', '#55524d', '#716d66', '#8d897f', '#a8a499', '#c2beb2');
const stoneCache = new Map<number, Sprite>();
export function stoneSprite(variant: number, level: number): Sprite {
  variant &= 3; level = Math.max(0, Math.min(2, level | 0));
  const key = variant * 3 + level;
  let sp = stoneCache.get(key);
  if (sp) return sp;
  const W = 88, H = 64, cx = 42, cy = 44, d = new Uint8ClampedArray(W * H * 4), r = rng(300 + variant * 13);
  const n = [6, 4, 2][level], sizeK = [1.25, 1.05, 0.8][level], list: Blob[] = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + r() * 0.8, rad = i === 0 ? 0 : (8 + r() * 12) * sizeK;
    const rr = (i === 0 ? 13 : 6 + r() * 6) * sizeK;
    const x = cx + Math.cos(a) * rad * 1.3, y = cy + Math.sin(a) * rad * 0.5;
    list.push({ x, y: y - rr * 0.55, r: rr, z: y });
    list.push({ x: x + rr * 0.3, y: y - rr * 0.1, r: rr * 0.8, z: y - 2 });
  }
  blobs(d, W, H, list, ROCK, 70 + variant, 0.12, 1.5);
  // a talajba simuló alsó él: a szikla alját vízszintesen levágjuk
  for (const b of list) void b;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; if (!d[i + 3]) continue;
    const lim = cy + 9 * sizeK - Math.abs(x - cx) * 0.22;
    if (y > lim) d[i + 3] = 0;
    else if (hash2(x >> 2, y >> 2, 71 + variant) < 0.07) { d[i] *= 0.72; d[i + 1] *= 0.72; d[i + 2] *= 0.74; }
  }
  inkEdge(d, W, H, 0.5, 0.8);
  sp = compose(W, H, d, g => { g.beginPath(); g.ellipse(cx + 10, cy + 5, 24 * sizeK, 8 * sizeK, 0, 0, Math.PI * 2); g.fill(); }, cx, cy);
  stoneCache.set(key, sp);
  return sp;
}

// ---------------------------------------------------------------- falu
const villageCache = new Map<number, Sprite>();
export function villageSprite(season: Season, burnt: boolean): Sprite {
  const key = season * 2 + (burnt ? 1 : 0);
  let sp = villageCache.get(key);
  if (sp) return sp;
  const b = Buf.forFoot(3, 3, 80), win = season === 3;
  const wallC: RGB = burnt ? [104, 92, 84] : [232, 224, 206];
  const wall = M.plaster(wallC);
  const roofOk = M.snow(M.thatch(), win, 0.66);
  const roof: Mat = burnt ? M.rafters(5, [44, 36, 32]) : roofOk;
  const house = (u0: number, v0: number, u1: number, v1: number, axis: 'u' | 'v', hW = 13, hR = 15): void => {
    b.box(u0, v0, u1, v1, 0, hW, wall, burnt ? null : M.dark());
    b.gable(u0, v0, u1, v1, hW, hW + hR, axis, burnt ? 0 : 0.1, roof, burnt ? null : wall);
    // ajtó, ablak
    if (axis === 'u') { b.wall(u0 + (u1 - u0) * 0.4, v1, u0 + (u1 - u0) * 0.4 + 0.14, v1, 0, 9, M.flat([70, 50, 36]), undefined, 0.01); b.wall(u0 + (u1 - u0) * 0.72, v1, u0 + (u1 - u0) * 0.72 + 0.1, v1, 6, 10, M.dark(), undefined, 0.01); }
    else { b.wall(u1, v0 + (v1 - v0) * 0.45, u1, v0 + (v1 - v0) * 0.45 + 0.14, 0, 9, M.flat([70, 50, 36]), undefined, 0.01); b.wall(u0 + (u1 - u0) * 0.3, v1, u0 + (u1 - u0) * 0.3 + 0.12, v1, 6, 10, M.dark(), undefined, 0.01); }
  };
  // udvar: döngölt föld
  b.top(0.15, 0.15, 2.85, 2.85, 0, (s, t) => {
    const e = Math.min(s, t, 97 - s, 97 - t);
    if (e < 10 && hash2(s | 0, t | 0, 80) > e / 10) return null;
    return win ? [214 + hash2(s | 0, t | 0, 81) * 20, 220 + hash2(s | 0, t | 0, 81) * 16, 230] : [146 + hash2(s | 0, t | 0, 81) * 22, 122 + hash2(s | 0, t | 0, 82) * 16, 86];
  }, 1, -0.5);
  // templom hátul
  b.box(0.35, 0.3, 1.5, 0.95, 0, 20, wall, burnt ? null : M.dark());
  b.gable(0.35, 0.3, 1.5, 0.95, 20, 38, 'u', burnt ? 0 : 0.08, burnt ? roof : M.snow(M.shingle(), win, 0.6), burnt ? null : wall);
  b.wall(0.7, 0.95, 0.82, 0.95, 5, 14, M.dark(), undefined, 0.01); b.wall(1.1, 0.95, 1.22, 0.95, 5, 14, M.dark(), undefined, 0.01);
  b.box(1.42, 0.38, 1.88, 0.86, 0, burnt ? 30 : 44, M.planksV([118, 88, 58]), M.dark());
  if (!burnt) {
    b.pyramid(1.42, 0.38, 1.88, 0.86, 44, 70, M.snow(M.shingle([104, 80, 62]), win, 0.5), 0.1);
    b.line([1.65, 0.62, 70], [1.65, 0.62, 78], [60, 50, 44]);
    b.decal([1.65, 0.62, 75], -2, 0, 5, 1, () => [60, 50, 44]);
    b.wall(1.88, 0.52, 1.88, 0.72, 30, 38, M.dark(), undefined, 0.01);
  }
  house(2.05, 0.35, 2.75, 1.25, 'v');
  house(0.3, 1.45, 1.2, 2.1, 'u');
  house(1.65, 1.75, 2.6, 2.45, 'u', 12, 14);
  house(0.45, 2.3, 1.15, 2.8, 'u', 10, 12);
  // kút és sövény
  if (!burnt) {
    b.cyl(1.55, 1.38, 0.13, 0, 6, M.stone([150, 146, 136], 3, 5), M.dark(), 8);
    b.line([1.42, 1.38, 0], [1.42, 1.38, 16], [86, 64, 44]); b.line([1.42, 1.38, 16], [1.72, 1.38, 13], [86, 64, 44]);
  }
  b.wall(0.2, 2.9, 1.4, 2.9, 0, 6, M.wattle(burnt ? [80, 66, 54] : undefined));
  b.wall(2.9, 1.5, 2.9, 2.7, 0, 6, M.wattle(burnt ? [80, 66, 54] : undefined));
  sp = b.finish(1.5, 1.5);
  villageCache.set(key, sp);
  return sp;
}
