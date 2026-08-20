"use client"

import { useEffect, useRef } from "react"

import { createClient } from "@/lib/supabase/client"
import type {
  EventCatalogEventRow,
  EventCatalogTierChange,
  EventCatalogTierRow,
} from "@/lib/storefront/event-catalog-realtime"

let catalogChannelSeq = 0

export function useEventCatalogRealtime(
  eventId: string | null | undefined,
  handlers: {
    onEventUpdate?: (row: EventCatalogEventRow) => void
    onTierChange?: (
      change: EventCatalogTierChange,
      row: EventCatalogTierRow,
    ) => void
  },
  channelKey = "storefront",
) {
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  useEffect(() => {
    const cleanEventId = eventId?.trim()
    if (!cleanEventId) return

    const supabase = createClient()
    const topic = `public:event_updates:${cleanEventId}:${channelKey}:${++catalogChannelSeq}`
    let cancelled = false

    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "events",
          filter: `id=eq.${cleanEventId}`,
        },
        (payload) => {
          if (cancelled) return
          const row = payload.new as EventCatalogEventRow | null
          if (row) handlersRef.current.onEventUpdate?.(row)
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ticket_tiers",
          filter: `event_id=eq.${cleanEventId}`,
        },
        (payload) => {
          if (cancelled) return
          const change = payload.eventType
          if (
            change !== "INSERT" &&
            change !== "UPDATE" &&
            change !== "DELETE"
          ) {
            return
          }
          const row = (
            change === "DELETE" ? payload.old : payload.new
          ) as EventCatalogTierRow | null
          if (row) handlersRef.current.onTierChange?.(change, row)
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [channelKey, eventId])
}
