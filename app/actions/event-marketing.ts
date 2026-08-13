"use server"

import { revalidatePath } from "next/cache"

import {
  emptyPixelConfig,
  type EventPixelConfig,
} from "@/lib/analytics/pixels"
import { createClient } from "@/lib/supabase/server"

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

export type EventMarketingSettings = EventPixelConfig & {
  eventId: string
  eventTitle: string
}

function normalizePixelId(value: string | null | undefined): string | null {
  const clean = value?.trim() || ""
  return clean.length > 0 ? clean : null
}

function isLikelyMetaPixelId(id: string): boolean {
  return /^\d{5,20}$/.test(id)
}

function isLikelyTikTokPixelId(id: string): boolean {
  return /^[A-Z0-9]{10,64}$/i.test(id)
}

function isLikelyGa4Id(id: string): boolean {
  return /^G-[A-Z0-9]{6,20}$/i.test(id)
}

async function requireEventOrganizer(eventId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "Debés iniciar sesión." }

  const [{ data: profile }, { data: event }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("events")
      .select(
        "id, title, organizer_id, meta_pixel_id, meta_pixel_enabled, tiktok_pixel_id, tiktok_pixel_enabled, ga4_measurement_id, ga4_enabled",
      )
      .eq("id", eventId)
      .maybeSingle(),
  ])

  if (!event) return { ok: false as const, error: "Evento no encontrado." }
  if (event.organizer_id !== user.id && profile?.role !== "super_admin") {
    return { ok: false as const, error: "No tenés permiso para este evento." }
  }

  return { ok: true as const, supabase, event }
}

export async function getEventMarketingSettings(
  eventId: string,
): Promise<EventMarketingSettings | null> {
  const access = await requireEventOrganizer(eventId)
  if (!access.ok) return null

  return {
    eventId: access.event.id,
    eventTitle: access.event.title,
    metaPixelId: access.event.meta_pixel_id,
    metaPixelEnabled: Boolean(access.event.meta_pixel_enabled),
    tiktokPixelId: access.event.tiktok_pixel_id,
    tiktokPixelEnabled: Boolean(access.event.tiktok_pixel_enabled),
    ga4MeasurementId: access.event.ga4_measurement_id,
    ga4Enabled: Boolean(access.event.ga4_enabled),
  }
}

export async function updateEventMarketingSettings(
  eventId: string,
  input: EventPixelConfig,
): Promise<ActionResult<EventMarketingSettings>> {
  try {
    const access = await requireEventOrganizer(eventId)
    if (!access.ok) return { success: false, error: access.error }

    const metaPixelId = normalizePixelId(input.metaPixelId)
    const tiktokPixelId = normalizePixelId(input.tiktokPixelId)
    const ga4MeasurementId = normalizePixelId(input.ga4MeasurementId)

    if (metaPixelId && !isLikelyMetaPixelId(metaPixelId)) {
      return {
        success: false,
        error: "El Meta Pixel ID debe ser numérico (ej. 123456789012345).",
      }
    }
    if (tiktokPixelId && !isLikelyTikTokPixelId(tiktokPixelId)) {
      return {
        success: false,
        error: "Revisá el TikTok Pixel ID.",
      }
    }
    if (ga4MeasurementId && !isLikelyGa4Id(ga4MeasurementId)) {
      return {
        success: false,
        error: "El GA4 Measurement ID debe verse como G-XXXXXXXX.",
      }
    }

    const metaEnabled = Boolean(input.metaPixelEnabled && metaPixelId)
    const tiktokEnabled = Boolean(input.tiktokPixelEnabled && tiktokPixelId)
    const ga4Enabled = Boolean(input.ga4Enabled && ga4MeasurementId)

    const { error } = await access.supabase
      .from("events")
      .update({
        meta_pixel_id: metaPixelId,
        meta_pixel_enabled: metaEnabled,
        tiktok_pixel_id: tiktokPixelId,
        tiktok_pixel_enabled: tiktokEnabled,
        ga4_measurement_id: ga4MeasurementId,
        ga4_enabled: ga4Enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId)

    if (error) return { success: false, error: error.message }

    revalidatePath(`/admin/events/${eventId}/marketing`)
    revalidatePath(`/admin/events/${eventId}`)
    revalidatePath(`/events/${eventId}`)

    return {
      success: true,
      data: {
        eventId,
        eventTitle: access.event.title,
        metaPixelId,
        metaPixelEnabled: metaEnabled,
        tiktokPixelId,
        tiktokPixelEnabled: tiktokEnabled,
        ga4MeasurementId,
        ga4Enabled,
      },
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo guardar la configuración de píxeles.",
    }
  }
}

export type PurchaseAnalyticsPayload = {
  pixels: EventPixelConfig
  eventId: string
  eventTitle: string
  orderId: string
  value: number
  currency: "ARS"
  ticketIds: string[]
}

/** Datos para disparar Purchase en /checkout/success (solo dueño de la orden). */
export async function getPurchaseAnalyticsForOrder(
  orderId: string,
): Promise<PurchaseAnalyticsPayload | null> {
  const clean = orderId?.trim()
  if (!clean) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, total_amount, buyer_id")
    .eq("id", clean)
    .eq("buyer_id", user.id)
    .maybeSingle()

  if (error || !order) return null

  const { data: tickets } = await supabase
    .from("tickets")
    .select("id, event_id")
    .eq("order_id", clean)

  const ticketRows = tickets ?? []
  const eventId = ticketRows[0]?.event_id
  if (!eventId) {
    return {
      pixels: emptyPixelConfig(),
      eventId: "",
      eventTitle: "Evento Tokepass",
      orderId: clean,
      value: Number(order.total_amount) || 0,
      currency: "ARS",
      ticketIds: ticketRows.map((row) => row.id),
    }
  }

  const { data: event } = await supabase
    .from("events")
    .select(
      "id, title, meta_pixel_id, meta_pixel_enabled, tiktok_pixel_id, tiktok_pixel_enabled, ga4_measurement_id, ga4_enabled",
    )
    .eq("id", eventId)
    .maybeSingle()

  const pixels: EventPixelConfig = {
    metaPixelId: event?.meta_pixel_id ?? null,
    metaPixelEnabled: Boolean(event?.meta_pixel_enabled),
    tiktokPixelId: event?.tiktok_pixel_id ?? null,
    tiktokPixelEnabled: Boolean(event?.tiktok_pixel_enabled),
    ga4MeasurementId: event?.ga4_measurement_id ?? null,
    ga4Enabled: Boolean(event?.ga4_enabled),
  }

  return {
    pixels: hasAnyConfigured(pixels) ? pixels : emptyPixelConfig(),
    eventId,
    eventTitle: event?.title ?? "Evento Tokepass",
    orderId: clean,
    value: Number(order.total_amount) || 0,
    currency: "ARS",
    ticketIds: ticketRows.map((row) => row.id),
  }
}

function hasAnyConfigured(config: EventPixelConfig): boolean {
  return Boolean(
    config.metaPixelId || config.tiktokPixelId || config.ga4MeasurementId,
  )
}
