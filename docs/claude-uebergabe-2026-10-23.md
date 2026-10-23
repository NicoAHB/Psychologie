# Übergabe an Claude – Praxisabläufe, Entwürfe und Dokumentfreigaben

Stand: 23. Oktober 2026. Diese Änderung baut auf den Sprach-Memos und wiederverwendbaren Memo-Titeln auf. Zuerst `README.md`, `HANDOFF.md` und `docs/lokale-werkzeuge-und-video.md` lesen. Keine realen Praxisdaten, privaten Schlüssel oder Audioaufnahmen gehören ins Repository.

## 1. Begleitung pausieren, abschließen und wieder aufnehmen

`Client.status` ist optional: fehlend bedeutet `active`. Zulässig sind `active`, `paused`, `closed`. **Keiner dieser Zustände löscht Daten, beendet Termine oder verändert Forderungen.** Die Liste zeigt standardmäßig aktive Klienten; die Auswahl erlaubt pausierte, abgeschlossene oder alle Akten. Die Zahl „Klienten in Begleitung“ zählt aktive Akten.

Im Profilformular stehen Status, Wiedervorlagedatum (`followUpOn`) und Anlass (`followUpNote`). Der Überblick zeigt den Statusverlauf und bei inaktiven Akten „Begleitung wieder aktivieren“. Eine Rückkehr auch Jahre später verwendet dieselbe Klienten-ID, dieselbe Historie, Dokumente und Finanzen. `clientStatus.ts` legt Statusereignisse mit eigener ID an; das ursprüngliche Ereignis hat eine deterministische ID, damit zwei Offline-Geräte es nicht doppelt erzeugen. Die Ereignisse werden im CRDT einzeln zusammengeführt. Gleichzeitige widersprüchliche Statusänderungen bleiben prüfbare Konflikte.

## 2. Verschlüsselte Sitzungsentwürfe

Additive Sammlung `VaultData.sessionDrafts`, bei alten Tresoren und Sicherungen `[]`. Schema und Backupformat bleiben unverändert. Entwürfe sind **keine Sitzungen** und erzeugen keine Einnahmen, Rechnungen oder Terminabschlüsse. Metadaten und klinische Texte bleiben im AES-GCM-verschlüsselten Tresor. Neue Fotos und beendete Aufnahmen verwenden dieselbe verschlüsselte Blob-Ablage wie bestehende Anhänge.

`useSessionDraft.ts` sichert Formulardaten nach 700 ms Ruhe sowie vor Sperren, Aktualisieren und beim Verbergen der Seite. Neue Fotos werden nach Auswahl lokal komprimiert, verschlüsselt und sofort mit dem Entwurf verbunden. Im Sitzungsformular sichert der Memo-Dialog die Aufnahme schon nach Stopp, auch vor „Memo übernehmen“; Metadaten werden nach einer kurzen Eingabepause ergänzt. Während einer noch laufenden Aufnahme sind die MediaRecorder-Teile weiterhin flüchtig. Ein hartes Beenden durch iPadOS vor Abschluss eines Schreibvorgangs lässt sich nicht vollständig absichern.

Schließen/Abbrechen erhält den Entwurf; „Entwurf verwerfen“ entfernt ihn. Aufgabenübersicht und ein Hinweis beim erneuten Öffnen bieten „Entwurf fortsetzen“ an. Beim endgültigen Sitzungsspeichern werden die vorhandenen verschlüsselten Dateien übernommen, ohne erneut das Audio zu verschlüsseln. Erst dann werden eigene Memo-Bezeichnungen gelernt.

Entwürfe gehören zu Dateireferenzen, Cloud-Abgleich, verschlüsselten Backups, lesbarem Klientenexport und Verlauf. `payload` ist ein zusammenhängendes CRDT-Register: konkurrierende Formularfassungen bleiben Varianten. Verschiedene neue Entwürfe haben eigene IDs. Beim Verwerfen/Übernehmen werden alte Entwurfsfassungen aus den lokalen verschlüsselten Verlaufspunkten entfernt. Das Löschen von Sitzung/Klient entfernt zugehörige Entwürfe. Audio-Löschungen bereinigen auch Aufnahmen und Kurzfassungen in sichtbaren und konkurrierenden Entwurfsversionen. Exportierte externe Sicherungen können nicht nachträglich verändert werden.

Alle Geräte vor weiterer paralleler Arbeit aktualisieren; ältere Programmstände kennen die neue Sammlung nicht.

## 3. Aufgaben für den Praxistag

`workItems.ts` leitet Aufgaben aus den Akten ab: Entwurf fortsetzen, vergangenen Termin dokumentieren, leere Sitzungsdokumentation ergänzen, Rechnung für noch nicht abgerechnete Sitzungen erstellen, fällige Wiedervorlage öffnen. Die bestehende Rücklauf-/Forderungsübersicht bleibt daneben erhalten. Erledigte tatsächliche Arbeit entfernt die entsprechende abgeleitete Aufgabe; Wiedervorlagen lassen sich explizit erledigen. Auch bei pausierten Akten bleiben offene Dokumentations- und Finanzaufgaben sichtbar. Listen werden schrittweise erweitert.

## 4. Sicherungsprüfung und Warnung

`backupState.latestChange` prüft alle gestempelten Sammlungen und Einstellungen, jetzt auch Sprach-Memos und Entwürfe. „Sicherung prüfen“ wählt eine externe verschlüsselte JSON-Sicherung und fragt deren Passphrase ab. Der vorhandene lokale Secure-Worker entschlüsselt den Tresor und **jeden** enthaltenen Anhang mit dem dateigebundenen AAD; fehlende, doppelte, fremde und beschädigte Dateien führen zu einem Fehler. Die aktive Akte wird nicht importiert oder überschrieben. Passphrase und Klartext werden nicht gespeichert oder übertragen.

Ein erfolgreich ausgelöster Datei-Download ist noch kein Beweis für eine wiederherstellbare Datei. Deshalb wird die Prüfung getrennt angeboten. Der Text erklärt auch, dass der In-App-Verlauf auf demselben Gerät keine unabhängige externe Kopie ist.

## 5. Memo-Vorschläge verwalten

Einstellungen → Memo-Bezeichnungen: Suche, Favoriten, eigene Bezeichnungen umbenennen/entfernen. Standardbegriffe bleiben übersetzt verfügbar. Die Favoritenmenge `settings.memoLabelFavorites` wird wie eigene Vorschläge pro Eintrag im CRDT geführt. Titel bestehender Memos ändern sich dadurch ausdrücklich nicht. Ergebnislisten bleiben begrenzt.

## 6. Vertrauliche Dokument-Links: notwendige Einrichtung

1. Im vorhandenen Supabase-Projekt **`supabase/document-shares.sql`** im SQL-Editor ausführen. Migration ist wiederholbar; bestehende Akten werden nicht verändert.
2. Vorhandene öffentliche Build-Variablen `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` weiterverwenden; kein neuer Anbieter und kein Service-Role-Key im Frontend.
3. Für tägliches physisches Entfernen abgelaufener Freigaben die kostenlose Supabase-Erweiterung `pg_cron` aktivieren und die Migration erneut ausführen. Sie legt dann einen täglichen Bereinigungsjob an. **Die Abrufberechtigung endet unabhängig davon sofort mit der serverseitigen Ablaufzeit.** Ohne Cron werden abgelaufene Freigaben dieses Besitzers beim nächsten Erstellen bereinigt.
4. Mit einem fiktiven TXT-Dokument im eigenen Projekt prüfen: Link erstellen, in privatem Browser ohne Anmeldung öffnen, herunterladen, widerrufen, erneuten Abruf ablehnen. Es wurde aus dieser Entwicklungsumgebung keine reale Supabase-Migration ausgeführt und keine echte Klientenunterlage freigegeben.

Unter Dokumente öffnet „Vertraulicher Dokument-Link“ eine geprüfte Freigabe für **nur eine** Datei. Dateiinhalt, Dateiname und MIME-Metadaten werden auf dem Gerät zusammen mit einem neuen Schlüssel verschlüsselt. Supabase erhält nur Ciphertext, zufällige ID, Besitzer, Ablaufzeit und Hash eines separaten Abruf-Tokens. Der Tresorschlüssel wird niemals verwendet oder übertragen.

Der vollständige Link enthält Schlüssel und Abruf-Token ausschließlich im URL-Fragment. Der Gast benötigt kein Konto; ein eigener flüchtiger Supabase-Client verwendet keine gespeicherte Therapeuten-Anmeldung. Entschlüsselung läuft im Browser-Worker, der Download über eine kurzlebige Blob-URL. Es gibt kein serverseitiges Entschlüsseln, keine Analytik, kein Caching von Dokumenten und keine neuen externen Hosts. Optional schützt eine zusätzliche Passphrase ab zwölf Zeichen; sie über einen anderen Kontaktweg mitteilen und nicht im Link speichern.

Laufzeiten: ein, drei oder sieben Tage. Grenze: 10 MiB Rohdatei, maximal 30 aktive Links und 32 MiB Ciphertext je Besitzer, zusätzlich zu den tatsächlichen Supabase-Free-Tier-Limits. Für eine Praxis ist das eine begrenzte Freigabeablage, kein zweites dauerndes Dokumentarchiv. PDFs, Bilder, TXT, DOCX und ODT werden als Download bereitgestellt, niemals als aktives HTML dargestellt.

Widerruf löscht die serverseitige verschlüsselte Kopie. Bereits heruntergeladene Dateien lassen sich nicht zurückrufen. Bei Akten-/Dokumentenlöschung werden die betreffenden Freigabe-IDs lokal zur Sperrung vorgemerkt; bei der nächsten Online-Anmeldung wird die Sperrung nachgeholt. Währenddessen gilt weiterhin die serverseitige Ablaufzeit. Kopierbare Links liegen nur im verschlüsselten Tresor; der lesbare Klientenexport lässt die Link-Schlüssel weg. Verbindungsmetadaten beim Host/Supabase und organisatorische Voraussetzungen für den Praxiseinsatz sind weiterhin zu berücksichtigen; die Funktion ist kein pauschaler Rechtskonformitätsnachweis.

## 7. iPad und Prüfungen

Siehe **`docs/ipad-abnahme.md`**. Neue Browserfälle prüfen Wiederaufnahme, Filter, Entwürfe einschließlich gestoppter MP4-Aufnahme nach Neuladen/Sperren, Offline-Eingabe, Favoriten, Dialoge und axe. Der separate Workflow „Safari engine and tablet recovery“ führt dieselben Praxisabläufe mit WebKit in iPad-/iPhone-Größen aus. WebKit auf Linux ist kein echter iPadOS-Gerätetest. Der WebKit-Download in dieser Cloud wurde mit HTTP 403 „Domain forbidden“ blockiert; die lokale Richtlinie wurde nicht umgangen. Der GitHub-Workflow führt den Download in seinem eigenen Runner aus.

Neue Bibliotheken: **keine**. Bestehende Browser-Standards, Secure-Worker, Web Crypto, IndexedDB, Supabase und Playwright werden weiterverwendet. Keine KI, Transkription, Spracherkennung oder Audio-Modelle.

Lokale Prüfergebnisse stehen in `HANDOFF.md`. Den zugehörigen Quellstand mit `git log -1` und die ergänzenden GitHub-Läufe unter Actions prüfen.

### Ergänzung aus der Safari-Prüfung

Die gemeinsame `Modal`-Komponente rendert native Dialoge über ein Body-Portal, schließt sie synchron im Layout-Effect vor dem Entfernen und stellt den Fokus wieder her. Escape wird nur vom obersten Dialog verarbeitet. Touch-Eingaben haben mindestens 16 px Schrift, damit iOS beim Fokussieren nicht automatisch zoomt; die manuelle Seitenvergrößerung bleibt erlaubt.

Der WebKit-Test fixiert den synthetischen `mediaDevices`-Ersatz direkt am Navigator, damit kein nativer Mikrofonzugriff stattfindet. Der separate GitHub-Job verwendet das offizielle Playwright-Image `v1.64.1-noble` mit bereits installierter Safari-Engine. Bei Änderung der Playwright-Version in `package-lock.json` muss die Image-Version mitgezogen werden.
