# D1 candidate evidence — 2026-10-07

Tested code SHA: `79596c41232b092dbf5640979039d14f49a0d83c`

This directory is the evidence commit. It is not part of that code SHA. `main` at the start of the branch was `aea8636c555736de9d61110abc8a05a173a67d79`.

## What the code SHA contains

- Migration `0008`: `evidence.reliability` may be null. Null is not a score.
- Migration `0009`: `publication_operations.event_id` is format-checked and is not a foreign key, because the operation is reserved before the event commit.
- Migration `0010`: `source_review_items.event_id` is format-checked and is not a foreign key, so a bundle that includes `bundle.event` can be staged while the book is empty. Evidence, Move Log, and source-capture candidates still require a stored event. Source-capture approval still requires an explicit stance and reliability.
- Idempotency hashes canonical JSON, because `jsonb` does not preserve object key order.
- Operator bundle `db/operator-inputs/evt-gemini-4-public-by-2026-10-31.json` and the matching review file.

## Clocks

`receipt/` records the local process clock (`Date.toISOString`, timezone UTC) for request start, header receipt, and body receipt. Stored `firstObservedAt` and `capturedAt` are the body-receipt instants:

| Source | Body received (stored) | HTTP Date (not stored) |
| --- | --- | --- |
| Gamma API | `2026-10-07T14:53:51.789Z` | Wed, 07 Oct 2026 14:53:51 GMT |
| Polymarket page | `2026-10-07T14:53:52.306Z` | Wed, 07 Oct 2026 14:53:51 GMT |
| Google blog | `2026-10-07T14:53:52.456Z` | Wed, 07 Oct 2026 14:53:52 GMT |

`observedAt` is the October 31 market object's `updatedAt`, stored as `2026-10-07T14:50:34.604Z`. The caveat is in `defects.md` and in the observation note. Probability `94.5` is `outcomePrices` Yes `0.945` on the percentage-point scale.

`docs/release-qa/d1-2026-10-07-blocker/sources/` is the earlier fetch. Its HTTP Date values are not the stored OMEN clocks. See `superseded-http-date-capture/README.txt`.

## Operator proof

Disposable database only. No production database.

```text
npm run db:migrate -- --identify development --label "d1 receipt disposable"
npm run operator -- intake stage --file db/operator-inputs/evt-gemini-4-public-by-2026-10-31.review.json
npm run operator -- review approve src-gemini-4-public-2026-10-31 --by "omen.operator"
npm run operator -- publish approved --review-item src-gemini-4-public-2026-10-31 --idempotency-key gemini-4-public-2026-10-31-v1
npm run operator -- checkpoint verify --id 1
```

Exit codes are in `publish.log`. After stage and after approve the event count was 0. After publish: one event, probability `94.50`, checkpoint id 1 sequence 1, three null reliabilities, Google `source_published_at` set, Polymarket `source_published_at` null. Replay of the same key did not add a second checkpoint.

The database regression `stages and approves a previously absent event, then publishes and retries the checkpoint` fails the first checkpoint publish, confirms the event exists with zero checkpoints, then `retryPublicationOperation` verifies checkpoint id 1.

## Browser proof

`NODE_ENV=production` `next start` from the clean SHA.

- Database book: `127.0.0.1:3210`, `OMEN_STORAGE_MODE=database`
- Demo refusal: `127.0.0.1:3212`, `OMEN_STORAGE_MODE=demo`
- Unset refusal: `127.0.0.1:3214`

## Independent review

Review this evidence commit against code SHA `79596c41232b092dbf5640979039d14f49a0d83c`, not against `e3b0dd53f85a4e228e00f0ba397a84748f3677a9`. Do not merge or deploy from this pack. The eight-row result is in `matrix.md`.
