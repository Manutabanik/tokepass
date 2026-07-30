"use server"

import { revalidatePath } from "next/cache"

import { createPaymentPreference } from "@/app/actions/payments"
import { MAX_TICKETS_PER_PURCHASE } from "@/lib/checkout-limits"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type ReservedTicket = {
  ticket_id: string
}

export type CheckoutCartItem = {
  tierId: string
  quantity: number
  seatingUnitId?: string
}

export type CheckoutAddonItem = {
  itemId: string
  quantity: number
}

export type CheckoutResult =
  | {
      success: true
      tickets: ReservedTicket[]
      orderId: string
      initPoint: string
      reservedUntil?: string
    }
  | {
      success: false
      error: "auth_required" | "out_of_stock" | string
    }

type ReserveTxRow = {
  order_id: string
  ticket_id: string
  subtotal: number
  service_charge: number
  total_amount: number
  reserved_until?: string
}

function isStockError(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes("sold out") ||
    normalized.includes("stock") ||
    normalized.includes("agotad") ||
    normalized.includes("capacity") ||
    normalized.includes("not published") ||
    normalized.includes("not found") ||
    normalized.includes("max_tickets_per_user")
    || normalized.includes("seating_unit_unavailable")
  )
}

async function releaseTickets(ticketIds: string[]) {
  if (ticketIds.length === 0) return

  const supabase = await createClient()
  await supabase.rpc("release_reserved_tickets", {
    p_ticket_ids: ticketIds,
  })
}

async function releaseOrderAddons(orderId: string) {
  const admin = createAdminClient()
  await admin.rpc("release_order_event_items", { p_order_id: orderId })
}

/**
 * Reserva tickets → crea orden pending → preferencia MP → URL de pago.
 * Si Mercado Pago falla, hace rollback de la reserva.
 */
export async function processCheckout(
  tierId: string,
  quantity: number,
  eventId: string,
): Promise<CheckoutResult> {
  return startCheckoutWithPayment(eventId, [{ tierId, quantity }])
}

export async function startCheckoutWithPayment(
  eventId: string,
  items: CheckoutCartItem[],
  referralCode?: string | null,
  addons: CheckoutAddonItem[] = [],
): Promise<CheckoutResult> {
  if (!eventId || items.length === 0) {
    return { success: false, error: "Datos de compra incompletos." }
  }

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)

  if (
    !Number.isInteger(totalQuantity) ||
    totalQuantity < 1 ||
    totalQuantity > MAX_TICKETS_PER_PURCHASE
  ) {
    return {
      success: false,
      error: `Podés reservar entre 1 y ${MAX_TICKETS_PER_PURCHASE} entradas por compra.`,
    }
  }

  for (const item of items) {
    if (
      !item.tierId ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    ) {
      return { success: false, error: "Selección de entradas inválida." }
    }
  }

  const seatingItems = items.filter((item) => item.seatingUnitId)
  if (
    seatingItems.length > 1 ||
    (seatingItems.length === 1 &&
      (items.length !== 1 || seatingItems[0]?.quantity !== 1))
  ) {
    return {
      success: false,
      error: "Comprá una ubicación numerada por operación.",
    }
  }

  for (const addon of addons) {
    if (
      !addon.itemId ||
      !Number.isInteger(addon.quantity) ||
      addon.quantity < 1
    ) {
      return { success: false, error: "Selección de consumiciones inválida." }
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: "auth_required" }
  }

  // Nunca confiar en promoter_id del cliente: solo resolver ?ref=CODE en servidor.
  let promoterId: string | null = null
  const cleanRef = referralCode?.trim()
  if (cleanRef) {
    const { data: resolved } = await supabase.rpc(
      "resolve_promoter_for_checkout",
      {
        p_referral_code: cleanRef,
        p_event_id: eventId,
      },
    )
    promoterId = resolved ?? null
  }

  const rpcItems = items.map((item) => ({
    tier_id: item.tierId,
    quantity: item.quantity,
  }))

  try {
    const seatingItem = seatingItems[0]
    const reservation = seatingItem?.seatingUnitId
      ? await supabase.rpc("reserve_seating_unit_tx", {
          p_event_id: eventId,
          p_owner_id: user.id,
          p_tier_id: seatingItem.tierId,
          p_seating_unit_id: seatingItem.seatingUnitId,
          p_promoter_id: promoterId,
        })
      : await supabase.rpc("reserve_tickets_tx", {
          p_event_id: eventId,
          p_owner_id: user.id,
          p_items: rpcItems,
          p_promoter_id: promoterId,
        })
    const { data, error } = reservation

    if (error) {
      if (isStockError(error.message)) {
        if (
          error.message.toUpperCase().includes("MAX_TICKETS_PER_USER_EXCEEDED")
        ) {
          return {
            success: false,
            error:
              "Alcanzaste el máximo de entradas por persona para este evento.",
          }
        }
        return { success: false, error: "out_of_stock" }
      }

      return {
        success: false,
        error: error.message || "No se pudo completar la reserva.",
      }
    }

    const rows = (data ?? []) as ReserveTxRow[]
    if (rows.length === 0) {
      return { success: false, error: "out_of_stock" }
    }

    const orderId = rows[0].order_id
    const reservedTickets: ReservedTicket[] = rows.map((row) => ({
      ticket_id: row.ticket_id,
    }))
    const ticketIds = reservedTickets.map((ticket) => ticket.ticket_id)

    if (addons.length > 0) {
      const { error: addonsError } = await supabase.rpc(
        "attach_event_items_to_order",
        {
          p_order_id: orderId,
          p_owner_id: user.id,
          p_items: addons.map((addon) => ({
            item_id: addon.itemId,
            quantity: addon.quantity,
          })),
        },
      )

      if (addonsError) {
        await releaseTickets(ticketIds)
        await releaseOrderAddons(orderId)
        const admin = createAdminClient()
        await admin.from("orders").delete().eq("id", orderId)

        if (isStockError(addonsError.message)) {
          return { success: false, error: "out_of_stock" }
        }

        return {
          success: false,
          error: addonsError.message || "No se pudieron reservar las consumiciones.",
        }
      }
    }

    const preference = await createPaymentPreference(orderId)

    if (!preference.success) {
      await releaseOrderAddons(orderId)
      await releaseTickets(ticketIds)
      const admin = createAdminClient()
      await admin.from("orders").delete().eq("id", orderId)
      return {
        success: false,
        error:
          preference.error ||
          "Mercado Pago no respondió. Intentá de nuevo en unos minutos.",
      }
    }

    revalidatePath(`/events/${eventId}`)
    revalidatePath("/events")
    revalidatePath("/my-tickets")
    revalidatePath("/admin")
    revalidatePath("/admin/promoters")
    revalidatePath("/promoter/dashboard")
    revalidatePath("/superadmin")
    revalidatePath("/super-admin")

    return {
      success: true,
      tickets: reservedTickets,
      orderId,
      initPoint: preference.initPoint,
      ...(rows[0]?.reserved_until
        ? { reservedUntil: rows[0].reserved_until }
        : {}),
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error inesperado durante el checkout.",
    }
  }
}
