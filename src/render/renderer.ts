// Izometrikus megjelenítő: darabolt talaj-gyorsítótár, mélység szerint rendezett sprite-ok, köd, effektek, kistérkép.
import { T, UNITS, TICKS } from '../sim/data';
import { FP, HPU, ANIM, type World, type Unit, type Building, type Ev } from '../sim/types';
import { canSeeUnit, season, canPlace } from '../sim/world';
import { HILL_H, type Sprite, type Season, type Team, type FactionIdx, type FxKind, type GroundSource, type UnitAnim } from '../art/api';
import { drawGround, waterOverlay, prewarmGround } from '../art/terrain';
import { treeSprite, stumpSprite, stoneSprite, villageSprite } from '../art/objects';
import { buildingSprite, rubbleSprite } from '../art/buildings';
import { unitSprite, animalSprite, UNIT_FRAMES } from '../art/units';
import { fxSprite, flagSprite, FX_FRAMES } from '../art/effects';
import { TEAM, hash2 } from '../art/pal';

const CH = 16, PAD = 44;
interface Chunk { c: HTMLCanvasElement; ver: number; used: number }
interface Item { k: number; s: Sprite; x: number; y: number; a?: number; flip?: boolean }
interface Fx { kind: FxKind; x: number; y: number; z: number; t0: number; dur: number; rise?: number }
interface VProj { x0: number; y0: number; x1: number; y1: number; t0: number; dur: number; ivelt: boolean }
interface Corpse { def: string; team: Team; dir: number; x: number; y: number; t0: number }

export interface UiState {
  sel: Set<number>; selB: number; hoverU: number; hoverB: number;
  box: { x0: number; y0: number; x1: number; y1: number } | null;
  ghost: { id: string; rot: number; tiles: { x: number; y: number; ok: boolean }[] } | null;
  markers: { x: number; y: number; t0: number; col: string }[];
  pings: { x: number; y: number; t0: number }[];
}

export class Renderer {
  ctx: CanvasRenderingContext2D;
  camX = 0; camY = 0; zoom = 1; cw = 800; ch = 600;
  private chunks = new Map<number, Chunk>();
  private gver = 1; private frame = 0;
  private fogC: HTMLCanvasElement; private fogImg: ImageData; private fogTick = -99;
  private mmBase: HTMLCanvasElement; private mmAt = 0;
  private fx: Fx[] = []; private projs: VProj[] = []; private tracers: { x0: number; y0: number; x1: number; y1: number; t0: number }[] = [];
  private corpses: Corpse[] = []; private rubble: { x: number; y: number; w: number; h: number; t0: number }[] = [];
  private stumps: { x: number; y: number; t0: number }[] = [];
  private masks = new Map<number, number>(); private maskVer = -1;
  private items: Item[] = []; private src: GroundSource;
  private wx: Float32Array; private wy: Float32Array; private wn = 0;
  shake = 0;

  constructor(public canvas: HTMLCanvasElement, public w: World, public me: number) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.fogC = document.createElement('canvas'); this.fogC.width = w.W + 16; this.fogC.height = w.H + 16;
    this.fogImg = new ImageData(w.W + 16, w.H + 16);
    for (let i = 0; i < this.fogImg.data.length; i += 4) { this.fogImg.data[i] = 6; this.fogImg.data[i + 1] = 8; this.fogImg.data[i + 2] = 14; this.fogImg.data[i + 3] = 255; }
    this.mmBase = document.createElement('canvas'); this.mmBase.width = w.W; this.mmBase.height = w.H;
    this.src = {
      w: w.W, h: w.H,
      type: (x, y) => { if (x < 0 || y < 0 || x >= w.W || y >= w.H) return -1; const i = y * w.W + x; return w.flood[i] ? (w.base[i] === T.GAZLO ? T.FOLYO : w.base[i]) : w.cur[i]; },
      height: (x, y) => (x < 0 || y < 0 || x >= w.W || y >= w.H) ? 0 : w.hgt[y * w.W + x],
      flooded: (x, y) => (x < 0 || y < 0 || x >= w.W || y >= w.H) ? false : w.flood[y * w.W + x] === 1 && w.base[y * w.W + x] !== T.GAZLO,
    };
    this.wx = new Float32Array(400); this.wy = new Float32Array(400);
    this.resize();
  }

  resize(): void {
    const cssW = this.canvas.clientWidth || window.innerWidth, cssH = this.canvas.clientHeight || window.innerHeight;
    this.cw = Math.ceil(cssW / this.zoom); this.ch = Math.ceil(cssH / this.zoom);
    this.canvas.width = this.cw; this.canvas.height = this.ch;
    this.ctx.imageSmoothingEnabled = false;
  }
  setZoom(z: number): void { this.zoom = Math.max(1, Math.min(3, z)); this.resize(); }

  // ---- koordináták ----
  /** Világ (FP) → vászon pixel, dombmagasság nélkül. */
  sx(x: number, y: number): number { return (x - y) * 32 / FP - this.camX + (this.cw >> 1); }
  sy(x: number, y: number): number { return (x + y) * 16 / FP - this.camY + (this.ch >> 1); }
  hillAt(x: number, y: number): number {
    const tx = Math.floor(x / FP), ty = Math.floor(y / FP);
    if (tx < 0 || ty < 0 || tx >= this.w.W || ty >= this.w.H) return 0;
    return this.w.hgt[ty * this.w.W + tx] ? HILL_H : 0;
  }
  /** Vászon pixel → világ (FP). */
  toWorld(px: number, py: number): { x: number; y: number } {
    const ix = px + this.camX - (this.cw >> 1), iy = py + this.camY - (this.ch >> 1);
    return { x: (ix / 32 + iy / 16) / 2 * FP, y: (iy / 16 - ix / 32) / 2 * FP };
  }
  centerOn(x: number, y: number): void { this.camX = (x - y) * 32 / FP; this.camY = (x + y) * 16 / FP; this.clampCam(); }
  clampCam(): void {
    const W = this.w.W;
    this.camX = Math.max(-W * 32, Math.min(W * 32, this.camX));
    this.camY = Math.max(0, Math.min(W * 32, this.camY));
  }
  camWorld(): { x: number; y: number } { return this.toWorld(this.cw >> 1, this.ch >> 1); }

  invalidateAll(): void { this.gver++; }
  invalidateTile(tx: number, ty: number): void {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = Math.floor((tx + dx * 3) / CH), cy = Math.floor((ty + dy * 3) / CH);
      const c = this.chunks.get(cy * 64 + cx); if (c) c.ver = -1;
    }
  }

  // ---- események a szimulációból ----
  onEvent(e: Ev, now: number): void {
    switch (e.t) {
      case 'terrain': this.invalidateAll(); break;
      case 'season': prewarmGround(e.s as Season); this.invalidateAll(); break;
      case 'tree': this.invalidateTile(e.x, e.y); this.stumps.push({ x: e.x * FP + 500, y: e.y * FP + 500, t0: now }); this.addFx('por', e.x * FP + 500, e.y * FP + 500, 0, now); break;
      case 'shot':
        this.addFx('loves', e.x, e.y, e.big ? 14 : 16, now);
        if (!e.big) { this.tracers.push({ x0: e.x, y0: e.y, x1: e.tx, y1: e.ty, t0: now }); if (e.hit) this.addFx('talalat', e.tx, e.ty, 12, now + 60); }
        else this.addFx('fust', e.x, e.y, 10, now, 14);
        break;
      case 'melee': this.addFx('talalat', e.x, e.y, 14, now); break;
      case 'proj': this.projs.push({ x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, t0: now, dur: e.dur * 50, ivelt: e.ivelt }); break;
      case 'boom': this.addFx(e.water ? 'csobbanas' : 'robbanas', e.x, e.y, 0, now); if (!e.water) { this.addFx('fust', e.x, e.y, 14, now + 250, 20); if (this.onScreen(e.x, e.y)) this.shake = 5; } break;
      case 'die': {
        const p = this.w.players[e.owner];
        this.corpses.push({ def: e.def, team: p.color as Team, dir: dirOf(e.fx, e.fy), x: e.x, y: e.y, t0: now });
        if (this.corpses.length > 150) this.corpses.shift();
        break;
      }
      case 'bdie': this.rubble.push({ x: e.x, y: e.y, w: e.w, h: e.h, t0: now }); this.addFx('por', (e.x + e.w / 2) * FP, (e.y + e.h / 2) * FP, 6, now); this.addFx('fust', (e.x + e.w / 2) * FP, (e.y + e.h / 2) * FP, 10, now, 26); break;
    }
  }
  addFx(kind: FxKind, x: number, y: number, z: number, t0: number, rise = 0): void {
    if (this.fx.length > 400) return;
    this.fx.push({ kind, x, y, z, t0, dur: FX_FRAMES[kind] * (kind === 'fust' ? 110 : 60), rise });
  }
  onScreen(x: number, y: number): boolean {
    const px = this.sx(x, y), py = this.sy(x, y);
    return px > -60 && py > -60 && px < this.cw + 60 && py < this.ch + 100;
  }

  // ---- talaj ----
  private chunk(cx: number, cy: number): Chunk {
    const key = cy * 64 + cx;
    let c = this.chunks.get(key);
    if (!c) {
      if (this.chunks.size >= 20) { // a legrégebben használt darab ürítése
        let old = -1, ou = 1e18;
        for (const [k, v] of this.chunks) if (v.used < ou) { ou = v.used; old = k; }
        const o = this.chunks.get(old)!; this.chunks.delete(old);
        c = { c: o.c, ver: -1, used: 0 };
      } else {
        const cv = document.createElement('canvas'); cv.width = CH * 64 + PAD * 2; cv.height = CH * 32 + PAD * 2;
        c = { c: cv, ver: -1, used: 0 };
      }
      this.chunks.set(key, c);
    }
    if (c.ver !== this.gver) {
      const g = c.c.getContext('2d')!;
      const x0 = cx * CH, y0 = cy * CH;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.c.width, c.c.height);
      const ox = PAD - (x0 - y0 - CH) * 32, oy = PAD - (x0 + y0) * 16;
      const tx = PAD + CH * 32, e = 22;
      g.save(); g.beginPath();
      g.moveTo(tx, PAD - e); g.lineTo(tx + CH * 32 + e * 2, PAD + CH * 16); g.lineTo(tx, PAD + CH * 32 + e); g.lineTo(tx - CH * 32 - e * 2, PAD + CH * 16); g.closePath(); g.clip();
      g.imageSmoothingEnabled = false;
      drawGround(g, this.src, season(this.w) as Season, x0 - 2, y0 - 2, x0 + CH + 2, y0 + CH + 2, ox, oy);
      g.restore();
      c.ver = this.gver;
    }
    c.used = this.frame;
    return c;
  }

  // ---- fő rajzolás ----
  draw(alpha: number, ui: UiState, now: number): void {
    const w = this.w, g = this.ctx, me = this.me, vis = w.players[me].vis;
    this.frame++;
    const sea = season(w) as Season;
    let shx = 0, shy = 0;
    if (this.shake > 0) { shx = (hash2(this.frame, 1) - 0.5) * this.shake; shy = (hash2(this.frame, 2) - 0.5) * this.shake; this.shake *= 0.85; if (this.shake < 0.5) this.shake = 0; }
    const camX0 = this.camX, camY0 = this.camY;
    this.camX = Math.round(this.camX + shx); this.camY = Math.round(this.camY + shy);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#07090c'; g.fillRect(0, 0, this.cw, this.ch);

    // látható csempetartomány
    const c0 = this.toWorld(0, 0), c1 = this.toWorld(this.cw, 0), c2 = this.toWorld(0, this.ch), c3 = this.toWorld(this.cw, this.ch);
    const bMin = Math.floor((c0.x + c0.y) / FP) - 2, bMax = Math.ceil((c3.x + c3.y) / FP) + 8;
    const aMin = Math.floor((c0.x - c0.y) / FP) - 3, aMax = Math.ceil((c1.x - c1.y) / FP) + 3;
    void c2;
    // talajdarabok
    const seen = new Set<number>();
    for (const [px, py] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5], [0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const p = this.toWorld(px * this.cw, py * this.ch);
      const cx = Math.floor(p.x / FP / CH), cy = Math.floor(p.y / FP / CH);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x * CH >= w.W || y * CH >= w.H) continue;
        seen.add(y * 64 + x);
      }
    }
    for (const key of seen) {
      const cx = key % 64, cy = Math.floor(key / 64);
      const x0 = cx * CH, y0 = cy * CH;
      const dx = (x0 - y0 - CH) * 32 - PAD - this.camX + (this.cw >> 1), dy = (x0 + y0) * 16 - PAD - this.camY + (this.ch >> 1);
      if (dx > this.cw || dy > this.ch || dx + CH * 64 + PAD * 2 < 0 || dy + CH * 32 + PAD * 2 < 0) continue;
      g.drawImage(this.chunk(cx, cy).c, dx, dy);
    }

    // víz csillogása + tárgyak gyűjtése
    const items = this.items; items.length = 0;
    const wf = waterOverlay(Math.floor(now / 140) % 8);
    const W = w.W, H = w.H;
    for (let b = bMin; b <= bMax; b++) for (let a = aMin; a <= aMax; a++) {
      if ((a + b) & 1) continue;
      const tx = (a + b) >> 1, ty = (b - a) >> 1;
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const i = ty * W + tx, v = vis[i];
      if (v === 0) continue;
      const t = w.cur[i];
      const px = (tx - ty) * 32 - this.camX + (this.cw >> 1), py = (tx + ty) * 16 - this.camY + (this.ch >> 1);
      if (t === T.FOLYO || t === T.GAZLO) g.drawImage(wf.c, px - wf.ax, py - wf.ay);
      else if (t === T.ERDO) {
        const h = hash2(tx, ty, 5), h2 = hash2(tx, ty, 9);
        const s = treeSprite(sea, Math.floor(h * 8));
        const jx = (h2 - 0.5) * 18, jy = (hash2(tx, ty, 3) - 0.5) * 8;
        items.push({ k: (tx + ty + 1) * FP + jy * 40, s, x: px + jx, y: py + 16 + jy });
        if (h > 0.55) { const s2 = treeSprite(sea, Math.floor(h2 * 8)); items.push({ k: (tx + ty + 1) * FP - 300, s: s2, x: px - jx * 0.8 + 6, y: py + 9 }); }
      } else if (t === T.KO) {
        const lv = w.stone[i] > 600 * 10000 ? 0 : w.stone[i] > 250 * 10000 ? 1 : 2;
        items.push({ k: (tx + ty + 1) * FP, s: stoneSprite(Math.floor(hash2(tx, ty, 7) * 4), lv), x: px, y: py + 16 });
      }
    }

    // talajszintű jelölések: kijelölés, gyülekezőpont, lerakási szellem
    this.drawGroundMarks(ui, now);

    // romok, tuskók, tetemek
    this.rubble = this.rubble.filter(r => now - r.t0 < 45000);
    for (const r of this.rubble) {
      const x = (r.x + r.w / 2) * FP, y = (r.y + r.h / 2) * FP;
      if (!this.onScreen(x, y) || vis[Math.floor(y / FP) * W + Math.floor(x / FP)] === 0) continue;
      items.push({ k: (r.x + r.y) * FP, s: rubbleSprite(r.w, r.h), x: this.sx(x, y), y: this.sy(x, y), a: Math.min(1, (45000 - (now - r.t0)) / 8000) });
    }
    this.stumps = this.stumps.filter(s => now - s.t0 < 30000);
    for (const s of this.stumps) if (this.onScreen(s.x, s.y)) items.push({ k: s.x + s.y - 400, s: stumpSprite(), x: this.sx(s.x, s.y), y: this.sy(s.x, s.y), a: Math.min(1, (30000 - (now - s.t0)) / 5000) });
    this.corpses = this.corpses.filter(c => now - c.t0 < 28000);
    for (const c of this.corpses) {
      if (!this.onScreen(c.x, c.y) || vis[Math.floor(c.y / FP) * W + Math.floor(c.x / FP)] !== 2) continue;
      const f = Math.min(UNIT_FRAMES.hal - 1, Math.floor((now - c.t0) / 110));
      items.push({ k: c.x + c.y - 200, s: unitSprite(c.def, c.team, c.dir, 'hal', f), x: this.sx(c.x, c.y), y: this.sy(c.x, c.y) - this.hillAt(c.x, c.y), a: Math.min(1, (28000 - (now - c.t0)) / 6000) });
    }

    // falvak
    for (const v of w.villages) {
      const x = v.x * FP + 500, y = v.y * FP + 500;
      if (!this.onScreen(x, y) || vis[v.y * W + v.x] === 0) continue;
      const px = this.sx(x, y), py = this.sy(x, y);
      items.push({ k: x + y, s: villageSprite(sea, v.burnt > w.tick), x: px, y: py });
      if (v.owner >= 0) items.push({ k: x + y + 1600, s: flagSprite(w.players[v.owner].color as Team, Math.floor(now / 160) % 4), x: px + 6, y: py + 30 });
      if (v.burnt > w.tick && w.tick - (v.burnt - 480 * TICKS) < 60 * TICKS) for (let k = 0; k < 3; k++)
        items.push({ k: x + y + 10 + k, s: fxSprite('tuz', (Math.floor(now / 80) + k * 3) % FX_FRAMES.tuz), x: px - 28 + k * 26, y: py - 14 + (k % 2) * 12 });
    }

    // épületek
    if (this.maskVer !== w.terrainVer) { this.masks.clear(); this.maskVer = w.terrainVer; }
    for (const b of w.buildings) {
      if (b.dead) continue;
      const x = (b.x + b.w / 2) * FP, y = (b.y + b.h / 2) * FP;
      if (!this.onScreen(x, y) && b.w < 4) continue;
      if (vis[b.y * W + b.x] === 0 && vis[(b.y + b.h - 1) * W + b.x + b.w - 1] === 0) continue;
      const p = w.players[b.owner];
      const total = b.def.epites * 1000 || 1;
      const stage = b.built ? 3 : b.prog < total * 0.3 ? 0 : b.prog < total * 0.65 ? 1 : 2;
      let mask = 0;
      if (b.def.fal) {
        mask = this.masks.get(b.id) ?? -1;
        if (mask < 0) {
          const wallAt = (tx: number, ty: number) => { if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false; const o = w.occ[ty * W + tx]; if (o <= 0 || o === b.id) return false; const n = w.bmap.get(o); return !!n && (n.def.fal || n.def.id === 'ortorony' || n.def.id === 'bastya' || n.def.id === 'var'); };
          mask = (wallAt(b.x, b.y - 1) ? 1 : 0) | (wallAt(b.x + b.w, b.y) ? 2 : 0) | (wallAt(b.x, b.y + b.h) ? 4 : 0) | (wallAt(b.x - 1, b.y) ? 8 : 0);
          this.masks.set(b.id, mask);
        }
      }
      const s = buildingSprite(b.def.id, { faction: p.faction as FactionIdx, team: p.color as Team, season: sea, stage: stage as 0 | 1 | 2 | 3, rot: b.rot as 0 | 1, mask,
        farm: b.farm as 0 | 1 | 2, cattle: b.cattle.filter(c => c >= 180 * TICKS).length });
      const px = this.sx(x, y), py = this.sy(x, y);
      const key = b.def.jarhato ? (b.x + b.y) * FP - 1 : x + y;
      items.push({ k: key, s, x: px, y: py });
      if (b.fire > 0) {
        const n = Math.max(2, b.w + b.h - 1);
        for (let k = 0; k < n; k++) {
          const ox = (hash2(b.id, k, 1) - 0.5) * (b.w + b.h) * 22, oy = -10 - hash2(b.id, k, 2) * Math.min(60, s.ay * 0.6);
          items.push({ k: key + 2 + k, s: fxSprite('tuz', (Math.floor(now / 70) + k * 3) % FX_FRAMES.tuz), x: px + ox, y: py + oy });
        }
        if (this.frame % 14 === 0) this.addFx('fust', x, y, 30 + hash2(this.frame, b.id) * 30, now, 30);
      } else if (b.built && b.hp < b.def.hp * HPU * 0.4 && this.frame % 40 === (b.id % 40)) this.addFx('fust', x, y, 24, now, 22);
    }

    // állatok
    for (const a of w.animals) {
      if (a.food <= 0 || !this.onScreen(a.x, a.y) || vis[Math.floor(a.y / FP) * W + Math.floor(a.x / FP)] !== 2) continue;
      const d = dirOf(a.fx, a.fy);
      const s = animalSprite('szarvas', d, a.dead ? 0 : a.moving ? 1 + Math.floor(now / 130) % 3 : 0);
      items.push({ k: a.x + a.y - (a.dead ? 300 : 0), s, x: this.sx(a.x, a.y), y: this.sy(a.x, a.y) - this.hillAt(a.x, a.y), flip: a.dead });
    }

    // egységek
    this.wn = 0;
    for (const u of w.units) {
      if (u.dead || u.inB) continue;
      const anyU = u as any;
      const x = anyU.px !== undefined ? anyU.px + (u.x - anyU.px) * alpha : u.x, y = anyU.py !== undefined ? anyU.py + (u.y - anyU.py) * alpha : u.y;
      if (!this.onScreen(x, y)) continue;
      if (!canSeeUnit(w, me, u)) continue;
      const p = w.players[u.owner];
      const team = (u.lazado > 0 ? 4 : p.color) as Team;
      let anim: UnitAnim = 'all', fr = Math.floor(now / 600 + u.uid) % UNIT_FRAMES.all;
      const since = w.tick - u.animT;
      if (since < 10 && since >= 0) { anim = 'tamad'; fr = Math.min(UNIT_FRAMES.tamad - 1, Math.floor((since + alpha) / 2)); }
      else if (u.anim === ANIM.MEGY) { anim = 'megy'; fr = Math.floor(now / (u.def.osztaly === 'lovas' ? 70 : 95) + u.uid * 3) % UNIT_FRAMES.megy; }
      else if (u.anim === ANIM.MUNKA) { anim = 'munka'; fr = Math.floor(now / 110 + u.uid) % UNIT_FRAMES.munka; }
      const carry = u.def.id === 'jobbagy' && u.carry > 0 ? (['e', 'f', 'k'] as const)[u.carryT] ?? null : null;
      const s = unitSprite(u.def.id, team, dirOf(u.fx, u.fy), anim, fr, carry ? { carry } : undefined);
      // dombmagasság simítása
      const th = this.hillAt(x, y);
      anyU.rh = anyU.rh === undefined ? th : anyU.rh + (th - anyU.rh) * 0.25;
      const px = this.sx(x, y), py = this.sy(x, y) - anyU.rh;
      anyU.spx = px; anyU.spy = py;
      items.push({ k: x + y, s, x: px, y: py });
      if (u.cattle > 0) items.push({ k: x + y - 500, s: animalSprite('marha', dirOf(u.fx, u.fy), u.anim === ANIM.MEGY ? 1 + Math.floor(now / 140) % 3 : 0), x: px - u.fx * 0.02, y: py - u.fy * 0.01 - 4 });
      if (this.wn < 400) { this.wx[this.wn] = px; this.wy[this.wn++] = py; }
    }

    // lövedékek és effektek
    this.projs = this.projs.filter(p => now - p.t0 < p.dur);
    for (const p of this.projs) {
      const t = (now - p.t0) / p.dur;
      const x = p.x0 + (p.x1 - p.x0) * t, y = p.y0 + (p.y1 - p.y0) * t;
      const d = Math.hypot(p.x1 - p.x0, p.y1 - p.y0) / FP;
      const z = 12 + Math.sin(t * Math.PI) * d * (p.ivelt ? 9 : 2.5);
      const px = this.sx(x, y), py = this.sy(x, y);
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(Math.round(px) - 2, Math.round(py) - 1, 4, 2);
      items.push({ k: x + y + 300, s: fxSprite('golyo', 0), x: px, y: py - z });
      if (this.frame % 3 === 0 && this.fx.length < 300) this.fx.push({ kind: 'fust', x, y, z, t0: now - 300, dur: 500, rise: 4 });
    }
    this.fx = this.fx.filter(f => now - f.t0 < f.dur);
    for (const f of this.fx) {
      if (now < f.t0 || !this.onScreen(f.x, f.y)) continue;
      const t = (now - f.t0) / f.dur;
      const fr = Math.min(FX_FRAMES[f.kind] - 1, Math.floor(t * FX_FRAMES[f.kind]));
      items.push({ k: f.x + f.y + 400, s: fxSprite(f.kind, fr), x: this.sx(f.x, f.y), y: this.sy(f.x, f.y) - f.z - (f.rise ?? 0) * t - this.hillAt(f.x, f.y) });
    }

    // lerakási szellem
    if (ui.ghost && ui.ghost.tiles.length) {
      const d = ui.ghost, p = w.players[me];
      const bd = UNITSAFE(d.id);
      const first = d.tiles[0];
      if (bd && d.tiles.length === 1) {
        const bw = d.rot ? bd.h : bd.w, bh = d.rot ? bd.w : bd.h;
        const x = (first.x + bw / 2) * FP, y = (first.y + bh / 2) * FP;
        items.push({ k: x + y, s: buildingSprite(d.id, { faction: p.faction as FactionIdx, team: p.color as Team, season: sea, stage: 3, rot: d.rot as 0 | 1, mask: 0 }), x: this.sx(x, y), y: this.sy(x, y), a: first.ok ? 0.7 : 0.4 });
      } else if (bd) for (const t of d.tiles) {
        const x = (t.x + 0.5) * FP, y = (t.y + 0.5) * FP;
        items.push({ k: x + y, s: buildingSprite(d.id, { faction: p.faction as FactionIdx, team: p.color as Team, season: sea, stage: 3, rot: 0, mask: 0 }), x: this.sx(x, y), y: this.sy(x, y), a: t.ok ? 0.7 : 0.35 });
      }
    }

    // mélység szerinti rendezés és rajzolás
    items.sort((p, q) => p.k - q.k);
    for (const it of items) {
      const s = it.s;
      if (it.a !== undefined && it.a < 1) g.globalAlpha = Math.max(0, it.a);
      if (it.flip) { g.save(); g.translate(Math.round(it.x), Math.round(it.y)); g.scale(1, -0.55); g.drawImage(s.c, -s.ax, -s.ay); g.restore(); }
      else g.drawImage(s.c, Math.round(it.x - s.ax), Math.round(it.y - s.ay));
      if (it.a !== undefined) g.globalAlpha = 1;
    }

    // nyomjelzők
    this.tracers = this.tracers.filter(t => now - t.t0 < 90);
    if (this.tracers.length) {
      g.strokeStyle = 'rgba(255,240,200,.55)'; g.lineWidth = 1; g.beginPath();
      for (const t of this.tracers) {
        const k = (now - t.t0) / 90;
        const ax = t.x0 + (t.x1 - t.x0) * k * 0.7, ay = t.y0 + (t.y1 - t.y0) * k * 0.7, bx = t.x0 + (t.x1 - t.x0) * (k * 0.7 + 0.3), by = t.y0 + (t.y1 - t.y0) * (k * 0.7 + 0.3);
        g.moveTo(this.sx(ax, ay), this.sy(ax, ay) - 16); g.lineTo(this.sx(bx, by), this.sy(bx, by) - 14);
      }
      g.stroke();
    }

    // köd
    this.drawFog(vis);
    // fej fölötti jelzések
    this.drawOverlays(ui, now);
    // időjárás
    this.drawWeather(sea, now);
    // kijelölő téglalap
    if (ui.box) {
      const b = ui.box;
      g.strokeStyle = '#e8e2c8'; g.lineWidth = 1; g.strokeRect(Math.min(b.x0, b.x1) + 0.5, Math.min(b.y0, b.y1) + 0.5, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
      g.fillStyle = 'rgba(232,226,200,.08)'; g.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    }
    this.camX = camX0; this.camY = camY0;
  }

  private diamond(g: CanvasRenderingContext2D, x0: number, y0: number, bw: number, bh: number): void {
    const ax = this.sx(x0 * FP, y0 * FP), ay = this.sy(x0 * FP, y0 * FP);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + bw * 32, ay + bw * 16); g.lineTo(ax + (bw - bh) * 32, ay + (bw + bh) * 16); g.lineTo(ax - bh * 32, ay + bh * 16); g.closePath();
  }

  private drawGroundMarks(ui: UiState, now: number): void {
    const g = this.ctx, w = this.w, me = this.me;
    g.lineWidth = 1;
    for (const uid of ui.sel) {
      const u = w.umap.get(uid);
      if (!u || u.dead || u.inB) continue;
      const a = u as any; if (a.spx === undefined) continue;
      const r = u.def.osztaly === 'lovas' ? 15 : u.def.osztaly === 'ostrom' || u.def.osztaly === 'hajo' ? 22 : 10;
      g.strokeStyle = u.owner === me ? '#e9f2c0' : '#ff7a5c';
      g.beginPath(); g.ellipse(a.spx, a.spy, r, r / 2, 0, 0, Math.PI * 2); g.stroke();
    }
    const sb = w.bmap.get(ui.selB);
    if (sb && !sb.dead) {
      g.strokeStyle = sb.owner === me ? '#e9f2c0' : '#ff7a5c';
      this.diamond(g, sb.x, sb.y, sb.w, sb.h); g.stroke();
      if (sb.owner === me && sb.rallyX >= 0 && sb.built && (sb.def.id === 'var' || sb.def.id === 'kaszarnya' || sb.def.id === 'istallo' || sb.def.id === 'agyuonto' || sb.def.id === 'satortabor' || sb.def.id === 'toborzo')) {
        const f = flagSprite(w.players[me].color as Team, Math.floor(now / 160) % 4);
        g.drawImage(f.c, Math.round(this.sx(sb.rallyX, sb.rallyY) - f.ax), Math.round(this.sy(sb.rallyX, sb.rallyY) - f.ay - this.hillAt(sb.rallyX, sb.rallyY)));
      }
      const at = sb.def.tamadas;
      if (at && sb.owner === me) { // hatótáv
        g.strokeStyle = 'rgba(233,242,192,.35)'; g.setLineDash([4, 4]);
        const r = (at.tav + sb.w / 2) * 32 * Math.SQRT2;
        g.beginPath(); g.ellipse(this.sx((sb.x + sb.w / 2) * FP, (sb.y + sb.h / 2) * FP), this.sy((sb.x + sb.w / 2) * FP, (sb.y + sb.h / 2) * FP), r, r / 2, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      }
    }
    if (ui.ghost) for (const t of ui.ghost.tiles) {
      const bd = UNITSAFE(ui.ghost.id); if (!bd) continue;
      const single = ui.ghost.tiles.length === 1;
      const bw = single ? (ui.ghost.rot ? bd.h : bd.w) : 1, bh = single ? (ui.ghost.rot ? bd.w : bd.h) : 1;
      g.fillStyle = t.ok ? 'rgba(120,220,110,.35)' : 'rgba(230,70,50,.4)'; g.strokeStyle = t.ok ? '#b9f29a' : '#ff8a70';
      this.diamond(g, t.x, t.y, bw, bh); g.fill(); g.stroke();
    }
    ui.markers = ui.markers.filter(m => now - m.t0 < 500);
    for (const m of ui.markers) {
      const k = (now - m.t0) / 500, r = 14 * (1 - k) + 3;
      g.strokeStyle = m.col; g.globalAlpha = 1 - k * 0.5;
      g.beginPath(); g.ellipse(this.sx(m.x, m.y), this.sy(m.x, m.y) - this.hillAt(m.x, m.y), r, r / 2, 0, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
    }
  }

  private drawFog(vis: Uint8Array): void {
    const w = this.w, g = this.ctx;
    if (w.tick - this.fogTick >= 5 || this.fogTick > w.tick) {
      this.fogTick = w.tick;
      const d = this.fogImg.data;
      const FW = w.W + 16;
      for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) { const v = vis[y * w.W + x]; d[((y + 8) * FW + x + 8) * 4 + 3] = v === 2 ? 0 : v === 1 ? 120 : 255; }
      this.fogC.getContext('2d')!.putImageData(this.fogImg, 0, 0);
    }
    g.save();
    g.imageSmoothingEnabled = true;
    // a ködtérkép képpontja = egy csempe; fél csempével eltolva a lágy szélekhez
    g.setTransform(32, 16, -32, 16, -this.camX + (this.cw >> 1), -this.camY + (this.ch >> 1) - 6);
    g.drawImage(this.fogC, -8, -8);
    g.restore();
    g.imageSmoothingEnabled = false;
  }

  private bar(x: number, y: number, wd: number, frac: number, col: string): void {
    const g = this.ctx;
    g.fillStyle = '#15110c'; g.fillRect(Math.round(x - wd / 2) - 1, Math.round(y) - 1, wd + 2, 5);
    g.fillStyle = col; g.fillRect(Math.round(x - wd / 2), Math.round(y), Math.max(0, Math.round(wd * frac)), 3);
  }
  private drawOverlays(ui: UiState, now: number): void {
    const g = this.ctx, w = this.w, me = this.me;
    for (const u of w.units) {
      if (u.dead || u.inB) continue;
      const a = u as any; if (a.spx === undefined || !this.onScreen(u.x, u.y)) continue;
      const sel = ui.sel.has(u.uid) || ui.hoverU === u.uid;
      const hurt = u.hp < u.def.hp * HPU;
      if (u.owner !== me && !canSeeUnit(w, me, u)) continue;
      const top = a.spy - (u.def.osztaly === 'lovas' ? 46 : u.def.osztaly === 'ostrom' ? 40 : 34);
      if (sel || (hurt && w.tick - u.lastHit < 100)) {
        const f = u.hp / (u.def.hp * HPU);
        this.bar(a.spx, top, 20, f, f > 0.6 ? '#6fc14a' : f > 0.3 ? '#e0b030' : '#d8452e');
      }
      if (u.owner === me) {
        if (u.unpaid || u.pay === 1) { g.fillStyle = u.unpaid ? (Math.floor(now / 300) % 2 ? '#ff5a3c' : '#ffd24a') : '#b5573a'; g.fillRect(Math.round(a.spx) - 2, Math.round(top) - 7, 5, 5); g.fillStyle = '#1a120c'; g.fillRect(Math.round(a.spx), Math.round(top) - 6, 1, 3); }
        if (u.rout > 0) { g.fillStyle = '#f2f2f2'; g.fillRect(Math.round(a.spx) + 5, Math.round(top) - 8, 6, 4); g.fillStyle = '#4b3a2a'; g.fillRect(Math.round(a.spx) + 4, Math.round(top) - 8, 1, 9); }
      }
      if (u.lazado > 0) { g.fillStyle = '#ff3b2a'; g.fillRect(Math.round(a.spx) - 1, Math.round(top) - 9, 3, 6); g.fillRect(Math.round(a.spx) - 1, Math.round(top) - 2, 3, 2); }
    }
    for (const b of w.buildings) {
      if (b.dead) continue;
      const x = (b.x + b.w / 2) * FP, y = (b.y + b.h / 2) * FP;
      if (!this.onScreen(x, y)) continue;
      if (w.players[me].vis[b.y * w.W + b.x] === 0) continue;
      const px = this.sx(x, y), py = this.sy(x, y);
      const sel = ui.selB === b.id || ui.hoverB === b.id;
      const top = py - 24 - (b.w + b.h) * 12;
      if (!b.built && b.owner === me) this.bar(px, top, 30, b.prog / ((b.def.epites || 1) * 1000), '#d9c36a');
      else if (sel || (b.hp < b.def.hp * HPU && w.tick - b.lastHit < 120)) { const f = b.hp / (b.def.hp * HPU); this.bar(px, top, 34, f, f > 0.6 ? '#6fc14a' : f > 0.3 ? '#e0b030' : '#d8452e'); }
      if (b.owner === me && b.queue.length && b.built) {
        const q = b.queue[0];
        const need = q.k === 'u' ? UNITS[q.id].kepzes * TICKS : 0;
        if (need) this.bar(px, top + 6, 30, b.qprog / need, '#8fb8e8');
      }
      if (b.gar.length && b.owner === me) { g.font = '9px monospace'; g.fillStyle = '#15110c'; g.fillRect(px - 8, top - 12, 16, 10); g.fillStyle = '#f0e6c8'; g.textAlign = 'center'; g.fillText(String(b.gar.length), px, top - 4); }
      if (b.mineBy && w.tick - b.mineBy < 5 && b.owner === me) { // aknát csak hadmérnök közelében látni
        let seen = false;
        for (const u of w.units) if (!u.dead && u.owner === me && u.def.id === 'hadmernok' && Math.hypot(u.x - x, u.y - y) < 4.5 * FP) { seen = true; break; }
        if (seen && Math.floor(now / 250) % 2) { g.fillStyle = '#ff5a3c'; g.fillRect(px - 3, top - 22, 6, 6); g.fillStyle = '#ffd24a'; g.fillRect(px - 1, top - 26, 2, 4); }
      }
    }
    // falvak hódoltatási folyamata
    for (const v of w.villages) {
      const c = v.cap[me];
      if (c > 0) this.bar(this.sx(v.x * FP + 500, v.y * FP + 500), this.sy(v.x * FP + 500, v.y * FP + 500) - 70, 40, c / 20, TEAM[w.players[me].color].css);
    }
  }

  private drawWeather(sea: Season, now: number): void {
    const g = this.ctx;
    if (sea === 0) {
      g.strokeStyle = 'rgba(190,210,235,.28)'; g.lineWidth = 1; g.beginPath();
      const n = Math.floor(this.cw * this.ch / 9000);
      for (let i = 0; i < n; i++) {
        const sp = 0.5 + hash2(i, 3) * 0.4;
        const x = (hash2(i, 1) * (this.cw + 200) - (now * sp * 0.12) % (this.cw + 200) + this.cw + 200) % (this.cw + 200) - 100;
        const y = (hash2(i, 2) * this.ch + now * sp * 0.6) % this.ch;
        g.moveTo(x, y); g.lineTo(x - 3, y + 9);
      }
      g.stroke();
      g.fillStyle = 'rgba(40,60,90,.08)'; g.fillRect(0, 0, this.cw, this.ch);
    } else if (sea === 3) {
      g.fillStyle = 'rgba(255,255,255,.8)';
      const n = Math.floor(this.cw * this.ch / 7000);
      for (let i = 0; i < n; i++) {
        const sp = 0.3 + hash2(i, 3) * 0.5;
        const x = (hash2(i, 1) * this.cw + Math.sin(now / 900 + i) * 14 + now * 0.01) % this.cw;
        const y = (hash2(i, 2) * this.ch + now * sp * 0.06) % this.ch;
        g.fillRect(x | 0, y | 0, hash2(i, 4) > 0.7 ? 2 : 1, 1);
      }
    } else if (sea === 2) { g.fillStyle = 'rgba(120,70,20,.05)'; g.fillRect(0, 0, this.cw, this.ch); }
  }

  // ---- kistérkép ----
  drawMinimap(mc: HTMLCanvasElement, ui: UiState, now: number): void {
    const w = this.w, me = this.me, g = mc.getContext('2d')!;
    const W = w.W, mw = mc.width, mh = mc.height, sc = mw / (2 * W);
    if (now - this.mmAt > 700) {
      this.mmAt = now;
      const sea = season(w);
      const img = new ImageData(W, w.H), d = img.data, vis = w.players[me].vis;
      const pal: number[][] = [
        sea === 3 ? [214, 222, 228] : sea === 2 ? [150, 138, 72] : sea === 1 ? [98, 140, 60] : [104, 156, 70], // rét
        [176, 150, 104], [150, 120, 70],
        sea === 3 ? [110, 122, 120] : sea === 2 ? [120, 84, 36] : [42, 86, 40], // erdő
        sea === 3 ? [186, 190, 196] : [122, 128, 84], [84, 110, 96], [58, 104, 160], [112, 160, 190], [222, 238, 246], [128, 128, 132]];
      for (let i = 0; i < vis.length; i++) {
        const v = vis[i], c = pal[w.cur[i]];
        const k = v === 2 ? 1 : v === 1 ? 0.55 : 0;
        d[i * 4] = c[0] * k; d[i * 4 + 1] = c[1] * k; d[i * 4 + 2] = c[2] * k; d[i * 4 + 3] = 255;
      }
      this.mmBase.getContext('2d')!.putImageData(img, 0, 0);
    }
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, mw, mh);
    g.save(); g.imageSmoothingEnabled = false;
    g.setTransform(sc, sc / 2, -sc, sc / 2, mw / 2, 0);
    g.drawImage(this.mmBase, 0, 0);
    const vis = w.players[me].vis;
    for (const v of w.villages) if (vis[v.y * W + v.x]) { g.fillStyle = '#fff'; g.fillRect(v.x - 2, v.y - 2, 5, 5); g.fillStyle = v.owner >= 0 ? TEAM[w.players[v.owner].color].css : '#777'; g.fillRect(v.x - 1, v.y - 1, 3, 3); }
    for (const b of w.buildings) if (!b.dead && vis[b.y * W + b.x]) { g.fillStyle = TEAM[w.players[b.owner].color].css; g.fillRect(b.x, b.y, Math.max(1.5, b.w), Math.max(1.5, b.h)); }
    for (const u of w.units) {
      if (u.dead || u.inB || !canSeeUnit(w, me, u)) continue;
      g.fillStyle = u.lazado > 0 ? '#ddd' : TEAM[w.players[u.owner].color].l.length ? `rgb(${TEAM[w.players[u.owner].color].l.join(',')})` : '#fff';
      g.fillRect(u.x / FP - 0.9, u.y / FP - 0.9, 1.8, 1.8);
    }
    // jég olvadása: villogó folyó
    const te = Math.floor((w.tick % (480 * TICKS)) / TICKS);
    if (w.ice && te >= 450 && Math.floor(now / 300) % 2) { g.globalAlpha = 0.5; g.fillStyle = '#ff5a3c'; for (let i = 0; i < vis.length; i += 3) if (w.cur[i] === T.JEG) g.fillRect(i % W, Math.floor(i / W), 2, 2); g.globalAlpha = 1; }
    g.restore();
    // nézetablak
    const c = this.camWorld(), hw = this.cw / 2, hh = this.ch / 2;
    const mx = mw / 2 + (c.x - c.y) / FP * sc, my = (c.x + c.y) / FP * sc / 2;
    g.strokeStyle = '#f4efd8'; g.lineWidth = 1; g.strokeRect(Math.round(mx - hw * sc / 32) + 0.5, Math.round(my - hh * sc / 32) + 0.5, Math.round(this.cw * sc / 32), Math.round(this.ch * sc / 32));
    ui.pings = ui.pings.filter(p => now - p.t0 < 6000);
    for (const p of ui.pings) {
      const k = ((now - p.t0) % 1000) / 1000;
      const px = mw / 2 + (p.x - p.y) / FP * sc, py = (p.x + p.y) / FP * sc / 2;
      g.strokeStyle = `rgba(255,90,60,${1 - k})`; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 3 + k * 12, 0, Math.PI * 2); g.stroke();
    }
  }
  minimapToWorld(mc: HTMLCanvasElement, px: number, py: number): { x: number; y: number } {
    const sc = mc.width / (2 * this.w.W);
    const a = (px - mc.width / 2) / sc, b = py * 2 / sc;
    return { x: (a + b) / 2 * FP, y: (b - a) / 2 * FP };
  }

  /** Egység vagy épület a vászon adott pontján (kattintás). */
  pick(px: number, py: number): { u?: Unit; b?: Building } {
    const w = this.w, me = this.me;
    let best: Unit | undefined, bd = 1e9;
    for (const u of w.units) {
      if (u.dead || u.inB) continue;
      const a = u as any; if (a.spx === undefined) continue;
      if (!canSeeUnit(w, me, u)) continue;
      const hh = u.def.osztaly === 'lovas' ? 40 : 30, hw = u.def.osztaly === 'munkas' || u.def.osztaly === 'gyalog' || u.def.osztaly === 'lovesz' ? 9 : 16;
      if (px < a.spx - hw || px > a.spx + hw || py < a.spy - hh || py > a.spy + 6) continue;
      const d = Math.abs(px - a.spx) + Math.abs(py - (a.spy - hh / 2)) * 0.5;
      if (d < bd) { bd = d; best = u; }
    }
    if (best) return { u: best };
    const p = this.toWorld(px, py);
    const tx = Math.floor(p.x / FP), ty = Math.floor(p.y / FP);
    // magas épület: a sprite alsó részére kattintva is találjon
    for (const [dx, dy] of [[0, 0], [1, 1], [2, 2], [1, 0], [0, 1]]) {
      const x = tx + dx, y = ty + dy;
      if (x < 0 || y < 0 || x >= w.W || y >= w.H) continue;
      const o = w.occ[y * w.W + x];
      if (o > 0) { const b = w.bmap.get(o); if (b && !b.dead && (dx === 0 || !b.def.jarhato && !b.def.fal) && w.players[me].vis[y * w.W + x] > 0) return { b }; }
    }
    return {};
  }
  unitsInBox(x0: number, y0: number, x1: number, y1: number): Unit[] {
    const out: Unit[] = [];
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
    for (const u of this.w.units) {
      if (u.dead || u.inB || u.owner !== this.me || u.lazado > 0) continue;
      const a = u as any; if (a.spx === undefined) continue;
      if (a.spx >= ax && a.spx <= bx && a.spy - 10 >= ay && a.spy - 10 <= by) out.push(u);
    }
    return out;
  }
}

import { BUILDINGS } from '../sim/data';
function UNITSAFE(id: string) { return BUILDINGS[id]; }
void canPlace;

/** Nézési irány (csempetérben) → 8 képernyőirány: 0 fel, óramutató szerint. */
export function dirOf(fx: number, fy: number): number {
  const sxv = fx - fy, syv = (fx + fy) / 2;
  const ang = Math.atan2(sxv, -syv);
  return ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
}
