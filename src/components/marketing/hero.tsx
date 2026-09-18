import Link from "next/link"

import { SpectrumStage } from "@/components/marketing/spectrum-stage"

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <SpectrumStage
        className="hero-stage"
        label="Decorative spectrum of luminous colour bands fading into black"
        staticTime={4.2}
      />
      <div className="hero-body">
        <div className="wrap">
          <h1 id="hero-title">Every probability, with its history.</h1>
          <p>
            OMEN records what the world expected, when it expected it, and why that changed. Watch a
            probability move, inspect the evidence behind the move, and rewind to see exactly what was
            known at any moment.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" href="/pulse">
              Explore the demo
            </Link>
            <a className="btn btn-secondary" href="#walkthrough">
              See how it works
            </a>
          </div>
          <p className="hero-note">
            The demo below and the workspace it opens use illustrative data. Nothing on this page is a
            live feed or a performance claim.
          </p>
        </div>
      </div>
    </section>
  )
}
