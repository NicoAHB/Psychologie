import type { InvoiceLogo } from './types';

export const INVOICE_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const INVOICE_LOGO_MAX_DIMENSION = 4096;
export const defaultInvoiceLogo = (): InvoiceLogo => ({ enabled: true, source: 'nadiia' });
/** Keep this approved built-in asset stable for existing invoice snapshots. */
export const nadiiaInvoiceLogoUrl = () => new URL('../assets/nadiia-logo-en.png', import.meta.url).href;

export function validateInvoiceLogo(value: unknown): asserts value is InvoiceLogo | undefined {
  if (value === undefined) return;
  if (!value || typeof value !== 'object') throw new Error('invalidBackup');
  const logo = value as Partial<InvoiceLogo>;
  if (typeof logo.enabled !== 'boolean' || !['nadiia', 'custom'].includes(logo.source ?? '')) throw new Error('invalidBackup');
  if (logo.source === 'custom') {
    const file = logo.file;
    if (!file || typeof file.blobId !== 'string' || !file.blobId || file.blobId.length > 240 || typeof file.fileName !== 'string' || !file.fileName || file.fileName.length > 200 || file.mimeType !== 'image/png' || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > INVOICE_LOGO_MAX_BYTES) throw new Error('invalidBackup');
  }
}

/** Read the bounded PNG header before decoding; reject disguised files and pixel bombs. */
export function validateInvoicePng(bytes: Uint8Array): { width: number; height: number } {
  if (!bytes.length || bytes.length > INVOICE_LOGO_MAX_BYTES) throw new Error('invoiceLogoTooLarge');
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || signature.some((value, i) => bytes[i] !== value)) throw new Error('invoiceLogoInvalid');
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (header.getUint32(8) !== 13 || header.getUint32(12) !== 0x49484452) throw new Error('invoiceLogoInvalid');
  const width = header.getUint32(16), height = header.getUint32(20);
  if (!width || !height || width > INVOICE_LOGO_MAX_DIMENSION || height > INVOICE_LOGO_MAX_DIMENSION) throw new Error('invoiceLogoDimensions');
  return { width, height };
}

export interface PendingInvoiceLogo { bytes: Uint8Array<ArrayBuffer>; fileName: string }
export async function readInvoicePng(file: File): Promise<PendingInvoiceLogo> {
  if (file.size > INVOICE_LOGO_MAX_BYTES) throw new Error('invoiceLogoTooLarge');
  if ((file.type && file.type !== 'image/png') || !/\.png$/i.test(file.name)) throw new Error('invoiceLogoInvalid');
  const bytes = new Uint8Array(await file.arrayBuffer()); validateInvoicePng(bytes);
  let bitmap: ImageBitmap | undefined;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('invoiceLogoInvalid'); }
  finally { bitmap?.close(); }
  return { bytes, fileName: file.name.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 190) || 'logo.png' };
}
