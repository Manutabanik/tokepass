import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getGuestOrderWallet } from "@/app/actions/guest-ticket-access"
import { GuestOrderWallet } from "@/components/account/guest-order-wallet"
import { isGuestOrderToken } from "@/lib/checkout/guest-token"

export const metadata: Metadata = {
  title: "Tus entradas",
  description: "Entradas de invitado TokePass.",
  robots: { index: false, follow: false },
}

export default async function GuestTicketPage({
  params,
}: {
  params: Promise<{ guestToken: string }>
}) {
  const { guestToken } = await params
  if (!isGuestOrderToken(guestToken)) notFound()

  const wallet = await getGuestOrderWallet(guestToken)
  if (!wallet) notFound()

  if (wallet.orderStatus !== "paid") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Estamos confirmando tu pago</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Cuando se acredite, esta misma pagina va a mostrar tus entradas y el QR
          de ingreso. No hace falta crear una cuenta.
        </p>
      </div>
    )
  }

  if (wallet.tickets.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-black">No encontramos entradas</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          El pago esta confirmado, pero todavia no hay tickets asociados.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-10">
      <header className="space-y-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Acceso de invitado
        </p>
        <h1 className="text-2xl font-black">Tus entradas</h1>
        <p className="text-sm text-muted-foreground">
          Guardá este enlace. No pedimos usuario ni contraseña.
        </p>
      </header>
      <GuestOrderWallet tickets={wallet.tickets} />
    </div>
  )
}
