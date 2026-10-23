import test from 'node:test';
import assert from 'node:assert/strict';
import { openSharedDocument, parseShareInvitation, randomShareSecret, sealSharedDocument, shareFragment, shareTokenHash, SHARE_MAX_BYTES } from '../src/lib/documentShareCrypto';
import { uid } from '../src/lib/types';

test('document links round-trip only in the fragment and reject malformed or shortened capabilities', () => {
  const invitation = { id: uid(), secret: randomShareSecret(), token: randomShareSecret(), language: 'uk' as const };
  const link = new URL('https://example.test/Psychologie/'); link.hash = shareFragment(invitation);
  assert.equal(link.search, ''); assert.equal(link.pathname, '/Psychologie/'); assert.deepEqual(parseShareInvitation(link.hash), invitation);
  assert.equal(parseShareInvitation('#document=anything'), null); assert.equal(parseShareInvitation(link.hash + '.extra'), null); assert.notEqual(invitation.secret, invitation.token);
});
test('document shares keep name, contents and encryption secret out of the server packet; password and expiry are authenticated', async () => {
  const input = { id: uid(), expiresAt: '2026-10-24T12:00:00.000Z', secret: randomShareSecret(), passphrase: 'Separat mitgeteilte Passphrase', fileName: 'Вправа.txt', mimeType: 'text/plain', bytes: new TextEncoder().encode('Vertrauliche Aufgabe') };
  const packet = await sealSharedDocument(input), serialized = JSON.stringify(packet);
  for (const secret of [input.secret, input.passphrase, input.fileName, 'Vertrauliche Aufgabe']) assert.ok(!serialized.includes(secret));
  const opened = await openSharedDocument({ ...input, packet }); assert.equal(opened.fileName, input.fileName); assert.deepEqual(opened.bytes, input.bytes);
  await assert.rejects(() => openSharedDocument({ ...input, packet, passphrase: 'falsch' })); await assert.rejects(() => openSharedDocument({ ...input, packet, expiresAt: '2026-10-25T12:00:00.000Z' }));
  await assert.rejects(() => openSharedDocument({ ...input, packet, id: uid() })); await assert.rejects(() => openSharedDocument({ ...input, packet, secret: randomShareSecret() }));
  const damaged = { ...packet, ciphertext: packet.ciphertext.slice(0, -4) + 'AAAA' }; await assert.rejects(() => openSharedDocument({ ...input, packet: damaged }));
  assert.equal((await shareTokenHash(randomShareSecret())).length, 64);
});
test('a share without extra password still requires the independent 256-bit link secret; file limits and active content are rejected', async () => {
  const input = { id: uid(), expiresAt: '2026-10-24T12:00:00.000Z', secret: randomShareSecret(), passphrase: '', fileName: 'Aufgabe.txt', mimeType: 'text/plain', bytes: new Uint8Array([1]) };
  const packet = await sealSharedDocument(input); assert.equal(packet.protected, false); assert.deepEqual((await openSharedDocument({ ...input, packet })).bytes, input.bytes);
  await assert.rejects(() => sealSharedDocument({ ...input, bytes: new Uint8Array(SHARE_MAX_BYTES + 1) })); await assert.rejects(() => sealSharedDocument({ ...input, passphrase: '123' })); await assert.rejects(() => sealSharedDocument({ ...input, mimeType: 'text/html' })); await assert.rejects(() => sealSharedDocument({ ...input, fileName: '../anders.txt' }));
});
