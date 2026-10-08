# Antom als eigene App für die Familie – Einrichtung

Am Ende habt ihr einen privaten Link, zum Beispiel
`https://antom.familie-schmidt.workers.dev/f/xxxxxx-xxxxxx-xxxxxx/` – mit eurem eigenen
Familienschlüssel statt der x. Wer ihn auf dem iPhone in
Safari öffnet und „Zum Home-Bildschirm“ wählt, hat Antom wie eine App: mit eigenem Symbol, im
Vollbild, ohne Anmeldung und auch ohne Internet. Alle in der Familie sehen denselben Plan, und
„Mit Claude umwandeln“ und der Foto-Scan laufen über deinen eigenen Claude-API-Schlüssel.

Einmal einrichten dauert etwa eine halbe Stunde, alles im Browser. Danach geht jede Änderung an
Antom (auf dem Zweig `claude/antom-app`) von selbst online.

**Kosten**: Cloudflare kostet nichts (Gratis-Tarif, 100 000 Anfragen pro Tag – für eine Familie
reicht das um ein Vielfaches). Claude wird nach Verbrauch bezahlt: ein umgewandeltes Rezept kostet
etwa 5–10 Cent, ein Foto-Scan mit drei Bildern etwa 10–15 Cent. Mehr als 40 Claude-Anfragen pro Tag
lässt die App nicht zu (`CLAUDE_DAILY_LIMIT` in `wrangler.toml`).

## 1. Cloudflare – hier läuft die App

1. Auf [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) ein kostenloses Konto
   anlegen und die E-Mail bestätigen.
2. Links **Workers & Pages** öffnen (je nach Ansicht unter **Compute**). Fragt Cloudflare nach einer
   **workers.dev-Subdomain**, einen Namen wählen, z. B. `familie-schmidt`. Die App heißt später
   `https://antom.<subdomain>.workers.dev`.
3. Auf derselben Seite steht rechts die **Account ID** – kopieren und aufheben.
4. API-Token anlegen, damit GitHub die App veröffentlichen darf: rechts oben auf das Personen-Symbol
   → **Profile** → **API Tokens** → **Create Token** → bei **Edit Cloudflare Workers** auf
   **Use template**. Unter **Account Resources** dein Konto auswählen, den Rest so lassen →
   **Continue to summary** → **Create Token**. Den Token kopieren – er wird nur einmal gezeigt.

## 2. Claude-API-Schlüssel – für Umwandeln und Foto-Scan

Das ist unabhängig von einem Claude-Abo: Die API wird getrennt und nach Verbrauch abgerechnet.

1. Auf [platform.claude.com](https://platform.claude.com) ein Konto anlegen.
2. Unter **Billing** Guthaben kaufen, z. B. 10 $, und das automatische Aufladen aus lassen. Dann
   kann nie mehr verbraucht werden als aufgeladen ist. Ist es leer, sagt die App das in Klartext.
3. Unter **API Keys** → **Create Key**, Name „Antom“, den Schlüssel (beginnt mit `sk-ant-`)
   kopieren.

Ohne diesen Schlüssel funktioniert alles andere trotzdem – du kannst ihn auch später nachtragen.

## 3. Familienschlüssel – das Schloss für euren Plan

Der Familienschlüssel steckt im Einladungslink. Wer ihn hat, sieht und ändert euren Plan; ohne ihn
zeigt die Adresse nur „Dieser Wochenplan ist privat“.

- 16 bis 128 Zeichen, nur Buchstaben ohne Umlaute, Ziffern, `-` und `_`
- am einfachsten vom Passwort-Generator: In der **Passwörter**-App auf dem iPhone ein neues Passwort
  anlegen und das vorgeschlagene starke Passwort nehmen (sechs Zeichen, Bindestrich, sechs Zeichen,
  Bindestrich, sechs Zeichen – wie `xxxxxx-xxxxxx-xxxxxx`, nur mit zufälligen Buchstaben und Ziffern)
- bitte keinen Schlüssel aus einer Anleitung oder einem Beispiel nehmen
- gut aufheben, z. B. gleich in der Passwörter-App

## 4. GitHub – Schlüssel hinterlegen

Auf [github.com/joschalt-crypto/Claude/settings/secrets/actions](https://github.com/joschalt-crypto/Claude/settings/secrets/actions)
viermal **New repository secret** anlegen (Name genau so, Wert einfügen, **Add secret**):

| Name | Wert |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | der Token aus Schritt 1.4 |
| `CLOUDFLARE_ACCOUNT_ID` | die Account ID aus Schritt 1.3 |
| `ANTHROPIC_API_KEY` | der Claude-Schlüssel aus Schritt 2 |
| `ANTOM_FAMILY_KEY` | der Familienschlüssel aus Schritt 3 |

Das Repository ist öffentlich, die Secrets nicht: Niemand kann sie lesen, sie erscheinen auch in
keinem Protokoll.

## 5. Veröffentlichen

1. [Actions → Antom Web-App](https://github.com/joschalt-crypto/Claude/actions/workflows/antom-web.yml)
   öffnen und den obersten Lauf anklicken.
2. Rechts oben **Re-run all jobs** → **Re-run jobs**.
3. Nach zwei, drei Minuten ist der Lauf grün. In der Zusammenfassung steht die Adresse, z. B.
   `https://antom.familie-schmidt.workers.dev`.

Euer Einladungslink ist diese Adresse, dahinter `/f/`, der Familienschlüssel und ein `/`:
`https://antom.familie-schmidt.workers.dev/f/<Familienschlüssel>/`

## 6. Eure bisherigen Daten übernehmen

Die Datei `antom-umzug.json` (von Claude, nicht im Repository – sie enthält euren Plan) bringt
geplante Tage, eigene Rezepte mit Fotos, Einkaufslisten und Einstellungen aus der Claude-Version mit.

1. Den Einladungslink öffnen – am Computer oder am iPhone (dort die Datei vorher unter „Dateien“
   sichern).
2. Oben auf das Zahnrad → **Sicherung laden …** → `antom-umzug.json` wählen → **Sicherung laden**.

Was ihr nach dem Erstellen der Datei noch in der Claude-Version ändert, ist nicht dabei – dann
Claude einfach um eine neue Umzugsdatei bitten.

## 7. Eltern einladen

1. In der App: Zahnrad → **Familie einladen** → per WhatsApp oder iMessage schicken.
2. Auf dem iPhone der Eltern: Link antippen. Öffnet er sich in WhatsApp, oben rechts **In Safari
   öffnen** wählen.
3. In Safari **Teilen** (bei neueren iPhones zuerst unten auf **•••**) → **Zum Home-Bildschirm** →
   **Hinzufügen**. Die App zeigt diese Schritte beim ersten Öffnen selbst an.

Ab dann Antom immer über das neue Symbol öffnen.

## Gut zu wissen

- **Neue Versionen** kommen von selbst: Wird auf `claude/antom-app` etwas unter `antom/` geändert,
  veröffentlicht GitHub die App neu. Die iPhones holen sich die neue Version beim nächsten Öffnen.
- **Sicherung**: ab und zu Zahnrad → **Sicherung speichern**. Die Datei enthält alles, auch Fotos.
- **Ohne Internet** öffnet die App mit dem letzten Stand; Änderungen werden geschickt, sobald wieder
  Netz da ist („Offline – kommt später“ in den Einstellungen).
- **Link in falsche Hände geraten?** Einen neuen Familienschlüssel als `ANTOM_FAMILY_KEY` eintragen,
  den Lauf aus Schritt 5 neu starten und den neuen Link verschicken. Der alte geht dann nicht mehr,
  die Daten bleiben. Auf den iPhones das alte Symbol löschen und den neuen Link hinzufügen.
- **Verbrauch** siehst du auf platform.claude.com unter **Usage**.
- Die Claude-Version (Artifact) und `Antom.html` funktionieren weiter, haben aber ihre eigenen Daten.

## Wenn etwas nicht klappt

| Was du siehst | Was hilft |
| --- | --- |
| Lauf grün, aber „Bei Cloudflare veröffentlichen“ übersprungen, Hinweis „Antom ist noch nicht eingerichtet“ | Secrets aus Schritt 4 fehlen oder sind falsch benannt; danach Schritt 5 wiederholen |
| „Familienschlüssel passt nicht“ | Der Schlüssel hat ein Leerzeichen, einen Umlaut oder ist zu kurz – Schritt 3 |
| „register a workers.dev subdomain“ | Schritt 1.2: in Cloudflare unter Workers & Pages die Subdomain anlegen |
| „Authentication error“ oder „code: 10000“ | Token oder Account ID passen nicht – Schritt 1.3 und 1.4, als Vorlage „Edit Cloudflare Workers“ |
| Im Browser „Dieser Wochenplan ist privat“ | Der Link ist unvollständig oder der Familienschlüssel weicht ab (Groß-/Kleinschreibung zählt) |
| In der App „Claude ist für diese App noch nicht eingerichtet“ | `ANTHROPIC_API_KEY` fehlt oder ist ungültig – Schritt 2 und 4, dann Schritt 5 |
| In der App „Das Guthaben für Claude ist aufgebraucht“ | Auf platform.claude.com unter Billing Guthaben aufladen |
| „Für heute sind die Claude-Anfragen aufgebraucht“ | Tageslimit erreicht – am nächsten Tag geht es wieder |

## Für Entwickler

```sh
cd antom/server
npm ci
cp .dev.vars.example .dev.vars   # Familienschlüssel und API-Schlüssel eintragen
npm run dev                       # http://localhost:8787/f/<FAMILY_KEY>/
node ../test/web.js               # Ende-zu-Ende-Tests mit zwei iPhones und einem Claude-Ersatz
```

Der Worker (`src/worker.js`) liefert die App nur unter `/f/<FAMILY_KEY>/` aus und leitet Claude-Anfragen
mit festem Modell und Tageslimit weiter. Der Plan liegt in einem Durable Object mit SQLite
(`src/family.js`), mit denselben Dokumenten wie in der Artifact-Datenbank. Im Gratis-Tarif darf eine
Anfrage nur 10 ms rechnen; deshalb kommen Fotos als Dateien an, die Anfrage an Claude wird als Text
zusammengesetzt, und Sicherungen gehen in Teilen von etwa einem halben Megabyte hin und her.
