"use client"

import { Users } from "lucide-react"

import { formatVenuePriceArs } from "@/lib/seating/venue-element-geometry"
import type { StorefrontFocusCard } from "@/lib/seating/storefront-selection"
import { cn } from "@/lib/utils"

export function StorefrontSelectionCard({
  card,
  className,
}: {
  card: StorefrontFocusCard
  className?: string
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl border border-border bg-card p-3 text-card-foreground shadow-xl ring-1 ring-white/10",
        className,
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-base font-bold leading-tight text-foreground">
            {card.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {card.sector}
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Users className="size-3.5 shrink-0" aria-hidden="true" />
            {card.capacityLabel}
          </p>
        </div>
        <p className="shrink-0 text-xl font-bold tabular-nums text-primary">
          {formatVenuePriceArs(card.price)}
        </p>
      </div>
    </div>
  )
}
