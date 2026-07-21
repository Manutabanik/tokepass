"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

const ROTATION_MS = 15_000
const GRACE_BLOCKS = 1

export type EventItem = {
  id: string
  eventId: string
  name: string
  description: string | null
  price: number
  stock: number
  isActive: boolean
}

export type MyBarRedemption = {
  id: string
  qrCodeToken: string
  status: "pending" | "valid" | "redeemed" | "cancelled"
  redeemedAt: string | null
  itemName: string
  itemDescription: string | null
  itemPrice: number
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
      redeemedAt: string
    }
  | {
      success: false
      alreadyRedeemed: true
      itemName: string
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
  redeemed_at: string | null
  already_redeemed: boolean
  previous_redeemed_at: string | null
}

function decodeLivingBarPayload(base64Payload: string): {
  token: string
  timestampBlock: number
} | null {
  try {
    const cleaned = base64Payload.trim()

    // Payload Living (base64) o token crudo `bar_…` para fallback.
    if (cleaned.startsWith("bar_") && !cleaned.includes(" ")) {
      return { token: cleaned, timestampBlock: Math.floor(Date.now() / ROTATION_MS) }
    }

    const decoded = Buffer.from(cleaned, "base64").toString("utf8")
    const separator = decoded.lastIndexOf("-")

    if (separator <= 0 || separator === decoded.length - 1) {
      return null
    }

    const token = decoded.slice(0, separator)
    const timestampBlock = Number(decoded.slice(separator + 1))

    if (
      !token ||
      !Number.isFinite(timestampBlock) ||
      !Number.isInteger(timestampBlock)
    ) {
      return null
    }

    return { token, timestampBlock }
  } catch {
    return null
  }
}

export async function getEventItems(eventId: string): Promise<EventItem[]> {
  if (!eventId) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("event_items")
    .select("id, event_id, name, description, price, stock, is_active")
    .eq("event_id", eventId)
    .eq("is_active", true)
    .gt("stock", 0)
    .order("price", { ascending: true })

  if (error) {
    throw new Error(error.message || "No se pudieron cargar las consumiciones.")
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    stock: row.stock,
    isActive: row.is_active,
  }))
}

export async function getMyBarRedemptions(): Promise<MyBarRedemption[]> {
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
      qr_code_token,
      status,
      redeemed_at,
      event_items (
        name,
        description,
        price,
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
    throw new Error(error.message || "No se pudieron cargar tus consumiciones.")
  }

  type Row = {
    id: string
    qr_code_token: string
    status: MyBarRedemption["status"]
    redeemed_at: string | null
    event_items: {
      name: string
      description: string | null
      price: number
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
        itemName: item.name,
        itemDescription: item.description,
        itemPrice: Number(item.price),
        eventId: event.id,
        eventTitle: event.title,
        eventDate: event.date,
        eventLocation: event.location,
      } satisfies MyBarRedemption
    })
    .filter((row): row is MyBarRedemption => row !== null)
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
      message: "Iniciá sesión para validar consumiciones.",
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

  const decoded = decodeLivingBarPayload(qrToken)
  if (!decoded) {
    return {
      success: false,
      alreadyRedeemed: false,
      status: "invalid_payload",
      message: "QR de barra inválido.",
    }
  }

  // Living QR: ventana de 15s + 1 bloque de gracia (misma política que puerta).
  // Token crudo `bar_…` saltea la expiración (fallback / pruebas).
  const isRawToken = qrToken.trim().startsWith("bar_")
  if (!isRawToken) {
    const currentBlock = Math.floor(Date.now() / ROTATION_MS)
    if (decoded.timestampBlock < currentBlock - GRACE_BLOCKS) {
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
    const message = error.message || "No se pudo canjear la consumición."
    const normalized = message.toLowerCase()

    if (normalized.includes("no encontrada") || normalized.includes("not found")) {
      return {
        success: false,
        alreadyRedeemed: false,
        status: "not_found",
        message: "Consumición no encontrada.",
      }
    }

    if (normalized.includes("permiso") || normalized.includes("forbidden")) {
      return {
        success: false,
        alreadyRedeemed: false,
        status: "forbidden",
        message: "Sin permiso de barra para este evento.",
      }
    }

    if (normalized.includes("no pagada") || normalized.includes("pending")) {
      return {
        success: false,
        alreadyRedeemed: false,
        status: "not_paid",
        message: "Esta consumición aún no está pagada.",
      }
    }

    if (normalized.includes("cancelad")) {
      return {
        success: false,
        alreadyRedeemed: false,
        status: "cancelled",
        message: "Consumición cancelada.",
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
      previousRedeemedAt: row.previous_redeemed_at,
      message: "Esta consumición ya fue entregada.",
    }
  }

  revalidatePath("/admin/bar-scanner")
  revalidatePath("/my-tickets")

  return {
    success: true,
    alreadyRedeemed: false,
    itemName: row.item_name,
    itemDescription: row.item_description,
    redeemedAt: row.redeemed_at ?? new Date().toISOString(),
  }
}

export async function createEventItem(input: {
  eventId: string
  name: string
  description?: string | null
  price: number
  stock: number
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

  if (!Number.isFinite(input.price) || input.price < 0) {
    return { success: false, error: "Precio inválido." }
  }

  if (!Number.isInteger(input.stock) || input.stock < 0) {
    return { success: false, error: "Stock inválido." }
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
    })
    .select("id")
    .single()

  if (error || !data) {
    return {
      success: false,
      error: error?.message || "No se pudo crear el producto.",
    }
  }

  revalidatePath(`/admin/events/${input.eventId}/bar`)
  revalidatePath(`/events/${input.eventId}`)

  return { success: true, id: data.id }
}
