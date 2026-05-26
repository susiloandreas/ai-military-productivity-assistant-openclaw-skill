#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
node dist/utils/migrate.js

echo "[entrypoint] Starting ironclaw-ai service..."
exec node dist/server.js
