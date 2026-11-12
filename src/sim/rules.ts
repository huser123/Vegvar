// Tiszta, állapot nélküli szabályfüggvények – egész aritmetikával. A 18. fejezet tesztjei ezeket hívják.
import { YEAR } from './data';

/** xorshift32 – a szimuláció egyetlen véletlenforrása. Visszaad: [új állapot, érték 0..2^32-1]. */
export function xs32(s: number): number {
  s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
  return s >>> 0;
}

export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r--;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

/** round = fél felfelé, egész számlálóval és nevezővel. */
export function roundDiv(n: number, d: number): number { return Math.floor((2 * n + d) / (2 * d)); }

/** M_morál ezrelékben: 0,75 + 0,5 × morál/100. A morál ezredben (70 000 = 70). */
export function moralMult(moralMilli: number): number { return 750 + Math.floor(5 * moralMilli / 1000); }

/**
 * Sebzésképlet (9.1). tam: támadás + osztálybónusz; mults: ezrelékes szorzók (morál, oldal, magasság, roham,
 * évszak, státusz, épületszorzó); armor: a célpont páncélja az adott sebzéstípusra.
 */
export function damage(tam: number, mults: number[], armor: number): number {
  let num = BigInt(tam), den = 1n;
  for (const m of mults) { if (m !== 1000) { num *= BigInt(m); den *= 1000n; } }
  // round(num/den − armor), fél felfelé
  const v = (2n * num - 2n * BigInt(armor) * den + den) / (2n * den);
  const r = (2n * num - 2n * BigInt(armor) * den + den) < 0n ? 0 : Number(v);
  return Math.max(1, r);
}

/** Oldal/hát szorzó (9.5): fx,fy a célpont nézési iránya, ax,ay a célponttól a támadó felé mutató vektor. */
export function sideMult(fx: number, fy: number, ax: number, ay: number): number {
  const dot = fx * ax + fy * ay;
  const ff = fx * fx + fy * fy, aa = ax * ax + ay * ay;
  if (ff === 0 || aa === 0) return 1000;
  const q = 4 * dot * dot, lim = ff * aa; // cos² ≥ 1/4  ⇔  |cos| ≥ 0,5
  if (dot >= 0 && q >= lim) return 1000;      // 0–60°: szemből
  if (dot >= 0 || q <= lim) return 1250;      // 60–120°: oldalból
  return 1500;                                // 120–180°: hátból
}
export function isFront(fx: number, fy: number, ax: number, ay: number): boolean { return sideMult(fx, fy, ax, ay) === 1000; }

/** Találati esély (9.2) milliomodban. dist és range ezredcsempében; szorzók ezrelékben. */
export function hitChance(accMilli: number, dist: number, range: number, rain: number, cover: number, loose: number): number {
  const d = Math.min(dist, range);
  // p = acc × (1 − 0,4 × d/range) × ...
  let p = accMilli * (1000 * range - 400 * d) / range; // ezrelék × ezrelék = milliomod
  p = p * rain / 1000; p = p * cover / 1000; p = p * loose / 1000;
  return Math.floor(p);
}

/** Áradási szint (3. fejezet): az elöntött sáv szélessége csempében. tEv másodpercben (tört is lehet tickből). */
export function floodLevel(year: number, tickInYear: number, ticksPerSec = 20): number {
  if (year < 2) return 0;
  const R = year % 3 === 0 ? 3 : 2;
  const t = tickInYear, a = 40 * ticksPerSec, b = 80 * ticksPerSec, c = 120 * ticksPerSec;
  if (t < 0 || t >= c) return 0;
  if (t < a) return Math.floor(R * t / a);
  if (t < b) return R;
  return Math.floor(R * (c - t) / (c - b));
}

/** Szántóhozam (4.3), egész élelem. */
export function farmYield(arter: boolean, malom: boolean, tech: boolean): number {
  let n = 300 * 1000;
  if (arter) n = n * 1250 / 1000;
  if (malom) n = n * 1150 / 1000;
  if (tech) n = n * 1200 / 1000;
  return Math.floor(n / 1000);
}

/** Fizetőnapi kifizetés (5.1): zsold szerint növekvő, azonos zsoldnál a régebbi (kisebb uid) előbb. */
export function allocatePay<T extends { uid: number; zsold: number }>(units: T[], z: number): { paid: T[]; unpaid: T[]; left: number } {
  const need = units.reduce((s, u) => s + u.zsold, 0);
  if (z >= need) return { paid: units.slice(), unpaid: [], left: z - need };
  const sorted = units.slice().sort((a, b) => a.zsold - b.zsold || a.uid - b.uid);
  const paid: T[] = [], unpaid: T[] = [];
  for (const u of sorted) { if (u.zsold <= z) { z -= u.zsold; paid.push(u); } else unpaid.push(u); }
  return { paid, unpaid, left: z };
}

/** Egy népességpont éves élelemigénye (4.8), tízezred egységben. */
export function yearlyFoodPerPop(winterMult = 1500): number {
  return (YEAR - 120) * 500 + 120 * (500 * winterMult / 1000);
}

export function seasonOf(tickInYear: number, ticksPerSec = 20): number { return Math.floor(tickInYear / (120 * ticksPerSec)) & 3; }
