"use client"

import { ChevronRight } from "lucide-react"
import { useState, type FormEvent } from "react"
import type { FieldErrors } from "react-hook-form"

import type { ValidatedPromo } from "@/app/actions/coupons"
import type { CheckoutPromoterPreview } from "@/app/actions/promoters"
import { CheckoutCartBottomSheet } from "@/components/checkout/checkout-cart-bottom-sheet"
import { CheckoutBuyerFields } from "@/components/public/checkout-buyer-fields"
import { CheckoutPromoterCodeInput } from "@/components/public/checkout-promoter-code-input"
import {
  PaymentMethodSelector,
  type CheckoutPaymentProvider,
} from "@/components/public/payment-method-selector"
import { PromoCodeInput } from "@/components/public/promo-code-input"
import { CheckoutLegalClickwrap } from "@/components/checkout/checkout-legal-clickwrap"
import { TokepassGuaranteeBadge } from "@/components/shared/tokepass-guarantee-badge"
import type { CheckoutBuyerInfo } from "@/lib/checkout-buyer"
import {
  CartTotalAmount,
  CartTotalLabel,
} from "@/components/public/cart-total-transparency"
import { formatCartTotal } from "@/lib/format"
import { useCheckoutStore } from "@/lib/stores/checkout-store"

export function CheckoutPaymentForm({
  step,
  isOnline = false,
  eventId,
  cartSubtotal,
  ticketsSubtotal,
  discountAmount,
  finalTotal,
  totalTickets,
  appliedPromo,
  appliedPromoter,
  attributionLocked,
  initialPromoterCode,
  selectedProvider,
  acceptsMercadoPago = true,
  isDraftPreview,
  controlsLocked,
  canProceedFromCart,
  fieldShake,
  buyerErrors,
  onBuyerChange,
  onAppliedPromo,
  onClearedPromo,
  onAppliedPromoter,
  onClearedPromoter,
  onSelectProvider,
  onSandboxReserve,
  onDetailsSubmit,
  onConfirmPay,
  confirmPending = false,
  confirmLocked = false,
  acceptedTerms = false,
  onAcceptedTermsChange,
}: {
  step: "details" | "payment"
  isOnline?: boolean
  eventId: string
  cartSubtotal: number
  ticketsSubtotal: number
  discountAmount: number
  finalTotal: number
  totalTickets: number
  appliedPromo: ValidatedPromo | null
  appliedPromoter: CheckoutPromoterPreview | null
  attributionLocked?: boolean
  initialPromoterCode?: string | null
  selectedProvider: CheckoutPaymentProvider
  acceptsMercadoPago?: boolean
  sandboxEligible: boolean
  isDraftPreview?: boolean
  controlsLocked: boolean
  canProceedFromCart: boolean
  fieldShake: number
  buyerErrors: FieldErrors<CheckoutBuyerInfo>
  onBuyerChange: (next: CheckoutBuyerInfo) => void
  onAppliedPromo: (promo: ValidatedPromo) => void
  onClearedPromo: () => void
  onAppliedPromoter: (promoter: CheckoutPromoterPreview) => void
  onClearedPromoter: () => void
  onSelectProvider: (provider: CheckoutPaymentProvider) => void
  onSandboxReserve: () => void
  onDetailsSubmit?: () => void
  onConfirmPay?: () => void
  confirmPending?: boolean
  confirmLocked?: boolean
  acceptedTerms?: boolean
  onAcceptedTermsChange?: (accepted: boolean) => void
}) {
  const buyer = useCheckoutStore((state) => state.buyer)
  const cartLines = useCheckoutStore((state) => state.lines)

  if (step === "details") {
    function handleSubmit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault()
      onDetailsSubmit?.()
    }

    return (
      <form
        id="checkout-buyer-form"
        noValidate
        onSubmit={handleSubmit}
        className="mx-auto flex w-full min-w-0 max-w-lg flex-col gap-5 pb-4 md:gap-6"
      >
        <p className="break-words text-sm whitespace-normal text-foreground/80">
          {isOnline
            ? "Van a tu nombre. El link llega a este mail."
            : "Van en la entrada. En puerta pedimos DNI que coincida."}
        </p>
        <CheckoutBuyerFields
          value={buyer}
          errors={buyerErrors}
          shakeSignal={fieldShake}
          onChange={onBuyerChange}
          disabled={controlsLocked}
          requirePhone={finalTotal > 0}
        />
      </form>
    )
  }

  function handlePaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      !acceptedTerms ||
      confirmPending ||
      confirmLocked ||
      controlsLocked ||
      !canProceedFromCart
    ) {
      return
    }
    if (isDraftPreview) {
      onSandboxReserve()
      return
    }
    onConfirmPay?.()
  }

  return (
    <form
      id="checkout-payment-form"
      noValidate
      aria-busy={controlsLocked}
      onSubmit={handlePaymentSubmit}
      className="mx-auto flex w-full min-w-0 max-w-lg flex-col gap-5 md:gap-6"
    >
      <PaymentOrderSummary
        lines={cartLines}
        totalTickets={totalTickets}
        ticketsSubtotal={ticketsSubtotal}
        discountAmount={discountAmount}
        finalTotal={finalTotal}
        appliedPromo={appliedPromo}
        isOnline={isOnline}
      />

      <PromoCodeInput
        eventId={eventId}
        cartSubtotal={cartSubtotal}
        applied={appliedPromo}
        onApplied={onAppliedPromo}
        onCleared={onClearedPromo}
        disabled={controlsLocked || !canProceedFromCart}
      />

      <CheckoutPromoterCodeInput
        eventId={eventId}
        initialCode={initialPromoterCode}
        applied={appliedPromoter}
        locked={attributionLocked}
        onApplied={onAppliedPromoter}
        onCleared={onClearedPromoter}
        disabled={controlsLocked || !canProceedFromCart}
      />

      {isDraftPreview ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Este evento está en modo de prueba. El pago es simulado y las
          entradas no valen en puerta.
        </p>
      ) : finalTotal === 0 ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Esta reserva no tiene costo. Al confirmar, emitimos tus entradas
          sin pasar por la pasarela de pago.
        </p>
      ) : (
        <>
          <PaymentMethodSelector
            selectedProvider={selectedProvider}
            onSelectProvider={onSelectProvider}
            disabled={controlsLocked}
            acceptsMercadoPago={acceptsMercadoPago}
          />

          <p className="text-sm leading-relaxed text-muted-foreground">
            Al confirmar, te redirigimos a la pasarela para pagar. El cobro se
            inicia solo cuando la reserva queda confirmada.
          </p>
        </>
      )}

      <CheckoutLegalClickwrap
        className="lg:hidden"
        checked={acceptedTerms}
        onCheckedChange={onAcceptedTermsChange ?? (() => {})}
        disabled={controlsLocked}
      />
    </form>
  )
}

function PaymentOrderSummary({
  lines,
  totalTickets,
  ticketsSubtotal,
  discountAmount,
  finalTotal,
  appliedPromo,
  isOnline = false,
}: {
  lines: { id: string }[]
  totalTickets: number
  ticketsSubtotal: number
  discountAmount: number
  finalTotal: number
  appliedPromo: ValidatedPromo | null
  isOnline?: boolean
}) {
  const [isCartOpen, setIsCartOpen] = useState(false)
  const canOpenDesglose = lines.length > 0

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm lg:hidden">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        Resumen de compra
      </p>

      <button
        type="button"
        disabled={!canOpenDesglose}
        aria-expanded={isCartOpen}
        onClick={() => setIsCartOpen(true)}
        className="flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-left disabled:opacity-70"
      >
        <span className="min-w-0 text-sm font-semibold text-card-foreground">
          {canOpenDesglose
            ? `${totalTickets} ${totalTickets === 1 ? "entrada" : "entradas"}`
            : `Entradas · ${totalTickets}`}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-emerald-400">
          {canOpenDesglose ? "Ver desglose" : formatCartTotal(ticketsSubtotal)}
          {canOpenDesglose ? (
            <ChevronRight className="size-4" aria-hidden="true" />
          ) : null}
        </span>
      </button>

      {appliedPromo && discountAmount > 0 ? (
        <div className="flex items-center justify-between text-sm text-emerald-600 dark:text-emerald-400">
          <span>Descuento ({appliedPromo.code})</span>
          <span className="tabular-nums">
            −{formatCartTotal(discountAmount)}
          </span>
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-3 border-t border-border pt-3">
        <div className="min-w-0">
          <p className="font-semibold text-card-foreground">
            <CartTotalLabel>
              {finalTotal === 0 ? "Total" : "Total a pagar"}
            </CartTotalLabel>
          </p>
          {finalTotal === 0 ? (
            <p className="text-xs text-muted-foreground">Entrada sin costo.</p>
          ) : null}
        </div>
        <CartTotalAmount
          amount={finalTotal}
          className="shrink-0 text-xl font-black text-card-foreground"
        />
      </div>
      <TokepassGuaranteeBadge variant="full" isOnline={isOnline} />

      <CheckoutCartBottomSheet
        open={isCartOpen}
        onOpenChange={setIsCartOpen}
        totalAmount={finalTotal}
      />
    </div>
  )
}

