# Lokale Werkzeuge und Videosprechstunde

Diese Funktionen verwenden Browser-Standards und freie Open-Source-Pakete. Es wird kein kostenpflichtiger Dienst automatisch zugeschaltet. Die begrenzten Supabase-Free-Tier-Kontingente gelten auch für Authentifizierung, Datenbank und Realtime. Ein dauerhaft unbegrenzter kostenloser Betrieb ist damit nicht zugesichert.

## Feldweiser Offline-Abgleich

`src/lib/crdt.ts` implementiert zustandsbasierte **Multi-Value-Register** mit kausalen Versionsvektoren und eindeutigen Schreiboperationen. `merge.ts` verbindet diese Register; `syncMerge.ts` entschlüsselt die fremde Kopie lokal. Die zusätzliche `crdt`-Struktur wird mit der gesamten Akte AES-GCM-verschlüsselt. Supabase erhält weder Feldnamen noch Konflikttexte oder Gerätekennungen im Klartext.

- Änderungen verschiedener Felder derselben Akte werden automatisch zusammengeführt, ebenso unabhängig angelegte Sitzungen, Tags und Versand-/Rücklauf-Einträge.
- Eine kausal spätere Änderung ersetzt die vorherige auch bei falsch gehender Geräteuhr. Bei **gleichzeitiger Bearbeitung desselben Feldes** bleiben alle Varianten erhalten. Die Oberfläche zeigt zunächst eine deterministisch ausgewählte Variante und weist auf die ausstehende Prüfung hin. Texte werden nicht automatisch zu klinisch möglicherweise falschen Aussagen zusammengesetzt: In „Änderungen zusammenführen“ kann die Beraterin eine Variante wählen oder einen geprüften kombinierten Text speichern. Eine solche Entscheidung bestätigt die bisherigen Versionen; alte Gerätekopien können sie nicht wieder als offenen Konflikt einführen.
- Honorar, Währung, Kurs, Zahlungsstatus und Rechnungsverknüpfung einer Sitzung bilden ein gemeinsames Register. Ausgestellte Rechnungen bleiben ganze, unveränderliche Dokument-Snapshots. Ungeklärte Finanzkonflikte verhindern eine neue darauf beruhende Rechnung bzw. einen verlässlichen Zahlungs-/Mahnstatus. Keine Beträge werden addiert oder zwischen zwei widersprüchlichen Rechnungen vermischt.
- Konkurrierende Bild-/Dokumentvarianten behalten ihre Dateiverweise, damit die verschlüsselten Dateien nicht vor der Prüfung gelöscht werden.
- Löschungen schlagen konkurrierende Änderungen. Bei einzelnen Sitzungen kann eine gleichzeitige Änderung über die Konfliktprüfung ausdrücklich wiederhergestellt werden. Die vollständige Löschung eines Klienten hat Vorrang: Auch versteckte Konflikttexte und abhängige Akteninhalte werden entfernt. Löschmarkierungen werden nicht nach einer festen Frist verworfen, damit lange offline gebliebene Geräte keine gelöschten Akten wiederherstellen.
- Alte Tresore werden deterministisch übernommen. Änderungen alter App-Versionen, die unbekannte Metadaten nur unverändert zurückschreiben, werden anhand ihrer tatsächlichen Felder übernommen. Bereits früher durch Last-Write-Wins verlorene Inhalte lassen sich damit nicht nachträglich rekonstruieren. Vor der Umstellung ein externes verschlüsseltes Backup erstellen und alle Geräte aktualisieren.

Neu: `@noble/hashes` (MIT) für synchrone SHA-256-Kennungen bei der Legacy-Migration. Kein externer CRDT-Server und keine zusätzliche Cloud-Datenbank nötig. Die bestehenden Revisionsprüfungen auf Supabase bleiben aktiv. Verschlüsselter Stand und die dazugehörigen Datei-Verweise werden aus einem gemeinsam gespeicherten Snapshot synchronisiert, auch wenn währenddessen weitere Notizen bearbeitet werden.

## Crypto- und PDF-Worker

`src/lib/workerTasks.ts` stellt eine typisierte Promise-Schnittstelle bereit. Der lokale Modul-Worker `src/workers/secure.worker.ts` führt Akten-/Dateiver- und -entschlüsselung, den Abgleich, PDF-Erstellung, PDF-Formularimport und Backup-Serialisierung aus. PDF-Bibliotheken und Schriftarten lädt er erst bei Bedarf. Die Basisschrift und alle Worker-Chunks sind offline verfügbar; zusätzliche Schriftsätze bleiben im bestehenden Runtime-Cache.

Nicht exportierbare `CryptoKey`-Objekte werden mit Structured Clone an den Worker übergeben, ohne Rohschlüssel zu exportieren. Der Worker speichert keine Schlüssel oder Akten und führt keine Cloud-Synchronisation aus. Beim Sperren wird er nach dem Speichern beendet. Fehler beim Start werden angezeigt; es gibt keinen heimlichen Rückfall auf PDF-Arbeit im UI-Thread. Eine absolute Garantie gegen jedes Ruckeln auf beliebiger Hardware ist nicht möglich: React-Darstellung, Browser-Speicherzugriff und Structured Clone benötigen ebenfalls Rechenzeit.

Die reinen Funktionen in `crypto.ts`, `invoicePdf.ts` und `questionnairePdf.ts` bleiben für Tests verwendbar. Die produktiven UI-Aufrufe verwenden den Worker. `pdf-lib`, `@pdf-lib/fontkit` und die lokalen DejaVu-Schriften bleiben unverändert freie Abhängigkeiten.

## Automatische Ordnersicherung auf die Festplatte

In **Einstellungen → Sicherung → Sicherungsordner wählen** einen lokalen Ordner oder externen Datenträger freigeben. Chromium auf Desktop unterstützt `showDirectoryPicker`; Safari/iPadOS derzeit nicht. Bestehende automatische Einzeldatei-Sicherungen bleiben nutzbar.

Nach Änderungen schreibt die geöffnete App nach fünf Sekunden Ruhe eine neue **vollständige verschlüsselte JSON-Datei**, einschließlich aller benötigten verschlüsselten Anhänge. Erst nach erfolgreichem `close()` werden die ältesten eigenen Dateien desselben Tresors entfernt; die letzten 30 bleiben erhalten. Bei Schreibfehlern bleibt die vorherige Sicherung erhalten. Fremde Dateien und Sicherungen anderer Tresore werden nicht gelöscht. Jede Datei lässt sich mit dem bisherigen Backup-Import wieder einspielen.

Der Browser speichert nur den Ordner-Handle in IndexedDB. Nach Neustart, Browserrichtlinien oder dem Löschen des Browser-Speichers kann eine erneute Freigabe nötig sein. Das Anfordern einer Berechtigung erfolgt nur durch einen Klick. Die verschlüsselten Dateien selbst bleiben außerhalb des Browser-Speichers erhalten. Eine geschlossene oder vom Betriebssystem beendete PWA kann keine weiteren Dateien schreiben; eine Sichtbarkeitsänderung ist lediglich ein bestmöglicher zusätzlicher Sicherungsanstoß. Auf dem iPad stehen die verschlüsselte In-App-Historie sowie manuelles Exportieren/Teilen nach „Dateien“ bereit. Zuvor erzeugte Sicherungsdateien können auch nach einer Klientenlöschung noch frühere Inhalte enthalten; ihre Aufbewahrung bzw. Löschung verwaltet die Praxis. Auch eine Festplattensicherung schützt nicht vor Defekt/Verlust des gesamten Geräts; eine getrennte Kopie bleibt sinnvoll.

## Optionale direkte Videosprechstunde

### Einrichtung

1. In Supabase das bisherige `supabase/schema.sql` und zusätzlich **`supabase/video.sql`** ausführen. Die separate Migration ist wiederholbar und verändert keine Akten.
2. In den Realtime-Einstellungen **öffentliche Kanäle deaktivieren**. Die App verwendet ausschließlich private Broadcast-Kanäle mit RLS für den zufälligen Raum. Das Projekt benötigt Realtime-Broadcast-Unterstützung für die `anon`-Rolle; diese Rolle hat nur Zugang zu einem gültigen zufälligen Video-Topic, niemals zu Akten.
3. `VITE_SUPABASE_URL` und den öffentlichen `VITE_SUPABASE_ANON_KEY` konfigurieren. Die Beraterin meldet sich mit ihrem vorhandenen Supabase-Konto an. Der Service-Role-Key gehört niemals ins Frontend. Patienten melden sich nicht an; ihr separater flüchtiger Supabase-Client liest keine gespeicherte Therapiekonto-Sitzung.
4. HTTPS verwenden. Bei eigenem Hosting die CSP-/Permissions-Policy aus `public/_headers` übernehmen (Kamera/Mikrofon nur für die eigene Herkunft). Der Produktionsbuild enthält auch für GitHub Pages eine passende CSP mit `worker-src 'self'` und dem konfigurierten Supabase-HTTPS-/WSS-Host.
5. In einer Klientenakte **Videosprechstunde → Einladungslink erstellen** wählen. Der Link gilt zwei Stunden; höchstens drei aktive Räume je Beraterkonto. Der Link enthält weder Namen noch Klienten-ID. Den vollständigen Link über einen bekannten Kontaktweg weitergeben. Die Sprache richtet sich nach dem Klientenprofil und lässt sich auch auf der Beitrittsseite ändern.
6. Beide Seiten starten Kamera/Mikrofon selbst. Die Beraterin bestätigt den Gast. Vor vertraulicher Kommunikation Identität und Prüfcode über einen vertrauten separaten Kontaktweg vergleichen. Die rechte Hälfte enthält private Notizen, wahlweise die Sitzungsvorbereitung oder eine vorhandene Sitzungsnotiz. Sie werden im eigenen Tresor gespeichert und nicht an den Gesprächspartner übertragen.

### Schutz und Grenzen

Der 256-Bit-Schlüssel steht ausschließlich im **URL-Fragment**, das HTTP-Anfragen nicht an den Host übertragen. Nur in den Browsern werden SDP-/ICE-Signale zusätzlich AES-GCM-verschlüsselt; Raum-ID und Gültigkeitsende bilden den authentifizierten Kontext. Nachrichten werden auf Form, Empfänger, Ablaufzeit und Wiederholung geprüft. Die Anwendung legt serverseitig lediglich zufällige Raum-ID, Besitzer, Ablaufzeit und Sperrstatus ab. Supabase und der Hosting-Anbieter können zusätzlich Verbindungsmetadaten wie IP-Adressen verarbeiten. Medien verwenden die native WebRTC-DTLS-SRTP-Verschlüsselung direkt zwischen den beiden Browsern. Es gibt keine Aufnahme, Transkription, Video-Dateien oder Medien-Übertragung durch Supabase.

**Kein TURN**: Hinter manchen NATs, Firewalls, VPNs und Mobilfunknetzen kommt ohne Relay keine Verbindung zustande. Die App zeigt diesen Fall an, statt kostenpflichtigen Traffic einzuschalten. Ohne STUN sind oft nur lokale Netze oder direkt erreichbare Geräte nutzbar. Optional können eigene oder bewusst ausgewählte STUN-Adressen als `VITE_WEBRTC_STUN_URLS=stun:host.example:3478` (kommagetrennt) gesetzt werden. Sie werden erst nach einem separaten Häkchen im Gespräch verwendet. TURN-Adressen werden verworfen. STUN erhält IP-Metadaten, aber kein Bild/Audio; Auswahl, Rechtsgrundlage und Betreiberprüfung liegen bei der Praxis. Beide Peers können ohnehin die IP des Gegenübers erfahren. Es gibt keinen eingebauten Drittanbieter-STUN-Dienst.

Linkbesitz ist eine Beitrittsberechtigung; ein weitergeleiteter Link ist deshalb vertraulich. Die Bestätigung und der separat verglichene Code ersetzen keine zertifizierte Patientenidentifikation. Das Beenden durch die Beraterin sperrt den Raum; Beitrittsprüfungen erfolgen serverseitig, laufende Gespräche prüfen die Sperre zusätzlich alle 15 Sekunden. Beim Ablauf, Fehler, Sperren der Akte, Seitenwechsel oder Beenden werden Medien-Tracks gestoppt. Unterbrochene Verbindung und Browserrechte können einen erneuten neuen Link erforderlich machen. Abgelaufene Räume werden bei der nächsten Raumerstellung des Besitzers bereinigt.

Es wurden ohne echte Supabase-Konfiguration keine externen Patienteneinladungen erstellt und keine realen Videogespräche getestet. Tests prüfen das Protokoll, Kryptografie, PostgreSQL-RLS sowie den Browserpfad. Ein zusätzlicher Test verwendet zwei echte WebRTC-Verbindungen mit synthetischem Bild/Ton und einem lokalen Ersatz für Supabase-Broadcast. Die verwaltete Cloud-Chromium-Richtlinie `disable_non_proxied_udp` verbietet hier die direkte Medienverbindung; dieser Test prüft unter dieser Richtlinie den Verbindungsabbruch und das Freigeben der Medien-Tracks, ohne die Richtlinie zu umgehen. Auf gewöhnlichen CI-Runnern prüft derselbe Test den erfolgreichen direkten Medienaustausch. Vor produktiver Nutzung ist ein Ende-zu-Ende-Test im eigenen Supabase-Projekt auf beiden Zielgeräten und Netzen erforderlich. Die technische Lösung ist keine KBV-Zertifizierung für abrechenbare Videosprechstunden und kein pauschaler DSGVO-Konformitätsnachweis. Die Praxis muss u.a. Einsatzgebiet, Auftragsverarbeitung, Hostingregion, Einwilligung/Rechtsgrundlage und erforderliche berufsrechtliche Vorgaben prüfen.

## Ausschließlich lokale Diktierfunktion

Neben Sitzungsnotizen, Hausaufgaben und Sitzungsvorbereitung steht **Diktieren**. Die Umsetzung verlangt ausdrücklich:

- sicheren Browserkontext;
- eine native `SpeechRecognition`-Implementierung mit echter `processLocally`-Eigenschaft;
- `SpeechRecognition.available({ langs: ['de-DE' bzw. 'uk-UA'], processLocally: true }) === 'available'`;
- `processLocally = true` unmittelbar vor `start()`.

Die native Sprachprüfung wird ausschließlich nach einem ausdrücklichen Klick auf „Diktieren“ ausgeführt; beim Öffnen einer Akte wird weder ein Spracherkennungsobjekt erzeugt noch ein nativer Sprachdienst abgefragt. Native Browser-Sprachpakete lassen sich nicht über GitHub installieren: Der Browser verwaltet sie selbst. Wenn er ein lokales Paket anbietet, kann es ausdrücklich geladen werden. Browser, die Web Speech nur über externe Anbieter ausführen, bleiben für diese Variante deaktiviert.

Die native Variante ersetzt Zwischenergebnisse direkt im Feld. Manuelle Änderungen beenden sie, statt Text zu überschreiben.

### Eigenes Offline-Paket auf GitHub

Als unabhängige Alternative steht **Offline-Paket DE / UA laden (116 MB)** bereit. Die unveränderten, quantisierten Whisper-tiny-Modelle und ONNX Runtime Web liegen unter `public/speech/whisper-tiny-v1/` direkt im Repository und werden mit GitHub Pages ausgeliefert. Lizenzen, Herkunft, Prüfsummen und die reproduzierbare Aufbereitung stehen in dessen [README](../public/speech/whisper-tiny-v1/README.md). Es werden weder Hugging Face noch ein CDN oder ein Erkennungsserver zur Laufzeit aufgerufen. GitHub-Pages-Kontingente gelten für die einmaligen öffentlichen Downloads.

1. App aktualisieren/neu öffnen, Klientenakte öffnen und das Paket ausdrücklich laden. Bei Abbruch bleiben bereits verifizierte Teile für den nächsten Versuch erhalten; auch unvollständige Downloads lassen sich entfernen. Vorab wird der verfügbare Browserspeicher geprüft, soweit der Browser eine Schätzung liefert. Der App-Start lädt keine Modelldateien.
2. **Offline diktieren** wählen, die Mikrofonfreigabe erteilen und bis zu 20 Sekunden sprechen. **Aufnahme beenden und Text einfügen** beendet das Mikrofon und startet die lokale Erkennung im eigenen Worker. Der Schalter DE / UA bestimmt die Erkennungssprache. Diese Variante fügt den Text nach der Aufnahme ein; die native Variante kann laufende Zwischenergebnisse anzeigen.
3. Den eingefügten Text sorgfältig prüfen. Das kleine Modell macht Fehler, auch bei Namen, Verneinungen und klinischen Begriffen. Es ist kein validiertes medizinisches Transkriptionssystem.

Audio bleibt ausschließlich flüchtig im Arbeitsspeicher und gelangt weder in IndexedDB, Cloud-Sync noch Paket-Cache. Der Worker erlaubt nur GET-Zugriffe auf die eigenen öffentlichen Modell-/WASM-Dateien; kein Audio-Upload und keine entfernte Erkennung. Sprachewechsel, Sperren, Ausblenden, Abbrechen oder Schließen stoppen die Aufnahme und beenden den Worker. Manuelle Eingaben während der Berechnung werden nicht überschrieben. Der gesonderte Cache enthält nur öffentliche Modelle, bleibt bei App-Updates erhalten und kann mit **Offline-Paket entfernen** gelöscht werden. Verdrängt das Betriebssystem den Cache, muss das Paket erneut geladen werden.

Voraussetzungen: HTTPS, Web Worker, WebAssembly SIMD, AudioWorklet, Mikrofonfreigabe und genügend freier Speicher/RAM. Single-Thread-WASM benötigt weder WebGPU noch SharedArrayBuffer oder spezielle COOP/COEP-Header; damit ist auch der GitHub-Pages-Unterpfad unterstützt. Moderne Safari-/iPad-Versionen können diese Standards unterstützen; eine Prüfung auf einem echten Ziel-iPad bleibt nötig. Ältere oder knapp ausgestattete Geräte können langsam sein oder das Modell nicht laden. Die eigentliche Notizeingabe bleibt verfügbar. Eine iOS-Tastatur-Diktierfunktion ist unabhängig von dieser App.

## Betroffene Dateien und Prüfung

- CRDT: `src/lib/crdt.ts`, `merge.ts`, `syncMerge.ts`, `types.ts`, `blobs.ts`, `invoice.ts`, `useVault.ts`, `src/components/SyncConflicts.tsx`.
- Worker: `src/lib/workerTasks.ts`, `src/workers/secure.worker.ts`, PDF-Aufrufe in `invoices.tsx`/`documents.tsx`.
- Sicherungen: `src/lib/directoryBackup.ts`, `useAutoBackup.ts`, `src/components/backup.tsx`.
- Video: `src/lib/videoRoom.ts`, `directCall.ts`, `src/components/VideoConsultation.tsx`, `supabase/video.sql`.
- Diktieren: `src/lib/localSpeech.ts`, `offlineDictation.ts`, `speechPack.ts`, `speechFeatures.ts`, `src/workers/speech.worker.ts`, `src/components/DictationButton.tsx`, `OfflineDictation.tsx`, `public/speech/pcm.worklet.js` und Modellpaket; Einbindung in Sitzung/Profil/Video. Neue Pakete: `onnxruntime-web@1.24.3` (MIT), `fft.js@4.0.4` (MIT).
- Gemeinsame Integration: `App.tsx`, `main.tsx`, `vite.config.ts`, `_headers`, CSS sowie `de.json`/`uk.json`.

Prüfung mit `npm test`, `npm run build`, `npm run test:e2e` und dem separaten Build-/Browsertest für `/Psychologie/`. Neue Tests decken die CRDT-Algebra, Uhrenfehler, Finanzkonflikte, Migration, Löschung, Ordnerrotation/Schreibfehler, strikt lokale Spracherkennung, authentifizierte und ablaufende Signale, Raum-RLS und echte Browser-Worker ab.
