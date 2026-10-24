# E-Mail-Versand dauerhaft in der App einrichten

## Für die Nutzerin

Der neue Bereich steht unter **Mehr → Einstellungen → E-Mail-Versand**. Auch im
Versanddialog einer Rechnung, einer Unterlage oder einer Termin-Nachricht führt
**E-Mail-Versand einrichten** direkt dorthin, ohne den vorbereiteten Text zu verlieren.
Unter **Mehr → Anleitung → Nachrichten** gibt es ebenfalls einen direkten Zugang.

1. **Versandkonto anlegen.** Die App verwendet weiterhin Resend. Über den Link in
   der App ein eigenes Konto anlegen. Ein kostenloses Kontingent ist verfügbar;
   aktuelle Grenzen und Bedingungen im Anbieter-Konto prüfen.
2. **Absender bestätigen.** Resend benötigt für Nachrichten an beliebige Klienten
   eine eigene bestätigte Domain. Eine normale Gmail-, GMX- oder vergleichbare
   Adresse allein genügt nicht. Eine neu benötigte Domain kann Geld kosten. Beim
   Domainanbieter die von Resend genannten DNS-Einträge hinterlegen und warten,
   bis Resend die Domain bestätigt. Die App kann diese fremden Konten nicht
   selbst anlegen oder DNS-Einstellungen ohne Zugang zum Domainanbieter ändern.
3. **Schlüssel erstellen.** In Resend → API Keys einen Schlüssel mit **Sending
   access** für diese Domain anlegen. Er beginnt mit `re_`. Nicht in einen Chat
   schreiben, nicht auf GitHub veröffentlichen.
4. **In der App speichern.** Mit dem freigegebenen Praxis-Konto anmelden,
   Absendername, Absenderadresse und Schlüssel eingeben und **Speichern** wählen.
   Anschließend steht dort ausgegraut **Gespeichert um …**. Eine Änderung aktiviert
   den Knopf erneut. Nach dem Speichern wird das Schlüsselfeld geleert; beim
   nächsten Öffnen zeigt die App nur, dass ein Schlüssel hinterlegt ist.
5. **Sich selbst eine Testmail senden.** Der Knopf zeigt die Adresse des
   angemeldeten Praxis-Kontos. Ausschließlich dorthin wird eine neutrale Nachricht
   ohne Klientendaten gesendet. Auch Spam prüfen. Die Annahme beim Anbieter ist
   noch keine bestätigte Zustellung. Kein Testversand an Klienten.

Der Schlüssel gilt auch auf anderen Geräten mit diesem freigegebenen Konto. Für
Absenderwechsel oder Schlüsselwechsel ist keine neue App-Veröffentlichung nötig.
Ein leeres Schlüsselfeld beim erneuten Speichern behält den vorhandenen Schlüssel.
**E-Mail-Versand erlauben** lässt sich deaktivieren, ohne die Einrichtung zu löschen;
dadurch pausieren Dokument-, Rechnungs-, Termin- und Marketing-E-Mails dieses
Kontos. Telegram bleibt separat. Nach einer Pause werden keine zuvor angelegten
unbestätigten Versandversuche automatisch wiederholt.

## Einmalige technische Freigabe im eigenen Supabase-Projekt

Diese Freigabe muss einmal die Person mit Projektzugriff vornehmen. Die App zeigt
die Schritte unter **Einmalige technische Freigabe**, inklusive kopierbarem SQL
und Befehlen für das angemeldete Konto. Bis dahin wird kein funktionierender
Produktivversand behauptet. Ohne Anbieter-Konto, bestätigte Domain und diese
Freigabe kann die statische GitHub-Pages-App keine E-Mails zustellen.

1. Bestehendes Projekt verwenden. Die öffentlichen Projektwerte
   `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` müssen wie bisher in
   GitHub → Repository Settings → Secrets and variables → Actions → Variables
   stehen. Falls sie noch fehlen: eintragen und den Pages-Workflow starten.
   Diese erstmalige Verbindung braucht einen Build, ein späterer Absender- oder
   Schlüsselwechsel nicht. **Keine** Service-Role- oder Anbieter-Schlüssel als
   `VITE_*` eintragen. Der eigene Praxis-Auth-Benutzer muss eine bestätigte
   E-Mail-Adresse besitzen.
2. [supabase/email-settings.sql](../supabase/email-settings.sql) im Supabase SQL
   Editor ausführen. Die Migration ist wiederholbar. Sie verwendet das in
   Supabase bereitgestellte Vault-Modul (`supabase_vault`), eine private Tabelle
   und ausschließlich für `service_role` freigegebene Funktionen. Falls die
   Vault-Erweiterung im Projekt nicht verfügbar ist, nicht durch eine
   Klartexttabelle ersetzen. Die Migration muss erfolgreich durchlaufen.
3. Serverseitig `APP_ORIGIN=https://nicoahb.github.io` und
   `EMAIL_OWNER_USER_ID=<UUID des freigegebenen Praxis-Auth-Benutzers>` setzen.
   Kein `/Psychologie/` im Ursprung. Für Newsletter/Kampagnen zusätzlich wie
   bisher `MARKETING_OWNER_USER_ID` auf dasselbe Konto setzen und die bestehende
   Marketing-Migration verwenden. `SUPABASE_URL`, `SUPABASE_ANON_KEY` und
   `SUPABASE_SERVICE_ROLE_KEY` stellt die Supabase-Funktionsumgebung bereit;
   der Service-Role-Schlüssel wird nicht an die App gegeben.
4. Aus dem aktuellen Checkout die Funktionen deployen:

   ```sh
   supabase functions deploy send-client-email --no-verify-jwt
   supabase functions deploy send-marketing --no-verify-jwt
   ```

   Beide übernehmen das gemeinsame Modul `supabase/functions/_shared/emailProvider.ts`.
   Die Befehle deaktivieren nur die Gateway-JWT-Prüfung, damit auch neue
   Supabase-JWT-Signierschlüssel funktionieren. Die Funktion selbst prüft bei
   jedem Aufruf den echten Benutzer über Supabase Auth und die fest vorgegebene
   Praxis-Kennung. Diese Prüfung **nicht** entfernen; es gibt keinen anonymen
   Versand.
5. In der App **Einrichtung prüfen**, Absender und Resend-Schlüssel speichern.
   `EMAIL_FROM` und `RESEND_API_KEY` als Supabase-Umgebungsvariablen sind für die
   neue Einrichtung nicht mehr nötig. `VITE_EMAIL_ENABLED` ist ein altes Flag und
   wird nicht mehr zur Freischaltung verwendet.
6. Selbsttest nur bewusst an die eigene Konto-Adresse auslösen. Bei Domainfehlern,
   ungültigem Schlüssel, fehlender Anmeldung oder Kontingentüberschreitung zeigt
   die App unterschiedliche, deutsch/ukrainische Hinweise.

Bestehende Installationen mit `EMAIL_FROM`/`RESEND_API_KEY` funktionieren weiter,
solange noch kein neuer Datensatz existiert. Auch eine fehlende neue Migration
(RPC-404) kann für diese Alt-Konfiguration überbrückt werden. Andere Lese- oder
Netzfehler führen **nicht** zu einem stillen Schlüssel-/Absenderwechsel. Ein in
der App gespeicherter, pausierter Datensatz überstimmt alte Umgebungswerte.

## Datenspeicherung und Grenzen

- Die App sendet den neu eingegebenen Provider-Schlüssel nur über HTTPS an die
  eigene Supabase-Funktion. Diese prüft Ursprung und den explizit freigegebenen
  Praxis-Benutzer. Speichern allein sendet keine Nachricht.
- Supabase Vault verschlüsselt den Schlüssel serverseitig. Die private
  Konfiguration speichert nur einen Secret-Verweis, Praxis-Absender und Status.
  Browser-Rollen dürfen weder Tabelle noch Vault-Klartextansicht noch die
  Service-Funktionen lesen/aufrufen. Antworten enthalten **nie** den Schlüssel.
- Der Provider-Schlüssel gehört nicht zum lokalen Kliententresor, wird nicht in
  IndexedDB/localStorage gespeichert und ist nicht in Klientenexporten oder
  App-Sicherungen enthalten. Nach Wechsel des Supabase-Projekts muss er erneut
  eingerichtet werden. Das Löschen des Supabase-Auth-Kontos entfernt auch seinen
  zugeordneten Vault-Eintrag. Bestehende lokale Akten, Schlüssel, Backups und
  verschlüsselte Synchronisation wurden nicht verändert.
- Ein gespeicherter Schlüssel ist noch kein Nachweis für eine bestätigte Domain
  oder tatsächliche Zustellung. Deshalb wird ausdrücklich ein eigener Test
  angeboten; es gibt keine automatische Testmail und keine neue Einwilligung.
- Gewöhnliche E-Mails/Anhänge sind weiterhin **nicht Ende-zu-Ende-verschlüsselt**.
  Beim gewählten Versand erhalten die Funktion und Resend ausschließlich die
  gewählte Nachricht/Unterlage, nicht den Tresorschlüssel oder andere Akten.
  Einwilligungen für Termin- und Marketing-Nachrichten bleiben unverändert.
- E-Mail-Erinnerungen laufen weiterhin nur bei geöffneter, entsperrter und
  verbundener App. Vor einem automatischen Versuch wird die Konfiguration geprüft;
  eine fehlende oder pausierte Einrichtung legt keinen ausstehenden Versuch an.
- Keine neue Abhängigkeit, kein SMTP-Kennwort im Frontend, keine Einrichtung
  eines fremden Postfachs und kein Abruf eingehender E-Mails. Keine Aussage über
  eine rechtliche oder datenschutzrechtliche Prüfung.

## Technische Übergabe und Prüfung für Claude

Frontend: `EmailSetupCard.tsx`, `emailSettings.ts`, `email-setup.css`, Einbindung in
`SettingsPage.tsx`, `documents.tsx`, `AppointmentEmail.tsx`; direkter Anleitungspfad
in `guide.ts`/`practiceFlow.ts`. Gleiche neue Textschlüssel in DE/UK.

Server: neue Migration und gemeinsamer Provider-Resolver. `send-client-email`
unterstützt zusätzlich die authentifizierten Aktionen `status`, `save`, `test`.
Der Testempfänger wird ausschließlich aus dem bestätigten Auth-Konto genommen;
ein im Request genannter Empfänger wird ignoriert. Der eigentliche
Dokument-/Rechnungsversand behält seine bisherigen Payloads und Idempotenzkennungen.
`send-marketing` nutzt denselben Resolver vor seiner bestehenden Versand-Sperre.
Secret-Zugriffe, Nachrichtentexte und Provider-Fehlerdetails werden nicht geloggt.

Prüfen mit `npm test`, `npm run build`, normalen Browser-Tests für Einrichtung,
Anleitung und axe. `email-settings-database.test.ts` prüft Rechte und Lebenszyklus
mit einer ausdrücklich simulierten Vault-SQL-API; es prüft nicht Supabase-Vault-
Kryptografie. Provider- und Auth-Antworten werden in Unit-Tests ebenfalls simuliert.

Ein separater Test-Build setzt **nur fiktive** öffentliche Werte und ausdrücklich
`VITE_EMAIL_ENABLED=false`. Die Browser-Tests fangen alle Anfragen an den Testhost
ab. So wird geprüft, dass das frühere Build-Flag nicht mehr benötigt wird:

```sh
VITE_SUPABASE_URL=https://email-test.supabase.co VITE_SUPABASE_ANON_KEY=public-test-key VITE_EMAIL_ENABLED=false npm run build
PLAYWRIGHT_EMAIL_TEST=true npm run test:e2e -- tests/browser/email-setup-connected.spec.ts tests/browser/email.spec.ts --workers=1
```

Diesen fiktiven Build **nicht veröffentlichen**. Der neue CI-Job `email-setup`
führt genau diesen Test getrennt vom echten Pages-Build aus. Zusätzlich laufen die
Einrichtungshinweise im bestehenden Safari/iPad/iPhone-Workflow. Automatisierte
Tests rufen weder ein echtes Supabase-Projekt noch einen echten Mailanbieter auf.

### Geänderte Dateien

- `.env.example`, `.github/workflows/checks.yml`, `playwright.ipad.config.ts`
- `README.md`, `HANDOFF.md`, `docs/email-versand.md`,
  `docs/praxisablaeufe-a-b-c.md`, `docs/email-einrichtung-in-der-app.md`
- `src/main.tsx`, `src/email-setup.css`, `src/pages/SettingsPage.tsx`
- `src/components/EmailSetupCard.tsx`, `src/components/documents.tsx`,
  `src/components/AppointmentEmail.tsx`
- `src/lib/emailSettings.ts`, `src/lib/documents.ts`, `src/lib/guide.ts`,
  `src/lib/practiceFlow.ts`, `src/lib/useAppointmentEmails.ts`
- `src/locales/de.json`, `src/locales/uk.json`
- `supabase/email-settings.sql`, `supabase/functions/_shared/emailProvider.ts`,
  `supabase/functions/send-client-email/index.ts`,
  `supabase/functions/send-client-email/handler.ts`,
  `supabase/functions/send-marketing/handler.ts`
- `tests/email-settings.test.ts`, `tests/email-settings-database.test.ts`,
  `tests/marketing-handler.test.ts`, `tests/guide.test.ts`
- `tests/browser/email-setup.spec.ts`,
  `tests/browser/email-setup-connected.spec.ts`
