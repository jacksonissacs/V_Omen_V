import { MOVE_END, MOVE_START, type SeriesPoint } from "@/lib/marketing/demo-data"

interface ProbabilityChartProps {
  series: SeriesPoint[]
  /** Last visible minute index. Points after it are masked as future. */
  idx: number
  highlightMove: boolean
  cursor: boolean
}

const W = 600
const H = 190
const PAD_L = 34
const PAD_R = 8
const PAD_T = 12
const PAD_B = 20
const Y0 = 55
const Y1 = 80

/** Consensus line, OMEN estimate (dashed) with ± band, move window, future mask, cursor. */
export function ProbabilityChart({ series, idx, highlightMove, cursor }: ProbabilityChartProps) {
  const X = (i: number) => PAD_L + (i / (series.length - 1)) * (W - PAD_L - PAD_R)
  const Y = (p: number) => PAD_T + (1 - (p - Y0) / (Y1 - Y0)) * (H - PAD_T - PAD_B)

  let line = ""
  let est = ""
  let bandTop = ""
  let bandBot = ""
  for (let i = 0; i <= idx; i++) {
    const pt = series[i]
    const cmd = i ? "L" : "M"
    line += `${cmd}${X(i).toFixed(1)},${Y(pt.p).toFixed(1)}`
    est += `${cmd}${X(i).toFixed(1)},${Y(pt.est).toFixed(1)}`
    bandTop += `${cmd}${X(i).toFixed(1)},${Y(pt.est + pt.band).toFixed(1)}`
    bandBot = `L${X(i).toFixed(1)},${Y(pt.est - pt.band).toFixed(1)}${bandBot}`
  }

  const last = series.length - 1

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Probability over time, ${series[0].t} to ${series[last].t}`}
    >
      {[60, 65, 70, 75, 80].map((v) => (
        <g key={v}>
          <line className="grid" x1={PAD_L} x2={W - PAD_R} y1={Y(v)} y2={Y(v)} />
          <text className="axis" x={PAD_L - 6} y={Y(v) + 3} textAnchor="end">
            {v}%
          </text>
        </g>
      ))}
      {[0, 15, 30, 45, 60].map((i) => (
        <text key={i} className="axis" x={X(i)} y={H - 4} textAnchor="middle">
          {series[i].t}
        </text>
      ))}
      {highlightMove ? (
        <rect
          className="hl"
          x={X(MOVE_START)}
          y={PAD_T}
          width={X(MOVE_END) - X(MOVE_START)}
          height={H - PAD_T - PAD_B}
        />
      ) : null}
      <path className="band" d={`${bandTop}${bandBot}Z`} />
      <path className="est" d={est} />
      <path className="line" d={line} />
      {idx < last ? (
        <rect className="future" x={X(idx)} y={PAD_T} width={W - PAD_R - X(idx)} height={H - PAD_T - PAD_B} />
      ) : null}
      {cursor ? <line className="cursor" x1={X(idx)} x2={X(idx)} y1={PAD_T} y2={H - PAD_B} /> : null}
      <circle className="marker" cx={X(idx)} cy={Y(series[idx].p)} r={3.5} />
      {highlightMove ? (
        <text className="callout" x={X(MOVE_START) + 4} y={PAD_T + 12}>
          CPI 14:30
        </text>
      ) : null}
    </svg>
  )
}
