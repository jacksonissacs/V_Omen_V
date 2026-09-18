import { PanelHead } from "@/components/marketing/panel-head"
import {
  ARCHIVE_INDEX,
  archiveAt,
  cutoffAt,
  demoArchive,
  demoEvent,
  demoEvidence,
  demoLedger,
  demoPulse,
  demoRelation,
  demoSeries,
  evidenceAt,
} from "@/lib/marketing/demo-data"

/* ---------- Pulse ---------- */

export function PulseSection() {
  return (
    <section className="feature" id="pulse" aria-labelledby="pulse-title">
      <div className="wrap cols">
        <div>
          <h2 id="pulse-title">Pulse</h2>
          <p className="lead">
            What changed in the world&apos;s expectations today, ranked by how unusual the change was — not by
            how loud the headline was.
          </p>
          <ul className="points">
            <li>
              Every move is sized in standard deviations against that market&apos;s own history, so a two-point
              move in a quiet market can outrank a ten-point move in a noisy one.
            </li>
            <li>
              Each move carries a primary catalyst, the share of the move it explains, and a confidence level
              for that identification.
            </li>
            <li>
              Silence is a signal too: when a market historically reacts to a shock and doesn&apos;t, Pulse says
              so.
            </li>
          </ul>
        </div>
        <div className="panel">
          <PanelHead kicker="Pulse" title={demoEvent.date} chip="Demo" />
          <div className="pulse-list">
            {demoPulse.map((move) => {
              const conf = move.conf === "High" ? "hi" : move.conf === "Medium" ? "med" : "lo"
              const missing = move.explained === null
              return (
                <div className="pulse-row" key={move.title}>
                  <div>
                    <div className="meta">
                      <span>{move.cat}</span>
                      <span className="t">
                        {move.t} {demoEvent.tz}
                      </span>
                      <span className={`chip ${conf}`}>
                        <span className="dot" />
                        {missing ? "Expected reaction missing" : `${move.conf} confidence`}
                      </span>
                    </div>
                    <h4>{move.title}</h4>
                    <div className="why">
                      {missing
                        ? `${move.catalyst}. ${move.sigma}.`
                        : `Primary catalyst: ${move.catalyst} — explained ${move.explained}%`}
                    </div>
                  </div>
                  <div className="nums">
                    <span className="prob prob-md">
                      {move.from.toFixed(1)}% → {move.to.toFixed(1)}%
                    </span>
                    <span className={`move ${missing ? "quiet" : "up"}`}>{move.pts} pts</span>
                    <span className="stamp">{missing ? `${demoRelation.elapsed} since shock` : move.sigma}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- Archive ---------- */

export function ArchiveSection() {
  const point = demoSeries[ARCHIVE_INDEX]
  const cutoff = cutoffAt(demoSeries, ARCHIVE_INDEX)
  return (
    <section className="feature" id="archive" aria-labelledby="archive-title">
      <div className="wrap cols flip">
        <div>
          <h2 id="archive-title">Archive</h2>
          <p className="lead">
            Reconstruct the information environment at any moment: the probabilities as they stood, the
            headlines that existed, the evidence that had arrived — and nothing that came later.
          </p>
          <ul className="points">
            <li>
              Every observation is stored with the instant it was first seen, so &ldquo;what did we know at
              14:33?&rdquo; has a precise answer.
            </li>
            <li>Point-in-time views are built from those observations, never back-filled from later data.</li>
            <li>Rewind any event in Pulse; the same view is available across every market OMEN follows.</li>
          </ul>
        </div>
        <div className="panel">
          <PanelHead kicker="Archive" title={demoEvent.title} chip="Demo" />
          <div className="pit">
            <div className="pit-time">
              <span className="chip">Point-in-time</span>
              <span className="stamp">
                {demoEvent.date} · {cutoff} {demoEvent.tz}
              </span>
            </div>
            <div className="kv">
              <span className="k">Consensus then</span>
              <span className="v prob prob-md">{point.p.toFixed(1)}%</span>
              <span className="k">OMEN estimate then</span>
              <span className="v num">
                {point.est.toFixed(1)}% ± {point.band.toFixed(1)}
              </span>
            </div>
            <h5>Headlines available at that moment</h5>
            <ul>
              {archiveAt(demoArchive, ARCHIVE_INDEX).map((headline) => (
                <li key={headline}>{headline}</li>
              ))}
            </ul>
            <h5>Evidence observed so far</h5>
            <ul>
              {evidenceAt(demoEvidence, demoSeries, ARCHIVE_INDEX).map((item) => (
                <li key={item.t}>
                  <span className="stamp">{item.t}</span>
                  {item.text}
                  {item.delta ? <span className="num quiet"> {item.delta}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- Ledger ---------- */

export function LedgerSection() {
  return (
    <section className="feature" id="ledger" aria-labelledby="ledger-title">
      <div className="wrap cols">
        <div>
          <h2 id="ledger-title">Ledger</h2>
          <p className="lead">
            Who predicted what, when they predicted it, and how it turned out. A public record of calibration
            for institutions, models, aggregates and individuals.
          </p>
          <ul className="points">
            <li>
              Forecasts are scored only after resolution, against the probability that was recorded at the
              time — not a later revision.
            </li>
            <li>
              Calibration and Brier score sit side by side, with coverage so a good score on ten forecasts is
              not mistaken for a good score on a thousand.
            </li>
            <li>Every row opens the evidence that was available when the forecast was made.</li>
          </ul>
        </div>
        <div className="panel">
          <PanelHead kicker="Ledger" title="Canadian macro · last 12 months" chip="Demo" />
          <table className="tbl">
            <thead>
              <tr>
                <th>Forecaster</th>
                <th>Calibration</th>
                <th className="num">Brier</th>
                <th className="num">Coverage</th>
                <th className="num">Scored</th>
              </tr>
            </thead>
            <tbody>
              {demoLedger.map((row) => (
                <tr key={row.name}>
                  <td>
                    <b className="who">{row.name}</b>
                    <div className="quiet type">{row.type}</div>
                  </td>
                  <td>
                    <span className="cal">
                      <span className="num">{row.calibration}%</span>
                      <span className="bar" aria-hidden="true">
                        <i style={{ width: `${row.calibration}%` }} />
                      </span>
                    </span>
                  </td>
                  <td className="num">{row.brier.toFixed(3)}</td>
                  <td className="num">{row.coverage}%</td>
                  <td className="num">{row.scored.toLocaleString("en-CA")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

/* ---------- Relations ---------- */

export function RelationsSection() {
  return (
    <section className="section" id="relations" aria-labelledby="rel-title">
      <div className="wrap">
        <div className="section-head">
          <h2 id="rel-title">How the three fit together</h2>
          <p>
            Pulse notices, Archive remembers, Ledger keeps score. Relations between markets are measured from
            the archive, and a missing reaction is surfaced in Pulse.
          </p>
        </div>
        <div className="rel-grid">
          <div
            className="panel flow"
            role="img"
            aria-label="Diagram: observations flow from Pulse into the Archive, which feeds Relations and the Ledger"
          >
            <svg viewBox="0 0 560 236" aria-hidden="true">
              <defs>
                <marker
                  id="omen-flow-arrow"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8" fill="none" stroke="#5E6670" strokeWidth="1.2" />
                </marker>
              </defs>
              <rect className="node" x="10" y="24" width="150" height="66" rx="8" />
              <text className="h" x="26" y="50">
                Pulse
              </text>
              <text x="26" y="70">
                flags abnormal moves
              </text>
              <rect className="node" x="205" y="24" width="150" height="66" rx="8" />
              <text className="h" x="221" y="50">
                Archive
              </text>
              <text x="221" y="70">
                keeps every observation
              </text>
              <rect className="node" x="400" y="24" width="150" height="66" rx="8" />
              <text className="h" x="416" y="50">
                Ledger
              </text>
              <text x="416" y="70">
                scores on resolution
              </text>
              <rect className="node" x="205" y="150" width="150" height="66" rx="8" />
              <text className="h" x="221" y="176">
                Relations
              </text>
              <text x="221" y="196">
                measured co-movement
              </text>
              <path className="edge" d="M160,57 L203,57" />
              <path className="edge" d="M355,57 L398,57" />
              <path className="edge" d="M280,90 L280,148" />
              <text className="elbl" x="288" y="122">
                history
              </text>
              <path className="edge" d="M205,183 C120,183 85,150 85,92" />
              <text className="elbl" x="96" y="140">
                missing reaction
              </text>
              <text className="elbl" x="14" y="228">
                Every arrow carries a timestamp; nothing is back-filled.
              </text>
            </svg>
          </div>
          <div className="panel missing">
            <div className="head">
              <span className="chip med">
                <span className="dot" />
                Expected reaction missing
              </span>
            </div>
            <h4>{demoRelation.b}</h4>
            <p>
              Historically this market moves with Bank of Canada rate surprises in {demoRelation.historical}% of
              comparable shocks. {demoRelation.observed} detected {demoRelation.elapsed} after today&apos;s
              repricing.
            </p>
            <p className="quiet">Possible reasons OMEN lists rather than guesses:</p>
            <div className="tags">
              <span className="chip">pricing lag</span>
              <span className="chip">different interpretation</span>
              <span className="chip">liquidity</span>
              <span className="chip">relationship breakdown</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- Methodology ---------- */

const TERMS = [
  [
    "Explained share",
    "The fraction of a move that identified signals account for, based on how this market has responded to comparable events. The rest is labelled unexplained, not attributed to a guess.",
  ],
  [
    "Identification confidence",
    "How sure OMEN is that the named catalyst is the trigger, separate from how much of the move it explains. A confident identification can still explain only part of a move.",
  ],
  [
    "Source tiers",
    "Sources are ranked by track record and directness: primary releases and filings first, established reporting second, everything else below. Tier is shown, never hidden.",
  ],
  [
    "Historical analogues",
    "Comparable past events, with their count, median response and median lag. Small samples are shown as small samples.",
  ],
  [
    "OMEN estimate",
    "OMEN's own probability with a band. It sits beside the consensus, not in place of it, so the two can disagree in the open.",
  ],
  [
    "Point in time",
    "Every figure is stored with the instant it was first observed. Rewound views are assembled from those records and never corrected with later information.",
  ],
] as const

export function MethodologySection() {
  return (
    <section className="section" id="methodology" aria-labelledby="method-title">
      <div className="wrap method">
        <div>
          <div className="section-head">
            <h2 id="method-title">Methodology</h2>
            <p>
              OMEN&apos;s job is to make a claim and show how sure it is. These are the terms used throughout the
              product, and what they do and don&apos;t mean.
            </p>
          </div>
          <p className="lead">
            Attribution is statistical, not editorial. A catalyst is identified by timing, by the market&apos;s
            historical response to the same class of event, and by co-movement in related markets. The result
            is always a share of the move, never the whole of it.
          </p>
        </div>
        <dl>
          {TERMS.map(([term, definition]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{definition}</dd>
            </div>
          ))}
          <div className="not">
            <h3>What OMEN does not claim</h3>
            <ul>
              <li>That a catalyst caused a move — only that the timing and history are consistent with it.</li>
              <li>That its estimate beats the market. The Ledger is where that gets tested, on resolved events.</li>
              <li>That any figure on this page is live. The demo is illustrative and reproducible, not a feed.</li>
              <li>Any guarantee about the immutability of records beyond what is documented for the product.</li>
            </ul>
          </div>
        </dl>
      </div>
    </section>
  )
}
