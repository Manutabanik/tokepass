"use server"

import { createClient } from "@/lib/supabase/server"

export type BuyerNotificationKind = "transfer" | "profile_dni" | "order"

export type BuyerNotification = {
  id: string
  kind: BuyerNotificationKind
  title: string
  body: string
  href: string
  createdAt: string
  /** Pestaña del portal donde mostrar el badge */
  tab: "entradas" | "perfil" | "compras" | "inicio"
}

/**
 * Snapshot de novedades del comprador (sin tabla dedicada).
 * El estado leído/no leído vive en el cliente (localStorage).
 */
export async function getBuyerNotifications(): Promise<BuyerNotification[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const now = Date.now()
  const transfersSince = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
  const ordersSince = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: profile }, { data: giftedTickets }, { data: orders }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("dni")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("tickets")
        .select("id, created_at, events(title)")
        .eq("owner_id", user.id)
        .not("transferred_from_id", "is", null)
        .gte("created_at", transfersSince)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("orders")
        .select("id, created_at, total_amount, status")
        .eq("buyer_id", user.id)
        .eq("status", "paid")
        .gte("created_at", ordersSince)
        .order("created_at", { ascending: false })
        .limit(20),
    ])

  const items: BuyerNotification[] = []

  const dniDigits = (profile?.dni ?? "").replace(/\D/g, "")
  if (dniDigits.length < 7) {
    items.push({
      id: "profile-dni",
      kind: "profile_dni",
      title: "Completá tu DNI",
      body: "Sin DNI no podemos identificarte en la puerta si no tenés el celular.",
      href: "/cuenta/perfil",
      createdAt: new Date().toISOString(),
      tab: "perfil",
    })
  }

  for (const row of giftedTickets ?? []) {
    const event = row.events as unknown as { title?: string } | null
    const title = event?.title?.trim() || "un evento"
    items.push({
      id: `transfer:${row.id}`,
      kind: "transfer",
      title: "Te regalaron una entrada",
      body: `Ya está en tu billetera: ${title}.`,
      href: `/cuenta/entradas/${row.id}`,
      createdAt: row.created_at,
      tab: "entradas",
    })
  }

  for (const order of orders ?? []) {
    items.push({
      id: `order:${order.id}`,
      kind: "order",
      title: "Compra confirmada",
      body: "Tu pago se acreditó. Podés ver el comprobante y tus entradas.",
      href: "/cuenta/compras",
      createdAt: order.created_at,
      tab: "compras",
    })
  }

  items.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  return items
}
