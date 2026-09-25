"use client"

import Link from "next/link"
import { useRef, useState, type ReactNode } from "react"

import { TabGroup } from "@/components/common/tab-group"
import { IntelligencePanel, type InspectorTab } from "@/components/intelligence/intelligence-panel"
import { ProbabilityChart } from "@/components/intelligence/probability-chart"
import { useWorkspace } from "@/components/layout/workspace-provider"
import { formatDateTime } from "@/lib/format"
import { recordedChronology } from "@/lib/domain/event-chronology"
import {
  BASIS_LABEL,
  CHART_RANGES,
  RANGE_LABEL,
  describeBasis,
  formatInterval,
  latestChange,
  latestCompleteForecast,
  observationBeforeRange,
  observationsInRange,
  probabilityBasis,
  rangeChange,
  rangeWindow,
  type ChartRange,
  type ObservedChange,
} from "@/lib/domain/probability-history"
import { formatProbability, formatSignedPp } from "@/lib/domain/scoring"
import type { AionEvent, ProbabilitySeries } from "@/types/event"

export function EventIntelligenceView({
  event,
  related,
}: {
  event: AionEvent
  related: AionEvent[]
}) {
  const { isWatched, toggleWatch } = useWorkspace()
  const [range, setRange] = useState<ChartRange>("ALL")
  const [seriesId, setSeriesId] = useState(event.probabilitySeries[0]?.id)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("Evidence")
  const inspectorRef = useRef<HTMLElement>(null)

  const headline = event.probabilitySeries[0]
  const latest = headline?.observations.at(-1)
  const change = latestChange(headline)
  const forecast = latestCompleteForecast(event.forecasts)
  const charted = event.probabilitySeries.find((item) => item.id === seriesId) ?? headline

  const inspectEvidence = () => {
    setInspectorTab("Evidence")
    inspectorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    inspectorRef.current?.focus({ preventScroll: true })
  }

  return (
    <section className="aion-screen">
      <div className="aion-event-head">
        <div className="aion-event-meta">
          <span style={{ letterSpacing: ".06em", color: "var(--a-tx-1)" }}>
            {event.category}
          </span>
          {headline ? (
            <span className="aion-chip" data-testid="probability-basis" data-basis={probabilityBasis(headline)}>
              {BASIS_LABEL[probabilityBasis(headline)]} probability
            </span>
          ) : null}
          <span className="aion-chip">
            {event.evidence.length} evidence {event.evidence.length === 1 ? "record" : "records"}
          </span>
          {event.resolvesAt ? <span className="aion-chip">Resolves {event.resolvesAt}</span> : null}
        </div>
        <h1>{event.title}</h1>
        <p className="aion-event-question">{event.question}</p>
        {event.resolutionCriteria ? (
          <p className="aion-note" style={{ marginBottom: 14 }}>
            <span className="aion-label">Resolution criteria</span> {event.resolutionCriteria}
          </p>
        ) : null}
        <div className="aion-event-figures">
          <EventFigure
            label="Current probability"
            value={latest ? formatProbability(latest.probability) : "Not recorded"}
          />
          <EventFigure
            label="Previous observation"
            value={change ? formatProbability(change.from.probability) : "None recorded"}
            muted
            small
          />
          <EventFigure
            label="Change"
            value={change ? formatSignedPp(change.deltaPp) : "Not computable"}
            tone={change ? (change.deltaPp > 0 ? "up" : change.deltaPp < 0 ? "down" : undefined) : undefined}
            muted={!change}
            small
          />
          {forecast ? (
            <EventFigure label="OMEN forecast" value={formatProbability(forecast.probability)} muted small />
          ) : null}
          <div className="aion-event-actions">
            <button type="button" className="aion-button" data-primary="true" onClick={inspectEvidence}>
              Inspect evidence
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
        <dl className="aion-event-record" data-testid="event-record">
          <RecordLine label="Probability source">
            {headline ? describeBasis(headline) : "No probability series is recorded for this event."}
          </RecordLine>
          <RecordLine label="Change compares">
            {change ? describeChange(change) : "Fewer than two observations are recorded, so no change can be computed."}
          </RecordLine>
          <RecordLine label="Latest recorded observation">
            {latest
              ? `${formatDateTime(latest.observedAt)} · ${latest.capturedAt ? `captured by OMEN ${formatDateTime(latest.capturedAt)}` : "OMEN capture time not recorded"} · not a live feed`
              : "None"}
          </RecordLine>
          <RecordLine label="OMEN forecast">
            {forecast
              ? `${formatProbability(forecast.probability)} by ${[forecast.author, forecast.model].filter(Boolean).join(" · ")} · issued ${formatDateTime(forecast.issuedAt)} · method: ${forecast.method} · evidence cutoff ${formatDateTime(forecast.evidenceCutoff)}`
              : "No OMEN forecast has been recorded for this event."}
          </RecordLine>
        </dl>
      </div>

      <div className="aion-event-layout">
        <div>
          <div className="aion-qa-grid">
            <QaCard
              label="What changed?"
              value={
                change
                  ? `${seriesLabel(headline)} moved from ${formatProbability(change.from.probability)} to ${formatProbability(change.to.probability)} (${formatSignedPp(change.deltaPp)}).`
                  : "Only one observation is recorded, so no change can be computed."
              }
            />
            <QaCard
              label="When did it change?"
              value={
                change
                  ? `Between ${formatDateTime(change.from.observedAt)} and ${formatDateTime(change.to.observedAt)} (${formatInterval(change.intervalMs)} apart). No observations are recorded in between.`
                  : latest
                    ? `Single observation at ${formatDateTime(latest.observedAt)}.`
                    : "No observations recorded."
              }
            />
            <QaCard
              label="What is this probability?"
              value={headline ? `${BASIS_LABEL[probabilityBasis(headline)]} · ${headline.sourceName}` : "Not recorded"}
            />
            <QaCard
              label="What likely caused it?"
              value={event.moveLog ? `${event.likelyCause} (interpretation, move log v${event.moveLog.version})` : "No move log has attributed a cause."}
            />
          </div>
          {event.moveLog ? <MoveLogNote moveLog={event.moveLog} /> : null}

          <div className="aion-panel">
            <h2>Recorded probability</h2>
            {charted ? (
              <SeriesHistory
                series={event.probabilitySeries}
                charted={charted}
                onSeriesChange={setSeriesId}
                range={range}
                onRangeChange={setRange}
              />
            ) : (
              <p className="aion-note" data-testid="history-empty">
                No probability observations are recorded for this event.
              </p>
            )}
          </div>

          <div className="aion-panel">
            <h2>When did this change?</h2>
            <RecordedChronology event={event} series={headline} />
          </div>

          <div className="aion-panel">
            <h2>Why did this move?</h2>
            <Explanation event={event} change={change} series={headline} />
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
        </div>

        <aside className="aion-inspector" ref={inspectorRef} tabIndex={-1} aria-label="Evidence inspector">
          <div className="aion-inspector-tabs" role="tablist">
            {(["Evidence", "Record", "Analogues"] as const).map((item) => (
              <button
                type="button"
                role="tab"
                aria-selected={inspectorTab === item}
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

function seriesLabel(series: ProbabilitySeries | undefined): string {
  if (!series) return "The probability"
  return `The ${BASIS_LABEL[probabilityBasis(series)].toLowerCase()} probability`
}

function describeChange(change: ObservedChange): string {
  return `${formatProbability(change.from.probability)} at ${formatDateTime(change.from.observedAt)} → ${formatProbability(change.to.probability)} at ${formatDateTime(change.to.observedAt)}, ${formatInterval(change.intervalMs)} apart, in the same series.`
}

function SeriesHistory({
  series,
  charted,
  onSeriesChange,
  range,
  onRangeChange,
}: {
  series: ProbabilitySeries[]
  charted: ProbabilitySeries
  onSeriesChange: (id: string) => void
  range: ChartRange
  onRangeChange: (range: ChartRange) => void
}) {
  const bounds = rangeWindow(charted, range)
  const points = observationsInRange(charted, range)
  const before = observationBeforeRange(charted, range)
  const change = rangeChange(charted, range)
  const basis = BASIS_LABEL[probabilityBasis(charted)]

  if (!bounds || points.length === 0) {
    return (
      <p className="aion-note" data-testid="history-empty">
        No observations are recorded in this series.
      </p>
    )
  }

  return (
    <>
      <div className="aion-chart-bar">
        {series.length > 1 ? (
          <label className="aion-series-select">
            <span className="aion-label">Series</span>
            <select value={charted.id} onChange={(event) => onSeriesChange(event.target.value)}>
              {series.map((item) => (
                <option key={item.id} value={item.id}>
                  {BASIS_LABEL[probabilityBasis(item)]} · {item.sourceName}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="aion-label" style={{ marginTop: 4 }}>
            {basis} · {charted.sourceName}
          </span>
        )}
        <div role="group" aria-label="Time range" className="aion-range-group">
          <TabGroup
            items={[...CHART_RANGES]}
            value={range}
            onChange={(value) => onRangeChange(value as ChartRange)}
            ranges
          />
        </div>
      </div>
      <ProbabilityChart
        points={points}
        window={bounds}
        historyStartsAt={charted.observations[0].observedAt}
        label={`${basis} probability, ${points.length} recorded ${points.length === 1 ? "observation" : "observations"} from ${formatDateTime(bounds.start)} to ${formatDateTime(bounds.end)}.`}
      />
      <p className="aion-chart-summary" data-testid="range-summary">
        {range === "ALL" ? "All recorded history" : `Last ${RANGE_LABEL[range]} of recorded history`}:{" "}
        {formatDateTime(bounds.start)} – {formatDateTime(bounds.end)}. The range ends at the latest recorded
        observation, not the current time.{" "}
        {change
          ? `${formatProbability(change.from.probability)} → ${formatProbability(change.to.probability)}, ${formatSignedPp(change.deltaPp)} over ${formatInterval(change.intervalMs)} (${points.length} observations).`
          : `Only one observation falls in this range, so no change can be computed for it.`}
        {before
          ? ` The previous observation, ${formatProbability(before.probability)} at ${formatDateTime(before.observedAt)}, is outside this range.`
          : ""}{" "}
        Lines join consecutive observations; no values are recorded between them.
      </p>
      <div className="aion-table-wrap">
        <table className="aion-table" data-testid="observation-table">
          <caption className="aion-table-caption">
            {points.length} of {charted.observations.length} recorded observations in this range
          </caption>
          <thead>
            <tr>
              <th scope="col">Observed (UTC)</th>
              <th scope="col" className="num">Probability</th>
              <th scope="col" className="num">Change from prior</th>
              <th scope="col">Captured by OMEN</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => {
              const index = charted.observations.indexOf(point)
              const prior = charted.observations[index - 1]
              const delta = prior ? Number((point.probability - prior.probability).toFixed(1)) : undefined
              return (
                <tr key={point.observedAt}>
                  <td className="aion-mono">{formatDateTime(point.observedAt)}</td>
                  <td className="num aion-mono">{formatProbability(point.probability)}</td>
                  <td className={`num aion-mono ${delta === undefined ? "" : delta > 0 ? "aion-up" : delta < 0 ? "aion-down" : ""}`}>
                    {delta === undefined ? "First observation" : formatSignedPp(delta)}
                  </td>
                  <td className="aion-mono">{point.capturedAt ? formatDateTime(point.capturedAt) : "Not recorded"}</td>
                  <td>{point.note ?? "—"}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

function RecordedChronology({ event, series }: { event: AionEvent; series: ProbabilitySeries | undefined }) {
  const entries = recordedChronology(event, series)
  if (entries.length === 0) return <p className="aion-note">No timestamped records are stored for this event.</p>
  return (
    <ol className="aion-chronology" data-testid="recorded-chronology">
      {entries.map((entry) => (
        <li key={`${entry.kind}-${entry.at}-${entry.text}`} data-kind={entry.kind}>
          <span className="aion-mono aion-chronology-time">{formatDateTime(entry.at)}</span>
          <span>
            {entry.text}
            {entry.deltaPp !== undefined ? (
              <span
                className={`aion-mono ${entry.deltaPp > 0 ? "aion-up" : entry.deltaPp < 0 ? "aion-down" : ""}`}
                style={{ marginLeft: 6, fontSize: 11 }}
              >
                {formatSignedPp(entry.deltaPp)}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  )
}

function Explanation({
  event,
  change,
  series,
}: {
  event: AionEvent
  change: ObservedChange | undefined
  series: ProbabilitySeries | undefined
}) {
  const linked = new Set(event.moveLog?.evidenceIds ?? [])
  const openQuestions = [
    ...event.unexplainedFactors,
    ...(event.anomaly ? [`${event.anomaly.title}: possible ${event.anomaly.interpretations.join(", ")}`] : []),
  ]
  return (
    <div className="aion-explanation">
      <section aria-labelledby="explain-observed">
        <h3 id="explain-observed">Observed</h3>
        <p className="aion-explanation-note">Recorded values and what sources said, with their times.</p>
        <ul>
          <li>
            {change
              ? `${seriesLabel(series)} was ${formatProbability(change.from.probability)} at ${formatDateTime(change.from.observedAt)} and ${formatProbability(change.to.probability)} at ${formatDateTime(change.to.observedAt)}: ${formatSignedPp(change.deltaPp)}.`
              : "Fewer than two probability observations are recorded."}
          </li>
          {event.evidence.length === 0 ? <li>No evidence is recorded for this event.</li> : null}
          {event.evidence.map((source) => (
            <li key={source.id}>
              <strong>{source.name}</strong>
              {linked.has(source.id) ? <span className="aion-chip" style={{ marginLeft: 6 }}>Cited by move log</span> : null}
              <br />
              {source.summary}{" "}
              <span className="aion-explanation-time">
                Published {source.publishedAt ? formatDateTime(source.publishedAt) : "— not stated by source"}
                {source.firstObservedAt ? ` · first observed by OMEN ${formatDateTime(source.firstObservedAt)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="explain-interpretation">
        <h3 id="explain-interpretation">Interpretation</h3>
        <p className="aion-explanation-note">
          {event.moveLog
            ? `Move log ${event.moveLog.id} v${event.moveLog.version} by ${event.moveLog.author}, published ${formatDateTime(event.moveLog.publishedAt)}.`
            : "No move log has been published. The text below is unpublished narrative, not a recorded attribution."}
          {event.provenance === "demo" ? " Illustrative demo text." : ""}
        </p>
        <ul>
          <li>
            <span className="aion-label">Likely cause</span> {event.likelyCause}
          </li>
          <li>{event.whatChanged}</li>
          {event.moveLog?.correctionNote ? <li>Correction: {event.moveLog.correctionNote}</li> : null}
        </ul>
      </section>
      <section aria-labelledby="explain-unknown">
        <h3 id="explain-unknown">Still unknown</h3>
        <ul>
          {openQuestions.length === 0 ? (
            <li>No open questions are recorded. That does not mean the move is fully explained.</li>
          ) : (
            openQuestions.map((item) => <li key={item}>{item}</li>)
          )}
        </ul>
      </section>
    </div>
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

function RecordLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function MoveLogNote({ moveLog }: { moveLog: NonNullable<AionEvent["moveLog"]> }) {
  return (
    <p className="aion-note" data-testid="move-log-note">
      Move log {moveLog.id} · version {moveLog.version} · published {formatDateTime(moveLog.publishedAt)} by{" "}
      {moveLog.author}
      {moveLog.version > 1 ? (
        <>
          {" "}
          · first published {formatDateTime(moveLog.firstPublishedAt)} · correction: {moveLog.correctionNote}
        </>
      ) : null}
    </p>
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
