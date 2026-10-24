import { ClientsPage } from './pages/ClientsPage';
import { FinancesPage } from './pages/FinancesPage';
import { MorePage } from './pages/MorePage';
import { mainNavigation, isMoreRoute, type AppRoute } from './lib/navigation';
import { completeAndPay, type SettingsSection } from './lib/practiceFlow';
import type { PaymentMethod } from './lib/types';
import { useAppointmentEmails } from './lib/useAppointmentEmails';
import { Today } from './pages/TodayPage';
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
import type { ClientStatus } from './lib/types';
import { SyncConflicts } from './components/SyncConflicts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCheck, ChevronRight, Cloud, Leaf, LoaderCircle, LockKeyhole, Menu, Search, ShieldCheck, WifiOff, X } from 'lucide-react';
import { LanguageSwitch, useI18n, type TextKey } from './lib/i18n';
import { autoLockMinutes } from './lib/autoLock';
import { ThemeToggle } from './lib/theme';
import type { FinanceView } from './lib/finance';
import { useVault } from './lib/useVault';
import { cloudConfigured, cloudError, currentUser, fetchRemote, remoteEnvelope, syncVault } from './lib/cloud';
import { setRevision } from './lib/db';
import type { Appointment, Client, PhotoNote, Session } from './lib/types';
import { deleteNote } from './lib/records';
import { ImageView, Logo, Modal, Notice, SecurityLine } from './components/ui';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { SettingsPage } from './pages/SettingsPage';
import { isSessionVoided } from './lib/invoice';
import { InvoiceForm, InvoiceView } from './components/invoices';
import { SearchModal } from './components/SearchModal';
import { UpdateBanner } from './components/UpdateBanner';
import type { ProfileTab } from './components/client-profile';
import { PassphraseReset } from './components/security';
import { useAutoBackup } from './lib/useAutoBackup';
import { backupNeeded, hasRecords, latestChange, markBackup, readBackupState, type BackupState } from './lib/backupState';
import { saveBackupCopy } from './components/backup';
import { AppointmentForm, ClientForm, NoteForm, PaymentForm, SessionForm } from './components/forms';
import { Welcome } from './components/Welcome';
import { useCloudUser } from './components/CloudAuth';
type Form = { type: 'client'; client?: Client } | { type: 'appointment'; clientId?: string; appointment?: Appointment } | { type: 'session'; clientId?: string; appointment?: Appointment; session?: Session; restored?: SessionDraft } | { type: 'note'; clientId: string } | { type: 'payment'; session: Session };
export default function App() {
  const vault = useVault(); const { t } = useI18n(); const user = useCloudUser(!!vault.data);
  useAppointmentEmails(vault,user ?? undefined);
  const [waitlistFocus,setWaitlistFocus] = useState(false);
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
  const navigate = (next: AppRoute) => { setWaitlistFocus(false); setQuickNotice(undefined); setFlowError(undefined); setSettingsFocus(undefined); setCompletedNotice(false); if(next==='newsletter'){setMarketingOpened(true);setNewsletterTemplate(undefined);setNewsletterTab('create');}setRoute(next); setDocumentFocusId(undefined); setMemoFocusId(undefined); setFinanceView('year'); setMobileNav(false); setSearch(''); setTag(''); };
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
  useEffect(() => { if (!vault.data) { setWaitlistFocus(false); setQuickNotice(undefined); setFlowError(undefined); setSettingsFocus(undefined); setQuickMethod('transfer'); setMarketingOpened(false);setNewsletterTemplate(undefined);setCompletedNotice(false);setForm(undefined); setPhoto(undefined); setSelectedId(undefined); setSyncMessage(undefined); setLastSyncedGeneration(-1); setFollowInvoiceId(undefined); setWorkInvoiceClient(undefined); setDocumentFocusId(undefined); setMemoFocusId(undefined); setRoute('overview'); } }, [!!vault.data]);
  // Each page names itself in the window/tab title, which also helps screen-reader users and browser history.
  useEffect(() => { document.title = vault.data ? `${t(route)} · Praxisraum` : 'Praxisraum'; }, [vault.data, route, t]);
  if (!vault.data) return <Welcome vault={vault}/>;
  const data = vault.data;
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
      {route === 'more' && <MorePage navigate={navigate}/>}
      {route === 'overview' && <Today onWaitlist={() => { navigate('appointments'); setWaitlistFocus(true); }} vault={vault} {...quickProps} backup={backupInfo} onSetup={section => { navigate('settings'); setSettingsFocus(section); }}
        onNewAppointment={() => setForm(data.clients.length ? { type: 'appointment' } : { type: 'client' })}
        onNewClient={() => setForm({ type: 'client' })} onClient={openClient}
        onClients={() => { setSelectedId(undefined); setClientFilter('active'); navigate('clients'); }}
        onAppointments={() => navigate('appointments')} onComplete={a => setForm({ type: 'session', appointment: a })}
        onPayments={view => { navigate('finances'); setFinanceView(view); }} onInvoice={setFollowInvoiceId}
        onDocument={(clientId, documentId) => { openClient(clientId); setProfileTab('documents'); setDocumentFocusId(documentId); }} onWork={openWorkItem}/>}
      {route === 'clients' && <ClientsPage vault={vault} selected={selected} search={search} setSearch={setSearch} clientFilter={clientFilter} setClientFilter={setClientFilter} clientLimit={clientLimit} setClientLimit={setClientLimit} documentFocusId={documentFocusId} memoFocusId={memoFocusId} onMemoFocusHandled={() => setMemoFocusId(undefined)} profileTab={profileTab} setProfileTab={setProfileTab} tag={tag} setTag={setTag} onNewClient={() => setForm({ type: 'client' })} onSelect={id => { setSelectedId(id); setTag(''); setProfileTab('overview'); }} actions={selected ? { onBack: () => setSelectedId(undefined), onEditClient: () => setForm({ type: 'client', client: selected }), onNewSession: () => setForm({ type: 'session', clientId: selected.id }), onNewNote: () => setForm({ type: 'note', clientId: selected.id }), onNewAppointment: () => setForm({ type: 'appointment', clientId: selected.id }), onEditSession: session => setForm({ type: 'session', session }), onPhoto: setPhoto, onPayment: markPayment, onDeleteNote: deleteNoteEntry } : undefined}/>}
      {route === 'appointments' && <AppointmentsPage focusWaitlist={waitlistFocus} vault={vault} {...quickProps} onBackfill={() => setForm(data.clients.length ? { type: 'session' } : { type: 'client' })} onNew={() => setForm(data.clients.length ? { type: 'appointment' } : { type: 'client' })} onClient={openClient} onComplete={a => setForm({ type: 'session', appointment: a })} onEdit={a => setForm({ type: 'appointment', appointment: a })}/>}
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
