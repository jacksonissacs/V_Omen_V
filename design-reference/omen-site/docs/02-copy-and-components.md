# OMEN landing — final copy and component inventory

## Copy (as shipped in `index.html`)

### Top bar
Demo · Pulse · Archive · Ledger · Methodology · FAQ · **Request access**

### Hero
**Every probability, with its history.**
OMEN records what the world expected, when it expected it, and why that changed. Watch a probability move, inspect the evidence behind the move, and rewind to see exactly what was known at any moment.
[Request access] [Explore the demo]
The demo below uses illustrative data. Nothing on this page is a live feed or a performance claim.

### Product preview (`#demo`)
**One event, read the way OMEN reads it**
A single market as it appears in the workspace: the probability now, how far it moved, when it was observed, what evidence arrived, and how much of the move is actually explained.

Legend — Probability: The current consensus, to one decimal, in tabular figures. · Movement: Change since the start of the window, with its size in standard deviations and duration. · Timestamp: Every number carries the exact moment it was observed. · Evidence: Signals and sources in the order they arrived, with the identified catalyst marked. · Uncertainty: OMEN's own estimate with a band, the explained share of the move, and identification confidence.

### Walkthrough (`#walkthrough`)
**Observe a move, inspect the evidence, rewind** — The same card, used the way an analyst uses it. Pick a step; the card updates.
1. **Observe a move** — At 14:30 the probability of an October cut jumps from 61% to 74% in eighteen minutes. OMEN flags it as a 4.7σ move and highlights the window.
2. **Inspect the evidence** — The evidence list shows what arrived and when: the CPI release, currency and yield reactions, related markets. The catalyst is marked, and the move is split into explained and unexplained parts.
3. **Rewind** — Drag the timeline back. The probability, the evidence list and the headlines all revert to what was actually known at that minute — nothing from the future leaks in.
Hint: Keyboard: arrow keys switch steps; the timeline slider responds to arrow keys and touch.

### Pulse (`#pulse`)
**Pulse** — What changed in the world's expectations today, ranked by how unusual the change was — not by how loud the headline was.
- Every move is sized in standard deviations against that market's own history, so a two-point move in a quiet market can outrank a ten-point move in a noisy one.
- Each move carries a primary catalyst, the share of the move it explains, and a confidence level for that identification.
- Silence is a signal too: when a market historically reacts to a shock and doesn't, Pulse says so.

### Archive (`#archive`)
**Archive** — Reconstruct the information environment at any moment: the probabilities as they stood, the headlines that existed, the evidence that had arrived — and nothing that came later.
- Every observation is stored with the instant it was first seen, so "what did we know at 14:33?" has a precise answer.
- Point-in-time views are built from those observations, never back-filled from later data.
- Rewind any event in Pulse; the same view is available across every market OMEN follows.

### Ledger (`#ledger`)
**Ledger** — Who predicted what, when they predicted it, and how it turned out. A public record of calibration for institutions, models, aggregates and individuals.
- Forecasts are scored only after resolution, against the probability that was recorded at the time — not a later revision.
- Calibration and Brier score sit side by side, with coverage so a good score on ten forecasts is not mistaken for a good score on a thousand.
- Every row opens the evidence that was available when the forecast was made.

### Relations (`#relations`)
**How the three fit together** — Pulse notices, Archive remembers, Ledger keeps score. Relations between markets are measured from the archive, and a missing reaction is surfaced in Pulse.
Diagram nodes: Pulse (flags abnormal moves) → Archive (keeps every observation) → Ledger (scores on resolution); Archive ↓ Relations (measured co-movement) ↺ Pulse (missing reaction). Caption: Every arrow carries a timestamp; nothing is back-filled.
Card: Expected reaction missing — Canadian housing correction by Q2 2027 — Historically this market moves with Bank of Canada rate surprises in 78% of comparable shocks. No meaningful movement detected 26 minutes after today's repricing. Possible reasons OMEN lists rather than guesses: pricing lag · different interpretation · liquidity · relationship breakdown.

### Methodology (`#methodology`)
**Methodology** — OMEN's job is to make a claim and show how sure it is. These are the terms used throughout the product, and what they do and don't mean.
Attribution is statistical, not editorial. A catalyst is identified by timing, by the market's historical response to the same class of event, and by co-movement in related markets. The result is always a share of the move, never the whole of it.
- Explained share / Identification confidence / Source tiers / Historical analogues / OMEN estimate / Point in time — definitions as in `index.html`.
- **What OMEN does not claim:** that a catalyst caused a move; that its estimate beats the market; that any figure on the page is live; any guarantee about record immutability beyond what is documented.

### FAQ (`#faq`) — six questions, answers in `index.html`.

### Final CTA
**See what the world expected, and why it changed its mind.**
Early access is open to a small number of teams. Tell us what you would use OMEN for and we'll be in touch.

### Request-access dialog
Request access — Early access is limited. Leave a work email and a line about what you'd use OMEN for. · Work email · What would you use it for? (optional) · "Demo: this form does not send anything yet." · Cancel / Send request · Success: "Request noted. In the demo nothing is sent; in production this confirms the request was received." · Error: "Enter a valid email address."

### Footer
Placeholder social slots · OMEN symbol + wordmark · Pulse / Archive / Ledger / Methodology · Back to top · © 2026 OMEN. Demo data on this site is illustrative. · Privacy · Terms

---

## Component inventory

| Component | File(s) | Notes |
|---|---|---|
| `Topbar` | `.topbar`, `.brand`, `.nav`, `.nav-toggle` | Sticky, blurred graphite. Collapses to a toggle ≤720 px; Escape closes. |
| `Button` | `.btn` + `.btn-primary` / `.btn-secondary` / `.btn-sm` | Silver primary (brand), outline secondary. |
| `GlassButton` | `.glass-btn` | Dark-glass control that sits on the atmosphere (social slots, motion toggle). |
| `SpectrumStage` | `.spectrum-stage` + `js/spectrum.js` | The reference effect. Two instances: hero (`#hero-spectrum`) and footer (`#spectrum`). |
| `MotionToggle` | `.spectrum-motion`, `.motion-note` | `aria-pressed` pause/play; note shown under reduced motion. |
| `Hero` | `.hero`, `.hero-stage`, `.hero-body` | Stage fades into graphite behind the headline. |
| `Panel` / `PanelHead` | `.panel`, `.panel-head` | Prototype surface; container-query root for `EventCard`. |
| `Chip` | `.chip` (+ `.hi/.med/.lo/.demo`) | Category, tier, confidence, demo label. |
| `EventCard` | `renderCard()` in `site.js`; `.event-card`, `.readout`, `.chart`, `.ev-list`, `.unc`, `.rewind` | One renderer, three modes: preview (`step 0`), steps 1–2, rewind (`step 3`). |
| `ProbabilityReadout` | `.prob-xl`, `.move`, `.stamp` | Plex Mono, tabular figures, decimal + % de-emphasised. |
| `ProbabilityChart` | `chartSVG()` | Consensus line, OMEN estimate (dashed) with ± band, move window, future mask, cursor. |
| `EvidenceList` | `.ev-list` | Catalyst highlighted; future items dimmed (steps 1–2) or hidden (rewind). |
| `UncertaintyBlock` | `.unc`, `.bar` | Estimate ± band, explained/unexplained bar, identification confidence, analogues. |
| `RewindScrubber` | `.rewind`, `input[type=range]` | Native range input; `aria-valuetext` carries time + probability. |
| `Legend` | `.legend` | Five definitions under the preview. |
| `Steps` | `.steps`, `.step` | `role=tablist/tab`; arrow-key navigation. |
| `PulseRow` | `.pulse-row` | Move, σ, catalyst, explained %, "expected reaction missing" state. |
| `PointInTime` | `.pit` | Archive snapshot: consensus then, estimate then, headlines, evidence so far. |
| `LedgerTable` | `.tbl`, `.cal` | Calibration bar, Brier, coverage, scored; coverage column hides ≤720 px. |
| `FlowDiagram` | `.flow` (inline SVG) | Pulse → Archive → Ledger / Relations. |
| `MissingReactionCard` | `.missing` | Warn-tinted chip + reason tags. |
| `MethodologyTerms` | `.method dl`, `.not` | Definition grid + "does not claim" list. |
| `FAQ` | `.faq details` | Native disclosure; plus/close indicator rotates. |
| `FinalCTA` | `.final` | |
| `AccessDialog` | `dialog.access`, `.field` | Native `<dialog>`; validation, success state; returns focus to opener. |
| `SpectrumFooter` | `css/spectrum.css` | Reference-derived footer. |
