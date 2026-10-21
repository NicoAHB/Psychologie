// Passkey unlock through the WebAuthn PRF extension: the authenticator derives a secret that only works after a
// fingerprint, face or PIN check. That secret wraps the vault's data key; nothing secret is stored in the app.
import { fromBase64, toBase64 } from './crypto';

const b64url = (bytes: Uint8Array) => toBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const unb64url = (text: string) => fromBase64(text.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - text.length % 4) % 4));
const asBytes = (buffer: ArrayBuffer | ArrayBufferView) => new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
export const passkeysAvailable = () => typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials;

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };
export interface PasskeyCredential { credentialId: string; prfSalt: string }

export async function createPasskey(): Promise<PasskeyCredential & { secret: Uint8Array<ArrayBuffer> }> {
  const prfSalt = crypto.getRandomValues(new Uint8Array(32));
  const credential = await navigator.credentials.create({ publicKey: {
    rp: { name: 'Praxisraum', id: location.hostname }, user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'praxisraum', displayName: 'Praxisraum' },
    challenge: crypto.getRandomValues(new Uint8Array(32)), pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' }, timeout: 120000,
    extensions: { prf: { eval: { first: prfSalt } } } as AuthenticationExtensionsClientInputs,
  } }) as PublicKeyCredential | null;
  if (!credential) throw new Error('passkeyFailed');
  const extension = credential.getClientExtensionResults() as PrfResults;
  if (!extension.prf?.enabled) throw new Error('passkeyUnsupported');
  const result: PasskeyCredential = { credentialId: b64url(asBytes(credential.rawId)), prfSalt: toBase64(prfSalt) };
  // Some authenticators only reveal the secret on a later assertion.
  const first = extension.prf.results?.first;
  const secret = first ? asBytes(first) : (await unlockWithPasskey([result])).secret;
  return { ...result, secret };
}
export async function unlockWithPasskey(candidates: PasskeyCredential[]): Promise<{ credentialId: string; secret: Uint8Array<ArrayBuffer> }> {
  const evalByCredential = Object.fromEntries(candidates.map(c => [c.credentialId, { first: fromBase64(c.prfSalt) }]));
  const assertion = await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: location.hostname, userVerification: 'required', timeout: 120000,
    allowCredentials: candidates.map(c => ({ type: 'public-key' as const, id: unb64url(c.credentialId) })),
    extensions: { prf: { evalByCredential } } as AuthenticationExtensionsClientInputs,
  } }) as PublicKeyCredential | null;
  const first = (assertion?.getClientExtensionResults() as PrfResults | undefined)?.prf?.results?.first;
  if (!assertion || !first) throw new Error('passkeyUnsupported');
  return { credentialId: b64url(asBytes(assertion.rawId)), secret: asBytes(first) };
}
