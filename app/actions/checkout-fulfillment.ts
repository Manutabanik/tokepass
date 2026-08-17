"use server"

import { getGuestOrderWallet } from "@/app/actions/guest-ticket-access"
import { getMyTickets, type MyTicket } from "@/app/actions/tickets"
import { resolveOrderHoldExpiresAt } from "@/lib/checkout-hold"
import { hasCheckoutFulfillmentCookie } from "@/lib/checkout/fulfillment-cookie"
import {
  mapOrderStatusToFulfillment,
  type CheckoutFulfillmentStatus,
} from "@/lib/checkout/fulfillment"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type CheckoutOrderFulfillment = {
  orderId: string
  status: CheckoutFulfillmentStatus
  tickets: MyTicket[]
  userId: string
  eventTitle: string | null
  totalAmount: number
  holdExpiresAt: string | null
}

type FulfillmentOrderRow = {
  id: string
  status: string | null
  total_amount: number | string | null
  buyer_id: string
  created_at: string
  guest_token: string | null
}

function emptyFulfillment(orderId: string): CheckoutOrderFulfillment {
  return {
    orderId,
    status: "not_found",
    tickets: [],
    userId: "",
    eventTitle: null,
    totalAmount: 0,
    holdExpiresAt: null,
  }
}

export async function getCheckoutOrderFulfillment(
  orderId: string,
): Promise<CheckoutOrderFulfillment> {
  const clean = orderId.trim()
  if (!clean) return emptyFulfillment("")

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let order: FulfillmentOrderRow | null = null

  if (user) {
    const { data } = await supabase
      .from("orders")
      .select("id, status, total_amount, buyer_id, created_at, guest_token")
      .eq("id", clean)
      .eq("buyer_id", user.id)
      .maybeSingle()
    order = (data as FulfillmentOrderRow | null) ?? null
  }

  if (!order) {
    const cookieOk = await hasCheckoutFulfillmentCookie(clean)
    if (!cookieOk) return emptyFulfillment(clean)
    try {
      const admin = createAdminClient()
      const { data } = await admin
        .from("orders")
        .select("id, status, total_amount, buyer_id, created_at, guest_token")
        .eq("id", clean)
        .maybeSingle()
      order = (data as FulfillmentOrderRow | null) ?? null
    } catch {
      return emptyFulfillment(clean)
    }
  }

  if (!order) return emptyFulfillment(clean)

  const holdExpiresAt = await resolveFulfillmentHoldExpiresAt(
    clean,
    order.created_at,
    Boolean(user && user.id === order.buyer_id),
  )

  const status = mapOrderStatusToFulfillment(order.status)
  const totalAmount = Number(order.total_amount) || 0
  if (status !== "paid") {
    return {
      orderId: clean,
      status,
      tickets: [],
      userId: order.buyer_id,
      eventTitle: null,
      totalAmount,
      holdExpiresAt,
    }
  }

  const tickets = await loadFulfillmentTickets({
    orderId: clean,
    buyerId: order.buyer_id,
    sessionUserId: user?.id ?? null,
    guestToken: order.guest_token,
  })

  return {
    orderId: clean,
    status,
    tickets,
    userId: order.buyer_id,
    eventTitle: tickets[0]?.eventTitle ?? null,
    totalAmount,
    holdExpiresAt,
  }
}

async function resolveFulfillmentHoldExpiresAt(
  orderId: string,
  createdAt: string,
  useSessionClient: boolean,
): Promise<string> {
  const reservedUntil = useSessionClient
    ? await loadReservedUntilWithSession(orderId)
    : await loadReservedUntilWithAdmin(orderId)
  return resolveOrderHoldExpiresAt(createdAt, reservedUntil).toISOString()
}

async function loadReservedUntilWithSession(
  orderId: string,
): Promise<string | null> {
  const supabase = await createClient()
  const { data: holdRows } = await supabase
    .from("tickets")
    .select("seating_unit:event_seating_units(reserved_until)")
    .eq("order_id", orderId)
  return earliestReservedUntil(holdRows)
}

async function loadReservedUntilWithAdmin(
  orderId: string,
): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data: holdRows } = await admin
      .from("tickets")
      .select("seating_unit:event_seating_units(reserved_until)")
      .eq("order_id", orderId)
    return earliestReservedUntil(holdRows)
  } catch {
    return null
  }
}

function earliestReservedUntil(
  holdRows: Array<{ seating_unit?: unknown }> | null | undefined,
): string | null {
  return (
    (holdRows ?? [])
      .map((row) => {
        const seating = row.seating_unit as
          | { reserved_until?: string | null }
          | { reserved_until?: string | null }[]
          | null
        const unit = Array.isArray(seating) ? seating[0] : seating
        return unit?.reserved_until ?? null
      })
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null
  )
}

async function loadFulfillmentTickets(input: {
  orderId: string
  buyerId: string
  sessionUserId: string | null
  guestToken: string | null
}): Promise<MyTicket[]> {
  if (input.sessionUserId && input.sessionUserId === input.buyerId) {
    try {
      return await getMyTickets({ orderId: input.orderId })
    } catch {
      // Guest resume after a dropped session: fall through to guest_token wallet.
    }
  }

  const guestToken = input.guestToken?.trim() ?? ""
  if (!guestToken) return []
  const wallet = await getGuestOrderWallet(guestToken)
  if (!wallet || wallet.orderId !== input.orderId) return []
  return wallet.tickets
}
