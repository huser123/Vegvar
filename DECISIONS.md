# VÉGVÁR — megvalósítási döntések

A szabálykönyv (`Vegvar - Jatekszabaly es logika.md`) 0. fejezete szerint ide kerül minden, amit a dokumentum nem ír le,
vagy amiben a megvalósítás eltér tőle.

## Platform

- TypeScript + Vite, saját Canvas 2D megjelenítő, külső játékmotor nélkül. A build statikus (`dist/`), relatív
  hivatkozásokkal, ezért Cloudflare Pages-en változtatás nélkül futtatható (build: `npm run build`, kimenet: `dist`).
- Minden grafika procedurálisan, betöltéskor készül (`src/art/`), külső képfájl nincs. A hangok Web Audio szintézisből jönnek.
- Az adattáblák (7., 8., 11. fejezet) JSON helyett típusos TypeScript-modulban élnek: `src/sim/data.ts`.

## Szimuláció

- 20 tick/s, fix lépés, egyetlen xorshift32 PRNG. A szimuláció állapota csak egész számokat tartalmaz: pozíció
  ezredcsempében, életerő és morál ezredben, nyersanyag tízezredben (a 0,35 E/s és a 62,5 ezrelékes téli fogyasztás miatt).
  A sebzés szorzóláncát BigInt számolja, így a kerekítés pontos.
- Kivétel: a **térképgenerátor** lebegőpontos zajt és szinuszt használ. A kész pálya egész tömb; hálózati játékhoz a pályát
  a gazdagépnek kellene szétküldenie, vagy a generátort egészre átírni.
- Útkeresés: A* mozgásosztályonként, egyenes vonalú rövidítéssel. Flow field nincs; a csoport tagjai egyenként keresnek
  utat a saját alakzati helyükre, tickenként legfeljebb 6 új útkereséssel. Az egységek lágyan széttolják egymást.
- A tick lépései a 17. fejezet sorrendjét követik; a másodpercenkénti rendszerek (fogyasztás, fagy, morál) a másodperc
  különböző tickjein futnak.

## Szabályértelmezések

- **Áradás:** az elöntés a rét, út és gázló csempéket érinti (erdőt, kőlelőhelyet nem). A gázló bármilyen pozitív
  áradási szintnél járhatatlan. Épületnél a lábnyom középső csempéje számít; így az ártéri szántó (közepe 3 csempére a
  folyótól) a rendes években megússza, a nagy árvizet 100 HP-val éppen túléli.
- **Oszmán kincstári zsold:** a 2. év tavaszától jár (az induló 60 zsold az első év).
- **Fizetési sorrend:** csak az alapértelmezés él (zsold szerint növekvő, azon belül a régebbi egység); a játékos nem
  rendezheti át. Az utófizetés gombja ugyanebben a sorrendben fizet, amíg a pénz futja.
- **Szántó:** a jobbágy a szántóra küldve azt teszi, ami az évszakban lehet (tavasszal vet, ősszel arat), utána a
  legközelebbi teendős szántóra megy át; ha nincs, tétlen lesz.
- **Vadászat:** a vadat a vadász az első érintéskor elejti, külön harc nincs.
- **Marhahajtás:** az elhajtott marha a saját várhoz, karámhoz vagy vásártérhez érve darabonként 20 zsoldot ér
  (zsákmányként, a végvári ×2 szorzóval).
- **Helyőrség:** a lövészek saját értékeikkel, +1 hatótávval lőnek az épület közepéről; a vár 5 bent ülőnként +1 lövést
  kap. A más osztályú egységek csak védve vannak.
- **Gyújtogató közelharcos (akindzsi):** minden épületre mért ütése gyújt.
- **Lázadó janicsár:** mindenkinek ellenség, a volt gazdája legközelebbi épületét támadja; a saját csapatai és tornyai
  lőnek rá.
- **Látás:** a köd alatt az ellenséges épületek a jelenlegi állapotukban látszanak, nem az utolsó ismert szerint.
- **Kapu, rév:** az 1×2-es és 2×3-as lábnyom elforgatható (R vagy görgő).

## Ami nem készült el

- **Sátortábor összecsomagolása szekérré** és a **naszád csapatszállítása**: az épület és a hajó működik, ez a két
  képességük nincs meg.
- **Többjátékos mód** (hálózat), **pályaszerkesztő**, **mentés/betöltés**. A menüben ezért nem szerepelnek.
- **Hadjárat:** az I. küldetés (Eger, 1552 – „Kitartás”) játszható; a II. és III. a wireframe szerint zárolva látszik,
  forgatókönyvük a szabálykönyvben sincs kidolgozva.
- **Pályaméret:** kicsi (96×96) és közepes (128×128), mindkettő két játékosra. A nagy pálya és a 3–6 játékos nincs meg.
- **Gépi ellenfél:** nem épít falat és révet, nem használ aknászt célzottan és nem hajt marhát. Az ellenség seregértékét
  a ténylegesen élő egységekből számolja, nem csak a látottakból.
- **Körmenü (1c)** és az **oldalsávos elrendezés (1b)**: a HUD az 1a alsó sávos elrendezést követi, az 1d krónikájával
  és előre jelzett zsoldhiányával.

## Egyensúly

A számok a szabálykönyv értékei, hangolás nélkül. A gép–gép próbameccsek (`npx tsx tools/headless.ts`) alapján a zsold a
szűk keresztmetszet (a császári sereg ezért kicsi marad), a tél és az éhínség pedig gyorsan öl.
