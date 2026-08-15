"use client"

import { CheckCircle, MapPin, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import { formatStorefrontSelectionGroups } from "@/lib/seating/storefront-selection"
import type { StorefrontSelectedItem } from "@/lib/stores/storefront-seat-store"
import {
  storefrontSelectionTotal,
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
  const total = storefrontSelectionTotal(items)
  const count = items.reduce(
    (sum, item) => sum + Math.max(1, Math.floor(item.capacity) || 1),
    0,
  )
  const [totalBump, setTotalBump] = useState(false)
  const lastTotal = useRef(total)

  useEffect(() => {
    if (lastTotal.current === total) return
    lastTotal.current = total
    setTotalBump(true)
    const timer = window.setTimeout(() => setTotalBump(false), 280)
    return () => window.clearTimeout(timer)
  }, [total])

  if (groups.length === 0) return null

  return (
    <div
      className={cn(
        "shrink-0 border-t border-border bg-background/95 px-3 py-1.5 backdrop-blur sm:px-4 sm:py-3",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-semibold text-foreground">
          <CheckCircle
            className="mr-1.5 inline size-4 align-text-bottom text-primary"
            aria-hidden="true"
          />
          Seleccionados ({count})
        </p>
        <p
          className={cn(
            "shrink-0 text-lg font-bold tabular-nums text-foreground transition-all sm:text-xl",
            totalBump && "scale-105 text-primary",
          )}
        >
          {formatCurrency(total)}
        </p>
      </div>
      <ul className="mt-1.5 flex flex-col gap-1 sm:mt-2 sm:gap-1.5">
        {groups.map((group) => (
          <li key={group.key} className="min-w-0">
            <span className="flex w-full min-w-0 items-start gap-1.5 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs text-foreground">
              <button
                type="button"
                className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label={`Ver ${group.placeLabel} en el mapa`}
                onMouseEnter={() => setFocusedMapIds(group.ids)}
                onMouseLeave={() => setFocusedMapIds([])}
                onFocus={() => setFocusedMapIds(group.ids)}
                onBlur={() => setFocusedMapIds([])}
                onClick={() => pulseFocus(group.ids)}
              >
                <MapPin className="size-3.5" aria-hidden="true" />
              </button>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span
                    className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                    style={{
                      backgroundColor: group.color || "var(--primary)",
                    }}
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-white/90"
                      aria-hidden="true"
                    />
                    <span className="truncate">{group.sectorLabel}</span>
                  </span>
                  <span className="min-w-0 break-words font-medium leading-snug">
                    {group.placeLabel}
                  </span>
                </span>
                {group.chairsLabel ? (
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {group.chairsLabel}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 tabular-nums font-semibold text-foreground">
                {formatCurrency(group.price)}
              </span>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="size-5 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => {
                  for (const id of group.ids) onRemove(id)
                }}
                aria-label={`Quitar ${group.placeLabel}`}
              >
                <X className="size-3" />
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
