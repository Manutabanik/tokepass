"use client"

import { useEffect } from "react"

import { getMyTickets } from "@/app/actions/tickets"
import { signOutDueToWalletDeviceMismatch } from "@/app/actions/auth"
import { isWalletDeviceMismatchError, readOrCreateWalletDeviceId } from "@/lib/auth/wallet-device"
import { saveTicketsOffline } from "@/lib/offline-store"
import { clearClientSessionArtifacts } from "@/lib/session-cleanup"
import { shouldPrecacheCheckoutWallet } from "@/lib/pwa/checkout-wallet-precache"
import { createClient } from "@/lib/supabase/client"

/**
 * Tras confirmar compra: fuerza sync IndexedDB + cache SW de assets
 * aunque el webhook todavía esté en camino (reintentos cortos).
 */
export function CheckoutWalletPrecache() {
  useEffect(() => {
    let cancelled = false

    void (async () => {
      if (!shouldPrecacheCheckoutWallet(window.location.search)) return

      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || cancelled) return

      for (let attempt = 0; attempt < 6; attempt += 1) {
        if (cancelled) return
        try {
          const tickets = await getMyTickets({
            deviceId: readOrCreateWalletDeviceId(),
          })
          if (tickets.length > 0) {
            await saveTicketsOffline(user.id, tickets)
            return
          }
        } catch (error) {
          if (isWalletDeviceMismatchError(error)) {
            await clearClientSessionArtifacts()
            await signOutDueToWalletDeviceMismatch("/cuenta/entradas")
            return
          }
          // getMyTickets is fail-closed; keep retrying only for empty webhook lag
        }
        await new Promise((resolve) => setTimeout(resolve, 1500))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
