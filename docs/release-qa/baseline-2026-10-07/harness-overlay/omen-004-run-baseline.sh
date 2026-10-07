#!/usr/bin/env bash
set -u
cd /tmp/omen-004-baseline
source /workspace/.cursor/scripts/cloud-agent-env.sh
export CHROME_PATH="${CHROME_PATH:-/usr/bin/chromium}"
LOG=/tmp/omen-004-evidence-staging/commands.log
mkdir -p /tmp/omen-004-evidence-staging
exec > >(tee -a "$LOG") 2>&1

echo "=== CHECKOUT BEFORE TESTS $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
git rev-parse HEAD
echo "PORCELAIN_BEGIN"
git status --porcelain
echo "PORCELAIN_END"
git status -sb
echo "=== END CHECKOUT ==="

run() {
  echo "=== CMD: $* ==="
  echo "START $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  "$@"
  local code=$?
  echo "EXIT $code"
  echo "PORCELAIN_AFTER_BEGIN"
  git status --porcelain
  echo "PORCELAIN_AFTER_END"
  echo "=== END CMD ==="
  return 0
}

run npm ci
run npm run lint
run npx next typegen
run npm run typecheck
run npm test
run npm run build
run npm run test:db
run npm run test:workflow
echo "=== ALL COMMANDS FINISHED $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
