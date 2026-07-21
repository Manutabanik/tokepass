import { NextResponse, type NextRequest } from "next/server"

import { getPrintableTicket } from "@/app/actions/pos"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

/**
 * Apple Wallet (.pkpass).
 * Hasta cablear passkit-generator + certs → PDF imprimible (redundancia offline).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(
      new URL(`/login?next=/tickets/${id}/print`, request.url),
    )
  }

  const ticket = await getPrintableTicket(id)
  if (!ticket) {
    return NextResponse.json({ error: "ticket_not_found" }, { status: 404 })
  }

  return NextResponse.redirect(
    new URL(`/tickets/${id}/print?from=apple-wallet`, request.url),
  )
}
