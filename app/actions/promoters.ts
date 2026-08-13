"use server"

import { createHash } from "crypto"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { normalizeReferralCode } from "@/lib/referral"

export type PromoterRow = {
  id: string
  name: string
  referralCode: string
  commissionRate: number
  /** Visitas / clics registrados con ?ref= */
  clickCount: number
  ticketsSold: number
  revenueGenerated: number
  estimatedCommission: number
  userId: string | null
}

export type PromoterMetrics = {
  id: string
  name: string
  referralCode: string
  commissionRate: number
  clickCount: number
  ticketsSold: number
  revenueGenerated: number
  estimatedCommission: number
  featuredEventId: string | null
}

type ActionResult =
  | { success: true; referralCode: string }
  | { success: false; error: string }

function slugifyReferralCode(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20)

  return base || "RRPP"
}

async function requireOrganizer() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error("auth_required")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (
    !profile ||
    (profile.role !== "admin" && profile.role !== "super_admin")
  ) {
    throw new Error("forbidden")
  }

  return { supabase, userId: user.id }
}

export async function createPromoter(input: {
  name: string
  /** Porcentaje UI: 10 = 10% → se guarda como 0.10 */
  commissionPercent: number
}): Promise<ActionResult> {
  try {
    const { supabase, userId } = await requireOrganizer()

    const name = input.name.trim()
    if (name.length < 2) {
      return { success: false, error: "El nombre debe tener al menos 2 caracteres." }
    }

    if (
      !Number.isFinite(input.commissionPercent) ||
      input.commissionPercent < 0 ||
      input.commissionPercent > 100
    ) {
      return {
        success: false,
        error: "La comisión debe estar entre 0 y 100%.",
      }
    }

    const commissionRate = Number((input.commissionPercent / 100).toFixed(4))
    const baseCode = slugifyReferralCode(name)

    let referralCode = baseCode
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate =
        attempt === 0
          ? baseCode
          : `${baseCode}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`

      const { data: existing } = await supabase
        .from("promoters")
        .select("id")
        .ilike("referral_code", candidate)
        .maybeSingle()

      if (!existing) {
        referralCode = candidate
        break
      }

      referralCode = candidate
    }

    const { error } = await supabase.from("promoters").insert({
      organizer_id: userId,
      user_id: null,
      name,
      commission_rate: commissionRate,
      referral_code: referralCode,
    })

    if (error) {
      if (error.code === "23505") {
        return {
          success: false,
          error: "Ese código de referido ya existe. Probá otro nombre.",
        }
      }
      return {
        success: false,
        error: error.message || "No se pudo crear el promotor.",
      }
    }

    revalidatePath("/admin/promoters")
    revalidatePath("/admin/team")

    return { success: true, referralCode }
  } catch (error) {
    if (error instanceof Error && error.message === "auth_required") {
      return { success: false, error: "Debés iniciar sesión." }
    }
    if (error instanceof Error && error.message === "forbidden") {
      return { success: false, error: "No tenés permiso para gestionar promotores y RRPP." }
    }
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al crear el promotor.",
    }
  }
}

export async function getOrganizerPromoters(): Promise<PromoterRow[]> {
  const { supabase, userId } = await requireOrganizer()

  const { data: promoters, error } = await supabase
    .from("promoters")
    .select("id, name, referral_code, commission_rate, user_id")
    .eq("organizer_id", userId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  if (!promoters || promoters.length === 0) return []

  const admin = createAdminClient()
  const promoterIds = promoters.map((row) => row.id)

  const [{ data: orders }, { data: visitRows }] = await Promise.all([
    admin
      .from("orders")
      .select("id, promoter_id, total_amount, subtotal, status")
      .in("promoter_id", promoterIds)
      .eq("status", "paid"),
    admin
      .from("promoter_referral_visits")
      .select("promoter_id")
      .in("promoter_id", promoterIds),
  ])

  const clickByPromoter = new Map<string, number>()
  for (const visit of visitRows ?? []) {
    clickByPromoter.set(
      visit.promoter_id,
      (clickByPromoter.get(visit.promoter_id) ?? 0) + 1,
    )
  }

  const orderIds = (orders ?? []).map((order) => order.id)
  const ticketsByOrder = new Map<string, number>()

  if (orderIds.length > 0) {
    const { data: tickets } = await admin
      .from("tickets")
      .select("order_id")
      .in("order_id", orderIds)

    for (const ticket of tickets ?? []) {
      if (!ticket.order_id) continue
      ticketsByOrder.set(
        ticket.order_id,
        (ticketsByOrder.get(ticket.order_id) ?? 0) + 1,
      )
    }
  }

  const stats = new Map<
    string,
    { ticketsSold: number; revenueGenerated: number }
  >()

  for (const order of orders ?? []) {
    if (!order.promoter_id) continue
    const current = stats.get(order.promoter_id) ?? {
      ticketsSold: 0,
      revenueGenerated: 0,
    }
    current.revenueGenerated += Number(
      order.subtotal ?? order.total_amount,
    )
    current.ticketsSold += ticketsByOrder.get(order.id) ?? 0
    stats.set(order.promoter_id, current)
  }

  return promoters.map((promoter) => {
    const metric = stats.get(promoter.id) ?? {
      ticketsSold: 0,
      revenueGenerated: 0,
    }
    const rate = Number(promoter.commission_rate)

    return {
      id: promoter.id,
      name: promoter.name,
      referralCode: promoter.referral_code,
      commissionRate: rate,
      clickCount: clickByPromoter.get(promoter.id) ?? 0,
      ticketsSold: metric.ticketsSold,
      revenueGenerated: metric.revenueGenerated,
      estimatedCommission: metric.revenueGenerated * rate,
      userId: promoter.user_id,
    }
  })
}

export async function getPromoterMetrics(
  promoterId?: string,
): Promise<PromoterMetrics | null> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error("auth_required")
  }

  let query = supabase
    .from("promoters")
    .select("id, name, referral_code, commission_rate, organizer_id, user_id")
    .limit(1)

  if (promoterId) {
    query = query.eq("id", promoterId)
  } else {
    query = query.eq("user_id", user.id)
  }

  const { data: promoter, error } = await query.maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!promoter) return null

  // Solo el promotor vinculado o su organizador pueden ver métricas.
  if (promoter.user_id !== user.id && promoter.organizer_id !== user.id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    if (profile?.role !== "super_admin") {
      throw new Error("forbidden")
    }
  }

  const admin = createAdminClient()

  const [{ data: orders }, { count: clickCount }] = await Promise.all([
    admin
      .from("orders")
      .select("id, total_amount, subtotal")
      .eq("promoter_id", promoter.id)
      .eq("status", "paid"),
    admin
      .from("promoter_referral_visits")
      .select("id", { count: "exact", head: true })
      .eq("promoter_id", promoter.id),
  ])

  const orderIds = (orders ?? []).map((order) => order.id)
  let ticketsSold = 0

  if (orderIds.length > 0) {
    const { count } = await admin
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .in("order_id", orderIds)

    ticketsSold = count ?? 0
  }

  const revenueGenerated = (orders ?? []).reduce(
    (sum, order) => sum + Number(order.subtotal ?? order.total_amount),
    0,
  )
  const commissionRate = Number(promoter.commission_rate)

  const { data: featuredEvent } = await admin
    .from("events")
    .select("id")
    .eq("organizer_id", promoter.organizer_id)
    .eq("status", "published")
    .order("date", { ascending: true })
    .limit(1)
    .maybeSingle()

  return {
    id: promoter.id,
    name: promoter.name,
    referralCode: promoter.referral_code,
    commissionRate,
    clickCount: clickCount ?? 0,
    ticketsSold,
    revenueGenerated,
    estimatedCommission: revenueGenerated * commissionRate,
    featuredEventId: featuredEvent?.id ?? null,
  }
}

export async function trackReferralVisit(input: {
  referralCode: string
  path?: string | null
  visitorKey?: string | null
  eventId?: string | null
}): Promise<{ success: boolean }> {
  try {
    const code = normalizeReferralCode(input.referralCode)
    if (!code) return { success: false }

    const admin = createAdminClient()
    const { data: promoter } = await admin
      .from("promoters")
      .select("id, referral_code")
      .ilike("referral_code", code)
      .maybeSingle()

    if (!promoter) return { success: false }

    const headerStore = await headers()
    const forwarded = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim()
    const ua = headerStore.get("user-agent") ?? ""
    const rawVisitor =
      input.visitorKey?.trim() ||
      `${forwarded ?? "anon"}|${ua.slice(0, 120)}`
    const visitorKey = createHash("sha256")
      .update(rawVisitor)
      .digest("hex")
      .slice(0, 32)

    // Dedupe: mismo visitante + mismo promotor en la última hora.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await admin
      .from("promoter_referral_visits")
      .select("id", { count: "exact", head: true })
      .eq("promoter_id", promoter.id)
      .eq("visitor_key", visitorKey)
      .gte("created_at", since)

    if ((count ?? 0) > 0) return { success: true }

    const path = input.path?.trim().slice(0, 500) || null
    let eventId: string | null = input.eventId?.trim() || null
    if (!eventId && path) {
      const match = path.match(/^\/events\/([0-9a-f-]{36})/i)
      if (match?.[1]) eventId = match[1]
    }

    await admin.from("promoter_referral_visits").insert({
      promoter_id: promoter.id,
      referral_code: promoter.referral_code,
      path,
      event_id: eventId,
      visitor_key: visitorKey,
    })

    return { success: true }
  } catch {
    return { success: false }
  }
}

export async function claimPromoterByCode(
  referralCode: string,
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: "Debés iniciar sesión." }
  }

  const code = referralCode.trim()
  if (!code) {
    return { success: false, error: "Ingresá un código de referido." }
  }

  const { data, error } = await supabase.rpc("claim_promoter_by_code", {
    p_code: code,
  })

  if (error) {
    return {
      success: false,
      error: error.message || "No se pudo vincular el código.",
    }
  }

  revalidatePath("/promoter/dashboard")

  return { success: true, referralCode: String(data ?? code).toUpperCase() }
}
