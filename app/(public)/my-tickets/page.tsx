import type { Metadata } from "next"
import { redirect } from "next/navigation"

import {
  getEventItems,
  getMyStoreRedemptions,
} from "@/app/actions/addons"
import { getMyTickets } from "@/app/actions/tickets"
import { EventStoreUpsell } from "@/components/public/event-store-upsell"
import { OfflineTicketWallet } from "@/components/pwa/offline-ticket-wallet"
import { createClient } from "@/lib/supabase/server"
import { getWalletUiFlags } from "@/lib/wallet-cache"

export const metadata: Metadata = {
  title: "Mis entradas",
  description:
    "Billetera digital Tokepass: Living Tickets offline-first con QR vivo.",
}

export default async function MyTicketsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/my-tickets")
  }

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
      redirect("/login?next=/my-tickets")
    }
    loadError =
      error instanceof Error
        ? error.message
        : "No se pudieron cargar tus entradas."
  }

  const walletFlags = getWalletUiFlags()

  const eligibleEvents = new Map<
    string,
    { title: string }
  >()
  for (const ticket of initialTickets) {
    if (
      ticket.status === "valid" ||
      ticket.status === "used" ||
      ticket.status === "scanned"
    ) {
      eligibleEvents.set(ticket.eventId, { title: ticket.eventTitle })
    }
  }

  const storeBlocks = await Promise.all(
    [...eligibleEvents.entries()].map(async ([eventId, meta]) => {
      try {
        const items = await getEventItems(eventId)
        if (items.length === 0) return null
        return { eventId, title: meta.title, items }
      } catch {
        return null
      }
    }),
  )

  return (
    <main className="dark relative isolate min-h-[calc(100vh-4rem)] overflow-hidden bg-[#09090b] text-zinc-100">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_22%_0%,rgba(16,185,129,0.14),transparent_35%),radial-gradient(circle_at_82%_6%,rgba(139,92,246,0.09),transparent_32%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_72%)]"
        aria-hidden="true"
      />

      <section className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <header>
          <p className="mb-3 inline-block rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-mono text-xs uppercase tracking-[0.18em] text-emerald-400">
            Billetera
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Mis entradas
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-400 sm:text-base">
            Entradas con Living QR offline. Después de comprar, sumá extras
            desde la Tienda.
          </p>
        </header>

        <OfflineTicketWallet
          userId={user.id}
          initialTickets={initialTickets}
          barRedemptions={storeRedemptions}
          loadError={loadError}
          appleWalletEnabled={walletFlags.appleWalletEnabled}
          googleWalletEnabled={walletFlags.googleWalletEnabled}
        />

        {storeBlocks.filter(Boolean).length > 0 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white">Tienda de Extras</h2>
            {storeBlocks.map((block) =>
              block ? (
                <EventStoreUpsell
                  key={block.eventId}
                  eventId={block.eventId}
                  eventTitle={block.title}
                  items={block.items}
                  canPurchase
                />
              ) : null,
            )}
          </div>
        ) : null}
      </section>
    </main>
  )
}
