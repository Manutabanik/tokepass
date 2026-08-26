import { NextResponse, type NextRequest } from "next/server"

import {
  EXPIRE_HOLD_BATCH_SIZE,
  GA_CHECKOUT_HOLD_INTERVAL,
} from "@/lib/checkout-hold"
import { logger } from "@/lib/logger"
import { reconcileOrphanPaymentHolds } from "@/lib/payments/reconcile-orphans"
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
 * Libera stock de checkouts abandonados (barrido).
 * Lotes de 500 + SKIP LOCKED, un RPC a la vez, para no pelear
 * locks con reserve_unified_cart_tx.
 */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const batch = { p_batch_size: EXPIRE_HOLD_BATCH_SIZE }

    const reconciled = await reconcileOrphanPaymentHolds()

    const abandoned = await admin.rpc("expire_abandoned_orders", {
      p_older_than: GA_CHECKOUT_HOLD_INTERVAL,
      ...batch,
    })
    if (abandoned.error) {
      throw new Error(abandoned.error.message)
    }

    const seating = await admin.rpc("expire_seating_orders", batch)
    if (seating.error) {
      throw new Error(seating.error.message)
    }

    const cartHolds = await admin.rpc("expire_seating_cart_holds", batch)
    if (cartHolds.error) {
      throw new Error(cartHolds.error.message)
    }

    const gaHolds = await admin.rpc("expire_ga_cart_holds", batch)
    if (gaHolds.error) {
      throw new Error(gaHolds.error.message)
    }

    const seatHolds = await admin.rpc("expire_seat_holds", batch)
    if (
      seatHolds.error &&
      !/could not find|schema cache|does not exist|pgrst202/i.test(
        seatHolds.error.message,
      )
    ) {
      throw new Error(seatHolds.error.message)
    }

    const resaleHolds = await admin.rpc("expire_resale_listing_reservations", batch)
    if (resaleHolds.error) {
      throw new Error(resaleHolds.error.message)
    }

    const transfers = await admin.rpc("expire_pending_ticket_transfers", batch)
    if (transfers.error) {
      throw new Error(transfers.error.message)
    }

    const data = {
      expiredCount: Number(abandoned.data ?? 0),
      expiredSeatingCount: Number(seating.data ?? 0),
      expiredCartHoldCount: Number(cartHolds.data ?? 0),
      expiredGaHoldCount: Number(gaHolds.data ?? 0),
      expiredSeatHoldCount: Number(seatHolds.data ?? 0),
      expiredResaleHoldCount: Number(resaleHolds.data ?? 0),
      expiredTransferHoldCount: Number(transfers.data ?? 0),
      reconciled,
      holdInterval: GA_CHECKOUT_HOLD_INTERVAL,
      batchSize: EXPIRE_HOLD_BATCH_SIZE,
    }

    logger.info({
      context: "api/cron/expire-orders",
      message: "expire_abandoned_orders_ok",
      ...data,
    })

    return NextResponse.json({ success: true, data })
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
