"use client"

import { useEffect, useRef } from "react"

import {
  hasActivePixels,
  trackPurchase,
  type EventPixelConfig,
} from "@/lib/analytics/pixels"
import { AnalyticsTracker } from "@/components/public/analytics-tracker"

type PurchaseAnalyticsTrackerProps = {
  pixels: EventPixelConfig
  eventTitle: string
  orderId: string
  value: number
  ticketIds: string[]
  enabled?: boolean
}

function purchaseTrackedKey(orderId: string) {
  return `tokepass.purchaseTracked.${orderId}`
}

function alreadyTrackedPurchase(orderId: string): boolean {
  try {
    return window.sessionStorage.getItem(purchaseTrackedKey(orderId)) === "1"
  } catch {
    return false
  }
}

function markPurchaseTracked(orderId: string) {
  try {
    window.sessionStorage.setItem(purchaseTrackedKey(orderId), "1")
  } catch {
    return
  }
}

/** Dispara Purchase una sola vez en /checkout/success (espera scripts). */
export function PurchaseAnalyticsTracker({
  pixels,
  eventTitle,
  orderId,
  value,
  ticketIds,
  enabled = true,
}: PurchaseAnalyticsTrackerProps) {
  const fired = useRef(false)

  useEffect(() => {
    if (!enabled || !hasActivePixels(pixels) || fired.current) return
    if (alreadyTrackedPurchase(orderId)) {
      fired.current = true
      return
    }

    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      const metaReady =
        !pixels.metaPixelEnabled ||
        !pixels.metaPixelId ||
        typeof window.fbq === "function"
      const tiktokReady =
        !pixels.tiktokPixelEnabled ||
        !pixels.tiktokPixelId ||
        Boolean(window.ttq?.track)
      const ga4Ready =
        !pixels.ga4Enabled ||
        !pixels.ga4MeasurementId ||
        typeof window.gtag === "function"

      if ((metaReady && tiktokReady && ga4Ready) || attempts >= 24) {
        window.clearInterval(timer)
        if (fired.current) return
        fired.current = true
        markPurchaseTracked(orderId)
        trackPurchase({
          contentName: eventTitle,
          contentIds: ticketIds.length > 0 ? ticketIds : [orderId],
          value,
          currency: "ARS",
          numItems: Math.max(1, ticketIds.length),
          transactionId: orderId,
        })
      }
    }, 250)

    return () => window.clearInterval(timer)
  }, [enabled, eventTitle, orderId, pixels, ticketIds, value])

  return <AnalyticsTracker config={pixels} />
}
