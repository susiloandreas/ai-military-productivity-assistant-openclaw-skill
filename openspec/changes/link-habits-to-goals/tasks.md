## 1. Data model

- [x] 1.1 Add migration `019_add_habit_type_to_goals.sql` (nullable `habit_type_id` FK + partial index)
- [x] 1.2 Add `habit_type_id: string | null` to the `Goal` type

## 2. Repository layer

- [x] 2.1 `GoalRepository.create` accepts an optional `habitTypeId`
- [x] 2.2 Scope `getActiveByCategory` to aggregate goals (`habit_type_id IS NULL`)
- [x] 2.3 Add `GoalRepository.getActiveByHabitType`
- [x] 2.4 Add `HabitRepository.getHabitTypeById`

## 3. Service layer

- [x] 3.1 `GoalService.createHabitGoal` (goal + final-exam milestone at target)
- [x] 3.2 `GoalService.getGoalStatus` exposes `habitTypeName`
- [x] 3.3 `HabitService.logRetroactive` advances the habit-type goal; `HabitLogResult` gains `habitGoalProgress`
- [x] 3.4 `HabitService.setHabitGoal` (parses duration target, delegates to `createHabitGoal`)

## 4. Command layer

- [x] 4.1 Add `/habit goal set <category> <type> <target> [--deadline]`
- [x] 4.2 Show both habit-type and category goal progress in `/habit log` output
- [x] 4.3 Label type-linked goals as `CATEGORY / TYPE` in `/status goals`

## 5. Tests

- [x] 5.1 `HabitService`: advances a habit-type goal; existing category-goal path still works
- [x] 5.2 `habitCommands`: `/habit goal set` creates a goal; missing-args error
- [x] 5.3 Update existing goal-status / log mocks for the new fields
