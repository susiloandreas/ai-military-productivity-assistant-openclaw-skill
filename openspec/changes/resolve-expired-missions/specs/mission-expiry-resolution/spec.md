## ADDED Requirements

### Requirement: Parse a status-and-notes expiry reply

The system SHALL parse an ETA-expiry reply into a completion status and notes by stripping a
single leading status token and treating the cleaned remainder as the notes. Not-done tokens
MUST be matched before done tokens so a reply that contains both (e.g. "belum selesai") resolves
to not done. When no status token is recognized, the status SHALL be null and the whole text is
the notes.

#### Scenario: Done reply with notes

- **WHEN** a reply begins with a done token followed by text (e.g. "✅ selesai, fixed the parser")
- **THEN** the status SHALL be completed and the notes SHALL be the text after the token

#### Scenario: Not-done reply with notes

- **WHEN** a reply begins with a not-done token (e.g. "❌ belum, kehabisan waktu")
- **THEN** the status SHALL be failed (not completed) and the notes SHALL be the text after the token

#### Scenario: Ambiguous reply prefers not done

- **WHEN** a reply contains both a not-done and a done word at the start (e.g. "belum selesai")
- **THEN** the status SHALL be failed (not completed)

#### Scenario: No recognizable status

- **WHEN** a reply has no recognizable status token
- **THEN** the status SHALL be null and the entire text SHALL be the notes

### Requirement: Require both status and notes

The system SHALL finalize an expired mission only when the reply provides both a status and
non-empty notes. When either is missing, it MUST re-prompt with the expected `status + notes`
format and leave the mission awaiting a reply without changing it.

#### Scenario: Complete reply

- **WHEN** an expiry reply provides both a status and notes
- **THEN** the mission SHALL be resolved with that status and notes

#### Scenario: Missing status or notes

- **WHEN** an expiry reply is missing the status and/or the notes
- **THEN** the system SHALL re-prompt for both and the mission SHALL remain awaiting a reply

### Requirement: Resolve a completed expired mission

The system SHALL, when an expired mission is resolved as completed, record the completed status
with the notes, set the actual duration to the elapsed minutes since the mission started (at
least 1), clear the awaiting-notes flag, and advance any linked goals using that duration.

#### Scenario: Resolve as completed

- **WHEN** an expired mission is resolved as completed with notes
- **THEN** the mission SHALL be marked completed with the notes and an elapsed-minute duration
- **AND** any linked goals SHALL be advanced by that duration
- **AND** the awaiting-notes flag SHALL be cleared

### Requirement: Resolve a not-completed expired mission

The system SHALL, when an expired mission is resolved as not completed, record the failed status
with the notes, clear the awaiting-notes flag, and make no goal progress.

#### Scenario: Resolve as not completed

- **WHEN** an expired mission is resolved as not completed with notes
- **THEN** the mission SHALL be marked failed with the notes
- **AND** no linked goal SHALL be advanced
- **AND** the awaiting-notes flag SHALL be cleared

### Requirement: Resolution confirmation message

The system SHALL send a confirmation after resolving an expired mission, stating whether it was
closed as done or not done. For a completion it MUST include the recorded duration and any
unlocked milestone or goal completion; for both outcomes it MUST include the notes.

#### Scenario: Confirm a completion

- **WHEN** an expired mission is resolved as completed
- **THEN** the confirmation SHALL show the done outcome, the duration, the notes, and any goal milestone or completion reached

#### Scenario: Confirm a non-completion

- **WHEN** an expired mission is resolved as not completed
- **THEN** the confirmation SHALL show the not-done outcome and the notes
