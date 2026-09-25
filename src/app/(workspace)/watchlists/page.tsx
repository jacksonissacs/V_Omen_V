import type { Metadata } from "next"

import { WatchlistsScreen } from "@/components/screens/watchlists-screen"
import { getRepository } from "@/lib/data/repository"

export const metadata: Metadata = { title: "Watchlists" }

export default async function WatchlistsPage() {
  const events = await getRepository().listEvents({ order: "catalog" })
  return <WatchlistsScreen events={events} />
}
