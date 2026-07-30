import { NextResponse, type NextRequest } from "next/server"

import { logger } from "@/lib/logger"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    logger.error({
      context: "api/cron/expire-orders",
      message: "cron_secret_missing",
    })
    return false
  }

  const auth = request.headers.get("authorization")
  if (auth === `Bearer ${secret}`) return true

  const headerSecret = request.headers.get("x-cron-secret")
  return headerSecret === secret
}

/**
 * Cancels pending checkout orders older than 30 minutes and restores stock.
 * Secure with CRON_SECRET (Vercel Cron sends Authorization: Bearer …).
 */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const [
      { data, error },
      { data: seatingData, error: seatingError },
    ] = await Promise.all([
      admin.rpc("expire_abandoned_orders", {
        p_older_than: "30 minutes",
      }),
      admin.rpc("expire_seating_orders"),
    ])

    if (error || seatingError) {
      logger.error({
        context: "api/cron/expire-orders",
        message: "expire_abandoned_orders_failed",
        error: error?.message ?? seatingError?.message,
      })
      return NextResponse.json(
        {
          success: false,
          error: error?.message ?? seatingError?.message,
        },
        { status: 500 },
      )
    }

    logger.info({
      context: "api/cron/expire-orders",
      message: "expire_abandoned_orders_ok",
      expiredCount: Number(data ?? 0),
      expiredSeatingCount: Number(seatingData ?? 0),
    })

    return NextResponse.json({
      success: true,
      data: {
        expiredCount: Number(data ?? 0),
        expiredSeatingCount: Number(seatingData ?? 0),
      },
    })
  } catch (error) {
    logger.error({
      context: "api/cron/expire-orders",
      message: "unexpected_cron_error",
      error,
    })
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "cron_error",
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
