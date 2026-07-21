"use client"

import { Search } from "lucide-react"
import { useMemo, useState } from "react"

import type { CatalogEvent } from "@/app/actions/public-events"
import { DiscoveryEventCard } from "@/components/public/discovery-event-card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type DiscoveryFilterId =
  | "all"
  | "weekend"
  | "electronica"
  | "cachengue"
  | "festivales"

const FILTERS: Array<{ id: DiscoveryFilterId; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "weekend", label: "Este Finde" },
  { id: "electronica", label: "Electrónica" },
  { id: "cachengue", label: "Cachengue" },
  { id: "festivales", label: "Festivales" },
]

const KEYWORDS: Record<Exclude<DiscoveryFilterId, "all" | "weekend">, string[]> =
  {
    electronica: [
      "electro",
      "electr",
      "techno",
      "house",
      "dj",
      "rave",
      "trance",
    ],
    cachengue: ["cachengue", "reggaeton", "perreo", "cumbia", "trap"],
    festivales: ["festival", "fest", "open air", "al aire"],
  }

function isThisWeekend(dateIso: string): boolean {
  const date = new Date(dateIso)
  const now = new Date()
  const day = now.getDay()
  const diffToSaturday = (6 - day + 7) % 7
  const saturday = new Date(now)
  saturday.setHours(0, 0, 0, 0)
  saturday.setDate(now.getDate() + diffToSaturday)
  const monday = new Date(saturday)
  monday.setDate(saturday.getDate() + 2)
  monday.setHours(23, 59, 59, 999)
  return date >= saturday && date <= monday
}

function matchesKeyword(event: CatalogEvent, keys: string[]): boolean {
  const haystack = `${event.title} ${event.description ?? ""} ${event.location}`.toLowerCase()
  return keys.some((key) => haystack.includes(key))
}

export function DiscoveryCatalog({
  events,
  initialQuery = "",
}: {
  events: CatalogEvent[]
  initialQuery?: string
}) {
  const [query, setQuery] = useState(initialQuery)
  const [filter, setFilter] = useState<DiscoveryFilterId>("all")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()

    return events.filter((event) => {
      if (q) {
        const haystack =
          `${event.title} ${event.description ?? ""} ${event.location} ${event.organizerName ?? ""} ${event.venueName ?? ""}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }

      if (filter === "all") return true
      if (filter === "weekend") return isThisWeekend(event.date)
      return matchesKeyword(event, KEYWORDS[filter])
    })
  }, [events, filter, query])

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="relative max-w-xl">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar eventos, productoras o ciudades"
            aria-label="Buscar eventos"
            className="h-12 rounded-2xl border-zinc-800 bg-zinc-900/80 pl-11 text-zinc-100 placeholder:text-zinc-500 focus-visible:border-zinc-600 focus-visible:ring-zinc-600/40"
          />
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {FILTERS.map((item) => {
            const active = filter === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className="shrink-0 focus-visible:outline-none"
              >
                <Badge
                  variant={active ? "secondary" : "outline"}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                    active
                      ? "border-transparent bg-white text-zinc-950 hover:bg-zinc-200"
                      : "border-zinc-700 bg-transparent text-zinc-400 hover:border-zinc-500 hover:bg-zinc-900 hover:text-zinc-100",
                  )}
                >
                  {item.label}
                </Badge>
              </button>
            )
          })}
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {filtered.map((event, index) => (
            <DiscoveryEventCard
              key={event.id}
              event={event}
              priority={index < 3}
            />
          ))}
        </div>
      ) : (
        <div className="grid min-h-72 place-items-center rounded-[2rem] border border-dashed border-zinc-800 bg-zinc-950/60 px-6 py-16 text-center">
          <div>
            <p className="text-lg font-bold text-white">Sin eventos en esta vibra</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-500">
              Probá otro filtro o limpiá la búsqueda. La cartelera se actualiza
              cuando publican nuevas noches.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
