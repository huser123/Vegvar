// Harc (9. fejezet): sebzés, találat, lövedék, tűz, halál, zsákmány.
import { T, UNITS, BARMOR, LOVO, SZURO, VAGO, ZUZO, VEGVARI, OSZMAN, TICKS, type UnitDef } from './data';
import { FP, HPU, RU, ALAKZAT, ANIM, type World, type Unit, type Building, type Proj } from './types';
import { damage, moralMult, sideMult, hitChance, isFront } from './rules';
import { season, rand, idx, inMap, tileOf, dist, radius, castleOf, push, chron, alert, hostileUU, forUnitsNear, bcx, bcy,
  freeTileAround, moveClass, recountPop, isMilitary, distB } from './world';

export function effMoral(w: World, u: Unit): number {
  let m = u.moral;
  const p = w.players[u.owner];
  const c = castleOf(w, u.owner);
  const dc = c ? distB(u, c) : 1e9;
  if (p.faction === VEGVARI && dc <= 10 * FP) m = Math.min(100 * HPU, m + 10 * HPU);
  if (u.pay === 1 && u.def.j.has('hazai')) m = Math.min(m, 60 * HPU);
  if (u.def.j.has('allhatatos') && dc <= 8 * FP) m = Math.max(m, 40 * HPU);
  return m;
}
export function seasonMult(w: World, u: Unit): number {
  const s = season(w);
  let m = 1000;
  if (w.players[u.owner].faction === OSZMAN && s === 1) m = 1100;
  if (u.def.id === 'szpahi' && s === 3) m = m * 700 / 1000;
  return m;
}
export function statusMult(u: Unit): number { return u.pay === 1 && u.def.j.has('hazai') ? 750 : 1000; }
export function heightMult(w: World, ax: number, ay: number, bx: number, by: number): number {
  const ha = w.hgt[tileOf(w, ax, ay)], hb = w.hgt[tileOf(w, bx, by)];
  return ha > hb ? 1250 : ha < hb ? 750 : 1000;
}
export function techAtk(w: World, owner: number, tipus: number): number {
  return (tipus === VAGO || tipus === SZURO) && w.players[owner].techs.has('edzett_penge') ? 2 : 0;
}
export function deployed(w: World, u: Unit): boolean { return w.tick - u.lastMove >= u.def.telepites * TICKS; }

export function unitArmor(w: World, t: Unit, tipus: number, front: boolean): number {
  let a = t.def.pancel[tipus];
  const tech = w.players[t.owner].techs, o = t.def.osztaly;
  if (o === 'gyalog' || o === 'lovas') {
    if (tech.has('sodronying') && tipus <= SZURO) a += 1;
    if (tech.has('mellvert') && tipus <= LOVO) a += 1;
  }
  if (o === 'ostrom' && tech.has('fuleskosar') && (tipus === SZURO || tipus === LOVO) && deployed(w, t)) a += 4;
  if (t.alakzat === ALAKZAT.VONAL && front && (tipus === SZURO || tipus === LOVO)) a += 2;
  if (t.portya) a = Math.floor(a * 3 / 4);
  return a;
}
export function buildingArmor(w: World, b: Building, tipus: number): number {
  if (tipus === ZUZO && b.def.kat === 'ko' && (b.def.fal || b.def.id === 'bastya') && w.players[b.owner].techs.has('olasz_bastya')) return 8;
  return BARMOR[b.def.kat][tipus];
}

export function addLoot(w: World, owner: number, z: number): void {
  const p = w.players[owner];
  const v = p.faction === VEGVARI ? z * 2 : z;
  p.res[3] += v * RU; p.stats.loot += v;
}

export function hurtUnit(w: World, t: Unit, dmg: number, by: Unit | null): void {
  if (t.dead || t.inB) return;
  t.hp -= dmg * HPU; t.lastHit = w.tick; t.lastFight = w.tick;
  if (by) { t.lastAtkBy = by.uid; by.lastFight = w.tick; }
  if (t.hp <= 0) killUnit(w, t, by);
}

export function killUnit(w: World, u: Unit, by: Unit | null, silent = false): void {
  if (u.dead) return;
  u.dead = true; u.hp = 0;
  if (u.inB) { const b = w.bmap.get(u.inB); if (b) b.gar = b.gar.filter(i => i !== u.uid); u.inB = 0; }
  if (silent) return;
  push(w, { t: 'die', def: u.def.id, owner: u.owner, x: u.x, y: u.y, fx: u.fx, fy: u.fy });
  w.players[u.owner].stats.lost++;
  if (by && !by.dead) {
    w.players[by.owner].stats.kills++;
    if (u.def.id === 'jobbagy' && by.def.j.has('portya')) addLoot(w, by.owner, 5);
  }
  // morál: saját halott −4, ellenséges halott +2, 5 csempén belül
  forUnitsNear(w, u.x, u.y, 5, o => {
    if (o === u || dist(o.x, o.y, u.x, u.y) > 5 * FP) return;
    if (o.lazado > 0 || u.lazado > 0) return;
    const same = w.players[o.owner].team === w.players[u.owner].team;
    o.moral = Math.max(0, Math.min(100 * HPU, o.moral + (same ? -4 : 2) * HPU));
  });
  if (u.def.j.has('vezer') && u.lazado === 0) {
    for (const o of w.units) if (!o.dead && o.owner === u.owner) o.moral = Math.max(0, o.moral - 20 * HPU);
    w.players[u.owner].capRespawn = w.tick + 90 * TICKS;
    alert(w, u.owner, 'vezer', u.x, u.y, 'A kapitány elesett! A sereg megrendült.');
  }
}

export function killBuilding(w: World, b: Building, by: Unit | null): void {
  if (b.dead) return;
  b.dead = true; b.hp = 0;
  for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) if (w.occ[idx(w, b.x + i, b.y + j)] === b.id) w.occ[idx(w, b.x + i, b.y + j)] = 0;
  w.terrainVer++;
  // helyőrség 50% életerővel kiesik
  for (const uid of b.gar) {
    const u = w.umap.get(uid);
    if (!u || u.dead) continue;
    u.inB = 0; u.hp = Math.max(HPU, Math.floor(u.hp / 2));
    const t = freeTileAround(w, b.x, b.y, b.x + b.w - 1, b.y + b.h - 1, moveClass(u.def), false, -1);
    if (t >= 0) { u.x = (t % w.W) * FP + 500; u.y = Math.floor(t / w.W) * FP + 500; }
  }
  b.gar = [];
  for (const q of b.queue) if (q.k === 'u') { /* a befizetett ár elvész */ }
  b.queue = [];
  push(w, { t: 'bdie', def: b.def.id, x: b.x, y: b.y, w: b.w, h: b.h });
  if (by) w.players[by.owner].stats.kills++;
  if (!b.def.fal) alert(w, b.owner, 'veszt', bcx(b), bcy(b), `${b.def.nev} elpusztult.`);
  recountPop(w);
}

export function ignite(w: World, b: Building): void {
  if (b.def.kat === 'ko' || b.dead) return;
  if (b.fire <= 0) { b.fireCont = 0; alert(w, b.owner, 'tuz', bcx(b), bcy(b), `Ég a ${b.def.nev.toLowerCase()}!`); }
  b.fire = (season(w) === 0 ? 10 : 20) * TICKS;
}

export function hurtBuilding(w: World, b: Building, dmg: number, by: Unit | null, lootable = true): void {
  if (b.dead) return;
  b.hp -= dmg * HPU; b.lastHit = w.tick;
  if (by) {
    by.lastFight = w.tick;
    if (lootable && b.def.gazdasagi && by.def.j.has('portya')) {
      const p = w.players[by.owner];
      p.lootRem += dmg;
      if (p.lootRem >= 20) { addLoot(w, by.owner, Math.floor(p.lootRem / 20)); p.lootRem %= 20; }
    }
  }
  if (w.tick - b.lastAlarm > 15 * TICKS) {
    b.lastAlarm = w.tick;
    alert(w, b.owner, 'tamadas', bcx(b), bcy(b), b.def.id === 'var' ? 'Ostromolják a várat!' : `Támadás: ${b.def.nev.toLowerCase()}!`);
  }
  if (b.hp <= 0) killBuilding(w, b, by);
}

function atkMults(w: World, u: Unit): number[] { return [moralMult(effMoral(w, u)), seasonMult(w, u), statusMult(u)]; }

/** Közelharci ütés egységre – rohammal, pikával, oldaltámadással. */
export function meleeHit(w: World, u: Unit, t: Unit, tam: number, tipus: number): void {
  const ax = u.x - t.x, ay = u.y - t.y;
  let side = sideMult(t.fx, t.fy, ax, ay);
  const front = side === 1000;
  if (!front && t.alakzat === ALAKZAT.EK) side = side * 1200 / 1000;
  let charge = 1000, pikeBack = false;
  if (u.def.j.has('roham') && u.chDist >= 4 * FP && w.tick >= u.chCd && w.tick - u.lastMove <= 4) {
    charge = u.alakzat === ALAKZAT.EK ? 2500 : 2000;
    if (t.def.j.has('pika') && t.alakzat === ALAKZAT.VONAL && front && w.tick - t.lastMove > 4) { charge = 500; pikeBack = true; }
    u.chCd = w.tick + 10 * TICKS; u.chDist = 0;
    push(w, { t: 'snd', s: 'roham', x: u.x, y: u.y });
  }
  const bonus = u.def.bonusz[t.def.osztaly] ?? 0;
  const d = damage(tam + bonus + techAtk(w, u.owner, tipus),
    [...atkMults(w, u), side, heightMult(w, u.x, u.y, t.x, t.y), charge], unitArmor(w, t, tipus, front));
  push(w, { t: 'melee', x: t.x, y: t.y });
  hurtUnit(w, t, d, u);
  if (pikeBack && !t.dead) {
    const back = damage(t.def.tam + (t.def.bonusz[u.def.osztaly] ?? 0) + techAtk(w, t.owner, t.def.tipus), atkMults(w, t), unitArmor(w, u, t.def.tipus, true));
    hurtUnit(w, u, back, t);
  }
}

/** Lövés (azonnali találat, 9.2). Visszaad: talált-e. */
export function rangedShot(w: World, sx: number, sy: number, owner: number, accMilli: number, range: number, tam: number, tipus: number,
  mults: number[], t: Unit, by: Unit | null): boolean {
  const d = dist(sx, sy, t.x, t.y);
  const rain = tipus === LOVO && season(w) === 0 && !w.players[owner].techs.has('kereklakat') ? 750 : 1000;
  const cover = w.cur[tileOf(w, t.x, t.y)] === T.ERDO ? 700 : 1000;
  const loose = t.alakzat === ALAKZAT.LAZA ? 850 : 1000;
  const p = hitChance(accMilli, d, range, rain, cover, loose);
  const hit = rand(w) % 1000000 < p;
  push(w, { t: 'shot', x: sx, y: sy, tx: t.x, ty: t.y, hit, big: false });
  if (hit) {
    const side = sideMult(t.fx, t.fy, sx - t.x, sy - t.y);
    hurtUnit(w, t, damage(tam, [...mults, side, heightMult(w, sx, sy, t.x, t.y)], unitArmor(w, t, tipus, side === 1000)), by);
  } else if (by) { t.lastFight = w.tick; if (!t.lastAtkBy) t.lastAtkBy = by.uid; }
  return hit;
}

/** Ostromlövedék indítása (9.3). Az egyenes lövést az útjába eső fal megállítja. */
export function launch(w: World, sx: number, sy: number, tx: number, ty: number, owner: number, src: UnitDef | null, tam: number,
  mults: number[], szoras: number, bmult: number, gyujt: boolean, ivelt: boolean, targetB: number): void {
  if (!ivelt) {
    const dx = tx - sx, dy = ty - sy, n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 400));
    for (let k = 2; k < n; k++) {
      const px = sx + ((dx * k / n) | 0), py = sy + ((dy * k / n) | 0);
      const o = w.occ[tileOf(w, px, py)];
      if (o > 0 && o !== targetB) {
        const b = w.bmap.get(o);
        if (b && b.def.fal && b.built && w.players[b.owner].team !== w.players[owner].team) { tx = px; ty = py; break; }
      }
    }
  }
  const d = dist(sx, sy, tx, ty);
  const dur = Math.max(2, Math.ceil(d / 600)); // 12 cs/s
  const pr: Proj = { x0: sx, y0: sy, x1: tx, y1: ty, t0: w.tick, t1: w.tick + dur, owner, team: w.players[owner].team, src, tam,
    mult: mults.map(m => BigInt(m)), tipus: ZUZO, szoras, bmult, gyujt, ivelt, srcH: w.hgt[tileOf(w, sx, sy)] };
  w.projs.push(pr);
  push(w, { t: 'proj', x0: sx, y0: sy, x1: tx, y1: ty, dur, ivelt });
  push(w, { t: 'shot', x: sx, y: sy, tx, ty, hit: true, big: true });
}

export function explode(w: World, pr: Proj): void {
  const cx = Math.floor(pr.x1 / FP), cy = Math.floor(pr.y1 / FP);
  if (!inMap(w, cx, cy)) return;
  const ci = idx(w, cx, cy);
  const water = w.cur[ci] === T.FOLYO || w.cur[ci] === T.GAZLO;
  push(w, { t: 'boom', x: pr.x1, y: pr.y1, water });
  const mults = pr.mult.map(Number);
  const hm = pr.srcH > w.hgt[ci] ? 1250 : pr.srcH < w.hgt[ci] ? 750 : 1000;
  const r = pr.szoras;
  const hitB = new Set<number>();
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (!inMap(w, x, y)) continue;
    const i = idx(w, x, y), center = x === cx && y === cy;
    const o = w.occ[i];
    if (o > 0 && !hitB.has(o)) {
      const b = w.bmap.get(o);
      if (b && !b.dead && (center || w.occ[ci] !== o)) {
        hitB.add(o);
        const own = w.players[b.owner].team === pr.team;
        const d = damage(pr.tam, [...mults, hm, pr.bmult, center ? 1000 : 500, own ? 500 : 1000], buildingArmor(w, b, ZUZO));
        if (pr.gyujt && !own) ignite(w, b);
        hurtBuilding(w, b, d, null);
      }
    }
    for (let n = w.gHead[i]; n >= 0; n = w.gNext[n]) {
      const u = w.units[n];
      if (!u || u.dead || u.inB) continue;
      const own = u.lazado === 0 && w.players[u.owner].team === pr.team;
      const d = damage(pr.tam, [...mults, hm, center ? 1000 : 500, own ? 500 : 1000, !center && u.alakzat === ALAKZAT.LAZA ? 500 : 1000],
        unitArmor(w, u, ZUZO, false));
      hurtUnit(w, u, d, null);
    }
  }
}

/** Egység üt/lő egy épületre. */
export function strikeBuilding(w: World, u: Unit, b: Building, tam: number, tipus: number): void {
  const d = damage(tam + techAtk(w, u.owner, tipus), atkMults(w, u), buildingArmor(w, b, tipus));
  if (u.def.j.has('gyujtogato')) ignite(w, b);
  push(w, { t: 'melee', x: bcx(b), y: bcy(b) });
  hurtBuilding(w, b, d, u);
}

export function siegeFire(w: World, u: Unit, tx: number, ty: number, targetB: number): void {
  const d = u.def, tech = w.players[u.owner].techs;
  const gy = d.j.has('gyujtogato') || ((d.id === 'tarack' || d.id === 'agyu') && tech.has('tuzes_golyo'));
  launch(w, u.x, u.y, tx, ty, u.owner, d, d.tam, atkMults(w, u), d.szoras, Math.round(d.epuletSzorzo * 1000), gy, d.id === 'mozsar', targetB);
}

export { atkMults, isFront, hostileUU, isMilitary, UNITS };
