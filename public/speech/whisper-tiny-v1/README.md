# Lokales Diktierpaket Deutsch / Ukrainisch

Diese öffentlich auslieferbaren Dateien enthalten ausschließlich das mehrsprachige
Whisper-tiny-Modell, dessen Tokenliste und die WASM-Laufzeit. Keine Praxisdaten.
Gesamtumfang: 115.995.922 Byte (116 MB / ca. 111 MiB). Der Service Worker lädt diese
Dateien **nicht** beim App-Start. Erst „Offline-Paket DE / UA laden“ startet den Download.

Quellen und Lizenzen:

- Whisper: OpenAI, MIT, siehe `LICENSE-whisper.txt`.
- ONNX-Konvertierung: k2-fsa/sherpa-onnx, Apache-2.0, siehe `LICENSE-sherpa-onnx.txt`.
  Quelle: https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.tar.bz2
  Archiv-SHA-256: `c46116994e539aa165266d96b325252728429c12535eb9d8b6a2b10f129e66b1`.
- ONNX Runtime Web 1.24.3: Microsoft, MIT, siehe `LICENSE-onnxruntime.txt`
  und `ThirdPartyNotices-onnxruntime.txt`. Dateien aus dem exakt gepinnten NPM-Paket.

Die ONNX-Dateien werden in unveränderte, aufeinanderfolgende 24-MiB-Teile zerlegt,
damit jede Datei deutlich unter GitHubs Dateigrößenlimit bleibt. `manifest.json`
enthält Größe und SHA-256 jeder Datei sowie die Modell-Metadaten. Nach `npm ci`:

```sh
node scripts/prepare-speech-assets.mjs /path/to/sherpa-onnx-whisper-tiny.tar.bz2
```

Der Browser prüft die Dateien vor dem Speichern und vor dem Laden des Modells.
Nur diese öffentlichen Dateien bleiben im gesonderten Cache. Roh-Audio und
Transkripte werden dort niemals gespeichert. Das Modell arbeitet im eigenen Worker
mit Single-Thread-WASM, ohne GPU, SharedArrayBuffer oder externe Inferenz-API.

Whisper tiny ist eine kleine, begrenzt genaue Spracherkennung. Auch ein flüssiger
Satz kann falsch erkannt worden sein. Namen, Verneinungen und klinische Aussagen
müssen immer manuell geprüft werden. Nicht zur automatischen Diagnose oder Bewertung.
