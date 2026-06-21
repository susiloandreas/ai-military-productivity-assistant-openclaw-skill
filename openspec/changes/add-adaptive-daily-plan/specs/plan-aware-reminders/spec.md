## ADDED Requirements

### Requirement: Reminders and coaching read the day plan

Idle reminders and coaching context SHALL evaluate today's plan blocks rather than `habit_schedules` directly. A `planned` block whose window has closed with no matching mission SHALL be eligible for a missed-habit nudge; `done`, `skipped`, and `proposed` blocks SHALL NOT be nudged. A `moved` block SHALL be evaluated at its new time.

#### Scenario: A passed, unlogged planned block is nudged
- **WHEN** a planned block's window closes with no matching mission logged
- **THEN** it is eligible for the idle reminder's missed-habit nudge

#### Scenario: A skipped block is never nudged
- **WHEN** a block's status is `skipped`
- **THEN** no reminder or coaching message treats it as missed

#### Scenario: A done block is not nudged
- **WHEN** a block has been completed
- **THEN** it is excluded from missed-habit nudges

#### Scenario: A moved block is evaluated at its new time
- **WHEN** a block was moved to a later time
- **THEN** its window and any nudge are based on the new start time, not the template time

### Requirement: Unedited plans preserve existing reminder behavior

For a user who never edits the plan, the plan-sourced reminders SHALL be equivalent to the previous `habit_schedules`-sourced reminders, preserving grace windows and the existing loss-aversion gating.

#### Scenario: Parity with the template when nothing is edited
- **WHEN** a user with schedules never edits the day plan
- **THEN** the reminders they receive match what the template alone would have produced

### Requirement: Discipline scoring receives a planned-versus-actual signal

The system SHALL expose, per day, which planned blocks were completed, missed, or skipped, so discipline scoring can distinguish a deliberate skip from a silent no-show.

#### Scenario: Completed and missed blocks are distinguished from skips
- **WHEN** the day's plan outcomes are read for scoring
- **THEN** planned-and-done, planned-and-missed, and skipped blocks are reported as distinct outcomes
