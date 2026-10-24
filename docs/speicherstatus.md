# Speicherbuttons mit Uhrzeit

In den dauerhaft geöffneten Formularen für Praxis-/Bankdaten, das Standard-Ausfallhonorar und die Einstellungen des Empfehlungsprogramms gilt:

- Beim Schreiben ist der Button vorübergehend gesperrt und zeigt „Wird verschlüsselt …“.
- Erst nach erfolgreichem Abschluss der verschlüsselten lokalen Speicherung wird er grau und zeigt „Gespeichert um HH:mm“ (Gerätezeit). Auf Ukrainisch: „Збережено о HH:mm“.
- Jede Änderung aktiviert „Speichern“ wieder; auch ein neuer Wechselkurs zählt als Änderung. Eine Änderung während eines noch laufenden Schreibvorgangs bleibt anschließend ungespeichert. Der nächste Klick speichert diese Eingabe.
- Bei einem Speicherfehler erscheint kein Erfolgszeitpunkt. Der Button erlaubt einen erneuten Versuch und die vorhandene Fehlermeldung bleibt verfügbar.
- Status und Uhrzeit gelten nur für das aktuell geöffnete Formular. Sie werden nicht als zusätzliche Praxisdaten gespeichert. Nach erneutem Öffnen kann wieder gespeichert werden.

Formulardialoge, die sich bereits nach erfolgreichem Speichern schließen, behalten diesen Ablauf. Automatisch gespeicherte Felder behalten die automatische Speicherung.

## Technische Übergabe

`src/lib/useSaveStatus.ts` enthält einen gemeinsamen, ausschließlich im Arbeitsspeicher gehaltenen Status mit Änderungszähler und Schutz vor mehrfachen gleichzeitigen Schreibaufträgen. `useSyncExternalStore` verbindet ihn mit React. Der Abschluss des von `vault.update` zurückgegebenen Promise bestätigt die Speicherung; optimistisch aktualisierte Tresordaten allein reichen dafür nicht aus.

`src/components/SaveButton.tsx` verwendet die vorhandenen Sprachwörterbücher, native deaktivierte Buttons und einen höflich angekündigten Statusbereich für Screenreader. Die grauen Farben in `src/appearance.css` erhalten lesbaren Kontrast in beiden Farbschemata. Das Datenmodell sowie Verschlüsselung, Sicherungen und Synchronisation sind unverändert. Keine neuen Pakete oder Netzwerkdienste.

Geänderte/neue Dateien: `src/lib/useSaveStatus.ts`, `src/components/SaveButton.tsx`, `src/pages/SettingsPage.tsx`, `src/components/Referrals.tsx`, `src/appearance.css`, beide `src/locales/*.json`, `tests/save-status.test.ts`, `tests/browser/save-button.spec.ts`, `tests/browser/referrals.spec.ts`, `tests/browser/invoice.spec.ts`, `tests/browser/currency.spec.ts`, `playwright.ipad.config.ts`, diese Dokumentation und `HANDOFF.md`.

Prüfungen: Unit-Fälle für Zeitpunkt nach dauerhaftem Schreiben, Doppelklick, Änderungen während des Schreibens, Fehler/Wiederholung und synchrone Validierung. Browserfälle prüfen DE/UA, Uhrzeit, erneutes Aktivieren, unabhängige Formulare, verschlüsselte Speicherung nach Sperren/Neuladen, einen simulierten vollen Datenträger sowie axe in Hell/Dunkel und große Schrift auf Mobilgeräten. Safari-/iPad-Konfiguration schließt dieselben neuen Browserfälle ein. Es werden ausschließlich erfundene Daten verwendet.

Lokale Abnahme: `npm test` – 265 bestanden; `npm run build` erfolgreich. Die acht Empfehlungsprüfungen sowie die 22 Prüfungen für Speicherbuttons, Rechnungen, Währungen und Bedienung bestanden auf Desktop und Mobilgerät. Der Uhrzeit-Test setzt die feste Gerätezeit vor dem Entsperren, damit er keine absichtliche automatische Sperre durch einen Zeitsprung im geöffneten Tresor auslöst.
