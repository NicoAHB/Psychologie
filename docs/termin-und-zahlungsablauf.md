# Termine und Zahlungen: vereinfachte Bedienung

## Für die Nutzerin

Das Hauptmenü enthält **Heute, Klienten, Termine, Zahlungen und Mehr**. Unter
**Mehr** liegen Einstellungen, Newsletter, Kampagnen, Vorlagen-Verwaltung und
Empfehlungen. Von dort führt „Zurück zu Mehr“ wieder zur Werkzeugauswahl.

Der normale Ablauf ist:

1. Unter **Heute** oder **Termine** einen **Termin anlegen**.
2. Am Termin **Termin abschließen** wählen und Notizen, Anhänge, Sprach-Memos,
   Hausaufgaben und die Vorbereitung für den nächsten Termin festhalten.
3. Nach dem Abschließen ist die Zahlung automatisch **offen**. Der Hinweis
   **Zur Zahlung** führt direkt in den Zahlungsbereich.
4. Nach Eingang des Geldes unter **Zahlungen → Offen → Als bezahlt markieren**
   das tatsächliche Zahlungsdatum bestätigen. Dieses Datum bestimmt die Einnahmen.

**Termin nachtragen** steht als Nebenaktion bei **Termine** und weiterhin im
Klientenprofil bereit, wenn ein vergangener Termin nicht im Kalender steht.
Beim Nachtragen oder Bearbeiten bleibt auch die bisherige direkte Zahlungserfassung
erhalten. Beim normalen Abschließen wird sie bewusst erst im Zahlungsbereich angeboten.

**Heute** trennt Termine und Zahlungen in zwei Blöcke, mit je einer Hauptaktion.
Heutige Termine einschließlich abgeschlossener Termine stehen vor den nächsten
geplanten Terminen. Überfällige Rechnungen und Hinweise auf noch zu erstellende
Rechnungen stehen im Zahlungen-Block. „Im Blick behalten“ enthält die ausstehenden
Dokument-Rückläufe; Wiedervorlagen und Entwürfe bleiben erreichbar.

**Zahlungen** zeigt zuerst die offenen Posten aus allen Jahren. Stornierte Beträge
erscheinen weiterhin nicht als offene Forderungen. Danach folgen Einnahmen,
Diagramm, Zahlungshistorie einschließlich Rücknahme eines Zahlungseingangs,
CSV-Export und Rechnungen mit ihren bisherigen Versand-/Korrekturfunktionen.
Zahlungshistorie und CSV-Export lassen sich gemeinsam aufklappen; beim Öffnen
über eine gezielte Monats-/Offen-Verknüpfung ist dieser Bereich bereits geöffnet.
Die Verknüpfungen für Monatseinnahmen und offene Beträge bleiben erhalten.

## Technische Übergabe an Claude

- `src/lib/navigation.tsx`: fünf Hauptziele und eine separate erweiterbare Liste
  für „Mehr“. `AppRoute` ergänzt ausschließlich den UI-Zustand; `Route` und
  interne Route `finances` bleiben erhalten.
- `src/components/Today.tsx`: Startseite ohne große Willkommenskarte. Gruppierung
  nach dem Datum in der Praxis-Zeitzone; begrenzte Listen mit Links zur Gesamtansicht.
- `src/App.tsx`: Mehr-Übersichtsseite, gemeinsame Aktionen und Zahlungsbereich mit
  begrenzter Offen-Liste. Die darunterliegende Historie behält Jahres-/Statusfilter;
  Dashboard-Verknüpfungen können weiterhin gezielt Monatseinnahmen/offene Posten zeigen.
- `appointments.tsx` und `forms.tsx`: Nachtragen als Nebenaktion; Abschlussdialog
  verwendet die vorhandene Speicherung und setzt beim neuen Abschluss den
  Formularzustand auf unbezahlt. `onSaved` meldet ausschließlich den UI-Erfolg.
- `follow-up.tsx`: dieselben Rechnungsaktionen als wiederverwendbare
  `OverdueInvoiceList`; Dokument-Rückläufe bleiben im `FollowUpBoard`.
- `WorkBoard.tsx`: Rechnungsaufgaben werden nur in der Darstellung getrennt.
  Die Ableitung in `workItems.ts` bleibt unverändert.
- `client-profile.tsx`: Termin anlegen ist die hervorgehobene Profilaktion;
  Nachtragen und alle anderen Aktionen bleiben vorhanden.
- `workflow.css`: zusätzliche responsive Regeln verwenden die bestehenden
  Farb-/Glasvariablen. Bestehende Kalender-/Rechnungsregeln bleiben erhalten.
- Beide Wörterbücher verwenden „Termin“, „Zahlung“, „Rechnung“ beziehungsweise
  „зустріч“, „оплата“, „рахунок“. Bestehende frei eingegebene Texte und bereits
  gespeicherte Rechnungspositionen werden nicht umgeschrieben.

**Keine Änderung** an Datenmodell, Formaten, Schlüsseln, Verschlüsselung,
Sicherungen, Synchronisation oder Supabase; keine Migration und keine neuen Pakete.
Alte Rechnungen behalten ihre gespeicherten Bezeichnungen. Die neue Standardleistung
„Beratungstermin“/„Консультаційна зустріч“ gilt für neu erzeugte Rechnungen.

## Prüfungen

```sh
npm test
npm run build
npm run test:e2e -- --workers=1
# Für WebKit mit installiertem Browser; CI nutzt den vorhandenen Playwright-Container:
npm run test:ipad
# GitHub-Pages-Unterpfad:
VITE_BASE_PATH=/Psychologie/ npm run build
VITE_BASE_PATH=/Psychologie/ PLAYWRIGHT_PORT=4256 npx playwright test tests/browser/pages.spec.ts --workers=1
```

Die Browser-Tests verwenden ausschließlich erfundene Daten. Die neue Ablaufprüfung
kontrolliert beide Sprachen, alle Mehr-Ziele, 820-px-/Telefonlayout, getrennte
Startseitenblöcke, Abschluss → offene Zahlung → Zahlungseingang → Neuladen sowie
manuelles Nachtragen. Ein eigener Fall prüft den Tageswechsel zwischen UTC und
der Praxis-Zeitzone Berlin. Axe prüft die neuen Ansichten und den Abschlussdialog in
beiden Farbschemata. Bestehende Zahlungs-, Rechnungs-, Sicherungs- und Memo-Tests
wurden auf die neuen Beschriftungen und Navigation über Mehr umgestellt.
WebKit unter Linux ersetzt keinen Gerätetest auf einem echten iPad.

## Vollständige Liste der geänderten Dateien

- `CLAUDE.md`
- `HANDOFF.md`
- `README.md`
- `docs/termin-und-zahlungsablauf.md`
- `playwright.ipad.config.ts`
- `src/App.tsx`
- `src/components/Today.tsx`
- `src/components/WorkBoard.tsx`
- `src/components/appointments.tsx`
- `src/components/client-profile.tsx`
- `src/components/follow-up.tsx`
- `src/components/forms.tsx`
- `src/lib/navigation.tsx`
- `src/locales/de.json`
- `src/locales/uk.json`
- `src/workflow.css`
- `tests/browser/a11y.spec.ts`
- `tests/browser/app.spec.ts`
- `tests/browser/appearance.spec.ts`
- `tests/browser/audio-memos.spec.ts`
- `tests/browser/backup.spec.ts`
- `tests/browser/calendar.spec.ts`
- `tests/browser/clinical.spec.ts`
- `tests/browser/currency.spec.ts`
- `tests/browser/discussion.spec.ts`
- `tests/browser/improvements.spec.ts`
- `tests/browser/invoice-delivery.spec.ts`
- `tests/browser/invoice.spec.ts`
- `tests/browser/local-platform.spec.ts`
- `tests/browser/memo-labels.spec.ts`
- `tests/browser/pages.spec.ts`
- `tests/browser/practice-updates.spec.ts`
- `tests/browser/practice-workflow.spec.ts`
- `tests/browser/records.spec.ts`
- `tests/browser/security.spec.ts`
- `tests/browser/simple-workflow.spec.ts`
- `tests/browser/workflow-fixture.ts`
- `tests/browser/workflow.spec.ts`
- `tests/finance-navigation.test.ts`
- `tests/invoice.test.ts`
- `tests/memo-labels.test.ts`
