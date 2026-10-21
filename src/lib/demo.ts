import { emptyVault, uid, type VaultData } from './types';
import { addDays, today } from './dates';
export function demoVault(): VaultData {
  const data = emptyVault();
  const names = ['Anna Weber', 'Olena Kovalenko', 'Michael Berg', 'Sofia Klein', 'Kateryna Melnyk'];
  const now = today();
  data.clients = names.map((name, i) => ({ id: uid(), name, contact: '', language: i === 1 || i === 4 ? 'uk' : 'de', reminderConsent: false, telegramChatId: '', preparation: i === 0 ? 'An die Ressourcen aus dem letzten Gespräch anknüpfen.\nWie hat sich die kleine Auszeit im Alltag angefühlt?' : '', createdAt: addDays(now, -60 - i * 15), timeZone: i === 1 || i === 4 ? 'Europe/Kyiv' : 'Europe/Berlin' }));
  data.appointments = [0, 1, 2, 3].map((i) => ({ id: uid(), clientId: data.clients[i].id, date: addDays(now, i === 0 ? 0 : i), time: ['14:00', '10:30', '15:00', '09:00'][i], duration: 50, feeCents: 8500, timeZone: 'Europe/Berlin', reminderId: uid(), status: 'scheduled' }));
  const date = new Date();
  for (let m = 0; m < 8; m++) {
    const when = new Date(date.getFullYear(), date.getMonth() - m, 8);
    const day = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-08`;
    for (let n = 0; n < [6, 9, 7, 5, 8, 4, 6, 3][m]; n++) {
      data.sessions.push({ id: uid(), clientId: data.clients[n % names.length].id, date: day, time: '10:00', feeCents: 8500, paidAt: n === 0 && m === 0 ? null : day, notes: '', tags: [] });
    }
  }
  data.sessions.push({ id: uid(), clientId: data.clients[0].id, date: addDays(now, -7), time: '14:00', feeCents: 8500, paidAt: addDays(now, -7), notes: 'Gemeinsam hilfreiche Ressourcen gesammelt. Eine kleine Pause bewusst in den Alltag einbauen.', tags: ['Ressourcen', 'Fortschritt'], homework: 'Täglich 5 Minuten bewusste Pause, danach kurz notieren, wie sie sich angefühlt hat.' });
  return data;
}
