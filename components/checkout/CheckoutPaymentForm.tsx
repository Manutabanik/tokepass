"use client"

import type { ValidatedPromo } from "@/app/actions/coupons"
import { CheckoutBuyerFields } from "@/components/public/checkout-buyer-fields"
import {
  PaymentMethodSelector,
  type CheckoutPaymentProvider,
} from "@/components/public/payment-method-selector"
import { PromoCodeInput } from "@/components/public/promo-code-input"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import type { CheckoutBuyerInfo } from "@/lib/checkout-buyer"
import { useCheckoutStore } from "@/lib/stores/checkout-store"
import type { FieldErrors } from "react-hook-form"

export function CheckoutPaymentForm({
  step,
  eventId,
  cartSubtotal,
  ticketsSubtotal,
  discountAmount,
  finalTotal,
  totalTickets,
  appliedPromo,
  selectedProvider,
  sandboxEligible,
  controlsLocked,
  canProceedFromCart,
  fieldShake,
  buyerErrors,
  onBuyerChange,
  onAppliedPromo,
  onClearedPromo,
  onSelectProvider,
  onSandboxReserve,
}: {
  step: "details" | "payment"
  eventId: string
  cartSubtotal: number
  ticketsSubtotal: number
  discountAmount: number
  finalTotal: number
  totalTickets: number
  appliedPromo: ValidatedPromo | null
  selectedProvider: CheckoutPaymentProvider
  sandboxEligible: boolean
  controlsLocked: boolean
  canProceedFromCart: boolean
  fieldShake: number
  buyerErrors: FieldErrors<CheckoutBuyerInfo>
  onBuyerChange: (next: CheckoutBuyerInfo) => void
  onAppliedPromo: (promo: ValidatedPromo) => void
  onClearedPromo: () => void
  onSelectProvider: (provider: CheckoutPaymentProvider) => void
  onSandboxReserve: () => void
}) {
  const buyer = useCheckoutStore((state) => state.buyer)

  if (step === "details") {
    return (
      <div className="mx-auto flex w-full min-w-0 max-w-lg flex-col gap-5 md:gap-6">
        <p className="break-words text-sm whitespace-normal text-foreground/80">
          Los usamos para emitir tu entrada y encontrarte en puerta.
        </p>
        <CheckoutBuyerFields
          value={buyer}
          errors={buyerErrors}
          shakeSignal={fieldShake}
          onChange={onBuyerChange}
          disabled={controlsLocked}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-lg flex-col gap-5 md:gap-6">
      <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-muted/20 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Resumen de compra
        </p>
        <div className="flex min-w-0 items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="min-w-0 break-words">Entradas · {totalTickets}</span>
          <span className="shrink-0 tabular-nums text-foreground">
            {formatCurrency(ticketsSubtotal)}
          </span>
        </div>
        {appliedPromo && discountAmount > 0 ? (
          <div className="flex items-center justify-between text-sm text-emerald-500">
            <span>Descuento ({appliedPromo.code})</span>
            <span className="tabular-nums">−{formatCurrency(discountAmount)}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="font-medium text-foreground">Total</span>
          <span className="text-xl font-black tabular-nums text-foreground">
            {formatCurrency(finalTotal)}
          </span>
        </div>
      </div>

      <PromoCodeInput
        eventId={eventId}
        cartSubtotal={cartSubtotal}
        applied={appliedPromo}
        onApplied={onAppliedPromo}
        onCleared={onClearedPromo}
        disabled={controlsLocked || !canProceedFromCart}
      />

      <PaymentMethodSelector
        selectedProvider={selectedProvider}
        onSelectProvider={onSelectProvider}
        disabled={controlsLocked}
      />

      {sandboxEligible ? (
        <Button
          type="button"
          variant="outline"
          disabled={controlsLocked}
          onClick={onSandboxReserve}
          className="w-full border-dashed text-muted-foreground hover:text-foreground"
        >
          Compra de prueba
        </Button>
      ) : null}
    </div>
  )
}
