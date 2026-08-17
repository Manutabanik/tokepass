"use client"

import { useEffect, useRef } from "react"

import { createClient } from "@/lib/supabase/client"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"

type SeatingUnitRealtimeRow = {
  event_id?: string
  layout_item_id?: string
  status?: string
}

let occupancyChannelSeq = 0

function statusToOccupancy(status: string | undefined): SeatStatus {
  if (status === "available") return "available"
  if (status === "blocked") return "blocked"
  return "occupied"
}

export function occupancyPatchFromSeatingRow(
  row: SeatingUnitRealtimeRow | null,
): Record<string, SeatStatus> | null {
  if (!row) return null
  const layoutItemId = row.layout_item_id?.trim()
  if (!layoutItemId) return null
  return { [layoutItemId]: statusToOccupancy(row.status) }
}

export function useSeatingOccupancyRealtime(
  eventId: string | null | undefined,
  onPatch: (patch: Record<string, SeatStatus>) => void,
  channelKey = "map",
) {
  const onPatchRef = useRef(onPatch)
  useEffect(() => {
    onPatchRef.current = onPatch
  }, [onPatch])

  useEffect(() => {
    const cleanEventId = eventId?.trim()
    if (!cleanEventId) return

    const supabase = createClient()
    const topic = `public:event_seating_occupancy:${cleanEventId}:${channelKey}:${++occupancyChannelSeq}`
    let cancelled = false

    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_seating_occupancy",
          filter: `event_id=eq.${cleanEventId}`,
        },
        (payload) => {
          if (cancelled) return
          const next = occupancyPatchFromSeatingRow(
            payload.new as SeatingUnitRealtimeRow | null,
          )
          if (next) onPatchRef.current(next)
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [channelKey, eventId])
}
