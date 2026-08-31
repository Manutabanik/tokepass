"use client"

import { useEffect, useRef } from "react"

import {
  isRealtimeChannelDegraded,
  startRealtimePollFallback,
} from "@/lib/realtime/channel-fallback"
import {
  occupancyPatchFromRealtimePayload,
  occupancyPatchFromSeatingRow,
  type OccupancyDayScope,
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
  scope: OccupancyDayScope,
): Promise<Record<string, SeatStatus> | null> {
  const supabase = createClient()
  const selected = scope.eventDateId?.trim() || null
  const multi = (scope.scheduleDayCount ?? 0) >= 2
  let query = supabase
    .from("event_seating_occupancy")
    .select("id, layout_item_id, status, event_date_id")
    .eq("event_id", eventId)
  if (selected && multi) {
    query = query.eq("event_date_id", selected)
  }
  const { data, error } = await query
  if (error) {
    const missingDayColumn = /event_date_id|PGRST204|42703/i.test(
      error.message,
    )
    if (!missingDayColumn) return null
    if (multi) return null
    const fallback = await supabase
      .from("event_seating_occupancy")
      .select("id, layout_item_id, status")
      .eq("event_id", eventId)
    if (fallback.error) return null
    const patch: Record<string, SeatStatus> = {}
    for (const row of fallback.data ?? []) {
      const next = occupancyPatchFromSeatingRow(row, scope)
      if (next) Object.assign(patch, next)
    }
    return patch
  }
  const patch: Record<string, SeatStatus> = {}
  for (const row of data ?? []) {
    const next = occupancyPatchFromSeatingRow(row, scope)
    if (next) Object.assign(patch, next)
  }
  return patch
}

export function useSeatingOccupancyRealtime(
  eventId: string | null | undefined,
  onPatch: (patch: Record<string, SeatStatus>) => void,
  channelKey = "map",
  eventDateId?: string | null,
  scheduleDayCount = 0,
  onSnapshotReady?: () => void,
) {
  const onPatchRef = useRef(onPatch)
  const onReadyRef = useRef(onSnapshotReady)
  useEffect(() => {
    onPatchRef.current = onPatch
  }, [onPatch])
  useEffect(() => {
    onReadyRef.current = onSnapshotReady
  }, [onSnapshotReady])

  useEffect(() => {
    const cleanEventId = eventId?.trim()
    if (!cleanEventId) return
    const resolvedEventId: string = cleanEventId
    const scope: OccupancyDayScope = {
      eventDateId: eventDateId?.trim() || null,
      scheduleDayCount,
    }

    const supabase = createClient()
    const topic = `public:event_seating_occupancy:${cleanEventId}:${channelKey}:${scope.eventDateId ?? ""}:${++occupancyChannelSeq}`
    let cancelled = false
    let poll: { stop: () => void } | null = null

    function applySnapshot(patch: Record<string, SeatStatus> | null) {
      if (cancelled) return
      if (patch) onPatchRef.current(patch)
      onReadyRef.current?.()
    }

    function pollAvailability() {
      void fetchOccupancySnapshot(resolvedEventId, scope)
        .then(applySnapshot)
        .catch(() => {
          if (!cancelled) onReadyRef.current?.()
        })
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
          const next = occupancyPatchFromRealtimePayload(
            {
              eventType: payload.eventType,
              new: payload.new as OccupancyRealtimeRow | null,
              old: payload.old as OccupancyRealtimeRow | null,
            },
            scope,
          )
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
  }, [channelKey, eventDateId, eventId, scheduleDayCount])
}
