## ADDED Requirements

### Requirement: Periodic idle detection

The system SHALL run a standalone worker process that checks whether the default user
has an active mission on a fixed interval of 15 minutes. The check MUST also run once
immediately on worker startup.

#### Scenario: No active mission on a scheduled check

- **WHEN** an interval check runs and `MissionRepository.getActive` returns no active mission for the default user
- **THEN** the worker SHALL send an idle reminder to Telegram
- **AND** log that no active mission was found and a reminder was sent

#### Scenario: Active mission on a scheduled check

- **WHEN** an interval check runs and an active mission exists for the default user
- **THEN** the worker SHALL NOT send a reminder
- **AND** log the title of the active mission

#### Scenario: Immediate check on startup

- **WHEN** the worker process starts
- **THEN** it SHALL perform the idle check once immediately before waiting for the first 15-minute interval

### Requirement: Idle reminder message

The system SHALL send a military-style reminder that asks the user to declare their
current activity. The message MUST be delivered as HTML and instruct the user to start
a mission via OpenClaw.

#### Scenario: Reminder content

- **WHEN** an idle reminder is sent
- **THEN** the message SHALL be formatted as Telegram HTML and direct the user to declare a mission (e.g. `"mulai [aktivitas]"`)

### Requirement: Varied message wording

To avoid feeling like a fixed alarm, reminders SHALL be assembled from pools of
interchangeable copy variants (e.g. headers, intros, closers, calls-to-action) chosen
pseudo-randomly, so the wording differs between sends. The randomness source MUST be
injectable so output can be made deterministic for tests. Every produced message MUST
still come from the defined copy and preserve the required content (the habit details and
the call to declare a mission).

#### Scenario: Wording varies between sends

- **WHEN** the same reminder condition produces messages with different random draws
- **THEN** the wording MAY differ while the essential content (affected habits and the call to action) is preserved

#### Scenario: Deterministic for tests

- **WHEN** a fixed randomness source is supplied
- **THEN** the produced message SHALL be deterministic

### Requirement: Loss-aversion reminder for scheduled habits

When the user is idle, the system SHALL evaluate the user's active habit schedules for the
current day and time. A scheduled habit is DUE when the current time is within its grace
window (`expected_at` to `expected_at + grace_minutes`) and MISSED when the window has
closed, in both cases only if the habit has not been logged today. When at least one habit
is DUE or MISSED, the idle reminder SHALL be a loss-aversion message that names those
habits and their schedule, instead of the generic prompt. MISSED habits MUST be listed
before DUE habits. The current day and time MUST be evaluated in the worker process's
local timezone.

#### Scenario: A scheduled habit has been missed

- **WHEN** an idle check runs and a habit scheduled for today is past its grace window and not logged today
- **THEN** the reminder SHALL name the habit, its scheduled time, and how long it is overdue, framed as a failure to keep today's commitment

#### Scenario: A scheduled habit is currently due

- **WHEN** an idle check runs and a habit scheduled for today is inside its grace window and not logged today
- **THEN** the reminder SHALL name the habit and the time remaining before it is failed

#### Scenario: Habit already logged or not scheduled today

- **WHEN** a habit has already been logged today, is not scheduled for the current weekday, or its window has not yet started
- **THEN** that habit SHALL NOT appear in the reminder

#### Scenario: Nothing due or missed

- **WHEN** an idle check runs and no scheduled habit is due or missed
- **THEN** the system SHALL fall back to the generic idle prompt

### Requirement: Direct Telegram delivery

The system SHALL deliver idle reminders directly to the Telegram Bot API via a
`sendTelegramMessage` utility, bypassing OpenClaw. Delivery MUST require the
`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` environment variables.

#### Scenario: Successful delivery

- **WHEN** `sendTelegramMessage` is called and the Telegram API responds with a 2xx status
- **THEN** the promise SHALL resolve

#### Scenario: Missing configuration

- **WHEN** `sendTelegramMessage` is called and either `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` is unset
- **THEN** it SHALL reject with an error and no request is made to Telegram

#### Scenario: Telegram API error

- **WHEN** the Telegram API responds with a non-2xx status
- **THEN** `sendTelegramMessage` SHALL reject with an error describing the HTTP status

### Requirement: Worker resilience

The worker SHALL NOT crash when an individual check or delivery fails; errors during a
check MUST be caught and logged so the interval loop continues. A fatal startup error
MUST exit the process with a non-zero code.

#### Scenario: Check failure does not stop the loop

- **WHEN** a scheduled check throws (e.g. database or Telegram failure)
- **THEN** the error SHALL be caught and logged
- **AND** subsequent interval checks SHALL continue to run

#### Scenario: Fatal startup failure

- **WHEN** the worker fails to start
- **THEN** the process SHALL log the error and exit with a non-zero status code
