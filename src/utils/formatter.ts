/**
 * Military-tone response formatter.
 * Produces structured, concise output consistent with the ironclaw-ai persona.
 */

export function formatSuccess(title: string, lines: string[]): string {
  return [`\u25a0 ${title.toUpperCase()}`, '', ...lines].join('\n');
}

export function formatError(message: string): string {
  return `\u26a0 OPERATION FAILED\n\n${message}`;
}

export function formatStatus(title: string, fields: Record<string, string | number | null | undefined>): string {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k.toUpperCase().replace(/_/g, ' ')}: ${v}`);
  return [`\u25a0 ${title.toUpperCase()}`, '', ...lines].join('\n');
}

export function formatBlock(title: string, sections: { label: string; lines: string[] }[]): string {
  const parts = [`\u25a0\u25a0 ${title.toUpperCase()} \u25a0\u25a0`];
  for (const { label, lines } of sections) {
    parts.push('');
    parts.push(`${label.toUpperCase()}:`);
    parts.push(...lines);
  }
  return parts.join('\n');
}

/**
 * Format a timestamp as local clock time "HH:MM" (24-hour) in the app timezone
 * (process.env.TZ, defaulting to Asia/Jakarta). Used to show a mission's end time
 * on completion.
 */
export function formatClockTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: process.env.TZ || 'Asia/Jakarta',
  }).format(date);
}

export function formatProgress(current: number, target: number, unit: string): string {
  const pct = Math.min(100, Math.round((current / target) * 100));
  const filled = Math.round(pct / 10);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);
  return `[${bar}] ${pct}% (${current} / ${target} ${unit})`;
}
