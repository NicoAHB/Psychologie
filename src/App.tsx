import { mainNavigation, moreNavigation, isMoreRoute, type AppRoute } from './lib/navigation';
import { completeAndPay, type SettingsSection } from './lib/practiceFlow';
import type { PaymentMethod } from './lib/types';
import { HelpButton } from './components/HelpButton';
import { Today } from './components/Today';
import { Newsletter } from './components/Newsletter';
import { TemplateManager } from './components/TemplateManager';
import { MarketingCampaigns } from './components/MarketingCampaigns';
import { Referrals } from './components/Referrals';
import { useMarketingAutomation } from './lib/useMarketingAutomation';
import { syncMarketingArchive } from './lib/marketingArchive';
import './marketing.css';
import { flushShareRevocations } from './lib/documentShares';
import type { WorkItem } from './lib/workItems';
import type { SessionDraft } from './lib/types';
import { flushBeforeLock } from './lib/autoLock';
import { clientStatus } from './lib/clientStatus';
import type { ClientStatus } from './lib/types';
import { SyncConflicts } from './components/SyncConflicts';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowRight, CheckCheck, ChevronRight, Clock3, Cloud, Download, Leaf, LoaderCircle, LockKeyhole, Menu, FileText, Plus, Search, ShieldCheck, TrendingUp, Users, Wallet, WifiOff, X } from 'lucide-react';
import { LanguageSwitch, useI18n, type TextKey } from './lib/i18n';
import { autoLockMinutes } from './lib/autoLock';
import { ThemeToggle } from './lib/theme';
import { financeRows, type FinanceView, type PaymentFilter } from './lib/finance';
import { useVault, type VaultController } from './lib/useVault';
import { cloudConfigured, cloudError, currentUser, fetchRemote, remoteEnvelope, syncVault } from './lib/cloud';
import { setRevision } from './lib/db';
import { dateLabel, localeFor, money, monthlyIncome } from './lib/dates';
import type { Appointment, Client, Invoice, PhotoNote, Session } from './lib/types';
import { deleteNote } from './lib/records';
import { Avatar, Empty, Field, ImageView, Logo, Modal, Notice, PageHeading, PaymentBadge, SecurityLine } from './components/ui';
import { AppointmentsPage } from './components/appointments';
import { SettingsPage } from './components/settings';
import { isSessionVoided } from './lib/invoice';
import { OverdueInvoiceList } from './components/follow-up';
import { CsvExport, InvoiceForm, InvoiceList, InvoiceView } from './components/invoices';
import { SearchModal } from './components/SearchModal';
import { UpdateBanner } from './components/UpdateBanner';
import { ClientProfile, type ProfileTab } from './components/client-profile';
import { PassphraseReset } from './components/security';
import { useAutoBackup } from './lib/useAutoBackup';
import { backupNeeded, hasRecords, latestChange, markBackup, readBackupState, type BackupState } from './lib/backupState';
import { saveBackupCopy } from './components/backup';
import { AppointmentForm, ClientForm, NoteForm, PaymentForm, SessionForm } from './components/forms';
import { BillingMoney } from './components/money';
import { IncomeChart } from './components/IncomeChart';
import { Welcome } from './components/Welcome';
import { useCloudUser } from './components/CloudAuth';
type Form = { type: 'client'; client?: Client } | { type: 'appointment'; clientId?: string; appointment?: Appointment } | { type: 'session'; clientId?: string; appointment?: Appointment; session?: Session; restored?: SessionDraft } | { type: 'note'; clientId: string } | { type: 'payment'; session: Session };
export default function App() {
  const vault = useVault(); const { t, language } = useI18n(); const user = useCloudUser(!!vault.data);
  const [settingsFocus, setSettingsFocus] = useState<SettingsSection>();
  const [quickMethod, setQuickMethod] = useState<PaymentMethod>('transfer');
  const [quickBusy, setQuickBusy] = useState(false); const [quickNotice, setQuickNotice] = useState<string>(); const [flowError, setFlowError] = useState<TextKey>();
  const [workInvoiceClient, setWorkInvoiceClient] = useState<string>();
  const [financeView, setFinanceView] = useState<FinanceView>('year');
  const [clientFilter, setClientFilter] = useState<ClientStatus | 'all'>('active');
  const [clientLimit, setClientLimit] = useState(50);
  const [marketingOpened,setMarketingOpened]=useState(false),[newsletterTemplate,setNewsletterTemplate]=useState<string>(),[newsletterTab,setNewsletterTab]=useState<'create'|'archive'>('create');
  const [route, setRoute] = useState<AppRoute>('overview'); const [selectedId, setSelectedId] = useState<string>();
  const [form, setForm] = useState<Form>(); const [completedNotice, setCompletedNotice] = useState(false); const [mobileNav, setMobileNav] = useState(false);
  const [online, setOnline] = useState(navigator.onLine); const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<TextKey>(); const [lastSyncedGeneration, setLastSyncedGeneration] = useState(-1);
  const auto = useAutoBackup(vault);
  const marketing=useMarketingAutomation(vault,user??undefined,route==='newsletter'||route==='marketingCampaigns');
  const [backupInfo, setBackupInfo] = useState<BackupState | null>(); // undefined = not read yet, null = no copy yet
  const [followInvoiceId, setFollowInvoiceId] = useState<string>(); const [documentFocusId, setDocumentFocusId] = useState<string>();
  const [profileTab, setProfileTab] = useState<ProfileTab>('overview'); const [searching, setSearching] = useState(false); const [search, setSearch] = useState(''); const [tag, setTag] = useState(''); const [photo, setPhoto] = useState<string>();
  const [memoFocusId, setMemoFocusId] = useState<string>();
  useEffect(() => { if (vault.data && !vault.demo && online && user && vault.envelope) void flushShareRevocations(vault.envelope.vaultId).catch(() => {}); }, [!!vault.data, vault.demo, vault.envelope, online, user]);
  const syncBusy = useRef(false); const syncAlive = useRef(true); const syncRetry = useRef<number | undefined>(undefined);
  useEffect(() => { syncAlive.current = true; return () => { syncAlive.current = false; clearTimeout(syncRetry.current); }; }, []); const currentVault = useRef(vault); currentVault.current = vault;
  const navigate = (next: AppRoute) => { setQuickNotice(undefined); setFlowError(undefined); setSettingsFocus(undefined); setCompletedNotice(false); if(next==='newsletter'){setMarketingOpened(true);setNewsletterTemplate(undefined);setNewsletterTab('create');}setRoute(next); setDocumentFocusId(undefined); setMemoFocusId(undefined); setFinanceView('year'); setMobileNav(false); setSearch(''); setTag(''); };
  const openClient = (id: string) => { setClientFilter('all'); setSelectedId(id); setProfileTab('overview'); navigate('clients'); };
  useEffect(() => {
    const id = vault.envelope?.vaultId; if (!vault.data || vault.demo || !id) { setBackupInfo(undefined); return; }
    const read = () => { void readBackupState(id).then(state => setBackupInfo(state ?? null)).catch(() => {}); };
    read(); window.addEventListener('praxisraum-backup', read); return () => window.removeEventListener('praxisraum-backup', read);
  }, [!!vault.data, vault.demo, vault.envelope?.vaultId]);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && currentVault.current.data) { e.preventDefault(); setSearching(true); } };
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => { const on = () => setOnline(true); const off = () => setOnline(false); window.addEventListener('online', on); window.addEventListener('offline', off); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); }; }, []);
  const doSync = useCallback(async function syncNow() {
    const v = currentVault.current;
    if (!v.data || v.demo || syncBusy.current) return;
    if (!cloudConfigured || !user) { setSyncMessage('cloudMissing'); setRoute('settings'); return; }
    syncBusy.current = true; setSyncing(true); setSyncMessage(undefined);
    let coveredGeneration = v.getGeneration();
    try {
      let snapshot = await v.snapshotForSync(); coveredGeneration = snapshot.generation;
      try { await syncVault(snapshot.envelope, snapshot.data); }
      catch (err) {
        if (cloudError(err) !== 'syncConflict') throw err;
        await v.mergeRemote();
        snapshot = await v.snapshotForSync(); coveredGeneration = snapshot.generation;
        await syncVault(snapshot.envelope, snapshot.data);
      }
      const synced = snapshot.generation; const envelope = snapshot.envelope;
      setLastSyncedGeneration(synced); setSyncMessage('synced');
      const archiveKey=v.getKey();if(archiveKey)try{await syncMarketingArchive(snapshot.data,archiveKey,envelope.vaultId,()=>v.getKey()===archiveKey);}catch{setSyncMessage('marketingIndexPending');} void markBackup(envelope.vaultId, 'cloud').catch(() => {});
    } catch (err) { setSyncMessage(cloudError(err) as TextKey); } finally { syncBusy.current = false; setSyncing(false); if (syncAlive.current && currentVault.current.data?.settings.autoSync && currentVault.current.getGeneration() !== coveredGeneration) syncRetry.current = window.setTimeout(() => void syncNow(), 2500); }
  }, [user]);
  useEffect(() => {
    if (!vault.data?.settings.autoSync || vault.demo || !online || !user || vault.generation === lastSyncedGeneration || syncMessage === 'syncConflict' || syncMessage === 'differentVault') return;
    const timeout = window.setTimeout(() => void doSync(), 2500); return () => clearTimeout(timeout);
  }, [vault.generation, vault.data?.settings.autoSync, vault.demo, online, user, lastSyncedGeneration, doSync]);
  useEffect(() => {
    if (!vault.data) return;
    const warn = (e: BeforeUnloadEvent) => { if (currentVault.current.saving || currentVault.current.storageError) { e.preventDefault(); } };
    let active = Date.now(); let wasLocking = false;
    const check = () => { if (Date.now() - active >= autoLockMinutes(currentVault.current.data?.settings.autoLockMinutes) * 60 * 1000 && !wasLocking) { wasLocking = true; void currentVault.current.lock().catch(() => { wasLocking = false; }); } };
    const touch = () => { check(); if (!wasLocking) active = Date.now(); };
    const visible = () => { if (document.visibilityState === 'visible') check(); };
    const timer = window.setInterval(check, 15000);
    document.addEventListener('visibilitychange', visible); window.addEventListener('pageshow', check);
    window.addEventListener('pointerdown', touch); window.addEventListener('keydown', touch); window.addEventListener('beforeunload', warn);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('pageshow', check); window.removeEventListener('pointerdown', touch); window.removeEventListener('keydown', touch); window.removeEventListener('beforeunload', warn); };
  }, [!!vault.data]);
  // Clear plaintext form drafts and image object URLs when the vault locks.
  useEffect(() => { if (!vault.data) { setQuickNotice(undefined); setFlowError(undefined); setSettingsFocus(undefined); setQuickMethod('transfer'); setMarketingOpened(false);setNewsletterTemplate(undefined);setCompletedNotice(false);setForm(undefined); setPhoto(undefined); setSelectedId(undefined); setSyncMessage(undefined); setLastSyncedGeneration(-1); setFollowInvoiceId(undefined); setWorkInvoiceClient(undefined); setDocumentFocusId(undefined); setMemoFocusId(undefined); setRoute('overview'); } }, [!!vault.data]);
  // Each page names itself in the window/tab title, which also helps screen-reader users and browser history.
  useEffect(() => { document.title = vault.data ? `${t(route)} · Praxisraum` : 'Praxisraum'; }, [vault.data, route, t]);
  if (!vault.data) return <Welcome vault={vault}/>;
  const data = vault.data;
  const matchingClients = data.clients.filter(c => (clientFilter === 'all' || clientStatus(c) === clientFilter) && c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const selected = data.clients.find(c => c.id === selectedId);
  const backupNag = backupInfo === undefined ? { needed: false, days: 0 } : backupNeeded(backupInfo ?? undefined, latestChange(data), hasRecords(data));

  const deleteNoteEntry = (note: PhotoNote) => {
    if (window.confirm(t('deleteNoteConfirm'))) void vault.remove(d => deleteNote(d, note.id)).catch(() => {});
  };
  const quickComplete = async (appointment: Appointment) => {
    if (quickBusy) return; setQuickBusy(true); setFlowError(undefined);
    try { let id = ''; await vault.update(d => { id = completeAndPay(d, appointment.id, quickMethod).id; }); if (currentVault.current.data) setQuickNotice(id); }
    catch (error) { if (currentVault.current.data) setFlowError((error as Error).message === 'quickPaymentDraft' ? 'quickPaymentDraft' : 'quickPaymentUnavailable'); }
    finally { setQuickBusy(false); }
  };
  const quickProps = { quickMethod, onMethod: setQuickMethod, onQuickComplete: (a: Appointment) => void quickComplete(a), quickBusy };
  const markPayment = (session: Session) => {
    if (isSessionVoided(data, session)) return;
    if (!session.paidAt) setForm({ type: 'payment', session });
    else if (window.confirm(t('paymentRemoveConfirm'))) void vault.update(d => { const row = d.sessions.find(s => s.id === session.id)!; row.paidAt = null; delete row.paymentMethod; }).catch(() => {});
  };
  function openWorkItem(item: WorkItem) {
    if (item.kind === 'followUp') openClient(item.clientId);
    else if (item.kind === 'invoice') setWorkInvoiceClient(item.clientId);
    else if (item.kind === 'session') setForm({ type: 'session', session: data.sessions.find(s => s.id === item.id) });
    else if (item.kind === 'appointment') setForm({ type: 'session', appointment: data.appointments.find(a => a.id === item.id) });
    else { const draft = data.sessionDrafts.find(d => d.id === item.id); if (draft) setForm({ type: 'session', restored: draft, clientId: draft.clientId, session: data.sessions.find(s => s.id === draft.originalSessionId), appointment: data.appointments.find(a => a.id === draft.appointmentId) }); }
  }
  return <div className="app-shell"><a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>{t('skipToContent')}</a>{mobileNav && <button className="nav-backdrop" onClick={() => setMobileNav(false)} aria-label={t('close')}/>}
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}><div className="sidebar-brand"><Logo/><button className="icon-btn mobile-only" aria-label={t('close')} onClick={() => setMobileNav(false)}><X size={20}/></button></div><p className="sidebar-tagline">{t('tagline')}</p><span className="nav-eyebrow">{t('workspace')}</span><nav aria-label={t('workspace')}>{mainNavigation.map(item => { const active = item.id === 'more' ? isMoreRoute(route) : route === item.id; return <button className={`nav-item ${active ? 'active' : ''}`} key={item.id} aria-current={active ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={20}/><span>{t(item.id)}</span>{item.id === 'clients' && data.clients.length > 0 && <small aria-hidden="true">{data.clients.length}</small>}</button>; })}</nav><div className="sidebar-bottom"><div className="privacy-card"><ShieldCheck size={23}/><h3>{t('helpTitle')}</h3><p>{t('helpText')}</p><span className="privacy-dot"/></div><div className="practitioner"><span className="practitioner-avatar"><Leaf size={20}/></span><div><strong>{t('workspace')}</strong><small>{t(vault.demo ? 'demoBadge' : 'localOnly')}</small></div><button className="icon-btn" aria-label={t('lock')} title={t('lock')} onClick={() => void vault.lock().catch(() => {})}><LockKeyhole size={18}/></button></div></div></aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-btn mobile-only" aria-label={t('openNav')} onClick={() => setMobileNav(true)}><Menu size={22}/></button><span className="desktop-only">{t('workspace')}</span><ChevronRight className="desktop-only" size={14}/><strong>{t(route)}</strong></div><div className="header-actions"><span className="header-status desktop-only">{online ? <span className="status-dot"/> : <WifiOff size={14}/>} {t(online ? 'localSecure' : 'offline')}</span><button className="icon-btn" aria-label={t('searchEverything')} title={`${t('searchEverything')} (Ctrl+K)`} onClick={() => setSearching(true)}><Search size={19}/></button><ThemeToggle/><LanguageSwitch/><button className="icon-btn" aria-label={t('lock')} title={t('lock')} onClick={() => void vault.lock().catch(() => {})}><LockKeyhole size={18}/></button></div></header>
      <main className="page-content" id="main-content" tabIndex={-1}><UpdateBanner beforeApply={async () => { await flushBeforeLock(); await vault.flush(); }}/><SyncConflicts vault={vault}/>{vault.demo && <Notice>{t('demoNotice')}</Notice>}{route === 'overview' && !vault.demo && backupNag.needed && <Notice error>{t(backupInfo ? 'backupBannerOld' : 'backupBannerNever').replace('{days}', String(backupNag.days))}<button className="text-link" onClick={() => void saveBackupCopy(vault, typeof navigator.canShare === 'function').catch(() => {})}>{t('backupNow')}</button></Notice>}{vault.storageError && <Notice error>{t('storageError')}<button className="text-link" onClick={() => void vault.retry().catch(() => {})}>{t('retry')}</button></Notice>}{syncMessage && syncMessage !== 'synced' && <Notice error>{t(syncMessage)}</Notice>}
      {flowError && <Notice error>{t(flowError)}</Notice>}
      {quickNotice && <Notice><span>{t('quickPaymentSaved')}</span><button className="text-link" onClick={() => { const session = data.sessions.find(s => s.id === quickNotice); if (session) setForm({ type: 'session', session }); }}>{t('workDocument')}</button><button className="icon-btn" aria-label={t('close')} onClick={() => setQuickNotice(undefined)}><X size={18}/></button></Notice>}
      {completedNotice && <Notice><span>{t('appointmentCompletedOpen')}</span><button className="text-link" onClick={() => { navigate('finances'); setCompletedNotice(false); }}>{t('goToPayments')}</button><button className="icon-btn" aria-label={t('close')} onClick={() => setCompletedNotice(false)}><X size={18}/></button></Notice>}
      {isMoreRoute(route) && route !== 'more' && <button className="btn btn-ghost back-to-more" onClick={() => navigate('more')}>{t('backToMore')}</button>}
      {route === 'more' && <><PageHeading title={t('more')} subtitle={t('moreSubtitle')}/><nav className="more-navigation" aria-label={t('more')}>{moreNavigation.map(item => <button key={item.id} className="card more-item" aria-label={t(item.id)} aria-describedby={`more-${item.id}-hint`} onClick={() => navigate(item.id)}><item.icon size={24}/><span><strong>{t(item.id)}</strong><small id={`more-${item.id}-hint`}>{t(item.description)}</small></span><ChevronRight size={20}/></button>)}</nav></>}
      {route === 'overview' && <Today vault={vault} {...quickProps} backup={backupInfo} onSetup={section => { navigate('settings'); setSettingsFocus(section); }}
        onNewAppointment={() => setForm(data.clients.length ? { type: 'appointment' } : { type: 'client' })}
        onNewClient={() => setForm({ type: 'client' })} onClient={openClient}
        onClients={() => { setSelectedId(undefined); setClientFilter('active'); navigate('clients'); }}
        onAppointments={() => navigate('appointments')} onComplete={a => setForm({ type: 'session', appointment: a })}
        onPayments={view => { navigate('finances'); setFinanceView(view); }} onInvoice={setFollowInvoiceId}
        onDocument={(clientId, documentId) => { openClient(clientId); setProfileTab('documents'); setDocumentFocusId(documentId); }} onWork={openWorkItem}/>}
      {route === 'clients' && <><PageHeading title={selected ? selected.name : t('clients')} subtitle={selected ? `${t('clientSince')} ${dateLabel(selected.createdAt.slice(0, 10), language, { month: 'long', year: 'numeric' })}` : t('yourClients')} action={<button className={`btn ${selected ? 'btn-secondary' : 'btn-primary'}`} onClick={() => setForm({ type: 'client' })}><Plus size={18}/>{t('newClient')}</button>}/><div className={`clients-layout ${selected ? 'has-selected' : ''}`}><section className="card client-directory"><label className="search-field"><Search size={18}/><input aria-label={t('search')} placeholder={t('searchClients')} value={search} onChange={e => setSearch(e.target.value)}/></label><div className="directory-filter"><Field label={t('clientStatusFilter')}><select value={clientFilter} onChange={e => { setClientFilter(e.target.value as ClientStatus | 'all'); setClientLimit(50); }}>{(['active', 'paused', 'closed', 'all'] as const).map(value => <option key={value} value={value}>{t(value === 'all' ? 'allClients' : `clientStatus_${value}`)}</option>)}</select></Field></div><div className="directory-list">{matchingClients.slice(0, clientLimit).map(c => <button className={`client-summary ${selected?.id === c.id ? 'selected' : ''}`} key={c.id} onClick={() => { setSelectedId(c.id); setTag(''); setProfileTab('overview'); }}><Avatar client={c} vault={vault}/><span><strong>{c.name}</strong><small>{t(`clientStatus_${clientStatus(c)}`)} · {c.language === 'uk' ? 'UA' : 'DE'} · {data.sessions.filter(s => s.clientId === c.id).length} {t('sessions')}</small></span><ChevronRight size={16}/></button>)}{!matchingClients.length && <p className="hint p-4">{t('noResults')}</p>}</div>{matchingClients.length > clientLimit && <button className="text-link" onClick={() => setClientLimit(n => n + 50)}>{t('followUpShowMore')}</button>}</section>
        {selected ? <ClientProfile key={selected.id} vault={vault} client={selected} focusDocumentId={documentFocusId} focusMemoId={memoFocusId} onMemoFocusHandled={() => setMemoFocusId(undefined)} tab={profileTab} setTab={setProfileTab} tag={tag} setTag={setTag} actions={{ onBack: () => setSelectedId(undefined), onEditClient: () => setForm({ type: 'client', client: selected }), onNewSession: () => setForm({ type: 'session', clientId: selected.id }), onNewNote: () => setForm({ type: 'note', clientId: selected.id }), onNewAppointment: () => setForm({ type: 'appointment', clientId: selected.id }), onEditSession: session => setForm({ type: 'session', session }), onPhoto: setPhoto, onPayment: markPayment, onDeleteNote: deleteNoteEntry }}/> : <section className="card directory-empty"><Empty icon={<Users size={32}/>} title={data.clients.length ? t('openProfile') : t('noClients')} text={t('noClientsText')} action={<button className="btn btn-secondary" onClick={() => setForm({ type: 'client' })}><Plus size={17}/>{t('newClient')}</button>}/></section>}
      </div></>}
      {route === 'appointments' && <AppointmentsPage vault={vault} {...quickProps} onBackfill={() => setForm(data.clients.length ? { type: 'session' } : { type: 'client' })} onNew={() => setForm(data.clients.length ? { type: 'appointment' } : { type: 'client' })} onClient={openClient} onComplete={a => setForm({ type: 'session', appointment: a })} onEdit={a => setForm({ type: 'appointment', appointment: a })}/>}
      {route === 'finances' && <FinancesPage key={financeView} initialView={financeView} vault={vault} onPayment={markPayment} onClient={openClient}/>}
      {route === 'settings' && <SettingsPage vault={vault} focus={settingsFocus} auto={auto} onSync={doSync} syncing={syncing} onRestore={async () => {
        if (!window.confirm(t('restoreConfirm'))) return;
        try { const u = await currentUser(); const remote = await fetchRemote(); if (!remote) throw new Error('noRemote'); await vault.importBackup({ type: 'praxisraum-backup-v1', envelope: remoteEnvelope(remote), blobs: [] }); await setRevision(u.id, remote.vault_id, remote.revision); } catch (err) { setSyncMessage(cloudError(err) as TextKey); }
      }}/>}
      {marketingOpened&&<Newsletter vault={vault} marketing={marketing} active={route==='newsletter'} initialTab={newsletterTab} templateId={newsletterTemplate} onTemplateHandled={()=>setNewsletterTemplate(undefined)} onTemplates={()=>navigate('messageTemplates')} onEditClient={id=>{const client=data.clients.find(c=>c.id===id);if(client)setForm({type:'client',client});}}/>}
      {route==='messageTemplates'&&<TemplateManager vault={vault} onUse={id=>{navigate('newsletter');setNewsletterTemplate(id);}}/>}
      {route==='marketingCampaigns'&&<MarketingCampaigns vault={vault} marketing={marketing} onTemplates={()=>navigate('messageTemplates')} onArchive={()=>{navigate('newsletter');setNewsletterTab('archive');}}/>}
      {route==='referrals'&&<Referrals vault={vault}/>}
      <footer className="page-footer"><SecurityLine/><span>{t('privacyFooter')}</span></footer></main>
      <div className="sync-bar"><span>{vault.saving ? <LoaderCircle size={15} className="spin"/> : <CheckCheck size={16}/>}<span>{t(vault.saving ? 'saving' : vault.storageError ? 'storageError' : 'saved')}</span></span><button disabled={syncing || vault.demo} onClick={() => void doSync()}><Cloud size={16} className={syncing ? 'pulse' : ''}/><span>{t(syncing ? 'syncing' : lastSyncedGeneration === vault.generation ? 'synced' : 'sync')}</span></button></div>
    </div>
    {form?.type === 'client' && <ClientForm vault={vault} client={form.client} onClose={() => setForm(undefined)} onSaved={id => { setForm(undefined); if(route!=='newsletter')openClient(id); }} onDeleted={() => { setForm(undefined); setSelectedId(undefined); setTag(''); }}/>} {form?.type === 'appointment' && <AppointmentForm vault={vault} clientId={form.clientId} appointment={form.appointment} onClose={() => setForm(undefined)}/>} {form?.type === 'session' && <SessionForm vault={vault} clientId={form.clientId} appointment={form.appointment} session={form.session} restored={form.restored} onClose={() => setForm(undefined)} onSaved={() => { if (form.appointment && !form.session) setCompletedNotice(true); }}/>} {form?.type === 'note' && <NoteForm vault={vault} clientId={form.clientId} onClose={() => setForm(undefined)}/>} {form?.type === 'payment' && <PaymentForm vault={vault} session={form.session} onClose={() => setForm(undefined)}/>}
    {workInvoiceClient && <InvoiceForm vault={vault} clientId={workInvoiceClient} onClose={() => setWorkInvoiceClient(undefined)} onCreated={invoice => { setWorkInvoiceClient(undefined); setFollowInvoiceId(invoice.id); }}/>}
    {followInvoiceId && data.invoices.find(i => i.id === followInvoiceId) && <InvoiceView key={followInvoiceId} vault={vault} invoice={data.invoices.find(i => i.id === followInvoiceId)!} onClose={() => setFollowInvoiceId(undefined)}/>}
    {vault.passphraseReset && <PassphraseReset vault={vault}/>}
    {searching && <SearchModal vault={vault} onClose={() => setSearching(false)} onOpen={hit => { setSearching(false); if (hit.kind === 'invoice') navigate('finances'); else { openClient(hit.clientId); if (hit.kind === 'audioMemo') { setProfileTab('discussed'); setMemoFocusId(hit.id); } } }}/>}
    {photo && <Modal title={t('photoNote')} onClose={() => setPhoto(undefined)} wide><ImageView id={photo} vault={vault} alt={t('photoNote')} className="note-full-image"/></Modal>}
  </div>;
}
function Stat({ icon, label, value, tone, detail, onClick, linkLabel }: { icon: ReactNode; label: string; value: string; tone: string; detail?: string; onClick?: () => void; linkLabel?: string }) {
  const content = <><div className={`stat-icon tone-${tone}`}>{icon}</div><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</>;
  return onClick ? <button type="button" className="stat-card stat-link" onClick={onClick} aria-label={`${label}: ${value}. ${linkLabel}`} title={linkLabel}>{content}<ArrowRight size={16} className="stat-link-arrow" aria-hidden="true"/></button> : <div className="stat-card">{content}</div>;
}
const ROWS_PER_PAGE = 100;
function FinancesPage({ vault, onPayment, onClient, initialView = 'year' }: { vault: VaultController; onPayment: (s: Session) => void; onClient: (id: string) => void; initialView?: FinanceView }) {
  const { t, language } = useI18n(); const data = vault.data!; const now = new Date();
  const [year, setYear] = useState(now.getFullYear()); const [view, setView] = useState<FinanceView>(initialView);
  const [filter, setFilter] = useState<PaymentFilter>(initialView === 'monthIncome' ? 'paid' : initialView === 'unpaid' ? 'unpaid' : 'all');
  const [openLimit, setOpenLimit] = useState(30);
  const [invoiceForm, setInvoiceForm] = useState(false); const [viewInvoice, setViewInvoice] = useState<string>(); const [csv, setCsv] = useState(false); const [limit, setLimit] = useState(ROWS_PER_PAGE);
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1); const before = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const last = monthlyIncome(data.sessions, previous.getFullYear())[previous.getMonth()]; const preceding = monthlyIncome(data.sessions, before.getFullYear())[before.getMonth()];
  const comparison = preceding ? `${new Intl.NumberFormat(localeFor(language), { maximumFractionDigits: 0, signDisplay: 'always' }).format((last - preceding) / preceding * 100)} % ${t('comparedPrevious')}` : t('noPrevious');
  const yearly = monthlyIncome(data.sessions, year).reduce((a, b) => a + b, 0);
  const yearSessions = data.sessions.filter(s => s.date.startsWith(`${year}-`));
  const unpaid = data.sessions.filter(s => !s.paidAt && !isSessionVoided(data, s)).sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  const open = unpaid.reduce((n, s) => n + s.feeCents, 0);
  const rows = financeRows(filter === 'unpaid' ? data.sessions.filter(s => !isSessionVoided(data, s)) : data.sessions, year, view, filter, now);
  const monthLabel = dateLabel(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, language, { month: 'long', year: 'numeric' });
  const reset = () => { setView('year'); setFilter('all'); setLimit(ROWS_PER_PAGE); };
  const chooseFilter = (next: PaymentFilter) => { if (next !== filter) setView('year'); setFilter(next); setLimit(ROWS_PER_PAGE); };
  return <>
    <PageHeading title={t('financesTitle')} subtitle={t('financesSubtitle')}/>
    <section className="card finance-open" aria-labelledby="open-payments-title">
      <div className="section-heading"><div><h2 id="open-payments-title">{t('unpaid')}</h2><p>{t('unpaidFocus')}</p></div><HelpButton topic="finances" text="helpPayments"/><strong className="open-payments-total">{money(open, language)}</strong></div>
      {unpaid.length ? <ul className="open-payment-list">{unpaid.slice(0, openLimit).map(s => { const name = data.clients.find(c => c.id === s.clientId)?.name; return <li key={s.id}><div className="open-payment-person"><button className="table-client" onClick={() => onClient(s.clientId)}>{name}</button><span>{dateLabel(s.date, language, { day: '2-digit', month: '2-digit', year: 'numeric' })} · {s.time}</span>{s.invoiceId && <button className="text-link" onClick={() => setViewInvoice(s.invoiceId)}>{t('invoiceTitle')} {data.invoices.find(i => i.id === s.invoiceId)?.number}</button>}</div><BillingMoney feeCents={s.feeCents} billing={s.billing}/><button className="btn btn-secondary" onClick={() => onPayment(s)} aria-label={`${t('markPaid')}: ${name} · ${dateLabel(s.date, language, { day: '2-digit', month: '2-digit', year: 'numeric' })}`}>{t('markPaid')}</button></li>; })}</ul> : <p className="hint">{t('noOpenPayments')}</p>}
      {unpaid.length > openLimit && <button className="btn btn-secondary" onClick={() => setOpenLimit(n => n + 30)}>{t('showMoreRows')}</button>}
      <OverdueInvoiceList vault={vault} onInvoice={setViewInvoice}/>
    </section>
    <h2 className="payments-income-title">{t('yearIncome')}</h2>
    <div className="stats-grid">
      <Stat icon={<ArrowDownLeft size={21}/>} label={t('lastMonth')} value={money(last, language)} tone="sage" detail={comparison}/>
      <Stat icon={<TrendingUp size={21}/>} label={`${t('yearIncome')} ${year}`} value={money(yearly, language)} tone="blue"/>
      <Stat icon={<Wallet size={21}/>} label={`${t('billed')} · ${year}`} value={money(yearSessions.filter(s => !isSessionVoided(data, s)).reduce((n, s) => n + s.feeCents, 0), language)} tone="beige"/>
      <Stat icon={<Clock3 size={21}/>} label={`${t('openAmount')} · ${t('allYears')}`} value={money(open, language)} tone="rose"/>
    </div>
    <IncomeChart sessions={data.sessions} year={year} onYear={value => { setYear(value); setView('year'); setLimit(ROWS_PER_PAGE); }}/><p className="hint finance-currency-hint">{t('financeCurrencyHint')}</p>
    {view !== 'year' && <Notice>{view === 'monthIncome' ? `${t('monthIncomeFocus')} ${monthLabel}. ${t('monthIncomeFocusHint')}` : t('unpaidFocus')}<button className="text-link" onClick={reset}>{t('showAllFinance')}</button></Notice>}
    <details className="finance-history" open={initialView !== 'year'}><summary>{t('paymentHistoryTools')}</summary><section className="card finance-records"><div className="section-heading flex-wrap"><div><h2>{t('receipts')} · {view === 'monthIncome' ? monthLabel : view === 'unpaid' ? t('allYears') : year}</h2><p>{t(view === 'monthIncome' ? 'monthIncomeFocusHint' : 'billedHelp')}</p></div><div className="button-row"><div className="segmented-tabs small-tabs">{(['all', 'paid', 'unpaid'] as const).map(f => <button key={f} className={filter === f ? 'active' : ''} aria-pressed={filter === f} onClick={() => chooseFilter(f)}>{t(f)}</button>)}</div><button className="btn btn-secondary btn-small" onClick={() => setCsv(true)}><Download size={15}/>{t('exportCsv')}</button></div></div>
    {rows.length ? <><div className="table-scroll"><table><thead><tr><th>{t('client')}</th><th>{t('date')}</th><th>{t('invoiceAmount')}</th><th>{t('paymentDate')}</th><th>{t('paymentStatus')}</th><th>{t('invoiceTitle')}</th></tr></thead><tbody>{rows.slice(0, limit).map(s => <tr key={s.id}>
      <td><button className="table-client" onClick={() => onClient(s.clientId)}>{data.clients.find(c => c.id === s.clientId)?.name}</button></td><td>{dateLabel(s.date, language, { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
      <td className="tabular-nums font-semibold"><BillingMoney feeCents={s.feeCents} billing={s.billing}/></td><td>{s.paidAt ? dateLabel(s.paidAt, language, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}</td>
      <td>{isSessionVoided(data, s) ? <span className="payment-badge is-voided">{t('invoiceVoidedCharge')}{s.paidAt ? ` · ${t('paid')}` : ''}</span> : <><PaymentBadge session={s} onClick={() => onPayment(s)}/>{s.paidAt && s.paymentMethod && <small className="payment-method">{t(s.paymentMethod === 'cash' ? 'paymentCash' : 'paymentTransfer')}</small>}</>}</td><td>{s.invoiceId ? <button className="table-client" onClick={() => setViewInvoice(s.invoiceId)}>{data.invoices.find(i => i.id === s.invoiceId)?.number ?? '—'}</button> : '—'}</td>
    </tr>)}</tbody></table></div>{rows.length > limit && <div className="table-more"><span className="hint">{t('rowsShown').replace('{n}', String(Math.min(limit, rows.length))).replace('{total}', String(rows.length))}</span><button type="button" className="btn btn-secondary" onClick={() => setLimit(n => n + ROWS_PER_PAGE)}>{t('showMoreRows')}</button></div>}</> : <Empty icon={<Wallet size={28}/>} title={t(data.sessions.length ? 'noMatchingFinance' : 'noSessions')} text={t('noSessionsText')} action={data.sessions.length ? <button className="btn btn-secondary" onClick={reset}>{t('showAllFinance')}</button> : undefined}/>}</section>
    </details>
    <div className="invoice-section-actions"><button className="btn btn-secondary" disabled={!data.clients.length} onClick={() => setInvoiceForm(true)}><FileText size={17}/>{t('createInvoice')}</button></div>
    <InvoiceList vault={vault} onOpen={i => setViewInvoice(i.id)}/>
    {invoiceForm && <InvoiceForm vault={vault} onClose={() => setInvoiceForm(false)} onCreated={(i: Invoice) => { setInvoiceForm(false); setViewInvoice(i.id); }}/>}
    {viewInvoice && data.invoices.find(i => i.id === viewInvoice) && <InvoiceView vault={vault} invoice={data.invoices.find(i => i.id === viewInvoice)!} onClose={() => setViewInvoice(undefined)}/>}
    {csv && <CsvExport vault={vault} year={year} onClose={() => setCsv(false)}/>}
  </>;
}
