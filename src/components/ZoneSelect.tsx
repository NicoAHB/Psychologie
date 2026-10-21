import { useState } from 'react';
import { useI18n } from '../lib/i18n';
import { COMMON_ZONES, isValidZone, utcOffset, zoneCity } from '../lib/zones';
import { Field } from './ui';

/** Time-zone picker: the usual European zones by city name, plus any IANA zone for clients elsewhere. */
export function ZoneSelect({ label, value, onChange, hint }: { label: string; value: string; onChange: (zone: string) => void; hint?: string }) {
  const { t, language } = useI18n(); const [custom, setCustom] = useState(!COMMON_ZONES.includes(value));
  const now = Date.now();
  const all: string[] = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return <div className="zone-select"><Field label={label} hint={hint}><select value={custom ? '__other' : value} onChange={e => { if (e.target.value === '__other') setCustom(true); else { setCustom(false); onChange(e.target.value); } }}>
    {COMMON_ZONES.map(zone => <option key={zone} value={zone}>{zoneCity(zone, language)} ({utcOffset(zone, now)})</option>)}<option value="__other">{t('zoneOther')}</option></select></Field>
    {custom && <Field label={t('zoneCustom')}><input list="all-zones" value={value} maxLength={60} placeholder="America/New_York" aria-invalid={!isValidZone(value)} onChange={e => onChange(e.target.value.trim())}/></Field>}
    {custom && <datalist id="all-zones">{all.map(zone => <option key={zone} value={zone}/>)}</datalist>}</div>;
}
