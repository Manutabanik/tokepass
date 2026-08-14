"use client"

import {
  LoaderCircle,
  Ticket,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  startCheckoutWithPayment,
  startSandboxCheckout,
  reserveSeatAtomic,
} from "@/app/actions/checkout"
import type { ValidatedPromo } from "@/app/actions/coupons"
import { validatePromoCode } from "@/app/actions/coupons"
import { UniversalSeatSelectionFlow } from "@/components/b2c/universal-seat-selection"
import { TicketTierSelector } from "@/components/public/ticket-tier-selector"
import { CheckoutBuyerFields } from "@/components/public/checkout-buyer-fields"
import {
  PaymentMethodSelector,
  type CheckoutPaymentProvider,
} from "@/components/public/payment-method-selector"
import { PromoCodeInput } from "@/components/public/promo-code-input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  validateCheckoutBuyer,
  type CheckoutBuyerInfo,
} from "@/lib/checkout-buyer"
import { redirectToCheckoutPaymentOrToast } from "@/lib/checkout-redirect"
import { MAX_TICKETS_PER_PURCHASE } from "@/lib/checkout-limits"
import { formatCurrency } from "@/lib/format"
import {
  trackAddToCart,
  trackInitiateCheckout,
  type EventPixelConfig,
} from "@/lib/analytics/pixels"
import { getStoredReferralCode, persistReferralCode } from "@/lib/referral"
import type { UniversalSeatSelection } from "@/lib/seating/universal-seat-types"
import {
  buildUniversalSeatPayloadForCheckout,
  resolveTierIdForUniversalSector,
} from "@/lib/seating/venue-adapter"
import { cn } from "@/lib/utils"
import type { ScheduleDay } from "@/types/events"
import { getEventSeatingUnitsForSector } from "@/app/actions/public-events"
import type { EventSeatingUnit, SeatingSectorSummary, VenueSeatingLayout } from "@/types/venues"

import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"

export type { TicketSelectorTier }

type TicketSelectorProps = {
  eventId: string
  eventTitle?: string
  currentUserId?: string | null
  initialBuyer?: Partial<CheckoutBuyerInfo> | null
  tiers: TicketSelectorTier[]
  scheduleDays?: ScheduleDay[]
  /** @deprecated All-In pricing absorbs the fee; ignored. */
  serviceChargeRate?: number
  /** Código RRPP desde ?ref= — nunca se envía promoter_id al servidor */
  referralCode?: string | null
  seatingUnits?: EventSeatingUnit[]
  seatingSectorSummaries?: SeatingSectorSummary[]
  seatingBackgroundUrl?: string | null
  seatingLayout?: VenueSeatingLayout
  venueId?: string | null
  venueName?: string | null
  venueCapacity?: number | null
  pixels?: EventPixelConfig
  sandboxEligible?: boolean
  zoneTierPricing?: Array<{
    sectorKey: string
    ticketTierId: string
    price: number
    tableNumberStart?: number | null
    tableNumberEnd?: number | null
  }>
  /** Sold out: deshabilita cantidad y pago. */
  purchaseLocked?: boolean
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function toastCheckoutError(error: string, fallbackTitle: string) {
  if (error === "out_of_stock") {
    toast.error("Stock insuficiente de entradas")
    return
  }
  if (
    error === "El evento ya ha finalizado" ||
    error === "El evento o sector se encuentra agotado"
  ) {
    toast.error(error)
    return
  }
  toast.error(fallbackTitle, { description: error })
}

export function TicketSelector({
  eventId,
  eventTitle = "Selección de entradas",
  currentUserId = null,
  initialBuyer = null,
  tiers,
  scheduleDays = [],
  referralCode = null,
  seatingUnits = [],
  seatingSectorSummaries = [],
  seatingBackgroundUrl = null,
  seatingLayout = [],
  venueId = null,
  venueName = null,
  venueCapacity = null,
  sandboxEligible = false,
  zoneTierPricing = [],
  purchaseLocked = false,
}: TicketSelectorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const controlsLocked = isPending || purchaseLocked
  const [showSeatFlow, setShowSeatFlow] = useState(false)
  const [loadedUnitsBySector, setLoadedUnitsBySector] = useState<
    Record<string, EventSeatingUnit[]>
  >({})
  const [buyer, setBuyer] = useState<CheckoutBuyerInfo>({
    buyerName: initialBuyer?.buyerName ?? "",
    buyerDni: initialBuyer?.buyerDni ?? "",
    buyerEmail: initialBuyer?.buyerEmail ?? "",
    buyerPhone: initialBuyer?.buyerPhone ?? "",
  })
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(tiers.map((tier) => [tier.id, 0])),
  )
  const [appliedPromo, setAppliedPromo] = useState<ValidatedPromo | null>(null)
  const [selectedProvider, setSelectedProvider] =
    useState<CheckoutPaymentProvider>("mercadopago")
  const [storedRef] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return getStoredReferralCode()
  })
  const [ticketsInView, setTicketsInView] = useState(false)

  useEffect(() => {
    const target = document.getElementById("tickets")
    if (!target) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setTicketsInView(Boolean(entry?.isIntersecting))
      },
      { root: null, threshold: 0.12, rootMargin: "0px 0px -20% 0px" },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  function enterPaymentHold(result: {
    initPoint?: string
    paymentUrl?: string
  }) {
    redirectToCheckoutPaymentOrToast(result.paymentUrl ?? result.initPoint)
  }

  const resolvedRef = referralCode?.trim() || storedRef

  const hasSeatingFlow =
    seatingSectorSummaries.length > 0 ||
    seatingUnits.length > 0 ||
    seatingLayout.length > 0 ||
    tiers.some((tier) => tier.layoutType !== "general")

  const mergedSeatingUnits = useMemo(() => {
    const byId = new Map<string, EventSeatingUnit>()
    for (const unit of seatingUnits) byId.set(unit.id, unit)
    for (const units of Object.values(loadedUnitsBySector)) {
      for (const unit of units) byId.set(unit.id, unit)
    }
    return [...byId.values()]
  }, [loadedUnitsBySector, seatingUnits])

  const universalPayload = useMemo(() => {
    if (!hasSeatingFlow) return null
    return buildUniversalSeatPayloadForCheckout({
      venueId: venueId ?? `event-${eventId}`,
      venueName: venueName ?? eventTitle,
      seatingLayout,
      seatingBackgroundUrl,
      capacity: venueCapacity ?? undefined,
      tiers: tiers.map((tier) => ({
        id: tier.id,
        name: tier.name,
        price: tier.price,
        available: tier.available,
        seatingSectorId: tier.seatingSectorId,
        layoutType: tier.layoutType,
      })),
      seatingUnits: [],
      seatingSectorSummaries,
      zoneTierPricing,
    })
  }, [
    eventId,
    eventTitle,
    hasSeatingFlow,
    seatingBackgroundUrl,
    seatingLayout,
    seatingSectorSummaries,
    tiers,
    venueCapacity,
    venueId,
    venueName,
    zoneTierPricing,
  ])

  const seatIdByLayoutItem = useMemo(() => {
    const map = new Map<string, EventSeatingUnit>()
    for (const unit of mergedSeatingUnits) {
      map.set(unit.layoutItemId, unit)
    }
    return map
  }, [mergedSeatingUnits])

  useEffect(() => {
    const clean = referralCode?.trim()
    if (!clean) return
    persistReferralCode(clean)
  }, [referralCode])

  const selection = useMemo(
    () =>
      tiers
        .map((tier) => {
          const quantity = quantities[tier.id] ?? 0
          return {
            ...tier,
            quantity,
            subtotal: quantity * tier.price,
            maxSelectable: Math.min(
              MAX_TICKETS_PER_PURCHASE,
              Math.max(0, tier.available),
            ),
          }
        })
        .filter((tier) => tier.quantity > 0),
    [quantities, tiers],
  )

  const totalTickets = selection.reduce((sum, tier) => sum + tier.quantity, 0)
  const ticketsSubtotal = roundMoney(
    selection.reduce((sum, tier) => sum + tier.subtotal, 0),
  )
  // All-In: tier.price already includes Tokepass fee.
  const cartSubtotal = ticketsSubtotal
  const discountAmount = appliedPromo
    ? Math.min(appliedPromo.discountAmount, cartSubtotal)
    : 0
  const totalAmount = roundMoney(Math.max(0, cartSubtotal - discountAmount))

  useEffect(() => {
    if (!appliedPromo) return
    const code = appliedPromo.code
    let cancelled = false
    void validatePromoCode(code, eventId, cartSubtotal).then((result) => {
      if (cancelled) return
      if (!result.success) {
        setAppliedPromo(null)
        toast.error(result.error)
        return
      }
      setAppliedPromo((previous) => {
        if (
          previous &&
          previous.promoCodeId === result.data.promoCodeId &&
          previous.discountAmount === result.data.discountAmount
        ) {
          return previous
        }
        return result.data
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only recheck when cart/code changes
  }, [appliedPromo?.code, cartSubtotal, eventId])

  function updateQuantity(tierId: string, next: number, max: number) {
    if (purchaseLocked) return
    setQuantities((current) => ({
      ...current,
      [tierId]: Math.min(Math.max(0, next), max),
    }))
  }

  function fireCartPixels(input: {
    contentIds: string[]
    value: number
    numItems: number
  }) {
    const payload = {
      contentName: eventTitle,
      contentIds: input.contentIds,
      value: input.value,
      currency: "ARS" as const,
      numItems: input.numItems,
    }
    trackAddToCart(payload)
    trackInitiateCheckout(payload)
  }

  function handleReserve() {
    if (selection.length === 0 || controlsLocked) return

    const buyerCheck = validateCheckoutBuyer(buyer)
    if (!buyerCheck.ok) {
      toast.error(buyerCheck.error)
      return
    }

    fireCartPixels({
      contentIds: selection.map((tier) => tier.id),
      value: totalAmount,
      numItems: totalTickets,
    })

    startTransition(async () => {
      const result = await startCheckoutWithPayment(
        eventId,
        selection.map((tier) => ({
          tierId: tier.id,
          quantity: tier.quantity,
        })),
        resolvedRef,
        [],
        buyerCheck.buyer,
        appliedPromo?.promoCodeId ?? null,
        { paymentProvider: selectedProvider },
      )

      if (!result.success) {
        if (result.error === "auth_required") {
          router.push(`/login?next=/events/${eventId}`)
          return
        }

        toastCheckoutError(result.error, "No se pudo iniciar el pago")
        router.refresh()
        return
      }

      enterPaymentHold(result)
    })
  }

  function handleSandboxReserve() {
    if (!sandboxEligible || selection.length === 0 || controlsLocked) return

    const buyerCheck = validateCheckoutBuyer(buyer)
    if (!buyerCheck.ok) {
      toast.error(buyerCheck.error)
      return
    }

    startTransition(async () => {
      const result = await startSandboxCheckout(
        eventId,
        selection.map((tier) => ({
          tierId: tier.id,
          quantity: tier.quantity,
        })),
        resolvedRef,
        [],
        buyerCheck.buyer,
        appliedPromo?.promoCodeId ?? null,
      )

      if (!result.success) {
        if (result.error === "auth_required") {
          router.push(`/login?next=/events/${eventId}`)
          return
        }
        toastCheckoutError(result.error, "No se pudo completar la compra de prueba")
        router.refresh()
        return
      }

      toast.success("Compra de prueba OK · Modo Sandbox")
      redirectToCheckoutPaymentOrToast(result.paymentUrl ?? result.initPoint)
    })
  }

  function openSeatFlow() {
    if (purchaseLocked) return
    const buyerCheck = validateCheckoutBuyer(buyer)
    if (!buyerCheck.ok) {
      toast.error(buyerCheck.error)
      return
    }
    if (!universalPayload || universalPayload.sectors.length === 0) {
      toast.error("No hay ubicaciones configuradas para este evento.")
      return
    }
    setShowSeatFlow(true)
  }

  function handleUniversalContinue(selectionPayload: UniversalSeatSelection) {
    if (purchaseLocked) return
    const buyerCheck = validateCheckoutBuyer(buyer)
    if (!buyerCheck.ok) {
      toast.error(buyerCheck.error)
      return
    }

    if (selectionPayload.kind === "general") {
      const tierId = resolveTierIdForUniversalSector(
        selectionPayload.sectorId,
        selectionPayload.sectorName,
        tiers.map((tier) => ({
          id: tier.id,
          name: tier.name,
          price: tier.price,
          available: tier.available,
          seatingSectorId: tier.seatingSectorId,
          layoutType: tier.layoutType,
        })),
      )
      if (!tierId) {
        toast.error("No encontramos la categoría de esa zona.")
        return
      }

      fireCartPixels({
        contentIds: [tierId],
        value: selectionPayload.unitPrice * selectionPayload.quantity,
        numItems: selectionPayload.quantity,
      })

      startTransition(async () => {
        const result = await startCheckoutWithPayment(
          eventId,
          [{ tierId, quantity: selectionPayload.quantity }],
          resolvedRef,
          [],
          buyerCheck.buyer,
          appliedPromo?.promoCodeId ?? null,
          { paymentProvider: selectedProvider },
        )

        if (!result.success) {
          if (result.error === "auth_required") {
            router.push(`/login?next=/events/${eventId}`)
            return
          }
          toastCheckoutError(result.error, "No se pudo iniciar el pago")
          router.refresh()
          return
        }

        enterPaymentHold(result)
      })
      return
    }

    const seat = selectionPayload.seats[0]
    if (!seat) {
      toast.error("Elegí una ubicación para continuar.")
      return
    }
    if (selectionPayload.seats.length > 1) {
      toast.error("Comprá una ubicación numerada por operación.")
      return
    }

    const unit = seatIdByLayoutItem.get(seat.id)
    if (!unit) {
      toast.error("Esa ubicación ya no está disponible.", {
        description: "Actualizá la página e intentá de nuevo.",
      })
      router.refresh()
      return
    }
    if (unit.status !== "available") {
      toast.error(
        "Esta ubicación acaba de ser reservada por otra persona. Por favor elegí otra.",
      )
      router.refresh()
      return
    }

    if (!currentUserId) {
      router.push(`/login?next=/events/${eventId}`)
      return
    }

    fireCartPixels({
      contentIds: [unit.id],
      value: selectionPayload.unitPrice,
      numItems: 1,
    })

    startTransition(async () => {
      const result = await reserveSeatAtomic(
        eventId,
        unit.id,
        currentUserId,
        resolvedRef,
        buyerCheck.buyer,
        appliedPromo?.promoCodeId ?? null,
        selectedProvider,
      )

      if (!result.success) {
        if (result.error === "auth_required") {
          router.push(`/login?next=/events/${eventId}`)
          return
        }
        if (
          result.error.includes("reservada por otra persona")
        ) {
          toast.error(
            "Esta ubicación acaba de ser reservada por otra persona. Por favor elegí otra.",
          )
          router.refresh()
          return
        }
        toastCheckoutError(result.error, "No se pudo reservar la ubicación")
        router.refresh()
        return
      }

      enterPaymentHold(result)
    })
  }

  if (showSeatFlow && universalPayload) {
    return (
      <UniversalSeatSelectionFlow
        embedded
        pending={controlsLocked}
        eventTitle={eventTitle}
        mapImageUrl={
          universalPayload.mapImageUrl ?? seatingBackgroundUrl ?? null
        }
        sectors={universalPayload.sectors}
        onBack={() => setShowSeatFlow(false)}
        onContinue={handleUniversalContinue}
        onLoadSectorUnits={async (sectorId) => {
          const cached = loadedUnitsBySector[sectorId]
          if (cached) return cached
          const units = await getEventSeatingUnitsForSector(eventId, sectorId)
          setLoadedUnitsBySector((current) => ({
            ...current,
            [sectorId]: units,
          }))
          return units
        }}
      />
    )
  }

  if (tiers.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card/50 px-5 py-10 text-center text-card-foreground">
        <Ticket className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <p className="mt-3 text-sm text-muted-foreground">
          Este evento todavía no tiene tipos de entrada configurados.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-5 text-card-foreground shadow-2xl shadow-black/40 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400/90">
            Entradas
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">
            Elegí tu experiencia
          </h2>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border">
          Máx. {MAX_TICKETS_PER_PURCHASE} por compra
        </span>
      </div>

      <TicketTierSelector
        tiers={tiers}
        quantities={quantities}
        scheduleDays={scheduleDays}
        isPending={controlsLocked}
        hasSeatingFlow={hasSeatingFlow}
        onQuantityChange={updateQuantity}
        onOpenSeatFlow={openSeatFlow}
      />

      <Separator className="my-5 bg-border" />

      <CheckoutBuyerFields
        value={buyer}
        onChange={setBuyer}
        disabled={controlsLocked}
      />

      <Separator className="my-5 bg-border" />

      <PromoCodeInput
        eventId={eventId}
        cartSubtotal={cartSubtotal}
        applied={appliedPromo}
        onApplied={setAppliedPromo}
        onCleared={() => setAppliedPromo(null)}
        disabled={controlsLocked || cartSubtotal <= 0}
      />

      <Separator className="my-5 bg-border" />

      <PaymentMethodSelector
        selectedProvider={selectedProvider}
        onSelectProvider={setSelectedProvider}
        disabled={controlsLocked}
      />

      <Separator className="my-5 bg-border" />

      <div className="rounded-2xl border border-border bg-muted/30 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Resumen
        </p>
        <div className="mt-3 space-y-2 text-base">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>
              Entradas
              {totalTickets > 0
                ? ` · ${totalTickets}`
                : null}
            </span>
            <span className="tabular-nums text-foreground">
              {formatCurrency(ticketsSubtotal)}
            </span>
          </div>
          {appliedPromo && discountAmount > 0 ? (
            <div className="flex items-center justify-between text-emerald-400">
              <span>Descuento ({appliedPromo.code})</span>
              <span className="tabular-nums">
                −{formatCurrency(discountAmount)}
              </span>
            </div>
          ) : null}
          <div className="border-t border-border pt-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground">Total</span>
              <span className="text-2xl font-black tracking-tight text-foreground tabular-nums">
                {formatCurrency(totalAmount)}
              </span>
            </div>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Precio final. Sin cargos ocultos.
        </p>
      </div>

      {/* Desktop CTA */}
      <Button
        type="button"
        size="lg"
        disabled={totalTickets === 0 || controlsLocked}
        onClick={handleReserve}
        className="mt-5 hidden min-h-12 h-12 w-full rounded-full bg-emerald-500 text-base font-bold text-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 disabled:opacity-50 sm:inline-flex"
      >
        {isPending ? (
          <>
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            Preparando pago...
          </>
        ) : totalAmount > 0 ? (
          `Pagar ${formatCurrency(totalAmount)}`
        ) : (
          "Continuar al Pago"
        )}
      </Button>
      {sandboxEligible ? (
        <Button
          type="button"
          variant="outline"
          disabled={totalTickets === 0 || controlsLocked}
          onClick={handleSandboxReserve}
          className="mt-2 w-full border-dashed text-muted-foreground hover:text-foreground"
        >
          Compra de prueba (modo test)
        </Button>
      ) : null}
      <p className="mt-3 hidden text-center text-sm text-muted-foreground sm:block">
        {sandboxEligible
          ? "Modo Sandbox disponible para el organizador · sin pasarela."
          : "Vas a ser redirigido a la pasarela de pago."}
      </p>

      {/* Mobile sticky conversion bar */}
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-4 pt-3",
            "pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:hidden",
            "shadow-[0_-10px_30px_rgba(0,0,0,0.1)] transition-transform duration-200",
            ticketsInView && totalTickets > 0
              ? "translate-y-0"
              : "pointer-events-none translate-y-full",
          )}
          aria-hidden={!(ticketsInView && totalTickets > 0)}
        >
          <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
          <div className="min-w-0 shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Total
            </p>
            <p className="text-xl font-black tabular-nums text-foreground">
              {formatCurrency(totalAmount)}
            </p>
          </div>
          <Button
            type="button"
            disabled={totalTickets === 0 || controlsLocked}
            onClick={handleReserve}
            className="min-h-12 min-w-[48px] flex-1 rounded-2xl bg-emerald-500 text-base font-black text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {isPending ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : totalAmount > 0 ? (
              `Pagar ${formatCurrency(totalAmount)}`
            ) : (
              "Continuar al Pago"
            )}
          </Button>
        </div>
      </div>
      <div
        className="h-24 sm:hidden"
        aria-hidden="true"
        hidden={!(ticketsInView && totalTickets > 0)}
      />
    </div>
  )
}
