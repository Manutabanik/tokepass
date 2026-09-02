
import { normalizeCheckoutHoldSessionId } from "@/lib/checkout/hold-session"
import { isSandboxEventStatus } from "@/lib/events/review-status"
import { logger } from "@/lib/logger"
import { assertWaitingRoomCheckoutPass } from "@/lib/waiting-room/assert-checkout-pass"
import { normalizePreviewKey } from "@/lib/preview/sandbox"
import {
  tryCreateAdminClient,
} from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type {
  CheckoutEventAccess,
  CheckoutSupabase,
} from "@/lib/modules/checkout/types/checkout.types"

export async function assertCheckoutWaitingRoom(input: {
  eventId: string
  eventSlug?: string | null
  bypass?: boolean
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.bypass) return { ok: true }
  return assertWaitingRoomCheckoutPass([input.eventId, input.eventSlug])
}

export async function transferGuestHoldsToBuyer(input: {
  eventId: string
  sessionId?: string | null
  buyerId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = normalizeCheckoutHoldSessionId(input.sessionId)
  if (!session || session === input.buyerId) return { ok: true }
  const admin = tryCreateAdminClient()
  if (!admin) {
    return {
      ok: false,
      error: "No se pudo abrir la reserva temporal. Probá de nuevo.",
    }
  }

  const { error } = await admin.rpc("transfer_guest_cart_holds", {
    p_event_id: input.eventId,
    p_session_id: session,
    p_buyer_id: input.buyerId,
  })
  if (
    error &&
    /could not find|schema cache|does not exist|pgrst202/i.test(error.message)
  ) {
    return fallbackTransferGuestHolds(admin, {
      eventId: input.eventId,
      session,
      buyerId: input.buyerId,
    })
  }
  if (error) {
    logger.error({
      context: "checkout/guest-hold",
      message: "transfer_guest_cart_holds_failed",
      eventId: input.eventId,
      error: error.message,
    })
    return {
      ok: false,
      error: "No se pudo vincular tu reserva. Probá de nuevo.",
    }
  }
  return { ok: true }
}

async function fallbackTransferGuestHolds(
  admin: NonNullable<ReturnType<typeof tryCreateAdminClient>>,
  input: { eventId: string; session: string; buyerId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: guestHolds, error: listError } = await admin
    .from("event_ga_cart_holds")
    .select("id, tier_id, quantity, reserved_until")
    .eq("event_id", input.eventId)
    .eq("owner_id", input.session)
  if (listError) {
    logger.error({
      context: "checkout/guest-hold",
      message: "transfer_ga_list_failed",
      eventId: input.eventId,
      error: listError.message,
    })
    return {
      ok: false,
      error: "No se pudo vincular tu reserva. Probá de nuevo.",
    }
  }

  for (const hold of guestHolds ?? []) {
    const { data: existing } = await admin
      .from("event_ga_cart_holds")
      .select("id, quantity, reserved_until")
      .eq("event_id", input.eventId)
      .eq("owner_id", input.buyerId)
      .eq("tier_id", hold.tier_id)
      .maybeSingle()
    if (existing?.id) {
      const { error: mergeError } = await admin
        .from("event_ga_cart_holds")
        .update({
          quantity: existing.quantity + hold.quantity,
          reserved_until:
            existing.reserved_until > hold.reserved_until
              ? existing.reserved_until
              : hold.reserved_until,
        })
        .eq("id", existing.id)
      if (mergeError) {
        return {
          ok: false,
          error: "No se pudo vincular tu reserva. Probá de nuevo.",
        }
      }
      await admin.from("event_ga_cart_holds").delete().eq("id", hold.id)
      continue
    }
    const { error: moveError } = await admin
      .from("event_ga_cart_holds")
      .update({ owner_id: input.buyerId })
      .eq("id", hold.id)
    if (moveError) {
      return {
        ok: false,
        error: "No se pudo vincular tu reserva. Probá de nuevo.",
      }
    }
  }

  const [seats, units] = await Promise.all([
    admin
      .from("seat_holds")
      .update({ owner_id: input.buyerId })
      .eq("event_id", input.eventId)
      .eq("user_session_id", input.session),
    admin
      .from("event_seating_units")
      .update({ reserved_by: input.buyerId })
      .eq("event_id", input.eventId)
      .eq("reserved_by", input.session),
  ])
  if (seats.error || units.error) {
    logger.error({
      context: "checkout/guest-hold",
      message: "transfer_seat_fallback_failed",
      eventId: input.eventId,
      error: seats.error?.message ?? units.error?.message,
    })
    return {
      ok: false,
      error: "No se pudo vincular tu reserva. Probá de nuevo.",
    }
  }
  return { ok: true }
}

export async function resolveCheckoutEventAccess(input: {
  eventId: string
  userId: string
  previewKey?: string | null
}): Promise<CheckoutEventAccess> {
  const userClient = await createClient()
  const admin = tryCreateAdminClient() as CheckoutSupabase | null
  const { data: event } = await (admin ?? userClient)
    .from("events")
    .select("id, slug, organizer_id, status")
    .eq("id", input.eventId)
    .maybeSingle()

  if (!event) {
    return { ok: false, error: "Evento no encontrado." }
  }

  if (event.status === "published") {
    return {
      ok: true,
      useSandbox: false,
      db: userClient,
      eventId: event.id,
      eventSlug: event.slug ?? null,
    }
  }

  if (event.status === "paused") {
    const { data: profile } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", input.userId)
      .maybeSingle()
    const isStaff =
      event.organizer_id === input.userId || profile?.role === "super_admin"
    if (!isStaff) {
      return { ok: false, error: "Este evento no está en venta." }
    }
    return {
      ok: true,
      useSandbox: false,
      db: userClient,
      eventId: event.id,
      eventSlug: event.slug ?? null,
    }
  }

  if (!isSandboxEventStatus(event.status)) {
    return {
      ok: false,
      error: "Este evento no admite compras de prueba en su estado actual.",
    }
  }

  if (!admin) {
    return { ok: false, error: "No se pudo verificar el evento." }
  }

  const key = normalizePreviewKey(input.previewKey)
  if (key) {
    const { data: matches } = await admin.rpc("event_preview_key_matches", {
      p_event_id: input.eventId,
      p_key: key,
    })
    if (matches) {
      return {
        ok: true,
        useSandbox: true,
        db: admin,
        eventId: event.id,
        eventSlug: event.slug ?? null,
      }
    }
  }

  const { data: profile } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", input.userId)
    .maybeSingle()
  const isStaff =
    event.organizer_id === input.userId || profile?.role === "super_admin"
  if (!isStaff) {
    return { ok: false, error: "Este evento no es público." }
  }

  return {
    ok: true,
    useSandbox: true,
    db: admin,
    eventId: event.id,
    eventSlug: event.slug ?? null,
  }
}

