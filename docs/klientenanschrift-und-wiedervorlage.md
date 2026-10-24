# Klientenanschrift und Wiedervorlage

## Bedienung

Im Klientenprofil **Profil bearbeiten → Wiedervorlage am → Datum löschen → Speichern** wählen. Das Datum kann auch über die Tastatur gelöscht werden. Die zugehörige Notiz bleibt erhalten. **Abbrechen** verwirft die Änderung wie bisher.

Die Wiedervorlage hat einen eigenen, klar abgegrenzten Bereich. Der Löschknopf steht in einer separaten Rasterzeile unter dem Datumsfeld; damit kann das native Safari-Datumsfeld ihn auch bei großer Schrift nicht überlagern. Die Auswahl **Passenden Anlass auswählen** bietet sieben Gründe: Nachfragen nach einer Pause, Rückmeldung abwarten, nächsten Termin abstimmen, Aufgabe/Übung nachbesprechen, Unterlagen anfragen, Beratungsbedarf erneut klären und nach dem Abschluss nachfragen.

Ein Vorschlag füllt das größere, frei bearbeitbare Notizfeld. Ein noch unveränderter Standardvorschlag lässt sich durch einen anderen ersetzen. Eigene Notizen werden ergänzt und bleiben erhalten; derselbe Grund wird auch nach dem DE/UA-Wechsel nicht doppelt angehängt. Wenn der Text mit dem Vorschlag länger als 500 Zeichen wäre, bleibt die Notiz unverändert und ein Hinweis erscheint. Das Datum wird durch die Grundauswahl nicht verändert. Erst **Speichern** übernimmt die vorhandenen Felder `followUpOn` und `followUpNote` in den verschlüsselten Tresor; das Datenmodell bleibt dafür unverändert.

Unter **Klient anlegen** und beim Bearbeiten sind Anschriften in einzelne Felder aufgeteilt: Straße und Hausnummer, optionaler Adresszusatz, Postleitzahl, Ort/Stadt und Land. Für die Ukraine gibt es zusätzlich eine optionale Region/Oblast mit Bezirk oder Gemeinde; die Postleitzahl steht hinter Ort und Region. Im Adresszusatz lassen sich etwa Wohnung, Stockwerk oder Gebäudeteil ergänzen. Auf Rechnungen folgt die Anschrift derselben Reihenfolge.

Das Land steuert die Adressreihenfolge. Die Sprache des Klienten ist davon unabhängig: ukrainischsprachige Personen mit deutscher Anschrift erhalten eine Anschrift in deutscher Reihenfolge. Bei neuen Akten schlägt die Sprachauswahl zunächst Deutschland oder die Ukraine vor; eine ausdrücklich eingetragene Länderauswahl wird dabei beibehalten. Eigene Adresstexte werden beim Wechsel der Oberflächensprache nicht übersetzt.

Deutsche und ukrainische Postleitzahlen bleiben als Text mit fünf Ziffern gespeichert, einschließlich führender Nullen. Alle Adressfelder bleiben optional. Andere Länder und alphanumerische Postleitzahlen sind weiterhin möglich. Die Unterstützung ersetzt keine weltweite postalische Adressprüfung.

Erkennbare ältere deutsche/ukrainische Anschriften werden für das Formular aufgeteilt. Bei unbekannten Formaten stehen die vollständigen bisherigen Zeilen im Adresszusatz, mit einem Hinweis zum manuellen Zuordnen. Eine Änderung etwa der Wiedervorlage oder des Namens schreibt eine alte Anschrift nicht automatisch um.

## Technische Übergabe für Claude

- `Client.postalAddress` ergänzt die bisherige Zeichenkette `address` optional. Die strukturierte Anschrift ist ein zusammenhängender CRDT-Wert; gleichzeitig geänderte Anschriften bleiben als ganze, prüfbare Varianten erhalten. Es werden keine Teile verschiedener Anschriften vermischt.
- Für strukturierte Anschriften ist `address` eine abgeleitete Druckfassung. Sie wird nach Zusammenführung und Wiederherstellung aus derselben Anschrift erzeugt. Ältere Akten ohne das neue Feld behalten ihr bisheriges Format. Ungeklärte Anschriftvarianten blockieren das Ausstellen einer Rechnung wie bisher bei anderen Rechnungsdaten.
- Bearbeitet eine ältere App nur die Textanschrift und reicht die neue strukturierte Anschrift unverändert samt CRDT-Metadaten durch, erkennt die Normalisierung diese Änderung vor dem Abgleich. Auch das Leeren wird übernommen. Eine tatsächlich neu bearbeitete strukturierte Anschrift wird dabei nicht durch eine veraltete Druckfassung ersetzt.
- Klientenformular, Konfliktanzeige, Rechnungen, verschlüsselte Sicherungen und lesbarer Klientenexport berücksichtigen die Anschrift. Das bestehende endgültige Löschen entfernt auch ihre CRDT-Varianten.
- „Datum löschen“ leert ausschließlich die Formulareingabe; die vorhandene Speicherung überträgt das entfernte Datum als kausale Feldlöschung. Alte synchronisierte Kopien stellen ein beobachtet gelöschtes Datum nicht wieder her.
- Keine Supabase-Migration, neuen Pakete, externen Adressdienste oder zusätzlichen Netzwerkverbindungen. Alle Klientendaten durchlaufen weiterhin die bestehende Verschlüsselung.

## Dateien

`src/lib/clientAddress.ts`, `src/lib/types.ts`, `src/lib/crdt.ts`, `src/lib/invoice.ts`, `src/components/ClientAddressFields.tsx`, `src/components/forms.tsx`, `src/components/SyncConflicts.tsx`, `src/practice-features.css`, `src/locales/de.json`, `src/locales/uk.json`, `tests/client-address.test.ts`, `tests/browser/client-address.spec.ts`, `tests/browser/invoice.spec.ts`, `playwright.ipad.config.ts`, `HANDOFF.md` und diese Dokumentation.

Für die ergänzte Darstellung und Grundauswahl: `src/components/FollowUpFields.tsx`, `src/lib/followUpReasons.ts`, `tests/follow-up-reasons.test.ts` und `tests/browser/follow-up-fields.spec.ts`; Integration in `forms.tsx`, `practice-features.css`, beide Sprachdateien und Safari-Testkonfiguration.

## Prüfung

Unit-Tests prüfen Adressreihenfolge und führende Nullen, unveränderte Altdaten, das Entfernen einer Wiedervorlage beim Offline-Abgleich, vollständige Konfliktvarianten und deren Auflösung, Rechnungen, leere Anschriften, verschlüsselte Sicherung/Wiederherstellung, Klientenexport sowie endgültige Löschung. Browserfälle prüfen DE/UA, Tastaturbedienung einschließlich Abbrechen, Neuladen nach Sperren und den Erhalt älterer Anschriften. Axe und Layoutprüfungen decken große Schrift bei 820 px hell und 390 px dunkel ab. Die neuen Fälle sind auch im Safari-/iPad-Workflow enthalten. Es werden ausschließlich erfundene Daten verwendet und keine echten Nachrichten versendet.

Lokale Abnahme: `npm test` – **273 bestanden**; `npm run build` erfolgreich. Die **38** Browserprüfungen für Barrierefreiheit, Anschriften, Rechnungen, Klienten-/Sitzungsabläufe und endgültige Löschung bestanden. Nach Ergänzung der Übernahme alter Textfeld-Änderungen bestanden zusätzlich alle **10** gezielten Anschrift-/Rechnungsprüfungen auf Desktop und Mobilgerät erneut. Die technische Safari-Engine wird zusätzlich automatisch in GitHub Actions geprüft; das ist kein Hardwaretest auf einem echten iPad.

Abnahme der ergänzten Darstellung/Gründe: **277 Unit-Tests**, Build und **26 Browserprüfungen** für Wiedervorlage, Anschriften und Praxisabläufe bestanden. Die neuen Fälle prüfen ausdrücklich den vertikalen Abstand zwischen Datumsfeld und Löschknopf, große Schrift bei 820/390 px, DE/UA, axe, Beibehaltung eigener Notizen, doppelte Auswahl, Textgrenze sowie verschlüsselte Speicherung nach Sperren/Neuladen. Hell und Dunkel wurden zusätzlich anhand der erzeugten Ansichten visuell geprüft.
