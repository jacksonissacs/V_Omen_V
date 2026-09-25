import { Kv } from "@/components/common/kv"
import { formatDateTime } from "@/lib/format"
import { BASIS_LABEL, latestCompleteForecast, probabilityBasis } from "@/lib/domain/probability-history"
import type { AionEvent } from "@/types/event"

export type InspectorTab = "Evidence" | "Record" | "Analogues"

const STANCE_LABEL = { supports: "Supports", contradicts: "Contradicts", contextual: "Context" } as const

export function IntelligencePanel({ event, tab }: { event: AionEvent; tab: InspectorTab }) {
  if (tab === "Record") return <RecordTab event={event} />

  if (tab === "Analogues") {
    return (
      <div className="aion-inspector-body">
        <div className="aion-inspector-title">Comparable expectation shocks</div>
        <p className="aion-explanation-note">
          Editorial comparisons{event.provenance === "demo" ? " (illustrative demo text)" : ""}. No similarity score is
          computed.
        </p>
        {event.analogues.length === 0 ? (
          <p>No analogues are recorded for this event.</p>
        ) : (
          event.analogues.map((analogue) => (
            <div key={analogue.id} className="aion-evidence-block">
              <div className="aion-inspector-section">
                {analogue.title} · {analogue.year}
              </div>
              <p>{analogue.outcome}</p>
              <p className="aion-note">{analogue.lesson}</p>
            </div>
          ))
        )}
      </div>
    )
  }

  const cited = new Set(event.moveLog?.evidenceIds ?? [])
  return (
    <div className="aion-inspector-body" id="event-evidence">
      <div className="aion-inspector-title">Evidence on record</div>
      {event.evidence.length === 0 ? <p>No evidence is recorded for this event.</p> : null}
      {event.evidence.map((item) => (
        <div key={item.id} className="aion-evidence-block" data-testid="evidence-item">
          <div className="aion-inspector-section">{item.name}</div>
          <p>{item.summary}</p>
          <Kv label="Stance" value={STANCE_LABEL[item.stance]} />
          <Kv label="Cited by move log" value={cited.has(item.id) ? "Yes" : "No"} />
          <Kv label="Source published" value={item.publishedAt ? formatDateTime(item.publishedAt) : "Not stated by source"} />
          <Kv
            label="First observed by OMEN"
            value={item.firstObservedAt ? formatDateTime(item.firstObservedAt) : "Not recorded"}
          />
          <Kv label="Captured by OMEN" value={item.capturedAt ? formatDateTime(item.capturedAt) : "Not recorded"} />
          <Kv label="Recorder's reliability rating" value={`${item.reliability.toFixed(2)} of 1`} />
          {item.url ? (
            <a className="aion-evidence-link" href={item.url} target="_blank" rel="noreferrer">
              Open source ↗
            </a>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function RecordTab({ event }: { event: AionEvent }) {
  const forecast = latestCompleteForecast(event.forecasts)
  return (
    <div className="aion-inspector-body">
      <div className="aion-inspector-title">What is on record</div>
      <Kv label="Event record" value={event.provenance === "demo" ? "Demo · illustrative" : "Sourced"} />
      <Kv label="Feed status" value="Not a live feed" />
      {event.probabilitySeries.length === 0 ? <p>No probability series is recorded.</p> : null}
      {event.probabilitySeries.map((series, index) => {
        const first = series.observations[0]
        const last = series.observations.at(-1)
        return (
          <div key={series.id} className="aion-evidence-block" data-testid="series-record">
            <div className="aion-inspector-section">
              {index === 0 ? "Headline series" : "Other series"} · {BASIS_LABEL[probabilityBasis(series)]}
            </div>
            <Kv label="Source" value={series.sourceName} />
            <Kv label="Observations" value={String(series.observations.length)} />
            {first ? <Kv label="First observed" value={formatDateTime(first.observedAt)} /> : null}
            {last ? <Kv label="Latest observed" value={formatDateTime(last.observedAt)} /> : null}
            {last ? (
              <Kv label="Latest captured" value={last.capturedAt ? formatDateTime(last.capturedAt) : "Not recorded"} />
            ) : null}
          </div>
        )
      })}
      <div className="aion-inspector-section">Move log</div>
      {event.moveLog ? (
        <>
          <Kv label="Revision" value={`v${event.moveLog.version} · ${formatDateTime(event.moveLog.publishedAt)}`} />
          <Kv label="Author" value={event.moveLog.author} />
        </>
      ) : (
        <p>None published.</p>
      )}
      <div className="aion-inspector-section">OMEN forecast</div>
      {forecast ? (
        <>
          <Kv label="Probability" value={`${forecast.probability.toFixed(1)}%`} />
          <Kv label="Author" value={[forecast.author, forecast.model].filter(Boolean).join(" · ")} />
          <Kv label="Issued" value={formatDateTime(forecast.issuedAt)} />
          <Kv label="Evidence cutoff" value={formatDateTime(forecast.evidenceCutoff)} />
          <p>{forecast.method}</p>
        </>
      ) : (
        <p>None recorded.</p>
      )}
    </div>
  )
}
