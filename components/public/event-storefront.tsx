"use client"

import {
  BadgeCheck,
  Flame,
  Music2,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useMemo, useState } from "react"

import type { EventDetails } from "@/app/actions/public-events"
import type { ResaleListingPublic } from "@/app/actions/resale"
import { EventDateSelector } from "@/components/public/event-date-selector"
import { EventActionBar } from "@/components/public/event-action-bar"
import { AnalyticsTracker } from "@/components/public/analytics-tracker"
import { EventAboutExpandable } from "@/components/public/event-about-expandable"
import { EventExperienceGallery } from "@/components/public/event-experience-gallery"
import { HeaderInfoBlock } from "@/components/public/event-header-info-block"
import { EventHeroMediaGallery } from "@/components/public/event-hero-media-gallery"
import { EventLineup } from "@/components/public/event-lineup"
import { EventLocationPanel } from "@/components/public/event-location-panel"
import { EventResaleListings } from "@/components/public/event-resale-listings"
import { EventSaleStatusNotice } from "@/components/public/event-sale-status-notice"
import { SponsorGrid } from "@/components/public/sponsor-grid"
import { OrganizerAvatar } from "@/components/public/organizer-avatar"
import { TicketSelector } from "@/components/public/ticket-selector"
import { hasInteractiveVenueMap } from "@/lib/seating/venue-map-geometry"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  formatEventDay,
  formatEventDayMonthNumeric,
  formatEventWeekdayShort,
} from "@/lib/format"
import { deriveEventSaleState } from "@/lib/event-status"
import { cn } from "@/lib/utils"

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
}

function demandLabel(tiers: EventDetails["tiers"]): string | null {
  const active = tiers.filter((tier) => tier.available > 0)
  if (active.length === 0) return null
  const lowest = Math.min(...active.map((tier) => tier.available))
  if (lowest <= 15) return `Últimas ${lowest} entradas`
  const soldRatio =
    tiers.reduce((sum, tier) => sum + tier.sold, 0) /
    Math.max(
      1,
      tiers.reduce((sum, tier) => sum + tier.capacity, 0),
    )
  if (soldRatio >= 0.65) return "Alta demanda"
  return null
}

export function EventStorefront({
  event,
  currentUserId,
  referralCode = null,
  initialBuyer = null,
  resaleListings = [],
  showBackLink = true,
  sandboxEligible = false,
}: EventStorefrontProps) {
  const startingPrice =
    event.tiers.length > 0
      ? Math.min(...event.tiers.map((tier) => tier.price))
      : null
  const saleState = deriveEventSaleState({
    date: event.date,
    endsAt: event.endsAt,
    scheduleDays: event.scheduleDays ?? [],
    tiers: event.tiers,
  })
  const finished = saleState === "finished"
  const soldOut = saleState === "sold_out"
  const hasInteractiveMap =
    !finished &&
    (Boolean(event.hasInteractiveMap) ||
      hasInteractiveVenueMap(event.venue?.venue_map))
  const demand = finished || soldOut ? null : demandLabel(event.tiers)
  const venueName = event.venue?.name ?? event.location
  const address = event.venue?.location ?? event.location
  const description =
    event.description?.trim() ||
    "El organizador todavía no cargó una descripción detallada."
  const organizerName = event.organizerName?.trim() || "Organizador Tokepass"
  const organizerBio =
    event.organizerBio?.trim() || "Productora en Tokepass"

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
  const [selectedDate, setSelectedDate] = useState(
    () => availableDates[0]?.id ?? event.id,
  )

  const ticketTiers = useMemo(
    () =>
      event.tiers.map((tier) => ({
        id: tier.id,
        name: tier.name,
        price: tier.price,
        available: tier.available,
        capacity: tier.capacity,
        bonusReward: tier.bonus_reward,
        dayId: tier.day_id,
        layoutType: tier.layout_type,
        seatingSectorId: tier.seating_sector_id,
        capacityPerUnit: tier.capacity_per_unit,
        category: tier.category,
        listPrice: tier.list_price,
        comboItems: event.comboItemsByTier[tier.id] ?? [],
        tierType: tier.tier_type,
        bundleType: tier.bundle_type,
        description: tier.description,
        highlightBadge: tier.highlight_badge,
        sold: tier.sold,
        phases: tier.phases ?? [],
      })),
    [event.comboItemsByTier, event.tiers],
  )

  const reduceMotion = useReducedMotion()
  const asideClassName =
    "h-fit min-w-0 scroll-mt-24 px-4 pb-12 md:px-0 lg:sticky lg:top-24 lg:z-30 lg:col-span-5 lg:col-start-8 lg:row-span-full lg:row-start-1 lg:self-start xl:col-span-4 xl:col-start-9"

  return (
    <div className="relative isolate min-h-0 overflow-x-visible bg-background pb-8 text-foreground lg:pb-12">
      <AnalyticsTracker
        config={event.pixels}
        trackPageView
        contentName={event.title}
        contentIds={[event.id]}
        value={startingPrice ?? undefined}
      />
      {event.isSponsoredByTokepass ? (
        <div className="border-b border-amber-500/35 bg-gradient-to-r from-amber-500/15 via-background to-amber-500/15">
          <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 px-4 py-2.5 text-center">
            <Sparkles className="size-3.5 text-amber-600 dark:text-amber-300" aria-hidden="true" />
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-800 dark:text-amber-100">
              Evento auspiciado y protegido por Tokepass
            </p>
            <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />
          </div>
        </div>
      ) : null}

      {/* Mobile-first immersive column; desktop widens with side checkout */}
      <motion.div
        className="relative mx-auto grid max-w-7xl grid-cols-1 items-start gap-8 px-0 md:px-4 lg:grid-cols-12 lg:gap-12 lg:py-8"
        variants={reduceMotion ? undefined : storefrontStagger}
        initial={reduceMotion ? false : "hidden"}
        animate="show"
      >
        <motion.div
          className="min-w-0 overflow-x-clip lg:col-span-7 xl:col-span-8"
          variants={reduceMotion ? undefined : storefrontStagger}
        >
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
              className="mt-4 space-y-3"
            >
              <EventActionBar
                eventId={event.id}
                title={event.title}
                showBackLink={showBackLink}
                date={event.date}
                location={address}
                details={event.description}
              />
              <div className="flex flex-wrap items-center gap-1.5 px-4 md:px-0">
                {finished ? (
                  <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                    Finalizado
                  </span>
                ) : soldOut ? (
                  <span className="inline-flex items-center rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                    Agotado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                    <Music2 className="size-3" aria-hidden="true" />
                    Evento en vivo
                  </span>
                )}
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
              </div>
            </motion.div>
            <motion.div variants={reduceMotion ? undefined : storefrontFade}>
            <HeaderInfoBlock
              title={event.title}
              organizerName={organizerName}
            />
            </motion.div>
            <motion.div variants={reduceMotion ? undefined : storefrontFade}>
            <EventDateSelector
              dates={availableDates}
              selectedId={selectedDate}
              onChange={setSelectedDate}
            />
            </motion.div>
            <motion.div
              variants={reduceMotion ? undefined : storefrontFade}
              className="px-4 md:px-0"
            >
              <EventLineup data={event.lineup} />
            </motion.div>
        </motion.div>

        {finished ? (
          <aside id="tickets" className={asideClassName}>
            <EventSaleStatusNotice state="finished" />
          </aside>
        ) : (
          <TicketSelector
            eventId={event.id}
            eventSlug={event.slug}
            eventTitle={event.title}
            currentUserId={currentUserId}
            initialBuyer={initialBuyer}
            referralCode={referralCode}
            sandboxEligible={sandboxEligible}
            serviceChargeRate={event.serviceChargeRate}
            scheduleDays={event.scheduleDays ?? []}
            seatingUnits={event.seatingUnits}
            seatingSectorSummaries={event.seatingSectorSummaries}
            seatingBackgroundUrl={event.venue?.seating_background_url}
            venueMap={event.venue?.venue_map ?? null}
            hasInteractiveMap={event.hasInteractiveMap || hasInteractiveMap}
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
            renderLayout={({ map, panel }) => (
              <>
                <aside id="tickets" className={asideClassName}>
                  {soldOut ? (
                    <div className="mb-4">
                      <EventSaleStatusNotice state="sold_out" />
                    </div>
                  ) : null}
                  {panel}
                </aside>
                {map ? (
                  <section
                    id="mapa"
                    className="min-w-0 px-4 pt-2 md:px-0 lg:col-span-7 lg:col-start-1 lg:pt-0 xl:col-span-8"
                  >
                    {map}
                  </section>
                ) : null}
              </>
            )}
          />
        )}

        <motion.div
          className="min-w-0 space-y-8 overflow-x-clip px-4 pb-6 md:px-0 lg:col-span-7 lg:col-start-1 xl:col-span-8"
          variants={reduceMotion ? undefined : storefrontFade}
        >
            <EventResaleListings
              listings={resaleListings}
              currentUserId={currentUserId}
            />

            <EventAboutExpandable description={description} />

            <EventLocationPanel
              venueName={venueName}
              address={address}
              latitude={event.venue?.latitude ?? null}
              longitude={event.venue?.longitude ?? null}
            />

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
                  <AccordionContent className="text-muted-foreground">
                    Verificá la política de edad del organizador en puerta. Si el
                    evento es +18, deberás presentar DNI vigente. Tokepass no
                    garantiza el ingreso si no cumplís los requisitos del lugar.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="bring">
                  <AccordionTrigger className="py-4 text-sm text-foreground hover:no-underline">
                    Qué llevar y qué no llevar
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    Llevá tu Living QR en el celular con batería. Evitá capturas
                    de pantalla: los códigos dinámicos vencen. La reventa solo es
                    válida a través del marketplace oficial de Tokepass.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="refunds">
                  <AccordionTrigger className="py-4 text-sm text-foreground hover:no-underline">
                    Política de devoluciones
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    Las devoluciones dependen de la política del organizador y de
                    la normativa vigente. Si el evento se cancela, Tokepass
                    gestiona el proceso de reintegro según el estado del pago.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>

            <section className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground">
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                className="shrink-0 rounded-full border-border"
                title="Próximamente"
              >
                Seguir
              </Button>
            </section>

            <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-4 text-sm text-muted-foreground">
              <ShieldCheck
                className={cn(
                  "mt-0.5 size-5 shrink-0",
                  event.isSponsoredByTokepass
                    ? "text-amber-600 dark:text-amber-300"
                    : "text-emerald-600 dark:text-emerald-400",
                )}
              />
              <p>
                Tus entradas digitales quedan asociadas a tu cuenta Tokepass.
                Presentalas en puerta con Living QR dinámico.
              </p>
            </div>
        </motion.div>
      </motion.div>

      {(event.sponsors?.length ?? 0) > 0 ? (
        <div className="mx-auto max-w-7xl px-4 pb-8">
          <SponsorGrid
            heading="Auspician este evento:"
            sponsors={event.sponsors ?? []}
            size="md"
          />
        </div>
      ) : null}
    </div>
  )
}
