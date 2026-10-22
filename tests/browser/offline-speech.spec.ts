import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures';
import { seedWorkflow, workflowData, nav } from './workflow-fixture';
import type { Route } from '@playwright/test';

test('partial speech packages can be cleared and a pending download can be cancelled without touching notes', async ({ page, context }) => {
  test.skip(!!process.env.VITE_BASE_PATH && process.env.VITE_BASE_PATH !== '/', 'Root app fixture.');
  const { data, client } = workflowData(); await seedWorkflow(page, data); await nav(page, 'Klienten');
  await page.locator('.directory-list').getByRole('button', { name: new RegExp(client.name) }).click();
  const manifest = JSON.parse(await readFile(new URL('../../public/speech/whisper-tiny-v1/manifest.json', import.meta.url), 'utf8'));
  const tokenFile = manifest.files.find((file: { name: string }) => file.name === 'tokens.txt');
  await page.evaluate(async file => {
    const url = new URL('/speech/whisper-tiny-v1/tokens.txt', location.origin).href;
    const bytes = await (await fetch(url)).arrayBuffer(), cache = await caches.open('praxisraum-speech:/:whisper-tiny-v1');
    await cache.put(url, new Response(bytes, { headers: { 'x-praxisraum-sha256': file.sha256 } }));
    window.dispatchEvent(new Event('praxisraum-speech-pack'));
  }, tokenFile);
  await expect(page.getByRole('button', { name: 'Offline-Paket entfernen', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Offline-Paket entfernen', exact: true }).first().click();
  expect(await page.evaluate(async () => (await (await caches.open('praxisraum-speech:/:whisper-tiny-v1')).keys()).length)).toBe(0);
  let blocked: Route | undefined;
  await context.route('**/speech/whisper-tiny-v1/encoder-0.bin', route => { blocked = route; });
  const preparation = page.locator('.preparation-card textarea'); await preparation.fill('Diese Notiz bleibt erhalten.');
  await page.getByRole('button', { name: 'Offline-Paket DE / UA laden (116 MB)', exact: true }).first().click();
  await expect.poll(() => !!blocked).toBe(true);
  await page.locator('.dictation-offline').first().getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Offline-Paket DE / UA laden (116 MB)', exact: true }).first()).toBeEnabled();
  await expect(preparation).toHaveValue('Diese Notiz bleibt erhalten.');
  await blocked?.abort().catch(() => {});
});

test('self-hosted DE/UA speech downloads once and recognizes real audio offline with no audio requests', async ({ page, context }) => {
  test.skip(test.info().project.name === 'mobile', 'Run the real model once; responsive dictation controls are covered by the mobile workflow suite.');
  test.skip(!!process.env.VITE_BASE_PATH && process.env.VITE_BASE_PATH !== '/', 'Root app fixture; Pages runtime has a separate smoke test.');
  test.setTimeout(240000);
  const packRequests: string[] = [], writes: string[] = [];
  page.on('request', request => { if (/speech\/whisper-tiny-v1/.test(request.url())) packRequests.push(request.url()); if (request.method() !== 'GET') writes.push(request.url()); });
  const { data, client } = workflowData(); await seedWorkflow(page, data); await nav(page, 'Klienten');
  await page.locator('.directory-list').getByRole('button', { name: new RegExp(client.name) }).click();
  expect(packRequests).toHaveLength(0);
  await page.getByRole('button', { name: 'Offline-Paket DE / UA laden (116 MB)', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Offline diktieren', exact: true }).first()).toBeVisible({ timeout: 60000 });
  expect(packRequests.some(url => url.endsWith('.wasm'))).toBe(true);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })); });
  await context.setOffline(true);
  // The production CSP permits same-origin WASM, no blob workers or remote code.
  const workerPath = await page.evaluate(async () => {
    const cache = await caches.open((await caches.keys()).find(key => key.startsWith('praxisraum:/') && !key.endsWith(':runtime'))!);
    return (await cache.keys()).find(request => /speech\.worker-.*\.js$/.test(request.url))!.url;
  });
  const output: Record<string, string> = {};
  for (const language of ['de', 'uk'] as const) {
    const wav = await readFile(new URL(`../fixtures/speech/${language}.wav`, import.meta.url));
    // Use the same worker as the UI with real, synthetic, non-patient speech.
    output[language] = await page.evaluate(async ({ workerPath, wav, language }) => {
      const worker = new Worker(workerPath, { type: 'module' });
      const call = (message: object) => new Promise<string>((resolve, reject) => {
        worker.onerror = event => reject(new Error(event.message));
        worker.onmessage = event => {
          if (event.data.type === 'error') reject(new Error(event.data.error));
          if (['ready', 'text'].includes(event.data.type)) resolve(event.data.text ?? '');
        };
        worker.postMessage(message);
      });
      try {
        await call({ type: 'prepare' });
        const bytes = Uint8Array.from(atob(wav), c => c.charCodeAt(0)), view = new DataView(bytes.buffer);
        let pos = 12, start = 0, length = 0;
        while (pos + 8 <= bytes.length) {
          const size = view.getUint32(pos + 4, true);
          if (String.fromCharCode(...bytes.subarray(pos, pos + 4)) === 'data') { start = pos + 8; length = size; break; }
          pos += 8 + size + size % 2;
        }
        const pcm = Float32Array.from({ length: length / 2 }, (_, i) => view.getInt16(start + i * 2, true) / 32768);
        return await call({ type: 'transcribe', pcm, rate: 16000, language });
      } finally { worker.terminate(); }
    }, { workerPath, wav: wav.toString('base64'), language });
  }
  expect(output.de).toMatch(/guten morgen/i);
  expect(output.uk).toMatch(/добрий день/i); expect(output.uk).toMatch(/добре/i); expect(output.uk).not.toMatch(/[a-z]{3}/i);
  await test.info().attach('synthetic-offline-transcripts.json', { body: JSON.stringify(output), contentType: 'application/json' });
  // Exercise the actual microphone/worklet/button pipeline with a synthetic stream.
  // No real microphone permission or managed browser policy is changed by this test.
  const deWav = (await readFile(new URL('../fixtures/speech/de.wav', import.meta.url))).toString('base64');
  await page.evaluate(wav => {
    const w = window as unknown as { __fakeSpeech?: { ended: boolean; stream: MediaStream } };
    navigator.mediaDevices.getUserMedia = async options => {
      if (options?.video !== false || !options.audio) throw new Error('Audio only');
      const context = new AudioContext({ sampleRate: 16000 }); await context.resume();
      const destination = context.createMediaStreamDestination(), source = context.createBufferSource();
      source.buffer = await context.decodeAudioData(Uint8Array.from(atob(wav), c => c.charCodeAt(0)).buffer);
      source.connect(destination); w.__fakeSpeech = { stream: destination.stream, ended: false };
      source.onended = () => { if (w.__fakeSpeech) w.__fakeSpeech.ended = true; void context.close(); };
      setTimeout(() => source.start(), 400); return destination.stream;
    };
  }, deWav);
  const preparation = page.locator('.preparation-card textarea');
  await preparation.fill('Vorhandene Notiz.');
  await page.getByRole('button', { name: 'Offline diktieren', exact: true }).first().click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __fakeSpeech?: { ended: boolean } }).__fakeSpeech?.ended), { timeout: 20000 }).toBe(true);
  await page.getByRole('button', { name: 'Aufnahme beenden und Text einfügen', exact: true }).click();
  await expect(preparation).toHaveValue(/Vorhandene Notiz\. .*Morgen/i, { timeout: 60000 });
  expect(await page.evaluate(() => (window as unknown as { __fakeSpeech: { stream: MediaStream } }).__fakeSpeech.stream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  const previous = await preparation.inputValue();
  await page.getByRole('button', { name: 'Offline diktieren', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Aufnahme beenden und Text einfügen', exact: true })).toBeVisible({ timeout: 20000 });
  await page.locator('.dictation-offline').first().getByRole('button', { name: 'Abbrechen', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { __fakeSpeech: { stream: MediaStream } }).__fakeSpeech.stream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  await expect(preparation).toHaveValue(previous);
  await page.getByRole('button', { name: 'Українська', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Диктувати офлайн', exact: true }).first()).toBeVisible();
  // Remove the cached package explicitly; all fields keep their existing data.
  await page.getByRole('button', { name: 'Видалити офлайн-пакет', exact: true }).first().click();
  await expect(page.getByRole('button', { name: /Завантажити офлайн-пакет DE \/ UA/ }).first()).toBeVisible();
  expect(writes).toEqual([]);
});
