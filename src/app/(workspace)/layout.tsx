import { connection } from "next/server"
import type { ReactNode } from "react"

import { AppShell } from "@/components/layout/app-shell"
import type { WorkspaceShellData } from "@/components/layout/workspace-provider"
import { getRepository, summarizeProvenance } from "@/lib/data/repository"
import { toEventSummary } from "@/lib/events"

async function loadShellData(): Promise<WorkspaceShellData> {
  const repository = getRepository()
  try {
    const [events, followedEventIds] = await Promise.all([
      repository.listEvents({ order: "catalog" }),
      repository.listFollowedEventIds(),
    ])
    return {
      eventIndex: events.map(toEventSummary),
      followedEventIds,
      available: true,
      storage: repository.storage,
      provenance: summarizeProvenance(events),
    }
  } catch (error) {
    console.error("Workspace shell data unavailable", error)
    return {
      eventIndex: [],
      followedEventIds: [],
      available: false,
      storage: repository.storage,
      provenance: "none",
    }
  }
}

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  // Storage mode is read at request time, so no workspace page may be prerendered.
  await connection()
  const data = await loadShellData()
  return <AppShell data={data}>{children}</AppShell>
}
