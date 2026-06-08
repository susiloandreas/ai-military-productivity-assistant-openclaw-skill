/**
 * Rule-based (no-AI) parser that turns a free-text Telegram message into a
 * register-mission intent. Deterministic and fully unit-testable — it relies on
 * keyword triggers and duration/category patterns, not a language model.
 *
 * Examples it understands:
 *   "start coding the parser for 2h"        -> title "coding the parser", eta "2h"
 *   "mulai latihan tenis selama 1 jam 30 menit #tennis"
 *   "begin deep work 45m #focus"
 *   "task review PR"                          -> title "review PR", no eta
 *
 * Returns null when the message is not a mission request (no trigger word) or
 * when nothing usable is left for the title.
 */
export interface ParsedMission {
  title: string;
  /** Duration string compatible with parseDurationToMinutes (e.g. "2h", "30m", "1h30m"), or null. */
  etaStr: string | null;
  /** Habit category name pulled from a #hashtag, or null. */
  categoryName: string | null;
}

// Checked longest-first so "mission start" wins over "mission" / "start".
const TRIGGERS = [
  'mission start',
  'start mission',
  'work on',
  'mengerjakan',
  'kerjakan',
  'mission',
  'begin',
  'start',
  'mulai',
  'task',
];

// Connector words stripped before/after a duration or at the title edges.
const LEADING_CONNECTOR = /^(start|mulai|begin)\s+/i;
const EDGE_CONNECTOR = /^(for|in|to|untuk|selama|dalam)\s+|\s+(for|in|untuk|selama|dalam)$/gi;

// Optional connector + number + time unit. Units cover EN + ID spellings.
// No leading \b and a "not followed by a letter" lookahead (instead of a
// trailing \b) so contiguous tokens like "1h30m" parse as two pairs while
// "50 meters" / "home" are still rejected.
const DURATION_RE =
  /(?:\b(?:for|in|eta|selama|untuk|dalam)\s+)?(\d+(?:\.\d+)?)\s*(hours?|hrs?|jam|h|minutes?|mins?|menit|m)(?![a-z])/gi;

function isHourUnit(unit: string): boolean {
  const c = unit[0].toLowerCase();
  return c === 'h' || c === 'j'; // h/hr/hour(s), jam
}

export function parseMissionMessage(raw: string): ParsedMission | null {
  const text = (raw ?? '').trim();
  if (!text) return null;

  const lower = text.toLowerCase();
  const trigger = TRIGGERS.find(k => lower === k || lower.startsWith(k + ' '));
  if (!trigger) return null;

  // Drop the trigger, any glue punctuation, and a secondary start verb
  // (handles "mission start ...").
  let body = text
    .slice(trigger.length)
    .replace(/^[\s:,\-–]+/, '')
    .replace(LEADING_CONNECTOR, '')
    .trim();

  // Category: first #hashtag anywhere in the body.
  let categoryName: string | null = null;
  const catMatch = body.match(/#([\p{L}\d_]+)/u);
  if (catMatch) {
    categoryName = catMatch[1];
    body = (body.slice(0, catMatch.index) + body.slice(catMatch.index! + catMatch[0].length)).trim();
  }

  // Duration: sum every "<n><unit>" occurrence, removing them from the title.
  let hours = 0;
  let minutes = 0;
  let foundDuration = false;
  body = body.replace(DURATION_RE, (_match, num: string, unit: string) => {
    foundDuration = true;
    const value = parseFloat(num);
    if (isHourUnit(unit)) hours += value;
    else minutes += value;
    return ' ';
  });

  let etaStr: string | null = null;
  if (foundDuration) {
    let s = '';
    if (hours > 0) s += `${hours}h`;
    if (minutes > 0) s += `${Math.round(minutes)}m`;
    etaStr = s || null;
  }

  // Clean up whatever remains into a title.
  const title = body
    .replace(/\s+/g, ' ')
    .replace(EDGE_CONNECTOR, '')
    .replace(/^[\s:,\-–]+|[\s:,\-–]+$/g, '')
    .trim();

  if (!title) return null;

  return { title, etaStr, categoryName };
}
