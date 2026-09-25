import { probabilityDelta } from "@/lib/domain/scoring"
import type {
  ObservationSourceKind,
  ProbabilityObservation,
  ProbabilitySeries,
  ProbabilityType,
  Provenance,
  StoredForecast,
} from "@/types/event"

export const CHART_RANGES = ["1H", "6H", "1D", "1W", "1M", "ALL"] as const
export type ChartRange = (typeof CHART_RANGES)[number]

const HOUR = 3_600_000
const RANGE_MS: Record<Exclude<ChartRange, "ALL">, number> = {
  "1H": HOUR,
  "6H": 6 * HOUR,
  "1D": 24 * HOUR,
  "1W": 7 * 24 * HOUR,
  "1M": 30 * 24 * HOUR,
}

export const RANGE_LABEL: Record<ChartRange, string> = {
  "1H": "1 hour",
  "6H": "6 hours",
  "1D": "1 day",
  "1W": "1 week",
  "1M": "30 days",
  ALL: "all recorded history",
}

export interface SeriesIdentity {
  sourceKind: ObservationSourceKind
  sourceName: string
  probabilityType: ProbabilityType
  provenance: Provenance
}

export function seriesId(identity: SeriesIdentity): string {
  return [identity.sourceKind, identity.sourceName, identity.probabilityType, identity.provenance].join(":")
}

const time = (iso: string) => new Date(iso).getTime()

function lastObservedAt(series: ProbabilitySeries): number {
  const last = series.observations[series.observations.length - 1]
  return last ? time(last.observedAt) : Number.NEGATIVE_INFINITY
}

/**
 * Headline series first: market-implied series before authored ones, then the
 * most recently observed. Observations inside each series are sorted oldest first.
 */
export function orderSeries(series: ProbabilitySeries[]): ProbabilitySeries[] {
  return series
    .map((item) => ({
      ...item,
      observations: item.observations.slice().sort((a, b) => time(a.observedAt) - time(b.observedAt)),
    }))
    .sort((a, b) => {
      const byType = Number(b.probabilityType === "market_implied") - Number(a.probabilityType === "market_implied")
      if (byType !== 0) return byType
      const byTime = lastObservedAt(b) - lastObservedAt(a)
      return byTime !== 0 ? byTime : a.id.localeCompare(b.id)
    })
}

/** Splits flat observation records into comparable series, headline first. */
export function groupIntoSeries(
  records: Array<SeriesIdentity & ProbabilityObservation>,
): ProbabilitySeries[] {
  const byId = new Map<string, ProbabilitySeries>()
  for (const record of records) {
    const id = seriesId(record)
    const series = byId.get(id) ?? {
      id,
      sourceKind: record.sourceKind,
      sourceName: record.sourceName,
      probabilityType: record.probabilityType,
      provenance: record.provenance,
      observations: [],
    }
    series.observations.push({
      observedAt: record.observedAt,
      capturedAt: record.capturedAt,
      probability: record.probability,
      ...(record.note ? { note: record.note } : {}),
    })
    byId.set(id, series)
  }
  return orderSeries([...byId.values()])
}

export type ProbabilityBasis = "illustrative" | "market_implied" | "authored_forecast"

export const BASIS_LABEL: Record<ProbabilityBasis, string> = {
  illustrative: "Illustrative",
  market_implied: "Market-implied",
  authored_forecast: "Authored forecast",
}

/** Demo records are illustrative whatever type they claim; only sourced records earn a market or forecast label. */
export function probabilityBasis(series: Pick<ProbabilitySeries, "provenance" | "probabilityType">): ProbabilityBasis {
  if (series.provenance === "demo") return "illustrative"
  return series.probabilityType === "market_implied" ? "market_implied" : "authored_forecast"
}

export function describeBasis(series: ProbabilitySeries): string {
  switch (probabilityBasis(series)) {
    case "illustrative":
      return `Illustrative demo series (${series.sourceName}). Not observed from a market or stated by a forecaster.`
    case "market_implied":
      return `Implied by market prices recorded from ${series.sourceName}.`
    case "authored_forecast":
      return series.probabilityType === "model_estimate"
        ? `Model estimate published by ${series.sourceName}.`
        : `Forecast stated by ${series.sourceName}.`
  }
}

export interface RangeWindow {
  start: string
  end: string
}

/** The window ends at the latest recorded observation, not the wall clock: nothing here is a live feed. */
export function rangeWindow(series: ProbabilitySeries, range: ChartRange): RangeWindow | undefined {
  const { observations } = series
  if (observations.length === 0) return undefined
  const end = observations[observations.length - 1].observedAt
  const start = range === "ALL" ? observations[0].observedAt : new Date(time(end) - RANGE_MS[range]).toISOString()
  return { start, end }
}

export function observationsInRange(series: ProbabilitySeries, range: ChartRange): ProbabilityObservation[] {
  const window = rangeWindow(series, range)
  if (!window) return []
  const start = time(window.start)
  const end = time(window.end)
  return series.observations.filter((item) => {
    const at = time(item.observedAt)
    return at >= start && at <= end
  })
}

/** The first observation recorded before the window, if the series has one. */
export function observationBeforeRange(
  series: ProbabilitySeries,
  range: ChartRange,
): ProbabilityObservation | undefined {
  const window = rangeWindow(series, range)
  if (!window) return undefined
  const start = time(window.start)
  return series.observations.filter((item) => time(item.observedAt) < start).at(-1)
}

export interface ObservedChange {
  from: ProbabilityObservation
  to: ProbabilityObservation
  /** Percentage points, rounded to one decimal. */
  deltaPp: number
  intervalMs: number
}

export function compareObservations(from: ProbabilityObservation, to: ProbabilityObservation): ObservedChange {
  return {
    from,
    to,
    deltaPp: probabilityDelta(to.probability, from.probability),
    intervalMs: time(to.observedAt) - time(from.observedAt),
  }
}

/** Latest observation against the one immediately before it in the same series. */
export function latestChange(series: ProbabilitySeries | undefined): ObservedChange | undefined {
  const points = series?.observations ?? []
  if (points.length < 2) return undefined
  return compareObservations(points[points.length - 2], points[points.length - 1])
}

/** First against last observation inside the range. */
export function rangeChange(series: ProbabilitySeries, range: ChartRange): ObservedChange | undefined {
  const points = observationsInRange(series, range)
  if (points.length < 2) return undefined
  return compareObservations(points[0], points[points.length - 1])
}

export function formatInterval(ms: number): string {
  const total = Math.round(ms / 60_000)
  const days = Math.floor(total / 1440)
  const hours = Math.floor((total % 1440) / 60)
  const minutes = total % 60
  const parts = [days ? `${days} d` : "", hours ? `${hours} h` : "", minutes ? `${minutes} min` : ""].filter(Boolean)
  return parts.length ? parts.join(" ") : "0 min"
}

const validTime = (value: string | undefined) => Boolean(value) && !Number.isNaN(time(value as string))
const present = (value: string | undefined) => Boolean(value && value.trim())

/** A forecast is shown only with its own author or model, issue time, method and evidence cutoff. */
export function isCompleteForecast(forecast: StoredForecast): boolean {
  return (
    (present(forecast.author) || present(forecast.model)) &&
    present(forecast.method) &&
    validTime(forecast.issuedAt) &&
    validTime(forecast.evidenceCutoff) &&
    time(forecast.evidenceCutoff) <= time(forecast.issuedAt) &&
    Number.isFinite(forecast.probability) &&
    forecast.probability >= 0 &&
    forecast.probability <= 100
  )
}

export function latestCompleteForecast(forecasts: StoredForecast[]): StoredForecast | undefined {
  return forecasts
    .filter(isCompleteForecast)
    .sort((a, b) => time(b.issuedAt) - time(a.issuedAt))[0]
}
