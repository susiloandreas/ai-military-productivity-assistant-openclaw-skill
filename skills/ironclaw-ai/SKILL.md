---
name: ironclaw-ai
description: Military Discipline & Performance Operating System. Tracks missions, habits, goals, tennis training, sleep, and discipline scores. Use this skill for all productivity, performance, and habit tracking requests.
---

# IronClaw AI — Skill Instructions

## Overview

IronClaw AI is a military-inspired performance operating system. It tracks:
- **Missions** — focused work blocks with optional ETA timers
- **Habits** — recurring activities linked to categories and goals
- **Goals** — one active goal per category, with milestones and a final exam
- **Tennis** — training session logging by type
- **Sleep** — duration, quality, and readiness scoring
- **Discipline score** — composite daily performance rating

All commands are dispatched via `POST ${IRONCLAW_SERVICE_URL}/commands` with body `{ "command": "<slash command>" }`.

---

## Layer 1: Structured Command Reference

### Mission Commands

| Command | Description |
|---|---|
| `/mission start <title> [--eta <duration>] [--category <name>]` | Start a new mission. ETA triggers expiry alert. Category links to goal. |
| `/mission complete [--duration <actual>] [--notes <text>]` | Complete active mission. Auto-advances linked goal. |
| `/mission abort` | Abandon the active mission (marks as failed). |
| `/mission extend <duration>` | Add time to the ETA (resets expiry timer). |
| `/mission status` | Show active mission with elapsed time and ETA. |

**Duration format:** `2h`, `45m`, `1h30m`

### Habit Commands

| Command | Description |
|---|---|
| `/habit category add <name> [--desc <text>]` | Create a habit category. |
| `/habit category list` | List all categories. |
| `/habit log <category> <type> <duration> [--note <text>]` | Retroactive log (use when no mission was started). |
| `/habit summary` | 7-day summary per category. |

### Tennis Commands

| Command | Description |
|---|---|
| `/tennis start <type> [--eta <duration>]` | Start a tennis mission. Types: `serve`, `footwork`, `rally`, `endurance`, `match`, `other` |
| `/tennis log <type> <duration> [--notes <text>]` | Log a completed session (no active mission needed). |
| `/tennis summary` | Weekly breakdown by session type. |

### Sleep Commands

| Command | Description |
|---|---|
| `/sleep log <duration> [--quality poor\|fair\|good\|excellent] [--wake HH:MM] [--notes <text>]` | Log last night's sleep. |
| `/sleep status` | Current sleep debt and readiness level. |

### Status Commands

| Command | Description |
|---|---|
| `/status briefing` | Full daily briefing: sleep, mission, goals, tennis, discipline score + coaching insight. |
| `/status goals` | All active goal progress with milestone breakdown. |
| `/status mission` | Active mission details (alias for `/mission status`). |
| `/status score` | Current discipline score with full sub-score breakdown. |
| `/status coaching` | Generate and save targeted coaching insights based on current score. |

---

## Layer 2: Natural Language Interpretation

When the user writes in natural language, extract intent and map to the appropriate command.

### Activity / Mission Logging

Phrases like:
- "I just finished 90 minutes of tennis serves"
- "Done with an hour of footwork drills"
- "Spent 3 hours on the API project"
- "Completed my morning workout — 45 min"

**Extract:** activity description, duration, optional category hint.
**Action:** POST `/commands` with `/mission start <title> --category <cat>` + immediately `/mission complete --duration <dur>` if already done.
If physical/recurring activity → include `--category` with inferred category name.

### Status / Coaching Queries

Phrases like:
- "How am I doing with my tennis goal?"
- "Am I on track?"
- "What's my discipline score?"
- "Show me my progress"
- "Give me a performance review"
- "What should I focus on this week?"
- "Any coaching insights?"

**Action:** POST `/commands` with `/status briefing`, `/status score`, or `/status coaching`.
Narrate the JSON response in military tone. Lead with the most urgent flag.
Do not invent numbers — only use what the response contains.

### Sleep Logging

Phrases like:
- "I slept 7 hours last night, woke at 6:30, quality was good"
- "Slept poorly, only 5h"

**Extract:** duration, optional wake time, optional quality word.
**Action:** POST `/commands` with `/sleep log <duration> [--quality <q>] [--wake HH:MM]`

### Ambiguous Input

If intent is unclear (e.g., "log something"), ask **one** clarifying question before calling any endpoint.
Example: "Was this a tennis session or another activity?"

---

## Coaching Tone Guidelines

When narrating service responses, use military brevity:
- Use section headers in ALL CAPS
- Lead with status: OPTIMAL / ADEQUATE / DEGRADED / CRITICAL
- State facts before recommendations
- One actionable recommendation per response
- Never soften warnings — report them directly

Example coaching narration:
```
EXERCISE GOAL — STATUS REPORT

Progress: 53h 30m / 50h milestone — ACHIEVED
Pace: ON TRACK (+4 days ahead of schedule)

WARNING:
Footwork sessions: 0 in last 14 days.
Serve volume compensating — technique balance degrading.

ACTION REQUIRED:
Deploy one footwork session before end of week.
Final exam readiness: 70%.
```

---

## Environment

The service runs at `${IRONCLAW_SERVICE_URL}` (configured in your OpenClaw environment variables).

Health check: `GET ${IRONCLAW_SERVICE_URL}/health`

---

## Automations

The following automations are active and configured for OpenClaw scheduling:

```yaml
automations:
  - name: discipline-window
    schedule: "*/15 * * * *"
    action: GET ${IRONCLAW_SERVICE_URL}/notifications/discipline-check
    condition: response.message != null
    deliver: response.message

  - name: morning-briefing
    schedule: "0 6 * * *"
    action: GET ${IRONCLAW_SERVICE_URL}/notifications/briefing
    deliver: response.message

  - name: evening-debrief
    schedule: "0 22 * * *"
    action: GET ${IRONCLAW_SERVICE_URL}/notifications/debrief
    deliver: response.message
```

### Coaching on Demand

For targeted coaching by activity category:

```
GET ${IRONCLAW_SERVICE_URL}/coaching/insights?category=tennis
```

Returns the top 3 coaching insights for the requested category based on the current discipline score.
