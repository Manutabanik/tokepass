import { NextResponse } from "next/server"

import { handlePaymentProviderWebhook } from "@/lib/payments/core/handle-webhook"
import { isPaymentsProductionRuntime } from "@/lib/payments/production-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: Request) {
  if (isPaymentsProductionRuntime()) {
    return NextResponse.json(
      { error: "Naranja X no esta habilitado en produccion." },
      { status: 503 },
    )
  }
  return handlePaymentProviderWebhook("naranjax", request)
}
