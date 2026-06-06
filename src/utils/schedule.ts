/**
 * Parsing helpers for habit schedule input (time-of-day and weekdays).
 * Weekday convention: 0=Sunday .. 6=Saturday (matches JS Date.getDay()).
 */

const DAY_TOKENS: Record<string, number> = {
  sun: 0, sunday: 0, min: 0, minggu: 0, ahad: 0,
  mon: 1, monday: 1, sen: 1, senin: 1,
  tue: 2, tues: 2, tuesday: 2, sel: 2, selasa: 2,
  wed: 3, wednesday: 3, rab: 3, rabu: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, kam: 4, kamis: 4,
  fri: 5, friday: 5, jum: 5, jumat: 5, "jum'at": 5,
  sat: 6, saturday: 6, sab: 6, sabtu: 6,
};

const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** Parse 'H:MM' / 'HH:MM' into a normalized 'HH:MM'. Throws on invalid input. */
export function parseTimeOfDay(input: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(input.trim());
  if (!m) throw new Error(`Invalid time "${input}". Use HH:MM (e.g. 06:00).`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Invalid time "${input}". Hours 0-23, minutes 0-59.`);
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/**
 * Parse a weekday spec into a sorted, de-duplicated list of weekday numbers.
 * Accepts keywords (daily/everyday, weekdays, weekends) or a comma/space list
 * of day names/abbreviations (mon, tue, ..., or Indonesian sen, sel, ...).
 */
export function parseDaysOfWeek(input: string): number[] {
  const normalized = input.trim().toLowerCase();
  if (!normalized) throw new Error('Days required (e.g. daily, weekdays, or mon,wed,fri).');

  if (normalized === 'daily' || normalized === 'everyday' || normalized === 'setiap hari') {
    return [...ALL_DAYS];
  }
  if (normalized === 'weekdays' || normalized === 'weekday') return [...WEEKDAYS];
  if (normalized === 'weekends' || normalized === 'weekend') return [...WEEKEND];

  const tokens = normalized.split(/[,\s]+/).filter(Boolean);
  const days = new Set<number>();
  for (const token of tokens) {
    const day = DAY_TOKENS[token];
    if (day === undefined) throw new Error(`Unknown day "${token}".`);
    days.add(day);
  }
  if (days.size === 0) throw new Error('No valid days provided.');
  return [...days].sort((a, b) => a - b);
}

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/** Render a weekday list as short labels, e.g. [1,3,5] → "Sen, Rab, Jum". */
export function formatDaysOfWeek(days: number[]): string {
  if (days.length === 7) return 'Setiap hari';
  return days.map(d => DAY_LABELS[d]).join(', ');
}
