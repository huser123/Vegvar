// Világállapot: létrehozás, csempe- és foglaltságlekérdezések, egység/épület létrehozás és törlés.
import { T, MOVE_MULT, UNITS, BUILDINGS, TICKS, YEAR, OSZMAN, type Faction, type UnitDef, type BuildingDef, type Res, buildingCost, buildingRank } from './data';
import { FP, HPU, RU, ALLAS, type World, type Unit, type Building, type Player, type Scenario, type Ev } from './types';
import { generateMap } from './mapgen';
import { xs32, isqrt, seasonOf } from './rules';

export interface PlayerSetup { faction: Faction; ai: number; team?: number }
export interface GameSetup { size: number; seed: number; players: PlayerSetup[]; scenario?: Scenario }

export const YT = YEAR * TICKS;
export const tickInYear = (w: World) => w.tick % YT;
export const yearOf = (w: World) => Math.floor(w.tick / YT) + 1;
export const season = (w: World) => seasonOf(tickInYear(w));
export const tEv = (w: World) => Math.floor(tickInYear(w) / TICKS);

export function rand(w: World): number { w.rs = xs32(w.rs); return w.rs; }
/** Egész véletlen 0..n-1 */
export function randInt(w: World, n: number): number { return rand(w) % n; }

export const idx = (w: World, x: number, y: number) => y * w.W + x;
export const inMap = (w: World, x: number, y: number) => x >= 0 && y >= 0 && x < w.W && y < w.H;
export const tileOf = (w: World, px: number, py: number) => Math.floor(py / FP) * w.W + Math.floor(px / FP);

export function moveClass(d: UnitDef): number {
  return d.osztaly === 'lovas' ? 1 : d.osztaly === 'ostrom' ? 2 : d.osztaly === 'hajo' ? 3 : 0;
}
export const radius = (d: UnitDef) => d.osztaly === 'ostrom' ? 600 : d.osztaly === 'hajo' ? 700 : 300;
export const isMilitary = (d: UnitDef) => d.osztaly !== 'munkas';

export function teamOf(w: World, owner: number): number { return owner < 0 ? -1 : w.players[owner].team; }
export function hostileUU(w: World, a: Unit, b: Unit): boolean {
  if (a.lazado > 0 || b.lazado > 0) return !(a.lazado > 0 && b.lazado > 0);
  return w.players[a.owner].team !== w.players[b.owner].team;
}
export function hostileUB(w: World, a: Unit, b: Building): boolean {
  if (a.lazado > 0) return true;
  return w.players[a.owner].team !== w.players[b.owner].team;
}

/** Terepszorzó (ezrelék) az adott mozgásosztálynak; 0 = járhatatlan. Épületet nem néz. */
export function terrainMult(w: World, i: number, mc: number, heavy: boolean): number {
  const t = w.cur[i];
  if (t === T.JEG && heavy) return 0;
  return MOVE_MULT[t][mc];
}
/** Járható-e az i csempe az egységnek (terep + épület + kapu). */
export function passable(w: World, i: number, mc: number, heavy: boolean, team: number): number {
  const m = terrainMult(w, i, mc, heavy);
  if (m === 0) return 0;
  const o = w.occ[i];
  if (o === 0) return m;
  if (o < 0) return 0;
  const b = w.bmap.get(o);
  if (!b) return m;
  if (b.def.jarhato) return MOVE_MULT[T.SZANTO][mc] ? Math.min(m, MOVE_MULT[T.SZANTO][mc]) : 0;
  if (b.def.kapu && team >= 0 && w.players[b.owner].team === team) return m;
  return 0;
}
export function passU(w: World, i: number, u: Unit): number {
  return passable(w, i, moveClass(u.def), u.def.j.has('nehez'), u.lazado > 0 ? -1 : w.players[u.owner].team);
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return isqrt(dx * dx + dy * dy);
}
/** Távolság (FP) egy pont és egy csempe-téglalap [x0,x1]×[y0,y1] (csempeindex, zárt) között. */
export function distRect(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const rx0 = x0 * FP, ry0 = y0 * FP, rx1 = (x1 + 1) * FP, ry1 = (y1 + 1) * FP;
  const dx = px < rx0 ? rx0 - px : px > rx1 ? px - rx1 : 0;
  const dy = py < ry0 ? ry0 - py : py > ry1 ? py - ry1 : 0;
  return dx === 0 ? dy : dy === 0 ? dx : isqrt(dx * dx + dy * dy);
}
export const distB = (u: { x: number; y: number }, b: Building) => distRect(u.x, u.y, b.x, b.y, b.x + b.w - 1, b.y + b.h - 1);
export const bcx = (b: Building) => b.x * FP + b.w * FP / 2;
export const bcy = (b: Building) => b.y * FP + b.h * FP / 2;

export function push(w: World, e: Ev): void { if (w.ev.length < 4000) w.ev.push(e); }
export function chron(w: World, p: number, msg: string): void { push(w, { t: 'chron', p, msg }); }
export function alert(w: World, p: number, kind: string, x: number, y: number, msg: string): void { push(w, { t: 'alert', p, kind, x, y, msg }); }

export function canAfford(p: Player, c: Res): boolean {
  return p.res[0] >= c[0] * RU && p.res[1] >= c[1] * RU && p.res[2] >= c[2] * RU && p.res[3] >= c[3] * RU;
}
export function pay(p: Player, c: Res, sign = 1): void { for (let i = 0; i < 4; i++) p.res[i] -= sign * c[i] * RU; }

export function createWorld(setup: GameSetup): World {
  const g = generateMap(setup.size, setup.seed);
  const N = g.W * g.H;
  const w: World = {
    tick: 0, seed: setup.seed, rs: (setup.seed * 2654435761 >>> 0) || 1,
    W: g.W, H: g.H, base: g.base, cur: new Uint8Array(g.base), hgt: g.hgt, rdist: g.rdist, flood: new Uint8Array(N),
    wood: g.wood, stone: g.stone, occ: new Int32Array(N),
    units: [], umap: new Map(), buildings: [], bmap: new Map(), villages: [], animals: [], projs: [], players: [],
    nextId: 1, terrainVer: 1, floodLevel: 0, ice: false, cmds: [], ev: [],
    gHead: new Int32Array(N).fill(-1), gNext: new Int32Array(1024),
    winner: -1, over: false, hodTeam: -1, hodStart: 0,
    scenario: setup.scenario ?? { kind: 'csetepate' }, starts: g.starts, fords: g.fords, pathBudget: 0,
  };
  const usedColors = new Set<number>();
  setup.players.forEach((ps, i) => {
    let color: number = ps.faction; // végvári vörös, oszmán zöld, császári sárga; ütközésnél kék
    if (usedColors.has(color)) color = 3;
    usedColors.add(color);
    w.players.push({
      id: i, team: ps.team ?? i, faction: ps.faction, color, ai: ps.ai,
      res: [200 * RU, 200 * RU, 100 * RU, 60 * RU], rank: 1, techs: new Set(), pop: 0, cap: 0, alive: true, famine: false,
      sell: [1000, 1000, 1000], buy: [1000, 1000, 1000], lateUntil: 0, capRespawn: 0, lootRem: 0,
      stats: { kills: 0, lost: 0, loot: 0, built: 0 }, vis: new Uint8Array(N), gatherMult: ps.ai === 1 ? 700 : 1000,
    });
  });
  g.villages.forEach((v, i) => {
    w.villages.push({ id: i, x: v.x, y: v.y, owner: -1, cap: setup.players.map(() => 0), burnt: 0, burnBy: -1 });
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) w.occ[idx(w, v.x + dx, v.y + dy)] = -1;
  });
  let aid = 0;
  for (const h of g.herds) for (let k = 0; k < 4; k++) {
    const x = (h.x + (k % 2)) * FP + 500, y = (h.y + (k >> 1)) * FP + 500;
    w.animals.push({ id: aid++, x, y, hx: x, hy: y, food: 140 * RU, dead: false, fx: 700, fy: 700, tx: x, ty: y, moving: false });
  }
  setup.players.forEach((_, i) => {
    const s = g.starts[i];
    const bx = i === 0 ? s.x - 2 : s.x - 1, by = i === 0 ? s.y - 2 : s.y - 1;
    const b = addBuilding(w, BUILDINGS.var, i, bx, by, 0, true);
    const sg = i === 0 ? 1 : -1; // a folyó felé
    for (let k = 0; k < 4; k++) spawnUnit(w, UNITS.jobbagy, i, (s.x + sg * (3 + (k >> 1))) * FP + 500, (s.y + (k % 2 ? 1 : -1) * (1 + (k >> 1)) ) * FP + 500);
    spawnUnit(w, UNITS.kapitany, i, (s.x + sg * 3) * FP + 500, (s.y + sg * 3) * FP + 500);
    b.rallyX = (s.x + sg * 4) * FP; b.rallyY = (s.y + sg * 4) * FP;
  });
  if (w.scenario.kind === 'kitartas') applySiegeScenario(w);
  recountPop(w);
  return w;
}

/** Épület lerakása a megadott pont közelébe, az első szabad helyre (pályaelőkészítéshez). */
function placeFree(w: World, id: string, owner: number, ax: number, ay: number): Building | null {
  const d = BUILDINGS[id];
  for (let r = 0; r < 16; r++) for (let y = ay - r; y <= ay + r; y++) for (let x = ax - r; x <= ax + r; x++) {
    if (Math.max(Math.abs(x - ax), Math.abs(y - ay)) !== r) continue;
    let ok = canPlace(w, d, owner, x, y, 0, true);
    for (let j = -1; ok && j <= d.h; j++) for (let i = -1; i <= d.w; i++) {
      const tx = x + i, ty = y + j;
      if (!inMap(w, tx, ty) || w.occ[idx(w, tx, ty)] !== 0 || w.rdist[idx(w, tx, ty)] < 4) { ok = false; break; }
    }
    if (ok) return addBuilding(w, d, owner, x, y, 0, true);
  }
  return null;
}

/** „Kitartás” pálya (13. fejezet): a 0. játékos megerősített várát a 1. játékos ostromló hada támadja. */
function applySiegeScenario(w: World): void {
  const [d, a] = w.players;
  const sd = w.starts[0], sa = w.starts[1];
  d.res = [500 * RU, 400 * RU, 200 * RU, 220 * RU];
  for (const [id, dx, dy] of [['ortorony', 6, 2], ['ortorony', 2, 6], ['ortorony', 7, 7], ['kaszarnya', -6, 3], ['haz', -5, -4], ['haz', -2, -6], ['haz', 4, -6], ['malom', -7, -1], ['strazsa', 10, 10]] as [string, number, number][])
    placeFree(w, id, 0, sd.x + dx, sd.y + dy);
  const army0: [string, number][] = [['darabont', 8], ['hajdu', 6]];
  let k = 0;
  for (const [id, n] of army0) for (let i = 0; i < n; i++, k++) spawnUnit(w, UNITS[id], 0, (sd.x + 4 + (k % 5)) * FP + 500, (sd.y + 4 + Math.floor(k / 5)) * FP + 500);
  a.res = [900 * RU, 700 * RU, 300 * RU, 700 * RU]; a.rank = 3;
  for (const [id, dx, dy] of [['satortabor', -6, -2], ['satortabor', -2, -7], ['kaszarnya', 5, -5], ['istallo', 6, 2], ['agyuonto', 2, 7], ['haz', 6, 6], ['haz', -6, 4], ['haz', -3, 7], ['malom', 8, -2]] as [string, number, number][])
    placeFree(w, id, 1, sa.x + dx, sa.y + dy);
  const army1: [string, number][] = [['azab', 16], ['janicsar', 8], ['akindzsi', 6], ['szpahi', 4], ['agyu', 2]];
  k = 0;
  for (const [id, n] of army1) for (let i = 0; i < n; i++, k++) spawnUnit(w, UNITS[id], 1, (sa.x - 5 - (k % 7)) * FP + 500, (sa.y - 5 - Math.floor(k / 7)) * FP + 500);
}

export function recountPop(w: World): void {
  for (const p of w.players) { p.pop = 0; p.cap = 0; }
  for (const u of w.units) if (!u.dead && u.lazado === 0) w.players[u.owner].pop += u.def.nep;
  for (const b of w.buildings) {
    if (b.dead) continue;
    if (b.built) w.players[b.owner].cap += b.def.nep;
    for (const q of b.queue) if (q.k === 'u') w.players[b.owner].pop += UNITS[q.id].nep;
  }
  for (const p of w.players) p.cap = Math.min(p.cap, p.faction === OSZMAN ? 250 : 200);
}

export function spawnUnit(w: World, def: UnitDef, owner: number, x: number, y: number): Unit {
  const u: Unit = {
    uid: w.nextId++, def, owner, x, y, fx: 707, fy: 707, hp: def.hp * HPU, moral: 70 * HPU, pay: 0, unpaid: false, lazado: 0,
    alakzat: 0, allas: def.osztaly === 'munkas' ? ALLAS.TARTOZKODO : ALLAS.VEDEKEZO, portya: false,
    carryT: -1, carry: 0, cattle: 0, orders: [], path: null, pi: 0, pkey: -1, pver: 0, pwait: 0, st: 0, dropB: 0,
    cd: 0, work: 0, chDist: 0, chFx: 0, chFy: 0, chCd: 0, lastHit: -9999, lastMove: -9999, lastFight: -9999, lastAtkBy: 0,
    rout: 0, immobile: 0, inB: 0, tgtU: 0, tgtB: 0, scanAt: 0, homeX: x, homeY: y, anim: 0, animT: 0, mrem: 0, dead: false,
  };
  w.units.push(u); w.umap.set(u.uid, u);
  return u;
}

export function addBuilding(w: World, def: BuildingDef, owner: number, x: number, y: number, rot: number, built: boolean): Building {
  const bw = rot ? def.h : def.w, bh = rot ? def.w : def.h;
  const b: Building = {
    id: w.nextId++, def, owner, x, y, w: bw, h: bh, rot, hp: built ? def.hp * HPU : Math.max(1, def.hp * HPU / 20 | 0), built, prog: 0, nb: 0, nbRate: 0,
    queue: [], qprog: 0, rallyX: -1, rallyY: -1, gar: [], cd: 0, fire: 0, fireCont: 0, farm: 0, farmLeft: 0, sow: 0, cattle: [],
    lastAlarm: -9999, lastHit: -9999, recruitCd: {}, mineBy: 0, dead: false,
  };
  w.buildings.push(b); w.bmap.set(b.id, b);
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) w.occ[idx(w, x + i, y + j)] = b.id;
  w.terrainVer++;
  return b;
}

/** Építési feltételek (7. fejezet): felderített, sík, nem elöntött, szabad csempék. */
export function canPlace(w: World, def: BuildingDef, owner: number, x: number, y: number, rot: number, ignoreVis = false): boolean {
  const bw = rot ? def.h : def.w, bh = rot ? def.w : def.h;
  const p = w.players[owner];
  let river = false;
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
    const tx = x + i, ty = y + j;
    if (!inMap(w, tx, ty)) return false;
    const k = idx(w, tx, ty), t = w.cur[k];
    if (!ignoreVis && p.vis[k] === 0) return false;
    if (w.occ[k] !== 0 || w.flood[k]) return false;
    if (t !== T.RET && t !== T.UT) return false;
  }
  // egység nem állhat a helyén (a szántó kivétel)
  if (!def.jarhato) {
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
      for (let n = w.gHead[idx(w, x + i, y + j)]; n >= 0; n = w.gNext[n]) {
        const u = w.units[n];
        if (u && !u.dead && u.inB === 0 && (u.lazado > 0 || w.players[u.owner].team !== p.team)) return false;
      }
    }
  }
  if (def.id === 'rev') {
    for (let j = -1; j <= bh; j++) for (let i = -1; i <= bw; i++) {
      const tx = x + i, ty = y + j;
      if (inMap(w, tx, ty) && w.base[idx(w, tx, ty)] === T.FOLYO) river = true;
    }
    if (!river) return false;
  }
  return true;
}

export function placeCost(w: World, def: BuildingDef, owner: number): Res { return buildingCost(def, w.players[owner].faction); }
export function canBuildDef(w: World, def: BuildingDef, owner: number): boolean {
  const p = w.players[owner];
  return def.frakcio.includes(p.faction) && p.rank >= buildingRank(def, p.faction);
}

/** Szabad, járható csempe keresése egy téglalap körül, gyűrűnként. Visszaad: csempeindex vagy −1. */
export function freeTileAround(w: World, x0: number, y0: number, x1: number, y1: number, mc: number, heavy: boolean, team: number, prefX = -1, prefY = -1): number {
  for (let r = 1; r < 12; r++) {
    let best = -1, bd = 1e18;
    for (let y = y0 - r; y <= y1 + r; y++) for (let x = x0 - r; x <= x1 + r; x++) {
      if (x > x0 - r && x < x1 + r && y > y0 - r && y < y1 + r) continue;
      if (!inMap(w, x, y)) continue;
      const i = idx(w, x, y);
      if (!passable(w, i, mc, heavy, team)) continue;
      if (w.occ[i] !== 0) continue;
      const d = prefX >= 0 ? (x * FP + 500 - prefX) ** 2 + (y * FP + 500 - prefY) ** 2 : (x * 31 + y * 17) % 97;
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) return best;
  }
  return -1;
}

export function ownBuildings(w: World, owner: number, id?: string, builtOnly = true): Building[] {
  return w.buildings.filter(b => !b.dead && b.owner === owner && (!id || b.def.id === id) && (!builtOnly || b.built));
}
export function hasBuilding(w: World, owner: number, id: string): boolean {
  for (const b of w.buildings) if (!b.dead && b.built && b.owner === owner && b.def.id === id) return true;
  return false;
}
export function castleOf(w: World, owner: number): Building | undefined {
  for (const b of w.buildings) if (!b.dead && b.owner === owner && b.def.id === 'var') return b;
  return undefined;
}

/** Zsoldigény és várható őszi bevétel (HUD és gépi ellenfél). */
export function wageDemand(w: World, owner: number): number {
  let s = 0;
  for (const u of w.units) if (!u.dead && u.owner === owner && u.lazado === 0) s += u.def.zsold;
  return s;
}
export function expectedIncome(w: World, owner: number): number {
  let s = 0;
  for (const v of w.villages) if (v.owner === owner && v.burnt <= w.tick) s += 15;
  for (const u of w.units) if (!u.dead && u.owner === owner && u.def.id === 'jobbagy') s += 1;
  return s;
}
export function szpahiLimit(w: World, owner: number): number {
  let n = 0;
  for (const b of w.buildings) if (!b.dead && b.built && b.owner === owner && b.def.id === 'szanto') n++;
  for (const v of w.villages) if (v.owner === owner) n += 3;
  return n;
}

/** Lát-e a játékos egy egységet (köd + erdei rejtőzés, 12. fejezet). */
export function canSeeUnit(w: World, p: number, u: Unit): boolean {
  if (u.inB) return false;
  const pl = w.players[p];
  if (u.lazado === 0 && w.players[u.owner].team === pl.team) return true;
  const tx = Math.floor(u.x / FP), ty = Math.floor(u.y / FP), i = idx(w, tx, ty);
  if (pl.vis[i] !== 2) return false;
  if (w.cur[i] !== T.ERDO) return true;
  for (let y = ty - 2; y <= ty + 2; y++) for (let x = tx - 2; x <= tx + 2; x++) {
    if (!inMap(w, x, y)) continue;
    for (let n = w.gHead[idx(w, x, y)]; n >= 0; n = w.gNext[n]) {
      const o = w.units[n];
      if (o && !o.dead && o.lazado === 0 && w.players[o.owner].team === pl.team) return true;
    }
  }
  return false;
}

export function rebuildGrid(w: World): void {
  w.gHead.fill(-1);
  if (w.gNext.length < w.units.length) w.gNext = new Int32Array(w.units.length * 2);
  for (let n = 0; n < w.units.length; n++) {
    const u = w.units[n];
    if (u.dead || u.inB) continue;
    const i = tileOf(w, u.x, u.y);
    w.gNext[n] = w.gHead[i]; w.gHead[i] = n;
  }
}

/** Egységek bejárása egy pont körüli csempesugárban. */
export function forUnitsNear(w: World, px: number, py: number, rTiles: number, fn: (u: Unit) => void): void {
  const cx = Math.floor(px / FP), cy = Math.floor(py / FP);
  const x0 = Math.max(0, cx - rTiles), x1 = Math.min(w.W - 1, cx + rTiles), y0 = Math.max(0, cy - rTiles), y1 = Math.min(w.H - 1, cy + rTiles);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    for (let n = w.gHead[y * w.W + x]; n >= 0; n = w.gNext[n]) { const u = w.units[n]; if (u && !u.dead) fn(u); }
  }
}
