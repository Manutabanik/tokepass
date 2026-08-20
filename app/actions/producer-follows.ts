"use server"

import { revalidatePath } from "next/cache"

import { PRODUCER_FOLLOW_AUTH_REQUIRED } from "@/lib/producer-follows"
import { fetchPublicOrganizerCard } from "@/lib/public-organizer"
import { isEventUuid, publicProducerPath } from "@/lib/seo/site"
import { createClient } from "@/lib/supabase/server"

export async function isFollowingProducer(producerId: string): Promise<boolean> {
  const id = producerId.trim()
  if (!isEventUuid(id)) return false

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  const { data } = await supabase
    .from("user_producer_follows")
    .select("producer_id")
    .eq("user_id", user.id)
    .eq("producer_id", id)
    .maybeSingle()

  return Boolean(data?.producer_id)
}

export async function toggleFollowProducer(
  producerId: string,
): Promise<{ following: boolean }> {
  const id = producerId.trim()
  if (!isEventUuid(id)) {
    throw new Error("Productora inválida.")
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    throw new Error(PRODUCER_FOLLOW_AUTH_REQUIRED)
  }
  if (user.id === id) {
    throw new Error("No podés seguirte a vos mismo.")
  }

  const profile = await fetchPublicOrganizerCard(supabase, id)
  if (!profile) {
    throw new Error("Productora no encontrada.")
  }

  const { data: existing } = await supabase
    .from("user_producer_follows")
    .select("producer_id")
    .eq("user_id", user.id)
    .eq("producer_id", id)
    .maybeSingle()

  if (existing?.producer_id) {
    const { error } = await supabase
      .from("user_producer_follows")
      .delete()
      .eq("user_id", user.id)
      .eq("producer_id", id)
    if (error) throw new Error(error.message)
    revalidateProducerFollowPaths(id)
    return { following: false }
  }

  const { error } = await supabase.from("user_producer_follows").insert({
    user_id: user.id,
    producer_id: id,
  })
  if (error) throw new Error(error.message)
  revalidateProducerFollowPaths(id)
  return { following: true }
}

function revalidateProducerFollowPaths(producerId: string) {
  revalidatePath(publicProducerPath(producerId))
  revalidatePath("/producer/[id]", "page")
}
