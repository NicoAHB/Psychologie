# Pastell-Hintergründe und Milchglas in der App

Die Gestaltung ist jetzt in die tatsächliche Praxisraum-Oberfläche integriert. Das
HTML/CSS unter `examples/` bleibt ein eigenständiges Muster; dafür muss nichts
kopiert oder installiert werden.

## Bedienung

Unter **Einstellungen → Darstellung** stehen Salbei/Blau (Standard), Sand/Rosé,
Lavendel/Blau und Pfirsich/Minze sowie eigene Farben oder ein Hintergrund ohne
Verlauf zur Auswahl. Alle Änderungen wirken sofort auf die ganze App.

- **Stärke des Farbverlaufs:** 0–100 %. Im Dunkelmodus bleiben die Farben auf einer
  dunkelblauen Grundfläche gedämpft.
- **Transparenz der Inhaltskarten:** 0–30 %. 0 % ist deckend; höhere Werte lassen
  den Hintergrund leicht durchscheinen. Gilt auch für Sitzungs-Vorbereitung und
  die hervorgehobene Übersichtskarte.
- **Transparenz der Menüs:** separat 0–30 %, für Seitenleiste, Kopf- und Statusleiste.
- **Weichzeichnung der Glasflächen:** 0–28 px. Unter „Weitere Hintergrund-Einstellungen“
  lässt sich zusätzlich die Weichzeichnung des Farbverlaufs einstellen.
- **Darstellung zurücksetzen:** setzt die Hintergrund-/Glasregler auf ihre
  Ausgangswerte zurück; das gewählte Hell-/Dunkel-Farbschema bleibt erhalten.

Es gibt keinen separaten Speichern-Schritt. Die Auswahl bleibt nach Sperren und
Neuladen auf diesem Gerät erhalten. Sie wird nicht auf andere Geräte synchronisiert
und gehört nicht zur Klientensicherung. Bei gesperrtem Browser-Speicher funktionieren
die Regler weiterhin für die laufende Seite.

## Technik und Übergabe an Claude

- `src/lib/appearance.ts`: versionierte, streng begrenzte Gerätepräferenzen,
  Farbpaletten, Normalisierung und CSS-Variablen. Beliebige CSS-Werte aus dem
  Browser-Speicher werden nicht übernommen. Eigene Farben werden auf mindestens
  RGB 210 pro Farbkanal aufgehellt, damit sie tatsächlich Pastellfarben bleiben.
- `src/lib/theme.tsx`: vorhandener Theme-Provider ergänzt um die Darstellung,
  lokale Speicherung unter `praxisraum-appearance`, Abgleich zwischen Tabs und
  sofortiges Anwenden im Layout-Effect. Keine Änderungen am verschlüsselten
  Datenmodell, an Sicherungen oder an Supabase.
- `public/theme-init.js`: stellt gespeicherte Werte bereits vor dem ersten
  Zeichnen der Seite wieder her. Die bewusst kleine Bootstrap-Implementierung
  wird per Unit-Test mit der TypeScript-Normalisierung verglichen. Bei Änderungen
  an Standardwerten oder Grenzen beide Dateien zusammen anpassen.
- `src/components/AppearanceCard.tsx`: übersetzte, beschriftete Radiofelder,
  Farbwähler und native Tastatur-/Touch-Regler. Texte ausschließlich in `de.json`
  und `uk.json`. Einstiegsstelle ist die bestehende Einstellungsseite.
- `src/appearance.css`: nach den bisherigen globalen Styles importiert. Die
  wesentlichen Regler einschließlich Rahmenbreite/-farbe und Schatten stehen
  oben als CSS-Variablen. Die statische Aurora-Ebene lädt keine Bilder oder
  Schriften und verwendet keine Animation, Worker oder zusätzliche Bibliothek.

Nur die Hintergrundfarbe einer Fläche wird transparent; Schrift und Bedienelemente
erhalten keine `opacity`. Eingabefelder, Dialoge und Tabellenüberschriften behalten
ihre bisherigen deckenden Farben. Ohne `backdrop-filter` und bei
`prefers-reduced-transparency: reduce` sind die Flächen deckend. Im erzwungenen
Kontrastmodus entfällt der Aurora-Hintergrund. Druck und erzeugte Rechnungs-PDFs behalten
die bisherigen Papierfarben.

## Prüfungen

`tests/appearance.test.ts` prüft Altdaten ohne Präferenzen, beschädigte/unerwartete
Speicherwerte, sichere Grenzen, Pastellfarben sowie die Wiederherstellung vor dem
ersten Zeichnen. `tests/browser/appearance.spec.ts` prüft echte Reglerbedienung,
getrennte Flächentransparenz, DE/UA-Wechsel, Sperren/Neuladen, eigene Farben,
Zurücksetzen, reduzierte Transparenz, Druck und axe-Kontraste bei maximaler
Transparenz. Der Safari-Workflow bezieht die Ansichten auf iPad-/iPhone-Größen ein.
Zusätzlich berechnet `tests/browser/appearance-contrast.ts` den Kontrast von Texten,
die direkt über der Aurora-Ebene stehen, gegen die ungünstigsten zulässigen Farben.
Das ergänzt axe: Ein Hintergrundverlauf auf einer separaten Ebene lässt sich dort
nicht zuverlässig einem transparenten Textbereich zuordnen. Kleine Beschriftungen,
Reiter und Fußzeilen im Hellmodus verwenden deshalb dunklere Schrift.
Die bestehende vollständige axe-Prüfung deckt die Standardgestaltung in allen
Hauptansichten und Dialogen ab. Konkrete Prüfergebnisse stehen in `HANDOFF.md`.

Automatische Prüfungen sind kein vollständiger manueller WCAG-Nachweis. Ein echter
iPadOS-Gerätetest bleibt sinnvoll; Playwright-WebKit auf Linux ist dessen Ergänzung.
