import { clearOfflineWalletStore } from "@/lib/offline-store"
import { clearOfflineScannerStore } from "@/lib/offline-scanner-store"

/**
 * Purge local e-ticket + scanner IndexedDB and drop SW/caches on logout
 * so shared devices cannot reuse Living QRs from the previous session.
 */
export async function clearClientSessionArtifacts(): Promise<void> {
  if (typeof window === "undefined") return

  try {
    await clearOfflineWalletStore()
  } catch (error) {
    console.warn("[logout] wallet IndexedDB clear failed", error)
  }

  try {
    await clearOfflineScannerStore()
  } catch (error) {
    console.warn("[logout] scanner IndexedDB clear failed", error)
  }

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((reg) => reg.unregister()))
    }
  } catch (error) {
    console.warn("[logout] SW unregister failed", error)
  }

  try {
    if ("caches" in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  } catch (error) {
    console.warn("[logout] cache clear failed", error)
  }
}
