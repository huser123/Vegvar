// Főmenü az 1f wireframe szerint: bal oldalt cím és menüpontok, jobb oldalt élő kulcskép és a választott lap.
import { FACTION_NAME, type Faction } from '../sim/data';
import { TICKS } from '../sim/data';
import type { GameSetup } from '../sim/world';
import { Game, type GameOpts } from './game';
import { crest } from '../art/ui';
import type { FactionIdx } from '../art/api';
import { sfx } from './audio';

const FACTION_BLURB = [
  'Olcsó palánk, huszár és portya. A hazai vitéz ősszel arat, a vár alatt nem hátrál. A zsákmány kétszer annyit ér.',
  'Nagy sereg, erős ágyú. Nyáron a legerősebb, télen kétszeresen fagy. Tavasszal megjön a kincstári zsold.',
  'Drága zsoldosok, kőfal és bástya. Aki nem kap zsoldot, azonnal továbbáll. Toborzóhelyen pénzért azonnal katona.',
];
const DIFF = ['', 'Könnyű', 'Közepes', 'Nehéz'];

export function mountMenu(root: HTMLElement, start: (o: Omit<GameOpts, 'onExit'>) => void): () => void {
  let tab: 'hadjarat' | 'csete' | 'szabaly' = 'hadjarat';
  const cfg = { f: 0 as Faction, e: 1 as Faction, d: 2, size: 96, seed: (Math.random() * 1e6) | 0 };
  root.innerHTML = `<div class="menu">
    <div class="mleft">
      <h1>Végvár</h1><div class="sujtas"></div>
      <p class="sub">Valós idejű stratégia a magyar végvidéken, 1552–1686</p>
      <nav>
        <button data-tab="hadjarat">Hadjárat</button>
        <button data-tab="csete">Csetepaté</button>
        <button data-tab="szabaly">Játékszabályok</button>
      </nav>
      <p class="ver">v0.1 · az évszak a harmadik játékos</p>
    </div>
    <div class="mright"><div class="keyart" id="m-demo"></div><div class="haze"></div><div class="mpanel" id="m-panel"></div></div>
  </div>`;
  const demoEl = root.querySelector<HTMLElement>('#m-demo')!, panel = root.querySelector<HTMLElement>('#m-panel')!;
  const demoSetup: GameSetup = { size: 96, seed: 1552, players: [{ faction: 0, ai: 2 }, { faction: 1, ai: 2 }] };
  let demo: Game | null = new Game(demoEl, { setup: demoSetup, me: 0, demo: true, onExit: () => { } });
  demo.speed = 1;

  const cr = (f: number, s = 44) => `<img src="${crest(f as FactionIdx, s).toDataURL()}" width="${s}" height="${s}" alt="">`;
  const render = () => {
    root.querySelectorAll<HTMLElement>('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    if (tab === 'hadjarat') panel.innerHTML = `<div class="cards">
        <button class="card" data-go="eger"><b>I. Eger, 1552</b><span>Végváriak · az ostrom kiállása télig</span><em>Ahmed pasa hada a vár alatt áll. Tartsd a falakat, amíg beáll a tél – és ne feledd: ősszel a katona zsoldot kér.</em></button>
        <div class="card lock"><b>II. Szigetvár, 1566</b><span>zárolva</span></div>
        <div class="card lock"><b>III. Buda, 1686</b><span>zárolva</span></div></div>`;
    else if (tab === 'csete') panel.innerHTML = `<div class="setup">
        <div class="col"><h3>A te zászlód</h3>${[0, 1, 2].map(f => `<button class="fac${cfg.f === f ? ' on' : ''}" data-f="${f}">${cr(f)}<span><b>${FACTION_NAME[f]}</b>${FACTION_BLURB[f]}</span></button>`).join('')}</div>
        <div class="col"><h3>Ellenfél</h3><div class="pick">${[0, 1, 2].map(f => `<button class="${cfg.e === f ? 'on' : ''}" data-e="${f}">${cr(f, 28)}${FACTION_NAME[f]}</button>`).join('')}</div>
          <h3>Nehézség</h3><div class="pick">${[1, 2, 3].map(d => `<button class="${cfg.d === d ? 'on' : ''}" data-d="${d}">${DIFF[d]}</button>`).join('')}</div>
          <h3>Pálya</h3><div class="pick">${[[96, 'Kicsi 96×96'], [128, 'Közepes 128×128']].map(([s, n]) => `<button class="${cfg.size === s ? 'on' : ''}" data-size="${s}">${n}</button>`).join('')}</div>
          <div class="pick"><label>Térképmag <input id="m-seed" value="${cfg.seed}" inputmode="numeric" size="7"></label><button data-rnd="1">Új</button></div>
          <button class="go" data-go="csete">Hadba!</button></div></div>`;
    else panel.innerHTML = `<div class="rules">
        <h3>Az évszak-kör (8 perc)</h3>
        <p><b>Tavasz</b> – a 2. évtől árad a folyó, az ártér mocsárrá válik, a gázló járhatatlan. Csak most lehet vetni. Az eső rontja a lőfegyvert.<br>
        <b>Nyár</b> – nincs mozgásbüntetés: a hadjáratok ideje. <b>Ősz</b> – aratás, vásár, a 300. másodpercben <b>fizetőnap</b>.<br>
        <b>Tél</b> – a folyó befagy és járható; a szálláson (vár, ház) kívül fagy az egység, másfélszer annyi élelem fogy. Olvadáskor a jégen álló odavész.</p>
        <h3>Zsold és hűség</h3>
        <p>Fizetőnapon előbb befolyik a faluadó és a jobbágyadó, aztán minden katona megkapja a zsoldját – ha futja. Akinek nem jut: a végvári vitéz meggyengül, másodszor hazamegy jobbágynak; a zsoldos továbbáll; a janicsár fellázad. 30 másodpercig másfélszeres áron pótolható.</p>
        <h3>Falvak</h3>
        <p>Állj 20 másodpercig katonával egy falu mellett, és behódol: fizetőnapon 15 zsoldot és 40 élelmet ad. Aki a falvak 60%-át 8 percig tartja, győz. A portyázó lovas fel is égetheti.</p>
        <h3>Irányítás</h3>
        <p>Bal klikk / húzás: kijelölés · jobb klikk: parancs · Shift: sorba fűzés · Ctrl+szám: csoport · A támadó mozgás · S állj · P őrjárat · H helytállás · F1–F3 alakzat · R portya · B építés · Szóköz: riasztás · görgő: nagyítás.</p></div>`;
  };
  render();
  const kill = () => { demo?.destroy(); demo = null; };
  const onClick = (e: Event) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!t) return;
    sfx('katt');
    const ds = t.dataset;
    if (ds.tab) tab = ds.tab as typeof tab;
    if (ds.f) { cfg.f = +ds.f as Faction; if (cfg.e === cfg.f) cfg.e = ((cfg.f + 1) % 3) as Faction; }
    if (ds.e) cfg.e = +ds.e as Faction;
    if (ds.d) cfg.d = +ds.d;
    if (ds.size) cfg.size = +ds.size;
    if (ds.rnd) cfg.seed = (Math.random() * 1e6) | 0;
    const seedEl = root.querySelector<HTMLInputElement>('#m-seed');
    if (seedEl && !ds.rnd) cfg.seed = parseInt(seedEl.value, 10) || cfg.seed;
    if (ds.go === 'csete') { kill(); start({ setup: { size: cfg.size, seed: cfg.seed, players: [{ faction: cfg.f, ai: 0 }, { faction: cfg.e, ai: cfg.d }] }, me: 0 }); return; }
    if (ds.go === 'eger') { kill(); start(egerOpts()); return; }
    render();
  };
  root.addEventListener('click', onClick);
  return () => { root.removeEventListener('click', onClick); kill(); };
}

export function egerOpts(): Omit<GameOpts, 'onExit'> {
  return {
    setup: { size: 96, seed: 1552, players: [{ faction: 0, ai: 0 }, { faction: 1, ai: 3 }], scenario: { kind: 'kitartas', holdUntil: 360 * TICKS, title: 'Eger, 1552' } },
    me: 0, title: 'Eger, 1552',
    intro: 'Az oszmán had a folyó túlpartján gyülekezik: azabok, janicsárok, szpáhik és két falrontó ágyú. A te váradban darabontok és hajdúk állnak három őrtoronnyal. <b>Tartsd meg a várat a tél beálltáig.</b> A helyőrségbe küldött hajdúk a falról lőnek; a pikások vonalban megtörik a lovasrohamot. Ősszel fizetőnap – a faluadó segít.',
  };
}
