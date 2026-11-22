# holateher

**Hol a teher?** – where is the freight train? A live map of freight trains in Hungary.

- **Live map** (`index.html`): only trains with train type `T` (teher = freight) from the live
  data of [realtimenext.hu](https://realtimenext.hu). Known freight locos without a train are shown faint.
- **Timeline**: click a train → info panel plus a timeline at the bottom, starting at "now" (last 24 h,
  or this train / 3 / 7 / 14 days). Move the slider back or press play to see where the loco was (the other
  trains are hidden meanwhile); "Back to live" returns. Route coloured by speed, stops, list of trains,
  day arrows (A / D) and a calendar for earlier days. Link: `?loco=<EVN>[&date=<YYYYMMDD>][&days=3|7|14]`
  (old `history.html?…` links are forwarded).
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
| `timeline.js` | timeline of the selected loco |
| `history.html` | forwards old links to `./?loco=…` |
| `common.js` | shared code: helpers, speed colours, stops, map layers |
| `style.css` | styles of both pages |
| `data/` | loco list and own image categories |
| `PLAN.md` | plan and notes (German) |

Data: realtimenext.hu (public, undocumented API). Map: OpenFreeMap / © OpenStreetMap contributors.
