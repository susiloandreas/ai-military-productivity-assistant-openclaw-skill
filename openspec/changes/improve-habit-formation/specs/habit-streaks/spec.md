## ADDED Requirements

### Requirement: Per-habit streak tracking

The system SHALL maintain, for each user and habit-type, a current streak and a longest streak measured in scheduled days kept. A streak SHALL increment at most once per local day per habit-type, regardless of how many times that habit is logged that day.

#### Scenario: First completion starts a streak
- **WHEN** a user logs a habit-type for the first time on a scheduled day
- **THEN** that habit-type's current streak becomes 1 and longest streak is at least 1

#### Scenario: Consecutive scheduled days increment the streak
- **WHEN** a user logs the habit-type on the next scheduled day after an existing streak
- **THEN** the current streak increments by 1

#### Scenario: Same-day duplicate logs do not inflate the streak
- **WHEN** a user logs the same habit-type twice on the same local day
- **THEN** the current streak increments by at most 1 for that day

#### Scenario: Missing a scheduled day breaks the streak
- **WHEN** a scheduled day for the habit-type passes with no log for that day
- **THEN** the next read of the habit-type's streak reports a current streak of 0

#### Scenario: Longest streak is preserved after a break
- **WHEN** a current streak is broken
- **THEN** the longest streak retains the highest value the current streak ever reached

### Requirement: Overall daily streak tracking

The system SHALL maintain an overall current and longest streak counting consecutive local days on which the user completed at least one mission.

#### Scenario: A completed mission extends the overall streak
- **WHEN** the user completes at least one mission on a local day following a day that also had a completion
- **THEN** the overall current streak increments by 1

#### Scenario: A day with no completion breaks the overall streak
- **WHEN** a local day passes with no completed mission
- **THEN** the next read reports an overall current streak of 0

### Requirement: Streaks surfaced to the user

The system SHALL surface streak state in the completion reply, the morning brief, and habit reminders, including the habit-type's current streak and a prompt not to break the chain.

#### Scenario: Completion reply shows the updated streak
- **WHEN** a habit-linked mission is completed
- **THEN** the reply includes the habit-type's current streak count

#### Scenario: Morning brief includes a streak summary
- **WHEN** the morning brief is generated
- **THEN** it includes the overall streak and at least the longest active per-habit streak
