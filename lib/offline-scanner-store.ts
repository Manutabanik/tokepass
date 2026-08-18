/**
 * IndexedDB del Zero-Offline Scanner (puerta).
 * Manifiesto cifrado por PIN + cola de sync + scan leases.
 */

import {
  type AdmissionLeaseRecord,
  buildAdmissionLeaseHash,
} from "@/lib/scanner/admission-lease"
import { deviceClockOffsetMs } from "@/lib/totp-offline"
import {
  decryptTotpSecret,
  encryptTotpSecret,
  isScannerVaultUnlocked,
  lockScannerVault,
  parseEncryptedSecret,
  serializeEncryptedSecret,
  totpSecretLookupHash,
  type ScannerVaultRecord,
} from "@/lib/scanner/manifest-crypto"

export type ScannerManifestTicket = {
  id: string
  event_id: string
  totp_secret: string
  totp_secret_enc?: string | null
  secret_lookup?: string | null
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
  seating_sector_id?: string | null
  is_test: boolean
  /** Compra sandbox (test_sandbox): válida en puerta para E2E. */
  is_sandbox?: boolean
  /** Precio público del tier; 0 = gratuita. */
  tier_price: number
  /** Agrupa QRs de una misma mesa. */
  group_id: string | null
  group_slot: number | null
  batch_id: string | null
  ticket_type?: string | null
  /** Cesion en curso: no admite en puerta hasta claim o cancel. */
  pending_transfer?: boolean
  /** FK a event_schedules / abono si es null. */
  day_id?: string | null
}

export type ScannerManifestMeta = {
  eventId: string
  hash: string
  downloadedAt: number
  ticketCount: number
  qrType: "dynamic" | "static"
  eventTitle: string
  eventStatus: string
  scheduleDays?: Array<{
    id: string
    title: string
    start_time: string
    end_time: string
  }>
  eventDate?: string | null
  /** Date.now() del dispositivo menos server_timestamp al descargar. */
  clockOffsetMs?: number
}

export type SyncQueueItem = {
  ticket_id: string
  event_id: string
  scanned_at_local: number
  queued_at: number
  admissions_count: number
  admission_lease_hash?: string
  device_id?: string
}

export type { AdmissionLeaseRecord }

const DB_NAME = "tokepass-scanner-offline"
const DB_VERSION = 2
const MANIFESTS = "manifests"
const TICKETS = "tickets"
const SYNC_QUEUE = "sync_queue"
const LEASES = "leases"
const CRYPTO = "crypto"

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined"
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB tx failed"))
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB tx aborted"))
  })
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) {
      reject(new Error("IndexedDB no disponible"))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(request.error ?? new Error("No se pudo abrir IndexedDB scanner"))
    }

    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = () => {
      const db = request.result
      const tx = request.transaction

      if (!db.objectStoreNames.contains(MANIFESTS)) {
        db.createObjectStore(MANIFESTS, { keyPath: "eventId" })
      }

      let ticketStore: IDBObjectStore
      if (!db.objectStoreNames.contains(TICKETS)) {
        ticketStore = db.createObjectStore(TICKETS, { keyPath: "id" })
        ticketStore.createIndex("by_event", "event_id", { unique: false })
        ticketStore.createIndex("by_secret", "totp_secret", { unique: false })
      } else {
        ticketStore = tx!.objectStore(TICKETS)
      }
      if (!ticketStore.indexNames.contains("by_lookup")) {
        ticketStore.createIndex("by_lookup", "secret_lookup", { unique: false })
      }

      if (!db.objectStoreNames.contains(SYNC_QUEUE)) {
        const queue = db.createObjectStore(SYNC_QUEUE, {
          keyPath: "ticket_id",
        })
        queue.createIndex("by_event", "event_id", { unique: false })
      }

      if (!db.objectStoreNames.contains(LEASES)) {
        const leases = db.createObjectStore(LEASES, { keyPath: "id" })
        leases.createIndex("by_ticket", "ticket_id", { unique: false })
        leases.createIndex("by_event", "event_id", { unique: false })
        leases.createIndex("by_hash", "lease_hash", { unique: false })
      }

      if (!db.objectStoreNames.contains(CRYPTO)) {
        db.createObjectStore(CRYPTO, { keyPath: "id" })
      }
    }
  })
}

function persistedTicket(ticket: ScannerManifestTicket): ScannerManifestTicket {
  return {
    ...ticket,
    totp_secret: "",
    totp_secret_enc: ticket.totp_secret_enc ?? null,
    secret_lookup: ticket.secret_lookup ?? null,
    is_test: Boolean(ticket.is_test),
    is_sandbox: Boolean(ticket.is_sandbox),
    pending_transfer: Boolean(ticket.pending_transfer),
    day_id: ticket.day_id ?? null,
  }
}

async function hydrateTicketSecret(
  row: ScannerManifestTicket,
): Promise<ScannerManifestTicket> {
  const blob = parseEncryptedSecret(row.totp_secret_enc)
  if (blob && isScannerVaultUnlocked()) {
    const secret = await decryptTotpSecret(blob)
    return { ...row, totp_secret: secret }
  }
  return row
}

async function sealTicket(
  ticket: ScannerManifestTicket,
): Promise<ScannerManifestTicket> {
  const plaintext = ticket.totp_secret?.trim() ?? ""
  if (!plaintext) {
    return persistedTicket(ticket)
  }
  if (!isScannerVaultUnlocked()) {
    throw new Error("Desbloquea el manifiesto con el PIN de validador")
  }
  const blob = await encryptTotpSecret(plaintext)
  const lookup = await totpSecretLookupHash(plaintext)
  return persistedTicket({
    ...ticket,
    totp_secret_enc: serializeEncryptedSecret(blob),
    secret_lookup: lookup,
  })
}

export async function hashManifest(
  tickets: Array<
    Pick<
      ScannerManifestTicket,
      "id" | "status" | "totp_secret" | "secret_lookup" | "pending_transfer" | "day_id"
    >
  >,
): Promise<string> {
  const payload = tickets
    .map(
      (t) =>
        `${t.id}:${t.status}:${t.secret_lookup || t.totp_secret || ""}:${t.pending_transfer ? 1 : 0}:${t.day_id ?? ""}`,
    )
    .sort()
    .join("|")

  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(payload)
    const digest = await crypto.subtle.digest("SHA-256", data)
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  }

  let hash = 0x811c9dc5
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

export async function getScannerVault(): Promise<ScannerVaultRecord | null> {
  if (!isBrowser()) return null
  const db = await openDb()
  const tx = db.transaction(CRYPTO, "readonly")
  const row = (await requestToPromise(
    tx.objectStore(CRYPTO).get("vault"),
  )) as ScannerVaultRecord | undefined
  await txDone(tx)
  db.close()
  return row ?? null
}

export async function saveScannerVault(record: ScannerVaultRecord): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(CRYPTO, "readwrite")
  tx.objectStore(CRYPTO).put(record)
  await txDone(tx)
  db.close()
}

export async function saveEventManifest(input: {
  eventId: string
  eventTitle: string
  eventStatus?: string
  qrType: "dynamic" | "static"
  tickets: ScannerManifestTicket[]
  scheduleDays?: ScannerManifestMeta["scheduleDays"]
  eventDate?: string | null
  clockOffsetMs?: number
}): Promise<ScannerManifestMeta> {
  const sealed = await Promise.all(input.tickets.map((ticket) => sealTicket(ticket)))
  const hash = await hashManifest(sealed)
  const meta: ScannerManifestMeta = {
    eventId: input.eventId,
    hash,
    downloadedAt: Date.now(),
    ticketCount: sealed.length,
    qrType: input.qrType,
    eventTitle: input.eventTitle,
    eventStatus: input.eventStatus ?? "published",
    scheduleDays: input.scheduleDays ?? [],
    eventDate: input.eventDate ?? null,
    clockOffsetMs: Number.isFinite(Number(input.clockOffsetMs))
      ? Number(input.clockOffsetMs)
      : 0,
  }

  const db = await openDb()
  const tx = db.transaction([MANIFESTS, TICKETS], "readwrite")
  const ticketStore = tx.objectStore(TICKETS)
  const byEvent = ticketStore.index("by_event")

  const existing = (await requestToPromise(
    byEvent.getAll(input.eventId),
  )) as ScannerManifestTicket[]

  for (const row of existing) {
    ticketStore.delete(row.id)
  }

  for (const ticket of sealed) {
    ticketStore.put(ticket)
  }

  tx.objectStore(MANIFESTS).put(meta)
  await txDone(tx)
  db.close()

  return meta
}

export async function getManifestMeta(
  eventId: string,
): Promise<ScannerManifestMeta | null> {
  if (!eventId) return null
  const db = await openDb()
  const tx = db.transaction(MANIFESTS, "readonly")
  const meta = (await requestToPromise(
    tx.objectStore(MANIFESTS).get(eventId),
  )) as ScannerManifestMeta | undefined
  await txDone(tx)
  db.close()
  return meta ?? null
}

export async function getTicketBySecret(
  eventId: string,
  totpSecret: string,
): Promise<ScannerManifestTicket | null> {
  const lookup = isScannerVaultUnlocked()
    ? await totpSecretLookupHash(totpSecret)
    : null

  const db = await openDb()
  const tx = db.transaction(TICKETS, "readonly")
  const store = tx.objectStore(TICKETS)

  let rows: ScannerManifestTicket[] = []
  if (lookup) {
    rows = (await requestToPromise(
      store.index("by_lookup").getAll(lookup),
    )) as ScannerManifestTicket[]
  }
  if (rows.length === 0) {
    rows = (await requestToPromise(
      store.index("by_secret").getAll(totpSecret),
    )) as ScannerManifestTicket[]
  }
  await txDone(tx)
  db.close()

  const match = rows.find((row) => row.event_id === eventId)
  return match ? hydrateTicketSecret(match) : null
}

export async function getTicketById(
  ticketId: string,
): Promise<ScannerManifestTicket | null> {
  const db = await openDb()
  const tx = db.transaction(TICKETS, "readonly")
  const row = (await requestToPromise(
    tx.objectStore(TICKETS).get(ticketId),
  )) as ScannerManifestTicket | undefined
  await txDone(tx)
  db.close()
  return row ? hydrateTicketSecret(row) : null
}

export async function countAdmissionLeases(ticketId: string): Promise<number> {
  if (!ticketId) return 0
  const db = await openDb()
  const tx = db.transaction(LEASES, "readonly")
  const count = await requestToPromise(
    tx.objectStore(LEASES).index("by_ticket").count(ticketId),
  )
  await txDone(tx)
  db.close()
  return count
}

export async function putAdmissionLease(
  record: AdmissionLeaseRecord,
): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(LEASES, "readwrite")
  tx.objectStore(LEASES).put(record)
  await txDone(tx)
  db.close()
}

export async function markTicketUsedLocally(
  ticketId: string,
  scannedAtLocal: number = Date.now(),
  lease?: Pick<AdmissionLeaseRecord, "device_id" | "lease_hash">,
): Promise<ScannerManifestTicket | null> {
  const db = await openDb()
  const tx = db.transaction([TICKETS, SYNC_QUEUE, LEASES], "readwrite")
  const ticketStore = tx.objectStore(TICKETS)
  const current = (await requestToPromise(
    ticketStore.get(ticketId),
  )) as ScannerManifestTicket | undefined

  if (!current) {
    await txDone(tx)
    db.close()
    return null
  }

  const queueStore = tx.objectStore(SYNC_QUEUE)
  const queued = (await requestToPromise(
    queueStore.get(ticketId),
  )) as SyncQueueItem | undefined
  const nextAdmissions = Math.min(
    Math.max(1, current.max_admissions ?? 1),
    (current.admissions_used ?? 0) + 1,
  )

  const updated: ScannerManifestTicket = {
    ...current,
    status:
      nextAdmissions >= Math.max(1, current.max_admissions ?? 1)
        ? "used"
        : "valid",
    admissions_used: nextAdmissions,
    scanned_at_local: scannedAtLocal,
    scanned_at: new Date(scannedAtLocal).toISOString(),
  }

  ticketStore.put({
    ...updated,
    totp_secret: updated.totp_secret_enc ? "" : updated.totp_secret,
  })
  queueStore.put({
    ticket_id: ticketId,
    event_id: current.event_id,
    scanned_at_local: scannedAtLocal,
    queued_at: Date.now(),
    admissions_count: (queued?.admissions_count ?? 0) + 1,
    admission_lease_hash: lease?.lease_hash,
    device_id: lease?.device_id,
  } satisfies SyncQueueItem)

  if (lease?.lease_hash) {
    tx.objectStore(LEASES).put({
      id: `${ticketId}:${nextAdmissions}`,
      ticket_id: ticketId,
      event_id: current.event_id,
      device_id: lease.device_id,
      admission_counter: nextAdmissions,
      timestamp: scannedAtLocal,
      lease_hash: lease.lease_hash,
      source: "local",
    } satisfies AdmissionLeaseRecord)
  }

  await txDone(tx)
  db.close()
  return hydrateTicketSecret(updated)
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await openDb()
  const tx = db.transaction(SYNC_QUEUE, "readonly")
  const rows = (await requestToPromise(
    tx.objectStore(SYNC_QUEUE).getAll(),
  )) as SyncQueueItem[]
  await txDone(tx)
  db.close()
  return rows
}

export async function getSyncQueueCount(): Promise<number> {
  const db = await openDb()
  const tx = db.transaction(SYNC_QUEUE, "readonly")
  const count = await requestToPromise(tx.objectStore(SYNC_QUEUE).count())
  await txDone(tx)
  db.close()
  return count
}

/** Tickets ya marcados como ingresados en el manifiesto local. */
export async function countAdmittedTickets(eventId: string): Promise<number> {
  if (!eventId) return 0
  const db = await openDb()
  const tx = db.transaction(TICKETS, "readonly")
  const rows = (await requestToPromise(
    tx.objectStore(TICKETS).index("by_event").getAll(eventId),
  )) as ScannerManifestTicket[]
  await txDone(tx)
  db.close()
  return rows.filter(
    (row) =>
      row.status === "used" ||
      row.status === "scanned" ||
      (row.admissions_used ?? 0) > 0,
  ).length
}

export async function clearSyncQueueItems(ticketIds: string[]): Promise<void> {
  if (ticketIds.length === 0) return
  const db = await openDb()
  const tx = db.transaction(SYNC_QUEUE, "readwrite")
  const store = tx.objectStore(SYNC_QUEUE)
  for (const id of ticketIds) {
    store.delete(id)
  }
  await txDone(tx)
  db.close()
}

export async function searchManifestTickets(
  eventId: string,
  query: string,
  limit = 30,
): Promise<ScannerManifestTicket[]> {
  const q = query.trim().toLowerCase()
  if (!q || q.length < 2) return []

  const db = await openDb()
  const tx = db.transaction(TICKETS, "readonly")
  const rows = (await requestToPromise(
    tx.objectStore(TICKETS).index("by_event").getAll(eventId),
  )) as ScannerManifestTicket[]
  await txDone(tx)
  db.close()

  return rows
    .filter((row) => {
      const name = row.owner_name.toLowerCase()
      const dni = (row.dni ?? "").toLowerCase()
      const tier = row.ticket_tier.toLowerCase()
      return name.includes(q) || dni.includes(q) || tier.includes(q)
    })
    .map((row) => ({ ...row, totp_secret: "" }))
    .slice(0, limit)
}

/** Todos los QRs de una misma mesa/agrupación en el manifiesto local. */
export async function getManifestTicketsByGroup(
  eventId: string,
  groupId: string,
): Promise<ScannerManifestTicket[]> {
  if (!eventId || !groupId) return []
  const db = await openDb()
  const tx = db.transaction(TICKETS, "readonly")
  const rows = (await requestToPromise(
    tx.objectStore(TICKETS).index("by_event").getAll(eventId),
  )) as ScannerManifestTicket[]
  await txDone(tx)
  db.close()

  return rows
    .filter((row) => row.group_id === groupId)
    .map((row) => ({ ...row, totp_secret: "" }))
    .sort((a, b) => (a.group_slot ?? 0) - (b.group_slot ?? 0))
}

/**
 * Descarga el manifiesto del servidor y lo persiste cifrado en IndexedDB.
 * `fetcher` = server action `fetchEventTicketManifest`.
 */
export async function downloadEventManifest(
  eventId: string,
  fetcher: (eventId: string) => Promise<{
    eventId: string
    eventTitle: string
    eventStatus?: string
    qrType: "dynamic" | "static"
    hash: string
    tickets: ScannerManifestTicket[]
    scheduleDays?: ScannerManifestMeta["scheduleDays"]
    eventDate?: string | null
    server_timestamp?: number
  }>,
): Promise<ScannerManifestMeta> {
  const receivedAt = Date.now()
  const payload = await fetcher(eventId)
  const clockOffsetMs = deviceClockOffsetMs(
    Number(payload.server_timestamp),
    receivedAt,
  )

  const queue = await getSyncQueue()
  const pendingIds = new Set(
    queue.filter((item) => item.event_id === eventId).map((item) => item.ticket_id),
  )

  const tickets = payload.tickets.map((ticket) => {
    if (pendingIds.has(ticket.id)) {
      return {
        ...ticket,
        is_test: Boolean(ticket.is_test),
        is_sandbox: Boolean(ticket.is_sandbox),
        tier_price: Number(ticket.tier_price ?? 0),
        status: "used" as const,
      }
    }
    return {
      ...ticket,
      is_test: Boolean(ticket.is_test),
      is_sandbox: Boolean(ticket.is_sandbox),
      tier_price: Number(ticket.tier_price ?? 0),
    }
  })

  return saveEventManifest({
    eventId: payload.eventId,
    eventTitle: payload.eventTitle,
    eventStatus: payload.eventStatus,
    qrType: payload.qrType,
    tickets,
    scheduleDays: payload.scheduleDays,
    eventDate: payload.eventDate,
    clockOffsetMs,
  })
}

/** Aplica ingresos remotos sin re-bajar secretos. No pisa cola local pendiente. */
export async function applyAdmissionSnapshot(
  eventId: string,
  rows: Array<{
    id: string
    status: ScannerManifestTicket["status"]
    admissions_used: number
    scanned_at: string | null
  }>,
): Promise<number> {
  if (!eventId || rows.length === 0) return 0

  const queue = await getSyncQueue()
  const pending = new Set(
    queue
      .filter((item) => item.event_id === eventId)
      .map((item) => item.ticket_id),
  )

  const db = await openDb()
  const tx = db.transaction(TICKETS, "readwrite")
  const store = tx.objectStore(TICKETS)
  let applied = 0

  for (const row of rows) {
    if (pending.has(row.id)) continue
    const current = (await requestToPromise(
      store.get(row.id),
    )) as ScannerManifestTicket | undefined
    if (!current || current.event_id !== eventId) continue

    const used = Math.max(0, Math.floor(Number(row.admissions_used) || 0))
    if (
      current.status === row.status &&
      (current.admissions_used ?? 0) === used
    ) {
      continue
    }

    const scannedAtLocal = row.scanned_at
      ? new Date(row.scanned_at).getTime()
      : current.scanned_at_local

    store.put({
      ...current,
      status: row.status,
      admissions_used: used,
      scanned_at: row.scanned_at,
      scanned_at_local: Number.isFinite(scannedAtLocal)
        ? scannedAtLocal
        : current.scanned_at_local,
    })
    applied += 1
  }

  await txDone(tx)
  db.close()
  return applied
}

/** Limpia manifiestos, leases y cola de sync del escáner (llamar en logout). */
export async function clearOfflineScannerStore(): Promise<void> {
  lockScannerVault()
  if (!isBrowser()) return
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to delete scanner IndexedDB"))
    request.onblocked = () => resolve()
  })
}

export { buildAdmissionLeaseHash }
