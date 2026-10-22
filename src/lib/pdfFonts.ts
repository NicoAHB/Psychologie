import fontkit from '@pdf-lib/fontkit';
import regularBase from '../assets/DejaVuSans-Base.ttf?url';
import boldBase from '../assets/DejaVuSans-Bold-Base.ttf?url';
import regularFull from '../assets/DejaVuSans.ttf?url';
import boldFull from '../assets/DejaVuSans-Bold.ttf?url';

const pending = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();
function bytes(url: string) {
  let result = pending.get(url);
  if (!result) {
    result = fetch(url).then(async response => {
      if (!response.ok) throw new Error('invoicePdfError');
      return new Uint8Array(await response.arrayBuffer());
    }).catch(error => { pending.delete(url); throw error; });
    pending.set(url, result);
  }
  return result;
}
/** Latin/Cyrillic is available immediately. Other supported scripts and bold are fetched only when needed. */
export async function loadPdfFonts(text: string, withBold = true) {
  const base = await bytes(regularBase); const font = fontkit.create(base);
  const needsFull = [...text].some(character => !/\s|[\x00-\x1f]/.test(character) && !font.hasGlyphForCodePoint(character.codePointAt(0)!));
  const regular = needsFull ? await bytes(regularFull) : base;
  // A first PDF also works offline: the precached regular font supplies the bold face until it has been downloaded.
  const bold = withBold ? await bytes(needsFull ? boldFull : boldBase).catch(() => regular) : regular;
  return { regular, bold };
}
