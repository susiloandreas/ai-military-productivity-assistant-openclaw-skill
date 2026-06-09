## ADDED Requirements

### Requirement: Competence-first default tone

The system SHALL bias coaching and reminder copy toward competence and mastery feedback (progress made, streaks held, score and focus improvements) as the default, rather than fear or shame.

#### Scenario: Routine nudge uses competence framing
- **WHEN** the bot sends a routine reminder or coaching message outside an inflection point
- **THEN** the message leads with progress/capability feedback and does not use shaming language

#### Scenario: AI prompt carries the tone directive
- **WHEN** a Gemini-generated coaching or follow-up message is requested outside an inflection point
- **THEN** the prompt instructs a competence-oriented tone

### Requirement: Loss-aversion gated to inflection points

The system SHALL restrict loss-aversion language to genuine inflection points, defined as: an active streak at risk of breaking today, two or more consecutive missed scheduled days, or the nightly debrief.

#### Scenario: Loss aversion fires when a streak is at risk
- **WHEN** the user has an active streak and a scheduled habit sustaining it will break today if not logged
- **THEN** the message is permitted to use loss-aversion language

#### Scenario: Loss aversion suppressed on a good day
- **WHEN** no inflection-point condition is met
- **THEN** the message does not use loss-aversion language

### Requirement: A single gate governs tone

The system SHALL determine tone through one shared predicate so coaching, reminders, and AI prompts apply the same competence-vs-loss-aversion decision.

#### Scenario: Consistent tone decision across surfaces
- **WHEN** the same user state is evaluated for a reminder and for a coaching brief at the same time
- **THEN** both surfaces make the same loss-aversion-vs-competence tone decision
