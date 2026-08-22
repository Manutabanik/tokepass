"use client"

import {
  ArrowUpRight,
  History,
  ShoppingBag,
  Ticket,
} from "lucide-react"
import { motion } from "motion/react"
import Image from "next/image"
import Link from "next/link"
import { useMemo } from "react"

import type { EventItem, MyStoreRedemption } from "@/app/actions/addons"
import type { MyTicket } from "@/app/actions/tickets"
import { EventStoreUpsell } from "@/components/public/event-store-upsell"
import { LivingStoreCard } from "@/components/public/living-store-card"
import { LivingTicketCard } from "@/components/public/living-ticket-card"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatEventDay, formatEventTime } from "@/lib/format"
import { ticketOrdinalInGroup } from "@/lib/ticket-wallet"

export type StoreOfferBlock = {
  eventId: string
  title: string
  items: EventItem[]
}

function EmptyState({
  title,
  description,
  ctaHref,
  ctaLabel,
  kind = "tickets",
}: {
  title: string
  description: string
  ctaHref?: string
  ctaLabel?: string
  kind?: "tickets" | "bar" | "history"
}) {
  const Icon =
    kind === "bar" ? ShoppingBag : kind === "history" ? History : Ticket
  const isBar = kind === "bar"

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative isolate min-h-[360px] overflow-hidden rounded-3xl border border-border bg-card px-6 py-12 text-center shadow-2xl shadow-black/10 sm:min-h-[420px] sm:px-14 sm:py-16"
    >
      <div
        className={[
          "pointer-events-none absolute -top-24 left-1/2 -z-10 size-64 -translate-x-1/2 rounded-full blur-3xl",
          isBar ? "bg-amber-500/15" : "bg-emerald-500/15",
        ].join(" ")}
        aria-hidden="true"
      />

      <div className="flex min-h-[264px] flex-col items-center justify-center sm:min-h-[292px]">
        <span
          className={[
            "mb-6 grid size-16 place-items-center rounded-2xl border border-border bg-muted text-muted-foreground shadow-inner sm:size-20",
            isBar
              ? "shadow-[0_0_25px_rgba(245,158,11,0.15)]"
              : "shadow-[0_0_25px_rgba(16,185,129,0.15)]",
          ].join(" ")}
        >
          <Icon className="size-7 sm:size-8" aria-hidden="true" />
        </span>
        <h2 className="mb-2 text-lg font-bold text-foreground sm:text-xl">
          {title}
        </h2>
        <p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
          {description}
        </p>
        {ctaHref && ctaLabel ? (
          <Button
            className="h-12 rounded-xl bg-emerald-500 px-6 text-sm font-semibold text-black transition-all hover:scale-[1.02] hover:bg-emerald-600 active:scale-[0.98] sm:text-base"
            nativeButton={false}
            render={<Link href={ctaHref} />}
          >
            {ctaLabel}
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </motion.div>
  )
}

type TicketEventGroup = {
  eventId: string
  eventTitle: string
  eventDate: string
  eventLocation: string
  flyerUrl: string | null
  tickets: MyTicket[]
}

function groupTicketsByEvent(tickets: MyTicket[]): TicketEventGroup[] {
  const map = new Map<string, TicketEventGroup>()
  for (const ticket of tickets) {
    const existing = map.get(ticket.eventId)
    if (existing) {
      existing.tickets.push(ticket)
      if (!existing.flyerUrl && ticket.flyerUrl) {
        existing.flyerUrl = ticket.flyerUrl
      }
      continue
    }
    map.set(ticket.eventId, {
      eventId: ticket.eventId,
      eventTitle: ticket.eventTitle,
      eventDate: ticket.eventDate,
      eventLocation: ticket.venueName ?? ticket.eventLocation ?? "Online",
      flyerUrl: ticket.flyerUrl,
      tickets: [ticket],
    })
  }
  return [...map.values()].sort(
    (a, b) =>
      new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime(),
  )
}

type ExtraEventGroup = {
  eventId: string
  eventTitle: string
  eventDate: string
  redemptions: MyStoreRedemption[]
}

function groupExtrasByEvent(
  redemptions: MyStoreRedemption[],
): ExtraEventGroup[] {
  const map = new Map<string, ExtraEventGroup>()
  for (const item of redemptions) {
    const existing = map.get(item.eventId)
    if (existing) {
      existing.redemptions.push(item)
      continue
    }
    map.set(item.eventId, {
      eventId: item.eventId,
      eventTitle: item.eventTitle,
      eventDate: item.eventDate,
      redemptions: [item],
    })
  }
  return [...map.values()].sort(
    (a, b) =>
      new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime(),
  )
}

function EventGroupHeader({
  eventId,
  title,
  date,
  location,
  flyerUrl,
  countLabel,
  showEventLink = true,
}: {
  eventId: string
  title: string
  date: string
  location?: string
  flyerUrl?: string | null
  countLabel: string
  showEventLink?: boolean
}) {
  return (
    <div className="flex w-full flex-wrap items-center gap-3">
      <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border">
        {flyerUrl ? (
          <Image
            src={flyerUrl}
            alt=""
            fill
            sizes="56px"
            className="object-cover"
          />
        ) : (
          <span className="grid size-full place-items-center text-muted-foreground">
            <Ticket className="size-5" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-lg font-bold tracking-tight text-foreground">
          {title}
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {formatEventDay(date)} · {formatEventTime(date)}
          {location ? ` · ${location}` : null}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
        <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] font-semibold text-muted-foreground ring-1 ring-inset ring-border">
          {countLabel}
        </span>
        {showEventLink ? (
          <Link
            href={`/events/${eventId}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            Ver evento
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </div>
  )
}

function ExtrasUpsellCard({
  title,
  flyerUrl,
  storeHref,
}: {
  title: string
  flyerUrl?: string | null
  storeHref: string
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-amber-500/30 bg-amber-500/5 p-4 sm:flex-row sm:items-center">
      <div className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-muted">
        {flyerUrl ? (
          <Image
            src={flyerUrl}
            alt=""
            fill
            sizes="48px"
            className="object-cover"
          />
        ) : (
          <span className="grid size-full place-items-center text-amber-700 dark:text-amber-300/80">
            <ShoppingBag className="size-5" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          ¿Querés sumar tragos o servicios para este evento?
        </p>
      </div>
      <Button
        className="h-11 shrink-0 rounded-xl bg-amber-500 font-semibold text-black hover:bg-amber-400"
        nativeButton={false}
        render={<Link href={storeHref} />}
      >
        Tienda de extras
      </Button>
    </div>
  )
}

const tabTriggerClass =
  "h-10 min-w-[7.5rem] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/80 hover:text-foreground data-active:border-border data-active:bg-background data-active:text-foreground data-active:shadow-sm sm:min-w-0 sm:px-4 sm:text-sm"

const tabCountClass =
  "rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-foreground ring-1 ring-inset ring-border"

export function TicketWallet({
  upcoming,
  past,
  userId,
  barRedemptions = [],
  storeOffers = [],
  offline = false,
  appleWalletEnabled = false,
  googleWalletEnabled = false,
  initialTab,
}: {
  upcoming: MyTicket[]
  past: MyTicket[]
  userId: string
  barRedemptions?: MyStoreRedemption[]
  storeOffers?: StoreOfferBlock[]
  offline?: boolean
  appleWalletEnabled?: boolean
  googleWalletEnabled?: boolean
  initialTab?: "upcoming" | "bar" | "past"
}) {
  const defaultTab =
    initialTab ??
    (upcoming.length > 0
      ? "upcoming"
      : barRedemptions.length > 0
        ? "bar"
        : "past")

  const upcomingGroups = useMemo(
    () => groupTicketsByEvent(upcoming),
    [upcoming],
  )
  const pastGroups = useMemo(() => groupTicketsByEvent(past), [past])
  const extraGroups = useMemo(
    () => groupExtrasByEvent(barRedemptions),
    [barRedemptions],
  )

  const validBar = barRedemptions.filter((item) => item.status === "valid")
  const hasOffers = storeOffers.length > 0 && !offline

  const eventsMissingExtras = useMemo(() => {
    const withExtras = new Set(extraGroups.map((g) => g.eventId))
    const offerByEvent = new Map(
      storeOffers.map((block) => [block.eventId, block]),
    )
    return upcomingGroups
      .filter((group) => !withExtras.has(group.eventId))
      .map((group) => ({
        ...group,
        hasStore: offerByEvent.has(group.eventId),
      }))
  }, [upcomingGroups, extraGroups, storeOffers])

  return (
    <Tabs key={defaultTab} defaultValue={defaultTab} className="w-full gap-6">
      <div className="-mx-1 overflow-x-auto whitespace-nowrap px-1 pb-1 scrollbar-none md:mx-0 md:overflow-visible md:whitespace-normal">
        <TabsList
          aria-label="Secciones de la billetera"
          className="inline-flex w-max min-w-full flex-nowrap items-stretch justify-start gap-1 whitespace-nowrap rounded-2xl border border-border bg-muted/40 p-1.5 shadow-lg shadow-black/10 backdrop-blur-md group-data-horizontal/tabs:h-auto sm:w-fit sm:min-w-0 sm:self-start md:flex-wrap md:justify-start lg:justify-start"
        >
          <TabsTrigger value="upcoming" className={tabTriggerClass}>
            <Ticket className="hidden size-3.5 sm:block" aria-hidden="true" />
            <span>Entradas</span>
            <span className={tabCountClass}>{upcoming.length}</span>
          </TabsTrigger>
          <TabsTrigger value="bar" className={tabTriggerClass}>
            <ShoppingBag
              className="hidden size-3.5 sm:block"
              aria-hidden="true"
            />
            <span>Mis Extras</span>
            <span className={tabCountClass}>{validBar.length}</span>
          </TabsTrigger>
          <TabsTrigger value="past" className={tabTriggerClass}>
            <History className="hidden size-3.5 sm:block" aria-hidden="true" />
            <span>Pasados</span>
            <span className={tabCountClass}>{past.length}</span>
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="upcoming" className="mt-0 outline-none">
        {upcomingGroups.length > 0 ? (
          <Accordion
            multiple
            defaultValue={upcomingGroups.map((group) => group.eventId)}
            className="space-y-4"
          >
            {upcomingGroups.map((group) => (
              <AccordionItem
                key={group.eventId}
                value={group.eventId}
                className="overflow-hidden rounded-3xl border border-border/80 bg-card/80 shadow-lg shadow-black/10 backdrop-blur-md not-last:border-b-0"
              >
                <AccordionTrigger className="px-4 py-4 hover:no-underline sm:px-5">
                  <EventGroupHeader
                    eventId={group.eventId}
                    title={group.eventTitle}
                    date={group.eventDate}
                    location={group.eventLocation}
                    flyerUrl={group.flyerUrl}
                    countLabel={
                      group.tickets.length === 1
                        ? "1 entrada activa"
                        : `${group.tickets.length} entradas activas`
                    }
                    showEventLink={false}
                  />
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-5 sm:px-5">
                  <div className="mb-4 flex justify-end">
                    <Link
                      href={`/events/${group.eventId}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
                    >
                      Ver evento
                      <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 md:items-start xl:grid-cols-3">
                    {group.tickets.map((ticket) => (
                      <LivingTicketCard
                        key={ticket.id}
                        ticket={ticket}
                        userId={userId}
                        showQr={!ticket.pendingTransfer}
                        offline={offline}
                        appleWalletEnabled={appleWalletEnabled}
                        googleWalletEnabled={googleWalletEnabled}
                        sequenceLabel={
                          ticketOrdinalInGroup(group.tickets, ticket).label
                        }
                      />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <EmptyState
            title="Sin entradas activas"
            description="Cuando compres una entrada, aparece acá lista para presentar en el ingreso."
            ctaHref="/events"
            ctaLabel="Explorar"
          />
        )}
      </TabsContent>

      <TabsContent value="bar" className="mt-0 space-y-8 outline-none">
        {extraGroups.length > 0 ? (
          <div className="space-y-8">
            <div>
              <h2 className="text-base font-bold text-foreground">
                Tus consumiciones
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Canjealas en barra o tienda con el QR de cada extra.
              </p>
            </div>
            {extraGroups.map((group) => (
              <section key={group.eventId}>
                <EventGroupHeader
                  eventId={group.eventId}
                  title={group.eventTitle}
                  date={group.eventDate}
                  countLabel={
                    group.redemptions.length === 1
                      ? "1 extra"
                      : `${group.redemptions.length} extras`
                  }
                />
                <div className="grid gap-4 md:grid-cols-2 md:items-start lg:grid-cols-3">
                  {group.redemptions.map((item) => (
                    <LivingStoreCard key={item.id} redemption={item} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}

        {eventsMissingExtras.length > 0 && !offline ? (
          <div className="space-y-3">
            {extraGroups.length === 0 ? (
              <div>
                <h2 className="text-base font-bold text-foreground">
                  Tus consumiciones
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Todavía no compraste extras. Sumá tragos o servicios para tus
                  eventos.
                </p>
              </div>
            ) : (
              <h3 className="text-sm font-semibold text-foreground">
                Sumá extras a tus eventos
              </h3>
            )}
            {eventsMissingExtras.map((group) => (
              <ExtrasUpsellCard
                key={group.eventId}
                title={group.eventTitle}
                flyerUrl={group.flyerUrl}
                storeHref={
                  group.hasStore
                    ? `#extras-${group.eventId}`
                    : `/events/${group.eventId}`
                }
              />
            ))}
          </div>
        ) : null}

        {extraGroups.length === 0 && eventsMissingExtras.length === 0 ? (
          <EmptyState
            kind="bar"
            title="Todavía no tenés extras"
            description="Cuando haya tienda en tus eventos, vas a poder comprar tragos y merch acá."
            ctaHref="/events"
            ctaLabel="Explorar"
          />
        ) : null}

        {hasOffers ? (
          <div id="extras-tienda" className="scroll-mt-24 space-y-4">
            <div className="flex items-center gap-2">
              <ShoppingBag
                className="size-4 text-amber-700 dark:text-amber-300"
                aria-hidden="true"
              />
              <h3 className="text-base font-bold text-foreground">
                Tienda de extras
              </h3>
            </div>
            {storeOffers.map((block) => (
              <div
                key={block.eventId}
                id={`extras-${block.eventId}`}
                className="scroll-mt-28"
              >
                <EventStoreUpsell
                  eventId={block.eventId}
                  eventTitle={block.title}
                  items={block.items}
                  canPurchase
                />
              </div>
            ))}
          </div>
        ) : null}
      </TabsContent>

      <TabsContent value="past" className="mt-0 outline-none">
        {pastGroups.length > 0 ? (
          <div className="space-y-8">
            {pastGroups.map((group) => (
              <section key={group.eventId} className="space-y-5">
                <EventGroupHeader
                  eventId={group.eventId}
                  title={group.eventTitle}
                  date={group.eventDate}
                  location={group.eventLocation}
                  flyerUrl={group.flyerUrl}
                  countLabel={
                    group.tickets.length === 1
                      ? "1 entrada"
                      : `${group.tickets.length} entradas`
                  }
                />
                <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:grid lg:grid-cols-2 lg:overflow-visible lg:px-0 xl:grid-cols-3">
                  {group.tickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="w-[min(85vw,22rem)] shrink-0 snap-center lg:w-auto"
                    >
                      <LivingTicketCard
                        ticket={ticket}
                        userId={userId}
                        showQr={false}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            kind="history"
            title="Sin historial"
            description="Tus entradas usadas o de eventos pasados se guardan acá."
          />
        )}
      </TabsContent>
    </Tabs>
  )
}
