# OMEN-004 October baseline evidence — 2026-10-07

**October decision: FAIL** (2/8). Baseline SHA `aea8636c555736de9d61110abc8a05a173a67d79`. Same Grok 4.7 agent `bc-105e4c9a-0993-440d-b397-f14cc50b9491`. This directory is the harness overlay on pull request #33. It is not part of `main`.

| Path | What it is |
| --- | --- |
| `checkout.txt` | HEAD and clean status recorded before tests |
| `commands.log` | Exit codes for the eight harness commands |
| `matrix.md` | Dated 8-row PASS/FAIL matrix |
| `defects.md` | Minimal defect list |
| `harness-overlay-notes.md` | What was required to run, and what was not applied to the baseline tree |
| `api-transcript.txt` | Production API and route statuses |
| `event-count.txt` | `events` count 0 on the empty database |
| `migrate.log` | Schema applied, no upsert |
| `browser-report.json` | URLs, chips, overflow, seeded-string hits |
| `browser/` | Production `next start` screenshots |
| `synthetic-controls/` | Workflow-suite artifacts. Synthetic only. `release-verification.json` records `headSha` `aea8636c555736de9d61110abc8a05a173a67d79` |
| `harness-overlay/` | Capture scripts. Not in the baseline commit |

Historical CI, not this run: https://github.com/jacksonissacs/V_Omen_V/actions/runs/37131563152
