// A szimuláció fő lépése: fix 20 tick/s, a 17. fejezet sorrendjében.
import { TICKS } from './data';
import type { World, Cmd } from './types';
import { rebuildGrid } from './world';
import { applyCmd } from './cmds';
import { seasonClock, economySecond, animalsTick, production, buildingCombat, fireTick, statusSecond, moraleSecond, updateVision, checkVictory } from './systems';
import { updateUnit, separate } from './units';
import { aiThink } from './ai';

export function issue(w: World, c: Cmd): void { w.cmds.push(c); }

export function tick(w: World): void {
  if (w.over) return;
  rebuildGrid(w);
  for (const p of w.players) if (p.ai > 0 && p.alive) aiThink(w, p);
  // 1. parancsok
  if (w.cmds.length) { const cs = w.cmds; w.cmds = []; for (const c of cs) applyCmd(w, c); }
  // 2. évszak-óra
  seasonClock(w);
  // 3. gazdaság
  if (w.tick % TICKS === 0) economySecond(w);
  animalsTick(w);
  // 4. gyártás, építés (az előző tick építőivel), kutatás
  production(w);
  // 5–6. mozgás, célválasztás, támadás
  w.pathBudget = 6;
  for (let i = 0; i < w.units.length; i++) updateUnit(w, w.units[i]);
  separate(w);
  buildingCombat(w);
  // 7. tűz, fagy, éhínség, gyógyulás
  fireTick(w);
  if (w.tick % TICKS === 5) statusSecond(w);
  // 8. morál, megfutamodás
  if (w.tick % TICKS === 10) moraleSecond(w);
  // 9. halál és törlés
  let du = false, db = false;
  for (const u of w.units) if (u.dead) { du = true; w.umap.delete(u.uid); }
  if (du) w.units = w.units.filter(u => !u.dead);
  for (const b of w.buildings) if (b.dead) { db = true; w.bmap.delete(b.id); }
  if (db) w.buildings = w.buildings.filter(b => !b.dead);
  if (du) rebuildGrid(w);
  // 10. látás, győzelem
  if (w.tick % 5 === 0) updateVision(w);
  checkVictory(w);
  w.tick++;
}

/** Állapot-ellenőrző összeg a determinizmus teszteléséhez. */
export function checksum(w: World): number {
  let h = w.tick | 0;
  const mixin = (v: number) => { h = (Math.imul(h ^ v, 2654435761) + 0x9e3779b9) | 0; };
  for (const u of w.units) { mixin(u.uid); mixin(u.x); mixin(u.y); mixin(u.hp); mixin(u.moral); }
  for (const b of w.buildings) { mixin(b.id); mixin(b.hp); mixin(b.prog); }
  for (const p of w.players) for (const r of p.res) mixin(r);
  mixin(w.rs);
  return h >>> 0;
}
