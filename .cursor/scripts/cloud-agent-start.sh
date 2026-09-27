#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/cloud-agent-env.sh"

if command -v pg_isready >/dev/null 2>&1 \
  && pg_isready -h 127.0.0.1 -p 5432 -U omen_test -d postgres >/dev/null 2>&1; then
  exit 0
fi

if ! command -v pg_isready >/dev/null 2>&1; then
  echo "BLOCKED: PostgreSQL client tools are not installed (pg_isready missing)." >&2
  exit 1
fi

if ! sudo service postgresql start 2>/dev/null; then
  sudo pg_ctlcluster 16 main start
fi

for _ in $(seq 1 30); do
  if pg_isready -h 127.0.0.1 -p 5432 -U omen_test -d postgres >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done

echo "BLOCKED: PostgreSQL did not become ready on 127.0.0.1:5432." >&2
exit 1
