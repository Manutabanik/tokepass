"use client"

import { Sparkles } from "lucide-react"

import { QuantityList } from "@/components/public/event-checkout-selector"
import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"

export function CheckoutUpsellStep({
  extras,
  quantities,
  isPending,
  onQuantityChange,
}: {
  extras: TicketSelectorTier[]
  quantities: Record<string, number>
  isPending: boolean
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
}) {
  return (
    <section className="space-y-5" aria-label="Extras opcionales">
      <div>
        <h2 className="text-lg font-black text-foreground md:text-xl">
          ¿Sumás algo más?
        </h2>
        <p className="mt-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          <Sparkles className="size-3.5" aria-hidden="true" />
          Opcional (Podés saltearlo si querés)
        </p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Estacionamiento, merch u otros extras. El resumen de tus entradas
          queda a la derecha. Podés seguir sin sumar nada.
        </p>
      </div>

      {extras.length > 0 ? (
        <QuantityList
          action="add"
          tiers={extras}
          quantities={quantities}
          isPending={isPending}
          onQuantityChange={onQuantityChange}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          No hay extras disponibles para este evento.
        </p>
      )}
    </section>
  )
}
