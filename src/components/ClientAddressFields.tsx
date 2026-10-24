import { useId } from 'react';
import { useI18n } from '../lib/i18n';
import { isGermanAddress, isUkrainianAddress } from '../lib/clientAddress';
import type { ClientPostalAddress } from '../lib/types';
import { Field } from './ui';

export function ClientAddressFields({ value, legacy, onChange }: {
  value: ClientPostalAddress; legacy: boolean;
  onChange: (value: ClientPostalAddress, field: keyof ClientPostalAddress) => void;
}) {
  const { t } = useI18n(), countryList = useId();
  const ukrainian = isUkrainianAddress(value.country);
  const change = (field: keyof ClientPostalAddress, text: string) => onChange({ ...value, [field]: text }, field);
  const postal = <Field label={t('addressPostalCode')} hint={t(ukrainian ? 'addressPostalCodeUaHint' : 'addressPostalCodeHint')}><input value={value.postalCode} inputMode={ukrainian || isGermanAddress(value.country) ? 'numeric' : 'text'} maxLength={16} autoComplete="off" onChange={e => change('postalCode', e.target.value)}/></Field>;
  const city = <Field label={t('addressCity')}><input value={value.city} maxLength={100} autoComplete="off" onChange={e => change('city', e.target.value)}/></Field>;
  const region = <Field label={t('addressRegion')} hint={t('addressRegionHint')}><textarea rows={2} value={value.region} maxLength={160} onChange={e => change('region', e.target.value)}/></Field>;
  return <fieldset className="form-section client-address-fields"><legend>{t('clientAddress')}</legend>
    <Field label={t('addressStreet')} hint={t(ukrainian ? 'addressStreetUaHint' : 'addressStreetHint')}><input value={value.street} maxLength={160} autoComplete="off" onChange={e => change('street', e.target.value)}/></Field>
    <Field label={t('addressAdditional')} hint={legacy ? t('addressLegacyHint') : t('addressAdditionalHint')}><textarea rows={legacy ? 3 : 2} value={value.additional} maxLength={Math.max(1000, value.additional.length)} onChange={e => change('additional', e.target.value)}/></Field>
    {ukrainian ? <>{city}{region}{postal}</> : <>{postal}{city}{(!isGermanAddress(value.country) || !!value.region) && region}</>}
    <Field label={t('addressCountry')} hint={t('addressCountryHint')}><input value={value.country} list={countryList} maxLength={80} autoComplete="off" onChange={e => change('country', e.target.value)}/></Field>
    <datalist id={countryList}><option value={t('addressGermany')}/><option value={t('addressUkraine')}/></datalist>
    {ukrainian && <p className="hint">{t('addressUkraineOrder')}</p>}
  </fieldset>;
}
