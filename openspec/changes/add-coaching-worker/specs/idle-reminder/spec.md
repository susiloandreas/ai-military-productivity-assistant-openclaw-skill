## ADDED Requirements

### Requirement: Step aside near a coaching slot

The idle reminder SHALL skip its check when the current time is within 15 minutes (before or
after) of any coaching slot (07:00 / 13:00 / 23:00, local time), so it never stacks a second
notification on top of the scheduled coaching message.

#### Scenario: Check runs near a coaching slot

- **WHEN** an idle check runs within ±15 minutes of a coaching slot
- **THEN** the worker SHALL return early without sending any reminder
- **AND** log that it stepped aside to avoid a duplicate

#### Scenario: Check runs away from any slot

- **WHEN** an idle check runs well away from every coaching slot
- **THEN** the worker SHALL proceed with its normal held / idle / habit logic

### Requirement: Held-mission reminders

When the user has missions on hold (paused but still open), the system SHALL send a
loss-aversion reminder that lists them and calls the user to resume or cancel each one. This
reminder SHALL be sent regardless of whether an active mission exists, but rate-limited to at
most once every 2 hours using the notification log (kind `held`).

#### Scenario: Held missions and not reminded recently

- **WHEN** an idle check finds one or more held missions and no `held` reminder was sent in the last 2 hours
- **THEN** the worker SHALL send a reminder listing the held missions with a resume-or-cancel call to action
- **AND** record the reminder so it is not repeated within 2 hours

#### Scenario: Held missions but reminded recently

- **WHEN** an idle check finds held missions but a `held` reminder was sent within the last 2 hours
- **THEN** the worker SHALL NOT send another held reminder this tick

### Requirement: One proactive notification per tick

The idle reminder SHALL send at most one proactive notification per check. When a held-mission
reminder is sent, the check SHALL return without also sending an idle or habit reminder, so the
two never collide.

#### Scenario: Held reminder pre-empts the idle nudge

- **WHEN** a held-mission reminder is sent during a check
- **THEN** the worker SHALL return without sending an idle or habit loss-aversion message in the same check
