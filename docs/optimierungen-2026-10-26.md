# Praxisraum 0.2.0: Updates, Einrichtung, Sicherung und Startzeit

## Was sich für die Nutzerin ändert

1. **Ein Update wartet auf erfolgreiches Speichern.** Schlägt das Speichern
   offener Entwürfe oder der Akte fehl, bleibt die aktuelle App geöffnet. Eine
   verständliche DE-/UA-Meldung nennt den Abbruch. Erst nach Beheben des
   Speicherfehlers und einem erneuten Klick wird die Aktualisierung aktiviert.
   Mehrfaches Antippen startet keinen zweiten Aktivierungsvorgang.
2. **E-Mail-Einrichtung in drei Prüfschritten.** Unter Mehr → Einstellungen →
   E-Mail-Versand führen drei antippbare Schritte zur Server-Freigabe/Anmeldung,
   zum Versandzugang und zur eigenen Testmail. Die Anzeige unterscheidet einen
   gespeicherten Zugang, die Annahme einer Testmail beim Anbieter und den von
   der Nutzerin bestätigten tatsächlichen Empfang. Eine neue Testmail bleibt
   ausdrücklich auslösbar. Neue oder geänderte gespeicherte Konfigurationen
   übernehmen keine alte Empfangsbestätigung.
3. **Prüfzeitpunkte für Sicherungen.** Die Sicherungskarte zeigt, wann eine
   Sicherungsdatei erfolgreich entschlüsselt und auf vollständige, lesbare
   Anhänge geprüft wurde. Eine eigene Anleitung führt durch einen Import auf
   einem zweiten Gerät. Die Nutzerin kann einen tatsächlich durchgeführten
   Gerätetest mit drei bewussten Bestätigungen vermerken. Dateiprüfung und
   selbst bestätigter Gerätetest erscheinen getrennt; eine Dateiprüfung setzt
   niemals automatisch den Gerätetest auf „erledigt“.
4. **Seltenere Oberflächen werden später ausgeführt.** Newsletter, Vorlagen,
   Kampagnen, Empfehlungsübersicht, Einstellungen sowie E-Mail-Einrichtung und
   Empfehlungskarten-Dialog werden erst bei Bedarf geladen/ausgeführt. Ein
   Newsletter-Entwurf bleibt beim Wechsel zu einer anderen Seite erhalten.
   Alle zugehörigen Dateien werden weiterhin für die Offline-Nutzung gecacht.
5. **Sichtbare Programmversion.** Mehr → Einstellungen zeigt Version 0.2.0,
   die Kennung des tatsächlich gebauten Quellstands und dessen Datum. Damit
   können Geräte verglichen und Rückfragen an Claude/Codex eindeutig einem
   Stand zugeordnet werden. Ein angebotener neuer Stand muss weiterhin über
   die Aktualisierung übernommen werden.

## Gmail und tatsächliche Freigaben

Die Google-Kontofreigabe sowie eine noch fehlende eigene Supabase-Verbindung
muss die Nutzerin weiterhin einrichten; dieses Code-Update führt diese privaten
Freigaben nicht stellvertretend aus. Die Anleitung ist über die drei Schritte
und die bestehende technische Einrichtung erreichbar. Es gibt keine neue
Supabase-Migration oder neue Edge-Function-Anforderung gegenüber der vorhandenen
Gmail-Version. [Gmail-Einrichtung](gmail-versand.md).

Bei eingeschränktem Clipboard-Zugriff, insbesondere auf dem iPad, gibt es nun
zusätzlich **Gmail-Skript anzeigen**. Das schreibgeschützte Textfeld erlaubt
manuelles Markieren und Kopieren. Es enthält nach bewusstem Öffnen den neu
erzeugten geheimen Verbindungscode und darf nur ins eigene private Google-Projekt
kopiert werden. Der gespeicherte Code wird weiterhin nie vom Server zurückgegeben.

Die E-Mail-Prüfung ist eine Bedienhilfe und keine neue Versandberechtigung.
Bestehende Einwilligungen und Automationen bleiben unverändert. Eine
Empfangsbestätigung für eine Testmail garantiert keine spätere Zustellung.
Automatisierte Tests schicken keine echte Nachricht.

## Technische Übergabe für Claude

### Update-Schutz

`UpdateGuard` blockiert parallele oder bereits abgeschlossene Aktivierungen.
`UpdateBanner` wartet auf `beforeApply`, behandelt Ablehnungen und synchron
geworfene Fehler und ruft danach erst die vorhandene Service-Worker-Aktivierung
auf. `App.tsx` verwendet weiterhin `flushBeforeLock()` und `vault.flush()`.
Der bisherige Fehler, nach einem abgefangenen Schreibfehler über `finally`
trotzdem zu aktivieren, ist beseitigt. Ein Scheitern lässt die Akte/Entwürfe im
laufenden Zustand. Speicherschutz und Verschlüsselung selbst wurden nicht geändert.

### Prüfmetadaten

`setupProof.ts` speichert ausschließlich Zeitpunkte und bei E-Mail-Prüfungen einen
SHA-256-Konfigurationsfingerabdruck im bestehenden IndexedDB-Metadatenbereich.
Kein Klartextinhalt, kein Dateiname, kein Provider-Schlüssel, keine Passphrase,
keine E-Mail-Adresse und keine Klientenzahl werden neu in Metadaten geschrieben.
Sicherungsprüfung und manuelle Wiederherstellungsbestätigung haben getrennte
Schlüssel pro Tresor, damit gleichzeitige Schreibvorgänge einander nicht löschen.
Die E-Mail-Bestätigung ist an das angemeldete Konto und den gespeicherten Anbieter,
Absender, Endpunkt, Status und dessen serverseitigen Änderungszeitpunkt gebunden.

Diese Metadaten gelten **nur auf diesem Gerät** und werden weder synchronisiert
noch in Akten-/Klientenexporte oder Sicherungen aufgenommen. Sie ersetzen keine
vom Gerät unabhängige Sicherungsdatei. Der Import einer Sicherung auf einem
zweiten Gerät übernimmt daher keine angeblich dort erfolgte Prüfung.

Der bestehende `verifyBackup`-Worker liefert zusätzlich die geprüfte Tresor-ID.
Dadurch kann die Oberfläche den Prüfzeitpunkt der richtigen Sicherung zuordnen,
ohne eine große JSON-Datei ein zweites Mal im UI-Thread zu parsen. Alte
Sicherungsformate bleiben unverändert lesbar. Bei einem Fehler nur beim Speichern
des Prüfdatums bleibt eine erfolgreich gelesene Datei als lesbar erkennbar;
der Metadatenfehler wird separat gemeldet.

### Startzeit und Offline-Verhalten

Es werden `React.lazy` und `Suspense` eingesetzt. Gemeinsame Teile wurden dafür
getrennt: verschlüsselter Sicherungsexport in `backupExport.ts`, schlanke
E-Mail-/Empfehlungskarten-Knöpfe und gesonderte Dialoge. Die Empfehlungsseite
zieht dadurch die gesamte Abrechnungsoberfläche nicht mehr beim Profilstart mit.

Der Newsletter bleibt nach dem ersten Öffnen gemountet; sein `active`-Schalter
steuert weiterhin die Sichtbarkeit. So geht ein ungesendeter Entwurf bei der
Navigation nicht verloren. Lokale Automationen werden wie bisher unabhängig von
der später geladenen Oberfläche über die bestehenden Hooks gesteuert.

Der Service Worker cached weiterhin **alle benötigten App-Chunks**. Die Änderung
spart das frühe Ausführen/Parsen seltener Oberflächen, sie entfernt keine
Offline-Funktion und verspricht keine geringere vollständige Installationsgröße.
Beim lokalen Vergleich mit dem vorherigen Stand sank das Haupt-JavaScript von
ca. 1.063 kB auf ca. 996 kB, gzip von ca. 310 kB auf ca. 294 kB. Das sind
Bundle-Messwerte, keine gemessene Beschleunigung auf echter iPad-Hardware.

### Versionsangabe

Vite übernimmt die Versionsnummer aus `package.json` sowie die öffentliche
Git-Kennung aus `GITHUB_SHA`, `PRAXISRAUM_SOURCE_REVISION` oder dem lokalen Git-Stand.
Das Datum stammt aus dem Commit oder `PRAXISRAUM_SOURCE_DATE`. Es wird als Datum
des **Quellstands**, nicht als tatsächlicher Veröffentlichungszeitpunkt bezeichnet.
Unversionierte Quellarchive und nicht eingecheckte lokale Änderungen werden als
Entwicklungsstand gekennzeichnet. Ohne Git oder vorgegebene Metadaten wird keine
Kennung erfunden. Die Anzeige betrifft das Frontend, nicht die Version einer
separaten Supabase-/Google-Installation.

## Validierung und bewusst offene Schritte

- Unit-Tests für abgebrochene/parallel versuchte Updates, spätere Wiederholung,
  getrennte Sicherungsnachweise, ungültige Metadaten, Konfigurationswechsel und
  kontogebundene E-Mail-Bestätigung.
- Browserprüfung mit einer echten lokalen Verschlüsselungs-/Schreibwarteschlange
  und simuliertem `QuotaExceededError`: keine Aktivierung vor erfolgreichem
  Speichern, danach genau eine Aktivierung.
- Verschlüsselter Export und Import in einem **getrennten Browserprofil** mit
  tatsächlich herunterladbarem Dokument und abspielbarem synthetischem Audiomemo.
- Falsche Passphrase setzt keinen Prüfzeitpunkt; erfolgreiche Dateiprüfung und
  manuelle Bestätigung setzen jeweils nur ihren eigenen Nachweis.
- Nachladen, Erhalt von Newsletter-Entwürfen, Offline-Erstöffnung zuvor nicht
  besuchter Seiten, Versionsanzeige und Deutsch/Ukrainisch werden geprüft.
- Die bereits rote Dokument-Prüfung im vorherigen GitHub-Lauf erwartete einen
  überholten deutschen Satz. Sie verwendet jetzt den aktuellen Übersetzungsschlüssel;
  das Verhalten „ohne Einrichtung kein Versand“ bleibt geprüft.
- Weiterhin erforderlich: die tatsächliche Google-/Supabase-Freigabe, eine
  Testmail an das eigene reale Postfach und ein Test auf einem realen zweiten
  Gerät. Ein simulierter Browser-Gerätewechsel ist kein Hardwaretest.

Keine neue NPM-Abhängigkeit, keine Änderung am Aktenmodell, an CRDT/Merge,
Verschlüsselung, Cloud-Synchronisation oder Anbieterzugang. Keine KI-, Audio-,
Buchungs- oder Login-Funktion hinzugefügt. Die vorhandenen kostenfreien
Infrastrukturkontingente und Grenzen gelten weiter. Keine rechtliche oder
datenschutzrechtliche Prüfung behauptet.

## Geänderte Dateien

- `HANDOFF.md`
- `README.md`
- `docs/gmail-versand.md`
- `docs/optimierungen-2026-10-26.md`
- `package-lock.json`
- `package.json`
- `playwright.ipad.config.ts`
- `src/App.tsx`
- `src/components/AppVersion.tsx`
- `src/components/AppointmentEmail.tsx`
- `src/components/BackupAssistant.tsx`
- `src/components/BackupProof.tsx`
- `src/components/EmailSetupButton.tsx`
- `src/components/EmailSetupCard.tsx`
- `src/components/ReferralCardButton.tsx`
- `src/components/ReferralCardDialog.tsx`
- `src/components/Referrals.tsx`
- `src/components/UpdateBanner.tsx`
- `src/components/backup.tsx`
- `src/components/client-profile.tsx`
- `src/components/documents.tsx`
- `src/lib/backupExport.ts`
- `src/lib/buildInfo.ts`
- `src/lib/setupProof.ts`
- `src/lib/updateGuard.ts`
- `src/lib/verifyBackup.ts`
- `src/locales/de.json`
- `src/locales/uk.json`
- `src/main.tsx`
- `src/pages/SettingsPage.tsx`
- `src/setup-flow.css`
- `tests/browser/documents.spec.ts`
- `tests/browser/email-setup-connected.spec.ts`
- `tests/browser/email-setup.spec.ts`
- `tests/browser/release-safety.spec.ts`
- `tests/browser/update-safety.spec.ts`
- `tests/browser/workflow-fixture.ts`
- `tests/practice-workflow.test.ts`
- `tests/release-safety.test.ts`
- `vite.config.ts`
