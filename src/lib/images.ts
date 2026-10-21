export async function compressImage(file: File, avatar = false): Promise<Uint8Array<ArrayBuffer>> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) throw new Error('invalidImage');
  const image = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => { throw new Error('invalidImage'); });
  try {
    const maxSize = avatar ? 256 : 2000; // handwriting needs more pixels than a snapshot
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('invalidImage');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('invalidImage')), 'image/webp', avatar ? 0.8 : 0.85));
    return new Uint8Array(await blob.arrayBuffer());
  } finally { image.close(); }
}
