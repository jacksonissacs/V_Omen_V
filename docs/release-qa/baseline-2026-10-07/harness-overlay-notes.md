# Harness overlay versus the baseline tree

The product checkout stayed `aea8636c555736de9d61110abc8a05a173a67d79` with an empty `git status --porcelain` before tests and after every command, including after the browser capture.

## Corrections required to execute the baseline

None. These commands ran unchanged on that clean tree and all exited 0:

- `npm ci`
- `npm run lint`
- `npx next typegen`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run test:db`
- `npm run test:workflow`

`npx next typegen` did not dirty the worktree.

No product file was edited. No fixture was added to pass Discover. `next dev` was not started.

## Files that exist only on the pull-request branch

`harness-overlay/omen-004-run-baseline.sh`, `harness-overlay/omen-004-browser.sh`, and `harness-overlay/omen-004-capture.mjs` are the scripts used from `/tmp` to log the clean checkout and to photograph production `next start`. They were not present in the baseline tree while it ran. They are evidence of how the pack was captured, not a product change.

The October contract text in `docs/release-qa/omen-004-release-qa-plan.md` is also only on this branch. Share was removed from the acceptance rows before the baseline ran.
