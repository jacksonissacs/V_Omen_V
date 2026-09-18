# OMEN product vision

OMEN is an **agentic event-intelligence and prediction operating system**.

It sits at the intersection of four products operators already live in:

| Reference | What OMEN takes from it |
| --- | --- |
| **Cursor** | Agentic workflow: the system does the reading, linking, and first-pass reasoning so a human can decide. |
| **Bloomberg Terminal** | Density, latency, and a keyboard-first surface for markets and events. |
| **Palantir** | Entity graphs, evidence, and an audit trail from claim → source. |
| **Linear** | Craft, restraint, and operational rhythm. Nothing decorative. Everything addressable. |

## Problem

Important events do not arrive as clean headlines. They arrive as fragments: a license rule, a yield print, a shipping premium, a rumor that later becomes a filing. Analysts, operators, and investors then reconstruct the same picture in private notes, chat threads, and spreadsheets.

That reconstruction is slow, inconsistent, and hard to revisit. When a probability moves, the question is rarely “what is the number?” It is:

1. **What changed**
2. **When it changed**
3. **How large and how significant the change is**
4. **What likely caused it**
5. **What evidence supports or contradicts the move**
6. **What remains uncertain**
7. **Which events and markets are related**
8. **Which historical analogues apply**
9. **How previous expectations evolved**

OMEN exists to make that reconstruction a first-class, shared object.

## Who it is for

The first user is a **decision-maker who already tracks a book of events**: a policy desk, a corporate strategy team, a multi-strategy research pod, a supply-chain war room. They do not need another news feed. They need a live model of *what matters, why the view moved, and how confident that view should be*.

OMEN is not a consumer news app and not a prediction-market casino. Markets are one evidence class, not the product.

## Product principles

1. **Ownership of the question.** Every event is a resolvable question with a probability, a clock, and an owner of record (later: a human or an agent).
2. **Evidence before narrative.** A claim without a source is displayed as speculation. A move without a cause list is incomplete.
3. **Uncertainty is a feature.** Remaining unknowns are visible, ranked, and revisited — not buried under a point estimate.
4. **Graphs, not folders.** Events, entities, regions, and markets share a relationship layer. Navigation is by link, not by silo.
5. **Keyboard-first, monochrome, dense.** The visual system stays out of the way. Contrast encodes importance. Color is not required to read a move.
6. **Agents are coworkers, not oracles.** Future agents ingest, score, and propose; they do not silently overwrite a human view.
7. **No payments, identity theater, or paid APIs in the foundation.** The core must be useful on mock and first-party data before any commercial surface exists.

## The unit of work

The atomic object is an **intelligence event**:

- a question
- a current and previous probability
- a significance rating
- a change log
- causes with confidence
- evidence with stance and reliability
- uncertainty factors
- related events and markets
- historical analogues
- an expectation path (how the implied view evolved)

Around that object, OMEN presents three daily surfaces:

- **Feed** — what moved, in order, with size.
- **Event** — the full reconstruction of one question.
- **Graph** — how questions, entities, and markets connect.

A command palette reaches any of the three without leaving the keyboard.

## What OMEN is not (yet)

- A brokerage, exchange, or wallet.
- A production identity or billing system.
- A live news firehose or paid market-data terminal.
- An automated trading engine.

Those may appear later. They are not the founding product. The founding product is a trustworthy *operating picture* of important events.

## Success

OMEN is working when a user can open an event after being away for a day and, in under a minute, answer: what moved, why we think it moved, how sure we are, what would change our mind, and what else in the book is now in play.
