import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

export type PublicOrganizerCard = {
  name: string
  bio: string | null
  avatarUrl: string | null
}

export async function fetchPublicOrganizerCard(
  supabase: SupabaseClient<Database>,
  organizerId: string | null | undefined,
): Promise<PublicOrganizerCard | null> {
  const id = organizerId?.trim()
  if (!id) return null

  const { data } = await supabase.rpc("get_public_organizer_profile", {
    p_organizer_id: id,
  })
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== "object") return null

  const profile = row as {
    public_name?: string | null
    public_bio?: string | null
    full_name?: string | null
    avatar_url?: string | null
  }
  const name =
    profile.public_name?.trim() || profile.full_name?.trim() || ""
  const bio = profile.public_bio?.trim() || null
  if (!name) {
    return {
      name: "Organizador",
      bio,
      avatarUrl: profile.avatar_url?.trim() || null,
    }
  }

  return {
    name,
    bio,
    avatarUrl: profile.avatar_url?.trim() || null,
  }
}

export async function fetchPublicOrganizerCards(
  supabase: SupabaseClient<Database>,
  organizerIds: string[],
): Promise<Map<string, PublicOrganizerCard>> {
  const unique = [...new Set(organizerIds.map((id) => id.trim()).filter(Boolean))]
  const entries = await Promise.all(
    unique.map(async (id) => {
      const card = await fetchPublicOrganizerCard(supabase, id)
      return [id, card] as const
    }),
  )
  const map = new Map<string, PublicOrganizerCard>()
  for (const [id, card] of entries) {
    if (card) map.set(id, card)
  }
  return map
}
