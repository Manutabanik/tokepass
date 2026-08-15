"use client"

import {
  ChevronLeft,
  LoaderCircle,
  Ticket,
  UserRound,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"
import { createPortal } from "react-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import {
  startCheckoutWithPayment,
  startSandboxCheckout,
  getSeatingUnitCartHold,
  holdSeatingUnitForCart,
  holdSeatingUnitForCartByLayoutItem,
  releaseSeatingUnitCartHold,
} from "@/app/actions/checkout"
import type { ValidatedPromo } from "@/app/actions/coupons"
import { validatePromoCode } from "@/app/actions/coupons"
import {
  getEventSeatingAvailability,
  getEventSeatingUnitsForSector,
  getPublicEventVenueMap,
} from "@/app/actions/public-events"
import { CheckoutBuyerFields } from "@/components/public/checkout-buyer-fields"
import { CheckoutCountdown } from "@/components/public/checkout-countdown"
import { CheckoutFloatingBar } from "@/components/public/checkout-floating-bar"
import { ImmersiveCheckoutShell } from "@/components/public/immersive-checkout-shell"
import { CheckoutIdentityDialog } from "@/components/public/checkout-identity-dialog"
import {
  EventCheckoutSelector,
  type SelectedNumberedSeat,
} from "@/components/public/event-checkout-selector"
import {
  PaymentMethodSelector,
  type CheckoutPaymentProvider,
} from "@/components/public/payment-method-selector"
import { PromoCodeInput } from "@/components/public/promo-code-input"
import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
import { Button } from "@/components/ui/button"
import { useLockBodyScroll } from "@/hooks/use-lock-body-scroll"
import {
  trackAddToCart,
  trackInitiateCheckout,
  type EventPixelConfig,
} from "@/lib/analytics/pixels"
import {
  checkoutBuyerFormSchema,
  validateCheckoutBuyer,
  type CheckoutBuyerInfo,
} from "@/lib/checkout-buyer"
import { MAX_TICKETS_PER_PURCHASE } from "@/lib/checkout-limits"
import { GA_CHECKOUT_HOLD_MS } from "@/lib/checkout-hold"
import { redirectToCheckoutPaymentOrToast } from "@/lib/checkout-redirect"
import { ensureGuestCheckoutSession } from "@/lib/checkout/guest-session"
import { hasCheckoutIdentity, isCheckoutGuest } from "@/lib/checkout/identity"
import type { DefaultTicketTab } from "@/lib/checkout/ticket-picker"
import {
  firstCheckoutBuyerErrorField,
  onValidationError,
} from "@/lib/checkout/validation-scroll"
import {
  applyPhaseRolloverToPhases,
  PHASE_ROLLOVER_MESSAGE,
  type PhaseRolloverInfo,
} from "@/lib/inventory/active-phase"
import {
  inferInventoryTierType,
  isQuantityInventoryType,
} from "@/lib/inventory/unified-inventory"
import { getStoredReferralCode, persistReferralCode } from "@/lib/referral"
import {
  hasParametricZones,
  resolveVenueRenderMode,
} from "@/lib/seating/adaptive-seating"
import type { UniversalSeatSelection } from "@/lib/seating/universal-seat-types"
import {
  buildUniversalSeatPayloadForCheckout,
  resolveTierIdForUniversalSector,
} from "@/lib/seating/venue-adapter"
import {
  hasInteractiveVenueMap,
  venueMapToSeatingLayout,
} from "@/lib/seating/venue-map-geometry"
import { publicEventLoginPath } from "@/lib/seo/site"
import { useCheckoutIntentStore } from "@/lib/stores/checkout-intent-store"
import type { ScheduleDay } from "@/types/events"
import type { InteractiveVenueMap, VenueMapZone } from "@/types/venue-map"
import type {
  EventSeatingUnit,
  SeatingSectorSummary,
  VenueSeatingLayout,
} from "@/types/venues"

export type { TicketSelectorTier }

const AdaptiveSeatingFlow = dynamic(
  () =>
    import("@/components/public/adaptive-seating-flow").then(
      (mod) => mod.AdaptiveSeatingFlow,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-dvh w-screen flex-col bg-zinc-950">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
          <div className="h-8 w-8 animate-pulse rounded-full bg-white/10" />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <LoaderCircle
            className="size-8 animate-spin text-white/40"
            aria-hidden="true"
          />
          <span className="sr-only">Cargando mapa del recinto</span>
        </div>
      </div>
    ),
  },
)

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
  venueMap?: InteractiveVenueMap | null
  hasInteractiveMap?: boolean
  seatingLayout?: VenueSeatingLayout
  venueId?: string | null
  venueName?: string | null
  venueCapacity?: number | null
  eventSlug?: string | null
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
  /** Tab inicial configurado por el organizador. */
  defaultTicketTab?: DefaultTicketTab | null
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
  referralCode = null,
  seatingUnits = [],
  seatingSectorSummaries = [],
  seatingBackgroundUrl = null,
  venueMap = null,
  hasInteractiveMap: hasInteractiveMapProp = false,
  seatingLayout = [],
  venueId = null,
  venueName = null,
  venueCapacity = null,
  eventSlug = null,
  sandboxEligible = false,
  zoneTierPricing = [],
  purchaseLocked = false,
  defaultTicketTab = "auto",
}: TicketSelectorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const controlsLocked = isPending || purchaseLocked
  const [showSeatFlow, setShowSeatFlow] = useState(false)
  const portalReady = typeof document !== "undefined"
  const [identityOpen, setIdentityOpen] = useState(false)
  const checkoutMode = useCheckoutIntentStore((state) => state.mode)
  const checkoutIsGuest = useCheckoutIntentStore((state) => state.isGuest)
  const [selectedSeat, setSelectedSeat] = useState<SelectedNumberedSeat | null>(
    null,
  )
  const [showUpsell, setShowUpsell] = useState(false)
  const [upsellSkipped, setUpsellSkipped] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState<"select" | "pay">("select")
  const [focusedZoneId, setFocusedZoneId] = useState<string | null>(null)
  const [focusedTierId, setFocusedTierId] = useState<string | null>(null)
  const [fieldShake, setFieldShake] = useState(0)
  const [fetchedMap, setFetchedMap] = useState<InteractiveVenueMap | null>(null)
  const [mapFetchDone, setMapFetchDone] = useState(
    hasInteractiveVenueMap(venueMap),
  )
  const liveMap = hasInteractiveVenueMap(venueMap) ? venueMap : fetchedMap
  const mapLoading = !hasInteractiveVenueMap(liveMap) && !mapFetchDone
  const [loadedUnitsBySector, setLoadedUnitsBySector] = useState<
    Record<string, EventSeatingUnit[]>
  >({})
  const loadedUnitsRef = useRef(loadedUnitsBySector)
  loadedUnitsRef.current = loadedUnitsBySector
  const [buyer, setBuyer] = useState<CheckoutBuyerInfo>({
    buyerName: initialBuyer?.buyerName ?? "",
    buyerDni: initialBuyer?.buyerDni ?? "",
    buyerEmail: initialBuyer?.buyerEmail ?? "",
    buyerPhone: initialBuyer?.buyerPhone ?? "",
  })
  const buyerForm = useForm<CheckoutBuyerInfo>({
    defaultValues: {
      buyerName: initialBuyer?.buyerName ?? "",
      buyerDni: initialBuyer?.buyerDni ?? "",
      buyerEmail: initialBuyer?.buyerEmail ?? "",
      buyerPhone: initialBuyer?.buyerPhone ?? "",
    },
    resolver: zodResolver(checkoutBuyerFormSchema),
    mode: "onSubmit",
  })
  const holdExpiresAt = useCheckoutIntentStore((state) =>
    state.eventId === eventId ? state.holdExpiresAt : null,
  )
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(tiers.map((tier) => [tier.id, 0])),
  )
  const [tierOverrides, setTierOverrides] = useState<
    Record<string, Partial<TicketSelectorTier>>
  >({})
  const displayTiers = useMemo(
    () =>
      tiers.map((tier) => ({
        ...tier,
        ...tierOverrides[tier.id],
      })),
    [tierOverrides, tiers],
  )
  const [appliedPromo, setAppliedPromo] = useState<ValidatedPromo | null>(null)
  const [selectedProvider, setSelectedProvider] =
    useState<CheckoutPaymentProvider>("mercadopago")
  const [storedRef] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return getStoredReferralCode()
  })

  const restoredIntent = useRef(false)
  const [intentRestored, setIntentRestored] = useState(false)

  useEffect(() => {
    if (hasInteractiveVenueMap(venueMap)) return
    let cancelled = false
    void getPublicEventVenueMap(eventId).then((map) => {
      if (cancelled) return
      if (map) setFetchedMap(map)
      setMapFetchDone(true)
    })
    return () => {
      cancelled = true
    }
  }, [eventId, venueMap])

  useEffect(() => {
    function restoreIntent() {
      if (restoredIntent.current) return
      restoredIntent.current = true
      const store = useCheckoutIntentStore.getState()
      store.resetIfOtherEvent(eventId)
      if (currentUserId) store.markAuthenticated()
      if (store.eventId !== eventId) {
        setIntentRestored(true)
        return
      }

      const allowed = new Set(tiers.map((tier) => tier.id))
      const restored = Object.fromEntries(
        Object.entries(store.quantities).filter(([tierId]) => allowed.has(tierId)),
      )
      if (Object.values(restored).some((qty) => qty > 0)) {
        setQuantities((current) => ({ ...current, ...restored }))
      }
      if (store.selectedSeat) setSelectedSeat(store.selectedSeat)
      if (
        store.buyer.buyerName ||
        store.buyer.buyerDni ||
        store.buyer.buyerEmail ||
        store.buyer.buyerPhone
      ) {
        setBuyer((current) => ({
          buyerName: store.buyer.buyerName || current.buyerName,
          buyerDni: store.buyer.buyerDni || current.buyerDni,
          buyerEmail: store.buyer.buyerEmail || current.buyerEmail,
          buyerPhone: store.buyer.buyerPhone || current.buyerPhone,
        }))
        buyerForm.reset({
          buyerName: store.buyer.buyerName || initialBuyer?.buyerName || "",
          buyerDni: store.buyer.buyerDni || initialBuyer?.buyerDni || "",
          buyerEmail: store.buyer.buyerEmail || initialBuyer?.buyerEmail || "",
          buyerPhone: store.buyer.buyerPhone || initialBuyer?.buyerPhone || "",
        })
      }

      setIntentRestored(true)
      if (store.selectedSeat) {
        void getSeatingUnitCartHold(eventId, store.selectedSeat.seatingUnitId).then(
          (hold) => {
            if (hold.success) {
              useCheckoutIntentStore.getState().setHoldExpiresAt(hold.reservedUntil)
            }
          },
        )
      } else if (store.holdExpiresAt) {
        useCheckoutIntentStore.getState().setHoldExpiresAt(store.holdExpiresAt)
      }
      if (!hasCheckoutIdentity(currentUserId, store.mode)) return
      const action = store.consumePendingAction()
      if (action === "open_map") {
        queueMicrotask(() => setShowSeatFlow(true))
      }
    }

    if (useCheckoutIntentStore.persist.hasHydrated()) {
      restoreIntent()
      return
    }
    return useCheckoutIntentStore.persist.onFinishHydration(restoreIntent)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot cart restore
  }, [currentUserId, eventId, tiers])

  function enterPaymentHold(result: {
    initPoint?: string
    paymentUrl?: string
  }) {
    redirectToCheckoutPaymentOrToast(result.paymentUrl ?? result.initPoint)
  }

  const resolvedRef = referralCode?.trim() || storedRef
  const loginHref = publicEventLoginPath({ id: eventId, slug: eventSlug })
  const identityReady = hasCheckoutIdentity(currentUserId, checkoutMode)
  const guestCheckout = isCheckoutGuest(
    checkoutMode,
    currentUserId,
    checkoutIsGuest,
  )
  useLockBodyScroll(showSeatFlow)

  function persistCheckoutCart() {
    useCheckoutIntentStore.getState().rememberCart({
      eventId,
      eventSlug,
      quantities,
      selectedSeat,
      buyer,
      subtotal: cartSubtotal,
      holdExpiresAt: useCheckoutIntentStore.getState().holdExpiresAt,
    })
  }

  function requestIdentity(action: "open_map" | "pay") {
    persistCheckoutCart()
    useCheckoutIntentStore.getState().setPendingAction(action)
    setIdentityOpen(true)
  }

  async function ensureGuestAuthForHold(): Promise<boolean> {
    const mode = useCheckoutIntentStore.getState().mode
    if (!hasCheckoutIdentity(currentUserId, mode)) {
      requestIdentity("open_map")
      toast.error(
        "Elegí iniciar sesión o continuar como invitado para reservar.",
      )
      return false
    }
    if (currentUserId) return true
    return ensureGuestCheckoutSession()
  }

  function goToLogin() {
    useCheckoutIntentStore.getState().chooseAccount(eventId, eventSlug)
    persistCheckoutCart()
    router.push(loginHref)
  }

  function returnToCheckout() {
    setShowSeatFlow(false)
    window.setTimeout(() => {
      document
        .getElementById("checkout-complete")
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 80)
  }

  function continueAsGuest() {
    useCheckoutIntentStore.getState().chooseGuest(eventId, eventSlug)
    persistCheckoutCart()
    const action = useCheckoutIntentStore.getState().consumePendingAction()
    setIdentityOpen(false)
    if (action === "open_map") {
      setShowSeatFlow(true)
    } else if (action === "pay") {
      setCheckoutStep("pay")
      window.setTimeout(() => {
        document
          .getElementById("checkout-complete")
          ?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 80)
    }
    void ensureGuestCheckoutSession()
  }

  const hasInteractiveMap =
    hasInteractiveMapProp || hasInteractiveVenueMap(liveMap)
  const immersiveMap = hasInteractiveMap

  const soldOutZoneIds = useMemo(() => {
    const zones = liveMap?.zones ?? []
    if (zones.length === 0) return []
    const tierRefs = displayTiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      price: tier.price,
      available: tier.available,
      seatingSectorId: tier.seatingSectorId,
      layoutType: tier.layoutType,
    }))
    return zones
      .filter((zone) => {
        const tierId = resolveTierIdForUniversalSector(
          zone.id,
          zone.name,
          tierRefs,
        )
        const tier = displayTiers.find((item) => item.id === tierId)
        const summary = seatingSectorSummaries.find(
          (row) => row.sectorId === zone.id || row.sectorName === zone.name,
        )
        const available = tier?.available ?? summary?.available
        return available != null && available <= 0
      })
      .map((zone) => zone.id)
  }, [displayTiers, liveMap?.zones, seatingSectorSummaries])

  const hasSeatingFlow =
    seatingSectorSummaries.length > 0 ||
    seatingUnits.length > 0 ||
    seatingLayout.length > 0 ||
    tiers.some((tier) => tier.layoutType !== "general")

  const seatingRenderMode = resolveVenueRenderMode(liveMap)
  const resolvedSeatingLayout = useMemo(() => {
    if (seatingLayout.length > 0) return seatingLayout
    if (!liveMap) return []
    if (hasParametricZones(liveMap)) {
      return venueMapToSeatingLayout({ ...liveMap, zones: [] })
    }
    return venueMapToSeatingLayout(liveMap)
  }, [seatingLayout, liveMap])

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
      seatingLayout: resolvedSeatingLayout,
      seatingBackgroundUrl,
      capacity: venueCapacity ?? undefined,
      tiers: displayTiers.map((tier) => ({
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
    resolvedSeatingLayout,
    seatingSectorSummaries,
    displayTiers,
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
      displayTiers
        .map((tier) => {
          const quantity = quantities[tier.id] ?? 0
          const inventoryType = inferInventoryTierType({
            tierType: tier.tierType,
            layoutType: tier.layoutType,
            category: tier.category,
          })
          return {
            ...tier,
            inventoryType,
            quantity,
            subtotal: quantity * tier.price,
            maxSelectable: Math.min(
              MAX_TICKETS_PER_PURCHASE,
              Math.max(0, tier.available),
            ),
          }
        })
        .filter(
          (tier) =>
            tier.quantity > 0 && isQuantityInventoryType(tier.inventoryType),
        ),
    [displayTiers, quantities],
  )

  const seatLineCount = selectedSeat ? 1 : 0
  const totalTickets =
    selection.reduce((sum, tier) => sum + tier.quantity, 0) + seatLineCount
  const ticketsSubtotal = roundMoney(
    selection.reduce((sum, tier) => sum + tier.subtotal, 0) +
      (selectedSeat?.price ?? 0),
  )
  // All-In: tier.price already includes Tokepass fee.
  const cartSubtotal = ticketsSubtotal
  const discountAmount = appliedPromo
    ? Math.min(appliedPromo.discountAmount, cartSubtotal)
    : 0
  const totalAmount = roundMoney(Math.max(0, cartSubtotal - discountAmount))
  const visibleStep = totalTickets > 0 ? checkoutStep : "select"
  useEffect(() => {
    if (!intentRestored) return
    if (totalTickets <= 0) {
      if (holdExpiresAt) useCheckoutIntentStore.getState().setHoldExpiresAt(null)
      return
    }
    if (!holdExpiresAt) ensureCartHoldClock()
  }, [holdExpiresAt, intentRestored, totalTickets])

  useEffect(() => {
    if (!portalReady) return
    useCheckoutIntentStore.getState().rememberCart({
      eventId,
      eventSlug,
      quantities,
      selectedSeat,
      buyer,
      subtotal: cartSubtotal,
      holdExpiresAt: useCheckoutIntentStore.getState().holdExpiresAt,
    })
  }, [
    buyer,
    cartSubtotal,
    eventId,
    eventSlug,
    portalReady,
    quantities,
    selectedSeat,
  ])

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

  function applyPhaseRollover(info: PhaseRolloverInfo) {
    const current = displayTiers.find((tier) => tier.id === info.tierId)
    const nextAvailable = Math.max(0, info.available)
    setTierOverrides((prev) => ({
      ...prev,
      [info.tierId]: {
        price: info.price,
        available: nextAvailable,
        phases: applyPhaseRolloverToPhases(
          current?.phases ?? [],
          info.phaseId,
        ),
      },
    }))
    setQuantities((currentQty) => ({
      ...currentQty,
      [info.tierId]: Math.min(currentQty[info.tierId] ?? 0, nextAvailable),
    }))
    toast.warning(info.message || PHASE_ROLLOVER_MESSAGE)
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

  function buildCheckoutItems(extraAddonId?: string) {
    const items = [
      ...(selectedSeat
        ? [
            {
              tierId: selectedSeat.tierId,
              quantity: 1,
              seatingUnitId: selectedSeat.seatingUnitId,
              sectorKey: selectedSeat.sectorKey,
              tableNumber: selectedSeat.tableNumber,
            },
          ]
        : []),
      ...selection.map((tier) => ({
        tierId: tier.id,
        quantity: tier.quantity,
      })),
    ]
    if (extraAddonId) {
      const existing = items.find((item) => item.tierId === extraAddonId)
      if (existing) existing.quantity += 1
      else items.push({ tierId: extraAddonId, quantity: 1 })
    }
    return items
  }

  function hasPendingAddonUpsell() {
    return displayTiers.some((tier) => {
      const type = inferInventoryTierType({
        tierType: tier.tierType,
        layoutType: tier.layoutType,
        category: tier.category,
      })
      return (
        type === "addon" &&
        (quantities[tier.id] ?? 0) === 0 &&
        tier.available > 0
      )
    })
  }

  function submitCheckout(
    extraAddonId?: string,
    sandbox = false,
    buyerOverride?: CheckoutBuyerInfo,
  ) {
    if (controlsLocked) return
    const items = buildCheckoutItems(extraAddonId)
    if (items.length === 0) return

    const source = buyerOverride ?? buyerForm.getValues()
    const buyerCheck = validateCheckoutBuyer(source)
    if (!buyerCheck.ok) {
      const field = firstCheckoutBuyerErrorField(
        buyerForm.formState.errors,
      )
      onValidationError(field)
      return
    }
    setBuyer(buyerCheck.buyer)

    fireCartPixels({
      contentIds: items.map((item) => item.tierId),
      value: totalAmount,
      numItems: items.reduce((sum, item) => sum + item.quantity, 0),
    })

    startTransition(async () => {
      if (!currentUserId) {
        const authed = await ensureGuestCheckoutSession()
        if (!authed) {
          requestIdentity("pay")
          toast.error("Elegí iniciar sesión o continuar como invitado para pagar.")
          return
        }
      }

      const result = sandbox
        ? await startSandboxCheckout(
            eventId,
            items,
            resolvedRef,
            [],
            buyerCheck.buyer,
            appliedPromo?.promoCodeId ?? null,
          )
        : await startCheckoutWithPayment(
            eventId,
            items,
            resolvedRef,
            [],
            buyerCheck.buyer,
            appliedPromo?.promoCodeId ?? null,
            { paymentProvider: selectedProvider },
          )

      if (!result.success) {
        if (result.error === "auth_required") {
          persistCheckoutCart()
          toast.error("Iniciá sesión para pagar. Tu selección está guardada.")
          router.push(loginHref)
          return
        }
        if (result.error === "phase_rollover" && result.phaseRollover) {
          applyPhaseRollover(result.phaseRollover)
          router.refresh()
          return
        }
        toastCheckoutError(
          result.error,
          sandbox
            ? "No se pudo completar la compra de prueba"
            : "No se pudo iniciar el pago",
        )
        router.refresh()
        return
      }

      if (sandbox) {
        toast.success("Compra de prueba OK · Modo Sandbox")
      }
      enterPaymentHold(result)
    })
  }

  function goToPaymentStep() {
    if ((selection.length === 0 && !selectedSeat) || controlsLocked) return
    if (hasPendingAddonUpsell() && !upsellSkipped) {
      setShowUpsell(true)
      return
    }
    if (!identityReady) {
      useCheckoutIntentStore.getState().chooseGuest(eventId, eventSlug)
      void ensureGuestCheckoutSession()
    }
    setCheckoutStep("pay")
  }

  function handleImmersiveZoneSelect(zone: VenueMapZone) {
    if (purchaseLocked || soldOutZoneIds.includes(zone.id)) return
    setFocusedZoneId(zone.id)
    const tierId = resolveTierIdForUniversalSector(
      zone.id,
      zone.name,
      displayTiers.map((tier) => ({
        id: tier.id,
        name: tier.name,
        price: tier.price,
        available: tier.available,
        seatingSectorId: tier.seatingSectorId,
        layoutType: tier.layoutType,
      })),
    )
    if (!tierId) return
    const tier = displayTiers.find((item) => item.id === tierId)
    if (!tier || tier.available <= 0) return
    setFocusedTierId(tierId)
    if ((quantities[tierId] ?? 0) === 0) {
      updateQuantity(
        tierId,
        1,
        Math.min(MAX_TICKETS_PER_PURCHASE, Math.max(0, tier.available)),
      )
      ensureCartHoldClock()
    }
  }

  function handleReserve() {
    if ((selection.length === 0 && !selectedSeat) || controlsLocked) return
    if (visibleStep !== "pay") {
      goToPaymentStep()
      return
    }
    if (!identityReady) {
      requestIdentity("pay")
      return
    }
    if (hasPendingAddonUpsell() && !upsellSkipped) {
      setShowUpsell(true)
      return
    }
    void buyerForm.handleSubmit(
      (values) => {
        submitCheckout(undefined, false, values)
      },
      (formErrors) => {
        setFieldShake((current) => current + 1)
        onValidationError(firstCheckoutBuyerErrorField(formErrors))
      },
    )()
  }

  function handleSandboxReserve() {
    if (!sandboxEligible || (selection.length === 0 && !selectedSeat) || controlsLocked) {
      return
    }
    if (!identityReady) {
      requestIdentity("pay")
      return
    }
    void buyerForm.handleSubmit(
      (values) => {
        submitCheckout(undefined, true, values)
      },
      (formErrors) => {
        setFieldShake((current) => current + 1)
        onValidationError(firstCheckoutBuyerErrorField(formErrors))
      },
    )()
  }

  function openSeatFlow() {
    if (purchaseLocked) return
    const canOpen =
      hasInteractiveVenueMap(liveMap) ||
      Boolean(seatingBackgroundUrl?.trim()) ||
      (universalPayload?.sectors.length ?? 0) > 0 ||
      resolvedSeatingLayout.length > 0
    if (!canOpen) {
      toast.error(
        mapLoading
          ? "El mapa se está cargando. Probá de nuevo en un instante."
          : "No hay ubicaciones configuradas para este evento.",
      )
      return
    }
    persistCheckoutCart()
    setShowSeatFlow(true)
    if (!identityReady) {
      requestIdentity("open_map")
    }
  }

  function ensureCartHoldClock() {
    if (useCheckoutIntentStore.getState().holdExpiresAt) return
    useCheckoutIntentStore
      .getState()
      .setHoldExpiresAt(new Date(Date.now() + GA_CHECKOUT_HOLD_MS).toISOString())
  }

  function handleHoldExpired() {
    const seat = selectedSeat
    setSelectedSeat(null)
    setQuantities(Object.fromEntries(tiers.map((tier) => [tier.id, 0])))
    useCheckoutIntentStore.getState().setHoldExpiresAt(null)
    if (seat) void releaseSeatingUnitCartHold(eventId, seat.seatingUnitId)
    router.refresh()
  }

  function handleUniversalContinue(
    selectionPayload: UniversalSeatSelection,
    options?: { keepOpen?: boolean },
  ) {
    if (purchaseLocked) return

    if (selectionPayload.kind === "general") {
      const tierId = resolveTierIdForUniversalSector(
        selectionPayload.sectorId,
        selectionPayload.sectorName,
        displayTiers.map((tier) => ({
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
      const tier = displayTiers.find((item) => item.id === tierId)
      updateQuantity(
        tierId,
        selectionPayload.quantity,
        Math.min(MAX_TICKETS_PER_PURCHASE, Math.max(0, tier?.available ?? 0)),
      )
      ensureCartHoldClock()
      setFocusedZoneId(selectionPayload.sectorId)
      setFocusedTierId(tierId)
      if (!options?.keepOpen && !immersiveMap) returnToCheckout()
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

    async function applyNumbered(unit: EventSeatingUnit) {
      if (!(await ensureGuestAuthForHold())) return
      if (unit.status !== "available" && unit.status !== "reserved") {
        toast.error(
          "Esta ubicación acaba de ser reservada por otra persona. Por favor elegí otra.",
        )
        router.refresh()
        return
      }
      const hold = await holdSeatingUnitForCart(eventId, unit.id)
      if (!hold.success) {
        toast.error(
          hold.error === "not_materialized"
            ? "El inventario de esta zona todavía no está publicado."
            : hold.error === "out_of_stock" || hold.error === "auth_required"
              ? "Esta ubicación acaba de ser reservada por otra persona. Por favor elegí otra."
              : hold.error,
        )
        if (hold.error === "auth_required") requestIdentity("open_map")
        else router.refresh()
        return
      }
      if (selectedSeat && selectedSeat.seatingUnitId !== unit.id) {
        void releaseSeatingUnitCartHold(eventId, selectedSeat.seatingUnitId)
      }
      const tableMatch = String(unit.label ?? "").match(/(\d+)/)
      setSelectedSeat({
        tierId: unit.tierId,
        seatingUnitId: unit.id,
        sectorKey: unit.sectorId,
        tableNumber: tableMatch ? Number(tableMatch[1]) : null,
        label: unit.label || "Ubicación numerada",
        price: selectionPayload.unitPrice,
      })
      useCheckoutIntentStore.getState().setHoldExpiresAt(hold.reservedUntil)
      setFocusedZoneId(selectionPayload.sectorId)
      setFocusedTierId(unit.tierId)
      if (!options?.keepOpen && !immersiveMap) returnToCheckout()
    }

    const cached =
      (seat.seatingUnitId
        ? mergedSeatingUnits.find((unit) => unit.id === seat.seatingUnitId)
        : null) ?? seatIdByLayoutItem.get(seat.id)
    if (cached) {
      void applyNumbered(cached)
      return
    }

    startTransition(async () => {
      if (!(await ensureGuestAuthForHold())) return
      const hold = await holdSeatingUnitForCartByLayoutItem(
        eventId,
        selectionPayload.sectorId,
        seat.id,
      )
      if (!hold.success) {
        toast.error(
          hold.error === "not_materialized"
            ? "El inventario de esta zona todavía no está publicado."
            : hold.error === "out_of_stock" || hold.error === "auth_required"
              ? "Esta ubicación acaba de ser reservada por otra persona. Por favor elegí otra."
              : hold.error,
          hold.error === "not_materialized"
            ? {
                description:
                  "No se puede comprar un tablón hasta que el stock esté materializado.",
              }
            : undefined,
        )
        if (hold.error === "auth_required") requestIdentity("open_map")
        else router.refresh()
        return
      }
      const units = await getEventSeatingUnitsForSector(
        eventId,
        selectionPayload.sectorId,
      )
      setLoadedUnitsBySector((current) => ({
        ...current,
        [selectionPayload.sectorId]: units,
      }))
      const unit =
        units.find((item) => item.id === hold.seatingUnitId) ??
        units.find((item) => item.layoutItemId === seat.id)
      if (!unit) {
        toast.error("El inventario de esta zona todavía no está publicado.", {
          description:
            "No se puede comprar un tablón hasta que el stock esté materializado.",
        })
        router.refresh()
        return
      }
      await applyNumbered(unit)
    })
  }

  const loadSectorUnits = useCallback(async (sectorId: string) => {
    const cached = loadedUnitsRef.current[sectorId]
    if (cached) return cached
    const units = await getEventSeatingUnitsForSector(eventId, sectorId)
    loadedUnitsRef.current = { ...loadedUnitsRef.current, [sectorId]: units }
    setLoadedUnitsBySector((current) =>
      current[sectorId] ? current : { ...current, [sectorId]: units },
    )
    return units
  }, [eventId])

  const loadAllUnits = useCallback(async () => {
    const units = await getEventSeatingAvailability(eventId)
    const bySector: Record<string, EventSeatingUnit[]> = {}
    for (const unit of units) {
      const key = unit.sectorId || "_sector"
      ;(bySector[key] ??= []).push(unit)
    }
    loadedUnitsRef.current = { ...loadedUnitsRef.current, ...bySector }
    setLoadedUnitsBySector((current) => ({ ...current, ...bySector }))
    return units
  }, [eventId])

  const seatFlowOverlay =
    showSeatFlow && !immersiveMap ? (
      <div className="fixed inset-0 z-[80] flex h-dvh w-screen flex-col overflow-hidden overscroll-none bg-zinc-950">
        <AdaptiveSeatingFlow
          takeover
          pending={controlsLocked}
          eventTitle={eventTitle}
          mapImageUrl={
            universalPayload?.mapImageUrl ?? seatingBackgroundUrl ?? null
          }
          venueMap={liveMap}
          sectors={universalPayload?.sectors ?? []}
          onBack={() => setShowSeatFlow(false)}
          onContinue={handleUniversalContinue}
          onLoadSectorUnits={loadSectorUnits}
          onLoadAllUnits={loadAllUnits}
        />
      </div>
    ) : null

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

  const checkoutPanel = (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="flex shrink-0 items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          {visibleStep === "pay" ? (
            <button
              type="button"
              onClick={() => setCheckoutStep("select")}
              className="mb-2 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Volver a la selección"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
          ) : null}
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {visibleStep === "pay" ? "Pago" : "Entradas"}
          </p>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-foreground">
            {visibleStep === "pay" ? "Tus datos" : "Elegí tu experiencia"}
          </h2>
        </div>
        {visibleStep === "select" ? (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border">
            Máx. {MAX_TICKETS_PER_PURCHASE}
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 sm:px-5">
        <AnimatePresence mode="wait" initial={false}>
          {visibleStep === "select" ? (
            <motion.div
              key="select"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.28, ease: "easeInOut" }}
            >
              <EventCheckoutSelector
                tiers={displayTiers}
                quantities={quantities}
                isPending={controlsLocked}
                hasSeatingFlow={hasSeatingFlow}
                hasInteractiveMap={hasInteractiveMap}
                mapEmbedded={immersiveMap}
                focusedTierId={focusedTierId}
                mapLoading={
                  mapLoading &&
                  !hasInteractiveVenueMap(liveMap) &&
                  !seatingBackgroundUrl?.trim() &&
                  resolvedSeatingLayout.length === 0 &&
                  (universalPayload?.sectors.length ?? 0) === 0
                }
                seatingRenderMode={seatingRenderMode}
                selectedSeat={selectedSeat}
                showUpsell={showUpsell}
                defaultTicketTab={defaultTicketTab}
                onQuantityChange={updateQuantity}
                onOpenSeatFlow={openSeatFlow}
                onPurchaseIntent={goToPaymentStep}
                onClearSeat={() => {
                  const seat = selectedSeat
                  setSelectedSeat(null)
                  if (seat) {
                    void releaseSeatingUnitCartHold(eventId, seat.seatingUnitId)
                  }
                }}
                onAddUpsell={(tierId) => {
                  const addon = displayTiers.find((tier) => tier.id === tierId)
                  updateQuantity(tierId, 1, addon?.available ?? 1)
                  setShowUpsell(false)
                  setUpsellSkipped(true)
                  goToPaymentStep()
                }}
                onSkipUpsell={() => {
                  setShowUpsell(false)
                  setUpsellSkipped(true)
                  goToPaymentStep()
                }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="pay"
              id="checkout-complete"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.28, ease: "easeInOut" }}
              className="space-y-4 pt-2"
            >
              {holdExpiresAt ? (
                <CheckoutCountdown
                  variant="cart"
                  expiresAt={holdExpiresAt}
                  onExpired={handleHoldExpired}
                />
              ) : null}

              <PromoCodeInput
                eventId={eventId}
                cartSubtotal={cartSubtotal}
                applied={appliedPromo}
                onApplied={setAppliedPromo}
                onCleared={() => setAppliedPromo(null)}
                disabled={controlsLocked || cartSubtotal <= 0}
              />

              {guestCheckout ? (
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <UserRound
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  Completá nombre, DNI, teléfono y email para emitir la entrada.
                </p>
              ) : null}

              <PaymentMethodSelector
                selectedProvider={selectedProvider}
                onSelectProvider={setSelectedProvider}
                disabled={controlsLocked}
              />

              <div id="checkout-buyer">
                <CheckoutBuyerFields
                  value={buyer}
                  errors={buyerForm.formState.errors}
                  shakeSignal={fieldShake}
                  onChange={(next) => {
                    setBuyer(next)
                    buyerForm.reset(next)
                  }}
                  disabled={controlsLocked}
                />
              </div>

              {sandboxEligible ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={controlsLocked}
                  onClick={handleSandboxReserve}
                  className="w-full border-dashed text-muted-foreground hover:text-foreground"
                >
                  Compra de prueba (modo test)
                </Button>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <CheckoutFloatingBar
        variant="panel"
        itemCount={totalTickets}
        subtotal={totalAmount}
        pending={isPending}
        locked={purchaseLocked}
        onPay={handleReserve}
      />
    </div>
  )

  return (
    <>
      {portalReady && seatFlowOverlay
        ? createPortal(seatFlowOverlay, document.body)
        : seatFlowOverlay}
      <CheckoutIdentityDialog
        open={identityOpen}
        onOpenChange={(open) => {
          setIdentityOpen(open)
          if (!open) useCheckoutIntentStore.getState().setPendingAction(null)
        }}
        onLogin={goToLogin}
        onGuest={continueAsGuest}
      />
      {immersiveMap ? (
        <ImmersiveCheckoutShell
          paying={visibleStep === "pay"}
          onDismissPay={() => setCheckoutStep("select")}
          map={
            liveMap ? (
              <AdaptiveSeatingFlow
                immersive
                pending={controlsLocked}
                eventTitle={eventTitle}
                venueMap={liveMap}
                selectedZoneId={focusedZoneId}
                unavailableZoneIds={soldOutZoneIds}
                sectors={universalPayload?.sectors ?? []}
                onSelectZone={handleImmersiveZoneSelect}
                onContinue={(payload) =>
                  handleUniversalContinue(payload, { keepOpen: true })
                }
                onLoadSectorUnits={loadSectorUnits}
                onLoadAllUnits={loadAllUnits}
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-zinc-950 text-sm text-zinc-500">
                {mapLoading ? (
                  <>
                    <LoaderCircle
                      className="size-8 animate-spin text-white/40"
                      aria-hidden="true"
                    />
                    <span className="sr-only">Cargando mapa del recinto</span>
                  </>
                ) : (
                  "El plano no está disponible."
                )}
              </div>
            )
          }
          panel={checkoutPanel}
        />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-2xl shadow-black/40">
          {checkoutPanel}
        </div>
      )}
    </>
  )
}
