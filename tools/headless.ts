// Fej nélküli gép–gép meccs: hibakeresés és egyensúly-szemle.  npx tsx tools/headless.ts [seed] [évek] [f0] [f1]
import { createWorld, wageDemand } from '../src/sim/world';
import { tick } from '../src/sim/sim';
import { FACTION_NAME, type Faction } from '../src/sim/data';
const seed = +(process.argv[2] ?? 1), years = +(process.argv[3] ?? 3);
const f0 = +(process.argv[4] ?? 0) as Faction, f1 = +(process.argv[5] ?? 1) as Faction;
const w = createWorld({ size: 96, seed, players: [{ faction: f0, ai: 2 }, { faction: f1, ai: 2 }] });
const t0 = Date.now(); let maxMs = 0;
const chron: string[] = [];
for (let i = 0; i < years * 9600 && !w.over; i++) {
  const a = performance.now(); tick(w); maxMs = Math.max(maxMs, performance.now() - a);
  for (const e of w.ev) if ((e.t === 'chron' || e.t === 'alert') && process.argv.includes('-v')) chron.push(`${(w.tick / 20) | 0}s p${e.p}: ${e.msg}`);
  w.ev.length = 0;
  if (w.tick % 2400 === 0) {
    const line = w.players.map(p => {
      const us = w.units.filter(u => u.owner === p.id);
      return `${FACTION_NAME[p.faction].slice(0, 6)} r${p.rank} res ${p.res.map(r => (r / 10000) | 0).join('/')} nép ${p.pop}/${p.cap} munkás ${us.filter(u => u.def.id === 'jobbagy').length} had ${us.filter(u => u.def.osztaly !== 'munkas').length} zsold ${wageDemand(w, p.id)} ép ${w.buildings.filter(b => b.owner === p.id).length} falu ${w.villages.filter(v => v.owner === p.id).length} [${p.aiState?.mode}]`;
    }).join('  |  ');
    console.log(`${String((w.tick / 20) | 0).padStart(5)}s  ${line}`);
  }
}
if (chron.length) console.log(chron.join('\n'));
console.log(`vége: tick ${w.tick}, győztes csapat ${w.winner}, ${Date.now() - t0} ms, leglassabb tick ${maxMs.toFixed(1)} ms`);
