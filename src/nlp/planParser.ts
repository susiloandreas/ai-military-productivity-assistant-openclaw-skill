/**
 * Rule-based parser for on-the-fly plan edits — the /plan counterpart to
 * missionParser. Recognizes the view/draft intents plus four edit verbs,
 * typo-tolerant via fuzzyMatch:
 *   view   — "plan", "rencana", "jadwal hari ini" (show today's orders)
 *   draft  — "plan draft", "usul", "rancang" (draft a catch-up plan)
 *   move   — "geser lari ke jam 5 sore", "pindah workout ke 06:30"
 *   skip   — "skip meditasi hari ini", "lewati english writing"
 *   add    — "tambah baca 30 menit jam 9 malam", "tambah lunch jam 12"
 *   snooze — "tunda 30 menit", "snooze 15m", "tunda lari"
 * Returns null when nothing matches. Pure and unit-testable.
 */
import { closestPhrase } from './fuzzyMatch';

export type PlanEditIntent =
  | { kind: 'view' }
  | { kind: 'draft' }
  | { kind: 'move'; target: string; at: string }
  | { kind: 'skip'; target: string }
  | { kind: 'add'; title: string; at: string | null; durationStr: string | null }
  | { kind: 'snooze'; minutes: number; target: string | null }
  | { kind: 'accept' }
  | { kind: 'reject' };

// Whole-message request to see today's plan ("today's orders").
const VIEW_PHRASES = new Set([
  'plan', 'rencana', 'jadwal', 'rencana hari ini', 'plan hari ini', 'jadwal hari ini',
  'lihat plan', 'lihat rencana', 'lihat jadwal', 'plan help', 'orders',
]);
// Whole-message request to draft an AI catch-up plan for what's been missed.
const DRAFT_PHRASES = new Set([
  'plan draft', 'draft', 'draft plan', 'usul', 'usulkan', 'usulkan plan', 'rancang', 'rancang plan', 'propose',
]);

// Whole-message confirmations for an AI proposal (propose-&-confirm).
const ACCEPT_PHRASES = new Set([
  'gas', 'gaskeun', 'ok', 'oke', 'okay', 'sip', 'siap', 'setuju', 'terima', 'lanjut', 'boleh', 'acc', 'gas terus',
]);
const REJECT_PHRASES = new Set([
  'tolak', 'batalkan', 'batal', 'jangan', 'gausah', 'ga usah', 'gak usah', 'skip semua', 'nanti aja',
]);

const MOVE_TRIGGERS = ['pindahkan', 'pindahin', 'geserin', 'reschedule', 'pindah', 'geser', 'majukan', 'mundurkan', 'move'];
const SKIP_TRIGGERS = ['liburkan', 'lewatin', 'lewati', 'libur', 'skip', 'bolos'];
const ADD_TRIGGERS = ['tambahkan', 'tambahin', 'sisipkan', 'masukin', 'tambah', 'add'];
const SNOOZE_TRIGGERS = ['tundain', 'snooze', 'tunda'];

// number + time unit (EN + ID). Mirrors missionParser's unit set.
const DURATION_RE = /(\d+(?:\.\d+)?)\s*(jam|jm|hours?|hrs?|h|menit|mins?|min|m)\b/i;

// Clock phrase: optional jam/pukul/at, HH[:MM], optional meridiem / ID period.
const CLOCK_RE = /(?:\b(?:jam|pukul|at)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|pagi|siang|sore|malam)?/i;

const pad2 = (n: number): string => String(n).padStart(2, '0');

function stripConnectors(s: string): string {
  return s
    .replace(/^[\s:,\-–]+|[\s:,\-–]+$/g, '')
    .replace(/^(?:ke|jadi|menjadi|to|untuk|pada)\b\s*/i, '')
    .replace(/\s*\b(?:ke|jadi|menjadi|to|pada)$/i, '') // trailing "...ke" left when the clock began at "jam"
    .trim();
}

function canonicalDuration(numStr: string, unit: string): string {
  const n = parseFloat(numStr);
  const u = unit.toLowerCase();
  const isHour = u === 'h' || u.startsWith('j') || u.startsWith('hour') || u.startsWith('hr');
  return isHour ? `${n}h` : `${Math.round(n)}m`;
}

function durationToMinutes(numStr: string, unit: string): number {
  const n = parseFloat(numStr);
  const u = unit.toLowerCase();
  const isHour = u === 'h' || u.startsWith('j') || u.startsWith('hour') || u.startsWith('hr');
  return Math.round(isHour ? n * 60 : n);
}

/**
 * Parse a clock phrase to 'HH:MM'. Handles 24h ("17:00"), 12h ("5pm") and
 * Indonesian periods ("jam 5 sore" → 17:00, "jam 9 malam" → 21:00,
 * "jam 12 malam" → 00:00). Returns null when no valid hour is found.
 */
export function parseClockPhrase(input: string): string | null {
  const m = input.trim().toLowerCase().match(CLOCK_RE);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const period = m[3];
  if (h > 23 || min > 59) return null;

  switch (period) {
    case 'pm':
    case 'sore':
      if (h < 12) h += 12;
      break;
    case 'malam':
      if (h === 12) h = 0;
      else if (h < 12) h += 12;
      break;
    case 'siang':
      if (h >= 1 && h <= 4) h += 12; // jam 1-4 siang → 13-16; 11/12 siang stay
      break;
    case 'am':
    case 'pagi':
      if (h === 12) h = 0;
      break;
    // no period → take the hour as written (24h or bare)
  }
  return `${pad2(h)}:${pad2(min)}`;
}

function removeAt(s: string, index: number, len: number): string {
  return (s.slice(0, index) + ' ' + s.slice(index + len)).replace(/\s+/g, ' ').trim();
}

export function parsePlanEdit(raw: string): PlanEditIntent | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const lower = text.toLowerCase().replace(/[\s?.!,]+$/, '');

  // Accept / reject an AI proposal — whole-message confirmations, checked first.
  if (ACCEPT_PHRASES.has(lower) || closestPhrase(lower, ACCEPT_PHRASES, { whole: true })) return { kind: 'accept' };
  if (REJECT_PHRASES.has(lower) || closestPhrase(lower, REJECT_PHRASES, { whole: true })) return { kind: 'reject' };

  // View / draft — whole-message intents with no target. Draft is checked first so
  // "plan draft" is not swallowed by the bare-"plan" view phrase.
  if (DRAFT_PHRASES.has(lower) || closestPhrase(lower, DRAFT_PHRASES, { whole: true })) return { kind: 'draft' };
  if (VIEW_PHRASES.has(lower) || closestPhrase(lower, VIEW_PHRASES, { whole: true })) return { kind: 'view' };

  // Move — needs a target and a time.
  const mv = closestPhrase(lower, MOVE_TRIGGERS);
  if (mv) {
    const rest = text.slice(mv.consumed);
    const c = CLOCK_RE.exec(rest);
    const at = c ? parseClockPhrase(c[0]) : null;
    if (!c || !at) return null;
    const target = stripConnectors(rest.slice(0, c.index));
    return target ? { kind: 'move', target, at } : null;
  }

  // Skip — target only.
  const sk = closestPhrase(lower, SKIP_TRIGGERS);
  if (sk) {
    let target = text.slice(sk.consumed).replace(/\b(hari ini|today|untuk hari ini|aja|saja|dulu)\b/gi, '');
    target = stripConnectors(target);
    return target ? { kind: 'skip', target } : null;
  }

  // Snooze — optional duration (default 15m) and optional target.
  const sn = closestPhrase(lower, SNOOZE_TRIGGERS);
  if (sn) {
    let rest = text.slice(sn.consumed).trim();
    let minutes = 15;
    const d = DURATION_RE.exec(rest);
    if (d) {
      minutes = durationToMinutes(d[1], d[2]);
      rest = removeAt(rest, d.index, d[0].length);
    }
    const target = stripConnectors(rest) || null;
    return { kind: 'snooze', minutes, target };
  }

  // Add — title plus optional duration and time.
  const ad = closestPhrase(lower, ADD_TRIGGERS);
  if (ad) {
    let rest = text.slice(ad.consumed).trim();
    let durationStr: string | null = null;
    const d = DURATION_RE.exec(rest);
    if (d) {
      durationStr = canonicalDuration(d[1], d[2]);
      rest = removeAt(rest, d.index, d[0].length);
    }
    let at: string | null = null;
    const c = CLOCK_RE.exec(rest);
    if (c) {
      const parsed = parseClockPhrase(c[0]);
      if (parsed) {
        at = parsed;
        rest = removeAt(rest, c.index, c[0].length);
      }
    }
    const title = stripConnectors(rest).replace(/\b(jam|pukul|pada|at)\b\s*$/i, '').trim();
    return title ? { kind: 'add', title, at, durationStr } : null;
  }

  return null;
}
