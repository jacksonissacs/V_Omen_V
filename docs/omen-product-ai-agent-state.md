# OMEN — Product + AI Agent State

> **Authoritative founder dashboard.** Prefer repository evidence over plans. Refresh this page when `origin/main` moves meaningfully.

| Field | Value |
| --- | --- |
| **Audit date** | 2026-09-28 |
| **Main SHA** | `b51a8b8304c3a9f9132068efe8debfddb1be78c3` |
| **Open relevant PRs** | #19 (stale docs), #7 (superseded gap matrix), #20/#25/#9/#11/#14/#15/#16/#18 (mostly superseded drafts — close hygiene) |
| **Product stage** | **V0 foundation complete · Pre-private-beta** — not Prototype; not Beta-ready |

**Stage rationale (evidence, not aspiration):** The V0 loop *Event → Evidence → Published Move Log → Historical reconstruction* exists on `main` with PostgreSQL, operator publish, checkpoint Archive, consumer Pulse/Explore/Following, and honest provenance. Default storage is still demo fixtures. No accounts, no public writes, no live LLM, no multi-agent runtime. Live analyst providers are explicitly refused in this build.

---

## 1. Executive snapshot

| Dimension | Status | One-line truth |
| --- | --- | --- |
| **Consumer product maturity** | 🟡 Partially implemented | Real Pulse / Explore / event brief / browser Following; Share control missing; fixture shells still URL-reachable |
| **Data / intelligence maturity** | 🟡 Partially implemented | Strong append-only schema + checkpoints; demo book (32 events) by default; CISA intake is manual one-source prototype |
| **AI maturity** | 🟠 Early / experimental | Bounded analyst proposal **shape** exists; only synthetic provider runs; no consumer LLM |
| **Agent maturity** | 🔴 Missing / blocked | No tool-using agent, no orchestrator, no multi-agent system |
| **Backend maturity** | 🟡 Partially implemented | Excellent nonproduction Postgres + CLI write path; no prod ops, no public write API, no auth |
| **UX / design maturity** | 🟡 Partially implemented | Consumer chrome (#26/#27) shipped; marketing intact; legacy Markets/Agents/Research still look like product if deep-linked |
| **Reliability / testing maturity** | 🟡 Partially implemented | Strong unit/db/workflow suites for the recorded loop; production hosting not in scope of this audit |
| **Social layer maturity** | 🔴 Missing / blocked | Follow **events** locally only; no people graph, comments, reactions, or notifications |
| **Monetization readiness** | 🔴 Missing / blocked | Explicitly post-approval / post-V0 (billing, entitlements) |

Do **not** read UI presence as operational. Several routes render polished shells over static or fixture data.

---

## 2. Visual — “OMEN right now”

### Product system layers

```
DATA / SOURCES
  🟢 Demo fixtures (src/data/events.ts) · 🟠 Manual CISA KEV fetch · 🔴 Live multi-source feeds
        ↓
INGESTION / REVIEW
  🟡 Operator CLI + source_review_items · 🟠 Analyst propose→stage (synthetic) · 🔴 Autonomous ingest workers
        ↓
EVENT STORAGE
  🟢 PostgreSQL append-only book (when OMEN_STORAGE_MODE=database) · 🟢 Demo mock adapter
        ↓
DETERMINISTIC INTELLIGENCE
  🟢 Scoring / chronology / series assembly · 🟢 Provenance honesty · 🟠 Featured “anomaly” = seeded field pick
        ↓
AI / AGENT LAYER
  🟠 Analyst proposal CLI (L1-shaped, L0 synthetic today) · 🔴 Live LLM · 🔴 Tool agents · 🔴 Orchestrator
        ↓
EVENT / PULSE EXPERIENCE
  🟢 Pulse · 🟢 Explore · 🟢 Event brief · 🟡 Following (localStorage)
        ↓
DISCOVERY
  🟢 In-screen filters + ⌘K client index · ⚪ Repo.search()/listFeed()/getGraph() unused by UI
        ↓
ARCHIVE / MEMORY
  🟢 Checkpoint list + reconstruct (DB) · 🟡 Demo mode honestly refuses · 🔴 Arbitrary-time reconstruction (refused by design)
        ↓
SOCIAL / COLLABORATION
  🔴 Not built (Team/Alerts shells are placeholders)
        ↓
USER ACTIONS
  🟡 Follow/Unfollow · 🟡 Open history URL · 🔴 Share button · 🔴 Notify · 🔴 Account · 🔴 Predict/post
```

**Read path today:** source/fixture → repository → server page → consumer brief.  
**Write path today:** operator/analyst CLI → review → `writeEventBundle` → checkpoint — **not** end-user HTTP.

### AI architecture (actual, not aspirational)

```
                    OMEN “INTELLIGENCE” TODAY
                              │
              ┌───────────────┴───────────────┐
              │                               │
     DETERMINISTIC CORE                 ANALYST PROPOSAL
     (always on in UI)                  (operator CLI only)
              │                               │
     scoring · chronology              prompt + provider.generate()
     probability series                validate JSON
     ⌘K token search                   persist analyst_runs /
     provenance chips                    analyst_proposals
              │                               │
              │                    ┌──────────┴──────────┐
              │                    │                     │
              │             test/synthetic          live/openai/
              │             (ONLY runnable)         anthropic
              │                                     UNAVAILABLE /
              │                                     THROWS IF KEY
              │                                     PRESENT
              │                               │
              │                          human approve /
              │                          reject / stage
              │                               │
              │                     ❌ cannot auto-publish
              │                     operator must author
              │                     Move Log via publish
              ▼                               ▼
         Pulse / Brief / Archive      Review queue only
              │
            USER
```

**There is no orchestrator. There are no Discovery / Analysis / Monitoring agents in runtime.** The `/agents` screen is illustrative UI over hardcoded `ledgerCards` / `modelRankings`.

---

## 3. Complete feature inventory

Statuses: ✅ Complete · 🟡 Partial · 🟠 Prototype · ⚪ UI only · 🔴 Missing · 🚫 Intentionally post-V0

### Consumer experience

| Feature | Status | User-facing? | AI? | Agentic? | Prod-ready? | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Marketing landing `/` | ✅ | yes | no | no | demo | `src/app/(marketing)/page.tsx`, `landing-page.test.tsx` |
| Consumer nav Pulse / Explore / Following / More | ✅ | yes | no | no | no | `src/data/workspace.ts`, `app-shell.test.tsx`, PRs #26/#27 |
| Pulse feed | ✅ | yes | no | no | no | `pulse/page.tsx`, `PulseScreen`, workflow tests |
| Explore book `/events` | ✅ | yes | no | no | no | `events/(book)/page.tsx`, `EventsScreen` |
| Event brief `/events/:id` | ✅ | yes | no | no | no | `event-intelligence-view.tsx` + tests |
| Related events | ✅ | yes | no | no | no | `getRelatedEvents` |
| Follow / Following | 🟡 | yes | no | no | no | `localStorage` `omen-v0-following/v1/<storage>`; no account sync |
| ⌘K palette | ✅ | yes | no | no | no | `command-palette.tsx`, `command-index.ts` |
| Share control (T5) | 🔴 | — | no | no | no | Specified in `consumer-design-contract.md`; not in brief actions |
| Make a call modal | ⚪ | no (unwired) | no | no | no | `CallModal`; `openCall` never called |
| Settings | ⚪ | unpromoted | no | no | no | Local React state only |
| Markets / Signals | ⚪ | URL only | no | no | no | Client `@/data/events` |
| Agents / Research | ⚪ | URL only | no | no | no | Hardcoded illustrative figures |
| Relations / Graph | ⚪ | URL only | no | no | no | Static SVG; `getGraph()` unused |
| Alerts / Team / API-access | ⚪ | URL only | no | no | no | Placeholders |

### Event intelligence & archive

| Feature | Status | User-facing? | AI? | Agentic? | Prod-ready? | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Demo event book (32) | ✅ | yes | no | no | demo | `src/data/events.ts` |
| Postgres event storage | ✅ | when configured | no | no | no | migrations 0001–0007, `PostgresIntelligenceRepository` |
| Probability series honesty | ✅ | yes | no | no | no | `probability-history.ts`, event brief tests |
| Move Log + corrections | ✅ | yes | no | no | no | `move_log_revisions`, operator publish |
| Evidence with source times | ✅ | yes | no | no | no | `evidence` table + brief |
| OMEN forecast figure | 🟡 | yes if present | no | no | no | None in seed; UI only when complete forecast stored |
| Checkpoint history APIs | ✅ | via Archive/API | no | no | no | `GET .../history`, `.../history/:id` |
| Archive UI | ✅ (DB) / 🟡 (demo honesty) | yes | no | no | no | `archive-view.tsx`, PRs #17/#21/#23 |
| Arbitrary-time `?at=` | ✅ (honest refuse) | yes | no | no | n/a | 422 / unavailable pages |
| `observed_development` type | 🚫 | — | — | — | — | Policy only in `ai-first-beta-scope.md` |

### AI / operator / intake

| Feature | Status | User-facing? | AI? | Agentic? | Prod-ready? | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Analyst propose CLI | 🟠 | no | synthetic only | no | no | `src/lib/analyst/*`, `npm run analyst`, docs/analyst-proposals.md |
| Live LLM providers | 🔴 / gated | no | intended L1 | no | no | `providers/resolve.ts` unavailable or throws |
| Operator publish | ✅ | no | no | no | no | `npm run operator`, `writeEventBundle` |
| CISA KEV intake | 🟠 | no | no | no | no | `src/lib/intake/*`, `npm run intake` |
| Autonomous publishing | 🚫 | no | — | — | — | Contract + beta scope |
| Background / cron jobs | 🔴 | no | no | no | no | No product schedulers; CI only |

### Accounts / social / money

| Feature | Status | User-facing? | AI? | Agentic? | Prod-ready? | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Auth / identity | 🚫 | no | no | no | no | Build contract approval gate |
| Notifications | 🔴 | no | no | no | no | Settings checkbox inert; `/alerts` static |
| Social (people, comments, reactions) | 🚫 near-term | no | no | no | no | Roadmap non-goal |
| Billing | 🚫 | no | no | no | no | Phase 8 / approval gate |

### APIs & reliability

| Feature | Status | User-facing? | AI? | Agentic? | Prod-ready? | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/events` (+ domain) | ✅ | indirect | no | no | no | `src/app/api/events` |
| History read APIs | ✅ | via Archive | no | no | no | history routes + tests |
| Public write APIs | 🚫 | no | no | no | no | Contract |
| Data-boundary enforcement | ✅ | n/a | no | no | n/a | `src/test/data-boundary.test.ts` |
| Unit / component tests | ✅ | n/a | — | — | n/a | `npm test` (313 on audit machine) |
| DB + workflow tests | ✅ (when env) | n/a | — | — | n/a | `test:db`, `test:workflow` |

---

## 4. AI vs agent — do not confuse them

| Level | Definition | OMEN today |
| --- | --- | --- |
| **0 — Deterministic** | Rules, sorts, transforms, HTTP parse | **Dominant:** scoring, chronology, series, ⌘K, intake match rules, operator publish, Archive |
| **1 — AI-assisted** | Bounded LLM task | **Designed:** analyst proposal prompt → JSON draft. **Executable today:** synthetic test adapter only (still L0 behavior) |
| **2 — AI workflow** | Multi-step AI pipeline | **Not built** |
| **3 — AI agent** | Goal, tools, multi-step, adapt, state, terminate | **Not built** |
| **4 — Multi-agent** | Orchestrated specialists | **Not built** |

**Hard rule for this dashboard:** calling `provider.generate()` once with no tools is **not** an agent. Naming a route `/agents` does not create agents.

---

## 5. Current AI capability map

| AI capability | Exists? | Level | Model/provider | Input | Output | Autonomous? | Tools | Persistent state? | Production-ready? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Analyst propose (synthetic) | Yes | 0 | `test` / `test-deterministic-v1` | Event + evidence ids | Draft proposal JSON | No (CLI) | None | `analyst_runs`, `analyst_proposals` | Nonprod only |
| Analyst live LLM | Stub / blocked | 1 intended | Names: live/openai/anthropic; **no SDK in package.json** | Same | Would be draft | No | None | Same | **No** |
| Analyst stage/approve/reject | Yes | 0 | N/A | Proposal id + operator | Review status | No | None | DB + `source_review_items` | Nonprod |
| CISA KEV intake | Yes | 0 | N/A | Allowlisted JSON | Local queue | No | None | `.omen/intake/queue.json` | Manual |
| Operator publish | Yes | 0 | N/A | Bundle / review | Events/evidence/Move Logs/checkpoints | No | None | PostgreSQL | Nonprod |
| Scoring / chronology / history | Yes | 0 | N/A | Stored rows | Δpp, timeline, charts | N/A | None | Via store | Core yes |
| ⌘K search | Yes | 0 | N/A | Query | Hits | N/A | None | No | Core yes |
| Embeddings / rerankers | No | — | — | — | — | — | — | — | — |
| Gemini / Grok / local models | No | — | — | — | — | — | — | — | — |
| Multi-agent orchestration | No | — | — | — | — | — | — | — | — |

**Env note (no secrets):** `.env.example` documents `OMEN_STORAGE_MODE`, `DATABASE_URL`, `OMEN_TEST_DATABASE_ADMIN_URL` only. Analyst may read `OMEN_ANALYST_PROVIDER` / `OMEN_ANALYST_LIVE_API_KEY` in code; live activation still throws in this build.

---

## 6. What does AI actually do today?

**If 1,000 people used OMEN tomorrow:** AI would **not** affect their session. Consumer paths are deterministic software over stored or demo records. The analyst CLI is operator-only and does not import into `src/app`.

```
User opens OMEN (/)                          [CODE]
      ↓
Explores demo → /pulse                       [CODE]
      ↓
Feed generated (repo list + client filter)   [CODE]
      ↓
Event selected → brief                       [CODE]
      ↓
Context assembled (observations/evidence/
Move Log/chronology)                         [CODE]
      ↓
“AI analysis” in the product UI              [NOT BUILT]
      ↓
Related events (stored links)                [CODE]
      ↓
Follow locally                               [CODE]
      ↓
Archive / checkpoint (DB mode only)          [CODE]
      ↓
Operator (offline): analyst propose          [CODE + synthetic]
                                             ([AI] only if live
                                              provider activated —
                                              currently blocked)
      ↓
Human approve → operator publish Move Log    [CODE]
      ↓
User sees updated interpretation             [CODE]
```

**Labels:** `[CODE]` normal software · `[AI]` live model · `[AGENT]` tool-using agent · `[NOT BUILT]` absent.

---

## 7. Agent inventory

### A. Bounded Analyst Proposal Runner (only AI-shaped system)

| Field | Detail |
| --- | --- |
| **Name** | Analyst proposal workflow (`omen-analyst`) |
| **Purpose** | Evidence-grounded **draft** interpretation for human review |
| **Trigger** | Manual CLI: `npm run analyst -- propose …` |
| **Inputs** | Event id + selected evidence ids; DB loads question + summaries |
| **Tools** | **None** (safety tests forbid fetch/shell in analyst module) |
| **Reasoning** | Single `provider.generate()`; then deterministic validation |
| **Actions** | Persist run/proposal; stage to review queue; approve/reject |
| **State/memory** | Postgres tables; content identities; **no** conversational memory |
| **Output** | Validated JSON (summary, interpretation, claims, abstention) |
| **Human approval** | **Required**; cannot publish as Move Log automatically |
| **Failure handling** | unavailable / failed / rejected_output; timeouts/retries bounded |
| **Maturity** | Integrity-hardened prototype; synthetic-only executable |
| **Runtime status** | **Experimental / operator / nonproduction** — not in consumer UX |

### B. Not agents (listed so they are not mistaken)

| Name | What it is | Status |
| --- | --- | --- |
| `/agents` AgentsScreen | Hardcoded calibration UI | Simulated / illustrative |
| CISA intake | Deterministic fetch + rule match | Active CLI prototype, not AI |
| Operator publisher | Deterministic bundle write | Active CLI |
| Cursor Cloud Agents | Humans/agents editing **this repo** | Meta process (`mobile-agent-playbook.md`) |
| Discovery / Monitoring / Analysis agents | Vision/roadmap language | Planned only |

---

## 8. What is still “fake AI”?

Honest inventory of intelligence **theater**:

1. **`/agents`** — illustrative Brier/calibration cards (`ledgerCards`, `modelRankings`).
2. **`/research`** — invented “Alan” profile and ratings.
3. **Marketing Ledger / preview σ / explained bars** — labelled demo on marketing; workspace cards must not present σ as measured.
4. **Seeded `anomaly` / narrative “OMEN detects…” copy** in fixtures — not a live detector.
5. **Pulse featured anomaly** — picks among events that already carry an `anomaly` object.
6. **`CallModal`** — invented lock time + model/community %; unreachable.
7. **Exact intake match rules** — not NLP.
8. **Analyst `test` provider** — deterministic template; correctly labelled `executionKind=synthetic`.
9. **Package/README “agentic …” wording** — aspiration ahead of runtime.
10. **Relations “Measured, not imagined.”** — static SVG numbers.

This is not a criticism of V0 honesty elsewhere — the core brief is comparatively disciplined. It is a map of where engineering effort still sits behind the feeling of intelligence.

---

## 9. OMEN AI maturity visual

```
Traditional App  ←——————————————————————————————————  OMEN SITS HERE
      ↓                                               (with a gated L1
AI-assisted App                                       analyst CLI shape
      ↓                                               waiting for owner-
AI-native Product                                     approved live LLM)
      ↓
Agentic Intelligence Platform
      ↓
Multi-Agent Intelligence OS
```

### TODAY → V0 → V1 → LONG TERM (minimum capabilities)

| Stage | Minimum AI / agent bar |
| --- | --- |
| **TODAY** | Deterministic recorded intelligence; synthetic analyst drafts optional for operators |
| **V0 (done for loop; polish remains)** | Prove Event→Evidence→Move Log→Archive with honesty; AI optional; agents not required |
| **V1** | Live L1 analyst on owner-approved provider; convert proposal→Move Log draft with attribution; 2+ ingest sources; optional anomaly heuristics still L0 |
| **LONG TERM** | L2/L3 coworkers with tools + human gates; never silent overwrite; multi-agent only if orchestration earns keep |

Do **not** slide OMEN up this ladder because of UI labels.

---

## 10. V0 required AI

**V0 does not need agents.** The contract’s core loop is data honesty + recorded reconstruction. AI is optional acceleration for operators.

### MUST HAVE FOR V0
| Item | Notes |
| --- | --- |
| Deterministic assembly of observations, evidence, Move Logs | Already present |
| Provenance / no fabricated live claims | Already present |
| Human-gated publication | Already present |

### HIGH VALUE BUT OPTIONAL FOR V0
| Capability | Problem solved | Why AI | Why not agent | Inputs | Tools | Output | UX | Complexity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Live L1 analyst propose | Draft interpretations faster | Language over evidence | Single bounded generate is enough | Event + evidence | None | Draft JSON | Operator CLI → later brief attribution | Medium + owner paid-API approval |
| Proposal → Move Log convert command | Close review loop without retyping | N/A (mostly deterministic copy) | Not required | Approved proposal | None | Operator-editable bundle | Operator | Low–medium |

### V1
- Second ingest class beyond CISA KEV
- Sourced book at beta coverage order (AI/tech NA first)
- Consumer-visible attribution when interpretation is agent-drafted + human-approved
- Share control; retire or gate fake AI shells

### LATER
- Tool-using research agents, monitoring agents, multi-agent OS, embeddings search, social intelligence

---

## 11. V0 feature gap

| Capability | Current state | V0 target | Gap | Priority | Next action |
| --- | --- | --- | --- | --- | --- |
| Event→Evidence→Move Log→Archive loop | Implemented (DB + CLI) | Proven loop | Mostly closed | — | Keep regression green |
| Consumer discovery chrome | Shipped #26/#27 | Usable brief product | Share (T5) missing | P1 | Add Share/copy for brief + checkpoint URL |
| Demo vs sourced honesty | Strong | No false “live” | Legacy shells still reachable | P1 | Unroute or clearly quarantine Markets/Agents/Research/Relations/Alerts |
| Following | Browser-local | Enough for V0 | No sync | P2 | Defer accounts |
| Live analyst LLM | Blocked | Not required for V0 | Optional | P2 | Owner approval before any paid key activation |
| Proposal→publish bridge | Manual re-author | Explicit convert OK | Friction | P1 | Guided convert command (still human publish) |
| Multi-source ingest | One manual source | V0 can stay thin | Thin book | P1 for beta | Second allowlisted source after CISA |
| `observed_development` | Policy only | Not V0 blocker | Schema/UI absent | P2 | Dedicated migration task when authorized |
| Auth / billing / public writes | Absent | Out of V0 | — | P3 / 🚫 | Wait for approval |
| True agents / orchestrator | Absent | Out of V0 | — | P3 | After ingest + scoring density |
| Social layer | Absent | Out of V0 | — | P3 | Roadmap non-goal near term |
| Stale open PRs | Many drafts | Clean main | Noise | P1 (ops) | Close superseded #7/#9/#11/#14–#16/#18/#20/#25 |

P0 is reserved for true V0 blockers. **No speculative P0s.** Remaining V0 friction is polish + operator throughput, not missing agents.

---

## 12. Product side vs intelligence side

```
PRODUCT EXPERIENCE                         INTELLIGENCE ENGINE
─────────────────                          ───────────────────
🟢 Marketing page                          🟢 Append-only event schema
🟢 Pulse / Explore                         🟢 Checkpoints + reconstruction
🟢 Event brief honesty                     🟢 Operator publish path
🟡 Following (local only)                  🟡 CISA intake (one source, manual)
🟡 Archive (DB yes / demo refuse)          🟠 Analyst propose (synthetic)
🟢 Consumer nav                            🔴 Live LLM
⚪ Legacy shells (noise)                   🔴 Entity extraction / clustering
🔴 Onboarding / accounts                   🔴 Causal models / embeddings
🔴 Sharing control                         🔴 Monitoring jobs
🔴 Social / notifications                  🔴 Agent orchestration / memory/eval
🔴 Monetization UX                         🔴 Autonomous publish
```

** asymmetric maturity:** backend honesty and consumer brief > AI layer. Intelligence storage is ahead of intelligence *generation*.

---

## 13. Social layer status

| Capability | Today |
| --- | --- |
| Profiles | Idea / fake Research card only |
| Follows | **Events** in-browser — Partial |
| Friends | Not built |
| Sharing events | URLs work; **no Share UI** — Designed (T5) not wired |
| Reactions | Not built |
| Comments / discussion | Not built |
| Collaborative tracking | `/team` placeholder copy — Should not be V0 |
| Reputation | Fake Agents/Research numbers — UI only |
| Prediction/opinion posting | Unwired CallModal — Should not be V0 |
| Notifications | Missing (inert checkbox / static Alerts) |
| Activity feed | `listFeed()` unused — Infrastructure stub only |

Consumer contract and roadmap treat social network features as near-term non-goals.

---

## 14. User experience maturity

**What it feels like today (from shipped UX, not vision docs):**  
Primarily an **event tracking / intelligence brief** product with a **news-reader discovery** front (Pulse/Explore). Not a social product. Not an AI copilot. Not a live terminal trading desk. Legacy deep links can briefly feel like a denser “Bloomberg OS,” but those screens are fixtures.

**Strongest real loop**

```
DISCOVER (Pulse / Explore)
   ↓
UNDERSTAND (brief: evidence + Move Log + chronology)
   ↓
FOLLOW (browser-local)
   ↓
VERIFY PAST (Archive / checkpoint URL, DB mode)
```

**Missing retention loop**

```
RETURN TOMORROW ← needs new sourced moves OR alerts OR synced Following
```

Without accounts, notifications, or continuous sourced ingest, retention is habit + curiosity, not a system.

---

## 15. Current OMEN architecture

```
┌─────────────────────────────────────────────────────────┐
│ Frontend (Next.js App Router)                           │
│ Marketing `/` · Workspace Pulse/Explore/Following/      │
│ Archive · legacy URL shells                             │
└──────────────────────────▲──────────────────────────────┘
                           │ props / fetch
┌──────────────────────────┴──────────────────────────────┐
│ APIs: GET /api/events[+/:id][+history…]  (read-only)    │
│ Server components → IntelligenceRepository              │
└──────────────────────────▲──────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   Mock adapter      Postgres adapter    (no object store yet)
   demo fixtures     DATABASE_URL
        │                  │
        │         ┌────────┴────────┐
        │         │  events, evidence, │
        │         │  move logs,         │
        │         │  checkpoints,       │
        │         │  review, analyst_*  │
        │         └────────▲────────┘
        │                  │
┌───────┴──────────────────┴──────────────────────────────┐
│ Private CLIs (nonprod guards)                           │
│ omen-db · omen-operator · omen-intake · omen-analyst    │
└──────────▲──────────────────────────▲───────────────────┘
           │                          │
    CISA KEV (HTTPS)         Analyst provider interface
                             test ✅ · live/openai/anthropic ❌
```

**Auth:** none. **Cache:** browser Following localStorage. **Background jobs:** none. **Testing:** Vitest unit/component; Postgres integration; Puppeteer workflow; GitHub Actions CI. **Monitoring:** no product APM called out in-repo.

---

## 16. What changed recently?

Material product moves on `main` (not every commit):

| Change | Impact |
| --- | --- |
| **#17 V0 integration** | Connected temporal storage, Following, intake, operator publish, Archive checkpoint replay, workflow tests — V0 loop became one path |
| **#21 / #23 Archive fixes** | Stale replay/pagination honesty — Archive became trustworthy under navigation stress |
| **#24 Consumer design contract** | Specified brief product; Share still outstanding |
| **#26 / #27 Consumer UI** | Pulse/Explore/Following/More — product feels like a consumer event brief, not only an internal OS |
| **#28 / #29 Analyst proposals + integrity** | First real AI-shaped operator workflow + staging/approval hardening — still synthetic, still non-publishing |
| **#22 Beta scope docs** | Coverage order + `observed_development` policy — planning, not schema |

**Net:** Product honesty and consumer discovery jumped; AI remains operator-side scaffolding.

---

## 17. Next 5 engineering moves

Ordered by dependency, not excitement.

### 1. Quarantine fake-intelligence surfaces
- **Build/fix:** Unpromote or watermark Markets/Signals/Agents/Research/Relations/Alerts; keep core chrome honest.
- **Why now:** Deep links undermine trust after consumer polish.
- **User impact:** Demo stops feeling secretly broken.
- **AI impact:** Removes false agent/calibration signals.
- **Dependencies:** None.
- **Done when:** Primary/More/⌘K never imply those screens; visits show explicit non-product state; tests lock it.

### 2. Ship Share (consumer T5)
- **Build:** Copy/share brief URL and checkpoint/history URL from the event brief / Archive.
- **Why now:** Completes the understand→verify loop socially without accounts.
- **User impact:** Can send a reconstructible record.
- **AI impact:** None directly; improves distribution of honest records.
- **Dependencies:** Existing URLs already work.
- **Done when:** Control + tests; no invented “live” language.

### 3. Operator proposal → Move Log convert path
- **Build:** CLI/command that turns an **approved** analyst proposal into an editable Move Log/evidence candidate, preserving authorship + review attribution; still human `publish`.
- **Why now:** Closes the only AI-shaped loop without activating paid models.
- **User impact:** Faster, attributed interpretations on briefs after publish.
- **AI impact:** Makes L1 drafts operationally useful (still not agents).
- **Dependencies:** Analyst tables (#28/#29) + operator publish.
- **Done when:** Docs + tests prove approve≠publish; stale identity still blocks.

### 4. Second sourced intake class (still human review)
- **Build:** One more allowlisted public source → review queue → publish (same bridge pattern as CISA).
- **Why now:** Beta coverage needs sourced density; AI without sources hallucinates.
- **User impact:** Book updates without pasting JSON by hand as often.
- **AI impact:** Better evidence inputs for future live analyst.
- **Dependencies:** Intake/publish path from #17.
- **Done when:** Two source classes can stage candidates; no auto-publish; `intake:check`-style smoke exists.

### 5. Owner-gated live L1 analyst (only after 3–4)
- **Build:** Activate one paid provider behind explicit approval; keep no-tools, validate, human publish rules.
- **Why now:** Only after convert path + real evidence volume; else spend proves nothing.
- **User impact:** Still indirect until published; operators draft faster.
- **AI impact:** Moves executable path from L0 synthetic → true L1.
- **Dependencies:** Owner approval; convert path; sourced evidence.
- **Done when:** Live run recorded with `executionKind` honest; failures→unavailable; consumer still never auto-writes.

---

## 18. Visual roadmap

```
                  OMEN
                   NOW
        FEATURES: consumer brief + Archive + local Follow
        AI: none in consumer; synthetic operator drafts
        AGENTS: none
        DATA: demo default; Postgres + checkpoints real
        UX: discovery chrome; fake shells still exist
                    │
                    ▼
              V0 BLOCKERS (mostly polish)
        FEATURES: Share; quarantine shells; PR hygiene
        AI: not required
        AGENTS: not required
        DATA: keep honesty; optional convert path
        UX: no false “live/agent” signals
                    │
                    ▼
               V0 COMPLETE
        FEATURES: recorded loop you trust to demo
        AI: optional operator L1
        AGENTS: still none
        DATA: sourced samples via operator
        UX: brief-first, honest empty/unavailable
                    │
                    ▼
              PRIVATE BETA
        FEATURES: AI/tech NA coverage slice
        AI: live L1 behind approval
        AGENTS: propose-only coworkers
        DATA: multi-source review queue
        UX: still no social network
                    │
                    ▼
            FIRST REAL USERS
        FEATURES: retention via new moves + Follow
        AI: attributed interpretations
        AGENTS: queue clearing, not autonomy
        DATA: growing sourced book
        UX: mobile-capable brief
                    │
                    ▼
                   V1
        FEATURES: denser graph/search; more verticals
        AI: workflows where eval proves value
        AGENTS: tool-using only with human gates
        DATA: entity resolution begins
        UX: still evidence-first
```

---

## 19. Final “Founder view”

### What OMEN already does well
Honest recorded event intelligence: probabilities with provenance, evidence, Move Logs, checkpoint Archive, consumer Pulse/Explore brief, and a serious nonproduction write/review path.

### What OMEN appears to do but doesn’t fully do yet
Feel agentic or AI-native; run live models; monitor the world continuously; offer real agents, social, alerts, forecasts, or calibrated leaderboards (those UIs are mostly theater).

### What is blocking V0
Not “missing agents.” Remaining issues are trust polish (Share, quarantine fake shells), operator throughput (proposal→publish), and sourced book density — plus closing superseded PRs so `main` is the single story.

### What I should focus on next
1 → Quarantine fake AI / unfinished shells  
2 → Ship Share (T5)  
3 → Proposal → Move Log convert (human publish)  
4 → Second ingest source  
5 → Owner-gated live L1 analyst  

---

## Uncertainty & method notes

- Unit suite executed on audit machine: **313 passed** (`npm test`). `test:db` / `test:workflow` not re-run here (need disposable Postgres + Chrome); coverage inferred from source, CI history, and docs.
- Some docs (`ui-route-state-matrix.md`, parts of `architecture.md`, open PR #19/#7) are **stale** relative to consumer/analyst merges — code wins.
- Notion Command Center sync: this file is the repo source of truth for the audit; push to Notion when the Notion integration is connected.

*End of audit — refresh when `origin/main` SHA changes for AI, consumer chrome, ingest, or storage.*
