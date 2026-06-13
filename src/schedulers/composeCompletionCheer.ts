import { MissionCompleteResult } from '../services/MissionService';
import { generateText, fastModel } from '../utils/gemini';
import { formatMinutes } from '../utils/duration';

/**
 * After a mission is closed as DONE (SELESAI), the bot follows with a short
 * MOTIVATIONAL message — positive reinforcement that celebrates the win and
 * pushes momentum toward the dream (the upbeat counterpart to the loss-aversion
 * nudge in composeNextStep). AI-generated (Gemini) and grounded in the completed
 * mission + goal progress, with a static fallback when the LLM is unavailable.
 */

/**
 * Reward tier from the current streak length. Higher tiers → louder celebration,
 * so the satisfying signal grows as the chain grows (variable/escalating reward).
 * Thresholds: 1 (any), 3, 7, 14, 30+.
 */
export function rewardTier(streakCount: number): number {
  if (streakCount >= 30) return 30;
  if (streakCount >= 14) return 14;
  if (streakCount >= 7) return 7;
  if (streakCount >= 3) return 3;
  return 1;
}

/** How loudly to celebrate at each tier (Indonesian, military-coach voice). */
const TIER_LABEL: Record<number, string> = {
  1: 'kemenangan dicatat',
  3: 'momentum terbentuk',
  7: 'satu minggu beruntun — solid',
  14: 'dua minggu beruntun — luar biasa',
  30: 'sebulan beruntun — elite',
};

/**
 * Healthy upper bounds (minutes) for recognizable activities, keyed by a keyword
 * in the mission title. Blowing past the bound isn't a win to cheer — it's a
 * habit to review (15h of "tidur" is oversleeping, not hard work). First match wins.
 */
const HEALTHY_MAX: { match: RegExp; maxMinutes: number; label: string }[] = [
  { match: /tidur|sleep/, maxMinutes: 10 * 60, label: 'tidur terlalu lama' },
];

/** Any single mission past this is almost certainly a timer left running. */
const FORGOTTEN_TIMER_MINUTES = 16 * 60;

/**
 * Inspect the just-completed mission for an unhealthily long duration. Returns a
 * short Indonesian concern when the activity overran a sane bound, else null —
 * the signal that flips the cheer from pure celebration into an honest review.
 */
export function durationConcern(result: MissionCompleteResult): string | null {
  const mins = result.mission.actual_duration_minutes;
  if (mins == null) return null;
  const title = result.mission.title.toLowerCase();
  for (const rule of HEALTHY_MAX) {
    if (rule.match.test(title) && mins > rule.maxMinutes) {
      return `durasi ${formatMinutes(mins)} jauh di atas batas sehat (${formatMinutes(rule.maxMinutes)}) untuk aktivitas ini — ${rule.label}`;
    }
  }
  if (mins > FORGOTTEN_TIMER_MINUTES) {
    return `durasi ${formatMinutes(mins)} tidak wajar untuk satu sesi — kemungkinan timer lupa dimatikan`;
  }
  return null;
}

/** One-line snapshot of what was just accomplished, shared by prompt + fallback. */
function achievement(result: MissionCompleteResult): string {
  const { mission, goalProgress } = result;
  const parts = [`"${mission.title}"`];
  if (mission.actual_duration_minutes != null) {
    parts.push(`durasi ${formatMinutes(mission.actual_duration_minutes)}`);
  }
  if (goalProgress?.goalCompleted) {
    parts.push(`GOAL TUNTAS: "${goalProgress.goal.title}"`);
  } else if (goalProgress?.milestonesUnlocked.length) {
    parts.push(`milestone: ${goalProgress.milestonesUnlocked.map(m => m.title).join(', ')}`);
  } else if (goalProgress) {
    parts.push(`progres goal: ${formatMinutes(goalProgress.totalProgress)}`);
  }
  return parts.join(' · ');
}

/**
 * The Gemini prompt — pure so it can be unit-tested. `streakCount` is the
 * habit's current streak after this completion; its tier scales the celebration.
 */
export function buildCompletionPrompt(result: MissionCompleteResult, streakCount = 0): string {
  const tier = rewardTier(streakCount);
  const streakLine =
    streakCount > 0
      ? `STREAK SAAT INI: ${streakCount} hari beruntun (tingkat perayaan: ${tier} — ${TIER_LABEL[tier]}).`
      : `STREAK: belum ada rantai berjalan — ini bisa jadi awalnya.`;
  const concern = durationConcern(result);

  // When the duration is unhealthy, the cheer becomes an honest habit review:
  // acknowledge the completion, but DON'T celebrate the overrun as hard work.
  if (concern) {
    return `Kamu adalah pelatih disiplin bergaya militer untuk seorang operator (sebut dia "kamu").
Sebuah misi baru saja DITUTUP sebagai SELESAI, TAPI durasinya bermasalah.

MISI SELESAI: ${achievement(result)}
${streakLine}
⚠️ TINJAUAN KEBIASAAN: ${concern}.

Tugasmu: tulis SATU pesan SINGKAT dalam Bahasa Indonesia yang MENINJAU kebiasaan ini dengan jujur, bukan merayakannya.

FOKUS UTAMA: KOREKSI YANG SUPORTIF.
- Akui dia menyelesaikan misinya, tapi TEGASKAN durasi sepanjang ini BUKAN kerja keras yang patut dirayakan — ini sinyal untuk dikoreksi.
- Jangan menghakimi atau merendahkan; bingkai sebagai pelatih yang peduli pada kesehatan & disiplinnya.

ATURAN WAJIB:
- Maksimal 3 kalimat. Tegas, jujur, peduli, tanpa basa-basi.
- JANGAN memuji durasinya atau menyebutnya "kerja keras"/"hebat". Sebut angka durasinya dan kenapa itu terlalu panjang.
- JANGAN merayakan streak di pesan ini; fokus pada koreksi.
- Acu misi yang baru selesai secara spesifik; jangan mengarang detail lain.
- Boleh 1 emoji dan tag <b></b> (format Telegram HTML). Jangan pakai markdown.
- Akhiri dengan satu target durasi yang SEHAT dan konkret untuk sesi berikutnya.

Tulis pesannya sekarang.`;
  }

  return `Kamu adalah pelatih disiplin bergaya militer untuk seorang operator (sebut dia "kamu").
Sebuah misi baru saja DITUTUP sebagai SELESAI (berhasil).

MISI SELESAI: ${achievement(result)}
${streakLine}

Tugasmu: tulis SATU pesan MOTIVASIONAL SINGKAT dalam Bahasa Indonesia yang merayakan kemenangan ini dan menjaga momentum.

FOKUS UTAMA: PENGUATAN POSITIF.
- Akui kerja kerasnya dengan tulus; tegaskan bahwa kemenangan kecil ini mendekatkan dia ke mimpinya.
- Bangun MOMENTUM: dorong dia menjaga rantai disiplin tetap menyala, bukan berpuas diri.

ATURAN WAJIB:
- Maksimal 3 kalimat. Tegas, hangat, berenergi, tanpa basa-basi.
- Skala perayaan IKUTI tingkat streak: makin tinggi streak, makin kuat dan eksplisit rayakan rantai itu (sebut angka harinya).
- Acu misi yang baru selesai secara spesifik; jangan mengarang detail lain.
- Jika ada goal/milestone tercapai, rayakan secara eksplisit.
- Boleh 1-2 emoji dan tag <b></b> (format Telegram HTML). Jangan pakai markdown.
- Akhiri dengan satu ajakan aksi konkret untuk target berikutnya.

Tulis pesannya sekarang.`;
}

/** A streak banner whose intensity escalates with the tier. */
function streakBanner(streakCount: number): string {
  if (streakCount <= 0) return '';
  const tier = rewardTier(streakCount);
  const flame = tier >= 30 ? '🔥🔥🔥' : tier >= 14 ? '🔥🔥' : tier >= 7 ? '🔥' : '✨';
  return `\n${flame} <b>STREAK ${streakCount} HARI</b> — ${TIER_LABEL[tier]}. Jangan putus.`;
}

/**
 * Static motivational fallback when Gemini is unavailable. The celebration —
 * and the streak banner — escalate with the streak's reward tier.
 */
export function fallbackCompletion(result: MissionCompleteResult, streakCount = 0): string {
  const { mission, goalProgress } = result;

  // Unhealthy duration → review, not celebration (no streak banner either).
  const concern = durationConcern(result);
  if (concern) {
    return (
      `🎖️ <b>MISI SELESAI</b> — tapi mari ditinjau dulu.\n\n` +
      `<b>${mission.title}</b> tercatat selesai, namun ${concern}. ` +
      `Menyelesaikannya bagus, tapi durasi seperti ini bukan kerja keras yang patut dirayakan — ini sinyal untuk dikoreksi.\n\n` +
      `<b>LANJUT:</b> Patok durasi yang sehat untuk sesi berikutnya dan jaga rantai disiplin tetap terukur.`
    );
  }

  const win = goalProgress?.goalCompleted
    ? `🏆 <b>GOAL TUNTAS — "${goalProgress.goal.title}"!</b>`
    : `🎖️ <b>MISI SELESAI — SATU KEMENANGAN LAGI</b>`;
  return (
    `${win}${streakBanner(streakCount)}\n\n` +
    `<b>${mission.title}</b> kelar. Setiap misi yang kamu tuntaskan mendekatkanmu satu langkah ke mimpimu — ` +
    `jaga rantai ini tetap menyala, jangan biarkan putus.\n\n` +
    `<b>LANJUT:</b> Tentukan target berikutnya dan serang lagi.`
  );
}

/** Generate the cheer via Gemini, falling back to the static message. */
export async function composeCompletionCheer(result: MissionCompleteResult, streakCount = 0): Promise<string> {
  try {
    // Short message → use the faster model with a tighter token budget.
    return await generateText(buildCompletionPrompt(result, streakCount), {
      model: fastModel(),
      maxOutputTokens: 320,
      // Flash is a thinking model — disable thinking so the full short cheer fits.
      thinkingBudget: 0,
    });
  } catch (err) {
    console.warn(`[Completion] Gemini unavailable (${(err as Error).message}) — using fallback`);
    return fallbackCompletion(result, streakCount);
  }
}
