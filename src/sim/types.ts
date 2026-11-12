import type { UnitDef, BuildingDef, Faction } from './data';

export const FP = 1000;      // pozíció: ezredcsempe
export const HPU = 1000;     // életerő és morál: ezred
export const RU = 10000;     // nyersanyag: tízezred egység
export const CARRY_MAX = 10 * RU;

export type OrderKind = 'move' | 'amove' | 'attack' | 'gather' | 'build' | 'repair' | 'garrison' | 'patrol'
  | 'burn' | 'mine' | 'douse' | 'raid' | 'hold';
export interface Order {
  k: OrderKind;
  x?: number; y?: number;   // célpont (FP) vagy csempe (gather)
  x0?: number; y0?: number; // őrjárat kiindulópontja
  u?: number;               // célegység
  b?: number;               // célépület
  v?: number;               // falu
  a?: number;               // állat
  sub?: 'fa' | 'ko' | 'hal' | 'vad' | 'farm';
  spd?: number;             // alakzat közös sebessége (milli cs/s)
  auto?: boolean;           // gép által adott (védekező visszatérés)
  fin?: boolean;            // lerakás után a parancs véget ér
}

export const ALAKZAT = { NINCS: 0, VONAL: 1, EK: 2, LAZA: 3 } as const;
export const ALLAS = { TAMADO: 0, VEDEKEZO: 1, HELYTALLO: 2, TARTOZKODO: 3 } as const;
export const ANIM = { ALL: 0, MEGY: 1, TAMAD: 2, MUNKA: 3 } as const;

export interface Unit {
  uid: number; def: UnitDef; owner: number;
  x: number; y: number; fx: number; fy: number;
  hp: number; moral: number;
  pay: number;            // 0 fizetett, 1 egy fizetőnap óta fizetetlen
  unpaid: boolean;        // az utófizetési ablakban vár
  lazado: number;         // hátralévő tick
  alakzat: number; allas: number; portya: boolean;
  carryT: number; carry: number; cattle: number;
  orders: Order[];
  path: number[] | null; pi: number; pkey: number; pver: number; pwait: number;
  st: number; dropB: number;
  cd: number; work: number;
  chDist: number; chFx: number; chFy: number; chCd: number;
  lastHit: number; lastMove: number; lastFight: number; lastAtkBy: number;
  rout: number; immobile: number;
  inB: number;
  tgtU: number; tgtB: number; scanAt: number;
  homeX: number; homeY: number;
  anim: number; animT: number;
  mrem: number;
  dead: boolean;
}

export interface QItem { k: 'u' | 't' | 'r'; id: string }
export interface Building {
  id: number; def: BuildingDef; owner: number;
  x: number; y: number; w: number; h: number; rot: number;
  hp: number; built: boolean; prog: number; nb: number; nbRate: number;
  queue: QItem[]; qprog: number; rallyX: number; rallyY: number;
  gar: number[]; cd: number;
  fire: number; fireCont: number;
  farm: number; farmLeft: number; sow: number;
  cattle: number[];
  lastAlarm: number; lastHit: number;
  recruitCd: Record<string, number>;
  mineBy: number;
  dead: boolean;
}

export interface Village { id: number; x: number; y: number; owner: number; cap: number[]; burnt: number; burnBy: number }
export interface Animal { id: number; x: number; y: number; hx: number; hy: number; food: number; dead: boolean; fx: number; fy: number; tx: number; ty: number; moving: boolean }
export interface Proj {
  x0: number; y0: number; x1: number; y1: number; t0: number; t1: number;
  owner: number; team: number; src: UnitDef | null; tam: number; mult: bigint[]; tipus: number; szoras: number;
  bmult: number; gyujt: boolean; ivelt: boolean; srcH: number;
}

export interface Player {
  id: number; team: number; faction: Faction; color: number; ai: number; // ai: 0 ember, 1 könnyű, 2 közepes, 3 nehéz
  res: [number, number, number, number]; // RU
  rank: number; techs: Set<string>;
  pop: number; cap: number;
  alive: boolean;
  famine: boolean;
  sell: [number, number, number]; buy: [number, number, number]; // piaci árszorzó ezrelék
  lateUntil: number; capRespawn: number;
  lootRem: number;
  stats: { kills: number; lost: number; loot: number; built: number };
  vis: Uint8Array;
  aiState?: any;
  gatherMult: number;
}

export type Ev =
  | { t: 'shot'; x: number; y: number; tx: number; ty: number; hit: boolean; big: boolean }
  | { t: 'melee'; x: number; y: number }
  | { t: 'proj'; x0: number; y0: number; x1: number; y1: number; dur: number; ivelt: boolean }
  | { t: 'boom'; x: number; y: number; water: boolean }
  | { t: 'die'; def: string; owner: number; x: number; y: number; fx: number; fy: number }
  | { t: 'bdie'; def: string; x: number; y: number; w: number; h: number }
  | { t: 'tree'; x: number; y: number }
  | { t: 'alert'; p: number; kind: string; x: number; y: number; msg: string }
  | { t: 'chron'; p: number; msg: string }
  | { t: 'snd'; s: string; x: number; y: number }
  | { t: 'season'; s: number }
  | { t: 'terrain' }
  | { t: 'done'; p: number; what: string; x: number; y: number };

export type Cmd =
  | { c: 'order'; p: number; uids: number[]; o: Order; q?: boolean; form?: boolean }
  | { c: 'stop'; p: number; uids: number[] }
  | { c: 'train'; p: number; b: number; id: string }
  | { c: 'research'; p: number; b: number; id: string }
  | { c: 'rank'; p: number; b: number }
  | { c: 'cancel'; p: number; b: number; i: number }
  | { c: 'place'; p: number; id: string; x: number; y: number; rot: number; uids: number[]; q?: boolean }
  | { c: 'demolish'; p: number; b: number }
  | { c: 'stance'; p: number; uids: number[]; s: number }
  | { c: 'formation'; p: number; uids: number[]; f: number }
  | { c: 'portya'; p: number; uids: number[] }
  | { c: 'trade'; p: number; r: number; buy: boolean }
  | { c: 'cattle'; p: number; b: number; act: 'add' | 'sell' | 'kill' }
  | { c: 'ungarrison'; p: number; b: number }
  | { c: 'rally'; p: number; b: number; x: number; y: number }
  | { c: 'paylate'; p: number }
  | { c: 'recruit'; p: number; b: number; id: string };

export interface Scenario {
  kind: 'csetepate' | 'kitartas';
  holdUntil?: number; // tick: a védő (0. játékos) eddig tartja a várat
  title?: string;
}

export interface World {
  tick: number; seed: number; rs: number;
  W: number; H: number;
  base: Uint8Array; cur: Uint8Array; hgt: Uint8Array; rdist: Uint8Array; flood: Uint8Array;
  wood: Int32Array; stone: Int32Array;
  occ: Int32Array;
  units: Unit[]; umap: Map<number, Unit>;
  buildings: Building[]; bmap: Map<number, Building>;
  villages: Village[]; animals: Animal[]; projs: Proj[]; players: Player[];
  nextId: number; terrainVer: number; floodLevel: number; ice: boolean;
  cmds: Cmd[]; ev: Ev[];
  gHead: Int32Array; gNext: Int32Array;
  winner: number; over: boolean; hodTeam: number; hodStart: number;
  scenario: Scenario;
  starts: { x: number; y: number }[];
  fords: { x: number; y: number }[];
  pathBudget: number;
}
