import {
  InvalidWebhookSignatureError,
  Payment,
  WebhookSignatureValidator,
} from "mercadopago"
import { NextResponse, type NextRequest } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getMercadoPagoClient } from "@/lib/mercadopago"
import { notifyGobiOrderPaid } from "@/lib/services/notify-gobi-order-paid"

export const runtime = "nodejs"

function firstString(value: string | string[] | null | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  )
}

async function extractPaymentId(request: NextRequest): Promise<string | null> {
  const url = new URL(request.url)
  const queryDataId = url.searchParams.get("data.id")
  const queryId = url.searchParams.get("id")
  const topic = url.searchParams.get("topic") ?? url.searchParams.get("type")

  if (queryDataId) return queryDataId
  if (topic === "payment" && queryId) return queryId

  try {
    const body = (await request.json()) as {
      data?: { id?: string | number }
      id?: string | number
      type?: string
      action?: string
    }

    if (body?.data?.id != null) return String(body.data.id)
    if (body?.type === "payment" && body?.id != null) return String(body.id)
  } catch {
    // Body vacío o no JSON
  }

  return null
}

export async function POST(request: NextRequest) {
  try {
    const paymentId = await extractPaymentId(request)

    if (!paymentId) {
      return NextResponse.json(
        { success: true, data: { ignored: true } },
        { status: 200 },
      )
    }

    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim()
    if (!secret) {
      console.error("[mp webhook] MERCADOPAGO_WEBHOOK_SECRET ausente")
      if (isProductionRuntime()) {
        return NextResponse.json(
          { success: false, error: "webhook_misconfigured" },
          { status: 500 },
        )
      }
    } else {
      try {
        WebhookSignatureValidator.validate({
          xSignature: request.headers.get("x-signature"),
          xRequestId: request.headers.get("x-request-id"),
          dataId: paymentId,
          secret,
          toleranceSeconds: 300,
        })
      } catch (error) {
        if (error instanceof InvalidWebhookSignatureError) {
          console.error("[mp webhook] firma inválida", error.reason)
          return NextResponse.json(
            { success: false, error: "invalid_signature" },
            { status: 401 },
          )
        }
        throw error
      }
    }

    const client = getMercadoPagoClient()
    const paymentClient = new Payment(client)
    const payment = await paymentClient.get({ id: paymentId })

    const orderId = firstString(payment.external_reference)
    if (!orderId) {
      return NextResponse.json(
        {
          success: true,
          data: { ignored: true, reason: "missing_external_reference" },
        },
        { status: 200 },
      )
    }

    const admin = createAdminClient()
    const mpPaymentId = String(payment.id ?? paymentId)
    const status = payment.status

    // Idempotencia estricta: payment_id ya procesado → ACK sin side-effects.
    const { data: priorEvent } = await admin
      .from("mp_webhook_events")
      .select("payment_id, status")
      .eq("payment_id", mpPaymentId)
      .maybeSingle()

    if (priorEvent) {
      return NextResponse.json(
        { success: true, data: { idempotent: true, status: priorEvent.status } },
        { status: 200 },
      )
    }

    const { data: order } = await admin
      .from("orders")
      .select("id, status, total_amount, mp_payment_id")
      .eq("id", orderId)
      .maybeSingle()

    if (!order) {
      return NextResponse.json(
        { success: false, error: "order_not_found" },
        { status: 404 },
      )
    }

    // Defensa en profundidad: monto MP vs orden.
    if (
      status === "approved" &&
      payment.transaction_amount != null &&
      order.total_amount != null
    ) {
      const paid = Number(payment.transaction_amount)
      const expected = Number(order.total_amount)
      if (
        Number.isFinite(paid) &&
        Number.isFinite(expected) &&
        Math.abs(paid - expected) > 1
      ) {
        console.error("[mp webhook] amount mismatch", {
          orderId,
          paid,
          expected,
          paymentId: mpPaymentId,
        })
        return NextResponse.json(
          { success: false, error: "amount_mismatch" },
          { status: 409 },
        )
      }
    }

    if (status === "approved") {
      const alreadyPaid =
        order.status === "paid" && order.mp_payment_id === mpPaymentId

      if (!alreadyPaid) {
        const { error } = await admin
          .from("orders")
          .update({
            status: "paid",
            mp_payment_id: mpPaymentId,
          })
          .eq("id", orderId)
          .in("status", ["pending", "paid"])

        if (error) {
          console.error("[mp webhook] update order failed", error.message)
          return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 },
          )
        }

        await admin
          .from("tickets")
          .update({ status: "valid" })
          .eq("order_id", orderId)
          .neq("status", "used")
          .neq("status", "scanned")
          .neq("status", "revoked")
          .neq("status", "cancelled")
          .neq("status", "transferred")

        const { error: activateError } = await admin.rpc(
          "activate_order_item_redemptions",
          { p_order_id: orderId },
        )
        if (activateError) {
          console.error(
            "[mp webhook] activate item redemptions failed",
            activateError.message,
          )
        }
      }

      await admin.from("mp_webhook_events").upsert(
        {
          payment_id: mpPaymentId,
          order_id: orderId,
          status: "approved",
          raw_summary: {
            transaction_amount: payment.transaction_amount ?? null,
          },
        },
        { onConflict: "payment_id" },
      )

      // Gobi solo en la primera transición a paid (no en reintentos MP).
      if (!alreadyPaid && order.status !== "paid") {
        try {
          await notifyGobiOrderPaid(admin, orderId)
        } catch (gobiErr) {
          console.error(
            "[mp webhook] Gobi order.paid dispatch failed",
            gobiErr instanceof Error ? gobiErr.message : gobiErr,
          )
        }
      }

      return NextResponse.json({ success: true }, { status: 200 })
    }

    if (
      status === "rejected" ||
      status === "cancelled" ||
      status === "refunded" ||
      status === "charged_back"
    ) {
      if (order.status === "pending") {
        await admin
          .from("orders")
          .update({
            status: "failed",
            mp_payment_id: mpPaymentId,
          })
          .eq("id", orderId)
          .eq("status", "pending")

        const { error: releaseItemsError } = await admin.rpc(
          "release_order_event_items",
          { p_order_id: orderId },
        )
        if (releaseItemsError) {
          console.error(
            "[mp webhook] release item redemptions failed",
            releaseItemsError.message,
          )
        }

        const { data: reserved } = await admin
          .from("tickets")
          .select("id")
          .eq("order_id", orderId)
          .eq("status", "valid")

        const ticketIds = (reserved ?? []).map((row) => row.id)
        if (ticketIds.length > 0) {
          const { error: releaseTicketsError } = await admin.rpc(
            "release_reserved_tickets",
            { p_ticket_ids: ticketIds },
          )
          if (releaseTicketsError) {
            console.error(
              "[mp webhook] release reserved tickets failed",
              releaseTicketsError.message,
            )
          }
        }
      }

      if (
        (status === "refunded" || status === "charged_back") &&
        order.status === "paid"
      ) {
        await admin
          .from("orders")
          .update({ status: "failed", mp_payment_id: mpPaymentId })
          .eq("id", orderId)

        await admin
          .from("tickets")
          .update({ status: "cancelled" })
          .eq("order_id", orderId)
          .eq("status", "valid")
      }

      await admin.from("mp_webhook_events").upsert(
        {
          payment_id: mpPaymentId,
          order_id: orderId,
          status: String(status),
          raw_summary: null,
        },
        { onConflict: "payment_id" },
      )

      return NextResponse.json({ success: true }, { status: 200 })
    }

    return NextResponse.json(
      { success: true, data: { status } },
      { status: 200 },
    )
  } catch (error) {
    console.error("[mp webhook] unexpected", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "webhook_error",
      },
      { status: 200 },
    )
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
