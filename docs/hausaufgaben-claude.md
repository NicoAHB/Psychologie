# Hausaufgaben: Bedienung und Übergabe für Claude

Stand: Praxisraum 0.4.0. Die Erweiterung nutzt den vorhandenen verschlüsselten Tresor, dessen Sicherungen und die vorhandenen Versanddienste. Keine neuen NPM-Pakete, KI, automatische Auswertung, Audiofunktionen, Buchungsseite oder Klienten-Logins.

## Bedienung

1. Klientenprofil → **Hausaufgaben** → **Aufgabe auswählen**. 30 eigene, vollständig formulierte Arbeitsblätter in Deutsch und Ukrainisch sind nach sechs Themen geordnet. Suche, Favoriten und eigene Vorlagen helfen beim Wiederfinden.
2. Die Aufgabe öffnet sich zunächst in der Sprache des Klienten, unabhängig von der Oberfläche. Inhalt, Rhythmus und Reflexionsfragen lassen sich für diese einzelne Vergabe anpassen. Datum für Rückgabe und Rückgabeerwartung sind optional. Der Klientenname steht nur nach ausdrücklicher Auswahl im PDF.
3. Eine bereits vergebene Aufgabe bleibt auch nach Abschluss, Umbenennung einer Vorlage, Sprachwechsel oder Pause erkennbar. **Bisherige Vergaben** zeigt die früheren Fassungen und dokumentierte Übergaben. Erneute Vergabe verlangt eine ausdrückliche Bestätigung.
4. Im Terminformular können Aufgaben vorgemerkt werden. Sie werden mit dem Termin als gemeinsame Änderung gespeichert; bis dahin liegen sie im vorhandenen verschlüsselten Entwurf. Vormerkungen lassen sich entfernen. Offene Aufgaben können beim nächsten Termin als besprochen markiert werden; auch das wirkt erst beim Speichern.
5. Im Klientenprofil gibt es einen Überblick über offene Aufgaben und einen eigenen durchsuchbaren Verlauf mit Status, Datum, Rückmeldung und Versand/Übergabe. Strg/Cmd+K findet auch Titel, Aufgabentext und interne Rückmeldungen. Interne Rückmeldungen erscheinen niemals auf dem Arbeitsblatt.
6. **Arbeitsblatt als PDF** erzeugt lokal ein ausfüllbares AcroForm mit Unicode-Schrift und speichert es verschlüsselt bei den Dokumenten. Download und beide Versandkanäle verwenden dieselbe gespeicherte PDF-Fassung. Herunterladen gilt nicht als Versand.
7. **Per E-Mail** oder **per Telegram** öffnet den vorhandenen Versanddialog mit Text in der Klientensprache. Vor Wiederholungen oder nach einem unbestätigten Versuch muss der bisherige Versand geprüft und bestätigt werden. Es gibt keinen automatischen Wiederholungsversand. Versand setzt die bestehende Einrichtung voraus. Ein bestätigter Anbieter-Eingang beweist weder den Empfang noch das Lesen.
8. Persönliche oder extern erfolgte Übergaben werden ausdrücklich mit tatsächlichem Datum und Weg erfasst. Keine erfundenen Daten für ältere Freitextaufgaben.
9. **Ausgefülltes Dokument hinterlegen** speichert eine zurückgegebene Datei mit dem tatsächlichen Eingangsdatum neben dem Original. Mehrere Rückläufe bleiben erhalten. Dateien werden nicht automatisch interpretiert. In den Dokumenten stehen auch die bestehenden verschlüsselten Freigabelinks zur Verfügung; Linkerstellung ist kein Versandnachweis.
10. Eigene Vorlagen können in DE und/oder UA erstellt, bearbeitet und archiviert werden. Archivierung verhindert neue Vergaben, erhält aber frühere Fassungen. Fehlende Übersetzungen werden gekennzeichnet und nicht automatisch erzeugt.

## 30 Arbeitsblätter

Die sechs Bereiche sind Gefühle/Gedanken, Stress/Beruhigung, Selbstwert/Ressourcen, Alltag/Erholung, Beziehungen/Grenzen und Ziele/Fortschritte. Alle Inhalte stehen vollständig in `src/locales/de.json` und `uk.json`: Ziel, konkrete Schritte, Rhythmus und drei Reflexionsfragen. Es sind eigene allgemeine Arbeitsblätter, keine nachgebauten Diagnostikinstrumente. Die Beraterin wählt fachlich aus und passt die Übungen an die Person an. Es wird kein Behandlungserfolg behauptet.

## Daten und Migration

- `homeworkTemplates`: stabile Vorlagen-ID, versionierter gemeinsamer Inhaltssnapshot, optionale DE/UA-Fassungen, Kategorie, Archivstatus.
- `homeworkAssignments`: Klient, optionale Terminzuordnung, unveränderliche zugewiesene Inhaltsfassung, tatsächlicher Zuweisungszeitpunkt, optionales Rückgabedatum, offener/zurückgestellter/besprochener/beendeter Status, interne Rückmeldung und einzeln identifizierte manuelle Übergaben.
- `settings.homeworkFavorites`: pro Vorlagen-ID gemergte Favoriten im verschlüsselten Tresor. Ein Aufgabenwechsel verändert keine bereits zugewiesene Fassung.
- Alte `Session.homework`-Freitexte bleiben bestehen. Die Oberfläche leitet daraus einen stabilen Eintrag ab; Datum der Vergabe/Übergabe bleibt unbekannt. Erst eine bewusste Änderung oder PDF-Erstellung materialisiert einen eigenen Datensatz. Der Zeitpunkt dieser Übernahme wird separat erfasst.
- Session-Entwürfe erweitern ihre bestehende atomare `payload` um `homeworkSelections` und `homeworkReviewIds`. Maximal 30 Vormerkungen und 100 Besprechungsmarkierungen je Entwurf.
- Original-PDF und Rückläufe sind normale `ClientDocument`-Blobs; die Metadaten verweisen über `homeworkAssignmentId` auf die Aufgabe. `homeworkSnapshot` hält die tatsächlich gedruckte Fassung fest. Originaldatei, Sprache, Titel und Snapshot werden als atomarer `$worksheet`-CRDT-Wert zusammengeführt, Versand- und Rücklaufereignisse weiterhin einzeln.
- Bei abweichender PDF- und Aufgabenfassung nach einem Konflikt wird der Versand blockiert. Die alte PDF wird nicht überschrieben: Konflikt klären oder gewünschte Fassung neu vergeben.
- Vorlageninhalt max. 160 Zeichen Titel, 2.000 Ziel, 8.000 Schritte, 1.000 Rhythmus und sechs Fragen à 400 Zeichen. Rückmeldung max. 4.000 Zeichen. Importe prüfen Struktur und Datum.
- Alte Tresore/Sicherungen erhalten leere neue Listen. Kein Schemawechsel des Verschlüsselungsformats, keine neue SQL-Migration.

## Verschlüsselung, Merge, Sicherung und Löschung

`useVault.update` bleibt der einzige Speicherweg für Akten und Vorlagen; Dateien laufen über `addFile`, bevor sie IndexedDB erreichen. PDF-Erzeugung nutzt den vorhandenen lokalen `secure.worker.ts`, einschließlich lokal ausgelieferter Schriften. Keine weiteren Worker oder Dienste.

Die neuen Listen sind in `COLLECTIONS`, Restore, Sicherungs-Relevanz und Konfliktanzeige enthalten. Manuelle Übergaben werden nach Ereignis-ID, Favoriten nach Vorlagen-ID zusammengeführt. Gleichzeitige inhaltliche Änderungen bleiben als Alternativen im bestehenden Konfliktverfahren erhalten. Der ursprüngliche Last-Write-Wins-Ersatz wird nicht umgangen.

`referencedBlobs` erfasst Originale, Rückläufe und Konfliktvarianten über das bestehende Dokumentmuster. Sicherungsdateien, Verlaufs-Snapshots und Cloud-Dateilisten enthalten sie automatisch. Beim Löschen eines Termins bleibt die separat vergebene Aufgabe für die Wiederholungswarnung erhalten, die Terminreferenz entfällt. Endgültiges Löschen des Klienten entfernt Aufgaben, Dokumente, Blobs und zugehörige versteckte CRDT-Inhalte wie beim bisherigen Klienten-Löschablauf. Bereits exportierte Sicherungen können selbstverständlich nicht nachträglich verändert werden.

Der lesbare Klientenexport enthält `hausaufgaben.json` und `hausaufgaben.md`, die zugewiesenen Fassungen und Rückmeldungen sowie Dokument-Originale und Rückläufe. Kein Export anderer Klienten oder der allgemeinen eigenen Vorlagenbibliothek. Lesbare Exporte müssen wie bisher bewusst heruntergeladen und geschützt weitergegeben werden.

## Dateien

Kern: `homeworkTypes.ts`, `homeworkCatalog.ts`, `homework.ts`, `homeworkPdf.ts`, `prepareHomeworkPdf.ts`, `homeworkDelivery.ts` unter `src/lib/`.

Oberfläche: `src/components/homework.tsx`, `HomeworkFiles.tsx`, `homework.css`; Integration in Klientenprofil, Terminformular, Suche, Dokumente und bestehende Versanddialoge.

Bestehende Infrastruktur: Types/Defaults/Importvalidierung, CRDT/Merge, Records/Löschung, Restore, Backup-State, Klientenexport und Kontaktverlauf wurden gezielt erweitert. Die komplette Dateiliste liefert `git diff 065b12c..HEAD --name-only`.

## Prüfung und Übergabe

- `npm test`: Katalog in beiden Sprachen, Altdaten, Wiederholungen, Vorlagenversionen, unveränderte Snapshots, IDs, tatsächliche Zeitpunkte, Verschlüsselung, Merge/Löschung, Export, PDF-Felder und Unicode.
- `npm run build`: TypeScript strict, Worker/PDF-Build und Service Worker.
- `npm run test:e2e -- tests/browser/homework.spec.ts tests/browser/homework-files.spec.ts`: Vergabe, Favoriten/eigene Vorlagen, Archivierung, Entwurf/Sperren/Neuladen, Besprechung, Suche, PDF, Rücklauf, endgültiges Löschen. Axe prüft neue Dialoge mit großen Schriften und schmalen Viewports, DE/UA und Hell/Dunkel.
- `homework-delivery.spec.ts` läuft ausschließlich im fiktiven `email-test.supabase.co`-Build mit abgefangenen Requests. Prüft beide Kanäle, Klientensprache, bewusste Wiederholung, E-Mail-Idempotenz und identische Anhänge. Keine echten Nachrichten und kein Test gegen ein echtes Supabase-Projekt.
- Die neuen Arbeitsabläufe sind auch in der WebKit/iPad/iPhone-Prüfliste enthalten. Reale PDF-Programme unterscheiden sich bei ausgefüllten Feldern; der Hinweis steht am Arbeitsblatt.

Geänderte oder gelöschte Rückgabefristen werden zwischen Aufgabe und Dokument-Metadaten abgeglichen. Bereits erzeugte PDF-Dateien werden dabei nicht verändert.

Keine rechtliche oder datenschutzrechtliche Prüfung behauptet. Transportgrenzen der bestehenden E-Mail-/Telegram-Wege bleiben sichtbar und unverändert.

## Lokale Prüfergebnisse

- 347 Unit-Tests bestanden; Build mit TypeScript strict erfolgreich.
- Breiter Browserlauf: 236 bestanden, 24 umgebungsbedingt ausgelassen. Vier Beschriftungsfehler im Test wurden anschließend durch die einheitliche Bezeichnung „Hausaufgaben“ behoben.
- Abschließender Lauf der betroffenen Bereiche: 30/30 bestanden, einschließlich aller Axe-Prüfungen und Wechsel zwischen Aufgaben mit ungespeicherten Rückmeldungen.
- Sechs isolierte Sicherheits-/Hook-Tests bestanden.
- Simulierter E-Mail-/Telegram-Versand: beide neuen Tests und die sechs bestehenden E-Mail-Tests bestanden. Keine echten Nachrichten.

Der Produktionspfad und die GitHub-Workflows werden für den veröffentlichten Commit zusätzlich geprüft.

## Vollständige Dateiliste dieser Erweiterung

- `.github/workflows/checks.yml`
- `HANDOFF.md`
- `README.md`
- `docs/hausaufgaben-claude.md`
- `package-lock.json`
- `package.json`
- `playwright.ipad.config.ts`
- `src/App.tsx`
- `src/components/HomeworkFiles.tsx`
- `src/components/SyncConflicts.tsx`
- `src/components/client-profile.tsx`
- `src/components/documents.tsx`
- `src/components/forms.tsx`
- `src/components/homework.tsx`
- `src/components/telegram.tsx`
- `src/homework.css`
- `src/lib/backupState.ts`
- `src/lib/buildInfo.ts`
- `src/lib/clientExport.ts`
- `src/lib/contactHistory.ts`
- `src/lib/crdt.ts`
- `src/lib/discussion.ts`
- `src/lib/documents.ts`
- `src/lib/guide.ts`
- `src/lib/homework.ts`
- `src/lib/homeworkCatalog.ts`
- `src/lib/homeworkDelivery.ts`
- `src/lib/homeworkPdf.ts`
- `src/lib/homeworkTypes.ts`
- `src/lib/merge.ts`
- `src/lib/prepareHomeworkPdf.ts`
- `src/lib/records.ts`
- `src/lib/search.ts`
- `src/lib/types.ts`
- `src/lib/useVault.ts`
- `src/lib/workerTasks.ts`
- `src/locales/de.json`
- `src/locales/uk.json`
- `src/pages/ClientsPage.tsx`
- `src/workers/secure.worker.ts`
- `tests/browser/a11y.spec.ts`
- `tests/browser/guide.spec.ts`
- `tests/browser/homework-delivery.spec.ts`
- `tests/browser/homework-files.spec.ts`
- `tests/browser/homework.spec.ts`
- `tests/browser/pages.spec.ts`
- `tests/browser/release-safety.spec.ts`
- `tests/homework-backup.test.ts`
- `tests/homework-pdf.test.ts`
- `tests/homework.test.ts`
