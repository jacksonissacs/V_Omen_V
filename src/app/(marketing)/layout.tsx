import type { ReactNode } from "react"

import { SiteFooter } from "@/components/marketing/site-footer"
import { SiteHeader } from "@/components/marketing/site-header"

import "./marketing.css"

/**
 * Public marketing shell. Deliberately separate from the workspace `AppShell`:
 * its own header/footer, and all styling scoped under `.omen-marketing`.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="omen-marketing" id="top">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  )
}
