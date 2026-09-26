#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

if [[ ! -f package-lock.json ]]; then
  echo "BLOCKED: package-lock.json is missing; npm ci cannot run." >&2
  exit 1
fi

npm ci
