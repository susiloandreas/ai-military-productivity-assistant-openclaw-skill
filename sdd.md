# PROJECT: AI Military Productivity Assistant for OpenClaw

Create a production-ready OpenClaw skill named:

"ironclaw-ai"

Theme:
Military-inspired AI Productivity & Discipline Assistant.

The assistant acts like:
- disciplined operations officer
- performance analyst
- accountability coach
- tactical productivity assistant

The tone must be:
- direct
- concise
- structured
- disciplined
- accountability-driven
- performance-oriented

Avoid:
- toxic language
- insults
- childish gamification
- excessive positivity
- fake motivational quotes

The assistant should feel like:
- elite operator assistant
- mission command system
- tactical performance AI

==================================================
CORE PRODUCT CONCEPT
==================================================

This is NOT a simple todo app.

This is an:
"AI Discipline & Performance Operating System"

The system tracks:
- missions/tasks
- habits
- sleep
- focus sessions
- tennis progression
- productivity consistency
- estimation accuracy
- discipline score
- recovery/readiness state

The assistant provides:
- intelligent reminders
- accountability
- habit analysis
- coaching feedback
- performance insights
- daily briefings
- mission debriefs

==================================================
TECH STACK
==================================================

Use:
- TypeScript
- Node.js
- PostgreSQL
- Redis
- BullMQ
- OpenClaw skill architecture

Architecture:
- clean architecture
- repository pattern
- service layer
- dependency injection
- modular structure
- production-ready code
- scalable folder organization

==================================================
FEATURES
==================================================

# 1. Mission Tracking System

Users can:

- start mission without estimation
- start mission with estimation
- complete mission
- extend mission
- pause mission
- resume mission

Commands:

/mission start <title>
/mission start <title> --eta=2h
/mission complete
/mission pause
/mission resume
/mission extend 30m
/mission status

Example:

/mission start Build POS API --eta=3h

==================================================
# 2. Estimation Intelligence
==================================================

When estimation expires:

The AI should:
- send reminder
- ask whether to extend
- ask what has been completed
- ask why estimation exceeded

Example response:

"Mission time exceeded.

Current operation:
Build POS API

Estimated:
2h

Status request:
- extend mission?
- summarize completed objectives
- identify blockers"

Store:
- actual duration
- estimation accuracy
- completion notes
- blockers

==================================================
# 3. 15-Minute Discipline Window
==================================================

Every 15 minutes:

Check:
- whether user has active mission
- whether user is idle
- whether current time matches planned productivity window

If no mission active:

Send contextual reminder.

Examples:

"You are currently outside active mission state."

"No active operation detected in the last 15 minutes."

"Focus window active. Awaiting mission deployment."

Reminder tone must adapt based on:
- sleep quality
- recent consistency
- burnout risk
- previous day performance

==================================================
# 4. Discipline Score System
==================================================

Calculate:
- mission consistency
- wake consistency
- sleep consistency
- focus duration
- estimation accuracy
- mission completion rate
- habit adherence
- distraction frequency

Generate:

Discipline Score:
0–100

Example:

Discipline Score: 78

Analysis:
- Focus consistency improving
- Estimation accuracy weak
- Sleep recovery stable

==================================================
# 5. Habit Tracking System
==================================================

Users can track habits such as:
- tennis
- gym
- reading
- coding
- meditation
- sleep
- deep work

Commands:

/habit log tennis 90m
/habit log reading 30m
/habit status
/habit report

==================================================
# 6. Tennis Progress Intelligence
==================================================

The system must deeply analyze tennis progression.

Track:
- weekly duration
- frequency
- consistency
- training types
- recovery
- progression trend

Example commands:

/tennis practice serve 60m
/tennis practice footwork 45m
/tennis practice rally 90m

Track:
- serve practice
- footwork
- rally consistency
- endurance sessions

The AI should analyze whether training volume is sufficient.

Example:

"Tennis Progress Report

Current weekly volume:
2h 20m

Recommended intermediate progression volume:
5h/week

Current progression state:
INSUFFICIENT

Weakest consistency:
Thursday–Saturday

Recommendation:
Add one additional footwork-focused session."

==================================================
# 7. Sleep & Recovery Intelligence
==================================================

Track:
- sleep duration
- wake time
- sleep consistency
- recovery readiness

Commands:

/sleep 8h
/sleep status

If sleep debt exists:

AI should soften reminders.

Example:

"Recovery condition detected.

Sleep deficit:
-3h

Recommendation:
Reduce cognitive intensity today.
Focus on consistency over intensity."

==================================================
# 8. AI Coaching Engine
==================================================

Implement:
rule-based coaching engine first.

Structure system so LLM integration can be added later.

The assistant should:
- analyze patterns
- detect weak consistency
- identify productivity leaks
- detect burnout risk
- suggest improvements

Example:

"You consistently underestimate backend missions by 35%.

Recommendation:
Break implementation into:
- architecture
- implementation
- debugging
- testing"

==================================================
# 9. Daily Briefing System
==================================================

Every morning generate:

"DAILY BRIEFING"

Include:
- sleep summary
- recovery state
- discipline score
- active goals
- top mission
- habit readiness
- tennis readiness
- warnings
- tactical recommendation

Example:

"DAILY BRIEFING

Sleep:
7h 45m

Discipline Score:
81

Primary Mission:
POS Backend API

Tennis Readiness:
LOW

Recommendation:
Add 45m footwork training tonight."

==================================================
# 10. End-of-Day Debrief
==================================================

Generate nightly report:

"MISSION DEBRIEF"

Include:
- completed missions
- failed missions
- focus efficiency
- estimation accuracy
- habit completion
- mission drift
- coaching insight
- next-day recommendation

==================================================
# 11. Notification System
==================================================

Implement:
- node-cron scheduler

Support:
- mission reminders
- wake reminders
- sleep reminders
- tennis reminders
- inactivity reminders
- recovery reminders

==================================================
# 12. Database Design
==================================================

Use PostgreSQL.

Generate full schema.

Tables:

users
missions
mission_sessions
habit_types
habit_logs
tennis_training_logs
sleep_logs
discipline_scores
coaching_feedback
reminders
daily_reports
weekly_reports
performance_metrics

==================================================
# 13. Folder Structure
==================================================

Generate scalable structure.

Example:

/src
  /commands
  /services
  /repositories
  /schedulers
  /analytics
  /coaching
  /notifications
  /db
  /utils
  /types
  /prompts

==================================================
# 14. OpenClaw Integration
==================================================

Generate:
- manifest.json
- skill registration
- command handlers
- scheduler initialization
- environment variables
- setup instructions

==================================================
# 15. Coding Standards
==================================================

Requirements:
- strict TypeScript
- clean code
- SOLID principles
- reusable services
- comments
- environment configs
- migration scripts
- production-ready quality

==================================================
# 16. Output Requirements
==================================================

Generate:

1. architecture overview
2. folder structure
3. PostgreSQL schema
4. manifest.json
5. command handlers
6. mission service
7. habit service
8. tennis analytics service
9. coaching engine
10. reminder scheduler
11. BullMQ integration
12. Redis integration
13. daily briefing generator
14. debrief generator
15. sample AI prompts
16. environment configuration
17. migration scripts
18. setup instructions
19. future scalability recommendations

==================================================
# 17. Future Scalability
==================================================

Design system so future features can include:
- voice assistant
- wearable integrations
- smartwatch sync
- calendar sync
- AI memory
- semantic search
- vector embeddings
- multiplayer accountability
- team operations dashboard
- mobile app
- desktop app
- AI executive assistant mode

==================================================
# 18. UX DIRECTION
==================================================

UI/UX theme:
- tactical dashboard
- command center
- elite operator aesthetic
- military-inspired
- minimal
- modern
- dark mode friendly

NOT:
- cartoon military
- childish gamification
- meme aesthetic

==================================================
END OF SPECIFICATION
==================================================