# CLAUDE.md

Živý dokument. Průběžně aktualizuj, udržuj krátký a přehledný.

## Projekt
- Název: 2D a 3D měření pomocí fotomobilu
- Firma: Michal Malec - 2M elektro (www.2Melektro.eu)
- Jednou větou: z několika fotek s terči zaměřit 2D plochu nebo 3D objekt.
- Problém: urychlit plánování rozmístění zařízení při montáži na zeď nebo do prostoru.
- Hlavní cíl: 2D/3D zobrazení s kótami zaměřených ploch. Ve 2D skládat zařízení na plochu, ve 3D v prostoru; kóty mezi objekty se při skládání přepočítávají.
- Měřítko úspěchu: aplikace je použitelná v denním provozu.
- Uživatelé: elektrotechnici, obchodní zástupci, designéři (tisíce a víc).
- Potřeby: po nafocení mít hotovo; kontrola, že je fotek dost.
- Termín první verze: 24. 12. 2026
- Nasazení: GitHub Pages, odkaz do skupiny; po týdnu sběr připomínek a opravy.

## Uživatel
- Skill level: začátečník
- Neptej se na technické detaily. Rozhoduj sám, vysvětluj jednoduše.
- Komunikace v chatu: česky. Kód (proměnné, komentáře, commity): anglicky.

## Funkce
### První verze (vyfotit a zaměřit)
1. **F01** Aplikace běží v prohlížeči na PC a zobrazí QR kód.
2. **F02** Telefon naskenuje QR → otevře se stránka pro odeslání → „+“ otevře galerii/fotoaparát → fotky se pošlou do PC (obě zařízení na stejné Wi-Fi).
3. **F03** Kontrola odeslaných fotek: telefon dostane potvrzení o přijetí, PC ukáže seznam fotek a zda jich je pro zaměření dost.
4. Zaměření: z terčů na fotkách spočítat rozměry a zobrazit kóty.

### Později
- Skládání zařízení na plochu / v prostoru z uložených objektů, přesouvání myší, přepočet kót.
- Přihlášení (napojení na účet platformy „Nástroje elektrotechnika“), AI model, e-mail, mapy, kalendář.

### Aplikace dělat nebude
- (zatím neuvedeno)

## Stack (rozhodnutí agenta)
- Statická webová aplikace (PWA) — jedna stránka pro PC i mobil, hosting GitHub Pages (HTTPS → funguje fotoaparát i instalace).
- Vite 8 + React 19 + TypeScript 7, Tailwind CSS 4, font Barlow (@fontsource, funguje offline), QR přes `qrcode`.
- Přenos fotek telefon → PC: WebRTC přes PeerJS. PC zobrazí QR s odkazem obsahujícím jednorázové ID spojení; veřejný server PeerJS jen „seznámí“ zařízení, samotné fotky jdou napřímo po Wi-Fi.
- Zaměření: OpenCV.js + terče ArUco (tištěné, známá velikost). 2D = homografie z terče v rovině; 3D = více fotek s terči (řešit až po 2D).
- Ukládání: IndexedDB (Dexie) v prohlížeči PC → data přežijí obnovení stránky.
- Testy: Playwright (E2E).
- Ověřuj na internetu nejnovější stabilní verze knihoven před instalací.

## Pravidla
### Prostředí
- **Vše spouštěj VÝHRADNĚ přes Docker.** Na hostu smí běžet jen `docker` a `git` (žádný `node`, `npm`, `npx`, `playwright` přímo na hostu).
- NIKDY needituj .env — používej pouze .env.local
- Avast skenuje HTTPS → při chybách certifikátů v Dockeru použij kořenový certifikát v `docker/certs/` (gitignored), stejně jako v projektu miniaplikace.

### Git a commity
- Pracuj na větvi `dev` (nebo feature branch z dev), nikdy nepushuj přímo na main.
- Před každým commitem a pushem se zeptej uživatele.
- Commit zprávy anglicky, stručně (feat: ..., fix: ...).
- main = produkční nasazení na GitHub Pages — při merge upozorni.

### Testy
- Ke každé funkci test; po napsání funkce vždy spusť E2E testy.
- Testová data mají prefix `[E2E]` + timestamp.

| ID | Funkce | Postup | Očekávaný výsledek |
| --- | --- | --- | --- |
| T01 | PC zobrazí QR kód | Načtu QR telefonem | V mobilu se otevře stránka pro odeslání fotek |
| T02 | Nafotit, vybrat z galerie, odeslat do PC | Kontroluji výstup na monitoru | Zobrazení se všemi možnými kótami |
| T03 | Kontrola odeslaných fotek | Potvrdím odeslání | Dostanu potvrzení o přijetí + u každé fotky, zda je použitelná (terč nalezen / malý / z boku / chybí) |
| T04 | Tisk terčů A4 | Vytisknu terč(e) | Každý terč na vlastní A4, černý čtverec 180 mm, kód podle ArUco |
| T05 | Kóty na fotce | Kliknu 2 body na fotce s terčem | Rozměr v mm (test: chyba < 2 mm na 100 mm i z perspektivy) |

Závěrečný checklist před spuštěním:
- [ ] T01, T02, T03
- [ ] Funguje na mobilu (Android Chrome, iPhone Safari)
- [ ] Prázdné a chybné vstupy
- [ ] Data se neztratí po obnovení stránky
- [ ] Rychlost načítání
- [ ] Srozumitelné chybové hlášky
- [ ] Ovládání jen klávesnicí
- [ ] Různé prohlížeče
- [ ] Použitelné v denním provozu

### Bezpečnost
- U každé funkce kontroluj bezpečnost (validace souborů, XSS, kdo se smí připojit k PC).
- Rizika zapisuj do `security_warnings.md`.
- Fotky mohou obsahovat soukromí zákazníků → neposílat na cizí servery, ukládat jen lokálně.

### Mazací akce
- Každé smazání (fotky, projektu) musí mít potvrzovací dialog.

### Grafika a UI
- Brand 2M elektro: primární #1a273d (tmavě modrá), sekundární #fab60a (elektro žlutá), bílá #ffffff, šedomodrá #cbd7e6.
- Vzhled: jednoduchý, profesionální, tmavý, s hravými barevnými akcenty, **velké ovládání** (práce v terénu, v rukavicích).
- Hlavní ovládací prvek na mobilu: velké tlačítko „+“ pro přidání fotky.

## Postup stavby
1. Připravit základ projektu (Docker, Vite, testy)
2. F01 QR kód → test T01
3. F02 odeslání fotek → test T02
4. F03 potvrzení a kontrola → test T03
5. Zaměření 2D z terčů + kóty
6. Kompletní test podle checklistu, opravy, opakování
7. Nasazení na GitHub Pages

## Rizika
- Přesnost měření závisí na kvalitě fotek, světle a správně vytištěném terči (kalibrace měřítka).
- Některé Wi-Fi (hostovské, firemní) blokují přímé spojení zařízení → potřeba záložní cesty (TURN server) nebo jasné hlášky.
- Spojení přes PeerJS potřebuje internet pro „seznámení“ zařízení.
- 3D zaměření z fotek je výrazně složitější než 2D → první verze cílí na 2D, 3D až potom.
- iPhone Safari má omezení (velké fotky HEIC, paměť) → zmenšovat fotky před odesláním, převádět na JPEG.
- Termín 24. 12. 2026 je těsný pro 3D.

## Struktura projektu
Zaznamenávej složky a jejich účel. Aktualizuj při každé změně.

```
mereni-telefonem/
├── docker-compose.yml   # app (Vite :5173) + peer (PeerJS server, dev) + e2e (profil test)
├── Dockerfile           # dev image (node:26-slim)
├── docker/              # e2e.Dockerfile, certs/ (Avast CA, gitignored)
├── e2e/                 # Playwright testy (t01-qr.spec.ts …)
├── public/              # favicon a statické soubory
├── security_warnings.md # známá bezpečnostní rizika
└── src/
    ├── App.tsx          # hash router: "#/" = PC, "#/send?pc=<id>" = telefon, "#/terce" = tisk terčů, "#/foto/<id>" = měření
    ├── pages/           # DeskPage (PC, QR kód), SendPage (telefon, tlačítko +), TargetsPage (terče A4), MeasurePage (kóty)
    ├── components/      # Header, QrCode, StatusBadge, PhotoGrid, ConfirmDialog (každé mazání), TargetSheet (SVG A4 v mm)
    └── lib/             # links (adresa QR), peer (PeerJS), protocol (zprávy + validace), transfer (posílání po kouscích),
                         # image (kontrola/převod fotek), db (Dexie: fotky v IndexedDB), storage,
                         # markers + aruco-dictionary (geometrie terče, kódy ARUCO_MIP_36h12),
                         # detect (Web Worker), analysis (hodnocení fotky, homografie), homography (výpočet)
public/aruco/            # js-aruco2 2.0.0 (MIT, beze změn) + worker.js – rozpoznání terčů ve vlákně
```

## Příkazy (vše v Dockeru)
- Dev server: `docker compose up -d` → PC http://localhost:5173, telefon přes QR (adresa PC ve Wi-Fi z `.env.local` → `VITE_LAN_URL`)
- Typy: `docker compose exec app npx tsc --noEmit`
- Build: `docker compose exec app npm run build`
- E2E testy: `docker compose run --rm e2e`
- Nový balíček: `docker compose exec app npm install <balíček>` + `docker compose up -d --build`
- Po změně `.env.local`: `docker compose up -d --force-recreate`

## Nuance
- Vývoj: PeerJS server běží v Dockeru (služba `peer`) a Vite ho zpřístupní na `/peerjs` (`VITE_PEER_MODE=local`). Ostrá verze (GitHub Pages) použije veřejný PeerJS cloud.
- Telefon se s PC drží spojení zprávou `ping` každé 3 s; PC telefon odebere po 10 s ticha (zavřený prohlížeč nic nepošle).
- ID počítače se pamatuje v localStorage → QR kód zůstane stejný i po obnovení stránky.
- Nový telefon musí uživatel na PC „Povolit“; povolené telefony (trvalé `deviceId` telefonu) si PC pamatuje v localStorage. Fotky od nepovoleného telefonu PC zahodí.
- Fotky: kousky po 16 kB s řízením toku, PC po přijetí ověří skutečný typ (první bajty) a že jde obrázek otevřít, pak pošle `photo-ack`. Limit 30 MB. Velké fotky / HEIC telefon převede na JPEG (max 4096 px); malé JPG/PNG/WebP jdou beze změny (zachová EXIF).
- Terč: A4 na výšku, černý čtverec 180 mm = 8 polí po 22,5 mm (6×6 datových + černý okraj), levý horní roh 15 mm / 26 mm od rohu listu, rysky na středech stran. Číslo terče = ArUco ID (1–249, 0 nepoužíváme). Rozměry jsou v `src/lib/markers.ts` (`TARGET`) — rozpoznávání na nich závisí, neměnit bez důvodu.
- Rozpoznání: PC po přijetí fotky hledá terč ve Web Workeru (zmenšení na 2400 a pak 1200 px), výsledek (`analysis`) uloží k fotce a pošle telefonu zprávu `photo-quality`. Hodnocení: `ok` / `small` (strana < 120 px) / `skewed` (poměr protilehlých hran < 0,6) / `missing` / `error`. Při změně algoritmu zvyš `ANALYSIS_VERSION` → staré fotky se přepočítají.
- Měření: homografie z rohů největšího terče na fotce (fotka px → mm na rovině terče). Platí jen pro body ve stejné rovině jako terč. Kóty (`dims`) se ukládají k fotce v px fotky, mm se vždy dopočítají. Víc terčů na jedné fotce zatím nekombinujeme (neznáme jejich vzájemnou polohu).
- E2E testy si vyrábí syntetické fotky terče se skutečnou perspektivou (`makeTargetPhoto` v `e2e/helpers.ts`).
- Bez StrictMode (dvojí připojení by v dev obsadilo stejné PeerJS ID).
- Když se IP adresa PC ve Wi-Fi změní, uprav `VITE_LAN_URL` v `.env.local`.

## Rozhodnutí
- 2026-11-17: Statická PWA na GitHub Pages + WebRTC (PeerJS) pro přenos fotek. Důvod: GitHub Pages neumí server, WebRTC posílá fotky napřímo telefon → PC bez vlastního backendu.
- 2026-11-17: Terče ArUco + OpenCV.js. Důvod: spolehlivé rozpoznání v prohlížeči, známá velikost terče dává měřítko.
- 2026-11-17: Terče A4, každý s vlastním číslem (ArUco ID) už od první verze. Velké plochy (např. 10 × 8 m) = víc terčů A4 po 2–3 m, na každé fotce aspoň 2, fotky se překrývají; volitelně jedna vzdálenost změřená laserem pro upřesnění měřítka a kontrolu přesnosti. Ne jeden velký terč (přesnost klesá se vzdáleností, špatně se tiskne).
- 2026-11-17: První verze bez přihlášení (GitHub Pages nemá backend); přihlášení později přes platformu Nástroje elektrotechnika.

## Údržba tohoto souboru
- Aktualizuj po každé strukturální změně, novém pravidlu nebo rozhodnutí.
- Maximální stručnost, mazat zastaralé, bez duplicit.
