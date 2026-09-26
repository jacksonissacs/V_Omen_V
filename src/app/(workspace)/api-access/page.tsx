import type { Metadata } from "next"

import { UtilityScreen } from "@/components/screens/utility-screen"

export const metadata: Metadata = { title: "API" }

export default function ApiAccessPage() {
  return (
    <UtilityScreen
      title="API"
      description="Typed event-intelligence contracts for downstream clients."
      rows={[
        { label: "List events", value: "GET /api/events" },
        { label: "Filter domain", value: "GET /api/events?domain=finance" },
        { label: "Get event", value: "GET /api/events/:id" },
        { label: "List checkpoints", value: "GET /api/events/:id/history" },
        { label: "Replay checkpoint", value: "GET /api/events/:id/history/:checkpointId" },
      ]}
    />
  )
}
