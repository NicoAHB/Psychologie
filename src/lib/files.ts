/** Hand a text file to the browser's download mechanism. */
export function downloadText(filename: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through to the legacy path */ }
  try {
    const area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select();
    const ok = document.execCommand('copy'); area.remove(); return ok;
  } catch { return false; }
}
