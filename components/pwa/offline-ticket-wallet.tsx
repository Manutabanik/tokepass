"use client"

import { WifiOff } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import type { MyStoreRedemption } from "@/app/actions/addons"
import type { MyTicket } from "@/app/actions/tickets"
import {
  useOnlineStatus,
  useVerifiedOnlineStatus,
} from "@/components/pwa/use-online-status"
import {
  TicketWallet,
  type StoreOfferBlock,
} from "@/components/public/ticket-wallet"
import { Badge } from "@/components/ui/badge"
import {
  getRedemptionsOffline,
  getTicketsOffline,
  saveRedemptionsOffline,
  saveTicketsOffline,
} from "@/lib/offline-store"
import { splitTicketsBySchedule } from "@/lib/ticket-schedule"
import { walletCheckoutExtras } from "@/lib/tickets/wallet-extras"

type OfflineTicketWalletProps = {
  userId: string
  initialTickets: MyTicket[]
  barRedemptions?: MyStoreRedemption[]
  storeOffers?: StoreOfferBlock[]
  loadError?: string | null
}

export function OfflineTicketWallet({
  userId,
  initialTickets,
  barRedemptions = [],
  storeOffers = [],
  loadError = null,
}: OfflineTicketWalletProps) {
  // `deviceOnline` habilita escribir el caché (los datos del server ya
  // llegaron); `connected` gatea la UI y todo lo que necesita red de verdad.
  const deviceOnline = useOnlineStatus()
  const connected = useVerifiedOnlineStatus()
  const searchParams = useSearchParams()
  const [cachedTickets, setCachedTickets] = useState<MyTicket[] | null>(null)
  const [cachedRedemptions, setCachedRedemptions] = useState<
    MyStoreRedemption[] | null
  >(null)
  const [cacheReady, setCacheReady] = useState(false)

  const tabParam = searchParams.get("tab")
  const initialTab =
    tabParam === "extras" || tabParam === "bar"
      ? ("bar" as const)
      : tabParam === "past"
        ? ("past" as const)
        : tabParam === "entradas" || tabParam === "upcoming"
          ? ("upcoming" as const)
          : undefined

  // En la primera visita la lectura del caché puede resolverse antes de que
  // termine la escritura, así que un caché vacío cae a los datos que el server
  // ya entregó en esta carga en lugar de mostrar la billetera vacía.
  const tickets = connected
    ? initialTickets
    : cachedTickets && cachedTickets.length > 0
      ? cachedTickets
      : initialTickets

  useEffect(() => {
    if (!deviceOnline || !userId || loadError) return

    void saveTicketsOffline(userId, initialTickets).catch(() => {
      // Sync offline best-effort
    })
  }, [deviceOnline, userId, initialTickets, loadError])

  useEffect(() => {
    if (!deviceOnline || !userId || loadError) return

    void saveRedemptionsOffline(userId, barRedemptions).catch(() => {
      // Sync offline best-effort
    })
  }, [deviceOnline, userId, barRedemptions, loadError])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const cached = await getTicketsOffline(userId)
        if (cancelled) return
        setCachedTickets(cached.length > 0 ? cached : [])
      } catch {
        if (!cancelled) setCachedTickets([])
      } finally {
        if (!cancelled) setCacheReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    let cancelled = false

    void getRedemptionsOffline(userId)
      .then((cached) => {
        if (!cancelled) setCachedRedemptions(cached)
      })
      .catch(() => {
        if (!cancelled) setCachedRedemptions([])
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!connected || !loadError || initialTickets.length > 0) return

    let cancelled = false
    void getTicketsOffline(userId).then((cached) => {
      if (!cancelled && cached.length > 0) setCachedTickets(cached)
    })
    return () => {
      cancelled = true
    }
  }, [connected, loadError, initialTickets.length, userId])

  const displayTickets =
    connected && loadError && cachedTickets && cachedTickets.length > 0
      ? cachedTickets
      : tickets

  // Sin conexión el QR de canje se sigue armando en el dispositivo, así que los
  // extras cacheados se muestran igual. Las ofertas de tienda no: comprar
  // necesita red.
  const displayRedemptions = connected
    ? barRedemptions
    : cachedRedemptions && cachedRedemptions.length > 0
      ? cachedRedemptions
      : barRedemptions

  const { upcoming, past } = useMemo(
    () => splitTicketsBySchedule(displayTickets),
    [displayTickets],
  )
  const extraTickets = useMemo(
    () => walletCheckoutExtras(displayTickets),
    [displayTickets],
  )

  const showOfflineBanner = !connected
  const showLoadError = Boolean(connected && loadError)
  const hasDisplayTickets = displayTickets.length > 0

  return (
    <div className="w-full overflow-hidden space-y-4">
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
              Modo sin señal (Tu código sigue funcionando igual)
            </Badge>
            <p className="mt-1.5 text-sm leading-5 text-amber-100/90">
              Tu entrada está guardada en tu dispositivo y lista para ser
              escaneada. El código de acceso se sigue actualizando sin
              internet.
            </p>
          </div>
        </div>
      ) : null}

      {showLoadError && hasDisplayTickets ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {loadError}
        </div>
      ) : null}

      {showLoadError && !hasDisplayTickets && !cacheReady ? (
        <div className="rounded-3xl border border-border bg-muted/40 px-5 py-12 text-center text-sm text-muted-foreground">
          Cargando billetera…
        </div>
      ) : showLoadError && !hasDisplayTickets ? (
        <div
          role="alert"
          className="rounded-3xl border border-red-500/20 bg-red-500/10 px-5 py-8 text-center text-sm text-red-200"
        >
          {loadError}
        </div>
      ) : (
        <TicketWallet
          upcoming={upcoming}
          past={past}
          extraTickets={extraTickets}
          barRedemptions={displayRedemptions}
          storeOffers={connected ? storeOffers : []}
          offline={!connected}
          initialTab={initialTab}
        />
      )}
    </div>
  )
}
