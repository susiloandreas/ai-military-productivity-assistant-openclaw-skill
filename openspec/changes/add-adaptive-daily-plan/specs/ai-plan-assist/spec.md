## ADDED Requirements

### Requirement: The morning brief proposes a draft plan

The morning brief SHALL be able to propose an ordered day plan derived from the template, the user's active goals and how far behind each is, what is already logged, and any stated constraint. Proposed blocks SHALL be recorded with status `proposed` and MUST NOT be acted on by reminders or scoring until accepted.

#### Scenario: The brief drafts a proposed plan
- **WHEN** the morning brief runs and proposes a plan
- **THEN** the proposed blocks are stored with status `proposed` and presented to the user for acceptance

#### Scenario: Proposed blocks are inert until accepted
- **WHEN** blocks exist with status `proposed`
- **THEN** reminders and discipline scoring ignore them

### Requirement: Acceptance applies a proposal, rejection discards it

The system SHALL apply a proposal only on explicit user acceptance. Acceptance SHALL promote `proposed` blocks to `planned` (and apply a proposed move to its target block); rejection SHALL discard the proposed blocks or the proposed change.

#### Scenario: Accepting promotes the proposal
- **WHEN** the user accepts a proposed plan
- **THEN** its `proposed` blocks become `planned` and take effect for reminders and scoring

#### Scenario: Rejecting discards the proposal
- **WHEN** the user rejects a proposed plan
- **THEN** the proposed blocks are removed and the active plan is unchanged

### Requirement: Slippage triggers a proposed re-plan

When a `planned` block's window is missed, the idle reminder SHALL be able to propose a re-plan (e.g. a new later time) for that block. The proposal MUST NOT change the block until the user accepts.

#### Scenario: A missed block prompts a re-plan offer
- **WHEN** a planned block's window closes unlogged
- **THEN** the reminder may offer to move it to a new time

#### Scenario: The block is unchanged until acceptance
- **WHEN** a re-plan has been proposed but not accepted
- **THEN** the block keeps its original time and status

#### Scenario: Accepting the re-plan applies the move
- **WHEN** the user accepts the proposed re-plan
- **THEN** the block's start time becomes the proposed time and its status becomes `moved`

### Requirement: AI never mutates the plan autonomously

No AI-initiated draft or re-plan SHALL change a `planned`, `done`, or `skipped` block without explicit user acceptance.

#### Scenario: No acceptance leaves the plan untouched
- **WHEN** the AI proposes a draft or re-plan and the user does not accept
- **THEN** the existing plan blocks are unchanged
