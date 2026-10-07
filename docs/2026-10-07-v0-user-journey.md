# V0 user journey — 2026-10-07

October Task 13. Happy path in six steps, one weakest transition, and a proposed Task 14. No product code is changed here. Task 14 is not approved and is not started.

The path below is the candidate that actually contains one sourced event: tested code [`79596c41232b092dbf5640979039d14f49a0d83c`](https://github.com/jacksonissacs/V_Omen_V/commit/79596c41232b092dbf5640979039d14f49a0d83c), evidence head [`1fa914127bf6bb56978eb8debe7fcd61eb645734`](https://github.com/jacksonissacs/V_Omen_V/commit/1fa914127bf6bb56978eb8debe7fcd61eb645734). Application files are the same at both SHAs. Screenshots and the matrix exist only on the evidence head. `main` at [`aea8636c555736de9d61110abc8a05a173a67d79`](https://github.com/jacksonissacs/V_Omen_V/commit/aea8636c555736de9d61110abc8a05a173a67d79) still has an empty book, so this walk cannot succeed there. See [2026-10-07-current-state-reconciliation.md](2026-10-07-current-state-reconciliation.md).

Journey shell routes are unchanged from `main` except the evidence panel’s null reliability label. Links to those shell files use the tested code SHA.

Server pages load the book through `getRepository()` and pass serializable props. Follow state is not in that book. It is `localStorage` in the browser.

## 1. Discover

- **Intent:** Find one real question in the book.
- **Route / control:** `/pulse` (“Pulse”) or `/events` (“Explore”). The card link is “Open brief for Gemini 4.0 released by October 31, 2026?”. Actions on the card: “View brief” → `/events/evt-gemini-4-public-2026-10-31`, “Inspect evidence” → that URL plus `#event-evidence`, and “Follow”.
- **Success:** The question is on screen, current probability 94.5%, chip “Sourced”, change “Not computable”, one observation. Pulse count text: “1 in the book”.
- **Boundary:** PostgreSQL via the repository, storage mode `database`, provenance `sourced`. The card does not write state.
- **Source:** [event-card.tsx](https://github.com/jacksonissacs/V_Omen_V/blob/79596c41232b092dbf5640979039d14f49a0d83c/src/components/events/event-card.tsx#L19-L161), [pulse-screen.tsx](https://github.com/jacksonissacs/V_Omen_V/blob/79596c41232b092dbf5640979039d14f49a0d83c/src/components/screens/pulse-screen.tsx#L61-L77), [pulse/page.tsx](https://github.com/jacksonissacs/V_Omen_V/blob/79596c41232b092dbf5640979039d14f49a0d83c/src/app/%28workspace%29/pulse/page.tsx), [events/(book)/page.tsx](https://github.com/jacksonissacs/V_Omen_V/blob/79596c41232b092dbf5640979039d14f49a0d83c/src/app/%28workspace%29/events/%28book%29/page.tsx).
- **Evidence:** [discover-pulse-1440.png](https://github.com/jacksonissacs/V_Omen_V/blob/1fa914127bf6bb56978eb8debe7fcd61eb645734/docs/release-qa/d1-2026-10-07/browser/discover-pulse-1440.png), [discover-explore-390.png](https://github.com/jacksonissacs/V_Omen_V/blob/1fa914127bf6bb56978eb8debe7fcd61eb645734/docs/release-qa/d1-2026-10-07/browser/discover-explore-390.png). Matrix row 1.
- **Empty / failure:** No rows: Pulse heading “No events in the book yet”. That is `main` today. [Baseline shot](https://github.com/jacksonissacs/V_Omen_V/blob/752499d0569f3c782b95fa00eec5ad810d8ff8fc/docs/release-qa/baseline-2026-10-07/browser/discover-pulse-1440.png). Filters with no hit: “No matching events”. Demo or unset mode: “Workspace data unavailable”, and `GET /api/events` is 503.

Pulse still says “largest recorded moves first” while this event’s change is not computable. The card states that honestly (“Not computable”, “No cause has been recorded.”). It does not invent a delta.

## 2. Event Brief

- **Intent:** Read the question, the current probability, and what the probability is.
- **Route / control:** `/events/evt-gemini-4-public-2026-10-31`. “View brief” or the card’s open-brief link.
- **Success:** H1 is the event title. Question ends with “?”. Chips include “Market-implied probability”, “3 evidence records”, and “Resolves Nov 1 2026”. Current probability 94.5%. Previous observation “None recorded”. Change “Not computable”.
- **Boundary:** `EventIntelligencePage` loads `getRepository().getEvent`. Unknown id is 404 “Event not in the book”. `?at` and `?cutoff` render Historical view unavailable and do not show this brief. A valid `?checkpoint` redirects to `/events/:id/history/:checkpointId`.
- **Source:** [events/[id]/page.tsx](https://github.com/jacksonissacs/V_Omen_V/blob/79596c41232b092dbf5640979039d14f49a0d83c/src/app/%28workspace%29/events/%5Bid%5D/page.tsx#L30-L50), [event-intelligence-view.tsx](https://github.com/jacksonissacs/V_Omen_V/blob/79596c41232b092dbf5640979039d14f49a0d83c/src/components/intelligence/event-intelligence-view.tsx#L56-L140).
- **Evidence:** [brief-evidence-1440.png](https://github.com/jacksonissacs/V_Omen_V/blob/1fa914127bf6bb56978eb8debe7fcd61eb645734/docs/release-qa/d1-2026-10-07/browser/brief-evidence-1440.png). Matrix row 2. The 390 shot is the weak step below, not a failed Understand check.
- **Empty / failure:** No observations: “Not recorded” / “No probability observations are recorded for this event.” No forecast is recorded for this event. The page says the latest observation is “not a live feed”.

## 3. Evidence and provenance

- **Intent:** See who the record cites, and that the record is sourced rather than a demo.
- **Route / control:** On the brief, “Inspect evidence” calls `scrollIntoView` on the inspector whose body is `#event-evidence`. The Pulse card also links straight to `#event-evidence`. Tabs: Evidence, Record, Analogues.
- **Success:** Three names: Polymarket gamma API, Polymarket, Google blog. Publication “Not stated by source” or “30 Sept, 20:00 UTC”. Reliability “Not recorded”. Record tab “Sourced”. Top bar “Sourced data”.
- **Boundary:** Evidence rows are stored with the event. Reliability null is not a score. Capture clocks in the pack are local body-receipt times, not HTTP Date. `observedAt` `2026-10-07T14:50:34.604Z` is the gamma market `updatedAt`, truncated to milliseconds, and the observation note says it is not a last-trade time.
- **Source:** [intelligence-panel.tsx](https://github.com/jacksonissacs/V_Omen_V/blob/79596c41232b092dbf5640979039d14f49a0d83c/src/components/intelligence/intelligence-panel.tsx#L41-L66), inspect handler [event-intelligence-view.tsx](https://github.com/jacksonissacs/V_Omen_V/blob/79596c41232b092dbf5640979039d14f49a0d83c/src/components/intelligence/event-intelligence-view.tsx#L50-L54).
- **Evidence:** [supplement.md](https://github.com/jacksonissacs/V_Omen_V/blob/1fa914127bf6bb56978eb8debe7fcd61eb645734/docs/release-qa/d1-2026-10-07/supplement.md), [evidence-390-google-blog.png](https://github.com/jacksonissacs/V_Omen_V/blob/1fa914127bf6bb56978eb8debe7fcd61eb645734/docs/release-qa/d1-2026-10-07/browser/evidence-section/evidence-390-google-blog.png), [evidence-390-polymarket.png](https://github.com/jacksonissacs/V_Omen_V/blob/1fa914127bf6bb56978eb8debe7fcd61eb645734/docs/release-qa/d1-2026-10-07/browser/evidence-section/evidence-390-polymarket.png), [evidence-390-polymarket-gamma-api.png](https://github.com/jacksonissacs/V_Omen_V/blob/1fa914127bf6bb56978eb8debe7fcd61eb645734/docs/release-qa/d1-2026-10-07/browser/evidence-section/evidence-390-polymarket-gamma-api.png), [record-390-sourced.png](https://github.com/jacksonissacs/V_Omen_V/blob/1fa914127bf6bb56978eb8debe7fcd61eb645734/docs/release-qa/d1-2026-10-07/browser/evidence-section/record-390-sourced.png). Harness: [capture-evidence-section.mjs](https://github.com/jacksonissacs/V_Omen_V/blob/1fa914127bf6bb56978eb8debe7fcd61eb645734/docs/release-qa/d1-2026-10-07/harness/capture-evidence-section.mjs).
- **Empty / failure:** No evidence rows: “No evidence is recorded for this event.” The first 390 brief viewport does not contain the source names. [brief-evidence-390.png](https://github.com/jacksonissacs/V_Omen_V/blob/1fa914127bf6bb56978eb8debe7fcd61eb645734/docs/release-qa/d1-2026-10-07/browser/brief-evidence-390.png).

## 4. Follow

- **Intent:** Keep this question for later in this browser.
- **Route / control:** Button “Follow” on the card or the brief. `aria-label` is `Follow ${title}`. After the write, the label is “Following” and `aria-pressed` is true.
- **Success:** `localStorage["omen-v0-following/v1/database"]` is `{"version":1,"eventIds":["evt-gemini-4-public-2026-10-31"],"userSaved":true}` before and after reload. [report.json](https://github.com/jacksonissacs/V_Omen_V/blob/1fa914127bf6bb56978eb8debe7fcd61eb645734/docs/release-qa/d1-2026-10-07/browser/report.json) fields `localStorageAfterFollow` and `localStorageAfterReload`.
- **Boundary:** Browser only. Key shape is `omen-v0-following/v1/<storage>`. The button `title` is “Following is saved in this browser only. It is not backed up or synced across devices.” There is no account and no server write. A second browser, or a cleared site store, does not have the follow.
- **Source:** [follow-event-button.tsx](https://github.com/jacksonissacs/V_Omen_V/blob/79596c41232b092dbf5640979039d14f49a0d83c/src/components/events/follow-event-button.tsx#L21-L38), [persistence.ts](https://github.com/jacksonissacs/V_Omen_V/blob/79596c41232b092dbf5640979039d14f49a0d83c/src/lib/following/persistence.ts#L20-L24).
- **Evidence:** Matrix row 4. The Following screenshot in step 5 is the visible result.
- **Empty / failure:** Save failure is `role="alert"`: “Could not save following in this browser. Storage may be full or blocked.” Unreadable storage is `role="status"`.

## 5. Return through Following

- **Intent:** Come back to the question after a reload, from the Following destination.
- **Route / control:** Nav “Following” → `/watchlists`. The row is a button that `router.push`s `/events/evt-gemini-4-public-2026-10-31`. The row’s own control is “Following” (unfollow). There is no Archive control on this row.
- **Success:** Heading “Following”. Description ends “Saved in this browser.” The row shows the title, “AI · open event”, 94.5%, “Not computable”, “Not yet attributed”, “Nov 1 2026”.
- **Boundary:** The page’s event catalog is the server book. Membership is the browser set from step 4. “Not yet attributed” is the reader fallback when no move-log cause is stored ([event-reader.ts](https://github.com/jacksonissacs/V_Omen_V/blob/79596c41232b092dbf5640979039d14f49a0d83c/src/lib/db/event-reader.ts#L307)). The subtitle “open event” is the fixed mapper string `${category} · open event`, not a resolution status read from Archive.
- **Source:** [watchlists/page.tsx](https://github.com/jacksonissacs/V_Omen_V/blob/79596c41232b092dbf5640979039d14f49a0d83c/src/app/%28workspace%29/watchlists/page.tsx), [watchlists-screen.tsx](https://github.com/jacksonissacs/V_Omen_V/blob/79596c41232b092dbf5640979039d14f49a0d83c/src/components/screens/watchlists-screen.tsx#L27-L63), [watchlist.ts](https://github.com/jacksonissacs/V_Omen_V/blob/79596c41232b092dbf5640979039d14f49a0d83c/src/lib/watchlist.ts#L14-L28).
- **Evidence:** [return-following-1440.png](https://github.com/jacksonissacs/V_Omen_V/blob/1fa914127bf6bb56978eb8debe7fcd61eb645734/docs/release-qa/d1-2026-10-07/browser/return-following-1440.png).
- **Empty / failure:** “Nothing followed” and “Open an event and follow it to pin it here.” An id missing from the book stays listed as “Event not in the current book.”

## 6. Archive checkpoint

- **Intent:** Open the stored publication checkpoint for this question.
- **Route / control:** On the brief, “Open recorded history” → `/archive?event=evt-gemini-4-public-2026-10-31` (`buildArchiveHref`). More → Archive is `/archive` with no event id. The proof request was `/archive?event=evt-gemini-4-public-2026-10-31`, and the page settled on `/archive?event=evt-gemini-4-public-2026-10-31&checkpoint=1`. “Return to present” leaves the checkpoint view.
- **Success:** “Historical checkpoint view · not the current record”. “Verified checkpoint #1 · id 1”. Status in the checkpoint is `active`. Headline probability 94.5%. Previous observation “None recorded”. Summary says no move log is recorded.
- **Boundary:** Checkpoint membership in PostgreSQL. This is a published history snapshot of an unresolved question (deadline Nov 1 2026, status `active`). It is not a resolved outcome and it is not the current brief. The sentence “the live event record” in the note means that current record, which stays outside the replay until Return to present. The brief separately says the observation is “not a live feed”.
- **Source:** [archive-url.ts](https://github.com/jacksonissacs/V_Omen_V/blob/79596c41232b092dbf5640979039d14f49a0d83c/src/lib/archive/archive-url.ts#L1-L6), link [event-intelligence-view.tsx](https://github.com/jacksonissacs/V_Omen_V/blob/79596c41232b092dbf5640979039d14f49a0d83c/src/components/intelligence/event-intelligence-view.tsx#L106-L108), [archive/page.tsx](https://github.com/jacksonissacs/V_Omen_V/blob/79596c41232b092dbf5640979039d14f49a0d83c/src/app/%28workspace%29/archive/page.tsx), note [archive-view.tsx](https://github.com/jacksonissacs/V_Omen_V/blob/79596c41232b092dbf5640979039d14f49a0d83c/src/components/archive/archive-view.tsx#L687-L704).
- **Evidence:** [return-archive-1440.png](https://github.com/jacksonissacs/V_Omen_V/blob/1fa914127bf6bb56978eb8debe7fcd61eb645734/docs/release-qa/d1-2026-10-07/browser/return-archive-1440.png). Matrix row 5.
- **Empty / failure:** “No published history checkpoints are recorded for this event yet.” Demo storage: “Stored reconstruction is not available from this storage mode.” `?at` or `?cutoff` on `/archive` is Historical view unavailable.

## Two distinctions

**Following is this browser, not an account.** The visible page says “Saved in this browser.” The button’s sync warning is its `title`, not its label. Nothing in this path writes a user id. Account sync is not built, and this map does not propose it.

**Archive is checkpoint history, not a resolved event.** The checkpoint status is `active`. Following’s “open event” subtitle is a mapper label. One observation means there is no recorded move. Return to present is how the user gets back to the current brief.

## Weakest transition

**Opening the brief on a phone does not reveal the next three controls.**

At 390×844 the committed shot [brief-evidence-390.png](https://github.com/jacksonissacs/V_Omen_V/blob/1fa914127bf6bb56978eb8debe7fcd61eb645734/docs/release-qa/d1-2026-10-07/browser/brief-evidence-390.png) shows the question, the full resolution-criteria paragraph, then “Current probability 94.5%” and “Previous observation / None recorded”. The bottom nav covers the Change row. Inspect evidence, Follow, and Open recorded history are not in that viewport. Source names are not in it either.

Those controls are rendered after the criteria paragraph ([event-intelligence-view.tsx](https://github.com/jacksonissacs/V_Omen_V/blob/79596c41232b092dbf5640979039d14f49a0d83c/src/components/intelligence/event-intelligence-view.tsx#L75-L109)). The 8/8 evidence row passed only because [capture-evidence-section.mjs](https://github.com/jacksonissacs/V_Omen_V/blob/1fa914127bf6bb56978eb8debe7fcd61eb645734/docs/release-qa/d1-2026-10-07/harness/capture-evidence-section.mjs) scrolled `#event-evidence` afterward. The [review clearance](https://github.com/jacksonissacs/V_Omen_V/pull/34#issuecomment-6045259279) says the unscrolled 390 shot is insufficient by itself.

Desktop Pulse already shows View brief, Inspect evidence, and Follow on the card. The break is the phone brief, which is the step between Discover and evidence, Follow, and Archive.

## Proposed Task 14

Not approved. Not implemented in this pull request.

**Change:** In `event-intelligence-view.tsx`, render the existing action row (Inspect evidence, Follow, Open recorded history) immediately after the question and before the resolution-criteria paragraph. Keep the full criteria text on the page. Do not add a route, an account, a second observation, or a move log.

**Acceptance:**

1. At 390×844, the first viewport of a brief whose resolution criteria is as long as the paragraph in `brief-evidence-390.png` shows “Inspect evidence”, “Follow” or “Following”, and “Open recorded history” with no pre-scroll.
2. That same document still contains the full resolution-criteria text below those controls.
3. Inspect evidence still scrolls to `#event-evidence`; Open recorded history is still `buildArchiveHref(eventId)` (`/archive?event=<id>`); Follow still writes only `localStorage` key `omen-v0-following/v1/<storage>`.

## Next move

The owner decides whether to merge reviewed draft PR [#34](https://github.com/jacksonissacs/V_Omen_V/pull/34). This map does not approve that merge, does not deploy, and does not start Task 14. Until #34 is on `main`, the journey above is candidate evidence only.
