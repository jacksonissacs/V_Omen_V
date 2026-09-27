import type { Metadata } from "next"

import { EventsScreen } from "@/components/screens/events-screen"
import { getRepository } from "@/lib/data/repository"

export const metadata: Metadata = {
  title: "Explore",
}

export default async function EventsPage() {
  const events = await getRepository().listEvents({ order: "catalog" })
  return <EventsScreen events={events} />
}
