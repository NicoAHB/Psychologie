import { env, InferenceSession, Tensor } from 'onnxruntime-web/wasm';
import { installSpeechPack, readSpeechAsset, speechAsset, speechPack } from '../lib/speechPack';
import { resampleSpeech, whisperFeatures } from '../lib/speechFeatures';

const scope = self as unknown as { onmessage: ((event: MessageEvent) => void) | null; postMessage(value: unknown): void };
// Defense against accidental remote fallback in future runtime changes: this worker
// can only fetch the app's own public model/runtime files, using GET without credentials.
const fetchLocal = self.fetch.bind(self), modelRoot = speechAsset('');
self.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : String(input), self.location.href);
  if (!url.href.startsWith(modelRoot) || (options?.method ?? (input instanceof Request ? input.method : 'GET')) !== 'GET') return Promise.reject(new Error('speechOfflineError'));
  return fetchLocal(input, { ...options, credentials: 'omit', redirect: 'error' });
};
// Single-thread WASM also works without SharedArrayBuffer / COOP / COEP (GitHub Pages).
env.wasm.numThreads = 1; env.wasm.proxy = false;
env.wasm.wasmPaths = { mjs: speechAsset('ort-wasm-simd-threaded.mjs'), wasm: speechAsset('ort-wasm-simd-threaded.wasm') };
env.logLevel = 'fatal';
let encoder: InferenceSession | undefined, decoder: InferenceSession | undefined, tokens: Uint8Array[] = [];
const meta = speechPack.meta;
async function prepare() {
  encoder = await InferenceSession.create(await readSpeechAsset('encoder'), { executionProviders: ['wasm'], enableCpuMemArena: false, enableMemPattern: false });
  decoder = await InferenceSession.create(await readSpeechAsset('decoder'), { executionProviders: ['wasm'], enableCpuMemArena: false, enableMemPattern: false });
  const table = new TextDecoder().decode(await readSpeechAsset('tokens'));
  for (const line of table.trim().split('\n')) {
    const [base64, id] = line.trim().split(/\s+/);
    // The upstream vocabulary stores control tokens literally; only text tokens are base64 bytes.
    if (Number(id) < Number(meta.eot)) tokens[Number(id)] = base64 === '=' ? new Uint8Array(0) : Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  }
}
async function transcribe(pcm: Float32Array, rate: number, language: 'de' | 'uk') {
  if (!encoder || !decoder || !['de', 'uk'].includes(language)) throw new Error('speechOfflineError');
  const audio = resampleSpeech(pcm, rate);
  let energy = 0; for (const sample of audio) { if (!Number.isFinite(sample)) throw new Error('speechOfflineError'); energy += sample * sample; }
  if (audio.length < 1600 || Math.sqrt(energy / audio.length) < .003) return '';
  const cross = await encoder.run({ mel: new Tensor('float32', whisperFeatures(audio), [1, 80, 3000]) });
  const cacheShape = [4, 1, 448, 384], cacheSize = cacheShape.reduce((a, b) => a * b, 1);
  let k: Tensor = new Tensor('float32', new Float32Array(cacheSize), cacheShape), v: Tensor = new Tensor('float32', new Float32Array(cacheSize), cacheShape);
  const languages = meta.all_language_codes.split(','), languageTokens = meta.all_language_tokens.split(',').map(Number);
  let input = [Number(meta.sot), languageTokens[languages.indexOf(language)], Number(meta.transcribe), Number(meta.no_timestamps)], offset = 0;
  const result: number[] = [], suppressed = new Set(meta.non_speech_tokens.split(',').map(Number));
  for (let step = 0; step < 192; step++) {
    const output = await decoder.run({ tokens: new Tensor('int64', BigInt64Array.from(input, BigInt), [1, input.length]),
      in_n_layer_self_k_cache: k, in_n_layer_self_v_cache: v, n_layer_cross_k: cross.n_layer_cross_k, n_layer_cross_v: cross.n_layer_cross_v,
      offset: new Tensor('int64', BigInt64Array.of(BigInt(offset)), [1]) });
    k = output.out_n_layer_self_k_cache; v = output.out_n_layer_self_v_cache; offset += input.length;
    const logits = output.logits.data as Float32Array, vocab = Number(meta.n_vocab), start = logits.length - vocab;
    let best = -Infinity, id = Number(meta.eot);
    // Transcribe text in the selected language; exclude timestamps and control tokens.
    for (let i = 0; i <= Number(meta.eot); i++) {
      if (suppressed.has(i) || (step === 0 && (i === Number(meta.blank_id) || i === Number(meta.eot)))) continue;
      if (logits[start + i] > best) { best = logits[start + i]; id = i; }
    }
    if (id === Number(meta.eot)) break;
    result.push(id); input = [id];
    if (step % 8 === 0) scope.postMessage({ type: 'working' });
    if (step === 191) throw new Error('speechOfflineLong'); // Never silently insert truncated text.
  }
  const bytes = new Uint8Array(result.reduce((n, id) => n + (tokens[id]?.length ?? 0), 0)); let at = 0;
  for (const id of result) { if (tokens[id]) { bytes.set(tokens[id], at); at += tokens[id].length; } }
  return new TextDecoder().decode(bytes).trim();
}
let running = false;
scope.onmessage = async event => {
  if (running) return; running = true;
  try {
    if (event.data.type === 'install') { await installSpeechPack(percent => scope.postMessage({ type: 'progress', percent })); scope.postMessage({ type: 'installed' }); }
    else if (event.data.type === 'prepare') { await prepare(); scope.postMessage({ type: 'ready' }); }
    else if (event.data.type === 'transcribe') scope.postMessage({ type: 'text', text: await transcribe(event.data.pcm, event.data.rate, event.data.language) });
  } catch (error) { scope.postMessage({ type: 'error', error: error instanceof DOMException && error.name === 'QuotaExceededError' ? 'speechOfflineSpace' : error instanceof Error && ['speechOfflineMissing', 'speechOfflineLong', 'speechOfflineSpace'].includes(error.message) ? error.message : 'speechOfflineError' }); }
  finally { running = false; }
};
