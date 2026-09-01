import type { ScannerManifestTicket } from "@/lib/offline-scanner-store"

export type PrefetchedDoorManifest = {
  eventId: string
  eventTitle: string
  eventStatus?: string
  qrType: "dynamic" | "static"
  hash: string
  tickets: ScannerManifestTicket[]
  scheduleDays?: Array<{
    id: string
    title: string
    start_time: string
    end_time: string
  }>
  eventDate?: string | null
  server_timestamp?: number
  slotIndex?: number
  slotCount?: number
}

type ManifestFetcher = (eventId: string) => Promise<PrefetchedDoorManifest>

let inflight: { eventId: string; promise: Promise<PrefetchedDoorManifest> } | null =
  null
let cached: PrefetchedDoorManifest | null = null

export function takePrefetchedManifest(
  eventId: string,
): PrefetchedDoorManifest | null {
  if (!cached || cached.eventId !== eventId) return null
  const payload = cached
  cached = null
  return payload
}

export function clearPrefetchedManifest(eventId: string) {
  if (cached?.eventId === eventId) cached = null
}

export function peekPrefetchedManifest(
  eventId: string,
): PrefetchedDoorManifest | null {
  if (!cached || cached.eventId !== eventId) return null
  return cached
}

/** Empieza a bajar el manifiesto apenas hay sesion PIN. No espera al vault. */
export function prefetchDoorManifest(
  eventId: string,
  fetcher: ManifestFetcher,
): Promise<PrefetchedDoorManifest> {
  if (cached?.eventId === eventId) return Promise.resolve(cached)
  if (inflight?.eventId === eventId) return inflight.promise

  const promise = fetcher(eventId)
    .then((payload) => {
      cached = payload
      return payload
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null
    })

  inflight = { eventId, promise }
  return promise
}
