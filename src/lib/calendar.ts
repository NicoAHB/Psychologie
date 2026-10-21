import { addDays } from './dates';
import { appointmentInstant } from './dates';
import { localParts } from '../../shared/schedule-text.mjs';
import type { Appointment, Language } from './types';

/** Monday of the week containing `iso` (weeks start on Monday in both Germany and Ukraine). */
export const mondayOf = (iso: string) => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
export interface WeekBlock { appointment: Appointment; day: number; start: number; end: number; lane: number; lanes: number; time: string }
/** Appointments of one week, positioned in the practice's own time zone; overlapping ones share a day side by side. */
export function weekBlocks(appointments: Appointment[], monday: string, zone: string, language: Language): WeekBlock[] {
  const blocks: WeekBlock[] = [];
  for (const appointment of appointments) {
    const start = localParts(appointmentInstant(appointment), zone, language);
    const day = Math.round((Date.parse(`${start.iso}T00:00:00Z`) - Date.parse(`${monday}T00:00:00Z`)) / 864e5);
    if (day < 0 || day > 6) continue;
    const minutes = Number(start.time.slice(0, 2)) * 60 + Number(start.time.slice(3));
    blocks.push({ appointment, day, start: minutes, end: Math.min(1440, minutes + appointment.duration), lane: 0, lanes: 1, time: start.time });
  }
  for (let day = 0; day < 7; day++) {
    const list = blocks.filter(b => b.day === day).sort((a, b) => a.start - b.start);
    const laneEnds: number[] = [];
    for (const block of list) {
      let lane = laneEnds.findIndex(end => end <= block.start); if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = block.end; block.lane = lane;
    }
    for (const block of list) block.lanes = Math.max(1, laneEnds.length);
  }
  return blocks;
}
