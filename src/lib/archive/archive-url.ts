export function buildArchiveHref(eventId: string, checkpointId?: string): string {
  const params = new URLSearchParams()
  if (eventId) params.set("event", eventId)
  if (checkpointId) params.set("checkpoint", checkpointId)
  const query = params.toString()
  return query ? `/archive?${query}` : "/archive"
}

export function buildEventHistoryHref(eventId: string, checkpointId: string): string {
  return `/events/${eventId}/history/${checkpointId}`
}
