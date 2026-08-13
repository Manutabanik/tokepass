import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { getMyTicketById } from "@/app/actions/buyer-orders"
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

  if (!user) {
    redirect(`/login?next=/cuenta/entradas/${id}`)
  }

  let ticket: Awaited<ReturnType<typeof getMyTicketById>> = null
  try {
    ticket = await getMyTicketById(id)
  } catch (error) {
    if (error instanceof Error && error.message === "auth_required") {
      redirect(`/login?next=/cuenta/entradas/${id}`)
    }
    throw error
  }

  if (!ticket) notFound()

  const walletFlags = getWalletUiFlags()

  return (
    <TicketDetailView
      ticket={ticket}
      userId={user.id}
      appleWalletEnabled={walletFlags.appleWalletEnabled}
      googleWalletEnabled={walletFlags.googleWalletEnabled}
    />
  )
}
