import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/400-italic.css';
import '@fontsource/eb-garamond/600.css';
import '@fontsource/eb-garamond/700.css';
import './style.css';
import { uiTexture, frameMotif, sujtas } from './art/ui';
import { mountMenu, egerOpts } from './ui/menu';
import { Game, type GameOpts } from './ui/game';
import type { Faction } from './sim/data';

const app = document.getElementById('app')!;
const st = document.documentElement.style;
st.setProperty('--fa', `url(${uiTexture('fa', 192, 192).toDataURL()})`);
st.setProperty('--ko', `url(${uiTexture('ko', 128, 128).toDataURL()})`);
st.setProperty('--perg', `url(${uiTexture('pergamen', 256, 256).toDataURL()})`);
st.setProperty('--vas', `url(${uiTexture('vas', 96, 96).toDataURL()})`);
for (let f = 0; f < 3; f++) st.setProperty(`--motif${f}`, `url(${frameMotif(f as 0 | 1 | 2).toDataURL()})`);
st.setProperty('--sujtas', `url(${sujtas().toDataURL()})`);

let game: Game | null = null, unmount: (() => void) | null = null;
function showMenu(): void {
  game?.destroy(); game = null;
  unmount = mountMenu(app, startGame);
}
function startGame(o: Omit<GameOpts, 'onExit'>): void {
  unmount?.(); unmount = null;
  app.innerHTML = '';
  game = new Game(app, { ...o, onExit: showMenu });
  (window as any).__game = game;
}
// Gyorsindítás teszteléshez: ?auto=frakció,ellenfél,nehézség[&seed=n]  vagy  ?auto=eger
const q = new URLSearchParams(location.search), auto = q.get('auto');
if (auto === 'eger') startGame(egerOpts());
else if (auto) {
  const [f, e, d] = auto.split(',').map(Number);
  startGame({ setup: { size: +(q.get('size') ?? 96), seed: +(q.get('seed') ?? 7), players: [{ faction: (f || 0) as Faction, ai: 0 }, { faction: (e ?? 1) as Faction, ai: d || 2 }] }, me: 0 });
} else showMenu();
