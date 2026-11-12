// Gépi ellenfél (16. fejezet): gazdaság, zsoldterv, évszak-viselkedés, seregösszetétel, védelem.
import { T, TICKS, UNITS, BUILDINGS, TECHS, RANKS, OSZMAN, VEGVARI, CSASZARI, unitsTrainedAt, buildingRank, type UnitDef, type BuildingDef, type UnitClass } from './data';
import { FP, RU, ALLAS, type World, type Player, type Unit, type Building, type Cmd } from './types';
import { season, tEv, yearOf, idx, inMap, dist, distB, bcx, bcy, castleOf, canAfford, canPlace, placeCost, canBuildDef, wageDemand, expectedIncome,
  isMilitary, szpahiLimit, rand, hasBuilding } from './world';
import { findTile } from './units';
import { sellPrice } from './cmds';

interface AIState {
  next: number; mode: 'gyul' | 'tamad' | 'vissza'; atkStart: number; atkValue: number;
  capV: number; capUntil: number; raidAt: number; threatAt: number; threatX: number; threatY: number; hid: boolean;
}

const unitValue = (d: UnitDef) => d.ar[0] + d.ar[1] + d.ar[2] * 2 + d.ar[3] * 3;

export function aiThink(w: World, p: Player): void {
  const st: AIState = p.aiState ??= { next: 20 + p.id * 7, mode: 'gyul', atkStart: 0, atkValue: 0, capV: -1, capUntil: 0, raidAt: -99999, threatAt: -99999, threatX: 0, threatY: 0, hid: false };
  if (w.tick < st.next) return;
  st.next = w.tick + (p.ai === 1 ? 80 : p.ai === 3 ? 20 : 40);
  const castle = castleOf(w, p.id);
  if (!castle) return;
  const me = p.id, cmd = (c: Cmd) => w.cmds.push(c);
  const s = season(w), te = tEv(w), yr = yearOf(w);
  const cx = bcx(castle), cy = bcy(castle);
  const enemy = w.players.find(q => q.team !== p.team && q.alive);
  const eCastle = enemy ? castleOf(w, enemy.id) : undefined;

  const workers: Unit[] = [], army: Unit[] = [], siege: Unit[] = [];
  let captain: Unit | null = null, myVal = 0, enVal = 0;
  for (const u of w.units) {
    if (u.dead) continue;
    if (u.owner !== me) { if (enemy && w.players[u.owner].team !== p.team && isMilitary(u.def)) enVal += unitValue(u.def); continue; }
    if (u.lazado > 0 || u.inB && u.def.id !== 'jobbagy') continue;
    if (u.def.id === 'jobbagy') workers.push(u);
    else if (u.def.j.has('vezer')) captain = u;
    else if (u.def.osztaly === 'munkas') { /* hadmérnök: a játékosé marad */ }
    else if (u.def.osztaly !== 'hajo') { army.push(u); myVal += unitValue(u.def); if (u.def.osztaly === 'ostrom') siege.push(u); }
  }
  const mine = w.buildings.filter(b => !b.dead && b.owner === me);
  const count = (id: string, builtOnly = false) => mine.reduce((n, b) => n + (b.def.id === id && (!builtOnly || b.built) ? 1 : 0), 0);
  const unbuilt = mine.filter(b => !b.built);

  // ---- védelem ----
  let threat: Building | null = null;
  for (const b of mine) if (w.tick - b.lastHit < 100 && !b.def.fal) { threat = b; break; }
  for (const u of workers) if (w.tick - u.lastHit < 60 && !u.inB) { st.threatAt = w.tick; st.threatX = u.x; st.threatY = u.y; }
  if (threat) { st.threatAt = w.tick; st.threatX = bcx(threat); st.threatY = bcy(threat); }
  const underAttack = w.tick - st.threatAt < 160;
  if (underAttack) {
    const def = army.filter(u => dist(u.x, u.y, st.threatX, st.threatY) < 15 * FP && u.orders.length === 0 && u.tgtU === 0);
    if (captain && captain.orders.length === 0) def.push(captain);
    if (def.length) cmd({ c: 'order', p: me, uids: def.map(u => u.uid), o: { k: 'amove', x: st.threatX, y: st.threatY } });
    const flee = workers.filter(u => !u.inB && dist(u.x, u.y, st.threatX, st.threatY) < 6 * FP && u.orders[0]?.k !== 'garrison');
    if (flee.length && castle.gar.length < castle.def.helyorseg) { cmd({ c: 'order', p: me, uids: flee.map(u => u.uid), o: { k: 'garrison', b: castle.id } }); st.hid = true; }
  } else if (st.hid && castle.gar.length) { cmd({ c: 'ungarrison', p: me, b: castle.id }); st.hid = false; }
  if (w.tick < p.lateUntil) cmd({ c: 'paylate', p: me });

  // ---- gazdaság ----
  const free = workers.filter(u => !u.inB);
  const idle = free.filter(u => u.orders.length === 0);
  const jobOf = (u: Unit) => { const o = u.orders[0]; return !o ? '' : o.k === 'gather' ? o.sub! : o.k; };
  const res = p.res.map(r => Math.floor(r / RU));

  const wTarget = p.rank === 1 ? 13 : p.rank === 2 ? 19 : 24;
  const queuedW = castle.queue.filter(q => q.id === 'jobbagy').length;
  if (workers.length + queuedW < wTarget && castle.queue.length < 2 && res[0] >= 50 && p.pop < p.cap)
    cmd({ c: 'train', p: me, b: castle.id, id: 'jobbagy' });

  // építés
  const siteOk = (d: BuildingDef, x: number, y: number, minRd: number): boolean => {
    if (!canPlace(w, d, me, x, y, 0, true)) return false;
    if (w.rdist[idx(w, x + (d.w >> 1), y + (d.h >> 1))] < minRd) return false;
    for (let j = -1; j <= d.h; j++) for (let i = -1; i <= d.w; i++) {
      const tx = x + i, ty = y + j;
      if (!inMap(w, tx, ty)) return false;
      const k = idx(w, tx, ty);
      if (w.occ[k] !== 0 || (w.cur[k] !== T.RET && w.cur[k] !== T.UT)) return false;
    }
    return true;
  };
  const findSite = (d: BuildingDef, ax: number, ay: number, minRd: number, maxR = 14): { x: number; y: number } | null => {
    for (let r = 2; r <= maxR; r++) {
      let best: { x: number; y: number } | null = null, bd = 1e9;
      for (let y = ay - r; y <= ay + r; y++) for (let x = ax - r; x <= ax + r; x++) {
        if (Math.max(Math.abs(x - ax), Math.abs(y - ay)) !== r) continue;
        if (!siteOk(d, x, y, minRd)) continue;
        const dd = (x - ax) ** 2 + (y - ay) ** 2 + (d.id === 'szanto' ? Math.abs(w.rdist[idx(w, x + 1, y + 1)] - 3) * 6 : 0);
        if (dd < bd) { bd = dd; best = { x, y }; }
      }
      if (best) return best;
    }
    return null;
  };
  const ctx = castle.x + 1, cty = castle.y + 1;
  const builderFor = (x: number, y: number): Unit | null => {
    let best: Unit | null = null, bs = 1e18;
    for (const u of free) {
      const j = jobOf(u);
      if (j === 'build' || j === 'farm') continue;
      const sc = dist(u.x, u.y, x * FP, y * FP) + (j === '' ? 0 : 6 * FP);
      if (sc < bs) { bs = sc; best = u; }
    }
    return best;
  };
  let noSite = false;
  const place = (id: string): boolean => {
    const d = BUILDINGS[id];
    noSite = false;
    if (!canBuildDef(w, d, me) || !canAfford(p, placeCost(w, d, me))) return false;
    let ax = ctx, ay = cty, minRd = 4;
    if (id === 'fatelep') { const i = findTile(w, ctx, cty, 16, t => w.base[t] === T.ERDO); if (i >= 0) { ax = i % w.W; ay = Math.floor(i / w.W); } }
    if (id === 'kobanya') { const i = findTile(w, ctx, cty, 16, t => w.base[t] === T.KO); if (i >= 0) { ax = i % w.W; ay = Math.floor(i / w.W); } }
    if (id === 'szanto') minRd = 3;
    if (id === 'malom') { const f = mine.find(b => b.def.id === 'szanto'); if (f) { ax = f.x; ay = f.y; } }
    if ((id === 'ortorony' || id === 'strazsa' || id === 'bastya') && eCastle) { ax = ctx + Math.sign(eCastle.x - ctx) * 5; ay = cty + Math.sign(eCastle.y - cty) * 5; }
    const site = findSite(d, ax, ay, minRd, id === 'fatelep' || id === 'kobanya' ? 8 : 14);
    if (!site) { noSite = true; return false; }
    const b = builderFor(site.x, site.y);
    if (!b) return false;
    cmd({ c: 'place', p: me, id, x: site.x, y: site.y, rot: 0, uids: [b.uid] });
    return true;
  };
  // gazdátlan építkezés
  for (const b of unbuilt) {
    if (free.some(u => u.orders.some(o => o.k === 'build' && o.b === b.id))) continue;
    const u = builderFor(b.x, b.y);
    if (u) cmd({ c: 'order', p: me, uids: [u.uid], o: { k: 'build', b: b.id } });
  }
  // égő épület oltása
  for (const b of mine) if (b.fire > 0 && !free.some(u => u.orders[0]?.k === 'douse' && u.orders[0].b === b.id)) {
    const u = builderFor(b.x, b.y);
    if (u) cmd({ c: 'order', p: me, uids: [u.uid], o: { k: 'douse', b: b.id } });
  }
  let placed = false;
  if (unbuilt.length < 2 && !underAttack) {
    const capLim = p.faction === OSZMAN ? 250 : 200;
    if (p.cap - p.pop < 4 && p.cap < capLim && !unbuilt.some(b => b.def.id === 'haz')) placed = place('haz');
    if (!placed) {
      const plan: [string, number][] = [['szanto', 2], ['fatelep', 1], ['malom', 1], ['kaszarnya', 1]];
      if (p.faction === OSZMAN) plan.push(['satortabor', 1]);
      plan.push(['szanto', 4], ['kobanya', 1], ['szanto', 5]);
      if (p.faction === VEGVARI) plan.push(['strazsa', 1]);
      plan.push(['ortorony', 1], ['istallo', 1], ['vasarter', 1], ['kovacs', 1], ['szanto', 6]);
      if (p.faction === OSZMAN) plan.push(['dzsami', 1]);
      if (p.faction === CSASZARI) plan.push(['toborzo', 1]);
      plan.push(['ortorony', 2], ['agyuonto', 1], ['szanto', 8]);
      if (p.faction === CSASZARI) plan.push(['bastya', 1]);
      for (const [id, n] of plan) {
        if (count(id) >= n) continue;
        if (p.rank < buildingRank(BUILDINGS[id], p.faction)) continue;
        placed = place(id);
        if (placed) break; // ha most nem megy (nincs hely vagy fedezet), a terv következő eleme jön
      }
    }
  }
  // rangemelés
  const rk = RANKS[p.rank + 1];
  let saving = false;
  if (rk && rk.kell.every(k => hasBuilding(w, me, k)) && !castle.queue.some(q => q.k === 'r')) {
    if (canAfford(p, rk.ar)) cmd({ c: 'rank', p: me, b: castle.id }); else saving = true;
  }
  // fejlesztések, ha van bőven
  if (!saving) for (const t of Object.values(TECHS)) {
    if (p.techs.has(t.id) || p.rank < t.rang || (t.frakcio !== undefined && t.frakcio !== p.faction)) continue;
    const b = mine.find(m => m.built && m.def.id === t.hol && m.queue.length === 0);
    if (b && t.ar.every((c, i) => res[i] >= c * 2 + 60)) { cmd({ c: 'research', p: me, b: b.id, id: t.id }); break; }
  }

  // munkások elosztása
  const farms = mine.filter(b => b.built && b.def.id === 'szanto');
  if (s === 0 || s === 2) {
    for (const f of farms) {
      const todo = s === 0 ? (f.farm === 0 && !w.flood[idx(w, f.x + 1, f.y + 1)] && te < 105) : (f.farm === 2 && f.farmLeft > 0);
      if (!todo) continue;
      if (free.some(u => u.orders[0]?.k === 'gather' && u.orders[0].sub === 'farm' && u.orders[0].b === f.id)) continue;
      let best: Unit | null = null, bs = 1e18;
      for (const u of free) {
        const j = jobOf(u);
        if (j === 'farm' || j === 'build') continue;
        const sc = distB(u, f) + (j === '' ? 0 : 5 * FP);
        if (sc < bs) { bs = sc; best = u; }
      }
      if (best) { cmd({ c: 'order', p: me, uids: [best.uid], o: { k: 'gather', sub: 'farm', b: f.id } }); best.orders = [{ k: 'gather', sub: 'farm', b: f.id }]; }
    }
    // Végvári: a hazai katonák is aratnak, ha nincs harc
    if (s === 2 && p.faction === VEGVARI && st.mode === 'gyul' && !underAttack) {
      const ripe = farms.filter(f => f.farm === 2 && f.farmLeft > 60 * RU);
      const hands = army.filter(u => u.def.j.has('hazai') && u.orders.length === 0 && u.def.osztaly !== 'lovas').slice(0, ripe.length * 2);
      hands.forEach((u, i) => cmd({ c: 'order', p: me, uids: [u.uid], o: { k: 'gather', sub: 'farm', b: ripe[i % ripe.length].id } }));
    }
  }
  const nJob = { e: 0, f: 0, k: 0 };
  for (const u of free) { const j = jobOf(u); if (j === 'fa') nJob.f++; else if (j === 'ko') nJob.k++; else if (j === 'vad' || j === 'hal' || j === 'farm') nJob.e++; }
  const ratio = p.rank === 1 ? { e: 40, f: 45, k: 15 } : { e: 42, f: 34, k: 24 };
  if (res[0] < 120) { ratio.e += 20; ratio.f -= 15; }
  if (res[1] < 80) { ratio.f += 15; ratio.e -= 10; }
  const assign = (u: Unit) => {
    const tot = nJob.e + nJob.f + nJob.k + 1;
    const defc = { e: ratio.e - nJob.e * 100 / tot, f: ratio.f - nJob.f * 100 / tot, k: ratio.k - nJob.k * 100 / tot };
    const order = (['e', 'f', 'k'] as const).slice().sort((a, b) => defc[b] - defc[a]);
    for (const r of order) {
      if (r === 'e') {
        let an = -1, bd = 18 * FP;
        for (const a of w.animals) { if (a.food <= 0) continue; const d = dist(cx, cy, a.x, a.y); if (d < bd) { bd = d; an = a.id; } }
        if (an >= 0) { cmd({ c: 'order', p: me, uids: [u.uid], o: { k: 'gather', sub: 'vad', a: an, x: 0, y: 0 } }); nJob.e++; return; }
        const i = findTile(w, ctx, cty, 16, t => w.base[t] === T.FOLYO);
        if (i >= 0) { cmd({ c: 'order', p: me, uids: [u.uid], o: { k: 'gather', sub: 'hal', x: i % w.W, y: Math.floor(i / w.W) } }); nJob.e++; return; }
      } else if (r === 'f') {
        const ft = mine.find(b => b.built && b.def.id === 'fatelep');
        const i = findTile(w, ft ? ft.x : ctx, ft ? ft.y : cty, 22, t => w.base[t] === T.ERDO && w.wood[t] > 0);
        if (i >= 0) { cmd({ c: 'order', p: me, uids: [u.uid], o: { k: 'gather', sub: 'fa', x: i % w.W, y: Math.floor(i / w.W) } }); nJob.f++; return; }
      } else {
        const i = findTile(w, ctx, cty, 20, t => w.base[t] === T.KO && w.stone[t] > 0);
        if (i >= 0) { cmd({ c: 'order', p: me, uids: [u.uid], o: { k: 'gather', sub: 'ko', x: i % w.W, y: Math.floor(i / w.W) } }); nJob.k++; return; }
      }
    }
  };
  const cold = (u: Unit) => s === 3 && u.hp < u.def.hp * 900;
  for (const u of free) {
    if (s === 3 && u.hp < u.def.hp * (p.faction === OSZMAN ? 750 : 450) && distB(u, castle) > 6 * FP && u.orders[0]?.k !== 'move' && u.orders[0]?.k !== 'build')
      cmd({ c: 'order', p: me, uids: [u.uid], o: { k: 'move', x: castle.rallyX, y: castle.rallyY } });
  }
  for (const u of idle) if (u.orders.length === 0 && !cold(u)) assign(u);
  // átcsoportosítás súlyos hiánynál
  if (res[0] < 60 && nJob.f > 3) { const u = free.find(x => jobOf(x) === 'fa'); if (u) { nJob.f--; assign(u); } }
  if (res[2] < 40 && p.rank >= 1 && nJob.k === 0 && free.length > 8) { const u = free.find(x => jobOf(x) === 'fa'); if (u) { nJob.f--; ratio.k = 100; assign(u); } }

  // ---- zsoldterv és képzés ----
  const demand = wageDemand(w, me), income = expectedIncome(w, me);
  const zNow = res[3];
  if (hasBuilding(w, me, 'vasarter') && te >= 200 && te < 300 && zNow + income < demand) {
    const r = res[1] > 250 ? 1 : res[0] > 400 ? 0 : res[2] > 250 ? 2 : -1;
    if (r >= 0 && sellPrice(w, me, r) > 5) cmd({ c: 'trade', p: me, r, buy: false });
  }
  if (hasBuilding(w, me, 'vasarter') && (w.tick / 40 | 0) % 3 === 0) {
    const r = res[0] > 900 ? 0 : res[1] > 700 ? 1 : res[2] > 600 ? 2 : -1;
    if (r >= 0 && sellPrice(w, me, r) > 6) cmd({ c: 'trade', p: me, r, buy: false });
  }
  const minutes = w.tick / (60 * TICKS);
  const want = Math.min(48, Math.floor(3 + minutes * (p.ai === 1 ? 1.1 : p.ai === 3 ? 2.2 : 1.7)));
  if (army.length < want && !placed && res[0] > 120 + p.pop * (te >= 200 ? 12 : 3) && p.pop < p.cap) {
    const share: Record<string, number> = { gyalog: 0, lovesz: 0, lovas: 0, ostrom: 0 };
    for (const u of army) share[u.def.osztaly]++;
    const goal: Record<string, number> = { gyalog: 40, lovesz: 30, lovas: 20, ostrom: 10 };
    // ellenszer-háló: sok ellenséges lovas → több pikás; sok lövész → több lovas
    if (enemy) {
      let ec = 0, el = 0, et = 0;
      for (const u of w.units) if (!u.dead && u.owner === enemy.id && isMilitary(u.def)) { et++; if (u.def.osztaly === 'lovas') ec++; if (u.def.osztaly === 'lovesz') el++; }
      if (et > 4 && ec * 3 > et) { goal.gyalog += 20; goal.lovas -= 10; }
      if (et > 4 && el * 3 > et) { goal.lovas += 20; goal.lovesz -= 10; }
    }
    const opts: { d: UnitDef; b: Building; sc: number }[] = [];
    for (const b of mine) {
      if (!b.built || b.queue.length >= 2 || b.def.id === 'var' || b.def.id === 'rev') continue;
      for (const d of unitsTrainedAt(b.def.id, p.faction)) {
        if (!isMilitary(d) || p.rank < d.rang || !canAfford(p, d.ar) || p.pop + d.nep > p.cap) continue;
        if (d.id === 'lagumdzsi' && rand(w) % 4 !== 0) continue;
        if (zNow - d.ar[3] + income < (demand + d.zsold) * 11 / 10) continue;
        const tot = army.length + 1;
        const sc = goal[d.osztaly] - share[d.osztaly] * 100 / tot + d.rang * 4 + (rand(w) % 8);
        opts.push({ d, b, sc });
      }
    }
    opts.sort((a, b) => b.sc - a.sc);
    if (opts.length) cmd({ c: 'train', p: me, b: opts[0].b.id, id: opts[0].d.id });
  }

  // ---- hadmozdulatok ----
  if (!eCastle) return;
  const sg = Math.sign(bcx(eCastle) - cx) || 1, sgy = Math.sign(bcy(eCastle) - cy) || 1;
  const rallyX = cx + sg * 5 * FP, rallyY = cy + sgy * 5 * FP;
  const fighters = army.filter(u => u.orders[0]?.k !== 'gather');
  const siegeScen = w.scenario.kind === 'kitartas';
  const iceOk = s === 3 && te >= 385 && te < 425;
  const mayAttack = (s === 1 || (s === 2 && te < 290) || iceOk || siegeScen) && !(yr >= 2 && s === 0);
  const ratioNeed = p.ai === 1 ? 1.6 : 1.3;
  if (st.mode === 'gyul') {
    const minArmy = siegeScen ? 5 : p.ai === 1 ? 10 : 8;
    if (mayAttack && !underAttack && fighters.length >= minArmy && (myVal >= enVal * ratioNeed || fighters.length >= 30)) {
      st.mode = 'tamad'; st.atkStart = w.tick; st.atkValue = myVal;
      for (const q of w.players) if (q.team === p.team && q.ai === 0) { /* szövetséges jelzés helye */ }
    }
  } else if (st.mode === 'tamad') {
    const lost = myVal < st.atkValue * 0.4 || fighters.length < 3;
    const season0 = !siegeScen && ((s === 3 && te >= 432) || (s === 0 && yr >= 2) || (s === 2 && te >= 330));
    if (lost || season0 || underAttack && !siegeScen) st.mode = 'vissza';
  } else if (st.mode === 'vissza') {
    if (fighters.every(u => dist(u.x, u.y, rallyX, rallyY) < 9 * FP) || w.tick - st.atkStart > 4000) st.mode = 'gyul';
  }
  if (st.mode === 'tamad') {
    const go = fighters.filter(u => u.orders.length === 0 && u.tgtU === 0 && u.tgtB === 0);
    if (captain && captain.orders.length === 0) go.push(captain);
    if (go.length) {
      for (const u of go) if (u.allas !== ALLAS.TAMADO) u.allas = ALLAS.TAMADO;
      // ostromgép a várra, a többiek támadó mozgással
      cmd({ c: 'order', p: me, uids: go.map(u => u.uid), o: { k: 'amove', x: bcx(eCastle), y: bcy(eCastle) } });
    }
  } else {
    const back = fighters.filter(u => u.orders.length === 0 && u.tgtU === 0 && dist(u.x, u.y, rallyX, rallyY) > 8 * FP);
    if (st.mode === 'vissza') for (const u of fighters) if (u.orders[0]?.k === 'amove') back.push(u);
    if (back.length && !(w.tick < st.capUntil)) {
      for (const u of back) u.allas = ALLAS.VEDEKEZO;
      cmd({ c: 'order', p: me, uids: [...new Set(back.map(u => u.uid))], o: { k: 'move', x: rallyX, y: rallyY } });
    }
    // falvak hódoltatása a kapitánnyal és néhány katonával
    if (!underAttack && w.tick >= st.capUntil && (fighters.length >= 2 || (captain && w.tick > 60 * TICKS))) {
      let best = -1, bd = 1e18;
      for (const v of w.villages) {
        if (v.owner === me) continue;
        const d = dist(cx, cy, v.x * FP, v.y * FP) + (v.owner >= 0 ? 10 * FP : 0);
        const side = (v.x + v.y - (w.W - 1)) * (castle.x + castle.y - (w.W - 1)) > 0;
        if (!side && (fighters.length < 6 || !mayAttack)) continue;
        if (d < bd) { bd = d; best = v.id; }
      }
      if (best >= 0) {
        const v = w.villages[best];
        const squad = fighters.filter(u => u.orders.length === 0 && u.def.osztaly !== 'ostrom').slice(0, 4);
        if (captain && captain.orders.length === 0) squad.push(captain);
        if (squad.length) {
          cmd({ c: 'order', p: me, uids: squad.map(u => u.uid), o: { k: 'amove', x: (v.x + 2) * FP, y: (v.y + 2) * FP } });
          st.capV = best; st.capUntil = w.tick + Math.floor(bd / 60) + 40 * TICKS;
        }
      }
    }
    // őszi portya: lovasok felégetik az idegen falvakat
    if (s === 2 && te >= 245 && te < 320 && w.tick - st.raidAt > 400 * TICKS && !underAttack) {
      const riders = fighters.filter(u => u.def.j.has('portya') && u.orders.length === 0).slice(0, 8);
      if (riders.length >= 3) {
        let best = -1, bd = 1e18;
        for (const v of w.villages) {
          if (v.owner === me || v.burnt > w.tick || (v.owner < 0 && p.ai < 3)) continue;
          const d = dist(cx, cy, v.x * FP, v.y * FP);
          if (d < bd) { bd = d; best = v.id; }
        }
        if (best >= 0) {
          st.raidAt = w.tick;
          cmd({ c: 'portya', p: me, uids: riders.filter(u => !u.portya).map(u => u.uid) });
          cmd({ c: 'order', p: me, uids: riders.map(u => u.uid), o: { k: 'burn', v: best } });
        }
      }
    }
  }
}
