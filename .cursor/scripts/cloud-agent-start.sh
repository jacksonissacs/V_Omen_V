#!/usr/bin/env bash
set -euo pipefail

export OMEN_TEST_DATABASE_ADMIN_URL="${OMEN_TEST_DATABASE_ADMIN_URL:-postgresql://omen_test:local_ci_only@127.0.0.1:5432/postgres}"
export PGPASSWORD="${PGPASSWORD:-local_ci_only}"

if command -v pg_isready >/dev/null 2>&1 \
  && pg_isready -h 127.0.0.1 -p 5432 -U omen_test -d postgres >/dev/null 2>&1; then
  exit 0
fi

if ! command -v pg_isready >/dev/null 2>&1; then
  echo "BLOCKED: PostgreSQL client tools are not installed (pg_isready missing)." >&2
  exit 1
fi

sudo service postgresql start

for _ in $(seq 1 30); do
  if pg_isready -h 127.0.0.1 -p 5432 -U omen_test -d postgres >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done

echo "BLOCKED: PostgreSQL did not become ready on 127.0.0.1:5432." >&2
exit 1
