#!/usr/bin/env bash
# API tests against a real `wrangler dev` with a throwaway local D1 (never touches your dev data).
set -euo pipefail
cd "$(dirname "$0")/.."
export PERSIST_TO="$(mktemp -d)"
PORT="${PORT:-8799}"
npx wrangler d1 migrations apply DB --local --persist-to "$PERSIST_TO" > /dev/null
bash scripts/seed-local.sh > /dev/null
node scripts/mock-identity.mjs > "$PERSIST_TO/identity.log" 2>&1 &
MOCK=$!
setsid npx wrangler dev --var BANKING_DEV:1 --var IDENTITY_ORIGIN:http://localhost:8798 --var IDENTITY_INTERNAL_SECRET:test-secret --port "$PORT" --inspector-port "$((PORT + 1000))" --persist-to "$PERSIST_TO" > "$PERSIST_TO/dev.log" 2>&1 &
DEV=$!
trap 'kill -- -$DEV $MOCK 2>/dev/null; [ -n "${KEEP:-}" ] || rm -rf "$PERSIST_TO"' EXIT
for _ in $(seq 1 60); do curl -sf "http://localhost:$PORT/api/me" | grep -q authenticated && break; sleep 1; done
# The first POST with a body to a cold `wrangler dev` can lose its body while the runtime warms
# up; sacrifice one (it answers 401) so the tests see a warm server.
curl -s -o /dev/null -X POST "http://localhost:$PORT/api/entries" -H 'content-type: application/json' -d '{}'
BASE="http://localhost:$PORT" node --test --test-concurrency=1 tests/*.test.mjs
