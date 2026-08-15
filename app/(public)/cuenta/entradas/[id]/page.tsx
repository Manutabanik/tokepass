import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { getMyTicketById } from "@/app/actions/buyer-orders"
import {
  currentUserIsAnonymous,
  getGuestTicketForAccess,
  isGuestOtpVerified,
} from "@/app/actions/guest-ticket-access"
import { listEventSponsors } from "@/app/actions/event-sponsors"
import { TicketDetailView } from "@/components/account/ticket-detail-view"
import { createClient } from "@/lib/supabase/server"
import { getWalletUiFlags } from "@/lib/wallet-cache"

export const metadata: Metadata = {
  title: "Detalle de la entrada",
  description: "Living QR y acciones de tu entrada Tokepass.",
}

export default async function CuentaEntradaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let ticket: Awaited<ReturnType<typeof getMyTicketById>> = null
  let guestFallback = false

  if (user) {
    try {
      ticket = await getMyTicketById(id)
    } catch (error) {
      if (!(error instanceof Error && error.message === "auth_required")) {
        throw error
      }
    }
    if (!ticket) {
      ticket = await getGuestTicketForAccess(id)
      guestFallback = Boolean(ticket)
    }
  } else {
    ticket = await getGuestTicketForAccess(id)
    guestFallback = Boolean(ticket)
    if (!ticket) {
      redirect(`/login?next=/cuenta/entradas/${id}`)
    }
  }

  if (!ticket) notFound()

  const walletFlags = getWalletUiFlags()
  const sponsors = await listEventSponsors(ticket.eventId)
  const anonymous = guestFallback || (await currentUserIsAnonymous())
  const otpOk = ticket.orderId
    ? await isGuestOtpVerified(ticket.orderId)
    : true

  return (
    <TicketDetailView
      ticket={ticket}
      userId={user?.id ?? "guest"}
      appleWalletEnabled={walletFlags.appleWalletEnabled}
      googleWalletEnabled={walletFlags.googleWalletEnabled}
      sponsors={sponsors}
      requireGuestOtp={anonymous && !otpOk}
    />
  )
}
