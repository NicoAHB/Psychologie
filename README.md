# Praxisraum

Neu: kleinere PDF-Basisschriften und Runtime-Cache, Playwright-Browsercache in CI, automatische verschlüsselte In-App-Sicherung auch auf dem iPad, einstellbare Sperrzeit, geprüfter PHQ-9-/GAD-7-PDF-Rücklauf, lesbarer Klienten-ZIP-Export, datierter NBU-Kurscache und Schutz vor wiederholtem Telegram-Versand. Bedienung, Migration und Grenzen: [Performance und Sicherung](docs/performance-und-sicherung.md).

Neu: Zahlungsziele, vorbereitete Zahlungserinnerungen auf DE/UA, verknüpfte Storno- und Ersatzrechnungen, eine zentrale Rücklaufübersicht sowie auffällige Urlaubs- und Abwesenheitseinträge im Kalender. Bedienung und Grenzen: [Rechnungen und Abwesenheiten](docs/rechnungen-und-abwesenheiten.md).

Eine lokale, verschlüsselte Praxis-PWA mit deutscher und ukrainischer Oberfläche, Klientenprofilen einschließlich Profilbildern, Sitzungsvorbereitung, Fotonotizen mit Tags, Terminen und Einnahmenübersicht.

Der Sonnen-/Mond-Schalter neben der Sprachauswahl wechselt sofort zwischen Hell und Dunkel, auch auf dem Sperrbildschirm. Unter **Einstellungen → Darstellung → Farbschema** lässt sich zusätzlich die Geräteeinstellung verwenden (Standard). Die Auswahl bleibt lokal auf dem Gerät gespeichert, unabhängig vom Tresor. Im Darkmodus nutzt die App eine dunkelblaue Palette mit dezenten Glasflächen, deckenden Eingabefeldern und getrennten Farben für bezahlte/offene Beträge. Bei reduzierter Transparenz oder fehlender Browserunterstützung werden deckende Flächen verwendet. Der Darkmodus gilt für die Bildschirmoberfläche; Rechnungsdruck und erzeugte PDFs behalten ihre Papierfarben.

## Auf einem anderen Gerät weiterarbeiten

Der aktuelle veröffentlichte Entwicklungsstand ist auf GitHub im Branch **`main`** gesichert. Der Schreibzugriff funktioniert inzwischen. Für den Gerätewechsel dieses Repository in Codex oder einer lokalen Entwicklungsumgebung öffnen. Alternativ unterstützt GitHub Codespaces die Entwicklung im Browser (kostenlos nur innerhalb des persönlichen Kontingents). Der lokale Ordner einer Cloud-Aufgabe ist kein geräteübergreifender Git-Ersatz.

```sh
git clone --branch codex/praxisraum-foundation https://github.com/NicoAHB/Psychologie.git
cd Psychologie
npm ci
npm run dev
```

Node.js 22 oder neuer verwenden. Für Produktion: `npm run build`, anschließend `dist/` auf einem HTTPS-Host bereitstellen (z. B. Cloudflare Pages Free). `npm run preview` prüft den Produktionsstand lokal. PWA und Web Crypto benötigen HTTPS oder localhost. Beim Tablet-Zugriff auf einen Entwicklungsserver über eine unverschlüsselte LAN-IP stehen sichere Browser-APIs nicht zuverlässig zur Verfügung.

## Veröffentlichung über GitHub Pages

Der Workflow `.github/workflows/pages.yml` testet und baut die App bei Änderungen auf `main` und veröffentlicht das Ergebnis über die offiziellen GitHub-Pages-Actions. Keine Hosting-Zugangsdaten erforderlich; die öffentlichen Supabase-Variablen sind optional.

1. Unter [Repository → Settings → Pages](https://github.com/NicoAHB/Psychologie/settings/pages) als Quelle **GitHub Actions** auswählen. Actions müssen für das Repository freigeschaltet sein.
2. Unter [Actions → Publish Praxisraum](https://github.com/NicoAHB/Psychologie/actions/workflows/pages.yml) den Lauf beobachten. Falls ein Lauf bereits vor der Pages-Aktivierung fehlgeschlagen ist, **Re-run all jobs** wählen oder den Workflow über **Run workflow** starten.
3. Erst nach erfolgreichem Deployment ist die App unter **https://nicoahb.github.io/Psychologie/** erreichbar. Die lokale Prüfung allein bestätigt kein öffentliches Deployment.

GitHub Pages ist für öffentliche Repositories im GitHub-Free-Tarif verfügbar. Falls GitHub bei einem privaten Repository einen kostenpflichtigen Tarif verlangt, wurde die Sichtbarkeit von uns nicht verändert. Die URL veröffentlicht die Anwendung; Praxisdaten bleiben auf dem jeweiligen Gerät und werden nicht im Repository abgelegt.

Der Build setzt `VITE_BASE_PATH=/Psychologie/`. HTML, Manifest, Icons und Service Worker verwenden denselben Unterpfad; der Offline-Cache bleibt auf diesen App-Pfad begrenzt. `npm run build` ohne Variable baut weiterhin für die Domainwurzel.

Optionale öffentliche Projektvariablen unter **Settings → Secrets and variables → Actions → Variables**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_REMINDER_PUBLIC_KEY`. Diese werden beim nächsten Build übernommen. Niemals einen Service-Role-Key, eine Tresor-Passphrase, Bot-Token oder den privaten RSA-Schlüssel als `VITE_*` hinterlegen.

Zusätzliche Prüfung für den GitHub-Pages-Pfad:

```sh
VITE_BASE_PATH=/Psychologie/ npm run build
VITE_BASE_PATH=/Psychologie/ PLAYWRIGHT_PORT=4180 npx playwright test tests/browser/pages.spec.ts
```

GitHub Pages wertet `public/_headers` nicht aus. Diese Datei ist eine Empfehlung für Hosts, die benutzerdefinierte Sicherheitsheader unterstützen. Für einen späteren Praxisbetrieb mit eigenen Headern kann ein geeigneter HTTPS-Host verwendet werden.

## Aktueller Funktionsumfang

- Sofortiger Sprachwechsel DE/UA, auch in Formularen, ohne Verlust laufender Eingaben; Wörterbücher in `src/locales/de.json` und `uk.json`.
- IndexedDB enthält AES-256-GCM-verschlüsselte Praxisdaten und Bilder. PBKDF2-SHA-256 mit 600.000 Iterationen und zufälligem Salt leitet den Schlüssel aus einer separaten Tresor-Passphrase ab. Schlüssel bleiben im Arbeitsspeicher. Automatische Sperre nach zehn Minuten Inaktivität.
- Profilbilder bis 256 Pixel, Fotonotizen bis 1600 Pixel; JPEG/PNG/WebP bis 20 MB. Canvas-Neukodierung entfernt ursprüngliche EXIF-Metadaten. Bilder werden vor der Ablage verschlüsselt.
- Klientenprofil mit vier Bereichen: **Überblick** (nächster Termin in Praxis- und Klientenzeit, letzte Sitzung, offene Beträge, letzter Fragebogen, „Für das nächste Mal“, offene Hausaufgaben, zuletzt Besprochenes, wiederkehrende Themen), **Besprochen** (chronologischer Verlauf mit Tags), **Fragebögen**, **Finanzen**.
- **Was haben wir besprochen:** Im Sitzungsformular lassen sich der Gesprächsinhalt tippen, **ein oder mehrere Fotos des handschriftlichen Notizzettels** aufnehmen bzw. wählen (verschlüsselt, an die Sitzung angehängt), eine **Hausaufgabe** festhalten und das **Thema für das nächste Mal** eintragen (landet in der Vorbereitung des Klienten). Beim nächsten Mal wird die letzte Hausaufgabe zur Rückschau angezeigt; „Als Nachricht kopieren“ erzeugt die Hausaufgabe samt nächstem Termin in Sprache und Ortszeit des Klienten.
- Einnahmen nach **Zahlungsdatum**, Monatsdiagramm, letzter Monat mit Vormonatsvergleich und Jahresauswahl. Offene Beträge sind separat ausgewiesen. Geldbeträge werden in ganzen Cent berechnet.
- Sitzungen und Termine lassen sich nachträglich bearbeiten (Termine verschieben, Beträge/Notizen/Tags korrigieren). Sitzungen, Fotonotizen und ganze Klienten (mit allen zugehörigen Daten) können endgültig gelöscht werden; die verschlüsselten Bilder werden dabei auch lokal und nach der nächsten Synchronisierung aus der Cloud entfernt (Recht auf Löschung). Bereits heruntergeladene Sicherungsdateien bleiben unverändert.
- Überschneidende Termine werden beim Anlegen/Verschieben gewarnt (nicht verboten). Der Betrag wird aus der letzten Sitzung des Klienten vorgeschlagen.
- Verschlüsselte Sicherungen einschließlich referenzierter Bilder, Import, Offline-App-Shell, private optionale Supabase-Synchronisation. Haben zwei Geräte gleichzeitig geändert, werden die Änderungen **je Datensatz zusammengeführt** (neuere Änderung gewinnt; Löschungen werden mit Löschvermerken übertragen); nichts wird still überschrieben.
- **Zeitzonen:** Jeder Klient hat eine eigene Zeitzone. Termine zeigen **immer beide Uhrzeiten**, wenn die Uhren abweichen – beim Anlegen als zwei Karten („Praxis · DE 18:00 Uhr“ / „Klient · UA 19:00 Uhr“) mit dem Satz „Für den Klienten ist der Termin um 19:00 Uhr (Ortszeit Kiew, Ukraine)“, in Listen als Zeitpaar „18:00 DE / 19:00 UA“, in der Wochenansicht und im Klientenüberblick. Fällt die Klientenzeit auf einen anderen Tag, steht „am Folgetag“ bzw. „am Vortag“ dabei. Die Zeitzone des Klienten lässt sich direkt im Terminformular einstellen und wird beim Klienten gespeichert. Beim Anlegen lässt sich wählen, in welcher Zeitzone die Uhrzeit vereinbart wird (18:00 Berlin = 19:00 Kiew). „Termintext kopieren“ erzeugt eine Bestätigung für den Klienten in dessen Sprache und Ortszeit, die `.ics`-Datei für den Klienten enthält den exakten UTC-Zeitpunkt.
- **Kalender:** Listen- und Wochenansicht (in Praxis-Ortszeit), Terminserien (wöchentlich, alle 2 Wochen, monatlich) mit Änderung/Absage „auch alle folgenden“, Export aller anstehenden Termine als `.ics` (wahlweise ohne Klientennamen).
- **Rechnungen:** Praxisdaten, fortlaufende Rechnungsnummern, Druck-/PDF-Ansicht (Deutsch oder Ukrainisch), unveränderliche Rechnungsstände; CSV der Einnahmen nach Zahlungsdatum für die Steuerberatung (Klienten standardmäßig pseudonymisiert). Die App ersetzt keine Steuerberatung.
- **Suche** über Klienten, Vorbereitung, Sitzungsnotizen, Fotonotiz-Texte, Tags und Rechnungsnummern (Strg/Cmd+K), ohne Beachtung von Groß-/Kleinschreibung und Akzenten, in lateinischer und kyrillischer Schrift.
- **Zugang:** Wiederherstellungsschlüssel (256 Bit, mit Prüfziffer) für den Fall einer vergessenen Passphrase, Passkey-Entsperrung per Fingerabdruck/Gesicht (WebAuthn PRF), Passphrase ändern. Tresore aus der ersten Version öffnen weiter und werden beim ersten Einrichten verlustfrei auf das neue Format (umhüllter Datenschlüssel) gehoben.
- **Automatische Sicherung:** Auf Computern mit Chrome/Edge schreibt die App nach jeder Änderung eine verschlüsselte Sicherungsdatei in einen gewählten Ordner (z. B. iCloud Drive/OneDrive). Auf dem iPad (Safari) fehlt diese Browserfunktion; dort dienen die automatische Cloud-Synchronisierung und „Sicherung teilen“ (→ „Dateien“). Ein Hinweis erscheint, wenn es keine oder nur eine alte Sicherung gibt. Zusätzlich hält ein **Versionsverlauf** bis zu 30 frühere Stände bereit, um versehentliche Löschungen rückgängig zu machen (beim Löschen eines ganzen Klienten wird der Verlauf bewusst geleert).
- **Fragebögen** PHQ-9 und GAD-7 (Deutsch/Ukrainisch) mit Punktwert, Schweregrad, Verlaufsdiagramm und Hinweis bei positiver Antwort auf PHQ-9 Item 9; eigene **Notizvorlagen** (plus SOAP, Erstgespräch, Verlauf).
- **Aktualisierungen:** Eine neue Programmversion wird im Hintergrund geladen und oben in der App angekündigt („Eine neue Version von Praxisraum ist bereit“). Sie wird erst nach einem Klick auf **Jetzt aktualisieren** aktiv; vorher werden offene Eingaben gespeichert. Installierte Apps prüfen stündlich und beim Zurückkehren in die App. Ein unerwarteter Darstellungsfehler zeigt statt einer leeren Seite eine zweisprachige Wiederherstellungsseite (die Daten bleiben verschlüsselt gespeichert).
- **Barrierefreiheit:** Hell- und Dunkelmodus erfüllen WCAG 2.1 AA bei den Kontrasten (automatisch mit axe-core geprüft, Desktop und Handy, inklusive Formulare), Link „Zum Inhalt springen“ für die Tastatur, eigener Seitentitel je Bereich. Die Zahlungsliste zeigt 100 Einträge pro Seite und lädt weitere auf Wunsch.
- Demo enthält ausschließlich erfundene Daten und schreibt keine Praxisdaten in IndexedDB. Änderungen in der Demo gehen beim Sperren verloren.

## Wichtig: Daten auf einem zweiten Gerät

Ein GitHub-Push sichert den **Programmcode**, keine Praxisdaten. Praxisdaten bleiben im Browserprofil des jeweiligen Geräts. Für den Gerätewechsel eine verschlüsselte Sicherung herunterladen und auf dem zweiten Gerät importieren, oder die optionale Supabase-Synchronisation einrichten. Die Tresor-Passphrase wird auf jedem Gerät zum Entschlüsseln benötigt; es gibt keine Hintertür zur Wiederherstellung. Browserdaten können vom Gerät gelöscht werden: regelmäßig Sicherungen außerhalb des Geräts aufbewahren.

## Kostenlose optionale Cloud-Synchronisation

1. Supabase-Free-Projekt anlegen und `supabase/schema.sql` im SQL-Editor ausführen.
2. E-Mail/Passwort-Authentifizierung aktivieren; E-Mail-Bestätigung konfigurieren.
3. `.env.example` nach `.env` kopieren und **öffentliche** Projekt-URL sowie Anon-/Publishable-Key eintragen. Niemals Service-Role-Key oder Bot-Token in `VITE_*` eintragen.
4. App neu starten bzw. neu bauen. In Einstellungen Cloud-Konto erstellen/anmelden und synchronisieren.
5. Auf einem neuen Gerät auf dem Sperrbildschirm „Tresor aus der Cloud laden“, anmelden und anschließend mit der ursprünglichen Tresor-Passphrase öffnen.

Die Datenbank erhält ausschließlich den verschlüsselten Tresor und zufällige IDs. Der private Storage-Bucket enthält ausschließlich verschlüsselte Bilder. RLS trennt Konten. Die Revisionsprüfung verhindert stilles Überschreiben durch ein zweites Gerät. Hat ein anderes Gerät inzwischen gespeichert, holt das Gerät den Cloudstand, führt beide Stände je Datensatz zusammen und speichert das Ergebnis. Nur wenn derselbe Datensatz auf beiden Geräten geändert wurde, gewinnt die neuere Änderung (bei Klientenprofilen gilt das für den ganzen Datensatz). Doppelt vergebene Rechnungsnummern aus zwei gleichzeitig offline arbeitenden Geräten werden markiert. Automatische Synchronisation ist optional und läuft nur bei geöffnetem Tresor. Erinnerungsänderungen werden erst beim Synchronisieren an den Dienst übertragen.

Free-Tier-Angebote sind innerhalb ihrer aktuellen Kontingente kostenlos; **dauerhaft kostenlose Verfügbarkeit oder unveränderliche Konditionen lassen sich nicht garantieren**. Supabase Free kann bei Inaktivität pausieren und hat Speicher-, Datenbank- und Egress-Limits. Eine öffentlich zugängliche App sollte zusätzlich Zugriffs-/Registrierungsbeschränkungen erhalten. Kontingente regelmäßig kontrollieren, keinen kostenpflichtigen Tarif aktivieren. Die App ist ein Grundgerüst, kein bereits datenschutzrechtlich geprüftes Praxisprodukt.

## Telegram-Erinnerungen

Siehe `scripts/send-reminders.mjs`, `supabase/schema.sql` und `.github/workflows/reminders.yml`.

Telegram-Bots unterstützen **keine Ende-zu-Ende-Verschlüsselung ihrer Nachrichten**. Die Zustelldaten werden im Browser separat mit einem öffentlichen RSA-Schlüssel hybrid verschlüsselt; nur der Erinnerungsdienst besitzt den privaten Schlüssel. Der Dienst erhält keinen Tresorschlüssel und keine Klientennamen oder Sitzungsnotizen. Er entschlüsselt nur Chat-IDs, Sprache und Uhrzeit. Telegram sieht die tatsächliche Erinnerung und Empfänger-Metadaten. Für Klienten vorher Einwilligung einholen.

Schlüsselpaar auf einem sicheren Gerät erzeugen:

```sh
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out reminder-private.pem
openssl pkey -in reminder-private.pem -pubout -out reminder-public.pem
```

Den öffentlichen PEM-Schlüssel als `VITE_REMINDER_PUBLIC_KEY` setzen (Zeilenumbrüche oder literale `\n`). Private Datei niemals ins Repository einchecken. Für den Worker ausschließlich geschützte Laufzeit-/GitHub-Actions-Secrets setzen: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `REMINDER_PRIVATE_KEY`, `REMINDER_OWNER_ID` (UUID des eigenen Supabase-Auth-Kontos). Der Worker verarbeitet ausschließlich Jobs dieses Kontos, auch wenn weitere Konten im Projekt registriert sind. Der Service-Role-Key ist privilegiert und gehört nie ins Frontend. Bot über BotFather anlegen; Empfänger müssen `/start` senden. Numerische Chat-ID in der App eintragen. Beim Klienten ukrainische Erinnerung und Einwilligung auswählen; eigene Chat-ID und Erinnerungen in Einstellungen aktivieren, danach synchronisieren.

Der Sollzeitpunkt wird als **18:00 Uhr am vorherigen Kalendertag in der Zeitzone des Termins** berechnet; Sommer-/Winterzeit werden berücksichtigt. Die Nachricht nennt **nie nur eine Uhrzeit**, sondern Datum, Ortszeit, Ortsname und UTC-Abweichung des Empfängers und – falls abweichend – zur Orientierung die Praxiszeit. Die App übergibt dem Dienst dazu den exakten Zeitpunkt und beide Zeitzonen (verschlüsselt); der Dienst formuliert den Text. Beispiel:

- DE: `Erinnerung an Ihren Termin: Mittwoch, 15. Juli 2026, 19:00 Uhr (Kiew, UTC+3). Zur Orientierung — Berlin: 18:00 Uhr (UTC+2).`
- UA: `Нагадування про Вашу зустріч: середа, 15 липня 2026 р., 19:00 (Київ, UTC+3). Для довідки — Берлін: 18:00 (UTC+2).`

Die Praxis selbst erhält die Erinnerung stets auf Deutsch in Praxiszeit, mit der Ortszeit des Klienten dahinter. Erinnerungen, die eine ältere App-Version noch eingereiht hat, werden weiter im alten Format zugestellt.

Kostenlose GitHub-Actions-Cronjobs können verspätet sein, ausfallen und bei inaktiven öffentlichen Repositories deaktiviert werden. Eine exakte Zustellung um 18:00 Uhr ist damit nicht garantiert. Das Beispiel prüft alle zehn Minuten zwischen 15 und 18 Uhr UTC (Berlin/Kyiv, saisonabhängig); ausstehende Nachrichten werden nur bis Mitternacht des Vorabends nachgeholt, damit niemals am Termintag eine irreführende „morgen“-Nachricht versendet wird. Bereits vom Dienst reservierte Zustellungen können bei einer gleichzeitigen Terminabsage nicht mehr zuverlässig zurückgerufen werden. Bei einem bereits laufenden eigenen Rechner kann `CRON_TZ=Europe/Berlin` mit `0 18 * * * node /pfad/scripts/send-reminders.mjs` verwendet werden. Auch dort bleibt externe Zustellzeit abhängig von Telegram und Netzwerk.

Der Worker reserviert Jobs mit einer Lease und speichert den Erfolg je Empfänger. Bei einem Absturz zwischen Telegram-Zustellung und Datenbankbestätigung ist eine doppelte Nachricht technisch möglich; Telegram bietet hierfür keinen Idempotenzschlüssel. Es werden keine Chat-IDs, Bot-Tokens oder Nachrichtentexte protokolliert. GitHub-Actions-Minuten werden mit anderem Verbrauch geteilt; Workflow erst nach Konfiguration aktivieren.

## Optimierungen gegenüber dem ersten Stand

- **Kleinere App:** Die Temporal-Polyfill (≈150 kB) wurde durch eine kompakte `Intl`-Berechnung ersetzt (`src/lib/dates.ts`). Ein Test vergleicht sie für vier Zeitzonen über drei Jahre inkl. Sommerzeitwechsel mit der Polyfill als Referenz. Der Supabase-Client wird nur geladen, wenn beim Build Supabase-Variablen gesetzt sind, und dann erst bei Bedarf als eigener Chunk. Ergebnis: 147 kB → 104 kB gzip beim Start.
- **Sparsamere Synchronisierung:** Verschlüsselte Bilder wurden bisher bei *jeder* Synchronisierung erneut hochgeladen. Jetzt genügt eine Dateiliste; nur fehlende Bilder werden übertragen (fehlende Cloud-Dateien werden dabei auch wieder repariert). Das schont das Free-Tier-Kontingent.
- **Flüssiges Schreiben:** Die Vorbereitungsnotiz wird nach einer Tipppause (und beim Verlassen, Sperren oder Ausblenden der Seite) gespeichert statt den gesamten Tresor bei jedem Tastendruck neu zu verschlüsseln.
- **Content-Security-Policy auch auf GitHub Pages:** Da Pages `public/_headers` ignoriert, wird die CSP beim Produktionsbuild zusätzlich als `<meta>` eingefügt (`connect-src` nur für die konfigurierte Supabase-URL).
- **Sauberes Aufräumen:** Ersetzte Profilbilder und gelöschte Notizen bleiben nicht mehr verschlüsselt auf Gerät und Cloud liegen.

## Prüfung und Betrieb

```sh
npm test
npm run build
npm run test:e2e
```

Für Browserprüfungen: `npx playwright install chromium` oder vorhandenes Chromium über `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` verwenden. Die Tests verwenden erfundene Daten und keine echten Cloud-Zugangsdaten. Live-Supabase und Telegram benötigen eigene Konfiguration; ein lokaler erfolgreicher Test behauptet keine erfolgte Live-Zustellung.

Für statisches Hosting sind empfohlene Sicherheitsheader in `public/_headers` enthalten (Cloudflare Pages/Netlify). Andere Hosts müssen entsprechende Header setzen und SPA-Fallback konfigurieren. Keine externen Skripte, Tracker oder Schrift-CDNs erforderlich. Anwendungsschlüssel schützen gespeicherte und synchronisierte Daten, nicht ein bereits entsperrtes Gerät, kompromittierte Browser-Erweiterungen oder manipulierten Anwendungscode.

## Ganze Beträge, Euro und Hrywnja

- Neue Sitzungs- und Terminbeträge werden als ganze Euro bzw. Hrywnja eingegeben; Cent-Eingaben werden verständlich abgewiesen. Intern bleiben Geldwerte ganzzahlige Untereinheiten, damit Summen und Exporte keine Gleitkommafehler bekommen.
- Unter **Klienten → Profil bearbeiten → Zahlungswährung** kann unabhängig von der Sprache `EUR` oder `UAH` gewählt werden. Bei neuen ukrainischsprachigen Klienten wird UAH vorgeschlagen; bestehende Profile werden nicht automatisch in eine andere Währung umgestellt.
- Bei UAH-Sitzungen lässt sich der Betrag in Euro oder Hrywnja eingeben. Der Zielbetrag wird einmal auf die nächste ganze Einheit gerundet (ab einer halben Einheit aufwärts). Die App zeigt den Euro-Vergleich zusätzlich an.
- Der öffentliche EUR-Kurs der **Nationalbank der Ukraine (NBU)** wird bei Bedarf automatisch geladen. Kurs, Kursdatum und Quelle bleiben sichtbar; manuelle Korrektur und Nutzung eines gespeicherten Kurses sind möglich. Der Kurs selbst darf bis zu sechs Nachkommastellen enthalten. Der Aufruf an `bank.gov.ua` überträgt keinerlei Praxisdaten. Die CSP erlaubt ausschließlich diesen zusätzlichen öffentlichen API-Host.
- Vereinbarter Originalbetrag und verwendeter Kurs werden mit der Sitzung gespeichert. Spätere Tageskurse ändern diese Beträge nicht. Beim Erstellen einer UAH-Rechnung werden bisherige EUR-Sitzungen mit dem ausgewählten Kurs umgerechnet; bereits vereinbarte UAH-Beträge bleiben erhalten. Die tatsächlich ausgestellte Währung wird auch in die Zahlungsliste übernommen.
- Unter **Einstellungen → Praxisdaten** stehen zwei unabhängige Bankverbindungen für Deutschland/EUR und Ukraine/UAH zur Verfügung, jeweils mit Kontoinhaber, IBAN, Bank und optional BIC/SWIFT. Die zur Rechnungswährung passende Verbindung wird beim Ausstellen fest in die Rechnung kopiert.
- Auf einer UAH-Rechnung und ihrem PDF stehen **keine Euro-Vergleichswerte**. Diese sind ausschließlich in der App außerhalb des druckbaren Dokuments sichtbar. Sprache und Rechnungswährung sind voneinander unabhängig.
- Einnahmen-Diagramme und Gesamtsummen nutzen gerundete Euro-Vergleichswerte zum gespeicherten Vereinbarungskurs. Der CSV-Export enthält zusätzlich Originalbetrag, Originalwährung, Kurs, Kursdatum und Quelle. Tatsächliche Bankgebühren, Abweichungen beim Zahlungseingang und steuerlich vorgeschriebene Umrechnungsverfahren werden dadurch nicht automatisch gebucht.

### Bestehende Rechnungen und Centbeträge

Auf ausdrücklichen Benutzerwunsch werden vorhandene Centbeträge beim Öffnen des Tresors auf ganze Einheiten angepasst. Jede Rechnungsposition wird separat gerundet; die Rechnungssumme ist anschließend die Summe dieser Positionen. Beispiel: zwei Positionen à 85,50 werden jeweils 86 und ergeben 172. Das ändert bestehende Rechnungsbeträge; bereits an Klienten versendete PDFs werden selbstverständlich nicht nachträglich verändert.

Die ursprünglichen Sitzungsbeträge bleiben als `originalFeeCents` und die ursprünglichen Rechnungspositionen/Summen als `originalAmounts` **verschlüsselt** erhalten. Vor dem ersten Schreiben greift zusätzlich die vorhandene Versionssicherung. Die Migration ist wiederholbar, verändert keine bestehenden Währungen oder Bank-Snapshots und erfindet keine früheren Wechselkurse. Vor der Verwendung mit echten Bestandsdaten eine vollständige verschlüsselte Sicherung außerhalb des Browsers aufbewahren.

Die Cloud dieser Aufgabe blockiert den NBU-Host aktuell mit CONNECT 403. `bank.gov.ua` wurde als zusätzliche Domain im Konfigurationsentwurf gespeichert; ein gespeicherter Entwurf ist noch keine angewendete Netzwerkfreigabe. Der automatische Browserablauf und die Ausfallbehandlung werden mit kontrollierten NBU-Antworten getestet. Ein echter Live-Abruf aus dieser Cloud ist erst nach Anwendung der Freigabe prüfbar; die manuelle Kurseingabe steht unabhängig davon bereit.

## Empfehlungskarte und erste Kundengewinnung

- Druckbarer DE-/UA-Musterentwurf: [`public/empfehlungskarte-DE-UA.pdf`](public/empfehlungskarte-DE-UA.pdf), zwei Seiten, Endformat 85 × 55 mm plus jeweils 3 mm Beschnitt.
- Digitale Karten zum Weiterleiten über **WhatsApp und Telegram**, jeweils als einzelnes Hochformat-PNG mit 1080 × 1350 Pixeln: [Deutsch](public/empfehlungskarte-digital-de.png) und [Ukrainisch](public/empfehlungskarte-digital-uk.png).
- Visuelle Vorschau: [`public/empfehlungskarte-vorschau.png`](public/empfehlungskarte-vorschau.png).
- Bearbeitbare HTML-Vorlagen: [Druckkarte](design/empfehlungskarte.html) und [digitale Karten](design/empfehlungskarte-digital.html). Nach Anpassungen mit `node scripts/render-cards.mjs` PDF und PNGs neu erzeugen (verwendet das vorhandene Test-Chromium).
- Konkreter Vier-Wochen-Plan, Vorstellungsbeiträge und Empfehlungstexte in beiden Sprachen: [`docs/klientengewinnung.md`](docs/klientengewinnung.md).

Zum Teilen die gewünschte PNG-Datei auf dem Smartphone speichern und in WhatsApp oder Telegram als Bild anhängen. Als **Dokument/Datei** versenden, wenn die unveränderte Auflösung erhalten bleiben soll. Nach der Personalisierung den tatsächlichen Kontaktlink als Nachricht ergänzen; Text und Links innerhalb einer PNG-Datei sind nicht anklickbar.

Name, Kontakt, tatsächliche Qualifikationen, Beratungssprachen, Region und Foto sind noch Platzhalter. Die Karten werden erst nach Ergänzung dieser Angaben für die tatsächliche Verwendung freigegeben. Die visuelle Illustration ist ein Beispiel; die PDF-Datei enthält die exakt gesetzten Texte. Ein künftiger QR-Code verweist auf die öffentliche Kontakt-/Buchungsseite und niemals auf die private Verwaltungs-App.

## Klienten-Dokumente und ausfüllbare Fragebögen

Klientenprofile haben ein eigenes E-Mail-Feld. Unter **Fragebögen** lassen sich PHQ-9 und GAD-7 als echte ausfüllbare PDF auf Deutsch oder Ukrainisch erstellen; beide stehen danach unter **Dokumente** bereit. Dort können auch Aufgaben, Bilder und andere Unterlagen verschlüsselt hinterlegt werden. Original mit Versandhistorie und ausgefüllte Rückläufe mit Eingangsdatum stehen nebeneinander; frühere Rückläufe bleiben erhalten. PDFs werden lokal erzeugt, einschließlich der mitgelieferten Unicode-Schrift, und funktionieren nach der Offline-Installation auch ohne Internet.

Direkter E-Mail-Versand ist über eine authentifizierte Supabase Edge Function mit Resend-Adapter vorbereitet. Ohne Anbieter-Konfiguration bleibt er ausgeschaltet; es wird kein Versanddatum vorgetäuscht. Einrichtung, kostenlose Kontingente, notwendige Server-Secrets und der Unterschied zwischen verschlüsselter Ablage und gewöhnlicher E-Mail sind in [`docs/email-versand.md`](docs/email-versand.md) beschrieben. Es wurden keine echten E-Mails versendet.


## Rechnungsversand und schnelle Übersicht

Die vier Übersichtskacheln führen zu Klienten, anstehenden Terminen, den Zahlungseingängen des aktuellen Monats und allen offenen Sitzungen. Monatseingänge berücksichtigen das Zahlungsdatum, auch bei älteren Sitzungen; offene Beträge schließen frühere Jahre ein. Im Profil zeigt „Besprochen“ Datum, Uhrzeit, Notizen, Fotos und Hausaufgaben. Die Zahlungsdetails stehen im Profil unter „Finanzen“ sowie in der globalen Finanzansicht.

Rechnungen erhalten eine gestaltete Papieransicht und einen lokal erzeugten PDF-Export mit lateinischen und kyrillischen Schriften. Buttons für E-Mail und direkten Telegram-Bot-Versand öffnen einen bearbeitbaren Begleittext in der Sprache des Klienten. PDF-Fassungen und bestätigte Versandversuche bleiben verschlüsselt in der Dokumenthistorie. Einrichtung und technische Grenzen: [docs/rechnungsversand.md](docs/rechnungsversand.md). Für Live-Sendungen müssen die jeweiligen Anbieter verbunden sein; ohne Konfiguration bleiben Sendungen deaktiviert.

Die App setzt die Dokumentsprache und die Sprache von Texteingaben auf DE/UA. Eine Web-App kann die Bildschirmtastatur des Tablets nicht zwangsweise umstellen. Unter iPadOS zunächst **Einstellungen → Allgemein → Tastatur → Tastaturen → Tastatur hinzufügen → Ukrainisch** wählen, danach beim Schreiben mit der Globus-Taste umschalten.
