# Aurora-Dashboard ohne Bibliotheken

**Für die echte App:** Die entsprechende Gestaltung ist unter **Einstellungen → Darstellung** auswählbar und direkt einstellbar. [Anleitung](../docs/darstellung.md). Die Dateien hier sind ein zusätzliches, unabhängiges HTML-/CSS-Beispiel.

`aurora-dashboard.html` und `aurora-dashboard.css` zusammen in einen Ordner laden. Die HTML-Datei kann in einem gewöhnlichen Browser geöffnet werden. Für eine lokale HTTP-Vorschau im Repository:

```sh
python3 -m http.server 4198 --bind 127.0.0.1 --directory examples
```

Dann `http://127.0.0.1:4198/aurora-dashboard.html` aufrufen. Keine Installation, keine externen Schriften oder Skripte, keine Datenspeicherung. Es handelt sich um ein eigenständiges Designbeispiel mit erfundenen Daten, nicht um einen zweiten Zugang zum Kliententresor.

Alle Regler stehen ganz oben im CSS:

| Regler | CSS-Variable |
| --- | --- |
| Aurora-Farben | `--background-color-1`, `--background-color-2` |
| Hintergrund-Weichzeichnung | `--background-blur` |
| Card-Deckkraft | `--card-opacity` |
| Glas-Weichzeichnung | `--card-backdrop-blur` |
| Rahmenfarbe und Stärke | `--card-border-color`, `--card-border-width` |
| Schattenstärke | `--card-shadow-opacity` bzw. `--card-shadow` |

Die Deckkraft betrifft ausschließlich die Card-Hintergründe. Texte werden nicht transparent oder weichgezeichnet. Die Ausgangswerte verwenden fast deckende Textflächen und kontrastreiche Schriftfarben; bei eigenen Farb-/Deckkraftänderungen die Kontraste erneut prüfen. Ein absoluter Lesbarkeitsnachweis für beliebige spätere Werte ist nicht möglich.

Das Beispiel folgt dem Farbschema des Geräts, nutzt im Dunkelmodus Blau und berücksichtigt reduzierte Transparenz. Ohne Backdrop-Filter erhält die Card einen deckenden Hintergrund. Die Navigation wechselt bei schmalen Bildschirmen nach oben; Tabellen scrollen bei Bedarf innerhalb ihres Bereichs.

Geprüft: 820 px hell und 390 px dunkel, keine horizontale Seitenüberbreite, keine mit axe festgestellten WCAG-2.1-AA-Verstöße. Die Ansicht wurde zusätzlich visuell kontrolliert. Automatische Prüfungen ersetzen keinen vollständigen manuellen Barrierefreiheitstest.
