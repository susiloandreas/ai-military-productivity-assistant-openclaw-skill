## 1. Parser intents

- [x] 1.1 Add `help` and `habits` members to `ParsedIntent`
- [x] 1.2 Add `HELP_PHRASES` and `HABITS_PHRASES` whole-message trigger sets
- [x] 1.3 Match them in `parseIntent` after the status check (whole-message only)
- [x] 1.4 Unit-test recognition (incl. `/help` slash form) and that "mulai habit reading 30m" stays a start

## 2. Reply copy + status helper

- [x] 2.1 Add `replyHelp()` listing every command with a natural-language example
- [x] 2.2 Add pure `summarizeTodayHabits(schedules, loggedTypeIds, now)` tagging done / missed / due / upcoming, sorted by time
- [x] 2.3 Add `replyHabitsToday()` rendering the list with status icons and a done/total counter (empty-day message when nothing is scheduled)
- [x] 2.4 Unit-test the status helper and both formatters

## 3. Listener wiring

- [x] 3.1 Add a `help` case sending `replyHelp()`
- [x] 3.2 Add a `habits` case fetching `getActiveSchedules` + `getHabitTypeIdsLoggedSince(startOfToday)` and sending `replyHabitsToday()`

## 4. Follow-ups (not yet done)

- [ ] 4.1 Add `help` / `habits` to the README command list
- [ ] 4.2 Consider an inline-keyboard menu if the command set grows
