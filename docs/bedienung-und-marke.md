# Einfachere Bedienung und Nadiia-Marke – Version 0.6.0

Technische Übergabe für Claude und Beschreibung für die Praxis. Basis ist Version 0.5.1; vorhandene Funktionen und der Termin-/Zahlungsablauf bleiben erhalten.

## Was sich für die Nutzerin ändert

1. **Heute** bietet einen kurzen Weg zur bestehenden Anleitung: Termin anlegen → Termin abschließen → Zahlung erfassen. Die Anleitung lässt sich direkt darüber öffnen.
2. **Klienten** lassen sich nach Name oder E-Mail suchen, auch mit mehreren Wörtern, anderer Großschreibung oder ohne Akzente. Der gewählte Statusfilter bleibt bestehen. Passende pausierte oder abgeschlossene Akten werden mit einem Hinweis auffindbar; „Alle passenden Klienten anzeigen“ öffnet diese Auswahl ausdrücklich. „Auswahl zurücksetzen“ leert die Suche und zeigt wieder aktive Klienten. Es entsteht keine neue Akte und kein Status wird automatisch geändert.
3. **Termine** zeigen die zwei häufigen Abschlusswege direkt. Die selteneren Aktionen stehen unter **Weitere Aktionen** mit ausgeschriebenen Beschriftungen: Bearbeiten, E-Mail, Bestätigung kopieren, Kalenderdatei, Ausfall und Absage. Der Knopf lässt sich auch mit der Tastatur öffnen. Bei einer Absage erscheint die Bestätigung erst nach erfolgreichem Speichern; Fehler werden angezeigt.
4. **Mehr** ordnet dieselben sechs Werkzeuge in zwei Gruppen: **Praxis & Hilfe** und **Nachrichten & Empfehlungen**. Die fünf Hauptmenüpunkte bleiben unverändert.
5. Die gewählte Marke **Nadiia – The Confidence Space** erscheint vollständig auf dem Start-/Sperrbildschirm und kompakt in der Seitenleiste. Der Sprachwechsel betrifft weiterhin alle Bedienoberflächen auf Deutsch/Ukrainisch. Die englische Markenbezeichnung bleibt dabei gleich. Alle fünf Originalentwürfe sowie das fertige deutsche und englische Logo liegen in [branding/](branding/README.md).

## Technische Hinweise

- `clientDirectory.ts` erstellt einen wiederverwendbaren Suchindex mit der vorhandenen `fold`-Normalisierung. Mehrere Suchwörter müssen alle in Name/E-Mail vorkommen. Die Ergebnisliste bleibt auf zunächst 50 Einträge begrenzt; größere Listen lassen sich erweitern. `useDeferredValue` hält die Eingabe reaktionsfähig und sperrt vorübergehend veraltete Treffer. Terminanzahlen werden einmal pro Datenänderung berechnet.
- `moreNavigation` bleibt der flache Routen-Katalog. Jedes Werkzeug hat zusätzlich eine Gruppe; `moreNavigationGroups` steuert Reihenfolge, Überschriften und Hilfetexte. Die bestehenden Routen und Links bleiben gültig.
- `cancelScheduledAppointments` prüft im aktuellen Update-Entwurf erneut, welche ausgewählten Termine noch geplant sind. Bereits abgeschlossene, abgesagte oder ausgefallene Termine werden nicht überschrieben. Ohne zulässigen Termin schlägt die Aktion vor Änderungen fehl. Frei gewordene zukünftige Zeitfenster werden weiterhin über das vorhandene `releaseSlot` erfasst. Die Funktion nutzt ausschließlich bestehende Termin-/Wartelistenfelder.
- `Logo` bindet lokale Bilddateien mit `new URL(..., import.meta.url)` ein. Kein statischer PNG-Import im gemeinsamen UI-Modul: Dieses Modul wird auch durch Node-Unit-Tests importiert, deren Loader keine PNG-Dateien ausführt.
- Die vollständige englische Grafik ist das unveränderte freigegebene Original. CSS begrenzt nur den sichtbaren hellen Rand auf ein horizontales Logoformat. Die kompakte Darstellung setzt den Markennamen als anpassbaren Text; lange Zeilen dürfen umbrechen. Sie ist keine neue Spracheinstellung.

## Daten und bewusst unveränderter Umfang

Keine neue Datenmodell-Version, keine SQL-Migration, keine zusätzliche NPM-Abhängigkeit. Verschlüsselung, Synchronisation, Sicherungen, Import, Akten und Rechnungsberechnung bleiben unverändert. Suchindex und Filter sind flüchtiger Oberflächenzustand. Die Absage nutzt den bestehenden verschlüsselten `vault.update`-Pfad. Kein echter E-Mail-/Telegram-Versand, kein echtes Supabase-Projekt und keine realen Patientendaten wurden für Tests verwendet.

Kein neuer Klienten-Login, keine Online-Buchungsseite und keine Audio-/KI-Funktion. Die App-Marke überschreibt keine Praxis-Stammdaten oder Rechnungen. Die ursprüngliche Bezeichnung der Software „Praxisraum“ und die bestehenden technischen Kennungen bleiben erhalten. Namen/Logo und die Software sind nicht durch diese Arbeit rechtlich oder datenschutzrechtlich geprüft.

## Prüfung

Vor der Veröffentlichung ausführen:

```sh
npm test
npm run build
npm run test:e2e -- --workers=2 tests/browser/app-usability.spec.ts tests/browser/a11y.spec.ts tests/browser/phase-a.spec.ts tests/browser/phase-b.spec.ts tests/browser/simple-workflow.spec.ts tests/browser/calendar.spec.ts tests/browser/guide.spec.ts tests/browser/calm-dashboard.spec.ts tests/browser/client-duplicates.spec.ts tests/browser/client-address.spec.ts tests/browser/release-safety.spec.ts tests/browser/appearance.spec.ts
VITE_BASE_PATH=/Psychologie/ npm run build
VITE_BASE_PATH=/Psychologie/ npm run test:e2e -- --workers=2 tests/browser/pages.spec.ts
```

Root- und GitHub-Pages-Builds nacheinander prüfen; nicht während laufender Browser-Tests den Build austauschen. Die bestehende Safari-CI führt zusätzlich die neuen Ansichten auf iPad/iPhone mit WebKit aus.

Neue Unit-Tests prüfen die Suchnormalisierung, Statusfilter, unveränderte Klientenakten, sichere Terminabsagen und unveränderte abgeschlossene Termine. Der Navigationstest prüft die vollständige Gruppenzuordnung ohne doppelte/verlorene Werkzeuge. Neue Browser-Tests prüfen 390/820 Pixel, Hell-/Dunkelmodus, Deutsch/Ukrainisch, Logo-Datei und Abstand zu Bedienelementen, Tastaturbedienung, Suche nach früheren Klienten, alle sechs Terminaktionen, Bestätigungsabbruch/-speicherung sowie axe und horizontales Überlaufen. Vorhandene Tests für Termin-E-Mail und Warteliste öffnen nun zuerst „Weitere Aktionen“.

## Geänderte Dateien

- `README.md`, `HANDOFF.md`, dieses Dokument und `docs/branding/README.md`
- `docs/branding/nadiia-logo-de.png`, `nadiia-logo-en.png`, `nadiia-symbol-transparent.png` sowie fünf PNGs unter `docs/branding/original-entwuerfe/`
- `package.json`, `package-lock.json`, `src/lib/buildInfo.ts` – nur App-Version 0.6.0, keine Paketänderungen
- `src/App.tsx`, `src/main.tsx`, `src/usability.css`
- `src/components/ui.tsx`, `src/components/Welcome.tsx`
- `src/assets/nadiia-mark.png`, `src/assets/nadiia-logo-en.png`
- `src/lib/clientDirectory.ts`, `src/lib/appointmentActions.ts`, `src/lib/navigation.tsx`
- `src/pages/TodayPage.tsx`, `ClientsPage.tsx`, `AppointmentsPage.tsx`, `MorePage.tsx`
- `src/locales/de.json`, `src/locales/uk.json`
- `tests/client-directory.test.ts`, `tests/appointment-actions.test.ts`, `tests/finance-navigation.test.ts`
- `tests/browser/app-usability.spec.ts`, `phase-b.spec.ts`, `calendar.spec.ts`, `records.spec.ts`, `release-safety.spec.ts`
- `playwright.ipad.config.ts`
