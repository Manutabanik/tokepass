import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getGuestTicketForAccess } from "@/app/actions/guest-ticket-access"
import { TicketRecoveryCard } from "@/components/account/ticket-recovery-card"
import { isEventUuid } from "@/lib/seo/site"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Acceso de respaldo",
  description: "Recuperá el código de respaldo de tu entrada TokePass.",
  robots: { index: false, follow: false },
}

/**
 * Destino del link que va en el mail de confirmación (`ticketValidationUrl`).
 *
 * Con sesión o acceso de invitado manda a la entrada completa. Si no hay
 * ninguna de las dos, antes caía en el muro de login, que en la puerta y con
 * mala señal es un callejón sin salida; ahora muestra el código de respaldo
 * para que el staff pueda validar el ingreso a mano.
 */
export default async function ValidaTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>
}) {
  const { ticketId } = await params
  if (!isEventUuid(ticketId)) {
    redirect("/cuenta/entradas")
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect(`/cuenta/entradas/${ticketId}`)
  }

  let guestTicket: Awaited<ReturnType<typeof getGuestTicketForAccess>> = null
  try {
    guestTicket = await getGuestTicketForAccess(ticketId)
  } catch {
    guestTicket = null
  }

  if (guestTicket) {
    redirect(`/cuenta/entradas/${ticketId}`)
  }

  return <TicketRecoveryCard ticketId={ticketId} />
}
