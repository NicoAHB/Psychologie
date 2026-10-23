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
