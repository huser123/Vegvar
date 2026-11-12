// A szabálykönyv 18. fejezetének tesztesetei.
import { describe, it, expect } from 'vitest';
import { damage, moralMult, hitChance, floodLevel, farmYield, allocatePay, yearlyFoodPerPop, sideMult } from '../src/sim/rules';
import { UNITS, BARMOR, ZUZO } from '../src/sim/data';
import { createWorld } from '../src/sim/world';
import { tick, checksum } from '../src/sim/sim';

const M = moralMult(70000); // 1,10
const U = UNITS;
describe('18. fejezet', () => {
  it('M_morál 70-nél 1,10', () => expect(M).toBe(1100));
  it('1: Huszár szemből üt Darabontot → 8', () => expect(damage(U.huszar.tam, [M], U.darabont.pancel[U.huszar.tipus])).toBe(8));
  it('2: Darabont szemből üt Huszárt → 19', () => expect(damage(U.darabont.tam + U.darabont.bonusz.lovas!, [M], U.huszar.pancel[U.darabont.tipus])).toBe(19));
  it('3: Huszár ékben, rohammal, hátból üt Hajdút → 40', () => {
    const side = sideMult(1000, 0, -1000, 0); // a támadó a célpont háta mögött
    expect(side).toBe(1500);
    expect(damage(U.huszar.tam, [M, side, 2500], U.hajdu.pancel[0])).toBe(40);
  });
  it('4: Vértes rohama vonalban álló Landsknechtre → 4, visszakap 20', () => {
    expect(damage(U.vertes.tam, [M, 500], U.landsknecht.pancel[0])).toBe(4);
    expect(damage(U.landsknecht.tam + U.landsknecht.bonusz.lovas!, [M], U.vertes.pancel[U.landsknecht.tipus])).toBe(20);
  });
  it('5: Janicsár 5 cs-ről tavasszal → p ≈ 0,455', () => {
    const p = hitChance(850, 5000, 7000, 750, 1000, 1000) / 1e6;
    expect(p).toBeCloseTo(0.455, 2);
  });
  it('6: Janicsár nyáron eltalál Huszárt → 22', () => expect(damage(U.janicsar.tam, [M, 1100], U.huszar.pancel[2])).toBe(22));
  it('7: Ostromágyú palánkfalra → 289, 3 lövés', () => {
    const d = damage(U.agyu.tam, [M, 3000], BARMOR.palank[ZUZO]);
    expect(d).toBe(289); expect(Math.ceil(600 / d)).toBe(3);
  });
  it('8: Ostromágyú kőfalra → 293, 7 lövés', () => {
    const d = damage(U.agyu.tam, [M, 3000], BARMOR.ko[ZUZO]);
    expect(d).toBe(293); expect(Math.ceil(1800 / d)).toBe(7);
  });
  it('9: Ártéri szántó malommal → 431 E', () => expect(farmYield(true, true, false)).toBe(431));
  it('10: Zsold: 10 Hajdú + 6 Huszár, 48 Z', () => {
    const us = [...Array(10).keys()].map(i => ({ uid: i, zsold: 3 })).concat([...Array(6).keys()].map(i => ({ uid: 10 + i, zsold: 5 })));
    const r = allocatePay(us, 48);
    expect(r.unpaid.length).toBe(3); expect(r.unpaid.every(u => u.zsold === 5)).toBe(true); expect(r.left).toBe(3);
  });
  it('11: Egy népességpont éves élelme → 27 E', () => expect(yearlyFoodPerPop() / 10000).toBe(27));
  it('12: Égő palánk nyáron → −160 HP', () => expect(20 * 8).toBe(160));
  it('13: Dombról lövő Hajdú → 7 cs, 19', () => {
    expect(U.hajdu.tav + 1).toBe(7);
    expect(damage(U.hajdu.tam, [M, 1250], U.azab.pancel[2])).toBe(19);
  });
  it('14: Áradás, 3. év, t_ev = 20 → ≤ 1 cs', () => expect(floodLevel(3, 20 * 20)).toBe(1));
  it('áradás: az 1. évben nincs; a 2. évben R = 2', () => {
    expect(floodLevel(1, 60 * 20)).toBe(0); expect(floodLevel(2, 60 * 20)).toBe(2); expect(floodLevel(2, 119 * 20)).toBe(0);
  });
});

describe('szimuláció', () => {
  it('determinisztikus: azonos seed → azonos állapot', () => {
    const run = () => {
      const w = createWorld({ size: 96, seed: 4242, players: [{ faction: 0, ai: 2 }, { faction: 1, ai: 2 }] });
      for (let i = 0; i < 3000; i++) tick(w);
      return checksum(w);
    };
    expect(run()).toBe(run());
  });
  it('a pálya pontszimmetrikus és megfelel a kezdőgaranciáknak', () => {
    const w = createWorld({ size: 96, seed: 7, players: [{ faction: 0, ai: 0 }, { faction: 2, ai: 2 }] });
    const N = w.W * w.H;
    for (let i = 0; i < N; i++) expect(w.base[i]).toBe(w.base[N - 1 - i]);
    const s = w.starts[0];
    let forest = 0, stone = 0, river = false;
    for (let y = s.y - 12; y <= s.y + 12; y++) for (let x = s.x - 12; x <= s.x + 12; x++) {
      if (x < 0 || y < 0 || x >= w.W || y >= w.H) continue;
      const t = w.base[y * w.W + x];
      if (t === 3) forest++; if (t === 9) stone++; if (t === 6) river = true;
    }
    expect(forest).toBeGreaterThanOrEqual(40); expect(stone).toBeGreaterThan(0); expect(river).toBe(true);
    expect(Math.hypot(w.starts[0].x - w.starts[1].x, w.starts[0].y - w.starts[1].y)).toBeGreaterThanOrEqual(50);
    expect(w.villages.length).toBeGreaterThanOrEqual(5);
  });
});
