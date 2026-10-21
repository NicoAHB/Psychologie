export type Lang = 'de' | 'uk';
export interface ScheduleJob { startsAt: string; clientTimeZone: string; advisorTimeZone: string; language: Lang }
export const COMMON_ZONES: string[];
export function zoneCity(zone: string, language: Lang): string;
export function isValidZone(zone: unknown): boolean;
export function utcOffset(zone: string, instant: string | number): string;
export function localParts(instant: string | number, zone: string, language: Lang): { iso: string; time: string; date: string };
export function placeTime(instant: string | number, zone: string, language: Lang): string;
export function fullWhen(instant: string | number, zone: string, language: Lang): string;
export function alsoLine(instant: string | number, zone: string, otherZone: string | undefined, language: Lang): string;
export function reminderMessage(recipient: 'advisor' | 'client', job: ScheduleJob): string;
export function confirmationMessage(job: ScheduleJob, practiceName?: string): string;
