#!/usr/bin/env bash
set -euo pipefail

cd /workspace

# shellcheck source=/dev/null
source .cursor/scripts/cloud-agent-env.sh

bash .cursor/scripts/cloud-agent-start.sh
bash .cursor/scripts/cloud-agent-smoke.sh
bash .cursor/scripts/cloud-agent-start.sh
bash .cursor/scripts/cloud-agent-install.sh

npm run lint
npx next typegen
npm run typecheck
npm test
npm run build
npm run test:db
npm run test:workflow
