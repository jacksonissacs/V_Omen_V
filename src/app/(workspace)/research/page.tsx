import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { demoIntelligenceAllowed } from "@/lib/db/config"

export const metadata: Metadata = { title: "Research" }

export default async function ResearchPage() {
  if (!demoIntelligenceAllowed()) notFound()
  const { ResearchScreen } = await import("@/components/screens/research-screen")
  return <ResearchScreen />
}
