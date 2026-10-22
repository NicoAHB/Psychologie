import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { encryptVideoSignal, VideoSignalReader, videoKey, type VideoRoom, type VideoRole, type VideoSignal } from './videoRoom';

export type CallStatus = 'videoConnecting' | 'videoWaiting' | 'videoConnected' | 'videoEnded' | 'videoExpired' | 'videoError' | 'videoNetworkError';
interface CallOptions {
  cloud: SupabaseClient; room: VideoRoom; role: VideoRole; local: MediaStream; iceServers: RTCIceServer[];
  onRemote(stream: MediaStream): void; onStatus(status: CallStatus): void; onKnock(id: string): void;
}
/** One approved peer, private Supabase broadcast for encrypted signaling, native DTLS-SRTP for media.
 * Audio/video never enters Supabase, storage, a recorder or a relay server. */
export class DirectCall {
  private id = crypto.randomUUID(); private peerId?: string; private channel?: RealtimeChannel;
  private pc?: RTCPeerConnection; private key?: CryptoKey; private reader?: VideoSignalReader;
  private pendingIce: RTCIceCandidateInit[] = []; private queue = Promise.resolve();
  private expiry?: ReturnType<typeof setTimeout>; private connectTimer?: ReturnType<typeof setTimeout>; private knockTimer?: ReturnType<typeof setInterval>;
  private stopped = false; private joined = false; private pendingGuest?: string;
  constructor(private options: CallOptions) {
    if (options.iceServers.some(server => (Array.isArray(server.urls) ? server.urls : [server.urls]).some(url => !/^stuns?:/i.test(url)))) throw new Error('videoError');
  }
  async start() {
    const { room, cloud, role } = this.options;
    if (room.expiresAt <= Date.now()) throw new Error('videoExpired');
    const key = await videoKey(room.secret); if (this.stopped) return;
    this.key = key; this.reader = new VideoSignalReader(room, key);
    this.expiry = setTimeout(() => this.finish('videoExpired'), room.expiresAt - Date.now());
    const channel = cloud.channel(`praxisraum-video:${room.id}`, { config: { private: true, broadcast: { ack: true, self: false } } }); this.channel = channel;
    channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
      this.queue = this.queue.then(async () => { const packet = await this.reader?.read(payload); if (packet && !this.stopped) await this.receive(packet); }).catch(() => this.finish('videoError'));
    });
    channel.subscribe(status => {
      if (this.stopped) return;
      if (status === 'SUBSCRIBED') {
        this.joined = true; this.options.onStatus('videoWaiting');
        if (role === 'guest') { void this.send('knock'); this.knockTimer = setInterval(() => { if (!this.peerId) void this.send('knock'); }, 3000); }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') this.finish('videoError');
    });
  }
  private async send(kind: VideoSignal['kind'], body: Partial<VideoSignal> = {}) {
    if (this.stopped || !this.joined || !this.key || !this.channel) return;
    const { room, role } = this.options;
    const payload = await encryptVideoSignal(this.key, { ...body, version: 1, room: room.id, expiresAt: room.expiresAt, id: crypto.randomUUID(), from: this.id, role, kind, to: body.to ?? this.peerId });
    if (this.stopped) return;
    const result = await this.channel.send({ type: 'broadcast', event: 'signal', payload });
    if (result !== 'ok') this.finish('videoError');
  }
  private connection() {
    if (this.pc) return this.pc;
    const pc = new RTCPeerConnection({ iceServers: this.options.iceServers, iceTransportPolicy: 'all', bundlePolicy: 'max-bundle' }); this.pc = pc;
    this.options.local.getTracks().forEach(track => pc.addTrack(track, this.options.local));
    const remote = new MediaStream();
    pc.ontrack = event => { remote.addTrack(event.track); this.options.onRemote(event.streams[0] ?? remote); };
    pc.onicecandidate = event => { if (event.candidate) void this.send('ice', { candidate: event.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') { clearTimeout(this.connectTimer); this.options.onStatus('videoConnected'); }
      if (pc.connectionState === 'failed') this.finish('videoNetworkError');
      if (pc.connectionState === 'disconnected') { this.options.onStatus('videoConnecting'); clearTimeout(this.connectTimer); this.connectTimer = setTimeout(() => this.finish('videoNetworkError'), 45000); }
    };
    this.options.onStatus('videoConnecting');
    this.connectTimer = setTimeout(() => { if (pc.connectionState !== 'connected') this.finish('videoNetworkError'); }, 45000);
    return pc;
  }
  async approve(id: string) {
    if (this.options.role !== 'host' || this.peerId || this.pendingGuest !== id || this.stopped) return;
    this.peerId = id; this.pendingGuest = undefined;
    await this.send('approve');
    if (this.stopped) return;
    const pc = this.connection(); await pc.setLocalDescription(await pc.createOffer());
    await this.send('offer', { description: { type: 'offer', sdp: pc.localDescription!.sdp } });
  }
  private async receive(signal: VideoSignal) {
    if (signal.from === this.id || signal.role === this.options.role || signal.to && signal.to !== this.id) return;
    if (signal.kind === 'knock' && this.options.role === 'host' && !this.peerId) { if (!this.pendingGuest || this.pendingGuest === signal.from) { this.pendingGuest = signal.from; this.options.onKnock(signal.from); } return; }
    if (signal.kind === 'approve' && this.options.role === 'guest' && !this.peerId) { this.peerId = signal.from; clearInterval(this.knockTimer); return; }
    if (signal.from !== this.peerId || !signal.to) return;
    if (signal.kind === 'bye') { this.finish('videoEnded'); return; }
    if (signal.kind === 'offer' && this.options.role === 'guest') {
      const pc = this.connection(); await pc.setRemoteDescription(signal.description!); await this.flushIce();
      await pc.setLocalDescription(await pc.createAnswer()); await this.send('answer', { description: { type: 'answer', sdp: pc.localDescription!.sdp } });
    } else if (signal.kind === 'answer' && this.options.role === 'host') { await this.pc?.setRemoteDescription(signal.description!); await this.flushIce(); }
    else if (signal.kind === 'ice') { if (this.pc?.remoteDescription) await this.pc.addIceCandidate(signal.candidate!); else if (this.pendingIce.length < 100) this.pendingIce.push(signal.candidate!); }
  }
  private async flushIce() { for (const candidate of this.pendingIce.splice(0)) await this.pc!.addIceCandidate(candidate); }
  private finish(status: CallStatus) { if (this.stopped) return; this.stop(); this.options.onStatus(status); }
  /** The caller invokes this on hang-up, expiry, lock and unmount, including before signaling joined. */
  stop() {
    if (this.stopped) return;
    let farewell = Promise.resolve<unknown>(undefined);
    if (this.peerId && this.joined && this.key && this.channel) {
      const channel = this.channel, room = this.options.room;
      // Best effort only; always release the microphone immediately even when offline.
      farewell = encryptVideoSignal(this.key, { version: 1, room: room.id, expiresAt: room.expiresAt, id: crypto.randomUUID(), from: this.id, role: this.options.role, to: this.peerId, kind: 'bye' }).then(payload => channel.send({ type: 'broadcast', event: 'signal', payload })).catch(() => {});
    }
    this.stopped = true; clearTimeout(this.expiry); clearTimeout(this.connectTimer); clearInterval(this.knockTimer);
    this.pc?.close(); this.options.local.getTracks().forEach(track => track.stop());
    const channel = this.channel;
    if (channel) void Promise.race([farewell, new Promise(resolve => setTimeout(resolve, 1000))]).finally(() => this.options.cloud.removeChannel(channel).catch(() => {}));
    this.key = undefined; this.reader = undefined; this.pendingIce = [];
  }
}
