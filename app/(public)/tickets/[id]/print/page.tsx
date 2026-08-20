import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getPrintableTicket } from "@/app/actions/pos"
import { PrintTicketActions } from "@/components/public/print-ticket-actions"
import { PrintableTicketView } from "@/components/public/printable-ticket"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Entrada para imprimir",
  description: "Vista imprimible / PDF de tu entrada TokePass.",
}

export default async function TicketPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ autoprint?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const autoPrint = query.autoprint === "1" || query.autoprint === "true"

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
    <div
      className="min-h-[calc(100vh-4rem)] bg-zinc-100 px-4 py-8 text-zinc-950 print:min-h-0 print:bg-white print:p-0 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
      style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
    >
      <div
        className={`no-print print:hidden mx-auto mb-6 flex items-center justify-between gap-3 ${
          autoPrint ? "max-w-[300px]" : "max-w-[28rem]"
        }`}
      >
        {!autoPrint ? (
          <Link
            href="/cuenta/entradas"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-950"
          >
            Volver
          </Link>
        ) : (
          <span />
        )}
        <PrintTicketActions autoPrint={autoPrint} />
      </div>

      <PrintableTicketView
        ticket={ticket}
        variant={autoPrint ? "thermal" : "pass"}
      />
    </div>
  )
}
