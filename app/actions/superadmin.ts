"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export class SuperAdminForbiddenError extends Error {
  status = 403 as const

  constructor(message = "Acceso restringido al super administrador (403).") {
    super(message)
    this.name = "SuperAdminForbiddenError"
  }
}

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
