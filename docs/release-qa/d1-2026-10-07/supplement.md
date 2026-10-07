# Evidence supplement after head 484704b

Tested code SHA remains `79596c41232b092dbf5640979039d14f49a0d83c`. This commit adds the missing receipt body and scrolled evidence screenshots. It does not change product code and does not rerun the eight-command suite. Independent clearance is still pending.

## Polymarket HTML body

`receipt/poly.body.html` is a byte copy of the original recapture `/tmp/omen-d1-receipt/poly.body`. That file’s mtime is 2026-10-07 14:53:52 UTC, the same instant as `receipt/poly.receipt.json` `bodyReceivedAt` `2026-10-07T14:53:52.306Z`. It was not fetched again.

- bytes: 1,128,174
- sha256: `0f4b9da60bd733965dcefdbc39b097ea1b2cb434245b35639e3a583d98cd42d1`

`docs/release-qa/d1-2026-10-07-blocker/sources/poly.html` is the earlier page body (1,127,670 bytes, sha256 `2caebf18ded4d24d3261a89c74ee9b3e8b2f6d1a6478196e0dead65592c0a435`). It is not this receipt.

Google HTML already stored at `docs/release-qa/d1-2026-10-07-blocker/sources/google.html` matches `/tmp/omen-d1-receipt/google.body` exactly: sha256 `690b84699965b25fc0ee94f95806834425c3f2041fd51d7a86d7ca0ba6141aa8`. Gamma `receipt/gamma.body.json` matches sha256 `af1f396b668acab4335bc18d62b0d220622f6bb58e8695f77f3fdbd6c93ba99a`.

## Scrolled evidence section

Captured on the already-running production server of SHA `79596c41232b092dbf5640979039d14f49a0d83c` (`next start` at `http://127.0.0.1:3210`).

- Page: `http://127.0.0.1:3210/events/evt-gemini-4-public-2026-10-31`
- Harness: `harness/capture-evidence-section.mjs`
- Viewports: 390×844 and 1440×900
- Report: `browser/evidence-section/report.json`

Source URLs asserted as `href`s inside `#event-evidence`:

- `https://gamma-api.polymarket.com/events?slug=gemini-4pt0-released-by-june-30-2026`
- `https://polymarket.com/event/gemini-4pt0-released-by-june-30-2026`
- `https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-argon/`

After scrolling each evidence item to the top of the 390 viewport, visible text included:

| Shot | Visible source name | Publication | Reliability | Provenance |
| --- | --- | --- | --- | --- |
| `browser/evidence-section/evidence-390-polymarket-gamma-api.png` | Polymarket gamma API | Not stated by source | Not recorded | Sourced data |
| `browser/evidence-section/evidence-390-polymarket.png` | Polymarket | Not stated by source | Not recorded | Sourced data |
| `browser/evidence-section/evidence-390-google-blog.png` | Google blog | 30 Sept, 20:00 UTC | Not recorded | Sourced data |

`browser/evidence-section/record-390-sourced.png` is the Record tab at 390×844. Event record reads Sourced. `browser/evidence-section/evidence-1440-viewport.png` is the same page at 1440×900 after scrolling `#event-evidence` into view; Polymarket gamma API, Not stated by source, and Not recorded are in that viewport.

`browser/brief-evidence-390.png` is the earlier unscrolled brief viewport and stops before the source names. `evidence-390-panel.png` and `evidence-1440-panel.png` are element screenshots clipped to the viewport; the named-source proof is the three scrolled 390 shots plus the 1440 viewport shot.
