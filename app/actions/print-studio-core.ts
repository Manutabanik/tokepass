"use server"

import { revalidatePath } from "next/cache"

import {
  isPrintBatchChannel,
  isPrintBatchMode,
  isPrintTemplateMedium,
  normalizePrintBatchName,
  normalizePrintSeriesCode,
  PRINT_BATCH_MAX_TICKETS,
  printBatchNeedsGuests,
  type PrintBatchChannel,
  type PrintBatchMode,
  type PrintTemplateMedium,
} from "@/lib/print-studio"
import { writeSecurityAuditLog } from "@/lib/security/audit-log"
import { isEventUuid } from "@/lib/seo/site"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"

export type PrintBatchGuest = {
  nombre: string
  apellido?: string
  dni?: string
  email?: string
  staffRole?: string
  staffCompany?: string
  seatingUnitId?: string
}

export type CreatePrintBatchParams = {
  eventId: string
  tierId: string
  templateId?: string | null
  name: string
  mode: PrintBatchMode
  channel: PrintBatchChannel
  seriesCode?: string
  seqStart?: number
  count?: number
  guests?: PrintBatchGuest[]
  defaultStaffRole?: string | null
  defaultStaffCompany?: string | null
}

export type CreatePrintBatchResult =
  | {
      success: true
      batchId: string
      orderId: string
      issuedCount: number
      seqStart: number
      seqEnd: number
      seriesCode: string
      ticketIds: string[]
    }
  | { success: false; error: string }

export type TicketTemplateRow = {
  id: string
  organizerId: string
  name: string
  medium: PrintTemplateMedium
  pageWidthMm: number
  pageHeightMm: number
  dpi: number
  layoutJson: Json
  assetsJson: Json
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export type TicketPrintBatchRow = {
  id: string
  eventId: string
  organizerId: string
  templateId: string | null
  tierId: string | null
  name: string
  mode: PrintBatchMode
  channel: PrintBatchChannel
  seriesCode: string
  seqStart: number
  seqEnd: number
  status: string
  issuedCount: number
  artifactCsvUrl: string | null
  artifactPdfUrl: string | null
  createdAt: string
}

async function assertEventOrganizer(eventId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "Sesión requerida." }

  const { data: event } = await supabase
    .from("events")
    .select("id, organizer_id, title")
    .eq("id", eventId)
    .maybeSingle()

  if (!event) return { ok: false as const, error: "Evento no encontrado." }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (event.organizer_id !== user.id && profile?.role !== "super_admin") {
    return { ok: false as const, error: "Sin permiso para este evento." }
  }

  return { ok: true as const, supabase, user, event }
}

function revalidatePrintStudioPaths(eventId: string) {
  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath(`/admin/events/${eventId}/tickets`)
  revalidatePath(`/admin/events/${eventId}/print`)
  revalidatePath(`/admin/events/${eventId}/print-studio`)
  revalidatePath(`/admin/events/${eventId}/accreditations`)
}

function mapPrintBatchError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes("batch_too_large")) {
    return `El lote supera ${PRINT_BATCH_MAX_TICKETS.toLocaleString("es-AR")} entradas por transacción.`
  }
  if (lower.includes("free_cap_exceeded")) {
    return "Superaste el tope de cortesías del evento. Subilo en Configuración comercial."
  }
  if (lower.includes("sold out")) {
    return "No hay cupo suficiente en ese tipo de entrada."
  }
  if (lower.includes("dni_required") || lower.includes("dni_invalid")) {
    return "Las filas nominadas necesitan DNI válido (7 a 11 dígitos)."
  }
  if (lower.includes("guests_required")) {
    return "Cargá al menos un titular para este modo."
  }
  if (lower.includes("template_not_found")) {
    return "La plantilla no existe o no pertenece a este organizador."
  }
  if (lower.includes("tier_not_found")) {
    return "El tipo de entrada no pertenece a este evento."
  }
  if (lower.includes("invalid_series")) {
    return "La serie debe ser alfanumérica (hasta 8 caracteres)."
  }
  if (lower.includes("forbidden")) {
    return "Sin permiso para emitir este lote."
  }
  return message
}

function mapPrintBatchSuccess(
  data: unknown,
): Extract<CreatePrintBatchResult, { success: true }> | null {
  if (!data || typeof data !== "object") return null
  const row = data as {
    batch_id?: unknown
    order_id?: unknown
    issued_count?: unknown
    seq_start?: unknown
    seq_end?: unknown
    series_code?: unknown
    ticket_ids?: unknown
  }
  if (typeof row.batch_id !== "string" || typeof row.order_id !== "string") {
    return null
  }
  return {
    success: true,
    batchId: row.batch_id,
    orderId: row.order_id,
    issuedCount: Number(row.issued_count ?? 0),
    seqStart: Number(row.seq_start ?? 1),
    seqEnd: Number(row.seq_end ?? 0),
    seriesCode: typeof row.series_code === "string" ? row.series_code : "A",
    ticketIds: Array.isArray(row.ticket_ids)
      ? row.ticket_ids.filter((id): id is string => typeof id === "string")
      : [],
  }
}

export async function createPrintBatch(
  params: CreatePrintBatchParams,
): Promise<CreatePrintBatchResult> {
  if (!isEventUuid(params.eventId) || !isEventUuid(params.tierId)) {
    return { success: false, error: "Evento o tipo de entrada inválido." }
  }
  if (params.templateId && !isEventUuid(params.templateId)) {
    return { success: false, error: "Plantilla inválida." }
  }
  if (!isPrintBatchMode(params.mode)) {
    return { success: false, error: "Modo de lote inválido." }
  }
  if (!isPrintBatchChannel(params.channel)) {
    return { success: false, error: "Canal de emisión inválido." }
  }
  if (params.mode === "accreditation" && params.channel !== "accreditation") {
    return {
      success: false,
      error: "El modo acreditación requiere el canal accreditation.",
    }
  }

  const name = normalizePrintBatchName(params.name)
  if (!name) {
    return { success: false, error: "El nombre del lote debe tener entre 2 y 80 caracteres." }
  }

  const seriesCode = normalizePrintSeriesCode(params.seriesCode)
  if (!seriesCode) {
    return { success: false, error: "La serie debe ser alfanumérica (hasta 8 caracteres)." }
  }

  const seqStart = Math.floor(params.seqStart ?? 1)
  if (!Number.isFinite(seqStart) || seqStart < 1) {
    return { success: false, error: "El folio inicial debe ser un entero mayor a 0." }
  }

  const guests = (params.guests ?? [])
    .map((guest) => ({
      nombre: guest.nombre?.trim() ?? "",
      apellido: guest.apellido?.trim() ?? "",
      dni: guest.dni?.trim() ?? "",
      email: guest.email?.trim() ?? "",
      staff_role: (guest.staffRole ?? params.defaultStaffRole ?? "").trim(),
      staff_company: (guest.staffCompany ?? params.defaultStaffCompany ?? "").trim(),
      seating_unit_id: guest.seatingUnitId?.trim() || null,
    }))
    .filter((guest) => guest.nombre || guest.apellido || guest.dni || guest.email)

  if (guests.some((guest) => guest.seating_unit_id && !isEventUuid(guest.seating_unit_id))) {
    return { success: false, error: "Hay un asiento o unidad con identificador inválido." }
  }

  const unnamedCount = Math.floor(params.count ?? 0)
  const units = guests.length > 0 ? guests.length : unnamedCount

  if (printBatchNeedsGuests(params.mode) && guests.length < 1) {
    return { success: false, error: "Cargá al menos un titular para este modo." }
  }
  if (units < 1) {
    return { success: false, error: "Indicá cuántas entradas generar." }
  }
  if (units > PRINT_BATCH_MAX_TICKETS) {
    return {
      success: false,
      error: `Máximo ${PRINT_BATCH_MAX_TICKETS.toLocaleString("es-AR")} entradas por lote.`,
    }
  }

  if (params.channel === "accreditation") {
    const defaultRole = (params.defaultStaffRole ?? "").trim()
    const missingRole =
      guests.length > 0
        ? guests.some((guest) => !guest.staff_role && !defaultRole)
        : !defaultRole
    if (missingRole) {
      return {
        success: false,
        error: "Las acreditaciones necesitan un rol (Técnica, Prensa, VIP o Producción).",
      }
    }
  }

  const gate = await assertEventOrganizer(params.eventId)
  if (!gate.ok) return { success: false, error: gate.error }

  const { data, error } = await gate.supabase.rpc("issue_print_batch_tx", {
    p_event_id: params.eventId,
    p_staff_id: gate.user.id,
    p_tier_id: params.tierId,
    p_template_id: params.templateId ?? null,
    p_name: name,
    p_mode: params.mode,
    p_channel: params.channel,
    p_series_code: seriesCode,
    p_seq_start: seqStart,
    p_unnamed_count: guests.length > 0 ? 0 : unnamedCount,
    p_guests: guests,
    p_default_staff_role: params.defaultStaffRole?.trim() || null,
    p_default_staff_company: params.defaultStaffCompany?.trim() || null,
  })

  if (error || !data) {
    return {
      success: false,
      error: mapPrintBatchError(error?.message ?? "No se pudo emitir el lote."),
    }
  }

  const result = mapPrintBatchSuccess(data)
  if (!result) {
    return { success: false, error: "La emisión no devolvió un lote válido." }
  }

  await writeSecurityAuditLog({
    actorId: gate.user.id,
    action: "print_batch_issue",
    entity: "event",
    entityId: params.eventId,
    details: {
      mode: params.mode,
      channel: params.channel,
      tierId: params.tierId,
      templateId: params.templateId ?? null,
      batchId: result.batchId,
      orderId: result.orderId,
      issuedCount: result.issuedCount,
      seriesCode: result.seriesCode,
    },
  })

  revalidatePrintStudioPaths(params.eventId)
  return result
}

const TEMPLATE_SELECT =
  "id, organizer_id, name, medium, page_width_mm, page_height_mm, dpi, layout_json, assets_json, is_archived, created_at, updated_at"

function mapTicketTemplateRow(row: {
  id: string
  organizer_id: string
  name: string
  medium: string
  page_width_mm: number | string
  page_height_mm: number | string
  dpi: number
  layout_json: Json
  assets_json: Json
  is_archived: boolean
  created_at: string
  updated_at: string
}): TicketTemplateRow {
  return {
    id: row.id,
    organizerId: row.organizer_id,
    name: row.name,
    medium: row.medium as PrintTemplateMedium,
    pageWidthMm: Number(row.page_width_mm),
    pageHeightMm: Number(row.page_height_mm),
    dpi: Number(row.dpi),
    layoutJson: row.layout_json ?? {},
    assetsJson: row.assets_json ?? {},
    isArchived: Boolean(row.is_archived),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function createTicketTemplate(input: {
  eventId?: string
  name: string
  medium?: PrintTemplateMedium
  pageWidthMm?: number
  pageHeightMm?: number
  dpi?: number
  layoutJson?: Json
  assetsJson?: Json
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  return saveTicketTemplate({
    eventId: input.eventId,
    name: input.name,
    medium: input.medium,
    pageWidthMm: input.pageWidthMm,
    pageHeightMm: input.pageHeightMm,
    dpi: input.dpi,
    layoutJson: input.layoutJson,
    assetsJson: input.assetsJson,
  })
}

export async function saveTicketTemplate(input: {
  eventId?: string
  templateId?: string | null
  name: string
  medium?: PrintTemplateMedium
  pageWidthMm?: number
  pageHeightMm?: number
  dpi?: number
  layoutJson?: Json
  assetsJson?: Json
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const name = normalizePrintBatchName(input.name)
  if (!name) {
    return { success: false, error: "El nombre de la plantilla debe tener entre 2 y 80 caracteres." }
  }

  const medium = input.medium ?? "press_sheet"
  if (!isPrintTemplateMedium(medium)) {
    return { success: false, error: "Soporte de impresión inválido." }
  }

  const pageWidthMm = Number(input.pageWidthMm ?? 150)
  const pageHeightMm = Number(input.pageHeightMm ?? 70)
  const dpi = Math.floor(input.dpi ?? 300)
  if (!(pageWidthMm > 0) || !(pageHeightMm > 0)) {
    return { success: false, error: "El tamaño de página debe ser mayor a 0 mm." }
  }
  if (dpi < 72 || dpi > 600) {
    return { success: false, error: "El DPI debe estar entre 72 y 600." }
  }

  const payload = {
    name,
    medium,
    page_width_mm: pageWidthMm,
    page_height_mm: pageHeightMm,
    dpi,
    layout_json: input.layoutJson ?? {},
    assets_json: input.assetsJson ?? {},
  }

  if (input.eventId) {
    if (!isEventUuid(input.eventId)) {
      return { success: false, error: "Evento inválido." }
    }
    const gate = await assertEventOrganizer(input.eventId)
    if (!gate.ok) return { success: false, error: gate.error }

    if (input.templateId) {
      if (!isEventUuid(input.templateId)) {
        return { success: false, error: "Plantilla inválida." }
      }
      const { data, error } = await gate.supabase
        .from("ticket_templates")
        .update(payload)
        .eq("id", input.templateId)
        .eq("organizer_id", gate.event.organizer_id)
        .select("id")
        .maybeSingle()
      if (error || !data) {
        return { success: false, error: error?.message ?? "No se pudo actualizar la plantilla." }
      }
      revalidatePrintStudioPaths(input.eventId)
      return { success: true, id: data.id }
    }

    const { data, error } = await gate.supabase
      .from("ticket_templates")
      .insert({
        ...payload,
        organizer_id: gate.event.organizer_id,
      })
      .select("id")
      .single()
    if (error || !data) {
      return { success: false, error: error?.message ?? "No se pudo guardar la plantilla." }
    }
    revalidatePrintStudioPaths(input.eventId)
    return { success: true, id: data.id }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Sesión requerida." }

  if (input.templateId) {
    const { data, error } = await supabase
      .from("ticket_templates")
      .update(payload)
      .eq("id", input.templateId)
      .select("id")
      .maybeSingle()
    if (error || !data) {
      return { success: false, error: error?.message ?? "No se pudo actualizar la plantilla." }
    }
    return { success: true, id: data.id }
  }

  const { data, error } = await supabase
    .from("ticket_templates")
    .insert({
      ...payload,
      organizer_id: user.id,
    })
    .select("id")
    .single()

  if (error || !data) {
    return { success: false, error: error?.message ?? "No se pudo guardar la plantilla." }
  }

  return { success: true, id: data.id }
}

export async function listTicketTemplates(): Promise<TicketTemplateRow[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from("ticket_templates")
    .select(TEMPLATE_SELECT)
    .eq("is_archived", false)
    .order("created_at", { ascending: false })

  return (data ?? []).map(mapTicketTemplateRow)
}

export async function listEventTicketTemplates(
  eventId: string,
): Promise<TicketTemplateRow[]> {
  if (!isEventUuid(eventId)) return []
  const gate = await assertEventOrganizer(eventId)
  if (!gate.ok) return []

  const { data } = await gate.supabase
    .from("ticket_templates")
    .select(TEMPLATE_SELECT)
    .eq("organizer_id", gate.event.organizer_id)
    .eq("is_archived", false)
    .order("created_at", { ascending: false })

  return (data ?? []).map(mapTicketTemplateRow)
}

export async function listPrintBatches(eventId: string): Promise<TicketPrintBatchRow[]> {
  if (!isEventUuid(eventId)) return []
  const gate = await assertEventOrganizer(eventId)
  if (!gate.ok) return []

  const { data } = await gate.supabase
    .from("ticket_print_batches")
    .select(
      "id, event_id, organizer_id, template_id, tier_id, name, mode, channel, series_code, seq_start, seq_end, status, issued_count, artifact_csv_url, artifact_pdf_url, created_at",
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })

  return (data ?? []).map((row) => ({
    id: row.id,
    eventId: row.event_id,
    organizerId: row.organizer_id,
    templateId: row.template_id,
    tierId: row.tier_id,
    name: row.name,
    mode: row.mode as PrintBatchMode,
    channel: row.channel as PrintBatchChannel,
    seriesCode: row.series_code,
    seqStart: Number(row.seq_start),
    seqEnd: Number(row.seq_end),
    status: row.status,
    issuedCount: Number(row.issued_count),
    artifactCsvUrl: row.artifact_csv_url,
    artifactPdfUrl: row.artifact_pdf_url,
    createdAt: row.created_at,
  }))
}
