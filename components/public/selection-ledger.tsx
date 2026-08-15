"use client"

import { CheckCircle, MapPin, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
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
  if (items.length === 0) return null

  const total = storefrontSelectionTotal(items)
  const count = items.reduce(
    (sum, item) => sum + Math.max(1, Math.floor(item.capacity) || 1),
    0,
  )

  return (
    <div
      className={cn(
        "shrink-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <CheckCircle className="size-4 text-primary" aria-hidden="true" />
            Lugares seleccionados ({count})
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Revisá el detalle antes de continuar. El total incluye todos los
            lugares de la lista.
          </p>
        </div>
        <p className="text-2xl font-bold tabular-nums text-foreground">
          {formatCurrency(total)}
        </p>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground">
              <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="max-w-[9rem] truncate">{item.name}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatCurrency(item.price * Math.max(1, item.capacity))}
              </span>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="size-5 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => onRemove(item.id)}
                aria-label={`Quitar ${item.name}`}
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
