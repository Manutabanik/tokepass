"use server"

import { Preference } from "mercadopago"

import { createAdminClient } from "@/lib/supabase/admin"
import { getMercadoPagoClient, getSiteUrl } from "@/lib/mercadopago"
import { createClient } from "@/lib/supabase/server"

export type CreatePreferenceResult =
  | { success: true; initPoint: string; preferenceId: string }
  | { success: false; error: string }

type OrderTicketRow = {
  id: string
  tier_id: string
  ticket_tiers: {
    name: string
    price: number
  } | null
  events: {
    id: string
    title: string
  } | null
}

export async function createPaymentPreference(
  orderId: string,
): Promise<CreatePreferenceResult> {
  if (!orderId) {
    return { success: false, error: "Orden inválida." }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: "Debés iniciar sesión para pagar." }
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, buyer_id, total_amount, subtotal, service_charge, status, mp_preference_id",
    )
    .eq("id", orderId)
    .maybeSingle()

  if (orderError || !order) {
    return { success: false, error: "No se encontró la orden." }
  }

  if (order.buyer_id !== user.id) {
    return { success: false, error: "No podés pagar una orden ajena." }
  }

  if (order.status !== "pending") {
    return {
      success: false,
      error: "Esta orden ya no admite un nuevo checkout.",
    }
  }

  const { data: tickets, error: ticketsError } = await supabase
    .from("tickets")
    .select(
      "id, tier_id, ticket_tiers(name, price), events(id, title)",
    )
    .eq("order_id", orderId)

  if (ticketsError) {
    return {
      success: false,
      error: `No se pudieron cargar los tickets: ${ticketsError.message}`,
    }
  }

  const rows = (tickets ?? []) as unknown as OrderTicketRow[]

  if (rows.length === 0) {
    return {
      success: false,
      error: "La orden no tiene tickets asociados.",
    }
  }

  const itemsByTier = new Map<
    string,
    { title: string; quantity: number; unit_price: number }
  >()

  for (const ticket of rows) {
    const tierName = ticket.ticket_tiers?.name ?? "Entrada"
    const eventTitle = ticket.events?.title ?? "Evento Tokepass"
    const price = Number(ticket.ticket_tiers?.price ?? 0)
    const key = ticket.tier_id
    const current = itemsByTier.get(key)

    if (current) {
      current.quantity += 1
    } else {
      itemsByTier.set(key, {
        title: `${eventTitle} — ${tierName}`,
        quantity: 1,
        unit_price: price,
      })
    }
  }

  const preferenceItems = Array.from(itemsByTier.entries()).map(
    ([id, item]) => ({
      id,
      title: item.title.slice(0, 256),
      quantity: item.quantity,
      unit_price: item.unit_price,
      currency_id: "ARS" as const,
    }),
  )

  const { data: redemptions, error: redemptionsError } = await supabase
    .from("item_redemptions")
    .select("id, item_id, event_items(name, price)")
    .eq("order_id", orderId)
    .eq("status", "pending")

  if (redemptionsError) {
    return {
      success: false,
      error: `No se pudieron cargar las consumiciones: ${redemptionsError.message}`,
    }
  }

  type RedemptionRow = {
    id: string
    item_id: string
    event_items: { name: string; price: number } | null
  }

  const barByItem = new Map<
    string,
    { title: string; quantity: number; unit_price: number }
  >()

  for (const row of (redemptions ?? []) as unknown as RedemptionRow[]) {
    const name = row.event_items?.name ?? "Consumición"
    const price = Number(row.event_items?.price ?? 0)
    const current = barByItem.get(row.item_id)

    if (current) {
      current.quantity += 1
    } else {
      barByItem.set(row.item_id, {
        title: `Barra — ${name}`.slice(0, 256),
        quantity: 1,
        unit_price: price,
      })
    }
  }

  for (const [id, item] of barByItem.entries()) {
    preferenceItems.push({
      id,
      title: item.title,
      quantity: item.quantity,
      unit_price: item.unit_price,
      currency_id: "ARS",
    })
  }

  const serviceCharge = Number(order.service_charge ?? 0)
  if (serviceCharge > 0) {
    preferenceItems.push({
      id: "tokepass-service-charge",
      title: "Cargo por servicio Tokepass",
      quantity: 1,
      unit_price: serviceCharge,
      currency_id: "ARS",
    })
  }

  const siteUrl = getSiteUrl()
  const notificationUrl = `${siteUrl}/api/webhooks/mercadopago`

  try {
    const client = getMercadoPagoClient()
    const preference = new Preference(client)

    const created = await preference.create({
      body: {
        items: preferenceItems,
        external_reference: orderId,
        statement_descriptor: "TOKEPASS",
        back_urls: {
          success: `${siteUrl}/checkout/success?order_id=${orderId}`,
          failure: `${siteUrl}/checkout/failure?order_id=${orderId}`,
          pending: `${siteUrl}/checkout/pending?order_id=${orderId}`,
        },
        auto_return: "approved",
        notification_url: notificationUrl,
        metadata: {
          order_id: orderId,
          buyer_id: user.id,
          subtotal: order.subtotal,
          service_charge: order.service_charge,
        },
      },
    })

    const initPoint = created.init_point ?? created.sandbox_init_point
    const preferenceId = created.id

    if (!initPoint || !preferenceId) {
      return {
        success: false,
        error: "Mercado Pago no devolvió una URL de checkout.",
      }
    }

    const admin = createAdminClient()
    const { error: updateError } = await admin
      .from("orders")
      .update({ mp_preference_id: preferenceId })
      .eq("id", orderId)
      .eq("status", "pending")

    if (updateError) {
      return {
        success: false,
        error: `No se pudo guardar la preferencia: ${updateError.message}`,
      }
    }

    return {
      success: true,
      initPoint,
      preferenceId,
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Mercado Pago no está disponible en este momento."

    return {
      success: false,
      error: `No se pudo crear el checkout: ${message}`,
    }
  }
}
