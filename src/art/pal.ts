// Közös segédek a grafikai modulokhoz: vászon, determinisztikus zaj, színkezelés, csapatszínek.

export function mk(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  return c;
}
export function g2(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = false;
  return g;
}

/** Egész hash [0,1) tartományba; a csempe- és pixelváltozatokhoz. */
export function hash2(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function rng(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

export type RGB = [number, number, number];
export function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
export function css(c: RGB, a = 1): string {
  return a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}
export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
/** f < 1 sötétít (kissé kékes árnyék felé), f > 1 világosít (meleg fény felé). */
export function shade(c: RGB, f: number): RGB {
  return f <= 1 ? mix([20, 16, 34], c, f) : mix(c, [255, 244, 214], Math.min(1, f - 1));
}

// Csapatszínek: sötét, alap, világos árnyalat. 0 rézvörös, 1 zöld, 2 sárga, 3 kék, 4 semleges.
export const TEAM: { d: RGB; m: RGB; l: RGB; css: string; nev: string }[] = [
  { d: hex('#7a2415'), m: hex('#c2452a'), l: hex('#ee8a5c'), css: '#c2452a', nev: 'rézvörös' },
  { d: hex('#1f5a2c'), m: hex('#3c9a48'), l: hex('#8fd482'), css: '#3c9a48', nev: 'zöld' },
  { d: hex('#8a6410'), m: hex('#dcae28'), l: hex('#ffe58a'), css: '#dcae28', nev: 'sárga' },
  { d: hex('#1d3f86'), m: hex('#3b74d0'), l: hex('#8fbcf6'), css: '#3b74d0', nev: 'kék' },
  { d: hex('#4a4a4a'), m: hex('#8c8c8c'), l: hex('#cfcfcf'), css: '#8c8c8c', nev: 'semleges' },
];

// A motívumlap alapszínei
export const INK = hex('#2b2b2b'), PARCH = hex('#fbfaf6'), COPPER = hex('#b5573a'),
  RIVER = hex('#4f86b8'), MEADOW = hex('#5f9a4a');

/** Pixelenkénti zajos kitöltés egy maszkolt területen: az alfa megmarad, a szín ±amp-pal szór. */
export function grain(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, amp: number, seed = 1): void {
  const id = g.getImageData(x, y, w, h), d = id.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (j * w + i) * 4;
    if (!d[k + 3]) continue;
    const n = (hash2(i + x, j + y, seed) - 0.5) * 2 * amp;
    d[k] = Math.max(0, Math.min(255, d[k] + n));
    d[k + 1] = Math.max(0, Math.min(255, d[k + 1] + n));
    d[k + 2] = Math.max(0, Math.min(255, d[k + 2] + n));
  }
  g.putImageData(id, x, y);
}
