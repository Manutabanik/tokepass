"use server"

import { createHash } from "crypto"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { normalizeReferralCode } from "@/lib/referral"
import { computePromoterCommission, pendingPromoterBalance } from "@/lib/rrpp"

export type PromoterCommissionKind = "percent" | "fixed"

export type PromoterRow = {
  id: string
  name: string
  referralCode: string
  commissionRate: number
  commissionType: PromoterCommissionKind
  commissionFixedAmount: number
  /** Visitas / clics registrados con ?rrpp= o ?ref= */
  clickCount: number
  ticketsSold: number
  revenueGenerated: number
  estimatedCommission: number
  settledCommission: number
  pendingCommission: number
  lastSettledAt: string | null
  userId: string | null
}

export type PromoterOption = {
  id: string
  name: string
  referralCode: string
}

export type CheckoutPromoterPreview = {
  name: string
  referralCode: string
}

export type PromoterMetrics = {
  id: string
  name: string
  referralCode: string
  commissionRate: number
  commissionType: PromoterCommissionKind
  commissionFixedAmount: number
  clickCount: number
  ticketsSold: number
  revenueGenerated: number
  estimatedCommission: number
  featuredEventId: string | null
  featuredEventSlug: string | null
}

type ActionResult =
  | { success: true; referralCode: string }
  | { success: false; error: string }

type SettleResult =
  | { success: true; amount: number; settledAt: string }
  | { success: false; error: string }

type PreviewResult =
  | { success: true; data: CheckoutPromoterPreview }
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
  commissionPercent?: number
  commissionType?: PromoterCommissionKind
  /** Monto fijo por entrada cuando commissionType = fixed */
  commissionFixedAmount?: number
}): Promise<ActionResult> {
  try {
    const { supabase, userId } = await requireOrganizer()

    const name = input.name.trim()
    if (name.length < 2) {
      return { success: false, error: "El nombre debe tener al menos 2 caracteres." }
    }

    const commissionType: PromoterCommissionKind =
      input.commissionType === "fixed" ? "fixed" : "percent"
    const commissionPercent = Number(input.commissionPercent ?? 0)
    const commissionFixedAmount = Number(input.commissionFixedAmount ?? 0)

    if (commissionType === "percent") {
      if (
        !Number.isFinite(commissionPercent) ||
        commissionPercent < 0 ||
        commissionPercent > 100
      ) {
        return {
          success: false,
          error: "La comisión porcentual debe estar entre 0 y 100%.",
        }
      }
    } else if (
      !Number.isFinite(commissionFixedAmount) ||
      commissionFixedAmount < 0
    ) {
      return {
        success: false,
        error: "El monto fijo por entrada debe ser mayor o igual a 0.",
      }
    }

    const commissionRate = Number((commissionPercent / 100).toFixed(4))
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

    const payload = {
      organizer_id: userId,
      user_id: null,
      name,
      commission_rate: commissionType === "percent" ? commissionRate : 0,
      commission_type: commissionType,
      commission_fixed_amount:
        commissionType === "fixed" ? commissionFixedAmount : null,
      referral_code: referralCode,
    }

    let { error } = await supabase.from("promoters").insert(payload)
    if (error && /commission_type|commission_fixed/i.test(error.message)) {
      const fallback = await supabase.from("promoters").insert({
        organizer_id: userId,
        user_id: null,
        name,
        commission_rate: commissionType === "percent" ? commissionRate : 0,
        referral_code: referralCode,
      })
      error = fallback.error
    }

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
    revalidatePath("/rrpp")

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

export async function listOrganizerPromoterOptions(
  organizerId?: string,
): Promise<PromoterOption[]> {
  try {
    const { supabase, userId } = await requireOrganizer()
    let target = userId
    if (organizerId && organizerId !== userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle()
      if (profile?.role === "super_admin") target = organizerId
    }
    const { data, error } = await supabase
      .from("promoters")
      .select("id, name, referral_code")
      .eq("organizer_id", target)
      .order("name", { ascending: true })

    if (error || !data) return []

    return data.map((row) => ({
      id: row.id,
      name: row.name,
      referralCode: row.referral_code,
    }))
  } catch {
    return []
  }
}

export async function validateCheckoutPromoterCode(
  code: string,
  eventId: string,
): Promise<PreviewResult> {
  try {
    const referralCode = normalizeReferralCode(code)
    if (!referralCode || !eventId) {
      return { success: false, error: "Ingresá un código de promotor válido." }
    }

    const supabase = await createClient()
    const { data: resolved, error } = await supabase.rpc(
      "resolve_promoter_for_checkout",
      {
        p_referral_code: referralCode,
        p_event_id: eventId,
      },
    )

    if (error) {
      return { success: false, error: "No se pudo validar el código." }
    }
    if (!resolved) {
      return {
        success: false,
        error: "Código de promotor no válido para este evento.",
      }
    }

    const admin = createAdminClient()
    const { data: promoter } = await admin
      .from("promoters")
      .select("name, referral_code")
      .eq("id", resolved)
      .maybeSingle()

    if (!promoter) {
      return {
        success: false,
        error: "Código de promotor no válido para este evento.",
      }
    }

    return {
      success: true,
      data: {
        name: promoter.name,
        referralCode: promoter.referral_code,
      },
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo validar el código de promotor.",
    }
  }
}

export async function getOrganizerPromoters(): Promise<PromoterRow[]> {
  const { supabase, userId } = await requireOrganizer()

  const { data: promotersRaw, error } = await supabase
    .from("promoters")
    .select(
      "id, name, referral_code, commission_rate, commission_type, commission_fixed_amount, user_id",
    )
    .eq("organizer_id", userId)
    .order("created_at", { ascending: false })

  const promoters =
    error && /commission_type|commission_fixed/i.test(error.message)
      ? (
          await supabase
            .from("promoters")
            .select("id, name, referral_code, commission_rate, user_id")
            .eq("organizer_id", userId)
            .order("created_at", { ascending: false })
        ).data
      : promotersRaw

  if (error && !promoters) {
    throw new Error(error.message)
  }

  if (!promoters || promoters.length === 0) return []

  const admin = createAdminClient()
  const promoterIds = promoters.map((row) => row.id)

  const [{ data: orders }, { data: visitRows }, settlementsResult] =
    await Promise.all([
      admin
        .from("orders")
        .select(
          "id, promoter_id, total_amount, subtotal, status, promoter_commission_amount",
        )
        .in("promoter_id", promoterIds)
        .eq("status", "paid"),
      admin
        .from("promoter_referral_visits")
        .select("promoter_id")
        .in("promoter_id", promoterIds),
      admin
        .from("promoter_settlements")
        .select("promoter_id, amount, settled_at")
        .in("promoter_id", promoterIds),
    ])

  const settlements =
    settlementsResult.error &&
    /promoter_settlements|schema cache|does not exist/i.test(
      settlementsResult.error.message,
    )
      ? []
      : (settlementsResult.data ?? [])

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
    { ticketsSold: number; revenueGenerated: number; commission: number }
  >()

  const promoterById = new Map(
    promoters.map((row) => [
      row.id,
      {
        type:
          (row as { commission_type?: string }).commission_type === "fixed"
            ? ("fixed" as const)
            : ("percent" as const),
        rate: Number(row.commission_rate),
        fixed: Number(
          (row as { commission_fixed_amount?: number | null })
            .commission_fixed_amount ?? 0,
        ),
      },
    ]),
  )

  for (const order of orders ?? []) {
    if (!order.promoter_id) continue
    const current = stats.get(order.promoter_id) ?? {
      ticketsSold: 0,
      revenueGenerated: 0,
      commission: 0,
    }
    const tickets = ticketsByOrder.get(order.id) ?? 0
    const revenue = Number(order.subtotal ?? order.total_amount)
    current.revenueGenerated += revenue
    current.ticketsSold += tickets
    const snap = Number(
      (order as { promoter_commission_amount?: number | null })
        .promoter_commission_amount,
    )
    if (Number.isFinite(snap) && snap >= 0) {
      current.commission += snap
    } else {
      const rule = promoterById.get(order.promoter_id)
      current.commission += computePromoterCommission({
        type: rule?.type ?? "percent",
        rate: rule?.rate ?? 0,
        fixedAmount: rule?.fixed ?? 0,
        subtotal: revenue,
        ticketCount: tickets,
      })
    }
    stats.set(order.promoter_id, current)
  }

  const settledByPromoter = new Map<
    string,
    { amount: number; lastAt: string | null }
  >()
  for (const row of settlements) {
    const current = settledByPromoter.get(row.promoter_id) ?? {
      amount: 0,
      lastAt: null as string | null,
    }
    current.amount += Number(row.amount) || 0
    if (!current.lastAt || row.settled_at > current.lastAt) {
      current.lastAt = row.settled_at
    }
    settledByPromoter.set(row.promoter_id, current)
  }

  return promoters.map((promoter) => {
    const metric = stats.get(promoter.id) ?? {
      ticketsSold: 0,
      revenueGenerated: 0,
      commission: 0,
    }
    const rate = Number(promoter.commission_rate)
    const type =
      (promoter as { commission_type?: string }).commission_type === "fixed"
        ? ("fixed" as const)
        : ("percent" as const)
    const fixed = Number(
      (promoter as { commission_fixed_amount?: number | null })
        .commission_fixed_amount ?? 0,
    )
    const settled = settledByPromoter.get(promoter.id)
    const settledCommission = Number(settled?.amount ?? 0)

    return {
      id: promoter.id,
      name: promoter.name,
      referralCode: promoter.referral_code,
      commissionRate: rate,
      commissionType: type,
      commissionFixedAmount: fixed,
      clickCount: clickByPromoter.get(promoter.id) ?? 0,
      ticketsSold: metric.ticketsSold,
      revenueGenerated: metric.revenueGenerated,
      estimatedCommission: metric.commission,
      settledCommission,
      pendingCommission: pendingPromoterBalance(
        metric.commission,
        settledCommission,
      ),
      lastSettledAt: settled?.lastAt ?? null,
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
    .select(
      "id, name, referral_code, commission_rate, commission_type, commission_fixed_amount, organizer_id, user_id",
    )
    .limit(1)

  if (promoterId) {
    query = query.eq("id", promoterId)
  } else {
    query = query.eq("user_id", user.id)
  }

  const { data: promoter, error } = await query.maybeSingle()

  if (error && /commission_type|commission_fixed/i.test(error.message)) {
    let fallback = supabase
      .from("promoters")
      .select("id, name, referral_code, commission_rate, organizer_id, user_id")
      .limit(1)
    fallback = promoterId
      ? fallback.eq("id", promoterId)
      : fallback.eq("user_id", user.id)
    const retry = await fallback.maybeSingle()
    if (retry.error) throw new Error(retry.error.message)
    if (!retry.data) return null
    return getPromoterMetricsFromRow(retry.data, user.id)
  }

  if (error) {
    throw new Error(error.message)
  }

  if (!promoter) return null

  return getPromoterMetricsFromRow(promoter, user.id)
}

async function getPromoterMetricsFromRow(
  promoter: {
    id: string
    name: string
    referral_code: string
    commission_rate: number
    organizer_id: string
    user_id: string | null
    commission_type?: string | null
    commission_fixed_amount?: number | null
  },
  userId: string,
): Promise<PromoterMetrics | null> {
  const supabase = await createClient()

  if (promoter.user_id !== userId && promoter.organizer_id !== userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle()

    if (profile?.role !== "super_admin") {
      throw new Error("forbidden")
    }
  }

  const admin = createAdminClient()

  const [{ data: orders }, { count: clickCount }] = await Promise.all([
    admin
      .from("orders")
      .select("id, total_amount, subtotal, promoter_commission_amount")
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
  const commissionType =
    (promoter as { commission_type?: string }).commission_type === "fixed"
      ? ("fixed" as const)
      : ("percent" as const)
  const commissionFixedAmount = Number(
    (promoter as { commission_fixed_amount?: number | null })
      .commission_fixed_amount ?? 0,
  )

  const snapshots = (orders ?? []).map((order) =>
    (order as { promoter_commission_amount?: number | null })
      .promoter_commission_amount,
  )
  const allSnapped =
    snapshots.length > 0 && snapshots.every((value) => value != null)
  const estimatedCommission = allSnapped
    ? snapshots.reduce((sum, value) => sum + Number(value), 0)
    : computePromoterCommission({
        type: commissionType,
        rate: commissionRate,
        fixedAmount: commissionFixedAmount,
        subtotal: revenueGenerated,
        ticketCount: ticketsSold,
      })

  const { data: featuredEvent } = await admin
    .from("events")
    .select("id, slug")
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
    commissionType,
    commissionFixedAmount,
    clickCount: clickCount ?? 0,
    ticketsSold,
    revenueGenerated,
    estimatedCommission,
    featuredEventId: featuredEvent?.id ?? null,
    featuredEventSlug: featuredEvent?.slug ?? null,
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

export async function settlePromoterCommissions(
  promoterId: string,
): Promise<SettleResult> {
  try {
    const { supabase, userId } = await requireOrganizer()
    const id = promoterId.trim()
    if (!id) {
      return { success: false, error: "Promotor inválido." }
    }

    const { data: promoter, error: promoterError } = await supabase
      .from("promoters")
      .select("id, organizer_id, name")
      .eq("id", id)
      .eq("organizer_id", userId)
      .maybeSingle()

    if (promoterError || !promoter) {
      return { success: false, error: "Promotor no encontrado." }
    }

    const rows = await getOrganizerPromoters()
    const row = rows.find((item) => item.id === promoter.id)
    const amount = Number(row?.pendingCommission ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      return { success: false, error: "No hay saldo pendiente para liquidar." }
    }

    const { data, error } = await supabase
      .from("promoter_settlements")
      .insert({
        organizer_id: userId,
        promoter_id: promoter.id,
        amount,
        created_by: userId,
      })
      .select("amount, settled_at")
      .single()

    if (error || !data) {
      return {
        success: false,
        error:
          error && /promoter_settlements|schema cache|does not exist/i.test(error.message)
            ? "Aplicá la migración P109 para liquidar comisiones."
            : (error?.message ?? "No se pudo registrar la liquidación."),
      }
    }

    revalidatePath("/admin/promoters")
    return {
      success: true,
      amount: Number(data.amount),
      settledAt: data.settled_at,
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message === "auth_required"
            ? "Debés iniciar sesión."
            : error.message === "forbidden"
              ? "No tenés permiso para liquidar comisiones."
              : error.message
          : "No se pudo liquidar el saldo.",
    }
  }
}
