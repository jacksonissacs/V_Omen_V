import type { ReactNode } from "react"

import { ProbabilityChart } from "@/components/marketing/probability-chart"
import {
  DEMO_DISCLAIMER,
  MOVE_START,
  deriveCard,
  formatSigned,
  isEvidenceVisible,
  type DemoEvent,
  type EvidenceItem,
  type SeriesPoint,
} from "@/lib/marketing/demo-data"

export type EventCardMode = "preview" | "step" | "rewind"

export interface EventCardProps {
  event: DemoEvent
  series: SeriesPoint[]
  evidence: EvidenceItem[]
  /** Last visible minute index. */
  idx: number
  mode: EventCardMode
  /** Rendered inside the card's rewind strip (slider + snapshot). */
  rewind?: ReactNode
}

/** Renders `73.8` as `73` + de-emphasised `.8%`. */
export function ProbabilityFigure({ value }: { value: number }) {
  const s = value.toFixed(1)
  return (
    <>
      {s.slice(0, -2)}
      <small>{s.slice(-2)}%</small>
    </>
  )
}

/**
 * The single event card used by the preview, the walkthrough steps and the
 * rewind. All derivations (movement, evidence visibility, future mask) come
 * from `deriveCard` / `isEvidenceVisible` so the probability, chart, evidence
 * list and uncertainty block always agree on the same cutoff.
 */
export function EventCard({ event, series, evidence, idx, mode, rewind }: EventCardProps) {
  const { point, delta, moved, inMove, latest, cutoff } = deriveCard(series, idx)
  const isRewind = mode === "rewind"
  const moveClass = delta > 0.5 ? "up" : delta < -0.5 ? "dn" : "quiet"

  return (
    <div className={`event-card${isRewind ? " step-3" : ""}`}>
      <div className="event-main">
        <div className="event-chips">
          <span className="chip">{event.category}</span>
          <span className="chip hi">
            <span className="dot" />
            {event.catalyst.tier}
          </span>
          <span className="chip">Resolves {event.resolves}</span>
          <span className="chip demo">{DEMO_DISCLAIMER}</span>
        </div>
        <h3 className="event-title">{event.title}</h3>
        <div className="readout">
          <div>
            <div className="lbl">Probability</div>
            <div className="prob prob-xl" aria-live="polite">
              <ProbabilityFigure value={point.p} />
            </div>
          </div>
          <div>
            <div className="lbl">Movement since {series[0].t}</div>
            <div className={`move ${moveClass}`}>{formatSigned(delta)} pts</div>
            <div className="stamp">
              {moved ? `${event.moveSigma}σ over ${event.moveWindow}` : inMove ? "move in progress" : "no abnormal movement"}
            </div>
          </div>
          <div>
            <div className="lbl">As of</div>
            <div className="stamp strong">
              {event.date} · {cutoff} {event.tz}
            </div>
            <div className="stamp">{latest ? "latest observation" : "point-in-time view"}</div>
          </div>
        </div>
        <div className="chart">
          <ProbabilityChart series={series} idx={idx} highlightMove={!isRewind || moved} cursor={isRewind} />
        </div>
      </div>
      <div className="event-side">
        <div>
          <div className="side-title">
            <b>Evidence</b>
            <span>{moved ? "Primary catalyst identified" : idx >= MOVE_START ? "Collecting signals" : "Nothing yet"}</span>
          </div>
          <ul className="ev-list">
            {evidence.map((item) => {
              const visible = isEvidenceVisible(item, series, idx)
              if (!visible && isRewind) return null
              return (
                <li key={item.t} className={`ev-${item.kind}${visible ? "" : " future"}`}>
                  <span className="t">{item.t}</span>
                  <span className="txt">{item.text}</span>
                  <span className="d">{item.delta ?? ""}</span>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="unc">
          <div className="side-title">
            <b>Uncertainty</b>
          </div>
          <div className="unc-row">
            <span>OMEN estimate</span>
            <b>
              {point.est.toFixed(1)}% ± {point.band.toFixed(1)}
            </b>
          </div>
          <div className="unc-row">
            <span>Explained by identified signals</span>
            <b>{moved ? `${event.explained}%` : inMove ? "—" : "n/a"}</b>
          </div>
          <div
            className="bar"
            role="img"
            aria-label={
              moved
                ? `Explained ${event.explained} percent, unexplained ${event.unexplained} percent`
                : "Explained share not yet available"
            }
          >
            <i style={{ width: `${moved ? event.explained : 0}%` }} />
            <i className="rest" style={{ width: `${moved ? event.unexplained : 0}%` }} />
          </div>
          <div className="unc-row">
            <span>Identification confidence</span>
            <b>{moved ? `${event.identificationConfidence}%` : "—"}</b>
          </div>
          <div className="unc-row">
            <span>Historical analogues</span>
            <b>n = {event.analogues.n}</b>
          </div>
          <p>
            {moved
              ? `The CPI release is the most likely trigger, but comparable releases account for about ${event.explained}% of a move this size. The remainder is unexplained and shown as such.`
              : "Uncertainty is stated at every point in time, not only after the fact."}
          </p>
        </div>
      </div>
      {isRewind && rewind ? <div className="rewind">{rewind}</div> : null}
    </div>
  )
}
