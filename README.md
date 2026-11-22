# holateher

**Hol a teher?** – where is the freight train? A live map of freight trains in Hungary.

- **Live map** (`index.html`): only trains with train type `T` (teher = freight) from the live
  data of [realtimenext.hu](https://realtimenext.hu). Known freight locos without a train are shown faint.
  Click a train to see the route it has travelled so far, coloured by speed, with stops.
- **History** (`history.html?loco=<EVN>&date=<YYYYMMDD>`): the whole day of one loco with a
  timeline slider, playback (1x–100x), list of the day's trains, day arrows (only days with data,
  also ← / →) and a date picker.
- **Loco table**: known freight locos with live status, filter, sorting and **export to Excel**.
- Buttons to open the current view in **Google Maps** or **OpenRailwayMap**.

Site: https://ompyl.github.io/holateher/ (once published)

## Maintaining the data

- **`data/loks.csv`** – known freight locos. Columns:
  `evn, beschreibung, loktyp, bildkategorie, letzter_gueterzug, letzte_strecke, zuletzt_gueterzug, notiz`
  (description, type, image category, last freight train, last route, last freight date, note).
  Can be edited directly on GitHub in the browser. Kind and country are derived from the number.
- **`data/bildkategorien.csv`** – own loco images: `kategorie,bild` (image = path in the repository,
  e.g. `img/vectron-blue.png`, or a full URL). Put the category into `bildkategorie` of a loco in
  `loks.csv` to show that image instead of the one from realtimenext.

## Running locally

Start a small web server in this folder and open `http://localhost:8765`:

```
python -m http.server 8765
```

(Opening `index.html` by double-click does not work, the browser would block loading the CSV files.)

## Files

| File | Purpose |
|---|---|
| `index.html`, `app.js` | live map, info panel, loco table |
| `history.html`, `history.js` | history page |
| `common.js` | shared code: helpers, speed colours, stops, map layers |
| `style.css` | styles of both pages |
| `data/` | loco list and own image categories |
| `PLAN.md` | plan and notes (German) |

Data: realtimenext.hu (public, undocumented API). Map: OpenFreeMap / © OpenStreetMap contributors.
