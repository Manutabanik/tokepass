"use server"

import { cookies } from "next/headers"

import {
  GUEST_ACCESS_ERROR,
  GUEST_OTP_ERROR,
  GUEST_OTP_LOCKED_ERROR,
  GUEST_ORDER_COOKIE,
  GUEST_OTP_COOKIE,
  generateGuestOtp,
  guestAccessCookieAttrs,
  guestOtpExpiresAt,
  hashGuestSecret,
  holderEmailsMatch,
  otpEquals,
  signGuestOtpSession,
  verifyGuestAccessToken,
  verifyGuestOtpSession,
} from "@/lib/checkout/guest-access"
import { guestTicketUrl, isGuestOrderToken } from "@/lib/checkout/guest-token"
import { persistOrderGuestToken } from "@/lib/checkout/server-guards"
import {
  findScheduleDay,
  parseScheduleDays,
  resolveEventAnchorDate,
  resolveEventEndsAt,
} from "@/lib/event-schedule"
import { consumeRateLimit } from "@/lib/rate-limit"
import { getRequestIp } from "@/lib/request-ip"
import {
  AUTH_RATE_LIMIT_ERROR,
  consumeNamedRateLimit,
} from "@/lib/security/distributed-rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { MyTicket } from "@/app/actions/tickets"
import { parseDeliveryMode } from "@/lib/events/delivery-mode"
import { isMissingTicketWalletColumnError } from "@/lib/tickets/wallet-query"
import type { OrderStatus, TicketStatus } from "@/types/database"

const MAX_OTP_ATTEMPTS = 5

export type GuestTicketPreview = {
  id: string
  eventTitle: string
  eventDate: string
  eventLocation: string
  tierName: string
  status: string
}

export type GuestOrderWallet = {
  orderId: string
  orderStatus: OrderStatus
  tickets: MyTicket[]
}

export async function issueGuestReceiptAccess(
  orderId: string,
): Promise<{ magicUrl: string; otp: string; email: string } | null> {
  const token = await persistOrderGuestToken(orderId)
  if (!token) return null

  const admin = createAdminClient()
  const { data: ticket } = await admin
    .from("tickets")
    .select("holder_email")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle()
  const email = ticket?.holder_email?.trim().toLowerCase() ?? ""
  return {
    magicUrl: guestTicketUrl(token),
    otp: "",
    email,
  }
}

export async function attachGuestAccessToReceipt(input: {
  orderId: string
  email: string
}): Promise<{ magicUrl: string; otp: string } | null> {
  const token = await persistOrderGuestToken(input.orderId)
  if (!token) return null
  return {
    magicUrl: guestTicketUrl(token),
    otp: "",
  }
}

export async function claimGuestMagicLink(
  token: string,
): Promise<{ ok: true; orderId: string } | { ok: false; error: string }> {
  const parsed = await verifyGuestAccessToken(token)
  if (!parsed) return { ok: false, error: GUEST_ACCESS_ERROR }

  const admin = createAdminClient()
  const { data: challenge } = await admin
    .from("guest_access_challenges")
    .select("id, expires_at")
    .eq("magic_jti", parsed.jti)
    .maybeSingle()

  if (!challenge || new Date(challenge.expires_at).getTime() < Date.now()) {
    return { ok: false, error: GUEST_ACCESS_ERROR }
  }

  return { ok: true, orderId: parsed.orderId }
}

export async function listGuestOrderTickets(): Promise<GuestTicketPreview[]> {
  const store = await cookies()
  const token = store.get(GUEST_ORDER_COOKIE)?.value
  if (!token) return []
  const parsed = await verifyGuestAccessToken(token)
  if (!parsed) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from("tickets")
    .select(
      "id, status, ticket_tiers!tickets_tier_id_fkey(name), events(title, date, location)",
    )
    .eq("order_id", parsed.orderId)
    .in("status", ["valid", "used", "scanned"])

  return (data ?? []).map((row) => {
    const events = row.events as
      | { title?: string; date?: string; location?: string }
      | { title?: string; date?: string; location?: string }[]
      | null
    const event = Array.isArray(events) ? events[0] : events
    const tiers = row.ticket_tiers as { name?: string } | { name?: string }[] | null
    const tier = Array.isArray(tiers) ? tiers[0] : tiers
    return {
      id: row.id,
      eventTitle: event?.title ?? "Evento",
      eventDate: event?.date ?? "",
      eventLocation: event?.location ?? "",
      tierName: tier?.name ?? "Entrada",
      status: row.status,
    }
  })
}

const GUEST_SEATING_EMBED =
  "event_seating_units(label, sector_name, row_label, layout_type)"
const GUEST_TICKET_DETAIL_SELECT =
  `id, status, order_id, event_id, qr_code, totp_secret, transfer_count, max_transfers_allowed, created_at, is_dynamic_qr, max_admissions, admissions_used, is_test, holder_name, holder_dni, ${GUEST_SEATING_EMBED}, ticket_tiers!tickets_tier_id_fkey(name, bonus_reward, day_id, price), events(id, title, date, ends_at, location, flyer_url, image_url, qr_type, social_share_image_url, schedule_days, delivery_mode, access_link, venues(name))`
const GUEST_TICKET_DETAIL_SELECT_LEGACY =
  `id, status, order_id, event_id, qr_code, totp_secret, transfer_count, max_transfers_allowed, created_at, is_dynamic_qr, max_admissions, admissions_used, is_test, holder_name, holder_dni, ${GUEST_SEATING_EMBED}, ticket_tiers!tickets_tier_id_fkey(name, bonus_reward, day_id, price), events(id, title, date, ends_at, location, flyer_url, image_url, qr_type, social_share_image_url, schedule_days, venues(name))`

type GuestTicketDetailRow = {
  id: string
  status: TicketStatus
  order_id: string
  event_id?: string | null
  qr_code: string | null
  totp_secret: string | null
  transfer_count: number
  max_transfers_allowed: number
  created_at: string
  is_dynamic_qr?: boolean | null
  max_admissions?: number | null
  admissions_used?: number | null
  is_test?: boolean | null
  holder_name?: string | null
  holder_dni?: string | null
  event_seating_units?:
    | {
        label?: string | null
        sector_name?: string | null
        row_label?: string | null
        layout_type?: "table_combo" | "numbered_seat" | null
      }
    | {
        label?: string | null
        sector_name?: string | null
        row_label?: string | null
        layout_type?: "table_combo" | "numbered_seat" | null
      }[]
    | null
  ticket_tiers?:
    | { name?: string; bonus_reward?: string | null; day_id?: string | null; price?: number }
    | { name?: string; bonus_reward?: string | null; day_id?: string | null; price?: number }[]
    | null
  events?:
    | {
        id: string
        title: string
        date: string
        ends_at?: string | null
        location: string | null
        flyer_url?: string | null
        image_url?: string | null
        qr_type?: string | null
        social_share_image_url?: string | null
        schedule_days?: unknown
        delivery_mode?: string | null
        access_link?: string | null
        venues?: { name?: string | null } | { name?: string | null }[] | null
      }
    | {
        id: string
        title: string
        date: string
        ends_at?: string | null
        location: string | null
        flyer_url?: string | null
        image_url?: string | null
        qr_type?: string | null
        social_share_image_url?: string | null
        schedule_days?: unknown
        delivery_mode?: string | null
        access_link?: string | null
        venues?: { name?: string | null } | { name?: string | null }[] | null
      }[]
    | null
}

function mapGuestTicketRow(row: GuestTicketDetailRow, revealQr: boolean): MyTicket | null {
  const eventsRaw = row.events
  const events =
    (Array.isArray(eventsRaw) ? eventsRaw[0] : eventsRaw) ??
    (row.event_id
      ? {
          id: row.event_id,
          title: "Evento",
          date: row.created_at,
          location: null,
          flyer_url: null,
          image_url: null,
          qr_type: null,
          schedule_days: null,
          venues: null,
        }
      : null)
  if (!events) return null
  const venueRaw = events.venues
  const venue = Array.isArray(venueRaw) ? venueRaw[0] : venueRaw
  const tierRaw = row.ticket_tiers
  const tier = Array.isArray(tierRaw) ? tierRaw[0] : tierRaw
  const seatingRaw = row.event_seating_units
  const seating = Array.isArray(seatingRaw) ? seatingRaw[0] : seatingRaw
  const seatingLayout =
    seating?.layout_type === "table_combo" || seating?.layout_type === "numbered_seat"
      ? seating.layout_type
      : null
  const scheduleDays = parseScheduleDays(events.schedule_days)

  return {
    id: row.id,
    status: row.status,
    qrCode: revealQr ? row.qr_code : null,
    totpSecret: revealQr ? row.totp_secret : null,
    deliveryMode: parseDeliveryMode(events.delivery_mode),
    accessLink: events.access_link?.trim() || null,
    transferCount: row.transfer_count,
    maxTransfersAllowed: row.max_transfers_allowed,
    createdAt: row.created_at,
    tierName: tier?.name ?? "Entrada",
    bonusReward: tier?.bonus_reward ?? null,
    dayId: tier?.day_id ?? null,
    dayValidityLabel: null,
    seatingLabel: seating?.label ?? null,
    seatingSectorName: seating?.sector_name ?? null,
    seatingRowLabel: seating?.row_label ?? null,
    seatingLayoutType: seatingLayout,
    maxAdmissions: Number(row.max_admissions ?? 1),
    admissionsUsed: Number(row.admissions_used ?? 0),
    eventId: events.id,
    eventTitle: events.title,
    eventDate: events.date,
    endsAt: resolveEventEndsAt(scheduleDays, events.ends_at, events.date),
    doorsOpenAt:
      findScheduleDay(scheduleDays, tier?.day_id ?? undefined)?.start_time ??
      resolveEventAnchorDate(scheduleDays, events.date),
    eventLocation: events.location?.trim() || "Online",
    flyerUrl: events.flyer_url ?? events.image_url ?? null,
    socialShareImageUrl: events.social_share_image_url ?? null,
    organizerName: null,
    organizerAvatarUrl: null,
    venueName: venue?.name ?? null,
    qrType: events.qr_type === "static" ? "static" : "dynamic",
    holderName: row.holder_name ?? "Invitado",
    holderDni: row.holder_dni ?? null,
    orderId: row.order_id,
    orderCreatedAt: null,
    isTest: Boolean(row.is_test),
    tierPrice: Number(tier?.price ?? 0),
    isSponsoredByTokePass: false,
    activeResaleListingId: null,
    pendingTransfer: null,
    visualStatus: "active",
  }
}

export async function getGuestOrderWallet(
  guestToken: string,
): Promise<GuestOrderWallet | null> {
  if (!isGuestOrderToken(guestToken)) return null

  try {
    const admin = createAdminClient()
    const { data: order } = await admin
      .from("orders")
      .select("id, status")
      .eq("guest_token", guestToken.trim().toLowerCase())
      .maybeSingle()

    if (!order) return null

    const queried = await admin
      .from("tickets")
      .select(GUEST_TICKET_DETAIL_SELECT)
      .eq("order_id", order.id)
      .in("status", ["valid", "used", "scanned", "pending_payment"])
      .order("created_at", { ascending: true })

    let rows = queried.data as GuestTicketDetailRow[] | null
    if (
      queried.error &&
      isMissingTicketWalletColumnError(queried.error.message)
    ) {
      const retry = await admin
        .from("tickets")
        .select(GUEST_TICKET_DETAIL_SELECT_LEGACY)
        .eq("order_id", order.id)
        .in("status", ["valid", "used", "scanned", "pending_payment"])
        .order("created_at", { ascending: true })
      rows = (retry.data ?? null) as GuestTicketDetailRow[] | null
    }

    const tickets = (rows ?? [])
      .map((row) =>
        mapGuestTicketRow(row as GuestTicketDetailRow, order.status === "paid"),
      )
      .filter((ticket): ticket is MyTicket => Boolean(ticket))

    return {
      orderId: order.id,
      orderStatus: order.status,
      tickets,
    }
  } catch (error) {
    console.error("[getGuestOrderWallet]", error)
    return null
  }
}

export async function isGuestOtpVerified(orderId: string): Promise<boolean> {
  const store = await cookies()
  const token = store.get(GUEST_OTP_COOKIE)?.value
  if (!token) return false
  return verifyGuestOtpSession(token, orderId)
}

async function guestHasOrderPossession(
  orderId: string,
  holderEmail: string,
  providedEmail?: string,
): Promise<boolean> {
  const store = await cookies()

  const accessToken = store.get(GUEST_ORDER_COOKIE)?.value
  if (accessToken) {
    const parsed = await verifyGuestAccessToken(accessToken)
    if (parsed?.orderId === orderId) return true
  }

  const otpToken = store.get(GUEST_OTP_COOKIE)?.value
  if (otpToken && (await verifyGuestOtpSession(otpToken, orderId))) {
    return true
  }

  return holderEmailsMatch(providedEmail, holderEmail)
}

async function issueGuestOtpChallenge(input: {
  orderId: string
  email: string
}): Promise<{ otp: string; magicUrl: string } | null> {
  const token = await persistOrderGuestToken(input.orderId)
  if (!token) return null

  const otp = generateGuestOtp()
  const jti = crypto.randomUUID()
  const admin = createAdminClient()
  const { error } = await admin.from("guest_access_challenges").insert({
    order_id: input.orderId,
    email: input.email,
    otp_hash: hashGuestSecret(otp, jti),
    magic_jti: jti,
    expires_at: guestOtpExpiresAt(),
  })
  if (error) return null

  return { otp, magicUrl: guestTicketUrl(token) }
}

export async function requestGuestOtpResend(
  orderId: string,
  options?: { email?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data: ticket } = await admin
    .from("tickets")
    .select("holder_email")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle()
  const email = ticket?.holder_email?.trim().toLowerCase()
  if (!email) return { ok: false, error: GUEST_ACCESS_ERROR }

  const possessed = await guestHasOrderPossession(
    orderId,
    email,
    options?.email,
  )
  if (!possessed) return { ok: false, error: GUEST_ACCESS_ERROR }

  const ipAllowed = await consumeNamedRateLimit("authIp", await getRequestIp())
  if (!ipAllowed) {
    return { ok: false, error: AUTH_RATE_LIMIT_ERROR }
  }

  const allowed = await consumeRateLimit({
    bucketKey: `guest-otp:${orderId}`,
    limit: 1,
    windowSeconds: 60,
    useAdmin: true,
  })
  if (!allowed) {
    return { ok: false, error: "Esperá un minuto para pedir un código nuevo." }
  }

  const access = await issueGuestOtpChallenge({ orderId, email })
  if (!access) return { ok: false, error: GUEST_ACCESS_ERROR }

  const { sendGuestOtpEmail } = await import("@/lib/email/resend")
  await sendGuestOtpEmail({
    to: email,
    otp: access.otp,
    magicUrl: access.magicUrl,
  })
  return { ok: true }
}

export async function verifyGuestTicketOtp(input: {
  orderId: string
  code: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = input.code.replace(/\D/g, "").slice(0, 4)
  if (code.length !== 4) return { ok: false, error: GUEST_OTP_ERROR }

  const ipAllowed = await consumeNamedRateLimit("authIp", await getRequestIp())
  if (!ipAllowed) {
    return { ok: false, error: AUTH_RATE_LIMIT_ERROR }
  }

  const allowed = await consumeRateLimit({
    bucketKey: `guest-otp-try:${input.orderId}`,
    limit: 8,
    windowSeconds: 60,
    useAdmin: true,
  })
  if (!allowed) return { ok: false, error: GUEST_OTP_LOCKED_ERROR }

  const admin = createAdminClient()
  const { data: challenge } = await admin
    .from("guest_access_challenges")
    .select("id, otp_hash, magic_jti, otp_attempts, expires_at")
    .eq("order_id", input.orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!challenge || new Date(challenge.expires_at).getTime() < Date.now()) {
    return { ok: false, error: GUEST_ACCESS_ERROR }
  }
  if (challenge.otp_attempts >= MAX_OTP_ATTEMPTS) {
    return { ok: false, error: GUEST_OTP_LOCKED_ERROR }
  }

  const expected = hashGuestSecret(code, challenge.magic_jti)
  if (!otpEquals(expected, challenge.otp_hash)) {
    await admin
      .from("guest_access_challenges")
      .update({ otp_attempts: challenge.otp_attempts + 1 })
      .eq("id", challenge.id)
    return { ok: false, error: GUEST_OTP_ERROR }
  }

  await admin
    .from("guest_access_challenges")
    .update({ verified_at: new Date().toISOString(), otp_attempts: 0 })
    .eq("id", challenge.id)

  const session = await signGuestOtpSession(input.orderId)
  const store = await cookies()
  store.set(GUEST_OTP_COOKIE, session, guestAccessCookieAttrs())
  return { ok: true }
}

export async function getGuestTicketForAccess(
  ticketId: string,
): Promise<import("@/app/actions/tickets").MyTicket | null> {
  const store = await cookies()
  const token = store.get(GUEST_ORDER_COOKIE)?.value
  if (!token || !ticketId) return null
  const parsed = await verifyGuestAccessToken(token)
  if (!parsed) return null

  const admin = createAdminClient()
  const otpOk = await isGuestOtpVerified(parsed.orderId)
  const queried = await admin
    .from("tickets")
    .select(GUEST_TICKET_DETAIL_SELECT)
    .eq("id", ticketId)
    .eq("order_id", parsed.orderId)
    .maybeSingle()

  let row = queried.data as GuestTicketDetailRow | null
  if (queried.error && isMissingTicketWalletColumnError(queried.error.message)) {
    const retry = await admin
      .from("tickets")
      .select(GUEST_TICKET_DETAIL_SELECT_LEGACY)
      .eq("id", ticketId)
      .eq("order_id", parsed.orderId)
      .maybeSingle()
    row = (retry.data ?? null) as GuestTicketDetailRow | null
  }

  if (!row) return null
  return mapGuestTicketRow(row as GuestTicketDetailRow, otpOk)
}

export async function currentUserIsAnonymous(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return true
  return Boolean(
    (user as { is_anonymous?: boolean }).is_anonymous ||
      user.app_metadata?.provider === "anonymous",
  )
}
