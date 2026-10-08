# Antom

Wochenplan fürs Essen, nach dem Vorbild der Magnettafel am Kühlschrank: Frühstück und
Hauptessen für jeden Tag planen, Gerichte umsortieren und zu jedem Gericht die Zutaten, die
Einkaufsliste und die Zubereitung mit Cosori-Airfryer und Thermomix sehen.

Antom gibt es in drei Formen, alle aus denselben Quellen in `src/`:

- **Eigene Web-App** (`server/`) – für die Familie gedacht: ein privater Einladungslink, auf dem iPhone
  über „Zum Home-Bildschirm“ wie eine App, ohne Anmeldung, gemeinsamer Plan für alle, offline nutzbar,
  Claude über den eigenen API-Schlüssel. Läuft kostenlos bei Cloudflare und wird bei jeder Änderung
  über GitHub Actions neu veröffentlicht. Einrichtung Schritt für Schritt:
  [`server/EINRICHTUNG.md`](server/EINRICHTUNG.md).
- **Claude-Artifact** (Öffnen über Claude, gemeinsamer Plan für alle mit Bearbeitungsrecht):
  https://claude.ai/artifact/JW7gSbmGHVaQ9XFbXKtoDn
- **`Antom.html`**: dieselbe App als eine einzige Datei für jeden Browser, ohne Claude und ohne
  Internet (Schrift, SortableJS und Fotos stecken in der Datei). Sie speichert den Plan im Browser
  des jeweiligen Geräts; Claude-Funktionen (Scan, Import, Vorschläge, Rezepte schreiben) gibt es dort
  nicht. Am Computer per Doppelklick öffnen.

## Funktionen

- **Woche**: kobaltblauer Kopf mit Begrüßung und Datum, echte Kalenderwochen mit Pfeilen und
  „Heute“, Wochenleiste mit einem runden Foto pro Tag, große Karte für das heutige Essen (dazu
  Frühstück und „Morgen“), Frühstück und Hauptessen pro Tag. Gerichte ziehen
  (am Handy lange drücken) oder im Rezept „Verschieben“ wählen – auch in andere Wochen. Auf den
  Papierkorb ziehen entfernt, „Rückgängig“ nach jeder Änderung. Vergangene Tage werden blasser.
- **Woche planen**: „Frühstück wie letzte Woche“, Claude füllt freie Tage (kennt Favoriten und
  was es zuletzt gab), „Woche leeren“ ab heute.
- **Rezept**: großes Foto mit Parallax, Favoriten-Herz, Personenzahl pro Tag, Verlauf
  („zuletzt vor 2 Wochen · 3× in 3 Monaten“), Zutaten zum Abhaken, Zubereitung mit Cosori- und
  Thermomix-Karten und Timer, Chefkoch-Links. Sheets lassen sich am Handy nach unten wegwischen.
- **Thermomix**: 17 der 25 Rezepte haben Thermomix-Schritte (TM5/TM6/TM7) – Zeit, Temperatur oder
  Varoma, Stufe (auch Sanftrühr-, Knetstufe und Turbo) und Linkslauf, geschrieben wie auf dem
  Gerät („14 Min/100 °C/Linkslauf/Stufe 1“). Jeder Schritt ist entweder ein Cosori- oder ein
  Thermomix-Schritt; im Formular wählt man das Gerät pro Schritt. Kochbuch-Filter „Mit Thermomix“,
  Grundregeln in den Einstellungen.
- **Kochmodus**: große Schritte, Zutaten zum Abhaken, Timer für Cosori (mit Schüttel-Erinnerung,
  Ton und Vibration) und Thermomix, der Bildschirm bleibt an.
- **Einkaufsliste**: pro Woche, „ab heute“ oder die ganze Woche, nach Supermarkt-Abteilungen
  sortiert, eigene Artikel, Vorrat, Fortschrittsring, Kopieren für WhatsApp.
- **Kochbuch**: 25 Rezepte mit Fotos, Kategorie-Kacheln, „Rezept der Woche“, Suche (auch nach
  Zutaten), Filter, Regale „Favoriten“, „Lange nicht gegessen“ und „Schnell gemacht“, eigene Rezepte.
- **Kamera-Scan**: Foto von Kochbuch, Zeitschrift, Rezeptkarte oder einem fertigen Gericht (auch
  mehrere Seiten). Claude erkennt das Rezept, Antom legt es mit Einkaufsliste und Cosori-Schritt
  direkt im Kochbuch an, auf Wunsch gleich für einen Tag geplant. Das Originalfoto hängt am Rezept;
  bei einem fotografierten Gericht wird das Foto zum Bild des Rezepts.
- **Chefkoch & Cookidoo**: Chefkoch hat keine offene Schnittstelle, und die Seite darf fremde Seiten nicht
  laden. Darum gibt es Suchlinks an jedem Rezept, und „Von Chefkoch“ nimmt an, was die Familie hat:
  - einen **Link** – Claude schreibt das Gericht aus dem Namen in der Adresse oder dem Text daneben
    (typisches Rezept, nicht das genaue Original). Cookidoo-Links enthalten keinen Namen; dann fragt
    die Seite danach und Claude schreibt ein Thermomix-Rezept,
  - den kopierten **Rezepttext** – Claude übernimmt ihn genau,
  - **Screenshots** – lange Handy-Screenshots werden in bis zu vier lesbare Stücke geteilt, HEIC wird
    nach Möglichkeit in JPEG umgewandelt. Thermomix-Einstellungen aus Cookidoo-Screenshots übernimmt
    Claude genau.

  Fehler erklärt die Seite in Klartext (z. B. „Claude ist für dieses Antom noch nicht erlaubt“ mit Knopf
  „Claude erlauben“, der die Berechtigungen öffnet). Ohne Claude oder nach einem Fehler übernimmt
  „Selbst eintragen“ Link und Text ins Rezeptformular.
- **Erster Start**: kurze Einführung in vier Bildern (einmal pro Gerät, in den Einstellungen wieder abrufbar).
- **Web-App**: Hinweis „Auf den Home-Bildschirm“ beim ersten Öffnen in Safari, Einladungslink teilen,
  Sicherung speichern und laden (alles mit Fotos, ersetzt den Plan für die ganze Familie), Stand
  „Familienplan · offline“ / „Offline – kommt später“ in den Einstellungen.
- **Design**: Titel in Fraunces (Google Fonts), Text in der Systemschrift, kobaltblauer Kopf auf der
  Woche, Farben pro Kategorie (Frühstück Honig, Hauptgerichte Tomate, Salate Basilikum, Süßes
  Pflaume), große Titel, die beim Scrollen in eine Glasleiste wandern, Tab-Leiste, Hell- und
  Dunkelmodus (Nachtblau), auf dem Desktop Seitenleiste und ein Kochbuch-Regal zum Ziehen.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `src/` | die Seite in Teilen: `01-style.html` (CSS), `02-body.html` (Markup, Icons), `03-head.js` … `11-events.js` (Hilfen, Rezepte, Daten, Darstellung, Sheets, Scan/Import, Ereignisse) |
| `src/web/shim.js` | nur in der Web-App: `window.claude` (db, sample) über den eigenen Server, Kopie des Plans auf dem Handy, Warteschlange für Änderungen ohne Netz |
| `tools/build.py` | setzt `src/` zu `index.html`, `Antom.html` und `server/public/app.html` zusammen, bettet die Fotos ein und erzeugt die App-Symbole (`Pillow`) |
| `index.html` | die fertige Seite (ca. 2,3 MB), so wie sie als Artifact veröffentlicht wird – nicht von Hand bearbeiten |
| `Antom.html` | dieselbe Seite als vollständiges Dokument für jeden Browser (ca. 2,6 MB): Fraunces und SortableJS eingebettet, ohne die großen Fotodateien, Plan im `localStorage` |
| `img/` | Fotos (Higgsfield) in 960×1200: die 25 Gerichte, `ph-*` (gedeckter Tisch für eigene Rezepte), `ob-*` (Einführung), `scan-card`, `icon` |
| `tools/photos.py` | macht aus den Higgsfield-JPEGs die WebP-Dateien in `img/` |
| `server/` | die Web-App: Cloudflare Worker (`src/worker.js`), Familienplan als Durable Object mit SQLite (`src/family.js`), `public/` (App, Startseite, Service Worker, Symbole), `wrangler.toml`, Anleitung `EINRICHTUNG.md` |
| `../.github/workflows/antom-web.yml` | veröffentlicht die Web-App bei Cloudflare (Push auf `claude/antom-app` oder „Re-run“) |
| `test/` | Playwright-Tests mit nachgebautem `window.claude` und lokalen Kopien von SortableJS und Fraunces; `web.js` mit echtem Server und Claude-Ersatz (`mock-anthropic.mjs`) |

**Fotos**: Jedes Foto steckt zweimal in `index.html` – 540×675 für Karten und Rezeptkopf, 200×200 für
Listen –, als Base64-WebP, das beim Start in Blob-URLs umgewandelt wird. Damit sind die Bilder in jeder
Ansicht des Artifacts da, ohne etwas nachzuladen. Die großen Dateien aus `img/` werden zusätzlich
veröffentlicht und, wo sie laden, für Rezeptkopf und Heute-Karte gegen das eingebettete Bild getauscht.

Von außen lädt die Seite nur SortableJS (jsDelivr) und Fraunces (Google Fonts; sonst New York oder Georgia).

```sh
python3 tools/build.py [ordner-mit-higgsfield-jpegs]   # nach jeder Änderung in src/ oder img/
```

## Daten

Die Artifact-Datenbank (Capability `db`) hält den gemeinsamen Plan. Ohne Schreibrechte speichert
die Seite im Browser (`localStorage`, Schlüssel `antom.v4`). Die Web-App hält dieselben Dokumente
in ihrem Durable Object; jedes Handy fragt alle paar Sekunden nach Änderungen, Fotos (`photos/`)
werden erst beim Ansehen geladen. Eine Sicherung ist `{ app: "antom", version: 1, exported, docs: { <Pfad>: <Dokument> } }`.

- `days/<JJJJ-MM-TT>`: `{ f: [{ u, d, s? }], h: [...] }`, Frühstück und Hauptessen eines Tages;
  `d` ist die Gericht-ID, `s` eine abweichende Personenzahl. Leere Tage werden gelöscht. Die Tage
  bis heute sind zugleich der Verlauf („zuletzt gekocht“).
- `shop/<JJJJ-Www>`: Einkaufsliste einer ISO-Woche – abgehakte Artikel, benötigter Vorrat, eigene Artikel
- `dishes/<id>`: eigene und angepasste Rezepte (`{ deleted: true }` blendet ein eingebautes aus);
  gescannte haben `origin: "scan"`, `photo: { kind, n }` und bei Gerichten ein `thumb`. Ein Schritt ist
  `{ t, af }` (Cosori: `{ label, c, m, sh, pre }`) oder `{ t, tm }` (Thermomix: `{ label, sec, temp, speed, rev }`
  mit `temp` als °C, `"varoma"` oder `null` und `speed` als Zahl, `"sanft"`, `"knet"` oder `"turbo"`)
- `photos/<id>`: die Originalfotos eines gescannten Rezepts als JPEG-Data-URLs (`{ kind, pages, at }`,
  zusammen unter 256 KiB pro Dokument)
- `meta/favs`: `{ ids: { <id>: Zeitstempel } }`
- `meta/settings`: `{ people }`
- `diag/<Gerät>`: einmal pro Gerät, ob die großen Fotodateien laden (`{ ok, fail, src, page, base, ua }`) –
  nur zur Fehlersuche, die App liest es nicht

Antom 3 hatte nur eine Woche aus Wochentagen (`plan/<mo…so>`, `meta/shop`). Findet die Seite
solche Daten und noch keine `days`, legt sie sie auf die Daten der aktuellen Woche um und räumt
die alten Dokumente auf (im Browser genauso von `antom.v1` nach `antom.v4`).

## Tests

Braucht Node mit `playwright` und ein Chromium (Pfad bei Bedarf über `CHROMIUM_PATH`).

```sh
node test/functional.js                      # über 240 Prüfungen: Woche, Ziehen, Einkauf, Kochbuch, Scan, Import, Thermomix, Einzeldatei, Fotos ohne Netz …
node test/web.js                             # Web-App mit echtem Server: zwei iPhones, offline, Claude, Scan, Sicherungen, Tageslimit (vorher in server/ `npm ci`)
node test/visual.js [phone|tablet|desktop]   # Screenshots nach test/shots/
```

## Veröffentlichen

**Web-App**: `python3 tools/build.py`, Änderungen auf `claude/antom-app` pushen – GitHub Actions
veröffentlicht sie (Einrichtung: [`server/EINRICHTUNG.md`](server/EINRICHTUNG.md)).

**Artifact**: erst `python3 tools/build.py` laufen lassen, dann `index.html` als Artifact veröffentlichen, die
Dateien `img/*.webp` mitgeben und die Capabilities `{ "db": {}, "sample": { "images": true } }` angeben.
Damit die Eltern denselben Plan sehen, das Artifact über „Teilen“ mit Bearbeitungsrecht freigeben.
