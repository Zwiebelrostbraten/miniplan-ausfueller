# Miniplan-Ausfüller

Datensparsame Browser-App zum automatischen Einteilen von Ministranten. Zwei ODS-Dateien auswählen, „Plan einteilen“ drücken, Bericht prüfen und die ausgefüllte ODS-Vorlage herunterladen. Dateien und Namen werden ausschließlich lokal verarbeitet; kein Backend, kein Upload.

## Eingaben

Das erste Tabellenblatt der **leeren Miniplan-Vorlage** enthält A: Wochentag, B: Datum (`DD.MM.YYYY`), C: Uhrzeit, D: Gottesdiensttyp, E: Rolle, F/G: Namen. Folgezeilen mit Rollen gehören zum vorigen Gottesdienst bis zur Leerzeile. Die Ausgabe verändert ausschließlich die Namenszellen F/G; Layout, Stile, Zusammenführungen und weitere Tabellenblätter bleiben erhalten.

Die **Personendaten** benötigen diese Spalten in dieser Reihenfolge:

`Person-ID`, `Haushalts-ID`, `Nachname`, `Vorname`, `Beitrittsjahr`, `Wochendienst`, `PREF_CODE`, `Rauchfass`.

IDs müssen eindeutig sein. Wochendienst und Rauchfass sind 0/1. Wünsche: `NONE`, `NO_SERVICE`, `PAIR:<Person-ID>` oder `PREF:<Person-ID>`.

## Regeln

- Zwei verschiedene Personen pro Rolle; kleines Kreuz und Lautsprecher benötigen eine. Niemand dient zweimal im selben Gottesdienst.
- NO_SERVICE schließt eine Person vollständig aus. Jede Wochendienst-Zeile liegt auf einem Sonntag D und teilt zwei verschiedene Personen mit Wochendienst=1 für die folgende Woche Montag–Sonntag ein. Ihre Namen werden in F und G der Wochendienst-Kopfzeile geschrieben. Beide zugeteilten Personen sind am Sonntag D+7 von gewöhnlichen Gottesdiensten ausgeschlossen, dürfen aber am Sonntag D dienen. Wochendienst=1 allein schließt niemanden von Sonntagsdiensten aus. Bei nur einer zulässigen Person wird F gefüllt und G bleibt leer; ohne zulässige Personen bleiben F und G leer. Der Bericht nennt mit Datum und Kopfzeile die genaue Anzahl: „Wochendienst: 1 unbelegter Personenplatz; Wochendienst=1 und kein NO_SERVICE erforderlich.“ beziehungsweise „Wochendienst: 2 unbelegte Personenplätze; Wochendienst=1 und kein NO_SERVICE erforderlich.“
- SchGD lässt nur aktuelle Jahrgänge zu: 1. August des Beitrittsjahres bis 31. August des Folgejahres. Im August überlappen zwei Jahrgänge. Ohne zulässige Personen bleibt die Rolle leer und erscheint im Konfliktbericht.
- Rauchfass benötigt zwei Personen: mindestens eine geschulte Person und eine **andere** Person mit mindestens drei vollen Mitgliedsjahren.
- Fahnen, gr. Fahnen, Laternen, gr. Kreuz und Palmstecken benötigen fünf volle Jahre; kl. Kreuz / kleines Kreuz vier. Mitgliedsjahre beginnen am 1. August. Die sichtbaren erweiterten Einstellungen erlauben eigene Rollen und Mindestjahre.
- Tauffeier/Trauung erhalten „Wochendienst“ in F und ein leeres G.

Die deterministische gruppenweise Optimierung maximiert zuerst belegte Plätze, dann gewichtet sie jüngere Jahrgänge häufiger. Weitere Ziele sind zeitliche Abstände, gemeinsame Haushalte und Wünsche (gegenseitiges PAIR stärker als PREF). Eine begrenzte Suche bewertet vollständige Rollengruppen; falls sie nicht alle Plätze füllt, prüft eine exakte Suche die mögliche maximale Belegung. Harte Regeln werden niemals zugunsten dieser Wünsche gebrochen.

Der Bericht zeigt belegte/unbelegte Plätze, Konflikte mit Datum, Rolle und Zeile sowie Dienste und den Abstand der letzten beiden Einteilungen je Person. Eingabe- oder Einstellungsänderungen verwerfen die vorbereitete Ausgabe. Namen werden als Text geschrieben und vor Formel-Injection geschützt.

## Lokale Nutzung und Entwicklung

Node.js 22 oder neuer:

```sh
npm ci
npm run lint
npm test
npm run build
```

`dist/miniplan.html` im Browser öffnen; `miniplan.css` und `miniplan.js` müssen daneben liegen. `dist/index.html` ist die gleichwertige Website-Einstiegsseite. Nach dem Laden ist kein Internet erforderlich.

```sh
npx playwright install chromium
npm run test:browser
```

Die echte Browserprüfung liest die beiden externen Referenzdateien aus `/opt/data/host-shared-projekte/miniplan-ausfüller` (überschreibbar über `MINIPLAN_REFERENCE`):

- `St. Georg - Miniplan vom 01.07.2026 - 03.10.2026.ods`
- `Test_Person_data.ods`

Die Dateien werden nicht ins Repository kopiert. Playwright öffnet die gebaute App, lädt die ODS-Ausgabe herunter und prüft Rollen, Ausschlüsse, Jahrgangsgrenzen, Doppelbelegung, beide Namen in F/G der Wochendienst-Kopfzeilen und Ausschlüsse am folgenden Sonntag, Trauung-/Tauffeier-Markierungen, unveränderte übrige Zellen und ZIP-Einträge sowie Layout/Stilattribute. `AGENT_BROWSER_EXECUTABLE_PATH` kann ein installiertes Chromium auswählen.

Kernlogik liegt unter `src/core/`; Tests unter `tests/`. Die Laufzeit benötigt nur `@e965/xlsx` und `jszip`.

[MIT-Lizenz](LICENSE)
