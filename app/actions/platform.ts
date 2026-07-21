"use server"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type {
  EventStatus,
  OrderStatus,
  UserRole,
} from "@/types/database"

/**
 * Security boundary for the platform (super admin) panel.
 *
 * The session is validated with the SSR client (`getUser` verifies the token
 * against Supabase Auth). Only after confirming the caller's profile role is
 * `super_admin` do we hand back the service-role client, which bypasses RLS to
 * read and write platform-wide data.
 */
async function requireSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error("Debes iniciar sesión.")
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profileError || profile?.role !== "super_admin") {
    throw new Error("Acceso restringido al super administrador.")
  }

  return { admin: createAdminClient(), actorId: user.id }
}

async function countRows(
  admin: ReturnType<typeof createAdminClient>,
  table: "profiles" | "events" | "orders" | "venues",
): Promise<number> {
  const { count } = await admin
    .from(table)
    .select("*", { count: "exact", head: true })
  return count ?? 0
}

export interface RevenuePoint {
  date: string
  label: string
  revenue: number
}

export interface PlatformOverview {
  totals: {
    users: number
    customers: number
    organizers: number
    superAdmins: number
    events: number
    publishedEvents: number
    venues: number
    ticketsSold: number
    grossRevenue: number
    paidOrders: number
    pendingOrders: number
  }
  eventsByStatus: Record<EventStatus, number>
  revenueSeries: RevenuePoint[]
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const { admin } = await requireSuperAdmin()

  const [
    { data: profiles },
    { data: events },
    { data: tiers },
    { data: tickets },
    { data: orders },
    venuesCount,
  ] = await Promise.all([
    admin.from("profiles").select("role"),
    admin.from("events").select("status"),
    admin.from("ticket_tiers").select("id, price, sold"),
    admin.from("tickets").select("created_at, tier_id"),
    admin.from("orders").select("status, total_amount, created_at"),
    countRows(admin, "venues"),
  ])

  const roleTallies = { customer: 0, admin: 0, super_admin: 0 }
  for (const profile of profiles ?? []) {
    roleTallies[profile.role] = (roleTallies[profile.role] ?? 0) + 1
  }

  const eventsByStatus: Record<EventStatus, number> = {
    draft: 0,
    published: 0,
    cancelled: 0,
    completed: 0,
  }
  for (const event of events ?? []) {
    eventsByStatus[event.status] = (eventsByStatus[event.status] ?? 0) + 1
  }

  const priceByTier = new Map<string, number>()
  let ticketsSold = 0
  let grossRevenue = 0
  for (const tier of tiers ?? []) {
    priceByTier.set(tier.id, tier.price)
    ticketsSold += tier.sold
    grossRevenue += tier.price * tier.sold
  }

  let paidOrders = 0
  let pendingOrders = 0
  for (const order of orders ?? []) {
    if (order.status === "paid") paidOrders += 1
    if (order.status === "pending") pendingOrders += 1
  }

  const revenueSeries = buildRevenueSeries(tickets ?? [], priceByTier)

  return {
    totals: {
      users: profiles?.length ?? 0,
      customers: roleTallies.customer,
      organizers: roleTallies.admin,
      superAdmins: roleTallies.super_admin,
      events: events?.length ?? 0,
      publishedEvents: eventsByStatus.published,
      venues: venuesCount,
      ticketsSold,
      grossRevenue,
      paidOrders,
      pendingOrders,
    },
    eventsByStatus,
    revenueSeries,
  }
}

function buildRevenueSeries(
  tickets: { created_at: string; tier_id: string }[],
  priceByTier: Map<string, number>,
  days = 14,
): RevenuePoint[] {
  const buckets = new Map<string, number>()
  const series: RevenuePoint[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const labelFormatter = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
  })

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(today)
    day.setDate(today.getDate() - offset)
    const key = day.toISOString().slice(0, 10)
    buckets.set(key, 0)
    series.push({ date: key, label: labelFormatter.format(day), revenue: 0 })
  }

  for (const ticket of tickets) {
    const key = ticket.created_at.slice(0, 10)
    if (!buckets.has(key)) continue
    const price = priceByTier.get(ticket.tier_id) ?? 0
    buckets.set(key, (buckets.get(key) ?? 0) + price)
  }

  return series.map((point) => ({
    ...point,
    revenue: buckets.get(point.date) ?? 0,
  }))
}

export interface OrganizationSummary {
  id: string
  name: string
  email: string
  role: UserRole
  joinedAt: string
  totalEvents: number
  publishedEvents: number
  ticketsSold: number
  grossRevenue: number
}

export async function getOrganizations(): Promise<OrganizationSummary[]> {
  const { admin } = await requireSuperAdmin()

  const [{ data: organizers }, { data: events }, { data: tiers }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, email, role, created_at")
        .in("role", ["admin", "super_admin"])
        .order("created_at", { ascending: false }),
      admin.from("events").select("id, organizer_id, status"),
      admin.from("ticket_tiers").select("event_id, price, sold"),
    ])

  const eventOrganizer = new Map<string, string>()
  const statsByOrganizer = new Map<
    string,
    { totalEvents: number; publishedEvents: number }
  >()

  for (const event of events ?? []) {
    eventOrganizer.set(event.id, event.organizer_id)
    const current = statsByOrganizer.get(event.organizer_id) ?? {
      totalEvents: 0,
      publishedEvents: 0,
    }
    current.totalEvents += 1
    if (event.status === "published") current.publishedEvents += 1
    statsByOrganizer.set(event.organizer_id, current)
  }

  const revenueByOrganizer = new Map<
    string,
    { ticketsSold: number; grossRevenue: number }
  >()
  for (const tier of tiers ?? []) {
    const organizerId = eventOrganizer.get(tier.event_id)
    if (!organizerId) continue
    const current = revenueByOrganizer.get(organizerId) ?? {
      ticketsSold: 0,
      grossRevenue: 0,
    }
    current.ticketsSold += tier.sold
    current.grossRevenue += tier.price * tier.sold
    revenueByOrganizer.set(organizerId, current)
  }

  return (organizers ?? []).map((organizer) => {
    const stats = statsByOrganizer.get(organizer.id)
    const revenue = revenueByOrganizer.get(organizer.id)

    return {
      id: organizer.id,
      name: organizer.full_name ?? "Sin nombre",
      email: organizer.email,
      role: organizer.role,
      joinedAt: organizer.created_at,
      totalEvents: stats?.totalEvents ?? 0,
      publishedEvents: stats?.publishedEvents ?? 0,
      ticketsSold: revenue?.ticketsSold ?? 0,
      grossRevenue: revenue?.grossRevenue ?? 0,
    }
  })
}

export interface PlatformUser {
  id: string
  name: string
  email: string
  role: UserRole
  joinedAt: string
}

export async function getPlatformUsers(
  search?: string,
): Promise<PlatformUser[]> {
  const { admin } = await requireSuperAdmin()

  let query = admin
    .from("profiles")
    .select("id, full_name, email, role, created_at")
    .order("created_at", { ascending: false })
    .limit(200)

  if (search && search.trim()) {
    const term = `%${search.trim()}%`
    query = query.or(`full_name.ilike.${term},email.ilike.${term}`)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`No se pudieron cargar los usuarios: ${error.message}`)
  }

  return (data ?? []).map((user) => ({
    id: user.id,
    name: user.full_name ?? "Sin nombre",
    email: user.email,
    role: user.role,
    joinedAt: user.created_at,
  }))
}

export interface PlatformEvent {
  id: string
  title: string
  status: EventStatus
  date: string
  location: string
  organizerName: string
  organizerEmail: string
}

export async function getPlatformEvents(): Promise<PlatformEvent[]> {
  const { admin } = await requireSuperAdmin()

  const { data, error } = await admin
    .from("events")
    .select(
      "id, title, status, date, location, profiles!events_organizer_id_fkey(full_name, email)",
    )
    .order("date", { ascending: false })
    .limit(200)

  if (error) {
    throw new Error(`No se pudieron cargar los eventos: ${error.message}`)
  }

  type Row = {
    id: string
    title: string
    status: EventStatus
    date: string
    location: string
    profiles: { full_name: string | null; email: string } | null
  }

  return ((data ?? []) as unknown as Row[]).map((event) => ({
    id: event.id,
    title: event.title,
    status: event.status,
    date: event.date,
    location: event.location,
    organizerName: event.profiles?.full_name ?? "—",
    organizerEmail: event.profiles?.email ?? "—",
  }))
}

export interface PlatformOrder {
  id: string
  status: OrderStatus
  totalAmount: number
  createdAt: string
  buyerName: string
  buyerEmail: string
}

export async function getPlatformOrders(): Promise<PlatformOrder[]> {
  const { admin } = await requireSuperAdmin()

  const { data, error } = await admin
    .from("orders")
    .select(
      "id, status, total_amount, created_at, profiles!orders_buyer_id_fkey(full_name, email)",
    )
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) {
    throw new Error(`No se pudieron cargar las órdenes: ${error.message}`)
  }

  type Row = {
    id: string
    status: OrderStatus
    total_amount: number
    created_at: string
    profiles: { full_name: string | null; email: string } | null
  }

  return ((data ?? []) as unknown as Row[]).map((order) => ({
    id: order.id,
    status: order.status,
    totalAmount: order.total_amount,
    createdAt: order.created_at,
    buyerName: order.profiles?.full_name ?? "—",
    buyerEmail: order.profiles?.email ?? "—",
  }))
}

export type RoleActionResult =
  | { success: true }
  | { success: false; error: string }

const ASSIGNABLE_ROLES: UserRole[] = ["customer", "admin", "super_admin"]

export async function updateUserRole(
  userId: string,
  role: UserRole,
): Promise<RoleActionResult> {
  let admin: ReturnType<typeof createAdminClient>
  let actorId: string

  try {
    const context = await requireSuperAdmin()
    admin = context.admin
    actorId = context.actorId
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Acceso no autorizado.",
    }
  }

  if (!ASSIGNABLE_ROLES.includes(role)) {
    return { success: false, error: "Rol no válido." }
  }

  if (userId === actorId) {
    return {
      success: false,
      error: "No puedes cambiar tu propio rol desde aquí.",
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", userId)

  if (error) {
    return {
      success: false,
      error: `No se pudo actualizar el rol: ${error.message}`,
    }
  }

  revalidatePath("/superadmin/users")
  revalidatePath("/superadmin/organizations")
  revalidatePath("/superadmin")

  return { success: true }
}
