# Dokumente und E-Mail-Versand einrichten

Die aktuelle Einrichtung erfolgt direkt unter **Mehr → Einstellungen → E-Mail-Versand**. Neue Schritt-für-Schritt-Anleitung und einmalige Server-Freigabe: [E-Mail-Einrichtung in der App](email-einrichtung-in-der-app.md). Die folgenden Umgebungs-Secrets bleiben als Alt-Konfiguration unterstützt.

## Bedienung

1. **Klienten → Profil bearbeiten → E-Mail-Adresse des Klienten** eintragen. Das bisherige Kontaktfeld bleibt für Telefon oder andere Hinweise erhalten.
2. Unter **Fragebögen → Ausfüllbare PDF erstellen** PHQ-9 oder GAD-7 und Deutsch oder Ukrainisch auswählen. Die Sprache folgt zunächst der Klientensprache. Die PDF enthält echte AcroForm-Auswahlfelder sowie optionale Felder für Name und Datum. Die ukrainische Fassung bleibt als nicht validierte Übersetzung gekennzeichnet, wie die bestehende App-Auswertung.
3. Alternativ unter **Dokumente → Dokument hochladen** eine Aufgabe, ein Bild oder eine andere Unterlage hinterlegen. Erlaubt: PDF, JPG, PNG, WebP, TXT, DOCX, ODT, maximal 10 MB je Datei. Dokumentdateien bleiben im Originalformat erhalten. Die vorhandene Komprimierung von Profilbildern und Fotonotizen bleibt bestehen.
4. Bei Bedarf **Ausgefüllte Rücksendung erforderlich** und **Per E-Mail an Klient versenden** aktivieren. Nach dem Speichern öffnet sich die Prüfung von Empfänger, Betreff und Nachricht. Erst **E-Mail jetzt versenden** überträgt die ausgewählte Datei an den eingerichteten Anbieter. Später ist der gleiche Versand über den Button am gespeicherten Dokument möglich.
5. Nach erfolgreicher Annahme durch den E-Mail-Anbieter erscheint der Zeitpunkt samt Empfänger in der Historie. Fehlgeschlagene oder noch nicht eingerichtete Versände bekommen keinen Erfolgszeitpunkt. Annahme bedeutet keine bestätigte Zustellung und keine Lesebestätigung.
6. Nach einer Antwort die zurückgeschickte Datei unter **Ausgefüllte Datei hinterlegen** hochladen und **Zurückerhalten am** eintragen. Original und alle früheren Rückläufe bleiben nebeneinander erhalten. PHQ-9-/GAD-7-Rückläufe können clientseitig aus den passenden AcroForm-Feldern ausgelesen und nach ausdrücklicher Prüfung in die Verlaufs-Auswertung übernommen werden. Unvollständige oder unpassende Dateien bleiben als Datei ablegbar; es gibt keine automatische klinische Bewertung.

Die PDF kann in einem PDF-Programm ausgefüllt und anschließend gespeichert werden. Einige Messenger- und Browser-Vorschauen unterstützen keine Formularbearbeitung; dann die heruntergeladene Datei in einer geeigneten PDF-App öffnen. Die komplette Dokumentenablage und PDF-Erzeugung funktionieren auch ohne eingerichteten E-Mail-Anbieter.

## Vorbereiteter direkter Versand: Supabase Edge Function + Resend

Der Benutzer hat direkten Versand aus der App mit einem später einzurichtenden Anbieter gewählt. Dafür enthält das Repository die Funktion [`send-client-email`](../supabase/functions/send-client-email/index.ts) mit einem Resend-Adapter. Ein eigenes Anbieter-Konto muss verbunden werden; ohne Einrichtung wird kein Produktivversand behauptet. Für einen anderen Anbieter wird ausschließlich der serverseitige Adapter ersetzt.

Resend bietet ein kostenloses Versandkontingent; aktuelle Limits und Bedingungen vor der Einrichtung im Anbieter-Konto prüfen. Eine verifizierte eigene Absenderdomain ist für den Versand an beliebige Klienten erforderlich; Domainkosten sind nicht Teil des kostenlosen Kontingents. Supabase-Funktionen und Speicher zählen ebenfalls zu den jeweiligen Projektlimits.

### Bisherige Einrichtung über Server-Secrets (weiter kompatibel)

1. Das vorhandene private Supabase-Projekt und den vorgesehenen Praxis-Benutzer verwenden. Das Schema [`supabase/schema.sql`](../supabase/schema.sql) erneut anwenden: Der private Bucket erlaubt jetzt 16 MiB je **verschlüsselter JSON-Datei**, damit auch eine 10-MB-Unterlage mit Base64- und Verschlüsselungsaufschlag hineinpasst. Es werden weiterhin ausschließlich verschlüsselte JSON-Objekte synchronisiert, keine öffentlichen Originaldokumente.
2. In Resend eine Absenderdomain verifizieren und einen API-Schlüssel anlegen. Für den Praxisbetrieb eine passende Vereinbarung mit dem Anbieter und den gewünschten Umgang mit sensiblen Anhängen festlegen.
3. Folgende Werte als **serverseitige Supabase-Secrets** setzen, beispielsweise aus einer privaten, nicht eingecheckten Datei mit `supabase secrets set --env-file /sicherer/pfad/email.env`:

   ```dotenv
   APP_ORIGIN=https://nicoahb.github.io
   EMAIL_OWNER_USER_ID=<UUID des eigenen Supabase-Auth-Benutzers>
   EMAIL_FROM=Praxisname <beratung@eigene-domain.de>
   RESEND_API_KEY=<privater Anbieter-Schlüssel>
   ```

   `APP_ORIGIN` enthält nur Ursprung/Host, keinen `/Psychologie/`-Pfad. `SUPABASE_URL` und `SUPABASE_ANON_KEY` stellt die Supabase-Funktionsumgebung bereit. Keine privaten Werte als `VITE_*`, Repository-Variable oder Quellcode hinterlegen.
4. Funktion mit `supabase functions deploy send-client-email` in dieses Projekt deployen. Die Funktion prüft unabhängig vom Gateway den gültigen Benutzer über Supabase Auth und lässt nur `EMAIL_OWNER_USER_ID` zu. Sie akzeptiert ausschließlich den konfigurierten Browser-Ursprung. Bei Projekten, deren neue JWT-Signierschlüssel eine deaktivierte Gateway-JWT-Prüfung erfordern, bleibt diese eigene Auth-Prüfung zwingend aktiv; keine öffentlichen Versand-Endpunkte einrichten.
5. Die öffentlichen Projektwerte `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` wie bisher konfigurieren. Das frühere Flag `VITE_EMAIL_ENABLED` wird nicht mehr benötigt. Für die dauerhafte Einrichtung direkt in der App zusätzlich `supabase/email-settings.sql` ausführen und die aktuellen Funktionen deployen; siehe die neue Anleitung oben.
6. In der App mit dem freigegebenen Praxis-Benutzer in der Cloud anmelden. Mit einer eigenen Testadresse und einer erfundenen Unterlage prüfen: Anhang erhalten, PDF ausfüllen/speichern, zurücksenden, Rücklauf hinterlegen. Keinen Test an echte Klienten senden.

### Datenschutz und Nachvollziehbarkeit

E-Mail-Adresse, Dokumentmetadaten, Originale, Rückläufe und Versandhistorie liegen verschlüsselt im lokalen Tresor und werden verschlüsselt synchronisiert. Beim ausdrücklich ausgelösten E-Mail-Versand wird **nur die ausgewählte Datei** auf dem Gerät entschlüsselt und über HTTPS an die Funktion und den E-Mail-Anbieter übergeben. Normale E-Mail-Anhänge sind dabei **nicht Ende-zu-Ende-verschlüsselt**. Der Versanddialog zeigt diesen Unterschied an. Es wird kein Tresorschlüssel übergeben; andere Akteninhalte werden nicht mitgesendet.

Die Funktion schreibt keine Nachrichteninhalte, Adressen oder Anhänge in Datenbank oder Anwendungslogs. Der E-Mail-Anbieter verarbeitet und speichert die Nachricht nach seinen Einstellungen/Bedingungen. Eingehende E-Mails und Anhänge werden nicht automatisch aus einem Postfach abgerufen.

Jeder Versandversuch erhält vor dem Aufruf eine im verschlüsselten Tresor gespeicherte Kennung. Unveränderte Wiederholungen nutzen dieselbe Idempotenz-Kennung beim Anbieter. Nach 23 Stunden wird eine unbestätigte Wiederholung blockiert, weil der Anbieter Kennungen nur 24 Stunden aufbewahrt: erst im Anbieter-Konto prüfen, ob die Nachricht bereits versendet wurde. Geänderte Texte/Empfänger gelten als neue Nachricht. Bei gleichzeitigem Arbeiten an zwei Geräten werden Versandbelege und Rückläufe anhand ihrer Kennungen zusammengeführt.

Eine historische Version der App kennt Dokumente noch nicht. Nach dem Update alle verwendeten Geräte einmal online neu laden, bevor parallel daran gearbeitet wird; ein älterer Client könnte unbekannte Felder beim Schreiben verlieren.

## Validierung

Automatisierte Prüfungen decken echte bearbeitbare DE-/UA-PDF-Felder, lokale Verschlüsselung und Wiederöffnung, Dateiprüfung, Rückläufe, Historie und Zusammenführen zweier Geräte sowie Authentifizierung, Ursprungsprüfung, Anbieterfehler und Idempotenz der Versandfunktion ab. Anbieterantworten sind kontrolliert simuliert. Ohne eingerichtete Secrets und Testpostfach wurde keine echte E-Mail verschickt.

Für den gesonderten Browser-Test des aktivierten Versands einen ausdrücklich fiktiven Build verwenden. Der Test fängt sämtliche Anfragen an diesen Testhost ab und prüft Fehler, Wiederholung und Erfolgsbeleg; es wird kein Anbieter aufgerufen:

```sh
VITE_SUPABASE_URL=https://email-test.supabase.co VITE_SUPABASE_ANON_KEY=public-test-key VITE_EMAIL_ENABLED=false npm run build
PLAYWRIGHT_EMAIL_TEST=true PLAYWRIGHT_PORT=4190 npx playwright test tests/browser/email.spec.ts
```

Anschließend `npm run build` bzw. den normalen Pages-Build ausführen, damit die lokale Vorschau wieder die tatsächliche Projekt-Konfiguration verwendet. Den fiktiven Build nicht veröffentlichen.

Für vertrauliche Unterlagen ist alternativ ein separat verschlüsselter Download-Link möglich. Einrichtung und Grenzen: [Dokumentfreigaben](claude-uebergabe-2026-10-23.md#6-vertrauliche-dokument-links-notwendige-einrichtung). Der gewöhnliche E-Mail-Anhang bleibt ein ausdrücklich gewählter Versandweg ohne Ende-zu-Ende-Verschlüsselung.
