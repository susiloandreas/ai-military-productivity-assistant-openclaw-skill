import { Mission, HabitScheduleWithNames } from '../types';
import { formatMinutes } from '../utils/duration';
import { selectDueHabits } from './idleReminderMessages';

/**
 * Builds the Gemini coaching prompt and a static fallback from the user's
 * current mission/habit state. Pure functions — no DB or network — so the
 * prompt shape and scheduling are unit-testable; the worker wires in the data.
 */

export type CoachingSlot = 'pagi' | 'siang' | 'malam';

/** The three daily coaching hours (local time): 07:00, 13:00, 23:00. */
export const COACHING_HOURS = [7, 13, 23];

export function slotForHour(hour: number): CoachingSlot {
  if (hour < 12) return 'pagi';
  if (hour < 18) return 'siang';
  return 'malam';
}

/**
 * True when `now` is within `windowMin` minutes (before or after) of any
 * coaching slot. Used by the idle reminder to step aside so it never fires a
 * second notification on top of the scheduled coaching message.
 */
export function isNearCoachingSlot(
  now: Date,
  windowMin = 15,
  hours: number[] = COACHING_HOURS
): boolean {
  const minsNow = now.getHours() * 60 + now.getMinutes();
  return hours.some(h => Math.abs(minsNow - h * 60) <= windowMin);
}

/** Stable per-day, per-slot key for de-duplicating a coaching notification. */
export function coachingDedupKey(now: Date, slot: CoachingSlot): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `coaching:${y}-${m}-${d}:${slot}`;
}

/**
 * Delay (ms) until the next coaching hour, and which hour it is. Picks the
 * soonest future hour today, else the first hour tomorrow.
 */
export function nextRunDelayMs(now: Date, hours: number[] = COACHING_HOURS): { delayMs: number; hour: number } {
  const sorted = [...hours].sort((a, b) => a - b);
  for (const h of sorted) {
    const t = new Date(now);
    t.setHours(h, 0, 0, 0);
    if (t.getTime() > now.getTime()) return { delayMs: t.getTime() - now.getTime(), hour: h };
  }
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  t.setHours(sorted[0], 0, 0, 0);
  return { delayMs: t.getTime() - now.getTime(), hour: sorted[0] };
}

export interface YesterdayReview {
  /** Scheduled habit names that were logged yesterday. */
  done: string[];
  /** Scheduled habit names that were NOT logged yesterday. */
  missed: string[];
}

export interface CoachingContext {
  slot: CoachingSlot;
  activeMission: Mission | null;
  heldCount: number;
  /** Completed today (mode + title + minutes). */
  todayCompleted: { title: string; minutes: number }[];
  weekCompletedCount: number;
  /** Scheduled habits still due or already missed today. */
  due: ReturnType<typeof selectDueHabits>;
  /** Yesterday's scheduled-habit outcome — populated for the morning slot. */
  yesterday: YesterdayReview | null;
}

/**
 * Compare yesterday's scheduled habits against what was logged yesterday.
 * `now` determines yesterday's weekday. Pure — caller supplies the logged set.
 */
export function selectYesterdayHabits(
  schedules: HabitScheduleWithNames[],
  loggedYesterdayTypeIds: Set<string>,
  now: Date
): YesterdayReview {
  const yesterdayWeekday = (now.getDay() + 6) % 7;
  const done: string[] = [];
  const missed: string[] = [];
  for (const s of schedules) {
    if (!s.days_of_week.includes(yesterdayWeekday)) continue;
    (loggedYesterdayTypeIds.has(s.habit_type_id) ? done : missed).push(s.habit_type_name);
  }
  return { done, missed };
}

/** Assemble the context from already-fetched data (keeps this layer pure). */
export function buildCoachingContext(input: {
  slot: CoachingSlot;
  activeMission: Mission | null;
  held: Mission[];
  recentCompleted: Mission[];
  schedules: HabitScheduleWithNames[];
  loggedTypeIds: Set<string>;
  now: Date;
  yesterday?: YesterdayReview | null;
}): CoachingContext {
  const startOfToday = new Date(input.now);
  startOfToday.setHours(0, 0, 0, 0);

  const todayCompleted = input.recentCompleted
    .filter(m => m.completed_at && new Date(m.completed_at) >= startOfToday)
    .map(m => ({ title: m.title, minutes: m.actual_duration_minutes ?? 0 }));

  return {
    slot: input.slot,
    activeMission: input.activeMission,
    heldCount: input.held.length,
    todayCompleted,
    weekCompletedCount: input.recentCompleted.length,
    due: selectDueHabits(input.schedules, input.loggedTypeIds, input.now),
    yesterday: input.yesterday ?? null,
  };
}

const SLOT_ANGLE: Record<CoachingSlot, string> = {
  pagi: 'Ini briefing PAGI. Tetapkan satu target utama hari ini dan nyalakan semangat untuk merebut mimpi.',
  siang: 'Ini check SIANG. Evaluasi cepat progres setengah hari, koreksi arah sebelum hari habis.',
  malam: 'Ini debrief MALAM. Tinjau hari ini dengan jujur; ingatkan konsekuensi jika rantai disiplin putus.',
};

/** Compact, human-readable snapshot of the state for the LLM. */
export function contextSummary(ctx: CoachingContext): string {
  const lines: string[] = [];
  lines.push(
    ctx.activeMission
      ? `- Misi aktif: "${ctx.activeMission.title}"${ctx.activeMission.eta_minutes ? ` (ETA ${formatMinutes(ctx.activeMission.eta_minutes)})` : ''}`
      : '- Misi aktif: TIDAK ADA'
  );
  if (ctx.heldCount > 0) lines.push(`- Misi tertunda (on hold): ${ctx.heldCount}`);
  lines.push(
    ctx.todayCompleted.length > 0
      ? `- Selesai hari ini: ${ctx.todayCompleted.map(t => `${t.title} (${formatMinutes(t.minutes)})`).join(', ')}`
      : '- Selesai hari ini: BELUM ADA'
  );
  lines.push(`- Total misi selesai 7 hari terakhir: ${ctx.weekCompletedCount}`);

  const missed = ctx.due.filter(d => d.status === 'missed');
  const dueNow = ctx.due.filter(d => d.status === 'due').map(d => d.schedule.habit_type_name);
  // Include the schedule + how overdue so the coach can explain WHY it was missed.
  if (missed.length > 0) {
    lines.push(
      `- Kebiasaan TERLEWAT hari ini: ${missed
        .map(d => `${d.schedule.habit_type_name} (dijadwalkan ${d.schedule.expected_at.slice(0, 5)}, sudah lewat ${formatMinutes(d.minutesLate)})`)
        .join(', ')}`
    );
  }
  if (dueNow.length > 0) lines.push(`- Kebiasaan menunggu (masih sempat): ${dueNow.join(', ')}`);
  if (missed.length === 0 && dueNow.length === 0) lines.push('- Kebiasaan terjadwal: aman / tidak ada yang jatuh tempo');

  if (ctx.yesterday) {
    lines.push(
      `- KEMARIN selesai: ${ctx.yesterday.done.length ? ctx.yesterday.done.join(', ') : 'tidak ada'}`
    );
    lines.push(
      `- KEMARIN TERLEWAT: ${ctx.yesterday.missed.length ? ctx.yesterday.missed.join(', ') : 'tidak ada'}`
    );
  }

  return lines.join('\n');
}

/** Morning (07:00) — loss-aversion review of yesterday's habits + what to improve. */
function buildMorningLossAversionPrompt(ctx: CoachingContext): string {
  return `Kamu adalah pelatih disiplin bergaya militer untuk seorang operator (sebut dia "kamu").
Tulis SATU pesan coaching PAGI yang SINGKAT dalam Bahasa Indonesia.

FOKUS UTAMA: LOSS AVERSION. Tinjau KEBIASAAN KEMARIN. Soroti yang TERLEWAT sebagai kerugian nyata yang menggerus mimpinya, lalu beri SATU saran perbaikan konkret untuk hari ini.

ATURAN WAJIB:
- Maksimal 4 kalimat. Tegas, padat, tanpa basa-basi.
- Tonjolkan apa yang HILANG kemarin dan harga yang dibayar jika pola ini berlanjut — bangkitkan rasa TAKUT KEHILANGAN MIMPI.
- Beri TEPAT SATU hal yang bisa diperbaiki hari ini (what could be improved), berdasarkan kebiasaan yang terlewat kemarin.
- Acu data nyata di bawah; jangan mengarang.
- Boleh 1-2 emoji dan tag <b></b> (Telegram HTML). Tanpa markdown.
- Akhiri dengan satu perintah aksi yang konkret.

DATA SAAT INI:
${contextSummary(ctx)}

Tulis pesannya sekarang.`;
}

/** The full prompt sent to Gemini. Morning uses the loss-aversion variant. */
export function buildCoachingPrompt(ctx: CoachingContext): string {
  if (ctx.slot === 'pagi') return buildMorningLossAversionPrompt(ctx);
  return `Kamu adalah pelatih disiplin bergaya militer untuk seorang operator (sebut dia "kamu").
Tugasmu: tulis SATU pesan coaching SINGKAT dalam Bahasa Indonesia.

${SLOT_ANGLE[ctx.slot]}

ATURAN WAJIB:
- Maksimal 4 kalimat. Tegas, padat, tanpa basa-basi.
- Setiap pesan HARUS (1) membangkitkan SEMANGAT untuk mengejar mimpi, dan (2) menumbuhkan rasa TAKUT KEHILANGAN MIMPI itu jika disiplin diabaikan (loss aversion).
- Jika ada kebiasaan yang TERLEWAT, SEBUTKAN namanya dan JELASKAN singkat bahwa itu terlewat (kapan dijadwalkan, sudah lewat berapa lama) sebagai kerugian nyata hari ini.
- Acu data nyata di bawah; jangan mengarang angka.
- Boleh pakai 1-2 emoji dan tag <b></b> untuk penekanan (format Telegram HTML). Jangan pakai markdown.
- Akhiri dengan satu perintah aksi yang konkret.

DATA SAAT INI:
${contextSummary(ctx)}

Tulis pesannya sekarang.`;
}

const FALLBACK_BY_SLOT: Record<CoachingSlot, string> = {
  pagi: `🌅 <b>BRIEFING PAGI</b>\n\nHari ini cuma datang sekali — dan mimpimu menunggu di ujungnya. Rebut satu kemenangan pagi ini, atau biarkan ia menjauh selangkah lagi.\n\n<b>AKSI:</b> Tentukan misi pertamamu sekarang.`,
  siang: `☀️ <b>CHECK SIANG</b>\n\nSetengah hari sudah lewat. Setiap jam menganggur adalah mimpi yang kamu relakan pergi. Koreksi arah sebelum terlambat.\n\n<b>AKSI:</b> Mulai atau lanjutkan satu misi sekarang.`,
  malam: `🌙 <b>DEBRIEF MALAM</b>\n\nHari ini tidak bisa diulang. Kalau rantai disiplin putus malam ini, mimpimu ikut memudar. Tutup hari dengan benar.\n\n<b>AKSI:</b> Catat progres atau selesaikan kebiasaan terakhirmu.`,
};

/** Loss-aversion morning fallback grounded in yesterday's missed habits. */
function fallbackMorning(ctx: CoachingContext): string {
  const missed = ctx.yesterday?.missed ?? [];
  const lostLine = missed.length
    ? `Kemarin kamu melewatkan: <b>${missed.join(', ')}</b>. Itu progres yang hilang dan tidak akan kembali.`
    : `Kemarin sudah lewat — apa pun yang tertinggal tidak bisa diulang.`;
  const improve = missed.length
    ? `Prioritaskan <b>${missed[0]}</b> lebih awal hari ini, sebelum alasan datang.`
    : `Mulai satu kebiasaan inti lebih awal dari kemarin.`;
  return `🌅 <b>BRIEFING PAGI — JANGAN KEHILANGAN MIMPIMU</b>\n\n${lostLine} Setiap hari yang bocor menjauhkan kamu dari mimpi.\n\n<b>PERBAIKI HARI INI:</b> ${improve}`;
}

/** Static motivational message used when Gemini is unavailable. */
export function fallbackCoaching(ctx: CoachingContext): string {
  if (ctx.slot === 'pagi') return fallbackMorning(ctx);
  return FALLBACK_BY_SLOT[ctx.slot];
}
