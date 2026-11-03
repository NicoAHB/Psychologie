# Hausaufgaben: Feinschliff in 0.5.0

## Für die Nutzerin

Im Klientenprofil unter **Hausaufgaben** führt **Hausaufgabe auswählen** zur Bibliothek mit weiterhin 30 deutsch/ukrainischen Aufgaben und den eigenen Vorlagen. Die neue Auswahl **Noch nicht zugeteilt / Bereits zugeteilt** bezieht sich immer auf den geöffneten Klienten. Favoriten, Kategorie, eigene Vorlagen und Suche lassen sich kombinieren und gemeinsam zurücksetzen. Die Suche findet auch den ukrainischen Aufgabentitel, wenn die Oberfläche auf Deutsch steht und der Klient Ukrainisch spricht. Bereits zugeteilte Aufgaben bleiben auswählbar; die bisherige ausdrückliche Wiederholungswarnung bleibt erhalten.

Vor der Zuteilung erscheint zuerst eine lesbare Vorschau. **Aufgabe anpassen** öffnet die bearbeitbaren Inhalte. Unter den weiteren Einstellungen können die Dokumentsprache und eine zusätzliche **Protokollseite** mit sieben ausfüllbaren Zeilen für Datum und Beobachtung gewählt werden. Die Seite ist optional; bisherige Arbeitsblätter bleiben unverändert. Der Fälligkeitstag kann vom nächsten geplanten Termin übernommen oder vollständig geleert werden. Ein Termin in einer anderen Zeitzone wird dabei auf den Kalendertag der Praxis umgerechnet.

Drei Schaltflächen über der Aufgabenliste zeigen aktive Aufgaben, überfällige Aufgaben und erwartete Rückläufe. Weitere Filter zeigen erhaltene Rückläufe, Aufgaben ohne Übergabenachweis, Entwürfe und den abgeschlossenen Verlauf. Download allein gilt weiterhin nicht als Übergabe. Ein unbestätigter Versandversuch wird auch weiterhin nicht als erfolgreicher Versand dargestellt.

Im Detail stehen das ursprüngliche Arbeitsblatt und die zurückerhaltenen Dateien nebeneinander, auf schmalen Geräten untereinander. Rückläufe können hier unmittelbar heruntergeladen und weitere Dateien als Rücklauf erfasst werden. Ein bisher noch nicht erzeugtes Original wird dazu bei Bedarf vorbereitet; das trägt keinen Versand ein. Die Versandoptionen stehen aufklappbar unter dem Original. Der neueste Vorgang steht im Verlauf oben. Bei einem Rücklauf zählt der eingetragene Empfangstag, nicht der spätere Uploadzeitpunkt.

Änderungen an Besprechungsnotiz, Status, Fälligkeit und Rücklaufwunsch werden während der Eingabe als **verschlüsselter Entwurf** gesichert. Erst **Speichern** übernimmt sie als bestätigten Eintrag. Ein wieder aufgenommener Entwurf wird gekennzeichnet. Beim Schließen des Dialogs und beim Sperren wartet die App auf das ausstehende Speichern. Falls das Speichern fehlschlägt, bleibt der Fehler sichtbar. Eine sofortige Beendigung des Browserprozesses oder ein Geräteausfall kann durch JavaScript nicht vollständig abgesichert werden; regelmäßige Sicherungen bleiben wichtig.

Wenn zwischenzeitlich dieselben Angaben auf einem anderen Gerät oder in einem anderen Fenster geändert wurden, bleibt der eigene Text erhalten und die gespeicherte Fassung wird zum Vergleich gezeigt. Die Nutzerin muss bewusst bestätigen, bevor sie widersprechende Angaben ersetzt. Änderungen an anderen Feldern bleiben erhalten. Die schnelle Schaltfläche zum Abschließen auf dem Überblick öffnet bei vorhandenem Entwurf zuerst dessen Bearbeitung.

Neue PDFs tragen einen lesbaren Aufgabentitel und ein kurzes eindeutiges Kennzeichen im Dateinamen. Der Klientenname wird dafür nicht automatisch verwendet. Bereits gespeicherte Original-PDFs behalten ihren Inhalt und Dateinamen.

## Für Claude und die weitere Entwicklung

### Daten und Speicherung

- `HomeworkSnapshot.practiceLog?: boolean` erweitert nur den unveränderlichen Aufgabenstand. Fehlt es in alten Akten oder Sicherungen, wird keine zusätzliche Seite erzeugt.
- `HomeworkAssignment.reviewDraft?: HomeworkReviewDraft` enthält `base`, `values` und `savedAt`. Die vier Werte sind Status, Notiz, Fälligkeit und Rücklaufwunsch. Sie sind ausdrücklich **nicht** mit der bestätigten Rückmeldung gleichzusetzen.
- Validatoren prüfen Typen, gültiges Datum und die bestehende Notizlänge. Alte Aufgaben ohne Entwurf bleiben gültig.
- Entwürfe werden ausschließlich über `vault.update` mit der vorhandenen AES-GCM-Tresorverschlüsselung gespeichert. Keine Praxisdaten werden dazu in `localStorage`, Cache oder unverschlüsselten Dateien abgelegt.
- Bestehende Sicherungen, In-App-Verlauf, Cloud-Abgleich und Klientenexport enthalten die neuen optionalen Eigenschaften über die bisherigen Datenpfade. Der lesbare Klientenexport kennzeichnet eine Entwurfsnotiz ausdrücklich als unbestätigt. Die globale Suche findet auch den Entwurfstext.
- Das vorhandene feldweise Merge behandelt den verschachtelten Entwurf atomar; konkurrierende Offline-Fassungen bleiben über die bestehenden Konfliktalternativen erhalten. `commitHomeworkReview` schützt zusätzlich die ausdrückliche Bestätigung vor veralteten Bearbeitungsständen und verlangt bei überschneidenden Änderungen einen aktuellen Vergleich. Das ersetzt nicht die vorhandene Konfliktansicht.
- Löschung einer Klientenakte entfernt Aufgabe, Entwurf und zugehörige Konfliktmetadaten über die vorhandene Lebenszyklusbereinigung.

### Dateien und Zuständigkeiten

- `homeworkWorkflow.ts`: Fortschrittsindex, Listenfilter, nächster Fälligkeitstag, chronologischer Verlauf. Dokumente werden einmal je Aufgabenliste indiziert, anstatt für jeden Tastendruck alle Anhänge erneut zu durchsuchen.
- `homeworkReview.ts`: reine Funktionen für Entwurf, Feldvergleich, Konfliktprüfung und ausdrückliche Übernahme. Nur selbst bearbeitete Felder werden übernommen; eine überholte Bestätigung wird abgelehnt.
- `useHomeworkReview.ts`: 500-ms-Verzögerung, eine zusammengefasste Schreibwarteschlange und Anschluss an den bestehenden Sperr-/Update-Schutz. Seitenwechsel und Ausblenden lösen ebenfalls einen Speicherauftrag aus.
- `HomeworkReviewForm.tsx`: bestätigte Bearbeitung, Entwurfsanzeige, Konfliktvergleich und vorhandener Speicherstatus. Schließen während des ausdrücklichen Speicherns wartet auf denselben Auftrag.
- `homework.tsx`: Bibliothek, Vorschau, Zuteilung, Fortschrittsübersicht und datierter Verlauf. Listen bleiben begrenzt und die Suche verzögert.
- `HomeworkFiles.tsx`: Original, unmittelbare Rücklauf-Downloads, bestehende Versanddialoge und Upload. Blob-URLs werden weiter nur über die bestehenden Dateihilfen benutzt.
- `homeworkPdf.ts`: optionale zweite bzw. zusätzliche Seite mit `practice_date_1` bis `practice_date_7` und `practice_note_1` bis `practice_note_7`; vorhandene Reflexionsfelder bleiben erhalten. Unicode-Schriften und ausfüllbare PDF-Felder werden weiter im vorhandenen PDF-Worker erzeugt.
- `homeworkFileName.ts`: kleiner Dateinamenshelfer ohne Laufzeitimport von PDF-/Schriftbibliotheken in die Hauptoberfläche.
- `homeworkTypes.ts`, `search.ts`, `SyncConflicts.tsx`, `clientExport.ts`: Validierung und Einbindung der optionalen Felder in bestehende Wege.
- `de.json`, `uk.json`, `homework.css`: vollständige zweisprachige Texte, vorhandene Hell-/Dunkel-Farben, 44-px-Bedienflächen und schmale Layouts.

Keine neuen NPM-Pakete, SQL-Migrationen, Modelle, Audiofunktionen oder Netzwerkdienste. Der bestehende E-Mail-/Telegram-Versand bleibt optional und unverändert konfigurierbar. Versand außerhalb der Ende-zu-Ende-verschlüsselten Ablage erfolgt weiterhin ausschließlich über die bereits dokumentierten, bewusst ausgewählten Kanäle.

### Prüfen

```sh
npm ci
npm test
npm run build
npm run test:e2e -- --workers=2 tests/browser/homework.spec.ts tests/browser/homework-files.spec.ts tests/browser/homework-polish.spec.ts tests/browser/a11y.spec.ts tests/browser/discussion.spec.ts tests/browser/release-safety.spec.ts
```

Die zusätzlichen Unit-Tests behandeln Fortschritt und Übergabenachweise, Datums-/Zeitzonenlogik, Entwurfsvalidierung, Sicherungs-Round-Trip, Erasure/CRDT-Konfliktvarianten, ausdrücklich bestätigte Feldkonflikte, Dateinamen sowie die optionalen deutschen und ukrainischen PDF-Felder.

Browserprüfungen behandeln unter anderem sofortiges Sperren nach Eingabe, Wiederaufnahme des verschlüsselten Entwurfs, Konfliktentscheidung, Filter, Vorschau, Sprachwechsel, optionale Protokollseite, direkten Rücklauf-Download und Barrierefreiheit bei 820 und 390 Pixeln in Hell/Dunkel. Der Safari-Workflow enthält die neuen Ansichten ebenfalls. Linux-WebKit ersetzt keine Prüfung auf einem echten iPad.

Der separate Versandtest benötigt die im vorhandenen CI-Workflow angegebenen **Test-Konfigurationswerte** und vollständig abgefangene Requests. Keine echten Nachrichten, Tokens oder Supabase-Projekte für Tests verwenden. Der Pages-Test prüft außerdem den Unterpfad `/Psychologie/` und Offline-Nutzung.

Diese Änderungen sind keine fachliche, rechtliche oder datenschutzrechtliche Prüfung der Praxissoftware oder der Aufgabeninhalte.

## Geänderte Dateien gegenüber 0.4.0

- `HANDOFF.md`
- `README.md`
- `docs/hausaufgaben-feinschliff.md`
- `package-lock.json`
- `package.json`
- `playwright.ipad.config.ts`
- `src/components/HomeworkFiles.tsx`
- `src/components/HomeworkReviewForm.tsx`
- `src/components/SyncConflicts.tsx`
- `src/components/homework.tsx`
- `src/homework.css`
- `src/lib/buildInfo.ts`
- `src/lib/clientExport.ts`
- `src/lib/homeworkFileName.ts`
- `src/lib/homeworkPdf.ts`
- `src/lib/homeworkReview.ts`
- `src/lib/homeworkTypes.ts`
- `src/lib/homeworkWorkflow.ts`
- `src/lib/prepareHomeworkPdf.ts`
- `src/lib/search.ts`
- `src/lib/useHomeworkReview.ts`
- `src/locales/de.json`
- `src/locales/uk.json`
- `tests/browser/homework-delivery.spec.ts`
- `tests/browser/homework-polish.spec.ts`
- `tests/browser/homework.spec.ts`
- `tests/browser/release-safety.spec.ts`
- `tests/homework-backup.test.ts`
- `tests/homework-file-name.test.ts`
- `tests/homework-pdf.test.ts`
- `tests/homework-workflow.test.ts`
