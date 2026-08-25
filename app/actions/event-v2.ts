"use server"

import { createClient } from "@/lib/supabase/server"

export type UpdateEventV2Result = {
  error?: string
  details?: string | null
  code?: string | null
  hint?: string | null
  step?: string
  ok?: boolean
  event?: unknown
  tier?: unknown
}

function rawSupabaseError(error: unknown, step: string): UpdateEventV2Result {
  if (error && typeof error === "object") {
    const row = error as {
      message?: string
      details?: string
      code?: string
      hint?: string
    }
    return {
      error: row.message ?? String(error),
      details: row.details ?? null,
      code: row.code ?? null,
      hint: row.hint ?? null,
      step,
    }
  }
  return {
    error: String(error),
    details: null,
    code: null,
    hint: null,
    step,
  }
}

/**
 * Persistencia V2 aislada: UPDATE events + UPSERT ticket_tiers.
 * No usa el wizard ni updateCompleteEvent. Errores de Supabase salen crudos.
 */
export async function updateEventV2(
  formData: FormData,
): Promise<UpdateEventV2Result> {
  try {
    const eventId = String(formData.get("eventId") ?? "").trim()
    const title = String(formData.get("title") ?? "").trim()
    const ticketId = String(formData.get("ticketId") ?? "").trim()
    const ticketName =
      String(formData.get("ticketName") ?? "").trim() || "General"
    const price = Number(formData.get("price"))
    const stock = Number(formData.get("stock"))

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError) return rawSupabaseError(authError, "auth.getUser")
    if (!user) {
      return {
        error: "No hay sesión autenticada",
        details: null,
        code: "UNAUTHENTICATED",
        step: "auth.getUser",
      }
    }

    const eventWrite = await supabase
      .from("events")
      .update({
        title,
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId)
      .select("id, title, updated_at")
      .maybeSingle()

    if (eventWrite.error) {
      return rawSupabaseError(eventWrite.error, "events.update")
    }
    if (!eventWrite.data) {
      return {
        error:
          "events.update no devolvió fila (0 rows). Posible RLS o ID inválido.",
        details: JSON.stringify({ eventId, userId: user.id }),
        code: "NO_ROWS",
        step: "events.update",
      }
    }

    const tierRow: Record<string, unknown> = {
      ...(ticketId ? { id: ticketId } : {}),
      event_id: eventId,
      name: ticketName,
      price,
      base_price: price,
      platform_fee: 0,
      capacity: stock,
      total_capacity: stock,
      updated_at: new Date().toISOString(),
    }

    const tierWrite = await supabase
      .from("ticket_tiers")
      .upsert(tierRow as never, ticketId ? { onConflict: "id" } : undefined)
      .select("id, event_id, name, price, base_price, capacity, total_capacity")
      .maybeSingle()

    if (tierWrite.error) {
      return rawSupabaseError(tierWrite.error, "ticket_tiers.upsert")
    }
    if (!tierWrite.data) {
      return {
        error:
          "ticket_tiers.upsert no devolvió fila (0 rows). Posible RLS o constraint.",
        details: JSON.stringify(tierRow),
        code: "NO_ROWS",
        step: "ticket_tiers.upsert",
      }
    }

    return {
      ok: true,
      event: eventWrite.data,
      tier: tierWrite.data,
    }
  } catch (error) {
    return rawSupabaseError(error, "catch")
  }
}
