/**
 * Almacén IndexedDB para billetera offline-first.
 * Solo guarda datos del usuario autenticado necesarios para regenerar el Living QR.
 */

import type { MyTicket } from "@/app/actions/tickets"
import type { TicketStatus } from "@/types/database"
import { requestTicketAssetCache } from "@/lib/wallet-cache"

const DB_NAME = "tokepass-offline"
const DB_VERSION = 3
const TICKETS_STORE = "tickets"
const META_STORE = "meta"
const KEYS_STORE = "keys"
const WALLET_KEY_ID = "wallet-aes-gcm-v1"

export type OfflineEventData = {
  eventId: string
  eventTitle: string
  eventDate: string
  eventLocation: string
  flyerUrl: string | null
  venueName: string | null
  tierName: string
  bonusReward: string | null
  dayId: string | null
  dayValidityLabel: string | null
  seatingLabel?: string | null
  seatingSectorName?: string | null
  seatingRowLabel?: string | null
  seatingLayoutType?: "table_combo" | "numbered_seat" | null
  maxAdmissions?: number
  admissionsUsed?: number
  qrType: "dynamic" | "static"
  holderName: string
  holderDni: string | null
}

export type OfflineTicketRecord = {
  ticket_id: string
  user_id: string
  /** Semilla Living QR. Nunca guardar session JWT aquí. */
  totp_secret: string
  event_data: OfflineEventData
  status: TicketStatus
  qr_code: string
  transfer_count: number
  max_transfers_allowed: number
  created_at: string
  synced_at: number
}

type EncryptedOfflineTicketRecord = {
  ticket_id: string
  user_id: string
  sealed: true
  iv: string
  ciphertext: string
  synced_at: number
}

type StoredOfflineTicketRecord =
  | OfflineTicketRecord
  | EncryptedOfflineTicketRecord

type MetaRecord = {
  key: string
  value: string
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined"
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) {
      reject(new Error("IndexedDB no disponible"))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(request.error ?? new Error("No se pudo abrir IndexedDB"))
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(TICKETS_STORE)) {
        const store = db.createObjectStore(TICKETS_STORE, {
          keyPath: "ticket_id",
        })
        store.createIndex("by_user", "user_id", { unique: false })
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" })
      }

      if (!db.objectStoreNames.contains(KEYS_STORE)) {
        db.createObjectStore(KEYS_STORE, { keyPath: "id" })
      }
    }
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error("Operación IndexedDB fallida"))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Transacción IndexedDB fallida"))
    tx.onabort = () => reject(tx.error ?? new Error("Transacción IndexedDB abortada"))
  })
}

let walletKeyPromise: Promise<CryptoKey> | null = null

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return window.btoa(binary)
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = window.atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function loadOrCreateWalletKey(): Promise<CryptoKey> {
  if (!crypto.subtle) {
    throw new Error("WebCrypto no disponible")
  }

  const candidate = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
  const db = await openDb()
  const tx = db.transaction(KEYS_STORE, "readwrite")
  const store = tx.objectStore(KEYS_STORE)
  const existing = (await requestToPromise(
    store.get(WALLET_KEY_ID),
  )) as { id: string; key: CryptoKey } | undefined
  const key = existing?.key ?? candidate

  if (!existing) {
    store.put({ id: WALLET_KEY_ID, key })
  }

  await txDone(tx)
  db.close()
  return key
}

function getWalletKey(): Promise<CryptoKey> {
  walletKeyPromise ??= loadOrCreateWalletKey().catch((error) => {
    walletKeyPromise = null
    throw error
  })
  return walletKeyPromise
}

function recordAad(ticketId: string, userId: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(
    `tokepass-wallet-v1:${ticketId}:${userId}`,
  )
  return encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength,
  ) as ArrayBuffer
}

async function sealOfflineRecord(
  record: OfflineTicketRecord,
): Promise<EncryptedOfflineTicketRecord> {
  const key = await getWalletKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(record))
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: recordAad(record.ticket_id, record.user_id),
    },
    key,
    plaintext,
  )

  return {
    ticket_id: record.ticket_id,
    user_id: record.user_id,
    sealed: true,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    synced_at: record.synced_at,
  }
}

async function unsealOfflineRecord(
  stored: StoredOfflineTicketRecord,
): Promise<OfflineTicketRecord> {
  if (!("sealed" in stored)) return stored

  const key = await getWalletKey()
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(stored.iv),
      additionalData: recordAad(stored.ticket_id, stored.user_id),
    },
    key,
    base64ToBytes(stored.ciphertext),
  )
  return JSON.parse(
    new TextDecoder().decode(plaintext),
  ) as OfflineTicketRecord
}

export function ticketToOfflineRecord(
  ticket: MyTicket,
  userId: string,
): OfflineTicketRecord {
  return {
    ticket_id: ticket.id,
    user_id: userId,
    totp_secret: ticket.totpSecret || ticket.id,
    event_data: {
      eventId: ticket.eventId,
      eventTitle: ticket.eventTitle,
      eventDate: ticket.eventDate,
      eventLocation: ticket.eventLocation,
      flyerUrl: ticket.flyerUrl,
      venueName: ticket.venueName,
      tierName: ticket.tierName,
      bonusReward: ticket.bonusReward,
      dayId: ticket.dayId,
      dayValidityLabel: ticket.dayValidityLabel,
      seatingLabel: ticket.seatingLabel,
      seatingSectorName: ticket.seatingSectorName,
      seatingRowLabel: ticket.seatingRowLabel,
      seatingLayoutType: ticket.seatingLayoutType,
      maxAdmissions: ticket.maxAdmissions,
      admissionsUsed: ticket.admissionsUsed,
      qrType: ticket.qrType,
      holderName: ticket.holderName,
      holderDni: ticket.holderDni,
    },
    status: ticket.status,
    qr_code: ticket.qrCode,
    transfer_count: ticket.transferCount,
    max_transfers_allowed: ticket.maxTransfersAllowed,
    created_at: ticket.createdAt,
    synced_at: Date.now(),
  }
}

export function offlineRecordToTicket(record: OfflineTicketRecord): MyTicket {
  return {
    id: record.ticket_id,
    status: record.status,
    qrCode: record.qr_code,
    totpSecret: record.totp_secret,
    transferCount: record.transfer_count ?? 0,
    maxTransfersAllowed: record.max_transfers_allowed ?? 1,
    createdAt: record.created_at,
    tierName: record.event_data.tierName,
    bonusReward: record.event_data.bonusReward,
    dayId: record.event_data.dayId ?? null,
    dayValidityLabel: record.event_data.dayValidityLabel ?? null,
    seatingLabel: record.event_data.seatingLabel ?? null,
    seatingSectorName: record.event_data.seatingSectorName ?? null,
    seatingRowLabel: record.event_data.seatingRowLabel ?? null,
    seatingLayoutType: record.event_data.seatingLayoutType ?? null,
    maxAdmissions: record.event_data.maxAdmissions ?? 1,
    admissionsUsed: record.event_data.admissionsUsed ?? 0,
    eventId: record.event_data.eventId,
    eventTitle: record.event_data.eventTitle,
    eventDate: record.event_data.eventDate,
    eventLocation: record.event_data.eventLocation,
    flyerUrl: record.event_data.flyerUrl,
    venueName: record.event_data.venueName,
    qrType: record.event_data.qrType ?? "dynamic",
    holderName: record.event_data.holderName ?? "Titular",
    holderDni: record.event_data.holderDni ?? null,
  }
}

async function putTicketsAndMeta(
  userId: string,
  tickets: MyTicket[],
  mode: "replace" | "merge",
): Promise<MyTicket[]> {
  const active = tickets.filter(
    (ticket) =>
      ticket.status === "valid" ||
      ticket.status === "used" ||
      ticket.status === "scanned",
  )
  const encryptedActive = await Promise.all(
    active.map((ticket) =>
      sealOfflineRecord(ticketToOfflineRecord(ticket, userId)),
    ),
  )

  // Lectura fuera de la tx de escritura (Safari/WebKit auto-commit).
  let existing: StoredOfflineTicketRecord[] = []
  if (mode === "replace") {
    const readDb = await openDb()
    const readTx = readDb.transaction(TICKETS_STORE, "readonly")
    existing = (await requestToPromise(
      readTx.objectStore(TICKETS_STORE).getAll(),
    )) as StoredOfflineTicketRecord[]
    await txDone(readTx)
    readDb.close()
  }

  const db = await openDb()
  const tx = db.transaction([TICKETS_STORE, META_STORE], "readwrite")
  const ticketStore = tx.objectStore(TICKETS_STORE)
  const metaStore = tx.objectStore(META_STORE)

  if (mode === "replace") {
    for (const row of existing) {
      if (row.user_id !== userId) {
        ticketStore.delete(row.ticket_id)
        continue
      }
      if (!active.some((ticket) => ticket.id === row.ticket_id)) {
        ticketStore.delete(row.ticket_id)
      }
    }
  } else {
    for (const ticket of tickets) {
      const keep =
        ticket.status === "valid" ||
        ticket.status === "used" ||
        ticket.status === "scanned"
      if (!keep) {
        ticketStore.delete(ticket.id)
      }
    }
  }

  for (const ticket of encryptedActive) {
    ticketStore.put(ticket)
  }

  metaStore.put({
    key: "active_user_id",
    value: userId,
  } satisfies MetaRecord)
  metaStore.put({
    key: "last_synced_at",
    value: String(Date.now()),
  } satisfies MetaRecord)

  await txDone(tx)
  db.close()
  return active
}

function precacheTicketAssets(tickets: MyTicket[]) {
  requestTicketAssetCache([
    "/my-tickets",
    ...tickets.flatMap((ticket) => [
      ticket.flyerUrl,
      `/tickets/${ticket.id}/print`,
    ]),
  ])
}

/** Sync completo: reemplaza la billetera local del usuario y cachea assets. */
export async function saveTicketsOffline(
  userId: string,
  tickets: MyTicket[],
): Promise<void> {
  if (!userId || !isBrowser()) return
  const active = await putTicketsAndMeta(userId, tickets, "replace")
  precacheTicketAssets(active)
}

/**
 * Upsert preventivo (compra/transferencia/guardado manual):
 * no borra otras entradas locales del mismo usuario.
 */
export async function upsertTicketsOffline(
  userId: string,
  tickets: MyTicket[],
): Promise<void> {
  if (!userId || !isBrowser()) return
  const active = await putTicketsAndMeta(userId, tickets, "merge")
  precacheTicketAssets(active)
}

export async function getTicketsOffline(
  userId?: string | null,
): Promise<MyTicket[]> {
  if (!isBrowser()) return []

  const db = await openDb()
  const tx = db.transaction(TICKETS_STORE, "readonly")
  const store = tx.objectStore(TICKETS_STORE)
  const storedRows = (await requestToPromise(
    store.getAll(),
  )) as StoredOfflineTicketRecord[]
  await txDone(tx)
  db.close()

  const rows = (
    await Promise.all(
      storedRows.map(async (stored) => {
        try {
          return await unsealOfflineRecord(stored)
        } catch (error) {
          console.warn("[offline-store] registro cifrado inválido", error)
          return null
        }
      }),
    )
  ).filter((row): row is OfflineTicketRecord => row !== null)

  const filtered = userId
    ? rows.filter((row) => row.user_id === userId)
    : rows

  return filtered
    .map(offlineRecordToTicket)
    .sort(
      (a, b) =>
        new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime(),
    )
}

export async function getOfflineActiveUserId(): Promise<string | null> {
  if (!isBrowser()) return null

  const db = await openDb()
  const tx = db.transaction(META_STORE, "readonly")
  const row = (await requestToPromise(
    tx.objectStore(META_STORE).get("active_user_id"),
  )) as MetaRecord | undefined
  await txDone(tx)
  db.close()

  return row?.value ?? null
}

/** Elimina un ticket del almacén local (p. ej. tras transferir). */
export async function removeTicketOffline(ticketId: string): Promise<void> {
  if (!ticketId || !isBrowser()) return

  const db = await openDb()
  const tx = db.transaction(TICKETS_STORE, "readwrite")
  tx.objectStore(TICKETS_STORE).delete(ticketId)
  await txDone(tx)
  db.close()
}

/** Limpia secretos locales (llamar en logout). */
export async function clearOfflineWalletStore(): Promise<void> {
  if (!isBrowser()) return

  const db = await openDb()
  const tx = db.transaction(
    [TICKETS_STORE, META_STORE, KEYS_STORE],
    "readwrite",
  )
  tx.objectStore(TICKETS_STORE).clear()
  tx.objectStore(META_STORE).clear()
  tx.objectStore(KEYS_STORE).clear()
  await txDone(tx)
  db.close()
  walletKeyPromise = null
}
