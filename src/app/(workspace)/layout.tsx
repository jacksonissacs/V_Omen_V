import type { ReactNode } from "react"

import { AppShell } from "@/components/layout/app-shell"
import type { WorkspaceShellData } from "@/components/layout/workspace-provider"
import { getRepository } from "@/lib/data/repository"
import { toEventSummary } from "@/lib/events"

async function loadShellData(): Promise<WorkspaceShellData> {
  const repository = getRepository()
  try {
    const [events, followedEventIds] = await Promise.all([
      repository.listEvents({ order: "catalog" }),
      repository.listFollowedEventIds(),
    ])
    return { eventIndex: events.map(toEventSummary), followedEventIds, available: true }
  } catch (error) {
    console.error("Workspace shell data unavailable", error)
    return { eventIndex: [], followedEventIds: [], available: false }
  }
}

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const data = await loadShellData()
  return <AppShell data={data}>{children}</AppShell>
}
