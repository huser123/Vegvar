// A* útkeresés a csempehálón, mozgásosztályonkénti költséggel (1 / szorzó). Egész aritmetika.
import { FP, type World, type Unit } from './types';
import { passU, distRect } from './world';

let gCost = new Int32Array(0), parent = new Int32Array(0), stamp = new Int32Array(0), closed = new Uint8Array(0);
let heap = new Int32Array(0), heapF = new Int32Array(0), hn = 0, curStamp = 0;

function ensure(n: number): void {
  if (gCost.length >= n) return;
  gCost = new Int32Array(n); parent = new Int32Array(n); stamp = new Int32Array(n); closed = new Uint8Array(n);
  heap = new Int32Array(n * 4); heapF = new Int32Array(n * 4);
}
function hpush(i: number, f: number): void {
  if (hn >= heap.length) return;
  let k = hn++;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (heapF[p] <= f) break;
    heap[k] = heap[p]; heapF[k] = heapF[p]; k = p;
  }
  heap[k] = i; heapF[k] = f;
}
function hpop(): number {
  const top = heap[0];
  hn--;
  if (hn > 0) {
    const i = heap[hn], f = heapF[hn];
    let k = 0;
    for (;;) {
      let c = 2 * k + 1;
      if (c >= hn) break;
      if (c + 1 < hn && heapF[c + 1] < heapF[c]) c++;
      if (heapF[c] >= f) break;
      heap[k] = heap[c]; heapF[k] = heapF[c]; k = c;
    }
    heap[k] = i; heapF[k] = f;
  }
  return top;
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];

/**
 * Út a (sx,sy) csempétől a [x0,x1]×[y0,y1] csempe-téglalap r (FP) sugarú környezetéig.
 * Ha a cél elérhetetlen, a hozzá legközelebb jutó csempéig vezet. Visszaad: csempeindexek (a start nélkül).
 */
export function findPath(w: World, u: Unit, x0: number, y0: number, x1: number, y1: number, r: number): number[] {
  const W = w.W, H = w.H, N = W * H;
  ensure(N);
  curStamp++; hn = 0;
  const sx = Math.floor(u.x / FP), sy = Math.floor(u.y / FP), s = sy * W + sx;
  const gcx = (x0 + x1 + 1) * FP / 2, gcy = (y0 + y1 + 1) * FP / 2;
  const hx = (x1 - x0 + 1) * FP / 2, hy = (y1 - y0 + 1) * FP / 2;
  const heur = (i: number): number => {
    const px = (i % W) * FP + 500, py = ((i / W) | 0) * FP + 500;
    const dx = Math.max(0, Math.abs(px - gcx) - hx), dy = Math.max(0, Math.abs(py - gcy) - hy);
    const mn = dx < dy ? dx : dy, mx = dx < dy ? dy : dx;
    return ((mx * 800 + mn * 331) / FP) | 0; // legjobb szorzó: út 1,25 → 800 / csempe
  };
  const rr = Math.max(0, r - 150);
  stamp[s] = curStamp; gCost[s] = 0; parent[s] = -1; closed[s] = 0;
  hpush(s, heur(s));
  let best = s, bestH = heur(s), found = -1, iter = 0;
  while (hn > 0) {
    const c = hpop();
    if (closed[c]) continue;
    closed[c] = 1;
    const cx = c % W, cy = (c / W) | 0;
    if (distRect(cx * FP + 500, cy * FP + 500, x0, y0, x1, y1) <= rr) { found = c; break; }
    const hc = heur(c);
    if (hc < bestH) { bestH = hc; best = c; }
    if (++iter > 9000) break;
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX[d], ny = cy + DY[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (stamp[n] === curStamp && closed[n]) continue;
      const m = passU(w, n, u);
      if (m === 0) continue;
      if (d >= 4 && (passU(w, cy * W + nx, u) === 0 || passU(w, ny * W + cx, u) === 0)) continue;
      const g = gCost[c] + (((d >= 4 ? 1414000 : 1000000) / m) | 0);
      if (stamp[n] !== curStamp || g < gCost[n]) {
        stamp[n] = curStamp; closed[n] = 0; gCost[n] = g; parent[n] = c;
        hpush(n, g + heur(n));
      }
    }
  }
  let e = found >= 0 ? found : best;
  const out: number[] = [];
  while (e !== s && e >= 0) { out.push(e); e = parent[e]; }
  out.reverse();
  return out;
}

/** Szabad-e az egyenes út két pont között az egységnek (mintavételezve). */
export function lineClear(w: World, u: Unit, ax: number, ay: number, bx: number, by: number, minM = 1): boolean {
  const dx = bx - ax, dy = by - ay;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 300));
  for (let k = 1; k <= n; k++) {
    const px = ax + ((dx * k / n) | 0), py = ay + ((dy * k / n) | 0);
    if (px < 0 || py < 0 || px >= w.W * FP || py >= w.H * FP) return false;
    const i = Math.floor(py / FP) * w.W + Math.floor(px / FP);
    if (passU(w, i, u) < minM) return false;
  }
  return true;
}
