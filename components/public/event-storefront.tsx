"use client"

import {
  BadgeCheck,
  Flame,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import { motion } from "motion/react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
} from "react"

import type { EventDetails } from "@/app/actions/public-events"
import { refundPolicyBuyerCopy } from "@/lib/events/refund-policy"
import type { ResaleListingPublic } from "@/app/actions/resale"
import { EventDateSelector } from "@/components/public/event-date-selector"
import { EventActionBar } from "@/components/public/event-action-bar"
import { EventStorefrontBuyBox } from "@/components/public/event-storefront-buy-box"
import { FloatingCheckoutDock } from "@/components/public/floating-checkout-dock"
import { AnalyticsTracker } from "@/components/public/analytics-tracker"
import { EventAboutExpandable } from "@/components/public/event-about-expandable"
import { EventExperienceGallery } from "@/components/public/event-experience-gallery"
import { HeaderInfoBlock } from "@/components/public/event-header-info-block"
import { EventHeroMediaGallery } from "@/components/public/event-hero-media-gallery"
import { EventLineup } from "@/components/public/event-lineup"
import { EventLocationPanel } from "@/components/public/event-location-panel"
import { EventResaleListings } from "@/components/public/event-resale-listings"
import { TokepassGuaranteeBadge } from "@/components/shared/tokepass-guarantee-badge"
import { EventSaleStatusNotice } from "@/components/public/event-sale-status-notice"
import { SponsorGrid } from "@/components/public/sponsor-grid"
import { OrganizerAvatar } from "@/components/public/organizer-avatar"
import { ProducerFollowButton } from "@/components/public/producer-follow-button"
import { SandboxBanner } from "@/components/public/sandbox-banner"
import { ClientErrorBoundary } from "@/components/errors/client-error-boundary"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { AppTakeover } from "@/components/ui/app-takeover"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLockBodyScroll } from "@/hooks/use-lock-body-scroll"
import { releaseCheckoutCartHolds } from "@/lib/checkout/release-cart-holds"
import { fallbackServiceFeeRate } from "@/lib/pricing/event-fees"
import { useCheckoutStore } from "@/lib/stores/checkout-store"
import { useStorefrontChromeStore } from "@/lib/stores/storefront-chrome-store"
import {
  storefrontSelectionCount,
  useStorefrontSeatStore,
} from "@/lib/stores/storefront-seat-store"
import {
  formatEventDay,
  formatEventDayMonthNumeric,
  formatEventWeekdayShort,
} from "@/lib/format"
import {
  publicEventTickets,
  toPublicTicketSelectorTier,
} from "@/lib/checkout/public-ticket-view"
import {
  hasSellablePublicTickets,
  isSellablePublicTicket,
  startingPriceFromSellable,
} from "@/lib/checkout/sellable-tickets"
import { deriveEventSaleState } from "@/lib/event-status"
import { publicProducerPath } from "@/lib/seo/site"
import { useEventCatalogRealtime } from "@/hooks/use-event-catalog-realtime"
import {
  applyEventCatalogRow,
  applyTicketTierCatalogRow,
} from "@/lib/storefront/event-catalog-realtime"
import { cn } from "@/lib/utils"

const TicketSelector = dynamic(
  () =>
    import("@/components/public/ticket-selector").then(
      (mod) => mod.TicketSelector,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        Cargando checkout…
      </div>
    ),
  },
)

function subscribePrefersReducedMotion(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)")
  media.addEventListener("change", onStoreChange)
  return () => media.removeEventListener("change", onStoreChange)
}

function prefersReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

const storefrontStagger = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.1 },
  },
}

const storefrontFade = {
  hidden: { opacity: 0, y: 15 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 260, damping: 20 },
  },
}

type EventStorefrontProps = {
  event: EventDetails
  currentUserId: string | null
  referralCode?: string | null
  initialBuyer?: {
    buyerName?: string
    buyerDni?: string
    buyerEmail?: string
    buyerPhone?: string
  } | null
  resaleListings?: ResaleListingPublic[]
  showBackLink?: boolean
  sandboxEligible?: boolean
  previewKey?: string | null
}

function demandLabel(tiers: EventDetails["tiers"]): string | null {
  const active = tiers.filter((tier) => tier.available > 0)
  if (active.length === 0) return null
  const lowest = Math.min(...active.map((tier) => tier.available))
  if (lowest <= 15) return "¡Quedan pocas entradas!"
  const soldRatio =
    tiers.reduce((sum, tier) => sum + tier.sold, 0) /
    Math.max(
      1,
      tiers.reduce((sum, tier) => sum + tier.capacity, 0),
    )
  if (soldRatio >= 0.65) return "¡Quedan pocas entradas!"
  return null
}

export function EventStorefront({
  event: initialEvent,
  currentUserId,
  referralCode = null,
  initialBuyer = null,
  resaleListings = [],
  showBackLink = true,
  sandboxEligible = false,
  previewKey = null,
}: EventStorefrontProps) {
  const router = useRouter()
  const pathname = usePathname()
  const publishedSlugRef = useRef(initialEvent.slug)
  const [event, setEvent] = useState(initialEvent)
  const [eventBaseline, setEventBaseline] = useState(initialEvent)
  if (initialEvent !== eventBaseline) {
    setEventBaseline(initialEvent)
    setEvent(initialEvent)
  }
  useEventCatalogRealtime(event.id, {
    onEventUpdate: (row) => {
      setEvent((current) => applyEventCatalogRow(current, row))
    },
    onTierChange: (change, row) => {
      setEvent((current) => applyTicketTierCatalogRow(current, change, row))
    },
  }, "storefront")

  useEffect(() => {
    const nextSlug = event.slug?.trim()
    const previousSlug = publishedSlugRef.current?.trim()
    if (!nextSlug || !previousSlug || nextSlug === previousSlug) return
    publishedSlugRef.current = nextSlug
    const currentKey = pathname.match(/\/eventos\/([^/]+)/)?.[1]
    if (!currentKey || currentKey === nextSlug) return
    router.replace(
      pathname.replace(`/eventos/${currentKey}`, `/eventos/${nextSlug}`),
    )
  }, [event.slug, pathname, router])

  const admissionTickets = publicEventTickets(event)
  const startingPrice = startingPriceFromSellable(admissionTickets)
  const hasSellableTickets = hasSellablePublicTickets(admissionTickets)
  const saleState = deriveEventSaleState({
    date: event.date,
    endsAt: event.endsAt,
    scheduleDays: event.scheduleDays ?? [],
    tiers: event.tiers,
  })
  const finished = saleState === "finished"
  const soldOut = saleState === "sold_out"
  const hasInteractiveMap = !finished && event.hasInteractiveMap
  const demand = finished || soldOut ? null : demandLabel(event.tiers)
  const isOnlineEvent = event.deliveryMode === "ONLINE"
  const venueName = isOnlineEvent
    ? "Transmisión online"
    : (event.venue?.name ?? event.location)
  const address = isOnlineEvent
    ? "Online"
    : (event.venue?.location ?? event.location)
  const description =
    event.description?.trim() ||
    "El organizador todavía no cargó una descripción detallada."
  const organizerName = event.organizerName?.trim() || "Organizador TokePass"
  const organizerBio =
    event.organizerBio?.trim() || "Productora en TokePass"

  const availableDates = useMemo(() => {
    const days = event.scheduleDays ?? []
    if (days.length > 0) {
      return days.map((day) => ({
        id: day.id,
        weekday: formatEventWeekdayShort(day.start_time),
        dayMonth: formatEventDayMonthNumeric(day.start_time),
        label: day.title || formatEventDay(day.start_time),
      }))
    }
    return [
      {
        id: event.id,
        weekday: formatEventWeekdayShort(event.date),
        dayMonth: formatEventDayMonthNumeric(event.date),
        label: formatEventDay(event.date),
      },
    ]
  }, [event.date, event.id, event.scheduleDays])
  const storedScheduleId = useCheckoutStore((state) => state.selectedScheduleId)
  const selectedDate =
    storedScheduleId &&
    availableDates.some((day) => day.id === storedScheduleId)
      ? storedScheduleId
      : (availableDates[0]?.id ?? event.id)

  useEffect(() => {
    if (!selectedDate) return
    const store = useCheckoutStore.getState()
    if (store.selectedScheduleId === selectedDate) return
    const currentValid =
      Boolean(store.selectedScheduleId) &&
      availableDates.some((day) => day.id === store.selectedScheduleId)
    if (currentValid) return
    store.setSelectedScheduleId(selectedDate)
  }, [availableDates, selectedDate])
  const viewMode = useCheckoutStore((state) => state.viewMode)
  const [exitDialogOpen, setExitDialogOpen] = useState(false)

  useEffect(() => {
    if (viewMode !== "checkout") return
    window.scrollTo(0, 0)
  }, [viewMode])

  const isAvailable = hasSellableTickets
  const showInfoCta = !finished && viewMode === "info"
  const showCheckout = !finished && isAvailable && viewMode === "checkout"

  useLockBodyScroll(showCheckout)

  useEffect(() => {
    useStorefrontChromeStore.getState().setCheckoutTunnel(showCheckout)
  }, [showCheckout])

  useEffect(() => {
    return () => {
      useStorefrontChromeStore.getState().setCheckoutTunnel(false)
    }
  }, [])

  const eventFeeRate = fallbackServiceFeeRate(event.serviceChargeRate)
  const checkoutFeeRate = useCheckoutStore((state) => state.serviceChargeRate)
  const checkoutFeeFixed = useCheckoutStore((state) => state.serviceChargeFixedFee)
  if (
    checkoutFeeRate !== eventFeeRate ||
    checkoutFeeFixed !== event.platformFixedFee
  ) {
    useCheckoutStore.getState().setServiceChargeRule({
      rate: eventFeeRate,
      fixedFee: event.platformFixedFee,
    })
  }

  useEffect(() => {
    const store = useCheckoutStore.getState()
    if (store.eventId && store.eventId !== event.id) {
      store.resetIfOtherEvent(event.id)
      store.setViewMode("info")
    }
    store.setServiceChargeRule({
      rate: eventFeeRate,
      fixedFee: event.platformFixedFee,
    })
  }, [event.id, event.platformFixedFee, eventFeeRate])

  useEffect(() => {
    const bind = () => useStorefrontSeatStore.getState().bindEvent(event.id)
    if (useStorefrontSeatStore.persist.hasHydrated()) {
      bind()
      return
    }
    return useStorefrontSeatStore.persist.onFinishHydration(bind)
  }, [event.id])

  function hasActiveCheckoutCart() {
    const checkout = useCheckoutStore.getState()
    const selectedCount = storefrontSelectionCount(
      useStorefrontSeatStore.getState().selectedItems,
    )
    return checkout.itemsCount > 0 || selectedCount > 0
  }

  function enterCheckout(eventClick?: MouseEvent) {
    eventClick?.preventDefault()
    eventClick?.stopPropagation()
    if (!hasSellableTickets) return
    const store = useCheckoutStore.getState()
    store.resetIfOtherEvent(event.id)
    store.clearCart()
    useStorefrontChromeStore.getState().setCheckoutTunnel(true)
    store.setViewMode("checkout")
  }

  function leaveCheckout() {
    const checkout = useCheckoutStore.getState()
    releaseCheckoutCartHolds(event.id)
    checkout.clearCart()
    checkout.clearBuyerData()
    checkout.setViewMode("info")
    setExitDialogOpen(false)
    useStorefrontChromeStore.getState().setCheckoutTunnel(false)
    window.scrollTo(0, 0)
  }

  function requestLeaveCheckout() {
    if (!hasActiveCheckoutCart()) {
      leaveCheckout()
      return
    }
    setExitDialogOpen(true)
  }

  const teaserPrice = useMemo(() => {
    const sellable = admissionTickets.filter((tier) =>
      isSellablePublicTicket(tier),
    )
    if (sellable.length === 0) return startingPrice
    const forDay = sellable.filter(
      (tier) => !tier.day_id || tier.day_id === selectedDate,
    )
    return startingPriceFromSellable(forDay.length > 0 ? forDay : sellable)
  }, [admissionTickets, selectedDate, startingPrice])

  function renderPurchaseAside() {
    const dateLabel = [
      isOnlineEvent ? "Inicio de transmisión" : null,
      availableDates.find((day) => day.id === selectedDate)?.label ||
        formatEventDay(event.date),
    ]
      .filter(Boolean)
      .join(" · ")
    const city = isOnlineEvent ? "" : event.venue?.city?.trim() || ""
    const venueLabel = [venueName, city].filter(Boolean).join(" · ")

    return (
      <EventStorefrontBuyBox
        price={teaserPrice}
        dateLabel={dateLabel}
        venueLabel={venueLabel}
        limited={Boolean(demand)}
        isOnline={isOnlineEvent}
        soldOut={!isAvailable}
        onAcquire={enterCheckout}
      />
    )
  }

  const ticketTiers = useMemo(
    () =>
      admissionTickets.map((tier) =>
        toPublicTicketSelectorTier(tier, {
          comboItems: event.comboItemsByTier[tier.id] ?? [],
          comboScheduleIds: event.comboScheduleIdsByTier?.[tier.id] ?? [],
        }),
      ),
    [admissionTickets, event.comboItemsByTier, event.comboScheduleIdsByTier],
  )

  const reduceMotion = useSyncExternalStore(
    subscribePrefersReducedMotion,
    prefersReducedMotionSnapshot,
    () => false,
  )

  function renderDiscoveryColumn() {
    return (
      <motion.div
        className="min-w-0"
        variants={reduceMotion ? undefined : storefrontStagger}
      >
        <div className="flex flex-col gap-8 md:gap-10">
          <motion.div variants={reduceMotion ? undefined : storefrontFade}>
            <EventHeroMediaGallery
              eventId={event.id}
              title={event.title}
              imageUrl={event.imageUrl}
              promoVideoUrl={event.promoVideoUrl}
              finished={finished}
            />
          </motion.div>

          <motion.div
            variants={reduceMotion ? undefined : storefrontFade}
            className="space-y-1"
          >
            <EventActionBar
              eventId={event.id}
              title={event.title}
              showBackLink={showBackLink}
              date={event.date}
              location={address ?? undefined}
              details={event.description}
            />
            
            {/* Badges de estado (Solo se muestran si son estados especiales) */}
            {(finished || soldOut || demand || event.status === "draft" || event.status === "pending_approval" || event.status === "needs_revision" || event.status === "rejected") ? (
              <div className="flex flex-wrap items-center gap-1.5 px-4 md:px-0 pt-1">
                {finished ? (
                  <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                    Este evento ya pasó
                  </span>
                ) : soldOut ? (
                  <span className="inline-flex items-center rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                    Entradas agotadas
                  </span>
                ) : null}

                {demand ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                    <Flame className="size-3" aria-hidden="true" />
                    {demand}
                  </span>
                ) : null}

                {event.status === "draft" ? (
                  <span className="inline-flex items-center rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                    Borrador
                  </span>
                ) : null}
                {event.status === "pending_approval" ? (
                  <span className="inline-flex items-center rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-800 dark:text-sky-200">
                    En revisión
                  </span>
                ) : null}
                {event.status === "needs_revision" ? (
                  <span className="inline-flex items-center rounded-full border border-orange-500/25 bg-orange-500/10 px-2.5 py-1 text-[11px] font-semibold text-orange-800 dark:text-orange-200">
                    Pide cambios
                  </span>
                ) : null}
                {event.status === "rejected" ? (
                  <span className="inline-flex items-center rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-800 dark:text-rose-200">
                    Rechazado
                  </span>
                ) : null}
              </div>
            ) : null}
          </motion.div>

          <motion.div variants={reduceMotion ? undefined : storefrontFade}>
            <HeaderInfoBlock
              title={event.title}
              organizerName={organizerName}
            />
          </motion.div>

          <motion.div
            variants={reduceMotion ? undefined : storefrontFade}
            className="px-4 md:px-0"
          >
            <EventAboutExpandable description={description} />
          </motion.div>

          <motion.div variants={reduceMotion ? undefined : storefrontFade}>
            <EventDateSelector
              dates={availableDates}
              selectedId={selectedDate}
              onChange={(dateId) =>
                useCheckoutStore.getState().setSelectedScheduleId(dateId)
              }
            />
          </motion.div>

          <motion.div
            variants={reduceMotion ? undefined : storefrontFade}
            className="px-4 md:px-0"
          >
            <EventLineup
              data={event.lineup}
              selectedDayId={selectedDate}
              scheduleDays={event.scheduleDays ?? []}
            />
          </motion.div>

        </div>
      </motion.div>
    )
  }

  function renderDetailsColumn() {
    return (
      <motion.div
        className="min-w-0 space-y-8 px-4 pb-6 md:px-0"
        variants={reduceMotion ? undefined : storefrontFade}
      >
        <EventResaleListings
          listings={resaleListings}
          currentUserId={currentUserId}
        />

        {isOnlineEvent ? null : (
          <EventLocationPanel
            venueName={venueName ?? ""}
            address={address ?? ""}
            latitude={event.venue?.latitude ?? null}
            longitude={event.venue?.longitude ?? null}
          />
        )}

        <EventExperienceGallery urls={event.galleryUrls} />

        <section className="space-y-3">
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            Información útil
          </h2>
          <Accordion className="rounded-2xl border border-border bg-card px-4 text-card-foreground">
            <AccordionItem value="age">
              <AccordionTrigger className="py-4 text-sm text-foreground hover:no-underline">
                Restricciones y edad
              </AccordionTrigger>
              <AccordionContent className="whitespace-pre-wrap text-muted-foreground">
                {event.restrictions?.trim() ||
                  (isOnlineEvent
                    ? "Verificá la política de edad del organizador antes del inicio de transmisión. Si el evento es +18, el anfitrión puede pedir DNI."
                    : "Verificá la política de edad del organizador en puerta. Si el evento es +18, deberás presentar DNI vigente. TokePass no garantiza el ingreso si no cumplís los requisitos del lugar.")}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="bring">
              <AccordionTrigger className="py-4 text-sm text-foreground hover:no-underline">
                Qué llevar y qué no llevar
              </AccordionTrigger>
              <AccordionContent className="whitespace-pre-wrap text-muted-foreground">
                {event.whatToBring?.trim() ||
                  (isOnlineEvent
                    ? "El link de transmisión aparece en Mis entradas después de pagar. No hace falta QR ni presentarse en un recinto."
                    : "En puerta mostrá esta pantalla. El código se actualiza solo para evitar reventas truchas (no le saques captura de pantalla).")}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="refunds">
              <AccordionTrigger className="py-4 text-sm text-foreground hover:no-underline">
                Política de devoluciones
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {refundPolicyBuyerCopy(event.refundPolicy)}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        <section className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground">
          {event.organizerId ? (
            <Link
              href={publicProducerPath(event.organizerId)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <OrganizerAvatar
                name={organizerName}
                avatarUrl={event.organizerAvatarUrl}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-bold text-foreground">
                    {organizerName}
                  </p>
                  <Badge
                    variant="outline"
                    className="rounded-full border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300"
                  >
                    <BadgeCheck className="size-3" aria-hidden="true" />
                    Verificado
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {organizerBio}
                </p>
              </div>
            </Link>
          ) : (
            <>
              <OrganizerAvatar
                name={organizerName}
                avatarUrl={event.organizerAvatarUrl}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-bold text-foreground">
                    {organizerName}
                  </p>
                  <Badge
                    variant="outline"
                    className="rounded-full border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300"
                  >
                    <BadgeCheck className="size-3" aria-hidden="true" />
                    Verificado
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {organizerBio}
                </p>
              </div>
            </>
          )}
          {event.organizerId && event.organizerId !== currentUserId ? (
            <ProducerFollowButton
              producerId={event.organizerId}
              producerName={organizerName}
              isAuthenticated={Boolean(currentUserId)}
            />
          ) : null}
        </section>

        <TokepassGuaranteeBadge variant="full" isOnline={isOnlineEvent} />
      </motion.div>
    )
  }

  const asideClassName =
    "hidden w-full scroll-mt-28 lg:block lg:w-[400px] xl:w-[450px] shrink-0 sticky top-28 h-fit z-20"

  if (showCheckout) {
    return (
      <AppTakeover className="text-foreground">
        {event.isDraftPreview ? <SandboxBanner /> : null}
        <AnalyticsTracker
          config={event.pixels}
          trackPageView
          contentName={event.title}
          contentIds={[event.id]}
          value={startingPrice ?? undefined}
        />
        <div className="min-h-0 flex-1 overflow-hidden">
          <ClientErrorBoundary homeHref="/" homeLabel="Volver al inicio">
          <TicketSelector
            eventId={event.id}
            eventSlug={event.slug}
            eventTitle={event.title}
            currentUserId={currentUserId}
            initialBuyer={initialBuyer}
            referralCode={referralCode}
            sandboxEligible={sandboxEligible || event.isDraftPreview}
            isDraftPreview={event.isDraftPreview}
            previewKey={previewKey}
            serviceChargeRate={event.serviceChargeRate}
            platformFixedFee={event.platformFixedFee}
            scheduleDays={event.scheduleDays ?? []}
            seatingUnits={event.seatingUnits}
            seatingSectorSummaries={event.seatingSectorSummaries}
            seatingBackgroundUrl={event.venue?.seating_background_url}
            venueMap={event.venue?.venue_map ?? null}
            seatingMaps={event.seatingMaps ?? []}
            hasInteractiveMap={hasInteractiveMap}
            seatingLayout={event.venue?.seating_layout ?? []}
            venueId={event.venue?.id}
            venueName={event.venue?.name}
            venueCapacity={event.venue?.capacity}
            pixels={event.pixels}
            zoneTierPricing={event.zoneTierPricing}
            purchaseLocked={soldOut}
            tiers={ticketTiers}
            selectedDayId={selectedDate}
            defaultTicketTab={event.defaultTicketTab}
            maxTicketsPerUser={event.maxTicketsPerUser}
            fillViewport
            isOnline={isOnlineEvent}
            acceptsMercadoPago={event.acceptsMercadoPago}
            onReservationExpired={leaveCheckout}
            onLeaveCheckout={requestLeaveCheckout}
            renderLayout={({ panel }) => panel}
          />
          </ClientErrorBoundary>
        </div>
        <Dialog open={exitDialogOpen} onOpenChange={setExitDialogOpen}>
          <DialogContent
            showCloseButton={false}
            className="z-[100] sm:max-w-md"
            overlayClassName="z-[100]"
          >
            <DialogHeader>
              <DialogTitle>¿Querés salir?</DialogTitle>
              <DialogDescription>
                Si salís ahora, se liberan los lugares y se vacía el carrito.
                Esta acción no se puede deshacer.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="storefront"
                onClick={() => setExitDialogOpen(false)}
              >
                Continuar Comprando
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="storefront"
                onClick={leaveCheckout}
              >
                Sí, salir y cancelar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppTakeover>
    )
  }

  return (
    <>
    <div
      className={cn(
        "relative isolate min-h-screen w-full max-w-full bg-background text-foreground",
        showInfoCta ? "pb-24 lg:pb-12" : "pb-24 lg:pb-12",
      )}
    >
      <div
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        aria-hidden="true"
      >
        {event.imageUrl ? (
          // Decorative blur layer; next/image would change the wash.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-[80px] md:scale-150 md:opacity-30 md:blur-[120px]"
          />
        ) : null}
        <div className="absolute inset-0 bg-white/80 dark:bg-[#09090b]/70" />
      </div>
      {event.isDraftPreview ? <SandboxBanner /> : null}
      <AnalyticsTracker
        config={event.pixels}
        trackPageView
        contentName={event.title}
        contentIds={[event.id]}
        value={startingPrice ?? undefined}
      />
      <div className="relative z-10">
      {event.isSponsoredByTokePass && viewMode === "info" ? (
        <div className="border-b border-amber-500/35 bg-gradient-to-r from-amber-500/15 via-transparent to-amber-500/15">
          <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 px-4 py-2.5 text-center">
            <Sparkles className="size-3.5 text-amber-600 dark:text-amber-300" aria-hidden="true" />
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-800 dark:text-amber-100">
              Evento auspiciado y protegido por TokePass
            </p>
            <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />
          </div>
        </div>
      ) : null}

      <div className="relative mx-auto flex w-full max-w-7xl flex-col items-start gap-8 px-0 md:px-4 lg:flex-row lg:px-8 lg:py-8">
        <motion.div
          className="min-w-0 w-full flex-1 space-y-8 lg:space-y-10"
          variants={reduceMotion ? undefined : storefrontStagger}
          initial={reduceMotion ? false : "hidden"}
          animate="show"
        >
          {renderDiscoveryColumn()}
          {finished ? (
            <div className="px-4 md:px-0 lg:hidden">
              <EventSaleStatusNotice state="finished" />
            </div>
          ) : null}
          {soldOut ? (
            <div className="px-4 md:px-0 lg:hidden">
              <EventSaleStatusNotice state="sold_out" />
            </div>
          ) : null}
          {renderDetailsColumn()}
        </motion.div>
        <aside id="tickets" className={asideClassName}>
          {finished ? (
            <EventSaleStatusNotice state="finished" />
          ) : soldOut ? (
            <EventSaleStatusNotice state="sold_out" />
          ) : (
            renderPurchaseAside()
          )}
        </aside>
      </div>

      {viewMode === "info" && (event.sponsors?.length ?? 0) > 0 ? (
        <div className="mx-auto max-w-7xl px-4 pb-8">
          <SponsorGrid
            heading="Auspician este evento:"
            sponsors={event.sponsors ?? []}
            size="md"
          />
        </div>
      ) : null}

      </div>
    </div>
    {showInfoCta ? (
      <FloatingCheckoutDock
        price={teaserPrice}
        actionLabel={isOnlineEvent ? "Elegir acceso" : "Elegir entradas"}
        soldOut={!isAvailable}
        onAcquire={enterCheckout}
      />
    ) : null}
    </>
  )
}
