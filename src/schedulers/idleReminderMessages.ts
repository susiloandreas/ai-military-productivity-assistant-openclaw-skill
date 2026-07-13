import { HabitScheduleWithNames } from '../types';
import { formatMinutes } from '../utils/duration';
import { MINIMUM_VIABLE_MINUTES, recoveryState } from '../services/missRecovery';

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

// Escalation headers — used only on a SECOND consecutive miss ("never miss twice").
const MISSED_HEADERS = [
  '☠️ <b>KAMU GAGAL MENEPATI JADWAL</b>',
  '💀 <b>KOMITMEN KAMU SEKARAT</b>',
  '⚠️ <b>KAMU INGKAR JANJI SENDIRI</b>',
  '🚨 <b>JADWAL TERBENGKALAI</b>',
];

// Gentle, recoverable headers — used on a FIRST miss; no shame, the chain is
// still saveable today.
const RECOVERABLE_HEADERS = [
  '🔁 <b>BELUM TERLAMBAT — SELAMATKAN HARI INI</b>',
  '🌱 <b>SATU KALI LEWAT, RANTAI MASIH HIDUP</b>',
  '💪 <b>MASIH BISA DISELAMATKAN</b>',
  '🎯 <b>TUTUP CELAH INI SEBELUM JADI POLA</b>',
];

// Encouraging CTAs for the recoverable path (paired with the minimum-viable offer).
const RECOVERABLE_CTAS = [
  '<b>SELAMATKAN:</b> Ketik <i>"mulai [aktivitas]"</i>',
  '<b>AMANKAN HARI INI:</b> Ketik <i>"mulai [aktivitas]"</i>',
  '<b>JAGA RANTAI:</b> Ketik <i>"mulai [aktivitas]"</i>',
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

// Early-morning window in which yesterday's evening habits are still checked —
// mirrors findSeharusnyaHabit's cross-midnight cutoff below.
const EARLY_MORNING_CUTOFF_MIN = 8 * 60;
// Only habits scheduled this late are eligible for the cross-midnight check —
// keeps an ordinary morning habit from being re-flagged as "yesterday's" all
// day once its own window has simply closed.
const EVENING_HABIT_START_MIN = 18 * 60;

/**
 * From the active schedules, pick the habits that are currently DUE (inside the
 * grace window) or MISSED (window has closed) for today and have NOT yet been
 * logged. Today's weekday and the current time are read from `now` in the
 * process's local timezone — set TZ to the user's zone for correct windows.
 *
 * An evening habit (e.g. Tidur at 22:00) whose window opened yesterday is also
 * checked before 08:00 — otherwise, right after midnight, "now" wraps back to
 * a small minutes-since-midnight value and looks earlier than the habit's own
 * start time, so it reads as "not due yet" instead of hours overdue.
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
    if (loggedTypeIds.has(schedule.habit_type_id)) continue; // already done today

    const start = timeToMinutes(schedule.expected_at);
    const grace = schedule.grace_minutes;

    if (schedule.days_of_week.includes(weekday) && nowMin >= start) {
      const end = start + grace;
      due.push(
        nowMin <= end
          ? { schedule, status: 'due', minutesLate: 0, minutesLeft: end - nowMin }
          : { schedule, status: 'missed', minutesLate: nowMin - end, minutesLeft: 0 }
      );
      continue;
    }

    // Cross-midnight: today's occurrence hasn't started yet by clock time, but
    // if it's a late-evening habit and we're still in the early-morning window,
    // check whether yesterday's occurrence is still open or has just closed.
    if (nowMin < EARLY_MORNING_CUTOFF_MIN && start >= EVENING_HABIT_START_MIN) {
      const yesterdayWeekday = (weekday + 6) % 7;
      if (schedule.days_of_week.includes(yesterdayWeekday)) {
        const elapsed = 24 * 60 - start + nowMin;
        due.push(
          elapsed <= grace
            ? { schedule, status: 'due', minutesLate: 0, minutesLeft: grace - elapsed }
            : { schedule, status: 'missed', minutesLate: elapsed - grace, minutesLeft: 0 }
        );
      }
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

/** The 2-minute minimum-viable offer line for a recoverable miss. */
function minimumViableLine(name: string): string {
  return (
    `🟢 <b>MINIMAL ${MINIMUM_VIABLE_MINUTES} MENIT:</b> versi terkecil pun menjaga rantai — ` +
    `<i>"mulai ${name} ${MINIMUM_VIABLE_MINUTES} menit"</i>.`
  );
}

/** Suggested re-plan time: the next half-hour at least 30 min out, as 'HH:MM'. */
function suggestReplanClock(now: Date): string {
  const mins = now.getHours() * 60 + now.getMinutes();
  const slot = Math.min(Math.ceil((mins + 30) / 30) * 30, 23 * 60 + 59);
  return `${String(Math.floor(slot / 60)).padStart(2, '0')}:${String(slot % 60).padStart(2, '0')}`;
}

/**
 * A propose-&-confirm re-plan offer for a missed habit: suggests a concrete new
 * time the user can confirm by replying with the move command. The plan is NOT
 * changed until they send it.
 */
export function replanLine(name: string, now: Date = new Date()): string {
  return `💡 <b>JADWAL ULANG:</b> Balas <i>"geser ${name} ke ${suggestReplanClock(now)}"</i> untuk pindahkan.`;
}

/**
 * Habit reminder that confronts the user with the scheduled habit(s) due or
 * missed today. Returns null when nothing is due or missed — caller should fall
 * back to the generic idle prompt.
 *
 * Tone follows miss-recovery: a FIRST miss is framed gently (recoverable) with a
 * 2-minute minimum-viable offer; only a SECOND consecutive miss escalates to the
 * loss-aversion headers. `missCountByType` maps a habit_type_id to its number of
 * consecutive missed scheduled days; when absent, a miss is treated as a first
 * (recoverable) miss. Header/CTA are randomized via `rng` for varied phrasing.
 */
export function buildHabitLossAversionMessage(
  schedules: HabitScheduleWithNames[],
  loggedTypeIds: Set<string>,
  now: Date = new Date(),
  rng: Rng = Math.random,
  missCountByType?: Map<string, number>
): string | null {
  const due = selectDueHabits(schedules, loggedTypeIds, now);
  if (due.length === 0) return null;

  // Show at most ONE missed habit (the earliest/most overdue, already sorted
  // first) to keep the nudge focused; still list habits that are merely due.
  const missed = due.filter(d => d.status === 'missed').slice(0, 1);
  const dueNow = due.filter(d => d.status === 'due');
  const shown = [...missed, ...dueNow];

  const lines = shown.map(habitLine).join('\n');

  // Only due (nothing missed): keep the existing urgency framing.
  if (missed.length === 0) {
    return `${pick(DUE_HEADERS, rng)}\n${lines}\n\n${pick(CTAS, rng)}`;
  }

  // A miss exists — decide gentle vs escalate from its consecutive-miss count.
  const missedHabit = missed[0].schedule;
  const misses = missCountByType?.get(missedHabit.habit_type_id) ?? 1;
  const { decision, offerMinimumViable } = recoveryState(misses);

  if (decision === 'escalate') {
    return `${pick(MISSED_HEADERS, rng)}\n${lines}\n\n${pick(CTAS, rng)}`;
  }

  const offer = offerMinimumViable ? `\n${minimumViableLine(missedHabit.habit_type_name)}` : '';
  return `${pick(RECOVERABLE_HEADERS, rng)}\n${lines}${offer}\n\n${pick(RECOVERABLE_CTAS, rng)}`;
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

// ── Habit conflict when starting a mission ───────────────────────────────────

/** Find habits that are due or missed right now when starting a new mission. */
export function findConflictingHabits(
  schedules: HabitScheduleWithNames[],
  loggedTypeIds: Set<string>,
  now: Date = new Date()
): DueHabit[] {
  const due = selectDueHabits(schedules, loggedTypeIds, now);
  return due;
}
