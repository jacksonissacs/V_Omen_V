import { EventCard } from "@/components/marketing/event-card"
import { PanelHead } from "@/components/marketing/panel-head"
import { demoEvent, demoEvidence, demoSeries } from "@/lib/marketing/demo-data"

const LEGEND = [
  ["Probability", "The current consensus, to one decimal, in tabular figures."],
  ["Movement", "Change since the start of the window, with its size in standard deviations and duration."],
  ["Timestamp", "Every number carries the exact moment it was observed."],
  ["Evidence", "Signals and sources in the order they arrived, with the identified catalyst marked."],
  ["Uncertainty", "OMEN's own estimate with a band, the explained share of the move, and identification confidence."],
] as const

export function PreviewSection() {
  return (
    <section className="section" id="demo" aria-labelledby="demo-title">
      <div className="wrap">
        <div className="section-head">
          <h2 id="demo-title">One event, read the way OMEN reads it</h2>
          <p>
            A single market as it appears in the workspace: the probability now, how far it moved, when it
            was observed, what evidence arrived, and how much of the move is actually explained.
          </p>
        </div>
        <div className="panel">
          <PanelHead kicker="Event" title="Bank of Canada · Macro" chip="Demo — illustrative data, not live" />
          <EventCard
            event={demoEvent}
            series={demoSeries}
            evidence={demoEvidence}
            idx={demoSeries.length - 1}
            mode="preview"
          />
        </div>
        <div className="legend" aria-label="What the card shows">
          {LEGEND.map(([term, text]) => (
            <div key={term}>
              <b>{term}</b>
              {text}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
