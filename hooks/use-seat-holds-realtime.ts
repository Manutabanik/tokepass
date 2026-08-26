"use client"

import { useEffect, useRef } from "react"

import {
  isRealtimeChannelDegraded,
  startRealtimePollFallback,
} from "@/lib/realtime/channel-fallback"
import {
  occupancyFromSeatHolds,
  seatHoldRealtimePatch,
} from "@/lib/seating/inventory-seat-state"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import { createClient } from "@/lib/supabase/client"

type SeatHoldRealtimeRow = {
  event_id?: string
  event_date_id?: string | null
  layout_item_id?: string | null
  expires_at?: string | null
}

let seatHoldChannelSeq = 0

export function useSeatHoldsRealtime(
  eventId: string | null | undefined,
  onPatch: (patch: Record<string, SeatStatus>) => void,
  channelKey = "map",
  eventDateId?: string | null,
) {
  const onPatchRef = useRef(onPatch)
  useEffect(() => {
    onPatchRef.current = onPatch
  }, [onPatch])

  useEffect(() => {
    const cleanEventId = eventId?.trim()
    if (!cleanEventId) return

    const supabase = createClient()
    const dateId = eventDateId?.trim() || null
    const topic = `public:seat_holds:${cleanEventId}:${channelKey}:${++seatHoldChannelSeq}`
    let cancelled = false
    let poll: { stop: () => void } | null = null

    function fetchHoldsSnapshot() {
      void supabase
        .from("seat_holds")
        .select("layout_item_id, event_date_id, expires_at")
        .eq("event_id", cleanEventId)
        .gt("expires_at", new Date().toISOString())
        .then(({ data, error }) => {
          if (cancelled || error || !data) return
          const patch = occupancyFromSeatHolds(
            data.map((row) => ({
              layoutItemId: row.layout_item_id,
              eventDateId: row.event_date_id,
              expiresAt: row.expires_at,
            })),
            { eventDateId: dateId },
          )
          if (Object.keys(patch).length > 0) onPatchRef.current(patch)
        })
    }

    fetchHoldsSnapshot()

    function applyChange(
      event: "INSERT" | "UPDATE" | "DELETE",
      row: SeatHoldRealtimeRow | null,
    ) {
      if (cancelled) return
      const next = seatHoldRealtimePatch(event, row, { eventDateId: dateId })
      if (next) onPatchRef.current(next)
    }

    const filter = {
      schema: "public" as const,
      table: "seat_holds",
      filter: `event_id=eq.${cleanEventId}`,
    }
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "INSERT", ...filter },
        (payload) => applyChange("INSERT", payload.new as SeatHoldRealtimeRow),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", ...filter },
        (payload) => applyChange("DELETE", payload.old as SeatHoldRealtimeRow),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", ...filter },
        (payload) => applyChange("UPDATE", payload.new as SeatHoldRealtimeRow),
      )
      .subscribe((status) => {
        if (cancelled) return
        if (status === "SUBSCRIBED") {
          poll?.stop()
          poll = null
          return
        }
        if (!isRealtimeChannelDegraded(status) || poll) return
        poll = startRealtimePollFallback({ poll: fetchHoldsSnapshot })
      })

    return () => {
      cancelled = true
      poll?.stop()
      poll = null
      void supabase.removeChannel(channel)
    }
  }, [channelKey, eventDateId, eventId])
}
