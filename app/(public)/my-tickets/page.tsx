import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getMyBarRedemptions } from "@/app/actions/addons"
import { getMyTickets } from "@/app/actions/tickets"
import { OfflineTicketWallet } from "@/components/pwa/offline-ticket-wallet"
import { createClient } from "@/lib/supabase/server"

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
  let barRedemptions: Awaited<ReturnType<typeof getMyBarRedemptions>> = []
  let loadError: string | null = null

  try {
    const [tickets, redemptions] = await Promise.all([
      getMyTickets(),
      getMyBarRedemptions(),
    ])
    initialTickets = tickets
    barRedemptions = redemptions
  } catch (error) {
    if (error instanceof Error && error.message === "auth_required") {
      redirect("/login?next=/my-tickets")
    }
    loadError =
      error instanceof Error
        ? error.message
        : "No se pudieron cargar tus entradas."
  }

  return (
    <div className="dark relative isolate min-h-[calc(100vh-4rem)] bg-zinc-950 text-zinc-100">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_42%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.08),transparent_38%)]"
        aria-hidden="true"
      />

      <section className="mx-auto w-full max-w-lg px-4 pb-10 pt-8 sm:px-5">
        <header className="mb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-400/90">
            Billetera
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">
            Mis entradas
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Entradas con Living QR offline. Guardá la app en tu pantalla de
            inicio para la puerta.
          </p>
        </header>

        <OfflineTicketWallet
          userId={user.id}
          initialTickets={initialTickets}
          barRedemptions={barRedemptions}
          loadError={loadError}
        />
      </section>
    </div>
  )
}
