#!/usr/bin/env bash
# Test-only local CI parity (not production credentials). Source from agent install/start/smoke shells.
export OMEN_TEST_DATABASE_ADMIN_URL="${OMEN_TEST_DATABASE_ADMIN_URL:-postgresql://omen_test:local_ci_only@127.0.0.1:5432/postgres}"
export PGPASSWORD="${PGPASSWORD:-local_ci_only}"
export CHROME_PATH="${CHROME_PATH:-/usr/bin/chromium}"
