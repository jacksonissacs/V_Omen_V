# Archive: replay failure clears a successful checkpoint list

**Severity:** Medium  
**Source:** Independent review of PR #17 (priority 5), accepted as nonblocking follow-up at merge.  
**Tracking:** File this as a GitHub issue when Issues are enabled on the repository.

## Summary

When the checkpoint **list** fetch succeeds but the **replay** fetch fails, `loadCheckpoint` clears the entire checkpoint list and marks discovery unavailable. Listing data should survive replay-only failures.

## Affected files

- `src/components/archive/archive-view.tsx` (`loadCheckpoint` catch block around lines 252–260)

## Reproduction

1. Open Archive on a checkpoint URL for an event with at least one checkpoint.
2. Simulate or force the list request to succeed (`GET /api/events/:id/history`) and the replay request to fail (`GET /api/events/:id/history/:checkpointId`) — for example 503, network error, or invalid JSON on replay only.
3. Observe that the checkpoint list disappears and the UI shows unavailable/empty discovery even though the list response was valid.

## Expected behavior

- Replay errors should affect reconstruction status only.
- A successful checkpoint list should remain visible (and “Load older checkpoints” state should remain consistent) when only replay fails.

## Suggested fix

Track list vs replay outcomes separately in `loadCheckpoint`. In `catch`, set replay error state without calling `setCheckpoints([])`, `setHasMoreCheckpoints(false)`, or resetting discovery when the list fetch already succeeded.

## Regression tests required

- Unit test in `archive-screen.test.tsx` (or dedicated `archive-view` tests): mock list 200 + replay 503 (or throw), assert checkpoint buttons remain and discovery status is not wiped.
- Optional workflow test if replay failure can be induced deterministically in the harness.
