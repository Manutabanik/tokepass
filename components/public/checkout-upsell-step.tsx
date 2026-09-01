"use client"

import { Sparkles } from "lucide-react"

import { QuantityList } from "@/components/public/event-checkout-selector"
import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
import type { CheckoutDateCard } from "@/lib/checkout/ticket-day-groups"
import { cn } from "@/lib/utils"
import type { ScheduleDay } from "@/types/events"

export function CheckoutUpsellStep({
  extras,
  quantities,
  isPending,
  onQuantityChange,
  dateCards = [],
  selectedDateId = null,
  onSelectedDateIdChange,
  scheduleDays = [],
  hasAnyExtras = false,
}: {
  extras: TicketSelectorTier[]
  quantities: Record<string, number>
  isPending: boolean
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
  dateCards?: CheckoutDateCard[]
  selectedDateId?: string | null
  onSelectedDateIdChange?: (dateId: string) => void
  scheduleDays?: ScheduleDay[]
  hasAnyExtras?: boolean
}) {
  const showDateCards = dateCards.length > 1

  return (
    <section className="space-y-5" aria-label="Extras opcionales">
      <div>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          <Sparkles className="size-3.5" aria-hidden="true" />
          Opcional (Podés saltearlo si querés)
        </p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Estacionamiento, merch u otros extras. El resumen de tus entradas
          queda a la derecha. Podés seguir sin sumar nada.
        </p>
      </div>

      {showDateCards ? (
        <div
          className="hide-scrollbar flex gap-3 overflow-x-auto snap-x snap-mandatory pb-4 lg:flex-wrap lg:gap-4 lg:overflow-visible lg:snap-none lg:pb-2"
          role="tablist"
          aria-label="Elegí el día"
        >
          {dateCards.map((card) => {
            const selected = selectedDateId === card.dateId
            return (
              <button
                key={card.dateId}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onSelectedDateIdChange?.(card.dateId)}
                className={cn(
                  "flex min-w-[120px] snap-start cursor-pointer flex-col items-center justify-center rounded-xl border-2 px-6 py-3 transition-all",
                  selected
                    ? "border-primary bg-primary/10 font-bold text-primary"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-400 dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:border-muted-foreground/40",
                )}
              >
                <span className="text-xs font-bold uppercase tracking-wider">
                  {card.weekday}
                </span>
                <span className="mt-0.5 text-lg font-black tracking-tight">
                  {card.dayNumber} {card.month}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      {extras.length > 0 ? (
        <QuantityList
          action="add"
          tiers={extras}
          quantities={quantities}
          isPending={isPending}
          onQuantityChange={onQuantityChange}
          selectedDateId={selectedDateId}
          scheduleDays={scheduleDays}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {hasAnyExtras
            ? "No hay extras para este día."
            : "No hay extras disponibles para este evento."}
        </p>
      )}
    </section>
  )
}
