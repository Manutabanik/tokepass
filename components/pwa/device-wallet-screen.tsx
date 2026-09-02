"use client"

import { Ticket, WifiOff } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

import type { MyTicket } from "@/app/actions/tickets"
import { LivingTicketCard } from "@/components/public/living-ticket-card"
import { useVerifiedOnlineStatus } from "@/components/pwa/use-online-status"
import {
  DEVICE_WALLET_REASON_EXPIRED,
  DEVICE_WALLET_REASON_PARAM,
  WALLET_PATH,
  loginUrlWithNext,
} from "@/lib/auth/next-path"
import {
  getOfflineActiveUserId,
  getTicketsOffline,
} from "@/lib/offline-store"
import { isWalletCheckoutExtra } from "@/lib/tickets/wallet-extras"

const linkClass =
  "inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"

export function DeviceWalletScreen() {
  const connected = useVerifiedOnlineStatus()
  const searchParams = useSearchParams()
  const [userId, setUserId] = useState<string | null>(null)
  const [tickets, setTickets] = useState<MyTicket[]>([])
  const [ready, setReady] = useState(false)

  const sessionExpired =
    searchParams.get(DEVICE_WALLET_REASON_PARAM) ===
    DEVICE_WALLET_REASON_EXPIRED

  // Sin sesión válida las acciones de red (transferir, revender) fallarían en
  // el servidor, así que el pase se muestra solo para escanear.
  const readOnly = !connected || sessionExpired

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

  const active = tickets.filter(
    (ticket) => ticket.status === "valid" && !isWalletCheckoutExtra(ticket),
  )

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col gap-5 px-4 py-8">
      <header className="space-y-3">
        <p className="inline-flex items-center gap-2 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-fuchsia-200">
          <Ticket className="size-3.5" aria-hidden="true" />
          TokePass
        </p>
        <h1 className="text-3xl font-black tracking-tight">Mis entradas</h1>
        {!connected ? (
          <p
            role="status"
            className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-100"
          >
            <WifiOff className="size-3.5 shrink-0" aria-hidden="true" />
            Modo sin señal (Tu código sigue funcionando igual)
          </p>
        ) : sessionExpired ? (
          <div
            role="status"
            className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3"
          >
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-200">
              Modo lectura · sesión expirada
            </p>
            <p className="mt-1.5 text-sm leading-5 text-amber-100/90">
              Estas son las entradas guardadas en este dispositivo y tu código
              de acceso sigue funcionando. Iniciá sesión para recuperar la
              billetera completa.
            </p>
          </div>
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
        <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-12 text-center">
          {!connected ? (
            <>
              <p className="text-base font-bold text-white">
                Sin conexión ni entradas guardadas
              </p>
              <p className="mt-2 text-sm text-zinc-400">
                Cuando tengas señal, iniciá sesión y abrí Mis entradas: el
                código queda guardado en este dispositivo para la próxima vez.
              </p>
            </>
          ) : sessionExpired ? (
            <>
              <p className="text-base font-bold text-white">
                No hay entradas guardadas en este dispositivo
              </p>
              <p className="mt-2 text-sm text-zinc-400">
                Tu sesión expiró. Iniciá sesión para volver a ver tu billetera.
              </p>
            </>
          ) : (
            <p className="text-sm text-zinc-400">
              No hay entradas guardadas en este dispositivo. Conectate y abrí
              Mis entradas para sincronizar el QR.
            </p>
          )}
        </div>
      ) : null}

      {userId
        ? active.map((ticket) => (
            <LivingTicketCard
              key={ticket.id}
              ticket={ticket}
              userId={userId}
              offline={readOnly}
            />
          ))
        : null}

      {connected ? (
        sessionExpired ? (
          <Link href={loginUrlWithNext(WALLET_PATH)} className={linkClass}>
            Iniciar sesión
          </Link>
        ) : (
          <Link href={WALLET_PATH} className={linkClass}>
            Volver a la billetera online
          </Link>
        )
      ) : null}
    </main>
  )
}
