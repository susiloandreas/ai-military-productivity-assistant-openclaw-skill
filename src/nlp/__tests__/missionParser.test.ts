import { parseMissionMessage } from '../missionParser';
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
});
