# holateher – Plan

„Hol a teher?“ – wo ist der Güterzug? Live-Karte nur mit Güterzügen in Ungarn,
basierend auf den Daten von realtimenext.hu. Ziel: erreichbar unter
`https://ompyl.github.io/holateher/` (GitHub Pages, keine eigene Server-Software).

Stand: 22.11.2026. Herkunft: das Userscript in `..\HUMAP\realtimenext-worldmap.user.js`
(Tempo-Farben, Halte, Güterzug-Filter), Wissen in `..\HUMAP\NOTIZEN.md`.

## ▶ Übergabe für den nächsten Chat (zuerst lesen)

**Status:** Online unter https://ompyl.github.io/holateher/ · Repo https://github.com/Ompyl/holateher
(öffentlich, Branch `main`, GitHub Pages aus `main` / Root, Build dauert ~1 min).
Letzter Commit beim Wechsel: siehe `git log`. GitHub-Account auf dem PC: `Ompyl` (gh CLI angemeldet).

### Offene Aufgaben (als Nächstes)

- Keine. Zuletzt erledigt (22.11. ~17:45): Untertitel weg, Zähler „4 live freights · 17 idle“;
  Loco-Fenster `calc(100% - 48px)` breit, Standardspalten ohne Kind/Registered/Route
  (Schalter „All columns“, `localStorage holateher.allCols`), Knöpfe als Icons mit Tooltip,
  Description/Route nehmen den freien Platz und werden mit „…“ gekürzt (voller Text als `title`).
  Geprüft: kein horizontaler Scrollbalken bei 1920 px (auch mit allen Spalten) und 1024 px
  (Standardspalten; mit „All columns“ scrollt es bei 1024 px seitlich – bewusst so gelassen).
- **OpenRailwayMap als Hintergrund: ausprobiert und auf Emils Wunsch wieder entfernt (22.11.)** – danach sah er keine Loks mehr
  (vermutlich Browser-Cache: neue app.js mit alter common.js → `addRailwayLayers is not a function`). Wissen für einen neuen Versuch:
  Vektor-Kacheln `https://openrailwaymap.app/standard_railway_line_low` (bis z7) und `/railway_line_high,railway_text_km` (ab z7),
  normales MVT, CORS ok mit echtem Referer; ORMs `style.json` geht nicht (kein CORS, braucht MapLibre ≥ 5).
  Nutzungsregeln: https://github.com/hiddewie/OpenRailwayMap-vector/blob/master/USAGE.md (öffentliche Seite + Quellenangabe).
  Beim nächsten Mal Cache-Busting (`common.js?v=…`) mitmachen.

### Arbeitsweise / Wünsche von Emil

- Emil schreibt Deutsch (locker, Tippfehler normal) → auf Deutsch antworten. **Die Webseite selbst ist komplett Englisch.**
- **Änderungen lokal lassen, nicht nach jeder Aufgabe committen/pushen.** Emil schaut lokal (http://localhost:8765/) und sagt selbst, wann gepusht wird; nur erinnern, wenn sich länger viel Ungepushtes ansammelt. Ablauf beim Push: committen (mit Co-Authored-By-Zeile) → `git push` → Pages-Build abwarten (`gh run watch`) → echte Seite prüfen.
- Design: modern, dunkle Oberfläche (#1b262b), Strecken flach + halbtransparent (kein Glow), Halte ohne Kontur. Links zu fremden Seiten immer im neuen Tab (↗).
- Nicht unnötig viele Anfragen an realtimenext (kleine Hobby-Seite): Live-Liste nur alle 10 s und nur bei sichtbarem Tab.

### Lokal testen

- Server: im Ordner `python -m http.server 8765 --bind 127.0.0.1` (im Hintergrund), dann im eingebauten Browser `http://localhost:8765/`.
  `preview_start` mit Namen klappte nicht (sucht `.claude/launch.json` im falschen Ordner) → `preview_start` mit `url` benutzen.
- Testseiten: Live `index.html`; History z. B. `history.html?loco=918061932367&days=7` (Vectron, fuhr 15.–21.11. bis Frankfurt/Ruhr/München)
  oder `history.html?loco=918112932044` (Vectron 42082 Hodoš → Soroksári út).
- Zum Testen sind Objekte offen: `window.holateher` (Live: `state`, `map`, `select(evn)`, `refreshLive`) und `window.holateherHistory` (`state`, `map`, `setCursor(i)`, `load(day)`).
- Ist der Browser-Bereich in der App ausgeblendet, zeichnet die Karte nicht (requestAnimationFrame pausiert) → Emil bitten, ihn einzublenden (Strg+Umschalt+B), oder nur Logik per JS prüfen.
- Alte Fehlermeldungen „An image named "arrow" already exists“ in der Konsole stammen aus einer früheren app.js-Fassung (verweisen auf Zeile ~610), nicht aus dem aktuellen Code.

### Dateien kurz

| Datei | Inhalt |
|---|---|
| `index.html` + `app.js` | Live-Karte: Filter `trainType === 'T'`, blasse stehende Güterloks (in `loks.csv` oder vom Browser in 48 h als Güterzug gesehen), Infofeld mit gefahrenem Weg, Loco-Tabelle mit Excel-Export (SheetJS lazy), Knöpfe History / Datasheet ↗ / Photos ↗ |
| `history.html` + `history.js` | History: Kalender, 1/3/7 Tage, Regler, Abspielen, Tasten (Space, `,` `.`, A/D, Q/E), Zug-Liste, Kennzahlen |
| `common.js` (`window.HT`) | Helfer, Länder/Lokart aus EVN, `buildSpeedGeo` (stufenlose Farbe, ±2 geglättet, `age`, `pi`/`pj`), `buildStopGeo`, `addTrailLayers`, `setTrailCursor`, Legende, Google/ORM, `historyUrl`, `datasheetUrl` (realtimenext), `photosUrl` (bahnbilder.de, Kurznummer) |
| `style.css` | Styles beider Seiten |
| `data/loks.csv` | bekannte Güterloks (statt Ungarn.xlsx): `evn, beschreibung, loktyp, bildkategorie, letzter_gueterzug, letzte_strecke, zuletzt_gueterzug, notiz` |
| `data/bildkategorien.csv` | eigene Bilder: `kategorie,bild` (noch leer) |
| `favicon.svg` | Favicon (Güterlok) |

## Datenquellen (alle ohne Anmeldung, CORS `*`, getestet mit Origin github.io)

| Was | Adresse |
|---|---|
| Live-Fahrzeuge (wie map.realtimenext.hu, alle 10 s) | `GET https://api.realtimenext.hu/api/bkv/vehicles/online/map` (~1,5 MB) |
| Tage mit Daten einer Lok | `GET …/api/bkv/vehicles/{evn}/history-days` |
| Positionen eines Tages | `GET …/api/bkv/vehicles/{evn}/{yyyymmdd}` (~250 kB) |
| Verlauf in der UI | `https://realtimenext.hu/vehicle/{evn}/history?date={yyyymmdd}` |

Live-Felder: `rail_uic`, `is_rail_uic`, `trainNumber`, `trainType` (`T` = teher/Güterzug,
`S` = személy, `""` = ohne Zug), `relation`, `delayMin`, `heading`, `moving`,
`vehicleModel`, `category` (= Icon-ID von realtimenext, manchmal `null` → graues ?).

Last: map.realtimenext.hu selbst lädt die Liste alle 10 s pro offenem Tab. holateher
macht pro Besucher dasselbe, pausiert aber, wenn der Tab im Hintergrund ist.
Betreiber erst fragen/zeigen, wenn die Seite fertig ist (Discord-Link auf map.realtimenext.hu).

## Stufe 1 (jetzt)

1. **Live-Karte nur Güterzüge** (`trainType === 'T'`), Symbol = Bild von realtimenext,
   Zugnummer daneben. Hintergrund: OpenFreeMap (später OpenRailwayMap).
2. **Blasse Loks**: bekannte Güterloks (in `data/loks.csv` oder in diesem Browser in den
   letzten 48 h als Güterzug gesehen), die gerade keinen Zug haben. Schalter zum Ausblenden.
3. **Klick auf Zug**: Infofeld (Lok, Typ, Land, Zug, Strecke, Verspätung) + bisher gefahrener
   Weg des aktuellen Zuges, nach Tempo eingefärbt, Halte ≥ 2 min als Kreise (Logik aus dem
   Userscript), restlicher Tag dünn grau. Knopf „Verlauf“ → realtimenext.
4. **Tabelle bekannter Güterloks** aus `data/loks.csv`, mit Live-Status, sortier-/filterbar,
   Verlauf-Link, „auf Karte zeigen“, **Export als Excel (.xlsx)**.
5. **Knöpfe „Google Maps“ und „OpenRailwayMap“**: aktuellen Ausschnitt dort öffnen.
6. **Bilder**: fehlt `category`, Bild eines anderen Fahrzeugs gleichen Typs nehmen, sonst
   eigenes Lok-Symbol. Eigene Bilder über Spalte `bildkategorie` in `loks.csv` +
   `data/bildkategorien.csv` (kategorie → Bilddatei/URL).

**Stand 22.11. 13:40:** Stufe 1 lokal fertig und im Browser getestet (7 Güterzüge, 17 stehend,
Klick zeigt Weg von 42082 seit 00:14 mit Tempo-Farben und Halten, Tabelle mit Live-Status,
Excel-Export im Speicher geprüft, Google/ORM-Links korrekt, keine Konsolenfehler).
Noch nicht auf GitHub. Bilder: Icon-ID `1` = `null.webp` (graues ?) wird wie „keine Kategorie“
behandelt; Ersatz = häufigste Kategorie derselben Bauart in der Live-Liste, sonst eigenes Symbol.
Überlappende Symbole: Güterzug liegt oben und gewinnt beim Klick.

**Stand 22.11. ~14:30:**
- Oberfläche komplett **englisch** (Texte, Tabelle, Excel-Spalten, Länder, Lokarten). Beschreibungen aus der CSV bleiben, wie sie sind.
- **Eigene History-Seite** `history.html?loco=&date=` (statt Link zu realtimenext): ganzer Tag mit Tempo-Farben und Halten, Regler mit Uhrzeit, Abspielen 1x–100x (logarithmisch, Doppelklick = 8x, gespeichert), Tag-Pfeile nur auf Tage mit Daten (`history-days`), Pfeiltasten ←/→, Leertaste = Play/Pause, Datumswähler, Zug-Liste des Tages (gleiche Nummer bis 8 h Pause zusammengefasst, Güterzug nach Nummernregel grün markiert, Klick = Regler + Zoom auf den Zug), Tageskennzahlen (km, max. km/h, Halte, Züge). Teil nach der Reglerposition blass. Beim Tageswechsel bleibt die Karte stehen, nur beim ersten Laden passt sie sich an den Tag an („Fit day“-Knopf). Lok-Bild: eigenes von realtimenext (`bkv/vehicles/{evn}` → `icon.url`), sonst Bild derselben Bauart (merkt sich die Live-Seite in `localStorage holateher.modelIcons`), sonst eigenes Symbol.
- Gemeinsamer Code in `common.js` (`window.HT`): Helfer, `buildSpeedGeo` (stufenlose Farbe, geglättet über ±2 Stücke, Kometenschweif über `age`, `pi`/`pj` = Punktindex), `buildStopGeo`, `addTrailLayers`, `setTrailCursor`, Legende, Google/ORM.
- Live-Seite: Infofeld wird nur neu gebaut, wenn sich der Inhalt ändert (vorher alle 10 s → Klick auf „History“ konnte verloren gehen).
- Getestet lokal: Live → Klick auf 42082 → „History“ → History-Seite (835 Punkte, 353 km, max 101 km/h), ← auf 21.11. (4 Güterzüge), Karte bleibt stehen, Abspielen läuft, keine Konsolenfehler.

**Stand 22.11. ~15:00:** Strecken flach + durchscheinend (kein Schein), History gleich kräftig wie live (gefahren 0.75, Rest 0.35). History: `,` / `.` = eine Position zurück/vor (pausiert). Knöpfe „Datasheet ↗“ (realtimenext, neuer Tab) und **„Photos ↗“ = bahnbilder.de** (Suche nach der Kurznummer wie an der Lok, `evn[5:8] evn[8:11]`, z.B. „193 837“; volle EVN steht selten in Bildunterschriften; kann auch andere Fahrzeuge mit gleicher Kurznummer finden). Geprüfte Alternativen: railgallery.ru (502 Fehler), trainsdepot.org (nur Baureihen), trainspo.com (Suche über Adresse findet die Nummer nicht). Icons für Google/ORM, `favicon.svg`, Loco-Tabelle als Fenster mit Hintergrund (Klick daneben schließt).

**Stand 22.11. ~15:20 (veröffentlicht auf ompyl.github.io/holateher, Repo Ompyl/holateher):** History: eigener Kalender (Monatsraster, Tage mit Daten markiert, andere gesperrt, „latest day“), Tage mit **A / D** (Pfeiltasten verschieben die Karte), Tempo mit **Q / E**, Zeitraum **1 / 3 / 7 Tage** (gewählter Tag + Tage davor als eine Zeitleiste, URL `&days=`, bei mehreren Tagen nur Halte ≥ 10 min), Datum über der Uhrzeit und in der Zug-Liste. Logo größer, Lok-Titel zweizeilig, Nummer wird nie abgeschnitten (schmale Fenster: „1d/3d/7d“). Beispiel: 918061932367 fuhr 15.–21.11. bis Frankfurt/Ruhrgebiet/München – die Positionen gehen also auch im Ausland weiter.

## Stufe 2 (später)

- GitHub Action alle 15 min: Live-Liste abfragen, neue Güterloks in `loks.csv` eintragen,
  `zuletzt_gueterzug` / `letzter_gueterzug` aktualisieren (Grundlage für Statistik).
- Statistik pro Lok (km, Grenzübertritte, Einsatztage).
- Personenzüge optional einblendbar.
- OpenRailwayMap als Hintergrund (erster Versuch zurückgenommen, siehe oben).
- Dunkler Modus, Handy-Ansicht.
- Beobachtungsliste mit Browser-Meldung, Filter (Typ/Land/Grenze), Grenzübertritte heute,
  Links zum Teilen (`?lok=…`), Suche.

## Dateien

```
index.html, app.js    Live-Karte, Infofeld, Tabelle
history.html, history.js  History-Seite
common.js             gemeinsamer Code
style.css             Aussehen
data/loks.csv         bekannte Güterloks (Quelle der Wahrheit, statt Ungarn.xlsx)
data/bildkategorien.csv  eigene Bilder je Kategorie
PLAN.md, README.md
```

`loks.csv`-Spalten: `evn, beschreibung, loktyp, bildkategorie, letzter_gueterzug,
letzte_strecke, zuletzt_gueterzug, notiz`. Art und Zulassungsland werden aus der EVN
berechnet (stehen im Excel-Export mit drin).
