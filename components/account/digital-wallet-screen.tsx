import { redirect } from "next/navigation"
import { Suspense } from "react"

import {
  getEventItems,
  getMyStoreRedemptions,
} from "@/app/actions/addons"
import { getMyTickets } from "@/app/actions/tickets"
import type { StoreOfferBlock } from "@/components/public/ticket-wallet"
import { OfflineTicketWallet } from "@/components/pwa/offline-ticket-wallet"
import { loginUrlWithNext } from "@/lib/auth/post-login"
import { countActiveTickets } from "@/lib/ticket-schedule"
import { getWalletUiFlags } from "@/lib/wallet-cache"

export async function DigitalWalletScreen({
  userId,
  loginNext,
}: {
  userId: string
  loginNext: string
}) {
  let initialTickets: Awaited<ReturnType<typeof getMyTickets>> = []
  let storeRedemptions: Awaited<ReturnType<typeof getMyStoreRedemptions>> = []
  let loadError: string | null = null

  try {
    const [tickets, redemptions] = await Promise.all([
      getMyTickets(),
      getMyStoreRedemptions(),
    ])
    initialTickets = tickets
    storeRedemptions = redemptions
  } catch (error) {
    if (error instanceof Error && error.message === "auth_required") {
      redirect(loginUrlWithNext(loginNext))
    }
    loadError =
      error instanceof Error
        ? error.message
        : "No se pudieron cargar tus entradas."
  }

  const walletFlags = getWalletUiFlags()

  const eligibleEvents = new Map<string, { title: string }>()
  for (const ticket of initialTickets) {
    if (
      ticket.status === "valid" ||
      ticket.status === "used" ||
      ticket.status === "scanned"
    ) {
      eligibleEvents.set(ticket.eventId, { title: ticket.eventTitle })
    }
  }

  const storeBlocks = (
    await Promise.all(
      [...eligibleEvents.entries()].map(async ([eventId, meta]) => {
        try {
          const items = await getEventItems(eventId)
          if (items.length === 0) return null
          return {
            eventId,
            title: meta.title,
            items,
          } satisfies StoreOfferBlock
        } catch {
          return null
        }
      }),
    )
  ).filter((block): block is StoreOfferBlock => Boolean(block))

  const validCount = countActiveTickets(initialTickets)

  return (
    <section className="space-y-8">
      <header>
        <p className="mb-3 inline-block rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-mono text-xs uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
          Billetera
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Mis entradas
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {validCount === 1
            ? "1 entrada activa en tu billetera."
            : `${validCount} entradas activas en tu billetera.`}{" "}
          Living QR · transferí a un amigo o sumá extras.
        </p>
      </header>

      <Suspense
        fallback={
          <div className="rounded-3xl border border-border bg-muted/40 px-5 py-12 text-center text-sm text-muted-foreground">
            Cargando billetera…
          </div>
        }
      >
        <OfflineTicketWallet
          userId={userId}
          initialTickets={initialTickets}
          barRedemptions={storeRedemptions}
          storeOffers={storeBlocks}
          loadError={loadError}
          appleWalletEnabled={walletFlags.appleWalletEnabled}
          googleWalletEnabled={walletFlags.googleWalletEnabled}
        />
      </Suspense>
    </section>
  )
}
