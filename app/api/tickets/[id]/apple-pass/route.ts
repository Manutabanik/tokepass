import { NextResponse, type NextRequest } from "next/server"

import { getMyTicketById } from "@/app/actions/buyer-orders"
import { isAppleWalletConfigured } from "@/lib/wallet-cache"
import { buildApplePkpass } from "@/lib/wallet/apple-pkpass"

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
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  if (!isAppleWalletConfigured()) {
    return jsonError(
      501,
      "apple_wallet_not_configured",
      "Apple Wallet no está configurado. Usá la billetera PWA o el PDF imprimible.",
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
        "Esta entrada ya no se puede agregar a Apple Wallet.",
        id,
      )
    }

    const pkpass = await buildApplePkpass(ticket)
    const filename = `tokepass-${ticket.id.slice(0, 8)}.pkpass`

    return new NextResponse(new Uint8Array(pkpass), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === "auth_required") {
      return jsonError(401, "auth_required", "Iniciá sesión para descargar el pase.", id)
    }
    console.error("[apple-pass]", error)
    return jsonError(
      500,
      "apple_wallet_failed",
      "No se pudo generar el pase de Apple Wallet.",
      id,
    )
  }
}
