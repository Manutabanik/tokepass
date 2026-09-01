import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { getPrintableTicket } from "@/app/actions/pos"
import { PrintTicketActions } from "@/components/public/print-ticket-actions"
import { PrintableTicketView } from "@/components/public/printable-ticket"
import { isPublicEntityId } from "@/lib/security/public-ids"
import { createClient } from "@/lib/supabase/server"
import {
  DIGITAL_TICKET_STATIC_EXPORT_MESSAGE,
  DigitalTicketStaticExportError,
} from "@/lib/tickets/static-tps-policy"

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
  if (!isPublicEntityId(id)) notFound()
  const query = await searchParams
  const autoPrint = query.autoprint === "1" || query.autoprint === "true"

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=/tickets/${id}/print`)
  }

  let ticket
  try {
    ticket = await getPrintableTicket(id)
  } catch (error) {
    if (error instanceof DigitalTicketStaticExportError) {
      return (
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-xl font-semibold text-zinc-950">
            {DIGITAL_TICKET_STATIC_EXPORT_MESSAGE}
          </h1>
          <p className="text-sm text-zinc-600">
            Abrí Mis entradas y mostrá el código vivo en la puerta.
          </p>
          <Link
            href="/cuenta/entradas"
            className="text-sm font-semibold text-zinc-950 underline underline-offset-4"
          >
            Ir a mis entradas
          </Link>
        </div>
      )
    }
    throw error
  }
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
        <PrintTicketActions ticketId={id} autoPrint={autoPrint} />
      </div>

      <PrintableTicketView
        ticket={ticket}
        variant={autoPrint ? "thermal" : "pass"}
      />
    </div>
  )
}
