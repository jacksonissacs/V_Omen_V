import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { demoIntelligenceAllowed } from "@/lib/db/config"

export const metadata: Metadata = { title: "Relations" }

export default async function RelationsPage() {
  if (!demoIntelligenceAllowed()) notFound()
  const { RelationsScreen } = await import("@/components/screens/relations-screen")
  return <RelationsScreen />
}
