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
  `🚨 <b>HEY, KAMU LAGI NGAPAIN?</b>

Sudah 15 menit tidak ada misi aktif. Tidak ada aktivitas yang tercatat.
Kamu istirahat atau memang tidak ngapa-ngapain?

<b>WAJIB:</b> Sebutkan misi kamu. Ketik ke OpenClaw: <i>"mulai [aktivitas]"</i>`,

  `🪖 <b>LAPOR: KAMU SEDANG APA?</b>

Radar kosong — tidak ada misi berjalan. Waktu netral itu waktu yang hilang.
Ambil kendali sekarang, jangan biarkan jam yang memimpin.

<b>EKSEKUSI:</b> Ketik ke OpenClaw: <i>"mulai [aktivitas]"</i>`,

  `⏱️ <b>JAM TERUS BERJALAN, KAMU TIDAK</b>

Tidak ada misi aktif. Setiap menit menganggur tidak akan kembali.
Pilih satu hal dan kerjakan — sekarang.

<b>GERAK:</b> Laporkan misimu — ketik <i>"mulai [aktivitas]"</i>`,

  `🎯 <b>DISIPLIN BUKAN MENUNGGU MOOD</b>

Kamu idle. Bukan tubuhmu yang lelah, tapi fokusmu yang kabur.
Tarik kembali. Tentukan target berikutnya.

<b>SEKARANG:</b> Tidak ada alasan. Ketik <i>"mulai [aktivitas]"</i>`,
];

/** First generic variant, exported for callers/tests that want a stable string. */
export const IDLE_MESSAGE = IDLE_MESSAGES[0];

/** A random generic idle nudge. */
export function randomIdleMessage(rng: Rng = Math.random): string {
  return pick(IDLE_MESSAGES, rng);
}

const MISSED_HEADERS = [
  '☠️ <b>KAMU GAGAL MENEPATI JADWAL HARI INI</b>',
  '💀 <b>KOMITMEN KAMU SEDANG SEKARAT</b>',
  '⚠️ <b>KAMU MENGKHIANATI RENCANA SENDIRI</b>',
  '🚨 <b>JADWAL TERBENGKALAI — INI KEGAGALAN</b>',
];

const DUE_HEADERS = [
  '⏳ <b>JATAH WAKTU KAMU HAMPIR HABIS</b>',
  '🔥 <b>JENDELA EKSEKUSI SEDANG MENUTUP</b>',
  '⏰ <b>CLOCK BERDETAK — JANGAN SAMPAI GAGAL</b>',
  '🎯 <b>SEKARANG ATAU TIDAK SAMA SEKALI</b>',
];

const INTROS = [
  'Kamu idle. Ini yang kamu janjikan ke diri sendiri dan belum kamu kerjakan:',
  'Kamu diam. Padahal ini sudah kamu jadwalkan dan masih kosong:',
  'Tidak ada misi aktif. Komitmen yang menunggu kamu tepati:',
  'Kamu santai, tapi daftar ini sedang menatap kamu:',
];

const MISSED_CLOSERS = [
  'Hari ini tidak bisa kamu ulang. Jangan biarkan rantai disiplin kamu putus lagi.',
  'Waktu yang lewat tidak akan kembali. Tebus sisa hari ini.',
  'Kegagalan kecil menumpuk jadi kebiasaan. Putus siklusnya sekarang.',
  'Kamu lebih baik dari ini. Buktikan di sisa hari ini.',
];

const DUE_CLOSERS = [
  'Window masih terbuka — TAPI TIDAK LAMA. Eksekusi sebelum jadi catatan GAGAL.',
  'Masih sempat. Bergerak sekarang sebelum jendela ini tertutup.',
  'Disiplin = melakukan saat tidak ingin. Sekarang waktunya.',
  'Jangan tunggu mood. Mulai, dan momentum akan menyusul.',
];

const CTAS = [
  '<b>WAJIB:</b> Mulai sekarang. Ketik ke OpenClaw: <i>"mulai [aktivitas]"</i>',
  '<b>EKSEKUSI:</b> Ketik ke OpenClaw: <i>"mulai [aktivitas]"</i>',
  '<b>GERAK:</b> Laporkan misimu — ketik <i>"mulai [aktivitas]"</i>',
  '<b>SEKARANG:</b> Tidak ada alasan. Ketik <i>"mulai [aktivitas]"</i>',
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
    return `☠️ ${name} — jadwal ${at}, sudah LEWAT ${formatMinutes(minutesLate)}`;
  }
  return `⏳ ${name} — jadwal ${at}, tersisa ${formatMinutes(minutesLeft)} sebelum GAGAL`;
}

/**
 * Loss-aversion reminder: confronts the user with the scheduled habit(s) they
 * are about to lose (or have already lost) today. Returns null when nothing is
 * due or missed — caller should fall back to the generic idle prompt.
 *
 * The header, intro, closer, and call-to-action are picked at random from the
 * copy pools above so the message reads differently each time. Pass a fixed
 * `rng` for deterministic output.
 */
export function buildHabitLossAversionMessage(
  schedules: HabitScheduleWithNames[],
  loggedTypeIds: Set<string>,
  now: Date = new Date(),
  rng: Rng = Math.random
): string | null {
  const due = selectDueHabits(schedules, loggedTypeIds, now);
  if (due.length === 0) return null;

  const lines = due.map(habitLine).join('\n');
  const hasMissed = due.some(d => d.status === 'missed');

  const header = pick(hasMissed ? MISSED_HEADERS : DUE_HEADERS, rng);
  const intro = pick(INTROS, rng);
  const closer = pick(hasMissed ? MISSED_CLOSERS : DUE_CLOSERS, rng);
  const cta = pick(CTAS, rng);

  return `\
${header}

${intro}

${lines}

${closer}

${cta}`;
}
