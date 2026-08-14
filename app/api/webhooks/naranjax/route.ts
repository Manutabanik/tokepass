import { handlePaymentProviderWebhook } from "@/lib/payments/core/handle-webhook"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: Request) {
  return handlePaymentProviderWebhook("naranjax", request)
}
