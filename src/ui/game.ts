// Játékmenet a böngészőben: fix lépésű szimuláció, bevitel (15. fejezet), HUD (1a wireframe + 1d krónika).
import { T, TICKS, UNITS, BUILDINGS, TECHS, RANKS, RANK_NAME, FACTION_NAME, SEASON_NAME, YEAR, PAYDAY, CSASZARI,
  unitsTrainedAt, techsAt, buildingsOf, buildingCost, buildingRank, type Res, type UnitDef, type BuildingDef } from '../sim/data';
import { FP, HPU, RU, ALAKZAT, ALLAS, type World, type Unit, type Building, type Cmd, type Order } from '../sim/types';
import { createWorld, canPlace, wageDemand, expectedIncome, hasBuilding, szpahiLimit, tEv, yearOf, season, isMilitary, castleOf, type GameSetup } from '../sim/world';
import { tick } from '../sim/sim';
import { sellPrice, buyPrice, recruitCost } from '../sim/cmds';
import { effMoral } from '../sim/combat';
import { Renderer, type UiState } from '../render/renderer';
import { icon, crest, cursor, type CursorKind } from '../art/ui';
import { buildingSprite } from '../art/buildings';
import { TEAM } from '../art/pal';
import type { FactionIdx, Team } from '../art/api';
import { sfx, audio, setVolume } from './audio';

interface Btn { ic: string; key?: string; kl?: string; tip: string; on: () => void; dis?: boolean; act?: boolean; cnt?: number }
type Mode = null | { k: 'target'; what: 'amove' | 'patrol' | 'garrison' | 'burn' | 'repair' } | { k: 'place'; id: string; rot: number; sx: number; sy: number; drag: boolean };

const urlCache = new Map<string, string>();
export function iconURL(id: string, faction = 0, team = 0): string {
  const key = id + ':' + faction + ':' + team;
  let u = urlCache.get(key);
  if (u) return u;
  let c: HTMLCanvasElement;
  if (id.startsWith('b_')) {
    c = icon('cmd_ures', 44);
    const g = c.getContext('2d')!; g.imageSmoothingEnabled = true;
    g.clearRect(0, 0, 44, 44); g.fillStyle = '#3a342c'; g.fillRect(0, 0, 44, 44); g.fillStyle = '#4b443a'; g.fillRect(2, 2, 40, 40);
    const s = buildingSprite(id.slice(2), { faction: faction as FactionIdx, team: team as Team, season: 1, stage: 3, mask: id === 'b_palank' || id === 'b_kofal' ? 10 : 0, farm: 1 });
    const sc = Math.min(40 / s.c.width, 40 / s.c.height);
    g.drawImage(s.c, 22 - s.c.width * sc / 2, 22 - s.c.height * sc / 2, s.c.width * sc, s.c.height * sc);
    g.strokeStyle = '#1c1812'; g.lineWidth = 2; g.strokeRect(1, 1, 42, 42);
  } else c = icon(id, 44);
  u = c.toDataURL(); urlCache.set(key, u);
  return u;
}
const RES_IC = ['res_e', 'res_f', 'res_k', 'res_z'];
const fmt = (n: number) => String(Math.floor(n));
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const TYPE_NAME = ['vágó', 'szúró', 'lövő', 'zúzó'];
const GRID_KEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyZ', 'KeyX', 'KeyC', 'KeyV'];
const GRID_LBL = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Y', 'X', 'C', 'V'];

export interface GameOpts { setup: GameSetup; me: number; onExit: () => void; demo?: boolean; title?: string; intro?: string }

export class Game {
  w: World; r: Renderer; me: number;
  ui: UiState = { sel: new Set(), selB: 0, hoverU: 0, hoverB: 0, box: null, ghost: null, markers: [], pings: [] };
  root: HTMLElement; cv: HTMLCanvasElement; mm!: HTMLCanvasElement;
  private raf = 0; private last = 0; private acc = 0; speed = 1; paused = false; private dead = false;
  private mode: Mode = null; private page = ''; private groups: number[][] = [];
  private keys = new Set<string>(); private mx = 0; private my = 0; private inside = false;
  private down: { x: number; y: number; t: number } | null = null; private mid: { x: number; y: number } | null = null;
  private lastClick = { t: 0, uid: 0 }; private lastAlert: { x: number; y: number } | null = null;
  private hudAt = 0; private btnSig = ''; private btns: Btn[] = []; private selSig = '';
  private chron: { msg: string; t: number; alert: boolean; x: number; y: number }[] = [];
  private banner = { msg: '', t: 0 }; private ended = false; private lastGroupKey = { k: -1, t: 0 };
  private $: Record<string, HTMLElement> = {};
  private offs: (() => void)[] = [];

  constructor(root: HTMLElement, private opts: GameOpts) {
    this.root = root; this.me = opts.me;
    this.w = createWorld(opts.setup);
    const p = this.w.players[this.me];
    root.innerHTML = opts.demo ? '<canvas class="view"></canvas>' : `
      <canvas class="view"></canvas>
      <div class="top f${p.faction}">
        <div class="res" data-tip="Élelem: minden népességpont fogyasztja; ha elfogy, éhínség tör ki."><i style="background-image:url(${iconURL('res_e')})"></i><b id="h-e"></b></div>
        <div class="res" data-tip="Fa: épületekhez és katonákhoz."><i style="background-image:url(${iconURL('res_f')})"></i><b id="h-f"></b></div>
        <div class="res" data-tip="Kő: tornyokhoz, kőfalhoz, rangemeléshez."><i style="background-image:url(${iconURL('res_k')})"></i><b id="h-k"></b></div>
        <div class="res zs" data-tip="Zsold: ősszel, a fizetőnapon minden katona zsoldot kér. Forrása: faluadó, jobbágyadó, vásártér, zsákmány."><i style="background-image:url(${iconURL('res_z')})"></i><b id="h-z"></b></div>
        <div class="res" data-tip="Népesség / férőhely. Házzal bővíthető."><i style="background-image:url(${iconURL('res_nep')})"></i><b id="h-n"></b></div>
        <div class="wage" id="h-wage" data-tip="Őszi zsoldigény és a fizetőnapig várható készlet (jelenlegi zsold + faluadó + jobbágyadó)."></div>
        <div class="sp"></div>
        <div class="year" id="h-year"></div>
        <div class="seasons" id="h-seasons">${SEASON_NAME.map((s, i) => `<span data-s="${i}">${s}</span>`).join('')}</div>
        <button class="tb" id="h-idle" data-tip="Tétlen jobbágyok – kattints a következőre (pont billentyű)."></button>
        <button class="tb" id="h-speed" data-tip="Játéksebesség (+ / −)"></button>
        <button class="tb" id="h-menu">Menü</button>
      </div>
      <div class="hod" id="h-hod"></div>
      <div class="banner" id="h-banner"></div>
      <div class="chron" id="h-chron"></div>
      <div class="late" id="h-late"></div>
      <div class="tip" id="h-tip"></div>
      <div class="bottom f${p.faction}">
        <div class="cmds" id="h-cmds"></div>
        <div class="info" id="h-info"></div>
        <div class="mmw"><canvas id="h-mm" width="256" height="128"></canvas><img class="crest" src="${crest(p.faction as FactionIdx, 40).toDataURL()}" alt=""></div>
      </div>
      <div class="overlay" id="h-ov"></div>`;
    this.cv = root.querySelector('canvas.view')!;
    this.r = new Renderer(this.cv, this.w, this.me);
    this.r.setZoom(window.innerHeight >= 1000 ? 2 : 1);
    if (!opts.demo) {
      for (const el of root.querySelectorAll<HTMLElement>('[id^="h-"]')) this.$[el.id.slice(2)] = el;
      this.mm = this.$.mm as HTMLCanvasElement;
      this.bind();
      if (opts.intro) this.showOverlay(`<h2>${opts.title ?? ''}</h2><p>${opts.intro}</p><button data-act="resume">Kezdődjék</button>`, true);
    }
    const c = castleOf(this.w, this.me);
    if (c) this.r.centerOn((c.x + 2) * FP, (c.y + 2) * FP);
    const onResize = () => this.r.resize();
    window.addEventListener('resize', onResize); this.offs.push(() => window.removeEventListener('resize', onResize));
    this.setCursor('alap');
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy(): void { this.dead = true; cancelAnimationFrame(this.raf); for (const f of this.offs) f(); this.root.innerHTML = ''; }

  // ---------- fő ciklus ----------
  private loop = (now: number): void => {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(250, now - this.last); this.last = now;
    const w = this.w;
    if (!this.paused && !w.over) {
      this.acc += dt * this.speed;
      let n = 0;
      while (this.acc >= 50 && n++ < 8) {
        this.acc -= 50;
        for (const u of w.units) { (u as any).px = u.x; (u as any).py = u.y; }
        tick(w);
        if (this.opts.demo) w.players[this.me].vis.fill(2);
        this.drain(now);
      }
      if (this.acc > 400) this.acc = 0;
    }
    this.scroll(dt);
    this.updateGhost();
    this.r.draw(this.paused ? 1 : Math.min(1, this.acc / 50), this.ui, now);
    if (this.opts.demo) return;
    this.r.drawMinimap(this.mm, this.ui, now);
    if (now - this.hudAt > 180) { this.hudAt = now; this.hud(now); }
    if (w.over && !this.ended) this.finish();
  };

  private drain(now: number): void {
    const w = this.w, me = this.me;
    for (const e of w.ev) {
      this.r.onEvent(e, now);
      if (this.opts.demo) continue;
      const vol = (x: number, y: number) => this.r.onScreen(x, y) ? 1 : 0;
      switch (e.t) {
        case 'shot': { const v = vol(e.x, e.y); if (v) sfx(e.big ? 'agyu' : 'loves', v); break; }
        case 'melee': if (vol(e.x, e.y)) sfx('kard', 0.8); break;
        case 'boom': if (vol(e.x, e.y)) sfx(e.water ? 'csobbanas' : 'robbanas'); break;
        case 'bdie': if (vol(e.x * FP, e.y * FP)) sfx('omlas'); break;
        case 'tree': if (vol(e.x * FP, e.y * FP)) sfx('fa', 0.6); break;
        case 'season': sfx('evszak'); break;
        case 'chron': if (e.p === me) this.log(e.msg, false, -1, -1); break;
        case 'done': if (e.p === me) { sfx('kesz', 0.7); } break;
        case 'alert':
          if (e.p !== me) break;
          this.log(e.msg, true, e.x, e.y);
          this.banner = { msg: e.msg, t: now };
          if (e.x >= 0) { this.lastAlert = { x: e.x, y: e.y }; this.ui.pings.push({ x: e.x, y: e.y, t0: now }); }
          sfx(e.kind === 'zsold' ? 'harang' : 'riado');
          break;
      }
    }
    w.ev.length = 0;
  }
  private log(msg: string, alert: boolean, x: number, y: number): void {
    this.chron.push({ msg, t: performance.now(), alert, x, y });
    if (this.chron.length > 40) this.chron.shift();
  }

  // ---------- kamera ----------
  private scroll(dt: number): void {
    if (this.opts.demo) { // lassú úsztatás a vár körül
      const c = castleOf(this.w, this.me);
      if (c) { const t = performance.now() / 9000; this.r.centerOn((c.x + 2 + Math.cos(t) * 5) * FP, (c.y + 2 + Math.sin(t * 0.7) * 5) * FP); }
      return;
    }
    let dx = 0, dy = 0;
    const k = this.keys;
    if (k.has('ArrowLeft')) dx -= 1; if (k.has('ArrowRight')) dx += 1; if (k.has('ArrowUp')) dy -= 1; if (k.has('ArrowDown')) dy += 1;
    if (this.inside && !this.mid && document.hasFocus()) {
      const W = window.innerWidth, H = window.innerHeight, e = 6;
      if (this.mxc <= e) dx -= 1; if (this.mxc >= W - e) dx += 1; if (this.myc <= e) dy -= 1; if (this.myc >= H - e) dy += 1;
    }
    if (dx || dy) { const s = dt * 0.9 / Math.sqrt(this.r.zoom); this.r.camX += dx * s; this.r.camY += dy * s; this.r.clampCam(); }
  }
  private mxc = 0; private myc = 0;

  // ---------- kijelölés ----------
  selUnits(): Unit[] {
    const out: Unit[] = [];
    for (const id of this.ui.sel) { const u = this.w.umap.get(id); if (u && !u.dead && !u.inB) out.push(u); else this.ui.sel.delete(id); }
    return out;
  }
  private ownSel(): Unit[] { return this.selUnits().filter(u => u.owner === this.me && u.lazado === 0); }
  private select(us: Unit[], add = false): void {
    if (!add) this.ui.sel.clear();
    for (const u of us.slice(0, 40)) this.ui.sel.add(u.uid);
    this.ui.selB = 0; this.page = ''; this.mode = null; this.btnSig = '';
  }
  private cmd(c: Cmd): void { this.w.cmds.push(c); }
  private order(us: Unit[], o: Order, q: boolean): void {
    if (!us.length) return;
    this.cmd({ c: 'order', p: this.me, uids: us.map(u => u.uid), o, q });
    sfx('parancs');
  }

  // ---------- egér ----------
  private pos(e: MouseEvent): { x: number; y: number } {
    const r = this.cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.r.zoom, y: (e.clientY - r.top) / this.r.zoom };
  }
  private bind(): void {
    const cv = this.cv, on = <K extends keyof WindowEventMap>(t: EventTarget, ev: K, f: (e: WindowEventMap[K]) => void, o?: AddEventListenerOptions) => {
      t.addEventListener(ev, f as EventListener, o); this.offs.push(() => t.removeEventListener(ev, f as EventListener, o));
    };
    on(cv, 'contextmenu', e => e.preventDefault());
    on(cv, 'mousedown', e => {
      const p = this.pos(e);
      if (e.button === 1) { this.mid = { x: e.clientX, y: e.clientY }; e.preventDefault(); return; }
      if (e.button === 2) { if (this.mode) { this.mode = null; this.ui.ghost = null; this.btnSig = ''; } else this.rightClick(p.x, p.y, e.shiftKey); return; }
      if (this.mode?.k === 'place') { const t = this.tileAt(p.x, p.y); this.mode.sx = t.x; this.mode.sy = t.y; this.mode.drag = true; return; }
      if (this.mode?.k === 'target') { this.targetClick(p.x, p.y, e.shiftKey); return; }
      this.down = { x: p.x, y: p.y, t: performance.now() };
    });
    on(window, 'mousemove', e => {
      this.mxc = e.clientX; this.myc = e.clientY; this.inside = true;
      const p = this.pos(e); this.mx = p.x; this.my = p.y;
      if (this.mid) { this.r.camX -= (e.clientX - this.mid.x) / this.r.zoom; this.r.camY -= (e.clientY - this.mid.y) / this.r.zoom; this.mid = { x: e.clientX, y: e.clientY }; this.r.clampCam(); }
      if (this.down && (Math.abs(p.x - this.down.x) > 4 || Math.abs(p.y - this.down.y) > 4)) this.ui.box = { x0: this.down.x, y0: this.down.y, x1: p.x, y1: p.y };
      if (e.target === cv) this.hover(p.x, p.y);
    });
    on(document, 'mouseleave' as any, () => { this.inside = false; });
    on(window, 'mouseup', e => {
      if (e.button === 1) { this.mid = null; return; }
      if (e.button !== 0) return;
      const p = this.pos(e);
      if (this.mode?.k === 'place' && this.mode.drag) { this.placeNow(e.shiftKey); return; }
      if (!this.down) return;
      if (this.ui.box) {
        let us = this.r.unitsInBox(this.ui.box.x0, this.ui.box.y0, this.ui.box.x1, this.ui.box.y1);
        if (us.some(u => isMilitary(u.def))) us = us.filter(u => isMilitary(u.def));
        if (us.length || !e.shiftKey) this.select(us, e.shiftKey);
        this.ui.box = null;
      } else this.leftClick(p.x, p.y, e.shiftKey);
      this.down = null;
    });
    on(cv, 'wheel', e => {
      e.preventDefault();
      if (this.mode?.k === 'place') { this.mode.rot ^= 1; return; }
      const c = this.r.camWorld();
      this.r.setZoom(this.r.zoom + (e.deltaY < 0 ? 1 : -1)); this.r.centerOn(c.x, c.y);
    }, { passive: false });
    on(window, 'keydown', e => this.keyDown(e));
    on(window, 'keyup', e => this.keys.delete(e.code));
    on(window, 'blur', () => { this.keys.clear(); this.inside = false; });
    // kistérkép
    const mmGo = (e: MouseEvent) => {
      const r = this.mm.getBoundingClientRect();
      return this.r.minimapToWorld(this.mm, (e.clientX - r.left) * this.mm.width / r.width, (e.clientY - r.top) * this.mm.height / r.height);
    };
    let mmDrag = false;
    on(this.mm, 'mousedown', e => {
      const p = mmGo(e);
      if (e.button === 0) { mmDrag = true; this.r.centerOn(p.x, p.y); }
      else if (e.button === 2) { const us = this.ownSel(); if (us.length) { this.order(us, { k: 'move', x: p.x, y: p.y }, e.shiftKey); } }
    });
    on(this.mm, 'mousemove', e => { if (mmDrag) { const p = mmGo(e); this.r.centerOn(p.x, p.y); } });
    on(window, 'mouseup', () => { mmDrag = false; });
    on(this.mm, 'contextmenu', e => e.preventDefault());
    // HUD-gombok
    on(this.$.cmds, 'click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
      if (!b) return;
      const bt = this.btns[+b.dataset.i!];
      if (bt && !bt.dis) { sfx('katt'); bt.on(); this.btnSig = ''; this.hud(performance.now()); } else sfx('tilos');
    });
    on(this.$.info, 'click', e => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-q],[data-u]');
      if (!t) return;
      if (t.dataset.q !== undefined) { this.cmd({ c: 'cancel', p: this.me, b: this.ui.selB, i: +t.dataset.q }); sfx('katt'); }
      else if (t.dataset.u !== undefined) { const u = this.w.umap.get(+t.dataset.u); if (u) this.select([u]); }
    });
    on(this.root, 'mouseover', e => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
      const tip = this.$.tip;
      if (t && t.dataset.tip) { tip.innerHTML = t.dataset.tip; tip.style.display = 'block'; } else tip.style.display = 'none';
    });
    on(this.$.menu, 'click', () => this.menu());
    on(this.$.speed, 'click', () => { this.speed = this.speed >= 3 ? 1 : this.speed + 1; });
    on(this.$.idle, 'click', () => this.nextIdle());
    on(this.$.late, 'click', () => { this.cmd({ c: 'paylate', p: this.me }); sfx('katt'); });
    on(this.$.chron, 'click', e => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-x]');
      if (t) this.r.centerOn(+t.dataset.x!, +t.dataset.y!);
    });
    on(this.$.ov, 'click', e => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (a === 'resume') this.hideOverlay();
      if (a === 'exit') this.opts.onExit();
      if (a === 'snd') { audio.on = !audio.on; this.menu(); }
      if (a === 'vol') { setVolume(audio.vol >= 0.9 ? 0.2 : audio.vol + 0.2); this.menu(); }
      if (a === 'watch') { this.$.ov.style.display = 'none'; }
    });
  }

  private tileAt(px: number, py: number): { x: number; y: number } {
    const p = this.r.toWorld(px, py);
    return { x: Math.floor(p.x / FP), y: Math.floor(p.y / FP) };
  }
  private setCursor(k: CursorKind): void {
    if ((this as any)._cur === k) return; (this as any)._cur = k;
    const c = cursor(k);
    this.cv.style.cursor = `url(${c.c.toDataURL()}) ${c.hx} ${c.hy}, auto`;
  }
  private hover(px: number, py: number): void {
    const pk = this.r.pick(px, py), w = this.w, me = this.me;
    this.ui.hoverU = pk.u ? pk.u.uid : 0; this.ui.hoverB = pk.b ? pk.b.id : 0;
    const us = this.ownSel();
    let cur: CursorKind = 'alap';
    if (this.mode?.k === 'place') cur = 'epit';
    else if (this.mode?.k === 'target') cur = this.mode.what === 'garrison' ? 'beszall' : this.mode.what === 'repair' ? 'epit' : 'tamad';
    else if (us.length) {
      const enemyU = pk.u && (pk.u.lazado > 0 || w.players[pk.u.owner].team !== w.players[me].team);
      const enemyB = pk.b && w.players[pk.b.owner].team !== w.players[me].team;
      const worker = us.some(u => u.def.id === 'jobbagy');
      if (enemyU || enemyB) cur = 'tamad';
      else if (pk.b && pk.b.owner === me) cur = !pk.b.built || pk.b.hp < pk.b.def.hp * HPU ? (us.some(u => u.def.osztaly === 'munkas') ? 'epit' : 'megy') : pk.b.def.id === 'szanto' && worker ? 'gyujt' : pk.b.def.helyorseg ? 'beszall' : 'megy';
      else if (worker) {
        const t = this.tileAt(px, py);
        if (t.x >= 0 && t.y >= 0 && t.x < w.W && t.y < w.H) { const c = w.cur[t.y * w.W + t.x]; if (c === T.ERDO || c === T.KO || w.base[t.y * w.W + t.x] === T.FOLYO) cur = 'gyujt'; else cur = 'megy'; }
      } else cur = 'megy';
    }
    this.setCursor(cur);
  }

  private leftClick(px: number, py: number, shift: boolean): void {
    const pk = this.r.pick(px, py), now = performance.now();
    if (pk.u) {
      const u = pk.u;
      if (u.owner === this.me && now - this.lastClick.t < 350 && this.lastClick.uid === u.uid) {
        this.select(this.w.units.filter(o => !o.dead && !o.inB && o.owner === this.me && o.def === u.def && this.r.onScreen(o.x, o.y)), shift);
      } else if (shift && u.owner === this.me) { if (this.ui.sel.has(u.uid)) this.ui.sel.delete(u.uid); else this.ui.sel.add(u.uid); this.ui.selB = 0; this.btnSig = ''; }
      else this.select([u]);
      this.lastClick = { t: now, uid: u.uid };
      sfx('katt', 0.6);
    } else if (pk.b) { this.ui.sel.clear(); this.ui.selB = pk.b.id; this.page = ''; this.btnSig = ''; sfx('katt', 0.6); }
    else if (!shift) { this.ui.sel.clear(); this.ui.selB = 0; this.page = ''; this.btnSig = ''; }
  }

  private mark(x: number, y: number, col: string): void { this.ui.markers.push({ x, y, t0: performance.now(), col }); }

  private rightClick(px: number, py: number, shift: boolean): void {
    const w = this.w, me = this.me, us = this.ownSel();
    const wp = this.r.toWorld(px, py);
    if (wp.x < 0 || wp.y < 0 || wp.x >= w.W * FP || wp.y >= w.H * FP) return;
    if (!us.length) {
      const b = w.bmap.get(this.ui.selB);
      if (b && b.owner === me) { this.cmd({ c: 'rally', p: me, b: b.id, x: Math.round(wp.x), y: Math.round(wp.y) }); this.mark(wp.x, wp.y, '#ffe58a'); sfx('parancs'); }
      return;
    }
    const pk = this.r.pick(px, py);
    const team = w.players[me].team;
    const workers = us.filter(u => u.def.id === 'jobbagy'), builders = us.filter(u => u.def.osztaly === 'munkas'), rest = us.filter(u => u.def.osztaly !== 'munkas');
    const mv = (list: Unit[]) => { this.order(list, { k: 'move', x: Math.round(wp.x), y: Math.round(wp.y) }, shift); };
    if (pk.u) {
      const t = pk.u;
      if (t.lazado > 0 || w.players[t.owner].team !== team) { this.order(us, { k: 'attack', u: t.uid }, shift); this.mark(t.x, t.y, '#ff6a4a'); }
      else mv(us);
      return;
    }
    if (pk.b) {
      const b = pk.b, cx = (b.x + b.w / 2) * FP, cy = (b.y + b.h / 2) * FP;
      if (w.players[b.owner].team !== team) {
        const raiders = us.filter(u => u.def.j.has('portya')), miners = us.filter(u => u.def.j.has('aknasz'));
        const rd = b.def.id === 'karam' && b.cattle.some(c => c >= 180 * TICKS), mn = b.def.fal || b.def.id === 'ortorony' || b.def.id === 'bastya';
        if (rd && raiders.length) this.order(raiders, { k: 'raid', b: b.id }, shift);
        if (mn && miners.length) this.order(miners, { k: 'mine', b: b.id }, shift);
        this.order(us.filter(u => !(rd && raiders.includes(u)) && !(mn && miners.includes(u))), { k: 'attack', b: b.id }, shift);
        this.mark(cx, cy, '#ff6a4a');
      } else if (b.owner === me) {
        if (!b.built && builders.length) { this.order(builders, { k: 'build', b: b.id }, shift); mv(rest); }
        else if (b.fire > 0 && builders.length) { this.order(builders, { k: 'douse', b: b.id }, shift); }
        else if (b.def.id === 'szanto' && b.built) { this.order(us.filter(u => u.def.id === 'jobbagy' || u.def.j.has('hazai')), { k: 'gather', sub: 'farm', b: b.id }, shift); }
        else if (b.built && b.hp < b.def.hp * HPU && builders.length) { this.order(builders, { k: 'repair', b: b.id }, shift); }
        else if (b.built && b.def.helyorseg > 0) this.order(us, { k: 'garrison', b: b.id }, shift);
        else mv(us);
        this.mark(cx, cy, '#b9f29a');
      } else mv(us);
      return;
    }
    if (workers.length) {
      let an = -1, bd = 1100;
      for (const a of w.animals) { if (a.food <= 0) continue; const d = Math.hypot(a.x - wp.x, a.y - wp.y - 300); if (d < bd) { bd = d; an = a.id; } }
      const tx = Math.floor(wp.x / FP), ty = Math.floor(wp.y / FP), i = ty * w.W + tx;
      let o: Order | null = null;
      if (an >= 0) o = { k: 'gather', sub: 'vad', a: an, x: tx, y: ty };
      else if (w.cur[i] === T.ERDO) o = { k: 'gather', sub: 'fa', x: tx, y: ty };
      else if (w.base[i] === T.KO) o = { k: 'gather', sub: 'ko', x: tx, y: ty };
      else if (w.base[i] === T.FOLYO || w.base[i] === T.GAZLO && w.cur[i] !== T.GAZLO) o = { k: 'gather', sub: 'hal', x: tx, y: ty };
      if (o) { this.order(workers, o, shift); mv(us.filter(u => u.def.id !== 'jobbagy')); this.mark(wp.x, wp.y, '#ffe58a'); return; }
    }
    mv(us); this.mark(wp.x, wp.y, '#b9f29a');
  }

  private targetClick(px: number, py: number, shift: boolean): void {
    const m = this.mode as { k: 'target'; what: string }, us = this.ownSel(), w = this.w;
    const wp = this.r.toWorld(px, py), pk = this.r.pick(px, py);
    if (m.what === 'amove' || m.what === 'patrol') {
      if (pk.u && m.what === 'amove' && w.players[pk.u.owner].team !== w.players[this.me].team) this.order(us, { k: 'attack', u: pk.u.uid }, shift);
      else if (pk.b && m.what === 'amove' && w.players[pk.b.owner].team !== w.players[this.me].team) this.order(us, { k: 'attack', b: pk.b.id }, shift);
      else this.order(us, { k: m.what as 'amove' | 'patrol', x: Math.round(wp.x), y: Math.round(wp.y) }, shift);
      this.mark(wp.x, wp.y, '#ff6a4a');
    } else if (m.what === 'garrison') { if (pk.b && pk.b.owner === this.me && pk.b.def.helyorseg) this.order(us, { k: 'garrison', b: pk.b.id }, shift); else sfx('tilos'); }
    else if (m.what === 'repair') { if (pk.b && pk.b.owner === this.me) this.order(us.filter(u => u.def.osztaly === 'munkas'), { k: pk.b.built ? 'repair' : 'build', b: pk.b.id }, shift); else sfx('tilos'); }
    else if (m.what === 'burn') {
      const tx = wp.x / FP, ty = wp.y / FP;
      const v = w.villages.find(v => Math.abs(v.x + 0.5 - tx) < 2.2 && Math.abs(v.y + 0.5 - ty) < 2.2);
      if (v && v.owner !== this.me && v.burnt <= w.tick) { this.order(us.filter(u => u.def.j.has('portya')), { k: 'burn', v: v.id }, shift); this.mark(wp.x, wp.y, '#ff6a4a'); } else sfx('tilos');
    }
    if (!shift) { this.mode = null; this.btnSig = ''; }
  }

  // ---------- építés ----------
  private startPlace(id: string): void { this.mode = { k: 'place', id, rot: 0, sx: 0, sy: 0, drag: false }; this.btnSig = ''; }
  private updateGhost(): void {
    const m = this.mode;
    if (!m || m.k !== 'place') { this.ui.ghost = null; return; }
    const d = BUILDINGS[m.id], w = this.w;
    const t = this.tileAt(this.mx, this.my);
    const tiles: { x: number; y: number; ok: boolean }[] = [];
    if (d.fal && !d.kapu && m.drag) {
      const dx = t.x - m.sx, dy = t.y - m.sy, n = Math.max(Math.abs(dx), Math.abs(dy));
      for (let k = 0; k <= Math.min(n, 40); k++) {
        const x = Math.abs(dx) >= Math.abs(dy) ? m.sx + Math.sign(dx) * k : m.sx, y = Math.abs(dx) >= Math.abs(dy) ? m.sy : m.sy + Math.sign(dy) * k;
        tiles.push({ x, y, ok: canPlace(w, d, this.me, x, y, 0) });
      }
    } else {
      const bw = m.rot ? d.h : d.w, bh = m.rot ? d.w : d.h;
      const x = t.x - (bw >> 1), y = t.y - (bh >> 1);
      let ok = canPlace(w, d, this.me, x, y, m.rot);
      if (!ok && d.id === 'rev' && canPlace(w, d, this.me, t.x - (d.h >> 1), t.y - (d.w >> 1), m.rot ^ 1)) { m.rot ^= 1; return this.updateGhost(); }
      tiles.push({ x, y, ok });
    }
    this.ui.ghost = { id: m.id, rot: m.rot, tiles };
  }
  private placeNow(shift: boolean): void {
    const m = this.mode as { k: 'place'; id: string; rot: number; drag: boolean };
    m.drag = false;
    this.updateGhost();
    const g = this.ui.ghost;
    if (!g) return;
    const builders = this.ownSel().filter(u => u.def.osztaly === 'munkas').map(u => u.uid);
    const okTiles = g.tiles.filter(t => t.ok);
    if (!okTiles.length) { sfx('tilos'); return; }
    okTiles.forEach((t, i) => this.cmd({ c: 'place', p: this.me, id: m.id, x: t.x, y: t.y, rot: m.rot, uids: builders, q: shift || i > 0 }));
    sfx('kesz', 0.5);
    if (!shift && !(BUILDINGS[m.id].fal && !BUILDINGS[m.id].kapu)) { this.mode = null; this.page = ''; this.btnSig = ''; }
  }

  // ---------- billentyűk ----------
  private keyDown(e: KeyboardEvent): void {
    if (this.ended && e.code !== 'Escape') return;
    const c = e.code;
    this.keys.add(c);
    if (c.startsWith('F') && c.length <= 3 && c !== 'F5' && c !== 'F11' && c !== 'F12') e.preventDefault();
    if (c === 'Space' || c.startsWith('Arrow') || c === 'Tab') e.preventDefault();
    if (c === 'Escape') {
      if (this.$.ov.style.display === 'flex' && !this.ended) { this.hideOverlay(); return; }
      if (this.mode) { this.mode = null; this.ui.ghost = null; this.btnSig = ''; return; }
      if (this.page) { this.page = ''; this.btnSig = ''; return; }
      if (this.ui.sel.size || this.ui.selB) { this.ui.sel.clear(); this.ui.selB = 0; this.btnSig = ''; return; }
      this.menu(); return;
    }
    if (this.paused) { if (c === 'Pause' || c === 'KeyP') this.hideOverlay(); return; }
    if (c === 'Pause') { this.menu(); return; }
    if (c === 'Space' && this.lastAlert) { this.r.centerOn(this.lastAlert.x, this.lastAlert.y); return; }
    if (c === 'Period') { this.nextIdle(); return; }
    if (c === 'NumpadAdd' || c === 'Equal') { this.speed = Math.min(3, this.speed + 1); return; }
    if (c === 'NumpadSubtract' || c === 'Minus') { this.speed = Math.max(1, this.speed - 1); return; }
    if (c === 'Home') { const k = castleOf(this.w, this.me); if (k) this.r.centerOn((k.x + 2) * FP, (k.y + 2) * FP); return; }
    const dg = /^(Digit|Numpad)(\d)$/.exec(c);
    if (dg) {
      const n = +dg[2];
      if (e.ctrlKey) { this.groups[n] = this.ownSel().map(u => u.uid); e.preventDefault(); }
      else if (this.groups[n]?.length) {
        const us = this.groups[n].map(id => this.w.umap.get(id)).filter((u): u is Unit => !!u && !u.dead && !u.inB);
        this.select(us, e.shiftKey);
        const now = performance.now();
        if (this.lastGroupKey.k === n && now - this.lastGroupKey.t < 400 && us.length) this.r.centerOn(us[0].x, us[0].y);
        this.lastGroupKey = { k: n, t: now };
      }
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (this.mode?.k === 'place' && c === 'KeyR') { this.mode.rot ^= 1; return; }
    for (let i = 0; i < this.btns.length; i++) {
      const b = this.btns[i];
      if (b && b.key === c) { if (b.dis) sfx('tilos'); else { sfx('katt'); b.on(); this.btnSig = ''; this.hud(performance.now()); } e.preventDefault(); return; }
    }
  }
  private nextIdle(): void {
    const idle = this.w.units.filter(u => !u.dead && !u.inB && u.owner === this.me && u.def.osztaly === 'munkas' && u.orders.length === 0);
    if (!idle.length) return;
    const cur = [...this.ui.sel][0] ?? 0;
    const u = idle.find(x => x.uid > cur) ?? idle[0];
    this.select([u]); this.r.centerOn(u.x, u.y);
  }

  // ---------- parancsgombok ----------
  private costHTML(c: Res, extra = ''): string {
    const p = this.w.players[this.me];
    let s = '';
    for (let i = 0; i < 4; i++) if (c[i] > 0) s += `<span class="c${p.res[i] < c[i] * RU ? ' no' : ''}"><i style="background-image:url(${iconURL(RES_IC[i])})"></i>${c[i]}</span>`;
    return `<div class="cost">${s}${extra}</div>`;
  }
  private unitTip(d: UnitDef, cost: Res, extra = ''): string {
    return `<b>${d.nev}</b>${this.costHTML(cost, d.zsold ? `<span class="c zs">zsold ${d.zsold}/ősz</span>` : '')}<p>${d.leiras}</p><small>ÉP ${d.hp} · tám. ${d.tam} ${TYPE_NAME[d.tipus]}${d.tav >= 2 ? ` · táv ${d.tav}` : ''} · páncél ${d.pancel.join('/')} · seb. ${d.seb} · nép ${d.nep} · ${d.kepzes} s</small>${extra}`;
  }
  private buildCmds(): Btn[] {
    const w = this.w, me = this.me, p = w.players[me], out: Btn[] = [];
    const us = this.ownSel();
    const uids = us.map(u => u.uid);
    const back = (): Btn => ({ ic: 'cmd_vissza', key: 'KeyV', kl: 'V', tip: '<b>Vissza</b>', on: () => { this.page = ''; this.mode = null; } });
    if (this.mode?.k === 'place') {
      const d = BUILDINGS[this.mode.id];
      return [{ ic: 'cmd_megse', key: 'KeyV', kl: 'V', tip: `<b>Mégse</b><p>${d.nev} lerakása: bal klikk a térképen${d.fal && !d.kapu ? ', húzással vonalban' : ''}. ${d.kapu || d.id === 'rev' ? 'R vagy görgő: forgatás. ' : ''}Shift: több egymás után.</p>`, on: () => { this.mode = null; } }];
    }
    if (us.length) {
      const anyW = us.some(u => u.def.osztaly === 'munkas'), mil = us.filter(u => isMilitary(u.def));
      if (this.page.startsWith('epit')) {
        const eco = ['haz', 'szanto', 'malom', 'fatelep', 'kobanya', 'karam', 'vasarter', 'kovacs', 'rev'];
        const all = buildingsOf(p.faction);
        const list = this.page === 'epit1' ? all.filter(d => eco.includes(d.id)).sort((a, b) => eco.indexOf(a.id) - eco.indexOf(b.id)) : all.filter(d => !eco.includes(d.id));
        list.slice(0, 10).forEach((d, i) => {
          const cost = buildingCost(d, p.faction), rk = buildingRank(d, p.faction);
          const lock = p.rank < rk;
          const no = cost.some((c, k) => p.res[k] < c * RU);
          out.push({ ic: 'b_' + d.id, key: GRID_KEYS[i], kl: GRID_LBL[i], dis: lock || no,
            tip: `<b>${d.nev}</b>${this.costHTML(cost)}<p>${d.leiras}</p><small>ÉP ${d.hp} · ${d.w}×${d.h} csempe · építés ${d.id === 'palank' && p.faction === 0 ? 3 : d.epites} s</small>${lock ? `<p class="no">Szükséges rang: ${RANK_NAME[rk]}</p>` : ''}`,
            on: () => this.startPlace(d.id) });
        });
        out[10] = { ic: this.page === 'epit1' ? 'cmd_tamad' : 'cmd_epit', key: 'KeyC', kl: 'C', tip: this.page === 'epit1' ? '<b>Hadi épületek</b>' : '<b>Gazdasági épületek</b>', on: () => { this.page = this.page === 'epit1' ? 'epit2' : 'epit1'; } };
        out[11] = back();
        return out;
      }
      if (mil.length) {
        const tm = (what: 'amove' | 'patrol' | 'garrison' | 'burn') => () => { this.mode = { k: 'target', what }; };
        out.push({ ic: 'cmd_tamad', key: 'KeyA', kl: 'A', tip: '<b>Támadó mozgás</b><p>A cél felé haladva minden útba eső ellenséget megtámad.</p>', on: tm('amove'), act: this.mode?.k === 'target' && this.mode.what === 'amove' });
        out.push({ ic: 'cmd_allj', key: 'KeyS', kl: 'S', tip: '<b>Állj</b>', on: () => this.cmd({ c: 'stop', p: me, uids }) });
        out.push({ ic: 'cmd_orjarat', key: 'KeyP', kl: 'P', tip: '<b>Őrjárat</b><p>Oda-vissza jár a jelenlegi hely és a kijelölt pont között.</p>', on: tm('patrol'), act: this.mode?.k === 'target' && this.mode.what === 'patrol' });
        out.push({ ic: 'cmd_helytall', key: 'KeyH', kl: 'H', tip: '<b>Helytállás</b><p>Nem mozdul a helyéről, csak a hatótávon belüli ellenségre támad.</p>', on: () => this.cmd({ c: 'stance', p: me, uids, s: ALLAS.HELYTALLO }), act: mil.every(u => u.allas === ALLAS.HELYTALLO) });
        const fm = (f: number, ic: string, key: string, name: string, tip: string, dis = false): Btn => ({ ic, key, kl: key, tip: `<b>${name}</b><p>${tip}</p>`, dis, act: mil.every(u => u.alakzat === f), on: () => {
          const tgl = mil.every(u => u.alakzat === f);
          this.cmd({ c: 'formation', p: me, uids: mil.filter(u => tgl || u.alakzat !== f).map(u => u.uid), f });
        } });
        out.push(fm(ALAKZAT.VONAL, 'cmd_vonal', 'F1', 'Vonal', 'Sebesség ×0,8; szemből +2 páncél szúrás és lövés ellen; a pikások megtörik a rohamot.'));
        out.push(fm(ALAKZAT.EK, 'cmd_ek', 'F2', 'Ék', 'Csak lovasság. Roham ×2,5, de oldalról és hátulról sebezhetőbb.', !mil.some(u => u.def.osztaly === 'lovas')));
        out.push(fm(ALAKZAT.LAZA, 'cmd_laza', 'F3', 'Laza', 'Szórt alakzat: az ágyútűz és a lövések kevésbé sebzik.'));
        const st = mil[0].allas;
        const stN = ['Támadó', 'Védekező', 'Helytálló', 'Tartózkodó'], stI = ['cmd_allas_tamado', 'cmd_allas_vedekezo', 'cmd_allas_helytallo', 'cmd_allas_tartozkodo'];
        out.push({ ic: stI[st], key: 'KeyT', kl: 'T', tip: `<b>Állás: ${stN[st]}</b><p>Támadó: látótávon belül üldöz. Védekező: 4 csempéig üldöz, majd visszatér. Helytálló: nem mozdul. Tartózkodó: nem támad.</p>`, on: () => this.cmd({ c: 'stance', p: me, uids, s: (st + 1) % 4 }) });
        if (mil.some(u => u.def.j.has('portya'))) {
          out.push({ ic: 'cmd_portya', key: 'KeyR', kl: 'R', tip: '<b>Portya mód</b><p>Sebesség ×1,2, de a páncél ×0,75. A portyázók zsákmányolnak: jobbágy, gazdasági épület, marha.</p>', act: mil.filter(u => u.def.j.has('portya')).every(u => u.portya), on: () => this.cmd({ c: 'portya', p: me, uids }) });
          out.push({ ic: 'cmd_felgyujt', key: 'KeyF', kl: 'F', tip: '<b>Falu felégetése</b><p>10 másodperc alatt: +30 zsold és +60 élelem azonnal; a falu egy évig nem fizet adót.</p>', on: tm('burn'), act: this.mode?.k === 'target' && this.mode.what === 'burn' });
        }
        out.push({ ic: 'cmd_helyorseg', key: 'KeyG', kl: 'G', tip: '<b>Helyőrség</b><p>Beszállás várba, őrtoronyba, bástyába. A bent ülő nem sebezhető, a lövészek kilőnek.</p>', on: tm('garrison'), act: this.mode?.k === 'target' && this.mode.what === 'garrison' });
      } else if (anyW) {
        out.push({ ic: 'cmd_epit', key: 'KeyB', kl: 'B', tip: '<b>Építés</b><p>Gazdasági és hadi épületek.</p>', on: () => { this.page = 'epit1'; } });
        out.push({ ic: 'cmd_javit', key: 'KeyJ', kl: 'J', tip: '<b>Javítás</b><p>Sérült épület javítása az eredeti ár feléért, arányosan.</p>', on: () => { this.mode = { k: 'target', what: 'repair' }; } });
        out.push({ ic: 'cmd_allj', key: 'KeyS', kl: 'S', tip: '<b>Állj</b>', on: () => this.cmd({ c: 'stop', p: me, uids }) });
        out.push({ ic: 'cmd_helyorseg', key: 'KeyG', kl: 'G', tip: '<b>Menedék</b><p>Beszállás a várba vagy toronyba.</p>', on: () => { this.mode = { k: 'target', what: 'garrison' }; } });
      }
      return out;
    }
    const b = w.bmap.get(this.ui.selB);
    if (!b || b.dead || b.owner !== me) return out;
    if (!b.built) { out[11] = { ic: 'cmd_bont', key: 'Delete', kl: 'Del', tip: '<b>Építkezés lebontása</b><p>Az ár fele visszajár.</p>', on: () => { this.cmd({ c: 'demolish', p: me, b: b.id }); this.ui.selB = 0; } }; return out; }
    let i = 0;
    for (const d of unitsTrainedAt(b.def.id, p.faction)) {
      const lock = p.rank < d.rang, no = d.ar.some((c, k) => p.res[k] < c * RU), full = p.pop + d.nep > p.cap;
      let ex = lock ? `<p class="no">Szükséges rang: ${RANK_NAME[d.rang]}</p>` : full ? '<p class="no">Nincs elég férőhely – építs házat.</p>' : '';
      let lim = false;
      if (d.id === 'szpahi') { const n = w.units.filter(u => !u.dead && u.owner === me && u.def.id === 'szpahi').length; const L = szpahiLimit(w, me); lim = n >= L; ex += `<p class="${lim ? 'no' : ''}">Tímár-keret: ${n} / ${L} (szántók + 3 × falvak)</p>`; }
      out.push({ ic: 'unit_' + d.id, key: GRID_KEYS[i], kl: GRID_LBL[i], dis: lock || no || full || lim || b.queue.length >= 5, tip: this.unitTip(d, d.ar, ex),
        cnt: b.queue.filter(q => q.id === d.id).length || undefined, on: () => this.cmd({ c: 'train', p: me, b: b.id, id: d.id }) });
      i++;
    }
    for (const t of techsAt(b.def.id, p.faction)) {
      if (p.techs.has(t.id)) continue;
      const queued = w.buildings.some(o => o.owner === me && o.queue.some(q => q.k === 't' && q.id === t.id));
      const lock = p.rank < t.rang, no = t.ar.some((c, k) => p.res[k] < c * RU);
      out.push({ ic: 'tech_' + t.id, key: GRID_KEYS[i], kl: GRID_LBL[i], dis: lock || no || queued || b.queue.length >= 5, act: queued,
        tip: `<b>${t.nev}</b>${this.costHTML(t.ar)}<p>${t.leiras}</p><small>${t.ido} s</small>${lock ? `<p class="no">Szükséges rang: ${RANK_NAME[t.rang]}</p>` : ''}`,
        on: () => this.cmd({ c: 'research', p: me, b: b.id, id: t.id }) });
      i++;
    }
    if (b.def.id === 'var' && p.rank < 3) {
      const r = RANKS[p.rank + 1]!;
      const miss = r.kell.filter(k => !hasBuilding(w, me, k)), queued = b.queue.some(q => q.k === 'r');
      out.push({ ic: 'cmd_rang', key: GRID_KEYS[i], kl: GRID_LBL[i], dis: miss.length > 0 || queued || r.ar.some((c, k) => p.res[k] < c * RU), act: queued,
        tip: `<b>Rangemelés: ${RANK_NAME[p.rank + 1]}</b>${this.costHTML(r.ar)}<p>Új épületek, egységek és fejlesztések. Közben a vár nem képez.</p><small>${r.ido} s</small>${miss.length ? `<p class="no">Előbb kell: ${miss.map(k => BUILDINGS[k].nev).join(', ')}</p>` : ''}`,
        on: () => this.cmd({ c: 'rank', p: me, b: b.id }) });
      i++;
    }
    if (b.def.id === 'vasarter') {
      const nm = ['élelem', 'fa', 'kő'];
      for (let r = 0; r < 3; r++) out.push({ ic: RES_IC[r], key: GRID_KEYS[r], kl: GRID_LBL[r], dis: p.res[r] < 100 * RU, tip: `<b>Elad: 100 ${nm[r]}</b><div class="cost"><span class="c zs">+${sellPrice(w, me, r)} zsold</span></div><p>Minden ügylet rontja az árat; idővel visszaáll. Ősszel az eladási ár másfélszeres.</p>`, on: () => this.cmd({ c: 'trade', p: me, r, buy: false }) });
      out[3] = { ic: 'cmd_elad', tip: '<b>Felső sor: eladás</b><p>Alsó sor: vétel.</p>', on: () => { }, dis: true };
      for (let r = 0; r < 3; r++) out[4 + r] = { ic: RES_IC[r], key: GRID_KEYS[4 + r], kl: GRID_LBL[4 + r], dis: p.res[3] < buyPrice(w, me, r) * RU, tip: `<b>Vesz: 100 ${nm[r]}</b><div class="cost"><span class="c zs">−${buyPrice(w, me, r)} zsold</span></div>`, on: () => this.cmd({ c: 'trade', p: me, r, buy: true }) };
      out[7] = { ic: 'cmd_vesz', tip: '<b>Alsó sor: vétel</b>', on: () => { }, dis: true };
    }
    if (b.def.id === 'karam') {
      const ready = b.cattle.filter(c => c >= 180 * TICKS).length;
      out.push({ ic: 'cmd_marha', key: 'KeyQ', kl: 'Q', dis: b.cattle.length >= 4 || p.res[0] < 50 * RU, tip: `<b>Marha beállítása</b>${this.costHTML([50, 0, 0, 0])}<p>180 másodperc alatt nő meg, ha a karám körül van legalább 6 szabad rét. Télen nem nő.</p>`, on: () => this.cmd({ c: 'cattle', p: me, b: b.id, act: 'add' }) });
      out.push({ ic: 'cmd_elad', key: 'KeyW', kl: 'W', dis: !ready || !hasBuilding(w, me, 'vasarter'), tip: `<b>Marha eladása</b><div class="cost"><span class="c zs">+${season(w) === 2 ? 30 : 20} zsold</span></div><p>Vásártér kell hozzá. Ősszel többet ér.</p>`, on: () => this.cmd({ c: 'cattle', p: me, b: b.id, act: 'sell' }) });
      out.push({ ic: 'cmd_levag', key: 'KeyE', kl: 'E', dis: !ready, tip: '<b>Marha levágása</b><div class="cost"><span class="c">+100 élelem</span></div>', on: () => this.cmd({ c: 'cattle', p: me, b: b.id, act: 'kill' }) });
    }
    if (b.def.id === 'toborzo') {
      for (const d of Object.values(UNITS)) {
        if (d.frakcio !== CSASZARI || !isMilitary(d)) continue;
        const z = recruitCost(d.id), lock = p.rank < d.rang, cdn = (b.recruitCd[d.id] ?? 0) > w.tick;
        out.push({ ic: 'unit_' + d.id, key: GRID_KEYS[i], kl: GRID_LBL[i], dis: lock || cdn || p.res[3] < z * RU || p.pop + d.nep > p.cap,
          tip: this.unitTip(d, [0, 0, 0, z], `<p>Azonnal hadra kel, tiszta zsoldért.</p>${lock ? `<p class="no">Szükséges rang: ${RANK_NAME[d.rang]}</p>` : ''}`), on: () => this.cmd({ c: 'recruit', p: me, b: b.id, id: d.id }) });
        i++;
      }
    }
    if (b.gar.length) out[10] = { ic: 'cmd_kienged', key: 'KeyC', kl: 'C', tip: `<b>Helyőrség kiengedése</b><p>${b.gar.length} egység van bent.</p>`, on: () => this.cmd({ c: 'ungarrison', p: me, b: b.id }) };
    if (b.def.id !== 'var') out[11] = { ic: 'cmd_bont', key: 'Delete', kl: 'Del', tip: '<b>Lebontás</b><p>Az ár fele visszajár.</p>', on: () => { this.cmd({ c: 'demolish', p: me, b: b.id }); this.ui.selB = 0; } };
    return out;
  }

  // ---------- HUD ----------
  private hud(now: number): void {
    const w = this.w, me = this.me, p = w.players[me], $ = this.$;
    $.e.textContent = fmt(p.res[0] / RU); $.f.textContent = fmt(p.res[1] / RU); $.k.textContent = fmt(p.res[2] / RU); $.z.textContent = fmt(p.res[3] / RU);
    $.e.classList.toggle('no', p.famine || p.res[0] < p.pop * 5 * RU);
    $.n.textContent = `${p.pop}/${p.cap}`; $.n.classList.toggle('no', p.cap - p.pop < 2);
    const te = tEv(w), s = season(w), yr = yearOf(w);
    const need = wageDemand(w, me), have = Math.floor(p.res[3] / RU) + (te < PAYDAY ? expectedIncome(w, me) : 0);
    const short = need > have;
    $.wage.innerHTML = need > 0 || te >= 120 ? `Őszi zsold <b class="${short ? 'no' : ''}">${have} / ${need}</b>${te < PAYDAY ? ` <small>${mmss(PAYDAY - te)}</small>` : ''}` : '';
    $.wage.classList.toggle('warn', short && te >= 120 && te < PAYDAY);
    $.year.textContent = `Anno ${1551 + yr}`;
    const left = 120 - (te % 120);
    $.seasons.querySelectorAll('span').forEach((el, i) => { el.className = i === s ? 'on' : ''; el.textContent = i === s ? `${SEASON_NAME[i]} ${mmss(left)}` : SEASON_NAME[i]; });
    const idle = w.units.filter(u => !u.dead && !u.inB && u.owner === me && u.def.osztaly === 'munkas' && u.orders.length === 0).length;
    $.idle.textContent = idle ? `Tétlen: ${idle}` : ''; $.idle.style.display = idle ? '' : 'none';
    $.speed.textContent = `${this.speed}×`;
    // hódoltság
    if (w.hodTeam >= 0) { const l = 480 - Math.floor((w.tick - w.hodStart) / TICKS); $.hod.textContent = `Hódoltság: ${w.hodTeam === p.team ? 'a miénk' : 'az ellenségé'} a falvak többsége — ${mmss(Math.max(0, l))}`; $.hod.className = 'hod on' + (w.hodTeam === p.team ? '' : ' bad'); }
    else if (w.scenario.kind === 'kitartas' && w.scenario.holdUntil) { $.hod.textContent = `Kitartani télig: ${mmss(Math.max(0, (w.scenario.holdUntil - w.tick) / TICKS))}`; $.hod.className = 'hod on'; }
    else $.hod.className = 'hod';
    $.banner.textContent = this.banner.msg; $.banner.className = 'banner' + (now - this.banner.t < 4500 && this.banner.msg ? ' on' : '');
    const lateN = w.tick < p.lateUntil ? w.units.filter(u => u.owner === me && u.unpaid && !u.dead) : [];
    if (lateN.length) { const cost = lateN.reduce((a, u) => a + Math.ceil(u.def.zsold * 1.5), 0); $.late.innerHTML = `<b>${lateN.length} egység fizetetlen</b> — utófizetés ${cost} zsoldért (${mmss((p.lateUntil - w.tick) / TICKS)}) <u>Kifizetem</u>`; $.late.style.display = 'block'; } else $.late.style.display = 'none';
    // krónika
    const rec = this.chron.filter(c => now - c.t < 14000).slice(-6);
    const ch = rec.map(c => `<div class="${c.alert ? 'al' : ''}"${c.x >= 0 ? ` data-x="${c.x}" data-y="${c.y}"` : ''} style="opacity:${Math.min(1, (14000 - (now - c.t)) / 3000).toFixed(2)}">${c.msg}</div>`).join('');
    if ($.chron.innerHTML !== ch) $.chron.innerHTML = ch;
    // parancsgombok
    this.btns = this.buildCmds();
    const sig = this.btns.map((b, i) => b ? `${i}${b.ic}${b.dis ? 'd' : ''}${b.act ? 'a' : ''}${b.cnt ?? ''}${b.tip.length}` : '-').join('|');
    if (sig !== this.btnSig) {
      this.btnSig = sig;
      let h = '';
      for (let i = 0; i < 12; i++) {
        const b = this.btns[i];
        h += b ? `<button data-i="${i}" class="${b.dis ? 'dis' : ''}${b.act ? ' act' : ''}" data-tip="${b.tip.replace(/"/g, '&quot;')}" style="background-image:url(${iconURL(b.ic, p.faction, p.color)})">${b.kl ? `<kbd>${b.kl}</kbd>` : ''}${b.cnt ? `<em>${b.cnt}</em>` : ''}</button>` : '<span></span>';
      }
      $.cmds.innerHTML = h;
    }
    this.info();
  }

  private info(): void {
    const w = this.w, me = this.me, $ = this.$;
    const us = this.selUnits();
    let h = '';
    const bar = (f: number, cls = '') => `<div class="hp ${cls}"><i style="width:${Math.max(0, Math.min(100, f * 100)).toFixed(0)}%"></i></div>`;
    if (us.length === 1) {
      const u = us[0], d = u.def, own = u.owner === me;
      const st: string[] = [];
      if (u.lazado > 0) st.push('<span class="no">lázadó</span>');
      if (u.unpaid) st.push('<span class="no">zsoldra vár</span>'); else if (u.pay === 1) st.push('<span class="no">fizetetlen</span>');
      if (u.rout > 0) st.push('<span class="no">megfutamodott</span>');
      if (u.portya) st.push('portyán');
      if (u.alakzat) st.push(['', 'vonal', 'ék', 'laza'][u.alakzat]);
      if (u.immobile > w.tick) st.push('<span class="no">mozgásképtelen</span>');
      if (u.cattle) st.push(`${u.cattle} marhát hajt`);
      if (own && u.def.id === 'jobbagy') st.push(u.orders.length ? ({ gather: 'gyűjt', build: 'épít', repair: 'javít', move: 'úton', douse: 'tüzet olt', garrison: 'menedékbe tart' } as any)[u.orders[0].k] ?? '' : '<span class="no">tétlen</span>');
      const mor = effMoral(w, u) / HPU;
      h = `<div class="port" style="background-image:url(${iconURL('unit_' + d.id)})"></div><div class="tx"><h3>${d.nev}${own ? '' : ` <small>(${FACTION_NAME[w.players[u.owner].faction]})</small>`}</h3>
        ${bar(u.hp / (d.hp * HPU))}<div class="row">ÉP ${Math.ceil(u.hp / HPU)} / ${d.hp}${d.osztaly !== 'munkas' ? ` · morál ${Math.round(mor)}` : ''}</div>
        <div class="row">Tám. ${d.tam} ${TYPE_NAME[d.tipus]}${d.tav >= 2 ? ` · táv ${d.tav}` : ''} · páncél ${d.pancel.join('/')} · seb. ${d.seb}</div>
        <div class="row zs">${d.zsold ? `Zsold: ${d.zsold} / ősz` : 'Zsoldot nem kér'}${st.length ? ' · ' + st.filter(Boolean).join(' · ') : ''}</div><div class="row it">${d.leiras}</div></div>`;
    } else if (us.length > 1) {
      const zs = us.reduce((a, u) => a + u.def.zsold, 0);
      const counts = new Map<string, number>(); for (const u of us) counts.set(u.def.nev, (counts.get(u.def.nev) ?? 0) + 1);
      h = `<div class="tx wide"><h3>${[...counts].map(([n, c]) => `${n} ×${c}`).join(', ')}</h3><div class="multi">${us.map(u => `<div data-u="${u.uid}" style="background-image:url(${iconURL('unit_' + u.def.id)})">${bar(u.hp / (u.def.hp * HPU))}</div>`).join('')}</div><div class="row zs">Zsold összesen: ${zs} / ősz</div></div>`;
    } else {
      const b = w.bmap.get(this.ui.selB);
      if (b && !b.dead) {
        const d = b.def, own = b.owner === me, p = w.players[b.owner];
        let extra = '';
        if (!b.built) extra = `<div class="row">Épül: ${Math.floor(100 * b.prog / ((d.epites || 1) * 1000))}%</div>`;
        else if (d.id === 'szanto') extra = `<div class="row">${['Ugar – tavasszal vetni kell', 'Bevetve – ősszel beérik', `Érett – ${fmt(b.farmLeft / RU)} élelem aratható`][b.farm]}${w.rdist[(b.y + 1) * w.W + b.x + 1] <= 3 ? ' · ártéri föld (×1,25)' : ''}</div>`;
        else if (d.id === 'karam') extra = `<div class="row">Marha: ${b.cattle.length}/4, ebből kész ${b.cattle.filter(c => c >= 180 * TICKS).length}</div>`;
        if (b.fire > 0) extra += '<div class="row no">Ég! Jobbággyal oltható.</div>';
        if (d.helyorseg) extra += `<div class="row">Helyőrség: ${b.gar.length} / ${d.helyorseg}</div>`;
        let q = '';
        if (own && b.queue.length) {
          const f = b.queue[0], need = f.k === 'u' ? (f.id === 'jobbagy' && p.faction === CSASZARI ? 25 : UNITS[f.id].kepzes) * TICKS : f.k === 't' ? TECHS[f.id].ido * TICKS : RANKS[p.rank + 1]!.ido * TICKS;
          q = `<div class="queue">${b.queue.map((it, i) => `<div data-q="${i}" data-tip="Kattints a törléshez – az ár visszajár." style="background-image:url(${iconURL(it.k === 'u' ? 'unit_' + it.id : it.k === 't' ? 'tech_' + it.id : 'cmd_rang')})">${i === 0 ? `<i style="height:${(100 - 100 * b.qprog / need).toFixed(0)}%"></i>` : ''}</div>`).join('')}</div>${p.famine && f.k === 'u' ? '<div class="row no">Éhínség: a képzés áll.</div>' : ''}`;
        }
        h = `<div class="port" style="background-image:url(${iconURL('b_' + d.id, p.faction, p.color)})"></div><div class="tx"><h3>${d.nev}${own ? '' : ` <small>(${FACTION_NAME[p.faction]})</small>`}</h3>
          ${bar(b.hp / (d.hp * HPU))}<div class="row">ÉP ${Math.ceil(b.hp / HPU)} / ${d.hp}</div>${extra}${q}<div class="row it">${d.leiras}</div></div>`;
      } else {
        const p = w.players[me];
        const vil = w.villages.filter(v => v.owner === me).length;
        h = `<div class="tx wide idle"><h3>${FACTION_NAME[p.faction]} — ${RANK_NAME[p.rank]}</h3><div class="row">Falvak: ${vil} / ${w.villages.length} · adó fizetőnapon: ${vil * 15} zsold, ${vil * 40} élelem</div>
          <div class="row it">${['Tavasz: árad a folyó, vetni most kell. Az eső rontja a lőfegyvert.', 'Nyár: hadjáratok ideje. Az oszmán had most a legerősebb.', 'Ősz: aratás és fizetőnap. A vásáron most jó eladni.', 'Tél: a folyó befagy és járható. Szálláson kívül fagy, több élelem fogy.'][season(w)]}</div></div>`;
      }
    }
    const sig = h;
    if (sig !== this.selSig) { this.selSig = sig; $.info.innerHTML = h; }
  }

  // ---------- menü, vég ----------
  private showOverlay(html: string, pause: boolean): void { this.$.ov.innerHTML = `<div class="panel">${html}</div>`; this.$.ov.style.display = 'flex'; if (pause) this.paused = true; }
  private hideOverlay(): void { this.$.ov.style.display = 'none'; this.paused = false; this.last = performance.now(); }
  private menu(): void {
    this.showOverlay(`<h2>Szünet</h2>
      <button data-act="resume">Folytatás</button>
      <button data-act="snd">Hang: ${audio.on ? 'be' : 'ki'}</button>
      <button data-act="vol">Hangerő: ${Math.round(audio.vol * 100)}%</button>
      <button data-act="exit">Kilépés a főmenübe</button>
      <div class="keys"><b>Irányítás</b><br>Bal klikk / húzás: kijelölés · dupla klikk: azonos típus · jobb klikk: parancs (mozgás, támadás, gyűjtés, építés, beszállás)<br>
      Shift: parancsok sorba fűzése · Ctrl+0–9 / 0–9: csoport · A támadó mozgás · S állj · P őrjárat · H helytállás · F1–F3 alakzat · R portya<br>
      Szóköz: utolsó riasztás · pont: tétlen jobbágy · nyilak / képernyőszél / középső gomb: kamera · görgő: nagyítás · + / −: sebesség</div>`, true);
  }
  private finish(): void {
    this.ended = true;
    const w = this.w, p = w.players[this.me], won = w.winner === p.team;
    sfx(won ? 'gyozelem' : 'vereseg');
    const rows = w.players.map(q => `<tr><td><span class="dot" style="background:${TEAM[q.color].css}"></span>${FACTION_NAME[q.faction]}${q.id === this.me ? ' (te)' : ''}</td><td>${q.stats.kills}</td><td>${q.stats.lost}</td><td>${q.stats.built}</td><td>${q.stats.loot}</td></tr>`).join('');
    this.showOverlay(`<h2>${won ? 'Győzelem' : 'Vereség'}</h2><p>${won ? (w.scenario.kind === 'kitartas' ? 'Beállt a tél, az ostromlók elvonultak. A vár áll.' : w.hodTeam === p.team ? 'A végvidék falvai neked adóznak.' : 'Az ellenség vára elesett.') : (w.hodTeam >= 0 && w.hodTeam !== p.team ? 'A falvak az ellenségnek hódoltak be.' : 'A várad elesett.')}</p>
      <table><tr><th></th><th>Leküzdött</th><th>Veszteség</th><th>Épület</th><th>Zsákmány</th></tr>${rows}</table>
      <p class="it">Eltelt idő: ${yearOf(w)}. év, ${SEASON_NAME[season(w)].toLowerCase()} (${mmss(w.tick / TICKS)})</p>
      <button data-act="exit">Vissza a főmenübe</button><button data-act="watch">Csatatér megtekintése</button>`, false);
  }
}
void YEAR;
