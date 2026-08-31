"use client"

import { QuantityCounter } from "@/components/public/quantity-counter"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { formatTicketPrice } from "@/lib/format"
import type {
  StorefrontSectorCatalog,
  StorefrontSectorOption,
} from "@/lib/seating/storefront-sector-catalog"
import { cn } from "@/lib/utils"

export function SeatSelectionQuickList({
  sectors,
  pending = false,
  gaQuantityBySector,
  gaMaxBySector,
  onTogglePlace,
  onAssignZoneQuantity,
}: {
  sectors: StorefrontSectorCatalog[]
  focusedSectorId?: string | null
  pending?: boolean
  gaQuantityBySector: Record<string, number>
  gaMaxBySector: Record<string, number>
  onTogglePlace: (placeId: string) => void
  onAssignZoneQuantity: (sectorId: string, quantity: number) => void
}) {
  const catalog = sectors ?? []
  if (catalog.length === 0) {
    return (
      <p className="px-1 py-10 text-center text-sm text-muted-foreground">
        No hay lugares configurados en el mapa.
      </p>
    )
  }

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={[]}
      className="flex flex-col gap-3"
    >
      {catalog.map((sector) => {
        const gaQty = gaQuantityBySector[sector.id] ?? 0
        const gaMax = Math.max(0, gaMaxBySector[sector.id] ?? 0)
        const available = sectorAvailableCount(sector, gaMaxBySector)
        return (
          <AccordionItem
            key={sector.id}
            value={sector.id}
            className="overflow-hidden rounded-2xl border border-border bg-card px-1"
          >
            <AccordionTrigger className="min-h-14 px-3 py-3 hover:no-underline">
              <span className="flex min-w-0 items-center gap-3">
                <span
                  className="size-3.5 shrink-0 rounded-full ring-1 ring-border"
                  style={{ backgroundColor: sector.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 text-left">
                  <span className="block truncate text-base font-semibold text-foreground">
                    {sector.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Precio: {formatTicketPrice(sector.price)} • {available}{" "}
                    {available === 1
                      ? "lugar disponible"
                      : "lugares disponibles"}
                  </span>
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-4">
              {sector.kind === "ga" ? (
                <GaSectorPicker
                  pending={pending}
                  quantity={Math.max(0, gaQty)}
                  max={Math.max(0, gaMax)}
                  disabled={pending || gaMax <= 0}
                  onChange={(next) => onAssignZoneQuantity(sector.id, next)}
                />
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {(sector.options ?? []).map((option) => (
                    <PlaceOptionRow
                      key={option.id}
                      option={option}
                      pending={pending}
                      onToggle={() => onTogglePlace(option.id)}
                    />
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
  )
}

function sectorAvailableCount(
  sector: StorefrontSectorCatalog,
  gaMaxBySector: Record<string, number>,
) {
  if (sector.kind === "ga") {
    return Math.max(0, gaMaxBySector[sector.id] ?? 0)
  }
  return (sector.options ?? []).filter(
    (option) => option.available || option.selected,
  ).length
}

function GaSectorPicker({
  quantity,
  max,
  pending,
  disabled,
  onChange,
}: {
  quantity: number
  max: number
  pending: boolean
  disabled: boolean
  onChange: (next: number) => void
}) {
  if (disabled && max <= 0) {
    return (
      <div className="pointer-events-none flex items-center justify-between gap-3 px-1 py-2 opacity-50">
        <p className="text-sm text-muted-foreground">Acceso general</p>
        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Agotado
        </span>
      </div>
    )
  }
  const nextMax = Math.max(1, max)
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <p className="text-sm text-muted-foreground">Acceso general</p>
      <QuantityCounter
        compact
        quantity={quantity}
        min={0}
        max={nextMax}
        disabled={pending || disabled}
        onDecrease={() => onChange(Math.max(0, quantity - 1))}
        onIncrease={() => onChange(Math.min(nextMax, quantity + 1))}
      />
    </div>
  )
}

function PlaceOptionRow({
  option,
  pending,
  onToggle,
}: {
  option: StorefrontSectorOption
  pending: boolean
  onToggle: () => void
}) {
  const taken = !option.available && !option.selected
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-2.5",
        (pending || taken) && "opacity-50",
      )}
    >
      <span className="min-w-0 truncate text-sm font-medium text-foreground">
        {option.label}
      </span>
      {taken ? (
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Agotado
        </span>
      ) : (
        <QuantityCounter
          compact
          quantity={option.selected ? 1 : 0}
          min={0}
          max={1}
          disabled={pending}
          onDecrease={() => {
            if (option.selected) onToggle()
          }}
          onIncrease={() => {
            if (!option.selected) onToggle()
          }}
        />
      )}
    </div>
  )
}
