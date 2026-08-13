"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

export type FavoriteEvent = {
  eventId: string
  title: string
  date: string
  location: string
  flyerUrl: string | null
  favoritedAt: string
}

export async function listMyFavoriteEventIds(): Promise<string[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from("user_favorites")
    .select("event_id")
    .eq("user_id", user.id)

  return (data ?? []).map((row) => row.event_id as string)
}

export async function listMyFavoriteEvents(): Promise<FavoriteEvent[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("auth_required")

  const { data, error } = await supabase
    .from("user_favorites")
    .select(
      "event_id, created_at, events(id, title, date, location, flyer_url, image_url, status)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).flatMap((row) => {
    const event = row.events as unknown as {
      id: string
      title: string
      date: string
      location: string
      flyer_url: string | null
      image_url: string | null
      status: string
    } | null
    if (!event || event.status === "cancelled" || event.status === "archived") {
      return []
    }
    return [
      {
        eventId: event.id,
        title: event.title,
        date: event.date,
        location: event.location,
        flyerUrl: event.flyer_url ?? event.image_url,
        favoritedAt: row.created_at as string,
      },
    ]
  })
}

export async function toggleFavoriteEvent(
  eventId: string,
): Promise<
  | { success: true; favorited: boolean }
  | { success: false; error: string }
> {
  if (!eventId) return { success: false, error: "Evento inválido." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "auth_required" }
  }

  const { data: existing } = await supabase
    .from("user_favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("event_id", eventId)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await supabase
      .from("user_favorites")
      .delete()
      .eq("id", existing.id)
    if (error) return { success: false, error: error.message }
    revalidatePath("/cuenta/favoritos")
    revalidatePath(`/events/${eventId}`)
    revalidatePath("/events")
    return { success: true, favorited: false }
  }

  const { error } = await supabase.from("user_favorites").insert({
    user_id: user.id,
    event_id: eventId,
  })

  if (error) return { success: false, error: error.message }

  revalidatePath("/cuenta/favoritos")
  revalidatePath(`/events/${eventId}`)
  revalidatePath("/events")
  return { success: true, favorited: true }
}
