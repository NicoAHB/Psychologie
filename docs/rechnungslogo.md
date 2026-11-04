# Rechnungslogo – Version 0.6.1

## Bedienung

1. **Mehr → Einstellungen → Praxis & Bankdaten** öffnen. Im Bereich **Praxisdaten für Rechnungen** steht **Logo auf Rechnungen**. Die Einstellung lässt sich auch über die Einstellungssuche mit „Logo“ finden.
2. **Logo auf neuen Rechnungen anzeigen** aktivieren oder deaktivieren. Das eingebaute Logo ist **Nadiia – The Confidence Space** und für neue Rechnungen zunächst eingeschaltet.
3. Optional über **Eigenes PNG auswählen oder ersetzen** eine andere PNG-Datei auswählen. Zulässig sind höchstens **2 MB** und **4096 × 4096 Pixel**. Die Vorschau zeigt die Auswahl. **Nadiia-Logo verwenden** wechselt zurück zum eingebauten Logo.
4. Unten **Speichern** wählen. Erst danach gelten die Änderungen dauerhaft. Der Knopf zeigt anschließend „Gespeichert um …“. Ein ausgeschaltetes eigenes Logo bleibt ausgewählt und kann wieder eingeschaltet werden.

Die Auswahl gilt für **neue Rechnungen**. Bereits ausgestellte Rechnungen behalten ihre damalige Auswahl, auch wenn später ein anderes PNG gewählt wird. Das betrifft Vorschau, Druck, PDF-Download und das PDF für den bestehenden E-Mail-/Telegram-Versand. Ein Storno übernimmt das Logo der ursprünglichen Rechnung; eine neu ausgestellte Korrekturrechnung verwendet die aktuelle Auswahl.

Die App-Marke in Seitenleiste und Startbildschirm bleibt unabhängig davon bestehen. Das Logo trägt keine Anschrift oder Bankverbindung in die Praxisdaten ein. Name, Anschrift und sonstige Rechnungsdaten müssen weiterhin über die vorhandenen Felder gepflegt werden.

## Technische Übergabe für Claude

- `Settings.invoiceLogo` und `Invoice.logo` sind optionale Erweiterungen innerhalb des bestehenden verschlüsselten Tresors. Keine Schemaerhöhung oder Supabase-Migration. Die Konfiguration enthält `enabled` sowie `source: 'nadiia' | 'custom'`. Ein eigenes Logo verweist über `DocumentFile` auf einen verschlüsselten PNG-Blob.
- Alte Sicherungen bekommen bei der Normalisierung die eingebaute Auswahl **nur in den Einstellungen**. Ausgestellte Rechnungen ohne `logo` werden nicht nachträglich verändert. `buildInvoice` speichert eine Kopie der jeweiligen Auswahl im Rechnungs-Snapshot. Das bestehende unveränderliche `$snapshot`-Register der Rechnungen umfasst damit automatisch auch das Logo.
- `invoiceLogo.ts` prüft MIME/Dateiendung, PNG-Signatur, IHDR, Dateigröße und Pixelmaße vor dem vollständigen Dekodieren. Ein fehlender MIME-Typ wird bei sonst gültigem PNG akzeptiert, um Dateiauswahlen mit unvollständigen Metadaten zu unterstützen. Im Browser wird zusätzlich mit `createImageBitmap` geprüft, ob das PNG tatsächlich lesbar ist. Die Originaldatei wird nicht an einen Bilddienst übertragen.
- Ein noch nicht gespeichertes PNG liegt nur im Arbeitsspeicher. `PracticeCard` ruft beim Speichern den vorhandenen verschlüsselnden `vault.addFile`-Pfad auf und speichert anschließend die Referenz über `vault.update`. Fehler lösen die vorhandene Bereinigung ungenutzter Blobs aus. Unveränderte Logo-Einstellungen werden bei einer reinen Stammdatenänderung nicht überschrieben.
- `referencedBlobs` umfasst die aktuelle Logo-Datei und sämtliche Rechnungs-Snapshots. Dadurch funktionieren verschlüsselte Sicherungen, Import, Verlauf und Cloud-Dateiliste ohne separate Sicherungslogik. Alte Logo-Dateien werden behalten, solange eine Rechnung, ein Konflikt oder ein gespeicherter Verlaufsstand sie benötigt. Eine Klientenlöschung entfernt die zugehörigen Rechnungen; eine für andere Rechnungen oder die Praxis weiterhin benutzte Datei bleibt erhalten.
- `settings.invoiceLogo` ist ein atomares CRDT-Register. `conflictBlobIds` berücksichtigt auch die Alternativen dieses Einstellungsfelds, damit beim Zusammenführen kein noch benötigtes PNG gelöscht wird. Der Konfliktdialog zeigt benannte Logo-Auswahlen mit Vorschau; die Auswahl lässt sich mit den vorhandenen Knöpfen auflösen.
- Der lesbare Klientenexport enthält bei Rechnungen mit eigenem Logo zusätzlich das jeweilige PNG und einen zugehörigen Pfad im Rechnungsdatensatz. Andere aktuelle Praxis-Logos werden nicht pauschal exportiert.
- `useInvoiceLogo` erzeugt für eigene Logos nur `blob:`-URLs im Arbeitsspeicher und gibt sie bei Wechsel/Schließen/Sperren frei. Es gibt keine Logo-Data-URLs oder Klartextbilder in IndexedDB, localStorage, Dateisystem oder Service-Worker-Cache. Das eingebaute öffentliche Markenbild ist eine statische App-Ressource und wird wie andere App-Ressourcen offline bereitgehalten.
- Der vorhandene PDF-Worker lädt das eingebaute Markenbild lokal von derselben Herkunft. Eigene Logos werden zuvor aus dem verschlüsselten Dateispeicher geöffnet und als Bytes an den Worker übergeben. Der Worker bettet das PNG in das PDF ein. Es werden keine neuen Worker, Pakete oder Bild-/Netzwerkdienste eingeführt. PNG-Fehler führen zu einer Fehlermeldung statt zu einer unbemerkt unvollständigen PDF. Der Druckknopf wartet auf ein erfolgreich geladenes eigenes Logo.
- Das eingebaute PNG in `src/assets/nadiia-logo-en.png` gehört zu bestehenden Rechnungs-Snapshots. Für spätere neue eingebaute Marken dieses Original beibehalten und einen neuen expliziten Quellentyp/Dateinamen ergänzen, statt das Original auszutauschen.

## Prüfung und Grenzen

Unit-Tests prüfen Upload-Grenzen, Altbestände, eingefrorene Rechnungslogos, Storno/Korrektur, konkurrierende Auswahl, Dateireferenzen/Löschung, verschlüsselten Backup-Round-Trip, Verlaufsstände, Klienten-ZIP und die PDF-Bildressourcen. Neue Browser-Tests prüfen Ein-/Ausschalten, eigenes PNG, tatsächliche Verschlüsselung im Dateispeicher, unveränderte frühere Rechnungen, Druckvorschau, Offline-PDF, vollständige Sicherung/Wiederherstellung in einem separaten Browserprofil, URL-Freigabe, Fehlermeldungen, DE/UA und axe auf 390/820 Pixeln. Die bestehenden Rechnungs-, Speicherknopf-, Sicherungs- und Seitenpfad-Tests werden mit ausgeführt; Safari/iPad/iPhone werden zusätzlich über die vorhandene CI geprüft.

```sh
npm test
npm run build
npm run test:e2e -- --workers=2 tests/browser/invoice-logo.spec.ts tests/browser/invoice.spec.ts tests/browser/invoice-delivery.spec.ts tests/browser/save-button.spec.ts tests/browser/a11y.spec.ts tests/browser/release-safety.spec.ts
VITE_BASE_PATH=/Psychologie/ npm run build
VITE_BASE_PATH=/Psychologie/ npm run test:e2e -- --workers=2 tests/browser/pages.spec.ts
```

Keine Tests gegen ein echtes Supabase-Projekt und kein echter Nachrichtenversand. Anbieter-Tests benutzen wie bisher ausschließlich Ersatzantworten. Eine rechtliche Prüfung der Rechnung oder der Software ist damit nicht verbunden.

## Geänderte Dateien

- `README.md`, `HANDOFF.md`, `docs/branding/README.md`, dieses Dokument
- `package.json`, `package-lock.json`, `src/lib/buildInfo.ts`, `tests/browser/release-safety.spec.ts` – App-Version 0.6.1, keine Abhängigkeitsänderungen
- `src/lib/types.ts`, `invoiceLogo.ts`, `useInvoiceLogo.ts`, `invoice.ts`, `invoicePdf.ts`, `workerTasks.ts`, `blobs.ts`, `crdt.ts`, `clientExport.ts`
- `src/workers/secure.worker.ts`
- `src/components/PracticeCard.tsx`, `InvoiceLogoFields.tsx`, `invoices.tsx`, `SyncConflicts.tsx`
- `src/invoice.css`, `src/usability.css`, `src/locales/de.json`, `src/locales/uk.json`
- `tests/invoice-logo.test.ts`, `tests/invoice-delivery.test.ts`, `tests/workflow.test.ts`, `tests/browser/invoice-logo.spec.ts`, `tests/browser/invoice-delivery.spec.ts`, `playwright.ipad.config.ts`, `.github/workflows/checks.yml`

Der vorhandene CI-Lauf mit ausschließlich fiktiven Anbieter-Einstellungen führt zusätzlich `invoice-delivery.spec.ts` aus. Er prüft, dass die abgefangenen E-Mail- und Telegram-Anhänge tatsächlich das eingebettete Logo enthalten; es werden keine Nachrichten verschickt.
