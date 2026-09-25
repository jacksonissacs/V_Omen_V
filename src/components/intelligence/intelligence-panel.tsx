import { Kv } from "@/components/common/kv"
import { formatDateTime } from "@/lib/format"
import type { AionEvent } from "@/types/event"

export function IntelligencePanel({
  event,
  tab,
}: {
  event: AionEvent
  tab: "Source" | "Evidence" | "Attribution" | "Analogues"
}) {
  if (tab === "Evidence") {
    return (
      <div className="aion-inspector-body">
        <div className="aion-inspector-title">Supporting and contradictory evidence</div>
        {event.evidence.map((item) => (
          <div key={item.id} className="aion-evidence-block">
            <div className="aion-inspector-section">{item.name}</div>
            <p>{item.summary}</p>
            <Kv label="Stance" value={item.stance} />
            <Kv label="Reliability" value={`${Math.round(item.reliability * 100)}%`} />
            {item.firstObservedAt ? (
              <>
                <Kv
                  label="Source published"
                  value={item.publishedAt ? formatDateTime(item.publishedAt) : "Not stated by source"}
                />
                <Kv label="First observed by OMEN" value={formatDateTime(item.firstObservedAt)} />
              </>
            ) : null}
          </div>
        ))}
      </div>
    )
  }

  if (tab === "Attribution") {
    return (
      <div className="aion-inspector-body">
        <div className="aion-inspector-title">OMEN attribution</div>
        <Kv label="Likely cause" value={event.likelyCause} />
        <Kv label="Coverage of move" value={`${event.explained}%`} />
        <Kv label="Identification" value={event.confidence} />
        {event.moveLog ? (
          <Kv label="Move log revision" value={`v${event.moveLog.version} · ${formatDateTime(event.moveLog.publishedAt)}`} />
        ) : null}
        <div className="aion-inspector-section">Unexplained</div>
        {event.unexplainedFactors.map((factor) => (
          <p key={factor}>{factor}</p>
        ))}
      </div>
    )
  }

  if (tab === "Analogues") {
    return (
      <div className="aion-inspector-body">
        <div className="aion-inspector-title">Comparable expectation shocks</div>
        {event.analogues.length === 0 ? (
          <p>No scored analogues for this event yet.</p>
        ) : (
          event.analogues.map((analogue) => (
            <div key={analogue.id} className="aion-evidence-block">
              <div className="aion-inspector-section">
                {analogue.title} · {analogue.year}
              </div>
              <Kv label="Similarity" value={`${Math.round(analogue.similarity * 100)}%`} />
              <p>{analogue.outcome}</p>
              <p className="aion-note">{analogue.lesson}</p>
            </div>
          ))
        )}
      </div>
    )
  }

  const source = event.sources[0]
  return (
    <div className="aion-inspector-body">
      <div className="aion-inspector-title">{source?.name ?? event.catalyst}</div>
      {source?.firstObservedAt ? (
        <>
          <Kv
            label="Published"
            value={source.publishedAt ? formatDateTime(source.publishedAt) : "Not stated by source"}
          />
          <Kv label="First observed by OMEN" value={formatDateTime(source.firstObservedAt)} />
        </>
      ) : (
        <>
          <Kv label="Published" value={event.catalystTime} />
          <Kv label="First observed by OMEN" value={event.displayTime} />
        </>
      )}
      <Kv label="Source reliability" value={`Tier ${event.sourceTier}`} />
      <Kv label="Historical relevance" value={event.confidence} />
      <div className="aion-inspector-section">Entities</div>
      <div className="aion-entity-row">
        {event.entities.map((entity) => (
          <span className="aion-chip" key={entity}>
            {entity}
          </span>
        ))}
      </div>
      {source ? <p>{source.summary}</p> : null}
    </div>
  )
}
