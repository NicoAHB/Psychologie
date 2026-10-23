// Run before the first paint; an external script also respects the app's CSP.
(() => {
  let preference = 'system';
  try {
    const saved = localStorage.getItem('praxisraum-theme');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch { /* Appearance remains usable when preference storage is unavailable. */ }
  const dark = preference === 'dark' || preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.themePreference = preference;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c1628' : '#467269');
  // Apply validated device-only appearance preferences before the first paint.
  // Must match src/lib/appearance.ts; tests compare both implementations.
  try {
    const palettes = {
      sageBlue: ['#d3e5d9', '#d7e5f7'], sandRose: ['#f1e6d4', '#efd9e2'],
      lavenderBlue: ['#e4daf2', '#d4e6f5'], peachMint: ['#f4ddd2', '#d7ece8'],
    };
    const saved = JSON.parse(localStorage.getItem('praxisraum-appearance') || 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved) || (saved.version !== undefined && saved.version !== 1)) return;
    const palette = Object.hasOwn(palettes, saved.palette) || saved.palette === 'custom' || saved.palette === 'none' ? saved.palette : 'sageBlue';
    const pastel = (value, fallback) => {
      if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return fallback;
      const rgb = [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
      const min = Math.min(...rgb), mix = min < 210 ? (210 - min) / (255 - min) : 0;
      return '#' + rgb.map(c => Math.round(c + (255 - c) * mix).toString(16).padStart(2, '0')).join('');
    };
    const colors = palette === 'custom' ? [pastel(saved.color1, '#d3e5d9'), pastel(saved.color2, '#d7e5f7')] : palettes[palette] || palettes.sageBlue;
    const bounded = (value, fallback, max) => typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(0, Math.min(max, value))) : fallback;
    const variables = {
      '--aurora-color-1': colors[0], '--aurora-color-2': colors[1],
      '--aurora-strength': String(palette === 'none' ? 0 : bounded(saved.intensity, 75, 100) / 100),
      '--aurora-blur': `${bounded(saved.backgroundBlur, 64, 100)}px`,
      '--card-alpha': String(1 - bounded(saved.cardTransparency, 12, 30) / 100),
      '--menu-alpha': String(1 - bounded(saved.menuTransparency, 12, 30) / 100),
      '--glass-blur': `${bounded(saved.glassBlur, 16, 28)}px`,
    };
    for (const [name, value] of Object.entries(variables)) document.documentElement.style.setProperty(name, value);
    document.documentElement.dataset.backgroundPalette = palette;
  } catch { /* CSS defaults apply when storage is blocked or malformed. */ }
})();
