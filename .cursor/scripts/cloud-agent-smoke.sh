#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# shellcheck source=/dev/null
source "$(dirname "$0")/cloud-agent-env.sh"

fail() {
  echo "cloud-agent-smoke: $*" >&2
  exit 1
}

echo "== Runtime user =="
[[ "$(whoami)" == "ubuntu" ]] || fail "expected user ubuntu, got $(whoami)"
[[ "$(id -u)" != "0" ]] || fail "must not run as root"

echo "== Workspace permissions =="
touch /workspace/.cloud-agent-write-test || fail "/workspace is not writable for $(whoami)"
rm -f /workspace/.cloud-agent-write-test
touch "${HOME}/.cloud-agent-write-test" || fail "HOME is not writable (${HOME})"
rm -f "${HOME}/.cloud-agent-write-test"

echo "== Node 22 =="
node -v | grep -q '^v22\.' || fail "expected Node 22, got $(node -v)"

echo "== PostgreSQL 16 server =="
ver="$(psql "$OMEN_TEST_DATABASE_ADMIN_URL" -Atc "SHOW server_version_num;")"
[[ "$ver" == 16* ]] || fail "expected PostgreSQL 16.x server_version_num, got $ver"
psql "$OMEN_TEST_DATABASE_ADMIN_URL" -c "SELECT current_user AS role, split_part(version(), ' ', 2) AS pg_version;"

echo "== Disposable database create/drop =="
suffix="$(printf '%s_%s' "$$" "$(openssl rand -hex 4)")"
db_name="omen_smoke_${suffix}"
psql "$OMEN_TEST_DATABASE_ADMIN_URL" -c "CREATE DATABASE \"${db_name}\""
psql "$OMEN_TEST_DATABASE_ADMIN_URL" -c "DROP DATABASE \"${db_name}\""

echo "== Environment variable propagation =="
bash -lc 'test -n "${OMEN_TEST_DATABASE_ADMIN_URL:-}"' \
  || fail "OMEN_TEST_DATABASE_ADMIN_URL missing in login shell (profile.d)"
env -i HOME="$HOME" PATH="/usr/local/bin:/usr/bin:/bin" USER="${USER:-ubuntu}" LOGNAME="${USER:-ubuntu}" \
  bash -c 'test -z "${OMEN_TEST_DATABASE_ADMIN_URL:-}"' \
  || fail "non-login shell inherited OMEN_TEST_DATABASE_ADMIN_URL without sourcing env"
# shellcheck source=/dev/null
bash -c "source '${ROOT}/.cursor/scripts/cloud-agent-env.sh' && test -n \"\${OMEN_TEST_DATABASE_ADMIN_URL:-}\"" \
  || fail "sourcing cloud-agent-env.sh did not set OMEN_TEST_DATABASE_ADMIN_URL"

echo "== Chromium =="
[[ -x "$CHROME_PATH" ]] || fail "CHROME_PATH not executable: $CHROME_PATH"
"$CHROME_PATH" --version
node -e "
const { spawnSync } = require('node:child_process');
const path = process.env.CHROME_PATH;
const r = spawnSync(path, ['--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', 'about:blank'], {
  encoding: 'utf8',
  timeout: 15000,
});
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(1);
}
console.log('chromium headless launch ok');
"

echo "cloud-agent-smoke: all checks passed"
