## ADDED Requirements

### Requirement: De-duplication of proactive notifications

The system SHALL persist a log of proactive outbound notifications so that a given
notification is sent at most once. A notification SHALL be identified by a `(user_id,
dedup_key)` pair that is unique; claiming a key MUST be atomic so concurrent or repeated
attempts agree on a single winner.

#### Scenario: First claim of a key wins

- **WHEN** a caller claims a `dedup_key` that has not been recorded for the user
- **THEN** the claim SHALL succeed (return true) and the key SHALL be recorded

#### Scenario: Repeat claim of a key loses

- **WHEN** a caller claims a `dedup_key` already recorded for the user
- **THEN** the claim SHALL fail (return false) and no duplicate row is created

### Requirement: Recent-send lookup

The system SHALL report whether a notification was sent for a user within the last N minutes,
optionally restricted to a single `kind`. This supports rate-limiting repeat notifications.

#### Scenario: A notification was sent recently

- **WHEN** a notification of the given kind was recorded within the last N minutes
- **THEN** the lookup SHALL return true

#### Scenario: No recent notification

- **WHEN** no notification (of the given kind, if specified) was recorded within the last N minutes
- **THEN** the lookup SHALL return false

### Requirement: Recording a one-off notification

The system SHALL record a non-deduplicated notification with a timestamped key, so that
rate-limited notifications (e.g. held-mission reminders, idle nudges) leave a trace for the
recent-send lookup without blocking future sends.

#### Scenario: Record a sent notification

- **WHEN** a one-off notification of a kind is recorded
- **THEN** a row SHALL be written with the current timestamp for that user and kind
