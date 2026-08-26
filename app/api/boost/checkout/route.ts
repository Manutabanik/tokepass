import { Preference } from "mercadopago"
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { boostExternalRef, getBoostPlan } from "@/lib/boost-plans"
import { logger } from "@/lib/logger"
import { getMercadoPagoClient, getSiteUrl, isLocalSiteUrl, resolveCheckoutInitPoint } from "@/lib/mercadopago"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const bodySchema = z.object({
  eventId: z.string().uuid(),
  tier: z.enum(["flash_3d", "pro_7d", "vip_total", "silver", "gold", "platinum"]),
})

export async function POST(request: NextRequest) {
  try {
    const json = (await request.json()) as unknown
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos de boost inválidos." },
        { status: 400 },
      )
    }

    const plan = getBoostPlan(parsed.data.tier)
    if (!plan) {
      return NextResponse.json(
        { success: false, error: "Plan no encontrado." },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: "auth_required" },
        { status: 401 },
      )
    }

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, title, organizer_id, status")
      .eq("id", parsed.data.eventId)
      .maybeSingle()

    if (eventError || !event) {
      return NextResponse.json(
        { success: false, error: "Evento no encontrado." },
        { status: 404 },
      )
    }

    if (event.organizer_id !== user.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()

      if (profile?.role !== "super_admin") {
        return NextResponse.json(
          { success: false, error: "No podés boostear un evento ajeno." },
          { status: 403 },
        )
      }
    }

    const { data: subscription, error: insertError } = await supabase
      .from("boost_subscriptions")
      .insert({
        event_id: event.id,
        organizer_id: event.organizer_id,
        tier: plan.tier,
        amount_paid: plan.priceArs,
        duration_days: plan.durationDays,
        payment_status: "pending",
      })
      .select("id")
      .single()

    if (insertError || !subscription) {
      return NextResponse.json(
        {
          success: false,
          error: "No se pudo crear la suscripción.",
        },
        { status: 500 },
      )
    }

    const siteUrl = getSiteUrl()
    const preference = new Preference(getMercadoPagoClient())
    const externalReference = boostExternalRef(subscription.id)
    const localSite = isLocalSiteUrl(siteUrl)

    const created = await preference.create({
      body: {
        external_reference: externalReference,
        ...(!localSite
          ? { notification_url: `${siteUrl}/api/webhooks/mercadopago` }
          : {}),
        back_urls: {
          success: `${siteUrl}/admin/events/${event.id}?boost=success`,
          pending: `${siteUrl}/admin/events/${event.id}?boost=pending`,
          failure: `${siteUrl}/admin/events/${event.id}?boost=failure`,
        },
        ...(!localSite ? { auto_return: "approved" as const } : {}),
        items: [
          {
            id: `boost-${plan.tier}`,
            title: `TokePass Boost ${plan.name} — ${event.title}`.slice(0, 256),
            quantity: 1,
            unit_price: plan.priceArs,
            currency_id: "ARS",
          },
        ],
        metadata: {
          kind: "tokepass_boost",
          boost_subscription_id: subscription.id,
          event_id: event.id,
          tier: plan.tier,
        },
      },
    })

    const initPoint = resolveCheckoutInitPoint(created)
    if (!initPoint) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Sandbox no devolvió sandbox_init_point. Usá credenciales TEST- en MP_ACCESS_TOKEN.",
        },
        { status: 502 },
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        initPoint,
        preferenceId: created.id ?? null,
        subscriptionId: subscription.id,
      },
    })
  } catch (error) {
    logger.error({
      context: "api/boost/checkout",
      message: "boost_checkout_failed",
      error,
    })
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo iniciar el pago del boost.",
      },
      { status: 500 },
    )
  }
}
