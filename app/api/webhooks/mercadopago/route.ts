import {
  InvalidWebhookSignatureError,
  Payment,
  PaymentRefund,
  WebhookSignatureValidator,
} from "mercadopago"
import { createClient } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

import { getBoostPlan, parseBoostExternalRef } from "@/lib/boost-plans"
import { parsePaymentExternalReference } from "@/lib/checkout-buyer"
import { logger } from "@/lib/logger"
import { moneyAmountsEqual } from "@/lib/money/cents"
import { captureCriticalException } from "@/lib/sentry/capture"
import { getMercadoPagoClient, getMercadoPagoWebhookSecret } from "@/lib/mercadopago"
import { processPaidOrderNotification } from "@/lib/payments/core/confirm-order"
import { PaymentGatewayFactory } from "@/lib/payments/core/factory"
import { webhookRetry } from "@/lib/payments/core/handle-webhook"
import { parseResaleExternalRef } from "@/lib/resale"
import { notifyGobiOrderPaid } from "@/lib/services/notify-gobi-order-paid"
import { sendPaidOrderReceiptEmail } from "@/lib/email/resend"
import type { Database, Json } from "@/types/database"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Service-role Supabase client for webhooks (bypasses RLS).
 * Do NOT use the anon/session client — ticket/order writes would be blocked.
 */
function createWebhookAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.",
    )
  }
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

type AdminClient = ReturnType<typeof createWebhookAdminClient>

function firstString(value: string | string[] | null | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function webhookOk(data?: Record<string, unknown>) {
  return NextResponse.json({ received: true, ...(data ?? {}) }, { status: 200 })
}

async function extractPaymentId(request: NextRequest): Promise<string | null> {
  const url = new URL(request.url)
  const queryDataId = url.searchParams.get("data.id")
  const queryId = url.searchParams.get("id")
  const topic = url.searchParams.get("topic") ?? url.searchParams.get("type")

  if (queryDataId) return queryDataId
  if ((topic === "payment" || topic?.startsWith("payment.")) && queryId) {
    return queryId
  }

  try {
    const raw = await request.text()
    if (!raw.trim()) return queryId
    const body = JSON.parse(raw) as {
      data?: { id?: string | number }
      id?: string | number
      type?: string
      action?: string
      topic?: string
    }

    if (body?.data?.id != null) return String(body.data.id)
    const kind = body?.type ?? body?.action ?? body?.topic ?? topic
    if (
      (kind === "payment" ||
        kind === "payment.created" ||
        kind === "payment.updated" ||
        String(kind ?? "").startsWith("payment.")) &&
      (body?.id != null || queryId)
    ) {
      return body?.id != null ? String(body.id) : queryId
    }
    if (body?.id != null) return String(body.id)
  } catch (error) {
    console.error("[WEBHOOK ERROR] payload parse failed:", error)
  }

  return queryId
}

/** Idempotency key: (payment_id, status) — allows approved → refunded transitions. */
async function alreadyProcessed(
  admin: AdminClient,
  paymentId: string,
  ledgerStatus: string,
): Promise<boolean> {
  const { data } = await admin
    .from("mp_webhook_events")
    .select("payment_id")
    .eq("payment_id", paymentId)
    .eq("status", ledgerStatus)
    .maybeSingle()

  return Boolean(data)
}

async function recordWebhookEvent(
  admin: AdminClient,
  input: {
    paymentId: string
    orderId: string | null
    status: string
    rawSummary?: Json | null
  },
) {
  await admin.from("mp_webhook_events").upsert(
    {
      payment_id: input.paymentId,
      order_id: input.orderId,
      status: input.status,
      raw_summary: input.rawSummary ?? null,
    },
    { onConflict: "payment_id,status" },
  )
}

async function activateBoostFromPayment(
  admin: AdminClient,
  input: {
    subscriptionId: string
    mpPaymentId: string
    status: string | undefined
    transactionAmount: number | null | undefined
  },
) {
  const { data: boost, error } = await admin
    .from("boost_subscriptions")
    .select("id, event_id, tier, duration_days, payment_status, amount_paid")
    .eq("id", input.subscriptionId)
    .maybeSingle()

  if (error || !boost) {
    return { ok: false as const, error: "boost_not_found" }
  }

  if (input.status === "approved") {
    const ledgerStatus = "boost_approved"
    if (await alreadyProcessed(admin, input.mpPaymentId, ledgerStatus)) {
      return { ok: true as const, idempotent: true }
    }

    const plan = getBoostPlan(String(boost.tier))
    const officialPrice = plan?.priceArs ?? null
    const paidAmount = Number(input.transactionAmount)
    const recordedAmount = Number(boost.amount_paid)
    const alreadyPaid = boost.payment_status === "paid"

    if (!alreadyPaid) {
      if (
        officialPrice == null ||
        !Number.isFinite(paidAmount) ||
        paidAmount + 1 < officialPrice
      ) {
        logger.error({
          context: "webhooks/mercadopago",
          message: "boost_underpayment",
          event_id: boost.event_id,
          payment_id: input.mpPaymentId,
          boostId: boost.id,
          tier: boost.tier,
          paid: input.transactionAmount,
          officialPrice,
          recordedAmount: boost.amount_paid,
        })
        return { ok: false as const, error: "amount_mismatch" }
      }

      if (
        Number.isFinite(recordedAmount) &&
        Math.abs(paidAmount - recordedAmount) > 1
      ) {
        logger.error({
          context: "webhooks/mercadopago",
          message: "boost_amount_mismatch",
          event_id: boost.event_id,
          payment_id: input.mpPaymentId,
          boostId: boost.id,
          paid: input.transactionAmount,
          expected: boost.amount_paid,
        })
        return { ok: false as const, error: "amount_mismatch" }
      }
    }

    const featuredUntil = new Date()
    featuredUntil.setDate(featuredUntil.getDate() + Number(boost.duration_days))

    // Atomic activate + repair if already paid without featured window.
    const { data: activateResult, error: activateError } = await admin.rpc(
      "activate_paid_boost",
      {
        p_subscription_id: boost.id,
        p_payment_id: input.mpPaymentId,
        p_featured_until: featuredUntil.toISOString(),
      },
    )

    if (activateError) {
      return { ok: false as const, error: activateError.message }
    }

    const result = (activateResult ?? {}) as {
      ok?: boolean
      error?: string
      activated?: boolean
      repaired?: boolean
    }

    if (!result.ok) {
      return {
        ok: false as const,
        error: result.error ?? "boost_activate_failed",
      }
    }

    await recordWebhookEvent(admin, {
      paymentId: input.mpPaymentId,
      orderId: null,
      status: ledgerStatus,
      rawSummary: {
        boost_subscription_id: boost.id,
        event_id: boost.event_id,
        tier: boost.tier,
        activated: result.activated ?? false,
        repaired: result.repaired ?? false,
      },
    })

    return {
      ok: true as const,
      idempotent: !result.activated,
    }
  }

  if (
    input.status === "rejected" ||
    input.status === "cancelled" ||
    input.status === "refunded" ||
    input.status === "charged_back"
  ) {
    const ledgerStatus = `boost_${input.status}`
    if (await alreadyProcessed(admin, input.mpPaymentId, ledgerStatus)) {
      return { ok: true as const, idempotent: true }
    }

    await admin
      .from("boost_subscriptions")
      .update({
        payment_status:
          input.status === "refunded" || input.status === "charged_back"
            ? "refunded"
            : "failed",
        payment_id_mp: input.mpPaymentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", boost.id)

    if (input.status === "refunded" || input.status === "charged_back") {
      // Only clear featured if this subscription is the one currently driving it.
      const { data: event } = await admin
        .from("events")
        .select("id, is_featured, featured_tier, featured_until")
        .eq("id", boost.event_id)
        .maybeSingle()

      const featuredUntilMs = event?.featured_until
        ? new Date(event.featured_until).getTime()
        : 0
      const stillFeatured =
        Boolean(event?.is_featured) &&
        featuredUntilMs > Date.now() &&
        event?.featured_tier === boost.tier

      if (stillFeatured) {
        const { data: newerActive } = await admin
          .from("boost_subscriptions")
          .select("id")
          .eq("event_id", boost.event_id)
          .eq("payment_status", "paid")
          .neq("id", boost.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!newerActive) {
          await admin
            .from("events")
            .update({
              is_featured: false,
              featured_tier: null,
              featured_until: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", boost.event_id)
        }
      }
    }

    await recordWebhookEvent(admin, {
      paymentId: input.mpPaymentId,
      orderId: null,
      status: ledgerStatus,
      rawSummary: { boost_subscription_id: boost.id },
    })

    return { ok: true as const, idempotent: false }
  }

  return { ok: true as const, ignored: true }
}

async function activateResaleFromPayment(
  admin: AdminClient,
  input: {
    listingId: string
    mpPaymentId: string
    status: string | undefined
    transactionAmount: number | null | undefined
    currencyId: string | null
    metadataBuyerId: string | null
  },
) {
  const { data: listing, error } = await admin
    .from("ticket_resale_listings")
    .select(
      "id, price, status, seller_id, buyer_id, mp_payment_id, event_id",
    )
    .eq("id", input.listingId)
    .maybeSingle()

  if (error || !listing) {
    return { ok: false as const, error: "listing_not_found" }
  }

  if (input.status === "approved") {
    const ledgerStatus = "resale_approved"
    if (await alreadyProcessed(admin, input.mpPaymentId, ledgerStatus)) {
      return { ok: true as const, idempotent: true }
    }

    if (
      listing.status === "sold" &&
      listing.mp_payment_id === input.mpPaymentId
    ) {
      await recordWebhookEvent(admin, {
        paymentId: input.mpPaymentId,
        orderId: null,
        status: ledgerStatus,
        rawSummary: { listing_id: listing.id, idempotent: true },
      })
      return { ok: true as const, idempotent: true }
    }

    const paid = Number(input.transactionAmount)
    const expected = Number(listing.price)
    if (
      !moneyAmountsEqual(paid, expected) ||
      input.currencyId !== "ARS"
    ) {
      logger.error({
        context: "webhooks/mercadopago",
        message: "resale_amount_mismatch",
        listing_id: listing.id,
        payment_id: input.mpPaymentId,
        paid,
        expected,
        currency: input.currencyId,
      })
      return { ok: false as const, error: "amount_mismatch" }
    }

    const buyerId = listing.buyer_id || input.metadataBuyerId
    if (!buyerId) {
      return { ok: false as const, error: "buyer_missing" }
    }

    const { data: completeRaw, error: completeError } = await admin.rpc(
      "complete_ticket_resale_purchase",
      {
        p_listing_id: listing.id,
        p_buyer_user_id: buyerId,
        p_mp_payment_id: input.mpPaymentId,
      },
    )

    if (completeError) {
      return { ok: false as const, error: completeError.message }
    }

    const complete = (completeRaw ?? {}) as {
      ok?: boolean
      code?: string
      idempotent?: boolean
      message?: string
    }

    if (!complete.ok) {
      return {
        ok: false as const,
        error: complete.code ?? complete.message ?? "resale_complete_failed",
      }
    }

    await recordWebhookEvent(admin, {
      paymentId: input.mpPaymentId,
      orderId: null,
      status: ledgerStatus,
      rawSummary: {
        listing_id: listing.id,
        event_id: listing.event_id,
        buyer_id: buyerId,
        result: complete,
      },
    })

    return {
      ok: true as const,
      idempotent: Boolean(complete.idempotent),
    }
  }

  if (
    input.status === "rejected" ||
    input.status === "cancelled" ||
    input.status === "refunded" ||
    input.status === "charged_back"
  ) {
    const ledgerStatus = `resale_${input.status}`
    if (await alreadyProcessed(admin, input.mpPaymentId, ledgerStatus)) {
      return { ok: true as const, idempotent: true }
    }

    await recordWebhookEvent(admin, {
      paymentId: input.mpPaymentId,
      orderId: null,
      status: ledgerStatus,
      rawSummary: { listing_id: listing.id },
    })

    return { ok: true as const, idempotent: false }
  }

  return { ok: true as const, ignored: true }
}

type FinalizePaidResult = {
  ok?: boolean
  code?: string
  needs_refund?: boolean
  idempotent?: boolean
  tickets_activated?: number
  status?: string
  mp_payment_id?: string
}

async function refundExpiredPayment(mpPaymentId: string) {
  const client = getMercadoPagoClient()
  const refunds = new PaymentRefund(client)
  await refunds.total({ payment_id: mpPaymentId })
}

export async function POST(request: NextRequest) {
  const secret = getMercadoPagoWebhookSecret()
  if (!secret) {
    console.error("[WEBHOOK ERROR] webhook secret missing — fail closed")
    logger.error({
      context: "webhooks/mercadopago",
      message: "webhook_secret_missing",
    })
    return Response.json(
      { error: "Webhook secret not configured" },
      { status: 500 },
    )
  }

  try {
    const verified = await PaymentGatewayFactory.getAdapter(
      "mercadopago",
    ).verifyWebhook(request.clone())

    const isOrderUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        verified.orderId,
      )
    const isBoost = Boolean(parseBoostExternalRef(verified.orderId))
    const isResale = Boolean(parseResaleExternalRef(verified.orderId))

    if (
      verified.isValid &&
      verified.status === "approved" &&
      isOrderUuid &&
      !isBoost &&
      !isResale
    ) {
      const result = await processPaidOrderNotification({
        provider: "mercadopago",
        transactionId: verified.transactionId,
        orderId: verified.orderId,
        amount: verified.amount,
        rawPayload: verified.rawPayload,
      })

      if (result.needsRefund && verified.transactionId) {
        try {
          await refundExpiredPayment(verified.transactionId)
        } catch (refundError) {
          logger.error({
            context: "webhooks/mercadopago",
            message: "shared_confirm_refund_failed",
            order_id: verified.orderId,
            payment_id: verified.transactionId,
            error: refundError,
          })
          return webhookRetry({
            provider: "mercadopago",
            ...result,
            refund: "failed",
          })
        }
      }

      if (!result.ok && !result.needsRefund) {
        return webhookRetry({
          provider: "mercadopago",
          ...result,
        })
      }

      return webhookOk({
        provider: "mercadopago",
        ...result,
      })
    }

    return await processMercadoPagoWebhook(request, secret)
  } catch (error) {
    captureCriticalException(error, "webhooks/mercadopago")
    console.error("[WEBHOOK ERROR]", error)
    logger.error({
      context: "webhooks/mercadopago",
      message: "unexpected_webhook_error",
      error,
    })
    return NextResponse.json({ received: true }, { status: 200 })
  }
}

async function processMercadoPagoWebhook(
  request: NextRequest,
  secret: string,
) {
  try {
    const paymentId = await extractPaymentId(request)

    if (!paymentId) {
      return webhookOk({ ignored: true, reason: "missing_payment_id" })
    }

    try {
      WebhookSignatureValidator.validate({
        xSignature: request.headers.get("x-signature"),
        xRequestId: request.headers.get("x-request-id"),
        dataId: paymentId,
        secret,
        toleranceSeconds: 300,
      })
    } catch (error) {
      console.error("[WEBHOOK ERROR] signature validation:", error)
      logger.error({
        context: "webhooks/mercadopago",
        message: "invalid_signature",
        payment_id: paymentId,
        reason:
          error instanceof InvalidWebhookSignatureError
            ? error.reason
            : "signature_error",
      })
      // ACK anyway — never 401/502 to Mercado Pago.
      return webhookOk({ ignored: true, reason: "invalid_signature" })
    }

    let payment
    try {
      const client = getMercadoPagoClient()
      const paymentClient = new Payment(client)
      payment = await paymentClient.get({ id: paymentId })
    } catch (error) {
      captureCriticalException(error, "webhooks/mercadopago", {
        payment_id: paymentId,
      })
      console.error("[WEBHOOK ERROR] payment.get failed:", error)
      logger.error({
        context: "webhooks/mercadopago",
        message: "payment_fetch_failed",
        payment_id: paymentId,
        error,
      })
      return webhookOk({ handled: "payment_fetch_failed" })
    }

    const externalReference = firstString(payment.external_reference)
    if (!externalReference) {
      return webhookOk({ ignored: true, reason: "missing_external_reference" })
    }

    let admin: AdminClient
    try {
      admin = createWebhookAdminClient()
    } catch (error) {
      captureCriticalException(error, "webhooks/mercadopago")
      console.error("[WEBHOOK ERROR] admin client unavailable:", error)
      logger.error({
        context: "webhooks/mercadopago",
        message: "admin_client_unavailable",
        error,
      })
      return webhookOk({ handled: "admin_client_unavailable" })
    }

    const mpPaymentId = String(payment.id ?? paymentId)
    const status = payment.status

    const boostId = parseBoostExternalRef(externalReference)
    if (boostId) {
      const result = await activateBoostFromPayment(admin, {
        subscriptionId: boostId,
        mpPaymentId,
        status,
        transactionAmount: payment.transaction_amount,
      })
      if (!result.ok) {
        logger.error({
          context: "webhooks/mercadopago",
          message: "boost_activation_failed",
          payment_id: mpPaymentId,
          error: result.error,
        })
        return webhookOk({ handled: "boost_failed", error: result.error })
      }
      return webhookOk({ boost: true, data: result })
    }

    const resaleListingId = parseResaleExternalRef(externalReference)
    if (resaleListingId) {
      const result = await activateResaleFromPayment(admin, {
        listingId: resaleListingId,
        mpPaymentId,
        status,
        transactionAmount: payment.transaction_amount,
        currencyId: firstString(payment.currency_id),
        metadataBuyerId:
          typeof payment.metadata === "object" &&
          payment.metadata &&
          "buyer_id" in payment.metadata
            ? String(
                (payment.metadata as Record<string, unknown>).buyer_id ?? "",
              ) || null
            : null,
      })
      if (!result.ok) {
        logger.error({
          context: "webhooks/mercadopago",
          message: "resale_activation_failed",
          payment_id: mpPaymentId,
          listing_id: resaleListingId,
          error: result.error,
        })
        return webhookOk({ handled: "resale_failed", error: result.error })
      }
      return webhookOk({ resale: true, data: result })
    }

    const parsedRef = parsePaymentExternalReference(externalReference)
    const orderId =
      parsedRef.orderId ??
      (externalReference.match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      )
        ? externalReference
        : null)

    if (!orderId) {
      return webhookOk({
        ignored: true,
        reason: "unrecognized_external_reference",
      })
    }

    const { data: order } = await admin
      .from("orders")
      .select("id, status, total_amount, mp_payment_id")
      .eq("id", orderId)
      .maybeSingle()

    if (!order) {
      return webhookOk({ ignored: true, reason: "order_not_found" })
    }

    if (status === "approved") {
      const paid = Number(payment.transaction_amount)
      const expected = Number(order.total_amount)
      const currency = firstString(payment.currency_id)
      if (
        !moneyAmountsEqual(paid, expected) ||
        currency !== "ARS"
      ) {
        logger.error({
          context: "webhooks/mercadopago",
          message: "amount_mismatch",
          order_id: orderId,
          payment_id: mpPaymentId,
          paid,
          expected,
          currency,
        })

        if (
          await alreadyProcessed(
            admin,
            mpPaymentId,
            "approved_amount_mismatch_refunded",
          )
        ) {
          return NextResponse.json(
            {
              success: true,
              data: { idempotent: true, status: "amount_mismatch_refunded" },
            },
            { status: 200 },
          )
        }

        try {
          await refundExpiredPayment(mpPaymentId)
          const { error: cleanupError } = await admin.rpc(
            "expire_abandoned_order",
            { p_order_id: orderId },
          )
          if (cleanupError) {
            logger.error({
              context: "webhooks/mercadopago",
              message: "amount_mismatch_order_cleanup_failed",
              order_id: orderId,
              payment_id: mpPaymentId,
              error: cleanupError.message,
            })
          } else {
            const { error: statusError } = await admin
              .from("orders")
              .update({ status: "failed", mp_payment_id: mpPaymentId })
              .eq("id", orderId)
              .eq("status", "expired")
            if (statusError) {
              logger.error({
                context: "webhooks/mercadopago",
                message: "amount_mismatch_status_update_failed",
                order_id: orderId,
                payment_id: mpPaymentId,
                error: statusError.message,
              })
            }
          }
          await recordWebhookEvent(admin, {
            paymentId: mpPaymentId,
            orderId,
            status: "approved_amount_mismatch_refunded",
            rawSummary: { paid, expected, currency },
          })
          return NextResponse.json(
            {
              success: true,
              data: { refunded: true, status: "amount_mismatch" },
            },
            { status: 200 },
          )
        } catch (refundError) {
          logger.error({
            context: "webhooks/mercadopago",
            message: "amount_mismatch_refund_failed",
            order_id: orderId,
            payment_id: mpPaymentId,
            error: refundError,
          })
          return NextResponse.json(
            { success: false, error: "amount_mismatch_needs_refund" },
            { status: 200 },
          )
        }
      }
    }

    if (status === "approved") {
      if (await alreadyProcessed(admin, mpPaymentId, "approved")) {
        return NextResponse.json(
          { success: true, data: { idempotent: true, status: "approved" } },
          { status: 200 },
        )
      }

      if (await alreadyProcessed(admin, mpPaymentId, "approved_expired_refunded")) {
        return NextResponse.json(
          {
            success: true,
            data: { idempotent: true, status: "approved_expired_refunded" },
          },
          { status: 200 },
        )
      }

      if (await alreadyProcessed(admin, mpPaymentId, "approved_expired_needs_review")) {
        try {
          await refundExpiredPayment(mpPaymentId)
          await recordWebhookEvent(admin, {
            paymentId: mpPaymentId,
            orderId,
            status: "approved_expired_refunded",
            rawSummary: { repaired_from: "needs_review" },
          })
          return NextResponse.json(
            { success: true, data: { refunded: true, repaired: true } },
            { status: 200 },
          )
        } catch (refundError) {
          logger.error({
            context: "webhooks/mercadopago",
            message: "needs_review_refund_retry_failed",
            order_id: orderId,
            payment_id: mpPaymentId,
            error: refundError,
          })
          return NextResponse.json(
            { success: false, error: "expired_needs_refund" },
            { status: 200 },
          )
        }
      }

      const { data: finalizeRaw, error: finalizeError } = await admin.rpc(
        "finalize_paid_order",
        {
          p_order_id: orderId,
          p_mp_payment_id: mpPaymentId,
        },
      )

      if (finalizeError) {
        logger.error({
          context: "webhooks/mercadopago",
          message: "finalize_paid_order_failed",
          order_id: orderId,
          payment_id: mpPaymentId,
          error: finalizeError.message,
        })
        return NextResponse.json(
          { success: false, error: finalizeError.message },
          { status: 200 },
        )
      }

      const finalize = (finalizeRaw ?? {}) as FinalizePaidResult

      if (
        finalize.ok === false &&
        (finalize.needs_refund === true ||
          finalize.code === "order_expired" ||
          finalize.code === "no_tickets")
      ) {
        try {
          await refundExpiredPayment(mpPaymentId)
          await recordWebhookEvent(admin, {
            paymentId: mpPaymentId,
            orderId,
            status: "approved_expired_refunded",
            rawSummary: {
              reason: finalize.code ?? "order_expired",
              order_status: order.status,
            },
          })
          logger.error({
            context: "webhooks/mercadopago",
            message: "approved_after_expired_refunded",
            order_id: orderId,
            payment_id: mpPaymentId,
            code: finalize.code,
          })
          return NextResponse.json(
            {
              success: true,
              data: {
                refunded: true,
                reason: finalize.code ?? "order_expired",
              },
            },
            { status: 200 },
          )
        } catch (refundError) {
          logger.error({
            context: "webhooks/mercadopago",
            message: "expired_order_refund_failed",
            order_id: orderId,
            payment_id: mpPaymentId,
            error: refundError,
          })
          await recordWebhookEvent(admin, {
            paymentId: mpPaymentId,
            orderId,
            status: "approved_expired_needs_review",
            rawSummary: {
              reason: finalize.code ?? "order_expired",
              refund_error:
                refundError instanceof Error
                  ? refundError.message
                  : "refund_failed",
            },
          })
          return NextResponse.json(
            { success: false, error: "expired_needs_refund" },
            { status: 200 },
          )
        }
      }

      if (finalize.ok !== true) {
        logger.error({
          context: "webhooks/mercadopago",
          message: "finalize_rejected",
          order_id: orderId,
          payment_id: mpPaymentId,
          finalize,
        })
        return webhookOk({
          handled: "finalize_rejected",
          error: finalize.code ?? "finalize_failed",
        })
      }

      await recordWebhookEvent(admin, {
        paymentId: mpPaymentId,
        orderId,
        status: "approved",
        rawSummary: {
          transaction_amount: payment.transaction_amount ?? null,
          finalize_code: finalize.code ?? null,
          tickets_activated: finalize.tickets_activated ?? null,
        },
      })

      try {
        const { error: leftoverError } = await admin.rpc(
          "release_leftover_cart_holds_for_order",
          { p_order_id: orderId },
        )
        if (leftoverError) {
          logger.error({
            context: "webhooks/mercadopago",
            message: "leftover_holds_release_failed",
            order_id: orderId,
            payment_id: mpPaymentId,
            error: leftoverError.message,
          })
        }
      } catch (leftoverErr) {
        logger.error({
          context: "webhooks/mercadopago",
          message: "leftover_holds_release_failed",
          order_id: orderId,
          payment_id: mpPaymentId,
          error: leftoverErr,
        })
      }

      if (!finalize.idempotent) {
        let access: { magicUrl: string; otp: string } | null = null
        try {
          const { issueGuestReceiptAccess } = await import(
            "@/app/actions/guest-ticket-access"
          )
          access = await issueGuestReceiptAccess(orderId)
        } catch (accessErr) {
          logger.error({
            context: "webhooks/mercadopago",
            message: "guest_access_issue_failed",
            order_id: orderId,
            error: accessErr,
          })
        }

        try {
          await notifyGobiOrderPaid(admin, orderId, access)
        } catch (gobiErr) {
          console.error("[WEBHOOK ERROR] gobi dispatch failed:", gobiErr)
          logger.error({
            context: "webhooks/mercadopago",
            message: "gobi_order_paid_dispatch_failed",
            order_id: orderId,
            payment_id: mpPaymentId,
            error: gobiErr,
          })
        }

        try {
          await sendPaidOrderReceiptEmail(admin, orderId, access)
        } catch (emailErr) {
          console.error("[WEBHOOK ERROR] ticket receipt email failed:", emailErr)
          logger.error({
            context: "webhooks/mercadopago",
            message: "ticket_receipt_email_failed",
            order_id: orderId,
            payment_id: mpPaymentId,
            error: emailErr,
          })
        }
      }

      return webhookOk({
        status: "approved",
        idempotent: Boolean(finalize.idempotent),
        tickets_activated: finalize.tickets_activated ?? null,
      })
    }

    if (
      status === "rejected" ||
      status === "cancelled" ||
      status === "refunded" ||
      status === "charged_back"
    ) {
      const ledgerStatus = String(status)
      if (await alreadyProcessed(admin, mpPaymentId, ledgerStatus)) {
        return NextResponse.json(
          { success: true, data: { idempotent: true, status: ledgerStatus } },
          { status: 200 },
        )
      }

      if (order.status === "pending") {
        const { data: expired, error: expireError } = await admin.rpc(
          "expire_abandoned_order",
          { p_order_id: orderId },
        )
        if (expireError || !expired) {
          logger.error({
            context: "webhooks/mercadopago",
            message: "failed_payment_order_cleanup_failed",
            order_id: orderId,
            payment_id: mpPaymentId,
            error: expireError?.message ?? "order_not_pending",
          })
          return NextResponse.json(
            { success: false, error: "order_cleanup_failed" },
            { status: 200 },
          )
        }
      }

      if (order.status === "pending" || order.status === "expired") {
        const { data: failedOrder, error: failedOrderError } = await admin
          .from("orders")
          .update({ status: "failed", mp_payment_id: mpPaymentId })
          .eq("id", orderId)
          .eq("status", "expired")
          .select("id")
          .maybeSingle()

        if (failedOrderError || !failedOrder) {
          logger.error({
            context: "webhooks/mercadopago",
            message: "failed_payment_status_update_failed",
            order_id: orderId,
            payment_id: mpPaymentId,
            error: failedOrderError?.message ?? "order_not_expired",
          })
          return NextResponse.json(
            { success: false, error: "order_status_update_failed" },
            { status: 200 },
          )
        }
      }

      if (
        (status === "refunded" || status === "charged_back") &&
        (order.status === "paid" || order.mp_payment_id === mpPaymentId)
      ) {
        await admin
          .from("orders")
          .update({ status: "failed", mp_payment_id: mpPaymentId })
          .eq("id", orderId)

        const { error: cancelError } = await admin.rpc(
          "cancel_paid_order_tickets",
          { p_order_id: orderId },
        )
        if (cancelError) {
          logger.error({
            context: "webhooks/mercadopago",
            message: "cancel_paid_tickets_failed",
            order_id: orderId,
            payment_id: mpPaymentId,
            error: cancelError.message,
          })
          return NextResponse.json(
            { success: false, error: cancelError.message },
            { status: 200 },
          )
        }
      }

      await recordWebhookEvent(admin, {
        paymentId: mpPaymentId,
        orderId,
        status: ledgerStatus,
        rawSummary: null,
      })

      return NextResponse.json({ success: true }, { status: 200 })
    }

    return webhookOk({ status: status ?? null })
  } catch (error) {
    captureCriticalException(error, "webhooks/mercadopago")
    console.error("[WEBHOOK ERROR]", error)
    logger.error({
      context: "webhooks/mercadopago",
      message: "process_webhook_error",
      error,
    })
    return NextResponse.json({ received: true }, { status: 200 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
