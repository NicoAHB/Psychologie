# Sprach-Testdaten

Die WAV-Dateien enthalten ausschließlich eigens für diesen Test erzeugte synthetische
Sprache und keine Patientenaufnahmen. Mono, PCM16, 16 kHz.

- `de.wav`: „Guten Morgen. Heute geht es mir sehr gut.“ (eSpeak NG).
- `uk.wav`: „Добрий день. Сьогодні я почуваюся добре.“ (lokal erzeugt mit Piper,
  `uk_UA-ukrainian_tts-medium`, Sprecher 0). Modellkarte: Datensatz CC0,
  https://github.com/NabuCasa/voice-datasets. Quelle des ausschließlich zur
  Testdatenerzeugung verwendeten TTS-Modells:
  https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-uk_UA-ukrainian_tts-medium.tar.bz2.
  Das TTS-Modell und Python-TTS-Abhängigkeiten werden nicht mit der App ausgeliefert.

Die Testdateien dienen dem Nachweis lokaler Audioverarbeitung und ersetzen keine
repräsentative Bewertung der medizinischen oder sprachlichen Erkennungsqualität.
