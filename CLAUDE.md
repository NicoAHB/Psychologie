# Praxisraum: Einstieg für Claude

Bitte zuerst `README.md`, `HANDOFF.md` und `docs/lokale-werkzeuge-und-video.md` lesen.

Die Änderungen vom 23. Oktober 2026 sind ausführlich dokumentiert in
**`docs/claude-uebergabe-2026-10-23.md`**. Dort stehen Datenmodell, Entwurfssicherung,
Begleitungsstatus mit Wiederaufnahme, Aufgaben, Sicherungsprüfung, Memo-Favoriten,
verschlüsselte Dokumentfreigaben und die erforderliche Supabase-Migration.

Der echte iPad-Gerätetest ist als `docs/ipad-abnahme.md` vorbereitet. Tests laufen mit
`npm test`, `npm run build`, `npm run test:e2e` sowie `npm run test:ipad` nach Installation
des WebKit-Testbrowsers. Ergebnisse und Grenzen in `HANDOFF.md` nachlesen.

Strikte TypeScript-Typen, gleiche Schlüssel in `de.json`/`uk.json`, verschlüsselte
Ablage vor jedem Speichern/Synchronisieren und bestehende Lösch-/Merge-Regeln erhalten.
Keine KI, Transkription, Spracherkennung, Modelle oder Audio-Netzwerkdienste ergänzen.

## Integrierte Darstellung

Pastellverläufe und manuell einstellbare Milchglasflächen sind in der echten App unter **Einstellungen → Darstellung** integriert. Details: [`docs/darstellung.md`](docs/darstellung.md). Dateien: `src/lib/appearance.ts`, `src/lib/theme.tsx`, `public/theme-init.js`, `src/components/AppearanceCard.tsx`, `src/appearance.css`. Bootstrap und TypeScript müssen dieselben sicheren Grenzen/Standardwerte verwenden; der Unit-Test prüft das. Präferenzen sind ausschließlich gerätelokal und enthalten keine Praxisdaten. Keine Vault-/SQL-Migration. Text bleibt deckend, maximale Transparenz 30 %, eigene Farben bleiben Pastell; vollständige axe-Prüfung nach Farbänderungen wiederholen. Das HTML/CSS in `examples/` ist weiterhin nur ein eigenständiges Zusatzbeispiel.

## Neue Marketing-Module

Technische und fachliche Übergabe: [`docs/marketing.md`](docs/marketing.md). Einstieg: `src/lib/navigation.tsx`, `Newsletter.tsx`, `TemplateManager.tsx`, `MarketingCampaigns.tsx`. Datenmodell, Merge, Blob-Referenzen, Sicherungen, Klientenexport und Consent-Widerruf sind integriert. Optionale Migration `supabase/marketing.sql` und Edge Function `send-marketing` sind vorbereitet, jedoch nicht in einem echten Supabase-Projekt eingerichtet. Kampagnen laufen ausschließlich bei geöffnetem, entsperrtem Tresor. Keine Geburtstagslisten oder Tresorschlüssel auf den Server hochladen. Keine echten Nachrichten in Tests senden. Status „unklar“ niemals automatisch erneut versuchen. Das Empfehlungsprogramm ist inzwischen separat implementiert; siehe unten.

Kanal-Ergänzung: `MarketingChannelSelection` unterstützt `email`, `telegram`, `both`, `none`; ein einzelner Versandbeleg bleibt immer `email` oder `telegram`. Die Klienten-Freigaben bleiben zwei unabhängige Datensätze. Versand bildet stets die Schnittmenge aus Kampagnenauswahl und Klientenfreigabe. Empfängerzahlen zählen Klienten, Versandbelege zählen Nachrichten. Altdaten-IDs ohne Kanal-Suffix müssen über `marketingRecipientId` weiterverwendet werden. Die wiederholbare Marketing-Migration aktualisiert auch bereits eingerichtete Kanal-Constraints.

## Neues Empfehlungsprogramm

Vollständige fachliche/technische Übergabe: [docs/empfehlungen.md](docs/empfehlungen.md). Kein Klienten-Login und keine öffentliche Buchungsseite: persönliche, lokal erzeugte PNG-Karte; freiwilliger Code bei Klienten-Neuanlage mit Einwilligungsnachweis. SQL reserviert nur eindeutige Codes, niemals Zahlungsdaten oder Zuordnungen. Die Prämienberechnung bleibt im entsperrten Browser. Standard 10 % für zwölf Monate ab erster Zahlung, Zahlungsdatum zählt, EUR und UAH strikt getrennt. Nur Prämien haben Nachkommastellen; Rechnungen unverändert. Pro Zuordnung gespeicherte Bedingungen, deterministische Quartalsbuchungs-IDs, Gegenbuchungen statt stiller Änderungen, Sperre bei Finanz-/Empfehlungskonflikten. Neue verschlüsselte Collections in Types/CRDT/Merge/Restore/Export/Löschung berücksichtigt. Keine fremden Klienten- oder Allokations-IDs im individuellen Datenexport. Neue Codes erst nach `supabase/migrations/20261023_referral_codes.sql`, Praxis-Auth und initialem Tresor-Sync möglich. Keine zusätzlichen NPM-Pakete. Nicht gegen einen produktiven Supabase-Tresor testen und keine echten Nachrichten/Überweisungen auslösen.
