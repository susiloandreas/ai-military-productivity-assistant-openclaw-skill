/**
 * Typo-tolerant keyword matching for the rule-based parser. Deterministic and
 * dependency-free: tokens are normalized (lowercased, diacritics stripped,
 * stretched letters collapsed) and compared by edit distance, so "selse",
 * "slesai" or "doneee" still resolve to "selesai" / "done".
 *
 * Tolerance is deliberately conservative to keep false positives out of a
 * trigger-word parser:
 *   - candidate ≥ 8 chars  → up to 2 edits
 *   - candidate 5–7 chars  → 1 edit
 *   - candidate 4 chars    → adjacent transposition only ("doen" → "done",
 *                            but NOT "miss" → "misi")
 *   - candidate ≤ 3 chars  → exact only
 *   - truncated typing     → a token ≥ 4 chars covering ≥ 60% of a longer
 *                            candidate is matched against the candidate's
 *                            prefix ("selse" → "seles|ai"), ranked slightly
 *                            below a full-word match.
 */

export interface Token {
  /** Normalized word used for comparison. */
  word: string;
  /** End offset (exclusive) of the raw token in the original string. */
  end: number;
}

export interface PhraseMatch {
  /** The candidate phrase that matched. */
  phrase: string;
  /** Characters of the original text consumed by the match. */
  consumed: number;
  /** 0 = exact; higher = fuzzier. Comparable across candidates. */
  score: number;
}

/** Lowercase, strip diacritics, collapse letter runs of 3+ ("doneee" → "done"). */
export function normalizeToken(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])\1{2,}/g, '$1');
}

/**
 * Optimal-string-alignment distance: Levenshtein + adjacent transposition
 * counted as one edit. With `allowTransposition` false it is plain Levenshtein.
 */
export function editDistance(a: string, b: string, allowTransposition = true): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev2: number[] = [];
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (allowTransposition && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, prev2[j - 2] + 1);
      }
      cur.push(d);
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

/** Edits tolerated for a candidate word of `len` chars (see module doc). */
function maxEditsFor(len: number): number {
  if (len >= 8) return 2;
  if (len >= 5) return 1;
  return 0;
}

/** Whether `token` matches `word` under the length-scaled tolerance. */
function fuzzyWordMatch(token: string, word: string): boolean {
  if (token === word) return true;
  const limit = maxEditsFor(word.length);
  if (limit > 0) return editDistance(token, word) <= limit;
  // 4-char words tolerate a transposition only ("doen"→"done"); shorter are exact.
  return (
    word.length === 4 && editDistance(token, word) === 1 && editDistance(token, word, false) === 2
  );
}

/**
 * Distance between a (normalized) message token and a candidate word, or null
 * when they don't match. Prefix matches score +0.5 so a full-word match wins.
 */
export function tokenDistance(token: string, word: string): number | null {
  if (token === word) return 0;
  if (fuzzyWordMatch(token, word)) return editDistance(token, word);
  // Truncated typing: match against the candidate's same-length prefix.
  if (token.length >= 4 && token.length < word.length && token.length / word.length >= 0.6) {
    const prefix = word.slice(0, token.length);
    if (fuzzyWordMatch(token, prefix)) return editDistance(token, prefix) + 0.5;
  }
  return null;
}

/** Split into whitespace tokens, keeping each raw token's end offset. */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const word = normalizeToken(m[0].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
    out.push({ word, end: m.index + m[0].length });
  }
  return out;
}

/** Fuzzy-match `phrase` against the leading tokens; null when any word misses. */
function matchPhrasePrefix(tokens: Token[], phrase: string): { consumed: number; score: number } | null {
  const words = phrase.split(' ');
  if (tokens.length < words.length) return null;
  let score = 0;
  for (let i = 0; i < words.length; i++) {
    const d = tokenDistance(tokens[i].word, words[i]);
    if (d === null) return null;
    score += d;
  }
  return { consumed: tokens[words.length - 1].end, score };
}

/**
 * Closest candidate phrase matching the start of `text` (or, with
 * `whole: true`, the entire text). Lowest score wins; ties keep the earliest
 * candidate, so order lists longest/most-specific first.
 */
export function closestPhrase(
  text: string,
  phrases: Iterable<string>,
  opts: { whole?: boolean } = {},
): PhraseMatch | null {
  const tokens = tokenize(text);
  if (tokens.length === 0) return null;
  let best: PhraseMatch | null = null;
  for (const phrase of phrases) {
    const words = phrase.split(' ');
    if (opts.whole && words.length !== tokens.length) continue;
    const m = matchPhrasePrefix(tokens, phrase);
    if (m && (best === null || m.score < best.score)) {
      best = { phrase, ...m };
      if (best.score === 0) break;
    }
  }
  return best;
}
