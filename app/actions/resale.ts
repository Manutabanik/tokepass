"use server"

import { revalidatePath } from "next/cache"
import { Preference } from "mercadopago"

import { logger } from "@/lib/logger"
import {
  getMercadoPagoClient,
  getMercadoPagoSandboxBuyerEmail,
  getSiteUrl,
  isLocalSiteUrl,
  isMercadoPagoSandboxMode,
  resolveCheckoutInitPoint,
} from "@/lib/mercadopago"
import {
  buildPreferencePayer,
} from "@/lib/payments/mercadopago"
import {
  computeResaleFeeSplit,
  resaleExternalRef,
} from "@/lib/resale"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { formatCurrency } from "@/lib/format"

export type ResaleListingPublic = {
  id: string
  price: number
  tierName: string
  createdAt: string
}

export type MyResaleListing = {
  id: string
  ticketId: string
  eventId: string
  price: number
  status: "active" | "sold" | "cancelled"
  createdAt: string
}

type ActionOk<T> = { success: true; data: T }
type ActionErr = { success: false; error: string }
type ActionResult<T> = ActionOk<T> | ActionErr

export async function getActiveResaleListingsForEvent(
  eventId: string,
): Promise<ResaleListingPublic[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ticket_resale_listings")
    .select("id, price, created_at, ticket_id")
    .eq("event_id", eventId)
    .eq("status", "active")
    .order("created_at", { ascending: true })

  if (error || !data) {
    logger.error({
      context: "resale",
      message: "list_active_failed",
      eventId,
      error: error?.message,
    })
    return []
  }

  if (data.length === 0) return []

  const ticketIds = data.map((row) => row.ticket_id)
  const { data: tickets } = await supabase
    .from("tickets")
    .select("id, ticket_tiers(name)")
    .in("id", ticketIds)

  const tierByTicket = new Map<string, string>()
  for (const ticket of tickets ?? []) {
    const tier = ticket.ticket_tiers as { name: string } | null
    tierByTicket.set(ticket.id, tier?.name?.trim() || "Entrada")
  }

  return data.map((row) => ({
    id: row.id,
    price: Number(row.price),
    tierName: tierByTicket.get(row.ticket_id) ?? "Entrada",
    createdAt: row.created_at,
  }))
}

export async function createResaleListingAction(
  ticketId: string,
): Promise<ActionResult<MyResaleListing>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Debés iniciar sesión." }
    }

    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select(
        "id, owner_id, event_id, status, is_test, admissions_used, transfer_count, max_transfers_allowed, ticket_tiers(price, name)",
      )
      .eq("id", ticketId)
      .maybeSingle()

    if (ticketError || !ticket) {
      return { success: false, error: "Entrada no encontrada." }
    }
    if (ticket.owner_id !== user.id) {
      return { success: false, error: "Solo el titular puede publicar la reventa." }
    }
    if (ticket.status !== "valid") {
      return { success: false, error: "Solo se pueden revender entradas válidas." }
    }
    if (ticket.is_test) {
      return { success: false, error: "Las entradas de prueba no se pueden revender." }
    }
    if (Number(ticket.admissions_used) > 0) {
      return {
        success: false,
        error: "Esta entrada ya fue usada parcialmente y no se puede revender.",
      }
    }
    if (ticket.transfer_count >= ticket.max_transfers_allowed) {
      return {
        success: false,
        error: "Esta entrada alcanzó el límite de transferencias.",
      }
    }

    const tier = ticket.ticket_tiers as { price: number; name: string } | null
    const officialPrice = Number(tier?.price ?? 0)
    if (!Number.isFinite(officialPrice) || officialPrice <= 0) {
      return {
        success: false,
        error: "Las entradas gratuitas no se publican en el marketplace.",
      }
    }

    const split = computeResaleFeeSplit(officialPrice)

    const { data: existing } = await supabase
      .from("ticket_resale_listings")
      .select("id")
      .eq("ticket_id", ticketId)
      .eq("status", "active")
      .maybeSingle()

    if (existing) {
      return {
        success: false,
        error: "Esta entrada ya está publicada para reventa.",
      }
    }

    const { data: listing, error } = await supabase
      .from("ticket_resale_listings")
      .insert({
        ticket_id: ticketId,
        seller_id: user.id,
        event_id: ticket.event_id,
        price: split.price,
        platform_fee_amount: split.platformFeeAmount,
        seller_net_amount: split.sellerNetAmount,
        status: "active",
      })
      .select("id, ticket_id, event_id, price, status, created_at")
      .single()

    if (error || !listing) {
      return {
        success: false,
        error: error?.message || "No se pudo publicar la reventa.",
      }
    }

    revalidatePath("/cuenta/entradas")
    revalidatePath(`/events/${ticket.event_id}`)

    return {
      success: true,
      data: {
        id: listing.id,
        ticketId: listing.ticket_id,
        eventId: listing.event_id,
        price: Number(listing.price),
        status: listing.status as MyResaleListing["status"],
        createdAt: listing.created_at,
      },
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al publicar la reventa.",
    }
  }
}

export async function cancelResaleListingAction(
  listingId: string,
): Promise<ActionResult<{ listingId: string }>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Debés iniciar sesión." }
    }

    const { data: listing, error: loadError } = await supabase
      .from("ticket_resale_listings")
      .select("id, seller_id, event_id, status")
      .eq("id", listingId)
      .maybeSingle()

    if (loadError || !listing) {
      return { success: false, error: "Listado no encontrado." }
    }
    if (listing.seller_id !== user.id) {
      return { success: false, error: "No podés cancelar este listado." }
    }
    if (listing.status !== "active") {
      return { success: false, error: "El listado ya no está activo." }
    }

    const { error } = await supabase
      .from("ticket_resale_listings")
      .update({ status: "cancelled" })
      .eq("id", listingId)
      .eq("seller_id", user.id)
      .eq("status", "active")

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath("/cuenta/entradas")
    revalidatePath(`/events/${listing.event_id}`)

    return { success: true, data: { listingId } }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "No se pudo cancelar el listado.",
    }
  }
}

export async function startResaleCheckoutAction(
  listingId: string,
): Promise<ActionResult<{ initPoint: string }>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return {
        success: false,
        error: "Iniciá sesión para comprar en la reventa oficial.",
      }
    }

    const { data: listing, error: listingError } = await supabase
      .from("ticket_resale_listings")
      .select("id, seller_id, event_id, price, status, ticket_id")
      .eq("id", listingId)
      .maybeSingle()

    if (listingError || !listing) {
      return { success: false, error: "Listado no encontrado." }
    }
    if (listing.status !== "active") {
      return { success: false, error: "Esta reventa ya no está disponible." }
    }
    if (listing.seller_id === user.id) {
      return { success: false, error: "No podés comprar tu propia entrada." }
    }

    const { data: ticket } = await supabase
      .from("tickets")
      .select("id, status, ticket_tiers(name), events(title)")
      .eq("id", listing.ticket_id)
      .maybeSingle()

    if (!ticket || ticket.status !== "valid") {
      return {
        success: false,
        error: "La entrada ya no está disponible para reventa.",
      }
    }

    const frozenPrice = Number(listing.price)
    if (!Number.isFinite(frozenPrice) || frozenPrice <= 0) {
      return { success: false, error: "Precio de reventa inválido." }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, dni")
      .eq("id", user.id)
      .maybeSingle()

    const eventRel = ticket.events as { title: string } | null
    const tierRel = ticket.ticket_tiers as { name: string } | null
    const eventTitle = eventRel?.title ?? "Evento Tokepass"
    const tierName = tierRel?.name ?? "Entrada"
    const siteUrl = getSiteUrl()
    const localSite = isLocalSiteUrl(siteUrl)
    const sandboxMode = isMercadoPagoSandboxMode()
    const base = siteUrl.replace(/\/$/, "")
    const payer = buildPreferencePayer({
      email: profile?.email ?? user.email,
      fullName: profile?.full_name,
      dni: profile?.dni,
      sandboxMode,
      sandboxBuyerEmail: getMercadoPagoSandboxBuyerEmail(),
    })

    const client = getMercadoPagoClient()
    const preference = new Preference(client)
    const created = await preference.create({
      body: {
        items: [
          {
            id: `resale-${listing.id}`,
            title: `Reventa oficial · ${eventTitle} · ${tierName}`.slice(0, 256),
            quantity: 1,
            unit_price: frozenPrice,
            currency_id: "ARS",
          },
        ],
        ...(payer ? { payer } : {}),
        external_reference: resaleExternalRef(listing.id),
        statement_descriptor: "TOKEPASS",
        back_urls: {
          success: `${base}/checkout/success?resale=1&listing_id=${listing.id}`,
          failure: `${base}/checkout/failure?resale=1&listing_id=${listing.id}`,
          pending: `${base}/checkout/pending?resale=1&listing_id=${listing.id}`,
        },
        ...(!localSite ? { auto_return: "approved" as const } : {}),
        ...(!localSite
          ? { notification_url: `${base}/api/webhooks/mercadopago` }
          : {}),
        metadata: {
          kind: "ticket_resale",
          listing_id: listing.id,
          buyer_id: user.id,
          seller_id: listing.seller_id,
          event_id: listing.event_id,
          ticket_id: ticket.id,
          price: frozenPrice,
        },
      },
    })

    const initPoint = resolveCheckoutInitPoint(created)
    const preferenceId = created.id
    if (!preferenceId || !initPoint) {
      return {
        success: false,
        error: "Mercado Pago no devolvió una preferencia válida.",
      }
    }

    const admin = createAdminClient()
    const { error: updateError } = await admin
      .from("ticket_resale_listings")
      .update({
        buyer_id: user.id,
        mp_preference_id: preferenceId,
      })
      .eq("id", listing.id)
      .eq("status", "active")

    if (updateError) {
      logger.error({
        context: "resale",
        message: "preference_link_failed",
        listingId: listing.id,
        error: updateError.message,
      })
    }

    return { success: true, data: { initPoint } }
  } catch (error) {
    logger.error({
      context: "resale",
      message: "checkout_failed",
      error,
    })
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo iniciar el pago de reventa.",
    }
  }
}

/** Helper copy for seller modal net preview. */
export async function getResaleListingPreview(
  ticketId: string,
): Promise<ActionResult<{ price: number; sellerNet: number; fee: number; label: string }>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Debés iniciar sesión." }

  const { data: ticket } = await supabase
    .from("tickets")
    .select("owner_id, ticket_tiers(price, name)")
    .eq("id", ticketId)
    .maybeSingle()

  if (!ticket || ticket.owner_id !== user.id) {
    return { success: false, error: "Entrada no encontrada." }
  }

  const tier = ticket.ticket_tiers as { price: number; name: string } | null
  const price = Number(tier?.price ?? 0)
  if (price <= 0) {
    return { success: false, error: "Entrada no elegible para reventa." }
  }
  const split = computeResaleFeeSplit(price)
  return {
    success: true,
    data: {
      price: split.price,
      sellerNet: split.sellerNetAmount,
      fee: split.platformFeeAmount,
      label: `${tier?.name ?? "Entrada"} · ${formatCurrency(split.price)}`,
    },
  }
}
