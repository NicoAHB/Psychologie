import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveTracker } from '../src/lib/useSaveStatus';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('save feedback waits for the durable write, timestamps completion and blocks duplicate saves', async () => {
  let now = 100, writes = 0;
  const tracker = new SaveTracker(() => now), pending = deferred();
  const first = tracker.save(() => { writes++; return pending.promise; });
  assert.deepEqual(tracker.getSnapshot(), { saving: true, failed: false });
  assert.equal(await tracker.save(async () => { writes++; }), false);
  now = 200; pending.resolve(); await first;
  assert.deepEqual(tracker.getSnapshot(), { saving: false, failed: false, savedAt: 200 });
  assert.equal(await tracker.save(async () => { writes++; }), false);
  assert.equal(writes, 1);
  tracker.changed();
  assert.equal(tracker.getSnapshot().savedAt, undefined);
  now = 300; await tracker.save(async () => { writes++; });
  assert.equal(tracker.getSnapshot().savedAt, 300);
  assert.equal(writes, 2);
});

test('edits during a pending save are never labelled saved by its later completion', async () => {
  const tracker = new SaveTracker(() => 500), pending = deferred();
  const first = tracker.save(() => pending.promise);
  tracker.changed(); tracker.changed(); // Includes typing and reverting to the prior value.
  pending.resolve(); await first;
  assert.deepEqual(tracker.getSnapshot(), { saving: false, failed: false, savedAt: undefined });
  await tracker.save(async () => {});
  assert.equal(tracker.getSnapshot().savedAt, 500);
});

test('failed persistence stays editable, never timestamps success and allows retry', async () => {
  const tracker = new SaveTracker(() => 600), pending = deferred();
  const write = tracker.save(() => pending.promise);
  pending.reject(new Error('Quota exceeded'));
  await assert.rejects(write, /Quota exceeded/);
  assert.deepEqual(tracker.getSnapshot(), { saving: false, failed: true });
  await tracker.save(async () => {});
  assert.equal(tracker.getSnapshot().failed, false);
  assert.equal(tracker.getSnapshot().savedAt, 600);
});

test('synchronous validation failures release the save lock and editing clears feedback', async () => {
  const tracker = new SaveTracker();
  await assert.rejects(tracker.save(() => { throw new Error('Invalid value'); }), /Invalid value/);
  tracker.changed();
  assert.deepEqual(tracker.getSnapshot(), { saving: false, failed: false });
  assert.equal(await tracker.save(async () => {}), true);
});
