import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures';

test('real WebRTC requires approval and either connects directly or fails closed when managed UDP policy blocks it', async ({ browser }, info) => {
  test.skip(info.project.name === 'mobile', 'A single desktop test connects two independent real browser pages.');
  test.setTimeout(60000);
  // Source-module harness: actual production DirectCall, real native WebRTC and synthetic media.
  // Only Supabase transport is replaced by an in-memory same-origin BroadcastChannel.
  const port = Number(process.env.PLAYWRIGHT_PORT || 4173) + 100;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore', env: { ...process.env, VITE_BASE_PATH: '/', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' } });
  const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
  // The managed cloud browser can explicitly forbid non-proxied UDP. Respect that policy;
  // this environment exercises the failure/cleanup path, ordinary CI exercises real media.
  const udpBlocked = await readFile('/etc/chromium/policies/managed/misc.json', 'utf8').then(text => JSON.parse(text).WebRtcIPHandling === 'disable_non_proxied_udp').catch(() => false);
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) { try { ready = (await fetch(`http://127.0.0.1:${port}/`)).ok; } catch { /* booting */ } if (ready) break; await new Promise(r => setTimeout(r, 100)); }
    expect(ready).toBe(true);
    const host = await context.newPage(), guest = await context.newPage(); const id = crypto.randomUUID(); const expiresAt = Date.now() + 120000;
    for (const [page, role] of [[host, 'host'], [guest, 'guest']] as const) {
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.evaluate(async ({ role, id, expiresAt }) => {
        const path = '/src/lib/directCall.ts'; const { DirectCall } = await import(path);
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180; const drawing = canvas.getContext('2d')!;
        let tick = 0; const draw = () => { drawing.fillStyle = tick++ % 2 ? '#467269' : '#213957'; drawing.fillRect(0, 0, 320, 180); }; draw(); const timer = setInterval(draw, 100);
        const local = canvas.captureStream(10), audio = new AudioContext(), oscillator = audio.createOscillator(), destination = audio.createMediaStreamDestination(); oscillator.connect(destination); oscillator.start(); destination.stream.getAudioTracks().forEach(track => local.addTrack(track));
        const state = { status: '', knock: '', remoteTracks: 0, ciphertextOnly: true, approve: (_: string) => {}, stop: () => {}, tracksEnded: () => local.getTracks().every(track => track.readyState === 'ended'), debug: () => ({}) };
        (window as unknown as { __videoTest: typeof state }).__videoTest = state;
        let transport: BroadcastChannel;
        const cloud = { channel(topic: string) {
          transport = new BroadcastChannel(topic); let callback: (message: { payload: unknown }) => void;
          const channel = { on(_type: string, _filter: unknown, cb: typeof callback) { callback = cb; transport.onmessage = event => callback({ payload: event.data }); return channel; }, subscribe(cb: (status: string) => void) { queueMicrotask(() => cb('SUBSCRIBED')); return channel; }, async send(message: { payload: unknown }) { state.ciphertextOnly &&= !/"sdp"|"candidate"|"kind"/.test(JSON.stringify(message.payload)); transport.postMessage(message.payload); return 'ok'; } }; return channel;
        }, async removeChannel() { transport.close(); } };
        const call = new DirectCall({ cloud, room: { id, secret: 'A'.repeat(43), language: 'de', expiresAt }, role, local, iceServers: [],
          onRemote(stream: MediaStream) { state.remoteTracks = stream.getTracks().length; const video = document.createElement('video'); video.muted = true; video.autoplay = true; video.srcObject = stream; document.body.append(video); },
          onStatus(status: string) { state.status = status; }, onKnock(id: string) { state.knock = id; } });
        state.debug = () => ({ status: state.status, remoteTracks: state.remoteTracks, iceState: call.pc?.iceConnectionState, signaling: call.pc?.signalingState, queuedIce: call.pendingIce.length, local: call.pc?.localDescription?.sdp.includes('a=candidate'), remote: call.pc?.remoteDescription?.type });
        state.approve = id => { void call.approve(id); }; state.stop = () => { call.stop(); clearInterval(timer); oscillator.stop(); void audio.close(); }; await call.start();
      }, { role, id, expiresAt });
    }
    type VideoState = { status: string; knock: string; remoteTracks: number; ciphertextOnly: boolean; approve(id: string): void; stop(): void; tracksEnded(): boolean; debug(): unknown };
    await expect.poll(() => host.evaluate(() => (window as unknown as { __videoTest: VideoState }).__videoTest.knock)).not.toBe('');
    expect(await host.evaluate(() => (window as unknown as { __videoTest: VideoState }).__videoTest.remoteTracks)).toBe(0);
    await host.evaluate(() => { const state = (window as unknown as { __videoTest: VideoState }).__videoTest; state.approve(state.knock); });
    if (udpBlocked) {
      info.annotations.push({ type: 'environment', description: 'Managed Chromium forbids direct UDP; validating timeout, no relay fallback and released tracks.' });
      await expect.poll(async () => Promise.all([host, guest].map(p => p.evaluate(() => (window as unknown as { __videoTest: VideoState }).__videoTest.status))), { timeout: 50000 }).toEqual(expect.arrayContaining(['videoNetworkError']));
      for (const page of [host, guest]) {
        await expect.poll(() => page.evaluate(() => (window as unknown as { __videoTest: VideoState }).__videoTest.tracksEnded())).toBe(true);
        expect(await page.evaluate(() => (window as unknown as { __videoTest: VideoState }).__videoTest.ciphertextOnly)).toBe(true);
      }
      return;
    }
    for (const page of [host, guest]) {
      try { await expect.poll(() => page.evaluate(() => (window as unknown as { __videoTest: VideoState }).__videoTest.status), { timeout: 20000 }).toBe('videoConnected'); } catch { throw new Error(JSON.stringify(await Promise.all([host, guest].map(p => p.evaluate(() => (window as unknown as { __videoTest: VideoState }).__videoTest.debug()))))); }
      await expect.poll(() => page.evaluate(() => (window as unknown as { __videoTest: VideoState }).__videoTest.remoteTracks)).toBeGreaterThan(0);
      expect(await page.evaluate(() => (window as unknown as { __videoTest: VideoState }).__videoTest.ciphertextOnly)).toBe(true);
    }
    await host.evaluate(() => (window as unknown as { __videoTest: VideoState }).__videoTest.stop());
    await expect.poll(() => guest.evaluate(() => (window as unknown as { __videoTest: VideoState }).__videoTest.status)).toBe('videoEnded');
    for (const page of [host, guest]) expect(await page.evaluate(() => (window as unknown as { __videoTest: VideoState }).__videoTest.tracksEnded())).toBe(true);
  } finally { await context.close(); server.kill('SIGTERM'); }
});
