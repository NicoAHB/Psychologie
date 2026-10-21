import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowRight, CalendarDays, Check, CheckCheck, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Cloud, Download, FileImage, LayoutDashboard, Leaf, LoaderCircle, LockKeyhole, Menu, FileText, Pencil, Plus, Search, Settings2, ShieldCheck, Sparkles, Trash2, TrendingUp, Users, Wallet, WifiOff, X } from 'lucide-react';
import { LanguageSwitch, useI18n, type TextKey } from './lib/i18n';
import { useVault, type VaultController } from './lib/useVault';
import { cloudConfigured, cloudError, currentUser, fetchRemote, remoteEnvelope, syncVault } from './lib/cloud';
import { readVault, setRevision } from './lib/db';
import { addDays, dateLabel, localeFor, money, monthlyIncome, today } from './lib/dates';
import type { Appointment, Client, Invoice, PhotoNote, Route, Session } from './lib/types';
import { deleteNote } from './lib/records';
import { Avatar, Botanical, Empty, Field, ImageView, Logo, Modal, Notice, PageHeading, PaymentBadge, SecurityLine, TextLink } from './components/ui';
import { AppointmentRow, AppointmentsPage } from './components/appointments';
import { SettingsPage } from './components/settings';
import { CsvExport, InvoiceForm, InvoiceList, InvoiceView } from './components/invoices';
import { SearchModal } from './components/SearchModal';
import { ClientProfile, type ProfileTab } from './components/client-profile';
import { PassphraseReset } from './components/security';
import { useAutoBackup } from './lib/useAutoBackup';
import { backupNeeded, hasRecords, latestChange, markBackup, readBackupState, type BackupState } from './lib/backupState';
import { saveBackupCopy } from './components/backup';
import { appointmentEnd, byStart } from './lib/dates';
import { AppointmentForm, ClientForm, NoteForm, PaymentForm, SessionForm } from './components/forms';
import { IncomeChart } from './components/IncomeChart';
import { Welcome } from './components/Welcome';
import { CloudAuth, useCloudUser } from './components/CloudAuth';
type Form = { type: 'client'; client?: Client } | { type: 'appointment'; clientId?: string; appointment?: Appointment } | { type: 'session'; clientId?: string; appointment?: Appointment; session?: Session } | { type: 'note'; clientId: string } | { type: 'payment'; session: Session };
export default function App() {
  const vault = useVault(); const { t, language } = useI18n(); const user = useCloudUser(!!vault.data);
  const [route, setRoute] = useState<Route>('overview'); const [selectedId, setSelectedId] = useState<string>();
  const [form, setForm] = useState<Form>(); const [mobileNav, setMobileNav] = useState(false);
  const [online, setOnline] = useState(navigator.onLine); const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<TextKey>(); const [lastSyncedGeneration, setLastSyncedGeneration] = useState(-1);
  const auto = useAutoBackup(vault);
  const [backupInfo, setBackupInfo] = useState<BackupState | null>(); // undefined = not read yet, null = no copy yet
  const [profileTab, setProfileTab] = useState<ProfileTab>('overview'); const [searching, setSearching] = useState(false); const [search, setSearch] = useState(''); const [tag, setTag] = useState(''); const [photo, setPhoto] = useState<string>();
  const syncBusy = useRef(false); const currentVault = useRef(vault); currentVault.current = vault;
  const navigate = (next: Route) => { setRoute(next); setMobileNav(false); setSearch(''); setTag(''); };
  const openClient = (id: string) => { setSelectedId(id); setProfileTab('overview'); navigate('clients'); };
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
  const doSync = useCallback(async () => {
    const v = currentVault.current;
    if (!v.data || v.demo || syncBusy.current) return;
    if (!cloudConfigured || !user) { setSyncMessage('cloudMissing'); setRoute('settings'); return; }
    syncBusy.current = true; setSyncing(true); setSyncMessage(undefined);
    const generation = v.generation;
    try {
      await v.flush();
      let envelope = await readVault(); if (!envelope) throw new Error('storageError');
      // No update can interleave between these synchronous reads after the flush.
      const snapshot = currentVault.current;
      if (snapshot.generation !== generation) return;
      let synced = generation;
      try { await syncVault(envelope, v.data); }
      catch (err) {
        if (cloudError(err) !== 'syncConflict') throw err;
        // Another device saved first: merge record by record, then save the combined state.
        const merged = await v.mergeRemote(); await v.flush();
        envelope = await readVault(); if (!envelope) throw new Error('storageError');
        await syncVault(envelope, merged.data); synced = merged.generation;
      }
      setLastSyncedGeneration(synced); setSyncMessage('synced'); void markBackup(envelope.vaultId, 'cloud').catch(() => {});
    } catch (err) { setSyncMessage(cloudError(err) as TextKey); } finally { syncBusy.current = false; setSyncing(false); }
  }, [user]);
  useEffect(() => {
    if (!vault.data?.settings.autoSync || vault.demo || !online || !user || vault.generation === lastSyncedGeneration || syncMessage === 'syncConflict' || syncMessage === 'differentVault') return;
    const timeout = window.setTimeout(() => void doSync(), 2500); return () => clearTimeout(timeout);
  }, [vault.generation, vault.data?.settings.autoSync, vault.demo, online, user, lastSyncedGeneration, doSync]);
  useEffect(() => {
    if (!vault.data) return;
    const warn = (e: BeforeUnloadEvent) => { if (currentVault.current.saving || currentVault.current.storageError) { e.preventDefault(); } };
    let active = Date.now(); let wasLocking = false;
    const touch = () => { active = Date.now(); };
    const timer = window.setInterval(() => { if (Date.now() - active >= 10 * 60 * 1000 && !wasLocking) { wasLocking = true; void currentVault.current.lock().catch(() => { wasLocking = false; }); } }, 15000);
    window.addEventListener('pointerdown', touch); window.addEventListener('keydown', touch); window.addEventListener('beforeunload', warn);
    return () => { clearInterval(timer); window.removeEventListener('pointerdown', touch); window.removeEventListener('keydown', touch); window.removeEventListener('beforeunload', warn); };
  }, [!!vault.data]);
  // Clear plaintext form drafts and image object URLs when the vault locks.
  useEffect(() => { if (!vault.data) { setForm(undefined); setPhoto(undefined); setSelectedId(undefined); setSyncMessage(undefined); setLastSyncedGeneration(-1); setRoute('overview'); } }, [!!vault.data]);
  if (!vault.data) return <Welcome vault={vault}/>;
  const data = vault.data;
  const selected = data.clients.find(c => c.id === selectedId);
  const future = data.appointments.filter(a => a.status === 'scheduled' && appointmentEnd(a) >= new Date(`${today()}T00:00:00`).getTime()).sort(byStart);
  const backupNag = backupInfo === undefined ? { needed: false, days: 0 } : backupNeeded(backupInfo ?? undefined, latestChange(data), hasRecords(data));
  const now = new Date(); const year = now.getFullYear(); const month = now.getMonth();
  const income = monthlyIncome(data.sessions, year)[month]; const open = data.sessions.filter(s => !s.paidAt).reduce((n, s) => n + s.feeCents, 0);
  const menuItems: { id: Route; icon: ReactNode }[] = [{ id: 'overview', icon: <LayoutDashboard size={20}/> }, { id: 'clients', icon: <Users size={20}/> }, { id: 'appointments', icon: <CalendarDays size={20}/> }, { id: 'finances', icon: <Wallet size={20}/> }, { id: 'settings', icon: <Settings2 size={20}/> }];
  const deleteNoteEntry = (note: PhotoNote) => {
    if (window.confirm(t('deleteNoteConfirm'))) void vault.remove(d => deleteNote(d, note.id)).catch(() => {});
  };
  const markPayment = (session: Session) => {
    if (!session.paidAt) setForm({ type: 'payment', session });
    else if (window.confirm(t('paymentRemoveConfirm'))) void vault.update(d => { d.sessions.find(s => s.id === session.id)!.paidAt = null; }).catch(() => {});
  };
  return <div className="app-shell">{mobileNav && <button className="nav-backdrop" onClick={() => setMobileNav(false)} aria-label={t('close')}/>}
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}><div className="sidebar-brand"><Logo/><button className="icon-btn mobile-only" aria-label={t('close')} onClick={() => setMobileNav(false)}><X size={20}/></button></div><p className="sidebar-tagline">{t('tagline')}</p><span className="nav-eyebrow">{t('workspace')}</span><nav aria-label={t('workspace')}>{menuItems.map(item => <button className={`nav-item ${route === item.id ? 'active' : ''}`} key={item.id} aria-current={route === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>{item.icon}<span>{t(item.id)}</span>{item.id === 'clients' && data.clients.length > 0 && <small aria-hidden="true">{data.clients.length}</small>}</button>)}</nav><div className="sidebar-bottom"><div className="privacy-card"><ShieldCheck size={23}/><h3>{t('helpTitle')}</h3><p>{t('helpText')}</p><span className="privacy-dot"/></div><div className="practitioner"><span className="practitioner-avatar"><Leaf size={20}/></span><div><strong>{t('workspace')}</strong><small>{t(vault.demo ? 'demoBadge' : 'localOnly')}</small></div><button className="icon-btn" aria-label={t('lock')} title={t('lock')} onClick={() => void vault.lock().catch(() => {})}><LockKeyhole size={18}/></button></div></div></aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-btn mobile-only" aria-label={t('openNav')} onClick={() => setMobileNav(true)}><Menu size={22}/></button><span className="desktop-only">{t('workspace')}</span><ChevronRight className="desktop-only" size={14}/><strong>{t(route)}</strong></div><div className="header-actions"><span className="header-status desktop-only">{online ? <span className="status-dot"/> : <WifiOff size={14}/>} {t(online ? 'localSecure' : 'offline')}</span><button className="icon-btn" aria-label={t('searchEverything')} title={`${t('searchEverything')} (Ctrl+K)`} onClick={() => setSearching(true)}><Search size={19}/></button><LanguageSwitch/><button className="icon-btn" aria-label={t('lock')} title={t('lock')} onClick={() => void vault.lock().catch(() => {})}><LockKeyhole size={18}/></button></div></header>
      <main className="page-content" id="main-content">{vault.demo && <Notice>{t('demoNotice')}</Notice>}{route === 'overview' && !vault.demo && backupNag.needed && <Notice error>{t(backupInfo ? 'backupBannerOld' : 'backupBannerNever').replace('{days}', String(backupNag.days))}<button className="text-link" onClick={() => void saveBackupCopy(vault, typeof navigator.canShare === 'function').catch(() => {})}>{t('backupNow')}</button></Notice>}{vault.storageError && <Notice error>{t('storageError')}<button className="text-link" onClick={() => void vault.retry().catch(() => {})}>{t('retry')}</button></Notice>}{syncMessage && syncMessage !== 'synced' && <Notice error>{t(syncMessage)}</Notice>}
      {route === 'overview' && <><PageHeading title={t('greeting')} subtitle={t('overviewSubtitle')} action={<button className="btn btn-primary" onClick={() => setForm(data.clients.length ? { type: 'appointment' } : { type: 'client' })}><Plus size={18}/>{t('newAppointment')}</button>}/><div className="stats-grid"><Stat icon={<Users size={20}/>} label={t('activeClients')} value={String(data.clients.length)} tone="sage"/><Stat icon={<CalendarDays size={20}/>} label={t('upcomingCount')} value={String(future.length)} tone="blue"/><Stat icon={<TrendingUp size={20}/>} label={t('receivedMonth')} value={money(income, language)} tone="beige"/><Stat icon={<CircleDollarSign size={20}/>} label={t('openAmount')} value={money(open, language)} tone="rose"/></div>
        <section className="hero-card"><div><span className="eyebrow">{t('heroEyebrow')}</span><h2>{t('heroTitle')}</h2><p>{t('heroText')}</p><button className="btn btn-primary" onClick={() => navigate('appointments')}>{t('viewAppointments')}<ArrowRight size={17}/></button></div><div className="hero-art"><div className="hero-disc"/><Botanical/><span className="hero-spark"><Sparkles size={24}/></span></div></section>
        <div className="overview-grid"><section className="card"><div className="section-heading"><h2>{t('nextAppointments')}</h2><TextLink onClick={() => navigate('appointments')}>{t('allAppointments')}</TextLink></div>{future.length ? <div className="appointment-list">{future.slice(0, 4).map(a => <AppointmentRow key={a.id} appointment={a} vault={vault} onClient={openClient}/>)}</div> : <Empty icon={<CalendarDays size={25}/>} title={t('noAppointments')} text={t('noAppointmentsText')}/>}</section><section className="card"><div className="section-heading"><h2>{t('yourClients')}</h2><button className="icon-btn" aria-label={t('newClient')} onClick={() => setForm({ type: 'client' })}><Plus size={19}/></button></div>{data.clients.length ? <><div className="client-summary-list">{data.clients.slice(0, 4).map(c => <button className="client-summary" key={c.id} onClick={() => openClient(c.id)}><Avatar client={c} vault={vault}/><span><strong>{c.name}</strong><small>{data.sessions.filter(s => s.clientId === c.id).length} {t('sessions')}</small></span><ChevronRight size={17}/></button>)}</div><TextLink onClick={() => navigate('clients')}>{t('allClients')}</TextLink></> : <Empty icon={<Users size={25}/>} title={t('noClients')} text={t('noClientsText')} action={<button className="btn btn-secondary" onClick={() => setForm({ type: 'client' })}>{t('newClient')}</button>}/>}</section></div><IncomeChart sessions={data.sessions} year={year} compact/>
      </>}
      {route === 'clients' && <><PageHeading title={selected ? selected.name : t('clients')} subtitle={selected ? `${t('clientSince')} ${dateLabel(selected.createdAt.slice(0, 10), language, { month: 'long', year: 'numeric' })}` : t('yourClients')} action={<button className="btn btn-primary" onClick={() => setForm({ type: 'client' })}><Plus size={18}/>{t('newClient')}</button>}/><div className={`clients-layout ${selected ? 'has-selected' : ''}`}><section className="card client-directory"><label className="search-field"><Search size={18}/><input aria-label={t('search')} placeholder={t('searchClients')} value={search} onChange={e => setSearch(e.target.value)}/></label><div className="directory-list">{data.clients.filter(c => c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(c => <button className={`client-summary ${selected?.id === c.id ? 'selected' : ''}`} key={c.id} onClick={() => { setSelectedId(c.id); setTag(''); setProfileTab('overview'); }}><Avatar client={c} vault={vault}/><span><strong>{c.name}</strong><small>{c.language === 'uk' ? 'UA' : 'DE'} · {data.sessions.filter(s => s.clientId === c.id).length} {t('sessions')}</small></span><ChevronRight size={16}/></button>)}{search && !data.clients.some(c => c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) && <p className="hint p-4">{t('noResults')}</p>}</div></section>
        {selected ? <ClientProfile vault={vault} client={selected} tab={profileTab} setTab={setProfileTab} tag={tag} setTag={setTag} actions={{ onBack: () => setSelectedId(undefined), onEditClient: () => setForm({ type: 'client', client: selected }), onNewSession: () => setForm({ type: 'session', clientId: selected.id }), onNewNote: () => setForm({ type: 'note', clientId: selected.id }), onNewAppointment: () => setForm({ type: 'appointment', clientId: selected.id }), onEditSession: session => setForm({ type: 'session', session }), onPhoto: setPhoto, onPayment: markPayment, onDeleteNote: deleteNoteEntry }}/> : <section className="card directory-empty"><Empty icon={<Users size={32}/>} title={data.clients.length ? t('openProfile') : t('noClients')} text={t('noClientsText')} action={<button className="btn btn-primary" onClick={() => setForm({ type: 'client' })}><Plus size={17}/>{t('newClient')}</button>}/></section>}
      </div></>}
      {route === 'appointments' && <AppointmentsPage vault={vault} onNew={() => setForm(data.clients.length ? { type: 'appointment' } : { type: 'client' })} onClient={openClient} onComplete={a => setForm({ type: 'session', appointment: a })} onEdit={a => setForm({ type: 'appointment', appointment: a })}/>}
      {route === 'finances' && <FinancesPage vault={vault} onNew={() => setForm(data.clients.length ? { type: 'session' } : { type: 'client' })} onPayment={markPayment} onClient={openClient}/>}
      {route === 'settings' && <SettingsPage vault={vault} auto={auto} onSync={doSync} syncing={syncing} onRestore={async () => {
        if (!window.confirm(t('restoreConfirm'))) return;
        try { const u = await currentUser(); const remote = await fetchRemote(); if (!remote) throw new Error('noRemote'); await vault.importBackup({ type: 'praxisraum-backup-v1', envelope: remoteEnvelope(remote), blobs: [] }); await setRevision(u.id, remote.vault_id, remote.revision); } catch (err) { setSyncMessage(cloudError(err) as TextKey); }
      }}/>}
      <footer className="page-footer"><SecurityLine/><span>{t('privacyFooter')}</span></footer></main>
      <div className="sync-bar"><span>{vault.saving ? <LoaderCircle size={15} className="spin"/> : <CheckCheck size={16}/>}<span>{t(vault.saving ? 'saving' : vault.storageError ? 'storageError' : 'saved')}</span></span><button disabled={syncing || vault.demo} onClick={() => void doSync()}><Cloud size={16} className={syncing ? 'pulse' : ''}/><span>{t(syncing ? 'syncing' : lastSyncedGeneration === vault.generation ? 'synced' : 'sync')}</span></button></div>
    </div>
    {form?.type === 'client' && <ClientForm vault={vault} client={form.client} onClose={() => setForm(undefined)} onSaved={id => { setForm(undefined); openClient(id); }} onDeleted={() => { setForm(undefined); setSelectedId(undefined); setTag(''); }}/>} {form?.type === 'appointment' && <AppointmentForm vault={vault} clientId={form.clientId} appointment={form.appointment} onClose={() => setForm(undefined)}/>} {form?.type === 'session' && <SessionForm vault={vault} clientId={form.clientId} appointment={form.appointment} session={form.session} onClose={() => setForm(undefined)}/>} {form?.type === 'note' && <NoteForm vault={vault} clientId={form.clientId} onClose={() => setForm(undefined)}/>} {form?.type === 'payment' && <PaymentForm vault={vault} session={form.session} onClose={() => setForm(undefined)}/>}
    {vault.passphraseReset && <PassphraseReset vault={vault}/>}
    {searching && <SearchModal vault={vault} onClose={() => setSearching(false)} onOpen={hit => { setSearching(false); if (hit.kind === 'invoice') navigate('finances'); else openClient(hit.clientId); }}/>}
    {photo && <Modal title={t('photoNote')} onClose={() => setPhoto(undefined)} wide><ImageView id={photo} vault={vault} alt={t('photoNote')} className="note-full-image"/></Modal>}
  </div>;
}
function Stat({ icon, label, value, tone, detail }: { icon: ReactNode; label: string; value: string; tone: string; detail?: string }) { return <div className="stat-card"><div className={`stat-icon tone-${tone}`}>{icon}</div><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>; }
function FinancesPage({ vault, onNew, onPayment, onClient }: { vault: VaultController; onNew: () => void; onPayment: (s: Session) => void; onClient: (id: string) => void }) {
  const { t, language } = useI18n(); const data = vault.data!; const [year, setYear] = useState(new Date().getFullYear()); const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [invoiceForm, setInvoiceForm] = useState(false); const [viewInvoice, setViewInvoice] = useState<string>(); const [csv, setCsv] = useState(false);
  const now = new Date(); const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1); const before = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const last = monthlyIncome(data.sessions, previous.getFullYear())[previous.getMonth()]; const preceding = monthlyIncome(data.sessions, before.getFullYear())[before.getMonth()];
  const comparison = preceding ? `${new Intl.NumberFormat(localeFor(language), { maximumFractionDigits: 0, signDisplay: 'always' }).format((last - preceding) / preceding * 100)} % ${t('comparedPrevious')}` : t('noPrevious');
  const yearly = monthlyIncome(data.sessions, year).reduce((a, b) => a + b, 0);
  const sessions = data.sessions.filter(s => s.date.startsWith(String(year))); const open = sessions.filter(s => !s.paidAt).reduce((n, s) => n + s.feeCents, 0);
  return <><PageHeading title={t('financesTitle')} subtitle={t('financesSubtitle')} action={<div className="button-row"><button className="btn btn-secondary" disabled={!data.clients.length} onClick={() => setInvoiceForm(true)}><FileText size={17}/>{t('createInvoice')}</button><button className="btn btn-primary" onClick={onNew}><Plus size={17}/>{t('addSession')}</button></div>}/><div className="stats-grid"><Stat icon={<ArrowDownLeft size={21}/>} label={t('lastMonth')} value={money(last, language)} tone="sage" detail={comparison}/><Stat icon={<TrendingUp size={21}/>} label={`${t('yearIncome')} ${year}`} value={money(yearly, language)} tone="blue"/><Stat icon={<Wallet size={21}/>} label={t('billed')} value={money(sessions.reduce((n, s) => n + s.feeCents, 0), language)} tone="beige"/><Stat icon={<Clock3 size={21}/>} label={`${t('openAmount')} · ${year}`} value={money(open, language)} tone="rose"/></div><IncomeChart sessions={data.sessions} year={year} onYear={setYear}/><section className="card"><div className="section-heading flex-wrap"><div><h2>{t('receipts')} · {year}</h2><p>{t('billedHelp')}</p></div><div className="button-row"><div className="segmented-tabs small-tabs">{(['all', 'paid', 'unpaid'] as const).map(f => <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>{t(f)}</button>)}</div><button className="btn btn-secondary btn-small" onClick={() => setCsv(true)}><Download size={15}/>{t('exportCsv')}</button></div></div>{sessions.length ? <div className="table-scroll"><table><thead><tr><th>{t('client')}</th><th>{t('date')}</th><th>{t('fee')}</th><th>{t('paymentDate')}</th><th>{t('paymentStatus')}</th><th>{t('invoiceTitle')}</th></tr></thead><tbody>{[...sessions].filter(s => filter === 'all' || (filter === 'paid' ? s.paidAt : !s.paidAt)).sort((a, b) => b.date.localeCompare(a.date)).map(s => <tr key={s.id}><td><button className="table-client" onClick={() => onClient(s.clientId)}>{data.clients.find(c => c.id === s.clientId)?.name}</button></td><td>{dateLabel(s.date, language, { day: '2-digit', month: '2-digit', year: 'numeric' })}</td><td className="tabular-nums font-semibold">{money(s.feeCents, language)}</td><td>{s.paidAt ? dateLabel(s.paidAt, language, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}</td><td><PaymentBadge session={s} onClick={() => onPayment(s)}/></td><td>{s.invoiceId ? <button className="table-client" onClick={() => setViewInvoice(s.invoiceId)}>{data.invoices.find(i => i.id === s.invoiceId)?.number ?? '—'}</button> : '—'}</td></tr>)}</tbody></table></div> : <Empty icon={<Wallet size={28}/>} title={t('noSessions')} text={t('noSessionsText')}/>}</section>
    <InvoiceList vault={vault} onOpen={i => setViewInvoice(i.id)}/>
    {invoiceForm && <InvoiceForm vault={vault} onClose={() => setInvoiceForm(false)} onCreated={(i: Invoice) => { setInvoiceForm(false); setViewInvoice(i.id); }}/>}
    {viewInvoice && data.invoices.find(i => i.id === viewInvoice) && <InvoiceView vault={vault} invoice={data.invoices.find(i => i.id === viewInvoice)!} onClose={() => setViewInvoice(undefined)}/>}
    {csv && <CsvExport vault={vault} year={year} onClose={() => setCsv(false)}/>}</>;
}
