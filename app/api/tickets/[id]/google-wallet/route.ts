import { NextResponse, type NextRequest } from "next/server"

import { getMyTicketById } from "@/app/actions/buyer-orders"
import { isGoogleWalletConfigured } from "@/lib/wallet-cache"
import { buildGoogleWalletSaveUrl } from "@/lib/wallet/google-wallet"

export const runtime = "nodejs"

function jsonError(status: number, error: string, message: string, id: string) {
  return NextResponse.json(
    {
      error,
      message,
      fallback: `/tickets/${id}/print`,
    },
    { status },
  )
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  if (!isGoogleWalletConfigured()) {
    return jsonError(
      501,
      "google_wallet_not_configured",
      "Google Wallet no está configurado. Usá la billetera PWA o el PDF imprimible.",
      id,
    )
  }

  try {
    const ticket = await getMyTicketById(id)
    if (!ticket) {
      return jsonError(404, "ticket_not_found", "No encontramos esa entrada.", id)
    }
    if (ticket.status !== "valid") {
      return jsonError(
        409,
        "ticket_not_valid",
        "Esta entrada ya no se puede guardar en Google Wallet.",
        id,
      )
    }

    const saveUrl = await buildGoogleWalletSaveUrl(ticket)
    const wantsJson = request.headers.get("accept")?.includes("application/json")
    if (wantsJson) {
      return NextResponse.json({ url: saveUrl }, { headers: { "Cache-Control": "no-store" } })
    }
    return NextResponse.redirect(saveUrl, 302)
  } catch (error) {
    if (error instanceof Error && error.message === "auth_required") {
      return jsonError(401, "auth_required", "Iniciá sesión para guardar el pase.", id)
    }
    console.error("[google-wallet]", error)
    return jsonError(
      500,
      "google_wallet_failed",
      "No se pudo generar el pase de Google Wallet.",
      id,
    )
  }
}
