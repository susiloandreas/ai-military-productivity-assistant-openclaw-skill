#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
node dist/utils/migrate.js

echo "[entrypoint] Starting service..."
# Use passed args if provided, otherwise default to the web server
if [ "$#" -gt 0 ]; then
  exec "$@"
else
  exec node dist/server.js
fi
