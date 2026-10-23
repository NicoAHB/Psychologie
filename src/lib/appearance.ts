/** Device preferences only. No client data or vault-format changes. */
export const APPEARANCE_KEY = 'praxisraum-appearance';
export const PASTEL_PALETTES = {
  sageBlue: ['#d3e5d9', '#d7e5f7'],
  sandRose: ['#f1e6d4', '#efd9e2'],
  lavenderBlue: ['#e4daf2', '#d4e6f5'],
  peachMint: ['#f4ddd2', '#d7ece8'],
} as const;
export type BackgroundPalette = keyof typeof PASTEL_PALETTES | 'custom' | 'none';
export interface AppearancePreferences {
  version: 1;
  palette: BackgroundPalette;
  color1: string;
  color2: string;
  intensity: number;
  backgroundBlur: number;
  cardTransparency: number;
  menuTransparency: number;
  glassBlur: number;
}
export const DEFAULT_APPEARANCE: Readonly<AppearancePreferences> = Object.freeze({
  version: 1, palette: 'sageBlue', color1: '#d3e5d9', color2: '#d7e5f7',
  intensity: 75, backgroundBlur: 64, cardTransparency: 12, menuTransparency: 12, glassBlur: 16,
});
const bounded = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(min, Math.min(max, value))) : fallback;

/** Even a saturated custom colour stays pastel, preserving text contrast. */
export function pastelColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return fallback;
  const rgb = [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
  const minimum = Math.min(...rgb);
  const mix = minimum < 210 ? (210 - minimum) / (255 - minimum) : 0;
  return '#' + rgb.map(c => Math.round(c + (255 - c) * mix).toString(16).padStart(2, '0')).join('');
}
export function normalizeAppearance(value: unknown): AppearancePreferences {
  const d = DEFAULT_APPEARANCE;
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (v.version !== undefined && v.version !== 1) return { ...d };
  const palette: BackgroundPalette = typeof v.palette === 'string' &&
    (Object.hasOwn(PASTEL_PALETTES, v.palette) || v.palette === 'custom' || v.palette === 'none') ? v.palette as BackgroundPalette : d.palette;
  const colors = palette === 'custom' ? [pastelColor(v.color1, d.color1), pastelColor(v.color2, d.color2)]
    : palette === 'none' ? [d.color1, d.color2] : PASTEL_PALETTES[palette];
  return {
    version: 1, palette, color1: colors[0], color2: colors[1],
    intensity: bounded(v.intensity, d.intensity, 0, 100),
    backgroundBlur: bounded(v.backgroundBlur, d.backgroundBlur, 0, 100),
    cardTransparency: bounded(v.cardTransparency, d.cardTransparency, 0, 30),
    menuTransparency: bounded(v.menuTransparency, d.menuTransparency, 0, 30),
    glassBlur: bounded(v.glassBlur, d.glassBlur, 0, 28),
  };
}
export function parseAppearance(value: string | null): AppearancePreferences {
  try { return normalizeAppearance(value ? JSON.parse(value) : null); } catch { return { ...DEFAULT_APPEARANCE }; }
}
/** Keep the pre-paint implementation in public/theme-init.js in sync (unit-tested). */
export function appearanceVariables(value: AppearancePreferences): Record<string, string> {
  const p = normalizeAppearance(value);
  return {
    '--aurora-color-1': p.color1, '--aurora-color-2': p.color2,
    '--aurora-strength': String(p.palette === 'none' ? 0 : p.intensity / 100),
    '--aurora-blur': `${p.backgroundBlur}px`,
    '--card-alpha': String(1 - p.cardTransparency / 100),
    '--menu-alpha': String(1 - p.menuTransparency / 100),
    '--glass-blur': `${p.glassBlur}px`,
  };
}
