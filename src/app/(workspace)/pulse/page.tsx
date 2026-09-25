import type { Metadata } from "next"

import { PulseScreen } from "@/components/screens/pulse-screen"
import { getRepository } from "@/lib/data/repository"

export const metadata: Metadata = { title: "Pulse" }

export default async function PulsePage() {
  const repository = getRepository()
  const [events, anomaly] = await Promise.all([
    repository.listEvents({ order: "catalog" }),
    repository.getFeaturedAnomaly(),
  ])
  return <PulseScreen events={events} anomaly={anomaly} />
}
