import { Payment } from "mercadopago"
import { createClient } from "@supabase/supabase-js"

import { getBoostPlan, parseBoostExternalRef } from "@/lib/boost-plans"
import { parsePaymentExternalReference } from "@/lib/checkout-buyer"
import { logger } from "@/lib/logger"
import { moneyAmountsEqual } from "@/lib/money/cents"
import { captureCriticalException } from "@/lib/sentry/capture"
import { getMercadoPagoClient } from "@/lib/mercadopago"
import { withCircuit } from "@/lib/resilience/circuit-breaker"
import { processPaidOrderNotification } from "@/lib/payments/core/confirm-order"
import { revokeDisputedPaidOrder } from "@/lib/payments/core/revoke-disputed-order"
import { isMercadoPagoChargebackTopic } from "@/lib/payments/mercadopago/parse-notification"
import { refundExpiredPayment } from "@/lib/payments/mercadopago/refund-expired-payment"
import { mercadoPagoRefundService } from "@/lib/mercadopago/refund-service"
import { parseResaleExternalRef } from "@/lib/resale"
import type { Database, Json } from "@/types/database"

export type MercadoPagoJobResult = {
  retry: boolean
  reason?: string
}

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

function jobDone(reason?: string): MercadoPagoJobResult {
  return { retry: false, reason }
}

function jobRetry(reason?: string): MercadoPagoJobResult {
  return { retry: true, reason }
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
        !moneyAmountsEqual(paidAmount, officialPrice)
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
        recordedAmount > 0 &&
        !moneyAmountsEqual(paidAmount, recordedAmount)
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
    input.status === "charged_back" ||
    input.status === "in_mediation"
  ) {
    const ledgerStatus = `boost_${input.status}`
    if (await alreadyProcessed(admin, input.mpPaymentId, ledgerStatus)) {
      return { ok: true as const, idempotent: true }
    }

    await admin
      .from("boost_subscriptions")
      .update({
        payment_status:
          input.status === "refunded" ||
          input.status === "charged_back" ||
          input.status === "in_mediation"
            ? "refunded"
            : "failed",
        payment_id_mp: input.mpPaymentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", boost.id)

    if (
      input.status === "refunded" ||
      input.status === "charged_back" ||
      input.status === "in_mediation"
    ) {
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

async function refundFailedResalePayment(
  admin: AdminClient,
  input: {
    listingId: string
    mpPaymentId: string
    paidAt: string | null
    reason: string
  },
): Promise<
  | { ok: true; refunded: true; idempotent?: boolean }
  | { ok: true; refunded: false; error: string }
  | { ok: false; error: string; retry: true }
> {
  if (await alreadyProcessed(admin, input.mpPaymentId, "resale_refunded")) {
    return { ok: true, refunded: true, idempotent: true }
  }

  const result = await mercadoPagoRefundService.refundPayment({
    paymentId: input.mpPaymentId,
    paidAt: input.paidAt,
    reason: input.reason,
  })

  if (result.success) {
    await recordWebhookEvent(admin, {
      paymentId: input.mpPaymentId,
      orderId: null,
      status: "resale_refunded",
      rawSummary: {
        listing_id: input.listingId,
        reason: input.reason,
        refund_id: result.refundId,
      },
    })
    if (!input.reason.includes("listing_reserved_other")) {
      await admin.rpc("release_resale_listing_reservation", {
        p_listing_id: input.listingId,
      })
    }
    return { ok: true, refunded: true }
  }

  if (result.error === "refund_window_expired") {
    await recordWebhookEvent(admin, {
      paymentId: input.mpPaymentId,
      orderId: null,
      status: "resale_refund_window_expired",
      rawSummary: {
        listing_id: input.listingId,
        reason: input.reason,
      },
    })
    return { ok: true, refunded: false, error: result.error }
  }

  logger.error({
    context: "webhooks/mercadopago",
    message: "resale_auto_refund_failed",
    listing_id: input.listingId,
    payment_id: input.mpPaymentId,
    reason: input.reason,
    error: result.error,
  })
  return { ok: false, error: result.error, retry: true }
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
    paidAt: string | null
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
    return { ok: false as const, error: "listing_not_found", retry: false }
  }

  if (input.status === "approved") {
    const ledgerStatus = "resale_approved"
    if (await alreadyProcessed(admin, input.mpPaymentId, ledgerStatus)) {
      return { ok: true as const, idempotent: true }
    }
    if (await alreadyProcessed(admin, input.mpPaymentId, "resale_refunded")) {
      return { ok: true as const, idempotent: true, refunded: true }
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
      return refundFailedResalePayment(admin, {
        listingId: listing.id,
        mpPaymentId: input.mpPaymentId,
        paidAt: input.paidAt,
        reason: "amount_mismatch",
      })
    }

    const buyerId = listing.buyer_id || input.metadataBuyerId
    if (!buyerId) {
      return refundFailedResalePayment(admin, {
        listingId: listing.id,
        mpPaymentId: input.mpPaymentId,
        paidAt: input.paidAt,
        reason: "buyer_missing",
      })
    }

    const { data: completeRaw, error: completeError } = await admin.rpc(
      "complete_ticket_resale_purchase",
      {
        p_listing_id: listing.id,
        p_buyer_user_id: buyerId,
        p_mp_payment_id: input.mpPaymentId,
      },
    )

    const complete = (completeRaw ?? {}) as {
      ok?: boolean
      code?: string
      idempotent?: boolean
      message?: string
    }

    if (completeError || !complete.ok) {
      const reason =
        completeError?.message ??
        complete.code ??
        complete.message ??
        "resale_complete_failed"
      logger.error({
        context: "webhooks/mercadopago",
        message: "resale_complete_failed",
        listing_id: listing.id,
        payment_id: input.mpPaymentId,
        error: reason,
      })
      return refundFailedResalePayment(admin, {
        listingId: listing.id,
        mpPaymentId: input.mpPaymentId,
        paidAt: input.paidAt,
        reason,
      })
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
    input.status === "charged_back" ||
    input.status === "in_mediation"
  ) {
    const ledgerStatus = `resale_${input.status}`
    if (await alreadyProcessed(admin, input.mpPaymentId, ledgerStatus)) {
      return { ok: true as const, idempotent: true }
    }

    if (listing.status === "reserved") {
      await admin.rpc("release_resale_listing_reservation", {
        p_listing_id: listing.id,
      })
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

/**
 * Ordenes de entrada estandar: un solo ledger via claim_and_finalize_paid_order.
 * Boost, resale y refunds siguen en el path legado.
 */
async function confirmStandardPaidOrder(input: {
  orderId: string
  transactionId: string
  amount: number
  currency: string | null
  rawPayload: unknown
}) {
  const result = await processPaidOrderNotification({
    provider: "mercadopago",
    transactionId: input.transactionId,
    orderId: input.orderId,
    amount: input.amount,
    currency: input.currency,
    rawPayload: input.rawPayload,
  })

  if (result.needsRefund && input.transactionId) {
    try {
      await refundExpiredPayment(input.transactionId)
    } catch (refundError) {
      logger.error({
        context: "webhooks/mercadopago",
        message: "shared_confirm_refund_failed",
        order_id: input.orderId,
        payment_id: input.transactionId,
        error: refundError,
      })
      return jobRetry("refund_failed")
    }
  }

  if (!result.ok && !result.needsRefund) {
    return jobRetry(result.code)
  }

  return jobDone(result.code)
}

function effectivePaymentStatus(
  mpStatus: string | undefined,
  eventType?: string,
): string | undefined {
  if (!isMercadoPagoChargebackTopic(eventType)) return mpStatus
  if (
    mpStatus === "in_mediation" ||
    mpStatus === "charged_back" ||
    mpStatus === "refunded"
  ) {
    return mpStatus
  }
  return "charged_back"
}

export async function processMercadoPagoPaymentById(
  paymentId: string,
  options?: { eventType?: string },
): Promise<MercadoPagoJobResult> {
  try {
    let payment
    try {
      const client = getMercadoPagoClient()
      const paymentClient = new Payment(client)
      payment = await withCircuit("mercadopago", () =>
        paymentClient.get({ id: paymentId }),
      )
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
      return jobRetry("payment_fetch_failed")
    }

    const externalReference = firstString(payment.external_reference)
    if (!externalReference) {
      return jobDone("missing_external_reference")
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
      return jobRetry("admin_client_unavailable")
    }

    const mpPaymentId = String(payment.id ?? paymentId)
    const status = effectivePaymentStatus(payment.status, options?.eventType)

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
        return jobDone("boost_failed")
      }
      return jobDone("boost")
    }

    const resaleListingId = parseResaleExternalRef(externalReference)
    if (resaleListingId) {
      const result = await activateResaleFromPayment(admin, {
        listingId: resaleListingId,
        mpPaymentId,
        status,
        transactionAmount: payment.transaction_amount,
        currencyId: firstString(payment.currency_id),
        paidAt: payment.date_approved
          ? String(payment.date_approved)
          : payment.date_created
            ? String(payment.date_created)
            : null,
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
        if ("retry" in result && result.retry) {
          return jobRetry("resale_refund_retry")
        }
        return jobDone("resale_failed")
      }
      return jobDone("resale")
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
      return jobDone("unrecognized_external_reference")
    }

    const { data: order } = await admin
      .from("orders")
      .select("id, status, total_amount, mp_payment_id")
      .eq("id", orderId)
      .maybeSingle()

    if (!order) {
      return jobDone("order_not_found")
    }

    if (status === "approved") {
      return confirmStandardPaidOrder({
        orderId,
        transactionId: mpPaymentId,
        amount: Number(payment.transaction_amount ?? 0),
        currency: firstString(payment.currency_id),
        rawPayload: payment,
      })
    }

    if (
      status === "refunded" ||
      status === "charged_back" ||
      status === "in_mediation"
    ) {
      const ledgerStatus = String(status)
      if (await alreadyProcessed(admin, mpPaymentId, ledgerStatus)) {
        return jobDone("refund_idempotent")
      }

      if (order.status === "paid" || order.status === "refund_processing") {
        await admin
          .from("orders")
          .update({ mp_payment_id: mpPaymentId })
          .eq("id", orderId)

        const revoked = await revokeDisputedPaidOrder({
          orderId,
          status: status as "refunded" | "charged_back" | "in_mediation",
        })
        if (!revoked.ok) {
          logger.error({
            context: "webhooks/mercadopago",
            message: "refunded_ticket_cancel_failed",
            order_id: orderId,
            payment_id: mpPaymentId,
            error: revoked.error,
          })
          if (status !== "in_mediation") {
            await admin
              .from("orders")
              .update({ status: "refunded", mp_payment_id: mpPaymentId })
              .eq("id", orderId)
          }
          return jobRetry("refund_cancel_failed")
        }
      }

      await recordWebhookEvent(admin, {
        paymentId: mpPaymentId,
        orderId,
        status: ledgerStatus,
        rawSummary: null,
      })

      return jobDone(ledgerStatus)
    }

    if (status === "rejected" || status === "cancelled") {
      const ledgerStatus = String(status)
      if (await alreadyProcessed(admin, mpPaymentId, ledgerStatus)) {
        return jobDone("rejected_idempotent")
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
          return jobRetry("order_cleanup_failed")
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
          return jobRetry("order_status_update_failed")
        }
      }

      await recordWebhookEvent(admin, {
        paymentId: mpPaymentId,
        orderId,
        status: ledgerStatus,
        rawSummary: null,
      })

      return jobDone("rejected")
    }

    return jobDone(status ?? "ignored")
  } catch (error) {
    captureCriticalException(error, "webhooks/mercadopago")
    console.error("[WEBHOOK ERROR]", error)
    logger.error({
      context: "webhooks/mercadopago",
      message: "process_webhook_error",
      error,
    })
    return jobRetry("process_webhook_error")
  }
}
