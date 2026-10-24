# Praxisorganisation und Kontaktverlauf – Übergabe für Claude

Stand: 24. Oktober 2026. Umgesetzt sind die ausgewählten Vorschläge 1, 2, 3 und 5: mehrere Wiedervorlagen, Dublettenhinweise, Rechnungsprüfung und Kontaktverlauf. Teilzahlungen und Erstattungen waren nicht ausgewählt und wurden nicht ergänzt.

## Bedienung

### Mehrere Wiedervorlagen

Unter **Heute → Wiedervorlagen** und im **Klientenprofil → Überblick** gibt es eine gemeinsame Aufgabenliste. Die Filter heißen **Alle offenen**, **Überfällig**, **Heute**, **Diese Woche** und **Später**. „Diese Woche“ meint Montag bis Sonntag der aktuellen Praxiswoche; „Später“ beginnt am folgenden Montag. Überfällige Einträge bleiben zusätzlich über den eigenen Filter erreichbar.

**Wiedervorlage hinzufügen** legt Datum und Anlass an. Die vorhandenen Anlassvorschläge können angeklickt, ergänzt oder durch eigene Texte ersetzt werden. Jede Aufgabe lässt sich unabhängig bearbeiten, verschieben, erledigen oder im Bearbeitungsdialog löschen. Auf „Heute“ führt **Öffnen** direkt zur jeweiligen Akte. Lange Listen werden zunächst begrenzt angezeigt; **Weitere anzeigen** lädt weitere Zeilen in die Ansicht.

Die bisherige einzelne Wiedervorlage aus „Profil bearbeiten“ erscheint ebenfalls in dieser Liste. Das Erledigen dieser alten Wiedervorlage leert nur ihr Datum und erhält die Notiz. Die Vorbereitung auf den nächsten Termin bleibt im Klientenüberblick oberhalb der Aufgaben sichtbar.

### Mögliche doppelte Akten erkennen

Beim Anlegen eines Klienten erscheint bei passenden Angaben ein unverbindlicher Hinweis. Die Suche vergleicht lokal E-Mail-Adressen, Telefonnummern und normalisierte Namen; auch eine vertauschte Namensreihenfolge und einzelne Tippfehler können erkannt werden. Ein Geburtsdatum stützt einen Namenshinweis, löst allein aber keinen Treffer aus. Es werden höchstens fünf Treffer angezeigt.

**Bestehende Akte öffnen** verlässt das neue Formular. Bei pausierten oder abgeschlossenen Akten steht zusätzlich **Wieder aktivieren** zur Verfügung; Dokumentation und Zahlungen bleiben erhalten. Eigenständige Personen mit ähnlichem Namen oder gemeinsamer Kontaktadresse können nach ausdrücklicher Bestätigung weiterhin angelegt werden. Es werden keine Akten automatisch zusammengeführt und keine externen Adressdienste abgefragt.

### Rechnung vor dem Ausstellen prüfen

Im Rechnungsformular zeigt die Prüfung fehlenden Empfängernamen bzw. fehlende Anschrift, fehlenden Praxisnamen bzw. fehlende Praxisanschrift und ein fehlendes Auszahlungskonto an. Währung und ausgewähltes deutsches/ukrainisches Konto stehen zusammen. Über die passenden Knöpfe lassen sich Klienten-, Praxis- und Bankangaben direkt bearbeiten, ohne das angefangene Rechnungsformular zu verlieren.

Die Hinweise prüfen, ob Angaben vorhanden sind. Sie bestätigen weder die inhaltliche Richtigkeit einer Adresse oder IBAN noch die rechtliche Vollständigkeit einer Rechnung. Die bestehenden Prüfungen zu Beträgen, Wechselkursen und Konflikten bleiben erhalten.

Ausgestellte Rechnungen werden anhand ihres gespeicherten Standes geprüft. Eine spätere Stammdatenänderung schreibt sie nicht um. Eine erforderliche Änderung führt über die bestehende Funktion zur Rechnungskorrektur mit Storno und Ersatzrechnung.

### Kontaktverlauf im Klientenprofil

Der zusätzliche Reiter **Kontaktverlauf** zeigt die bereits gespeicherten Vorgänge dieser Person, neueste zuerst:

- Dokument-, Rechnungs- und Zahlungserinnerungsversand über E-Mail oder Telegram;
- aufgezeichnete Terminbestätigungen und Terminerinnerungen per E-Mail;
- individuelle Versandvorgänge aus dem Newsletter-Archiv;
- als zurückerhalten hinterlegte Dokumente.

Filter grenzen E-Mail, Telegram und Rückläufe ein. Ein Eintrag öffnet eine schreibgeschützte Detailansicht mit dem gespeicherten Text, Zeitpunkt, Kanal und vorhandenen Anlagedaten. Rechnung bzw. Originaldokument sind direkt erreichbar.

**An Versanddienst übergeben** bedeutet eine gespeicherte Annahmebestätigung des Dienstes, keine Zustell- oder Lesebestätigung. Versuche ohne Bestätigung und fehlgeschlagene Newsletter-Vorgänge werden entsprechend bezeichnet. Ein bloßer PDF-Download oder Datei-Upload gilt nicht als Versand. Bei Rückläufen ohne gespeicherte Uhrzeit wird nur das Rücklaufdatum angezeigt.

Es gibt keinen E-Mail-Posteingang, Telegram-Chatimport, neuen Hintergrundabruf oder zusätzlichen Versanddienst. Automatische Telegram-Erinnerungen aus dem externen Worker erscheinen nur, wenn ihre Versanddaten bereits in den bestehenden lokalen Protokollen vorliegen; der Verlauf lädt keine entfernten Worker-Protokolle nach.

## Datenmodell und Rückwärtskompatibilität

- Ergänzung `VaultData.followUps: FollowUpTask[]` mit `id`, `clientId`, `dueOn`, `note`, `createdAt`, optional `completedAt` und den vorhandenen kausalen Stempeln. Ältere Tresore/Sicherungen erhalten beim Normalisieren eine leere Liste. Das Tresorformat bleibt unverändert.
- `Client.followUpOn` und `followUpNote` bleiben bestehen. `followUpRows()` bildet daraus eine virtuelle Zeile mit `legacy-follow-up:<clientId>`. Es erfolgt keine automatische Umschreibung alter Register und keine doppelte physische Ablage. Eine Bearbeitung dieser virtuellen Zeile aktualisiert die bisherigen Klientenfelder.
- Neue erledigte Aufgaben bleiben mit `completedAt` im verschlüsselten Bestand, erscheinen aber nicht mehr in der Liste offener Aufgaben. Eine eigene Ansicht für erledigte Aufgaben wurde nicht eingeführt. Bei der alten Einzelwiedervorlage gibt es weiterhin keinen zusätzlichen Erledigungsverlauf.
- Die neue Sammlung ist in CRDT-Registern, Konfliktanzeige, Zusammenführung, Löschung, Sicherung/Import, Versionswiederherstellung und Klientenexport berücksichtigt. Unabhängige Aufgaben werden zusammengeführt; konkurrierende Änderungen desselben Feldes bleiben als prüfbare Varianten erhalten. Gelöschte Aufgaben werden durch alte Gerätestände nicht wiederbelebt.
- Das Löschen einer zusätzlichen Wiedervorlage verwendet die bestehende Lösch-/Verlaufsfunktion. Die endgültige Löschung einer ganzen Klientenakte entfernt auch zugehörige Aufgaben und verdeckte CRDT-Werte nach dem vorhandenen Löschkonzept. Bereits heruntergeladene Sicherungen bleiben unverändert.
- Der lesbare Klienten-ZIP-Export enthält die Aufgaben in `daten.json` und zusätzlich `wiedervorlagen.json`. Die bisherigen Versandprotokolle und Dokumentrückläufe werden unverändert exportiert.
- Kontaktverlauf und Dublettensuche sind abgeleitete Ansichten, keine neuen Protokollkopien oder Klartextspeicher. Die vorhandene Verschlüsselung vor IndexedDB und Cloud-Abgleich bleibt erhalten. Keine Supabase-Migration, neuen NPM-Pakete oder Audiofunktionen erforderlich.

## Komponenten und technische Hinweise

`PracticeCard` wurde unverändert aus den Einstellungen herausgelöst und um optionales Fokussieren des Praxis- bzw. Bankbereichs ergänzt. So nutzen Einstellungen und Rechnungsprüfung dasselbe Stammdatenformular.

Ein nativer Dialog wird weiterhin über die vorhandene `Modal`-Komponente als Portal geöffnet. `Modal` unterbindet jetzt die Weitergabe von Submit-Ereignissen über die React-Portalhierarchie. Das verhindert, dass das Speichern eines verschachtelten Klientenformulars gleichzeitig die umgebende Rechnung ausstellt. Die Formulare selbst verarbeiten ihren Submit wie bisher.

Listen sind begrenzt und memoisiert; die Dublettensuche reagiert nach 300 ms Eingabepause. Neue Texte liegen ausschließlich in den gleich aufgebauten DE-/UK-Wörterbüchern. Die neuen Flächen nutzen vorhandene Hell-/Dunkelfarben und umbrechende, mindestens 44 Pixel hohe Bedienelemente.

## Geänderte Dateien

- `README.md`, `HANDOFF.md`, `docs/praxisorganisation-und-kontaktverlauf.md`
- `src/App.tsx`
- `src/components/ClientDuplicateNotice.tsx`, `ContactHistory.tsx`, `FollowUpBoard.tsx`, `InvoiceChecks.tsx`, `PracticeCard.tsx`
- `src/components/SyncConflicts.tsx`, `WorkBoard.tsx`, `client-profile.tsx`, `forms.tsx`, `invoices.tsx`, `ui.tsx`
- `src/lib/clientDuplicates.ts`, `contactHistory.ts`, `followUpTasks.ts`, `invoiceChecks.ts`
- `src/lib/backupState.ts`, `clientExport.ts`, `crdt.ts`, `merge.ts`, `records.ts`, `types.ts`, `useVault.ts`, `workItems.ts`
- `src/pages/SettingsPage.tsx`, `src/practice-features.css`
- `src/locales/de.json`, `src/locales/uk.json`
- `tests/practice-overview.test.ts`, `tests/browser/practice-overview.spec.ts`, `tests/browser/client-duplicates.spec.ts`, `playwright.ipad.config.ts`

## Prüfen und veröffentlichen

```sh
npm ci
npm test
npm run build
npm run test:e2e
npm run test:ipad
```

Für die lokal vorhandene Chromium-Installation nutzt die Browserkonfiguration `/usr/bin/chromium`. Die separate Safari-CI installiert WebKit und führt auch die neuen Tests aus. Ein Linux-WebKit-Lauf ersetzt keinen Test auf einem echten iPad.

Die neuen Unit-Tests prüfen Altdaten, Datumsfilter, voneinander unabhängige Aufgaben, Eingabegrenzen, Konflikte, endgültige Klientenlöschung, verschlüsselte Sicherung und Klientenexport, Dublettenlogik, Kontowahl und Rechnungsstände sowie Umfang und Status des Kontaktverlaufs. Die neuen Browserprüfungen prüfen Anlegen/Bearbeiten/Erledigen/Löschen und Wiederherstellung nach Sperren/Neuladen, Reaktivierung, Rechnungskorrekturen vor Ausstellung, Sprachwechsel, Tastatur-/Axe-Prüfungen und schmale Ansichten mit großer Schrift. Es werden nur synthetische Daten genutzt und keine echten Nachrichten versendet oder echten Supabase-Projekte angesprochen.

Prüfstand der ersten Fassung (`8f9c985`): **289 Unit-Tests bestanden**, Produktionsbuild erfolgreich, **184 Browserprüfungen bestanden** (20 vorhandene, konfigurationsabhängige Tests planmäßig übersprungen). Nach der abschließenden Fokuskorrektur bestanden zusätzlich beide gezielten Chromium-Prüfungen für die Rechnungsprüfung und das ukrainische Bankformular; Unit-Tests und Build wurden danach ebenfalls erneut erfolgreich ausgeführt. Der vollständige Browserlauf enthält auch die neuen Axe-Prüfungen für Aufgabenliste, Aufgabendialog und Dublettenhinweise.

Der Pages-Workflow baut nach einem Push auf `main` für `/Psychologie/`. Es sind keine manuellen SQL- oder Datenänderungen nötig. Eine bereits installierte PWA übernimmt das Update über ihren vorhandenen Hinweis **Jetzt aktualisieren**.

## Bewusste Grenzen

Keine Teilzahlungen/Erstattungen, kein automatisches Zusammenführen von Personen, keine Postfach- oder Chat-Anbindung und keine rechtliche Prüfung. Die Aufgabe verändert weder Prämienberechnung noch Nachrichtenversand oder bestehende Rechnungsbeträge.

## Korrektur: Dubletten beim Speichern ausdrücklich prüfen

Der ursprüngliche Hinweis erschien unterhalb der optionalen Formularfelder und war nicht mit dem Speichervorgang verbunden. Ein identischer Name ließ sich daher ohne Bestätigung nochmals speichern. Der Fehler wurde mit „Alex von Beispiel“ ohne E-Mail oder Telefonnummer reproduziert.

Der Hinweis steht jetzt direkt unter dem Namen. Zusätzlich prüft das Formular beim Speichern synchron den aktuellen entsperrten Datenbestand. Bei einem Treffer öffnet sich ein eigener beschrifteter Dialog: vorhandene Akte öffnen, gegebenenfalls wieder aktivieren, zum ausgefüllten Formular zurückkehren oder **Trotzdem neue Akte anlegen**. Vor der Bestätigung wird keine neue Akte gespeichert. Enter und schnelles Speichern durchlaufen dieselbe Prüfung; der verzögerte Inline-Hinweis entscheidet nicht über das Speichern.

`requireClientDuplicateReview()` prüft die Treffer zusätzlich direkt in der Tresoränderung vor dem Hinzufügen der Akte. Kommt während der Bildverarbeitung ein neuer passender Datensatz hinzu, muss dieser erneut geprüft werden. Eine bereits vorbereitete, weiterhin unreferenzierte Profilbilddatei wird dabei über die vorhandene verschlüsselte Blob-Bereinigung entfernt. Die Bestätigung gilt nur für den laufenden Speicherversuch und wird nicht dauerhaft gespeichert oder auf spätere Neuanlagen übertragen.

Es erfolgt keine automatische Zusammenführung oder Löschung vorhandener Doppelakten. Eine Änderung bestehender Klienten bleibt wie bisher möglich. Datenmodell, Verschlüsselung und Supabase-Schema sind unverändert. Die Warnung prüft die im geöffneten Tresor bekannten Akten; zwei getrennte Offline-Geräte können weiterhin unabhängig neue Akten anlegen.

Zusätzliche Tests prüfen den identischen Namen ohne Kontaktdaten, die Prüfung gegen einen inzwischen geänderten Bestand, unmittelbares Speichern/native Submit und Enter, Abbrechen mit Erhalt der Eingaben, Öffnen der vorhandenen Akte, bewusste zusätzliche Anlage und eine neue Bestätigung bei der nächsten Neuanlage. Die Warnung wird auch auf Ukrainisch, im Dunkelmodus, mit großer Schrift und über Axe geprüft. `playwright.ipad.config.ts` nimmt die drei neuen Szenarien in die Safari-CI auf.

Prüfstand dieser Korrektur: **291 Unit-Tests**, Produktionsbuild und **16 gezielte Chromium-Browserprüfungen** bestanden (Desktop und Handy, einschließlich der bisherigen vier neuen Funktionen). Zusätzlich bestanden **28 bestehende Browserprüfungen** für lokale Klientenanlage mit Profilbild, verschlüssertes Speichern, Anschriften, Wiedervorlage und Empfehlungen (insgesamt 44 unterschiedliche geprüfte Chromium-Fälle). Keine echten Nachrichten und keine Tests gegen echte Supabase-Projekte.
