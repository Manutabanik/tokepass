import { NextResponse, type NextRequest } from "next/server"

import { getMyTicketById } from "@/app/actions/buyer-orders"
import { HAS_APPLE_WALLET_KEYS } from "@/lib/wallet-cache"
import { buildApplePkpass } from "@/lib/wallet/apple-pkpass"
import {
  DIGITAL_TICKET_STATIC_EXPORT_MESSAGE,
  DigitalTicketStaticExportError,
  ticketAllowsStaticAdmissionExport,
} from "@/lib/tickets/static-tps-policy"

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

  if (!HAS_APPLE_WALLET_KEYS()) {
    return NextResponse.redirect(new URL(`/tickets/${id}/print`, request.url), 302)
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
    if (!ticketAllowsStaticAdmissionExport(ticket)) {
      return NextResponse.json(
        {
          error: "digital_ticket_static_export_forbidden",
          message: DIGITAL_TICKET_STATIC_EXPORT_MESSAGE,
          fallback: "/cuenta/entradas",
        },
        { status: 403 },
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
    if (error instanceof DigitalTicketStaticExportError) {
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
          fallback: "/cuenta/entradas",
        },
        { status: 403 },
      )
    }
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
