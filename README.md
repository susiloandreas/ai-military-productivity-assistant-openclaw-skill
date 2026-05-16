# IronClaw AI

Military Discipline & Performance Operating System — OpenClaw skill + standalone Node.js/TypeScript service.

## What it does

- **Mission tracking** — focused work blocks with optional ETA countdown timers (BullMQ delayed jobs)
- **Unified activity logging** — missions tagged with a habit category auto-advance the linked goal on completion
- **Goal system** — one active goal per category, with milestones and a final-exam milestone
- **Retroactive habit logs** — `/habit log` for activities where no mission was started
- **Tennis training** — session breakdown by type (serve, footwork, rally, endurance, match)
- **Sleep tracking** — duration, quality, 7-day debt, and readiness rating
- **Daily briefing** — `/status briefing` aggregates all data into a single military-style report
- **OpenClaw skill** — natural language understanding layer + structured command routing

## Architecture

```
Telegram → OpenClaw agent
               ↓ POST /commands
       ironclaw-ai service (Express :3000)
               ↓
          PostgreSQL (17 tables)
               ↓ ETA expiry jobs
          Redis + BullMQ
```

All Telegram delivery goes through OpenClaw's existing connection. The service never touches Telegram directly.

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

### 5. Start the ETA worker (separate process)

```bash
npx ts-node src/schedulers/EtaExpiryWorker.ts
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
| `/mission abort` | Mark mission as failed |
| `/mission extend <duration>` | Add time to ETA |
| `/mission status` | Show active mission |
| `/habit category add <name>` | Create a habit category |
| `/habit log <cat> <type> <duration>` | Retroactive habit log |
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

## OpenClaw Skill

Install the skill by copying `skills/ironclaw-ai/SKILL.md` into your OpenClaw skills directory. Configure `IRONCLAW_SERVICE_URL` in your OpenClaw environment.

## Project Structure

```
src/
  db/
    connection.ts         # pg.Pool + ioredis singletons
    migrations/           # 17 SQL migration files
  repositories/           # DB access layer (one class per domain)
  services/               # Business logic layer
  commands/               # Slash command parsers
  schedulers/             # BullMQ workers
  utils/                  # duration, formatter
  types/                  # TypeScript interfaces
  server.ts               # Express entry point
skills/
  ironclaw-ai/
    SKILL.md              # OpenClaw skill definition
```

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string (default: `redis://localhost:6379`) |
| `IRONCLAW_SERVICE_URL` | Public URL for OpenClaw automations |
| `PORT` | HTTP port (default: `3000`) |
| `NODE_ENV` | `production` for Railway |

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
