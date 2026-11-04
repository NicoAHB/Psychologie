import { useDeferredValue, useMemo, type Dispatch, type SetStateAction } from 'react';
import { ChevronRight, Plus, Search, Users } from 'lucide-react';
import { clientStatus } from '../lib/clientStatus';
import { indexClientDirectory, findDirectoryClients } from '../lib/clientDirectory';
import { dateLabel } from '../lib/dates';
import { useI18n } from '../lib/i18n';
import type { Client, ClientStatus } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Avatar, Empty, Field, PageHeading } from '../components/ui';
import { ClientProfile, type ProfileTab, type ProfileActions } from '../components/client-profile';
interface Props {
  conversation?: boolean; onConversation?: () => void;
  vault: VaultController; selected?: Client; search: string; setSearch: (value: string) => void;
  clientFilter: ClientStatus | 'all'; setClientFilter: (value: ClientStatus | 'all') => void;
  clientLimit: number; setClientLimit: Dispatch<SetStateAction<number>>;
  homeworkFocusId?: string; documentFocusId?: string; memoFocusId?: string; onMemoFocusHandled: () => void;
  profileTab: ProfileTab; setProfileTab: (tab: ProfileTab) => void; tag: string; setTag: (tag: string) => void;
  onNewClient: () => void; onSelect: (id: string) => void; actions?: ProfileActions;
}
export function ClientsPage({ conversation, onConversation, vault, selected, search, setSearch, clientFilter, setClientFilter, clientLimit, setClientLimit, homeworkFocusId, documentFocusId, memoFocusId, onMemoFocusHandled, profileTab, setProfileTab, tag, setTag, onNewClient, onSelect, actions }: Props) {
  const { t, language } = useI18n(); const data = vault.data!;
  const deferredSearch=useDeferredValue(search),busy=search!==deferredSearch;
  const index=useMemo(()=>indexClientDirectory(data.clients),[data.clients]);
  const {visible:matchingClients,otherCount}=useMemo(()=>findDirectoryClients(index,deferredSearch,clientFilter),[index,deferredSearch,clientFilter]);
  const sessionCounts=useMemo(()=>{const counts=new Map<string,number>();for(const session of data.sessions)counts.set(session.clientId,(counts.get(session.clientId)??0)+1);return counts;},[data.sessions]);
  function reset(){setSearch('');setClientFilter('active');setClientLimit(50);}
  return <><div hidden={conversation}><PageHeading title={selected ? selected.name : t('clients')} subtitle={selected ? `${t('clientSince')} ${dateLabel(selected.createdAt.slice(0, 10), language, { month: 'long', year: 'numeric' })}` : t('yourClients')} action={<button className={`btn ${selected ? 'btn-secondary' : 'btn-primary'}`} onClick={onNewClient}><Plus size={18}/>{t('newClient')}</button>}/></div>
    <div className={`clients-layout ${selected ? 'has-selected' : ''}`}>
      <section hidden={conversation} className="card client-directory">
        <label className="search-field"><Search size={18}/><input type="search" aria-label={t('search')} placeholder={t('searchClients')} value={search} onChange={e=>{setSearch(e.target.value);setClientLimit(50);}}/></label>
        <div className="directory-filter"><Field label={t('clientStatusFilter')}><select value={clientFilter} onChange={e=>{setClientFilter(e.target.value as ClientStatus|'all');setClientLimit(50);}}>{(['active','paused','closed','all'] as const).map(value=><option key={value} value={value}>{t(value==='all'?'allClients':`clientStatus_${value}`)}</option>)}</select></Field></div>
        <div className="directory-results" aria-busy={busy}><p className="hint" role="status">{t('clientDirectoryResults').replace('{count}',String(matchingClients.length))}</p>{(search||clientFilter!=='active')&&<button type="button" className="text-link" onClick={reset}>{t('clientDirectoryReset')}</button>}</div>
        {otherCount>0&&<div className="directory-other-matches" role="status"><p>{t('clientDirectoryHidden').replace('{count}',String(otherCount))}</p><button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>{setClientFilter('all');setClientLimit(50);}}>{t('clientDirectoryShowAll')}</button></div>}
        <div className="directory-list" aria-busy={busy}>{matchingClients.slice(0,clientLimit).map(c=><button type="button" disabled={busy} className={`client-summary ${selected?.id===c.id?'selected':''}`} key={c.id} onClick={()=>onSelect(c.id)}><Avatar client={c} vault={vault}/><span><strong>{c.name}</strong><small>{t(`clientStatus_${clientStatus(c)}`)} · {c.language==='uk'?'UA':'DE'} · {sessionCounts.get(c.id)??0} {t('sessions')}</small></span><ChevronRight size={16}/></button>)}{!matchingClients.length&&<p className="hint p-4">{t(otherCount?'clientDirectoryNoCurrent':'noResults')}</p>}</div>
        {matchingClients.length>clientLimit&&<button type="button" className="text-link" onClick={()=>setClientLimit(n=>n+50)}>{t('followUpShowMore')}</button>}
      </section>
        {selected && actions ? <ClientProfile focusHomeworkId={homeworkFocusId} conversation={conversation} onConversation={onConversation} key={selected.id} vault={vault} client={selected} focusDocumentId={documentFocusId} focusMemoId={memoFocusId} onMemoFocusHandled={onMemoFocusHandled} tab={profileTab} setTab={setProfileTab} tag={tag} setTag={setTag} actions={actions}/> : <section className="card directory-empty"><Empty icon={<Users size={32}/>} title={data.clients.length ? t('openProfile') : t('noClients')} text={t(data.clients.length?'clientDirectoryChoose':'noClientsText')} action={data.clients.length?undefined:<button className="btn btn-secondary" onClick={onNewClient}><Plus size={17}/>{t('newClient')}</button>}/></section>}
      </div></>;
}
