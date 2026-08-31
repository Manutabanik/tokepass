import { randomBytes, randomUUID } from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { OrderEmailTicket } from "@/emails/OrderConfirmationEmail"
import { logger } from "@/lib/logger"
import type { Database, TicketStatus } from "@/types/database"

type TicketInsert = Database["public"]["Tables"]["tickets"]["Insert"]

export type OrderEmailData = {
  to: string
  customerName: string
  orderNumber: string
  eventName: string
  eventDate: string
  eventVenue: string
  eventBannerUrl?: string
  totalAmount: number | string
  tickets: OrderEmailTicket[]
  accountUrl?: string
  isTest?: boolean
}

export type ExpandableAccessTicket = {
  id: string
  event_id: string
  tier_id: string
  owner_id: string | null
  order_id: string | null
  seating_unit_id: string | null
  seat_id: string | null
  status: TicketStatus
  holder_name: string | null
  holder_dni: string | null
  holder_email: string | null
  is_dynamic_qr: boolean
  max_transfers_allowed: number
  is_test: boolean
  ticket_type: "admission" | "parking" | "access_pass"
  phase_id: string | null
  batch_id: string | null
  group_id: string | null
  group_slot: number | null
  max_admissions: number
}

export type GroupExpansionPlan = {
  parentId: string
  groupId: string
  total: number
  extraSlots: number[]
}

export function missingGroupSlots(
  total: number,
  existingSlots: Array<number | null | undefined>,
): number[] {
  const capped = Math.max(1, Math.min(100, Math.floor(total) || 1))
  const have = new Set(
    existingSlots
      .map((slot) => (typeof slot === "number" ? Math.floor(slot) : 0))
      .filter((slot) => slot >= 1),
  )
  const missing: number[] = []
  for (let slot = 1; slot <= capped; slot += 1) {
    if (!have.has(slot)) missing.push(slot)
  }
  return missing
}

export function planGroupTicketExpansion(
  tickets: Array<Pick<ExpandableAccessTicket, "id" | "max_admissions" | "group_id">>,
): GroupExpansionPlan[] {
  const plans: GroupExpansionPlan[] = []
  for (const ticket of tickets) {
    const total = Math.max(1, Math.min(100, Math.floor(ticket.max_admissions) || 1))
    if (total <= 1) continue
    plans.push({
      parentId: ticket.id,
      groupId: ticket.group_id?.trim() || randomUUID(),
      total,
      extraSlots: missingGroupSlots(total, [1]),
    })
  }
  return plans
}

export function ticketValidationUrl(appUrl: string, ticketId: string): string {
  return `${appUrl.replace(/\/$/, "")}/valida/${ticketId}`
}

export function ticketPassLabel(input: {
  seatingLabel?: string | null
  sectorName?: string | null
  tierName?: string | null
  groupSlot?: number | null
  groupSize: number
}): string {
  const place =
    input.seatingLabel?.trim() ||
    input.sectorName?.trim() ||
    input.tierName?.trim() ||
    "Entrada"
  const slot = Math.max(0, Math.floor(input.groupSlot ?? 0))
  if (input.groupSize > 1 && slot > 0) {
    return `${place} - Pase ${slot} de ${input.groupSize}`
  }
  return place
}

function newTotpSecret(): string {
  return randomBytes(24).toString("hex")
}

export async function expandIndividualAccessTickets(
  admin: SupabaseClient,
  orderId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("tickets")
    .select(
      "id, event_id, tier_id, owner_id, order_id, seating_unit_id, seat_id, status, holder_name, holder_dni, holder_email, is_dynamic_qr, max_transfers_allowed, is_test, ticket_type, phase_id, batch_id, group_id, group_slot, max_admissions",
    )
    .eq("order_id", orderId)

  if (error) {
    logger.error({
      context: "email/order-tickets",
      message: "expand_tickets_load_failed",
      order_id: orderId,
      error: error.message,
    })
    throw new Error(error.message)
  }

  const tickets = (data ?? []) as ExpandableAccessTicket[]
  const plans = planGroupTicketExpansion(tickets)
  if (plans.length === 0) return 0

  const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]))

  const groupAssignments = await Promise.all(
    plans.map(async (plan) => {
      const { error: assignError } = await admin
        .from("tickets")
        .update({ group_id: plan.groupId, group_slot: 1 })
        .eq("id", plan.parentId)
        .eq("order_id", orderId)
      if (assignError) {
        logger.error({
          context: "email/order-tickets",
          message: "expand_tickets_group_assign_failed",
          order_id: orderId,
          error: assignError.message,
        })
        throw new Error(assignError.message)
      }
      return plan
    }),
  )

  const extras: TicketInsert[] = []
  for (const plan of groupAssignments) {
    const parent = byId.get(plan.parentId)
    if (!parent) continue
    const siblings = tickets.filter((ticket) => {
      if (ticket.id === parent.id) return false
      if (ticket.group_id && ticket.group_id === plan.groupId) return true
      return Boolean(
        parent.seating_unit_id &&
          ticket.seating_unit_id === parent.seating_unit_id,
      )
    })
    const slotsToCreate = missingGroupSlots(plan.total, [
      1,
      ...siblings.map((ticket) => ticket.group_slot),
    ]).filter((slot) => slot > 1)

    for (const slot of slotsToCreate) {
      extras.push({
        event_id: parent.event_id,
        tier_id: parent.tier_id,
        owner_id: parent.owner_id,
        order_id: parent.order_id,
        seating_unit_id: parent.seating_unit_id,
        seat_id: parent.seat_id,
        status: parent.status,
        holder_name: parent.holder_name,
        holder_dni: parent.holder_dni,
        holder_email: parent.holder_email,
        is_dynamic_qr: parent.is_dynamic_qr,
        max_transfers_allowed: parent.max_transfers_allowed,
        is_test: parent.is_test,
        ticket_type: parent.ticket_type,
        phase_id: parent.phase_id,
        batch_id: parent.batch_id,
        qr_code: randomUUID(),
        totp_secret: newTotpSecret(),
        group_id: plan.groupId,
        group_slot: slot,
        max_admissions: 1,
        admissions_used: 0,
      })
    }
  }

  if (extras.length > 0) {
    const { error: insertError } = await admin.from("tickets").insert(extras)
    if (insertError) {
      logger.error({
        context: "email/order-tickets",
        message: "expand_tickets_insert_failed",
        order_id: orderId,
        error: insertError.message,
      })
      throw new Error(insertError.message)
    }
  }

  await Promise.all(
    groupAssignments.map(async (plan) => {
      const { error: updateError } = await admin
        .from("tickets")
        .update({
          group_id: plan.groupId,
          group_slot: 1,
          max_admissions: 1,
        })
        .eq("id", plan.parentId)
        .eq("order_id", orderId)
      if (updateError) {
        logger.error({
          context: "email/order-tickets",
          message: "expand_tickets_parent_update_failed",
          order_id: orderId,
          error: updateError.message,
        })
        throw new Error(updateError.message)
      }
    }),
  )

  return extras.length
}

export function httpImageUrl(value: string | null | undefined): string | undefined {
  const url = value?.trim()
  if (!url) return undefined
  if (!/^https?:\/\//i.test(url)) return undefined
  return url
}

export function formatOrderNumber(orderId: string): string {
  return `TP-${orderId.replace(/-/g, "").slice(0, 8).toUpperCase()}`
}

export function buildOrderEmailTickets(input: {
  tickets: Array<{
    id: string
    group_id: string | null
    group_slot: number | null
    ticket_tiers?: { name?: string | null } | { name?: string | null }[] | null
    event_seating_units?:
      | { label?: string | null; sector_name?: string | null }
      | { label?: string | null; sector_name?: string | null }[]
      | null
  }>
}): OrderEmailTicket[] {
  const groupSizes = new Map<string, number>()
  for (const ticket of input.tickets) {
    const groupId = ticket.group_id?.trim()
    if (!groupId) continue
    groupSizes.set(groupId, (groupSizes.get(groupId) ?? 0) + 1)
  }

  return input.tickets.map((ticket) => {
    const tier = Array.isArray(ticket.ticket_tiers)
      ? ticket.ticket_tiers[0]
      : ticket.ticket_tiers
    const unit = Array.isArray(ticket.event_seating_units)
      ? ticket.event_seating_units[0]
      : ticket.event_seating_units
    const groupId = ticket.group_id?.trim() ?? ""
    const groupSize = groupId ? (groupSizes.get(groupId) ?? 1) : 1
    return {
      id: ticket.id,
      label: ticketPassLabel({
        seatingLabel: unit?.label,
        sectorName: unit?.sector_name,
        tierName: tier?.name,
        groupSlot: ticket.group_slot,
        groupSize,
      }),
    }
  })
}
