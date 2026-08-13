/**
 * IndexedDB del Zero-Offline Scanner (puerta).
 * Manifiesto de tickets por evento + cola de sincronización.
 */

export type ScannerManifestTicket = {
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
  is_test: boolean
  /** Precio público del tier; 0 = gratuita. */
  tier_price: number
  /** Agrupa QRs de una misma mesa. */
  group_id: string | null
  group_slot: number | null
  batch_id: string | null
}

export type ScannerManifestMeta = {
  eventId: string
  hash: string
  downloadedAt: number
  ticketCount: number
  qrType: "dynamic" | "static"
  eventTitle: string
  eventStatus: string
}

export type SyncQueueItem = {
  ticket_id: string
  event_id: string
  scanned_at_local: number
  queued_at: number
  admissions_count: number
}

const DB_NAME = "tokepass-scanner-offline"
const DB_VERSION = 1
const MANIFESTS = "manifests"
const TICKETS = "tickets"
const SYNC_QUEUE = "sync_queue"

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

      if (!db.objectStoreNames.contains(MANIFESTS)) {
        db.createObjectStore(MANIFESTS, { keyPath: "eventId" })
      }

      if (!db.objectStoreNames.contains(TICKETS)) {
        const store = db.createObjectStore(TICKETS, { keyPath: "id" })
        store.createIndex("by_event", "event_id", { unique: false })
        store.createIndex("by_secret", "totp_secret", { unique: false })
      }

      if (!db.objectStoreNames.contains(SYNC_QUEUE)) {
        const queue = db.createObjectStore(SYNC_QUEUE, {
          keyPath: "ticket_id",
        })
        queue.createIndex("by_event", "event_id", { unique: false })
      }
    }
  })
}

export async function hashManifest(
  tickets: Array<Pick<ScannerManifestTicket, "id" | "status" | "totp_secret">>,
): Promise<string> {
  const payload = tickets
    .map((t) => `${t.id}:${t.status}:${t.totp_secret}`)
    .sort()
    .join("|")

  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(payload)
    const digest = await crypto.subtle.digest("SHA-256", data)
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  }

  // Fallback no-criptográfico (entornos sin subtle)
  let hash = 0x811c9dc5
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

export async function saveEventManifest(input: {
  eventId: string
  eventTitle: string
  eventStatus?: string
  qrType: "dynamic" | "static"
  tickets: ScannerManifestTicket[]
}): Promise<ScannerManifestMeta> {
  const hash = await hashManifest(input.tickets)
  const meta: ScannerManifestMeta = {
    eventId: input.eventId,
    hash,
    downloadedAt: Date.now(),
    ticketCount: input.tickets.length,
    qrType: input.qrType,
    eventTitle: input.eventTitle,
    eventStatus: input.eventStatus ?? "published",
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

  for (const ticket of input.tickets) {
    ticketStore.put({
      ...ticket,
      is_test: Boolean(ticket.is_test),
    })
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
  const db = await openDb()
  const tx = db.transaction(TICKETS, "readonly")
  const index = tx.objectStore(TICKETS).index("by_secret")
  const rows = (await requestToPromise(
    index.getAll(totpSecret),
  )) as ScannerManifestTicket[]
  await txDone(tx)
  db.close()

  return rows.find((row) => row.event_id === eventId) ?? null
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
  return row ?? null
}

export async function markTicketUsedLocally(
  ticketId: string,
  scannedAtLocal: number = Date.now(),
): Promise<ScannerManifestTicket | null> {
  const db = await openDb()
  const tx = db.transaction([TICKETS, SYNC_QUEUE], "readwrite")
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

  ticketStore.put(updated)
  queueStore.put({
    ticket_id: ticketId,
    event_id: current.event_id,
    scanned_at_local: scannedAtLocal,
    queued_at: Date.now(),
    admissions_count: (queued?.admissions_count ?? 0) + 1,
  } satisfies SyncQueueItem)

  await txDone(tx)
  db.close()
  return updated
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
    .sort((a, b) => (a.group_slot ?? 0) - (b.group_slot ?? 0))
}

/**
 * Descarga el manifiesto del servidor y lo persiste en IndexedDB.
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
  }>,
): Promise<ScannerManifestMeta> {
  const payload = await fetcher(eventId)

  // Preservar usos locales pendientes de sync (no pisar con valid del server).
  const queue = await getSyncQueue()
  const pendingIds = new Set(
    queue.filter((item) => item.event_id === eventId).map((item) => item.ticket_id),
  )

  const tickets = payload.tickets.map((ticket) => {
    if (pendingIds.has(ticket.id)) {
      return {
        ...ticket,
        is_test: Boolean(ticket.is_test),
        tier_price: Number(ticket.tier_price ?? 0),
        status: "used" as const,
      }
    }
    return {
      ...ticket,
      is_test: Boolean(ticket.is_test),
      tier_price: Number(ticket.tier_price ?? 0),
    }
  })

  return saveEventManifest({
    eventId: payload.eventId,
    eventTitle: payload.eventTitle,
    eventStatus: payload.eventStatus,
    qrType: payload.qrType,
    tickets,
  })
}

/** Limpia manifiestos y cola de sync del escáner (llamar en logout). */
export async function clearOfflineScannerStore(): Promise<void> {
  if (!isBrowser()) return
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to delete scanner IndexedDB"))
    request.onblocked = () => resolve()
  })
}
