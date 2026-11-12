// Galéria az „A” grafikai modulok ellenőrzéséhez. ?s=terep|epulet|fal|targy|jelenet (alapból mind), &z=2 nagyítás.
import { BUILDINGS, T } from '../sim/data';
import { GroundSource, HILL_H, Season, Sprite, Team } from './api';
import { buildingSprite, rubbleSprite } from './buildings';
import { stoneSprite, stumpSprite, treeSprite, villageSprite } from './objects';
import { g2, hash2, mk } from './pal';
import { drawGround, waterOverlay } from './terrain';

const q = new URLSearchParams(location.search), only = q.get('s'), Z = +(q.get('z') ?? 1);
const root = document.getElementById('g')!;
function add(title: string, c: HTMLCanvasElement, zoom = Z): void {
  const h = document.createElement('h2'); h.textContent = title; root.appendChild(h);
  c.style.width = c.width * zoom + 'px'; c.style.height = c.height * zoom + 'px'; root.appendChild(c);
}
const N = 24;
function testMap(season: Season): GroundSource & { t: Uint8Array } {
  const t = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v: number = T.RET;
    const r = x + y * 0.55 + Math.sin(y * 0.5) * 1.6;
    if (r > 17 && r < 21) v = season === 3 ? T.JEG : T.FOLYO;
    if (v !== T.RET && y >= 11 && y <= 12) v = T.GAZLO;
    if (v === T.RET) {
      if (Math.hypot(x - 5, y - 5) < 3.6 + hash2(x, y, 1)) v = T.ERDO;
      if (Math.hypot(x - 9, y - 17) < 3.2) v = T.DOMB;
      if (x >= 2 && x <= 3 && y >= 14 && y <= 15) v = T.DOMB;
      if (r > 21 && r < 24 && y > 15 && y < 21) v = T.MOCSAR;
      if (y === 11 || y === 12 && x > 16) v = v === T.RET ? T.UT : v;
      if (x === 12 && y < 11) v = T.UT;
      if (x >= 15 && x <= 16 && y >= 3 && y <= 4) v = T.KO;
      if (x >= 19 && x <= 21 && y >= 1 && y <= 3) v = T.SZANTO;
    }
    t[y * N + x] = v;
  }
  return {
    w: N, h: N, t,
    type: (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? -1 : t[y * N + x]),
    height: (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? 0 : t[y * N + x] === T.DOMB ? 1 : 0),
    flooded: (x, y) => { if (season !== 0 || x < 0 || y < 0 || x >= N || y >= N) return false; const r = x + y * 0.55 + Math.sin(y * 0.5) * 1.6; return y < 9 && r > 15.6 && r <= 17 && t[y * N + x] === T.RET; },
  };
}
function put(g: CanvasRenderingContext2D, s: Sprite, x: number, y: number): void { g.drawImage(s.c, Math.round(x - s.ax), Math.round(y - s.ay)); }

function scene(season: Season, withObjects: boolean): HTMLCanvasElement {
  const src = testMap(season), c = mk(N * 64 + 64, N * 32 + 120), g = g2(c), ox = N * 32 + 32, oy = 70;
  // darabolt rajzolás 256×128-as képernyőcellákban, 2 csempés ráhagyással
  const t0 = performance.now();
  for (let cy = 0; cy < c.height; cy += 128) for (let cx = 0; cx < c.width; cx += 256) {
    g.save(); g.beginPath(); g.rect(cx, cy, 256, 128); g.clip();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [px, py] of [[cx, cy - HILL_H], [cx + 256, cy - HILL_H], [cx, cy + 128 + HILL_H], [cx + 256, cy + 128 + HILL_H]]) {
      const sx = px - ox, sy = py - oy, u = sx / 64 + sy / 32, v = sy / 32 - sx / 64;
      x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v);
    }
    drawGround(g, src, season, Math.floor(x0) - 2, Math.floor(y0) - 2, Math.ceil(x1) + 3, Math.ceil(y1) + 3, ox, oy);
    g.restore();
  }
  const dt = performance.now() - t0;
  const t1 = performance.now(); const tmp = mk(1400, 800); drawGround(g2(tmp), src, season, 0, 0, 20, 20, 700, 40); const dt2 = performance.now() - t1;
  g.fillStyle = '#fff'; g.fillText(`drawGround darabolva: ${dt.toFixed(1)} ms; 20×20 egyben (meleg gyorsítótár): ${dt2.toFixed(1)} ms`, 6, 12);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (src.t[y * N + x] === T.FOLYO && (x + y) % 2 === 0) put(g, waterOverlay((x * 3 + y) & 7), ox + (x - y) * 32, oy + (x + y) * 16);
  if (!withObjects) return c;
  type It = { d: number; f: () => void };
  const items: It[] = [];
  const P = (u: number, v: number): [number, number] => [ox + (u - v) * 32, oy + (u + v) * 16 - (src.height(Math.floor(u), Math.floor(v)) ? HILL_H : 0)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const tt = src.t[y * N + x];
    if (tt === T.ERDO) for (let k = 0; k < 2; k++) {
      const u = x + 0.25 + hash2(x, y, 10 + k) * 0.5, v = y + 0.25 + hash2(x, y, 20 + k) * 0.5, [sx, sy] = P(u, v);
      const vr = (hash2(x, y, 30 + k) * 8) | 0;
      items.push({ d: u + v, f: () => put(g, hash2(x, y, 40 + k) < 0.06 ? stumpSprite() : treeSprite(season, vr), sx, sy) });
    }
    if (tt === T.KO) { const [sx, sy] = P(x + 0.5, y + 0.5); items.push({ d: x + y + 1, f: () => put(g, stoneSprite((x + y) & 3, (x * 2 + y) % 3), sx, sy) }); }
  }
  const bld = (id: string, x: number, y: number, o: Partial<Parameters<typeof buildingSprite>[1]> = {}): void => {
    const d = BUILDINGS[id], rot = o.rot ?? 0, w = rot ? d.h : d.w, h = rot ? d.w : d.h, [sx, sy] = P(x + w / 2, y + h / 2);
    items.push({ d: x + y + (w + h) / 2, f: () => put(g, buildingSprite(id, { faction: 0, team: 0, season, stage: 3, ...o }), sx, sy) });
  };
  bld('var', 7, 8); bld('haz', 12, 7); bld('haz', 14, 8, { faction: 2, team: 2 }); bld('malom', 4, 10); bld('kaszarnya', 12, 13);
  bld('szanto', 1, 17, { farm: season === 2 ? 2 : season === 1 ? 1 : 0 }); bld('szanto', 4, 20, { farm: 1 });
  bld('ortorony', 13, 11 - 1); bld('karam', 13, 2, { cattle: 3 }); bld('fatelep', 9, 3); bld('kobanya', 17, 5); bld('strazsa', 10, 18);
  bld('istallo', 16, 13, { stage: 2 }); bld('kovacs', 12, 17, { stage: 1 }); bld('vasarter', 15, 17, { stage: 0 });
  for (let i = 0; i < 6; i++) bld('palank', 6 + i, 13, { mask: (i > 0 ? 8 : 4) | (i < 5 ? 2 : 4) });
  bld('palank', 6, 14, { mask: 1 | 4 }); bld('palank', 6, 15, { mask: 1 }); bld('palank', 11, 14, { mask: 1 | 4 }); bld('palank_kapu', 11, 15);
  { const [sx, sy] = P(20.5, 8.5); items.push({ d: 29, f: () => put(g, villageSprite(season, false), sx, sy) }); }
  bld('satortabor', 20, 12, { faction: 1, team: 1 }); bld('dzsami', 20, 16, { faction: 1, team: 1 }); bld('bastya', 16, 21 - 1, { faction: 2, team: 2 });
  items.sort((a, b) => a.d - b.d).forEach(i => i.f());
  return c;
}

const SN = ['tavasz', 'nyár', 'ősz', 'tél'];
if (!only || only === 'terep') for (const s of [0, 1, 2, 3] as Season[]) add('Terep – ' + SN[s], scene(s, false));
if (!only || only === 'jelenet') for (const s of [0, 1, 2, 3] as Season[]) { if (q.get('se') && +q.get('se')! !== s) continue; add('Jelenet – ' + SN[s], scene(s, true)); }

function sheet(cells: { s: Sprite; label: string }[], cw: number, ch: number, cols: number, bg = '#6f8f48'): HTMLCanvasElement {
  const rows = Math.ceil(cells.length / cols), c = mk(cols * cw, rows * ch), g = g2(c);
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.font = '10px system-ui';
  cells.forEach((cell, i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    g.drawImage(cell.s.c, x + ((cw - cell.s.c.width) >> 1), y + ch - 14 - cell.s.c.height);
    g.fillStyle = '#fff'; g.fillText(cell.label, x + 3, y + ch - 3);
  });
  return c;
}
if (!only || only === 'epulet') {
  const ids = (q.get('id') ?? Object.keys(BUILDINGS).filter(i => i !== 'palank' && i !== 'kofal').join(',')).split(',');
  for (const id of ids) {
    const d = BUILDINGS[id], cells: { s: Sprite; label: string }[] = [];
    for (const f of d.frakcio) cells.push({ s: buildingSprite(id, { faction: f, team: f as Team, season: 1, stage: 3, farm: f as 0 | 1 | 2, cattle: f + 2 }), label: `${id} f${f}` });
    for (const st of [0, 1, 2] as const) cells.push({ s: buildingSprite(id, { faction: d.frakcio[0], team: 3, season: 1, stage: st }), label: `fázis ${st}` });
    cells.push({ s: buildingSprite(id, { faction: d.frakcio[0], team: 3, season: 3, stage: 3, farm: 2, cattle: 4 }), label: 'tél' });
    if (d.w !== d.h) cells.push({ s: buildingSprite(id, { faction: d.frakcio[0], team: 0, season: 1, stage: 3, rot: 1 }), label: 'rot' });
    const cw = Math.max(...cells.map(c => c.s.c.width)) + 12, ch = Math.max(...cells.map(c => c.s.c.height)) + 22;
    add(`${d.nev} (${id}) ${d.w}×${d.h}`, sheet(cells, cw, ch, cells.length));
  }
}
if (!only || only === 'fal') {
  for (const id of ['palank', 'kofal']) {
    const cells: { s: Sprite; label: string }[] = [];
    for (let m = 0; m < 16; m++) cells.push({ s: buildingSprite(id, { faction: 0, team: 0, season: 1, stage: 3, mask: m }), label: 'm' + m });
    for (const st of [0, 1, 2] as const) cells.push({ s: buildingSprite(id, { faction: 0, team: 0, season: 1, stage: st, mask: 10 }), label: 'f' + st });
    cells.push({ s: buildingSprite(id, { faction: 0, team: 0, season: 3, stage: 3, mask: 5 }), label: 'tél' });
    add(id, sheet(cells, 84, 84, 10));
  }
  // összeállított falgyűrű kapuval
  const c = mk(520, 320), g = g2(c); g.fillStyle = '#6f8f48'; g.fillRect(0, 0, 520, 320);
  const W = 7, H = 6, ox = 250, oy = 60, set = new Set<string>();
  for (let x = 0; x < W; x++) { set.add(x + ',0'); set.add(x + ',' + (H - 1)); } for (let y = 0; y < H; y++) { set.add('0,' + y); set.add((W - 1) + ',' + y); }
  set.delete((W - 1) + ',2'); set.delete((W - 1) + ',3');
  const it: { d: number; f: () => void }[] = [];
  const has = (x: number, y: number): boolean => set.has(x + ',' + y) || (x === W - 1 && (y === 2 || y === 3));
  for (const k of set) {
    const [x, y] = k.split(',').map(Number), m = (has(x, y - 1) ? 1 : 0) | (has(x + 1, y) ? 2 : 0) | (has(x, y + 1) ? 4 : 0) | (has(x - 1, y) ? 8 : 0);
    it.push({ d: x + y + 1, f: () => put(g, buildingSprite(x < 3 ? 'palank' : 'kofal', { faction: 0, team: 0, season: 1, stage: 3, mask: m }), ox + (x - y) * 32, oy + (x + y + 1) * 16) });
  }
  it.push({ d: W - 1 + 2 + 1.5, f: () => put(g, buildingSprite('ko_kapu', { faction: 0, team: 0, season: 1, stage: 3 }), ox + (W - 1 + 0.5 - 3) * 32, oy + (W - 1 + 0.5 + 3) * 16) });
  it.sort((a, b) => a.d - b.d).forEach(i => i.f());
  add('Falgyűrű', c);
}
if (!only || only === 'targy') {
  for (const s of [0, 1, 2, 3] as Season[]) add('Fák – ' + SN[s], sheet(Array.from({ length: 8 }, (_, v) => ({ s: treeSprite(s, v), label: 'v' + v })), 84, 100, 8, ['#5e9440', '#6e8a3a', '#8c8044', '#e2e8f0'][s]));
  const st: { s: Sprite; label: string }[] = [];
  for (let v = 0; v < 4; v++) for (let l = 0; l < 3; l++) st.push({ s: stoneSprite(v, l), label: `kő ${v}/${l}` });
  st.push({ s: stumpSprite(), label: 'tuskó' });
  for (const [w, h] of [[1, 1], [2, 2], [3, 3], [4, 4]]) st.push({ s: rubbleSprite(w, h), label: `rom ${w}×${h}` });
  add('Kő, tuskó, rom', sheet(st, 150, 110, 9));
  add('Falu', sheet(([0, 1, 2, 3] as Season[]).flatMap(s => [{ s: villageSprite(s, false), label: SN[s] }, { s: villageSprite(s, true), label: SN[s] + ' égett' }]), 260, 190, 4));
}
document.title = 'kesz';
