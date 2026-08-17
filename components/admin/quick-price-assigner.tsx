"use client"

import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { PriceInput } from "@/components/ui/price-input"
import { formatCurrency } from "@/lib/format"
import {
  applyVenuePriceGroup,
  listVenuePriceGroups,
} from "@/lib/seating/venue-price-groups"
import type { InteractiveVenueMap } from "@/types/venue-map"

export function QuickPriceAssigner({
  map,
  onChange,
  onClose,
}: {
  map: InteractiveVenueMap
  onChange: (next: InteractiveVenueMap) => void
  onClose: () => void
}) {
  const groups = listVenuePriceGroups(map)
  if (groups.length === 0) return null

  return (
    <div className="absolute top-3 right-3 z-20 flex max-h-[min(70%,28rem)] w-80 flex-col overflow-hidden rounded-2xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur-md">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Precios por sector
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Un valor se aplica a todas las mesas o butacas del mismo color.
          </p>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={onClose}
          aria-label="Cerrar asignación de precios"
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
        {groups.map((group) => (
          <div key={group.key} className="space-y-1.5">
            <Label className="flex items-start gap-2 text-xs leading-snug text-foreground">
              <span
                className="mt-0.5 size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: group.color }}
              />
              <span>
                {group.name} · {group.count} {group.unit}
              </span>
            </Label>
            <p className="text-[11px] text-muted-foreground">{group.priceHint}</p>
            <PriceInput
              min={0}
              value={group.price}
              placeholder="0"
              onValueChange={(value) => {
                if (value == null) return
                onChange(applyVenuePriceGroup(map, group, value))
              }}
            />
            {group.price > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                {formatCurrency(group.price)}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
