## ADDED Requirements

### Requirement: Day plan derived from the schedule template

The system SHALL maintain, per user and local calendar day, a day plan of time-blocks. On the first read of a given day the plan SHALL be materialized from the user's active `habit_schedules` whose `days_of_week` includes that weekday, one block per matching schedule, carrying the schedule's expected time and grace window. Materialization SHALL be idempotent: repeated reads of the same day MUST NOT create duplicate blocks.

#### Scenario: First read materializes today's blocks
- **WHEN** the day plan is read for the first time on a day that has matching active schedules
- **THEN** one planned block is created per matching schedule, ordered by start time, each linked to its source schedule

#### Scenario: Subsequent reads are stable
- **WHEN** the day plan is read again later the same day
- **THEN** the same blocks are returned and no additional blocks are created

#### Scenario: Schedules not for today are excluded
- **WHEN** a schedule is inactive or its `days_of_week` does not include today's weekday
- **THEN** no block is materialized from it for today

#### Scenario: Editing the plan never changes the template
- **WHEN** any block in the day plan is moved, skipped, added, or snoozed
- **THEN** the underlying `habit_schedules` rows are unchanged

### Requirement: Plan is scoped to a local calendar day

Each day plan SHALL belong to exactly one local calendar day, and edits to one day's plan MUST NOT affect any other day. A new local day SHALL produce a fresh plan re-derived from the template.

#### Scenario: A new day starts fresh from the template
- **WHEN** the day plan is read on a day after blocks were moved or skipped on a previous day
- **THEN** the new day's plan reflects the template, not the prior day's edits

### Requirement: View today's plan

The system SHALL provide a `/plan` view listing today's blocks in start-time order, each showing its title, time, duration, and status (planned, done, skipped, moved, or proposed).

#### Scenario: Plan view lists ordered blocks with status
- **WHEN** the user requests `/plan` and the day has blocks
- **THEN** the response lists every block in start-time order with its time and current status

#### Scenario: Empty plan is communicated
- **WHEN** the user requests `/plan` and no schedules match today
- **THEN** the response states there are no planned blocks for today
