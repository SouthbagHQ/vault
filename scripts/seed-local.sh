#!/usr/bin/env bash
# Seeds the LOCAL D1 database with test accounts and ready-made sessions, so you can use the
# app under `wrangler dev` without a round trip to Southbag Identity.
#   npm run db:migrate:local && bash scripts/seed-local.sh
# Then set a cookie in the browser (or curl -H 'cookie: …'):
#   southbag_vault_session=dev-alice   (also dev-bob, dev-erin, dev-frank)
set -euo pipefail
cd "$(dirname "$0")/.."
sql=""
now=$(date +%s000)
for who in alice bob erin frank; do
  shash=$(node -e "console.log(require('crypto').createHash('sha256').update('dev-$who').digest('base64url'))")
  name="$(tr '[:lower:]' '[:upper:]' <<< "${who:0:1}")${who:1}"
  sql+="INSERT OR IGNORE INTO users (id, handle, name, email, created_at, updated_at) VALUES ('dev-$who', '$who', '$name Southbag', '$who@example.com', $now, $now);"
  sql+="INSERT OR REPLACE INTO sessions (token_hash, user_id, expires_at, created_at) VALUES ('$shash', 'dev-$who', 9999999999999, $now);"
done
npx wrangler d1 execute DB --local ${PERSIST_TO:+--persist-to "$PERSIST_TO"} --command "$sql" > /dev/null
echo "Seeded. Cookies: southbag_vault_session=dev-alice | dev-bob | dev-erin | dev-frank"
