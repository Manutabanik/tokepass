import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getPrintableTicket } from "@/app/actions/pos"
import { PrintTicketActions } from "@/components/public/print-ticket-actions"
import { PrintableTicketView } from "@/components/public/printable-ticket"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Entrada para imprimir",
  description: "Vista imprimible / PDF de tu entrada Tokepass.",
}

export default async function TicketPrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=/tickets/${id}/print`)
  }

  const ticket = await getPrintableTicket(id)
  if (!ticket) notFound()

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-zinc-100 px-4 py-8 text-zinc-950">
      <div className="no-print mx-auto mb-6 flex max-w-[420px] items-center justify-between gap-3">
        <Link
          href="/my-tickets"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-950"
        >
          ← Volver a billetera
        </Link>
        <PrintTicketActions />
      </div>

      <PrintableTicketView ticket={ticket} />
    </div>
  )
}
