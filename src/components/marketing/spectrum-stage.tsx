"use client"

import { useEffect, useId, useRef, useState } from "react"

import { Spectrum, fallbackGradient } from "@/lib/marketing/spectrum"

interface SpectrumStageProps {
  /** Accessible description of the decorative field. */
  label: string
  /** Loop time (s) rendered as the still frame under reduced motion. */
  staticTime: number
  className?: string
}

/**
 * The reference-derived atmospheric field (hero and footer). Owns the canvas
 * lifecycle and the pause / play control; renders a static gradient when a 2D
 * context cannot be created.
 */
export function SpectrumStage({ label, staticTime, className }: SpectrumStageProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fxRef = useRef<Spectrum | null>(null)
  const stageId = useId()
  const [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [noteDismissed, setNoteDismissed] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return
    const fx = Spectrum.create(root, canvas, {
      staticTime,
      onState: (state) => {
        setPaused(state.paused)
        setReduced(state.reduced)
      },
    })
    if (!fx) {
      setFailed(true)
      return
    }
    fxRef.current = fx
    setFailed(false)
    setPaused(fx.paused)
    setReduced(fx.reduced)
    return () => {
      fx.destroy()
      if (fxRef.current === fx) fxRef.current = null
    }
  }, [staticTime])

  const onToggle = () => {
    fxRef.current?.toggle()
    setNoteDismissed(true)
  }

  const showNote = reduced && !noteDismissed && !failed
  const classes = ["spectrum-stage", className].filter(Boolean).join(" ")

  return (
    <div ref={rootRef} className={classes} data-fallback={failed || undefined}>
      <div className="spectrum-field" id={stageId} role="img" aria-label={label}>
        <canvas ref={canvasRef} aria-hidden="true" />
        {failed ? (
          <div className="spectrum-fallback" style={{ backgroundImage: fallbackGradient() }} aria-hidden="true" />
        ) : null}
      </div>
      {showNote ? (
        <div className="motion-note on" role="note">
          Motion is off because your system prefers reduced motion.
        </div>
      ) : null}
      {failed ? null : (
        <button
          type="button"
          className="glass-btn spectrum-motion"
          aria-pressed={paused}
          aria-controls={stageId}
          onClick={onToggle}
        >
          {paused ? (
            <span className="when-paused">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 4v16l13-8z" />
              </svg>
              Play motion
            </span>
          ) : (
            <span className="when-playing">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14M16 5v14" />
              </svg>
              Pause motion
            </span>
          )}
        </button>
      )}
    </div>
  )
}
