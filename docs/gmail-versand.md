# Gmail ohne eigene Domain verbinden

Unter **Mehr → Einstellungen → E-Mail-Versand → Versand über: Gmail** steht eine
vollständige Anleitung auf Deutsch und Ukrainisch. Gmail ist die Vorauswahl bei
neuer Einrichtung; ein bereits gespeicherter Resend-Zugang bleibt ausgewählt.
Die neue Verbindung benötigt keine eigene Domain, keinen Resend-Zugang und kein
zusätzliches Versandabo. Googles aktuelle Kontingente und die vorhandenen
Supabase-Free-Tier-Grenzen gelten weiterhin.

Neu in 0.2.0: Drei Prüfschritte führen durch die Einrichtung; einen tatsächlichen Testmail-Empfang bestätigt die Nutzerin selbst. Bei gesperrtem Clipboard hilft **Gmail-Skript anzeigen**. Der Prüfstatus bleibt gerätelokal. [Details und technische Übergabe](optimierungen-2026-10-26.md).

## Einmalige Einrichtung für die Nutzerin

1. Die sichere Supabase-Verbindung wie unten beschrieben einmal freigeben lassen.
   Danach im E-Mail-Bereich mit dem eigenen Praxis-Konto anmelden.
2. **Gmail** auswählen. Den gewünschten Absendernamen und genau die Gmail-Adresse
   eintragen, mit der das Google-Skript später ausgeführt wird.
3. **Verbindungscode erzeugen** wählen. Das ist ein zufälliger Zugangscode für
   dieses Versandskript, **kein Google-Passwort**. **Gmail-Skript kopieren** wählen.
   Die App während dieser Einrichtung geöffnet lassen: Der neue Code ist erst
   nach dem späteren Speichern dauerhaft hinterlegt.
4. [Google Apps Script öffnen](https://script.google.com/home/start), mit genau
   diesem Gmail-Konto anmelden und **Neues Projekt** wählen. Den vorhandenen
   Inhalt von `Code.gs` vollständig durch das kopierte Skript ersetzen und
   speichern, etwa als „Praxisraum E-Mail“.
5. Oben die Funktion **setupPraxisraum** auswählen und **Ausführen** wählen.
   Google bittet um eine einmalige Erlaubnis zum Versenden von E-Mails und zur
   Feststellung des eigenen Kontos. Der bereitgestellte Code benutzt `MailApp`,
   nicht `GmailApp`: Er liest, löscht oder verwaltet keine Postfachnachrichten.
   Bei einem Hinweis auf ein nicht verifiziertes eigenes Skript zuerst prüfen,
   dass es wirklich das eigene Projekt mit dem hier bereitgestellten Quellcode
   ist. Google zeigt dafür einen erweiterten Freigabeweg; die Anwendung erzeugt
   keine öffentlich verifizierte Google-OAuth-App.
6. **Bereitstellen → Neue Bereitstellung** wählen. Unter Typ **Web-App** auswählen:
   **Ausführen als: Ich**, **Zugriff: Jeder**. Bereitstellen und die Web-App-URL
   kopieren. Sie beginnt mit `https://script.google.com/macros/s/` und endet
   auf `/exec`. Die Editor-URL oder `/dev` funktioniert nicht. Das Skript selbst
   bleibt privat; der öffentlich erreichbare Endpunkt prüft jede Anfrage mit dem
   geheimen Verbindungscode. Die URL allein gestattet keinen Versand.
7. Zurück in Praxisraum die Web-App-URL eintragen und **Speichern** wählen. Die
   App prüft dabei nur die Verbindung und die tatsächliche Absenderadresse. Sie
   verschickt noch keine E-Mail. Erst nach erfolgreicher Prüfung wird der Zugang
   gespeichert und der Code aus dem Eingabefeld entfernt.
8. **Testmail an mich senden** wählen. Diese neutrale Nachricht geht ausschließlich
   an die bestätigte Adresse des angemeldeten Praxis-Kontos, auch wenn diese von
   der Gmail-Absenderadresse abweicht. Die App übergibt keine Klientendaten.
   Anschließend das eigene Postfach und den Spam-Ordner prüfen. Eine Annahme
   bestätigt keine Zustellung oder Lesebestätigung.

Danach verwenden Rechnungen, Unterlagen, Termin-Nachrichten und freigegebene
Marketing-E-Mails dieselbe Gmail-Verbindung. Es gibt keine neuen Einwilligungen
und kein automatisches Nachsenden unbestätigter Nachrichten. Die bisherigen
Regeln für ausdrücklichen Versand, separate Einwilligungen und geöffnete,
entsperrte App bei lokalen Automationen gelten unverändert.

### Später ändern oder abschalten

- Name/Adresse/URL lassen sich in der App bearbeiten. Einen hinterlegten Code
  durch ein leeres Codefeld beibehalten. Beim Wechsel zwischen Gmail und Resend
  ist immer ein passender neuer Zugang nötig; ein fremder Anbieter-Schlüssel
  wird niemals stillschweigend wiederverwendet.
- Bei einem neuen Verbindungscode das neue Skript kopieren und
  **setupPraxisraum** im Google-Projekt erneut ausführen. Bei Änderungen am
  ausführbaren Skript unter **Bereitstellungen verwalten** eine neue Version
  derselben Bereitstellung veröffentlichen. Andernfalls führt `/exec` weiterhin
  die frühere veröffentlichte Skriptversion aus.
- **E-Mail-Versand erlauben** deaktivieren pausiert die Verbindung. Das ist auch
  möglich, wenn Google gerade nicht erreichbar ist. Zum endgültigen Widerruf
  die Google-Web-App-Bereitstellung deaktivieren oder die Skriptberechtigung im
  eigenen Google-Konto entziehen. Ein altes Skript nicht öffentlich teilen.
- Das private Google-Projekt enthält nach dem Einfügen den Verbindungscode;
  `setupPraxisraum` hinterlegt ihn zusätzlich in den privaten Script Properties.
  Nur das eigene Konto und ausdrücklich berechtigte Projektmitarbeiter dürfen
  darauf zugreifen. Auf GitHub steht ausschließlich die Vorlage ohne echten Code.

## Einmalige technische Freigabe / Update bestehender Installationen

Ein weiterhin fehlendes Supabase-Projekt wird durch die Gmail-Auswahl nicht
ersetzt. Die statische GitHub-Pages-App verwendet den bestehenden authentifizierten
Versandweg; Google-Zugangscodes gehören nicht in öffentliche Build-Variablen.
Ohne Projektzugang kann dieses Repository keine private Supabase-Installation
oder Google-Kontofreigabe selbst vornehmen.

1. `VITE_SUPABASE_URL` und den öffentlichen `VITE_SUPABASE_ANON_KEY` für das eigene
   Projekt konfigurieren, falls sie noch fehlen. Anleitung:
   [E-Mail-Einrichtung in der App](email-einrichtung-in-der-app.md).
2. Die **aktuelle** `supabase/email-settings.sql` erneut ausführen. Sie ergänzt
   `provider` und `endpoint`, übernimmt bestehende Resend-Einträge mit dem Default
   `resend`, erweitert die servicegeschützte Speicherfunktion und aktualisiert
   den PostgREST-Schemacache. Bestehende Klientendaten und Sicherungen werden
   dabei nicht verändert.
3. `APP_ORIGIN`, `EMAIL_OWNER_USER_ID` und gegebenenfalls `MARKETING_OWNER_USER_ID`
   wie bisher setzen. Die Funktionen aus dem neuen Stand deployen:

   ```sh
   supabase functions deploy send-client-email --no-verify-jwt
   supabase functions deploy send-marketing --no-verify-jwt
   ```

   Die Gateway-Prüfung wird für neue Supabase-Signierschlüssel deaktiviert; jede
   Funktion prüft **selbst** den echten Auth-Benutzer, die erlaubte Praxis-Kennung
   und den Browser-Ursprung. Diese Prüfungen bleiben zwingend aktiv.
4. Die App aktualisieren und die Gmail-Schritte oben durchführen. Für Änderungen
   an Code, Absender oder URL wird anschließend kein neuer App-Build benötigt.

## Technik und Nachvollziehbarkeit für Claude

- `src/lib/emailConnection.ts`: öffentliche Validierung für Provider, Gmail-Adresse,
  fest begrenzte Google-URL sowie 256-Bit-Zufallscode aus `crypto.getRandomValues`.
  Keine Speicherung von Zugangsdaten im Browser.
- `EmailSetupCard.tsx` / `emailSettings.ts`: Provider-Auswahl, dynamisch geladene
  Skriptvorlage, ausdrückliches Kopieren, erhaltene Resend-Einstellungen und
  persistente, serverseitig geschützte Konfiguration. Die Vorlage im PWA-Cache
  enthält nur einen Platzhalter; der echte Code wird ausschließlich im Speicher
  für die gewählte Kopieraktion eingesetzt. Beim Sperren wird das Codefeld geleert.
- `examples/gmail-praxisraum.gs`: privates, vollständig lauffähiges Apps Script.
  Nur HTTPS-POST mit HMAC-SHA-256, fünf Minuten Zeitfenster und konstanter
  Signaturprüfung. Der effektive Google-Benutzer muss der konfigurierten
  Absenderadresse entsprechen. Text und originale Anhänge werden nur beim
  ausdrücklich ausgelösten Versand verarbeitet. Keine automatischen Google-Trigger.
- `gmailRelay.ts`: ausschließlich die vorgegebene Google-URL. Kein frei wählbarer
  Host, kein SMTP und keine Google-Passwörter. Ein ContentService-Redirect wird
  nur als GET an `script.googleusercontent.com/macros/echo` verfolgt, ohne
  Zugangsdaten oder erneutes POST. Der Browser spricht weiterhin ausschließlich
  mit dem bestehenden Supabase-Projekt; die CSP wurde nicht erweitert.
- `emailProvider.ts`, beide Versandfunktionen und die additive SQL-Migration
  unterstützen Gmail und Resend. Der Verbindungscode liegt wie der Resend-Key
  in Supabase Vault, nicht in IndexedDB, localStorage, Klientenexport oder
  Sicherung. Frontend-Antworten geben gespeicherte Codes nie zurück.
- Vor der Google-Sendeanfrage wird mit Script Lock und Script Properties eine
  dauerhafte Sperre geschrieben. Gleiche Kennung und gleicher Inhalt liefern
  einen vorhandenen Annahmebeleg zurück. Ein hängender/unklarer Versuch wird
  **nicht erneut gesendet**, auch wenn dies bedeutet, dass nach einem Absturz
  vor dem eigentlichen Versand manuell geprüft werden muss. Im Skriptspeicher
  stehen nur Kennungshashes, Inhaltshashes, Status und Zeitpunkte, keine Adressen,
  Nachrichtentexte oder Anhänge. Bestätigte Belege werden nach sieben Tagen
  bereinigt; unklare Sperren werden nicht automatisch gelöscht. Die vorhandene
  23-Stunden-Grenze für explizite unbestätigte Dokument-Wiederholungen bleibt.
- Google-Tageskontingente werden vor einem neuen Versuch geprüft. Aktuelle
  Limits: [Google Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas).
  Bei ausgeschöpftem Kontingent wird kein Versand behauptet und kein kostenpflichtiges
  Kontingent automatisch gebucht. Workspace-/Organisationsregeln können Apps
  Script oder öffentliche Web-App-Bereitstellungen einschränken.
- Keine NPM-Abhängigkeit hinzugefügt. Kein Zugriff auf eingehende Nachrichten,
  keine neue Buchungsseite, kein Klienten-Login und keine Änderung am Aktenmodell,
  dessen Verschlüsselung, Synchronisation, Sicherung oder Export.

Normale E-Mails und Anhänge bleiben eine ausdrücklich gewählte Klartext-Ausnahme
gegenüber der Ende-zu-Ende-verschlüsselten Akte: Google verarbeitet die gewählte
Nachricht. Die technische Anbindung ist keine rechtliche oder datenschutzrechtliche
Prüfung der Praxis oder des verwendeten Google-Kontos.

## Tests

`tests/gmail.test.ts` führt die **echte Skriptvorlage** in einer isolierten V8-Umgebung
mit simulierten Google-Diensten aus. Geprüft werden HMAC/Replay-Schutz,
Unicode/Dateiinhalte, gleiche und kollidierende Wiederholungen, Absturz/Sperre/
Quoten, freigegebene Redirects und die gesamte authentifizierte Versandkette.
SQL-Tests prüfen Providerwechsel, Geheimniserhalt und Zugriffsrechte; die bestehende
Vault-Simulation prüft nicht die Kryptografie des echten Supabase-Vault-Dienstes.

Die bestehenden Browser-Tests zur Einrichtung laufen zusätzlich mit Gmail:
Code erzeugen, Skript kopieren, speichern, neu laden/entsperren, eigene Testadresse,
pausieren, DE/UA, 820-Pixel-Layout und axe. Sie verwenden ausschließlich einen
fiktiven Build und abgefangene Anfragen. Keine echten E-Mails und keine Tests
gegen ein echtes Google- oder Supabase-Konto. Eine tatsächliche Google-Freigabe
muss die Nutzerin selbst vornehmen; automatisierte Tests ersetzen diesen Schritt
nicht.

### Geänderte Dateien

- `README.md`, `HANDOFF.md`, `docs/email-einrichtung-in-der-app.md`, `docs/gmail-versand.md`
- `examples/gmail-praxisraum.gs`
- `src/components/EmailSetupCard.tsx`, `src/components/AppointmentEmail.tsx`, `src/components/documents.tsx`
- `src/lib/emailConnection.ts`, `src/lib/emailSettings.ts`, `src/lib/documents.ts`
- `src/locales/de.json`, `src/locales/uk.json`
- `supabase/email-settings.sql`, `supabase/functions/_shared/emailProvider.ts`,
  `supabase/functions/_shared/gmailRelay.ts`, `supabase/functions/send-client-email/handler.ts`,
  `supabase/functions/send-marketing/handler.ts`
- `tests/gmail.test.ts`, `tests/email-settings.test.ts`, `tests/email-settings-database.test.ts`,
  `tests/browser/email-setup.spec.ts`, `tests/browser/email-setup-connected.spec.ts`
