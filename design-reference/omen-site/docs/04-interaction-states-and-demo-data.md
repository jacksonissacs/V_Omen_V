# Interaction states and demo data

## Interaction states

| Component | Default | Hover | Active / pressed | Focus-visible | Disabled | Other |
|---|---|---|---|---|---|---|
| `.btn-primary` | silver-0 bg, bg-0 text | #FFFFFF | silver-1 | 1.5 px `--border-focus` ring, 2 px offset | opacity .45, not-allowed | — |
| `.btn-secondary` | transparent, border-2 | bg-2, border .22 | bg-3 | same ring | same | — |
| `.glass-btn` | rgba(8,8,10,.62) glass, border .14 | .78 glass, border .24 | .85 | same ring | — | `.spectrum-motion[aria-pressed=true]` swaps label to "Play motion" |
| Nav link | tx-1 | tx-0 | — | ring | — | mobile: full-width rows, Escape closes menu, `aria-expanded` on toggle |
| `.step` (tab) | transparent | bg-1 | — | ring; roving `tabindex` | — | `aria-selected=true`: bg-1 + border-1, number in accent |
| Range slider | 3 px track bg-3, 16 px silver thumb | — | — | ring 4 px offset | — | `aria-valuetext` = "14:33, 67.9 percent" |
| FAQ summary | tx-0 | silver-0 | — | ring | — | `[open]`: plus becomes minus |
| Text input | bg-0, border-1 | border-2 | — | border-focus + 3 px ac-dim halo | — | `aria-invalid=true`: border dn + error text |
| Dialog | hidden | — | — | first field focused on open; focus returns to opener on close | — | `.done`: form hidden, status shown, Close focused |
| Evidence row | normal | — | — | — | — | `.ev-catalyst` (accent time, tx-0 text); `.future` (opacity .28); `.hidden` (rewind) |
| Chip | bg-0, border-0 | — | — | — | — | `.hi/.med/.lo` dot colour; `.demo` warn tint |
| Ledger row | — | — | — | — | — | calibration bar width = value |

Keyboard map: Tab through topbar → hero CTAs → hero motion toggle → preview → step tabs (arrows move + select) → rewind slider (arrows / Home / End) → sections → FAQ (Enter/Space) → final CTAs → footer social → footer motion toggle → footer links → Back to top. Escape closes the mobile menu and the dialog.

Touch: all controls ≥ 32 px tall (glass buttons 34 px, slider thumb 16 px on a 24 px hit area, steps are full-width). No hover-only content.

## Deterministic demo data (`js/demo-data.js`)

All values are illustrative and carried over from the workspace prototype's sample event.

- **Event**: "Bank of Canada cuts rates in October", Macro, resolves Oct 29 2026, observed Sep 10 2026 (EDT).
- **Series**: 61 points, one per minute 14:00–15:00. Flat ≈ 61.2 % until 14:29; move 14:30–14:40 (61.2 → 73.8); flat ≈ 73.8 % after. Each point carries `p` (consensus), `est` (OMEN estimate) and `band` (±).
- **Move**: +12.6 pts, 4.7σ over 18 min. Explained 69 % / unexplained 31 %. Identification confidence 89 %. Data quality High. Analogues n = 41, median +8.9 pts, median lag 1m 42s.
- **Evidence**: 7 timestamped entries from 14:30:00 (catalyst) to 14:38:42.
- **Archive snapshots**: three headline sets keyed by minute index (≤ 29, ≤ 34, ≤ 60).
- **Pulse**: three rows including one "expected reaction missing" state.
- **Ledger**: four rows (aggregate, institution, individual, model) with calibration, Brier, coverage, scored count.
- **Relation**: 78 % historical co-movement, 26 min elapsed, no movement observed.

Derived, not stored: movement = `S[idx].p − S[0].p`; evidence visibility = `evidence.t ≤ S[idx].t + ':59'`; chart future mask = points after `idx`.

Default states: preview `idx = 60`; walkthrough steps 1–2 `idx = 60`; step 3 opens at `idx = 34` (14:34, mid-move) and remembers the last scrubbed minute.
