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
  type MouseEvent,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import {
  startCheckoutWithPayment,
  startSandboxCheckout,
  listCartHolds,
  holdSeatingUnitForCart,
  holdSeatingUnitForCartByLayoutItem,
  lockTickets,
  releaseGaCartHolds,
  releaseSeatingUnitCartHold,
} from "@/app/actions/checkout"
import type { ValidatedPromo } from "@/app/actions/coupons"
import type { CheckoutPromoterPreview } from "@/app/actions/promoters"
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
import { AppTakeover } from "@/components/ui/app-takeover"
import { CheckoutSelectionSidebar } from "@/components/public/checkout-selection-sidebar"
import { type CheckoutFlowStep } from "@/components/public/checkout-stepper"
import {
  formatSelectionChargeDetail,
  storefrontLineSkuQuantity,
} from "@/lib/checkout/charge-unit"
import {
  cartCompositeItemId,
  cartQuantityKey,
  generalLineTierId,
  isMapCartLine,
  parseCartCompositeItemId,
} from "@/lib/checkout/cart-item-identity"
import {
  comboScheduleIdsFromTier,
  isComboPackOffer,
} from "@/lib/checkout/combo-schedule"
import { cartPlaceLabel } from "@/lib/checkout/cart-lines"
import {
  cartItemDateString,
  cartItemScheduleId,
  cartItemSeatLabel,
} from "@/lib/checkout/cart-line-stamp"
import { CheckoutUpsellStep } from "@/components/public/checkout-upsell-step"
import {
  resolveCheckoutPaymentProvider,
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
  checkoutBuyerFormSchemaFor,
  getCheckoutBuyerFieldErrors,
  validateCheckoutBuyer,
  type CheckoutBuyerInfo,
} from "@/lib/checkout-buyer"
import {
  ABSOLUTE_MAX_ITEMS_PER_PURCHASE,
  mapPlaceSelectionCap,
  purchaseCapForTier,
  resolvePurchaseLimit,
  skuPurchaseMaxMessage,
  storefrontLimitMessage,
} from "@/lib/checkout-limits"
import { minReservedUntil } from "@/lib/checkout-hold"
import {
  isUndatedCheckoutOffer,
  partitionCheckoutTickets,
} from "@/lib/events/ticket-commerce-type"
import {
  HIGH_DEMAND_LOCK_MESSAGE,
  HIGH_DEMAND_LOCK_TIMEOUT,
} from "@/lib/checkout/lock-timeout"
import {
  MISSING_EVENT_DATE_ID,
  MISSING_EVENT_DATE_ID_MESSAGE,
  asHoldEventDateId,
  seatingUnitMatchesEventDate,
  storefrontItemMatchesSchedule,
  storefrontSelectionKey,
  withCheckoutEventDateId,
} from "@/lib/checkout/seat-hold-day"
import {
  cartLineQuantity,
  sumCartQuantities,
  toCartNumber,
} from "@/lib/checkout/cart"
import {
  cartHasPurchasableItems,
  resolveCheckoutProgressStep,
} from "@/lib/checkout/checkout-step-guard"
import { buildCheckoutActionItems } from "@/lib/checkout/build-checkout-items"
import {
  isCheckoutUuid,
  storefrontPlaceNeedsMappedLine,
} from "@/lib/checkout/storefront-checkout-items"
import {
  CHECKOUT_GENERIC_TOAST,
  CHECKOUT_NO_STOCK_INLINE,
  CHECKOUT_NO_STOCK_TOAST,
  CHECKOUT_TOAST_ERROR_STYLE,
  inferCheckoutTicketId,
  resolveCheckoutFeedback,
} from "@/lib/checkout/checkout-feedback"
import type { CheckoutCartItemInput } from "@/lib/validations/checkout"
import {
  SEAT_SELECTION_REQUIRED_MESSAGE,
  SEAT_UNAVAILABLE_MESSAGE,
  SECTOR_NOT_CONFIGURED_MESSAGE,
  isCheckoutConnectionNoise,
  isSeatSelectionRequiredError,
  isSeatUnavailableError,
  isSectorNotConfiguredError,
} from "@/lib/checkout/revalidate-seat-holds"
import { isQuantityCheckoutTier } from "@/lib/checkout/public-ticket-view"
import {
  mapSelectionUnitPrice,
  publicOfferPrice,
} from "@/lib/checkout/public-price"
import { selectableTicketStock } from "@/lib/checkout/ticket-stock"
import { buildTierUnitPriceIndex } from "@/lib/checkout/tier-price-index"
import { redirectToCheckoutPaymentOrToast } from "@/lib/checkout-redirect"
import { hasCheckoutIdentity } from "@/lib/checkout/identity"
import {
  getCheckoutCaptchaToken,
  getCheckoutDwellMs,
  getOrCreateDeviceHash,
} from "@/lib/checkout/client-security"
import { type DefaultTicketTab } from "@/lib/checkout/ticket-picker"
import {
  firstCheckoutBuyerErrorField,
  scrollToFirstInvalidCheckoutField,
} from "@/lib/checkout/validation-scroll"
import {
  applyPhaseRolloverToPhases,
  PHASE_ROLLOVER_MESSAGE,
  type PhaseRolloverInfo,
} from "@/lib/inventory/active-phase"
import {
  defaultCheckoutDateId,
  generalQuantityScheduleStamp,
  listCheckoutDateCards,
  quantityForPublicTier,
  resolveTicketDateMeta,
  scheduleDayCartLabel,
  ticketDateCartLabel,
  ticketMatchesTab,
  ticketVisibleOnCheckoutDay,
} from "@/lib/checkout/ticket-day-groups"
import { getStoredReferralCode, persistReferralCode } from "@/lib/referral"
import {
  resolveTicketSaleState,
  ticketSaleWindowError,
} from "@/lib/inventory/ticket-sale-window"
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
import { resolveLiveVenueMapForDay } from "@/lib/seating/live-venue-map-for-day"
import { classifyZoneClick } from "@/lib/seating/map-click-target"
import {
  eventNeedsInteractiveCanvas,
  ticketRequiresInteractiveMap,
} from "@/lib/seating/venue-map-pricing"
import {
  isCategorySoldOut,
  sectorStockFromSummary,
} from "@/lib/checkout/category-stock"
import { pickSectorSummaryForDay } from "@/lib/seating/seating-sector-summary"
import {
  mapIncludesGeneralAccess,
  parseVenueMap,
  venuePriceModeFromSellMode,
  type VenueMapElement,
} from "@/types/venue-map"
import { mergeInventoryOccupancy } from "@/lib/seating/inventory-seat-state"
import {
  occupancyFromSeatingUnits,
  resolveLiveVenueSeatStatus,
  seatingUnitsForComboDays,
  seatingUnitsForOccupancyDay,
} from "@/lib/seating/venue-map-occupancy"
import { useOptimisticSeatHolds } from "@/hooks/use-optimistic-seat-holds"
import { useSeatHoldsRealtime } from "@/hooks/use-seat-holds-realtime"
import { useSeatingOccupancyRealtime } from "@/hooks/use-seating-occupancy-realtime"
import { useEventCatalogRealtime } from "@/hooks/use-event-catalog-realtime"
import { ticketSelectorPatchFromRow } from "@/lib/storefront/event-catalog-realtime"
import {
  hydrateStorefrontItemsFromMap,
  storefrontItemFromElement,
  storefrontItemFromZone,
} from "@/lib/seating/storefront-selection"
import { formatCartTotal } from "@/lib/format"
import { centsToMoney, moneyToCents } from "@/lib/money/cents"
import { roundMoney } from "@/lib/pricing/all-in"
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

/** Survives remounts from Next.js refreshing the route after Server Actions. */
const restoredHoldCleanup = new Set<string>()
const gaReleaseAfterEmpty = new Set<string>()
const venueMapFetchByEvent = new Map<
  string,
  Promise<InteractiveVenueMap | null>
>()

function fetchPublicVenueMapOnce(eventId: string) {
  const cached = venueMapFetchByEvent.get(eventId)
  if (cached) return cached
  const request = getPublicEventVenueMap(eventId)
  venueMapFetchByEvent.set(eventId, request)
  return request
}

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
  /** Fracción decimal All-In (0.08 = 8%). Solo desglose visual; no se suma al total. */
  serviceChargeRate?: number
  /** Cargo fijo ARS por entrada paga (split All-In). */
  platformFixedFee?: number
  /** Código RRPP desde ?rrpp= / cookie — nunca se envía promoter_id al servidor */
  referralCode?: string | null
  seatingUnits?: EventSeatingUnit[]
  seatingSectorSummaries?: SeatingSectorSummary[]
  seatingBackgroundUrl?: string | null
  venueMap?: InteractiveVenueMap | null
  seatingMaps?: Array<{
    eventDateId: string | null
    map: InteractiveVenueMap
  }>
  hasInteractiveMap?: boolean
  seatingLayout?: VenueSeatingLayout
  venueId?: string | null
  venueName?: string | null
  venueCapacity?: number | null
  eventSlug?: string | null
  pixels?: EventPixelConfig
  sandboxEligible?: boolean
  isDraftPreview?: boolean
  previewKey?: string | null
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
  isOnline?: boolean
  acceptsMercadoPago?: boolean
  onReservationExpired?: () => void
  onLeaveCheckout?: () => void
  renderLayout?: (parts: { map: ReactNode; panel: ReactNode }) => ReactNode
}

function normalizeToastCopy(value: string) {
  return value.trim().replace(/\.+$/, "").toLocaleLowerCase("es-AR")
}

const CHECKOUT_REVIEW_LABEL = "Revisar datos"

function toastCheckoutStock(message = CHECKOUT_NO_STOCK_TOAST) {
  toast.error(message, { style: CHECKOUT_TOAST_ERROR_STYLE })
}

function toastCheckoutError(
  error: string,
  fallbackTitle: string,
  options?: { revealDetail?: boolean },
) {
  const technical =
    /invalid token|hydrat|undefined|cannot read|failed to fetch|networkerror|internal server/i.test(
      error,
    )
  if (technical && !options?.revealDetail) {
    toast.error(CHECKOUT_GENERIC_TOAST)
    return
  }
  if (error === HIGH_DEMAND_LOCK_TIMEOUT) {
    toast.error(HIGH_DEMAND_LOCK_MESSAGE)
    return
  }
  if (isSectorNotConfiguredError(error)) {
    toast.error(SECTOR_NOT_CONFIGURED_MESSAGE)
    return
  }
  if (isCheckoutConnectionNoise(error)) {
    toast.error("No se pudo reservar el stock. Probá de nuevo.")
    return
  }
  if (isSeatUnavailableError(error)) {
    toast.error(SEAT_UNAVAILABLE_MESSAGE)
    return
  }
  const feedback = resolveCheckoutFeedback(error)
  if (feedback.code === "ERR_NO_STOCK") {
    toastCheckoutStock(feedback.message)
    return
  }
  if (
    error === "El evento ya ha finalizado" ||
    error === "El evento o sector se encuentra agotado"
  ) {
    toast.error(error)
    return
  }
  const detail = error.trim()
  if (!detail || normalizeToastCopy(detail) === normalizeToastCopy(fallbackTitle)) {
    toast.error(fallbackTitle)
    return
  }
  toast.error(fallbackTitle, { description: detail })
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
  seatingMaps = [],
  hasInteractiveMap: hasInteractiveMapProp = false,
  seatingLayout = [],
  venueId = null,
  venueName = null,
  venueCapacity = null,
  eventSlug = null,
  sandboxEligible = false,
  isDraftPreview = false,
  previewKey = null,
  zoneTierPricing = [],
  purchaseLocked = false,
  selectedDayId = null,
  scheduleDays = [],
  serviceChargeRate = 0,
  platformFixedFee = 0,
  maxTicketsPerUser = null,
  fillViewport = false,
  isOnline = false,
  acceptsMercadoPago = true,
  onReservationExpired,
  onLeaveCheckout,
  renderLayout,
}: TicketSelectorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isProcessing, setIsProcessing] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const isProcessingRef = useRef(false)
  const checkoutAttemptKeyRef = useRef<string | null>(null)
  const checkoutAttemptCartRef = useRef("")
  const initiatedCheckoutRef = useRef(false)
  const checkoutBusy = isProcessing
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
  const requirePhoneRef = useRef(true)
  const [fetchedMap, setFetchedMap] = useState<InteractiveVenueMap | null>(null)
  const [realtimeMap, setRealtimeMap] = useState<InteractiveVenueMap | null>(
    null,
  )
  const hasPropVenueMap = hasInteractiveVenueMap(venueMap)
  const [clientMapFetchDone, setClientMapFetchDone] = useState(false)
  const mapFetchDone = hasPropVenueMap || clientMapFetchDone
  const reconstructedMap =
    !hasInteractiveVenueMap(venueMap) && seatingLayout.length > 0
      ? seatingLayoutToVenueMap(seatingLayout, venueMap)
      : null
  const fallbackMap = hasInteractiveVenueMap(realtimeMap)
    ? realtimeMap
    : hasInteractiveVenueMap(venueMap)
      ? venueMap
      : hasInteractiveVenueMap(fetchedMap)
        ? fetchedMap
        : hasInteractiveVenueMap(reconstructedMap)
          ? reconstructedMap
          : fetchedMap
  const mapLoading = !hasInteractiveVenueMap(fallbackMap) && !mapFetchDone
  const tierNeedsNumberedPlace = (tier: {
    seatingSectorId?: string | null
    layoutType?: string | null
    tierType?: string | null
    category?: string | null
  }) =>
    ticketRequiresInteractiveMap({
      seatingSectorId: tier.seatingSectorId,
      layoutType: tier.layoutType,
      tierType: tier.tierType,
      category: tier.category,
      map: fallbackMap,
    })
  const [loadedUnitsBySector, setLoadedUnitsBySector] = useState<
    Record<string, EventSeatingUnit[]>
  >({})
  const loadedUnitsRef = useRef(loadedUnitsBySector)
  loadedUnitsRef.current = loadedUnitsBySector
  const [liveOccupancy, setLiveOccupancy] = useState<Record<string, SeatStatus>>(
    {},
  )
  const [mapEventId, setMapEventId] = useState(eventId)
  if (eventId !== mapEventId) {
    setMapEventId(eventId)
    setLiveOccupancy({})
    setRealtimeMap(null)
  }
  const applyOccupancyPatch = useCallback((patch: Record<string, SeatStatus>) => {
    setLiveOccupancy((current) => mergeInventoryOccupancy(current, patch))
  }, [])
  useOptimisticSeatHolds({
    eventId,
    previewKey,
    selectedItems,
    applyOccupancyPatch,
  })
  useEffect(() => {
    useCheckoutStore.getState().setServiceChargeRule({
      rate: serviceChargeRate,
      fixedFee: platformFixedFee,
    })
  }, [platformFixedFee, serviceChargeRate])
  const buyer = useCheckoutStore((state) => state.buyer)
  const setBuyer = useCheckoutStore((state) => state.setBuyer)
  const buyerForm = useForm<CheckoutBuyerInfo>({
    defaultValues: {
      buyerName: initialBuyer?.buyerName ?? buyer.buyerName,
      buyerDni: initialBuyer?.buyerDni ?? buyer.buyerDni,
      buyerEmail: initialBuyer?.buyerEmail ?? buyer.buyerEmail,
      buyerPhone: initialBuyer?.buyerPhone ?? buyer.buyerPhone,
    },
    resolver: (values, context, options) =>
      zodResolver(
        checkoutBuyerFormSchemaFor({
          requirePhone: requirePhoneRef.current,
        }),
      )(values, context, options),
    mode: "onSubmit",
    reValidateMode: "onChange",
    criteriaMode: "all",
    shouldFocusError: true,
  })
  const reviewCheckoutForm = useCallback((field?: string | null) => {
    const values = buyerForm.getValues()
    const fieldToFocus =
      field ??
      firstCheckoutBuyerErrorField(
        getCheckoutBuyerFieldErrors(values, {
          requirePhone: requirePhoneRef.current,
        }),
      )
    window.setTimeout(() => {
      scrollToFirstInvalidCheckoutField(fieldToFocus)
    }, 80)
  }, [buyerForm])

  const holdExpiresAt = useCheckoutStore((state) =>
    state.eventId === eventId ? state.holdExpiresAt : null,
  )
  const storeQuantities = useCheckoutStore((state) => state.quantities)
  const storeLines = useCheckoutStore((state) => state.lines)
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
  const { standardTickets, comboTickets, extraTickets } = useMemo(
    () => partitionCheckoutTickets(displayTiers),
    [displayTiers],
  )
  const admissionTiers = useMemo(
    () => [...standardTickets, ...comboTickets],
    [comboTickets, standardTickets],
  )
  useEventCatalogRealtime(
    eventId,
    {
      onEventUpdate: (row) => {
        if (scheduleDays.length >= 2) return
        if (row.venue_map == null) return
        const parsed = parseVenueMap(row.venue_map)
        if (hasInteractiveVenueMap(parsed)) setRealtimeMap(parsed)
      },
      onTierChange: (change, row) => {
        const tierId = row.id?.trim()
        if (!tierId) return
        if (change === "DELETE") {
          setTierOverrides((prev) => {
            const next = { ...prev }
            delete next[tierId]
            return next
          })
          const store = useCheckoutStore.getState()
          for (const line of store.lines) {
            if (isMapCartLine(line) || generalLineTierId(line) !== tierId) {
              continue
            }
            store.setGeneralQuantity({
              ticketTierId: tierId,
              name: line.name,
              price: line.price,
              quantity: 0,
              scheduleId: cartItemScheduleId(line),
              dateString: cartItemDateString(line),
              sectorName: line.sectorName,
              seatLabel: cartItemSeatLabel(line),
            })
          }
          return
        }
        const patch = ticketSelectorPatchFromRow(row)
        if (!patch) return
        setTierOverrides((prev) => ({
          ...prev,
          [tierId]: { ...prev[tierId], ...patch },
        }))
        if (typeof patch.available === "number") {
          const store = useCheckoutStore.getState()
          const cap = patch.available ?? 0
          for (const line of store.lines) {
            if (isMapCartLine(line) || generalLineTierId(line) !== tierId) {
              continue
            }
            store.setGeneralQuantity({
              ticketTierId: tierId,
              name: line.name,
              price: line.price,
              quantity: Math.min(line.quantity, cap),
              scheduleId: cartItemScheduleId(line),
              dateString: cartItemDateString(line),
              sectorName: line.sectorName,
              seatLabel: cartItemSeatLabel(line),
            })
          }
        }
      },
    },
    "tunnel",
  )
  const checkoutDateCards = useMemo(
    () => listCheckoutDateCards(scheduleDays, admissionTiers),
    [admissionTiers, scheduleDays],
  )
  const defaultDateId = useMemo(
    () =>
      selectedDayId &&
      checkoutDateCards.some((card) => card.dateId === selectedDayId)
        ? selectedDayId
        : defaultCheckoutDateId(checkoutDateCards, admissionTiers),
    [admissionTiers, checkoutDateCards, selectedDayId],
  )
  const storedScheduleId = useCheckoutStore((state) => state.selectedScheduleId)
  const selectedDateId =
    storedScheduleId &&
    checkoutDateCards.some((card) => card.dateId === storedScheduleId)
      ? storedScheduleId
      : defaultDateId
  const scheduleDayCount = scheduleDays.length
  const occupancyScopeKey = `${eventId}::${selectedDateId ?? ""}`
  const [occupancyScope, setOccupancyScope] = useState(occupancyScopeKey)
  if (occupancyScopeKey !== occupancyScope) {
    setOccupancyScope(occupancyScopeKey)
    setLiveOccupancy({})
  }
  useSeatingOccupancyRealtime(
    eventId,
    applyOccupancyPatch,
    "tunnel",
    selectedDateId,
    scheduleDayCount,
  )
  const liveMap = useMemo(
    () =>
      resolveLiveVenueMapForDay({
        selectedDateId,
        scheduleDayCount,
        seatingMaps,
        fallback: fallbackMap,
      }),
    [fallbackMap, scheduleDayCount, seatingMaps, selectedDateId],
  )
  const itemMatchesActiveDay = useCallback(
    (
      item: {
        eventDateId?: string | null
        dateId?: string | null
        scheduleId?: string | null
      },
      dateId: string | null | undefined = selectedDateId,
    ) => storefrontItemMatchesSchedule(item, dateId, { scheduleDayCount }),
    [scheduleDayCount, selectedDateId],
  )
  useSeatHoldsRealtime(
    eventId,
    applyOccupancyPatch,
    "tunnel",
    selectedDateId,
    scheduleDayCount,
  )
  const dayTiers = useMemo(() => {
    if (!selectedDateId) return admissionTiers
    return admissionTiers.filter((tier) =>
      ticketVisibleOnCheckoutDay(tier, selectedDateId, scheduleDays),
    )
  }, [admissionTiers, scheduleDays, selectedDateId])

  useEffect(() => {
    const store = useCheckoutStore.getState()
    const current = store.selectedScheduleId
    const currentValid =
      Boolean(current) &&
      checkoutDateCards.some((card) => card.dateId === current)
    if (currentValid) return
    if (selectedDateId && current !== selectedDateId) {
      store.setSelectedScheduleId(selectedDateId)
    }
  }, [checkoutDateCards, selectedDateId])

  function handleSelectedDateIdChange(dateId: string) {
    const store = useCheckoutStore.getState()
    if (store.selectedScheduleId === dateId) return
    store.setSelectedScheduleId(dateId)
    const seat = store.selectedSeat
    if (!seat) return
    const seatItem = selectedItems.find(
      (item) =>
        item.id === seat.seatingUnitId ||
        item.name === seat.label,
    )
    if (
      seatItem &&
      !itemMatchesActiveDay(seatItem, dateId)
    ) {
      store.setSelectedSeat(null)
    }
  }
  const funnelTiers = displayTiers
  const [appliedPromo, setAppliedPromo] = useState<ValidatedPromo | null>(null)
  const [manualReferralCode, setManualReferralCode] = useState<string | null>(
    null,
  )
  const [referralCleared, setReferralCleared] = useState(false)
  const [appliedPromoter, setAppliedPromoter] = useState<
    (CheckoutPromoterPreview & { source: "coupon" | "manual" | "link" }) | null
  >(null)
  const [selectedProvider, setSelectedProvider] =
    useState<CheckoutPaymentProvider>(() =>
      acceptsMercadoPago ? "mercadopago" : "payway",
    )
  const paymentProvider = resolveCheckoutPaymentProvider(
    selectedProvider,
    acceptsMercadoPago,
  )
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
    if (hasPropVenueMap) return
    let cancelled = false
    void fetchPublicVenueMapOnce(eventId).then((map) => {
      if (cancelled) return
      if (map) setFetchedMap(map)
      setClientMapFetchDone(true)
    })
    return () => {
      cancelled = true
    }
  }, [eventId, hasPropVenueMap])

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
      if (seat) void releaseSeatingUnitCartHold(eventId, seat.seatingUnitId, checkoutSessionId())
    }
  }, [eventId])

  const checkoutTierInput = useMemo(() => {
    return dayTiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      price: tier.price,
      available: tier.available,
      seatingSectorId: tier.seatingSectorId,
      layoutType: tier.layoutType,
    }))
  }, [dayTiers])
  const mapDrivenTierIds = useRef(new Set<string>())

  const resolveItemTierId = useCallback(
    (item: StorefrontSelectedItem) => {
      const preferred = item.ticketTierId?.trim()
      if (preferred && displayTiers.some((tier) => tier.id === preferred)) {
        return preferred
      }
      const sectorName = item.sectorName?.trim() || item.name.split(" · ")[0] || item.name
      const direct = resolveTierIdForUniversalSector(
        item.sectorId ?? item.id,
        sectorName,
        displayTiers.map((tier) => ({
          id: tier.id,
          name: tier.name,
          price: tier.price,
          available: tier.available,
          seatingSectorId: tier.seatingSectorId,
          layoutType: tier.layoutType,
        })),
        preferred,
      )
      if (direct) return direct
      const key = (item.sectorId ?? item.id ?? "").trim()
      const priced = zoneTierPricing.filter((row) => {
        const sectorKey = row.sectorKey.trim()
        return sectorKey === key || row.ticketTierId === preferred
      })
      if (priced.length === 1) return priced[0]?.ticketTierId ?? null
      if (item.type === "table") {
        const tableTiers = checkoutTierInput.filter(
          (tier) => tier.layoutType === "table_combo",
        )
        if (tableTiers.length === 1) return tableTiers[0]?.id ?? null
      }
      if (preferred && isCheckoutUuid(preferred)) return preferred
      return null
    },
    [checkoutTierInput, displayTiers, zoneTierPricing],
  )

  useEffect(() => {
    const counts: Record<string, number> = {}
    for (const item of selectedItems) {
      if (item.type === "seat" || item.type === "table") continue
      if (!itemMatchesActiveDay(item)) continue
      const tierId = resolveItemTierId(item)
      if (!tierId) continue
      const catalog = displayTiers.find((tier) => tier.id === tierId)
      if (catalog && isQuantityCheckoutTier(catalog)) continue
      counts[tierId] =
        (counts[tierId] ?? 0) + storefrontLineSkuQuantity(item)
    }
    const nextDriven = new Set(Object.keys(counts))
    setQuantities((current) => {
      let changed = false
      const next = { ...current }
      for (const [tierId, target] of Object.entries(counts)) {
        const tier = displayTiers.find((item) => item.id === tierId)
        if (tier && isQuantityCheckoutTier(tier)) continue
        const drivenByTable = selectedItems.some(
          (item) => item.type === "table" && resolveItemTierId(item) === tierId,
        )
        const max = Math.min(
          purchaseCapForTier({
            layoutType: drivenByTable ? "table_combo" : tier?.layoutType,
            maxPurchaseLimit: tier?.maxPurchaseLimit,
            fallbackMax: maxTicketsPerUser,
          }),
          Math.max(0, tier?.available ?? target),
        )
        const clamped = Math.min(target, max)
        const key = cartQuantityKey(tierId, selectedDateId)
        if ((next[key] ?? 0) !== clamped) {
          next[key] = clamped
          changed = true
        }
      }
      for (const tierId of mapDrivenTierIds.current) {
        const catalog = displayTiers.find((tier) => tier.id === tierId)
        if (catalog && isQuantityCheckoutTier(catalog)) continue
        const key = cartQuantityKey(tierId, selectedDateId)
        if (!nextDriven.has(tierId) && (next[key] ?? 0) !== 0) {
          next[key] = 0
          changed = true
        }
      }
      for (const tier of displayTiers) {
        const key = cartQuantityKey(tier.id, selectedDateId)
        if (
          !isQuantityCheckoutTier(tier) &&
          !nextDriven.has(tier.id) &&
          (next[key] ?? 0) !== 0
        ) {
          next[key] = 0
          changed = true
        }
      }
      mapDrivenTierIds.current = nextDriven
      return changed ? next : current
    })
  }, [checkoutTierInput, displayTiers, itemMatchesActiveDay, maxTicketsPerUser, resolveItemTierId, scheduleDayCount, selectedDateId, selectedItems, setQuantities, zoneTierPricing])

  useEffect(() => {
    function restoreIntent() {
      if (restoredIntent.current) return
      restoredIntent.current = true
      const store = useCheckoutStore.getState()
      if (currentUserId) store.markAuthenticated()

      const alreadyCleaned = restoredHoldCleanup.has(eventId)
      if (!alreadyCleaned) {
        restoredHoldCleanup.add(eventId)
        store.resetIfOtherEvent(eventId)
        store.clearCart()
        if (store.eventId !== eventId) {
          setIntentRestored(true)
          return
        }

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

        void listCartHolds(eventId, checkoutSessionId()).then((result) => {
          if (!result.success) return
          for (const hold of result.holds) {
            if (hold.seating_unit_id) {
              void releaseSeatingUnitCartHold(
                eventId,
                hold.seating_unit_id,
                checkoutSessionId(),
              )
            }
          }
        })
        void releaseGaCartHolds(eventId, checkoutSessionId())
      }

      setIntentRestored(true)
      if (!hasCheckoutIdentity(currentUserId, store.mode)) return
      const action = store.consumePendingAction()
      if (action === "open_map") {
        queueMicrotask(() => {
          if (
            hasInteractiveMapProp ||
            eventNeedsInteractiveCanvas(liveMap, funnelTiers)
          ) {
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
  }, [currentUserId, eventId])

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
    useCheckoutStore.getState().freezeHoldClock()
    redirectToCheckoutPaymentOrToast(paymentUrl)
  }

  const resolvedRef = referralCleared
    ? manualReferralCode?.trim() || null
    : manualReferralCode?.trim() || referralCode?.trim() || storedRef

  function applyPromoterAttribution(
    preview: CheckoutPromoterPreview,
    source: "coupon" | "manual" | "link",
  ) {
    const persisted = persistReferralCode(preview.referralCode)
    const code = persisted ?? preview.referralCode
    setReferralCleared(false)
    setManualReferralCode(code)
    setAppliedPromoter({ ...preview, referralCode: code, source })
  }

  function handleAppliedPromo(promo: ValidatedPromo) {
    setAppliedPromo(promo)
    if (promo.promoterName && promo.promoterReferralCode) {
      applyPromoterAttribution(
        {
          name: promo.promoterName,
          referralCode: promo.promoterReferralCode,
        },
        "coupon",
      )
    }
  }

  function handleClearedPromo() {
    setAppliedPromo(null)
    setAppliedPromoter((current) =>
      current?.source === "coupon" ? null : current,
    )
  }
  const loginHref = publicEventLoginPath({ id: eventId, slug: eventSlug })
  const identityReady = hasCheckoutIdentity(currentUserId, checkoutMode)
  const panelBodyRef = useRef<HTMLDivElement>(null)

  function persistCheckoutCart() {
    useCheckoutStore.getState().rememberCart({
      eventId,
      eventSlug,
      quantities: storeQuantities,
      selectedSeat,
      buyer,
      subtotal: cartSubtotal,
      holdExpiresAt: useCheckoutStore.getState().holdExpiresAt,
    })
  }

  async function ensureGuestAuthForHold(): Promise<boolean> {
    const store = useCheckoutStore.getState()
    if (!hasCheckoutIdentity(currentUserId, store.mode)) {
      store.chooseGuest(eventId, eventSlug)
    }
    store.ensureCartSessionId()
    return true
  }

  function checkoutSessionId() {
    return useCheckoutStore.getState().ensureCartSessionId()
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

  function continueAsGuest(event?: MouseEvent<HTMLButtonElement>) {
    event?.preventDefault()
    event?.stopPropagation()
    buyerForm.clearErrors()
    const store = useCheckoutStore.getState()
    store.chooseGuest(eventId, eventSlug)
    persistCheckoutCart()
    const action = store.pendingAction
    store.setPendingAction(null)

    window.setTimeout(() => {
      store.setIdentityOpen(false)
      if (action === "open_map") {
        if (hasInteractiveMap) {
          store.setSeatSheetOpen(true)
        } else {
          setShowSeatFlow(true)
        }
        return
      }
      if (action === "pay") {
        fireInitiateCheckoutPixels()
        if (availableExtras.length > 0 && !upsellSkipped) {
          setCheckoutStep("upsell")
          panelBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })
          return
        }
        void enterDetailsStep()
      }
    }, 0)
  }

  const hasInteractiveMap =
    eventNeedsInteractiveCanvas(liveMap, funnelTiers) ||
    (mapLoading && hasInteractiveMapProp)
  useLockBodyScroll(showSeatFlow)

  const hasSeatingFlow = hasInteractiveMap

  const availableExtras = extraTickets.filter((tier) => tier.available > 0)

  const daySelectedItems = selectedItems.filter((item) =>
    itemMatchesActiveDay(item),
  )
  const visibleZoneId =
    focusedZoneId && daySelectedItems.some((item) => item.id === focusedZoneId)
      ? focusedZoneId
      : null

  const priceBySectorId = useMemo(
    () => buildTierUnitPriceIndex(dayTiers),
    [dayTiers],
  )
  const liveSelectedItems = useMemo(
    () =>
      hydrateStorefrontItemsFromMap(
        selectedItems,
        liveMap,
        priceBySectorId,
        selectedDateId,
      ),
    [liveMap, priceBySectorId, selectedDateId, selectedItems],
  )

  useEffect(() => {
    if (!intentRestored || !liveMap) return

    function applyHydratedItems(items: StorefrontSelectedItem[]) {
      const seatStore = useStorefrontSeatStore.getState()
      const scheduleId = useCheckoutStore.getState().selectedScheduleId
      const keep = items.filter(
        (item) => !itemMatchesActiveDay(item, scheduleId),
      )
      const refresh = items.filter((item) =>
        itemMatchesActiveDay(item, scheduleId),
      )
      const hydrated = [
        ...keep,
        ...hydrateStorefrontItemsFromMap(
          refresh,
          liveMap,
          priceBySectorId,
          scheduleId,
        ),
      ]
      const same =
        hydrated.length === seatStore.selectedItems.length &&
        hydrated.every((item, index) => {
          const current = seatStore.selectedItems[index]
          return (
            current?.id === item.id &&
            current.eventDateId === item.eventDateId &&
            current.dateId === item.dateId &&
            current.name === item.name &&
            current.price === item.price &&
            current.capacity === item.capacity &&
            current.sellMode === item.sellMode &&
            current.priceMode === item.priceMode
          )
        })
      if (!same) seatStore.replaceSelectedItems(hydrated)
    }

    applyHydratedItems(useStorefrontSeatStore.getState().selectedItems)
  }, [currentUserId, eventId, intentRestored, itemMatchesActiveDay, liveMap, priceBySectorId])

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

  const focusedComboDays = useMemo(() => {
    if (!focusedTierId) return []
    const tier = displayTiers.find((item) => item.id === focusedTierId)
    if (!tier || !isComboPackOffer(tier)) return []
    return comboScheduleIdsFromTier(tier, scheduleDays)
  }, [displayTiers, focusedTierId, scheduleDays])

  const occupancyBySeatId = useMemo(() => {
    const dayTierIds = new Set(dayTiers.map((tier) => tier.id))
    const units =
      focusedComboDays.length > 1
        ? seatingUnitsForComboDays(mergedSeatingUnits, focusedComboDays)
        : seatingUnitsForOccupancyDay(mergedSeatingUnits, {
            eventDateId: selectedDateId,
            dayTierIds,
            scheduleDayCount,
          })
    return mergeInventoryOccupancy(
      occupancyFromSeatingUnits(
        units.map((unit) => ({
          layoutItemId: unit.layoutItemId,
          status: unit.status,
          reservedUntil: unit.reservedUntil,
        })),
      ),
      liveOccupancy,
    )
  }, [
    dayTiers,
    focusedComboDays,
    liveOccupancy,
    mergedSeatingUnits,
    scheduleDayCount,
    selectedDateId,
  ])

  useEffect(() => {
    if (focusedComboDays.length < 2) return
    let cancelled = false
    void Promise.all(
      focusedComboDays.map((day) => getEventSeatingAvailability(eventId, day)),
    ).then((batches) => {
      if (cancelled) return
      setLoadedUnitsBySector((current) => {
        let changed = false
        const next = { ...current }
        for (const units of batches) {
          for (const unit of units) {
            const key = `${unit.sectorId || "_sector"}::${unit.eventDateId ?? ""}`
            const list = next[key] ?? []
            if (list.some((row) => row.id === unit.id)) continue
            next[key] = [...list, unit]
            changed = true
          }
        }
        return changed ? next : current
      })
    })
    return () => {
      cancelled = true
    }
  }, [eventId, focusedComboDays])

  const soldOutZoneIds = useMemo(() => {
    const zones = liveMap?.zones ?? []
    if (zones.length === 0) return []
    const seats = liveMap ? flattenSeatsForAvailability(liveMap) : []
    const tierRefs = dayTiers.map((tier) => ({
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
        const tier = dayTiers.find((item) => item.id === tierId)
        const summary = pickSectorSummaryForDay(seatingSectorSummaries, {
          sectorId: zone.id,
          sectorName: zone.name,
          tierId,
          eventDateId: selectedDateId,
          scheduleDayCount,
        })
        const stock = sectorStockFromSummary(summary, scheduleDayCount)
        return isCategorySoldOut({
          requiresMap: true,
          stock: tier?.available ?? 0,
          categoryId: zone.id,
          seatingSectorId: tier?.seatingSectorId ?? zone.id,
          categoryName: zone.name,
          seats,
          occupancyBySeatId,
          summaryAvailable: stock.available,
          mapReady: Boolean(liveMap),
        })
      })
      .map((zone) => zone.id)
  }, [
    dayTiers,
    liveMap,
    occupancyBySeatId,
    scheduleDayCount,
    seatingSectorSummaries,
    selectedDateId,
  ])
  const heldSeatIds = useMemo(() => {
    const ids = new Set<string>()
    for (const item of selectedItems) {
      if (
        item.id &&
        itemMatchesActiveDay(item)
      ) {
        ids.add(item.id)
      }
    }
    for (const seat of layoutSeats) {
      if (
        seat.id &&
        itemMatchesActiveDay(seat)
      ) {
        ids.add(seat.id)
      }
    }
    if (
      selectedSeat &&
      selectedItems.some(
        (item) =>
          itemMatchesActiveDay(item) &&
          (item.id === selectedSeat.seatingUnitId ||
            item.id === selectedSeat.sectorKey),
      )
    ) {
      ids.add(selectedSeat.seatingUnitId)
      const unit = mergedSeatingUnits.find(
        (item) => item.id === selectedSeat.seatingUnitId,
      )
      if (unit?.layoutItemId) ids.add(unit.layoutItemId)
    }
    return [...ids]
  }, [itemMatchesActiveDay, layoutSeats, mergedSeatingUnits, selectedItems, selectedSeat])

  const universalPayload = useMemo(() => {
    if (!hasSeatingFlow) return null
    return buildUniversalSeatPayloadForCheckout({
      venueId: venueId ?? `event-${eventId}`,
      venueName: venueName ?? eventTitle,
      seatingLayout: resolvedSeatingLayout,
      seatingBackgroundUrl,
      capacity: venueCapacity ?? undefined,
      tiers: dayTiers.map((tier) => ({
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
    dayTiers,
    venueCapacity,
    venueId,
    venueName,
    zoneTierPricing,
  ])

  const mapSelectionCap = useMemo(
    () =>
      mapPlaceSelectionCap({
        fallbackMax: maxTicketsPerUser,
        isTable: true,
      }),
    [maxTicketsPerUser],
  )

  useEffect(() => {
    const clean = referralCode?.trim()
    if (!clean) return
    persistReferralCode(clean)
  }, [referralCode])

  const extraNumbered = selectedSeat ? Math.max(0, layoutSeats.length - 1) : 0
  const seatLineCount = (selectedSeat ? 1 : layoutSeats.length) + extraNumbered
  const numberedSubtotal = selectedSeat
    ? toCartNumber(selectedSeat.price) +
      layoutSeats
        .slice(1)
        .reduce((sum, seat) => sum + toCartNumber(seat.price), 0)
    : layoutSeats.reduce((sum, seat) => sum + toCartNumber(seat.price), 0)
  const mapTierIds = useMemo(() => {
    const ids = new Set<string>()
    for (const item of [...selectedItems, ...liveSelectedItems]) {
      if (!storefrontPlaceNeedsMappedLine(item.type)) continue
      const tierId = resolveItemTierId(item)
      if (tierId) ids.add(tierId)
    }
    return ids
  }, [liveSelectedItems, resolveItemTierId, selectedItems])
  const extraQuantitySubtotal = storeLines
    .filter(
      (line) =>
        !isMapCartLine(line) &&
        cartLineQuantity(line.quantity) > 0 &&
        !mapTierIds.has(generalLineTierId(line)),
    )
    .reduce(
      (sum, line) =>
        sum + toCartNumber(line.price) * cartLineQuantity(line.quantity),
      0,
    )
  const extraQuantityCount = storeLines
    .filter(
      (line) =>
        !isMapCartLine(line) &&
        cartLineQuantity(line.quantity) > 0 &&
        !mapTierIds.has(generalLineTierId(line)),
    )
    .reduce((sum, line) => sum + cartLineQuantity(line.quantity), 0)
  const hasMapSelection =
    selectedItems.length > 0 || liveSelectedItems.length > 0
  const numberedExtra = hasMapSelection ? 0 : numberedSubtotal
  const numberedExtraCount = hasMapSelection ? 0 : seatLineCount
  const totalMapSelectedItemsPrice = storefrontSelectionTotal(
    liveSelectedItems.map((item) => ({
      ...item,
      price: mapSelectionUnitPrice(
        item.price,
        resolveItemTierId(item),
        displayTiers,
      ),
    })),
  )
  const totalGeneralTicketsPrice = extraQuantitySubtotal + numberedExtra
  const storeLinesMerchandise = storeLines.reduce(
    (sum, line) =>
      sum + toCartNumber(line.price) * cartLineQuantity(line.quantity),
    0,
  )
  const ticketsSubtotal = roundMoney(
    storeLines.length > 0
      ? storeLinesMerchandise
      : totalMapSelectedItemsPrice + totalGeneralTicketsPrice,
  )
  const mapSeatCount = Math.max(
    storefrontSelectionCount(liveSelectedItems),
    storefrontSelectionCount(selectedItems),
  )
  const storeLinesCount = storeLines.reduce(
    (sum, line) => sum + cartLineQuantity(line.quantity),
    0,
  )
  const totalTickets =
    storeLines.length > 0
      ? storeLinesCount
      : extraQuantityCount + mapSeatCount + numberedExtraCount
  // All-In: tier.price already includes TokePass fee.
  const cartSubtotal = ticketsSubtotal
  const discountAmount = appliedPromo
    ? centsToMoney(
        Math.min(
          moneyToCents(appliedPromo.discountAmount),
          moneyToCents(cartSubtotal),
        ),
      )
    : 0
  const totalAmount = centsToMoney(
    Math.max(0, moneyToCents(cartSubtotal) - moneyToCents(discountAmount)),
  )
  const finalTotal = totalAmount
  const canProceedFromCart =
    cartHasPurchasableItems({
      quantities: storeQuantities,
      selectedCount: totalTickets,
      selectedItems:
        liveSelectedItems.length > 0 ? liveSelectedItems : selectedItems,
      seats: liveSelectedItems.length > 0 ? liveSelectedItems : selectedItems,
    }) && buildCheckoutItems().length > 0
  function toastEmptyCheckoutCart() {
    const places =
      liveSelectedItems.length > 0 ? liveSelectedItems : selectedItems
    const hasPlaces = cartHasPurchasableItems({
      quantities: storeQuantities,
      selectedCount: totalTickets,
      selectedItems: places,
      seats: places,
    })
    toast.error(
      hasPlaces && buildCheckoutItems().length === 0
        ? "No pudimos identificar esa ubicación. Volvé a elegirla en el mapa."
        : "Elegí al menos una entrada para continuar.",
    )
  }
  const isFreeCheckout = canProceedFromCart && finalTotal === 0
  requirePhoneRef.current = !isFreeCheckout
  const cartLines = useMemo<StorefrontCartLine[]>(() => {
    const seatLines = liveSelectedItems.map((item) => {
      const preferredId = resolveItemTierId(item)
      const byId = preferredId
        ? displayTiers.find((tier) => tier.id === preferredId) ?? null
        : null
      const matched = displayTiers.filter(
        (tier) =>
          tier.seatingSectorId &&
          (tier.seatingSectorId === item.sectorId ||
            tier.seatingSectorId === item.id),
      )
      const itemDateId = cartItemScheduleId(item)
      const datedMatch = itemDateId
        ? matched.filter((tier) => ticketMatchesTab(tier, itemDateId))
        : []
      const dateSource =
        byId ??
        (datedMatch.length === 1
          ? datedMatch[0]
          : matched.length === 1
            ? matched[0]
            : null)
      const dateId =
        itemDateId ??
        (dateSource ? resolveTicketDateMeta(dateSource).dateId : null)
      const dateLabel =
        cartItemDateString(item) ||
        (dateSource
          ? ticketDateCartLabel(dateSource, scheduleDays)
          : scheduleDayCartLabel(dateId, scheduleDays))
      const isTableSku =
        item.type === "table" || item.inventoryType === "TABLES"
      const skuQuantity = Math.max(1, storefrontLineSkuQuantity(item))
      const pricedTiers = dateId
        ? displayTiers.filter((tier) =>
            ticketVisibleOnCheckoutDay(tier, dateId, scheduleDays),
          )
        : displayTiers
      const unitPrice = mapSelectionUnitPrice(
        item.price,
        dateSource?.id ?? preferredId,
        pricedTiers,
      )
      const sectorName =
        item.sectorName?.trim() ||
        dateSource?.name ||
        item.displayName?.trim() ||
        item.name
      const placeLabel =
        cartItemSeatLabel(item) ||
        cartPlaceLabel(item) ||
        null
      const lineName = isTableSku
        ? sectorName
        : dateSource?.name || item.displayName?.trim() || item.name
      const ticketId = dateSource?.id ?? preferredId ?? ""
      const isNumberedPlace = isTableSku || item.type === "seat"
      return {
        id: ticketId
          ? cartCompositeItemId(
              ticketId,
              dateId,
              isNumberedPlace ? item.id : null,
            )
          : storefrontSelectionKey(item),
        ticketTierId: dateSource?.id ?? preferredId ?? null,
        name: lineName,
        displayName: lineName,
        detail: formatSelectionChargeDetail({
          type: item.type,
          name: item.name,
          capacity: item.type === "zone" ? 1 : item.capacity,
          unitPrice,
          quantity: skuQuantity,
          sellMode: item.sellMode,
          priceMode: item.priceMode,
        }),
        dateId,
        dateLabel,
        scheduleId: dateId,
        dateString: dateLabel,
        quantity: skuQuantity,
        price: unitPrice,
        seatId: item.type === "seat" ? item.id : null,
        elementId: isTableSku ? item.id : null,
        sectorId: item.sectorId ?? item.id,
        sectorName,
        placeLabel,
        seatLabel: placeLabel,
        isMappedSelection:
          item.type === "seat" ||
          item.type === "table" ||
          item.inventoryType === "TABLES" ||
          item.inventoryType === "SEATED_NUMERATED",
      }
    })
    const seenTicketLines = new Set<string>()
    const ticketLines: StorefrontCartLine[] = []
    for (const [key, rawQty] of Object.entries(storeQuantities)) {
      const quantity = cartLineQuantity(rawQty)
      if (quantity <= 0) continue
      const parsed = parseCartCompositeItemId(key)
      if (parsed?.unitId) continue
      const tierId = parsed?.ticketId || key
      if (!tierId || mapTierIds.has(tierId)) continue
      const tier = displayTiers.find((item) => item.id === tierId)
      if (!tier || !isQuantityCheckoutTier(tier)) continue
      const undated =
        extraTickets.some((item) => item.id === tierId) ||
        isUndatedCheckoutOffer(tier)
      const stamp = generalQuantityScheduleStamp({
        selectedDateId: undated ? null : parsed?.scheduleId,
        scheduleDays,
        tier,
        undated,
      })
      const id = cartCompositeItemId(tier.id, stamp.scheduleId)
      if (seenTicketLines.has(id)) continue
      seenTicketLines.add(id)
      ticketLines.push({
        id,
        ticketTierId: tier.id,
        name: tier.name,
        detail: `${quantity} ${quantity === 1 ? "entrada" : "entradas"}`,
        dateId: stamp.scheduleId,
        dateLabel: stamp.dateString ?? undefined,
        scheduleId: stamp.scheduleId,
        dateString: stamp.dateString,
        sectorName: tier.name,
        quantity,
        price: publicOfferPrice(tier),
        isMappedSelection: false,
      })
    }
    return [...seatLines, ...ticketLines]
  }, [
    displayTiers,
    extraTickets,
    liveSelectedItems,
    mapTierIds,
    resolveItemTierId,
    scheduleDays,
    storeQuantities,
  ])
  useEffect(() => {
    const store = useCheckoutStore.getState()
    store.rememberCatalog(
      displayTiers.map((tier) => ({
        id: tier.id,
        name: tier.name,
        price: publicOfferPrice(tier),
      })),
    )
    store.setCartTotals({
      totalAmount: finalTotal,
      itemsCount: totalTickets,
    })
    store.setCartLines(cartLines, {
      replaceGeneralDays: [...scheduleDays.map((day) => day.id), null],
    })
  }, [cartLines, displayTiers, finalTotal, scheduleDays, selectedItems.length, totalTickets])
  const visibleStep: CheckoutFlowStep = resolveCheckoutProgressStep({
    requested: checkoutStep,
    hasCartItems: canProceedFromCart,
    purchaseLocked,
  })

  useEffect(() => {
    if (visibleStep === checkoutStep) return
    setCheckoutStep(visibleStep)
  }, [checkoutStep, setCheckoutStep, visibleStep])

  useEffect(() => {
    if (!portalReady) return
    useCheckoutStore.getState().rememberCart({
      eventId,
      eventSlug,
      quantities: storeQuantities,
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
    selectedSeat,
    storeQuantities,
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
      if (result.data.promoterName && result.data.promoterReferralCode) {
        applyPromoterAttribution(
          {
            name: result.data.promoterName,
            referralCode: result.data.promoterReferralCode,
          },
          "coupon",
        )
      }
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
          checkoutSessionId(),
        )
      }
      if (previous.holdExpiresAt && !state.holdExpiresAt) {
        setAppliedPromo(null)
      }
      const hadGa = Object.values(previous.quantities).some((qty) => qty > 0)
      const hasGa = Object.values(state.quantities).some((qty) => qty > 0)
      if (hasGa) gaReleaseAfterEmpty.delete(eventId)
      if (
        hadGa &&
        !hasGa &&
        !gaReleaseAfterEmpty.has(eventId)
      ) {
        gaReleaseAfterEmpty.add(eventId)
        void releaseGaCartHolds(eventId, checkoutSessionId())
      }
      for (const [key, qty] of Object.entries(previous.quantities)) {
        if (qty > 0 && (state.quantities[key] ?? 0) === 0) {
          const parsed = parseCartCompositeItemId(key)
          const ticketId = parsed?.ticketId ?? key
          const day = parsed?.scheduleId ?? null
          const related = useStorefrontSeatStore
            .getState()
            .selectedItems.filter((item) => {
              if (item.type !== "zone" && item.type !== "standing") return false
              if (resolveItemTierId(item) !== ticketId) return false
              const itemDay = cartItemScheduleId(item)
              if (day && itemDay && itemDay !== day) return false
              return true
            })
          for (const item of related) {
            useStorefrontSeatStore
              .getState()
              .removeSelectedItem(storefrontSelectionKey(item))
          }
        }
      }
    })
    // resolveItemTierId reads live map/tier closures; subscribe is event-scoped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  function quantityStampForTier(
    tier: TicketSelectorTier | undefined,
    tierId: string,
  ) {
    return generalQuantityScheduleStamp({
      selectedDateId,
      scheduleDays,
      tier,
      undated:
        extraTickets.some((item) => item.id === tierId) ||
        isUndatedCheckoutOffer(tier),
    })
  }

  function updateQuantity(tierId: string, next: number, max: number) {
    if (purchaseLocked) return
    const tier = displayTiers.find((item) => item.id === tierId)
    const stamp = quantityStampForTier(tier, tierId)
    const currentQty = quantityForPublicTier(
      useCheckoutStore.getState().quantities,
      { id: tierId, ...(tier ?? {}) },
      { selectedDateId, scheduleDays },
    )
    const stock = selectableTicketStock(tier ?? { available: 0 })
    if (next > currentQty && stock <= 0) return
    const saleState = resolveTicketSaleState({
      available: tier?.available,
      capacity: tier?.capacity,
      sold: tier?.sold,
      saleStartsAt: tier?.saleStartsAt,
      saleEndsAt: tier?.saleEndsAt,
    })
    const saleError = ticketSaleWindowError(saleState)
    if (next > currentQty && saleError) {
      toast.error(saleError)
      return
    }
    const clamped = Math.min(Math.max(0, next), max, stock)
    const skuMax = purchaseCapForTier({
      layoutType: tier?.layoutType,
      maxPurchaseLimit: tier?.maxPurchaseLimit,
      fallbackMax: maxTicketsPerUser,
    })
    if (clamped > currentQty && clamped > skuMax) {
      toast.error(
        skuPurchaseMaxMessage(tier?.name?.trim() || "esta tarifa", skuMax),
      )
      return
    }
    const result = useCheckoutStore.getState().setGeneralQuantity({
      ticketTierId: tierId,
      name: tier?.name ?? "",
      price: tier ? publicOfferPrice(tier) : 0,
      quantity: clamped,
      maxQuantity: Math.min(max, stock),
      scheduleId: stamp.scheduleId,
      dateString: stamp.dateString,
      sectorName: tier?.name ?? null,
    })
    if (!result.ok) {
      toast.error(storefrontLimitMessage())
      return
    }
    if (clamped > currentQty) {
      fireAddToCartPixels({
        contentIds: [tierId],
        value: (tier ? publicOfferPrice(tier) : 0) * (clamped - currentQty),
        numItems: clamped - currentQty,
      })
    }
    const related = selectedItems.filter((item) => {
      if (item.type !== "zone" && item.type !== "standing") return false
      if (resolveItemTierId(item) !== tierId) return false
      const itemDay = cartItemScheduleId(item)
      if (stamp.scheduleId && itemDay && itemDay !== stamp.scheduleId) {
        return false
      }
      return true
    })
    const store = useStorefrontSeatStore.getState()
    if (clamped === 0) {
      for (const item of related) store.removeSelectedItem(storefrontSelectionKey(item))
      return
    }
    if (related.length === 1) {
      store.patchSelectedItem(storefrontSelectionKey(related[0]!), {
        capacity: Math.max(1, clamped),
      })
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
    const stamp = quantityStampForTier(current, info.tierId)
    const currentQty = quantityForPublicTier(
      useCheckoutStore.getState().quantities,
      { id: info.tierId, ...(current ?? {}) },
      { selectedDateId, scheduleDays },
    )
    useCheckoutStore.getState().setGeneralQuantity({
      ticketTierId: info.tierId,
      name: current?.name ?? "",
      price: info.price,
      quantity: Math.min(currentQty, nextAvailable),
      scheduleId: stamp.scheduleId,
      dateString: stamp.dateString,
      sectorName: current?.name ?? null,
    })
    toast.warning(info.message || PHASE_ROLLOVER_MESSAGE)
  }

  function pixelCommercePayload(input: {
    contentIds: string[]
    value: number
    numItems: number
  }) {
    return {
      contentName: eventTitle,
      contentIds: input.contentIds,
      value: input.value,
      currency: "ARS" as const,
      numItems: input.numItems,
    }
  }

  function fireAddToCartPixels(input: {
    contentIds: string[]
    value: number
    numItems: number
  }) {
    trackAddToCart(pixelCommercePayload(input))
  }

  function fireInitiateCheckoutPixels() {
    if (initiatedCheckoutRef.current) return
    initiatedCheckoutRef.current = true
    trackInitiateCheckout(
      pixelCommercePayload({
        contentIds: [
          ...new Set(
            Object.entries(storeQuantities)
              .filter(([, qty]) => qty > 0)
              .map(([key]) => parseCartCompositeItemId(key)?.ticketId ?? key),
          ),
        ],
        value: finalTotal,
        numItems: Math.max(1, totalTickets),
      }),
    )
  }

  function buildCheckoutItems(extraAddonId?: string) {
    const places: Array<{
      id: string
      ticketTierId?: string | null
      sectorId?: string | null
      tableNumber?: number | null
      seatingUnitId?: string | null
      eventDateId?: string | null
    }> = []

    if (selectedSeat) {
      const unit = mergedSeatingUnits.find(
        (item) => item.id === selectedSeat.seatingUnitId,
      )
      const seatItem = selectedItems.find(
        (item) =>
          item.id === selectedSeat.seatingUnitId ||
          item.id === unit?.layoutItemId,
      )
      places.push({
        id: unit?.layoutItemId || selectedSeat.seatingUnitId,
        ticketTierId: selectedSeat.tierId,
        sectorId: selectedSeat.sectorKey ?? unit?.sectorId,
        tableNumber: selectedSeat.tableNumber,
        seatingUnitId: unit?.id ?? selectedSeat.seatingUnitId,
        eventDateId:
          cartItemScheduleId(unit ?? {}) ||
          cartItemScheduleId(seatItem ?? {}),
      })
    }

    const placeItems =
      liveSelectedItems.length > 0 ? liveSelectedItems : selectedItems
    for (const item of placeItems) {
      if (!storefrontPlaceNeedsMappedLine(item.type)) continue
      const unit = mergedSeatingUnits.find((row) => row.id === item.id)
      places.push({
        id: unit?.layoutItemId || item.id,
        ticketTierId: resolveItemTierId(item) ?? unit?.tierId,
        sectorId: item.sectorId ?? unit?.sectorId,
        tableNumber: item.number ?? null,
        seatingUnitId: unit?.id ?? (isCheckoutUuid(item.id) ? item.id : null),
        eventDateId: cartItemScheduleId(item),
      })
    }

    for (const seat of layoutSeats) {
      const unit = mergedSeatingUnits.find((row) => row.id === seat.id)
      if (unit) {
        places.push({
          id: unit.layoutItemId || seat.id,
          ticketTierId: unit.tierId,
          sectorId: unit.sectorId,
          seatingUnitId: unit.id,
          eventDateId: cartItemScheduleId(seat) || cartItemScheduleId(unit),
        })
        continue
      }
      if (!isCheckoutUuid(seat.id)) continue
      places.push({
        id: seat.id,
        ticketTierId: resolveItemTierId({
          id: seat.id,
          name: seat.label ?? "",
          type: "seat",
          price: seat.price,
          capacity: 1,
          sectorId: seat.sectorId,
        }),
        sectorId: seat.sectorId,
        seatingUnitId: seat.id,
        eventDateId: cartItemScheduleId(seat),
      })
    }

    return buildCheckoutActionItems({
      lines: storeLines,
      extraPlaces: places,
      selectedDateId,
      scheduleDayCount,
      mapBackedTierIds: displayTiers
        .filter((tier) => !isQuantityCheckoutTier(tier) && tierNeedsNumberedPlace(tier))
        .map((tier) => tier.id),
      extraAddonId,
    })
  }

  function checkoutIdempotencyKeyFor(items: CheckoutCartItemInput[]): string {
    const fingerprint = items
      .map((item) => {
        const tier = item.ticketTierId || item.ticket_tier_id || item.tierId || ""
        const seat =
          item.seatingUnitId ||
          item.seatId ||
          item.seat_id ||
          item.element_id ||
          item.elementId ||
          ""
        const date =
          item.eventDateId || item.event_date_id || item.dateId || ""
        return `${tier}:${item.quantity}:${seat}:${date}`
      })
      .sort()
      .join("|")
    if (
      checkoutAttemptKeyRef.current &&
      checkoutAttemptCartRef.current === fingerprint
    ) {
      return checkoutAttemptKeyRef.current
    }
    const key = crypto.randomUUID()
    checkoutAttemptKeyRef.current = key
    checkoutAttemptCartRef.current = fingerprint
    return key
  }

  function releaseCheckoutProcessing() {
    isProcessingRef.current = false
    setIsProcessing(false)
  }

  async function runCheckoutBusy(task: () => Promise<void> | void) {
    if (isProcessingRef.current || purchaseLocked) return
    isProcessingRef.current = true
    setIsProcessing(true)
    try {
      await task()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "checkout_failed"
      applyCheckoutActionError(message, "No se pudo iniciar el pago")
    } finally {
      releaseCheckoutProcessing()
    }
  }

  function clearGeneralQuantities(tierIds?: string[]) {
    const ids = new Set(tierIds ?? displayTiers.map((tier) => tier.id))
    const store = useCheckoutStore.getState()
    for (const [key, quantity] of Object.entries(store.quantities)) {
      if (quantity <= 0) continue
      const parsed = parseCartCompositeItemId(key)
      const ticketId = parsed?.ticketId ?? key
      if (!ids.has(ticketId)) continue
      const tier = displayTiers.find((row) => row.id === ticketId)
      const line = store.lines.find((item) => item.id === key)
      store.setGeneralQuantity({
        ticketTierId: ticketId,
        name: line?.name ?? tier?.name ?? "",
        price: line?.price ?? (tier ? publicOfferPrice(tier) : 0),
        quantity: 0,
        scheduleId: parsed?.scheduleId ?? cartItemScheduleId(line ?? {}),
        dateString:
          cartItemDateString(line ?? {}) ||
          (tier ? ticketDateCartLabel(tier, scheduleDays) : null),
        sectorName: line?.sectorName ?? tier?.name ?? null,
      })
    }
  }

  function applyCheckoutActionError(
    error: string,
    fallbackTitle: string,
    extras?: { code?: string; ticketId?: string; revealDetail?: boolean },
  ) {
    const feedback = resolveCheckoutFeedback(error, extras)
    const ticketId = inferCheckoutTicketId(
      feedback,
      displayTiers.map((tier) => ({
        id: tier.id,
        name: tier.name,
        seatingSectorId: tier.seatingSectorId,
      })),
      useCheckoutStore.getState().quantities,
    )
    if (ticketId && feedback.inlineMessage) {
      useCheckoutStore.getState().setTicketError(ticketId, feedback.inlineMessage)
    } else {
      useCheckoutStore.getState().clearTicketError()
    }

    if (isSeatSelectionRequiredError(error) || feedback.code === "ERR_SEAT_REQUIRED") {
      toast.error(SEAT_SELECTION_REQUIRED_MESSAGE)
      setCheckoutStep("tickets")
      return
    }
    if (isSectorNotConfiguredError(error) || feedback.code === "ERR_SECTOR_NOT_CONFIGURED") {
      toast.error(SECTOR_NOT_CONFIGURED_MESSAGE)
      clearGeneralQuantities()
      setCheckoutStep("tickets")
      return
    }
    if (isCheckoutConnectionNoise(error)) {
      toast.error("No se pudo reservar el stock. Probá de nuevo.")
      setCheckoutStep("tickets")
      return
    }
    if (isSeatUnavailableError(error) || feedback.code === "ERR_SEAT_TAKEN") {
      toast.error(SEAT_UNAVAILABLE_MESSAGE)
      setCheckoutStep("tickets")
      openSeatFlow()
      return
    }
    if (feedback.code === "ERR_NO_STOCK") {
      toastCheckoutStock(feedback.message)
      setCheckoutStep("tickets")
      return
    }
    toastCheckoutError(error, fallbackTitle, {
      revealDetail: extras?.revealDetail,
    })
  }

  function handleBuyerValidationFailure(
    formErrors?: Parameters<typeof firstCheckoutBuyerErrorField>[0],
  ) {
    setFieldShake((current) => current + 1)
    const field =
      firstCheckoutBuyerErrorField(formErrors ?? buyerForm.formState.errors) ??
      firstCheckoutBuyerErrorField(
        getCheckoutBuyerFieldErrors(buyerForm.getValues(), {
          requirePhone: requirePhoneRef.current,
        }),
      )
    setCheckoutStep("details")
    toast.error("Revisá los datos del formulario", {
      description: requirePhoneRef.current
        ? "Completá nombre, DNI, mail y teléfono para continuar."
        : "Completá nombre, apellido, mail y DNI para continuar.",
      action: {
        label: CHECKOUT_REVIEW_LABEL,
        onClick: () => reviewCheckoutForm(field),
      },
    })
    window.setTimeout(() => {
      scrollToFirstInvalidCheckoutField(field)
    }, 80)
  }

  async function submitCheckout(
    extraAddonId?: string,
    sandbox = false,
    buyerOverride?: CheckoutBuyerInfo,
  ) {
    if (purchaseLocked) return
    const items = buildCheckoutItems(extraAddonId)
    if (items.length === 0) {
      toastEmptyCheckoutCart()
      return
    }

    const source = buyerOverride ?? buyerForm.getValues()
    const buyerCheck = validateCheckoutBuyer(source, {
      requirePhone: requirePhoneRef.current,
    })
    if (!buyerCheck.ok) {
      handleBuyerValidationFailure(buyerForm.formState.errors)
      return
    }
    setBuyer(buyerCheck.buyer)

    const fallbackTitle = sandbox
      ? "Error en la compra de prueba"
      : "No se pudo iniciar el pago"

    try {
      if (!(await lockCheckoutStock())) return

      const captchaToken =
        sandbox || isFreeCheckout ? null : await getCheckoutCaptchaToken()
      const idempotencyKey = checkoutIdempotencyKeyFor(items)
      const priceGuard = {
        displayedTotal: finalTotal,
        idempotencyKey,
      }

      const cartSessionId = checkoutSessionId()
      const result = sandbox
        ? await startSandboxCheckout(
            eventId,
            items,
            resolvedRef,
            [],
            buyerCheck.buyer,
            appliedPromo?.promoCodeId ?? null,
            previewKey,
            acceptedTerms,
            captchaToken,
            { ...priceGuard, cartSessionId },
          )
        : await startCheckoutWithPayment(
            eventId,
            items,
            resolvedRef,
            [],
            buyerCheck.buyer,
            appliedPromo?.promoCodeId ?? null,
            {
              paymentProvider: paymentProvider,
              previewKey,
              deviceHash: getOrCreateDeviceHash(),
              dwellMs: getCheckoutDwellMs(),
              termsAccepted: isFreeCheckout ? true : acceptedTerms,
              captchaToken,
              displayedTotal: priceGuard.displayedTotal,
              idempotencyKey: priceGuard.idempotencyKey,
              cartSessionId,
            },
          )

      if (!result.success) {
        if (sandbox) {
          console.error("[checkout/sandbox]", result.error, result)
        }
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
        applyCheckoutActionError(result.error, fallbackTitle, {
          code: result.code,
          ticketId: result.ticketId,
          revealDetail: sandbox,
        })
        router.refresh()
        return
      }

      if (sandbox) {
        toast.success("Compra de prueba lista")
        const successUrl =
          result.paymentUrl?.trim() ||
          result.initPoint?.trim() ||
          `/checkout/success?order_id=${encodeURIComponent(result.orderId)}&sandbox=1`
        useCheckoutStore.getState().clearCart()
        enterPaymentHold({
          paymentUrl: successUrl,
          initPoint: successUrl,
        })
        return
      }
      const paidUrl = result.paymentUrl ?? result.initPoint ?? ""
      if (paidUrl.includes("/checkout/success")) {
        useCheckoutStore.getState().clearCart()
      }
      enterPaymentHold(result)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "checkout_failed"
      if (sandbox) {
        console.error("[checkout/sandbox]", error)
      }
      applyCheckoutActionError(message, fallbackTitle, {
        revealDetail: sandbox,
      })
      router.refresh()
    } finally {
      releaseCheckoutProcessing()
    }
  }

  async function enterDetailsStep() {
    if (buildCheckoutItems().length === 0) {
      toastCheckoutStock()
      setCheckoutStep("tickets")
      return
    }
    if (!identityReady) {
      useCheckoutStore.getState().chooseGuest(eventId, eventSlug)
    }
    setCheckoutStep("details")
    panelBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function goToDetailsStep() {
    if (purchaseLocked || !canProceedFromCart) {
      setCheckoutStep("tickets")
      return
    }
    const locked = await lockCheckoutStock()
    if (!locked) {
      setCheckoutStep("tickets")
      return
    }
    fireInitiateCheckoutPixels()
    if (availableExtras.length > 0 && !upsellSkipped) {
      setCheckoutStep("upsell")
      panelBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    await enterDetailsStep()
  }

  async function proceedToDetails() {
    const locked = await lockCheckoutStock()
    if (!locked) {
      setCheckoutStep("tickets")
      return
    }
    await enterDetailsStep()
  }

  function continueWithExtras() {
    void runCheckoutBusy(async () => {
      setUpsellSkipped(true)
      await proceedToDetails()
    })
  }

  function goToPaymentMethods() {
    if (!canProceedFromCart || purchaseLocked) {
      setCheckoutStep("tickets")
      return
    }
    if (isProcessingRef.current || checkoutBusy) return
    if (isFreeCheckout) {
      void runCheckoutBusy(async () => {
        await buyerForm.handleSubmit(
          (values) => {
            setBuyer(values)
            buyerForm.reset(values)
            return submitCheckout(undefined, simulatePayment, values)
          },
          (formErrors) => {
            handleBuyerValidationFailure(formErrors)
          },
        )()
      })
      return
    }
    void buyerForm.handleSubmit(
      (values) => {
        setBuyer(values)
        buyerForm.reset(values)
        setCheckoutStep("payment")
        panelBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      },
      (formErrors) => {
        handleBuyerValidationFailure(formErrors)
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

  function selectionCapForItem(item: StorefrontSelectedItem) {
    const tierId = resolveItemTierId(item)
    const tier = displayTiers.find((row) => row.id === tierId)
    return purchaseCapForTier({
      layoutType:
        item.type === "table" ? "table_combo" : tier?.layoutType,
      maxPurchaseLimit: tier?.maxPurchaseLimit,
      fallbackMax: maxTicketsPerUser,
    })
  }

  function handleImmersiveZoneSelect(zone: VenueMapZone) {
    if (purchaseLocked || soldOutZoneIds.includes(zone.id)) return
    focusSelectedZone(zone)
    useCheckoutStore.getState().setSeatSheetOpen(true)
    if (classifyZoneClick(zone, liveMap) === "SECTOR_NUMERADO") return
    const previous = selectedItems.find(
      (item) =>
        item.id === zone.id &&
        itemMatchesActiveDay(item),
    )
    const previousQty = previous ? Math.max(0, previous.capacity || 0) : 0
    if (previousQty <= 0) {
      applyZoneQuantity(zone.id, 1)
    }
  }

  function applyZoneQuantity(sectorId: string, quantity: number) {
    const previous = selectedItems.find(
      (item) =>
        item.id === sectorId &&
        itemMatchesActiveDay(item),
    )
    const previousQty = previous ? Math.max(1, previous.capacity || 1) : 0
    if (quantity <= 0) {
      useStorefrontSeatStore.getState().removeSelectedItem(
        previous
          ? storefrontSelectionKey(previous)
          : storefrontSelectionKey({
              id: sectorId,
              eventDateId: selectedDateId,
              dateId: selectedDateId,
            }),
      )
      const clearedTierId = resolveTierIdForUniversalSector(
        sectorId,
        (liveMap?.zones ?? []).find((item) => item.id === sectorId)?.name ??
          (liveMap?.sectors ?? []).find((item) => item.id === sectorId)?.name ??
          "",
        checkoutTierInput,
        previous?.ticketTierId,
      )
      if (clearedTierId) updateQuantity(clearedTierId, 0, 0)
      return
    }
    const zone = (liveMap?.zones ?? []).find((item) => item.id === sectorId)
    const sectorName =
      zone?.name ??
      liveMap?.sectors.find((item) => item.id === sectorId)?.name ??
      ""
    const resolvedZoneTierId = resolveTierIdForUniversalSector(
      sectorId,
      sectorName,
      checkoutTierInput,
      previous?.ticketTierId,
    )
    if (zone) {
      const fromZone = storefrontItemFromZone(zone, priceBySectorId)
      const catalogPrice = mapSelectionUnitPrice(
        fromZone?.price ?? zone.price,
        resolvedZoneTierId,
        displayTiers,
      )
      const result = useStorefrontSeatStore.getState().upsertSelectedItem(
        withCheckoutEventDateId(
          {
            ...(fromZone ?? {
              id: zone.id,
              name: zone.name,
              type: "zone" as const,
              price: catalogPrice,
              sectorId: zone.id,
              color: zone.color,
              sellMode: zone.sellMode,
              priceMode: zone.priceMode ?? venuePriceModeFromSellMode(zone.sellMode),
              inventoryType: "GENERAL_ADMISSION" as const,
            }),
            ticketTierId: resolvedZoneTierId ?? previous?.ticketTierId,
            price: catalogPrice,
            capacity: Math.max(1, quantity),
            seatLabel: fromZone?.seatLabel ?? zone.name,
          },
          selectedDateId,
          {
            dateString: scheduleDayCartLabel(selectedDateId, scheduleDays),
            seatLabel: fromZone?.seatLabel ?? zone.name,
          },
        ),
        selectionCapForItem({
          id: zone.id,
          name: zone.name,
          type: "zone",
          price: zone.price,
          capacity: Math.max(1, quantity),
          sectorId: zone.id,
        }),
      )
      if (!result.ok) {
        toast.error(storefrontLimitMessage(result.reason))
        return
      }
      if (quantity > previousQty) {
        fireAddToCartPixels({
          contentIds: [zone.id],
          value: (zone.price ?? 0) * (quantity - previousQty),
          numItems: quantity - previousQty,
        })
      }
      focusSelectedZone(zone)
      useStorefrontSeatStore.getState().pulseFocus([zone.id])
    } else {
      setFocusedZoneId(sectorId)
      setCheckoutStep("tickets")
    }
    const tierId = resolvedZoneTierId
    if (!tierId) return
    const tier = displayTiers.find((item) => item.id === tierId)
    const stock = selectableTicketStock(tier ?? { available: 0 })
    if (!tier || stock <= 0) {
      useCheckoutStore.getState().setTicketError(tierId, CHECKOUT_NO_STOCK_INLINE)
      toastCheckoutStock()
      return
    }
    updateQuantity(
      tierId,
      Math.min(
        purchaseCapForTier({
          layoutType: tier.layoutType,
          maxPurchaseLimit: tier.maxPurchaseLimit,
          fallbackMax: maxTicketsPerUser,
        }),
        Math.max(1, quantity),
        stock,
      ),
      Math.min(
        purchaseCapForTier({
          layoutType: tier.layoutType,
          maxPurchaseLimit: tier.maxPurchaseLimit,
          fallbackMax: maxTicketsPerUser,
        }),
        stock,
      ),
    )
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
    if (scheduleDayCount >= 2 && !selectedDateId) {
      toast.error("Elegí la jornada antes de reservar un lugar.")
      return
    }
    const store = useStorefrontSeatStore.getState()
    const datedSeats = seats.map((seat) => ({
      ...seat,
      eventDateId: seat.eventDateId ?? selectedDateId ?? undefined,
      label:
        seat.label?.trim() ||
        cartPlaceLabel({
          type: "seat",
          row: seat.row,
          number: seat.number,
        }) ||
        seat.label,
    }))
    const result = store.setLayoutSeats(datedSeats, maxTicketsPerUser)
    if (!result.ok) {
      toast.error(storefrontLimitMessage(result.reason))
      return
    }
    store.pulseFocus(seats.map((seat) => seat.id))
    if (seats.length > 0) {
      fireAddToCartPixels({
        contentIds: seats.map((seat) => seat.id),
        value: seats.reduce((sum, seat) => sum + (seat.price ?? 0), 0),
        numItems: seats.length,
      })
    }
  }

  function applyAssignedTables(tables: VenueMapElement[]) {
    if (scheduleDayCount >= 2 && !selectedDateId) {
      toast.error("Elegí la jornada antes de reservar un lugar.")
      return
    }
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
      const item = storefrontItemFromElement(table, priceBySectorId, liveMap)
      if (!item) continue
      const tierId = resolveItemTierId(item)
      const result = store.upsertSelectedItem(
        withCheckoutEventDateId(
          {
            ...item,
            ticketTierId: tierId ?? item.ticketTierId,
            price: mapSelectionUnitPrice(item.price, tierId, displayTiers),
            seatLabel: item.seatLabel ?? item.name,
          },
          selectedDateId,
          {
            dateString: scheduleDayCartLabel(selectedDateId, scheduleDays),
            seatLabel: item.seatLabel ?? item.name,
          },
        ),
        selectionCapForItem(item),
      )
      if (!result.ok) {
        toast.error(storefrontLimitMessage(result.reason))
        break
      }
      ids.push(table.id)
    }
    if (ids.length > 0) {
      store.pulseFocus(ids)
      fireAddToCartPixels({
        contentIds: ids,
        value: tables.reduce((sum, table) => sum + (table.price ?? 0), 0),
        numItems: ids.length,
      })
    }
  }

  function handlePrimaryCta() {
    if (isProcessingRef.current || checkoutBusy || purchaseLocked) return
    if (visibleStep === "tickets") {
      if (!canProceedFromCart) {
        toastEmptyCheckoutCart()
        return
      }
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
    if (!acceptedTerms) return
    handleConfirmPay()
  }

  const simulatePayment = isDraftPreview || sandboxEligible

  function handleConfirmPay() {
    if (isProcessingRef.current || checkoutBusy || purchaseLocked) return
    if (!acceptedTerms || !canProceedFromCart) return
    if (!identityReady) {
      useCheckoutStore.getState().chooseGuest(eventId, eventSlug)
    }
    if (availableExtras.length > 0 && !upsellSkipped) {
      setCheckoutStep("upsell")
      return
    }
    void runCheckoutBusy(async () => {
      await buyerForm.handleSubmit(
        (values) => submitCheckout(undefined, simulatePayment, values),
        (formErrors) => {
          handleBuyerValidationFailure(formErrors)
        },
      )()
    })
  }

  function handleSandboxReserve() {
    if (isProcessingRef.current || checkoutBusy || purchaseLocked) return
    if (
      !acceptedTerms ||
      !(isDraftPreview || sandboxEligible) ||
      !canProceedFromCart
    ) {
      return
    }
    if (!identityReady) {
      useCheckoutStore.getState().chooseGuest(eventId, eventSlug)
    }
    void runCheckoutBusy(async () => {
      await buyerForm.handleSubmit(
        (values) => submitCheckout(undefined, true, values),
        (formErrors) => {
          handleBuyerValidationFailure(formErrors)
        },
      )()
    })
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
    setFocusedZoneId(null)
    if (hasInteractiveMap) {
      useCheckoutStore.getState().setSeatSheetOpen(true)
      return
    }
    setShowSeatFlow(true)
    if (!identityReady) {
      useCheckoutStore.getState().chooseGuest(eventId, eventSlug)
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
    const items = buildCheckoutItems()
    if (items.length === 0) {
      toastEmptyCheckoutCart()
      return false
    }
    if (!(await ensureGuestAuthForHold())) return false
    useCheckoutStore.getState().clearTicketError()
    try {
      const result = await lockTickets(
        eventId,
        items,
        previewKey,
        checkoutSessionId(),
      )
      if (!result.success) {
        if (result.error === "auth_required") {
          useCheckoutStore.getState().chooseGuest(eventId, eventSlug)
          const retry = await lockTickets(
            eventId,
            items,
            previewKey,
            checkoutSessionId(),
          )
          if (!retry.success) {
            applyCheckoutActionError(retry.error, CHECKOUT_GENERIC_TOAST, {
              code: retry.code,
              ticketId: retry.ticketId,
            })
            router.refresh()
            return false
          }
          useCheckoutStore.getState().clearTicketError()
          const next = minReservedUntil(
            retry.reservedUntil,
            useCheckoutStore.getState().holdExpiresAt,
          )
          if (next) useCheckoutStore.getState().setHoldExpiresAt(next)
          return true
        }
        applyCheckoutActionError(result.error, CHECKOUT_GENERIC_TOAST, {
          code: result.code,
          ticketId: result.ticketId,
        })
        router.refresh()
        return false
      }
      useCheckoutStore.getState().clearTicketError()
      const next = minReservedUntil(
        useCheckoutStore.getState().holdExpiresAt,
        result.reservedUntil,
      )
      if (next) useCheckoutStore.getState().setHoldExpiresAt(next)
      return true
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "out_of_stock"
      applyCheckoutActionError(message, CHECKOUT_GENERIC_TOAST)
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
      const stock = selectableTicketStock(tier ?? { available: 0 })
      if (!tier || stock <= 0) {
        useCheckoutStore.getState().setTicketError(tierId, CHECKOUT_NO_STOCK_INLINE)
        toastCheckoutStock()
        return
      }
      updateQuantity(
        tierId,
        selectionPayload.quantity,
        Math.min(
          purchaseCapForTier({
            layoutType: tier.layoutType,
            maxPurchaseLimit: tier.maxPurchaseLimit,
            fallbackMax: maxTicketsPerUser,
          }),
          stock,
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
    const comboSource = displayTiers.find((item) => item.id === focusedTierId)
    const comboTierId =
      comboSource && isComboPackOffer(comboSource) ? comboSource.id : null
    const comboDays = comboSource
      ? comboScheduleIdsFromTier(comboSource, scheduleDays)
      : []
    const seatingCap = mapPlaceSelectionCap({
      layoutType: "table_combo",
      fallbackMax: maxTicketsPerUser,
      isTable: true,
    })
    if (seats.length > seatingCap) {
      toast.error(
        `Podés reservar hasta ${seatingCap} ubicaciones numeradas por compra.`,
      )
      return
    }

    async function applyNumbered(
      unit: EventSeatingUnit,
      existingHold?: {
        reservedUntil: string
        seatingUnitId?: string
        seatingUnitIds?: string[]
      },
    ) {
      if (!(await ensureGuestAuthForHold())) return false
      if (
        !existingHold &&
        unit.status !== "available" &&
        unit.status !== "reserved"
      ) {
        toast.error("El lugar seleccionado ya no está disponible.")
        router.refresh()
        return false
      }
      const hold = existingHold
        ? {
            success: true as const,
            reservedUntil: existingHold.reservedUntil,
            seatingUnitId: existingHold.seatingUnitId ?? unit.id,
            seatingUnitIds: existingHold.seatingUnitIds,
          }
        : comboTierId && (unit.layoutItemId || unit.id)
          ? await holdSeatingUnitForCartByLayoutItem(
              eventId,
              unit.sectorId,
              unit.layoutItemId || unit.id,
              previewKey,
              unit.eventDateId ?? selectedDateId,
              checkoutSessionId(),
              comboTierId,
            )
          : await holdSeatingUnitForCart(
              eventId,
              unit.id,
              previewKey,
              checkoutSessionId(),
            )
      if (!hold.success) {
        if (hold.error === HIGH_DEMAND_LOCK_TIMEOUT) {
          toast.error(HIGH_DEMAND_LOCK_MESSAGE)
          return false
        }
        toast.error(
          isSectorNotConfiguredError(hold.error) ||
            hold.error === "not_materialized"
            ? SECTOR_NOT_CONFIGURED_MESSAGE
            : hold.error === "out_of_stock" ||
                hold.error === "auth_required" ||
                isSeatUnavailableError(hold.error)
              ? SEAT_UNAVAILABLE_MESSAGE
              : hold.error,
        )
        router.refresh()
        return false
      }
      const tableMatch = String(unit.label ?? "").match(/(\d+)/)
      setSelectedSeat({
        tierId: comboTierId ?? unit.tierId,
        seatingUnitId: unit.id,
        sectorKey: unit.sectorId,
        tableNumber: tableMatch ? Number(tableMatch[1]) : null,
        label: unit.label || "Ubicación numerada",
        price: selectionPayload.unitPrice,
      })
      const store = useStorefrontSeatStore.getState()
      const unitDateId = unit.eventDateId ?? selectedDateId
      const unitLabel = unit.label || "Ubicación numerada"
      const heldIds =
        ("seatingUnitIds" in hold && hold.seatingUnitIds?.length
          ? hold.seatingUnitIds
          : null) ??
        ("seatingUnitId" in hold && hold.seatingUnitId
          ? [hold.seatingUnitId]
          : [unit.id])
      const upserted = store.upsertSelectedItem(
        withCheckoutEventDateId(
          {
            id: unit.layoutItemId || unit.id,
            name: unitLabel,
            type: unit.layoutType === "table_combo" ? "table" : "seat",
            price: selectionPayload.unitPrice,
            capacity: Math.max(1, unit.capacityPerUnit || 1),
            sectorId: unit.sectorId,
            sectorName: unit.sectorName,
            color: unit.color,
            ticketTierId: comboTierId ?? unit.tierId,
            comboTierId: comboTierId ?? undefined,
            comboScheduleIds: comboDays.length > 1 ? comboDays : undefined,
            heldSeatingUnitIds: heldIds,
            seatLabel: unitLabel,
          },
          unitDateId,
          {
            dateString:
              comboDays.length > 1
                ? "Todos los días"
                : scheduleDayCartLabel(unitDateId, scheduleDays),
            seatLabel: unitLabel,
          },
        ),
        mapPlaceSelectionCap({
          layoutType: unit.layoutType,
          fallbackMax: maxTicketsPerUser,
          isTable: unit.layoutType === "table_combo",
        }),
      )
      if (!upserted.ok) {
        toast.error(storefrontLimitMessage(upserted.reason))
        return false
      }
      if (hold.success) {
        useCheckoutStore.getState().setHoldExpiresAt(hold.reservedUntil)
      }
      setFocusedZoneId(selectionPayload.sectorId)
      setFocusedTierId(comboTierId ?? unit.tierId)
      return true
    }

    startTransition(async () => {
      for (const seat of seats) {
        const cached = seat.seatingUnitId
          ? mergedSeatingUnits.find((unit) => unit.id === seat.seatingUnitId)
          : null
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
          previewKey,
          selectedDateId,
          checkoutSessionId(),
          comboTierId,
        )
        if (!hold.success) {
          if (hold.error === MISSING_EVENT_DATE_ID) {
            toast.error(MISSING_EVENT_DATE_ID_MESSAGE)
            return
          }
          if (hold.error === HIGH_DEMAND_LOCK_TIMEOUT) {
            toast.error(HIGH_DEMAND_LOCK_MESSAGE)
            return
          }
          toast.error(
            isSectorNotConfiguredError(hold.error) ||
              hold.error === "not_materialized"
              ? SECTOR_NOT_CONFIGURED_MESSAGE
              : hold.error === "out_of_stock" ||
                  hold.error === "auth_required" ||
                  isSeatUnavailableError(hold.error)
                ? SEAT_UNAVAILABLE_MESSAGE
                : hold.error,
          )
          router.refresh()
          return
        }
        const holdDateId =
          asHoldEventDateId(hold.eventDateId) ??
          asHoldEventDateId(selectedDateId) ??
          comboDays[0] ??
          null
        const units = await getEventSeatingUnitsForSector(
          eventId,
          selectionPayload.sectorId,
          holdDateId,
        )
        const cacheKey = `${selectionPayload.sectorId}::${holdDateId ?? selectedDateId ?? ""}`
        setLoadedUnitsBySector((current) => ({
          ...current,
          [cacheKey]: units,
        }))
        const unit =
          units.find((item) => item.id === hold.seatingUnitId) ??
          units.find(
            (item) =>
              item.layoutItemId === seat.id &&
              seatingUnitMatchesEventDate(
                { event_date_id: item.eventDateId },
                holdDateId,
                { scheduleDayCount },
              ),
          )
        if (!unit) {
          toast.error("El inventario de esta zona todavía no está publicado.", {
            description:
              "No se puede comprar un tablón hasta que el stock esté materializado.",
          })
          router.refresh()
          return
        }
        const ok = await applyNumbered(unit, {
          reservedUntil: hold.reservedUntil,
          seatingUnitId: hold.seatingUnitId,
          seatingUnitIds: hold.seatingUnitIds,
        })
        if (!ok) return
      }
      if (!options?.keepOpen && !hasInteractiveMap) returnToCheckout()
    })
  }

  const loadSectorUnits = useCallback(async (sectorId: string) => {
    const cacheKey = `${sectorId}::${selectedDateId ?? ""}`
    const cached = loadedUnitsRef.current[cacheKey]
    if (cached) return cached
    const units = seatingUnitsForOccupancyDay(
      await getEventSeatingUnitsForSector(eventId, sectorId, selectedDateId),
      { eventDateId: selectedDateId, scheduleDayCount },
    )
    loadedUnitsRef.current = { ...loadedUnitsRef.current, [cacheKey]: units }
    setLoadedUnitsBySector((current) =>
      current[cacheKey] ? current : { ...current, [cacheKey]: units },
    )
    return units
  }, [eventId, scheduleDayCount, selectedDateId])

  const loadAllUnits = useCallback(async () => {
    const units = seatingUnitsForOccupancyDay(
      await getEventSeatingAvailability(eventId, selectedDateId),
      { eventDateId: selectedDateId, scheduleDayCount },
    )
    const bySector: Record<string, EventSeatingUnit[]> = {}
    for (const unit of units) {
      const key = `${unit.sectorId || "_sector"}::${selectedDateId ?? ""}`
      ;(bySector[key] ??= []).push(unit)
    }
    loadedUnitsRef.current = { ...loadedUnitsRef.current, ...bySector }
    setLoadedUnitsBySector((current) => ({ ...current, ...bySector }))
    return units
  }, [eventId, scheduleDayCount, selectedDateId])

  const seatFlowOverlay =
    showSeatFlow && !hasInteractiveMap ? (
      <AppTakeover className="z-[100] overscroll-none">
        <AdaptiveSeatingFlow
          takeover
          pending={isPending || controlsLocked}
          maxSelectable={mapSelectionCap}
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
          scheduleDayCount={scheduleDayCount}
        />
      </AppTakeover>
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

  const hasSelectedExtras = availableExtras.some(
    (extra) =>
      quantityForPublicTier(storeQuantities, extra, { undated: true }) > 0,
  )
  const stepTitle =
    visibleStep === "tickets"
      ? "Elegí tu entrada"
      : visibleStep === "upsell"
        ? "¿Sumás algo más?"
        : visibleStep === "details"
          ? "Confirmá tus datos"
          : "Confirmá el pago"
  const ticketQty = Math.max(totalTickets, sumCartQuantities(cartLines))
  const ticketsCtaNoun = ticketQty === 1 ? "entrada" : "entradas"
  const stepCta =
    visibleStep === "tickets"
      ? ticketQty > 0 && finalTotal === 0
        ? "Continuar - Gratis"
        : `Continuar · ${ticketQty} ${ticketsCtaNoun}`
      : visibleStep === "upsell"
        ? hasSelectedExtras
          ? "Sumar extras y seguir"
          : "Seguir sin agregar extras"
        : visibleStep === "details"
          ? isFreeCheckout
            ? "Obtener entrada gratis"
            : "Continuar al pago"
          : simulatePayment
            ? "Simular Pago (Modo Prueba)"
            : isFreeCheckout
              ? "Obtener entrada gratis"
              : `Confirmar y Pagar ${formatCartTotal(finalTotal)}`

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
          total: row.total,
          tierId: row.tierId,
          eventDateId: row.eventDateId,
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
      <CheckoutHeader
        step={visibleStep}
        holdExpiresAt={showReservationTimer ? holdExpiresAt : null}
        maxTicketsPerUser={maxTicketsPerUser}
        safeAreaTop={!isDraftPreview}
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
        ref={panelBodyRef}
        className="no-scrollbar flex-1 min-h-0 min-w-0 space-y-3 overflow-x-hidden overflow-y-auto p-4"
      >
        <div className="mx-auto w-full max-w-7xl">
          {visibleStep !== "tickets" ? (
            <h2 className="mb-3 line-clamp-2 break-words pt-2 text-lg font-black text-foreground md:mb-4 md:text-xl">
              {stepTitle}
            </h2>
          ) : null}
          <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-8">
            <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
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
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: "easeInOut" }}
              >
              <CheckoutTicketList
                tiers={admissionTiers}
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
                selectedPlaceCount={storefrontSelectionCount(
                  liveSelectedItems.filter((item) => itemMatchesActiveDay(item)),
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
                    void releaseSeatingUnitCartHold(
                      eventId,
                      seat.seatingUnitId,
                      checkoutSessionId(),
                    )
                  }
                }}
                selectedDateId={selectedDateId}
                onSelectedDateIdChange={handleSelectedDateIdChange}
                onFocusedTierIdChange={setFocusedTierId}
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
                quantities={storeQuantities}
                isPending={controlsLocked}
                onQuantityChange={updateQuantity}
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
                isOnline={isOnline}
                eventId={eventId}
                cartSubtotal={cartSubtotal}
                ticketsSubtotal={ticketsSubtotal}
                discountAmount={discountAmount}
                finalTotal={finalTotal}
                totalTickets={totalTickets}
                appliedPromo={appliedPromo}
                appliedPromoter={appliedPromoter}
                attributionLocked={Boolean(appliedPromo?.promoterId)}
                initialPromoterCode={resolvedRef}
                selectedProvider={paymentProvider}
                acceptsMercadoPago={acceptsMercadoPago}
                sandboxEligible={sandboxEligible}
                isDraftPreview={isDraftPreview}
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
                onAppliedPromo={handleAppliedPromo}
                onClearedPromo={handleClearedPromo}
                onAppliedPromoter={(preview) =>
                  applyPromoterAttribution(preview, "manual")
                }
                onClearedPromoter={() => {
                  setReferralCleared(true)
                  setManualReferralCode(null)
                  setAppliedPromoter(null)
                }}
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
                isOnline={isOnline}
                eventId={eventId}
                cartSubtotal={cartSubtotal}
                ticketsSubtotal={ticketsSubtotal}
                discountAmount={discountAmount}
                finalTotal={finalTotal}
                totalTickets={totalTickets}
                appliedPromo={appliedPromo}
                appliedPromoter={appliedPromoter}
                attributionLocked={Boolean(appliedPromo?.promoterId)}
                initialPromoterCode={resolvedRef}
                selectedProvider={paymentProvider}
                acceptsMercadoPago={acceptsMercadoPago}
                sandboxEligible={sandboxEligible}
                isDraftPreview={isDraftPreview}
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
                onAppliedPromo={handleAppliedPromo}
                onClearedPromo={handleClearedPromo}
                onAppliedPromoter={(preview) =>
                  applyPromoterAttribution(preview, "manual")
                }
                onClearedPromoter={() => {
                  setReferralCleared(true)
                  setManualReferralCode(null)
                  setAppliedPromoter(null)
                }}
                onSelectProvider={setSelectedProvider}
                onSandboxReserve={handleSandboxReserve}
                onDetailsSubmit={goToPaymentMethods}
                onConfirmPay={handlePrimaryCta}
                confirmPending={checkoutBusy}
                confirmLocked={purchaseLocked}
                acceptedTerms={acceptedTerms}
                onAcceptedTermsChange={setAcceptedTerms}
              />
            </motion.div>
          )}
        </AnimatePresence>
        </div>
        <div className="hidden min-h-0 lg:col-span-5 lg:block">
          <div className="lg:sticky lg:top-6">
          <CheckoutSelectionSidebar
            seatSelection={visibleStep === "tickets" ? seatSelection : null}
            maxSelectable={mapSelectionCap}
            cta={{
              label: stepCta,
              showArrow: visibleStep !== "payment",
              formId:
                visibleStep === "payment" ? "checkout-payment-form" : undefined,
              pending: checkoutBusy,
              pendingLabel:
                visibleStep === "payment"
                  ? simulatePayment
                    ? "Simulando pago"
                    : "Procesando pago..."
                  : "Procesando pago...",
              disabled:
                checkoutBusy ||
                (visibleStep === "tickets" && !canProceedFromCart) ||
                (visibleStep === "payment" && !acceptedTerms),
              locked: purchaseLocked,
              pulse: highlightContinue,
              onClick: handlePrimaryCta,
            }}
            legalConsent={
              visibleStep === "payment"
                ? {
                    checked: acceptedTerms,
                    onCheckedChange: setAcceptedTerms,
                    disabled: controlsLocked,
                  }
                : null
            }
          />
          </div>
        </div>
        </div>
        </div>
      </div>

      <div className="mt-auto shrink-0 lg:hidden">
        <CheckoutFloatingBar
          variant="panel"
          actionLabel={stepCta}
          formId={
            visibleStep === "payment" ? "checkout-payment-form" : undefined
          }
          showArrow={visibleStep !== "payment" || isFreeCheckout}
          totalAmount={finalTotal}
          itemsCount={ticketQty}
          optionalStep={visibleStep === "upsell"}
          hasAddedItems={hasSelectedExtras}
          disabled={
            checkoutBusy ||
            (visibleStep === "tickets" && !canProceedFromCart) ||
            (visibleStep === "payment" && !acceptedTerms)
          }
          pending={checkoutBusy}
          pendingLabel="Procesando pago..."
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
