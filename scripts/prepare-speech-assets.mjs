// Reproduce the committed public models. No inference server or Python required.
// Download the source archive from the URL in the accompanying README, then:
// node scripts/prepare-speech-assets.mjs /path/to/sherpa-onnx-whisper-tiny.tar.bz2
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const archive = process.argv[2];
if (!archive) throw new Error('Pass the downloaded sherpa-onnx-whisper-tiny.tar.bz2 path.');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
if (sha256(await readFile(archive)) !== 'c46116994e539aa165266d96b325252728429c12535eb9d8b6a2b10f129e66b1') throw new Error('Unexpected upstream archive SHA-256.');
const root = 'public/speech/whisper-tiny-v1', manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8'));
const temp = await mkdtemp(join(tmpdir(), 'praxisraum-speech-'));
try {
  execFileSync('tar', ['xjf', resolve(archive), '-C', temp]);
  const files = [];
  async function put(name, bytes, kind) { await writeFile(`${root}/${name}`, bytes); files.push({ name, bytes: bytes.length, sha256: sha256(bytes), kind }); }
  for (const kind of ['encoder', 'decoder']) {
    const bytes = await readFile(join(temp, 'sherpa-onnx-whisper-tiny', `tiny-${kind}.int8.onnx`));
    for (let offset = 0, index = 0; offset < bytes.length; offset += 24 * 1024 * 1024, index++) await put(`${kind}-${index}.bin`, bytes.subarray(offset, offset + 24 * 1024 * 1024), kind);
  }
  await put('tokens.txt', await readFile(join(temp, 'sherpa-onnx-whisper-tiny/tiny-tokens.txt')), 'tokens');
  const runtime = JSON.parse(await readFile('node_modules/onnxruntime-web/package.json', 'utf8'));
  if (`onnxruntime-web@${runtime.version}` !== manifest.runtime) throw new Error('Unexpected ONNX Runtime version.');
  for (const suffix of ['mjs', 'wasm']) {
    const name = `ort-wasm-simd-threaded.${suffix}`; await put(name, await readFile(`node_modules/onnxruntime-web/dist/${name}`), suffix);
  }
  if (JSON.stringify(files) !== JSON.stringify(manifest.files)) throw new Error('Reproduced assets differ from the pinned manifest.');
  console.log(`Verified ${files.length} public assets, ${files.reduce((n, file) => n + file.bytes, 0)} bytes.`);
} finally { await rm(temp, { recursive: true, force: true }); }
