// Játékmechanikák a teljes szimuláción át: zsold és hűség, vásár, helyőrség, akna, tűz, áradás, jég.
import { describe, it, expect } from 'vitest';
import { UNITS, BUILDINGS, TICKS } from '../src/sim/data';
import { FP, HPU, RU, type World } from '../src/sim/types';
import { createWorld, spawnUnit, addBuilding, castleOf, canPlace } from '../src/sim/world';
import { tick } from '../src/sim/sim';

const mk = (f0 = 0, f1 = 1): World => createWorld({ size: 96, seed: 3, players: [{ faction: f0 as 0, ai: 0 }, { faction: f1 as 1, ai: 0 }] });
const run = (w: World, n: number) => { for (let i = 0; i < n; i++) { tick(w); w.ev.length = 0; } };
const near = (w: World, p: number, dx: number, dy: number) => { const s = w.starts[p]; return { x: (s.x + dx) * FP + 500, y: (s.y + dy) * FP + 500 }; };
const freeSpot = (w: World, id: string, p: number) => {
  const s = w.starts[p], d = BUILDINGS[id];
  for (let r = 4; r < 14; r++) for (let y = s.y - r; y <= s.y + r; y++) for (let x = s.x - r; x <= s.x + r; x++) if (canPlace(w, d, p, x, y, 0, true)) return { x, y };
  throw new Error('nincs hely');
};

describe('zsold és hűség (5. fejezet)', () => {
  it('fizetetlen hazai egység meggyengül, másodszor jobbágy lesz; a zsoldos feloszlik', () => {
    const w = mk(0, 2);
    const a = near(w, 0, 4, 0), b = near(w, 1, -4, 0);
    const huszar = spawnUnit(w, UNITS.huszar, 0, a.x, a.y);
    const lands = spawnUnit(w, UNITS.landsknecht, 1, b.x, b.y);
    w.players[0].res[3] = 0; w.players[1].res[3] = 0; w.players[0].res[0] = w.players[1].res[0] = 5000 * RU;
    for (const u of w.units) if (u.def.id === 'jobbagy') u.dead = true; // nincs jobbágyadó
    run(w, 300 * TICKS + 2);
    expect(huszar.unpaid).toBe(true);
    run(w, 30 * TICKS + 2);
    expect(huszar.pay).toBe(1); expect(huszar.dead).toBe(false);
    expect(lands.dead).toBe(true);
    w.players[0].res[3] = 0;
    run(w, 480 * TICKS);
    run(w, 31 * TICKS);
    expect(huszar.dead).toBe(true);
    expect(w.units.some(u => u.owner === 0 && u.def.id === 'jobbagy')).toBe(true);
  });
  it('a fizetetlen janicsár fellázad, majd visszaáll', () => {
    const w = mk(1, 0);
    const a = near(w, 0, 5, 0);
    const j = spawnUnit(w, UNITS.janicsar, 0, a.x, a.y);
    w.players[0].res[3] = 0; w.players[0].res[0] = 5000 * RU;
    for (const u of w.units) if (u.def.id === 'jobbagy') u.dead = true;
    run(w, 331 * TICKS);
    expect(j.lazado).toBeGreaterThan(0);
    castleOf(w, 0)!.cd = 99999; // a vár és a kapitány különben leveri a lázadót
    for (const u of w.units) if (u.def.id === 'kapitany') u.dead = true;
    run(w, 62 * TICKS);
    expect(j.lazado).toBe(0); expect(j.dead).toBe(false);
  });
  it('utófizetés másfélszeres áron megmenti az egységet', () => {
    const w = mk(0, 1);
    const a = near(w, 0, 4, 0);
    const h = spawnUnit(w, UNITS.hajdu, 0, a.x, a.y);
    w.players[0].res[3] = 0; w.players[0].res[0] = 5000 * RU;
    for (const u of w.units) if (u.def.id === 'jobbagy') u.dead = true;
    run(w, 300 * TICKS + 2);
    expect(h.unpaid).toBe(true);
    w.players[0].res[3] = 10 * RU;
    w.cmds.push({ c: 'paylate', p: 0 });
    run(w, 2);
    expect(h.unpaid).toBe(false); expect(w.players[0].res[3]).toBe(5 * RU); // ceil(3 × 1,5) = 5
  });
});

describe('gazdaság', () => {
  it('vásár: eladás után romlik az ár, ősszel másfélszeres', () => {
    const w = mk();
    const s = freeSpot(w, 'vasarter', 0);
    addBuilding(w, BUILDINGS.vasarter, 0, s.x, s.y, 0, true);
    run(w, 1);
    const p = w.players[0]; p.res[1] = 500 * RU; const z0 = p.res[3];
    w.cmds.push({ c: 'trade', p: 0, r: 1, buy: false }); run(w, 1);
    expect(p.res[3] - z0).toBe(25 * RU); expect(p.sell[1]).toBe(970);
    w.cmds.push({ c: 'trade', p: 0, r: 1, buy: false }); run(w, 1);
    expect(p.res[3] - z0).toBe((25 + 24) * RU);
  });
  it('jobbágy fát vág és a várba hordja', () => {
    const w = mk();
    const u = w.units.find(x => x.owner === 0 && x.def.id === 'jobbagy')!;
    let ti = -1, bd = 1e9; const s = w.starts[0];
    for (let i = 0; i < w.base.length; i++) if (w.base[i] === 3) { const d = Math.hypot(i % w.W - s.x, Math.floor(i / w.W) - s.y); if (d < bd) { bd = d; ti = i; } }
    const f0 = w.players[0].res[1];
    w.cmds.push({ c: 'order', p: 0, uids: [u.uid], o: { k: 'gather', sub: 'fa', x: ti % w.W, y: Math.floor(ti / w.W) } });
    run(w, 90 * TICKS);
    expect(w.players[0].res[1]).toBeGreaterThan(f0 + 9 * RU);
  });
  it('szántó: tavaszi vetés, őszi érés, aratás', () => {
    const w = mk();
    const s = freeSpot(w, 'szanto', 0);
    const farm = addBuilding(w, BUILDINGS.szanto, 0, s.x, s.y, 0, true);
    const u = w.units.find(x => x.owner === 0 && x.def.id === 'jobbagy')!;
    w.cmds.push({ c: 'order', p: 0, uids: [u.uid], o: { k: 'gather', sub: 'farm', b: farm.id } });
    run(w, 60 * TICKS);
    expect(farm.farm).toBe(1);
    run(w, 181 * TICKS);
    expect(farm.farm).toBe(2); expect(farm.farmLeft).toBeGreaterThanOrEqual(300 * RU);
    const e0 = w.players[0].res[0];
    w.cmds.push({ c: 'order', p: 0, uids: [u.uid], o: { k: 'gather', sub: 'farm', b: farm.id } });
    run(w, 60 * TICKS);
    expect(w.players[0].res[0]).toBeGreaterThan(e0 + 60 * RU);
  });
});

describe('harc', () => {
  it('helyőrség: a bent ülő nem sebezhető, a vár lő a közeledőre', () => {
    const w = mk();
    const c = castleOf(w, 0)!;
    const h = spawnUnit(w, UNITS.hajdu, 0, near(w, 0, 4, 0).x, near(w, 0, 4, 0).y);
    w.cmds.push({ c: 'order', p: 0, uids: [h.uid], o: { k: 'garrison', b: c.id } });
    run(w, 10 * TICKS);
    expect(h.inB).toBe(c.id);
    const e = spawnUnit(w, UNITS.azab, 1, near(w, 0, 6, 0).x, near(w, 0, 6, 0).y);
    w.players[0].vis.fill(2);
    run(w, 25 * TICKS);
    expect(e.dead || e.hp < e.def.hp * HPU).toBe(true);
    expect(h.hp).toBe(h.def.hp * HPU);
  });
  it('akna: 40 s ásás után 600 sebzés a falszegmensnek', () => {
    const w = mk(0, 1);
    const s = freeSpot(w, 'palank', 0);
    const wall = addBuilding(w, BUILDINGS.palank, 0, s.x, s.y, 0, true);
    const l = spawnUnit(w, UNITS.lagumdzsi, 1, (s.x - 1) * FP + 500, s.y * FP + 500);
    w.cmds.push({ c: 'order', p: 1, uids: [l.uid], o: { k: 'mine', b: wall.id } });
    w.players[0].vis.fill(0); // senki ne lőjön rá
    for (const u of w.units) if (u.owner === 0) u.dead = true;
    castleOf(w, 0)!.def.tamadas && (castleOf(w, 0)!.cd = 99999);
    run(w, 39 * TICKS);
    expect(wall.dead).toBe(false);
    run(w, 3 * TICKS);
    expect(wall.dead).toBe(true); // 600 HP − 600
  });
  it('tűz: a gyújtogató találata lángra lobbantja a faépületet, a kő nem ég', () => {
    const w = mk(0, 1);
    const s = freeSpot(w, 'haz', 0);
    const haz = addBuilding(w, BUILDINGS.haz, 0, s.x, s.y, 0, true);
    const a = spawnUnit(w, UNITS.akindzsi, 1, (s.x - 1) * FP + 500, s.y * FP + 500);
    for (const u of w.units) if (u.owner === 0) u.dead = true;
    castleOf(w, 0)!.cd = 99999;
    w.cmds.push({ c: 'order', p: 1, uids: [a.uid], o: { k: 'attack', b: haz.id } });
    run(w, 4 * TICKS);
    expect(haz.fire).toBeGreaterThan(0);
  });
  it('áradás a 2. évben elönti az árteret; télen a folyó befagy, olvadáskor a jégen álló odavész', () => {
    const w = mk();
    for (const p of w.players) p.res[0] = 99999 * RU;
    run(w, 380 * TICKS + 1);
    expect(w.ice).toBe(true);
    let ri = -1; for (let i = 0; i < w.cur.length; i++) if (w.cur[i] === 8) { ri = i; break; }
    expect(ri).toBeGreaterThanOrEqual(0);
    const u = spawnUnit(w, UNITS.azab, 1, (ri % w.W) * FP + 500, Math.floor(ri / w.W) * FP + 500);
    u.allas = 3;
    run(w, 91 * TICKS);
    expect(w.ice).toBe(false); expect(u.dead).toBe(true);
    run(w, (480 - 471 + 60) * TICKS);
    let flooded = 0; for (let i = 0; i < w.flood.length; i++) flooded += w.flood[i];
    expect(flooded).toBeGreaterThan(50);
  });
});
