## ADDED Requirements

### Requirement: Define a habit schedule

The system SHALL allow a habit to be scheduled at an expected time of day, on specific
weekdays, with a grace window. A schedule MUST reference a habit type (creating the type
if it does not yet exist under the given category) and store an expected time, a list of
weekdays, and a grace period in minutes (default 90).

#### Scenario: Schedule a habit

- **WHEN** the user runs `/habit schedule add <category> <type> <time> <days>`
- **THEN** the system SHALL create an active schedule for that habit type with the given time, weekdays, and grace window
- **AND** confirm the habit, time, days, and grace period

#### Scenario: Invalid time

- **WHEN** the provided time is not a valid `HH:MM` (hours 0–23, minutes 0–59)
- **THEN** the system SHALL reject the command with an error and create nothing

#### Scenario: Unknown weekday

- **WHEN** the provided days contain an unrecognised token
- **THEN** the system SHALL reject the command with an error and create nothing

#### Scenario: Weekday keywords

- **WHEN** the days are given as `daily`, `weekdays`, or `weekends`
- **THEN** the system SHALL expand them to the corresponding weekday set (all 7 days, Mon–Fri, or Sun+Sat)

### Requirement: List habit schedules

The system SHALL list the user's active habit schedules with their time, habit, category,
and scheduled weekdays.

#### Scenario: List schedules

- **WHEN** the user runs `/habit schedule list`
- **THEN** the system SHALL return each active schedule showing its time, habit type, category, and weekdays

#### Scenario: No schedules

- **WHEN** the user has no active schedules
- **THEN** the system SHALL report that none exist
