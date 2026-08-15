"use client"

import {
  ChevronLeft,
  LoaderCircle,
  Maximize2,
  Minimize2,
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
import {
  CheckoutStepper,
  type CheckoutFlowStep,
} from "@/components/public/checkout-stepper"
import { AccessibleSeatSelector } from "@/components/public/accessible-seat-selector"
import { SelectionLedger } from "@/components/public/selection-ledger"
import { StorefrontViewToggle } from "@/components/public/storefront-view-toggle"
import { CheckoutIdentityDialog } from "@/components/public/checkout-identity-dialog"
import {
  CheckoutTabBar,
  EventCheckoutSelector,
  groupCheckoutTiers,
  type SelectedNumberedSeat,
} from "@/components/public/event-checkout-selector"
import { Tabs } from "@/components/ui/tabs"
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
import { hasCheckoutIdentity } from "@/lib/checkout/identity"
import {
  resolveDefaultTicketPickerTab,
  type DefaultTicketTab,
} from "@/lib/checkout/ticket-picker"
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
  type InventoryTierType,
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
  seatingLayoutToVenueMap,
  venueMapToSeatingLayout,
} from "@/lib/seating/venue-map-geometry"
import { occupancyFromSeatingUnits } from "@/lib/seating/venue-map-occupancy"
import {
  hydrateStorefrontItemsFromMap,
  storefrontFocusCard,
  storefrontItemFromZone,
} from "@/lib/seating/storefront-selection"
import { StorefrontSelectionCard } from "@/components/public/storefront-selection-card"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"
import { publicEventLoginPath } from "@/lib/seo/site"
import { useCheckoutIntentStore } from "@/lib/stores/checkout-intent-store"
import {
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
      <div className="flex h-full w-full items-center justify-center bg-zinc-950">
        <LoaderCircle
          className="size-8 animate-spin text-white/40"
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
  renderLayout?: (parts: { map: ReactNode; panel: ReactNode }) => ReactNode
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
  renderLayout,
}: TicketSelectorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const controlsLocked = isPending || purchaseLocked
  const [showSeatFlow, setShowSeatFlow] = useState(false)
  const portalReady = typeof document !== "undefined"
  const [identityOpen, setIdentityOpen] = useState(false)
  const checkoutMode = useCheckoutIntentStore((state) => state.mode)
  const [selectedSeat, setSelectedSeat] = useState<SelectedNumberedSeat | null>(
    null,
  )
  const [showUpsell, setShowUpsell] = useState(false)
  const [upsellSkipped, setUpsellSkipped] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState<CheckoutFlowStep>("tickets")
  const [focusedZoneId, setFocusedZoneId] = useState<string | null>(null)
  const [focusedTierId, setFocusedTierId] = useState<string | null>(null)
  const storefrontView = useStorefrontSeatStore((state) => state.view)
  const setStorefrontView = useStorefrontSeatStore((state) => state.setView)
  const layoutSeats = useStorefrontSeatStore((state) => state.layoutSeats)
  const selectedItems = useStorefrontSeatStore((state) => state.selectedItems)
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
    useStorefrontSeatStore.getState().bindEvent(eventId)
  }, [eventId])

  const checkoutTierInput = useMemo(
    () =>
      displayTiers.map((tier) => ({
        id: tier.id,
        name: tier.name,
        price: tier.price,
        available: tier.available,
        seatingSectorId: tier.seatingSectorId,
        layoutType: tier.layoutType,
      })),
    [displayTiers],
  )
  const mapDrivenTierIds = useRef(new Set<string>())

  useEffect(() => {
    const counts: Record<string, number> = {}
    for (const item of selectedItems) {
      if (item.type === "seat") continue
      const sectorName = item.name.split(" · ")[0] ?? item.name
      const tierId = resolveTierIdForUniversalSector(
        item.sectorId ?? item.id,
        sectorName,
        checkoutTierInput,
      )
      if (!tierId) continue
      counts[tierId] =
        (counts[tierId] ?? 0) + Math.max(1, Math.floor(item.capacity) || 1)
    }
    const nextDriven = new Set(Object.keys(counts))
    setQuantities((current) => {
      let changed = false
      const next = { ...current }
      for (const [tierId, target] of Object.entries(counts)) {
        const max = Math.min(
          MAX_TICKETS_PER_PURCHASE,
          Math.max(
            0,
            displayTiers.find((tier) => tier.id === tierId)?.available ?? target,
          ),
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
  }, [checkoutTierInput, displayTiers, selectedItems])

  function resolveItemTierId(item: StorefrontSelectedItem) {
    const sectorName = item.name.split(" · ")[0] ?? item.name
    return resolveTierIdForUniversalSector(
      item.sectorId ?? item.id,
      sectorName,
      checkoutTierInput,
    )
  }

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
  const panelBodyRef = useRef<HTMLDivElement>(null)

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
      setCheckoutStep("details")
    }
    void ensureGuestCheckoutSession()
  }

  const hasInteractiveMap =
    hasInteractiveMapProp || hasInteractiveVenueMap(liveMap)
  const [mapExpanded, setMapExpanded] = useState(false)
  useLockBodyScroll(showSeatFlow)

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

  const checkoutGroups = useMemo(
    () => groupCheckoutTiers(displayTiers),
    [displayTiers],
  )
  const ticketTabs = useMemo(
    () =>
      (
        [
          hasSeatingFlow || checkoutGroups.seated.length > 0 ? "seated" : null,
          checkoutGroups.general.length > 0 ? "general" : null,
          checkoutGroups.bundle.length > 0 ? "bundle" : null,
          checkoutGroups.addon.length > 0 ? "addon" : null,
        ] as Array<InventoryTierType | null>
      ).filter((tab): tab is InventoryTierType => Boolean(tab)),
    [checkoutGroups, hasSeatingFlow],
  )
  const defaultPickerTab = useMemo(
    () =>
      resolveDefaultTicketPickerTab({
        tabs: ticketTabs,
        grouped: checkoutGroups,
        configured: defaultTicketTab,
      }),
    [checkoutGroups, defaultTicketTab, ticketTabs],
  )
  const [ticketTabOverride, setTicketTabOverride] =
    useState<InventoryTierType | null>(null)
  const ticketTab =
    ticketTabOverride && ticketTabs.includes(ticketTabOverride)
      ? ticketTabOverride
      : defaultPickerTab

  const visibleZoneId =
    focusedZoneId && selectedItems.some((item) => item.id === focusedZoneId)
      ? focusedZoneId
      : (selectedItems.find((item) => item.type === "zone")?.id ?? null)

  const priceBySectorId = useMemo(() => {
    const prices: Record<string, number> = {}
    for (const tier of displayTiers) {
      if (Number.isFinite(tier.price)) {
        if (tier.seatingSectorId) prices[tier.seatingSectorId] = tier.price
        if (tier.name.trim()) prices[tier.name.trim()] = tier.price
      }
    }
    return prices
  }, [displayTiers])
  const liveSelectedItems = useMemo(
    () => hydrateStorefrontItemsFromMap(selectedItems, liveMap, priceBySectorId),
    [liveMap, priceBySectorId, selectedItems],
  )

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

  const occupancyBySeatId = useMemo(
    () =>
      occupancyFromSeatingUnits(
        mergedSeatingUnits.map((unit) => ({
          layoutItemId: unit.layoutItemId,
          status: unit.status,
        })),
      ),
    [mergedSeatingUnits],
  )

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

  const extraNumbered = selectedSeat ? Math.max(0, layoutSeats.length - 1) : 0
  const seatLineCount = (selectedSeat ? 1 : layoutSeats.length) + extraNumbered
  const numberedSubtotal = selectedSeat
    ? selectedSeat.price +
      layoutSeats.slice(1).reduce((sum, seat) => sum + seat.price, 0)
    : layoutSeats.reduce((sum, seat) => sum + seat.price, 0)
  const totalTickets =
    selection.reduce((sum, tier) => sum + tier.quantity, 0) + seatLineCount
  const ticketsSubtotal = roundMoney(
    selection.reduce((sum, tier) => sum + tier.subtotal, 0) + numberedSubtotal,
  )
  // All-In: tier.price already includes Tokepass fee.
  const cartSubtotal = ticketsSubtotal
  const discountAmount = appliedPromo
    ? Math.min(appliedPromo.discountAmount, cartSubtotal)
    : 0
  const totalAmount = roundMoney(Math.max(0, cartSubtotal - discountAmount))
  const visibleStep: CheckoutFlowStep =
    totalTickets > 0 ? checkoutStep : "tickets"
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
    const clamped = Math.min(Math.max(0, next), max)
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

  function goToDetailsStep() {
    if (
      (selection.length === 0 && !selectedSeat && selectedItems.length === 0) ||
      controlsLocked
    )
      return
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
    if (hasPendingAddonUpsell() && !upsellSkipped) {
      setShowUpsell(true)
      return
    }
    if (!identityReady) {
      useCheckoutIntentStore.getState().chooseGuest(eventId, eventSlug)
      void ensureGuestCheckoutSession()
    }
    setCheckoutStep("details")
    panelBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })
  }

  function goToPaymentMethods() {
    if (
      (selection.length === 0 && !selectedSeat && selectedItems.length === 0) ||
      controlsLocked
    )
      return
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
    const tab = inferInventoryTierType({
      tierType: tier.tierType,
      layoutType: tier.layoutType,
      category: tier.category,
      bundleItems: (tier.comboItems ?? []).map((item, index) => ({
        tierId: `${tier.id}-${index}`,
        quantity: item.quantity,
      })),
    })
    if (ticketTabs.includes(tab)) setTicketTabOverride(tab)
    setFocusedTierId(tierId)
    ensureCartHoldClock()
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
      MAX_TICKETS_PER_PURCHASE,
    )
    if (!result.ok) {
      toast.error("Alcanzaste el máximo de lugares permitidos por compra")
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
        },
        MAX_TICKETS_PER_PURCHASE,
      )
      if (!result.ok) {
        toast.error("Alcanzaste el máximo de lugares permitidos por compra")
        return
      }
      focusSelectedZone(zone)
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
      Math.min(MAX_TICKETS_PER_PURCHASE, Math.max(1, quantity), tier.available),
      Math.min(MAX_TICKETS_PER_PURCHASE, Math.max(0, tier.available)),
    )
    ensureCartHoldClock()
    setFocusedTierId(tierId)
  }

  function applyLayoutSeats(seats: StorefrontLayoutSeat[]) {
    const result = useStorefrontSeatStore
      .getState()
      .setLayoutSeats(seats, MAX_TICKETS_PER_PURCHASE)
    if (!result.ok) {
      toast.error("Alcanzaste el máximo de lugares permitidos por compra")
    }
  }

  function handleListToggleSeat(seat: StorefrontLayoutSeat) {
    const result = useStorefrontSeatStore
      .getState()
      .toggleLayoutSeat(seat, MAX_TICKETS_PER_PURCHASE)
    if (!result.ok) {
      toast.error("Alcanzaste el máximo de lugares permitidos por compra")
      return
    }
    if (!result.added && selectedSeat?.label.includes(String(seat.number))) {
      void releaseSeatingUnitCartHold(eventId, selectedSeat.seatingUnitId)
      setSelectedSeat(null)
    }
  }

  function handlePrimaryCta() {
    if (visibleStep === "tickets") {
      goToDetailsStep()
      return
    }
    if (visibleStep === "details") {
      goToPaymentMethods()
      return
    }
    handleConfirmPay()
  }

  function handleConfirmPay() {
    if (
      (selection.length === 0 && !selectedSeat && selectedItems.length === 0) ||
      controlsLocked
    )
      return
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
        setCheckoutStep("details")
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
      if (!options?.keepOpen && !hasInteractiveMap) returnToCheckout()
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
      if (!options?.keepOpen && !hasInteractiveMap) returnToCheckout()
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
    showSeatFlow && !hasInteractiveMap ? (
      <div className="fixed inset-0 z-[80] flex h-dvh w-screen flex-col overflow-hidden overscroll-none bg-zinc-950">
        <AdaptiveSeatingFlow
          takeover
          pending={controlsLocked}
          eventTitle={eventTitle}
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
      ? "Elegí tu experiencia"
      : visibleStep === "details"
        ? "Tus datos"
        : "Confirmá el pago"
  const stepCta =
    visibleStep === "tickets"
      ? totalTickets > 0
        ? `Continuar con ${totalTickets} ${totalTickets === 1 ? "lugar" : "lugares"}`
        : "Continuar"
      : visibleStep === "details"
        ? "Ir a Medios de Pago"
        : `Confirmar y Pagar ${formatCurrency(totalAmount)}`

  const checkoutPanel = (
    <Tabs
      value={ticketTab}
      onValueChange={(value) => {
        if (
          value === "seated" ||
          value === "general" ||
          value === "bundle" ||
          value === "addon"
        ) {
          setTicketTabOverride(value)
        }
      }}
      className="flex w-full min-w-0 flex-col gap-0 overflow-hidden bg-card text-card-foreground"
    >
      <div className="shrink-0 space-y-3 border-b border-border px-4 pb-3 pt-4">
        <CheckoutStepper step={visibleStep} />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {visibleStep !== "tickets" ? (
              <button
                type="button"
                onClick={() =>
                  setCheckoutStep(
                    visibleStep === "payment" ? "details" : "tickets",
                  )
                }
                className="mb-1 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                Volver
              </button>
            ) : null}
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              {stepTitle}
            </h2>
          </div>
          {visibleStep === "tickets" ? (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border">
              Máx. {MAX_TICKETS_PER_PURCHASE}
            </span>
          ) : null}
        </div>
        {visibleStep === "tickets" && ticketTabs.length > 0 ? (
          <CheckoutTabBar tabs={ticketTabs} grouped={checkoutGroups} />
        ) : null}
      </div>

      <div
        ref={panelBodyRef}
        className="min-h-0 flex-1 overflow-y-auto p-4 pb-6"
      >
        <AnimatePresence mode="wait" initial={false}>
          {visibleStep === "tickets" ? (
            <motion.div
              key="tickets"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.28, ease: "easeInOut" }}
            >
              <EventCheckoutSelector
                hideTabs
                tabValue={ticketTab}
                onTabChange={setTicketTabOverride}
                tiers={displayTiers}
                quantities={quantities}
                isPending={controlsLocked}
                hasSeatingFlow={hasSeatingFlow}
                hasInteractiveMap={hasInteractiveMap}
                mapEmbedded={hasInteractiveMap}
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
                onPurchaseIntent={goToDetailsStep}
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
                  goToDetailsStep()
                }}
                onSkipUpsell={() => {
                  setShowUpsell(false)
                  setUpsellSkipped(true)
                  goToDetailsStep()
                }}
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
              className="space-y-5"
            >
              {holdExpiresAt ? (
                <CheckoutCountdown
                  variant="cart"
                  expiresAt={holdExpiresAt}
                  onExpired={handleHoldExpired}
                />
              ) : null}
              <p className="text-sm text-muted-foreground">
                Los usamos para emitir tu entrada y encontrarte en puerta.
              </p>
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
            </motion.div>
          ) : (
            <motion.div
              key="payment"
              id="checkout-complete"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.28, ease: "easeInOut" }}
              className="space-y-5"
            >
              {holdExpiresAt ? (
                <CheckoutCountdown
                  variant="cart"
                  expiresAt={holdExpiresAt}
                  onExpired={handleHoldExpired}
                />
              ) : null}

              <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Resumen
                </p>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Entradas · {totalTickets}</span>
                  <span className="tabular-nums text-foreground">
                    {formatCurrency(ticketsSubtotal)}
                  </span>
                </div>
                {appliedPromo && discountAmount > 0 ? (
                  <div className="flex items-center justify-between text-sm text-emerald-500">
                    <span>Descuento ({appliedPromo.code})</span>
                    <span className="tabular-nums">
                      −{formatCurrency(discountAmount)}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="font-medium text-foreground">Total</span>
                  <span className="text-xl font-black tabular-nums text-foreground">
                    {formatCurrency(totalAmount)}
                  </span>
                </div>
              </div>

              <PromoCodeInput
                eventId={eventId}
                cartSubtotal={cartSubtotal}
                applied={appliedPromo}
                onApplied={setAppliedPromo}
                onCleared={() => setAppliedPromo(null)}
                disabled={controlsLocked || cartSubtotal <= 0}
              />

              <PaymentMethodSelector
                selectedProvider={selectedProvider}
                onSelectProvider={setSelectedProvider}
                disabled={controlsLocked}
              />

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

      <div className="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur lg:static">
        {visibleStep === "tickets" && liveSelectedItems.length > 0 ? (
          <div className="px-3 pt-3">
            <StorefrontSelectionCard
              card={storefrontFocusCard(
                liveSelectedItems[liveSelectedItems.length - 1]!,
                liveMap,
              )}
            />
          </div>
        ) : null}
        {visibleStep === "tickets" ? (
          <SelectionLedger
            className="border-t-0"
            items={liveSelectedItems}
            onRemove={(id) => {
              useStorefrontSeatStore.getState().removeSelectedItem(id)
              if (selectedSeat && layoutSeats.some((seat) => seat.id === id)) {
                void releaseSeatingUnitCartHold(
                  eventId,
                  selectedSeat.seatingUnitId,
                )
                setSelectedSeat(null)
              }
            }}
          />
        ) : null}
        <CheckoutFloatingBar
          variant="panel"
          actionLabel={stepCta}
          showArrow={visibleStep !== "payment"}
          disabled={visibleStep === "tickets" && totalTickets <= 0}
          pending={isPending && visibleStep === "payment"}
          locked={purchaseLocked}
          onPay={handlePrimaryCta}
        />
      </div>
    </Tabs>
  )

  const mapNode = hasInteractiveMap ? (
    <div className="min-w-0 space-y-2">
      <div
        className={cn(
          "relative w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-zinc-950",
          mapExpanded
            ? "h-[min(72dvh,560px)]"
            : "h-[min(42vh,300px)] sm:h-[min(46vh,360px)] lg:h-[min(52vh,480px)]",
        )}
      >
        <div className="absolute left-2 top-2 z-20 flex max-w-[calc(100%-4.5rem)] items-center gap-2">
          <StorefrontViewToggle
            compact
            value={storefrontView}
            onChange={setStorefrontView}
          />
        </div>
        <button
          type="button"
          className="absolute right-2 top-2 z-20 inline-flex h-7 items-center gap-1 rounded-lg bg-zinc-950/80 px-2 text-[11px] font-semibold text-zinc-100 ring-1 ring-white/15 lg:hidden"
          onClick={() => setMapExpanded((value) => !value)}
        >
          {mapExpanded ? (
            <Minimize2 className="size-3" aria-hidden="true" />
          ) : (
            <Maximize2 className="size-3" aria-hidden="true" />
          )}
          {mapExpanded ? "Reducir" : "Ampliar"}
        </button>
        {storefrontView === "list" ? (
          <div className="h-full overflow-y-auto bg-card p-3 pt-11">
            {liveMap ? (
              <AccessibleSeatSelector
                map={liveMap}
                occupancyBySeatId={occupancyBySeatId}
                selectedSeatIds={layoutSeats.map((seat) => seat.id)}
                selectedZoneId={visibleZoneId}
                unavailableZoneIds={soldOutZoneIds}
                pending={controlsLocked}
                onSelectZone={handleImmersiveZoneSelect}
                onToggleSeat={handleListToggleSeat}
                onAssignSeats={applyLayoutSeats}
                onAssignZoneQuantity={applyZoneQuantity}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                El plano no está disponible.
              </p>
            )}
          </div>
        ) : liveMap ? (
          <AdaptiveSeatingFlow
            immersive
            pending={controlsLocked}
            eventTitle={eventTitle}
            venueMap={liveMap}
            selectedZoneId={visibleZoneId}
            unavailableZoneIds={soldOutZoneIds}
            occupancyBySeatId={occupancyBySeatId}
            priceBySectorId={priceBySectorId}
            sectors={universalPayload?.sectors ?? []}
            onSelectZone={focusSelectedZone}
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
        )}
      </div>
    </div>
  ) : null

  const panelNode = (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-border shadow-xl">
      {checkoutPanel}
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
      {renderLayout ? (
        renderLayout({ map: mapNode, panel: panelNode })
      ) : (
        <div className="min-w-0 space-y-4">
          {mapNode}
          {panelNode}
        </div>
      )}
    </>
  )
}
