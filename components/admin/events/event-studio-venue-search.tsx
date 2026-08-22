"use client"

import { MapPin, Plus, Search } from "lucide-react"
import { useMemo, useState } from "react"

import type { OrganizerVenue } from "@/app/actions/venues"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { STUDIO_CONTROL_CLASS } from "@/lib/admin/studio-form-styles"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

export function EventStudioVenueSearch({
  venues,
  selectedId,
  onSelect,
  onCreateNew,
}: {
  venues: OrganizerVenue[]
  selectedId: string | null
  onSelect: (venue: OrganizerVenue) => void
  onCreateNew: () => void
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const selected = venues.find((venue) => venue.id === selectedId) ?? null

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const available = venues.filter((venue) => !venue.isArchived)
    if (!needle) return available.slice(0, 8)
    return available
      .filter((venue) => {
        const haystack = [venue.name, venue.address, venue.location, venue.city]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return haystack.includes(needle)
      })
      .slice(0, 8)
  }, [query, venues])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120)
          }}
          placeholder="Buscar un recinto guardado"
          className={cn(STUDIO_CONTROL_CLASS, "pl-9")}
          autoComplete="off"
        />
        {open ? (
          <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl">
            {matches.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                No hay recintos que coincidan.
              </p>
            ) : (
              <ul className="max-h-64 overflow-y-auto py-1">
                {matches.map((venue) => (
                  <li key={venue.id}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        onSelect(venue)
                        setQuery(venue.name)
                        setOpen(false)
                      }}
                      className={cn(
                        "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition hover:bg-muted",
                        venue.id === selectedId && "bg-emerald-500/10",
                      )}
                    >
                      <span className="text-sm font-semibold text-foreground">
                        {venue.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {[venue.address || venue.location, venue.city]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            Recinto confirmado
          </p>
          <p className="mt-1 flex items-start gap-2 text-base font-semibold text-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0 text-emerald-400" />
            <span className="min-w-0">{selected.name}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {[selected.address || selected.location, selected.city]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatNumber(selected.capacity)} personas
          </p>
        </div>
      ) : null}

      <Button
        type="button"
        variant="outline"
        onClick={onCreateNew}
        className="h-12 w-full rounded-xl text-base"
      >
        <Plus />
        Crear un lugar nuevo
      </Button>
    </div>
  )
}
