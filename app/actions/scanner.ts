"use server"

import { revalidatePath } from "next/cache"

import {
  assertLivingMac,
  resolveScanSecret,
} from "@/lib/scan-payload"
import {
  assertEventOpsAccess,
  listOperableEvents,
} from "@/lib/event-ops-access"
import {
  isTicketValidForNow,
  parseScheduleDays,
} from "@/lib/event-schedule"
import { logger } from "@/lib/logger"
import { createClient } from "@/lib/supabase/server"
import {
  ALL_SCANNER_GATE_ID,
  GA_SCANNER_GATE_ID,
  GENERAL_SCANNER_GATE_ID,
  PARKING_SCANNER_GATE_ID,
  VIP_SCANNER_GATE_ID,
  resolveTicketSectorKey,
  ticketMatchesScannerGate,
  type ScannerGate,
} from "@/lib/scanner/gate"
import type { QrType, TicketStatus } from "@/types/database"

const TICKET_SCAN_SELECT =
  "id, status, event_id, order_id, totp_secret, scanned_at, validated_by, holder_name, holder_dni, max_admissions, admissions_used, is_test, is_dynamic_qr, ticket_type, event_seating_units(label, sector_id, sector_name, row_label), ticket_tiers(name, price, time_limit, bonus_reward, day_id, seating_sector_id), events(id, title, organizer_id, qr_type, date, schedule_days, status), orders!tickets_order_id_fkey(payment_method)"

export type ScannerEventOption = {
  id: string
  title: string
  date: string
  status: string
  qrType: QrType
}

export type ScanTicketResult =
  | {
      success: true
      status: "granted"
      message: string
      isTestScan?: boolean
      ticket: {
        id: string
        tierName: string
        ownerLabel: string | null
        eventTitle: string
        isFreePass: boolean
        seatingLabel: string | null
        seatingSectorName: string | null
        seatingRowLabel: string | null
        admissionsUsed: number
        maxAdmissions: number
      }
      bonus: string | null
    }
  | {
      success: false
      status:
        | "expired_qr"
        | "already_used"
        | "revoked"
        | "transferred"
        | "cancelled"
        | "wrong_event"
        | "wrong_day"
        | "not_found"
        | "invalid_payload"
        | "forbidden"
        | "auth_required"
        | "update_failed"
        | "unpaid"
        | "test_ticket_live"
        | "wrong_sector"
      message: string
      scannedAt?: string | null
      redirectSector?: string
      gateName?: string | null
      operatorName?: string | null
    }

type TicketScanRow = {
  id: string
  status: TicketStatus
  event_id: string
  order_id: string | null
  totp_secret?: string
  scanned_at: string | null
  validated_by?: string | null
  holder_name?: string | null
  holder_dni?: string | null
  max_admissions: number
  admissions_used: number
  is_test?: boolean | null
  is_dynamic_qr?: boolean | null
  ticket_type?: string | null
  event_seating_units: {
    label: string
    sector_id?: string | null
    sector_name: string
    row_label: string | null
  } | null
  ticket_tiers: {
    name: string
    price?: number | null
    time_limit: string | null
    bonus_reward: string | null
    day_id: string | null
    seating_sector_id?: string | null
  } | null
  events: {
    id: string
    title: string
    organizer_id: string
    qr_type: QrType | null
    date: string | null
    schedule_days: unknown
    status?: string | null
  } | null
  orders?:
    | { payment_method?: string | null }
    | Array<{ payment_method?: string | null }>
    | null
}

function ticketOrderPaymentMethod(row: TicketScanRow): string | null {
  const orders = row.orders
  if (!orders) return null
  const one = Array.isArray(orders) ? orders[0] : orders
  return one?.payment_method ?? null
}

function isFreePassTier(
  tierName: string | null | undefined,
  tierPrice?: number | null,
): boolean {
  if (tierPrice != null && Number(tierPrice) === 0) return true
  if (!tierName) return false
  const normalized = tierName.toLowerCase()
  return (
    normalized.includes("freepass") ||
    normalized.includes("cortesía") ||
    normalized.includes("cortesia")
  )
}

function isWithinTimeLimit(timeLimit: string | null): boolean {
  if (!timeLimit) return false

  const [hoursRaw, minutesRaw] = timeLimit.split(":")
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw ?? 0)

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return false
  }

  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const limitMinutes = hours * 60 + minutes

  return currentMinutes <= limitMinutes
}

export async function getScannerEvents(): Promise<ScannerEventOption[]> {
  const rows = await listOperableEvents({ roles: ["door_staff"] })

  return rows.map((event) => ({
    id: event.id,
    title: event.title,
    date: event.date,
    status: event.status,
    qrType: event.qr_type === "static" ? "static" : "dynamic",
  }))
}

function prettyScannerGateLabel(name: string, fallbackId: string): string {
  const raw = name.trim() || fallbackId
  const lower = raw.toLowerCase()
  if (/\bvip\b/.test(lower)) {
    return /acceso/i.test(raw) ? raw : "Acceso VIP"
  }
  if (
    (/\bcampo\b/.test(lower) || /\bgeneral\b/.test(lower) || lower === "ga") &&
    !/\bvip\b/.test(lower)
  ) {
    return "Campo General"
  }
  if (lower === "general" || /puerta principal/.test(lower)) {
    return "Puerta Principal"
  }
  return raw
}

function upsertGate(
  gates: Map<string, ScannerGate>,
  gate: ScannerGate,
) {
  if (!gate.id || gates.has(gate.id)) return
  gates.set(gate.id, gate)
}

export async function getScannerOperatorLabel(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return "Operador"
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle()
  return data?.full_name?.trim() || data?.email?.trim() || "Operador"
}

export async function getScannerGates(
  eventId: string,
): Promise<ScannerGate[]> {
  const defaults: ScannerGate[] = [
    {
      id: ALL_SCANNER_GATE_ID,
      label: "Todas las puertas",
      color: "#a1a1aa",
      kind: "general",
    },
    {
      id: GENERAL_SCANNER_GATE_ID,
      label: "Puerta Principal",
      color: "#10b981",
      kind: "general",
    },
  ]
  if (!eventId) return defaults

  const access = await assertEventOpsAccess(eventId, ["door_staff"])
  if (!access.ok) return defaults

  const supabase = await createClient()
  const gates = new Map<string, ScannerGate>()
  for (const gate of defaults) upsertGate(gates, gate)

  const [rpc, tiers, units] = await Promise.all([
    supabase.rpc("get_event_scanner_gates", { p_event_id: eventId }),
    supabase
      .from("ticket_tiers")
      .select("id, name, seating_sector_id")
      .eq("event_id", eventId),
    supabase
      .from("event_seating_units")
      .select("sector_id, sector_name, color")
      .eq("event_id", eventId)
      .limit(800),
  ])

  for (const row of rpc.data ?? []) {
    const id = String(row.gate_id ?? "").trim()
    if (!id || id === GENERAL_SCANNER_GATE_ID || id === ALL_SCANNER_GATE_ID) {
      continue
    }
    upsertGate(gates, {
      id,
      label: prettyScannerGateLabel(String(row.label ?? id), id),
      color: String(row.color || "#6366f1"),
      kind:
        row.kind === "sector"
          ? "sector"
          : row.kind === "parking"
            ? "parking"
            : "general",
    })
  }

  for (const unit of units.data ?? []) {
    const id = String(unit.sector_id ?? "").trim()
    if (!id) continue
    upsertGate(gates, {
      id,
      label: prettyScannerGateLabel(String(unit.sector_name ?? id), id),
      color: String(unit.color || "#6366f1"),
      kind: "sector",
    })
  }

  let hasVip = false
  let hasCampo = false
  for (const tier of tiers.data ?? []) {
    const name = String(tier.name ?? "")
    const sectorId = tier.seating_sector_id?.trim()
    if (sectorId) {
      upsertGate(gates, {
        id: sectorId,
        label: prettyScannerGateLabel(name || sectorId, sectorId),
        color: "#6366f1",
        kind: "sector",
      })
    }
    if (/\bvip\b/i.test(name)) hasVip = true
    if (/\bcampo\b|\bgeneral\b/i.test(name) && !/\bvip\b/i.test(name)) {
      hasCampo = true
    }
  }

  if (hasVip) {
    upsertGate(gates, {
      id: VIP_SCANNER_GATE_ID,
      label: "Acceso VIP",
      color: "#8b5cf6",
      kind: "sector",
    })
  }
  if (hasCampo) {
    upsertGate(gates, {
      id: GA_SCANNER_GATE_ID,
      label: "Campo General",
      color: "#22c55e",
      kind: "sector",
    })
  }

  if (!gates.has(PARKING_SCANNER_GATE_ID)) {
    upsertGate(gates, {
      id: PARKING_SCANNER_GATE_ID,
      label: "Barrera de Estacionamiento",
      color: "#f59e0b",
      kind: "parking",
    })
  }

  return [...gates.values()]
}

export async function scanAndValidateTicket(
  base64Payload: string,
  eventId: string,
  gateId?: string | null,
): Promise<ScanTicketResult> {
  if (!base64Payload?.trim() || !eventId) {
    return {
      success: false,
      status: "invalid_payload",
      message: "Payload de escaneo inválido",
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      success: false,
      status: "auth_required",
      message: "Sesión requerida",
    }
  }

  const access = await assertEventOpsAccess(eventId, ["door_staff"])
  if (!access.ok) {
    return {
      success: false,
      status: access.reason === "auth_required" ? "auth_required" : "forbidden",
      message:
        access.reason === "auth_required"
          ? "Iniciá sesión para validar"
          : "No tenés permiso para validar esta entrada",
    }
  }

  const { data: eventMeta } = await supabase
    .from("events")
    .select("id, qr_type, organizer_id")
    .eq("id", eventId)
    .maybeSingle()

  if (!eventMeta) {
    return {
      success: false,
      status: "not_found",
      message: "Evento no encontrado",
    }
  }

  const qrType: QrType =
    eventMeta.qr_type === "static" ? "static" : "dynamic"

  const resolved = resolveScanSecret(base64Payload, qrType)
  if (!resolved) {
    return {
      success: false,
      status: "invalid_payload",
      message:
        qrType === "static"
          ? "QR estático inválido"
          : "QR inválido o corrupto",
    }
  }

  let ticket: unknown = null

  if (resolved.mode === "v2") {
    const { data } = await supabase
      .from("tickets")
      .select(TICKET_SCAN_SELECT)
      .eq("id", resolved.ticketId)
      .maybeSingle()
    ticket = data

    if (ticket) {
      const preview = ticket as TicketScanRow
      const secret = preview.totp_secret || preview.id
      const ok = await assertLivingMac(secret, resolved)
      if (!ok) {
        return {
          success: false,
          status: "invalid_payload",
          message: "QR inválido o manipulado",
        }
      }
    }
  } else {
    const { data: ticketBySecret } = await supabase
      .from("tickets")
      .select(TICKET_SCAN_SELECT)
      .eq("totp_secret", resolved.totpSecret)
      .maybeSingle()

    ticket = ticketBySecret

    if (!ticket) {
      const { data: ticketById } = await supabase
        .from("tickets")
        .select(TICKET_SCAN_SELECT)
        .eq("id", resolved.totpSecret)
        .maybeSingle()
      ticket = ticketById
    }
  }

  if (!ticket) {
    return {
      success: false,
      status: "not_found",
      message: "Ticket no encontrado",
    }
  }

  const row = ticket as TicketScanRow

  // Refuerzo: tickets de boletería física nunca rotan por ventana temporal.
  if (
    row.is_dynamic_qr !== false &&
    resolved.enforceFreshness &&
    resolved.expired
  ) {
    return {
      success: false,
      status: "expired_qr",
      message: "QR Expirado (Captura de pantalla)",
    }
  }

  if (row.event_id !== eventId) {
    return {
      success: false,
      status: "wrong_event",
      message: "Ticket de otro evento",
    }
  }

  const selectedGate = gateId?.trim()
  if (!selectedGate) {
    return {
      success: false,
      status: "invalid_payload",
      message: "Seleccioná la gatera / sector que estás controlando",
    }
  }

  const ticketGate = resolveTicketSectorKey({
    seatingSectorId: row.event_seating_units?.sector_id,
    seatingSectorName: row.event_seating_units?.sector_name,
    tierSeatingSectorId: row.ticket_tiers?.seating_sector_id,
  })
  const gateMatch = ticketMatchesScannerGate(selectedGate, {
    ...ticketGate,
    ticketType: row.ticket_type,
  })
  if (!gateMatch.ok) {
    return {
      success: false,
      status: "wrong_sector",
      message: `ACCESO DENEGADO - ENTRADA PARA OTRO SECTOR (Dirigirse a: ${gateMatch.correctSector})`,
      redirectSector: gateMatch.correctSector,
    }
  }

  const scheduleDays = parseScheduleDays(row.events?.schedule_days)
  const dayGate = isTicketValidForNow({
    scheduleDays,
    dayId: row.ticket_tiers?.day_id,
    eventDate: row.events?.date,
  })
  if (!dayGate.ok) {
    return {
      success: false,
      status: "wrong_day",
      message: dayGate.message,
    }
  }

  const { data: guestEntryRow } = await supabase
    .from("guest_list_entries")
    .select("id, status, guest_lists(valid_until, name)")
    .eq("ticket_id", row.id)
    .maybeSingle()

  const guestEntry = guestEntryRow as {
    id: string
    status: string
    guest_lists: { valid_until: string; name: string } | null
  } | null

  const listValidUntil = guestEntry?.guest_lists?.valid_until
  if (listValidUntil && new Date(listValidUntil).getTime() < Date.now()) {
    return {
      success: false,
      status: "expired_qr",
      message: "Horario de lista vencido",
    }
  }

  if (row.status === "transferred") {
    return {
      success: false,
      status: "transferred",
      message: "ENTRADA INVÁLIDA: Este ticket fue transferido a otro usuario",
    }
  }

  if (row.status === "used" || row.status === "scanned") {
    let operatorName: string | null = null
    if (row.validated_by) {
      const { data: operator } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", row.validated_by)
        .maybeSingle()
      operatorName =
        operator?.full_name?.trim() || operator?.email?.trim() || null
    }
    return {
      success: false,
      status: "already_used",
      message: "Ticket ya escaneado",
      scannedAt: row.scanned_at,
      gateName:
        row.event_seating_units?.sector_name?.trim() || "Puerta Principal",
      operatorName,
    }
  }

  if (row.status === "cancelled" || row.status === "revoked") {
    return {
      success: false,
      status: "cancelled",
      message: "Ticket cancelado / revocado",
    }
  }

  if (row.status === "pending_payment") {
    return {
      success: false,
      status: "unpaid",
      message: "Pago pendiente — entrada no habilitada",
    }
  }

  if (row.status !== "valid") {
    return {
      success: false,
      status: "already_used",
      message: "Ticket no válido para ingreso",
      scannedAt: row.scanned_at,
    }
  }

  const eventStatus = row.events?.status ?? null
  const isTestTicket = Boolean(row.is_test)
  const isSandbox = ticketOrderPaymentMethod(row) === "test_sandbox"

  if (isTestTicket && eventStatus !== "draft" && !isSandbox) {
    return {
      success: false,
      status: "test_ticket_live",
      message: "ENTRADA DE PRUEBA / INVÁLIDA PARA EVENTO EN VIVO",
    }
  }

  const { data: admissionOk, error: admissionError } = await supabase.rpc(
    "is_ticket_admission_eligible",
    { p_ticket_id: row.id },
  )

  if (admissionError) {
    logger.error({
      context: "actions/scanner",
      message: "admission_check_failed",
      error: admissionError.message,
    })
    return {
      success: false,
      status: "update_failed",
      message: "No se pudo verificar el pago del ticket",
    }
  }

  if (!admissionOk) {
    return {
      success: false,
      status: "unpaid",
      message: "Entrada sin orden pagada — acceso denegado",
    }
  }

  const { data: admissionResult, error: updateError } = await supabase.rpc(
    "scan_ticket_admission",
    {
      p_ticket_id: row.id,
      p_validated_by: access.userId,
    },
  )
  const admission = (admissionResult ?? {}) as {
    ok?: boolean
    code?: string
    admissions_used?: number
    max_admissions?: number
    remaining?: number
    is_test_scan?: boolean
  }

  if (updateError || !admission.ok) {
    if (admission.code === "test_ticket_live") {
      return {
        success: false,
        status: "test_ticket_live",
        message: "ENTRADA DE PRUEBA / INVÁLIDA PARA EVENTO EN VIVO",
      }
    }
    return {
      success: false,
      status:
        admission.code === "unpaid" ? "unpaid" : "already_used",
      message:
        admission.code === "unpaid"
          ? "Entrada sin orden pagada — acceso denegado"
          : "Ticket ya escaneado o sin ingresos disponibles",
      scannedAt: row.scanned_at,
    }
  }

  await supabase.rpc("mark_guest_entry_checked_in", {
    p_ticket_id: row.id,
  })

  const tier = row.ticket_tiers
  const isFreePass = isFreePassTier(tier?.name, tier?.price)
  const bonus =
    isFreePass
      ? "ENTRADA GRATUITA ($0) · NO COBRAR"
      : tier?.bonus_reward && isWithinTimeLimit(tier.time_limit)
        ? tier.bonus_reward
        : null

  revalidatePath("/admin/scanner")
  revalidatePath("/cuenta/entradas")
  if (guestEntry) {
    revalidatePath("/admin/lists")
  }

  return {
    success: true,
    status: "granted",
    isTestScan:
      Boolean(admission.is_test_scan) ||
      (isTestTicket && eventStatus === "draft") ||
      isSandbox,
    message: isSandbox
      ? "ACCESO PERMITIDO · COMPRA DE PRUEBA (SANDBOX)"
      : isTestTicket && eventStatus === "draft"
        ? "LECTURA DE PRUEBA OK (EVENTO EN BORRADOR)"
        : (admission.remaining ?? 0) > 0
          ? `ACCESO PERMITIDO · QUEDAN ${admission.remaining} INGRESOS`
          : "ACCESO PERMITIDO · CUPO COMPLETO",
    ticket: {
      id: row.id,
      tierName: isFreePass
        ? "Cortesía / FreePass"
        : (tier?.name ?? "Entrada"),
      ownerLabel: row.holder_name?.trim() || null,
      eventTitle: row.events?.title ?? "Evento",
      isFreePass,
      seatingLabel: row.event_seating_units?.label ?? null,
      seatingSectorName: row.event_seating_units?.sector_name ?? null,
      seatingRowLabel: row.event_seating_units?.row_label ?? null,
      admissionsUsed: Number(admission.admissions_used ?? 1),
      maxAdmissions: Number(
        admission.max_admissions ?? row.max_admissions ?? 1,
      ),
    },
    bonus,
  }
}

export type EventTicketManifestPayload = {
  eventId: string
  eventTitle: string
  eventStatus: string
  qrType: QrType
  hash: string
  tickets: Array<{
    id: string
    event_id: string
    totp_secret: string
    status:
      | "pending_payment"
      | "valid"
      | "used"
      | "transferred"
      | "cancelled"
      | "scanned"
      | "revoked"
    owner_name: string
    dni: string | null
    ticket_tier: string
    scanned_at: string | null
    scanned_at_local: number | null
    max_admissions: number
    admissions_used: number
    seating_label: string | null
    seating_sector_name: string | null
    seating_row_label: string | null
    seating_sector_id: string | null
    is_test: boolean
    /** Compra sandbox (test_sandbox): válida en puerta para E2E. */
    is_sandbox: boolean
    tier_price: number
    group_id: string | null
    group_slot: number | null
    batch_id: string | null
    ticket_type: string | null
  }>
}

/** Manifiesto completo de tickets válidos/usados para IndexedDB del escáner. */
export async function fetchEventTicketManifest(
  eventId: string,
): Promise<EventTicketManifestPayload> {
  if (!eventId) {
    throw new Error("eventId requerido")
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("auth_required")
  }

  const access = await assertEventOpsAccess(eventId, ["door_staff"])
  if (!access.ok) {
    throw new Error(
      access.reason === "auth_required"
        ? "auth_required"
        : "Sin permiso para descargar la lista de este evento",
    )
  }

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, title, qr_type, organizer_id, status")
    .eq("id", eventId)
    .maybeSingle()

  if (eventError || !event) {
    throw new Error("Evento no encontrado")
  }

  let data:
    | Array<Record<string, unknown>>
    | null = null

  const withHolder = await supabase
    .from("tickets")
    .select(
      "id, event_id, totp_secret, status, scanned_at, owner_id, max_admissions, admissions_used, is_test, ticket_type, holder_name, holder_dni, holder_email, group_id, group_slot, batch_id, event_seating_units(label, sector_id, sector_name, row_label), ticket_tiers(name, price, seating_sector_id), orders!tickets_order_id_fkey(payment_method)",
    )
    .eq("event_id", eventId)
    .in("status", ["valid", "used", "scanned"])

  if (withHolder.error) {
    const fallback = await supabase
      .from("tickets")
      .select(
        "id, event_id, totp_secret, status, scanned_at, owner_id, max_admissions, admissions_used, is_test, ticket_type, event_seating_units(label, sector_id, sector_name, row_label), ticket_tiers(name, price, seating_sector_id), orders!tickets_order_id_fkey(payment_method)",
      )
      .eq("event_id", eventId)
      .in("status", ["valid", "used", "scanned"])

    if (fallback.error) {
      throw new Error(fallback.error.message)
    }
    data = fallback.data as Array<Record<string, unknown>> | null
  } else {
    data = withHolder.data as Array<Record<string, unknown>> | null
  }

  type Row = {
    id: string
    event_id: string
    totp_secret: string
    status: EventTicketManifestPayload["tickets"][number]["status"]
    scanned_at: string | null
    owner_id: string | null
    holder_name?: string | null
    holder_dni?: string | null
    holder_email?: string | null
    group_id?: string | null
    group_slot?: number | null
    batch_id?: string | null
    is_test?: boolean | null
    ticket_type?: string | null
    orders?:
      | { payment_method?: string | null }
      | Array<{ payment_method?: string | null }>
      | null
    ticket_tiers: {
      name: string
      price?: number | null
      seating_sector_id?: string | null
    } | null
    max_admissions: number
    admissions_used: number
    event_seating_units: {
      label: string
      sector_id?: string | null
      sector_name: string
      row_label: string | null
    } | null
  }

  function orderPaymentMethod(row: Row): string | null {
    const orders = row.orders
    if (!orders) return null
    const one = Array.isArray(orders) ? orders[0] : orders
    return one?.payment_method ?? null
  }

  const rows = (data ?? []) as unknown as Row[]
  const ownerIds = [
    ...new Set(rows.map((row) => row.owner_id).filter(Boolean)),
  ] as string[]

  const ownerMap = new Map<
    string,
    { full_name: string | null; email: string; dni: string | null }
  >()

  if (ownerIds.length > 0) {
    let owners:
      | Array<{
          id: string
          full_name: string | null
          email: string
          dni?: string | null
        }>
      | null = null

    const withDni = await supabase
      .from("profiles")
      .select("id, full_name, email, dni")
      .in("id", ownerIds)

    if (withDni.error) {
      const fallback = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ownerIds)
      owners = fallback.data
    } else {
      owners = withDni.data
    }

    for (const owner of owners ?? []) {
      ownerMap.set(owner.id, {
        full_name: owner.full_name,
        email: owner.email,
        dni: owner.dni ?? null,
      })
    }
  }

  const tickets = rows
    .filter((row) => {
      const isSandbox = orderPaymentMethod(row) === "test_sandbox"
      // Borradores de prueba fuera de sandbox no van a puerta en vivo.
      if (
        event.status === "published" &&
        Boolean(row.is_test) &&
        !isSandbox
      ) {
        return false
      }
      return true
    })
    .map((row) => {
    const owner = row.owner_id ? ownerMap.get(row.owner_id) : null
    const isSandbox = orderPaymentMethod(row) === "test_sandbox"
    return {
      id: row.id,
      event_id: row.event_id,
      totp_secret: row.totp_secret,
      status: row.status,
      owner_name:
        row.holder_name?.trim() ||
        owner?.full_name?.trim() ||
        owner?.email ||
        "Sin nombre",
      dni: row.holder_dni ?? owner?.dni ?? null,
      ticket_tier: row.ticket_tiers?.name ?? "Entrada",
      scanned_at: row.scanned_at,
      scanned_at_local: row.scanned_at
        ? new Date(row.scanned_at).getTime()
        : null,
      max_admissions: Number(row.max_admissions ?? 1),
      admissions_used: Number(row.admissions_used ?? 0),
      seating_label: row.event_seating_units?.label ?? null,
      seating_sector_name:
        row.event_seating_units?.sector_name ?? null,
      seating_row_label: row.event_seating_units?.row_label ?? null,
      seating_sector_id:
        row.event_seating_units?.sector_id ??
        row.ticket_tiers?.seating_sector_id ??
        null,
      is_test: Boolean(row.is_test),
      is_sandbox: isSandbox,
      tier_price: Number(row.ticket_tiers?.price ?? 0),
      group_id: row.group_id ?? null,
      group_slot:
        row.group_slot == null ? null : Number(row.group_slot),
      batch_id: row.batch_id ?? null,
      ticket_type: row.ticket_type ?? "admission",
    }
  })

  const hashSource = tickets
    .map(
      (t) =>
        `${t.id}:${t.status}:${t.totp_secret}:${t.is_test ? 1 : 0}:${t.is_sandbox ? 1 : 0}`,
    )
    .sort()
    .join("|")

  const hash = Buffer.from(hashSource).toString("base64url").slice(0, 48)

  return {
    eventId: event.id,
    eventTitle: event.title,
    eventStatus: event.status,
    qrType: event.qr_type === "static" ? "static" : "dynamic",
    hash,
    tickets,
  }
}

export type OfflineSyncItem = {
  ticketId: string
  scannedAtLocal: number
  admissionsCount?: number
}

export type SyncOfflineResult =
  | {
      success: true
      data: {
        syncedIds: string[]
        conflicts: Array<{ ticketId: string; reason: string }>
      }
    }
  | { success: false; error: string }

/** Batch update desde la cola offline del escáner. */
export async function syncOfflineScansBatch(
  items: OfflineSyncItem[],
): Promise<SyncOfflineResult> {
  const syncedIds: string[] = []
  const conflicts: Array<{ ticketId: string; reason: string }> = []

  if (items.length === 0) {
    return { success: true, data: { syncedIds, conflicts } }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "auth_required" }
  }

  for (const item of items) {
    const admissionsCount = Math.max(
      1,
      Math.min(100, Number(item.admissionsCount) || 1),
    )
    let syncError: string | null = null

    for (let admission = 0; admission < admissionsCount; admission += 1) {
      const { data, error } = await supabase.rpc("scan_ticket_admission", {
        p_ticket_id: item.ticketId,
        p_validated_by: user.id,
      })
      const result = (data ?? {}) as { ok?: boolean; code?: string }
      if (error) {
        syncError = error.message
        break
      }
      if (!result.ok) {
        if (result.code === "already_used") break
        syncError = result.code ?? "sync_failed"
        break
      }
    }

    if (syncError) {
      conflicts.push({
        ticketId: item.ticketId,
        reason: syncError,
      })
      continue
    }

    syncedIds.push(item.ticketId)
    await supabase.rpc("mark_guest_entry_checked_in", {
      p_ticket_id: item.ticketId,
    })
  }

  revalidatePath("/admin/scanner")
  return { success: true, data: { syncedIds, conflicts } }
}
