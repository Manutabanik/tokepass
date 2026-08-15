"use client"

import { Ticket, WifiOff } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import type { MyTicket } from "@/app/actions/tickets"
import { LivingTicketCard } from "@/components/public/living-ticket-card"
import { useOnlineStatus } from "@/components/pwa/use-online-status"
import {
  getOfflineActiveUserId,
  getTicketsOffline,
} from "@/lib/offline-store"

export function DeviceWalletScreen() {
  const online = useOnlineStatus()
  const [userId, setUserId] = useState<string | null>(null)
  const [tickets, setTickets] = useState<MyTicket[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const activeUser = await getOfflineActiveUserId()
        const cached = await getTicketsOffline(activeUser)
        if (cancelled) return
        setUserId(activeUser)
        setTickets(cached)
      } catch {
        if (!cancelled) {
          setUserId(null)
          setTickets([])
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const active = tickets.filter((ticket) => ticket.status === "valid")

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col gap-5 px-4 py-8">
      <header className="space-y-3">
        <p className="inline-flex items-center gap-2 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-fuchsia-200">
          <Ticket className="size-3.5" aria-hidden="true" />
          Tokepass
        </p>
        <h1 className="text-3xl font-black tracking-tight">Mis entradas</h1>
        {!online ? (
          <p
            role="status"
            className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-100"
          >
            <WifiOff className="size-3.5 shrink-0" aria-hidden="true" />
            Modo sin conexión - QR disponible para lectura
          </p>
        ) : (
          <p className="text-sm text-zinc-400">
            Estas entradas están guardadas en este dispositivo.
          </p>
        )}
      </header>

      {!ready ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-12 text-center text-sm text-zinc-400">
          Cargando billetera local…
        </div>
      ) : null}

      {ready && active.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-12 text-center text-sm text-zinc-400">
          No hay entradas guardadas en este dispositivo. Conectate y abrí Mis
          entradas para sincronizar el QR.
        </div>
      ) : null}

      {userId
        ? active.map((ticket) => (
            <LivingTicketCard
              key={ticket.id}
              ticket={ticket}
              userId={userId}
              offline={!online}
            />
          ))
        : null}

      {online ? (
        <Link
          href="/cuenta/entradas"
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm font-semibold text-white hover:bg-white/10"
        >
          Volver a la billetera online
        </Link>
      ) : null}
    </main>
  )
}
