"use server"

import { revalidatePath } from "next/cache"

import { resolvePurchaseLimit } from "@/lib/checkout-limits"
import { createClient } from "@/lib/supabase/server"

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

export type EventPurchaseLimits = {
  eventId: string
  eventTitle: string
  maxTicketsPerUser: number | null
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
      .select("id, title, organizer_id, max_tickets_per_user")
      .eq("id", eventId)
      .maybeSingle(),
  ])

  if (!event) return { ok: false as const, error: "Evento no encontrado." }
  if (event.organizer_id !== user.id && profile?.role !== "super_admin") {
    return { ok: false as const, error: "No tenés permiso para este evento." }
  }

  return { ok: true as const, supabase, event }
}

export async function getEventPurchaseLimits(
  eventId: string,
): Promise<EventPurchaseLimits | null> {
  const access = await requireEventOrganizer(eventId)
  if (!access.ok) return null

  return {
    eventId: access.event.id,
    eventTitle: access.event.title,
    maxTicketsPerUser: resolvePurchaseLimit(access.event.max_tickets_per_user),
  }
}

export async function updateEventPurchaseLimits(
  eventId: string,
  input: { maxTicketsPerUser: number | null },
): Promise<ActionResult<EventPurchaseLimits>> {
  try {
    const access = await requireEventOrganizer(eventId)
    if (!access.ok) return { success: false, error: access.error }

    if (input.maxTicketsPerUser != null) {
      const raw = Number(input.maxTicketsPerUser)
      if (!Number.isFinite(raw) || raw < 0) {
        return {
          success: false,
          error:
            "Ingresá un número mayor a 0 o dejá el campo vacío para sin límite.",
        }
      }
    }
    const nextLimit = resolvePurchaseLimit(input.maxTicketsPerUser)
    if (nextLimit != null && nextLimit > 200) {
      return {
        success: false,
        error: "El límite por transacción no puede superar 200 lugares.",
      }
    }

    const { error } = await access.supabase
      .from("events")
      .update({
        max_tickets_per_user: nextLimit,
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId)

    if (error) return { success: false, error: error.message }

    revalidatePath(`/admin/events/${eventId}`)
    revalidatePath(`/admin/events/${eventId}/edit`)
    revalidatePath(`/events/${eventId}`)

    return {
      success: true,
      data: {
        eventId,
        eventTitle: access.event.title,
        maxTicketsPerUser: nextLimit,
      },
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo guardar el límite de compra.",
    }
  }
}
