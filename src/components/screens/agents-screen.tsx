"use client"

import { ShieldCheck } from "lucide-react"
import { useState } from "react"

import { DataTable } from "@/components/common/data-table"
import { ScreenHead } from "@/components/common/screen-head"
import { ledgerCards, modelRankings } from "@/data/workspace"

export function AgentsScreen() {
  const [query, setQuery] = useState("")
  const filtered = ledgerCards.filter((card) =>
    card.name.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <section className="aion-screen">
      <ScreenHead
        title="Agents"
        description="Illustrative forecaster and model ledger. Runtime calibration, verification, and ranking are not available on this screen."
      />
      <p className="aion-note" role="note" data-testid="agents-illustrative-banner">
        Illustrative demo figures only. Not computed from OMEN runtime evaluations.
      </p>
      <label className="aion-search-large">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search forecasters, institutions, models…"
          aria-label="Search agents"
        />
      </label>
      <div className="aion-ledger-grid">
        {filtered.map((card) => (
          <article className="aion-ledger-card" key={card.name}>
            <div className="aion-ledger-title">
              <h2>{card.name}</h2>
              <span className="aion-verified">
                <ShieldCheck size={11} style={{ display: "inline" }} /> Illustrative · {card.verified}
              </span>
            </div>
            <div className="aion-ledger-kv">
              <span>Overall calibration (illustrative)</span>
              <span className="aion-mono">{card.calibration}</span>
              <span>Forecasts scored (illustrative)</span>
              <span className="aion-mono">{card.forecasts}</span>
              <span>Coverage (illustrative)</span>
              <span className="aion-mono">{card.coverage}</span>
              <span>Best category (illustrative)</span>
              <span>{card.best}</span>
              <span>Weakest category (illustrative)</span>
              <span>{card.weakest}</span>
            </div>
            <div style={{ color: "var(--a-accent)", fontSize: 12, marginTop: 12 }}>
              View record →
            </div>
          </article>
        ))}
      </div>
      <div className="aion-panel">
        <h2>Forecast model rankings (illustrative)</h2>
        <DataTable
          headings={["Model", "Calibration", "Brier", "Coverage", "30D", "90D", "1Y"]}
          rows={modelRankings}
        />
        <p className="aion-note">
          Illustrative table only. These scores are not computed on identical resolved questions in this build.
        </p>
      </div>
    </section>
  )
}
