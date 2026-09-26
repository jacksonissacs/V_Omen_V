import type { Metadata } from "next"

import { renderHistoricalCheckpointPage } from "@/lib/history/render-historical-checkpoint"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; checkpointId: string }>
}): Promise<Metadata> {
  const { checkpointId } = await params
  return { title: `Checkpoint ${checkpointId}` }
}

export default async function EventCheckpointPage({
  params,
}: {
  params: Promise<{ id: string; checkpointId: string }>
}) {
  const { id, checkpointId } = await params
  return renderHistoricalCheckpointPage(id, checkpointId)
}
