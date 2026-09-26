"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"

import { Field } from "@/components/common/field"
import { Kv } from "@/components/common/kv"
import { ScreenHead } from "@/components/common/screen-head"
import { formatDateTime } from "@/lib/format"
import {
  COMMON_ARCHIVE_TIME_ZONES,
  encodeCheckpointId,
  headlineChangeAt,
  zonedDateTimeToUtc,
  type HistoricalReconstruction,
  type HistoryCheckpoint,
} from "@/lib/domain/historical-reconstruction"
import { BASIS_LABEL, probabilityBasis } from "@/lib/domain/probability-history"
import { formatProbability, formatSignedPp } from "@/lib/domain/scoring"
import type { Provenance } from "@/types/event"

export interface ArchiveEventOption {
  id: string
  title: string
}

export interface ArchiveViewProps {
  events: ArchiveEventOption[]
  storage: string
  provenance: Provenance | "mixed" | "none"
  initialEventId?: string
  initialCutoff?: string
  initialCheckpoint?: string
  initialReconstruction?: HistoricalReconstruction | null
  initialStatus?: "present" | "ok" | "not_found" | "no_history" | "unavailable"
}

type ViewStatus = ArchiveViewProps["initialStatus"]

function utcParts(iso: string): { date: string; time: string } {
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) }
}

function buildArchiveHref(eventId: string, cutoff?: string, checkpoint?: string): string {
  const params = new URLSearchParams({ event: eventId })
  if (cutoff) params.set("cutoff", cutoff)
  if (checkpoint) params.set("checkpoint", checkpoint)
  return `/archive?${params.toString()}`
}

export function ArchiveView({
  events,
  storage,
  provenance,
  initialEventId,
  initialCutoff,
  initialReconstruction,
  initialStatus = "present",
}: ArchiveViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const limitationsId = useId()
  const checkpointListRef = useRef<HTMLUListElement>(null)
  const [focusedCheckpoint, setFocusedCheckpoint] = useState(0)
  const [date, setDate] = useState(initialCutoff ? utcParts(initialCutoff).date : "2026-08-17")
  const [time, setTime] = useState(initialCutoff ? utcParts(initialCutoff).time : "14:36:00")
  const [timeZone, setTimeZone] = useState("America/Toronto")
  const [reconstruction, setReconstruction] = useState<HistoricalReconstruction | null>(
    initialReconstruction ?? null,
  )
  const [status, setStatus] = useState<ViewStatus>(initialStatus)
  const [loading, setLoading] = useState(false)

  const urlEvent = searchParams.get("event")
  const urlCutoff = searchParams.get("cutoff")
  const urlCheckpoint = searchParams.get("checkpoint") ?? undefined
  const activeEventId = urlEvent ?? initialEventId ?? events[0]?.id ?? ""
  const inHistory = Boolean(urlCutoff)
  const viewStatus: ViewStatus = inHistory ? status : "present"
  const viewReconstruction = inHistory ? reconstruction : null

  const replaceUrl = useCallback(
    (nextEvent: string, cutoff?: string, checkpoint?: string) => {
      const params = new URLSearchParams()
      if (nextEvent) params.set("event", nextEvent)
      if (cutoff) params.set("cutoff", cutoff)
      if (checkpoint) params.set("checkpoint", checkpoint)
      const query = params.toString()
      router.replace(query ? `/archive?${query}` : "/archive", { scroll: false })
    },
    [router],
  )

  const loadReconstruction = useCallback(
    async (nextEventId: string, cutoff: string, nextCheckpoint?: string, signal?: AbortSignal) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ event: nextEventId, cutoff })
        if (nextCheckpoint) params.set("checkpoint", nextCheckpoint)
        const response = await fetch(`/api/archive/reconstruct?${params.toString()}`, { signal })
        if (response.status === 503) {
          setStatus("unavailable")
          setReconstruction(null)
          return
        }
        if (response.status === 404) {
          setStatus("not_found")
          setReconstruction(null)
          return
        }
        if (response.status === 422) {
          setStatus("no_history")
          setReconstruction(null)
          return
        }
        if (!response.ok) {
          setStatus("unavailable")
          setReconstruction(null)
          return
        }
        const body = (await response.json()) as { reconstruction: HistoricalReconstruction }
        setReconstruction(body.reconstruction)
        setStatus("ok")
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        setStatus("unavailable")
        setReconstruction(null)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!activeEventId || !urlCutoff) return
    const controller = new AbortController()
    queueMicrotask(() => {
      void loadReconstruction(activeEventId, urlCutoff, urlCheckpoint, controller.signal)
    })
    return () => controller.abort()
  }, [activeEventId, urlCutoff, urlCheckpoint, loadReconstruction])

  const checkpoints = useMemo(() => viewReconstruction?.checkpoints ?? [], [viewReconstruction])

  const applyInstantCutoff = async () => {
    let cutoff: string
    try {
      cutoff = zonedDateTimeToUtc(date, time, timeZone)
    } catch {
      setStatus("no_history")
      return
    }
    replaceUrl(activeEventId, cutoff)
  }

  const applyCheckpoint = (checkpoint: HistoryCheckpoint) => {
    replaceUrl(activeEventId, checkpoint.availableAt, checkpoint.id)
  }

  const returnToPresent = () => {
    replaceUrl(activeEventId)
  }

  const onCheckpointKeyDown = (event: React.KeyboardEvent) => {
    if (!checkpoints.length) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setFocusedCheckpoint((value) => Math.min(value + 1, checkpoints.length - 1))
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setFocusedCheckpoint((value) => Math.max(value - 1, 0))
    }
    if (event.key === "Enter") {
      event.preventDefault()
      const checkpoint = checkpoints[focusedCheckpoint]
      if (checkpoint) applyCheckpoint(checkpoint)
    }
    if (event.key === "Escape") returnToPresent()
  }

  const headlineDelta = viewReconstruction ? headlineChangeAt(viewReconstruction) : undefined
  const headlineSeries = viewReconstruction?.probabilitySeries[0]

  const provenanceLabel = useMemo(() => {
    if (provenance === "demo") return "Demo data"
    if (provenance === "sourced") return "Sourced data"
    if (provenance === "mixed") return "Demo + sourced data"
    return "Data unavailable"
  }, [provenance])

  return (
    <section className="aion-screen" aria-busy={loading}>
      <ScreenHead
        title="Archive"
        description="Reconstruct what was recorded at a past instant from stored observations, evidence and move logs."
      />

      <div className="aion-rewind" data-testid="archive-controls">
        <Field label="Event">
          <select
            value={activeEventId}
            aria-label="Event"
            onChange={(event) => {
              const next = event.target.value
              if (inHistory && viewReconstruction) {
                replaceUrl(next, viewReconstruction.cutoff, urlCheckpoint)
              } else {
                replaceUrl(next)
              }
            }}
          >
            {events.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Rewind to — date (local)">
          <input
            type="date"
            value={date}
            aria-label="Rewind date"
            disabled={Boolean(urlCheckpoint)}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <Field label="Time (local)">
          <input
            type="time"
            step={1}
            value={time}
            aria-label="Rewind time"
            disabled={Boolean(urlCheckpoint)}
            onChange={(event) => setTime(event.target.value)}
          />
        </Field>
        <Field label="Timezone (IANA)">
          <select
            value={timeZone}
            aria-label="Timezone"
            disabled={Boolean(urlCheckpoint)}
            onChange={(event) => setTimeZone(event.target.value)}
          >
            {COMMON_ARCHIVE_TIME_ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </Field>
        <button type="button" className="aion-button" data-primary="true" disabled={loading || !activeEventId} onClick={() => applyInstantCutoff()}>
          {loading ? "Loading…" : "Reconstruct at instant"}
        </button>
        {inHistory ? (
          <button type="button" className="aion-button" onClick={returnToPresent}>
            Return to present
          </button>
        ) : null}
      </div>

      <aside className="aion-note" aria-labelledby={limitationsId} data-testid="archive-coverage">
        <span className="aion-label" id={limitationsId}>
          Coverage limitations
        </span>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {(viewReconstruction?.limitations ?? []).map((item) => (
            <li key={item.id}>{item.text}</li>
          ))}
          {!viewReconstruction?.limitations.length ? (
            <li>Select an event and cutoff to see reconstruction coverage for that view.</li>
          ) : null}
        </ul>
        <p style={{ margin: "8px 0 0", color: "var(--a-tx-2)", fontSize: 11.5 }}>
          Storage: {storage} · {provenanceLabel}. Checkpoints list exact recorded availability times; arbitrary
          replay uses the UTC instant derived from the date, time and IANA zone above.
        </p>
      </aside>

      {viewStatus === "unavailable" ? (
        <p className="aion-note" role="alert" data-testid="archive-unavailable">
          Archive storage is unavailable. Historical reconstruction cannot be loaded.
        </p>
      ) : null}
      {viewStatus === "not_found" ? (
        <p className="aion-note" role="alert" data-testid="archive-not-found">
          That event was not found in the store.
        </p>
      ) : null}
      {viewStatus === "no_history" ? (
        <p className="aion-note" role="alert" data-testid="archive-no-history">
          No recorded observations are available at or before that cutoff for this event.
        </p>
      ) : null}

      {viewReconstruction ? (
        <div className="aion-point-frame" data-testid="archive-reconstruction">
          <p style={{ color: "var(--a-tx-2)", fontSize: 12, margin: "0 0 16px" }}>
            Point-in-time view at{" "}
            <span className="aion-mono" style={{ color: "var(--a-accent)" }}>
              {formatDateTime(viewReconstruction.cutoff)}
            </span>
            {viewReconstruction.checkpointId ? " (recorded checkpoint)" : " (arbitrary instant)"}. This view reflects
            only information available then.
          </p>

          <div className="aion-replay-state">
            <div className="aion-panel">
              <h2>Event semantics then</h2>
              {viewReconstruction.semantics.available ? (
                <>
                  <Kv label="Title" value={viewReconstruction.semantics.title} />
                  <Kv label="Status" value={viewReconstruction.semantics.status} />
                </>
              ) : (
                <p className="aion-note" style={{ border: 0, margin: 0, padding: 0 }}>
                  Title and status are withheld because semantic revision history is not available for this cutoff.
                </p>
              )}
              <Kv label="Question" value={viewReconstruction.semantics.question} />
              <Kv label="Summary" value={viewReconstruction.semantics.summary} />
            </div>
            <div className="aion-panel" style={{ marginTop: 0 }}>
              <h2>Headline probability then</h2>
              {headlineSeries ? (
                <>
                  <Kv
                    label={BASIS_LABEL[probabilityBasis(headlineSeries)]}
                    value={
                      viewReconstruction.headlineProbability !== undefined
                        ? formatProbability(viewReconstruction.headlineProbability)
                        : "Not recorded"
                    }
                  />
                  <Kv
                    label="Previous observation"
                    value={
                      viewReconstruction.previousProbability !== undefined
                        ? formatProbability(viewReconstruction.previousProbability)
                        : "None recorded"
                    }
                  />
                  <Kv
                    label="Change"
                    value={headlineDelta !== undefined ? formatSignedPp(headlineDelta) : "Not computable"}
                  />
                </>
              ) : (
                <p className="aion-note" style={{ border: 0, margin: 0, padding: 0 }}>
                  No probability series is recorded at this cutoff.
                </p>
              )}
            </div>
          </div>

          <div className="aion-replay-state" style={{ marginTop: 16 }}>
            <div className="aion-panel">
              <h2>Observations available</h2>
              {viewReconstruction.probabilitySeries.map((series) => (
                <div key={series.id} style={{ marginBottom: 12 }}>
                  <p className="aion-label">{series.sourceName}</p>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {series.observations.map((point) => (
                      <li key={`${series.id}-${point.observedAt}`}>
                        <span className="aion-mono">{formatDateTime(point.observedAt)}</span> ·{" "}
                        {formatProbability(point.probability)}
                        {point.note ? ` · ${point.note}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="aion-panel" style={{ marginTop: 0 }}>
              <h2>Evidence available</h2>
              {viewReconstruction.evidence.length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {viewReconstruction.evidence.map((item) => (
                    <li key={item.id}>
                      {item.name}
                      {item.publishedAt ? ` · published ${formatDateTime(item.publishedAt)}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="aion-note" style={{ border: 0, margin: 0, padding: 0 }}>
                  No evidence records were available yet at this cutoff.
                </p>
              )}
            </div>
          </div>

          <div className="aion-panel" style={{ marginTop: 16 }}>
            <h2>Eligible Move Log revision</h2>
            {viewReconstruction.moveLog ? (
              <>
                <Kv label="Move log" value={`${viewReconstruction.moveLog.id} v${viewReconstruction.moveLog.version}`} />
                <Kv label="Published" value={formatDateTime(viewReconstruction.moveLog.publishedAt)} />
                <Kv label="Explained" value={`${viewReconstruction.moveLog.explainedPct}%`} />
                <p style={{ color: "var(--a-tx-2)", fontSize: 12 }}>{viewReconstruction.moveLog.whatChanged}</p>
              </>
            ) : (
              <p className="aion-note" style={{ border: 0, margin: 0, padding: 0 }}>
                No move log revision was published and available yet at this cutoff.
              </p>
            )}
          </div>

          <h2 style={{ fontSize: 12.5, margin: "16px 0 2px" }}>Recorded checkpoints</h2>
          <p style={{ color: "var(--a-tx-2)", fontSize: 11.5, margin: 0 }}>
            Choose a checkpoint to jump to its exact recorded availability time (not an arbitrary second between
            checkpoints).
          </p>
          <ul
            ref={checkpointListRef}
            role="listbox"
            aria-label="Recorded checkpoints"
            tabIndex={0}
            onKeyDown={onCheckpointKeyDown}
            style={{ margin: "12px 0 0", paddingLeft: 18 }}
          >
            {checkpoints.map((checkpoint, index) => (
              <li key={checkpoint.id} role="option" aria-selected={checkpoint.id === urlCheckpoint}>
                <button
                  type="button"
                  className="aion-button"
                  style={{
                    marginBottom: 6,
                    outline: index === focusedCheckpoint ? "1px solid var(--a-accent-line)" : undefined,
                  }}
                  onClick={() => void applyCheckpoint(checkpoint)}
                >
                  <span className="aion-mono">{formatDateTime(checkpoint.availableAt)}</span> · {checkpoint.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : viewStatus === "present" ? (
        <div className="aion-panel">
          <h2>Point-in-time analysis</h2>
          <p className="aion-note" style={{ border: 0, margin: 0, padding: 0 }}>
            Choose an event and a cutoff to restore only the observations, evidence and move log revisions that were
            available at that time. Share the URL to reproduce the same historical view.
          </p>
        </div>
      ) : null}
    </section>
  )
}

export function archiveHistoryHref(eventId: string, checkpointAvailableAt: string): string {
  const checkpoint = encodeCheckpointId("observation", checkpointAvailableAt)
  return buildArchiveHref(eventId, checkpointAvailableAt, checkpoint)
}

export function ArchiveHistoryLink({ eventId, cutoff }: { eventId: string; cutoff: string }) {
  return (
    <Link className="aion-button" href={archiveHistoryHref(eventId, cutoff)}>
      View history at this moment
    </Link>
  )
}
