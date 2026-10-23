# Praxisabläufe A–C – technische Übergabe

Diese Erweiterung wird in drei geprüften Etappen umgesetzt. Kein neues NPM-Paket, kein Klienten-Login und keine Online-Buchung. Diese Dokumentation ist keine rechtliche oder datenschutzrechtliche Prüfung.

## Phase A – Bedienung

- Heute zeigt außerhalb der Demo eine Einrichtungs-Checkliste. Praxisname und Adresse, mindestens eine Bankverbindung und eine tatsächlich erstellte Sicherung bestimmen die Pflichtpunkte. Cloud und Erinnerungen können ausdrücklich auf später verschoben werden. Die Links fokussieren den jeweiligen Einstellungsbereich; ist alles erledigt, verschwindet die Karte.
- „Abgeschlossen und bezahlt“ übernimmt das vereinbarte Honorar einschließlich Währung und gespeichertem Kurs. Zahlungsdatum ist der heutige Gerätetag, Zahlart die vorher gewählte Angabe Bar/Überweisung. Ein verschlüsselter Speichervorgang erfasst Terminstatus und Zahlung. Der bisherige Abschluss mit offener Zahlung bleibt erhalten. Begonnene Entwürfe müssen über den normalen Abschluss übernommen werden.
- Neue Abschlüsse eines Termins nutzen eine aus der Termin-ID abgeleitete Datensatz-ID. Wiederholtes Tippen erzeugt keine zweite Zahlung. Gleichzeitige finanzielle Varianten auf zwei Geräten bleiben zur Konfliktprüfung erhalten; es werden keine Beträge addiert. Historische Datensatz-IDs bleiben gültig.
- Die optionale `Session.paymentMethod` ist Teil des atomaren Finanzregisters. Bei alten Zahlungen bleibt sie unbekannt. Sie erscheint in der Zahlungsansicht, Konfliktprüfung und im lesbaren Klientenexport. Vollständige verschlüsselte Sicherungen und Verlaufsstände übernehmen sie automatisch.
- Schriftgröße Normal/Groß/Sehr groß ist eine ausschließlich lokale Darstellungspräferenz. `theme-init.js` setzt dieselbe Skalierung vor dem ersten Bild wie React. Druckansichten bleiben in der ursprünglichen Papiergröße. Kein Schriftparameter wird mit dem Tresor synchronisiert.
- Info-Schaltflächen öffnen die vorhandene tastaturbedienbare Modal-Komponente. Alle Texte sind in beiden Wörterbüchern hinterlegt.

### Prüfung A

`npm test`, `npm run build` sowie Browserprüfungen für neuen Direktabschluss, Wiederöffnung nach Sperren, Einstellungslinks, Hilfedialog, große Schrift und bestehende Termin-/Zahlungswege. Die Tests verwenden ausschließlich erfundene Daten. Keine echten Nachrichten oder Live-Supabase-Aufrufe.

## Phase B – Ausfälle und Termin-E-Mails

Ausfallstatus: `Appointment.status` unterstützt zusätzlich `noShow` und `lateCancelled`. Ein vereinbartes Honorar erzeugt genau einen unbezahlten `Session`-Datensatz mit `kind: cancellationFee` und `failureStatus`, unter derselben stabilen Termin-Zahlungs-ID wie der reguläre Abschluss. Ohne Honorar wird nur der Terminstatus geändert. Praxisstandard ist EUR; ein klientenspezifischer Betrag kann in EUR oder UAH gespeichert werden. Kurs und tatsächlicher Rechnungsbetrag werden wie bei bisherigen Honoraren festgehalten. Ein Ausfallhonorar wird nicht als zuletzt wahrgenommener Termin oder als Preisvorschlag für den nächsten Termin verwendet. Seine Rechnung nennt es ausdrücklich Ausfallhonorar.

Betrag, Währung, Zahlart und Ausfallart bilden gemeinsam das Finanzregister. Konkurrierende Abschlüsse/Ausfälle bleiben als Varianten sichtbar, ohne doppelte Zahlung. Der sichtbare Terminstatus folgt der ausgewählten Zahlungsvariante. Löschen der Zahlung öffnet den Termin erneut; Klientenlöschung entfernt auch Ausfallzahlungen, Einwilligung und E-Mail-Verlauf. Sicherungen, Snapshots, Import und Wiederherstellung enthalten die additiven Felder, ohne ein neues Backup-Format zu benötigen.

**Empfehlungsprogramm unverändert:** Die bestehende Formel berücksichtigt positive, bezahlte und nicht stornierte Posten in der Frist. Dadurch zählt auch ein tatsächlich bezahltes Ausfallhonorar zum prämienrelevanten Umsatz. Ist es die erste Zahlung, kann es nach der unveränderten Regel die Zwölfmonatsfrist starten. Unbezahlte Ausfallhonorare zählen nicht. Es wurde weder ein Ausschluss noch eine neue Prämienregel eingeführt. Diese Wirkung vor Verwendung des Empfehlungsprogramms bei Ausfallhonoraren bewusst berücksichtigen.

### Termin-E-Mail und Kalender

Eigene `Client.appointmentEmailConsent` mit Datum und Bindung an die konkrete Adresse; weder Marketing- noch Telegram-Einwilligung ersetzt sie. Widerruf hat bei gleichzeitigen Änderungen Vorrang. Adresswechsel deaktiviert die Freigabe. Bestätigung am Termin über „Termin-E-Mail“, Vorschau in Klientensprache. E-Mail-Erinnerungen sind separat in Einstellungen aktivierbar, standardmäßig aus.

Die vorhandene Edge Function `send-client-email` wird ausschließlich um kleine, eingeschränkte `.ics`-Anhänge (`text/calendar`, maximal 32 KiB) ergänzt. Es gelten weiterhin Ursprung, Authentifizierung, festgelegtes Beraterkonto und bestehender Anbieter. **Die aktualisierte Function muss im eigenen Projekt bereitgestellt werden**; keine Live-Projektänderung erfolgt durch dieses Code-Update. Bestehende Einrichtung über `VITE_EMAIL_ENABLED`, Anbieter-Schlüssel nur serverseitig. Kalender enthält UTC-Zeiten und keine Notizen oder Beträge. Der ausdrückliche Versand ist wie bestehender Dokumentenversand eine Klartext-Ausnahme: Empfänger, Minimalnachricht und Kalender werden durch den bisherigen E-Mail-Anbieter verarbeitet. Keine neuen Anbieter, Schlüssel oder Hintergrundserver.

Automatik läuft ausschließlich geöffnet, entsperrt und online. Zeitfenster: Vortag ab 18 Uhr in Termin-Zeitzone bis Mitternacht; keine Nachholung am Termintag und keine garantierte minutengenaue Zustellung. Bei geschlossener App gibt es keine E-Mail-Automatik. Vor dem Request wird der Versuch verschlüsselt gespeichert. Stabile Versandkennung je Terminrevision, Einwilligung und Nachrichtenart nutzt die vorhandene Anbieter-Idempotenz. Unbestätigte Versuche werden nie automatisch erneut geschickt; manuelle Wiederholung nur innerhalb von 23 Stunden mit unveränderten Bytes. Provider-Annahme ist keine Lesebestätigung. Ein bereits angenommener Versand lässt sich durch spätere Absage oder Widerruf nicht zurückrufen. Mehrere offline arbeitende Geräte brauchen für denselben Stand Abgleich; verschiedene, gleichzeitig geänderte Terminrevisionen sind unterschiedliche Nachrichten.

### Warteliste

Nach Prüfung der Ausfall- und Versandfunktionen ergänzt: verschlüsselte Sammlung `waitlist` mit Name, Wunschzeiten, kurzer Notiz und optionaler Aktenzuordnung. Einträge lassen sich bearbeiten und löschen; die Liste lädt zunächst 30 Einträge. Künftige abgesagte oder verschobene Zeiten werden auf freie Kapazität und Abwesenheiten geprüft. Auf Heute erscheint ein direkter Link zur Warteliste. Keine automatische Kontaktaufnahme und keine automatische Aussage, welcher Wunschtext zu welcher Zeit passt. Bei nicht verknüpften Interessenten Einträge nach Erledigung selbst entfernen.

Die neue Sammlung wird von Normalisierung, CRDT, Synchronisations-Merge, vollständigen Sicherungen/Import und der Wiederherstellung aus Versionsständen übernommen. Der Klientenexport und das endgültige Löschen einer Akte berücksichtigen verknüpfte Einträge. Alte Sicherungen erhalten eine leere Warteliste. Freigewordene Zeiten bleiben als rein zeitbezogene Einträge an ihrem Termin gespeichert und enthalten keine Namen oder Gesprächsinhalte.
