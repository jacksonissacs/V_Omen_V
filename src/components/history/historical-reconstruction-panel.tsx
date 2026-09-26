import { Kv } from "@/components/common/kv"
import { seriesFromHistoricalObservations } from "@/lib/archive/historical-series"
import { formatDateTime } from "@/lib/format"
import type { HistoricalReconstruction } from "@/lib/domain/historical-reconstruction"
import {
  BASIS_LABEL,
  latestChange,
  probabilityBasis,
} from "@/lib/domain/probability-history"
import { formatProbability, formatSignedPp } from "@/lib/domain/scoring"

export function HistoricalReconstructionPanel({
  reconstruction,
  preCoverage,
}: {
  reconstruction: HistoricalReconstruction
  preCoverage?: boolean
}) {
  const series = seriesFromHistoricalObservations(reconstruction.observations)
  const headline = series[0]
  const headlineChange = latestChange(headline)
  const semantics = reconstruction.semantics

  return (
    <div className="aion-point-frame" data-testid="historical-reconstruction">
      <p className="aion-label" data-testid="historical-context-banner">
        Historical checkpoint view · not the current record
      </p>
      <p style={{ color: "var(--a-tx-2)", fontSize: 12, margin: "0 0 16px" }}>
        Verified checkpoint{" "}
        <span className="aion-mono" style={{ color: "var(--a-accent)" }}>
          #{reconstruction.checkpoint.sequence} · id {reconstruction.checkpoint.id}
        </span>
        . Member count {reconstruction.checkpoint.memberCount}. Semantic history{" "}
        {reconstruction.coverage.semanticHistory}.
        {preCoverage ? " Semantic fields are pre-coverage for this checkpoint." : null}
      </p>

      <div className="aion-replay-state">
        <div className="aion-panel">
          <h2>Event semantics in this checkpoint</h2>
          {semantics ? (
            <>
              <Kv label="Title" value={semantics.title} />
              <Kv label="Status" value={semantics.status} />
              <Kv label="Question" value={semantics.question} />
              <Kv label="Summary" value={semantics.summary} />
            </>
          ) : (
            <p className="aion-note" style={{ border: 0, margin: 0, padding: 0 }} data-testid="semantics-withheld">
              Title, status and related semantic fields are not recorded in this checkpoint
              {reconstruction.coverage.semanticHistory === "unavailable"
                ? " (semantic revision history begins at the coverage baseline)."
                : "."}
            </p>
          )}
        </div>
        <div className="aion-panel" style={{ marginTop: 0 }}>
          <h2>Headline probability in this checkpoint</h2>
          {headline ? (
            <>
              <Kv
                label={BASIS_LABEL[probabilityBasis(headline)]}
                value={
                  headline.observations.at(-1)
                    ? formatProbability(headline.observations.at(-1)!.probability)
                    : "Not recorded"
                }
              />
              <Kv
                label="Previous observation"
                value={
                  headline.observations.length > 1
                    ? formatProbability(headline.observations.at(-2)!.probability)
                    : "None recorded"
                }
              />
              <Kv
                label="Change"
                value={headlineChange ? formatSignedPp(headlineChange.deltaPp) : "Not computable"}
              />
            </>
          ) : (
            <p className="aion-note" style={{ border: 0, margin: 0, padding: 0 }}>
              No probability observations are members of this checkpoint.
            </p>
          )}
        </div>
      </div>

      <div className="aion-replay-state" style={{ marginTop: 16 }}>
        <div className="aion-panel">
          <h2>Observations in this checkpoint</h2>
          {series.length ? (
            series.map((item) => (
              <div key={item.id} style={{ marginBottom: 12 }}>
                <p className="aion-label">{item.sourceName}</p>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {item.observations.map((point) => (
                    <li key={`${item.id}-${point.observedAt}`}>
                      <span className="aion-mono">{formatDateTime(point.observedAt)}</span> ·{" "}
                      {formatProbability(point.probability)}
                      {point.note ? ` · ${point.note}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <p className="aion-note" style={{ border: 0, margin: 0, padding: 0 }}>
              No observations are members of this checkpoint.
            </p>
          )}
        </div>
        <div className="aion-panel" style={{ marginTop: 0 }}>
          <h2>Evidence in this checkpoint</h2>
          {reconstruction.evidence.length ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {reconstruction.evidence.map((item) => (
                <li key={item.id}>
                  {item.sourceName}
                  {item.sourcePublishedAt ? ` · published ${formatDateTime(item.sourcePublishedAt)}` : ""}
                  {item.sourceUrl ? (
                    <>
                      {" "}
                      ·{" "}
                      <a className="aion-evidence-link" href={item.sourceUrl}>
                        Open source
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="aion-note" style={{ border: 0, margin: 0, padding: 0 }}>
              No evidence items are members of this checkpoint.
            </p>
          )}
        </div>
      </div>

      <div className="aion-panel" style={{ marginTop: 16 }}>
        <h2>Move Log revisions in this checkpoint</h2>
        {reconstruction.moveLogs.length ? (
          reconstruction.moveLogs.map((log) => (
            <div key={log.id} style={{ marginBottom: 16 }}>
              <Kv label="Move log" value={`${log.moveLogId} v${log.version}`} />
              <Kv label="Published" value={formatDateTime(log.publishedAt)} />
              <Kv
                label="Explained"
                value={log.explainedPct === null ? "Not recorded" : `${log.explainedPct}%`}
              />
              <p style={{ color: "var(--a-tx-2)", fontSize: 12 }}>{log.whatChanged}</p>
              {log.correctionNote ? (
                <p style={{ color: "var(--a-tx-2)", fontSize: 12 }}>{log.correctionNote}</p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="aion-note" style={{ border: 0, margin: 0, padding: 0 }}>
            No move log revisions are members of this checkpoint.
          </p>
        )}
      </div>
    </div>
  )
}
