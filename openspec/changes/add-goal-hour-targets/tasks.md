## 1. Schema

- [x] 1.1 Add migration `023_add_goal_target_hours.sql` adding `goals.target_hours NUMERIC`
- [x] 1.2 Backfill `target_hours` from each goal's final-exam milestone (`target_value / 60`) where null

## 2. Type + data access

- [x] 2.1 Add optional `target_hours` to the `Goal` type
- [x] 2.2 Add a `targetHours` parameter (default `null`) to `GoalRepository.create` and persist it
- [x] 2.3 Pass `targetMinutes / 60` from `GoalService.createHabitGoal`

## 3. Goal seeding

- [x] 3.1 Add `src/utils/seedGoals.ts`: per-category goals with hour target + intermediate hour checkpoints + final-exam hour milestone
- [x] 3.2 Make it idempotent (skip a category with an active goal) and backfill progress from retroactive minutes already logged in the category
- [x] 3.3 Add the `seed:goals` npm script and exclude `seedGoals.ts` from Jest coverage

## 4. Follow-ups (not yet done)

- [ ] 4.1 Keep `target_hours` in sync if the final-exam milestone is later edited
- [ ] 4.2 Generalize seeding beyond `DEFAULT_USER_ID`
