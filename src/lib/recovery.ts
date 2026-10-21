// Recovery key: 32 random bytes shown as 52 Crockford-base32 characters plus a 4-character check, in groups of four.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const checkOf = async (bytes: Uint8Array<ArrayBuffer>) => encode(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)).slice(0, 3)).slice(0, 4);
function encode(bytes: Uint8Array): string {
  let bits = 0; let value = 0; let out = '';
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
function decode(text: string): Uint8Array<ArrayBuffer> {
  let bits = 0; let value = 0; const out: number[] = [];
  for (const char of text) { value = (value << 5) | ALPHABET.indexOf(char); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out);
}
export const newRecoveryBytes = () => crypto.getRandomValues(new Uint8Array(32));
export async function formatRecoveryKey(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return (encode(bytes) + await checkOf(bytes)).match(/.{1,4}/g)!.join('-');
}
/** Returns the key bytes, or throws `invalidRecoveryKey` for typos (wrong length, characters or check). */
export async function parseRecoveryKey(input: string): Promise<Uint8Array<ArrayBuffer>> {
  const text = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (text.length !== 56 || [...text].some(char => !ALPHABET.includes(char))) throw new Error('invalidRecoveryKey');
  const bytes = decode(text.slice(0, 52)).slice(0, 32);
  if (bytes.length !== 32 || await checkOf(bytes) !== text.slice(52)) throw new Error('invalidRecoveryKey');
  return bytes;
}
