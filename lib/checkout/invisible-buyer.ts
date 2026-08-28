import "server-only"

import type { NormalizedCheckoutBuyer } from "@/lib/checkout-buyer"
import { logger } from "@/lib/logger"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

type AdminClient = ReturnType<typeof createAdminClient>

export type InvisibleBuyerResult =
  | { ok: true; userId: string; signedIn: boolean }
  | { ok: false; error: string }

async function findProfileIdByEmail(
  admin: AdminClient,
  email: string,
): Promise<string | null> {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle()
  return data?.id ?? null
}

async function backfillInvisibleProfile(
  admin: AdminClient,
  userId: string,
  buyer: NormalizedCheckoutBuyer,
  email: string,
) {
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, dni, phone, email")
    .eq("id", userId)
    .maybeSingle()
  if (!profile) return

  const patch: {
    full_name?: string
    dni?: string | null
    phone?: string | null
    email?: string
  } = {}
  if (!profile.full_name?.trim() && buyer.buyerName) {
    patch.full_name = buyer.buyerName
  }
  if (!profile.dni?.trim() && buyer.buyerDni) {
    patch.dni = buyer.buyerDni
  }
  if (!profile.phone?.trim() && buyer.buyerPhone) {
    patch.phone = buyer.buyerPhone
  }
  if (!profile.email?.trim()) {
    patch.email = email
  }
  if (Object.keys(patch).length === 0) return
  await admin.from("profiles").update(patch).eq("id", userId)
}

export async function resolveInvisibleCheckoutBuyer(
  buyer: NormalizedCheckoutBuyer,
): Promise<InvisibleBuyerResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    return { ok: true, userId: user.id, signedIn: true }
  }

  const email = buyer.buyerEmail.trim().toLowerCase()
  if (!email) {
    return { ok: false, error: "Completá tu mail para continuar." }
  }

  try {
    const admin = createAdminClient()
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle()

    if (existing?.id) {
      await backfillInvisibleProfile(admin, existing.id, buyer, email)
      return { ok: true, userId: existing.id, signedIn: false }
    }

    const password = `G.${crypto.randomUUID()}${crypto.randomUUID()}`
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: buyer.buyerName,
        dni: buyer.buyerDni,
        checkout_guest: true,
      },
      app_metadata: { identity: "buyer", checkout_guest: true },
    })
    if (createError || !created.user) {
      const recovered = await findProfileIdByEmail(admin, email)
      if (recovered) {
        await backfillInvisibleProfile(admin, recovered, buyer, email)
        return { ok: true, userId: recovered, signedIn: false }
      }
      logger.error({
        context: "checkout/invisible-buyer",
        message: "guest_user_create_failed",
        error: createError?.message,
      })
      return {
        ok: false,
        error: "No se pudo preparar tu compra. Probá de nuevo.",
      }
    }

    await admin
      .from("profiles")
      .update({
        full_name: buyer.buyerName,
        dni: buyer.buyerDni || null,
        phone: buyer.buyerPhone || null,
        email,
      })
      .eq("id", created.user.id)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (signInError) {
      logger.error({
        context: "checkout/invisible-buyer",
        message: "guest_user_signin_failed",
        error: signInError.message,
      })
      return { ok: true, userId: created.user.id, signedIn: false }
    }

    return { ok: true, userId: created.user.id, signedIn: true }
  } catch (error) {
    logger.error({
      context: "checkout/invisible-buyer",
      message: "guest_user_unhandled",
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      ok: false,
      error: "No se pudo preparar tu compra. Probá de nuevo.",
    }
  }
}
