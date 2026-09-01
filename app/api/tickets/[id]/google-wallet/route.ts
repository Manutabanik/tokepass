import { NextResponse, type NextRequest } from "next/server"

import { getMyTicketById } from "@/app/actions/buyer-orders"
import { isWalletDeviceMismatchError } from "@/lib/auth/wallet-device"
import { HAS_GOOGLE_WALLET_KEYS } from "@/lib/wallet-cache"
import { buildGoogleWalletSaveUrl } from "@/lib/wallet/google-wallet"
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

  if (!HAS_GOOGLE_WALLET_KEYS()) {
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
        "Esta entrada ya no se puede guardar en Google Wallet.",
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

    const saveUrl = await buildGoogleWalletSaveUrl(ticket)
    const wantsJson = request.headers.get("accept")?.includes("application/json")
    if (wantsJson) {
      return NextResponse.json({ url: saveUrl }, { headers: { "Cache-Control": "no-store" } })
    }
    return NextResponse.redirect(saveUrl, 302)
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
      return jsonError(401, "auth_required", "Iniciá sesión para guardar el pase.", id)
    }
    if (isWalletDeviceMismatchError(error)) {
      return jsonError(
        403,
        "wallet_device_mismatch",
        "Sesión iniciada en otro dispositivo",
        id,
      )
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
