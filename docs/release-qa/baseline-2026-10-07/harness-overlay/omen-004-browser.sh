#!/usr/bin/env bash
set -u
source /workspace/.cursor/scripts/cloud-agent-env.sh
export CHROME_PATH="${CHROME_PATH:-/usr/bin/chromium}"
BASE=/tmp/omen-004-baseline
OUT=/tmp/omen-004-evidence-staging/browser
mkdir -p "$OUT"
ADMIN="$OMEN_TEST_DATABASE_ADMIN_URL"
DB_NAME=omen_004_baseline_empty
DB_URL="postgresql://omen_test:local_ci_only@127.0.0.1:5432/${DB_NAME}"

psql "$ADMIN" -c "DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)" >/tmp/omen-004-evidence-staging/db-drop.txt
psql "$ADMIN" -c "CREATE DATABASE ${DB_NAME}" >/tmp/omen-004-evidence-staging/db-create.txt
cd "$BASE"
# Migrate as a nonproduction process. Do not upsert fixtures.
env -u NODE_ENV DATABASE_URL="$DB_URL" npm run db:migrate -- --identify test --label "OMEN-004 October baseline empty book" > "$OUT/migrate.log" 2>&1
echo "MIGRATE_EXIT:$?" | tee "$OUT/migrate.exit"
psql "$DB_URL" -c "SELECT count(*) AS events FROM events;" > "$OUT/event-count.txt"
psql "$DB_URL" -c "SELECT id, title, provenance FROM events;" >> "$OUT/event-count.txt"

start_server() {
  local name="$1"
  local port="$2"
  shift 2
  env -u OMEN_STORAGE_MODE -u DATABASE_URL "$@" \
    npx next start -H 127.0.0.1 -p "$port" > "$OUT/${name}.log" 2>&1 &
  echo $! > "$OUT/${name}.pid"
  echo "started $name pid $(cat "$OUT/${name}.pid") port $port"
}

cd "$BASE"
start_server empty 3210 NODE_ENV=production OMEN_STORAGE_MODE=database DATABASE_URL="$DB_URL"
start_server demo 3212 NODE_ENV=production OMEN_STORAGE_MODE=demo
start_server unset 3214 NODE_ENV=production

for port in 3210 3212 3214; do
  ok=0
  for _ in $(seq 1 40); do
    if curl -sf -o /dev/null -w "%{http_code}" "http://127.0.0.1:${port}/" >/tmp/omen-004-curl-code; then
      ok=1
      break
    fi
    sleep 0.5
  done
  echo "ready ${port}: $(cat /tmp/omen-004-curl-code) ok=${ok}"
done

# API transcripts
{
  echo "=== empty GET /api/events ==="
  curl -sS -D - "http://127.0.0.1:3210/api/events"
  echo
  echo "=== demo production GET /api/events ==="
  curl -sS -D - "http://127.0.0.1:3212/api/events"
  echo
  echo "=== demo production GET /api/events/evt-boc-cut ==="
  curl -sS -D - "http://127.0.0.1:3212/api/events/evt-boc-cut"
  echo
  echo "=== unset GET /api/events ==="
  curl -sS -D - "http://127.0.0.1:3214/api/events"
  echo
  echo "=== route statuses on demo production ==="
  for path in markets signals agents research relations alerts graph pulse events watchlists archive; do
    code=$(curl -sS -o "$OUT/body-${path}.html" -w "%{http_code}" "http://127.0.0.1:3212/${path}")
    echo "$path $code"
  done
} > "$OUT/api-transcript.txt"

node /tmp/omen-004-capture.mjs > "$OUT/capture-summary.json"

echo "CAPTURE_DONE"
