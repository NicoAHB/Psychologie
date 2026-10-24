# Anleitung direkt in der App

Stand: 24. Oktober 2026. Unter **Mehr → Anleitung** gibt es eine dauerhaft verfügbare Hilfe für den Praxisalltag. Sie ist der erste Eintrag unter „Mehr“; die fünf Hauptmenüpunkte bleiben erhalten.

## Was die Nutzerin sieht

- Einen kompakten, aufklappbaren Einstieg: **Termin anlegen → Termin abschließen → Zahlung erfassen**.
- Vier Bereiche: **Am Anfang**, **Im Praxisalltag**, **Sichern und weiterarbeiten**, **Zusätzliche Möglichkeiten**.
- 14 aufklappbare Themen mit nummerierten Schritten, einem praktischen Hinweis und Verlinkungen zu den vorhandenen Seiten.
- Eine eigene Suche über den öffentlichen Anleitungstext. Sie sucht gleichzeitig in DE und UA, sodass ein gefundener Abschnitt beim Sprachwechsel erhalten bleibt. Die globale Klientensuche über die Lupe bleibt getrennt.
- Direktzugänge zu den einzelnen Einstellungsbereichen, zur Warteliste sowie zu Klienten, Terminen, Zahlungen und den zusätzlichen Werkzeugen. Das Öffnen der Klientenliste zeigt auch pausierte Akten und verlässt ein zuvor gewähltes Profil.

Die Themen behandeln Einrichtung, Klientenanlage und Dublettenwarnung, Pause und Wiederaufnahme, Kalender/Urlaub/Ausfälle, Vorbereitung/Notizen/Sprach-Memos, Wiedervorlagen, Fragebögen, Dokumente/Kontaktverlauf, Zahlungen/Rechnungen/Währungen, Sicherung auf dem iPad, Gerätewechsel/Cloud, Darstellung/Suche/Aktualisierung, Einwilligungen/Nachrichten, Marketing/Empfehlungen und Videosprechstunde.

Die Anleitung erklärt auch die Grenzen vorhandener Funktionen: Versand und Video benötigen ihre bisherige Einrichtung; eine Dienstannahme ist keine Lesebestätigung; Sprach-Memos werden nicht transkribiert; In-App-Sicherung ersetzt keine externe Kopie; Klientenexporte sind lesbar; eine geschlossene App verarbeitet keine E-Mail-Erinnerungen oder Marketing-Kampagnen. Es wurden keine neuen Dienste hinzugefügt und keine bestehenden Funktionen geändert.

## Technische Übergabe für Claude

- `guide` ist ausschließlich ein `AppRoute` für die Darstellung. `Route` im Tresor-Datenmodell wurde nicht erweitert. Menü, aktiver „Mehr“-Zustand, Zurück-Knopf und Seitentitel nutzen die bestehende Navigation.
- `src/lib/guide.ts` enthält die 14 Themen und typisierte Navigationsziele. Die Texte selbst stehen ausschließlich in `src/locales/de.json` und `uk.json` (100 neue Schlüssel je Sprache).
- Die Suchtexte werden einmal aus beiden Wörterbüchern aufbereitet. `findGuideTopics()` verlangt alle Suchwörter, ignoriert Groß-/Kleinschreibung und Akzente und beschränkt die Suchanfrage auf 120 Zeichen. Die Suche erhält keine Tresor- oder Klientendaten.
- `src/pages/GuidePage.tsx` wird bei Bedarf geladen. Die bestehende Service-Worker-Erstellung nimmt JavaScript und CSS der Anleitung in die App-Shell auf; die Anleitung steht damit nach Installation auch offline zur Verfügung.
- Suchwort und geöffnete Themen liegen ausschließlich im React-Zustand. Kein neues localStorage, IndexedDB-Feld, Backup-Format oder Supabase-Schema.
- Alle neuen Aktionsknöpfe dienen der Navigation. Es werden dadurch keine neuen Formularspeicherungen, Importe oder Nachrichten ausgelöst. Das bisherige Verhalten und die bereits eingerichtete Automatik der Zielseiten bleiben erhalten.
- Die Themen verwenden echte Knöpfe mit `aria-expanded` und `aria-controls`. Gruppenverlinkungen setzen den Tastaturfokus auf die Zielüberschrift. Schritte behalten sichtbare Nummern; die helle/dunkle Darstellung verwendet vorhandene Farbvariablen und berücksichtigt die gerätelokale Schriftgröße.

## Geänderte Dateien

- `src/App.tsx`, `src/lib/navigation.tsx`, `src/pages/MorePage.tsx`
- Neu: `src/pages/GuidePage.tsx`, `src/lib/guide.ts`, `src/guide.css`
- `src/locales/de.json`, `src/locales/uk.json`
- Neu: `tests/guide.test.ts`, `tests/browser/guide.spec.ts`
- `tests/finance-navigation.test.ts`, `tests/browser/simple-workflow.spec.ts`, `tests/browser/a11y.spec.ts`, `tests/browser/pages.spec.ts`
- `playwright.ipad.config.ts`, `README.md`, `HANDOFF.md`, `docs/anleitung.md`

## Prüfen und veröffentlichen

```sh
npm test
npm run build
npm run test:e2e -- tests/browser/guide.spec.ts tests/browser/simple-workflow.spec.ts tests/browser/a11y.spec.ts
npm run test:ipad
```

Unit-Tests prüfen Navigation, vollständige Anleitungsinhalte in beiden Sprachen, typische Suchfragen, sprachübergreifende Suche und gültige Verlinkungen. Browserprüfungen prüfen Tastaturbedienung, Sprachwechsel mit Suchwort, Leerzustand, genaue Einstellungs-/Wartelisten-Ziele, unveränderte Akten, Offline-Neuladen und Axe/Lesbarkeit bei 820/390 Pixel mit großer Schrift. Die bestehende allgemeine Navigation und Barrierefreiheitsprüfung wurden erweitert. Auch der vorhandene Pages-Unterpfad-Test öffnet die Anleitung erstmals offline und wechselt die Sprache. Die Safari-CI führt die fünf neuen Szenarien ebenfalls aus; sie ersetzt keinen Test auf einem echten iPad.

Es sind keine neue NPM-Installation über das bestehende `npm ci` hinaus und keine manuelle Migration erforderlich. Veröffentlichung über den bisherigen GitHub-Pages-Workflow. Eine installierte PWA übernimmt den Stand über **Jetzt aktualisieren**.

Lokaler Prüfstand vor Veröffentlichung: **295 Unit-Tests bestanden**, Produktionsbuild erfolgreich. **30 unterschiedliche Browserfälle** für Anleitung, Navigation und Barrierefreiheit wurden geprüft; die zehn Anleitungsfälle einschließlich des kompakten Einstiegs wurden abschließend nochmals erfolgreich ausgeführt. 820-Pixel-Ansichten und die ukrainische Anleitung mit großer Schrift bei 390 Pixeln wurden zusätzlich visuell geprüft.
