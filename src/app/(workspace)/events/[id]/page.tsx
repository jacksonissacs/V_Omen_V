import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import { EventIntelligenceView } from "@/components/intelligence/event-intelligence-view"
import { getRepository } from "@/lib/data/repository"
import { requestedHistoricalView } from "@/lib/history/historical-request"
import {
  renderArbitraryHistoricalRequest,
  renderHistoricalCheckpointPage,
} from "@/lib/history/render-historical-checkpoint"

const loadEvent = cache((id: string) => getRepository().getEvent(id))

type PageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { id } = await params
  const event = await loadEvent(id)
  if (!event) return { title: "Event not found" }
  const historical = requestedHistoricalView(searchParams ? await searchParams : undefined)
  if (historical) return { title: "Historical view" }
  return { title: event.title }
}

export default async function EventIntelligencePage({ params, searchParams }: PageProps) {
  const historical = requestedHistoricalView(searchParams ? await searchParams : undefined)
  const { id } = await params
  if (historical) {
    if (historical.kind === "checkpoint") {
      return renderHistoricalCheckpointPage(id, historical.value)
    }
    return renderArbitraryHistoricalRequest(id, historical)
  }
  const event = await loadEvent(id)
  if (!event) notFound()
  const related = await getRepository().getRelatedEvents(event.id)
  return <EventIntelligenceView event={event} related={related} />
}
