import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { ArrowRight, Leaf, ShieldCheck, X, ImageOff, LoaderCircle } from 'lucide-react';
import { LanguageSwitch, useI18n } from '../lib/i18n';
import type { Client } from '../lib/types';
import type { VaultController } from '../lib/useVault';
export function PageHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) { return <div className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>; }
export function Logo() { return <div className="brand"><span className="brand-icon"><Leaf size={24}/></span><span>Praxisraum<span className="brand-dot">.</span></span></div>; }
export function Botanical({ small = false }: { small?: boolean }) {
  return <svg className={small ? 'botanical small' : 'botanical'} viewBox="0 0 260 280" fill="none" aria-hidden="true"><path d="M127 270C118 208 158 150 158 40M128 225C99 204 77 160 69 104M138 182C172 164 199 133 210 92" stroke="currentColor" strokeWidth="2"/><path d="M155 92C113 78 122 32 152 16C175 42 182 67 155 92ZM145 143C102 148 84 110 92 80C124 83 151 102 145 143ZM139 185C166 139 204 153 214 175C198 203 169 213 139 185ZM126 232C87 225 65 198 76 168C111 168 132 197 126 232ZM88 163C47 162 32 126 44 100C74 103 95 128 88 163ZM184 126C171 89 190 58 217 58C236 90 223 117 184 126Z" fill="currentColor" fillOpacity=".23" stroke="currentColor" strokeWidth="1.5"/><path d="M40 262C85 247 137 254 186 268" stroke="currentColor" strokeWidth="1.2"/></svg>;
}
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current!; d.showModal(); return () => d.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <div className="modal-heading"><h2>{title}</h2><LanguageSwitch/><button className="icon-btn" type="button" aria-label={t('close')} onClick={onClose}><X size={20}/></button></div>{children}
  </dialog>;
}
export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3>{text && <p>{text}</p>}{action}</div>;
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) { return <div className={`notice ${error ? 'notice-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div>; }
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const hintId = useId();
  const control = isValidElement(children) ? cloneElement(children as ReactElement<{ 'aria-label'?: string; 'aria-describedby'?: string }>, { 'aria-label': label, 'aria-describedby': hint ? hintId : undefined }) : children;
  return <label className="field"><span>{label}</span>{control}{hint && <small id={hintId}>{hint}</small>}</label>;
}
export function ImageView({ id, vault, alt, className = '' }: { id: string; vault: VaultController; alt: string; className?: string }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  const { t } = useI18n();
  useEffect(() => {
    let active = true; let localUrl = '';
    setUrl(''); setError(false);
    vault.image(id).then(blob => { if (active) { localUrl = URL.createObjectURL(blob); setUrl(localUrl); } }).catch(() => { if (active) setError(true); });
    return () => { active = false; if (localUrl) URL.revokeObjectURL(localUrl); };
  }, [id, vault.image]);
  if (error) return <span className={`image-placeholder ${className}`} title={t('imageError')} role="img" aria-label={t('imageError')}><ImageOff size={20}/></span>;
  if (!url) return <span className={`image-placeholder ${className}`} role="status" aria-label={t('imageLoading')}><LoaderCircle size={18} className="spin"/></span>;
  return <img src={url} alt={alt} className={className}/>;
}
export function Avatar({ client, vault, large = false }: { client: Client; vault: VaultController; large?: boolean }) {
  const initials = client.name.trim().split(/\s+/).slice(0, 2).map(n => [...n][0]).join('').toLocaleUpperCase();
  const color = [...client.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 4;
  return <span className={`avatar avatar-${color} ${large ? 'avatar-large' : ''}`}>{client.avatarId ? <ImageView id={client.avatarId} vault={vault} alt={client.name}/> : initials}</span>;
}
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) { return <button className="text-link" onClick={onClick}>{children}<ArrowRight size={16}/></button>; }
export function SecurityLine() { const { t } = useI18n(); return <span className="security-line"><ShieldCheck size={15}/>{t('localSecure')}</span>; }
