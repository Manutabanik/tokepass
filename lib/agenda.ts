import { z } from "zod"

import { parseDateTimeLocal, toDatetimeLocalInput } from "@/lib/event-schedule"
import { asUuidOrNull } from "@/lib/validations/relation-id"

export const AGENDA_TITLE_MAX = 160
export const AGENDA_ROLE_TAG_MAX = 80
export const AGENDA_NAME_MAX = 120

const TIME_ONLY_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/

export type AgendaParticipantDraft = {
  id?: string | null
  name: string
  roleTag: string
  imageUrl?: string | null
  externalLink?: string | null
  order?: number
}

export type AgendaBlockDraft = {
  id?: string | null
  dayId?: string | null
  startTime: string
  endTime: string
  title: string
  order?: number
  participant?: AgendaParticipantDraft | null
  participants?: AgendaParticipantDraft[] | null
}

export type AgendaParticipantDto = {
  id: string
  agendaBlockId: string
  name: string
  roleTag: string
  imageUrl: string | null
  externalLink: string | null
  order: number
}

export type AgendaBlockDto = {
  id: string
  eventId: string
  dayId: string | null
  title: string
  startTime: string
  endTime: string
  order: number
  participants: AgendaParticipantDto[]
}

export type AgendaBlockRow = {
  id: string
  event_id: string
  day_id: string | null
  title: string
  start_time: string
  end_time: string
  sort_order: number
  created_at?: string
  updated_at?: string
  agenda_participants?: AgendaParticipantRow[] | null
}

export type AgendaParticipantRow = {
  id: string
  agenda_block_id: string
  name: string
  role_tag: string
  image_url: string | null
  external_link: string | null
  sort_order: number
  created_at?: string
  updated_at?: string
}

export function isMissingAgendaSchema(message?: string | null): boolean {
  return /agenda_blocks|agenda_participants|has_schedule|schema cache|PGRST204|42703/i.test(
    message ?? "",
  )
}

export function normalizeAgendaTitle(value: unknown): string | null {
  if (typeof value !== "string") return null
  const title = value.trim().replace(/\s+/g, " ")
  if (title.length < 1 || title.length > AGENDA_TITLE_MAX) return null
  return title
}

export function normalizeAgendaName(value: unknown): string | null {
  if (typeof value !== "string") return null
  const name = value.trim().replace(/\s+/g, " ")
  if (name.length < 1 || name.length > AGENDA_NAME_MAX) return null
  return name
}

export function normalizeAgendaRoleTag(value: unknown): string {
  if (value == null) return ""
  if (typeof value !== "string") return ""
  return value.trim().replace(/\s+/g, " ").slice(0, AGENDA_ROLE_TAG_MAX)
}

export function normalizeAgendaUrl(value: unknown): string | null | undefined {
  if (value == null || value === "") return null
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

export function isTimeOnlyAgendaValue(value: string): boolean {
  return TIME_ONLY_RE.test(value.trim())
}

export function resolveAgendaInstant(
  raw: string,
  anchorIso: string,
): Date | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const timeOnly = TIME_ONLY_RE.exec(trimmed)
  if (timeOnly) {
    const hours = Number(timeOnly[1])
    const minutes = Number(timeOnly[2])
    const seconds = Number(timeOnly[3] ?? 0)
    if (hours > 23 || minutes > 59 || seconds > 59) return null
    const anchor = parseDateTimeLocal(anchorIso) ?? new Date(anchorIso)
    if (Number.isNaN(anchor.getTime())) return null
    const next = new Date(anchor)
    next.setHours(hours, minutes, seconds, 0)
    return Number.isNaN(next.getTime()) ? null : next
  }

  return parseDateTimeLocal(trimmed)
}

export function resolveAgendaWindow(input: {
  startTime: string
  endTime: string
  anchorIso: string
}): { start: Date; end: Date } | { error: string } {
  const startWasTimeOnly = isTimeOnlyAgendaValue(input.startTime)
  const endWasTimeOnly = isTimeOnlyAgendaValue(input.endTime)
  const start = resolveAgendaInstant(input.startTime, input.anchorIso)
  let end = resolveAgendaInstant(input.endTime, input.anchorIso)

  if (!start || !end) {
    return { error: "Definí un horario de inicio y de cierre válido." }
  }

  if (end <= start && startWasTimeOnly && endWasTimeOnly) {
    end = new Date(end)
    end.setDate(end.getDate() + 1)
  }

  if (end <= start) {
    return { error: "El cierre del bloque debe ser posterior al inicio." }
  }

  return { start, end }
}

export function agendaIsoToTimeInput(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const timeOnly = TIME_ONLY_RE.exec(trimmed)
  if (timeOnly) {
    return `${String(Number(timeOnly[1])).padStart(2, "0")}:${String(Number(timeOnly[2])).padStart(2, "0")}`
  }
  const local = toDatetimeLocalInput(trimmed)
  return local.split("T")[1]?.slice(0, 5) ?? ""
}

export function formatAgendaClockRange(start: string, end: string): string {
  const from = agendaIsoToTimeInput(start)
  const to = agendaIsoToTimeInput(end)
  if (!from && !to) return ""
  if (!to) return from
  return `${from} – ${to}`
}

export function canPersistAgendaBlock(input: {
  title: string
  startTime: string
  endTime: string
}): boolean {
  if (!normalizeAgendaTitle(input.title)) return false
  const window = resolveAgendaWindow({
    startTime: input.startTime,
    endTime: input.endTime,
    anchorIso: new Date().toISOString(),
  })
  return !("error" in window)
}

export function nextAgendaSlot(
  blocks: Array<{ endTime: string }>,
): { startTime: string; endTime: string } {
  const last = blocks[blocks.length - 1]
  if (!last) return { startTime: "09:00", endTime: "10:00" }
  const end = agendaIsoToTimeInput(last.endTime) || "10:00"
  const [hours, minutes] = end.split(":").map(Number)
  const startMinutes = (hours ?? 9) * 60 + (minutes ?? 0)
  const endMinutes = startMinutes + 60
  const format = (value: number) => {
    const wrapped = ((value % (24 * 60)) + 24 * 60) % (24 * 60)
    const nextHours = String(Math.floor(wrapped / 60)).padStart(2, "0")
    const nextMinutes = String(wrapped % 60).padStart(2, "0")
    return `${nextHours}:${nextMinutes}`
  }
  return { startTime: format(startMinutes), endTime: format(endMinutes) }
}

export function moveAgendaItem<T extends { clientId: string }>(
  items: T[],
  fromId: string,
  toId: string,
): T[] {
  if (fromId === toId) return items
  const from = items.findIndex((item) => item.clientId === fromId)
  const to = items.findIndex((item) => item.clientId === toId)
  if (from < 0 || to < 0) return items
  const next = [...items]
  const [moved] = next.splice(from, 1)
  if (!moved) return items
  next.splice(to, 0, moved)
  return next
}

const optionalUrlSchema = z.preprocess((value) => {
  if (value == null || value === "") return null
  return value
}, z.string().nullable().optional())

export const agendaParticipantDraftSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z
    .string()
    .trim()
    .min(1, "El participante necesita un nombre.")
    .max(AGENDA_NAME_MAX),
  roleTag: z.string().trim().max(AGENDA_ROLE_TAG_MAX).optional().default(""),
  imageUrl: optionalUrlSchema,
  externalLink: optionalUrlSchema,
  order: z.number().int().min(0).optional().default(0),
})

const agendaBlockObjectSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  dayId: z.preprocess(
    (value) => asUuidOrNull(value, ["all"]),
    z.string().uuid().nullable().optional(),
  ),
  startTime: z.string().trim().min(1, "Definí el inicio del bloque."),
  endTime: z.string().trim().min(1, "Definí el cierre del bloque."),
  title: z
    .string()
    .trim()
    .min(1, "El bloque necesita un título.")
    .max(AGENDA_TITLE_MAX),
  order: z.number().int().min(0).optional(),
  participant: agendaParticipantDraftSchema.nullable().optional(),
  participants: z.array(agendaParticipantDraftSchema).nullable().optional(),
})

export const agendaBlockDraftSchema = agendaBlockObjectSchema.superRefine(
  (data, ctx) => {
    if (!data.startTime.trim() || !data.endTime.trim()) return
    const window = resolveAgendaWindow({
      startTime: data.startTime,
      endTime: data.endTime,
      anchorIso: new Date().toISOString(),
    })
    if ("error" in window && !isTimeOnlyAgendaValue(data.startTime)) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: window.error,
      })
    }
  },
)

export const agendaBlockPatchSchema = agendaBlockObjectSchema.partial()

export function collectAgendaParticipants(
  input: Pick<AgendaBlockDraft, "participant" | "participants">,
): AgendaParticipantDraft[] | undefined {
  if (input.participants !== undefined) {
    return input.participants ?? []
  }
  if (input.participant !== undefined) {
    return input.participant ? [input.participant] : []
  }
  return undefined
}

export function parseAgendaBlockDraft(input: unknown) {
  const parsed = agendaBlockDraftSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0]?.message ?? "El bloque no es válido.",
    }
  }

  const title = normalizeAgendaTitle(parsed.data.title)
  if (!title) {
    return { success: false as const, error: "El bloque necesita un título." }
  }

  const participants = collectAgendaParticipants(parsed.data)
  if (participants) {
    for (const participant of participants) {
      if (normalizeAgendaUrl(participant.imageUrl) === undefined) {
        return {
          success: false as const,
          error: "La imagen del participante debe ser una URL http(s).",
        }
      }
      if (normalizeAgendaUrl(participant.externalLink) === undefined) {
        return {
          success: false as const,
          error: "El enlace del participante debe ser una URL http(s).",
        }
      }
    }
  }

  return {
    success: true as const,
    data: {
      ...parsed.data,
      title,
      dayId: parsed.data.dayId ?? null,
      participants,
    },
  }
}

export function mapAgendaParticipant(
  row: AgendaParticipantRow,
): AgendaParticipantDto {
  return {
    id: row.id,
    agendaBlockId: row.agenda_block_id,
    name: row.name,
    roleTag: row.role_tag ?? "",
    imageUrl: row.image_url ?? null,
    externalLink: row.external_link ?? null,
    order: row.sort_order ?? 0,
  }
}

export function mapAgendaBlock(row: AgendaBlockRow): AgendaBlockDto {
  const participants = [...(row.agenda_participants ?? [])]
    .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
    .map(mapAgendaParticipant)

  return {
    id: row.id,
    eventId: row.event_id,
    dayId: row.day_id,
    title: row.title,
    startTime: row.start_time,
    endTime: row.end_time,
    order: row.sort_order ?? 0,
    participants,
  }
}

export function toParticipantInsert(
  blockId: string,
  participant: AgendaParticipantDraft,
  order: number,
) {
  return {
    agenda_block_id: blockId,
    name: normalizeAgendaName(participant.name) ?? participant.name.trim(),
    role_tag: normalizeAgendaRoleTag(participant.roleTag),
    image_url: normalizeAgendaUrl(participant.imageUrl) ?? null,
    external_link: normalizeAgendaUrl(participant.externalLink) ?? null,
    sort_order: participant.order ?? order,
  }
}
