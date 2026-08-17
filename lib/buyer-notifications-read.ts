const STORAGE_KEY = "tokepass.buyer.notifications.read.v1"
export const BUYER_NOTIFICATIONS_EVENT = "tokepass-buyer-notifications"

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined"
}

export function getReadNotificationIds(): Set<string> {
  if (!canUseStorage()) return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === "string"))
  } catch {
    return new Set()
  }
}

function persist(ids: Set<string>) {
  if (!canUseStorage()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
    window.dispatchEvent(new Event(BUYER_NOTIFICATIONS_EVENT))
  } catch {
    // quota / private mode
  }
}

export function markNotificationRead(id: string) {
  const ids = getReadNotificationIds()
  if (ids.has(id)) return
  ids.add(id)
  persist(ids)
}

export function markNotificationsRead(idsToMark: string[]) {
  if (idsToMark.length === 0) return
  const ids = getReadNotificationIds()
  let changed = false
  for (const id of idsToMark) {
    if (!ids.has(id)) {
      ids.add(id)
      changed = true
    }
  }
  if (changed) persist(ids)
}

export function subscribeNotificationReads(listener: () => void) {
  if (!canUseStorage()) return () => {}
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener()
  }
  window.addEventListener(BUYER_NOTIFICATIONS_EVENT, listener)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(BUYER_NOTIFICATIONS_EVENT, listener)
    window.removeEventListener("storage", onStorage)
  }
}

let readIdsSnapshot = new Set<string>()
let readIdsSnapshotKey = ""

export function getReadNotificationSnapshot(): Set<string> {
  const ids = getReadNotificationIds()
  const key = [...ids].sort().join("\0")
  if (key === readIdsSnapshotKey) return readIdsSnapshot
  readIdsSnapshotKey = key
  readIdsSnapshot = ids
  return readIdsSnapshot
}
