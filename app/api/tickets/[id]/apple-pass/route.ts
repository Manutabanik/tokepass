import { NextResponse, type NextRequest } from "next/server"

import { isAppleWalletConfigured } from "@/lib/wallet-cache"

export const runtime = "nodejs"

/**
 * Apple Wallet (.pkpass) — solo si hay issuer/certs configurados.
 * Sin config: 501 honesto (sin redirect engañoso a PDF).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const publicFlag = process.env.NEXT_PUBLIC_APPLE_WALLET_ENABLED === "true"
  const enabled = publicFlag && isAppleWalletConfigured()

  if (!enabled) {
    return NextResponse.json(
      {
        error: "apple_wallet_not_configured",
        message:
          "Apple Wallet no está configurado. Usá la billetera PWA o el PDF imprimible.",
        fallback: `/tickets/${id}/print`,
      },
      { status: 501 },
    )
  }

  return NextResponse.json(
    {
      error: "apple_wallet_not_implemented",
      message: "Passkit aún no está cableado en este entorno.",
      fallback: `/tickets/${id}/print`,
    },
    { status: 501 },
  )
}
