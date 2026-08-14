"use client"

import {
  BadgeCheck,
  Flame,
  Music2,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

import type { EventDetails } from "@/app/actions/public-events"
import type { ResaleListingPublic } from "@/app/actions/resale"
import {
  AddToCalendarButton,
  EventDetailTopActions,
} from "@/components/public/event-detail-actions"
import { AnalyticsTracker } from "@/components/public/analytics-tracker"
import { EventAboutExpandable } from "@/components/public/event-about-expandable"
import { EventExperienceGallery } from "@/components/public/event-experience-gallery"
import { EventFlyer } from "@/components/public/event-flyer"
import { EventLocationPanel } from "@/components/public/event-location-panel"
import { EventPromoSpotButton } from "@/components/public/event-promo-spot"
import { PromoVideoPlayer } from "@/components/public/promo-video-player"
import { StoryFlyerVisitorButton } from "@/components/public/story-flyer-modal"
import { EventResaleListings } from "@/components/public/event-resale-listings"
import { EventSaleStatusNotice } from "@/components/public/event-sale-status-notice"
import { SponsorGrid } from "@/components/public/sponsor-grid"
import { OrganizerAvatar } from "@/components/public/organizer-avatar"
import { TicketSelector } from "@/components/public/ticket-selector"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatEventDay, formatEventTime } from "@/lib/format"
import { deriveEventSaleState } from "@/lib/event-status"
import { cn } from "@/lib/utils"

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
  const demand = finished || soldOut ? null : demandLabel(event.tiers)
  const venueName = event.venue?.name ?? event.location
  const address = event.venue?.location ?? event.location
  const description =
    event.description?.trim() ||
    "El organizador todavía no cargó una descripción detallada."
  const organizerName = event.organizerName?.trim() || "Organizador Tokepass"
  const organizerBio =
    event.organizerBio?.trim() || "Productora en Tokepass"

  const checkout = finished ? (
    <EventSaleStatusNotice state="finished" />
  ) : (
    <>
      {soldOut ? (
        <div className="mb-4">
          <EventSaleStatusNotice state="sold_out" />
        </div>
      ) : null}
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
        seatingLayout={event.venue?.seating_layout ?? []}
        venueId={event.venue?.id}
        venueName={event.venue?.name}
        venueCapacity={event.venue?.capacity}
        pixels={event.pixels}
        zoneTierPricing={event.zoneTierPricing}
        purchaseLocked={soldOut}
        tiers={event.tiers.map((tier) => ({
          id: tier.id,
          name: tier.name,
          price: tier.price,
          available: tier.available,
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
        }))}
        defaultTicketTab={event.defaultTicketTab}
      />
    </>
  )

  return (
    <div className="relative isolate min-h-screen overflow-x-clip bg-background pb-28 text-foreground lg:overflow-x-visible lg:pb-12">
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
      <div className="mx-auto grid max-w-6xl gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)] lg:items-start lg:gap-10 lg:px-6 lg:py-8">
        <div className="min-w-0">
          <section className="relative">
            <div className="relative h-[32vh] min-h-[220px] max-h-[360px] overflow-hidden sm:h-[38vh] lg:min-h-[320px] lg:rounded-3xl lg:border lg:border-border">
              <EventFlyer
                eventId={event.id}
                title={event.title}
                imageUrl={event.imageUrl}
                priority
                className={finished ? "grayscale-[50%]" : undefined}
              />
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/35"
                aria-hidden="true"
              />
              <EventDetailTopActions
                eventId={event.id}
                title={event.title}
                showBackLink={showBackLink}
              />
              <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-wrap gap-2">
                {finished ? (
                  <Badge className="rounded-full border-0 bg-zinc-800/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur-md">
                    FINALIZADO
                  </Badge>
                ) : soldOut ? (
                  <Badge className="rounded-full border-0 bg-red-600 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white">
                    AGOTADO
                  </Badge>
                ) : (
                  <Badge className="rounded-full border-0 bg-white/95 px-3 py-1 text-[11px] font-bold text-zinc-950">
                    <Music2 className="size-3.5" aria-hidden="true" />
                    Evento en vivo
                  </Badge>
                )}
                {demand ? (
                  <Badge className="rounded-full border-0 bg-rose-500 px-3 py-1 text-[11px] font-bold text-white">
                    <Flame className="size-3.5" aria-hidden="true" />
                    {demand}
                  </Badge>
                ) : null}
                {event.status === "draft" ? (
                  <Badge className="rounded-full border-0 bg-amber-500 px-3 py-1 text-[11px] font-bold text-zinc-950">
                    Borrador
                  </Badge>
                ) : null}
              </div>
            </div>
          </section>

          <div className="space-y-8 px-4 pb-6 pt-5 sm:px-6 lg:px-0 lg:pt-8">
            <header className="space-y-4">
              <h1 className="text-[1.85rem] font-black leading-[1.1] tracking-[-0.04em] text-foreground sm:text-4xl">
                {event.title}
              </h1>

              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-3.5 py-2.5 text-card-foreground">
                  <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                    <span className="text-[10px] font-black uppercase leading-none">
                      {formatEventDay(event.date).slice(0, 3)}
                    </span>
                  </span>
                  <div>
                    <p className="text-sm font-semibold capitalize text-foreground">
                      {formatEventDay(event.date)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {event.scheduleDays?.length > 1
                        ? `${event.scheduleDays.length} jornadas · desde ${formatEventTime(event.date)}`
                        : formatEventTime(event.date)}
                    </p>
                  </div>
                </div>
              </div>
            </header>
            </div>
          </div>

        <aside
          id="tickets"
          className="scroll-mt-24 px-4 pb-8 lg:sticky lg:top-24 lg:row-span-2 lg:h-fit lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:px-0 lg:pb-0"
        >
          {checkout}
        </aside>

        <div className="min-w-0 space-y-8 px-4 pb-6 pt-2 sm:px-6 lg:px-0 lg:pt-0">
            <div className="flex flex-wrap items-center gap-3">
              <AddToCalendarButton
                title={event.title}
                date={event.date}
                location={address}
                details={event.description}
              />
              <StoryFlyerVisitorButton
                className="h-9 min-h-9 rounded-full border-border bg-card px-4 text-sm font-semibold"
                data={{
                  eventTitle: event.title,
                  eventDate: event.date,
                  eventLocation: address,
                  imageUrl: event.imageUrl,
                  mode: "visitor",
                  organizerName: event.organizerName,
                  organizerAvatarUrl: event.organizerAvatarUrl,
                }}
              />
              <EventPromoSpotButton
                className="h-9 min-h-9 rounded-full border-border bg-card px-4 text-sm font-semibold"
                promoVideoUrl={event.promoVideoUrl}
              />
            </div>

            {event.promoVideoUrl ? (
              <section
                aria-label="Spot promocional"
                className="w-full overflow-hidden rounded-2xl bg-muted shadow-lg"
              >
                <PromoVideoPlayer
                  url={event.promoVideoUrl}
                  fallbackImageUrl={event.imageUrl}
                  title={`Spot · ${event.title}`}
                  showFallbackWhenEmpty
                  className="aspect-video w-full rounded-2xl"
                />
              </section>
            ) : null}

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

            {event.scheduleDays?.length > 1 ? (
              <section className="space-y-3">
                <h2 className="text-lg font-bold tracking-tight text-foreground">
                  Jornadas
                </h2>
                <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {event.scheduleDays?.map((day) => (
                    <div
                      key={day.id}
                      className="min-w-[148px] rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground shadow-sm"
                    >
                      <p className="text-sm font-bold text-foreground">
                        {day.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatEventDay(day.start_time)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatEventTime(day.start_time)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

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
        </div>
      </div>

      {(event.sponsors?.length ?? 0) > 0 ? (
        <div className="mx-auto max-w-6xl px-4 pb-8 lg:px-6">
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
