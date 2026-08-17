"use client"

import {
  LoaderCircle,
  Ticket,
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
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import {
  startCheckoutWithPayment,
  startSandboxCheckout,
  getGaCartHold,
  getSeatingUnitCartHold,
  listCartHolds,
  holdSeatingUnitForCart,
  holdSeatingUnitForCartByLayoutItem,
  lockTickets,
  releaseGaCartHolds,
  releaseSeatingUnitCartHold,
} from "@/app/actions/checkout"
import type { ValidatedPromo } from "@/app/actions/coupons"
import { validatePromoCode } from "@/app/actions/coupons"
import {
  getEventSeatingAvailability,
  getEventSeatingUnitsForSector,
  getPublicEventVenueMap,
} from "@/app/actions/public-events"
import { CheckoutHeader } from "@/components/checkout/CheckoutHeader"
import { CheckoutIdentity } from "@/components/checkout/CheckoutIdentity"
import { CheckoutPaymentForm } from "@/components/checkout/CheckoutPaymentForm"
import { CheckoutTicketList } from "@/components/checkout/CheckoutTicketList"
import { CheckoutTimer } from "@/components/checkout/CheckoutTimer"
import { CheckoutFloatingBar } from "@/components/public/checkout-floating-bar"
import { CheckoutSelectionSidebar } from "@/components/public/checkout-selection-sidebar"
import { type CheckoutFlowStep } from "@/components/public/checkout-stepper"
import {
  formatSelectionChargeDetail,
  storefrontLineSkuQuantity,
  storefrontLineTotal,
} from "@/lib/checkout/charge-unit"
import { cartTicketLineId } from "@/lib/checkout/cart-lines"
import { CheckoutUpsellStep } from "@/components/public/checkout-upsell-step"
import { groupCheckoutTiers } from "@/components/public/event-checkout-selector"
import {
  type CheckoutPaymentProvider,
} from "@/components/public/payment-method-selector"
import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
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
import {
  ABSOLUTE_MAX_ITEMS_PER_PURCHASE,
  MAX_TABLES_PER_PURCHASE,
  MAX_TICKETS_PER_PURCHASE,
  purchaseCapForLayout,
  resolvePurchaseLimit,
  storefrontLimitMessage,
} from "@/lib/checkout-limits"
import { minReservedUntil } from "@/lib/checkout-hold"
import {
  HIGH_DEMAND_LOCK_MESSAGE,
  HIGH_DEMAND_LOCK_TIMEOUT,
} from "@/lib/checkout/lock-timeout"
import {
  CHECKOUT_STOCK_TAKEN_MESSAGE,
  earliestHoldExpiry,
  isCheckoutStockConflict,
  rehydrateSelectedItemsFromHolds,
} from "@/lib/checkout/revalidate-seat-holds"
import { redirectToCheckoutPaymentOrToast } from "@/lib/checkout-redirect"
import {
  ensureGuestCheckoutSession,
  hasCheckoutAuthSession,
} from "@/lib/checkout/guest-session"
import { hasCheckoutIdentity } from "@/lib/checkout/identity"
import {
  getCheckoutDwellMs,
  getOrCreateDeviceHash,
} from "@/lib/checkout/client-security"
import { type DefaultTicketTab } from "@/lib/checkout/ticket-picker"
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
import {
  defaultCheckoutDateId,
  listCheckoutDateCards,
  resolveTicketDateMeta,
  scheduleDayCartLabel,
  ticketDateCartLabel,
  ticketMatchesTab,
} from "@/lib/checkout/ticket-day-groups"
import { getStoredReferralCode, persistReferralCode } from "@/lib/referral"
import { extractAffiliateCode } from "@/lib/rrpp"
import {
  hasParametricZones,
} from "@/lib/seating/adaptive-seating"
import type {
  SeatStatus,
  UniversalSeatSelection,
} from "@/lib/seating/universal-seat-types"
import {
  buildUniversalSeatPayloadForCheckout,
  resolveTierIdForUniversalSector,
} from "@/lib/seating/venue-adapter"
import {
  flattenSeatsForAvailability,
  hasInteractiveVenueMap,
  seatingLayoutToVenueMap,
  venueMapToSeatingLayout,
} from "@/lib/seating/venue-map-geometry"
import { isCategorySoldOut } from "@/lib/checkout/category-stock"
import { mapIncludesGeneralAccess, venuePriceModeFromSellMode, type VenueMapElement } from "@/types/venue-map"
import {
  occupancyFromSeatingUnits,
  resolveLiveVenueSeatStatus,
} from "@/lib/seating/venue-map-occupancy"
import { useSeatingOccupancyRealtime } from "@/hooks/use-seating-occupancy-realtime"
import {
  hydrateStorefrontItemsFromMap,
  resolveStorefrontItemFromMap,
  storefrontItemFromElement,
  storefrontItemFromZone,
} from "@/lib/seating/storefront-selection"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"
import { publicEventLoginPath } from "@/lib/seo/site"
import {
  useCheckoutStore,
  type StorefrontCartLine,
} from "@/lib/stores/checkout-store"
import {
  storefrontSelectionCount,
  storefrontSelectionTotal,
  useStorefrontSeatStore,
  type StorefrontLayoutSeat,
  type StorefrontSelectedItem,
} from "@/lib/stores/storefront-seat-store"
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
      <div className="flex h-full w-full items-center justify-center bg-background">
        <LoaderCircle
          className="size-8 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
        <span className="sr-only">Cargando mapa del recinto</span>
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
  selectedDayId?: string | null
  /** @deprecated All-In pricing absorbs the fee; ignored. */
  serviceChargeRate?: number
  /** Código RRPP desde ?rrpp= / cookie — nunca se envía promoter_id al servidor */
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
  /** Tope por comprador. null o 0 = sin límite. */
  maxTicketsPerUser?: number | null
  /** Flatten the checkout panel to fill a 100dvh tunnel. */
  fillViewport?: boolean
  onReservationExpired?: () => void
  onLeaveCheckout?: () => void
  renderLayout?: (parts: { map: ReactNode; panel: ReactNode }) => ReactNode
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function toastCheckoutError(error: string, fallbackTitle: string) {
  const technical =
    /invalid token|hydrat|undefined|cannot read|failed to fetch|networkerror|internal server/i.test(
      error,
    )
  if (technical) {
    toast.error(
      "Ocurrió un problema al cargar los datos. Por favor, intentá de nuevo.",
    )
    return
  }
  if (error === HIGH_DEMAND_LOCK_TIMEOUT) {
    toast.error(HIGH_DEMAND_LOCK_MESSAGE)
    return
  }
  if (isCheckoutStockConflict(error)) {
    toast.error(CHECKOUT_STOCK_TAKEN_MESSAGE)
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

export function CheckoutTunnel({
  eventId,
  eventTitle = "Elegí tu entrada",
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
  selectedDayId = null,
  scheduleDays = [],
  maxTicketsPerUser = null,
  fillViewport = false,
  onReservationExpired,
  onLeaveCheckout,
  renderLayout,
}: TicketSelectorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [ctaBusy, setCtaBusy] = useState(false)
  const ctaBusyRef = useRef(false)
  const checkoutBusy = isPending || ctaBusy
  const controlsLocked = checkoutBusy || purchaseLocked
  const [showSeatFlow, setShowSeatFlow] = useState(false)
  const portalReady = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const checkoutMode = useCheckoutStore((state) => state.mode)
  const selectedSeat = useCheckoutStore((state) => state.selectedSeat)
  const setSelectedSeat = useCheckoutStore((state) => state.setSelectedSeat)
  const [upsellSkipped, setUpsellSkipped] = useState(false)
  const checkoutStep = useCheckoutStore((state) => state.checkoutStep)
  const setCheckoutStep = useCheckoutStore((state) => state.setCheckoutStep)
  const [highlightContinue, setHighlightContinue] = useState(false)
  const [focusedZoneId, setFocusedZoneId] = useState<string | null>(null)
  const [focusedTierId, setFocusedTierId] = useState<string | null>(null)
  const layoutSeats = useStorefrontSeatStore((state) => state.layoutSeats)
  const selectedItems = useStorefrontSeatStore((state) => state.selectedItems)
  const selectedSeatRef = useRef(selectedSeat)
  selectedSeatRef.current = selectedSeat
  const [fieldShake, setFieldShake] = useState(0)
  const [fetchedMap, setFetchedMap] = useState<InteractiveVenueMap | null>(null)
  const [mapFetchDone, setMapFetchDone] = useState(
    hasInteractiveVenueMap(venueMap),
  )
  const reconstructedMap =
    !hasInteractiveVenueMap(venueMap) && seatingLayout.length > 0
      ? seatingLayoutToVenueMap(seatingLayout, venueMap)
      : null
  const liveMap = hasInteractiveVenueMap(venueMap)
    ? venueMap
    : hasInteractiveVenueMap(fetchedMap)
      ? fetchedMap
      : hasInteractiveVenueMap(reconstructedMap)
        ? reconstructedMap
        : fetchedMap
  const mapLoading = !hasInteractiveVenueMap(liveMap) && !mapFetchDone
  const [loadedUnitsBySector, setLoadedUnitsBySector] = useState<
    Record<string, EventSeatingUnit[]>
  >({})
  const loadedUnitsRef = useRef(loadedUnitsBySector)
  loadedUnitsRef.current = loadedUnitsBySector
  const [liveOccupancy, setLiveOccupancy] = useState<Record<string, SeatStatus>>(
    {},
  )
  const [occupancyEventId, setOccupancyEventId] = useState(eventId)
  if (eventId !== occupancyEventId) {
    setOccupancyEventId(eventId)
    setLiveOccupancy({})
  }
  const applyOccupancyPatch = useCallback((patch: Record<string, SeatStatus>) => {
    setLiveOccupancy((current) => ({ ...current, ...patch }))
  }, [])
  useSeatingOccupancyRealtime(eventId, applyOccupancyPatch, "tunnel")
  const buyer = useCheckoutStore((state) => state.buyer)
  const setBuyer = useCheckoutStore((state) => state.setBuyer)
  const buyerForm = useForm<CheckoutBuyerInfo>({
    defaultValues: {
      buyerName: initialBuyer?.buyerName ?? buyer.buyerName,
      buyerDni: initialBuyer?.buyerDni ?? buyer.buyerDni,
      buyerEmail: initialBuyer?.buyerEmail ?? buyer.buyerEmail,
      buyerPhone: initialBuyer?.buyerPhone ?? buyer.buyerPhone,
    },
    resolver: zodResolver(checkoutBuyerFormSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    criteriaMode: "all",
    shouldFocusError: true,
  })
  const holdExpiresAt = useCheckoutStore((state) =>
    state.eventId === eventId ? state.holdExpiresAt : null,
  )
  const quantities = useCheckoutStore((state) => state.quantities)
  const setQuantities = useCheckoutStore((state) => state.setQuantities)
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
  const checkoutDateCards = useMemo(
    () => listCheckoutDateCards(scheduleDays, displayTiers),
    [displayTiers, scheduleDays],
  )
  const defaultDateId = useMemo(
    () =>
      selectedDayId &&
      checkoutDateCards.some((card) => card.dateId === selectedDayId)
        ? selectedDayId
        : defaultCheckoutDateId(checkoutDateCards, displayTiers),
    [checkoutDateCards, displayTiers, selectedDayId],
  )
  const [selectedDateId, setSelectedDateId] = useState<string | null>(
    defaultDateId,
  )
  const selectedDateStillValid =
    Boolean(selectedDateId) &&
    checkoutDateCards.some((card) => card.dateId === selectedDateId)
  if (!selectedDateStillValid && selectedDateId !== defaultDateId) {
    setSelectedDateId(defaultDateId)
  }
  const funnelTiers = displayTiers
  const [appliedPromo, setAppliedPromo] = useState<ValidatedPromo | null>(null)
  const [selectedProvider, setSelectedProvider] =
    useState<CheckoutPaymentProvider>("mercadopago")
  const storedRef = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("popstate", onChange)
      return () => window.removeEventListener("popstate", onChange)
    },
    () =>
      extractAffiliateCode(new URLSearchParams(window.location.search)) ??
      getStoredReferralCode(),
    () => null,
  )

  const restoredIntent = useRef(false)
  const [intentRestored, setIntentRestored] = useState(false)

  useEffect(() => {
    if (!initialBuyer) return
    const current = useCheckoutStore.getState().buyer
    if (
      current.buyerName ||
      current.buyerDni ||
      current.buyerEmail ||
      current.buyerPhone
    ) {
      return
    }
    setBuyer({
      buyerName: initialBuyer.buyerName ?? "",
      buyerDni: initialBuyer.buyerDni ?? "",
      buyerEmail: initialBuyer.buyerEmail ?? "",
      buyerPhone: initialBuyer.buyerPhone ?? "",
    })
  }, [initialBuyer, setBuyer])

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
    const bind = () => useStorefrontSeatStore.getState().bindEvent(eventId)
    if (useStorefrontSeatStore.persist.hasHydrated()) {
      bind()
      return
    }
    return useStorefrontSeatStore.persist.onFinishHydration(bind)
  }, [eventId])

  useEffect(() => {
    return () => {
      const seat = selectedSeatRef.current
      if (seat) void releaseSeatingUnitCartHold(eventId, seat.seatingUnitId)
    }
  }, [eventId])

  const checkoutTierInput = useMemo(
    () =>
      funnelTiers.map((tier) => ({
        id: tier.id,
        name: tier.name,
        price: tier.price,
        available: tier.available,
        seatingSectorId: tier.seatingSectorId,
        layoutType: tier.layoutType,
      })),
    [funnelTiers],
  )
  const mapDrivenTierIds = useRef(new Set<string>())

  const resolveItemTierId = useCallback(
    (item: StorefrontSelectedItem) => {
      const sectorName = item.name.split(" · ")[0] ?? item.name
      const direct = resolveTierIdForUniversalSector(
        item.sectorId ?? item.id,
        sectorName,
        checkoutTierInput,
      )
      if (direct) return direct
      const key = (item.sectorId ?? "").trim().toLowerCase()
      const priced = zoneTierPricing.find((row) => {
        const sectorKey = row.sectorKey.trim().toLowerCase()
        return (
          sectorKey === key ||
          sectorKey === sectorName.toLowerCase() ||
          sectorKey === item.name.trim().toLowerCase()
        )
      })
      if (priced) return priced.ticketTierId
      if (item.type === "table") {
        const tableTiers = checkoutTierInput.filter(
          (tier) => tier.layoutType === "table_combo",
        )
        if (tableTiers.length === 1) return tableTiers[0]?.id ?? null
      }
      return null
    },
    [checkoutTierInput, zoneTierPricing],
  )

  useEffect(() => {
    const counts: Record<string, number> = {}
    for (const item of selectedItems) {
      if (item.type === "seat" || item.type === "table") continue
      const tierId = resolveItemTierId(item)
      if (!tierId) continue
      counts[tierId] =
        (counts[tierId] ?? 0) + storefrontLineSkuQuantity(item)
    }
    const nextDriven = new Set(Object.keys(counts))
    setQuantities((current) => {
      let changed = false
      const next = { ...current }
      for (const [tierId, target] of Object.entries(counts)) {
        const tier = displayTiers.find((item) => item.id === tierId)
        const drivenByTable = selectedItems.some(
          (item) => item.type === "table" && resolveItemTierId(item) === tierId,
        )
        const max = Math.min(
          purchaseCapForLayout(
            drivenByTable ? "table_combo" : tier?.layoutType,
            maxTicketsPerUser,
          ),
          Math.max(0, tier?.available ?? target),
        )
        const clamped = Math.min(target, max)
        if ((next[tierId] ?? 0) !== clamped) {
          next[tierId] = clamped
          changed = true
        }
      }
      for (const tierId of mapDrivenTierIds.current) {
        if (!nextDriven.has(tierId) && (next[tierId] ?? 0) !== 0) {
          next[tierId] = 0
          changed = true
        }
      }
      mapDrivenTierIds.current = nextDriven
      return changed ? next : current
    })
  }, [checkoutTierInput, displayTiers, maxTicketsPerUser, resolveItemTierId, selectedItems, setQuantities, zoneTierPricing])

  useEffect(() => {
    function restoreIntent() {
      if (restoredIntent.current) return
      restoredIntent.current = true
      const store = useCheckoutStore.getState()
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
            if (!hold.success) return
            const next = minReservedUntil(
              useCheckoutStore.getState().holdExpiresAt,
              hold.reservedUntil,
            )
            if (next) useCheckoutStore.getState().setHoldExpiresAt(next)
          },
        )
      }
      void getGaCartHold(eventId).then((hold) => {
        if (hold.success) {
          const next = minReservedUntil(
            useCheckoutStore.getState().holdExpiresAt,
            hold.reservedUntil,
          )
          if (next) useCheckoutStore.getState().setHoldExpiresAt(next)
          return
        }
        if (!useCheckoutStore.getState().selectedSeat) {
          useCheckoutStore.getState().setHoldExpiresAt(null)
        }
      })
      void listCartHolds(eventId).then((result) => {
        const source = result.success ? "server" : "unavailable"
        const holds = result.success ? result.holds : []
        const seatStore = useStorefrontSeatStore.getState()
        const nextItems = rehydrateSelectedItemsFromHolds({
          items: seatStore.selectedItems,
          holds,
          source,
          resolveHoldItem: (hold) => {
            const id = hold.layout_item_id || hold.seating_unit_id
            if (!id) return null
            return {
              id,
              name: hold.label?.trim() || "Lugar reservado",
              type: "table",
              price: 0,
              capacity: 1,
            }
          },
        })
        if (
          nextItems.length !== seatStore.selectedItems.length ||
          nextItems.some(
            (item, index) => item.id !== seatStore.selectedItems[index]?.id,
          )
        ) {
          seatStore.replaceSelectedItems(nextItems)
        }
        const fromHolds = earliestHoldExpiry(holds)
        if (fromHolds) {
          const next = minReservedUntil(
            useCheckoutStore.getState().holdExpiresAt,
            fromHolds,
          )
          if (next) useCheckoutStore.getState().setHoldExpiresAt(next)
        }
      })
      if (!hasCheckoutIdentity(currentUserId, store.mode)) return
      const action = store.consumePendingAction()
      if (action === "open_map") {
        queueMicrotask(() => {
          if (hasInteractiveMapProp) {
            useCheckoutStore.getState().setSeatSheetOpen(true)
            return
          }
          setShowSeatFlow(true)
        })
      }
    }

    function tryRestore() {
      if (
        !useCheckoutStore.persist.hasHydrated() ||
        !useStorefrontSeatStore.persist.hasHydrated()
      ) {
        return
      }
      restoreIntent()
    }

    tryRestore()
    const unsubCheckout =
      useCheckoutStore.persist.onFinishHydration(tryRestore)
    const unsubSeat =
      useStorefrontSeatStore.persist.onFinishHydration(tryRestore)
    return () => {
      unsubCheckout?.()
      unsubSeat?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot cart restore
  }, [currentUserId, eventId, tiers])

  function enterPaymentHold(result: {
    initPoint?: string
    paymentUrl?: string
  }) {
    const paymentUrl = result.paymentUrl ?? result.initPoint
    if (!paymentUrl?.trim()) {
      toast.error("No se pudo iniciar el pago", {
        description:
          "La pasarela no confirmó la intención de pago. Intentá de nuevo.",
      })
      return
    }
    redirectToCheckoutPaymentOrToast(paymentUrl)
  }

  const resolvedRef = referralCode?.trim() || storedRef
  const loginHref = publicEventLoginPath({ id: eventId, slug: eventSlug })
  const identityReady = hasCheckoutIdentity(currentUserId, checkoutMode)
  const panelBodyRef = useRef<HTMLDivElement>(null)

  function persistCheckoutCart() {
    useCheckoutStore.getState().rememberCart({
      eventId,
      eventSlug,
      quantities,
      selectedSeat,
      buyer,
      subtotal: cartSubtotal,
      holdExpiresAt: useCheckoutStore.getState().holdExpiresAt,
    })
  }

  function requestIdentity(action: "open_map" | "pay") {
    persistCheckoutCart()
    useCheckoutStore.getState().setPendingAction(action)
    useCheckoutStore.getState().setIdentityOpen(true)
  }

  async function ensureGuestAuthForHold(): Promise<boolean> {
    const mode = useCheckoutStore.getState().mode
    if (!hasCheckoutIdentity(currentUserId, mode)) {
      requestIdentity("open_map")
      toast.error(
        "Elegí ingresar o continuar como invitado para reservar.",
      )
      return false
    }
    return true
  }

  function goToLogin() {
    useCheckoutStore.getState().chooseAccount(eventId, eventSlug)
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
    useCheckoutStore.getState().chooseGuest(eventId, eventSlug)
    persistCheckoutCart()
    const action = useCheckoutStore.getState().consumePendingAction()
    useCheckoutStore.getState().setIdentityOpen(false)
    if (action === "open_map") {
      if (hasInteractiveMap) {
        useCheckoutStore.getState().setSeatSheetOpen(true)
      } else {
        setShowSeatFlow(true)
      }
    } else if (action === "pay") {
      setCheckoutStep("details")
    }
  }

  const hasInteractiveMap =
    hasInteractiveMapProp || hasInteractiveVenueMap(liveMap)
  useLockBodyScroll(showSeatFlow)

  const hasSeatingFlow =
    seatingSectorSummaries.length > 0 ||
    seatingUnits.length > 0 ||
    seatingLayout.length > 0 ||
    tiers.some((tier) => tier.layoutType !== "general")

  const checkoutGroups = useMemo(
    () => groupCheckoutTiers(funnelTiers),
    [funnelTiers],
  )
  const availableExtras = checkoutGroups.addon.filter(
    (tier) => tier.available > 0,
  )

  const visibleZoneId =
    focusedZoneId && selectedItems.some((item) => item.id === focusedZoneId)
      ? focusedZoneId
      : (selectedItems.find((item) => item.type === "zone")?.id ?? null)

  const priceBySectorId = useMemo(() => {
    const prices: Record<string, number> = {}
    for (const tier of funnelTiers) {
      if (Number.isFinite(tier.price)) {
        if (tier.seatingSectorId) prices[tier.seatingSectorId] = tier.price
        if (tier.name.trim()) prices[tier.name.trim()] = tier.price
      }
    }
    return prices
  }, [funnelTiers])
  const liveSelectedItems = useMemo(
    () => hydrateStorefrontItemsFromMap(selectedItems, liveMap, priceBySectorId),
    [liveMap, priceBySectorId, selectedItems],
  )

  useEffect(() => {
    if (!intentRestored || !liveMap) return

    function applyHydratedItems(items: StorefrontSelectedItem[]) {
      const seatStore = useStorefrontSeatStore.getState()
      const hydrated = hydrateStorefrontItemsFromMap(
        items,
        liveMap,
        priceBySectorId,
      )
      const same =
        hydrated.length === seatStore.selectedItems.length &&
        hydrated.every((item, index) => {
          const current = seatStore.selectedItems[index]
          return (
            current?.id === item.id &&
            current.name === item.name &&
            current.price === item.price &&
            current.sellMode === item.sellMode &&
            current.priceMode === item.priceMode
          )
        })
      if (!same) seatStore.replaceSelectedItems(hydrated)
    }

    applyHydratedItems(useStorefrontSeatStore.getState().selectedItems)

    let cancelled = false
    void listCartHolds(eventId).then((result) => {
      if (cancelled) return
      const source = result.success ? "server" : "unavailable"
      const holds = result.success ? result.holds : []
      const seatStore = useStorefrontSeatStore.getState()
      const merged = rehydrateSelectedItemsFromHolds({
        items: seatStore.selectedItems,
        holds,
        source,
        resolveHoldItem: (hold) => {
          const ids = [hold.layout_item_id, hold.seating_unit_id].filter(
            (id): id is string => Boolean(id),
          )
          for (const id of ids) {
            const fromMap = resolveStorefrontItemFromMap(
              liveMap,
              id,
              priceBySectorId,
            )
            if (fromMap) return fromMap
          }
          const id = hold.layout_item_id || hold.seating_unit_id
          if (!id) return null
          return {
            id,
            name: hold.label?.trim() || "Lugar reservado",
            type: "table",
            price: 0,
            capacity: 1,
          }
        },
      })
      applyHydratedItems(merged)
    })
    return () => {
      cancelled = true
    }
  }, [currentUserId, eventId, intentRestored, liveMap, priceBySectorId])

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

  const occupancyBySeatId = useMemo(
    () => ({
      ...occupancyFromSeatingUnits(
        mergedSeatingUnits.map((unit) => ({
          layoutItemId: unit.layoutItemId,
          status: unit.status,
          reservedUntil: unit.reservedUntil,
        })),
      ),
      ...liveOccupancy,
    }),
    [liveOccupancy, mergedSeatingUnits],
  )

  const soldOutZoneIds = useMemo(() => {
    const zones = liveMap?.zones ?? []
    if (zones.length === 0) return []
    const seats = liveMap ? flattenSeatsForAvailability(liveMap) : []
    const tierRefs = funnelTiers.map((tier) => ({
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
        const tier = funnelTiers.find((item) => item.id === tierId)
        const summary = seatingSectorSummaries.find(
          (row) => row.sectorId === zone.id || row.sectorName === zone.name,
        )
        return isCategorySoldOut({
          requiresMap: true,
          stock: tier?.available ?? 0,
          categoryId: zone.id,
          seatingSectorId: tier?.seatingSectorId ?? zone.id,
          categoryName: zone.name,
          seats,
          occupancyBySeatId,
          summaryAvailable: summary?.available,
          mapReady: Boolean(liveMap),
        })
      })
      .map((zone) => zone.id)
  }, [funnelTiers, liveMap, occupancyBySeatId, seatingSectorSummaries])
  const heldSeatIds = useMemo(() => {
    const ids = new Set<string>()
    for (const item of selectedItems) {
      if (item.id) ids.add(item.id)
    }
    for (const seat of layoutSeats) {
      if (seat.id) ids.add(seat.id)
    }
    if (selectedSeat) {
      ids.add(selectedSeat.seatingUnitId)
      const unit = mergedSeatingUnits.find(
        (item) => item.id === selectedSeat.seatingUnitId,
      )
      if (unit?.layoutItemId) ids.add(unit.layoutItemId)
    }
    return [...ids]
  }, [layoutSeats, mergedSeatingUnits, selectedItems, selectedSeat])

  const universalPayload = useMemo(() => {
    if (!hasSeatingFlow) return null
    return buildUniversalSeatPayloadForCheckout({
      venueId: venueId ?? `event-${eventId}`,
      venueName: venueName ?? eventTitle,
      seatingLayout: resolvedSeatingLayout,
      seatingBackgroundUrl,
      capacity: venueCapacity ?? undefined,
      tiers: funnelTiers.map((tier) => ({
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
      maxPerUser:
        resolvePurchaseLimit(maxTicketsPerUser) ??
        ABSOLUTE_MAX_ITEMS_PER_PURCHASE,
    })
  }, [
    eventId,
    eventTitle,
    hasSeatingFlow,
    maxTicketsPerUser,
    seatingBackgroundUrl,
    resolvedSeatingLayout,
    seatingSectorSummaries,
    funnelTiers,
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
              purchaseCapForLayout(tier.layoutType, maxTicketsPerUser),
              Math.max(0, tier.available),
            ),
          }
        })
        .filter(
          (tier) =>
            tier.quantity > 0 && isQuantityInventoryType(tier.inventoryType),
        ),
    [displayTiers, maxTicketsPerUser, quantities],
  )

  const extraNumbered = selectedSeat ? Math.max(0, layoutSeats.length - 1) : 0
  const seatLineCount = (selectedSeat ? 1 : layoutSeats.length) + extraNumbered
  const numberedSubtotal = selectedSeat
    ? selectedSeat.price +
      layoutSeats.slice(1).reduce((sum, seat) => sum + seat.price, 0)
    : layoutSeats.reduce((sum, seat) => sum + seat.price, 0)
  const mapTierIds = useMemo(() => {
    const ids = new Set<string>()
    for (const item of selectedItems) {
      if (item.type === "seat") continue
      const tierId = resolveItemTierId(item)
      if (tierId) ids.add(tierId)
    }
    return ids
  }, [resolveItemTierId, selectedItems])
  const extraQuantitySubtotal = selection
    .filter((tier) => !mapTierIds.has(tier.id))
    .reduce((sum, tier) => sum + tier.subtotal, 0)
  const extraQuantityCount = selection
    .filter((tier) => !mapTierIds.has(tier.id))
    .reduce((sum, tier) => sum + tier.quantity, 0)
  const hasMapSeats = selectedItems.some((item) => item.type === "seat")
  const numberedExtra = hasMapSeats ? 0 : numberedSubtotal
  const numberedExtraCount = hasMapSeats ? 0 : seatLineCount
  const totalMapSelectedItemsPrice = Math.max(
    storefrontSelectionTotal(liveSelectedItems),
    storefrontSelectionTotal(selectedItems),
  )
  const totalGeneralTicketsPrice = extraQuantitySubtotal + numberedExtra
  const ticketsSubtotal = roundMoney(
    totalMapSelectedItemsPrice + totalGeneralTicketsPrice,
  )
  const totalTickets = Math.max(
    storefrontSelectionCount(liveSelectedItems),
    storefrontSelectionCount(selectedItems),
  ) + extraQuantityCount + numberedExtraCount
  const hasMapSelection =
    selectedItems.length > 0 || liveSelectedItems.length > 0
  // All-In: tier.price already includes Tokepass fee.
  const cartSubtotal = ticketsSubtotal
  const discountAmount = appliedPromo
    ? Math.min(appliedPromo.discountAmount, cartSubtotal)
    : 0
  const totalAmount = roundMoney(Math.max(0, cartSubtotal - discountAmount))
  const finalTotal = hasMapSelection
    ? Math.max(totalAmount, totalMapSelectedItemsPrice)
    : totalAmount
  const canProceedFromCart = hasMapSelection || finalTotal > 0
  const cartLines = useMemo<StorefrontCartLine[]>(() => {
    const seatLines = liveSelectedItems.map((item) => {
      const matched = displayTiers.filter(
        (tier) =>
          tier.seatingSectorId &&
          (tier.seatingSectorId === item.sectorId ||
            tier.seatingSectorId === item.id),
      )
      const datedMatch = selectedDateId
        ? matched.filter((tier) => ticketMatchesTab(tier, selectedDateId))
        : []
      const dateSource =
        datedMatch.length === 1
          ? datedMatch[0]
          : matched.length === 1
            ? matched[0]
            : null
      const dateId = dateSource
        ? resolveTicketDateMeta(dateSource).dateId
        : selectedDateId
      const dateLabel = dateSource
        ? ticketDateCartLabel(dateSource, scheduleDays)
        : scheduleDayCartLabel(dateId, scheduleDays)
      return {
        id: item.id,
        name: item.name,
        detail: formatSelectionChargeDetail({
          type: item.type,
          name: item.name,
          capacity: item.capacity,
          unitPrice: item.price,
          quantity: 1,
          sellMode: item.sellMode,
          priceMode: item.priceMode,
        }),
        dateId,
        dateLabel,
        quantity: storefrontLineSkuQuantity(item),
        price: storefrontLineTotal(item),
      }
    })
    const ticketLines = selection
      .filter((tier) => !mapTierIds.has(tier.id))
      .map((tier) => {
        const meta = resolveTicketDateMeta(tier)
        return {
          id: cartTicketLineId(tier.id, meta.dateId),
          name: tier.name,
          detail: `${tier.quantity} ${tier.quantity === 1 ? "entrada" : "entradas"}`,
          dateId: meta.dateId,
          dateLabel: ticketDateCartLabel(tier, scheduleDays),
          quantity: tier.quantity,
          price: tier.subtotal,
        }
      })
    return [...seatLines, ...ticketLines]
  }, [
    displayTiers,
    liveSelectedItems,
    mapTierIds,
    scheduleDays,
    selectedDateId,
    selection,
  ])
  useEffect(() => {
    useCheckoutStore.getState().setCartTotals({
      totalAmount: finalTotal,
      itemsCount: Math.max(totalTickets, selectedItems.length),
    })
    useCheckoutStore.getState().setCartLines(cartLines)
  }, [cartLines, finalTotal, selectedItems.length, totalTickets])
  const visibleStep: CheckoutFlowStep =
    canProceedFromCart ? checkoutStep : "tickets"

  useEffect(() => {
    if (!portalReady) return
    useCheckoutStore.getState().rememberCart({
      eventId,
      eventSlug,
      quantities,
      selectedSeat,
      buyer,
      subtotal: finalTotal,
      holdExpiresAt: useCheckoutStore.getState().holdExpiresAt,
    })
  }, [
    buyer,
    eventId,
    eventSlug,
    finalTotal,
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

  useEffect(() => {
    return useCheckoutStore.subscribe((state, previous) => {
      if (
        previous.selectedSeat &&
        previous.selectedSeat.seatingUnitId !==
          state.selectedSeat?.seatingUnitId
      ) {
        void releaseSeatingUnitCartHold(
          eventId,
          previous.selectedSeat.seatingUnitId,
        )
      }
      if (previous.holdExpiresAt && !state.holdExpiresAt) {
        setAppliedPromo(null)
      }
      const hadGa = Object.values(previous.quantities).some((qty) => qty > 0)
      const hasGa = Object.values(state.quantities).some((qty) => qty > 0)
      if (hadGa && !hasGa) {
        void releaseGaCartHolds(eventId)
      }
      for (const [tierId, qty] of Object.entries(previous.quantities)) {
        if (qty > 0 && (state.quantities[tierId] ?? 0) === 0) {
          const related = useStorefrontSeatStore
            .getState()
            .selectedItems.filter(
              (item) =>
                item.type !== "seat" && resolveItemTierId(item) === tierId,
            )
          for (const item of related) {
            useStorefrontSeatStore.getState().removeSelectedItem(item.id)
          }
        }
      }
    })
    // resolveItemTierId reads live map/tier closures; subscribe is event-scoped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  function updateQuantity(tierId: string, next: number, max: number) {
    if (purchaseLocked) return
    const currentQty = quantities[tierId] ?? 0
    const clamped = Math.min(Math.max(0, next), max)
    const limit = resolvePurchaseLimit(maxTicketsPerUser)
    if (limit != null && clamped > currentQty) {
      const otherCount = Math.max(0, totalTickets - currentQty)
      if (otherCount + clamped > limit) {
        toast.error(storefrontLimitMessage())
        return
      }
    }
    setQuantities((current) => ({
      ...current,
      [tierId]: clamped,
    }))
    const related = selectedItems.filter(
      (item) => item.type !== "seat" && resolveItemTierId(item) === tierId,
    )
    const store = useStorefrontSeatStore.getState()
    if (clamped === 0) {
      for (const item of related) store.removeSelectedItem(item.id)
      return
    }
    if (related.length === 1) {
      store.patchSelectedItem(related[0]!.id, { capacity: Math.max(1, clamped) })
    }
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

  function seatingLineFromUnit(
    unit: EventSeatingUnit,
    fallback?: {
      tierId: string
      sectorKey?: string | null
      tableNumber?: number | null
    },
  ) {
    const tableMatch = String(unit.label ?? "").match(/(\d+)/)
    return {
      tierId: fallback?.tierId ?? unit.tierId,
      quantity: 1,
      seatingUnitId: unit.id,
      sectorKey: fallback?.sectorKey ?? unit.sectorId,
      tableNumber:
        fallback?.tableNumber ?? (tableMatch ? Number(tableMatch[1]) : null),
    }
  }

  function buildCheckoutItems(extraAddonId?: string) {
    const seatedById = new Map<
      string,
      {
        tierId: string
        quantity: number
        seatingUnitId: string
        sectorKey?: string | null
        tableNumber?: number | null
      }
    >()

    function addSeatedLine(line: {
      tierId: string
      quantity: number
      seatingUnitId: string
      sectorKey?: string | null
      tableNumber?: number | null
    }) {
      if (seatedById.has(line.seatingUnitId)) return
      seatedById.set(line.seatingUnitId, line)
    }

    if (selectedSeat) {
      const unit = mergedSeatingUnits.find(
        (item) => item.id === selectedSeat.seatingUnitId,
      )
      addSeatedLine(
        unit
          ? seatingLineFromUnit(unit, selectedSeat)
          : {
              tierId: selectedSeat.tierId,
              quantity: 1,
              seatingUnitId: selectedSeat.seatingUnitId,
              sectorKey: selectedSeat.sectorKey,
              tableNumber: selectedSeat.tableNumber,
            },
      )
    }

    for (const item of selectedItems) {
      if (item.type !== "seat" && item.type !== "table") continue
      const unit =
        mergedSeatingUnits.find((row) => row.id === item.id) ??
        seatIdByLayoutItem.get(item.id)
      if (unit) {
        addSeatedLine(seatingLineFromUnit(unit))
        continue
      }
      const resolvedTierId = resolveItemTierId(item)
      if (
        resolvedTierId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          item.id,
        )
      ) {
        addSeatedLine({
          tierId: resolvedTierId,
          quantity: 1,
          seatingUnitId: item.id,
          sectorKey: item.sectorId ?? null,
          tableNumber: item.number ?? null,
        })
      }
    }

    for (const seat of layoutSeats) {
      const unit =
        mergedSeatingUnits.find((row) => row.id === seat.id) ??
        seatIdByLayoutItem.get(seat.id)
      if (!unit) continue
      addSeatedLine(seatingLineFromUnit(unit))
    }

    const items = [
      ...seatedById.values(),
      ...selection.map((tier) => ({
        tierId: tier.id,
        quantity: tier.quantity,
      })),
    ]
    const covered = new Set(items.map((item) => item.tierId))
    const mapCounts: Record<string, number> = {}
    for (const item of selectedItems) {
      if (item.type === "seat" || item.type === "table") continue
      const tierId = resolveItemTierId(item)
      if (!tierId || covered.has(tierId)) continue
      mapCounts[tierId] =
        (mapCounts[tierId] ?? 0) + Math.max(1, Math.floor(item.capacity) || 1)
    }
    for (const [tierId, quantity] of Object.entries(mapCounts)) {
      items.push({ tierId, quantity })
    }
    if (extraAddonId) {
      const existing = items.find((item) => item.tierId === extraAddonId)
      if (existing) existing.quantity += 1
      else items.push({ tierId: extraAddonId, quantity: 1 })
    }
    return items
  }

  async function runCheckoutBusy(task: () => Promise<void> | void) {
    if (ctaBusyRef.current || purchaseLocked) return
    ctaBusyRef.current = true
    setCtaBusy(true)
    try {
      await task()
    } finally {
      ctaBusyRef.current = false
      setCtaBusy(false)
    }
  }

  function clearConflictingCheckoutSelection() {
    useStorefrontSeatStore.getState().clearSelectedItems()
    setSelectedSeat(null)
  }

  function applyCheckoutActionError(error: string, fallbackTitle: string) {
    toastCheckoutError(error, fallbackTitle)
    if (isCheckoutStockConflict(error)) {
      clearConflictingCheckoutSelection()
    }
  }

  async function submitCheckout(
    extraAddonId?: string,
    sandbox = false,
    buyerOverride?: CheckoutBuyerInfo,
  ) {
    if (purchaseLocked) return
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
      value: finalTotal,
      numItems: items.reduce((sum, item) => sum + item.quantity, 0),
    })

    const fallbackTitle = sandbox
      ? "No se pudo completar la compra de prueba"
      : "No se pudo iniciar el pago"

    try {
      if (!currentUserId) {
        const authed = await ensureGuestCheckoutSession()
        if (!authed) {
          requestIdentity("pay")
          toast.error("Elegí ingresar o continuar como invitado para pagar.")
          return
        }
      }
      if (!(await lockCheckoutStock())) return

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
            {
              paymentProvider: selectedProvider,
              deviceHash: getOrCreateDeviceHash(),
              dwellMs: getCheckoutDwellMs(),
            },
          )

      if (!result.success) {
        if (result.error === "auth_required") {
          persistCheckoutCart()
          toast.error("Ingresá para pagar. Tu selección está guardada.")
          router.push(loginHref)
          return
        }
        if (result.error === "phase_rollover" && result.phaseRollover) {
          applyPhaseRollover(result.phaseRollover)
          router.refresh()
          return
        }
        applyCheckoutActionError(result.error, fallbackTitle)
        router.refresh()
        return
      }

      if (sandbox) {
        toast.success("Compra de prueba lista")
      }
      enterPaymentHold(result)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "checkout_failed"
      applyCheckoutActionError(message, fallbackTitle)
      router.refresh()
    }
  }

  async function goToDetailsStep() {
    if (!canProceedFromCart || purchaseLocked) return
    const firstSeat = layoutSeats[0]
    if (firstSeat && !selectedSeat) {
      handleUniversalContinue(
        {
          kind: "numbered",
          sectorId: firstSeat.sectorId,
          sectorName: firstSeat.sectorName,
          color: firstSeat.color,
          unitPrice: firstSeat.price,
          groupId: `${firstSeat.sectorId}-row-${firstSeat.row}`,
          groupName: `Fila ${firstSeat.row}`,
          seats: [{ id: firstSeat.id, label: `${firstSeat.row}-${firstSeat.number}` }],
        },
        { keepOpen: true },
      )
    }
    if (!(await lockCheckoutStock())) return
    if (availableExtras.length > 0 && !upsellSkipped) {
      setCheckoutStep("upsell")
      panelBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    await proceedToDetails()
  }

  async function proceedToDetails() {
    if (!(await lockCheckoutStock())) return
    if (!identityReady) {
      useCheckoutStore.getState().chooseGuest(eventId, eventSlug)
    }
    setCheckoutStep("details")
    panelBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })
  }

  function continueWithExtras() {
    void runCheckoutBusy(async () => {
      setUpsellSkipped(true)
      await proceedToDetails()
    })
  }

  function skipExtras() {
    for (const extra of availableExtras) {
      if ((quantities[extra.id] ?? 0) > 0) {
        updateQuantity(extra.id, 0, extra.available)
      }
    }
    void runCheckoutBusy(async () => {
      setUpsellSkipped(true)
      await proceedToDetails()
    })
  }

  function goToPaymentMethods() {
    if (!canProceedFromCart || purchaseLocked) return
    void buyerForm.handleSubmit(
      (values) => {
        setBuyer(values)
        buyerForm.reset(values)
        setCheckoutStep("payment")
        panelBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      },
      (formErrors) => {
        setFieldShake((current) => current + 1)
        onValidationError(firstCheckoutBuyerErrorField(formErrors))
      },
    )()
  }

  function focusSelectedZone(zone: VenueMapZone) {
    setFocusedZoneId(zone.id)
    setCheckoutStep("tickets")
    const tierId = resolveTierIdForUniversalSector(
      zone.id,
      zone.name,
      checkoutTierInput,
    )
    if (!tierId) {
      panelBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    const tier = displayTiers.find((item) => item.id === tierId)
    if (!tier || tier.available <= 0) {
      panelBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    setFocusedTierId(tierId)
    requestAnimationFrame(() => {
      panelBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })
    })
  }

  function handleImmersiveZoneSelect(zone: VenueMapZone) {
    if (purchaseLocked || soldOutZoneIds.includes(zone.id)) return
    const item = storefrontItemFromZone(zone, priceBySectorId)
    if (!item) return
    const result = useStorefrontSeatStore.getState().toggleSelectedItem(
      item,
      maxTicketsPerUser,
    )
    if (!result.ok) {
      toast.error(storefrontLimitMessage(result.reason))
      return
    }
    if (!result.added) {
      if (focusedZoneId === zone.id) setFocusedZoneId(null)
      return
    }
    focusSelectedZone(zone)
  }

  function applyZoneQuantity(sectorId: string, quantity: number) {
    const zone = (liveMap?.zones ?? []).find((item) => item.id === sectorId)
    const sectorName =
      zone?.name ??
      liveMap?.sectors.find((item) => item.id === sectorId)?.name ??
      ""
    if (zone) {
      const result = useStorefrontSeatStore.getState().upsertSelectedItem(
        {
          id: zone.id,
          name: zone.name,
          type: "zone",
          price: zone.price,
          capacity: Math.max(1, quantity),
          sectorId: zone.id,
          color: zone.color,
          sellMode: zone.sellMode,
          priceMode: zone.priceMode ?? venuePriceModeFromSellMode(zone.sellMode),
        },
        maxTicketsPerUser,
      )
      if (!result.ok) {
        toast.error(storefrontLimitMessage(result.reason))
        return
      }
      focusSelectedZone(zone)
      useStorefrontSeatStore.getState().pulseFocus([zone.id])
    } else {
      setFocusedZoneId(sectorId)
      setCheckoutStep("tickets")
    }
    const tierId = resolveTierIdForUniversalSector(
      sectorId,
      sectorName,
      checkoutTierInput,
    )
    if (!tierId) return
    const tier = displayTiers.find((item) => item.id === tierId)
    if (!tier || tier.available <= 0) return
    updateQuantity(
      tierId,
      Math.min(
        purchaseCapForLayout(tier.layoutType, maxTicketsPerUser),
        Math.max(1, quantity),
        tier.available,
      ),
      Math.min(
        purchaseCapForLayout(tier.layoutType, maxTicketsPerUser),
        Math.max(0, tier.available),
      ),
    )
    void lockCheckoutStock()
    setFocusedTierId(tierId)
  }

  function applyLayoutSeats(seats: StorefrontLayoutSeat[]) {
    const blocked = seats.find((seat) => {
      const live = resolveLiveVenueSeatStatus({
        mapStatus: "available",
        occupancy: occupancyBySeatId[seat.id],
        selected: false,
      })
      return live !== "available" && live !== "selected"
    })
    if (blocked) {
      toast.error("El lugar seleccionado ya no está disponible.")
      return
    }
    const store = useStorefrontSeatStore.getState()
    const result = store.setLayoutSeats(seats, maxTicketsPerUser)
    if (!result.ok) {
      toast.error(storefrontLimitMessage(result.reason))
      return
    }
    store.pulseFocus(seats.map((seat) => seat.id))
  }

  function applyAssignedTables(tables: VenueMapElement[]) {
    const blocked = tables.some((table) => {
      const chairs = table.seats ?? []
      if (chairs.length === 0) {
        const live = resolveLiveVenueSeatStatus({
          mapStatus: "available",
          occupancy: occupancyBySeatId[table.id],
          selected: false,
        })
        return live !== "available" && live !== "selected"
      }
      return chairs.some((seat) => {
        const live = resolveLiveVenueSeatStatus({
          mapStatus: seat.status,
          occupancy: occupancyBySeatId[seat.id],
          selected: false,
        })
        return live !== "available" && live !== "selected"
      })
    })
    if (blocked) {
      toast.error("El lugar seleccionado ya no está disponible.")
      return
    }
    const store = useStorefrontSeatStore.getState()
    const ids: string[] = []
    for (const table of tables) {
      const item = storefrontItemFromElement(table, priceBySectorId)
      if (!item) continue
      const result = store.upsertSelectedItem(item, maxTicketsPerUser)
      if (!result.ok) {
        toast.error(storefrontLimitMessage(result.reason))
        break
      }
      ids.push(table.id)
    }
    if (ids.length > 0) {
      store.pulseFocus(ids)
    }
  }

  function handlePrimaryCta() {
    if (ctaBusyRef.current || checkoutBusy || purchaseLocked) return
    if (visibleStep === "tickets") {
      void runCheckoutBusy(goToDetailsStep)
      return
    }
    if (visibleStep === "upsell") {
      continueWithExtras()
      return
    }
    if (visibleStep === "details") {
      goToPaymentMethods()
      return
    }
    handleConfirmPay()
  }

  function handleConfirmPay() {
    if (!canProceedFromCart || purchaseLocked) return
    if (!identityReady) {
      requestIdentity("pay")
      return
    }
    if (availableExtras.length > 0 && !upsellSkipped) {
      setCheckoutStep("upsell")
      return
    }
    void buyerForm.handleSubmit(
      (values) => {
        void runCheckoutBusy(() => submitCheckout(undefined, false, values))
      },
      (formErrors) => {
        setFieldShake((current) => current + 1)
        onValidationError(firstCheckoutBuyerErrorField(formErrors))
        setCheckoutStep("details")
      },
    )()
  }

  function handleSandboxReserve() {
    if (!sandboxEligible || !canProceedFromCart || purchaseLocked) {
      return
    }
    if (!identityReady) {
      requestIdentity("pay")
      return
    }
    void buyerForm.handleSubmit(
      (values) => {
        void runCheckoutBusy(() => submitCheckout(undefined, true, values))
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
    if (hasInteractiveMap) {
      useCheckoutStore.getState().setSeatSheetOpen(true)
      return
    }
    setShowSeatFlow(true)
    if (!identityReady) {
      requestIdentity("open_map")
    }
  }

  function goBackStep() {
    if (visibleStep === "payment") {
      setCheckoutStep("details")
      return
    }
    if (visibleStep === "details") {
      setCheckoutStep(availableExtras.length > 0 ? "upsell" : "tickets")
      return
    }
    if (visibleStep === "upsell") {
      setCheckoutStep("tickets")
    }
  }

  async function lockCheckoutStock(): Promise<boolean> {
    const items = selection.map((tier) => ({
      tierId: tier.id,
      quantity: tier.quantity,
    }))
    if (items.length === 0) return true
    if (!(await ensureGuestAuthForHold())) return false
    if (!(await hasCheckoutAuthSession())) return true
    try {
      const result = await lockTickets(eventId, items)
      if (!result.success) {
        if (result.error === "auth_required") {
          requestIdentity("open_map")
          return false
        }
        applyCheckoutActionError(result.error, CHECKOUT_STOCK_TAKEN_MESSAGE)
        router.refresh()
        return false
      }
      const next = minReservedUntil(
        useCheckoutStore.getState().holdExpiresAt,
        result.reservedUntil,
      )
      if (next) useCheckoutStore.getState().setHoldExpiresAt(next)
      return true
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "out_of_stock"
      applyCheckoutActionError(message, CHECKOUT_STOCK_TAKEN_MESSAGE)
      router.refresh()
      return false
    }
  }

  function handleHoldExpiredAck() {
    onReservationExpired?.()
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
        Math.min(
          purchaseCapForLayout(tier?.layoutType, maxTicketsPerUser),
          Math.max(0, tier?.available ?? 0),
        ),
      )
      void lockCheckoutStock()
      setFocusedZoneId(selectionPayload.sectorId)
      setFocusedTierId(tierId)
      if (!options?.keepOpen && !hasInteractiveMap) returnToCheckout()
      return
    }

    const seats = selectionPayload.seats
    if (seats.length === 0) {
      toast.error("Elegí una ubicación para continuar.")
      return
    }
    const seatingCap = Math.max(MAX_TABLES_PER_PURCHASE, MAX_TICKETS_PER_PURCHASE)
    if (seats.length > seatingCap) {
      toast.error(
        `Podés reservar hasta ${seatingCap} ubicaciones numeradas por compra.`,
      )
      return
    }

    const releasePrevious = seats.length === 1

    async function applyNumbered(unit: EventSeatingUnit) {
      if (!(await ensureGuestAuthForHold())) return false
      if (unit.status !== "available" && unit.status !== "reserved") {
        toast.error("El lugar seleccionado ya no está disponible.")
        router.refresh()
        return false
      }
      const hold = await holdSeatingUnitForCart(eventId, unit.id)
      if (!hold.success && hold.error !== "auth_required") {
        if (hold.error === HIGH_DEMAND_LOCK_TIMEOUT) {
          toast.error(HIGH_DEMAND_LOCK_MESSAGE)
          return false
        }
        toast.error(
          hold.error === "not_materialized"
            ? "El inventario de esta zona todavía no está publicado."
            : hold.error === "out_of_stock"
              ? "El lugar seleccionado ya no está disponible."
              : hold.error,
        )
        router.refresh()
        return false
      }
      if (
        releasePrevious &&
        selectedSeat &&
        selectedSeat.seatingUnitId !== unit.id
      ) {
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
      if (hold.success) {
        useCheckoutStore.getState().setHoldExpiresAt(hold.reservedUntil)
      }
      setFocusedZoneId(selectionPayload.sectorId)
      setFocusedTierId(unit.tierId)
      return true
    }

    startTransition(async () => {
      for (const seat of seats) {
        const cached =
          (seat.seatingUnitId
            ? mergedSeatingUnits.find((unit) => unit.id === seat.seatingUnitId)
            : null) ?? seatIdByLayoutItem.get(seat.id)
        if (cached) {
          const ok = await applyNumbered(cached)
          if (!ok) return
          continue
        }
        if (!(await ensureGuestAuthForHold())) return
        const hold = await holdSeatingUnitForCartByLayoutItem(
          eventId,
          selectionPayload.sectorId,
          seat.id,
        )
        if (!hold.success) {
          if (hold.error === HIGH_DEMAND_LOCK_TIMEOUT) {
            toast.error(HIGH_DEMAND_LOCK_MESSAGE)
            return
          }
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
        const ok = await applyNumbered(unit)
        if (!ok) return
      }
      if (!options?.keepOpen && !hasInteractiveMap) returnToCheckout()
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
    showSeatFlow && !hasInteractiveMap ? (
      <div className="fixed inset-0 z-[80] flex h-dvh w-screen flex-col overflow-hidden overscroll-none bg-background">
        <AdaptiveSeatingFlow
          key={selectedDayId ?? "all"}
          takeover
          pending={controlsLocked}
          maxSelectable={maxTicketsPerUser}
          eventId={eventId}
          eventTitle={eventTitle}
          occupancyBySeatId={occupancyBySeatId}
          heldSeatIds={heldSeatIds}
          mapImageUrl={
            universalPayload?.mapImageUrl ?? seatingBackgroundUrl ?? null
          }
          venueMap={liveMap}
          priceBySectorId={priceBySectorId}
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

  const stepTitle =
    visibleStep === "tickets"
      ? "Elegí tu entrada"
      : visibleStep === "upsell"
        ? "Mejorá tu experiencia"
        : visibleStep === "details"
          ? "Confirmá tus datos"
          : "Confirmá el pago"
  const stepCta =
    visibleStep === "tickets"
      ? canProceedFromCart
        ? `Continuar con ${totalTickets || liveSelectedItems.length} ${
            (totalTickets || liveSelectedItems.length) === 1 ? "lugar" : "lugares"
          }`
        : "Continuar"
      : visibleStep === "upsell"
        ? "Sumar al pedido y continuar"
        : visibleStep === "details"
          ? "Continuar al pago"
          : `Confirmar y Pagar ${formatCurrency(finalTotal)}`

  const seatSelection = hasInteractiveMap
    ? {
        map: liveMap,
        eventId,
        heldSeatIds,
        occupancyBySeatId,
        priceBySectorId,
        selectedZoneId: visibleZoneId,
        unavailableZoneIds: soldOutZoneIds,
        eventTitle,
        sectors: universalPayload?.sectors ?? [],
        onAssignSeats: applyLayoutSeats,
        onAssignTables: applyAssignedTables,
        onAssignZoneQuantity: applyZoneQuantity,
        onSelectZone: handleImmersiveZoneSelect,
        onUniversalContinue: (payload: UniversalSeatSelection) =>
          handleUniversalContinue(payload, { keepOpen: true }),
        onConfirmed: () => {
          persistCheckoutCart()
          setHighlightContinue(true)
          window.setTimeout(() => setHighlightContinue(false), 2400)
        },
        sectorSummaries: seatingSectorSummaries.map((row) => ({
          sectorId: row.sectorId,
          sectorName: row.sectorName,
          available: row.available,
          tierId: row.tierId,
        })),
      }
    : null

  const showReservationTimer = Boolean(holdExpiresAt)

    const checkoutPanel = (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-x-hidden overflow-hidden bg-card text-card-foreground">
      <CheckoutTimer
        eventId={eventId}
        onAcknowledged={handleHoldExpiredAck}
      />
      <div
        ref={panelBodyRef}
        className="no-scrollbar min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
      >
        <CheckoutHeader
          step={visibleStep}
          holdExpiresAt={showReservationTimer ? holdExpiresAt : null}
          maxTicketsPerUser={maxTicketsPerUser}
          onBack={
            visibleStep === "tickets" && onLeaveCheckout
              ? onLeaveCheckout
              : goBackStep
          }
          backLabel={
            visibleStep === "tickets" && onLeaveCheckout
              ? "Volver al evento"
              : "Volver"
          }
        />
        <div
          className={cn(
            "mx-auto w-full max-w-7xl px-4 pt-1 sm:px-6 lg:px-8 lg:pt-6 lg:pb-10",
            visibleStep === "payment" ? "pb-8" : "pb-36",
          )}
        >
          {visibleStep !== "tickets" ? (
            <h2 className="mb-3 pt-2 text-lg font-black text-foreground md:mb-4 md:text-xl">
              {stepTitle}
            </h2>
          ) : null}
          <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-8">
            <div className="min-w-0 lg:col-span-7">
        <AnimatePresence mode="wait" initial={false}>
          {visibleStep === "tickets" ? (
            <motion.div
              key="tickets"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.28, ease: "easeInOut" }}
            >
              <motion.div
                key="ticket-list"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: "easeInOut" }}
              >
              <CheckoutTicketList
                tiers={funnelTiers}
                isPending={controlsLocked}
                hasSeatingFlow={hasSeatingFlow}
                hasInteractiveMap={hasInteractiveMap}
                scheduleDays={scheduleDays}
                maxTicketsPerUser={maxTicketsPerUser}
                selectedCount={totalTickets}
                includesGeneralAccess={mapIncludesGeneralAccess(liveMap)}
                focusedTierId={focusedTierId}
                mapLoading={
                  mapLoading &&
                  !hasInteractiveVenueMap(liveMap) &&
                  !seatingBackgroundUrl?.trim() &&
                  resolvedSeatingLayout.length === 0 &&
                  (universalPayload?.sectors.length ?? 0) === 0
                }
                selectedPlaceCount={liveSelectedItems.reduce(
                  (sum, item) => sum + Math.max(1, item.capacity || 1),
                  0,
                )}
                onQuantityChange={updateQuantity}
                onOpenSeatFlow={openSeatFlow}
                seatSelection={seatSelection}
                onPurchaseIntent={() => {
                  void runCheckoutBusy(goToDetailsStep)
                }}
                onClearSeat={() => {
                  const seat = selectedSeat
                  useCheckoutStore.getState().clearCart()
                  if (seat) {
                    void releaseSeatingUnitCartHold(eventId, seat.seatingUnitId)
                  }
                }}
                selectedDateId={selectedDateId}
                onSelectedDateIdChange={setSelectedDateId}
              />
              </motion.div>
            </motion.div>
          ) : visibleStep === "upsell" ? (
            <motion.div
              key="upsell"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.28, ease: "easeInOut" }}
            >
              <CheckoutUpsellStep
                extras={availableExtras}
                quantities={quantities}
                isPending={controlsLocked}
                onQuantityChange={updateQuantity}
                onContinueWithExtras={continueWithExtras}
                onSkipExtras={skipExtras}
              />
            </motion.div>
          ) : visibleStep === "details" ? (
            <motion.div
              key="details"
              id="checkout-buyer"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.28, ease: "easeInOut" }}
            >
              <CheckoutPaymentForm
                step="details"
                eventId={eventId}
                cartSubtotal={cartSubtotal}
                ticketsSubtotal={ticketsSubtotal}
                discountAmount={discountAmount}
                finalTotal={finalTotal}
                totalTickets={totalTickets}
                appliedPromo={appliedPromo}
                selectedProvider={selectedProvider}
                sandboxEligible={sandboxEligible}
                controlsLocked={controlsLocked}
                canProceedFromCart={canProceedFromCart}
                fieldShake={fieldShake}
                buyerErrors={buyerForm.formState.errors}
                onBuyerChange={(next) => {
                  setBuyer(next)
                  buyerForm.reset(next, {
                    keepDirty: true,
                    keepIsSubmitted: true,
                    keepTouched: true,
                  })
                  if (buyerForm.formState.isSubmitted) {
                    void buyerForm.trigger()
                  }
                }}
                onAppliedPromo={setAppliedPromo}
                onClearedPromo={() => setAppliedPromo(null)}
                onSelectProvider={setSelectedProvider}
                onSandboxReserve={handleSandboxReserve}
                onDetailsSubmit={goToPaymentMethods}
              />
            </motion.div>
          ) : (
            <motion.div
              key="payment"
              id="checkout-complete"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.28, ease: "easeInOut" }}
            >
              <CheckoutPaymentForm
                step="payment"
                eventId={eventId}
                cartSubtotal={cartSubtotal}
                ticketsSubtotal={ticketsSubtotal}
                discountAmount={discountAmount}
                finalTotal={finalTotal}
                totalTickets={totalTickets}
                appliedPromo={appliedPromo}
                selectedProvider={selectedProvider}
                sandboxEligible={sandboxEligible}
                controlsLocked={controlsLocked}
                canProceedFromCart={canProceedFromCart}
                fieldShake={fieldShake}
                buyerErrors={buyerForm.formState.errors}
                onBuyerChange={(next) => {
                  setBuyer(next)
                  buyerForm.reset(next, {
                    keepDirty: true,
                    keepIsSubmitted: true,
                    keepTouched: true,
                  })
                  if (buyerForm.formState.isSubmitted) {
                    void buyerForm.trigger()
                  }
                }}
                onAppliedPromo={setAppliedPromo}
                onClearedPromo={() => setAppliedPromo(null)}
                onSelectProvider={setSelectedProvider}
                onSandboxReserve={handleSandboxReserve}
                onDetailsSubmit={goToPaymentMethods}
                onConfirmPay={handlePrimaryCta}
                confirmPending={checkoutBusy}
                confirmLocked={purchaseLocked}
              />
            </motion.div>
          )}
        </AnimatePresence>
        </div>
        <div className="hidden min-h-0 lg:col-span-5 lg:block">
          <CheckoutSelectionSidebar
            seatSelection={visibleStep === "tickets" ? seatSelection : null}
            maxSelectable={maxTicketsPerUser}
            cta={{
              label: visibleStep === "tickets" ? "Continuar" : stepCta,
              showArrow: visibleStep !== "payment",
              pending: checkoutBusy,
              pendingLabel:
                visibleStep === "payment" ? "Preparando pago" : "Procesando",
              disabled: visibleStep === "tickets" && !canProceedFromCart,
              locked: purchaseLocked,
              pulse: highlightContinue,
              onClick: handlePrimaryCta,
            }}
          />
        </div>
        </div>
        </div>
      </div>

      <div className="mt-auto flex-none lg:hidden">
        <CheckoutFloatingBar
          variant="panel"
          hidden={visibleStep === "payment"}
          actionLabel={
            visibleStep === "tickets" ? "Continuar" : stepCta
          }
          showArrow={visibleStep !== "payment"}
          totalAmount={finalTotal}
          itemsCount={Math.max(totalTickets, liveSelectedItems.length)}
          disabled={visibleStep === "tickets" && !canProceedFromCart}
          pending={checkoutBusy}
          pendingLabel={
            visibleStep === "payment" ? "Preparando pago" : "Procesando"
          }
          locked={purchaseLocked}
          pulseCta={highlightContinue}
          prominentCta={
            visibleStep === "details" || visibleStep === "payment"
          }
          onPay={handlePrimaryCta}
          onEditMap={hasInteractiveMap ? openSeatFlow : undefined}
        />
      </div>
    </div>
  )

  const panelNode = (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-card",
        fillViewport
          ? "rounded-none border-0 shadow-none"
          : "rounded-3xl border border-border/50 shadow-2xl",
      )}
    >
      {checkoutPanel}
    </div>
  )

  return (
    <>
      {portalReady && seatFlowOverlay
        ? createPortal(seatFlowOverlay, document.body)
        : seatFlowOverlay}
      <CheckoutIdentity onLogin={goToLogin} onGuest={continueAsGuest} />
      {renderLayout ? (
        renderLayout({ map: null, panel: panelNode })
      ) : (
        panelNode
      )}
    </>
  )
}
