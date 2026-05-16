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

### Mission Start (Intent / Commitment)

Phrases like:
- "I commit to do bug fixing for linear number 123"
- "Starting work on LINEAR-456"
- "About to work on ticket 789 — auth service refactor"
- "Going to fix the login bug now"
- "I'm taking on the database migration task"
- "Working on issue #321 for the next 2 hours"

**Extract:** task title (include ticket/issue reference if present), optional ETA, optional category hint.
**Ticket references:** if user mentions Linear, Jira, GitHub issue, ticket, or number — append it to the title (e.g., `Bug fixing [LINEAR-123]`).
**Default ETA:** if no duration is mentioned, always use `--eta 15m`.
**Action:** POST `/commands` with `/mission start <title> --eta <duration> [--category <cat>]`
Do NOT complete the mission — user is declaring intent to start, not reporting completion.

**Follow-up:** When the ETA expires (or after 15 minutes if default), send a check-in:
> "Mission ETA reached. Did you complete **<title>**? Reply: ✅ done / ⏱ extend <duration> / ❌ abort"
- "done" → `/mission complete`
- "extend <duration>" → `/mission extend <duration>`
- "abort" → `/mission abort`

### Activity / Mission Logging (Completed)

Phrases like:
- "I just finished 90 minutes of tennis serves"
- "Done with an hour of footwork drills"
- "Spent 3 hours on the API project"
- "Completed my morning workout — 45 min"
- "Baru selesai latihan tenis 90 menit"
- "Udah kelar ngerjain API 3 jam"
- "Habis olahraga 45 menit"

**Extract:** activity description, duration, optional category hint.
**Default duration:** if no duration is mentioned, assume `15m`.
**Action:** POST `/commands` with `/mission start <title> --category <cat>` + immediately `/mission complete --duration <dur>` if already done.
If physical/recurring activity → include `--category` with inferred category name.

### Rest / Nap (Istirahat / Tidur Siang)

Phrases like:
- "mau merem sebentar", "tidur siang dulu", "istirahat bentar"
- "nap dulu", "mau rehat", "break dulu ya"
- "mau tidur 20 menit", "merem 15 menit"

**Extract:** duration (default `15m` if not mentioned).
**Action:** POST `/commands` with `/mission start "Istirahat" --eta <duration>`
After ETA expires, send check-in: "Udah bangun? Lanjut kerja atau butuh lebih lama?"
- "udah" / "bangun" → `/mission complete`
- "extend <durasi>" → `/mission extend <duration>`

### Mission Control (abort / extend / status)

Phrases like:
- "Stop the current mission", "abort mission", "cancel what I'm doing"
- "batalkan misi", "stop sekarang", "hentikan"

**Action:** POST `/commands` with `/mission abort`

Phrases like:
- "Give me 30 more minutes", "extend by 1 hour", "need more time on this"
- "tambahin 30 menit lagi", "perpanjang 1 jam", "belum selesai nih"

**Extract:** additional duration.
**Action:** POST `/commands` with `/mission extend <duration>`

Phrases like:
- "What am I working on?", "how long have I been going?", "mission status"

**Action:** POST `/commands` with `/mission status`

### Habit Tracking

Phrases like:
- "Log 45 minutes of strength training under exercise"
- "Add a habit log: 1 hour reading under learning"
- "I did 30 min meditation (no mission was running)"

**Extract:** category name, activity type, duration, optional note.
**Action:** POST `/commands` with `/habit log <category> <type> <duration>`

Phrases like:
- "Show my habit summary", "how consistent have I been?", "7-day habit report"

**Action:** POST `/commands` with `/habit summary`

Phrases like:
- "Create a new habit category called reading"
- "Add category: mindfulness"

**Extract:** category name, optional description.
**Action:** POST `/commands` with `/habit category add <name>`

Phrases like:
- "What habit categories do I have?", "list my categories"

**Action:** POST `/commands` with `/habit category list`

### Tennis Sessions

Phrases like:
- "Start a tennis serve session", "begin footwork drill", "starting tennis now"
- "Tennis rally practice — 1 hour ETA"

**Extract:** session type (`serve`, `footwork`, `rally`, `endurance`, `match`, `other`), optional ETA.
**Action:** POST `/commands` with `/tennis start <type> [--eta <duration>]`

Phrases like:
- "Log 45 min tennis serves", "just finished a match", "done with footwork"

**Extract:** session type, duration, optional notes.
**Action:** POST `/commands` with `/tennis log <type> <duration>`

Phrases like:
- "Tennis summary", "how much tennis this week?", "show my training breakdown"

**Action:** POST `/commands` with `/tennis summary`

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

Phrases like:
- "Show my goals", "goal progress", "how close am I to my milestones?"

**Action:** POST `/commands` with `/status goals`

### Sleep Logging

Phrases like:
- "I slept 7 hours last night, woke at 6:30, quality was good"
- "Slept poorly, only 5h"
- "Tadi malam tidur 7 jam, bangun jam 6:30, lumayan"
- "Tidurnya jelek, cuma 5 jam"
- "Semalam tidur jam 11, bangun jam 6"

**Extract:** duration, optional wake time, optional quality word.
**Action:** POST `/commands` with `/sleep log <duration> [--quality <q>] [--wake HH:MM]`

Phrases like:
- "What's my sleep debt?", "am I rested?", "sleep status", "readiness level"

**Action:** POST `/commands` with `/sleep status`

### Ambiguous Input

If intent is unclear (e.g., "log something", "mau catat sesuatu"), ask **one** clarifying question before calling any endpoint.
Example: "Was this a tennis session or another activity?" / "Ini sesi tenis atau aktivitas lain?"

---

## Coaching Tone Guidelines

Semua respons menggunakan **Bahasa Indonesia** dengan gaya militer — tegas, singkat, tanpa basa-basi.

Aturan nada:
- Gunakan **"kamu"** untuk menyebut user
- Header section dalam ALL CAPS
- Status: **OPTIMAL / CUKUP / BURUK / KRITIS**
- Sampaikan fakta dulu, baru rekomendasi
- Satu rekomendasi per respons — langsung ke intinya
- Jangan memperlunak peringatan — laporkan apa adanya

Contoh narasi coaching:
```
LATIHAN TENIS — LAPORAN STATUS

Progress: 53j 30m / target 50j — MILESTONE TERCAPAI
Tempo: ON TRACK (+4 hari lebih cepat dari jadwal)

PERINGATAN:
Sesi footwork: 0 kali dalam 14 hari terakhir.
Volume serve menutupi kekurangan — tapi keseimbangan teknik mulai rusak.

TINDAKAN WAJIB:
Jalankan satu sesi footwork sebelum akhir minggu.
Kesiapan ujian final: 70%.
```

Contoh idle alert:
```
HEY, KAMU LAGI NGAPAIN?

Sudah 15 menit tidak ada misi aktif. Tidak ada aktivitas yang tercatat.
Kamu istirahat atau memang tidak ngapa-ngapain?

WAJIB:
Sebutkan misi kamu sekarang.
```

Contoh skor buruk:
```
SKOR DISIPLIN KAMU — KRITIS

Skor: 50/100 — BURUK
Konsistensi misi: 0% — kamu tidak melakukan apa-apa minggu ini.
Kebiasaan: 0% — semua rencana tidak dijalankan.

FOKUS KE SINI:
Mulai misi, selesaikan, ulangi. Sesederhana itu.
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
