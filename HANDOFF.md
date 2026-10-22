# Weiterarbeit am Tablet

## Wo liegt der Stand?

- Repository in dieser Cloud-Aufgabe: `/workspace/Psychologie`
- Lokaler Entwicklungsbranch: `codex/praxisraum-foundation`
- **Aktueller GitHub-Stand:** `main` enthält die veröffentlichte App und ist die Grundlage für die Weiterarbeit auf einem anderen Gerät. Der lokale Entwicklungsbranch heißt `codex/praxisraum-foundation`.
- Programmcode und Tests werden lokal committed. Ein Projekt-ZIP und ein selbstständiges Git-Bundle werden zusätzlich unter `/workspace` erzeugt. Sie enthalten keine echten Praxisdaten oder Zugangsdaten.

Öffne diesen Chat auf dem Tablet, um die bestehende Aufgabe fortzusetzen. Für eine unabhängige neue Aufgabe oder Codespaces den aktuellen GitHub-Stand oder das Projektarchiv verwenden. Eine langfristige Wiederherstellung lokaler Commits allein aus einem neuen Cloud-Task ist nicht zugesichert.

## GitHub und App-Veröffentlichung

Die Quellcode-Veröffentlichung funktioniert. Die App-Veröffentlichung ist getrennt davon: Der Workflow `.github/workflows/pages.yml` baut den Unterpfad `/Psychologie/` und veröffentlicht über GitHub Pages. Unter **Settings → Pages** einmalig die Quelle **GitHub Actions** wählen. Einen eventuell vor Aktivierung fehlgeschlagenen Lauf unter **Actions → Publish Praxisraum** erneut starten. Erst ein erfolgreicher Deploy-Lauf bestätigt den Live-Link `https://nicoahb.github.io/Psychologie/`.

GitHub-Zugriff und Pages sind inzwischen eingerichtet; Änderungen auf `main` lösen den Build-/Deploy-Workflow aus. Die früher während der Umgebungseinrichtung aufgetretene Netzwerksperre ist für die aktuelle Weiterarbeit behoben. Repository-Sichtbarkeit und Hostingtarif wurden nicht verändert.

## Starten und prüfen

```sh
npm ci
npm test
npm run build
npm run dev
```

`npm run test:e2e` verwendet standardmäßig `/usr/bin/chromium`. Auf anderen Geräten zuerst `npx playwright install chromium`, dann `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=bundled npm run test:e2e`.

Die App startet mit einem deutschen Einrichtungs-/Sperrbildschirm. „Mit Beispieldaten entdecken“ öffnet eine vollständig lokale Demo. Für echte eigene Daten eine neue, mindestens zwölf Zeichen lange Tresor-Passphrase wählen und separat sicher aufbewahren. Ein verschlüsseltes Backup vor jedem Gerätewechsel exportieren.

## Was ist umgesetzt?

DE/UA-Wechsel, AES-GCM-Tresor in IndexedDB, Klienten mit verschlüsselten Profilbildern, Sitzungsvorbereitung, Termine, Sitzungs- und Fotonotiz-Timeline mit Tags, bezahlte/offene Sitzungen, monatliche Einnahmen nach Zahlungseingang mit Vormonatsvergleich, Jahresauswahl, vollständige verschlüsselte Backups, PWA-App-Shell und Offlinebetrieb.

Supabase-Schema mit RLS, Revisionsprüfung und privatem Bildspeicher sowie ein separater Node-Telegram-Worker sind im Repository. Der Erinnerungsplan wird im Browser zeitzonenkorrekt verschlüsselt. Telegram-Nachrichten selbst sind nicht Ende-zu-Ende-verschlüsselt; ein kostenloser Cron-Dienst garantiert keine minutengenaue Zustellung. Weitere Einzelheiten und Einrichtungsschritte stehen in README.md.

## Externe Einrichtung steht aus

Es wurden keine Supabase- oder Telegram-Zugangsdaten bereitgestellt. Die lokale App benötigt sie nicht. Für Live-Synchronisation bzw. Zustellung müssen die in `.env.example` und README genannten eigenen Projekte, Schlüssel und Actions-Secrets eingerichtet werden. Der Erinnerungs-Cron ist absichtlich bis zur Konfiguration deaktiviert. Live-Synchronisation und Bot-Zustellung wurden ohne echte Zugangsdaten nicht getestet; die Pages-App funktioniert davon unabhängig.

## Ursprünglicher Prüfstand der Einrichtung (historisch)

- 87 Funktions-/Datenbanktests bestanden (inklusive tatsächlicher PostgreSQL-Ausführung über PGlite, Kontentrennung/RLS, Worker-Kryptografie, Zeitzonen-Abgleich mit der Temporal-Referenz, Lösch-/Konfliktlogik und einem simulierten Supabase-Client für den Bild-Sync).
- 26 Chromium-Browserprüfungen bestanden (Desktop und emuliertes Smartphone; Passkey-Test mit virtuellem Authenticator und Auto-Backup-Test laufen nur auf dem Desktop) plus 2 für den GitHub-Pages-Pfad: vollständiger Workflow einschließlich Bild-Upload und zweitem Browserprofil, Bearbeiten/Löschen inkl. Bildentfernung ohne CSP-Verletzung, Demo/Navigation sowie automatische Sperre.
- Saubere Installation per `npm ci` und Produktionsbuild bestanden; PWA funktioniert bei Offline-Neuladen.
- Produktionsabhängigkeiten: `npm audit --omit=dev` meldete keine Schwachstellen.
- Supabase und Telegram wurden nicht mit echten Zugangsdaten getestet. Der Smartphone-Test emuliert Chromium; ein separater Test auf einem echten iPad/Safari steht aus.
- `install_script` und `start_skill` sind als Cloud-Konfigurationsentwurf gespeichert. Die Umgebung wurde nicht veröffentlicht. Entwurf in den Umgebungseinstellungen prüfen und speichern, anschließend über die Oberfläche veröffentlichen. Ein solcher Snapshot ersetzt wegen der Einschränkungen lokaler Commits keinen verifizierten GitHub-Push.

## Qualitätsdurchgang (Fehlerprüfung und Feinschliff)

- Strengere TypeScript-Prüfung (`noUnusedLocals`, `noUnusedParameters`); ungenutzter Code entfernt. Die Meldung zum dauerhaften Speicher in den Geräteeinstellungen wurde nie angezeigt und erscheint jetzt.
- **Update-Ablauf:** `src/lib/updates.ts` meldet einen wartenden Service Worker, `UpdateBanner` bietet „Jetzt aktualisieren“ an (speichert vorher, lädt danach neu). Der Worker (`scripts/build-sw.mjs`) reagiert auf `SKIP_WAITING`. Test: `tests/browser/update.spec.ts` startet einen eigenen kleinen Server und liefert eine zweite Worker-Version aus.
- **Absturzseite:** `ErrorBoundary` statt leerer Seite (zweisprachig, kein Datenverlust).
- **Barrierefreiheit:** Kontraste in Hell- und Dunkelmodus korrigiert (axe-core, WCAG 2.1 AA), Sprunglink, Seitentitel je Bereich. Test: `tests/browser/a11y.spec.ts` (alle Hauptansichten, Wochenansicht, Termin- und Sitzungsformular; Desktop und Handy; hell und dunkel). Neue Farben bitte nicht unter 4,5 : 1 wählen.
- Zahlungsliste in Finanzen: 100 Zeilen pro Seite mit „Weitere anzeigen“.
- Aktualisiert: Nur die reguläre lateinisch-kyrillische PDF-Basisschrift wird vorab geladen (137 KB); weitere Schriftdateien liegen im Runtime-Cache. Erstes Offline-PDF nutzt bei Bedarf die reguläre Schrift auch für fette Texte. Weitere unterstützte Alphabete werden online bei Bedarf nachgeladen. Details und neue Funktionen: `docs/performance-und-sicherung.md`.

## Performance und Sicherung (Oktober 2026)

Schrift-Subsets und Runtime-Cache, Playwright-Browsercache, atomare verschlüsselte In-App-Checkpoints einschließlich Dateiaufbewahrung, Sperrzeit bis 90 Minuten, lokal geprüfter und bestätigter PHQ-9-/GAD-7-Rücklauf, lesbarer Klienten-ZIP-Export und NBU-Kurscache sind implementiert. Der Telegram-Worker verwendet pro Empfänger einen gesicherten Versandbeginn, Claim-Token und einen Zustand für unklare Zustellungen. Vor dessen Einsatz alte Worker anhalten und das ergänzte `supabase/schema.sql` im eigenen Projekt ausführen. Anleitung und Grenzen: [Performance und Sicherung](docs/performance-und-sicherung.md). Es wurden keine echten Nachrichten verschickt.

## Neue lokale Werkzeuge und Videosprechstunde

Feldweiser kausaler Offline-Abgleich mit Konfliktprüfung, ein lokaler Crypto-/PDF-Worker, rollierende Ordnersicherung (30 verschlüsselte Dateien) und eine optionale direkte WebRTC-Sprechstunde mit verschlüsseltem Supabase-Signaling sind integriert. Einrichtung, Dateiliste und Grenzen: [Lokale Werkzeuge und Video](docs/lokale-werkzeuge-und-video.md). Für Video ist die separate additive Migration `supabase/video.sql` nötig. Im verwalteten Arbeitsbereich sind keine Supabase-Zugangsdaten hinterlegt; die Migration wurde deshalb nur gegen lokales PostgreSQL/PGlite geprüft und nicht in einem echten Praxisprojekt ausgeführt.

Die frühere Offline-Diktierfunktion (Whisper tiny) wurde entfernt, weil sie Deutsch und Ukrainisch zu schlecht erkannte; empfohlen wird das Tastatur-Diktat des Geräts.

Die aktuellen Prüfungen und die Umsetzung der Sprach-Memos stehen im folgenden Abschnitt. Frühere Tests für Spracherkennung/Modelle wurden zusammen mit der Diktierfunktion entfernt; sie sind kein Bestandteil der aktuellen App.

Der Sync verwendet jetzt explizit zusammengehörige gespeicherte Akten-/Datei-Snapshots. Ein zusätzlicher Browser-Regressionstest prüft gleichzeitige Schreibvorgänge trotz veralteter React-Ansicht. Playwright-Browser werden nach tatsächlicher Browser-Revision statt jeder Paketänderung gecacht; vorhandene ältere Cache-Schlüssel bleiben als sicher nachinstallierter Fallback nutzbar.

## Sprach-Memos pro Sitzung (22. Oktober 2026)

Grundlage ist Claudes aktualisierter `main`-Stand `10a8b90`, einschließlich der Entfernung der Diktierfunktion. Die Erweiterung enthält **keine KI, Spracherkennung, Transkription, Modelle, neuen Worker oder zusätzlichen Abhängigkeiten**.

- Neue und bearbeitete Sitzungen sowie jede Sitzung unter „Besprochen“ erlauben mehrere Memos. MediaRecorder erkennt MP4/WebM/Ogg; Mikrofon nur nach Klick, maximal 20 Minuten/25 MiB, Timer, Stopp, Verwerfen und Wiederholen.
- Bestehendes AES-GCM-Dateiformat; nur RAM bis zum Speichern. Metadaten mit Bezeichnung, Zeitpunkt, Dauer und manueller Kurzfassung (2000 Zeichen) bleiben im verschlüsselten Tresor. Die Kurzfassung steht über dem Player, als Auszug im Verlauf und in Strg/Cmd+K. Im Überblick steht die Memo-Anzahl.
- Player mit Pause, Tastatur-Positionsregler und 1×/1,5×/2×. Blob-URLs werden beim Schließen/Sperren widerrufen. Aufnahme und Wiedergabe enden synchron vor dem Warten auf ausstehende Speicheroperationen.
- Backups/Import, Dateiverweise, Cloud-Sync, CRDT und lesbarer Klienten-ZIP-Export sind angebunden. Gelöschte Memos werden endgültig aus verschlüsselten Verlaufspunkten und verborgenem Konfliktinhalt entfernt. Ein Journal aus opaken Datei-IDs setzt unterbrochene Bereinigungen beim Entsperren fort. Alte Sicherungsdateien außerhalb der App bleiben unverändert. Fotos und andere Notizen behalten ihre bisherige Wiederherstellungsmöglichkeit.
- Alte Tresore/Sicherungen erhalten `audioMemos: []`; kein neues Backup-Format. CSP und Mikrofon-Policy reichten bereits aus und wurden nicht erweitert. Der Service Worker schließt Audio explizit vom Caching aus.

Für optionalen Cloud-Sync `supabase/schema.sql` im eigenen Projekt erneut ausführen: Der weiterhin private JSON-Bucket erlaubt jetzt 40 MiB pro verschlüsselter Datei (25 MiB Audio werden durch Base64 größer). Eine Live-Migration wurde mangels Zugangsdaten nicht ausgeführt.

Prüfung: sauberes `npm ci`, 172 Unit-/PostgreSQL-Tests sowie vollständiger Browserlauf mit 93 bestandenen aktiven Prüfungen; bedingte Anbieter-/Plattformtests ausgelassen. Zusätzlich bestanden alle 6 Prüfungen für `/Psychologie/`, einschließlich Offline-PDF und Offline-Memo-Wiedergabe unter der Produktions-CSP. axe prüft Recorder, Vorschau, Player und Kurzfassung in Hell/Dunkel. Portrait-Layouts bei 820/390 px sind geprüft. Browseraufnahmen verwenden ausschließlich gefälschte MediaRecorder-/getUserMedia-APIs und drei Sekunden synthetischen Ton; echter iPad/iPhone-Safari-Mikrofontest bleibt erforderlich. Einzelheiten, Dateiliste und Bedienung: [Sprach-Memos](docs/lokale-werkzeuge-und-video.md#sprach-memos-ohne-spracherkennung).
