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
import { getResaleFeePercentage } from "@/app/actions/platform-settings"
import {
  computeResaleFeeSplit,
  RESALE_CHECKOUT_TTL_MINUTES,
  resaleExternalRef,
} from "@/lib/resale"
import { createAdminClient } from "@/lib/supabase/admin"
import { createPublicClient } from "@/lib/supabase/public"
import { createClient } from "@/lib/supabase/server"
import { formatCurrency } from "@/lib/format"
import {
  LEGAL_CONSENT_REQUIRED_ERROR,
  TICKET_TRANSFER_RESALE_TERMS_VERSION,
} from "@/lib/legal/terms"

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
  status: "active" | "reserved" | "sold" | "cancelled"
  createdAt: string
}

type ActionOk<T> = { success: true; data: T }
type ActionErr = { success: false; error: string }
type ActionResult<T> = ActionOk<T> | ActionErr

export async function getActiveResaleListingsForEvent(
  eventId: string,
): Promise<ResaleListingPublic[]> {
  const supabase = createPublicClient()
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

function mapCreateResaleListingError(message: string): string {
  const normalized = message.toUpperCase()
  if (normalized.includes("CONSENT_REQUIRED")) {
    return LEGAL_CONSENT_REQUIRED_ERROR
  }
  if (normalized.includes("AUTH_REQUIRED")) {
    return "Debés iniciar sesión."
  }
  if (normalized.includes("TICKET_NOT_FOUND")) {
    return "Entrada no encontrada."
  }
  if (normalized.includes("NOT_TICKET_OWNER")) {
    return "Solo el titular puede publicar la reventa."
  }
  if (normalized.includes("TICKET_ALREADY_ADMITTED")) {
    return "Esta entrada ya fue usada parcialmente y no se puede revender."
  }
  if (normalized.includes("TICKET_IS_TEST")) {
    return "Las entradas de prueba no se pueden revender."
  }
  if (normalized.includes("TRANSFER_LIMIT_REACHED")) {
    return "Esta entrada alcanzó el límite de transferencias."
  }
  if (normalized.includes("TICKET_TRANSFER_PENDING")) {
    return "Cancelá el envío pendiente antes de revender."
  }
  if (normalized.includes("TICKET_ALREADY_LISTED")) {
    return "Esta entrada ya está publicada para reventa."
  }
  if (normalized.includes("TICKET_NOT_RESALABLE")) {
    return "Las entradas gratuitas no se publican en el marketplace."
  }
  if (normalized.includes("TICKET_NOT_TRANSFERABLE")) {
    return "Solo se pueden revender entradas válidas."
  }
  return message || "No se pudo publicar la reventa."
}

export async function createResaleListingAction(
  ticketId: string,
  options?: { termsAccepted?: boolean },
): Promise<ActionResult<MyResaleListing>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Debés iniciar sesión." }
    }

    if (!options?.termsAccepted) {
      return { success: false, error: LEGAL_CONSENT_REQUIRED_ERROR }
    }

    const { data, error } = await supabase.rpc("create_resale_listing", {
      p_ticket_id: ticketId,
      p_terms_version: TICKET_TRANSFER_RESALE_TERMS_VERSION,
    })

    if (error) {
      return { success: false, error: mapCreateResaleListingError(error.message) }
    }

    const listing = (
      data as Array<{
        listing_id: string
        ticket_id: string
        event_id: string
        price: number
        status: MyResaleListing["status"]
        created_at: string
      }> | null
    )?.[0]

    if (!listing) {
      return { success: false, error: "No se pudo publicar la reventa." }
    }

    revalidatePath("/cuenta/entradas")
    revalidatePath(`/events/${listing.event_id}`)

    return {
      success: true,
      data: {
        id: listing.listing_id,
        ticketId: listing.ticket_id,
        eventId: listing.event_id,
        price: Number(listing.price),
        status: listing.status,
        createdAt: listing.created_at,
      },
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? mapCreateResaleListingError(error.message)
          : "Error al publicar la reventa.",
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
    if (listing.status === "reserved") {
      return {
        success: false,
        error:
          "Hay un comprador pagando esta entrada. Si no se completa, vuelve a estar disponible en unos minutos.",
      }
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

function mapReserveResaleError(message: string): string {
  const normalized = message.toUpperCase()
  if (normalized.includes("AUTH_REQUIRED")) {
    return "Iniciá sesión para comprar en la reventa oficial."
  }
  if (normalized.includes("LISTING_NOT_FOUND")) {
    return "Listado no encontrado."
  }
  if (normalized.includes("LISTING_RESERVED")) {
    return "Otro comprador ya está pagando esta entrada. Reintentá en unos minutos."
  }
  if (normalized.includes("CANNOT_BUY_OWN")) {
    return "No podés comprar tu propia entrada."
  }
  if (normalized.includes("LISTING_NOT_AVAILABLE")) {
    return "Esta reventa ya no está disponible."
  }
  return message || "No se pudo reservar la reventa."
}

export async function startResaleCheckoutAction(
  listingId: string,
): Promise<ActionResult<{ initPoint: string }>> {
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

  let reservedListingId: string | null = null

  try {
    const { data: reservedRaw, error: reserveError } = await supabase.rpc(
      "reserve_resale_listing",
      {
        p_listing_id: listingId,
        p_ttl_minutes: RESALE_CHECKOUT_TTL_MINUTES,
      },
    )

    if (reserveError) {
      return { success: false, error: mapReserveResaleError(reserveError.message) }
    }

    const reserved = (reservedRaw ?? {}) as {
      ok?: boolean
      listing_id?: string
      ticket_id?: string
      event_id?: string
      seller_id?: string
      price?: number
      reserved_until?: string
    }

    if (!reserved.ok || !reserved.listing_id || !reserved.ticket_id) {
      return { success: false, error: "No se pudo reservar la reventa." }
    }

    reservedListingId = reserved.listing_id

    const { data: ticket } = await supabase
      .from("tickets")
      .select("id, status, ticket_tiers(name), events(title)")
      .eq("id", reserved.ticket_id)
      .maybeSingle()

    if (!ticket || ticket.status !== "valid") {
      await supabase.rpc("release_resale_listing_reservation", {
        p_listing_id: reserved.listing_id,
      })
      return {
        success: false,
        error: "La entrada ya no está disponible para reventa.",
      }
    }

    const frozenPrice = Number(reserved.price)
    if (!Number.isFinite(frozenPrice) || frozenPrice <= 0) {
      await supabase.rpc("release_resale_listing_reservation", {
        p_listing_id: reserved.listing_id,
      })
      return { success: false, error: "Precio de reventa inválido." }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, dni")
      .eq("id", user.id)
      .maybeSingle()

    const eventRel = ticket.events as { title: string } | null
    const tierRel = ticket.ticket_tiers as { name: string } | null
    const eventTitle = eventRel?.title ?? "Evento TokePass"
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
    const reservedUntil = reserved.reserved_until
      ? new Date(reserved.reserved_until)
      : new Date(Date.now() + RESALE_CHECKOUT_TTL_MINUTES * 60 * 1000)

    const client = getMercadoPagoClient()
    const preference = new Preference(client)
    const created = await preference.create({
      body: {
        items: [
          {
            id: `resale-${reserved.listing_id}`,
            title: `Reventa oficial · ${eventTitle} · ${tierName}`.slice(0, 256),
            quantity: 1,
            unit_price: frozenPrice,
            currency_id: "ARS",
          },
        ],
        ...(payer ? { payer } : {}),
        external_reference: resaleExternalRef(reserved.listing_id),
        statement_descriptor: "TOKEPASS",
        expires: true,
        expiration_date_to: reservedUntil.toISOString(),
        back_urls: {
          success: `${base}/checkout/success?resale=1&listing_id=${reserved.listing_id}`,
          failure: `${base}/checkout/failure?resale=1&listing_id=${reserved.listing_id}`,
          pending: `${base}/checkout/pending?resale=1&listing_id=${reserved.listing_id}`,
        },
        ...(!localSite ? { auto_return: "approved" as const } : {}),
        ...(!localSite
          ? { notification_url: `${base}/api/webhooks/mercadopago` }
          : {}),
        metadata: {
          kind: "ticket_resale",
          listing_id: reserved.listing_id,
          buyer_id: user.id,
          seller_id: reserved.seller_id,
          event_id: reserved.event_id,
          ticket_id: ticket.id,
          price: frozenPrice,
        },
      },
    })

    const initPoint = resolveCheckoutInitPoint(created)
    const preferenceId = created.id
    if (!preferenceId || !initPoint) {
      await supabase.rpc("release_resale_listing_reservation", {
        p_listing_id: reserved.listing_id,
      })
      return {
        success: false,
        error: "Mercado Pago no devolvió una preferencia válida.",
      }
    }

    const admin = createAdminClient()
    const { error: updateError } = await admin
      .from("ticket_resale_listings")
      .update({
        mp_preference_id: preferenceId,
      })
      .eq("id", reserved.listing_id)
      .eq("buyer_id", user.id)
      .eq("status", "reserved")

    if (updateError) {
      logger.error({
        context: "resale",
        message: "preference_link_failed",
        listingId: reserved.listing_id,
        error: updateError.message,
      })
      await supabase.rpc("release_resale_listing_reservation", {
        p_listing_id: reserved.listing_id,
      })
      return {
        success: false,
        error: "No se pudo vincular el pago a la reserva.",
      }
    }

    return { success: true, data: { initPoint } }
  } catch (error) {
    if (reservedListingId) {
      await Promise.resolve(
        supabase.rpc("release_resale_listing_reservation", {
          p_listing_id: reservedListingId,
        }),
      ).catch(() => undefined)
    }
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
): Promise<
  ActionResult<{
    price: number
    sellerNet: number
    fee: number
    feePercentage: number
    label: string
  }>
> {
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
  const feePercentage = await getResaleFeePercentage()
  const split = computeResaleFeeSplit(price, feePercentage)
  return {
    success: true,
    data: {
      price: split.price,
      sellerNet: split.sellerNetAmount,
      fee: split.platformFeeAmount,
      feePercentage: split.feePercentage,
      label: `${tier?.name ?? "Entrada"} · ${formatCurrency(split.price)}`,
    },
  }
}
