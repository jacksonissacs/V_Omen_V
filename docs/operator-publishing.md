# Private operator publishing (V0)

Operators publish sourced evidence and authored Move Logs through a **private CLI**. There is no public write API, no admin UI, and no authentication in V0.

All durable writes still go through the canonical `writeEventBundle` path in `src/lib/db/event-store.ts`, which commits history and then publishes a verified `history_checkpoints` row. The operator layer adds:

- a **source review queue** (`source_review_items`) for staged intake;
- **durable publication operations** (`publication_operations`) with idempotency keys and `checkpoint_pending` retry;
- validation that Move Logs separate observed change, cited evidence, interpretation, and what remains unknown.

See [database.md](database.md) for schema details.

## Commands

Requires `DATABASE_URL`, a database identified as `development`, `test`, or `demo`, and the same production guards as `npm run db:*`.

```bash
# Review queue
npm run operator -- review list --status staged
npm run operator -- review show <id>
npm run operator -- review approve <id> --by "Operator Name" [--note "…"]
npm run operator -- review reject <id> --by "Operator Name" [--note "…"]

# Stage intake (JSON shape documented below)
npm run operator -- intake stage --file intake.json

# Publication
npm run operator -- publish preview --file bundle.json
npm run operator -- publish run --file bundle.json --idempotency-key <unique-key>
npm run operator -- publish approved --review-item <id> --idempotency-key <unique-key>
npm run operator -- publish retry --idempotency-key <unique-key>
npm run operator -- publish status --idempotency-key <unique-key>

# Checkpoint integrity
npm run operator -- checkpoint verify --id <checkpointId>
```

`npm run db:upsert` remains available for fixture bundles. Prefer `operator publish` when you need review metadata, idempotency, or retry after a checkpoint failure.

## Intake JSON

```json
{
  "id": "src-unique-id",
  "eventId": "evt-boc-cut",
  "stagedBy": "operator.name",
  "intakeNote": "optional",
  "candidate": {
    "kind": "evidence",
    "evidence": { }
  }
}
```

`candidate.kind` may be `evidence`, `move_log`, or `bundle`. Move Log candidates use explicit sections:

| Field | Stored as |
| --- | --- |
| `observedChange` | `what_changed` |
| `citedEvidenceIds` | `evidence_ids` (must exist on the same event at publish time) |
| `interpretation` | `likely_cause` |
| `remainsUnknown` | `unexplained_factors` |
| `explainedPct` | optional; omit or `null` when no defensible share is recorded |

Every Move Log revision requires an `author`. Corrections (`version > 1`) require a `correctionNote`.

## Disposable demonstration

```bash
npm run db:migrate -- --identify development --label "operator demo"
npm run db:upsert -- --file db/fixtures/demo-evt-boc-cut.json
npm run operator -- intake stage --file db/fixtures/operator-intake-evidence.json
npm run operator -- review approve src-boc-evidence-demo --by "Demo Operator"
npm run operator -- publish approved --review-item src-boc-evidence-demo --idempotency-key demo-evidence-1
OMEN_STORAGE_MODE=database npm run dev
```

After publishing, open Pulse and the event detail route for the target event. Corrections are new move log revisions; earlier checkpoints stay verifiable with `checkpoint verify`.

## Known limitations

- Review and publication metadata are operator tooling tables, not exposed in the workspace UI.
- Following persistence is browser `localStorage` only; there is no per-user server watchlist.
- Simulated checkpoint failures in tests use a mocked publisher; production retry depends on PostgreSQL availability at publish time.
- Intake does not fetch remote URLs; operators paste normalized fields.
