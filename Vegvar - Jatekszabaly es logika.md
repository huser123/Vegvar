# VÉGVÁR — teljes játéklogika (v0.1)

Valós idejű stratégia, magyar végvidék, 1552–1686. Ez a dokumentum az egyetlen igazságforrás a szabályokhoz és számokhoz. A képernyő-elrendezést a `Vegvar RTS Wireframes.dc.html` adja (1a–1f).

## 0. Használat (implementáló AI-nak)

- Minden szám ebben a fájlban kötelező kiinduló érték. Ami nincs leírva, azt a legegyszerűbb, determinisztikus módon oldd meg, és jegyezd fel a `DECISIONS.md`-be.
- Azonosítók (`snake_case`, ékezet nélkül) a kódban használandó kulcsok. Megjelenített név a „Név” oszlop.
- Rövidítések: **E** élelem, **F** fa, **K** kő, **Z** zsold. Költség formátuma: `E/F/K/Z`. Páncél formátuma: `vágó/szúró/lövő/zúzó`.
- Távolság: csempe (cs). Idő: másodperc (s). Sebesség: cs/s.
- Javasolt építési sorrend: (1) térkép + mozgás, (2) gazdaság, (3) évszakok, (4) harc, (5) zsold + morál, (6) falvak + győzelem, (7) gépi ellenfél, (8) HUD.
- A 18. fejezet tesztesetei egységtesztként futtatandók.

## 1. Szimuláció alapjai

| Kulcs | Érték |
|---|---|
| `tick_rate` | 20 tick/s, fix lépés, determinisztikus (lockstep-kompatibilis) |
| Számábrázolás | egész / fixpontos (1/1000); lebegőpont a szimulációban tilos |
| Véletlen | egyetlen seedelt PRNG (pl. xorshift32), csak a szimuláció húz belőle |
| Kerekítés | `round` = fél felfelé; sebzés minimum 1 |
| Térkép | négyzetrács, 2:1 izometrikus megjelenítés, csempe 64×32 px |
| Térképméret | kicsi 96×96 (2 játékos), közepes 128×128 (2–4), nagy 160×160 (4–6) |
| Magasság | csempénként 0 (sík) vagy 1 (domb) |
| Népességplafon | 200 / játékos |
| Kijelölés | max 40 egység, 10 számozott csoport |
| Gyártási sor | épületenként 5 tétel |

## 2. Terep és mozgás

Tényleges sebesség = `egység.seb × terep_szorzó × évszak_szorzó × alakzat_szorzó × státusz_szorzó`. `—` = járhatatlan.

| id | Terep | gyalog / lövész / munkás | lovas | ostrom | hajó | Megjegyzés |
|---|---|---|---|---|---|---|
| `ret` | rét | 1.0 | 1.0 | 1.0 | — | építhető |
| `ut` | út | 1.25 | 1.25 | 1.25 | — | tavasszal 1.0 (sár) |
| `szanto` | szántó | 0.9 | 0.9 | 0.9 | — | |
| `erdo` | erdő | 0.7 | 0.5 | — | — | rejt, lövés ellen véd; csempénként 150 F |
| `domb` | domb | 0.8 | 0.7 | 0.5 | — | magasság 1 |
| `mocsar` | mocsár | 0.5 | 0.3 | — | — | nem építhető |
| `folyo` | folyó | — | — | — | 1.0 | télen `jeg` |
| `gazlo` | gázló | 0.5 | 0.5 | 0.4 | 1.0 | tavasszal áradáskor járhatatlan |
| `jeg` | jég | 0.8 | 0.7 | — | — | `nehez` jellemzőjű egységnek járhatatlan |
| `kolelohely` | kőlelőhely | — | — | — | — | 4000 K |

Évszak-szorzó minden szárazföldi mozgásra: tavasz 0.9, nyár 1.0, ősz 1.0, tél 0.9.

Útkeresés: A* a csempehálón mozgásosztályonkénti költségtáblával (`1 / szorzó`), csoportos mozgásnál flow field. Egység ütközési sugara 0.3 cs (ostrom 0.6). A terep változásakor (áradás, fagy) az érintett útvonalak újraszámolandók.

## 3. Évszakok

Egy év = 480 s. A játék az 1. év tavaszán indul (`t_ev = 0`). `t_ev = játékidő mod 480`, `ev = floor(játékidő / 480) + 1`.

| Évszak | t_ev | Hatások |
|---|---|---|
| **Tavasz** | 0–120 | Áradás (lásd lent). Eső: lőfegyver pontosság ×0.75. Tűz feleannyi ideig ég. Vetés lehetséges. Oszmán kincstári zsold érkezik t_ev=0-kor. |
| **Nyár** | 120–240 | Nincs mozgásbüntetés. Tűz 8 HP/s (egyébként 6). Oszmán egységek támadás ×1.10, sebesség ×1.10. |
| **Ősz** | 240–360 | Aratás lehetséges. Vásártéren eladási ár ×1.5. **Fizetőnap t_ev=300.** |
| **Tél** | 360–480 | Folyó fagyott t_ev 380–470 (`folyo`→`jeg`). Élelemfogyasztás ×1.5. Lábon maradt termés t_ev=360-kor elvész. Szálláson kívüli egység fagy (lásd 4.9). Hajó mozgásképtelen, kapott sebzés ×2. |

**Áradás.** Ártér = minden magasság-0 csempe, amely folyótól ≤ R csempére van (Csebisev-távolság). `R = 2`, minden 3. évben (`ev mod 3 == 0`) `R = 3`. Az áradási szint `s(t_ev)`: 0–40 s között lineárisan 0→R, 40–80 s között R, 80–120 s között R→0. Az a csempe, amelynek folyótávolsága ≤ `floor(s)`, ideiglenesen `mocsar`. Elöntött csempén: épület 2 HP/s sebzést kap (kivéve `rev`, `palank`), a szántó nem művelhető, a gázló járhatatlan. Az 1. évben nincs áradás.

**Jég.** 380 és 470 között a folyó `jeg`. 470-kor a jégen álló egység azonnal meghal (figyelmeztetés 450-kor: hang + villogó folyó a kistérképen).

## 4. Gazdaság

### 4.1 Kezdés
Játékosonként: 1 `var`, 4 `jobbagy`, 1 `kapitany`, készlet `200/200/100/60`. A vár 12 csempés körzetében: folyó, ≥ 40 erdőcsempe, 1 kőlelőhely, 2 vadcsorda. 20 csempén belül 1 falu.

### 4.2 Munkás (`jobbagy`) teljesítménye
Teherbírás 10 egység. A gyűjtött anyag a legközelebbi megfelelő lerakóhelyen kerül a készletbe.

| Munka | Ráta | Forrás | Lerakóhely |
|---|---|---|---|
| favágás | 0.50 F/s | erdőcsempe (150 F, utána `ret`) | `fatelep`, `var` |
| kőfejtés | 0.30 K/s | kőlelőhely (4000 K) | `kobanya`, `var` |
| vadászat | 0.40 E/s | vad (140 E / állat, csorda 4 állat) | `malom`, `var` |
| halászat | 0.35 E/s (télen jégről 0.15) | folyóval szomszédos csempe, kimeríthetetlen | `malom`, `rev`, `var` |
| vetés | 20 s munka / szántó | csak tavasszal, nem elöntött szántón | — |
| aratás | 3.0 E/s | csak ősszel, bevetett szántón | `malom`, `var` |
| építés | 1.0 építési pont/s; minden további munkás +0.5, max 5 munkás | | |
| javítás | 10 HP/s, ára az eredeti költség 50%-a arányosan | | |
| tűzoltás | 5 s munka / égő épület | | |

### 4.3 Szántó
- Állapotok: `ugar` → (vetés, tavasz) → `vetett` → (t_ev=240) → `erett` → (aratás) → `ugar`. Nyáron nem kell munkás.
- Hozam = `300 × ártér_szorzó × malom_szorzó × tech_szorzó`, lefelé kerekítve.
  - `ártér_szorzó` = 1.25, ha a szántó közepe folyótól ≤ 3 cs; különben 1.0.
  - `malom_szorzó` = 1.15, ha ≤ 6 cs-re van saját malom; különben 1.0.
- Egy munkás egy 300-as szántót 100 s alatt arat le; az ősz 120 s. Ami t_ev=360-kor `erett` maradt, elvész.
- `hazai` jellemzőjű katona tud aratni 1.5 E/s rátával.

### 4.4 Karám és marha
`karam`: 4 hely. Egy marha beállítása 50 E, 180 s alatt nő meg, csak ha a karám 4 cs-es körzetében van ≥ 6 nem elöntött `ret` csempe; télen nem nő. Kész marha: eladható a vásártéren 20 Z-ért (ősszel 30 Z), vagy levágható 100 E-ért. Kész marha a karámban áll és elhajtható (lásd 5.3).

### 4.5 Vásártér
Alapárak 100 egységre: elad E→20 Z, F→25 Z, K→40 Z; vesz E←35 Z, F←40 Z, K←60 Z. Minden ügylet után az adott áru eladási ára ×0.97, vételi ára ×1.03; 10 s-onként 1%-kal tér vissza az alap felé. Ősszel az eladási ár ×1.5.

### 4.6 Falvak (semleges térképelem)
Térképenként 5–9 falu, nem rombolható.
- **Hódoltatás:** ha 20 s-ig van ≥ 1 saját katonai egység 3 cs-en belül és nincs ellenséges, a falu a játékosé.
- **Adó:** fizetőnapon tulajdonosának 15 Z + 40 E.
- **Felégetés:** `portya` jellemzőjű egység 10 s csatornázással, idegen vagy szabad falun: azonnal +30 Z és +60 E; a falu 480 s-ig `felegetett` (nem fizet). Tulajdonosa megmarad.

### 4.7 Jobbágyadó
Fizetőnapon 1 Z minden élő `jobbagy` után.

### 4.8 Élelemfogyasztás
Minden egység népességpontonként 0.05 E/s-t fogyaszt (télen 0.075), másodpercenként levonva. Egy népességpont éves igénye: 360×0.05 + 120×0.075 = **27 E**. Ha a készlet 0: éhínség — minden egység 0.5 HP/s-t veszít, morál −1/s, képzés szünetel.

### 4.9 Szállás és fagy
Szállást ad: `var` (8 cs sugár), `haz` (6), `satortabor` (5, de télen nem). Télen a szálláson kívüli egység 0.25 HP/s-t veszít (Oszmán egység 0.5-öt). Szálláson belül, harcon kívül (5 s óta nem sebződött) +0.2 HP/s gyógyulás egész évben.

### 4.10 Népesség
`var` +10, `haz` +5, `satortabor` +5. Plafon 200.

## 5. Zsold, hűség, zsákmány

### 5.1 Fizetőnap (t_ev = 300), szigorú sorrend
1. Faluadó jóváírása.
2. Jobbágyadó jóváírása.
3. Zsoldigény = Σ `egység.zsold`. Ha Z ≥ igény: mindenki `fizetett`.
4. Ha Z < igény: fizetés a játékos által állított sorrendben (alapértelmezés: zsold szerint növekvő, azonos zsoldnál régebbi egység előbb), amíg a pénz futja. A többi `fizetetlen`.
5. Utófizetés: 30 s-ig bármely fizetetlen egység kifizethető `zsold × 1.5` áron.

A HUD már t_ev=120-tól mutatja a várható igényt és hiányt (pirossal).

### 5.2 A fizetetlenség következménye (a 30 s letelte után)
| Jellemző | Első kimaradás | Második egymást követő |
|---|---|---|
| `hazai` (Végvári) | támadás ×0.75, sebesség ×0.85, morálplafon 60 a következő fizetőnapig | az egység `jobbagy`-gyá alakul |
| `zsoldos` (Császári) | az egység feloszlik (törlődik) | — |
| `birodalmi` (Oszmán) | Azab, Akindzsi, Lagumdzsi feloszlik; **Janicsár fellázad:** 60 s-ig semleges-ellenséges, a saját legközelebbi épületét támadja, utána visszaáll `fizetetlen` büntetéssel | feloszlik |
| ostromgép | mozgásképtelen a következő fizetőnapig | törlődik |

### 5.3 Zsákmány (`portya` jellemző)
- Megölt `jobbagy`: +5 Z.
- Gazdasági épületnek (`malom`, `fatelep`, `kobanya`, `karam`, `vasarter`, `szanto`) okozott minden 20 sebzés: +1 Z.
- Marhahajtás: az egység ellenséges karámmal szomszédos csempén 5 s alatt max 2 kész marhát magához vesz (sebessége ×0.7); saját karámba vagy vásártérre érve a marha a játékosé.
- Falu felégetése: lásd 4.6.
- Végvári játékosnál minden zsákmány-Z ×2.

## 6. Rangok (korszaklépés)

| Rang | Név | Ár | Idő | Feltétel |
|---|---|---|---|---|
| I | Palánk | — | — | kezdő |
| II | Végház | 400/200/0/0 | 60 s | `kaszarnya` + `malom` |
| III | Főkapitányság | 500/0/300/150 | 90 s | `kovacs` + `vasarter` |

A lépés a `var`-ban fut, közben a vár nem képez.

## 7. Épületek

Páncéltípusok: **fa** `3/8/6/0`, éghető; **palánk** `5/10/8/8`, éghető; **kő** `8/12/10/4`, nem ég. Minden épület látótávja 6 cs, ha nincs más megadva.

| id | Név | Ki | Rang | Ár E/F/K/Z | Épít s | HP | Páncél | Méret | Funkció |
|---|---|---|---|---|---|---|---|---|---|
| `var` | Vár | mind | I | — | — | 2500 | kő | 4×4 | Lerakóhely mindenre. Képez: jobbágy, kapitány. Helyőrség 15. Lő: 8 szúró, 2 s, 7 cs, +1 lövés minden 5 bent ülő után. Szállás 8. Elvesztése = vereség. |
| `haz` | Ház | mind | I | 0/30/0/0 | 20 | 250 | fa | 2×2 | +5 nép, szállás 6 |
| `szanto` | Szántó | mind | I | 0/60/0/0 | 15 | 100 | fa | 3×3 | lásd 4.3; járható |
| `malom` | Malom | mind | I | 0/100/0/0 | 35 | 400 | fa | 2×2 | élelem-lerakó, hozam ×1.15 (6 cs) |
| `fatelep` | Fatelep | mind | I | 0/80/0/0 | 25 | 300 | fa | 2×2 | fa-lerakó |
| `kobanya` | Kőbánya | mind | I | 0/100/0/0 | 25 | 300 | fa | 2×2 | kő-lerakó |
| `karam` | Karám | mind | I | 0/120/0/0 | 30 | 300 | fa | 3×3 | lásd 4.4 |
| `kaszarnya` | Kaszárnya | mind | I | 0/150/0/0 | 40 | 800 | fa | 3×3 | gyalog, lövész |
| `ortorony` | Őrtorony | mind | I | 0/100/50/0 | 35 | 500 | palánk | 1×1 | Lő: 10 szúró, 2 s, 7 cs. Helyőrség 5. Látás 10. |
| `palank` | Palánkfal | mind | I | 0/10/0/0 | 6 | 600 | palánk | 1×1 | Végvárinál 3 s |
| `palank_kapu` | Palánkkapu | mind | I | 0/40/0/0 | 15 | 700 | palánk | 1×2 | saját egységnek átjárható |
| `rev` | Rév | mind | I | 0/120/0/0 | 30 | 500 | fa | 2×3 | folyóparton; élelem-lerakó; képez: naszád |
| `strazsa` | Strázsahely | Végvári | I | 0/30/0/0 | 10 | 150 | fa | 1×1 | Látás 10. Lármafa: ha ellenséget lát, 8 cs-en belül saját egység morál +10 (60 s-onként egyszer), riasztás a kistérképen. |
| `satortabor` | Sátortábor | Oszmán | I | 0/100/0/0 | 20 | 400 | fa | 3×3 | Képez: azab, akindzsi. +5 nép. Szállás 5 (télen nem). 15 s alatt összecsomagolható szekérré (seb 0.8, HP 200), 15 s kibontás. |
| `vasarter` | Vásártér | mind | II | 0/150/50/0 | 40 | 600 | fa | 3×3 | lásd 4.5; marha eladása |
| `istallo` | Istálló | mind | II | 50/175/0/0 | 45 | 800 | fa | 3×3 | lovasság |
| `kovacs` | Kovács | mind | II | 0/150/50/0 | 40 | 600 | fa | 2×2 | fejlesztések (11.) |
| `dzsami` | Dzsámi | Oszmán | II | 0/150/100/0 | 50 | 900 | kő | 3×3 | 8 cs-en belül saját egység +1 HP/s harcon kívül, morál +0.5/s |
| `toborzo` | Toborzóhely | Császári | II | 0/150/0/50 | 30 | 500 | fa | 2×2 | Bármely Császári katonai egység azonnal megvehető: E/F/K helyett `Z-ár × 2 + 40 Z`, 5 s lehűlés egységenként |
| `kofal` | Kőfal | Császári II, többi III | | 0/0/20/0 | 14 | 1800 | kő | 1×1 | |
| `ko_kapu` | Kőkapu | mint kőfal | | 0/20/60/0 | 30 | 2000 | kő | 1×2 | |
| `agyuonto` | Ágyúöntő | mind | III | 0/200/150/0 | 60 | 900 | kő | 3×3 | ostromgépek |
| `bastya` | Bástya | Császári | III | 0/100/250/0 | 70 | 3000 | kő | 3×3 | Lő: 45 zúzó, 8 s, 10 cs, min 2, szórás 1. Helyőrség 10. Hadisegély: évszakváltáskor +30 Z bástyánként (max 3 bástya után). |

Építési szabályok: csak felderített, sík, nem elöntött, szabad csempére; falak húzással vonalban. Félkész épület HP-ja az elkészültséggel arányos. Bontás: az ár 50%-a visszajár.

## 8. Egységek

Oszlopok: Tám = sebzés ütésenként; Újr = két ütés közti idő (s); Táv = hatótáv (0 = közelharc, 1 = hosszú szálfegyver); Seb = cs/s.

### 8.1 Közös
| id | Név | Osztály | HP | Tám | Típus | Újr | Táv | Páncél | Seb | Látás | Ár | Zsold | Nép | Képz s | Hol | Rang | Jellemzők |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `jobbagy` | Jobbágy | munkás | 30 | 2 | vágó | 2.0 | 0 | 0/0/0/0 | 1.0 | 5 | 50/0/0/0 | 0 | 1 | 20 | var | I | épít, gyűjt |
| `kapitany` | Kapitány | lovas | 250 | 16 | vágó | 1.5 | 0 | 4/4/2/0 | 1.6 | 8 | — | 0 | 0 | 90 (újraéledés) | var | I | `vezer` |
| `naszad` | Naszád | hajó | 200 | 12 | lövő | 3.0 | 6 | 3/4/2/0 | 1.6 | 7 | 0/150/0/30 | 4 | 2 | 40 | rev | II | szállít 8 népességpontot; pontosság 0.7 |

### 8.2 Végváriak
| id | Név | Osztály | HP | Tám | Típus | Újr | Táv | Páncél | Seb | Látás | Ár | Zsold | Nép | Képz s | Hol | Rang | Jellemzők |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `darabont` | Darabont | gyalog | 70 | 8 | szúró | 1.8 | 1 | 3/2/0/0 | 0.9 | 6 | 50/25/0/0 | 2 | 1 | 20 | kaszarnya | I | `hazai`, `pika`, +10 lovas ellen |
| `hajdu` | Hajdú | lövész | 45 | 14 | lövő | 4.0 | 6 | 1/1/0/0 | 1.1 | 7 | 45/20/0/0 | 3 | 1 | 22 | kaszarnya | I | `hazai`, pontosság 0.75, közelharc 5 vágó / 1.5 s |
| `huszar` | Huszár | lovas | 85 | 10 | vágó | 1.5 | 0 | 2/1/0/0 | 1.8 | 8 | 70/0/0/30 | 5 | 2 | 30 | istallo | II | `hazai`, `portya`, `roham` |
| `vitez` | Végvári vitéz | gyalog | 95 | 12 | vágó | 1.6 | 0 | 4/3/1/0 | 1.0 | 6 | 60/0/0/40 | 5 | 1 | 28 | kaszarnya | II | `hazai`, `allhatatos` |
| `tarack` | Tarack | ostrom | 60 | 40 | zúzó | 8.0 | 9 (min 2) | 0/5/2/0 | 0.5 | 7 | 0/80/60/60 | 6 | 3 | 45 | agyuonto | III | szórás 1, épület ellen ×2, telepítés 3 s |

### 8.3 Oszmán had
| id | Név | Osztály | HP | Tám | Típus | Újr | Táv | Páncél | Seb | Látás | Ár | Zsold | Nép | Képz s | Hol | Rang | Jellemzők |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `azab` | Azab | gyalog | 40 | 6 | vágó | 1.5 | 0 | 0/0/0/0 | 1.1 | 6 | 30/0/0/0 | 1 | 1 | 12 | kaszarnya, satortabor | I | `birodalmi` |
| `akindzsi` | Akindzsi | lovas | 65 | 8 | vágó | 1.4 | 0 | 1/0/0/0 | 2.0 | 9 | 50/0/0/10 | 1 | 2 | 22 | istallo, satortabor | I | `birodalmi`, `portya`, `gyujtogato` |
| `janicsar` | Janicsár | lövész | 60 | 18 | lövő | 3.5 | 7 | 2/2/1/0 | 1.0 | 7 | 60/20/0/30 | 6 | 1 | 30 | kaszarnya | II | `birodalmi`, pontosság 0.85, közelharc 8 vágó / 1.5 s |
| `szpahi` | Szpáhi | lovas | 120 | 13 | vágó | 1.7 | 0 | 4/3/1/0 | 1.5 | 7 | 90/0/0/40 | 0 | 2 | 35 | istallo | II | `birodalmi`, `roham`, `timar`, télen támadás ×0.7 |
| `lagumdzsi` | Lagumdzsi | gyalog | 35 | 3 | vágó | 2.0 | 0 | 0/0/0/0 | 1.0 | 5 | 40/0/0/20 | 2 | 1 | 20 | kaszarnya | II | `birodalmi`, `aknasz` |
| `agyu` | Ostromágyú | ostrom | 90 | 90 | zúzó | 12.0 | 11 (min 3) | 0/6/3/0 | 0.3 | 7 | 0/150/100/100 | 10 | 4 | 70 | agyuonto | III | szórás 1, épület ellen ×3, telepítés 6 s, `nehez` |

### 8.4 Császáriak
| id | Név | Osztály | HP | Tám | Típus | Újr | Táv | Páncél | Seb | Látás | Ár | Zsold | Nép | Képz s | Hol | Rang | Jellemzők |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `landsknecht` | Landsknecht | gyalog | 85 | 10 | szúró | 1.8 | 1 | 4/3/1/0 | 0.85 | 6 | 60/20/0/20 | 6 | 1 | 24 | kaszarnya | I | `zsoldos`, `pika`, +12 lovas ellen |
| `musketas` | Muskétás | lövész | 50 | 20 | lövő | 4.5 | 7 | 1/1/0/0 | 0.9 | 7 | 50/25/0/25 | 6 | 1 | 26 | kaszarnya | II | `zsoldos`, pontosság 0.80, közelharc 4 vágó / 1.5 s |
| `vertes` | Vértes | lovas | 140 | 14 | vágó | 1.8 | 0 | 6/4/3/0 | 1.3 | 7 | 100/0/0/60 | 9 | 2 | 40 | istallo | II | `zsoldos`, `roham`, `nehez` |
| `hadmernok` | Hadmérnök | munkás | 40 | 3 | vágó | 2.0 | 0 | 1/1/0/0 | 1.0 | 6 | 50/0/0/30 | 3 | 1 | 25 | var | II | `zsoldos`; kőépítés 2 pont/s, javítás 20 HP/s; akna észlelése 4 cs-en belül |
| `mozsar` | Mozsár | ostrom | 70 | 70 | zúzó | 14.0 | 10 (min 4) | 0/5/2/0 | 0.4 | 7 | 0/120/80/90 | 9 | 3 | 60 | agyuonto | III | `zsoldos`, szórás 2, épület ellen ×2.5, ívelt lövés (fal mögé lő), `gyujtogato`, telepítés 5 s |

### 8.5 Jellemzők
| Jellemző | Szabály |
|---|---|
| `hazai` / `zsoldos` / `birodalmi` | fizetetlenségi viselkedés (5.2). `hazai` arat (4.3). |
| `pika` | Vonal alakzatban, álló helyzetben a szemből érkező rohamot semlegesíti (9.5). |
| `roham` | lásd 9.5 |
| `portya` | zsákmányol (5.3), falut éget (4.6). Portya mód kapcsolható: sebesség ×1.2, saját páncél ×0.75. |
| `gyujtogato` | éghető épületre mért találat tüzet okoz (9.8) |
| `allhatatos` | saját vártól ≤ 8 cs-re morálja nem megy 40 alá |
| `timar` | Szpáhik max. száma = saját szántók + 3 × saját falvak. Ha a keret csökken, a többlet szpáhi fizetőnapon feloszlik. |
| `aknasz` | lásd 9.9 |
| `nehez` | jégen nem jár |
| `vezer` | Játékosonként 1. 8 cs-en belül saját egység morál +1/s. Halálakor minden saját egység morál −20. 90 s múlva ingyen újraéled a várban. |

## 9. Harc

### 9.1 Sebzésképlet
```
nyers  = (tám + osztálybónusz) × M_morál × M_oldal × M_magasság × M_roham × M_évszak × M_státusz
sebzés = max(1, round(nyers − célpont.páncél[típus]))
épület ellen: sebzés = max(1, round(nyers × épület_szorzó − épület.páncél[típus]))
```
- `M_morál = 0.75 + 0.5 × morál/100` (0.75–1.25)
- `M_évszak`: Oszmán nyáron 1.10; Szpáhi télen 0.70; egyébként 1.0
- `M_státusz`: fizetetlen `hazai` 0.75; egyébként 1.0

### 9.2 Célzás és találat (lövész, torony, naszád)
```
p = pontosság × (1 − 0.4 × távolság/hatótáv) × M_eső × M_fedezék × M_laza
```
- `M_eső` = 0.75 tavasszal (lövő típusra; `kereklakat` fejlesztéssel 1.0)
- `M_fedezék` = 0.7, ha a célpont erdőben áll; 0.5, ha fal mögött/helyőrségben
- `M_laza` = 0.85, ha a célpont Laza alakzatban van
- Torony pontossága 0.9. Találat eldöntése: PRNG < p. Azonnali találat (nincs lövedékrepülés).
- Lövész közelharcba kényszerítve (ellenség ≤ 1 cs) a közelharci értékeit használja.

### 9.3 Ostromlövedék
Célpontja talajpozíció, a lövedék 12 cs/s sebességgel repül, mozgó cél kitérhet. Szórás: a becsapódás csempéjén 100%, `szórás` sugarán belül 50% sebzés. Saját egységet 50%-kal sebez. Egyenes lövés (tarack, ágyú, bástya) útjában álló fal megállítja; a mozsár ívelt. Telepítés: mozgás után ennyi ideig nem lő.

### 9.4 Magasság
Dombról síkra: `M_magasság` = 1.25 és +1 hatótáv. Síkról dombra: 0.75. Azonos szinten 1.0.

### 9.5 Oldal, hát, roham
- A támadás iránya a célpont nézési irányához képest: 0–60° szemből ×1.0; 60–120° oldalból ×1.25; 120–180° hátból ×1.5. Épületre nem vonatkozik.
- **Roham** (`roham`): ha az egység az ütés előtt ≥ 4 csempét haladt megszakítás nélkül, ±30°-on belüli irányban, az első ütés `M_roham` = 2.0 (Ék alakzatban 2.5). Lehűlés 10 s.
- **Pika:** ha a célpont `pika`, Vonal alakzatban áll, és a roham szemből éri: `M_roham` = 0.5, és a rohamozó azonnal megkapja a pikás egy teljes ütését.

### 9.6 Morál
Egységenként 0–100, kezdő 70.

| Esemény | Változás |
|---|---|
| saját egység meghal 5 cs-en belül | −4 |
| ellenséges egység meghal 5 cs-en belül | +2 |
| 6 cs-en belül az ellenséges népességpont ≥ 2× a saját | −1/s |
| `vezer` 8 cs-en belül | +1/s |
| harcon kívül (10 s) | 70 felé ±0.5/s |
| vezér meghal | −20 mindenkinek |
| éhínség | −1/s |
| lármafa, dzsámi | lásd 7. |

Morál < 25: **megfutamodás** — az egység 10 s-ig irányíthatatlanul a legközelebbi saját épület felé fut (sebesség ×1.2), utána morálja 35. Ostromgép és munkás nem futamodik meg (ostromgép kezelői 0 morálnál elhagyják: mozgásképtelen 20 s).

### 9.7 Alakzatok (kijelölt csoportra)
| Alakzat | Hatás |
|---|---|
| Vonal | sebesség ×0.8; szemből kapott szúró és lövő sebzés ellen +2 páncél; `pika` aktív |
| Ék | csak lovas; roham ×2.5; oldalból/hátból kapott sebzés további ×1.2 |
| Laza | szórt sebzés ×0.5, `M_laza` aktív; nincs más bónusz |
| nincs | alapértelmezés |

A csoport a leglassabb tag sebességével halad, ha alakzatban van.

### 9.8 Tűz
Éghető épület `gyujtogato` találattól 20 s-ig ég (tavasszal 10 s): 6 HP/s (nyáron 8). Újabb találat újraindítja az időt. Ha egy épület 10 s-e folyamatosan ég, a vele szomszédos (≤ 1 cs) éghető épületek is kigyulladnak. Oltás: jobbágy vagy hadmérnök, 5 s munka.

### 9.9 Aknázás
`aknasz` egység fallal vagy toronnyal szomszédos csempén áll és ás: 40 s (télen 80 s, fagyott föld), mocsáron és elöntött csempén nem lehet. Kész akna: 600 sebzés a célszegmensnek és 300 a két szomszédos falszegmensnek, páncél nélkül. Az ásó egység sebzésre megszakad és elölről kezdi. Hadmérnök 4 cs-en belül láthatóvá teszi az ásást (ikon a fal fölött).

### 9.10 Helyőrség
Épületben ülő egység nem sebezhető, +1 HP/s gyógyul. Lövész a toronyból/várból saját értékeivel lő, +1 hatótávval. Ha az épület HP-ja 0, a bent ülők 50% HP-val kiesnek.

### 9.11 Célválasztás és viselkedés
Állások: **Támadó** (látótávon belül üldöz), **Védekező** (alap; 4 cs-ig üldöz, visszatér), **Helytálló** (nem mozdul), **Tartózkodó** (nem támad). Automatikus célprioritás: (1) aki őt támadja, (2) akire bónusza van, (3) legközelebbi katonai egység, (4) legközelebbi munkás, (5) épület. Ostromgép alapból épületet céloz.

### 9.12 Ellenszer-háló (tervezési szándék)
pikás > lovas > lövész > pikás; könnyűlovas > ostromgép és munkás; ostromgép > épület és tömör alakzat; palánk olcsó és jól állja az ágyút, de ég; kőfal nem ég, de drága és az akna ellen ugyanúgy sebezhető.

## 10. Frakciók passzív szabályai

| Frakció | Szabály |
|---|---|
| **Végváriak** | Fa- és palánképületek ára ×0.8. Palánkfal 3 s. Zsákmány-Z ×2. `hazai` egységek aratnak. Saját vártól ≤ 10 cs-re morál +10 (plafon 100). Kőfal csak III. rangon. |
| **Oszmán had** | Népességplafon 250. Kincstári zsold minden tavasz elején: 60 Z + 20 Z × (rang − 1). Nyáron támadás és sebesség ×1.10. Télen dupla fagy (4.9), sátortábor nem ad szállást. Kőfal csak III. rangon. |
| **Császáriak** | Minden katona `zsoldos`. Kőfal II. rangtól, bástya III. rangon. Hadisegély bástyánként. Toborzóhely. Jobbágy képzése 25 s. |

## 11. Fejlesztések

| id | Név | Hol | Rang | Ár | Idő s | Hatás |
|---|---|---|---|---|---|---|
| `vasalt_eke` | Vasalt eke | malom | I | 100/50/0/0 | 30 | szántóhozam `tech_szorzó` 1.2 |
| `gabonaverem` | Gabonaverem | malom | II | 0/150/50/0 | 40 | téli fogyasztás ×1.25 (×1.5 helyett) |
| `fureszmalom` | Fűrészmalom | fatelep | II | 100/100/0/0 | 40 | favágás 0.60 F/s |
| `ekcsakany` | Ékcsákány | kobanya | II | 100/100/0/0 | 40 | kőfejtés 0.38 K/s |
| `edzett_penge` | Edzett penge | kovacs | II | 150/0/50/0 | 40 | vágó és szúró támadás +2 |
| `sodronying` | Sodronying | kovacs | II | 150/0/75/0 | 40 | gyalog és lovas páncél +1/+1/0/0 |
| `mellvert` | Mellvért | kovacs | III | 200/0/100/50 | 60 | gyalog és lovas páncél +1/+1/+1/0 |
| `papirtolteny` | Papírtöltény | kovacs | II | 100/100/0/50 | 45 | lövész újratöltés ×0.85 |
| `kereklakat` | Keréklakatos puska | kovacs | III | 0/200/0/150 | 60 | `M_eső` = 1.0 |
| `tuzes_golyo` | Tüzes golyó | agyuonto | III | 0/150/100/100 | 60 | tarack és ágyú `gyujtogato` |
| `fuleskosar` | Sánckosár | agyuonto | III | 0/200/0/50 | 45 | telepített ostromgép szúró és lövő páncélja +4 |
| `olasz_bastya` | Olasz bástya | var (Császári) | III | 0/0/300/100 | 70 | kőfal és bástya zúzó páncélja 4 → 8 |

## 12. Látás

Három állapot csempénként: felderítetlen (fekete), köd (utolsó ismert terep és épületek), látható. Látás = kör a „Látás” sugárral; erdőcsempe mögé csak 1 csempényire látni; dombról +2. Erdőben álló egység csak ≤ 2 cs-ről látszik. A szövetségesek látása közös.

## 13. Győzelem és vereség

- **Vereség:** a játékos utolsó `var`-ja elpusztul (új vár nem építhető).
- **Hódítás:** utolsó állva maradt játékos/szövetség nyer.
- **Hódoltság:** aki a térkép falvainak ≥ 60%-át 480 s-ig megszakítás nélkül birtokolja, nyer. Visszaszámláló mindenkinek látszik.
- **Kitartás** (hadjárat-pályák): a védő nyer, ha a megadott év teléig áll a vára.

## 14. Térképgenerálás

1. Egy fő folyó a térképen átlósan, 3–5 csempe széles, kanyarulatokkal; 2–4 gázló; folyóparti sáv (3 cs) sík.
2. Játékosok indulóhelye a folyótól 8–12 cs-re, egymástól ≥ 50 cs-re, a 4.1 garanciáival.
3. Állandó mocsárfoltok az ártéren (a sík ártér 10%-a), erdő 25%, domb 12%.
4. Falvak egyenletesen, két játékos között félúton legalább 1; utak falutól faluig és a gázlókhoz.
5. A pálya tükörszimmetrikus 2 játékosnál, forgásszimmetrikus többnél.

## 15. Irányítás és HUD-kötések

| Bevitel | Hatás |
|---|---|
| bal klikk / húzás | kijelölés / kijelölő téglalap; dupla klikk: azonos típus a képernyőn |
| jobb klikk | környezetfüggő parancs: mozgás, támadás, gyűjtés, építés folytatása, beszállás |
| Shift + parancs | parancssor fűzése |
| Ctrl + 0–9 / 0–9 | csoport mentése / előhívása |
| A, S, P, H | támadó mozgás, állj, őrjárat, helytállás |
| F1–F3 | Vonal, Ék, Laza |
| R | Portya mód |
| Szóköz | ugrás az utolsó riasztáshoz |

A HUD-nak mindig mutatnia kell: 4 nyersanyag, népesség/plafon, évszak és a váltásig hátralévő idő, várható zsoldigény és hiány, kistérkép riasztásokkal, kijelölés adatai (HP, morál, státuszok), gyártási sor. Riasztások: támadás alatt, áradás 10 s múlva, jégolvadás 20 s múlva, fizetőnap 30 s múlva, éhínség, lázadás.

## 16. Gépi ellenfél

Állapotgép 2 s-onként értékelve, három nehézség (könnyű: 0.7× gyűjtési ráta és 4 s döntés; közepes: szabályos; nehéz: 1 s döntés, pontos zsoldtervezés).

1. **Gazdaság:** célarány jobbágyokra — I. rang: 40% élelem, 45% fa, 15% kő; II–III: 35/30/20 és 15% karám/vásár. Tavasszal minden szántót bevet, ősszel szántónként 1 aratót rendel (Végvárinál katonát is). Házat épít, ha a szabad népesség < 4.
2. **Zsoldterv:** nyár elején becsli az őszi bevételt; csak akkor képez, ha `Z + várt_bevétel ≥ zsoldigény × 1.1`. Hiány esetén elad a vásártéren, vagy portyát indít.
3. **Évszak-viselkedés:** tavasszal véd és épít (ártérre nem épít); nyáron támad, ha a seregértéke ≥ 1.3× az ismert ellenségesnek; ősszel 6–8 lovassal portyázik az ellenség aratóira és falvaira; télen a befagyott folyón át támad, ha az ellenség fala a folyóra támaszkodik, és 450 előtt visszavonul a jégről.
4. **Seregösszetétel:** az ellenség látott összetétele alapján az ellenszer-háló szerint (9.12), alapértelmezés 40% gyalog, 30% lövész, 20% lovas, 10% ostrom.
5. **Védelem:** riasztáskor a 15 cs-en belüli katonákat a támadott épülethez küldi, munkásokat a várba menekíti.

## 17. Tick-sorrend és adatmodell

Egy tick lépései, ebben a sorrendben:
1. Bejövő parancsok alkalmazása (tick-számra időzítve).
2. Évszak-óra: terepváltozás (áradás, jég), évszak-események, fizetőnap.
3. Gazdaság: gyűjtés, lerakás, fogyasztás, karám, piaci árak.
4. Gyártás, építés, kutatás, rangemelés.
5. Mozgás és útkeresés.
6. Célválasztás, támadások, lövedékek, sebzés.
7. Tűz, akna, fagy, éhínség, gyógyulás.
8. Morál, megfutamodás, hűségállapotok.
9. Halál és törlés, zsákmány jóváírása.
10. Látás frissítése, győzelmi feltételek.

```ts
type Res = { e: number; f: number; k: number; z: number };
type Armor = { vago: number; szuro: number; lovo: number; zuzo: number };
type UnitDef = { id: string; nev: string; frakcio: 'kozos'|'vegvari'|'oszman'|'csaszari';
  osztaly: 'munkas'|'gyalog'|'lovesz'|'lovas'|'ostrom'|'hajo';
  hp: number; tam: number; tipus: keyof Armor; ujratoltes: number; tav: number; minTav?: number;
  pancel: Armor; seb: number; latas: number; ar: Res; zsold: number; nep: number;
  kepzes: number; hol: string[]; rang: 1|2|3; pontossag?: number; szoras?: number;
  epuletSzorzo?: number; telepites?: number; bonusz?: Record<string, number>;
  kozelharc?: { tam: number; ujratoltes: number }; jellemzok: string[] };
type BuildingDef = { id: string; nev: string; frakcio: string[]; rang: 1|2|3; ar: Res;
  epites: number; hp: number; pancel: Armor; egheto: boolean; meret: [number, number];
  nep?: number; szallas?: number; helyorseg?: number; latas?: number;
  tamadas?: { tam: number; tipus: keyof Armor; ujratoltes: number; tav: number; minTav?: number; szoras?: number } };
type Unit = { uid: number; def: string; owner: number; x: number; y: number; irany: number;
  hp: number; moral: number; fizetes: 'fizetett'|'fizetetlen1'|'fizetetlen2'|'lazado';
  alakzat: 'nincs'|'vonal'|'ek'|'laza'; allas: 'tamado'|'vedekezo'|'helytallo'|'tartozkodo';
  portyaMod: boolean; teher?: { tipus: keyof Res; menny: number }; parancsok: Order[];
  rohamTav: number; utolsoSebzesTick: number };
type Player = { id: number; frakcio: string; keszlet: Res; rang: 1|2|3; techs: string[];
  fizetesiSorrend: string[]; nepesseg: number; plafon: number };
type World = { tick: number; seed: number; csempek: Tile[]; units: Unit[]; buildings: Building[];
  falvak: Village[]; players: Player[] };
```
A 7., 8. és 11. fejezet táblázatai közvetlenül ezekbe a definíciókba töltendők (`data/units.json`, `data/buildings.json`, `data/techs.json`).

## 18. Tesztesetek

Mindenhol: sík terep, morál 70 (`M_morál` = 1.10), ősz, nincs fejlesztés, hacsak nincs más írva.

| # | Helyzet | Számítás | Eredmény |
|---|---|---|---|
| 1 | Huszár szemből üt Darabontot | round(10 × 1.10 − 3) | **8** |
| 2 | Darabont szemből üt Huszárt | round((8+10) × 1.10 − 1) | **19** |
| 3 | Huszár Ék alakzatban, rohammal, hátból üt Hajdút | round(10 × 1.10 × 1.5 × 2.5 − 1) | **40** |
| 4 | Vértes szemből rohamoz Vonalban álló Landsknechtet | round(14 × 1.10 × 0.5 − 4) = 4; a Vértes kap round((10+12) × 1.10 − 4) | **4**, visszakap **20** |
| 5 | Janicsár lő 5 cs-ről, tavasszal, nyílt terepen álló célra | 0.85 × (1 − 0.4×5/7) × 0.75 | **p ≈ 0.455** |
| 6 | Janicsár nyáron eltalál Huszárt | round(18 × 1.10 × 1.10 − 0) | **22** |
| 7 | Ostromágyú palánkfalra | round(90 × 1.10 × 3 − 8) | **289** (600 HP → 3 lövés) |
| 8 | Ostromágyú kőfalra | round(90 × 1.10 × 3 − 4) | **293** (1800 HP → 7 lövés) |
| 9 | Ártéri szántó malommal | floor(300 × 1.25 × 1.15) | **431 E** |
| 10 | Zsold: 10 Hajdú + 6 Huszár, 48 Z | igény 60; 10×3 = 30, majd 3×5 = 15 | 3 Huszár **fizetetlen**, marad 3 Z |
| 11 | Egy népességpont éves élelme | 360×0.05 + 120×0.075 | **27 E** |
| 12 | Égő palánk nyáron, oltás nélkül | 20 s × 8 HP/s | **−160 HP** |
| 13 | Dombról lövő Hajdú hatótávja és sebzése Azabra | táv 6+1; round(14 × 1.10 × 1.25 − 0) | **7 cs**, **19** |
| 14 | Áradás, 3. év, t_ev = 20 | R = 3; s = 3 × 20/40 = 1.5 → floor | folyótól **≤ 1 cs** elöntve |

## 19. Ismert nyitott pontok

- A számok első, kézzel számolt egyensúlyt adnak; játékteszt nélkül nincsenek hangolva. A leggyanúsabb területek: karám jövedelmezősége, Oszmán kincstári zsold, Toborzóhely ára.
- Hadjárat-pályák (Eger 1552, Szigetvár 1566, Buda 1686) forgatókönyve nincs kidolgozva.
- Hang, zene, animációs állapotok listája, hálózati protokoll részletei hiányoznak.
