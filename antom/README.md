# Antom

Wochenplan fürs Essen, nach dem Vorbild der Magnettafel am Kühlschrank: Frühstück und
Hauptessen für jeden Tag planen, Gerichte umsortieren und zu jedem Gericht die Zutaten, die
Einkaufsliste und die Zubereitung im Cosori-Airfryer sehen.

Läuft als Claude-Artifact (privat, Öffnen über Claude):
https://claude.ai/artifact/JW7gSbmGHVaQ9XFbXKtoDn

## Funktionen

- **Woche**: kobaltblauer Kopf mit Begrüßung und Datum, echte Kalenderwochen mit Pfeilen und
  „Heute“, Wochenleiste mit einem runden Foto pro Tag, große Karte für das heutige Essen (dazu
  Frühstück und „Morgen“), Frühstück und Hauptessen pro Tag. Gerichte ziehen
  (am Handy lange drücken) oder im Rezept „Verschieben“ wählen – auch in andere Wochen. Auf den
  Papierkorb ziehen entfernt, „Rückgängig“ nach jeder Änderung. Vergangene Tage werden blasser.
- **Woche planen**: „Frühstück wie letzte Woche“, Claude füllt freie Tage (kennt Favoriten und
  was es zuletzt gab), „Woche leeren“ ab heute.
- **Rezept**: großes Foto mit Parallax, Favoriten-Herz, Personenzahl pro Tag, Verlauf
  („zuletzt vor 2 Wochen · 3× in 3 Monaten“), Zutaten zum Abhaken, Zubereitung mit Cosori-Karte
  und Timer, Chefkoch-Links. Sheets lassen sich am Handy nach unten wegwischen.
- **Kochmodus**: große Schritte, Zutaten zum Abhaken, Cosori-Timer mit Schüttel-Erinnerung
  (Ton und Vibration), der Bildschirm bleibt an.
- **Einkaufsliste**: pro Woche, „ab heute“ oder die ganze Woche, nach Supermarkt-Abteilungen
  sortiert, eigene Artikel, Vorrat, Fortschrittsring, Kopieren für WhatsApp.
- **Kochbuch**: 25 Rezepte mit Fotos, Kategorie-Kacheln, „Rezept der Woche“, Suche (auch nach
  Zutaten), Filter, Regale „Favoriten“, „Lange nicht gegessen“ und „Schnell gemacht“, eigene Rezepte.
- **Kamera-Scan**: Foto von Kochbuch, Zeitschrift, Rezeptkarte oder einem fertigen Gericht (auch
  mehrere Seiten). Claude erkennt das Rezept, Antom legt es mit Einkaufsliste und Cosori-Schritt
  direkt im Kochbuch an, auf Wunsch gleich für einen Tag geplant. Das Originalfoto hängt am Rezept;
  bei einem fotografierten Gericht wird das Foto zum Bild des Rezepts.
- **Chefkoch**: Chefkoch hat keine offene Schnittstelle, und die Seite darf fremde Seiten nicht
  laden. Darum gibt es Suchlinks an jedem Rezept, und „Von Chefkoch“ nimmt an, was die Familie hat:
  - einen **Link** – Claude schreibt das Gericht aus dem Namen in der Adresse (typisches Rezept, nicht
    das genaue Original),
  - den kopierten **Rezepttext** – Claude übernimmt ihn genau,
  - **Screenshots** – lange Handy-Screenshots werden in bis zu vier lesbare Stücke geteilt, HEIC wird
    nach Möglichkeit in JPEG umgewandelt.

  Fehler erklärt die Seite in Klartext (z. B. „Claude ist für dieses Antom noch nicht erlaubt“ mit Knopf
  „Claude erlauben“, der die Berechtigungen öffnet). Ohne Claude oder nach einem Fehler übernimmt
  „Selbst eintragen“ Link und Text ins Rezeptformular.
- **Erster Start**: kurze Einführung in vier Bildern (einmal pro Gerät, in den Einstellungen wieder abrufbar).
- **Design**: Titel in Fraunces (Google Fonts), Text in der Systemschrift, kobaltblauer Kopf auf der
  Woche, Farben pro Kategorie (Frühstück Honig, Hauptgerichte Tomate, Salate Basilikum, Süßes
  Pflaume), große Titel, die beim Scrollen in eine Glasleiste wandern, Tab-Leiste, Hell- und
  Dunkelmodus (Nachtblau), auf dem Desktop Seitenleiste und ein Kochbuch-Regal zum Ziehen.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `src/` | die Seite in Teilen: `01-style.html` (CSS), `02-body.html` (Markup, Icons), `03-head.js` … `11-events.js` (Hilfen, Rezepte, Daten, Darstellung, Sheets, Scan/Import, Ereignisse) |
| `tools/build.py` | setzt `src/` zu `index.html` zusammen und bettet die Fotos ein (`Pillow`) |
| `index.html` | die fertige Seite (ca. 2,3 MB), so wie sie als Artifact veröffentlicht wird – nicht von Hand bearbeiten |
| `img/` | Fotos (Higgsfield) in 960×1200: die 25 Gerichte, `ph-*` (gedeckter Tisch für eigene Rezepte), `ob-*` (Einführung), `scan-card`, `icon` |
| `tools/photos.py` | macht aus den Higgsfield-JPEGs die WebP-Dateien in `img/` |
| `test/` | Playwright-Tests mit nachgebautem `window.claude` und lokalen Kopien von SortableJS und Fraunces |

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
die Seite im Browser (`localStorage`, Schlüssel `antom.v4`).

- `days/<JJJJ-MM-TT>`: `{ f: [{ u, d, s? }], h: [...] }`, Frühstück und Hauptessen eines Tages;
  `d` ist die Gericht-ID, `s` eine abweichende Personenzahl. Leere Tage werden gelöscht. Die Tage
  bis heute sind zugleich der Verlauf („zuletzt gekocht“).
- `shop/<JJJJ-Www>`: Einkaufsliste einer ISO-Woche – abgehakte Artikel, benötigter Vorrat, eigene Artikel
- `dishes/<id>`: eigene und angepasste Rezepte (`{ deleted: true }` blendet ein eingebautes aus);
  gescannte haben `origin: "scan"`, `photo: { kind, n }` und bei Gerichten ein `thumb`
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
node test/functional.js                      # über 200 Prüfungen: Woche, Ziehen, Einkauf, Kochbuch, Scan, Import, Fotos ohne Netz …
node test/visual.js [phone|tablet|desktop]   # Screenshots nach test/shots/
```

## Veröffentlichen

Erst `python3 tools/build.py` laufen lassen, dann `index.html` als Artifact veröffentlichen, die
Dateien `img/*.webp` mitgeben und die Capabilities `{ "db": {}, "sample": { "images": true } }` angeben.
Damit die Eltern denselben Plan sehen, das Artifact über „Teilen“ mit Bearbeitungsrecht freigeben.
