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
import { cn, tapFeedbackClass } from "@/lib/utils"

export function SeatSelectionQuickList({
  sectors,
  focusedSectorId,
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
  if (sectors.length === 0) {
    return (
      <p className="px-1 py-10 text-center text-sm text-muted-foreground">
        No hay lugares configurados en el mapa.
      </p>
    )
  }

  const openId =
    (focusedSectorId && sectors.some((sector) => sector.id === focusedSectorId)
      ? focusedSectorId
      : sectors[0]?.id) ?? ""

  return (
    <Accordion
      key={openId}
      multiple
      defaultValue={openId ? [openId] : []}
      className="flex flex-col gap-2"
    >
      {sectors.map((sector) => {
        const gaQty = gaQuantityBySector[sector.id] ?? 0
        const gaMax = Math.max(0, gaMaxBySector[sector.id] ?? 0)
        return (
          <AccordionItem
            key={sector.id}
            value={sector.id}
            className="overflow-hidden rounded-2xl border border-border bg-card px-2"
          >
            <AccordionTrigger className="min-h-12 px-3 py-3 hover:no-underline">
              <span className="flex min-w-0 items-center gap-3">
                <span
                  className="size-3.5 shrink-0 rounded-full ring-1 ring-border"
                  style={{ backgroundColor: sector.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 text-left">
                  <span className="block truncate font-semibold text-foreground">
                    {sector.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {sector.kind === "ga"
                      ? `Acceso general · ${formatTicketPrice(sector.price)}`
                      : `${sector.options.length} ${sector.options.length === 1 ? "opción" : "opciones"} · ${formatTicketPrice(sector.price)}`}
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
                <div className="grid grid-cols-1 gap-2">
                  {sector.options.map((option) => (
                    <PlaceOptionButton
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
      <div className="pointer-events-none flex items-center justify-between gap-3 px-1 py-3 opacity-50">
        <p className="text-sm text-muted-foreground">Acceso general</p>
        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Agotado
        </span>
      </div>
    )
  }
  const nextMax = Math.max(1, max)
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <p className="text-sm text-muted-foreground">
        Acceso general. Indicá cuántas entradas querés.
      </p>
      <QuantityCounter
        quantity={quantity}
        min={0}
        max={nextMax}
        disabled={pending || disabled}
        onDecrease={() => onChange(Math.max(0, quantity - 1))}
        onIncrease={() => onChange(Math.min(nextMax, quantity + 1))}
      />
      <p className="text-sm font-semibold text-muted-foreground">
        {quantity === 1 ? "1 entrada" : `${quantity} entradas`}
      </p>
    </div>
  )
}

function PlaceOptionButton({
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
    <button
      type="button"
      disabled={pending || taken}
      aria-pressed={option.selected}
      onClick={onToggle}
      className={cn(
        tapFeedbackClass,
        "flex min-h-12 items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left font-semibold transition-all",
        option.selected
          ? "border-emerald-500 bg-emerald-600 text-white"
          : "border-border bg-card text-foreground hover:border-emerald-500/60",
        (pending || taken) && "pointer-events-none opacity-50",
      )}
    >
      <span className="truncate">{option.label}</span>
      <span className="shrink-0 tabular-nums">
        {taken ? "Agotado" : formatTicketPrice(option.price)}
      </span>
    </button>
  )
}
