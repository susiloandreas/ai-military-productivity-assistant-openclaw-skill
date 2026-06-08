# IronClaw AI

Military Discipline & Performance Operating System — a standalone Node.js/TypeScript service with a built-in Telegram bot.

## What it does

- **Mission tracking** — focused work blocks with optional ETA countdown timers (BullMQ delayed jobs)
- **Unified activity logging** — every activity is a mission: *live* (`/mission start` → `complete`) or *retroactive* (`/mission log`). Both auto-advance the linked goal.
- **Goal system** — goals per category *or* per specific habit (e.g. a "running" goal), with milestones and a final-exam milestone; logging an activity auto-advances its linked goals
- **Retroactive activity logs** — `/mission log <cat> <type> <duration>` for activities where no live mission was started
- **Tennis training** — session breakdown by type (serve, footwork, rally, endurance, match)
- **Sleep tracking** — duration, quality, 7-day debt, and readiness rating
- **Daily briefing** — `/status briefing` aggregates all data into a single military-style report
- **Telegram bot** — inbound chat is handled in-process by the `telegram-listener` worker: a rule-based parser turns free-text messages into mission commands (no external agent required)

## Architecture

```
Telegram ⇄ telegram-listener worker (long-poll getUpdates)
               ↓ rule-based parse → MissionService
       ironclaw-ai service (Express :3000)
               ↓
          PostgreSQL (17 tables)
               ↓ ETA expiry / idle-reminder jobs
          Redis + BullMQ
```

The service talks to Telegram directly: the `telegram-listener` worker polls for inbound
messages and the worker processes (idle-reminder, eta-worker) post outbound replies via
the Telegram Bot API. Requires `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL and REDIS_URL
```

### 3. Run migrations

```bash
npm run migrate
```

Creates 17 tables and inserts the default user (`00000000-0000-0000-0000-000000000001`).

### 4. Start the service

```bash
# Development (ts-node)
npm run dev

# Production
npm run build && npm start
```

### 5. Start workers (separate processes)

```bash
# ETA expiry worker
npx ts-node src/schedulers/EtaExpiryWorker.ts

# Idle reminder — every 15 min when no active mission. If a scheduled habit
# (see /habit schedule) is due or already missed today, it sends a loss-aversion
# nudge naming that habit instead of the generic prompt.
npm run dev:idle-reminder

# Telegram listener — long-polls inbound messages and registers missions from
# free-text chat via the rule-based parser (src/nlp/missionParser.ts).
npx ts-node src/schedulers/TelegramListenerWorker.ts
```

### 6. Health check

```bash
curl http://localhost:3000/health
```

## Command Reference

### POST /commands

Body: `{ "command": "/mission start <title> [--eta 2h] [--category exercise]" }`

| Slash Command | Action |
|---|---|
| `/mission start <title>` | Start a new mission |
| `/mission complete` | Complete and auto-log goal progress |
| `/mission log <cat> <type> <duration>` | Retroactive activity log (auto-advances linked goals) |
| `/mission abort` | Mark mission as failed |
| `/mission extend <duration>` | Add time to ETA |
| `/mission status` | Show active mission |
| `/habit category add <name>` | Create a habit category |
| `/habit goal set <cat> <type> <target>` | Give a habit its own goal (e.g. `50h`) |
| `/habit schedule add <cat> <type> <time> <days>` | Schedule a habit (e.g. `06:00 mon,wed,fri`) |
| `/habit schedule list` | List active habit schedules |
| `/habit summary` | 7-day habit totals |
| `/tennis start <type>` | Start a tennis mission |
| `/tennis log <type> <duration>` | Log a tennis session |
| `/tennis summary` | Weekly tennis breakdown |
| `/sleep log <duration> [--quality good]` | Log sleep |
| `/sleep status` | Sleep debt + readiness |
| `/status briefing` | Full daily briefing |
| `/status goals` | All active goal progress |

### GET /health

Returns `{ "status": "ok", "service": "ironclaw-ai", "timestamp": "..." }`

## Telegram

Inbound chat is handled entirely in-process — no external agent or skill to install.
Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`, then run the `telegram-listener` worker
(see step 5). It long-polls the Bot API and registers missions from free-text messages via
the deterministic parser in `src/nlp/missionParser.ts`.

## Project Structure

```
src/
  db/
    connection.ts         # pg.Pool + ioredis singletons
    migrations/           # 21 SQL migration files
  repositories/           # DB access layer (one class per domain)
  services/               # Business logic layer
  commands/               # Slash command parsers
  schedulers/             # BullMQ workers + Telegram listener
  nlp/                    # rule-based mission message parser
  utils/                  # duration, formatter, telegram client
  types/                  # TypeScript interfaces
  server.ts               # Express entry point
```

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string (default: `redis://localhost:6379`) |
| `IRONCLAW_SERVICE_URL` | Public URL for OpenClaw automations |
| `PORT` | HTTP port (default: `3000`) |
| `NODE_ENV` | `production` for Railway |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from [@BotFather](https://t.me/botfather) |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID — get it from [@userinfobot](https://t.me/userinfobot) |
| `TZ` | Timezone for habit schedule windows (e.g. `Asia/Jakarta`). The idle worker evaluates "morning 06:00" in this zone |

## Deployment to Railway

### Prerequisites

- [Railway account](https://railway.app)
- PostgreSQL + Redis provisioned in Railway
- GitHub repo connected to Railway

### Steps

1. **Connect repository** — Link this GitHub repo to your Railway project

2. **Create services**
   - PostgreSQL plugin (copy connection string to `DATABASE_URL`)
   - Redis plugin (copy connection string to `REDIS_URL`)

3. **Set environment variables** in Railway project settings:
   ```
   NODE_ENV=production
   IRONCLAW_SERVICE_URL=https://<your-railway-domain>.up.railway.app
   PORT=3000
   TELEGRAM_BOT_TOKEN=<your-bot-token>
   TELEGRAM_CHAT_ID=<your-chat-id>
   ```

4. **Deploy** — Push to `main` branch or manually trigger from Railway dashboard
   - Procfile runs migrations automatically
   - Builds TypeScript
   - Starts service

5. **Verify**
   ```bash
   curl https://<your-railway-domain>.up.railway.app/health
   ```

6. **Configure OpenClaw** — Update `IRONCLAW_SERVICE_URL` in OpenClaw to point to Railway URL

### Health Check & Automations

Once deployed, OpenClaw automations can call:

- `GET /notifications/briefing` — Morning briefing (schedule: 0 6 * * *)
- `GET /notifications/debrief` — Evening debrief (schedule: 0 22 * * *)
- `GET /notifications/discipline-check` — Critical discipline alerts (schedule: every 15 min)
- `GET /coaching/insights?category=<name>` — On-demand coaching

## Phase 2: Complete

- Discipline scoring engine (9 sub-scores, 0–100)
- Daily debrief with ETA accuracy analysis
- GET /coaching/insights endpoint for NL coaching via OpenClaw
- Proactive notifications (discipline-check every 15 min, morning briefing, evening debrief)
- Tennis technique balance analyzer
