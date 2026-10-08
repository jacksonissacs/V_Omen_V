# Task 14 evidence, 2026-10-08

The DOM-inserted long-rule probe reviewed against `d37a716` is superseded. It was not committed. These files replace it.

`EventIntelligenceView` renders the normal `/events/evt-boc-cut` route. For the capture only, demo event `evt-boc-cut` receives a 1,356-character `resolutionCriteria` value labeled `DEMO FIXTURE TASK14`. The harness writes that field into `src/data/events.ts`, takes the screenshots, then restores the file. No DOM nodes are inserted, and no screenshot CSS is applied. This is demo fixture input. It is not a claim about the PR #34 sourced event or a production database.

## Reproduce

Start the demo server, then run the harness:

```bash
OMEN_STORAGE_MODE=demo npx next dev --hostname 127.0.0.1 --port 3314
node docs/release-qa/task14-2026-10-08/capture-brief.mjs
```

The harness refuses to leave the fixture in place. `report.json` records the source SHA-256 before the patch and after the restore, plus `git diff` for the application files.

## What the capture checks

- Viewport screenshots at 390×844 and 1440×900, taken with the brief scroll container at 0.
- The question, then the three actions, then the full rule text.
- The rendered rule matches `fixture-rule.txt` exactly.
- Enter on Inspect evidence focuses the evidence inspector.
- The archive link is `/archive?event=evt-boc-cut`.
- Unfollowing writes browser storage, and a real page reload keeps that saved state.
