# Weiterarbeit am Tablet

Neu: **E-Mail-Versand direkt in der App einrichten** unter **Mehr → Einstellungen → E-Mail-Versand**, mit dauerhaft gespeichertem Absender, geschütztem Anbieter-Schlüssel und freiwilliger Testmail an die eigene Konto-Adresse. Jetzt auch **Gmail ohne eigene Domain**, mit eigener Google-Apps-Script-Freigabe statt Google-Passwort; Resend bleibt auswählbar. Die einmalige Supabase-Freigabe bleibt erforderlich. [Gmail einrichten / Übergabe für Claude](docs/gmail-versand.md). [Einrichtung, Grenzen und technische Übergabe für Claude](docs/email-einrichtung-in-der-app.md).

Neu: **Mehr → Anleitung** bietet einen einfachen Einstieg, 14 aufklappbare Themen, eine deutsch/ukrainische Suche und direkte Verlinkungen zu den passenden Bereichen. Die Anleitung funktioniert auch offline. [Bedienung und technische Übergabe](docs/anleitung.md).

Neu: **Mehrere Wiedervorlagen**, lokale **Dublettenhinweise mit ausdrücklicher Bestätigung vor dem Speichern** bei der Klientenanlage, **Rechnungsprüfung** mit direkter Stammdatenbearbeitung und ein gemeinsamer **Kontaktverlauf** im Klientenprofil. Bestehende Akten und Sicherungen bleiben kompatibel. [Bedienung, Grenzen, Dateiliste und technische Übergabe für Claude](docs/praxisorganisation-und-kontaktverlauf.md).

Neu: Wiedervorlagedatum mit eigenem Knopf löschbar; der Bereich ist auch für Safari mit großer Schrift in getrennte Zeilen gegliedert und bietet sieben optionale Gründe plus eigene Notizen. Getrennte Klienten-Adressfelder mit deutscher/ukrainischer Reihenfolge, optionaler Oblast und sicherem Erhalt älterer Freitextanschriften. [Bedienung, Datenerweiterung und technische Übergabe](docs/klientenanschrift-und-wiedervorlage.md).

Neu: **Praxisabläufe A–C**: Einrichtungs-Checkliste, Direktabschluss mit Zahlung/Zahlart, lokale Schriftgröße, Hilfen, Ausfälle mit optionalem Honorar, separate Einwilligung für Termin-E-Mails mit Kalenderdatei, Warteliste, Jahresübersicht nach Währung und Sicherungs-Assistent. Die Seiten liegen in `src/pages/`; globale Tresor-/Routensteuerung bleibt in `App.tsx`. [Bedienung, technische Übergabe für Claude, Grenzen und vollständige Dateiliste](docs/praxisablaeufe-a-b-c.md).

## Neu: einfacher Termin- und Zahlungsablauf

Fünf Hauptziele: **Heute, Klienten, Termine, Zahlungen, Mehr**. Alle weiteren Werkzeuge stehen unter **Mehr**, einschließlich Einstellungen und Empfehlungen. **Termin nachtragen** ist bei Terminen verfügbar; **Termin abschließen** legt eine offene Zahlung an. Zahlungen beginnt mit **Offen** und den Schaltflächen **Als bezahlt markieren**. Bestehende Daten und Infrastruktur bleiben unverändert. Bedienung, technische Übergabe und vollständige Dateiliste: [docs/termin-und-zahlungsablauf.md](docs/termin-und-zahlungsablauf.md).

## Neu: Empfehlungen

**Mehr → Empfehlungen** und **Klientenprofil → Empfehlungskarte** sind integriert. Klienten bekommen nur eine teilbare PNG-Karte, keinen Login. Bei Neuanlage Code und Einwilligung freiwillig erfassen. Laufzeit ab erster Zahlung, getrennte EUR-/UAH-Prämien und Quartalsabrechnung. Die Code-Ausgabe braucht eine einmalige Supabase-Migration; Finanzdaten bleiben verschlüsselt. Vollständige Anleitung und technische Übergabe: [docs/empfehlungen.md](docs/empfehlungen.md).

## Neue Darstellung: Pastell und Milchglas

Die tatsächliche App enthält jetzt **Mehr → Einstellungen → Darstellung** mit vier
Pastellverläufen, eigenen Farben, einer Option ohne Verlauf sowie separaten Reglern
für Karten- und Menütransparenz (0–30 %), Glas-Weichzeichnung und Hintergrundstärke.
Die Änderungen erscheinen sofort, auch in Hell/Dunkel, und werden gerätelokal
unabhängig vom Tresor gespeichert. Nach einem App-Update gegebenenfalls den
vorhandenen Hinweis **Jetzt aktualisieren** verwenden, dann die Einstellungen öffnen.
Es ist kein CSS-Import und keine Supabase-Migration erforderlich.

Dateien, sichere Farbgrenzen, Fallbacks, technische Hinweise für Claude und Tests:
[`docs/darstellung.md`](docs/darstellung.md). Das bisherige Beispiel unter `examples/`
bleibt separat; der neue Einstellungsbereich steuert die echte Praxisoberfläche.
Texte und Formulare bleiben deckend; Druck/PDF behalten ihre bisherigen Farben.

Prüfstand der Programmfassung `30d125b1d24eb2799b1698c2d2f85c4bc7a1ece8`:
219 Unit-Tests bestanden; die 14 bestehenden Browserprüfungen für Barrierefreiheit
und Layout sowie 7 zusätzliche Darstellungsprüfungen sind grün. Die zusätzliche
Chromium-Medienemulation wird auf dem Mobilprojekt bewusst übersprungen. 6 Prüfungen
für den Pages-Unterpfad bestanden, einschließlich Offline-Neuladen, ukrainischer
PDFs und synthetischer Sprach-Memos. Desktop-Darstellung in Hell/Dunkel sowie die
schmalen Ansichten bei 820/390 px wurden zusätzlich visuell geprüft.
Der [vollständige Chromium-CI-Lauf nach den Speicher-Testanpassungen](https://github.com/NicoAHB/Psychologie/actions/runs/40000640494)
ist erfolgreich. Die separaten iPad-/iPhone-WebKit-Prüfungen sind unter
[diesem erfolgreichen Safari-Lauf](https://github.com/NicoAHB/Psychologie/actions/runs/40002257639)
nachvollziehbar: jeweils 10 bestanden und 3 vorgesehen übersprungen, einschließlich
aller neuen Darstellungsprüfungen. Dieser Lauf verwendete noch die native
Pixeldichte der Geräteprofile. 13 gezielte lokale Chromium-Wiederholungen für die
Darstellung und die betroffenen Speicherabläufe bestanden zusätzlich (1 geplanter
Skip). Alle späteren Änderungen nach `30d125b` betreffen ausschließlich Tests,
CI-Konfiguration und Dokumentation; die erzeugten Pages-App-Dateien sind
bytegleich. Die CI-Option für Software-Pixelverhältnis 1 ist in
`docs/darstellung.md` erklärt. WebKit unter Linux ersetzt keinen echten
iPadOS-Gerätetest.

## Wo liegt der Stand?

- Repository in dieser Cloud-Aufgabe: `/workspace/Psychologie`
- Lokaler Entwicklungsbranch für die neue Darstellung: `codex/appearance`
- **Aktueller GitHub-Stand:** `main` enthält die veröffentlichte App und ist die Grundlage für die Weiterarbeit auf einem anderen Gerät.
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

## Wiederverwendbare Bezeichnungen und Memo-Überblick (22. Oktober 2026)

Die Memo-Bezeichnung hat eine native, gut per Touch/Tastatur bedienbare Vorauswahl mit acht DE-/UA-Vorschlägen. Freies Eingeben bleibt möglich. Beim Speichern werden eigene Bezeichnungen in `settings.memoLabels` verschlüsselt gelernt, einschließlich Sicherungen und optionalem Sync. Die Wortliste gehört zur Praxis und steht bei allen Klienten bereit; sie bleibt unabhängig vom Löschen einzelner Memos erhalten. Abgebrochene oder verworfene Eingaben werden nicht gelernt. Groß-/Kleinschreibung, Unicode und Leerzeichen erzeugen keine doppelten Vorschläge. CRDT-Set-Einträge verbinden gleichzeitige Ergänzungen beider Geräte. Die Auswahl zeigt maximal 50 eigene Einträge gleichzeitig; Teiltext im Bezeichnungsfeld findet weitere Einträge. Eigene Texte bleiben beim Sprachwechsel unverändert.

Der Klienten-Überblick zeigt die fünf neuesten Memos mit Aufnahmedatum, Uhrzeit und optionalem Titel, danach „Weitere Sprach-Memos anzeigen“. Ohne Titel steht dort die übersetzte Standardbezeichnung. Antippen öffnet den vorhandenen Player mit manueller Kurzfassung; Dateien werden erst dann entschlüsselt. Über diesen Dialog sind auch Umbenennen/Löschen möglich. Die Einträge gehören ausschließlich zum geöffneten Klienten.

Betroffen: `src/lib/memoLabels.ts`, `types.ts`, `crdt.ts`, `src/components/AudioMemos.tsx`, `forms.tsx`, `client-profile.tsx`, CSS und DE-/UA-Wörterbücher. Neue Tests: `tests/memo-labels.test.ts`, `tests/browser/memo-labels.spec.ts`; axe prüft auch die neue Übersichtskarte. Keine neuen Pakete, Sprachmodelle oder Worker und keine SQL-Migration für diese Ergänzung nötig.

Aktuelle lokale Prüfung: 178 Unit-/PostgreSQL-Tests und alle 95 aktiven Browserprüfungen bestanden (15 bedingte Anbieter-/Plattformfälle ausgelassen), inklusive der neuen Auswahl, Sicherungs-/Merge-Logik, Neuladen, Klientenwechsel, Datum-/Titelsortierung, Player und axe in Hell/Dunkel. Zusätzlich alle 6 Prüfungen des `/Psychologie/`-Builds bestanden.

## 23. Oktober 2026 – Wiederaufnahme, Entwürfe und sichere Freigaben

Ausführliche technische und fachliche Übergabe: **`CLAUDE.md` → `docs/claude-uebergabe-2026-10-23.md`**. Geräteabnahme: `docs/ipad-abnahme.md`.

- Begleitungsstatus aktiv/pausiert/abgeschlossen, Statusereignisse und Wiedervorlagen. Alte Akten bleiben aktiv; beim Pausieren/Abschließen wird nichts gelöscht oder automatisch abgesagt. Rückkehr verwendet dieselbe Akte. Inaktive Profile zeigen „Begleitung wieder aktivieren“ direkt am Anfang des Überblicks. Aktive Liste und Statistik berücksichtigen den Status; globale Suche findet weiterhin alle Akten.
- `sessionDrafts` als additive verschlüsselte Sammlung. Text nach 700 ms, Fotos nach Auswahl und beendete Aufnahmen schon im Recorder-Dialog gesichert. Fortsetzen nach Neuladen/Sperren; Schließen erhält, explizites Verwerfen entfernt den Entwurf. Erst Speichern zählt als Sitzung. Dateireferenzen, CRDT-Konflikte, Sicherungen, lesbarer Export und die Bereinigung lokaler Verlaufspunkte sind integriert. Laufende, vor Abschluss des Schreibens hart beendete Aufnahmen bleiben technisch nicht garantiert wiederherstellbar.
- Abgeleitete Aufgaben für Dokumentation, fehlende Rechnungen, Entwürfe und fällige Wiedervorlagen ergänzen die vorhandene Rücklauf-/Forderungsübersicht. Listen begrenzt; Sitzungen werden für Rechnungsaufgaben in einem Durchlauf gruppiert.
- Sicherungswarnung erfasst jetzt auch Memos, Entwürfe und Einstellungen. Nichtdestruktive externe Sicherungsprüfung mit eigener Passphrase im Secure-Worker: Tresor und sämtliche referenzierten Dateien entschlüsseln/prüfen, ohne die aktuelle Akte zu importieren.
- Verwaltung eigener Memo-Vorschläge plus Favoriten. Umbenennen/Entfernen verändert keine vorhandenen Memo-Titel; Favoriten werden pro Eintrag zusammengeführt.
- Optionale Dokument-Links mit separatem Schlüssel und Abruf-Token, einem/drei/sieben Tagen Laufzeit, optionaler zusätzlicher Passphrase und Widerruf. Gast ohne Konto, keine Therapeuten-Anmeldung im Gast-Client, keine Klartextdateien beim Server. **Zusätzliche Supabase-Migration `supabase/document-shares.sql` erforderlich**, nicht aus dieser Umgebung live ausgeführt. Optional kostenlose `pg_cron`-Erweiterung für tägliches physisches Entfernen abgelaufener Ciphertexte; Zugriffsablauf gilt immer sofort. Quoten, Metadaten und Offline-Widerruf sind in der Übergabe erklärt. Die GitHub-Integration erlaubt hier kein Lesen/Ändern der Actions-Variablen (HTTP 403); bestehende Werte wurden nicht verändert.
- Keine zusätzlichen NPM-Abhängigkeiten, keine KI-/Transkriptions-/Audio-Dienste. Bestehende Verschlüsselungs-/Worker-Struktur und CSP-Herkünfte erhalten. Nicht konfigurierte Builds laden weiterhin keinen Supabase-SDK-Chunk in den Offline-Cache.

Prüfung: **191 Unit-Tests bestanden**; vollständiger Browserlauf **102 bestanden, 16 bedingt übersprungen**. Nach der abschließenden Platzierung der Wiederaufnahme-Karte die sechs neuen Praxisabläufe auf Desktop/Mobil erneut bestanden. **Alle 6 `/Psychologie/`-Pages-Prüfungen bestanden**, einschließlich Offline-PDF und verschlüsseltem Audio. Axe in Hell/Dunkel grün, zusätzlich neue Verwaltungs-/Sicherungs-/Freigabedialoge geprüft; 820/390 px visuell geprüft. Supabase-Transport in Tests kontrolliert simuliert, RPC/RLS mit PGlite ausgeführt; kein Live-Patientenversand. Neuer separater GitHub-Workflow `ipad.yml` für sechs WebKit-Prüfungen; lokal war der Browserdownload durch HTTP 403 „Domain forbidden“ gesperrt. Ein echter iPadOS-Hardwaretest ist weiterhin offen. Den aktuellen Workflow-Status unter GitHub Actions und den zugehörigen Quellstand mit `git log -1` prüfen.

### Abschließende Safari- und Fokusnachprüfung

Native Dialoge verwenden jetzt ein Body-Portal und einen Layout-Effect zum synchronen Schließen/Fokuswiederherstellen; Escape betrifft nur den obersten Dialog. Touch-Eingaben erhalten mindestens 16 px Schrift gegen ungewolltes iOS-Eingabezoom. Die synthetische Mikrofon-API wird direkt am Navigator fixiert; Tests rufen kein echtes Mikrofon auf.

Die Safari-Engine lieferte im Headless-Container nach einzelnen Interaktionen keine Rendering-Frames mehr (gemessen: null `requestAnimationFrame`-Callbacks in jeweils 500 ms, auch nach Mausbewegung/Screenshot). Der Workflow verwendet deshalb das passende offizielle Playwright-Image mit virtuellem Bildschirm (`xvfb-run`, `--headed`) und nacheinander geprüften Geräten. Keine erzwungenen Klicks, keine abgeschalteten Sichtbarkeits-/Stabilitätsprüfungen. Die Tests warten auf den tatsächlich entschlüsselten, gespeicherten Entwurf; die App sichert weiterhin nach 700 ms Eingabepause.

Verwaltung, nichtdestruktive Sicherungsprüfung und die jeweiligen axe-Prüfungen sind getrennte Tests mit frischen Browserkontexten. **Vollständiger GitHub-Lauf: 191 Unit-Tests sowie 108 Browserprüfungen bestanden, 16 bedingt übersprungen** ([Lauf 39944550887](https://github.com/NicoAHB/Psychologie/actions/runs/39944550887)), einschließlich der pausierten Akte mit Wiederaufnahme/Wiedervorlage. Diese vier Hell-/Dunkel-/Desktop-/Mobilfälle bestanden zusätzlich lokal. Der finale `/Psychologie/`-Build ist erfolgreich; die sechs Pages-Prüfungen für denselben App-Code bestanden bereits. Neue Abhängigkeiten: keine. Geräteabnahme und echte Supabase-Migration bleiben wie oben beschrieben erforderlich.

Nach der Messung wartender IndexedDB-Transaktionen wurden Transaktionen nach Einreihen sämtlicher Requests explizit abgeschlossen (`commitTransaction`, kompatibler automatischer Fallback), leere Bereinigungen abgekürzt und wartende Memo-Metadaten auf den neuesten Stand zusammengefasst. Erfolgsbestätigung erfolgt weiterhin ausschließlich nach dem vollständigen Transaktionsabschluss. Abbruchtest: Vorheriger Tresor-Ciphertext und Verlauf bleiben bei fehlgeschlagenem Checkpoint unverändert. **Abschließende lokale Prüfung: 192 Unit-Tests, 108 aktive Browserprüfungen und alle 6 Pages-Prüfungen bestanden; 16 bedingte Browsertests übersprungen.**

Der separat angefragte Aurora-HTML-/CSS-Entwurf liegt unter `examples/aurora-dashboard.html` und `examples/aurora-dashboard.css`, Anleitung in `examples/README.md`. Eigenständiges Beispiel ohne Backend, externe Schriften oder Bibliotheken; 820 px hell / 390 px dunkel mit axe und visuell geprüft. Die Marketing-Module gehören zur anschließenden Erweiterung und sind kein Bestandteil dieser Speicheroptimierung.

**Safari-Abschluss:** Alle **12** iPad-/iPhone-WebKit-Prüfungen bestanden, einschließlich gestoppter MP4-Aufnahme mit manueller Kurzfassung, Neuladen, Sperren, Offline-Fortsetzung, endgültiger Sitzungsspeicherung, Reaktivierung, Favoriten, Sicherungsprüfung und axe ([GitHub-Lauf 39950447872](https://github.com/NicoAHB/Psychologie/actions/runs/39950447872), App-Quellstand `1f6a8e1`). Nach dem Abkürzen tatsächlich leerer Orphan-Bereinigungen erneut 192 Unit-Tests, 31 relevante Browserprüfungen (eine plattformbedingt übersprungen) und alle sechs aktuellen Pages-Prüfungen bestanden. Nachweise und Verhalten detailliert in der Claude-Übergabe; keine echten Mikrofon-/Hardware- oder Live-Supabase-Tests behaupten.

## 23. Oktober 2026: Newsletter, Vorlagen und Marketing

Neue Sidebar-Gruppe nach Einstellungen, aus `src/lib/navigation.tsx` erweiterbar. Newsletter mit Vorschau, Empfängerauswahl, Bildanhang, DE/UA-Fassungen und unveränderlichem Versandarchiv; Vorlagen mit Suche/Bearbeitung/Löschen und Übernahme ins Formular; Kampagnen für Geburtstag, Willkommen und feste Termine. Technischer Einstieg und vollständige Einrichtung: [`docs/marketing.md`](docs/marketing.md).

Die letzte Nutzer-Ergänzung ist umgesetzt: E-Mail, Telegram, beide oder keine Marketing-Nachrichten. Versand berücksichtigt ausschließlich die Schnittmenge aus gewählten Kanälen und eigener Freigabe je Klient. Zwei Kanäle ergeben zwei einzeln nachverfolgbare Nachrichten, aber nur einen gezählten Klienten. Der Button „Keine Marketing-Nachrichten“ widerruft beide Freigaben. Neue Freigaben sind standardmäßig aus; Terminerinnerungen bleiben gesondert. Alte Versand-IDs bleiben beim Ausbau auf beide Kanäle erhalten.

Vorlagen, Kampagnen, Archiv und Bild-Blobs sind in Tresor, CRDT, Sicherungen, Verlauf, Dateiabgleich und Klientenexport integriert. Lesbare Exporte enthalten keine Abmeldesecrets oder fremden Empfänger. Der optionale Supabase-Index speichert verschlüsselte Titel/Inhalte. `supabase/marketing.sql` und `supabase/functions/send-marketing` sind vorbereitet, aber nicht in einem echten Projekt eingerichtet. Anbieter erhalten nur die für den gewählten Einzelversand nötigen Informationen. Keine echten Nachrichten versendet. Automatik läuft derzeit ausschließlich bei geöffnetem, entsperrtem Tresor; der zukünftige Empfehlungsbonus ist nicht implementiert.

Prüfstand des Anwendungscodes `5d1f7586ef780dbaf0664716d17ba8e6ca107a98`:

- 216 Unit-Tests bestanden, einschließlich PostgreSQL/RLS, Kanalwahl, Entzug der Freigaben, Duplikatschutz, Verschlüsselung, Altdaten und Export.
- Neue Marketing-Browserfälle: 5 bestanden, 3 gezielt übersprungen; axe für 390/820 px und Hell/Dunkel, inklusive Dialogen, Versand an E-Mail/TG/beide und Ausschluss ohne Freigabe.
- Vollständige Chromium-CI: 113 bestanden, 19 gezielt übersprungen, [Lauf 39984247619](https://github.com/NicoAHB/Psychologie/actions/runs/39984247619).
- Pages-Pfad `/Psychologie/`: Produktionsbuild und 6 Browserprüfungen erfolgreich, einschließlich Offline-PDF und verschlüsselter Audio-Wiedergabe.
- Safari-/iPad-/iPhone-CI: 14 bestanden, 4 gezielt übersprungen, Commit `8a218e6`, [Lauf 39985634681](https://github.com/NicoAHB/Psychologie/actions/runs/39985634681). Der Anwendungscode ist gegenüber `5d1f758` unverändert. Der Test wartet auf den Abschluss des dauerhaft verschlüsselten Speicherns und gibt bei Fehlern den Dialogzustand aus. Auch die vollständige Chromium-CI dieses Commits ist grün: [Lauf 39985634706](https://github.com/NicoAHB/Psychologie/actions/runs/39985634706).

Ein lokaler paralleler Gesamtlauf meldete 112 bestandene Fälle, 19 übersprungene Fälle und einen Verlust der Testseiten-Variablen im bestehenden Video-Source-Harness. Derselbe Videotest bestand isoliert; der vollständige GitHub-Chromium-Lauf bestand ebenfalls. Browser-/UDP-Richtlinien wurden nicht verändert. Ein lokaler Download des Safari-Fehlerartefakts wurde durch die ausgehende Netzwerkregel verweigert; Fehlerzustände werden deshalb zusätzlich direkt in der CI-Annotation ausgegeben. Tests wurden weder deaktiviert noch ihre fachlichen Prüfungen entfernt.

Cloud-Startanleitung am 23. Oktober aktualisiert und als Entwurf gespeichert (`start_skill`; Installationsskript und Netzwerkauswahl erhalten). Zum Aktivieren sind Speichern/Veröffentlichen in den Umgebungseinstellungen erforderlich. Eine Wiederherstellung dieses neuen Entwurfs in einer frischen Aufgabe wurde nicht behauptet oder getestet. Anwendung und Quellcode werden gesondert über GitHub veröffentlicht.

## Speicherstatus der Einstellungen

Die dauerhaft geöffneten Speicherformulare zeigen nach erfolgreichem Schreiben einen grauen, deaktivierten Button mit Gerätezeit. Änderungen aktivieren ihn wieder; Fehler und Eingaben während eines laufenden Schreibens werden berücksichtigt. [Bedienung und technische Übergabe](docs/speicherstatus.md).
