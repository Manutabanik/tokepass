"use client"

import { useEffect, useRef } from "react"

import { getEventSoldTicketOccupancy } from "@/app/actions/public-events"
import {
  isRealtimeChannelDegraded,
  startRealtimePollFallback,
} from "@/lib/realtime/channel-fallback"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import { createClient } from "@/lib/supabase/client"

let soldTicketChannelSeq = 0

export function useSoldTicketOccupancyRealtime(
  eventId: string | null | undefined,
  onOccupancy: (occupancy: Record<string, SeatStatus>) => void,
  eventDateId?: string | null,
  onSnapshotReady?: () => void,
) {
  const onOccupancyRef = useRef(onOccupancy)
  const onReadyRef = useRef(onSnapshotReady)
  useEffect(() => {
    onOccupancyRef.current = onOccupancy
  }, [onOccupancy])
  useEffect(() => {
    onReadyRef.current = onSnapshotReady
  }, [onSnapshotReady])

  useEffect(() => {
    const cleanEventId = eventId?.trim()
    if (!cleanEventId) return
    const resolvedEventId: string = cleanEventId
    const dateId = eventDateId?.trim() || null
    let cancelled = false
    let poll: { stop: () => void } | null = null

    function applySnapshot(occupancy: Record<string, SeatStatus>) {
      if (cancelled) return
      onOccupancyRef.current(occupancy)
      onReadyRef.current?.()
    }

    function pull() {
      void getEventSoldTicketOccupancy(resolvedEventId, dateId)
        .then(applySnapshot)
        .catch(() => {
          if (!cancelled) onReadyRef.current?.()
        })
    }

    pull()

    const supabase = createClient()
    const topic = `public:tickets:${resolvedEventId}:${dateId ?? ""}:${++soldTicketChannelSeq}`
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tickets",
          filter: `event_id=eq.${resolvedEventId}`,
        },
        () => {
          if (!cancelled) pull()
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
        poll = startRealtimePollFallback({ poll: pull })
      })

    return () => {
      cancelled = true
      poll?.stop()
      poll = null
      void supabase.removeChannel(channel)
    }
  }, [eventDateId, eventId])
}
