"use client"

import { useState } from "react"

import { Field } from "@/components/common/field"
import { Kv } from "@/components/common/kv"
import { ScreenHead } from "@/components/common/screen-head"

export function ArchiveScreen() {
  const [pointInTime, setPointInTime] = useState(false)
  const [position, setPosition] = useState(38)
  const probability = (58.4 + position * 0.2).toFixed(1)

  return (
    <section className="aion-screen">
      <ScreenHead
        title="Archive"
        description="Demo of planned point-in-time reconstruction."
      />
      <p className="aion-note aion-demo-note" role="note" data-testid="archive-demo-notice">
        <span className="aion-chip aion-demo-chip">
          <span className="aion-chip-dot" />
          Demo
        </span>{" "}
        Historical reconstruction is not available yet. The date, time and replay controls below do not query stored
        records; every figure on this screen is a fixed illustration.
      </p>
      <div className="aion-rewind">
        <Field label="Rewind to — date">
          <input type="date" defaultValue="2026-08-17" />
        </Field>
        <Field label="Time">
          <input type="time" defaultValue="10:35:00" />
        </Field>
        <Field label="Timezone">
          <select defaultValue="EDT">
            <option>EDT</option>
            <option>UTC</option>
            <option>PST</option>
          </select>
        </Field>
        <button
          type="button"
          className="aion-button"
          data-primary="true"
          onClick={() => setPointInTime((value) => !value)}
        >
          {pointInTime ? "Exit demo" : "Show point-in-time demo"}
        </button>
      </div>
      {pointInTime ? (
        <div className="aion-point-frame">
          <p style={{ color: "var(--a-tx-2)", fontSize: 12, margin: "0 0 16px" }}>
            Illustration of OMEN as it might have looked at{" "}
            <span className="aion-mono" style={{ color: "var(--a-accent)" }}>
              Aug 17 2026 · 10:35:00 EDT
            </span>
            . Figures are illustrative, not reconstructed from stored history.
          </p>
          <div className="aion-replay-state">
            <div className="aion-panel">
              <h2>Illustrative probabilities</h2>
              <Kv label="BoC October rate cut" value="58.4%" />
              <Kv label="Frontier model before Dec 1" value="41.0%" />
              <Kv label="US CPI above 3.0% (Aug)" value="37.2%" />
              <Kv label="AI regulation before January" value="59.1%" />
            </div>
            <div className="aion-panel" style={{ marginTop: 0 }}>
              <h2>Illustrative record counts</h2>
              <Kv label="News items observed" value="1,204" />
              <Kv label="Forecasts on record" value="312" />
              <Kv label="Model outputs available" value="7" />
              <Kv label="Not yet known" value="July CPI · BoC decision" />
            </div>
          </div>
          <h2 style={{ fontSize: 12.5, margin: "0 0 2px" }}>Replay (demo)</h2>
          <p style={{ color: "var(--a-tx-2)", fontSize: 11.5, margin: 0 }}>
            Drag to step through a scripted illustration. The slider does not read stored history.
          </p>
          <input
            className="aion-scrub"
            type="range"
            min="0"
            max="100"
            value={position}
            onChange={(event) => setPosition(Number(event.target.value))}
            aria-label="Illustrative replay position (demo)"
          />
          <p style={{ color: "var(--a-tx-1)", fontSize: 12.5 }}>
            Illustration at <span className="aion-mono">14:{Math.round(position / 3 + 29)}</span> — probability{" "}
            <span className="aion-mono">{probability}%</span> (scripted, not recorded) · attribution not yet
            published
          </p>
        </div>
      ) : (
        <div className="aion-panel">
          <h2>Point-in-time analysis</h2>
          <p className="aion-note" style={{ border: 0, margin: 0, padding: 0 }}>
            Planned: choose a historical moment to restore only the evidence, forecasts, and relationships
            available at that time. Until then this screen shows a scripted demo.
          </p>
        </div>
      )}
    </section>
  )
}
