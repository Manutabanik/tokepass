"use client"

import { Sparkles } from "lucide-react"

import { QuantityList } from "@/components/public/event-checkout-selector"
import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
import { Button } from "@/components/ui/button"

export function CheckoutUpsellStep({
  extras,
  quantities,
  isPending,
  onQuantityChange,
  onContinueWithExtras,
  onSkipExtras,
}: {
  extras: TicketSelectorTier[]
  quantities: Record<string, number>
  isPending: boolean
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
  onContinueWithExtras: () => void
  onSkipExtras: () => void
}) {
  return (
    <section className="space-y-5" aria-labelledby="checkout-upsell-title">
      <div>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          <Sparkles className="size-3.5" aria-hidden="true" />
          Opcional
        </p>
        <h3 id="checkout-upsell-title" className="mt-1 text-lg font-semibold">
          Mejorá tu experiencia
        </h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Estacionamiento, consumiciones u otros extras. Podés seguir sin
          sumar nada.
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

      <div className="space-y-2">
        <Button
          type="button"
          disabled={isPending}
          onClick={onContinueWithExtras}
          className="w-full rounded-2xl py-6 text-lg font-bold"
        >
          Sumar al pedido y continuar
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={onSkipExtras}
          className="w-full py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Continuar sin extras
        </Button>
      </div>
    </section>
  )
}
