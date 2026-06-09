## ADDED Requirements

### Requirement: Command help query

The system SHALL recognize a whole-message help query (e.g. `help`, `/help`, `bantuan`,
`menu`) and reply with a static list of every supported command, each paired with a
natural-language usage example. The match MUST be whole-message only, so a longer message that
merely contains a help word is not treated as a help query.

#### Scenario: User asks for help

- **WHEN** the user sends a message equal to a help trigger (a leading slash is allowed)
- **THEN** the system SHALL reply with the command list including mission start, complete, extend, abort, status, and the habits query

#### Scenario: Help word inside a longer message

- **WHEN** a message contains a help word but is not equal to a help trigger
- **THEN** the system SHALL NOT treat it as a help query

### Requirement: Today's habits query

The system SHALL recognize a whole-message habits query (e.g. `habits`, `/habits`,
`kebiasaan`, `jadwal hari ini`) and reply with the habits scheduled for today, each shown with
its scheduled time and a status, sorted by scheduled time, with a count of how many are done
out of the total. When no habit is scheduled for today, it MUST reply that nothing is
scheduled.

#### Scenario: Habits scheduled today

- **WHEN** the user sends a habits-query trigger and habits are scheduled for today
- **THEN** the reply SHALL list each of today's habits with its time and status and a done/total counter

#### Scenario: No habits scheduled today

- **WHEN** the user sends a habits-query trigger and nothing is scheduled for today
- **THEN** the reply SHALL state that there are no scheduled habits today

#### Scenario: Habits query does not swallow a mission

- **WHEN** the user sends a mission message that contains a habit word (e.g. "mulai habit reading 30m")
- **THEN** the system SHALL treat it as a mission start, not a habits query

### Requirement: Per-habit status for today

The system SHALL tag each habit scheduled for today as done, missed, due, or upcoming. A habit
is done when it has been logged today; otherwise upcoming before its scheduled time, due while
within its grace window (`expected_at` to `expected_at + grace_minutes`), and missed once that
window has closed. Today's weekday and the current time MUST be evaluated in the process's
local timezone.

#### Scenario: Statuses across the day

- **WHEN** today's habits are summarized at a given time
- **THEN** a logged habit SHALL be done, an unlogged habit before its time SHALL be upcoming, one inside its grace window SHALL be due, and one past its window SHALL be missed

#### Scenario: Habit not scheduled for today is excluded

- **WHEN** a habit is not scheduled for the current weekday
- **THEN** it SHALL NOT appear in today's habits summary
