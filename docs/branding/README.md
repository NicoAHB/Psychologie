# Nadiia – Marken-Dateien

Die Beraterin heißt **Nadiia Matusevych**. Gewählt wurde Entwurf **1: Dialog & Blatt**. Der anschließend freigegebene App-Markenname ist **Nadiia – The Confidence Space**. Die Oberfläche der Praxissoftware bleibt deutsch/ukrainisch.

## Fertige Logos

- [Englische Wort-Bild-Marke](nadiia-logo-en.png): „Nadiia / The Confidence Space / Psychological Counselling · Nadiia Matusevych“. Dieses unveränderte PNG bleibt das Original für Rechnungen und Weitergabe; die Anmeldeseite verwendet die unten beschriebene transparente Variante.
- [Deutsche Wort-Bild-Marke](nadiia-logo-de.png): „Nadiia / Raum für Zuversicht / Psychologische Beratung · Nadiia Matusevych“.
- [Freigestelltes Symbol](nadiia-symbol-transparent.png): für die kompakte App-Darstellung.

Die Dateien wurden im Auftrag der Nutzerin mit dem Bildgenerator erstellt. Die vollständigen Logos sind PNGs mit hellem Hintergrund; das separate Symbol hat einen transparenten Hintergrund. Die App lädt die Bilddateien ausschließlich als eigene statische Ressourcen. Es gibt dafür keine Verbindung zu einem Bilddienst zur Laufzeit.

## Alle fünf ursprünglichen Entwürfe

Die ursprünglichen PNGs bleiben unverändert erhalten, damit ein späterer Wechsel möglich ist:

1. [Dialog & Blatt](original-entwuerfe/01-dialog-und-blatt.png)
2. [Offener Raum](original-entwuerfe/02-offener-raum.png)
3. [NM-Monogramm](original-entwuerfe/03-nm-monogramm.png)
4. [Balance](original-entwuerfe/04-balance.png)
5. [Verbindung](original-entwuerfe/05-verbindung.png)

## App-Verwendung

`src/components/ui.tsx` stellt `Logo` bereit: kompakt mit Symbol und Text, mit `full` als vollständiges englisches PNG. `Welcome.tsx` nutzt die volle Marke; die Seitenleiste und bestehende Gastansichten nutzen die kompakte Darstellung. `src/usability.css` enthält die Layoutregeln. Seit Version 0.6.2 verwendet die Anmeldeseite das freigestellte PNG `src/assets/nadiia-login-light.png` mit echter Alpha-Transparenz. Im Dunkelmodus wird der Schriftbereich per CSS aufgehellt, während der Symbolbereich seine Grün-/Blautöne behält. Beide Ausschnitte verwenden dieselbe Bilddatei; es gibt keinen zweiten Bilddownload. `--brand-symbol-edge: 29%` markiert die transparente Lücke zwischen Symbol und Schrift der freigegebenen Grafik. Bei einem späteren Austausch der App-Marke diesen Ausschnitt mitprüfen. Die große Grafik hat dort weder eine Hintergrundfläche noch einen Rahmen. Die Rechnungsdatei `src/assets/nadiia-logo-en.png` bleibt als unveränderliches Original für ausgestellte Rechnungen erhalten. Auf kleinen Geräten stehen die Sprach-/Darstellungsschalter in einer eigenen Zeile.

Die ausgelieferten Ressourcen liegen in `src/assets/`. Die Entwürfe und Druck-/Weitergabe-Dateien in diesem Dokumentationsordner werden nicht in den App-Build aufgenommen. Für einen späteren Wechsel beide Bilddateien sowie die `practitionerBrand*`-Einträge in **beiden** Sprachdateien prüfen. Praxis-Stammdaten, Rechnungsabsender und Bankdaten werden durch die grafische Marke nicht geändert.

Eine Marken-, Namens-, Domain- oder rechtliche Prüfung ist damit nicht verbunden. Es wird keine bestimmte Wirkung auf neue Klienten zugesichert.

Seit Version 0.6.1 lässt sich das englische Logo auch auf neuen Rechnungen verwenden, abschalten oder durch ein verschlüsselt gespeichertes eigenes PNG ersetzen. App-Marke und Rechnungslogo sind getrennt. [Bedienung und technische Übergabe](../rechnungslogo.md).

Prüfung der Anpassung 0.6.2: Der vorhandene Browser-Test `app-usability.spec.ts` prüft jetzt echte transparente Bildpixel, fehlende Hintergrund-/Rahmenfläche, den unmittelbaren Darstellungswechsel, erhaltene Symbolfarben, 390/820 Pixel und axe. Es gibt keine neuen UI-Texte, Pakete, Datenmodell- oder Sicherungsänderungen. Geänderte Dateien: `src/assets/nadiia-login-light.png`, `src/components/ui.tsx`, `src/usability.css`, `tests/browser/app-usability.spec.ts`, `tests/browser/release-safety.spec.ts`, `src/lib/buildInfo.ts`, `package.json`, `package-lock.json`, `README.md`, `HANDOFF.md`, `docs/branding/README.md` und `docs/bedienung-und-marke.md`.
