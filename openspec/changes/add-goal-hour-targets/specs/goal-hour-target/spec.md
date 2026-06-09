## ADDED Requirements

### Requirement: Hour-based duration target on a goal

A goal SHALL carry an explicit, nullable hour-based duration target (`target_hours`)
representing the hours of logged duration it must accumulate to be achieved. The field MUST be
optional so goals created without a target, and pre-existing goals, remain valid.

#### Scenario: Create a goal with an hour target

- **WHEN** a goal is created with an hour target
- **THEN** the goal SHALL persist that value in `target_hours`

#### Scenario: Create a goal without an hour target

- **WHEN** a goal is created without an hour target
- **THEN** `target_hours` SHALL be null and the goal SHALL still be created

### Requirement: Backfill from the final-exam milestone

Existing goals SHALL have `target_hours` backfilled from their final-exam milestone, converting
the milestone's minute target to hours (`target_value / 60`), applied only where `target_hours`
is currently null.

#### Scenario: Existing goal with a final-exam milestone

- **WHEN** the migration runs against a goal that has a final-exam milestone and no `target_hours`
- **THEN** `target_hours` SHALL be set to the milestone's minutes divided by 60

#### Scenario: Goal already has an hour target

- **WHEN** the migration runs against a goal whose `target_hours` is already set
- **THEN** the existing value SHALL be left unchanged

### Requirement: Habit goal derives hours from its minute target

Creating a habit-type goal SHALL set `target_hours` to its minute target divided by 60, so the
hour target stays consistent with the final-exam milestone created from the same minutes.

#### Scenario: Create a habit goal

- **WHEN** a habit goal is created with a minute target
- **THEN** the goal's `target_hours` SHALL equal that minute target divided by 60

### Requirement: Seed category goals with hour targets

The system SHALL provide an idempotent seed that creates a category-level goal per configured
category with an hour target, intermediate hour checkpoints, and a final-exam hour milestone. A
category that already has an active goal MUST be skipped, and minutes already logged
retroactively in the category MUST be rolled into the new goal's progress.

#### Scenario: Seed a category without an active goal

- **WHEN** the seed runs for a category that has no active goal
- **THEN** it SHALL create the goal with its hour target, checkpoints, and final-exam milestone
- **AND** backfill progress from retroactive minutes already logged in that category

#### Scenario: Seed a category that already has an active goal

- **WHEN** the seed runs for a category that already has an active goal
- **THEN** it SHALL skip that category without creating a duplicate goal
