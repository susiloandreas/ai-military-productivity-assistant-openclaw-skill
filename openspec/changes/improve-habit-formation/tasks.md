## 1. Data layer — streaks

- [x] 1.1 Add migration creating `habit_streaks` (user_id, habit_type_id NULL=overall, current_count, longest_count, last_logged_day DATE, updated_at), unique on (user_id, habit_type_id)
- [x] 1.2 Add a best-effort backfill in the migration seeding current/longest/last_logged_day from recent completed missions
- [x] 1.3 Add `StreakRepository` (get rows for user, upsert a habit row, read overall row)
- [x] 1.4 Add `Streak` / `StreakSnapshot` interfaces to `src/types`

## 2. Streak service (habit-streaks)

- [x] 2.1 Create pure `computeStreakAfterGap(row, habitSchedule, now, TZ)` that applies any pending break before use
- [x] 2.2 Create `StreakService.recordCompletion(userId, habitTypeId, now)` — once-per-local-day-per-type increment for the habit row and the overall row
- [x] 2.3 Create `StreakService.getSnapshot(userId, now)` returning per-habit + overall current/longest with pending breaks applied
- [x] 2.4 Call `recordCompletion` from `MissionService` completion and expiry-resolution (completed) paths
- [x] 2.5 Unit-test streak increment, once-per-day guard, break-on-missed-scheduled-day, longest preservation, overall streak, DST/week boundaries

## 3. Miss recovery (miss-recovery)

- [x] 3.1 Add pure `recoveryState(consecutiveMisses, habit)` → { recoverable | escalate, offerMinimumViable }
- [x] 3.2 Track consecutive missed scheduled days per habit-type (derive from streak/last_logged_day + schedule)
- [x] 3.3 Add "missed (recoverable)" framing + 2-minute minimum-viable offer to `idleReminderMessages` and the expiry/next-step replies
- [x] 3.4 Reset escalation when the habit is logged (including the minimum-viable path)
- [x] 3.5 Unit-test first-miss-gentle, second-consecutive-escalates, recovery-resets

## 4. Tone gate (coaching-tone-balance)

- [x] 4.1 Add pure predicate `shouldUseLossAversion(ctx)` — true only at inflection points (streak-at-risk-today, ≥2 consecutive misses, nightly debrief)
- [x] 4.2 Add competence/mastery copy pools alongside the existing loss-aversion pools in `idleReminderMessages` and `telegramReplies`
- [x] 4.3 Route reminder/coaching builders through the predicate to pick the pool
- [x] 4.4 Pass a `tone: 'competence' | 'loss_aversion'` directive into the Gemini prompts in `coachingContext`/`composeCoaching`/`composeNextStep`
- [x] 4.5 Unit-test the predicate (fires at each inflection point, suppressed on a good day) and that surfaces agree on the same state

## 5. Escalating completion reward (completion-reward)

- [x] 5.1 Add `rewardTier(streakCount)` → tier (1, 3, 7, 14, 30+)
- [x] 5.2 Extend `composeCompletionCheer` to take the streak snapshot + tier; include both in the Gemini prompt
- [x] 5.3 Make the static fallback escalate celebration by tier and name the streak achievement
- [x] 5.4 Pass the streak snapshot from the worker completion paths into the cheer
- [x] 5.5 Unit-test tier selection and that prompt + fallback both reflect the tier

## 6. Surfacing & wiring

- [x] 6.1 Add streak line(s) to the completion reply and morning brief (overall + longest active per-habit)
- [x] 6.2 Add a streak block to `coachingContext` summary so the brief and AI prompt see it
- [x] 6.3 Update README (habit-streaks, recovery, tone balance)
- [x] 6.4 Run `npx tsc --noEmit` and the full Jest suite; fix regressions
