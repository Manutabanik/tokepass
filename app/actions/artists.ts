"use server"

import { revalidatePath } from "next/cache"

import {
  ARTIST_SEARCH_LIMIT,
  isArtistUuid,
  mapArtistHit,
  mapLineupItem,
  normalizeArtistName,
  normalizeOptionalUrl,
  normalizeSpotifyId,
  sanitizeArtistQuery,
  serializeLineupForEvent,
  toPerformanceIso,
  type ArtistActionResult,
  type ArtistSearchHit,
  type EventLineupItem,
  type LineupDraftItem,
} from "@/lib/artists"
import { logger } from "@/lib/logger"
import {
  isSpotifyConfigured,
  searchSpotifyCatalog,
} from "@/lib/spotify/client"
import type { SpotifyArtistHit } from "@/lib/spotify/map"
import { createClient } from "@/lib/supabase/server"

async function requireOrganizerSession() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "Debés iniciar sesión." }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role === "super_admin") {
    return { ok: true as const, supabase }
  }

  const { count } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("organizer_id", user.id)

  if ((count ?? 0) === 0) {
    return {
      ok: false as const,
      error: "Solo organizadores pueden gestionar artistas.",
    }
  }

  return { ok: true as const, supabase }
}

async function requireEventOrganizer(eventId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "Debés iniciar sesión." }

  const [{ data: profile }, { data: event }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("events")
      .select("id, organizer_id, slug")
      .eq("id", eventId)
      .maybeSingle(),
  ])

  if (!event) return { ok: false as const, error: "Evento no encontrado." }
  if (event.organizer_id !== user.id && profile?.role !== "super_admin") {
    return { ok: false as const, error: "No tenés permiso para este evento." }
  }

  return { ok: true as const, supabase, event }
}

function revalidateLineup(eventId: string, slug?: string | null) {
  revalidatePath(`/admin/events/${eventId}/edit`)
  revalidatePath(`/events/${eventId}`)
  if (slug) revalidatePath(`/eventos/${slug}`)
}

export async function searchArtists(
  query: string,
): Promise<ArtistActionResult<ArtistSearchHit[]>> {
  try {
    const needle = sanitizeArtistQuery(query)
    if (needle.length < 2) {
      return { success: true, data: [] }
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("artists")
      .select("id, name, image_url, spotify_id")
      .ilike("name", `%${needle}%`)
      .order("name", { ascending: true })
      .limit(ARTIST_SEARCH_LIMIT)

    if (error) {
      logger.error({
        context: "artists",
        message: "search_artists_failed",
        error,
      })
      return {
        success: false,
        error: "No se pudo buscar artistas.",
        data: [],
      }
    }

    return { success: true, data: (data ?? []).map(mapArtistHit) }
  } catch (error) {
    logger.error({
      context: "artists",
      message: "search_artists_unexpected",
      error,
    })
    return {
      success: false,
      error: "No se pudo buscar artistas.",
      data: [],
    }
  }
}

export async function searchSpotifyArtists(
  query: string,
): Promise<ArtistActionResult<SpotifyArtistHit[]>> {
  try {
    const access = await requireOrganizerSession()
    if (!access.ok) return { success: false, error: access.error }

    const needle = sanitizeArtistQuery(query)
    if (needle.length < 2) {
      return { success: true, data: [] }
    }

    if (!isSpotifyConfigured()) {
      return {
        success: false,
        error: "Spotify no está configurado.",
        data: [],
      }
    }

    const result = await searchSpotifyCatalog(needle)
    if (!result.ok) {
      return {
        success: false,
        error: "No se pudo buscar en Spotify.",
        data: [],
      }
    }
    return { success: true, data: result.items }
  } catch (error) {
    logger.error({
      context: "artists",
      message: "search_spotify_artists_unexpected",
      error,
    })
    return {
      success: false,
      error: "No se pudo buscar en Spotify.",
      data: [],
    }
  }
}

export async function createArtist(data: {
  name: string
  imageUrl?: string
  spotifyId?: string
}): Promise<ArtistActionResult<ArtistSearchHit>> {
  try {
    const access = await requireOrganizerSession()
    if (!access.ok) return { success: false, error: access.error }

    const name = normalizeArtistName(data.name)
    if (!name) {
      return { success: false, error: "El nombre del artista no puede estar vacío." }
    }

    const imageUrl = normalizeOptionalUrl(data.imageUrl)
    if (imageUrl === undefined) {
      return { success: false, error: "La foto tiene que ser una URL http o https." }
    }

    const spotifyId = normalizeSpotifyId(data.spotifyId)

    const { data: row, error } = await access.supabase
      .from("artists")
      .insert({
        name,
        image_url: imageUrl,
        spotify_id: spotifyId,
      })
      .select("id, name, image_url, spotify_id")
      .single()

    if (error) {
      if (error.code === "23505") {
        return {
          success: false,
          error: "Ya existe un artista con ese identificador de Spotify.",
        }
      }
      logger.error({
        context: "artists",
        message: "create_artist_failed",
        error,
      })
      return { success: false, error: "No se pudo crear el artista." }
    }

    return { success: true, data: mapArtistHit(row) }
  } catch (error) {
    logger.error({
      context: "artists",
      message: "create_artist_unexpected",
      error,
    })
    return { success: false, error: "No se pudo crear el artista." }
  }
}

export async function addArtistToLineup(
  eventId: string,
  artistId: string,
  performanceTime?: Date | string,
  order?: number,
): Promise<ArtistActionResult<EventLineupItem>> {
  try {
    if (!isArtistUuid(eventId) || !isArtistUuid(artistId)) {
      return { success: false, error: "Identificadores inválidos." }
    }

    const access = await requireEventOrganizer(eventId)
    if (!access.ok) return { success: false, error: access.error }

    const { data: artist, error: artistError } = await access.supabase
      .from("artists")
      .select("id, name, image_url, spotify_id")
      .eq("id", artistId)
      .maybeSingle()

    if (artistError || !artist) {
      return { success: false, error: "Artista no encontrado." }
    }

    const time = toPerformanceIso(performanceTime)
    if (time === undefined) {
      return { success: false, error: "El horario de presentación no es válido." }
    }

    let sortOrder = Number.isFinite(order) ? Math.max(0, Math.floor(order ?? 0)) : null
    if (sortOrder == null) {
      const { data: last } = await access.supabase
        .from("event_artists")
        .select("sort_order")
        .eq("event_id", access.event.id)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle()
      sortOrder = Number(last?.sort_order ?? -1) + 1
    }

    const { data: row, error } = await access.supabase
      .from("event_artists")
      .insert({
        event_id: access.event.id,
        artist_id: artist.id,
        performance_time: time,
        sort_order: sortOrder,
      })
      .select("id, event_id, artist_id, performance_time, stage, sort_order")
      .single()

    if (error) {
      if (error.code === "23505") {
        return {
          success: false,
          error: "Ese artista ya está en la grilla de este evento.",
        }
      }
      logger.error({
        context: "artists",
        message: "add_artist_to_lineup_failed",
        event_id: access.event.id,
        error,
      })
      return { success: false, error: "No se pudo sumar el artista a la grilla." }
    }

    revalidateLineup(access.event.id, access.event.slug)
    return {
      success: true,
      data: mapLineupItem({ ...row, artists: artist }),
    }
  } catch (error) {
    logger.error({
      context: "artists",
      message: "add_artist_to_lineup_unexpected",
      event_id: eventId,
      error,
    })
    return { success: false, error: "No se pudo sumar el artista a la grilla." }
  }
}

export async function getEventLineup(
  eventId: string,
): Promise<ArtistActionResult<EventLineupItem[]>> {
  try {
    if (!isArtistUuid(eventId)) {
      return { success: false, error: "Evento inválido." }
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("event_artists")
      .select(
        "id, event_id, artist_id, performance_time, stage, sort_order, artists(id, name, image_url, spotify_id)",
      )
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true })

    if (error) {
      logger.error({
        context: "artists",
        message: "get_event_lineup_failed",
        event_id: eventId,
        error,
      })
      return { success: false, error: "No se pudo cargar la grilla de artistas." }
    }

    return { success: true, data: (data ?? []).map(mapLineupItem) }
  } catch (error) {
    logger.error({
      context: "artists",
      message: "get_event_lineup_unexpected",
      event_id: eventId,
      error,
    })
    return { success: false, error: "No se pudo cargar la grilla de artistas." }
  }
}

export async function removeArtistFromLineup(
  eventId: string,
  lineupEntryId: string,
): Promise<ArtistActionResult<{ id: string }>> {
  try {
    if (!isArtistUuid(eventId) || !isArtistUuid(lineupEntryId)) {
      return { success: false, error: "Identificadores inválidos." }
    }
    const access = await requireEventOrganizer(eventId)
    if (!access.ok) return { success: false, error: access.error }

    const { error } = await access.supabase
      .from("event_artists")
      .delete()
      .eq("id", lineupEntryId)
      .eq("event_id", access.event.id)

    if (error) {
      logger.error({
        context: "artists",
        message: "remove_artist_from_lineup_failed",
        event_id: access.event.id,
        error,
      })
      return { success: false, error: "No se pudo quitar el artista." }
    }

    revalidateLineup(access.event.id, access.event.slug)
    return { success: true, data: { id: lineupEntryId } }
  } catch (error) {
    logger.error({
      context: "artists",
      message: "remove_artist_from_lineup_unexpected",
      event_id: eventId,
      error,
    })
    return { success: false, error: "No se pudo quitar el artista." }
  }
}

export async function persistEventLineupSnapshot(
  eventId: string,
  lineup: LineupDraftItem[],
): Promise<ArtistActionResult<{ count: number }>> {
  try {
    if (!isArtistUuid(eventId)) {
      return { success: false, error: "Evento inválido." }
    }
    const access = await requireEventOrganizer(eventId)
    if (!access.ok) return { success: false, error: access.error }

    const payload = serializeLineupForEvent(lineup)
    const { error } = await access.supabase
      .from("events")
      .update({ lineup: payload })
      .eq("id", access.event.id)

    if (error && !/lineup|schema cache|PGRST204|42703/i.test(error.message)) {
      logger.error({
        context: "artists",
        message: "persist_lineup_json_failed",
        event_id: access.event.id,
        error,
      })
      return { success: false, error: "No se pudo guardar la grilla de artistas." }
    }

    const ordered = lineup.map((item, index) => ({ ...item, order: index }))
    for (const item of ordered) {
      if (!item.lineupEntryId || !isArtistUuid(item.lineupEntryId)) continue
      await access.supabase
        .from("event_artists")
        .update({
          sort_order: item.order,
          stage: item.stage?.trim() || null,
        })
        .eq("id", item.lineupEntryId)
        .eq("event_id", access.event.id)
    }

    revalidateLineup(access.event.id, access.event.slug)
    return { success: true, data: { count: payload.length } }
  } catch (error) {
    logger.error({
      context: "artists",
      message: "persist_lineup_unexpected",
      event_id: eventId,
      error,
    })
    return { success: false, error: "No se pudo guardar la grilla de artistas." }
  }
}
