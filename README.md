# Végvár

Böngészőben játszható valós idejű stratégia a magyar végvidéken (1552–1686). Izometrikus, az ezredforduló RTS-einek
hangulatában; az évszakok, a zsold és a falvak hódoltatása adja a sajátos szabályait.

A szabályok forrása: [`Vegvar - Jatekszabaly es logika.md`](Vegvar%20-%20Jatekszabaly%20es%20logika.md), a képernyőterv:
`Vegvar RTS Wireframes.dc.html`. Az eltérések és értelmezések: [`DECISIONS.md`](DECISIONS.md).

## Futtatás

```
npm install
npm run dev      # fejlesztői szerver, port: 5210 (lásd port.txt)
npm test         # a szabálykönyv 18. fejezetének tesztjei + mechanikai tesztek
npm run build    # statikus build a dist/ mappába
```

Közzététel: a `main` ágra érkező push után a `.github/workflows/pages.yml` tesztel, buildel és kiteszi a játékot
GitHub Pages-re (<https://huser123.github.io/Vegvar/>). Cloudflare Pages-en ugyanez: build `npm run build`, kimenet `dist`.

Gyorsindítás menü nélkül: `?auto=0,1,2` (saját frakció, ellenfél, nehézség; 0 végvári, 1 oszmán, 2 császári),
`&seed=n`, `&size=128`; az Eger-küldetés: `?auto=eger`.

## Felépítés

| Mappa | Tartalom |
|---|---|
| `src/sim/` | determinisztikus szimuláció: adatok, térképgenerátor, útkeresés, egységek, harc, évszakok, zsold, gépi ellenfél |
| `src/art/` | procedurális grafika: terep, épületek, egységek, effektek, HUD-elemek (galéria: `art-a.html`, `art-b.html`) |
| `src/render/` | izometrikus megjelenítő, köd, kistérkép |
| `src/ui/` | játékvezérlés, HUD, főmenü, hang |
| `tests/` | egységtesztek |
| `tools/` | fej nélküli gép–gép meccs (`headless.ts`), képernyőképes próbák |

## Irányítás

Bal klikk / húzás: kijelölés · dupla klikk: azonos típus · jobb klikk: parancs · Shift: sorba fűzés ·
Ctrl+0–9 / 0–9: csoport · A támadó mozgás · S állj · P őrjárat · H helytállás · F1–F3 alakzat · R portya · B építés ·
Szóköz: utolsó riasztás · pont: tétlen jobbágy · nyilak, képernyőszél, középső gomb: kamera · görgő: nagyítás · + / −: sebesség.
