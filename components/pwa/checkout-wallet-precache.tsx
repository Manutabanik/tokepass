"use client"

import { useEffect } from "react"

import { getMyTickets } from "@/app/actions/tickets"
import { saveTicketsOffline } from "@/lib/offline-store"
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
          const tickets = await getMyTickets()
          if (tickets.length > 0) {
            await saveTicketsOffline(user.id, tickets)
            return
          }
        } catch {
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
