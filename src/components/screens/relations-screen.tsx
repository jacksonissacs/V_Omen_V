"use client"

import { useState } from "react"

import { Kv } from "@/components/common/kv"
import { ScreenHead } from "@/components/common/screen-head"

export function RelationsScreen() {
  const [tab, setTab] = useState("Edge")

  return (
    <section className="aion-screen">
      <ScreenHead
        title="Relations"
        description="Observed relationships across probabilities. Measured, not imagined."
      />
      <div className="aion-relations-layout">
        <RelationshipGraph />
        <aside className="aion-inspector">
          <div className="aion-inspector-tabs">
            {["Edge", "Node", "Cases"].map((item) => (
              <button
                type="button"
                className="aion-tab"
                data-active={tab === item}
                key={item}
                onClick={() => setTab(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="aion-inspector-body">
            <div className="aion-inspector-title">
              FOMC dovish surprise → US 10-Year rate expectations
            </div>
            <div className="aion-entity-row">
              <span className="aion-chip">Shock response</span>
              <span className="aion-chip">Lead / lag</span>
            </div>
            <Kv label="Historical response" value="0.73" />
            <Kv label="Confidence interval" value="0.62–0.81" />
            <Kv label="Median lag" value="1m 42s" />
            <Kv label="Observations" value="n = 84" />
            <Kv label="Regime differences" value="Weaker post-2024" />
            <p className="aion-note">
              Observed relationship. OMEN does not label edges causal without identification.
            </p>
          </div>
        </aside>
      </div>
    </section>
  )
}

function RelationshipGraph() {
  const nodes = [
    [320, 220, 34, "FOMC dovish", "surprise", true],
    [470, 120, 27, "US 10Y rate", "expectations", false],
    [480, 300, 24, "USD index", "markets", false],
    [160, 130, 24, "GPU policy", "markets", false],
    [150, 310, 24, "EM rate", "markets", false],
  ] as const
  return (
    <div className="aion-graph">
      <svg viewBox="0 0 640 440" role="img" aria-label="Relationship graph">
        <path className="aion-graph-edge strong" d="M320 220 470 120" />
        <path className="aion-graph-edge" d="M320 220 480 300" />
        <path className="aion-graph-edge" d="M320 220 160 130" />
        <path className="aion-graph-edge" d="M320 220 150 310" />
        <text className="aion-axis" x="392" y="158">
          0.73 · n=84
        </text>
        <text className="aion-axis" x="398" y="276">
          0.41 · n=52
        </text>
        <text className="aion-axis" x="212" y="166">
          0.38 · n=67
        </text>
        <text className="aion-axis" x="208" y="282">
          0.29 · n=31
        </text>
        {nodes.map(([x, y, radius, line1, line2, center]) => (
          <g key={line1} className={`aion-graph-node ${center ? "center" : ""}`}>
            <circle cx={x} cy={y} r={radius} />
            <text x={x} y={y - 4} textAnchor="middle">
              {line1}
            </text>
            <text x={x} y={y + 9} textAnchor="middle">
              {line2}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
