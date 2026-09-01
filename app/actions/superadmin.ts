"use server"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { SuperAdminForbiddenError } from "@/lib/superadmin-errors"
import type { OrganizerApprovalStatus, OrderStatus, OrganizerGuaranteeStatus, OrganizerRiskTier } from "@/types/database"

/**
 * Valida sesión + rol `super_admin` y entrega el client service-role
 * (bypass RLS) para métricas globales.
 */
async function requireSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new SuperAdminForbiddenError("Debés iniciar sesión.")
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError || profile?.role !== "super_admin") {
    throw new SuperAdminForbiddenError()
  }

  return { admin: createAdminClient(), actorId: user.id }
}
export type GlobalMetrics = {
  /** Alias de la spec: total_gmV */
  total_gmV: number
  totalGmv: number
  /** Suma de service_charge en órdenes paid */
  platform_revenue: number
  total_tickets: number
  active_organizers: number
}

export type OrganizerPlatformRow = {
  id: string
  name: string
  email: string
  activeEvents: number
  billedVolume: number
}

/**
 * GMV global, tickets emitidos y productoras activas.
 * Todas las lecturas usan `createAdminClient` (service role).
 */
export async function getGlobalMetrics(): Promise<GlobalMetrics> {
  const { admin } = await requireSuperAdmin()
  const { data, error } = await admin.rpc("get_platform_global_metrics")
  if (error) throw new Error(`No se pudieron calcular métricas: ${error.message}`)

  const metrics = data?.[0]
  const totalGmv = Number(metrics?.total_gmv ?? 0)

  return {
    total_gmV: totalGmv,
    totalGmv,
    platform_revenue: Number(metrics?.platform_revenue ?? 0),
    total_tickets: Number(metrics?.total_tickets ?? 0),
    active_organizers: Number(metrics?.active_organizers ?? 0),
  }
}

/**
 * Lista productoras (role=admin) con eventos activos y volumen facturado (órdenes paid).
 */
export async function getAllOrganizers(): Promise<OrganizerPlatformRow[]> {
  const { admin } = await requireSuperAdmin()

  const [
    { data: organizers, error: organizersError },
    { data: events, error: eventsError },
    { data: paidOrders, error: ordersError },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("role", "admin")
      .order("full_name", { ascending: true }),
    admin.from("events").select("id, organizer_id, status, is_deleted"),
    admin.from("orders").select("id, total_amount, subtotal").eq("status", "paid"),
  ])

  if (organizersError) {
    throw new Error(organizersError.message)
  }
  if (eventsError) {
    throw new Error(eventsError.message)
  }
  if (ordersError) {
    throw new Error(ordersError.message)
  }

  const eventOrganizer = new Map<string, string>()
  const activeEventsByOrganizer = new Map<string, number>()

  for (const event of events ?? []) {
    if ("is_deleted" in event && event.is_deleted) continue
    eventOrganizer.set(event.id, event.organizer_id)
    if (
      event.status === "published" ||
      event.status === "draft" ||
      event.status === "pending_approval" ||
      event.status === "needs_revision"
    ) {
      activeEventsByOrganizer.set(
        event.organizer_id,
        (activeEventsByOrganizer.get(event.organizer_id) ?? 0) + 1,
      )
    }
  }

  const orderIds = (paidOrders ?? []).map((order) => order.id)
  const billedByOrganizer = new Map<string, number>()

  if (orderIds.length > 0) {
    const { data: tickets, error: ticketsError } = await admin
      .from("tickets")
      .select("order_id, event_id")
      .in("order_id", orderIds)

    if (ticketsError) {
      throw new Error(ticketsError.message)
    }

    const orderOrganizer = new Map<string, string>()
    for (const ticket of tickets ?? []) {
      if (!ticket.order_id || orderOrganizer.has(ticket.order_id)) continue
      const organizerId = eventOrganizer.get(ticket.event_id)
      if (organizerId) {
        orderOrganizer.set(ticket.order_id, organizerId)
      }
    }

    for (const order of paidOrders ?? []) {
      const organizerId = orderOrganizer.get(order.id)
      if (!organizerId) continue
      billedByOrganizer.set(
        organizerId,
        (billedByOrganizer.get(organizerId) ?? 0) +
          Number(order.subtotal ?? order.total_amount),
      )
    }
  }

  return (organizers ?? []).map((organizer) => ({
    id: organizer.id,
    name: organizer.full_name?.trim() || "Sin nombre",
    email: organizer.email,
    activeEvents: activeEventsByOrganizer.get(organizer.id) ?? 0,
    billedVolume: billedByOrganizer.get(organizer.id) ?? 0,
  }))
}

/** Resuelve el nombre de una productora (solo super_admin). */
export async function getOrganizerLabel(
  organizerId: string,
): Promise<{ id: string; name: string; email: string } | null> {
  const { admin } = await requireSuperAdmin()

  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", organizerId)
    .maybeSingle()

  if (error || !data) return null
  if (data.role !== "admin" && data.role !== "super_admin") return null

  return {
    id: data.id,
    name: data.full_name?.trim() || data.email,
    email: data.email,
  }
}

export type PlatformSettlementRow = {
  id: string
  organizerId: string
  organizerName: string
  organizerEmail: string
  grossAmount: number
  platformFee: number
  netAmount: number
  status: "pending" | "completed"
  periodLabel: string | null
  notes: string | null
  completedAt: string | null
  createdAt: string
}

export async function listPlatformSettlements(): Promise<PlatformSettlementRow[]> {
  const { admin } = await requireSuperAdmin()

  const { data: rows, error } = await admin
    .from("organizer_settlements")
    .select(
      "id, organizer_id, gross_amount, platform_fee, net_amount, status, period_label, notes, completed_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) throw new Error(error.message)

  type SettlementRow = {
    id: string
    organizer_id: string
    gross_amount: number
    platform_fee: number
    net_amount: number
    status: string
    period_label: string | null
    notes: string | null
    completed_at: string | null
    created_at: string
  }

  const settlements = (rows ?? []) as unknown as SettlementRow[]

  const organizerIds = [...new Set(settlements.map((r) => r.organizer_id))]
  const { data: profiles } =
    organizerIds.length > 0
      ? await admin
          .from("profiles")
          .select("id, full_name, email")
          .in("id", organizerIds)
      : { data: [] as { id: string; full_name: string | null; email: string }[] }

  const byId = new Map(
    (profiles ?? []).map((p) => [
      p.id,
      {
        name: p.full_name?.trim() || p.email,
        email: p.email,
      },
    ]),
  )

  return settlements.map((row) => {
    const profile = byId.get(row.organizer_id)
    return {
      id: row.id,
      organizerId: row.organizer_id,
      organizerName: profile?.name ?? "Organizador",
      organizerEmail: profile?.email ?? "",
      grossAmount: Number(row.gross_amount),
      platformFee: Number(row.platform_fee),
      netAmount: Number(row.net_amount),
      status: row.status === "completed" ? "completed" : "pending",
      periodLabel: row.period_label,
      notes: row.notes,
      completedAt: row.completed_at,
      createdAt: String(row.created_at),
    }
  })
}

export async function completeSettlement(
  settlementId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { admin } = await requireSuperAdmin()
    const { error } = await admin.rpc("complete_organizer_settlement", {
      p_settlement_id: settlementId,
    })
    if (error) return { success: false, error: error.message }
    revalidatePath("/superadmin")
    revalidatePath("/superadmin/settlements")
    revalidatePath("/admin/finances")
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al completar.",
    }
  }
}

export type OrganizerGovernanceStatus = Extract<
  OrganizerApprovalStatus,
  "approved" | "rejected" | "suspended"
>

export type OrganizerGovernanceResult =
  | { success: true }
  | { success: false; error: string }

export type OrganizationDetails = {
  profile: {
    id: string
    name: string
    email: string
    status: OrganizerApprovalStatus
    /** Comisión canónica (custom_commission_rate). */
    serviceChargeRate: number
    riskTier: OrganizerRiskTier
    guaranteeStatus: OrganizerGuaranteeStatus
    mpUserId: string | null
    hasMpAccessToken: boolean
    joinedAt: string
  }
  metrics: {
    totalEvents: number
    publishedEvents: number
    ticketsSold: number
    historicalGmv: number
    pendingSettlementCount: number
    pendingSettlementAmount: number
  }
  pendingSettlements: Array<{
    id: string
    periodLabel: string | null
    grossAmount: number
    platformFee: number
    netAmount: number
    createdAt: string
  }>
}

function revalidateOrganizerGovernancePaths(organizerId: string) {
  revalidatePath("/superadmin")
  revalidatePath("/superadmin/organizations")
  revalidatePath(`/superadmin/organizations/${organizerId}`)
  revalidatePath("/admin")
  revalidatePath("/admin/events")
  revalidatePath("/events")
  revalidatePath("/")
}

async function ensureOrganizerProfile(
  admin: ReturnType<typeof createAdminClient>,
  organizerId: string,
) {
  const id = organizerId.trim()
  if (!id) return { id: null, error: "ID de productora inválido." } as const

  const { data, error } = await admin
    .from("profiles")
    .select("id, role, organizer_approval_status")
    .eq("id", id)
    .maybeSingle()

  const isOrganizerProfile =
    data?.role !== "super_admin" &&
    (data?.role === "admin" || data?.organizer_approval_status !== "none")
  if (error || !data || !isOrganizerProfile) {
    return {
      id: null,
      error: "La productora no existe o no tiene rol de organizador.",
    } as const
  }

  return { id: data.id, error: null } as const
}

export async function updateOrganizerFeeRate(
  organizerId: string,
  newRate: number,
): Promise<OrganizerGovernanceResult> {
  try {
    const { admin, actorId } = await requireSuperAdmin()
    const organizer = await ensureOrganizerProfile(admin, organizerId)
    if (organizer.error) {
      return { success: false, error: organizer.error }
    }

    if (!Number.isFinite(newRate) || newRate < 0 || newRate > 0.95) {
      return {
        success: false,
        error: "La comisión debe estar entre 0% y 95%.",
      }
    }

    const normalizedRate = Math.round(newRate * 10_000) / 10_000
    const { error } = await admin.rpc("update_organizer_governance_tx", {
      p_organizer_id: organizer.id,
      p_actor_id: actorId,
      p_status: null,
      p_service_charge_rate: normalizedRate,
    })

    if (error) {
      return {
        success: false,
        error: `No se pudo actualizar la comisión: ${error.message}`,
      }
    }

    revalidateOrganizerGovernancePaths(organizer.id)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la comisión.",
    }
  }
}

export async function updateOrganizerApprovalStatus(
  organizerId: string,
  status: OrganizerGovernanceStatus,
): Promise<OrganizerGovernanceResult> {
  try {
    const { admin, actorId } = await requireSuperAdmin()
    const organizer = await ensureOrganizerProfile(admin, organizerId)
    if (organizer.error) {
      return { success: false, error: organizer.error }
    }

    const allowedStatuses: OrganizerGovernanceStatus[] = [
      "approved",
      "rejected",
      "suspended",
    ]
    if (!allowedStatuses.includes(status)) {
      return { success: false, error: "Estado de productora inválido." }
    }

    const { error } = await admin.rpc("update_organizer_governance_tx", {
      p_organizer_id: organizer.id,
      p_actor_id: actorId,
      p_status: status,
      p_service_charge_rate: null,
    })

    if (error) {
      return {
        success: false,
        error: `No se pudo actualizar el estado: ${error.message}`,
      }
    }

    revalidateOrganizerGovernancePaths(organizer.id)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el estado.",
    }
  }
}

export async function getOrganizationDetails(
  organizerId: string,
): Promise<OrganizationDetails | null> {
  const { admin } = await requireSuperAdmin()
  const id = organizerId.trim()
  if (!id) return null

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select(
      "id, full_name, email, role, organizer_approval_status, service_charge_rate, risk_tier, guarantee_status, created_at",
    )
    .eq("id", id)
    .maybeSingle()

  if (profileError) throw new Error(profileError.message)
  // SuperAdmin puede abrir cualquier perfil linkeado; no devolvemos 404 por rol.
  if (!profile) return null

  const [
    metricsResult,
    settlementsResult,
    mpConnectResult,
  ] = await Promise.all([
    admin.rpc("get_organizer_governance_metrics", {
      p_organizer_id: profile.id,
    }),
    admin
      .from("organizer_settlements")
      .select(
        "id, gross_amount, platform_fee, net_amount, period_label, created_at",
      )
      .eq("organizer_id", profile.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    admin
      .from("organizer_mp_connect")
      .select("mp_user_id, access_token, status")
      .eq("organizer_id", profile.id)
      .maybeSingle(),
  ])

  // No tumbar la página si un RPC auxiliar falta: devolvemos ceros.
  const metrics = metricsResult.data?.[0]
  const settlementRows = settlementsResult.data ?? []
  const mpConnect = mpConnectResult.data

  return {
    profile: {
      id: profile.id,
      name: profile.full_name?.trim() || profile.email || "Sin nombre",
      email: profile.email,
      status: profile.organizer_approval_status,
      serviceChargeRate: Number(profile.service_charge_rate ?? 0.15),
      riskTier:
        (profile.risk_tier as OrganizerRiskTier | null) ?? "TIER_1_CUSTODY",
      guaranteeStatus:
        (profile.guarantee_status as OrganizerGuaranteeStatus | null) ??
        "NONE",
      mpUserId: mpConnect?.mp_user_id ?? null,
      hasMpAccessToken: Boolean(mpConnect?.access_token),
      joinedAt: profile.created_at,
    },
    metrics: {
      totalEvents: Number(metrics?.total_events ?? 0),
      publishedEvents: Number(metrics?.published_events ?? 0),
      ticketsSold: Number(metrics?.tickets_sold ?? 0),
      historicalGmv: Number(metrics?.historical_gmv ?? 0),
      pendingSettlementCount: settlementRows.length,
      pendingSettlementAmount: settlementRows.reduce(
        (sum, settlement) => sum + Number(settlement.net_amount),
        0,
      ),
    },
    pendingSettlements: settlementRows.map((settlement) => ({
      id: settlement.id,
      periodLabel: settlement.period_label,
      grossAmount: Number(settlement.gross_amount),
      platformFee: Number(settlement.platform_fee),
      netAmount: Number(settlement.net_amount),
      createdAt: settlement.created_at,
    })),
  }
}

export type OrganizerRiskMatrixInput = {
  riskTier: OrganizerRiskTier
  guaranteeStatus: OrganizerGuaranteeStatus
  /** Comisión decimal (0.15 = 15%). Alias de custom_commission_rate. */
  customCommissionRate: number
  mpUserId: string | null
  /** Si se envía string vacío y clearMpAccessToken=false, no se toca. */
  mpAccessToken?: string | null
  clearMpAccessToken?: boolean
}

export async function updateOrganizerRiskMatrix(
  organizerId: string,
  input: OrganizerRiskMatrixInput,
): Promise<OrganizerGovernanceResult> {
  try {
    const { admin, actorId } = await requireSuperAdmin()
    const organizer = await ensureOrganizerProfile(admin, organizerId)
    if (organizer.error) {
      return { success: false, error: organizer.error }
    }

    const allowedTiers: OrganizerRiskTier[] = [
      "TIER_1_CUSTODY",
      "TIER_2_INSTANT_SPLIT",
      "TIER_3_ENTERPRISE",
    ]
    const allowedGuarantees: OrganizerGuaranteeStatus[] = [
      "NONE",
      "PROMISSORY_NOTE_SIGNED",
      "INSURANCE_BOND_ACTIVE",
    ]

    if (!allowedTiers.includes(input.riskTier)) {
      return { success: false, error: "Nivel de riesgo inválido." }
    }
    if (!allowedGuarantees.includes(input.guaranteeStatus)) {
      return { success: false, error: "Estado de garantía inválido." }
    }
    if (
      !Number.isFinite(input.customCommissionRate) ||
      input.customCommissionRate < 0 ||
      input.customCommissionRate > 0.95
    ) {
      return {
        success: false,
        error: "La comisión debe estar entre 0% y 95%.",
      }
    }

    const normalizedRate =
      Math.round(input.customCommissionRate * 10_000) / 10_000

    const { error } = await admin.rpc("update_organizer_risk_matrix_tx", {
      p_organizer_id: organizer.id,
      p_actor_id: actorId,
      p_risk_tier: input.riskTier,
      p_guarantee_status: input.guaranteeStatus,
      p_service_charge_rate: normalizedRate,
      p_mp_user_id: input.mpUserId,
      p_mp_access_token: input.mpAccessToken ?? null,
      p_clear_mp_access_token: Boolean(input.clearMpAccessToken),
    })

    if (error) {
      return {
        success: false,
        error: `No se pudo actualizar la matriz de riesgo: ${error.message}`,
      }
    }

    revalidateOrganizerGovernancePaths(organizer.id)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la matriz de riesgo.",
    }
  }
}

export type PlatformLedgerOrder = {
  orderId: string
  createdAt: string
  status: OrderStatus
  paymentMethod: string
  mpPaymentId: string | null
  eventId: string | null
  eventTitle: string
  organizerId: string | null
  organizerName: string
  buyerId: string
  buyerName: string
  buyerEmail: string
  grossAmount: number
  platformFeeAmount: number
  organizerNetAmount: number
  feeRate: number
}

export type PlatformLedgerTotals = {
  gross: number
  platformFee: number
  organizerNet: number
  count: number
  paidCount: number
}

export type PlatformLedgerFilters = {
  organizerId?: string | null
  eventId?: string | null
  status?: OrderStatus | "all" | null
  limit?: number
}

export type PlatformLedgerFilterOption = {
  id: string
  label: string
}

export type PlatformMoneyLedger = {
  rows: PlatformLedgerOrder[]
  totals: PlatformLedgerTotals
  filterOptions: {
    organizers: PlatformLedgerFilterOption[]
    events: PlatformLedgerFilterOption[]
  }
}

function emptyLedgerTotals(): PlatformLedgerTotals {
  return {
    gross: 0,
    platformFee: 0,
    organizerNet: 0,
    count: 0,
    paidCount: 0,
  }
}

export async function getPlatformMoneyLedger(
  filters: PlatformLedgerFilters = {},
): Promise<PlatformMoneyLedger> {
  const { admin } = await requireSuperAdmin()

  const status =
    filters.status && filters.status !== "all" ? filters.status : null
  const organizerId = filters.organizerId?.trim() || null
  const eventId = filters.eventId?.trim() || null
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500)

  const [
    { data, error },
    { data: totalsRows, error: totalsError },
    { data: organizers, error: organizersError },
    { data: events, error: eventsError },
  ] =
    await Promise.all([
      admin.rpc("get_platform_orders_ledger", {
        p_organizer_id: organizerId,
        p_event_id: eventId,
        p_status: status,
        p_limit: limit,
      }),
      admin.rpc("get_platform_orders_ledger_totals", {
        p_organizer_id: organizerId,
        p_event_id: eventId,
        p_status: status,
      }),
      admin
        .from("profiles")
        .select("id, full_name, email")
        .eq("role", "admin")
        .order("full_name", { ascending: true }),
      admin
        .from("events")
        .select("id, title, organizer_id")
        .order("date", { ascending: false })
        .limit(300),
    ])

  if (error) {
    throw new Error(`No se pudo cargar el ledger: ${error.message}`)
  }
  if (totalsError) {
    throw new Error(`No se pudieron cargar los totales: ${totalsError.message}`)
  }
  if (organizersError) {
    throw new Error(organizersError.message)
  }
  if (eventsError) {
    throw new Error(eventsError.message)
  }

  type LedgerRpcRow = {
    order_id: string
    created_at: string
    status: string
    payment_method: string
    mp_payment_id: string | null
    event_id: string | null
    event_title: string
    organizer_id: string | null
    organizer_name: string
    buyer_id: string
    buyer_name: string
    buyer_email: string
    gross_amount: number
    platform_fee_amount: number
    organizer_net_amount: number
    fee_rate: number
  }

  const rows: PlatformLedgerOrder[] = ((data ?? []) as LedgerRpcRow[])
    .map((row) => ({
      orderId: row.order_id,
      createdAt: row.created_at,
      status: ([
        "pending",
        "paid",
        "failed",
        "expired",
        "refunded",
        "refund_processing",
      ].includes(row.status)
        ? row.status
        : "pending") as OrderStatus,
      paymentMethod: row.mp_payment_id?.startsWith("free:")
        ? "free"
        : row.payment_method,
      mpPaymentId: row.mp_payment_id,
      eventId: row.event_id,
      eventTitle: row.event_title,
      organizerId: row.organizer_id,
      organizerName: row.organizer_name,
      buyerId: row.buyer_id,
      buyerName: row.buyer_name,
      buyerEmail: row.buyer_email,
      grossAmount: Number(row.gross_amount),
      platformFeeAmount: Number(row.platform_fee_amount),
      organizerNetAmount: Number(row.organizer_net_amount),
      feeRate: Number(row.fee_rate),
    }))
    .slice(0, limit)

  const eventOptions = (events ?? [])
    .filter((event) => !organizerId || event.organizer_id === organizerId)
    .map((event) => ({
      id: event.id,
      label: event.title,
    }))

  const aggregate = totalsRows?.[0]

  return {
    rows,
    totals: aggregate
      ? {
          gross: Number(aggregate.gross),
          platformFee: Number(aggregate.platform_fee),
          organizerNet: Number(aggregate.organizer_net),
          count: Number(aggregate.order_count),
          paidCount: Number(aggregate.paid_count),
        }
      : emptyLedgerTotals(),
    filterOptions: {
      organizers: (organizers ?? []).map((organizer) => ({
        id: organizer.id,
        label: organizer.full_name?.trim() || organizer.email,
      })),
      events: eventOptions,
    },
  }
}
