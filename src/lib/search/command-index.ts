import { CATEGORY_DOMAIN } from "@/lib/domain/categories"
import { DOMAIN_LABEL, type SearchHit } from "@/lib/domain/types"
import type { AionEvent } from "@/types/event"

const STATIC_COMMANDS: SearchHit[] = [
  { id: "cmd-feed", kind: "command", title: "Open intelligence feed", subtitle: "Dashboard", href: "/pulse" },
  { id: "cmd-events", kind: "command", title: "Open events", subtitle: "Events", href: "/events" },
  { id: "cmd-watch", kind: "command", title: "Open watchlists", subtitle: "Watchlists", href: "/watchlists" },
  { id: "cmd-settings", kind: "command", title: "Open settings", subtitle: "Settings", href: "/settings" },
]

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function tokens(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean)
}

function matches(haystack: string, queryTokens: string[]): boolean {
  const hay = haystack.toLowerCase()
  return queryTokens.every((token) => hay.includes(token))
}

export function searchCatalog(
  query: string,
  catalog: AionEvent[],
): SearchHit[] {
  const queryTokens = tokens(query)
  const commands = STATIC_COMMANDS.filter((command) =>
    queryTokens.length === 0
      ? true
      : matches(`${command.title} ${command.subtitle}`, queryTokens),
  )

  const eventHits: SearchHit[] = catalog
    .filter((event) =>
      queryTokens.length === 0
        ? true
        : matches(
            [
              event.title,
              event.question,
              event.region,
              event.category,
              DOMAIN_LABEL[CATEGORY_DOMAIN[event.category]],
              ...event.tags,
            ].join(" "),
            queryTokens,
          ),
    )
    .map((event) => ({
      id: event.id,
      kind: "event" as const,
      title: event.title,
      subtitle: `${event.category} · ${event.probability.toFixed(1)}%`,
      href: `/events/${event.id}`,
      domain: CATEGORY_DOMAIN[event.category],
    }))

  const marketHits: SearchHit[] = []
  const seenMarkets = new Set<string>()
  for (const event of catalog) {
    for (const market of event.relatedMarkets) {
      if (seenMarkets.has(market.id)) continue
      const hay = `${market.name} ${market.venue} ${event.title} ${event.tags.join(" ")}`
      if (queryTokens.length > 0 && !matches(hay, queryTokens)) continue
      seenMarkets.add(market.id)
      marketHits.push({
        id: market.id,
        kind: "market",
        title: market.name,
        subtitle: `${market.venue} · linked from ${event.title}`,
        href: `/events/${event.id}`,
      })
    }
  }

  return [...eventHits, ...marketHits, ...commands]
}
