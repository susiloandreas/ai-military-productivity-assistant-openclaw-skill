import { PlanService } from '../services/PlanService';
import { formatSuccess, formatError } from '../utils/formatter';
import { formatMinutes } from '../utils/duration';
import { PlanBlock } from '../types';

/**
 * /plan                              — today's orders (materialized from the template)
 * /plan geser <habit> ke <time>      — move a block
 * /plan skip <habit> [hari ini]      — skip a block (a deliberate rest, not a miss)
 * /plan tambah <title> [<dur>] [jam <time>] — add a one-off block
 * /plan tunda [<habit>] [<dur>]      — snooze the (nearest) block
 *
 * The edit verbs are the same typo-tolerant ones the chat NLP understands.
 */

const STATUS_GLYPH: Record<PlanBlock['status'], string> = {
  planned: '◻',
  done: '✅',
  skipped: '⏭',
  moved: '↪',
  proposed: '❓',
};

/** 'HH:MM:SS' → 'HH:MM'. */
const hhmm = (t: string): string => t.slice(0, 5);

function formatBlockLine(b: PlanBlock): string {
  const dur = b.duration_minutes ? ` · ${formatMinutes(b.duration_minutes)}` : '';
  return `${hhmm(b.start_time)} ${STATUS_GLYPH[b.status]} ${b.title}${dur}`;
}

function renderPlan(blocks: PlanBlock[], lead: string[] = []): string {
  if (blocks.length === 0) {
    return formatSuccess("TODAY'S PLAN", [
      ...lead,
      'No planned blocks for today.',
      'Add a recurring habit with /habit schedule add.',
    ]);
  }
  const body = blocks.map(formatBlockLine);
  return formatSuccess("TODAY'S PLAN", lead.length ? [...lead, '', ...body] : body);
}

const VIEW_ONLY = /^(list|show|today|hari ini)$/i;
const DRAFT = /^(draft|propose|propos|usul|usulkan|rancang|rencana)$/i;

export async function handlePlanCommand(
  args: string[],
  userId: string,
  service: PlanService
): Promise<string> {
  const text = args.join(' ').trim();

  if (!text || VIEW_ONLY.test(text)) {
    return renderPlan(await service.getTodayPlan(userId));
  }

  // Propose-&-confirm: draft a catch-up plan for what's been missed today.
  if (DRAFT.test(text)) {
    const proposed = await service.proposeDay(userId);
    if (proposed.length === 0) {
      return formatSuccess('PROPOSED PLAN', ['Nothing missed yet — no catch-up to propose.']);
    }
    return formatSuccess('PROPOSED PLAN', [
      ...proposed.map(formatBlockLine),
      '',
      'Reply "gas" to lock it in, or "tolak" to discard.',
    ]);
  }

  const result = await service.applyEdit(userId, text);
  if (!result.ok) return formatError(result.message);

  return renderPlan(await service.getTodayPlan(userId), [result.message]);
}
