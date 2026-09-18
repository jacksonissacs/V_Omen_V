/**
 * OMEN landing — deterministic, illustrative demo fixtures.
 *
 * Ported from `design-reference/omen-site/js/demo-data.js`. Nothing here is a
 * real market, source, customer or performance claim. Every marketing
 * component reads from this module so the demo is reproducible.
 */

export interface SeriesPoint {
  /** Minute label, `HH:MM`. Each point is the observation taken at `HH:MM:00`. */
  t: string
  /** Market consensus probability, percent. */
  p: number
  /** OMEN estimate, percent. */
  est: number
  /** ± band around the estimate, points. */
  band: number
}

export type EvidenceKind = "catalyst" | "signal" | "system" | "move"

export interface EvidenceItem {
  /** `HH:MM:SS` — the instant the item was first observed. */
  t: string
  text: string
  kind: EvidenceKind
  delta: string | null
}

export interface ArchiveSnapshot {
  /** Inclusive last minute index for which these headlines apply. */
  until: number
  items: string[]
}

export type Confidence = "High" | "Medium" | "Low"

export interface PulseMove {
  cat: string
  t: string
  title: string
  from: number
  to: number
  pts: string
  sigma: string
  /** `null` marks an "expected reaction missing" row. */
  explained: number | null
  catalyst: string
  conf: Confidence
}

export interface LedgerRow {
  name: string
  type: "aggregate" | "institution" | "individual" | "model"
  calibration: number
  brier: number
  coverage: number
  scored: number
}

export interface DemoEvent {
  id: string
  title: string
  category: string
  resolves: string
  date: string
  tz: string
  consensusNow: number
  omenEstimate: number
  estimateBand: number
  moveFrom: number
  moveTo: number
  movePts: number
  moveSigma: number
  moveWindow: string
  explained: number
  unexplained: number
  identificationConfidence: number
  dataQuality: string
  analogues: { n: number; medianResponse: number; medianLag: string }
  catalyst: { time: string; label: string; tier: string }
}

export interface DemoRelation {
  a: string
  b: string
  historical: number
  elapsed: string
  observed: string
}

export const DEMO_DISCLAIMER = "Demo — illustrative data, not live."

export const demoEvent: DemoEvent = {
  id: "evt-boc-oct",
  title: "Bank of Canada cuts rates in October",
  category: "Macro",
  resolves: "Oct 29 2026",
  date: "Sep 10 2026",
  tz: "EDT",
  consensusNow: 73.8,
  omenEstimate: 71.2,
  estimateBand: 3.4,
  moveFrom: 61.2,
  moveTo: 73.8,
  movePts: 12.6,
  moveSigma: 4.7,
  moveWindow: "18 min",
  explained: 69,
  unexplained: 31,
  identificationConfidence: 89,
  dataQuality: "High",
  analogues: { n: 41, medianResponse: 8.9, medianLag: "1m 42s" },
  catalyst: { time: "14:30:00", label: "Statistics Canada CPI release", tier: "Tier 1 source" },
}

const BASE_SERIES = [
  61.0, 61.2, 61.1, 61.3, 61.2, 61.0, 61.2, 61.4, 61.3, 61.1, 61.2, 61.3, 61.2, 61.0, 61.1, 61.3, 61.2, 61.4, 61.3, 61.2,
  61.1, 61.2, 61.3, 61.2, 61.1, 61.2, 61.4, 61.3, 61.2, 61.2, // 14:00–14:29 flat
  61.2, 63.1, 65.4, 67.9, 70.1, 71.6, 72.4, 73.0, 73.9, 73.6, 73.8, // 14:30–14:40 the move
  74.1, 73.7, 73.8, 73.9, 73.6, 73.8, 74.0, 73.8, 73.7, 73.8, 73.9, 73.8, 73.7, 73.8, 73.9, 73.8, 73.8, 73.7, 73.8, 73.8,
]

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** One point per minute from 14:00 to 15:00 (61 points). */
export const demoSeries: SeriesPoint[] = BASE_SERIES.map((p, i) => {
  const hh = 14 + Math.floor(i / 60)
  const mm = i % 60
  const est = i < 30 ? p - 0.4 : i < 41 ? p - 1.2 - (i - 30) * 0.12 : 71.2 + ((i * 7) % 3) * 0.1
  return {
    t: `${pad(hh)}:${pad(mm)}`,
    p,
    est: +est.toFixed(1),
    band: i < 30 ? 1.8 : i < 41 ? +(2.6 + (i - 30) * 0.1).toFixed(1) : 3.4,
  }
})

/** Indices into `demoSeries` bounding the highlighted move window. */
export const MOVE_START = 30
export const MOVE_END = 40

/** Default rewind position when the walkthrough enters step 3 (14:34, mid-move). */
export const REWIND_DEFAULT_INDEX = 34

/** Index used by the Archive section's point-in-time snapshot (14:33). */
export const ARCHIVE_INDEX = 33

export const demoEvidence: EvidenceItem[] = [
  { t: "14:30:00", text: "Statistics Canada CPI release", kind: "catalyst", delta: null },
  { t: "14:30:42", text: "CAD begins repricing", kind: "signal", delta: "−0.4%" },
  { t: "14:31:08", text: "Canadian 2Y yields move", kind: "signal", delta: "+17 bps" },
  { t: "14:31:51", text: "OMEN detects abnormal movement", kind: "system", delta: null },
  { t: "14:32:07", text: "Probability rises", kind: "move", delta: "+4.2 pts" },
  { t: "14:34:16", text: "Related rate market reacts", kind: "signal", delta: "+6 pts" },
  { t: "14:38:42", text: "Move reaches full size", kind: "move", delta: "+12.6 pts" },
]

export const demoArchive: ArchiveSnapshot[] = [
  {
    until: 29,
    items: [
      "Markets await 14:30 CPI print",
      "Consensus for October cut steady near 61%",
      "No scheduled BoC communications today",
    ],
  },
  {
    until: 34,
    items: [
      "CPI print released: headline below expectations",
      "CAD softens against USD",
      "2Y yields fall on the print",
    ],
  },
  {
    until: 60,
    items: [
      "Rate-cut odds reprice sharply after CPI",
      "Related October rate market moves +6 pts",
      "Housing-correction market has not reacted",
    ],
  },
]

export const demoPulse: PulseMove[] = [
  {
    cat: "Macro",
    t: "14:42",
    title: "Bank of Canada cuts rates in October",
    from: 61.2,
    to: 73.8,
    pts: "+12.6",
    sigma: "4.7σ over 18 min",
    explained: 69,
    catalyst: "Statistics Canada CPI release",
    conf: "High",
  },
  {
    cat: "AI",
    t: "11:07",
    title: "Frontier model released before December 1",
    from: 44.0,
    to: 52.5,
    pts: "+8.5",
    sigma: "2.1σ over 3.2 hrs",
    explained: 46,
    catalyst: "Compute-provider capacity disclosure",
    conf: "Medium",
  },
  {
    cat: "Economics",
    t: "14:58",
    title: "Canadian housing correction by Q2 2027",
    from: 34.0,
    to: 34.2,
    pts: "+0.2",
    sigma: "Expected reaction missing",
    explained: null,
    catalyst: "Historically moves with BoC surprises in 78% of comparable shocks",
    conf: "Low",
  },
]

export const demoLedger: LedgerRow[] = [
  { name: "Market consensus", type: "aggregate", calibration: 83, brier: 0.121, coverage: 96, scored: 12407 },
  { name: "Bank of Canada", type: "institution", calibration: 74, brier: 0.158, coverage: 82, scored: 1824 },
  { name: "Forecaster A", type: "individual", calibration: 81, brier: 0.142, coverage: 72, scored: 128 },
  { name: "Model X", type: "model", calibration: 79, brier: 0.13, coverage: 91, scored: 4210 },
]

export const demoRelation: DemoRelation = {
  a: "Bank of Canada cuts rates in October",
  b: "Canadian housing correction by Q2 2027",
  historical: 78,
  elapsed: "26 min",
  observed: "No meaningful movement",
}

/* ------------------------------------------------------------------ */
/* Point-in-time derivations                                           */
/* ------------------------------------------------------------------ */

/** Seconds since midnight for `HH:MM` or `HH:MM:SS`. */
export function toSeconds(time: string): number {
  const [h, m, s] = time.split(":")
  return Number(h) * 3600 + Number(m) * 60 + Number(s ?? 0)
}

/**
 * The exact instant a series point represents. Each series point is the
 * observation taken at the top of its minute, so the cutoff displayed to the
 * user and the cutoff used for filtering are the same `HH:MM:00`.
 *
 * (The prototype displayed `HH:MM:00` but filtered evidence through `HH:MM:59`,
 * which let up to 59 s of future information leak into a rewound view.)
 */
export function cutoffAt(series: SeriesPoint[], idx: number): string {
  return `${series[idx].t}:00`
}

/** Evidence observed at or before the cutoff for `idx`. */
export function isEvidenceVisible(item: EvidenceItem, series: SeriesPoint[], idx: number): boolean {
  return toSeconds(item.t) <= toSeconds(cutoffAt(series, idx))
}

export function evidenceAt(evidence: EvidenceItem[], series: SeriesPoint[], idx: number): EvidenceItem[] {
  return evidence.filter((item) => isEvidenceVisible(item, series, idx))
}

/** Headlines known at minute `idx`. */
export function archiveAt(archive: ArchiveSnapshot[], idx: number): string[] {
  for (const snapshot of archive) {
    if (idx <= snapshot.until) return snapshot.items
  }
  return archive[archive.length - 1]?.items ?? []
}

export interface CardDerivations {
  point: SeriesPoint
  /** Movement since the first point in the window, points. */
  delta: number
  /** The move window has completed by `idx`. */
  moved: boolean
  /** `idx` falls inside the move window. */
  inMove: boolean
  /** `idx` is the last available observation. */
  latest: boolean
  cutoff: string
}

export function deriveCard(series: SeriesPoint[], idx: number): CardDerivations {
  const point = series[idx]
  return {
    point,
    delta: point.p - series[0].p,
    moved: idx >= MOVE_END,
    inMove: idx >= MOVE_START && idx < MOVE_END,
    latest: idx === series.length - 1,
    cutoff: cutoffAt(series, idx),
  }
}

export function formatSigned(value: number, digits = 1): string {
  const sign = value >= 0 ? "+" : "−"
  return `${sign}${Math.abs(value).toFixed(digits)}`
}
