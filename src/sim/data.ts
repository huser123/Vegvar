// A szabálykönyv 2., 7., 8. és 11. fejezetének táblázatai. A számok a dokumentum értékei;
// a szimuláció induláskor egész egységekre váltja őket (tick, ezredcsempe, ezrelék).

export type ResKey = 'e' | 'f' | 'k' | 'z';
export type Res = [number, number, number, number]; // E, F, K, Z
export type DmgType = 0 | 1 | 2 | 3; // vágó, szúró, lövő, zúzó
export const VAGO = 0, SZURO = 1, LOVO = 2, ZUZO = 3;
export type Armor = [number, number, number, number];

export type Faction = 0 | 1 | 2; // 0 Végváriak, 1 Oszmán had, 2 Császáriak
export const VEGVARI = 0, OSZMAN = 1, CSASZARI = 2;
export const FACTION_NAME = ['Végváriak', 'Oszmán had', 'Császáriak'];
export const FACTION_ID = ['vegvari', 'oszman', 'csaszari'];

export type UnitClass = 'munkas' | 'gyalog' | 'lovesz' | 'lovas' | 'ostrom' | 'hajo';

// Terep
export const T = { RET: 0, UT: 1, SZANTO: 2, ERDO: 3, DOMB: 4, MOCSAR: 5, FOLYO: 6, GAZLO: 7, JEG: 8, KO: 9 } as const;
export const TERRAIN_NAME = ['rét', 'út', 'szántó', 'erdő', 'domb', 'mocsár', 'folyó', 'gázló', 'jég', 'kőlelőhely'];
// Mozgásosztály: 0 gyalog/lövész/munkás, 1 lovas, 2 ostrom, 3 hajó. Ezrelék; 0 = járhatatlan.
export const MOVE_MULT: number[][] = [
  /* ret    */ [1000, 1000, 1000, 0],
  /* ut     */ [1250, 1250, 1250, 0],
  /* szanto */ [900, 900, 900, 0],
  /* erdo   */ [700, 500, 0, 0],
  /* domb   */ [800, 700, 500, 0],
  /* mocsar */ [500, 300, 0, 0],
  /* folyo  */ [0, 0, 0, 1000],
  /* gazlo  */ [500, 500, 400, 1000],
  /* jeg    */ [800, 700, 0, 0],
  /* ko     */ [0, 0, 0, 0],
];
export const SEASON_MOVE = [900, 1000, 1000, 900];
export const SEASON_NAME = ['Tavasz', 'Nyár', 'Ősz', 'Tél'];
export const YEAR = 480, SEASON_LEN = 120, PAYDAY = 300;
export const TICKS = 20;

export interface UnitDef {
  id: string; nev: string; frakcio: Faction | -1; osztaly: UnitClass;
  hp: number; tam: number; tipus: DmgType; ujr: number; tav: number; minTav: number;
  pancel: Armor; seb: number; latas: number; ar: Res; zsold: number; nep: number;
  kepzes: number; hol: string[]; rang: number;
  pontossag: number; szoras: number; epuletSzorzo: number; telepites: number;
  bonusz: Partial<Record<UnitClass, number>>;
  kozelharc?: { tam: number; ujr: number };
  j: Set<string>; // jellemzők
  leiras: string;
}

function u(id: string, nev: string, frakcio: Faction | -1, osztaly: UnitClass, hp: number, tam: number, tipus: DmgType,
  ujr: number, tav: number, pancel: Armor, seb: number, latas: number, ar: Res, zsold: number, nep: number,
  kepzes: number, hol: string[], rang: number, jell: string[], leiras: string, x: Partial<UnitDef> = {}): UnitDef {
  return { id, nev, frakcio, osztaly, hp, tam, tipus, ujr, tav, minTav: 0, pancel, seb, latas, ar, zsold, nep, kepzes, hol, rang,
    pontossag: 1, szoras: 0, epuletSzorzo: 1, telepites: 0, bonusz: {}, j: new Set(jell), leiras, ...x };
}

export const UNITS: Record<string, UnitDef> = {};
for (const d of [
  u('jobbagy', 'Jobbágy', -1, 'munkas', 30, 2, VAGO, 2.0, 0, [0, 0, 0, 0], 1.0, 5, [50, 0, 0, 0], 0, 1, 20, ['var'], 1, [], 'Épít, gyűjt, vet és arat.'),
  u('kapitany', 'Kapitány', -1, 'lovas', 250, 16, VAGO, 1.5, 0, [4, 4, 2, 0], 1.6, 8, [0, 0, 0, 0], 0, 0, 90, ['var'], 1, ['vezer'], 'Vezér: közelében nő a morál. Ha elesik, a várban újraéled.'),
  u('naszad', 'Naszád', -1, 'hajo', 200, 12, LOVO, 3.0, 6, [3, 4, 2, 0], 1.6, 7, [0, 150, 0, 30], 4, 2, 40, ['rev'], 2, [], 'Folyami hadihajó. Télen befagy.', { pontossag: 0.7 }),
  // Végváriak
  u('darabont', 'Darabont', 0, 'gyalog', 70, 8, SZURO, 1.8, 1, [3, 2, 0, 0], 0.9, 6, [50, 25, 0, 0], 2, 1, 20, ['kaszarnya'], 1, ['hazai', 'pika'], 'Pikás gyalog. Vonalban megtöri a lovasrohamot.', { bonusz: { lovas: 10 } }),
  u('hajdu', 'Hajdú', 0, 'lovesz', 45, 14, LOVO, 4.0, 6, [1, 1, 0, 0], 1.1, 7, [45, 20, 0, 0], 3, 1, 22, ['kaszarnya'], 1, ['hazai'], 'Puskás hajdú. Ősszel aratni is tud.', { pontossag: 0.75, kozelharc: { tam: 5, ujr: 1.5 } }),
  u('huszar', 'Huszár', 0, 'lovas', 85, 10, VAGO, 1.5, 0, [2, 1, 0, 0], 1.8, 8, [70, 0, 0, 30], 5, 2, 30, ['istallo'], 2, ['hazai', 'portya', 'roham'], 'Könnyűlovas. Portyázik, falut éget, rohamoz.'),
  u('vitez', 'Végvári vitéz', 0, 'gyalog', 95, 12, VAGO, 1.6, 0, [4, 3, 1, 0], 1.0, 6, [60, 0, 0, 40], 5, 1, 28, ['kaszarnya'], 2, ['hazai', 'allhatatos'], 'Szablyás vitéz. A vár alatt nem hátrál.'),
  u('tarack', 'Tarack', 0, 'ostrom', 60, 40, ZUZO, 8.0, 9, [0, 5, 2, 0], 0.5, 7, [0, 80, 60, 60], 6, 3, 45, ['agyuonto'], 3, [], 'Könnyű ágyú. Épület ellen kétszeres sebzés.', { minTav: 2, szoras: 1, epuletSzorzo: 2, telepites: 3 }),
  // Oszmán had
  u('azab', 'Azab', 1, 'gyalog', 40, 6, VAGO, 1.5, 0, [0, 0, 0, 0], 1.1, 6, [30, 0, 0, 0], 1, 1, 12, ['kaszarnya', 'satortabor'], 1, ['birodalmi'], 'Olcsó, gyorsan képezhető gyalog.'),
  u('akindzsi', 'Akindzsi', 1, 'lovas', 65, 8, VAGO, 1.4, 0, [1, 0, 0, 0], 2.0, 9, [50, 0, 0, 10], 1, 2, 22, ['istallo', 'satortabor'], 1, ['birodalmi', 'portya', 'gyujtogato'], 'Portyázó könnyűlovas. Gyújtogat.'),
  u('janicsar', 'Janicsár', 1, 'lovesz', 60, 18, LOVO, 3.5, 7, [2, 2, 1, 0], 1.0, 7, [60, 20, 0, 30], 6, 1, 30, ['kaszarnya'], 2, ['birodalmi'], 'Elit puskás. Zsold nélkül fellázad.', { pontossag: 0.85, kozelharc: { tam: 8, ujr: 1.5 } }),
  u('szpahi', 'Szpáhi', 1, 'lovas', 120, 13, VAGO, 1.7, 0, [4, 3, 1, 0], 1.5, 7, [90, 0, 0, 40], 0, 2, 35, ['istallo'], 2, ['birodalmi', 'roham', 'timar'], 'Nehézlovas, zsoldot nem kér. Száma a szántóktól és falvaktól függ.'),
  u('lagumdzsi', 'Lagumdzsi', 1, 'gyalog', 35, 3, VAGO, 2.0, 0, [0, 0, 0, 0], 1.0, 5, [40, 0, 0, 20], 2, 1, 20, ['kaszarnya'], 2, ['birodalmi', 'aknasz'], 'Aknász. Fal és torony alá ás.'),
  u('agyu', 'Ostromágyú', 1, 'ostrom', 90, 90, ZUZO, 12.0, 11, [0, 6, 3, 0], 0.3, 7, [0, 150, 100, 100], 10, 4, 70, ['agyuonto'], 3, ['nehez'], 'Falrontó ágyú. Épület ellen háromszoros sebzés.', { minTav: 3, szoras: 1, epuletSzorzo: 3, telepites: 6 }),
  // Császáriak
  u('landsknecht', 'Landsknecht', 2, 'gyalog', 85, 10, SZURO, 1.8, 1, [4, 3, 1, 0], 0.85, 6, [60, 20, 0, 20], 6, 1, 24, ['kaszarnya'], 1, ['zsoldos', 'pika'], 'Pikás zsoldos. Vonalban megtöri a rohamot.', { bonusz: { lovas: 12 } }),
  u('musketas', 'Muskétás', 2, 'lovesz', 50, 20, LOVO, 4.5, 7, [1, 1, 0, 0], 0.9, 7, [50, 25, 0, 25], 6, 1, 26, ['kaszarnya'], 2, ['zsoldos'], 'Nagy tűzerejű lövész.', { pontossag: 0.8, kozelharc: { tam: 4, ujr: 1.5 } }),
  u('vertes', 'Vértes', 2, 'lovas', 140, 14, VAGO, 1.8, 0, [6, 4, 3, 0], 1.3, 7, [100, 0, 0, 60], 9, 2, 40, ['istallo'], 2, ['zsoldos', 'roham', 'nehez'], 'Páncélos nehézlovas. Jégre nem léphet.'),
  u('hadmernok', 'Hadmérnök', 2, 'munkas', 40, 3, VAGO, 2.0, 0, [1, 1, 0, 0], 1.0, 6, [50, 0, 0, 30], 3, 1, 25, ['var'], 2, ['zsoldos'], 'Kőből gyorsan épít, gyorsan javít, észleli az aknát.'),
  u('mozsar', 'Mozsár', 2, 'ostrom', 70, 70, ZUZO, 14.0, 10, [0, 5, 2, 0], 0.4, 7, [0, 120, 80, 90], 9, 3, 60, ['agyuonto'], 3, ['zsoldos', 'gyujtogato'], 'Ívelt lövés a fal mögé. Gyújt.', { minTav: 4, szoras: 2, epuletSzorzo: 2.5, telepites: 5 }),
]) UNITS[d.id] = d;

export type ArmorKind = 'fa' | 'palank' | 'ko';
export const BARMOR: Record<ArmorKind, Armor> = { fa: [3, 8, 6, 0], palank: [5, 10, 8, 8], ko: [8, 12, 10, 4] };

export interface BuildingDef {
  id: string; nev: string; frakcio: Faction[]; rang: number; rangF?: number[]; // rangF: frakciónkénti rang
  ar: Res; epites: number; hp: number; kat: ArmorKind; w: number; h: number;
  nep: number; szallas: number; helyorseg: number; latas: number;
  tamadas?: { tam: number; tipus: DmgType; ujr: number; tav: number; minTav: number; szoras: number; pontossag: number };
  lerako: ResKey[]; fal: boolean; kapu: boolean; jarhato: boolean; gazdasagi: boolean; leiras: string;
}
const ALL: Faction[] = [0, 1, 2];
function b(id: string, nev: string, frakcio: Faction[], rang: number, ar: Res, epites: number, hp: number, kat: ArmorKind,
  w: number, h: number, leiras: string, x: Partial<BuildingDef> = {}): BuildingDef {
  return { id, nev, frakcio, rang, ar, epites, hp, kat, w, h, nep: 0, szallas: 0, helyorseg: 0, latas: 6, lerako: [],
    fal: false, kapu: false, jarhato: false, gazdasagi: false, leiras, ...x };
}
export const BUILDINGS: Record<string, BuildingDef> = {};
for (const d of [
  b('var', 'Vár', ALL, 1, [0, 0, 0, 0], 0, 2500, 'ko', 4, 4, 'Lerakóhely mindenre. Jobbágyot képez, rangot emel. Elvesztése vereség.',
    { nep: 10, szallas: 8, helyorseg: 15, lerako: ['e', 'f', 'k'], tamadas: { tam: 8, tipus: SZURO, ujr: 2, tav: 7, minTav: 0, szoras: 0, pontossag: 0.9 } }),
  b('haz', 'Ház', ALL, 1, [0, 30, 0, 0], 20, 250, 'fa', 2, 2, '+5 népesség, téli szállás 6 csempés körben.', { nep: 5, szallas: 6 }),
  b('szanto', 'Szántó', ALL, 1, [0, 60, 0, 0], 15, 100, 'fa', 3, 3, 'Tavasszal vetni, ősszel aratni kell. Ártéren többet terem.', { jarhato: true, gazdasagi: true }),
  b('malom', 'Malom', ALL, 1, [0, 100, 0, 0], 35, 400, 'fa', 2, 2, 'Élelem-lerakó. 6 csempén belül a szántók hozama ×1,15.', { lerako: ['e'], gazdasagi: true }),
  b('fatelep', 'Fatelep', ALL, 1, [0, 80, 0, 0], 25, 300, 'fa', 2, 2, 'Fa-lerakó.', { lerako: ['f'], gazdasagi: true }),
  b('kobanya', 'Kőbánya', ALL, 1, [0, 100, 0, 0], 25, 300, 'fa', 2, 2, 'Kő-lerakó.', { lerako: ['k'], gazdasagi: true }),
  b('karam', 'Karám', ALL, 1, [0, 120, 0, 0], 30, 300, 'fa', 3, 3, 'Négy marha hizlalható benne, ha van elég rét körülötte.', { gazdasagi: true }),
  b('kaszarnya', 'Kaszárnya', ALL, 1, [0, 150, 0, 0], 40, 800, 'fa', 3, 3, 'Gyalogost és lövészt képez.'),
  b('ortorony', 'Őrtorony', ALL, 1, [0, 100, 50, 0], 35, 500, 'palank', 1, 1, 'Lő a közeledő ellenségre. Helyőrség 5.',
    { helyorseg: 5, latas: 10, tamadas: { tam: 10, tipus: SZURO, ujr: 2, tav: 7, minTav: 0, szoras: 0, pontossag: 0.9 } }),
  b('palank', 'Palánkfal', ALL, 1, [0, 10, 0, 0], 6, 600, 'palank', 1, 1, 'Olcsó, jól állja az ágyút, de ég.', { fal: true }),
  b('palank_kapu', 'Palánkkapu', ALL, 1, [0, 40, 0, 0], 15, 700, 'palank', 1, 2, 'Saját egységnek átjárható.', { fal: true, kapu: true }),
  b('rev', 'Rév', ALL, 1, [0, 120, 0, 0], 30, 500, 'fa', 2, 3, 'Folyóparti élelem-lerakó. Naszádot épít.', { lerako: ['e'] }),
  b('strazsa', 'Strázsahely', [0], 1, [0, 30, 0, 0], 10, 150, 'fa', 1, 1, 'Messzire lát. Lármafája riaszt és bátorít.', { latas: 10 }),
  b('satortabor', 'Sátortábor', [1], 1, [0, 100, 0, 0], 20, 400, 'fa', 3, 3, 'Azabot és akindzsit képez. +5 népesség. Télen nem ad szállást.', { nep: 5, szallas: 5 }),
  b('vasarter', 'Vásártér', ALL, 2, [0, 150, 50, 0], 40, 600, 'fa', 3, 3, 'Nyersanyag adásvétele zsoldért, marha eladása.', { gazdasagi: true }),
  b('istallo', 'Istálló', ALL, 2, [50, 175, 0, 0], 45, 800, 'fa', 3, 3, 'Lovasságot képez.'),
  b('kovacs', 'Kovács', ALL, 2, [0, 150, 50, 0], 40, 600, 'fa', 2, 2, 'Fegyver- és páncélfejlesztések.'),
  b('dzsami', 'Dzsámi', [1], 2, [0, 150, 100, 0], 50, 900, 'ko', 3, 3, '8 csempén belül gyógyít és morált ad.'),
  b('toborzo', 'Toborzóhely', [2], 2, [0, 150, 0, 50], 30, 500, 'fa', 2, 2, 'Katona azonnal, tiszta zsoldért.'),
  b('kofal', 'Kőfal', ALL, 3, [0, 0, 20, 0], 14, 1800, 'ko', 1, 1, 'Nem ég, de drága.', { fal: true, rangF: [3, 3, 2] }),
  b('ko_kapu', 'Kőkapu', ALL, 3, [0, 20, 60, 0], 30, 2000, 'ko', 1, 2, 'Saját egységnek átjárható kőkapu.', { fal: true, kapu: true, rangF: [3, 3, 2] }),
  b('agyuonto', 'Ágyúöntő', ALL, 3, [0, 200, 150, 0], 60, 900, 'ko', 3, 3, 'Ostromgépeket önt.'),
  b('bastya', 'Bástya', [2], 3, [0, 100, 250, 0], 70, 3000, 'ko', 3, 3, 'Ágyús kőbástya. Évszakonként hadisegélyt hoz.',
    { helyorseg: 10, tamadas: { tam: 45, tipus: ZUZO, ujr: 8, tav: 10, minTav: 2, szoras: 1, pontossag: 1 } }),
]) BUILDINGS[d.id] = d;

export interface TechDef { id: string; nev: string; hol: string; rang: number; ar: Res; ido: number; frakcio?: Faction; leiras: string }
export const TECHS: Record<string, TechDef> = {};
for (const t of [
  ['vasalt_eke', 'Vasalt eke', 'malom', 1, [100, 50, 0, 0], 30, 'Szántóhozam ×1,2'],
  ['gabonaverem', 'Gabonaverem', 'malom', 2, [0, 150, 50, 0], 40, 'Téli élelemfogyasztás ×1,25 (×1,5 helyett)'],
  ['fureszmalom', 'Fűrészmalom', 'fatelep', 2, [100, 100, 0, 0], 40, 'Favágás 0,60 F/s'],
  ['ekcsakany', 'Ékcsákány', 'kobanya', 2, [100, 100, 0, 0], 40, 'Kőfejtés 0,38 K/s'],
  ['edzett_penge', 'Edzett penge', 'kovacs', 2, [150, 0, 50, 0], 40, 'Vágó és szúró támadás +2'],
  ['sodronying', 'Sodronying', 'kovacs', 2, [150, 0, 75, 0], 40, 'Gyalog és lovas páncél +1/+1/0/0'],
  ['mellvert', 'Mellvért', 'kovacs', 3, [200, 0, 100, 50], 60, 'Gyalog és lovas páncél +1/+1/+1/0'],
  ['papirtolteny', 'Papírtöltény', 'kovacs', 2, [100, 100, 0, 50], 45, 'Lövész újratöltés ×0,85'],
  ['kereklakat', 'Keréklakatos puska', 'kovacs', 3, [0, 200, 0, 150], 60, 'Az eső nem rontja a lőfegyver pontosságát'],
  ['tuzes_golyo', 'Tüzes golyó', 'agyuonto', 3, [0, 150, 100, 100], 60, 'A tarack és az ágyú gyújt'],
  ['fuleskosar', 'Sánckosár', 'agyuonto', 3, [0, 200, 0, 50], 45, 'Telepített ostromgép szúró és lövő páncélja +4'],
  ['olasz_bastya', 'Olasz bástya', 'var', 3, [0, 0, 300, 100], 70, 'Kőfal és bástya zúzó páncélja 4 → 8', 2],
] as [string, string, string, number, Res, number, string, Faction?][])
  TECHS[t[0]] = { id: t[0], nev: t[1], hol: t[2], rang: t[3], ar: t[4], ido: t[5], leiras: t[6], frakcio: t[7] };

export const RANK_NAME = ['', 'Palánk', 'Végház', 'Főkapitányság'];
export const RANKS = [null, null,
  { ar: [400, 200, 0, 0] as Res, ido: 60, kell: ['kaszarnya', 'malom'] },
  { ar: [500, 0, 300, 150] as Res, ido: 90, kell: ['kovacs', 'vasarter'] }];

export function buildingRank(d: BuildingDef, f: Faction): number { return d.rangF ? d.rangF[f] : d.rang; }
export function buildingCost(d: BuildingDef, f: Faction): Res {
  // Végváriak: fa- és palánképületek ára ×0,8
  if (f === VEGVARI && d.kat !== 'ko') return d.ar.map(v => Math.round(v * 0.8)) as Res;
  return d.ar;
}
export function unitsTrainedAt(bid: string, f: Faction): UnitDef[] {
  return Object.values(UNITS).filter(u => u.hol.includes(bid) && (u.frakcio === -1 || u.frakcio === f) && u.id !== 'kapitany');
}
export function buildingsOf(f: Faction): BuildingDef[] {
  return Object.values(BUILDINGS).filter(d => d.frakcio.includes(f) && d.id !== 'var');
}
export function techsAt(bid: string, f: Faction): TechDef[] {
  return Object.values(TECHS).filter(t => t.hol === bid && (t.frakcio === undefined || t.frakcio === f));
}
