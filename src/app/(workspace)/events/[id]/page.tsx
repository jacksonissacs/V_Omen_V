import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { cache } from "react"

import { HistoricalUnavailable } from "@/components/history/historical-unavailable"
import { EventIntelligenceView } from "@/components/intelligence/event-intelligence-view"
import { getRepository } from "@/lib/data/repository"
import { invalidCheckpointId } from "@/lib/domain/historical-reconstruction"
import { firstQueryValue, requestedHistoricalView } from "@/lib/history/historical-request"

const loadEvent = cache((id: string) => getRepository().getEvent(id))

type PageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { id } = await params
  const event = await loadEvent(id)
  if (!event) return { title: "Event not found" }
  const resolvedSearch = searchParams ? await searchParams : undefined
  const checkpoint = firstQueryValue(resolvedSearch?.checkpoint)
  if (checkpoint && !invalidCheckpointId(checkpoint)) return { title: `Checkpoint ${checkpoint}` }
  const historical = requestedHistoricalView(resolvedSearch)
  if (historical) return { title: "Historical view unavailable" }
  return { title: event.title }
}

export default async function EventIntelligencePage({ params, searchParams }: PageProps) {
  const resolvedSearch = searchParams ? await searchParams : undefined
  const checkpoint = firstQueryValue(resolvedSearch?.checkpoint)
  const historical = requestedHistoricalView(resolvedSearch)
  const { id } = await params
  const event = await loadEvent(id)
  if (!event) notFound()
  if (checkpoint) {
    const invalid = invalidCheckpointId(checkpoint)
    if (invalid) {
      return <HistoricalUnavailable eventId={id} request={{ kind: "checkpoint", value: checkpoint }} detail={invalid.message} />
    }
    redirect(`/events/${id}/history/${checkpoint}`)
  }
  if (historical) {
    return <HistoricalUnavailable eventId={id} request={historical} />
  }
  const related = await getRepository().getRelatedEvents(event.id)
  return <EventIntelligenceView event={event} related={related} />
}
