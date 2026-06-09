## ADDED Requirements

### Requirement: Missed scheduled habits are recoverable, not failures

The system SHALL present a missed or ETA-expired scheduled habit as "missed (recoverable)" rather than a blanket failure, and SHALL offer the user an immediate path to still log it today.

#### Scenario: A single miss is framed as recoverable
- **WHEN** a scheduled habit's grace window closes today with no log and the user has not missed it the previous scheduled day
- **THEN** the reminder frames it as recoverable and does not use shaming/loss-aversion language

#### Scenario: Recovery offer includes a minimum-viable version
- **WHEN** the bot nudges about a missed scheduled habit
- **THEN** the message offers a 2-minute minimum version of the habit as an acceptable way to keep the chain alive today

### Requirement: Never miss twice escalation

The system SHALL escalate its messaging only when a habit is missed on two or more consecutive scheduled days, treating the second consecutive miss as the inflection point at which loss-aversion language is permitted.

#### Scenario: Second consecutive miss escalates
- **WHEN** a habit is missed on two consecutive scheduled days
- **THEN** the reminder escalates in urgency and may use loss-aversion language

#### Scenario: A recovered habit resets the escalation
- **WHEN** the user logs the habit (including via the minimum-viable version) after a miss
- **THEN** the escalation state resets so the next single miss is treated gently again
