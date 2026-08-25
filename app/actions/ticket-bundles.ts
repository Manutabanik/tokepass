"use server"

import { revalidatePath, revalidateTag } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"
import { allInBreakdown } from "@/lib/pricing/all-in"
import {
  defaultEventFeeConfig,
  eventFeeRate,
  eventFixedFee,
} from "@/lib/pricing/event-fees"
import {
  inferBundleType,
  normalizePromoRule,
  parseBundleType,
  parsePromoDiscountType,
  promotionalBundlePrice,
  regularBundlePrice,
  type BundleType,
  type PromoDiscountType,
  type PromoRule,
} from "@/lib/inventory/flexible-bundles"
import { parseBundleItems } from "@/lib/inventory/unified-inventory"
import {
  parseTicketTierCategory,
  type TicketTierCategory,
} from "@/lib/ticket-tier-category"
import { formatSupabaseError } from "@/lib/errors/supabase-error"
import { writeSecurityAuditLog } from "@/lib/security/audit-log"
import { asUuidOrNull } from "@/lib/validations/relation-id"

export type BundleStoreItem = {
  id: string
  name: string
  price: number
  category: string
}

export type BundleComboLine = {
  eventItemId: string
  name: string
  quantity: number
  unitPrice: number
}

export type ManagedTicketTier = {
  id: string
  name: string
  price: number
  listPrice: number | null
  capacity: number
  sold: number
  category: TicketTierCategory
  dayId: string | null
  comboItems: BundleComboLine[]
  bundleType: BundleType | null
  bundleItems: Array<{ tierId: string; quantity: number }>
  tierType: string
  promoDiscountType: PromoDiscountType | null
  promoDiscountValue: number
  promoRequiredQty: number
  promoPayQty: number
}

async function assertOrganizer(eventId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "Tu sesión venció por seguridad. Volvé a ingresar con tu cuenta" }

  const [{ data: event }, { data: profile }] = await Promise.all([
    supabase
      .from("events")
      .select("id, organizer_id, platform_fee_percentage, platform_fixed_fee")
      .eq("id", eventId)
      .maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ])

  if (!event) return { ok: false as const, error: "Evento no encontrado." }
  if (event.organizer_id !== user.id && profile?.role !== "super_admin") {
    return { ok: false as const, error: "Sin permiso para este evento." }
  }

  return { ok: true as const, supabase, event, user }
}

export async function getEventBundleWorkspace(eventId: string): Promise<{
  tiers: ManagedTicketTier[]
  storeItems: BundleStoreItem[]
}> {
  const gate = await assertOrganizer(eventId)
  if (!gate.ok) return { tiers: [], storeItems: [] }

  const richTiers = await gate.supabase
    .from("ticket_tiers")
    .select("id, name, price, list_price, capacity, sold, category, day_id, tier_type, bundle_type, bundle_items, promo_discount_type, promo_discount_value, promo_required_qty, promo_pay_qty")
    .eq("event_id", eventId)
    .order("created_at")
  const tiersQuery =
    richTiers.error && /promo_discount|schema cache|PGRST204|42703/i.test(richTiers.error.message)
      ? await gate.supabase
          .from("ticket_tiers")
          .select("id, name, price, list_price, capacity, sold, category, day_id, tier_type, bundle_type, bundle_items")
          .eq("event_id", eventId)
          .order("created_at")
      : richTiers

  const [{ data: tiers }, { data: items }] = await Promise.all([
    Promise.resolve(tiersQuery),
    gate.supabase
      .from("event_items")
      .select("id, name, price, category")
      .eq("event_id", eventId)
      .eq("is_active", true)
      .order("name"),
  ])

  const { data: combos } =
    (tiers ?? []).length > 0
      ? await gate.supabase
          .from("ticket_tier_combo_items")
          .select("tier_id, quantity, event_item_id, event_items(id, name, price)")
          .in(
            "tier_id",
            (tiers ?? []).map((tier) => tier.id),
          )
      : { data: [] }

  const comboByTier = new Map<string, BundleComboLine[]>()
  for (const row of combos ?? []) {
    const item = row.event_items as unknown as {
      id: string
      name: string
      price: number
    } | null
    const list = comboByTier.get(row.tier_id) ?? []
    list.push({
      eventItemId: row.event_item_id,
      name: item?.name ?? "Extra",
      quantity: Number(row.quantity) || 1,
      unitPrice: Number(item?.price) || 0,
    })
    comboByTier.set(row.tier_id, list)
  }

  return {
    tiers: (tiers ?? []).map((tier) => {
      const bundleItems = parseBundleItems(tier.bundle_items)
      return {
        id: tier.id,
        name: tier.name,
        price: Number(tier.price) || 0,
        listPrice:
          tier.list_price == null ? null : Number(tier.list_price) || 0,
        capacity: Number(tier.capacity) || 0,
        sold: Number(tier.sold) || 0,
        category: parseTicketTierCategory(tier.category),
        dayId: tier.day_id,
        comboItems: comboByTier.get(tier.id) ?? [],
        bundleType: parseBundleType(tier.bundle_type),
        bundleItems,
        tierType: String(tier.tier_type ?? "general"),
        promoDiscountType: parsePromoDiscountType(
          (tier as { promo_discount_type?: string | null }).promo_discount_type,
        ),
        promoDiscountValue: Number(
          (tier as { promo_discount_value?: number }).promo_discount_value ?? 0,
        ),
        promoRequiredQty: Math.max(
          1,
          Number((tier as { promo_required_qty?: number }).promo_required_qty ?? 1) || 1,
        ),
        promoPayQty: Math.max(
          0,
          Number((tier as { promo_pay_qty?: number }).promo_pay_qty ?? 1) || 0,
        ),
      }
    }),
    storeItems: (items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      price: Number(item.price) || 0,
      category: item.category,
    })),
  }
}

export async function upsertTicketBundle(input: {
  eventId: string
  tierId?: string | null
  name: string
  category: TicketTierCategory
  salePrice: number
  listPrice: number
  capacity: number
  dayId: string | null
  comboItems: Array<{ eventItemId: string; quantity: number }>
  bundleType?: BundleType | null
  bundleItems?: Array<{ tierId: string; quantity: number }>
  promoRule?: PromoRule | null
  admitCount?: number
}): Promise<{ success: true; tierId: string } | { success: false; error: string }> {
  const gate = await assertOrganizer(input.eventId)
  if (!gate.ok) return { success: false, error: gate.error }

  const name = input.name.trim()
  if (name.length < 2) {
    return { success: false, error: "Nombrá el combo o la tarifa." }
  }

  const capacity = Math.max(1, Math.floor(Number(input.capacity) || 1))
  const rule = normalizePromoRule(input.promoRule)
  const childIds = (input.bundleItems ?? [])
    .map((item) => item.tierId)
    .filter(Boolean)
  const { data: childTiers } =
    childIds.length > 0
      ? await gate.supabase
          .from("ticket_tiers")
          .select("id, price")
          .eq("event_id", input.eventId)
          .in("id", childIds)
      : { data: [] }
  const unitPriceByTierId = Object.fromEntries(
    (childTiers ?? []).map((row) => [row.id, Number(row.price) || 0]),
  )
  const resolvedItems = (input.bundleItems ?? []).filter(
    (item) => item.tierId && item.quantity > 0 && unitPriceByTierId[item.tierId] != null,
  )
  if (input.category === "bundle" && resolvedItems.length === 0) {
    return { success: false, error: "Elegí al menos una entrada incluida." }
  }
  const listPrice = regularBundlePrice(resolvedItems, unitPriceByTierId)
  const salePrice = promotionalBundlePrice({
    items: resolvedItems,
    unitPriceByTierId,
    rule,
  })
  const feeConfig = defaultEventFeeConfig()
  const breakdown = allInBreakdown(
    salePrice,
    eventFeeRate({
      ...feeConfig,
      platformFeePercentage: Number(gate.event.platform_fee_percentage ?? 8),
      platformFixedFee: Number(gate.event.platform_fixed_fee ?? 0),
    }),
    eventFixedFee({
      ...feeConfig,
      platformFeePercentage: Number(gate.event.platform_fee_percentage ?? 8),
      platformFixedFee: Number(gate.event.platform_fixed_fee ?? 0),
    }),
  )

  const bundleItems = resolvedItems
  const bundleType =
    input.category === "bundle"
      ? inferBundleType({
          bundleType: input.bundleType,
          dayId: input.dayId,
          items: bundleItems,
        })
      : null

  const payload = {
    event_id: input.eventId,
    name,
    price: breakdown.publicPrice,
    base_price: breakdown.basePrice,
    platform_fee: breakdown.platformFee,
    capacity,
    category: input.category,
    list_price: listPrice > 0 ? listPrice : null,
    day_id: asUuidOrNull(input.dayId, ["all"]),
    visibility: "public" as const,
    layout_type: "general" as const,
    admit_count: Math.max(
      1,
      Math.min(50, Math.floor(Number(input.admitCount) || 1)),
    ),
    tier_type: input.category === "bundle" ? ("bundle" as const) : ("general" as const),
    bundle_type: bundleType,
    promo_discount_type: input.category === "bundle" ? rule.tipoDescuento : null,
    promo_discount_value: rule.valorDescuento,
    promo_required_qty: rule.cantidadRequerida,
    promo_pay_qty: rule.cantidadPaga,
    bundle_items: bundleItems.map((item) => ({
      tier_id: item.tierId,
      quantity: Math.max(1, Math.min(50, Math.floor(item.quantity) || 1)),
    })) as unknown as Json,
  }

  let tierId = input.tierId?.trim() || ""
  const admin = createAdminClient()

  if (tierId) {
    const { error } = await admin
      .from("ticket_tiers")
      .update({ ...payload, id: tierId, event_id: input.eventId })
      .eq("id", tierId)
      .eq("event_id", input.eventId)
    if (error && /promo_discount|schema cache|PGRST204|42703/i.test(error.message)) {
      const {
        promo_discount_type: _promoType,
        promo_discount_value: _promoValue,
        promo_required_qty: _promoRequired,
        promo_pay_qty: _promoPay,
        ...safe
      } = payload
      void _promoType
      void _promoValue
      void _promoRequired
      void _promoPay
      const retry = await admin
        .from("ticket_tiers")
        .update(safe)
        .eq("id", tierId)
        .eq("event_id", input.eventId)
      if (retry.error) {
        return { success: false, error: formatSupabaseError(retry.error) }
      }
    } else if (error) {
      return { success: false, error: formatSupabaseError(error) }
    }
  } else {
    const { data, error } = await admin
      .from("ticket_tiers")
      .insert(payload)
      .select("id")
      .maybeSingle()
    if ((error && /promo_discount|schema cache|PGRST204|42703/i.test(error.message))) {
      const {
        promo_discount_type: _promoType,
        promo_discount_value: _promoValue,
        promo_required_qty: _promoRequired,
        promo_pay_qty: _promoPay,
        ...safe
      } = payload
      void _promoType
      void _promoValue
      void _promoRequired
      void _promoPay
      const retry = await admin
        .from("ticket_tiers")
        .insert(safe)
        .select("id")
        .maybeSingle()
      if (retry.error || !retry.data) {
        return {
          success: false,
          error: retry.error
            ? formatSupabaseError(retry.error)
            : formatSupabaseError({
                code: "NO_ROWS",
                message: "ticket_tiers.insert no devolvió fila",
                details: name,
              }),
        }
      }
      tierId = retry.data.id
    } else if (error || !data) {
      return {
        success: false,
        error: error
          ? formatSupabaseError(error)
          : formatSupabaseError({
              code: "NO_ROWS",
              message: "ticket_tiers.insert no devolvió fila",
              details: name,
            }),
      }
    } else {
      tierId = data.id
    }
  }

  await gate.supabase.from("ticket_tier_combo_items").delete().eq("tier_id", tierId)

  const lines = input.comboItems
    .filter((line) => line.eventItemId)
    .map((line) => ({
      tier_id: tierId,
      event_item_id: line.eventItemId,
      quantity: Math.max(1, Math.min(50, Math.floor(line.quantity) || 1)),
    }))

  if (lines.length > 0) {
    const { error } = await gate.supabase
      .from("ticket_tier_combo_items")
      .insert(lines)
    if (error) return { success: false, error: formatSupabaseError(error) }
  }

  revalidatePath(`/admin/events/${input.eventId}`)
  revalidatePath(`/admin/events/${input.eventId}/tiers`)
  revalidatePath(`/admin/events/${input.eventId}/edit`)
  revalidatePath(`/events/${input.eventId}`)
  revalidatePath("/eventos")
  revalidateTag("catalog-events", "max")

  await writeSecurityAuditLog({
    actorId: gate.user.id,
    action: "event_price_update",
    entity: "event",
    entityId: input.eventId,
    details: {
      source: "ticket_bundle",
      tierId,
      salePrice: input.salePrice,
      listPrice: input.listPrice,
    },
  })

  return { success: true, tierId }
}

export async function deleteTicketBundle(input: {
  eventId: string
  tierId: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await assertOrganizer(input.eventId)
  if (!gate.ok) return { success: false, error: gate.error }

  const { data: tier } = await gate.supabase
    .from("ticket_tiers")
    .select("sold")
    .eq("id", input.tierId)
    .eq("event_id", input.eventId)
    .maybeSingle()

  if (!tier) return { success: false, error: "Tarifa no encontrada." }
  if (Number(tier.sold) > 0) {
    return {
      success: false,
      error: "No se puede eliminar: ya hay entradas vendidas.",
    }
  }

  const { error } = await createAdminClient()
    .from("ticket_tiers")
    .delete()
    .eq("id", input.tierId)
    .eq("event_id", input.eventId)

  if (error) return { success: false, error: formatSupabaseError(error) }
  revalidatePath(`/admin/events/${input.eventId}/tiers`)
  return { success: true }
}
