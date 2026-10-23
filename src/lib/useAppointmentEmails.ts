import { useEffect, useRef } from 'react';
import { registerBeforeLock } from './autoLock';
import { emailConfigured } from './documents';
import { dispatchAppointmentEmail, emailReminderDue, hasAppointmentEmailConsent, appointmentEmailSignature } from './appointmentEmail';
import type { VaultController } from './useVault';
/** Like existing local automations, this only runs while unlocked and online. No cleartext server schedule. */
export function useAppointmentEmails(vault: VaultController, userId?: string) {
  const latest = useRef(vault); latest.current = vault;
  useEffect(() => {
    if (!vault.data || vault.demo || !vault.data.settings.autoEmailReminders || !emailConfigured || !userId) return;
    const controller = new AbortController(); let running = false;
    const unregister = registerBeforeLock(async () => { controller.abort(); });
    const run = async () => {
      const data = latest.current.getData(); if (!data || !navigator.onLine || running || controller.signal.aborted) return; running = true;
      try {
        for (const a of data.appointments) {
          if (controller.signal.aborted || !latest.current.getData()?.settings.autoEmailReminders) break;
          const client = data.clients.find(c => c.id === a.clientId); if (!client || !hasAppointmentEmailConsent(client) || !emailReminderDue(a)) continue;
          const signature = appointmentEmailSignature(data,a,'appointmentReminder');
          if (a.emailDeliveries?.some(d => d.signature === signature)) continue;
          try { await dispatchAppointmentEmail(latest.current,a.id,'appointmentReminder',{ automatic:true,signal:controller.signal }); } catch { /* Uncertain attempts stay in encrypted history for manual review. */ }
        }
      } finally { running = false; }
    };
    const foreground = () => { if (document.visibilityState === 'visible') void run(); };
    void run(); const timer = window.setInterval(() => void run(),60000); window.addEventListener('online',foreground); document.addEventListener('visibilitychange',foreground);
    return () => { controller.abort(); unregister(); clearInterval(timer); window.removeEventListener('online',foreground); document.removeEventListener('visibilitychange',foreground); };
  },[!!vault.data,vault.demo,vault.data?.settings.autoEmailReminders,userId]);
}
