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
        description="Reconstruct the information environment at any moment."
      />
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
          {pointInTime ? "Exit point-in-time mode" : "Enter point-in-time mode"}
        </button>
      </div>
      {pointInTime ? (
        <div className="aion-point-frame">
          <p style={{ color: "var(--a-tx-2)", fontSize: 12, margin: "0 0 16px" }}>
            Viewing OMEN as it existed at{" "}
            <span className="aion-mono" style={{ color: "var(--a-accent)" }}>
              Aug 17 2026 · 10:35:00 EDT
            </span>
            . Everything below reflects only information available then.
          </p>
          <div className="aion-replay-state">
            <div className="aion-panel">
              <h2>Market probabilities then</h2>
              <Kv label="BoC October rate cut" value="58.4%" />
              <Kv label="Frontier model before Dec 1" value="41.0%" />
              <Kv label="US CPI above 3.0% (Aug)" value="37.2%" />
              <Kv label="AI regulation before January" value="59.1%" />
            </div>
            <div className="aion-panel" style={{ marginTop: 0 }}>
              <h2>Known at this moment</h2>
              <Kv label="News items observed" value="1,204" />
              <Kv label="Forecasts on record" value="312" />
              <Kv label="Model outputs available" value="7" />
              <Kv label="Not yet known" value="July CPI · BoC decision" />
            </div>
          </div>
          <h2 style={{ fontSize: 12.5, margin: "0 0 2px" }}>Replay</h2>
          <p style={{ color: "var(--a-tx-2)", fontSize: 11.5, margin: 0 }}>
            Drag through time and watch probabilities, news and forecasts arrive.
          </p>
          <input
            className="aion-scrub"
            type="range"
            min="0"
            max="100"
            value={position}
            onChange={(event) => setPosition(Number(event.target.value))}
            aria-label="Replay position"
          />
          <p style={{ color: "var(--a-tx-1)", fontSize: 12.5 }}>
            At <span className="aion-mono">14:{Math.round(position / 3 + 29)}</span> — probability{" "}
            <span className="aion-mono">{probability}%</span> · repricing underway · attribution
            not yet published
          </p>
        </div>
      ) : (
        <div className="aion-panel">
          <h2>Point-in-time analysis</h2>
          <p className="aion-note" style={{ border: 0, margin: 0, padding: 0 }}>
            Choose a historical moment to restore only the evidence, forecasts,
            and relationships available at that time.
          </p>
        </div>
      )}
    </section>
  )
}
