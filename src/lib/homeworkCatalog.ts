import { translate, type TextKey } from './i18n';
import type { Language, VaultData } from './types';
import { HOMEWORK_CATEGORIES, type HomeworkSnapshot } from './homeworkTypes';

export interface HomeworkChoice { id: string; snapshot: HomeworkSnapshot; own: boolean; archived: boolean; requestedLanguage: boolean }
export const HOMEWORK_CATALOG_VERSION = 'catalog-1';
export function builtinHomework(language: Language): HomeworkChoice[] {
  return Array.from({length:30},(_,index) => {
    const key = `hw${String(index+1).padStart(2,'0')}`, T = (suffix:string) => translate(language,`${key}${suffix}` as TextKey);
    const id=`builtin:${key}`;
    return {id,own:false,archived:false,requestedLanguage:true,snapshot:{templateId:id,version:HOMEWORK_CATALOG_VERSION,category:HOMEWORK_CATEGORIES[Math.floor(index/5)],language,content:{title:T('Title'),goal:T('Goal'),steps:T('Steps'),rhythm:T('Rhythm'),questions:[1,2,3].map(n=>T(`Question${n}`))}}};
  });
}
export function homeworkCatalog(data: VaultData, language: Language, includeArchived=false): HomeworkChoice[] {
  return [...builtinHomework(language),...(data.homeworkTemplates??[]).filter(t=>includeArchived||!t.archived).map(template=>{
    const actual=template.snapshot.content[language]?language:template.snapshot.content.de?'de':'uk';
    return {id:template.id,own:true,archived:!!template.archived,requestedLanguage:actual===language,snapshot:{templateId:template.id,version:template.snapshot.version,category:template.snapshot.category,language:actual,content:structuredClone(template.snapshot.content[actual]!)}};
  })];
}
