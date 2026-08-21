"use server"

import { revalidatePath } from "next/cache"

import { centsToMoney, moneyToCents } from "@/lib/money/cents"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { PromoCode, PromoDiscountType } from "@/types/database"

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

export type PromoCodeRow = PromoCode

export type ValidatedPromo = {
  promoCodeId: string
  code: string
  discountType: PromoDiscountType
  discountValue: number
  discountAmount: number
  promoterId?: string | null
  promoterName?: string | null
  promoterReferralCode?: string | null
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
      .select("id, title, organizer_id")
      .eq("id", eventId)
      .maybeSingle(),
  ])

  if (!event) return { ok: false as const, error: "Evento no encontrado." }
  if (event.organizer_id !== user.id && profile?.role !== "super_admin") {
    return { ok: false as const, error: "No tenés permiso para este evento." }
  }

  return { ok: true as const, supabase, event }
}

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "")
}

async function resolveOwnedPromoterId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizerId: string,
  promoterId: string | null | undefined,
): Promise<string | null | { error: string }> {
  if (!promoterId) return null
  const { data, error } = await supabase
    .from("promoters")
    .select("id, organizer_id")
    .eq("id", promoterId)
    .maybeSingle()
  if (error || !data) {
    return { error: "Promotor no encontrado." }
  }
  if (data.organizer_id !== organizerId) {
    return { error: "Ese RRPP no pertenece a la productora del evento." }
  }
  return data.id
}

function isMissingPromoterColumn(message: string | undefined) {
  return Boolean(message && /promoter_id|schema cache|does not exist/i.test(message))
}

export async function listEventPromoCodes(
  eventId: string,
): Promise<PromoCodeRow[]> {
  const access = await requireEventOrganizer(eventId)
  if (!access.ok) return []

  const { data, error } = await access.supabase
    .from("promo_codes")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[listEventPromoCodes]", error.message)
    return []
  }

  return (data ?? []) as PromoCodeRow[]
}

export async function createPromoCode(input: {
  eventId: string
  code: string
  discountType: PromoDiscountType
  discountValue: number
  maxUses?: number | null
  validUntil?: string | null
  promoterId?: string | null
}): Promise<ActionResult<PromoCodeRow>> {
  try {
    const access = await requireEventOrganizer(input.eventId)
    if (!access.ok) return { success: false, error: access.error }

    const code = normalizeCode(input.code)
    if (code.length < 3 || code.length > 40) {
      return {
        success: false,
        error: "El código debe tener entre 3 y 40 caracteres.",
      }
    }
    if (!/^[A-Z0-9_-]+$/.test(code)) {
      return {
        success: false,
        error: "Usá solo letras, números, guión o guión bajo.",
      }
    }

    const value = Number(input.discountValue)
    if (!Number.isFinite(value) || value <= 0) {
      return { success: false, error: "El valor del descuento debe ser mayor a 0." }
    }
    if (input.discountType === "percentage" && value > 100) {
      return { success: false, error: "El porcentaje no puede superar 100%." }
    }

    const maxUses =
      input.maxUses == null || input.maxUses === undefined
        ? null
        : Math.trunc(Number(input.maxUses))
    if (maxUses != null && (!Number.isFinite(maxUses) || maxUses < 1)) {
      return { success: false, error: "El límite de usos debe ser al menos 1." }
    }

    const validUntil = input.validUntil?.trim() || null
    if (validUntil && Number.isNaN(Date.parse(validUntil))) {
      return { success: false, error: "Fecha de vencimiento inválida." }
    }

    const promoter = await resolveOwnedPromoterId(
      access.supabase,
      access.event.organizer_id,
      input.promoterId,
    )
    if (promoter && typeof promoter === "object" && "error" in promoter) {
      return { success: false, error: promoter.error }
    }

    const insertPayload = {
      event_id: input.eventId,
      code,
      discount_type: input.discountType,
      discount_value: value,
      max_uses: maxUses,
      valid_until: validUntil,
      is_active: true,
      promoter_id: promoter,
    }

    let { data, error } = await access.supabase
      .from("promo_codes")
      .insert(insertPayload)
      .select("*")
      .single()

    if (error && isMissingPromoterColumn(error.message)) {
      const retry = await access.supabase
        .from("promo_codes")
        .insert({
          event_id: input.eventId,
          code,
          discount_type: input.discountType,
          discount_value: value,
          max_uses: maxUses,
          valid_until: validUntil,
          is_active: true,
        })
        .select("*")
        .single()
      data = retry.data
      error = retry.error
    }

    if (error) {
      console.error("SUPABASE_ERROR:", error)
      if (error.code === "23505") {
        return { success: false, error: "Ya existe ese código en este evento." }
      }
      return { success: false, error: error.message }
    }

    revalidatePath(`/admin/events/${input.eventId}/coupons`)
    revalidatePath(`/admin/events/${input.eventId}`)

    return { success: true, data: data as PromoCodeRow }
  } catch (error) {
    console.error("SUPABASE_ERROR:", error)
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "No se pudo crear el cupón.",
    }
  }
}

export async function updatePromoCode(input: {
  eventId: string
  promoCodeId: string
  promoterId?: string | null
}): Promise<ActionResult<PromoCodeRow>> {
  try {
    const access = await requireEventOrganizer(input.eventId)
    if (!access.ok) return { success: false, error: access.error }

    const promoter = await resolveOwnedPromoterId(
      access.supabase,
      access.event.organizer_id,
      input.promoterId,
    )
    if (promoter && typeof promoter === "object" && "error" in promoter) {
      return { success: false, error: promoter.error }
    }

    const { data, error } = await access.supabase
      .from("promo_codes")
      .update({ promoter_id: promoter })
      .eq("id", input.promoCodeId)
      .eq("event_id", input.eventId)
      .select("*")
      .single()

    if (error || !data) {
      return {
        success: false,
        error: isMissingPromoterColumn(error?.message)
          ? "Aplicá la migración P109 para vincular cupones a RRPP."
          : (error?.message ?? "Cupón no encontrado."),
      }
    }

    revalidatePath(`/admin/events/${input.eventId}/coupons`)
    return { success: true, data: data as PromoCodeRow }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el cupón.",
    }
  }
}

export async function setPromoCodeActive(input: {
  eventId: string
  promoCodeId: string
  isActive: boolean
}): Promise<ActionResult<PromoCodeRow>> {
  try {
    const access = await requireEventOrganizer(input.eventId)
    if (!access.ok) return { success: false, error: access.error }

    const { data, error } = await access.supabase
      .from("promo_codes")
      .update({ is_active: input.isActive })
      .eq("id", input.promoCodeId)
      .eq("event_id", input.eventId)
      .select("*")
      .single()

    if (error || !data) {
      return { success: false, error: error?.message ?? "Cupón no encontrado." }
    }

    revalidatePath(`/admin/events/${input.eventId}/coupons`)
    return { success: true, data: data as PromoCodeRow }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el cupón.",
    }
  }
}

export async function validatePromoCode(
  code: string,
  eventId: string,
  cartSubtotal: number,
): Promise<ActionResult<ValidatedPromo>> {
  try {
    const supabase = await createClient()
    const cleanCode = normalizeCode(code)
    if (!cleanCode || !eventId) {
      return { success: false, error: "Ingresá un código válido." }
    }

    const base = Number(cartSubtotal)
    if (!Number.isFinite(base) || base < 0) {
      return { success: false, error: "Subtotal inválido." }
    }
    const subtotal = centsToMoney(moneyToCents(base))

    const { data, error } = await supabase.rpc("validate_promo_code", {
      p_event_id: eventId,
      p_code: cleanCode,
      p_cart_subtotal: subtotal,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row || !row.ok || !row.promo_code_id || !row.code) {
      return {
        success: false,
        error: row?.message || "Código no válido.",
      }
    }

    let promoterId: string | null = null
    let promoterName: string | null = null
    let promoterReferralCode: string | null = null
    try {
      const admin = createAdminClient()
      const { data: promo, error: promoError } = await admin
        .from("promo_codes")
        .select("promoter_id")
        .eq("id", row.promo_code_id)
        .maybeSingle()
      if (!promoError && promo?.promoter_id) {
        const [{ data: promoter }, { data: event }] = await Promise.all([
          admin
            .from("promoters")
            .select("id, name, referral_code, organizer_id")
            .eq("id", promo.promoter_id)
            .maybeSingle(),
          admin
            .from("events")
            .select("organizer_id")
            .eq("id", eventId)
            .maybeSingle(),
        ])
        if (
          promoter &&
          event &&
          promoter.organizer_id === event.organizer_id
        ) {
          promoterId = promoter.id
          promoterName = promoter.name
          promoterReferralCode = promoter.referral_code
        }
      }
    } catch {
      // Columna o lookup opcional: el descuento ya es válido.
    }

    return {
      success: true,
      data: {
        promoCodeId: row.promo_code_id,
        code: row.code,
        discountType: (row.discount_type ?? "fixed_amount") as PromoDiscountType,
        discountValue: Number(row.discount_value ?? 0),
        discountAmount: centsToMoney(moneyToCents(row.discount_amount ?? 0)),
        promoterId,
        promoterName,
        promoterReferralCode,
      },
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo validar el cupón.",
    }
  }
}
