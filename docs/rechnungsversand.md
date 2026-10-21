# Rechnungen als PDF versenden

In der Rechnungsansicht stehen PDF-Download, Druck, E-Mail und Telegram bereit. Der Begleittext richtet sich nach der im Klientenprofil hinterlegten Sprache (DE/UA), unabhängig von der Oberflächensprache. Vor dem Versand kann er bearbeitet werden. Ukrainische Rechnungen enthalten ausschließlich den vereinbarten Hrywnja-Betrag; der Euro-Vergleich bleibt in der App.

Die PDF wird auf dem Gerät mit eingebetteten lateinischen und kyrillischen Schriften erzeugt. Jede exportierte Fassung liegt anschließend verschlüsselt unter „Dokumente“ des Klienten. Dort und in der Rechnungsansicht erscheint die Versandhistorie. Ändert sich der Zahlungsstatus, entsteht beim nächsten Export eine weitere PDF-Fassung; bereits verschickte Dateien bleiben erhalten.

## E-Mail

Die vorhandene authentifizierte Funktion `send-client-email` wird verwendet. Einrichtung: [email-versand.md](email-versand.md). Ohne konfigurierten Anbieter wird kein erfolgreicher Versand angezeigt. Für den Rechnungsversand zunächst die E-Mail-Adresse im Klientenprofil ergänzen.

## Direkter Telegram-Versand

Der Bot-Token gehört ausschließlich in die Supabase Edge Function, niemals in GitHub-Pages-Variablen mit Präfix `VITE_` oder ins Frontend.

1. Den kostenlosen Bot über BotFather einrichten. Jeder Klient muss den Bot zunächst mit `/start` öffnen. Die persönliche numerische Chat-ID im Klientenprofil eintragen. Es werden nur private Chats unterstützt, keine Gruppen oder Kanäle.
2. Supabase Cloud-Authentifizierung einrichten und die UUID des Kontos der Beraterin aus Authentication → Users übernehmen. Die Funktion ist ausschließlich für dieses Konto freigeschaltet; eine Anmeldung allein berechtigt andere Konten nicht zum Versand.
3. In Supabase → Edge Functions → Secrets setzen: `APP_ORIGIN=https://nicoahb.github.io`, `TELEGRAM_OWNER_USER_ID=<UUID>` und `TELEGRAM_BOT_TOKEN=<Token>`. `SUPABASE_URL` und `SUPABASE_ANON_KEY` werden von Supabase bereitgestellt. Keine Schlüssel in die Dokumentation oder ins Repository schreiben.
4. Funktion deployen: `supabase functions deploy send-client-telegram`. Die Funktion validiert den Bearer-Token zusätzlich selbst über `/auth/v1/user`, prüft die UUID, Origin, Dateigröße und den PDF-Anhang. Bei Verwendung neuer Supabase-Schlüssel die Gateway-Konfiguration entsprechend der Supabase-Dokumentation anpassen; die interne Authentifizierungsprüfung niemals entfernen.
5. Unter Repository → Settings → Secrets and variables → Actions → Variables die **öffentlichen** Werte `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` und `VITE_TELEGRAM_ENABLED=true` setzen. Pages-Workflow erneut starten. Bot-Token ausschließlich in Supabase halten.
6. Mit einem eigenen Testkonto `/start` ausführen und eine Testrechnung versenden. Erst bei bestätigter Antwort von Telegram wird Annahmedatum und Nachrichten-ID in der verschlüsselten Historie gespeichert. Keine echten Klientendaten für Einrichtungstests verwenden.

Telegram-Bot-Chats sind **nicht Ende-zu-Ende-verschlüsselt**. Bei ausdrücklich ausgelöstem Versand wird nur die ausgewählte Rechnungs-PDF samt Begleittext über HTTPS an die Serverfunktion und Telegram übertragen. Andere Tresordaten und der Tresorschlüssel werden nicht übertragen. Die Funktion speichert keine Dateien oder Nachrichteninhalte und protokolliert keine Klientendaten. Den Versand mit dem Klienten abstimmen.

Die Annahme durch Telegram bestätigt weder Lesen noch Download. Telegram bietet für `sendDocument` keine Idempotenzschlüssel: Bei Verbindungsabbrüchen ist eine erfolgreiche Zustellung trotz fehlender Rückmeldung möglich. Deshalb gibt es keine automatischen Wiederholungen. Die Historie zeigt solche Versuche als „Versand nicht bestätigt“. Vor erneutem manuellem Versand den Chat prüfen. Einrichtungsfehler oder fehlende Schlüssel werden sichtbar angezeigt; die Demo sendet nie.

Der Versand erzeugt keine neuen Anbieter-Abonnements. Telegram Bot API und die konfigurierten Supabase-Funktionen lassen sich innerhalb ihrer aktuellen Free-Tier-Limits nutzen. Kosten und Limits des E-Mail-Anbieters bleiben Teil seiner Einrichtung.
