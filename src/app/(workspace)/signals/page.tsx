import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { demoIntelligenceAllowed } from "@/lib/db/config"

export const metadata: Metadata = { title: "Signals" }

export default async function SignalsPage() {
  if (!demoIntelligenceAllowed()) notFound()
  const { SignalsScreen } = await import("@/components/screens/signals-screen")
  return <SignalsScreen />
}
