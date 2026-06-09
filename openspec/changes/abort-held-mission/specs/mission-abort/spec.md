## ADDED Requirements

### Requirement: Abort the active mission

The system SHALL cancel the user's active mission when an abort is requested without a target,
marking it `failed` and removing any pending ETA expiry job.

#### Scenario: Active mission aborted

- **WHEN** an abort is requested with no target and the user has an active mission
- **THEN** that mission SHALL be marked `failed` and its ETA expiry job removed
- **AND** the reply SHALL confirm which mission was aborted

### Requirement: Abort a named mission

The system SHALL cancel the active or held mission whose title contains the supplied target
text (case-insensitive). When no mission matches, it MUST report that nothing matched; when the
target matches more than one mission, it MUST treat the request as ambiguous and not abort any.

#### Scenario: Held mission named explicitly

- **WHEN** an abort is requested with a target that matches exactly one active or held mission
- **THEN** that mission SHALL be marked `failed`
- **AND** the reply SHALL confirm which mission was aborted

#### Scenario: Target matches nothing

- **WHEN** an abort is requested with a target that matches no active or held mission
- **THEN** no mission SHALL be aborted and the reply SHALL say nothing matched

#### Scenario: Target is ambiguous

- **WHEN** an abort target matches more than one mission
- **THEN** no mission SHALL be aborted and the reply SHALL ask the user to name the mission more precisely

### Requirement: Abort a held mission without a target

The system SHALL, when an abort is requested with no target and there is no active mission,
cancel the single held mission if exactly one is held. When more than one mission is held, it
MUST NOT abort any and MUST ask the user which one to cancel, listing the held missions.

#### Scenario: Exactly one held mission

- **WHEN** an abort is requested with no target, there is no active mission, and exactly one mission is held
- **THEN** that held mission SHALL be marked `failed`
- **AND** the reply SHALL confirm which mission was aborted

#### Scenario: Multiple held missions

- **WHEN** an abort is requested with no target, there is no active mission, and more than one mission is held
- **THEN** no mission SHALL be aborted
- **AND** the reply SHALL list the held missions and ask the user to name which one to cancel

#### Scenario: Nothing to abort

- **WHEN** an abort is requested with no target and there is neither an active nor a held mission
- **THEN** no mission SHALL be aborted and the reply SHALL report there is nothing to abort
