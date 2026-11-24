# holateher – Plan und Spezifikation

„Hol a teher?“ – wo ist der Güterzug? Live-Karte der Güterzüge in Ungarn (und wohin sie fahren),
Daten von realtimenext.hu. Reine statische Webseite auf GitHub Pages, keine eigene Server-Software.

- Online: https://ompyl.github.io/holateher/ · Repo: https://github.com/Ompyl/holateher (öffentlich, Branch `main`,
  Pages aus `main` / Root, Build ~1 min). GitHub-Account auf dem PC: `Ompyl` (gh CLI angemeldet).
- Herkunft: Userscript `..\HUMAP\realtimenext-worldmap.user.js`, API-Wissen in `..\HUMAP\NOTIZEN.md`.
- Stand dieser Datei: 22.11.2026 spätabends, nach dem Neubau im Branch `rewrite`.

---

## ▶ Stand: sauberer Neubau im Branch `rewrite` (22.11.2026 abends)

Die Seite wurde im Branch `rewrite` neu geschrieben (ES-Module, ein DOM für PC und Handy, Versionsnummern).
Backup davor: `holateher-backup-2026-11-22-2148-vor-neubau`. **Noch nicht gepusht und nicht in `main`** –
erst nach Emils OK. `main` enthält noch die alte Fassung (`app.js`, `timeline.js`, `common.js`).

Regeln für die Weiterarbeit:
- **Vor jedem Push `node tools/bump-version.mjs`** – setzt eine neue `?v=` an alle eigenen Dateien und Imports
  (auch in `index.html`). Nie Dateien mit unterschiedlicher Version mischen. `style.css` bekommt die Nummer über
  `index.html`. Beim lokalen Testen nach Änderungen ebenfalls bumpen (sonst cached der Browser alte Module).
- **MapLibre-Ausdrücke**: Zoom-`step`/`interpolate` immer ganz außen; nach `addLayer` die Konsole prüfen.
- Ein Modul pro Thema (siehe „Dateien“). Alle Anfragen an realtimenext nur über `js/api.js`.

Bewusste Abweichungen vom alten Stand:
- Handy-Menü = Kopfzeile (dasselbe Element, per CSS umgebaut) → nur ein Satz Schalter, kein Synchronisieren.
- Handy-Leiste: Zeitraum-Knöpfe in eigener Zeile über die volle Breite, darunter „speed … · Zug“ (passte nicht
  nebeneinander in 390 px). Loco-Tabelle am Handy: Aktions-Spalte klebt rechts, Rest seitlich scrollbar.
- Fit/Zoom misst die echten Rechtecke von Kopfzeile, Infofeld und Leiste (keine eigene Handy-Verzweigung).

## Arbeitsweise und Wünsche von Emil

- Emil schreibt Deutsch (locker, Tippfehler normal) → auf Deutsch antworten. **Die Webseite ist komplett Englisch.**
- **Nur pushen, wenn Emil es sagt.** Änderungen lokal lassen, Emil schaut lokal. Erinnern, wenn sich viel
  Ungepushtes ansammelt. Ablauf beim Push: committen (Co-Authored-By-Zeile) → `git push` → `gh run watch` →
  echte Seite prüfen.
- **Vor größeren Umbauten ein Backup** des Projektordners anlegen (Emil fragt danach).
- Pläne erst zeigen, wenn Emil „plan das mal durch, mach noch nix“ sagt; bei Designfragen gern Varianten als Skizze zeigen.
- Kleine Hobby-Seite: **realtimenext nicht mit Anfragen belasten**. Die Live-Liste ist ~0,9 MB und kommt
  **unkomprimiert, ohne ETag** (`Cache-Control: no-cache`) → ein offener Tab = ~330 MB/h. Darum:
  Live-Liste alle 10 s nur bei sichtbarem Tab **und Bedienung in den letzten 10 min** (sonst „paused (inactive)“,
  nächste Maus-/Touch-/Tasten-Aktion lädt sofort weiter); heutiger Tag der gewählten Lok alle 60 s (Emil: so lassen);
  vergangene Tage im Speicher auch über Lok-Wechsel hinweg (80 Tage, LRU); `history-days` und `vehicles/{evn}`
  einmal pro Sitzung; Icon-Liste 24 h in localStorage. Die automatische Datensammlung (GitHub Action) erst bauen, **wenn der
  Entwickler von realtimenext geantwortet hat**.
- Design dunkel lassen (siehe unten). Links zu fremden Seiten immer im neuen Tab (↗).
- Öffentliches Repo: keine privaten Daten (IPs, Pfade mit Geheimnissen) in Dateien schreiben, die gepusht werden.

---

## Funktionsumfang (Spezifikation)

### Kopfzeile (PC)
- Links Logo „holateher“ (Link auf `./`), daneben Zähler, z. B. „7 live freights · 19 idle · 273 passenger“
  (Teile nur, wenn der jeweilige Schalter an ist; „1 live freight“ im Singular).
- **Mitte: Live-Uhr mit Sekunden** (`HH:MM:SS`, springt auf die volle Sekunde, Gerätezeit). Unter 820 px ausgeblendet.
  **Easter Egg:** 7 Klicks auf die Uhr, jeweils < 1,5 s Abstand → `https://server.properties/` im neuen Tab.
  Kein Tooltip, normaler Cursor, Text nicht markierbar (nichts verrät es).
- Rechts: Schalter „idle freight locos“ (Standard an), „passenger trains“ (Standard aus), Knopf „Locos“ (Tabelle),
  Icon-Knöpfe Google Maps und OpenRailwayMap (aktuellen Ausschnitt im neuen Tab öffnen).
- Höhe 60 px, leicht durchscheinend; die Karte läuft darunter durch.

### Live-Karte
- Live-Liste alle 10 s, Pause wenn der Tab im Hintergrund ist oder 10 min niemand bedient (Status unten links
  „updated 19:02:17“ / „paused (tab in background)“ / „paused (inactive) …“; am Handy nur der Pause-Hinweis als Pille oben).
- **Güterzüge:** `trainType === 'T'`, Symbol = Bild von realtimenext, Zugnummer darunter.
- **Idle-Güterloks (blass, 45 %):** Loks ohne Zug, die in `data/loks.csv` stehen oder von diesem Browser in den
  letzten 48 h als Güterzug gesehen wurden (`localStorage holateher.seenFreight`).
- **Personenzüge (optional):** jeder andere nicht leere `trainType`; kleiner (0.12→0.24 statt 0.16→0.3), 80 % Deckkraft,
  Zugnummer erst ab Zoom 9, liegen hinter Güterzügen.
- Reihenfolge bei Überlappung und Klick: Güterzug > Personenzug > idle.
- **Tooltip am PC** (nur mit Maus, `matchMedia('(hover: hover) and (pointer: fine)')`): Titel („Train 44393“ /
  „Passenger train 9911“ / EVN bei idle), Strecke (bzw. letzter Güterzug), Zeile „Typ · Verspätung · moving/stopped“.
- Kartenausschnitt wird in `localStorage holateher.view` gemerkt. Start ohne gespeicherten Ausschnitt: Ungarn
  (`[19.3, 47.2]`, Zoom 6.6).
- Bilder: realtimenext-Icon über `category` (Icon-Liste `admin/icons/bkv`). Fehlt `category` oder ist sie `1`
  (= `null.webp`, graues ?), dann die häufigste Kategorie derselben Bauart in der Live-Liste, sonst eigenes Symbol.
  Eigene Bilder über `bildkategorie` in `loks.csv` + `data/bildkategorien.csv`. Bauart→Bild wird in
  `localStorage holateher.modelIcons` gemerkt (für Loks, die gerade nicht live sind).

### Auswahl eines Zuges: Infofeld + Zeitachse
- Klick auf ein Symbol: **Infofeld** (PC rechts oben, 330 px) und unten die **Zeitachse** (Leiste).
- Infofeld PC: Titel („Train 42408“ / „Passenger train …“ / „Loco without train“ / „Loco offline“), Strecke,
  Liste Loco (EVN formatiert), Type, Kind, Registered, Delay, Status, Note (aus `loks.csv`), Knöpfe
  „Vehicle info ↗“ (realtimenext) und „Photos ↗“ (bahnbilder.de), Tempo-Legende.
- Inhalt wird nur neu gebaut, wenn er sich ändert (sonst gehen Klicks während des 10-s-Updates verloren).
- Adresse: `?loco=<EVN>[&date=YYYYMMDD][&days=3|7|14]` per `replaceState` (teilbar). Ein solcher Link öffnet
  die Lok mit Zeitachse und zoomt auf die Strecke. Alte Links `history.html?…` leiten auf `./?…` weiter.
- **Zurück-Taste (Browser/Handy) schließt die Auswahl:** beim Auswählen ein Verlaufseintrag `{sel: true}`
  (nur einer, auch wenn man nacheinander mehrere Züge antippt); ×/Esc gehen per `history.back()` zurück,
  `popstate` schließt.

### Zeitachse (Leiste unten)
- Zeile 1: ▶/❚❚, Uhrzeit (mit Datum darüber, wenn das Fenster über mehrere Tage geht), **LIVE-Knopf**, Regler,
  Abspieltempo (logarithmisch 1x–100x, Doppelklick = 8x, gemerkt in `holateher.playSpeed`).
- Zeile 2: Tag ‹ [Kalender] ›, Zeitraum **This train · 24 h · 3 days · 7 days · 14 days**, Fit, Infozeile
  (Zug zum Regler-Zeitpunkt, Tempo, „24 h: 280 km, max 113 km/h, 17 stops, 1 trains (1 freight)“).
- Zeile 3: Zugliste als Chips (gleiche Zugnummer, Pausen bis 8 h überbrückt; Güterzug nach Nummernregel grün;
  Klick = Regler an den Anfang + Zoom auf diesen Zug). Zeile 4: Tastenhilfe.
- **Start: Regler ganz rechts = „jetzt“**, Zeitraum **24 h** (letzte 24 Stunden, der Vortag vorne abgeschnitten).
  Jede neu geöffnete Lok startet mit 24 h (Zeitraum wird nicht gespeichert), außer der Link sagt `&days=`.
- **LIVE:** Fenster endet „jetzt“ + Lok online + Regler am Ende + nicht abspielend. Dann sind alle Züge sichtbar,
  die Lok zeigt ihr Live-Symbol. Knopf rot „LIVE“ mit pulsierendem Punkt.
- **Regler zurück oder Abspielen:** andere Züge ausgeblendet (Filter auf der Live-Ebene, nicht abschalten → sofort
  wieder da), ein Marker zeigt die Lok zum Regler-Zeitpunkt (Live-Bild der Lok wiederverwenden). Knopf wird
  „Back to live“ (auch Taste L oder Regler ganz nach rechts).
- **▶ bei „jetzt“ startet am Anfang der Zeitachse.** Ende des Abspielens → wieder LIVE.
- **Früherer Tag** (‹ ›, A/D, Kalender, nur Tage mit Daten + heute): Fenster endet am Ende dieses Tages
  (3/7/14 Tage = dieser Tag und die davor). „This train“ dann ausgeblendet. Kalender öffnet nach oben,
  Tage mit Daten markiert, „now“-Knopf.
- **This train:** ab dem ersten Punkt mit der aktuellen Zugnummer (rückwärts von jetzt, gleiche Nummer, Lücken ohne
  Nummer und Pausen < 8 h überbrückt, Stopp bei anderer Nummer; Suche in den letzten 48 h). Der Rest von heute davor
  als dünne graue gestrichelte Linie. Ohne Zugnummer → 24 h.
- **Live mitwachsen:** bei jedem Live-Update (10 s) wird die Spur ohne neue Anfrage bis zur neuen Live-Position
  verlängert; einmal pro Minute werden die echten Positionen von heute neu geladen, vergangene Tage einmal pro Lok.
  Regler bleibt bei „jetzt“, wenn er dort war, sonst auf derselben Uhrzeit.
- **Tempo bei „jetzt“:** der letzte Punkt bekommt das Tempo des letzten Streckenstücks (sonst stand dort immer 0).
- Offline-Lok (z. B. aus der Tabelle) ohne Daten heute → ihr letzter Tag mit Daten, ohne LIVE.
- **Fit/Zoom auf die Strecke** hält Platz frei: PC rechts für das Infofeld + unten für die Leiste; Handy oben für das
  Infofeld + unten für die Leiste. Beim Tageswechsel bleibt die Karte stehen, beim Zeitraum-Wechsel wird gezoomt.
- Tasten: Space Play/Pause, `,` `.` eine Position, A/D Tag, Q/E Tempo, L live, Esc Kalender zu bzw. Auswahl schließen.
  Pfeiltasten bleiben der Karte (verschieben). Keine Tasten, solange die Loco-Tabelle offen ist.

### Spur und Halte
- Spur nach Tempo eingefärbt, stufenlos, Farben siehe Design. Leicht nach rechts versetzt (`line-offset` 2), damit Hin-
  und Rückweg nebeneinander liegen. Pfeile in Fahrtrichtung ab Zoom 8 (nur > 5 km/h). Lücken > 10 min ohne Daten
  gestrichelt grau. Teil nach dem Regler blass (0.3), davor voll.
- **Halte:** Lok ≥ 2 min innerhalb 60 m. Aufeinanderfolgende Halte < 400 m auseinander mit ≤ 20 min dazwischen
  werden **zu einem Halt verschmolzen** (eine Lok, die ein paar Meter rangiert, ist ein Halt).
- Bei 3/7/14 Tagen nur Halte ≥ 10 min.
- **Auf der Karte zusammengefasst** (GeoJSON-Cluster, Radius 26 px, bis Zoom 14): Dauer addiert, Größe nach Summe,
  Beschriftung „≈ 4 h · 3 stops“ (ab 60 min ganze Stunden) bzw. „45 min · 2 stops“.
- **Unter Zoom 8 keine Halte.** Beschriftung ab Zoom 10 („12 min“, „1 h 05“; ab Zoom 13 mit Uhrzeit
  „09:12–10:17 (1 h 05)“). Überlappen sich Beschriftungen, gewinnt der längere Halt.
- Aussehen: lila Scheibe (Größe nach Dauer, 6→20 px), **dunkle Mitte, die nach außen ins Lila verläuft**,
  **kein weißer Punkt, kein Außenrand**. Beschriftung hell mit dunklem Rand.

### Loco-Tabelle (Fenster „Known freight locos“)
- Fenster fast bildschirmbreit (`calc(100% - 48px)`), dahinter abgedunkelte Karte (Klick daneben schließt), Esc schließt.
- Quelle: `data/loks.csv` + in diesem Browser in 48 h gesehene Güterloks (Markierung „new“).
- Spalten Standard: Status, Number, Description, Type, Last freight train, Last seen, Aktionen.
  „All columns“ (gemerkt in `holateher.allCols`) zeigt zusätzlich Kind, Registered, Route.
- Kein seitliches Scrollen bei 1920 und 1024 px (mit „All columns“ bei 1024 px erlaubt). Description und Route
  nehmen den freien Platz und werden mit „…“ gekürzt (voller Text als `title`).
- Status-Sortierung: Freight > Passenger/Train > no train > offline. Sortieren per Klick auf den Spaltenkopf, Filterfeld.
- Aktionen als kleine Icons mit Tooltip: History (öffnet die Lok mit Zeitachse, Mittelklick = neuer Tab mit `?loco=`),
  Vehicle info ↗, Photos ↗, Show on map (nur wenn online; schaltet idle/passenger ein, falls nötig).
- **Export to Excel** (SheetJS erst beim ersten Klick laden): Number (EVN), Number formatted, Description, Type, Kind,
  Registered, Status now, Last freight train, Route, Last seen, In loks.csv, History (Link).

### Handy (bis 700 px)
- **Keine Kopfzeile.** Menüknopf ☰ oben links (42 px, durchscheinend). Menü: „holateher“ + Uhr, Zähler,
  Schalter Idle freight locos und Passenger trains (synchron mit dem PC-Schalter), Locos (table),
  Open in Google Maps ↗, Open in OpenRailwayMap ↗. Schließt bei Klick daneben, beim Verschieben der Karte,
  nach einer Aktion und mit Esc.
- Menüknopf ausgeblendet, solange die Loco-Tabelle offen ist.
- Keine Zoom-Knöpfe (Zwei-Finger-Zoom), kein Status „updated“.
- **Infofeld oben** neben dem Menüknopf, nur 2 Zeilen: Titel und „Strecke · Typ · Verspätung · Status“ (eine Zeile, „…“);
  Vehicle info und Photos als kleine Icons neben ×.
- **Leiste schlanker:** ohne Tempo-Regler, Tastenhilfe, Fit, km-Zusammenfassung und Zugliste. Zeile 2:
  [Tag ‹ › ………… Tempo-Knopf „8x“] dann [Zeitraum] [„speed 0 km/h · 42085 · freight“].
  Tempo-Knopf schaltet bei jedem Tippen weiter: 1 → 2 → 4 → 8 → 16 → 32 → 64 → 100 → 1.
- Loco-Tabelle fast bildschirmfüllend, Filterfeld in eigener Zeile.

---

## Design

- Dunkle Oberfläche: Hintergrund `#1b262b`, Flächen `#24323a`, Linien `#34464f`, Text `#e6eef0`, gedämpft `#9fb2b8`,
  Akzent `#1f8a8a`. Schrift Roboto / Segoe UI.
- **UI-Flächen leicht durchscheinend:** `rgba(27, 38, 43, .78)` + `backdrop-filter: blur(8px) saturate(1.2)`
  (Kopfzeile, Leiste, Infofeld, Handy-Menü).
- **Hintergrundkarte:** OSM-Rasterkacheln `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, normale Farben,
  **abgedunkelt wie OpenRailwayMap im Dark-Theme**: `raster-saturation -0.5`, `raster-opacity 0.5` über dem
  Hintergrund `#1b262b` (ORM macht das per CSS `saturate(.5) opacity(.5)`). Schriften (Glyphs) für eigene
  Beschriftungen von `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf` (Font „Noto Sans Regular“).
  Quellenangabe im Footer: „Data: realtimenext.hu · Map: © OpenStreetMap contributors“.
- **Tempo-Farben (Neon), stufenlos:** 0 `#c04bff` · 15 `#ff2e63` · 40 `#ff8c1a` · 70 `#ffe81a` · 100 `#7cff4f` ·
  120+ `#00f5a0`. Linie 3.5→7 px (Zoom 6→14), darunter ein dünner dunkler Rand `#0d1418` (5.5→9.5 px, 0.55),
  flach, **kein Glow**.
- Halte: Lila `#b23cff` (0.6), dunkle Mitte `#2e0a4d` mit `circle-blur 1` (0.9), Beschriftung `#f6ecff` mit Rand.
- LIVE-Knopf: weißer fetter Text, roter Rand/Hintergrund `#ff2d55`, pulsierender roter Punkt (aus bei
  `prefers-reduced-motion`). „Back to live“: Akzentfarbe.
- Scrollbalken überall dünn und dunkelgrau (`#4a5c64`), `color-scheme: dark`.
- Tooltip: dunkles Kästchen mit Rand, 13 px.
- Ausgewählte Lok: türkiser Halo-Kreis.

---

## Daten und Regeln

### realtimenext-API (ohne Anmeldung, CORS `*`)

| Was | Adresse |
|---|---|
| Live-Fahrzeuge (wie map.realtimenext.hu, alle 10 s) | `GET https://api.realtimenext.hu/api/bkv/vehicles/online/map` (~1,5 MB) |
| Icon-Liste (Kategorie → Bild) | `GET …/api/admin/icons/bkv` |
| Ein Fahrzeug (Typ, eigenes Icon) | `GET …/api/bkv/vehicles/{evn}` (`type.name`, `icon.url`; „Ismeretlen“ = unbekannt) |
| Tage mit Daten einer Lok | `GET …/api/bkv/vehicles/{evn}/history-days` |
| Positionen eines Tages | `GET …/api/bkv/vehicles/{evn}/{yyyymmdd}` (~250 kB; `location_lat/lon`, `time`, `route_id`, `headsign`) |
| Fahrzeugseite (Link „Vehicle info“) | `https://realtimenext.hu/vehicles/{evn}` |

Live-Felder: `rail_uic` (EVN), `is_rail_uic`, `trainNumber`, `trainType` (`T` = teher/Güterzug, `S` = személy,
`""` = ohne Zug), `relation`, `delayMin`, `heading`, `moving`, `vehicleModel`, `category`, `location_lat/lon`.
Positionen gehen auch im Ausland weiter (z. B. Vectron bis Frankfurt/Ruhrgebiet/München).

Betreiber: Discord-Link auf map.realtimenext.hu. Emil hat angefragt; Datensammlung erst nach Antwort.

### Regeln
- **EVN** = 12 Ziffern. Format `91 80 6193 236-7`. Art aus Stelle 1–2 (90 Other, 91 Electric loco, 92 Diesel loco,
  93/94 EMU, 95 DMU, 97 Diesel shunter, 98 Shunter), Zulassungsland aus Stelle 3–4 (UIC-Ländercodes, englisch).
- **Kurznummer** wie an der Lok: `evn[5:8] + ' ' + evn[8:11]` (z. B. „193 837“) → Fotos:
  `https://www.bahnbilder.de/name/galerie/kategorie/suchen/suchbegriff/193+837.html` (kann auch andere Fahrzeuge
  finden; railgallery.ru, trainsdepot.org, trainspo.com geprüft und verworfen).
- **Güterzug nach Nummer** (für Zugliste/History): 5-stellig, ≥ 30000, Zielangabe ohne
  intercity|személy|railjet|eurocity|euronight|gyors|sebes|expressz|nightjet|regional.
- Google Maps: `https://www.google.com/maps/@lat,lng,{zoom+1}z`. OpenRailwayMap:
  `https://openrailwaymap.app/#view={zoom}/{lat}/{lng}`.

### Berechnung
- **Tempo:** Punkte < 20 m Abstand zum vorigen behaltenen Punkt verwerfen (GPS-Zittern). Pro Stück zählt nur der
  letzte Zeitschritt (davor stand die Lok). Geglättet über ±2 Nachbarstücke, Lücken (> 600 s) ausgenommen.
  Ab 120 km/h gleiche Farbe (meist GPS-Sprung). Max-Wert in den Kennzahlen ohne die 120er.
- **Halte:** siehe oben (60 m, 2 min, verschmelzen 400 m / 20 min).
- **Zugliste:** aufeinanderfolgende Punkte mit gleicher `route_id`, Pausen < 8 h überbrückt.
- **Fenster:** endet jetzt (heute) bzw. am Ende des gewählten Tages; Start = Ende − n × 24 h.

### data/loks.csv
`evn, beschreibung, loktyp, bildkategorie, letzter_gueterzug, letzte_strecke, zuletzt_gueterzug, notiz` (Quelle der
Wahrheit statt der alten Ungarn.xlsx). Beschreibungen bleiben wie sie sind (teils Deutsch/Ungarisch).
`data/bildkategorien.csv`: `kategorie,bild` (noch leer).

### localStorage-Schlüssel
`holateher.view`, `.showIdle`, `.showPassenger`, `.seenFreight`, `.modelIcons`, `.allCols`, `.playSpeed`, `.icons` (Icon-Liste + Zeit), `.railMode` (Schienen-Ebene: off / usage / voltage_frequency / train_protection).

---

## Stolpersteine (Lessons learned)

- **MapLibre (5.24.1, cdnjs):** Ein Zoom-`step`/`interpolate` darf nur ganz außen im Ausdruck stehen (auch nicht in einem
  `case`), sonst wird die ganze Ebene stumm abgelehnt (`addLayer` wirft, Ebene fehlt). Lösung: `case` in die
  Stufen des `step` legen. Zoom in Filtern vermeiden, lieber `minzoom`.
- **Browser-Cache:** GitHub Pages lässt Dateien 10 min cachen. Neue `app.js` + alte `common.js` → Funktion fehlt →
  Karte ohne Loks. Im Neubau Versionsnummern an die Dateien hängen. Beim lokalen Testen `fetch(f, {cache:'reload'})`.
- **Eingebauter Browser in der App:** Ist der Browser-Bereich ausgeblendet, zeichnet die Karte nicht (keine
  Screenshots, `queryRenderedFeatures` leer). Dann nur Logik per JS prüfen oder Emil bitten, ihn einzublenden.
  `preview_start` mit `url` benutzen (mit Namen sucht es `.claude/launch.json` im falschen Ordner).
- **OpenRailwayMap als Ebene:** `style.json` von openrailwaymap.app hat kein CORS und braucht MapLibre ≥ 5.
  Die Vektor-Kacheln (`/standard_railway_line_low` bis z7, `/railway_line_high,railway_text_km` ab z7, normales MVT)
  gehen mit echtem Referer. Nutzungsregeln: https://github.com/hiddewie/OpenRailwayMap-vector/blob/master/USAGE.md.
  **Umsetzung:** `node tools/fetch-orm-style.mjs` lädt den Stil (ehrlicher User-Agent), räumt ihn auf (Hillshade,
  ORM-Grundkarte, Routing, Suche raus; absolute URLs; ohne `encoding: "mlt"`; Schriften → protomaps-Glyphen;
  dunkles Theme) und schreibt `data/ormstyle.json` (~1,1 MB, gzip ~50 kB, wird committet; ab und zu neu holen).
  `js/rails.js` baut daraus zusammen mit der OSM-Grundkarte **einen** Stil; die eigenen Ebenen kommen darüber.
  Umschalter Off / Tracks / Electrification / Train protection = globaler Zustand `tracks`
  (`map.setGlobalStateProperty`); Off = alle ORM-Ebenen `visibility: none` (lädt dann keine Kacheln), beim
  Einschalten die ursprünglichen Sichtbarkeits-Ausdrücke zurück. Fehlt der Stil: ORM-Raster-Kacheln (nur Off/Tracks).
  Eigene Ebenen in `style.load` anlegen, nicht in `load`: `load` wartet auf alle Schienen-Kacheln (Loks kämen
  sonst erst nach Sekunden).
- **Tile-Nutzung OSM:** Quellenangabe Pflicht, keine Massen-Downloads.
- **Tooltip** nur mit echter Maus (Handys haben kein Hover).
- **Lokaler Server fürs Handy** nur im Projektordner starten (sonst ist der ganze HOP-Ordner im WLAN lesbar):
  `python -m http.server 8766 --bind 0.0.0.0 --directory "C:\Users\Emil\Documents\HOP\holateher"`.
- Öffentliches Repo: frühere Commits enthalten Emils LAN-/Tailscale-IP in PLAN.md (harmlos, nur zur Info).

---

## Verworfen / ausprobiert

- **OpenRailwayMap-Gleise als Ebene** über der Karte: Emil wollte es zurück (Cache-Problem); Werte oben.
- **Eigene History-Seite**, dann **History-Modus mit umgebauter Kopfzeile**: ersetzt durch die Zeitachse in der Leiste.
- **Invertierte dunkle OSM-Karte:** zu viel, Emil wollte die normale Karte nur abgedunkelt.
- **OpenFreeMap Positron** als Hintergrund: zu hell/weißlich.
- Halte als heller Ring mit weißem Kern, mit Außenrand: gefiel nicht. Andere Vorschläge (Dauer-Pille, Bahnhofsring,
  Uhr-Symbol, Raute, Halte-Balken, Farbe nach Dauer) gezeigt; Emil blieb bei lila Kreisen mit dunkler Mitte.
- Gespeicherter Zeitraum für die Zeitachse: abgeschafft (jede Lok startet mit 24 h).
- Kopfzeilen-Untertitel „Freight trains in Hungary, live“: entfernt.

---

## Offene Ideen (nach dem Neubau)

- Erst nach Antwort des realtimenext-Entwicklers: **GitHub Action alle 15 min** sammelt die Live-Liste, trägt neue
  Güterloks in `loks.csv` ein, aktualisiert letzter Zug / zuletzt gesehen. Darauf aufbauend: Statistik pro Lok
  (km, Einsatztage, Grenzübertritte), „Grenzübertritte heute“, Beobachtungsliste mit Browser-Meldung.
- **Suche** (Lok- oder Zugnummer → Karte springt hin).
- **Zug verfolgen** (Karte fährt bei LIVE mit dem ausgewählten Zug mit).
- **Filter** (Bauart, Land, nur Grenzzüge).
- Ankunftsschätzung (aufwendig, ungenau).
- Repo privat und nur die Seite öffentlich: geht mit GitHub Pro, oder kostenlos per Action in ein zweites öffentliches
  Repo bzw. über Cloudflare Pages/Netlify. Code der Seite bleibt trotzdem im Browser lesbar.

---

## Lokal testen

- Server: `python -m http.server 8765 --bind 127.0.0.1` im Projektordner (im Hintergrund), dann `http://localhost:8765/`.
- Testlinks: `?loco=918061932367&days=7` (Vectron 42408, fuhr bis Frankfurt/Ruhr/München),
  `?loco=918112932044` (Vectron 42082 Hodoš → Soroksári út), `?loco=915506300150&days=3` (Halte bei Szolnok,
  31 + 41 min werden zu 1 h 13 verschmolzen).
- Offene Objekte zum Testen: `window.holateher` (`state`, `map`, `refresh`, `select(evn, {day, range, fit})`,
  `unselect`, `api.stats` = Anzahl/Bytes der Anfragen, `tl` mit `state`, `load`, `setCursor`, `backToLive`, `fit`).
- Nach Code-Änderungen `node tools/bump-version.mjs`, sonst lädt der Browser alte Module aus dem Cache.
- Handygröße im eingebauten Browser: `resize_window` 390 × 760 (812 px hoch passt oft nicht ins Fenster).
- Nach dem Testen Viewport zurück auf `desktop`; Test-Schalter (z. B. passenger) wieder auf Standard.

---

## Dateien (Neubau)

| Datei | Inhalt |
|---|---|
| `index.html` | ein DOM für PC und Handy: Menüknopf, Kopfzeile (= Handy-Menü), Karte, Infofeld, Leiste, Tabelle, Footer |
| `style.css` | alles Aussehen, nach Bausteinen; Handy-Regeln (`max-width: 700px`) direkt beim Baustein; `.desk-only` / `.phone-only` |
| `js/main.js` | Start: statische Daten, Karte, Module verbinden, Esc, `--dock-h` per ResizeObserver, `?loco=`-Link |
| `js/config.js` | Konstanten: API-Adressen, Zeiten, Farben, localStorage-Schlüssel, Kartenstil, Rechen-Grenzwerte |
| `js/util.js` | Helfer (DOM, Datum, localStorage, CSV, Distanz) und kleiner Event-Hub `on`/`emit` |
| `js/evn.js` | EVN-Format/Art/Land, Kurznummer, Links, Güterzug-Regel, Streckentext |
| `js/api.js` | alle realtimenext-Anfragen + Caches |
| `js/state.js` | gemeinsamer Zustand (Live-Liste, loks.csv, gesehene Güterloks, Schalter, Auswahl) |
| `js/live.js` | Polling 10 s, Pause bei Hintergrund/Inaktivität, gesehene Güterloks merken |
| `js/map.js` | Karte, gemerkter Ausschnitt, Fahrzeug-Ebene + Bilder, Tooltip, Klick, `fitCoords` |
| `js/trail.js` | Spur-/Halte-/Marker-Ebenen, Regler-Deckkraft, Marker-Bild |
| `js/track.js` | reine Rechnung: Tempo-Stücke, Halte (+ Verschmelzen), Zugliste, „This train“, Kennzahlen |
| `js/timeline.js` | Zeitachse: Fenster laden, Live-Mitwachsen, Regler, Abspielen, LIVE, Tage, Tasten |
| `js/calendar.js` | Kalender-Popover |
| `js/selection.js` | Auswahl, Infofeld, Adresse `?loco=`, Zurück-Taste |
| `js/table.js` | Loco-Tabelle + Excel-Export |
| `js/menu.js` | Kopfzeile/Menü, Schalter, Zähler, Uhr + Easter Egg |
| `js/rails.js` | Schienen-Ebene von OpenRailwayMap (Vektor, Original-Stil dunkel) + Umschalter |
| `tools/fetch-orm-style.mjs` | holt und bereinigt den ORM-Stil → `data/ormstyle.json` |
| `js/debug.js` | Debug-Ansicht (F3 oder `?debug`): Zoom, Mitte, Live-Status, Anfragen/Traffic, Caches, Zeitachse, Rohdaten der gewählten Lok / der Lok unter der Maus |
| `tools/bump-version.mjs` | neue `?v=` an alle eigenen Dateien |
| `history.html` | Weiterleitung alter Links |
| `data/loks.csv`, `data/bildkategorien.csv`, `favicon.svg`, `README.md` (Englisch) | |

## Backups (im Ordner `C:\Users\Emil\Documents\HOP\`)

- `holateher-backup-2026-11-22-1830` – vor dem History-Modus
- `holateher-backup-2026-11-22-1900` – mit History-Modus, vor der Zeitachse
- `holateher-backup-2026-11-22-1930` – vor der Handy-Ansicht
- `holateher-backup-2026-11-22-2148-vor-neubau` – alte Fassung vor dem Neubau (Branch `rewrite`)
