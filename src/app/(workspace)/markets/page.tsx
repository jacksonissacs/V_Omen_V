import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { demoIntelligenceAllowed } from "@/lib/db/config"

export const metadata: Metadata = { title: "Markets" }

export default async function MarketsPage() {
  if (!demoIntelligenceAllowed()) notFound()
  const { MarketsScreen } = await import("@/components/screens/markets-screen")
  return <MarketsScreen />
}
