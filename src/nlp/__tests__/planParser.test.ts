import { parsePlanEdit, parseClockPhrase } from '../planParser';

describe('parseClockPhrase', () => {
  it.each([
    ['jam 5 sore', '17:00'],
    ['jam 9 malam', '21:00'],
    ['jam 12 malam', '00:00'],
    ['jam 7 pagi', '07:00'],
    ['jam 12 siang', '12:00'],
    ['jam 1 siang', '13:00'],
    ['17:00', '17:00'],
    ['06:30', '06:30'],
    ['5pm', '17:00'],
    ['8am', '08:00'],
    ['jam 8', '08:00'],
  ])('parses "%s" → %s', (input, expected) => {
    expect(parseClockPhrase(input)).toBe(expected);
  });

  it('returns null when there is no hour', () => {
    expect(parseClockPhrase('sore nanti')).toBeNull();
  });
});

describe('parsePlanEdit', () => {
  it('parses a move with an Indonesian time-of-day', () => {
    expect(parsePlanEdit('geser lari ke jam 5 sore')).toEqual({ kind: 'move', target: 'lari', at: '17:00' });
  });

  it('parses a move with a 24h clock', () => {
    expect(parsePlanEdit('pindah workout ke 06:30')).toEqual({ kind: 'move', target: 'workout', at: '06:30' });
  });

  it('rejects a move with no time', () => {
    expect(parsePlanEdit('geser lari')).toBeNull();
  });

  it('parses a skip, dropping "hari ini"', () => {
    expect(parsePlanEdit('skip meditasi hari ini')).toEqual({ kind: 'skip', target: 'meditasi' });
  });

  it('parses a multi-word skip target', () => {
    expect(parsePlanEdit('lewati english writing')).toEqual({ kind: 'skip', target: 'english writing' });
  });

  it('parses an ad-hoc add with duration and time', () => {
    expect(parsePlanEdit('tambah baca 30 menit jam 9 malam')).toEqual({
      kind: 'add',
      title: 'baca',
      at: '21:00',
      durationStr: '30m',
    });
  });

  it('parses an ad-hoc add with only a time', () => {
    expect(parsePlanEdit('tambah lunch jam 12')).toEqual({
      kind: 'add',
      title: 'lunch',
      at: '12:00',
      durationStr: null,
    });
  });

  it('parses a snooze with a duration', () => {
    expect(parsePlanEdit('tunda 30 menit')).toEqual({ kind: 'snooze', minutes: 30, target: null });
  });

  it('defaults a bare snooze to 15 minutes', () => {
    expect(parsePlanEdit('tunda')).toEqual({ kind: 'snooze', minutes: 15, target: null });
  });

  it('parses a snooze with an explicit target', () => {
    expect(parsePlanEdit('tunda lari 30 menit')).toEqual({ kind: 'snooze', minutes: 30, target: 'lari' });
  });

  it('tolerates a verb typo', () => {
    expect(parsePlanEdit('geserr lari ke jam 5 sore')).toEqual({ kind: 'move', target: 'lari', at: '17:00' });
  });

  it('returns null when no verb is present', () => {
    expect(parsePlanEdit('lari ke jam 5 sore')).toBeNull();
    expect(parsePlanEdit('')).toBeNull();
  });

  it('parses accept confirmations', () => {
    for (const s of ['gas', 'ok', 'oke', 'setuju', 'gas terus']) {
      expect(parsePlanEdit(s)).toEqual({ kind: 'accept' });
    }
  });

  it('parses reject confirmations', () => {
    for (const s of ['tolak', 'batal', 'jangan', 'skip semua']) {
      expect(parsePlanEdit(s)).toEqual({ kind: 'reject' });
    }
  });
});
