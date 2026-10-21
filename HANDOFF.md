# Weiterarbeit am Tablet

## Wo liegt der Stand?

- Repository in dieser Cloud-Aufgabe: `/workspace/Psychologie`
- Lokaler Entwicklungsbranch: `codex/praxisraum-foundation`
- **GitHub-Push erfolgreich:** `codex/praxisraum-foundation` ist jetzt auf GitHub gesichert. Der erste 403-Fehler wurde nach der Berechtigungsänderung behoben.
- Programmcode und Tests werden lokal committed. Ein Projekt-ZIP und ein selbstständiges Git-Bundle werden zusätzlich unter `/workspace` erzeugt. Sie enthalten keine echten Praxisdaten oder Zugangsdaten.

Öffne diesen Chat auf dem Tablet, um die bestehende Aufgabe fortzusetzen. Für eine unabhängige neue Aufgabe oder Codespaces den aktuellen GitHub-Stand oder das Projektarchiv verwenden. Eine langfristige Wiederherstellung lokaler Commits allein aus einem neuen Cloud-Task ist nicht zugesichert.

## GitHub und App-Veröffentlichung

Die Quellcode-Veröffentlichung funktioniert. Die App-Veröffentlichung ist getrennt davon: Der Workflow `.github/workflows/pages.yml` baut den Unterpfad `/Psychologie/` und veröffentlicht über GitHub Pages. Unter **Settings → Pages** einmalig die Quelle **GitHub Actions** wählen. Einen eventuell vor Aktivierung fehlgeschlagenen Lauf unter **Actions → Publish Praxisraum** erneut starten. Erst ein erfolgreicher Deploy-Lauf bestätigt den Live-Link `https://nicoahb.github.io/Psychologie/`.

Die Cloud-Umgebung blockierte Verwaltungszugriffe auf `api.github.com` mit CONNECT 403. Die Domains `api.github.com` und `nicoahb.github.io` wurden additiv als Netzwerkentwurf gespeichert. Der Entwurf ist kein Nachweis einer bereits angewendeten Freigabe. Sobald die Freigabe angewendet ist, können Aktivierung und Live-Deployment aus dieser Aufgabe geprüft werden. Alternativ die oben genannte GitHub-Einstellung direkt vornehmen. Es wurde keine Repository-Sichtbarkeit verändert und kein kostenpflichtiges Hosting aktiviert.

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

Es wurden keine Supabase- oder Telegram-Zugangsdaten bereitgestellt. Die lokale App benötigt sie nicht. Für Live-Synchronisation bzw. Zustellung müssen die in `.env.example` und README genannten eigenen Projekte, Schlüssel und Actions-Secrets eingerichtet werden. Der Erinnerungs-Cron ist absichtlich bis zur Konfiguration deaktiviert. Keine Live-Synchronisation, Bot-Zustellung oder öffentliche Bereitstellung wurde behauptet oder durchgeführt.

## Geprüfter Stand dieser Übergabe

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
- Bewusst nicht geändert: Der Service Worker lädt alle Dateien (auch PDF-Schriften, rund 3,5 MB) vorab, damit Rechnungs-PDFs offline funktionieren. Mögliche Verkleinerung: DejaVu-Schriften auf Lateinisch/Kyrillisch reduzieren (Risiko: seltene Schriften in Klientennamen).
