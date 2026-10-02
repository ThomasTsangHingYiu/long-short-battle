#!/bin/sh
# Idempotent preview revive: start Vite dev on 0.0.0.0:8080 if down.
cd "$(dirname "$0")" || exit 1
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
npm run dev > /tmp/dev-server.log 2>&1 &
