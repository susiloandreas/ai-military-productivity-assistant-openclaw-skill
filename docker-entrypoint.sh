#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
node dist/utils/migrate.js

# Pick which process this container runs. SERVICE_ROLE (an env var) takes
# precedence so the SAME image runs different roles across platforms without
# depending on the platform's start-command handling — on Railway the start
# command is overridden by repo files (Procfile / package.json "start"), but an
# env var is not, and it maps cleanly to docker-compose `environment:` on a VPS.
# Fallback order: SERVICE_ROLE env -> explicit args (compose `command:`) -> web.
role="${SERVICE_ROLE:-}"
echo "[entrypoint] Starting (SERVICE_ROLE='${role}')..."

case "$role" in
  ""|web)
    # No role set: honour explicit args if given (docker-compose), else web server.
    if [ -z "$role" ] && [ "$#" -gt 0 ]; then exec "$@"; fi
    exec node dist/server.js
    ;;
  telegram-listener) exec node dist/schedulers/TelegramListenerWorker.js ;;
  eta-worker)        exec node dist/schedulers/EtaExpiryWorker.js ;;
  idle-reminder)     exec node dist/schedulers/IdleReminderWorker.js ;;
  coaching)          exec node dist/schedulers/CoachingWorker.js ;;
  calendar-sync)     exec node dist/schedulers/CalendarSyncWorker.js ;;
  *)
    echo "[entrypoint] Unknown SERVICE_ROLE='$role' — defaulting to web server" >&2
    exec node dist/server.js
    ;;
esac
