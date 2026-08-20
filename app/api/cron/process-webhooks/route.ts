import { NextResponse, type NextRequest } from "next/server"

import { logger } from "@/lib/logger"
import { drainPendingWebhookEvents } from "@/lib/payments/mercadopago/process-enqueued"

export const runtime = "nodejs"
export const maxDuration = 60

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    logger.error({
      context: "api/cron/process-webhooks",
      message: "cron_secret_missing",
    })
    return false
  }

  const auth = request.headers.get("authorization")
  if (auth === `Bearer ${secret}`) return true

  const headerSecret = request.headers.get("x-cron-secret")
  return headerSecret === secret
}

export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 })
  }

  try {
    const result = await drainPendingWebhookEvents(15)
    logger.info({
      context: "api/cron/process-webhooks",
      message: "drain_ok",
      ...result,
    })
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    logger.error({
      context: "api/cron/process-webhooks",
      message: "drain_failed",
      error,
    })
    return NextResponse.json(
      { success: false, error: "cron_error" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
