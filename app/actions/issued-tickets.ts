"use server"

import { randomBytes, randomUUID } from "crypto"
import { revalidatePath } from "next/cache"

import {
  matchesIssuedTicketQuery,
  ticketDisplayCode,
  type CustodyParty,
  type CustodyTransferEvent,
  type IssuedTicketMetrics,
  type IssuedTicketRow,
  type IssuedTicketUiStatus,
} from "@/lib/admin/issued-tickets"
import {
  audienceCsvFilename,
  audienceRowsFromTickets,
  buildAudienceCsv,
  withUtf8Bom,
} from "@/lib/admin/audience-csv"
import { assertEventOpsAccess } from "@/lib/event-ops-access"
import { logger } from "@/lib/logger"
import {
  notifyLivingTicketEmail,
  notifyTicketTransfer,
} from "@/lib/notifications"
import { createAdminClient } from "@/lib/supabase/admin"
import type { TicketStatus } from "@/types/database"

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

export type IssuedTicketsPayload = {
  tickets: IssuedTicketRow[]
  metrics: IssuedTicketMetrics
}

type SeatingJoin = {
  label: string | null
  sector_name: string | null
  row_label: string | null
} | null

type TierJoin = { name: string | null } | null

type TicketDbRow = {
  id: string
  status: TicketStatus
  qr_code: string
  holder_name: string | null
  holder_email: string | null
  holder_dni: string | null
  scanned_at: string | null
  validated_at: string | null
  admissions_used: number
  created_at: string
  transferred_from_id: string | null
  owner_id: string | null
  order_id: string | null
  tier_id: string
  seat_id: string | null
  seating_unit_id: string | null
  max_admissions: number
  is_dynamic_qr: boolean
  max_transfers_allowed: number
  transfer_count: number
  is_test: boolean
  event_seating_units: SeatingJoin | SeatingJoin[]
  ticket_tiers: TierJoin | TierJoin[]
}

type TransferDbRow = {
  id: string
  sender_id: string
  receiver_email: string
  original_ticket_id: string
  new_ticket_id: string | null
  created_at: string
}

function siteBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://tokepass.app"
  )
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function partyFromTicket(
  row: Pick<
    TicketDbRow,
    "holder_name" | "holder_email" | "holder_dni"
  > | null,
  fallbackEmail = "",
): CustodyParty {
  return {
    name: row?.holder_name?.trim() || "Sin nombre",
    email: row?.holder_email?.trim() || fallbackEmail || "—",
    dni: row?.holder_dni?.trim() || "—",
  }
}

function sectorLabelFromRow(row: TicketDbRow): string {
  const seating = one(row.event_seating_units)
  const tier = one(row.ticket_tiers)
  if (seating) {
    const parts = [
      seating.sector_name,
      seating.row_label ? `Fila ${seating.row_label}` : null,
      seating.label,
    ].filter(Boolean)
    if (parts.length > 0) return parts.join(" · ")
  }
  return tier?.name?.trim() || "Entrada general"
}

function toUiStatus(row: TicketDbRow): IssuedTicketUiStatus {
  if (row.status === "cancelled" || row.status === "revoked") {
    return "cancelled"
  }
  if (row.status === "transferred") return "transferred"
  if (
    row.status === "used" ||
    row.status === "scanned" ||
    row.admissions_used > 0 ||
    Boolean(row.scanned_at)
  ) {
    return "checked_in"
  }
  return "available"
}

function normalizeStatusFilter(
  statusFilter?: string,
): IssuedTicketUiStatus | "all" {
  const raw = (statusFilter ?? "all").trim().toLowerCase()
  if (!raw || raw === "all") return "all"
  if (raw === "valid" || raw === "available") return "available"
  if (raw === "admitted" || raw === "checked_in") return "checked_in"
  if (raw === "transferred") return "transferred"
  if (raw === "cancelled") return "cancelled"
  return "all"
}

function deadTotpSecret(prefix: "cancel" | "xfer"): string {
  return `${prefix}_dead_${randomUUID().replace(/-/g, "")}`
}

function freshTotpSecret(): string {
  return randomBytes(24).toString("hex")
}

async function requireEventAccess(eventId: string) {
  const access = await assertEventOpsAccess(eventId, [])
  if (!access.ok) {
    return {
      ok: false as const,
      error:
        access.reason === "auth_required"
          ? "Debés iniciar sesión."
          : "No tenés permiso para operar este evento.",
    }
  }
  return {
    ok: true as const,
    userId: access.userId,
    admin: createAdminClient(),
  }
}

async function requireTicketEventAccess(ticketId: string) {
  const admin = createAdminClient()
  const { data: ticket, error } = await admin
    .from("tickets")
    .select("id, event_id, status")
    .eq("id", ticketId)
    .maybeSingle()

  if (error || !ticket) {
    return { ok: false as const, error: "Entrada no encontrada." }
  }

  const access = await requireEventAccess(ticket.event_id)
  if (!access.ok) return access

  return {
    ok: true as const,
    userId: access.userId,
    admin: access.admin,
    eventId: ticket.event_id as string,
    ticketStatus: ticket.status as TicketStatus,
  }
}

function buildIssuedRows(input: {
  tickets: TicketDbRow[]
  transfers: TransferDbRow[]
  organizerId: string | null
}): IssuedTicketRow[] {
  const byId = new Map(input.tickets.map((row) => [row.id, row]))
  const childByParent = new Map<string, TicketDbRow>()
  for (const row of input.tickets) {
    if (row.transferred_from_id) {
      childByParent.set(row.transferred_from_id, row)
    }
  }

  function rootId(ticketId: string): string {
    let current = ticketId
    const seen = new Set<string>()
    while (true) {
      if (seen.has(current)) break
      seen.add(current)
      const row = byId.get(current)
      if (!row?.transferred_from_id) break
      current = row.transferred_from_id
    }
    return current
  }

  function lineageIds(ticketId: string): string[] {
    const root = rootId(ticketId)
    const ids: string[] = [root]
    let cursor = root
    const seen = new Set([root])
    while (true) {
      const child = childByParent.get(cursor)
      if (!child || seen.has(child.id)) break
      seen.add(child.id)
      ids.push(child.id)
      cursor = child.id
    }
    return ids
  }

  function custodyFor(ticketId: string): CustodyTransferEvent[] {
    const ids = new Set(lineageIds(ticketId))
    const events: CustodyTransferEvent[] = []

    for (const transfer of input.transfers) {
      if (!ids.has(transfer.original_ticket_id)) continue
      if (!transfer.new_ticket_id || !ids.has(transfer.new_ticket_id)) continue

      const fromRow = byId.get(transfer.original_ticket_id) ?? null
      const toRow = byId.get(transfer.new_ticket_id) ?? null
      const channel: CustodyTransferEvent["channel"] =
        transfer.sender_id === input.organizerId
          ? "admin_reassign"
          : "tokepass_transfer"

      events.push({
        at: transfer.created_at,
        channel,
        from: partyFromTicket(fromRow),
        to: partyFromTicket(toRow, transfer.receiver_email),
        fromTicketCode: ticketDisplayCode(transfer.original_ticket_id),
        toTicketCode: ticketDisplayCode(transfer.new_ticket_id),
        fromTicketId: transfer.original_ticket_id,
        toTicketId: transfer.new_ticket_id,
      })
    }

    return events.sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    )
  }

  return input.tickets
    .map((row) => {
      const root = byId.get(rootId(row.id)) ?? row
      const child = childByParent.get(row.id) ?? null
      const parent = row.transferred_from_id
        ? (byId.get(row.transferred_from_id) ?? null)
        : null
      const status = toUiStatus(row)
      const holder = partyFromTicket(row)
      const originalBuyer = partyFromTicket(root)

      return {
        id: row.id,
        code: ticketDisplayCode(row.id),
        holderName: holder.name,
        holderEmail: holder.email,
        holderDni: holder.dni,
        sectorLabel: sectorLabelFromRow(row),
        status,
        checkedInAt:
          status === "checked_in"
            ? row.scanned_at ?? row.validated_at ?? null
            : null,
        purchasedAt: root.created_at,
        ticketUrl: `${siteBaseUrl()}/tickets/${row.id}`,
        originalBuyer,
        transferredTo:
          status === "transferred" && child
            ? {
                name: partyFromTicket(child).name,
                code: ticketDisplayCode(child.id),
                ticketId: child.id,
              }
            : null,
        receivedFrom: parent
          ? {
              name: partyFromTicket(parent).name,
              code: ticketDisplayCode(parent.id),
              ticketId: parent.id,
            }
          : null,
        custodyChain: custodyFor(row.id),
      } satisfies IssuedTicketRow
    })
    .sort(
      (a, b) =>
        new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime(),
    )
}

function computeMetrics(tickets: IssuedTicketRow[]): IssuedTicketMetrics {
  return {
    totalIssued: tickets.length,
    checkedIn: tickets.filter((t) => t.status === "checked_in").length,
    pending: tickets.filter((t) => t.status === "available").length,
    transferred: tickets.filter((t) => t.status === "transferred").length,
  }
}

export async function getIssuedTicketsForEvent(
  eventId: string,
  search?: string,
  statusFilter?: string,
): Promise<ActionResult<IssuedTicketsPayload>> {
  try {
    const access = await requireEventAccess(eventId)
    if (!access.ok) return { success: false, error: access.error }

    const { admin } = access

    const [{ data: event }, { data: ticketRows, error: ticketsError }] =
      await Promise.all([
        admin
          .from("events")
          .select("id, organizer_id")
          .eq("id", eventId)
          .maybeSingle(),
        admin
          .from("tickets")
          .select(
            "id, status, qr_code, holder_name, holder_email, holder_dni, scanned_at, validated_at, admissions_used, created_at, transferred_from_id, owner_id, order_id, tier_id, seat_id, seating_unit_id, max_admissions, is_dynamic_qr, max_transfers_allowed, transfer_count, is_test, event_seating_units(label, sector_name, row_label), ticket_tiers(name)",
          )
          .eq("event_id", eventId)
          .eq("is_test", false)
          .neq("status", "pending_payment")
          .order("created_at", { ascending: false }),
      ])

    if (ticketsError) {
      return { success: false, error: ticketsError.message }
    }

    const tickets = (ticketRows ?? []) as unknown as TicketDbRow[]
    const ticketIds = tickets.map((row) => row.id)

    let transfers: TransferDbRow[] = []
    if (ticketIds.length > 0) {
      const { data: transferRows, error: transferError } = await admin
        .from("ticket_transfers")
        .select(
          "id, sender_id, receiver_email, original_ticket_id, new_ticket_id, created_at",
        )
        .or(
          `original_ticket_id.in.(${ticketIds.join(",")}),new_ticket_id.in.(${ticketIds.join(",")})`,
        )
        .order("created_at", { ascending: true })

      if (transferError) {
        return { success: false, error: transferError.message }
      }
      transfers = (transferRows ?? []) as TransferDbRow[]
    }

    const allRows = buildIssuedRows({
      tickets,
      transfers,
      organizerId: event?.organizer_id ?? null,
    })
    const metrics = computeMetrics(allRows)

    const uiStatus = normalizeStatusFilter(statusFilter)
    const filtered = allRows.filter((ticket) => {
      if (uiStatus !== "all" && ticket.status !== uiStatus) return false
      return matchesIssuedTicketQuery(ticket, search ?? "")
    })

    return { success: true, data: { tickets: filtered, metrics } }
  } catch (error) {
    logger.error({
      context: "issued-tickets",
      message: "get_failed",
      event_id: eventId,
      error,
    })
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las entradas.",
    }
  }
}

export async function exportEventTicketsCSV(
  eventId: string,
): Promise<
  ActionResult<{ csv: string; filename: string; rowCount: number }>
> {
  try {
    const access = await requireEventAccess(eventId)
    if (!access.ok) return { success: false, error: access.error }

    const { admin } = access

    const [{ data: event }, { data: ticketRows, error: ticketsError }] =
      await Promise.all([
        admin
          .from("events")
          .select("id, title, organizer_id")
          .eq("id", eventId)
          .maybeSingle(),
        admin
          .from("tickets")
          .select(
            "id, status, qr_code, holder_name, holder_email, holder_dni, scanned_at, validated_at, admissions_used, created_at, transferred_from_id, owner_id, order_id, tier_id, seat_id, seating_unit_id, max_admissions, is_dynamic_qr, max_transfers_allowed, transfer_count, is_test, event_seating_units(label, sector_name, row_label), ticket_tiers(name)",
          )
          .eq("event_id", eventId)
          .eq("is_test", false)
          .neq("status", "pending_payment")
          .order("created_at", { ascending: false }),
      ])

    if (ticketsError) {
      return { success: false, error: ticketsError.message }
    }

    const tickets = (ticketRows ?? []) as unknown as TicketDbRow[]
    const ticketIds = tickets.map((row) => row.id)

    let transfers: TransferDbRow[] = []
    if (ticketIds.length > 0) {
      const { data: transferRows, error: transferError } = await admin
        .from("ticket_transfers")
        .select(
          "id, sender_id, receiver_email, original_ticket_id, new_ticket_id, created_at",
        )
        .or(
          `original_ticket_id.in.(${ticketIds.join(",")}),new_ticket_id.in.(${ticketIds.join(",")})`,
        )
        .order("created_at", { ascending: true })

      if (transferError) {
        return { success: false, error: transferError.message }
      }
      transfers = (transferRows ?? []) as TransferDbRow[]
    }

    const allRows = buildIssuedRows({
      tickets,
      transfers,
      organizerId: event?.organizer_id ?? null,
    })

    const exportable = audienceRowsFromTickets(allRows)
    const csv = withUtf8Bom(buildAudienceCsv(allRows))
    const filename = audienceCsvFilename(
      event?.title ?? "evento",
      eventId,
    )

    return {
      success: true,
      data: {
        csv,
        filename,
        rowCount: exportable.length,
      },
    }
  } catch (error) {
    logger.error({
      context: "issued-tickets",
      message: "export_csv_failed",
      event_id: eventId,
      error,
    })
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo exportar la audiencia.",
    }
  }
}

export async function cancelTicketAdmin(
  ticketId: string,
  reason: string,
): Promise<ActionResult<{ ticketId: string }>> {
  try {
    const trimmedReason = reason.trim()
    if (trimmedReason.length < 3) {
      return {
        success: false,
        error: "Indicá un motivo de anulación (mín. 3 caracteres).",
      }
    }

    const access = await requireTicketEventAccess(ticketId)
    if (!access.ok) return { success: false, error: access.error }

    if (
      access.ticketStatus === "cancelled" ||
      access.ticketStatus === "revoked" ||
      access.ticketStatus === "transferred"
    ) {
      return {
        success: false,
        error: "Esta entrada ya no se puede anular.",
      }
    }

    const { error } = await access.admin
      .from("tickets")
      .update({
        status: "cancelled",
        totp_secret: deadTotpSecret("cancel"),
        scanned_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ticketId)

    if (error) return { success: false, error: error.message }

    logger.info({
      context: "issued-tickets",
      message: "ticket_cancelled",
      event_id: access.eventId,
      ticket_id: ticketId,
      actor_id: access.userId,
      reason: trimmedReason,
    })

    revalidatePath(`/admin/events/${access.eventId}/tickets`)
    revalidatePath("/admin/scanner")
    revalidatePath("/my-tickets")

    return { success: true, data: { ticketId } }
  } catch (error) {
    logger.error({
      context: "issued-tickets",
      message: "cancel_failed",
      ticket_id: ticketId,
      error,
    })
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "No se pudo anular el ticket.",
    }
  }
}

export async function resendTicketEmailAdmin(
  ticketId: string,
): Promise<ActionResult<{ email: string }>> {
  try {
    const access = await requireTicketEventAccess(ticketId)
    if (!access.ok) return { success: false, error: access.error }

    if (
      access.ticketStatus === "cancelled" ||
      access.ticketStatus === "revoked" ||
      access.ticketStatus === "transferred"
    ) {
      return {
        success: false,
        error: "No se puede reenviar una entrada anulada o transferida.",
      }
    }

    const { data: ticket, error } = await access.admin
      .from("tickets")
      .select(
        "id, holder_name, holder_email, events(title)",
      )
      .eq("id", ticketId)
      .maybeSingle()

    if (error || !ticket) {
      return { success: false, error: "Entrada no encontrada." }
    }

    const email = ticket.holder_email?.trim().toLowerCase()
    if (!email || !email.includes("@")) {
      return {
        success: false,
        error: "El titular no tiene un email válido para reenviar.",
      }
    }

    const eventsJoin = ticket.events as unknown as
      | { title: string }
      | { title: string }[]
      | null
    const eventTitle =
      (Array.isArray(eventsJoin) ? eventsJoin[0]?.title : eventsJoin?.title) ||
      "Evento Tokepass"

    await notifyLivingTicketEmail({
      toEmail: email,
      holderName: ticket.holder_name?.trim() || "Titular",
      eventTitle,
      ticketId,
      ticketCode: ticketDisplayCode(ticketId),
    })

    return { success: true, data: { email } }
  } catch (error) {
    logger.error({
      context: "issued-tickets",
      message: "resend_failed",
      ticket_id: ticketId,
      error,
    })
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo reenviar el email.",
    }
  }
}

export async function updateTicketHolderAdmin(
  ticketId: string,
  holder: { name: string; email: string; dni: string },
): Promise<ActionResult<{ ticketId: string }>> {
  try {
    const name = holder.name.trim()
    const email = holder.email.trim().toLowerCase()
    const dni = holder.dni.trim()

    if (name.length < 3 || !email.includes("@") || dni.length < 6) {
      return {
        success: false,
        error: "Revisá nombre, email y DNI del titular.",
      }
    }

    const access = await requireTicketEventAccess(ticketId)
    if (!access.ok) return { success: false, error: access.error }

    if (
      access.ticketStatus === "cancelled" ||
      access.ticketStatus === "revoked" ||
      access.ticketStatus === "transferred"
    ) {
      return {
        success: false,
        error: "No se puede editar el titular de esta entrada.",
      }
    }

    const { error } = await access.admin
      .from("tickets")
      .update({
        holder_name: name,
        holder_email: email,
        holder_dni: dni,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ticketId)

    if (error) return { success: false, error: error.message }

    revalidatePath(`/admin/events/${access.eventId}/tickets`)
    revalidatePath("/my-tickets")

    return { success: true, data: { ticketId } }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el titular.",
    }
  }
}

export async function reassignTicketAdmin(
  ticketId: string,
  newHolder: { name: string; email: string; dni: string },
): Promise<ActionResult<{ newTicketId: string; code: string }>> {
  try {
    const name = newHolder.name.trim()
    const email = newHolder.email.trim().toLowerCase()
    const dni = newHolder.dni.trim()

    if (name.length < 3 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return {
        success: false,
        error: "Completá nombre y un email válido del nuevo titular.",
      }
    }
    if (dni.length < 6) {
      return { success: false, error: "Indicá un DNI válido." }
    }

    const access = await requireTicketEventAccess(ticketId)
    if (!access.ok) return { success: false, error: access.error }

    if (access.ticketStatus !== "valid") {
      return {
        success: false,
        error:
          "Solo se pueden reasignar entradas válidas (no ingresadas, anuladas ni ya transferidas).",
      }
    }

    const { data: source, error: sourceError } = await access.admin
      .from("tickets")
      .select(
        "id, event_id, tier_id, owner_id, order_id, seat_id, seating_unit_id, max_admissions, admissions_used, is_dynamic_qr, max_transfers_allowed, transfer_count, totp_secret, holder_email, holder_name, holder_dni, status, events(title, organizer_id, max_tickets_per_user)",
      )
      .eq("id", ticketId)
      .maybeSingle()

    if (sourceError || !source) {
      return { success: false, error: "Entrada no encontrada." }
    }

    if (source.holder_email?.trim().toLowerCase() === email) {
      return {
        success: false,
        error: "El nuevo titular debe ser otra persona.",
      }
    }

    if (source.transfer_count >= source.max_transfers_allowed) {
      return {
        success: false,
        error: "Esta entrada ya alcanzó el límite de transferencias.",
      }
    }

    const eventsJoin = source.events as unknown as
      | {
          title: string
          organizer_id: string
          max_tickets_per_user: number | null
        }
      | {
          title: string
          organizer_id: string
          max_tickets_per_user: number | null
        }[]
      | null
    const eventMeta = Array.isArray(eventsJoin) ? eventsJoin[0] : eventsJoin
    const eventTitle = eventMeta?.title ?? "Evento Tokepass"
    const maxPerUser = eventMeta?.max_tickets_per_user ?? 10

    const { data: receiverProfile } = await access.admin
      .from("profiles")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle()

    const receiverId = receiverProfile?.id ?? null

    if (receiverId && source.owner_id && receiverId === source.owner_id) {
      return {
        success: false,
        error: "El nuevo titular debe ser otra persona.",
      }
    }

    if (receiverId) {
      const { count } = await access.admin
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("event_id", source.event_id)
        .eq("owner_id", receiverId)
        .in("status", ["valid", "pending_payment"])

      if ((count ?? 0) >= maxPerUser) {
        return {
          success: false,
          error:
            "El destinatario ya alcanzó el máximo de entradas para este evento.",
        }
      }
    }

    const now = new Date().toISOString()
    const newQr = `xfer_${randomUUID().replace(/-/g, "")}`
    const newSecret = freshTotpSecret()

    const { error: invalidateError } = await access.admin
      .from("tickets")
      .update({
        status: "transferred",
        seat_id: null,
        seating_unit_id: null,
        totp_secret: deadTotpSecret("xfer"),
        updated_at: now,
      })
      .eq("id", ticketId)
      .eq("status", "valid")

    if (invalidateError) {
      return { success: false, error: invalidateError.message }
    }

    const { data: created, error: insertError } = await access.admin
      .from("tickets")
      .insert({
        event_id: source.event_id,
        tier_id: source.tier_id,
        owner_id: receiverId,
        qr_code: newQr,
        status: "valid",
        order_id: source.order_id,
        seat_id: source.seat_id,
        seating_unit_id: source.seating_unit_id,
        max_admissions: source.max_admissions,
        admissions_used: source.admissions_used,
        is_dynamic_qr: source.is_dynamic_qr ?? true,
        totp_secret: newSecret,
        max_transfers_allowed: source.max_transfers_allowed,
        transfer_count: source.transfer_count + 1,
        transferred_from_id: ticketId,
        holder_name: name,
        holder_email: email,
        holder_dni: dni,
        is_test: false,
      })
      .select("id")
      .single()

    if (insertError || !created) {
      await access.admin
        .from("tickets")
        .update({
          status: "valid",
          seat_id: source.seat_id,
          seating_unit_id: source.seating_unit_id,
          totp_secret: source.totp_secret,
          updated_at: now,
        })
        .eq("id", ticketId)
        .eq("status", "transferred")

      return {
        success: false,
        error: insertError?.message ?? "No se pudo emitir el nuevo ticket.",
      }
    }

    const { error: transferError } = await access.admin
      .from("ticket_transfers")
      .insert({
        sender_id: access.userId,
        receiver_email: email,
        original_ticket_id: ticketId,
        new_ticket_id: created.id,
      })

    if (transferError) {
      logger.error({
        context: "issued-tickets",
        message: "transfer_row_failed",
        ticket_id: ticketId,
        new_ticket_id: created.id,
        error: transferError,
      })
    }

    void notifyLivingTicketEmail({
      toEmail: email,
      holderName: name,
      eventTitle,
      ticketId: created.id,
      ticketCode: ticketDisplayCode(created.id),
    }).catch((notifyError: unknown) => {
      logger.error({
        context: "issued-tickets",
        message: "reassign_notify_failed",
        ticket_id: created.id,
        error: notifyError,
      })
    })

    void notifyTicketTransfer({
      receiverEmail: email,
      eventTitle,
      senderUserId: access.userId,
    }).catch(() => undefined)

    revalidatePath(`/admin/events/${access.eventId}/tickets`)
    revalidatePath("/admin/scanner")
    revalidatePath("/my-tickets")

    return {
      success: true,
      data: {
        newTicketId: created.id,
        code: ticketDisplayCode(created.id),
      },
    }
  } catch (error) {
    logger.error({
      context: "issued-tickets",
      message: "reassign_failed",
      ticket_id: ticketId,
      error,
    })
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo reasignar la entrada.",
    }
  }
}
