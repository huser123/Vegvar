// „B” galéria: egységek, állatok, effektek, zászló, ikonok, textúrák, szegélyek, címerek, kurzorok.
import { UNITS, TECHS } from '../sim/data';
import type { Team, UnitAnim, FxKind, Sprite } from './api';
import { unitSprite, UNIT_FRAMES, animalSprite } from './units';
import { fxSprite, FX_FRAMES, flagSprite } from './effects';
import { uiTexture, frameMotif, sujtas, icon, crest, cursor, CursorKind } from './ui';
import { mk, g2 } from './pal';

const root = document.getElementById('g')!;
const q = new URLSearchParams(location.search);
const only = q.get('s');
const BG = ['#5f9a4a', '#e6ecf0'];
const ids = Object.keys(UNITS);
function h2(t: string) { const e = document.createElement('h2'); e.textContent = t; root.appendChild(e); }
function canvas(w: number, h: number) { const c = mk(w, h); root.appendChild(c); return g2(c); }
function put(g: CanvasRenderingContext2D, s: Sprite, x: number, y: number, k = 1) { g.drawImage(s.c, Math.round(x - s.ax * k), Math.round(y - s.ay * k), s.c.width * k, s.c.height * k); }
function cell(id: string) { const u = UNITS[id]; return u.osztaly === 'hajo' ? [150, 110, 62] : u.osztaly === 'ostrom' ? [100, 80, 54] : u.osztaly === 'lovas' ? [72, 92, 68] : [50, 64, 50]; }
const t0 = performance.now(); let nspr = 0;

function sheet(bg: number, list: string[]) {
  const rows = list.map(cell), H = rows.reduce((a, r) => a + r[1], 0);
  const cols = 8 + 8 + 5 + 5 + 5, W = 150 * cols + 70;
  const g = canvas(Math.min(W, list.reduce((a, id) => Math.max(a, cell(id)[0] * cols + 70), 0)), H);
  g.fillStyle = BG[bg]; g.fillRect(0, 0, g.canvas.width, H);
  let y = 0;
  list.forEach((id, i) => {
    const [cw, ch, base] = rows[i]; let x = 70;
    g.fillStyle = bg ? '#333' : '#fff'; g.font = '10px system-ui'; g.fillText(id, 3, y + ch / 2);
    for (let d = 0; d < 8; d++, x += cw) { put(g, unitSprite(id, 0, d, 'all', 0), x + cw / 2, y + base); nspr++; }
    for (let d = 0; d < 8; d++, x += cw) { put(g, unitSprite(id, 1, d, 'megy', d % 6), x + cw / 2, y + base); nspr++; }
    for (let f = 0; f < 5; f++, x += cw) { put(g, unitSprite(id, 0, 3, 'tamad', f), x + cw / 2, y + base); nspr++; }
    for (let f = 0; f < 5; f++, x += cw) { put(g, unitSprite(id, 3, 6, id === 'jobbagy' || id === 'hadmernok' ? 'munka' : 'tamad', f, { carry: null }), x + cw / 2, y + base); nspr++; }
    for (let f = 0; f < 5; f++, x += cw) { put(g, unitSprite(id, 1, 2, 'hal', f), x + cw / 2, y + base); nspr++; }
    y += ch;
  });
}
function big(bg: number, list: string[], k = 3) {
  const per = 6, cw = 165, ch = list.some(i => UNITS[i].osztaly === 'lovas') ? 190 : 140;
  const g = canvas(cw * per, Math.ceil(list.length / 1) * ch);
  g.fillStyle = BG[bg]; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  list.forEach((id, i) => {
    const y = i * ch + ch * 0.78, sh = UNITS[id].osztaly === 'hajo' || UNITS[id].osztaly === 'ostrom';
    const kk = sh ? 2 : k;
    put(g, unitSprite(id, 0, 3, 'all', 0), cw * 0.5, y, kk);
    put(g, unitSprite(id, 1, 5, 'megy', 1), cw * 1.5, y, kk);
    put(g, unitSprite(id, 0, 1, 'all', 0), cw * 2.5, y, kk);
    put(g, unitSprite(id, 1, 2, 'tamad', 2), cw * 3.5, y, kk);
    put(g, unitSprite(id, 0, 4, 'tamad', 1), cw * 4.5, y, kk);
    put(g, unitSprite(id, 3, 6, 'megy', 3), cw * 5.5, y, kk);
    g.fillStyle = bg ? '#333' : '#fff'; g.font = '12px system-ui'; g.fillText(id, 4, i * ch + 14);
  });
}

const foot = ids.filter(i => ['munkas', 'gyalog', 'lovesz'].includes(UNITS[i].osztaly));
const cav = ids.filter(i => UNITS[i].osztaly === 'lovas');
const mach = ids.filter(i => ['ostrom', 'hajo'].includes(UNITS[i].osztaly));
const sec: Record<string, () => void> = {
  foot1: () => { h2('Gyalogos egységek 1× (all 8 irány · megy 8 irány · tamad · munka/tamad · hal)'); sheet(0, foot); },
  cav1: () => { h2('Lovasok 1×'); sheet(0, cav); },
  mach1: () => { h2('Ostromgépek, naszád 1×'); sheet(0, mach); },
  snow1: () => { h2('Havon 1×'); sheet(1, [...foot.slice(0, 5), ...cav.slice(0, 3)]); },
  foot3: () => { h2('Gyalogosok 3×'); big(0, foot); },
  cav3: () => { h2('Lovasok 3×'); big(0, cav); },
  mach3: () => { h2('Ostromgépek, naszád 2×'); big(0, mach); },
  snow3: () => { h2('Havon 3×'); big(1, [...foot.slice(0, 4), ...cav.slice(0, 2)]); },
  misc: () => {
    h2('Jobbágy rakománnyal, állatok, zászlók, effektek');
    const g = canvas(1300, 330); g.fillStyle = BG[0]; g.fillRect(0, 0, 1300, 330);
    let x = 40;
    for (const c of ['e', 'f', 'k'] as const) for (const d of [3, 6, 1]) { put(g, unitSprite('jobbagy', 0, d, 'megy', 1, { carry: c }), x, 60, 2); x += 60; }
    x = 30;
    for (const k of ['szarvas', 'marha'] as const) for (let d = 0; d < 8; d++) { put(g, animalSprite(k, d, d % 4), x, 130); x += 44; }
    put(g, animalSprite('szarvas', 3, 0), x + 30, 140, 3); put(g, animalSprite('marha', 2, 1), x + 130, 140, 3); put(g, animalSprite('marha', 5, 0), x + 250, 140, 3);
    x = 20;
    for (let t = 0; t < 5; t++) for (let f = 0; f < 4; f++) { put(g, flagSprite(t as Team, f), x, 200); x += 26; }
    put(g, flagSprite(0, 1), x + 20, 200, 3); put(g, flagSprite(1, 2), x + 110, 200, 3);
    x = 20; g.fillStyle = '#3a6a8a'; g.fillRect(0, 215, 1300, 115);
    g.fillStyle = BG[0]; g.fillRect(0, 215, 760, 115);
    for (const k of Object.keys(FX_FRAMES) as FxKind[]) { const n = FX_FRAMES[k]; if (k === 'csobbanas') x = 780; for (let f = 0; f < n; f++) { put(g, fxSprite(k, f), x + 16, 300, k === 'robbanas' ? 1 : 2); x += k === 'robbanas' ? 50 : k === 'golyo' ? 30 : 50; } if (x > 700 && k !== 'csobbanas' && x < 780) x = 780; }
    const g2_ = canvas(1300, 150); g2_.fillStyle = BG[0]; g2_.fillRect(0, 0, 1300, 150); x = 10;
    for (const k of ['tuz', 'fust', 'robbanas', 'loves', 'por', 'talalat'] as FxKind[]) for (let f = 0; f < FX_FRAMES[k]; f++) { put(g2_, fxSprite(k, f), x + 24, 120, 1.5); x += k === 'robbanas' ? 62 : k === 'talalat' ? 22 : 34; }
  },
  ui: () => {
    h2('Ikonok 44 px / 32 px, erőforrások 20 px és 40 px');
    const all = ['res_e', 'res_f', 'res_k', 'res_z', 'res_nep', ...ids.map(i => 'unit_' + i), ...Object.keys(TECHS).map(i => 'tech_' + i),
      ...'megy tamad orjarat allj helytall vonal ek laza portya epit javit bont kienged gyulekezo vissza felgyujt aknaz arat vet olt allas_tamado allas_vedekezo allas_helytallo allas_tartozkodo elad vesz marha levag rang utofizetes megse helyorseg'.split(' ').map(i => 'cmd_' + i)];
    for (const [sz, k] of [[44, 2], [32, 2], [20, 2]] as [number, number][]) {
      const r = document.createElement('div'); r.className = 'row'; r.style.background = sz === 20 ? '#4a3a2a' : '#2c2a28'; root.appendChild(r);
      for (const id of sz === 20 ? all.slice(0, 5) : all) { const d = document.createElement('div'); const c = icon(id, sz); const cc = mk(sz * k, sz * k); g2(cc).drawImage(c, 0, 0, sz * k, sz * k); d.appendChild(cc); d.append(id.replace(/^(cmd|tech|unit|res)_/, '')); r.appendChild(d); }
    }
    h2('Ikonok 1× (44, 36)');
    for (const sz of [44, 36]) { const r = document.createElement('div'); r.className = 'row'; root.appendChild(r); for (const id of all) r.appendChild(icon(id, sz)); }
    h2('Textúrák (2×2 csempézve), szegélyek, sujtás, címerek, kurzorok');
    const g = canvas(1300, 420); g.fillStyle = '#333'; g.fillRect(0, 0, 1300, 420);
    let x = 10;
    for (const k of ['fa', 'ko', 'pergamen', 'vas'] as const) { const t = uiTexture(k, 128, 96); for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) g.drawImage(t, x + i * 128, 10 + j * 96); x += 270; }
    for (let f = 0; f < 3; f++) { const m = frameMotif(f as 0 | 1 | 2); for (let i = 0; i < 8; i++) g.drawImage(m, 10 + i * m.width, 215 + f * 22); g.drawImage(m, 420, 215 + f * 40 - 10, m.width * 3, 48); }
    const s = sujtas(); for (let i = 0; i < 12; i++) g.drawImage(s, 10 + i * 24, 290); g.drawImage(s, 10, 310, 72, 30);
    x = 620; for (let f = 0; f < 3; f++) { g.drawImage(crest(f as 0 | 1 | 2, 64), x, 215); g.drawImage(crest(f as 0 | 1 | 2, 32), x + 70, 215); g.drawImage(crest(f as 0 | 1 | 2, 20), x + 70, 255); const c = crest(f as 0 | 1 | 2, 48); g.drawImage(c, x, 290, 96, 96); x += 120; }
    g.fillStyle = BG[0]; g.fillRect(990, 215, 300, 190); x = 1000;
    for (const k of ['alap', 'megy', 'tamad', 'gyujt', 'epit', 'tilos', 'beszall'] as CursorKind[]) { const c = cursor(k); g.drawImage(c.c, x, 225); g.drawImage(c.c, (x - 1000) * 2.1 + 1000, 270, 64, 64); g.fillStyle = '#f0f'; g.fillRect(x + c.hx, 225 + c.hy, 1, 1); g.fillStyle = BG[0]; x += 38; }
  },
  anim: () => {
    h2('Mozgó sor (megy / tamad / hal váltakozva)');
    const g = canvas(1500, 420);
    let t = 0;
    const draw = () => {
      g.fillStyle = BG[0]; g.fillRect(0, 0, 1500, 210); g.fillStyle = BG[1]; g.fillRect(0, 210, 1500, 210);
      const f = Math.floor(t / 6), ph = Math.floor(t / 240) % 3;
      ids.forEach((id, i) => {
        const an: UnitAnim = ph === 0 ? 'megy' : ph === 1 ? 'tamad' : 'hal';
        const fr = an === 'hal' ? Math.min(4, Math.floor((t % 240) / 12)) : f;
        put(g, unitSprite(id, 0, 3, an, fr), 40 + i * 76, 90, 1);
        put(g, unitSprite(id, 1, 6, an, fr), 40 + i * 76, 180, 1);
        put(g, unitSprite(id, 3, 2, an, fr), 40 + (i % 10) * 150, 300 + Math.floor(i / 10) * 100, 2);
      });
      t++; requestAnimationFrame(draw);
    };
    draw();
  },
};
for (const k of Object.keys(sec)) if (!only || only.split(',').includes(k)) sec[k]();
const info = document.createElement('p'); info.id = 'done';
info.textContent = `kész: ${nspr} sprite, ${(performance.now() - t0).toFixed(0)} ms (${((performance.now() - t0) / Math.max(1, nspr)).toFixed(2)} ms/sprite)`;
root.appendChild(info);
