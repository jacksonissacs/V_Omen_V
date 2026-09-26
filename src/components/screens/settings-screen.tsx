"use client"

import { useState } from "react"

import { Field } from "@/components/common/field"
import { Kv } from "@/components/common/kv"
import { ScreenHead } from "@/components/common/screen-head"

export function SettingsScreen() {
  const [density, setDensity] = useState("Dense")
  const [timezone, setTimezone] = useState("EDT")
  const [alerts, setAlerts] = useState(true)

  return (
    <section className="aion-screen">
      <ScreenHead
        title="Settings"
        description="Workspace density, display, and notification preferences."
      />
      <div className="aion-panel">
        <h2>Display</h2>
        <Field label="Density">
          <select value={density} onChange={(event) => setDensity(event.target.value)}>
            <option>Dense</option>
            <option>Comfortable</option>
          </select>
        </Field>
        <Field label="Timezone">
          <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
            <option>EDT</option>
            <option>UTC</option>
            <option>PST</option>
          </select>
        </Field>
      </div>
      <div className="aion-panel">
        <h2>Alerts</h2>
        <label className="aion-settings-toggle">
          <input
            type="checkbox"
            checked={alerts}
            onChange={(event) => setAlerts(event.target.checked)}
          />
          Notify when a followed event moves more than 5 pts
        </label>
        <Kv label="Current density" value={density} />
        <Kv label="Clock" value={timezone} />
      </div>
      <div className="aion-panel">
        <h2>API access</h2>
        <Kv label="List events" value="GET /api/events" />
        <Kv label="Get event" value="GET /api/events/:id" />
        <Kv label="List checkpoints" value="GET /api/events/:id/history" />
        <Kv label="Replay checkpoint" value="GET /api/events/:id/history/:checkpointId" />
        <p className="aion-note">
          Local mock repository. No API keys are stored in this application.
        </p>
      </div>
    </section>
  )
}
