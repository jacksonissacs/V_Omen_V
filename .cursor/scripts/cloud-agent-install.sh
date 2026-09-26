#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/cloud-agent-env.sh"

cd "${SCRIPT_DIR}/../.."

if [[ ! -f package-lock.json ]]; then
  echo "BLOCKED: package-lock.json is missing; npm ci cannot run." >&2
  exit 1
fi

npm ci
