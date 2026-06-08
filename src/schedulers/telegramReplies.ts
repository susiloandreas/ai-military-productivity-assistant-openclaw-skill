/**
 * Reply copy for the Telegram listener. Indonesian military-coaching tone with
 * randomized variants per slot — so the bot never answers the same way twice,
 * mirroring the idle-reminder copy pools. All builders take an injectable `rng`
 * so tests can be deterministic.
 */
import { Mission } from '../types';
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

export function replyCompleted(result: MissionCompleteResult, rng: Rng = Math.random): string {
  const { mission, goalProgress } = result;
  const lines = [`📌 <b>${mission.title}</b>`];
  if (mission.actual_duration_minutes != null) {
    lines.push(`⏱️ Durasi: <b>${formatMinutes(mission.actual_duration_minutes)}</b>`);
  }
  if (goalProgress) {
    if (goalProgress.goalCompleted) {
      lines.push(`🏆 GOAL TUNTAS: <b>${goalProgress.goal.title}</b>`);
    } else if (goalProgress.milestonesUnlocked.length > 0) {
      lines.push(`🚩 Milestone: ${goalProgress.milestonesUnlocked.map(m => m.title).join(', ')}`);
    }
    lines.push(`📈 Progress goal: ${formatMinutes(goalProgress.totalProgress)}`);
  }
  return (
    `${pick(COMPLETED_HEADERS, rng)}\n\n${lines.join('\n')}\n\n` +
    `${pick(COMPLETED_CLOSERS, rng)}\n\n${pick(ASK_NOTES, rng)}`
  );
}

const ETA_EXPIRED_HEADERS = [
  '⏰ <b>ETA HABIS</b>',
  '🔔 <b>WAKTU MISI SUDAH LEWAT</b>',
  '⌛ <b>BATAS WAKTU TERCAPAI</b>',
];

/** Sent by the ETA worker when a mission's timer expires — asks for notes. */
export function replyEtaExpiredAskNotes(mission: Mission, rng: Rng = Math.random): string {
  const eta = mission.eta_minutes != null ? ` (ETA ${formatMinutes(mission.eta_minutes)})` : '';
  return `${pick(ETA_EXPIRED_HEADERS, rng)}\n\n📌 <b>${mission.title}</b>${eta}\n\n${pick(ASK_NOTES, rng)}`;
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
