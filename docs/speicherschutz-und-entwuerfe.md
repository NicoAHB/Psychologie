# Praxisraum 0.2.1: Fensterschutz, Sicherungsstand und verschlüsselte Entwürfe

## Für die Nutzerin

1. **Ein geöffnetes Bearbeitungsfenster:** Ein zweites App-Fenster meldet, dass die App bereits geöffnet ist. Im ersten Fenster sperren oder es schließen, dann im zweiten öffnen. Das zweite Fenster liest beim Entsperren die aktuelle gespeicherte Fassung. Falls der Browser keine Fenstersperre unterstützt, verhindert eine zusätzliche Prüfung, dass eine ältere Fassung neuere Änderungen überschreibt. Bei einer solchen Abweichung bleiben die Eingaben im geöffneten Fenster erhalten; **Änderungen der Fenster zusammenführen** verbindet sie mit der gespeicherten Fassung. Unterschiedliche Inhalte desselben Felds lassen sich über die bestehende Konfliktprüfung auswählen.
2. **Alte Verlaufsdatei bleibt eine alte Datei:** Ein Download aus dem Verlauf bestätigt keine aktuelle Sicherung mehr. Aktuelle Sicherungen und Cloud-Kopien merken zusätzlich, welche verschlüsselte Fassung tatsächlich enthalten ist. Änderungen während eines langsamen Exports oder bei zurückgestellter Geräteuhr bleiben dadurch unterscheidbar. Der bisherige Abstand von sieben Tagen für die Sicherungserinnerung bleibt erhalten.
3. **Bereich nach einem Fehler erneut öffnen:** Bei einem Darstellungsfehler in einer Seite oder einem Dialog bleibt der Tresor mit seiner Schreibwarteschlange in der App erhalten. **Speichern und Ansicht erneut öffnen** versucht zuerst die Speicherung. Schlägt sie fehl, bleibt die Fehlermeldung sichtbar. Es wird nicht automatisch neu geladen. Die äußerste Notfallseite erklärt ehrlich, dass nur erfolgreich gespeicherte Daten sicher abgelegt sind und ungespeicherte Eingaben beim Neuladen verloren gehen können.
4. **Newsletter später fortsetzen:** Betreff, deutsche/ukrainische Texte, Kanal, Empfängerauswahl und Bild werden nach einer kurzen Schreibpause verschlüsselt als Entwurf gespeichert. Unter Newsletter erscheinen gespeicherte Entwürfe mit Datum und den Knöpfen **Fortsetzen** und **Entwurf verwerfen**. Beim Fortsetzen werden aktuelle Kontakte und Einwilligungen erneut geprüft. Das Fortsetzen verschickt nichts. **Als Vorlage speichern** bleibt zusätzlich verfügbar. Mehrere Entwürfe und separat entstandene Geräteentwürfe bleiben getrennt erhalten.
5. **Speicher im Blick:** Unter Einstellungen zeigt eine neue Karte die geschätzte Belegung des Browserspeichers und den bekannten Status für dauerhaften Speicher. Bei knappem Speicher führt ein Hinweis direkt zur Sicherung. Große Anhänge werden in der Schätzung vor ihrer verschlüsselten Ablage berücksichtigt. Manche Browser liefern keine Schätzung; die App kennzeichnet das ausdrücklich.

Alle neuen Bedienhinweise sind auf Deutsch und Ukrainisch vorhanden. Touch-Bedienung, große Schrift und Dunkelmodus werden weiter unterstützt.

## Technische Übergabe für Claude

### Exklusive Fenster und atomare Schreibprüfung

`VaultWindowAccess` hält einen nativen Web Lock für den primären Tresor vom Anlegen/Entsperren bis zum erfolgreichen Sperren oder zum Abbau des Hooks. Ein nicht verfügbares Schloss wird sofort mit `vaultInUse` erklärt, statt endlos zu warten. Der Browser gibt den Lock auch nach dem tatsächlichen Schließen/Absturz der Seite frei. Der Lock enthält keine Praxisdaten.

Unabhängig von Web Locks wird die erwartete verschlüsselte Fassung mit der tatsächlich in IndexedDB liegenden Fassung **innerhalb derselben Schreibtransaktion** verglichen. Dabei werden auch Passphrase-/Recovery-/Passkey-Hüllen berücksichtigt. `writeVaultChecked` schützt Anlage, Änderungen der Zugangshüllen und Import. Importierte Blobs und Hülle werden zusammen atomar geschrieben. `commitVaultSnapshot` schützt die normalen Datenspeicherungen einschließlich Verlaufspunkt und Journalen für Dokument-/Marketing-Widerrufe bzw. Blob-Bereinigung. Ein abgewiesener Speicherversuch darf keine dieser Nebenwirkungen auslösen. Die endgültige Blob-Löschung vergleicht ebenfalls die erwartete Fassung innerhalb einer Transaktion.

`mergeLocal` lädt und entschlüsselt ausschließlich die aktuelle **lokale** Kopie, verwendet den bestehenden Worker/CRDT und wartet auf die Schreibwarteschlange sowie währenddessen eingegangene Änderungen. Erst danach installiert es den verbundenen Stand. Eine inzwischen erneut geänderte IndexedDB-Fassung wird wieder abgewiesen; es gibt kein erzwungenes Überschreiben. Unterschiedliche Tresor-IDs werden niemals verbunden. Schlüsselhüllen werden wie beim vorhandenen Geräteabgleich behandelt.

Ein später erfolgreicher Blob-Schreibvorgang darf einen vorherigen Fehler beim Speichern der Akte nicht zurücksetzen. Erst wenn der bestätigte Datenstand zur aktuellen Akte passt, wird die Fehlermeldung aufgehoben. Die Update-/Sperrschutzpfade bleiben unverändert auf erfolgreiche Speicherung angewiesen.

**Grenze:** Bereits geöffnete alte App-Versionen kennen diese neue Schreibprüfung nicht. Vor der gemeinsamen Nutzung alle Fenster schließen und auf die neue Fassung aktualisieren. Der Schutz gilt pro Browserprofil/Herkunft; getrennte Geräte/Browserprofile verwenden weiterhin den bestehenden verschlüsselten Cloud-Abgleich. Ein fehlgeschlagener Schreibvorgang erfordert, das betroffene Fenster geöffnet zu lassen und Speicherung/Zusammenführung erfolgreich abzuschließen.

### Sicherungsbezug

`BackupState.sourceId` ist additiv und gerätelokal. Es ist ein SHA-256-Fingerabdruck aus zufälliger Tresor-/IV-Kennung und verschlüsselten Zugangshüllen, ohne Texte oder Dateinamen. Die Daten selbst werden nicht als Klartext gehasht oder neu gespeichert. Alte Metadaten ohne `sourceId` bleiben mit der bisherigen Zeitstempellogik lesbar.

Manueller aktueller Export, automatische Datei-/Ordnersicherung und erfolgreicher Cloud-Abgleich übergeben den Fingerabdruck genau der tatsächlich exportierten Hülle. Historische Downloads ändern `BackupState` nicht. Der Dateiprüfungs- bzw. manuell bestätigte Gerätetest-Nachweis aus 0.2.0 bleibt getrennt.

### Fehlergrenzen

`VaultAreaBoundary` liegt unter `App`/`useVault`, jeweils um Seiten und um die Dialoge. Navigation zu einer anderen Seite setzt die entsprechende Grenze zurück. Aufnahme/Wiedergabe werden beim Darstellungsfehler gestoppt. Der Wiederaufnahme-Knopf versucht die vorhandenen Entwurfs- und Akten-Speicherpfade und lädt die Seite nicht neu. Die globale `ErrorBoundary` bleibt für Fehler außerhalb dieser Bereiche erhalten; ihre Texte stammen jetzt ebenfalls aus den Sprachdateien und versprechen keine Speicherung ausstehender Eingaben. Es werden keine Fehlernachrichten mit möglichen eingegebenen Inhalten zusätzlich protokolliert.

Die Schutzgrenze kann einen bereits laufenden physischen Browser-/Betriebssystemabbruch nicht verhindern. Noch nicht übernommene Eingaben rein lokaler Formulare sind bei einem Fehler ihres eigenen Formulars nicht pauschal wiederherstellbar. Automatisch gesicherte Entwürfe und bestätigte Tresorstände bleiben nutzbar.

### Newsletter-Entwürfe: Datenmodell und Lebenszyklus

Neue additive Sammlung `newsletterDrafts` mit `id`, `createdAt`, `savedAt`, `updatedAt` und `payload`:

- `channel`, `title`, `titleUk`, `content`, `contentUk`, `clientIds`, optional `image: DocumentFile`.
- Alte Tresore erhalten `[]`; das bestehende verschlüsselte Sicherungsformat bleibt unverändert.
- `useNewsletterDraft` speichert Metadaten nach 700 ms Ruhe, vor Sperren/Update, beim Verbergen und bestmöglich beim Abbau des Bereichs. Harte Browserabbrüche innerhalb des Zeitfensters bleiben eine technische Grenze.
- Bildbytes werden sofort über das bestehende verschlüsselte Blob-Verfahren abgelegt. Vorschaubilder bleiben flüchtige Blob-URLs im Arbeitsspeicher.
- Die Sammlung ist Teil von CRDT/Merge, Dateiverweisen, Cloud-Dateiliste, Backup/Import, Wiederherstellung und Verlauf. Bei konkurrierenden Varianten bleibt die gesamte Formulareingabe als kohärente Variante erhalten; die Konfliktprüfung zeigt Texte, Kanal, Empfängerzahl und Bild statt technischer JSON-Daten. Alle Varianten behalten ihre Blob-Verweise bis zur Auflösung.
- Klientenlöschung entfernt die Empfänger-ID auch aus versteckten Konfliktvarianten; der Merge entfernt unbekannte Klienten-IDs. Der lesbare Klientenexport enthält nur die Auswahl der exportierten Person, keine IDs anderer Empfänger, sowie zugehörige Entwurfstexte und Bilder.
- Beim bewussten Versand wird der verwendete Entwurf in derselben verschlüsselten Aktenänderung entfernt, die den Versand ins Archiv übernimmt. Empfangsberechtigungen und Versandbestätigungen bleiben im bestehenden Versandpfad. Es gibt keine automatische Wiederholung beim Fortsetzen.
- Verwerfen entfernt den aktiven Entwurf und setzt die normale Löschmarkierung. Bereits gespeicherte verschlüsselte Verlaufsstände bzw. vorher exportierte Sicherungen können ältere Entwürfe behalten. Nicht mehr benötigte Bilder werden entfernt, sobald weder aktive Daten, Konflikte noch aufbewahrte Verlaufspunkte darauf zeigen. Das entspricht der vorhandenen Verlaufsaufbewahrung; Verwerfen ist keine Fernlöschung älterer Sicherungsdateien.

### Speicherplatzanzeige

`StorageHealthProvider` liest nur die Browser-Standards `navigator.storage.estimate()` und `persisted()`. Nach Änderungen wird gedrosselt geprüft, zusätzlich beim erneuten Anzeigen und alle 30 Sekunden im Vordergrund. Vor größeren Blob-Schreibvorgängen wird die geschätzte zusätzliche verschlüsselte Dateigröße berücksichtigt. Werte bleiben im Arbeitsspeicher. Es werden keine neuen Serveranfragen oder Telemetrie eingeführt und keine Daten automatisch gelöscht.

Warnschwellen: ab 80 % geschätzter Belegung oder höchstens 50 MiB Restplatz; dringender Hinweis ab 95 % bzw. höchstens 10 MiB. Schätzungen beziehen sich auf das Browserkontingent der Herkunft, nicht auf die gesamte Festplatte. Persistenz ist keine Zusicherung gegen Geräteverlust, manuelles Löschen oder Browserfehler.

## Infrastruktur und Übergabe

Keine neuen NPM-Pakete, SQL-Migrationen, kostenpflichtigen Dienste oder Audio-/KI-Dienste. Keine Änderung des Verschlüsselungs- oder Supabase-Synchronisationsformats. Die Sammlung für Entwürfe erweitert den verschlüsselten Inhalt additiv. Bei der Veröffentlichung alle Geräte aktualisieren. Die App-Version ist unter Einstellungen sichtbar.

## Prüfungen

- `npm test`: **325 bestanden**, keine fehlgeschlagenen oder übersprungenen Unit-Tests.
- `npm run build`: erfolgreich; keine neuen Pakete. Die bekannte Warnung zum großen Haupt-JavaScript bleibt sichtbar.
- Vollständiger lokaler Browserlauf mit 250 Fällen: 221 bestanden, 26 vorgesehene Skips. Zwei Prüfungen erwarteten noch die alten Notfalltexte und wurden auf die neue Bereichs-Wiederaufnahme angepasst. Ein Video-Test verlor seine Testinstanz durch ein Neuladen des Entwicklungsservers.
- Abschließender ungestörter Lauf mit Barrierefreiheit, Video, Speicher-/Darstellungsfehlern, Updates und allen neuen Ansichten: **27 bestanden, 3 vorgesehene Skips**. Beide zuvor veralteten Erwartungen und der Videofall sind darin erfolgreich geprüft. Die UDP-Sperre der Cloud wurde respektiert; ein erfolgreicher externer Videoanruf wurde nicht vorgetäuscht.
- Neue Unit-Tests prüfen atomare konkurrierende Schreibzugriffe, Schlüsselhüllen, Import/Blob-Löschung, unveränderte Journale nach Abweisung, Fenstersperren, Sicherungsbezug, Speicher-Schätzwerte und Fehler-Fallbacks, Altdaten, Newsletter-CRDT-Konflikte, Löschungen einschließlich versteckter Empfänger-IDs, verschlüsselte Sicherungen/Dateiverweise und den scoped Klientenexport.
- Safari-CI des ersten 0.2.1-Stands: jeweils 60 Fälle pro Gerät erfolgreich; allein die neue Speicherplatz-Simulation fand ihre Warnung nicht. Der Test ersetzt nun das gesamte optionale `navigator.storage`-Objekt, statt Methoden eines eventuell fehlenden Browserobjekts umzudefinieren. Ein zusätzlicher Fall prüft ausdrücklich, dass fehlende Speicher-APIs verschlüsseltes Arbeiten nicht verhindern. Der Produktionscode brauchte dafür keine Änderung.
- Neue Browserprüfungen verwenden zwei Seiten desselben Browserprofils, deaktivieren Web Locks für den CAS-Fallback und testen tatsächliche lokale Verschlüsselung, Wiederaufnahme eines Entwurfs mit Bild, Verwerfen/Neuladen, ukrainische Texte, sehr große Schrift und axe auf 820/390 px.

Automatisierte Tests verwenden ausschließlich synthetische Akten und simulierte Versandzugänge; keine echten Nachrichten und kein echtes Supabase-Projekt. Ein echter iPadOS-Geräte-/Mikrofontest und die privaten Google-Freigaben sind dadurch nicht ersetzt. Die Safari-Engine-Prüfung ist im bestehenden GitHub-Workflow um `vault-safety.spec.ts` erweitert.

## Geänderte Dateien

- `HANDOFF.md`
- `README.md`
- `docs/speicherschutz-und-entwuerfe.md`
- `package-lock.json`
- `package.json`
- `playwright.ipad.config.ts`
- `src/App.tsx`
- `src/components/ErrorBoundary.tsx`
- `src/components/Newsletter.tsx`
- `src/components/StorageHealth.tsx`
- `src/components/SyncConflicts.tsx`
- `src/components/VaultAreaBoundary.tsx`
- `src/components/Welcome.tsx`
- `src/components/backup.tsx`
- `src/lib/backupExport.ts`
- `src/lib/backupState.ts`
- `src/lib/blobs.ts`
- `src/lib/buildInfo.ts`
- `src/lib/clientExport.ts`
- `src/lib/crdt.ts`
- `src/lib/db.ts`
- `src/lib/history.ts`
- `src/lib/marketingDelivery.ts`
- `src/lib/merge.ts`
- `src/lib/newsletterDrafts.ts`
- `src/lib/records.ts`
- `src/lib/storageHealth.ts`
- `src/lib/types.ts`
- `src/lib/useAutoBackup.ts`
- `src/lib/useNewsletterDraft.ts`
- `src/lib/useVault.ts`
- `src/lib/vaultAccess.ts`
- `src/locales/de.json`
- `src/locales/uk.json`
- `src/pages/SettingsPage.tsx`
- `src/setup-flow.css`
- `tests/browser/a11y.spec.ts`
- `tests/browser/release-safety.spec.ts`
- `tests/browser/render-recovery.spec.ts`
- `tests/browser/vault-safety.spec.ts`
- `tests/vault-safety.test.ts`
