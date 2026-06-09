## ADDED Requirements

### Requirement: Completion reward escalates with streak length

The system SHALL make the moment-of-completion message escalate its celebration based on the current streak length, so longer streaks produce a stronger satisfying signal.

#### Scenario: Short streak gets a standard cheer
- **WHEN** a mission is completed and the relevant streak is short (e.g. tier 1)
- **THEN** the completion message uses a standard celebration

#### Scenario: Milestone streak gets an amplified cheer
- **WHEN** a mission is completed and the streak reaches a milestone tier (e.g. 3, 7, 14, 30+)
- **THEN** the completion message uses an amplified celebration that names the streak achievement

#### Scenario: Reward tier passed to the AI prompt
- **WHEN** the AI completion cheer is generated
- **THEN** the prompt includes the current streak and its tier so the generated text matches the celebration level

#### Scenario: Fallback respects the tier
- **WHEN** the AI is unavailable and the static fallback is used
- **THEN** the fallback still reflects the streak tier in its celebration
