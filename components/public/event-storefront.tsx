import {
  BadgeCheck,
  Flame,
  Music2,
  ShieldCheck,
  Sparkles,
  Ticket,
} from "lucide-react"

import type { EventDetails } from "@/app/actions/public-events"
import type { getEventItems } from "@/app/actions/addons"
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
import { EventResaleListings } from "@/components/public/event-resale-listings"
import { EventStickyBuyBar } from "@/components/public/event-sticky-buy-bar"
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
import { formatCurrency, formatEventDay, formatEventTime } from "@/lib/format"
import { cn } from "@/lib/utils"

type EventStorefrontProps = {
  event: EventDetails
  currentUserId: string | null
  referralCode?: string | null
  initialBuyer?: {
    buyerName?: string
    buyerDni?: string
    buyerEmail?: string
  } | null
  barItems: Awaited<ReturnType<typeof getEventItems>>
  resaleListings?: ResaleListingPublic[]
  showBackLink?: boolean
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
  barItems,
  resaleListings = [],
  showBackLink = true,
}: EventStorefrontProps) {
  const startingPrice =
    event.tiers.length > 0
      ? Math.min(...event.tiers.map((tier) => tier.price))
      : null
  const soldOut =
    event.tiers.length > 0 && event.tiers.every((tier) => tier.available <= 0)
  const demand = demandLabel(event.tiers)
  const venueName = event.venue?.name ?? event.location
  const address = event.venue?.location ?? event.location
  const description =
    event.description?.trim() ||
    "El organizador todavía no cargó una descripción detallada."
  const organizerName = event.organizerName?.trim() || "Organizador Tokepass"
  const organizerBio =
    event.organizerBio?.trim() || "Productora en Tokepass"

  return (
    <div className="relative isolate min-h-screen bg-zinc-950 pb-28 text-zinc-100 lg:pb-12">
      <AnalyticsTracker
        config={event.pixels}
        trackPageView
        contentName={event.title}
        contentIds={[event.id]}
        value={startingPrice ?? undefined}
      />
      {event.isSponsoredByTokepass ? (
        <div className="border-b border-amber-400/35 bg-gradient-to-r from-amber-950 via-zinc-950 to-amber-950">
          <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 px-4 py-2.5 text-center">
            <Sparkles className="size-3.5 text-amber-300" aria-hidden="true" />
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100">
              Evento auspiciado y protegido por Tokepass
            </p>
            <ShieldCheck className="size-3.5 text-emerald-300" aria-hidden="true" />
          </div>
        </div>
      ) : null}

      {/* Mobile-first immersive column; desktop widens with side checkout */}
      <div className="mx-auto grid max-w-6xl gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)] lg:items-start lg:gap-10 lg:px-6 lg:py-8">
        <div className="min-w-0">
          <section className="relative">
            <div className="relative h-[32vh] min-h-[220px] max-h-[360px] overflow-hidden sm:h-[38vh] lg:min-h-[320px] lg:rounded-3xl lg:border lg:border-zinc-800">
              <EventFlyer
                eventId={event.id}
                title={event.title}
                imageUrl={event.imageUrl}
                priority
              />
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/25 to-black/35"
                aria-hidden="true"
              />
              <EventDetailTopActions
                eventId={event.id}
                title={event.title}
                showBackLink={showBackLink}
              />
              <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-wrap gap-2">
                <Badge className="rounded-full border-0 bg-white/95 px-3 py-1 text-[11px] font-bold text-zinc-950">
                  <Music2 className="size-3.5" aria-hidden="true" />
                  Evento en vivo
                </Badge>
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
              <h1 className="text-[1.85rem] font-black leading-[1.1] tracking-[-0.04em] text-white sm:text-4xl">
                {event.title}
              </h1>

              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2.5">
                  <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300">
                    <span className="text-[10px] font-black uppercase leading-none">
                      {formatEventDay(event.date).slice(0, 3)}
                    </span>
                  </span>
                  <div>
                    <p className="text-sm font-semibold capitalize text-zinc-100">
                      {formatEventDay(event.date)}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {event.scheduleDays.length > 1
                        ? `${event.scheduleDays.length} jornadas · desde ${formatEventTime(event.date)}`
                        : formatEventTime(event.date)}
                    </p>
                  </div>
                </div>

                <AddToCalendarButton
                  title={event.title}
                  date={event.date}
                  location={address}
                  details={event.description}
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  className="h-12 rounded-2xl bg-emerald-500 px-5 text-sm font-bold text-zinc-950 hover:bg-emerald-400"
                  nativeButton={false}
                  render={<a href="#tickets" />}
                >
                  <Ticket className="size-4" aria-hidden="true" />
                  {soldOut ? "Agotado" : "Comprar entradas"}
                </Button>
                <EventPromoSpotButton promoVideoUrl={event.promoVideoUrl} />
              </div>
            </header>

            <EventLocationPanel
              venueName={venueName}
              address={address}
              latitude={event.venue?.latitude ?? null}
              longitude={event.venue?.longitude ?? null}
            />

            <section id="tickets" className="scroll-mt-24 space-y-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-white">
                    Entradas
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Elegí tu tipo de acceso y completá la compra segura.
                  </p>
                </div>
                {startingPrice != null ? (
                  <p className="shrink-0 text-sm font-semibold text-emerald-300">
                    Desde{" "}
                    {startingPrice === 0
                      ? "gratis"
                      : formatCurrency(startingPrice)}
                  </p>
                ) : null}
              </div>

              <div className="lg:hidden">
                <TicketSelector
                  eventId={event.id}
                  eventTitle={event.title}
                  currentUserId={currentUserId}
                  initialBuyer={initialBuyer}
                  referralCode={referralCode}
                  serviceChargeRate={event.serviceChargeRate}
                  scheduleDays={event.scheduleDays}
                  barItems={barItems}
                  seatingUnits={event.seatingUnits}
                  seatingBackgroundUrl={event.venue?.seating_background_url}
                  seatingLayout={event.venue?.seating_layout ?? []}
                  venueId={event.venue?.id}
                  venueName={event.venue?.name}
                  venueCapacity={event.venue?.capacity}
                  pixels={event.pixels}
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
                  }))}
                />
              </div>
            </section>

            <EventResaleListings
              listings={resaleListings}
              currentUserId={currentUserId}
            />

            <EventExperienceGallery urls={event.galleryUrls} />

            <EventAboutExpandable description={description} />

            {event.scheduleDays.length > 1 ? (
              <section className="space-y-3">
                <h2 className="text-lg font-bold tracking-tight text-white">
                  Jornadas
                </h2>
                <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {event.scheduleDays.map((day) => (
                    <div
                      key={day.id}
                      className="min-w-[148px] rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 shadow-lg shadow-black/20"
                    >
                      <p className="text-sm font-bold text-white">{day.title}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {formatEventDay(day.start_time)}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {formatEventTime(day.start_time)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="space-y-3">
              <h2 className="text-lg font-bold tracking-tight text-white">
                Información útil
              </h2>
              <Accordion className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4">
                <AccordionItem value="age">
                  <AccordionTrigger className="py-4 text-sm text-zinc-100 hover:no-underline">
                    Restricciones y edad
                  </AccordionTrigger>
                  <AccordionContent className="text-zinc-400">
                    Verificá la política de edad del organizador en puerta. Si el
                    evento es +18, deberás presentar DNI vigente. Tokepass no
                    garantiza el ingreso si no cumplís los requisitos del lugar.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="bring">
                  <AccordionTrigger className="py-4 text-sm text-zinc-100 hover:no-underline">
                    Qué llevar y qué no llevar
                  </AccordionTrigger>
                  <AccordionContent className="text-zinc-400">
                    Llevá tu Living QR en el celular con batería. Evitá capturas
                    de pantalla: los códigos dinámicos vencen. La reventa solo es
                    válida a través del marketplace oficial de Tokepass.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="refunds">
                  <AccordionTrigger className="py-4 text-sm text-zinc-100 hover:no-underline">
                    Política de devoluciones
                  </AccordionTrigger>
                  <AccordionContent className="text-zinc-400">
                    Las devoluciones dependen de la política del organizador y de
                    la normativa vigente. Si el evento se cancela, Tokepass
                    gestiona el proceso de reintegro según el estado del pago.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>

            <section className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <OrganizerAvatar
                name={organizerName}
                avatarUrl={event.organizerAvatarUrl}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-bold text-white">{organizerName}</p>
                  <Badge
                    variant="outline"
                    className="rounded-full border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300"
                  >
                    <BadgeCheck className="size-3" aria-hidden="true" />
                    Verificado
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">{organizerBio}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                className="shrink-0 rounded-full border-zinc-700"
                title="Próximamente"
              >
                Seguir
              </Button>
            </section>

            <div className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-4 text-sm text-zinc-400">
              <ShieldCheck
                className={cn(
                  "mt-0.5 size-5 shrink-0",
                  event.isSponsoredByTokepass
                    ? "text-amber-300"
                    : "text-emerald-400",
                )}
              />
              <p>
                Tus entradas digitales quedan asociadas a tu cuenta Tokepass.
                Presentalas en puerta con Living QR dinámico.
              </p>
            </div>
          </div>
        </div>

        <aside
          id="checkout"
          className="hidden px-4 pb-8 lg:sticky lg:top-24 lg:block lg:px-0 lg:pb-0"
        >
          <TicketSelector
            eventId={event.id}
            eventTitle={event.title}
            currentUserId={currentUserId}
            initialBuyer={initialBuyer}
            referralCode={referralCode}
            serviceChargeRate={event.serviceChargeRate}
            scheduleDays={event.scheduleDays}
            barItems={barItems}
            seatingUnits={event.seatingUnits}
            seatingBackgroundUrl={event.venue?.seating_background_url}
            seatingLayout={event.venue?.seating_layout ?? []}
            venueId={event.venue?.id}
            venueName={event.venue?.name}
            venueCapacity={event.venue?.capacity}
            pixels={event.pixels}
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
            }))}
          />
        </aside>
      </div>

      <EventStickyBuyBar startingPrice={startingPrice} soldOut={soldOut} />
    </div>
  )
}
