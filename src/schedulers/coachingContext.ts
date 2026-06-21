import { Mission, HabitScheduleWithNames, StreakSnapshot } from '../types';
import { formatMinutes } from '../utils/duration';
import { selectDueHabits } from './idleReminderMessages';
import { Tone, toneFor } from '../services/toneGate';

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
  /** 7-day adherence per scheduled habit (worst first) — populated for the morning slot. */
  habitMetrics: HabitAdherence[];
  /** Message tone, decided by the shared tone gate (competence by default). */
  tone: Tone;
  /** Current streaks (overall + per-habit), when available — surfaced in the brief. */
  streaks?: StreakSnapshot | null;
}

/** How well one scheduled habit was kept over the rolling window. */
export interface HabitAdherence {
  habitTypeName: string;
  categoryName: string;
  /** Scheduled occurrences in the window (days the habit was due). */
  scheduled: number;
  /** Of those, how many days the habit was actually logged. */
  logged: number;
}

/**
 * Per-scheduled-habit adherence over the `days` completed days ending yesterday
 * (today excluded — it isn't over yet). For each habit, counts how many of its
 * scheduled days in the window were actually logged. Pure — the caller supplies
 * completed missions. Sorted worst-adherence first so the coach confronts the
 * most-neglected habit (e.g. skipped exercise) before anything else.
 */
export function computeHabitAdherence(
  schedules: HabitScheduleWithNames[],
  completed: Mission[],
  now: Date,
  days = 7
): HabitAdherence[] {
  // habit_type_id → set of local day strings it was logged on.
  const loggedDays = new Map<string, Set<string>>();
  for (const m of completed) {
    if (!m.habit_type_id) continue;
    const day = new Date(m.completed_at ?? m.started_at).toDateString();
    (loggedDays.get(m.habit_type_id) ?? loggedDays.set(m.habit_type_id, new Set()).get(m.habit_type_id)!).add(day);
  }

  const result: HabitAdherence[] = [];
  for (const s of schedules) {
    let scheduled = 0;
    let logged = 0;
    for (let i = 1; i <= days; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      if (!s.days_of_week.includes(d.getDay())) continue;
      scheduled++;
      if (loggedDays.get(s.habit_type_id)?.has(d.toDateString())) logged++;
    }
    if (scheduled > 0) {
      result.push({ habitTypeName: s.habit_type_name, categoryName: s.category_name, scheduled, logged });
    }
  }
  result.sort((a, b) => a.logged / a.scheduled - b.logged / b.scheduled);
  return result;
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
  /** Today's plan-derived schedules for the DUE list (respects skip/move/done).
   *  Multi-day metrics still use `schedules` (the template). Defaults to `schedules`. */
  dueSchedules?: HabitScheduleWithNames[];
  loggedTypeIds: Set<string>;
  now: Date;
  yesterday?: YesterdayReview | null;
  /** Explicit tone (from the shared gate). Defaults to: night = loss-aversion
   *  (nightly debrief), otherwise competence. Callers with streak data should
   *  pass the fully-computed tone. */
  tone?: Tone;
  /** Current streaks for surfacing in the brief. */
  streaks?: StreakSnapshot | null;
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
    due: selectDueHabits(input.dueSchedules ?? input.schedules, input.loggedTypeIds, input.now),
    yesterday: input.yesterday ?? null,
    // The 7-day metric block is a morning concern; skip the work for other slots.
    habitMetrics:
      input.slot === 'pagi' ? computeHabitAdherence(input.schedules, input.recentCompleted, input.now) : [],
    tone: input.tone ?? toneFor({ isNightlyDebrief: input.slot === 'malam' }),
    streaks: input.streaks ?? null,
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

  if (ctx.habitMetrics.length > 0) {
    lines.push('- METRIK KEBIASAAN (7 hari terakhir, dipenuhi/terjadwal):');
    for (const h of ctx.habitMetrics) {
      lines.push(`  • ${h.habitTypeName}: ${h.logged}/${h.scheduled}${adherenceFlag(h)}`);
    }
  }

  if (ctx.streaks) {
    const longestHabit = ctx.streaks.habits.reduce((m, h) => Math.max(m, h.current), 0);
    lines.push(
      `- STREAK: overall ${ctx.streaks.overall.current} hari beruntun ` +
        `(terpanjang ${ctx.streaks.overall.longest}); streak kebiasaan aktif terpanjang: ${longestHabit} hari`
    );
  }

  return lines.join('\n');
}

/** A short tag marking a neglected habit, shared by the prompt summary and fallback. */
function adherenceFlag(h: HabitAdherence): string {
  if (h.logged === 0) return ' ⚠️ TERABAIKAN';
  if (h.logged / h.scheduled < 0.5) return ' ⚠️ sering terlewat';
  return '';
}

/** Morning (07:00), competence-first — the DEFAULT when no inflection point. */
function buildMorningCompetencePrompt(ctx: CoachingContext): string {
  return `Kamu adalah pelatih disiplin bergaya militer untuk seorang operator (sebut dia "kamu").
Tulis SATU pesan coaching PAGI yang SINGKAT dalam Bahasa Indonesia.

FOKUS UTAMA: PENGUATAN KOMPETENSI (mastery). Tinjau METRIK KEBIASAAN 7 HARI dan progres di bawah. Soroti KEMAJUAN nyata (streak yang terjaga, kebiasaan dengan kepatuhan terbaik, momentum minggu ini) untuk membangun rasa mampu, lalu beri SATU saran perbaikan konkret untuk hari ini. JANGAN memakai rasa takut/ancaman kehilangan.

ATURAN WAJIB:
- Tulis 6–8 kalimat — beri ruang untuk elaborasi yang bermakna, jangan terlalu ringkas. Tetap tegas, positif, dan padat.
- Acu angka nyata (mis. "Olahraga 4/5", atau streak) agar pujian terasa konkret; jangan mengarang.
- Beri TEPAT SATU hal yang bisa diperbaiki/ditingkatkan hari ini.
- Boleh 1-2 emoji dan tag <b></b> (Telegram HTML). Tanpa markdown.
- Akhiri dengan satu perintah aksi yang konkret.

DATA SAAT INI:
${contextSummary(ctx)}

Tulis pesannya sekarang.`;
}

/** Morning (07:00) — loss-aversion review of yesterday's habits + what to improve. */
function buildMorningLossAversionPrompt(ctx: CoachingContext): string {
  return `Kamu adalah pelatih disiplin bergaya militer untuk seorang operator (sebut dia "kamu").
Tulis SATU pesan coaching PAGI yang SINGKAT dalam Bahasa Indonesia.

FOKUS UTAMA: LOSS AVERSION. Tinjau METRIK KEBIASAAN 7 HARI di bawah, bukan hanya kemarin. Soroti habit dengan kepatuhan TERBURUK (mis. olahraga yang sering dilewatkan, kerja yang tidak fokus) sebagai kerugian nyata yang menggerus mimpinya, lalu beri SATU saran perbaikan konkret untuk hari ini.

ATURAN WAJIB:
- Tulis 6–8 kalimat — beri ruang untuk elaborasi yang bermakna, jangan terlalu ringkas. Tetap tegas dan padat.
- WAJIB sebut angka metrik habit terburuk (mis. "Olahraga 2/5") agar konfrontasinya nyata, lalu tonjolkan harga yang dibayar jika pola ini berlanjut — bangkitkan rasa TAKUT KEHILANGAN MIMPI.
- Beri TEPAT SATU hal yang bisa diperbaiki hari ini (what could be improved), berdasarkan habit dengan kepatuhan terburuk minggu ini.
- Acu data nyata di bawah; jangan mengarang.
- Boleh 1-2 emoji dan tag <b></b> (Telegram HTML). Tanpa markdown.
- Akhiri dengan satu perintah aksi yang konkret.

DATA SAAT INI:
${contextSummary(ctx)}

Tulis pesannya sekarang.`;
}

/** Tone-specific rule line shared by the siang/malam prompt. */
function toneRule(tone: Tone): string {
  return tone === 'loss_aversion'
    ? '- Setiap pesan HARUS (1) membangkitkan SEMANGAT untuk mengejar mimpi, dan (2) menumbuhkan rasa TAKUT KEHILANGAN MIMPI itu jika disiplin diabaikan (loss aversion).\n' +
        '- Jika ada kebiasaan yang TERLEWAT, SEBUTKAN namanya dan JELASKAN singkat bahwa itu terlewat (kapan dijadwalkan, sudah lewat berapa lama) sebagai kerugian nyata hari ini.'
    : '- FOKUS pada PENGUATAN KOMPETENSI: akui kemajuan dan kemampuan (progres, streak, momentum) untuk membangun rasa mampu. JANGAN memakai rasa takut/ancaman kehilangan.\n' +
        '- Jika ada kebiasaan yang sudah dijaga dengan baik, beri pengakuan; arahkan satu perbaikan kecil tanpa menghakimi.';
}

/**
 * The full prompt sent to Gemini. Tone follows the shared gate on `ctx.tone`:
 * competence by default, loss-aversion only at inflection points (and the
 * nightly debrief). Morning has dedicated competence/loss-aversion variants.
 */
export function buildCoachingPrompt(ctx: CoachingContext): string {
  if (ctx.slot === 'pagi') {
    return ctx.tone === 'loss_aversion'
      ? buildMorningLossAversionPrompt(ctx)
      : buildMorningCompetencePrompt(ctx);
  }
  return `Kamu adalah pelatih disiplin bergaya militer untuk seorang operator (sebut dia "kamu").
Tugasmu: tulis SATU pesan coaching SINGKAT dalam Bahasa Indonesia.

${SLOT_ANGLE[ctx.slot]}

ATURAN WAJIB:
- Tulis 6–8 kalimat — beri ruang untuk elaborasi yang bermakna, jangan terlalu ringkas. Tetap tegas dan padat.
${toneRule(ctx.tone)}
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

/** A one-line streak summary for the morning brief, or '' when unavailable. */
function streakLine(ctx: CoachingContext): string {
  if (!ctx.streaks) return '';
  const longestHabit = ctx.streaks.habits.reduce((m, h) => Math.max(m, h.current), 0);
  const flame = ctx.streaks.overall.current >= 7 ? '🔥' : '✨';
  return `${flame} <b>STREAK:</b> ${ctx.streaks.overall.current} hari beruntun (terpanjang ${ctx.streaks.overall.longest}) · kebiasaan terpanjang ${longestHabit} hari\n\n`;
}

/** Loss-aversion morning fallback grounded in the 7-day habit metrics. */
function fallbackMorning(ctx: CoachingContext): string {
  // Preferred: confront the worst weekly adherence with real numbers.
  if (ctx.habitMetrics.length > 0) {
    const block = ctx.habitMetrics
      .map(h => `• <b>${h.habitTypeName}</b>: ${h.logged}/${h.scheduled}${adherenceFlag(h)}`)
      .join('\n');
    const worst = ctx.habitMetrics[0];
    return (
      `🌅 <b>BRIEFING PAGI — METRIK KEBIASAAN (7 HARI)</b>\n\n${block}\n\n` +
      `Yang paling tergerus: <b>${worst.habitTypeName}</b> (${worst.logged}/${worst.scheduled}). ` +
      `Setiap kali terlewat, mimpimu menjauh selangkah.\n\n` +
      `<b>PERBAIKI HARI INI:</b> Tuntaskan <b>${worst.habitTypeName}</b> lebih awal, sebelum alasan datang.`
    );
  }
  // Fallback to yesterday's outcome when there are no scheduled-habit metrics yet.
  const missed = ctx.yesterday?.missed ?? [];
  const lostLine = missed.length
    ? `Kemarin kamu melewatkan: <b>${missed.join(', ')}</b>. Itu progres yang hilang dan tidak akan kembali.`
    : `Kemarin sudah lewat — apa pun yang tertinggal tidak bisa diulang.`;
  const improve = missed.length
    ? `Prioritaskan <b>${missed[0]}</b> lebih awal hari ini, sebelum alasan datang.`
    : `Mulai satu kebiasaan inti lebih awal dari kemarin.`;
  return `🌅 <b>BRIEFING PAGI — JANGAN KEHILANGAN MIMPIMU</b>\n\n${lostLine} Setiap hari yang bocor menjauhkan kamu dari mimpi.\n\n<b>PERBAIKI HARI INI:</b> ${improve}`;
}

/** Competence-first morning fallback grounded in the 7-day habit metrics. */
function fallbackMorningCompetence(ctx: CoachingContext): string {
  if (ctx.habitMetrics.length > 0) {
    const block = ctx.habitMetrics
      .map(h => `• <b>${h.habitTypeName}</b>: ${h.logged}/${h.scheduled}${adherenceFlag(h)}`)
      .join('\n');
    // Best adherence is at the end (sorted worst-first); worst is the area to lift.
    const best = ctx.habitMetrics[ctx.habitMetrics.length - 1];
    const worst = ctx.habitMetrics[0];
    return (
      `🌅 <b>BRIEFING PAGI — METRIK KEBIASAAN (7 HARI)</b>\n\n${block}\n\n` +
      `Modal terkuatmu: <b>${best.habitTypeName}</b> (${best.logged}/${best.scheduled}) — itu bukti kamu bisa. ` +
      `Pakai momentum yang sama untuk satu titik berikutnya.\n\n` +
      `<b>TINGKATKAN HARI INI:</b> Naikkan <b>${worst.habitTypeName}</b> satu langkah, lebih awal.`
    );
  }
  return `🌅 <b>BRIEFING PAGI — BANGUN MOMENTUM</b>\n\nSetiap hari adalah kesempatan menumpuk satu kemenangan kecil. Mulai dari yang kamu sudah kuasai, lalu tambah satu langkah.\n\n<b>TINGKATKAN HARI INI:</b> Mulai satu kebiasaan inti lebih awal dari kemarin.`;
}

/** Static motivational message used when Gemini is unavailable. */
export function fallbackCoaching(ctx: CoachingContext): string {
  if (ctx.slot === 'pagi') {
    const body = ctx.tone === 'loss_aversion' ? fallbackMorning(ctx) : fallbackMorningCompetence(ctx);
    return `${streakLine(ctx)}${body}`;
  }
  return FALLBACK_BY_SLOT[ctx.slot];
}
