"use server"

import { z } from "zod"

import { createAdminClient } from "@/lib/supabase/admin"

const eventIdSchema = z.string().uuid()

export async function recordEventStorefrontView(eventId: string) {
  const parsed = eventIdSchema.safeParse(eventId)
  if (!parsed.success) return

  try {
    const admin = createAdminClient()
    await admin.rpc("increment_event_storefront_views", {
      p_event_id: parsed.data,
    })
  } catch {
    // La ficha publica no debe fallar si el contador no esta disponible.
  }
}
