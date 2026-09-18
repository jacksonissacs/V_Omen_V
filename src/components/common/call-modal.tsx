"use client"

import { LockKeyhole } from "lucide-react"
import { useState } from "react"

import { useWorkspace } from "@/components/layout/workspace-provider"

export function CallModal() {
  const { callEvent, closeCall } = useWorkspace()
  const [probability, setProbability] = useState(67)
  const [locked, setLocked] = useState(false)

  if (!callEvent) return null

  return (
    <div
      className="aion-overlay"
      onMouseDown={(mouseEvent) => mouseEvent.target === mouseEvent.currentTarget && closeCall()}
    >
      <div className="aion-call-modal" role="dialog" aria-modal="true" aria-label="Make a call">
        <h2>{callEvent.question}</h2>
        <p className="aion-call-sub">
          Blind mode — market consensus, the OMEN estimate and other forecasters
          are hidden until you lock.
        </p>
        <div className="aion-slider-value aion-mono">
          {probability}%{" "}
          <span className="aion-label" style={{ display: "inline" }}>
            your probability
          </span>
        </div>
        <input
          type="range"
          min="1"
          max="99"
          value={probability}
          disabled={locked}
          onChange={(inputEvent) => setProbability(Number(inputEvent.target.value))}
          aria-label="Your probability"
        />
        <label style={{ display: "block", marginTop: 16, color: "var(--a-tx-1)", fontSize: 12 }}>
          Why?
          <textarea
            defaultValue={`The ${callEvent.catalyst.toLowerCase()} is significant, but the unexplained residual remains material.`}
            disabled={locked}
          />
        </label>
        <div className="aion-call-notice">
          <LockKeyhole size={13} style={{ display: "inline", marginRight: 7 }} />
          This forecast becomes immutable after submission. A correction must be
          a new forecast.
          <div className="aion-mono" style={{ marginTop: 4 }}>
            Timestamp 16:42:17 EDT · cryptographically recorded
          </div>
        </div>
        {locked ? (
          <div className="aion-reveal">
            <span className="aion-label">Locked. Now revealed:</span>
            <RevealRow label="You" value={`${probability}%`} />
            <RevealRow label="Market" value={`${callEvent.probability.toFixed(0)}%`} />
            <RevealRow label="OMEN model" value={`${Math.round(callEvent.probability - 2.6)}%`} />
            <RevealRow label="Community" value={`${Math.round(callEvent.probability - 1)}%`} />
          </div>
        ) : null}
        <div className="aion-call-actions">
          <button type="button" className="aion-button" onClick={closeCall}>
            {locked ? "Close" : "Cancel"}
          </button>
          {!locked ? (
            <button
              type="button"
              className="aion-button"
              data-primary="true"
              onClick={() => setLocked(true)}
            >
              Lock prediction
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function RevealRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="aion-reveal-row">
      <span>{label}</span>
      <span className="aion-mono">{value}</span>
    </div>
  )
}
