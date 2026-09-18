"use client"

import Link from "next/link"
import { useState } from "react"

import { Residual } from "@/components/common/residual"
import { TabGroup } from "@/components/common/tab-group"
import { EventTimeline } from "@/components/events/event-timeline"
import { SourceBadge } from "@/components/events/source-badge"
import { IntelligencePanel } from "@/components/intelligence/intelligence-panel"
import { useWorkspace } from "@/components/layout/workspace-provider"
import { MarketImpact } from "@/components/markets/market-impact"
import { getRelatedEvents } from "@/data/events"
import { formatDateTime } from "@/lib/format"
import { formatProbability, formatSignedPp } from "@/lib/domain/scoring"
import type { AionEvent } from "@/types/event"

export function EventIntelligenceView({ event }: { event: AionEvent }) {
  const { openCall, isWatched, toggleWatch } = useWorkspace()
  const [chartTab, setChartTab] = useState("Probability")
  const [range, setRange] = useState("1D")
  const [inspectorTab, setInspectorTab] = useState<"Source" | "Evidence" | "Attribution" | "Analogues">(
    "Source",
  )
  const related = getRelatedEvents(event)
  const previousBelief = event.expectationHistory[0]
  const priorPoint = event.expectationHistory[event.expectationHistory.length - 2]

  return (
    <section className="aion-screen">
      <div className="aion-event-head">
        <div className="aion-event-meta">
          <span style={{ letterSpacing: ".06em", color: "var(--a-tx-1)" }}>
            {event.category}
          </span>
          <SourceBadge tier={event.sourceTier} label={`Tier ${event.sourceTier} evidence`} />
          {event.resolvesAt ? <span className="aion-chip">Resolves {event.resolvesAt}</span> : null}
          <span className="aion-chip">{event.significance}</span>
        </div>
        <h1>{event.title}</h1>
        <p className="aion-event-question">{event.question}</p>
        <div className="aion-event-figures">
          <EventFigure label="Current probability" value={formatProbability(event.probability)} />
          <EventFigure
            label="Previous probability"
            value={formatProbability(event.previousProbability)}
            muted
            small
          />
          <EventFigure
            label="Change"
            value={formatSignedPp(event.change).replace(" pp", " pts")}
            tone={event.change >= 0 ? "up" : "down"}
            small
          />
          <EventFigure
            label="OMEN estimate"
            value={formatProbability(Math.max(event.probability - 2.6, 0.1))}
            muted
            small
          />
          <div className="aion-event-actions">
            <button
              type="button"
              className="aion-button"
              data-primary="true"
              onClick={() => openCall(event)}
            >
              Make a call
            </button>
            <button
              type="button"
              className="aion-button"
              aria-pressed={isWatched(event.id)}
              onClick={() => toggleWatch(event.id)}
            >
              {isWatched(event.id) ? "Following" : "Follow"}
            </button>
          </div>
        </div>
      </div>

      <div className="aion-event-layout">
        <div>
          <div className="aion-qa-grid">
            <QaCard label="What changed?" value={event.whatChanged} />
            <QaCard label="When did it change?" value={formatDateTime(event.timestamp)} />
            <QaCard
              label="How significant?"
              value={`${event.significance} · ${event.sigma.toFixed(1)}σ over ${event.duration}`}
            />
            <QaCard label="What likely caused it?" value={event.likelyCause} />
          </div>

          <div className="aion-panel">
            <div className="aion-chart-bar">
              <TabGroup
                items={["Probability", "Volume", "Spread", "Related"]}
                value={chartTab}
                onChange={setChartTab}
              />
              <TabGroup
                items={["1H", "6H", "1D", "1W", "1M", "ALL"]}
                value={range}
                onChange={setRange}
                ranges
              />
            </div>
            <ProbabilityChart event={event} mode={chartTab} range={range} />
          </div>

          <div className="aion-panel">
            <h2>When did this change?</h2>
            <EventTimeline items={event.timeline} />
          </div>

          <div className="aion-panel">
            <h2>Why did this move?</h2>
            <div className="aion-attribution-grid">
              <Attribute label="Primary trigger" value={event.catalyst} />
              <Attribute
                label="Identification confidence"
                value={`${Math.min(event.explained + 20, 99)}%`}
                mono
              />
              <Attribute label="Coverage of move" value={`${event.explained}%`} mono />
              <Attribute label="Data quality" value={event.confidence} />
            </div>
            <Residual explained={event.explained} />
            <div className="aion-inspector-section">Related markets moving</div>
            <MarketImpact markets={event.relatedMarkets} />
            <div className="aion-inspector-section">Additional signals</div>
            {event.signals.map((signal) => (
              <div className="aion-signal-row" key={signal.id}>
                <span>{signal.label}</span>
                <span
                  className={`aion-mono ${signal.direction === "up" ? "aion-up" : signal.direction === "down" ? "aion-down" : ""}`}
                >
                  {signal.value}
                </span>
              </div>
            ))}
            <p className="aion-note">
              We are confident {event.likelyCause.toLowerCase()} triggered the repricing, but
              historically similar releases account for only about {event.explained}% of a move
              of this magnitude. Remaining unexplained: {event.unexplainedFactors.join("; ")}.
            </p>
          </div>

          <div className="aion-panel">
            <h2>What did the system previously believe?</h2>
            {previousBelief ? (
              <p>
                The book opened at{" "}
                <span className="aion-mono">{formatProbability(previousBelief.probability)}</span>
                {previousBelief.note ? ` · ${previousBelief.note}` : ""}.
                {priorPoint
                  ? ` Immediately before this move it stood at ${formatProbability(priorPoint.probability)}${priorPoint.note ? ` (${priorPoint.note})` : ""}.`
                  : null}
              </p>
            ) : (
              <p>No prior expectation path is stored for this event.</p>
            )}
            <div className="aion-history-strip">
              {event.expectationHistory.map((point) => (
                <span key={point.at} className="aion-mono">
                  {formatProbability(point.probability)}
                </span>
              ))}
            </div>
          </div>

          <div className="aion-panel">
            <h2>Connected events</h2>
            {related.length === 0 ? (
              <p className="aion-note">No linked events in the current book.</p>
            ) : (
              related.map((item) => (
                <Link key={item.id} className="aion-related-link" href={`/events/${item.id}`}>
                  <span>{item.title}</span>
                  <span className="aion-mono">{formatProbability(item.probability)}</span>
                </Link>
              ))
            )}
          </div>

          {event.anomaly ? (
            <div className="aion-panel aion-anomaly">
              <div className="aion-anomaly-flag">△ {event.anomaly.title}</div>
              <p>{event.anomaly.body}</p>
              <div className="aion-anomaly-interpretations">
                {event.anomaly.interpretations.map((item) => (
                  <span key={item}>Possible: {item}</span>
                ))}
              </div>
              <Link className="aion-button" data-quiet="true" style={{ marginTop: 12 }} href="/relations">
                View relationship
              </Link>
            </div>
          ) : null}
        </div>

        <aside className="aion-inspector">
          <div className="aion-inspector-tabs">
            {(["Source", "Evidence", "Attribution", "Analogues"] as const).map((item) => (
              <button
                type="button"
                className="aion-tab"
                data-active={inspectorTab === item}
                key={item}
                onClick={() => setInspectorTab(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <IntelligencePanel tab={inspectorTab} event={event} />
        </aside>
      </div>
    </section>
  )
}

function EventFigure({
  label,
  value,
  tone,
  muted,
  small,
}: {
  label: string
  value: string
  tone?: "up" | "down"
  muted?: boolean
  small?: boolean
}) {
  return (
    <div>
      <span className="aion-event-figure-label">{label}</span>
      <span
        className={`aion-event-figure aion-mono ${tone === "up" ? "aion-up" : tone === "down" ? "aion-down" : ""}`}
        style={{
          fontSize: small ? 22 : undefined,
          color: muted ? "var(--a-tx-1)" : undefined,
        }}
      >
        {value}
      </span>
    </div>
  )
}

function Attribute({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <span className="aion-label">{label}</span>
      <span className={`aion-attribution-value ${mono ? "aion-mono" : ""}`}>{value}</span>
    </div>
  )
}

function QaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="aion-qa-card">
      <span className="aion-label">{label}</span>
      <p>{value}</p>
    </div>
  )
}

function ProbabilityChart({
  event,
  mode,
  range,
}: {
  event: AionEvent
  mode: string
  range: string
}) {
  const verticalShift = mode === "Volume" ? 18 : mode === "Spread" ? -10 : 0
  const endY = event.change >= 0 ? 68 : 120
  return (
    <svg
      viewBox="0 0 800 220"
      preserveAspectRatio="none"
      className="aion-chart"
      role="img"
      aria-label={`${mode} over ${range}`}
    >
      <g stroke="rgba(255,255,255,.045)">
        {[44, 88, 132, 176].map((y) => (
          <line key={y} x1="0" y1={y} x2="800" y2={y} />
        ))}
      </g>
      <text className="aion-axis" x="770" y="40">
        {Math.round(event.probability + 6)}%
      </text>
      <text className="aion-axis" x="770" y="84">
        {Math.round(event.probability)}%
      </text>
      <text className="aion-axis" x="770" y="128">
        {Math.round(event.previousProbability)}%
      </text>
      <text className="aion-axis" x="770" y="172">
        {Math.round(event.previousProbability - 10)}%
      </text>
      <path
        d={`M0,138 L60,136 L120,139 L180,135 L240,137 L300,134 L360,136 L420,133 L480,135 L520,134 L560,131 L600,128 L615,112 L628,96 L640,${84 + verticalShift} L660,${76 + verticalShift} L690,72 L730,70 L800,${endY}`}
        fill="none"
        stroke="#8194FF"
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="600"
        y1="10"
        x2="600"
        y2="210"
        stroke="rgba(255,255,255,.14)"
        strokeDasharray="2 4"
      />
      <circle cx="600" cy="128" r="3" fill="#0C0E11" stroke="#C9A96A" />
      <text className="aion-axis" x="584" y="20" fill="#C9A96A">
        {event.catalystTime.slice(0, 5)}
      </text>
      <circle cx="800" cy={endY} r="3.2" fill="#8194FF" />
    </svg>
  )
}
