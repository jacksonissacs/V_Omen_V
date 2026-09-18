import type { LedgerCard, NavItem, WatchlistItem } from "@/types/workspace"

export const primaryNav: NavItem[] = [
  { href: "/pulse", label: "Intelligence", icon: "pulse" },
  { href: "/events", label: "Events", icon: "events" },
  { href: "/markets", label: "Markets", icon: "markets" },
  { href: "/signals", label: "Signals", icon: "signals" },
  { href: "/agents", label: "Agents", icon: "agents" },
  { href: "/watchlists", label: "Watchlists", icon: "watchlists" },
  { href: "/research", label: "Research", icon: "research" },
]

export const workspaceNav: NavItem[] = [
  { href: "/archive", label: "Archive", icon: "archive" },
  { href: "/relations", label: "Relations", icon: "relations" },
  { href: "/alerts", label: "Alerts", icon: "alerts" },
]

export const footerNav: NavItem[] = [
  { href: "/research", label: "Alan · 1,847", icon: "research" },
  { href: "/settings", label: "Settings", icon: "settings" },
]

export const routeHeadings: Record<string, string> = {
  "/pulse": "Pulse",
  "/events": "Events",
  "/markets": "Markets",
  "/signals": "Signals",
  "/agents": "Agents",
  "/watchlists": "Watchlists",
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

export const defaultWatchlistIds = [
  "evt-boc-cut",
  "evt-frontier-release",
  "evt-fed-cut",
  "evt-housing-ca",
] as const

export function watchlistRows(
  items: {
    id: string
    title: string
    category: string
    probability: number
    change: number
    likelyCause: string
    resolvesAt?: string
  }[],
): WatchlistItem[] {
  return items.map((item) => ({
    id: item.id,
    eventId: item.id,
    name: item.title,
    subtitle: `${item.category} · open event`,
    state: `${item.probability.toFixed(1)}%`,
    move:
      item.change === 0
        ? "No move"
        : `${item.change > 0 ? "+" : ""}${item.change.toFixed(1)} pts`,
    catalyst: item.likelyCause,
    nextEvent: item.resolvesAt ?? "—",
  }))
}
