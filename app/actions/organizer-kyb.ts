"use server"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { SuperAdminForbiddenError } from "@/lib/superadmin-errors"
import {
  organizerApplicationSchema,
  type OrganizerApplicationFormValues,
} from "@/lib/validations/organizer-application"
import type {
  OrganizerApplication,
  OrganizerApplicationStatus,
  OrderStatus,
} from "@/types/database"

export type KybActionResult =
  | { success: true }
  | { success: false; error: string }

export type OrganizerApplicationRow = OrganizerApplication & {
  applicantName: string | null
  applicantEmail: string
}

export type ApprovedOrganizerRow = {
  id: string
  name: string
  email: string
  companyName: string | null
  cuitCuil: string | null
  totalEvents: number
  joinedAt: string
  approvalStatus: string
}

export type BuyerRow = {
  id: string
  name: string
  email: string
  dni: string | null
  phone: string | null
  joinedAt: string
  ordersCount: number
}

export type BuyerOrderRow = {
  id: string
  status: OrderStatus
  totalAmount: number
  createdAt: string
  eventTitle: string
}

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

/**
 * Postulación KYB: usuario autenticado (no admin aprobado) crea/actualiza
 * su solicitud pending. No otorga rol de organizador.
 */
export async function submitOrganizerApplication(
  input: OrganizerApplicationFormValues,
): Promise<KybActionResult> {
  const parsed = organizerApplicationSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "Tenés que iniciar sesión para postularte." }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organizer_approval_status")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile) {
    return { success: false, error: "No encontramos tu perfil." }
  }

  if (profile.role === "super_admin") {
    return {
      success: false,
      error: "El dueño de la plataforma no necesita postularse.",
    }
  }

  if (
    profile.role === "admin" &&
    profile.organizer_approval_status === "approved"
  ) {
    return {
      success: false,
      error: "Tu productora ya está aprobada. Entrá a Tu Panel.",
    }
  }

  const { data: existing } = await supabase
    .from("organizer_applications")
    .select("id, status")
    .eq("id", user.id)
    .maybeSingle()

  if (existing?.status === "approved") {
    return {
      success: false,
      error: "Ya tenés una solicitud aprobada.",
    }
  }

  if (existing?.status === "pending") {
    return {
      success: false,
      error:
        "Ya enviaste una solicitud. Nuestro equipo la está revisando (menos de 24 hs).",
    }
  }

  const payload = {
    id: user.id,
    company_name: parsed.data.companyName.trim(),
    cuit_cuil: parsed.data.cuitCuil.replace(/\D/g, ""),
    responsible_dni: parsed.data.responsibleDni.replace(/\D/g, ""),
    cbu_alias: parsed.data.cbuAlias.trim(),
    social_media_url: parsed.data.socialMediaUrl.trim(),
    status: "pending" as const,
    review_notes: null,
    reviewed_by: null,
    reviewed_at: null,
  }

  const admin = createAdminClient()

  // Si fue rechazada antes, el dueño no puede UPDATE por RLS → service role
  // solo para reabrir (status rejected → pending).
  if (existing?.status === "rejected") {
    const { error } = await admin.from("organizer_applications").update({
      company_name: payload.company_name,
      cuit_cuil: payload.cuit_cuil,
      responsible_dni: payload.responsible_dni,
      cbu_alias: payload.cbu_alias,
      social_media_url: payload.social_media_url,
      status: "pending",
      review_notes: null,
      reviewed_by: null,
      reviewed_at: null,
    }).eq("id", user.id)

    if (error) {
      return { success: false, error: error.message }
    }
  } else {
    const { error } = await supabase.from("organizer_applications").insert(payload)
    if (error) {
      return { success: false, error: error.message }
    }
  }

  // Approval/role solo vía service_role (column grants no permiten a authenticated).
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      organizer_approval_status: "pending",
      role: "customer",
      public_name: parsed.data.companyName.trim(),
      dni: parsed.data.responsibleDni.replace(/\D/g, ""),
    } as never)
    .eq("id", user.id)

  if (profileError) {
    return {
      success: false,
      error: `Solicitud guardada, pero no se pudo actualizar el perfil: ${profileError.message}`,
    }
  }

  revalidatePath("/postular-productora")
  revalidatePath("/superadmin/applications")
  return { success: true }
}

export async function getMyOrganizerApplication(): Promise<{
  status: OrganizerApplicationStatus | null
  companyName: string | null
} | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from("organizer_applications")
    .select("status, company_name")
    .eq("id", user.id)
    .maybeSingle()

  if (!data) return { status: null, companyName: null }
  return { status: data.status, companyName: data.company_name }
}

export async function listPendingOrganizerApplications(): Promise<
  OrganizerApplicationRow[]
> {
  const { admin } = await requireSuperAdmin()

  const { data, error } = await admin
    .from("organizer_applications")
    .select(
      "id, company_name, cuit_cuil, responsible_dni, cbu_alias, social_media_url, status, review_notes, reviewed_by, reviewed_at, created_at, updated_at",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)

  const rows = data ?? []
  if (rows.length === 0) return []

  const ids = rows.map((row) => row.id)
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids)

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]))

  return rows.map((row) => ({
    ...row,
    applicantName: byId.get(row.id)?.full_name ?? null,
    applicantEmail: byId.get(row.id)?.email ?? "—",
  }))
}

export async function listApprovedOrganizers(): Promise<ApprovedOrganizerRow[]> {
  const { admin } = await requireSuperAdmin()

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, full_name, email, public_name, organizer_approval_status, created_at")
    .eq("role", "admin")
    .eq("organizer_approval_status", "approved")
    .order("created_at", { ascending: false })

  if (error) throw new Error(error.message)

  const list = profiles ?? []
  if (list.length === 0) return []

  const ids = list.map((p) => p.id)
  const [{ data: apps }, { data: events }] = await Promise.all([
    admin
      .from("organizer_applications")
      .select("id, company_name, cuit_cuil")
      .in("id", ids),
    admin.from("events").select("id, organizer_id").in("organizer_id", ids),
  ])

  const appById = new Map((apps ?? []).map((a) => [a.id, a]))
  const eventCount = new Map<string, number>()
  for (const event of events ?? []) {
    eventCount.set(
      event.organizer_id,
      (eventCount.get(event.organizer_id) ?? 0) + 1,
    )
  }

  return list.map((profile) => {
    const app = appById.get(profile.id)
    return {
      id: profile.id,
      name: profile.public_name?.trim() || profile.full_name || profile.email,
      email: profile.email,
      companyName: app?.company_name ?? profile.public_name,
      cuitCuil: app?.cuit_cuil ?? null,
      totalEvents: eventCount.get(profile.id) ?? 0,
      joinedAt: profile.created_at,
      approvalStatus: profile.organizer_approval_status,
    }
  })
}

/**
 * Aprueba KYB: status approved + profiles.role = admin (organizador canónico)
 * + user_metadata de identidad B2B. Requiere SuperAdmin.
 */
export async function approveOrganizerApplication(
  applicationId: string,
): Promise<KybActionResult> {
  try {
    const { admin, actorId } = await requireSuperAdmin()
    const id = applicationId.trim()
    if (!id) return { success: false, error: "Solicitud inválida." }

    const { data: application, error: loadError } = await admin
      .from("organizer_applications")
      .select("id, company_name, status, responsible_dni")
      .eq("id", id)
      .maybeSingle()

    if (loadError) return { success: false, error: loadError.message }
    if (!application) return { success: false, error: "Solicitud no encontrada." }
    if (application.status === "approved") return { success: true }

    const { error: appError } = await admin
      .from("organizer_applications")
      .update({
        status: "approved",
        reviewed_by: actorId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (appError) return { success: false, error: appError.message }

    // Rol canónico en TokePass: admin = productora/organizador.
    const { error: profileError } = await admin
      .from("profiles")
      .update({
        role: "admin",
        organizer_approval_status: "approved",
        public_name: application.company_name,
        dni: application.responsible_dni,
      } as never)
      .eq("id", id)

    if (profileError) {
      return {
        success: false,
        error: `No se pudo elevar el rol: ${profileError.message}`,
      }
    }

    // Metadatos Auth: identidad B2B (producto) + rol canónico para claims.
    const { error: authError } = await admin.auth.admin.updateUserById(id, {
      app_metadata: {
        role: "admin",
        identity: "organizer",
      },
      user_metadata: {
        role: "organizer",
        organizer_status: "approved",
        company_name: application.company_name,
      },
    })

    if (authError) {
      return {
        success: false,
        error: `Perfil actualizado, pero falló Auth metadata: ${authError.message}`,
      }
    }

    revalidatePath("/superadmin/applications")
    revalidatePath("/superadmin/organizers")
    revalidatePath("/superadmin/organizations")
    revalidatePath("/admin")
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof SuperAdminForbiddenError
          ? error.message
          : error instanceof Error
            ? error.message
            : "No se pudo aprobar.",
    }
  }
}

export async function rejectOrganizerApplication(
  applicationId: string,
  notes?: string,
): Promise<KybActionResult> {
  try {
    const { admin, actorId } = await requireSuperAdmin()
    const id = applicationId.trim()
    if (!id) return { success: false, error: "Solicitud inválida." }

    const { error: appError } = await admin
      .from("organizer_applications")
      .update({
        status: "rejected",
        review_notes: notes?.trim() || null,
        reviewed_by: actorId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (appError) return { success: false, error: appError.message }

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        role: "customer",
        organizer_approval_status: "rejected",
      } as never)
      .eq("id", id)

    if (profileError) {
      return { success: false, error: profileError.message }
    }

    await admin.auth.admin.updateUserById(id, {
      app_metadata: { role: "customer", identity: "buyer" },
      user_metadata: {
        role: "customer",
        organizer_status: "rejected",
      },
    })

    revalidatePath("/superadmin/applications")
    revalidatePath("/superadmin/organizers")
    revalidatePath("/postular-productora")
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof SuperAdminForbiddenError
          ? error.message
          : error instanceof Error
            ? error.message
            : "No se pudo rechazar.",
    }
  }
}

export async function listBuyers(search?: string): Promise<BuyerRow[]> {
  const { admin } = await requireSuperAdmin()

  let query = admin
    .from("profiles")
    .select("id, full_name, email, dni, phone, created_at, role")
    .eq("role", "customer")
    .order("created_at", { ascending: false })
    .limit(300)

  if (search?.trim()) {
    const term = `%${search.trim()}%`
    query = query.or(
      `full_name.ilike.${term},email.ilike.${term},dni.ilike.${term},phone.ilike.${term}`,
    )
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const buyers = data ?? []
  if (buyers.length === 0) return []

  const ids = buyers.map((b) => b.id)
  const { data: orders } = await admin
    .from("orders")
    .select("id, buyer_id")
    .in("buyer_id", ids)
    .eq("status", "paid")

  const countByBuyer = new Map<string, number>()
  for (const order of orders ?? []) {
    countByBuyer.set(
      order.buyer_id,
      (countByBuyer.get(order.buyer_id) ?? 0) + 1,
    )
  }

  return buyers.map((buyer) => ({
    id: buyer.id,
    name: buyer.full_name?.trim() || "Sin nombre",
    email: buyer.email,
    dni: buyer.dni,
    phone: buyer.phone,
    joinedAt: buyer.created_at,
    ordersCount: countByBuyer.get(buyer.id) ?? 0,
  }))
}

export async function getBuyerPurchaseHistory(
  buyerId: string,
): Promise<{
  buyer: BuyerRow | null
  orders: BuyerOrderRow[]
}> {
  const { admin } = await requireSuperAdmin()
  const id = buyerId.trim()
  if (!id) return { buyer: null, orders: [] }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, email, dni, phone, created_at")
    .eq("id", id)
    .maybeSingle()

  if (!profile) return { buyer: null, orders: [] }

  const { data: orders } = await admin
    .from("orders")
    .select("id, status, total_amount, created_at")
    .eq("buyer_id", id)
    .order("created_at", { ascending: false })
    .limit(50)

  const orderRows = orders ?? []
  const orderIds = orderRows.map((o) => o.id)
  const titleByOrder = new Map<string, string>()

  if (orderIds.length > 0) {
    const { data: tickets } = await admin
      .from("tickets")
      .select("order_id, events!tickets_event_id_fkey(title)")
      .in("order_id", orderIds)

    for (const ticket of tickets ?? []) {
      if (!ticket.order_id || titleByOrder.has(ticket.order_id)) continue
      const event = ticket.events as { title: string } | null
      if (event?.title) titleByOrder.set(ticket.order_id, event.title)
    }
  }

  const mapped = orderRows.map((order) => ({
    id: order.id,
    status: order.status as OrderStatus,
    totalAmount: Number(order.total_amount),
    createdAt: order.created_at,
    eventTitle: titleByOrder.get(order.id) ?? "Evento",
  }))

  return {
    buyer: {
      id: profile.id,
      name: profile.full_name?.trim() || "Sin nombre",
      email: profile.email,
      dni: profile.dni,
      phone: profile.phone,
      joinedAt: profile.created_at,
      ordersCount: mapped.filter((o) => o.status === "paid").length,
    },
    orders: mapped,
  }
}
