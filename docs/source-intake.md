# Source intake

Operator-run intake for one official technology catalog. It stages a local review queue. It does not publish evidence, create events, assign probabilities, or run on a schedule.

The command is `npm run intake`. There is no HTTP endpoint and no URL argument. The only request target is the allowlist in `src/lib/intake/source.ts`.

## Source

[CISA Known Exploited Vulnerabilities](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) JSON catalog:

`https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json`

Checked on 26 September 2026:

- The [KEV license](https://www.cisa.gov/sites/default/files/licenses/kev/license.txt) says the database is distributed under CC0 1.0. CISA's notice also says third-party links inside the catalog are covered by those sites' own terms, and that use of the data is not permission to use the CISA or DHS marks or to imply endorsement.
- A GET of the JSON URL returned HTTP 200, `content-type: application/json`, 1,752,832 bytes, and no redirect. The document was `catalogVersion` `2026.09.25`, `dateReleased` `2026-09-25T18:58:16.5029Z`, and 1,726 entries.
- The HTML catalog page and the JSON schema URL returned HTTP 403 to this client. This pipeline does not fetch either one.
- No account, API key, or payment is required for the JSON document.

CC0 covers CISA's catalog. It does not cover the vendor and NVD URLs in each entry's `notes` field. Those URLs are not stored and are not requested.

`dateAdded` is a calendar date (`YYYY-MM-DD`). It is not a clock time. The catalog-level `dateReleased` timestamp is not copied onto entries. An entry's `sourcePublishedAt` stays null. When `dateAdded` is missing, `sourcePublishedDate` stays null as well.

## What a staged item holds

| Field | Meaning |
| --- | --- |
| `sourceId` | `cisa-kev` |
| `sourceItemId` | CVE id |
| `canonicalUrl` | The official JSON document, with the CVE id as the fragment |
| `title` | Sanitized `vulnerabilityName` |
| `excerpt` | At most 400 characters of sanitized `shortDescription` |
| `sourcePublishedAt` | Clock time stated by the source. Always null for this feed |
| `sourcePublishedDate` | `dateAdded` when it is a real calendar date, otherwise null |
| `firstFetchedAt` | When OMEN stored this version |
| `contentIdentity` | SHA-256 of the captured fields, including the sanitized description up to 2,000 characters |
| `candidateEventId` | From an operator match rule or a later selection. May be null |
| `version` | Starts at 1. A changed identity appends a new version and leaves the old one |

Vendor and product are stored so a match rule can name them. `notes`, `requiredAction`, `dueDate`, ransomware use, and CWE ids are not stored. A change that touches only those omitted fields does not create a new version. Description changes past the first 2,000 sanitized characters are not distinguished.

Source text is untrusted data. Tags and script blocks are stripped before anything is stored. The text is never evaluated and never treated as operator instructions.

## What a refresh does

`npm run intake -- refresh` sends one GET, with a descriptive User-Agent. Limits, all stricter than a general crawl and all local policy:

- 10 second timeout
- 3 MB response cap
- at most 2 retries, and only for a dropped connection or HTTP 408/500/502/503/504
- HTTP 429 is reported as `rate_limited` and is not retried
- at most 2 redirects, each of which must stay on `https://www.cisa.gov` and the catalog path
- DNS answers are refused when any address is loopback, private, link-local, or otherwise non-public
- at least 60 seconds between refresh requests
- at most 20 entries with the newest `dateAdded` (override with `--limit`, hard cap 40). The same calendar date keeps the catalog's own order. Undated entries come after dated ones.

The queue file is `.omen/intake/queue.json`. That directory is gitignored. A damaged queue file is left in place.

Refresh refuses to run when `NODE_ENV`, `VERCEL_ENV`, or `OMEN_DEPLOYMENT_ENV` is `production`.

Nothing in the app starts this command. Do not put it on a timer.

## Review

Configured matches live in `config/intake-matches.json`. The committed file has no rules. A rule is an exact, case-sensitive vendor and optional product, plus an existing event id. Source text is not compiled as a pattern. Two rules that name different events for the same vendor and product leave the item unassociated.

```json
{
  "rules": [
    {
      "sourceId": "cisa-kev",
      "vendorProject": "Example Vendor",
      "product": "Example Product",
      "eventId": "evt-example-question"
    }
  ]
}
```

A configured match fills `candidateEventId` and leaves `reviewState` as `pending`. It does not check that the event exists, and it does not create one. Creating an event would require a real attributed probability observation. This feed does not provide one, and the command will not invent one.

```bash
npm run intake -- list
npm run intake -- list --state pending
npm run intake -- show --item cisa-kev-cve-2026-67279-v1
npm run intake -- select --item cisa-kev-cve-2026-67279-v1 --event evt-example-question
npm run intake -- reject --item cisa-kev-cve-2026-67279-v1
```

`select` confirms an association inside the queue. `reject` keeps the captured text and marks it rejected. Neither command writes `events`, `probability_observations`, `evidence`, or `move_logs`.

Publishing evidence is a separate decision. `npm run operator -- intake import` copies one **selected** queue version into `source_review_items` for an event that already exists. The review item stays `staged`. It does not approve the item, publish evidence, create an event, or record a probability. `dateAdded` stays in `source_published_date`. `sourcePublishedAt` stays null unless the source stated a clock time.

The same source id, item id, and captured version always map to one review item. Importing that version again does not create a second row and does not copy approval onto a newer version. A rejected queue version is not published, including when the caller still holds an approved object from before the rejection. A changed catalog identity is a new version and starts `staged`.

Approving a capture requires an explicit stance and reliability. Those values are not filled in by import. Publication then uses `publishEventBundle` / `writeEventBundle`. See [operator-publishing.md](operator-publishing.md).

A later refresh that sees the same content identity reports a duplicate and does not rewrite the stored version, including one that was selected or rejected. A new content identity appends the next version, leaves the earlier version as it was, and puts the new version back in `pending`.

`list` prints `publication time unknown` when the source gave no date, and `YYYY-MM-DD (time not stated)` when it gave only a calendar date.

## Failures

The refresh report uses `malformed`, `unavailable`, `rate_limited`, `too_large`, or `blocked_target`. A failed refresh does not drop versions already in the queue. An entry with a bad CVE id or an unparseable `dateAdded` is skipped and named; the rest of a valid document can still stage.

## Live check

`npm test` does not open the network. The deterministic tests inject the catalog body and the HTTP client.

`npm run intake:check` performs one real GET and prints the catalog version, entry count, and newest CVE id. It does not write the queue. Run it by hand when you want to confirm the feed is still the document this adapter expects. Do not loop it.

## Not included

- No second source, no arbitrary URL, and no crawler
- No unattended job and no production write
- No automatic publication, probability, or event resolution. Import only stages a selected version
- No fetch of third-party `notes` links
- The DNS check happens before connect and does not close a rebinding window between the two
