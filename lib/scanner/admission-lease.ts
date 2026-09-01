/**
 * Scan lease offline: mismo dispositivo bloquea relectura al instante.
 * Entre pistolas desconectadas el protocolo es rango asignado por gatera
 * (ticketId estable → slot). Gossip local (BroadcastChannel) es best-effort.
 */

export const SCANNER_DEVICE_ID_KEY = "tokepass.scanner.device_id"
export const SCANNER_SLOT_KEY_PREFIX = "tokepass.scanner.slot"
export const SCANNER_DEVICE_SLOT_MAX = 8
export const SCANNER_DEVICE_SLOT_EVENT = "tokepass-scanner-device-slot"

/** Solo para el formulario de setup. Nunca usar como fallback de admisión. */
export const SCANNER_DEVICE_SLOT_SETUP_DRAFT = { index: 0, count: 1 } as const

export const SCANNER_DEVICE_UNCONFIGURED_MESSAGE =
  "DISPOSITIVO NO CONFIGURADO. Vuelva a realizar el setup de turno"

export type ScannerDeviceSlot = {
  index: number
  count: number
}

export type OfflineAdmissionAction =
  | "admit"
  | "duplicate"
  | "main_gate_review"
  | "reject"

export type OfflineAdmissionDecision = {
  action: OfflineAdmissionAction
  reason:
    | "ok"
    | "already_used"
    | "lease_exists"
    | "range_mismatch"
    | "group_no_peers"
    | "invalid_status"
  scannedAt: number | null
}

export type AdmissionLeaseParts = {
  deviceId: string
  ticketId: string
  timestamp: number
  admissionCounter: number
}

export type AdmissionLeaseRecord = {
  id: string
  ticket_id: string
  event_id: string
  device_id: string
  admission_counter: number
  timestamp: number
  lease_hash: string
  source: "local" | "peer"
}

export function isGroupAdmissionTicket(ticket: {
  group_id?: string | null
  max_admissions?: number | null
}): boolean {
  if (ticket.group_id && ticket.group_id.trim()) return true
  return Math.max(1, Number(ticket.max_admissions) || 1) > 1
}

export function ticketDeviceSlot(ticketId: string, slotCount: number): number {
  const count = Math.floor(Number(slotCount))
  if (!Number.isFinite(count) || count < 1) return -1
  let hash = 0x811c9dc5
  for (let i = 0; i < ticketId.length; i += 1) {
    hash ^= ticketId.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % count
}

export function isValidScannerDeviceSlot(
  slot: { index?: unknown; count?: unknown } | null | undefined,
): slot is ScannerDeviceSlot {
  const count = Math.floor(Number(slot?.count))
  const index = Math.floor(Number(slot?.index))
  return (
    Number.isFinite(count) &&
    Number.isFinite(index) &&
    count >= 1 &&
    count <= SCANNER_DEVICE_SLOT_MAX &&
    index >= 0 &&
    index < count
  )
}

/**
 * Partición estable por ticketId. Sin count válido no pertenece a ninguna pistola.
 * count === 1 (config explícita de una sola pistola) cubre todos los tickets.
 */
export function ticketBelongsToDeviceSlot(
  ticketId: string,
  slotIndex: number,
  slotCount: number,
): boolean {
  if (!isValidScannerDeviceSlot({ index: slotIndex, count: slotCount })) {
    return false
  }
  return ticketDeviceSlot(ticketId, slotCount) === Math.floor(Number(slotIndex))
}

export function decideOfflineAdmission(input: {
  status: string
  admissionsUsed: number
  maxAdmissions: number
  groupId: string | null
  ticketId: string
  deviceSlotIndex: number
  deviceSlotCount: number
  online: boolean
  hasLivePeers: boolean
  localLeaseCount: number
  scannedAt: number | null
}): OfflineAdmissionDecision {
  const maxAdmissions = Math.max(1, Math.floor(Number(input.maxAdmissions) || 1))
  const used = Math.max(0, Math.floor(Number(input.admissionsUsed) || 0))
  const leases = Math.max(0, Math.floor(Number(input.localLeaseCount) || 0))

  if (
    input.status === "transferred" ||
    input.status === "cancelled" ||
    input.status === "refunded" ||
    input.status === "pending_payment" ||
    input.status === "revoked"
  ) {
    return { action: "reject", reason: "invalid_status", scannedAt: input.scannedAt }
  }

  if (
    input.status === "used" ||
    input.status === "scanned" ||
    used >= maxAdmissions ||
    leases >= maxAdmissions
  ) {
    return {
      action: "duplicate",
      reason: leases >= maxAdmissions ? "lease_exists" : "already_used",
      scannedAt: input.scannedAt,
    }
  }

  if (
    !ticketBelongsToDeviceSlot(
      input.ticketId,
      input.deviceSlotIndex,
      input.deviceSlotCount,
    )
  ) {
    return {
      action: "main_gate_review",
      reason: "range_mismatch",
      scannedAt: null,
    }
  }

  const grouped = isGroupAdmissionTicket({
    group_id: input.groupId,
    max_admissions: maxAdmissions,
  })
  if (
    grouped &&
    !input.online &&
    !input.hasLivePeers &&
    input.deviceSlotCount > 1
  ) {
    return {
      action: "main_gate_review",
      reason: "group_no_peers",
      scannedAt: null,
    }
  }

  return { action: "admit", reason: "ok", scannedAt: null }
}

export function scannerSlotStorageKey(eventId: string, gateId: string): string {
  return `${SCANNER_SLOT_KEY_PREFIX}.${eventId}.${gateId}`
}

export function readScannerDeviceId(): string {
  if (typeof window === "undefined") return "server"
  try {
    const existing = window.localStorage.getItem(SCANNER_DEVICE_ID_KEY)?.trim()
    if (existing) return existing
    const created =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now().toString(16)}`
    window.localStorage.setItem(SCANNER_DEVICE_ID_KEY, created)
    return created
  } catch {
    return `dev-${Date.now().toString(16)}`
  }
}

export function parseScannerDeviceSlot(
  raw: string | null | undefined,
): ScannerDeviceSlot | null {
  if (!raw?.trim()) return null
  try {
    const parsed = JSON.parse(raw) as { index?: unknown; count?: unknown }
    const slot = {
      index: Math.floor(Number(parsed.index)),
      count: Math.floor(Number(parsed.count)),
    }
    return isValidScannerDeviceSlot(slot) ? slot : null
  } catch {
    return null
  }
}

function readPersistedSlotRaw(eventId: string, gateId: string): string | null {
  const key = scannerSlotStorageKey(eventId, gateId)
  try {
    const local = window.localStorage.getItem(key)
    if (local) return local
  } catch {
    // quota / private mode
  }
  try {
    const session = window.sessionStorage.getItem(key)
    if (!session) return null
    try {
      window.localStorage.setItem(key, session)
      window.sessionStorage.removeItem(key)
    } catch {
      // migrate best-effort; still use the session value this read
    }
    return session
  } catch {
    return null
  }
}

/** `null` si no hay setup persistido. No inventa count=1. */
export function readScannerDeviceSlot(
  eventId: string,
  gateId: string,
): ScannerDeviceSlot | null {
  if (typeof window === "undefined" || !eventId || !gateId) return null
  return parseScannerDeviceSlot(readPersistedSlotRaw(eventId, gateId))
}

export function writeScannerDeviceSlot(
  eventId: string,
  gateId: string,
  slot: { index: number; count: number },
): ScannerDeviceSlot | null {
  if (typeof window === "undefined" || !eventId || !gateId) return null
  const parsed = parseScannerDeviceSlot(JSON.stringify(slot))
  if (!parsed) return null
  try {
    window.localStorage.setItem(
      scannerSlotStorageKey(eventId, gateId),
      JSON.stringify(parsed),
    )
    window.dispatchEvent(new Event(SCANNER_DEVICE_SLOT_EVENT))
    return parsed
  } catch {
    return null
  }
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/** SHA-256(device_id|ticket_id|timestamp|admission_counter) — <1ms. */
export async function buildAdmissionLeaseHash(
  parts: AdmissionLeaseParts,
): Promise<string> {
  const payload = `${parts.deviceId}|${parts.ticketId}|${parts.timestamp}|${parts.admissionCounter}`
  const data = new TextEncoder().encode(payload)
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", data)
    return toHex(digest)
  }
  let hash = 0x811c9dc5
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}
