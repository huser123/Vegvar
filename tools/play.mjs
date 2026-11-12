// Kezelési próba valódi egér- és billentyűeseményekkel.
import { chromium } from 'playwright-core';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
await p.goto('http://localhost:5210/?auto=0,1,2&seed=7');
await p.waitForTimeout(2500);
const ev = js => p.evaluate(js);
const upos = async (sel) => ev(`(()=>{const g=__game; const u=g.w.units.filter(${sel})[0]; return u?{x:u.spx*g.r.zoom,y:(u.spy-12)*g.r.zoom,uid:u.uid}:null})()`);
const log = (k, v) => console.log(k.padEnd(28), JSON.stringify(v));
// 1. kattintás egy jobbágyra
let w = await upos(`u=>u.owner===0&&u.def.id==='jobbagy'`);
await p.mouse.click(w.x, w.y);
log('kijelölve', await ev(`[...__game.ui.sel]`));
// 2. dobozos kijelölés: minden jobbágy
await p.mouse.move(700, 430); await p.mouse.down(); await p.mouse.move(1100, 620, { steps: 6 }); await p.mouse.up();
log('doboz', await ev(`__game.selUnits().map(u=>u.def.id)`));
// 3. csak munkások: jobb klikk egy fára
await ev(`(()=>{const g=__game; g.select(g.w.units.filter(u=>u.owner===0&&u.def.id==='jobbagy').slice(0,2))})()`);
const tree = await ev(`(()=>{const g=__game,w=g.w; for(let i=0;i<w.cur.length;i++){ if(w.cur[i]===3&&w.players[0].vis[i]===2){const x=(i%w.W+0.5)*1000,y=(Math.floor(i/w.W)+0.5)*1000; const sx=g.r.sx(x,y),sy=g.r.sy(x,y); if(sx>300&&sx<1300&&sy>120&&sy<650) return {x:sx*g.r.zoom,y:sy*g.r.zoom};}} return null})()`);
await p.mouse.click(tree.x, tree.y, { button: 'right' });
await p.waitForTimeout(300);
log('favágás parancs', await ev(`__game.selUnits().map(u=>u.orders[0]&&u.orders[0].sub)`));
// 4. építés: B, Q (ház), kattintás szabad rétre
await ev(`(()=>{const g=__game; g.select(g.w.units.filter(u=>u.owner===0&&u.def.id==='jobbagy').slice(2,4))})()`);
await p.keyboard.press('b'); await p.waitForTimeout(250); await p.keyboard.press('q'); await p.waitForTimeout(250);
await p.mouse.move(640, 560); await p.waitForTimeout(200);
log('szellem', await ev(`__game.ui.ghost`));
await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(400);
log('épületek', await ev(`__game.w.buildings.filter(b=>b.owner===0).map(b=>b.def.id+(b.built?'':'*'))`));
// 5. vár kijelölése, jobbágy képzése (Q)
const c = await ev(`(()=>{const g=__game,b=g.w.buildings.find(b=>b.owner===0&&b.def.id==='var'); const x=(b.x+2)*1000,y=(b.y+2)*1000; return {x:g.r.sx(x,y)*g.r.zoom,y:(g.r.sy(x,y)+10)*g.r.zoom}})()`);
await p.mouse.click(c.x, c.y); await p.waitForTimeout(250);
log('kijelölt épület', await ev(`(__game.w.bmap.get(__game.ui.selB)||{def:{}}).def.id`));
await p.keyboard.press('q'); await p.keyboard.press('q'); await p.waitForTimeout(300);
log('gyártási sor', await ev(`__game.w.bmap.get(__game.ui.selB).queue`));
// 6. kapitány: jobb klikk mozgás, majd A + kattintás
const k = await upos(`u=>u.owner===0&&u.def.id==='kapitany'`);
await p.mouse.click(k.x, k.y); await p.mouse.click(1000, 300, { button: 'right' }); await p.waitForTimeout(200);
log('kapitány parancs', await ev(`__game.selUnits().map(u=>u.orders.map(o=>o.k))`));
await p.keyboard.press('F3'); await p.keyboard.press('Control+1'); await p.waitForTimeout(300);
log('alakzat/csoport', await ev(`[__game.selUnits().map(u=>u.alakzat), __game.groups[1]]`));
await ev(`__game.speed=3`);
await p.waitForTimeout(20000);
log('60 s múlva', await ev(`(()=>{const g=__game,w=g.w,p=w.players[0]; return {tick:w.tick,res:p.res.map(r=>Math.floor(r/10000)),nep:p.pop+'/'+p.cap,ep:w.buildings.filter(b=>b.owner===0).map(b=>b.def.id+(b.built?'':'*')),fps:null}})()`));
// képkockaidő
log('képkocka ms', await ev(`new Promise(r=>{let n=0,t0=performance.now();const f=()=>{if(++n>=60)r(((performance.now()-t0)/60).toFixed(1));else requestAnimationFrame(f)};requestAnimationFrame(f)})`));
await p.mouse.move(60, 780); await p.waitForTimeout(400);
await p.screenshot({ path: out });
console.log(errs.join('\n') || 'nincs hiba');
await b.close();
