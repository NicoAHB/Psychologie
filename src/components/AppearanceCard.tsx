import { useId, type CSSProperties } from 'react';
import { Palette, RotateCcw } from 'lucide-react';
import { DEFAULT_APPEARANCE, PASTEL_PALETTES, type AppearancePreferences } from '../lib/appearance';
import { useI18n, type TextKey } from '../lib/i18n';
import { useTheme, type ThemePreference } from '../lib/theme';
import { Field } from './ui';

const paletteKeys = {
  sageBlue: 'pastelSageBlue', sandRose: 'pastelSandRose', lavenderBlue: 'pastelLavenderBlue', peachMint: 'pastelPeachMint',
} as const satisfies Record<keyof typeof PASTEL_PALETTES, TextKey>;

function AppearanceSlider({ label, hint, value, max, unit, onChange }: {
  label: string; hint?: string; value: number; max: number; unit: '%' | 'px'; onChange: (value: number) => void;
}) {
  const id = useId();
  return <div className="appearance-slider">
    <div className="appearance-slider-heading"><label htmlFor={id}>{label}</label><output htmlFor={id}>{value} {unit}</output></div>
    <input id={id} type="range" min={0} max={max} step={1} value={value} aria-describedby={hint ? `${id}-hint` : undefined}
      aria-valuetext={`${value} ${unit}`} onChange={e => onChange(Number(e.target.value))}/>
    {hint && <p id={`${id}-hint`} className="hint">{hint}</p>}
  </div>;
}

export function AppearanceCard() {
  const { t } = useI18n(); const { preference, setPreference, appearance, setAppearance } = useTheme();
  const update = (patch: Partial<AppearancePreferences>) => setAppearance({ ...appearance, ...patch });
  return <section className="card settings-card settings-wide appearance-settings" aria-labelledby="appearance-title">
    <span className="settings-icon tone-blue"><Palette size={24}/></span>
    <h2 id="appearance-title">{t('appearance')}</h2><p>{t('pastelAppearanceHint')}</p>
    <div className="appearance-layout"><div className="appearance-controls">
      <Field label={t('colorScheme')}><select value={preference} onChange={e => setPreference(e.target.value as ThemePreference)}>
        <option value="system">{t('themeSystem')}</option><option value="light">{t('themeLight')}</option><option value="dark">{t('themeDark')}</option>
      </select></Field>
      <fieldset className="appearance-palettes"><legend>{t('pastelBackground')}</legend><div className="appearance-palette-grid">
        {Object.entries(PASTEL_PALETTES).map(([name, colors]) => <label key={name} className={`appearance-palette${appearance.palette === name ? ' is-selected' : ''}`}>
          <input type="radio" name="background-palette" value={name} checked={appearance.palette === name} onChange={() => update({ palette: name as keyof typeof PASTEL_PALETTES })}/>
          <span className="appearance-swatch" style={{ '--swatch-1': colors[0], '--swatch-2': colors[1] } as CSSProperties} aria-hidden="true"/>
          <span>{t(paletteKeys[name as keyof typeof PASTEL_PALETTES])}</span>
        </label>)}
        <label className={`appearance-palette${appearance.palette === 'custom' ? ' is-selected' : ''}`}><input type="radio" name="background-palette" value="custom" checked={appearance.palette === 'custom'} onChange={() => update({ palette: 'custom' })}/><span>{t('pastelCustom')}</span></label>
        <label className={`appearance-palette${appearance.palette === 'none' ? ' is-selected' : ''}`}><input type="radio" name="background-palette" value="none" checked={appearance.palette === 'none'} onChange={() => update({ palette: 'none' })}/><span>{t('pastelNone')}</span></label>
      </div></fieldset>
      {appearance.palette === 'custom' && <><div className="appearance-colors">
        <Field label={t('pastelColor1')}><input type="color" value={appearance.color1} onChange={e => update({ color1: e.target.value })}/></Field>
        <Field label={t('pastelColor2')}><input type="color" value={appearance.color2} onChange={e => update({ color2: e.target.value })}/></Field>
      </div><p className="hint">{t('pastelCustomHint')}</p></>}
      <AppearanceSlider label={t('pastelIntensity')} value={appearance.intensity} max={100} unit="%" onChange={intensity => update({ intensity })}/>
    </div><div className="appearance-controls">
      <h3>{t('pastelGlassTitle')}</h3>
      <AppearanceSlider label={t('pastelCardTransparency')} hint={t('pastelCardHint')} value={appearance.cardTransparency} max={30} unit="%" onChange={cardTransparency => update({ cardTransparency })}/>
      <AppearanceSlider label={t('pastelMenuTransparency')} hint={t('pastelMenuHint')} value={appearance.menuTransparency} max={30} unit="%" onChange={menuTransparency => update({ menuTransparency })}/>
      <AppearanceSlider label={t('pastelGlassBlur')} value={appearance.glassBlur} max={28} unit="px" onChange={glassBlur => update({ glassBlur })}/>
      <details className="appearance-advanced"><summary>{t('pastelAdvanced')}</summary>
        <AppearanceSlider label={t('pastelBackgroundBlur')} value={appearance.backgroundBlur} max={100} unit="px" onChange={backgroundBlur => update({ backgroundBlur })}/>
      </details>
      <p className="hint">{t('pastelReadabilityHint')}</p>
    </div></div>
    <div className="appearance-footer"><p className="hint">{t('pastelSavedHint')}</p>
      <button type="button" className="btn btn-secondary" onClick={() => setAppearance({ ...DEFAULT_APPEARANCE })}><RotateCcw size={16}/>{t('pastelReset')}</button>
    </div><p className="hint">{t('keyboardHint')}</p>
  </section>;
}
