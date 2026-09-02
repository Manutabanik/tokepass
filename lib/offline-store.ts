/**
 * Almacén IndexedDB para billetera offline-first.
 * Solo guarda datos del usuario autenticado necesarios para regenerar el Living QR.
 */

import type { MyStoreRedemption } from "@/app/actions/addons"
import type { MyTicket } from "@/app/actions/tickets"
import type { QrType, TicketIssuanceChannel, TicketStatus } from "@/types/database"
import { resolveTicketVisualStatus } from "@/lib/ticket-visual-status"
import { requestTicketAssetCache } from "@/lib/wallet-cache"

const DB_NAME = "tokepass-offline"
const DB_VERSION = 4
const TICKETS_STORE = "tickets"
const REDEMPTIONS_STORE = "redemptions"
const META_STORE = "meta"
const KEYS_STORE = "keys"
const WALLET_KEY_ID = "wallet-aes-gcm-v1"

export type OfflineEventData = {
  eventId: string
  eventTitle: string
  eventDate: string
  ends_at?: string | null
  doorsOpenAt?: string
  eventLocation: string | null
  deliveryMode?: "PRESENCIAL" | "ONLINE"
  accessLink?: string | null
  flyerUrl: string | null
  socialShareImageUrl?: string | null
  organizerName?: string | null
  organizerAvatarUrl?: string | null
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
  eventQrType?: QrType
  issuanceChannel?: TicketIssuanceChannel
  holderName: string
  holderDni: string | null
  isTest?: boolean
  tierPrice?: number
  isSponsoredByTokePass?: boolean
  pendingTransfer?: {
    id: string
    receiverEmail: string
  } | null
  activeResaleListingId?: string | null
  orderId?: string | null
  orderCreatedAt?: string | null
  ticketType?: "standard" | "combo" | "extra"
  tierType?: string | null
  groupId?: string | null
  groupSlot?: number | null
}

export type OfflineTicketRecord = {
  ticket_id: string
  user_id: string
  /** Semilla Living QR. Nunca guardar session JWT aquí. */
  totp_secret: string
  event_data: OfflineEventData
  status: TicketStatus
  qr_code: string | null
  transfer_count: number
  max_transfers_allowed: number
  created_at: string
  synced_at: number
  is_test?: boolean
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

export type OfflineRedemptionRecord = {
  redemption_id: string
  user_id: string
  /**
   * En barra el `qrCodeToken` ES el secreto: no hay HMAC ni identificador
   * público que lo acompañe. Se guarda cifrado igual que `totp_secret`.
   */
  redemption: MyStoreRedemption
  synced_at: number
}

type EncryptedOfflineRedemptionRecord = {
  redemption_id: string
  user_id: string
  sealed: true
  iv: string
  ciphertext: string
  synced_at: number
}

type StoredOfflineRedemptionRecord =
  | OfflineRedemptionRecord
  | EncryptedOfflineRedemptionRecord

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

    // Otra pestaña con la versión anterior abierta bloquea el upgrade. Sin este
    // handler la promesa queda colgada para siempre y la billetera nunca carga.
    request.onblocked = () => {
      reject(new Error("IndexedDB bloqueada por otra pestaña"))
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

      if (!db.objectStoreNames.contains(REDEMPTIONS_STORE)) {
        const store = db.createObjectStore(REDEMPTIONS_STORE, {
          keyPath: "redemption_id",
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

/** Dominio del AAD de tickets. Cambiarlo invalida todo lo ya cacheado. */
const TICKET_AAD_DOMAIN = "tokepass-wallet-v1"
/** Dominio propio para canjes: un sobre no puede reusarse en el otro store. */
const REDEMPTION_AAD_DOMAIN = "tokepass-redemption-v1"

type SealedEnvelope = {
  iv: string
  ciphertext: string
}

function recordAad(domain: string, id: string, userId: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(`${domain}:${id}:${userId}`)
  return encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength,
  ) as ArrayBuffer
}

async function sealJson(
  domain: string,
  id: string,
  userId: string,
  payload: unknown,
): Promise<SealedEnvelope> {
  const key = await getWalletKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(payload))
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: recordAad(domain, id, userId) },
    key,
    plaintext,
  )

  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  }
}

async function unsealJson<T>(
  domain: string,
  id: string,
  userId: string,
  envelope: SealedEnvelope,
): Promise<T> {
  const key = await getWalletKey()
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(envelope.iv),
      additionalData: recordAad(domain, id, userId),
    },
    key,
    base64ToBytes(envelope.ciphertext),
  )
  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}

async function sealOfflineRecord(
  record: OfflineTicketRecord,
): Promise<EncryptedOfflineTicketRecord> {
  const envelope = await sealJson(
    TICKET_AAD_DOMAIN,
    record.ticket_id,
    record.user_id,
    record,
  )

  return {
    ticket_id: record.ticket_id,
    user_id: record.user_id,
    sealed: true,
    ...envelope,
    synced_at: record.synced_at,
  }
}

async function unsealOfflineRecord(
  stored: StoredOfflineTicketRecord,
): Promise<OfflineTicketRecord> {
  if (!("sealed" in stored)) return stored

  return unsealJson<OfflineTicketRecord>(
    TICKET_AAD_DOMAIN,
    stored.ticket_id,
    stored.user_id,
    stored,
  )
}

async function sealOfflineRedemption(
  record: OfflineRedemptionRecord,
): Promise<EncryptedOfflineRedemptionRecord> {
  const envelope = await sealJson(
    REDEMPTION_AAD_DOMAIN,
    record.redemption_id,
    record.user_id,
    record.redemption,
  )

  return {
    redemption_id: record.redemption_id,
    user_id: record.user_id,
    sealed: true,
    ...envelope,
    synced_at: record.synced_at,
  }
}

async function unsealOfflineRedemption(
  stored: StoredOfflineRedemptionRecord,
): Promise<MyStoreRedemption> {
  if (!("sealed" in stored)) return stored.redemption

  return unsealJson<MyStoreRedemption>(
    REDEMPTION_AAD_DOMAIN,
    stored.redemption_id,
    stored.user_id,
    stored,
  )
}

export const OFFLINE_TICKET_TTL_GRACE_MS = 86_400_000

export function resolveOfflineTicketEndsAt(ticket: {
  endsAt?: string | null
  ends_at?: string | null
  eventDate?: string | null
  event_data?: { ends_at?: string | null; eventDate?: string }
}): string | null {
  const endedAt =
    ticket.endsAt ??
    ticket.ends_at ??
    ticket.event_data?.ends_at ??
    ticket.eventDate ??
    ticket.event_data?.eventDate ??
    null
  return endedAt?.trim() || null
}

export function isOfflineTicketExpired(
  ticket: Parameters<typeof resolveOfflineTicketEndsAt>[0],
  nowMs = Date.now(),
): boolean {
  const endedAt = resolveOfflineTicketEndsAt(ticket)
  if (!endedAt) return false
  const endMs = new Date(endedAt).getTime()
  if (!Number.isFinite(endMs)) return false
  return nowMs > endMs + OFFLINE_TICKET_TTL_GRACE_MS
}

/** Los canjes no traen `ends_at`, así que la gracia corre desde `eventDate`. */
export function isOfflineRedemptionExpired(
  redemption: { eventDate?: string | null },
  nowMs = Date.now(),
): boolean {
  return isOfflineTicketExpired(
    { eventDate: redemption.eventDate ?? null },
    nowMs,
  )
}

/**
 * Un canje ya consumido se guarda sin token: la UI solo muestra la fecha de
 * canje, así que el secreto no hace falta y no tiene por qué seguir en disco.
 */
export function sanitizeRedemptionForOffline(
  redemption: MyStoreRedemption,
): MyStoreRedemption {
  if (redemption.status === "valid") return redemption
  return { ...redemption, qrCodeToken: "" }
}

export function keepRedemptionOffline(
  redemption: MyStoreRedemption,
  nowMs = Date.now(),
): boolean {
  if (redemption.status !== "valid" && redemption.status !== "redeemed") {
    return false
  }
  return !isOfflineRedemptionExpired(redemption, nowMs)
}

export function ticketToOfflineRecord(
  ticket: MyTicket,
  userId: string,
): OfflineTicketRecord {
  return {
    ticket_id: ticket.id,
    user_id: userId,
    totp_secret:
      ticket.pendingTransfer || ticket.activeResaleListingId
        ? ""
        : ticket.totpSecret?.trim() || "",
    event_data: {
      eventId: ticket.eventId,
      eventTitle: ticket.eventTitle,
      eventDate: ticket.eventDate,
      ends_at: ticket.endsAt,
      doorsOpenAt: ticket.doorsOpenAt,
      eventLocation: ticket.eventLocation,
      deliveryMode: ticket.deliveryMode,
      accessLink: ticket.accessLink,
      flyerUrl: ticket.flyerUrl,
      socialShareImageUrl: ticket.socialShareImageUrl,
      organizerName: ticket.organizerName,
      organizerAvatarUrl: ticket.organizerAvatarUrl,
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
      eventQrType: ticket.eventQrType,
      issuanceChannel: ticket.issuanceChannel,
      holderName: ticket.holderName,
      holderDni: ticket.holderDni,
      isTest: ticket.isTest,
      tierPrice: ticket.tierPrice,
      isSponsoredByTokePass: ticket.isSponsoredByTokePass,
      pendingTransfer: ticket.pendingTransfer,
      activeResaleListingId: ticket.activeResaleListingId,
      orderId: ticket.orderId,
      orderCreatedAt: ticket.orderCreatedAt,
      ticketType: ticket.ticketType,
      tierType: ticket.tierType,
      groupId: ticket.groupId ?? null,
      groupSlot: ticket.groupSlot ?? null,
    },
    status: ticket.status,
    qr_code: ticket.qrCode,
    transfer_count: ticket.transferCount,
    max_transfers_allowed: ticket.maxTransfersAllowed,
    created_at: ticket.createdAt,
    synced_at: Date.now(),
    is_test: ticket.isTest,
  }
}

export function offlineRecordToTicket(record: OfflineTicketRecord): MyTicket {
  return {
    id: record.ticket_id,
    status: record.status,
    qrCode: record.qr_code,
    totpSecret:
      record.event_data.pendingTransfer ||
      record.event_data.activeResaleListingId
        ? ""
        : record.totp_secret,
    deliveryMode: record.event_data.deliveryMode ?? "PRESENCIAL",
    accessLink: record.event_data.accessLink ?? null,
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
    endsAt: record.event_data.ends_at ?? record.event_data.eventDate,
    doorsOpenAt: record.event_data.doorsOpenAt ?? record.event_data.eventDate,
    eventLocation: record.event_data.eventLocation,
    flyerUrl: record.event_data.flyerUrl,
    socialShareImageUrl: record.event_data.socialShareImageUrl ?? null,
    organizerName: record.event_data.organizerName ?? null,
    organizerAvatarUrl: record.event_data.organizerAvatarUrl ?? null,
    venueName: record.event_data.venueName,
    qrType: record.event_data.qrType ?? "dynamic",
    eventQrType: record.event_data.eventQrType ?? record.event_data.qrType ?? "dynamic",
    issuanceChannel: record.event_data.issuanceChannel ?? "online",
    holderName: record.event_data.holderName ?? "Titular",
    holderDni: record.event_data.holderDni ?? null,
    orderId: record.event_data.orderId ?? null,
    orderCreatedAt: record.event_data.orderCreatedAt ?? null,
    ticketType: record.event_data.ticketType ?? "standard",
    tierType: record.event_data.tierType ?? null,
    isTest: Boolean(record.is_test ?? record.event_data.isTest),
    tierPrice: Number(record.event_data.tierPrice ?? 0),
    isSponsoredByTokePass: Boolean(
      record.event_data.isSponsoredByTokePass,
    ),
    activeResaleListingId: record.event_data.activeResaleListingId ?? null,
    pendingTransfer: record.event_data.pendingTransfer ?? null,
    groupId: record.event_data.groupId ?? null,
    groupSlot: record.event_data.groupSlot ?? null,
    visualStatus: resolveTicketVisualStatus({
      pendingTransfer: record.event_data.pendingTransfer ?? null,
      activeResaleListingId: record.event_data.activeResaleListingId ?? null,
    }),
  }
}

async function putTicketsAndMeta(
  userId: string,
  tickets: MyTicket[],
  mode: "replace" | "merge",
): Promise<MyTicket[]> {
  const expiredIds = new Set(
    tickets.filter((ticket) => isOfflineTicketExpired(ticket)).map((ticket) => ticket.id),
  )
  const active = tickets.filter(
    (ticket) =>
      !expiredIds.has(ticket.id) &&
      (ticket.status === "valid" ||
        ticket.status === "used" ||
        ticket.status === "scanned"),
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
      if (
        expiredIds.has(row.ticket_id) ||
        !active.some((ticket) => ticket.id === row.ticket_id)
      ) {
        ticketStore.delete(row.ticket_id)
      }
    }
  } else {
    for (const ticket of tickets) {
      const keep =
        !expiredIds.has(ticket.id) &&
        (ticket.status === "valid" ||
          ticket.status === "used" ||
          ticket.status === "scanned")
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
    "/brand/tokepass-mark.png",
    "/icons/icon-192x192.png",
    "/offline/billetera",
    ...tickets.map((ticket) => ticket.flyerUrl),
  ])
  try {
    window.localStorage.setItem(
      "tokepass-offline-ready",
      String(Date.now()),
    )
  } catch {
    // Safari private / quota
  }
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

  const mapped = filtered.map(offlineRecordToTicket)
  const expired = mapped.filter((ticket) => isOfflineTicketExpired(ticket))
  for (const ticket of expired) {
    await removeTicketOffline(ticket.id)
  }

  return mapped
    .filter((ticket) => !isOfflineTicketExpired(ticket))
    .sort(
      (a, b) =>
        new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime(),
    )
}

/** Purga tickets cuyo evento ya cerro. Se llama al abrir la PWA. */
export async function purgeExpiredOfflineTickets(): Promise<void> {
  await getTicketsOffline()
}

/**
 * Sync completo de los canjes de barra del usuario. El QR de tienda se arma
 * offline (`Base64(token-bloque)`, sin HMAC ni red), así que con el token
 * cacheado el cliente puede mostrarlo sin señal; la red la necesita el escáner
 * del staff, no el teléfono del cliente.
 */
export async function saveRedemptionsOffline(
  userId: string,
  redemptions: MyStoreRedemption[],
): Promise<void> {
  if (!userId || !isBrowser()) return

  const keep = redemptions
    .filter((redemption) => keepRedemptionOffline(redemption))
    .map(sanitizeRedemptionForOffline)
  const keepIds = new Set(keep.map((redemption) => redemption.id))
  const syncedAt = Date.now()
  const sealed = await Promise.all(
    keep.map((redemption) =>
      sealOfflineRedemption({
        redemption_id: redemption.id,
        user_id: userId,
        redemption,
        synced_at: syncedAt,
      }),
    ),
  )

  // Lectura fuera de la tx de escritura (Safari/WebKit auto-commit).
  const readDb = await openDb()
  const readTx = readDb.transaction(REDEMPTIONS_STORE, "readonly")
  const existing = (await requestToPromise(
    readTx.objectStore(REDEMPTIONS_STORE).getAll(),
  )) as StoredOfflineRedemptionRecord[]
  await txDone(readTx)
  readDb.close()

  const db = await openDb()
  const tx = db.transaction(REDEMPTIONS_STORE, "readwrite")
  const store = tx.objectStore(REDEMPTIONS_STORE)

  for (const row of existing) {
    if (row.user_id !== userId || !keepIds.has(row.redemption_id)) {
      store.delete(row.redemption_id)
    }
  }

  for (const row of sealed) {
    store.put(row)
  }

  await txDone(tx)
  db.close()
}

export async function getRedemptionsOffline(
  userId?: string | null,
): Promise<MyStoreRedemption[]> {
  if (!isBrowser()) return []

  const db = await openDb()
  const tx = db.transaction(REDEMPTIONS_STORE, "readonly")
  const storedRows = (await requestToPromise(
    tx.objectStore(REDEMPTIONS_STORE).getAll(),
  )) as StoredOfflineRedemptionRecord[]
  await txDone(tx)
  db.close()

  const owned = userId
    ? storedRows.filter((row) => row.user_id === userId)
    : storedRows

  const rows = (
    await Promise.all(
      owned.map(async (stored) => {
        try {
          return await unsealOfflineRedemption(stored)
        } catch (error) {
          console.warn("[offline-store] canje cifrado inválido", error)
          return null
        }
      }),
    )
  ).filter((row): row is MyStoreRedemption => row !== null)

  const expired = rows.filter((row) => isOfflineRedemptionExpired(row))
  for (const row of expired) {
    await removeRedemptionOffline(row.id)
  }

  return rows
    .filter((row) => !isOfflineRedemptionExpired(row))
    .sort(
      (a, b) =>
        new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime(),
    )
}

export async function removeRedemptionOffline(
  redemptionId: string,
): Promise<void> {
  if (!redemptionId || !isBrowser()) return

  const db = await openDb()
  const tx = db.transaction(REDEMPTIONS_STORE, "readwrite")
  tx.objectStore(REDEMPTIONS_STORE).delete(redemptionId)
  await txDone(tx)
  db.close()
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
    [TICKETS_STORE, REDEMPTIONS_STORE, META_STORE, KEYS_STORE],
    "readwrite",
  )
  tx.objectStore(TICKETS_STORE).clear()
  tx.objectStore(REDEMPTIONS_STORE).clear()
  tx.objectStore(META_STORE).clear()
  tx.objectStore(KEYS_STORE).clear()
  await txDone(tx)
  db.close()
  walletKeyPromise = null
}
