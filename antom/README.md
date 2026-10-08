# Antom

Wochenplan fürs Essen, nach dem Vorbild der Magnettafel am Kühlschrank. Frühstück und
Hauptessen pro Tag planen, Gerichte per Ziehen umsortieren und pro Gericht entweder die
Einkaufsliste oder das Rezept samt Zubereitung im Cosori-Airfryer sehen.

Läuft als Claude-Artifact (privat, Öffnen über Claude):
https://claude.ai/artifact/JW7gSbmGHVaQ9XFbXKtoDn

## Funktionen

- **Woche**: Tagesleiste, Karte „Heute“, Frühstück und Hauptessen pro Tag. Gerichte ziehen
  (am Handy lange drücken) oder über „Verschieben“ umplanen, auf den Papierkorb ziehen zum
  Entfernen, „Rückgängig“ nach jeder Änderung.
- **Rezept**: Einkaufsliste oder Rezept pro Gericht, Personenzahl pro Tag, Cosori-Schritte mit Timer.
- **Kochmodus**: große Schritte, Zutaten zum Abhaken, Cosori-Timer mit Schüttel-Erinnerung
  (Ton und Vibration), der Bildschirm bleibt an.
- **Einkaufsliste**: die ganze Woche, nach Supermarkt-Abteilungen sortiert, eigene Artikel,
  Vorrat, Kopieren für WhatsApp.
- **Kochbuch**: 25 Rezepte von der Kühlschranktafel, Suche (auch nach Zutaten), Filter, eigene Rezepte.
- **Kamera-Scan**: Foto von Kochbuch, Zeitschrift, Rezeptkarte oder einem fertigen Gericht (auch
  mehrere Seiten). Claude erkennt das Rezept, Antom legt es mit Einkaufsliste und Cosori-Schritt
  direkt im Kochbuch an, auf Wunsch gleich für einen Tag geplant. Das Originalfoto hängt am Rezept;
  bei einem fotografierten Gericht wird das Foto zum Teller der Rezeptkarte.
- **Chefkoch**: Chefkoch hat keine offene Schnittstelle. Darum gibt es Suchlinks an jedem Rezept,
  und „Rezept übernehmen“ macht mit Claude aus eingefügtem Text oder Screenshots ein Antom-Rezept.
- **Claude**: schreibt Rezepte, wandelt Importe um und füllt freie Tage aus dem eigenen Kochbuch.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `index.html` | die ganze Seite (HTML, CSS, JS, Rezepte), so wie sie als Artifact veröffentlicht wird |
| `img/` | Aquarell-Teller (Higgsfield), freigestellt: `<name>.webp` 640 px, `<name>-s.webp` 360 px |
| `tools/cutout.py` | stellt die Illustrationen vom weißen Papier frei (`numpy`, `scipy`, `Pillow`) |
| `test/` | Playwright-Tests mit nachgebautem `window.claude` und lokalen Kopien der CDN-Dateien |

Von außen lädt die Seite nur SortableJS (jsDelivr) und Google Fonts (Young Serif, Figtree).

## Daten

Die Artifact-Datenbank (Capability `db`) hält den gemeinsamen Plan. Ohne Schreibrechte speichert
die Seite im Browser (`localStorage`, Schlüssel `antom.v1`).

- `plan/<mo|di|mi|do|fr|sa|so>`: `{ f: [{ u, d, s? }], h: [...] }`, also Frühstück und Hauptessen;
  `d` ist die Gericht-ID, `s` eine abweichende Personenzahl
- `dishes/<id>`: eigene und angepasste Rezepte (`{ deleted: true }` blendet ein eingebautes aus);
  gescannte haben `origin: "scan"`, `photo: { kind, n }` und bei Gerichten ein kleines `thumb`
- `photos/<id>`: die Originalfotos eines gescannten Rezepts als JPEG-Data-URLs (`{ kind, pages, at }`,
  zusammen unter 256 KiB pro Dokument)
- `meta/shop`: abgehakte Artikel, benötigter Vorrat, eigene Artikel
- `meta/settings`: `{ people }`

## Tests

Braucht Node mit `playwright` und ein Chromium (Pfad bei Bedarf über `CHROMIUM_PATH`).

```sh
node test/functional.js                # 131 Prüfungen: Plan, Ziehen, Einkauf, Import, Scan, Claude, Kochmodus …
node test/visual.js [phone|desktop]    # Screenshots nach test/shots/
```

## Veröffentlichen

`index.html` als Artifact veröffentlichen, die Dateien `img/*.webp` mitgeben und die Capabilities
`{ "db": {}, "sample": { "images": true } }` angeben.
