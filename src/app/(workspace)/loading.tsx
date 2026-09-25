export default function WorkspaceLoading() {
  return (
    <section className="aion-screen" aria-busy="true">
      <div className="aion-panel" role="status">
        <h2>Loading the book…</h2>
        <p className="aion-note">Reading events from the workspace repository.</p>
      </div>
    </section>
  )
}
