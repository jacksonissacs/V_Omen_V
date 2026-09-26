# OMEN AI-first beta scope

Owner-approved product scope for the beta after V0 foundation work on `main`. This document does not authorize implementation by itself; it tells agents and reviewers what to build next and what stays out of scope.

## Coverage order

Launch and iterate in this order:

1. **AI and technology**, led by **North America**: United States, Canada, and relevant Mexico coverage.
2. **China and Europe** AI and technology (dedicated coverage, not only spillover).
3. **Crypto**.
4. **Prediction markets**.
5. **Entertainment and media**.
6. **Broader business** — broader **non-AI** business coverage (industrial, consumer, macro, and similar) after the verticals above.

Material international developments that **materially affect North America** remain eligible at launch even when the primary region is elsewhere.

**AI-related business** (policy, capital, supply chain, competition, safety regulation, enterprise adoption, and similar) belongs in the **launch AI and technology slice** from day one — not deferred to stage 6.

## Core invariants (unchanged)

The product core stays:

- **Evidence** with explicit source attribution.
- **Interpretation** that is visibly attributed (human or agent), not presented as fact.
- **Corrections** as new visible versions, not silent edits.
- **Recorded checkpoint history** for verified reconstruction (see [database.md](database.md)).

Demo versus sourced provenance, the server data boundary, and production guards in [omen-v0-build-contract.md](omen-v0-build-contract.md) still apply.

## Tracked questions versus developments

Today, the storage model centers on **tracked questions**: resolvable questions with probabilities, deadlines, and append-only move history. Existing validation and constraints stay in force until a dedicated migration and task say otherwise.

The owner authorizes a **future** record type, **`observed_development`**, for material developments that should be recorded in OMEN **without**:

- a forecasting probability,
- a resolvable forecasting question, or
- an artificial resolution deadline.

Examples at the policy level (not implemented here): a regulatory framework shift, a major model release with operational impact, or a supply constraint that matters to the book but does not yet map cleanly to a single yes/no question.

Until that type is implemented:

- Do not weaken the “every event must have at least one observation” rule or other tracked-question checks.
- Do not fabricate probabilities or deadlines to store a development.
- Tasks that introduce `observed_development` must include schema, write-path, read-path, and test plans, and must remain nonproduction.

## Explicitly out of scope for agent tasks (unless the owner says otherwise)

- End-user **accounts**, **billing**, and **entitlements**.
- **Trading**, wallets, or brokerage surfaces.
- **Autonomous publishing** (agents may propose; humans or the existing operator publish path remain in control).
- **Production** database operations, deployments, or secrets.
- Vertical implementations **beyond** the current task’s slice of the coverage order above.

## Relationship to V0 loop documentation

[omen-v0-build-contract.md](omen-v0-build-contract.md) still describes the **event → evidence → Move Log → historical reconstruction** loop that V0 proved on `main`. Beta work extends **what** is covered first and **which record shapes** may appear next; it does not relax data honesty, checkpoint semantics, or approval gates.

## Agent workflow

Every implementation task must follow [mobile-agent-playbook.md](mobile-agent-playbook.md): branch hygiene, verification, and honest reporting.
