// Képernyőkép a futó dev szerverről: node tools/shot.mjs <url-query> <kimenet.png> [várakozás ms] [szélesség] [magasság] [js-kifejezés]
import { chromium } from 'playwright-core';
const [q, out, wait = '4000', W = '1600', H = '900', js = ''] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: +W, height: +H } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
await p.goto('http://localhost:5210/' + q);
await p.waitForTimeout(+wait);
if (js) { const r = await p.evaluate(js); if (r !== undefined) console.log('JS:', JSON.stringify(r)); await p.waitForTimeout(1500); }
await p.screenshot({ path: out });
console.log(errs.slice(0, 12).join('\n') || 'nincs hiba');
await b.close();
