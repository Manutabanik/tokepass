import { NextResponse, type NextRequest } from "next/server"

import { isGoogleWalletConfigured } from "@/lib/wallet-cache"

export const runtime = "nodejs"

/**
 * Google Wallet — solo si hay issuer configurado.
 * Sin config: 501 honesto (sin redirect engañoso a PDF).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const publicFlag = process.env.NEXT_PUBLIC_GOOGLE_WALLET_ENABLED === "true"
  const enabled = publicFlag && isGoogleWalletConfigured()

  if (!enabled) {
    return NextResponse.json(
      {
        error: "google_wallet_not_configured",
        message:
          "Google Wallet no está configurado. Usá la billetera PWA o el PDF imprimible.",
        fallback: `/tickets/${id}/print`,
      },
      { status: 501 },
    )
  }

  return NextResponse.json(
    {
      error: "google_wallet_not_implemented",
      message: "Google Wallet Issuer aún no está cableado en este entorno.",
      fallback: `/tickets/${id}/print`,
    },
    { status: 501 },
  )
}
