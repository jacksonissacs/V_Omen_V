# Remaining limits after the 2026-10-07 rerun

No product failure was observed on the eight checks. These limits stay visible in the stored record.

- `observedAt` `2026-10-07T14:50:34.604Z` is gamma market `3584362` field `updatedAt` `2026-10-07T14:50:34.604743Z`, truncated by the existing millisecond parser. It is the update clock on the same object as `outcomePrices`. It is not a last-trade time. `lastTradePrice` is 0.94 and has no timestamp. The same `updatedAt` string is on other markets in that response that have different prices. An earlier gamma body for this market had the same Yes price `0.945` and `updatedAt` `2026-10-07T14:20:36.391848Z`, so this clock is not the moment 94.5 began.
- OMEN `firstObservedAt` and `capturedAt` are local body-receipt clocks from `receipt/`. They are not HTTP Date. The gamma response was `cf-cache-status: HIT` with `age: 142`. The receipt clock is when this process received the body.
- Google `sourcePublishedAt` is `datePublished` `2026-09-30T20:00:00Z`. Polymarket rows leave `sourcePublishedAt` null.
- Evidence reliability is null. The panel says “Not recorded”. No score was invented.
- There is one observation, so change is not computable. There is no move log and no explained share.
- The public page embed showed `outcomePrices` 0.95 and 0.06 and no `updatedAt`. That embed is not the stored probability.
