import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  ShieldCheck,
  Users,
} from "lucide-react"
import Link from "next/link"

import type { EventDetails } from "@/app/actions/public-events"
import type { getEventItems } from "@/app/actions/addons"
import { EventFlyer } from "@/components/public/event-flyer"
import { TicketSelector } from "@/components/public/ticket-selector"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { formatCurrency, formatEventDate } from "@/lib/format"

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
  /** Hide back-to-discovery when embedded in preview. */
  showBackLink?: boolean
}

export function EventStorefront({
  event,
  currentUserId,
  referralCode = null,
  initialBuyer = null,
  barItems,
  showBackLink = true,
}: EventStorefrontProps) {
  const startingPrice =
    event.tiers.length > 0
      ? Math.min(...event.tiers.map((tier) => tier.price))
      : null

  return (
    <div className="relative isolate bg-zinc-950 text-zinc-100">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),transparent_55%)]"
        aria-hidden="true"
      />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        {showBackLink ? (
          <Button
            variant="ghost"
            size="sm"
            className="mb-6 -ml-2 rounded-full text-zinc-400 hover:bg-white/5 hover:text-white"
            nativeButton={false}
            render={<Link href="/" />}
          >
            <ArrowLeft aria-hidden="true" />
            Volver al discovery
          </Button>
        ) : null}

        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <div className="space-y-8">
            <div className="overflow-hidden rounded-[1.75rem] border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40">
              <div className="aspect-[16/10] sm:aspect-[2/1]">
                <EventFlyer
                  eventId={event.id}
                  title={event.title}
                  imageUrl={event.imageUrl}
                  priority
                />
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full border-0 bg-white text-zinc-950 hover:bg-zinc-200">
                  Tokepass
                </Badge>
                {event.status === "draft" ? (
                  <Badge
                    variant="outline"
                    className="rounded-full border-amber-500/30 bg-amber-500/10 text-amber-300"
                  >
                    Borrador
                  </Badge>
                ) : null}
                {startingPrice != null ? (
                  <Badge
                    variant="outline"
                    className="rounded-full border-zinc-700 bg-zinc-900 text-zinc-300"
                  >
                    Desde {formatCurrency(startingPrice)}
                  </Badge>
                ) : null}
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-[-0.04em] text-white sm:text-5xl">
                {event.title}
              </h1>

              <div className="mt-5 flex flex-col gap-3 text-sm text-zinc-400 sm:flex-row sm:flex-wrap sm:gap-x-6">
                <span className="inline-flex items-center gap-2 capitalize">
                  <CalendarDays className="size-4 text-zinc-500" />
                  {event.scheduleDays.length > 1
                    ? `${event.scheduleDays.length} jornadas · desde ${formatEventDate(event.date)}`
                    : formatEventDate(event.date)}
                </span>
                <span className="inline-flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-zinc-500" />
                  <span>
                    {event.venue?.name ?? event.location}
                    {event.venue?.location
                      ? ` · ${event.venue.location}`
                      : null}
                  </span>
                </span>
                {event.venue?.capacity ? (
                  <span className="inline-flex items-center gap-2">
                    <Users className="size-4 text-zinc-500" />
                    Capacidad {event.venue.capacity}
                  </span>
                ) : null}
              </div>
            </div>

            <Separator className="bg-zinc-800" />

            <div>
              <h2 className="text-lg font-bold text-white">Acerca del evento</h2>
              <p className="mt-3 whitespace-pre-wrap text-base leading-8 text-zinc-400">
                {event.description?.trim() ||
                  "El organizador todavía no cargó una descripción detallada."}
              </p>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-4 text-sm text-zinc-400">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-400" />
              <p>
                Tus entradas digitales quedan asociadas a tu cuenta Tokepass.
                Podés presentarlas en puerta con QR dinámico.
              </p>
            </div>
          </div>

          <aside className="lg:sticky lg:top-24" id="checkout">
            <TicketSelector
              eventId={event.id}
              currentUserId={currentUserId}
              initialBuyer={initialBuyer}
              referralCode={referralCode}
              serviceChargeRate={event.serviceChargeRate}
              scheduleDays={event.scheduleDays}
              barItems={barItems}
              seatingUnits={event.seatingUnits}
              seatingBackgroundUrl={event.venue?.seating_background_url}
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
      </div>
    </div>
  )
}
