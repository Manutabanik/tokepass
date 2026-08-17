import { redirect } from "next/navigation"

import { isEventUuid } from "@/lib/seo/site"

export default async function ValidaTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>
}) {
  const { ticketId } = await params
  if (!isEventUuid(ticketId)) {
    redirect("/cuenta/entradas")
  }
  redirect(`/cuenta/entradas/${ticketId}`)
}
