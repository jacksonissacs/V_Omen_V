import Link from "next/link"

export function FinalCta() {
  return (
    <section className="final" id="demo-cta" aria-labelledby="final-title">
      <div className="wrap">
        <h2 id="final-title">See what the world expected, and why it changed its mind.</h2>
        <p>
          The workspace is open as a demo. Every figure in it is illustrative and reproducible — open it,
          follow an event, and rewind it yourself.
        </p>
        <div className="hero-actions">
          <Link className="btn btn-primary" href="/pulse">
            Explore the demo
          </Link>
          <a className="btn btn-secondary" href="#walkthrough">
            See how it works
          </a>
        </div>
      </div>
    </section>
  )
}
