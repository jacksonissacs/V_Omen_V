import Link from "next/link"

export default function WorkspaceNotFound() {
  return (
    <section className="aion-screen">
      <p className="aion-label">404</p>
      <h1>This view is not available</h1>
      <p>OMEN is not serving a substitute book for this screen.</p>
      <Link className="aion-button" data-primary="true" href="/pulse">
        Back to Pulse
      </Link>
    </section>
  )
}
