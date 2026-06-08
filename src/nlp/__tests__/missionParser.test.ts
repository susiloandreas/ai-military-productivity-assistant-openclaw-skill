import { parseMissionMessage, parseIntent } from '../missionParser';
import { parseDurationToMinutes } from '../../utils/duration';

describe('parseMissionMessage', () => {
  it('returns null when there is no trigger word', () => {
    expect(parseMissionMessage('how is the weather today')).toBeNull();
  });

  it('returns null for empty / whitespace input', () => {
    expect(parseMissionMessage('')).toBeNull();
    expect(parseMissionMessage('   ')).toBeNull();
  });

  it('returns null when only the trigger is present (no title)', () => {
    expect(parseMissionMessage('start')).toBeNull();
    expect(parseMissionMessage('mission start')).toBeNull();
  });

  it('parses a bare title with no eta or category', () => {
    expect(parseMissionMessage('start writing the report')).toEqual({
      title: 'writing the report',
      etaStr: null,
      categoryName: null,
    });
  });

  it('extracts an hour eta with the "for" connector', () => {
    expect(parseMissionMessage('start coding the parser for 2h')).toEqual({
      title: 'coding the parser',
      etaStr: '2h',
      categoryName: null,
    });
  });

  it('extracts a minutes eta', () => {
    expect(parseMissionMessage('begin deep work 45m')).toEqual({
      title: 'deep work',
      etaStr: '45m',
      categoryName: null,
    });
  });

  it('extracts a combined hours + minutes eta', () => {
    const result = parseMissionMessage('start gym session for 1h30m');
    expect(result?.etaStr).toBe('1h30m');
    expect(parseDurationToMinutes(result!.etaStr!)).toBe(90);
  });

  it('handles "mission start" prefix without duplicating the verb', () => {
    expect(parseMissionMessage('mission start review the PR')).toEqual({
      title: 'review the PR',
      etaStr: null,
      categoryName: null,
    });
  });

  it('pulls a #hashtag into the category and removes it from the title', () => {
    expect(parseMissionMessage('start focus block 30m #deepwork')).toEqual({
      title: 'focus block',
      etaStr: '30m',
      categoryName: 'deepwork',
    });
  });

  it('understands Indonesian: verb, "selama", and unit spellings', () => {
    const result = parseMissionMessage('mulai latihan tenis selama 1 jam 30 menit #tennis');
    expect(result?.title).toBe('latihan tenis');
    expect(result?.categoryName).toBe('tennis');
    expect(parseDurationToMinutes(result!.etaStr!)).toBe(90);
  });

  it('accepts spaced English units like "2 hours" / "30 minutes"', () => {
    expect(parseMissionMessage('start meditation for 30 minutes')?.etaStr).toBe('30m');
    expect(parseMissionMessage('start long run for 2 hours')?.etaStr).toBe('2h');
  });

  it('does not treat unrelated numbers as a duration', () => {
    const result = parseMissionMessage('start read 50 pages of the book');
    expect(result?.title).toBe('read 50 pages of the book');
    expect(result?.etaStr).toBeNull();
  });

  it('is case-insensitive on the trigger', () => {
    expect(parseMissionMessage('START emails')?.title).toBe('emails');
  });

  it('strips a leading slash command and bot mention', () => {
    expect(parseMissionMessage('/mission start openclaw 1h')).toEqual({
      title: 'openclaw',
      etaStr: '1h',
      categoryName: null,
    });
    expect(parseMissionMessage('/mission@IronClawBot start review PR')?.title).toBe('review PR');
  });

  it('understands "misi" as an Indonesian start trigger', () => {
    expect(parseMissionMessage('misi coding 1h')).toEqual({
      title: 'coding',
      etaStr: '1h',
      categoryName: null,
    });
  });

  it('expands Indonesian duration words (sejam / setengah jam)', () => {
    expect(parseDurationToMinutes(parseMissionMessage('mulai meeting sejam')!.etaStr!)).toBe(60);
    expect(parseDurationToMinutes(parseMissionMessage('mulai stretching setengah jam')!.etaStr!)).toBe(30);
  });

  it('handles duration-led Indonesian future intent', () => {
    expect(parseMissionMessage('50 menit ke depan akan pulang')).toEqual({
      title: 'pulang',
      etaStr: '50m',
      categoryName: null,
    });
    expect(parseMissionMessage('30 menit lagi makan siang')?.title).toBe('makan siang');
    expect(parseMissionMessage('sejam ke depan akan meeting')?.etaStr).toBe('1h');
  });

  it('fires soft triggers only when a duration is present', () => {
    expect(parseMissionMessage('mau tanya dong')).toBeNull();
    expect(parseMissionMessage('mau pulang sejam lagi')).toEqual({
      title: 'pulang',
      etaStr: '1h',
      categoryName: null,
    });
  });
});

describe('parseIntent', () => {
  it('classifies a start intent', () => {
    expect(parseIntent('start coding the parser for 2h')).toEqual({
      kind: 'start',
      title: 'coding the parser',
      etaStr: '2h',
      categoryName: null,
    });
  });

  it('classifies completion confirmations (EN + ID), with optional duration', () => {
    expect(parseIntent('done')).toEqual({ kind: 'complete', actualStr: null });
    expect(parseIntent('selesai')).toEqual({ kind: 'complete', actualStr: null });
    expect(parseIntent('udah kelar 45 menit')).toEqual({ kind: 'complete', actualStr: '45m' });
    expect(parseIntent('/mission complete')).toEqual({ kind: 'complete', actualStr: null });
  });

  it('does not treat "complete <title>" as a completion', () => {
    expect(parseIntent('complete the auth refactor')).toBeNull();
  });

  it('classifies abort intents', () => {
    expect(parseIntent('abort')).toEqual({ kind: 'abort' });
    expect(parseIntent('batalkan misi')).toEqual({ kind: 'abort' });
    expect(parseIntent('stop')).toEqual({ kind: 'abort' });
  });

  it('classifies extend intents and pulls the duration', () => {
    expect(parseIntent('extend 30m')).toEqual({ kind: 'extend', extendStr: '30m' });
    expect(parseIntent('tambahin 30 menit')).toEqual({ kind: 'extend', extendStr: '30m' });
    expect(parseIntent('perpanjang sejam')).toEqual({ kind: 'extend', extendStr: '1h' });
    expect(parseIntent('extend')).toEqual({ kind: 'extend', extendStr: null });
  });

  it('classifies status queries by whole-message match', () => {
    expect(parseIntent('status')).toEqual({ kind: 'status' });
    expect(parseIntent('misi')).toEqual({ kind: 'status' });
    expect(parseIntent('lagi ngapain?')).toEqual({ kind: 'status' });
    // not a status query — has a title, so it's a start
    expect(parseIntent('misi coding 1h')?.kind).toBe('start');
  });

  it('returns null for unrelated chatter', () => {
    expect(parseIntent('how is the weather today')).toBeNull();
  });
});
