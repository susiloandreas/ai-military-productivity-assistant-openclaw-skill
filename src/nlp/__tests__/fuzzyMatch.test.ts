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
  it('charges full cost for consonant edits', () => {
    expect(editDistance('selesai', 'selesai')).toBe(0);
    expect(editDistance('kelar', 'kear')).toBe(1); // dropped consonant
    expect(editDistance('kitten', 'sitting')).toBe(2.625); // 2 consonant subs + vowel sub
  });

  it('discounts vowel edits (colloquial vowel drift)', () => {
    expect(editDistance('belom', 'belum')).toBe(0.625); // vowel substitution
    expect(editDistance('slesai', 'selesai')).toBe(0.375); // dropped vowel
    expect(editDistance('blom', 'belum')).toBe(1); // dropped vowel + vowel sub
    expect(editDistance('mule', 'mulai')).toBe(1); // vowel sub + missing vowel
    expect(editDistance('betul', 'batal')).toBe(1.25); // two vowel subs — over budget
  });

  it('counts an adjacent consonant transposition as one edit (OSA)', () => {
    expect(editDistance('tsop', 'stop')).toBe(1);
  });
});

describe('tokenDistance', () => {
  it('matches exactly at distance 0', () => {
    expect(tokenDistance('selesai', 'selesai')).toBe(0);
  });

  it('tolerates 1 edit on 5–7 char words and 2 on 8+', () => {
    expect(tokenDistance('slesai', 'selesai')).toBe(0.375);
    expect(tokenDistance('finishd', 'finished')).toBe(0.375);
    expect(tokenDistance('selsai', 'selesai')).toBe(0.375);
  });

  it('matches colloquial vowel-shift spellings', () => {
    expect(tokenDistance('mule', 'mulai')).toBe(1);
    expect(tokenDistance('belom', 'belum')).toBe(0.625);
    expect(tokenDistance('blom', 'belum')).toBe(1);
  });

  it('keeps genuinely different words apart despite the vowel discount', () => {
    expect(tokenDistance('betul', 'batal')).toBeNull();
    expect(tokenDistance('tidur', 'tidak')).toBeNull();
    expect(tokenDistance('masi', 'misi')).toBeNull();
  });

  it('only tolerates a transposition on 4-char words', () => {
    expect(tokenDistance('doen', 'done')).toBe(0.75); // matched via swap, scored by weight
    expect(tokenDistance('miss', 'misi')).toBeNull(); // substitution — rejected
  });

  it('requires exact match on words of 3 chars or fewer', () => {
    expect(tokenDistance('oke', 'oke')).toBe(0);
    expect(tokenDistance('okk', 'oke')).toBeNull();
  });

  it('matches a truncated typo against the candidate prefix ("selse" → "selesai")', () => {
    expect(tokenDistance('selse', 'selesai')).toBe(1.25); // "seles" + prefix penalty
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
