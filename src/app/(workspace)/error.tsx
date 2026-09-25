"use client"

import { useEffect } from "react"

export default function WorkspaceError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <section className="aion-screen">
      <div className="aion-panel" role="alert">
        <h2>Workspace data unavailable</h2>
        <p className="aion-note">
          The event repository could not be read, so this screen cannot be shown.
          {error.digest ? <> Reference <span className="aion-mono">{error.digest}</span>.</> : null}
        </p>
        <button
          type="button"
          className="aion-button"
          data-primary="true"
          style={{ marginTop: 12 }}
          onClick={() => retry()}
        >
          Try again
        </button>
      </div>
    </section>
  )
}
