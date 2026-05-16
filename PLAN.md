# Plan: ironclaw-ai — Military Discipline & Performance Operating System

## TL;DR

Standalone TypeScript/Node.js Express service + OpenClaw `skills/ironclaw-ai/SKILL.md`. The skill teaches OpenClaw's agent to dispatch commands to the service via HTTP. PostgreSQL for data, Redis + BullMQ for ETA expiry state. **All Telegram delivery goes through OpenClaw's existing connection** via scheduled automations defined in SKILL.md — the service never touches Telegram directly.

**Core domain rule:** Mission and Habit are unified. A mission can be tagged with a habit category. Completing a mission with a category automatically advances that category's goal — no double-logging. `/habit log` exists only for retroactive entries (no mission was started). Every category owns one active goal with milestones, the last being the final exam.

---

## Architecture

```
User → Telegram → OpenClaw agent
                      ↓ (POST /commands)
              ironclaw-ai service (Express)
                      ↓
                 PostgreSQL
                      ↓ (ETA expiry)
               Redis + BullMQ

OpenClaw automation (*/15 min) → GET /notifications/discipline-check → Telegram
OpenClaw automation (6 AM)     → GET /notifications/briefing         → Telegram
OpenClaw automation (10 PM)    → GET /notifications/debrief          → Telegram
```

---

## Unified Mission + Activity Domain Model

### The merge rule

| Before (separate) | After (unified) |
|---|---|
| `/mission start Tennis Practice --eta=90m` then `/habit log tennis 90m` | `/mission start Tennis Practice --category=exercise --eta=90m` then `/mission complete` → goal auto-advanced |
| Two log entries, double work | One action, one record |

A **mission** is always the primary unit of tracked work. The optional `--category` flag links it to a habit category and its goal. On `/mission complete`, the service checks for a category and auto-creates a `goal_progress_log`. `/habit log` still exists for quick retroactive entries when no mission was started.

### Data model

```
missions
────────────────────────────────
id
userId
title: "Tennis Practice"
habit_category_id (FK, nullable) ← NEW — links to category
eta_minutes (nullable)
status: active|completed|paused|failed|eta_expired
started_at
completed_at
paused_at
actual_duration_minutes          ← computed on complete

        ↓ on complete, if habit_category_id is set

goal_progress_logs
────────────────────────────────
id
goal_id (FK)
source_mission_id (FK, nullable) ← from /mission complete
source_habit_log_id (FK, nullable) ← from /habit log (retroactive)
value_delta: 90
unit: "minutes"
logged_at

habit_categories           goals                    milestones
─────────────────          ──────────────────────   ──────────────────────────
id                         id                       id
userId                     userId                   goal_id (FK)
name: "exercise"     ───▶  habit_category_id (FK)   title: "Complete 50h practice"
description                title: "Reach Tennis     target_value: 50
created_at                   Intermediate"          unit: "hours"
                           target_description       is_final_exam: false
                           deadline                 achieved_at (null until done)
                           status                   created_at
                           created_at

habit_types                          habit_logs (retroactive only)
─────────────────                    ─────────────────────────────
id                                   id
habit_category_id (FK)               habit_type_id (FK)
name: "tennis"                       userId
unit: "minutes"                      duration_minutes
created_at                           logged_at
                                     note
```

### Two flows, one goal

**Flow A — Mission with category (primary path):**
```
/mission start "Tennis Practice" --category=exercise --eta=90m
  → creates mission row with habit_category_id = exercise
  → registers ETA BullMQ job

/mission complete
  → computes actual_duration_minutes
  → finds active goal for "exercise" category
  → creates goal_progress_log (source_mission_id)
  → checks milestones → returns unlock message if reached
  → if final_exam milestone reached → goal status = achieved
```

**Flow B — Retroactive habit log (fallback path):**
```
/habit log tennis 90m
  → finds "tennis" habit_type → gets habit_category_id
  → creates habit_log row
  → creates goal_progress_log (source_habit_log_id)
  → checks milestones
```

**Example goal setup (unchanged):**
```
/habit category create exercise
/goal set "Reach Tennis Intermediate" --category=exercise --deadline=2026-12-31
/goal milestone add "Complete 50h practice" --target=50 --unit=hours
/goal milestone add "Win a set vs intermediate player" --final-exam
```

---

## Folder Structure

```
ironclaw-ai/
├── src/
│   ├── commands/
│   │   ├── missionCommands.ts     # /mission start|complete|pause|resume|extend|status
│   │   ├── habitCommands.ts       # /habit log (retroactive), /habit category, /goal *
│   │   ├── tennisCommands.ts      # /tennis practice (wraps missionCommands with --category=exercise)
│   │   ├── sleepCommands.ts
│   │   └── statusCommands.ts
│   ├── services/
│   │   ├── MissionService.ts      # on complete: calls GoalService.logProgress if category set
│   │   ├── HabitService.ts        # retroactive log only; calls GoalService.logProgress
│   │   ├── GoalService.ts         # shared progress engine used by both Mission + Habit
│   │   ├── TennisService.ts       # thin wrapper: calls MissionService with --category=exercise
│   │   ├── SleepService.ts
│   │   ├── DisciplineScoreService.ts
│   │   ├── CoachingEngine.ts
│   │   ├── BriefingService.ts
│   │   └── DebriefService.ts
│   ├── repositories/
│   │   ├── MissionRepository.ts   # missions table now has habit_category_id column
│   │   ├── HabitRepository.ts     # habit_categories + habit_types + habit_logs
│   │   ├── GoalRepository.ts      # goals, milestones, goal_progress_logs
│   │   ├── TennisRepository.ts
│   │   ├── SleepRepository.ts
│   │   └── DisciplineRepository.ts
│   ├── schedulers/
│   │   └── EtaExpiryWorker.ts
│   ├── analytics/
│   │   ├── EstimationAnalyzer.ts
│   │   ├── TennisAnalyzer.ts
│   │   └── PerformanceAnalyzer.ts
│   ├── db/
│   │   ├── connection.ts
│   │   └── migrations/
│   │       ├── 001_create_users.sql
│   │       ├── 002_create_habit_categories.sql
│   │       ├── 003_create_goals.sql
│   │       ├── 004_create_milestones.sql
│   │       ├── 005_create_habit_types.sql
│   │       ├── 006_create_missions.sql            ← has habit_category_id FK
│   │       ├── 007_create_mission_sessions.sql
│   │       ├── 008_create_habit_logs.sql          ← retroactive only
│   │       ├── 009_create_goal_progress_logs.sql  ← source: mission OR habit_log
│   │       ├── 010_create_tennis_training_logs.sql
│   │       ├── 011_create_sleep_logs.sql
│   │       ├── 012_create_discipline_scores.sql
│   │       ├── 013_create_coaching_feedback.sql
│   │       ├── 014_create_reminders.sql
│   │       ├── 015_create_daily_reports.sql
│   │       ├── 016_create_weekly_reports.sql
│   │       └── 017_create_performance_metrics.sql
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   ├── formatter.ts
│   │   ├── duration.ts
│   │   └── migrate.ts
│   └── server.ts
├── skills/
│   └── ironclaw-ai/
│       └── SKILL.md
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

---

## Build Strategy: 3 Phases

### PHASE 1 — Working Core Tracker
> Goal: fully functional via Telegram on day one. No analytics, no scoring. Just solid data + commands.

**Step 1 — Foundation**
- `package.json` + `tsconfig.json` (Express, pg, ioredis, bullmq, dotenv)
- `.env.example`
- `src/db/connection.ts` — pg.Pool singleton
- `src/utils/migrate.ts` — migration runner
- All 17 SQL migration files (full schema including goal tables)
- `src/types/index.ts` — all TypeScript interfaces
- `src/utils/formatter.ts` — military-tone response builder
- `src/utils/duration.ts` — duration string parser

**Step 2 — Repository Layer** *(all parallel)*
- `MissionRepository` — CRUD + getActiveMission
- `HabitRepository` — habit_categories + habit_types + habit_logs CRUD
- `GoalRepository` — goals + milestones + goal_progress_logs CRUD
- `TennisRepository` — training log CRUD + weekly aggregate
- `SleepRepository` — sleep log CRUD + debt query
- `DisciplineRepository` — score history (writes; reads deferred to Phase 2)

**Step 3 — Service Layer**
- `GoalService` — create category, set goal, add milestone (incl. final exam), logProgress(goalId, value, unit, sourceId), check milestone unlock, mark goal achieved
- `MissionService` — start/complete/pause/resume/extend + EtaExpiryWorker registration; on complete calls `GoalService.logProgress` if `habit_category_id` is set
- `HabitService` — retroactive log only; calls `GoalService.logProgress` after creating habit_log row
- `TennisService` — thin wrapper: calls `MissionService.start` with `habit_category_id = exercise` and type tag stored in title/note
- `SleepService` — log + debt + readiness state
- `BriefingService` (Phase 1 version) — sleep summary + active mission + goal progress per category (no score yet)

**Step 4 — Command Handlers & Server**
- `missionCommands` — /mission start \<title\> [--category=\<cat\>] [--eta=\<dur\>] | complete | pause | resume | extend | status
- `habitCommands` — /habit category create, /habit log (retroactive), /habit status, /goal set, /goal milestone add, /goal status, /goal list
- `tennisCommands` — /tennis practice \<type\> \<duration\> (calls MissionService with --category=exercise)
- `sleepCommands` — /sleep \<duration\>, /sleep status
- `statusCommands` — /status (overview), /briefing
- `src/server.ts` — POST /commands, GET /health
- `EtaExpiryWorker` — BullMQ delayed job for ETA expiry
- `skills/ironclaw-ai/SKILL.md` — all Phase 1 commands, no automations yet
- `README.md`

**Phase 1 deliverable — all these commands work:**
```
# Pure work mission (no goal tracking)
/mission start "Build POS API" --eta=3h
/mission complete
/mission status

# Mission that tracks goal progress on complete
/mission start "Tennis Practice" --category=exercise --eta=90m
/mission complete   ← exercise goal auto-advances +90m. milestone check fires.

# Tennis shorthand (same as above, category pre-filled)
/tennis practice serve 60m
/tennis practice footwork 45m

# Goal setup
/habit category create exercise
/goal set "Reach Tennis Intermediate" --category=exercise --deadline=2026-12-31
/goal milestone add "Complete 50h practice" --target=50 --unit=hours
/goal milestone add "Win a set vs intermediate player" --final-exam
/goal status exercise
/goal list

# Retroactive log (no mission was started)
/habit log tennis 90m   ← fallback only; still advances goal

/sleep 8h
/sleep status

/status     ← active mission + goal progress per category + sleep state
/briefing   ← sleep summary + mission + goal progress (no score yet)
```

---

### PHASE 2 — Intelligence Layer
> Goal: add the "AI" — scoring, analysis, coaching, proactive notifications via OpenClaw.

- `EstimationAnalyzer` — actual vs estimated per mission category
- `TennisAnalyzer` — weekly volume, trend, gap detection
- `PerformanceAnalyzer` — burnout risk, consistency patterns
- `DisciplineScoreService` — weighted 0–100 across 9 sub-scores (adds `goal_adherence` 10%, reduces others slightly)
- `CoachingEngine` — rule-based: estimation bias, tennis volume, sleep debt, goal pace warnings
- `DebriefService` — nightly debrief: missions, habits, goal progress, coaching insight
- Full `BriefingService` — adds discipline score + coaching warnings to morning block
- Notification endpoints:
  - `GET /notifications/discipline-check` → situational message (active mission + sleep + burnout + expired ETA)
  - `GET /notifications/briefing` → full morning briefing
  - `GET /notifications/debrief` → full evening debrief
- OpenClaw automations added to SKILL.md (15-min, 6 AM, 10 PM)
- `/score` command
- `/debrief` command
- `GET /coaching/insights?category=<cat>` — structured coaching data for agent-driven conversations
- **SKILL.md NL layer** — natural language intent mapping + conversational coaching instructions

**Phase 2 discipline score formula:**

| Sub-score | Weight |
|-----------|--------|
| mission_consistency | 15% |
| sleep_consistency | 15% |
| focus_duration | 10% |
| estimation_accuracy | 15% |
| completion_rate | 15% |
| wake_consistency | 10% |
| habit_adherence | 10% |
| goal_adherence | 10% |  ← NEW: % of goal milestones on pace
| distraction_frequency | 5% |

**CoachingEngine rules (Phase 2):**
- Estimation accuracy < 70% for a category → "underestimating [category] by X%"
- Tennis weekly volume < 5h for 2+ weeks → "insufficient training volume for goal pace"
- Goal progress rate < expected pace → "goal [title] is behind schedule by X days"
- Sleep debt > 2h → soften all reminders
- Burnout risk HIGH → discipline-check returns null (suppress 15-min messages)
- Final exam milestone not set → "No final exam defined for goal [title]. Add one."

---

### PHASE 3 — Extended Goal System
> Goal: richer goal management, sub-goals, cross-goal dependencies, calendar sync (future).

- Sub-goals (goals that feed into a parent goal)
- Goal templates (e.g., "tennis beginner → intermediate → advanced" preset)
- Weekly goal review command: `/goal review`
- Goal history + achievement log
- `/goal progress +2km` manual override (for non-habit goals like "run 10km race")
- Cross-category goals (a goal that requires progress in multiple categories)
- Calendar deadline sync (future)
- Voice/mobile interface (future)

---

## HTTP API Reference

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/commands` | Main command dispatcher |
| GET | `/health` | Service health check |
| GET | `/notifications/discipline-check` | 15-min automation endpoint (Phase 2) |
| GET | `/notifications/briefing` | 6 AM automation endpoint (Phase 2) |
| GET | `/notifications/debrief` | 10 PM automation endpoint (Phase 2) |
| GET | `/coaching/insights` | Agent coaching conversation data (Phase 2) |

**Command request format:**
```json
{ "command": "/habit log tennis 90m", "userId": "default" }
```

**`GET /coaching/insights?category=exercise` response format:**
```json
{
  "category": "exercise",
  "goal": {
    "title": "Reach Tennis Intermediate",
    "deadline": "2026-12-31",
    "status": "active",
    "progress_value": 3210,
    "progress_unit": "minutes",
    "target_value": 3000,
    "pace": "on_track",
    "days_ahead_behind": 4
  },
  "next_milestone": {
    "title": "Complete 50h practice",
    "remaining_value": 790,
    "remaining_unit": "minutes",
    "estimated_completion": "2026-06-03"
  },
  "final_exam": {
    "title": "Win a set vs intermediate player",
    "achieved": false
  },
  "coaching_flags": [
    "Footwork sessions missing last 2 weeks",
    "Weekly volume below target (2h 20m vs 5h)"
  ],
  "recent_sessions": [
    { "date": "2026-05-15", "type": "serve", "duration_minutes": 60 }
  ]
}
```
The agent receives this JSON and narrates it conversationally in military tone. No hardcoded coaching text in the service — the service provides facts, the agent provides voice.

---

## OpenClaw SKILL.md Design

### Two layers in SKILL.md

**Layer 1 — Structured commands (Phase 1)**
Maps exact slash commands to `POST /commands` calls. The agent passes the command string through verbatim.

**Layer 2 — Natural language interpretation (Phase 2)**
Instructs the agent to understand free-form input and translate it to the right command or API call before responding.

### Natural language → command mapping instructions (in SKILL.md)

```markdown
## Natural Language Interpretation

When the user writes in natural language instead of a slash command,
extract the intent and call the appropriate endpoint.

### Activity logging
Examples that map to /mission start + /mission complete:
- "I just finished 90 minutes of tennis serves"
- "Done with an hour of footwork training"
- "Spent 3 hours on the POS API today"

Extract: activity type, duration, optional category
If activity is physical/recurring → add --category
Call: POST /commands with the inferred command

### Coaching conversation
Examples that map to GET /coaching/insights:
- "How am I doing with my tennis goal?"
- "Am I on track for intermediate level?"
- "What's my weakest area this week?"
- "Give me a performance review"

Call: GET /coaching/insights?category=<inferred_category>
Narrate the response in military tone. Lead with the most urgent flag.
Do not invent numbers — only use what the endpoint returns.

### Status queries
Examples that map to GET /commands /status or /score:
- "What's my discipline score?"
- "Show me my current mission"
- "What goals do I have active?"

### Ambiguous input
If intent is unclear, ask one clarifying question before calling any endpoint.
Example: "Confirmed — was this a serve session or footwork?"
```

### Conversational coaching flow example

```
User:  "Am I on track for tennis intermediate?"

Agent: calls GET /coaching/insights?category=exercise
       receives: pace=on_track, days_ahead=4, coaching_flags=["Footwork missing 2 weeks"]

Agent responds:
"EXERCISE GOAL — STATUS REPORT

Progress: 53h 30m / 50h target — MILESTONE ACHIEVED
Goal pace: ON TRACK (+4 days ahead)

Warning:
Footwork sessions absent for 14 days.
Serve volume compensating — but technique balance is degrading.

Recommendation:
Deploy one footwork session before end of week.
Final exam readiness: 70%."
```

---

## OpenClaw Automation Definitions (added in SKILL.md in Phase 2)

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

---

## Environment Variables

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/ironclaw
REDIS_URL=redis://localhost:6379
IRONCLAW_SERVICE_URL=http://localhost:3000
PORT=3000
NODE_ENV=production
```

---

## Verification Steps

### Phase 1
1. `npm run migrate` — confirm 17 tables created
2. `npm run dev` — `GET /health` returns `{ "status": "operational" }`
3. Create exercise category + goal + milestones → `GET /status` shows goal block
4. `/habit log tennis 90m` → goal progress advances, milestone check fires
5. `/habit log tennis 90m` 34 times total → "Complete 50h practice" milestone unlocked
6. `/goal status exercise` — shows progress bar, next milestone, final exam status
7. `/mission start Build POS API --eta=3h` + wait 3 min → ETA alert returned on next discipline-check
8. `openclaw skills install ./skills` → `/mission start Test` via Telegram works

### Phase 2
9. `/score` — returns 0–100 discipline score with sub-score breakdown
10. `GET /notifications/discipline-check` — returns situational message or null
11. OpenClaw automation fires → message arrives in Telegram at correct schedule
12. Goal behind schedule → CoachingEngine returns pace warning in `/briefing`
13. Natural language: "I just did 90 minutes of tennis" → agent calls `/commands` with inferred command → goal advances
14. Coaching conversation: "Am I on track for tennis?" → agent calls `GET /coaching/insights` → narrates result in military tone

---

## Decisions & Scope

- **Mission and Habit are unified** — `/mission complete` is the primary way goal progress is recorded; `/habit log` is the retroactive fallback
- **`habit_category_id` on missions is optional** — pure work missions (code, writing) have no category; activity missions (tennis, gym, reading) have one
- **`TennisService` is a thin wrapper** — `/tennis practice serve 60m` internally calls `MissionService.start` with `habit_category_id = exercise`; the type tag (serve/footwork/rally) is stored in the mission title
- **Every category has exactly one active goal** — enforced at service layer
- **Final exam milestone** — when achieved, goal status → `achieved`; coaching engine stops pace warnings for that goal
- **`goal_progress_logs` has two nullable source FKs** — `source_mission_id` (from complete) and `source_habit_log_id` (from retroactive log); exactly one is populated per row
- **Single user (`userId = "default"`)** in v1; column reserved for future multi-user
- **No direct Telegram from service** — all delivery through OpenClaw automations
- **Natural language handled by OpenClaw's LLM** — the service returns structured JSON facts; the agent narrates them. No NLU code in the service itself.
- **`GET /coaching/insights`** returns data only — no opinionated text. The agent applies military tone and coaching voice.
- **Rule-based coaching only** — LLM integration for deeper analysis left as documented stub comment
- **ETA expiry via BullMQ delayed job** — fires once at `startTime + etaMs`, marks DB state
- **Burnout suppression** — when `PerformanceAnalyzer` returns `HIGH`, `/discipline-check` returns `null`
- `sdd.md` is the authoritative spec — do NOT modify it
