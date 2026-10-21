import { useI18n, type TextKey } from './i18n';
import type { VaultData } from './types';

const BUILT_IN: { id: string; name: TextKey; body: TextKey }[] = [
  { id: 'soap', name: 'tplSoapName', body: 'tplSoapBody' }, { id: 'first', name: 'tplFirstName', body: 'tplFirstBody' }, { id: 'progress', name: 'tplProgressName', body: 'tplProgressBody' },
];
export interface TemplateChoice { id: string; name: string; body: string; builtIn: boolean }
/** Built-in templates (in the interface language) followed by the practice's own. */
export function useTemplates(data: VaultData): TemplateChoice[] {
  const { t } = useI18n();
  return [...BUILT_IN.map(b => ({ id: b.id, name: t(b.name), body: t(b.body), builtIn: true })), ...data.templates.map(x => ({ id: x.id, name: x.name, body: x.body, builtIn: false }))];
}
/** Append a template below what is already written, separated by a blank line. */
export const withTemplate = (notes: string, body: string) => notes.trim() ? `${notes.replace(/\s+$/, '')}\n\n${body}` : body;
