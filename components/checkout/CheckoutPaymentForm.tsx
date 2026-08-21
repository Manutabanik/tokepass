"use client"

import { ChevronDown, FlaskConical, LoaderCircle } from "lucide-react"
import { useMemo, useState, type FormEvent } from "react"
import type { FieldErrors } from "react-hook-form"

import type { ValidatedPromo } from "@/app/actions/coupons"
import type { CheckoutPromoterPreview } from "@/app/actions/promoters"
import { CheckoutBuyerFields } from "@/components/public/checkout-buyer-fields"
import { CheckoutPromoterCodeInput } from "@/components/public/checkout-promoter-code-input"
import {
  PaymentMethodSelector,
  type CheckoutPaymentProvider,
} from "@/components/public/payment-method-selector"
import { PromoCodeInput } from "@/components/public/promo-code-input"
import { CheckoutLegalClickwrap } from "@/components/checkout/checkout-legal-clickwrap"
import { TokepassGuaranteeBadge } from "@/components/shared/tokepass-guarantee-badge"
import { Button } from "@/components/ui/button"
import type { CheckoutBuyerInfo } from "@/lib/checkout-buyer"
import { formatTicketPrice } from "@/lib/format"
import { cartLineAmount, cartLineDisplayName } from "@/lib/checkout/cart-lines"
import {
  useCheckoutStore,
  type StorefrontCartLine,
} from "@/lib/stores/checkout-store"
import { cn, tapFeedbackClass } from "@/lib/utils"

const PREVIEW_CART_LINES = 2

export function CheckoutPaymentForm({
  step,
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
          Los usamos para emitir tu entrada y encontrarte en puerta.
        </p>
        <CheckoutBuyerFields
          value={buyer}
          errors={buyerErrors}
          shakeSignal={fieldShake}
          onChange={onBuyerChange}
          disabled={controlsLocked}
        />
      </form>
    )
  }

  return (
    <div
      aria-busy={controlsLocked}
      className="mx-auto flex w-full min-w-0 max-w-lg flex-col gap-5 md:gap-6"
    >
      <PaymentOrderSummary
        lines={cartLines}
        totalTickets={totalTickets}
        ticketsSubtotal={ticketsSubtotal}
        discountAmount={discountAmount}
        finalTotal={finalTotal}
        appliedPromo={appliedPromo}
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

      {isDraftPreview ? (
        <Button
          type="button"
          disabled={
            !acceptedTerms ||
            confirmPending ||
            confirmLocked ||
            controlsLocked ||
            !canProceedFromCart
          }
          aria-busy={confirmPending}
          onClick={onSandboxReserve}
          className={cn(
            tapFeedbackClass,
            "mt-6 h-auto w-full rounded-xl bg-amber-500 py-4 text-center text-lg font-bold text-amber-950 shadow-lg shadow-amber-500/25 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {confirmPending ? (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Simulando pago
            </>
          ) : (
            <>
              <FlaskConical className="size-5" aria-hidden="true" />
              Simular Pago (Modo Prueba)
            </>
          )}
        </Button>
      ) : (
        <Button
          type="button"
          disabled={
            !acceptedTerms ||
            confirmPending ||
            confirmLocked ||
            controlsLocked ||
            !canProceedFromCart
          }
          aria-busy={confirmPending}
          onClick={onConfirmPay}
          size="storefront"
          className={cn(
            tapFeedbackClass,
            "mt-6 h-14 w-full rounded-xl bg-emerald-500 py-4 text-center text-lg font-black text-black shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:bg-emerald-400 disabled:scale-100 disabled:cursor-not-allowed disabled:opacity-70",
          )}
        >
          {confirmPending ? (
            <span className="flex items-center gap-2">
              <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              {finalTotal === 0 ? "Confirmando reserva" : "Procesando pago..."}
            </span>
          ) : finalTotal === 0 ? (
            "Confirmar reserva"
          ) : (
            `Confirmar y Pagar ${formatTicketPrice(finalTotal)}`
          )}
        </Button>
      )}
    </div>
  )
}

function lineAccessLabel(item: StorefrontCartLine): string {
  const detail = item.detail?.trim()
  if (detail) return detail
  const quantity = Math.max(1, Math.floor(item.quantity) || 1)
  return quantity === 1 ? "1 acceso" : `${quantity} accesos`
}

function PaymentOrderSummary({
  lines,
  totalTickets,
  ticketsSubtotal,
  discountAmount,
  finalTotal,
  appliedPromo,
}: {
  lines: StorefrontCartLine[]
  totalTickets: number
  ticketsSubtotal: number
  discountAmount: number
  finalTotal: number
  appliedPromo: ValidatedPromo | null
}) {
  const [isCartExpanded, setIsCartExpanded] = useState(false)
  const hasOverflow = lines.length > PREVIEW_CART_LINES
  const previewLines = useMemo(
    () => lines.slice(0, PREVIEW_CART_LINES),
    [lines],
  )
  const extraLines = useMemo(
    () => lines.slice(PREVIEW_CART_LINES),
    [lines],
  )

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm lg:hidden">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        Resumen de compra
      </p>

      {lines.length > 0 ? (
        <ul className="flex max-h-[40vh] min-w-0 flex-col gap-2 overflow-y-auto overscroll-contain">
          {previewLines.map((item) => (
            <PaymentTicketRow key={item.id} item={item} />
          ))}
          {hasOverflow ? (
            <li
              className={cn(
                "grid transition-all duration-200",
                isCartExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="min-h-0 overflow-hidden">
                <ul className="flex flex-col gap-2">
                  {extraLines.map((item) => (
                    <PaymentTicketRow key={item.id} item={item} />
                  ))}
                </ul>
              </div>
            </li>
          ) : null}
        </ul>
      ) : (
        <div className="flex min-w-0 items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="min-w-0 break-words">
            Entradas · {totalTickets}
          </span>
          <span className="shrink-0 tabular-nums text-card-foreground">
            {formatTicketPrice(ticketsSubtotal)}
          </span>
        </div>
      )}

      {hasOverflow ? (
        <button
          type="button"
          aria-expanded={isCartExpanded}
          onClick={() => setIsCartExpanded((open) => !open)}
          className="inline-flex min-h-11 items-center justify-center gap-1 self-start text-sm font-semibold text-primary transition-all duration-200 hover:text-primary/80"
        >
          {isCartExpanded
            ? "Ocultar entradas"
            : `Ver las ${lines.length} entradas`}
          <ChevronDown
            className={cn(
              "size-4 transition-transform duration-200",
              isCartExpanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      ) : null}

      {appliedPromo && discountAmount > 0 ? (
        <div className="flex items-center justify-between text-sm text-emerald-600 dark:text-emerald-400">
          <span>Descuento ({appliedPromo.code})</span>
          <span className="tabular-nums">
            −{formatTicketPrice(discountAmount)}
          </span>
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-3 border-t border-border pt-3">
        <div className="min-w-0">
          <p className="font-semibold text-card-foreground">
            {finalTotal === 0 ? "Total" : "Total a pagar"}
          </p>
          <p className="text-xs text-muted-foreground">
            {finalTotal === 0
              ? "Entrada sin costo."
              : "Precio final All-In. Incluye servicio."}
          </p>
        </div>
        <span className="shrink-0 text-xl font-black tabular-nums text-card-foreground">
          {formatTicketPrice(finalTotal)}
        </span>
      </div>
      <TokepassGuaranteeBadge variant="full" />
    </div>
  )
}

function PaymentTicketRow({ item }: { item: StorefrontCartLine }) {
  const quantity = Math.max(1, Math.floor(item.quantity) || 1)
  const displayName = cartLineDisplayName(item)
  const name = quantity > 1 ? `${quantity}x ${displayName}` : displayName

  return (
    <li className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="line-clamp-2 break-words text-sm font-semibold text-card-foreground">
          {name}
        </p>
        <p className="mt-0.5 line-clamp-2 break-words text-xs text-muted-foreground">
          {lineAccessLabel(item)}
        </p>
      </div>
      <span className="shrink-0 text-sm font-bold tabular-nums text-card-foreground">
        {formatTicketPrice(cartLineAmount(item))}
      </span>
    </li>
  )
}
