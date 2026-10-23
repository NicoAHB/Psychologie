import { readFile } from 'node:fs/promises';
import { expect, type Page } from './fixtures';

/** A three-second generated tone, never a person's recording. No real device API is called. */
export async function fakeMemoCapture(page: Page, format: 'webm' | 'mp4' = 'webm') {
  const bytes = await readFile(new URL(`./assets/memo.${format === 'mp4' ? 'm4a' : 'webm'}`, import.meta.url));
  await page.addInitScript(({ base64, mime }) => {
    const w = window as unknown as { __memo: { calls: number; stopped: number; denial: boolean; oversize: boolean; created: string[]; revoked: string[]; streams: number } };
    const state: typeof w.__memo = w.__memo = { calls: 0, stopped: 0, denial: false, oversize: false, created: [], revoked: [], streams: 0 };
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = value => { const url = create(value); if (value instanceof Blob && value.type.startsWith('audio/')) state.created.push(url); return url; };
    URL.revokeObjectURL = url => { state.revoked.push(url); revoke(url); };
    const devices = navigator.mediaDevices ?? {};
    Object.defineProperty(devices, 'getUserMedia', { configurable: true, value: async () => {
      state.calls++; if (state.denial) throw new DOMException('Synthetic denied permission', 'NotAllowedError');
      state.streams++;
      const track = { stop: () => { state.stopped++; }, kind: 'audio' };
      return { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
    } });
    // Pin the same wrapper on WebKit too: its native getter can return a fresh
    // binding that drops an override installed only on the previous wrapper.
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: devices });
    class FakeMediaRecorder {
      static isTypeSupported(type: string) { return type.split(';')[0] === mime; }
      state = 'inactive'; mimeType = mime;
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null; onerror: (() => void) | null = null;
      start() { this.state = 'recording'; }
      stop() {
        if (this.state === 'inactive') return; this.state = 'inactive';
        setTimeout(() => {
          const bytes = state.oversize ? new Uint8Array(25 * 1024 * 1024 + 1) : Uint8Array.from(atob(base64), c => c.charCodeAt(0));
          this.ondataavailable?.({ data: new Blob([bytes], { type: mime }) }); this.onstop?.();
        }, 0);
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: FakeMediaRecorder });
  }, { base64: bytes.toString('base64'), mime: `audio/${format}` });
}
export const memoState = (page: Page) => page.evaluate(() => (window as unknown as { __memo: { calls: number; stopped: number; created: string[]; revoked: string[] } }).__memo);
export async function recordMemo(page: Page, label: string, summary = '') {
  const recorder = page.getByRole('dialog', { name: 'Sprach-Memo aufnehmen', exact: true });
  await expect(recorder).toBeVisible(); await recorder.getByRole('button', { name: 'Aufnahme starten', exact: true }).click();
  await expect(recorder.getByText('Aufnahme läuft', { exact: false })).toBeVisible();
  await recorder.getByRole('button', { name: 'Aufnahme stoppen', exact: true }).click();
  await expect(recorder.getByRole('button', { name: 'Memo übernehmen', exact: true })).toBeVisible();
  await recorder.getByLabel('Bezeichnung (optional)', { exact: true }).fill(label); await recorder.getByLabel('Kurzfassung', { exact: true }).fill(summary);
  await recorder.getByRole('button', { name: 'Memo übernehmen', exact: true }).click(); await expect(recorder).not.toBeVisible();
}
export async function storedMemoBlobs(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('praxisraum', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    return new Promise<{ id: string; vaultId: string; payload: { iv: string; ciphertext: string } }[]>(resolve => { const r = db.transaction('blobs').objectStore('blobs').getAll(); r.onsuccess = () => { db.close(); resolve(r.result); }; });
  });
}
