"use client"

import { WifiOff } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import type { MyBarRedemption } from "@/app/actions/addons"
import type { MyTicket } from "@/app/actions/tickets"
import { useOnlineStatus } from "@/components/pwa/use-online-status"
import { TicketWallet } from "@/components/public/ticket-wallet"
import { Badge } from "@/components/ui/badge"
import {
  getTicketsOffline,
  saveTicketsOffline,
} from "@/lib/offline-store"
import { splitTicketsBySchedule } from "@/lib/ticket-schedule"

type OfflineTicketWalletProps = {
  userId: string
  initialTickets: MyTicket[]
  barRedemptions?: MyBarRedemption[]
  loadError?: string | null
}

export function OfflineTicketWallet({
  userId,
  initialTickets,
  barRedemptions = [],
  loadError = null,
}: OfflineTicketWalletProps) {
  const online = useOnlineStatus()
  const [tickets, setTickets] = useState<MyTicket[]>(initialTickets)
  const [hydratedOffline, setHydratedOffline] = useState(false)

  useEffect(() => {
    setTickets(initialTickets)
  }, [initialTickets])

  // Sync → IndexedDB cuando hay red (incluye vaciar caché si ya no hay entradas).
  useEffect(() => {
    if (!online || !userId) return
    // Evitar pisar caché local si el fetch del servidor falló.
    if (loadError) return

    void saveTicketsOffline(userId, initialTickets).catch((error: unknown) => {
      console.warn("[offline-store] sync failed", error)
    })
  }, [online, userId, initialTickets, loadError])

  // Sin conexión (o SSR vacío tras F5 offline): leer billetera local.
  useEffect(() => {
    if (online) {
      setHydratedOffline(false)
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const cached = await getTicketsOffline(userId)
        if (cancelled) return
        if (cached.length > 0) {
          setTickets(cached)
        }
      } catch (error: unknown) {
        console.warn("[offline-store] read failed", error)
      } finally {
        if (!cancelled) setHydratedOffline(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [online, userId])

  // También hidratar desde IDB si el servidor falló pero hay caché local.
  useEffect(() => {
    if (!online || !loadError || tickets.length > 0) return

    let cancelled = false
    void getTicketsOffline(userId).then((cached) => {
      if (!cancelled && cached.length > 0) setTickets(cached)
    })
    return () => {
      cancelled = true
    }
  }, [online, loadError, tickets.length, userId])

  const { upcoming, past } = useMemo(
    () => splitTicketsBySchedule(tickets),
    [tickets],
  )

  const showOfflineBanner = !online
  const showEmptyError =
    online && loadError && tickets.length === 0 && !hydratedOffline

  return (
    <div className="space-y-4">
      {showOfflineBanner ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3"
        >
          <WifiOff
            className="mt-0.5 size-4 shrink-0 text-amber-300"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <Badge
              variant="outline"
              className="rounded-full border-amber-500/40 bg-transparent px-2 py-0 text-[10px] font-semibold uppercase tracking-wide text-amber-200"
            >
              Modo Guardado / QR Offline Protegido
            </Badge>
            <p className="mt-1.5 text-sm leading-5 text-amber-100/90">
              Tu entrada está guardada en tu dispositivo y lista para ser
              escaneada. El Living QR sigue renovándose sin internet.
            </p>
          </div>
        </div>
      ) : null}

      {showEmptyError ? (
        <div className="rounded-3xl border border-red-500/20 bg-red-500/10 px-5 py-8 text-center text-sm text-red-200">
          {loadError}
        </div>
      ) : (
        <TicketWallet
          upcoming={upcoming}
          past={past}
          userId={userId}
          barRedemptions={online ? barRedemptions : []}
          offline={!online}
        />
      )}
    </div>
  )
}
