# Nadiia – Marken-Dateien

Die Beraterin heißt **Nadiia Matusevych**. Gewählt wurde Entwurf **1: Dialog & Blatt**. Der anschließend freigegebene App-Markenname ist **Nadiia – The Confidence Space**. Die Oberfläche der Praxissoftware bleibt deutsch/ukrainisch.

## Fertige Logos

- [Englische Wort-Bild-Marke](nadiia-logo-en.png): „Nadiia / The Confidence Space / Psychological Counselling · Nadiia Matusevych“. Dieses unveränderte PNG ist das vollständige Logo auf dem Start-/Sperrbildschirm.
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

`src/components/ui.tsx` stellt `Logo` bereit: kompakt mit Symbol und Text, mit `full` als vollständiges englisches PNG. `Welcome.tsx` nutzt die volle Marke; die Seitenleiste und bestehende Gastansichten nutzen die kompakte Darstellung. `src/usability.css` enthält die Layoutregeln. Die vollständige Grafik bekommt auch im Dunkelmodus eine helle Fläche, damit die dunkelblaue Schrift lesbar bleibt. Auf kleinen Geräten stehen die Sprach-/Darstellungsschalter in einer eigenen Zeile.

Die ausgelieferten Ressourcen liegen in `src/assets/`. Die Entwürfe und Druck-/Weitergabe-Dateien in diesem Dokumentationsordner werden nicht in den App-Build aufgenommen. Für einen späteren Wechsel beide Bilddateien sowie die `practitionerBrand*`-Einträge in **beiden** Sprachdateien prüfen. Praxis-Stammdaten, Rechnungsabsender und Bankdaten werden durch die grafische Marke nicht geändert.

Eine Marken-, Namens-, Domain- oder rechtliche Prüfung ist damit nicht verbunden. Es wird keine bestimmte Wirkung auf neue Klienten zugesichert.
