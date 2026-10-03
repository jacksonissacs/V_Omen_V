import { notFound, redirect } from "next/navigation"

import { demoIntelligenceAllowed } from "@/lib/db/config"

export default function GraphRedirectPage() {
  if (!demoIntelligenceAllowed()) notFound()
  redirect("/relations")
}
