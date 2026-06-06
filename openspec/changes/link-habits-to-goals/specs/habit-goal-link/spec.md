## ADDED Requirements

### Requirement: Goal tied to a specific habit

The system SHALL allow a goal to target a specific habit type, in addition to the existing
category-level goals. A habit-linked goal MUST record which habit type it targets and have
a target value (a final-exam milestone). Creating one for a habit type that does not yet
exist under the category SHALL create the habit type.

#### Scenario: Create a habit goal

- **WHEN** the user runs `/habit goal set <category> <type> <target>`
- **THEN** the system SHALL create an active goal linked to that habit type with a final-exam milestone at the target value
- **AND** confirm the goal, habit, and target

#### Scenario: Duplicate active goal

- **WHEN** an active goal already exists for that habit type
- **THEN** the system SHALL reject the command with an error and create nothing

#### Scenario: Unknown category

- **WHEN** the named category does not exist
- **THEN** the system SHALL reject the command with an error

### Requirement: Logging a habit advances its goal

When a habit is logged, the system SHALL advance the active goal tied to that specific
habit type, if one exists, by the logged duration. It SHALL also advance the active
category-level (aggregate) goal if one exists. A habit-type goal MUST NOT be advanced as a
category goal as well.

#### Scenario: Habit with its own goal

- **WHEN** the user logs a habit that has an active habit-type goal
- **THEN** that goal's progress SHALL increase by the logged duration
- **AND** any final-exam milestone reached SHALL mark the goal achieved

#### Scenario: Habit with only a category goal

- **WHEN** the user logs a habit whose type has no goal but whose category has an aggregate goal
- **THEN** only the category goal SHALL be advanced

#### Scenario: Habit with both goals

- **WHEN** the user logs a habit that has both a habit-type goal and a category aggregate goal
- **THEN** both goals SHALL be advanced, each exactly once

### Requirement: Habit goals appear in goal status

The system SHALL display habit-linked goals in goal status, labelled with both the
category and the habit type.

#### Scenario: Status shows the habit

- **WHEN** the user views `/status goals` and a goal is tied to a habit type
- **THEN** the goal SHALL be labelled with its category and habit type (e.g. `EXERCISE / RUNNING`)
