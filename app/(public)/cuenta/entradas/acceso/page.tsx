import type { Metadata } from "next"
import Link from "next/link"

import { listGuestOrderTickets } from "@/app/actions/guest-ticket-access"

export const metadata: Metadata = {
  title: "Acceso a tus entradas",
  description: "Abrí tus entradas de invitado con el enlace de confirmación.",
}

export default async function GuestTicketAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  if (params.error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-black">El enlace ya no es válido</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Pedí uno nuevo desde el mail de confirmación.
        </p>
        <Link
          href="/cuenta/entradas"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Ir a mi billetera
        </Link>
      </div>
    )
  }

  const tickets = await listGuestOrderTickets()
  if (tickets.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-black">No encontramos entradas</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Usá el enlace del mail de confirmación para abrir tus tickets.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-10">
      <h1 className="text-2xl font-black">Tus entradas</h1>
      <p className="text-sm text-muted-foreground">
        Para ver el QR vas a necesitar el codigo de 4 digitos que te enviamos.
      </p>
      <ul className="space-y-3">
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            <Link
              href={`/cuenta/entradas/${ticket.id}`}
              className="block rounded-2xl border border-border bg-card px-4 py-4"
            >
              <p className="font-semibold">{ticket.eventTitle}</p>
              <p className="text-sm text-muted-foreground">{ticket.tierName}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
