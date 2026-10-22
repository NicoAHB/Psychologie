import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { whisperFeatures, resampleSpeech } from '../src/lib/speechFeatures';
import { captureSpeech, claimDictation } from '../src/lib/offlineDictation';

test('Whisper log-mel features match independent NumPy rfft reference values', () => {
  const audio = Float32Array.from({ length: 16000 }, (_, i) => .1 * Math.sin(2 * Math.PI * 440 * i / 16000));
  const features = whisperFeatures(audio);
  // Independent reference: NumPy 400-point rfft, periodic Hann, Slaney 80-bin bank,
  // centered reflect padding, 30-second zero padding, Whisper log normalization.
  const reference = [[0, .6337937687], [1, .1217862817], [10, -.9112812306], [100, .4832787709], [3000, .6371356909], [12000, .6779947259], [21000, .7736655726], [30000, .9867560113], [33000, .7621106719], [33050, 1.0887187693], [239999, -.9112812306]];
  assert.equal(features.length, 80 * 3000);
  for (const [i, expected] of reference) assert.ok(Math.abs(features[i] - expected) < 1e-5, `${i}: ${features[i]} != ${expected}`);
});
test('resampling accepts device rates, preserves timing, and rejects unbounded input', () => {
  const input = Float32Array.from({ length: 48000 }, () => .25);
  const output = resampleSpeech(input, 48000); assert.equal(output.length, 16000); assert.ok(output.every(x => x === .25));
  assert.throws(() => resampleSpeech(input, NaN)); assert.throws(() => resampleSpeech(new Float32Array(16000 * 22), 16000));
});
test('only one dictation owns the microphone, and releasing twice cannot unlock another owner', () => {
  const a = claimDictation(); assert.throws(claimDictation, /speechOfflineBusy/); a();
  const b = claimDictation(); a(); assert.throws(claimDictation); b(); claimDictation()();
});
test('microphone tracks stop if the device cannot create an audio context', async () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const contextDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext'); let stopped = false;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped = true; } }] }) } } });
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: class { constructor() { throw new Error('Device audio unavailable'); } } });
  try { await assert.rejects(captureSpeech(new AbortController().signal, () => {}), /Device audio unavailable/); assert.equal(stopped, true); }
  finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor); else Reflect.deleteProperty(globalThis, 'navigator');
    if (contextDescriptor) Object.defineProperty(globalThis, 'AudioContext', contextDescriptor); else Reflect.deleteProperty(globalThis, 'AudioContext');
  }
});
test('every committed DE/UA model and WASM asset matches its pinned size and SHA-256', async () => {
  const root = new URL('../public/speech/whisper-tiny-v1/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  for (const file of manifest.files) {
    const bytes = await readFile(new URL(file.name, root)); assert.equal(bytes.length, file.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    assert.ok(file.bytes < 25 * 1024 * 1024, 'Asset parts stay comfortably below GitHub file limits.');
  }
  assert.equal(manifest.meta.is_multilingual, '1'); assert.ok(manifest.meta.all_language_codes.split(',').includes('de')); assert.ok(manifest.meta.all_language_codes.split(',').includes('uk'));
});
