# Aufgaben leichter öffnen – 0.5.1

## Was sich in der Bedienung ändert

- In der Aufgabenbibliothek öffnet ein Tipp auf die ganze Karte die Vorschau – auch auf Beschreibung und freie Flächen. Erst **Aufgabe zuweisen** vergibt die Aufgabe tatsächlich.
- Im Klienten-Überblick öffnet die ganze Aufgabenzeile den zugehörigen Aufgabenverlauf.
- **Favorit**, **Bisheriger Verlauf**, **Bearbeiten**, **Archivieren/Wiederherstellen**, **Kopieren** und **Erledigt / besprochen** behalten ihre eigene Aktion. Sie öffnen nicht versehentlich die Aufgabe.
- Ein Pfeil und ein sichtbarer Tastaturfokus verdeutlichen, welche Karten sich öffnen lassen. Enter und Leertaste funktionieren wie bei normalen Schaltflächen.
- Beim Öffnen der Vorschau liegt der Tastaturfokus auf dem Aufgabentitel. **Zurück** bringt ihn wieder zur zuvor gewählten Karte. Nach dem Schließen einer zugeteilten Aufgabe erhält die passende Aufgabenzeile den Fokus; falls ein aktiver Filter diese ausblendet, das Suchfeld.
- Archivierte eigene Vorlagen sind ausdrücklich gekennzeichnet. Sie lassen sich weiter bearbeiten und wiederherstellen; eine Zuteilung ist erst nach dem Wiederherstellen möglich.
- Die Liste zugeteilter Aufgaben bietet **Filter zurücksetzen**. Eine Suche ohne Treffer meldet fehlende Treffer statt fälschlich eine leere Klientenakte anzuzeigen.
- Erfolgreich erneut versuchte Favoriten-/Archivaktionen behalten keine alte Fehlermeldung.

Die Texte und zugänglichen Beschriftungen sind in Deutsch und Ukrainisch hinterlegt. Vorhandene Aufgaben, PDFs, Rückläufe und verschlüsselte Entwürfe bleiben erhalten. Keine neuen Datenfelder, NPM-Pakete, externen Dienste oder SQL-Migrationen.

## Für Claude und die weitere Entwicklung

Die ganze Kartenfläche wird über das Pseudoelement eines **nativen Buttons** (`.hw-card-open::after`) geöffnet. Die Karte selbst bekommt keinen zweiten Click-/Tastaturhandler; die Buttons sind nicht ineinander verschachtelt. `.hw-click-card` begrenzt die Fläche. Sekundäre Aktionen liegen mit `.hw-card-action` bzw. den vorhandenen Überblicksaktionen darüber. Neue Kartenaktionen müssen ebenfalls diese Klasse verwenden, damit die Hauptaktion ihre Klicks nicht abfängt. Bei deaktivierten Karten wird die zusätzliche Klickfläche entfernt.

Die Fokusziele werden anhand der stabilen Aufgabenkennungen in React-Refs gemerkt. Das funktioniert auch dann, wenn Favoriten die Reihenfolge verändern oder der Klienten-Überblick beim Öffnen zum Aufgabenreiter wechselt. Die vorhandene Modal-Komponente und deren Portal bleiben unverändert.

Die Änderungen betreffen die Oberfläche. Verschlüsselung, Synchronisation, CRDT, Sicherungen, Datenmodell und Versand sind unverändert. Die ursprüngliche technische Übergabe bleibt unter [Hausaufgaben](hausaufgaben-claude.md), der Stand 0.5.0 unter [Hausaufgaben-Feinschliff](hausaufgaben-feinschliff.md) dokumentiert.

## Prüfung

```sh
npm test
npm run build
npm run test:e2e -- --workers=2 tests/browser/homework-cards.spec.ts tests/browser/homework.spec.ts tests/browser/homework-files.spec.ts tests/browser/homework-polish.spec.ts tests/browser/a11y.spec.ts tests/browser/discussion.spec.ts
```

Die Suchprüfungen warten auf die fertige Ergebnisliste und `aria-busy="false"`, bevor sie eine bestimmte Karte prüfen; so wird die bewusst verzögerte Suche auch unter Safari korrekt berücksichtigt.

Die neuen Browserprüfungen tippen ausdrücklich in die freie Kartenecke, testen echte Touch-Eingaben im Mobilprojekt, separate Favoriten-/Verlaufs-/Kopier-/Erledigt-Aktionen, Enter/Leertaste, Fokus nach Zurück/Schließen, Filter-Reset, archivierte Vorlagen und die Wiederholungswarnung. Axe und Layoutprüfungen laufen in Deutsch/Ukrainisch, Hell/Dunkel sowie bei 820/390 Pixeln. Die neuen Ansichten sind außerdem im vorhandenen Safari-Workflow eingetragen. Es werden nur synthetische Testakten verwendet.

## Geänderte Dateien

- `HANDOFF.md`
- `README.md`
- `docs/aufgaben-bedienung.md`
- `package-lock.json`
- `package.json`
- `playwright.ipad.config.ts`
- `src/components/homework.tsx`
- `src/homework.css`
- `src/lib/buildInfo.ts`
- `src/locales/de.json`
- `src/locales/uk.json`
- `tests/browser/homework-cards.spec.ts`
- `tests/browser/release-safety.spec.ts`
