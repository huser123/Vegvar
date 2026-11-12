// A tick lépései a 17. fejezet sorrendjében: évszak-óra, gazdaság, gyártás, épületharc, tűz/fagy/éhínség,
// morál és hűség, látás, győzelem.
import { T, TICKS, UNITS, BUILDINGS, TECHS, RANKS, PAYDAY, OSZMAN, VEGVARI, CSASZARI, LOVO, FACTION_NAME, SEASON_NAME, type UnitDef } from './data';
import { FP, HPU, RU, ALAKZAT, type World, type Unit, type Building, type Player } from './types';
import { floodLevel, farmYield, allocatePay } from './rules';
import { YT, tickInYear, yearOf, season, tEv, rand, randInt, idx, inMap, tileOf, dist, distB, bcx, bcy, push, chron, alert, castleOf,
  spawnUnit, freeTileAround, moveClass, recountPop, isMilitary, hostileUU, canSeeUnit, forUnitsNear, hasBuilding, szpahiLimit, teamOf, passU } from './world';
import { killUnit, killBuilding, hurtBuilding, hurtUnit, rangedShot, launch, explode, effMoral, addLoot } from './combat';
import { clearOrders } from './units';

// ---------- 2. évszak-óra ----------
export function seasonClock(w: World): void {
  const ty = tickInYear(w), yr = yearOf(w), t = ty / TICKS;
  if (ty % (120 * TICKS) === 0) {
    const s = season(w);
    push(w, { t: 'season', s });
    for (const p of w.players) {
      if (!p.alive) continue;
      chron(w, p.id, `${yr}. év, ${SEASON_NAME[s].toLowerCase()} kezdete.`);
      // Császári hadisegély: +30 Z bástyánként, legfeljebb 3 után
      if (p.faction === CSASZARI && w.tick > 0) {
        let n = 0;
        for (const b of w.buildings) if (!b.dead && b.built && b.owner === p.id && b.def.id === 'bastya') n++;
        if (n > 0) { p.res[3] += Math.min(3, n) * 30 * RU; chron(w, p.id, `Hadisegély érkezett: ${Math.min(3, n) * 30} zsold.`); }
      }
      // Oszmán kincstári zsold tavasszal (a 2. évtől)
      if (p.faction === OSZMAN && s === 0 && w.tick > 0) {
        const z = 60 + 20 * (p.rank - 1);
        p.res[3] += z * RU; chron(w, p.id, `Megjött a kincstári zsold: ${z}.`);
      }
    }
    if (s === 1) for (const b of w.buildings) { /* nyár: nincs teendő */ }
    if (s === 2) {
      // t_ev = 240: a vetés beérik
      for (const b of w.buildings) if (!b.dead && b.def.id === 'szanto' && b.farm === 1) {
        const p = w.players[b.owner];
        const cx = b.x + 1, cy = b.y + 1;
        let malom = false;
        for (const m of w.buildings) if (!m.dead && m.built && m.owner === b.owner && m.def.id === 'malom' && distB({ x: cx * FP + 500, y: cy * FP + 500 }, m) <= 6 * FP) malom = true;
        b.farm = 2; b.farmLeft = farmYield(w.rdist[idx(w, cx, cy)] <= 3, malom, p.techs.has('vasalt_eke')) * RU;
      }
      for (const p of w.players) if (p.alive) chron(w, p.id, 'Beérett a gabona. Aratni kell, mielőtt beáll a tél.');
    }
    if (s === 3) {
      let lost = false;
      for (const b of w.buildings) if (!b.dead && b.def.id === 'szanto' && b.farm !== 0) { if (b.farm === 2) lost = true; b.farm = 0; b.farmLeft = 0; b.sow = 0; }
      if (lost) for (const p of w.players) if (p.alive) chron(w, p.id, 'A lábon maradt termés odaveszett.');
    }
  }
  // Áradás
  const lvl = floodLevel(yr, ty);
  if (lvl !== w.floodLevel) { w.floodLevel = lvl; applyFlood(w); }
  if (yr >= 2 && ty === 0) for (const p of w.players) alert(w, p.id, 'aradas', -1, -1, 'Árad a folyó! Az ártér víz alá kerül.');
  if (yr >= 1 && ty === YT - 10 * TICKS) for (const p of w.players) alert(w, p.id, 'aradas', -1, -1, 'Áradás 10 másodperc múlva!');
  // Jég
  if (t === 380 && !w.ice) setIce(w, true);
  if (t === 450) for (const p of w.players) alert(w, p.id, 'jeg', -1, -1, 'Olvad a jég! 20 másodperc múlva beszakad.');
  if (t === 470 && w.ice) {
    setIce(w, false);
    for (const u of w.units) if (!u.dead && !u.inB && u.def.osztaly !== 'hajo') {
      const c = w.cur[tileOf(w, u.x, u.y)];
      if (c === T.FOLYO) { push(w, { t: 'boom', x: u.x, y: u.y, water: true }); killUnit(w, u, null); }
    }
  }
  // Fizetőnap
  if (t === PAYDAY - 30) for (const p of w.players) alert(w, p.id, 'zsold', -1, -1, 'Fizetőnap 30 másodperc múlva!');
  if (ty === PAYDAY * TICKS) payday(w);
  for (const p of w.players) if (p.lateUntil === w.tick && p.lateUntil > 0) lateConsequences(w, p);
}

function applyFlood(w: World): void {
  const lvl = w.floodLevel, N = w.W * w.H;
  for (let i = 0; i < N; i++) {
    const b = w.base[i];
    const fl = lvl > 0 && w.hgt[i] === 0 && w.rdist[i] <= lvl && (b === T.RET || b === T.UT || b === T.GAZLO) ? 1 : 0;
    if (fl !== w.flood[i]) {
      w.flood[i] = fl;
      w.cur[i] = fl ? (b === T.GAZLO ? T.FOLYO : T.MOCSAR) : b;
    }
  }
  w.terrainVer++; push(w, { t: 'terrain' });
}
function setIce(w: World, on: boolean): void {
  w.ice = on;
  const N = w.W * w.H;
  for (let i = 0; i < N; i++) if (w.base[i] === T.FOLYO && !w.flood[i]) w.cur[i] = on ? T.JEG : T.FOLYO;
  w.terrainVer++; push(w, { t: 'terrain' });
  for (const p of w.players) chron(w, p.id, on ? 'Befagyott a folyó: a jégen át lehet kelni.' : 'Beszakadt a jég.');
}

// ---------- fizetőnap (5.1, 5.2) ----------
function payday(w: World): void {
  for (const p of w.players) {
    if (!p.alive) continue;
    let tax = 0, food = 0, serf = 0;
    for (const v of w.villages) if (v.owner === p.id && v.burnt <= w.tick) { tax += 15; food += 40; }
    for (const u of w.units) if (!u.dead && u.owner === p.id && u.def.id === 'jobbagy') serf++;
    p.res[3] += (tax + serf) * RU; p.res[0] += food * RU;
    const army = w.units.filter(u => !u.dead && u.owner === p.id && u.lazado === 0 && u.def.zsold > 0);
    const z = Math.floor(p.res[3] / RU);
    const r = allocatePay(army.map(u => ({ uid: u.uid, zsold: u.def.zsold, u })), z);
    let spent = 0;
    for (const a of r.paid) { a.u.pay = 0; a.u.unpaid = false; if (a.u.immobile > w.tick && a.u.def.osztaly === 'ostrom') a.u.immobile = 0; spent += a.zsold; }
    for (const a of r.unpaid) a.u.unpaid = true;
    p.res[3] -= spent * RU;
    // tímár: a szpáhik kerete
    if (p.faction === OSZMAN) {
      const lim = szpahiLimit(w, p.id);
      const sz = w.units.filter(u => !u.dead && u.owner === p.id && u.def.id === 'szpahi');
      for (let i = lim; i < sz.length; i++) killUnit(w, sz[i], null, true);
      if (sz.length > lim) chron(w, p.id, `${sz.length - lim} szpáhi tímár híján hazatért.`);
    }
    chron(w, p.id, `Fizetőnap: adó ${tax + serf} zsold, ${food} élelem; kifizetve ${spent} zsold.`);
    if (r.unpaid.length > 0) {
      p.lateUntil = w.tick + 30 * TICKS;
      alert(w, p.id, 'zsold', -1, -1, `${r.unpaid.length} egység zsold nélkül maradt! 30 másodperc az utófizetésre.`);
    } else p.lateUntil = 0;
  }
  recountPop(w);
}

export function payLate(w: World, p: Player): void {
  if (w.tick >= p.lateUntil) return;
  const list = w.units.filter(u => !u.dead && u.owner === p.id && u.unpaid).sort((a, b) => a.def.zsold - b.def.zsold || a.uid - b.uid);
  for (const u of list) {
    const cost = Math.ceil(u.def.zsold * 3 / 2) * RU;
    if (p.res[3] < cost) break;
    p.res[3] -= cost; u.unpaid = false; u.pay = 0;
  }
}

function lateConsequences(w: World, p: Player): void {
  p.lateUntil = 0;
  let gone = 0, rebels = 0, home = 0;
  for (const u of w.units) {
    if (u.dead || u.owner !== p.id || !u.unpaid) continue;
    u.unpaid = false;
    const j = u.def.j;
    if (u.def.osztaly === 'ostrom') {
      if (u.pay === 1) { killUnit(w, u, null, true); gone++; } else { u.pay = 1; u.immobile = w.tick + YT; }
    } else if (j.has('hazai')) {
      if (u.pay === 1) { // másodszor: jobbággyá alakul
        const n = spawnUnit(w, UNITS.jobbagy, p.id, u.x, u.y); n.fx = u.fx; n.fy = u.fy;
        killUnit(w, u, null, true); home++;
      } else u.pay = 1;
    } else if (j.has('zsoldos')) { killUnit(w, u, null, true); gone++; }
    else if (j.has('birodalmi')) {
      if (u.def.id === 'janicsar' && u.pay === 0) { u.lazado = 60 * TICKS; u.pay = 1; clearOrders(u); rebels++; }
      else { killUnit(w, u, null, true); gone++; }
    }
  }
  if (gone) chron(w, p.id, `${gone} fizetetlen egység feloszlott.`);
  if (home) chron(w, p.id, `${home} fizetetlen vitéz hazament jobbágynak.`);
  if (rebels) alert(w, p.id, 'lazadas', -1, -1, `${rebels} janicsár fellázadt!`);
  recountPop(w);
}

// ---------- 3. gazdaság (másodpercenként) ----------
export function economySecond(w: World): void {
  const s = season(w);
  for (const p of w.players) {
    if (!p.alive) continue;
    const per = s === 3 ? (p.techs.has('gabonaverem') ? 625 : 750) : 500;
    const need = p.pop * per;
    // a gyártási sorban állók még nem esznek
    let queued = 0;
    for (const b of w.buildings) if (!b.dead && b.owner === p.id) for (const q of b.queue) if (q.k === 'u') queued += UNITS[q.id].nep;
    const eat = Math.max(0, need - queued * per);
    if (p.res[0] >= eat) { p.res[0] -= eat; if (p.famine) { p.famine = false; chron(w, p.id, 'Az éhínség véget ért.'); } }
    else {
      p.res[0] = 0;
      if (!p.famine) { p.famine = true; alert(w, p.id, 'ehinseg', -1, -1, 'Éhínség! Az egységek gyengülnek, a képzés áll.'); }
    }
    // piaci árak visszatérése az alap felé (10 s-onként 1%)
    if ((w.tick / TICKS) % 10 === 0) for (let i = 0; i < 3; i++) {
      if (p.sell[i] < 1000) p.sell[i] = Math.min(1000, p.sell[i] + 10);
      if (p.buy[i] > 1000) p.buy[i] = Math.max(1000, p.buy[i] - 10);
    }
  }
  // karám: a marha nő, ha van elég rét a közelben (télen nem)
  if (s !== 3) for (const b of w.buildings) {
    if (b.dead || !b.built || b.def.id !== 'karam' || b.cattle.length === 0) continue;
    let ret = 0;
    for (let y = b.y - 4; y < b.y + b.h + 4; y++) for (let x = b.x - 4; x < b.x + b.w + 4; x++)
      if (inMap(w, x, y) && w.cur[idx(w, x, y)] === T.RET && w.occ[idx(w, x, y)] === 0) ret++;
    if (ret >= 6) for (let i = 0; i < b.cattle.length; i++) if (b.cattle[i] < 180 * TICKS) {
      b.cattle[i] += TICKS;
      if (b.cattle[i] >= 180 * TICKS) push(w, { t: 'done', p: b.owner, what: 'Felnőtt egy marha a karámban.', x: bcx(b), y: bcy(b) });
    }
  }
  // falvak hódoltatása
  for (const v of w.villages) {
    const own = new Array(w.players.length).fill(0);
    forUnitsNear(w, v.x * FP + 500, v.y * FP + 500, 4, u => {
      if (u.lazado > 0 || !isMilitary(u.def) || u.def.osztaly === 'hajo') return;
      if (dist(u.x, u.y, v.x * FP + 500, v.y * FP + 500) <= 3 * FP + 1500) own[u.owner]++;
    });
    for (const p of w.players) {
      if (!p.alive || v.owner === p.id) { v.cap[p.id] = 0; continue; }
      let enemy = false;
      for (const q of w.players) if (q.team !== p.team && own[q.id] > 0) enemy = true;
      if (own[p.id] > 0 && !enemy) {
        if (++v.cap[p.id] >= 20) {
          const prev = v.owner;
          v.owner = p.id; v.cap[p.id] = 0;
          chron(w, p.id, 'Egy falu behódolt: fizetőnapon adót fizet.');
          push(w, { t: 'done', p: p.id, what: 'Behódolt egy falu.', x: v.x * FP, y: v.y * FP });
          if (prev >= 0) alert(w, prev, 'falu', v.x * FP, v.y * FP, 'Elvesztettünk egy falut!');
        }
      } else v.cap[p.id] = 0;
    }
  }
  // elhajtott marha hazaérkezése
  for (const u of w.units) {
    if (u.dead || u.cattle === 0) continue;
    for (const b of w.buildings) {
      if (b.dead || !b.built || b.owner !== u.owner) continue;
      if ((b.def.id === 'var' || b.def.id === 'karam' || b.def.id === 'vasarter') && distB(u, b) <= 3 * FP) {
        addLoot(w, u.owner, 20 * u.cattle); chron(w, u.owner, `Hazahajtottunk ${u.cattle} marhát.`); u.cattle = 0; break;
      }
    }
  }
  // vadak kóborlása
  for (const a of w.animals) {
    if (a.dead || a.food <= 0) continue;
    if (!a.moving && randInt(w, 9) === 0) {
      const nx = a.hx + (randInt(w, 5) - 2) * FP, ny = a.hy + (randInt(w, 5) - 2) * FP;
      if (nx > FP && ny > FP && nx < (w.W - 1) * FP && ny < (w.H - 1) * FP) {
        const c = w.cur[tileOf(w, nx, ny)];
        if ((c === T.RET || c === T.ERDO || c === T.UT) && w.occ[tileOf(w, nx, ny)] === 0) { a.tx = nx; a.ty = ny; a.moving = true; }
      }
    }
  }
}
export function animalsTick(w: World): void {
  for (const a of w.animals) {
    if (!a.moving || a.dead) continue;
    const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.abs(dx) + Math.abs(dy);
    if (d < 40) { a.moving = false; continue; }
    const st = 22;
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    a.x += (dx * st / m) | 0; a.y += (dy * st / m) | 0;
    a.fx = (dx * 1000 / m) | 0; a.fy = (dy * 1000 / m) | 0;
  }
}

// ---------- 4. gyártás, építés, kutatás ----------
export function production(w: World): void {
  for (const b of w.buildings) {
    if (b.dead) continue;
    const p = w.players[b.owner];
    if (!b.built) {
      if (b.nb > 0) {
        let rate = 1000 + 500 * (Math.min(5, b.nb) - 1);
        if (b.nbRate > 0) rate *= 2;
        const total = (b.def.id === 'palank' && p.faction === VEGVARI ? 3 : b.def.epites) * 1000;
        const add = rate / TICKS;
        b.prog += add;
        b.hp = Math.min(b.def.hp * HPU, b.hp + Math.floor(b.def.hp * HPU * add / total));
        if (b.prog >= total) {
          b.built = true; p.stats.built++;
          if (b.hp > b.def.hp * HPU * 0.9) b.hp = b.def.hp * HPU;
          push(w, { t: 'done', p: b.owner, what: `Elkészült: ${b.def.nev}.`, x: bcx(b), y: bcy(b) });
          if (!b.def.fal) chron(w, b.owner, `Elkészült: ${b.def.nev.toLowerCase()}.`);
          recountPop(w);
        }
      }
      b.nb = 0; b.nbRate = 0;
      continue;
    }
    const q = b.queue[0];
    if (!q) continue;
    if (q.k === 'u') {
      if (p.famine) continue;
      const d = UNITS[q.id];
      let need = d.kepzes * TICKS;
      if (d.id === 'jobbagy' && p.faction === CSASZARI) need = 25 * TICKS;
      if (++b.qprog >= need) {
        b.queue.shift(); b.qprog = 0;
        spawnFrom(w, b, d);
        recountPop(w);
      }
    } else if (q.k === 't') {
      if (++b.qprog >= TECHS[q.id].ido * TICKS) {
        b.queue.shift(); b.qprog = 0; p.techs.add(q.id);
        chron(w, p.id, `Fejlesztés kész: ${TECHS[q.id].nev}.`);
        push(w, { t: 'done', p: p.id, what: `Fejlesztés kész: ${TECHS[q.id].nev}.`, x: bcx(b), y: bcy(b) });
      }
    } else {
      const r = RANKS[p.rank + 1];
      if (r && ++b.qprog >= r.ido * TICKS) {
        b.queue.shift(); b.qprog = 0; p.rank++;
        chron(w, p.id, `Rangemelés: ${['', 'Palánk', 'Végház', 'Főkapitányság'][p.rank]}.`);
        push(w, { t: 'done', p: p.id, what: `Új rang: ${['', 'Palánk', 'Végház', 'Főkapitányság'][p.rank]}.`, x: bcx(b), y: bcy(b) });
      }
    }
  }
  // kapitány újraéledése
  for (const p of w.players) {
    if (!p.alive || p.capRespawn === 0 || w.tick < p.capRespawn) continue;
    p.capRespawn = 0;
    const c = castleOf(w, p.id);
    if (c) { spawnFrom(w, c, UNITS.kapitany); chron(w, p.id, 'A kapitány felépült, újra hadra kelt.'); }
  }
}

export function spawnFrom(w: World, b: Building, d: UnitDef): Unit | null {
  const mc = moveClass(d);
  let t = -1;
  if (mc === 3) {
    for (let r = 1; r < 6 && t < 0; r++) for (let y = b.y - r; y < b.y + b.h + r && t < 0; y++) for (let x = b.x - r; x < b.x + b.w + r; x++)
      if (inMap(w, x, y) && (w.cur[idx(w, x, y)] === T.FOLYO || w.cur[idx(w, x, y)] === T.JEG)) { t = idx(w, x, y); break; }
  } else t = freeTileAround(w, b.x, b.y, b.x + b.w - 1, b.y + b.h - 1, mc, d.j.has('nehez'), w.players[b.owner].team, b.rallyX, b.rallyY);
  if (t < 0) return null;
  const u = spawnUnit(w, d, b.owner, (t % w.W) * FP + 500, Math.floor(t / w.W) * FP + 500);
  if (b.rallyX >= 0 && mc !== 3) {
    const jx = ((u.uid * 7) % 5 - 2) * 450, jy = ((u.uid * 3) % 5 - 2) * 450;
    u.orders.push({ k: 'move', x: Math.max(FP, Math.min((w.W - 1) * FP, b.rallyX + jx)), y: Math.max(FP, Math.min((w.H - 1) * FP, b.rallyY + jy)) });
  }
  push(w, { t: 'done', p: b.owner, what: `Kiképezve: ${d.nev}.`, x: u.x, y: u.y });
  return u;
}

// ---------- 6. épületek harca, lövedékek ----------
export function buildingCombat(w: World): void {
  for (const b of w.buildings) {
    if (b.dead || !b.built) continue;
    if (b.cd > 0) b.cd--;
    const at = b.def.tamadas;
    const cx = bcx(b), cy = bcy(b);
    // helyőrség: +1 HP/s; a lövészek saját értékeikkel, +1 hatótávval lőnek
    for (const uid of b.gar) {
      const u = w.umap.get(uid);
      if (!u || u.dead) continue;
      if (w.tick % TICKS === 0) u.hp = Math.min(u.def.hp * HPU, u.hp + HPU);
      u.x = cx; u.y = cy;
      if (u.cd > 0) { u.cd--; continue; }
      if (u.def.osztaly !== 'lovesz' || (w.tick + u.uid) % 4 !== 0) continue;
      const range = (u.def.tav + 1) * FP;
      const t = nearestEnemy(w, b.owner, cx, cy, range, 0);
      if (t) { u.cd = Math.round(u.def.ujr * TICKS); rangedShot(w, cx, cy, b.owner, Math.round(u.def.pontossag * 1000), range, u.def.tam, LOVO, [1100], t, null); }
    }
    if (!at || b.cd > 0 || (w.tick + b.id) % 4 !== 0) continue;
    const range = at.tav * FP + (b.w * FP >> 1);
    const t = nearestEnemy(w, b.owner, cx, cy, range, at.minTav * FP);
    if (!t) continue;
    b.cd = at.ujr * TICKS;
    if (at.szoras > 0) launch(w, cx, cy, t.x, t.y, b.owner, null, at.tam, [1100], at.szoras, 1000, false, false, b.id);
    else {
      const shots = b.def.id === 'var' ? 1 + Math.floor(b.gar.length / 5) : 1;
      let tt: Unit | null = t;
      for (let k = 0; k < shots && tt; k++) {
        rangedShot(w, cx, cy, b.owner, Math.round(at.pontossag * 1000), range, at.tam, at.tipus, [1100], tt, null);
        if (tt.dead) tt = nearestEnemy(w, b.owner, cx, cy, range, 0);
      }
    }
  }
  // lövedékek
  if (w.projs.length) {
    const rest = [];
    for (const pr of w.projs) { if (w.tick >= pr.t1) explode(w, pr); else rest.push(pr); }
    w.projs = rest;
  }
}
function nearestEnemy(w: World, owner: number, x: number, y: number, range: number, minR: number): Unit | null {
  let best: Unit | null = null, bd = range + 1;
  const team = w.players[owner].team;
  forUnitsNear(w, x, y, Math.ceil(range / FP) + 1, u => {
    if (u.inB || (u.lazado === 0 && w.players[u.owner].team === team)) return;
    const d = dist(x, y, u.x, u.y);
    if (d >= bd || d < minR) return;
    if (u.lazado === 0 && !canSeeUnit(w, owner, u)) return;
    bd = d; best = u;
  });
  return best;
}

// ---------- 7. tűz, fagy, éhínség, gyógyulás ----------
export function fireTick(w: World): void {
  const s = season(w);
  for (const b of w.buildings) {
    if (b.dead || b.fire <= 0) continue;
    b.fire--; b.fireCont++;
    if (w.tick % TICKS === 0) {
      b.hp -= (s === 1 ? 8 : 6) * HPU; b.lastHit = w.tick;
      if (b.hp <= 0) { killBuilding(w, b, null); continue; }
    }
    if (b.fireCont === 10 * TICKS) {
      for (const c of w.buildings) {
        if (c.dead || c === b || c.def.kat === 'ko' || c.fire > 0) continue;
        if (c.x <= b.x + b.w && c.x + c.w >= b.x && c.y <= b.y + b.h && c.y + c.h >= b.y) { c.fire = (s === 0 ? 10 : 20) * TICKS; c.fireCont = 0; }
      }
    }
    if (b.fire <= 0) b.fireCont = 0;
  }
}

export function statusSecond(w: World): void {
  const s = season(w);
  // szálláshelyek és dzsámik játékosonként
  const shelters: Building[][] = w.players.map(() => []), dzs: Building[][] = w.players.map(() => []);
  for (const b of w.buildings) {
    if (b.dead || !b.built) continue;
    if (b.def.szallas > 0 && !(b.def.id === 'satortabor' && s === 3)) shelters[b.owner].push(b);
    if (b.def.id === 'dzsami') dzs[b.owner].push(b);
    // elöntött épület: 2 HP/s (a középső csempe számít), kivéve rév és palánk
    if (b.def.id !== 'rev' && b.def.id !== 'palank' && w.flood[idx(w, b.x + (b.w >> 1), b.y + (b.h >> 1))]) {
      b.hp -= 2 * HPU; if (b.hp <= 0) { chron(w, b.owner, `Elvitte az ár: ${b.def.nev.toLowerCase()}.`); killBuilding(w, b, null); }
    }
    // strázsa lármafája
    if (b.def.id === 'strazsa' && w.tick - b.lastAlarm >= 60 * TICKS) {
      const e = nearestEnemy(w, b.owner, bcx(b), bcy(b), 10 * FP, 0);
      if (e) {
        b.lastAlarm = w.tick;
        forUnitsNear(w, bcx(b), bcy(b), 8, u => { if (u.owner === b.owner && u.lazado === 0) u.moral = Math.min(100 * HPU, u.moral + 10 * HPU); });
        alert(w, b.owner, 'larma', bcx(b), bcy(b), 'Ég a lármafa: ellenség közeledik!');
      }
    }
  }
  for (const u of w.units) {
    if (u.dead) continue;
    const p = w.players[u.owner];
    if (u.lazado > 0) {
      u.lazado -= TICKS;
      if (u.lazado <= 0) { u.lazado = 0; clearOrders(u); chron(w, u.owner, 'Egy lázadó janicsár visszatért a zászló alá.'); }
      continue;
    }
    if (u.inB) continue;
    let sheltered = false;
    for (const b of shelters[u.owner]) if (distB(u, b) <= b.def.szallas * FP) { sheltered = true; break; }
    const calm = w.tick - u.lastHit >= 5 * TICKS;
    if (s === 3 && !sheltered && u.def.osztaly !== 'hajo') u.hp -= p.faction === OSZMAN ? 500 : 250;
    else if (sheltered && calm && u.hp < u.def.hp * HPU) u.hp = Math.min(u.def.hp * HPU, u.hp + 200);
    if (calm) for (const b of dzs[u.owner]) if (distB(u, b) <= 8 * FP) { u.hp = Math.min(u.def.hp * HPU, u.hp + HPU); u.moral = Math.min(100 * HPU, u.moral + 500); break; }
    if (p.famine) { u.hp -= 500; u.moral = Math.max(0, u.moral - HPU); }
    if (u.def.osztaly === 'hajo' && s === 3) u.immobile = w.tick + TICKS + 1;
    if (u.hp <= 0) killUnit(w, u, null);
  }
}

// ---------- 8. morál, megfutamodás ----------
export function moraleSecond(w: World): void {
  const cap: (Unit | null)[] = w.players.map(() => null);
  for (const u of w.units) if (!u.dead && !u.inB && u.def.j.has('vezer') && u.lazado === 0) cap[u.owner] = u;
  for (const u of w.units) {
    if (u.dead || u.inB || u.lazado > 0) continue;
    const cl = u.def.osztaly;
    let own = 0, enemy = 0;
    if (isMilitary(u.def) && w.tick - u.lastFight < 10 * TICKS) {
      forUnitsNear(w, u.x, u.y, 6, o => {
        if (o.inB || dist(u.x, u.y, o.x, o.y) > 6 * FP) return;
        if (hostileUU(w, u, o)) enemy += Math.max(1, o.def.nep) * (isMilitary(o.def) ? 1 : 0); else own += Math.max(1, o.def.nep);
      });
      if (enemy >= 2 * own && enemy > 0) u.moral -= HPU;
    }
    const c = cap[u.owner];
    if (c && c !== u && dist(u.x, u.y, c.x, c.y) <= 8 * FP) u.moral += HPU;
    if (w.tick - u.lastFight >= 10 * TICKS) {
      if (u.moral < 70 * HPU) u.moral = Math.min(70 * HPU, u.moral + 500);
      else if (u.moral > 70 * HPU) u.moral = Math.max(70 * HPU, u.moral - 500);
    }
    u.moral = Math.max(0, Math.min(100 * HPU, u.moral));
    if (u.rout === 0 && cl !== 'munkas' && cl !== 'hajo' && !u.def.j.has('vezer')) {
      const em = effMoral(w, u);
      if (cl === 'ostrom') { if (em <= 0 && u.immobile <= w.tick) { u.immobile = w.tick + 20 * TICKS; u.moral = 30 * HPU; } }
      else if (em < 25 * HPU) { u.rout = 10 * TICKS; u.orders = []; u.tgtU = 0; u.tgtB = 0; u.path = null; u.pkey = -1; }
    }
  }
}

// ---------- 10. látás ----------
export function updateVision(w: World): void {
  const W = w.W, H = w.H;
  for (const p of w.players) { const v = p.vis; for (let i = 0; i < v.length; i++) if (v[i] === 2) v[i] = 1; }
  const see = (owner: number, cx: number, cy: number, r: number) => {
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return;
    const team = w.players[owner].team;
    const viss: Uint8Array[] = [];
    for (const p of w.players) if (p.team === team) viss.push(p.vis);
    if (w.hgt[cy * W + cx]) r += 2;
    const r2 = r * r + r;
    const mark = (i: number) => { for (const v of viss) v[i] = 2; };
    mark(cy * W + cx);
    // sugarak a látókör peremére; erdő mögé csak 1 csempényire látni
    for (let k = -r; k <= r; k++) for (let side = 0; side < 4; side++) {
      const ex = side === 0 ? k : side === 1 ? k : side === 2 ? -r : r;
      const ey = side === 0 ? -r : side === 1 ? r : k;
      const n = Math.max(Math.abs(ex), Math.abs(ey));
      let blocked = 0;
      for (let st = 1; st <= n; st++) {
        const x = cx + Math.round(ex * st / n), y = cy + Math.round(ey * st / n);
        if (x < 0 || y < 0 || x >= W || y >= H) break;
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > r2) break;
        const i = y * W + x;
        mark(i);
        if (blocked) break;
        if (w.cur[i] === T.ERDO) blocked = 1;
      }
    }
  };
  for (const u of w.units) if (!u.dead && u.lazado === 0) see(u.owner, Math.floor(u.x / FP), Math.floor(u.y / FP), u.def.latas);
  for (const b of w.buildings) if (!b.dead) see(b.owner, b.x + (b.w >> 1), b.y + (b.h >> 1), b.built ? b.def.latas + (b.w >> 1) : 2);
  for (const v of w.villages) if (v.owner >= 0) see(v.owner, v.x, v.y, 4);
}

// ---------- győzelem ----------
export function checkVictory(w: World): void {
  if (w.over) return;
  for (const p of w.players) {
    if (!p.alive) continue;
    if (!castleOf(w, p.id)) {
      p.alive = false;
      for (const u of w.units) if (u.owner === p.id) killUnit(w, u, null, true);
      for (const b of w.buildings) if (b.owner === p.id && !b.dead) killBuilding(w, b, null);
      for (const q of w.players) chron(w, q.id, `${FACTION_NAME[p.faction]}: a vár elesett.`);
    }
  }
  const teams = new Set(w.players.filter(p => p.alive).map(p => p.team));
  if (teams.size <= 1) { w.over = true; w.winner = teams.size ? [...teams][0] : -1; return; }
  if (w.scenario.kind === 'kitartas' && w.scenario.holdUntil && w.tick >= w.scenario.holdUntil && w.players[0].alive) {
    w.over = true; w.winner = w.players[0].team; return;
  }
  // Hódoltság: a falvak ≥ 60%-a 480 s-ig megszakítás nélkül
  if (w.tick % TICKS === 0) {
    const cnt = new Map<number, number>();
    for (const v of w.villages) if (v.owner >= 0) cnt.set(teamOf(w, v.owner), (cnt.get(teamOf(w, v.owner)) ?? 0) + 1);
    let lead = -1;
    for (const [t, n] of cnt) if (n * 10 >= w.villages.length * 6) lead = t;
    if (lead !== w.hodTeam) {
      w.hodTeam = lead; w.hodStart = w.tick;
      if (lead >= 0) for (const p of w.players) alert(w, p.id, 'hodoltsag', -1, -1,
        p.team === lead ? 'Miénk a falvak többsége: ha 8 percig megtartjuk, győzünk.' : 'Az ellenség hódoltatta a falvak többségét! 8 percünk van visszavenni.');
    } else if (lead >= 0 && w.tick - w.hodStart >= 480 * TICKS) { w.over = true; w.winner = lead; }
  }
}

export { passU, hurtUnit, hurtBuilding, rand, BUILDINGS, hasBuilding, tEv };
