import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { APPEARANCE_KEY, DEFAULT_APPEARANCE, PASTEL_PALETTES, appearanceVariables, normalizeAppearance, parseAppearance, pastelColor } from '../src/lib/appearance';

test('missing, old and corrupted device preferences safely use readable defaults', () => {
  for (const value of [null, '', '{broken', 'null', '[]', 'false', '{"version":99}']) {
    assert.deepEqual(parseAppearance(value), DEFAULT_APPEARANCE);
  }
  assert.deepEqual(normalizeAppearance({ palette: '__proto__' }), DEFAULT_APPEARANCE);
  assert.deepEqual(normalizeAppearance({ palette: 'constructor' }), DEFAULT_APPEARANCE);
  assert.deepEqual(parseAppearance(JSON.stringify(DEFAULT_APPEARANCE)), DEFAULT_APPEARANCE);
});
test('custom colours remain pastel and numeric controls cannot make text unreadable', () => {
  const p = normalizeAppearance({ palette: 'custom', color1: '#0000ff', color2: 'url(https://example.invalid)', cardTransparency: 100, menuTransparency: -5, intensity: Infinity, glassBlur: 500, backgroundBlur: '9px' });
  assert.equal(p.color1, '#d2d2ff'); assert.equal(p.color2, DEFAULT_APPEARANCE.color2);
  assert.equal(p.cardTransparency, 30); assert.equal(p.menuTransparency, 0); assert.equal(p.glassBlur, 28);
  assert.equal(p.intensity, DEFAULT_APPEARANCE.intensity); assert.equal(p.backgroundBlur, DEFAULT_APPEARANCE.backgroundBlur);
  for (const color of ['#000000', '#ff0000', '#00ff00', '#123456', '#d3e5d9', '#FFFFFF']) {
    const pastel = pastelColor(color, '#ffffff');
    assert.equal(pastelColor(pastel, '#ffffff'), pastel);
    assert.ok([1, 3, 5].every(i => parseInt(pastel.slice(i, i + 2), 16) >= 210));
  }
  assert.equal(appearanceVariables(normalizeAppearance({ palette: 'none' }))['--aurora-strength'], '0');
});
test('stored palettes and glass controls are restored before first paint exactly as in React', () => {
  const script = readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8');
  for (const palette of [...Object.keys(PASTEL_PALETTES), 'none', 'custom', '__proto__', ['sandRose'], {}, null, 17]) {
    const saved = { version: 1, palette, color1: '#000000', color2: '#123456', intensity: 1000, cardTransparency: 21.8, menuTransparency: -99, glassBlur: 7, backgroundBlur: 24 };
    const dataset: Record<string, string> = {}, variables: Record<string, string> = {};
    runInNewContext(script, {
      localStorage: { getItem: (key: string) => key === APPEARANCE_KEY ? JSON.stringify(saved) : 'dark' },
      document: { documentElement: { dataset, style: { setProperty: (key: string, value: string) => { variables[key] = value; } } }, querySelector: () => null },
      window: { matchMedia: () => ({ matches: false }) },
    });
    assert.equal(dataset.theme, 'dark'); assert.equal(dataset.backgroundPalette, normalizeAppearance(saved).palette);
    assert.deepEqual(variables, appearanceVariables(normalizeAppearance(saved)));
  }
  assert.doesNotThrow(() => runInNewContext(script, {
    localStorage: { getItem: () => { throw new Error('Storage blocked'); } },
    document: { documentElement: { dataset: {} }, querySelector: () => null }, window: { matchMedia: () => ({ matches: false }) },
  }));
});

test('font size is bounded, local and consistent in all three device preferences', () => {
  assert.equal(normalizeAppearance({ fontSize: 'huge' }).fontSize, 'normal');
  for (const [fontSize, scale] of [['normal', '1'], ['large', '1.125'], ['extraLarge', '1.25']]) {
    assert.equal(appearanceVariables(normalizeAppearance({ fontSize }))['--text-scale'], scale);
  }
});
