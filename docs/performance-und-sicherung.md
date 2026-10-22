# Performance, Sicherung und Datenübertragung

## Schriften und Offline-PDFs

`scripts/build-sw.mjs` trennt App-Cache und Runtime-Cache. Nur die reguläre lateinisch-kyrillische Basisschrift (137 KB statt rund 1,47 MB für beide vollständigen TTF-Dateien) wird beim Installieren geladen. Sie enthält auch ukrainische Zeichen, kombinierende Akzente, Satzzeichen, Euro- und Hrywnja-Symbole. `loadPdfFonts` prüft die benötigten Zeichen. Fettschrift und bei Bedarf vollständige Schriften werden erst bei der PDF-Erstellung geladen und anschließend unter ihren Asset-URLs gecacht. Tresordaten, API-Antworten und Nutzerdateien werden nicht im Service-Worker-Cache gespeichert.

Ein erstes PDF funktioniert auch offline: Bei nicht verfügbarer Fettschrift übernimmt die reguläre Basisschrift diese Rolle. Zeichen außerhalb des Basissatzes benötigen einen vorherigen Online-Abruf der vollständigen Schrift. Nicht von DejaVu unterstützte Alphabete werden dadurch nicht zusätzlich unterstützt. PDF-Formulartexteingaben unterstützen den eingebetteten Basissatz.

Die kleineren TTF-Dateien liegen versioniert unter `src/assets/`. Zum erneuten Erzeugen optional `fonttools` installieren und `python scripts/subset-fonts.py` ausführen. Die Build-Pipeline benötigt diese Werkzeuge nicht. Lizenz: `src/assets/FONT-LICENSE.txt`.

## Playwright in GitHub Actions

`checks.yml` speichert `~/.cache/ms-playwright` mit Betriebssystem, Architektur und Lockfile-Hash. Bei einem Treffer werden nur die Betriebssystembibliotheken installiert. Ein fehlender Cache führt zur vollständigen Browserinstallation. Browser- und Playwright-Versionen können dadurch nicht versehentlich auseinanderlaufen.

## In-App-Sicherung, auch auf iPad/Safari

Jede erfolgreich gespeicherte Tresoränderung schreibt den AES-GCM-Chiffretext und einen Wiederherstellungspunkt gemeinsam in **einer IndexedDB-Transaktion**. Es wird nicht auf einen späteren Dateidialog oder einen verlässlich ausgelösten `unload`-Handler vertraut. Innerhalb von zehn Minuten wird der aktuelle automatische Punkt aktualisiert; bis zu 30 Punkte werden gehalten. Vor einer Löschung entsteht zusätzlich ein eigener Punkt. Bilder und Dokumente werden verschlüsselt geteilt und erst entfernt, wenn weder aktueller Tresor noch Sicherungen sie benötigen. Heruntergeladene historische Stände enthalten ihre referenzierten Dateien. Beim Löschen eines ganzen Klienten werden die lokale Historie und dadurch verwaiste Dateien entfernt.

In den Einstellungen kann jeder Stand wiederhergestellt oder als verschlüsselte Sicherung heruntergeladen werden. Eine Wiederherstellung übernimmt auch die damaligen Einstellungen. Alte Stände ohne Dateireferenzen können keine bereits früher endgültig gelöschten Bilder zurückholen.

Die Historie ist eine lokale Rückfallebene und **keine Sicherung außerhalb des Browsers**. Sie schützt nicht vor dem Löschen sämtlicher Browserdaten, Geräteverlust oder Storage-Eviction. Der Hinweis auf externe Sicherung bleibt deshalb aktiv. Noch nicht bestätigte Formularentwürfe sind keine gespeicherten Änderungen. Die Vorbereitung wird nach einer kurzen Schreibpause, bei Fokusverlust und beim Verlassen der Seite gespeichert. Ein Betriebssystem kann die Seite ohne Vorwarnung beenden; absolute Verlustfreiheit lässt sich deshalb nicht zusichern.

## Automatische Sperre

Unter Einstellungen → Zugang sind 5, 10, 15, 30, 60 oder 90 Minuten wählbar. Standard und Rückfall bei ungültigen älteren Werten: 10 Minuten. Die Wahl liegt verschlüsselt im Tresor. Auch beim Zurückkehren aus dem Hintergrund und beim nächsten Eingabeereignis wird die Frist geprüft. Manuelles Sperren bleibt sofort möglich.

## Ausgefüllte Fragebogen-PDFs importieren

Bei einem PHQ-9-/GAD-7-Dokument „Ausgefüllte Datei hinterlegen“ wählen. Die bereits verwendete lokale Bibliothek `pdf-lib` liest AcroForm-Felder, ohne PDF-Skripte auszuführen oder Daten hochzuladen. Neue PDFs enthalten Instrument-, Versions- und Dokumentkennungen, aber keine vorausgefüllten Klientendaten. Ältere eigene PDFs werden anhand ihrer Antwortfelder unterstützt.

Jede Antwort muss vorhanden und eine ganze Zahl von 0 bis 3 sein. Falsche Dokumentzuordnung, unvollständige Antworten und nicht unterstützte PDFs werden angezeigt. Ein Scan oder eine flach gespeicherte PDF bleibt als gewöhnlicher Rücklauf speicherbar; daraus wird keine Bewertung erfunden.

Die Beraterin prüft Klientenzuordnung, Antworten und Ausfülldatum und bestätigt die Übernahme. Fehlt ein gültiges Ausfülldatum, muss es vor der Übernahme eingetragen werden. Erst dann werden Rücklauf und Ergebnis gemeinsam im verschlüsselten Tresor gespeichert. Das Ergebnis erscheint in den bestehenden Verlaufsdiagrammen. Ein SHA-256-Dateiabgleich verhindert eine versehentliche zweite Übernahme derselben PDF für denselben Klienten. Rücklauf und Ergebnis verweisen aufeinander. PHQ-9-Antworten mit Hinweis auf Selbstgefährdung erhalten den vorhandenen fachlichen Hinweis; die Auswertung ist keine Diagnose.

## Lesbarer Klientenexport

Im Profil → „Datenexport (ZIP)“ wird ein vollständiges, unverschlüsseltes Archiv genau dieses Klienten erstellt. Enthalten sind Profil und Vorbereitung, Termine, Sitzungen, Fotonotizen, Fragebögen, Finanz-CSV, Rechnungsdaten, Dokumente, Rückläufe und Versandhistorie. Markdown-Dateien sind lesbar; `daten.json` enthält vollständige strukturierte Datensätze. Originaldateien und Bilder werden lokal entschlüsselt. Nicht lokal verfügbare Dateien werden über den vorhandenen authentifizierten Cloud-Download bezogen; fehlt eine Datei, schlägt der vollständige Export sichtbar fehl.

Das Archiv enthält keine anderen Klienten und keine Tresorschlüssel. Dateipfade werden bereinigt; CSV-Formelzellen werden entschärft. Der Export ist lesbar und muss geschützt gespeichert und gezielt übergeben werden. Er unterstützt Datenübertragbarkeit, ersetzt aber keine fachliche oder rechtliche Prüfung des konkreten Auskunftsumfangs.

## NBU-Kursverlauf und Offline-Rückfall

Offizielle EUR/UAH-Abrufe werden mit Kursdatum in IndexedDB gespeichert (bis zu 90 Tageswerte). Ein vorhandener heutiger Kurs wird ohne erneute Anfrage verwendet; der Aktualisieren-Button fragt ausdrücklich neu ab. Gleichzeitige Anfragen teilen einen laufenden Abruf. Schlägt er fehl, wird der jüngste gültige lokale Kurs beziehungsweise der vorhandene Kurs aus dem Tresor verwendet. Die Oberfläche kennzeichnet den Rückfall und zeigt das tatsächliche Kursdatum. Manuelle Änderungen während eines laufenden Abrufs werden nicht überschrieben. Historische Sitzungs- und Rechnungsbeträge behalten ihre eingefrorenen Kurse.

Die App sendet keine Klienteninformationen an die NBU. Es wird kein Proxy zur Umgehung von Netzwerkrichtlinien verwendet. Eine blockierte Domain in einer Entwicklungsumgebung sagt nichts über den direkten Zugriff vom privaten Gerät aus. Bei fehlendem Zugriff funktionieren der datierte Cache und die manuelle Eingabe weiter.

## Telegram: Versand vor Wiederholung schützen

**Vor dem Einsatz des aktualisierten Workers `supabase/schema.sql` erneut im eigenen Supabase-Projekt ausführen.** Laufende alte Worker vorher anhalten. Das wiederholbare Schema ergänzt Spalten/Funktionen bestehender Installationen. Erst danach den neuen Worker starten. Ohne eigene Supabase-/Telegram-Konfiguration wird kein Live-Versand eingerichtet oder ausgelöst.

Ein Claim besitzt einen zufälligen Token und eine zweiminütige Lease. Vor jeder Telegram-Anfrage wird für genau diesen Empfänger atomar `*_sending_at` gesetzt. Die Datenbank prüft Eigentümer, Claim-Token, gültige Lease, Terminfrist und bisherigen Versand. Bestätigte Empfänger erhalten `*_sent = true`; ihre Bestätigung bleibt bei Wiederholung für den anderen Empfänger erhalten. Abgelaufene Worker können keine neuen Claims verändern.

Nach Timeout, Prozessabbruch oder unlesbarer Bestätigung bleibt begonnenes Senden als **`uncertain`** stehen. Der nächste Lauf sendet diese Nachricht nicht automatisch erneut. Nur eine eindeutige Telegram-Ablehnung erlaubt einen erneuten Versuch. Betroffene Jobs sind in Supabase über `status = 'uncertain'` beziehungsweise `last_error = 'delivery_uncertain'` auffindbar. Vor einem manuellen erneuten Versand die Zustellung prüfen. Telegram bietet keine Idempotenzschlüssel: Dieser Ansatz priorisiert das Vermeiden von Duplikaten und kann im unklaren Fall eine Erinnerung auslassen. Eine Exactly-once-Garantie wird nicht behauptet. Logs enthalten weiterhin nur Zähler.
