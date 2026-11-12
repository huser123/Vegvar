// Játékos- és gépi parancsok alkalmazása (a tick 1. lépése).
import { UNITS, BUILDINGS, TECHS, RANKS, TICKS, CSASZARI, OSZMAN, unitsTrainedAt, techsAt, type Res } from './data';
import { FP, RU, ALAKZAT, type World, type Cmd, type Unit, type Order, type Building } from './types';
import { isqrt } from './rules';
import { canAfford, pay, canPlace, canBuildDef, placeCost, addBuilding, recountPop, hasBuilding, season, szpahiLimit, freeTileAround,
  moveClass, idx, tileOf, isMilitary, chron, bcx, bcy } from './world';
import { clearOrders } from './units';
import { killBuilding } from './combat';
import { payLate, spawnFrom } from './systems';

export const SELL_BASE = [20, 25, 40], BUY_BASE = [35, 40, 60];
export function sellPrice(w: World, p: number, r: number): number {
  return Math.floor(SELL_BASE[r] * w.players[p].sell[r] * (season(w) === 2 ? 1500 : 1000) / 1000000);
}
export function buyPrice(w: World, p: number, r: number): number { return Math.ceil(BUY_BASE[r] * w.players[p].buy[r] / 1000); }
export function recruitCost(id: string): number { return UNITS[id].ar[3] * 2 + 40; }

function usable(w: World, p: number, uids: number[]): Unit[] {
  const out: Unit[] = [];
  for (const id of uids) { const u = w.umap.get(id); if (u && !u.dead && u.owner === p && !u.inB && u.rout === 0 && u.lazado === 0) out.push(u); }
  return out;
}

/** Alakzat szerinti célhelyek egy mozgásparancshoz. */
function slots(w: World, us: Unit[], tx: number, ty: number): { x: number; y: number }[] {
  const n = us.length;
  let cx = 0, cy = 0;
  for (const u of us) { cx += u.x; cy += u.y; }
  cx = Math.floor(cx / n); cy = Math.floor(cy / n);
  let dx = tx - cx, dy = ty - cy;
  const d = isqrt(dx * dx + dy * dy) || 1;
  dx = (dx * 1000 / d) | 0; dy = (dy * 1000 / d) | 0;
  if (dx === 0 && dy === 0) dx = 1000;
  const px = -dy, py = dx;
  const f = us[0].alakzat;
  const big = us.some(u => u.def.osztaly === 'ostrom');
  const out: { x: number; y: number }[] = [];
  const cl = (v: number, m: number) => Math.max(600, Math.min(m * FP - 600, v));
  for (let k = 0; k < n; k++) {
    let a = 0, b = 0; // a: oldalirány, b: hátrafelé (FP)
    if (f === ALAKZAT.VONAL) { const wd = Math.min(n, 10); a = ((k % wd) - (wd - 1) / 2) * 800; b = Math.floor(k / wd) * 900; }
    else if (f === ALAKZAT.EK) { const r = Math.ceil(k / 2); a = (k % 2 ? 1 : -1) * r * 750; b = r * 850; }
    else { const sp = f === ALAKZAT.LAZA ? 1800 : big ? 1500 : 850; const wd = Math.ceil(Math.sqrt(n)); a = ((k % wd) - (wd - 1) / 2) * sp; b = (Math.floor(k / wd) - (Math.ceil(n / wd) - 1) / 2) * sp; }
    out.push({ x: cl(Math.round(tx + (px * a - dx * b) / 1000), w.W), y: cl(Math.round(ty + (py * a - dy * b) / 1000), w.H) });
  }
  return out;
}

function validFor(u: Unit, o: Order): boolean {
  const cls = u.def.osztaly;
  switch (o.k) {
    case 'gather': return cls === 'munkas' ? u.def.id === 'jobbagy' : (o.sub === 'farm' && u.def.j.has('hazai'));
    case 'build': case 'repair': case 'douse': return cls === 'munkas';
    case 'burn': case 'raid': return u.def.j.has('portya');
    case 'mine': return u.def.j.has('aknasz');
    case 'attack': case 'amove': case 'patrol': return true;
    default: return true;
  }
}

export function applyCmd(w: World, c: Cmd): void {
  const p = w.players[c.p];
  if (!p || !p.alive) return;
  switch (c.c) {
    case 'order': {
      let us = usable(w, c.p, c.uids).filter(u => validFor(u, c.o));
      if (!us.length) return;
      const pos = c.o.k === 'move' || c.o.k === 'amove' || c.o.k === 'patrol';
      let sl: { x: number; y: number }[] | null = null, spd = 0;
      if (pos) {
        us.sort((a, b) => a.uid - b.uid);
        if (us.length > 1) sl = slots(w, us, c.o.x!, c.o.y!);
        if (us[0].alakzat !== ALAKZAT.NINCS) spd = Math.min(...us.map(u => Math.round(u.def.seb * 1000)));
      }
      us.forEach((u, i) => {
        const o: Order = { ...c.o };
        if (sl) { o.x = sl[i].x; o.y = sl[i].y; }
        if (spd) o.spd = spd;
        if (o.k === 'patrol') { o.x0 = u.x; o.y0 = u.y; }
        if (!c.q) clearOrders(u);
        if (u.orders.length < 8) u.orders.push(o);
        if (u.def.osztaly === 'munkas' && u.orders.length === 1) { u.st = 0; u.work = 0; }
      });
      break;
    }
    case 'stop': for (const u of usable(w, c.p, c.uids)) clearOrders(u); break;
    case 'train': {
      const b = w.bmap.get(c.b), d = UNITS[c.id];
      if (!b || b.dead || !b.built || b.owner !== c.p || !d || b.queue.length >= 5) return;
      if (!unitsTrainedAt(b.def.id, p.faction).includes(d) || p.rank < d.rang) return;
      if (!canAfford(p, d.ar) || p.pop + d.nep > p.cap) return;
      if (d.id === 'szpahi') {
        let n = 0;
        for (const u of w.units) if (!u.dead && u.owner === c.p && u.def.id === 'szpahi') n++;
        for (const o of w.buildings) if (!o.dead && o.owner === c.p) for (const q of o.queue) if (q.id === 'szpahi') n++;
        if (n >= szpahiLimit(w, c.p)) return;
      }
      pay(p, d.ar); b.queue.push({ k: 'u', id: d.id }); recountPop(w);
      break;
    }
    case 'research': {
      const b = w.bmap.get(c.b), t = TECHS[c.id];
      if (!b || b.dead || !b.built || b.owner !== c.p || !t || b.queue.length >= 5) return;
      if (!techsAt(b.def.id, p.faction).includes(t) || p.rank < t.rang || p.techs.has(t.id) || !canAfford(p, t.ar)) return;
      for (const o of w.buildings) if (!o.dead && o.owner === c.p && o.queue.some(q => q.k === 't' && q.id === t.id)) return;
      pay(p, t.ar); b.queue.push({ k: 't', id: t.id });
      break;
    }
    case 'rank': {
      const b = w.bmap.get(c.b), r = RANKS[p.rank + 1];
      if (!b || b.dead || b.owner !== c.p || b.def.id !== 'var' || !r || b.queue.length >= 5) return;
      if (b.queue.some(q => q.k === 'r') || !r.kell.every(k => hasBuilding(w, c.p, k)) || !canAfford(p, r.ar)) return;
      pay(p, r.ar); b.queue.push({ k: 'r', id: 'rang' });
      break;
    }
    case 'cancel': {
      const b = w.bmap.get(c.b);
      if (!b || b.dead || b.owner !== c.p) return;
      const q = b.queue[c.i];
      if (!q) return;
      const cost: Res = q.k === 'u' ? UNITS[q.id].ar : q.k === 't' ? TECHS[q.id].ar : RANKS[p.rank + 1]!.ar;
      pay(p, cost, -1); b.queue.splice(c.i, 1);
      if (c.i === 0) b.qprog = 0;
      recountPop(w);
      break;
    }
    case 'place': {
      const d = BUILDINGS[c.id];
      if (!d || d.id === 'var' || !canBuildDef(w, d, c.p)) return;
      const cost = placeCost(w, d, c.p);
      const us = usable(w, c.p, c.uids).filter(u => u.def.osztaly === 'munkas');
      if (!canAfford(p, cost) || !canPlace(w, d, c.p, c.x, c.y, c.rot)) return;
      pay(p, cost);
      const b = addBuilding(w, d, c.p, c.x, c.y, c.rot, false);
      if (!d.jarhato) ejectUnits(w, b);
      for (const u of us) { if (!c.q) clearOrders(u); u.orders.push({ k: 'build', b: b.id }); }
      break;
    }
    case 'demolish': {
      const b = w.bmap.get(c.b);
      if (!b || b.dead || b.owner !== c.p || b.def.id === 'var') return;
      const cost = placeCost(w, b.def, c.p);
      for (let i = 0; i < 4; i++) p.res[i] += Math.floor(cost[i] * RU / 2);
      killBuilding(w, b, null);
      break;
    }
    case 'stance': for (const u of usable(w, c.p, c.uids)) if (isMilitary(u.def)) { u.allas = c.s; u.homeX = u.x; u.homeY = u.y; } break;
    case 'formation': for (const u of usable(w, c.p, c.uids)) {
      if (!isMilitary(u.def) || u.def.osztaly === 'ostrom' || u.def.osztaly === 'hajo') continue;
      if (c.f === ALAKZAT.EK && u.def.osztaly !== 'lovas') continue;
      u.alakzat = u.alakzat === c.f ? ALAKZAT.NINCS : c.f;
    } break;
    case 'portya': {
      const us = usable(w, c.p, c.uids).filter(u => u.def.j.has('portya'));
      const on = !us.every(u => u.portya);
      for (const u of us) u.portya = on;
      break;
    }
    case 'trade': {
      if (!hasBuilding(w, c.p, 'vasarter') || c.r < 0 || c.r > 2) return;
      if (c.buy) {
        const pr = buyPrice(w, c.p, c.r);
        if (p.res[3] < pr * RU) return;
        p.res[3] -= pr * RU; p.res[c.r] += 100 * RU;
      } else {
        if (p.res[c.r] < 100 * RU) return;
        p.res[c.r] -= 100 * RU; p.res[3] += sellPrice(w, c.p, c.r) * RU;
      }
      p.sell[c.r] = Math.floor(p.sell[c.r] * 97 / 100); p.buy[c.r] = Math.floor(p.buy[c.r] * 103 / 100);
      break;
    }
    case 'cattle': {
      const b = w.bmap.get(c.b);
      if (!b || b.dead || !b.built || b.owner !== c.p || b.def.id !== 'karam') return;
      const ri = b.cattle.findIndex(x => x >= 180 * TICKS);
      if (c.act === 'add') { if (b.cattle.length >= 4 || p.res[0] < 50 * RU) return; p.res[0] -= 50 * RU; b.cattle.push(0); }
      else if (ri >= 0 && c.act === 'kill') { b.cattle.splice(ri, 1); p.res[0] += 100 * RU; }
      else if (ri >= 0 && c.act === 'sell' && hasBuilding(w, c.p, 'vasarter')) { b.cattle.splice(ri, 1); p.res[3] += (season(w) === 2 ? 30 : 20) * RU; }
      break;
    }
    case 'ungarrison': {
      const b = w.bmap.get(c.b);
      if (!b || b.dead || b.owner !== c.p) return;
      for (const uid of b.gar) {
        const u = w.umap.get(uid);
        if (!u || u.dead) continue;
        const t = freeTileAround(w, b.x, b.y, b.x + b.w - 1, b.y + b.h - 1, moveClass(u.def), u.def.j.has('nehez'), p.team, b.rallyX, b.rallyY);
        u.inB = 0;
        if (t >= 0) { u.x = (t % w.W) * FP + 500 + ((u.uid % 5) - 2) * 120; u.y = Math.floor(t / w.W) * FP + 500 + ((u.uid % 3) - 1) * 150; }
        u.homeX = u.x; u.homeY = u.y;
      }
      b.gar = [];
      break;
    }
    case 'rally': { const b = w.bmap.get(c.b); if (b && !b.dead && b.owner === c.p) { b.rallyX = c.x; b.rallyY = c.y; } break; }
    case 'paylate': payLate(w, p); break;
    case 'recruit': {
      const b = w.bmap.get(c.b), d = UNITS[c.id];
      if (!b || b.dead || !b.built || b.owner !== c.p || b.def.id !== 'toborzo' || !d) return;
      if (p.faction !== CSASZARI || d.frakcio !== CSASZARI || !isMilitary(d) || p.rank < d.rang) return;
      if ((b.recruitCd[d.id] ?? 0) > w.tick || p.pop + d.nep > p.cap) return;
      const z = recruitCost(d.id);
      if (p.res[3] < z * RU) return;
      if (spawnFrom(w, b, d)) { p.res[3] -= z * RU; b.recruitCd[d.id] = w.tick + 5 * TICKS; recountPop(w); }
      break;
    }
  }
}

function ejectUnits(w: World, b: Building): void {
  for (const u of w.units) {
    if (u.dead || u.inB) continue;
    const tx = Math.floor(u.x / FP), ty = Math.floor(u.y / FP);
    if (tx < b.x || ty < b.y || tx >= b.x + b.w || ty >= b.y + b.h) continue;
    const t = freeTileAround(w, b.x, b.y, b.x + b.w - 1, b.y + b.h - 1, moveClass(u.def), u.def.j.has('nehez'), w.players[u.owner].team, u.x, u.y);
    if (t >= 0) { u.x = (t % w.W) * FP + 500; u.y = Math.floor(t / w.W) * FP + 500; u.path = null; u.pkey = -1; }
  }
}

export { OSZMAN, idx, tileOf, chron, bcx, bcy };
