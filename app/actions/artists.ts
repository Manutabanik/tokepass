"use server"

import { revalidatePath } from "next/cache"

import {
  ARTIST_SEARCH_LIMIT,
  EVENT_ARTISTS_LINEUP_SELECT,
  EVENT_ARTISTS_LINEUP_SELECT_LEGACY,
  EVENT_ARTISTS_LINEUP_SELECT_LEGACY_NO_PREVIEW,
  EVENT_ARTISTS_LINEUP_SELECT_NO_PREVIEW,
  isArtistUuid,
  isMissingHeadlinerColumn,
  isMissingTopTrackColumn,
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
  fetchArtistTopTrack,
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

const ARTIST_ROW_SELECT =
  "id, name, image_url, spotify_id, top_track_preview_url, top_track_name"
const ARTIST_ROW_SELECT_LEGACY = "id, name, image_url, spotify_id"

async function selectArtistRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filter: { column: string; value: string },
) {
  const withPreview = await supabase
    .from("artists")
    .select(ARTIST_ROW_SELECT)
    .eq(filter.column, filter.value)
    .maybeSingle()
  if (!withPreview.error || !isMissingTopTrackColumn(withPreview.error.message)) {
    return withPreview
  }
  return supabase
    .from("artists")
    .select(ARTIST_ROW_SELECT_LEGACY)
    .eq(filter.column, filter.value)
    .maybeSingle()
}

async function queryEventArtistsLineup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
) {
  const withPreview = await supabase
    .from("event_artists")
    .select(EVENT_ARTISTS_LINEUP_SELECT)
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true })

  if (!withPreview.error) return withPreview

  if (isMissingTopTrackColumn(withPreview.error.message)) {
    const noPreview = await supabase
      .from("event_artists")
      .select(EVENT_ARTISTS_LINEUP_SELECT_NO_PREVIEW)
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true })
    if (!noPreview.error || !isMissingHeadlinerColumn(noPreview.error.message)) {
      return noPreview
    }
  }

  if (isMissingHeadlinerColumn(withPreview.error.message)) {
    const legacyPreview = await supabase
      .from("event_artists")
      .select(EVENT_ARTISTS_LINEUP_SELECT_LEGACY)
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true })
    if (
      !legacyPreview.error ||
      !isMissingTopTrackColumn(legacyPreview.error.message)
    ) {
      return legacyPreview
    }
  }

  return supabase
    .from("event_artists")
    .select(EVENT_ARTISTS_LINEUP_SELECT_LEGACY_NO_PREVIEW)
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true })
}

async function resolveTopTrack(input: {
  spotifyId: string | null
  previewUrl?: string | null
  trackName?: string | null
}) {
  const pastedUrl = input.previewUrl?.trim() || null
  const pastedName = input.trackName?.trim() || null
  if (pastedUrl) {
    return { previewUrl: pastedUrl, trackName: pastedName }
  }
  if (!input.spotifyId) {
    return { previewUrl: null, trackName: pastedName }
  }
  return fetchArtistTopTrack(input.spotifyId)
}

export async function searchArtists(
  rawQuery: string,
): Promise<ArtistActionResult<ArtistSearchHit[]>> {
  try {
    const needle = sanitizeArtistQuery(rawQuery)
    if (needle.length < 2) {
      return { success: true, data: [] }
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("artists")
      .select(ARTIST_ROW_SELECT)
      .ilike("name", `%${needle}%`)
      .order("name", { ascending: true })
      .limit(ARTIST_SEARCH_LIMIT)

    const result =
      error && isMissingTopTrackColumn(error.message)
        ? await supabase
            .from("artists")
            .select(ARTIST_ROW_SELECT_LEGACY)
            .ilike("name", `%${needle}%`)
            .order("name", { ascending: true })
            .limit(ARTIST_SEARCH_LIMIT)
        : { data, error }

    if (result.error) {
      logger.error({
        context: "artists",
        message: "search_artists_failed",
        error: result.error,
      })
      return {
        success: false,
        error: "No se pudo buscar artistas.",
        data: [],
      }
    }

    return { success: true, data: (result.data ?? []).map(mapArtistHit) }
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
  topTrackPreviewUrl?: string | null
  topTrackName?: string | null
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

    const pastedPreview = normalizeOptionalUrl(data.topTrackPreviewUrl)
    if (pastedPreview === undefined) {
      return {
        success: false,
        error: "La muestra de audio tiene que ser una URL http o https.",
      }
    }

    const spotifyId = normalizeSpotifyId(data.spotifyId)
    const topTrack = await resolveTopTrack({
      spotifyId,
      previewUrl: pastedPreview,
      trackName: data.topTrackName,
    })

    const payload = {
      name,
      image_url: imageUrl,
      spotify_id: spotifyId,
      top_track_preview_url: topTrack.previewUrl,
      top_track_name: topTrack.trackName,
    }

    let inserted = await access.supabase
      .from("artists")
      .insert(payload as never)
      .select(ARTIST_ROW_SELECT)
      .single()

    if (inserted.error && isMissingTopTrackColumn(inserted.error.message)) {
      inserted = await access.supabase
        .from("artists")
        .insert({
          name,
          image_url: imageUrl,
          spotify_id: spotifyId,
        } as never)
        .select(ARTIST_ROW_SELECT_LEGACY)
        .single()
    }

    if (inserted.error) {
      if (inserted.error.code === "23505") {
        const existing = spotifyId
          ? await selectArtistRow(access.supabase, {
              column: "spotify_id",
              value: spotifyId,
            })
          : { data: null, error: inserted.error }
        if (existing.data) {
          const row = existing.data as {
            id: string
            top_track_preview_url?: string | null
          }
          if (!row.top_track_preview_url && (topTrack.previewUrl || spotifyId)) {
            await access.supabase
              .from("artists")
              .update({
                top_track_preview_url: topTrack.previewUrl,
                top_track_name: topTrack.trackName,
                updated_at: new Date().toISOString(),
              } as never)
              .eq("id", row.id)
            const refreshed = await selectArtistRow(access.supabase, {
              column: "id",
              value: row.id,
            })
            if (refreshed.data) {
              return { success: true, data: mapArtistHit(refreshed.data) }
            }
          }
          return { success: true, data: mapArtistHit(existing.data) }
        }
        return {
          success: false,
          error: "Ya existe un artista con ese identificador de Spotify.",
        }
      }
      logger.error({
        context: "artists",
        message: "create_artist_failed",
        error: inserted.error,
      })
      return { success: false, error: "No se pudo crear el artista." }
    }

    return { success: true, data: mapArtistHit(inserted.data) }
  } catch (error) {
    logger.error({
      context: "artists",
      message: "create_artist_unexpected",
      error,
    })
    return { success: false, error: "No se pudo crear el artista." }
  }
}

export async function updateArtistAudioPreview(input: {
  artistId: string
  previewUrl?: string | null
  trackName?: string | null
}): Promise<ArtistActionResult<ArtistSearchHit>> {
  try {
    const access = await requireOrganizerSession()
    if (!access.ok) return { success: false, error: access.error }
    if (!isArtistUuid(input.artistId)) {
      return { success: false, error: "Artista inválido." }
    }

    const previewUrl = normalizeOptionalUrl(input.previewUrl)
    if (previewUrl === undefined) {
      return {
        success: false,
        error: "La muestra de audio tiene que ser una URL http o https.",
      }
    }
    const trackName = input.trackName?.trim() || null

    const { data, error } = await access.supabase
      .from("artists")
      .update({
        top_track_preview_url: previewUrl,
        top_track_name: trackName,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", input.artistId)
      .select(ARTIST_ROW_SELECT)
      .maybeSingle()

    if (error) {
      if (isMissingTopTrackColumn(error.message)) {
        return {
          success: false,
          error:
            "Todavía no se puede guardar la muestra de audio. Actualizá la base de datos e intentá de nuevo.",
        }
      }
      return { success: false, error: "No se pudo guardar la muestra de audio." }
    }
    if (!data) return { success: false, error: "Artista no encontrado." }

    return { success: true, data: mapArtistHit(data) }
  } catch (error) {
    logger.error({
      context: "artists",
      message: "update_artist_preview_unexpected",
      error,
    })
    return { success: false, error: "No se pudo guardar la muestra de audio." }
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

    const { data: artist, error: artistError } = await selectArtistRow(
      access.supabase,
      { column: "id", value: artistId },
    )

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
    const query = await queryEventArtistsLineup(supabase, eventId)

    if (query.error) {
      logger.error({
        context: "artists",
        message: "get_event_lineup_failed",
        event_id: eventId,
        error: query.error,
      })
      return { success: false, error: "No se pudo cargar la grilla de artistas." }
    }

    return { success: true, data: (query.data ?? []).map(mapLineupItem) }
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
      const base = {
        sort_order: item.order,
        stage: item.stage?.trim() || null,
      }
      const { error: rowError } = await access.supabase
        .from("event_artists")
        .update({
          ...base,
          is_headliner: Boolean(item.isHeadliner),
        })
        .eq("id", item.lineupEntryId)
        .eq("event_id", access.event.id)

      if (rowError && isMissingHeadlinerColumn(rowError.message)) {
        await access.supabase
          .from("event_artists")
          .update(base)
          .eq("id", item.lineupEntryId)
          .eq("event_id", access.event.id)
      }
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
