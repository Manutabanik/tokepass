"use client"

import { GlassWater, Ticket } from "lucide-react"
import Link from "next/link"

import type { MyBarRedemption } from "@/app/actions/addons"
import type { MyTicket } from "@/app/actions/tickets"
import { BarWalletEmpty, LivingBarCard } from "@/components/public/living-bar-card"
import { LivingTicketCard } from "@/components/public/living-ticket-card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

function EmptyState({
  title,
  description,
  cta = false,
}: {
  title: string
  description: string
  cta?: boolean
}) {
  return (
    <div className="grid min-h-64 place-items-center rounded-[1.75rem] border border-dashed border-zinc-800 bg-zinc-950/60 px-5 py-12 text-center">
      <div>
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-zinc-900 text-zinc-400 ring-1 ring-inset ring-zinc-800">
          <Ticket className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-lg font-bold text-white">{title}</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-zinc-500">
          {description}
        </p>
        {cta && (
          <Button
            className="mt-6 h-11 rounded-full bg-white px-6 text-zinc-950 hover:bg-zinc-200"
            nativeButton={false}
            render={<Link href="/events" />}
          >
            Explorar eventos
          </Button>
        )}
      </div>
    </div>
  )
}

function TicketStack({
  tickets,
  userId,
  showQr,
  offline = false,
}: {
  tickets: MyTicket[]
  userId: string
  showQr: boolean
  offline?: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      {tickets.map((ticket) => (
        <LivingTicketCard
          key={ticket.id}
          ticket={ticket}
          userId={userId}
          showQr={showQr}
          offline={offline}
        />
      ))}
    </div>
  )
}

export function TicketWallet({
  upcoming,
  past,
  userId,
  barRedemptions = [],
  offline = false,
}: {
  upcoming: MyTicket[]
  past: MyTicket[]
  userId: string
  barRedemptions?: MyBarRedemption[]
  offline?: boolean
}) {
  const defaultTab =
    upcoming.length > 0
      ? "upcoming"
      : barRedemptions.length > 0
        ? "bar"
        : "past"

  const validBar = barRedemptions.filter((item) => item.status === "valid")
  const redeemedBar = barRedemptions.filter((item) => item.status === "redeemed")

  return (
    <Tabs defaultValue={defaultTab} className="w-full gap-5">
      <TabsList className="grid h-12 w-full grid-cols-3 rounded-2xl bg-zinc-900 p-1 ring-1 ring-zinc-800">
        <TabsTrigger
          value="upcoming"
          className="h-10 rounded-xl text-sm font-semibold text-zinc-400 data-active:bg-zinc-800 data-active:text-white data-active:shadow-none"
        >
          Entradas
          <span className="ml-1 tabular-nums text-zinc-500 data-active:text-zinc-300">
            ({upcoming.length})
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="bar"
          className="h-10 rounded-xl text-sm font-semibold text-zinc-400 data-active:bg-zinc-800 data-active:text-white data-active:shadow-none"
        >
          <GlassWater className="mr-1 size-3.5 opacity-70" aria-hidden="true" />
          Consumiciones
          <span className="ml-1 tabular-nums text-zinc-500 data-active:text-zinc-300">
            ({barRedemptions.length})
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="past"
          className="h-10 rounded-xl text-sm font-semibold text-zinc-400 data-active:bg-zinc-800 data-active:text-white data-active:shadow-none"
        >
          Pasados
          <span className="ml-1 tabular-nums text-zinc-500 data-active:text-zinc-300">
            ({past.length})
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="upcoming" className="mt-0 outline-none">
        {upcoming.length > 0 ? (
          <TicketStack
            tickets={upcoming}
            userId={userId}
            showQr
            offline={offline}
          />
        ) : (
          <EmptyState
            title="Sin entradas próximas"
            description="Cuando compres un evento, tu Living Ticket aparecerá aquí listo para la puerta."
            cta
          />
        )}
      </TabsContent>

      <TabsContent value="bar" className="mt-0 outline-none">
        {barRedemptions.length > 0 ? (
          <div className="flex flex-col gap-4">
            {validBar.map((item) => (
              <LivingBarCard key={item.id} redemption={item} />
            ))}
            {redeemedBar.map((item) => (
              <LivingBarCard key={item.id} redemption={item} />
            ))}
          </div>
        ) : (
          <BarWalletEmpty />
        )}
      </TabsContent>

      <TabsContent value="past" className="mt-0 outline-none">
        {past.length > 0 ? (
          <TicketStack tickets={past} userId={userId} showQr={false} />
        ) : (
          <EmptyState
            title="Sin historial"
            description="Tus entradas usadas o de eventos pasados se guardan acá."
          />
        )}
      </TabsContent>
    </Tabs>
  )
}
