/** The configured store could not be read. Callers render an unavailable state; nothing falls back to demo data. */
export class RepositoryUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "RepositoryUnavailableError"
  }
}
