# Rechnungen, Rückläufe und Abwesenheiten

## Zahlungsziel und Zahlungserinnerung

Neue Rechnungen erhalten zunächst ein Zahlungsziel von 14 Tagen nach dem Rechnungsdatum. Das Datum lässt sich vor dem Ausstellen ändern und erscheint in Vorschau und PDF. Bestehende Rechnungen erhalten keine nachträglich erfundene Frist.

Unter **Übersicht → Im Blick behalten** stehen Rechnungen, deren Zahlungsziel in der Praxiszeitzone überschritten ist. Maßgeblich sind die noch unbezahlten Positionen und ihre fest vereinbarten Originalbeträge. Bereits bezahlte Positionen, stornierte Rechnungen und unklare Zahlungsstände werden nicht angemahnt. „Bezahlt“ bezeichnet eine vollständig beglichene Position; Teilzahlungen innerhalb einer einzelnen Sitzung werden weiterhin nicht separat verbucht. In **Finanzen → Rechnungen** lassen sich offene, bezahlte, überfällige und stornierte Belege filtern.

In der Rechnungsansicht öffnet **Zahlungserinnerung vorbereiten** einen bearbeitbaren Text für E-Mail oder Telegram. Sprache und Empfänger kommen aus dem Klientenprofil. Bei Hrywnja-Rechnungen enthält der Text ausschließlich den offenen Hrywnja-Betrag. Es werden keine Mahngebühren hinzugefügt. Das Öffnen erzeugt keinen Versand; erst der Versandbutton übermittelt die ausgewählte PDF und den geprüften Text. Ändert sich der Zahlungsstand während der Vorbereitung, muss die Erinnerung erneut geöffnet werden. Die Historie unterscheidet Rechnungsversand und Zahlungserinnerungen sowie unbestätigte Versuche und bestätigte Annahmen.

Die Anbieter-Anbindung ist in [rechnungsversand.md](rechnungsversand.md) beschrieben. Ohne diese Einrichtung bleiben echte Sendungen deaktiviert. Es gibt keinen automatischen Hintergrundversand, auch nicht bei geschlossener App.

## Korrektur und Storno

Ausgestellte Rechnungen werden nicht überschrieben. Unter **Rechnung korrigieren** erstellt die App in einem gemeinsamen Speichervorgang einen negativen Stornobeleg und eine neue Rechnung mit eigener Nummer. Original, Storno und Ersatz sind gegenseitig verlinkt. Der Grund steht auf dem Beleg und sollte keine Sitzungsinhalte enthalten.

Die Ersatzrechnung kann Empfänger, Anschrift, Leistungsbeschreibung, Zahlungsziel, Sprache und Praxis-/Bankdaten korrigieren. Solange keine Position bezahlt ist, können auch ganze Beträge geändert werden. Die Rechnungswährung bleibt erhalten; bei UAH wird für eine Betragskorrektur der bereits gespeicherte Kurs der Position verwendet. Fehlt dieser historische Kurs, wird kein Tageskurs rückwirkend erfunden. Sobald eine Position bezahlt ist, sind Betragskorrekturen gesperrt; reine Datenkorrekturen bleiben möglich. Beträge einer bereits abgerechneten Sitzung werden in der Sitzungsnotiz nicht beiläufig geändert.

**Rechnung stornieren** erstellt nur den verknüpften negativen Beleg. Unbezahlte Beträge dieser Rechnung fallen aus den offenen Summen. Die Sitzungen und tatsächlich verbuchten Zahlungseingänge bleiben erhalten. Ein Storno führt keine Banküberweisung aus und bucht keine automatische Erstattung. Eine erforderliche Rückzahlung muss separat durchgeführt und beim finanziellen Abgleich berücksichtigt werden; ein eigenes Erstattungsbuch ist in diesem Stand nicht enthalten. Die ursprünglichen PDF-Dateien und Versandbestätigungen bleiben erhalten.

Bei gleichzeitigen Korrekturen auf zwei offline arbeitenden Geräten können doppelte Nummern oder widersprüchliche Ersatzbelege entstehen. Die App zeigt solche Konflikte an, wählt keine zweite Ersatzrechnung automatisch aus und blockiert Zahlungserinnerungen für unklare Forderungen. Ausgestellte Belege enthalten damit eine nachvollziehbare Historie; das ersetzt keine fachliche Prüfung steuerlicher Pflichten.

## Rückläufe von Dokumenten

Beim Hochladen eines Dokuments oder Erstellen eines Fragebogens kann **Ausgefüllte Rücksendung erforderlich** mit einer optionalen Rückgabefrist gewählt werden. **Im Blick behalten → Ausstehende Rückläufe** führt direkt zum jeweiligen Dokument im Klientenprofil.

- **Noch nicht versendet:** Es liegt noch keine bestätigte Versandannahme vor.
- **Rückgabe ausstehend:** Das Dokument wurde versendet; eine Antwort fehlt.
- **Rückgabe überfällig:** Die eingetragene Frist ist nach bestätigtem Versand überschritten.

Eine rechts abgelegte ausgefüllte Datei mit Eingangsdatum erledigt den Eintrag automatisch. Unter **Rücklauf verwalten** kann die Frist geändert oder ein nicht mehr benötigter Rücklauf abgeschlossen werden. Originale, Antworten und Versandhistorie werden dadurch nicht gelöscht. Für einen neuen Arbeitsauftrag mit erneut erwarteter Antwort ein neues Dokument anlegen.

## Urlaub und andere Abwesenheiten

Unter **Termine → Abwesenheit eintragen** stehen **Urlaub** und **Keine Termine möglich** zur Wahl. Eine eigene Bezeichnung oder Notiz ist optional. Ganztägige Einträge umfassen Anfangs- und Enddatum einschließlich; alternativ sind Uhrzeiten möglich. Die App verwendet die Zeitzone der Praxis beim Anlegen und speichert sie mit dem Eintrag. Sommer- und Winterzeit werden berücksichtigt.

Nach dem Speichern öffnet sich die betreffende Kalenderwoche. Abwesenheiten erscheinen als farbige Tagesmarkierung und im Wochenraster als schraffierte Fläche. Auf schmalen Geräten zeigt die Wochenagenda gut bedienbare Tageskarten. Über **Woche ab Datum anzeigen** kann direkt zu einem Datum gesprungen werden. In der Listenansicht stehen die geplanten Abwesenheiten separat; sie können bearbeitet oder gelöscht werden.

Bestehende Termine werden weder gelöscht noch automatisch abgesagt. Ein Hinweis zeigt Überschneidungen beim Eintragen der Abwesenheit und beim Anlegen oder Verschieben eines Termins, auch bei Terminserien und abweichenden Klientenzeitzonen. Bestehende kollidierende Termine werden im Kalender zusätzlich markiert. Ein bewusst angelegter Termin bleibt trotz Hinweis möglich.

Abwesenheiten liegen wie alle anderen Praxisdaten im verschlüsselten Tresor und sind in Sicherungen, Versionsverlauf und konfigurierter Gerätesynchronisation enthalten. Sie werden nicht an Telegram oder beim Termine-Export an einen fremden Kalender übertragen.
