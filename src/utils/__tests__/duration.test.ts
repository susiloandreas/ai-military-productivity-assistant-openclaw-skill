import { parseDurationToMinutes, formatMinutes } from '../../utils/duration';

describe('parseDurationToMinutes', () => {
  it('parses hours only: "2h" → 120', () => {
    expect(parseDurationToMinutes('2h')).toBe(120);
  });

  it('parses minutes only: "45m" → 45', () => {
    expect(parseDurationToMinutes('45m')).toBe(45);
  });

  it('parses combined: "1h30m" → 90', () => {
    expect(parseDurationToMinutes('1h30m')).toBe(90);
  });

  it('parses combined with spaces: "1h 30m" → 90', () => {
    expect(parseDurationToMinutes('1h 30m')).toBe(90);
  });

  it('parses plain integer as minutes: "60" → 60', () => {
    expect(() => parseDurationToMinutes('60')).toThrow('Invalid duration format');
  });

  it('parses zero: "0m" → throws', () => {
    expect(() => parseDurationToMinutes('0m')).toThrow('Invalid duration format');
  });

  it('parses "90m" → 90', () => {
    expect(parseDurationToMinutes('90m')).toBe(90);
  });

  it('parses "3h" → 180', () => {
    expect(parseDurationToMinutes('3h')).toBe(180);
  });

  it('throws for plain integer with no unit', () => {
    expect(() => parseDurationToMinutes('60')).toThrow('Invalid duration format');
  });

  it('throws for zero minutes "0m"', () => {
    expect(() => parseDurationToMinutes('0m')).toThrow('Invalid duration format');
  });

  it('throws for completely invalid input', () => {
    expect(() => parseDurationToMinutes('abc')).toThrow('Invalid duration format');
  });
});

describe('formatMinutes', () => {
  it('formats 90 → "1h 30m"', () => {
    expect(formatMinutes(90)).toBe('1h 30m');
  });

  it('formats 60 → "1h"', () => {
    expect(formatMinutes(60)).toBe('1h');
  });

  it('formats 45 → "45m"', () => {
    expect(formatMinutes(45)).toBe('45m');
  });

  it('formats 0 → "0m"', () => {
    expect(formatMinutes(0)).toBe('0m');
  });

  it('formats 120 → "2h"', () => {
    expect(formatMinutes(120)).toBe('2h');
  });

  it('formats 125 → "2h 5m"', () => {
    expect(formatMinutes(125)).toBe('2h 5m');
  });
});
