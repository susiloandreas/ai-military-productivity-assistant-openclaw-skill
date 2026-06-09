import { HabitScheduleWithNames } from '../types';
import { formatMinutes } from '../utils/duration';

/** Source of randomness — injectable so tests can be deterministic. */
export type Rng = () => number;

/** Pick a pseudo-random element. `rng` defaults to Math.random. */
function pick<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

// ── Copy pools ───────────────────────────────────────────────────────────────
// Multiple variants per slot so each reminder reads differently, like a coach
// who never says it the same way twice. Edit/extend these freely.

/** Generic idle nudges — used when no scheduled habit is currently due or missed. */
export const IDLE_MESSAGES: string[] = [
  `🚨 <b>KAMU LAGI NGAPAIN?</b>
15 menit tanpa misi aktif.

<b>WAJIB:</b> Ketik <i>"mulai [aktivitas]"</i>`,

  `🪖 <b>LAPOR: SEDANG APA?</b>
Radar kosong, tidak ada misi berjalan.

<b>EKSEKUSI:</b> Ketik <i>"mulai [aktivitas]"</i>`,

  `⏱️ <b>JAM JALAN, KAMU DIAM</b>
Tiap menit nganggur tak akan kembali.

<b>GERAK:</b> Ketik <i>"mulai [aktivitas]"</i>`,

  `🎯 <b>DISIPLIN ≠ MENUNGGU MOOD</b>
Kamu idle — tarik fokusmu kembali.

<b>SEKARANG:</b> Ketik <i>"mulai [aktivitas]"</i>`,
];

/** First generic variant, exported for callers/tests that want a stable string. */
export const IDLE_MESSAGE = IDLE_MESSAGES[0];

/** A random generic idle nudge. */
export function randomIdleMessage(rng: Rng = Math.random): string {
  return pick(IDLE_MESSAGES, rng);
}

// ── Held (on-hold) mission reminder ──────────────────────────────────────────
const HELD_HEADERS = [
  '⏸️ <b>MISI TERTUNDA</b>',
  '🪖 <b>ADA MISI YANG KAMU GANTUNG</b>',
  '⚠️ <b>MISI INI TERLANTAR</b>',
];

/**
 * Reminder about missions put on hold (paused) that are still open. Returns null
 * when nothing is held. Caller is responsible for rate-limiting.
 */
export function buildHeldMissionReminder(
  held: { title: string }[],
  rng: Rng = Math.random
): string | null {
  if (held.length === 0) return null;
  const list = held.map(m => `⏸️ <b>${m.title}</b>`).join('\n');
  return `${pick(HELD_HEADERS, rng)}\n${list}\n\n<b>AKSI:</b> Lanjutkan atau batalkan.`;
}

const MISSED_HEADERS = [
  '☠️ <b>KAMU GAGAL MENEPATI JADWAL</b>',
  '💀 <b>KOMITMEN KAMU SEKARAT</b>',
  '⚠️ <b>KAMU INGKAR JANJI SENDIRI</b>',
  '🚨 <b>JADWAL TERBENGKALAI</b>',
];

const DUE_HEADERS = [
  '⏳ <b>JATAH WAKTU HAMPIR HABIS</b>',
  '🔥 <b>JENDELA EKSEKUSI MENUTUP</b>',
  '⏰ <b>JANGAN SAMPAI GAGAL</b>',
  '🎯 <b>SEKARANG ATAU TIDAK</b>',
];

const CTAS = [
  '<b>WAJIB:</b> Ketik <i>"mulai [aktivitas]"</i>',
  '<b>EKSEKUSI:</b> Ketik <i>"mulai [aktivitas]"</i>',
  '<b>GERAK:</b> Ketik <i>"mulai [aktivitas]"</i>',
  '<b>SEKARANG:</b> Ketik <i>"mulai [aktivitas]"</i>',
];

export type HabitDueStatus = 'due' | 'missed';

export interface DueHabit {
  schedule: HabitScheduleWithNames;
  status: HabitDueStatus;
  /** Minutes past the end of the grace window (status 'missed'). */
  minutesLate: number;
  /** Minutes left before the grace window closes (status 'due'). */
  minutesLeft: number;
}

/** Parse a 'HH:MM[:SS]' time-of-day string into minutes since midnight. */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** 'HH:MM:SS' → 'HH:MM' for display. */
function hhmm(t: string): string {
  return t.slice(0, 5);
}

/**
 * From the active schedules, pick the habits that are currently DUE (inside the
 * grace window) or MISSED (window has closed) for today and have NOT yet been
 * logged. Today's weekday and the current time are read from `now` in the
 * process's local timezone — set TZ to the user's zone for correct windows.
 *
 * Missed habits are listed before due ones; within each, earliest-scheduled first.
 */
export function selectDueHabits(
  schedules: HabitScheduleWithNames[],
  loggedTypeIds: Set<string>,
  now: Date = new Date()
): DueHabit[] {
  const weekday = now.getDay(); // 0=Sunday .. 6=Saturday
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const due: DueHabit[] = [];

  for (const schedule of schedules) {
    if (!schedule.days_of_week.includes(weekday)) continue; // not scheduled today
    if (loggedTypeIds.has(schedule.habit_type_id)) continue; // already done today

    const start = timeToMinutes(schedule.expected_at);
    const end = start + schedule.grace_minutes;

    if (nowMin < start) continue; // not due yet

    if (nowMin <= end) {
      due.push({ schedule, status: 'due', minutesLate: 0, minutesLeft: end - nowMin });
    } else {
      due.push({ schedule, status: 'missed', minutesLate: nowMin - end, minutesLeft: 0 });
    }
  }

  due.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'missed' ? -1 : 1;
    return timeToMinutes(a.schedule.expected_at) - timeToMinutes(b.schedule.expected_at);
  });

  return due;
}

function habitLine(item: DueHabit): string {
  const { schedule, status, minutesLate, minutesLeft } = item;
  const name = `<b>${schedule.habit_type_name}</b> (${schedule.category_name})`;
  const at = hhmm(schedule.expected_at);
  if (status === 'missed') {
    return `☠️ ${name} — ${at}, LEWAT ${formatMinutes(minutesLate)}`;
  }
  return `⏳ ${name} — ${at}, tersisa ${formatMinutes(minutesLeft)}`;
}

/**
 * Loss-aversion reminder: confronts the user with the scheduled habit(s) they
 * are about to lose (or have already lost) today. Returns null when nothing is
 * due or missed — caller should fall back to the generic idle prompt.
 *
 * The header and call-to-action are picked at random from the copy pools above
 * so the message reads differently each time. Pass a fixed `rng` for
 * deterministic output.
 */
export function buildHabitLossAversionMessage(
  schedules: HabitScheduleWithNames[],
  loggedTypeIds: Set<string>,
  now: Date = new Date(),
  rng: Rng = Math.random
): string | null {
  const due = selectDueHabits(schedules, loggedTypeIds, now);
  if (due.length === 0) return null;

  // Show at most ONE missed habit (the earliest/most overdue, already sorted
  // first) to keep the nudge focused; still list habits that are merely due.
  const missed = due.filter(d => d.status === 'missed').slice(0, 1);
  const dueNow = due.filter(d => d.status === 'due');
  const shown = [...missed, ...dueNow];

  const lines = shown.map(habitLine).join('\n');
  const hasMissed = missed.length > 0;

  const header = pick(hasMissed ? MISSED_HEADERS : DUE_HEADERS, rng);
  const cta = pick(CTAS, rng);

  return `${header}\n${lines}\n\n${cta}`;
}

/**
 * Find the most contextually relevant "seharusnya" habit — what the user
 * should have done by now but hasn't logged yet. Used to add habit-aware
 * context to the generic idle message.
 *
 * Today's habits (scheduled time ≤ now, unlogged) are checked first.
 * For early morning (before 08:00), yesterday's evening habits (≥ 18:00)
 * are also checked so cross-midnight habits (e.g. Tidur at 22:00) surface.
 */
export function findSeharusnyaHabit(
  schedules: HabitScheduleWithNames[],
  loggedTypeIds: Set<string>,
  now: Date = new Date()
): HabitScheduleWithNames | null {
  const todayWeekday = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const todayPast = schedules
    .filter(s => s.days_of_week.includes(todayWeekday))
    .filter(s => !loggedTypeIds.has(s.habit_type_id))
    .filter(s => timeToMinutes(s.expected_at) <= nowMin)
    .sort((a, b) => timeToMinutes(b.expected_at) - timeToMinutes(a.expected_at));

  if (todayPast.length > 0) return todayPast[0];

  // Early morning — look at last night's habits (cross-midnight context)
  if (nowMin < 8 * 60) {
    const yesterdayWeekday = (todayWeekday + 6) % 7;
    const lastNight = schedules
      .filter(s => s.days_of_week.includes(yesterdayWeekday))
      .filter(s => timeToMinutes(s.expected_at) >= 18 * 60)
      .sort((a, b) => timeToMinutes(b.expected_at) - timeToMinutes(a.expected_at));

    if (lastNight.length > 0) return lastNight[0];
  }

  return null;
}

/**
 * Build a generic idle nudge, injecting a "seharusnya" line when a
 * relevant unlogged habit is found. Falls back to a plain random message
 * when no habit context is available.
 */
export function buildGenericIdleMessage(
  seharusnya: HabitScheduleWithNames | null,
  rng: Rng = Math.random
): string {
  const base = pick(IDLE_MESSAGES, rng);
  if (!seharusnya) return base;

  const at = hhmm(seharusnya.expected_at);
  const hint =
    `⚠️ <b>SEHARUSNYA:</b> <b>${seharusnya.habit_type_name}</b> ` +
    `(${seharusnya.category_name}) sejak ${at}.`;

  // Inject before the final CTA paragraph
  const paragraphs = base.split('\n\n');
  paragraphs.splice(paragraphs.length - 1, 0, hint);
  return paragraphs.join('\n\n');
}
