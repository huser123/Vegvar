// Talajrajzolás: világhoz rögzített, 8 csempe periódusú textúrák, prioritás szerinti, szórt szélű rátakarással.
// Egy csempe képe csak a csempétől és 8 szomszédjától függ, ezért a darabokban rajzolt talaj varratmentes.
import { GroundSource, HILL_H, Season, Sprite } from './api';
import { g2, hash2, mk, RGB } from './pal';

const P = 8, PW = 512, PH = 256; // periódus csempében; a minta 512×256 px
const CW = 128, CH = 64; // egy csempe-sprite cellája (közép: 64,32)

// Rétegek
const VIZ = 0, JEG = 1, GAZLO = 2, AR = 3, NEDVES = 4, PART = 5, MOCSAR = 6, RET = 7, ERDO = 8, SZANTO = 9, KO = 10, UT = 11, DOMB = 12;
const PRIO = [0, 0, 1, 2, 3, 3, 4, 5, 6, 7, 8, 9, 5];
const PRIO_BANK = 3, NPRIO = 10;
// T.* → réteg
const T2L = [RET, UT, SZANTO, ERDO, RET, MOCSAR, VIZ, GAZLO, JEG, KO];

function vn(u: number, v: number, cells: number, seed: number): number {
  const x = u * cells / P, y = v * cells / P;
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const x0 = ((xi % cells) + cells) % cells, y0 = ((yi % cells) + cells) % cells;
  const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed), c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
/** Képernyőtérben periodikus zaj (vízfodrokhoz): cx×cy cella az 512×256-os mintán. */
function sn(px: number, py: number, cx: number, cy: number, seed: number): number {
  const x = px * cx / PW, y = py * cy / PH;
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const x0 = xi % cx, y0 = yi % cy, x1 = (x0 + 1) % cx, y1 = (y0 + 1) % cy;
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed), c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

type Ramp = [RGB, RGB, RGB];
const o: RGB = [0, 0, 0];
function ramp(r: Ramp, x: number): RGB {
  x = x < 0 ? 0 : x > 1 ? 1 : x;
  const a = x < 0.5 ? r[0] : r[1], b = x < 0.5 ? r[1] : r[2], t = x < 0.5 ? x * 2 : x * 2 - 1;
  o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t;
  return o;
}
function set(r: number, g: number, b: number): RGB { o[0] = r; o[1] = g; o[2] = b; return o; }
function tint(c: RGB, f: number): RGB { o[0] = c[0] * f; o[1] = c[1] * f; o[2] = c[2] * f; return o; }

const GRASS: Ramp[] = [
  [[60, 102, 46], [84, 132, 56], [116, 158, 74]],
  [[76, 104, 42], [108, 134, 52], [146, 160, 74]],
  [[102, 94, 50], [136, 124, 64], [170, 150, 86]],
  [[192, 204, 222], [224, 231, 240], [246, 249, 252]],
];
const FOREST: Ramp[] = [
  [[44, 74, 38], [62, 94, 44], [84, 112, 54]],
  [[42, 68, 34], [58, 86, 40], [80, 102, 50]],
  [[86, 62, 34], [116, 84, 42], [150, 106, 50]],
  [[170, 182, 198], [202, 211, 224], [228, 234, 243]],
];
const HILLTOP: Ramp[] = [
  [[84, 122, 54], [112, 150, 66], [146, 176, 88]],
  [[98, 116, 52], [130, 144, 64], [166, 168, 88]],
  [[118, 104, 58], [150, 134, 74], [182, 160, 98]],
  [[204, 214, 230], [232, 238, 246], [250, 252, 254]],
];
const ROAD: Ramp[] = [
  [[92, 72, 52], [118, 94, 68], [142, 116, 86]],
  [[132, 106, 74], [160, 132, 94], [186, 160, 118]],
  [[116, 94, 66], [144, 118, 84], [170, 144, 104]],
  [[146, 136, 126], [188, 182, 174], [220, 218, 214]],
];
const SOIL: Ramp[] = [
  [[86, 62, 42], [110, 82, 56], [134, 104, 74]],
  [[98, 74, 50], [124, 96, 66], [148, 118, 84]],
  [[92, 70, 48], [116, 90, 62], [140, 112, 80]],
  [[150, 150, 156], [200, 204, 212], [234, 238, 244]],
];
const MARSH: Ramp[] = [
  [[52, 80, 54], [72, 100, 60], [98, 122, 70]],
  [[58, 80, 48], [80, 100, 56], [106, 120, 66]],
  [[78, 76, 46], [102, 96, 54], [128, 116, 66]],
  [[150, 164, 172], [190, 202, 210], [224, 232, 238]],
];
const MARSHW: RGB[] = [[50, 82, 92], [48, 78, 84], [56, 74, 78], [150, 182, 204]];
const WATER: [RGB, RGB, RGB][] = [
  [[60, 96, 108], [78, 114, 124], [128, 160, 164]],
  [[40, 84, 134], [58, 106, 154], [130, 176, 206]],
  [[50, 82, 116], [70, 102, 134], [130, 160, 184]],
  [[32, 52, 80], [46, 70, 100], [96, 124, 156]],
];
const FORD: [RGB, RGB][] = [
  [[92, 128, 128], [118, 150, 146]], [[88, 136, 150], [118, 164, 170]],
  [[90, 124, 134], [116, 148, 152]], [[70, 98, 120], [96, 124, 142]],
];
const ICE: Ramp = [[150, 184, 212], [178, 206, 228], [204, 224, 240]];
const STONE: Ramp[] = [
  [[100, 98, 90], [130, 128, 118], [162, 160, 148]],
  [[106, 100, 90], [138, 132, 118], [170, 164, 148]],
  [[104, 96, 86], [134, 126, 112], [164, 156, 140]],
  [[150, 154, 162], [196, 200, 208], [232, 236, 242]],
];
const SAND: Ramp[] = [
  [[138, 116, 80], [164, 140, 100], [188, 166, 124]],
  [[150, 128, 88], [178, 154, 108], [202, 180, 132]],
  [[140, 118, 82], [166, 142, 100], [190, 168, 124]],
  [[176, 180, 184], [208, 212, 216], [236, 240, 244]],
];
const WET: Ramp[] = [
  [[80, 70, 54], [98, 86, 64], [116, 102, 76]],
  [[92, 80, 58], [112, 98, 72], [132, 116, 84]],
  [[84, 74, 56], [102, 90, 68], [120, 106, 80]],
  [[104, 112, 124], [130, 138, 148], [160, 168, 176]],
];

function texel(L: number, s: Season, u: number, v: number, px: number, py: number): RGB {
  const gr = hash2(px, py, 3) - 0.5; // pixelzaj
  switch (L) {
    case RET: case DOMB: {
      const x = 0.42 * vn(u, v, 6, 11) + 0.33 * vn(u, v, 20, 12) + 0.25 * vn(u, v, 72, 13) + gr * 0.22;
      const c = ramp(L === DOMB ? HILLTOP[s] : GRASS[s], (x - 0.22) * 1.8);
      const h = hash2(px, py >> 1, 21);
      if (s === 3) { if (h < 0.003) return set(150, 146, 118); if (h < 0.012) return set(196, 204, 220); }
      else {
        if (h < 0.035) return tint(c, 0.8);
        if (s === 0 && h > 0.994) return h > 0.997 ? set(240, 232, 150) : set(238, 238, 230);
        if (s === 1 && vn(u, v, 10, 14) > 0.7 && h > 0.9) return set(168, 160, 92);
        if (L === DOMB && h > 0.985) return set(150, 146, 132);
      }
      return c;
    }
    case ERDO: {
      const x = 0.4 * vn(u, v, 8, 31) + 0.3 * vn(u, v, 24, 32) + 0.3 * vn(u, v, 80, 33) + gr * 0.3;
      const c = ramp(FOREST[s], (x - 0.22) * 1.8);
      const h = hash2(px >> 1, py, 34);
      if (s === 2 && h < 0.07) return h < 0.03 ? set(188, 118, 46) : set(170, 140, 52);
      if (s === 3 && h < 0.012) return set(132, 122, 112);
      if (s < 2 && h < 0.03) return set(96, 80, 52);
      return c;
    }
    case UT: {
      const x = 0.45 * vn(u, v, 12, 41) + 0.3 * vn(u, v, 40, 42) + 0.25 * vn(u, v, 96, 43) + gr * 0.3;
      const c = ramp(ROAD[s], (x - 0.2) * 1.7);
      const h = hash2(px, py, 44);
      if (h < 0.02) return tint(c, 0.75);
      if (h > 0.985) return tint(c, 1.18);
      if (s === 0 && vn(u, v, 28, 45) > 0.72) return set(74, 70, 64);
      return c;
    }
    case SZANTO: {
      const f = Math.floor(v * 8) & 1;
      const x = 0.4 * vn(u, v, 16, 51) + 0.3 * vn(u, v, 64, 52) + gr * 0.3 + (f ? 0.3 : 0);
      return ramp(SOIL[s], x);
    }
    case MOCSAR: case AR: {
      const w = vn(u, v, 12, 61) * 0.6 + vn(u, v, 36, 62) * 0.4;
      const lim = L === AR ? 0.66 : 0.42;
      if (w < lim) {
        const base = L === AR && s !== 3 ? set(94, 114, 110) : set(MARSHW[s][0], MARSHW[s][1], MARSHW[s][2]);
        const rp = sn(px, py, 64, 64, 63);
        const k = 0.92 + (lim - w) * 0.3 + (rp > 0.8 ? 0.2 : 0) + gr * 0.06;
        if (w > lim - 0.03) return tint(base, 0.78);
        return tint(base, k);
      }
      const x = 0.5 * vn(u, v, 20, 64) + 0.5 * vn(u, v, 72, 65) + gr * 0.3;
      const c = ramp(MARSH[s], (x - 0.2) * 1.7);
      const h = hash2(px, py >> 2, 66);
      if (h < 0.06) return s >= 2 ? set(150, 124, 78) : set(140, 150, 84);
      if (h > 0.96) return tint(c, 0.7);
      return c;
    }
    case VIZ: {
      const W = WATER[s];
      const d = 0.6 * vn(u, v, 6, 71) + 0.4 * vn(u, v, 18, 72);
      const rp = sn(px, py, 32, 64, 73) * 0.6 + sn(px + 37, py, 96, 128, 74) * 0.4;
      const t = d * 0.9 + gr * 0.08;
      o[0] = W[0][0] + (W[1][0] - W[0][0]) * t; o[1] = W[0][1] + (W[1][1] - W[0][1]) * t; o[2] = W[0][2] + (W[1][2] - W[0][2]) * t;
      if (rp > 0.7) { const k = rp > 0.78 ? 0.5 : 0.22; o[0] += (W[2][0] - o[0]) * k; o[1] += (W[2][1] - o[1]) * k; o[2] += (W[2][2] - o[2]) * k; }
      else if (rp < 0.3) { o[0] *= 0.93; o[1] *= 0.93; o[2] *= 0.95; }
      return o;
    }
    case GAZLO: {
      const F = FORD[s];
      const t = 0.6 * vn(u, v, 14, 81) + 0.4 * vn(u, v, 48, 82) + gr * 0.15;
      o[0] = F[0][0] + (F[1][0] - F[0][0]) * t; o[1] = F[0][1] + (F[1][1] - F[0][1]) * t; o[2] = F[0][2] + (F[1][2] - F[0][2]) * t;
      const h = hash2(px >> 1, py >> 1, 83);
      if (h < 0.07) return h < 0.04 ? set(150, 144, 122) : set(100, 104, 100);
      const rp = sn(px, py, 64, 128, 84);
      if (rp > 0.86) return set(206, 226, 230);
      return o;
    }
    case JEG: {
      const x = 0.5 * vn(u, v, 6, 91) + 0.3 * vn(u, v, 22, 92) + gr * 0.12;
      const c = ramp(ICE, x * 1.3 - 0.1);
      const cr = Math.abs(vn(u, v, 7, 93) - 0.5);
      if (cr < 0.006) return set(140, 168, 198);
      const sp = 0.55 * vn(u, v, 14, 95) + 0.45 * vn(u, v, 40, 96);
      if (sp > 0.68) return set(240 + gr * 10, 245 + gr * 8, 251);
      if (sp > 0.65) return set(222, 234, 245);
      return c;
    }
    case KO: {
      const x = 0.4 * vn(u, v, 14, 101) + 0.35 * vn(u, v, 40, 102) + 0.25 * hash2(px >> 1, py >> 1, 103) + gr * 0.15;
      const c = ramp(STONE[s], (x - 0.2) * 1.7);
      const e = Math.abs(vn(u, v, 32, 104) - 0.5);
      if (e < 0.02) return tint(c, 0.7);
      return c;
    }
    case PART: {
      const x = 0.5 * vn(u, v, 16, 111) + 0.25 * vn(u, v, 64, 112) + gr * 0.4;
      const c = ramp(SAND[s], x * 1.2 - 0.05);
      if (hash2(px, py, 113) < 0.02) return tint(c, 0.72);
      return c;
    }
    default: { // NEDVES
      const x = 0.6 * vn(u, v, 20, 121) + gr * 0.5;
      return ramp(WET[s], x);
    }
  }
}

const patCanvas = new Map<number, HTMLCanvasElement>();
const patData = new Map<number, ImageData>();
const pats = new Map<number, CanvasPattern>();
let scratch: HTMLCanvasElement | null = null;
function patternCanvas(L: number, s: Season): HTMLCanvasElement {
  const k = L * 4 + s;
  let c = patCanvas.get(k);
  if (c) return c;
  c = mk(PW, PH);
  const g = g2(c), id = g.createImageData(PW, PH), d = id.data;
  for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
    const u = px / 64 + py / 32, v = py / 32 - px / 64;
    const col = texel(L, s, u, v, px, py), i = (py * PW + px) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  patCanvas.set(k, c); patData.set(k, id);
  return c;
}
function pattern(L: number, s: Season): CanvasPattern {
  const k = L * 4 + s;
  let p = pats.get(k);
  if (!p) { p = g2(scratch ??= mk(CW, CH)).createPattern(patternCanvas(L, s), 'repeat')!; pats.set(k, p); }
  return p;
}

// ---- maszkok ----
const NMASK = 8;
let exactMask: HTMLCanvasElement | null = null;
const ringMasks: HTMLCanvasElement[][] = []; // [fajta][változat]; 0 szárazföldi rátakarás, 1 part, 2 nedves szegély
function mnoise(x: number, y: number, seed: number): number {
  const X = x / 9, Y = y / 6, xi = Math.floor(X), yi = Math.floor(Y), fx = X - xi, fy = Y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function buildMasks(): void {
  exactMask = mk(CW, CH);
  const g = g2(exactMask);
  g.fillStyle = '#000';
  for (let j = 0; j < 32; j++) { const hw = j < 16 ? 2 * (j + 1) : 2 * (32 - j); g.fillRect(64 - hw, 16 + j, hw * 2, 1); }
  const EXT = [1.36, 1.62, 1.78], SOFT = [0.2, 0.12, 0.1];
  for (let kind = 0; kind < 3; kind++) {
    ringMasks[kind] = [];
    for (let m = 0; m < NMASK; m++) {
      const c = mk(CW, CH), gg = g2(c), id = gg.createImageData(CW, CH), d = id.data;
      for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
        const dd0 = Math.abs(x + 0.5 - 64) / 32 + Math.abs(y + 0.5 - 32) / 16;
        const dd = dd0 + (mnoise(x, y, 200 + m) - 0.5) * 0.42 + (mnoise(x * 3, y * 3, 300 + m) - 0.5) * 0.12;
        let on = dd0 <= 1;
        if (!on && dd0 < 1.95) {
          const p = (EXT[kind] - dd) / SOFT[kind];
          on = p >= 1 || (p > 0 && hash2(x, y, 400 + m) < p);
        }
        if (on) d[(y * CW + x) * 4 + 3] = 255;
      }
      gg.putImageData(id, 0, 0);
      ringMasks[kind].push(c);
    }
  }
}

// ---- csempe-atlaszok: (réteg, fajta) → 8×8 cella ----
interface Atlas { c: HTMLCanvasElement; g: CanvasRenderingContext2D; done: Uint8Array }
const atlases: Map<number, Atlas>[] = [new Map(), new Map(), new Map(), new Map()];
const seasonUse = [0, 0, 0, 0]; let useClock = 0;
function fillMasked(g: CanvasRenderingContext2D, mask: HTMLCanvasElement, L: number, s: Season, wx: number, wy: number): void {
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, CW, CH);
  g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = pattern(L, s);
  g.setTransform(1, 0, 0, 1, -wx, -wy);
  g.fillRect(wx, wy, CW, CH);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
}
let scratch2: HTMLCanvasElement | null = null;
// kind: 0 pontos rombusz, 1 rátakaró, 2 part
function atlasCell(L: number, s: Season, kind: number, tu: number, tv: number): Atlas {
  const key = L * 4 + kind;
  let a = atlases[s].get(key);
  if (!a) { const c = mk(CW * 8, CH * 8); a = { c, g: g2(c), done: new Uint8Array(64) }; atlases[s].set(key, a); }
  const idx = tv * 8 + tu;
  if (!a.done[idx]) {
    if (!exactMask) buildMasks();
    a.done[idx] = 1;
    const sc = (scratch ??= mk(CW, CH)), g = g2(sc);
    const wx = (tu - tv) * 32 - 64, wy = (tu + tv) * 16 + 16 - 32;
    const mv = (hash2(tu, tv, 5) * NMASK) | 0;
    if (kind === 2) {
      fillMasked(g, ringMasks[2][mv], NEDVES, s, wx, wy);
      a.g.drawImage(sc, tu * CW, tv * CH);
      const sc2 = (scratch2 ??= mk(CW, CH));
      fillMasked(g2(sc2), ringMasks[1][mv], PART, s, wx, wy);
      a.g.drawImage(sc2, tu * CW, tv * CH);
    } else {
      fillMasked(g, kind === 0 ? exactMask! : ringMasks[0][mv], L, s, wx, wy);
      a.g.drawImage(sc, tu * CW, tv * CH);
    }
  }
  return a;
}

// ---- domboldal ----
const SKIRT = 0.55, SW = 160, SH = 96, SAX = 80, SAY = 40; // a sprite (80,40) pontja = a csempe (0,0) sarka a talajon
const skirts: Map<number, HTMLCanvasElement | null>[] = [new Map(), new Map(), new Map(), new Map()];
const NB = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]; // bit i ↔ szomszéd
function sqd(u: number, v: number, qx: number, qy: number): number {
  const dx = u < qx ? qx - u : u > qx + 1 ? u - qx - 1 : 0, dy = v < qy ? qy - v : v > qy + 1 ? v - qy - 1 : 0;
  return Math.sqrt(dx * dx + dy * dy);
}
function skirtSprite(mask: number, s: Season, variant: number): HTMLCanvasElement | null {
  const key = mask * 2 + variant;
  const got = skirts[s].get(key);
  if (got !== undefined) return got;
  patternCanvas(DOMB, s); patternCanvas(RET, s);
  const top = patData.get(DOMB * 4 + s)!.data, low = patData.get(RET * 4 + s)!.data;
  const c = mk(SW, SH), g = g2(c), id = g.createImageData(SW, SH), d = id.data;
  const zb = new Float32Array(SW * SH).fill(-1e9);
  const dist = (u: number, v: number): number => {
    let m = sqd(u, v, 0, 0);
    for (let i = 0; i < 8; i++) if (mask & (1 << i)) { const q = sqd(u, v, NB[i][0], NB[i][1]); if (q < m) m = q; }
    return m;
  };
  const hgt = (u: number, v: number): number => {
    const t = dist(u, v) / SKIRT;
    return t >= 1 ? 0 : HILL_H * (1 - t * t * (3 - 2 * t));
  };
  const N = 96, e = 0.02, off = variant * 3;
  let any = false;
  for (let j = -N * SKIRT | 0; j <= N * (1 + SKIRT); j++) for (let i = -N * SKIRT | 0; i <= N * (1 + SKIRT); i++) {
    const u = i / N, v = j / N;
    const own = sqd(u, v, 0, 0);
    if (own <= 0 || own >= SKIRT) continue;
    const dd = dist(u, v);
    if (dd <= 0 || own > dd + 1e-6) continue;
    const h = hgt(u, v), hu = (hgt(u + e, v) - h) / e, hv = (hgt(u, v + e) - h) / e;
    if (32 - (hu + hv) < 0) continue; // hátrafelé néző lejtő
    const t = dd / SKIRT;
    const fx = (u - v) * 32, fy = (u + v) * 16;
    const X = Math.round(fx) + SAX, Y = Math.round(fy - h) + SAY;
    if (X < 0 || X >= SW || Y < 0 || Y >= SH - 1) continue;
    if (t > 0.72 && hash2(X, Y, 9) > (1 - t) / 0.28) continue; // a lejtő lába beleszóródik a talajba
    const nl = Math.hypot(hu / 40, hv / 40, 1);
    let lit = 1 + 0.6 * ((hu - hv) / 40) / nl - 0.12 * (1 - 1 / nl);
    lit = lit < 0.5 ? 0.5 : lit > 1.32 ? 1.32 : lit;
    if (s === 3) lit = lit > 0.93 ? 0.93 : lit * 0.96;
    const tx = (((Math.round(fx) + off * 64) % PW) + PW) % PW, ty = (((Math.round(fy) + off * 32) % PH) + PH) % PH, k = (ty * PW + tx) * 4;
    const mixT = t * t;
    let r = top[k] + (low[k] - top[k]) * mixT, gg = top[k + 1] + (low[k + 1] - top[k + 1]) * mixT, b = top[k + 2] + (low[k + 2] - top[k + 2]) * mixT;
    if (s !== 3) { const er = Math.sin(t * Math.PI) * 0.22; r += (122 - r) * er; gg += (100 - gg) * er; b += (70 - b) * er; }
    if (lit <= 1) { r = 20 + (r - 20) * lit; gg = 16 + (gg - 16) * lit; b = 34 + (b - 34) * lit; }
    else { const q = lit - 1; r += (255 - r) * q; gg += (244 - gg) * q; b += (214 - b) * q; }
    const depth = u + v;
    for (let yy = Y; yy <= Y + 1; yy++) {
      const p = yy * SW + X;
      if (depth < zb[p]) continue;
      zb[p] = depth; d[p * 4] = r; d[p * 4 + 1] = gg; d[p * 4 + 2] = b; d[p * 4 + 3] = 255; any = true;
    }
  }
  // megvilágított perem a hátsó éleken
  const rim = (ax: number, ay: number, bx: number, by: number): void => {
    const n = 32;
    for (let i = 0; i <= n; i++) {
      const x = Math.round(ax + (bx - ax) * i / n) + SAX, y = Math.round(ay + (by - ay) * i / n) + SAY - HILL_H;
      const p = (y * SW + x) * 4; if (d[p + 3]) continue;
      const hl = s === 3 ? [255, 255, 255] : [206, 214, 150];
      d[p] = hl[0]; d[p + 1] = hl[1]; d[p + 2] = hl[2]; d[p + 3] = 255; any = true;
    }
  };
  if (!(mask & 1)) rim(0, 0, 32, 16);
  if (!(mask & 64)) rim(0, 0, -32, 16);
  g.putImageData(id, 0, 0);
  const res = any ? c : null;
  skirts[s].set(key, res);
  return res;
}

function layerAt(src: GroundSource, tx: number, ty: number): number {
  const t = src.type(tx, ty);
  if (t < 0) return -1;
  const L = T2L[t] ?? RET;
  if (L > GAZLO && src.flooded(tx, ty)) return AR;
  return L;
}

export function drawGround(ctx: CanvasRenderingContext2D, src: GroundSource, season: Season,
  x0: number, y0: number, x1: number, y1: number, ox: number, oy: number): void {
  seasonUse[season] = ++useClock;
  for (let s = 0; s < 4; s++) if (s !== season && atlases[s].size && useClock - seasonUse[s] > 400) { atlases[s].clear(); skirts[s].clear(); }
  ctx.imageSmoothingEnabled = false;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(src.w, x1); y1 = Math.min(src.h, y1);
  const buckets: number[][] = [];
  for (let i = 0; i < NPRIO; i++) buckets.push([]);
  const hills: number[] = [];
  for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
    const L = layerAt(src, tx, ty);
    if (L < 0) continue;
    const pr = PRIO[L];
    let lower = false, water = false;
    for (let i = 0; i < 8; i++) {
      const nl = layerAt(src, tx + NB[i][0], ty + NB[i][1]);
      if (nl < 0) continue;
      if (PRIO[nl] < pr) lower = true;
      if (nl <= GAZLO) water = true;
    }
    buckets[pr].push(tx, ty, L, lower ? 1 : 0);
    if (water && L > MOCSAR) buckets[PRIO_BANK].push(tx, ty, PART, 2);
    if (src.height(tx, ty) > 0) hills.push(tx, ty);
  }
  for (let pr = 0; pr < NPRIO; pr++) {
    const b = buckets[pr];
    // a part előbb, hogy az azonos prioritású elöntés/nedves ne takarja furcsán
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < b.length; i += 4) {
      const kind = b[i + 3];
      if ((kind === 2) !== (pass === 0)) continue;
      const tx = b[i], ty = b[i + 1], tu = tx & 7, tv = ty & 7;
      const a = atlasCell(b[i + 2], season, kind, tu, tv);
      ctx.drawImage(a.c, tu * CW, tv * CH, CW, CH, ox + (tx - ty) * 32 - 64, oy + (tx + ty) * 16 + 16 - 32, CW, CH);
    }
  }
  if (hills.length) {
    const order: number[] = [];
    for (let i = 0; i < hills.length; i += 2) order.push(i);
    order.sort((a, b) => (hills[a] + hills[a + 1]) - (hills[b] + hills[b + 1]) || hills[a] - hills[b]);
    for (const i of order) {
      const tx = hills[i], ty = hills[i + 1], tu = tx & 7, tv = ty & 7;
      const sx = ox + (tx - ty) * 32, sy = oy + (tx + ty) * 16;
      const a = atlasCell(DOMB, season, 0, tu, tv);
      ctx.drawImage(a.c, tu * CW, tv * CH, CW, CH, sx - 64, sy + 16 - 32 - HILL_H, CW, CH);
      let mask = 0;
      for (let k = 0; k < 8; k++) if (src.height(tx + NB[k][0], ty + NB[k][1]) > 0) mask |= 1 << k;
      if (mask !== 255) {
        const sp = skirtSprite(mask, season, (hash2(tx, ty, 77) * 2) | 0);
        if (sp) ctx.drawImage(sp, sx - SAX, sy - SAY);
      }
    }
  }
}

// ---- vízcsillogás ----
const overlays: Sprite[] = [];
export function waterOverlay(frame: number): Sprite {
  frame = ((frame % 8) + 8) % 8;
  if (overlays[frame]) return overlays[frame];
  const c = mk(64, 32), g = g2(c);
  for (let i = 0; i < 9; i++) {
    const ph = (hash2(i, 1, 500) * 8) | 0, life = (frame - ph + 8) % 8;
    if (life > 3) continue;
    const y = 3 + ((hash2(i, 2, 500) * 26) | 0), hw = y < 16 ? 2 * (y + 1) : 2 * (32 - y);
    const len = life === 1 || life === 2 ? 5 : 3;
    const x = 32 - hw + 2 + ((hash2(i, 3, 500) * Math.max(1, hw * 2 - len - 4)) | 0) + life;
    if (hw * 2 < len + 6) continue;
    g.fillStyle = life === 1 ? 'rgba(255,255,255,0.55)' : 'rgba(235,245,255,0.32)';
    g.fillRect(x, y, len, 1);
  }
  return (overlays[frame] = { c, ax: 32, ay: 0 });
}

/** Egy évszak összes talajmintájának előállítása előre (évszakváltás előtti akadás elkerülésére). */
export function prewarmGround(season: Season): void { for (let L = 0; L <= DOMB; L++) patternCanvas(L, season); }
