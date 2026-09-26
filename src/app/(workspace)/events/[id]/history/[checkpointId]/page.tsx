import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { HistoricalUnavailable } from "@/components/history/historical-unavailable"
import { getRepository } from "@/lib/data/repository"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; checkpointId: string }>
}): Promise<Metadata> {
  const { checkpointId } = await params
  return { title: `Checkpoint ${checkpointId} unavailable` }
}

export default async function EventCheckpointPage({
  params,
}: {
  params: Promise<{ id: string; checkpointId: string }>
}) {
  const { id, checkpointId } = await params
  const event = await getRepository().getEvent(id)
  if (!event) notFound()
  return <HistoricalUnavailable eventId={id} request={{ kind: "checkpoint", value: checkpointId }} />
}
