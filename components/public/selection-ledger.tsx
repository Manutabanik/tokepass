"use client"

import { CheckCircle, X } from "lucide-react"

import { formatCurrency } from "@/lib/format"
import { formatStorefrontSelectionGroups } from "@/lib/seating/storefront-selection"
import type { StorefrontSelectedItem } from "@/lib/stores/storefront-seat-store"
import {
  useStorefrontSeatStore,
} from "@/lib/stores/storefront-seat-store"
import { cn } from "@/lib/utils"

export function SelectionLedger({
  items,
  onRemove,
  className,
}: {
  items: StorefrontSelectedItem[]
  onRemove: (id: string) => void
  className?: string
}) {
  const groups = formatStorefrontSelectionGroups(items)
  const setFocusedMapIds = useStorefrontSeatStore(
    (state) => state.setFocusedMapIds,
  )
  const pulseFocus = useStorefrontSeatStore((state) => state.pulseFocus)
  const count = items.reduce(
    (sum, item) => sum + Math.max(1, Math.floor(item.capacity) || 1),
    0,
  )

  if (groups.length === 0) return null

  return (
    <div className={cn("flex flex-col gap-3 bg-transparent", className)}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <CheckCircle className="size-4 text-primary" aria-hidden="true" />
        Lugares seleccionados ({count})
      </h3>
      <div className="no-scrollbar flex max-h-[40vh] flex-col gap-2 overflow-y-auto pb-4">
        {groups.map((group) => {
          const accent = group.color || "var(--primary)"
          return (
            <div
              key={group.key}
              className="group relative flex flex-col rounded-2xl border border-border/50 bg-muted/30 p-4 transition-all hover:bg-muted/50"
              onMouseEnter={() => setFocusedMapIds(group.ids)}
              onMouseLeave={() => setFocusedMapIds([])}
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                {group.sectorLabel ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase"
                  style={{ backgroundColor: accent }}
                >
                  <span
                    className="size-1.5 rounded-full bg-white/90"
                    aria-hidden="true"
                  />
                  {group.sectorLabel}
                </span>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => {
                    for (const id of group.ids) onRemove(id)
                  }}
                  className="rounded-full p-1 text-muted-foreground transition-colors hover:text-destructive"
                  aria-label={`Quitar ${group.placeLabel}`}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <button
                    type="button"
                    className="text-left text-base font-bold text-foreground"
                    onClick={() => pulseFocus(group.ids)}
                  >
                    {group.placeLabel}
                  </button>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {group.chairsLabel || "Incluye lugares asignados"}
                  </p>
                </div>
                <span className="shrink-0 text-base font-black tabular-nums text-foreground">
                  {formatCurrency(group.price)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
