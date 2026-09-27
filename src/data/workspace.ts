import type { LedgerCard, MoreNavItem, NavItem } from "@/types/workspace"

/** Primary consumer destinations. Unfinished screens stay routable but are not linked. */
export const primaryNav: NavItem[] = [
  { href: "/pulse", label: "Pulse", icon: "pulse" },
  { href: "/events", label: "Explore", icon: "events" },
  { href: "/watchlists", label: "Following", icon: "watchlists" },
]

/** Destinations offered only through the More menu — not primary chrome. */
export const moreNav: MoreNavItem[] = [
  {
    href: "/archive",
    label: "Archive",
    description: "Recorded checkpoint replay for events in the book.",
  },
  {
    href: "/",
    label: "Public OMEN page",
    description: "The public marketing page for OMEN.",
  },
]

/** @deprecated Empty — Archive and Settings are no longer primary chrome. */
export const workspaceNav: NavItem[] = []

/** @deprecated Empty — Settings is unpromoted until controls match real behavior. */
export const footerNav: NavItem[] = []

export const routeHeadings: Record<string, string> = {
  "/pulse": "Pulse",
  "/events": "Explore",
  "/markets": "Markets",
  "/signals": "Signals",
  "/agents": "Agents",
  "/watchlists": "Following",
  "/research": "Research",
  "/archive": "Archive",
  "/relations": "Relations",
  "/alerts": "Alerts",
  "/settings": "Settings",
  "/team": "Team",
  "/api-access": "API",
}

export const ledgerCards: LedgerCard[] = [
  {
    name: "Federal Reserve",
    verified: "Verified institution",
    calibration: "78%",
    forecasts: "2,041",
    coverage: "86%",
    best: "US monetary policy",
    weakest: "Labor revisions",
  },
  {
    name: "OMEN consensus",
    verified: "Verified aggregate",
    calibration: "84%",
    forecasts: "12,407",
    coverage: "91%",
    best: "Technology",
    weakest: "Geopolitics",
  },
  {
    name: "Bank of Canada staff",
    verified: "Verified institution",
    calibration: "81%",
    forecasts: "612",
    coverage: "74%",
    best: "Canadian CPI",
    weakest: "Housing",
  },
  {
    name: "Frontier model aggregate",
    verified: "Verified aggregate",
    calibration: "79%",
    forecasts: "4,118",
    coverage: "93%",
    best: "AI product timing",
    weakest: "Energy geopolitics",
  },
]

export const modelRankings = [
  ["Market consensus", "83%", "0.121", "96%", "+2.1", "+1.4", "+1.9"],
  ["OMEN ensemble", "82%", "0.125", "94%", "+2.0", "+2.3", "+1.4"],
  ["Frontier model aggregate", "79%", "0.134", "93%", "+1.2", "−0.3", "+0.8"],
  ["Human forecaster benchmark", "76%", "0.147", "71%", "+0.5", "+0.7", "+0.4"],
] as const

export const forecastHistory = [
  ["FOMC cut in July", "71%", "43%", "YES", "+21", "Jul 08"],
  ["Frontier run before October", "74%", "51%", "YES", "+18", "Jun 30"],
  ["US CPI above 3.1%", "38%", "44%", "NO", "+6", "Jun 11"],
  ["EU AI enforcement action", "62%", "58%", "Open", "—", "Aug 21"],
  ["Chip export rules expanded", "55%", "61%", "NO", "−9", "May 02"],
] as const
