import { DataTable } from "@/components/common/data-table"
import { Stat } from "@/components/common/stat"
import { forecastHistory } from "@/data/workspace"

export function ResearchScreen() {
  return (
    <section className="aion-screen">
      <p className="aion-note aion-demo-note" role="note">
        <span className="aion-chip aion-demo-chip">
          <span className="aion-chip-dot" />
          Demo
        </span>{" "}
        This screen is an illustrative layout. The rating, calibration and history figures are not computed from
        recorded forecasts and are not a track record.
      </p>
      <div className="aion-rating">
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 550, margin: "0 0 2px" }}>Alan</h1>
          <p style={{ color: "var(--a-tx-2)", fontSize: 12, margin: 0 }}>
            Forecasting since March 2026 · 128 resolved forecasts
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <span className="aion-label">Forecast Rating</span>
          <span className="aion-rating-number aion-mono">1,847</span>{" "}
          <span className="aion-label" style={{ display: "inline" }}>
            ± 126
          </span>
        </div>
      </div>
      <div className="aion-stat-grid">
        <Stat label="Calibration" value="Excellent" />
        <Stat label="Coverage" value="72%" />
        <Stat label="Brier score" value="0.142" />
        <Stat label="Against consensus — won" value="61%" />
      </div>
      <div className="aion-research-grid">
        <div className="aion-panel">
          <h2>Calibration</h2>
          <CalibrationChart />
          <p className="aion-note">Slight overconfidence above 80%. Well calibrated elsewhere.</p>
        </div>
        <div className="aion-panel" style={{ marginTop: 0 }}>
          <h2>Category scores</h2>
          {[
            ["AI", 82],
            ["Technology", 79],
            ["Macro", 71],
            ["Economics", 69],
            ["Geopolitics", 58],
          ].map(([name, score]) => (
            <div className="aion-category-row" key={name}>
              <span className="aion-category-name">{name}</span>
              <span className="aion-category-bar">
                <i style={{ width: `${score}%` }} />
              </span>
              <span className="aion-mono">{score}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="aion-panel">
        <h2>Forecast history</h2>
        <DataTable
          headings={["Forecast", "You", "Consensus then", "Outcome", "Score", "Date"]}
          rows={forecastHistory}
        />
      </div>
    </section>
  )
}

function CalibrationChart() {
  const points = [
    [60, 150],
    [92, 131],
    [124, 116],
    [156, 94],
    [188, 72],
    [220, 55],
    [252, 32],
  ]
  return (
    <svg viewBox="0 0 300 190" className="aion-calibration" role="img" aria-label="Calibration curve">
      <line x1="30" y1="165" x2="285" y2="10" stroke="rgba(255,255,255,.12)" strokeDasharray="3 4" />
      <path
        d="M30 163 60 150 92 131 124 116 156 94 188 72 220 55 252 32 285 13"
        fill="none"
        stroke="#8194FF"
        strokeWidth="1.6"
      />
      {points.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" fill="#8194FF" />
      ))}
      <text className="aion-axis" x="118" y="185">
        Forecast probability
      </text>
    </svg>
  )
}
