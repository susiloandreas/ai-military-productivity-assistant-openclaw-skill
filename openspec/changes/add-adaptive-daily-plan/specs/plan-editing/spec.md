## ADDED Requirements

### Requirement: Move a block to a new time

The system SHALL let the user move a block to a new start time from natural language. A moved block SHALL keep its identity and habit-type, take the new start time, and be marked with status `moved`.

#### Scenario: Natural-language move updates the time
- **WHEN** the user says to move a habit to a later time (e.g. "geser lari ke jam 5 sore")
- **THEN** that block's start time becomes 17:00 and its status becomes `moved`

### Requirement: Skip a block as a deliberate rest

The system SHALL let the user skip a block for the day. A skipped block SHALL be marked with status `skipped` and MUST NOT be treated as a missed scheduled day by reminders, coaching, or discipline scoring.

#### Scenario: Skipping marks the block and suppresses the miss
- **WHEN** the user says to skip a habit today (e.g. "skip meditasi hari ini")
- **THEN** that block's status becomes `skipped` and it is never reported as missed

### Requirement: Add an ad-hoc block

The system SHALL let the user add a one-off block to today's plan from natural language, with a start time and duration. If the named activity matches or creates a habit-type it SHALL be linked; a purely one-off activity SHALL be stored with no habit-type and a free-text title.

#### Scenario: Typed ad-hoc add links a habit-type
- **WHEN** the user adds a known activity with a time and duration (e.g. "tambah baca 30 menit jam 9 malam")
- **THEN** a new planned block is created at 21:00 for 30 minutes linked to the reading habit-type

#### Scenario: One-off add has no habit-type
- **WHEN** the user adds an activity that is not a habit-type
- **THEN** a planned block is created with a free-text title and no habit-type link

### Requirement: Snooze a due block

The system SHALL let the user snooze a due block by a relative offset, bumping its start time forward by that amount.

#### Scenario: Snooze bumps the start time
- **WHEN** the user snoozes a due block by 30 minutes (e.g. "tunda 30 menit")
- **THEN** that block's start time advances by 30 minutes

### Requirement: A block is completed by a matching mission

The system SHALL mark a block `done` when a mission of the block's habit-type is logged within the block's window (start time through start time plus grace). The completing mission SHALL be recorded on the block.

#### Scenario: Logging in the window completes the block
- **WHEN** a mission of the block's habit-type is logged within the block's window
- **THEN** the block's status becomes `done` and the completing mission is recorded on it

#### Scenario: A completed block is not reopened
- **WHEN** a block is already `done`
- **THEN** a later edit does not silently revert it to `planned`
