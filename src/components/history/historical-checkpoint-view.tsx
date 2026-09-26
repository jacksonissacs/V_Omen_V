import Link from "next/link"

import type { HistoricalReconstruction } from "@/lib/domain/historical-reconstruction"

export function HistoricalCheckpointView({
  reconstruction,
  outcome,
}: {
  reconstruction: HistoricalReconstruction
  outcome: "reconstruction" | "pre_coverage"
}) {
  const semantics = reconstruction.semantics
  const title = semantics?.title ?? "Recorded members without semantic revision"
  return (
    <section className="aion-screen" data-testid="historical-checkpoint">
      <p className="aion-label">Checkpoint {reconstruction.checkpoint.sequence}</p>
      <h1>{title}</h1>
      {outcome === "pre_coverage" ? (
        <p className="aion-note" role="note">
          This checkpoint predates recorded semantic history. Current title and status are not shown.
        </p>
      ) : (
        <p className="aion-note" role="note">
          Historical reconstruction at checkpoint {reconstruction.checkpoint.id}. Current event text is not shown.
        </p>
      )}
      {semantics ? (
        <div className="aion-panel" style={{ marginTop: 16 }}>
          <p>
            <span className="aion-mono">{semantics.status}</span> · {semantics.question}
          </p>
          {semantics.correctionNote ? <p>Correction: {semantics.correctionNote}</p> : null}
        </div>
      ) : null}
      {reconstruction.moveLogs.length > 0 ? (
        <div className="aion-panel" style={{ marginTop: 16 }}>
          <h2>Move logs on record</h2>
          <ul>
            {reconstruction.moveLogs.map((log) => (
              <li key={`${log.moveLogId}-${log.version}`}>
                Move log {log.moveLogId} · version {log.version} · {log.whatChanged}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {reconstruction.evidence.length > 0 ? (
        <div className="aion-panel" id="event-evidence" style={{ marginTop: 16 }}>
          <h2>Evidence on record</h2>
          <ul>
            {reconstruction.evidence.map((item) => (
              <li key={item.id}>
                {item.sourceName}
                {item.sourceUrl ? (
                  <>
                    {" · "}
                    <a className="aion-evidence-link" href={item.sourceUrl}>
                      Open source
                    </a>
                  </>
                ) : null}
                {item.sourcePublishedAt ? null : <> · Not stated by source</>}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Link className="aion-button" data-primary="true" href={`/events/${reconstruction.eventId}`}>
        Return to present
      </Link>
    </section>
  )
}
