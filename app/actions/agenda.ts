"use server"

import { revalidatePath } from "next/cache"

import {
  agendaBlockPatchSchema,
  agendaParticipantDraftSchema,
  collectAgendaParticipants,
  isMissingAgendaSchema,
  mapAgendaBlock,
  normalizeAgendaName,
  normalizeAgendaRoleTag,
  normalizeAgendaTitle,
  normalizeAgendaUrl,
  parseAgendaBlockDraft,
  resolveAgendaWindow,
  toParticipantInsert,
  type AgendaBlockDto,
  type AgendaBlockRow,
  type AgendaParticipantDraft,
  type AgendaParticipantDto,
} from "@/lib/agenda"
import { asUuidOrNull } from "@/lib/validations/relation-id"
import {
  normalizeScheduleDaysFromForm,
  parseScheduleDays,
  remapBoundDayId,
} from "@/lib/event-schedule"
import { logger } from "@/lib/logger"
import { createClient } from "@/lib/supabase/server"
import type { ScheduleDay } from "@/types/events"

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

const AGENDA_BLOCK_SELECT =
  "id, event_id, day_id, title, start_time, end_time, sort_order, created_at, updated_at, agenda_participants(id, agenda_block_id, name, role_tag, image_url, external_link, sort_order, created_at, updated_at)"

function missingAgendaError(message?: string | null) {
  if (isMissingAgendaSchema(message)) {
    return "La agenda aún no está disponible. Aplicá la migración de agenda universal."
  }
  return message?.trim() || "No pudimos guardar la agenda."
}

async function requireEventOrganizer(eventId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "Debés iniciar sesión." }

  const [{ data: profile }, withFlag] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("events")
      .select("id, organizer_id, slug, date, ends_at, has_schedule, schedule_days")
      .eq("id", eventId)
      .maybeSingle(),
  ])

  let event = withFlag.data
  if (
    !event &&
    withFlag.error &&
    isMissingAgendaSchema(withFlag.error.message)
  ) {
    const fallback = await supabase
      .from("events")
      .select("id, organizer_id, slug, date, ends_at, schedule_days")
      .eq("id", eventId)
      .maybeSingle()
    if (fallback.data) {
      event = { ...fallback.data, has_schedule: false }
    }
  }

  if (!event) return { ok: false as const, error: "Evento no encontrado." }
  return authorizeEvent(user.id, profile?.role, supabase, event)
}

function authorizeEvent(
  userId: string,
  role: string | null | undefined,
  supabase: Awaited<ReturnType<typeof createClient>>,
  event: {
    id: string
    organizer_id: string
    slug?: string | null
    date?: string | null
    ends_at?: string | null
    has_schedule?: boolean | null
    schedule_days?: unknown
  },
) {
  if (event.organizer_id !== userId && role !== "super_admin") {
    return { ok: false as const, error: "No tenés permiso para este evento." }
  }
  return { ok: true as const, supabase, event }
}

function revalidateAgenda(eventId: string, slug?: string | null) {
  revalidatePath(`/admin/events/${eventId}/edit`)
  revalidatePath(`/events/${eventId}`)
  if (slug) revalidatePath(`/eventos/${slug}`)
}

async function syncOfficialScheduleDays(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  incoming: ScheduleDay[],
): Promise<void> {
  if (incoming.length === 0) return
  const { error } = await supabase
    .from("events")
    .update({
      schedule_days: incoming,
      date: incoming[0]?.start_time,
      ends_at: incoming[incoming.length - 1]?.end_time ?? null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", eventId)
  if (error) {
    logger.error({
      context: "agenda",
      message: "sync_schedule_days_failed",
      event_id: eventId,
      error,
    })
  }
}

async function loadOfficialDays(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  jsonFallback?: unknown,
): Promise<Array<{ id: string; start_time: string }>> {
  const { data, error } = await supabase
    .from("event_schedules")
    .select("id, start_time")
    .eq("event_id", eventId)
    .order("start_time", { ascending: true })

  if (!error && data && data.length > 0) {
    return data.map((row) => ({ id: row.id, start_time: row.start_time }))
  }

  return parseScheduleDays(jsonFallback).map((day) => ({
    id: day.id,
    start_time: day.start_time,
  }))
}

async function loadDayAnchor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  dayId: string | null,
  eventDate: string | null | undefined,
  jsonFallback?: unknown,
): Promise<
  | { ok: true; anchorIso: string; dayId: string | null }
  | { ok: false; error: string }
> {
  const official = await loadOfficialDays(supabase, eventId, jsonFallback)
  const validIds = official.map((day) => day.id)
  const resolved = remapBoundDayId(dayId, validIds, "first")
  if (resolved) {
    const row = official.find((day) => day.id === resolved)
    return {
      ok: true,
      anchorIso: row?.start_time || eventDate || new Date().toISOString(),
      dayId: resolved,
    }
  }
  return {
    ok: true,
    anchorIso: eventDate || new Date().toISOString(),
    dayId: null,
  }
}

async function nextBlockOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  dayId: string | null,
) {
  let query = supabase
    .from("agenda_blocks")
    .select("sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: false })
    .limit(1)
  query = dayId ? query.eq("day_id", dayId) : query.is("day_id", null)
  const { data } = await query.maybeSingle()
  return (data?.sort_order ?? -1) + 1
}

async function fetchAgendaBlock(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  blockId: string,
): Promise<{ ok: true; block: AgendaBlockDto } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("agenda_blocks")
    .select(AGENDA_BLOCK_SELECT)
    .eq("id", blockId)
    .eq("event_id", eventId)
    .maybeSingle()

  if (error) {
    return { ok: false, error: missingAgendaError(error.message) }
  }
  if (!data) return { ok: false, error: "Bloque no encontrado." }
  return { ok: true, block: mapAgendaBlock(data as AgendaBlockRow) }
}

async function replaceBlockParticipants(
  supabase: Awaited<ReturnType<typeof createClient>>,
  blockId: string,
  participants: AgendaParticipantDraft[],
): Promise<{ error?: string }> {
  const { error: deleteError } = await supabase
    .from("agenda_participants")
    .delete()
    .eq("agenda_block_id", blockId)
  if (deleteError) {
    return { error: missingAgendaError(deleteError.message) }
  }

  if (participants.length === 0) return {}

  const rows = participants.map((participant, index) =>
    toParticipantInsert(blockId, participant, index),
  )
  const { error } = await supabase.from("agenda_participants").insert(rows as never)
  if (error) return { error: missingAgendaError(error.message) }
  return {}
}

export async function getEventHasSchedule(
  eventId: string,
): Promise<ActionResult<{ hasSchedule: boolean }>> {
  const access = await requireEventOrganizer(eventId)
  if (!access.ok) return { success: false, error: access.error }

  return {
    success: true,
    data: { hasSchedule: Boolean(access.event.has_schedule) },
  }
}

export async function setEventHasSchedule(
  eventId: string,
  hasSchedule: boolean,
): Promise<ActionResult<{ hasSchedule: boolean }>> {
  const access = await requireEventOrganizer(eventId)
  if (!access.ok) return { success: false, error: access.error }

  const { error } = await access.supabase
    .from("events")
    .update({
      has_schedule: Boolean(hasSchedule),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", eventId)

  if (error) {
    return { success: false, error: missingAgendaError(error.message) }
  }

  revalidateAgenda(eventId, access.event.slug)
  return { success: true, data: { hasSchedule: Boolean(hasSchedule) } }
}

export async function listEventAgenda(
  eventId: string,
): Promise<ActionResult<{ hasSchedule: boolean; blocks: AgendaBlockDto[] }>> {
  const access = await requireEventOrganizer(eventId)
  if (!access.ok) return { success: false, error: access.error }

  const { data, error } = await access.supabase
    .from("agenda_blocks")
    .select(AGENDA_BLOCK_SELECT)
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true })
    .order("start_time", { ascending: true })

  if (error) {
    return { success: false, error: missingAgendaError(error.message) }
  }

  const blocks = ((data ?? []) as AgendaBlockRow[]).map(mapAgendaBlock)
  return {
    success: true,
    data: {
      hasSchedule: Boolean(access.event.has_schedule),
      blocks,
    },
  }
}

export async function listPublishedEventAgenda(
  eventId: string,
): Promise<ActionResult<{ hasSchedule: boolean; blocks: AgendaBlockDto[] }>> {
  const supabase = await createClient()
  const withFlag = await supabase
    .from("events")
    .select("id, has_schedule, status, visibility")
    .eq("id", eventId)
    .maybeSingle()

  const event =
    withFlag.data ??
    (
      await supabase
        .from("events")
        .select("id, status, visibility")
        .eq("id", eventId)
        .maybeSingle()
    ).data

  if (!event) return { success: false, error: "Evento no encontrado." }

  const hasSchedule = Boolean(
    (event as { has_schedule?: boolean | null }).has_schedule,
  )
  if (!hasSchedule) {
    return { success: true, data: { hasSchedule: false, blocks: [] } }
  }

  const { data, error } = await supabase
    .from("agenda_blocks")
    .select(AGENDA_BLOCK_SELECT)
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true })
    .order("start_time", { ascending: true })

  if (error) {
    return { success: false, error: missingAgendaError(error.message) }
  }

  return {
    success: true,
    data: {
      hasSchedule: true,
      blocks: ((data ?? []) as AgendaBlockRow[]).map(mapAgendaBlock),
    },
  }
}

export async function createAgendaBlock(
  eventId: string,
  input: unknown,
  scheduleSnapshot?: unknown,
): Promise<ActionResult<AgendaBlockDto>> {
  const access = await requireEventOrganizer(eventId)
  if (!access.ok) return { success: false, error: access.error }

  const parsed = parseAgendaBlockDraft(input)
  if (!parsed.success) return parsed

  const incomingDays = normalizeScheduleDaysFromForm(
    Array.isArray(scheduleSnapshot) ? scheduleSnapshot : [],
  )
  if (incomingDays.length > 0) {
    await syncOfficialScheduleDays(access.supabase, eventId, incomingDays)
  }

  const day = await loadDayAnchor(
    access.supabase,
    eventId,
    parsed.data.dayId ?? null,
    access.event.date,
    incomingDays.length > 0 ? incomingDays : access.event.schedule_days,
  )
  if (!day.ok) return { success: false, error: day.error }

  const window = resolveAgendaWindow({
    startTime: parsed.data.startTime,
    endTime: parsed.data.endTime,
    anchorIso: day.anchorIso,
  })
  if ("error" in window) return { success: false, error: window.error }

  const sortOrder =
    parsed.data.order ??
    (await nextBlockOrder(access.supabase, eventId, day.dayId))

  const { data, error } = await access.supabase
    .from("agenda_blocks")
    .insert({
      event_id: eventId,
      day_id: day.dayId,
      title: parsed.data.title,
      start_time: window.start.toISOString(),
      end_time: window.end.toISOString(),
      sort_order: sortOrder,
    } as never)
    .select(AGENDA_BLOCK_SELECT)
    .maybeSingle()

  if (error || !data) {
    return {
      success: false,
      error: missingAgendaError(error?.message),
    }
  }

  const participants = parsed.data.participants
  if (participants && participants.length > 0) {
    const replaced = await replaceBlockParticipants(
      access.supabase,
      data.id,
      participants,
    )
    if (replaced.error) return { success: false, error: replaced.error }
  }

  const loaded = await fetchAgendaBlock(access.supabase, eventId, data.id)
  if (!loaded.ok) return { success: false, error: loaded.error }

  revalidateAgenda(eventId, access.event.slug)
  return { success: true, data: loaded.block }
}

export async function updateAgendaBlock(
  eventId: string,
  blockId: string,
  input: unknown,
  scheduleSnapshot?: unknown,
): Promise<ActionResult<AgendaBlockDto>> {
  const access = await requireEventOrganizer(eventId)
  if (!access.ok) return { success: false, error: access.error }

  const parsed = agendaBlockPatchSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "El bloque no es válido.",
    }
  }

  const incomingDays = normalizeScheduleDaysFromForm(
    Array.isArray(scheduleSnapshot) ? scheduleSnapshot : [],
  )
  if (incomingDays.length > 0) {
    await syncOfficialScheduleDays(access.supabase, eventId, incomingDays)
  }

  const existing = await fetchAgendaBlock(access.supabase, eventId, blockId)
  if (!existing.ok) return { success: false, error: existing.error }

  const nextDayId =
    parsed.data.dayId !== undefined
      ? (asUuidOrNull(parsed.data.dayId, ["all"]) ?? null)
      : existing.block.dayId
  const day = await loadDayAnchor(
    access.supabase,
    eventId,
    nextDayId,
    access.event.date,
    incomingDays.length > 0 ? incomingDays : access.event.schedule_days,
  )
  if (!day.ok) return { success: false, error: day.error }

  const startTime = parsed.data.startTime ?? existing.block.startTime
  const endTime = parsed.data.endTime ?? existing.block.endTime
  const window = resolveAgendaWindow({
    startTime,
    endTime,
    anchorIso: day.anchorIso,
  })
  if ("error" in window) return { success: false, error: window.error }

  const title =
    parsed.data.title != null
      ? normalizeAgendaTitle(parsed.data.title)
      : existing.block.title
  if (!title) {
    return { success: false, error: "El bloque necesita un título." }
  }

  const patch: Record<string, unknown> = {
    day_id: day.dayId,
    title,
    start_time: window.start.toISOString(),
    end_time: window.end.toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (parsed.data.order != null) {
    patch.sort_order = parsed.data.order
  }

  const { error } = await access.supabase
    .from("agenda_blocks")
    .update(patch as never)
    .eq("id", blockId)
    .eq("event_id", eventId)

  if (error) {
    return { success: false, error: missingAgendaError(error.message) }
  }

  const participants = collectAgendaParticipants(parsed.data)
  if (participants) {
    const replaced = await replaceBlockParticipants(
      access.supabase,
      blockId,
      participants,
    )
    if (replaced.error) return { success: false, error: replaced.error }
  }

  const loaded = await fetchAgendaBlock(access.supabase, eventId, blockId)
  if (!loaded.ok) return { success: false, error: loaded.error }

  revalidateAgenda(eventId, access.event.slug)
  return { success: true, data: loaded.block }
}

export async function deleteAgendaBlock(
  eventId: string,
  blockId: string,
): Promise<ActionResult<{ id: string }>> {
  const access = await requireEventOrganizer(eventId)
  if (!access.ok) return { success: false, error: access.error }

  const { data, error } = await access.supabase
    .from("agenda_blocks")
    .delete()
    .eq("id", blockId)
    .eq("event_id", eventId)
    .select("id")
    .maybeSingle()

  if (error) {
    return { success: false, error: missingAgendaError(error.message) }
  }
  if (!data) return { success: false, error: "Bloque no encontrado." }

  revalidateAgenda(eventId, access.event.slug)
  return { success: true, data: { id: data.id } }
}

export async function reorderAgendaBlocks(
  eventId: string,
  orderedIds: string[],
): Promise<ActionResult<{ ids: string[] }>> {
  const access = await requireEventOrganizer(eventId)
  if (!access.ok) return { success: false, error: access.error }

  const ids = orderedIds
    .map((id) => asUuidOrNull(id, []) ?? "")
    .filter(Boolean)
  if (ids.length === 0) {
    return { success: false, error: "No hay bloques para reordenar." }
  }

  const updates = ids.map((id, index) =>
    access.supabase
      .from("agenda_blocks")
      .update({ sort_order: index, updated_at: new Date().toISOString() } as never)
      .eq("id", id)
      .eq("event_id", eventId),
  )
  const results = await Promise.all(updates)
  const failed = results.find((result) => result.error)
  if (failed?.error) {
    return { success: false, error: missingAgendaError(failed.error.message) }
  }

  revalidateAgenda(eventId, access.event.slug)
  return { success: true, data: { ids } }
}

export async function upsertAgendaParticipant(
  eventId: string,
  blockId: string,
  input: unknown,
): Promise<ActionResult<AgendaParticipantDto>> {
  const access = await requireEventOrganizer(eventId)
  if (!access.ok) return { success: false, error: access.error }

  const parsed = agendaParticipantDraftSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ?? "El participante no es válido.",
    }
  }

  const name = normalizeAgendaName(parsed.data.name)
  if (!name) {
    return { success: false, error: "El participante necesita un nombre." }
  }
  const imageUrl = normalizeAgendaUrl(parsed.data.imageUrl)
  const externalLink = normalizeAgendaUrl(parsed.data.externalLink)
  if (imageUrl === undefined) {
    return {
      success: false,
      error: "La imagen del participante debe ser una URL http(s).",
    }
  }
  if (externalLink === undefined) {
    return {
      success: false,
      error: "El enlace del participante debe ser una URL http(s).",
    }
  }

  const existing = await fetchAgendaBlock(access.supabase, eventId, blockId)
  if (!existing.ok) return { success: false, error: existing.error }

  const row = {
    name,
    role_tag: normalizeAgendaRoleTag(parsed.data.roleTag),
    image_url: imageUrl,
    external_link: externalLink,
    sort_order: parsed.data.order ?? existing.block.participants.length,
  }

  if (parsed.data.id) {
    const { data, error } = await access.supabase
      .from("agenda_participants")
      .update(row as never)
      .eq("id", parsed.data.id)
      .eq("agenda_block_id", blockId)
      .select(
        "id, agenda_block_id, name, role_tag, image_url, external_link, sort_order",
      )
      .maybeSingle()
    if (error || !data) {
      return {
        success: false,
        error: missingAgendaError(error?.message ?? "Participante no encontrado."),
      }
    }
    revalidateAgenda(eventId, access.event.slug)
    return {
      success: true,
      data: {
        id: data.id,
        agendaBlockId: data.agenda_block_id,
        name: data.name,
        roleTag: data.role_tag,
        imageUrl: data.image_url,
        externalLink: data.external_link,
        order: data.sort_order,
      },
    }
  }

  const { data, error } = await access.supabase
    .from("agenda_participants")
    .insert({ ...row, agenda_block_id: blockId } as never)
    .select(
      "id, agenda_block_id, name, role_tag, image_url, external_link, sort_order",
    )
    .maybeSingle()

  if (error || !data) {
    return { success: false, error: missingAgendaError(error?.message) }
  }

  revalidateAgenda(eventId, access.event.slug)
  return {
    success: true,
    data: {
      id: data.id,
      agendaBlockId: data.agenda_block_id,
      name: data.name,
      roleTag: data.role_tag,
      imageUrl: data.image_url,
      externalLink: data.external_link,
      order: data.sort_order,
    },
  }
}

export async function deleteAgendaParticipant(
  eventId: string,
  participantId: string,
): Promise<ActionResult<{ id: string }>> {
  const access = await requireEventOrganizer(eventId)
  if (!access.ok) return { success: false, error: access.error }

  const { data: participant, error: lookupError } = await access.supabase
    .from("agenda_participants")
    .select("id, agenda_block_id")
    .eq("id", participantId)
    .maybeSingle()

  if (lookupError) {
    return { success: false, error: missingAgendaError(lookupError.message) }
  }
  if (!participant) {
    return { success: false, error: "Participante no encontrado." }
  }

  const block = await fetchAgendaBlock(
    access.supabase,
    eventId,
    participant.agenda_block_id,
  )
  if (!block.ok) return { success: false, error: block.error }

  const { error } = await access.supabase
    .from("agenda_participants")
    .delete()
    .eq("id", participantId)

  if (error) {
    return { success: false, error: missingAgendaError(error.message) }
  }

  revalidateAgenda(eventId, access.event.slug)
  return { success: true, data: { id: participantId } }
}
