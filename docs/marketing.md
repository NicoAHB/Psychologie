# Newsletter, Vorlagen und Kampagnen

Die drei neuen Bereiche stehen in der Sidebar unter **Einstellungen → Marketing**. Die Navigation wird in `src/lib/navigation.tsx` aus einem Array erzeugt. Weitere Bereiche können dort ergänzt werden.

Der Code ist in dieser Reihenfolge lesbar: [SQL-Schema](../supabase/marketing.sql), [Newsletter.tsx](../src/components/Newsletter.tsx), [TemplateManager.tsx](../src/components/TemplateManager.tsx), [MarketingCampaigns.tsx](../src/components/MarketingCampaigns.tsx), [Versand-Backend](../supabase/functions/send-marketing/handler.ts).

## 1. SQL und Versanddienst einrichten

1. Das bestehende `supabase/schema.sql` muss eingerichtet sein. Anschließend **`supabase/marketing.sql`** im SQL-Editor ausführen. Die Migration ist wiederholbar. Ohne diese Migration bleiben Vorlagen und Kampagnen lokal nutzbar; Online-Versand zeigt einen Einrichtungshinweis.
2. Die Supabase Edge Function `send-marketing` veröffentlichen:

   ```sh
   supabase functions deploy send-marketing
   ```

3. Nur im Backend diese Secrets setzen, niemals als `VITE_*`, im Repository oder im Browser:

   - `MARKETING_OWNER_USER_ID`: UUID des berechtigten Praxis-Kontos; ausdrücklich erforderlich.
   - `APP_ORIGIN`: Herkunft der App, bei GitHub Pages `https://nicoahb.github.io` (ohne `/Psychologie/`).
   - E-Mail: `RESEND_API_KEY`, `EMAIL_FROM` mit einer beim Anbieter bestätigten Absenderdomain.
   - Telegram: `TELEGRAM_BOT_TOKEN` des eigenen Bots. Klienten müssen diesen Bot selbst gestartet haben; nur positive private Chat-IDs werden angenommen, keine Gruppen.
   - Supabase stellt `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in Edge Functions bereit.

   Die Function prüft den Bearer-Token über Supabase Auth und vergleicht das Konto mit `MARKETING_OWNER_USER_ID`. Den öffentlichen Supabase-Build wie bisher konfigurieren. In der App anmelden und im Newsletter **Versand-Einrichtung prüfen** wählen. Es gibt keine neue `VITE_MARKETING_ENABLED`-Variable.

4. In jedem Klientenprofil die Kontaktadresse/Chat-ID und eine **eigene Marketing-Freigabe pro Kanal** hinterlegen. Terminerinnerungs-Einwilligungen werden nicht übernommen. Änderungen am Kontakt entfernen das Häkchen; eine neue ausdrückliche Freigabe erzeugt eine neue zufällige Berechtigung. Geburtstage sind optional. **E-Mail und Telegram sind unabhängig anwählbar**; beide Häkchen erlauben beide Kanäle. **Keine Marketing-Nachrichten** entfernt beide Freigaben. Ohne Häkchen wird dieser Klient bei Marketing-Nachrichten ausgelassen. Eine E-Mail-Abmeldung widerruft nur E-Mail, Telegram bleibt unabhängig davon steuerbar.

Es wurden keine Migration in einem echten Projekt und keine echte E-Mail-/Telegram-Nachricht durch die Entwicklung ausgelöst. Die Einrichtung im Praxis-Projekt und ein Test mit eigenen Kontakten stehen aus.

### Tabellen und Verschlüsselung

Die SQL-Datei enthält die verlangten Tabellen `newsletters`, `message_templates`, `marketing_campaigns` mit Besitzer-/Tresor-ID und Row Level Security. Wegen der bestehenden Verschlüsselungsarchitektur sind Titel, Nachrichten und vollständige Datensätze **AES-GCM-Objekte in JSONB** statt Klartextspalten. `image_url` ist ausschließlich eine `private:<Blob-UUID>`-Referenz. Bilder liegen verschlüsselt im vorhandenen privaten Storage-Bucket. Namen, Kontaktadressen, Geburtstage und Inhalte werden nicht als lesbare Marketing-Listen in Supabase gespeichert.

Der verschlüsselte Tresor ist die führende Datenquelle. Die zusätzlichen Tabellen sind beim Tresor-Sync aktualisierte, verschlüsselte Projektionen. Ein vorübergehend fehlgeschlagener Projektionsabgleich verhindert nicht die bereits erfolgte Sicherung des Tresors; die App zeigt den Unterschied an. Ein neues Gerät erhält Vorlagen und Archiv über den bisherigen Tresor-/Dateiabgleich, nicht durch Klartext-Abfragen dieser Projektionen.

Der Backend-Versand muss die ausdrücklich gewählte Zieladresse, Nachricht und gegebenenfalls das Marketing-Bild im Arbeitsspeicher verarbeiten und an den gewählten Anbieter weiterreichen. E-Mail und Telegram sind **keine Ende-zu-Ende-verschlüsselten Therapiekanäle**. Keine Diagnosen, Sitzungsinhalte oder vertraulichen Bilder für Newsletter verwenden. Der Dienst hat keinen Tresorschlüssel, liest keine Patientenakte und protokolliert keine Nachrichteninhalte.

Zusätzliche Tabellen `marketing_consents` und `marketing_delivery_receipts` halten nur zufällige Berechtigungs-/Versand-IDs, Kanal, Status und Zeitpunkte. Kontaktadressen werden ausschließlich durch einen geheimen serverseitigen HMAC gebunden; es gibt keine öffentliche Liste einfacher E-Mail-Hashes. Beim Wechsel des Service-Role-Schlüssels ändert sich diese Bindung; bestehende Versand-Freigaben müssen dann bewusst erneuert werden. Das Verfahren ersetzt weder die Erfassung der tatsächlichen Einwilligung durch die Praxis noch eine individuelle rechtliche Prüfung.

## 2. Newsletter bedienen

- **Kampagne erstellen**: Empfänger einzeln oder alle freigegebenen Kontakte auswählen; E-Mail, Telegram oder beide Kanäle auswählen; Betreff optional, Text erforderlich; optional JPEG/PNG/WebP wählen. Telegram erhält das Bild als WebP-Dateianhang mit Nachricht, damit das Format auf allen Geräten erhalten bleibt. Das Bild wird neu kodiert und komprimiert, Metadaten werden entfernt. Im Tresor wird nur die verschlüsselte WebP-Datei abgelegt.
- Deutsche und ukrainische Nachricht separat eingeben oder aus einer zweisprachigen Vorlage laden. Die Empfängersprache bestimmt den Text. Eine fehlende ukrainische Fassung verhindert den Versand an ukrainische Klienten; es gibt keine automatische Übersetzung.
- **Newsletter versenden** öffnet eine Vorschau mit Empfängerzahl. Die Vorschau zeigt Klientenanzahl und einzelne Nachrichten getrennt: Ein Klient mit beiden Freigaben erhält bei beidseitiger Auswahl zwei Nachrichten. Ein Klient mit nur einer Freigabe erhält ausschließlich diese; ohne Freigabe keine. Ohne gewählten Kanal ist der Versand deaktiviert. Erst **Versand bestätigen** startet den Einzelversand. Kontakte sehen keine anderen Empfänger.
- Ein unversendeter Entwurf bleibt beim Wechseln der App-Bereiche erhalten, bis zum Sperren/Schließen. Mit **Als Vorlage speichern** lässt sich der Text dauerhaft sichern; Bilder und Empfängerauswahl sind keine Vorlagenbestandteile.
- **Archiv** zeigt Zeitpunkt, tatsächlichen Kanal, Textanfang/Betreff, ursprüngliche Empfängerzahl und Status. Die Detailansicht enthält die damals verwendeten Sprachfassungen, das Bild und einzelne Versandstände. Spätere Änderungen einer Vorlage verändern kein Archiv.
- „Erfolgreich“ heißt **vom Anbieter angenommen**, nicht zugestellt oder gelesen. Die App baut keine Tracking-Pixel ein. „Teilweise“, „Fehlgeschlagen“ und „Unklar“ werden getrennt angezeigt.
- Sperren bricht die laufende Browser-Anfrage ab. Bereits vom Anbieter angenommene Nachrichten können dadurch nicht zurückgerufen werden. Nach dem nächsten Öffnen gleicht die App vorhandene Versandbelege ab.

## 3. Vorlagen und automatische Kampagnen

`src/components/TemplateManager.tsx`: Suchen, anlegen, bearbeiten und löschen; Kategorien Info, Grußtext, Organisatorisch. Drei feste zweisprachige Ausgangstexte können angepasst werden. **Als Newsletter verwenden** öffnet das Formular; bei bereits vorhandenem Text erscheint eine Ersetzungsabfrage. Das Löschen einer Vorlage deaktiviert ihre Kampagnen.

`src/components/MarketingCampaigns.tsx`: Geburtstag, Willkommen nach 0–365 Tagen ab Anlage/erster dokumentierter Sitzung, oder ein festes Datum (optional jährlich). E-Mail-/Telegram-Häkchen, Vorlage, Zielgruppe und lokale Versandzeit sind einstellbar. Neue Kampagnen sind **inaktiv**. Beide Kanäle sind gemeinsam auswählbar. Werden beide Häkchen entfernt, wird die Kampagne inaktiv; sie sendet nichts. Für eine aktive zweisprachige Zielgruppe muss die Vorlage beide Texte enthalten. Es werden nur aktive, für den jeweiligen Kanal freigegebene Klienten angesprochen, keine pausierten oder abgeschlossenen Akten.

**Aktuelle Betriebsart:** Die App prüft bei geöffnetem, entsperrtem Tresor mit Internetverbindung etwa minütlich sowie über **Fällige Kampagnen prüfen**. Maßgeblich sind Datum und Uhrzeit in der Zeitzone des Klienten. Versand beginnt frühestens zur eingestellten Uhrzeit; Browser-Timer garantieren keine sekundengenaue Ausführung, besonders nicht bei inaktivem iPad-Tab. Geschlossene/gesperrte Apps senden nichts. Verpasste Tage werden nicht nachträglich versendet. Geburtstage am 29. Februar fallen in Nicht-Schaltjahren auf den 28. Februar.

Der Versand bei geschlossener App ist nicht aktiviert: Dafür wäre ein eigens freigegebener serverseitiger Versandplan nötig. Geburtstage oder der private Tresorschlüssel werden dafür nicht auf den Server kopiert.

## 4. Abmeldung und Doppelversand

Jede Nachricht enthält einen persönlichen Abmeldelink. Das Geheimnis steht im URL-Fragment, nicht in HTTP-Queryparametern. Der Gast benötigt kein Konto und bestätigt die Abmeldung mit einem Button. Ein isolierter Supabase-Gastclient übernimmt keine gespeicherte Praxis-Sitzung. Die Datenbank widerruft alle bereits registrierten Freigaben für dieselbe Zieladresse und denselben Kanal; ältere, noch offline vorhandene Freigaben werden beim nächsten Versand ebenfalls blockiert. Eine spätere neue ausdrückliche Freigabe bleibt möglich. Online-Widerrufe werden beim nächsten Abgleich im Tresor sichtbar; lokale Widerrufe werden vor weiteren Sendungen an den Dienst übermittelt.

Stabile IDs pro Kampagne/Tag/Klient/Kanal und eine atomare Datenbank-Sperre verhindern, dass zwei Geräte dieselbe automatische Nachricht doppelt starten. Der dauerhafte Status **sending** wird vor dem Anbieteraufruf geschrieben. Ein alter Versandversuch wird nach fünf Minuten als **unklar** behandelt und nicht automatisch erneut versendet. Bei Telegram lässt sich exakt einmaliger Versand nach Netzwerkabbrüchen technisch nicht garantieren. Sicherheit gegen unbeabsichtigte Wiederholung hat hier Vorrang; unklare Fälle müssen geprüft werden. E-Mail nutzt zusätzlich den Idempotenzschlüssel des Anbieters. Bereits gespeicherte IDs aus der früheren Version mit nur einem Kanal bleiben erhalten, damit eine Umstellung auf beide Kanäle keine bereits gesendete Nachricht wiederholt. Das Archiv zählt Klienten einmal und zeigt Versandstände je Kanal. Der Dienst begrenzt alle einzelnen Marketing-Versuche auf 100 pro UTC-Tag und Praxis (beide Kanäle für einen Klienten zählen als zwei Versuche); eine Fehlermeldung kann ein niedrigeres Anbieterlimit anzeigen.

Es gibt keine zusätzlichen NPM-Pakete. Genutzt werden vorhandene Open-Source-Bibliotheken und Supabase Edge Functions. Supabase, Resend und Telegram unterliegen ihren jeweiligen kostenlosen Kontingenten und Bedingungen; es wird kein kostenpflichtiger Tarif automatisch aktiviert. Für eine E-Mail-Absenderdomain muss die Praxis bereits eine geeignete Domain besitzen oder sie gesondert einrichten.

## 5. HTML/CSS-Beispiel

`examples/aurora-dashboard.html` und `examples/aurora-dashboard.css` sind das eigenständige Beispiel ohne Framework, JavaScript oder Webfonts. Alle gewünschten Regler stehen oben im `:root`: zwei Aurora-Farben, Hintergrund-Blur, Card-Deckkraft, Glas-Blur, Rahmenfarbe/-stärke und Schatten. Darkmodus, reduzierte Transparenz und responsive Tabellen sind berücksichtigt. Nach `npm run dev` lässt sich `/examples/aurora-dashboard.html` öffnen; die Dateien sind auch direkt gemeinsam lokal verwendbar. Der Produktionsbuild veröffentlicht diesen Entwicklungsbeispiel-Ordner nicht als eigene App-Seite.

Der angekündigte Empfehlungsbonus von 10 % für ein Jahr ist ausdrücklich **noch nicht implementiert** und benötigt den späteren konkreten Auftrag.

## Prüfungen

- `npm test`: Modell-/Altdaten-Tests, kanalgebundene Freigaben, Zeitzonen, Geburtstags-/Willkommensregeln, CRDT/Erasure, verschlüsselter Round-Trip und lesbarer Export ohne fremde Empfänger/Abmeldesecrets.
- PostgreSQL-Tests mit PGlite: wiederholbare Migration, Besitzertrennung/RLS, Klartext-Abweisung, dauerhafte Versand-Sperre, Abmeldung einschließlich älterer Offline-Freigaben und Tageslimit.
- Testbarer Edge-Handler: Autorisierung, private Telegram-Ziele, Bildanhang, einzelne E-Mail-Adressierung, Anbieterfehler und unklare Versandstände. Ausschließlich simulierte Anbieter.
- `tests/browser/marketing.spec.ts`: Vorlagen, Sprachwechsel ohne Formularverlust, Kontaktfreigabe, Kampagnen, Sperren/Neuladen, Löschen und Deaktivierung; axe für 390/820 px, Hell/Dunkel, Formulare und Dialoge.
- `tests/browser/marketing-delivery.spec.ts`: isolierter Supabase-Ersatz, kompletter Versand mit Bild an DE/UA, verschlüsselte lokale/Cloud-Projektion, Archiv und anonymer Abmeldelink ohne Übernahme des Praxis-Logins. Kein echter Provider-Aufruf.
- Die vorhandene iPad-/iPhone-WebKit-CI umfasst zusätzlich den Marketing-Arbeitsablauf. Das ist kein Ersatz für die praktische Abnahme auf einem echten iPad.
