/**
 * Scan lease offline: mismo dispositivo bloquea relectura al instante.
 * Entre pistolas desconectadas el protocolo es rango asignado por gatera
 * (ticketId estable → slot). Gossip local (BroadcastChannel) es best-effort.
 */

export const SCANNER_DEVICE_ID_KEY = "tokepass.scanner.device_id"
export const SCANNER_SLOT_KEY_PREFIX = "tokepass.scanner.slot"

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
  const count = Math.max(1, Math.floor(Number(slotCount) || 1))
  let hash = 0x811c9dc5
  for (let i = 0; i < ticketId.length; i += 1) {
    hash ^= ticketId.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % count
}

export function ticketBelongsToDeviceSlot(
  ticketId: string,
  slotIndex: number,
  slotCount: number,
): boolean {
  const count = Math.max(1, Math.floor(Number(slotCount) || 1))
  if (count <= 1) return true
  const index = Math.min(count - 1, Math.max(0, Math.floor(Number(slotIndex) || 0)))
  return ticketDeviceSlot(ticketId, count) === index
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

export function readScannerDeviceSlot(
  eventId: string,
  gateId: string,
): { index: number; count: number } {
  const fallback = { index: 0, count: 1 }
  if (typeof window === "undefined" || !eventId || !gateId) return fallback
  try {
    const raw = window.sessionStorage.getItem(
      scannerSlotStorageKey(eventId, gateId),
    )
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as { index?: unknown; count?: unknown }
    const count = Math.min(8, Math.max(1, Math.floor(Number(parsed.count) || 1)))
    const index = Math.min(count - 1, Math.max(0, Math.floor(Number(parsed.index) || 0)))
    return { index, count }
  } catch {
    return fallback
  }
}

export function writeScannerDeviceSlot(
  eventId: string,
  gateId: string,
  slot: { index: number; count: number },
): void {
  if (typeof window === "undefined" || !eventId || !gateId) return
  const count = Math.min(8, Math.max(1, Math.floor(Number(slot.count) || 1)))
  const index = Math.min(count - 1, Math.max(0, Math.floor(Number(slot.index) || 0)))
  try {
    window.sessionStorage.setItem(
      scannerSlotStorageKey(eventId, gateId),
      JSON.stringify({ index, count }),
    )
    window.dispatchEvent(new Event("tokepass-scanner-device-slot"))
  } catch {
    // sessionStorage opcional
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
