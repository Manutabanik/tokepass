import { NextResponse, type NextRequest } from "next/server"

import { GA_CHECKOUT_HOLD_INTERVAL } from "@/lib/checkout-hold"
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
 * Libera stock de checkouts abandonados (barrido). El self-heal en
 * get_event_seating_* / get_event_tier_live_stock / assert_cascade_stock_available
 * ya libera holds expirados al consultar disponibilidad.
 * - GA / pending: TTL = GA_CHECKOUT_HOLD_INTERVAL, batch 2500 en RPC.
 * - Seating: reserved_until vía expire_seating_orders.
 * - Cart holds (sin orden): expire_seating_cart_holds.
 * - GA cart holds: expire_ga_cart_holds.
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
      { data: cartHoldData, error: cartHoldError },
      { data: gaHoldData, error: gaHoldError },
    ] = await Promise.all([
      admin.rpc("expire_abandoned_orders", {
        p_older_than: GA_CHECKOUT_HOLD_INTERVAL,
      }),
      admin.rpc("expire_seating_orders"),
      admin.rpc("expire_seating_cart_holds"),
      admin.rpc("expire_ga_cart_holds"),
    ])

    if (error || seatingError || cartHoldError || gaHoldError) {
      logger.error({
        context: "api/cron/expire-orders",
        message: "expire_abandoned_orders_failed",
        error:
          error?.message ??
          seatingError?.message ??
          cartHoldError?.message ??
          gaHoldError?.message,
      })
      return NextResponse.json(
        {
          success: false,
          error:
            error?.message ??
            seatingError?.message ??
            cartHoldError?.message ??
            gaHoldError?.message,
        },
        { status: 500 },
      )
    }

    logger.info({
      context: "api/cron/expire-orders",
      message: "expire_abandoned_orders_ok",
      expiredCount: Number(data ?? 0),
      expiredSeatingCount: Number(seatingData ?? 0),
      expiredCartHoldCount: Number(cartHoldData ?? 0),
      expiredGaHoldCount: Number(gaHoldData ?? 0),
      holdInterval: GA_CHECKOUT_HOLD_INTERVAL,
    })

    return NextResponse.json({
      success: true,
      data: {
        expiredCount: Number(data ?? 0),
        expiredSeatingCount: Number(seatingData ?? 0),
        expiredCartHoldCount: Number(cartHoldData ?? 0),
        expiredGaHoldCount: Number(gaHoldData ?? 0),
        holdInterval: GA_CHECKOUT_HOLD_INTERVAL,
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
        error: "cron_error",
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
