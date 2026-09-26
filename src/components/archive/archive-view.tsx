"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"

import { Field } from "@/components/common/field"
import { ScreenHead } from "@/components/common/screen-head"
import { HistoricalReconstructionPanel } from "@/components/history/historical-reconstruction-panel"
import { buildArchiveHref, buildEventHistoryHref } from "@/lib/archive/archive-url"
import {
  HISTORY_CHECKPOINT_LIST_DEFAULT,
  type HistoricalReconstruction,
  type HistoryCheckpointSummary,
} from "@/lib/domain/historical-reconstruction"
import type { Provenance } from "@/types/event"

export interface ArchiveEventOption {
  id: string
  title: string
}

export type ArchiveViewStatus =
  | "present"
  | "ok"
  | "pre_coverage"
  | "not_found"
  | "missing_checkpoint"
  | "verification_failed"
  | "unsupported_history"
  | "invalid_request"
  | "unavailable"

export type CheckpointDiscoveryStatus = "idle" | "loading" | "ready" | "empty" | "unsupported_history" | "unavailable"

export interface ArchiveViewProps {
  events: ArchiveEventOption[]
  storage: string
  provenance: Provenance | "mixed" | "none"
  initialEventId?: string
  initialCheckpoint?: string
  initialReconstruction?: HistoricalReconstruction | null
  initialCheckpoints?: HistoryCheckpointSummary[]
  initialStatus?: ArchiveViewStatus
}

type ReplayResponse = {
  outcome: string
  error?: string
  eventId?: string
  checkpoint?: HistoricalReconstruction["checkpoint"]
  coverage?: HistoricalReconstruction["coverage"]
  provenance?: HistoricalReconstruction["provenance"]
  semantics?: HistoricalReconstruction["semantics"]
  observations?: HistoricalReconstruction["observations"]
  evidence?: HistoricalReconstruction["evidence"]
  moveLogs?: HistoricalReconstruction["moveLogs"]
}

type CheckpointListResponse = {
  outcome?: string
  checkpoints?: HistoryCheckpointSummary[]
  hasMore?: boolean
  error?: string
}

const CHECKPOINT_PAGE_SIZE = HISTORY_CHECKPOINT_LIST_DEFAULT

function reconstructionFromResponse(body: ReplayResponse): HistoricalReconstruction | null {
  if (!body.eventId || !body.checkpoint || !body.coverage || !body.provenance) return null
  return {
    eventId: body.eventId,
    checkpoint: body.checkpoint,
    coverage: body.coverage,
    provenance: body.provenance,
    semantics: body.semantics ?? null,
    observations: body.observations ?? [],
    evidence: body.evidence ?? [],
    moveLogs: body.moveLogs ?? [],
  }
}

function mergeCheckpointPages(
  existing: HistoryCheckpointSummary[],
  incoming: HistoryCheckpointSummary[],
): HistoryCheckpointSummary[] {
  const byId = new Map(existing.map((item) => [item.id, item]))
  for (const item of incoming) byId.set(item.id, item)
  return [...byId.values()].sort((a, b) => b.sequence - a.sequence)
}

export function ArchiveView({
  events,
  storage,
  provenance,
  initialEventId,
  initialReconstruction = null,
  initialCheckpoints = [],
  initialStatus = "present",
}: ArchiveViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const limitationsId = useId()
  const checkpointListRef = useRef<HTMLUListElement>(null)
  const loadTokenRef = useRef(0)
  const [focusedCheckpoint, setFocusedCheckpoint] = useState(0)
  const [reconstruction, setReconstruction] = useState<HistoricalReconstruction | null>(initialReconstruction)
  const [checkpoints, setCheckpoints] = useState<HistoryCheckpointSummary[]>(initialCheckpoints)
  const [hasMoreCheckpoints, setHasMoreCheckpoints] = useState(false)
  const [discoveryStatus, setDiscoveryStatus] = useState<CheckpointDiscoveryStatus>(
    initialCheckpoints.length ? "ready" : "idle",
  )
  const [status, setStatus] = useState<ArchiveViewStatus>(initialStatus)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const urlEvent = searchParams.get("event")
  const urlCheckpoint = searchParams.get("checkpoint") ?? undefined
  const activeEventId = urlEvent ?? initialEventId ?? events[0]?.id ?? ""
  const inHistory = Boolean(urlCheckpoint)
  const viewReconstruction = inHistory ? reconstruction : null
  const viewStatus: ArchiveViewStatus = inHistory ? status : "present"

  const replaceUrl = useCallback(
    (nextEvent: string, checkpoint?: string) => {
      router.replace(buildArchiveHref(nextEvent, checkpoint), { scroll: false })
    },
    [router],
  )

  const mapHttpStatus = (httpStatus: number, body: ReplayResponse): ArchiveViewStatus => {
    if (httpStatus === 404) return "not_found"
    if (httpStatus === 503) return "unavailable"
    if (body.outcome === "pre_coverage") return "pre_coverage"
    if (body.outcome === "missing_checkpoint") return "missing_checkpoint"
    if (body.outcome === "verification_failed") return "verification_failed"
    if (body.outcome === "unsupported_history") return "unsupported_history"
    if (body.outcome === "invalid_request") return "invalid_request"
    if (httpStatus === 200 || body.outcome === "reconstruction") return "ok"
    return "unavailable"
  }

  const fetchCheckpointPage = useCallback(
    async (
      eventId: string,
      options: { beforeSequence?: number; signal?: AbortSignal },
    ): Promise<{ checkpoints: HistoryCheckpointSummary[]; hasMore: boolean; status: CheckpointDiscoveryStatus }> => {
      const params = new URLSearchParams({ limit: String(CHECKPOINT_PAGE_SIZE) })
      if (options.beforeSequence !== undefined) {
        params.set("beforeSequence", String(options.beforeSequence))
      }
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/history?${params.toString()}`, {
        signal: options.signal,
      })
      const body = (await response.json()) as CheckpointListResponse
      if (response.status === 503) return { checkpoints: [], hasMore: false, status: "unavailable" }
      if (response.status === 422 && body.outcome === "unsupported_history") {
        return { checkpoints: [], hasMore: false, status: "unsupported_history" }
      }
      if (!response.ok) return { checkpoints: [], hasMore: false, status: "unavailable" }
      const page = body.checkpoints ?? []
      return {
        checkpoints: page,
        hasMore: body.hasMore === true,
        status: page.length ? "ready" : "empty",
      }
    },
    [],
  )

  const loadCheckpoint = useCallback(
    async (nextEventId: string, checkpointId: string, signal?: AbortSignal) => {
      const token = ++loadTokenRef.current
      setLoading(true)
      setReconstruction(null)
      try {
        const [listed, replayResponse] = await Promise.all([
          fetchCheckpointPage(nextEventId, { signal }),
          fetch(`/api/events/${encodeURIComponent(nextEventId)}/history/${encodeURIComponent(checkpointId)}`, {
            signal,
          }),
        ])
        if (token !== loadTokenRef.current) return

        setCheckpoints(listed.checkpoints)
        setHasMoreCheckpoints(listed.hasMore)
        setDiscoveryStatus(listed.status)

        const body = (await replayResponse.json()) as ReplayResponse
        if (token !== loadTokenRef.current) return
        const nextStatus = mapHttpStatus(replayResponse.status, body)
        setStatus(nextStatus)
        if (nextStatus === "ok" || nextStatus === "pre_coverage") {
          setReconstruction(reconstructionFromResponse(body))
        } else {
          setReconstruction(null)
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        if (token !== loadTokenRef.current) return
        setStatus("unavailable")
        setReconstruction(null)
        setCheckpoints([])
        setHasMoreCheckpoints(false)
        setDiscoveryStatus("unavailable")
      } finally {
        if (token === loadTokenRef.current) setLoading(false)
      }
    },
    [fetchCheckpointPage],
  )

  const loadDiscovery = useCallback(
    async (nextEventId: string, signal?: AbortSignal) => {
      const token = ++loadTokenRef.current
      setDiscoveryStatus("loading")
      setCheckpoints([])
      setHasMoreCheckpoints(false)
      try {
        const listed = await fetchCheckpointPage(nextEventId, { signal })
        if (token !== loadTokenRef.current) return
        setCheckpoints(listed.checkpoints)
        setHasMoreCheckpoints(listed.hasMore)
        setDiscoveryStatus(listed.status)
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        if (token !== loadTokenRef.current) return
        setCheckpoints([])
        setHasMoreCheckpoints(false)
        setDiscoveryStatus("unavailable")
      }
    },
    [fetchCheckpointPage],
  )

  useEffect(() => {
    if (!activeEventId) return
    const controller = new AbortController()
    queueMicrotask(() => {
      if (urlCheckpoint) {
        void loadCheckpoint(activeEventId, urlCheckpoint, controller.signal)
      } else {
        void loadDiscovery(activeEventId, controller.signal)
      }
    })
    return () => controller.abort()
  }, [activeEventId, urlCheckpoint, loadCheckpoint, loadDiscovery])

  const sortedCheckpoints = useMemo(
    () => checkpoints.slice().sort((a, b) => b.sequence - a.sequence),
    [checkpoints],
  )

  const activeIndex = sortedCheckpoints.findIndex((item) => item.id === urlCheckpoint)
  const olderCheckpoint = activeIndex >= 0 ? sortedCheckpoints[activeIndex + 1] : undefined
  const newerCheckpoint = activeIndex > 0 ? sortedCheckpoints[activeIndex - 1] : undefined

  const loadOlderCheckpoints = async () => {
    const oldest = sortedCheckpoints.at(-1)
    if (!oldest || !hasMoreCheckpoints || loadingMore) return
    setLoadingMore(true)
    try {
      const listed = await fetchCheckpointPage(activeEventId, { beforeSequence: oldest.sequence })
      setCheckpoints((current) => {
        const merged = mergeCheckpointPages(current, listed.checkpoints)
        setDiscoveryStatus(merged.length ? "ready" : "empty")
        return merged
      })
      setHasMoreCheckpoints(listed.hasMore)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setDiscoveryStatus("unavailable")
      }
    } finally {
      setLoadingMore(false)
    }
  }

  const returnToPresent = () => {
    replaceUrl(activeEventId)
  }

  const onCheckpointKeyDown = (event: React.KeyboardEvent) => {
    if (!sortedCheckpoints.length) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setFocusedCheckpoint((value) => Math.min(value + 1, sortedCheckpoints.length - 1))
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setFocusedCheckpoint((value) => Math.max(value - 1, 0))
    }
    if (event.key === "Enter") {
      event.preventDefault()
      const checkpoint = sortedCheckpoints[focusedCheckpoint]
      if (checkpoint) replaceUrl(activeEventId, checkpoint.id)
    }
    if (event.key === "Escape" && inHistory) returnToPresent()
  }

  const provenanceLabel = useMemo(() => {
    if (provenance === "demo") return "Demo data"
    if (provenance === "sourced") return "Sourced data"
    if (provenance === "mixed") return "Demo + sourced data"
    return "Data unavailable"
  }, [provenance])

  const checkpointList = (
    <>
      <h2 style={{ fontSize: 12.5, margin: "16px 0 2px" }}>Recorded checkpoints for this event</h2>
      <p style={{ color: "var(--a-tx-2)", fontSize: 11.5, margin: 0 }}>
        Newest first. Each page lists up to {CHECKPOINT_PAGE_SIZE} checkpoints; choose one to replay its verified member
        set.
      </p>
      {discoveryStatus === "unsupported_history" ? (
        <p className="aion-note" role="alert" data-testid="archive-unsupported">
          Stored reconstruction is not available from this storage mode.
        </p>
      ) : null}
      {discoveryStatus === "unavailable" ? (
        <p className="aion-note" role="alert" data-testid="archive-unavailable">
          Archive storage is unavailable. Historical reconstruction cannot be loaded.
        </p>
      ) : null}
      {discoveryStatus === "empty" ? (
        <p className="aion-note" role="status" data-testid="archive-empty-checkpoints">
          No published history checkpoints are recorded for this event yet.
        </p>
      ) : null}
      {sortedCheckpoints.length ? (
        <ul
          ref={checkpointListRef}
          role="listbox"
          aria-label="Recorded checkpoints"
          tabIndex={0}
          onKeyDown={onCheckpointKeyDown}
          style={{ margin: "12px 0 0", paddingLeft: 18 }}
          data-testid="archive-checkpoint-list"
        >
          {sortedCheckpoints.map((checkpoint, index) => (
            <li key={checkpoint.id} role="option" aria-selected={checkpoint.id === urlCheckpoint}>
              <button
                type="button"
                className="aion-button"
                style={{
                  marginBottom: 6,
                  outline: index === focusedCheckpoint ? "1px solid var(--a-accent-line)" : undefined,
                }}
                onClick={() => replaceUrl(activeEventId, checkpoint.id)}
              >
                <span className="aion-mono">
                  #{checkpoint.sequence} · id {checkpoint.id}
                </span>{" "}
                · {checkpoint.memberCount} members · semantic {checkpoint.semanticHistory}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {hasMoreCheckpoints ? (
        <button
          type="button"
          className="aion-button"
          style={{ marginTop: 12 }}
          disabled={loadingMore || discoveryStatus === "loading"}
          onClick={() => void loadOlderCheckpoints()}
        >
          {loadingMore ? "Loading older checkpoints…" : "Load older checkpoints"}
        </button>
      ) : null}
    </>
  )

  return (
    <section className="aion-screen" aria-busy={loading || discoveryStatus === "loading"}>
      <ScreenHead
        title="Archive"
        description="Replay verified history checkpoints from stored observations, evidence and Move Log revisions."
      />

      <p className="aion-note" role="note" data-testid="archive-present-context">
        {inHistory ? (
          <>
            Viewing stored checkpoint history for{" "}
            <span className="aion-mono">{activeEventId || "—"}</span>. Current navigation and the live event record stay
            outside this view until you return to present.
          </>
        ) : (
          <>Choose an event and a published checkpoint. Share the URL to reproduce the same stored reconstruction.</>
        )}
      </p>

      <div className="aion-rewind" data-testid="archive-controls">
        <Field label="Event">
          <select
            value={activeEventId}
            aria-label="Event"
            onChange={(event) => {
              const next = event.target.value
              if (inHistory && urlCheckpoint) {
                replaceUrl(next, urlCheckpoint)
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
        {inHistory ? (
          <>
            <button
              type="button"
              className="aion-button"
              disabled={!olderCheckpoint || loading}
              onClick={() => olderCheckpoint && replaceUrl(activeEventId, olderCheckpoint.id)}
            >
              Previous checkpoint
            </button>
            <button
              type="button"
              className="aion-button"
              disabled={!newerCheckpoint || loading}
              onClick={() => newerCheckpoint && replaceUrl(activeEventId, newerCheckpoint.id)}
            >
              Next checkpoint
            </button>
            <button type="button" className="aion-button" data-primary="true" onClick={returnToPresent}>
              Return to present
            </button>
          </>
        ) : null}
      </div>

      <aside className="aion-note" aria-labelledby={limitationsId} data-testid="archive-coverage">
        <span className="aion-label" id={limitationsId}>
          Coverage limitations
        </span>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          <li>Replay uses published checkpoint membership only — not wall-clock cutoffs or fabricated checkpoint ids.</li>
          <li>
            Semantic title and status appear only when an eligible <span className="aion-mono">event_revisions</span>{" "}
            row is a checkpoint member.
          </li>
          <li>Demo storage does not publish checkpoints; use PostgreSQL mode for stored reconstruction.</li>
        </ul>
        <p style={{ margin: "8px 0 0", color: "var(--a-tx-2)", fontSize: 11.5 }}>
          Storage: {storage} · {provenanceLabel}.
        </p>
      </aside>

      {viewStatus === "unavailable" ? (
        <p className="aion-note" role="alert" data-testid="archive-replay-unavailable">
          Archive storage is unavailable. Historical reconstruction cannot be loaded.
        </p>
      ) : null}
      {viewStatus === "not_found" ? (
        <p className="aion-note" role="alert" data-testid="archive-not-found">
          That event was not found in the store.
        </p>
      ) : null}
      {viewStatus === "missing_checkpoint" ? (
        <p className="aion-note" role="alert" data-testid="archive-missing-checkpoint">
          No verified history checkpoint matches this event and checkpoint id.
        </p>
      ) : null}
      {viewStatus === "verification_failed" ? (
        <p className="aion-note" role="alert" data-testid="archive-verification-failed">
          This checkpoint failed verification and cannot be replayed.
        </p>
      ) : null}
      {viewStatus === "unsupported_history" && inHistory ? (
        <p className="aion-note" role="alert" data-testid="archive-replay-unsupported">
          Stored reconstruction is not available from this storage mode.
        </p>
      ) : null}
      {viewStatus === "invalid_request" ? (
        <p className="aion-note" role="alert" data-testid="archive-invalid-request">
          The checkpoint id in this URL is not valid. Checkpoint ids are positive decimal bigint strings from storage.
        </p>
      ) : null}
      {viewStatus === "pre_coverage" ? (
        <p className="aion-note" role="status" data-testid="archive-pre-coverage">
          This checkpoint predates recorded semantic revision history. Observations, evidence and Move Logs below are
          still verified members; title and status are withheld.
        </p>
      ) : null}

      {viewReconstruction ? (
        <>
          <HistoricalReconstructionPanel
            reconstruction={viewReconstruction}
            preCoverage={viewStatus === "pre_coverage"}
          />
          {checkpointList}
          {urlCheckpoint ? (
            <p style={{ marginTop: 12 }}>
              <Link className="aion-button" href={buildEventHistoryHref(activeEventId, urlCheckpoint)}>
                Open this checkpoint on the event route
              </Link>
            </p>
          ) : null}
        </>
      ) : viewStatus === "present" ? (
        <>
          <div className="aion-panel">
            <h2>Checkpoint reconstruction</h2>
            <p className="aion-note" style={{ border: 0, margin: 0, padding: 0 }}>
              Select a published checkpoint from the list below, or open a shareable{" "}
              <span className="aion-mono">/archive?event=…&amp;checkpoint=…</span> link.
            </p>
          </div>
          {activeEventId ? checkpointList : null}
        </>
      ) : null}
    </section>
  )
}
