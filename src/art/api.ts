// A grafikai modulok közös szerződése. Minden sprite procedurálisan, futásidőben készül
// (külső képfájl nincs), 1× pixelméretben, simítás nélkül; a modulok kulcs szerint gyorsítótáraznak.
//
// Vetítés: 2:1 izometria. A (tx,ty) csempe-SAROK képernyőpontja: x = (tx − ty) × 32, y = (tx + ty) × 16.
// A csempe a sarokpontjától jobbra-le és balra-le nyíló 64×32-es rombusz; közepe (tx+0.5, ty+0.5).
// A +x csempetengely a képernyőn jobbra-le, a +y balra-le mutat.
// Fény: bal-fentről. A képernyő bal-alja felé néző falak világosak, a jobb-alja felé nézők sötétek;
// az árnyék jobbra-le vetül (≈35% fekete).

export const TW = 64, TH = 32;
export const HILL_H = 14; // a domb (magasság 1) csempéinek függőleges emelése pixelben

export interface Sprite {
  c: HTMLCanvasElement;
  ax: number; ay: number; // horgony: ctx.drawImage(c, sx − ax, sy − ay)
}

export type Season = 0 | 1 | 2 | 3; // tavasz, nyár, ősz, tél
export type FactionIdx = 0 | 1 | 2; // végvári, oszmán, császári
// Csapatszín-index: 0 rézvörös, 1 zöld, 2 sárga, 3 kék, 4 semleges szürke (lázadó, gazdátlan)
export type Team = 0 | 1 | 2 | 3 | 4;

export interface GroundSource {
  w: number; h: number;
  type(tx: number, ty: number): number; // T.* (pályán kívül: −1)
  height(tx: number, ty: number): number; // 0 | 1
  flooded(tx: number, ty: number): boolean; // áradás miatt ideiglenes mocsár
}

// ---- terrain.ts ----
// drawGround(ctx, src, season, x0, y0, x1, y1, ox, oy): az [x0,x1)×[y0,y1) csempék talaját rajzolja úgy,
// hogy a (tx,ty) sarok az (ox + (tx−ty)×32, oy + (tx+ty)×16) pixelre kerül. Egy csempe képe csak a csempétől
// és 8 szomszédjától függhet (koordináta-hash a változatokhoz), hogy a darabokban (chunk) rajzolt talaj
// varrat nélkül illeszkedjen. A domb csempéi HILL_H-val emelve, lejtő/perem árnyalással.
// waterOverlay(frame 0..7): csempeméretű csillogás a folyóra (horgony: a csempe felső sarka).
//
// ---- objects.ts ----
// treeSprite(season, variant 0..7), stumpSprite(), stoneSprite(variant 0..3, level 0..2 — 2 = majdnem kimerült),
// villageSprite(season, burnt) — 3×3 csempés lábnyom, horgony a lábnyom közepének talajpontja.
// Fa horgonya a törzs töve.
//
// ---- buildings.ts ----
export interface BuildingSpriteOpts {
  faction: FactionIdx; team: Team; season: Season;
  stage: 0 | 1 | 2 | 3;   // 0 alapozás, 1–2 állványzat, 3 kész
  rot?: 0 | 1;            // 1 = a lábnyom tengelyei felcserélve (w×h helyett h×w), pl. kapu, rév
  mask?: number;          // falaknál a szomszédos falszegmensek bitmaszkja: 1 = (x,y−1), 2 = (x+1,y), 4 = (x,y+1), 8 = (x−1,y)
  farm?: 0 | 1 | 2;       // szántó: ugar, vetett, érett
  cattle?: number;        // karám: kész marhák száma 0..4
}
// buildingSprite(id, opts): horgony a lábnyom közepének talajpontja. rubbleSprite(w, h): rom.
//
// ---- units.ts ----
// Irány (képernyőn): 0 fel, 1 jobbra-fel, 2 jobbra, 3 jobbra-le, 4 le, 5 balra-le, 6 balra, 7 balra-fel.
export type UnitAnim = 'all' | 'megy' | 'tamad' | 'munka' | 'hal';
export interface UnitSpriteOpts { carry?: 'e' | 'f' | 'k' | null }
// unitSprite(id, team, dir, anim, frame, opts?): horgony a talpak közti talajpont.
// UNIT_FRAMES: Record<UnitAnim, number> — minden egységre azonos képkockaszám; a 'hal' utolsó kockája a tetem.
// animalSprite('szarvas' | 'marha', dir, frame 0..3) — 0. kocka áll, 1–3 jár.
//
// ---- effects.ts ----
export type FxKind = 'tuz' | 'fust' | 'robbanas' | 'loves' | 'golyo' | 'por' | 'csobbanas' | 'talalat';
// fxSprite(kind, frame), FX_FRAMES: Record<FxKind, number>; flagSprite(team, frame 0..3) — horgony a rúd töve.
//
// ---- ui.ts ----
// uiTexture('fa' | 'ko' | 'pergamen' | 'vas', w, h): csempézhető felület.
// frameMotif(faction): vízszintesen ismételhető 16 px magas szegélycsík (palánk karósor / iznik rács / vasalás).
// sujtas(): 10 px magas huszárzsinór-csík kiemeléshez.
// icon(id, size): négyzetes ikon; id-k: res_e res_f res_k res_z res_nep, unit_<id>, tech_<id>, cmd_<név>.
// crest(faction, size): címer. cursor(kind): { c, hx, hy } 32×32 egérmutató.
