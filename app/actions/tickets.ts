"use server"

import { createClient } from "@/lib/supabase/server"
import {
  formatDayValidityLabel,
  parseScheduleDays,
} from "@/lib/event-schedule"
import { fetchPublicOrganizerCards } from "@/lib/public-organizer"
import type { QrType, TicketStatus } from "@/types/database"

export type MyTicket = {
  id: string
  status: TicketStatus
  qrCode: string
  totpSecret: string
  transferCount: number
  maxTransfersAllowed: number
  createdAt: string
  tierName: string
  bonusReward: string | null
  dayId: string | null
  dayValidityLabel: string | null
  seatingLabel: string | null
  seatingSectorName: string | null
  seatingRowLabel: string | null
  seatingLayoutType: "table_combo" | "numbered_seat" | null
  maxAdmissions: number
  admissionsUsed: number
  eventId: string
  eventTitle: string
  eventDate: string
  eventLocation: string
  flyerUrl: string | null
  socialShareImageUrl: string | null
  organizerName: string | null
  organizerAvatarUrl: string | null
  venueName: string | null
  qrType: QrType
  holderName: string
  holderDni: string | null
  isTest: boolean
  /** Precio público All-In del tier (0 = gratuita). */
  tierPrice: number
  isSponsoredByTokepass: boolean
  /** Listado activo en marketplace de reventa (si existe). */
  activeResaleListingId: string | null
}

type TicketRow = {
  id: string
  status: TicketStatus
  qr_code: string
  totp_secret: string
  transfer_count: number
  max_transfers_allowed: number
  created_at: string
  is_dynamic_qr: boolean
  max_admissions: number
  admissions_used: number
  is_test?: boolean | null
  event_seating_units: {
    label: string
    sector_name: string
    row_label: string | null
    layout_type: "table_combo" | "numbered_seat"
    capacity_per_unit: number
  } | null
  ticket_tiers: {
    name: string
    bonus_reward: string | null
    day_id: string | null
    price?: number | null
  } | null
  events: {
    id: string
    title: string
    date: string
    location: string
    flyer_url: string | null
    image_url: string | null
    qr_type: QrType | null
    schedule_days: unknown
    is_sponsored_by_tokepass?: boolean | null
    organizer_id?: string | null
    social_share_image_url?: string | null
    venues: { name: string } | null
  } | null
}

export async function getMyTickets(): Promise<MyTicket[]> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error("auth_required")
  }

  await supabase.rpc("claim_pending_ticket_transfers", {
    p_user_id: user.id,
  })

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, dni")
    .eq("id", user.id)
    .maybeSingle()

  const holderName = profile?.full_name?.trim() || "Titular"
  const holderDni = profile?.dni ?? null

  const { data, error } = await supabase
    .from("tickets")
    .select(
      "id, status, order_id, qr_code, totp_secret, transfer_count, max_transfers_allowed, created_at, is_dynamic_qr, max_admissions, admissions_used, is_test, event_seating_units(label, sector_name, row_label, layout_type, capacity_per_unit), ticket_tiers(name, bonus_reward, day_id, price), events(id, title, date, location, flyer_url, image_url, qr_type, schedule_days, is_sponsored_by_tokepass, organizer_id, social_share_image_url, venues(name)), orders(status)",
    )
    .eq("owner_id", user.id)
    .in("status", ["valid", "used", "scanned", "transferred"])
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`No se pudieron cargar tus entradas: ${error.message}`)
  }

  type WalletRow = TicketRow & {
    order_id: string | null
    orders: { status: string } | null
  }

  const walletRows = (data ?? []) as unknown as WalletRow[]
  const organizers = await fetchPublicOrganizerCards(
    supabase,
    walletRows
      .map((ticket) => ticket.events?.organizer_id)
      .filter((id): id is string => Boolean(id)),
  )

  const tickets = walletRows
    .flatMap((ticket) => {
      if (!ticket.events) return []

      // Never surface unpaid / pending_payment tickets as Living QR-ready.
      if (ticket.status === "pending_payment") return []
      if (
        ticket.status === "valid" &&
        ticket.order_id &&
        ticket.orders?.status !== "paid"
      ) {
        return []
      }

      const qrType: QrType =
        ticket.events.qr_type === "static" || ticket.is_dynamic_qr === false
          ? "static"
          : "dynamic"

      const scheduleDays = parseScheduleDays(ticket.events.schedule_days)
      const dayId = ticket.ticket_tiers?.day_id ?? null

      const organizer = ticket.events.organizer_id
        ? organizers.get(ticket.events.organizer_id)
        : undefined

      const mapped: MyTicket = {
        id: ticket.id,
        status: ticket.status,
        qrCode: ticket.qr_code,
        totpSecret: ticket.totp_secret || ticket.id,
        transferCount: ticket.transfer_count ?? 0,
        maxTransfersAllowed: ticket.max_transfers_allowed ?? 1,
        createdAt: ticket.created_at,
        tierName: ticket.ticket_tiers?.name ?? "Entrada",
        bonusReward: ticket.ticket_tiers?.bonus_reward ?? null,
        dayId,
        dayValidityLabel: formatDayValidityLabel({
          scheduleDays,
          dayId,
          eventTitle: ticket.events.title,
        }),
        seatingLabel: ticket.event_seating_units?.label ?? null,
        seatingSectorName:
          ticket.event_seating_units?.sector_name ?? null,
        seatingRowLabel: ticket.event_seating_units?.row_label ?? null,
        seatingLayoutType:
          ticket.event_seating_units?.layout_type ?? null,
        maxAdmissions: Number(ticket.max_admissions ?? 1),
        admissionsUsed: Number(ticket.admissions_used ?? 0),
        eventId: ticket.events.id,
        eventTitle: ticket.events.title,
        eventDate: ticket.events.date,
        eventLocation: ticket.events.location,
        flyerUrl: ticket.events.flyer_url ?? ticket.events.image_url,
        socialShareImageUrl:
          ticket.events.social_share_image_url?.trim() || null,
        organizerName: organizer?.name ?? null,
        organizerAvatarUrl: organizer?.avatarUrl ?? null,
        venueName: ticket.events.venues?.name ?? null,
        qrType,
        holderName,
        holderDni,
        isTest: Boolean(ticket.is_test),
        tierPrice: Number(ticket.ticket_tiers?.price ?? 0),
        isSponsoredByTokepass: Boolean(
          ticket.events.is_sponsored_by_tokepass,
        ),
        activeResaleListingId: null,
      }
      return [mapped]
    })

  const ticketIds = tickets.map((t) => t.id)
  if (ticketIds.length > 0) {
    const { data: listings } = await supabase
      .from("ticket_resale_listings")
      .select("id, ticket_id")
      .in("ticket_id", ticketIds)
      .eq("status", "active")

    const byTicket = new Map(
      (listings ?? []).map((row) => [row.ticket_id, row.id]),
    )
    for (const ticket of tickets) {
      ticket.activeResaleListingId = byTicket.get(ticket.id) ?? null
    }
  }

  tickets.sort(
    (a, b) =>
      new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime(),
  )

  return tickets
}
