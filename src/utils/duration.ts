/**
 * Parse duration strings like "2h", "30m", "1h30m" into total minutes.
 */
export function parseDurationToMinutes(input: string): number {
  const normalized = input.trim().toLowerCase();
  const hoursMatch = normalized.match(/(\d+(?:\.\d+)?)h/);
  const minsMatch = normalized.match(/(\d+)m/);

  const hours = hoursMatch ? parseFloat(hoursMatch[1]) : 0;
  const mins = minsMatch ? parseInt(minsMatch[1], 10) : 0;

  if (hours === 0 && mins === 0) {
    throw new Error(`Invalid duration format: "${input}". Use formats like "2h", "30m", "1h30m".`);
  }

  return Math.round(hours * 60 + mins);
}

/**
 * Format minutes into a human-readable duration string.
 */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
