"use client"

import { useId, useRef, useState, type KeyboardEvent } from "react"

import { EventCard } from "@/components/marketing/event-card"
import { PanelHead } from "@/components/marketing/panel-head"
import {
  REWIND_DEFAULT_INDEX,
  archiveAt,
  demoArchive,
  demoEvent,
  demoEvidence,
  demoSeries,
} from "@/lib/marketing/demo-data"

const STEPS = [
  {
    title: "Observe a move",
    body:
      "At 14:30 the probability of an October cut jumps from 61% to 74% in eighteen minutes. OMEN flags it as a 4.7σ move and highlights the window.",
  },
  {
    title: "Inspect the evidence",
    body:
      "The evidence list shows what arrived and when: the CPI release, currency and yield reactions, related markets. The catalyst is marked, and the move is split into explained and unexplained parts.",
  },
  {
    title: "Rewind",
    body:
      "Drag the timeline back. The probability, the evidence list and the headlines all revert to what was actually known at that minute — nothing from the future leaks in.",
  },
] as const

const LAST = demoSeries.length - 1

export function Walkthrough() {
  const [step, setStep] = useState(0)
  const [idx, setIdx] = useState(LAST)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const baseId = useId()
  const panelId = `${baseId}-panel`
  const scrubId = `${baseId}-scrub`
  const tabId = (i: number) => `${baseId}-tab-${i}`

  const selectStep = (next: number) => {
    setStep(next)
    // Entering the rewind step from the latest observation starts mid-move (14:34).
    if (next === 2 && idx === LAST) setIdx(REWIND_DEFAULT_INDEX)
  }

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next: number | null = null
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (i + 1) % STEPS.length
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = (i - 1 + STEPS.length) % STEPS.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = STEPS.length - 1
    if (next === null) return
    event.preventDefault()
    tabRefs.current[next]?.focus()
    selectStep(next)
  }

  const isRewind = step === 2
  const cardIdx = isRewind ? idx : LAST
  const point = demoSeries[cardIdx]

  return (
    <section className="section" id="walkthrough" aria-labelledby="walk-title">
      <div className="wrap">
        <div className="section-head">
          <h2 id="walk-title">Observe a move, inspect the evidence, rewind</h2>
          <p>The same card, used the way an analyst uses it. Pick a step; the card updates.</p>
        </div>
        <div className="cols">
          <div>
            <div className="steps" role="tablist" aria-label="Walkthrough steps" aria-orientation="vertical">
              {STEPS.map((s, i) => {
                const selected = i === step
                return (
                  <button
                    key={s.title}
                    ref={(el) => {
                      tabRefs.current[i] = el
                    }}
                    type="button"
                    className="step"
                    role="tab"
                    id={tabId(i)}
                    aria-selected={selected}
                    aria-controls={panelId}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => selectStep(i)}
                    onKeyDown={(event) => onTabKey(event, i)}
                  >
                    <span className="n">{i + 1}</span>
                    <span>
                      <h3>{s.title}</h3>
                      <p>{s.body}</p>
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="walk-hint">
              Keyboard: arrow keys switch steps; the timeline slider responds to arrow keys and touch.
            </p>
          </div>
          <div className="panel" role="tabpanel" id={panelId} aria-labelledby={tabId(step)}>
            <PanelHead kicker="Event" title="Bank of Canada · Macro" chip="Demo — illustrative data, not live" />
            <EventCard
              event={demoEvent}
              series={demoSeries}
              evidence={demoEvidence}
              idx={cardIdx}
              mode={isRewind ? "rewind" : "step"}
              rewind={
                isRewind ? (
                  <>
                    <label htmlFor={scrubId}>
                      Rewind to{" "}
                      <b>
                        {point.t} {demoEvent.tz}
                      </b>
                    </label>
                    <input
                      id={scrubId}
                      type="range"
                      min={0}
                      max={LAST}
                      step={1}
                      value={idx}
                      onChange={(event) => setIdx(Number(event.target.value))}
                      aria-valuetext={`${point.t}, ${point.p.toFixed(1)} percent`}
                    />
                    <div className="snapshot">
                      <span className="k">Known at {point.t}</span>
                      <ul>
                        {archiveAt(demoArchive, idx).map((headline) => (
                          <li key={headline}>{headline}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : undefined
              }
            />
          </div>
        </div>
      </div>
    </section>
  )
}
