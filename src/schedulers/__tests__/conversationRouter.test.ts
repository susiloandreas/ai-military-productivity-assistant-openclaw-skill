import { route, PendingMission } from '../conversationRouter';
import { Mission } from '../../types';

function pending(overrides: Partial<PendingMission> = {}): PendingMission {
  return {
    title: 'Coding',
    etaStr: '30m',
    categoryName: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

function awaitingMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'm1',
    user_id: 'u1',
    title: 'Coding',
    habit_category_id: null,
    habit_type_id: null,
    eta_minutes: null,
    mode: 'live',
    status: 'completed',
    started_at: new Date(),
    completed_at: new Date(),
    paused_at: null,
    actual_duration_minutes: 30,
    notes: null,
    created_at: new Date(),
    ...overrides,
  } as Mission;
}

describe('route — pending mission confirmation', () => {
  it('confirms a pending mission on a bare "ya"', () => {
    const p = pending();
    expect(route('ya', p, null)).toEqual({ type: 'confirm_pending', pending: p });
  });

  it('confirms on any recognized confirmation word', () => {
    expect(route('gas', pending(), null).type).toBe('confirm_pending');
    expect(route('lanjut', pending(), null).type).toBe('confirm_pending');
  });

  it('does not confirm when the text is actually a different command', () => {
    // "status" both fails the confirmation regex and parses as a real intent.
    const action = route('status', pending(), null);
    expect(action).toEqual({ type: 'command', intent: { kind: 'status' } });
  });

  it('leaves the pending mission untouched (falls through to silent) for unrelated free text', () => {
    const action = route('lorem ipsum dolor sit amet', pending(), null);
    expect(action.type).toBe('silent');
  });

  it('falls through when there is no pending mission at all', () => {
    const action = route('ya', null, null);
    expect(action.type).toBe('silent');
  });

  it('starts the calendar event on "kalender" when one was offered', () => {
    const evt = { title: 'Lunch', categoryName: 'BUFFER', endsAt: '2026-07-16T13:30:00+07:00' };
    const p = pending({ calendarEvent: evt });
    expect(route('kalender', p, null)).toEqual({ type: 'confirm_calendar', event: evt });
    expect(route('ikuti jadwal', p, null)).toEqual({ type: 'confirm_calendar', event: evt });
  });

  it('still confirms the new mission on "ya" even when a calendar option exists', () => {
    const p = pending({ calendarEvent: { title: 'Lunch', categoryName: null, endsAt: null } });
    expect(route('ya', p, null)).toEqual({ type: 'confirm_pending', pending: p });
  });

  it('treats "kalender" as a normal list view when nothing is pending', () => {
    expect(route('kalender', null, null)).toEqual({
      type: 'command',
      intent: { kind: 'calendar_view', category: null },
    });
  });
});

describe('route — ETA-expired mission awaiting resolution', () => {
  const expired = awaitingMission({ status: 'eta_expired' });

  it('resolves as completed when a status and notes are both given', () => {
    const action = route('selesai, sudah kelar', null, expired);
    expect(action).toEqual({
      type: 'resolve_expired',
      missionId: 'm1',
      completed: true,
      notes: 'sudah kelar',
    });
  });

  it('resolves as not-completed for a failure status', () => {
    const action = route('belum, kehabisan waktu', null, expired);
    expect(action).toEqual({
      type: 'resolve_expired',
      missionId: 'm1',
      completed: false,
      notes: 'kehabisan waktu',
    });
  });

  it('resolves immediately on a bare status with no notes — notes can follow separately', () => {
    const action = route('selesai', null, expired);
    expect(action).toEqual({ type: 'resolve_expired', missionId: 'm1', completed: true, notes: '' });
  });

  it('resolves as not-completed on a bare "belum" too', () => {
    const action = route('belum', null, expired);
    expect(action).toEqual({ type: 'resolve_expired', missionId: 'm1', completed: false, notes: '' });
  });

  it('asks for a status on free text carrying no recognizable status at all', () => {
    expect(route('masih di jalan', null, expired).type).toBe('expiry_needs_status');
  });

  it('revives the mission when "perpanjang <durasi>" is sent', () => {
    const action = route('perpanjang 15m', null, expired);
    expect(action).toEqual({ type: 'extend_expired', missionId: 'm1', extendStr: '15m' });
  });

  it('asks for a duration when "perpanjang" has none', () => {
    expect(route('perpanjang', null, expired).type).toBe('needs_extend_duration');
  });

  it('drops the prompt and runs a different command when the user moved on', () => {
    const action = route('batalkan', null, expired);
    expect(action).toEqual({
      type: 'expiry_command',
      missionId: 'm1',
      intent: { kind: 'abort', target: null },
    });
  });
});

describe('route — mission awaiting notes after a normal completion', () => {
  const completed = awaitingMission({ status: 'completed' });

  it('captures free text as notes', () => {
    const action = route('  implemented the whatsapp channel  ', null, completed);
    expect(action).toEqual({
      type: 'record_notes',
      missionId: 'm1',
      notes: 'implemented the whatsapp channel',
    });
  });

  it('drops the notes prompt and runs a command when the user moved on', () => {
    const action = route('mulai belajar 30 menit', null, completed);
    expect(action).toEqual({
      type: 'notes_command',
      missionId: 'm1',
      intent: { kind: 'start', title: 'belajar', etaStr: '30m', categoryName: null },
    });
  });
});

describe('route — no pending state', () => {
  it('routes a recognized plan phrase to plan_edit', () => {
    const action = route('rencana', null, null);
    expect(action).toEqual({ type: 'plan_edit', edit: { kind: 'view' } });
  });

  it('stays silent for unrecognized free text', () => {
    expect(route('lorem ipsum dolor sit amet', null, null).type).toBe('silent');
  });

  it('routes a recognized mission intent to command', () => {
    expect(route('status', null, null)).toEqual({ type: 'command', intent: { kind: 'status' } });
  });
});
