# Antom

Wochenplan fürs Essen, nach dem Vorbild der Magnettafel am Kühlschrank: Frühstück und
Hauptessen für jeden Tag planen, Gerichte umsortieren und zu jedem Gericht die Zutaten, die
Einkaufsliste und die Zubereitung im Cosori-Airfryer sehen.

Läuft als Claude-Artifact (privat, Öffnen über Claude):
https://claude.ai/artifact/JW7gSbmGHVaQ9XFbXKtoDn

## Funktionen

- **Woche**: echte Kalenderwochen mit Pfeilen und „Heute“, Tagesleiste, große Karte für das
  heutige Essen (dazu Frühstück und „Morgen“), Frühstück und Hauptessen pro Tag. Gerichte ziehen
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
- **Kochbuch**: 25 Rezepte mit Fotos, Suche (auch nach Zutaten), Filter, Regale „Favoriten“,
  „Lange nicht gegessen“ und „Schnell gemacht“, eigene Rezepte.
- **Kamera-Scan**: Foto von Kochbuch, Zeitschrift, Rezeptkarte oder einem fertigen Gericht (auch
  mehrere Seiten). Claude erkennt das Rezept, Antom legt es mit Einkaufsliste und Cosori-Schritt
  direkt im Kochbuch an, auf Wunsch gleich für einen Tag geplant. Das Originalfoto hängt am Rezept;
  bei einem fotografierten Gericht wird das Foto zum Bild des Rezepts.
- **Chefkoch**: Chefkoch hat keine offene Schnittstelle. Darum gibt es Suchlinks an jedem Rezept,
  und „Rezept übernehmen“ macht mit Claude aus eingefügtem Text oder Screenshots ein Antom-Rezept.
- **Erster Start**: kurze Einführung in vier Bildern (einmal pro Gerät, in den Einstellungen wieder abrufbar).
- **Design**: im Stil einer iOS-App – Systemschrift (San Francisco, für Rezepttitel New York),
  große Titel, die beim Scrollen in eine Glasleiste wandern, Tab-Leiste, Hell- und Dunkelmodus,
  auf dem Desktop Seitenleiste und ein Kochbuch-Regal zum Ziehen.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `index.html` | die ganze Seite (HTML, CSS, JS, Rezepte), so wie sie als Artifact veröffentlicht wird |
| `img/` | Fotos (Higgsfield): `<name>.webp` 960×1200, `<name>-m.webp` 480×600, `<name>-s.webp` 240×240; dazu `ph-*` (gedeckter Tisch für eigene Rezepte), `ob-*` (Einführung), `scan-card`, `icon` |
| `tools/photos.py` | macht aus den Higgsfield-JPEGs die drei WebP-Größen (`Pillow`) |
| `test/` | Playwright-Tests mit nachgebautem `window.claude` und lokaler Kopie von SortableJS |

Von außen lädt die Seite nur SortableJS (jsDelivr). Schriften sind die des Geräts.

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

Antom 3 hatte nur eine Woche aus Wochentagen (`plan/<mo…so>`, `meta/shop`). Findet die Seite
solche Daten und noch keine `days`, legt sie sie auf die Daten der aktuellen Woche um und räumt
die alten Dokumente auf (im Browser genauso von `antom.v1` nach `antom.v4`).

## Tests

Braucht Node mit `playwright` und ein Chromium (Pfad bei Bedarf über `CHROMIUM_PATH`).

```sh
node test/functional.js                      # 180 Prüfungen: Woche, Ziehen, Einkauf, Kochbuch, Scan, Umzug, Einführung …
node test/visual.js [phone|tablet|desktop]   # Screenshots nach test/shots/
```

## Veröffentlichen

`index.html` als Artifact veröffentlichen, die Dateien `img/*.webp` mitgeben und die Capabilities
`{ "db": {}, "sample": { "images": true } }` angeben.
