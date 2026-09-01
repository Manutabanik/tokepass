"use server"

import { revalidatePath } from "next/cache"

import { createPaymentPreference } from "@/app/actions/payments"
import { resolveCheckoutExpiresAt } from "@/lib/checkout-hold"
import { logger } from "@/lib/logger"
import {
  EVENT_ITEM_CATEGORIES,
  parseEventItemCategory,
  type EventItemCategory,
} from "@/lib/store-categories"
import {
  STORE_QR_GRACE_BLOCKS,
  STORE_QR_ROTATION_MS,
  decodeLivingStorePayload,
} from "@/lib/store/living-store-payload"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { WalletLoadError } from "@/lib/tickets/wallet-query"

const MAX_STORE_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
])

export type EventItem = {
  id: string
  eventId: string
  name: string
  description: string | null
  price: number
  stock: number
  isActive: boolean
  imageUrl: string | null
  category: EventItemCategory
}

/** @deprecated Prefer MyStoreRedemption */
export type MyBarRedemption = MyStoreRedemption

export type MyStoreRedemption = {
  id: string
  qrCodeToken: string
  status: "pending" | "valid" | "redeemed" | "cancelled"
  redeemedAt: string | null
  itemId: string | null
  itemName: string
  itemDescription: string | null
  itemPrice: number
  itemImageUrl: string | null
  itemCategory: EventItemCategory
  orderId: string | null
  eventId: string
  eventTitle: string
  eventDate: string
  eventLocation: string
}

export type RedeemItemResult =
  | {
      success: true
      alreadyRedeemed: false
      itemName: string
      itemDescription: string | null
      itemImageUrl: string | null
      itemCategory: EventItemCategory | null
      redeemedAt: string
    }
  | {
      success: false
      alreadyRedeemed: true
      itemName: string
      itemImageUrl?: string | null
      previousRedeemedAt: string | null
      message: string
    }
  | {
      success: false
      alreadyRedeemed: false
      status:
        | "auth_required"
        | "expired_qr"
        | "invalid_payload"
        | "not_found"
        | "forbidden"
        | "not_paid"
        | "cancelled"
        | "error"
      message: string
    }

type RedeemRpcRow = {
  redemption_id: string
  item_name: string
  item_description: string | null
  item_image_url: string | null
  item_category: string | null
  redeemed_at: string | null
  already_redeemed: boolean
  previous_redeemed_at: string | null
}

function mapEventItemRow(row: {
  id: string
  event_id: string
  name: string
  description: string | null
  price: number
  stock: number
  is_active: boolean
  image_url?: string | null
  category?: string | null
}): EventItem {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    stock: row.stock,
    isActive: row.is_active,
    imageUrl: row.image_url ?? null,
    category: parseEventItemCategory(row.category),
  }
}

export async function getEventItems(eventId: string): Promise<EventItem[]> {
  if (!eventId) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("event_items")
    .select(
      "id, event_id, name, description, price, stock, is_active, image_url, category",
    )
    .eq("event_id", eventId)
    .eq("is_active", true)
    .gt("stock", 0)
    .order("category", { ascending: true })
    .order("price", { ascending: true })

  if (error) {
    throw new Error(error.message || "No se pudieron cargar los productos.")
  }

  return (data ?? []).map(mapEventItemRow)
}

export async function userHasEventTicket(eventId: string): Promise<boolean> {
  if (!eventId) return false
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  const { data } = await supabase
    .from("tickets")
    .select("id")
    .eq("event_id", eventId)
    .eq("owner_id", user.id)
    .in("status", ["valid", "used", "scanned"])
    .limit(1)
    .maybeSingle()

  return Boolean(data?.id)
}

/** @deprecated Prefer getMyStoreRedemptions */
export async function getMyBarRedemptions(): Promise<MyStoreRedemption[]> {
  return getMyStoreRedemptions()
}

export async function getMyStoreRedemptions(): Promise<MyStoreRedemption[]> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error("auth_required")
  }

  const { data, error } = await supabase
    .from("item_redemptions")
    .select(
      `
      id,
      order_id,
      item_id,
      qr_code_token,
      status,
      redeemed_at,
      event_items (
        id,
        name,
        description,
        price,
        image_url,
        category,
        event_id,
        events (
          id,
          title,
          date,
          location
        )
      )
    `,
    )
    .eq("user_id", user.id)
    .in("status", ["valid", "redeemed"])
    .order("created_at", { ascending: false })

  if (error) {
    throw new WalletLoadError()
  }

  type Row = {
    id: string
    order_id?: string | null
    item_id?: string | null
    qr_code_token: string
    status: MyStoreRedemption["status"]
    redeemed_at: string | null
    event_items: {
      id?: string | null
      name: string
      description: string | null
      price: number
      image_url: string | null
      category: string | null
      event_id: string
      events: {
        id: string
        title: string
        date: string
        location: string
      } | null
    } | null
  }

  const rows = (data ?? []) as unknown as Row[]

  return rows
    .map((row) => {
      const item = row.event_items
      const event = item?.events
      if (!item || !event) return null

      return {
        id: row.id,
        qrCodeToken: row.qr_code_token,
        status: row.status,
        redeemedAt: row.redeemed_at,
        itemId: row.item_id?.trim() || item.id?.trim() || null,
        orderId: row.order_id?.trim() || null,
        itemName: item.name,
        itemDescription: item.description,
        itemPrice: Number(item.price),
        itemImageUrl: item.image_url,
        itemCategory: parseEventItemCategory(item.category),
        eventId: event.id,
        eventTitle: event.title,
        eventDate: event.date,
        eventLocation: event.location?.trim() || "Online",
      } satisfies MyStoreRedemption
    })
    .filter((row): row is MyStoreRedemption => row !== null)
}

/**
 * Canje atómico vía RPC `redeem_item`.
 * Acepta Living QR (base64) o el token crudo `bar_…`.
 */
export async function redeemItemRPC(
  qrToken: string,
  staffUserId?: string,
): Promise<RedeemItemResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      success: false,
      alreadyRedeemed: false,
      status: "auth_required",
      message: "Iniciá sesión para validar canjes.",
    }
  }

  const staffId = staffUserId ?? user.id
  if (staffId !== user.id) {
    return {
      success: false,
      alreadyRedeemed: false,
      status: "forbidden",
      message: "No podés canjear en nombre de otro staff.",
    }
  }

  const decoded = decodeLivingStorePayload(qrToken)
  if (!decoded) {
    return {
      success: false,
      alreadyRedeemed: false,
      status: "invalid_payload",
      message: "QR de canje inválido.",
    }
  }

  const isRawToken = qrToken.trim().startsWith("bar_")
  if (!isRawToken) {
    const currentBlock = Math.floor(Date.now() / STORE_QR_ROTATION_MS)
    if (decoded.timestampBlock < currentBlock - STORE_QR_GRACE_BLOCKS) {
      return {
        success: false,
        alreadyRedeemed: false,
        status: "expired_qr",
        message: "QR expirado. Pedile al cliente que muestre el código vivo.",
      }
    }
  }

  const { data, error } = await supabase.rpc("redeem_item", {
    p_qr_token: decoded.token,
    p_staff_user_id: staffId,
  })

  if (error) {
    const message = error.message || "No se pudo canjear el producto."
    const normalized = message.toLowerCase()

    if (
      normalized.includes("no encontrada") ||
      normalized.includes("no encontrado") ||
      normalized.includes("not found")
    ) {
      return {
        success: false,
        alreadyRedeemed: false,
        status: "not_found",
        message: "Canje no encontrado.",
      }
    }

    if (normalized.includes("permiso") || normalized.includes("forbidden")) {
      return {
        success: false,
        alreadyRedeemed: false,
        status: "forbidden",
        message: "Sin permiso de tienda para este evento.",
      }
    }

    if (
      normalized.includes("no pagad") ||
      normalized.includes("aún no pagad") ||
      normalized.includes("pending")
    ) {
      return {
        success: false,
        alreadyRedeemed: false,
        status: "not_paid",
        message: "Este producto aún no está pagado.",
      }
    }

    if (normalized.includes("cancelad")) {
      return {
        success: false,
        alreadyRedeemed: false,
        status: "cancelled",
        message: "Canje cancelado.",
      }
    }

    return {
      success: false,
      alreadyRedeemed: false,
      status: "error",
      message,
    }
  }

  const rows = (data ?? []) as RedeemRpcRow[]
  const row = rows[0]

  if (!row) {
    return {
      success: false,
      alreadyRedeemed: false,
      status: "error",
      message: "Respuesta vacía del canje.",
    }
  }

  if (row.already_redeemed) {
    return {
      success: false,
      alreadyRedeemed: true,
      itemName: row.item_name,
      itemImageUrl: row.item_image_url,
      previousRedeemedAt: row.previous_redeemed_at,
      message: "Este producto ya fue entregado.",
    }
  }

  revalidatePath("/admin/bar-scanner")
  revalidatePath("/admin/store-scanner")
  revalidatePath("/cuenta/entradas")

  return {
    success: true,
    alreadyRedeemed: false,
    itemName: row.item_name,
    itemDescription: row.item_description,
    itemImageUrl: row.item_image_url,
    itemCategory: row.item_category
      ? parseEventItemCategory(row.item_category)
      : null,
    redeemedAt: row.redeemed_at ?? new Date().toISOString(),
  }
}

async function uploadStoreItemImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizerId: string,
  eventId: string,
  file: File,
): Promise<{ url: string } | { error: string }> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { error: "Usá PNG, JPG o WEBP." }
  }
  if (file.size > MAX_STORE_IMAGE_BYTES) {
    return { error: "La imagen supera los 5MB." }
  }

  const ext =
    file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
  const path = `${organizerId}/store/${eventId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from("event-flyers")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    })

  if (uploadError) {
    return { error: `No se pudo subir la imagen: ${uploadError.message}` }
  }

  const { data } = supabase.storage.from("event-flyers").getPublicUrl(path)
  if (!data?.publicUrl) {
    await supabase.storage.from("event-flyers").remove([path])
    return { error: "No se pudo obtener la URL pública." }
  }

  return { url: data.publicUrl }
}

export async function createEventItem(input: {
  eventId: string
  name: string
  description?: string | null
  price: number
  stock: number
  category: EventItemCategory
  imageFile?: File | null
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "auth_required" }
  }

  const name = input.name.trim()
  if (!name || !input.eventId) {
    return { success: false, error: "Datos incompletos." }
  }

  if (!EVENT_ITEM_CATEGORIES.includes(input.category)) {
    return { success: false, error: "Categoría inválida." }
  }

  if (!Number.isFinite(input.price) || input.price < 0) {
    return { success: false, error: "Precio inválido." }
  }

  if (!Number.isInteger(input.stock) || input.stock < 0) {
    return { success: false, error: "Stock inválido." }
  }

  const { data: event } = await supabase
    .from("events")
    .select("id, organizer_id")
    .eq("id", input.eventId)
    .maybeSingle()

  if (!event) {
    return { success: false, error: "Evento no encontrado." }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (
    event.organizer_id !== user.id &&
    profile?.role !== "super_admin"
  ) {
    return { success: false, error: "Sin permiso para este evento." }
  }

  let imageUrl: string | null = null
  if (input.imageFile && input.imageFile.size > 0) {
    const uploaded = await uploadStoreItemImage(
      supabase,
      event.organizer_id,
      input.eventId,
      input.imageFile,
    )
    if ("error" in uploaded) {
      return { success: false, error: uploaded.error }
    }
    imageUrl = uploaded.url
  }

  const { data, error } = await supabase
    .from("event_items")
    .insert({
      event_id: input.eventId,
      name,
      description: input.description?.trim() || null,
      price: input.price,
      stock: input.stock,
      is_active: true,
      category: input.category,
      image_url: imageUrl,
    })
    .select("id")
    .single()

  if (error || !data) {
    console.error("SUPABASE_ERROR:", error)
    if (imageUrl) {
      const path = imageUrl.split("/event-flyers/")[1]
      if (path) await supabase.storage.from("event-flyers").remove([path])
    }
    return {
      success: false,
      error: error?.message || "No se pudo crear el producto.",
    }
  }

  revalidatePath(`/admin/events/${input.eventId}/store`)
  revalidatePath(`/admin/events/${input.eventId}/bar`)
  revalidatePath(`/admin/events/${input.eventId}`)
  revalidatePath(`/events/${input.eventId}`)
  revalidatePath("/cuenta/entradas")

  return { success: true, id: data.id }
}

export type StoreCheckoutResult =
  | {
      success: true
      initPoint: string
      paymentUrl: string
      orderId: string
      expiresAt: string
    }
  | { success: false; error: string }

/**
 * Compra standalone de la Tienda de Extras (post-ticket).
 * Requiere al menos un ticket válido/usado/escaneado del evento.
 */
export async function startStoreCheckout(
  eventId: string,
  items: Array<{ itemId: string; quantity: number }>,
): Promise<StoreCheckoutResult> {
  const cleanEventId = eventId?.trim()
  if (!cleanEventId || items.length === 0) {
    return { success: false, error: "Seleccioná al menos un producto." }
  }

  for (const item of items) {
    if (
      !item.itemId ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 20
    ) {
      return { success: false, error: "Cantidad inválida." }
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

  const { data: orderId, error } = await supabase.rpc("create_store_order_tx", {
    p_event_id: cleanEventId,
    p_owner_id: user.id,
    p_items: items.map((item) => ({
      item_id: item.itemId,
      quantity: item.quantity,
    })),
  })

  if (error || !orderId) {
    const message = error?.message || "No se pudo crear la orden de la tienda."
    if (message.includes("STORE_REQUIRES_TICKET")) {
      return {
        success: false,
        error:
          "Necesitás una entrada válida de este evento para comprar extras.",
      }
    }
    if (message.toLowerCase().includes("stock")) {
      return { success: false, error: "out_of_stock" }
    }
    logger.error({
      context: "store/checkout",
      message: "create_store_order_failed",
      eventId: cleanEventId,
      userId: user.id,
      error: message,
    })
    return { success: false, error: message }
  }

  const preference = await createPaymentPreference(String(orderId))
  if (!preference.success) {
    try {
      const admin = createAdminClient()
      await admin.rpc("release_order_event_items", {
        p_order_id: String(orderId),
      })
      await admin.from("orders").delete().eq("id", String(orderId))
    } catch (cleanupError) {
      logger.error({
        context: "store/checkout",
        message: "store_order_cleanup_failed",
        orderId: String(orderId),
        error:
          cleanupError instanceof Error
            ? cleanupError.message
            : "unknown_cleanup_error",
      })
    }
    return {
      success: false,
      error: preference.error || "No se pudo iniciar el pago.",
    }
  }

  revalidatePath("/cuenta/entradas")
  revalidatePath(`/events/${cleanEventId}`)

  return {
    success: true,
    initPoint: preference.initPoint,
    paymentUrl: preference.initPoint,
    orderId: String(orderId),
    expiresAt: resolveCheckoutExpiresAt().toISOString(),
  }
}
