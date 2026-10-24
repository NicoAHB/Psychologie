import type { Dispatch, SetStateAction } from 'react';
import { ChevronRight, Plus, Search, Users } from 'lucide-react';
import { clientStatus } from '../lib/clientStatus';
import { dateLabel } from '../lib/dates';
import { useI18n } from '../lib/i18n';
import type { Client, ClientStatus } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Avatar, Empty, Field, PageHeading } from '../components/ui';
import { ClientProfile, type ProfileTab, type ProfileActions } from '../components/client-profile';
interface Props {
  vault: VaultController; selected?: Client; search: string; setSearch: (value: string) => void;
  clientFilter: ClientStatus | 'all'; setClientFilter: (value: ClientStatus | 'all') => void;
  clientLimit: number; setClientLimit: Dispatch<SetStateAction<number>>;
  documentFocusId?: string; memoFocusId?: string; onMemoFocusHandled: () => void;
  profileTab: ProfileTab; setProfileTab: (tab: ProfileTab) => void; tag: string; setTag: (tag: string) => void;
  onNewClient: () => void; onSelect: (id: string) => void; actions?: ProfileActions;
}
export function ClientsPage({ vault, selected, search, setSearch, clientFilter, setClientFilter, clientLimit, setClientLimit, documentFocusId, memoFocusId, onMemoFocusHandled, profileTab, setProfileTab, tag, setTag, onNewClient, onSelect, actions }: Props) {
  const { t, language } = useI18n(); const data = vault.data!;
  const matchingClients = data.clients.filter(c => (clientFilter === 'all' || clientStatus(c) === clientFilter) && c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <><PageHeading title={selected ? selected.name : t('clients')} subtitle={selected ? `${t('clientSince')} ${dateLabel(selected.createdAt.slice(0, 10), language, { month: 'long', year: 'numeric' })}` : t('yourClients')} action={<button className={`btn ${selected ? 'btn-secondary' : 'btn-primary'}`} onClick={onNewClient}><Plus size={18}/>{t('newClient')}</button>}/><div className={`clients-layout ${selected ? 'has-selected' : ''}`}><section className="card client-directory"><label className="search-field"><Search size={18}/><input aria-label={t('search')} placeholder={t('searchClients')} value={search} onChange={e => setSearch(e.target.value)}/></label><div className="directory-filter"><Field label={t('clientStatusFilter')}><select value={clientFilter} onChange={e => { setClientFilter(e.target.value as ClientStatus | 'all'); setClientLimit(50); }}>{(['active', 'paused', 'closed', 'all'] as const).map(value => <option key={value} value={value}>{t(value === 'all' ? 'allClients' : `clientStatus_${value}`)}</option>)}</select></Field></div><div className="directory-list">{matchingClients.slice(0, clientLimit).map(c => <button className={`client-summary ${selected?.id === c.id ? 'selected' : ''}`} key={c.id} onClick={() => onSelect(c.id)}><Avatar client={c} vault={vault}/><span><strong>{c.name}</strong><small>{t(`clientStatus_${clientStatus(c)}`)} · {c.language === 'uk' ? 'UA' : 'DE'} · {data.sessions.filter(s => s.clientId === c.id).length} {t('sessions')}</small></span><ChevronRight size={16}/></button>)}{!matchingClients.length && <p className="hint p-4">{t('noResults')}</p>}</div>{matchingClients.length > clientLimit && <button className="text-link" onClick={() => setClientLimit(n => n + 50)}>{t('followUpShowMore')}</button>}</section>
        {selected && actions ? <ClientProfile key={selected.id} vault={vault} client={selected} focusDocumentId={documentFocusId} focusMemoId={memoFocusId} onMemoFocusHandled={onMemoFocusHandled} tab={profileTab} setTab={setProfileTab} tag={tag} setTag={setTag} actions={actions}/> : <section className="card directory-empty"><Empty icon={<Users size={32}/>} title={data.clients.length ? t('openProfile') : t('noClients')} text={t('noClientsText')} action={<button className="btn btn-secondary" onClick={onNewClient}><Plus size={17}/>{t('newClient')}</button>}/></section>}
      </div></>;
}
