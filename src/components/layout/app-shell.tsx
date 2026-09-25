"use client"

import type { ReactNode } from "react"

import { CallModal } from "@/components/common/call-modal"
import { CommandPalette } from "@/components/common/command-palette"
import { TopBar } from "@/components/header/top-bar"
import {
  WorkspaceProvider,
  useWorkspace,
  type WorkspaceShellData,
} from "@/components/layout/workspace-provider"
import { Sidebar } from "@/components/sidebar/sidebar"

export function AppShell({
  children,
  data,
}: {
  children: ReactNode
  data?: WorkspaceShellData
}) {
  return (
    <WorkspaceProvider data={data}>
      <AppShellFrame>{children}</AppShellFrame>
    </WorkspaceProvider>
  )
}

function AppShellFrame({ children }: { children: ReactNode }) {
  const { collapsed, paletteOpen, callEvent } = useWorkspace()

  return (
    <div className="aion-app" data-collapsed={collapsed}>
      <Sidebar />
      <TopBar />
      <main className="aion-main">{children}</main>
      {paletteOpen ? <CommandPalette /> : null}
      {callEvent ? <CallModal /> : null}
    </div>
  )
}
