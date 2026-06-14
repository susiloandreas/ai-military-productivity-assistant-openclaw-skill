/**
 * Reply copy for the Telegram listener. Indonesian military-coaching tone with
 * randomized variants per slot — so the bot never answers the same way twice,
 * mirroring the idle-reminder copy pools. All builders take an injectable `rng`
 * so tests can be deterministic.
 */
import { Mission, HabitScheduleWithNames } from '../types';
import { MissionCompleteResult } from '../services/MissionService';
import { formatMinutes } from '../utils/duration';

export type Rng = () => number;

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
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
  if (mission.eta_minutes) lines.push(`⏱️ ETA: <b>${formatMinutes(mission.eta_minutes)}</b>`);
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
  'Lapor sekarang: <b>status + catatan</b> dalam satu pesan.\n' +
  '✅ <i>selesai, &lt;apa yang kamu kerjakan&gt;</i>\n' +
  '❌ <i>belum, &lt;kenapa / sampai mana&gt;</i>';

/**
 * Sent by the ETA worker when a mission's timer expires — the user MUST reply
 * with a completion status (done / not done) AND notes.
 */
export function replyEtaExpiredAskNotes(mission: Mission, rng: Rng = Math.random): string {
  const eta = mission.eta_minutes != null ? ` (ETA ${formatMinutes(mission.eta_minutes)})` : '';
  return `${pick(ETA_EXPIRED_HEADERS, rng)}\n\n📌 <b>${mission.title}</b>${eta}\n\n${RESOLVE_INSTRUCTION}`;
}

/** Re-prompt when the expiry reply is missing the status and/or the notes. */
export function replyExpiryNeedsBoth(): string {
  return `⚠️ Butuh <b>dua-duanya</b>: status DAN catatan.\n\n${RESOLVE_INSTRUCTION}`;
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
  return `${header}\n\n${lines.join('\n')}\n\n${closer}`;
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
  const eta = mission.eta_minutes != null ? `⏱️ ETA baru: <b>${formatMinutes(mission.eta_minutes)}</b>\n\n` : '';
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
📨 <b>Pengarahan</b> — <i>"brief"</i>
🆘 <b>Bantuan</b> — <i>"help"</i>

Tulis dalam bahasa biasa — tidak perlu format kaku.`;
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
