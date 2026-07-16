/**
 * Timezone-correct day boundaries. Computed explicitly from an IANA zone rather
 * than relying on the process's own TZ, so a sync triggered from any service
 * (whatever its TZ env) agrees on what "today" is.
 */

/** Minutes east of UTC for `timeZone` at the given instant (handles DST). */
export function tzOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) if (p.type !== 'literal') map[p.type] = Number(p.value);
  // `hour` can come back as 24 at midnight in some engines; normalize to 0.
  const hour = map.hour === 24 ? 0 : map.hour;
  const asUTC = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second);
  return Math.round((asUTC - date.getTime()) / 60_000);
}

/** ISO [from, to] spanning the local calendar day (00:00:00 → 23:59:59.999) in `timeZone`. */
export function zonedTodayWindow(now: Date, timeZone: string): { from: string; to: string } {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now); // YYYY-MM-DD
  const offsetMin = tzOffsetMinutes(now, timeZone);
  const midnightUtcMs = new Date(`${ymd}T00:00:00Z`).getTime() - offsetMin * 60_000;
  return {
    from: new Date(midnightUtcMs).toISOString(),
    to: new Date(midnightUtcMs + 24 * 60 * 60_000 - 1).toISOString(),
  };
}
