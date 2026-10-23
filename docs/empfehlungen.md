# Freiwilliges Empfehlungsprogramm

## Entscheidungen dieser Implementierung

Die vorhandene App speichert **keine lesbaren Klienten-, Sitzungs- oder Zahlungstabellen in Supabase**. Nach Rücksprache bleibt das so: Die Prämien werden im entsperrten Browser aus den vorhandenen Sitzungen berechnet. Es gibt deshalb bewusst **keine SQL-View mit Klartext-Umsätzen** und keine zweite Zahlungstabelle.

- Neue Personen nennen den Code freiwillig. Die Beraterin erfasst ihn **ausschließlich bei der Neuanlage** unter Klienten, mit dokumentierter Einwilligung. Keine öffentliche Buchungsseite.
- Klienten bekommen **keinen Login und keinen Gastzugang**. Die Beraterin erstellt eine persönliche PNG-Karte im Klientenprofil oder unter Marketing → Empfehlungen und verschickt sie selbst, z. B. als Bildanhang in WhatsApp, Signal oder Telegram. Es wird keine Nachricht automatisch gesendet.
- Standard: 10 % während zwölf Kalendermonaten **ab der ersten Zahlung**. Zahlungseingangsdatum entscheidet, nicht Sitzungsdatum. Ein erster Eingang am 1. Februar 2026 bedeutet: 1. Februar 2026 bis einschließlich 31. Januar 2027. Bei einem 29. Februar wird der Start plus zwölf Monate auf den letzten Februar-Tag geklemmt; der Tag davor ist der letzte berechtigte Tag.
- EUR und UAH bleiben getrennt, ohne Umrechnung zum Tageskurs. Verwendet wird der native Betrag der Sitzung, bei UAH also `billing.amountCents`. Die bisherige EURO-Vergleichszahl wird nicht als UAH-Prämienbasis verwendet.
- **Nur Prämien** haben Nachkommastellen: 10 % von 85 EUR sind 8,50 EUR. Rechnungen und Sitzungsbeträge behalten ihre bisherigen Regeln. Integer-Minor-Units und Basis-Punkte, kaufmännische Rundung einmal je Empfehlung/Währung auf den kumulativen Anspruch.
- Satz und Laufzeit lassen sich unter Empfehlungen → Programm-Einstellungen ändern. Jede Zuordnung speichert ihre eigenen Bedingungen; eine spätere Änderung wirkt nur für neue Zuordnungen.
- Eine Pause, Archivierung oder Reaktivierung des Klienten verlängert die Frist nicht. Die erste Zahlung bleibt gespeichert, auch wenn die Zahlung später zurückgenommen wird. Eine korrigierte frühere Zahlung kann den Start vorverlegen.

Die Einwilligung erläutert ausdrücklich, dass Prämienzahlungen indirekte Rückschlüsse auf bezahlte Leistungen ermöglichen können. Die App gibt Klienten keine Identitäten oder Einzeltermine anderer Personen. Eine absolute Zusage, dass prozentuale Zahlungen keinerlei Rückschlüsse erlauben, wäre falsch. Der gewünschte deutsche Kartentext ist wörtlich hinterlegt; die ukrainische Fassung ist natürlich übersetzt. Die Programmerklärung berücksichtigt die oben vereinbarten Änderungen.

## 1. SQL-Migration ausführen

1. Vorab eine aktuelle **verschlüsselte Sicherung** des Tresors herunterladen.
2. Falls Supabase noch nicht eingerichtet ist, zuerst die vorhandene Anleitung im README und `supabase/schema.sql` verwenden.
3. Im **SQL Editor des eigenen Supabase-Projekts** den gesamten Inhalt von [`../supabase/migrations/20261023_referral_codes.sql`](../supabase/migrations/20261023_referral_codes.sql) ausführen. Die Migration ist wiederholbar und verändert keine bestehenden Tabellen.
4. Die neue Tabelle `referral_code_registry` benötigt keine Realtime-Publikation und keinen öffentlichen Storage-Bucket. Sie enthält nur Reservierungs-ID, Praxis-Owner, Tresor-UUID, SHA-256 eines zufälligen Klienten-Identifikators, öffentlichen Code und Reservierungs-/Widerrufszeitpunkt. **Keine Klarnamen, Termine, Beziehungen oder Beträge.**
5. RLS erlaubt dem bestehenden Praxis-Account nur seine eigenen Reservierungen. `anon` hat weder Tabellen- noch RPC-Zugriff. Es existieren keine Klienten-Accounts und keine Möglichkeit, über einen Code den Tresor zu öffnen.
6. Neue Codes entstehen ausschließlich über `issue_referral_code`. Serverseitige Zufallswerte, `UNIQUE`-Constraints und Transaktionssperre sorgen auch bei gleichzeitigen Geräten für eine eindeutige, idempotente Reservierung pro Praxis/Tresor/Subjekt. Funktions-`search_path` ist leer, Aufrufe prüfen `auth.uid()` und die bestehende verschlüsselte Tresorzuordnung. Direkte Schreibrechte für Browser sind entzogen.

## 2. Dateien / Frontend

Bei Arbeit mit Git den gesamten Stand aktualisieren; nicht einzelne generierte Dateien aus `dist/` mischen. Es sind **keine zusätzlichen NPM-Pakete, Dienste oder Modelle** nötig.

| Datei | Aufgabe |
| --- | --- |
| `src/components/Referrals.tsx` | Codes und PNG-Karten, pseudonyme Abrechnung, Filter, Auszahlungsdialog, Einstellungen |
| `src/lib/referrals.ts` | Einwilligung/Zuordnung, Frist, Finanzberechnung, Quartalsbuchung/Gegenbuchung, geschützter Klientenexport |
| `src/lib/referralCodes.ts` | Schmaler Auth-RPC-Client; sendet keine Namen oder Finanzdaten |
| `src/lib/referralCard.ts` | Lokale Canvas-PNG-Erzeugung mit Systemschriften einschließlich Kyrillisch |
| `src/referrals.css` | Responsive Listen und Abrechnungsbereiche, vorhandene Hell-/Dunkel-Farben |
| `src/lib/types.ts` | Abwärtskompatible leere Collections `referralCodes`, `referrals`, `referralPayouts`, Settings |
| `src/lib/crdt.ts`, `merge.ts` | Atomare, verschlüsselte Vertrags-/Buchungsregister; konkurrierende Alternativen erhalten |
| `src/lib/useVault.ts`, `records.ts`, `src/workers/secure.worker.ts` | Erste Zahlung beim Öffnen/Schreiben dauerhaft merken, Sicherung/Verlauf, Löschung |
| `src/components/forms.tsx` | Optionaler Code und Einwilligung bei Neuanlage |
| `src/components/client-profile.tsx` | Direkter Zugang zur Empfehlungskarte |
| `src/lib/navigation.tsx`, `src/App.tsx` | Erweiterbarer Marketing-Menüeintrag und Route |
| `src/components/SyncConflicts.tsx` | Neue Datensätze korrekt im Konfliktdialog darstellen |
| `src/lib/clientExport.ts` | Eigene Empfehlungsdaten ohne fremde Identifikatoren im lesbaren Export |
| `src/locales/de.json`, `uk.json` | Alle Texte, identische Schlüssel |

Alle Beziehungen, Einwilligungen, Finanzinformationen und Buchungen liegen in den normalen AES-GCM-Tresorpayloads. Sicherungsdateien, In-App-Snapshots und Cloud-Tresor-Sync schließen sie dadurch ein. Das Format bleibt `schema: 1`; alte Sicherungen erhalten leere Listen. Es werden weder Klartextdaten in Web Storage noch neue unverschlüsselte IndexedDB-Stores angelegt. Die heruntergeladene Karte enthält nur den öffentlichen Code, den Praxisnamen und den Erklärungstext. Die temporäre PNG-Blob-URL wird beim Schließen oder Sperren freigegeben.

### Ablauf in der Praxis

1. Mit dem **Praxiskonto** in der Cloud anmelden und den Tresor einmal synchronisieren. Ohne bereits zugeordneten Cloud-Tresor verweigert die RPC die Code-Ausgabe.
2. Mit dem bisherigen Klienten die freiwillige Teilnahme vereinbaren. Sein Profil öffnen → **Empfehlungskarte**, Teilnahme bestätigen → **Code erstellen**.
3. Die Kartensprache wird zunächst aus der Klientensprache übernommen und kann unabhängig von der App-Sprache gewechselt werden. **Karte als PNG herunterladen**, dann selbst als Bild versenden. Der Code ist kein Zugangslink.
4. Bei Erstaufnahme der neuen Person optional den Code eintragen → **Code prüfen**, den Einwilligungstext in ihrer Sprache erläutern, ausdrückliche Zustimmung dokumentieren und speichern. Selbstempfehlung und doppelte Zuordnung werden verhindert. Kein Code oder keine Zustimmung: keine Teilnahme; ohne Code kann normal gespeichert werden.
5. Auf dem anderen Gerät erstellte Codes sind erst nach Tresor-Synchronisation lokal verfügbar. Die Prüfung kennt nur die eigene Praxis. Ein deaktivierter Code kann nach erfolgtem Abgleich nicht mehr neu zugeordnet werden; bestehende Zuordnungen behalten ihre Bedingungen. Aus Sicherheitsgründen wird ein deaktivierter Code nicht wieder ausgegeben.
6. Sitzungen und Zahlungen wie bisher erfassen. Ab erster Zahlung beginnt die Frist automatisch. Marketing- und Terminerinnerungs-Freigaben werden davon nicht verändert.

## 3. Abrechnung und Auszahlungen

Empfehlungen → **Abrechnung** zeigt ausschließlich IDs: Werbender, geworbene Person, Erstaufnahme, erste Zahlung, Frist-Ende, Status, bezahlter Umsatz, Satz/Prämie, ausgezahlt und offen. Filter nach Status, Währung und Werbendem. Die aktuelle Übersicht zählt nur Zahlungseingänge bis heute und innerhalb der Frist; unbezahlte oder stornierte Sitzungen zählen nicht. Große Listen werden in Schritten von 30 angezeigt.

Die Quartalsabrechnung nutzt das **letzte vollständig abgeschlossene Kalenderquartal** und berücksichtigt ältere offene Ansprüche. Beispiel: Am 23. Oktober ist die Abrechnung bis einschließlich 30. September möglich. Aktuelle Oktober-Einnahmen stehen in der Übersicht, noch nicht im auszahlbaren Quartalsbetrag.

**Auszahlung verbuchen** erfasst ausschließlich eine tatsächlich bereits erfolgte Zahlung, nach ausdrücklicher Bestätigung, mit Datum und Währung. Es findet **keine Banküberweisung** statt. Pro Werbendem/Währung/abgeschlossenem Quartal gibt es nur eine kumulative Abrechnung. Die deterministische Buchungs-ID verhindert doppelte Ledger-Zeilen bei parallelen Offline-Einträgen; abweichende gleichzeitige Einträge bleiben als Konflikt sichtbar und sperren weitere Buchungen. Sie ersetzt keine Abstimmung realer Banktransaktionen.

Fehlerhafte Buchungen werden mit **Buchung korrigieren** gegengebucht. Der ursprüngliche Eintrag bleibt erhalten; ein identischer Quartalslauf wird dadurch nicht erneut geöffnet. Ein korrigierter/verspäteter Zahlungseingang fließt in eine folgende Quartalsabrechnung ein. Rücknahmen von Sitzungszahlungen und Rechnungsstornos verringern den Anspruch. Überzahlungen erscheinen negativ und werden mit künftigen Ansprüchen in derselben Währung verrechnet. Kein automatischer Rückeinzug.

Die In-App-Wiederherstellung älterer Verlaufsstände behält bereits bekannte Auszahlungen und Gegenbuchungen bei.

Vor der Abrechnung **alle verwendeten Geräte synchronisieren und Konflikte lösen**. Keine lokale App kann von noch nicht übertragenen Änderungen eines anderen ausgeschalteten Geräts wissen. Bei Ersatz des Tresors durch eine alte Sicherung fehlen möglicherweise spätere reale Auszahlungen: zuerst mit dem aktuellen Tresor abgleichen und Bankbelege prüfen. Das System führt keine serverseitige Klartext-Gegenrechnung.

Beim endgültigen Löschen eines Klienten werden seine Codes und Empfehlungsbeziehungen entfernt und aus Konfliktmetadaten getilgt. Auszahlungen an einen **anderen, nicht gelöschten Werbenden** behalten ihre Summen als Beleg, jedoch ohne Zuordnung zur gelöschten Empfehlung. Der eigene Klientenexport enthält keine Identitäten/IDs, Termine oder Zuordnungen anderer Klienten und keine internen Prämien-Allokations-IDs.

## 4. GitHub Pages veröffentlichen

1. Lokal/Cloud: `npm ci`, dann `npm test` und `npm run build`.
2. In GitHub unter **Settings → Secrets and variables → Actions → Variables** wie bisher `VITE_SUPABASE_URL` und den öffentlichen `VITE_SUPABASE_ANON_KEY` setzen. **Kein service_role-Key**, keine Tresorschlüssel. Die neue Funktion benötigt keine weiteren Variablen.
3. Alle Quelldateien einschließlich SQL und Dokumentation committen und nach `main` pushen. Der vorhandene Workflow **Publish Praxisraum** baut mit `VITE_BASE_PATH=/Psychologie/`, testet und veröffentlicht Pages. Keine manuellen Änderungen an `gh-pages` nötig.
4. Deployment unter Actions prüfen, anschließend https://nicoahb.github.io/Psychologie/ öffnen. In der installierten PWA gegebenenfalls **Jetzt aktualisieren** verwenden.
5. Erst dann einen Testcode im eigenen Test-Tresor erzeugen. Die Migration wird vom Pages-Workflow **nicht** automatisch im Supabase-Projekt ausgeführt.

## 5. Testliste / Übergabe an Claude

Automatisiert:

```sh
npm test
npm run build
npx playwright test tests/browser/referrals.spec.ts --workers=1
npm run test:ipad -- --project=ipad-webkit
npm run test:ipad -- --project=iphone-webkit
```

- `tests/referrals-database.test.ts`: wiederholbare Migration, RLS zwischen zwei Praxis-Accounts, verweigerter anonymer Zugriff/direkte Schreibrechte, Eingaben, eindeutige serverseitige Ausgabe, idempotente Reservierung und Widerruf. Lokales PostgreSQL über die bereits vorhandene PGlite-Testabhängigkeit, keine Produktivdatenbank.
- `tests/referrals.test.ts`: Einwilligung und Zuordnung, Altdaten, erste Zahlung und Monatsgrenzen, EUR/UAH, unbezahlte/stornierte/zukünftige Zahlungen, Rundung, Quartal und Gegenbuchung, konkurrierende Offline-Buchungen, Merge, Löschung, verschlüsselter Round-Trip und datensparsamer Export.
- `tests/browser/referrals.spec.ts`: freiwillige Neuanlage, ungültiger Code/fehlende Zustimmung, PNG-Download mit echter PNG-Signatur, DE/UA, Sperren und Neuladen, Abrechnung/Gegenbuchung, neue Einstellungen ohne Änderung alter Verträge sowie axe in Hell/Dunkel und Tablet-/Smartphone-Layout. Eingeschlossen im bestehenden iPad-/iPhone-WebKit-Workflow.

Manuell nach Einrichtung im eigenen **Testprojekt**:

- Migration zweimal ausführen, als Praxiskonto anmelden, initial synchronisieren. Code erstellen, auf zweitem Gerät synchronisieren und dieselbe Karte prüfen.
- Versuchen, mit einem zweiten Praxis-Account auf die Reservierung zuzugreifen: keine fremden Zeilen. Ohne Auth kein Code-RPC-Aufruf.
- Karte mit ukrainischem Text auf iPad/iPhone herunterladen, als Datei in den gewünschten Messenger anhängen. Keine automatisch versandten Testnachrichten.
- Neue Person ohne Code sowie mit Code, mit/ohne Einwilligung anlegen. Bezahlte EUR-/UAH-Sitzungen, Datum unmittelbar vor/an/nach dem Frist-Ende prüfen.
- Auszahlen, erneut versuchen, Fehlbuchung korrigieren; Bankbelege mit Ledger abstimmen.
- Verschlüsseltes Backup herunterladen und in einem Testbrowser importieren. Niemals zur Probe den einzigen echten Tresor ersetzen.
- Lesbaren Export eines Werbenden kontrollieren: keinerlei andere Klienten-IDs, Namen, einzelne Termine oder Allokations-IDs. Klient endgültig löschen, mit altem Testgerät abgleichen, Beziehungen bleiben gelöscht.

Keine tatsächliche Supabase-Migration oder echte Bank-/Nachrichtenaktion wird durch die Tests ausgeführt. Technische Schutzmaßnahmen sind keine pauschale rechtliche Zertifizierung des Prämienmodells.

Lokaler Prüfstand vom 23. Oktober 2026: **235 Unit-/SQL-Tests bestanden**, Produktionsbuild erfolgreich; **24 kombinierte Browserprüfungen** für Empfehlungen, bestehende Barrierefreiheit/Sprach-Memos und Löschung bestanden. Nach den letzten Schutzergänzungen zusätzlich Empfehlungen plus Backup/Verlauf: **13 bestanden, 1 vorhandener Datei-API-Test auf Mobilgeräten erwartungsgemäß übersprungen**. Die acht neuen Empfehlungstests sind in beiden Chromium-Projekten grün. WebKit wird im vorhandenen separaten iPad-/iPhone-CI-Workflow geprüft.

Entsperr-Start: Tresore ohne Empfehlungen laden im vorhandenen lokalen Worker kein zusätzliches Empfehlungsmodul und führen keine Empfehlungsberechnungen aus. Der gemeinsame Browser-Test wartet begrenzt bis zu 15 Sekunden auf Schlüsselableitung und erste verschlüsselte Migration; ein echter Fehler liefert zusätzlich die sichtbaren Fehlermeldungen der synthetischen Testdaten. Nach dieser Ergänzung sind die beiden isolierten Dokument-/Newsletter-Transporttests zusammen mit allen neuen Empfehlungstests lokal grün (10 bestanden, 2 ausschließlich mobile Transport-Duplikate planmäßig übersprungen). Zusätzlich sind beide Safari-CI-Geräte mit jeweils 14 bestandenen Tests und 3 erwarteten Überspringungen geprüft.

Vollständige Freigabeprüfung des Funktionsstands `f7a51d7312bba593b06603e9e4b017f5b963cf5f`: [GitHub Build and test](https://github.com/NicoAHB/Psychologie/actions/runs/40013407626) erfolgreich, **235 Unit-/SQL-Tests und 128 Chromium-Browsertests bestanden**, 20 bestehende Fälle planmäßig übersprungen. [Safari-CI](https://github.com/NicoAHB/Psychologie/actions/runs/40013407619) erfolgreich: iPad und iPhone jeweils **14 bestanden, 3 erwartete Überspringungen**. Zusätzlich **6 lokale Prüfungen des Pages-Unterpfads** einschließlich Offline-Neuladen, ukrainischer PDF und verschlüsselter Memo-Wiedergabe bestanden. Danach wurden ausschließlich diese Prüfbelege in der Dokumentation ergänzt.
