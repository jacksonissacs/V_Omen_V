import { useEffect, useId, useRef, useState } from "react"

import { formatDateTime } from "@/lib/format"
import type { RangeWindow } from "@/lib/domain/probability-history"
import type { ProbabilityObservation } from "@/types/event"

const DEFAULT_WIDTH = 800
const HEIGHT = 240
const PLOT = { left: 48, right: 20, top: 16, bottom: 196 }

const axisTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

/** A value axis that always contains every point, in whole steps of 5, 10 or 20 points. */
export function valueDomain(values: number[]): { min: number; max: number; step: number } {
  const low = Math.min(...values)
  const high = Math.max(...values)
  const step = high - low > 40 ? 20 : high - low > 15 ? 10 : 5
  let min = Math.max(0, Math.floor((low - 2) / step) * step)
  let max = Math.min(100, Math.ceil((high + 2) / step) * step)
  if (max - min < 2 * step) {
    if (max + step <= 100) max += step
    else min = Math.max(0, min - step)
  }
  return { min, max, step }
}

export function ProbabilityChart({
  points,
  window,
  historyStartsAt,
  label,
}: {
  points: ProbabilityObservation[]
  window: RangeWindow
  /** The series' first recorded observation; anything in the window before it has no history. */
  historyStartsAt: string
  label: string
}) {
  const titleId = useId()
  const ref = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  useEffect(() => {
    const node = ref.current
    if (!node || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(([entry]) => {
      const measured = Math.round(entry.contentRect.width)
      if (measured > 0) setWidth(measured)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const start = new Date(window.start).getTime()
  const end = new Date(window.end).getTime()
  const span = end - start
  const { min, max, step } = valueDomain(points.map((point) => point.probability))

  const x = (iso: string) => {
    if (span <= 0) return (PLOT.left + (width - PLOT.right)) / 2
    return PLOT.left + ((new Date(iso).getTime() - start) / span) * (width - PLOT.right - PLOT.left)
  }
  const y = (value: number) => PLOT.bottom - ((value - min) / (max - min)) * (PLOT.bottom - PLOT.top)

  const ticks: number[] = []
  for (let value = min; value <= max; value += step) ticks.push(value)
  const timeTicks = span > 0 ? [window.start, new Date(start + span / 2).toISOString(), window.end] : [window.end]
  const missingUntil = new Date(historyStartsAt).getTime() > start ? historyStartsAt : undefined
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.observedAt)},${y(point.probability)}`).join(" ")
  const latest = points[points.length - 1]

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${width} ${HEIGHT}`}
      className="aion-chart"
      role="img"
      aria-labelledby={titleId}
      data-testid="probability-chart"
    >
      <title id={titleId}>{label}</title>
      {missingUntil ? (
        <g data-testid="chart-missing-history">
          <rect
            x={PLOT.left}
            y={PLOT.top}
            width={Math.max(0, x(missingUntil) - PLOT.left)}
            height={PLOT.bottom - PLOT.top}
            fill="rgba(255,255,255,.035)"
          />
          <text className="aion-axis" x={PLOT.left + 6} y={PLOT.top + 12}>
            No recorded observations
          </text>
        </g>
      ) : null}
      <g stroke="rgba(255,255,255,.06)">
        {ticks.map((value) => (
          <line key={value} x1={PLOT.left} y1={y(value)} x2={width - PLOT.right} y2={y(value)} />
        ))}
      </g>
      {ticks.map((value) => (
        <text key={value} className="aion-axis" x={PLOT.left - 8} y={y(value) + 3} textAnchor="end">
          {value}%
        </text>
      ))}
      {timeTicks.map((iso, index) => (
        <text
          key={iso}
          className="aion-axis"
          x={span > 0 ? x(iso) : (PLOT.left + width - PLOT.right) / 2}
          y={PLOT.bottom + 22}
          textAnchor={timeTicks.length === 1 ? "middle" : index === 0 ? "start" : index === timeTicks.length - 1 ? "end" : "middle"}
        >
          {axisTime.format(new Date(iso))}
        </text>
      ))}
      <text className="aion-axis" x={width - PLOT.right} y={HEIGHT - 2} textAnchor="end">
        UTC
      </text>
      {points.length > 1 ? (
        <path d={path} fill="none" stroke="#8194FF" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      ) : null}
      {points.map((point) => (
        <circle
          key={point.observedAt}
          cx={x(point.observedAt)}
          cy={y(point.probability)}
          r={point === latest ? 4 : 3}
          fill={point === latest ? "#8194FF" : "#0C0E11"}
          stroke="#8194FF"
          data-testid="chart-point"
        >
          <title>{`${point.probability.toFixed(1)}% · ${formatDateTime(point.observedAt)}`}</title>
        </circle>
      ))}
    </svg>
  )
}
