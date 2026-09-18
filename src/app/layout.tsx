import type { Metadata } from "next"
import { IBM_Plex_Mono, Inter } from "next/font/google"
import type { ReactNode } from "react"

import "./globals.css"
import "./aion-workspace.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
})

export const metadata: Metadata = {
  title: {
    default: "OMEN — Every probability, with its history",
    template: "%s · OMEN",
  },
  description:
    "OMEN records what the world expected, when it expected it, and why that changed. Point-in-time probabilities, evidence, and a public accuracy ledger.",
  applicationName: "OMEN",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {children}
      </body>
    </html>
  )
}
