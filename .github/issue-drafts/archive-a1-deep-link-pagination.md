# Archive: deep-linked checkpoints outside the first discovery page

**Severity:** Medium  
**Source:** Independent review of PR #17 (priority 5), accepted as nonblocking follow-up at merge.  
**Tracking:** File this as a GitHub issue when Issues are enabled on the repository.

## Summary

Shared Archive URLs that point at a checkpoint beyond the newest-first discovery page replay correctly, but Previous/Next navigation and listbox selection break because the active checkpoint is not merged into the client checkpoint list.

## Affected files

- `src/components/archive/archive-view.tsx` (checkpoint list, Previous/Next, `sortedCheckpoints` / `activeIndex`)
- `src/lib/archive/load-archive-page.ts` (SSR initial list uses the same default page size)
- `src/lib/domain/historical-reconstruction.ts` (`HISTORY_CHECKPOINT_LIST_DEFAULT`)

## Reproduction

1. Use database storage with an event that has **more than 20** published history checkpoints.
2. Identify a checkpoint id whose **sequence** is not on the first page (for example sequence 21 or older).
3. Open `/archive?event=<eventId>&checkpoint=<thatCheckpointId>` (or the equivalent history URL) in a fresh session.
4. Observe that the reconstruction panel loads for the deep-linked checkpoint.
5. Observe that **Previous checkpoint** / **Next checkpoint** controls stay disabled or wrong, and the checkpoint may be missing from the listbox.

## Expected behavior

- A valid deep-linked checkpoint should appear in the checkpoint list (or an equivalent anchor) so Previous/Next and keyboard navigation work.
- Shareable URLs should support moving to adjacent checkpoints without requiring the user to load older pages manually first.

## Suggested fix

After a successful replay, inject a `HistoryCheckpointSummary` for the active checkpoint (from the replay response) into `checkpoints`, or fetch discovery with `beforeSequence` anchored on the replayed sequence so the current id is always present in `sortedCheckpoints`.

## Regression tests required

- Component or workflow test: event with >20 checkpoints, deep-link to a checkpoint on page 2+, assert list membership and that Previous/Next enable and navigate correctly.
- Optional SSR test for `loadArchivePageData` when `searchParams.checkpoint` is outside the first page.
