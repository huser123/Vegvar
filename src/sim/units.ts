// Egységek tickenkénti viselkedése: parancsok, mozgás, gyűjtés, építés, célválasztás, támadás.
import { T, TICKS, SEASON_MOVE, OSZMAN, BUILDINGS } from './data';
import { FP, HPU, RU, CARRY_MAX, ALAKZAT, ALLAS, ANIM, type World, type Unit, type Building, type Order } from './types';
import { isqrt } from './rules';
import { season, idx, inMap, tileOf, passU, dist, distRect, distB, radius, moveClass, isMilitary, hostileUU, hostileUB, canSeeUnit,
  bcx, bcy, castleOf, push, chron, alert, forUnitsNear, pay, recountPop } from './world';
import { findPath, lineClear } from './path';
import { meleeHit, rangedShot, strikeBuilding, siegeFire, atkMults, addLoot, deployed, hurtBuilding, killBuilding, effMoral } from './combat';

const sebM = new Map<string, number>();
function baseSpeed(u: Unit): number {
  let v = sebM.get(u.def.id);
  if (v === undefined) { v = Math.round(u.def.seb * 1000); sebM.set(u.def.id, v); }
  return v;
}

export function speedOf(w: World, u: Unit, ti: number): number {
  let v = baseSpeed(u);
  const o = u.orders[0];
  if (o && o.spd && o.spd < v) v = o.spd;
  let m = passU(w, ti, u);
  if (m === 0) m = 500;
  const s = season(w);
  if (w.cur[ti] === T.UT && s === 0 && m > 1000) m = 1000; // tavaszi sár
  v = v * m / 1000;
  if (u.def.osztaly !== 'hajo') v = v * SEASON_MOVE[s] / 1000;
  if (u.alakzat === ALAKZAT.VONAL) v = v * 800 / 1000;
  if (u.pay === 1 && u.def.j.has('hazai')) v = v * 850 / 1000;
  if (u.portya || u.rout > 0) v = v * 1200 / 1000;
  if (w.players[u.owner].faction === OSZMAN && s === 1) v = v * 1100 / 1000;
  if (u.cattle > 0) v = v * 700 / 1000;
  return Math.floor(v);
}

export function face(u: Unit, px: number, py: number): void {
  const dx = px - u.x, dy = py - u.y, d = isqrt(dx * dx + dy * dy);
  if (d > 0) { u.fx = (dx * 1000 / d) | 0; u.fy = (dy * 1000 / d) | 0; }
}

/** Lépés egy pont felé. 0: úton, 1: megérkezett, 2: elakadt. */
export function stepTo(w: World, u: Unit, px: number, py: number): number {
  if (u.immobile > w.tick) return 0;
  if (u.def.osztaly === 'hajo' && season(w) === 3) return 0;
  const dx = px - u.x, dy = py - u.y, d = isqrt(dx * dx + dy * dy);
  if (d <= 15) return 1;
  const ti = tileOf(w, u.x, u.y);
  const v = speedOf(w, u, ti) + u.mrem;
  const step = (v / TICKS) | 0; u.mrem = v % TICKS;
  if (step <= 0) return 0;
  let nx = px, ny = py;
  if (step < d) { nx = u.x + ((dx * step / d) | 0); ny = u.y + ((dy * step / d) | 0); }
  nx = Math.max(10, Math.min(w.W * FP - 10, nx)); ny = Math.max(10, Math.min(w.H * FP - 10, ny));
  const ni = tileOf(w, nx, ny);
  if (ni !== ti && passU(w, ni, u) === 0) {
    const ix = tileOf(w, nx, u.y), iy = tileOf(w, u.x, ny);
    if (passU(w, ix, u) !== 0 && nx !== u.x) ny = u.y;
    else if (passU(w, iy, u) !== 0 && ny !== u.y) nx = u.x;
    else return 2;
  }
  const mx = nx - u.x, my = ny - u.y, md = isqrt(mx * mx + my * my);
  if (md > 0) {
    const fx = (mx * 1000 / md) | 0, fy = (my * 1000 / md) | 0;
    if (u.def.j.has('roham')) {
      if (w.tick - u.lastMove > 3) u.chDist = 0;
      const dot = fx * u.chFx + fy * u.chFy;
      if (u.chDist > 0 && dot > 0 && 4 * dot * dot >= 3 * 1e12) u.chDist += md;
      else { u.chDist = md; u.chFx = fx; u.chFy = fy; }
    }
    u.fx = fx; u.fy = fy;
  }
  u.x = nx; u.y = ny; u.lastMove = w.tick; u.anim = ANIM.MEGY;
  return step >= d ? 1 : 0;
}

const tcx = (w: World, i: number) => (i % w.W) * FP + 500;
const tcy = (w: World, i: number) => Math.floor(i / w.W) * FP + 500;

/** Közelítés egy csempe-téglalap r sugarú környezetébe. 0: úton, 1: megérkezett, 2: elérhetetlen. */
export function approach(w: World, u: Unit, x0: number, y0: number, x1: number, y1: number, r: number, key = 0): number {
  const d = distRect(u.x, u.y, x0, y0, x1, y1);
  if (d <= r) { u.path = null; u.pkey = -1; return 1; }
  const k = key || ((((x0 * 211 + y0) * 211 + x1) * 211 + y1) * 31 + (r >> 6) + 1);
  let need = !u.path || u.pkey !== k;
  if (!need && u.pver !== w.terrainVer) {
    u.pver = w.terrainVer;
    for (let i = u.pi; i < u.path!.length; i++) if (passU(w, u.path![i], u) === 0) { need = true; break; }
  }
  if (need) {
    if (u.pwait > w.tick || w.pathBudget <= 0) return 0;
    w.pathBudget--;
    u.path = findPath(w, u, x0, y0, x1, y1, r); u.pi = 0; u.pkey = k; u.pver = w.terrainVer;
    if (u.path.length === 0) { u.path = null; u.pkey = -1; u.pwait = w.tick + 20; return 2; }
    smooth(w, u);
  }
  const p = u.path!;
  const res = stepTo(w, u, tcx(w, p[u.pi]), tcy(w, p[u.pi]));
  if (res === 2) { u.path = null; u.pkey = -1; u.pwait = w.tick + 5; return 0; }
  if (res === 1) {
    u.pi++;
    if (u.pi >= p.length) {
      u.path = null; u.pkey = -1;
      if (distRect(u.x, u.y, x0, y0, x1, y1) <= r + 200) return 1;
      u.pwait = w.tick + 15;
      return 2;
    }
    smooth(w, u);
  }
  return 0;
}
function smooth(w: World, u: Unit): void {
  const p = u.path!;
  let n = 0;
  while (u.pi + 1 < p.length && n++ < 6 && lineClear(w, u, u.x, u.y, tcx(w, p[u.pi + 1]), tcy(w, p[u.pi + 1]), 650)) u.pi++;
}

function finish(u: Unit): void {
  u.orders.shift(); u.st = 0; u.work = 0; u.path = null; u.pkey = -1; u.dropB = 0; u.tgtU = 0; u.tgtB = 0;
  if (u.orders.length === 0) { u.homeX = u.x; u.homeY = u.y; }
}
export function clearOrders(u: Unit): void {
  u.orders = []; u.st = 0; u.work = 0; u.path = null; u.pkey = -1; u.dropB = 0; u.tgtU = 0; u.tgtB = 0; u.homeX = u.x; u.homeY = u.y;
}

// ---- gazdasági munka ----
function nearestDrop(w: World, u: Unit, r: number): Building | null {
  const key = (['e', 'f', 'k'] as const)[r];
  let best: Building | null = null, bd = 1e18;
  for (const b of w.buildings) {
    if (b.dead || !b.built || b.owner !== u.owner || !b.def.lerako.includes(key)) continue;
    const d = distB(u, b);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
export function findTile(w: World, cx: number, cy: number, maxR: number, pred: (i: number) => boolean): number {
  for (let r = 0; r <= maxR; r++) {
    let best = -1, bd = 1e9;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r || !inMap(w, x, y)) continue;
      const i = idx(w, x, y);
      if (!pred(i)) continue;
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) return best;
  }
  return -1;
}

function doGather(w: World, u: Unit, o: Order): boolean {
  const p = w.players[u.owner];
  const ri = o.sub === 'fa' ? 1 : o.sub === 'ko' ? 2 : 0;
  if (u.st === 1) {
    let b = w.bmap.get(u.dropB);
    if (!b || b.dead || !b.built) { b = nearestDrop(w, u, u.carryT) ?? undefined; if (!b) return true; u.dropB = b.id; }
    const a = approach(w, u, b.x, b.y, b.x + b.w - 1, b.y + b.h - 1, 900);
    if (a === 1) { p.res[u.carryT] += u.carry; u.carry = 0; u.st = 0; if (o.fin) return true; }
    else if (a === 2) return true;
    return false;
  }
  if (u.carryT !== ri) { u.carry = 0; u.carryT = ri; }
  if (u.carry >= CARRY_MAX) { u.st = 1; u.dropB = 0; return false; }
  const endOrDrop = (): boolean => { if (u.carry > 0) { o.fin = true; u.st = 1; u.dropB = 0; return false; } return true; };
  const gm = p.gatherMult;
  const take = (rate: number, avail: number): number => Math.max(0, Math.min(Math.floor(rate * gm / 1000), avail, CARRY_MAX - u.carry));
  const W = w.W;
  if (o.sub === 'fa' || o.sub === 'ko') {
    const wood = o.sub === 'fa';
    const ok = (i: number) => wood ? (w.base[i] === T.ERDO && w.wood[i] > 0) : (w.base[i] === T.KO && w.stone[i] > 0);
    let i = idx(w, o.x!, o.y!);
    if (!ok(i)) {
      i = findTile(w, o.x!, o.y!, wood ? 9 : 4, ok);
      if (i < 0) return endOrDrop();
      o.x = i % W; o.y = Math.floor(i / W);
    }
    const a = approach(w, u, o.x!, o.y!, o.x!, o.y!, 900);
    if (a === 2) return endOrDrop();
    if (a === 1) {
      face(u, o.x! * FP + 500, o.y! * FP + 500); u.anim = ANIM.MUNKA;
      if (wood) {
        const t = take(p.techs.has('fureszmalom') ? 300 : 250, w.wood[i]);
        u.carry += t; w.wood[i] -= t;
        if (w.wood[i] <= 0) { w.base[i] = T.RET; w.cur[i] = w.flood[i] ? T.MOCSAR : T.RET; w.terrainVer++; push(w, { t: 'tree', x: o.x!, y: o.y! }); }
      } else {
        const t = take(p.techs.has('ekcsakany') ? 190 : 150, w.stone[i]);
        u.carry += t; w.stone[i] -= t;
        if (w.stone[i] <= 0) { w.base[i] = T.RET; w.cur[i] = T.RET; w.terrainVer++; push(w, { t: 'tree', x: o.x!, y: o.y! }); }
      }
    }
    return false;
  }
  if (o.sub === 'hal') {
    const i = idx(w, o.x!, o.y!);
    if (w.base[i] !== T.FOLYO && w.base[i] !== T.GAZLO) return endOrDrop();
    const a = approach(w, u, o.x!, o.y!, o.x!, o.y!, 900);
    if (a === 2) return endOrDrop();
    if (a === 1) { face(u, o.x! * FP + 500, o.y! * FP + 500); u.anim = ANIM.MUNKA; u.carry += take(w.cur[i] === T.JEG ? 75 : 175, 1e9); }
    return false;
  }
  if (o.sub === 'vad') {
    let an = w.animals[o.a!];
    if (!an || an.food <= 0) {
      let bd = 14 * FP; an = undefined as any;
      for (const c of w.animals) { if (c.food <= 0) continue; const d = dist(u.x, u.y, c.x, c.y); if (d < bd) { bd = d; an = c; } }
      if (!an) return endOrDrop();
      o.a = an.id;
    }
    const tx = Math.floor(an.x / FP), ty = Math.floor(an.y / FP);
    const a = approach(w, u, tx, ty, tx, ty, 900);
    if (a === 2) return endOrDrop();
    if (a === 1) {
      face(u, an.x, an.y); u.anim = ANIM.MUNKA;
      if (!an.dead) { an.dead = true; an.moving = false; push(w, { t: 'snd', s: 'vad', x: an.x, y: an.y }); }
      const t = take(200, an.food); u.carry += t; an.food -= t;
    }
    return false;
  }
  // szántó: tavasszal vetés, ősszel aratás
  let b = w.bmap.get(o.b!);
  const s = season(w);
  const farmOk = (f: Building) => !f.dead && f.built && f.owner === u.owner && f.def.id === 'szanto'
    && ((s === 0 && f.farm === 0 && !w.flood[idx(w, f.x + 1, f.y + 1)]) || (s === 2 && f.farm === 2 && f.farmLeft > 0));
  if (!b || !farmOk(b)) {
    b = undefined; let bd = 14 * FP;
    for (const f of w.buildings) { if (!farmOk(f)) continue; const d = distB(u, f); if (d < bd) { bd = d; b = f; } }
    if (!b) return endOrDrop();
    o.b = b.id;
  }
  const a = approach(w, u, b.x, b.y, b.x + b.w - 1, b.y + b.h - 1, 0);
  if (a === 2) return endOrDrop();
  if (a === 1) {
    u.anim = ANIM.MUNKA;
    if (s === 0) {
      if (u.def.osztaly !== 'munkas') return true;
      if (++b.sow >= 20 * TICKS) { b.sow = 0; b.farm = 1; }
    } else {
      const t = take(u.def.osztaly === 'munkas' ? 1500 : 750, b.farmLeft);
      u.carry += t; b.farmLeft -= t;
      if (b.farmLeft <= 0) { b.farm = 0; b.farmLeft = 0; }
    }
  }
  return false;
}

function doBuild(w: World, u: Unit, o: Order): boolean {
  const b = w.bmap.get(o.b!);
  if (!b || b.dead || b.built) {
    // folytatás a legközelebbi félkész saját épületen, különben a lerakóhely szerinti gyűjtés
    let nb: Building | null = null, bd = 9 * FP;
    for (const c of w.buildings) { if (c.dead || c.built || c.owner !== u.owner) continue; const d = distB(u, c); if (d < bd) { bd = d; nb = c; } }
    if (nb) { o.b = nb.id; return false; }
    if (b && !b.dead && u.def.id === 'jobbagy' && u.orders.length === 1) {
      const cx = b.x, cy = b.y;
      if (b.def.id === 'fatelep') { const i = findTile(w, cx, cy, 8, t => w.base[t] === T.ERDO && w.wood[t] > 0); if (i >= 0) { u.orders.push({ k: 'gather', sub: 'fa', x: i % w.W, y: Math.floor(i / w.W) }); } }
      if (b.def.id === 'kobanya') { const i = findTile(w, cx, cy, 8, t => w.base[t] === T.KO && w.stone[t] > 0); if (i >= 0) { u.orders.push({ k: 'gather', sub: 'ko', x: i % w.W, y: Math.floor(i / w.W) }); } }
      if (b.def.id === 'szanto') u.orders.push({ k: 'gather', sub: 'farm', b: b.id });
    }
    return true;
  }
  const a = approach(w, u, b.x, b.y, b.x + b.w - 1, b.y + b.h - 1, 900);
  if (a === 2) return true;
  if (a === 1) {
    face(u, bcx(b), bcy(b)); u.anim = ANIM.MUNKA;
    b.nb++; if (u.def.id === 'hadmernok' && b.def.kat === 'ko') b.nbRate++;
  }
  return false;
}

function doRepair(w: World, u: Unit, o: Order): boolean {
  const b = w.bmap.get(o.b!);
  if (!b || b.dead || !b.built || b.hp >= b.def.hp * HPU) return true;
  const a = approach(w, u, b.x, b.y, b.x + b.w - 1, b.y + b.h - 1, 900);
  if (a === 2) return true;
  if (a === 1) {
    const p = w.players[u.owner];
    const gain = Math.min((u.def.id === 'hadmernok' ? 20 : 10) * HPU / TICKS, b.def.hp * HPU - b.hp);
    const cost = b.def.ar.map(c => Math.floor(c * RU * gain / (2 * b.def.hp * HPU)));
    for (let i = 0; i < 4; i++) if (p.res[i] < cost[i]) return true;
    for (let i = 0; i < 4; i++) p.res[i] -= cost[i];
    b.hp += gain; face(u, bcx(b), bcy(b)); u.anim = ANIM.MUNKA;
  }
  return false;
}

// ---- harc ----
function reach(u: Unit): number { return radius(u.def) + (u.def.tav === 1 ? 1200 : 500); }
function reloadTicks(w: World, u: Unit, melee: boolean): number {
  if (melee && u.def.kozelharc) return Math.round(u.def.kozelharc.ujr * TICKS);
  let t = Math.round(u.def.ujr * TICKS);
  if (u.def.osztaly === 'lovesz' && w.players[u.owner].techs.has('papirtolteny')) t = Math.round(t * 0.85);
  return t;
}

/** Egység támadása. 0: folyamatban, 1: a cél megszűnt / elérhetetlen. */
function engageUnit(w: World, u: Unit, t: Unit, mayMove: boolean): number {
  if (t.dead || t.inB || !hostileUU(w, u, t)) return 1;
  const d = dist(u.x, u.y, t.x, t.y) - radius(t.def);
  const def = u.def;
  const ranged = def.tav >= 2;
  if (ranged && !(def.kozelharc && d <= 1000)) {
    const range = def.tav * FP + (w.hgt[tileOf(w, u.x, u.y)] > w.hgt[tileOf(w, t.x, t.y)] ? FP : 0);
    if (d <= range) {
      if (d < def.minTav * FP) return mayMove ? 1 : 0;
      face(u, t.x, t.y);
      if (u.cd <= 0 && (def.osztaly !== 'ostrom' || deployed(w, u)) && u.immobile <= w.tick) {
        u.cd = reloadTicks(w, u, false); u.anim = ANIM.TAMAD; u.animT = w.tick;
        if (def.osztaly === 'ostrom') siegeFire(w, u, t.x, t.y, 0);
        else rangedShot(w, u.x, u.y, u.owner, Math.round(def.pontossag * 1000), range, def.tam, def.tipus, atkMults(w, u), t, u);
      }
      return 0;
    }
    if (!mayMove) return 0;
    const tx = Math.floor(t.x / FP), ty = Math.floor(t.y / FP);
    const a = approach(w, u, tx, ty, tx, ty, range - 300, 900000 + ((tx >> 1) * 97 + (ty >> 1)) * 131 + (t.uid & 127));
    return a === 2 ? 1 : 0;
  }
  const rc = reach(u);
  if (d <= rc) {
    face(u, t.x, t.y);
    if (u.cd <= 0) {
      const mel = ranged && !!def.kozelharc;
      u.cd = reloadTicks(w, u, mel); u.anim = ANIM.TAMAD; u.animT = w.tick;
      meleeHit(w, u, t, mel ? def.kozelharc!.tam : def.tam, mel ? 0 : def.tipus);
    }
    return 0;
  }
  if (!mayMove) return 0;
  if (d < 3000 && lineClear(w, u, u.x, u.y, t.x, t.y)) { u.path = null; u.pkey = -1; stepTo(w, u, t.x, t.y); return 0; }
  const tx = Math.floor(t.x / FP), ty = Math.floor(t.y / FP);
  const a = approach(w, u, tx, ty, tx, ty, rc, 500000 + ((tx >> 1) * 97 + (ty >> 1)) * 131 + (t.uid & 127));
  return a === 2 ? 1 : 0;
}

function engageBuilding(w: World, u: Unit, b: Building, mayMove: boolean): number {
  if (b.dead || !hostileUB(w, u, b)) return 1;
  const d = distB(u, b), def = u.def;
  const range = def.tav >= 2 ? def.tav * FP + (w.hgt[tileOf(w, u.x, u.y)] ? FP : 0) : reach(u) - radius(def) + 300;
  if (d <= range) {
    if (d < def.minTav * FP) return mayMove ? 1 : 0;
    face(u, bcx(b), bcy(b));
    if (u.cd <= 0 && (def.osztaly !== 'ostrom' || deployed(w, u)) && u.immobile <= w.tick) {
      u.cd = reloadTicks(w, u, false); u.anim = ANIM.TAMAD; u.animT = w.tick;
      if (def.osztaly === 'ostrom') {
        const px = Math.max(b.x * FP + 300, Math.min((b.x + b.w) * FP - 300, u.x)), py = Math.max(b.y * FP + 300, Math.min((b.y + b.h) * FP - 300, u.y));
        siegeFire(w, u, px, py, b.id);
      } else {
        if (def.tav >= 2) push(w, { t: 'shot', x: u.x, y: u.y, tx: bcx(b), ty: bcy(b), hit: true, big: false });
        strikeBuilding(w, u, b, def.tam, def.tipus);
      }
    }
    return 0;
  }
  if (!mayMove) return 0;
  const a = approach(w, u, b.x, b.y, b.x + b.w - 1, b.y + b.h - 1, range - 200);
  return a === 2 ? 1 : 0;
}

/** Automatikus célválasztás (9.11). */
function acquire(w: World, u: Unit): void {
  u.scanAt = w.tick + 8 + (u.uid & 3);
  u.tgtU = 0; u.tgtB = 0;
  const def = u.def;
  if (u.lazado > 0) {
    let bd = 1e18, bb = 0;
    for (const b of w.buildings) { if (b.dead || b.owner !== u.owner) continue; const d = distB(u, b); if (d < bd) { bd = d; bb = b.id; } }
    u.tgtB = bb; return;
  }
  const atkR = def.tav >= 2 ? def.tav + 1 : 2;
  const R = u.allas === ALLAS.HELYTALLO ? atkR : Math.max(def.latas, atkR);
  let best: Unit | null = null, bs = 1e18;
  const siege = def.osztaly === 'ostrom';
  forUnitsNear(w, u.x, u.y, R, t => {
    if (!hostileUU(w, u, t) || t.inB) return;
    const d = dist(u.x, u.y, t.x, t.y);
    if (d > R * FP || d < def.minTav * FP) return;
    if (t.lazado === 0 && !canSeeUnit(w, u.owner, t)) return;
    let pr = isMilitary(t.def) ? 2 : 3;
    if (def.bonusz[t.def.osztaly]) pr = 1;
    if (t.uid === u.lastAtkBy && w.tick - u.lastHit < 100) pr = 0;
    if (siege && pr > 0) pr += 3;
    const sc = pr * 1e9 + d;
    if (sc < bs) { bs = sc; best = t; }
  });
  let bb: Building | null = null, bbd = 1e18;
  if (!best || siege) {
    const vis = w.players[u.owner].vis;
    for (const b of w.buildings) {
      if (b.dead || !hostileUB(w, u, b)) continue;
      const d = distB(u, b);
      if (d > R * FP || d >= bbd) continue;
      if (vis[idx(w, b.x, b.y)] === 0) continue;
      bbd = d; bb = b;
    }
  }
  if (siege && bb) { u.tgtB = (bb as Building).id; return; }
  if (best) u.tgtU = (best as Unit).uid; else if (bb) u.tgtB = (bb as Building).id;
}

/** Automatikus harc tétlenül / támadó mozgás közben. true: éppen harcol. */
function autoFight(w: World, u: Unit, leash: boolean): boolean {
  if (u.allas === ALLAS.TARTOZKODO && u.lazado === 0) return false;
  if (w.tick >= u.scanAt || (u.tgtU === 0 && u.tgtB === 0 && w.tick - u.lastHit < 3)) acquire(w, u);
  const mayMove = u.allas !== ALLAS.HELYTALLO || u.lazado > 0;
  if (u.tgtU) {
    const t = w.umap.get(u.tgtU);
    if (!t || engageUnit(w, u, t, mayMove) === 1) { u.tgtU = 0; u.scanAt = 0; return false; }
    if (leash && u.allas === ALLAS.VEDEKEZO && dist(u.x, u.y, u.homeX, u.homeY) > (4 + Math.max(0, u.def.tav)) * FP) {
      u.tgtU = 0; u.scanAt = w.tick + 40;
      u.orders.unshift({ k: 'move', x: u.homeX, y: u.homeY, auto: true });
      return false;
    }
    return true;
  }
  if (u.tgtB) {
    const b = w.bmap.get(u.tgtB);
    if (!b || engageBuilding(w, u, b, mayMove) === 1) { u.tgtB = 0; u.scanAt = 0; return false; }
    if (leash && u.allas === ALLAS.VEDEKEZO && u.lazado === 0 && dist(u.x, u.y, u.homeX, u.homeY) > (4 + Math.max(0, u.def.tav)) * FP) {
      u.tgtB = 0; u.scanAt = w.tick + 40;
      u.orders.unshift({ k: 'move', x: u.homeX, y: u.homeY, auto: true });
      return false;
    }
    return true;
  }
  return false;
}

function doMove(w: World, u: Unit, o: Order): boolean {
  const tx = Math.floor(o.x! / FP), ty = Math.floor(o.y! / FP);
  if (tileOf(w, u.x, u.y) === idx(w, tx, ty)) {
    const r = stepTo(w, u, o.x!, o.y!);
    return r !== 0;
  }
  const a = approach(w, u, tx, ty, tx, ty, 0);
  return a === 2;
}

export function updateUnit(w: World, u: Unit): void {
  if (u.dead || u.inB) return;
  if (u.cd > 0) u.cd--;
  u.anim = ANIM.ALL;
  if (u.immobile > w.tick && u.def.osztaly === 'ostrom' && u.def.tav < 2) return;

  if (u.rout > 0) {
    u.rout--;
    const c = castleOf(w, u.owner);
    if (c) approach(w, u, c.x, c.y, c.x + c.w - 1, c.y + c.h - 1, 1500);
    if (u.rout === 0) { u.moral = 35 * HPU; clearOrders(u); }
    return;
  }
  if (u.lazado > 0) { autoFight(w, u, false); return; }

  const o = u.orders[0];
  if (!o) {
    if (isMilitary(u.def)) autoFight(w, u, true);
    else if (u.def.osztaly === 'munkas' && w.tick - u.lastHit < 40 && u.lastAtkBy) {
      // a megtámadott munkás elhátrál a vár felé
      const c = castleOf(w, u.owner);
      if (c && distB(u, c) > 3 * FP) u.orders.push({ k: 'move', x: c.rallyX > 0 ? c.rallyX : bcx(c), y: c.rallyY > 0 ? c.rallyY : bcy(c), auto: true });
    }
    return;
  }
  let done = false;
  switch (o.k) {
    case 'move': done = doMove(w, u, o); break;
    case 'amove':
      if (!autoFight(w, u, false)) done = doMove(w, u, o);
      break;
    case 'patrol':
      if (!autoFight(w, u, false) && doMove(w, u, o)) { const x = o.x!, y = o.y!; o.x = o.x0; o.y = o.y0; o.x0 = x; o.y0 = y; }
      break;
    case 'attack': {
      if (o.u) {
        const t = w.umap.get(o.u);
        done = !t || (t.lazado === 0 && !canSeeUnit(w, u.owner, t)) || engageUnit(w, u, t, true) === 1;
      } else {
        const b = w.bmap.get(o.b!);
        done = !b || engageBuilding(w, u, b, true) === 1;
      }
      break;
    }
    case 'gather': done = doGather(w, u, o); break;
    case 'build': done = doBuild(w, u, o); break;
    case 'repair': done = doRepair(w, u, o); break;
    case 'douse': {
      const b = w.bmap.get(o.b!);
      if (!b || b.dead || b.fire <= 0) { done = true; break; }
      const a = approach(w, u, b.x, b.y, b.x + b.w - 1, b.y + b.h - 1, 900);
      if (a === 2) done = true;
      else if (a === 1) { u.anim = ANIM.MUNKA; face(u, bcx(b), bcy(b)); if (++u.work >= 5 * TICKS) { b.fire = 0; b.fireCont = 0; done = true; } }
      break;
    }
    case 'garrison': {
      const b = w.bmap.get(o.b!);
      if (!b || b.dead || !b.built || b.gar.length >= b.def.helyorseg || w.players[b.owner].team !== w.players[u.owner].team) { done = true; break; }
      const a = approach(w, u, b.x, b.y, b.x + b.w - 1, b.y + b.h - 1, 900);
      if (a === 2) done = true;
      else if (a === 1) { u.inB = b.id; b.gar.push(u.uid); clearOrders(u); return; }
      break;
    }
    case 'burn': {
      const v = w.villages[o.v!];
      if (!v || v.burnt > w.tick || v.owner === u.owner || !u.def.j.has('portya')) { done = true; break; }
      const a = approach(w, u, v.x - 1, v.y - 1, v.x + 1, v.y + 1, 900);
      if (a === 2) done = true;
      else if (a === 1) {
        u.anim = ANIM.TAMAD; if (u.work % 20 === 0) u.animT = w.tick;
        face(u, v.x * FP + 500, v.y * FP + 500);
        if (++u.work >= 10 * TICKS) {
          addLoot(w, u.owner, 30); w.players[u.owner].res[0] += 60 * RU;
          v.burnt = w.tick + 480 * TICKS; v.burnBy = u.owner; done = true;
          chron(w, u.owner, 'Felégettünk egy falut: zsákmány a kincstárban.');
          if (v.owner >= 0) alert(w, v.owner, 'falu', v.x * FP, v.y * FP, 'Felégették egy falunkat!');
        }
      }
      break;
    }
    case 'mine': {
      const b = w.bmap.get(o.b!);
      if (!b || b.dead || !u.def.j.has('aknasz')) { done = true; break; }
      const a = approach(w, u, b.x, b.y, b.x + b.w - 1, b.y + b.h - 1, 900);
      if (a === 2) { done = true; break; }
      if (a === 1) {
        const ti = tileOf(w, u.x, u.y);
        if (w.cur[ti] === T.MOCSAR || w.flood[ti]) { done = true; break; }
        if (w.tick - u.lastHit <= 1) u.work = 0;
        u.anim = ANIM.MUNKA; face(u, bcx(b), bcy(b)); b.mineBy = w.tick;
        if (++u.work >= (season(w) === 3 ? 80 : 40) * TICKS) {
          push(w, { t: 'boom', x: bcx(b), y: bcy(b), water: false });
          const near: Building[] = [];
          for (const c of w.buildings) if (!c.dead && c !== b && c.def.fal && c.owner === b.owner
            && c.x <= b.x + b.w && c.x + c.w >= b.x && c.y <= b.y + b.h && c.y + c.h >= b.y) near.push(c);
          hurtBuilding(w, b, 600, u, false);
          for (const c of near.slice(0, 2)) hurtBuilding(w, c, 300, u, false);
          done = true;
        }
      }
      break;
    }
    case 'raid': {
      const b = w.bmap.get(o.b!);
      if (!b || b.dead || !u.def.j.has('portya') || u.cattle >= 2) { done = true; break; }
      const ready = b.cattle.filter(c => c >= 180 * TICKS).length;
      if (ready === 0) { done = true; break; }
      const a = approach(w, u, b.x, b.y, b.x + b.w - 1, b.y + b.h - 1, 900);
      if (a === 2) done = true;
      else if (a === 1 && ++u.work >= 5 * TICKS) {
        let n = Math.min(2 - u.cattle, ready);
        b.cattle = b.cattle.filter(c => !(c >= 180 * TICKS && n-- > 0));
        u.cattle = Math.min(2, u.cattle + Math.min(2, ready));
        alert(w, b.owner, 'marha', bcx(b), bcy(b), 'Elhajtották a marháinkat!');
        const c = castleOf(w, u.owner);
        done = true;
        if (c) u.orders.push({ k: 'move', x: c.rallyX > 0 ? c.rallyX : bcx(c), y: c.rallyY > 0 ? c.rallyY : bcy(c) });
      }
      break;
    }
    default: done = true;
  }
  if (done) finish(u);
}

/** Lágy ütközés: a katonai egységek széttolják egymást (ütközési sugár 0,3; ostrom 0,6). */
export function separate(w: World): void {
  const W = w.W, H = w.H;
  for (let n = 0; n < w.units.length; n++) {
    const u = w.units[n];
    if (u.dead || u.inB || u.def.osztaly === 'munkas' || u.def.osztaly === 'hajo') continue;
    const tx = Math.floor(u.x / FP), ty = Math.floor(u.y / FP), ru = radius(u.def);
    for (let y = Math.max(0, ty - 1); y <= Math.min(H - 1, ty + 1); y++) for (let x = Math.max(0, tx - 1); x <= Math.min(W - 1, tx + 1); x++) {
      for (let m = w.gHead[y * W + x]; m >= 0; m = w.gNext[m]) {
        if (m <= n) continue;
        const o = w.units[m];
        if (!o || o.dead || o.inB || o.def.osztaly === 'munkas' || o.def.osztaly === 'hajo') continue;
        let dx = o.x - u.x, dy = o.y - u.y;
        const rs = ru + radius(o.def);
        if (Math.abs(dx) >= rs || Math.abs(dy) >= rs) continue;
        let d = isqrt(dx * dx + dy * dy);
        if (d >= rs) continue;
        if (d === 0) { dx = ((u.uid * 37 + o.uid * 11) % 21) - 10 || 1; dy = ((u.uid * 13 + o.uid * 29) % 21) - 10; d = isqrt(dx * dx + dy * dy) || 1; }
        const p = Math.min(40, ((rs - d) >> 1) + 1);
        const px = (dx * p / d) | 0, py = (dy * p / d) | 0;
        nudge(w, o, px, py); nudge(w, u, -px, -py);
      }
    }
  }
}
function nudge(w: World, u: Unit, px: number, py: number): void {
  if (u.immobile > w.tick) return;
  const nx = Math.max(10, Math.min(w.W * FP - 10, u.x + px)), ny = Math.max(10, Math.min(w.H * FP - 10, u.y + py));
  const ni = tileOf(w, nx, ny);
  if (ni !== tileOf(w, u.x, u.y) && passU(w, ni, u) === 0) return;
  u.x = nx; u.y = ny;
}

export { effMoral, pay, recountPop, alert, BUILDINGS, killBuilding };
