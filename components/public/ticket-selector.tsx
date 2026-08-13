"use client"

import {
  CalendarDays,
  Armchair,
  LoaderCircle,
  Minus,
  Plus,
  Ticket,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { startCheckoutWithPayment, reserveSeatAtomic } from "@/app/actions/checkout"
import type { ValidatedPromo } from "@/app/actions/coupons"
import { validatePromoCode } from "@/app/actions/coupons"
import { UniversalSeatSelectionFlow } from "@/components/b2c/universal-seat-selection"
import { CheckoutBuyerFields } from "@/components/public/checkout-buyer-fields"
import { CheckoutCountdown } from "@/components/public/checkout-countdown"
import { PromoCodeInput } from "@/components/public/promo-code-input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  validateCheckoutBuyer,
  type CheckoutBuyerInfo,
} from "@/lib/checkout-buyer"
import { MAX_TICKETS_PER_PURCHASE } from "@/lib/checkout-limits"
import { isFullPassDayId } from "@/lib/event-schedule"
import { formatCurrency, formatEventDay } from "@/lib/format"
import {
  emptyPixelConfig,
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
import type { EventSeatingUnit, VenueSeatingLayout } from "@/types/venues"

export type TicketSelectorTier = {
  id: string
  name: string
  price: number
  available: number
  bonusReward?: string | null
  dayId?: string | null
  layoutType: "general" | "table_combo" | "numbered_seat"
  seatingSectorId?: string | null
  capacityPerUnit: number
}

type DayFilter = "all" | "passes" | string

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
  seatingBackgroundUrl?: string | null
  seatingLayout?: VenueSeatingLayout
  venueId?: string | null
  venueName?: string | null
  venueCapacity?: number | null
  pixels?: EventPixelConfig
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
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
  seatingBackgroundUrl = null,
  seatingLayout = [],
  venueId = null,
  venueName = null,
  venueCapacity = null,
  pixels: _pixels = emptyPixelConfig(),
}: TicketSelectorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dayFilter, setDayFilter] = useState<DayFilter>("all")
  const [showSeatFlow, setShowSeatFlow] = useState(false)
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
  const [paymentHold, setPaymentHold] = useState<{
    initPoint: string
    expiresAt: string
  } | null>(null)
  const [storedRef] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return getStoredReferralCode()
  })

  function enterPaymentHold(result: {
    initPoint: string
    expiresAt: string
  }) {
    if (result.initPoint.startsWith("/")) {
      window.location.href = result.initPoint
      return
    }
    setShowSeatFlow(false)
    setPaymentHold({
      initPoint: result.initPoint,
      expiresAt: result.expiresAt,
    })
    toast.success("Entrada reservada. Completá el pago a tiempo.")
  }

  const resolvedRef = referralCode?.trim() || storedRef
  const isMultiDay = scheduleDays.length > 1

  const hasSeatingFlow =
    seatingUnits.length > 0 ||
    seatingLayout.length > 0 ||
    tiers.some((tier) => tier.layoutType !== "general")

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
      seatingUnits,
    })
  }, [
    eventId,
    eventTitle,
    hasSeatingFlow,
    seatingBackgroundUrl,
    seatingLayout,
    seatingUnits,
    tiers,
    venueCapacity,
    venueId,
    venueName,
  ])

  const seatIdByLayoutItem = useMemo(() => {
    const map = new Map<string, EventSeatingUnit>()
    for (const unit of seatingUnits) {
      map.set(unit.layoutItemId, unit)
    }
    return map
  }, [seatingUnits])

  useEffect(() => {
    const clean = referralCode?.trim()
    if (!clean) return
    persistReferralCode(clean)
  }, [referralCode])

  const visibleTiers = useMemo(() => {
    if (!isMultiDay || dayFilter === "all") return tiers
    if (dayFilter === "passes") {
      return tiers.filter((tier) => isFullPassDayId(tier.dayId))
    }
    return tiers.filter((tier) => tier.dayId === dayFilter)
  }, [dayFilter, isMultiDay, tiers])

  const dayTabs = useMemo(() => {
    if (!isMultiDay) return []
    return [
      { id: "all" as const, label: `Todas (${tiers.length})` },
      ...scheduleDays.map((day) => ({
        id: day.id,
        label: day.title || formatEventDay(day.start_time),
      })),
      {
        id: "passes" as const,
        label: `Abonos (${tiers.filter((tier) => isFullPassDayId(tier.dayId)).length})`,
      },
    ]
  }, [isMultiDay, scheduleDays, tiers])

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
    if (selection.length === 0 || isPending) return

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
      )

      if (!result.success) {
        if (result.error === "auth_required") {
          router.push(`/login?next=/events/${eventId}`)
          return
        }

        if (result.error === "out_of_stock") {
          toast.error("Stock insuficiente de entradas")
          router.refresh()
          return
        }

        toast.error("No se pudo iniciar el pago", {
          description: result.error,
        })
        router.refresh()
        return
      }

      enterPaymentHold(result)
    })
  }

  function openSeatFlow() {
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
        )

        if (!result.success) {
          if (result.error === "auth_required") {
            router.push(`/login?next=/events/${eventId}`)
            return
          }
          if (result.error === "out_of_stock") {
            toast.error("Stock insuficiente de entradas")
            router.refresh()
            return
          }
          toast.error("No se pudo iniciar el pago", {
            description: result.error,
          })
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
        toast.error("No se pudo reservar la ubicación", {
          description: result.error,
        })
        return
      }

      enterPaymentHold(result)
    })
  }

  if (paymentHold) {
    return (
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-2xl shadow-black/40 sm:p-6">
        <CheckoutCountdown
          expiresAt={paymentHold.expiresAt}
          redirectTo={`/events/${eventId}`}
          onExpired={() => setPaymentHold(null)}
        />
        <p className="mt-4 text-base text-zinc-400">
          Tu cupo está bloqueado. Pagá antes de que venza el reloj.
        </p>
        <div className="hidden sm:block">
          <a
            href={paymentHold.initPoint}
            className="mt-5 inline-flex min-h-12 h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#009EE3] px-5 text-base font-black text-white transition hover:bg-[#08A8EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            Pagar
          </a>
          <Button
            type="button"
            variant="ghost"
            className="mt-3 min-h-12 w-full text-zinc-400 hover:text-white"
            onClick={() => {
              setPaymentHold(null)
              router.refresh()
            }}
          >
            Cancelar y elegir de nuevo
          </Button>
        </div>
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-zinc-950/95 px-4 pt-3",
            "pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:hidden",
          )}
        >
          <a
            href={paymentHold.initPoint}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#009EE3] text-base font-black text-white"
          >
            Pagar
          </a>
        </div>
        <div className="h-24 sm:hidden" aria-hidden="true" />
      </div>
    )
  }

  if (showSeatFlow && universalPayload) {
    return (
      <UniversalSeatSelectionFlow
        embedded
        pending={isPending}
        eventTitle={eventTitle}
        mapImageUrl={
          universalPayload.mapImageUrl ?? seatingBackgroundUrl ?? null
        }
        sectors={universalPayload.sectors}
        onBack={() => setShowSeatFlow(false)}
        onContinue={handleUniversalContinue}
      />
    )
  }

  if (tiers.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-900/50 px-5 py-10 text-center">
        <Ticket className="mx-auto size-8 text-zinc-600" aria-hidden="true" />
        <p className="mt-3 text-sm text-zinc-500">
          Este evento todavía no tiene tipos de entrada configurados.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-2xl shadow-black/40 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400/90">
            Entradas
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-white">
            Elegí tu experiencia
          </h2>
        </div>
        <span className="rounded-full bg-zinc-950 px-2.5 py-1 text-xs font-medium text-zinc-500 ring-1 ring-zinc-800">
          Máx. {MAX_TICKETS_PER_PURCHASE} por compra
        </span>
      </div>

      {dayTabs.length > 0 ? (
        <div className="mt-5 inline-flex w-full flex-wrap gap-1 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-1.5 shadow-lg backdrop-blur-md">
          {dayTabs.map((tab) => {
            const active = dayFilter === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDayFilter(tab.id)}
                  className={cn(
                  "inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm transition-all",
                  active
                    ? "border border-zinc-700/60 bg-zinc-800 font-medium text-white shadow-sm"
                    : "text-zinc-400 hover:bg-zinc-800/40 hover:text-white",
                )}
              >
                <CalendarDays
                  className={cn(
                    "size-3.5 shrink-0",
                    active ? "text-emerald-400" : "text-zinc-600",
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{tab.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {visibleTiers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
            No hay entradas para este filtro.
          </div>
        ) : null}
        {visibleTiers.map((tier) => {
          const quantity = quantities[tier.id] ?? 0
          const maxSelectable = Math.min(
            MAX_TICKETS_PER_PURCHASE,
            Math.max(0, tier.available),
          )
          const soldOut = maxSelectable <= 0
          const lowStock =
            !soldOut && tier.available > 0 && tier.available <= 15
          const isVip = /\bvip\b/i.test(tier.name)
          const dayLabel = isFullPassDayId(tier.dayId)
            ? isMultiDay
              ? "Abono completo"
              : null
            : scheduleDays.find((day) => day.id === tier.dayId)?.title ?? null
          const perkLines = (tier.bonusReward ?? "")
            .split(/[·|•\n]/)
            .map((part) => part.trim())
            .filter(Boolean)

          return (
            <div
              key={tier.id}
              className={cn(
                "rounded-2xl border px-4 py-4 shadow-lg shadow-black/20 transition",
                quantity > 0
                  ? "border-emerald-500/45 bg-emerald-500/10"
                  : isVip
                    ? "border-amber-500/35 bg-gradient-to-br from-amber-500/10 via-zinc-950 to-zinc-950"
                    : "border-zinc-800 bg-zinc-950/70",
                soldOut && "border-zinc-800/80 bg-zinc-950/40 opacity-70 grayscale",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p
                      className={cn(
                        "font-semibold text-white",
                        soldOut && "text-zinc-400 line-through",
                      )}
                    >
                      {tier.name}
                    </p>
                    {soldOut ? (
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                        Agotado
                      </span>
                    ) : null}
                    {lowStock ? (
                      <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Últimas {tier.available}
                      </span>
                    ) : null}
                  </div>
                  {dayLabel ? (
                    <p className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                      {dayLabel}
                    </p>
                  ) : null}
                  {perkLines.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {perkLines.map((line) => (
                        <li
                          key={line}
                          className="flex items-start gap-2 text-xs text-zinc-400"
                        >
                          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-emerald-400" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-zinc-500">
                      Acceso digital con Living QR Tokepass
                    </p>
                  )}
                  <p className="mt-2 text-xs text-zinc-500">
                    {soldOut ? "Sin stock" : `${tier.available} disponibles`}
                  </p>
                </div>
                <p
                  className={cn(
                    "shrink-0 text-2xl font-black tracking-tight tabular-nums sm:text-xl",
                    soldOut
                      ? "text-zinc-500 line-through"
                      : "text-emerald-300",
                  )}
                >
                  {tier.price === 0 ? "Gratis" : formatCurrency(tier.price)}
                </p>
              </div>

              {tier.layoutType === "general" ? (
                <div className="mt-5 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-zinc-400">
                    Cantidad
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={soldOut || quantity === 0 || isPending}
                      onClick={() =>
                        updateQuantity(tier.id, quantity - 1, maxSelectable)
                      }
                      aria-label={`Quitar ${tier.name}`}
                      className={cn(
                        "inline-flex size-12 min-h-12 min-w-12 items-center justify-center rounded-2xl border border-zinc-600 bg-zinc-900 text-white",
                        "transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
                      )}
                    >
                      <Minus className="size-5" aria-hidden="true" />
                    </button>
                    <span className="min-w-10 text-center text-2xl font-black tabular-nums text-white">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      disabled={
                        soldOut || quantity >= maxSelectable || isPending
                      }
                      onClick={() =>
                        updateQuantity(tier.id, quantity + 1, maxSelectable)
                      }
                      aria-label={`Agregar ${tier.name}`}
                      className={cn(
                        "inline-flex size-12 min-h-12 min-w-12 items-center justify-center rounded-2xl border border-emerald-400/50 bg-emerald-500 text-zinc-950",
                        "transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
                      )}
                    >
                      <Plus className="size-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  disabled={soldOut || !hasSeatingFlow}
                  onClick={openSeatFlow}
                  className="mt-4 min-h-12 h-12 w-full rounded-xl bg-emerald-500 text-base font-bold text-zinc-950 hover:bg-emerald-400"
                >
                  <Armchair className="size-4" aria-hidden="true" />
                  Elegir{" "}
                  {tier.layoutType === "table_combo" ? "mesa" : "asiento"}
                  {tier.capacityPerUnit > 1
                    ? ` · ${tier.capacityPerUnit} personas`
                    : null}
                </Button>
              )}
            </div>
          )
        })}
      </div>

      <Separator className="my-5 bg-zinc-800" />

      <CheckoutBuyerFields
        value={buyer}
        onChange={setBuyer}
        disabled={isPending}
      />

      <Separator className="my-5 bg-zinc-800" />

      <PromoCodeInput
        eventId={eventId}
        cartSubtotal={cartSubtotal}
        applied={appliedPromo}
        onApplied={setAppliedPromo}
        onCleared={() => setAppliedPromo(null)}
        disabled={isPending || cartSubtotal <= 0}
      />

      <Separator className="my-5 bg-zinc-800" />

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">
          Resumen
        </p>
        <div className="mt-3 space-y-2 text-base">
          <div className="flex items-center justify-between text-zinc-400">
            <span>
              Entradas
              {totalTickets > 0
                ? ` · ${totalTickets}`
                : null}
            </span>
            <span className="tabular-nums text-zinc-200">
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
          <div className="border-t border-zinc-800 pt-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-zinc-300">Total</span>
              <span className="text-2xl font-black tracking-tight text-white tabular-nums">
                {formatCurrency(totalAmount)}
              </span>
            </div>
          </div>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          Precio final. Sin cargos ocultos.
        </p>
      </div>

      {/* Desktop CTA */}
      <Button
        type="button"
        size="lg"
        disabled={totalTickets === 0 || isPending}
        onClick={handleReserve}
        className="mt-5 hidden min-h-12 h-12 w-full rounded-full bg-white text-base font-bold text-zinc-950 shadow-lg shadow-white/10 hover:bg-zinc-200 disabled:opacity-50 sm:inline-flex"
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
      <p className="mt-3 hidden text-center text-sm text-zinc-500 sm:block">
        Vas a ser redirigido a Mercado Pago.
      </p>

      {/* Mobile sticky conversion bar */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-zinc-950/95 px-4 pt-3",
          "pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:hidden",
        )}
      >
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Total
            </p>
            <p className="text-xl font-black tabular-nums text-white">
              {formatCurrency(totalAmount)}
            </p>
          </div>
          <Button
            type="button"
            disabled={totalTickets === 0 || isPending}
            onClick={handleReserve}
            className="min-h-12 min-w-[48px] flex-1 rounded-2xl bg-emerald-500 text-base font-black text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {isPending ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : totalTickets === 0 ? (
              "Elegí entradas"
            ) : totalAmount > 0 ? (
              `Pagar ${formatCurrency(totalAmount)}`
            ) : (
              "Continuar al Pago"
            )}
          </Button>
        </div>
      </div>
      <div className="h-24 sm:hidden" aria-hidden="true" />
    </div>
  )
}
