import type { Metadata } from "next"

import { FaqSection } from "@/components/marketing/faq-section"
import {
  ArchiveSection,
  LedgerSection,
  MethodologySection,
  PulseSection,
  RelationsSection,
} from "@/components/marketing/feature-sections"
import { FinalCta } from "@/components/marketing/final-cta"
import { Hero } from "@/components/marketing/hero"
import { PreviewSection } from "@/components/marketing/preview-section"
import { Walkthrough } from "@/components/marketing/walkthrough"

export const metadata: Metadata = {
  title: { absolute: "OMEN — Every probability, with its history" },
  description:
    "OMEN records what the world expected, when it expected it, and why that changed. Point-in-time probabilities, evidence, and a public accuracy ledger.",
}

export default function LandingPage() {
  return (
    <main>
      <Hero />
      <PreviewSection />
      <Walkthrough />
      <PulseSection />
      <ArchiveSection />
      <LedgerSection />
      <RelationsSection />
      <MethodologySection />
      <FaqSection />
      <FinalCta />
    </main>
  )
}
