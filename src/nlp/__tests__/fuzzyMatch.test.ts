import { normalizeToken, editDistance, tokenDistance, closestPhrase } from '../fuzzyMatch';

describe('normalizeToken', () => {
  it('lowercases and strips diacritics', () => {
    expect(normalizeToken('Selesai')).toBe('selesai');
    expect(normalizeToken('café')).toBe('cafe');
  });

  it('collapses stretched letters (3+ run) but keeps doubles', () => {
    expect(normalizeToken('doneee')).toBe('done');
    expect(normalizeToken('selesaiii')).toBe('selesai');
    expect(normalizeToken('nggak')).toBe('nggak');
  });
});

describe('editDistance', () => {
  it('computes classic Levenshtein costs', () => {
    expect(editDistance('selesai', 'selesai')).toBe(0);
    expect(editDistance('slesai', 'selesai')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });

  it('counts an adjacent transposition as one edit (OSA)', () => {
    expect(editDistance('doen', 'done')).toBe(1);
    expect(editDistance('doen', 'done', false)).toBe(2);
  });
});

describe('tokenDistance', () => {
  it('matches exactly at distance 0', () => {
    expect(tokenDistance('selesai', 'selesai')).toBe(0);
  });

  it('tolerates 1 edit on 5–7 char words and 2 on 8+', () => {
    expect(tokenDistance('slesai', 'selesai')).toBe(1);
    expect(tokenDistance('finishd', 'finished')).toBe(1);
    expect(tokenDistance('selsai', 'selesai')).toBe(1);
  });

  it('only tolerates a transposition on 4-char words', () => {
    expect(tokenDistance('doen', 'done')).toBe(1);
    expect(tokenDistance('miss', 'misi')).toBeNull(); // substitution — rejected
  });

  it('requires exact match on words of 3 chars or fewer', () => {
    expect(tokenDistance('oke', 'oke')).toBe(0);
    expect(tokenDistance('okk', 'oke')).toBeNull();
  });

  it('matches a truncated typo against the candidate prefix ("selse" → "selesai")', () => {
    expect(tokenDistance('selse', 'selesai')).toBe(1.5); // "seles" + prefix penalty
    expect(tokenDistance('seles', 'selesai')).toBe(0.5);
  });

  it('rejects short fragments that cover too little of the candidate', () => {
    expect(tokenDistance('sel', 'selesai')).toBeNull();
    expect(tokenDistance('sele', 'selesaikan')).toBeNull(); // 4/10 < 60%
  });
});

describe('closestPhrase', () => {
  const COMPLETE = ['sudah selesai', 'selesai', 'kelar', 'done'];

  it('prefers the lowest-distance candidate', () => {
    expect(closestPhrase('selse', COMPLETE)?.phrase).toBe('selesai');
    expect(closestPhrase('doen', COMPLETE)?.phrase).toBe('done');
  });

  it('keeps the earliest candidate on a tie (longest-first lists win)', () => {
    expect(closestPhrase('sudah selesai sih', COMPLETE)?.phrase).toBe('sudah selesai');
  });

  it('reports the chars consumed in the original text, not the phrase length', () => {
    const m = closestPhrase('selse 45 menit', COMPLETE);
    expect(m?.consumed).toBe(5);
  });

  it('consumes trailing punctuation attached to the matched token', () => {
    const m = closestPhrase('selesai, beresin parser', COMPLETE);
    expect(m?.phrase).toBe('selesai');
    expect(m?.consumed).toBe('selesai,'.length);
  });

  it('matches multi-word phrases token by token with typos', () => {
    expect(closestPhrase('sudh selesai', COMPLETE)?.phrase).toBe('sudah selesai');
  });

  it('whole mode requires the message to be exactly the phrase', () => {
    expect(closestPhrase('statsu', ['status'], { whole: true })?.phrase).toBe('status');
    expect(closestPhrase('status misi coding', ['status'], { whole: true })).toBeNull();
  });

  it('returns null when nothing is close enough', () => {
    expect(closestPhrase('how is the weather', COMPLETE)).toBeNull();
    expect(closestPhrase('', COMPLETE)).toBeNull();
  });
});
