export const AUTO_LOCK_MINUTES = [5, 10, 15, 30, 60, 90] as const;
export function autoLockMinutes(value?: number): number { return AUTO_LOCK_MINUTES.some(minutes => minutes === value) ? value! : 10; }
