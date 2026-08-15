"use client"

import { CheckCircle, MapPin, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import { formatStorefrontSelectionGroups } from "@/lib/seating/storefront-selection"
import type { StorefrontSelectedItem } from "@/lib/stores/storefront-seat-store"
import { storefrontSelectionTotal } from "@/lib/stores/storefront-seat-store"
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
  if (groups.length === 0) return null

  const total = storefrontSelectionTotal(items)
  const count = items.reduce(
    (sum, item) => sum + Math.max(1, Math.floor(item.capacity) || 1),
    0,
  )

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
        <p className="shrink-0 text-lg font-bold tabular-nums text-foreground sm:text-xl">
          {formatCurrency(total)}
        </p>
      </div>
      <ul className="mt-1.5 flex flex-col gap-1 sm:mt-2 sm:gap-1.5">
        {groups.map((group) => (
          <li key={group.key} className="min-w-0">
            <span className="flex w-full min-w-0 items-start gap-1.5 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs text-foreground">
              <MapPin
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 break-words font-medium leading-snug">
                {group.label}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
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
                aria-label={`Quitar ${group.label}`}
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
