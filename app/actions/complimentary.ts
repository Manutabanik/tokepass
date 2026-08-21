"use server"

import { revalidatePath } from "next/cache"

import { ticketDisplayCode } from "@/lib/admin/issued-tickets"
import {
  notifyLivingTicketEmail,
  notifyPosTicketIssued,
} from "@/lib/notifications"
import {
  requeuePosIssueNotifications,
  scheduleNotificationOutboxDrain,
} from "@/lib/notifications/outbox"
import { writeSecurityAuditLog } from "@/lib/security/audit-log"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { sanitizeFreepassWhatsapp } from "@/lib/validations/freepass"

export type ComplimentaryTierOption = {
  id: string
  name: string
  price: number
  admitCount: number
  available: number
  capacity: number
  sold: number
}

export type ComplimentaryBatchResult =
  | {
      success: true
      batchId: string
      orderId: string
      units: number
      ticketsIssued: number
      admitCount: number
      ticketIds: string[]
      sentEmail?: boolean
      sentWhatsApp?: boolean
      notifyError?: string
    }
  | { success: false; error: string }

export type NamedGuestRow = {
  nombre: string
  apellido?: string
  dni: string
  email?: string
  telefono?: string
  tier_id?: string
}

async function assertEventOrganizer(eventId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "Sesión requerida." }

  const { data: event } = await supabase
    .from("events")
    .select("id, organizer_id, title, max_free_tickets")
    .eq("id", eventId)
    .maybeSingle()

  if (!event) return { ok: false as const, error: "Evento no encontrado." }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (
    event.organizer_id !== user.id &&
    profile?.role !== "super_admin"
  ) {
    return { ok: false as const, error: "Sin permiso para este evento." }
  }

  return { ok: true as const, supabase, user, event }
}

export async function getComplimentaryTiers(
  eventId: string,
): Promise<ComplimentaryTierOption[]> {
  const gate = await assertEventOrganizer(eventId)
  if (!gate.ok) return []

  const { data } = await gate.supabase
    .from("ticket_tiers")
    .select("id, name, price, capacity, sold, admit_count")
    .eq("event_id", eventId)
    .order("price", { ascending: true })

  return (data ?? []).map((tier) => ({
    id: tier.id,
    name: tier.name,
    price: Number(tier.price),
    admitCount: Math.max(1, Number(tier.admit_count ?? 1)),
    capacity: Number(tier.capacity),
    sold: Number(tier.sold),
    available: Math.max(0, Number(tier.capacity) - Number(tier.sold)),
  }))
}

export async function getEventStoreItemsForCombo(eventId: string) {
  const gate = await assertEventOrganizer(eventId)
  if (!gate.ok) return []

  const { data } = await gate.supabase
    .from("event_items")
    .select("id, name, price, stock, is_active, category")
    .eq("event_id", eventId)
    .eq("is_active", true)
    .order("name")

  return data ?? []
}

export async function getTierComboItems(tierId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("ticket_tier_combo_items")
    .select("id, event_item_id, quantity, event_items(id, name)")
    .eq("tier_id", tierId)

  return (data ?? []).map((row) => {
    const item = row.event_items as unknown as { id: string; name: string } | null
    return {
      id: row.id as string,
      eventItemId: row.event_item_id as string,
      quantity: Number(row.quantity),
      itemName: item?.name ?? "Extra",
    }
  })
}

export async function setTierComboItem(input: {
  eventId: string
  tierId: string
  eventItemId: string
  quantity: number
}): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await assertEventOrganizer(input.eventId)
  if (!gate.ok) return { success: false, error: gate.error }

  const qty = Math.max(1, Math.min(50, Math.floor(input.quantity) || 1))

  const { error } = await gate.supabase.from("ticket_tier_combo_items").upsert(
    {
      tier_id: input.tierId,
      event_item_id: input.eventItemId,
      quantity: qty,
    },
    { onConflict: "tier_id,event_item_id" },
  )

  if (error) return { success: false, error: error.message }

  revalidatePath(`/admin/events/${input.eventId}/complimentary`)
  revalidatePath(`/admin/events/${input.eventId}/store`)
  return { success: true }
}

export async function removeTierComboItem(input: {
  eventId: string
  comboItemId: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await assertEventOrganizer(input.eventId)
  if (!gate.ok) return { success: false, error: gate.error }

  const { error } = await gate.supabase
    .from("ticket_tier_combo_items")
    .delete()
    .eq("id", input.comboItemId)

  if (error) return { success: false, error: error.message }

  revalidatePath(`/admin/events/${input.eventId}/complimentary`)
  return { success: true }
}

export async function updateTierAdmitCount(input: {
  eventId: string
  tierId: string
  admitCount: number
}): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await assertEventOrganizer(input.eventId)
  if (!gate.ok) return { success: false, error: gate.error }

  const admit = Math.max(1, Math.min(50, Math.floor(input.admitCount) || 1))

  const { error } = await createAdminClient()
    .from("ticket_tiers")
    .update({ admit_count: admit, updated_at: new Date().toISOString() })
    .eq("id", input.tierId)
    .eq("event_id", input.eventId)

  if (error) return { success: false, error: error.message }

  revalidatePath(`/admin/events/${input.eventId}/complimentary`)
  revalidatePath(`/admin/events/${input.eventId}/edit`)
  return { success: true }
}

export async function issueComplimentaryNamed(input: {
  eventId: string
  tierId: string
  guests: NamedGuestRow[]
}): Promise<ComplimentaryBatchResult> {
  const gate = await assertEventOrganizer(input.eventId)
  if (!gate.ok) return { success: false, error: gate.error }

  if (!input.guests.length) {
    return { success: false, error: "Cargá al menos un invitado." }
  }
  if (input.guests.length > 3000) {
    return { success: false, error: "Máximo 3.000 filas por lote." }
  }

  const payload = input.guests.map((g) => ({
    nombre: g.nombre,
    apellido: g.apellido ?? "",
    dni: g.dni,
    email: g.email ?? "",
    telefono: g.telefono ?? "",
  }))

  const { data, error } = await gate.supabase.rpc(
    "issue_complimentary_batch_tx",
    {
      p_event_id: input.eventId,
      p_staff_id: gate.user.id,
      p_tier_id: input.tierId,
      p_mode: "named",
      p_guests: payload,
      p_unnamed_count: 0,
    },
  )

  if (error || !data) {
    return {
      success: false,
      error: mapBatchError(error?.message ?? "No se pudo emitir el lote."),
    }
  }

  const result = mapBatchSuccess(data, input.eventId)
  await writeSecurityAuditLog({
    actorId: gate.user.id,
    action: "complimentary_issue",
    entity: "event",
    entityId: input.eventId,
    details: {
      mode: "named",
      tierId: input.tierId,
      batchId: result.batchId,
      orderId: result.orderId,
      ticketsIssued: result.ticketsIssued,
    },
  })
  return result
}

export async function issueComplimentaryUnnamed(input: {
  eventId: string
  tierId: string
  count: number
}): Promise<ComplimentaryBatchResult> {
  const gate = await assertEventOrganizer(input.eventId)
  if (!gate.ok) return { success: false, error: gate.error }

  const count = Math.floor(input.count)
  if (!Number.isFinite(count) || count < 1) {
    return { success: false, error: "Indicá cuántas entradas generar." }
  }
  if (count > 3000) {
    return { success: false, error: "Máximo 3.000 entradas por lote." }
  }

  const { data, error } = await gate.supabase.rpc(
    "issue_complimentary_batch_tx",
    {
      p_event_id: input.eventId,
      p_staff_id: gate.user.id,
      p_tier_id: input.tierId,
      p_mode: "unnamed",
      p_guests: [],
      p_unnamed_count: count,
    },
  )

  if (error || !data) {
    return {
      success: false,
      error: mapBatchError(error?.message ?? "No se pudo emitir el lote."),
    }
  }

  const result = mapBatchSuccess(data, input.eventId)
  await writeSecurityAuditLog({
    actorId: gate.user.id,
    action: "complimentary_issue",
    entity: "event",
    entityId: input.eventId,
    details: {
      mode: "unnamed",
      tierId: input.tierId,
      batchId: result.batchId,
      orderId: result.orderId,
      ticketsIssued: result.ticketsIssued,
    },
  })
  return result
}

export async function getComplimentaryBatchTickets(input: {
  eventId: string
  batchId: string
}) {
  const gate = await assertEventOrganizer(input.eventId)
  if (!gate.ok) return []

  const { data } = await gate.supabase
    .from("tickets")
    .select(
      "id, holder_name, holder_dni, holder_email, group_id, group_slot, status, totp_secret, ticket_tiers(name)",
    )
    .eq("event_id", input.eventId)
    .eq("batch_id", input.batchId)
    .order("created_at", { ascending: true })

  return (data ?? []).map((row) => {
    const tier = row.ticket_tiers as unknown as { name: string } | null
    return {
      id: row.id as string,
      holderName: (row.holder_name as string | null) ?? "Cortesía",
      holderDni: (row.holder_dni as string | null) ?? null,
      holderEmail: (row.holder_email as string | null) ?? null,
      groupId: (row.group_id as string | null) ?? null,
      groupSlot: row.group_slot == null ? null : Number(row.group_slot),
      status: row.status as string,
      totpSecret: row.totp_secret as string,
      tierName: tier?.name ?? "Entrada",
      printPath: `/tickets/${row.id}/print`,
    }
  })
}

function mapBatchError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes("batch_too_large")) {
    return "El lote supera 3.000 QRs (unidades × personas por mesa)."
  }
  if (lower.includes("free_cap_exceeded")) {
    return "Superaste el tope de cortesías del evento. Subilo en Configuración comercial."
  }
  if (lower.includes("sold out")) {
    return "No hay cupo suficiente en ese tipo de entrada."
  }
  if (lower.includes("dni_required") || lower.includes("dni_invalid")) {
    return "Si cargás DNI, usá 7 a 11 dígitos."
  }
  return message
}

async function dispatchComplimentaryNotifications(input: {
  eventTitle: string
  orderId: string
  ticketIds: string[]
  guests: NamedGuestRow[]
  sendEmail: boolean
  sendWhatsApp: boolean
}): Promise<{ sentEmail: boolean; sentWhatsApp: boolean; notifyError?: string }> {
  const first = input.guests[0]
  const email = first?.email?.trim().toLowerCase() ?? ""
  const phone = sanitizeFreepassWhatsapp(first?.telefono ?? "")
  const holderName = [first?.nombre, first?.apellido]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ")
    .trim() || "Invitado"

  let sentEmail = false
  let sentWhatsApp = false
  const errors: string[] = []

  if (input.sendEmail) {
    if (!email || !email.includes("@")) {
      errors.push("Marcaste email pero el destinatario no tiene un mail válido.")
    } else {
      try {
        for (const ticketId of input.ticketIds) {
          await notifyLivingTicketEmail({
            toEmail: email,
            holderName,
            eventTitle: input.eventTitle,
            ticketId,
            ticketCode: ticketDisplayCode(ticketId),
          })
        }
        sentEmail = true
      } catch (error) {
        errors.push(
          error instanceof Error
            ? error.message
            : "No se pudo enviar el email de la cortesía.",
        )
      }
    }
  }

  if (input.sendWhatsApp) {
    if (!phone) {
      errors.push("Marcaste WhatsApp pero el número no es válido.")
    } else {
      try {
        await notifyPosTicketIssued({
          eventTitle: input.eventTitle,
          quantity: input.ticketIds.length,
          ticketIds: input.ticketIds,
          phone,
          email: email || null,
        })
        await requeuePosIssueNotifications({
          orderId: input.orderId,
          eventTitle: input.eventTitle,
          ticketIds: input.ticketIds,
          phone,
          email: email || null,
        })
        scheduleNotificationOutboxDrain()
        sentWhatsApp = true
      } catch (error) {
        errors.push(
          error instanceof Error
            ? error.message
            : "No se pudo encolar el WhatsApp de la cortesía.",
        )
      }
    }
  }

  return {
    sentEmail,
    sentWhatsApp,
    notifyError: errors.length > 0 ? errors.join(" ") : undefined,
  }
}

export async function issueComplimentaryBatch(input: {
  eventId: string
  tierId: string
  guests: NamedGuestRow[]
  sendEmail?: boolean
  sendWhatsApp?: boolean
}): Promise<ComplimentaryBatchResult> {
  try {
    const issued = await issueComplimentaryNamed({
      eventId: input.eventId,
      tierId: input.tierId,
      guests: input.guests,
    })
    if (!issued.success) return issued

    const gate = await assertEventOrganizer(input.eventId)
    const eventTitle = gate.ok ? gate.event.title : "Evento TokePass"
    const notify = await dispatchComplimentaryNotifications({
      eventTitle,
      orderId: issued.orderId,
      ticketIds: issued.ticketIds,
      guests: input.guests,
      sendEmail: Boolean(input.sendEmail),
      sendWhatsApp: Boolean(input.sendWhatsApp),
    })

    return {
      ...issued,
      sentEmail: notify.sentEmail,
      sentWhatsApp: notify.sentWhatsApp,
      notifyError: notify.notifyError,
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? mapBatchError(error.message)
          : "No se pudo emitir la cortesía.",
    }
  }
}

function mapBatchSuccess(
  data: unknown,
  eventId: string,
): Extract<ComplimentaryBatchResult, { success: true }> {
  const row = data as {
    batch_id: string
    order_id: string
    units: number
    tickets_issued: number
    admit_count: number
    ticket_ids: string[]
  }

  revalidatePath(`/admin/events/${eventId}/complimentary`)
  revalidatePath(`/admin/events/${eventId}/tickets`)
  revalidatePath("/admin/scanner")

  return {
    success: true,
    batchId: row.batch_id,
    orderId: row.order_id,
    units: Number(row.units),
    ticketsIssued: Number(row.tickets_issued),
    admitCount: Number(row.admit_count),
    ticketIds: Array.isArray(row.ticket_ids) ? row.ticket_ids : [],
  }
}
