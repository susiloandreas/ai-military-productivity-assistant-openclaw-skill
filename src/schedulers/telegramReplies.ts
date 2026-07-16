/**
 * Reply copy for the Telegram listener. Indonesian military-coaching tone with
 * randomized variants per slot — so the bot never answers the same way twice,
 * mirroring the idle-reminder copy pools. All builders take an injectable `rng`
 * so tests can be deterministic.
 */
import { Mission, HabitScheduleWithNames, PlanBlock, CalendarEventRecord } from '../types';
import { MissionCompleteResult } from '../services/MissionService';
import { formatMinutes } from '../utils/duration';
import { formatClockTime } from '../utils/formatter';
import type { DueHabit } from './idleReminderMessages';

export type Rng = () => number;

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

/** Projected clock time an ETA will expire, from the mission's start time. */
function etaEndTime(mission: Mission): string | null {
  if (mission.eta_minutes == null) return null;
  const end = new Date(mission.started_at.getTime() + mission.eta_minutes * 60000);
  return formatClockTime(end);
}

// ── Mission started ──────────────────────────────────────────────────────────
const STARTED_HEADERS = [
  '🎯 <b>MISI DITERIMA — EKSEKUSI SEKARANG</b>',
  '🪖 <b>MISI AKTIF. JAM MULAI BERDETAK.</b>',
  '🔥 <b>SIAP TEMPUR — MISI BERJALAN</b>',
  '⚡ <b>MISI TERCATAT. FOKUS TOTAL.</b>',
];

const STARTED_CLOSERS = [
  'Tutup semua distraksi. Kerjakan sampai tuntas.',
  'Tidak ada mundur. Selesaikan, lapor saat beres.',
  'Satu target, satu fokus. Gas.',
  'Disiplin sekarang, bangga nanti. Mulai.',
];

const HELD_REMINDERS = [
  'Jangan ditinggal — selesaikan setelah misi ini beres.',
  'Masih ngutang ini. Tutup setelah yang sekarang selesai.',
  'Belum tuntas. Balik ke sini begitu misi aktif kelar.',
];

export function replyStarted(
  mission: Mission,
  categoryName: string | null,
  heldMission: Mission | null = null,
  rng: Rng = Math.random
): string {
  const lines = [`📌 <b>${mission.title}</b>`];
  if (mission.eta_minutes) {
    lines.push(`⏱️ ETA: <b>${formatMinutes(mission.eta_minutes)}</b>`);
    const endTime = etaEndTime(mission);
    if (endTime) lines.push(`🏁 Estimasi selesai: <b>${endTime}</b>`);
  }
  if (mission.habit_category_id && categoryName) lines.push(`🏷️ Kategori: ${categoryName}`);
  let msg = `${pick(STARTED_HEADERS, rng)}\n\n${lines.join('\n')}\n\n${pick(STARTED_CLOSERS, rng)}`;
  if (heldMission) {
    msg += `\n\n⏸️ <b>MISI SEBELUMNYA DITAHAN:</b> ${heldMission.title}\n${pick(HELD_REMINDERS, rng)}`;
  }
  return msg;
}

// ── Mission completed ────────────────────────────────────────────────────────
const COMPLETED_HEADERS = [
  '✅ <b>MISI TUNTAS. KERJA BAGUS.</b>',
  '🏅 <b>SELESAI — SATU KEMENANGAN LAGI</b>',
  '💪 <b>MISI BERES. MOMENTUM TERJAGA.</b>',
  '🎖️ <b>EKSEKUSI SELESAI. CATAT, LANJUT.</b>',
];

const COMPLETED_CLOSERS = [
  'Jangan berhenti di sini — tentukan target berikutnya.',
  'Konsistensi mengalahkan intensitas. Pertahankan.',
  'Rantai disiplin bertambah satu. Jaga jangan putus.',
  'Istirahat sebentar kalau perlu, lalu serang lagi.',
];

// "What did you do?" prompts — asked after a completion or ETA expiry; the next
// free-text reply is captured into the mission's notes.
const ASK_NOTES = [
  '📝 Apa yang kamu kerjakan? Balas pesan ini — akan aku catat di notes.',
  '📝 Lapor: apa saja yang sudah kamu selesaikan? Balasanmu masuk ke notes.',
  '📝 Ceritakan singkat hasilnya. Balas, dan aku simpan ke notes misi ini.',
];

export function replyCompleted(
  result: MissionCompleteResult,
  rng: Rng = Math.random,
  streakCount = 0
): string {
  const { mission, goalProgress } = result;
  const lines = [`📌 <b>${mission.title}</b>`];
  if (mission.actual_duration_minutes != null) {
    lines.push(`⏱️ Durasi: <b>${formatMinutes(mission.actual_duration_minutes)}</b>`);
  }
  if (mission.completed_at) {
    lines.push(`🏁 Selesai pukul: <b>${formatClockTime(mission.completed_at)}</b>`);
  }
  if (streakCount > 0) lines.push(`🔥 Streak: <b>${streakCount} hari beruntun</b>`);
  if (mission.notes) lines.push(`📝 ${mission.notes}`);
  if (goalProgress) {
    if (goalProgress.goalCompleted) {
      lines.push(`🏆 GOAL TUNTAS: <b>${goalProgress.goal.title}</b>`);
    } else if (goalProgress.milestonesUnlocked.length > 0) {
      lines.push(`🚩 Milestone: ${goalProgress.milestonesUnlocked.map(m => m.title).join(', ')}`);
    }
    lines.push(`📈 Progress goal: ${formatMinutes(goalProgress.totalProgress)}`);
  }
  // Notes already captured inline ("selesai, <notes>") — confirm them instead of
  // asking again. Otherwise prompt for "what did you do?".
  const tail = mission.notes ? '' : `\n\n${pick(ASK_NOTES, rng)}`;
  return `${pick(COMPLETED_HEADERS, rng)}\n\n${lines.join('\n')}\n\n${pick(COMPLETED_CLOSERS, rng)}${tail}`;
}

const ETA_EXPIRED_HEADERS = [
  '⏰ <b>ETA HABIS</b>',
  '🔔 <b>WAKTU MISI SUDAH LEWAT</b>',
  '⌛ <b>BATAS WAKTU TERCAPAI</b>',
];

const RESOLVE_INSTRUCTION =
  'Lapor status-nya (catatan boleh nyusul kalau belum sempat):\n' +
  '✅ <i>selesai</i> — atau langsung <i>selesai, &lt;apa yang kamu kerjakan&gt;</i>\n' +
  '❌ <i>belum</i> — atau langsung <i>belum, &lt;kenapa / sampai mana&gt;</i>';

/**
 * Sent by the ETA worker when a mission's timer expires — the user MUST reply
 * with a completion status (done / not done); notes can follow separately.
 */
export function replyEtaExpiredAskNotes(mission: Mission, rng: Rng = Math.random): string {
  const eta = mission.eta_minutes != null ? ` (ETA ${formatMinutes(mission.eta_minutes)})` : '';
  return `${pick(ETA_EXPIRED_HEADERS, rng)}\n\n📌 <b>${mission.title}</b>${eta}\n\n${RESOLVE_INSTRUCTION}`;
}

/** Re-prompt when the expiry reply carries no recognizable status at all. */
export function replyExpiryNeedsStatus(): string {
  return `⚠️ Butuh <b>status</b>-nya dulu: selesai atau belum?\n\n${RESOLVE_INSTRUCTION}`;
}

/** Confirmation after an expired mission is resolved as completed / not completed. */
export function replyExpiryResolved(
  result: MissionCompleteResult,
  rng: Rng = Math.random,
  streakCount = 0
): string {
  const { mission, goalProgress } = result;
  const done = mission.status === 'completed';
  const header = done
    ? '✅ <b>DITUTUP: SELESAI</b>'
    : '❌ <b>DITUTUP: TIDAK SELESAI</b>';
  const lines = [`📌 <b>${mission.title}</b>`];
  if (done && mission.actual_duration_minutes != null) {
    lines.push(`⏱️ Durasi: <b>${formatMinutes(mission.actual_duration_minutes)}</b>`);
  }
  if (done && mission.completed_at) {
    lines.push(`🏁 Selesai pukul: <b>${formatClockTime(mission.completed_at)}</b>`);
  }
  if (done && streakCount > 0) lines.push(`🔥 Streak: <b>${streakCount} hari beruntun</b>`);
  if (mission.notes) lines.push(`📝 ${mission.notes}`);
  if (done && goalProgress) {
    if (goalProgress.goalCompleted) lines.push(`🏆 GOAL TUNTAS: <b>${goalProgress.goal.title}</b>`);
    else if (goalProgress.milestonesUnlocked.length > 0) {
      lines.push(`🚩 Milestone: ${goalProgress.milestonesUnlocked.map(m => m.title).join(', ')}`);
    }
    lines.push(`📈 Progress goal: ${formatMinutes(goalProgress.totalProgress)}`);
  }
  const closer = done
    ? pick(COMPLETED_CLOSERS, rng)
    : 'Tidak apa gagal sekali — yang fatal itu berhenti. Tentukan langkah berikutnya.';
  // Status was reported without notes ("selesai" alone) — ask for them now;
  // the next free-text reply is captured, same as a normal completion.
  const tail = mission.notes ? '' : `\n\n${pick(ASK_NOTES, rng)}`;
  return `${header}\n\n${lines.join('\n')}\n\n${closer}${tail}`;
}

const NOTES_SAVED = [
  '✅ Dicatat. Notes tersimpan.',
  '✅ Tercatat di notes misi. Mantap.',
  '✅ Sip, sudah aku simpan ke notes.',
];

/** Confirmation after capturing the user's reply into a mission's notes. */
export function replyNotesSaved(mission: Mission, rng: Rng = Math.random): string {
  return `${pick(NOTES_SAVED, rng)}\n\n📌 <b>${mission.title}</b>`;
}

// ── Next-up nudge ────────────────────────────────────────────────────────────

const NEXT_UP_HEADERS = [
  '🎯 <b>SELANJUTNYA</b>',
  '➡️ <b>TARGET BERIKUTNYA</b>',
];

/**
 * Points at the next scheduled block after a mission closes, so the operator
 * flows straight into it instead of going idle. Null when nothing is left on
 * today's plan — the idle worker remains the backstop in that case.
 */
export function replyNextUp(block: PlanBlock | null, rng: Rng = Math.random): string | null {
  if (!block) return null;
  return (
    `${pick(NEXT_UP_HEADERS, rng)}\n\n` +
    `${hhmm(block.start_time)} · <b>${block.title}</b>\n\n` +
    `Mulai kalau sudah siap: <i>"mulai ${block.title}"</i>`
  );
}

// ── Mission aborted ──────────────────────────────────────────────────────────
const ABORTED_HEADERS = [
  '🛑 <b>MISI DIBATALKAN</b>',
  '⚠️ <b>MISI DIHENTIKAN — DICATAT GAGAL</b>',
  '🔻 <b>ABORT. MISI DITUTUP.</b>',
];

const ABORTED_CLOSERS = [
  'Batal bukan kalah — selama kamu mulai lagi. Tentukan langkah berikutnya.',
  'Evaluasi cepat: kenapa berhenti? Lalu bangkit dengan misi baru.',
  'Reset. Tarik napas. Pilih satu target dan eksekusi ulang.',
];

export function replyAborted(mission: Mission, rng: Rng = Math.random): string {
  return `${pick(ABORTED_HEADERS, rng)}\n\n📌 <b>${mission.title}</b>\n\n${pick(ABORTED_CLOSERS, rng)}`;
}

/** Asked when an abort can't pick one mission — lists candidates to name. */
export function replyAbortNeedsTarget(candidates: { title: string }[]): string {
  const list = candidates.map(m => `⏸️ <b>${m.title}</b>`).join('\n');
  return `⚠️ <b>MISI MANA YANG DIBATALKAN?</b>\n\n${list}\n\n<b>SEBUTKAN:</b> mis. <i>"batalkan ${candidates[0]?.title ?? '<judul>'}"</i>`;
}

// ── Mission extended ─────────────────────────────────────────────────────────
const EXTENDED_HEADERS = [
  '⏳ <b>WAKTU DITAMBAH — TIDAK ADA ALASAN LAGI</b>',
  '🕒 <b>ETA DIPERPANJANG. MANFAATKAN.</b>',
  '➕ <b>TAMBAHAN WAKTU DIBERIKAN</b>',
];

const EXTENDED_CLOSERS = [
  'Ini perpanjangan terakhir di kepalamu. Tutup sekarang.',
  'Waktu ekstra bukan untuk santai — untuk menyelesaikan.',
  'Pakai setiap menit. Lapor saat tuntas.',
];

export function replyExtended(mission: Mission, rng: Rng = Math.random): string {
  let eta = '';
  if (mission.eta_minutes != null) {
    eta = `⏱️ ETA baru: <b>${formatMinutes(mission.eta_minutes)}</b>\n`;
    const endTime = etaEndTime(mission);
    if (endTime) eta += `🏁 Estimasi selesai: <b>${endTime}</b>\n`;
    eta += '\n';
  }
  return `${pick(EXTENDED_HEADERS, rng)}\n\n📌 <b>${mission.title}</b>\n${eta}${pick(EXTENDED_CLOSERS, rng)}`;
}

const NEED_DURATION = [
  '⚠️ Mau diperpanjang berapa lama? Contoh: <i>"tambahin 30 menit"</i>.',
  '⚠️ Sebutkan durasinya. Contoh: <i>"perpanjang 1 jam"</i>.',
  '⚠️ Berapa lama tambahannya? Misal <i>"extend 20m"</i>.',
];

export function replyNeedExtendDuration(rng: Rng = Math.random): string {
  return pick(NEED_DURATION, rng);
}

// ── Mission status ───────────────────────────────────────────────────────────
const NO_MISSION = [
  '🚨 <b>TIDAK ADA MISI AKTIF</b>\n\nRadar kosong. Mulai sekarang: <i>"mulai [aktivitas]"</i>.',
  '🪖 <b>STATUS: IDLE</b>\n\nTidak ada yang berjalan. Tentukan misi: <i>"mulai [aktivitas]"</i>.',
  '⏱️ <b>NIHIL — TIDAK ADA OPERASI</b>\n\nWaktu netral itu waktu hilang. Mulai: <i>"mulai [aktivitas]"</i>.',
];

const STATUS_HEADERS = [
  '🎯 <b>STATUS MISI</b>',
  '🪖 <b>LAPORAN MISI AKTIF</b>',
  '📡 <b>MISI SEDANG BERJALAN</b>',
];

export function replyStatus(
  mission: Mission | null,
  held: Mission[] = [],
  rng: Rng = Math.random
): string {
  let base: string;
  if (!mission) {
    base = pick(NO_MISSION, rng);
  } else {
    const startedAt = mission.started_at ? new Date(mission.started_at) : new Date();
    const elapsed = Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 60000));
    const lines = [`📌 <b>${mission.title}</b>`, `⏱️ Berjalan: <b>${formatMinutes(elapsed)}</b>`];
    if (mission.eta_minutes != null) {
      const remaining = mission.eta_minutes - elapsed;
      lines.push(
        remaining > 0
          ? `🎯 Sisa ETA: <b>${formatMinutes(remaining)}</b>`
          : `🔥 ETA LEWAT <b>${formatMinutes(-remaining)}</b> — tutup atau perpanjang.`
      );
    }
    base = `${pick(STATUS_HEADERS, rng)}\n\n${lines.join('\n')}`;
  }

  if (held.length > 0) {
    const list = held.map(m => `⏸️ ${m.title}`).join('\n');
    base += `\n\n<b>DITAHAN (${held.length}):</b>\n${list}\nSelesaikan atau batalkan yang tertunda.`;
  }
  return base;
}

// ── Errors ───────────────────────────────────────────────────────────────────
export function replyError(message: string, rng: Rng = Math.random): string {
  const intro = pick(
    ['⚠️ <b>OPERASI GAGAL</b>', '🚫 <b>TIDAK BISA DIPROSES</b>', '⛔ <b>PERINTAH DITOLAK</b>'],
    rng
  );
  return `${intro}\n\n${message}`;
}

// ── Help / command menu ──────────────────────────────────────────────────────
/** Static list of what the bot understands. Natural language — not rigid syntax. */
export function replyHelp(): string {
  return `🤖 <b>PERINTAH TERSEDIA</b>

🎯 <b>Mulai misi</b> — <i>"mulai &lt;aktivitas&gt; 1 jam #kategori"</i>
✅ <b>Selesai</b> — <i>"selesai"</i> / <i>"done 45 menit"</i>
➕ <b>Perpanjang</b> — <i>"perpanjang 30 menit"</i>
❌ <b>Batalkan</b> — <i>"batalkan misi"</i>
📊 <b>Status misi</b> — <i>"status"</i>
📋 <b>Kebiasaan hari ini</b> — <i>"kebiasaan"</i>
🗓️ <b>Rencana hari ini</b> — <i>"plan"</i> / <i>"rencana"</i> · ubah: <i>"geser lari ke jam 5 sore"</i>, <i>"skip meditasi"</i>, <i>"tunda 30 menit"</i>
🧩 <b>Usulkan rencana susulan</b> — <i>"usul"</i> / <i>"rancang"</i> → balas <i>"gas"</i> / <i>"tolak"</i>
📨 <b>Pengarahan</b> — <i>"brief"</i>
🗓️ <b>Kalender</b> — <i>"kalender"</i> · per kategori: <i>"calendar work"</i> · sinkron: <i>"sinkron kalender"</i>
🆘 <b>Bantuan</b> — <i>"help"</i>

Tulis dalam bahasa biasa — tidak perlu format kaku.`;
}

// ── Calendar ─────────────────────────────────────────────────────────────────
const TG_TZ = process.env.TZ || 'Asia/Jakarta';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 'Thu 16 Jul 09:00' in the app timezone (date only for all-day events). */
function calendarWhen(e: CalendarEventRecord): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    ...(e.all_day ? {} : { hour: '2-digit', minute: '2-digit', hour12: false }),
    timeZone: TG_TZ,
  }).format(new Date(e.starts_at));
}

/** 'HH:MM' in the app timezone. */
function calendarClock(e: CalendarEventRecord): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TG_TZ,
  }).format(new Date(e.starts_at));
}

/**
 * Warn that a new mission clashes with the calendar (an event in progress or
 * starting within the mission's ETA). Returns null when there are no conflicts.
 */
export function replyCalendarConflict(
  conflicts: { event: CalendarEventRecord; status: 'ongoing' | 'soon'; minutesUntilStart: number }[],
  missionTitle: string
): string | null {
  if (conflicts.length === 0) return null;
  const lines = conflicts.map(c => {
    const tag = c.event.category ? ` [${escapeHtml(c.event.category)}]` : '';
    const state = c.status === 'ongoing' ? 'berlangsung' : `dalam ${c.minutesUntilStart}m`;
    return `⚔️ ${calendarClock(c.event)} — ${escapeHtml(c.event.title)}${tag} (${state})`;
  });
  // Offer the primary (earliest/ongoing) event as a one-word "follow the calendar".
  const primary = conflicts[0].event;
  return (
    `🗓️ <b>MISI BARU BERTABRAKAN DENGAN KALENDER</b>\n\n` +
    `Misi baru: ${escapeHtml(missionTitle)}\n\n` +
    `${lines.join('\n')}\n\n` +
    `▶️ Ketik <i>"ya"</i> — mulai <b>${escapeHtml(missionTitle)}</b> tetap jalan\n` +
    `🗓️ Ketik <i>"kalender"</i> — ikuti jadwal, mulai <b>${escapeHtml(primary.title)}</b>`
  );
}

/** Upcoming calendar events, optionally filtered to one #category. */
export function replyCalendarEvents(events: CalendarEventRecord[], category: string | null): string {
  const header = category
    ? `🗓️ <b>KALENDER — #${escapeHtml(category)}</b>`
    : '🗓️ <b>KALENDER — MENDATANG</b>';
  if (events.length === 0) {
    const empty = category
      ? `Tidak ada acara mendatang dengan kategori #${escapeHtml(category)}.`
      : 'Belum ada acara. Kirim "sinkron kalender" dulu.';
    return `${header}\n\n${empty}`;
  }
  const lines = events.map(e => {
    const tag = e.category ? ` [${escapeHtml(e.category)}]` : '';
    return `${calendarWhen(e)} — ${escapeHtml(e.title)}${tag}`;
  });
  return `${header}\n\n${lines.join('\n')}`;
}

// ── Plan view / draft ────────────────────────────────────────────────────────
const PLAN_GLYPH: Record<PlanBlock['status'], string> = {
  planned: '◻️',
  done: '✅',
  skipped: '⏭️',
  moved: '↪️',
  proposed: '❓',
};

/** 'HH:MM:SS' → 'HH:MM'. */
const hhmm = (t: string): string => t.slice(0, 5);

function planLine(b: PlanBlock): string {
  const dur = b.duration_minutes ? ` · ${formatMinutes(b.duration_minutes)}` : '';
  return `${hhmm(b.start_time)} ${PLAN_GLYPH[b.status]} ${b.title}${dur}`;
}

/** Today's orders. Proposed (unconfirmed) blocks are excluded — they show via replyPlanDraft. */
export function replyPlan(blocks: PlanBlock[]): string {
  const visible = blocks.filter(b => b.status !== 'proposed');
  const header = '🗓️ <b>RENCANA HARI INI</b>';
  if (visible.length === 0) {
    return `${header}\n\nBelum ada blok terjadwal hari ini.\nTambah lewat <i>"tambah &lt;judul&gt; jam &lt;waktu&gt;"</i> atau atur kebiasaan berulang.`;
  }
  const body = visible.map(planLine).join('\n');
  const hints = 'Ubah: <i>"geser lari ke jam 5 sore"</i> · <i>"skip meditasi"</i> · <i>"tunda 30 menit"</i>';
  return `${header}\n\n${body}\n\n${hints}`;
}

/** A drafted catch-up plan awaiting confirmation. Empty when nothing has been missed. */
export function replyPlanDraft(proposed: PlanBlock[]): string {
  const header = '🗓️ <b>USULAN RENCANA SUSULAN</b>';
  if (proposed.length === 0) {
    return `${header}\n\nBelum ada yang terlewat — tidak ada yang perlu dikejar.`;
  }
  const body = proposed.map(planLine).join('\n');
  return `${header}\n\n${body}\n\nBalas <i>"gas"</i> untuk kunci, <i>"tolak"</i> untuk batalkan.`;
}

// ── Today's habits ───────────────────────────────────────────────────────────
export type TodayHabitStatus = 'done' | 'missed' | 'due' | 'upcoming';

export interface TodayHabit {
  name: string;
  category: string;
  /** Scheduled time 'HH:MM'. */
  at: string;
  status: TodayHabitStatus;
}

/** 'HH:MM[:SS]' → minutes since midnight. */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * From the active schedules, the habits scheduled for *today* (local weekday),
 * each tagged done / missed / due / upcoming, sorted by scheduled time. Pure —
 * `now` and the logged-type set are supplied by the caller.
 */
export function summarizeTodayHabits(
  schedules: HabitScheduleWithNames[],
  loggedTypeIds: Set<string>,
  now: Date = new Date()
): TodayHabit[] {
  const weekday = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return schedules
    .filter(s => s.days_of_week.includes(weekday))
    .map(s => {
      const start = timeToMinutes(s.expected_at);
      const end = start + s.grace_minutes;
      let status: TodayHabitStatus;
      if (loggedTypeIds.has(s.habit_type_id)) status = 'done';
      else if (nowMin < start) status = 'upcoming';
      else if (nowMin <= end) status = 'due';
      else status = 'missed';
      return { name: s.habit_type_name, category: s.category_name, at: s.expected_at.slice(0, 5), status };
    })
    .sort((a, b) => a.at.localeCompare(b.at));
}

const TODAY_HABIT_ICON: Record<TodayHabitStatus, string> = {
  done: '✅',
  missed: '☠️',
  due: '⏳',
  upcoming: '⬜',
};

const TODAY_HABIT_LABEL: Record<TodayHabitStatus, string> = {
  done: 'selesai',
  missed: 'terlewat',
  due: 'jatuh tempo',
  upcoming: 'nanti',
};

/** Today's scheduled habits with their status — answer to the "kebiasaan" query. */
export function replyHabitsToday(
  schedules: HabitScheduleWithNames[],
  loggedTypeIds: Set<string>,
  now: Date = new Date()
): string {
  const items = summarizeTodayHabits(schedules, loggedTypeIds, now);
  if (items.length === 0) {
    return `📋 <b>KEBIASAAN HARI INI</b>\n\nTidak ada kebiasaan terjadwal hari ini.`;
  }
  const lines = items.map(
    h => `${TODAY_HABIT_ICON[h.status]} <b>${h.name}</b> (${h.category}) — ${h.at} · ${TODAY_HABIT_LABEL[h.status]}`
  );
  const done = items.filter(h => h.status === 'done').length;
  return `📋 <b>KEBIASAAN HARI INI</b> (${done}/${items.length} selesai)\n\n${lines.join('\n')}`;
}

// ── Mission conflict reminder ────────────────────────────────────────────────

const CONFLICT_HEADERS = [
  '⚠️ <b>TUNGGU — ADA JADWAL YANG KAMU ABAIKAN</b>',
  '🚨 <b>CEK ULANG — JADWAL MASIH BERLAKU</b>',
  '💭 <b>MISI BARU BERTABRAKAN DENGAN JADWAL</b>',
];

const CONFLICT_CONFIRMATIONS = [
  '<b>LANJUTKAN MISI:</b> Ketik <i>"ya"</i> untuk mulai meski jadwal masih belum terpenuhi',
  '<b>KEPUTUSAN:</b> Ketik <i>"ya"</i> untuk lanjut, atau abaikan pesan ini untuk ambil jadwal dulu',
  '<b>PERLU KEPUTUSAN:</b> Ketik <i>"ya"</i> jika yakin, atau selesaikan jadwal terlebih dahulu',
];

function habitConflictLine(conflict: DueHabit): string {
  const { schedule, status, minutesLate, minutesLeft } = conflict;
  const name = `<b>${schedule.habit_type_name}</b> (${schedule.category_name})`;
  const at = `${String(Math.floor(timeToMinutes(schedule.expected_at) / 60)).padStart(2, '0')}:${String(timeToMinutes(schedule.expected_at) % 60).padStart(2, '0')}`;
  if (status === 'missed') {
    return `☠️ ${name} — ${at}, LEWAT ${formatMinutes(minutesLate)}`;
  }
  return `⏳ ${name} — ${at}, tersisa ${formatMinutes(minutesLeft)}`;
}

/** Remind the user about scheduled habits they're about to neglect by starting a new mission. */
export function replyConflictReminder(
  conflicts: DueHabit[],
  missionTitle: string,
  rng: Rng = Math.random
): string | null {
  if (conflicts.length === 0) return null;

  const conflictLines = conflicts.map(habitConflictLine).join('\n');
  return (
    `${pick(CONFLICT_HEADERS, rng)}\n\n` +
    `<b>Misi baru:</b> ${missionTitle}\n\n` +
    `<b>Yang belum terpenuhi hari ini:</b>\n${conflictLines}\n\n` +
    `${pick(CONFLICT_CONFIRMATIONS, rng)}`
  );
}
