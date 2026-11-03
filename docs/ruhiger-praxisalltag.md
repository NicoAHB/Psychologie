# Ruhiger Praxisalltag – Version 0.3.0

## Was sich bei der Bedienung ändert

1. **Heute** beginnt mit dem nächsten geplanten oder gerade laufenden Termin. Es folgen höchstens drei wichtige Aufgaben und eine kompakte Zahlungsübersicht. Ein freier Termin für die Warteliste belegt bei Bedarf einen dieser drei Plätze. Weitere Termine, vollständige Aufgaben, Rückläufe, Klienten und die Einrichtung lassen sich aufklappen. Überfällige Rechnungen stehen weiterhin bei Zahlungen. Alle bisherigen Funktionen bleiben erreichbar.
2. **Klientenprofil:** Die Vorbereitung steht im Überblick vor den Kennzahlen. Häufige Aktionen bleiben direkt sichtbar; Export, Empfehlungskarte und Video stehen unter **Weitere Aktionen**. Der **Gesprächsmodus** zeigt Vorbereitung, bestehende Terminnotizen und Sprach-Memos ohne Navigation und Zahlungsanzeigen. Er ist eine vorübergehende Ansicht, kein neues Datenformat. Ein gut sichtbarer Knopf beendet ihn. Sperren beendet auch diesen Modus.
3. **Einstellungen:** Vier Bereiche gliedern die Werkzeuge: Praxis & Bankdaten, Termine & Nachrichten, Darstellung sowie Sicherung & Sicherheit. Die Suche durchsucht alle Bereiche. **Alle Bereiche** zeigt die bisherige Gesamtansicht. Direkte Links aus Anleitung und Einrichtung öffnen automatisch die richtige Gruppe und fokussieren das ursprüngliche Ziel. Eingaben in ausgeblendeten Karten bleiben erhalten.
4. **Zahlungen:** EUR und UAH stehen getrennt nebeneinander, auch im Klientenprofil. Die Schnellfilter zeigen Offen, Überfällig, diesen oder letzten Monat. Monatsfilter verwenden das Zahlungsdatum, auch für Termine aus früheren Jahren. Diagramm und gewählter Monat bleiben auch beim Wechsel von Januar zu Dezember im Vorjahr zusammen. Der **Euro-Vergleich** bleibt ausdrücklich als Vergleich erhalten. Das Diagramm lässt EUR, UAH oder diesen Vergleich auswählen. Rechnungen, Steuerauswertung und gespeicherte Kurse werden nicht verändert.
5. **Speicherstatus:** Ausstehende Eingaben, laufendes verschlüsseltes Speichern und erfolgreich bestätigte Speicherung sind getrennte Zustände. Ein früherer Schreibvorgang kann eine inzwischen neu eingegebene Änderung nicht als gespeichert bestätigen. Ein Klick auf den Status unten zeigt getrennt den lokalen Stand, den letzten bestätigten Cloud-Abgleich und die letzte externe Sicherung.

## Technische Übergabe für Claude

- `dailyOverview.ts` und `paymentOverview.ts` leiten Ansichten aus den bestehenden Daten ab. `financeRows` kennt zusätzlich den vorherigen Monat und die Ansicht für überfällige Zahlungen. Die tatsächliche Überfälligkeit kommt weiterhin aus `overdueInvoices`, nicht allein aus dem Alter eines Termins.
- Die Finanzansichten verwenden gespeicherte `billing.amountCents`/`billing.currency` für native Währungen; `feeCents` bleibt der bestehende Euro-Vergleich. Keine Neuberechnung von Rechnungen, Wechselkursen, Steuern oder Empfehlungsprämien.
- `settingsIndex.ts` ist der gemeinsame Katalog für Gruppen, Suche und direkte Ziele. Suchbegriffe und sichtbare Texte liegen in beiden Sprachdateien. Die vorhandenen `settings-*`-IDs bleiben bestehen. Einstellungen bleiben lokal in der jeweiligen Karte editierbar; Gruppenwechsel speichert keine Formulare automatisch ab.
- `VaultTextEditor` ist der gemeinsame Editor für Vorbereitung, Gesprächsmodus und private Videonotizen. Er bündelt die 700-ms-Schreibpause, bestätigt erst `vault.update`, hält während eines Schreibens neu eingegebene Texte ausstehend und versucht bei Fehlern erneut zu speichern. Er schreibt ausschließlich über die vorhandene verschlüsselte Warteschlange. Vor dem Sperren wird die Schreibpause geleert (`registerBeforeLock`). Auch Wechsel des Notizziels und Verlassen der Ansicht leeren sie.
- `editStatus.ts` speichert ausschließlich flüchtige UI-Metadaten: Phase und Zeit, keine Notizen, Klienten-IDs oder Schlüssel. Manuelle Speichern-Buttons behalten ihr bisheriges Verhalten. Von `useSaveStatus` erfasste ausstehende Änderungen sowie Termin- und Newsletter-Entwürfe fließen in die globale Statusanzeige ein. Ein Browser-Schließen erhält bei ausstehenden Änderungen den vorhandenen Browser-Warnmechanismus. Updates warten auf automatische Entwürfe und werden bei den so erfassten ungespeicherten Formularen zurückgehalten. Manuelle Formulare müssen weiterhin gespeichert oder bewusst geschlossen werden.
- `useVault.savedAt` wird erst nach erfolgreicher dauerhafter Speicherung gesetzt, niemals aus dem optimistischen React-Zustand. Nach erneutem Öffnen eines unveränderten Tresors ist kein neuer Schreibzeitpunkt erfunden: Dann steht dort nur, dass der vorhandene Stand lokal gespeichert ist. Die Demo bestätigt keine dauerhafte Speicherung.
- Zusätzliche IndexedDB-Metadaten: `external-backup:<vault>` und `cloud-sync:<vault>:<account>`, jeweils Zeitpunkt, Sicherungsart und bereits verwendeter Fingerabdruck des verschlüsselten Standes. Keine neuen Klartext-Praxisdaten. Cloud-Erfolg überschreibt das Datum der externen Sicherung nicht mehr. Alte Sicherungsmetadaten ohne getrennten externen Nachweis werden konservativ behandelt. Unterschiedliche Cloud-Konten erhalten getrennte Nachweise. Frühere Stände werden als solche bezeichnet.
- Gesprächsmodus: Zustand in `App.tsx`, weitergereicht über `ClientsPage`. Keine separate Route, keine Speicherung der Ansicht. Beim Einstieg liegt der Tastaturfokus auf dem Ausgang, beim Verlassen wieder auf dem Einstieg. Sprachwechsel, Darstellung und Sperren bleiben nutzbar. Neue Termine werden in der vollständigen Ansicht angelegt; der Gesprächsmodus editiert vorhandene Notizen.
- `calm-dashboard.css` ergänzt die vorhandenen Farben und Darstellungsregler. Er respektiert Hell/Dunkel, große Schrift und Touch-Bedienung. `[hidden]` wird für die neue Navigation ausdrücklich beachtet.

## Grenzen und Inbetriebnahme

Keine neue Abhängigkeit, kein neuer Dienst, keine SQL-Migration und keine Änderung des Tresorformats. Vorhandene Sicherungen und Synchronisation bleiben kompatibel. Das ist keine rechtliche oder datenschutzrechtliche Prüfung.

Die Statusanzeige kann nur bestätigen, was die App erfolgreich abgeschlossen hat. Ein Download bestätigt keine spätere physische Unversehrtheit einer Datei. Die bestehende Sicherungsprüfung und der Nachweis einer Wiederherstellung bleiben eigene Schritte. Die externe Sicherungszeit bezieht sich auf die zuletzt exportierte Kopie, nicht auf die interne Verlaufshistorie. Ein geschlossener Browser bietet weiterhin keine verlässliche Garantie für noch nicht abgeschlossene Schreibvorgänge.

Nach dem Deployment den Hinweis **Jetzt aktualisieren** verwenden. Die App zeigt **0.3.0** unter Einstellungen → Sicherung & Sicherheit → Weitere Werkzeuge → Version. Alternativ nach „Version“ suchen.

## Prüfung

- Unit-Tests prüfen getrennte Währungen, Jahreswechsel beim Monatsfilter, Aufgabenprioritäten, gruppenübergreifende DE/UA-Suche, Änderungen während des Speicherns sowie getrennte Sicherungs-/Cloud-Nachweise.
- Browser-Tests prüfen kompakte Standardansichten, Aufklappen per Tastatur, Filter, direkte Einstellungslinks, private Notizen mit sofortigem Sperren und erneutem Öffnen sowie Rückkehr aus dem Gesprächsmodus.
- axe und Layoutprüfungen decken die neuen Ansichten und den Speicherdialog bei 390 und 820 px, großer Schrift, Deutsch/Ukrainisch sowie Hell/Dunkel ab. Safari-Profile ergänzen diese in CI; sie ersetzen keinen Test auf einem echten iPad.
- Bestehende Ende-zu-Ende-Tests verwenden bei umfangreichen Einstellungsabläufen ausdrücklich **Alle Bereiche**. Die neue Testsuite prüft zusätzlich die tatsächlich gegliederte Standardansicht.

Lokal sind alle 331 Unit-Tests und der Build erfolgreich. Der vollständige Browserbestand wurde durchlaufen; nach Anpassung der umgeordneten Bedienwege wurden die betroffenen Fälle erneut geprüft. Die neuen Ansichten, Kontrast bei maximaler Transparenz und Sperren/Wiederöffnen sind grün. Die isolierten Tests für Video, geschützte Dokumentlinks, Marketingversand mit fiktivem Backend, Fehlerwiederherstellung, Sync-Snapshots und sichere Updates sind ebenfalls erfolgreich. Die GitHub-Workflows führen nach dem Push zusätzlich den vollständigen Browserlauf und beide Safari-Profile aus.

## Geänderte Dateien

- `HANDOFF.md`
- `README.md`
- `docs/ruhiger-praxisalltag.md`
- `package-lock.json`
- `package.json`
- `playwright.ipad.config.ts`
- `src/App.tsx`
- `src/calm-dashboard.css`
- `src/components/CurrencyTotals.tsx`
- `src/components/IncomeChart.tsx`
- `src/components/Newsletter.tsx`
- `src/components/StorageStatus.tsx`
- `src/components/VaultTextEditor.tsx`
- `src/components/VideoConsultation.tsx`
- `src/components/Waitlist.tsx`
- `src/components/client-profile.tsx`
- `src/components/forms.tsx`
- `src/components/money.tsx`
- `src/lib/backupState.ts`
- `src/lib/buildInfo.ts`
- `src/lib/dailyOverview.ts`
- `src/lib/editStatus.ts`
- `src/lib/finance.ts`
- `src/lib/paymentOverview.ts`
- `src/lib/settingsIndex.ts`
- `src/lib/useNewsletterDraft.ts`
- `src/lib/useSaveStatus.ts`
- `src/lib/useSessionDraft.ts`
- `src/lib/useVault.ts`
- `src/locales/de.json`
- `src/locales/uk.json`
- `src/pages/ClientsPage.tsx`
- `src/pages/FinancesPage.tsx`
- `src/pages/SettingsPage.tsx`
- `src/pages/TodayPage.tsx`
- `tests/browser/a11y.spec.ts`
- `tests/browser/app.spec.ts`
- `tests/browser/calm-dashboard.spec.ts`
- `tests/browser/currency.spec.ts`
- `tests/browser/email-setup-connected.spec.ts`
- `tests/browser/email-setup.spec.ts`
- `tests/browser/guide.spec.ts`
- `tests/browser/improvements.spec.ts`
- `tests/browser/practice-overview.spec.ts`
- `tests/browser/practice-updates.spec.ts`
- `tests/browser/practice-workflow.spec.ts`
- `tests/browser/release-safety.spec.ts`
- `tests/browser/simple-workflow.spec.ts`
- `tests/browser/vault-safety.spec.ts`
- `tests/browser/workflow-fixture.ts`
- `tests/browser/workflow.spec.ts`
- `tests/calm-dashboard.test.ts`
