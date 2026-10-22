import { useEffect, useRef, useState } from 'react';
import { Copy, Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LanguageSwitch, useI18n, type TextKey } from '../lib/i18n';
import { cloudConfigured, getCloud } from '../lib/cloud';
import { copyText } from '../lib/files';
import { DirectCall, type CallStatus } from '../lib/directCall';
import { closeVideoRoom, configuredStun, createVideoRoom, guestVideoCloud, videoCode, videoLink, type VideoInvitation, type VideoRoom } from '../lib/videoRoom';
import type { Client } from '../lib/types';
import type { VaultController } from '../lib/useVault';
import { Modal, Notice } from './ui';
import { DictationButton } from './DictationButton';

function StreamVideo({ stream, muted = false, label }: { stream?: MediaStream; muted?: boolean; label: string }) {
  const ref = useRef<HTMLVideoElement>(null); const [play, setPlay] = useState(false);
  useEffect(() => {
    const video = ref.current!; video.srcObject = stream ?? null; setPlay(false);
    if (stream) void video.play().catch(() => setPlay(true));
    return () => { video.srcObject = null; };
  }, [stream]);
  return <div className={`video-frame ${muted ? 'video-self' : ''}`}><video aria-label={label} ref={ref} playsInline autoPlay muted={muted}/>{!stream && <span>{label}</span>}{play && <button className="btn btn-secondary" onClick={() => void ref.current?.play().then(() => setPlay(false))}>{label} ▶</button>}</div>;
}
/** Notes stay in the therapist vault. Nothing from this component enters the video channel. */
function ConsultationNotes({ vault, client }: { vault: VaultController; client: Client }) {
  const { t, language } = useI18n(); const [target, setTarget] = useState('preparation');
  const sessions = vault.data!.sessions.filter(s => s.clientId === client.id).sort((a, b) => b.date.localeCompare(a.date));
  const stored = target === 'preparation' ? client.preparation : sessions.find(s => s.id === target)?.notes ?? '';
  const [value, setValue] = useState(stored); const pending = useRef<string | null>(null); const timer = useRef(0); const latest = useRef(vault); latest.current = vault;
  const saveRef = useRef<() => void>(() => {});
  saveRef.current = () => {
    clearTimeout(timer.current); const text = pending.current; if (text === null) return; pending.current = null;
    void latest.current.update(d => {
      if (target === 'preparation') { const c = d.clients.find(c => c.id === client.id); if (c) c.preparation = text; }
      else { const session = d.sessions.find(s => s.id === target); if (session) session.notes = text; }
    }).catch(() => {});
  };
  useEffect(() => { if (pending.current === null) setValue(stored); }, [stored]);
  useEffect(() => {
    const flush = () => saveRef.current(); document.addEventListener('visibilitychange', flush); window.addEventListener('pagehide', flush);
    return () => { flush(); document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', flush); };
  }, []);
  const change = (text: string) => { setValue(text); pending.current = text; clearTimeout(timer.current); timer.current = window.setTimeout(() => saveRef.current(), 700); };
  return <section className="video-notes"><h3>{t('videoPrivateNotes')}</h3><p className="hint">{t('videoNotesHint')}</p>
    <label className="field"><span>{t('videoNoteTarget')}</span><select value={target} onChange={e => { saveRef.current(); const id = e.target.value; setTarget(id); setValue(id === 'preparation' ? client.preparation : sessions.find(s => s.id === id)?.notes ?? ''); }}><option value="preparation">{t('preparation')}</option>{sessions.map(s => <option key={s.id} value={s.id}>{s.date} · {s.time} · {t('session')}</option>)}</select></label>
    <DictationButton value={value} onChange={change} maxLength={target === 'preparation' ? 30000 : 20000}/>
    <label className="field"><span>{t('sessionNotes')}</span><textarea lang={language} rows={14} value={value} maxLength={target === 'preparation' ? 30000 : 20000} onChange={e => change(e.target.value)} onBlur={() => saveRef.current()}/></label><p className="hint" role="status">{t(vault.saving ? 'saving' : vault.storageError ? 'storageError' : 'saved')}</p></section>;
}

function CallPanel({ room, guest, onEnd }: { room: VideoRoom; guest: boolean; onEnd: () => void }) {
  const { t } = useI18n(); const [local, setLocal] = useState<MediaStream>(); const [remote, setRemote] = useState<MediaStream>();
  const [status, setStatus] = useState<CallStatus>('videoWaiting'); const [error, setError] = useState<TextKey>();
  const [busy, setBusy] = useState(false); const [knock, setKnock] = useState<string>(); const [code, setCode] = useState('');
  const [audio, setAudio] = useState(true); const [camera, setCamera] = useState(true); const [stun, setStun] = useState(false);
  const call = useRef<DirectCall | undefined>(undefined); const stream = useRef<MediaStream | undefined>(undefined); const alive = useRef(false); const busyRef = useRef(false);
  useEffect(() => {
    alive.current = true; void videoCode(room).then(value => { if (alive.current) setCode(value); });
    const leave = () => { call.current?.stop(); stream.current?.getTracks().forEach(track => track.stop()); };
    window.addEventListener('pagehide', leave);
    const expiry = window.setTimeout(() => { leave(); if (alive.current) setStatus('videoExpired'); }, Math.max(0, room.expiresAt - Date.now()));
    return () => { alive.current = false; leave(); clearTimeout(expiry); window.removeEventListener('pagehide', leave); };
  }, [room]);
  async function start() {
    if (busyRef.current || call.current) return; busyRef.current = true; setBusy(true); setError(undefined);
    let cloud: SupabaseClient | null = null;
    try {
      cloud = guest ? await guestVideoCloud() : await getCloud(); if (!cloud) throw new Error('cloudMissing');
      const { data, error: roomError } = await cloud.rpc('get_video_room', { p_id: room.id });
      if (roomError) throw new Error('videoSetup');
      if (!data || Date.parse(data.expires_at) !== room.expiresAt || room.expiresAt <= Date.now()) throw new Error('videoExpired');
      if (!alive.current) return;
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('videoMediaError');
      const media = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 540 } }, audio: { echoCancellation: true, noiseSuppression: true } });
      if (!alive.current || room.expiresAt <= Date.now()) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media; setLocal(media);
      const instance = new DirectCall({ cloud, room, role: guest ? 'guest' : 'host', local: media, iceServers: stun ? configuredStun() : [], onRemote: setRemote, onKnock: setKnock, onStatus: next => { if (alive.current) { setStatus(next); if (['videoEnded', 'videoExpired', 'videoError', 'videoNetworkError'].includes(next)) { setLocal(undefined); setRemote(undefined); } } } });
      call.current = instance; await instance.start();
      // A revoked link or a closed room also terminates an already-open call.
      const poll = window.setInterval(() => { void cloud!.rpc('get_video_room', { p_id: room.id }).then(({ data, error }) => { if (!error && !data) { instance.stop(); if (alive.current) setStatus('videoEnded'); } }); }, 15000);
      const originalStop = instance.stop.bind(instance); instance.stop = () => { clearInterval(poll); originalStop(); };
    } catch (err) {
      call.current?.stop(); stream.current?.getTracks().forEach(track => track.stop()); call.current = undefined;
      if (alive.current) { setLocal(undefined); const key = err instanceof Error && ['cloudMissing', 'videoExpired', 'videoSetup', 'videoMediaError'].includes(err.message) ? err.message as TextKey : 'videoMediaError'; setError(guest && ['cloudMissing', 'videoSetup'].includes(key) ? 'videoGuestUnavailable' : key); }
    } finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  const terminal = ['videoEnded', 'videoExpired', 'videoError', 'videoNetworkError'].includes(status);
  return <section className="video-panel"><p className="hint">{t('videoSecurityHint')}</p><p className="video-code">{t('videoCode')}: <strong>{code}</strong></p><p className="hint">{t('videoCodeHint')}</p>
    <StreamVideo stream={remote} label={t(guest ? 'videoTherapist' : 'videoPatient')}/><StreamVideo stream={local} muted label={t('videoYou')}/>
    <p role="status" className="hint">{t(status)}</p>{status === 'videoNetworkError' && <Notice error>{t('videoNetworkHint')}</Notice>}{error && <Notice error>{t(error)}</Notice>}
    {!local && !terminal && <><p className="hint">{t('videoDirectHint')}</p>{configuredStun().length > 0 && <label className="check-label"><input type="checkbox" checked={stun} onChange={e => setStun(e.target.checked)}/><span>{t('videoStunConsent')}</span></label>}<button className="btn btn-primary" disabled={busy} onClick={() => void start()}><Video size={17}/>{t(busy ? 'working' : 'videoStart')}</button></>}
    {!guest && knock && !terminal && <Notice>{t('videoKnock')} <button className="btn btn-primary" onClick={() => { const id = knock; setKnock(undefined); void call.current?.approve(id).catch(() => { call.current?.stop(); setStatus('videoError'); }); }}>{t('videoApprove')}</button></Notice>}
    {local && !terminal && <div className="button-row video-controls"><button className="btn btn-secondary" aria-pressed={!audio} onClick={() => { local.getAudioTracks().forEach(track => { track.enabled = !audio; }); setAudio(!audio); }}>{audio ? <Mic size={17}/> : <MicOff size={17}/>} {t('videoMicrophone')}</button><button className="btn btn-secondary" aria-pressed={!camera} onClick={() => { local.getVideoTracks().forEach(track => { track.enabled = !camera; }); setCamera(!camera); }}>{camera ? <Video size={17}/> : <VideoOff size={17}/>} {t('videoCamera')}</button></div>}
    <button className="btn btn-danger" onClick={() => { call.current?.stop(); onEnd(); }}><PhoneOff size={17}/>{t('videoHangup')}</button></section>;
}
export function VideoConsultation({ vault, client, onClose }: { vault: VaultController; client: Client; onClose: () => void }) {
  const { t, language } = useI18n(); const [room, setRoom] = useState<VideoRoom>(); const [busy, setBusy] = useState(false); const [error, setError] = useState<TextKey>(); const [copied, setCopied] = useState(false);
  const currentRoom = useRef<VideoRoom | undefined>(undefined); const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (currentRoom.current) void closeVideoRoom(currentRoom.current.id).catch(() => {}); }; }, []);
  async function create() {
    setBusy(true); setError(undefined);
    try { const value = await createVideoRoom(client.language); if (!alive.current) { await closeVideoRoom(value.id); return; } currentRoom.current = value; setRoom(value); }
    catch { if (alive.current) setError('videoSetup'); } finally { if (alive.current) setBusy(false); }
  }
  return <Modal wide title={`${t('videoTitle')} · ${client.name}`} onClose={onClose}>
    {!room ? <><p>{t('videoIntro')}</p><p className="hint">{t('videoDirectHint')}</p>{error && <Notice error>{t(error)}</Notice>}<button className="btn btn-primary" disabled={busy || vault.demo || !cloudConfigured} onClick={() => void create()}>{t('videoCreate')}</button>{(!cloudConfigured || vault.demo) && <Notice>{t('videoSetup')}</Notice>}</>
      : <><div className="video-invitation"><label className="field"><span>{t('videoInviteLink')}</span><input readOnly value={videoLink(room, new URL(import.meta.env.BASE_URL, location.origin).href)} onFocus={e => e.target.select()}/></label><button className="btn btn-secondary" onClick={() => void copyText(videoLink(room, new URL(import.meta.env.BASE_URL, location.origin).href)).then(setCopied)}><Copy size={16}/>{t(copied ? 'videoCopied' : 'videoCopy')}</button><p className="hint">{t('videoExpires')} {new Date(room.expiresAt).toLocaleString(language === 'uk' ? 'uk-UA' : 'de-DE')} · {t('videoLinkSecret')}</p></div><div className="consultation-layout"><CallPanel room={room} guest={false} onEnd={onClose}/><ConsultationNotes vault={vault} client={client}/></div></>}
  </Modal>;
}
export function VideoGuestPage({ invitation }: { invitation: VideoInvitation | null }) {
  const { t, setLanguage } = useI18n(); const [room, setRoom] = useState<VideoRoom>(); const [error, setError] = useState<TextKey>(); const [ended, setEnded] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { if (invitation) setLanguage(invitation.language); }, [invitation?.language]);
  async function join() {
    if (!invitation) return; setBusy(true); setError(undefined);
    try {
      const cloud = await guestVideoCloud(); const { data, error } = await cloud.rpc('get_video_room', { p_id: invitation.id });
      if (error) throw new Error('videoSetup');
      if (!data || Date.parse(data.expires_at) <= Date.now()) throw new Error('videoExpired');
      setRoom({ ...invitation, expiresAt: Date.parse(data.expires_at) });
    } catch (error) { setError(error instanceof Error && error.message === 'videoExpired' ? 'videoExpired' : 'videoGuestUnavailable'); } finally { setBusy(false); }
  }
  return <main className="video-guest"><header><h1>{t('videoTitle')}</h1><LanguageSwitch/></header>{!invitation ? <Notice error>{t('videoInvalid')}</Notice> : ended ? <Notice>{t('videoEnded')}</Notice> : room ? <CallPanel room={room} guest onEnd={() => { setRoom(undefined); setEnded(true); }}/>
    : <section className="card"><p>{t('videoGuestIntro')}</p><p className="hint">{t('videoDirectHint')}</p>{error && <Notice error>{t(error)}</Notice>}<button className="btn btn-primary" disabled={busy} onClick={() => void join()}>{t(busy ? 'working' : 'videoJoin')}</button></section>}</main>;
}
