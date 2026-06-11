import { Mission } from '../types';
import { generateText, fastModel } from '../utils/gemini';
import { MINIMUM_VIABLE_MINUTES } from '../services/missRecovery';
import { Tone } from '../services/toneGate';

/**
 * After a mission is closed as NOT completed (DITUTUP: TIDAK SELESAI), the bot
 * follows up with a short nudge that pushes the operator to name — and
 * immediately start — the next step, instead of letting the failure end the day.
 * Tone follows the shared gate: a single failure is treated as RECOVERABLE
 * (competence, the default); `loss_aversion` is only used when the caller knows
 * this is an inflection point. The message is AI-generated (Gemini) and grounded
 * in the failed mission, with a static fallback when the LLM is unavailable.
 */

/** The tone-specific focus block for the prompt. */
function nextStepFocus(mission: Mission, tone: Tone): string {
  if (tone === 'loss_aversion') {
    return `FOKUS UTAMA: LOSS AVERSION.
- Tegaskan harga yang dibayar jika misi "${mission.title}" terus ditunda — kerugian nyata yang menggerus mimpinya, bukan sekadar tugas tertinggal.
- Bangkitkan rasa TAKUT KEHILANGAN: setiap penundaan adalah progres yang hilang dan tidak akan kembali.`;
  }
  return `FOKUS UTAMA: PEMULIHAN & KOMPETENSI.
- Ini bukan vonis: gagal sekali itu wajar, yang fatal adalah berhenti. Tekankan bahwa dia mampu bangkit sekarang.
- Bangun momentum dengan langkah terkecil; jangan memakai rasa takut atau menghakimi.`;
}

/** The Gemini prompt — pure so it can be unit-tested. Defaults to recovery tone. */
export function buildNextStepPrompt(mission: Mission, tone: Tone = 'competence'): string {
  const reason = mission.notes
    ? `Alasan/catatan operator: "${mission.notes}".`
    : 'Operator tidak memberi alasan.';
  return `Kamu adalah pelatih disiplin bergaya militer untuk seorang operator (sebut dia "kamu").
Sebuah misi baru saja DITUTUP sebagai TIDAK SELESAI (gagal).

MISI GAGAL: "${mission.title}"
${reason}

Tugasmu: tulis SATU pesan SINGKAT dalam Bahasa Indonesia yang mendorong operator menentukan dan MEMULAI langkah berikutnya SEKARANG — jangan biarkan kegagalan ini menutup harinya.

${nextStepFocus(mission, tone)}

ATURAN WAJIB:
- Maksimal 3 kalimat. Tegas, padat, tanpa basa-basi, tanpa menghakimi berlebihan.
- Acu judul misi yang gagal secara spesifik; jangan mengarang detail lain.
- Ini PEMULIHAN, bukan vonis: tawarkan versi MINIMAL ${MINIMUM_VIABLE_MINUTES} menit sebagai cara termudah untuk tetap bergerak hari ini.
- Boleh 1-2 emoji dan tag <b></b> (format Telegram HTML). Jangan pakai markdown.
- Akhiri dengan satu perintah aksi konkret: mulai lagi sekarang, minimal ${MINIMUM_VIABLE_MINUTES} menit (mis. <i>"mulai ${mission.title} ${MINIMUM_VIABLE_MINUTES} menit"</i>).

Tulis pesannya sekarang.`;
}

/** Static loss-aversion fallback when Gemini is unavailable. */
export function fallbackNextStep(mission: Mission): string {
  return (
    `🔁 <b>LANGKAH BERIKUTNYA — MASIH BISA DISELAMATKAN</b>\n\n` +
    `Misi <b>${mission.title}</b> belum tuntas — gagal sekali bukan vonis, yang fatal itu berhenti. ` +
    `Versi terkecil pun menjaga momentum hari ini.\n\n` +
    `<b>AKSI SEKARANG (minimal ${MINIMUM_VIABLE_MINUTES} menit):</b> <i>"mulai ${mission.title} ${MINIMUM_VIABLE_MINUTES} menit"</i>.`
  );
}

/** Generate the nudge via Gemini, falling back to the static message. */
export async function composeNextStepNudge(mission: Mission, tone: Tone = 'competence'): Promise<string> {
  try {
    // Short message → use the faster model with a tighter token budget.
    return await generateText(buildNextStepPrompt(mission, tone), {
      model: fastModel(),
      maxOutputTokens: 320,
      // Flash is a thinking model — disable thinking so the full short nudge fits.
      thinkingBudget: 0,
    });
  } catch (err) {
    console.warn(`[NextStep] Gemini unavailable (${(err as Error).message}) — using fallback`);
    return fallbackNextStep(mission);
  }
}
