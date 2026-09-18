import type { Metadata } from "next"

import { PulseScreen } from "@/components/screens/pulse-screen"

export const metadata: Metadata = { title: "Pulse" }

export default function PulsePage() {
  return <PulseScreen />
}
