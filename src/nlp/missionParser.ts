/**
 * Rule-based (no-AI) NLP for inbound Telegram messages. Deterministic and fully
 * unit-testable — it classifies a free-text message into a mission *intent* and
 * extracts its slots from keyword triggers and duration/category patterns, not a
 * language model.
 *
 * Trigger words are typo-tolerant: tokens are normalized and matched against
 * the closest known keyword by edit distance (see fuzzyMatch.ts), so "selse",
 * "slesai" or "doneee" still resolve to "selesai" / "done".
 *
 * Intents understood:
 *   start    — "start coding for 2h", "mulai latihan tenis 1 jam #tennis",
 *              "50 menit ke depan akan pulang", "/mission start review PR"
 *   complete — "done", "selesai", "udah kelar 45 menit", "/mission complete"
 *   abort    — "abort", "batalkan misi", "stop", "/mission abort"
 *   extend   — "extend 30m", "tambahin 30 menit", "perpanjang 1 jam"
 *   status   — "status", "misi", "lagi ngapain", "what am I working on"
 *
 * Returns null when the message matches no intent — the listener stays silent.
 */

import { closestPhrase } from './fuzzyMatch';

export interface ParsedMission {
  title: string;
  /** Duration string compatible with parseDurationToMinutes (e.g. "2h", "30m", "1h30m"), or null. */
  etaStr: string | null;
  /** Habit category name pulled from a #hashtag, or null. */
  categoryName: string | null;
}

export type ParsedIntent =
  | ({ kind: 'start' } & ParsedMission)
  | { kind: 'complete'; actualStr: string | null }
  | { kind: 'abort'; target: string | null }
  | { kind: 'extend'; extendStr: string | null }
  | { kind: 'status' }
  | { kind: 'help' }
  | { kind: 'habits' }
  | { kind: 'brief' };

// ── Triggers ──────────────────────────────────────────────────────────────
// "Strong" start verbs fire on their own. Checked longest-first so
// "mission start" wins over "mission" / "start".
const STRONG_START_TRIGGERS = [
  'mission start',
  'start mission',
  'work on',
  'mengerjakan',
  'kerjakan',
  'mission',
  'misi',
  'begin',
  'start',
  'mulai',
  'task',
];

// "Soft" future-intent verbs (ID) are too common to fire blindly — they only
// register a mission when the message also carries a duration ("mau pulang
// sejam lagi" fires; "mau tanya" does not).
const SOFT_START_TRIGGERS = ['mau', 'akan', 'bakal'];

// Completion confirmations. The message must be *only* a confirmation (plus an
// optional actual duration) — "complete the refactor" is not a completion.
const COMPLETE_TRIGGERS = [
  'mission complete',
  'misi selesai',
  'sudah selesai',
  'udah selesai',
  'baru selesai',
  'sudah kelar',
  'udah kelar',
  'completed',
  'complete',
  'finished',
  'finish',
  'selesai',
  'kelar',
  'beres',
  'rampung',
  'done',
];

const ABORT_TRIGGERS = [
  'abort mission',
  'abort misi',
  'batalkan misi',
  'cancel mission',
  'stop mission',
  'stop misi',
  'batalkan',
  'hentikan',
  'abort',
  'cancel',
  'batal',
  'stop',
];

const EXTEND_TRIGGERS = [
  'need more time',
  'more time',
  'tambahin waktu',
  'tambah waktu',
  'kasih waktu',
  'perpanjang',
  'tambahin',
  'lebihin',
  'extend',
  'tambah',
];

// Status queries match the *whole* message (after trimming punctuation) so the
// ambiguous short ones ("misi", "status") don't swallow "misi coding 1h".
const STATUS_PHRASES = new Set([
  'status',
  'mission status',
  'status misi',
  'misi',
  'misi apa',
  'lagi ngapain',
  'ngapain',
  'lagi ngerjain apa',
  'what am i working on',
  'what am i doing',
  'whats my mission',
  'what is my mission',
]);

// Help / command menu — whole-message match (a leading slash is stripped by
// normalize, so "/help" arrives as "help").
const HELP_PHRASES = new Set([
  'help',
  'bantuan',
  'menu',
  'commands',
  'command',
  'perintah',
  'daftar perintah',
  'list command',
  'list commands',
  'what can you do',
]);

// Today's scheduled habits — whole-message match.
const HABITS_PHRASES = new Set([
  'habits',
  'habit',
  'kebiasaan',
  'habit hari ini',
  'kebiasaan hari ini',
  'jadwal',
  'jadwal hari ini',
  'jadwal kebiasaan',
  'daftar habit',
  'daftar kebiasaan',
  'list habit',
  'habit list',
  'today habits',
]);

// On-demand coaching brief for the current time of day — whole-message match.
const BRIEF_PHRASES = new Set([
  'brief',
  'briefing',
  'pengarahan',
  'coaching',
  'coach',
  'motivasi',
]);

// Connector words stripped before/after a duration or at the title edges.
const LEADING_CONNECTOR = /^(start|mulai|begin)\s+/i;
const EDGE_CONNECTOR = /^(for|in|to|untuk|selama|dalam)\s+|\s+(for|in|untuk|selama|dalam|lagi)$/gi;

// Optional connector + number + time unit. Units cover EN + ID spellings.
// No leading \b and a "not followed by a letter" lookahead (instead of a
// trailing \b) so contiguous tokens like "1h30m" parse as two pairs while
// "50 meters" / "home" are still rejected.
const DURATION_RE =
  /(?:\b(?:for|in|eta|selama|untuk|dalam)\s+)?(\d+(?:\.\d+)?)\s*(hours?|hrs?|jam|h|minutes?|mins?|menit|m)(?![a-z])/gi;

// ID future-intent phrased with the duration first:
//   "50 menit ke depan akan pulang", "30 menit lagi makan", "1 jam lagi meeting"
// (run after normalize() has rewritten "sejam" → "1 jam").
const FUTURE_LEADING_RE =
  /^(\d+\s*(?:jam|menit|hours?|hrs?|minutes?|mins?|h|m)(?:\s*\d+\s*(?:menit|mins?|m))?)\s+(?:ke depan|lagi)\s+(?:akan|mau|bakal)?\s*(.+)$/i;

function isHourUnit(unit: string): boolean {
  const c = unit[0].toLowerCase();
  return c === 'h' || c === 'j'; // h/hr/hour(s), jam
}

/**
 * Sum every "<n><unit>" occurrence in `input`, returning the canonical duration
 * string (or null) and the text with the duration tokens blanked out.
 */
function extractDuration(input: string): { etaStr: string | null; rest: string } {
  let hours = 0;
  let minutes = 0;
  let found = false;
  const rest = input.replace(DURATION_RE, (_match, num: string, unit: string) => {
    found = true;
    const value = parseFloat(num);
    if (isHourUnit(unit)) hours += value;
    else minutes += value;
    return ' ';
  });

  let etaStr: string | null = null;
  if (found) {
    let s = '';
    if (hours > 0) s += `${hours}h`;
    if (minutes > 0) s += `${Math.round(minutes)}m`;
    etaStr = s || null;
  }
  return { etaStr, rest };
}

/**
 * Normalize an inbound message: strip a leading slash-command + optional bot
 * mention ("/mission@MyBot start" → "mission start"), expand ID duration words,
 * and collapse whitespace.
 */
function normalize(raw: string): string {
  return (raw ?? '')
    .replace(/^\/([a-z]+)(@\w+)?/i, '$1') // /command or /command@bot
    .replace(/\bsetengah jam\b/gi, '30 menit')
    .replace(/\bsejam\b/gi, '1 jam')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip trailing sentence punctuation for whole-message matching. */
function stripTrailingPunct(s: string): string {
  return s.replace(/[\s?.!,]+$/, '');
}

/**
 * Closest trigger phrase at the start of the message (typo-tolerant). Returns
 * the chars consumed in the original text so callers can slice the remainder —
 * with a fuzzy match that differs from the trigger's own length.
 */
function matchTrigger(lower: string, triggers: string[]): { phrase: string; consumed: number } | null {
  const m = closestPhrase(lower, triggers);
  return m ? { phrase: m.phrase, consumed: m.consumed } : null;
}

/** Whole-message phrase match: exact set hit first, then the closest typo. */
function matchPhraseSet(lower: string, phrases: Set<string>): boolean {
  return phrases.has(lower) || closestPhrase(lower, phrases, { whole: true }) !== null;
}

/** Whatever remains after a trigger + duration is removed, with glue stripped. */
function leftoverTitle(rest: string): string {
  return rest
    .replace(/\s+/g, ' ')
    .replace(EDGE_CONNECTOR, '')
    .replace(/^[\s:,\-–]+|[\s:,\-–]+$/g, '')
    .trim();
}

/**
 * Parse a start-style message into mission slots. Returns null when there is no
 * start trigger (or future-intent phrasing) or nothing usable is left for a title.
 * Exposed separately so the slot extraction stays unit-testable on its own.
 */
export function parseMissionMessage(raw: string): ParsedMission | null {
  const text = normalize(raw);
  if (!text) return null;

  const lower = text.toLowerCase();

  let body: string | null = null;
  let soft = false;

  const strong = matchTrigger(lower, STRONG_START_TRIGGERS);
  if (strong) {
    body = text.slice(strong.consumed).replace(/^[\s:,\-–]+/, '').replace(LEADING_CONNECTOR, '').trim();
  } else {
    const future = text.match(FUTURE_LEADING_RE);
    if (future) {
      // Re-attach the duration phrase so the shared extractor picks it up.
      body = `${future[2]} ${future[1]}`.trim();
    } else {
      const softTrigger = matchTrigger(lower, SOFT_START_TRIGGERS);
      if (softTrigger) {
        soft = true;
        body = text.slice(softTrigger.consumed).replace(/^[\s:,\-–]+/, '').trim();
      }
    }
  }

  if (body === null) return null;

  // Category: first #hashtag anywhere in the body.
  let categoryName: string | null = null;
  const catMatch = body.match(/#([\p{L}\d_]+)/u);
  if (catMatch) {
    categoryName = catMatch[1];
    body = (body.slice(0, catMatch.index) + body.slice(catMatch.index! + catMatch[0].length)).trim();
  }

  const { etaStr, rest } = extractDuration(body);

  // Soft (ID future-intent) triggers only count when a duration is present.
  if (soft && !etaStr) return null;

  const title = leftoverTitle(rest);
  if (!title) return null;

  return { title, etaStr, categoryName };
}

/**
 * Classify a free-text message into a mission intent. Non-start intents are
 * checked first (most are exact or confirmation-style), then start.
 */
export function parseIntent(raw: string): ParsedIntent | null {
  const text = normalize(raw);
  if (!text) return null;

  const lower = stripTrailingPunct(text.toLowerCase());

  // Status — whole-message match only (avoids swallowing "misi coding 1h").
  if (matchPhraseSet(lower, STATUS_PHRASES)) return { kind: 'status' };

  // Help and today's-habits queries — whole-message matches.
  if (matchPhraseSet(lower, HELP_PHRASES)) return { kind: 'help' };
  if (matchPhraseSet(lower, HABITS_PHRASES)) return { kind: 'habits' };
  if (matchPhraseSet(lower, BRIEF_PHRASES)) return { kind: 'brief' };

  // Complete — a confirmation with nothing left over but an optional duration.
  const completeTrigger = matchTrigger(lower, COMPLETE_TRIGGERS);
  if (completeTrigger) {
    const remainder = stripTrailingPunct(text).slice(completeTrigger.consumed);
    const { etaStr, rest } = extractDuration(remainder);
    if (leftoverTitle(rest) === '') return { kind: 'complete', actualStr: etaStr };
  }

  // Abort — keep any text after the trigger as the target mission (a title
  // fragment), e.g. "batalkan misi baca paper" → target "baca paper".
  const abortTrigger = matchTrigger(lower, ABORT_TRIGGERS);
  if (abortTrigger) {
    const target = leftoverTitle(text.slice(abortTrigger.consumed)) || null;
    return { kind: 'abort', target };
  }

  // Extend — pull whatever duration follows the trigger (may be null).
  const extendTrigger = matchTrigger(lower, EXTEND_TRIGGERS);
  if (extendTrigger) {
    const { etaStr } = extractDuration(text.slice(extendTrigger.consumed));
    return { kind: 'extend', extendStr: etaStr };
  }

  // Start.
  const start = parseMissionMessage(text);
  if (start) return { kind: 'start', ...start };

  return null;
}

// ── ETA-expiry resolution reply ─────────────────────────────────────────────
// After a mission's ETA passes the user must reply with a status decision AND
// notes, e.g. "✅ selesai, fixed the parser" or "❌ belum, kehabisan waktu".

// Not-completed checked first so "belum selesai" wins over "selesai".
const NOT_DONE_TOKENS = [
  'belum selesai',
  'tidak selesai',
  'belum',
  'blm',
  'tidak',
  'gagal',
  'enggak',
  'nggak',
  'engga',
  'gak',
  'not done',
  'not completed',
  'no',
  'batal',
];
const DONE_TOKENS = [
  'sudah selesai',
  'udah selesai',
  'selesai',
  'sudah',
  'udah',
  'beres',
  'kelar',
  'rampung',
  'completed',
  'complete',
  'finished',
  'done',
  'komplit',
  'yes',
  'ya',
  'oke',
  'ok',
];

export interface ExpiryReply {
  /** 'completed' / 'failed' (not completed) / null when no status given. */
  status: 'completed' | 'failed' | null;
  /** Remaining text after the status token — the notes (may be ''). */
  notes: string;
}

/**
 * Parse the user's reply to an ETA-expiry prompt into a status decision + notes.
 * Not-completed markers take precedence over completed ones. Word markers are
 * typo-tolerant ("selse, fixed it" → completed), emoji markers are exact.
 */
export function parseExpiryStatusReply(raw: string): ExpiryReply {
  const text = (raw ?? '').trim();
  const clean = (s: string) => s.replace(/^[\s,.:;\-–]+/, '').trim();

  if (text.startsWith('❌')) return { status: 'failed', notes: clean(text.slice(1)) };
  if (text.startsWith('✅')) return { status: 'completed', notes: clean(text.slice(1)) };

  const lower = text.toLowerCase();
  const notDone = closestPhrase(lower, NOT_DONE_TOKENS);
  if (notDone) return { status: 'failed', notes: clean(text.slice(notDone.consumed)) };
  const done = closestPhrase(lower, DONE_TOKENS);
  if (done) return { status: 'completed', notes: clean(text.slice(done.consumed)) };
  return { status: null, notes: text };
}
