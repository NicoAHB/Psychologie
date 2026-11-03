import { translate, type TextKey } from './i18n';
import type { Language } from './types';
import type { SettingsSection } from './practiceFlow';
import { fold } from './search';
export const settingsGroups = ['practice','communication','appearance','data'] as const;
export type SettingsGroup = typeof settingsGroups[number] | 'all';
export const settingsGroupLabels: Record<SettingsGroup,TextKey> = { practice:'settingsGroupPractice',communication:'settingsGroupCommunication',appearance:'appearance',data:'settingsGroupData',all:'settingsAllGroups' };
export const settingsCards = [
  {id:'practice',group:'practice',title:'practiceProfile',keywords:'settingsSearchPractice'},
  {id:'fees',group:'practice',title:'cancellationFeeSettings',keywords:'settingsSearchFees'},
  {id:'templates',group:'practice',title:'templates',keywords:'settingsSearchTemplates'},
  {id:'memoLabels',group:'practice',title:'memoLabelsManage',keywords:'settingsSearchMemos'},
  {id:'email',group:'communication',title:'emailSetupTitle',keywords:'settingsSearchEmail'},
  {id:'reminders',group:'communication',title:'remindersTitle',keywords:'settingsSearchReminders'},
  {id:'appearance',group:'appearance',title:'appearance',keywords:'settingsSearchAppearance'},
  {id:'backup',group:'data',title:'securityTitle',keywords:'settingsSearchBackup'},
  {id:'storage',group:'data',title:'storageHealthTitle',keywords:'settingsSearchStorage'},
  {id:'security',group:'data',title:'securityAccess',keywords:'settingsSearchSecurity'},
  {id:'cloud',group:'data',title:'cloudTitle',keywords:'settingsSearchCloud'},
  {id:'history',group:'data',title:'history',keywords:'settingsSearchHistory'},
  {id:'version',group:'data',title:'appVersionTitle',keywords:'settingsSearchVersion'},
] as const satisfies readonly {id:string;group:SettingsGroup;title:TextKey;keywords:TextKey}[];
export type SettingsCardId = typeof settingsCards[number]['id'];
export function findSettings(query:string,language:Language,group:SettingsGroup) {
  const words=fold(query).folded.split(/\s+/).filter(Boolean);
  return settingsCards.filter(card => words.length ? words.every(word=>fold(`${translate(language,card.title)} ${translate(language,card.keywords)}`).folded.includes(word)) : group==='all'||card.group===group);
}
export function settingsGroupFor(section:SettingsSection):SettingsGroup { return settingsCards.find(card=>card.id===(section==='banks'?'practice':section))?.group??'practice'; }
