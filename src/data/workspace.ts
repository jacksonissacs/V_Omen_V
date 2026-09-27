import type { LedgerCard, NavItem } from "@/types/workspace"

/** Working launch routes. These are the only primary destinations. */
export const launchNav: NavItem[] = [
  { href: "/pulse", label: "Pulse", icon: "pulse" },
  { href: "/watchlists", label: "Following", icon: "watchlists" },
]

export const archiveNav: NavItem[] = [
  {
    href: "/archive",
    label: "Archive",
    icon: "archive",
    demo: true,
    status: "Demo — does not query stored history",
  },
]

/** Working but not a launch destination. */
export const bookNav: NavItem[] = [{ href: "/events", label: "Events book", icon: "events" }]

/**
 * Deferred screens. Implementations stay; they are labelled demos and are not
 * presented as a track record or as live workspace features.
 */
export const demoNav: NavItem[] = [
  { href: "/markets", label: "Markets", icon: "markets", demo: true, status: "Illustrative demo" },
  { href: "/signals", label: "Signals", icon: "signals", demo: true, status: "Illustrative demo" },
  { href: "/agents", label: "Agents", icon: "agents", demo: true, status: "Illustrative demo" },
  {
    href: "/research",
    label: "Research",
    icon: "research",
    demo: true,
    status: "Illustrative demo — not a track record",
  },
  { href: "/relations", label: "Relations", icon: "relations", demo: true, status: "Illustrative demo" },
  { href: "/alerts", label: "Alerts", icon: "alerts", demo: true, status: "Illustrative demo" },
  { href: "/team", label: "Team", icon: "team", demo: true, status: "Illustrative demo" },
  { href: "/api-access", label: "API", icon: "api", demo: true, status: "Illustrative demo" },
  { href: "/settings", label: "Settings", icon: "settings", demo: true, status: "Illustrative demo" },
]

/** @deprecated Use launchNav / archiveNav / demoNav. Kept for any leftover imports. */
export const primaryNav = [...launchNav, ...bookNav]
export const workspaceNav = archiveNav
export const footerNav: NavItem[] = []

export const routeHeadings: Record<string, string> = {
  "/pulse": "Pulse",
  "/events": "Events book",
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
