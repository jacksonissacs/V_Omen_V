export type AppRoute =
  | "/pulse"
  | "/events"
  | "/markets"
  | "/signals"
  | "/agents"
  | "/watchlists"
  | "/research"
  | "/archive"
  | "/relations"
  | "/alerts"
  | "/settings"
  | "/team"
  | "/api-access"

export interface NavItem {
  href: AppRoute
  label: string
  icon:
    | "pulse"
    | "events"
    | "markets"
    | "signals"
    | "agents"
    | "watchlists"
    | "research"
    | "archive"
    | "relations"
    | "alerts"
    | "settings"
    | "team"
    | "api"
  /** True when the destination is a labelled demo, not a launch feature. */
  demo?: boolean
  /** Short status shown next to demo items. */
  status?: string
}

export interface LedgerCard {
  name: string
  verified: string
  calibration: string
  forecasts: string
  coverage: string
  best: string
  weakest: string
}

export interface WatchlistItem {
  id: string
  eventId: string
  name: string
  subtitle: string
  state: string
  move: string
  catalyst: string
  nextEvent: string
}
