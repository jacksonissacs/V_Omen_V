import type { WatchlistItem } from "@/types/workspace"

export function watchlistRows(
  items: {
    id: string
    title: string
    category: string
    probability: number
    change: number | null
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
      item.change === null
        ? "Not computable"
        : item.change === 0
          ? "No move"
          : `${item.change > 0 ? "+" : ""}${item.change.toFixed(1)} pts`,
    catalyst: item.likelyCause,
    nextEvent: item.resolvesAt ?? "—",
  }))
}
