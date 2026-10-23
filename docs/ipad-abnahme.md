# Abnahme auf iPad/iPhone

Für den Gerätetest zunächst **fiktive Klienten und Testaufnahmen** in einem separaten Browserprofil/Tresor verwenden. Gerät, iPadOS-/Safari-Version, App-Version, installierte PWA oder Browser sowie Datum des Tests notieren. Dieser Plan ist noch kein durchgeführter Gerätetest.

## Begleitung nach längerer Pause

- Klienten mit Sitzung, Dokument und Rechnung anlegen, auf „Pausiert“ setzen und eine Wiedervorlage eintragen.
- Aktive Liste zeigt die Akte nicht; Filter „Pausiert“ und „Alle Klienten“ finden sie.
- Akte öffnen und wieder aktivieren. Frühere Sitzungen, Rechnungen, Rückläufe und Memos bleiben erhalten; der Statusverlauf zeigt die Rückkehr.
- Bereits geplante Termine bleiben erhalten und müssen bei Bedarf bewusst abgesagt werden.

## Entwurf und Aufnahme

- In neuer und bestehender Sitzung tippen, jeweils auf die Meldung „Entwurf verschlüsselt gesichert“ warten.
- Eine kurze Aufnahme stoppen, Titel und manuelle Kurzfassung eingeben. Auch ohne „Memo übernehmen“ nach der Sicherung Safari schließen; nach erneutem Entsperren den Entwurf öffnen und das Memo anhören.
- Eine übernommene Aufnahme, zwei Fotos und weitere Notizen ergänzen; Flugmodus einschalten, kurz warten, sperren und wieder entsperren. Entwurf, Bilder und Aufnahme bleiben erhalten.
- Erst „Speichern“ legt eine fertige Sitzung an. Betrag, Zahlung und Rechnung dürfen vorher nicht als erledigt erscheinen.
- Mit Stoppuhr eine längere Aufnahme und eine Unterbrechung durch Geräte-Sperre prüfen: Mikrofon/Wiedergabe müssen enden. Eine laufende, vom Betriebssystem hart beendete Aufnahme kann verloren gehen; es gibt keine Hintergrundaufnahme.
- Einen Entwurf bewusst verwerfen und prüfen, dass eine bereits gespeicherte Sitzung erhalten bleibt. Neues Memo löschen und kontrollieren, dass es auch nach Sperren/Neuladen nicht wieder auftaucht.

## Sicherung und Speicher

- Verschlüsselte Sicherung über „Teilen → In Dateien sichern“ extern ablegen.
- „Sicherung prüfen“ mit richtiger und falscher Passphrase testen. Es darf kein Import erfolgen und die aktuelle Akte darf sich nicht ändern.
- Eine Kopie in einem separaten Testprofil tatsächlich importieren und alle Anhänge öffnen.
- Speicherplatz in den Geräteeinstellungen kontrollieren. Browser-Speicher nicht absichtlich löschen, bevor eine geprüfte externe Sicherung vorliegt. Die In-App-Historie ist keine vom Gerät unabhängige Kopie.

## Darstellung, Bedienung und Freigabe

- 820 px Hochformat, Querformat sowie iPhone: keine horizontale Seitenverschiebung; Tastatur verdeckt nicht dauerhaft Speichern/Stopp.
- Hell/Dunkel und DE/UA prüfen, mit VoiceOver die Dialogtitel, Aufnahmezustände und Buttons durchgehen; Player auch mit Hardware-Tastatur bedienen.
- In einem entsprechend eingerichteten Supabase-Testprojekt einen Link mit zusätzlicher Passphrase erzeugen. In privatem Safari ohne Konto öffnen, korrekt herunterladen, falsche Passphrase ablehnen und danach widerrufen. Erneuter Abruf muss scheitern.
- App-Update bei offenem Entwurf ausführen und danach kontrollieren, dass der Entwurf noch vorhanden ist.

Ergebnis pro Punkt als **bestanden / Fehler mit Reproduktionsschritten / nicht geprüft** dokumentieren. Automatische Chromium- und WebKit-Prüfungen ersetzen diese Hardware-Abnahme nicht.
