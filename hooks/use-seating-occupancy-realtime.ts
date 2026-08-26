"use client"

import { useEffect, useRef } from "react"

import {
  isRealtimeChannelDegraded,
  startRealtimePollFallback,
} from "@/lib/realtime/channel-fallback"
import {
  occupancyPatchFromRealtimePayload,
  occupancyPatchFromSeatingRow,
  type OccupancyRealtimeRow,
} from "@/lib/realtime/occupancy-patches"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import { createClient } from "@/lib/supabase/client"

export {
  occupancyPatchFromRealtimePayload,
  occupancyPatchFromSeatingRow,
}

let occupancyChannelSeq = 0

async function fetchOccupancySnapshot(
  eventId: string,
): Promise<Record<string, SeatStatus> | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("event_seating_occupancy")
    .select("layout_item_id, status")
    .eq("event_id", eventId)
  if (error || !data?.length) return null
  const patch: Record<string, SeatStatus> = {}
  for (const row of data) {
    const next = occupancyPatchFromSeatingRow(row)
    if (next) Object.assign(patch, next)
  }
  return Object.keys(patch).length > 0 ? patch : null
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
    const resolvedEventId: string = cleanEventId

    const supabase = createClient()
    const topic = `public:event_seating_occupancy:${cleanEventId}:${channelKey}:${++occupancyChannelSeq}`
    let cancelled = false
    let poll: { stop: () => void } | null = null

    function applySnapshot(patch: Record<string, SeatStatus> | null) {
      if (cancelled || !patch) return
      onPatchRef.current(patch)
    }

    function pollAvailability() {
      void fetchOccupancySnapshot(resolvedEventId).then(applySnapshot)
    }

    pollAvailability()

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
          const next = occupancyPatchFromRealtimePayload({
            eventType: payload.eventType,
            new: payload.new as OccupancyRealtimeRow | null,
            old: payload.old as OccupancyRealtimeRow | null,
          })
          if (next) onPatchRef.current(next)
        },
      )
      .subscribe((status) => {
        if (cancelled) return
        if (status === "SUBSCRIBED") {
          poll?.stop()
          poll = null
          return
        }
        if (!isRealtimeChannelDegraded(status) || poll) return
        poll = startRealtimePollFallback({ poll: pollAvailability })
      })

    return () => {
      cancelled = true
      poll?.stop()
      poll = null
      void supabase.removeChannel(channel)
    }
  }, [channelKey, eventId])
}
