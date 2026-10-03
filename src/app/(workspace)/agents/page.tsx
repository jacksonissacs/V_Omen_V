import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { demoIntelligenceAllowed } from "@/lib/db/config"

export const metadata: Metadata = { title: "Agents" }

export default async function AgentsPage() {
  if (!demoIntelligenceAllowed()) notFound()
  const { AgentsScreen } = await import("@/components/screens/agents-screen")
  return <AgentsScreen />
}
