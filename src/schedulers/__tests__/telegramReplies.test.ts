import {
  replyStarted,
  replyCompleted,
  replyAborted,
  replyExtended,
  replyNeedExtendDuration,
  replyStatus,
  replyEtaExpiredAskNotes,
  replyNotesSaved,
  replyExpiryNeedsBoth,
  replyExpiryResolved,
  replyError,
} from '../telegramReplies';
import { Mission } from '../../types';

// Deterministic rng → always picks the first variant in every copy pool.
const firstRng = () => 0;

function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'm1',
    user_id: 'u1',
    title: 'Coding',
    habit_category_id: null,
    habit_type_id: null,
    eta_minutes: null,
    mode: 'live',
    status: 'active',
    started_at: new Date(),
    completed_at: null,
    paused_at: null,
    actual_duration_minutes: null,
    notes: null,
    created_at: new Date(),
    ...overrides,
  } as Mission;
}

describe('telegramReplies', () => {
  it('renders a started reply with title and ETA', () => {
    const out = replyStarted(mission({ eta_minutes: 60 }), null, null, firstRng);
    expect(out).toContain('Coding');
    expect(out).toContain('1h');
  });

  it('shows the category line only when both id and name are present', () => {
    const withCat = replyStarted(mission({ habit_category_id: 'c1' }), 'tennis', null, firstRng);
    expect(withCat).toContain('tennis');
    expect(replyStarted(mission(), null, null, firstRng)).not.toContain('Kategori');
  });

  it('reminds about a held mission on start', () => {
    const out = replyStarted(mission({ title: 'New' }), null, mission({ title: 'Old' }), firstRng);
    expect(out).toContain('DITAHAN');
    expect(out).toContain('Old');
  });

  it('renders a completed reply with duration and goal progress', () => {
    const out = replyCompleted(
      {
        mission: mission({ actual_duration_minutes: 90 }),
        goalProgress: {
          goal: { title: 'Tennis 50h' } as never,
          progressLog: {} as never,
          totalProgress: 600,
          milestonesUnlocked: [],
          goalCompleted: false,
        },
      },
      firstRng
    );
    expect(out).toContain('1h 30m');
    expect(out).toContain('10h'); // 600 minutes of goal progress
    expect(out).toContain('notes'); // asks what the user did
  });

  it('asks for status + notes on ETA expiry and confirms when saved', () => {
    const expired = replyEtaExpiredAskNotes(mission({ title: 'Refactor', eta_minutes: 60 }), firstRng);
    expect(expired).toContain('ETA HABIS');
    expect(expired).toContain('Refactor');
    expect(expired).toContain('✅'); // done option
    expect(expired).toContain('❌'); // not-done option
    expect(replyNotesSaved(mission({ title: 'Refactor' }), firstRng)).toContain('Refactor');
  });

  it('re-prompts when the expiry reply lacks status or notes', () => {
    expect(replyExpiryNeedsBoth()).toMatch(/status/i);
  });

  it('confirms an expired mission resolved as completed vs not completed', () => {
    const done = replyExpiryResolved(
      { mission: mission({ title: 'Refactor', status: 'completed', actual_duration_minutes: 30, notes: 'done it' }), goalProgress: null },
      firstRng
    );
    expect(done).toContain('SELESAI');
    expect(done).toContain('done it');

    const notDone = replyExpiryResolved(
      { mission: mission({ title: 'Refactor', status: 'failed', notes: 'ran out' }), goalProgress: null },
      firstRng
    );
    expect(notDone).toContain('TIDAK SELESAI');
    expect(notDone).toContain('ran out');
  });

  it('renders abort and extend replies', () => {
    expect(replyAborted(mission(), firstRng)).toContain('Coding');
    expect(replyExtended(mission({ eta_minutes: 45 }), firstRng)).toContain('45m');
    expect(replyNeedExtendDuration(firstRng)).toMatch(/menit|jam|m/);
  });

  it('reports status: active mission vs no mission', () => {
    const active = replyStatus(mission({ started_at: new Date(Date.now() - 10 * 60000) }), [], firstRng);
    expect(active).toContain('Coding');
    expect(replyStatus(null, [], firstRng)).toContain('TIDAK ADA MISI AKTIF');
  });

  it('lists held missions in the status reply', () => {
    const out = replyStatus(null, [mission({ title: 'Held A' }), mission({ title: 'Held B' })], firstRng);
    expect(out).toContain('DITAHAN (2)');
    expect(out).toContain('Held A');
    expect(out).toContain('Held B');
  });

  it('wraps an error message', () => {
    expect(replyError('No active mission to complete.', firstRng)).toContain('No active mission');
  });
});
