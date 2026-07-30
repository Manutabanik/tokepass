"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { SuperAdminForbiddenError } from "@/lib/superadmin-errors"

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

  const [
    { data: paidOrders, error: ordersError },
    { count: ticketsCount, error: ticketsError },
    { count: organizersCount, error: organizersError },
  ] = await Promise.all([
    admin
      .from("orders")
      .select("total_amount, service_charge")
      .eq("status", "paid"),
    admin
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .in("status", ["valid", "used", "scanned"]),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin"),
  ])

  if (ordersError) {
    throw new Error(`No se pudo calcular GMV: ${ordersError.message}`)
  }
  if (ticketsError) {
    throw new Error(`No se pudieron contar tickets: ${ticketsError.message}`)
  }
  if (organizersError) {
    throw new Error(
      `No se pudieron contar productoras: ${organizersError.message}`,
    )
  }

  let totalGmv = 0
  let platformRevenue = 0
  for (const order of paidOrders ?? []) {
    totalGmv += Number(order.total_amount)
    platformRevenue += Number(order.service_charge ?? 0)
  }

  return {
    total_gmV: totalGmv,
    totalGmv,
    platform_revenue: platformRevenue,
    total_tickets: ticketsCount ?? 0,
    active_organizers: organizersCount ?? 0,
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
    admin.from("events").select("id, organizer_id, status"),
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
    eventOrganizer.set(event.id, event.organizer_id)
    if (event.status === "published" || event.status === "draft") {
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
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al completar.",
    }
  }
}

export async function createSettlementForOrganizer(input: {
  organizerId: string
  grossAmount: number
  platformFee: number
  netAmount: number
  periodLabel?: string
  notes?: string
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  try {
    const { admin } = await requireSuperAdmin()
    const { data, error } = await admin
      .from("organizer_settlements")
      .insert({
        organizer_id: input.organizerId,
        gross_amount: input.grossAmount,
        platform_fee: input.platformFee,
        net_amount: input.netAmount,
        status: "pending",
        period_label: input.periodLabel?.trim() || null,
        notes: input.notes?.trim() || null,
      } as never)
      .select("id")
      .single()

    if (error || !data) {
      return { success: false, error: error?.message ?? "No se pudo crear." }
    }
    return { success: true, id: String((data as { id: string }).id) }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al crear.",
    }
  }
}
