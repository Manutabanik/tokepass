"use client"

import {
  ArrowUpRight,
  GlassWater,
  History,
  Ticket,
} from "lucide-react"
import { motion } from "motion/react"
import Link from "next/link"

import type { MyBarRedemption } from "@/app/actions/addons"
import type { MyTicket } from "@/app/actions/tickets"
import { LivingBarCard } from "@/components/public/living-bar-card"
import { LivingTicketCard } from "@/components/public/living-ticket-card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

function EmptyState({
  title,
  description,
  cta = false,
  kind = "tickets",
}: {
  title: string
  description: string
  cta?: boolean
  kind?: "tickets" | "bar" | "history"
}) {
  const Icon =
    kind === "bar" ? GlassWater : kind === "history" ? History : Ticket
  const isBar = kind === "bar"

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative isolate min-h-[360px] overflow-hidden rounded-3xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/80 to-zinc-950/90 px-6 py-12 text-center shadow-2xl shadow-black/25 sm:min-h-[420px] sm:px-14 sm:py-16"
    >
      <div
        className={[
          "pointer-events-none absolute -top-24 left-1/2 -z-10 size-64 -translate-x-1/2 rounded-full blur-3xl",
          isBar ? "bg-amber-500/15" : "bg-emerald-500/15",
        ].join(" ")}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-16 bottom-0 -z-10 h-px bg-gradient-to-r from-transparent via-zinc-700/60 to-transparent"
        aria-hidden="true"
      />

      <div className="flex min-h-[264px] flex-col items-center justify-center sm:min-h-[292px]">
        <span
          className={[
            "mb-6 grid size-16 place-items-center rounded-2xl border border-zinc-700 bg-zinc-800/80 text-zinc-300 shadow-inner sm:size-20",
            isBar
              ? "shadow-[0_0_25px_rgba(245,158,11,0.15)]"
              : "shadow-[0_0_25px_rgba(16,185,129,0.15)]",
          ].join(" ")}
        >
          <Icon className="size-7 sm:size-8" aria-hidden="true" />
        </span>
        <h2 className="mb-2 text-lg font-bold text-white sm:text-xl">
          {title}
        </h2>
        <p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-zinc-400 sm:text-base">
          {description}
        </p>
        {cta && (
          <Button
            className="h-12 rounded-xl bg-white px-6 text-sm font-semibold text-zinc-950 shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-all hover:scale-[1.02] hover:bg-zinc-100 active:scale-[0.98] sm:text-base"
            nativeButton={false}
            render={<Link href="/events" />}
          >
            Explorar eventos
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </motion.div>
  )
}

function TicketStack({
  tickets,
  userId,
  showQr,
  offline = false,
  appleWalletEnabled = false,
  googleWalletEnabled = false,
}: {
  tickets: MyTicket[]
  userId: string
  showQr: boolean
  offline?: boolean
  appleWalletEnabled?: boolean
  googleWalletEnabled?: boolean
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 md:items-start">
      {tickets.map((ticket) => (
        <LivingTicketCard
          key={ticket.id}
          ticket={ticket}
          userId={userId}
          showQr={showQr}
          offline={offline}
          appleWalletEnabled={appleWalletEnabled}
          googleWalletEnabled={googleWalletEnabled}
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
  appleWalletEnabled = false,
  googleWalletEnabled = false,
}: {
  upcoming: MyTicket[]
  past: MyTicket[]
  userId: string
  barRedemptions?: MyBarRedemption[]
  offline?: boolean
  appleWalletEnabled?: boolean
  googleWalletEnabled?: boolean
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
    <Tabs defaultValue={defaultTab} className="w-full gap-6">
      <TabsList
        aria-label="Secciones de la billetera"
        className="inline-flex w-full items-stretch justify-start gap-1 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-1.5 shadow-lg shadow-black/20 backdrop-blur-md group-data-horizontal/tabs:h-auto sm:w-fit sm:self-start"
      >
        <TabsTrigger
          value="upcoming"
          className="h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-zinc-400 transition-all hover:bg-zinc-800/40 hover:text-white data-active:border-zinc-700/60 data-active:bg-zinc-800 data-active:text-white data-active:shadow-sm sm:h-10 sm:flex-none sm:px-4 sm:text-sm"
        >
          <Ticket className="hidden size-3.5 sm:block" aria-hidden="true" />
          <span>Entradas</span>
          <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-zinc-200 ring-1 ring-inset ring-zinc-700/60">
            {upcoming.length}
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="bar"
          className="h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-zinc-400 transition-all hover:bg-zinc-800/40 hover:text-white data-active:border-zinc-700/60 data-active:bg-zinc-800 data-active:text-white data-active:shadow-sm sm:h-10 sm:flex-none sm:px-4 sm:text-sm"
        >
          <GlassWater className="hidden size-3.5 sm:block" aria-hidden="true" />
          <span className="sm:hidden">Consumos</span>
          <span className="hidden sm:inline">Consumiciones</span>
          <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-zinc-200 ring-1 ring-inset ring-zinc-700/60">
            {barRedemptions.length}
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="past"
          className="h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-zinc-400 transition-all hover:bg-zinc-800/40 hover:text-white data-active:border-zinc-700/60 data-active:bg-zinc-800 data-active:text-white data-active:shadow-sm sm:h-10 sm:flex-none sm:px-4 sm:text-sm"
        >
          <History className="hidden size-3.5 sm:block" aria-hidden="true" />
          <span>Pasados</span>
          <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-zinc-200 ring-1 ring-inset ring-zinc-700/60">
            {past.length}
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
            appleWalletEnabled={appleWalletEnabled}
            googleWalletEnabled={googleWalletEnabled}
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
          <div className="grid gap-4 md:grid-cols-2 md:items-start">
            {validBar.map((item) => (
              <LivingBarCard key={item.id} redemption={item} />
            ))}
            {redeemedBar.map((item) => (
              <LivingBarCard key={item.id} redemption={item} />
            ))}
          </div>
        ) : (
          <EmptyState
            kind="bar"
            title="Sin consumiciones"
            description="Cuando compres tragos o combos con tu entrada, aparecerán acá con su QR de barra."
          />
        )}
      </TabsContent>

      <TabsContent value="past" className="mt-0 outline-none">
        {past.length > 0 ? (
          <TicketStack tickets={past} userId={userId} showQr={false} />
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
